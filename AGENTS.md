# AGENTS.md —— 给接手这个项目的 AI 看

> 面向：接手的 AI 维护者。
> 读法：先看「1 分钟速览」和「踩过的坑」，再看需要改的那部分。
> 发布细节看 [docs/RELEASING.md](docs/RELEASING.md)，改动 H5 前先看 [docs/LINK-PROTOCOL.md](docs/LINK-PROTOCOL.md)。

## 1 分钟速览

PixPeel 是一个 **Electron 桌面应用**：截图或导入图片 → 自动拆出其中的元素 → 存成透明底 PNG 贴纸。
配套还有一个单文件网页版动画编辑器「小剪动画」（`editor/xiaoji-animation.html`），双击即用，和桌面版通过本机 HTTP 服务联动。

- 仓库：`https://github.com/lertone/PixPeel`（公开，main 分支）
- 许可：**PolyForm Noncommercial License 1.0.0（非商用）**，1.0.8 起生效；1.0.7 及更早是按 MIT 发布的，那些版本仍按 MIT 提供（不可追溯）。改协议要同时改 `LICENSE`、`package.json` 的 `license`、`build/license.rtf`（安装向导协议页，用 `node build/gen-license-rtf.js` 从 LICENSE 重新生成）、README 中英两份。注意 electron-builder 的 `getNotLocalizedLicenseFile` 只要发现 `build/license.rtf` 就只用它，`license_<lang>.rtf` 会被忽略，所以协议页是单个中英双语文件
- 仓库地址写在 `config.js` 的 `repo` 字段里，**「检查更新」功能靠它**，改了 GitHub 用户名必须同步改这里
- 捐赠入口写在 `config.js` 的 `donate` 字段（Ko-fi + 爱发电），留空字符串就不显示对应按钮；`main.js` 的 `safeExternal` 白名单会自动包含这些域名，**新增外部链接域名必须走 config，别直接放宽 `safeExternal`**
- 技术栈：Electron 33 + 原生 JS（没有框架、没有构建步骤），渲染进程是单页多视图
- 界面语言：简体中文 / English，文案在 `renderer/i18n.js`（中英两份，**新增文案必须两边都加**）

## 用户是谁，要遵守什么

作者是中文用户，用 Windows 机器。**他的要求优先级高于技术上的「更优雅」**：

1. **交付物必须是「双击就能装」的安装包**。普通人不会开终端跑构建命令，所以打包脚本、CI workflow、安装向导本身就是交付物的一部分——做完必须验证到能产出可双击安装的 exe，别只改代码就交差。
2. **他只有 Windows 开发机，验证不了 Linux / macOS 构建**。所以跨平台发布必须由你在 GitHub Actions 上实跑三平台并核对产物，不能只跑 Windows 就宣布完成。
3. **中文沟通**。README / CHANGELOG 中英文都要同步，版本号和 CHANGELOG 必须一致。
4. 项目已长期交给 AI 维护，**不要等他催**。发现 bug 直接修、发版、验证；但选型、收费、公开范围这类决策要回头问他。
5. 他要真实数字，不要估算。改动后用实际测试给结论。

## 目录结构

```
main.js          主进程：托盘、全局快捷键、设置、开机自启、更新检查、导入对话框
preload.js       contextBridge 暴露的 API（inv/onXxx 两类）
lib.js           素材库读写（PNG 为主，另存 SVG）
config.js        全局配置（repo、appId、version 等）——「检查更新」看这里
updater.js       自动更新（electron-updater）：下载、进度、重启安装；只在 Windows x64 / Linux AppImage 启用
server.js        本机联动服务，只监听 127.0.0.1:17652
renderer/
  app.js         拆元素页（主界面）、拼贴墙、元素列表
  engine.js      分割引擎：颜色/聚类分割、连通域、形态学、边缘修补
  board.js       画板（位图拼图 + 文字层 + 吸附虚线 + 背景图 + 字体库）
  svg.js         SVG 库 + SVG 画布（矢量分层编辑）
  extras.js      设置页、高清修复、AI 模型面板等
  i18n.js        中英文案
  index.html     唯一页面；logo 是内联 SVG
  style.css
  fonts/          内置免费字体（SIL OFL）+ OFL 许可证
build/installer.nsh   NSIS 自定义脚本（开始菜单快捷方式 + AUMI，Windows 通知图标靠它）
editor/xiaoji-animation.html   「小剪动画」H5
.github/workflows/release.yml  打 tag 即发版
docs/            CHANGELOG（中英）、PRIVACY、LINK-PROTOCOL、RELEASING
```

## 核心数据模型（改之前务必理解）

### 拆元素页的「拼贴墙」（v1.0.4 起）

批量导入多张图后，多张图均分成网格铺在一张大画布上：

- `SEG.tiles[]`：每张导入的图一块（`{id,name,src,w,h,x,y,sc}`），`SEG.cur` 是当前操作的那块
- `SEG.src` 始终 = 当前块的图；`SEG.wall` = 整面墙的尺寸，画布元素尺寸 = 墙尺寸
- **每个元素带 `L.tile`**（属于哪张图）。`segAt` 按 tile 过滤、`segCut` 用该 tile 的源图取颜色、`segApply` 重建层时要把 `nl.tile` 带上
- `segLayout()` 统一缩放 + 按实际高度分行，墙高 = 各行实际高度之和
- 画布坐标换算：`segWallPt(e)` → 墙坐标 → `segTileAt()` 找块 → 块内像素坐标；点到别的块会自动 `setCurTile()` 切过去
- **批量导入必须串行处理**（`for...await`），否则多图并发会互抢 `SEG.src`，切出来的元素取错源图

