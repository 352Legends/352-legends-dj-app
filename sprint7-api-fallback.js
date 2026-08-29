// Sprint 7 mobile resilience: use Spotify Web API against the active Spotify/Connect device
// whenever an authorized token exists, even if Web Playback SDK is unavailable on the browser.
(() => {
  const TOKEN_KEY = 'gameday.spotify.tokens.v1';
  let apiAuthorized = false;

  function readTokens() {
    try {
      const raw = localStorage.getItem(TOKEN_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_e) { return null; }
  }

  function saveTokens(data, old) {
    const payload = {
      access_token: data.access_token,
      refresh_token: data.refresh_token || old.refresh_token || '',
      expires_at: Date.now() + Math.max(60, Number(data.expires_in || 3600)) * 1000,
      client_id: old.client_id
    };
    localStorage.setItem(TOKEN_KEY, JSON.stringify(payload));
    return payload;
  }

  async function token() {
    let t = readTokens();
    const clientId = String(currentGame?.spotifyClientId || '').trim();
    if (!t || !clientId || t.client_id !== clientId) return null;
    if (Number(t.expires_at || 0) > Date.now() + 60_000) return t.access_token;
    if (!t.refresh_token) return null;
    const body = new URLSearchParams({ client_id: t.client_id, grant_type: 'refresh_token', refresh_token: t.refresh_token });
    const response = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
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
    if (!response.ok) throw new Error('Spotify control unavailable on the active device');
    return response.json();
  }

  async function setActiveVolume(level) {
    const percent = Math.max(0, Math.min(100, Math.round(Number(level) * 100)));
    try { await api('/me/player/volume?volume_percent=' + percent, { method: 'PUT' }); } catch (_e) {}
  }

  async function refreshAuthorizationUi() {
    const access = await token();
    apiAuthorized = !!access;
    if (!apiAuthorized) return;
    const status = $('spotifyConnectStatus');
    const sdkStatus = $('spotifyStatus')?.textContent || '';
    if (status && !sdkStatus.includes('PREMIUM CONNECTED')) {
      status.textContent = 'AUTHORIZED • controlling active Spotify/Connect device';
      status.dataset.mode = 'connected';
    }
    const next = $('nextTrackBtn');
    if (next && musicSource === 'SPOTIFY') { next.disabled = false; next.style.opacity = '1'; }
  }

  const priorNext = $('nextTrackBtn')?.onclick;
  if ($('nextTrackBtn')) {
    $('nextTrackBtn').onclick = async () => {
      if (musicSource === 'LOCAL') return nextLocal();
      if (gameState === 'LIVE') return msg('Music locked during live play');
      const sdkConnected = ($('spotifyStatus')?.textContent || '').includes('PREMIUM CONNECTED');
      if (sdkConnected && priorNext) return priorNext();
      if (!(await token())) return msg('Connect Spotify Premium for reliable Next Track');
      try {
        await api('/me/player/next', { method: 'POST' });
        msg('Next Spotify track');
      } catch (error) { msg(error.message); }
    };
  }

  const priorMusicInput = $('musicVolume')?.oninput;
  if ($('musicVolume')) {
    $('musicVolume').oninput = async event => {
      await priorMusicInput?.(event);
      if (await token()) setActiveVolume(musicVolume * (announcementActive ? DUCK_FACTOR : 1));
    };
  }

  const priorBeginDuck = beginDuck;
  beginDuck = function() {
    priorBeginDuck();
    if (apiAuthorized) setActiveVolume(musicVolume * DUCK_FACTOR);
  };
  const priorEndDuck = endDuck;
  endDuck = function() {
    priorEndDuck();
    if (apiAuthorized) setActiveVolume(musicVolume);
  };

  const priorStopMusic = stopMusic;
  stopMusic = function() {
    priorStopMusic();
    if (apiAuthorized) api('/me/player/pause', { method: 'PUT' }).catch(() => {});
  };

  const priorPlay = $('musicPlayBtn')?.onclick;
  if ($('musicPlayBtn')) {
    $('musicPlayBtn').onclick = async () => {
      if (musicSource === 'LOCAL') return priorPlay?.();
      if (gameState === 'LIVE') return msg('Music locked during live play');
      const sdkConnected = ($('spotifyStatus')?.textContent || '').includes('PREMIUM CONNECTED');
      if (sdkConnected) return priorPlay?.();
      if (!(await token())) return priorPlay?.();
      const uri = spotifyUri(currentGame?.spotifyUrl || DEFAULT_SPOTIFY);
      try {
        await api('/me/player/play', { method: 'PUT', body: JSON.stringify(uri ? { context_uri: uri } : {}) });
        spotifyPlaying = true;
        renderMusicState();
        msg('Spotify playing on active device');
      } catch (_e) {
        return priorPlay?.();
      }
    };
  }

  let checks = 0;
  const timer = setInterval(async () => {
    await refreshAuthorizationUi();
    checks += 1;
    if ((currentGame?.spotifyClientId && apiAuthorized) || checks > 40) clearInterval(timer);
  }, 350);
  refreshAuthorizationUi();
})();
