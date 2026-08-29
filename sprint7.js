// Sprint 7 — Spotify Premium PKCE/Web Playback controls + LIVE PLAY-only state control.
(() => {
  const REDIRECT_URI = location.origin + location.pathname;
  const TOKEN_KEY = 'gameday.spotify.tokens.v1';
  const VERIFIER_KEY = 'gameday.spotify.pkce.verifier';
  const CLIENT_KEY = 'gameday.spotify.pkce.client';
  const RETURN_KEY = 'gameday.spotify.pkce.return';
  const SCOPES = 'streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state';

  let sdkPlayer = null;
  let sdkDeviceId = null;
  let sdkConnected = false;
  let sdkLoading = false;
  let configuredClientId = '';

  const connectBtn = $('spotifyConnectBtn');
  const connectStatus = $('spotifyConnectStatus');

  function setConnectStatus(text, mode = '') {
    if (connectStatus) {
      connectStatus.textContent = text;
      connectStatus.dataset.mode = mode;
    }
    if (connectBtn) {
      connectBtn.textContent = sdkConnected ? 'DISCONNECT SPOTIFY' : 'CONNECT SPOTIFY';
      connectBtn.disabled = !sdkConnected && !configuredClientId;
    }
  }

  function activeClientId() {
    return String(currentGame?.spotifyClientId || configuredClientId || '').trim();
  }

  function bytesToBase64Url(bytes) {
    let binary = '';
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function randomVerifier() {
    const bytes = new Uint8Array(64);
    crypto.getRandomValues(bytes);
    return bytesToBase64Url(bytes);
  }

  async function challengeFor(verifier) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    return bytesToBase64Url(new Uint8Array(digest));
  }

  function saveTokens(data, clientId) {
    const previous = readTokens();
    const payload = {
      access_token: data.access_token,
      refresh_token: data.refresh_token || previous?.refresh_token || '',
      expires_at: Date.now() + Math.max(60, Number(data.expires_in || 3600)) * 1000,
      client_id: clientId
    };
    localStorage.setItem(TOKEN_KEY, JSON.stringify(payload));
    return payload;
  }

  function readTokens() {
    try {
      const raw = localStorage.getItem(TOKEN_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_e) {
      return null;
    }
  }

  async function refreshAccessToken(tokens) {
    if (!tokens?.refresh_token || !tokens?.client_id) return null;
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
    return saveTokens(await response.json(), tokens.client_id);
  }

  async function accessToken() {
    let tokens = readTokens();
    if (!tokens) return null;
    const clientId = activeClientId();
    if (clientId && tokens.client_id !== clientId) return null;
    if (Number(tokens.expires_at || 0) > Date.now() + 60_000) return tokens.access_token;
    tokens = await refreshAccessToken(tokens);
    return tokens?.access_token || null;
  }

  async function beginSpotifyAuthorization() {
    const clientId = activeClientId();
    if (!clientId) return msg('Admin must publish a Spotify Client ID first');
    const verifier = randomVerifier();
    const challenge = await challengeFor(verifier);
    sessionStorage.setItem(VERIFIER_KEY, verifier);
    sessionStorage.setItem(CLIENT_KEY, clientId);
    sessionStorage.setItem(RETURN_KEY, location.href);
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      code_challenge_method: 'S256',
      code_challenge: challenge,
      scope: SCOPES,
      show_dialog: 'false'
    });
    location.assign('https://accounts.spotify.com/authorize?' + params.toString());
  }

  async function handleSpotifyCallback() {
    const params = new URLSearchParams(location.search);
    const code = params.get('code');
    const spotifyError = params.get('error');
    if (!code && !spotifyError) return false;
    const returnUrl = sessionStorage.getItem(RETURN_KEY) || REDIRECT_URI;
    if (spotifyError) {
      sessionStorage.removeItem(VERIFIER_KEY);
      sessionStorage.removeItem(CLIENT_KEY);
      sessionStorage.removeItem(RETURN_KEY);
      msg('Spotify authorization was not completed');
      location.replace(returnUrl);
      return true;
    }
    const verifier = sessionStorage.getItem(VERIFIER_KEY) || '';
    const clientId = sessionStorage.getItem(CLIENT_KEY) || '';
    if (!verifier || !clientId) {
      msg('Spotify sign-in session expired. Try Connect Spotify again.');
      location.replace(returnUrl);
      return true;
    }
    const body = new URLSearchParams({
      client_id: clientId,
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier
    });
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
    if (response.ok) {
      saveTokens(await response.json(), clientId);
    } else {
      msg('Spotify sign-in failed. Check the Client ID and redirect URI.');
    }
    sessionStorage.removeItem(VERIFIER_KEY);
    sessionStorage.removeItem(CLIENT_KEY);
    sessionStorage.removeItem(RETURN_KEY);
    location.replace(returnUrl);
    return true;
  }

  function loadSpotifySdk() {
    if (window.Spotify?.Player) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const previous = window.onSpotifyWebPlaybackSDKReady;
      window.onSpotifyWebPlaybackSDKReady = () => {
        try { if (typeof previous === 'function') previous(); } catch (_e) {}
        resolve();
      };
      let script = document.querySelector('script[data-gameday-spotify-sdk]');
      if (!script) {
        script = document.createElement('script');
        script.src = 'https://sdk.scdn.co/spotify-player.js';
        script.async = true;
        script.dataset.gamedaySpotifySdk = '1';
        script.onerror = () => reject(new Error('Spotify SDK failed to load'));
        document.body.appendChild(script);
      }
      setTimeout(() => {
        if (window.Spotify?.Player) resolve();
      }, 1500);
    });
  }

  async function spotifyApi(path, options = {}) {
    const token = await accessToken();
    if (!token) throw new Error('Spotify authorization required');
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
      const text = await response.text();
      throw new Error(text || ('Spotify request failed (' + response.status + ')'));
    }
    return response.json();
  }

  async function setSpotifyVolume(level) {
    if (!sdkConnected || !sdkPlayer) return;
    const clamped = Math.max(0, Math.min(1, Number(level)));
    try { await sdkPlayer.setVolume(clamped); } catch (_e) {}
    if (sdkDeviceId) {
      try {
        await spotifyApi('/me/player/volume?volume_percent=' + Math.round(clamped * 100) + '&device_id=' + encodeURIComponent(sdkDeviceId), { method: 'PUT' });
      } catch (_e) {}
    }
  }

  async function startPublishedSpotifyPlaylist() {
    if (!sdkConnected || !sdkPlayer || !sdkDeviceId) throw new Error('Connect Spotify first');
    const playlistUri = spotifyUri(currentGame?.spotifyUrl || DEFAULT_SPOTIFY);
    if (!playlistUri) throw new Error('No valid Spotify playlist is published');
    try { await sdkPlayer.activateElement(); } catch (_e) {}
    await spotifyApi('/me/player', {
      method: 'PUT',
      body: JSON.stringify({ device_ids: [sdkDeviceId], play: false })
    });
    await spotifyApi('/me/player/play?device_id=' + encodeURIComponent(sdkDeviceId), {
      method: 'PUT',
      body: JSON.stringify({ context_uri: playlistUri })
    });
    spotifyPlaying = true;
    await setSpotifyVolume(musicVolume * (announcementActive ? DUCK_FACTOR : 1));
    renderMusicState();
  }

  async function initializeSpotifySdk() {
    if (sdkConnected || sdkLoading) return;
    const clientId = activeClientId();
    if (!clientId) return;
    const token = await accessToken();
    if (!token) {
      setConnectStatus('Connect a Spotify Premium account for GameDay volume and track controls.');
      return;
    }
    sdkLoading = true;
    setConnectStatus('Connecting Spotify Premium…');
    try {
      await loadSpotifySdk();
      sdkPlayer = new Spotify.Player({
        name: 'GameDay Youth Football',
        getOAuthToken: async callback => callback((await accessToken()) || ''),
        volume: musicVolume
      });
      sdkPlayer.addListener('ready', ({ device_id }) => {
        sdkDeviceId = device_id;
        sdkConnected = true;
        sdkLoading = false;
        setConnectStatus('CONNECTED • Music slider + Next Track active', 'connected');
        $('spotifyStatus').textContent = 'PREMIUM CONNECTED';
        renderMusicState();
      });
      sdkPlayer.addListener('not_ready', () => {
        sdkConnected = false;
        sdkDeviceId = null;
        setConnectStatus('Spotify player disconnected. Tap Connect Spotify.');
      });
      sdkPlayer.addListener('player_state_changed', state => {
        if (!state) return;
        spotifyPlaying = !state.paused;
        renderMusicState();
      });
      sdkPlayer.addListener('account_error', ({ message }) => {
        sdkConnected = false;
        sdkLoading = false;
        setConnectStatus('Spotify Premium is required for GameDay controls.');
        msg(message || 'Spotify Premium is required');
      });
      sdkPlayer.addListener('authentication_error', () => {
        sdkConnected = false;
        sdkLoading = false;
        localStorage.removeItem(TOKEN_KEY);
        setConnectStatus('Spotify authorization expired. Connect again.');
      });
      sdkPlayer.addListener('playback_error', ({ message }) => msg(message || 'Spotify playback error'));
      const ok = await sdkPlayer.connect();
      if (!ok) throw new Error('Spotify player could not connect');
    } catch (error) {
      sdkLoading = false;
      sdkConnected = false;
      setConnectStatus(error.message || 'Spotify connection failed');
    }
  }

  function refreshSpotifyConfig() {
    const nextId = String(currentGame?.spotifyClientId || '').trim();
    if (nextId && nextId !== configuredClientId) {
      configuredClientId = nextId;
      setConnectStatus('Connect a Spotify Premium account for GameDay volume and track controls.');
      initializeSpotifySdk();
    } else if (!nextId && !configuredClientId) {
      setConnectStatus('Admin must publish a Spotify Client ID to enable GameDay Spotify controls.');
    }
  }

  // Only LIVE PLAY remains. Tapping it again returns to the normal between-play state.
  const liveButton = document.querySelector('#statebar [data-state="LIVE"]');
  if ($('statebar')) {
    $('statebar').onclick = event => {
      const button = event.target.closest('[data-state="LIVE"]');
      if (!button) return;
      setState(gameState === 'LIVE' ? 'BREAK' : 'LIVE');
      button.setAttribute('aria-pressed', gameState === 'LIVE' ? 'true' : 'false');
      button.textContent = gameState === 'LIVE' ? 'LIVE PLAY • ACTIVE' : 'LIVE PLAY';
    };
  }
  if (liveButton) liveButton.setAttribute('aria-pressed', 'false');

  // Replace unreliable embed-seek skipping with the official Spotify player nextTrack method.
  const baseNextTrackClick = $('nextTrackBtn')?.onclick;
  if ($('nextTrackBtn')) {
    $('nextTrackBtn').onclick = async () => {
      if (musicSource === 'LOCAL') return nextLocal();
      if (gameState === 'LIVE') return msg('Music locked during live play');
      if (sdkConnected && sdkPlayer) {
        try {
          await sdkPlayer.activateElement();
          await sdkPlayer.nextTrack();
          msg('Next Spotify track');
          return;
        } catch (_e) {
          try {
            await spotifyApi('/me/player/next' + (sdkDeviceId ? '?device_id=' + encodeURIComponent(sdkDeviceId) : ''), { method: 'POST' });
            msg('Next Spotify track');
            return;
          } catch (error) {
            msg(error.message || 'Spotify Next Track failed');
            return;
          }
        }
      }
      if (baseNextTrackClick && musicSource !== 'SPOTIFY') return baseNextTrackClick();
      msg('Connect Spotify Premium for reliable Next Track');
    };
  }

  // Spotify play/pause uses the connected Web Playback SDK; Embed remains fallback when disconnected.
  const baseMusicPlayClick = $('musicPlayBtn')?.onclick;
  if ($('musicPlayBtn')) {
    $('musicPlayBtn').onclick = async () => {
      if (musicSource === 'LOCAL') return baseMusicPlayClick?.();
      if (gameState === 'LIVE') return msg('Music locked during live play');
      if (!sdkConnected || !sdkPlayer) return baseMusicPlayClick?.();
      try {
        await sdkPlayer.activateElement();
        const state = await sdkPlayer.getCurrentState();
        if (!state) {
          await startPublishedSpotifyPlaylist();
        } else if (state.paused) {
          await sdkPlayer.resume();
        } else {
          await sdkPlayer.pause();
        }
      } catch (error) {
        msg(error.message || 'Spotify playback control failed');
      }
    };
  }

  // Music slider controls uploaded music and connected Spotify from the Soundboard tab.
  const baseMusicInput = $('musicVolume')?.oninput;
  if ($('musicVolume')) {
    $('musicVolume').oninput = async event => {
      baseMusicInput?.(event);
      if (sdkConnected) await setSpotifyVolume(musicVolume * (announcementActive ? DUCK_FACTOR : 1));
    };
  }

  // Apply the same -3 dB duck to connected Spotify without stopping playback.
  const previousBeginDuck = beginDuck;
  beginDuck = function() {
    previousBeginDuck();
    if (sdkConnected) setSpotifyVolume(musicVolume * DUCK_FACTOR);
  };
  const previousEndDuck = endDuck;
  endDuck = function() {
    previousEndDuck();
    if (sdkConnected) setSpotifyVolume(musicVolume);
  };

  const previousStopMusic = stopMusic;
  stopMusic = function() {
    previousStopMusic();
    if (sdkConnected && sdkPlayer) sdkPlayer.pause().catch(() => {});
    spotifyPlaying = false;
    renderMusicState();
  };

  if (connectBtn) {
    connectBtn.onclick = async () => {
      if (sdkConnected && sdkPlayer) {
        try { sdkPlayer.disconnect(); } catch (_e) {}
        sdkPlayer = null;
        sdkConnected = false;
        sdkDeviceId = null;
        localStorage.removeItem(TOKEN_KEY);
        setConnectStatus('Spotify disconnected. Tap Connect Spotify to reconnect.');
        $('spotifyStatus').textContent = 'EMBED READY';
        return;
      }
      const token = await accessToken();
      if (token) return initializeSpotifySdk();
      return beginSpotifyAuthorization();
    };
  }

  // Styling for the single live-play safety control and Spotify connection row.
  const style = document.createElement('style');
  style.textContent = `
    .statebar.live-only{grid-template-columns:1fr;min-width:0;max-width:420px;margin:0 auto;padding:5px}
    .statebar.live-only .live{min-height:48px;font-size:12px;letter-spacing:.04em}
    .spotify-connect-row{display:flex;align-items:center;gap:9px;margin-top:9px;padding-top:9px;border-top:1px solid #2a374a;min-width:0}
    .spotify-connect-row button{min-height:40px;white-space:nowrap}
    .spotify-connect-row span{font-size:9px;line-height:1.35;color:#98a7bc;min-width:0}
    .spotify-connect-row span[data-mode="connected"]{color:#66e6a1;font-weight:800}
    @media(max-width:560px){.spotify-connect-row{align-items:stretch;flex-direction:column}.spotify-connect-row button{width:100%}.spotify-connect-row span{text-align:center}.state-scroll{overflow:visible}}
  `;
  document.head.appendChild(style);

  // Exchange OAuth callback before attempting an SDK connection.
  handleSpotifyCallback().then(handled => {
    if (handled) return;
    let checks = 0;
    const timer = setInterval(() => {
      refreshSpotifyConfig();
      checks += 1;
      if (currentGame?.spotifyClientId || checks > 30) clearInterval(timer);
    }, 300);
    refreshSpotifyConfig();
  });
})();