### 重新导入要「清干净」（v1.1.0 起）

每次重新导入 / 截图 / 粘贴 / 清空画布，**入口第一件事都是 `segReset()`**（engine.js）：

- 释放上一批每块图的 `src.cv`（宽高置 0）和 `src.data`，否则反复导入内存只涨不降、越来越卡
- 清掉图层的 `m` / `mp` / `tint` / `_cuts` 缓存
- `SEG.seq = 1`——**元素序号每次从 1 开始**（以前只增不减，第二次导入会从「元素 9」接着数）
- AI worker 不销毁（模型下过一次就留着），只把 `SEG.ai.embedded = false`、`raw = null`，否则下次点选会用上一张图的 embedding

配套的两条性能规则：

- **`runBatch()`**：批量导入期间 `BATCH > 0`，`openImage` 不在每张图后重建界面，批次结束才 `buildEdit()` + `segRender()` + `segList()` 一次
- **`segList()` 按图层 id 集合复用 DOM**：`el.dataset.sig` 没变就只更新 class / checkbox / 名字。点一下元素就重建几十张卡片是选取卡顿的主因
- 套索 / 悬停的重绘走 `segRenderSoon()`（rAF 合并），别再直接 `segRender()`

`segCut(L, pad)` 的结果按 pad 缓存在 `L._cuts`。**缓存对象必须在 `segPolishMask(L)` 之后再建**——重算蒙版时 `segPolishMask` 会把 `L._cuts` 置空，先建对象会把结果写进没人引用的孤儿对象，等于没缓存（v1.1.0 开发时踩过，元素列表因此慢 20 倍）。

### 分割是一连通块一图层

`segAuto()` 用 `segCC()` 做连通域标记，**一个连通块 = 一个图层**。所以边缘修补只在单个元素内部进行，**不同元素之间永远不会被粘连**（验证时别用「两个方块放同一张蒙版」来测，那个场景不成立）。

### 边缘处理（v1.0.4 起，v1.0.5 增强）

纯本机算法，**不用 opencv.js / 模型**（wasm 体积大、要联网下载、启动卡；模型几十到几百 MB 与 Electron 体积冲突；形态学是 O(n) 像素扫描，微秒级、完全离线）。

`segPolishMask(L)` 的顺序：
1. 形态学闭运算（半径 1px）→ 补 1~2px 的小缺口
2. `segFillCracks(m,w,h,maxGap)` → 裂缝填充：**只在左右（或上下）两侧都找得到前景、且缝隙总宽 ≤ maxGap 时**才填，跑 3 遍让阶梯裂缝合拢
3. `segFillHoles` → 洪水填充，洞多大都能填
4. `segSmoothEdge(g,W,H)` → alpha 通道 3×3 邻域平均（0.65 原值 + 0.35 均值），把 0/255 硬边变成渐变过渡带

设置项：`edgeSmooth`（总开关）、`edgeGap`（补缝宽度 0/2/3/4/5/6，默认 4）。
**改 `edgeSmooth` / `edgeGap` 后必须同时作废 `L.mp`（补过边的蒙版）和 `L._cuts`（切好的透明底图）**：
`SEG.layers.forEach(L => { L.mp = null; L._cuts = null; })`，否则缓存不失效，改了没反应（v1.1.0 之前 `edgeSmooth` 就是这个 bug）。

补缝宽度和「把两个挨得很近的元素连成一个」在几何上是同一件事，无法两全——所以宽度做成可调，让用户取舍。

### AI 点选（SlimSAM）

`renderer/engine.js` 里用一个 Web Worker 跑 transformers.js，模型从 HuggingFace 下载，国内自动走 hf-mirror 镜像。
两种权重：量化版 `q8`（默认，15–40MB）和浮点版 `fp32`（40–100MB）。**浮点版在内存不够的机器上会加载失败**——已经加了自动降级（`aiFallbackToQ8()`：失败就换回量化版重试一次，只降一次）。模型状态记在 localStorage 的 `pp_ai_q8` / `pp_ai_fp32`。

v1.2.0 起支持**多点 + 反选点**：`SEG.aiPts` 存 `{x,y,neg}`，普通点击是正点、Alt+点击是反点；worker 用 `input_points:[[m.pts]]` + `input_labels:[[m.labels]]`（只有存在反点时才带 labels，保持原单点调用不变）。同一次会话里后续点击会 `segReplaceLayer()` 替换同一层，不会越点越多层；新正点落在当前层 bbox 外会自动开一轮新提示点。点位置用画布上的绿 + / 红 − 标出，切工具 / 切图块 / 清空提示点都会重置 `SEG.aiPts`、`SEG.aiLayer`。

### 抠图增强（v1.2.0）

