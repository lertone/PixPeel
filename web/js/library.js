/* PixPeel 网页版：元素库
 * 元素按账号暂存在 IndexedDB；支持多选、下载、删除、送去画板。 */
(function () {
  const $ = (id) => document.getElementById(id);
  const L = {
    items: [], urls: new Map(), sel: new Set(),
    selectMode: false, query: '', mode: 'lib', loaded: false
  };

  let grid, empty, countEl, metaEl, searchEl, selTools, selCount, dropHint;
  let previewItem = null, previewUrl = null;

  const fmtSize = (n) => n >= 1024 * 1024 ? (n / 1024 / 1024).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  const fmtDate = (t) => new Date(t || Date.now()).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });

  function cacheDom() {
    grid = $('libGrid'); empty = $('libEmpty'); countEl = $('libCount');
    metaEl = $('libMeta'); searchEl = $('libSearch'); selTools = $('libSelTools');
    selCount = $('libSelCount'); dropHint = $('libDropHint');
  }

  function urlFor(item) {
    if (L.urls.has(item.id)) return L.urls.get(item.id);
    const u = URL.createObjectURL(item.blob);
    L.urls.set(item.id, u);
    return u;
  }
  function clearUrls() {
    for (const u of L.urls.values()) { try { URL.revokeObjectURL(u); } catch (e) { } }
    L.urls.clear();
  }
  function itemById(id) { return L.items.find(x => x.id === id); }

  async function refresh() {
    if (!PPStore) return;
    cacheDom();
    const uid = PPApp.session().uid;
    L.items = await PPStore.list(uid);
    L.loaded = true;
    for (const id of [...L.sel]) if (!itemById(id)) L.sel.delete(id);
    clearUrls();
    render();
    updateBadges();
  }

  function filtered() {
    const q = L.query.trim().toLowerCase();
    return q ? L.items.filter(x => String(x.name || '').toLowerCase().includes(q)) : L.items;
  }

  function render() {
    if (!grid) return;
    const rows = filtered();
    if (countEl) countEl.textContent = String(L.items.length);
    if (metaEl) metaEl.textContent = L.items.length ? `${rows.length} 个元素 · 暂存在本机` : '0 个元素';
    const isEmpty = !L.items.length;
    if (empty) empty.hidden = !isEmpty;
    grid.innerHTML = '';
    if (isEmpty) { updateSelTools(); return; }

    rows.forEach((item) => {
      const card = document.createElement('article');
      const selected = L.sel.has(item.id);
      card.className = 'libCard' + (selected ? ' sel' : '') + (L.selectMode ? ' selMode' : '');
      card.dataset.id = item.id;
      card.innerHTML = `
        <div class="libThumb">
          <img src="${urlFor(item)}" alt="${escapeHtml(item.name)}" loading="lazy">
          <span class="libCk">✓</span>
          <button class="libDel" data-q="del" type="button" title="删除元素" aria-label="删除元素"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V5h6v2M7 7l1 13h8l1-13M10 11v6M14 11v6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
          <div class="libQuick">
            <button data-q="board" type="button" title="加入画板">▣</button>
            <button data-q="down" type="button" title="下载 PNG">↓</button>
          </div>
        </div>
        <div class="libInfo"><b>${escapeHtml(item.name)}</b><span>${item.w}×${item.h}</span></div>`;
      card.addEventListener('click', (e) => {
        if (e.target.closest('[data-q]')) return;
        if (L.selectMode || e.ctrlKey || e.metaKey || e.shiftKey) toggleSel(item.id);
        else openPreview(item);
      });
      card.querySelector('[data-q="board"]').addEventListener('click', (e) => { e.stopPropagation(); toBoard(item); });
      card.querySelector('[data-q="down"]').addEventListener('click', (e) => { e.stopPropagation(); download(item); });
      card.querySelector('[data-q="del"]').addEventListener('click', (e) => {
        e.stopPropagation();
        removeWithUndo([item.id]);
      });
      grid.appendChild(card);
    });
    if (!L.query.trim()) {
      const cta = document.createElement('button');
      cta.type = 'button';
      cta.className = 'libCard libCta';
      cta.innerHTML = '<span class="plus">＋</span><b>再拆一张</b><span>拖图片进来也可以</span>';
      cta.addEventListener('click', () => { if (PPApp) PPApp.go('extract'); });
      grid.appendChild(cta);
    }
    updateSelTools();
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function updateSelTools() {
    if (!selTools) return;
    const show = L.selectMode || L.sel.size > 0;
    selTools.hidden = !show;
    if (selCount) selCount.textContent = '已选 ' + L.sel.size;
    ['libAddBoard', 'libDownload', 'libDelete'].forEach((id) => { const b = $(id); if (b) b.disabled = !L.sel.size; });
    const b = $('libSelectMode'); if (b) b.textContent = L.selectMode ? '完成' : '多选';
  }

  function toggleSel(id) {
    if (L.sel.has(id)) L.sel.delete(id); else L.sel.add(id);
    const card = grid && grid.querySelector(`[data-id="${cssEsc(id)}"]`);
    if (card) card.classList.toggle('sel', L.sel.has(id));
    updateSelTools();
  }
  function cssEsc(s) { return String(s).replace(/["\\]/g, '\\$&'); }

  function updateBadges() {
    const n = L.items.length;
    const tab = $('tabCount');
    if (tab) { tab.hidden = !n; tab.textContent = n > 99 ? '99+' : String(n); }
    if (countEl) countEl.textContent = String(n);
    if (PPApp && PPApp.syncUserMeta) PPApp.syncUserMeta();
  }

  function download(item) {
    const a = document.createElement('a');
    a.download = (item.name || 'pixpeel') + '.png';
    a.href = urlFor(item);
    a.click();
  }

  async function toBoard(item) {
    if (!PPBoard) return;
    const ok = await PPBoard.addItem(item);
    if (!ok) return;
    setMode('board');
    PPApp.toast('已放到画板中间');
  }

  function openPreview(item) {
    previewItem = item;
    clearPreviewUrl();
    previewUrl = URL.createObjectURL(item.blob);
    $('previewImg').src = previewUrl;
    $('previewName').textContent = item.name || '元素';
    $('previewSize').textContent = `${item.w}×${item.h} · ${fmtDate(item.created)}`;
    $('previewModal').hidden = false;
    document.body.classList.add('lock');
  }
  function clearPreviewUrl() {
    if (previewUrl) { try { URL.revokeObjectURL(previewUrl); } catch (e) { } previewUrl = null; }
  }
  function closePreview() {
    $('previewModal').hidden = true;
    document.body.classList.remove('lock');
    clearPreviewUrl();
    previewItem = null;
  }

  async function removeWithUndo(ids) {
    const rows = ids.map(itemById).filter(Boolean);
    if (!rows.length) return;
    const ok = await PPStore.remove(PPApp.session().uid, ids);
    if (!ok) { PPApp.toast('删除失败'); return; }
    rows.forEach(r => L.sel.delete(r.id));
    await refresh();
    PPApp.afterLibraryChange();
    PPApp.toast(`已删除 ${rows.length} 个元素`, {
      undo: async () => {
        await PPStore.add(PPApp.session().uid, rows.map(r => ({ name: r.name, blob: r.blob, w: r.w, h: r.h })));
        await refresh();
        PPApp.afterLibraryChange();
        PPApp.toast('已撤回删除');
      }
    });
  }

  async function addFiles(files) {
    const list = [...(files || [])].filter(f => String(f.type).startsWith('image/'));
    if (!list.length) return;
    const entries = [];
    for (const file of list.slice(0, 20)) {
      if (file.size > 40 * 1024 * 1024) continue;
      try {
        const bm = await createImageBitmap(file);
        const cv = document.createElement('canvas');
        cv.width = bm.width; cv.height = bm.height;
        cv.getContext('2d').drawImage(bm, 0, 0);
        const blob = await new Promise(res => cv.toBlob(res, 'image/png'));
        if (blob) entries.push({ name: file.name.replace(/\.[^.]+$/, '') || '图片', blob, w: bm.width, h: bm.height });
      } catch (e) { }
    }
    if (!entries.length) { PPApp.toast('这些图片读不出来'); return; }
    const rows = await PPStore.add(PPApp.session().uid, entries);
    if (!rows.length) { PPApp.toast('保存失败'); return; }
    await refresh();
    PPApp.afterLibraryChange();
    PPApp.toast(`已把 ${rows.length} 张图存进元素库`);
  }

  function setMode(mode, opts) {
    mode = mode === 'board' ? 'board' : 'lib';
    L.mode = mode;
    const libPanel = $('libPanel'), boardPanel = $('boardPanel');
    if (libPanel) libPanel.classList.toggle('on', mode === 'lib');
    if (boardPanel) boardPanel.classList.toggle('on', mode === 'board');
    document.querySelectorAll('.libSwitch [data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
    const title = document.querySelector('.libTitleWrap .wtTitle');
    if (title) title.textContent = mode === 'board' ? '画板' : '元素库';
    const top = document.querySelector('.libTop');
    if (top) top.classList.toggle('boardMode', mode === 'board');
    if (mode === 'board' && PPBoard) {
      PPBoard.activate();
      requestAnimationFrame(() => PPBoard.resize());
    } else if (PPBoard) {
      PPBoard.flushSave();
    }
    if (!opts || !opts.silent) {
      if (PPApp) { PPApp.go(mode === 'board' ? 'board' : 'library'); return; }
      const want = mode === 'board' ? '#board' : '#library';
      if (location.hash !== want) history.replaceState(null, '', want);
    }
  }

  function bind() {
    cacheDom();
    if (!grid) return;
    const selMode = $('libSelectMode');
    if (selMode) selMode.onclick = () => {
      L.selectMode = !L.selectMode;
      if (!L.selectMode) L.sel.clear();
      render();
    };
    document.querySelectorAll('.libSwitch [data-mode]').forEach(btn => {
      btn.addEventListener('click', () => setMode(btn.dataset.mode));
    });
    $('libGoBoard').onclick = () => setMode('board');
    $('libGoExtract').onclick = () => { if (PPApp) PPApp.go('extract'); };
    if (searchEl) searchEl.addEventListener('input', () => { L.query = searchEl.value; render(); });
    $('libSelAll').onclick = () => {
      const rows = filtered();
      const all = rows.every(x => L.sel.has(x.id));
      if (all) rows.forEach(x => L.sel.delete(x.id)); else rows.forEach(x => L.sel.add(x.id));
      render();
    };
    $('libAddBoard').onclick = async () => {
      const rows = [...L.sel].map(itemById).filter(Boolean);
      if (!rows.length) return;
      for (const r of rows) await PPBoard.addItem(r, true);
      PPBoard.flushSave();
      setMode('board');
      PPApp.toast(`已把 ${rows.length} 个元素加入画板`);
    };
    $('libDownload').onclick = () => {
      const rows = [...L.sel].map(itemById).filter(Boolean);
      rows.forEach((r, i) => setTimeout(() => download(r), i * 160));
      PPApp.toast(`已开始下载 ${rows.length} 个 PNG`);
    };
    $('libDelete').onclick = async () => {
      const rows = [...L.sel].map(itemById).filter(Boolean);
      if (!rows.length) return;
      const ok = await PPApp.confirm('删除选中的元素？', `将从本机元素库移除 ${rows.length} 个元素，删除后可以撤回。`);
      if (ok) removeWithUndo(rows.map(r => r.id));
    };

    /* 预览 */
    $('previewDownload').onclick = () => { if (previewItem) download(previewItem); };
    $('previewBoard').onclick = () => {
      if (!previewItem) return;
      const item = previewItem;
      closePreview();
      toBoard(item);
    };
    $('previewDelete').onclick = async () => {
      if (!previewItem) return;
      const item = previewItem;
      const ok = await PPApp.confirm('删除这个元素？', '删除后可以撤回。');
      if (!ok) return;
      closePreview();
      removeWithUndo([item.id]);
    };

    /* 拖图片进元素库：直接存成元素 */
    const panel = $('libPanel');
    let dragDepth = 0;
    ['dragenter', 'dragover'].forEach(t => panel.addEventListener(t, (e) => {
      if (!e.dataTransfer || ![...e.dataTransfer.types].includes('Files')) return;
      e.preventDefault();
      if (t === 'dragenter') dragDepth++;
      if (dropHint) dropHint.classList.add('on');
    }));
    panel.addEventListener('dragleave', (e) => {
      dragDepth = Math.max(0, dragDepth - 1);
      if (!dragDepth && dropHint) dropHint.classList.remove('on');
    });
    panel.addEventListener('drop', async (e) => {
      e.preventDefault(); dragDepth = 0;
      if (dropHint) dropHint.classList.remove('on');
      if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files);
    });

    /* 移动端 / 桌面通用的侧栏收起 */
    document.querySelectorAll('[data-close-side]').forEach(b => b.onclick = () => b.closest('.bdAssets,.bdLayers').classList.remove('open'));
  }

  window.PPLibrary = {
    init: bind,
    refresh,
    setMode,
    addFiles,
    get mode() { return L.mode; },
    get count() { return L.items.length; },
    onEnter() {
      cacheDom();
      refresh();
      if (L.mode === 'board' && PPBoard) requestAnimationFrame(() => PPBoard.resize());
    },
    closePreview,
    clearUrls
  };
})();
