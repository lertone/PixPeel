/* PixPeel 桌面版界面（引擎在 engine.js，文案在 i18n.js） */
const $ = (s, r = document) => r.querySelector(s);
const api = window.xapi;
let CFG = null;
let tt;
function toast(t) { const e = $('#toast'); e.textContent = t; e.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => e.classList.remove('show'), 4200); }

/* ───────── 撤回轻提示：3 秒 + 递减进度条 ─────────
 * 用法：undoToast('已删除 3 个元素', { undo: () => {...}, expire: () => {...} })
 * expire 在 3 秒内没人点撤回时触发（用来真正执行删除）；undo 则是反悔。 */
let undoJob = null;
function undoToast(msg, opt) {
  opt = opt || {};
  let el = $('#undoToast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'undoToast';
    el.innerHTML = '<span class="utx"></span><button class="btn sm uact"></button><i class="ubar"></i>';
    document.body.appendChild(el);
    el.querySelector('.uact').onclick = () => {
      const j = undoJob; if (!j) return;
      undoJob = null; clearTimeout(j.timer); el.classList.remove('on');
      if (j.opt.undo) j.opt.undo();
    };
  }
  const ms = opt.ms || 3000;
  el.querySelector('.utx').textContent = msg;
  el.querySelector('.uact').textContent = t('undo');
  el.classList.add('on');
  const bar = el.querySelector('.ubar');
  bar.style.transition = 'none'; bar.style.width = '100%';
  void bar.offsetWidth;                       // 强制重排，让进度条从头开始
  bar.style.transition = 'width ' + ms + 'ms linear'; bar.style.width = '0%';
  if (undoJob) { clearTimeout(undoJob.timer); if (undoJob.opt.expire) undoJob.opt.expire(); }
  undoJob = { opt, timer: setTimeout(() => { const j = undoJob; undoJob = null; el.classList.remove('on'); if (j && j.opt.expire) j.opt.expire(); }, ms) };
}
/** 撤回轻提示的宿主组件是否正在显示（避免多个提示互相打断） */
const undoBusy = () => !!undoJob;
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/* 轻量输入框：Electron 不支持 window.prompt（调用直接抛错），改名 / 输入名字统一走这里 */
function askText(title, value, onOk) {
  let el = $('#askModal');
  if (!el) {
    el = document.createElement('div');
    el.id = 'askModal'; el.className = 'pvWrap askWrap';
    document.body.appendChild(el);
    el.addEventListener('pointerdown', (e) => { if (e.target === el) el.classList.remove('on'); });
  }
  el.innerHTML = `<div class="askPanel" role="dialog" aria-modal="true">
    <div class="askH">${esc(title || '')}</div>
    <input class="askInp" type="text" value="${esc(value || '')}" spellcheck="false">
    <div class="askRow"><button class="btn ghost askCancel">${t('askCancel')}</button><button class="btn primary askOk">${t('askOk')}</button></div></div>`;
  el.classList.add('on');
  const inp = el.querySelector('.askInp');
  const close = () => el.classList.remove('on');
  const submit = () => { const v = inp.value.trim(); close(); if (v) onOk(v); };
  el.querySelector('.askOk').onclick = submit;
  el.querySelector('.askCancel').onclick = close;
  inp.onkeydown = (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  };
  setTimeout(() => { try { inp.focus(); inp.select(); } catch (e) { } }, 30);
}
const toBlob = (cv) => new Promise(r => cv.toBlob(r, 'image/png'));
const toBytes = async (cv) => new Uint8Array(await (await toBlob(cv)).arrayBuffer());
const pretty = (acc) => String(acc || '').replace('CommandOrControl', api.platform === 'darwin' ? '⌘' : 'Ctrl').replace('Alt', api.platform === 'darwin' ? '⌥' : 'Alt').replace(/\+/g, ' + ');

/* ───────── 语言 / 主题 ───────── */
function applyLang() {
  const prev = I18N.lang;
  I18N.setLang(CFG && CFG.langResolved || I18N.resolve('auto', navigator.language));
  document.documentElement.lang = I18N.lang === 'zh' ? 'zh-CN' : 'en';
  document.querySelectorAll('[data-i18n]').forEach(e => { e.textContent = t(e.dataset.i18n); });
  /* 语言变了：自动命名的元素（元素 1 / Element 1）要跟着换文案，用户自己改过的不动 */
  if (prev && prev !== I18N.lang && typeof relabelLayers === 'function') {
    if (relabelLayers()) { segList(); segRender(); }
  }
  if (typeof applyRail === 'function') applyRail();
}
const darkMQ = window.matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const m = CFG && CFG.theme || 'auto';
  document.documentElement.dataset.theme = m === 'auto' ? (darkMQ.matches ? 'dark' : 'light') : m;
}
darkMQ.addEventListener && darkMQ.addEventListener('change', applyTheme);
function applyAll() { applyLang(); applyTheme(); refreshHint(); if (CFG) aiSetMode(CFG.aiModel); }

/* ───────── 页面切换 ───────── */
function showView(v) {
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  document.querySelectorAll('.view').forEach(e => e.classList.toggle('on', e.id === 'v-' + v));
  if (v === 'lib') renderLib();
  if (v === 'set') renderSettings();
  if (v === 'board') Board.enter();
  if (v === 'svglib' && typeof SvgLib !== 'undefined') SvgLib.render();
  if (v === 'svgcanvas' && typeof SvgCanvas !== 'undefined') SvgCanvas.enter();
}
$('#nav').onclick = (e) => { const b = e.target.closest('button'); if (b) showView(b.dataset.v); };
/* 导航轨收起 / 展开：真的把网格列收掉，主区域跟着变大，不是浮层盖住 */
const RAIL_KEY = 'pp_rail_hide';
function applyRail() {
  let hide = false; try { hide = localStorage.getItem(RAIL_KEY) === '1'; } catch (e) { }
  document.body.classList.toggle('railHide', hide);
  const a = $('#railHide'), b = $('#railShow');
  if (a) a.title = t('railHide');
  if (b) b.title = t('railShow');
}
$('#railHide').onclick = () => {
  document.body.classList.add('railHide');
  try { localStorage.setItem(RAIL_KEY, '1'); } catch (e) { }
  window.dispatchEvent(new Event('resize'));
};
$('#railShow').onclick = () => {
  document.body.classList.remove('railHide');
  try { localStorage.setItem(RAIL_KEY, '0'); } catch (e) { }
  window.dispatchEvent(new Event('resize'));
};
applyRail();
$('#btnCap').onclick = () => api.capture();
$('#btnImp').onclick = () => api.importImage();

/* ───────── 拆元素页 ───────── */
const IC = {
  pick: '<svg class="i" viewBox="0 0 24 24"><path d="M6 4l12 6-5 2-2 5z"/></svg>',
  wand: '<svg class="i" viewBox="0 0 24 24"><path d="M5 19L15 9M14 6l4 4M17 3v2M21 7h-2M7 5V3M6 4H4"/></svg>',
  lasso: '<svg class="i" viewBox="0 0 24 24"><path d="M12 5c4.4 0 8 1.8 8 4s-3.6 4-8 4-8-1.8-8-4 3.6-4 8-4z"/><path d="M8 13c-1 3 0 5 2 6"/></svg>',
  ai: '<svg class="i" viewBox="0 0 24 24"><path d="M12 3l1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7zM18 16l.8 2.2L21 19l-2.2.8L18 22l-.8-2.2L15 19l2.2-.8z"/></svg>',
  zoom: '<svg class="i" viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21M8 10.5h5M10.5 8v5"/></svg>',
  eraser: '<svg class="i" viewBox="0 0 24 24"><path d="M9.5 19.5l-5-5a1.8 1.8 0 0 1 0-2.6l8-8a1.8 1.8 0 0 1 2.6 0l5 5a1.8 1.8 0 0 1 0 2.6l-8 8z"/><path d="M7 12.5l6 6M10.5 19.5H21"/></svg>',
  brush: '<svg class="i" viewBox="0 0 24 24"><path d="M4 20c2.6 0 4.2-.9 5.2-2.8l7.6-7.6 3.3 3.3-7.6 7.6C10.6 21.5 8 22 4 22z"/><path d="M15.2 7.2l2-2a1.6 1.6 0 0 1 2.3 0l1.3 1.3a1.6 1.6 0 0 1 0 2.3l-2 2"/></svg>',
  trash: '<svg class="i" viewBox="0 0 24 24"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v6M14 11v6"/></svg>'
};
function renderEmpty() {
  segReset();                       /* 释放上一批图的 canvas / 像素数据，序号归 1 */
  $('#v-edit').innerHTML = `<div class="empty"><div class="finder" id="drop">
    <h2>${t('emTitle', { k: '<kbd>' + esc(pretty(CFG && CFG.hotkey)) + '</kbd>' })}</h2>
    <p>${t('emP1')}</p>
    <p class="tip" style="max-width:none">${t('emTip', { k: '<kbd>' + esc(pretty(CFG && CFG.hotkey2)) + '</kbd>' })}</p>
    <div class="big"><button class="btn primary" id="emCap">${t('emCap')}</button><button class="btn" id="emImp">${t('emImp')}</button></div>
    <span class="tip">${t('emDrop')}</span></div></div>`;
  $('#emCap').onclick = () => api.capture();
  $('#emImp').onclick = () => api.importImage();
}
/* 批量导入时别每张图都重画整个界面：攒到批次结束统一画一次。
 * 一次导入 N 张图以前会重建 N 次 DOM、画 N 次缩略图，图越多越卡。 */
