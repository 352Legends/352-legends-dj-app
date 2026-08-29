(() => {
  const $ = id => document.getElementById(id);
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const READY_TIMEOUT_MS = 10000;
  const ACTIVE_TIMEOUT_MS = 4000;
  const IOS_LOCAL_PLAY_TIMEOUT_MS = 1800;
  let startBusy = false;

  function isIOSWebBrowser() {
    if (window.__gamedayIOSWebPlaybackMode === true) return true;
    const ua = String(navigator.userAgent || '');
    const platform = String(navigator.platform || '');
    return /iPad|iPhone|iPod/.test(ua) || (platform === 'MacIntel' && Number(navigator.maxTouchPoints || 0) > 1);
  }

  const IOS_WEB_PLAYBACK = isIOSWebBrowser();

  function toast(text) {
    const t = $('toast');
    if (!t) return;
    t.textContent = text;
    t.classList.add('on');
    clearTimeout(window.__gamedayBrowserPlayerToast);
    window.__gamedayBrowserPlayerToast = setTimeout(() => t.classList.remove('on'), 3600);
  }

  function setPlayerStatus(text) {
    if ($('gdspStatus')) $('gdspStatus').textContent = text;
    if ($('soundboardStartMusicStatus')) $('soundboardStartMusicStatus').textContent = text;
    if ($('spotifyConnectStatus')) $('spotifyConnectStatus').textContent = text;
  }

  function isLivePlay() {
    return document.querySelector('#statebar [data-state="LIVE"]')?.getAttribute('aria-pressed') === 'true';
  }

  function spotifySelected() {
    return !$('spotifySourceBtn') || $('spotifySourceBtn').classList.contains('on');
  }

  function isSpotifyPlayingNow() {
    try { return typeof spotifyPlaying !== 'undefined' && !!spotifyPlaying; } catch (_e) { return false; }
  }

  function currentSdkPlayer() {
    try {
      if (typeof spotifyPlayer !== 'undefined' && spotifyPlayer) return spotifyPlayer;
    } catch (_e) {}
    return null;
  }

  function activateBrowserAudioNow() {
    const player = currentSdkPlayer();
    if (!player?.activateElement) return false;
    try {
      player.activateElement();
      try { if (typeof spotifyAutoplayBlocked !== 'undefined') spotifyAutoplayBlocked = false; } catch (_e) {}
      return true;
    } catch (_e) {
      return false;
    }
  }

  async function ensurePlayerCreated() {
    if (typeof spotifyAuthorized === 'function' && !(await spotifyAuthorized())) {
      if (typeof beginSpotifyAuthorization === 'function') return beginSpotifyAuthorization();
      throw new Error('Connect Spotify Premium first');
    }
    if (typeof ensureSpotifySdk === 'function') await ensureSpotifySdk();
    return currentSdkPlayer();
  }

  async function waitForBrowserPlayer() {
    await ensurePlayerCreated();
    const deadline = Date.now() + READY_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const state = window.__gamedayDebug?.state?.() || {};
      const player = currentSdkPlayer();
      if (state.spotifySdkReady && state.spotifySdkDeviceId && player) {
        return { id: state.spotifySdkDeviceId, player };
      }
      await sleep(100);
    }
    const state = window.__gamedayDebug?.state?.() || {};
    let detail = '';
    try { detail = (typeof spotifySdkError !== 'undefined' && spotifySdkError) || ''; } catch (_e) {}
    if (state.spotifyAccountError) throw new Error('Spotify Premium is required for browser playback');
    throw new Error(detail || 'GameDay Browser Player did not become ready in this browser');
  }

  async function activateSdkDevice(deviceId) {
    if (!deviceId) throw new Error('GameDay Browser Player has no Spotify device ID');
    try { if (typeof spotifySelectedDeviceId !== 'undefined') spotifySelectedDeviceId = deviceId; } catch (_e) {}
    if ($('gdspDeviceSelect')) $('gdspDeviceSelect').value = deviceId;

    await spotifyApi('/me/player', {
      method: 'PUT',
      body: JSON.stringify({ device_ids: [deviceId], play: false })
    });

    const deadline = Date.now() + ACTIVE_TIMEOUT_MS;
    while (Date.now() < deadline) {
      try {
        const playback = await spotifyApi('/me/player');
        if (playback?.device?.id === deviceId) return true;
      } catch (_e) {}
      try {
        const data = await spotifyApi('/me/player/devices');
        if ((data?.devices || []).some(d => d?.id === deviceId && d.is_active)) return true;
      } catch (_e) {}
      await sleep(140);
    }
    return false;
  }

  function strictPlaylistIdentity(value) {
    const raw = String(value || '').trim();
    const uriMatch = raw.match(/^spotify:playlist:([A-Za-z0-9]{22})$/);
    if (uriMatch) return { id: uriMatch[1], uri: 'spotify:playlist:' + uriMatch[1] };
    const urlMatch = raw.match(/^https:\/\/open\.spotify\.com\/playlist\/([A-Za-z0-9]{22})(?:[/?#].*)?$/);
    if (!urlMatch) return null;
    return { id: urlMatch[1], uri: 'spotify:playlist:' + urlMatch[1] };
  }

  async function playlistTotal(id) {
    try {
      const p = await spotifyApi('/playlists/' + encodeURIComponent(id));
      return Number(p?.items?.total || 0);
    } catch (_e) {
      return 0;
    }
  }

  function randomPosition(max) {
    if (max <= 1) return 0;
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return Math.floor((a[0] / 4294967296) * max);
  }

  async function forceLocalPlayback(player) {
    let state = null;
    try { state = await player.getCurrentState?.(); } catch (_e) {}
    if (state && !state.paused) return true;

    try { await player.resume?.(); } catch (_e) {}
    await sleep(IOS_WEB_PLAYBACK ? 220 : 120);
    try { state = await player.getCurrentState?.(); } catch (_e) { state = null; }
    if (state && !state.paused) return true;

    if (IOS_WEB_PLAYBACK) {
      try { await player.togglePlay?.(); } catch (_e) {}
      const deadline = Date.now() + IOS_LOCAL_PLAY_TIMEOUT_MS;
      while (Date.now() < deadline) {
        await sleep(120);
        try {
          state = await player.getCurrentState?.();
          if (state && !state.paused) return true;
        } catch (_e) {}
      }
    }
    return !state || !state.paused;
  }

  async function startInBrowser() {
    if (startBusy) return;
    if (isLivePlay()) return toast('Music locked during LIVE PLAY');

    const activatedFromGesture = activateBrowserAudioNow();
    if (IOS_WEB_PLAYBACK && !activatedFromGesture) {
      try { ensurePlayerCreated(); } catch (_e) {}
      setPlayerStatus('Preparing the iOS GameDay Browser Player… wait for PLAYER READY, then tap START MUSIC again.');
      toast('Preparing iOS browser audio — tap Start again when ready');
      return;
    }

    startBusy = true;
    const launch = $('soundboardStartMusic');
    const oldLaunchText = launch?.textContent || '▶ START MUSIC';
    if (launch) {
      launch.disabled = true;
      launch.textContent = IOS_WEB_PLAYBACK ? 'STARTING iOS AUDIO…' : 'STARTING BROWSER PLAYER…';
    }

    try {
      setPlayerStatus('Preparing GameDay Browser Player…');
      const browser = await waitForBrowserPlayer();
      activateBrowserAudioNow();

      const playlist = strictPlaylistIdentity(typeof currentGame !== 'undefined' ? currentGame?.spotifyUrl : '');
      if (!playlist) throw new Error('Published Spotify playlist URL is invalid');

      setPlayerStatus('Selecting this browser as the Spotify audio device…');
      await activateSdkDevice(browser.id);

      const total = await playlistTotal(playlist.id);
      const body = { context_uri: playlist.uri, position_ms: 0 };
      if (total > 0) body.offset = { position: randomPosition(total) };
      else {
        try { await spotifyApi('/me/player/shuffle?state=true&device_id=' + encodeURIComponent(browser.id), { method: 'PUT' }); } catch (_e) {}
      }

      setPlayerStatus(IOS_WEB_PLAYBACK ? 'Starting Spotify audio in this iPhone/iPad browser…' : 'Starting Spotify audio in this browser tab…');
      await spotifyApi('/me/player/play?device_id=' + encodeURIComponent(browser.id), {
        method: 'PUT',
        body: JSON.stringify(body)
      });

      await sleep(IOS_WEB_PLAYBACK ? 320 : 180);
      const localPlaying = await forceLocalPlayback(browser.player);
      if (IOS_WEB_PLAYBACK && !localPlaying) {
        throw new Error('iOS kept the Spotify browser stream paused. Tap START MUSIC once more to satisfy the browser audio gesture.');
      }

      try { if (typeof spotifySelectedDeviceId !== 'undefined') spotifySelectedDeviceId = browser.id; } catch (_e) {}
      try { if (typeof spotifyPlaying !== 'undefined') spotifyPlaying = true; } catch (_e) {}
      try { if (typeof musicSource !== 'undefined') musicSource = 'SPOTIFY'; } catch (_e) {}

      if (!IOS_WEB_PLAYBACK) {
        try {
          await browser.player.setVolume?.(typeof musicVolume !== 'undefined' ? musicVolume * (typeof announcementActive !== 'undefined' && announcementActive ? DUCK_FACTOR : 1) : 0.78);
        } catch (_e) {}
      }

      try { renderMusicState?.(); } catch (_e) {}
      setTimeout(() => { try { refreshSpotifyPlayback?.(); } catch (_e) {} }, 250);
      setPlayerStatus(IOS_WEB_PLAYBACK ? 'Playing in GameDay Browser Player • iOS audio uses the device volume buttons' : 'Playing in GameDay Browser Player • this browser tab');
      toast(IOS_WEB_PLAYBACK ? '▶ Spotify playing in this iOS browser' : '▶ Spotify playing in this browser');
    } catch (err) {
      const message = String(err?.message || err || 'Unable to start Spotify in this browser');
      setPlayerStatus('Browser player: ' + message);
      toast(message);
    } finally {
      startBusy = false;
      if (launch) {
        launch.disabled = false;
        launch.textContent = oldLaunchText.includes('START') ? oldLaunchText : '▶ START MUSIC';
      }
    }
  }

  async function nextInBrowser() {
    if (isLivePlay()) return toast('Music locked during LIVE PLAY');
    activateBrowserAudioNow();
    try {
      const browser = await waitForBrowserPlayer();
      try { if (typeof spotifySelectedDeviceId !== 'undefined') spotifySelectedDeviceId = browser.id; } catch (_e) {}
      await browser.player.nextTrack();
      setTimeout(() => { try { refreshSpotifyPlayback?.(); } catch (_e) {} }, 180);
      toast('Next Spotify track');
    } catch (e) { toast(String(e?.message || e)); }
  }

  async function previousInBrowser() {
    if (isLivePlay()) return toast('Music locked during LIVE PLAY');
    activateBrowserAudioNow();
    try {
      const browser = await waitForBrowserPlayer();
      try { if (typeof spotifySelectedDeviceId !== 'undefined') spotifySelectedDeviceId = browser.id; } catch (_e) {}
      await browser.player.previousTrack();
      setTimeout(() => { try { refreshSpotifyPlayback?.(); } catch (_e) {} }, 180);
    } catch (e) { toast(String(e?.message || e)); }
  }

  function wire() {
    const launch = $('soundboardStartMusic');
    if (launch) launch.onclick = startInBrowser;

    const master = $('stopMusic');
    if (master && !master.dataset.browserPlayerV6) {
      const original = master.onclick;
      master.dataset.browserPlayerV6 = '1';
      master.onclick = e => {
        activateBrowserAudioNow();
        if (spotifySelected() && master.textContent.includes('START MUSIC')) return startInBrowser();
        return original?.call(master, e);
      };
    }

    const play = $('musicPlayBtn');
    if (play && !play.dataset.browserPlayerV6) {
      const original = play.onclick;
      play.dataset.browserPlayerV6 = '1';
      play.onclick = e => {
        activateBrowserAudioNow();
        if (spotifySelected() && play.textContent.includes('PLAY MUSIC')) return startInBrowser();
        return original?.call(play, e);
      };
    }

    const nextTop = $('nextTrackBtn');
    if (nextTop && !nextTop.dataset.browserPlayerV6) {
      const original = nextTop.onclick;
      nextTop.dataset.browserPlayerV6 = '1';
      nextTop.onclick = e => spotifySelected() ? nextInBrowser() : original?.call(nextTop, e);
    }
    if ($('gdspNext')) $('gdspNext').onclick = nextInBrowser;
    if ($('gdspPrev')) $('gdspPrev').onclick = previousInBrowser;

    const state = window.__gamedayDebug?.state?.() || {};
    if (state.spotifySdkReady && state.spotifySdkDeviceId) {
      try { if (typeof spotifySelectedDeviceId !== 'undefined') spotifySelectedDeviceId = state.spotifySdkDeviceId; } catch (_e) {}
      if ($('gdspDeviceSelect')) $('gdspDeviceSelect').value = state.spotifySdkDeviceId;
      if (IOS_WEB_PLAYBACK && !startBusy && !isSpotifyPlayingNow()) setPlayerStatus('Spotify Premium connected • iOS GameDay Browser Player ready. Tap START MUSIC.');
    }
  }

  async function primeMobilePlayer() {
    if (!IOS_WEB_PLAYBACK) return;
    try {
      if (typeof spotifyAuthorized === 'function' && await spotifyAuthorized()) {
        if (!startBusy && !isSpotifyPlayingNow()) setPlayerStatus('Preparing iOS GameDay Browser Player…');
        await ensurePlayerCreated();
        await waitForBrowserPlayer();
        wire();
      }
    } catch (e) {
      if (!isSpotifyPlayingNow()) setPlayerStatus('iOS browser player unavailable: ' + String(e?.message || e));
    }
  }

  window.__gamedayBrowserSpotifyV6 = { startInBrowser, nextInBrowser, previousInBrowser, forceLocalPlayback, isIOSWebBrowser };
  wire();
  setTimeout(wire, 300);
  setTimeout(wire, 1200);
  setTimeout(primeMobilePlayer, 150);
  window.addEventListener('focus', wire);
})();