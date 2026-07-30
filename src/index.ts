import { Plugin } from "siyuan";
import "./index.scss";
import { getRootIdsByBlockIds } from "./api";
import { TimelinePanel, DEFAULT_SETTINGS, DEFAULT_STYLE_SETTINGS, PluginSettings } from "./timeline";

const DOCK_TYPE = "recent-timeline-dock";
const STORAGE_KEY = "recent-timeline-settings";

export default class RecentTimelinePlugin extends Plugin {
  private timelinePanel: TimelinePanel | null = null;
  private settings: PluginSettings = { ...DEFAULT_SETTINGS, style: { ...DEFAULT_STYLE_SETTINGS } };
  private wsDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingRootIds: Set<string> = new Set(); // 防抖窗口内累积待刷新的文档 root id（来自 savedoc 或已解析）
  private pendingBlockIds: Set<string> = new Set(); // 防抖窗口内累积事务涉及的块 id（来自 transactions，flush 时解析为 root_id）

  // 提取为具名方法，保证 on/off 引用一致，避免热重载时监听器叠加
  private onWsMain = (event: any) => {
    const cmd = event?.detail?.cmd;
    if (!cmd) return;
    console.log("[Timeline][ws-main] cmd =", cmd, "| refreshDelay(s) =", this.settings.refreshDelay);

    const delayMs = this.settings.refreshDelay * 1000;
    if (delayMs <= 0) return; // 设为 0 时关闭自动刷新

    if (cmd === "savedoc") {
      // savedoc 事件的 detail.data.id 即为文档 root_id
      const id = event?.detail?.data?.id;
      if (id) this.pendingRootIds.add(id);
    } else if (cmd === "transactions") {
      // transactions 的 doOperation 通常不含 root_id（纯文本编辑只有块 id），
      // 先收集块 id，flush 时再批量解析为所属文档的 root_id
      this.collectBlockIdsFromTx(event?.detail?.data).forEach((b) => this.pendingBlockIds.add(b));
    } else {
      return;
    }

    if (this.wsDebounceTimer) clearTimeout(this.wsDebounceTimer);
    this.wsDebounceTimer = setTimeout(async () => {
      const rootIds = new Set<string>(this.pendingRootIds);
      this.pendingRootIds.clear();
      const blockIds = Array.from(this.pendingBlockIds);
      this.pendingBlockIds.clear();
      if (blockIds.length > 0) {
        try {
          const roots = await getRootIdsByBlockIds(blockIds);
          roots.forEach((r) => rootIds.add(r));
        } catch (err) {
          console.warn("[Timeline] 解析块 id 为 root_id 失败", err);
        }
      }
      const ids = Array.from(rootIds);
      console.log("[Timeline] flush -> blockIds:", blockIds.length, "resolved rootIds:", ids.length, ids.slice(0, 8));
      if (ids.length > 0 && this.timelinePanel) {
        // 局部刷新对应文档卡片，而非重建整个列表
        this.timelinePanel.refreshDocs(ids);
      }
    }, delayMs);
  };

  /**
   * 从 transactions ws 事件中提取被修改的块 id 集合。
   * 思源内核推送结构：data.data[].transactions[].doOperations[].id（块 id）。
   * 注意：doOperation 通常不直接含 root_id（纯文本编辑的 update 操作只有块 id），
   * 因此先收集块 id，flush 时再批量解析为所属文档的 root_id。
   */
  private collectBlockIdsFromTx(data: any): string[] {
    const ids = new Set<string>();
    // 递归遍历任意嵌套结构，收集所有 doOperation 的块 id 与 root_id。
    // 思源 transactions 推送结构随版本/操作类型变化（data.data[].transactions[].doOperations[]
    // 或 data.transactions[] 或含 doOperations 的其它节点），递归遍历可稳健覆盖。
    const walk = (node: any, depth: number): void => {
      if (node == null || depth > 10) return;
      if (Array.isArray(node)) {
        for (const n of node) walk(n, depth + 1);
        return;
      }
      if (typeof node !== "object") return;
      if (Array.isArray(node.doOperations)) {
        for (const op of node.doOperations) {
          const bid = op?.id || op?.data?.id;
          if (bid) ids.add(bid);
          if (op?.data?.root_id) ids.add(op.data.root_id);
          if (op?.root_id) ids.add(op.root_id);
        }
      }
      if (Array.isArray(node.transactions)) {
        for (const tx of node.transactions) walk(tx, depth + 1);
      }
      for (const key of Object.keys(node)) {
        if (key === "doOperations" || key === "transactions") continue;
        walk((node as any)[key], depth + 1);
      }
    };
    walk(data, 0);
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
    this.pendingBlockIds.clear();
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
