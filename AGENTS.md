# AGENTS.md —— 给接手这个项目的 AI 看

> 面向：接手的 AI 维护者。
> 读法：先看「1 分钟速览」和「踩过的坑」，再看需要改的那部分。
> 发布细节看 [docs/RELEASING.md](docs/RELEASING.md)，改动 H5 前先看 [docs/LINK-PROTOCOL.md](docs/LINK-PROTOCOL.md)。

## 1 分钟速览

PixPeel 是一个 **Electron 桌面应用**：截图或导入图片 → 自动拆出其中的元素 → 存成透明底 PNG 贴纸。
配套还有一个单文件网页版动画编辑器「小剪动画」（`editor/xiaoji-animation.html`），双击即用，和桌面版通过本机 HTTP 服务联动。

- 仓库：`https://github.com/lertone/PixPeel`（公开，main 分支）
- 许可：**PolyForm Noncommercial License 1.0.0（非商用）**，1.0.8 起生效；1.0.7 及更早是按 MIT 发布的，那些版本仍按 MIT 提供（不可追溯）。改协议要同时改 `LICENSE`、`package.json` 的 `license`、`build/license*.rtf`（安装向导协议页，用 `node build/gen-license-rtf.js` 从 LICENSE 重新生成）、README 中英两份
- 仓库地址写在 `config.js` 的 `repo` 字段里，**「检查更新」功能靠它**，改了 GitHub 用户名必须同步改这里
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
  board.js       画板（位图拼图）
  svg.js         SVG 库 + SVG 画布（矢量分层编辑）
  extras.js      设置页、高清修复、AI 模型面板等
  i18n.js        中英文案
  index.html     唯一页面；logo 是内联 SVG
  style.css
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
**改 `edgeGap` 后必须 `SEG.layers.forEach(L => L.mp = null)`**，否则蒙版缓存不失效，改了没反应。

补缝宽度和「把两个挨得很近的元素连成一个」在几何上是同一件事，无法两全——所以宽度做成可调，让用户取舍。

### AI 点选（SlimSAM）

`renderer/engine.js` 里用一个 Web Worker 跑 transformers.js，模型从 HuggingFace 下载，国内自动走 hf-mirror 镜像。
两种权重：量化版 `q8`（默认，15–40MB）和浮点版 `fp32`（40–100MB）。**浮点版在内存不够的机器上会加载失败**——已经加了自动降级（`aiFallbackToQ8()`：失败就换回量化版重试一次，只降一次）。模型状态记在 localStorage 的 `pp_ai_q8` / `pp_ai_fp32`。

### 背景层（「剩下的部分也存成一层」）

`buildOut()` 里对**每张有选中元素的图**各算一份背景层（v1.0.6 起）。之前只算当前那张，
批量导入时其它图的剩余像素被静默丢弃。批量时文件名是 `背景 - <原图名>.png`，
否则几张「背景」会退化成 `背景.png` / `背景_2.png`。

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