let BATCH = 0;
async function runBatch(fn) {
  BATCH++;
  try { return await fn(); }
  finally {
    BATCH--;
    if (!BATCH) {
      if (SEG.src) { buildEdit(); segRender(); segList(); }
      else renderEmpty();
    }
  }
}
function openImage(el, w, h, name) {
  /* 批量导入：每张图都是拼贴墙上的一块，元素全部汇总到一个列表里 */
  const src = segPrep(el, w, h);
  const tile = segAddTile(src, name);
  const tileIdx = SEG.tiles.length - 1;
  SEG.cur = tileIdx;
  SEG.src = src;
  SEG.sel = new Set(); SEG.hov = null; SEG.tool = 'pick'; SEG.mode = 'new'; SEG.lasso = null;
  SEG.name = name || t('image');
  showView('edit');
  if (!BATCH || !$('#segCv')) buildEdit();      // 批次里只在第一张时建一次界面
  segBusy(t('splitting'));
  const before = new Set(SEG.layers.map(l => l.id));
  return new Promise(res => setTimeout(async () => {
    SEG.cur = tileIdx; SEG.src = src;          // 拆的时候锁死这一张，别被别的图抢走
    const info = await segAuto();
    SEG.layers.forEach(l => { if (!before.has(l.id)) { l.tile = tileIdx; l.on = false; } });
    segBusy('');
    if (!BATCH) { segRender(); segList(); }
    const tp = $('#segInfo'); if (tp) tp.textContent = info;
    res(SEG.layers.length - before.size);
  }, 30));
}
/** 切换当前操作的图块 */
function setCurTile(tile) {
  const i = SEG.tiles.indexOf(tile); if (i < 0 || i === SEG.cur) return;
  SEG.cur = i; SEG.src = tile.src; SEG.lasso = null; SEG.hov = null;
  SEG.aiPts = []; SEG.aiLayer = null; SEG.sel.clear();
  const sb = $('#segName'); if (sb) sb.textContent = tile.name;
  const ss = $('#segSize'); if (ss) ss.textContent = tile.w + ' × ' + tile.h;
  segList(); segRender(); if (typeof segParams === 'function') segParams();
}
function buildEdit() {
  $('#v-edit').innerHTML = `
    <div class="stageWrap">
      <div class="segStage"><canvas id="segCv" width="${SEG.wall.w || SEG.src.w}" height="${SEG.wall.h || SEG.src.h}"></canvas><div id="segBusy" style="display:none"></div></div>
      <div class="stageBar"><span id="segName">${esc(SEG.name)}</span><span class="dim" id="segSize">${SEG.src.w} × ${SEG.src.h}</span><span class="sp"></span>
        <span class="hint"><span>${t('hintClick')}</span><span><kbd>Enter</kbd> ${t('hintSave')}</span><span><kbd>Esc</kbd> ${t('hintHide')}</span></span>
        <button class="btn sm ghost" id="segHide" title="${t('hintHide')} (Esc)">${t('hintHide')}</button></div>
    </div>
    <div class="vsplit" id="segSplit" title="${t('bdResizeTip')}"></div>
    <aside class="inspector">
      <div class="inspBody">
        <div class="grp"><div class="seg" id="segTools">
          <button class="${SEG.tool === 'pick' ? 'on' : ''}" data-st="pick" title="${t('toolPickTip')}">${IC.pick}${t('toolPick')}</button>
          <button class="${SEG.tool === 'wand' ? 'on' : ''}" data-st="wand" title="${t('toolWandTip')}">${IC.wand}${t('toolWand')}</button>
          <button class="${SEG.tool === 'lasso' ? 'on' : ''}" data-st="lasso" title="${t('toolLassoTip')}">${IC.lasso}${t('toolLasso')}</button>
          <button class="${SEG.tool === 'ai' ? 'on' : ''}" data-st="ai" title="${t('toolAiTip')}">${IC.ai}${t('toolAi')}</button></div>
          <div id="segParams" class="grp"></div></div>
        <div class="grp"><div class="gt">${t('elements')} <small id="segCount"></small></div>
          <div id="segList"></div>
          <div class="chips"><button class="btn sm" id="bAll">${t('selAll')}</button><button class="btn sm" id="bNone">${t('selNone')}</button><button class="btn sm" id="bMerge" title="${t('mergeTip')}">${t('merge')}</button><button class="btn sm danger ico" id="bDel" title="${t('removeTip')}" aria-label="${t('remove')}">${IC.trash}</button><button class="btn sm danger" id="bClear" title="${t('segClearAll')}">${t('segClearAll')}</button></div></div>
        <label class="row2"><input type="checkbox" class="sw" id="segResid"><span>${t('resid')}</span></label>
      </div>
      <div class="inspFoot">
        <button class="btn primary" id="bSave" style="padding:11px">${t('saveSel', { n: 0 })}</button>
        <div class="chips"><button class="btn" id="bCopy" title="${t('copyTip')}">${t('copy')}</button><button class="btn" id="bSvg" title="${t('svgTip')}">${t('svgBtn')}</button><button class="btn" id="bVec" title="${t('svgVecTip')}">${t('svgVecBtn')}</button><button class="btn ghost" id="bNew">${t('another')}</button></div>
      </div>
    </aside>`;
  applySegLayout();
  bindSegSplit();
  segParams(); segBindD();
}
/* 拆元素页：检查器宽度可拖，元素网格会真的多排几列 */
function applySegLayout() {
  const ins = $('#v-edit .inspector'); if (!ins) return;
  let w = 352; try { w = parseInt(localStorage.getItem('pp_insp_w') || '352', 10) || 352; } catch (e) { }
  ins.style.setProperty('--insp-w', Math.max(280, Math.min(640, w)) + 'px');
}
function bindSegSplit() {
  const host = $('#v-edit'), sp = $('#segSplit'), ins = $('#v-edit .inspector');
  if (!host || !sp || !ins) return;
  let drag = null;
  const setW = (w) => {
    const max = Math.max(320, host.clientWidth - 480);
    const x = Math.max(280, Math.min(w, Math.min(640, max)));
    ins.style.setProperty('--insp-w', Math.round(x) + 'px');
    try { localStorage.setItem('pp_insp_w', String(Math.round(x))); } catch (e) { }
  };
  sp.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    drag = { x: e.clientX, w: ins.getBoundingClientRect().width };
    sp.classList.add('active');
    try { sp.setPointerCapture(e.pointerId); } catch (_) { }
  });
  sp.addEventListener('pointermove', (e) => { if (drag) setW(drag.w + (drag.x - e.clientX)); });
  const end = () => { drag = null; sp.classList.remove('active'); };
  sp.addEventListener('pointerup', end); sp.addEventListener('pointercancel', end);
}
function segParams() {
  const p = $('#segParams'); if (!p) return;
  const sl = (k, l, min, max, st, v) => `<label class="fld"><span>${l}</span><input type="range" data-sp="${k}" min="${min}" max="${max}" step="${st}" value="${v}"><b>${v}</b></label>`;
  const mode = (k, l, tip) => `<button class="btn sm${SEG.mode === k ? ' on' : ''}" data-sm="${k}" title="${tip}">${l}</button>`;
  if (SEG.tool === 'pick') {
    p.innerHTML = `<label class="fld" style="grid-template-columns:78px 1fr"><span>${t('how')}</span><select data-sp="how"><option value="auto"${SEG.how === 'auto' ? ' selected' : ''}>${t('howAuto')}</option><option value="bg"${SEG.how === 'bg' ? ' selected' : ''}>${t('howBg')}</option><option value="color"${SEG.how === 'color' ? ' selected' : ''}>${t('howColor')}</option></select></label>
    ${sl('tol', t('pTol'), 8, 120, 1, SEG.tol)}${sl('merge', t('pMerge'), 0, 40, 1, SEG.merge)}${sl('minA', t('pMinA'), 0.02, 5, 0.02, SEG.minA)}${SEG.how === 'color' ? sl('K', t('pK'), 2, 12, 1, SEG.K) : ''}
    <div class="row2"><button class="btn sm" id="segRe">${t('redo')}</button><span class="tip" id="segInfo"></span></div>
    <div class="chips"><button class="btn sm" id="segGroup" title="${t('txtGroupTip')}">${t('txtGroup')}</button>${SEG.tiles.length > 1 ? `<button class="btn sm" id="segReAll" title="${t('reAllTip')}">${t('reAll')}</button>` : ''}</div>`;
  } else {
    const tgt = SEG.layers.find(l => SEG.sel.has(l.id) && (l.tile == null || l.tile === SEG.cur));
    const tgtLine = SEG.mode === 'new' ? '' : `<div class="tip">${tgt ? t('eTarget', { n: '<b>' + esc(tgt.name) + '</b>' }) : t('eTargetNone')}</div>`;
    p.innerHTML = `<div class="chips">${mode('new', t('modeNew'), t('modeNewTip'))}${mode('add', t('modeAdd'), t('modeAddTip'))}${mode('sub', t('modeSub'), t('modeSubTip'))}${mode('split', t('modeSplit'), t('modeSplitTip'))}</div>
    ${tgtLine}
    ${SEG.tool === 'wand' ? sl('wtol', t('pWand'), 6, 120, 1, SEG.wtol || 32) + '<div class="tip">' + t('tipWand') + '</div>' : ''}
    ${SEG.tool === 'lasso' ? '<div class="tip">' + t('tipLasso') + '</div>' : ''}
    ${SEG.tool === 'ai' ? '<div class="tip">' + t('tipAi') + '</div>' + aiPtsPanel() + aiPanel() : ''}`;
  }
  aiBind();
  const pc = document.querySelector('#aiPtsClear');
  if (pc) pc.onclick = () => { SEG.aiPts = []; SEG.aiLayer = null; segParams(); segRender(); toast(t('aiPtsCleared')); };
}
/** AI 提示点：显式的「选中点 / 排除点」开关 + 数量，不再只靠 Alt */
function aiPtsPanel() {
  const n = SEG.aiPts.filter(x => x.neg).length, p = SEG.aiPts.length - n;
  return `<div class="chips" style="align-items:center">
    <button class="btn sm${!SEG.aiNeg ? ' on' : ''}" data-ap="pos" title="${t('aiLegend')}">+ ${t('aiPos')}</button>
    <button class="btn sm${SEG.aiNeg ? ' on' : ''}" data-ap="neg" title="${t('aiLegend')}">− ${t('aiNeg')}</button>
    <span style="flex:1"></span>
    <button class="btn sm ghost" id="aiPtsClear">${t('aiClearPts')}</button></div>
  <div class="tip">${t('aiPts', { p, n })} · ${t('aiLegend')}</div>`;
}
/** 批量一致性：用当前这套参数把每张图重新拆一遍（否则逐张点“重新拆分”容易漏图、参数也不一致） */
async function segResplitAll() {
  if (!SEG.tiles.length) return;
  segBusy(t('splitting'));
  const keep = SEG.cur;
  for (let i = 0; i < SEG.tiles.length; i++) {
    SEG.cur = i; SEG.src = SEG.tiles[i].src; SEG.aiPts = []; SEG.aiLayer = null;
    await segAuto();
    SEG.layers.forEach(L => { if (L.tile === i) L.on = false; });
  }
  SEG.cur = keep; SEG.src = SEG.tiles[keep].src;
  SEG.sel.clear(); segBusy(''); segRender(); segList();
  toast(t('reAllDone', { n: SEG.tiles.length }));
}
function segList() {
  const el = $('#segList'); if (!el) return;
  const n = SEG.layers.filter(l => l.on).length;
  $('#segCount').textContent = SEG.tiles.length > 1 ? t('countSelImg', { n: SEG.layers.length, s: n, img: SEG.tiles.length }) : t('countSel', { n: SEG.layers.length, s: n });
  const bs = $('#bSave'); if (bs) { bs.textContent = n ? t('saveSel', { n }) : t('saveHint'); bs.disabled = !n; }
  /* 元素列表做成卡片网格：列数随侧栏宽度自动变，缩略图给足空间，不再一小条一小条地挤着 */
  const BOX = 96;
  /* 图层集合没变（只是勾选 / 选中 / 改名）时不重建 DOM：
     点一下元素就重建几十张卡片是选取卡顿的主要来源。 */
  const sig = I18N.lang + '|' + SEG.layers.map(l => l.id).join(',');
  const same = el.dataset.sig === sig && !!el.querySelector('.segCard');
  if (!same) {
    /* 整块重画会把滚动位置弹回顶部，先记住、画完再放回去。
       注意：真正滚的是 #segList 自己（max-height:280px + overflow:auto），外面那层 .inspBody 有时也在滚，两个都要还回去 */
    const box = el.closest('.inspBody') || el.parentElement;
    const keepTop = el.scrollTop;
    const keepBody = box ? box.scrollTop : 0;
    el.innerHTML = SEG.layers.length ? SEG.layers.map(L => {
      const tile = SEG.tiles[L.tile];
      return `<div class="segCard${L.on ? ' sel' : ''}" data-l="${L.id}">
      <div class="scBox"><canvas data-lt="${L.id}" width="${BOX}" height="${BOX}"></canvas>
        <input type="checkbox" data-lc="${L.id}" ${L.on ? 'checked' : ''}>
        <button class="pv" data-lp="${L.id}" title="${t('pvOpenTip')}" aria-label="${t('pvOpenTip')}">${IC.zoom}</button></div>
      <input class="segName" data-ln="${L.id}" value="${esc(L.name)}">
      <span class="dim">${L.bw}×${L.bh}</span>
      ${SEG.tiles.length > 1 && tile ? `<span class="src" title="${esc(tile.name)}">${esc(tile.name)}</span>` : ''}
    </div>`; }).join('') : '<div class="tip">' + t('noElems') + '</div>';
    el.dataset.sig = sig;
    if (box) box.scrollTop = keepBody;
    el.scrollTop = keepTop;
  } else {
    for (const L of SEG.layers) {
      const card = el.querySelector(`.segCard[data-l="${L.id}"]`); if (!card) continue;
      card.classList.toggle('sel', !!L.on);
      const ck = card.querySelector('input[data-lc]');
      if (ck && ck.checked !== !!L.on) ck.checked = !!L.on;
      const nm = card.querySelector('input[data-ln]');
      if (nm && document.activeElement !== nm && nm.value !== L.name) nm.value = L.name;
    }
  }
  el.querySelectorAll('canvas[data-lt]').forEach(cv => {
    const L = SEG.layers.find(l => l.id === cv.dataset.lt); if (!L) return;
    const g = cv.getContext('2d'), w = L.bw, h = L.bh, s = Math.min(BOX / w, BOX / h);
    const dw = Math.max(1, Math.round(w * s)), dh = Math.max(1, Math.round(h * s));
    g.clearRect(0, 0, BOX, BOX);
    g.drawImage(segCut(L, 0).cv, Math.round((BOX - dw) / 2), Math.round((BOX - dh) / 2), dw, dh);
  });
}

/* ───────── 元素预览：左边长条缩略图（滚轮 / 方向键翻页），右边放大看 ─────────
 * 两种来源：拆元素页的 SEG.layers（带勾选 / 橡皮改蒙版）、画板 Board.state.layers（不勾选，橡皮改位图）。
 * 滚轮以鼠标为中心缩放，中键拖动平移，双击复位。
 * 面板挂在 body 上：拆元素页会整块重画，挂在 #v-edit 里会被冲掉。 */
const PV = {
  open: false, i: 0, mode: 'seg', z: 1, px: 0, py: 0, erase: false, add: false, brush: 32,
  drag: null, snap: null, cursor: null, _src: null, segHist: [], segHistBytes: 0, boardHist: 0, libItems: null
};
const pvItems = () => PV.mode === 'board' ? (Board.state.layers || [])
  : PV.mode === 'lib' ? (PV.libItems || []) : SEG.layers;
