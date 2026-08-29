// Sprint 6 — second-tap stop behavior and truthful unified music mixer behavior.
(() => {
  let activeSoundId = null;

  const baseCreateSoundButton = createSoundButton;
  createSoundButton = function(item) {
    const button = baseCreateSoundButton(item);
    button.dataset.soundId = item.id;
    button.setAttribute('aria-pressed', 'false');
    return button;
  };

  function updateSoundPlayingUI() {
    document.querySelectorAll('[data-sound-id]').forEach(button => {
      const on = !!activeSoundId && button.dataset.soundId === activeSoundId && announcementActive;
      button.classList.toggle('is-playing', on);
      button.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  const baseEndDuck = endDuck;
  endDuck = function() {
    baseEndDuck();
    activeSoundId = null;
    updateSoundPlayingUI();
  };

  const baseStopAnnouncement = stopAnnouncement;
  stopAnnouncement = function() {
    baseStopAnnouncement();
    activeSoundId = null;
    updateSoundPlayingUI();
  };

  const basePlayAnnouncement = playAnnouncement;
  playAnnouncement = function(item) {
    // A second tap on the same active button becomes an immediate stop toggle.
    if (announcementActive && activeSoundId === item.id) {
      stopAnnouncement();
      $('now').innerHTML = '<b>Stopped:</b> ' + escapeHtml(item.label);
      msg('■ ' + item.label + ' stopped');
      return;
    }

    activeSoundId = item.id;
    basePlayAnnouncement(item);
    updateSoundPlayingUI();
  };

  // Regenerate the board so every sound button receives its toggle metadata.
  renderBoard();

  const style = document.createElement('style');
  style.textContent = `
    .sound.is-playing {
      outline: 3px solid rgba(255,255,255,.92);
      outline-offset: 2px;
      transform: translateY(-1px);
      box-shadow: 0 0 0 3px rgba(255,255,255,.08), 0 12px 28px rgba(0,0,0,.28);
    }
    .sound.is-playing::before {
      content: '■ TAP AGAIN TO STOP';
      position: absolute;
      left: 8px;
      bottom: 7px;
      z-index: 3;
      font-size: 7px;
      font-weight: 950;
      letter-spacing: .06em;
      color: #fff;
      background: rgba(4,7,11,.72);
      border: 1px solid rgba(255,255,255,.2);
      border-radius: 999px;
      padding: 3px 5px;
      pointer-events: none;
    }
    .spotify-volume-status {
      display: block;
      margin-top: 5px;
      color: #91a0b5;
      font-size: 8px;
      line-height: 1.3;
      font-style: normal;
    }
  `;
  document.head.appendChild(style);

  // The shared music slider controls every audio source the browser exposes to GameDay.
  // Uploaded/local music is directly controllable. Spotify Embed is cross-origin and its
  // documented controller does not expose volume, so we surface that limitation instead
  // of presenting a fake control.
  const musicMixer = $('musicVolume')?.closest('.mixer-control');
  if (musicMixer && !musicMixer.querySelector('.spotify-volume-status')) {
    const status = document.createElement('span');
    status.className = 'spotify-volume-status';
    status.textContent = 'Uploaded music follows this slider. Spotify Embed volume uses the Spotify player/device.';
    musicMixer.appendChild(status);
  }

  const originalMusicInput = $('musicVolume')?.oninput;
  if ($('musicVolume')) {
    $('musicVolume').oninput = event => {
      if (originalMusicInput) originalMusicInput(event);
      // If Spotify adds a documented volume method in a future Embed API revision,
      // GameDay can adopt it here without changing the mixer UI.
    };
  }
})();
