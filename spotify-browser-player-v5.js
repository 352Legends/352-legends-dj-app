(() => {
  if (window.__gamedayAppleSpotifyConnectMode) return;

  const $ = id => document.getElementById(id);
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const READY_TIMEOUT_MS = 10000;
  const ACTIVE_TIMEOUT_MS = 3500;
  let startBusy = false;

  function toast(text) {
    const t = $('toast');
    if (!t) return;
    t.textContent = text;
    t.classList.add('on');
    clearTimeout(window.__gamedayBrowserPlayerToast);
    window.__gamedayBrowserPlayerToast = setTimeout(() => t.classList.remove('on'), 3200);
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

  function activateBrowserAudioNow() {
    try {
      if (typeof spotifyPlayer !== 'undefined' && spotifyPlayer?.activateElement) {
        spotifyPlayer.activateElement();
        if (typeof spotifyAutoplayBlocked !== 'undefined') spotifyAutoplayBlocked = false;
        return true;
      }
    } catch (_e) {}
    return false;
  }

  async function waitForBrowserPlayer() {
    if (typeof spotifyAuthorized === 'function' && !(await spotifyAuthorized())) {
      if (typeof beginSpotifyAuthorization === 'function') return beginSpotifyAuthorization();
      throw new Error('Connect Spotify Premium first');
    }

    if (typeof ensureSpotifySdk === 'function') await ensureSpotifySdk();
    const deadline = Date.now() + READY_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const state = window.__gamedayDebug?.state?.() || {};
      if (state.spotifySdkReady && state.spotifySdkDeviceId && typeof spotifyPlayer !== 'undefined' && spotifyPlayer) {
        return { id: state.spotifySdkDeviceId, player: spotifyPlayer };
      }
      await sleep(100);
    }
    const state = window.__gamedayDebug?.state?.() || {};
    const detail = (typeof spotifySdkError !== 'undefined' && spotifySdkError) || '';
    throw new Error(detail || (state.spotifyAccountError ? 'Spotify Premium is required for browser playback' : 'GameDay Browser Player did not become ready in Chrome'));
  }

  async function activateSdkDevice(deviceId) {
    if (!deviceId) throw new Error('GameDay Browser Player has no Spotify device ID');
    if (typeof spotifySelectedDeviceId !== 'undefined') spotifySelectedDeviceId = deviceId;
    if ($('gdspDeviceSelect')) $('gdspDeviceSelect').value = deviceId;

    // Spotify documents that Transfer Playback ordering relative to other Player API calls
    // is not guaranteed. Transfer first, then confirm the SDK device before starting music.
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
    // The explicit device_id on Start Playback below still targets the SDK player even if
    // Spotify's active-device state is slow to reflect the transfer.
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

  async function startInBrowser() {
    if (startBusy) return;
    if (isLivePlay()) return toast('Music locked during LIVE PLAY');
    startBusy = true;
    const launch = $('soundboardStartMusic');
    const oldLaunchText = launch?.textContent || '▶ START MUSIC';
    if (launch) {
      launch.disabled = true;
      launch.textContent = 'STARTING BROWSER PLAYER…';
    }

    // This call is intentionally synchronous in the click path. Spotify says activateElement()
    // should originate from a user gesture in browsers with autoplay protection.
    activateBrowserAudioNow();

    try {
      setPlayerStatus('Preparing GameDay Browser Player…');
      const browser = await waitForBrowserPlayer();
      activateBrowserAudioNow();

      const playlist = strictPlaylistIdentity(typeof currentGame !== 'undefined' ? currentGame?.spotifyUrl : '');
      if (!playlist) throw new Error('Published Spotify playlist URL is invalid');

      setPlayerStatus('Selecting GameDay Browser Player…');
      await activateSdkDevice(browser.id);

      const total = await playlistTotal(playlist.id);
      const body = { context_uri: playlist.uri, position_ms: 0 };
      if (total > 0) body.offset = { position: randomPosition(total) };
      else {
        try { await spotifyApi('/me/player/shuffle?state=true&device_id=' + encodeURIComponent(browser.id), { method: 'PUT' }); } catch (_e) {}
      }

      setPlayerStatus('Starting Spotify audio in this Chrome tab…');
      await spotifyApi('/me/player/play?device_id=' + encodeURIComponent(browser.id), {
        method: 'PUT',
        body: JSON.stringify(body)
      });

      await sleep(220);
      try {
        const state = await browser.player.getCurrentState?.();
        if (state?.paused && browser.player.resume) await browser.player.resume();
      } catch (_e) {}

      if (typeof spotifySelectedDeviceId !== 'undefined') spotifySelectedDeviceId = browser.id;
      if (typeof spotifyPlaying !== 'undefined') spotifyPlaying = true;
      if (typeof musicSource !== 'undefined') musicSource = 'SPOTIFY';
      try { await browser.player.setVolume?.(typeof musicVolume !== 'undefined' ? musicVolume * (typeof announcementActive !== 'undefined' && announcementActive ? DUCK_FACTOR : 1) : 0.78); } catch (_e) {}
      try { renderMusicState?.(); } catch (_e) {}
      setTimeout(() => { try { refreshSpotifyPlayback?.(); } catch (_e) {} }, 250);
      setPlayerStatus('Playing in GameDay Browser Player • this Chrome tab');
      toast('▶ Spotify playing in this browser');
    } catch (err) {
      const message = String(err?.message || err || 'Unable to start Spotify in Chrome');
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
      if (typeof spotifySelectedDeviceId !== 'undefined') spotifySelectedDeviceId = browser.id;
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
      if (typeof spotifySelectedDeviceId !== 'undefined') spotifySelectedDeviceId = browser.id;
      await browser.player.previousTrack();
      setTimeout(() => { try { refreshSpotifyPlayback?.(); } catch (_e) {} }, 180);
    } catch (e) { toast(String(e?.message || e)); }
  }

  function wire() {
    const launch = $('soundboardStartMusic');
    if (launch) launch.onclick = startInBrowser;

    const master = $('stopMusic');
    if (master && !master.dataset.browserPlayerV5) {
      const original = master.onclick;
      master.dataset.browserPlayerV5 = '1';
      master.onclick = e => {
        activateBrowserAudioNow();
        if (spotifySelected() && master.textContent.includes('START MUSIC')) return startInBrowser();
        return original?.call(master, e);
      };
    }

    const play = $('musicPlayBtn');
    if (play && !play.dataset.browserPlayerV5) {
      const original = play.onclick;
      play.dataset.browserPlayerV5 = '1';
      play.onclick = e => {
        activateBrowserAudioNow();
        if (spotifySelected() && play.textContent.includes('PLAY MUSIC')) return startInBrowser();
        return original?.call(play, e);
      };
    }

    const nextTop = $('nextTrackBtn');
    if (nextTop && !nextTop.dataset.browserPlayerV5) {
      const original = nextTop.onclick;
      nextTop.dataset.browserPlayerV5 = '1';
      nextTop.onclick = e => spotifySelected() ? nextInBrowser() : original?.call(nextTop, e);
    }
    if ($('gdspNext')) $('gdspNext').onclick = nextInBrowser;
    if ($('gdspPrev')) $('gdspPrev').onclick = previousInBrowser;

    const state = window.__gamedayDebug?.state?.() || {};
    if (state.spotifySdkReady && state.spotifySdkDeviceId) {
      if (typeof spotifySelectedDeviceId !== 'undefined') spotifySelectedDeviceId = state.spotifySdkDeviceId;
      if ($('gdspDeviceSelect')) $('gdspDeviceSelect').value = state.spotifySdkDeviceId;
    }
  }

  window.__gamedayBrowserSpotifyV5 = { startInBrowser, nextInBrowser, previousInBrowser };
  wire();
  setTimeout(wire, 300);
  setTimeout(wire, 1200);
  window.addEventListener('focus', wire);
})();