- **拆出一块**：`SEG.mode='split'`。`segApply` 把「选区 ∩ 当前层」变成独立元素，原层只保留剩下的部分（全被拿走就删掉）。新层名是「{原层} 拆出」。
- **补画笔**：预览窗 `.pvAdd` 和橡皮二选一（`PV.add`）。拆元素用 `segAddDot()` 改写 `L.m` + tint，并从 `segSourceCv()`（按 1px padding 对齐的原始像素副本）把像素画回 `cutCv`；画板用 `Board.paintBegin(l, true)` 返回 `{cv, base}`，`paintDot()` 从 `base` 补画。`__base` 是第一次涂抹前的原始位图，`paintBegin` 时创建；`__sil`（描边剪影）要在涂抹后置空。
- **软边**：`CFG.softEdge`（0–6 px，设置页滑杆）。`segCut` 里若 >0 就走 `segSoftEdge()`（alpha 盒式模糊 + 半透明像素颜色往内部平均色拉），否则回退到 `segSmoothEdge()`。改 `softEdge` 必须清 `L._cuts`。
- **文字/线条整理**：`segGroupText()` 由按钮触发；线条按 `autoKind='line'` / 文字块按 `autoKind='text'` 命名，`relabelLayers()` 会跟着语言切换。用户手动改名时 `autoName` 和 `autoKind` 都要清空。
- **批量一致性**：多图时 `segResplitAll()` 用当前参数逐张重跑 `segAuto()`，每张图只清自己的图层。

v1.2.1 修正（这些都是用户实测报过的）：

- `segTargets()` **只认当前 tile 的选中层**。`setCurTile()` 必须清 `SEG.sel`，否则切图后还用上一张图的 bbox 配新图的 `SEG.src`，加减拆会跑到错误位置。没有显式选中时，加 / 减 / 拆作用在圈到的那个元素（最上面一层），不再要求先勾选。
- 加 / 减结果 `nl.on=true`，否则用户点元素时它已经被 toggle 成 off，改完看不见；没有像素变化时提示 `eNoChange`，不要静默重建一层。
- 参数区显示「当前元素：xxx」，否则「加到当前」的“当前”完全不可见。

### SVG 矢量化（v1.2.1）

- 内置 `renderer/vendor/imagetracer.js`（ImageTracerJS 1.2.6，**Unlicense / 公有领域**，47KB，无构建步骤），在 `index.html` 里用普通 `<script>` 引入，全局 `ImageTracer`。
- `buildVectorSvg(out)`：对每个 `buildOut()` 的 cut canvas 做 `imagedataToSVG`，默认 `numberofcolors:12`、`ltres/qtres:0.8`、`strokewidth:0`、`pathomit:6`；去掉 `opacity<0.02` 的透明背景路径，再按 `translate(o.x o.y)` 组合成保留图层的 SVG。
- 背景层（`area>=1e11`）、超过 90 万像素、单层路径 >1.2MB 的元素**自动回退成内嵌 PNG**，保证导出文件完整；`doVectorSvg()` 只是包一层保存对话框和 toast。
- 实测 300×200 的 logo + 文字：3 个矢量组、70 条 path、12KB、没有 `<image>`、浏览器能正常渲染。复杂照片不要期待描摹效果好，它适合纯色 logo / 文字 / 线条 / 简单图形。
- SVG 库的「矢量 / 内嵌位图」标记靠检测 `<image>`，混合导出会显示内嵌位图，这是正确行为。
- v1.3.0 起加了门槛：`vectorFriendly(cv)` 抽样最多 12 万像素、按 4bit 色桶统计，主色 ≤20 个、最大主色 ≥5%、半透明边缘 ≤60% 才允许描摹。没通过的元素内嵌 PNG；整批 `vec===0` 时 `doVectorSvg()` 只提示 `svgVecNotSimple`、不再保存，避免输出一堆碎片路径。实测简单 logo 24 条路径 / 4KB，渐变照片 0 条。

### 高清修复模型（v1.3.0）

- `renderer/sr.js` + `renderer/vendor/ort/*` + `renderer/vendor/models/realesr-general-x4v3.onnx`。模型输入 `image` `[1,3,128,128]` RGB 0–1，输出 `upscaled_image` `[1,3,512,512]`，固定 4x；128 输入是模型内部固定 shape，改成 256 会 shape 推断失败。
- 主进程 `asset:read` 只放行 `sr/model.onnx` 和 `sr/ort-wasm-simd-threaded.wasm`；`package.json` 的 `asarUnpack` 必须包含 `renderer/vendor/ort/**` 和 `renderer/vendor/models/**`，否则打包后读不到。
- `srEnsure()` 先建 WebGPU session（约 1.4s），失败才设 `ort.env.wasm.wasmBinary` 再建 WASM session。**不要在 WebGPU 之前设 wasmBinary**，会报 `d is not a function`。运行 `SR.ep` 可判断当前后端。
- `srUpscale` 按 128 切块、每块保留 16px 上下文、只取中间 96×4 的区域拼接，块间无接缝；透明元素单独把 alpha 用 Lanczos 放大，硬边贴纸再做 smoothstep 收边。RGB 用 8 邻域向外生长填透明区，避免模型把边缘带黑。
- 手动高清（素材库 ✦ 按钮 / `hdFile`）走模型；保存时自动高清 `buildOut` 里的 `hdCanvas(..., false)` 仍走经典 `hdEnhance`，否则批量保存太慢。设置项 `CFG.srModel` 默认 true，可在设置 → 素材处理关掉。

### 背景层（「剩下的部分也存成一层」）

