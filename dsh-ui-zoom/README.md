# 界面缩放（@local/dsh-ui-zoom）

给 DeepSeek Harness 的 Web UI 补上「界面缩放」的能力。Harness 自带的设置只有**字号**（`ui-theme` 的 `fontSize` / `codeFontSize` / `terminalFontSize`），它只影响会话正文、代码与终端，不会缩放侧栏、按钮和页面布局。本插件在 **设置 → 通用** 里新增一行「界面缩放」，按百分比缩放应用主界面与网页下拉菜单。

## 缩放等级

`50% · 60% · 70% · 80% · 90% · 100% · 110% · 125% · 150% · 200% · 400%`

- 左右 `−` / `+` 按钮在等级表里逐级切换；
- 点击中间的百分比打开下拉列表，可直接选任一等级（支持方向键与 Esc）；
- 非 100% 时出现「重置」按钮；
- 选择存在浏览器本地（`localStorage` 的 `dsh-ui-zoom`），重启后保留；同一 profile 的另一个窗口改动会即时同步。

## 实现方式

- **Host 半**（`index.js`）：每次 index 响应都注入首帧脚本，脚本**优先读取 `localStorage` 中的浏览器选择**，读不到才回退到 `cordis.patch.yml` 的默认 `zoom`，因此刷新时不会先闪一下 100%。它刻意不 import 任何模块：profile 安装的 bundle 从 profile 自己的 `node_modules` 解析依赖，那里没有 Host 的 `@deepseek-ai/*` 包。
- **Client 半**（`client.js`）：注册 `settings.general.item` 行（`order: 12`，紧跟字号行），用 `#root` 的 CSS `zoom` 应用缩放，启动时把「已存值 / 首帧默认值」解析结果同步写入文档，再把选择写入 `localStorage`。

选择 `#root` 而不是 `<body>`：菜单与弹窗由 React 门户挂到 `document.body`，并用 `getBoundingClientRect()` + `offsetHeight` 计算视口坐标。若缩放 `<body>`，这些内联 `top/left` 会被 `zoom` **二次缩放**——125% 时左下角账号菜单的 `top` 从 721px 变成 901px，正好落到 905px 视口之外，表现为“点了没反应”。缩放 `#root` 后，门户按 100% 坐标定位，位置正确；随后 `installOverlayZoom` 对 `role="menu"` / `role="listbox"` 的门户单独应用同一 `zoom`，按最后一次 `pointerdown` 的触发元素重算 `top/left`（先算视觉坐标，再除以 zoom 写回），使其既随界面放大又不会跑出视口。原生菜单栏不在此列（见已知限制）。

## 与字号设置的关系

两者互不覆盖：字号改的是 `--dsh-content-font-size` 等文本变量，缩放改的是主界面显示比例。例如字号 17px + 缩放 125%，正文看起来约等于 21px，同时侧栏、图标、间距也一起变大。

## 快捷键与滚轮

| 操作 | 行为 |
|---|---|
| `Ctrl` / `Cmd` + `=` 或 `+` | 放大一级 |
| `Ctrl` / `Cmd` + `-` | 缩小一级 |
| `Ctrl` / `Cmd` + `0` | 重置为 100% |
| `Ctrl` + 滚轮向上 / 向下 | 放大 / 缩小（触控板捏合同样生效） |

**关于覆盖官方字号快捷键**：Harness 桌面端的 `Ctrl +/-` 原本由 `@deepseek-ai/dsh-client-ui-theme` 注册为「字号增大/减小」。本插件在 `window` 的**捕获阶段**监听 `keydown`，命中组合键后调用 `preventDefault()` + `stopImmediatePropagation()`，因此官方插件在冒泡阶段的处理器（它会跳过 `defaultPrevented` 事件）完全收不到该按键，字号保持不变。这是纯事件层覆盖，不修改、不禁用官方插件，也不依赖其内部字段。

滚轮采用 40px 累计阈值 + 90ms 冷却，避免一次滚动跨越多个等级；`Ctrl+滚轮` 的默认浏览器缩放会被 `preventDefault()` 阻止，不会与 CSS 缩放叠加。

## 已知限制

