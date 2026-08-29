(() => {
  const IOS = window.__gamedayIOSWebPlaybackMode === true || /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && Number(navigator.maxTouchPoints || 0) > 1);
  if (!IOS) return;
  const el = id => document.getElementById(id);
  let switching = false;

  function selectedDevice() {
    try {
      const list = Array.isArray(spotifyDevices) ? spotifyDevices : [];
      return list.find(d => d.id === spotifySelectedDeviceId) || list.find(d => d.is_active) || null;
    } catch (_e) { return null; }
  }

  function controllableDevices() {
    try {
      return (Array.isArray(spotifyDevices) ? spotifyDevices : []).filter(d => d?.id && d.supports_volume !== false && d.id !== spotifySdkDeviceId);
    } catch (_e) { return []; }
  }

  function browserVolumeLocked() {
    const mix = window.__gamedayMixerV1?.state?.() || {};
    const d = selectedDevice();
    const browserSelected = !!spotifySdkDeviceId && (!d || d.id === spotifySdkDeviceId || spotifySelectedDeviceId === spotifySdkDeviceId);
    return browserSelected && (d?.supports_volume === false || mix.iosVolumeMode === 'relative');
  }

  function noticeHost() {
    const ctl = el('musicVolume')?.closest('.mixer-control');
    if (!ctl) return null;
    let n = ctl.querySelector('.ios-volume-lock-note');
    if (!n) {
      n = document.createElement('div');
      n.className = 'ios-volume-lock-note mixer-runtime-status';
      n.dataset.mode = 'warning';
      n.style.display = 'grid';
      n.style.gap = '6px';
      n.style.marginTop = '6px';
      ctl.appendChild(n);
    }
    return n;
  }

  function setSliderDisabled(disabled) {
    for (const id of ['musicVolume','gdspVolume']) {
      const input = el(id);
      if (!input) continue;
      input.disabled = disabled;
      input.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    }
  }

  function restoreLabels() {
    const topLabel = el('musicVolume')?.closest('.mixer-control')?.querySelector('span b');
    if (topLabel) topLabel.textContent = 'Music';
    const playerLabel = el('gdspVolume')?.closest('.gdsp-volume')?.querySelector('span b');
    if (playerLabel) playerLabel.textContent = 'Spotify Volume';
  }

  async function useControllableDevice(id) {
    if (switching) return;
    const d = controllableDevices().find(x => x.id === id);
    if (!d) return;
    switching = true;
    try {
      await transferSpotifyPlayback(d, !!spotifyPlaying);
      spotifySelectedDeviceId = d.id;
      await setSpotifyVolume(musicVolume, d);
      setTimeout(() => { try { refreshSpotifyPlayback(); } catch (_e) {} }, 250);
    } catch (e) {
      try { msg('Unable to switch Spotify output: ' + (e?.message || 'device unavailable')); } catch (_e) {}
    } finally {
      switching = false;
      update();
    }
  }

  function update() {
    const n = noticeHost();
    if (!n) return;
    const locked = browserVolumeLocked();
    const devices = controllableDevices();
    restoreLabels();

    if (!locked) {
      setSliderDisabled(false);
      n.innerHTML = '';
      n.style.display = 'none';
      return;
    }

    setSliderDisabled(true);
    n.style.display = 'grid';
    const d = devices[0];
    n.innerHTML = '<span><b>iPhone/iPad browser volume:</b> Spotify does not allow JavaScript to change the browser stream volume. Use the physical volume buttons for audio from this device.' +
      (d ? ' To use the GameDay Spotify slider, switch playback to a volume-controllable Spotify Connect output.' : '') + '</span>' +
      (d ? '<button type="button" class="secondary ios-use-volume-device">USE ' + String(d.name || 'VOLUME-CAPABLE DEVICE').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])) + '</button>' : '');
    const b = n.querySelector('.ios-use-volume-device');
    if (b) b.onclick = () => useControllableDevice(d.id);
    if (typeof setMixerStatus === 'function') {
      setMixerStatus('musicVolume', 'iOS browser output is hardware-volume controlled. Select a volume-capable Spotify Connect device to enable this fader.', 'warning');
    }
  }

  document.addEventListener('change', e => {
    if (e.target?.id === 'gdspDeviceSelect') setTimeout(update, 150);
  });
  document.addEventListener('spotify-devices-updated', update);
  window.addEventListener('focus', update);
  setInterval(update, 800);
  setTimeout(update, 250);
  setTimeout(update, 1200);

  window.__gamedayIOSVolumeOutputV1 = {
    state: () => ({ locked: browserVolumeLocked(), controllable: controllableDevices().map(d => ({ id: d.id, name: d.name })) }),
    useControllableDevice,
    update
  };
})();