`buildOut()` 里对**每张有选中元素的图**各算一份背景层（v1.0.6 起）。之前只算当前那张，
批量导入时其它图的剩余像素被静默丢弃。批量时文件名是 `背景 - <原图名>.png`，
否则几张「背景」会退化成 `背景.png` / `背景_2.png`。

### 画板：文字层、吸附与字体（v1.1.1 起）

文字层是 `{ kind:'text', text, font, size, weight, italic, color, align, lineH, letter, x, y, s, r }`，
**不存位图**：只存参数，`drawText()` 每次按当前缩放矢量绘制，放大和导出都不糊。图片层没有 `kind`。

- `textLayout(l)` 用共享的测量 canvas 算紧致外框（`w`/`h` 写回图层，`_lk`/`_lay` 缓存，key 是全部排版参数）
- **`measureText` 的 `actualBoundingBox*` 会按 `c.textAlign` 变化**，所以测量前必须设 `c.textAlign = l.align`，和 `fillText` 时保持一致，否则外框和实际墨迹对不上
- `x0` / `x1` 初值必须是 `±Infinity`：左对齐时 `actualBoundingBoxLeft` 是负数（-5），从 0 开始取最小会留下 5px 空白
- 字体：内置 8 款在 `renderer/fonts/`（SIL OFL，附 `OFL-*.txt`），`FONTS` 数组里配 `@font-face` 的 family 栈；用户导入 / 应用内下载的字体在 `userData/fonts`，主进程 IPC 为 `font:list/read/import/del/download`。用户字体 key 是 `u:文件名`，运行时 `FontFace` 注册后 push 进 `FONTS`，`loadUserFonts()` 负责重载和刷新下拉框。下载源固定 `registry.npmmirror.com` 的 `@expo-google-fonts` tgz，主进程用 `zlib.gunzipSync` + 手写 tar 解析取 TTF，不要放开任意 URL
- **v1.1.1 移除了对齐按钮栏**。拖动时 `snapMove()` 按「画布边缘/中线 + 其它图层的 worldBox 边缘/中线」吸附，阈值 6 屏幕像素（换算成文档坐标要除以 `B.zoom`），命中时把虚线位置写进 `B.guide`，`draw()` 画橙色虚线。多选时按 `unionBox` 整组吸附
- 选框右上角 `B.topBtn` 是「置顶」、右下角 `B.botBtn` 是「置底」按钮，只在单选时绘制 / 命中，点击分别 `toFront()` / `toBack()`。按钮位置每帧重算，坐标是屏幕坐标，`hitLayer` 不要抢在它们前面
- 背景图 `B.bgImg` 不是图层：`drawBgImage()` 在背景色之后、所有图层之前画，`cover`/`contain` 由 `B.bgMode` 控制，`snapB` 里用 `bgId` 进历史 key。吸管用 `window.EyeDropper`，不支持就 toast

预览窗（`app.js` 的 `PV`）同时服务拆元素页、画板和素材库：

- `PV.mode = 'seg' | 'board' | 'lib'`；`pvItems()` 取 `SEG.layers`、`Board.state.layers` 或 `PV.libItems`。画板和素材库模式不显示勾选框，文字层 / 素材预览禁用橡皮
- 视图不是「canvas 跟着图放大」，而是 canvas 铺满 `.pvStage`，用 `translate/scale` 绘制；擦除坐标要用逆变换算回图层像素。滚轮缩放、中键平移、双击 `pvFit()`
- 拆元素橡皮 `segEraseDot()` 清 `L.m`，同时清 `L.tint` 和 `segCut` 的 canvas，设 `L.manual=true` 并作废 `L.mp` / `L._cuts`
- **落笔前必须调 `segEraseBegin(L)`**：把当前 `segPolishMask(L)` 固化进 `L.m`。否则第一笔把图层切成 manual，补缝 / 填洞的结果全部消失，用户看到的就是「橡皮把整块背景擦掉了」（1459×928 的整图元素实测：原始蒙版 368k 像素，补洞后 1.31M，直接切 manual 会瞬间少 94 万）
- 橡皮要在两个 pointermove 之间按 `brush*0.35` 补点，快速拖动才不会断成一个个圆点
- 预览窗内的 Ctrl+Z：拆元素用 `PV.segHist`（每次落笔前存一份 `Uint8Array` 蒙版，按总字节数 48MB / 12 笔封顶），画板直接走 `Board.undo()`；UI 上对应标题栏的 ↶ 按钮，按历史有无自动禁用
- 画板橡皮 `Board.eraseBegin()` 复制一份位图再 `destination-out`，不碰素材库原文件；`eraseBegin` 里 `B.rev++`，否则像素变化进不了 `snapB()` 的 key、撤不回
- 素材库预览用 `pvOpenLib(items, rel)`，先把 `url` 全预载成 Image；画板素材栏和素材库页共用它

画板其它 v1.1.2 约定：

