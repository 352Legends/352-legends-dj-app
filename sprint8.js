// Sprint 8 — reliable GameDay mixer using Web Audio gain stages + Spotify active-device volume.
(() => {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  let audioCtx = null;
  let soundGain = null;
  let musicGain = null;
  const routedMedia = new WeakMap();
  let activeSoundId = null;
  let spotifyVolumeTimer = null;
  const SPOTIFY_TOKEN_KEY = 'gameday.spotify.tokens.v1';

  function clamp01(value) {
    return Math.max(0, Math.min(1, Number(value) || 0));
  }

  function ensureAudioGraph() {
    if (!AudioCtx) return null;
    if (!audioCtx) {
      audioCtx = new AudioCtx();
      soundGain = audioCtx.createGain();
      musicGain = audioCtx.createGain();
      soundGain.connect(audioCtx.destination);
      musicGain.connect(audioCtx.destination);
    }
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    syncGainValues();
    return audioCtx;
  }

  function syncGainValues() {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    const s = clamp01(soundVolume);
    const m = clamp01(musicVolume) * (announcementActive ? DUCK_FACTOR : 1);
    soundGain.gain.cancelScheduledValues(now);
    musicGain.gain.cancelScheduledValues(now);
    soundGain.gain.setTargetAtTime(s, now, 0.012);
    musicGain.gain.setTargetAtTime(m, now, 0.02);
  }

  function routeMedia(media, group) {
    if (!media || !ensureAudioGraph()) return false;
    try {
      if (routedMedia.has(media)) return true;
      // iOS does not honor HTMLMediaElement.volume in JavaScript. Route the
      // element into Web Audio so the GainNode owns relative volume instead.
      media.volume = 1;
      const source = audioCtx.createMediaElementSource(media);
      source.connect(group === 'sound' ? soundGain : musicGain);
      routedMedia.set(media, { source, group });
      syncGainValues();
      return true;
    } catch (error) {
      console.warn('GameDay Web Audio routing unavailable', error);
      return false;
    }
  }

  function setMixerStatus(controlId, text, mode = '') {
    const control = $(controlId)?.closest('.mixer-control');
    if (!control) return;
    let node = control.querySelector('.mixer-runtime-status');
    if (!node) {
      node = document.createElement('span');
      node.className = 'mixer-runtime-status';
      control.appendChild(node);
    }
    node.textContent = text;
    node.dataset.mode = mode;
  }

  function updateSoundPlayingUI() {
    document.querySelectorAll('[data-sound-id]').forEach(button => {
      const on = announcementActive && button.dataset.soundId === activeSoundId;
      button.classList.toggle('is-playing', on);
      button.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  // Rebuild uploaded announcement playback so it enters the Web Audio graph
  // before playback begins. This makes the sound slider and ducking work on iOS.
  const previousStopAnnouncement = stopAnnouncement;
  stopAnnouncement = function() {
    previousStopAnnouncement();
    activeSoundId = null;
    syncGainValues();
    updateSoundPlayingUI();
  };

  const previousEndDuck = endDuck;
  endDuck = function() {
    previousEndDuck();
    activeSoundId = null;
    syncGainValues();
    scheduleSpotifyVolume(false);
    updateSoundPlayingUI();
  };

  const previousBeginDuck = beginDuck;
  beginDuck = function() {
    previousBeginDuck();
    syncGainValues();
    scheduleSpotifyVolume(true);
  };

  playAnnouncement = function(item) {
    if (announcementActive && activeSoundId === item.id) {
      stopAnnouncement();
      $('now').innerHTML = '<b>Stopped:</b> ' + escapeHtml(item.label);
      msg('■ ' + item.label + ' stopped');
      return;
    }

    stopAnnouncement();
    ensureAudioGraph();
    activeSoundId = item.id;
    beginDuck();
    $('now').innerHTML = '<b>Now playing:</b> ' + escapeHtml(item.label);
    const src = currentGame?.soundSources?.[item.id];

    if (src) {
      const audio = new Audio();
      audio.crossOrigin = 'anonymous';
      audio.preload = 'auto';
      audio.src = src;
      currentAnnouncement = audio;
      const routed = routeMedia(audio, 'sound');
      if (!routed) audio.volume = clamp01(soundVolume);
      audio.onended = () => {
        currentAnnouncement = null;
        endDuck();
        $('now').innerHTML = '<b>Ready.</b> No announcement playing.';
      };
      audio.onerror = () => {
        currentAnnouncement = null;
        msg('Uploaded audio failed; using device voice');
        speakFallback(item.speechText);
      };
      audio.play().catch(() => {
        currentAnnouncement = null;
        speakFallback(item.speechText);
      });
    } else {
      // SpeechSynthesis itself is system-managed; its starting level uses the
      // current soundVolume, but iOS may keep final speech loudness under the
      // hardware output control.
      speakFallback(item.speechText);
    }

    updateSoundPlayingUI();
    msg('▶ ' + item.label);
  };

  // Rebuild uploaded music so the Music slider controls a GainNode instead of
  // HTMLMediaElement.volume (which iOS ignores).
  ensureLocalAudio = function() {
    const tracks = localTracks();
    if (!tracks.length) return null;
    if (musicIndex >= tracks.length) musicIndex = 0;
    const src = tracks[musicIndex].src;
    if (!musicAudio || musicAudio.datasetSrc !== src) {
      if (musicAudio) musicAudio.pause();
      const audio = new Audio();
      audio.crossOrigin = 'anonymous';
      audio.preload = 'auto';
      audio.src = src;
      audio.datasetSrc = src;
      audio.onended = () => {
        musicIndex = (musicIndex + 1) % tracks.length;
        musicAudio = null;
        if (localPlaying) playLocal();
        renderLocalTracks();
      };
      audio.onerror = () => msg('Unable to play uploaded music');
      musicAudio = audio;
      const routed = routeMedia(audio, 'music');
      if (!routed) audio.volume = clamp01(musicVolume) * (announcementActive ? DUCK_FACTOR : 1);
      syncGainValues();
    }
    return musicAudio;
  };

  applyLocalVolume = function() {
    if (musicAudio && !routedMedia.has(musicAudio)) {
      if (!routeMedia(musicAudio, 'music')) {
        musicAudio.volume = clamp01(musicVolume) * (announcementActive ? DUCK_FACTOR : 1);
      }
    }
    syncGainValues();
    if (previewAudio && previewKind === 'music') {
      if (!routeMedia(previewAudio, 'music')) previewAudio.volume = clamp01(musicVolume);
    }
  };

  applySoundVolume = function() {
    if (currentAnnouncement && !routedMedia.has(currentAnnouncement)) {
      if (!routeMedia(currentAnnouncement, 'sound')) currentAnnouncement.volume = clamp01(soundVolume);
    }
    syncGainValues();
    if (previewAudio && previewKind === 'sound') {
      if (!routeMedia(previewAudio, 'sound')) previewAudio.volume = clamp01(soundVolume);
    }
  };

  // Spotify Web API helpers. These control the user's active Spotify/Connect
  // device when it supports software volume. This does not pretend to control
  // the anonymous cross-origin Embed.
  function readSpotifyTokens() {
    try {
      const value = localStorage.getItem(SPOTIFY_TOKEN_KEY);
      return value ? JSON.parse(value) : null;
    } catch (_e) {
      return null;
    }
  }

  function saveSpotifyTokens(data, previous) {
    const payload = {
      access_token: data.access_token,
      refresh_token: data.refresh_token || previous?.refresh_token || '',
      expires_at: Date.now() + Math.max(60, Number(data.expires_in || 3600)) * 1000,
      client_id: previous?.client_id || currentGame?.spotifyClientId || ''
    };
    localStorage.setItem(SPOTIFY_TOKEN_KEY, JSON.stringify(payload));
    return payload;
  }

  async function spotifyAccessToken() {
    let tokens = readSpotifyTokens();
    if (!tokens) return null;
    if (Number(tokens.expires_at || 0) > Date.now() + 45_000) return tokens.access_token;
    if (!tokens.refresh_token || !tokens.client_id) return null;
    const body = new URLSearchParams({
      client_id: tokens.client_id,
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token
    });
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
    if (!response.ok) return null;
    tokens = saveSpotifyTokens(await response.json(), tokens);
    return tokens.access_token;
  }

  async function spotifyRequest(path, options = {}) {
    const token = await spotifyAccessToken();
    if (!token) throw new Error('Spotify not authorized');
    const response = await fetch('https://api.spotify.com/v1' + path, {
      ...options,
      headers: { Authorization: 'Bearer ' + token, ...(options.headers || {}) }
    });
    if (response.status === 204) return null;
    if (!response.ok) throw new Error('Spotify control unavailable (' + response.status + ')');
    return response.json();
  }

  async function applySpotifyVolumeNow(ducked = announcementActive) {
    if (musicSource !== 'SPOTIFY') return;
    const tokens = readSpotifyTokens();
    if (!tokens) {
      const configured = !!currentGame?.spotifyClientId;
      setMixerStatus('musicVolume', configured ? 'Spotify: tap CONNECT SPOTIFY to enable this slider.' : 'Spotify: Admin must publish a Spotify Client ID first.', 'warning');
      return;
    }
    try {
      const playback = await spotifyRequest('/me/player');
      const device = playback?.device;
      if (!device) {
        setMixerStatus('musicVolume', 'Spotify: no active playback device. Start Spotify, then move this slider.', 'warning');
        return;
      }
      if (device.is_restricted || device.supports_volume === false) {
        setMixerStatus('musicVolume', 'Spotify: ' + (device.name || 'active device') + ' does not allow remote volume control.', 'warning');
        return;
      }
      const level = clamp01(musicVolume) * (ducked ? DUCK_FACTOR : 1);
      const query = new URLSearchParams({ volume_percent: String(Math.round(level * 100)) });
      if (device.id) query.set('device_id', device.id);
      await spotifyRequest('/me/player/volume?' + query.toString(), { method: 'PUT' });
      setMixerStatus('musicVolume', 'Spotify: controlling ' + (device.name || 'active device') + ' • ' + Math.round(level * 100) + '%', 'ok');
    } catch (error) {
      setMixerStatus('musicVolume', 'Spotify: ' + (error.message || 'volume control unavailable'), 'warning');
    }
  }

  function scheduleSpotifyVolume(ducked = announcementActive) {
    clearTimeout(spotifyVolumeTimer);
    spotifyVolumeTimer = setTimeout(() => applySpotifyVolumeNow(ducked), 90);
  }

  // Use real event listeners last in the chain, so earlier sprint property
  // handlers cannot accidentally swallow the mixer update.
  const soundSlider = $('soundVolume');
  if (soundSlider) {
    soundSlider.addEventListener('input', event => {
      ensureAudioGraph();
      soundVolume = clamp01(Number(event.target.value) / 100);
      $('soundVolumeLabel').textContent = Math.round(soundVolume * 100) + '%';
      applySoundVolume();
      setMixerStatus('soundVolume', currentAnnouncement ? 'App audio gain active now.' : 'App audio gain ready. Uploaded announcements/effects use this level.', 'ok');
    });
  }

  const musicSlider = $('musicVolume');
  if (musicSlider) {
    musicSlider.addEventListener('input', event => {
      ensureAudioGraph();
      musicVolume = clamp01(Number(event.target.value) / 100);
      $('musicVolumeLabel').textContent = Math.round(musicVolume * 100) + '%';
      applyLocalVolume();
      if (musicSource === 'SPOTIFY') scheduleSpotifyVolume(announcementActive);
      else setMixerStatus('musicVolume', 'Uploaded music gain active • ' + Math.round(musicVolume * 100) + '%', 'ok');
    });
  }

  // Any game-day audio button is a user gesture; use it to unlock AudioContext
  // before mobile Safari starts playback.
  document.addEventListener('pointerdown', event => {
    if (event.target.closest('.sound, #musicPlayBtn, [data-play-track], #spotifyConnectBtn')) ensureAudioGraph();
  }, { capture: true });

  // Reflect source changes immediately.
  const previousSetMusicSource = setMusicSource;
  setMusicSource = function(source) {
    previousSetMusicSource(source);
    if (source === 'SPOTIFY') scheduleSpotifyVolume(false);
    else setMixerStatus('musicVolume', 'Uploaded music gain active • ' + Math.round(musicVolume * 100) + '%', 'ok');
  };

  const style = document.createElement('style');
  style.textContent = `
    .mixer-runtime-status{display:block;margin-top:6px;font-size:8px;line-height:1.3;color:#91a0b5;font-style:normal}
    .mixer-runtime-status[data-mode="ok"]{color:#69d8a1}
    .mixer-runtime-status[data-mode="warning"]{color:#f0b36f}
    .mixer-control input[type="range"]{touch-action:pan-x;cursor:pointer}
  `;
  document.head.appendChild(style);

  ensureAudioGraph();
  setMixerStatus('soundVolume', AudioCtx ? 'Web Audio gain ready for uploaded announcements/effects.' : 'Browser does not expose Web Audio; system volume will be used.', AudioCtx ? 'ok' : 'warning');
  if (musicSource === 'SPOTIFY') scheduleSpotifyVolume(false);
  else setMixerStatus('musicVolume', 'Uploaded music gain active • ' + Math.round(musicVolume * 100) + '%', 'ok');
})();
