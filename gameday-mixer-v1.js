(() => {
  const el = id => document.getElementById(id);
  const PREF_KEY = 'gameday.mixer.v1';
  const IOS = window.__gamedayIOSWebPlaybackMode === true || /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && Number(navigator.maxTouchPoints || 0) > 1);
  const IOS_MAX_VOICE_BOOST = 2.0; // +6 dB maximum relative lift when iOS locks Spotify volume.
  let iosVolumeMode = IOS ? 'unknown' : 'sdk'; // unknown | remote | relative | sdk
  let limiterInstalled = false;
  let compressor = null;

  const clamp = v => Math.max(0, Math.min(1, Number(v) || 0));
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function savePrefs() {
    try { localStorage.setItem(PREF_KEY, JSON.stringify({ sound: clamp(soundVolume), music: clamp(musicVolume) })); } catch (_e) {}
  }

  function readPrefs() {
    try {
      const p = JSON.parse(localStorage.getItem(PREF_KEY) || 'null');
      return p && typeof p === 'object' ? p : null;
    } catch (_e) { return null; }
  }

  function installAnnouncementLimiter() {
    if (limiterInstalled || !IOS) return;
    try {
      if (!audioCtx || !soundGain || typeof audioCtx.createDynamicsCompressor !== 'function') return;
      compressor = audioCtx.createDynamicsCompressor();
      compressor.threshold.value = -8;
      compressor.knee.value = 12;
      compressor.ratio.value = 8;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.18;
      soundGain.disconnect();
      soundGain.connect(compressor);
      compressor.connect(audioCtx.destination);
      limiterInstalled = true;
    } catch (e) {
      console.warn('GameDay mixer limiter unavailable', e);
    }
  }

  function iosRelativeBoost() {
    // On iOS Spotify's local SDK volume is physically controlled. Lower backing-mix targets
    // are therefore represented by lifting the controllable announcement channel instead.
    return Math.min(IOS_MAX_VOICE_BOOST, 1 / Math.max(0.5, clamp(musicVolume)));
  }

  function syncMixerLabels() {
    const musicPct = Math.round(clamp(musicVolume) * 100);
    const soundPct = Math.round(clamp(soundVolume) * 100);
    if (el('musicVolumeLabel')) el('musicVolumeLabel').textContent = musicPct + '%';
    if (el('soundVolumeLabel')) el('soundVolumeLabel').textContent = soundPct + '%';
    if (el('gdspVolume')) el('gdspVolume').value = String(musicPct);
    if (el('gdspVolumeLabel')) el('gdspVolumeLabel').textContent = musicPct + '%';
  }

  function setIOSMixCopy() {
    if (!IOS || iosVolumeMode !== 'relative') return;
    const top = el('musicVolume')?.closest('.mixer-control');
    const topLabel = top?.querySelector('span b');
    if (topLabel) topLabel.textContent = 'Music';
    const playerLabel = el('gdspVolume')?.closest('.gdsp-volume')?.querySelector('span b');
    if (playerLabel) playerLabel.textContent = 'Spotify Volume';
    top?.querySelector('.ios-mix-note')?.remove();
    const runtime = top?.querySelector('.mixer-runtime-status');
    if (runtime && /backing mix|backing-track/i.test(runtime.textContent || '')) runtime.remove();
    syncMixerLabels();
  }

  const originalEnsureAudioGraph = typeof ensureAudioGraph === 'function' ? ensureAudioGraph : null;
  if (originalEnsureAudioGraph) {
    ensureAudioGraph = function() {
      const ctx = originalEnsureAudioGraph();
      installAnnouncementLimiter();
      return ctx;
    };
  }

  const originalSyncGainValues = typeof syncGainValues === 'function' ? syncGainValues : null;
  if (originalSyncGainValues) {
    syncGainValues = function() {
      if (!(IOS && iosVolumeMode === 'relative' && typeof musicSource !== 'undefined' && musicSource === 'SPOTIFY')) {
        return originalSyncGainValues();
      }
      if (!audioCtx || !soundGain || !musicGain) return;
      installAnnouncementLimiter();
      const now = audioCtx.currentTime;
      const soundBase = clamp(soundVolume);
      const voiceTarget = announcementActive ? Math.min(IOS_MAX_VOICE_BOOST, soundBase * iosRelativeBoost()) : soundBase;
      soundGain.gain.cancelScheduledValues(now);
      musicGain.gain.cancelScheduledValues(now);
      soundGain.gain.setTargetAtTime(voiceTarget, now, 0.012);
      // Uploaded/local music keeps the normal mixer law even when Spotify is selected later.
      musicGain.gain.setTargetAtTime(clamp(musicVolume) * (announcementActive ? DUCK_FACTOR : 1), now, 0.015);
    };
  }

  async function tryIOSRemoteVolume(level, device) {
    if (!IOS || !device?.id || device.id !== spotifySdkDeviceId || device.supports_volume === false) return false;
    const pct = Math.round(clamp(level) * 100);
    try {
      await spotifyApi('/me/player/volume?volume_percent=' + pct + '&device_id=' + encodeURIComponent(device.id), { method: 'PUT' });
      await sleep(140);
      const playback = await spotifyApi('/me/player');
      const reported = Number(playback?.device?.volume_percent);
      if (Number.isFinite(reported) && Math.abs(reported - pct) <= 4) return true;
    } catch (_e) {}
    return false;
  }

  const originalSetSpotifyVolume = typeof setSpotifyVolume === 'function' ? setSpotifyVolume : null;
  if (originalSetSpotifyVolume) {
    setSpotifyVolume = async function(level, knownDevice = null) {
      if (!(await spotifyAuthorized())) {
        setMixerStatus('musicVolume', spotifyNeedsScopeUpgrade ? 'Spotify: reconnect to enable Premium controls.' : 'Spotify: connect Premium to enable this slider.', 'warning');
        return false;
      }
      try {
        const device = knownDevice || await selectedSpotifyDevice();
        if (!device) {
          setMixerStatus('musicVolume', 'Spotify: no playback device available.', 'warning');
          return false;
        }
        const normalized = clamp(level);
        const pct = Math.round(normalized * 100);

        if (device.id === spotifySdkDeviceId && spotifyPlayer) {
          if (!IOS) {
            await spotifyPlayer.setVolume(normalized);
            iosVolumeMode = 'sdk';
            setMixerStatus('musicVolume', 'Spotify Browser Player • ' + pct + '%', 'ok');
            syncMixerLabels();
            return true;
          }

          if (iosVolumeMode === 'unknown') {
            iosVolumeMode = await tryIOSRemoteVolume(normalized, device) ? 'remote' : 'relative';
          }
          if (iosVolumeMode === 'remote') {
            try {
              await spotifyApi('/me/player/volume?volume_percent=' + pct + '&device_id=' + encodeURIComponent(device.id), { method: 'PUT' });
              setMixerStatus('musicVolume', 'Spotify iOS browser device • ' + pct + '%', 'ok');
              syncMixerLabels();
              return true;
            } catch (_e) {
              iosVolumeMode = 'relative';
            }
          }

          setIOSMixCopy();
          syncGainValues();
          return false;
        }

        if (device.supports_volume === false) {
          setMixerStatus('musicVolume', 'Spotify: ' + (device.name || 'active device') + ' does not support remote volume.', 'warning');
          return false;
        }
        await spotifyApi('/me/player/volume?volume_percent=' + pct + (device.id ? '&device_id=' + encodeURIComponent(device.id) : ''), { method: 'PUT' });
        setMixerStatus('musicVolume', 'Spotify: ' + (device.name || 'active device') + ' • ' + pct + '%', 'ok');
        syncMixerLabels();
        return true;
      } catch (e) {
        setMixerStatus('musicVolume', 'Spotify: ' + (e?.message || 'volume unavailable'), 'warning');
        return false;
      }
    };
  }

  if (typeof scheduleSpotifyVolume === 'function') {
    scheduleSpotifyVolume = function(ducked = announcementActive) {
      clearTimeout(spotifyVolumeTimer);
      if (musicSource !== 'SPOTIFY') return;
      spotifyVolumeTimer = setTimeout(async () => {
        if (IOS && iosVolumeMode === 'relative') {
          syncGainValues();
          setIOSMixCopy();
          return;
        }
        await setSpotifyVolume(clamp(musicVolume) * (ducked ? DUCK_FACTOR : 1));
        if (IOS && iosVolumeMode === 'relative') syncGainValues();
      }, 90);
    };
  }

  function restorePrefs() {
    const p = readPrefs();
    if (p) {
      if (Number.isFinite(Number(p.sound))) soundVolume = clamp(p.sound);
      if (Number.isFinite(Number(p.music))) musicVolume = clamp(p.music);
    }
    if (el('soundVolume')) el('soundVolume').value = String(Math.round(soundVolume * 100));
    if (el('musicVolume')) el('musicVolume').value = String(Math.round(musicVolume * 100));
    syncMixerLabels();
    try { applySoundVolume(); } catch (_e) {}
    try { applyLocalVolume(); } catch (_e) {}
  }

  el('soundVolume')?.addEventListener('input', () => {
    savePrefs();
    syncMixerLabels();
  });

  el('musicVolume')?.addEventListener('input', () => {
    savePrefs();
    syncMixerLabels();
    if (IOS && iosVolumeMode === 'relative') {
      setIOSMixCopy();
      syncGainValues();
    }
  });

  // Keep the secondary Spotify-player fader synchronized with the always-visible top mixer.
  document.addEventListener('input', e => {
    if (e.target?.id === 'gdspVolume') syncMixerLabels();
  });

  restorePrefs();
  if (IOS) setTimeout(() => {
    const state = window.__gamedayDebug?.state?.() || {};
    if (state.spotifySdkReady && state.spotifySdkDeviceId) {
      const d = (typeof spotifyDevices !== 'undefined' ? spotifyDevices : []).find(x => x.id === state.spotifySdkDeviceId);
      if (d?.supports_volume === false) {
        iosVolumeMode = 'relative';
        setIOSMixCopy();
      }
    }
  }, 700);

  setInterval(() => {
    syncMixerLabels();
    if (IOS && iosVolumeMode === 'relative') setIOSMixCopy();
  }, 1500);

  window.__gamedayMixerV1 = {
    state: () => ({ ios: IOS, iosVolumeMode, musicVolume: clamp(musicVolume), soundVolume: clamp(soundVolume), announcementActive: !!announcementActive, voiceBoost: iosRelativeBoost(), limiterInstalled }),
    setSpotifyVolume: (...args) => setSpotifyVolume(...args),
    sync: () => syncGainValues()
  };
})();