function pvEl() {
  let el = $('#pv');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'pv';
  el.className = 'pvWrap';
  el.innerHTML = `<div class="pvPanel" role="dialog" aria-modal="true">
    <div class="pvHead"><b class="pvTitle">${t('pvTitle')}</b><span class="pvName"></span><span class="pvSize dim"></span><span class="sp"></span>
      <button class="pvUndo" title="${t('undo')} (Ctrl+Z)" aria-label="${t('undo')}">↶</button>
      <button class="pvErase" title="${t('pvEraseTip')}" aria-label="${t('pvErase')}">${IC.eraser}</button>
      <button class="pvAdd" title="${t('pvAddTip')}" aria-label="${t('pvAdd')}">${IC.brush}</button>
      <button class="pvFit" title="${t('pvResetTip')}">${t('pvReset')}</button>
      <span class="pvIdx dim"></span>
      <button class="pvX" title="${t('close')}" aria-label="${t('close')}">×</button></div>
    <div class="pvBody"><div class="pvStrip" id="pvStrip"></div><div class="pvStage" id="pvStage"><canvas id="pvCv"></canvas></div></div>
    <div class="pvFoot"><span class="tip pvHint">${t('pvHint')}</span>
      <label class="pvBrushRow"><span>${t('pvBrush')}</span><input id="pvBrush" type="range" min="4" max="240" step="1" value="32"><b id="pvBrushN">32</b></label>
      <span class="pvZoom"><button class="pvZb" id="pvZo" title="${t('bdZoomOut')}">−</button><b id="pvZl">100%</b><button class="pvZb" id="pvZi" title="${t('bdZoomIn')}">+</button></span>
      <span class="sp"></span>
      <label class="pvChkRow"><input type="checkbox" id="pvChk"><span>${t('pvCheck')}</span></label></div>
  </div>`;
  document.body.appendChild(el);
  el.onclick = (e) => { if (e.target === el) pvClose(); };
  el.querySelector('.pvX').onclick = () => pvClose();
  el.querySelector('.pvFit').onclick = () => { pvFit(); pvDraw(); };
  el.querySelector('.pvUndo').onclick = () => pvUndo();
  el.querySelector('.pvErase').onclick = () => pvTogglePaint('erase');
  el.querySelector('.pvAdd').onclick = () => pvTogglePaint('add');
  $('#pvZo').onclick = () => pvZoomCenter(1 / 1.25);
  $('#pvZi').onclick = () => pvZoomCenter(1.25);
  $('#pvBrush').oninput = (e) => { PV.brush = +e.target.value || 32; const n = $('#pvBrushN'); if (n) n.textContent = Math.round(PV.brush); pvDraw(); };
  $('#pvChk').onchange = (e) => { if (PV.open && PV.mode === 'seg') pvToggle(PV.i, e.target.checked); };
  const strip = $('#pvStrip');
  strip.onclick = (e) => {
    const it = e.target.closest('.pvItem'); if (!it) return;
    if (e.target.matches('input')) return;      /* 复选框走 change，不要顺带翻页 */
    pvSelect(+it.dataset.i);
  };
  strip.onchange = (e) => {
    if (!e.target.matches('.pvCk')) return;
    const it = e.target.closest('.pvItem'); if (it) pvToggle(+it.dataset.i, e.target.checked);
  };
  /* 视图操作：滚轮缩放、中键平移、左键橡皮、双击复位 */
  const stage = $('#pvStage');
  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = stage.getBoundingClientRect();
    pvZoom(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });
  stage.addEventListener('pointerdown', (e) => {
    if (e.button === 1) {
      e.preventDefault();
      PV.drag = { k: 'pan', sx: e.clientX, sy: e.clientY, px: PV.px, py: PV.py };
      try { stage.setPointerCapture(e.pointerId); } catch (_) { }
      return;
    }
    if (e.button === 0 && (PV.erase || PV.add)) {
      const L = pvItems()[PV.i];
      if (!L) return;
      if (PV.mode === 'board' && L.kind === 'text') { toast(t(PV.add ? 'pvAddText' : 'pvEraseText')); return; }
      PV.drag = { k: PV.add ? 'add' : 'erase', pid: e.pointerId, last: null };
      if (PV.mode === 'board') {
        PV.snap = Board.beginAction();
        const work = Board.paintBegin(L, PV.add);
        if (!work) { PV.drag = null; return; }
        PV._src = { key: PV._src ? PV._src.key : '', cv: work.cv, w: L.w, h: L.h, base: work.base };
        PV.boardHist++;
      } else if (PV.mode === 'seg') {
        /* 先把「已经补过边 / 填过洞」的蒙版固化下来再涂，否则一涂就从当前看到的
         * 效果退回原始蒙版，整块背景看起来像被擦掉了一样。补画笔同样要固化。 */
        segEraseBegin(L);
        const sz = L.m.length;
        while (PV.segHist.length && (PV.segHist.length >= 12 || PV.segHistBytes + sz > 48e6)) {
          PV.segHistBytes -= PV.segHist[0].m.length;
          PV.segHist.shift();
        }
        PV.segHist.push({ L, m: new Uint8Array(L.m) });
        PV.segHistBytes += sz;
        pvSyncUndo();
      }
      try { stage.setPointerCapture(e.pointerId); } catch (_) { }
      pvEraseAt(e);
    }
  });
  stage.addEventListener('pointermove', (e) => {
    const r = stage.getBoundingClientRect();
    PV.cursor = { sx: e.clientX - r.left, sy: e.clientY - r.top };
    if (PV.drag && PV.drag.k === 'pan') {
      PV.px = PV.drag.px + e.clientX - PV.drag.sx;
      PV.py = PV.drag.py + e.clientY - PV.drag.sy;
      pvDraw();
    } else if (PV.drag && (PV.drag.k === 'erase' || PV.drag.k === 'add') && e.pointerId === PV.drag.pid) {
      pvEraseAt(e);
    } else if (PV.erase || PV.add) pvDraw();
  });
  stage.addEventListener('pointerup', pvEndDrag);
  stage.addEventListener('pointercancel', pvEndDrag);
  stage.addEventListener('dblclick', () => { pvFit(); pvDraw(); });
  return el;
}
function pvEndDrag(e) {
  const d = PV.drag; PV.drag = null;
  if (d && (d.k === 'erase' || d.k === 'add')) {
    if (PV.mode === 'seg') {
      segList(); segRenderSoon(); PV._src = null;
    } else {
      Board.commitAction(PV.snap); PV.snap = null;
      Board.draw(); pvStrip();
    }
    pvDraw();
  }
  pvSyncUndo();
  try { const st = $('#pvStage'); if (st) st.releasePointerCapture(e.pointerId); } catch (_) { }
}
function pvSyncUndo() {
  const b = $('#pv .pvUndo'); if (!b) return;
  b.disabled = !(PV.mode === 'board' ? (PV.boardHist > 0 && Board.canUndo()) : PV.mode === 'seg' ? PV.segHist.length > 0 : false);
}
/** 预览窗里的撤回：只服务橡皮。画板只撤本次预览里擦过的笔数，不会误撤外面更早的操作 */
function pvUndo() {
  if (PV.mode === 'board') {
    if (PV.boardHist <= 0) return;
    Board.undo(); PV.boardHist--; PV._src = null; Board.draw(); pvStrip(); pvDraw();
  } else if (PV.mode === 'seg') {
    const s = PV.segHist.pop(); if (!s) return;
    PV.segHistBytes = Math.max(0, PV.segHistBytes - s.m.length);
    s.L.m = s.m; s.L.manual = true; s.L.mp = null; s.L._cuts = null;
    segRebuildTint(s.L);
    segList(); segRenderSoon(); PV._src = null; pvStrip(); pvDraw();
  }
  pvSyncUndo();
}
function pvOpenLib(items, rel) {
  const list = (items || []).filter(x => x && x.rel);
  if (!list.length) return;
  Promise.all(list.map(it => new Promise(res => {
    const im = new Image();
    im.onload = () => res({ id: it.rel, name: it.name, url: it.url, img: im, w: im.naturalWidth, h: im.naturalHeight });
    im.onerror = () => res(null);
    im.src = it.url;
  }))).then(list2 => {
    PV.libItems = list2.filter(Boolean);
    pvOpenAt('lib', rel);
  });
}
function pvOpen(id) { pvOpenAt('seg', id); }
function pvOpenBoard(id) {
  if (!Board.state.layers.length) { toast(t('bdPreviewEmpty')); return; }
  pvOpenAt('board', id);
}
function pvOpenAt(mode, id) {
  const el = pvEl();
  PV.mode = mode;
  const items = pvItems();
  if (!items.length) { toast(mode === 'seg' ? t('pvEmpty') : mode === 'board' ? t('bdPreviewEmpty') : t('pvEmpty')); return; }
  PV.open = true;
  const i = items.findIndex(l => l.id === id);
  PV.i = i < 0 ? 0 : i;
  PV.erase = false; PV.add = false; PV.cursor = null; PV._src = null; PV.segHist = []; PV.segHistBytes = 0; PV.boardHist = 0;
  el.classList.remove('pvEraseOn');
  const erBtn = el.querySelector('.pvErase'); if (erBtn) erBtn.classList.remove('on');
  const adBtn = el.querySelector('.pvAdd'); if (adBtn) adBtn.classList.remove('on');
  /* 面板是复用的：切了界面语言后，静态文案在这里重新取一次 */
  el.querySelector('.pvUndo').title = t('undo') + ' (Ctrl+Z)';
  el.querySelector('.pvErase').title = t('pvEraseTip');
  el.querySelector('.pvErase').setAttribute('aria-label', t('pvErase'));
  el.querySelector('.pvAdd').title = t('pvAddTip');
  el.querySelector('.pvAdd').setAttribute('aria-label', t('pvAdd'));
  el.querySelector('.pvFit').title = t('pvResetTip');
  el.querySelector('.pvFit').textContent = t('pvReset');
  el.querySelector('.pvChkRow span').textContent = t('pvCheck');
  el.querySelector('.pvBrushRow span').textContent = t('pvBrush');
  el.querySelector('.pvTitle').textContent = mode === 'board' ? t('pvBoardTitle') : mode === 'lib' ? t('pvLibTitle') : t('pvTitle');
  el.querySelector('.pvHint').textContent = mode === 'board' ? t('pvBoardHint') : mode === 'lib' ? t('pvLibHint') : t('pvHint');
  el.querySelector('.pvChkRow').style.display = mode === 'seg' ? '' : 'none';
  el.classList.add('on');
  pvStrip();
  pvSelect(PV.i, true);
  pvSyncUndo();
}
function pvClose() { PV.open = false; PV.drag = null; const el = $('#pv'); if (el) el.classList.remove('on'); }
function pvThumb(L) {
  if (PV.mode === 'board') return Board.layerCanvas(L);
  if (PV.mode === 'lib') return L && L.img ? { cv: L.img, w: L.w, h: L.h } : null;
  const cut = segCut(L, 0).cv;
  return { cv: cut, w: cut.width, h: cut.height };
}
function pvStrip() {
  const box = $('#pvStrip'); if (!box) return;
  box.innerHTML = pvItems().map((L, i) => `<div class="pvItem${i === PV.i ? ' on' : ''}" data-i="${i}">
    <canvas data-pi="${i}" width="56" height="56"></canvas>
    <div class="pvMeta"><b title="${esc(L.name || '')}">${esc(L.name || t('bdText'))}</b><span>${Math.round(L.bw || L.w)}×${Math.round(L.bh || L.h)}</span></div>
    ${PV.mode === 'seg' ? `<input type="checkbox" class="pvCk" ${L.on ? 'checked' : ''} title="${t('pvCheck')}">` : ''}</div>`).join('');
  box.querySelectorAll('canvas[data-pi]').forEach(cv => {
    const L = pvItems()[+cv.dataset.pi]; if (!L) return;
    const im = pvThumb(L); if (!im) return;
    const g = cv.getContext('2d'), BOX = 56, s = Math.min(BOX / im.w, BOX / im.h);
    const dw = Math.max(1, Math.round(im.w * s)), dh = Math.max(1, Math.round(im.h * s));
    g.clearRect(0, 0, BOX, BOX);
    g.imageSmoothingQuality = 'high';
    g.drawImage(im.cv, Math.round((BOX - dw) / 2), Math.round((BOX - dh) / 2), dw, dh);
  });
}
function pvSelect(i, quiet) {
  const n = pvItems().length; if (!n) return;
  i = Math.max(0, Math.min(n - 1, i));
  PV.i = i;
  const L = pvItems()[i], el = $('#pv'); if (!L || !el) return;
  PV._src = null;
  el.querySelectorAll('.pvItem').forEach(it => it.classList.toggle('on', +it.dataset.i === i));
  const cur = el.querySelector(`.pvItem[data-i="${i}"]`);
  if (cur && !quiet && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest' });
  el.querySelector('.pvName').textContent = L.name || (PV.mode === 'board' ? t('bdText') : '');
  el.querySelector('.pvSize').textContent = Math.round(L.bw || L.w) + ' × ' + Math.round(L.bh || L.h);
  el.querySelector('.pvIdx').textContent = (i + 1) + ' / ' + n;
  if (PV.mode === 'seg') $('#pvChk').checked = !!L.on;
  const er = el.querySelector('.pvErase'), ad = el.querySelector('.pvAdd');
  const canErase = PV.mode !== 'lib' && !(PV.mode === 'board' && L.kind === 'text');
  er.disabled = !canErase; ad.disabled = !canErase;
  if (!canErase && (PV.erase || PV.add)) {
    PV.erase = false; PV.add = false; el.classList.remove('pvEraseOn');
    const b = el.querySelector('.pvErase'); if (b) b.classList.remove('on');
    const a = el.querySelector('.pvAdd'); if (a) a.classList.remove('on');
  }
  pvFit(); pvDraw(); pvSyncUndo();
}
/** 橡皮 / 补画笔二选一；文字层禁用 */
function pvTogglePaint(kind) {
  const L = pvItems()[PV.i]; if (!L) return;
  if (PV.mode === 'lib' || (PV.mode === 'board' && L.kind === 'text')) { toast(t(kind === 'add' ? 'pvAddText' : 'pvEraseText')); return; }
  const next = !PV[kind];
  PV.erase = false; PV.add = false;
  PV[kind] = next; PV._src = null;
  const el = $('#pv');
  if (el) {
    el.classList.toggle('pvEraseOn', PV.erase || PV.add);
    const b = el.querySelector('.pvErase'); if (b) b.classList.toggle('on', PV.erase);
    const a = el.querySelector('.pvAdd'); if (a) a.classList.toggle('on', PV.add);
  }
  pvDraw();
}
function pvSrc() {
  const L = pvItems()[PV.i]; if (!L) return null;
  const key = PV.mode + ':' + L.id;
  if (PV._src && PV._src.cv) return PV._src;
  if (PV.mode === 'seg') {
    const cut = segCut(L, 1).cv;
    PV._src = { key, cv: cut, w: cut.width, h: cut.height };
  } else if (PV.mode === 'lib') {
    if (!L.img) return null;
    PV._src = { key, cv: L.img, w: L.w, h: L.h };
  } else {
    const im = Board.layerCanvas(L); if (!im) return null;
    PV._src = { key, cv: im.cv, w: im.w, h: im.h };
  }
  return PV._src;
}
function pvStageSize() {
  const st = $('#pvStage'); if (!st) return [0, 0];
  return [st.clientWidth, st.clientHeight];
}
function pvFit() {
  const im = pvSrc(); if (!im) return;
  const [sw, sh] = pvStageSize(); if (!sw || !sh) return;
  PV.z = Math.max(0.02, Math.min((sw - 56) / im.w, (sh - 56) / im.h, 3));
  PV.px = 0; PV.py = 0;
}
function pvZoom(k, sx, sy) {
  const [sw, sh] = pvStageSize(); if (!sw || !sh) return;
  const z = Math.max(0.02, Math.min(16, PV.z * k));
  const cx = (sx - sw / 2 - PV.px) / PV.z, cy = (sy - sh / 2 - PV.py) / PV.z;
  PV.z = z; PV.px = sx - sw / 2 - cx * z; PV.py = sy - sh / 2 - cy * z;
  pvDraw();
}
function pvZoomCenter(k) {
  const [sw, sh] = pvStageSize();
  if (sw && sh) pvZoom(k, sw / 2, sh / 2);
}
function pvDraw() {
  const im = pvSrc(), cv = $('#pvCv'), stage = $('#pvStage');
  if (!im || !cv || !stage) return;
  const sw = stage.clientWidth, sh = stage.clientHeight; if (!sw || !sh) return;
  const dpr = window.devicePixelRatio || 1;
  if (cv.width !== Math.round(sw * dpr) || cv.height !== Math.round(sh * dpr)) {
    cv.width = Math.round(sw * dpr); cv.height = Math.round(sh * dpr);
    cv.style.width = sw + 'px'; cv.style.height = sh + 'px';
  }
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, sw, sh);
  g.save(); g.translate(sw / 2 + PV.px, sh / 2 + PV.py); g.scale(PV.z, PV.z);
  g.imageSmoothingQuality = 'high';
  g.drawImage(im.cv, -im.w / 2, -im.h / 2, im.w, im.h);
  g.restore();
  const zl = $('#pvZl'); if (zl) zl.textContent = Math.round(PV.z * 100) + '%';
  /* 橡皮圈 / 补画笔圈：屏幕大小恒定，直接告诉用户会涂到多大一片 */
  if ((PV.erase || PV.add) && PV.cursor) {
    const r = Math.max(2, PV.brush * PV.z);
    g.save(); g.strokeStyle = PV.add ? 'rgba(82,227,189,.95)' : 'rgba(255,255,255,.92)'; g.lineWidth = 1.5;
    g.beginPath(); g.arc(PV.cursor.sx, PV.cursor.sy, r, 0, 7); g.stroke();
    g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 1;
    g.beginPath(); g.arc(PV.cursor.sx, PV.cursor.sy, r + 1.2, 0, 7); g.stroke(); g.restore();
  }
}
function pvEraseAt(e) {
  const L = pvItems()[PV.i], im = pvSrc(), stage = $('#pvStage');
  if (!L || !im || !stage) return;
  const r = stage.getBoundingClientRect();
  const sx = e.clientX - r.left, sy = e.clientY - r.top;
  const ix = (sx - stage.clientWidth / 2 - PV.px) / PV.z + im.w / 2;
  const iy = (sy - stage.clientHeight / 2 - PV.py) / PV.z + im.h / 2;
  PV.cursor = { sx, sy };
  const one = (x, y) => {
    if (PV.mode === 'seg') {
      if (PV.add) segAddDot(L, im.cv, x, y, PV.brush); else segEraseDot(L, im.cv, x, y, PV.brush);
    } else Board.paintDot(im.cv, im.base, x, y, PV.brush, PV.add);
  };
  const last = PV.drag && PV.drag.last;
  if (last) {
    /* 指针事件是离散的，快速拖动时要在两点之间补点，不然橡皮会断断续续 */
    const dist = Math.hypot(ix - last.x, iy - last.y);
    const step = Math.max(2, PV.brush * 0.35);
    const n = Math.max(1, Math.ceil(dist / step));
    for (let i = 1; i <= n; i++) one(last.x + (ix - last.x) * i / n, last.y + (iy - last.y) * i / n);
  } else one(ix, iy);
  if (PV.drag) PV.drag.last = { x: ix, y: iy };
  if (PV.mode === 'board') Board.draw();
  pvDraw();
}
/** 拆元素橡皮落笔前：把当前看到的（补过缝 / 填过洞的）蒙版固化成手动蒙版，
 *  这样擦除只影响笔刷范围，不会因为切到 manual 而让整块背景突然变样。 */
