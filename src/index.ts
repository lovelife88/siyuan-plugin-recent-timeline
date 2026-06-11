import { Plugin } from "siyuan";
import "./index.scss";
import { TimelinePanel, DEFAULT_SETTINGS, DEFAULT_STYLE_SETTINGS, PluginSettings } from "./timeline";

const DOCK_TYPE = "recent-timeline-dock";
const STORAGE_KEY = "recent-timeline-settings";

export default class RecentTimelinePlugin extends Plugin {
  private timelinePanel: TimelinePanel | null = null;
  private settings: PluginSettings = { ...DEFAULT_SETTINGS, style: { ...DEFAULT_STYLE_SETTINGS } };
  private wsHandlerBound: ((event: any) => void) | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;

  async onload() {
    // 加载设置
    await this.loadSettings();

    // 注册自定义 SVG 图标
    this.addIcons(`
      <symbol id="iconRecentTimeline" viewBox="0 0 24 24">
        <path fill="currentColor" d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/>
      </symbol>
    `);

    // 添加顶栏图标
    this.addTopBar({
      icon: "iconRecentTimeline",
      title: this.i18n.title,
      position: "right",
      callback: () => {
        const dock = (this as any).docks[DOCK_TYPE];
        if (dock) {
          dock.toggle();
        }
      },
    });

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

    // 监听 WebSocket 事件，实现实时自动刷新
    this.wsHandlerBound = this.onWebSocketEvent.bind(this);
    this.eventBus.on("ws-main", this.wsHandlerBound);
  }

  onLayoutReady() {
    if (this.timelinePanel) {
      this.timelinePanel.loadData();
    }
  }

  onunload() {
    // 注销 WebSocket 监听
    if (this.wsHandlerBound) {
      this.eventBus.off("ws-main", this.wsHandlerBound);
      this.wsHandlerBound = null;
    }
    // 清除待执行的刷新
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    if (this.timelinePanel) {
      this.timelinePanel.destroy();
      this.timelinePanel = null;
    }
  }

  /**
   * WebSocket 事件处理器 — 监听文档编辑/保存等事件，自动刷新时间线
   * 使用防抖避免高频刷新（连续编辑时仅在停止后 2 秒刷新一次）
   */
  private onWebSocketEvent(event: CustomEvent) {
    const detail = event.detail;
    if (!detail || !detail.cmd) return;

    // 关注与文档内容变更相关的事件类型
    const relevantCmds = [
      "saved",         // 文档保存
      "updated",       // 块内容更新
      "removed",       // 块删除
      "moved",         // 块移动
      "transaction",   // 事务操作（增删改块）
    ];
    // 兜底：只要 cmd 以操作后缀结尾也触发（兼容不同版本）
    const isRelevant = relevantCmds.includes(detail.cmd)
      || detail.cmd.endsWith("Transaction")
      || detail.cmd.endsWith("tx");

    if (!isRelevant) return;

    // 防抖：连续编辑时只刷新一次
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      if (this.timelinePanel) {
        this.timelinePanel.loadData();
      }
    }, 2000);
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
