# Recent Timeline

A SiYuan Note plugin that displays recently updated documents in a timeline view, with quick navigation and customizable appearance.

## Features

### Timeline Display
- 📋 **Timeline View**: Documents grouped by date in a vertical timeline
- 🔄 **Infinite Scroll**: Auto-loads more history when scrolling to the bottom
- 👆 **Jump to Block**: Click any document title or updated content to jump directly to the corresponding block
- 📍 **Path Display**: Shows the notebook name and full document hierarchy
- ⏱ **Friendly Time**: Relative timestamps (e.g., "3 hours ago")
- 🎨 **Dock Panel**: Top bar icon + right-side dock for easy access
- 🌓 **Theme Adaptive**: Automatically follows SiYuan's light/dark themes
- 🔄 **Auto Refresh**: Real-time refresh via WebSocket (debounced 2s)

### Settings — "General" Tab
- 🔀 **Content Sort Order**: Choose between "By Update Time" or "By Document Order"
- 🚫 **Ignore Content**: Configure text to exclude from cards (one rule per line)
- ✂️ **Content Truncation**: Limit visible lines per content item; hover to see full content
- 🚀 **Jump Method**:
  - **openTab (Fast Jump)**: Millisecond-level, supports zoom-in control
  - **SiYuan Link (System Jump)**: Uses `siyuan://` protocol, behaves like native block references
- 🔍 **Zoom In** (openTab only): Focus on the target block when jumping; off = full document view

### Settings — "Style" Tab
Visual style configuration for all major UI elements with **live preview**.

| Group | Configurable Properties | Controls |
|-------|------------------------|----------|
| **Card Title** | Font size, weight, color, line height, bar width, bar color | Slider, dropdown, color picker |
| **Card Content** | Font size, color, line height | Slider, color picker |
| **Date & Time** | Date font size/color, time font size/color | Slider, color picker |
| **Timeline Axis** | Dot size, line width | Slider |
| **Card** | Border radius, padding | Slider |
| **Path Info** | Font size, color | Slider, color picker |

#### Style Import / Export
- 📤 **Export**: Click "Export" to copy the current style config as JSON to your clipboard
- 📥 **Import**: Click "Import", paste a JSON style config, and apply in one click

All color options support a "Follow Theme" mode — colors automatically adapt when you switch SiYuan themes.

## Installation

### Production
Copy the contents of `dist/` to `<workspace>/data/plugins/recent-timeline/`, then enable it in SiYuan Settings → Marketplace → Downloaded.

Or extract the `dist.zip` from the latest Release directly.

### Development
```bash
# Install dependencies
pnpm install

# Watch mode
pnpm run dev

# Create symlink in your SiYuan workspace
# Windows: mklink /D "<workspace>/data/plugins/recent-timeline" "<project>/dist"
# macOS/Linux: ln -s "<project>/dist" "<workspace>/data/plugins/recent-timeline"
```

### Build
```bash
pnpm run build
```

## Project Structure

```
siyuan-plugin-recent-timeline/
├── src/
│   ├── index.ts        # Plugin entry, extends Plugin class
│   ├── api.ts          # SiYuan kernel API wrapper (SQL, content fetch)
│   ├── timeline.ts     # Timeline panel component (core logic + settings UI)
│   ├── index.scss      # All styles (CSS variable driven)
│   └── i18n/           # Internationalization
│       ├── zh_CN.json
│       └── en_US.json
├── dist/               # Build output
├── plugin.json         # Plugin manifest
├── package.json
├── webpack.config.cjs
├── tsconfig.json
├── README.md
└── README_zh_CN.md
```

## Technical Notes

### Architecture
- **Entry** (`index.ts`): Registers dock panel, loads/saves plugin settings
- **Panel** (`timeline.ts`): Renders timeline list, handles interactions, manages settings dialog
- **API** (`api.ts`): SiYuan kernel API queries, content fetching, Markdown rendering

### Jump Methods
- **openTab**: Uses the `openTab` plugin API — millisecond speed, supports `zoomIn` focus control
- **SiYuan Link**: Uses `window.open('siyuan://blocks/${id}')` — native protocol behavior, same as SiYuan block references

### Style System
- All component styles are driven by CSS custom properties (`--tl-*`)
- Defaults reference SiYuan theme variables (`--b3-theme-*`), automatically adapting to light/dark themes
- Style changes in the settings panel update CSS variables in real time without reload

### Internationalization
Supports Chinese (`zh_CN`) and English (`en_US`), managed via JSON files in `src/i18n/`.
