import { Plugin } from "siyuan";
import "./index.scss";
import { TimelinePanel, DEFAULT_SETTINGS, DEFAULT_STYLE_SETTINGS, PluginSettings } from "./timeline";

const DOCK_TYPE = "recent-timeline-dock";
const STORAGE_KEY = "recent-timeline-settings";

export default class RecentTimelinePlugin extends Plugin {
  private timelinePanel: TimelinePanel | null = null;
  private settings: PluginSettings = { ...DEFAULT_SETTINGS, style: { ...DEFAULT_STYLE_SETTINGS } };

  async onload() {
    // 加载设置
    await this.loadSettings();

    // 注册自定义 SVG 图标
    this.addIcons(`
      <symbol id="iconRecentTimeline" viewBox="0 0 24 24">
        <path fill="currentColor" d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/>
      </symbol>
    `);

    // 注册 Dock 面板
    this.addDock({
      config: {
        position: "RightBottom" as const,
        size: { width: 320, height: 0 },
        icon: "iconRecentTimeline",
        title: this.i18n.title,
      },
      data: {},
      type: DOCK_TYPE,
      init: (dock: any) => {
        this.timelinePanel = new TimelinePanel(dock.element, this, this.settings);
        this.timelinePanel.init();
      },
      destroy: () => {
        if (this.timelinePanel) {
          this.timelinePanel.destroy();
          this.timelinePanel = null;
        }
      },
    });
  }

  onLayoutReady() {
    if (this.timelinePanel) {
      this.timelinePanel.loadData();
    }

    // WebSocket 事件监听：savedoc / transactions 时自动刷新
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    this.eventBus.on("ws-main", (event: any) => {
      const cmd = event?.detail?.cmd;
      if (!cmd) return;

      if (cmd === "savedoc" || cmd === "transactions") {
        const delayMs = this.settings.refreshDelay * 1000;
        if (delayMs <= 0) return; // 设为 0 时关闭自动刷新

        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          if (this.timelinePanel) {
            this.timelinePanel.loadData();
          }
        }, delayMs);
      }
    });
  }

  onunload() {
    if (this.timelinePanel) {
      this.timelinePanel.destroy();
      this.timelinePanel = null;
    }
  }

  /** 供 TimelinePanel 调用，保存设置到存储 */
  saveTimelineSettings(settings: PluginSettings) {
    this.settings = { ...settings, style: { ...settings.style } };
    this.persistSettings();
  }

  private async loadSettings() {
    try {
      const data = await this.loadData(STORAGE_KEY);
      if (data && typeof data === "object") {
        this.settings = { 
          ...DEFAULT_SETTINGS, 
          ...(data as Partial<PluginSettings>),
          style: { ...DEFAULT_STYLE_SETTINGS, ...(data as any).style },
        };
      }
    } catch (e) {
      console.warn("[Timeline] Failed to load settings, using defaults:", e);
    }
  }

  private async persistSettings() {
    try {
      await this.saveData(STORAGE_KEY, this.settings);
    } catch (e) {
      console.warn("[Timeline] Failed to save settings:", e);
    }
  }
}
