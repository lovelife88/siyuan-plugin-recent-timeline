# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.4] - 2024-06-11

### Added

- 🔄 实时自动刷新：通过监听思源 WebSocket 事件，文档变更后自动刷新时间线（2 秒防抖）
- Real-time auto-refresh via SiYuan WebSocket events (debounced at 2s)

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

[0.2.0]: https://github.com/lovelife88/siyuan-plugin-recent-timeline/releases/tag/0.2.0
[0.1.0]: https://github.com/lovelife88/siyuan-plugin-recent-timeline/releases/tag/0.1.0