function segEraseBegin(L) {
  if (!L || !L.m || L.manual) return;
  const M = segPolishMask(L);
  L.m = new Uint8Array(M);
  L.manual = true; L.mp = null; L._cuts = null;
  segRebuildTint(L);
}
/** 用当前蒙版重建主画布上的彩色提示层（橡皮把蒙版改掉之后要同步） */
function segRebuildTint(L) {
  if (!L || !L.m || !L.color) return;
  const c = document.createElement('canvas'); c.width = L.bw; c.height = L.bh;
  const g = c.getContext('2d'), id = g.createImageData(L.bw, L.bh);
  const rgb = [parseInt(L.color.slice(1, 3), 16) || 82, parseInt(L.color.slice(3, 5), 16) || 227, parseInt(L.color.slice(5, 7), 16) || 189];
  for (let i = 0; i < L.m.length; i++) {
    if (!L.m[i]) continue;
    const j = i * 4;
    id.data[j] = rgb[0]; id.data[j + 1] = rgb[1]; id.data[j + 2] = rgb[2]; id.data[j + 3] = 255;
  }
  g.putImageData(id, 0, 0);
  L.tint = c;
}
/** 拆元素蒙版橡皮：cut 坐标含 1px padding，蒙版坐标要减 1；顺带同步 tint 和缓存 */
function segEraseDot(L, cutCv, cx, cy, r) {
  if (!L || !L.m) return;
  const x0 = Math.max(0, Math.floor(cx - 1 - r)), x1 = Math.min(L.bw - 1, Math.ceil(cx - 1 + r));
  const y0 = Math.max(0, Math.floor(cy - 1 - r)), y1 = Math.min(L.bh - 1, Math.ceil(cy - 1 + r));
  const rr = r * r;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const dx = x - (cx - 1), dy = y - (cy - 1);
    if (dx * dx + dy * dy <= rr) L.m[y * L.bw + x] = 0;
  }
  if (L.tint) {
    const g = L.tint.getContext('2d');
    g.save(); g.globalCompositeOperation = 'destination-out';
    g.beginPath(); g.arc(cx - 1, cy - 1, Math.max(1, r), 0, 7); g.fill(); g.restore();
  }
  if (cutCv) {
    const g = cutCv.getContext('2d');
    g.save(); g.globalCompositeOperation = 'destination-out';
    g.beginPath(); g.arc(cx, cy, Math.max(1, r), 0, 7); g.fill(); g.restore();
  }
  L.manual = true; L.mp = null; L._cuts = null;
}
/** 拆元素补画笔：把原始图上这一小片重新画回蒙版和预览图里 */
function segSourceCv(L) {
  if (L._srcCv) return L._srcCv;
  const tl = SEG.tiles[L.tile] || segCurTile(), src = (tl && tl.src) || SEG.src;
  if (!src) return null;
  const c = document.createElement('canvas'); c.width = L.bw + 2; c.height = L.bh + 2;
  /* 整体平移绘制，让源图像素 (bx,by) 落在 (1,1)，和 segCut 的 1px padding 对齐 */
  c.getContext('2d').drawImage(src.cv, 1 - L.bx, 1 - L.by);
  L._srcCv = c; return c;
}
function segAddDot(L, cutCv, cx, cy, r) {
  if (!L || !L.m) return;
  const x0 = Math.max(0, Math.floor(cx - 1 - r)), x1 = Math.min(L.bw - 1, Math.ceil(cx - 1 + r));
  const y0 = Math.max(0, Math.floor(cy - 1 - r)), y1 = Math.min(L.bh - 1, Math.ceil(cy - 1 + r));
  const rr = r * r;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const dx = x - (cx - 1), dy = y - (cy - 1);
    if (dx * dx + dy * dy <= rr) L.m[y * L.bw + x] = 1;
  }
  if (L.tint) {
    const g = L.tint.getContext('2d');
    g.save(); g.fillStyle = L.color || '#52e3bd';
    g.beginPath(); g.arc(cx - 1, cy - 1, Math.max(1, r), 0, 7); g.fill(); g.restore();
  }
  if (cutCv) {
    const src = segSourceCv(L), g = cutCv.getContext('2d');
    if (src) {
      g.save(); g.beginPath(); g.arc(cx, cy, Math.max(1, r), 0, 7); g.clip();
      g.drawImage(src, 0, 0); g.restore();
    }
  }
  L.manual = true; L.mp = null; L._cuts = null;
}
function pvToggle(i, on) {
  if (PV.mode !== 'seg') return;
  const L = SEG.layers[i]; if (!L) return;
  L.on = !!on;
  if (L.on) SEG.sel = new Set([L.id]);
  $('#pvChk').checked = !!on;
  const ck = document.querySelector(`#pvStrip .pvItem[data-i="${i}"] .pvCk`);
  if (ck) ck.checked = !!on;
  segList(); segRender();
}
function pvStep(d) { if (PV.open) pvSelect(PV.i + d); }
window.addEventListener('resize', () => { if (PV.open) { pvFit(); pvDraw(); } });
/* 鼠标移动时把重绘合并到下一帧：套索每个 pointermove 都全画一遍会很卡 */
let _segRaf = 0;
function segRenderSoon() {
  if (_segRaf) return;
  _segRaf = requestAnimationFrame(() => { _segRaf = 0; segRender(); });
}
function segRender() {
  const cv = $('#segCv'); if (!cv || !SEG.src) return;
  const g = cv.getContext('2d'), W = SEG.wall.w || SEG.src.w, H = SEG.wall.h || SEG.src.h;
  g.clearRect(0, 0, W, H);
  /* 拼贴墙：所有导入的图统一缩放、网格铺开，当前操作的那块高亮 */
  for (const tile of SEG.tiles) {
    const act = (tile === segCurTile());
    g.save(); g.globalAlpha = act ? 1 : .45;
    g.drawImage(tile.src.cv, tile.x, tile.y, tile.w * tile.sc, tile.h * tile.sc);
    g.restore();
    g.save(); g.strokeStyle = act ? '#52e3bd' : 'rgba(255,255,255,.18)'; g.lineWidth = act ? 2 : 1;
    g.strokeRect(tile.x - .5, tile.y - .5, tile.w * tile.sc + 1, tile.h * tile.sc + 1); g.restore();
    if (SEG.tiles.length > 1) {
      g.save(); g.font = `${Math.max(11, 14 * tile.sc)}px sans-serif`; g.fillStyle = act ? '#52e3bd' : 'rgba(255,255,255,.55)';
      g.fillText(tile.name, tile.x + 2, tile.y - 6); g.restore();
    }
  }
  const tile = segCurTile(); if (!tile) return;
  const sc = tile.sc, ox = tile.x, oy = tile.y;
  for (const L of SEG.layers) {
    if (L.tile !== SEG.cur) continue;
    const hov = SEG.hov === L.id;
    g.globalAlpha = L.on ? .3 : hov ? .22 : .0;
    g.drawImage(L.tint, ox + L.bx * sc, oy + L.by * sc, L.bw * sc, L.bh * sc);
  }
  g.globalAlpha = 1;
  const lw = Math.max(2, tile.w * sc / 400);
  for (const L of SEG.layers) {
    if (L.tile !== SEG.cur) continue;
    if (!(L.on || SEG.hov === L.id || SEG.sel.has(L.id))) continue;
    g.strokeStyle = L.on ? '#52e3bd' : L.color; g.lineWidth = lw; g.setLineDash([8, 6]);
    g.strokeRect(ox + L.bx * sc - 1, oy + L.by * sc - 1, L.bw * sc + 2, L.bh * sc + 2); g.setLineDash([]);
  }
  /* AI 提示点：绿 + 是选中点，红 − 是反选点 */
  if (SEG.tool === 'ai' && SEG.aiPts.length) {
    for (const p of SEG.aiPts) {
      const px = ox + p.x * sc, py = oy + p.y * sc, rr = Math.max(7, 11 * sc);
      g.save();
      g.beginPath(); g.arc(px, py, rr + 2, 0, 7); g.fillStyle = 'rgba(0,0,0,.45)'; g.fill();
      g.beginPath(); g.arc(px, py, rr, 0, 7);
      g.fillStyle = p.neg ? 'rgba(255,72,72,.96)' : 'rgba(34,212,160,.96)'; g.fill();
      g.lineWidth = 2; g.strokeStyle = '#fff'; g.stroke();
      g.beginPath(); g.moveTo(px - rr * .48, py); g.lineTo(px + rr * .48, py);
      if (!p.neg) { g.moveTo(px, py - rr * .48); g.lineTo(px, py + rr * .48); }
      g.lineWidth = 2.2; g.strokeStyle = '#fff'; g.lineCap = 'round'; g.stroke(); g.restore();
    }
  }
  if (SEG.lasso && SEG.lasso.length > 1) {
    g.strokeStyle = '#fff'; g.lineWidth = lw; g.setLineDash([6, 5]); g.beginPath();
    SEG.lasso.forEach((p, i) => i ? g.lineTo(ox + p[0] * sc, oy + p[1] * sc) : g.moveTo(ox + p[0] * sc, oy + p[1] * sc)); g.stroke(); g.setLineDash([]);
  }
}
function segAt(x, y) {
  let best = null;
  for (const L of SEG.layers) {
    if (L.tile !== SEG.cur) continue;
    if (x < L.bx || y < L.by || x >= L.bx + L.bw || y >= L.by + L.bh) continue;
    if (L.m[(Math.floor(y) - L.by) * L.bw + Math.floor(x) - L.bx] && (!best || L.area < best.area)) best = L;
  }
  return best;
}
/* 屏幕坐标 → 拼贴墙坐标 → 落在哪张图上 → 该图内的像素坐标 */
function segWallPt(e) {
  const cv = $('#segCv'), r = cv.getBoundingClientRect();
  const W = SEG.wall.w || 1, H = SEG.wall.h || 1;
  const wx = (e.clientX - r.left) * W / r.width, wy = (e.clientY - r.top) * H / r.height;
  const tile = segTileAt(wx, wy);
  if (!tile) return { wx, wy, tile: null, x: 0, y: 0 };
  return { wx, wy, tile, x: Math.floor((wx - tile.x) / tile.sc), y: Math.floor((wy - tile.y) / tile.sc) };
}
function segPt(e) {
  const p = segWallPt(e);
  if (p.tile && p.tile !== segCurTile()) setCurTile(p.tile);
  const tl = segCurTile(); if (!tl) return [0, 0];
  return [Math.max(0, Math.min(tl.w - 1, p.x)), Math.max(0, Math.min(tl.h - 1, p.y))];
}
/* 手动新建的元素默认就是选中的 */
const _segApply = segApply;
segApply = function (full) { const before = new Set(SEG.layers.map(l => l.id)); _segApply(full); SEG.layers.forEach(l => { if (!before.has(l.id)) l.on = true; }); };