- **原生菜单栏无法缩放**：左上角「应用 / 编辑」及其下拉菜单由 Electron/Windows 原生绘制，DOM 中不存在对应元素，CSS 与页面脚本都改不了它；任何页面内缩放（包括浏览器自身缩放）都不会改变原生菜单。这是本插件无法覆盖的部分之一。
- **设置弹窗、确认框保持 100% 尺寸**：它们居中且尺寸固定（设置弹窗 800×800），125% 时会变成 1000×1000 超出 905px 视口，缩放会直接裁切内容。
- **右侧边栏的固定头部在非 100% 时可能错位**：其工具栏使用固定定位，`zoom` 会把它的包含块宽度放大到 1.25 倍，导致右侧图标被推到视口外（实测 125% 时 x≈2093）。收起右侧边栏时不受影响；这是 CSS `zoom` 对 fixed 布局的固有行为，无法在不改动应用布局的前提下修复。
- 缩放基于 CSS `zoom`（Chromium 合成）；侧栏终端（xterm）这类 canvas 控件在非整数倍率下可能有轻微重采样。
- 选择是**每浏览器**的（`localStorage`），不写入 Host 设置文档，因此不会跨浏览器/设备同步；这与浏览器自身的页面缩放行为一致。
- 若同时安装会重绘「通用」分区的第三方设置页（如 `@michengai/dsh-codex-ui`），本行会按其分组规则归入「常规」分组显示。
- 「快捷键」参考面板仍会显示官方的「字号增大/减小 Ctrl+=/-」条目：本插件刻意不注册同键位的 fixed 命令，避免参考列表出现两条冲突项；实际行为以本插件为准。

## 目录

```
dsh-ui-zoom/
├── package.json        # bundle + dsh.client 清单
├── cordis.patch.yml    # 插入 ui-zoom 行（config.zoom 为 profile 默认值）
├── index.js            # Host 半：首帧脚本
├── client.js           # Client 半：设置行、缩放运行时
├── locale/{zh,en}.json # 插件管理器的标题/描述
├── icon.svg            # 插件图标
├── test/               # 离线校验脚本
└── README.md
```

## 安装 / 卸载

本包位于仓库的 `dsh-ui-zoom/` 目录。完整安装步骤（桌面端手动登记、Web profile CLI、验证方式）见仓库根目录的 [README](../README.md#安装)。

卸载：从 `dsh.profile.bundles` 移除包名、删除 `node_modules/@local/dsh-ui-zoom`，重启后设置行消失；`localStorage` 里遗留的值会被忽略，重新安装后继续生效。

## 测试

`test/` 提供两套离线校验（不启动 Harness）：

- `node test/simulate.mjs`：用桩 `window`/`document`/React 跑 Client 半的运行时与行渲染（等级切换、持久化、跨窗口同步、卸载清理）。
- `node test/hosttest.mjs`：跑 Host 半的默认值钳制与首帧脚本生成。

## 验证记录（2026-10-20）

在真实 dsh 0.2.1-rc.2 Web 宿主上用无头 Chrome 加载实际界面（profile 副本，`node_modules` 指向真实 profile）：

- 启动图包含 `@local/dsh-ui-zoom/client.js`，插件样式标签注入成功，控制台无错误；
- 设置 → 通用 渲染出「界面缩放」行，下拉列出 11 个等级且未被窗口裁剪；
- 选择 150% 后 `#root.style.zoom = 1.5`、`localStorage = 150`，刷新后仍为 1.5；
- 「重置」后清除 `#root` 的 `zoom`、`localStorage = 100`、标签回到 100%；
- `Ctrl+=` → 110% → 125%，`Ctrl+-` → 110%，`Ctrl+滚轮上/下` → 125% / 110%，`Ctrl+0` → 100%；全程 `--dsh-content-font-size` 保持 17px 不变，证明官方字号快捷键被完全覆盖；
- 50% / 100% / 125% / 150% 四档下，真实点击左下角账号按钮均能弹出菜单且完整位于视口内（125% 时菜单 `top=721`，视口高 905）；125% 下设置弹窗 800×800 完整可见；
- 125% 下账号菜单随界面放大到 180×138（`zoom=1.25`）并重定位到 `top=695`，工作区菜单 180×104、完整可见；原生菜单栏「应用/编辑」在 DOM 中无节点，确认不可缩放。

截图见仓库 `docs/settings.png`、`docs/menu.png`。
