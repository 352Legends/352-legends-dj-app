(() => {
  const el = id => document.getElementById(id);

  function removeSpotifySurface() {
    document.querySelectorAll('.spotify-connect-row,.spotify-shell,.gd-spotify-player,.soundboard-music-launch').forEach(node => node.remove());
    ['spotifyConnectBtn','spotifyConnectStatus','spotifySourceBtn','gamedaySpotifyPlayer','gdspConnect','gdspDeviceSelect','gdspVolume'].forEach(id => el(id)?.remove());
  }

  function forceLocalState() {
    try { musicSource = 'LOCAL'; } catch (_e) {}
    try {
      if (currentGame) {
        currentGame.defaultMusicSource = 'LOCAL';
        currentGame.spotifyUrl = null;
        currentGame.spotifyClientId = null;
      }
    } catch (_e) {}
    try {
      if (typeof spotifyPlayer !== 'undefined' && spotifyPlayer) spotifyPlayer.disconnect?.();
      spotifyPlayer = null;
      spotifySdkReady = false;
      spotifySdkDeviceId = '';
      spotifySelectedDeviceId = '';
      spotifyPlayback = null;
      spotifyPlaying = false;
    } catch (_e) {}
    removeSpotifySurface();
  }

  // Disable every Spotify entry point left inside the legacy core. These functions are
  // retained only so the stable local audio engine can continue to be reused safely.
  try { ensureSpotifySdk = async () => false; } catch (_e) {}
  try { startSpotifyPolling = () => {}; } catch (_e) {}
  try { refreshSpotifyPlayback = async () => null; } catch (_e) {}
  try { refreshSpotifyDevices = async () => []; } catch (_e) {}
  try { activateSpotifyForGesture = () => {}; } catch (_e) {}
  try { beginSpotifyAuthorization = () => {}; } catch (_e) {}
  try { spotifyAuthorized = async () => false; } catch (_e) {}
  try { pauseSpotify = async () => {}; } catch (_e) {}
  try { spotifyToggle = async () => {}; } catch (_e) {}
  try { spotifyNext = async () => {}; } catch (_e) {}
  try { spotifyPrevious = async () => {}; } catch (_e) {}
  try { startRandomSpotify = async () => {}; } catch (_e) {}
  try { resumeSpotify = async () => {}; } catch (_e) {}
  try { setSpotifyVolume = async () => false; } catch (_e) {}
  try { scheduleSpotifyVolume = () => {}; } catch (_e) {}
  try { renderSpotifyPlayer = () => {}; } catch (_e) {}

  if (typeof setMusicSource === 'function') {
    setMusicSource = function() {
      forceLocalState();
      try { renderMusicState(); } catch (_e) {}
    };
  }
  if (typeof musicIsPlaying === 'function') musicIsPlaying = () => !!localPlaying;
  if (typeof startMasterMusic === 'function') {
    startMasterMusic = function() {
      forceLocalState();
      if (gameState === 'LIVE') return msg('Music locked during live play');
      return playLocal();
    };
  }

  if (typeof renderMusicState === 'function' && !renderMusicState.__localOnlyV1) {
    const baseRender = renderMusicState;
    const wrappedRender = function() {
      forceLocalState();
      baseRender();
      if (el('dockSource')) el('dockSource').textContent = 'Uploaded Music';
      if (el('localSourceBtn')) el('localSourceBtn').classList.add('on');
      try { setMixerStatus('musicVolume','Uploaded music gain • '+Math.round(musicVolume*100)+'%','ok'); } catch (_e) {}
    };
    wrappedRender.__localOnlyV1 = true;
    renderMusicState = wrappedRender;
  }

  if (typeof loadPublishedGame === 'function' && !loadPublishedGame.__localOnlyV1) {
    const baseLoad = loadPublishedGame;
    const wrappedLoad = async function(slug) {
      const result = await baseLoad(slug);
      forceLocalState();
      try { renderLocalTracks(); } catch (_e) {}
      try { renderMusicState(); } catch (_e) {}
      return result;
    };
    wrappedLoad.__localOnlyV1 = true;
    loadPublishedGame = wrappedLoad;
    try { window.loadPublishedGame = wrappedLoad; } catch (_e) {}
  }

  forceLocalState();
  try { renderMusicState(); } catch (_e) {}
  setTimeout(() => { forceLocalState(); try { renderMusicState(); } catch (_e) {} }, 250);
  setTimeout(() => { forceLocalState(); try { renderMusicState(); } catch (_e) {} }, 900);

  window.__gamedayLocalOnlyV1 = {
    enforce: forceLocalState,
    state: () => ({
      musicSource: typeof musicSource !== 'undefined' ? musicSource : 'LOCAL',
      trackCount: typeof localTracks === 'function' ? localTracks().length : 0,
      spotifySurfaceCount: document.querySelectorAll('.spotify-connect-row,.spotify-shell,.gd-spotify-player,.soundboard-music-launch').length
    })
  };
})();