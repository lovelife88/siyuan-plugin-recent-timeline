# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.3] - 2026-07-31

### Fixed

- 修复编辑非「今天」文档后时间线卡片内容不更新（表现为「刷新了但内容没变 / 像没刷新」）：局部刷新 `refreshDocs` 中已列表文档改用今天日期区间（`nowStr`）查询最新编辑内容，之前误用文档全量加载时的旧 `updated` 日期导致在旧日期区间查不到新编辑内容。
- 移除调试期诊断日志（`ws-main` 事件与 flush 的 `console.log`）。

### Added

- 局部刷新增强：编辑文档后该卡片置顶到「今天」组；不在当前已加载列表内的老文档作为新卡片插入顶部。卡片间排序由文档 `updated` 决定，卡片内更新内容排序仍由 `contentSortOrder` 决定。
- 自动刷新触发加固：`transactions` 事件改为收集涉及的块 id，flush 时批量查 `blocks` 表解析为所属文档 `root_id`，确保纯文本编辑也能稳定触发局部刷新。

## [1.4.2] - 2026-07-29

### Changed

- 文档更新后仅局部刷新对应卡片（不再重建整个时间线列表），减少闪烁与性能开销；由 `ws-main` 的 `savedoc` / `transactions` 事件经防抖后触发。

## [1.4.0] - 2026-07-28

### Added

- 移动端适配：plugin.json 声明支持移动端（frontends 增加 `mobile`，backends 增加 `android`/`ios`），插件可在手机 App 中加载与使用。
- 移动端响应式布局：设置面板在窄屏下接近全屏（92vw），卡片标题与内容字号放大、左侧时间列收窄、头部操作按钮放大，提升触摸阅读与点按体验；文档跳转已按前端类型自动切换（移动端走 `siyuan://` 协议）。

## [1.3.1] - 2026-07-28

### Fixed

- 修复折叠模式下初始卡片数量少、面板高度不足导致无法滚动触底加载更多（"下拉刷新"）的问题：新增「自动填充式加载」，当已渲染内容高度不足以撑满滚动容器时自动续拉下一页，直到内容撑满视口或已无更多数据。

## [1.3.0] - 2026-07-28

### Added

- 空行过滤：自动跳过空行与纯空白内容，时间线不再展示空白更新条目。
- 隐藏无内容的文档：新增设置项「隐藏无内容的文档」，可隐藏新建且没有任何内容更新的文档卡片，仅保留有更新内容的卡片。
- 文档卡片内容折叠：新增设置项「卡片内容折叠」，支持三种模式：
  - 不折叠（显示全部）
  - 不显示（仅显示文档卡片，隐藏全部内容更新）
  - 折叠超出部分（设置显示条目数，超出部分折叠，点击「展开 N 条」后显示）

## [1.2.0] - 2026-07-28

### Added

- 完善「按文档顺序排序」：基于 `/api/block/getBlockDOM` 解析文档内 `[data-node-id]` 的真实渲染顺序构建顺序映射，精确还原文档中块的顺序（替换为原先失效的 `display_sort` 排序）。

## [1.1.1] - 2025-07-27

### Changed

- 更新插件图标（icon.png）与预览图（preview.png）。

## [1.1.0] - 2025-07-25

### Added

- 平滑刷新动画（卡片淡入/位移过渡）。
- 可配置刷新延迟（设置项，避免频繁刷新抖动）。

### Fixed

- 修复 eventBus 监听器泄漏（请求与 WebSocket 监听配对注销）。
- 修复加载竞态（请求序号互斥，丢弃过期响应）。
- 加固 i18n 取值、XSS 净化与查询安全。

## [1.0.4] - 2025-07-11

### Fixed

- 移除 `plugin.json` 中多余的 `i18n` 字段，通过思源集市检查。

## [0.1.0] - 2024-06-09

### Added

- Timeline display of recently updated documents
- Scroll to auto-load more (IntersectionObserver)
- Click title/content to jump to the corresponding block
- Show notebook path and friendly time (e.g. "3 hours ago")
- Top bar icon + right side Dock panel
- Auto-adapt to light/dark themes
- Two jump methods: Open Tab (fast, supports zoom-in focus) / SiYuan Link (via OS protocol)
- Style customization: font size, color, line height, border radius, etc.
- Style import/export (JSON)
- Content sort order (by update time / by document order)
- Ignore content filtering
- Content truncation with hover-to-expand
- Settings panel with Function and Style tabs

### Changed

- Migrated from uni-app widget version to SiYuan plugin

[1.4.3]: https://github.com/lovelife88/siyuan-plugin-recent-timeline/releases/tag/v1.4.3
[1.4.2]: https://github.com/lovelife88/siyuan-plugin-recent-timeline/releases/tag/v1.4.2
[1.4.0]: https://github.com/lovelife88/siyuan-plugin-recent-timeline/releases/tag/v1.4.0
[1.2.0]: https://github.com/lovelife88/siyuan-plugin-recent-timeline/releases/tag/v1.2.0
[1.1.1]: https://github.com/lovelife88/siyuan-plugin-recent-timeline/releases/tag/v1.1.1
[1.1.0]: https://github.com/lovelife88/siyuan-plugin-recent-timeline/releases/tag/v1.1.0
[1.0.4]: https://github.com/lovelife88/siyuan-plugin-recent-timeline/releases/tag/v1.0.4
[0.1.0]: https://github.com/lovelife88/siyuan-plugin-recent-timeline/releases/tag/0.1.0