async function buildOut() {
  const items = SEG.layers.filter(l => l.on), out = [];
  if (!items.length) { toast(t('pickFirst')); return null; }
  /* 「剩下的部分也存成一层」：每张图各算一份。
     批量导入时几张图的坐标不在同一张画布上，只算当前这张会把其它图剩下的像素静默丢掉。 */
  if ($('#segResid') && $('#segResid').checked) {
    const multi = SEG.tiles.length > 1, done = new Set();
    const tileOf = (L) => (L.tile == null ? SEG.cur : L.tile);
    for (const L of items) {
      const ti = tileOf(L);
      if (done.has(ti)) continue;
      done.add(ti);
      const tile = SEG.tiles[ti];
      if (!tile || !tile.src) continue;
      const { w, h, data } = tile.src, full = new Uint8Array(w * h);
      for (const M of items) {
        if (tileOf(M) !== ti) continue;
        for (let y = 0; y < M.bh; y++) for (let x = 0; x < M.bw; x++) if (M.m[y * M.bw + x]) full[(M.by + y) * w + M.bx + x] = 1;
      }
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const g = cv.getContext('2d'), id = g.createImageData(w, h);
      for (let i = 0; i < w * h; i++) { if (full[i]) continue; const j = i * 4; id.data[j] = data[j]; id.data[j + 1] = data[j + 1]; id.data[j + 2] = data[j + 2]; id.data[j + 3] = data[j + 3]; }
      g.putImageData(id, 0, 0);
      /* 批量时名字带上原图名，否则几张「背景」会互相覆盖成 背景.png / 背景_2.png */
      const base = multi ? String(tile.name || '').replace(/\.[^.]+$/, '') : '';
      out.push({ name: base ? t('bg') + ' - ' + base : t('bg'), cv, x: 0, y: 0, area: 1e12 });
    }
  }
  for (const L of items) { const t = segCut(L, 1); out.push({ name: L.name, cv: t.cv, x: t.px, y: t.py, area: L.area }); await _yield(); }
  return out;
}
async function doSave() {
  segBusy(t('saving')); await _yield();
  const out = await buildOut(); segBusy('');
  if (!out) return;
  const base = String(SEG.name).replace(/\.[^.]+$/, '');
  const files = [];
  for (const o of out) files.push({ name: out.length === 1 ? base : o.name, data: await toBytes(o.cv) });
  const r = await api.saveElements({ files, group: t('grpCap', { s: new Date().toLocaleString('sv').replace(/[: ]/g, '-') }) });
  if (r && r.ok) { toast(t('savedN', { n: r.count })); renderEmpty(); if ($('#v-lib').classList.contains('on')) renderLib(); }
  else toast(t('saveFail'));
}
async function doCopy() {
  const L = SEG.layers.find(l => SEG.sel.has(l.id) && l.on) || SEG.layers.find(l => l.on);
  if (!L) { toast(t('pickOne')); return; }
  await api.copyImage(await toBytes(segCut(L, 1).cv)); toast(t('copied', { n: L.name }));
}
async function doSvg() {
  const out = await buildOut(); if (!out) return;
  out.sort((a, b) => b.area - a.area);
  let s = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${SEG.src.w}" height="${SEG.src.h}" viewBox="0 0 ${SEG.src.w} ${SEG.src.h}">\n`;
  /* 写进文件本身，免得以后有人以为这是矢量图：每个图层其实是内嵌 PNG 位图 */
  s += `  <desc>Layers contain embedded PNG bitmaps (raster), not vector paths. / 每个图层是内嵌 PNG 位图，不是矢量路径。</desc>\n`;
  const used = new Set();
  for (const o of out) { let id = o.name.replace(/[^\w一-龥-]/g, '_') || 'layer', k = id, i = 2; while (used.has(k)) k = id + '_' + i++; used.add(k); s += `  <g id="${k}"><image x="${o.x}" y="${o.y}" width="${o.cv.width}" height="${o.cv.height}" xlink:href="${o.cv.toDataURL('image/png')}"/></g>\n`; }
  s += '</svg>';
  const ok = await api.saveAs({ name: String(SEG.name).replace(/\.[^.]+$/, '') + '-' + t('layersSuffix') + '.svg', data: new TextEncoder().encode(s), filters: [{ name: 'SVG', extensions: ['svg'] }] });
  if (ok) toast(t('svgNonVector'));
}
/* 矢量导出：用 ImageTracer.js（Unlicense，随应用内置）把每个元素描摹成 SVG 路径。
 * 纯色 logo / 文字 / 线条效果最好；太大或太复杂的元素自动保留为内嵌 PNG，保证导出的文件完整。 */
/* 判断一个元素是否适合描摹：纯色块多、主色少、半透明边缘比例不高。
 * 照片 / 渐变 / 复杂插画会被判为不适合，直接保留 PNG，避免导出一堆碎片路径。 */
function vectorFriendly(cv) {
  const w = cv.width, h = cv.height;
  if (w < 3 || h < 3) return false;
  let d;
  try { d = cv.getContext('2d').getImageData(0, 0, w, h).data; } catch (e) { return false; }
  const step = Math.max(1, Math.ceil(Math.sqrt(w * h / 120000)));
  const bins = new Map();
  let vis = 0, semi = 0;
  for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) {
    const i = (y * w + x) * 4, a = d[i + 3];
    if (a < 8) continue;
    vis++; if (a < 235) semi++;
    const k = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4);
    bins.set(k, (bins.get(k) || 0) + 1);
  }
  if (vis < 24) return false;
  let dominant = 0, max = 0;
  for (const v of bins.values()) { if (v > max) max = v; }
  for (const v of bins.values()) if (v / vis >= 0.01) dominant++;
  return dominant <= 20 && max / vis >= 0.05 && semi / vis <= 0.6;
}
async function buildVectorSvg(out) {
  const idOf = (n) => String(n || 'layer').replace(/[^\w一-龥-]/g, '_').slice(0, 48) || 'layer';
  const parts = []; let vec = 0, mixed = 0;
  for (let k = 0; k < out.length; k++) {
    const o = out[k], c = o.cv;
    segBusy(t('svgVecBusy', { i: k + 1, n: out.length }));
    await _yield();
    let inner = '';
    /* 背景层、超大图不描摹：路径会多到失去意义，直接内嵌 PNG */
    const tooBig = o.area >= 1e11 || c.width * c.height > 900000 || !vectorFriendly(c);
    if (!tooBig) {
      try {
        const im = c.getContext('2d').getImageData(0, 0, c.width, c.height);
        const s = ImageTracer.imagedataToSVG(im, {
          numberofcolors: 12, colorsampling: 2, colorquantcycles: 3,
          ltres: 0.8, qtres: 0.8, pathomit: 6, rightangleenhance: true,
          strokewidth: 0, linefilter: true, roundcoords: 2, viewbox: false, desc: false
        });
        const doc = new DOMParser().parseFromString(s, 'image/svg+xml');
        for (const p of [...doc.querySelectorAll('path')]) {
          const op = parseFloat(p.getAttribute('opacity'));
          if (Number.isFinite(op) && op < 0.02) { p.remove(); continue; }
          p.removeAttribute('stroke'); p.removeAttribute('stroke-width');
        }
        inner = [...doc.documentElement.childNodes].map(n => new XMLSerializer().serializeToString(n)).join('');
        if (inner.length > 1200000 || doc.querySelectorAll('path').length > 180) inner = '';
      } catch (e) { inner = ''; }
    }
    if (inner) {
      vec++;
      parts.push(`<g id="${idOf(o.name)}" transform="translate(${o.x} ${o.y})" shape-rendering="geometricPrecision">${inner}</g>`);
    } else {
      mixed++;
      parts.push(`<g id="${idOf(o.name)}"><image x="${o.x}" y="${o.y}" width="${c.width}" height="${c.height}" xlink:href="${c.toDataURL('image/png')}"/></g>`);
    }
  }
  let s = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${SEG.src.w}" height="${SEG.src.h}" viewBox="0 0 ${SEG.src.w} ${SEG.src.h}">\n`;
  s += `  <desc>Vector paths traced from the split elements (ImageTracer.js). Simple logos, text and lines stay sharp at any size; complex elements are embedded as PNG. / 从拆出的元素描摹出的矢量路径；纯色图形放大不糊，复杂元素保留为内嵌 PNG。</desc>\n`;
  s += parts.map(p => '  ' + p).join('\n') + '\n</svg>';
  return { s, vec, mixed };
}
async function doVectorSvg() {
  if (typeof ImageTracer === 'undefined') { toast(t('svgVecFail')); return; }
  const out = await buildOut(); if (!out) return;
  const r = await buildVectorSvg(out);
  segBusy('');
  if (!r.vec) { toast(t('svgVecNotSimple')); return; }
  const ok = await api.saveAs({ name: String(SEG.name).replace(/\.[^.]+$/, '') + '-' + t('layersSuffix') + '-vector.svg', data: new TextEncoder().encode(r.s), filters: [{ name: 'SVG', extensions: ['svg'] }] });
  if (ok) toast(t('svgVecDone', { n: r.vec, v: Math.round(r.s.length / 1024) }) + (r.mixed ? t('svgVecMixed', { f: r.mixed }) : ''));
}
function segBindD() {
  const host = $('#v-edit');
  host.onclick = (e) => {
    const st = e.target.closest('[data-st]');
    if (st) { SEG.tool = st.dataset.st; SEG.lasso = null; SEG.aiPts = []; SEG.aiLayer = null; $('#segTools').querySelectorAll('[data-st]').forEach(b => b.classList.toggle('on', b === st)); segParams(); segRender(); return; }
    const sm = e.target.closest('[data-sm]'); if (sm) { SEG.mode = sm.dataset.sm; segParams(); return; }
    const ap = e.target.closest('[data-ap]'); if (ap) { SEG.aiNeg = ap.dataset.ap === 'neg'; segParams(); return; }
    /* 按钮里放了 SVG 图标时，点到的可能是 <path>，要往上找带 id 的 button */
    const id = (e.target.closest('button[id]') || e.target).id;
    if (id === 'segHide') { api.hideWindow(); return; }
    if (id === 'segRe') { segBusy(t('splitting')); setTimeout(async () => { const info = await segAuto(); SEG.layers.forEach(l => l.on = false); segBusy(''); segRender(); segList(); const ti = $('#segInfo'); if (ti) ti.textContent = info; }, 20); return; }
    if (id === 'segGroup') {
      const r = segGroupText(); SEG.sel.clear(); segRender(); segList();
      if (r.t || r.l) toast(t('txtGroupDone', { t: r.t, l: r.l })); else toast(t('txtGroupNone'));
      return;
    }
    if (id === 'segReAll') { segResplitAll(); return; }
    if (id === 'bAll') { SEG.layers.forEach(l => l.on = true); segList(); segRender(); return; }
    if (id === 'bNone') { SEG.layers.forEach(l => l.on = false); segList(); segRender(); return; }
    if (id === 'bDel') {
      const killed = SEG.layers.filter(l => l.on);
      if (!killed.length) { toast(t('pickOne')); return; }
      SEG.layers = SEG.layers.filter(l => !l.on); SEG.sel.clear(); segList(); segRender();
      undoToast(t('delUndo', { n: killed.length }), {
        undo: () => { SEG.layers.push.apply(SEG.layers, killed); killed.forEach(l => l.on = true); SEG.sel = new Set(killed.map(l => l.id)); segList(); segRender(); }
      });
      return;
    }
    if (id === 'bMerge') {
      const ls = SEG.layers.filter(l => l.on); if (ls.length < 2) { toast(t('pickTwo')); return; }
      const { w, h } = SEG.src, full = new Uint8Array(w * h);
      for (const L of ls) { const f = segFull(L); for (let i = 0; i < f.length; i++) if (f[i]) full[i] = 1; }
      const nl = segLayerFromFull(full, w, h, ls[0].name); nl.on = true; nl.autoName = ls[0].autoName;
      SEG.layers = SEG.layers.filter(l => !l.on); SEG.layers.push(nl); SEG.sel = new Set([nl.id]); segList(); segRender(); return;
    }
    if (id === 'bSave') { doSave(); return; }
    if (id === 'bCopy') { doCopy(); return; }
    if (id === 'bSvg') { doSvg(); return; }
    if (id === 'bVec') { doVectorSvg(); return; }
    if (id === 'bNew') { api.importImage(); return; }
    if (id === 'bClear') {
      const killed = SEG.layers.slice();
      if (!killed.length) { toast(t('noElems')); return; }
      SEG.layers = []; SEG.sel.clear(); segList(); segRender();
      undoToast(t('segCleared', { n: killed.length }), {
        undo: () => { SEG.layers.push.apply(SEG.layers, killed); killed.forEach(l => l.on = false); segList(); segRender(); }
      });
      return;
    }
    const pvBtn = e.target.closest('[data-lp]');
    if (pvBtn) { e.stopPropagation(); pvOpen(pvBtn.dataset.lp); return; }
    const row = e.target.closest('.segRow, .segCard');
    if (row && !e.target.matches('input')) {
      const L = SEG.layers.find(l => l.id === row.dataset.l);
      if (L) {
        const tile = SEG.tiles[L.tile];
        if (tile && tile !== segCurTile()) setCurTile(tile);   // 点哪张图的元素，就切到那张图
        /* 加 / 减 / 拆模式：点卡片 = 把这一层设成“当前元素”，不要顺手取消勾选 */
        if (SEG.mode === 'add' || SEG.mode === 'sub' || SEG.mode === 'split') L.on = true;
        else L.on = !L.on;
        SEG.sel = new Set([L.id]); segList(); segRender(); segParams();
      }
    }
  };
  host.oninput = (e) => {
    const sp = e.target.dataset && e.target.dataset.sp;
    if (sp) { const v = sp === 'how' ? e.target.value : +e.target.value; SEG[sp] = v; const b = e.target.parentElement && e.target.parentElement.querySelector('b'); if (b) b.textContent = v; if (sp === 'how') segParams(); return; }
    if (e.target.dataset && e.target.dataset.ln) { const L = SEG.layers.find(l => l.id === e.target.dataset.ln); if (L) { L.name = e.target.value; L.autoName = null; L.autoKind = null; } }  /* 用户自己改过名字，就不再跟着语言变 */
  };
  host.onchange = (e) => {
    if (e.target.dataset && e.target.dataset.lc) { const L = SEG.layers.find(l => l.id === e.target.dataset.lc); if (L) { L.on = e.target.checked; if (L.on) SEG.sel = new Set([L.id]); segList(); segRender(); segParams(); } }
  };
  const cv = $('#segCv');
  cv.onpointermove = (e) => {
    const p = segWallPt(e);
    if (p.tile !== segCurTile()) { if (SEG.hov) { SEG.hov = null; segRenderSoon(); } return; }
    if (SEG.tool === 'lasso' && SEG.lasso) { SEG.lasso.push(segPt(e)); segRenderSoon(); return; }
    if (SEG.tool !== 'pick') return;
    const [x, y] = segPt(e), L = segAt(x, y), id = L ? L.id : null; if (id !== SEG.hov) { SEG.hov = id; segRenderSoon(); }
  };
  cv.onpointerleave = () => { if (SEG.hov) { SEG.hov = null; segRender(); } };
  cv.onpointerdown = async (e) => {
    const [x, y] = segPt(e);
    if (SEG.tool === 'pick') {
      const L = segAt(x, y);
      if (L) {
        /* 加 / 减 / 拆模式：点一下只是“设成当前元素”，不要再把它取消勾选，否则改完看不见效果 */
        if (SEG.mode === 'add' || SEG.mode === 'sub' || SEG.mode === 'split') L.on = true;
        else L.on = !L.on;
        SEG.sel = new Set([L.id]); segList(); segRender(); segParams();
      } else { SEG.sel.clear(); segList(); segRender(); segParams(); }
      return;
    }
    if (SEG.tool === 'wand') { segApply(segWand(x, y, SEG.wtol || 32)); segList(); segRender(); return; }
    if (SEG.tool === 'ai') {
      const neg = e.altKey ? !SEG.aiNeg : SEG.aiNeg;
      await segAIClick(x, y, neg); segParams(); segList(); return;
    }
    if (SEG.tool === 'lasso') { cv.setPointerCapture(e.pointerId); SEG.lasso = [[x, y]]; }
  };
  cv.onpointerup = () => {
    if (SEG.tool !== 'lasso' || !SEG.lasso) return;
    const pts = SEG.lasso; SEG.lasso = null; if (pts.length < 4) { segRender(); return; }
    const { w, h } = SEG.src, c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); g.fill();
    const d = g.getImageData(0, 0, w, h).data, full = new Uint8Array(w * h); for (let i = 0; i < full.length; i++) full[i] = d[i * 4 + 3] > 127 ? 1 : 0;
    segApply(full); segList(); segRender();
  };
}
/* 预览面板的键盘必须挂在 window 的「捕获」阶段：
 * extras.js / board.js / svg.js 都在 document 捕获阶段吃空格（平移手势）和方向键，
 * 挂冒泡阶段的话空格根本到不了这里。window 捕获比 document 捕获更早，面板打开时先归它管。 */
