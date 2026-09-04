(() => {
  const el = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const COLLAPSE_KEY = 'gameday.admin.soundboard.collapsed.v1';
  let dragState = null;
  let collapsedGroups = new Set();

  try {
    const saved = JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '[]');
    if (Array.isArray(saved)) collapsedGroups = new Set(saved.map(v => String(v || '').trim()).filter(Boolean));
  } catch (_e) {}

  function saveCollapsed() {
    try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(Array.from(collapsedGroups))); } catch (_e) {}
  }

  function itemGroup(item) {
    try { return String(inferAdminSoundGroup(item) || 'Other').trim() || 'Other'; }
    catch (_e) { return String(item?.group || 'Other').trim() || 'Other'; }
  }

  function orderedGroupNames() {
    const groups = [];
    for (const item of soundboardDraft) {
      const group = itemGroup(item);
      if (!groups.includes(group)) groups.push(group);
    }
    return groups;
  }

  function normalizeDraftOrder(groupOrder = orderedGroupNames()) {
    const order = Array.from(new Set(groupOrder));
    const buckets = new Map(order.map(group => [group, []]));
    for (const item of soundboardDraft) {
      const group = itemGroup(item);
      item.group = group;
      if (!buckets.has(group)) { buckets.set(group, []); order.push(group); }
      buckets.get(group).push(item);
    }
    soundboardDraft = order.flatMap(group => buckets.get(group) || []);
  }

  function syncCardValues(card, item, readGroup = true) {
    if (!card || !item) return;
    item.label = card.querySelector('[data-f="label"]')?.value.trim() || 'Untitled';
    item.eyebrow = card.querySelector('[data-f="eyebrow"]')?.value.trim() || 'SOUND';
    item.kind = card.querySelector('[data-f="kind"]')?.value === 'effect' ? 'effect' : 'announcement';
    item.icon = card.querySelector('[data-f="icon"]')?.value || '';
    item.color = card.querySelector('[data-f="color"]')?.value || 'slate';
    if (readGroup) item.group = card.querySelector('[data-f="group"]')?.value.trim() || itemGroup(item);
    item.assetId = card.querySelector('[data-f="asset"]')?.value || '';
    item.speechText = card.querySelector('[data-f="speech"]')?.value.trim() || '';
  }

  function syncEditorValues(skipGroupId = '') {
    document.querySelectorAll('#soundEditor .editor-card[data-item]').forEach(card => {
      const id = card.dataset.item;
      const item = soundboardDraft.find(x => x.id === id);
      syncCardValues(card, item, id !== skipGroupId);
    });
  }

  function collectHierarchicalEditor() {
    syncEditorValues();
    normalizeDraftOrder();
  }

  function moveGroup(group, delta) {
    collectHierarchicalEditor();
    const groups = orderedGroupNames();
    const from = groups.indexOf(group);
    const to = from + Number(delta || 0);
    if (from < 0 || to < 0 || to >= groups.length) return;
    [groups[from], groups[to]] = [groups[to], groups[from]];
    normalizeDraftOrder(groups);
    renderHierarchicalEditor();
  }

  function moveGroupTo(sourceGroup, targetGroup, after = false) {
    collectHierarchicalEditor();
    if (!sourceGroup || !targetGroup || sourceGroup === targetGroup) return;
    const groups = orderedGroupNames();
    const from = groups.indexOf(sourceGroup);
    if (from < 0 || !groups.includes(targetGroup)) return;
    groups.splice(from, 1);
    let to = groups.indexOf(targetGroup);
    if (to < 0) return;
    if (after) to += 1;
    groups.splice(to, 0, sourceGroup);
    normalizeDraftOrder(groups);
    renderHierarchicalEditor();
  }

  function relocateItem(id, targetGroup, targetId = '', after = false) {
    const item = soundboardDraft.find(x => x.id === id);
    if (!item) return;
    const sourceGroup = itemGroup(item);
    const cleanTarget = String(targetGroup || '').trim() || sourceGroup || 'Other';
    const originalGroups = orderedGroupNames();
    const remaining = soundboardDraft.filter(x => x.id !== id);
    const sourceStillExists = remaining.some(x => itemGroup(x) === sourceGroup);
    let groupOrder = originalGroups.filter(group => group !== sourceGroup || sourceStillExists);
    if (!groupOrder.includes(cleanTarget)) {
      const sourceIndex = originalGroups.indexOf(sourceGroup);
      if (!sourceStillExists && sourceIndex >= 0) groupOrder.splice(Math.min(sourceIndex, groupOrder.length), 0, cleanTarget);
      else groupOrder.push(cleanTarget);
    }

    item.group = cleanTarget;
    const buckets = new Map(groupOrder.map(group => [group, remaining.filter(x => itemGroup(x) === group)]));
    if (!buckets.has(cleanTarget)) { buckets.set(cleanTarget, []); groupOrder.push(cleanTarget); }
    const members = buckets.get(cleanTarget);
    let at = targetId ? members.findIndex(x => x.id === targetId) : -1;
    if (at < 0) at = members.length;
    else if (after) at += 1;
    members.splice(at, 0, item);
    soundboardDraft = groupOrder.flatMap(group => buckets.get(group) || []);
  }

  function moveItemWithinGroup(id, delta) {
    collectHierarchicalEditor();
    const item = soundboardDraft.find(x => x.id === id);
    if (!item) return;
    const group = itemGroup(item);
    const members = soundboardDraft.filter(x => itemGroup(x) === group);
    const from = members.findIndex(x => x.id === id);
    const to = from + Number(delta || 0);
    if (from < 0 || to < 0 || to >= members.length) return;
    const target = members[to];
    relocateItem(id, group, target.id, delta > 0);
    renderHierarchicalEditor();
  }

  function moveItemTo(id, targetGroup, targetId = '', after = false) {
    collectHierarchicalEditor();
    relocateItem(id, targetGroup, targetId, after);
    renderHierarchicalEditor();
  }

  function reassignItemGroup(id, newGroup) {
    const item = soundboardDraft.find(x => x.id === id);
    if (!item) return;
    syncEditorValues(id);
    const target = String(newGroup || '').trim() || itemGroup(item);
    relocateItem(id, target);
    collapsedGroups.delete(target);
    saveCollapsed();
    renderHierarchicalEditor();
  }

  function toggleGroup(group) {
    collectHierarchicalEditor();
    if (collapsedGroups.has(group)) collapsedGroups.delete(group); else collapsedGroups.add(group);
    saveCollapsed();
    renderHierarchicalEditor();
  }

  function renderItemCard(raw, index, count, soundOptions) {
    const item = normalizeSoundItem(raw);
    const group = itemGroup(item);
    const iconOptions = effectIcons.map(([value,label]) => `<option value="${esc(value)}" ${item.icon===value?'selected':''}>${value?value+' ':''}${esc(label)}</option>`).join('');
    const assetOptions = soundOptions.replace(`value="${item.assetId}"`, `value="${item.assetId}" selected`);
    return `<div class="editor-card gd-admin-sound-item" data-item="${esc(item.id)}" data-rendered-group="${esc(group)}">
      <div class="gd-admin-item-order"><span>ANNOUNCEMENT ${index+1} OF ${count}</span><div><button type="button" class="gd-admin-drag-handle" draggable="true" data-item-drag="${esc(item.id)}" aria-label="Drag ${esc(item.label)}">☰ Drag</button><button type="button" class="mini" data-item-move="up" ${index===0?'disabled':''}>↑ In Group</button><button type="button" class="mini" data-item-move="down" ${index===count-1?'disabled':''}>↓ In Group</button></div></div>
      <div class="editor-top"><input data-f="label" value="${esc(item.label)}" aria-label="Button label"><input data-f="eyebrow" value="${esc(item.eyebrow)}" aria-label="Button eyebrow"><input data-f="group" list="soundGroupOptions" value="${esc(group)}" placeholder="Group" aria-label="Announcement group"><select data-f="kind" aria-label="Soundboard section"><option value="announcement" ${item.kind==='announcement'?'selected':''}>Game Announcement</option><option value="effect" ${item.kind==='effect'?'selected':''}>Sound Effect</option></select><select data-f="icon" aria-label="Sound effect icon">${iconOptions}</select><select data-f="color" aria-label="Color">${Object.keys(palette).map(c=>`<option value="${c}" ${item.color===c?'selected':''}>${c}</option>`).join('')}</select></div>
      <div class="editor-mid"><select data-f="asset"><option value="">Device voice fallback</option>${assetOptions}</select><textarea data-f="speech" placeholder="Fallback announcement text (optional for sound effects)">${esc(item.speechText)}</textarea></div>
      <div class="editor-tools"><button class="danger" data-remove>Delete Button</button></div>
    </div>`;
  }

  function clearDropClasses() {
    document.querySelectorAll('.gd-drop-before,.gd-drop-after,.gd-drop-group').forEach(node => node.classList.remove('gd-drop-before','gd-drop-after','gd-drop-group'));
  }

  function wireDragAndDrop(host) {
    host.querySelectorAll('[data-group-drag]').forEach(handle => {
      handle.addEventListener('dragstart', e => {
        dragState = { type:'group', group:handle.dataset.groupDrag };
        e.dataTransfer?.setData('text/plain', 'group:' + handle.dataset.groupDrag);
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
        handle.closest('[data-admin-group]')?.classList.add('gd-dragging');
      });
      handle.addEventListener('dragend', () => { dragState = null; clearDropClasses(); document.querySelectorAll('.gd-dragging').forEach(x=>x.classList.remove('gd-dragging')); });
    });

    host.querySelectorAll('[data-item-drag]').forEach(handle => {
      handle.addEventListener('dragstart', e => {
        e.stopPropagation();
        dragState = { type:'item', id:handle.dataset.itemDrag };
        e.dataTransfer?.setData('text/plain', 'item:' + handle.dataset.itemDrag);
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
        handle.closest('[data-item]')?.classList.add('gd-dragging');
      });
      handle.addEventListener('dragend', () => { dragState = null; clearDropClasses(); document.querySelectorAll('.gd-dragging').forEach(x=>x.classList.remove('gd-dragging')); });
    });

    host.querySelectorAll('[data-item]').forEach(card => {
      card.addEventListener('dragover', e => {
        if (dragState?.type !== 'item' || dragState.id === card.dataset.item) return;
        e.preventDefault(); e.stopPropagation(); clearDropClasses();
        const rect = card.getBoundingClientRect();
        card.classList.add(e.clientY > rect.top + rect.height / 2 ? 'gd-drop-after' : 'gd-drop-before');
      });
      card.addEventListener('drop', e => {
        if (dragState?.type !== 'item' || dragState.id === card.dataset.item) return;
        e.preventDefault(); e.stopPropagation();
        const section = card.closest('[data-admin-group]');
        const rect = card.getBoundingClientRect();
        const after = e.clientY > rect.top + rect.height / 2;
        const source = dragState.id;
        dragState = null; clearDropClasses();
        moveItemTo(source, section?.dataset.adminGroup || 'Other', card.dataset.item, after);
      });
    });

    host.querySelectorAll('[data-admin-group]').forEach(section => {
      section.addEventListener('dragover', e => {
        if (!dragState) return;
        if (dragState.type === 'item' && e.target.closest('[data-item]')) return;
        e.preventDefault(); clearDropClasses();
        const rect = section.getBoundingClientRect();
        if (dragState.type === 'group') section.classList.add(e.clientY > rect.top + rect.height / 2 ? 'gd-drop-after' : 'gd-drop-before');
        else section.classList.add('gd-drop-group');
      });
      section.addEventListener('drop', e => {
        if (!dragState) return;
        if (dragState.type === 'item' && e.target.closest('[data-item]')) return;
        e.preventDefault();
        const targetGroup = section.dataset.adminGroup;
        const rect = section.getBoundingClientRect();
        const state = dragState;
        dragState = null; clearDropClasses();
        if (state.type === 'group') moveGroupTo(state.group, targetGroup, e.clientY > rect.top + rect.height / 2);
        else moveItemTo(state.id, targetGroup);
      });
    });
  }

  function renderHierarchicalEditor() {
    const host = el('soundEditor');
    if (!host) return;
    normalizeDraftOrder();
    const groups = orderedGroupNames();
    const soundOptions = soundAssets().map(a => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('');
    const groupOptions = soundGroupPresets.map(group => `<option value="${esc(group)}"></option>`).join('');
    host.innerHTML = `<datalist id="soundGroupOptions">${groupOptions}</datalist><div class="gd-admin-group-help"><b>Arrange the Soundboard visually.</b> Drag groups or announcements with the ☰ handles, use the arrow buttons as a fallback, and collapse groups you are not editing. Changing an announcement's Group field moves it into that group immediately.</div>` + groups.map((group, groupIndex) => {
      const members = soundboardDraft.filter(item => itemGroup(item) === group);
      const collapsed = collapsedGroups.has(group);
      return `<section class="gd-admin-sound-group ${collapsed?'is-collapsed':''}" data-admin-group="${esc(group)}"><header><div class="gd-admin-group-title"><span>GROUP ${groupIndex+1} OF ${groups.length}</span><h3>${esc(group)}</h3><small>${members.length} soundboard button${members.length===1?'':'s'}</small></div><div class="gd-admin-group-actions"><button type="button" class="gd-admin-drag-handle" draggable="true" data-group-drag="${esc(group)}" aria-label="Drag group ${esc(group)}">☰ Drag Group</button><button type="button" class="mini" data-collapse-group aria-expanded="${collapsed?'false':'true'}">${collapsed?'▸ Expand':'▾ Collapse'}</button><button type="button" class="mini" data-group-move="up" ${groupIndex===0?'disabled':''}>↑ Group</button><button type="button" class="mini" data-group-move="down" ${groupIndex===groups.length-1?'disabled':''}>↓ Group</button></div></header><div class="gd-admin-group-items" ${collapsed?'hidden':''}>${members.map((item,index)=>renderItemCard(item,index,members.length,soundOptions)).join('')}</div></section>`;
    }).join('');

    host.querySelectorAll('[data-remove]').forEach(button => button.onclick = () => {
      collectHierarchicalEditor();
      const id = button.closest('[data-item]')?.dataset.item;
      soundboardDraft = soundboardDraft.filter(item => item.id !== id);
      renderHierarchicalEditor();
    });
    host.querySelectorAll('[data-collapse-group]').forEach(button => button.onclick = () => {
      const group = button.closest('[data-admin-group]')?.dataset.adminGroup;
      if (group) toggleGroup(group);
    });
    host.querySelectorAll('[data-group-move]').forEach(button => button.onclick = () => {
      const group = button.closest('[data-admin-group]')?.dataset.adminGroup;
      moveGroup(group, button.dataset.groupMove === 'up' ? -1 : 1);
    });
    host.querySelectorAll('[data-item-move]').forEach(button => button.onclick = () => {
      const id = button.closest('[data-item]')?.dataset.item;
      moveItemWithinGroup(id, button.dataset.itemMove === 'up' ? -1 : 1);
    });
    host.querySelectorAll('[data-f="group"]').forEach(input => input.addEventListener('change', () => {
      const id = input.closest('[data-item]')?.dataset.item;
      if (id) reassignItemGroup(id, input.value);
    }));
    wireDragAndDrop(host);
  }

  function injectStyles() {
    if (el('adminSoundboardOrderV1Styles')) return;
    const style = document.createElement('style');
    style.id = 'adminSoundboardOrderV1Styles';
    style.textContent = `.gd-admin-group-help{margin:0 0 10px;padding:10px 11px;border:1px solid #304052;border-radius:12px;background:#0d141c;color:#9cabbd;font-size:9px;line-height:1.45}.gd-admin-group-help b{color:#dce6f2}.gd-admin-sound-group{margin:0 0 13px;padding:11px;border:1px solid #344154;border-radius:15px;background:#0c1219;transition:border-color .12s,opacity .12s}.gd-admin-sound-group>header{display:flex;align-items:center;justify-content:space-between;gap:10px;padding-bottom:9px}.gd-admin-sound-group:not(.is-collapsed)>header{margin-bottom:9px;border-bottom:1px solid #283544}.gd-admin-group-title span{display:block;font-size:8px;color:#6fdfaa;font-weight:900;letter-spacing:.08em}.gd-admin-group-title h3{margin:2px 0;font-size:15px}.gd-admin-group-title small{font-size:8px;color:#8493a6}.gd-admin-group-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:6px}.gd-admin-group-actions button{min-height:40px}.gd-admin-group-items{display:grid;gap:8px}.gd-admin-sound-item{margin:0}.gd-admin-item-order{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}.gd-admin-item-order>span{font-size:8px;color:#8190a3;font-weight:900;letter-spacing:.06em}.gd-admin-item-order>div{display:flex;flex-wrap:wrap;gap:5px}.gd-admin-item-order button{min-height:38px}.gd-admin-drag-handle{border:1px dashed #4b617b;border-radius:9px;background:#111c28;color:#a9bdd2;padding:0 10px;font-size:9px;font-weight:900;cursor:grab;touch-action:none}.gd-admin-drag-handle:active{cursor:grabbing}.gd-dragging{opacity:.45}.gd-drop-before{box-shadow:inset 0 4px 0 #69d8a1}.gd-drop-after{box-shadow:inset 0 -4px 0 #69d8a1}.gd-drop-group{border-color:#69d8a1!important;box-shadow:0 0 0 2px rgba(105,216,161,.18)}@media(max-width:720px){.gd-admin-sound-group>header,.gd-admin-item-order{align-items:stretch;flex-direction:column}.gd-admin-group-actions,.gd-admin-item-order>div{display:grid;grid-template-columns:1fr 1fr}.gd-admin-group-actions button,.gd-admin-item-order button{min-height:46px}.gd-admin-drag-handle{min-height:46px}}`;
    document.head.appendChild(style);
  }

  injectStyles();
  try { collectSoundEditor = collectHierarchicalEditor; } catch (_e) {}
  try { renderSoundEditor = renderHierarchicalEditor; } catch (_e) {}
  try { renderHierarchicalEditor(); } catch (_e) {}

  window.__gamedayAdminSoundboardOrderV1 = {
    render: renderHierarchicalEditor,
    collect: collectHierarchicalEditor,
    moveGroup,
    moveGroupTo,
    moveItemWithinGroup,
    moveItemTo,
    reassignItemGroup,
    toggleGroup,
    state: () => ({groups: orderedGroupNames(), collapsed:Array.from(collapsedGroups), items: soundboardDraft.map(item => ({id:item.id,group:itemGroup(item)}))})
  };
})();
