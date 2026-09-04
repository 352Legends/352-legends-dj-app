(() => {
  const MAX_FILE_BYTES = 25 * 1024 * 1024;
  const BULK_STATUS_ID = 'musicBulkUploadStatus';
  const BULK_DROP_ID = 'musicBulkDropZone';
  let adminMusicFilter = '';
  let localSearch = '';
  let localShuffle = false;
  let localRepeat = 'all'; // all | one | off

  const el = id => document.getElementById(id);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number(v) || 0));
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmtTime = seconds => {
    const s = Number.isFinite(Number(seconds)) ? Math.max(0, Math.floor(Number(seconds))) : 0;
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  };

  function injectStyles() {
    if (document.getElementById('uploadedMusicV1Styles')) return;
    const s = document.createElement('style');
    s.id = 'uploadedMusicV1Styles';
    s.textContent = `
      .um-admin-tools{display:flex;flex-wrap:wrap;align-items:center;gap:7px;margin:9px 0}.um-admin-tools input[type="search"]{min-width:190px;flex:1}.um-count{font-size:9px;color:#91a0b5;font-weight:850}.um-order{font-size:8px;color:#69d8a1;font-weight:900;letter-spacing:.07em}.um-assetrow{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid #222b36}.um-assetmain{display:flex;align-items:center;gap:8px;min-width:0}.um-assetmain span{min-width:0}.um-assetmain b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.um-asset-actions{display:flex;gap:5px;align-items:center}.um-orderbtn{min-width:32px}.um-bulk-drop{margin-top:8px;border:1px dashed #3b4b5f;border-radius:13px;padding:11px;text-align:center;color:#9caaba;font-size:9px;background:#0d1219}.um-bulk-drop.drag{border-color:#55d996;background:#102019;color:#74e2a8}.um-bulk-status{display:grid;gap:5px;margin-top:8px}.um-upload-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;padding:7px 9px;border-radius:9px;background:#10161e;font-size:9px}.um-upload-row b{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.um-upload-row span{color:#8fa0b3}.um-upload-row[data-state="done"] span{color:#69d8a1}.um-upload-row[data-state="error"] span{color:#ff9cab}
      .um-player{display:grid;gap:12px}.um-now{border:1px solid #2a3848;border-radius:16px;padding:13px;background:linear-gradient(150deg,#121a23,#0b0f15);display:grid;gap:9px}.um-now-kicker{font-size:8px;letter-spacing:.09em;font-weight:900;color:#69d8a1;text-transform:uppercase}.um-now-title{font-size:17px;font-weight:950;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.um-now-sub{font-size:9px;color:#91a0b5}.um-seek{display:grid;gap:5px}.um-seek input{width:100%}.um-times{display:flex;justify-content:space-between;font-size:8px;color:#758396}.um-controls{display:grid;grid-template-columns:1fr 1.3fr 1fr;gap:7px}.um-controls button,.um-modes button{min-height:44px;border:1px solid #334052;border-radius:11px;background:#151d27;color:#fff;font-weight:900}.um-controls .um-play{background:linear-gradient(135deg,#31c97d,#168f58);border-color:#4ccf8c;color:#07120d}.um-modes{display:grid;grid-template-columns:1fr 1fr;gap:7px}.um-modes button.on{border-color:#4aa975;background:#153527;color:#7ce4ad}.um-library-head{display:flex;align-items:center;justify-content:space-between;gap:8px}.um-library-head input{min-width:0;max-width:230px}.um-tracklist{display:grid;gap:6px}.um-trackrow{display:grid;grid-template-columns:32px minmax(0,1fr) auto;gap:8px;align-items:center;padding:9px;border:1px solid #27313e;border-radius:11px;background:#0f141b}.um-trackrow.current{border-color:#3d8e68;background:#12231b}.um-tracknum{display:grid;place-items:center;width:30px;height:30px;border-radius:8px;background:#19212c;color:#91a0b5;font-size:9px;font-weight:900}.um-trackmeta{min-width:0}.um-trackmeta b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:11px}.um-trackmeta small{display:block;color:#8190a2;font-size:8px;margin-top:2px}.um-trackrow.current .um-trackmeta small{color:#69d8a1}.um-trackrow button{min-width:58px}.um-empty{padding:14px;border:1px dashed #303b49;border-radius:12px;text-align:center;color:#8190a2;font-size:9px}
      @media(max-width:620px){.um-admin-tools{align-items:stretch}.um-admin-tools>*{width:100%}.um-assetrow{grid-template-columns:1fr}.um-asset-actions{justify-content:flex-end}.um-library-head{align-items:stretch;flex-direction:column}.um-library-head input{max-width:none;width:100%}.um-controls button{min-height:50px}.um-trackrow{grid-template-columns:30px minmax(0,1fr) auto}}
    `;
    document.head.appendChild(s);
  }

  function validateMusicFile(file) {
    if (!file) return 'Missing file';
    if (file.size > MAX_FILE_BYTES) return 'Over 25 MB';
    if (file.type && !file.type.startsWith('audio/')) return 'Not an audio file';
    return '';
  }

  function bulkStatusHost() {
    const input = el('musicFile');
    if (!input) return null;
    let host = el(BULK_STATUS_ID);
    if (!host) {
      host = document.createElement('div');
      host.id = BULK_STATUS_ID;
      host.className = 'um-bulk-status';
      input.insertAdjacentElement('afterend', host);
    }
    return host;
  }

  function renderBulkRows(files, states = new Map()) {
    const host = bulkStatusHost();
    if (!host) return;
    host.innerHTML = files.map((f, i) => {
      const st = states.get(i) || {state:'queued', text:'Queued'};
      return `<div class="um-upload-row" data-upload-index="${i}" data-state="${esc(st.state)}"><b>${esc(f.name)}</b><span>${esc(st.text)}</span></div>`;
    }).join('');
  }

  function updateBulkRow(index, state, text) {
    const row = document.querySelector(`[data-upload-index="${index}"]`);
    if (!row) return;
    row.dataset.state = state;
    const status = row.querySelector('span');
    if (status) status.textContent = text;
  }

  async function uploadOneMusic(file, user) {
    const ext = (file.name.split('.').pop() || 'audio').replace(/[^a-z0-9]/gi, '').slice(0, 12) || 'audio';
    const key = crypto.randomUUID();
    const path = user.id + '/' + key + '.' + ext;
    const { error: upErr } = await supabase.storage.from('gameday-audio').upload(path, file, {
      contentType: file.type || 'audio/mpeg',
      upsert: false
    });
    if (upErr) throw upErr;
    const { data: newAsset, error: dbErr } = await supabase.from('audio_assets').insert({
      owner_id: user.id,
      name: file.name,
      kind: 'music',
      mime_type: file.type || 'audio/mpeg',
      size_bytes: file.size,
      storage_path: path,
      client_asset_key: key
    }).select('id,name,kind,storage_path,created_at').single();
    if (dbErr) {
      try { await supabase.storage.from('gameday-audio').remove([path]); } catch (_e) {}
      throw dbErr;
    }
    return newAsset;
  }

  async function bulkUploadFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) { try { msg('Choose one or more audio tracks'); } catch (_e) {} return {uploaded:0, failed:0}; }
    const states = new Map();
    files.forEach((f, i) => {
      const invalid = validateMusicFile(f);
      states.set(i, invalid ? {state:'error', text:invalid} : {state:'queued', text:'Queued'});
    });
    renderBulkRows(files, states);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { try { msg('Sign in first'); } catch (_e) {} return {uploaded:0, failed:files.length}; }

    let uploaded = 0, failed = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const invalid = validateMusicFile(file);
      if (invalid) { failed++; continue; }
      updateBulkRow(i, 'uploading', 'Uploading…');
      try {
        const newAsset = await uploadOneMusic(file, user);
        assets = [newAsset, ...assets];
        if (!selectedMusicIds.includes(newAsset.id)) selectedMusicIds.push(newAsset.id);
        uploaded++;
        updateBulkRow(i, 'done', 'Uploaded');
      } catch (e) {
        failed++;
        updateBulkRow(i, 'error', e?.message || 'Upload failed');
      }
    }
    if (el('musicFile')) el('musicFile').value = '';
    try { renderAdminAssets(); } catch (_e) {}
    try { renderSoundEditor(); } catch (_e) {}
    try { await savePreferences(false); } catch (_e) {}
    try { msg(failed ? `${uploaded} track${uploaded===1?'':'s'} uploaded • ${failed} failed` : `${uploaded} music track${uploaded===1?'':'s'} uploaded`); } catch (_e) {}
    return {uploaded, failed};
  }

  function selectedOrderForAdmin() {
    const list = typeof musicAssets === 'function' ? musicAssets() : [];
    const byId = new Map(list.map(a => [a.id, a]));
    selectedMusicIds = selectedMusicIds.filter(id => byId.has(id));
    const selected = selectedMusicIds.map(id => byId.get(id)).filter(Boolean);
    const remaining = list.filter(a => !selectedMusicIds.includes(a.id));
    return {list, selected, remaining};
  }

  function renderAdminMusicLibrary() {
    const host = el('musicAssets');
    if (!host) return;
    const {list, selected, remaining} = selectedOrderForAdmin();
    const all = [...selected, ...remaining];
    const q = adminMusicFilter.trim().toLowerCase();
    const visible = q ? all.filter(a => String(a.name || '').toLowerCase().includes(q)) : all;
    host.innerHTML = `
      <div class="um-admin-tools">
        <input id="adminMusicFilter" type="search" placeholder="Find music…" value="${esc(adminMusicFilter)}" aria-label="Find uploaded music">
        <button type="button" class="mini" data-music-select-all>Select all</button>
        <button type="button" class="mini" data-music-clear>Clear</button>
        <span class="um-count">${selected.length} of ${list.length} published</span>
      </div>
      ${visible.length ? visible.map(a => {
        const selectedIndex = selectedMusicIds.indexOf(a.id);
        const checked = selectedIndex >= 0;
        return `<div class="um-assetrow" data-admin-music-id="${esc(a.id)}">
          <div class="um-assetmain"><input type="checkbox" data-music-select="${esc(a.id)}" ${checked?'checked':''}><span><b>${esc(a.name)}</b><small class="${checked?'um-order':'tiny'}">${checked ? `PUBLISHED • TRACK ${selectedIndex + 1}` : 'LIBRARY ONLY'}</small></span></div>
          <div class="um-asset-actions">
            ${checked ? `<button type="button" class="mini um-orderbtn" data-music-up="${esc(a.id)}" ${selectedIndex===0?'disabled':''}>↑</button><button type="button" class="mini um-orderbtn" data-music-down="${esc(a.id)}" ${selectedIndex===selectedMusicIds.length-1?'disabled':''}>↓</button>` : ''}
            <button type="button" class="mini" data-preview="${esc(a.id)}">Preview</button>
            <button type="button" class="danger" data-del="${esc(a.id)}">Delete</button>
          </div>
        </div>`;
      }).join('') : '<div class="tiny">No matching uploaded music.</div>'}
    `;
    el('adminMusicFilter')?.addEventListener('input', e => { adminMusicFilter = e.target.value; renderAdminMusicLibrary(); });
    host.querySelector('[data-music-select-all]')?.addEventListener('click', async () => {
      selectedMusicIds = list.map(a => a.id);
      renderAdminMusicLibrary();
      try { await savePreferences(false); } catch (_e) {}
    });
    host.querySelector('[data-music-clear]')?.addEventListener('click', async () => {
      selectedMusicIds = [];
      renderAdminMusicLibrary();
      try { await savePreferences(false); } catch (_e) {}
    });
    host.querySelectorAll('[data-music-select]').forEach(c => c.onchange = async () => {
      const id = c.dataset.musicSelect;
      if (c.checked && !selectedMusicIds.includes(id)) selectedMusicIds.push(id);
      if (!c.checked) selectedMusicIds = selectedMusicIds.filter(x => x !== id);
      renderAdminMusicLibrary();
      try { await savePreferences(false); } catch (_e) {}
    });
    host.querySelectorAll('[data-music-up],[data-music-down]').forEach(b => b.onclick = async () => {
      const id = b.dataset.musicUp || b.dataset.musicDown;
      const i = selectedMusicIds.indexOf(id);
      const j = b.dataset.musicUp ? i - 1 : i + 1;
      if (i < 0 || j < 0 || j >= selectedMusicIds.length) return;
      [selectedMusicIds[i], selectedMusicIds[j]] = [selectedMusicIds[j], selectedMusicIds[i]];
      renderAdminMusicLibrary();
      try { await savePreferences(false); } catch (_e) {}
    });
    host.querySelectorAll('[data-preview]').forEach(b => b.onclick = () => previewAsset(b.dataset.preview));
    host.querySelectorAll('[data-del]').forEach(b => b.onclick = () => deleteAsset(b.dataset.del));
  }

  function installAdminBulkUpload() {
    const input = el('musicFile');
    const button = el('uploadMusic');
    if (!input || !button) return;
    input.multiple = true;
    input.setAttribute('multiple', '');
    button.textContent = 'Upload Music Files';
    const field = input.closest('.field') || input.parentElement;
    if (field) {
      const label = field.querySelector('label');
      if (label) label.textContent = 'Audio files';
      if (!el(BULK_DROP_ID)) {
        const drop = document.createElement('div');
        drop.id = BULK_DROP_ID;
        drop.className = 'um-bulk-drop';
        drop.textContent = 'Choose multiple files above, or drop a batch of audio tracks here.';
        field.appendChild(drop);
        ['dragenter','dragover'].forEach(type => drop.addEventListener(type, e => { e.preventDefault(); drop.classList.add('drag'); }));
        ['dragleave','drop'].forEach(type => drop.addEventListener(type, e => { e.preventDefault(); drop.classList.remove('drag'); }));
        drop.addEventListener('drop', e => bulkUploadFiles(e.dataTransfer?.files));
      }
    }
    input.addEventListener('change', () => {
      const files = Array.from(input.files || []);
      if (files.length) renderBulkRows(files);
    });
    button.onclick = () => bulkUploadFiles(input.files);
  }

  function activeLocalTrack() {
    const tracks = localTracks();
    if (!tracks.length) return null;
    if (musicIndex < 0 || musicIndex >= tracks.length) musicIndex = 0;
    return tracks[musicIndex] || null;
  }

  function chooseRandomIndex(current, length) {
    if (length <= 1) return 0;
    let n = current;
    while (n === current) n = Math.floor(Math.random() * length);
    return n;
  }

  function nextLocalIndex(direction = 1) {
    const tracks = localTracks();
    if (!tracks.length) return -1;
    if (localShuffle && direction > 0) return chooseRandomIndex(musicIndex, tracks.length);
    return (musicIndex + direction + tracks.length) % tracks.length;
  }

  function updateLocalProgress() {
    const seek = document.querySelector('[data-local-seek]');
    const current = el('umCurrentTime');
    const total = el('umTotalTime');
    const a = musicAudio;
    const duration = Number(a?.duration);
    const time = Number(a?.currentTime) || 0;
    if (current) current.textContent = fmtTime(time);
    if (total) total.textContent = Number.isFinite(duration) ? fmtTime(duration) : '0:00';
    if (seek && Number.isFinite(duration) && duration > 0 && document.activeElement !== seek) seek.value = String(Math.round((time / duration) * 1000));
  }

  async function handleLocalEnded() {
    const tracks = localTracks();
    if (!tracks.length) return;
    if (localRepeat === 'one') {
      if (musicAudio) musicAudio.currentTime = 0;
      if (localPlaying) {
        try { await musicAudio.play(); } catch (_e) {}
      }
      return;
    }
    if (localRepeat === 'off' && !localShuffle && musicIndex === tracks.length - 1) {
      localPlaying = false;
      renderMusicState();
      renderLocalTracks();
      return;
    }
    musicIndex = nextLocalIndex(1);
    musicAudio = null;
    if (localPlaying) playLocal();
    renderLocalTracks();
  }

  function enhancedEnsureLocalAudio() {
    const tracks = localTracks();
    if (!tracks.length) return null;
    if (musicIndex < 0 || musicIndex >= tracks.length) musicIndex = 0;
    const track = tracks[musicIndex];
    if (!musicAudio || musicAudio.datasetSrc !== track.src) {
      if (musicAudio) { try { musicAudio.pause(); } catch (_e) {} }
      const a = new Audio();
      a.crossOrigin = 'anonymous';
      a.preload = 'metadata';
      a.src = track.src;
      a.datasetSrc = track.src;
      a.onended = handleLocalEnded;
      a.onerror = () => { try { msg('Unable to play uploaded music'); } catch (_e) {} };
      a.ontimeupdate = updateLocalProgress;
      a.onloadedmetadata = updateLocalProgress;
      a.ondurationchange = updateLocalProgress;
      musicAudio = a;
      if (!routeMedia(a, 'music')) a.volume = clamp01(musicVolume) * (announcementActive ? DUCK_FACTOR : 1);
    }
    applyLocalVolume();
    return musicAudio;
  }

  async function enhancedPlayLocal() {
    if (gameState === 'LIVE') { try { msg('Music locked during live play'); } catch (_e) {} return; }
    const a = enhancedEnsureLocalAudio();
    if (!a) { try { msg('No uploaded music in this game'); } catch (_e) {} return; }
    localPlaying = true;
    try {
      await a.play();
    } catch (_e) {
      localPlaying = false;
      try { msg('Tap Play again to allow audio'); } catch (__e) {}
    }
    renderMusicState();
    renderLocalTracks();
  }

  function enhancedPauseLocal(reset = false) {
    localPlaying = false;
    if (musicAudio) {
      try { musicAudio.pause(); } catch (_e) {}
      if (reset) { try { musicAudio.currentTime = 0; } catch (_e) {} }
    }
    renderMusicState();
    renderLocalTracks();
    updateLocalProgress();
  }

  function jumpToLocal(index, autoplay = true) {
    const tracks = localTracks();
    if (!tracks.length) return;
    const i = clamp(index, 0, tracks.length - 1);
    if (musicAudio) { try { musicAudio.pause(); } catch (_e) {} }
    musicIndex = i;
    musicAudio = null;
    setMusicSource('LOCAL');
    if (autoplay) enhancedPlayLocal(); else renderLocalTracks();
  }

  function enhancedNextLocal() {
    const tracks = localTracks();
    if (!tracks.length) { try { msg('No uploaded tracks'); } catch (_e) {} return; }
    const wasPlaying = localPlaying;
    if (musicAudio) { try { musicAudio.pause(); } catch (_e) {} }
    musicIndex = nextLocalIndex(1);
    musicAudio = null;
    if (wasPlaying) enhancedPlayLocal();
    else renderLocalTracks();
    try { msg('Next uploaded track'); } catch (_e) {}
  }

  function previousLocal() {
    const tracks = localTracks();
    if (!tracks.length) return;
    if (musicAudio && Number(musicAudio.currentTime) > 3) {
      musicAudio.currentTime = 0;
      updateLocalProgress();
      return;
    }
    const wasPlaying = localPlaying;
    if (musicAudio) { try { musicAudio.pause(); } catch (_e) {} }
    musicIndex = nextLocalIndex(-1);
    musicAudio = null;
    if (wasPlaying) enhancedPlayLocal();
    else renderLocalTracks();
  }

  function cycleRepeat() {
    localRepeat = localRepeat === 'all' ? 'one' : localRepeat === 'one' ? 'off' : 'all';
    renderLocalTracks();
  }

  function enhancedRenderLocalTracks() {
    const host = el('localTracks');
    if (!host) return;
    const tracks = localTracks();
    const track = activeLocalTrack();
    const q = localSearch.trim().toLowerCase();
    const visible = q ? tracks.map((t, i) => ({t, i})).filter(x => String(x.t.name || '').toLowerCase().includes(q)) : tracks.map((t, i) => ({t, i}));
    const duration = Number(musicAudio?.duration);
    const current = Number(musicAudio?.currentTime) || 0;
    const seekValue = Number.isFinite(duration) && duration > 0 ? Math.round((current / duration) * 1000) : 0;
    host.innerHTML = tracks.length ? `<div class="um-player">
      <div class="um-now">
        <div class="um-now-kicker">Uploaded Music • ${musicIndex + 1} of ${tracks.length}</div>
        <div class="um-now-title">${esc(track?.name || 'Select a track')}</div>
        <div class="um-now-sub">${localPlaying ? 'Playing' : 'Paused'} • ${localShuffle ? 'Shuffle on' : 'Play order'} • Repeat ${localRepeat}</div>
        <div class="um-seek"><input data-local-seek type="range" min="0" max="1000" value="${seekValue}" aria-label="Uploaded music track position"><div class="um-times"><span id="umCurrentTime">${fmtTime(current)}</span><span id="umTotalTime">${Number.isFinite(duration)?fmtTime(duration):'0:00'}</span></div></div>
        <div class="um-controls"><button type="button" data-local-prev aria-label="Previous track">⏮</button><button type="button" class="um-play" data-local-toggle>${localPlaying ? 'Ⅱ PAUSE' : '▶ PLAY'}</button><button type="button" data-local-next aria-label="Next track">⏭</button></div>
        <div class="um-modes"><button type="button" data-local-shuffle class="${localShuffle?'on':''}">⇄ SHUFFLE ${localShuffle?'ON':'OFF'}</button><button type="button" data-local-repeat class="${localRepeat!=='off'?'on':''}">↻ REPEAT ${localRepeat.toUpperCase()}</button></div>
      </div>
      <div class="um-library-head"><div><b>Track Library</b><div class="tiny">Tap any published track to play it immediately.</div></div><input data-local-search type="search" placeholder="Find a track…" value="${esc(localSearch)}" aria-label="Find uploaded track"></div>
      <div class="um-tracklist">${visible.length ? visible.map(({t,i}) => `<div class="um-trackrow ${i===musicIndex?'current':''}" data-local-row="${i}"><span class="um-tracknum">${i+1}</span><span class="um-trackmeta"><b>${esc(t.name)}</b><small>${i===musicIndex ? (localPlaying?'NOW PLAYING':'CURRENT TRACK') : 'UPLOADED MUSIC'}</small></span><button type="button" class="mini" data-play-track="${i}">${i===musicIndex&&localPlaying?'Playing':'Play'}</button></div>`).join('') : '<div class="um-empty">No tracks match your search.</div>'}</div>
    </div>` : '<div class="um-empty">No uploaded tracks are published for this game.</div>';

    host.querySelector('[data-local-toggle]')?.addEventListener('click', () => localPlaying ? enhancedPauseLocal(false) : enhancedPlayLocal());
    host.querySelector('[data-local-prev]')?.addEventListener('click', previousLocal);
    host.querySelector('[data-local-next]')?.addEventListener('click', enhancedNextLocal);
    host.querySelector('[data-local-shuffle]')?.addEventListener('click', () => { localShuffle = !localShuffle; renderLocalTracks(); });
    host.querySelector('[data-local-repeat]')?.addEventListener('click', cycleRepeat);
    host.querySelector('[data-local-search]')?.addEventListener('input', e => { localSearch = e.target.value; renderLocalTracks(); el('localTracks')?.querySelector('[data-local-search]')?.focus(); });
    host.querySelector('[data-local-seek]')?.addEventListener('input', e => {
      if (!musicAudio || !Number.isFinite(Number(musicAudio.duration)) || musicAudio.duration <= 0) return;
      musicAudio.currentTime = (Number(e.target.value) / 1000) * musicAudio.duration;
      updateLocalProgress();
    });
    host.querySelectorAll('[data-play-track]').forEach(b => b.onclick = () => jumpToLocal(Number(b.dataset.playTrack), true));
    updateLocalProgress();
  }

  function installOperatorPlayer() {
    const host = el('localTracks');
    if (!host) return;
    const panel = host.closest('.panel');
    const heading = panel?.querySelector('h2');
    if (heading) heading.textContent = 'Uploaded Music Player & Library';
    const sub = panel?.querySelector('.sub');
    if (sub) sub.textContent = 'Choose any published track, seek, shuffle, repeat, or move through the queue.';

    ensureLocalAudio = enhancedEnsureLocalAudio;
    playLocal = enhancedPlayLocal;
    pauseLocal = enhancedPauseLocal;
    nextLocal = enhancedNextLocal;
    renderLocalTracks = enhancedRenderLocalTracks;

    document.addEventListener('pointerdown', e => {
      if (e.target.closest('[data-local-toggle],[data-local-prev],[data-local-next],[data-play-track],[data-local-seek]')) {
        try { ensureAudioGraph(); } catch (_e) {}
      }
    }, {capture:true});
    renderLocalTracks();
  }

  function installAdminLibrary() {
    if (typeof renderAdminAssets !== 'function') return;
    const baseRenderAdminAssets = renderAdminAssets;
    renderAdminAssets = function() {
      baseRenderAdminAssets();
      renderAdminMusicLibrary();
    };
    renderAdminMusicLibrary();
  }

  injectStyles();
  installOperatorPlayer();
  installAdminLibrary();
  installAdminBulkUpload();
  setTimeout(() => { try { renderLocalTracks(); renderAdminMusicLibrary(); installAdminBulkUpload(); } catch (_e) {} }, 500);
  setTimeout(() => { try { renderLocalTracks(); renderAdminMusicLibrary(); installAdminBulkUpload(); } catch (_e) {} }, 1600);

  window.__gamedayUploadedMusicV1 = {
    bulkUploadFiles,
    renderPlayer: () => renderLocalTracks(),
    playTrack: (i) => jumpToLocal(Number(i), true),
    previous: previousLocal,
    next: enhancedNextLocal,
    state: () => ({
      trackCount: localTracks().length,
      musicIndex,
      localPlaying: !!localPlaying,
      shuffle: localShuffle,
      repeat: localRepeat,
      selectedMusicIds: Array.from(selectedMusicIds || [])
    })
  };
})();