(() => {
  const FADE_MS = 1000;
  const STEP_MS = 100;
  let fading = false;
  const el = id => document.getElementById(id);
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const clamp = v => Math.max(0, Math.min(1, Number(v) || 0));

  function baseLevel() {
    const duck = announcementActive ? DUCK_FACTOR : 1;
    return clamp(musicVolume) * duck;
  }

  function setUi(active) {
    const b = el('stopMusic');
    if (b) {
      b.disabled = active;
      if (active) {
        b.textContent = 'FADING OUT…';
        b.setAttribute('aria-busy','true');
      } else b.removeAttribute('aria-busy');
    }
    if (active && el('dockDetail')) el('dockDetail').textContent = 'Music fading out • 1 sec';
  }

  async function fadeLocal(level) {
    const steps = Math.max(1, Math.round(FADE_MS / STEP_MS));
    for (let i = 1; i <= steps; i++) {
      const next = clamp(level * (1 - i / steps));
      try {
        if (audioCtx && musicGain?.gain) {
          const now = audioCtx.currentTime;
          musicGain.gain.cancelScheduledValues?.(now);
          musicGain.gain.setTargetAtTime?.(next, now, 0.035);
        }
      } catch (_e) {}
      try {
        if (musicAudio && (!routedMedia || !routedMedia.has?.(musicAudio))) musicAudio.volume = next;
      } catch (_e) {}
      try {
        if (previewAudio && previewKind === 'music' && (!routedMedia || !routedMedia.has?.(previewAudio))) previewAudio.volume = next;
      } catch (_e) {}
      await sleep(STEP_MS);
    }
  }

  async function fadeStopMusic() {
    if (fading) return;
    fading = true;
    setUi(true);
    const level = baseLevel();
    try {
      await fadeLocal(level);
      try { pauseLocal(true); } catch (_e) {}
      try {
        if (previewAudio && previewKind === 'music') {
          previewAudio.pause();
          previewAudio.currentTime = 0;
        }
      } catch (_e) {}
      try { applyLocalVolume(); } catch (_e) { try { syncGainValues(); } catch (__e) {} }
      try { renderMusicState(); } catch (_e) {}
      try { msg('Music faded out'); } catch (_e) {}
    } finally {
      fading = false;
      setUi(false);
      try { renderMusicState(); } catch (_e) {}
    }
  }

  function wire() {
    const b = el('stopMusic');
    if (!b || b.dataset.localFadeV1 === '1') return;
    const original = b.onclick;
    b.dataset.localFadeV1 = '1';
    b.onclick = function(e) {
      const stopping = /STOP MUSIC/i.test(b.textContent || '');
      if (stopping) {
        e?.preventDefault?.();
        return fadeStopMusic();
      }
      return original?.call(b,e);
    };
  }

  wire();
  setTimeout(wire,300);
  setTimeout(wire,1000);
  window.addEventListener('focus',wire);

  window.__gamedayLocalFadeV1 = {
    durationMs: FADE_MS,
    fadeStopMusic,
    state: () => ({fading})
  };
})();