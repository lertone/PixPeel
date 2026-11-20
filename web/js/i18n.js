/* PixPeel 网页版：中文 / English
 * 静态文案和动态渲染都由这里翻译；语言切换即时生效，不需要刷新。
 * 做法：英文模式下遍历文本节点和 placeholder / title / aria-label，
 * 动态节点由 MutationObserver 兜底；切回中文时恢复原文。 */
(function () {
  const ZH = /[\u4e00-\u9fa5]/;
  const state = { lang: 'zh' };
  const origText = new WeakMap();
  const origAttr = new WeakMap();
  let observer = null;

  const DICT = {
    '跳到主要内容': 'Skip to main content',
    '主页': 'Home',
    '拆元素': 'Extract',
    '元素库': 'Library',
    '画板': 'Board',
    '下载桌面版': 'Get desktop app',
    '网页版 · 免安装 · 图片不上传': 'Web app · no install · nothing uploaded',
    '开始拆元素': 'Start extracting',
    '先看示例': 'Try the sample',
    '导入一张截图，PixPeel 会沿着边缘把按钮、图标、文字和贴纸拆下来，存成透明底 PNG。然后去元素库收好，或者直接拖进画板拼一张新的。': 'Drop in a screenshot. PixPeel traces the edges, lifts out buttons, icons, text and stickers, and saves them as transparent PNGs. Keep them in the library, or compose something new on the board.',
    '把图剥开，一个个拿走。': 'Peel the image. Take each piece.',
    '张图片上传': 'images uploaded',
    '个元素 / 张': 'elements / image',
    '个区域：拆 · 收 · 拼': 'areas: split · save · compose',
    'PixPeel — 拆元素': 'PixPeel — Extract',
    '本地': 'Local',
    '正在本地拆解': 'Splitting locally',
    '个元素': 'elements',
    '徽章 · 198×198': 'Badge',
    '按钮 · 272×90': 'Button',
    '文字 · 一字不糊': 'Text',
    '图形 · 透明底': 'Shape',
    '按钮': 'Buttons',
    '图标': 'Icons',
    '文字': 'Text',
    '商品图': 'Product shots',
    'UI 组件': 'UI components',
    '人物': 'People',
    '贴纸': 'Stickers',
    '徽章': 'Badges',
    '线条': 'Lines',
    '一张图，三步。': 'One image, three steps.',
    '不用钢笔，不用一层层抠。': 'No pen tool. No layer-by-layer masking.',
    '导入': 'Import',
    '截图、海报、商品图、游戏界面都行。拖进来、粘贴，或者先用内置示例。': 'Screenshots, posters, product shots, game UI — drop it in, paste it, or start with the built-in sample.',
    '拖进来 / Ctrl+V': 'Drop in / Ctrl+V',
    '拆开': 'Split',
    '自动识别背景色和连通区域，边缘带抗锯齿。没拆对的，用点选、魔棒或 AI 点选补一刀。': 'Detects the background and connected regions, with anti-aliased edges. Missed something? Pick, wand or AI pick it.',
    '自动拆成 7 个': 'Auto-split into 7',
    '收好，再拼': 'Save, then compose',
    '选中元素存进元素库，随时下载透明 PNG；也可以在画板里加文字、形状，拼成新的海报。': 'Save elements to the library, download transparent PNGs any time, or add text and shapes on the board to make a new poster.',
    '→ 元素库': '→ Library',
    '拆完之后，还有一个完整的': 'After splitting, there is a complete',
    '网页工作台。': 'web workspace.',
    '三个区域都在顶部，随时切换。登录后，元素库和画板会暂存在这台设备。': 'Three areas in the top bar. Sign in to keep your library and board on this device.',
    '01 / 拆元素': '01 / Extract',
    '自动拆，也能手动补': 'Auto-split, or refine by hand',
    '自动判断背景、按颜色聚类，或点一下直接取出。参数可调，拆完立刻看到透明底效果。可选 SlimSAM 轻量模型，点哪拆哪。': 'Detect the background, cluster by color, or click an element to lift it out. Tweak the parameters and see the transparent result immediately. Optional SlimSAM model: click what you want.',
    '背景容差 40': 'Tolerance 40',
    '合并 6px': 'Merge 6px',
    '抗锯齿 开': 'Anti-alias on',
    '开始拆': 'Start extracting',
    '02 / 元素库': '02 / Library',
    '拆下来的，收进库': 'Everything you split, saved',
    '登录后按账号暂存，刷新不丢。多选、下载、删除，一键送进画板。': 'Sign in to keep it per account across refreshes. Select, download, delete, or send to the board in one click.',
    '打开元素库': 'Open the library',
    '03 / 画板': '03 / Board',
    '元素库兼容画板': 'A board that works with your library',
    '图片、文字、形状都能进画板。拖、缩、转，导出 PNG；画板自动存档。': 'Images, text and shapes all go on the board. Drag, scale, rotate, export PNG; the board auto-saves.',
    '藏起面板，': 'Hide the panels,',
    '只剩画布。': 'leave only the canvas.',
    '拆元素、元素库、画板都能一键全屏。手机上也一样，面板收到底部，画布占满。': 'Extract, Library and Board all go full screen in one click. On phones the panels fold to the bottom and the canvas fills the screen.',
    '图片不离开浏览器。': 'Your images never leave the browser.',
    '拆元素在本地内存完成；元素库和画板存在浏览器 IndexedDB。没有上传接口，也没有云端副本。': 'Extraction happens in local memory; the library and board live in IndexedDB. No upload endpoint, no cloud copy.',
    '不上传': 'No uploads',
    '不要账号': 'No account needed',
    '本机暂存': 'Local storage',
    '看一遍，就会了。': 'Watch once, then try it.',
    '作者实拍：拆元素、元素库、画板，一条视频走完。': 'A real walkthrough: extract, library and board in one video.',
    'PixPeel 介绍': 'PixPeel intro',
    '在 X 上看作者发布的功能演示与更新。': 'See feature demos and updates from the author on X.',
    '打开视频 →': 'Watch →',
    '抖音': 'Douyin',
    'PixPeel — 我做的抠图神器': 'PixPeel — the cutout tool I made',
    '竖屏快速演示：一张图怎么变成一堆贴纸。': 'A quick vertical demo: one image becomes a pile of stickers.',
    'PixPeel 演示': 'PixPeel demo',
    '给朋友看的完整介绍：从拆元素到画板。': 'A complete introduction to share: from extracting to the board.',
    '桌面版、网页版、小剪动画，': 'Desktop, web and Xiaoji Animation,',
    '都在一个生态里。': 'all in one ecosystem.',
    '网页版': 'Web app',
    '免安装 · 拆 / 收 / 拼': 'No install · split / save / compose',
    '桌面版': 'Desktop',
    '小剪动画': 'Xiaoji Animation',
    '单文件网页动画编辑器': 'Single-file web animation editor',
    '开源仓库': 'Open source',
    '代码 · 更新日志 · 反馈': 'Code · changelog · issues',
    '视频': 'Videos',
    'YouTube · X · B 站 · 抖音': 'YouTube · X · Bilibili · Douyin',
    '桌面版负责系统级框选、点选和批量拆分；网页版负责随时打开、快速拆和拼；小剪动画接住拆出来的贴纸做动画。同一套素材，三个地方都能用。': 'The desktop app handles system-wide capture, click-pick and batch splitting; the web app is for opening anywhere and quickly splitting or composing; Xiaoji Animation takes the stickers into motion. One set of assets, three places to use it.',
    '需要框选屏幕、批量拆图？': 'Need screen capture and batch splitting?',
    '装桌面版。': 'Get the desktop app.',
    'Windows / macOS / Linux，本机处理，免费非商用。网页版适合随时拆一张、拼一张；桌面版适合把整套工作流搬到系统里。': 'Windows / macOS / Linux, processed locally, free for noncommercial use. The web app is for a quick split or composition; the desktop app brings the whole workflow into your system.',
    '前往下载': 'Download',
    '查看源码': 'View source',
    '安装包未做商业代码签名，Windows 提示“未知发布者”属正常现象。许可：PolyForm Noncommercial 1.0.0。': 'The installer is not commercially code-signed, so Windows may say “Unknown publisher”. License: PolyForm Noncommercial 1.0.0.',
    '产品': 'Product',
    '生态': 'Ecosystem',
    '隐私说明': 'Privacy',
    '网页版图片只在浏览器本地处理 · 元素库暂存在本机': 'Web images stay in the browser · library stored on this device',
    '等待导入一张图': 'Waiting for an image',
    '示例': 'Sample',
    '导入图片': 'Import image',
    '全部入库': 'Save all',
    '点选': 'Pick',
    '魔棒': 'Wand',
    'AI 点选': 'AI pick',
    '清空': 'Clear',
    '把截图拖进来': 'Drop a screenshot here',
    '或点击选择 · 支持 Ctrl+V 粘贴 · 手机可从相册选': 'or click to choose · Ctrl+V works · pick from your photo library on mobile',
    '先用示例图试试': 'Try the sample',
    '图片只在浏览器内存里处理，不会上传': 'Images stay in browser memory. Nothing is uploaded.',
    '适应': 'Fit',
    '点画面上的元素，可以直接拆出来': 'Click an element to lift it out',
    '元素': 'Elements',
    '参数': 'Settings',
    '拆分方式': 'Split mode',
    '自动判断': 'Auto',
    '只按背景色': 'Background only',
    '颜色聚类': 'Color clusters',
    '背景容差': 'Background tolerance',
    '合并距离': 'Merge distance',
    '最小面积': 'Min area',
    '颜色数': 'Colors',
    '点选容差': 'Pick tolerance',
    '边缘抗锯齿': 'Edge anti-alias',
    '在图上标出拆出的区域': 'Show split regions on the image',
    '重新拆分': 'Split again',
    'SlimSAM · 本地': 'SlimSAM · local',
    '轻量模型约 13 MB，首次使用后缓存；不联网也能用自动拆分。': 'A lightweight 13 MB model, cached after first use; auto split works offline.',
    '加载 AI 模型': 'Load AI model',
    '保存选中': 'Save selected',
    '下载': 'Download',
    '下载 PNG': 'Download PNG',
    '加入画板': 'Add to board',
    '导出': 'Export',
    '更多': 'More',
    '再拆一张': 'Split another',
    '拖图片进来也可以': 'or drop an image in',
    '先去拆一张图。': 'Split an image first.',
    'SlimSAM 已就绪': 'SlimSAM ready',
    '桌面版下载': 'Desktop downloads',
    '全选': 'All',
    '全不选': 'None',
    '拆出来的元素会出现在这里。': 'Split elements will appear here.',
    '点画布上的元素也可以直接取出。': 'You can also click an element on the canvas.',
    '多选': 'Select',
    '去画板': 'Open board',
    '搜元素名字…': 'Search elements…',
    '已选 0': 'Selected 0',
    '元素库还是空的': 'Your library is empty',
    '元素库还是空的。': 'Your library is empty.',
    '去拆一张图，或者把图片直接拖到这里存成元素。': 'Split an image, or drop images here to save them as elements.',
    '去拆元素': 'Go to Extract',
    '松开，直接存进元素库': 'Drop to save straight to the library',
    '素材': 'Assets',
    '图层': 'Layers',
    '属性': 'Properties',
    '选中一个图层，这里可以调透明度和角度。': 'Select a layer to adjust opacity and angle.',
    '画板还是空的。': 'The board is empty.',
    '从左边素材库点一个元素进来。': 'Add an element from the library on the left.',
    '选中一个图层，': 'Select a layer,',
    '这里可以调透明度和角度。': 'to adjust opacity and angle.',
    '处理中': 'Working',
    '导出 PNG': 'Export PNG',
    '退出全屏': 'Exit full screen',
    '撤回': 'Undo',
    '背景': 'Background',
    '透明': 'Transparent',
    '不透明度': 'Opacity',
    '素材库就在画板左侧': 'Assets are already on the left of the board.',
    '形状 ▾': 'Shapes ▾',
    '素材库': 'Library',
    '矩形': 'Rectangle',
    '圆角矩形': 'Rounded rect',
    '椭圆': 'Ellipse',
    '三角形': 'Triangle',
    '星形': 'Star',
    '线条': 'Line',
    '箭头': 'Arrow',
    '上移': 'Up',
    '下移': 'Down',
    '置顶': 'Front',
    '置底': 'Back',
    '复制': 'Duplicate',
    '删除': 'Delete',
    '角度': 'Angle',
    '大小': 'Scale',
    '颜色': 'Color',
    '编辑文字': 'Edit text',
    '空心': 'Hollow',
    '描边': 'Stroke',
    '圆角': 'Radius',
    '角数': 'Points',
    '填充': 'Fill',
    '添加文字': 'Add text',
    '放到画板': 'Add to board',
    '字号': 'Size',
    '字体': 'Font',
    '粗细': 'Weight',
    '常规': 'Regular',
    '粗体': 'Bold',
    '无衬线': 'Sans',
    '衬线': 'Serif',
    'Bebas 展示体': 'Bebas Display',
    '自定义…': 'Custom…',
    '自定义画布': 'Custom canvas',
    '宽': 'Width',
    '高': 'Height',
    '应用': 'Apply',
    '取消': 'Cancel',
    '确定': 'OK',
    '确定？': 'Are you sure?',
    '登录': 'Sign in',
    '游客': 'Guest',
    '本机账号': 'Local account',
    '登录 PixPeel 网页版': 'Sign in to PixPeel Web',
    '登录后，元素库和画板会按昵称暂存在这台设备。没有服务器，没有上传，换设备不会同步；清除浏览器数据会一起清掉。': 'Your library and board are stored on this device under your nickname. No server, no upload, no sync across devices; clearing browser data clears them too.',
    '昵称': 'Nickname',
    '进入': 'Continue',
    '先以游客身份用': 'Continue as guest',
    '游客数据也会保存在本机，登录后可以合并。': 'Guest data is stored on this device too; sign in to merge it.',
    '切换 / 登录账号': 'Switch / sign in',
    '退出到游客': 'Sign out to guest',
    '清除这个账号的本机数据': 'Clear this account’s local data',
    '数据保存在浏览器 IndexedDB，不会上传。': 'Data lives in browser IndexedDB and is never uploaded.',
    '数据暂存在本机': 'Stored on this device',
    '本机账号 · 数据不上传': 'Local account · nothing uploaded',
    '游客 · 本机暂存': 'Guest · local only',
    '游客数据暂存在本机': 'Guest data is stored on this device',
    '清除本机数据？': 'Clear local data?',
    '切换昵称会打开对应的本机数据。': 'Switching nicknames opens that local data.',
    '已用': 'used',
    '把当前游客数据合并进来': 'Merge the current guest data',
    '先写一个昵称': 'Enter a nickname first',
    '昵称不可用': 'That nickname is not available',
    '先写点文字': 'Add some text first',
    '这张图读不出来': 'Could not read that image',
    '删除这个元素？': 'Delete this element?',
    '删除选中的元素？': 'Delete the selected elements?',
    '清空画板？': 'Clear the board?',
    '画板上的图层会全部移除，元素库不受影响。': 'All board layers will be removed; the library is untouched.',
    '删除后可以撤回。': 'You can undo this.',
    '已放到画板中间': 'Added to the center of the board',
    '已加入画板': 'Added to the board',
    '已登录，游客数据已合并': 'Signed in; guest data merged',
    '已退出，回到游客状态': 'Signed out; back to guest',
    '已清除这个账号的本机数据': 'Cleared this account’s local data',
    '已撤回删除': 'Deletion undone',
    '删除失败': 'Delete failed',
    '已导出 PNG': 'PNG exported',
    '导出失败': 'Export failed',
    '没有新的元素可保存': 'No new elements to save',
    '保存失败，可能是浏览器禁止了本机存储': 'Save failed. The browser may be blocking local storage',
    '保存失败': 'Save failed',
    '这些图片读不出来': 'Could not read those images',
    '正在加载 AI 模型…': 'Loading the AI model…',
    '模型已就绪，点画布上的元素试试': 'Model ready. Click an element on the canvas',
    'AI 已取出一个元素': 'AI lifted one element',
    'AI 没有找到有效区域': 'AI found no valid region',
    'AI 点选不可用，可以先用自动拆分或魔棒': 'AI pick is unavailable; use auto split or the wand',
    '已取出一个元素': 'Picked one element',
    '这里是背景，点元素内部试试': 'That is the background — click inside an element',
    '这里没有取到元素，换个位置': 'Nothing there — try another spot',
    '正在拆分…': 'Splitting…',
    '已载入，正在拆分…': 'Loaded. Splitting…',
    '没有找到可拆的元素，试试调低最小面积或用点选': 'Nothing found. Lower the minimum area or use Pick',
    '背景太复杂，换颜色聚类或点选': 'Background is too complex. Try color clusters or Pick',
    '正在载入图片…': 'Loading image…',
    '正在生成示例…': 'Building the sample…',
    '图片太大了（上限 40MB）': 'Image is too large (40 MB max)',
    '正在分析这张图…': 'Analysing the image…',
    '正在找边界…': 'Finding the edge…',
    '已存': 'Saved',
    '存': 'Save',
    '下': 'PNG',
    '完成': 'Done',
    '切到浅色': 'Switch to light',
    '切到深色': 'Switch to dark',
    '图片': 'Image',
    '形状': 'Shape',
    '已选': 'Selected'
  };

  const PATTERNS = [
    [/^已保存 (\d+) 个元素到元素库$/, 'Saved $1 elements to the library'],
    [/^已删除 (\d+) 个元素$/, 'Deleted $1 elements'],
    [/^已开始下载 (\d+) 个 PNG$/, 'Downloading $1 PNGs'],
    [/^已把 (\d+) 个元素加入画板$/, 'Added $1 elements to the board'],
    [/^已把 (\d+) 张图存进元素库$/, 'Saved $1 images to the library'],
    [/^拆出 (\d+) 个元素$/, 'Split into $1 elements'],
    [/^元素 (\d+)$/, 'Element $1'],
    [/^元素 (\d+) · (.+)$/, 'Element $1 · $2'],
    [/^已选 (\d+)$/, 'Selected $1'],
    [/^(\d+) 个元素 · 暂存在本机$/, '$1 elements · stored on this device'],
    [/^(\d+) 个元素$/, '$1 elements'],
    [/^(\d+×\d+) · 已入库$/, '$1 · saved'],
    [/^(.+) · 本机暂存$/, '$1 · local only'],
    [/^已切换到「(.+)」$/, 'Switched to “$1”'],
    [/^会删除「(.+)」的元素库和画板，无法恢复。$/, 'This deletes the library and board for “$1”. It cannot be undone.'],
    [/^将从本机元素库移除 (\d+) 个元素，删除后可以撤回。$/, 'Remove $1 elements from this device? You can undo this.'],
    [/^模型下载中 (\d+)%$/, 'Downloading model $1%'],
    [/^AI 不可用：(.+)$/, 'AI unavailable: $1'],
    [/^AI 模型加载失败：(.+)$/, 'AI model failed to load: $1'],
    [/^AI 点选失败：(.+)$/, 'AI pick failed: $1']
  ];

  const ATTR = {
    'PixPeel 首页': 'PixPeel home',
    '主导航': 'Main navigation',
    '元素库与画板': 'Library and Board',
    '全屏专注': 'Focus mode',
    '关闭': 'Close',
    '切换深色 / 浅色': 'Toggle dark / light',
    '导入图片': 'Import image',
    '拆元素工具': 'Extract tools',
    '撤回': 'Undo',
    '收起': 'Collapse',
    '画布尺寸': 'Canvas size',
    '缩小': 'Zoom out',
    '放大': 'Zoom in',
    '重做': 'Redo',
    '搜元素名字…': 'Search elements…',
    '比如：小林': 'e.g. Lin',
    '输入文字…': 'Type something…',
    'PixPeel 我做的抠图神器 — Bilibili': 'PixPeel — the cutout tool I made — Bilibili',
    'PixPeel 界面与拆出的贴纸': 'PixPeel interface with extracted stickers',
    '撤回 (Ctrl+Z)': 'Undo (Ctrl+Z)',
    '画布背景': 'Canvas background',
    '重做 (Ctrl+Shift+Z)': 'Redo (Ctrl+Shift+Z)',
    '显示 / 隐藏': 'Show / hide',
    '锁定': 'Lock',
    '下载 PNG': 'Download PNG',
    '加入画板': 'Add to board'
  };

  const BLOCKS = {
    heroTitle: '<span class="mark">Peel</span> the image.<br>Take each piece.'
  };

  const VIEW_TITLES = {
    home: { zh: 'PixPeel 网页版 — 把图剥开，一个个拿走', en: 'PixPeel Web — Peel the image, take each piece' },
    extract: { zh: 'PixPeel 网页版 — 拆元素', en: 'PixPeel Web — Extract' },
    library: { zh: 'PixPeel 网页版 — 元素库', en: 'PixPeel Web — Library' },
    board: { zh: 'PixPeel 网页版 — 画板', en: 'PixPeel Web — Board' }
  };

  const DESC = {
    zh: 'PixPeel 网页版：导入截图，自动拆出按钮、图标、文字和贴纸，存进元素库，直接在画板拼图。图片只在浏览器本地处理，手机也能用。',
    en: 'PixPeel Web: drop in a screenshot, lift out buttons, icons, text and stickers, save them to a local library and compose on the board. Runs in the browser; nothing is uploaded.'
  };

  function translate(s) {
    if (!s || !ZH.test(s)) return '';
    const key = String(s).trim();
    if (!key) return '';
    if (DICT[key]) return DICT[key];
    for (const [re, rep] of PATTERNS) {
      if (re.test(key)) return key.replace(re, rep);
    }
    return '';
  }

  function skip(node) {
    const el = node && (node.nodeType === 1 ? node : node.parentElement);
    return !el || !!(el.closest && el.closest('[data-no-i18n],script,style,code,pre'));
  }

  function textNode(node) {
    if (!node || node.nodeType !== 3 || skip(node)) return;
    const raw = node.nodeValue;
    const key = raw == null ? '' : raw.trim();
    if (!key) return;
    if (state.lang === 'en') {
      if (!ZH.test(key)) return;
      if (!origText.has(node) || origText.get(node) !== raw) origText.set(node, raw);
      const out = translate(key);
      if (!out) return;
      const lead = raw.match(/^\s*/)[0], tail = raw.match(/\s*$/)[0];
      const next = lead + out + tail;
      if (node.nodeValue !== next) node.nodeValue = next;
    } else {
      const z = origText.get(node);
      if (z != null && node.nodeValue !== z) node.nodeValue = z;
    }
  }

  function attrNode(el) {
    if (!el || el.nodeType !== 1 || skip(el)) return;
    let store = origAttr.get(el);
    if (!store) { store = {}; origAttr.set(el, store); }
    for (const name of ['placeholder', 'title', 'aria-label']) {
      const val = el.getAttribute(name);
      if (val == null) continue;
      if (state.lang === 'en') {
        if (!ZH.test(val)) continue;
        if (!store[name] || store[name] !== val) store[name] = val;
        const out = ATTR[val.trim()] || translate(val);
        if (out && out !== val) el.setAttribute(name, out);
      } else if (store[name] != null && val !== store[name]) {
        el.setAttribute(name, store[name]);
      }
    }
  }

  function blocks() {
    document.querySelectorAll('[data-i18n-block]').forEach(el => {
      const key = el.dataset.i18nBlock;
      if (state.lang === 'en') {
        if (!el.dataset.zhHtml) el.dataset.zhHtml = el.innerHTML;
        if (BLOCKS[key] && el.innerHTML !== BLOCKS[key]) el.innerHTML = BLOCKS[key];
      } else if (el.dataset.zhHtml && el.innerHTML !== el.dataset.zhHtml) {
        el.innerHTML = el.dataset.zhHtml;
      }
    });
    document.querySelectorAll('[data-en-href]').forEach(a => {
      if (!a.dataset.zhHref) a.dataset.zhHref = a.getAttribute('href') || '';
      const want = state.lang === 'en' ? a.dataset.enHref : a.dataset.zhHref;
      if (want && a.getAttribute('href') !== want) a.setAttribute('href', want);
    });
    document.querySelectorAll('[data-en-src]').forEach(img => {
      if (!img.dataset.zhSrc) img.dataset.zhSrc = img.getAttribute('src') || '';
      const want = state.lang === 'en' ? img.dataset.enSrc : img.dataset.zhSrc;
      if (want && img.getAttribute('src') !== want) img.setAttribute('src', want);
    });
    document.querySelectorAll('[data-en-alt]').forEach(img => {
      if (!img.dataset.zhAlt) img.dataset.zhAlt = img.getAttribute('alt') || '';
      const want = state.lang === 'en' ? img.dataset.enAlt : img.dataset.zhAlt;
      if (want != null && img.getAttribute('alt') !== want) img.setAttribute('alt', want);
    });
  }

  function meta() {
    const v = window.PPApp ? PPApp.view() : 'home';
    const t = VIEW_TITLES[v] || VIEW_TITLES.home;
    document.title = t[state.lang] || t.zh;
    const d = document.querySelector('meta[name="description"]');
    if (d) d.setAttribute('content', DESC[state.lang] || DESC.zh);
    const ogt = document.querySelector('meta[property="og:title"]');
    if (ogt) ogt.setAttribute('content', t[state.lang] || t.zh);
    const ogd = document.querySelector('meta[property="og:description"]');
    if (ogd) ogd.setAttribute('content', DESC[state.lang] || DESC.zh);
  }

  function apply(root) {
    if (!root) return;
    if (root.nodeType === 3) { textNode(root); return; }
    if (root.nodeType !== 1 && root.nodeType !== 9) return;
    if (root === document.body || root === document.documentElement || root === document) blocks();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    let n;
    while ((n = walker.nextNode())) textNode(n);
    const sel = 'input[placeholder],input[title],button[title],button[aria-label],a[aria-label],[title],[aria-label],select[aria-label]';
    if (root.matches && root.matches(sel)) attrNode(root);
    root.querySelectorAll && root.querySelectorAll(sel).forEach(attrNode);
    if (root === document.body || root === document) meta();
  }

  function updateButton() {
    const b = document.getElementById('langBtn');
    if (!b) return;
    b.textContent = state.lang === 'zh' ? 'EN' : '中';
    b.title = state.lang === 'zh' ? 'Switch to English' : '切换到中文';
    b.setAttribute('aria-label', state.lang === 'zh' ? 'Switch to English' : '切换到中文');
  }

  function setLang(lang) {
    state.lang = lang === 'en' ? 'en' : 'zh';
    document.documentElement.lang = state.lang === 'en' ? 'en' : 'zh-CN';
    try { localStorage.setItem('pp_web_lang', state.lang); } catch (e) { }
    updateButton();
    try { if (window.PPApp && PPApp.onLanguageChange) PPApp.onLanguageChange(); } catch (e) { }
    apply(document.body);
  }

  function start() {
    let saved = null;
    try { saved = localStorage.getItem('pp_web_lang'); } catch (e) { }
    const auto = (navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
    state.lang = saved === 'en' || saved === 'zh' ? saved : auto;
    document.documentElement.lang = state.lang === 'en' ? 'en' : 'zh-CN';
    updateButton();
    apply(document.body);
    const b = document.getElementById('langBtn');
    if (b) b.onclick = () => setLang(state.lang === 'zh' ? 'en' : 'zh');
    if (window.MutationObserver) {
      observer = new MutationObserver((muts) => {
        if (state.lang !== 'en') return;
        for (const m of muts) {
          if (m.type === 'characterData') textNode(m.target);
          else if (m.type === 'attributes') attrNode(m.target);
          else for (const n of m.addedNodes) {
            if (n.nodeType === 3) textNode(n);
            else if (n.nodeType === 1) apply(n);
          }
        }
      });
      observer.observe(document.body, {
        subtree: true, childList: true, characterData: true,
        attributes: true, attributeFilter: ['placeholder', 'title', 'aria-label']
      });
    }
  }

  window.PPI18N = {
    start, apply, setLang,
    lang: () => state.lang,
    t: translate,
    titleFor(v) {
      const t = VIEW_TITLES[v] || VIEW_TITLES.home;
      return t[state.lang] || t.zh;
    },
    refreshButton: updateButton
  };

  document.addEventListener('DOMContentLoaded', start);
})();
