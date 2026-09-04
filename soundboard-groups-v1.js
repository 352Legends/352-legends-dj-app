(() => {
  const GROUP_PRESETS = ['Pre-Game','National Anthem','Downs','Quarters','Scoring Plays','Halftime','Offense','Defense','Sponsors','Penalties','Timeouts','Post-Game','Sound Effects','Other'];
  let activeGroup = 'ALL';
  let musicSearch = '';
  let lastMusicSnapshot = '';

  const el = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt = seconds => {
    const n = Number.isFinite(Number(seconds)) ? Math.max(0, Math.floor(Number(seconds))) : 0;
    return Math.floor(n / 60) + ':' + String(n % 60).padStart(2, '0');
  };

  function inferGroup(item) {
    const explicit = String(item?.group || '').trim();
    if (explicit) return explicit;
    if (item?.kind === 'effect') return 'Sound Effects';
    const id = String(item?.id || '').toLowerCase();
    const label = String(item?.label || '').toLowerCase();
    const eyebrow = String(item?.eyebrow || '').toLowerCase();
    const text = `${id} ${label} ${eyebrow}`;
    if (/anthem/.test(text)) return 'National Anthem';
    if (/pre.?game|opener|welcome|intro/.test(text)) return 'Pre-Game';
    if (/half.?time/.test(text)) return 'Halftime';
    if (/quarter|\bq[1-4]\b/.test(text)) return 'Quarters';
    if (/first.?down|second.?down|third.?down|fourth.?down|\bdown\b/.test(text)) return 'Downs';
    if (/touchdown|field.?goal|extra.?point|safety|score/.test(text)) return 'Scoring Plays';
    if (/timeout/.test(text)) return 'Timeouts';
    if (/flag|penalt|holding|false.?start|offsides?/.test(text)) return 'Penalties';
    if (/sponsor|partner|thank.*support/.test(text)) return 'Sponsors';
    if (/defen|turnover|interception|sack/.test(text)) return 'Defense';
    if (/offen|run|pass|drive/.test(text)) return 'Offense';
    if (/final|end.?of.?game|post.?game/.test(text)) return 'Post-Game';
    return 'Other';
  }

  function injectStyles() {
    if (el('soundboardGroupsV1Styles')) return;
    const s = document.createElement('style');
    s.id = 'soundboardGroupsV1Styles';
    s.textContent = `
      .gd-soundboard-workspace{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(330px,.75fr);gap:11px;align-items:start;margin-bottom:11px}.gd-soundboard-workspace>.panel{margin-top:0}.gd-original-sound-sections{display:none!important}.gd-group-nav{display:flex;gap:6px;overflow-x:auto;padding:2px 1px 9px;scrollbar-width:none;position:sticky;top:58px;z-index:12;background:linear-gradient(180deg,#121823 72%,rgba(18,24,35,0))}.gd-group-nav::-webkit-scrollbar{display:none}.gd-group-chip{border:1px solid #344154;border-radius:999px;background:#101722;color:#b9c4d4;padding:8px 10px;font-size:9px;font-weight:900;white-space:nowrap}.gd-group-chip.on{background:#f6f8fb;color:#081018;border-color:#f6f8fb}.gd-group-stack{display:grid;gap:12px}.gd-group-section{border-top:1px solid #263244;padding-top:10px}.gd-group-section:first-child{border-top:0;padding-top:1px}.gd-group-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:7px}.gd-group-heading b{font-size:12px}.gd-group-heading span{font-size:8px;color:#7f8ea2;font-weight:900;letter-spacing:.06em}.gd-group-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.gd-group-empty{padding:14px;border:1px dashed #344154;border-radius:12px;text-align:center;color:#8d9bae;font-size:9px}
      .gd-sb-music{display:grid;gap:10px}.gd-sb-music-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}.gd-sb-music-head h2{margin:0}.gd-sb-music-head span{font-size:8px;color:#69d8a1;font-weight:900;letter-spacing:.08em}.gd-sb-now{border:1px solid #2b394a;border-radius:14px;padding:11px;background:#0d131b;display:grid;gap:7px}.gd-sb-now small{font-size:8px;color:#69d8a1;font-weight:900;letter-spacing:.07em}.gd-sb-now strong{font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.gd-sb-now .gd-sb-meta{font-size:8px;color:#8998aa}.gd-sb-seek{display:grid;gap:4px}.gd-sb-seek input{width:100%}.gd-sb-times{display:flex;justify-content:space-between;font-size:8px;color:#718095}.gd-sb-controls{display:grid;grid-template-columns:1fr 1.4fr 1fr;gap:6px}.gd-sb-controls button,.gd-sb-modes button{min-height:44px;border:1px solid #334052;border-radius:10px;background:#151d27;color:#fff;font-weight:900}.gd-sb-controls .primary-play{background:linear-gradient(135deg,#31c97d,#168f58);border-color:#4ccf8c;color:#06120d}.gd-sb-modes{display:grid;grid-template-columns:1fr 1fr;gap:6px}.gd-sb-modes button.on{border-color:#4aa975;background:#153527;color:#7ce4ad}.gd-sb-library-head{display:grid;gap:6px}.gd-sb-library-head input{width:100%;border:1px solid #344154;border-radius:10px;background:#0b1017;color:#fff;padding:9px}.gd-sb-tracklist{display:grid;gap:5px;max-height:420px;overflow:auto}.gd-sb-track{display:grid;grid-template-columns:26px minmax(0,1fr) auto;gap:7px;align-items:center;padding:8px;border:1px solid #27313e;border-radius:10px;background:#0f141b}.gd-sb-track.current{border-color:#3d8e68;background:#12231b}.gd-sb-track .num{font-size:8px;color:#7f8ea2;font-weight:900}.gd-sb-track .copy{min-width:0}.gd-sb-track .copy b{display:block;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.gd-sb-track .copy small{font-size:7px;color:#7f8ea2}.gd-sb-track.current .copy small{color:#69d8a1}.gd-sb-track button{min-width:52px}.gd-local-default .music-layout{grid-template-columns:1fr}.gd-local-default .source-toggle{grid-template-columns:1fr}
      @media(max-width:900px){.gd-soundboard-workspace{grid-template-columns:1fr}.gd-sb-tracklist{max-height:330px}.gd-group-nav{top:56px}}@media(max-width:560px){.gd-group-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.gd-group-nav{top:54px}.gd-sb-controls button{min-height:49px}}
    `;
    document.head.appendChild(s);
  }

  function ensureWorkspace() {
    const pane = el('soundPane');
    if (!pane) return null;
    let workspace = el('gdSoundboardWorkspace');
    if (workspace) return workspace;
    const panels = Array.from(pane.children).filter(x => x.classList?.contains('panel'));
    const boardPanel = panels[0];
    if (!boardPanel) return null;
    workspace = document.createElement('div');
    workspace.id = 'gdSoundboardWorkspace';
    workspace.className = 'gd-soundboard-workspace';
    boardPanel.before(workspace);
    workspace.appendChild(boardPanel);
    const musicPanel = document.createElement('section');
    musicPanel.className = 'panel';
    musicPanel.id = 'soundboardUploadedMusic';
    musicPanel.innerHTML = '<div class="gd-sb-music"><div class="gd-sb-music-head"><div><h2>Uploaded Music</h2><div class="sub">Quick player and published track library.</div></div><span>GAME-DAY MUSIC</span></div><div id="soundboardMusicPlayer"></div></div>';
    workspace.appendChild(musicPanel);
    return workspace;
  }

  function groupedHost() {
    const workspace = ensureWorkspace();
    const boardPanel = workspace?.querySelector('.panel');
    if (!boardPanel) return null;
    let host = el('gdGroupedSoundboard');
    if (!host) {
      host = document.createElement('div');
      host.id = 'gdGroupedSoundboard';
      const firstSection = boardPanel.querySelector('.sound-section');
      if (firstSection) firstSection.before(host); else boardPanel.appendChild(host);
    }
    boardPanel.querySelectorAll('.sound-section').forEach(x => x.classList.add('gd-original-sound-sections'));
    return host;
  }

  function orderedGroups(items) {
    const found = [];
    items.forEach(item => { const g = inferGroup(item); if (!found.includes(g)) found.push(g); });
    return [...GROUP_PRESETS.filter(g => found.includes(g)), ...found.filter(g => !GROUP_PRESETS.includes(g))];
  }

  function renderGroupedBoard() {
    const host = groupedHost();
    if (!host || typeof activeSoundboard !== 'function' || typeof createSoundButton !== 'function') return;
    const items = activeSoundboard().map(raw => ({...raw, group: inferGroup(raw)}));
    const groups = orderedGroups(items);
    if (activeGroup !== 'ALL' && !groups.includes(activeGroup)) activeGroup = 'ALL';
    host.innerHTML = `<div class="gd-group-nav" aria-label="Soundboard groups"><button class="gd-group-chip ${activeGroup==='ALL'?'on':''}" data-group-filter="ALL">ALL</button>${groups.map(g => `<button class="gd-group-chip ${activeGroup===g?'on':''}" data-group-filter="${esc(g)}">${esc(g)} <span>(${items.filter(i=>i.group===g).length})</span></button>`).join('')}</div><div class="gd-group-stack"></div>`;
    const stack = host.querySelector('.gd-group-stack');
    const visibleGroups = activeGroup === 'ALL' ? groups : groups.filter(g => g === activeGroup);
    visibleGroups.forEach(group => {
      const members = items.filter(i => i.group === group);
      const section = document.createElement('section');
      section.className = 'gd-group-section';
      section.dataset.groupSection = group;
      section.innerHTML = `<div class="gd-group-heading"><b>${esc(group)}</b><span>${members.length} BUTTON${members.length===1?'':'S'}</span></div><div class="gd-group-grid"></div>`;
      const grid = section.querySelector('.gd-group-grid');
      members.forEach(item => grid.appendChild(createSoundButton(item)));
      stack.appendChild(section);
    });
    if (!items.length) stack.innerHTML = '<div class="gd-group-empty">No game-day sounds are published for this game.</div>';
    host.querySelectorAll('[data-group-filter]').forEach(b => b.onclick = () => {
      activeGroup = b.dataset.groupFilter || 'ALL';
      renderGroupedBoard();
      host.scrollIntoView({block:'start',behavior:'smooth'});
    });
    try { updateSoundPlayingUI(); } catch (_e) {}
  }

  function musicState() {
    return window.__gamedayUploadedMusicV1?.state?.() || {trackCount:0,musicIndex:0,localPlaying:false,shuffle:false,repeat:'all'};
  }

  function renderSoundboardMusic() {
    ensureWorkspace();
    const host = el('soundboardMusicPlayer');
    if (!host || typeof localTracks !== 'function') return;
    const tracks = localTracks();
    const state = musicState();
    const index = Number.isFinite(Number(state.musicIndex)) ? Number(state.musicIndex) : (typeof musicIndex !== 'undefined' ? musicIndex : 0);
    const track = tracks[index] || null;
    const q = musicSearch.trim().toLowerCase();
    const visible = q ? tracks.map((t,i)=>({t,i})).filter(x => String(x.t.name || '').toLowerCase().includes(q)) : tracks.map((t,i)=>({t,i}));
    const duration = Number(typeof musicAudio !== 'undefined' ? musicAudio?.duration : 0);
    const current = Number(typeof musicAudio !== 'undefined' ? musicAudio?.currentTime : 0) || 0;
    const seek = Number.isFinite(duration) && duration > 0 ? Math.round(current / duration * 1000) : 0;
    host.innerHTML = tracks.length ? `<div class="gd-sb-now"><small>UPLOADED MUSIC • ${index+1} OF ${tracks.length}</small><strong>${esc(track?.name || 'Select a track')}</strong><div class="gd-sb-meta">${state.localPlaying?'PLAYING':'PAUSED'} • ${state.shuffle?'SHUFFLE ON':'PLAY ORDER'} • REPEAT ${String(state.repeat||'all').toUpperCase()}</div><div class="gd-sb-seek"><input data-sbm-seek type="range" min="0" max="1000" value="${seek}" aria-label="Uploaded music position"><div class="gd-sb-times"><span data-sbm-current>${fmt(current)}</span><span data-sbm-total>${Number.isFinite(duration)?fmt(duration):'0:00'}</span></div></div><div class="gd-sb-controls"><button type="button" data-sbm-prev>⏮</button><button type="button" class="primary-play" data-sbm-toggle>${state.localPlaying?'Ⅱ PAUSE':'▶ PLAY'}</button><button type="button" data-sbm-next>⏭</button></div><div class="gd-sb-modes"><button type="button" data-sbm-shuffle class="${state.shuffle?'on':''}">⇄ SHUFFLE ${state.shuffle?'ON':'OFF'}</button><button type="button" data-sbm-repeat class="${state.repeat!=='off'?'on':''}">↻ REPEAT ${String(state.repeat||'all').toUpperCase()}</button></div></div><div class="gd-sb-library-head"><b>Track Library</b><input data-sbm-search type="search" placeholder="Find uploaded track…" value="${esc(musicSearch)}" aria-label="Find uploaded music"></div><div class="gd-sb-tracklist">${visible.map(({t,i}) => `<div class="gd-sb-track ${i===index?'current':''}"><span class="num">${i+1}</span><span class="copy"><b>${esc(t.name)}</b><small>${i===index?(state.localPlaying?'NOW PLAYING':'CURRENT TRACK'):'UPLOADED MUSIC'}</small></span><button class="mini" type="button" data-sbm-track="${i}">${i===index&&state.localPlaying?'Playing':'Play'}</button></div>`).join('') || '<div class="gd-group-empty">No tracks match your search.</div>'}</div>` : '<div class="gd-group-empty">No uploaded music is published for this game.</div>';

    host.querySelector('[data-sbm-toggle]')?.addEventListener('click', () => {
      try { if (typeof setMusicSource === 'function') setMusicSource('LOCAL'); } catch (_e) {}
      if (typeof localPlaying !== 'undefined' && localPlaying) pauseLocal(false); else playLocal();
      setTimeout(renderSoundboardMusic, 60);
    });
    host.querySelector('[data-sbm-prev]')?.addEventListener('click', () => { try { setMusicSource('LOCAL'); } catch (_e) {} window.__gamedayUploadedMusicV1?.previous?.(); setTimeout(renderSoundboardMusic,60); });
    host.querySelector('[data-sbm-next]')?.addEventListener('click', () => { try { setMusicSource('LOCAL'); } catch (_e) {} window.__gamedayUploadedMusicV1?.next?.(); setTimeout(renderSoundboardMusic,60); });
    host.querySelector('[data-sbm-shuffle]')?.addEventListener('click', () => { el('localTracks')?.querySelector('[data-local-shuffle]')?.click(); setTimeout(renderSoundboardMusic,60); });
    host.querySelector('[data-sbm-repeat]')?.addEventListener('click', () => { el('localTracks')?.querySelector('[data-local-repeat]')?.click(); setTimeout(renderSoundboardMusic,60); });
    host.querySelector('[data-sbm-seek]')?.addEventListener('input', e => {
      try {
        if (!musicAudio || !Number.isFinite(Number(musicAudio.duration)) || musicAudio.duration <= 0) return;
        musicAudio.currentTime = Number(e.target.value) / 1000 * musicAudio.duration;
        updateSoundboardProgress();
      } catch (_e) {}
    });
    host.querySelector('[data-sbm-search]')?.addEventListener('input', e => {
      musicSearch = e.target.value;
      renderSoundboardMusic();
      const input = el('soundboardMusicPlayer')?.querySelector('[data-sbm-search]');
      input?.focus();
      try { input?.setSelectionRange(musicSearch.length, musicSearch.length); } catch (_e) {}
    });
    host.querySelectorAll('[data-sbm-track]').forEach(b => b.onclick = () => {
      try { setMusicSource('LOCAL'); } catch (_e) {}
      window.__gamedayUploadedMusicV1?.playTrack?.(Number(b.dataset.sbmTrack));
      setTimeout(renderSoundboardMusic,80);
    });
    lastMusicSnapshot = `${tracks.length}|${index}|${!!state.localPlaying}|${!!state.shuffle}|${state.repeat}|${typeof musicSource !== 'undefined'?musicSource:''}`;
  }

  function updateSoundboardProgress() {
    const host = el('soundboardMusicPlayer');
    if (!host) return;
    const duration = Number(typeof musicAudio !== 'undefined' ? musicAudio?.duration : 0);
    const current = Number(typeof musicAudio !== 'undefined' ? musicAudio?.currentTime : 0) || 0;
    const slider = host.querySelector('[data-sbm-seek]');
    const cur = host.querySelector('[data-sbm-current]');
    const total = host.querySelector('[data-sbm-total]');
    if (cur) cur.textContent = fmt(current);
    if (total) total.textContent = Number.isFinite(duration) ? fmt(duration) : '0:00';
    if (slider && document.activeElement !== slider && Number.isFinite(duration) && duration > 0) slider.value = String(Math.round(current / duration * 1000));
  }

  function syncDefaultMusicLayout() {
    const localDefault = String(currentGame?.defaultMusicSource || '').toUpperCase() === 'LOCAL';
    const pane = el('musicPane');
    pane?.classList.toggle('gd-local-default', localDefault);
    const spotifyButton = el('spotifySourceBtn');
    if (spotifyButton) spotifyButton.hidden = localDefault;
    const spotifyShell = pane?.querySelector('.spotify-shell');
    const spotifyColumn = spotifyShell?.parentElement;
    if (spotifyColumn) spotifyColumn.hidden = localDefault;
    if (localDefault) {
      try { el('localSourceBtn')?.classList.add('on'); } catch (_e) {}
    }
  }

  function installHooks() {
    if (typeof renderBoard === 'function' && !renderBoard.__groupedV1) {
      const grouped = function() { renderGroupedBoard(); };
      grouped.__groupedV1 = true;
      renderBoard = grouped;
      try { window.renderBoard = grouped; } catch (_e) {}
    }
    if (typeof loadPublishedGame === 'function' && !loadPublishedGame.__groupedV1) {
      const base = loadPublishedGame;
      const wrapped = async function(slug) {
        const result = await base(slug);
        activeGroup = 'ALL';
        renderGroupedBoard();
        syncDefaultMusicLayout();
        renderSoundboardMusic();
        return result;
      };
      wrapped.__groupedV1 = true;
      loadPublishedGame = wrapped;
      try { window.loadPublishedGame = wrapped; } catch (_e) {}
    }
  }

  injectStyles();
  ensureWorkspace();
  installHooks();
  renderGroupedBoard();
  syncDefaultMusicLayout();
  renderSoundboardMusic();

  setInterval(() => {
    syncDefaultMusicLayout();
    const tracks = typeof localTracks === 'function' ? localTracks() : [];
    const state = musicState();
    const snapshot = `${tracks.length}|${state.musicIndex}|${!!state.localPlaying}|${!!state.shuffle}|${state.repeat}|${typeof musicSource !== 'undefined'?musicSource:''}`;
    if (snapshot !== lastMusicSnapshot) renderSoundboardMusic(); else updateSoundboardProgress();
  }, 500);

  window.__gamedaySoundboardGroupsV1 = {
    groups: GROUP_PRESETS.slice(),
    inferGroup,
    render: renderGroupedBoard,
    renderMusic: renderSoundboardMusic,
    setGroup: group => { activeGroup = group || 'ALL'; renderGroupedBoard(); },
    state: () => ({activeGroup, localDefault: String(currentGame?.defaultMusicSource || '').toUpperCase() === 'LOCAL'})
  };
})();