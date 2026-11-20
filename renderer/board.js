/* PixPeel · 画板：用素材库里的元素（或导入的图片）拼图，导出成一张图。
 * 依赖 app.js 的 $ / api / toast / CFG，以及 i18n.js 的 t()。 */
const Board = (() => {
  const B = {
    W: 1080, H: 1080, bg: 'transparent', bgImg: null, bgMode: 'cover', bgId: 0, rev: 0,
    layers: [], sel: null, seq: 1, guide: { v: [], h: [] }, topBtn: null, botBtn: null, groupBox: null, matList: [],
    zoom: 0.5, px: 0, py: 0, fmt: 'png', sizeTouched: false,
    lang: '', mounted: false, fitted: false, space: false, mode: null, multi: new Set()
  };
  const PRESETS = [['1080x1080', '1:1 · 1080×1080'], ['1920x1080', '16:9 · 1920×1080'], ['1080x1920', '9:16 · 1080×1920'],
  ['1600x1200', '4:3 · 1600×1200'], ['1200x1600', '3:4 · 1200×1600'], ['512x512', '512×512'], ['2480x3508', 'A4 · 2480×3508']];
  const SWATCHES = ['transparent', '#ffffff', '#f2f2f2', '#111111', '#52e3bd', '#ff6b6b', '#ffd166', '#4dabf7', '#b197fc'];
  /* 内置字体随安装包走（renderer/fonts，SIL OFL），用户还能自己导入 / 在应用内下载。
   * key → 显示名 → font-family 栈。用户字体的 key 是 u:文件名，运行时追加。 */
  const FONTS = [
    ['sans', 'fSans', 'system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif'],
    ['hei', 'fHei', '"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", "Source Han Sans SC", sans-serif'],
    ['song', 'fSong', '"Songti SC", SimSun, "Noto Serif CJK SC", serif'],
    ['kai', 'fKai', '"Kaiti SC", KaiTi, STKaiti, "Noto Serif CJK SC", serif'],
    ['serif', 'fSerif', 'Georgia, "Times New Roman", "Songti SC", serif'],
    ['mono', 'fMono', '"Cascadia Mono", Consolas, "Courier New", monospace'],
    ['ma-shan-zheng', '马善政楷书 Ma Shan Zheng', '"PP MaShanZheng", "Kaiti SC", KaiTi, serif'],
    ['zcool-kuaile', '站酷快乐体 ZCOOL KuaiLe', '"PP ZCOOL KuaiLe", "Microsoft YaHei", sans-serif'],
    ['long-cang', '龙藏体 Long Cang', '"PP Long Cang", "Kaiti SC", KaiTi, serif'],
    ['anton', 'Anton 粗标题', '"PP Anton", Impact, "Microsoft YaHei", sans-serif'],
    ['bebas-neue', 'Bebas Neue', '"PP Bebas Neue", Impact, "Microsoft YaHei", sans-serif'],
    ['caveat', 'Caveat 手写', '"PP Caveat", "Segoe Script", cursive'],
    ['pacifico', 'Pacifico 圆手写', '"PP Pacifico", cursive'],
    ['press-start-2p', 'Press Start 2P 像素', '"PP Press Start 2P", "Cascadia Mono", monospace']
  ];
  const FONTMAP = {}; FONTS.forEach(f => { FONTMAP[f[0]] = f[2]; });
  const SYSFONT = new Set(['sans', 'hei', 'song', 'kai', 'serif', 'mono']);
  /* 应用内可下载的免费字体（来源 npmmirror 上的 @expo-google-fonts 包，均为 SIL OFL） */
  const FONT_CATALOG = [
    { label: '站酷小薇 ZCOOL XiaoWei', pkg: 'zcool-xiaowei', ver: '0.4.1', file: 'ZCOOLXiaoWei_400Regular.ttf', note: '优雅宋体' },
    { label: '柳建毛草 Liu Jian Mao Cao', pkg: 'liu-jian-mao-cao', ver: '0.4.1', file: 'LiuJianMaoCao_400Regular.ttf', note: '狂草手写' },
    { label: 'Playfair Display', pkg: 'playfair-display', ver: '0.4.2', file: 'PlayfairDisplay_400Regular.ttf', note: '西文衬线' },
    { label: 'Orbitron 科幻', pkg: 'orbitron', ver: '0.4.2', file: 'Orbitron_400Regular.ttf', note: '科技感' },
    { label: 'Monoton 霓虹', pkg: 'monoton', ver: '0.4.1', file: 'Monoton_400Regular.ttf', note: '装饰线体' },
    { label: 'Bungee 招牌', pkg: 'bungee', ver: '0.4.1', file: 'Bungee_400Regular.ttf', note: '美式招牌' }
  ];
  /* 对齐图标已移除：改用拖动时的自动吸附虚线。这里只留选框「置顶」用的图形 */
  const ICON = {
    dropper: '<svg viewBox="0 0 16 16"><path d="M9.5 2.5l4 4M10.8 1.2l4 4M8.2 3.8l4 4M11 5.6l-6.6 6.6-2.3.7.7-2.3 6.6-6.6"/></svg>',
    image: '<svg viewBox="0 0 16 16"><rect x="2" y="3" width="12" height="10" rx="2"/><circle cx="5.6" cy="6.4" r="1.1"/><path d="M3 11.4l3.2-3 2.2 2 2-1.7 2.6 2.7"/></svg>',
    zoom: '<svg viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.4"/><path d="M10.4 10.4L14 14M5 7h4M7 5v4"/></svg>',
    copy: '<svg viewBox="0 0 16 16"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M3 10.5v-7A1.5 1.5 0 0 1 4.5 2h7"/></svg>',
    eye: '<svg viewBox="0 0 16 16"><path d="M1.6 8S4 4 8 4s6.4 4 6.4 4S12 12 8 12 1.6 8 1.6 8z"/><circle cx="8" cy="8" r="1.9"/></svg>',
    eyeOff: '<svg viewBox="0 0 16 16"><path d="M1.6 8S4 4 8 4c1 0 1.9.3 2.7.7M14.4 8S12 12 8 12c-1 0-1.9-.3-2.7-.7M2.5 2.5l11 11"/></svg>',
    lock: '<svg viewBox="0 0 16 16"><rect x="3.4" y="7" width="9.2" height="6.4" rx="1.3"/><path d="M5.6 7V5.2a2.4 2.4 0 0 1 4.8 0V7"/></svg>',
    unlock: '<svg viewBox="0 0 16 16"><rect x="3.4" y="7" width="9.2" height="6.4" rx="1.3"/><path d="M5.6 7V5.2a2.4 2.4 0 0 1 4.6-.8"/></svg>',
    layers: '<svg viewBox="0 0 16 16"><path d="M8 2l6 3-6 3-6-3 6-3z"/><path d="M2.6 8.2L8 10.9l5.4-2.7M2.6 11.2L8 13.9l5.4-2.7"/></svg>'
  };

  /* 基础矢量形状：画在 canvas 上的是路径，不是位图，怎么放大都清晰 */
  const SHAPES = [
    { k: 'rect', key: 'shRect', w: 240, h: 160, fill: '#52e3bd', lineW: 0, icon: '<svg viewBox="0 0 24 24"><rect x="4" y="6" width="16" height="12" rx="1"/></svg>' },
    { k: 'round', key: 'shRound', w: 240, h: 160, fill: '#ffd166', lineW: 0, radius: 32, icon: '<svg viewBox="0 0 24 24"><rect x="4" y="6" width="16" height="12" rx="5"/></svg>' },
    { k: 'ellipse', key: 'shEllipse', w: 200, h: 200, fill: '#4dabf7', lineW: 0, icon: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="12" rx="8" ry="6"/></svg>' },
    { k: 'line', key: 'shLine', w: 280, h: 80, fill: '#111111', lineW: 10, icon: '<svg viewBox="0 0 24 24"><path d="M4 17L20 7"/></svg>' },
    { k: 'arrow', key: 'shArrow', w: 280, h: 120, fill: '#111111', lineW: 14, icon: '<svg viewBox="0 0 24 24"><path d="M3 17l11-8M11 6l8 4-6 6"/></svg>' },
    { k: 'triangle', key: 'shTriangle', w: 200, h: 180, fill: '#ff6b6b', lineW: 0, icon: '<svg viewBox="0 0 24 24"><path d="M12 5l8 14H4z"/></svg>' },
    { k: 'star', key: 'shStar', w: 200, h: 200, fill: '#b197fc', lineW: 0, points: 5, icon: '<svg viewBox="0 0 24 24"><path d="M12 4l2.4 5 5.5.8-4 3.9 1 5.5-4.9-2.6L7.1 19l1-5.5-4-3.9 5.5-.8z"/></svg>' }
  ];

  const MIN = 16, MAX = 8192, MAXPX = 50e6;
  /* 新文字默认沿用上一次用过的样式；只有点「恢复默认」才回到这套值 */
  const DEF_TEXT = { font: 'sans', size: 64, weight: 400, italic: false, color: '', align: 'center', lineH: 1.25, letter: 0 };
  let textStyle = Object.assign({}, DEF_TEXT);
  try { Object.assign(textStyle, JSON.parse(localStorage.getItem('pp_text_style') || '{}')); } catch (e) { }
  let tsTimer = 0;
  const saveTextStyle = () => {
    clearTimeout(tsTimer);
    tsTimer = setTimeout(() => { try { localStorage.setItem('pp_text_style', JSON.stringify(textStyle)); } catch (e) { } }, 180);
  };
  function rememberText(l) {
    if (!l) return;
    textStyle = { font: l.font, size: l.size, weight: l.weight, italic: !!l.italic, color: l.color, align: l.align, lineH: l.lineH, letter: l.letter };
    saveTextStyle();
  }
  function textColorForBg() {
    const bg = String(B.bg || '');
    if (!/^#[0-9a-f]{6}$/i.test(bg)) return '#111111';
    const n = parseInt(bg.slice(1), 16);
    return ((n >> 16 & 255) * 299 + (n >> 8 & 255) * 587 + (n & 255) * 114) / 1000 < 128 ? '#ffffff' : '#111111';
  }
  const cache = new Map();   // 素材 rel → Image
  const isOn = () => { const v = $('#v-board'); return !!(v && v.classList.contains('on')); };
  const sel = () => B.layers.find(l => l.id === B.sel) || null;
  /** 当前选中的图层（多选时返回全部，没多选就返回主选中的那个） */
  const sels = () => { const m = B.layers.filter(l => B.multi.has(l.id)); if (m.length) return m; const s = sel(); return s ? [s] : []; };
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#52e3bd';
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* ───────── 撤回 / 重做 ───────── */
  const H = { u: [], r: [], key: '', t: 0 };
  const snapB = () => ({ W: B.W, H: B.H, bg: B.bg, bgImg: B.bgImg, bgMode: B.bgMode, bgId: B.bgId, rev: B.rev, sel: B.sel, L: B.layers.map(l => Object.assign({}, l)),
    k: JSON.stringify([B.W, B.H, B.bg, B.bgId, B.bgMode, B.rev, B.layers.map(l => [l.id, l.x, l.y, l.s, l.r,
      l.kind || '', l.text || '', l.font || '', l.size || 0, l.weight || 0, l.italic ? 1 : 0,
      l.color || '', l.align || '', l.lineH || 0, l.letter || 0,
      l.vis === false ? 0 : 1, l.op == null ? 1 : l.op, l.blend || '', l.lock ? 1 : 0, l.group || '',
      l.strokeW || 0, l.strokeColor || '', l.shadowOn ? 1 : 0, l.shadowBlur || 0, l.shadowDX || 0, l.shadowDY || 0, l.shadowColor || '',
      l.shape || '', l.w || 0, l.h || 0, l.fill || '', l.lineColor || '', l.lineW || 0, l.radius || 0, l.points || 0])]) });
  function hpush(b) { if (b.k === snapB().k) return; H.u.push(b); if (H.u.length > 80) H.u.shift(); H.r = []; hui(); }
  /** 做一步操作并记入历史；key 相同且间隔很短的连续操作（拖取色器、连按方向键）合并成一步 */
  function act(fn, key) {
    const co = key && H.key === key && Date.now() - H.t < 700; H.key = key || ''; H.t = Date.now();
    const b = co ? null : snapB(); fn(); if (b) hpush(b);
  }
  function hrestore(b) {
    B.W = b.W; B.H = b.H; B.bg = b.bg; B.bgImg = b.bgImg; B.bgMode = b.bgMode || 'cover'; B.bgId = b.bgId || 0;
    B.layers = b.L.map(o => Object.assign({}, o)); B.sel = b.sel;
    B.guide = { v: [], h: [] }; B.topBtn = null;
    syncSize(); syncSw(); syncBg(); draw(); tools(); hui();
  }
  function undo() { if (!H.u.length) return; H.r.push(snapB()); hrestore(H.u.pop()); H.key = ''; }
  function redo() { if (!H.r.length) return; H.u.push(snapB()); hrestore(H.r.pop()); H.key = ''; }
  function hui() { const a = $('#bdUndo'), b = $('#bdRedo'); if (a) a.disabled = !H.u.length; if (b) b.disabled = !H.r.length; }

  /* ───────── 界面 ───────── */
  function html() {
    return `<div class="bd">
    <aside class="bd-mat"><div class="bd-h"><b>${t('bdMat')}</b><span class="sp"></span>
      <button class="btn sm bd-ic" id="bdTileO" title="${t('bdTileO')}">−</button><button class="btn sm bd-ic" id="bdTileI" title="${t('bdTileI')}">+</button>
      <button class="btn sm ghost" id="bdRef">${t('bdRefresh')}</button></div>
      <div class="bd-tip">${t('bdMatTip')}</div>
      <div class="bd-shapesH">${t('bdShapes')}</div>
      <div class="bd-shapes" id="bdShapes">${SHAPES.map(s => `<button class="bd-shape" data-shape="${s.k}" title="${t(s.key)}">${s.icon}</button>`).join('')}</div>
      <div class="bd-matList" id="bdMat"></div></aside>
    <div class="vsplit" id="bdSplit" title="${t('bdResizeTip')}"></div>
    <div class="bd-main">
    <div class="bd-col">
      <div class="bd-bar">
        <div class="bd-g"><span>${t('bdCanvas')}</span><select id="bdPre">${PRESETS.map(p => `<option value="${p[0]}">${p[1]}</option>`).join('')}<option value="custom">${t('bdCustom')}</option></select>
          <input id="bdW" type="number" min="${MIN}" max="${MAX}"><span>×</span><input id="bdH" type="number" min="${MIN}" max="${MAX}"><span>px</span></div>
        <div class="bd-g"><span>${t('bdBg')}</span><div class="bd-sw" id="bdSw">${SWATCHES.map(c => `<i data-c="${c}" class="${c === 'transparent' ? 'tp' : ''}" style="${c === 'transparent' ? '' : 'background:' + c}" title="${c === 'transparent' ? t('bdTransparent') : c}"></i>`).join('')}</div>
          <input type="color" id="bdCol" value="#ffffff" title="${t('bdPickColor')}">
          <button class="btn sm bd-ic" id="bdDropper" title="${t('bdDropperTip')}">${ICON.dropper}</button>
          <button class="btn sm bd-ic" id="bdBgPick" title="${t('bdBgImgTip')}">${ICON.image}</button>
          <button class="btn sm" id="bdBgMode" title="${t('bdBgModeTip')}" hidden>${t('bdBgCover')}</button>
          <button class="btn sm ghost" id="bdBgDel" title="${t('bdBgDelTip')}" hidden>×</button></div>
        <div class="bd-act"><button class="btn" id="bdLayerBtn" title="${t('bdLayerPanelTip')}">${ICON.layers}${t('bdLayers')}</button>
        <button class="btn" id="bdTxtAdd">${t('bdTxtAdd')}</button>
        <button class="btn" id="bdImp">${t('bdImport')}</button>
        <button class="btn" id="bdToLib">${t('bdToLib')}</button>
        <select id="bdFmt"><option value="png">PNG</option><option value="jpg">JPG</option></select>
        <button class="btn" id="bdArch">${t('bdArch')}</button>
        <button class="btn primary" id="bdExp">${t('bdExport')}</button></div>
      </div>
      <div class="bd-stage" id="bdStage"><canvas id="bdCv"></canvas><div class="bd-empty" id="bdEmpty">${t('bdEmptyHint')}</div>
        <div class="bd-tx" id="bdTxtPanel">
          <div class="bd-txh"><b>${t('bdText')}</b><span class="sp"></span><span class="bd-tip2">${t('bdTxtTip')}</span></div>
          <textarea id="bdTxtBody" data-tp="text" rows="3" spellcheck="false" placeholder="${t('bdTxtNew')}"></textarea>
          <div class="bd-trow"><span>${t('bdTxtFont')}</span><select id="bdTxtFont" data-tp="font">${FONTS.map(f => `<option value="${esc(f[0])}">${esc(t(f[1]))}</option>`).join('')}</select>
            <button class="btn sm bd-ic" id="bdFontLib" title="${t('fmTitle')}">Aa</button></div>
          <div class="bd-trow"><span>${t('bdTxtSize')}</span><input class="bd-rg" id="bdTxtSizeR" data-tp="size" type="range" min="4" max="2000" step="1"><input id="bdTxtSize" data-tp="size" type="number" min="4" max="2000" step="1"></div>
          <div class="bd-trow"><span>${t('bdTxtLH')}</span><input class="bd-rg" id="bdTxtLHR" data-tp="lh" type="range" min="0.5" max="4" step="0.05"><input id="bdTxtLH" data-tp="lh" type="number" min="0.5" max="4" step="0.05"></div>
          <div class="bd-trow"><span>${t('bdTxtLS')}</span><input class="bd-rg" id="bdTxtLSR" data-tp="ls" type="range" min="-100" max="400" step="0.5"><input id="bdTxtLS" data-tp="ls" type="number" min="-100" max="400" step="0.5"></div>
          <div class="bd-trow"><span>${t('bdTxtColor')}</span><input id="bdTxtCol" data-tp="color" type="color"></div>
          <div class="bd-trow"><button class="btn sm" data-tf="b" title="${t('bdTxtBold')}">B</button><button class="btn sm" data-tf="i" title="${t('bdTxtItalic')}"><i>I</i></button>
            <select id="bdTxtAlign" data-tp="align"><option value="left">${t('bdTxtLeft')}</option><option value="center">${t('bdTxtCenter')}</option><option value="right">${t('bdTxtRight')}</option></select>
            <button class="btn sm ghost" id="bdTxtReset" title="${t('bdTxtResetTip')}">${t('bdTxtReset')}</button></div>
        </div>
      </div>
      <div class="bd-bar bd-bot">
        <div class="bd-g"><button class="btn sm" id="bdUndo" title="${t('undo')} (Ctrl+Z)">↶</button><button class="btn sm" id="bdRedo" title="${t('redoH')} (Ctrl+Shift+Z)">↷</button>
          <button class="btn sm bd-ic" id="bdDup" title="${t('bdDup')} (Ctrl+D)">${ICON.copy}</button></div>
        <div class="bd-g" id="bdTools"><span>${t('bdAngle')}</span><input class="bd-rg" id="bdAngR" type="range" min="-180" max="180" step="1"><input id="bdAng" type="number" min="-180" max="180" step="1">°
          <span>${t('bdSize')}</span><input class="bd-rg" id="bdSclR" type="range" min="2" max="500" step="1"><input id="bdScl" type="number" min="2" max="5000" step="1">%
          <button class="btn sm" id="bdR90" title="${t('bdRot90')}">⟳ 90°</button>
          <button class="btn sm" id="bdDistH" title="${t('bdDistTip')}">${t('bdDistH')}</button><button class="btn sm" id="bdDistV" title="${t('bdDistTip')}">${t('bdDistV')}</button>
          <button class="btn sm" id="bdUp" title="${t('bdUp')}">↑</button><button class="btn sm" id="bdDn" title="${t('bdDown')}">↓</button>
          <button class="btn sm danger bd-ic" id="bdDel" title="${t('bdDelete')} (Del)" aria-label="${t('bdDelete')}">${IC.trash}</button>
          <button class="btn sm danger" id="bdClear" title="${t('bdClearAll')}">${t('bdClearAll')}</button>
          <span class="dim" id="bdSelN"></span></div>
        <span class="sp"></span><span class="bd-hint">${t('bdPan')}</span>
        <div class="bd-g"><button class="btn sm" id="bdPrev" title="${t('bdPreviewTip')}">${ICON.zoom}${t('bdPreview')}</button>
          <button class="btn sm" id="bdZo" title="${t('bdZoomOut')}">−</button><b id="bdZl" class="bd-zl">50%</b><button class="btn sm" id="bdZi" title="${t('bdZoomIn')}">+</button>
          <button class="btn sm" id="bdFit">${t('bdFit')}</button><select id="bdZp" title="${t('zoomMode')}"><option value="">${t('zoomMode')}</option><option value="fit">${t('bdFit')} (0)</option><option value="0.25">25%</option><option value="0.5">50%</option><option value="1">100% (1)</option><option value="2">200%</option><option value="4">400%</option><option value="sel">${t('zoomSel')}</option></select></div>
      </div>
    </div>
    <aside class="bd-side" id="bdSide">
      <div class="bd-sideH"><b>${t('bdLayers')}</b><span class="sp"></span><button class="bd-sideX" id="bdSideX" title="${t('close')}">×</button></div>
      <div class="bd-layers" id="bdLayerList"></div>
      <div class="bd-props" id="bdLayerProps"></div>
    </aside>
    </div>
    <input type="file" id="bdFile" accept="image/*" multiple hidden>
    <input type="file" id="bdBgFile" accept="image/*" hidden></div>`;
  }

  function mount() {
    const v = $('#v-board'); v.innerHTML = html(); B.lang = I18N.lang; B.mounted = true;
    const st = $('#bdStage'), cv = $('#bdCv');
    applyBoardPrefs();
    $('#bdDup').onclick = dup;
    $('#bdTileO').onclick = () => setBdTile(bdTile() - 8);
    $('#bdTileI').onclick = () => setBdTile(bdTile() + 8);
    bindBoardSplit();
    $('#bdMat').addEventListener('wheel', (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault(); e.stopPropagation();
      setBdTile(bdTile() + (e.deltaY > 0 ? -6 : 6));
    }, { passive: false });
    $('#bdRef').onclick = loadMat;
    const shp = $('#bdShapes');
    if (shp) shp.onclick = (e) => { const b = e.target.closest('[data-shape]'); if (b) addShape(b.dataset.shape); };
    $('#bdLayerBtn').onclick = () => toggleLayers();
    $('#bdSideX').onclick = () => toggleLayers(false);
    bindLayerPanel();
    $('#bdDistH').onclick = () => distribute('h');
    $('#bdDistV').onclick = () => distribute('v');
    $('#bdArch').onclick = () => archives(true);
    $('#bdTxtAdd').onclick = () => addText();
    bindTextPanel();
    $('#bdFontLib').onclick = () => fontLib(true);
    $('#bdImp').onclick = () => $('#bdFile').click();
    $('#bdFile').onchange = async (e) => { for (const f of [...e.target.files]) await addFile(f, null); e.target.value = ''; };
    $('#bdBgFile').onchange = async (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) await setBgImage(f); };
    $('#bdDropper').onclick = pickScreenColor;
    $('#bdBgPick').onclick = () => $('#bdBgFile').click();
    $('#bdBgMode').onclick = () => { B.bgMode = B.bgMode === 'cover' ? 'contain' : 'cover'; syncBg(); draw(); };
    $('#bdBgDel').onclick = () => { act(() => { B.bgImg = null; B.bgId++; syncBg(); draw(); }); };
    $('#bdPre').onchange = (e) => { if (e.target.value === 'custom') return; const [w, h] = e.target.value.split('x').map(Number); B.sizeTouched = true; act(() => setSize(w, h, true)); };
    const onSz = () => { const w = +$('#bdW').value, h = +$('#bdH').value; if (!(w >= MIN && w <= MAX && h >= MIN && h <= MAX) || w * h > MAXPX) { toast(t('bdSizeBad', { min: MIN, max: MAX })); syncSize(); return; } B.sizeTouched = true; act(() => setSize(w, h, true)); };
    $('#bdW').onchange = onSz; $('#bdH').onchange = onSz;
    $('#bdSw').onclick = (e) => { const i = e.target.closest('i'); if (i) act(() => setBg(i.dataset.c)); };
    $('#bdCol').oninput = (e) => act(() => setBg(e.target.value), 'bg');
    $('#bdFmt').value = B.fmt; $('#bdFmt').onchange = (e) => { B.fmt = e.target.value; };
    $('#bdExp').onclick = exportFile; $('#bdToLib').onclick = toLibrary;
    const degNorm = (r) => { let a = Math.round(r * 180 / Math.PI) % 360; if (a > 180) a -= 360; if (a < -180) a += 360; return a; };
    /* 角度 / 大小滑杆对多选同时生效：角度加同一个增量，大小按同一比例缩，位置绕着整组中心一起走 */
    bindPair('bdAng', 'bdAngR', -180, 180, 1, (v) => {
      const arr = sels().filter(x => !x.lock); if (!arr.length) return;
      const d = (clamp(v, -180, 180) - degNorm(arr[0].r)) * Math.PI / 180;
      act(() => { for (const X of arr) X.r += d; draw(); }, 'ang');
    });
    bindPair('bdScl', 'bdSclR', 2, 5000, 1, (v) => {
      const arr = sels().filter(x => !x.lock); if (!arr.length) return;
      const target = clamp(v, 2, 5000) / 100;
      act(() => {
        if (arr.length === 1) { arr[0].s = target; draw(); return; }
        const f = target / (arr[0].s || 1);
        const ub = unionBox(arr), cx = (ub.x0 + ub.x1) / 2, cy = (ub.y0 + ub.y1) / 2;
        for (const X of arr) { X.s *= f; X.x = cx + (X.x - cx) * f; X.y = cy + (X.y - cy) * f; }
        draw();
      }, 'scl');
    });
    $('#bdR90').onclick = () => { const arr = sels().filter(x => !x.lock); if (arr.length) act(() => { for (const X of arr) X.r += Math.PI / 2; draw(); tools(); }); };
    $('#bdUp').onclick = () => order(1); $('#bdDn').onclick = () => order(-1); $('#bdDel').onclick = del;
    $('#bdClear').onclick = clearAll;
    $('#bdPrev').onclick = () => pvOpenBoard(B.sel != null ? B.sel : (B.layers.length ? B.layers[B.layers.length - 1].id : null));
    $('#bdZi').onclick = () => zoomAt(1.25); $('#bdZo').onclick = () => zoomAt(1 / 1.25);
    $('#bdFit').onclick = fit;
    $('#bdZp').onchange = (e) => { const v = e.target.value; e.target.value = ''; if (v === 'fit') fit(); else if (v === 'sel') zoomSel(); else if (v) zoomTo(+v); };
    $('#bdUndo').onclick = undo; $('#bdRedo').onclick = redo;
    st.addEventListener('wheel', (e) => {
      /* 文字面板里的滑杆 / 数字自己吃滚轮，别带着画布一起缩放 */
      if (e.target.closest && e.target.closest('.bd-tx')) return;
      e.preventDefault(); const r = cv.getBoundingClientRect(); zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    cv.addEventListener('pointerdown', down); cv.addEventListener('pointermove', move); cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('dblclick', onDblClick);
    st.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
    st.addEventListener('drop', async (e) => {
      e.preventDefault(); e.stopPropagation();
      const r = cv.getBoundingClientRect(), at = toDoc(e.clientX - r.left, e.clientY - r.top);
      const rel = e.dataTransfer.getData('text/x-pixpeel-rel');
      if (rel) { await addMat(rel, at); return; }
      for (const f of [...(e.dataTransfer.files || [])].filter(f => f.type.startsWith('image/'))) await addFile(f, at);
    });
    if (window.ResizeObserver) new ResizeObserver(() => { if (isOn()) { if (!B.fitted) fit(); else draw(); } }).observe(st);
    syncSize(); syncSw(); syncBg(); tools(); hui(); loadMat(); loadUserFonts();
  }

  /* ───────── 素材侧栏 ───────── */
  async function loadMat() {
    const box = $('#bdMat'); if (!box) return;
    let list = []; try { list = await api.listLib(); } catch (e) { }
    B.matList = list.slice();
    if (!list.length) { box.innerHTML = `<div class="bd-none">${t('bdMatEmpty')}</div>`; return; }
    const groups = {}; for (const it of list) (groups[it.group || t('noGroup')] = groups[it.group || t('noGroup')] || []).push(it);
    box.innerHTML = Object.entries(groups).map(([g, items]) => `<div class="bd-gh">${esc(g)}</div><div class="bd-grid">${items.map(it => `<div class="bd-tile" draggable="true" data-rel="${esc(it.rel)}" title="${esc(it.name)}"><img src="${esc(it.url)}" alt="" draggable="false" loading="lazy">
      <div class="bd-tileAct"><button class="bd-tileBtn" data-bpv="${esc(it.rel)}" title="${t('pvOpenTip')}">${ICON.zoom}</button><button class="bd-tileBtn danger" data-bdel="${esc(it.rel)}" title="${t('bdMatDel')}">${IC.trash}</button></div></div>`).join('')}</div>`).join('');
    box.onclick = (e) => {
      const pv = e.target.closest('[data-bpv]');
      if (pv) { e.stopPropagation(); pvOpenLib(B.matList, pv.dataset.bpv); return; }
      const dl = e.target.closest('[data-bdel]');
      if (dl) { e.stopPropagation(); delMat(dl.dataset.bdel, dl.closest('.bd-tile')); return; }
      const c = e.target.closest('.bd-tile'); if (c) addMat(c.dataset.rel, null);
    };
    box.ondragstart = (e) => { const c = e.target.closest('.bd-tile'); if (!c) return; e.dataTransfer.setData('text/x-pixpeel-rel', c.dataset.rel); e.dataTransfer.effectAllowed = 'copy'; };
  }
  function delMat(rel, tile) {
    if (!tile) return;
    tile.classList.add('pending');
    let undone = false;
    undoToast(t('delUndoFile'), {
      undo: () => { undone = true; tile.classList.remove('pending'); toast(t('undone')); },
      expire: async () => {
        if (undone) return;
        if (await api.delLib(rel)) {
          tile.remove(); B.matList = B.matList.filter(x => x.rel !== rel); toast(t('trashed'));
        } else { tile.classList.remove('pending'); toast(t('delFail')); }
      }
    });
  }
  const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp' };
  async function imgFromBlob(blob) {
    /* 用 onload 而不是 decode()：decode() 在某些情况下会一直挂着不返回，onload 更稳 */
    const url = URL.createObjectURL(blob); const im = new Image();
    await new Promise((res, rej) => { im.onload = () => res(); im.onerror = () => rej(new Error('img')); im.src = url; });
    return im;
  }
  async function addMat(rel, at) {
    try {
      let im = cache.get(rel);
      if (!im) {
        const bytes = await api.readLib(rel); if (!bytes) throw new Error('read');
        im = await imgFromBlob(new Blob([bytes], { type: MIME[(rel.split('.').pop() || '').toLowerCase()] || 'image/png' })); cache.set(rel, im);
      }
      addLayer(im, rel.split('/').pop(), at, false);
    } catch (e) { toast(t('badImg')); }
  }
  async function addFile(f, at) {
    try { const im = await imgFromBlob(f); addLayer(im, f.name, at, true); } catch (e) { toast(t('badImg')); }
  }

  /* ───────── 文字图层 ─────────
   * 文字不存成位图：只存参数，绘制时按当前缩放矢量画，放大和导出都不糊。
   * w/h 是「实际有墨迹的紧致外框」，和图片层用同一套坐标约定（以图层中心为原点）。 */
  let mctx = null;
  const measureCtx = () => {
    if (!mctx) { const c = document.createElement('canvas'); c.width = c.height = 8; mctx = c.getContext('2d'); }
    return mctx;
  };
  function textFont(l) {
    const fam = FONTMAP[l.font] || l.font || FONTMAP.sans;
    return `${l.italic ? 'italic ' : ''}${(l.weight || 400) >= 600 ? 700 : 400} ${Math.max(1, l.size || 16)}px ${fam}`;
  }
  function textLayout(l) {
    const key = [l.text, l.font, l.size, l.weight, l.italic, l.letter, l.lineH, l.align].join('\u0001');
    if (l._lk === key && l._lay) return l._lay;
    const c = measureCtx();
    c.font = textFont(l);
    c.textAlign = l.align || 'left';      /* measureText 会按 textAlign 算 actualBoundingBox，必须和绘制时一致 */
    try { c.letterSpacing = (l.letter || 0) + 'px'; } catch (e) { }
    const lines = String(l.text == null ? '' : l.text).split('\n');
    const lh = Math.max(1, l.size || 16) * (l.lineH || 1.25);
    const base = [], ms = [];
    let asc = 0;
    for (const s of lines) {
      const m = c.measureText(s || ' ');
      ms.push(m);
      asc = Math.max(asc, m.actualBoundingBoxAscent || (l.size || 16) * 0.8);
    }
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < lines.length; i++) {
      const m = ms[i], b = asc + i * lh;
      base.push(b);
      const lft = -(m.actualBoundingBoxLeft || 0), rgt = (m.actualBoundingBoxRight || 0);
      const a = m.actualBoundingBoxAscent || 0, d = m.actualBoundingBoxDescent || 0;
      if (lft < x0) x0 = lft;
      if (rgt > x1) x1 = rgt;
      if (b - a < y0) y0 = b - a;
      if (b + d > y1) y1 = b + d;
    }
    if (!isFinite(y0)) { y0 = 0; y1 = l.size || 16; }
    if (!isFinite(x0) || !isFinite(x1) || x1 - x0 < 1) { const hw = (l.size || 16) * 0.3; x0 = -hw; x1 = hw; }
    const lay = { lines, base, asc, x0, y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
    l._lk = key; l._lay = lay; l.w = lay.w; l.h = lay.h;
    return lay;
  }
  function drawText(g, l) {
    const lay = textLayout(l);
    const sw = +l.strokeW || 0;
    g.save();
    g.translate(l.x, l.y); g.rotate(l.r); g.scale(l.s, l.s);
    g.translate(-lay.w / 2 - lay.x0, -lay.h / 2 - lay.y0);
    g.font = textFont(l); g.textAlign = l.align || 'left'; g.textBaseline = 'alphabetic';
    g.fillStyle = l.color || '#111111';
    try { g.letterSpacing = (l.letter || 0) + 'px'; } catch (e) { }
    const paint = (mode) => {
      for (let i = 0; i < lay.lines.length; i++) {
        if (mode === 'stroke') { g.lineWidth = Math.max(1, sw * 2); g.strokeStyle = l.strokeColor || '#ffffff'; g.lineJoin = 'round'; g.strokeText(lay.lines[i], 0, lay.base[i]); }
        else g.fillText(lay.lines[i], 0, lay.base[i]);
      }
    };
    if (l.shadowOn) {
      g.shadowColor = l.shadowColor || 'rgba(0,0,0,.45)';
      g.shadowBlur = +l.shadowBlur || 12;
      g.shadowOffsetX = +l.shadowDX || 0; g.shadowOffsetY = +l.shadowDY || 6;
      paint('fill');
      g.shadowColor = 'transparent'; g.shadowBlur = 0; g.shadowOffsetX = 0; g.shadowOffsetY = 0;
      if (sw > 0) { paint('stroke'); paint('fill'); }
    } else {
      if (sw > 0) paint('stroke');
      paint('fill');
    }
    g.restore();
  }
  function addText() {
    act(() => {
      const st = textStyle;
      const l = { id: B.seq++, kind: 'text', name: t('bdText'), text: t('bdTxtNew'),
        font: FONTMAP[st.font] ? st.font : 'sans', size: st.size || 64,
        weight: st.weight || 400, italic: !!st.italic, color: st.color || textColorForBg(),
        align: st.align || 'center', lineH: st.lineH || 1.25, letter: st.letter || 0,
        x: B.W / 2, y: B.H / 2, s: 1, r: 0 };
      textLayout(l);
      B.layers.push(l); B.sel = l.id; B.multi = new Set([l.id]);
      draw(); tools();
    });
    const ta = $('#bdTxtBody'); if (ta) { ta.focus(); ta.select(); }
  }
  function addShape(kind) {
    const def = SHAPES.find(s => s.k === kind) || SHAPES[0];
    act(() => {
      const l = {
        id: B.seq++, kind: 'shape', shape: kind, name: t(def.key),
        x: B.W / 2, y: B.H / 2,
        w: Math.max(20, Math.min(def.w, B.W * 0.6)), h: Math.max(20, Math.min(def.h, B.H * 0.6)),
        s: 1, r: 0, fill: def.fill, lineColor: '#0e5a48', lineW: def.lineW || 0,
        radius: def.radius || 0, points: def.points || 5,
        op: 1, blend: 'normal', vis: true, lock: false, group: ''
      };
      B.layers.push(l); B.sel = l.id; B.multi = new Set([l.id]);
      draw(); tools();
    });
  }
  const textSel = () => { if (B.multi.size > 1) return null; const l = sel(); return l && l.kind === 'text' ? l : null; };
  function syncText() {
    const p = $('#bdTxtPanel'); if (!p) return;
    const l = textSel();
    p.classList.toggle('on', !!l);
    if (!l) return;
    const set = (id, v) => { const e = $('#' + id); if (e && document.activeElement !== e) e.value = v; };
    const setN = (id, v) => { set(id, v); set(id + 'R', v); };   /* 数字框和滑杆一起同步 */
    set('bdTxtBody', l.text == null ? '' : l.text);
    set('bdTxtFont', l.font || 'sans');
    setN('bdTxtSize', Math.round(l.size || 64));
    setN('bdTxtLH', l.lineH || 1.25);
    setN('bdTxtLS', l.letter || 0);
    set('bdTxtCol', /^#[0-9a-f]{6}$/i.test(l.color || '') ? l.color : '#111111');
    set('bdTxtAlign', l.align || 'left');
    p.querySelectorAll('[data-tf]').forEach(b => b.classList.toggle('on', b.dataset.tf === 'b' ? (l.weight || 400) >= 600 : !!l.italic));
  }
  function bindTextPanel() {
    const p = $('#bdTxtPanel'); if (!p) return;
    const upd = (fn) => { const l = textSel(); if (!l) return; act(() => { fn(l); textLayout(l); rememberText(l); draw(); }, 'txt'); };
    p.oninput = (e) => {
      const k = e.target.dataset && e.target.dataset.tp; if (!k) return;
      const v = e.target.value;
      /* 滑杆 / 数字框互相同步（正在输入的那个不覆盖，避免光标跳） */
      if (k === 'size' || k === 'lh' || k === 'ls') {
        p.querySelectorAll(`[data-tp="${k}"]`).forEach(el => { if (el !== e.target && document.activeElement !== el) el.value = v; });
      }
      if (k === 'text') upd(l => { l.text = v; });
      else if (k === 'font') upd(l => { l.font = v; });
      else if (k === 'size') upd(l => { l.size = clamp(+v || 16, 4, 2000); });
      else if (k === 'lh') upd(l => { l.lineH = clamp(+v || 1.25, 0.5, 4); });
      else if (k === 'ls') upd(l => { l.letter = clamp(+v || 0, -100, 400); });
      else if (k === 'color') upd(l => { l.color = v; });
      else if (k === 'align') upd(l => { l.align = v; });
    };
    /* 停在字号 / 行高 / 字距上滚轮就能微调，不碰画布缩放；Shift 走大步 */
    wheelBy($('#bdTxtSize'), 1, 4, 2000); wheelBy($('#bdTxtSizeR'), 1, 4, 2000);
    wheelBy($('#bdTxtLH'), 0.05, 0.5, 4); wheelBy($('#bdTxtLHR'), 0.05, 0.5, 4);
    wheelBy($('#bdTxtLS'), 0.5, -100, 400); wheelBy($('#bdTxtLSR'), 0.5, -100, 400);
    const rst = $('#bdTxtReset');
    if (rst) rst.onclick = () => {
      const l = textSel();
      act(() => {
        textStyle = Object.assign({}, DEF_TEXT);
        saveTextStyle();
        if (l) {
          l.font = textStyle.font; l.size = textStyle.size; l.weight = textStyle.weight;
          l.italic = false; l.color = textColorForBg(); l.align = textStyle.align;
          l.lineH = textStyle.lineH; l.letter = textStyle.letter;
          textLayout(l);
        }
        draw(); tools();
      });
      toast(t('bdTxtResetDone'));
    };
    p.onclick = (e) => {
      const b = e.target.closest('[data-tf]'); if (!b) return;
      const l = textSel(); if (!l) return;
      act(() => {
        if (b.dataset.tf === 'b') l.weight = (l.weight || 400) >= 600 ? 400 : 700;
        else l.italic = !l.italic;
        textLayout(l); rememberText(l); draw(); tools();
      }, 'txt');
    };
  }
  function onDblClick(e) {
    const [sx, sy] = pos(e), d = toDoc(sx, sy);
    const l = hitLayer(d, false);
    if (!l || l.kind !== 'text') return;
    B.sel = l.id; B.multi = new Set([l.id]); draw(); tools();
    const ta = $('#bdTxtBody'); if (ta) { ta.focus(); ta.select(); }
  }

  /* ───────── 图层 ───────── */
  function addLayer(im, name, at, isFile) { act(() => addLayer0(im, name, at, isFile)); }
  function addLayer0(im, name, at, isFile) {
    const w = im.naturalWidth, h = im.naturalHeight;
    let s = 1, cx = B.W / 2, cy = B.H / 2;
    if (isFile && !B.layers.length && !B.sizeTouched) {            // 第一张导入的图 → 当作底图，画布跟它一样大
      let W = w, H = h; const k = Math.min(1, MAX / Math.max(W, H), Math.sqrt(MAXPX / (W * H)));
      W = Math.max(MIN, Math.round(W * k)); H = Math.max(MIN, Math.round(H * k)); s = W / w;
      setSize(W, H, true); cx = W / 2; cy = H / 2; toast(t('bdBaseSet', { w: W, h: H }));
    } else {
      s = Math.min(1, B.W * 0.7 / w, B.H * 0.7 / h);
      if (at) { cx = clamp(at[0], 0, B.W); cy = clamp(at[1], 0, B.H); }
      else { const n = B.layers.length % 6; cx += n * 16; cy += n * 16; }
    }
    const l = { id: B.seq++, name, img: im, w, h, x: cx, y: cy, s, r: 0 };
    B.layers.push(l); B.sel = l.id; B.multi.clear(); B.multi.add(l.id); draw(); tools();
  }
  function del() {
    const arr = sels().filter(l => !l.lock); if (!arr.length) return;
    const idxs = arr.map(l => B.layers.indexOf(l)).sort((a, b) => a - b);
    act(() => { B.layers = B.layers.filter(x => !arr.includes(x)); B.sel = null; B.multi.clear(); draw(); tools(); });
    undoToast(t('delUndoLayer'), {
      undo: () => {
        idxs.slice().reverse().forEach((i, k) => { const L = arr[arr.length - 1 - k]; if (L) { B.layers.splice(Math.min(i, B.layers.length), 0, L); B.sel = L.id; B.multi.add(L.id); } });
        draw(); tools();
      }
    });
  }
  function dup() {
    const arr = sels(); if (!arr.length) return;
    act(() => {
      for (const l of arr) {
        const c = Object.assign({}, l, { id: B.seq++, x: l.x + 24, y: l.y + 24, name: l.name });
        B.layers.splice(B.layers.indexOf(l) + 1, 0, c);
      }
      B.sel = arr[arr.length - 1].id; draw(); tools();
    });
  }
  function order(d) {
    const arr = sels(); if (!arr.length) return;
    act(() => {
      for (const l of arr) {
        const i = B.layers.indexOf(l), j = i + d;
        if (j < 0 || j >= B.layers.length) continue;
        [B.layers[i], B.layers[j]] = [B.layers[j], B.layers[i]];
      }
      draw();
    });
  }
  /** 清空画布（可撤回） */
  function clearAll() {
    if (!B.layers.length) return;
    const all = B.layers.slice();
    act(() => { B.layers = []; B.sel = null; B.multi.clear(); draw(); tools(); });
    undoToast(t('bdCleared'), {
      undo: () => { B.layers = all.slice(); B.sel = all[0] && all[0].id; draw(); tools(); }
    });
  }
  function tools() {
    const l = sel(); const on = !!l;
    ['bdAng', 'bdAngR', 'bdScl', 'bdSclR', 'bdR90', 'bdUp', 'bdDn', 'bdDel', 'bdDup'].forEach(id => { const e = $('#' + id); if (e) e.disabled = !on; });
    if (l) {
      let a = Math.round(l.r * 180 / Math.PI) % 360; if (a > 180) a -= 360; if (a < -180) a += 360;
      const an = $('#bdAng'), ar = $('#bdAngR'), sc = $('#bdScl'), sr = $('#bdSclR');
      const sv = Math.round(l.s * 100);
      if (an && document.activeElement !== an) an.value = a;
      if (ar && document.activeElement !== ar) ar.value = a;
      if (sc && document.activeElement !== sc) sc.value = sv;
      if (sr && document.activeElement !== sr) sr.value = sv;
    } else {
      const an = $('#bdAng'), sc = $('#bdScl'); if (an) an.value = ''; if (sc) sc.value = '';
    }
    const em = $('#bdEmpty'); if (em) em.style.display = B.layers.length ? 'none' : '';
    const n = B.multi.size; const sn = $('#bdSelN'); if (sn) sn.textContent = n > 1 ? t('bdSelN', { n }) : '';
    const dc = $('#bdDel');
    if (dc) {
      const lbl = n > 1 ? t('bdDeleteSel', { n }) : t('bdDelete');
      dc.title = lbl + ' (Del)'; dc.setAttribute('aria-label', lbl);
    }
    syncText();
    renderLayers();
  }

  /* ───────── 图层面板：显隐 / 锁定 / 改名 / 分组 / 透明度 / 混合 / 特效 ───────── */
  let groupSeq = 1;
  const layerName = (l) => l.name || (l.kind === 'text' ? t('bdText') : '?');
  function toggleLayers(on) {
    const v = $('#v-board'); if (!v) return;
    const show = on == null ? !v.classList.contains('layersOn') : !!on;
    v.classList.toggle('layersOn', show);
    prefSet('pp_bd_layers', show ? '1' : '0');
    if (show) renderLayers();
    requestAnimationFrame(() => { if (B.fitted) fit(); });
  }
  function renderLayers() {
    const box = $('#bdLayerList'); if (!box) return;
    const sig = B.layers.map(l => [l.id, l.name, l.vis === false ? 0 : 1, l.lock ? 1 : 0, l.group || '', B.multi.has(l.id) ? 1 : 0].join('~')).join('|');
    if (box.dataset.sig !== sig) {
      box.dataset.sig = sig;
      box.innerHTML = B.layers.length ? [...B.layers].reverse().map(l => `<div class="bd-lrow${B.multi.has(l.id) ? ' sel' : ''}${l.vis === false ? ' off' : ''}" data-lid="${l.id}">
        <button class="bd-lbtn${l.vis === false ? ' off' : ''}" data-lvis="${l.id}" title="${t('bdVis')}">${l.vis === false ? ICON.eyeOff : ICON.eye}</button>
        <span class="bd-lnm" data-lren="${l.id}" title="${t('bdRenameTip')}">${esc(layerName(l))}</span>
        ${l.group ? `<span class="bd-lgrp">${esc(l.group)}</span>` : ''}
        <button class="bd-lbtn${l.lock ? ' on' : ''}" data-llock="${l.id}" title="${t('bdLockedTip')}">${l.lock ? ICON.lock : ICON.unlock}</button></div>`).join('')
        : `<div class="tip">${t('bdLayerEmpty')}</div>`;
    }
    layerProps();
  }
  function layerProps() {
    const p = $('#bdLayerProps'); if (!p) return;
    const arr = sels(), l = arr[0];
    if (!l) { p.innerHTML = `<div class="tip">${t('bdNoSel')}</div>`; return; }
    const op = Math.round((l.op == null ? 1 : l.op) * 100);
    const cols = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten'];
    const names = { normal: 'blendNormal', multiply: 'blendMultiply', screen: 'blendScreen', overlay: 'blendOverlay', darken: 'blendDarken', lighten: 'blendLighten' };
    p.innerHTML = `<div class="bd-fxH">${t('bdName')}</div>
      <input class="bd-inp" id="bdLName" value="${esc(l.name || '')}" placeholder="${t('bdRenameTip')}">
      <div class="bd-fxRow"><span>${t('bdOpacity')}</span><input id="bdLOp" type="range" min="0" max="100" value="${op}"><b id="bdLOpN">${op}%</b></div>
      <div class="bd-fxRow"><span>${t('bdBlend')}</span><select id="bdLBlend">${cols.map(c => `<option value="${c}"${(l.blend || 'normal') === c ? ' selected' : ''}>${t(names[c])}</option>`).join('')}</select></div>
      <div class="bd-fxRow"><button class="btn sm" id="bdLGroup">${t('bdGroup')}</button><button class="btn sm" id="bdLUngroup">${t('bdUngroup')}</button></div>
      ${l.kind === 'shape' ? `<div class="bd-fxH">${t('bdShapes')}</div>
        <div class="bd-fxRow"><span>${t('bdShapeFill')}</span><input id="bdSFill" type="color" value="${/^#[0-9a-f]{6}$/i.test(l.fill || '') ? l.fill : '#52e3bd'}"><label class="dim" style="display:flex;align-items:center;gap:4px"><input id="bdSNoFill" type="checkbox" ${l.fill === 'none' ? 'checked' : ''}> ${t('bdShapeHollow')}</label></div>
        <div class="bd-fxRow"><span>${t('bdShapeLine')}</span><input id="bdSLine" type="color" value="${/^#[0-9a-f]{6}$/i.test(l.lineColor || '') ? l.lineColor : '#0e5a48'}"><input id="bdSLineW" type="range" min="0" max="40" step="0.5" value="${l.lineW || 0}"><b>${l.lineW || 0}</b></div>
        ${l.shape === 'round' ? `<div class="bd-fxRow"><span>${t('bdShapeRadius')}</span><input id="bdSRadius" type="range" min="0" max="200" step="1" value="${l.radius || 0}"></div>` : ''}
        ${l.shape === 'star' ? `<div class="bd-fxRow"><span>${t('bdShapePoints')}</span><input id="bdSPoints" type="range" min="3" max="20" step="1" value="${l.points || 5}"></div>` : ''}` : ''}
      <div class="bd-fxH">${t('bdFx')}<span>${t('bdFxHint')}</span></div>
      ${l.kind === 'shape' ? '' : `<div class="bd-fxRow"><span>${t('bdStroke')}</span><input id="bdLStroke" type="range" min="0" max="20" step="0.5" value="${l.strokeW || 0}"><input id="bdLStrokeC" type="color" value="${/^#[0-9a-f]{6}$/i.test(l.strokeColor || '') ? l.strokeColor : '#ffffff'}"></div>`}
      <label class="bd-fxRow"><span>${t('bdShadow')}</span><input id="bdLShadow" type="checkbox" ${l.shadowOn ? 'checked' : ''}></label>
      <div class="bd-fxRow"><span>${t('bdShadowBlur')}</span><input id="bdLShBlur" type="range" min="0" max="40" value="${l.shadowBlur || 12}"></div>
      <div class="bd-fxRow"><span>${t('bdShadowX')}</span><input id="bdLShX" type="range" min="-50" max="50" value="${l.shadowDX || 0}"></div>
      <div class="bd-fxRow"><span>${t('bdShadowY')}</span><input id="bdLShY" type="range" min="-50" max="50" value="${l.shadowDY || 6}"></div>
      <div class="bd-fxRow"><span>${t('bdShadow')}</span><input id="bdLShC" type="color" value="${/^#[0-9a-f]{6}$/i.test(l.shadowColor || '') ? l.shadowColor : '#000000'}"></div>`;
    const each = (fn) => { for (const X of arr) fn(X); };
    p.oninput = (e) => {
      const id = e.target.id;
      if (id === 'bdLName') { l.name = e.target.value; draw(); }
      else if (id === 'bdLOp') { const v = +e.target.value / 100; const b = $('#bdLOpN'); if (b) b.textContent = e.target.value + '%'; act(() => { each(X => X.op = v); draw(); }, 'op'); }
      else if (id === 'bdLStroke') { const v = +e.target.value; act(() => { each(X => { X.strokeW = v; X.__sil = null; }); draw(); }, 'stroke'); }
      else if (id === 'bdLShBlur') { const v = +e.target.value; act(() => { each(X => X.shadowBlur = v); draw(); }, 'shb'); }
      else if (id === 'bdLShX') { const v = +e.target.value; act(() => { each(X => X.shadowDX = v); draw(); }, 'shx'); }
      else if (id === 'bdLShY') { const v = +e.target.value; act(() => { each(X => X.shadowDY = v); draw(); }, 'shy'); }
      else if (id === 'bdSFill') { const v = e.target.value; act(() => { each(X => X.fill = v); draw(); }, 'sFill'); }
      else if (id === 'bdSLine') { const v = e.target.value; act(() => { each(X => X.lineColor = v); draw(); }, 'sLine'); }
      else if (id === 'bdSLineW') { const v = +e.target.value; const b = e.target.nextElementSibling; if (b) b.textContent = v; act(() => { each(X => X.lineW = v); draw(); }, 'sLineW'); }
      else if (id === 'bdSRadius') { const v = +e.target.value; act(() => { each(X => X.radius = v); draw(); }, 'sRad'); }
      else if (id === 'bdSPoints') { const v = +e.target.value; act(() => { each(X => X.points = v); draw(); }, 'sPts'); }
    };
    p.onchange = (e) => {
      const id = e.target.id;
      if (id === 'bdLName') { act(() => { l.name = e.target.value.trim() || l.name; draw(); }); renderLayers(); }
      else if (id === 'bdLBlend') { const v = e.target.value; act(() => { each(X => X.blend = v); draw(); }, 'blend'); }
      else if (id === 'bdLStrokeC') { const v = e.target.value; act(() => { each(X => { X.strokeColor = v; X.__sil = null; }); draw(); }); }
      else if (id === 'bdLShadow') { const v = e.target.checked; act(() => { each(X => X.shadowOn = v); draw(); }); }
      else if (id === 'bdLShC') { const v = e.target.value; act(() => { each(X => X.shadowColor = v); draw(); }); }
      else if (id === 'bdSNoFill') { const v = e.target.checked; act(() => { each(X => X.fill = v ? 'none' : '#52e3bd'); draw(); }); renderLayers(); }
    };
    const gb = p.querySelector('#bdLGroup'); if (gb) gb.onclick = groupSel;
    const ub = p.querySelector('#bdLUngroup'); if (ub) ub.onclick = ungroupSel;
  }
  function renameLayer(L) {
    if (!L) return;
    askText(t('bdRenameTip'), L.name || '', (v) => { act(() => { L.name = v; }); renderLayers(); });
  }
  function bindLayerPanel() {
    const box = $('#bdLayerList'); if (!box) return;
    let lastTap = { id: '', t: 0 };
    box.onclick = (e) => {
      const vb = e.target.closest('[data-lvis]');
      if (vb) { const L = B.layers.find(x => String(x.id) === vb.dataset.lvis); if (L) act(() => { L.vis = L.vis === false; draw(); }); renderLayers(); return; }
      const lb = e.target.closest('[data-llock]');
      if (lb) { const L = B.layers.find(x => String(x.id) === lb.dataset.llock); if (L) act(() => { L.lock = !L.lock; draw(); }); renderLayers(); return; }
      const row = e.target.closest('.bd-lrow'); if (!row) return;
      const L = B.layers.find(x => String(x.id) === row.dataset.lid); if (!L) return;
      /* 列表每次选中都会重画 DOM，原生 dblclick 永远等不到；这里按两次点击的间隔自己判断 */
      const now = Date.now();
      if (!e.ctrlKey && !e.metaKey && lastTap.id === row.dataset.lid && now - lastTap.t < 450) { lastTap = { id: '', t: 0 }; renameLayer(L); return; }
      lastTap = { id: row.dataset.lid, t: now };
      if (e.ctrlKey || e.metaKey) {
        if (B.multi.has(L.id)) { B.multi.delete(L.id); B.sel = [...B.multi][0] || null; }
        else { B.multi.add(L.id); B.sel = L.id; }
      }
      else { B.multi.clear(); B.multi.add(L.id); B.sel = L.id; }
      draw(); tools();
    };
  }
  function groupSel() {
    const arr = sels(); if (arr.length < 2) { toast(t('bdNeedGroup')); return; }
    const g = t('bdGroupN', { n: groupSeq++ });
    act(() => { arr.forEach(l => l.group = g); draw(); });
    renderLayers(); toast(t('bdGrouped', { n: g }));
  }
  function ungroupSel() {
    const arr = sels(); if (!arr.length) return;
    act(() => { arr.forEach(l => l.group = ''); draw(); });
    renderLayers(); toast(t('bdUngrouped'));
  }
  /** 等距分布：首尾不动，中间按实际墨迹宽度（不是图片框）均分间距 */
  function distribute(axis) {
    const arr = sels().filter(l => !l.lock);
    if (arr.length < 3) { toast(t('bdDistNeed')); return; }
    act(() => {
      const boxes = arr.map(l => ({ l, b: worldBox(l) }));
      boxes.sort((a, b) => axis === 'h' ? a.b.x0 - b.b.x0 : a.b.y0 - b.b.y0);
      const first = boxes[0].b, last = boxes[boxes.length - 1].b;
      const span = axis === 'h' ? last.x1 - first.x0 : last.y1 - first.y0;
      const sum = boxes.reduce((s, x) => s + (axis === 'h' ? x.b.x1 - x.b.x0 : x.b.y1 - x.b.y0), 0);
      const gap = (span - sum) / (boxes.length - 1);
      let cur = axis === 'h' ? first.x0 : first.y0;
      for (const x of boxes) {
        const w = axis === 'h' ? x.b.x1 - x.b.x0 : x.b.y1 - x.b.y0;
        if (axis === 'h') { x.l.x += cur - x.b.x0; cur += w + gap; }
        else { x.l.y += cur - x.b.y0; cur += w + gap; }
      }
      draw();
    }, 'dist');
    toast(t('bdDistDone', { n: arr.length }));
  }
  /* 画布大小 / 背景 */
  function syncSize() {
    $('#bdW').value = B.W; $('#bdH').value = B.H;
    const key = B.W + 'x' + B.H; $('#bdPre').value = PRESETS.some(p => p[0] === key) ? key : 'custom';
  }
  function setSize(w, h, refit) { B.W = w; B.H = h; syncSize(); if (refit) fit(); else draw(); }
  function syncSw() {
    document.querySelectorAll('#bdSw i').forEach(i => i.classList.toggle('on', i.dataset.c === B.bg));
    if (/^#[0-9a-f]{6}$/i.test(B.bg)) $('#bdCol').value = B.bg;
  }
  function setBg(c) { B.bg = c; syncSw(); draw(); }
  /** 背景图永远画在所有元素下面，不是图层，选不中也拖不动 */
  function syncBg() {
    const m = $('#bdBgMode'), d = $('#bdBgDel');
    if (m) { m.hidden = !B.bgImg; if (B.bgImg) m.textContent = B.bgMode === 'contain' ? t('bdBgContain') : t('bdBgCover'); }
    if (d) d.hidden = !B.bgImg;
  }
  async function setBgImage(f) {
    try {
      const im = await imgFromBlob(f);
      act(() => {
        B.bgImg = im; B.bgImg.__id = ++B.bgId; B.bgMode = 'cover';
        if (!B.layers.length && !B.sizeTouched) {
          let W = im.naturalWidth, H = im.naturalHeight;
          const k = Math.min(1, MAX / Math.max(W, H), Math.sqrt(MAXPX / (W * H)));
          setSize(Math.max(MIN, Math.round(W * k)), Math.max(MIN, Math.round(H * k)), true);
        }
        syncBg(); draw();
      });
      toast(t('bdBgSet'));
    } catch (e) { toast(t('badImg')); }
  }
  async function pickScreenColor() {
    if (!window.EyeDropper) { toast(t('bdDropperNo')); return; }
    try { const r = await new EyeDropper().open(); if (r && r.sRGBHex) act(() => setBg(r.sRGBHex), 'bg'); }
    catch (e) { /* 用户按 Esc 取消 */ }
  }
  /* 数字框 / 滑杆：鼠标停上去滚轮就能调，Shift 走大步；滚轮只作用在这个控件上，不会缩放画布 */
  function wheelBy(el, step, min, max) {
    el.addEventListener('wheel', (e) => {
      e.preventDefault(); e.stopPropagation();
      const k = (e.deltaY < 0 ? 1 : -1) * (e.shiftKey ? 10 : 1);
      const v = clamp((parseFloat(el.value) || 0) + step * k, min, max);
      el.value = Math.round(v * 1e6) / 1e6;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, { passive: false });
  }
  function bindPair(idN, idR, min, max, step, apply) {
    const n = $('#' + idN), r = $('#' + idR);
    const run = (src) => {
      const v = clamp(parseFloat(src.value) || 0, min, max);
      if (src !== n && n) n.value = v;
      if (src !== r && r) r.value = v;
      apply(v);
    };
    [n, r].forEach(el => { if (!el) return; el.addEventListener('input', () => run(el)); wheelBy(el, step, min, max); });
  }
  /* 画板布局：左侧素材栏宽度、素材格子大小都记在本机 */
  const prefGet = (k, d) => { try { return localStorage.getItem(k) || d; } catch (e) { return d; } };
  const prefSet = (k, v) => { try { localStorage.setItem(k, String(v)); } catch (e) { } };
  const bdTile = () => clamp(parseInt(prefGet('pp_bd_tile', '64'), 10) || 64, 44, 140);
  function setBdTile(v) {
    const x = clamp(Math.round(v), 44, 140), b = $('#v-board');
    if (b) b.style.setProperty('--bdtile', x + 'px');
    prefSet('pp_bd_tile', x);
  }
  function applyBoardPrefs() {
    const b = $('#v-board'); if (!b) return;
    b.style.setProperty('--bdmatw', clamp(parseInt(prefGet('pp_bdmat_w', '248'), 10) || 248, 180, 520) + 'px');
    b.style.setProperty('--bdtile', bdTile() + 'px');
    b.classList.toggle('layersOn', prefGet('pp_bd_layers', '0') === '1');
  }
  function bindBoardSplit() {
    const b = $('#v-board'), sp = $('#bdSplit'), mat = $('#v-board .bd-mat');
    if (!sp || !mat) return;
    let drag = null;
    sp.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      drag = { x: e.clientX, w: mat.getBoundingClientRect().width };
      sp.classList.add('active');
      try { sp.setPointerCapture(e.pointerId); } catch (_) { }
    });
    sp.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const max = Math.max(220, Math.min(520, b.clientWidth - 420));
      const w = clamp(drag.w + (e.clientX - drag.x), 180, max);
      b.style.setProperty('--bdmatw', Math.round(w) + 'px');
      prefSet('pp_bdmat_w', Math.round(w));
    });
    const end = () => { drag = null; sp.classList.remove('active'); };
    sp.addEventListener('pointerup', end); sp.addEventListener('pointercancel', end);
  }

  /* ───────── 视图 ───────── */
  function toDoc(sx, sy) { return [(sx - B.px) / B.zoom, (sy - B.py) / B.zoom]; }
  function fit() {
    const st = $('#bdStage'); const w = st.clientWidth, h = st.clientHeight; if (!w || !h) return;
    B.zoom = clamp(Math.min((w - 80) / B.W, (h - 80) / B.H, 1), 0.02, 8);
    B.px = (w - B.W * B.zoom) / 2; B.py = (h - B.H * B.zoom) / 2; B.fitted = true; draw();
  }
  function zoomAt(k, sx, sy) {
    const st = $('#bdStage'); if (sx == null) { sx = st.clientWidth / 2; sy = st.clientHeight / 2; }
    const z = clamp(B.zoom * k, 0.02, 8), d = toDoc(sx, sy); B.zoom = z; B.px = sx - d[0] * z; B.py = sy - d[1] * z; draw();
  }
  function zoomSel() {
    const l = sel(); if (!l) { fit(); return; } const st = $('#bdStage');
    const c = Math.abs(Math.cos(l.r)), s = Math.abs(Math.sin(l.r)), bw = (l.w * c + l.h * s) * l.s, bh = (l.w * s + l.h * c) * l.s;
    const z = clamp(Math.min((st.clientWidth - 80) / bw, (st.clientHeight - 80) / bh), 0.02, 8);
    B.zoom = z; B.px = st.clientWidth / 2 - l.x * z; B.py = st.clientHeight / 2 - l.y * z; draw();
  }
  function zoomTo(z) { const st = $('#bdStage'); const sx = st.clientWidth / 2, sy = st.clientHeight / 2; zoomAt(z / B.zoom, sx, sy); }

  /* ───────── 绘制 ───────── */
  let chk = null;
  function checker() {
    if (chk) return chk; const c = document.createElement('canvas'); c.width = c.height = 20; const g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 20, 20); g.fillStyle = '#d9dce3'; g.fillRect(0, 0, 10, 10); g.fillRect(10, 10, 10, 10); return (chk = c);
  }
  /** 图片描边用的纯色剪影：把图片的 alpha 直接染成描边色，缓存到图层上 */
  function strokeSil(l) {
    const key = [l.strokeColor || '#ffffff', l.w, l.h].join('|');
    if (l.__sil && l.__sil.key === key) return l.__sil.cv;
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(l.w)); c.height = Math.max(1, Math.round(l.h));
    const g = c.getContext('2d');
    g.drawImage(l.img, 0, 0, c.width, c.height);
    g.globalCompositeOperation = 'source-in'; g.fillStyle = l.strokeColor || '#ffffff'; g.fillRect(0, 0, c.width, c.height);
    l.__sil = { key, cv: c }; return c;
  }
  /* 基础形状用 Canvas 路径绘制，不是位图；导出时按画布分辨率重新绘制，所以始终清晰 */
  function shapePath(g, l) {
    const w = l.w, h = l.h;
    if (l.shape === 'round') {
      const r = Math.max(0, Math.min(l.radius || 0, Math.min(w, h) / 2));
      if (r > 0) g.roundRect(-w / 2, -h / 2, w, h, r); else g.rect(-w / 2, -h / 2, w, h);
    } else if (l.shape === 'ellipse') {
      g.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
    } else if (l.shape === 'triangle') {
      g.moveTo(0, -h / 2); g.lineTo(w / 2, h / 2); g.lineTo(-w / 2, h / 2); g.closePath();
    } else if (l.shape === 'star') {
      const n = Math.max(3, Math.min(20, Math.round(l.points || 5))), R = Math.min(w, h) / 2, r = R * 0.45;
      for (let i = 0; i < n * 2; i++) {
        const a = -Math.PI / 2 + i * Math.PI / n, rad = i % 2 ? r : R;
        const x = Math.cos(a) * rad, y = Math.sin(a) * rad;
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.closePath();
    } else {
      g.rect(-w / 2, -h / 2, w, h);
    }
  }
  function drawShape(g, l) {
    g.save(); g.translate(l.x, l.y); g.rotate(l.r); g.scale(l.s, l.s);
    if (l.shadowOn) {
      g.shadowColor = l.shadowColor || 'rgba(0,0,0,.45)';
      g.shadowBlur = +l.shadowBlur || 12;
      g.shadowOffsetX = +l.shadowDX || 0; g.shadowOffsetY = +l.shadowDY || 6;
    }
    const w = l.w, h = l.h, lineW = +l.lineW || 0, color = l.lineColor || l.fill || '#111111';
    if (l.shape === 'line') {
      g.beginPath(); g.moveTo(-w / 2, 0); g.lineTo(w / 2, 0);
      g.lineCap = 'round'; g.lineWidth = Math.max(1, lineW || 8); g.strokeStyle = color; g.stroke();
    } else if (l.shape === 'arrow') {
      const t = Math.max(2, lineW || 10), hw = Math.min(h, Math.max(t * 2.4, 10));
      const hl = Math.min(w * 0.45, Math.max(hw * 1.1, 12));
      g.beginPath();
      g.moveTo(-w / 2, -t / 2); g.lineTo(w / 2 - hl, -t / 2); g.lineTo(w / 2 - hl, -hw / 2);
      g.lineTo(w / 2, 0); g.lineTo(w / 2 - hl, hw / 2); g.lineTo(w / 2 - hl, t / 2); g.lineTo(-w / 2, t / 2);
      g.closePath(); g.fillStyle = l.fill || color; g.fill();
    } else {
      g.beginPath(); shapePath(g, l);
      if (l.fill && l.fill !== 'none') { g.fillStyle = l.fill; g.fill(); }
      if (lineW > 0) { g.lineWidth = lineW; g.strokeStyle = color; g.lineJoin = 'round'; g.stroke(); }
    }
    g.restore();
  }
  function drawLayer(g, l) {
    if (l.vis === false) return;
    g.save();
    if (l.op != null && l.op < 1) g.globalAlpha *= Math.max(0, l.op);
    if (l.blend && l.blend !== 'normal') g.globalCompositeOperation = l.blend;
    if (l.kind === 'text') { drawText(g, l); g.restore(); return; }
    if (l.kind === 'shape') { drawShape(g, l); g.restore(); return; }
    const sw = +l.strokeW || 0;
    if (l.shadowOn) {
      g.shadowColor = l.shadowColor || 'rgba(0,0,0,.45)';
      g.shadowBlur = +l.shadowBlur || 12;
      g.shadowOffsetX = +l.shadowDX || 0; g.shadowOffsetY = +l.shadowDY || 6;
    }
    g.translate(l.x, l.y); g.rotate(l.r); g.scale(l.s, l.s);
    if (sw > 0) {
      const sil = strokeSil(l);
      const n = Math.max(10, Math.min(28, Math.round(sw * 4)));
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2;
        g.drawImage(sil, -l.w / 2 + Math.cos(a) * sw, -l.h / 2 + Math.sin(a) * sw);
      }
    }
    g.drawImage(l.img, -l.w / 2, -l.h / 2);
    g.restore();
  }
  /** 背景图：铺满（cover）或完整显示（contain），永远在所有元素下面 */
  function drawBgImage(g, X, Y, dw, dh) {
    if (!B.bgImg) return;
    const iw = B.bgImg.naturalWidth || B.bgImg.width, ih = B.bgImg.naturalHeight || B.bgImg.height;
    if (!iw || !ih) return;
    const k = B.bgMode === 'contain' ? Math.min(dw / iw, dh / ih) : Math.max(dw / iw, dh / ih);
    const w = iw * k, h = ih * k;
    g.imageSmoothingQuality = 'high';
    g.drawImage(B.bgImg, X + (dw - w) / 2, Y + (dh - h) / 2, w, h);
  }
  function corners(l) {                       // 选中框四角 + 旋转柄（屏幕坐标）
    const c = Math.cos(l.r), s = Math.sin(l.r), hw = l.w * l.s / 2, hh = l.h * l.s / 2;
    const P = (lx, ly) => [B.px + (l.x + lx * c - ly * s) * B.zoom, B.py + (l.y + lx * s + ly * c) * B.zoom];
    const cs = [P(-hw, -hh), P(hw, -hh), P(hw, hh), P(-hw, hh)];
    const top = P(0, -hh), rot = [top[0] + s * 30, top[1] - c * 30];
    return { cs, top, rot };
  }
  /** 选框角上的置顶 / 置底小按钮：up=1 画 ↑，up=-1 画 ↓ */
  function drawOrderBtn(g, p, up, id, mint, w, h) {
    const S = 20, bx = clamp(p[0] + 14 - S / 2, 4, w - S - 4), by = clamp(p[1] + (up > 0 ? -14 : 14) - S / 2, 4, h - S - 4);
    g.save();
    g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 8; g.shadowOffsetY = 2;
    g.fillStyle = mint; g.beginPath(); g.roundRect(bx, by, S, S, 6); g.fill();
    g.shadowColor = 'transparent'; g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1; g.stroke();
    g.strokeStyle = '#06241c'; g.lineWidth = 2; g.lineCap = 'round'; g.lineJoin = 'round';
    const cx = bx + S / 2, y1 = up > 0 ? 14 : 6, y2 = up > 0 ? 6 : 14;
    g.beginPath(); g.moveTo(cx, by + y1); g.lineTo(cx, by + y2);
    g.moveTo(cx - 3.5, by + y2 + (up > 0 ? 3.8 : -3.8)); g.lineTo(cx, by + y2 + (up > 0 ? 0.2 : -0.2)); g.lineTo(cx + 3.5, by + y2 + (up > 0 ? 3.8 : -3.8));
    g.stroke(); g.restore();
    return { x: bx, y: by, w: S, h: S, id };
  }
  function draw() {
    const st = $('#bdStage'), cv = $('#bdCv'); if (!st || !cv) return;
    const w = st.clientWidth, h = st.clientHeight; if (!w || !h) return;
    const dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv.style.width = w + 'px'; cv.style.height = h + 'px'; }
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    const z = B.zoom, X = B.px, Y = B.py, dw = B.W * z, dh = B.H * z;
    g.save(); g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 22; g.shadowOffsetY = 4; g.fillStyle = '#fff'; g.fillRect(X, Y, dw, dh); g.restore();
    g.save(); g.beginPath(); g.rect(X, Y, dw, dh); g.clip();
    if (B.bg === 'transparent') { g.fillStyle = g.createPattern(checker(), 'repeat'); g.fillRect(X, Y, dw, dh); }
    else { g.fillStyle = B.bg; g.fillRect(X, Y, dw, dh); }
    drawBgImage(g, X, Y, dw, dh);
    g.imageSmoothingQuality = 'high'; g.translate(X, Y); g.scale(z, z);
    for (const l of B.layers) drawLayer(g, l);
    /* 拖动吸附的虚线：画布和元素的中线 / 边缘 */
    if (B.guide.v.length || B.guide.h.length) {
      g.save(); g.strokeStyle = 'rgba(255,107,61,.95)'; g.lineWidth = 1; g.setLineDash([6, 4]);
      for (const x of B.guide.v) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, B.H); g.stroke(); }
      for (const y of B.guide.h) { g.beginPath(); g.moveTo(0, y); g.lineTo(B.W, y); g.stroke(); }
      g.restore();
    }
    g.restore();
    const list = sels(), mint = css('--mint'), unlocked = list.filter(l => !l.lock);
    B.topBtn = null; B.botBtn = null; B.groupBox = null;
    for (const l of list) {
      const { cs, top, rot } = corners(l);
      g.save(); g.lineWidth = 1.5; g.strokeStyle = mint; g.beginPath(); cs.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); g.stroke();
      if (list.length === 1 && !l.lock) {
        g.beginPath(); g.moveTo(top[0], top[1]); g.lineTo(rot[0], rot[1]); g.stroke();
        g.fillStyle = '#fff'; for (const p of cs) { g.beginPath(); g.rect(p[0] - 5, p[1] - 5, 10, 10); g.fill(); g.stroke(); }
        g.beginPath(); g.arc(rot[0], rot[1], 6, 0, 7); g.fill(); g.stroke();
        /* 选框右上角 ↑ 置顶、右下角 ↓ 置底；只有单选时出现 */
        B.topBtn = drawOrderBtn(g, cs[1], 1, l.id, mint, w, h);
        B.botBtn = drawOrderBtn(g, cs[2], -1, l.id, mint, w, h);
      }
      g.restore();
    }
    /* 多选 / 成组：画一个整组选框，四角缩放、顶部旋转，大小和角度一起变 */
    if (list.length > 1 && unlocked.length > 1) {
      const pts = unlocked.flatMap(l => corners(l).cs);
      const x0 = Math.min(...pts.map(p => p[0])), y0 = Math.min(...pts.map(p => p[1]));
      const x1 = Math.max(...pts.map(p => p[0])), y1 = Math.max(...pts.map(p => p[1]));
      const gx = (x0 + x1) / 2, gy = (y0 + y1) / 2, cs = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], rot = [gx, y0 - 34];
      g.save(); g.strokeStyle = mint; g.lineWidth = 2; g.setLineDash([7, 5]);
      g.strokeRect(x0, y0, x1 - x0, y1 - y0); g.setLineDash([]);
      g.beginPath(); g.moveTo(gx, y0); g.lineTo(rot[0], rot[1]); g.stroke();
      g.fillStyle = '#fff';
      for (const p of cs) { g.beginPath(); g.rect(p[0] - 5, p[1] - 5, 10, 10); g.fill(); g.stroke(); }
      g.beginPath(); g.arc(rot[0], rot[1], 7, 0, 7); g.fill(); g.stroke();
      g.restore();
      B.groupBox = { x0, y0, x1, y1, cs, rot, cx: gx, cy: gy };
    }
    if (B.mode && B.mode.k === 'marquee') {
      const m = B.mode, x = Math.min(m.sx, m.cx), y = Math.min(m.sy, m.cy), w = Math.abs(m.cx - m.sx), h = Math.abs(m.cy - m.sy);
      g.save(); g.fillStyle = 'rgba(82,227,189,.14)'; g.strokeStyle = mint; g.lineWidth = 1; g.setLineDash([4, 3]);
      g.fillRect(x, y, w, h); g.strokeRect(x, y, w, h); g.restore();
    }
    $('#bdZl').textContent = Math.round(z * 100) + '%';
  }

  /* ───────── 交互 ───────── */
  function alphaAt(im, u, v) {
    let a = im.__a;
    if (!a) {
      const k = Math.min(1, 160 / Math.max(im.naturalWidth, im.naturalHeight)); const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(im.naturalWidth * k)); c.height = Math.max(1, Math.round(im.naturalHeight * k));
      const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0, c.width, c.height); a = im.__a = { c, g };
    }
    const x = clamp(Math.floor(u * a.c.width), 0, a.c.width - 1), y = clamp(Math.floor(v * a.c.height), 0, a.c.height - 1);
    return a.g.getImageData(x, y, 1, 1).data[3];
  }
  function local(l, dx, dy) { const c = Math.cos(l.r), s = Math.sin(l.r); return [(dx * c + dy * s) / l.s, (-dx * s + dy * c) / l.s]; }
  function hitLayer(d, bboxOnly) {
    const list = bboxOnly ? [sel()].filter(Boolean) : [...B.layers].reverse();
    for (const l of list) {
      if (l.vis === false || l.lock) continue;
      if (l.kind === 'text') textLayout(l);
      const [lx, ly] = local(l, d[0] - l.x, d[1] - l.y);
      if (Math.abs(lx) > l.w / 2 || Math.abs(ly) > l.h / 2) continue;
      if (bboxOnly || l.kind === 'text' || l.kind === 'shape' || alphaAt(l.img, (lx + l.w / 2) / l.w, (ly + l.h / 2) / l.h) > 12) return l;
    }
    return null;
  }
  /* ───────── 对齐：按「实际有像素的边缘」算，不是 PNG 图片的矩形 ─────────
   * 图片层先按 alpha>8 扫出真实墨迹范围（最多采样 1024px，缓存到 im.__box）；
   * 文字层的紧致外框就是 textLayout 算出来的 w/h。
   * 旋转 / 缩放之后取四个角的世界坐标 AABB。 */
  function alphaBox(im) {
    if (im.__box) return im.__box;
    const W = im.naturalWidth || im.width, H = im.naturalHeight || im.height;
    const k = Math.min(1, 1024 / Math.max(W, H));
    const cw = Math.max(1, Math.round(W * k)), ch = Math.max(1, Math.round(H * k));
    const c = document.createElement('canvas'); c.width = cw; c.height = ch;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(im, 0, 0, cw, ch);
    let x0 = cw, y0 = ch, x1 = -1, y1 = -1;
    try {
      const d = g.getImageData(0, 0, cw, ch).data;
      for (let y = 0; y < ch; y++) {
        const row = y * cw * 4;
        for (let x = 0; x < cw; x++) {
          if (d[row + x * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        }
      }
    } catch (e) { /* 读不到像素就退回整张图 */ }
    if (x1 < 0) { x0 = 0; y0 = 0; x1 = cw - 1; y1 = ch - 1; }
    return (im.__box = { x: x0 / k, y: y0 / k, w: (x1 - x0 + 1) / k, h: (y1 - y0 + 1) / k });
  }
  function inkRect(l) {
    if (l.kind === 'text' || l.kind === 'shape') { if (l.kind === 'text') textLayout(l); return { x0: -l.w / 2, y0: -l.h / 2, x1: l.w / 2, y1: l.h / 2 }; }
    const b = alphaBox(l.img);
    return { x0: b.x - l.w / 2, y0: b.y - l.h / 2, x1: b.x + b.w - l.w / 2, y1: b.y + b.h - l.h / 2 };
  }
  function worldBox(l) {
    const r = inkRect(l), c = Math.cos(l.r), s = Math.sin(l.r);
    const pts = [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]]
      .map(([x, y]) => [l.x + (x * c - y * s) * l.s, l.y + (x * s + y * c) * l.s]);
    return { x0: Math.min(...pts.map(p => p[0])), y0: Math.min(...pts.map(p => p[1])),
      x1: Math.max(...pts.map(p => p[0])), y1: Math.max(...pts.map(p => p[1])) };
  }
  function unionBox(arr) {
    const bs = arr.map(worldBox);
    return { x0: Math.min(...bs.map(b => b.x0)), y0: Math.min(...bs.map(b => b.y0)),
      x1: Math.max(...bs.map(b => b.x1)), y1: Math.max(...bs.map(b => b.y1)) };
  }
  /* ───────── 拖动吸附：画布边缘 / 中线 + 其它元素的实际像素边缘 / 中线 ─────────
   * 屏幕上 6px 以内就吸附，同时把命中的对齐线记下来，draw() 画成虚线。 */
  const SNAP_PX = 6;
  function snapMove(ids, ub, dx, dy) {
    const thr = SNAP_PX / B.zoom;
    const tx = [0, B.W / 2, B.W], ty = [0, B.H / 2, B.H];
    for (const l of B.layers) {
      if (ids.has(l.id)) continue;
      const b = worldBox(l);
      tx.push(b.x0, (b.x0 + b.x1) / 2, b.x1);
      ty.push(b.y0, (b.y0 + b.y1) / 2, b.y1);
    }
    const x0 = ub.x0 + dx, x1 = ub.x1 + dx, cx = (ub.x0 + ub.x1) / 2 + dx;
    const y0 = ub.y0 + dy, y1 = ub.y1 + dy, cy = (ub.y0 + ub.y1) / 2 + dy;
    const near = (vals, targets) => {
      let best = null;
      for (const t of targets) for (const v of vals) {
        const d = t - v;
        if (Math.abs(d) <= thr && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, t };
      }
      return best;
    };
    const bx = near([x0, cx, x1], tx), by = near([y0, cy, y1], ty);
    const ndx = dx + (bx ? bx.d : 0), ndy = dy + (by ? by.d : 0);
    const hits = (vals, targets) => [...new Set(targets.filter(t => vals.some(v => Math.abs(v - t) < 0.01)).map(v => Math.round(v * 100) / 100))];
    return {
      dx: ndx, dy: ndy,
      vs: bx ? hits([x0 + bx.d, cx + bx.d, x1 + bx.d], tx) : [],
      hs: by ? hits([y0 + by.d, cy + by.d, y1 + by.d], ty) : []
    };
  }
  function toFront(l) {
    if (!l) return;
    act(() => { const i = B.layers.indexOf(l); if (i >= 0 && i !== B.layers.length - 1) { B.layers.splice(i, 1); B.layers.push(l); } draw(); });
  }
  function toBack(l) {
    if (!l) return;
    act(() => { const i = B.layers.indexOf(l); if (i > 0) { B.layers.splice(i, 1); B.layers.unshift(l); } draw(); });
  }
  function hitHandle(sx, sy) {
    const arr = sels().filter(l => !l.lock);
    if (arr.length > 1 && B.groupBox) {
      const gb = B.groupBox;
      if (Math.hypot(sx - gb.rot[0], sy - gb.rot[1]) <= 11) return 'grot';
      for (const p of gb.cs) if (Math.abs(sx - p[0]) <= 9 && Math.abs(sy - p[1]) <= 9) return 'gscale';
      return null;
    }
    const l = sel(); if (!l || l.lock) return null; const { cs, rot } = corners(l);
    if (Math.hypot(sx - rot[0], sy - rot[1]) <= 9) return 'rot';
    for (let i = 0; i < 4; i++) if (Math.abs(sx - cs[i][0]) <= 8 && Math.abs(sy - cs[i][1]) <= 8) return 'scale';
    return null;
  }
  const pos = (e) => { const r = $('#bdCv').getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  function down(e) {
    const [sx, sy] = pos(e); const cv = $('#bdCv');
    try { cv.setPointerCapture(e.pointerId); } catch (_) { /* 合成事件没有真实指针，抓不到就算了 */ }
    if (e.button === 1 || B.space) { B.mode = { k: 'pan', sx, sy, px: B.px, py: B.py }; cv.style.cursor = 'grabbing'; return; }
    /* 选框右上角的「置顶」/ 右下角的「置底」小按钮（只有单选时才有） */
    const tb = B.topBtn;
    if (tb && sx >= tb.x && sx <= tb.x + tb.w && sy >= tb.y && sy <= tb.y + tb.h) {
      const L = B.layers.find(x => x.id === tb.id);
      if (L) toFront(L);
      return;
    }
    const bb = B.botBtn;
    if (bb && sx >= bb.x && sx <= bb.x + bb.w && sy >= bb.y && sy <= bb.y + bb.h) {
      const L = B.layers.find(x => x.id === bb.id);
      if (L) toBack(L);
      return;
    }
    const hd = hitHandle(sx, sy), l = sel(), b0 = snapB();
    if (hd === 'grot' || hd === 'gscale') {
      const arr = sels().filter(x => !x.lock), gb = B.groupBox;
      if (arr.length > 1 && gb) {
        const ub = unionBox(arr), cx = (ub.x0 + ub.x1) / 2, cy = (ub.y0 + ub.y1) / 2;
        B.mode = hd === 'grot'
          ? { k: 'grot', a0: Math.atan2(sy - gb.cy, sx - gb.cx), gx: gb.cx, gy: gb.cy, cx, cy, b: b0, base: arr.map(X => ({ l: X, x: X.x, y: X.y, r: X.r })) }
          : { k: 'gscale', d0: Math.hypot(sx - gb.cx, sy - gb.cy) || 1, gx: gb.cx, gy: gb.cy, cx, cy, b: b0, base: arr.map(X => ({ l: X, x: X.x, y: X.y, s: X.s })) };
        return;
      }
    }
    if (hd && l) {
      if (l.lock) return;
      const cx = B.px + l.x * B.zoom, cy = B.py + l.y * B.zoom;
      B.mode = hd === 'rot' ? { k: 'rot', a0: Math.atan2(sy - cy, sx - cx), r0: l.r, cx, cy, b: b0 } : { k: 'scale', d0: Math.hypot(sx - cx, sy - cy) || 1, s0: l.s, cx, cy, b: b0 };
      return;
    }
    const d = toDoc(sx, sy); const hit = hitLayer(d, false) || hitLayer(d, true);
    if (hit) {
      if (e.ctrlKey || e.metaKey) {
        if (B.multi.has(hit.id)) { B.multi.delete(hit.id); B.sel = [...B.multi][0] || null; }
        else { B.multi.add(hit.id); B.sel = hit.id; }
      }
      else if (!B.multi.has(hit.id)) {
        B.multi.clear(); B.multi.add(hit.id);
        /* 编了组的元素，点其中一个就把整组一起拖动 */
        if (hit.group) for (const g of B.layers) if (g.group === hit.group && g.vis !== false && !g.lock) B.multi.add(g.id);
        B.sel = hit.id;
      }
      const arr = sels();
      B.mode = { k: 'move', d0: d[0], d1: d[1], b: b0, base: arr.map(x => ({ l: x, x: x.x, y: x.y })),
        ub: unionBox(arr), ids: new Set(arr.map(x => x.id)) };
      B.guide = { v: [], h: [] };
      draw(); tools();
    }
    else {
      /* 左键拖空白 = 框选；中键 / 空格才是平移 */
      if (!e.shiftKey) { B.multi.clear(); B.sel = null; }
      B.mode = { k: 'marquee', sx, sy, cx: sx, cy: sy, b: b0, add: e.shiftKey };
      draw(); tools();
    }
  }
  function move(e) {
    const [sx, sy] = pos(e), m = B.mode, l = sel(), cv = $('#bdCv');
    if (!m) {
      const tb = B.topBtn, bb = B.botBtn;
      const overTop = tb && sx >= tb.x && sx <= tb.x + tb.w && sy >= tb.y && sy <= tb.y + tb.h;
      const overBot = bb && sx >= bb.x && sx <= bb.x + bb.w && sy >= bb.y && sy <= bb.y + bb.h;
      const hd = hitHandle(sx, sy);
      cv.style.cursor = B.space ? 'grab' : (overTop || overBot) ? 'pointer' : hd === 'grot' ? 'grab' : (hd === 'gscale' || hd === 'scale') ? 'nwse-resize' : (hitLayer(toDoc(sx, sy), false) ? 'move' : 'default'); return;
    }
    if (m.k === 'pan') { B.px = m.px + sx - m.sx; B.py = m.py + sy - m.sy; draw(); }
    else if (m.k === 'marquee') { m.cx = sx; m.cy = sy; draw(); }
    else if (m.k === 'gscale') {
      const f = clamp(Math.hypot(sx - m.gx, sy - m.gy) / m.d0, 0.05, 20);
      for (const b of m.base) { b.l.s = b.s * f; b.l.x = m.cx + (b.x - m.cx) * f; b.l.y = m.cy + (b.y - m.cy) * f; }
      draw();
    }
    else if (m.k === 'grot') {
      let d = Math.atan2(sy - m.gy, sx - m.gx) - m.a0;
      if (e.shiftKey) d = Math.round(d / (Math.PI / 12)) * (Math.PI / 12);
      const c = Math.cos(d), sn = Math.sin(d);
      for (const b of m.base) {
        const dx = b.x - m.cx, dy = b.y - m.cy;
        b.l.x = m.cx + dx * c - dy * sn; b.l.y = m.cy + dx * sn + dy * c; b.l.r = b.r + d;
      }
      draw();
    }
    else if (!l) return;
    else if (m.k === 'move') {
      const d = toDoc(sx, sy);
      const sn = snapMove(m.ids, m.ub, d[0] - m.d0, d[1] - m.d1);
      for (const b of m.base) { b.l.x = b.x + sn.dx; b.l.y = b.y + sn.dy; }
      B.guide = { v: sn.vs, h: sn.hs };
      draw();
    }
    else if (m.k === 'scale') { const s = clamp(m.s0 * Math.hypot(sx - m.cx, sy - m.cy) / m.d0, 0.02, 50); for (const X of sels().filter(x => !x.lock)) X.s = s; draw(); tools(); }
    else if (m.k === 'rot') {
      let r = m.r0 + Math.atan2(sy - m.cy, sx - m.cx) - m.a0;
      if (e.shiftKey) r = Math.round(r / (Math.PI / 12)) * (Math.PI / 12);
      for (const X of sels().filter(x => !x.lock)) X.r = r; draw(); tools();
    }
  }
  function up(e) {
    const m = B.mode; B.mode = null; B.guide = { v: [], h: [] };
    if (m && m.k === 'marquee') {
      const x0 = Math.min(m.sx, m.cx), x1 = Math.max(m.sx, m.cx), y0 = Math.min(m.sy, m.cy), y1 = Math.max(m.sy, m.cy);
      if (Math.abs(x1 - x0) > 4 || Math.abs(y1 - y0) > 4) {
        if (!m.add) B.multi.clear();
        for (const l of B.layers) {
          if (l.vis === false || l.lock) continue;
          const { cs } = corners(l);
          const lx = Math.min(...cs.map(p => p[0])), hx = Math.max(...cs.map(p => p[0]));
          const ly = Math.min(...cs.map(p => p[1])), hy = Math.max(...cs.map(p => p[1]));
          if (hx >= x0 && lx <= x1 && hy >= y0 && ly <= y1) { B.multi.add(l.id); B.sel = l.id; }
        }
      }
    }
    if (m && m.b) hpush(m.b);
    draw(); tools();
    try { $('#bdCv').releasePointerCapture(e.pointerId); } catch (_) { }
    $('#bdCv').style.cursor = B.space ? 'grab' : 'default';
  }

  document.addEventListener('keydown', (e) => {
    if (!isOn()) return;
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName || '') && e.target.type !== 'checkbox' && e.target.type !== 'range') return;
    const l = sel(), mod = e.ctrlKey || e.metaKey, K = e.key.toLowerCase(), eat = () => { e.preventDefault(); e.stopPropagation(); };
    if (mod && K === 'z') { e.shiftKey ? redo() : undo(); eat(); return; }
    if (mod && K === 'y') { redo(); eat(); return; }
    if (mod && K === 'd') { dup(); eat(); return; }
    if (!mod && (K === '+' || K === '=')) { zoomAt(1.25); eat(); return; }
    if (!mod && K === '-') { zoomAt(1 / 1.25); eat(); return; }
    if (K === '0') { fit(); eat(); return; }
    if (K === '1' && !e.shiftKey) { zoomTo(1); eat(); return; }
    if (!mod && (K === '[' || K === ']') && l) { order(K === ']' ? 1 : -1); eat(); return; }
    if (e.key === ' ') { B.space = true; $('#bdCv').style.cursor = 'grab'; e.preventDefault(); e.stopPropagation(); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && l) { del(); e.preventDefault(); e.stopPropagation(); }
    else if (e.key === 'Escape' && l) { B.sel = null; B.multi.clear(); draw(); tools(); e.stopPropagation(); }
    else if (l && /^Arrow/.test(e.key)) {
      const k = e.shiftKey ? 10 : 1; act(() => { if (e.key === 'ArrowLeft') l.x -= k; if (e.key === 'ArrowRight') l.x += k; if (e.key === 'ArrowUp') l.y -= k; if (e.key === 'ArrowDown') l.y += k; draw(); }, 'nudge');
      e.preventDefault(); e.stopPropagation();
    }
  }, true);
  document.addEventListener('keyup', (e) => { if (e.key === ' ') { B.space = false; const c = $('#bdCv'); if (c) c.style.cursor = 'default'; } }, true);
  document.addEventListener('paste', async (e) => {
    if (!isOn()) return; const fs = [...(e.clipboardData && e.clipboardData.files || [])].filter(f => f.type.startsWith('image/'));
    if (!fs.length) return; e.stopPropagation(); e.preventDefault(); for (const f of fs) await addFile(f, null);
  }, true);

  /* ───────── 导出 ───────── */
  function renderDoc(flatten) {
    const c = document.createElement('canvas'); c.width = B.W; c.height = B.H; const g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
    if (B.bg !== 'transparent') { g.fillStyle = B.bg; g.fillRect(0, 0, B.W, B.H); } else if (flatten) { g.fillStyle = '#ffffff'; g.fillRect(0, 0, B.W, B.H); }
    drawBgImage(g, 0, 0, B.W, B.H);
    for (const l of B.layers) drawLayer(g, l); return c;
  }
  async function bytesOf(c, type, q) {
    const blob = await Promise.race([new Promise(r => c.toBlob(r, type, q)), new Promise(r => setTimeout(() => r(null), 8000))]);
    if (blob) return new Uint8Array(await blob.arrayBuffer());
    const b = atob(c.toDataURL(type, q).split(',')[1]); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u;
  }
  const stamp = () => new Date().toLocaleString('sv').replace(/[: ]/g, '-');
  async function exportFile() {
    try {
      const jpg = B.fmt === 'jpg'; const data = await bytesOf(renderDoc(jpg), jpg ? 'image/jpeg' : 'image/png', 0.95);
      const ok = await api.saveAs({ name: t('bdFile') + ' ' + stamp() + (jpg ? '.jpg' : '.png'), data, filters: [{ name: jpg ? 'JPG' : 'PNG', extensions: [jpg ? 'jpg' : 'png'] }] });
      if (ok) toast(t('bdExported'));
    } catch (e) { toast(t('bdExportFail')); }
  }
  async function toLibrary() {
    try {
      const data = await bytesOf(renderDoc(false), 'image/png');
      const r = await api.saveElements({ files: [{ name: t('bdFile') + ' ' + stamp(), data }], group: t('bdGroup'), quiet: true });
      if (r && r.ok) { toast(t('bdSavedLib')); loadMat(); } else toast(t('saveFail'));
    } catch (e) { toast(t('bdExportFail')); }
  }

  /* ───────── 字体库：内置 + 用户导入 / 应用内下载 ───────── */
  const userFonts = [];
  let fontReady = null;
  const fontFam = (file) => {
    const s = String(file); let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return 'PPU ' + s.replace(/[^\w-]+/g, '_').slice(0, 24) + '_' + (h >>> 0).toString(36);
  };
  function addFontEntry(it) {
    const key = 'u:' + it.file;
    if (FONTMAP[key]) return;
    FONTMAP[key] = `"${fontFam(it.file)}", sans-serif`;
    FONTS.push([key, it.name, FONTMAP[key]]);
  }
  function renderFontOptions() {
    const s = $('#bdTxtFont'); if (!s) return;
    const cur = s.value || 'sans';
    s.innerHTML = FONTS.map(f => `<option value="${esc(f[0])}">${esc(t(f[1]))}</option>`).join('');
    s.value = FONTMAP[cur] ? cur : 'sans';
  }
  async function loadUserFonts(force) {
    if (!api.listFonts) return;
    if (fontReady && !force) return fontReady;
    fontReady = (async () => {
      let list = []; try { list = (await api.listFonts()) || []; } catch (e) { }
      userFonts.length = 0;
      for (const it of list) {
        try {
          if (!FONTMAP['u:' + it.file]) {
            const buf = await api.readFont(it.file); if (!buf) continue;
            const ff = new FontFace(fontFam(it.file), buf);
            await ff.load(); document.fonts.add(ff);
          }
          addFontEntry(it); userFonts.push(it);
        } catch (e) { /* 坏字体文件跳过，不影响其它字体 */ }
      }
      renderFontOptions();
    })();
    return fontReady;
  }
  const fontLabel = (key) => { const f = FONTS.find(x => x[0] === key); return f ? t(f[1]) : key; };
  function applyFont(key) {
    const s = $('#bdTxtFont'); if (s) s.value = key;
    const l = textSel();
    if (!l) { toast(t('fmNeedText')); return; }
    act(() => { l.font = key; textLayout(l); rememberText(l); draw(); tools(); });
    toast(t('fmApplied', { n: fontLabel(key) }));
    fontLib(false);
  }
  function fontLib(open) {
    let el = $('#fm');
    if (!el) {
      el = document.createElement('div');
      el.id = 'fm';
      el.className = 'pvWrap fmWrap';
      el.innerHTML = `<div class="pvPanel fmPanel" role="dialog" aria-modal="true">
        <div class="pvHead"><b>${t('fmTitle')}</b><span class="sp"></span><button class="pvX" title="${t('close')}">×</button></div>
        <div class="fmBody">
          <div class="fmH">${t('fmBundled')}<span>${t('fmBundledTip')}</span></div><div class="fmGrid" id="fmBundled"></div>
          <div class="fmH">${t('fmMine')}<span class="sp"></span><button class="btn sm" id="fmImport">${t('fmImport')}</button></div><div class="fmGrid" id="fmMineList"></div>
          <div class="fmH">${t('fmDownload')}<span>${t('fmDownloadTip')}</span></div><div class="fmGrid" id="fmDl"></div>
        </div>
        <div class="pvFoot"><span class="tip">${t('fmFoot')}</span></div>
        <input type="file" id="fmFile" accept=".ttf,.otf,.woff,.woff2" hidden></div>`;
      document.body.appendChild(el);
      el.onclick = (e) => { if (e.target === el) fontLib(false); };
      el.querySelector('.pvX').onclick = () => fontLib(false);
      $('#fmImport').onclick = () => $('#fmFile').click();
      $('#fmFile').onchange = async (e) => {
        const f = e.target.files[0]; e.target.value = '';
        if (!f) return;
        try {
          const data = new Uint8Array(await f.arrayBuffer());
          const r = await api.importFont({ name: f.name, data });
          if (!r || !r.ok) { toast(t('fmFail')); return; }
          await loadUserFonts(true); renderFontLib(); toast(t('fmAdded', { n: r.name }));
        } catch (err) { toast(t('fmFail')); }
      };
      el.querySelector('.fmBody').onclick = async (e) => {
        const del = e.target.closest('[data-fdel]');
        if (del) {
          e.stopPropagation();
          const file = del.dataset.fdel;
          const ok = await api.delFont(file);
          if (!ok) { toast(t('fmFail')); return; }
          const key = 'u:' + file;
          delete FONTMAP[key];
          const i = FONTS.findIndex(f => f[0] === key); if (i >= 0) FONTS.splice(i, 1);
          B.layers.forEach(l => { if (l.font === key) { l.font = 'sans'; l._lk = ''; textLayout(l); } });
          await loadUserFonts(true); renderFontLib(); draw(); tools(); renderFontOptions();
          toast(t('fmDeleted'));
          return;
        }
        const dl = e.target.closest('[data-fdl]');
        if (dl) {
          const c = FONT_CATALOG[+dl.dataset.fdl]; if (!c) return;
          dl.disabled = true; const old = dl.textContent; dl.textContent = t('fmDownloading');
          const url = `https://registry.npmmirror.com/@expo-google-fonts/${c.pkg}/-/${c.pkg}-${c.ver}.tgz`;
          const r = await api.downloadFont({ url, entry: `400Regular/${c.file}`, label: c.label });
          if (r && r.ok) { await loadUserFonts(true); renderFontLib(); toast(t('fmAdded', { n: r.name })); }
          else { dl.disabled = false; dl.textContent = old; toast(t('fmFailNet')); }
          return;
        }
        const row = e.target.closest('[data-fk]');
        if (row) applyFont(row.dataset.fk);
      };
    }
    if (open === false) { el.classList.remove('on'); return; }
    renderFontLib(); el.classList.add('on');
  }
  function fontRow(key, tag, extra) {
    return `<div class="fmRow" data-fk="${esc(key)}" role="button">
      <span class="fmSample" style="font-family:${esc(FONTMAP[key] || 'sans-serif')}">Aa 字体 88</span>
      <span class="fmName">${esc(fontLabel(key))}</span><span class="fmTag">${tag}</span>${extra || ''}</div>`;
  }
  function renderFontLib() {
    const b = $('#fmBundled'), m = $('#fmMineList'), d = $('#fmDl'); if (!b || !m || !d) return;
    b.innerHTML = FONTS.filter(f => !f[0].startsWith('u:') && !SYSFONT.has(f[0])).map(f => fontRow(f[0], t('fmTagBundled'))).join('');
    m.innerHTML = userFonts.length
      ? userFonts.map(it => fontRow('u:' + it.file, t('fmTagMine'), `<button class="fmDel" data-fdel="${esc(it.file)}" title="${t('fmDelete')}">×</button>`)).join('')
      : `<div class="fmEmpty">${t('fmEmpty')}</div>`;
    const have = new Set(userFonts.map(x => x.name));
    const rest = FONT_CATALOG.map((c, i) => ({ c, i })).filter(x => !have.has(x.c.label));
    d.innerHTML = rest.length
      ? rest.map(({ c, i }) => `<div class="fmRow dl"><span class="fmSample">${esc(c.note)}</span><span class="fmName">${esc(c.label)}</span>
          <button class="btn sm" data-fdl="${i}">${t('fmGet')}</button></div>`).join('')
      : `<div class="fmEmpty">${t('fmAllDone')}</div>`;
  }

  /* ───────── 存档：把画板大小、背景、图层、文字和特效整个存下来 ───────── */
  const layerSnapshot = (l) => {
    const o = { name: l.name, kind: l.kind || 'img', x: l.x, y: l.y, s: l.s, r: l.r, op: l.op, blend: l.blend, vis: l.vis, lock: l.lock, group: l.group,
      strokeW: l.strokeW, strokeColor: l.strokeColor, shadowOn: l.shadowOn, shadowBlur: l.shadowBlur, shadowDX: l.shadowDX, shadowDY: l.shadowDY, shadowColor: l.shadowColor,
      shape: l.shape, w: l.w, h: l.h, fill: l.fill, lineColor: l.lineColor, lineW: l.lineW, radius: l.radius, points: l.points };
    if (l.kind === 'text') Object.assign(o, { text: l.text, font: l.font, size: l.size, weight: l.weight, italic: l.italic, color: l.color, align: l.align, lineH: l.lineH, letter: l.letter });
    return o;
  };
  const cvData = (cv) => cv.toDataURL('image/png');
  const loadImg = (url) => new Promise(res => {
    if (!url) return res(null);
    const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = url;
  });
  async function saveArchive() {
    const layers = [];
    for (const l of B.layers) {
      const o = layerSnapshot(l);
      if (l.kind === 'text') { textLayout(l); layers.push(o); }
      else if (l.kind === 'shape') layers.push(o);
      else {
        const c = document.createElement('canvas'); c.width = Math.max(1, l.w); c.height = Math.max(1, l.h);
        c.getContext('2d').drawImage(l.img, 0, 0); o.img = cvData(c); layers.push(o);
      }
    }
    let bgImg = null;
    if (B.bgImg) {
      const c = document.createElement('canvas'); c.width = B.bgImg.naturalWidth || B.bgImg.width; c.height = B.bgImg.naturalHeight || B.bgImg.height;
      c.getContext('2d').drawImage(B.bgImg, 0, 0); bgImg = cvData(c);
    }
    const data = { v: 1, name: t('bdFile') + ' ' + stamp(), time: Date.now(), W: B.W, H: B.H, bg: B.bg, bgMode: B.bgMode, bgImg, layers };
    try {
      const r = await api.saveArchive({ name: data.name, json: JSON.stringify(data) });
      if (r && r.ok) { toast(t('bdArchSaved', { n: r.name })); renderArchList(); } else toast(t('bdArchSaveFail'));
    } catch (e) { toast(t('bdArchSaveFail')); }
  }
  async function openArchive(file) {
    const txt = await api.readArchive(file);
    if (!txt) { toast(t('bdArchBad')); return; }
    let o = null; try { o = JSON.parse(txt); } catch (e) { }
    if (!o) { toast(t('bdArchBad')); return; }
    try {
      B.W = o.W || B.W; B.H = o.H || B.H; B.bg = o.bg || 'transparent'; B.bgMode = o.bgMode || 'cover';
      B.bgImg = await loadImg(o.bgImg); B.bgId++; B.seq = 1; B.layers = []; B.sel = null; B.multi.clear();
      for (const x of (o.layers || [])) {
        const l = { id: B.seq++, name: x.name, x: x.x, y: x.y, s: x.s == null ? 1 : x.s, r: x.r || 0, op: x.op, blend: x.blend, vis: x.vis, lock: x.lock, group: x.group,
          strokeW: x.strokeW, strokeColor: x.strokeColor, shadowOn: x.shadowOn, shadowBlur: x.shadowBlur, shadowDX: x.shadowDX, shadowDY: x.shadowDY, shadowColor: x.shadowColor };
        if (x.kind === 'text') {
          Object.assign(l, { kind: 'text', text: x.text, font: x.font, size: x.size, weight: x.weight, italic: x.italic, color: x.color, align: x.align, lineH: x.lineH, letter: x.letter });
          textLayout(l);
        } else if (x.kind === 'shape') {
          Object.assign(l, { kind: 'shape', shape: x.shape || 'rect', w: x.w || 200, h: x.h || 120,
            fill: x.fill || '#52e3bd', lineColor: x.lineColor || '#0e5a48', lineW: x.lineW || 0, radius: x.radius || 0, points: x.points || 5 });
        } else {
          const im = await loadImg(x.img); if (!im) continue;
          l.img = im; l.w = im.naturalWidth || im.width; l.h = im.naturalHeight || im.height;
        }
        B.layers.push(l);
      }
      H.u = []; H.r = []; hui();
      syncSize(); syncSw(); syncBg(); fit(); tools();
      toast(t('bdArchOpened', { n: String(o.name || '').replace(/\.json$/i, '') }));
      archives(false);
    } catch (e) { console.error('openArchive', e); toast(t('bdArchBad')); }
  }
  async function renderArchList() {
    const box = $('#bdArchList'); if (!box) return;
    const list = await api.listArchive();
    box.innerHTML = list.length ? list.map(it => `<div class="bd-arow" data-f="${esc(it.file)}">
      <div class="bd-ainfo"><b>${esc(it.name)}</b><span>${new Date(it.time || Date.now()).toLocaleString()} · ${Math.max(1, Math.round((it.size || 0) / 1024))} KB</span></div>
      <button class="btn sm" data-aopen="${esc(it.file)}">${t('bdArchOpen')}</button>
      <button class="btn sm danger ico" data-adel="${esc(it.file)}" title="${t('bdArchDel')}" aria-label="${t('bdArchDel')}">${IC.trash}</button></div>`).join('')
      : `<div class="tip">${t('bdArchEmpty')}</div>`;
  }
  function archives(open) {
    let el = $('#bdArchModal');
    if (!el) {
      el = document.createElement('div');
      el.id = 'bdArchModal'; el.className = 'pvWrap bdArchWrap';
      el.innerHTML = `<div class="pvPanel bdArchPanel" role="dialog" aria-modal="true">
        <div class="pvHead"><b>${t('bdArchTitle')}</b><span class="sp"></span><button class="pvX" title="${t('close')}">×</button></div>
        <div class="bdArchBody"><p class="tip">${t('bdArchQ')}</p><div class="bdArchTop"><button class="btn primary" id="bdArchSave">${t('bdArchSave')}</button></div><div class="bdArchList" id="bdArchList"></div></div>
      </div>`;
      document.body.appendChild(el);
      el.onclick = (e) => { if (e.target === el) archives(false); };
      el.querySelector('.pvX').onclick = () => archives(false);
      $('#bdArchSave').onclick = saveArchive;
      $('#bdArchList').onclick = async (e) => {
        const op = e.target.closest('[data-aopen]');
        if (op) { await openArchive(op.dataset.aopen); return; }
        const de = e.target.closest('[data-adel]');
        if (de) {
          if (await api.delArchive(de.dataset.adel)) { toast(t('bdArchDelDone')); renderArchList(); } else toast(t('bdArchSaveFail'));
        }
      };
      document.addEventListener('keydown', (e) => {
        const m = $('#bdArchModal');
        if (e.key === 'Escape' && m && m.classList.contains('on')) { e.preventDefault(); e.stopPropagation(); archives(false); }
      }, true);
    }
    if (open === false) { el.classList.remove('on'); return; }
    el.classList.add('on'); renderArchList();
  }

  /* ───────── 预览 / 橡皮要用的图层接口 ───────── */
  /** 把图层按原始像素画成一张独立画布（不带旋转/缩放），供预览窗和缩略图用 */
  function layerCanvas(l) {
    if (!l) return null;
    const c = document.createElement('canvas');
    if (l.kind === 'text') {
      textLayout(l);
      const w = Math.max(1, Math.ceil(l.w)), h = Math.max(1, Math.ceil(l.h));
      c.width = w; c.height = h;
      drawText(c.getContext('2d'), Object.assign({}, l, { x: w / 2, y: h / 2, s: 1, r: 0 }));
      return { cv: c, w, h };
    }
    if (!l.img) return null;
    c.width = Math.max(1, l.w); c.height = Math.max(1, l.h);
    c.getContext('2d').drawImage(l.img, 0, 0);
    return { cv: c, w: c.width, h: c.height };
  }
  /** 开始一次涂抹（擦除或补画）：复制一份位图，原素材库文件不动。
   *  __base 保存「第一次涂抹前」的原始像素，补画笔从它上面取色，擦掉的地方才能补回来。 */
  function paintBegin(l, add) {
    if (!l || l.kind === 'text' || !l.img) return null;
    if (!l.__base) {
      const b = document.createElement('canvas'); b.width = l.w; b.height = l.h;
      b.getContext('2d').drawImage(l.img, 0, 0); l.__base = b;
    }
    if (!l.img.getContext) {
      const c = document.createElement('canvas'); c.width = l.w; c.height = l.h;
      c.getContext('2d').drawImage(l.img, 0, 0); l.img = c;
    }
    l.__box = null; l.__sil = null; B.rev++;
    return { cv: l.img, base: l.__base };
  }
  function paintDot(cv, base, x, y, r, add) {
    if (!cv) return;
    cv.__a = null;
    const g = cv.getContext('2d');
    if (add && base) {
      g.save(); g.beginPath(); g.arc(x, y, Math.max(1, r), 0, 7); g.clip(); g.drawImage(base, 0, 0); g.restore();
    } else {
      g.save(); g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(x, y, Math.max(1, r), 0, 7); g.fill(); g.restore();
    }
  }
  function eraseBegin(l) { const w = paintBegin(l, false); return w ? w.cv : null; }
  function eraseDot(cv, x, y, r) { paintDot(cv, null, x, y, r, false); }
  function beginAction() { return snapB(); }
  function commitAction(b) { if (b) hpush(b); }
  const canUndo = () => H.u.length > 0;

  function enter() {
    if (!B.mounted || B.lang !== I18N.lang) mount(); else loadMat();
    requestAnimationFrame(() => { if (!B.fitted) fit(); else draw(); tools(); });
  }
  function select(id) { B.sel = id; B.multi.clear(); if (id != null) B.multi.add(id); draw(); tools(); }
  return { enter, state: B, draw, addLayer, addFile, setSize, fit, select, undo, redo, dup, zoomSel, imgFromBlob, addMat,
    addText, worldBox, alphaBox, renderDoc, fontLib, layerCanvas, eraseBegin, eraseDot, paintBegin, paintDot, beginAction, commitAction, canUndo };
})();
