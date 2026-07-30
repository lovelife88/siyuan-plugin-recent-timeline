import { Plugin } from "siyuan";
import "./index.scss";
import { TimelinePanel, DEFAULT_SETTINGS, DEFAULT_STYLE_SETTINGS, PluginSettings } from "./timeline";

const DOCK_TYPE = "recent-timeline-dock";
const STORAGE_KEY = "recent-timeline-settings";

export default class RecentTimelinePlugin extends Plugin {
  private timelinePanel: TimelinePanel | null = null;
  private settings: PluginSettings = { ...DEFAULT_SETTINGS, style: { ...DEFAULT_STYLE_SETTINGS } };
  private wsDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingRootIds: Set<string> = new Set(); // 防抖窗口内累积待刷新的文档 root id

  // 提取为具名方法，保证 on/off 引用一致，避免热重载时监听器叠加
  private onWsMain = (event: any) => {
    const cmd = event?.detail?.cmd;
    if (!cmd) return;

    // 解析本次事件涉及的文档 root id 集合
    let rootIds: string[] = [];
    if (cmd === "savedoc") {
      const id = event?.detail?.data?.id;
      if (id) rootIds.push(id);
    } else if (cmd === "transactions") {
      rootIds = this.extractRootIdsFromTx(event?.detail?.data);
    } else {
      return;
    }

    if (rootIds.length === 0) return;

    const delayMs = this.settings.refreshDelay * 1000;
    if (delayMs <= 0) return; // 设为 0 时关闭自动刷新

    // 累积到防抖窗口，避免一次编辑触发多次刷新
    rootIds.forEach((r) => this.pendingRootIds.add(r));
    if (this.wsDebounceTimer) clearTimeout(this.wsDebounceTimer);
    this.wsDebounceTimer = setTimeout(() => {
      const ids = Array.from(this.pendingRootIds);
      this.pendingRootIds.clear();
      if (this.timelinePanel) {
        // 局部刷新对应文档卡片，而非重建整个列表
        this.timelinePanel.refreshDocs(ids);
      }
    }, delayMs);
  };

  /**
   * 从 transactions ws 事件中提取被修改文档的 root id 集合。
   * 思源内核推送结构：data.data[].transactions[].doOperations[].{data.root_id | data.id | id}
   */
  private extractRootIdsFromTx(data: any): string[] {
    const ids = new Set<string>();
    const batches = data?.data;
    if (!Array.isArray(batches)) return [];
    for (const batch of batches) {
      const txs = batch?.transactions;
      if (!Array.isArray(txs)) continue;
      for (const tx of txs) {
        const ops = tx?.doOperations;
        if (!Array.isArray(ops)) continue;
        for (const op of ops) {
          const root = op?.data?.root_id || op?.data?.id || op?.id;
          if (root) ids.add(root);
        }
      }
    }
    return Array.from(ids);
  }

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
    this.eventBus.on("ws-main", this.onWsMain);
  }

  onunload() {
    // 配对 off，避免热重载后监听器叠加导致重复刷新
    this.eventBus.off("ws-main", this.onWsMain);
    if (this.wsDebounceTimer) clearTimeout(this.wsDebounceTimer);
    this.pendingRootIds.clear();
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
