/* PixPeel 网页版：路由、登录态、主题、全屏、弹窗与全局反馈 */
(function () {
  const $ = (id) => document.getElementById(id);
  const A = { view: 'home', theme: 'light', confirmResolve: null, toastTimer: null };
  const VIEWS = ['home', 'extract', 'library', 'board'];

  function session() { return PPStore.session(); }

  function boot() {
    applyInitialTheme();
    bindTop();
    bindModals();
    bindFocus();
    bindReveal();
    renderUser();
    history.replaceState(null, '', location.hash || '#home');
    route(location.hash.replace('#', '') || 'home', true);
    window.addEventListener('hashchange', () => route(location.hash.replace('#', '') || 'home'));
    window.addEventListener('beforeunload', () => { try { PPBoard.flushSave(); } catch (e) { } });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { try { PPBoard.flushSave(); } catch (e) { } } });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { try { PPBoard.draw(); } catch (e) { } });
  }

  /* ── 路由 ── */
  function route(v, initial) {
    if (!VIEWS.includes(v)) v = 'home';
    const prev = A.view;
    A.view = v;
    if (!initial && v !== 'home' && prev === 'home') window.scrollTo(0, 0);
    document.querySelectorAll('.view').forEach(el => el.classList.toggle('on', el.dataset.view === (v === 'board' ? 'library' : v)));
    document.querySelectorAll('.tabs a').forEach(a => a.classList.toggle('on', a.dataset.view === (v === 'board' ? 'library' : v)));
    document.title = window.PPI18N ? PPI18N.titleFor(v) : 'PixPeel 网页版 — ' + ({ home: '把图剥开，一个个拿走', extract: '拆元素', library: '元素库', board: '画板' }[v] || '');
    exitFocus(true);
    if (prev === 'board' && v !== 'board') { try { PPBoard.deactivate(); } catch (e) { } }

    if (v === 'extract') PPExtract.onEnter();
    if (v === 'library') { PPLibrary.onEnter(); PPLibrary.setMode('lib', { silent: true }); }
    if (v === 'board') {
      PPLibrary.onEnter();
      PPLibrary.setMode('board', { silent: true });
      PPBoard.activate();
      requestAnimationFrame(() => PPBoard.resize());
    }
    if (v !== 'board' && prev === 'board') { try { PPBoard.deactivate(); } catch (e) { } }
    if (!initial) history.replaceState(null, '', '#' + v);
    syncUserMeta();
  }
  function go(v) { route(v); }

  /* ── 主题 ── */
  function applyInitialTheme() {
    let t = null;
    try { t = localStorage.getItem('pp_web_theme'); } catch (e) { }
    if (!t) t = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    setTheme(t);
  }
  function setTheme(t) {
    A.theme = t === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = A.theme;
    try { localStorage.setItem('pp_web_theme', A.theme); } catch (e) { }
    const b = $('themeBtn');
    if (b) b.title = A.theme === 'dark' ? '切到浅色' : '切到深色';
  }

  function bindTop() {
    $('themeBtn').onclick = () => setTheme(A.theme === 'dark' ? 'light' : 'dark');
    const sponsor = $('sponsor');
    if (sponsor) {
      document.addEventListener('click', (e) => {
        if (sponsor.open && !sponsor.contains(e.target)) sponsor.open = false;
      });
      sponsor.querySelectorAll('a').forEach(a => a.addEventListener('click', () => { sponsor.open = false; }));
    }
    $('userChip').onclick = () => {
      if (session().guest) openLogin();
      else openAccount();
    };
    $('heroSample').onclick = () => {
      go('extract');
      setTimeout(() => PPExtract.loadSample(), 80);
    };
    document.querySelectorAll('a[href="#extract"],a[href="#library"],a[href="#board"]').forEach(a => {
      a.addEventListener('click', () => {
        const v = a.getAttribute('href').slice(1);
        if (v === A.view) { route(v); }
      });
    });
  }

  /* ── 登录 / 账号 ── */
  function renderUser() {
    const s = session();
    const en = window.PPI18N && PPI18N.lang() === 'en';
    const name = s.guest ? '游客' : s.name;
    const initial = s.guest ? (en ? 'G' : '游') : String(s.name || 'P').trim().charAt(0).toUpperCase();
    $('userName').textContent = s.guest ? '登录' : s.name;
    $('userAvatar').textContent = initial;
    $('acctAvatar').textContent = initial;
    $('acctName').textContent = name;
    $('acctMeta').textContent = s.guest ? '游客数据暂存在本机' : '本机账号 · 数据不上传';
    const st = $('libStatus'); if (st) st.textContent = s.guest ? '游客 · 本机暂存' : s.name + ' · 本机暂存';
    syncUserMeta();
  }
  function syncUserMeta() {
    const s = session();
    const st = $('libStatus'); if (st) st.textContent = s.guest ? '游客 · 本机暂存' : s.name + ' · 本机暂存';
    const n = (window.PPLibrary && PPLibrary.count) || 0;
    const tab = $('tabCount');
    if (tab) { tab.hidden = !n; tab.textContent = n > 99 ? '99+' : String(n); }
    const cnt = $('libCount'); if (cnt) cnt.textContent = String(n);
    $('acctItems').textContent = String(n);
    PPStore.usage().then(u => {
      const el = $('acctSize');
      if (el) el.textContent = u.used ? (u.used / 1024 / 1024).toFixed(1) + ' MB' : '0 MB';
    });
  }
  function openLogin() {
    const s = session();
    $('loginName').value = s.guest ? '' : s.name;
    $('mergeWrap').hidden = !s.guest;
    $('loginMerge').checked = true;
    $('loginFoot').textContent = s.guest ? '游客数据也会保存在本机，登录后可以合并。' : '切换昵称会打开对应的本机数据。';
    openModal('loginModal');
    setTimeout(() => $('loginName').focus(), 50);
  }
  async function doLogin() {
    const name = $('loginName').value.trim();
    if (!name) { toast('先写一个昵称'); return; }
    const wasGuest = session().guest;
    const merge = wasGuest && $('loginMerge').checked;
    const s = PPStore.login(name, false);
    if (!s) { toast('昵称不可用'); return; }
    if (merge) await PPStore.mergeGuest(s.uid);
    closeModal('loginModal');
    renderUser();
    await afterUserChange();
    toast(merge ? '已登录，游客数据已合并' : '已切换到「' + s.name + '」');
  }
  async function afterUserChange() {
    try { await PPLibrary.refresh(); } catch (e) { }
    try { await PPBoard.switchUser(session().uid); } catch (e) { }
    renderUser();
    syncUserMeta();
  }
  function openAccount() {
    renderUser();
    syncUserMeta();
    openModal('accountModal');
  }

  /* ── 弹窗 ── */
  function visibleModals() { return [...document.querySelectorAll('.modal')].filter(m => !m.hidden); }
  function syncLock() { document.body.classList.toggle('lock', visibleModals().length > 0); }
  function openModal(id) { const el = $(id); if (el) { el.hidden = false; syncLock(); } }
  function closeModal(id) {
    const el = $(id);
    if (el) el.hidden = true;
    if (id === 'previewModal' && window.PPLibrary) PPLibrary.closePreview();
    syncLock();
  }
  function closeTopModal() {
    const list = visibleModals();
    if (!list.length) return false;
    const top = list[list.length - 1];
    if (top.id === 'confirmModal') { resolveConfirm(false); return true; }
    top.hidden = true;
    if (top.id === 'previewModal' && window.PPLibrary) PPLibrary.closePreview();
    syncLock();
    return true;
  }
  function confirm(title, text) {
    $('confirmTitle').textContent = title || '确定？';
    $('confirmText').textContent = text || '';
    openModal('confirmModal');
    return new Promise(res => { A.confirmResolve = res; });
  }
  function resolveConfirm(v) {
    $('confirmModal').hidden = true;
    syncLock();
    if (A.confirmResolve) { const r = A.confirmResolve; A.confirmResolve = null; r(v); }
  }
  function bindModals() {
    document.querySelectorAll('.modal [data-close]').forEach(b => {
      b.addEventListener('click', () => {
        const m = b.closest('.modal');
        if (!m) return;
        if (m.id === 'confirmModal') resolveConfirm(false);
        else {
          m.hidden = true;
          if (m.id === 'previewModal' && window.PPLibrary) PPLibrary.closePreview();
          syncLock();
        }
      });
    });
    document.querySelectorAll('.modal').forEach(m => {
      m.addEventListener('click', (e) => {
        if (e.target !== m) return;
        if (m.id === 'confirmModal') resolveConfirm(false);
        else { m.hidden = true; if (m.id === 'previewModal' && window.PPLibrary) PPLibrary.closePreview(); syncLock(); }
      });
    });
    $('loginGo').onclick = doLogin;
    $('loginName').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
    $('loginGuest').onclick = () => closeModal('loginModal');
    $('confirmYes').onclick = () => resolveConfirm(true);
    $('confirmNo').onclick = () => resolveConfirm(false);
    $('acctSwitch').onclick = () => { closeModal('accountModal'); openLogin(); };
    $('acctLogout').onclick = async () => {
      PPStore.logout();
      closeModal('accountModal');
      renderUser();
      await afterUserChange();
      toast('已退出，回到游客状态');
    };
    $('acctWipe').onclick = async () => {
      const s = session();
      const who = s.guest ? (window.PPI18N && PPI18N.lang() === 'en' ? 'Guest' : '游客') : s.name;
      const ok = await confirm('清除本机数据？', `会删除「${who}」的元素库和画板，无法恢复。`);
      if (!ok) return;
      await PPStore.clear(s.uid);
      await PPStore.clearBoard(s.uid);
      closeModal('accountModal');
      await afterUserChange();
      toast('已清除这个账号的本机数据');
    };
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (document.body.classList.contains('focusMode')) { exitFocus(); return; }
      closeTopModal();
    });
  }

  /* ── 全屏专注 ── */
  function toggleFocus() {
    if (document.body.classList.contains('focusMode')) exitFocus();
    else {
      document.body.classList.add('focusMode');
      $('exitFocus').hidden = false;
      try { if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => { }); } catch (e) { }
      document.querySelectorAll('.bdAssets.open,.bdLayers.open,.exInspector.open').forEach(el => el.classList.remove('open'));
      syncFocusLayout();
    }
  }
  function exitFocus(silent) {
    if (!document.body.classList.contains('focusMode')) return;
    document.body.classList.remove('focusMode');
    $('exitFocus').hidden = true;
    document.body.classList.remove('exSheetOpen');
    if (!silent) {
      try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => { }); } catch (e) { }
    }
    syncFocusLayout();
  }
  function syncFocusLayout() {
    requestAnimationFrame(() => {
      try {
        if (A.view === 'extract' && window.PPExtract) PPExtract.onEnter();
        if (A.view === 'board' && window.PPBoard) PPBoard.resize();
      } catch (e) { }
    });
  }
  function bindFocus() {
    ['exFocus', 'libFocus', 'bdFocus'].forEach(id => { const b = $(id); if (b) b.onclick = toggleFocus; });
    $('exitFocus').onclick = () => exitFocus();
    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement) exitFocus(true);
    });
  }

  /* ── 反馈 ── */
  function toast(text, opts) {
    const el = $('toast'), tx = $('toastText'), undo = $('toastUndo');
    if (!el) return;
    tx.textContent = text;
    clearTimeout(A.toastTimer);
    if (opts && opts.undo) {
      undo.hidden = false;
      undo.onclick = async () => { undo.hidden = true; try { await opts.undo(); } catch (e) { } el.hidden = true; };
    } else undo.hidden = true;
    el.hidden = false;
    A.toastTimer = setTimeout(() => { el.hidden = true; }, opts && opts.undo ? 6000 : 3200);
  }

  async function afterLibraryChange() {
    try { await PPLibrary.refresh(); } catch (e) { }
    try { PPBoard.refreshAssets(); } catch (e) { }
    syncUserMeta();
    if (A.view === 'library' || A.view === 'board') { try { PPLibrary.onEnter(); } catch (e) { } }
  }

  function onLanguageChange() {
    renderUser();
    syncUserMeta();
    try { PPExtract.refresh(); } catch (e) { }
    try { PPLibrary.refresh(); } catch (e) { }
    try { PPBoard.refreshAssets(); PPBoard.draw(); } catch (e) { }
    if (window.PPI18N) document.title = PPI18N.titleFor(A.view);
  }

  /* ── 入场动画 ── */
  function bindReveal() {
    const els = [...document.querySelectorAll('.home .section')];
    if (!('IntersectionObserver' in window)) { els.forEach(e => e.classList.add('in')); return; }
    els.forEach(e => e.classList.add('reveal'));
    const io = new IntersectionObserver((entries) => {
      entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { threshold: .12 });
    els.forEach(e => io.observe(e));
  }

  window.PPApp = {
    boot, go, view: () => A.view, session,
    toast, confirm, afterLibraryChange, syncUserMeta, renderUser, onLanguageChange,
    openModal, closeModal, exitFocus
  };

  document.addEventListener('DOMContentLoaded', async () => {
    await PPStore.init();
    PPLibrary.init();
    await PPLibrary.refresh();
    PPExtract.init();
    await PPBoard.init();
    boot();
  });
})();
