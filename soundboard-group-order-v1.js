(() => {
  const STORAGE_PREFIX = 'gameday.soundboard.groupOrder.v1:';
  const defaultsByKey = new Map();
  let editing = false;
  let applying = false;
  let scheduled = false;

  const el = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function gameKey() {
    let slug = '';
    try { slug = String(currentGame?.slug || '').trim(); } catch (_e) {}
    if (!slug) {
      try { slug = new URLSearchParams(location.search).get('game') || ''; } catch (_e) {}
    }
    return STORAGE_PREFIX + (slug || 'default');
  }

  function host() { return el('gdGroupedSoundboard'); }
  function nav() { return host()?.querySelector('.gd-group-nav') || null; }
  function stack() { return host()?.querySelector('.gd-group-stack') || null; }

  function visibleGroups() {
    const n = nav();
    if (!n) return [];
    return Array.from(n.querySelectorAll('[data-group-filter]'))
      .map(node => String(node.dataset.groupFilter || '').trim())
      .filter(group => group && group !== 'ALL');
  }

  function publishedOrder(groups = visibleGroups()) {
    const current = Array.from(new Set(groups));
    const found = [];
    try {
      const infer = window.__gamedaySoundboardGroupsV1?.inferGroup;
      const items = typeof activeSoundboard === 'function' ? activeSoundboard() : [];
      for (const item of items) {
        const group = String((typeof infer === 'function' ? infer(item) : item?.group) || '').trim();
        if (group && current.includes(group) && !found.includes(group)) found.push(group);
      }
    } catch (_e) {}
    return [...found, ...current.filter(group => !found.includes(group))];
  }

  function readSavedOrder() {
    try {
      const value = JSON.parse(localStorage.getItem(gameKey()) || 'null');
      return Array.isArray(value) ? value.map(v => String(v || '').trim()).filter(Boolean) : [];
    } catch (_e) { return []; }
  }

  function saveOrder(order) {
    try { localStorage.setItem(gameKey(), JSON.stringify(order)); } catch (_e) {}
  }

  function reconciledOrder(groups = visibleGroups()) {
    const current = Array.from(new Set(groups));
    if (!current.length) return [];
    const base = publishedOrder(current);
    const saved = readSavedOrder().filter(group => current.includes(group));
    return saved.length ? [...saved, ...base.filter(group => !saved.includes(group))] : base;
  }

  function captureDefault(groups) {
    const key = gameKey();
    if (!defaultsByKey.has(key) && groups.length) defaultsByKey.set(key, groups.slice());
  }

  function sameOrder(a, b) {
    return a.length === b.length && a.every((value, index) => value === b[index]);
  }

  function reorderNav(order) {
    const n = nav();
    if (!n) return;
    const chips = new Map(Array.from(n.querySelectorAll('[data-group-filter]')).map(node => [node.dataset.groupFilter, node]));
    const current = visibleGroups();
    if (sameOrder(current, order)) return;
    order.forEach(group => { const node = chips.get(group); if (node) n.appendChild(node); });
  }

  function reorderSections(order) {
    const s = stack();
    if (!s) return;
    const sections = Array.from(s.querySelectorAll('[data-group-section]'));
    if (sections.length < 2) return;
    const byGroup = new Map(sections.map(node => [node.dataset.groupSection, node]));
    const current = sections.map(node => node.dataset.groupSection);
    const desired = order.filter(group => byGroup.has(group));
    if (sameOrder(current, desired)) return;
    desired.forEach(group => s.appendChild(byGroup.get(group)));
  }

  function ensureToolbar(order) {
    const h = host();
    const n = nav();
    if (!h || !n || order.length < 2) {
      el('gdGroupOrderBar')?.remove();
      el('gdGroupOrderEditor')?.remove();
      return;
    }
    let bar = el('gdGroupOrderBar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'gdGroupOrderBar';
      bar.className = 'gd-group-order-bar';
      n.before(bar);
    }
    const snapshot = `${editing}|${order.join('\u0001')}`;
    if (bar.dataset.snapshot !== snapshot) {
      bar.dataset.snapshot = snapshot;
      bar.innerHTML = `<div><b>Soundboard Groups</b><small>Arrange categories for this device.</small></div><button type="button" data-group-order-toggle>${editing?'DONE':'⇅ REORDER GROUPS'}</button>`;
      bar.querySelector('[data-group-order-toggle]')?.addEventListener('click', () => {
        editing = !editing;
        applyOrder();
      });
    }
    if (editing) renderEditor(order); else el('gdGroupOrderEditor')?.remove();
  }

  function renderEditor(order) {
    const bar = el('gdGroupOrderBar');
    if (!bar) return;
    let editor = el('gdGroupOrderEditor');
    if (!editor) {
      editor = document.createElement('div');
      editor.id = 'gdGroupOrderEditor';
      editor.className = 'gd-group-order-editor';
      bar.insertAdjacentElement('afterend', editor);
    }
    const snapshot = order.join('\u0001');
    if (editor.dataset.snapshot === snapshot) return;
    editor.dataset.snapshot = snapshot;
    editor.innerHTML = `<div class="gd-group-order-help">Move the categories you use most toward the top. Changes save automatically on this device.</div><div class="gd-group-order-list">${order.map((group,index) => `<div class="gd-group-order-row" data-order-group="${esc(group)}"><span><b>${index+1}</b>${esc(group)}</span><div><button type="button" data-order-up="${esc(group)}" aria-label="Move ${esc(group)} up" ${index===0?'disabled':''}>↑</button><button type="button" data-order-down="${esc(group)}" aria-label="Move ${esc(group)} down" ${index===order.length-1?'disabled':''}>↓</button></div></div>`).join('')}</div><button type="button" class="gd-group-order-reset" data-order-reset>RESET GROUP ORDER</button>`;
    editor.querySelectorAll('[data-order-up],[data-order-down]').forEach(button => button.addEventListener('click', () => {
      const group = button.dataset.orderUp || button.dataset.orderDown;
      move(group, button.dataset.orderUp ? -1 : 1);
    }));
    editor.querySelector('[data-order-reset]')?.addEventListener('click', resetOrder);
  }

  function applySpecificOrder(order) {
    applying = true;
    try {
      reorderNav(order);
      reorderSections(order);
      ensureToolbar(order);
    } finally { applying = false; }
  }

  function applyOrder() {
    const groups = visibleGroups();
    if (!groups.length) return;
    captureDefault(publishedOrder(groups));
    const order = reconciledOrder(groups);
    applySpecificOrder(order);
  }

  function move(group, delta) {
    const order = reconciledOrder();
    const index = order.indexOf(group);
    const target = index + Number(delta || 0);
    if (index < 0 || target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];
    saveOrder(order);
    applySpecificOrder(order);
    const editor = el('gdGroupOrderEditor');
    if (editor) editor.dataset.snapshot = '';
    renderEditor(order);
  }

  function resetOrder() {
    try { localStorage.removeItem(gameKey()); } catch (_e) {}
    const current = visibleGroups();
    const order = publishedOrder(current);
    defaultsByKey.set(gameKey(), order.slice());
    applySpecificOrder(order);
    const editor = el('gdGroupOrderEditor');
    if (editor) editor.dataset.snapshot = '';
    renderEditor(order);
  }

  function injectStyles() {
    if (el('soundboardGroupOrderV1Styles')) return;
    const style = document.createElement('style');
    style.id = 'soundboardGroupOrderV1Styles';
    style.textContent = `
      .gd-group-order-bar{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:4px 0 8px;padding:9px 10px;border:1px solid #2c3745;border-radius:12px;background:#0e141c}.gd-group-order-bar>div{display:grid;gap:2px}.gd-group-order-bar b{font-size:10px}.gd-group-order-bar small{font-size:8px;color:#8291a4}.gd-group-order-bar button{min-height:40px;border:1px solid #405066;border-radius:10px;background:#17202b;color:#fff;padding:0 12px;font-size:9px;font-weight:900}.gd-group-order-editor{display:grid;gap:8px;margin:0 0 10px;padding:10px;border:1px solid #344154;border-radius:13px;background:#0b1118}.gd-group-order-help{font-size:8px;line-height:1.4;color:#91a0b5}.gd-group-order-list{display:grid;gap:6px}.gd-group-order-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;padding:7px 8px;border:1px solid #293544;border-radius:10px;background:#111821}.gd-group-order-row>span{display:flex;align-items:center;gap:8px;min-width:0;font-size:10px;font-weight:850}.gd-group-order-row>span>b{display:grid;place-items:center;width:24px;height:24px;border-radius:7px;background:#1d2835;color:#9fafc2;font-size:8px}.gd-group-order-row>div{display:flex;gap:5px}.gd-group-order-row button{width:44px;min-height:42px;border:1px solid #405066;border-radius:9px;background:#17202b;color:#fff;font-size:18px;font-weight:900}.gd-group-order-row button:disabled{opacity:.28}.gd-group-order-reset{min-height:40px;border:1px solid #65404a;border-radius:10px;background:#24151a;color:#ffb2bd;font-size:9px;font-weight:900}@media(max-width:560px){.gd-group-order-bar{align-items:stretch;flex-direction:column}.gd-group-order-bar button{width:100%;min-height:46px}.gd-group-order-row button{width:48px;min-height:46px}}
    `;
    document.head.appendChild(style);
  }

  function scheduleApply() {
    if (applying || scheduled) return;
    scheduled = true;
    setTimeout(() => { scheduled = false; applyOrder(); }, 0);
  }

  injectStyles();
  applyOrder();
  const observer = new MutationObserver(scheduleApply);
  observer.observe(document.body, { childList:true, subtree:true });
  setTimeout(applyOrder, 250);
  setTimeout(applyOrder, 900);

  window.__gamedayGroupOrderV1 = {
    apply: applyOrder,
    move,
    reset: resetOrder,
    publishedOrder,
    state: () => ({ key: gameKey(), editing, order: reconciledOrder(), publishedOrder: publishedOrder() })
  };
})();