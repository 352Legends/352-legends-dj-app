// Sprint 10 — master Start/Stop Music toggle + custom controllable Spotify player UI.
(() => {
  const TOKEN_KEY = 'gameday.spotify.tokens.v1';
  let playerPoll = null;
  let lastSpotifyState = null;
  let busyControl = false;

  function readTokens() {
    try {
      const raw = localStorage.getItem(TOKEN_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_e) { return null; }
  }

  function saveTokens(data, previous) {
    const payload = {
      access_token: data.access_token,
      refresh_token: data.refresh_token || previous?.refresh_token || '',
      expires_at: Date.now() + Math.max(60, Number(data.expires_in || 3600)) * 1000,
      client_id: previous?.client_id || currentGame?.spotifyClientId || ''
    };
    localStorage.setItem(TOKEN_KEY, JSON.stringify(payload));
    return payload;
  }

  async function token() {
    let t = readTokens();
    const published = String(currentGame?.spotifyClientId || '').trim();
    if (!t) return null;
    if (published && t.client_id && t.client_id !== published) return null;
    if (Number(t.expires_at || 0) > Date.now() + 45_000) return t.access_token;
    if (!t.refresh_token || !t.client_id) return null;
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: t.client_id, grant_type: 'refresh_token', refresh_token: t.refresh_token })
    });
    if (!response.ok) return null;
    t = saveTokens(await response.json(), t);
    return t.access_token;
  }

  async function api(path, options = {}) {
    const access = await token();
    if (!access) throw new Error('Connect Spotify Premium first');
    const response = await fetch('https://api.spotify.com/v1' + path, {
      ...options,
      headers: { Authorization: 'Bearer ' + access, 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
    if (response.status === 204) return null;
    if (!response.ok) throw new Error('Spotify control unavailable (' + response.status + ')');
    return response.json();
  }

  function fmt(ms) {
    const sec = Math.max(0, Math.floor(Number(ms || 0) / 1000));
    return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
  }

  function musicIsPlaying() {
    return !!(localPlaying || spotifyPlaying);
  }

  function updateMasterButton() {
    const button = $('stopMusic');
    if (!button) return;
    const playing = musicIsPlaying();
    button.classList.toggle('is-start', !playing);
    button.classList.toggle('is-stop', playing);
    button.textContent = playing ? '■ STOP MUSIC' : '▶ START MUSIC';
    button.setAttribute('aria-pressed', playing ? 'true' : 'false');
    button.title = playing ? 'Stop all music' : 'Start the selected music source';
  }

  async function startMasterMusic() {
    if (gameState === 'LIVE') return msg('Music locked during live play');
    if (musicSource === 'LOCAL') {
      playLocal();
      updateMasterButton();
      return;
    }
    const random = $('soundboardStartMusic');
    if (random) {
      random.click();
      return;
    }
    $('musicPlayBtn')?.click();
  }

  if ($('stopMusic')) {
    $('stopMusic').onclick = () => {
      if (musicIsPlaying()) stopMusic();
      else startMasterMusic();
      setTimeout(updateMasterButton, 60);
    };
  }

  const priorRenderMusicState = renderMusicState;
  renderMusicState = function() {
    priorRenderMusicState();
    updateMasterButton();
  };

  function mountSpotifyPlayer() {
    const shell = document.querySelector('.spotify-shell');
    if (!shell || $('gamedaySpotifyPlayer')) return;
    const mount = $('spotifyMount');
    const player = document.createElement('div');
    player.id = 'gamedaySpotifyPlayer';
    player.className = 'gd-spotify-player';
    player.innerHTML = `
      <div class="gdsp-topline"><span>GAME DAY SPOTIFY</span><b id="gdspDevice">CONNECT SPOTIFY</b></div>
      <div class="gdsp-main">
        <div id="gdspArt" class="gdsp-art"><span>♫</span></div>
        <div class="gdsp-meta">
          <small id="gdspContext">Published playlist</small>
          <strong id="gdspTitle">Spotify Premium Player</strong>
          <span id="gdspArtist">Connect Spotify to unlock full GameDay controls.</span>
          <div class="gdsp-progress"><div id="gdspProgressFill"></div></div>
          <div class="gdsp-times"><span id="gdspElapsed">0:00</span><span id="gdspDuration">0:00</span></div>
        </div>
      </div>
      <div class="gdsp-controls">
        <button id="gdspPrev" type="button" aria-label="Previous track">‹‹</button>
        <button id="gdspPlay" class="gdsp-play" type="button">▶</button>
        <button id="gdspNext" type="button" aria-label="Next track">››</button>
      </div>
      <label class="gdsp-volume"><span><b>Spotify Volume</b><em id="gdspVolumeLabel">${Math.round(musicVolume * 100)}%</em></span><input id="gdspVolume" type="range" min="0" max="100" value="${Math.round(musicVolume * 100)}"></label>
      <div class="gdsp-footer"><span id="gdspStatus">Connect Spotify Premium for volume, previous/next and full playback control.</span><button id="gdspConnect" type="button">CONNECT</button></div>
    `;
    shell.insertBefore(player, mount || null);
    if (mount) mount.classList.add('gdsp-fallback');

    $('gdspConnect').onclick = () => $('spotifyConnectBtn')?.click();
    $('gdspPrev').onclick = () => spotifyCommand('previous');
    $('gdspNext').onclick = () => spotifyCommand('next');
    $('gdspPlay').onclick = () => spotifyCommand('toggle');
    $('gdspVolume').addEventListener('input', event => {
      const value = Number(event.target.value);
      $('gdspVolumeLabel').textContent = value + '%';
      if ($('musicVolume')) {
        $('musicVolume').value = String(value);
        $('musicVolume').dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
  }

  async function spotifyCommand(command) {
    if (busyControl) return;
    if (gameState === 'LIVE') return msg('Music locked during live play');
    if (!(await token())) return $('spotifyConnectBtn')?.click();
    busyControl = true;
    try {
      if (command === 'next') await api('/me/player/next', { method: 'POST' });
      else if (command === 'previous') await api('/me/player/previous', { method: 'POST' });
      else if (command === 'toggle') {
        if (lastSpotifyState?.is_playing) await api('/me/player/pause', { method: 'PUT' });
        else if (lastSpotifyState?.item) await api('/me/player/play', { method: 'PUT' });
        else return startMasterMusic();
      }
      await new Promise(resolve => setTimeout(resolve, 180));
      await refreshSpotifyPlayer();
    } catch (error) {
      msg(error.message || 'Spotify control failed');
    } finally {
      busyControl = false;
    }
  }

  function updateSpotifyUi(playback, authorized) {
    const player = $('gamedaySpotifyPlayer');
    if (!player) return;
    const mount = $('spotifyMount');
    const item = playback?.item;
    const device = playback?.device;
    const connected = !!authorized;

    player.classList.toggle('connected', connected);
    $('gdspConnect').textContent = connected ? 'CONNECTED' : 'CONNECT';
    $('gdspConnect').disabled = connected;
    $('gdspDevice').textContent = connected ? (device?.name || 'SPOTIFY CONNECTED') : 'CONNECT SPOTIFY';

    if (item) {
      $('gdspTitle').textContent = item.name || 'Spotify';
      $('gdspArtist').textContent = Array.isArray(item.artists) ? item.artists.map(a => a.name).filter(Boolean).join(', ') : '';
      $('gdspContext').textContent = playback?.context?.type === 'playlist' ? 'Spotify playlist' : 'Spotify playback';
      const image = item.album?.images?.[0]?.url;
      if (image) $('gdspArt').innerHTML = `<img src="${escapeHtml(image)}" alt="">`;
      else $('gdspArt').innerHTML = '<span>♫</span>';
      const duration = Number(item.duration_ms || 0);
      const progress = Number(playback.progress_ms || 0);
      $('gdspProgressFill').style.width = duration ? Math.min(100, progress / duration * 100) + '%' : '0%';
      $('gdspElapsed').textContent = fmt(progress);
      $('gdspDuration').textContent = fmt(duration);
    } else {
      $('gdspTitle').textContent = connected ? 'Ready for GameDay music' : 'Spotify Premium Player';
      $('gdspArtist').textContent = connected ? 'Tap START MUSIC to choose a random playlist track.' : 'Connect Spotify to unlock full GameDay controls.';
      $('gdspContext').textContent = 'Published playlist';
      $('gdspArt').innerHTML = '<span>♫</span>';
      $('gdspProgressFill').style.width = '0%';
      $('gdspElapsed').textContent = '0:00';
      $('gdspDuration').textContent = '0:00';
    }

    const playing = !!playback?.is_playing;
    if (connected) {
      spotifyPlaying = playing;
      $('gdspPlay').textContent = playing ? 'Ⅱ' : '▶';
      $('gdspStatus').textContent = device ? ('Controlling ' + (device.name || 'active Spotify device')) : 'Spotify authorized — open a Spotify device to begin playback.';
    } else {
      $('gdspPlay').textContent = '▶';
      $('gdspStatus').textContent = 'Connect Spotify Premium for volume, previous/next and full playback control.';
    }

    const value = Math.round(musicVolume * 100);
    if ($('gdspVolume') && document.activeElement !== $('gdspVolume')) $('gdspVolume').value = String(value);
    $('gdspVolumeLabel').textContent = value + '%';

    // The official anonymous Embed is retained only as a fallback. Once the
    // authenticated GameDay player is available, the custom UI replaces it.
    if (mount) mount.style.display = connected ? 'none' : 'block';
    updateMasterButton();
  }

  async function refreshSpotifyPlayer() {
    const authorized = !!(await token());
    if (!authorized) {
      lastSpotifyState = null;
      updateSpotifyUi(null, false);
      return;
    }
    try {
      const playback = await api('/me/player');
      lastSpotifyState = playback;
      updateSpotifyUi(playback, true);
    } catch (_e) {
      updateSpotifyUi(lastSpotifyState, true);
    }
  }

  function startPolling() {
    clearInterval(playerPoll);
    playerPoll = setInterval(() => {
      if (!document.hidden && musicSource === 'SPOTIFY') refreshSpotifyPlayer();
    }, 1800);
    refreshSpotifyPlayer();
  }

  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshSpotifyPlayer(); });

  const style = document.createElement('style');
  style.textContent = `
    .stopmusic.is-start{background:linear-gradient(135deg,#31c97d,#168f58);border-color:#4ccf8c;color:#06120d}
    .stopmusic.is-stop{background:#2a1519;border-color:#7e3945;color:#ff9cab}
    .gd-spotify-player{border:1px solid #2b3542;border-radius:18px;padding:14px;background:linear-gradient(160deg,#151b23,#0b0f15);display:grid;gap:12px;box-shadow:0 18px 50px #0004}
    .gd-spotify-player.connected{border-color:#246b4a;background:linear-gradient(160deg,#12251c,#0b1110)}
    .gdsp-topline{display:flex;justify-content:space-between;gap:10px;font-size:8px;font-weight:900;letter-spacing:.1em;color:#74e2a8}.gdsp-topline b{color:#aeb9c8;text-align:right}
    .gdsp-main{display:grid;grid-template-columns:112px 1fr;gap:14px;align-items:center}.gdsp-art{width:112px;height:112px;border-radius:14px;overflow:hidden;background:linear-gradient(135deg,#243143,#131821);display:grid;place-items:center;font-size:38px;color:#5bd796}.gdsp-art img{width:100%;height:100%;object-fit:cover}
    .gdsp-meta{min-width:0;display:grid;gap:4px}.gdsp-meta small{font-size:9px;color:#7fdca8;text-transform:uppercase;font-weight:850;letter-spacing:.06em}.gdsp-meta strong{font-size:18px;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.gdsp-meta>span{font-size:11px;color:#a9b4c4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .gdsp-progress{height:5px;background:#26303c;border-radius:99px;overflow:hidden;margin-top:7px}.gdsp-progress>div{height:100%;width:0;background:#55d996;border-radius:99px}.gdsp-times{display:flex;justify-content:space-between;font-size:8px;color:#778496}
    .gdsp-controls{display:grid;grid-template-columns:1fr 1.4fr 1fr;gap:9px}.gdsp-controls button{min-height:50px;border:1px solid #334052;border-radius:13px;background:#151d27;color:#fff;font-weight:950;font-size:17px}.gdsp-controls .gdsp-play{background:linear-gradient(135deg,#31c97d,#178d58);border-color:#459c70;color:#07120d;font-size:20px}
    .gdsp-volume{display:grid;gap:7px;padding:10px 11px;border:1px solid #283444;border-radius:12px;background:#0c1117}.gdsp-volume>span{display:flex;justify-content:space-between;font-size:10px}.gdsp-volume em{font-style:normal;color:#64dfa0}.gdsp-volume input{width:100%}
    .gdsp-footer{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:9px;color:#8e9aaa}.gdsp-footer button{border:1px solid #3b8964;border-radius:10px;background:#173326;color:#76e4aa;font-size:9px;font-weight:900;padding:8px 10px}.gdsp-footer button:disabled{opacity:.8}
    .gdsp-fallback{margin-top:10px}
    @media(max-width:540px){.gdsp-main{grid-template-columns:82px 1fr}.gdsp-art{width:82px;height:82px}.gdsp-meta strong{font-size:15px}.gdsp-controls button{min-height:54px}.gdsp-footer{align-items:flex-start;flex-direction:column}.gdsp-footer button{width:100%}}
  `;
  document.head.appendChild(style);

  mountSpotifyPlayer();
  updateMasterButton();
  startPolling();
})();