- 新文字样式存 `textStyle` + localStorage `pp_text_style`，每次改字号 / 字体 / 颜色等都由 `rememberText()` 记住；只有「恢复默认」按钮会重置。`DEF_TEXT` 是唯一的默认值来源
- 选框两个小按钮：`B.topBtn`（右上 ↑ 置顶）和 `B.botBtn`（右下 ↓ 置底），都只在单选时绘制和命中，命中判断要排在 `hitHandle` 之前
- 素材栏宽度 `--bdmatw`、素材格子 `--bdtile`、拆元素检查器 `--insp-w`、素材库 `--libmin`、导航收起 `body.railHide` 都写 localStorage；分隔条 `.vsplit` 是真 grid/flex 列，拖宽会让另一侧真正变小，不要做成浮层
- 删除按钮统一是垃圾桶 SVG（`IC.trash`）。**按钮里塞 SVG 后不能用 `e.target.id`**：点到的是 `<path>`，id 为空。委托点击必须 `e.target.closest('button[id]')`（拆元素页的 `bDel` 就踩过这个）
- 导航收起后 `#railShow` 是 16px 的 grid 子项（不是 fixed 浮层），`main` 始终 `grid-column:2`；否则网格自动排布会把 main 塞进 0px 的第一列
- SVG 画布的旋转柄 `rotHandle()` 要沿顶边外法线伸出，线段从顶边中点到手柄；不要从 `cs[0]` 画斜线

画板 v1.2.0 起：

- **图层面板**是 `.bd-main` 里真实的一列（`.bd-col` + `.bd-side`，`#v-board.layersOn` 时显示），显示时画布变窄，不是浮层。图层属性都直接挂在图层对象上：`vis`（false 才隐藏）、`lock`、`op`、`blend`、`group`、`strokeW/strokeColor`、`shadowOn/shadowBlur/shadowDX/shadowDY/shadowColor`。**`snapB()` 的 key 必须包含这些字段**，否则改透明度 / 混合 / 锁 / 分组 / 特效都进不了撤回历史。
- 图片描边用 `strokeSil()` 生成的纯色剪影沿圆周偏移绘制；剪影缓存在 `l.__sil`，涂抹 / 换颜色后要置空。文字描边 / 投影在 `drawText()` 里用 `strokeText` + `shadow*` 实现。
- 锁定层在 `hitLayer` / 框选 / 删除里跳过，但仍可在图层面板里选中；隐藏层不参与命中和导出。点组内任一元素会把整组加进 `B.multi` 一起拖动。
- **等距分布** `distribute('h'|'v')` 用 `worldBox` 的实际墨迹边缘，首尾不动、中间均分；三个以上才可用。
- **存档**：主进程 IPC `archive:list/save/read/del`，文件在 `userData/board-archives/*.json`。图片层存成 dataURL，文字层只存参数；恢复时重建图层并清空撤回历史。文件名只接受 basename + `.json`。
- 改面板 / 图层面板相关 DOM 时注意 **dataset 是字符串，图层 id 是数字**：`x.id === row.dataset.lid` 永远 false，必须 `String(x.id) === ...`（v1.2.0 的锁定按钮踩过）。
- **Electron 不支持 `window.prompt()`**，调用会直接抛 `prompt() is not supported.`。改名 / 输入名字一律用 `app.js` 的 `askText(title, value, cb)`（应用内输入框）。
- 图层面板每次选中都会 `renderLayers()` 重画 `innerHTML`，**原生 `dblclick` 永远收不到**。改名要按两次点击的间隔自己判断（`lastTap`），不要依赖 `ondblclick`；SVG 画布图层列表同理（`rowTap`）。
- 多选 / 成组：`draw()` 里算 `B.groupBox`（屏幕坐标的整组选框 + 四角 + 旋转柄），`hitHandle()` 返回 `gscale/grot`，`down/move` 对整组做绕中心缩放 / 旋转；底部角度 / 大小滑杆也按“整组”处理（角度加增量、大小按比例并绕中心移动位置）。改这块时注意 `snapB()` 的 key 已经包含 s/r/位置。
- 素材库 / SVG 库默认不显示 `.libCk`，`.libMultiOn` 才显示；`gridSelectInit()` 的「多选」按钮切换 `multiOn`，非多选模式下空白拖动不生效、点卡片仍然复制 / 打开。
- **基础矢量形状（v1.3.0）**：图层 `kind:'shape'`，`shape` 为 `rect/round/ellipse/line/arrow/triangle/star`，参数是 `w/h/fill('none' 为空心)/lineColor/lineW/radius/points`。`drawShape()` 用 Canvas 路径按图层参数绘制，导出时按目标分辨率重画，所以不是位图；`inkRect()` 对 shape 直接用 `w/h`。`snapB()`、`layerSnapshot()`、`openArchive()` 都必须带上这些字段，否则缩放 / 旋转 / 存档会丢。形状没有图片描边控件，描边统一用 `lineW`。

### 素材库 / SVG 库的框选

给每张 `.cell` 加 `.libCk`，空白处 `pointerdown` 拉框，Ctrl / Shift 点击加选，标题栏的垃圾桶批量删除（仍走 3 秒 `undoToast`）。测试时注意：**窗口在后台时 Chromium 会把 `setTimeout` 节流到分钟级**，删除的 3 秒确认会拖很久，别误判成删除失败。

### SVG 的真相（v1.2.0 明确标注）

从拆元素页导出的「分层 SVG」**不是矢量图**：每个 `<g>` 里是一个 `<image xlink:href="data:image/png;base64...">`，也就是把透明底 PNG 包进 SVG。所以放大会和原图一样模糊，文件体积也大。导出时写入了 `<desc>` 说明；导出提示、按钮 tooltip、SVG 库说明和 SVG 画布标题都会标「内嵌位图」。v1.2.1 起另有「矢量 SVG」按钮，用 ImageTracer 把简单元素描摹成真正的 `<path>`（见上面的「SVG 矢量化」），复杂图片仍然保留位图。