window.addEventListener('keydown', (e) => {
  if (!PV.open) return;
  const eat = () => { e.preventDefault(); e.stopPropagation(); };
  if (e.key === 'Escape') { eat(); pvClose(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { eat(); pvUndo(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { eat(); if (PV.mode === 'board') { Board.redo(); PV._src = null; Board.draw(); pvStrip(); pvDraw(); } return; }
  if (e.key === 'ArrowDown' || e.key === 'PageDown') { eat(); pvStep(1); return; }
  if (e.key === 'ArrowUp' || e.key === 'PageUp') { eat(); pvStep(-1); return; }
  if (e.key === ' ' || e.code === 'Space') { eat(); if (PV.mode === 'seg') { const L = SEG.layers[PV.i]; if (L) pvToggle(PV.i, !L.on); } return; }
  if (e.key === '+' || e.key === '=') { eat(); pvZoom(1.25, $('#pvStage').clientWidth / 2, $('#pvStage').clientHeight / 2); return; }
  if (e.key === '-') { eat(); pvZoom(1 / 1.25, $('#pvStage').clientWidth / 2, $('#pvStage').clientHeight / 2); return; }
  if (e.key === '0') { eat(); pvFit(); pvDraw(); return; }
  if (e.key === 'Enter') { eat(); return; }
}, true);
/* 键盘：Enter 保存，Esc 收起，Ctrl+A 全选 */
document.addEventListener('keydown', (e) => {
  if (PV.open) return;                     // 面板打开时上面那个捕获监听已经接管
  if (/^(INPUT|SELECT|TEXTAREA)$/.test((e.target.tagName || '')) && e.target.type !== 'checkbox' && e.target.type !== 'range') return;
  if (!$('#v-edit').classList.contains('on') || !SEG.src) { if (e.key === 'Escape') api.hideWindow(); return; }
  if (e.key === 'Enter') { e.preventDefault(); if (SEG.layers.some(l => l.on)) doSave(); }
  else if (e.key === 'Escape') api.hideWindow();
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') { e.preventDefault(); SEG.layers.forEach(l => l.on = true); segList(); segRender(); }
});

async function openDataURL(url, name) {
  try {
    /* 用 onload 而不是 decode()：decode() 在窗口隐藏时可能永远不返回 */
    const img = new Image();
    await new Promise((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('img')); img.src = url; });
    return await openImage(img, img.naturalWidth, img.naturalHeight, name);
  } catch (e) { toast(t('badImg')); }
}
async function openFile(f) {
  try { const bm = await createImageBitmap(f); return await openImage(bm, bm.width, bm.height, f.name || t('image')); } catch (e) { toast(t('badImg')); }
}
/* 批量导入：一次选多张，依次拆开，元素全部汇总 */
async function openFiles(list) {
  return runBatch(async () => {
    segReset();                       /* 新的一批：释放上一批的 canvas / 像素数据，序号归 1 */
    let n = 0;
    for (const f of list) { const c = await openFile(f); if (c) n += c; }
    toast(t('batchDone', { img: list.length, n }));
    return n;
  });
}
/* 外部拖图进来：按当前页签决定怎么处理
 * 拆元素页 → 导入并拆解；画板 → 当图层/底图；素材库 → 直接存进库；SVG 库 / SVG 画布 → 当 SVG 处理 */
const curView = () => { const v = document.querySelector('.view.on'); return v ? v.id : 'v-edit'; };
const DROP_HINT = { 'v-edit': 'dropToSplit', 'v-lib': 'dropToLib', 'v-svglib': 'dropToSvgLib', 'v-svgcanvas': 'dropToSvgCanvas' };
['dragover', 'dragenter'].forEach(ev => document.addEventListener(ev, e => {
  e.preventDefault();
  const d = $('#drop'); if (d) d.classList.add('over');
  const h = $('#dropHint');
  if (h) { h.textContent = t(DROP_HINT[curView()] || 'dropToSplit'); h.classList.add('on'); }
}));
['dragleave', 'drop'].forEach(ev => document.addEventListener(ev, e => {
  e.preventDefault();
  const d = $('#drop'); if (d) d.classList.remove('over');
  const h = $('#dropHint'); if (h) h.classList.remove('on');
}));
document.addEventListener('drop', async (e) => {
  const files = [...(e.dataTransfer && e.dataTransfer.files || [])].filter(x => x.type && x.type.startsWith('image/'));
  if (!files.length) return;
  const v = curView();
  if (v === 'v-board') return;                                     // 画板自己接（拖进去当图层 / 首张当底图）
  if (v === 'v-lib') { await saveDroppedToLib(files[0]); return; }
  if ((v === 'v-svglib' || v === 'v-svgcanvas') && /svg/i.test((files[0].type || '') + files[0].name)) {
    if (v === 'v-svglib') { await SvgLib.importFile(files[0]); } else { await SvgCanvas.openFile(files[0]); }
    return;
  }
  await openFiles(files);                                           // 拆元素：一次多张，全部拆开
});
/* 把图片从桌面拖到左侧导航按钮上 = 直接用那个功能处理它（和拖进右边工作区不一样） */
const NAV_DROP = {
  edit: (f) => { segReset(); return (typeof f === 'string' ? openRelInEdit(f) : openFile(f)); },   // 拆元素：导入并拆（库里的元素也接）
  lib: (f) => saveDroppedToLib(f),         // 素材库：直接存进去
  board: (f) => addFileToBoard(f),         // 画板：加一个图层
  svglib: (f) => SvgLib.importFile(f),     // SVG 库：存成 SVG
  svgcanvas: (f) => SvgCanvas.openFile(f)  // SVG 画布：直接打开
};
/* 素材库 / 画板素材栏拖过来的元素（只有 rel，没有 File）：读出来再拆一次 */
async function openRelInEdit(rel) {
  try {
    const bytes = await api.readLib(rel);
    if (!bytes || !bytes.length) { toast(t('badImg')); return null; }
    const bm = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    return await openImage(bm, bm.width, bm.height, rel.split('/').pop() || t('image'));
  } catch (e) { console.error('openRelInEdit', e); toast(t('badImg')); return null; }
}
$('#nav').addEventListener('dragover', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  b.classList.add('drop');
});
$('#nav').addEventListener('dragleave', (e) => {
  const b = e.target.closest('button'); if (b) b.classList.remove('drop');
});
$('#nav').addEventListener('drop', async (e) => {
  const b = e.target.closest('button'); if (!b) return;
  e.preventDefault(); e.stopPropagation();          // 别让全局 drop 又处理一遍
  b.classList.remove('drop');
  const dt = e.dataTransfer;
  const f = [...(dt && dt.files || [])].find(x => x.type && x.type.startsWith('image/'));
  const rel = (dt && dt.getData('text/x-pixpeel-rel')) || '';
  if (!f && !rel) return;
  /* 库里的元素只有 rel 没有 File，目前只有「拆元素」能接（读出来再拆一次） */
  if (rel && !f && b.dataset.v !== 'edit') { toast(t('navDropRelOnly')); return; }
  const fn = NAV_DROP[b.dataset.v];
  if (!fn) { toast(t('navDropNo')); return; }
  await fn(f || rel);
});
/* 拖到画板：加一个图层 */
async function addFileToBoard(f) {
  try { showView('board'); Board.enter(); await Board.addFile(f, null); }
  catch (e) { console.error('addFileToBoard', e); toast(t('badImg')); }
}
/* 拖到素材库：直接存进去 */
async function saveDroppedToLib(f) {
  try {
    const data = new Uint8Array(await f.arrayBuffer());
    const r = await api.saveElements({ files: [{ name: (f.name || t('image')).replace(/\.[^.]+$/, ''), data }], group: '', quiet: true });
    if (r && r.ok) { toast(t('savedLibDrop')); if ($('#v-lib').classList.contains('on')) renderLib(); } else toast(t('saveFail'));
  } catch (e) { toast(t('saveFail')); }
}
document.addEventListener('paste', (e) => { const f = [...(e.clipboardData && e.clipboardData.files || [])].find(f => f.type.startsWith('image/')); if (f) { segReset(); openFile(f); } });

/* ───────── 素材库 ───────── */
const libMin = () => {
  let v = 152; try { v = parseInt(localStorage.getItem('pp_lib_min') || '152', 10) || 152; } catch (e) { }
  return Math.max(96, Math.min(300, v));
};
function setLibMin(v, save) {
  const x = Math.max(96, Math.min(300, Math.round(v)));
  const el = $('#v-lib'); if (el) el.style.setProperty('--libmin', x + 'px');
  if (save !== false) { try { localStorage.setItem('pp_lib_min', String(x)); } catch (e) { } }
}
async function renderLib() {
  const el = $('#v-lib');
  el.innerHTML = '<div class="page"><div class="tip">' + t('libLoading') + '</div></div>';
  const list = await api.listLib();
  const groups = {};
  for (const it of list) { const g = it.group || t('noGroup'); (groups[g] = groups[g] || []).push(it); }
  el.innerHTML = `<div class="page"><div class="libHead"><h2 class="pt">${t('libTitle')}</h2><span class="sp"></span>
  <button class="btn ico sm" id="lbZo" title="${t('bdZoomOut')}">−</button><button class="btn ico sm" id="lbZi" title="${t('bdZoomIn')}">+</button>
  <button class="btn" id="lbOpen">${t('libOpen')}</button><button class="btn ghost" id="lbRef">${t('libRefresh')}</button><button class="btn danger" id="lbClear">${t('libClear')}</button></div>
  <p class="lead">${t('libLead', { n: list.length, p: '<span class="path">' + esc(CFG ? CFG.saveDir : '') + '</span>' })}<br>${t('libLead2')}</p>
  ${list.length ? Object.entries(groups).map(([g, items]) => `<div class="gh"><b>${esc(g)}</b><span>${t('nItems', { n: items.length })}</span></div><div class="grid">${items.map(it => `<div class="cell" draggable="true" data-rel="${esc(it.rel)}" data-copy title="${t('clickCopy')}"><div class="im"><img loading="lazy" src="${esc(it.url)}"></div><div class="nm" title="${esc(it.name)}">${esc(it.name)}</div><div class="bar"><button class="btn sm ico" data-act="pv" title="${t('pvOpenTip')}">${IC.zoom}</button><button class="btn sm" data-act="board" title="${t('toBoardTip')}">${t('toBoard')}</button><button class="btn sm" data-act="reveal" title="${t('revealTip')}">${t('reveal')}</button><button class="btn sm danger ico" data-act="del" title="${t('delTip')}" aria-label="${t('del')}">${IC.trash}</button></div></div>`).join('')}</div>`).join('') : '<div class="blank"><b>' + t('libEmptyT') + '</b><span>' + t('libEmptyD') + '</span></div>'}</div>`;
  setLibMin(libMin(), false);
  el.onwheel = (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault(); e.stopPropagation();
    setLibMin(libMin() + (e.deltaY > 0 ? -12 : 12));
  };
  /* 拖素材库的格子到左侧「拆元素」= 拿它再拆一次（和画板素材栏同一个拖拽格式） */
  el.ondragstart = (e) => {
    const c = e.target.closest('.cell'); if (!c) return;
    e.dataTransfer.setData('text/x-pixpeel-rel', c.dataset.rel);
    e.dataTransfer.effectAllowed = 'copy';
  };
  $('#lbOpen').onclick = () => api.openDir(); $('#lbRef').onclick = renderLib;
  $('#lbZo').onclick = () => setLibMin(libMin() - 12);
  $('#lbZi').onclick = () => setLibMin(libMin() + 12);
  $('#lbClear').onclick = () => clearAllPending('#v-lib', 'libClearUndo', 'libCleared');
  el.onclick = async (e) => {
    const cell = e.target.closest('.cell'); if (!cell) return; const rel = cell.dataset.rel;
    const b = e.target.closest('[data-act]');
    if (b && b.dataset.act === 'pv') { pvOpenLib(list, rel); return; }
    if (b && b.dataset.act === 'reveal') { api.revealLib(rel); return; }
    if (b && b.dataset.act === 'board') { await addLibToBoard(rel); return; }
    if (b && b.dataset.act === 'del') {
      /* 删除先不落地，给 3 秒反悔：撤回就取消，超时才真正进回收站 */
      cell.classList.add('pending');
      let undone = false;
      undoToast(t('delUndoFile'), {
        undo: () => { undone = true; cell.classList.remove('pending'); toast(t('undone')); },
        expire: async () => {
          if (undone) return;
          cell.classList.remove('pending');
          if (await api.delLib(rel)) { cell.remove(); toast(t('trashed')); } else toast(t('delFail'));
        }
      });
      return;
    }
    await api.copyLib(rel); toast(t('copiedPaste'));
  };
  gridSelectInit(el);
}

/* 批量清空：先全部标记成“待删”，3 秒内可以撤回，超时才真的进回收站 */
async function clearAllPending(rootSel, undoKey, doneKey) {
  const cells = [...document.querySelectorAll(rootSel + ' .cell')];
  if (!cells.length) return;
  const items = cells.map(c => ({ cell: c, rel: c.dataset.rel }));
  items.forEach(x => x.cell.classList.add('pending'));
  let undone = false;
  undoToast(t(undoKey, { n: items.length }), {
    undo: () => { undone = true; items.forEach(x => x.cell.classList.remove('pending')); toast(t('undone')); },
    expire: async () => {
      if (undone) return;
      let n = 0;
      for (const x of items) { if (await api.delLib(x.rel)) { x.cell.remove(); n++; } else x.cell.classList.remove('pending'); }
      toast(t(doneKey, { n }));
    }
  });
}

/* 素材库 / SVG 库：复选框 + 空白处拖框多选 + 批量删除。
 * 两边的卡片都是 .cell[data-rel]，所以同一套逻辑复用。 */
function gridSelectInit(host) {
  if (!host) return;
  const grid = host.querySelector('.grid'); if (!grid) return;
  const sel = new Set();
  let multiOn = false;
  const cells = () => [...grid.querySelectorAll('.cell')];
  const head = host.querySelector('.libHead');
  let modeBtn = head && head.querySelector('[data-gs="mode"]');
  let bar = head && head.querySelector('.libSelBar');
  if (head && !modeBtn) {
    modeBtn = document.createElement('button'); modeBtn.className = 'btn sm'; modeBtn.dataset.gs = 'mode';
    head.appendChild(modeBtn);
  }
  if (head && !bar) {
    bar = document.createElement('span'); bar.className = 'libSelBar'; bar.hidden = true;
    bar.innerHTML = `<span class="dim libSelN"></span><button class="btn sm" data-gs="clear">${t('libSelClear')}</button><button class="btn sm danger ico" data-gs="del" disabled>${IC.trash}</button>`;
    head.appendChild(bar);
  }
  if (bar) bar.onclick = (e) => {
    const b = e.target.closest('[data-gs]'); if (!b) return;
    if (b.dataset.gs === 'clear') { sel.clear(); sync(); } else delSel();
  };
  if (modeBtn) modeBtn.onclick = () => { multiOn = !multiOn; if (!multiOn) sel.clear(); sync(); };
  const sync = () => {
    host.classList.toggle('libMultiOn', multiOn);
    if (modeBtn) { modeBtn.textContent = multiOn ? t('libMultiExit') : t('libMulti'); modeBtn.title = t('libMultiTip'); modeBtn.classList.toggle('on', multiOn); }
    if (bar) bar.hidden = !multiOn;
    for (const c of cells()) {
      const on = sel.has(c.dataset.rel);
      c.classList.toggle('picked', on);
      const ck = c.querySelector('.libCk'); if (ck && ck.checked !== on) ck.checked = on;
    }
    const n = sel.size;
    const lab = host.querySelector('.libSelN'); if (lab) lab.textContent = n ? t('libSelN', { n }) : '';
    const del = host.querySelector('[data-gs="del"]');
    if (del) { del.disabled = !n; del.title = t('libDelSel', { n: Math.max(1, n) }); del.setAttribute('aria-label', del.title); }
  };
  const toggle = (rel, on) => {
    if (on == null) on = !sel.has(rel);
    if (on) sel.add(rel); else sel.delete(rel);
    sync();
  };
  const delSel = async () => {
    const use = cells().filter(c => sel.has(c.dataset.rel));
    if (!use.length) { toast(t('libSelNone')); return; }
    use.forEach(c => c.classList.add('pending'));
    let undone = false;
    undoToast(t('delUndoFile'), {
      undo: () => { undone = true; use.forEach(c => c.classList.remove('pending')); toast(t('undone')); },
      expire: async () => {
        if (undone) return;
        let n = 0;
        for (const c of use) { if (await api.delLib(c.dataset.rel)) { c.remove(); n++; } else c.classList.remove('pending'); }
        sel.clear(); toast(t('libDelSelDone', { n })); sync();
      }
    });
  };
  for (const c of cells()) {
    if (c.querySelector('.libCk')) continue;
    const ck = document.createElement('input'); ck.type = 'checkbox'; ck.className = 'libCk'; ck.title = t('libPick');
    c.appendChild(ck);
  }
  host.onchange = (e) => {
    if (!e.target.classList || !e.target.classList.contains('libCk')) return;
    const c = e.target.closest('.cell'); if (c) toggle(c.dataset.rel, e.target.checked);
  };
  const oldClick = host.onclick;
  host.onclick = (e) => {
    if (e.target.closest('[data-gs]')) return;
    if (e.target.classList && e.target.classList.contains('libCk')) return;
    const c = e.target.closest('.cell');
    /* 多选模式：点卡片本体是勾选；卡片上的按钮（预览 / 画板 / 删除）仍然照常工作 */
    if (c && multiOn && !e.target.closest('.bar') && !e.target.closest('.libCk')) {
      e.preventDefault(); e.stopPropagation(); toggle(c.dataset.rel); return;
    }
    if (oldClick) oldClick(e);
  };
  /* 空白处拖框：只在多选模式下启用；挨到的卡片就被选中 */
  host.onpointerdown = (e) => {
    if (!multiOn) return;
    if (e.button !== 0 || e.target.closest('.cell') || e.target.closest('button') || e.target.closest('input') || e.target.closest('.libHead')) return;
    const drag = { x: e.clientX, y: e.clientY, add: e.ctrlKey || e.shiftKey };
    const box = document.createElement('div'); box.className = 'libMarq'; document.body.appendChild(box);
    const mv = (ev) => {
      const x0 = Math.min(drag.x, ev.clientX), x1 = Math.max(drag.x, ev.clientX);
      const y0 = Math.min(drag.y, ev.clientY), y1 = Math.max(drag.y, ev.clientY);
      Object.assign(box.style, { left: x0 + 'px', top: y0 + 'px', width: (x1 - x0) + 'px', height: (y1 - y0) + 'px' });
      if (!drag.add) sel.clear();
      for (const c of cells()) {
        const r = c.getBoundingClientRect();
        if (r.right >= x0 && r.left <= x1 && r.bottom >= y0 && r.top <= y1) sel.add(c.dataset.rel);
      }
      sync();
    };
    const up = () => { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); box.remove(); };
    document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
  };
  sync();
}

async function addLibToBoard(rel) {
  try {
    const bytes = await api.readLib(rel); if (!bytes) throw new Error('read');
    const ext = (rel.split('.').pop() || 'png').toLowerCase();
    const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }[ext] || 'image/png';
    const im = await Board.imgFromBlob(new Blob([bytes], { type: mime }));
    showView('board'); Board.enter();          // 先把画板挂好，再放图层
    Board.addLayer(im, rel.split('/').pop(), null, false);
    toast(t('addedToBoard'));
  } catch (e) { toast(t('badImg')); }
}

