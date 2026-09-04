(() => {
  const el = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

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
    const buckets = new Map(groupOrder.map(group => [group, []]));
    for (const item of soundboardDraft) {
      const group = itemGroup(item);
      item.group = group;
      if (!buckets.has(group)) { buckets.set(group, []); groupOrder.push(group); }
      buckets.get(group).push(item);
    }
    soundboardDraft = groupOrder.flatMap(group => buckets.get(group) || []);
  }

  function collectHierarchicalEditor() {
    document.querySelectorAll('#soundEditor .editor-card[data-item]').forEach(card => {
      const id = card.dataset.item;
      const item = soundboardDraft.find(x => x.id === id);
      if (!item) return;
      item.label = card.querySelector('[data-f="label"]')?.value.trim() || 'Untitled';
      item.eyebrow = card.querySelector('[data-f="eyebrow"]')?.value.trim() || 'SOUND';
      item.kind = card.querySelector('[data-f="kind"]')?.value === 'effect' ? 'effect' : 'announcement';
      item.icon = card.querySelector('[data-f="icon"]')?.value || '';
      item.color = card.querySelector('[data-f="color"]')?.value || 'slate';
      item.group = card.querySelector('[data-f="group"]')?.value.trim() || itemGroup(item);
      item.assetId = card.querySelector('[data-f="asset"]')?.value || '';
      item.speechText = card.querySelector('[data-f="speech"]')?.value.trim() || '';
    });
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

  function moveItemWithinGroup(id, delta) {
    collectHierarchicalEditor();
    const item = soundboardDraft.find(x => x.id === id);
    if (!item) return;
    const group = itemGroup(item);
    const members = soundboardDraft.filter(x => itemGroup(x) === group);
    const from = members.findIndex(x => x.id === id);
    const to = from + Number(delta || 0);
    if (from < 0 || to < 0 || to >= members.length) return;
    [members[from], members[to]] = [members[to], members[from]];
    const groups = orderedGroupNames();
    const replacements = new Map([[group, members]]);
    const buckets = new Map(groups.map(g => [g, replacements.get(g) || soundboardDraft.filter(x => itemGroup(x) === g)]));
    soundboardDraft = groups.flatMap(g => buckets.get(g) || []);
    renderHierarchicalEditor();
  }

  function renderItemCard(raw, index, count, soundOptions) {
    const item = normalizeSoundItem(raw);
    const group = itemGroup(item);
    const iconOptions = effectIcons.map(([value,label]) => `<option value="${esc(value)}" ${item.icon===value?'selected':''}>${value?value+' ':''}${esc(label)}</option>`).join('');
    const assetOptions = soundOptions.replace(`value="${item.assetId}"`, `value="${item.assetId}" selected`);
    return `<div class="editor-card gd-admin-sound-item" data-item="${esc(item.id)}">
      <div class="gd-admin-item-order"><span>ANNOUNCEMENT ${index+1} OF ${count}</span><div><button type="button" class="mini" data-item-move="up" ${index===0?'disabled':''}>↑ In Group</button><button type="button" class="mini" data-item-move="down" ${index===count-1?'disabled':''}>↓ In Group</button></div></div>
      <div class="editor-top"><input data-f="label" value="${esc(item.label)}" aria-label="Button label"><input data-f="eyebrow" value="${esc(item.eyebrow)}" aria-label="Button eyebrow"><input data-f="group" list="soundGroupOptions" value="${esc(group)}" placeholder="Group" aria-label="Announcement group"><select data-f="kind" aria-label="Soundboard section"><option value="announcement" ${item.kind==='announcement'?'selected':''}>Game Announcement</option><option value="effect" ${item.kind==='effect'?'selected':''}>Sound Effect</option></select><select data-f="icon" aria-label="Sound effect icon">${iconOptions}</select><select data-f="color" aria-label="Color">${Object.keys(palette).map(c=>`<option value="${c}" ${item.color===c?'selected':''}>${c}</option>`).join('')}</select></div>
      <div class="editor-mid"><select data-f="asset"><option value="">Device voice fallback</option>${assetOptions}</select><textarea data-f="speech" placeholder="Fallback announcement text (optional for sound effects)">${esc(item.speechText)}</textarea></div>
      <div class="editor-tools"><button class="danger" data-remove>Delete Button</button></div>
    </div>`;
  }

  function renderHierarchicalEditor() {
    const host = el('soundEditor');
    if (!host) return;
    normalizeDraftOrder();
    const groups = orderedGroupNames();
    const soundOptions = soundAssets().map(a => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('');
    const groupOptions = soundGroupPresets.map(group => `<option value="${esc(group)}"></option>`).join('');
    host.innerHTML = `<datalist id="soundGroupOptions">${groupOptions}</datalist><div class="gd-admin-group-help">Arrange entire Soundboard groups first, then arrange announcements and effects inside each group. This order becomes the default Game Day Soundboard after publishing.</div>` + groups.map((group, groupIndex) => {
      const members = soundboardDraft.filter(item => itemGroup(item) === group);
      return `<section class="gd-admin-sound-group" data-admin-group="${esc(group)}"><header><div><span>GROUP ${groupIndex+1} OF ${groups.length}</span><h3>${esc(group)}</h3><small>${members.length} soundboard button${members.length===1?'':'s'}</small></div><div class="gd-admin-group-actions"><button type="button" class="mini" data-group-move="up" ${groupIndex===0?'disabled':''}>↑ Move Group</button><button type="button" class="mini" data-group-move="down" ${groupIndex===groups.length-1?'disabled':''}>↓ Move Group</button></div></header><div class="gd-admin-group-items">${members.map((item,index)=>renderItemCard(item,index,members.length,soundOptions)).join('')}</div></section>`;
    }).join('');

    host.querySelectorAll('[data-remove]').forEach(button => button.onclick = () => {
      collectHierarchicalEditor();
      const id = button.closest('[data-item]')?.dataset.item;
      soundboardDraft = soundboardDraft.filter(item => item.id !== id);
      renderHierarchicalEditor();
    });
    host.querySelectorAll('[data-group-move]').forEach(button => button.onclick = () => {
      const group = button.closest('[data-admin-group]')?.dataset.adminGroup;
      moveGroup(group, button.dataset.groupMove === 'up' ? -1 : 1);
    });
    host.querySelectorAll('[data-item-move]').forEach(button => button.onclick = () => {
      const id = button.closest('[data-item]')?.dataset.item;
      moveItemWithinGroup(id, button.dataset.itemMove === 'up' ? -1 : 1);
    });
  }

  function injectStyles() {
    if (el('adminSoundboardOrderV1Styles')) return;
    const style = document.createElement('style');
    style.id = 'adminSoundboardOrderV1Styles';
    style.textContent = `.gd-admin-group-help{margin:0 0 10px;padding:10px 11px;border:1px solid #304052;border-radius:12px;background:#0d141c;color:#9cabbd;font-size:9px;line-height:1.45}.gd-admin-sound-group{margin:0 0 13px;padding:11px;border:1px solid #344154;border-radius:15px;background:#0c1219}.gd-admin-sound-group>header{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:9px;padding-bottom:9px;border-bottom:1px solid #283544}.gd-admin-sound-group>header span{display:block;font-size:8px;color:#6fdfaa;font-weight:900;letter-spacing:.08em}.gd-admin-sound-group>header h3{margin:2px 0;font-size:15px}.gd-admin-sound-group>header small{font-size:8px;color:#8493a6}.gd-admin-group-actions{display:flex;gap:6px}.gd-admin-group-actions button{min-height:40px}.gd-admin-group-items{display:grid;gap:8px}.gd-admin-sound-item{margin:0}.gd-admin-item-order{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}.gd-admin-item-order>span{font-size:8px;color:#8190a3;font-weight:900;letter-spacing:.06em}.gd-admin-item-order>div{display:flex;gap:5px}.gd-admin-item-order button{min-height:38px}@media(max-width:720px){.gd-admin-sound-group>header,.gd-admin-item-order{align-items:stretch;flex-direction:column}.gd-admin-group-actions,.gd-admin-item-order>div{display:grid;grid-template-columns:1fr 1fr}.gd-admin-group-actions button,.gd-admin-item-order button{min-height:46px}}`;
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
    moveItemWithinGroup,
    state: () => ({groups: orderedGroupNames(), items: soundboardDraft.map(item => ({id:item.id,group:itemGroup(item)}))})
  };
})();