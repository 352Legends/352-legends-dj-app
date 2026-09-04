(() => {
  const PREF_KEY = 'gameday.mixer.local.v1';
  const LEGACY_PREF_KEY = 'gameday.mixer.v1';
  const el = id => document.getElementById(id);
  const clamp = v => Math.max(0, Math.min(1, Number(v) || 0));

  function readPrefs() {
    for (const key of [PREF_KEY, LEGACY_PREF_KEY]) {
      try {
        const p = JSON.parse(localStorage.getItem(key) || 'null');
        if (p && typeof p === 'object') return p;
      } catch (_e) {}
    }
    return null;
  }

  function savePrefs() {
    try { localStorage.setItem(PREF_KEY, JSON.stringify({sound:clamp(soundVolume),music:clamp(musicVolume)})); } catch (_e) {}
  }

  function syncLabels() {
    if (el('soundVolumeLabel')) el('soundVolumeLabel').textContent = Math.round(clamp(soundVolume) * 100) + '%';
    if (el('musicVolumeLabel')) el('musicVolumeLabel').textContent = Math.round(clamp(musicVolume) * 100) + '%';
  }

  function syncStatuses() {
    try { setMixerStatus('soundVolume','App audio gain • '+Math.round(clamp(soundVolume)*100)+'%','ok'); } catch (_e) {}
    try { setMixerStatus('musicVolume','Uploaded music gain • '+Math.round(clamp(musicVolume)*100)+'%','ok'); } catch (_e) {}
  }

  const p = readPrefs();
  if (p) {
    if (Number.isFinite(Number(p.sound))) soundVolume = clamp(p.sound);
    if (Number.isFinite(Number(p.music))) musicVolume = clamp(p.music);
  }
  if (el('soundVolume')) el('soundVolume').value = String(Math.round(soundVolume * 100));
  if (el('musicVolume')) el('musicVolume').value = String(Math.round(musicVolume * 100));
  syncLabels();
  try { applySoundVolume(); } catch (_e) {}
  try { applyLocalVolume(); } catch (_e) {}
  syncStatuses();

  el('soundVolume')?.addEventListener('input', () => { savePrefs(); syncLabels(); syncStatuses(); });
  el('musicVolume')?.addEventListener('input', () => { savePrefs(); syncLabels(); syncStatuses(); });

  window.__gamedayLocalMixerV1 = {
    save: savePrefs,
    state: () => ({sound:clamp(soundVolume),music:clamp(musicVolume)})
  };
})();