/* ───────── 设置 ───────── */
function accFromEvent(e) {
  const mods = [];
  if (e.ctrlKey || e.metaKey) mods.push('CommandOrControl');
  if (e.altKey) mods.push('Alt'); if (e.shiftKey) mods.push('Shift');
  let k = e.key; if (['Control', 'Shift', 'Alt', 'Meta'].includes(k)) return null;
  if (/^[a-z]$/i.test(k)) k = k.toUpperCase(); else if (/^[0-9]$/.test(k)) { } else if (/^F\d{1,2}$/.test(k)) { }
  else { const map = { ' ': 'Space', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Enter: 'Enter', Tab: 'Tab', Backspace: 'Backspace' }; k = map[k]; if (!k) return null; }
  if (!mods.length) return null;
  return [...mods, k].join('+');
}
/* 迷你 Markdown：标题 / 列表 / 粗体 / 行内代码 / 链接，够显示更新日志和隐私政策 */
function md(src) {
  const inl = (x) => esc(x).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g, '<a href="#" data-ext="$2">$1</a>');
  let h = '', ul = false;
  for (const line of String(src).split(/\r?\n/)) {
    const m = line.match(/^(#{1,3})\s+(.*)/), li = line.match(/^\s*[-*]\s+(.*)/);
    if (li) { if (!ul) { h += '<ul>'; ul = true; } h += '<li>' + inl(li[1]) + '</li>'; continue; }
    if (ul) { h += '</ul>'; ul = false; }
    if (m) h += `<h${m[1].length}>${inl(m[2])}</h${m[1].length}>`;
    else if (line.trim()) h += '<p>' + inl(line) + '</p>';
  }
  return h + (ul ? '</ul>' : '');
}
async function showDoc(name, title) {
  let m = $('#docModal');
  if (!m) { m = document.createElement('div'); m.id = 'docModal'; document.body.appendChild(m); }
  const text = await api.getDoc(name);
  m.innerHTML = `<div class="card"><header><span>${esc(title)}</span><span class="sp"></span><button class="btn sm" id="docX">${t('close')}</button></header><div id="docBody">${text ? md(text) : '<p>' + t('noDoc') + '</p>'}</div></div>`;
  m.classList.add('on');
  const close = () => m.classList.remove('on');
  $('#docX').onclick = close; m.onclick = (e) => { if (e.target === m) close(); };
  $('#docBody').onclick = (e) => { const a = e.target.closest('a[data-ext]'); if (a) { e.preventDefault(); api.openExternal(a.dataset.ext); } };
}
document.addEventListener('keydown', (e) => { const m = $('#docModal'); if (e.key === 'Escape' && m && m.classList.contains('on')) { e.stopPropagation(); m.classList.remove('on'); } }, true);

let UPD = null;            // 启动时查到的新版本
async function renderSettings() {
  CFG = await api.getSettings(); applyAll();
  const el = $('#v-set');
  const sw = (id, on) => `<input type="checkbox" class="sw" id="${id}" ${on ? 'checked' : ''}>`;
  const opt = (v, cur, label) => `<option value="${v}"${v === cur ? ' selected' : ''}>${label}</option>`;
  const kb = (a) => `<kbd style="font-size:13px;padding:3px 10px">${esc(pretty(a))}</kbd>`;
  el.innerHTML = `<div class="page"><h2 class="pt">${t('setTitle')}</h2><p class="lead">${t('setLead')}</p>
  ${UPD ? `<div class="banner"><span>${t('newVer', { v: '<b>' + esc(UPD.latest) + '</b>' })}</span><span class="sp"></span><button class="btn sm primary" id="bnGo">${t('goDl')}</button></div>` : ''}
  <div class="set"><h3>${t('sGeneral')}</h3>
    <div class="item"><div><div class="t">${t('sLang')}</div><div class="d">${t('sLangD')}</div></div>
      <select id="sLang">${opt('auto', CFG.lang, t('langAuto'))}${I18N.langs.map(l => opt(l, CFG.lang, I18N.D[l].langName)).join('')}</select></div>
    <div class="item"><div><div class="t">${t('sTheme')}</div><div class="d">${t('sThemeD')}</div></div>
      <select id="sTheme">${opt('auto', CFG.theme, t('themeAuto'))}${opt('dark', CFG.theme, t('themeDark'))}${opt('light', CFG.theme, t('themeLight'))}</select></div>
    <label class="item"><div><div class="t">${t('sLogin')}</div><div class="d">${t('sLoginD')}</div></div>${sw('sLogin', CFG.openAtLogin)}</label>
    <div class="item"><div><div class="t">${t('sClose')}</div><div class="d">${t('sCloseD')}</div></div>
      <select id="sClose">${opt('1', CFG.closeToTray === false ? '0' : '1', t('closeTray'))}${opt('0', CFG.closeToTray === false ? '0' : '1', t('closeQuit'))}</select></div>
    <label class="item"><div><div class="t">${t('sNotify')}</div><div class="d">${t('sNotifyD')}</div></div>${sw('sNotify', CFG.notify)}</label></div>
  <div class="set"><h3>${t('sSaveHk')}</h3>
    <div class="item"><div><div class="t">${t('sDir')}</div><div class="path" id="sDir">${esc(CFG.saveDir)}</div><div class="d">${t('sDirD')}</div></div><div class="row2"><button class="btn" id="sPick">${t('change')}</button><button class="btn ghost" id="sOpen">${t('open')}</button></div></div>
    <div class="item"><div><div class="t">${t('sHk1')}</div><div class="d">${t('sHk1D')}<span id="sRecTip" style="color:var(--mint)"></span></div></div><div class="row2">${kb(CFG.hotkey)}<button class="btn" id="sRec">${t('modify')}</button></div></div>
    <div class="item"><div><div class="t">${t('sHk2')}</div><div class="d">${t('sHk2D')}<span id="sRecTip2" style="color:var(--mint)"></span></div></div><div class="row2">${kb(CFG.hotkey2)}<button class="btn" id="sRec2">${t('modify')}</button></div></div>
    <div class="item"><div><div class="t">${t('hkReset')}</div></div><button class="btn ghost" id="sHkReset">${t('resetBtn')}</button></div>
    <label class="item"><div><div class="t">${t('sHide')}</div><div class="d">${t('sHideD')}</div></div>${sw('sHide', CFG.autoHide)}</label></div>
  <div class="set"><h3>${t('sLink')}</h3>
    <label class="item"><div><div class="t">${t('sLinkOn')}</div><div class="d">${t('sLinkOnD')}</div></div>${sw('sLink', CFG.linkEnabled)}</label>
    <div class="item"><div><div class="t"><span class="dot ${CFG.serverRunning ? 'ok' : 'bad'}"></span>${CFG.serverRunning ? t('srvOn') : t('srvOff')}</div><div class="d">${t('srvD')}</div></div><div class="row2"><input type="text" id="sPort" value="${CFG.port}" style="width:84px"><button class="btn" id="sPortOk">${t('apply')}</button></div></div>
    <div class="item"><div class="d" style="margin:0">${t('linkHow', { app: esc(CFG.name) })}</div><span></span></div></div>
  <div class="set"><h3>${t('sPriv')}</h3>
    <label class="item"><div><div class="t">${t('sUpd')}</div><div class="d">${t('sUpdD')}</div></div>${sw('sUpd', CFG.checkUpdate)}</label>
    <div class="item"><div><div class="t">${t('sUpdNow')}</div><div class="d" id="updMsg"></div></div><button class="btn" id="sUpdNow">${t('sUpdNow')}</button></div>
    <div class="item"><div><div class="t">${t('sPrivDoc')}</div><div class="d">${t('sPrivDocD')}</div></div><button class="btn" id="sPrivDoc">${t('view')}</button></div></div>
  <div class="set"><h3>${t('sDonate')}</h3>
    <div class="item"><div><div class="d" style="margin:0">${t('sDonateD')}</div></div><span></span></div>
    ${(CFG.donate || {}).kofi ? `<div class="item"><div><div class="t">Ko-fi</div><div class="d">${t('sKofiD')}</div></div><button class="btn" id="sKofi">${t('sDonateGo')}</button></div>` : ''}
    ${(CFG.donate || {}).afdian ? `<div class="item"><div><div class="t">${t('sAfdian')}</div><div class="d">${t('sAfdianD')}</div></div><button class="btn" id="sAfdian">${t('sDonateGo')}</button></div>` : ''}</div>
  <div class="set"><h3>${t('sAbout')}</h3>
    <div class="about"><img src="icon.png" alt=""><div><div class="nm">${esc(CFG.name)}</div><div class="vs">${t('sVer')} ${esc(CFG.version)} · ${t('sVerD', { e: CFG.versions.electron, c: CFG.versions.chrome, n: CFG.versions.node })}</div></div></div>
    <div class="item"><div><div class="t">${t('sLog')}</div><div class="d">${t('sLogD')}</div></div><button class="btn" id="sLog">${t('view')}</button></div>
    <div class="item"><div><div class="t">${t('sLic')}</div><div class="d">${t('sLicD')}</div></div><span></span></div>
    <div class="item"><div><div class="t">${t('sWeb')}</div><div class="d">${t('sWebD')}</div></div><button class="btn" id="sWeb">${t('open')}</button></div>
    <div class="item"><div><div class="t">${t('sHome')}</div><div class="d">${t('sHomeD')}</div></div><button class="btn" id="sGit">${t('github')}</button></div>
    <div class="item"><div><div class="t">${t('sData')}</div><div class="d path">${esc(CFG.userData)}</div><div class="d">${t('sDataD')}</div></div><button class="btn ghost" id="sData">${t('open')}</button></div>
    <div class="item"><div><div class="t">${t('sReset')}</div><div class="d">${t('sResetD')}</div></div><button class="btn danger" id="sReset">${t('resetBtn')}</button></div></div>
  <p class="tip">${esc(CFG.name)} ${esc(CFG.version)} · ${t('footNote')}</p></div>`;
  const set = async (patch, quiet) => { const r = await api.setSettings(patch); if (r.settings) CFG = r.settings; if (!r.ok && !quiet) toast(r.msgs.join('；')); return r; };
  $('#sLang').onchange = async (e) => {
    await set({ lang: e.target.value }); applyAll();
    if (SEG.src) { buildEdit(); segList(); segRender(); } else renderEmpty();
    renderSettings();
  };
  $('#sTheme').onchange = async (e) => { await set({ theme: e.target.value }); applyTheme(); };
  $('#sClose').onchange = (e) => set({ closeToTray: e.target.value === '1' });
  $('#sPick').onclick = async () => { const d = await api.pickDir(); if (d) { await set({ saveDir: d }); renderSettings(); } };
  $('#sOpen').onclick = () => api.openDir();
  $('#sHide').onchange = (e) => set({ autoHide: e.target.checked });
  $('#sNotify').onchange = (e) => set({ notify: e.target.checked });
  $('#sLogin').onchange = (e) => set({ openAtLogin: e.target.checked });
  $('#sLink').onchange = async (e) => { await set({ linkEnabled: e.target.checked }); renderSettings(); };
  $('#sPortOk').onclick = async () => { const p = +$('#sPort').value; if (!(p >= 1024 && p <= 65535)) { toast(t('portBad')); return; } const r = await set({ port: p }, true); toast(r.ok ? t('portOk') : r.msgs.join('；')); renderSettings(); };
  $('#sUpd').onchange = (e) => set({ checkUpdate: e.target.checked });
  $('#sHkReset').onclick = async () => { await set({ hotkey: CFG.defaults.hotkey, hotkey2: CFG.defaults.hotkey2 }); refreshHint(); renderSettings(); };
  $('#sUpdNow').onclick = async () => {
    const m = $('#updMsg'); m.textContent = t('checking');
    const u = await api.checkUpdate();
    if (!u.ok) { m.textContent = u.code === 'norepo' ? t('updNoRepo') : t('updFail', { e: u.msg || '' }); return; }
    if (u.newer) {
      UPD = u;
      m.innerHTML = t('newVer', { v: '<b>' + esc(u.latest) + '</b>' }) + ' · ' +
        (u.canAuto
          ? '<a href="#" id="updGo" style="color:var(--mint)">' + t('dlAndInstall') + '</a>'
          : '<a href="#" id="updGo" style="color:var(--mint)">' + t('goDl') + '</a>');
      $('#updGo').onclick = (e) => { e.preventDefault(); if (u.canAuto) startAutoUpdate(); else api.openExternal(u.url); };
    }
    else m.textContent = t('upToDate', { v: u.current });
  };
  if ($('#bnGo')) $('#bnGo').onclick = () => { if (UPD && UPD.canAuto) startAutoUpdate(); else api.openExternal(UPD.url); };
  $('#sPrivDoc').onclick = () => showDoc('PRIVACY', t('sPrivDoc'));
  $('#sLog').onclick = () => showDoc('CHANGELOG', t('sLog'));
  $('#sWeb').onclick = () => api.openExternal(CFG.website || 'https://lertone.github.io/PixPeel/');
  $('#sGit').onclick = () => api.openExternal(CFG.repoUrl);
  const dz = CFG.donate || {};
  if ($('#sKofi')) $('#sKofi').onclick = () => api.openExternal(dz.kofi);
  if ($('#sAfdian')) $('#sAfdian').onclick = () => api.openExternal(dz.afdian);
  $('#sData').onclick = () => api.openUserData();
  $('#sReset').onclick = async () => { if (!confirm(t('resetAsk'))) return; CFG = await api.resetSettings(); applyAll(); renderEmpty(); toast(t('resetDone')); renderSettings(); };
  const rec = (btn, tipId, key) => { $(btn).onclick = () => {
    const tip = $(tipId); tip.textContent = t('pressKeys');
    const h = async (e) => {
      e.preventDefault(); e.stopPropagation();
      if (e.key === 'Escape') { document.removeEventListener('keydown', h, true); tip.textContent = ''; return; }
      const acc = accFromEvent(e); if (!acc) return;
      document.removeEventListener('keydown', h, true);
      const r = await set({ [key]: acc }, true);
      if (!r.ok) toast(r.msgs.join('；')); else toast(t('hkChanged', { k: pretty(acc) }));
      renderSettings(); refreshHint();
    };
    document.addEventListener('keydown', h, true);
  }; };
  rec('#sRec', '#sRecTip', 'hotkey'); rec('#sRec2', '#sRecTip2', 'hotkey2');
}
function refreshHint() { const f = (a) => pretty(a).replace(/ \+ /g, '+'); $('#hkTip').innerHTML = CFG ? `${esc(f(CFG.hotkey))}<br>${esc(f(CFG.hotkey2))}` : ''; }

/* 自动更新：下载只能由用户点（不偷偷拉安装包），进度由主进程推 upd:progress 回来 */
async function startAutoUpdate() {
  const m = $('#updMsg');
  if (m) m.textContent = t('dlStarting');
  const r = await api.updateDownload();
  if (!r.ok) {
    if (r.code === 'unsupported') { if (m) m.textContent = t('autoUnsupported'); return; }
    if (r.code === 'latest') { if (m) m.textContent = t('upToDate', { v: CFG.version }); return; }
    if (m) m.textContent = t('updFail', { e: r.msg || '' });
    return;
  }
  if (r.status === 'ready') return;
  if (m) m.innerHTML = t('dlPct', { p: '<b>0</b>' });
  toast(t('dlInBg'));
}

/* ───────── 启动 ───────── */
(async function () {
  CFG = await api.getSettings(); applyAll(); renderEmpty();
  api.onImage((d) => { segReset(); openDataURL(d.dataURL, d.name); });
  api.onImages((d) => {
    runBatch(async () => {
      segReset();
      for (const it of d.items || []) await openDataURL(it.dataURL, it.name);
    });
  });
  api.onSettings((s) => { CFG = s; applyAll(); });
  api.onToast((m) => toast(m));
  api.onNav((v) => showView(v));
  api.onUpdate((u) => { UPD = u; });
  /* 自动更新：进度 / 下好 / 出错。主进程负责弹「现在重启」的对话框，这里只同步文案 */
  const updMsg = () => $('#updMsg');
  api.onUpdProgress((p) => {
    const m = updMsg(); if (m) m.innerHTML = t('dlPct', { p: '<b>' + p.percent + '</b>' });
    const b = $('#bnGo'); if (b) b.textContent = t('dlPct', { p: p.percent });
  });
  api.onUpdReady((d) => {
    const m = updMsg();
    if (m) m.innerHTML = t('dlDone', { v: esc(d.version) }) + ' · <a href="#" id="updGo2" style="color:var(--mint)">' + t('restartNow') + '</a>';
    const l = $('#updGo2'); if (l) l.onclick = (e) => { e.preventDefault(); api.updateInstall(); };
    const b = $('#bnGo'); if (b) { b.textContent = t('restartNow'); b.onclick = () => api.updateInstall(); }
  });
  api.onUpdError((d) => {
    const m = updMsg(); if (m) m.textContent = t('updFail', { e: d.msg || '' });
    const b = $('#bnGo'); if (b) b.textContent = t('goDl');
  });
})();
