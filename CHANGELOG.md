# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.2.0]: https://github.com/lovelife88/siyuan-plugin-recent-timeline/releases/tag/v1.2.0
[1.1.1]: https://github.com/lovelife88/siyuan-plugin-recent-timeline/releases/tag/v1.1.1
[1.1.0]: https://github.com/lovelife88/siyuan-plugin-recent-timeline/releases/tag/v1.1.0
[1.0.4]: https://github.com/lovelife88/siyuan-plugin-recent-timeline/releases/tag/v1.0.4
[0.1.0]: https://github.com/lovelife88/siyuan-plugin-recent-timeline/releases/tag/0.1.0
