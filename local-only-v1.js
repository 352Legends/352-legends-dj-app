(() => {
  const el = id => document.getElementById(id);
  let lastMasterRandomIndex = -1;

  function removeSpotifySurface() {
    document.querySelectorAll('.spotify-connect-row,.spotify-shell,.gd-spotify-player,.soundboard-music-launch').forEach(node => node.remove());
    ['spotifyConnectBtn','spotifyConnectStatus','spotifySourceBtn','gamedaySpotifyPlayer','gdspConnect','gdspDeviceSelect','gdspVolume'].forEach(id => el(id)?.remove());
  }

  function installMasterMusicStyles() {
    if (el('gamedayRandomMasterStyles')) return;
    const style = document.createElement('style');
    style.id = 'gamedayRandomMasterStyles';
    style.textContent = `
      #stopMusic.gd-random-master{min-width:290px;min-height:76px;padding:14px 22px;border-radius:18px;font-size:18px;font-weight:950;letter-spacing:.025em;box-shadow:0 10px 28px rgba(0,0,0,.28);touch-action:manipulation}
      #stopMusic.gd-random-master.is-start{border-width:2px}
      #stopMusic.gd-random-master.is-stop{border-width:2px}
      .dock-inner.dock-simple{align-items:center;gap:14px}
      @media(max-width:620px){.dock-inner.dock-simple{display:grid;grid-template-columns:minmax(0,1fr);gap:8px}.dock-status{text-align:center}#stopMusic.gd-random-master{width:100%;min-width:0;min-height:82px;font-size:19px}}
    `;
    document.head.appendChild(style);
  }

  function syncMasterButtonCopy() {
    const b = el('stopMusic');
    if (!b) return;
    b.classList.add('gd-random-master');
    const playing = !!localPlaying;
    b.title = playing ? 'Fade uploaded music out over 3 seconds' : 'Start a fresh random uploaded track from the beginning';
    b.setAttribute('aria-label', playing ? 'Stop music with a 3 second fade' : 'Start a random uploaded music track');
    if (!playing && !b.disabled) b.textContent = '▶ START MUSIC';
    if (playing && !b.disabled) b.textContent = '■ STOP MUSIC';
    if (!playing && el('dockDetail') && !/fading/i.test(el('dockDetail').textContent || '')) el('dockDetail').textContent = 'START selects a fresh random track';
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

  function randomInt(max) {
    if (max <= 1) return 0;
    try {
      const a = new Uint32Array(1);
      crypto.getRandomValues(a);
      return Math.floor((a[0] / 4294967296) * max);
    } catch (_e) {
      return Math.floor(Math.random() * max);
    }
  }

  function chooseFreshRandomIndex(count) {
    if (count <= 1) return 0;
    if (lastMasterRandomIndex < 0 || lastMasterRandomIndex >= count) return randomInt(count);
    // Choose uniformly from every track except the one used by the previous master START.
    const pick = randomInt(count - 1);
    return pick >= lastMasterRandomIndex ? pick + 1 : pick;
  }

  function startRandomUploadedMusic() {
    forceLocalState();
    if (gameState === 'LIVE') return msg('Music locked during live play');
    const tracks = typeof localTracks === 'function' ? localTracks() : [];
    if (!tracks.length) return msg('No uploaded music in this game');

    const nextIndex = chooseFreshRandomIndex(tracks.length);
    lastMasterRandomIndex = nextIndex;
    try {
      if (musicAudio) {
        musicAudio.pause();
        musicAudio.currentTime = 0;
      }
    } catch (_e) {}
    try { musicAudio = null; } catch (_e) {}
    musicIndex = nextIndex;
    localPlaying = false;
    try { ensureAudioGraph(); } catch (_e) {}
    const result = playLocal();
    try {
      if (musicAudio) musicAudio.currentTime = 0;
    } catch (_e) {}
    try { renderLocalTracks(); } catch (_e) {}
    try { window.__gamedaySoundboardGroupsV1?.renderMusic?.(); } catch (_e) {}
    try { renderMusicState(); } catch (_e) {}
    try { msg('▶ Random track: ' + (tracks[nextIndex]?.name || ('Track ' + (nextIndex + 1)))); } catch (_e) {}
    return result;
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
  if (typeof startMasterMusic === 'function') startMasterMusic = startRandomUploadedMusic;

  if (typeof renderMusicState === 'function' && !renderMusicState.__localOnlyV1) {
    const baseRender = renderMusicState;
    const wrappedRender = function() {
      forceLocalState();
      baseRender();
      if (el('dockSource')) el('dockSource').textContent = 'Uploaded Music';
      if (el('localSourceBtn')) el('localSourceBtn').classList.add('on');
      try { setMixerStatus('musicVolume','Uploaded music gain • '+Math.round(musicVolume*100)+'%','ok'); } catch (_e) {}
      syncMasterButtonCopy();
    };
    wrappedRender.__localOnlyV1 = true;
    renderMusicState = wrappedRender;
  }

  if (typeof loadPublishedGame === 'function' && !loadPublishedGame.__localOnlyV1) {
    const baseLoad = loadPublishedGame;
    const wrappedLoad = async function(slug) {
      const result = await baseLoad(slug);
      forceLocalState();
      lastMasterRandomIndex = -1;
      try { renderLocalTracks(); } catch (_e) {}
      try { renderMusicState(); } catch (_e) {}
      return result;
    };
    wrappedLoad.__localOnlyV1 = true;
    loadPublishedGame = wrappedLoad;
    try { window.loadPublishedGame = wrappedLoad; } catch (_e) {}
  }

  installMasterMusicStyles();
  forceLocalState();
  try { renderMusicState(); } catch (_e) {}
  syncMasterButtonCopy();
  setTimeout(() => { forceLocalState(); try { renderMusicState(); } catch (_e) {} syncMasterButtonCopy(); }, 250);
  setTimeout(() => { forceLocalState(); try { renderMusicState(); } catch (_e) {} syncMasterButtonCopy(); }, 900);

  window.__gamedayLocalOnlyV1 = {
    enforce: forceLocalState,
    startRandom: startRandomUploadedMusic,
    state: () => ({
      musicSource: typeof musicSource !== 'undefined' ? musicSource : 'LOCAL',
      trackCount: typeof localTracks === 'function' ? localTracks().length : 0,
      lastMasterRandomIndex,
      spotifySurfaceCount: document.querySelectorAll('.spotify-connect-row,.spotify-shell,.gd-spotify-player,.soundboard-music-launch').length
    })
  };
})();