对齐仍按**实际有像素的边缘**算，不是 PNG 的图片框：

- `alphaBox(im)`：alpha > 8 扫描真实墨迹范围，最多采样 1024px，结果缓存在 `im.__box`
- `inkRect(l)`：图片用 `alphaBox`，文字用 `textLayout` 的 `w/h`
- `worldBox(l)`：墨迹矩形四角按 `l.s` / `l.r` 变换后取 AABB（旋转时含空角，属正常）
- 实测：不对称图（内容只占 200×200 的右下 60×40）六个方向误差 0px；文字墨迹与 `worldBox` 误差 0.41px

`snapB()` 的 `k` 里要带上文字参数，否则改字号 / 颜色不会进撤回历史。

## 网页版（web/，v1.3.0 起）

- 纯静态、无构建：`web/index.html` + `web/css/site.css` + `web/js/{store,extract,library,board,app}.js`。三个区域是主页 / 拆元素 / 元素库（元素库内含画板），顶部 `#tabs` 切换，hash 路由 `#home #extract #library #board` 在 `app.js`。
- 数据：IndexedDB `pixpeel-web`，`items`（uid 索引）和 `boards`（uid 主键）；本机昵称存在 localStorage `pp_web_session`；游客 uid `guest`。登录只是本机昵称，不联网；勾选合并时 `PPStore.mergeGuest()` 会把游客元素和画板搬到账号下。
- 拆元素：`extract.js` 先在原蒙版上做连通块，再按组件分组合并（**不要直接膨胀整张蒙版**，会通过背景把远处元素串成一个大块）；默认合并 6px，同行的小组件允许 2 倍字距。SlimSAM 模型在 `web/models/slimsam/`，transformers.js 从 CDN 加载，模型本地读取，失败不影响自动拆分。
- 画板：`board.js` 图层 `kind:'img'|'text'|'shape'`，图片 `blob` 直接存 IndexedDB；自动存档 500ms 防抖；导出按 W×H 重绘。移动端底部抽屉，`body.focusMode` 隐藏全部面板，CSS 在 `max-width:900px` 下要把 `.exShell` 改回单列，否则全屏时舞台会塌成 2px。
- 必须保留 `[hidden]{display:none!important}`：很多面板有 `display:grid/flex`，否则 `hidden` 属性会被作者样式覆盖（拆元素忙碌遮罩就踩过）。
- 部署：GitHub Pages 用 `.github/workflows/pages.yml` 上传 `web/`；站点地址写死在 `config.js` 的 `website`，桌面版设置里的「官方网站」通过 `publicSettings().website` 读取，`safeExternal` 会自动把该域名加入白名单。
- 中英切换在 `web/js/i18n.js`：静态文案 / 属性 / 图片 / 隐私链接按中文原文映射，动态节点用 MutationObserver 兜底；新增界面文案时，把中文原文和英文翻译加进 `DICT`（带变量的加 `PATTERNS`），不要只在 HTML 里写中文。语言存 `localStorage` 的 `pp_web_lang`，默认跟随浏览器语言。
- 本地测试：`python -m http.server 4180 --directory web`，用 Chrome CDP 或浏览器实测桌面 / 390px 手机；页面不依赖构建，改完刷新即可。

### 联动协议

H5 主动拉 PixPeel：`GET /api/ping` → `{app:"pixpeel",version:1}`；`GET /api/list` → `{items:[{id,name,group,mtime,size,url}]}`；`GET /file/<rel>` → 图片二进制。
服务端带 `Access-Control-Allow-Private-Network: true`，所以 file:// 页面能连。端口两边可改但要一致（默认 17652）。
**素材库只放 PNG**，别把元素库改成原生 SVG——H5 联动读的就是 PNG，改了会破坏联动和用户已有的心智模型。

## 踩过的坑（这些是真的踩过，别再踩一遍）

### 代码层

