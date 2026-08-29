// Keep Next Track enabled whenever the authenticated Spotify Premium player is connected,
// even if the legacy embed renderer refreshes its own button state afterward.
(() => {
  const button = $('nextTrackBtn');
  const status = $('spotifyStatus');
  if (!button || !status) return;
  const sync = () => {
    const connected = status.textContent.includes('PREMIUM CONNECTED');
    if (musicSource === 'SPOTIFY' && connected) {
      button.disabled = false;
      button.style.opacity = '1';
      button.title = 'Skip using Spotify Premium player';
    }
  };
  new MutationObserver(sync).observe(status, { childList: true, characterData: true, subtree: true });
  new MutationObserver(sync).observe(button, { attributes: true, attributeFilter: ['disabled', 'style'] });
  sync();
})();
