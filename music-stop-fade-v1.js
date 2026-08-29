(() => {
  const FADE_MS = 1000;
  const STEP_MS = 100;
  const REMOTE_STEPS = 5;
  let fading = false;

  const el = id => document.getElementById(id);
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const clamp = v => Math.max(0, Math.min(1, Number(v) || 0));

  function currentBaseMusicLevel() {
    const duck = (typeof announcementActive !== 'undefined' && announcementActive && typeof DUCK_FACTOR !== 'undefined') ? DUCK_FACTOR : 1;
    return clamp(typeof musicVolume !== 'undefined' ? musicVolume : 1) * duck;
  }

  function setFadeUi(active) {
    const button = el('stopMusic');
    if (button) {
      button.disabled = active;
      if (active) {
        button.textContent = 'FADING OUT…';
        button.setAttribute('aria-busy', 'true');
      } else {
        button.removeAttribute('aria-busy');
      }
    }
    if (el('dockDetail') && active) el('dockDetail').textContent = 'Music fading out • 1 sec';
  }

  async function fadeLocalMusic(baseLevel) {
    const steps = Math.max(1, Math.round(FADE_MS / STEP_MS));
    for (let i = 1; i <= steps; i++) {
      const factor = 1 - i / steps;
      const level = clamp(baseLevel * factor);
      try {
        if (typeof audioCtx !== 'undefined' && audioCtx && typeof musicGain !== 'undefined' && musicGain?.gain) {
          const now = audioCtx.currentTime;
          musicGain.gain.cancelScheduledValues?.(now);
          musicGain.gain.setTargetAtTime?.(level, now, 0.035);
        }
      } catch (_e) {}
      try {
        if (typeof musicAudio !== 'undefined' && musicAudio && (!routedMedia || !routedMedia.has?.(musicAudio))) musicAudio.volume = level;
      } catch (_e) {}
      try {
        if (typeof previewAudio !== 'undefined' && previewAudio && previewKind === 'music' && (!routedMedia || !routedMedia.has?.(previewAudio))) previewAudio.volume = level;
      } catch (_e) {}
      await sleep(STEP_MS);
    }
  }

  function spotifyFadeCapability() {
    const mixer = window.__gamedayMixerV1?.state?.() || {};
    const ios = mixer.ios === true || window.__gamedayIOSWebPlaybackMode === true;
    const sdkSelected = typeof spotifyPlayer !== 'undefined' && !!spotifyPlayer && typeof spotifySdkDeviceId !== 'undefined' && !!spotifySdkDeviceId &&
      (typeof spotifySelectedDeviceId === 'undefined' || !spotifySelectedDeviceId || spotifySelectedDeviceId === spotifySdkDeviceId);
    if (sdkSelected && !ios) return 'sdk';
    if (ios && mixer.iosVolumeMode === 'relative') return 'locked';
    return 'remote';
  }

  async function fadeSpotifyMusic(baseLevel) {
    const capability = spotifyFadeCapability();
    if (capability === 'sdk') {
      const steps = Math.max(1, Math.round(FADE_MS / STEP_MS));
      for (let i = 1; i <= steps; i++) {
        const factor = 1 - i / steps;
        try { await spotifyPlayer.setVolume(clamp(baseLevel * factor)); } catch (_e) {}
        await sleep(STEP_MS);
      }
      return { faded: true, capability };
    }

    if (capability === 'remote' && window.__gamedayMixerV1?.setSpotifyVolume) {
      const stepMs = Math.round(FADE_MS / REMOTE_STEPS);
      let changed = false;
      for (let i = 1; i <= REMOTE_STEPS; i++) {
        const factor = 1 - i / REMOTE_STEPS;
        try { changed = (await window.__gamedayMixerV1.setSpotifyVolume(clamp(baseLevel * factor))) || changed; } catch (_e) {}
        await sleep(stepMs);
      }
      return { faded: changed, capability: changed ? 'remote' : 'locked' };
    }

    // Spotify's iOS browser stream can be physically volume-locked. Keep the Stop Music
    // timing at one second, but do not claim a software fade where Spotify exposes no gain.
    await sleep(FADE_MS);
    return { faded: false, capability: 'locked' };
  }

  async function restoreMusicLevel(baseLevel, source, fadeResult) {
    try {
      if (source === 'LOCAL') {
        if (typeof applyLocalVolume === 'function') applyLocalVolume();
        else if (typeof syncGainValues === 'function') syncGainValues();
        return;
      }
      if (fadeResult?.capability === 'sdk' && typeof spotifyPlayer !== 'undefined' && spotifyPlayer?.setVolume) {
        await spotifyPlayer.setVolume(clamp(baseLevel));
        return;
      }
      if (fadeResult?.faded && window.__gamedayMixerV1?.setSpotifyVolume) {
        await window.__gamedayMixerV1.setSpotifyVolume(clamp(baseLevel));
      }
    } catch (_e) {}
  }

  async function finishStop(source) {
    if (source === 'LOCAL') {
      try { if (typeof pauseLocal === 'function') pauseLocal(true); } catch (_e) {}
    } else {
      try { if (typeof pauseSpotify === 'function') await pauseSpotify(); } catch (_e) {}
      try { if (typeof spotifyPlaying !== 'undefined') spotifyPlaying = false; } catch (_e) {}
    }
    try {
      if (typeof previewAudio !== 'undefined' && previewAudio && previewKind === 'music') {
        previewAudio.pause();
        previewAudio.currentTime = 0;
      }
    } catch (_e) {}
    try { if (typeof renderMusicState === 'function') renderMusicState(); } catch (_e) {}
  }

  async function fadeStopMusic() {
    if (fading) return;
    const source = (typeof musicSource !== 'undefined' && musicSource === 'LOCAL') ? 'LOCAL' : 'SPOTIFY';
    const baseLevel = currentBaseMusicLevel();
    fading = true;
    setFadeUi(true);
    let fadeResult = { faded: false, capability: 'none' };
    try {
      if (source === 'LOCAL') {
        await fadeLocalMusic(baseLevel);
        fadeResult = { faded: true, capability: 'local' };
      } else {
        fadeResult = await fadeSpotifyMusic(baseLevel);
      }
      await finishStop(source);
      await restoreMusicLevel(baseLevel, source, fadeResult);
      try { if (typeof msg === 'function') msg(fadeResult.faded ? 'Music faded out' : 'Music stopped'); } catch (_e) {}
    } finally {
      fading = false;
      setFadeUi(false);
      try { if (typeof renderMusicState === 'function') renderMusicState(); } catch (_e) {}
    }
  }

  function wireMasterStop() {
    const button = el('stopMusic');
    if (!button || button.dataset.fadeStopV1 === '1') return;
    const original = button.onclick;
    button.dataset.fadeStopV1 = '1';
    button.onclick = function(e) {
      const isStop = /STOP MUSIC/i.test(button.textContent || '');
      if (isStop) {
        e?.preventDefault?.();
        return fadeStopMusic();
      }
      return original?.call(button, e);
    };
  }

  wireMasterStop();
  setTimeout(wireMasterStop, 300);
  setTimeout(wireMasterStop, 1200);
  window.addEventListener('focus', wireMasterStop);

  window.__gamedayMusicFadeV1 = {
    durationMs: FADE_MS,
    fadeStopMusic,
    state: () => ({ fading, capability: spotifyFadeCapability() })
  };
})();