- **`new Image().decode()` 在 Electron 里可能永远不 resolve**（图片其实早加载完了，`naturalWidth` 正常）。一律用 `onload` 事件，别用 `decode()`。SVG 画布「加到画板」和批量导入都卡过这里。
- **模板里的 `id="xxx"` 和代码里 `$('#xxx')` 必须完全一致**。SVG 画布写成 `id="svName"`、代码查 `#svgName`，导致 `mount()` 抛异常、图层列表永远空白。
- **`document.importNode()` 复制出来的 SVG，旧的 `g` / 原始子节点引用全部失效**。挂载后必须把 `S.svg`、`L.g`、`L.el` 全换成副本里的节点。而且 `getBBox()` 对脱离文档的节点返回 0（旋转中心会算到原点），`insertBefore` 也改不动真实顺序。
- **凡是「进入页面就挂载」的函数（`enter()` / `mount()`）必须先判空**。`document.importNode(null, true)` 会抛 TypeError 把整页打挂——SVG 画布从 v1.0.2 起就有这个洞（没导入过 SVG 时点导航即崩），v1.0.4 才补上空状态。
- **别想当然认为滚动容器是外层**。`#segList` 自己带 `max-height:280px; overflow:auto`，真正滚的是它，不是外面的 `.inspBody`。保存/恢复 `scrollTop` 必须对 `#segList` 做（外层一起存无妨）。v1.0.4 一开始存错了对象，用户说「滑动后点元素跳回第一行」的 bug 其实一直没修好，v1.0.5 才真正修对。
- **纵向 flex 子项默认 `min-height:auto`，会把盒子撑到内容高度**。素材库卡片的 `.im` 写了 `aspect-ratio:1`，竖长图仍然把缩略图撑高，同一行的方图卡片下方就留出大片空白（v1.0.5 及之前一直有）。修法是 `min-height:0` + `.grid{align-items:start}`，两个都要，少一个就还会不齐。
- **`segPolishMask` 会把手动抠掉的东西补回来**。边缘处理的最后一步 `segFillHoles` 是洪水填充，会把「被前景完全包住」的洞填满——用户在元素内部用套索/魔棒「从当前减去」抠掉的细节正好是这种洞，于是导出时又长回去了，看起来像「减去没生效」。现在 `segApply` 给结果图层打 `L.manual = true`，`segPolishMask` 见到 manual 就直接返回原始 `L.m`（不补缝、不填洞）。**别把这行删掉**，也别忘了 `segApply` 重建图层时要把 `manual` 带上。
- **键盘监听分「捕获」和「冒泡」两拨，别以为挂在 document 上就一定收得到**。`extras.js` / `board.js` / `svg.js` 都在 **document 捕获阶段** 吃空格（平移手势）和方向键，并且 `stopPropagation()`。所以弹层（比如元素预览面板）的键盘处理必须挂在 **window 的捕获阶段**，比 document 捕获更早，否则空格和方向键永远到不了冒泡监听器。判断「有没有被抢走」可以用 `e.defaultPrevented` 和 `.segStage` 的 cursor 当探针。
- **元素列表的卡片按钮要 `stopPropagation`**。卡片整块是「点一下勾选/取消」，放大预览按钮在 `scBox` 里，不拦住就会顺带把勾选状态翻一次。
- **自动生成的元素名要打标记才能跟随语言**。名字在创建时用 `t('elem')` 定死，切界面语言后就永远是旧语言的写法。做法是 `L.autoName = 序号`，切语言时重算；用户手动改过名字的要 `L.autoName = null`。
- `segAuto()` 里那行 `SEG.layers = []` 要改成**只清当前 tile 的**，否则批量导入时会把别的图的元素冲掉。
- 批量导入 + 拆分要串行（见上面的数据模型）。

### 发布 / GitHub

- **GitHub 账号现名 `lertone`**（旧名 `ijijv` 已改名）。网页路径会 301 重定向，但 **API 路径 `api.github.com/repos/ijijv/...` 直接 404**。所有代码/文档一律写 `lertone`。
- **Release 资产名不接受非 ASCII**，会被改成 `default.html`。H5 资产名固定用 `xiaoji-animation.html`。
- **electron-builder 一次构建多个架构会多产出一个「合一安装包」**（体积约三倍，文件名少一段架构后缀，例如 `PixPeel-Setup-1.0.5-win.exe`）。源码在 `app-builder-lib/out/targets/nsis/NsisTarget.js` 的 `finishBuild()`：`archs.size > 1` 时既建合一的也建分架构的。**在 `win.target` 里写 `"arch": ["x64"]` 没用**（同一个 target 实例仍会收到所有架构），只能**每个架构单独跑一次 electron-builder**（`dist:win` 已经改成了这样）。
- CI 里 Linux 固定 `ubuntu-24.04`：rpm 6 移除了 `xzmt` 压缩，electron-builder 25 打不出 rpm；rpm 步骤是 `continue-on-error: true`。
- **`windows-latest` runner 默认 shell 是 pwsh**。`ls -lh dist || true` 会失败（`Get-ChildItem` 不认 `-lh`，`true` 也不是 pwsh 命令）。跨平台步骤要么写 `shell: bash`，要么用平台无关写法。
- **`latest.yml` 是「谁最后构建谁说了算」**。Windows 三个架构是分三次跑 electron-builder 的，每次都会重写同一个 `latest.yml`——所以 `dist:win` 把 **x64 放在最后**，自动更新才指向 x64 安装包。同理，自动更新只在 Windows x64 / Linux AppImage x64 打开（见 `updater.js` 的 `supported()`），其它架构继续走下载页，别顺手放开。
- **加了 `publish` 配置后 electron-builder 会想自己发 Release**。所有 `dist:*` 脚本都带 `--publish never`，发布交给 workflow 里的 `softprops/action-gh-release`，否则会和它抢同一个 Release。
- **Release 资产里必须带上 `latest*.yml`**（`latest.yml` / `latest-mac.yml` / `latest-linux.yml`），少了自动更新就找不到新版本。CI 的 `upload-artifact` 已经把 `dist/latest*.yml` 收进去了。
- workflow 名叫 `Release` 时，main 分支 dispatch 失败会推「Release failed」通知——所以改成了 `Build & Release`。
- `gh release download` 必须在 git 仓库目录内执行，否则报 `not a git repository`。

### 本机 / PowerShell

