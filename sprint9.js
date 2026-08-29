// Sprint 9 — prominent Soundboard Start Music button with true random Spotify playlist start.
(() => {
  const TOKEN_KEY = 'gameday.spotify.tokens.v1';
  const PENDING_KEY = 'gameday.spotify.random-start.pending';
  let starting = false;

  function readTokens() {
    try {
      const raw = localStorage.getItem(TOKEN_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_e) {
      return null;
    }
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

  async function accessToken() {
    let tokens = readTokens();
    const publishedClientId = String(currentGame?.spotifyClientId || '').trim();
    if (!tokens) return null;
    if (publishedClientId && tokens.client_id && tokens.client_id !== publishedClientId) return null;
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
    tokens = saveTokens(await response.json(), tokens);
    return tokens.access_token;
  }

  async function api(path, options = {}) {
    const token = await accessToken();
    if (!token) {
      const error = new Error('Connect Spotify Premium first');
      error.status = 401;
      throw error;
    }
    const response = await fetch('https://api.spotify.com/v1' + path, {
      ...options,
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });
    if (response.status === 204) return null;
    if (!response.ok) {
      const error = new Error('Spotify request failed (' + response.status + ')');
      error.status = response.status;
      throw error;
    }
    return response.json();
  }

  function playlistInfo() {
    const url = String(currentGame?.spotifyUrl || DEFAULT_SPOTIFY || '').trim();
    const match = url.match(/open\.spotify\.com\/playlist\/([A-Za-z0-9]+)/);
    if (!match) return null;
    return { id: match[1], uri: 'spotify:playlist:' + match[1] };
  }

  function randomInt(max) {
    if (max <= 1) return 0;
    if (crypto?.getRandomValues) {
      const values = new Uint32Array(1);
      crypto.getRandomValues(values);
      return Math.floor((values[0] / 4294967296) * max);
    }
    return Math.floor(Math.random() * max);
  }

  async function chooseDevice() {
    const payload = await api('/me/player/devices');
    const devices = Array.isArray(payload?.devices) ? payload.devices.filter(d => d && !d.is_restricted && d.id) : [];
    if (!devices.length) return null;
    return devices.find(d => d.is_active)
      || devices.find(d => /gameday youth football/i.test(d.name || ''))
      || devices[0];
  }

  async function setDeviceVolume(device) {
    if (!device?.id || device.supports_volume === false) return;
    const level = Math.max(0, Math.min(1, Number(musicVolume) || 0)) * (announcementActive ? DUCK_FACTOR : 1);
    const query = new URLSearchParams({
      volume_percent: String(Math.round(level * 100)),
      device_id: device.id
    });
    try {
      await api('/me/player/volume?' + query.toString(), { method: 'PUT' });
    } catch (_e) {}
  }

  function setButtonState(text, detail, busy = false) {
    const button = $('soundboardStartMusic');
    const status = $('soundboardStartMusicStatus');
    if (button) {
      button.disabled = busy;
      button.textContent = text;
      button.setAttribute('aria-busy', busy ? 'true' : 'false');
    }
    if (status && detail) status.textContent = detail;
  }

  async function startRandomSpotifyTrack({ fromPending = false } = {}) {
    if (starting) return;
    if (gameState === 'LIVE') return msg('Music locked during live play');
    const playlist = playlistInfo();
    if (!playlist) return msg('No valid Spotify playlist is published for this game');
    const clientId = String(currentGame?.spotifyClientId || '').trim();
    const token = await accessToken();

    if (!token) {
      if (!clientId) {
        setButtonState('▶ START MUSIC', 'Admin must publish a Spotify Client ID before random playback can start.');
        return msg('Admin must publish a Spotify Client ID first');
      }
      if (!fromPending) {
        sessionStorage.setItem(PENDING_KEY, '1');
        $('spotifyConnectBtn')?.click();
      }
      return;
    }

    starting = true;
    sessionStorage.removeItem(PENDING_KEY);
    setButtonState('SELECTING RANDOM TRACK…', 'Choosing a track from the published Spotify playlist.', true);

    try {
      const [itemsPage, device] = await Promise.all([
        api('/playlists/' + encodeURIComponent(playlist.id) + '/items?limit=1&fields=total'),
        chooseDevice()
      ]);
      const total = Number(itemsPage?.total || 0);
      if (!total) throw new Error('The published Spotify playlist has no playable items');
      if (!device) throw new Error('Open Spotify on a phone, computer, or Connect device, then try again');

      const position = randomInt(total);
      const playPath = '/me/player/play?device_id=' + encodeURIComponent(device.id);
      const body = JSON.stringify({
        context_uri: playlist.uri,
        offset: { position },
        position_ms: 0
      });

      try {
        await api(playPath, { method: 'PUT', body });
      } catch (error) {
        // Some Connect devices need to become active before accepting a new context.
        await api('/me/player', {
          method: 'PUT',
          body: JSON.stringify({ device_ids: [device.id], play: false })
        });
        await new Promise(resolve => setTimeout(resolve, 180));
        await api(playPath, { method: 'PUT', body });
      }

      musicSource = 'SPOTIFY';
      spotifyPlaying = true;
      setMusicSource('SPOTIFY');
      await setDeviceVolume(device);
      renderMusicState();
      setButtonState('♫ START ANOTHER RANDOM TRACK', 'Playing a random track on ' + (device.name || 'Spotify') + '.');
      msg('Random Spotify track started');
    } catch (error) {
      const detail = error?.message || 'Unable to start Spotify playback';
      setButtonState('▶ START MUSIC', detail);
      msg(detail);
    } finally {
      starting = false;
      const button = $('soundboardStartMusic');
      if (button) button.disabled = false;
    }
  }

  function mountControl() {
    const pane = $('soundPane');
    if (!pane || $('soundboardStartMusic')) return;
    const panel = document.createElement('section');
    panel.className = 'soundboard-music-launch';
    panel.innerHTML = `
      <div class="soundboard-music-copy">
        <span class="soundboard-music-kicker">SPOTIFY GAME-DAY PLAYLIST</span>
        <b>Start Music</b>
        <small id="soundboardStartMusicStatus">Randomly selects a playlist track and starts it immediately.</small>
      </div>
      <button id="soundboardStartMusic" class="soundboard-start-button" type="button">▶ START MUSIC</button>
    `;
    pane.insertBefore(panel, pane.firstChild);
    $('soundboardStartMusic').addEventListener('click', () => startRandomSpotifyTrack());
  }

  const style = document.createElement('style');
  style.textContent = `
    .soundboard-music-launch{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px;padding:13px 14px;border:1px solid #2b3f37;border-radius:16px;background:linear-gradient(135deg,#10231c,#101820)}
    .soundboard-music-copy{min-width:0;display:grid;gap:3px}
    .soundboard-music-kicker{font-size:8px;font-weight:900;letter-spacing:.1em;color:#61d99a}
    .soundboard-music-copy>b{font-size:16px}
    .soundboard-music-copy>small{font-size:9px;line-height:1.35;color:#9eacbb}
    .soundboard-start-button{min-width:190px;min-height:58px;border:1px solid #3b9368;border-radius:14px;background:linear-gradient(135deg,#31c97d,#168f58);color:#06120d;font-weight:950;font-size:14px;padding:10px 15px;box-shadow:0 10px 24px #0003}
    .soundboard-start-button:disabled{opacity:.62;cursor:wait}
    @media(max-width:620px){.soundboard-music-launch{align-items:stretch;flex-direction:column}.soundboard-start-button{width:100%;min-width:0;min-height:60px;font-size:15px}}
  `;
  document.head.appendChild(style);

  mountControl();

  // If START MUSIC initiated Spotify authorization, finish the requested action
  // automatically after Spotify redirects back to the same published game URL.
  if (sessionStorage.getItem(PENDING_KEY) === '1') {
    let attempts = 0;
    const timer = setInterval(async () => {
      attempts += 1;
      if (currentGame && await accessToken()) {
        clearInterval(timer);
        startRandomSpotifyTrack({ fromPending: true });
      } else if (attempts > 50) {
        clearInterval(timer);
        sessionStorage.removeItem(PENDING_KEY);
      }
    }, 200);
  }
})();