- **PowerShell 把中文引号 “ ” 当字符串定界符**，`git commit -m` 带中文引号会被截断。提交信息写进文件再 `git commit -F 文件`。
- 用 `gh auth login --with-token` 时，PowerShell 直接管道传 token 会被搞坏报 401；必须 `Start-Process gh -ArgumentList 'auth','login','--hostname','github.com','--with-token' -RedirectStandardInput <file>`。
- `git credential fill` 传多行 stdin 同理，必须用 `Start-Process` + `-RedirectStandardInput`。
- Electron 桌面端 `desktopCapturer` 在 Windows 上**不包含任务栏**（实测底部抓到的是后面的窗口），是平台限制，别在这上面浪费时间。
- Windows 通知图标靠「开始菜单快捷方式 + AUMID」解析，electron-builder 只在全新安装时建快捷方式、更新安装不补建 → 必须在 `build/installer.nsh` 的 `customInstall` 里自己保证。

## 怎么验证改动（别只靠肉眼看代码）

渲染进程可以用 CDP 直接驱动，**这是验证交互逻辑的主要手段**：

```bash
# 启动开发版（端口随便挑，别和正式版冲突）
node_modules\electron\dist\electron.exe . --user-data-dir=<临时目录> --remote-debugging-port=9227

# 用 cdp.js 执行一段表达式（文件或内联都行），可带截图参数
node cdp.js test.js shot.png
```

`cdp.js` 支持 `CDP_PORT` 环境变量指定端口。`Runtime.evaluate` 用 `awaitPromise: true`，所以脚本里可以写 async 函数。

**写这类测试的坑**：
- 用 `dispatchEvent(new PointerEvent(...))` 模拟交互时，`e.target` 必须真的命中元素。**被 `innerHTML` 重画替换掉的旧节点是游离的，点它不会冒泡到父容器**——测试会「看起来没反应」，别误判成代码有 bug。
- 造假的图层数据时，源图得是真的，否则 `segCut` 会在 `drawImage` 上抛异常，把后面的断言全带崩。
- 判断「滚动有没有保持」要盯 `#segList`，不是 `.inspBody`。

发布后必须**在本机装一遍**再验证：静默安装 `Setup-x.y.z-win-x64.exe /S`，然后用 CDP 连正式版跑一遍关键流程（批量导入 + 跨图取色 + 边缘修补 + 检查更新），别只在开发版测。

## 发布流程（速查）

1. 改 `package.json` 的 `version`，在 `docs/CHANGELOG*.md` 写更新内容（**中英两份**）
2. 确认 `config.js` / `package.json` / README 里的仓库地址是 `lertone/PixPeel`
3. `git tag v1.0.x && git push origin v1.0.x` → CI 三平台打包并自动建 Release
4. 等 CI 全绿，核对 Release 资产数量（应该是 **19 个**：13 个安装包（Windows 3 + macOS 4 + Linux 6）+ `xiaoji-animation.html` + `SHA256SUMS.txt` + 4 份更新清单 `latest.yml` / `latest-mac.yml` / `latest-linux.yml` / `latest-linux-arm64.yml`）。Linux 会出两份清单（x64 与 arm64），别当成重复文件删掉。
5. 下载 Windows x64 安装包 → 校验 SHA256 → 静默安装 → CDP 验证
6. **删掉旧 Release 里多余的资产**（比如改过打包配置后），并同步修 `SHA256SUMS.txt`

改了 `editor/xiaoji-animation.html` 就直接覆盖提交，CI 会把它打进每个 Release。

## 项目管理约定

仓库已按下面这套方式组织，别另起一套：

- **标签**：GitHub 默认的 `bug` / `enhancement` / `documentation` 继续用；另加 `area: engine|ui|board-svg|packaging|docs|ai` 标模块，`priority: high|normal` 标紧急度，`needs-decision` 标「必须作者拍板」。
- **里程碑**：一个版本一个（`v1.0.6`、`v1.0.7`…）。不确定塞哪个版本的先不挂里程碑，留在 backlog。
- **Issue 模板**：`.github/ISSUE_TEMPLATE/` 下是 bug / feature 两个表单，改字段时注意 `id` 别和已有重复。
- **发版跟踪**：每个版本开一个「vX.Y.Z 发布跟踪」issue，把 `发布流程（速查）` 的步骤当 checklist 勾，发完关掉。别把 checklist 只留在本地。
- **决策类不自己拍**：收费、签名证书、自动更新这类要花钱或改变隐私边界的，先开 `needs-decision` issue 写清方案与成本，等作者回。

每次接手先跑一遍巡检：

```bash
gh run list --repo lertone/PixPeel --limit 5          # CI 是否绿
gh release view --repo lertone/PixPeel --json assets  # 资产数量对不对
gh issue list --repo lertone/PixPeel --state open      # 有没有该关没关的
```

代码/文档里出现 `ijijv` 一律视为 bug（见下面「踩过的坑」）。

## 遗留事项

- 用户需要手动清理本机上他桌面上的旧快捷方式和旧开发目录（他已自行处理过一次）
- 画板多选、SVG 画布框选都已实现并验证过（框选 → 批量删除 / 缩放 / 旋转）
- Wayland 能力矩阵只写了文档，**没有真机验证**（#4）：拿到 Linux 机器后按 README 那张表逐项过一遍
- 安装包仍未签名（#3），Windows SmartScreen / macOS「已损坏」提示还在；签名要花钱，等作者拍板
