import { Plugin, openTab, getFrontend } from "siyuan";
import {
  getNotebooks,
  getRecentDocs,
  fillDocUpdatedContents,
  getDocUpdatedContents,
  getDocById,
  friendlyDate,
  parseSiyuanDate,
  getColor,
  TimelineItem,
  ContentItem,
  BlockData,
  ContentSortOrder,
  clearDocOrderCache,
} from "./api";

const PAGE_SIZE = 15;

export type JumpMethod = "openTab" | "siyuanLink";

// 文档卡片内容折叠模式：off=不折叠; hide=隐藏全部内容(仅显示卡片); fold=超出条目数折叠
export type ContentFoldMode = "off" | "hide" | "fold";

export interface StyleSettings {
  // 卡片标题
  titleFontSize: number;      // 默认 14, 范围 10-24
  titleFontWeight: number;    // 默认 700, 范围 400-900, 步进 100
  titleColor: string;         // 默认 "" (空=跟随主题)
  titleLineHeight: number;    // 默认 1.6, 范围 1.0-2.5, 步进 0.1
  titleBarWidth: number;      // 默认 3, 范围 0-6, 装饰条宽度
  titleBarColor: string;      // 默认 "" (空=跟随主题primary)
  
  // 卡片内容
  contentFontSize: number;    // 默认 12, 范围 9-20
  contentColor: string;       // 默认 ""
  contentLineHeight: number;  // 默认 1.6, 范围 1.0-2.5, 步进 0.1
  
  // 日期时间
  dateFontSize: number;       // 默认 12, 范围 9-16
  dateColor: string;          // 默认 ""
  timeFontSize: number;       // 默认 11, 范围 9-16
  timeColor: string;          // 默认 ""
  
  // 时间轴
  dotSize: number;            // 默认 8, 范围 4-16
  lineWidth: number;          // 默认 2, 范围 1-4
  
  // 卡片
  cardBorderRadius: number;   // 默认 8, 范围 0-20
  cardPadding: number;        // 默认 6, 范围 2-16
  
  // 路径信息
  metaFontSize: number;       // 默认 11, 范围 9-14
  metaColor: string;          // 默认 ""
}

export const DEFAULT_STYLE_SETTINGS: StyleSettings = {
  titleFontSize: 14,
  titleFontWeight: 700,
  titleColor: "",
  titleLineHeight: 1.6,
  titleBarWidth: 3,
  titleBarColor: "",
  contentFontSize: 12,
  contentColor: "",
  contentLineHeight: 1.6,
  dateFontSize: 12,
  dateColor: "",
  timeFontSize: 11,
  timeColor: "",
  dotSize: 8,
  lineWidth: 2,
  cardBorderRadius: 8,
  cardPadding: 6,
  metaFontSize: 11,
  metaColor: "",
};

export interface PluginSettings {
  contentSortOrder: ContentSortOrder;
  ignoreContent: string;  // 多行文本，每行一条忽略规则
  truncateLines: number;  // 内容截断行数，0=不截断
  jumpMethod: JumpMethod; // 跳转方式：openTab 或 思源链接
  zoomIn: boolean;        // 跳转时是否聚焦到块（仅 openTab 方式生效）
  refreshDelay: number;   // 自动刷新延迟（秒），0=关闭自动刷新
  hideEmptyContentDocs: boolean; // 隐藏无更新内容的文档卡片（如新建空文档）
  contentFoldMode: ContentFoldMode; // 文档卡片内容折叠模式
  contentFoldCount: number; // 折叠模式下显示的条目数（超出部分折叠，点击展开）
  style: StyleSettings;   // 样式配置
}

export const DEFAULT_SETTINGS: PluginSettings = {
  contentSortOrder: "updated",
  ignoreContent: "",
  truncateLines: 3,
  jumpMethod: "openTab",
  zoomIn: true,
  refreshDelay: 2,
  hideEmptyContentDocs: false,
  contentFoldMode: "off",
  contentFoldCount: 5,
  style: { ...DEFAULT_STYLE_SETTINGS },
};

export class TimelinePanel {
  private element: HTMLElement;
  private plugin: Plugin;
  private settings: PluginSettings;
  private dataList: TimelineItem[] = [];
  private noteBooks: Map<string, string> = new Map();
  private seenLeftTimes: Map<string, number> = new Map();
  private colorIndex = 0;
  private loading = false;
  private hasMore = false; // 是否还有更多数据（上一页拉满即视为可能还有）
  private requestSeq = 0; // 请求序列号，用于丢弃过期/乱序的并发加载响应
  private observer: IntersectionObserver | null = null;
  private scrollContainer: HTMLElement | null = null;
  private lastRenderedDate: string = "";
  private settingsOverlay: HTMLElement | null = null;
  private escapeDiv: HTMLDivElement = document.createElement("div");

  constructor(element: HTMLElement, plugin: Plugin, settings: PluginSettings) {
    this.element = element;
    this.plugin = plugin;
    this.settings = { ...settings, style: { ...settings.style } };
  }

  /** 获取当前设置 */
  getSettings(): PluginSettings {
    return { ...this.settings, style: { ...this.settings.style } };
  }

  /** 更新设置 */
  updateSettings(settings: PluginSettings) {
    this.settings = { ...settings, style: { ...settings.style } };
  }

  init() {
    this.element.classList.add("recent-timeline");
    this.element.innerHTML = `
      <div class="timeline-header">
        <span class="timeline-header__title">${this.plugin.i18n.title}</span>
        <div class="timeline-header__actions">
          <button class="timeline-header__settings" title="${this.plugin.i18n.settings}">
            <svg viewBox="0 0 24 24" width="16" height="16">
              <path fill="currentColor" d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
            </svg>
          </button>
          <button class="timeline-header__top" title="${this.plugin.i18n.backToTop}">
            <svg viewBox="0 0 24 24" width="16" height="16">
              <path fill="currentColor" d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z"/>
            </svg>
          </button>
          <button class="timeline-header__refresh" title="${this.plugin.i18n.refresh}">
            <svg viewBox="0 0 24 24" width="16" height="16">
              <path fill="currentColor" d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="timeline-body">
        <div class="timeline-list"></div>
        <div class="timeline-sentinel"></div>
        <div class="timeline-loading" style="display:none;">
          <span class="timeline-loading__spinner"></span>
          <span>${this.plugin.i18n.loading}</span>
        </div>
        <div class="timeline-empty" style="display:none;">
          <svg class="timeline-empty__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          <span class="timeline-empty__text">${this.plugin.i18n.empty}</span>
        </div>
      </div>
    `;

    // 设置按钮
    const settingsBtn = this.element.querySelector(
      ".timeline-header__settings"
    ) as HTMLElement;
    settingsBtn.addEventListener("click", () => this.openSettings());

    const refreshBtn = this.element.querySelector(
      ".timeline-header__refresh"
    ) as HTMLElement;
    refreshBtn.addEventListener("click", () => this.loadData());

    const topBtn = this.element.querySelector(
      ".timeline-header__top"
    ) as HTMLElement;
    topBtn.addEventListener("click", () => this.scrollToTop());

    this.scrollContainer = this.element.querySelector(
      ".timeline-body"
    ) as HTMLElement;
    this.setupScrollLoading();

    this.applyStyles();
  }

  // ---- 样式注入 ----

  private applyStyles() {
    const s = this.settings.style;
    const el = this.element;
    const setVar = (name: string, value: string) => el.style.setProperty(name, value);
    
    // 标题
    setVar("--tl-title-size", s.titleFontSize + "px");
    setVar("--tl-title-weight", String(s.titleFontWeight));
    if (s.titleColor) setVar("--tl-title-color", s.titleColor);
    else el.style.removeProperty("--tl-title-color");
    setVar("--tl-title-lh", String(s.titleLineHeight));
    setVar("--tl-title-bar-w", s.titleBarWidth + "px");
    if (s.titleBarColor) setVar("--tl-title-bar-color", s.titleBarColor);
    else el.style.removeProperty("--tl-title-bar-color");
    
    // 内容
    setVar("--tl-content-size", s.contentFontSize + "px");
    if (s.contentColor) setVar("--tl-content-color", s.contentColor);
    else el.style.removeProperty("--tl-content-color");
    setVar("--tl-content-lh", String(s.contentLineHeight));
    
    // 日期时间
    setVar("--tl-date-size", s.dateFontSize + "px");
    if (s.dateColor) setVar("--tl-date-color", s.dateColor);
    else el.style.removeProperty("--tl-date-color");
    setVar("--tl-time-size", s.timeFontSize + "px");
    if (s.timeColor) setVar("--tl-time-color", s.timeColor);
    else el.style.removeProperty("--tl-time-color");
    
    // 时间轴
    setVar("--tl-dot-size", s.dotSize + "px");
    setVar("--tl-line-w", s.lineWidth + "px");
    
    // 卡片
    setVar("--tl-card-radius", s.cardBorderRadius + "px");
    setVar("--tl-card-pad", s.cardPadding + "px");
    
    // 路径
    setVar("--tl-meta-size", s.metaFontSize + "px");
    if (s.metaColor) setVar("--tl-meta-color", s.metaColor);
    else el.style.removeProperty("--tl-meta-color");
  }

  // ---- 设置弹窗 ----

  private openSettings() {
    if (this.settingsOverlay) return; // 已经打开

    const i18n = this.plugin.i18n;
    const ignoreValue = this.escapeHtml(this.settings.ignoreContent || "");
    const s = this.settings.style;
    const overlay = document.createElement("div");
    overlay.className = "timeline-settings-overlay";
    overlay.innerHTML = `
      <div class="timeline-settings">
        <div class="timeline-settings__header">
          <span class="timeline-settings__title">${i18n.settingsTitle}</span>
          <button class="timeline-settings__close">
            <svg viewBox="0 0 24 24" width="16" height="16">
              <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>
        <div class="timeline-settings__tabs">
          <button class="timeline-settings__tab timeline-settings__tab--active" data-tab="function">${i18n.functionTab}</button>
          <button class="timeline-settings__tab" data-tab="style">${i18n.styleTab}</button>
        </div>
        <div class="timeline-settings__body">
          <div class="timeline-settings__panel timeline-settings__panel--active" data-panel="function">
            <div class="timeline-settings__item">
              <div class="timeline-settings__label">${i18n.sortOrderLabel}</div>
              <select class="timeline-settings__select" id="timeline-sort-order">
                <option value="updated" ${this.settings.contentSortOrder === "updated" ? "selected" : ""}>${i18n.sortByUpdated}</option>
                <option value="document" ${this.settings.contentSortOrder === "document" ? "selected" : ""}>${i18n.sortByDocument}</option>
              </select>
              <div class="timeline-settings__desc">${i18n.sortOrderDesc}</div>
            </div>
            <div class="timeline-settings__item">
              <div class="timeline-settings__label">${i18n.ignoreContentLabel}</div>
              <textarea class="timeline-settings__textarea" id="timeline-ignore-content" rows="5" placeholder="${i18n.ignoreContentPlaceholder}">${ignoreValue}</textarea>
              <div class="timeline-settings__desc">${i18n.ignoreContentDesc}</div>
            </div>
            <div class="timeline-settings__item">
              <div class="timeline-settings__label">${i18n.truncateLabel}</div>
              <div class="timeline-settings__truncate-row">
                <input class="timeline-settings__number" id="timeline-truncate-lines" type="number" min="0" max="20" value="${this.settings.truncateLines}" />
                <span class="timeline-settings__truncate-suffix">${i18n.truncateLines}</span>
              </div>
              <div class="timeline-settings__desc">${i18n.truncateDesc}</div>
            </div>
            <div class="timeline-settings__item">
              <div class="timeline-settings__label">${i18n.jumpMethodLabel}</div>
              <select class="timeline-settings__select" id="timeline-jump-method">
                <option value="openTab" ${this.settings.jumpMethod === "openTab" ? "selected" : ""}>${i18n.jumpMethodOpenTab}</option>
                <option value="siyuanLink" ${this.settings.jumpMethod === "siyuanLink" ? "selected" : ""}>${i18n.jumpMethodSiyuanLink}</option>
              </select>
              <div class="timeline-settings__desc">${i18n.jumpMethodDesc}</div>
            </div>
            <div class="timeline-settings__item timeline-settings__item--zoom-in" id="timeline-zoom-in-item" style="${this.settings.jumpMethod === "openTab" ? "" : "display:none;"}">
              <div class="timeline-settings__label">${i18n.zoomInLabel}</div>
              <label class="timeline-settings__toggle">
                <input class="timeline-settings__checkbox" id="timeline-zoom-in" type="checkbox" ${this.settings.zoomIn ? "checked" : ""} />
                <span>${i18n.zoomInOption}</span>
              </label>
              <div class="timeline-settings__desc">${i18n.zoomInDesc}</div>
            </div>
            <div class="timeline-settings__item">
              <div class="timeline-settings__label">${i18n.refreshDelayLabel}</div>
              <div class="timeline-settings__range-row">
                <input class="timeline-settings__range" id="timeline-refresh-delay" type="range" min="0" max="10" step="0.5" value="${this.settings.refreshDelay}" />
                <span class="timeline-settings__range-value" data-for="timeline-refresh-delay">${this.settings.refreshDelay === 0 ? i18n.refreshDelayOff : this.settings.refreshDelay + i18n.refreshDelayUnit}</span>
              </div>
              <div class="timeline-settings__desc">${i18n.refreshDelayDesc}</div>
            </div>
            <div class="timeline-settings__item">
              <div class="timeline-settings__label">${i18n.hideEmptyDocsLabel}</div>
              <label class="timeline-settings__toggle">
                <input class="timeline-settings__checkbox" id="timeline-hide-empty-docs" type="checkbox" ${this.settings.hideEmptyContentDocs ? "checked" : ""} />
                <span>${i18n.hideEmptyDocsOn}</span>
              </label>
              <div class="timeline-settings__desc">${i18n.hideEmptyDocsDesc}</div>
            </div>
            <div class="timeline-settings__item">
              <div class="timeline-settings__label">${i18n.foldModeLabel}</div>
              <select class="timeline-settings__select" id="timeline-fold-mode">
                <option value="off" ${this.settings.contentFoldMode === "off" ? "selected" : ""}>${i18n.foldOff}</option>
                <option value="hide" ${this.settings.contentFoldMode === "hide" ? "selected" : ""}>${i18n.foldHide}</option>
                <option value="fold" ${this.settings.contentFoldMode === "fold" ? "selected" : ""}>${i18n.foldFold}</option>
              </select>
              <div class="timeline-settings__desc">${i18n.foldModeDesc}</div>
            </div>
            <div class="timeline-settings__item" id="timeline-fold-count-item" style="${this.settings.contentFoldMode === "fold" ? "" : "display:none;"}">
              <div class="timeline-settings__label">${i18n.foldCountLabel}</div>
              <div class="timeline-settings__truncate-row">
                <input class="timeline-settings__number" id="timeline-fold-count" type="number" min="1" max="50" value="${this.settings.contentFoldCount}" />
                <span class="timeline-settings__truncate-suffix">${i18n.foldCountUnit}</span>
              </div>
              <div class="timeline-settings__desc">${i18n.foldCountDesc}</div>
            </div>
          </div>
          <div class="timeline-settings__panel" data-panel="style">
            <div class="timeline-settings__group-title">${i18n.styleGroupTitle}</div>
            <div class="timeline-settings__style-row">
              <span class="timeline-settings__style-label">${i18n.styleFontSize}</span>
              <input class="timeline-settings__range" id="style-title-font-size" type="range" min="10" max="24" step="1" value="${s.titleFontSize}" />
              <span class="timeline-settings__range-value" data-for="style-title-font-size">${s.titleFontSize}px</span>
            </div>
            <div class="timeline-settings__style-row">
              <span class="timeline-settings__style-label">${i18n.styleFontWeight}</span>
              <select class="timeline-settings__style-select" id="style-title-font-weight">
                <option value="300" ${s.titleFontWeight === 300 ? "selected" : ""}>${i18n.styleWeightLight}</option>
                <option value="400" ${s.titleFontWeight === 400 ? "selected" : ""}>${i18n.styleWeightNormal}</option>
                <option value="500" ${s.titleFontWeight === 500 ? "selected" : ""}>${i18n.styleWeightMedium}</option>
                <option value="600" ${s.titleFontWeight === 600 ? "selected" : ""}>${i18n.styleWeightSemibold}</option>
                <option value="700" ${s.titleFontWeight === 700 ? "selected" : ""}>${i18n.styleWeightBold}</option>
                <option value="800" ${s.titleFontWeight === 800 ? "selected" : ""}>${i18n.styleWeightExtrabold}</option>
                <option value="900" ${s.titleFontWeight === 900 ? "selected" : ""}>${i18n.styleWeightBlack}</option>
              </select>
            </div>
            <div class="timeline-settings__style-row">
              <span class="timeline-settings__style-label">${i18n.styleColor}</span>
              <div class="timeline-settings__color-group">
                <input class="timeline-settings__color" id="style-title-color" type="color" value="${s.titleColor || '#000000'}" ${s.titleColor ? '' : 'data-reset="true"'} />
                <button class="timeline-settings__color-reset" data-target="style-title-color" title="${i18n.styleColorReset}">↺</button>
              </div>
            </div>
            <div class="timeline-settings__style-row">
              <span class="timeline-settings__style-label">${i18n.styleLineHeight}</span>
              <input class="timeline-settings__range" id="style-title-line-height" type="range" min="1.0" max="2.5" step="0.1" value="${s.titleLineHeight}" />
              <span class="timeline-settings__range-value" data-for="style-title-line-height">${s.titleLineHeight}</span>
            </div>
            <div class="timeline-settings__style-row">
              <span class="timeline-settings__style-label">${i18n.styleBarWidth}</span>
              <input class="timeline-settings__range" id="style-title-bar-width" type="range" min="0" max="6" step="1" value="${s.titleBarWidth}" />
              <span class="timeline-settings__range-value" data-for="style-title-bar-width">${s.titleBarWidth}px</span>
            </div>
            <div class="timeline-settings__style-row">
              <span class="timeline-settings__style-label">${i18n.styleBarColor}</span>
              <div class="timeline-settings__color-group">
                <input class="timeline-settings__color" id="style-title-bar-color" type="color" value="${s.titleBarColor || '#000000'}" ${s.titleBarColor ? '' : 'data-reset="true"'} />
                <button class="timeline-settings__color-reset" data-target="style-title-bar-color" title="${i18n.styleColorReset}">↺</button>
              </div>
            </div>

            <div class="timeline-settings__group-title">${i18n.styleGroupContent}</div>
            <div class="timeline-settings__style-row">
              <span class="timeline-settings__style-label">${i18n.styleFontSize}</span>
              <input class="timeline-settings__range" id="style-content-font-size" type="range" min="9" max="20" step="1" value="${s.contentFontSize}" />
              <span class="timeline-settings__range-value" data-for="style-content-font-size">${s.contentFontSize}px</span>
            </div>
            <div class="timeline-settings__style-row">
              <span class="timeline-settings__style-label">${i18n.styleColor}</span>
              <div class="timeline-settings__color-group">
                <input class="timeline-settings__color" id="style-content-color" type="color" value="${s.contentColor || '#000000'}" ${s.contentColor ? '' : 'data-reset="true"'} />
                <button class="timeline-settings__color-reset" data-target="style-content-color" title="${i18n.styleColorReset}">↺</button>
              </div>
            </div>
            <div class="timeline-settings__style-row">
              <span class="timeline-settings__style-label">${i18n.styleLineHeight}</span>
              <input class="timeline-settings__range" id="style-content-line-height" type="range" min="1.0" max="2.5" step="0.1" value="${s.contentLineHeight}" />
              <span class="timeline-settings__range-value" data-for="style-content-line-height">${s.contentLineHeight}</span>
            </div>

            <div class="timeline-settings__group-title">${i18n.styleGroupDateTime}</div>
            <div class="timeline-settings__style-row">
              <span class="timeline-settings__style-label">${i18n.styleFontSize}</span>
              <input class="timeline-settings__range" id="style-date-font-size" type="range" min="9" max="16" step="1" value="${s.dateFontSize}" />
              <span class="timeline-settings__range-value" data-for="style-date-font-size">${s.dateFontSize}px</span>
            </div>
            <div class="timeline-settings__style-row">
              <span class="timeline-settings__style-label">${i18n.styleColor}</span>
              <div class="timeline-settings__color-group">
                <input class="timeline-settings__color" id="style-date-color" type="color" value="${s.dateColor || '#000000'}" ${s.dateColor ? '' : 'data-reset="true"'} />
                <button class="timeline-settings__color-reset" data-target="style-date-color" title="${i18n.styleColorReset}">↺</button>
              </div>
            </div>
            <div class="timeline-settings__style-row">
              <span class="timeline-settings__style-label">${i18n.styleFontSize}</span>
              <input class="timeline-settings__range" id="style-time-font-size" type="range" min="9" max="16" step="1" value="${s.timeFontSize}" />
              <span class="timeline-settings__range-value" data-for="style-time-font-size">${s.timeFontSize}px</span>
            </div>
            <div class="timeline-settings__style-row">
              <span class="timeline-settings__style-label">${i18n.styleColor}</span>
              <div class="timeline-settings__color-group">
                <input class="timeline-settings__color" id="style-time-color" type="color" value="${s.timeColor || '#000000'}" ${s.timeColor ? '' : 'data-reset="true"'} />
                <button class="timeline-settings__color-reset" data-target="style-time-color" title="${i18n.styleColorReset}">↺</button>
              </div>
            </div>

            <div class="timeline-settings__group-title">${i18n.styleGroupAxis}</div>
            <div class="timeline-settings__style-row">
              <span class="timeline-settings__style-label">${i18n.styleDotSize}</span>
              <input class="timeline-settings__range" id="style-dot-size" type="range" min="4" max="16" step="1" value="${s.dotSize}" />
              <span class="timeline-settings__range-value" data-for="style-dot-size">${s.dotSize}px</span>
            </div>
            <div class="timeline-settings__style-row">
              <span class="timeline-settings__style-label">${i18n.styleLineWidth}</span>
              <input class="timeline-settings__range" id="style-line-width" type="range" min="1" max="4" step="1" value="${s.lineWidth}" />
              <span class="timeline-settings__range-value" data-for="style-line-width">${s.lineWidth}px</span>
            </div>

            <div class="timeline-settings__group-title">${i18n.styleGroupCard}</div>
            <div class="timeline-settings__style-row">
              <span class="timeline-settings__style-label">${i18n.styleBorderRadius}</span>
              <input class="timeline-settings__range" id="style-card-border-radius" type="range" min="0" max="20" step="1" value="${s.cardBorderRadius}" />
              <span class="timeline-settings__range-value" data-for="style-card-border-radius">${s.cardBorderRadius}px</span>
            </div>
            <div class="timeline-settings__style-row">
              <span class="timeline-settings__style-label">${i18n.stylePadding}</span>
              <input class="timeline-settings__range" id="style-card-padding" type="range" min="2" max="16" step="1" value="${s.cardPadding}" />
              <span class="timeline-settings__range-value" data-for="style-card-padding">${s.cardPadding}px</span>
            </div>

            <div class="timeline-settings__group-title">${i18n.styleGroupMeta}</div>
            <div class="timeline-settings__style-row">
              <span class="timeline-settings__style-label">${i18n.styleFontSize}</span>
              <input class="timeline-settings__range" id="style-meta-font-size" type="range" min="9" max="14" step="1" value="${s.metaFontSize}" />
              <span class="timeline-settings__range-value" data-for="style-meta-font-size">${s.metaFontSize}px</span>
            </div>
            <div class="timeline-settings__style-row">
              <span class="timeline-settings__style-label">${i18n.styleColor}</span>
              <div class="timeline-settings__color-group">
                <input class="timeline-settings__color" id="style-meta-color" type="color" value="${s.metaColor || '#000000'}" ${s.metaColor ? '' : 'data-reset="true"'} />
                <button class="timeline-settings__color-reset" data-target="style-meta-color" title="${i18n.styleColorReset}">↺</button>
              </div>
            </div>

            <div class="timeline-settings__style-actions">
              <button class="timeline-settings__style-btn" id="style-reset">${i18n.styleReset}</button>
              <button class="timeline-settings__style-btn" id="style-export">${i18n.styleExport}</button>
              <button class="timeline-settings__style-btn" id="style-import">${i18n.styleImport}</button>
            </div>
          </div>
        </div>
        <div class="timeline-settings__footer">
          <button class="timeline-settings__btn timeline-settings__btn--cancel" id="timeline-settings-cancel">${i18n.settingsCancel}</button>
          <button class="timeline-settings__btn timeline-settings__btn--save" id="timeline-settings-save">${i18n.settingsSave}</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    this.settingsOverlay = overlay;

    // 关闭按钮
    overlay.querySelector(".timeline-settings__close")!.addEventListener("click", () => {
      this.closeSettings();
    });

    // 点击遮罩关闭
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) this.closeSettings();
    });

    // 取消
    overlay.querySelector("#timeline-settings-cancel")!.addEventListener("click", () => {
      this.closeSettings();
    });

    // 页签切换
    const tabs = overlay.querySelectorAll(".timeline-settings__tab");
    const panels = overlay.querySelectorAll(".timeline-settings__panel");
    tabs.forEach(tab => {
      tab.addEventListener("click", () => {
        tabs.forEach(t => t.classList.remove("timeline-settings__tab--active"));
        panels.forEach(p => p.classList.remove("timeline-settings__panel--active"));
        tab.classList.add("timeline-settings__tab--active");
        const target = (tab as HTMLElement).dataset.tab;
        overlay.querySelector(`[data-panel="${target}"]`)!.classList.add("timeline-settings__panel--active");
      });
    });

    // 跳转方式联动：切换时控制 zoomIn 项显隐
    const jumpMethodSelect = overlay.querySelector("#timeline-jump-method") as HTMLSelectElement;
    const zoomInItem = overlay.querySelector("#timeline-zoom-in-item") as HTMLElement;
    jumpMethodSelect.addEventListener("change", () => {
      zoomInItem.style.display = jumpMethodSelect.value === "openTab" ? "" : "none";
    });

    // 折叠模式联动：选择「折叠超出部分」时显示条目数输入
    const foldModeSelect = overlay.querySelector("#timeline-fold-mode") as HTMLSelectElement;
    const foldCountItem = overlay.querySelector("#timeline-fold-count-item") as HTMLElement;
    foldModeSelect.addEventListener("change", () => {
      foldCountItem.style.display = foldModeSelect.value === "fold" ? "" : "none";
    });

    // 滑块值同步
    overlay.querySelectorAll(".timeline-settings__range").forEach(range => {
      range.addEventListener("input", (e) => {
        const input = e.target as HTMLInputElement;
        const valueEl = overlay.querySelector(`[data-for="${input.id}"]`);
        if (valueEl) {
          // 行高不显示 px 后缀
          if (input.id === "style-title-line-height" || input.id === "style-content-line-height") {
            valueEl.textContent = input.value;
          } else if (input.id === "timeline-refresh-delay") {
            const val = parseFloat(input.value);
            valueEl.textContent = val === 0 ? i18n.refreshDelayOff : input.value + i18n.refreshDelayUnit;
          } else {
            valueEl.textContent = input.value + "px";
          }
        }
      });
    });

    // 颜色重置按钮
    overlay.querySelectorAll(".timeline-settings__color-reset").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const targetId = (e.currentTarget as HTMLElement).dataset.target;
        const colorInput = overlay.querySelector(`#${targetId}`) as HTMLInputElement;
        if (colorInput) {
          colorInput.value = "#000000";
          // 标记为已重置（用 data-reset 属性）
          colorInput.dataset.reset = "true";
        }
      });
    });

    // 颜色选择器变更时清除 reset 标记
    overlay.querySelectorAll(".timeline-settings__color").forEach(colorInput => {
      colorInput.addEventListener("input", () => {
        (colorInput as HTMLInputElement).dataset.reset = "";
      });
    });

    // 重置按钮
    const resetBtn = overlay.querySelector("#style-reset");
    resetBtn?.addEventListener("click", () => {
      this.updateStyleControls(overlay, { ...DEFAULT_STYLE_SETTINGS });
    });

    // 导出按钮
    const exportBtn = overlay.querySelector("#style-export");
    exportBtn?.addEventListener("click", () => {
      const styleData = this.collectStyleSettings(overlay);
      navigator.clipboard.writeText(JSON.stringify(styleData, null, 2)).then(() => {
        // 简单的成功提示
        const btn = exportBtn as HTMLElement;
        const orig = btn.textContent;
        btn.textContent = i18n.styleExportSuccess;
        setTimeout(() => btn.textContent = orig, 1500);
      });
    });

    // 导入按钮
    const importBtn = overlay.querySelector("#style-import");
    importBtn?.addEventListener("click", () => {
      // 创建一个内联对话框
      const dialog = document.createElement("div");
      dialog.className = "timeline-settings__import-dialog";
      dialog.innerHTML = `
        <div class="timeline-settings__import-title">${i18n.styleImportTitle}</div>
        <textarea class="timeline-settings__import-textarea" placeholder="${i18n.styleImportPlaceholder}"></textarea>
        <div class="timeline-settings__import-actions">
          <button class="timeline-settings__import-cancel">${i18n.styleImportCancel}</button>
          <button class="timeline-settings__import-confirm">${i18n.styleImportConfirm}</button>
        </div>
      `;
      overlay.querySelector(".timeline-settings__style-actions")!.appendChild(dialog);
      
      dialog.querySelector(".timeline-settings__import-cancel")!.addEventListener("click", () => dialog.remove());
      dialog.querySelector(".timeline-settings__import-confirm")!.addEventListener("click", () => {
        const textarea = dialog.querySelector("textarea") as HTMLTextAreaElement;
        try {
          const imported = JSON.parse(textarea.value);
          // 合并到当前 style，保留默认值作为兜底
          const merged = { ...DEFAULT_STYLE_SETTINGS, ...imported };
          // 更新所有控件值
          this.updateStyleControls(overlay, merged);
          dialog.remove();
        } catch (e) {
          textarea.style.borderColor = "red";
          textarea.title = "JSON 格式错误";
        }
      });
    });

    // 保存
    overlay.querySelector("#timeline-settings-save")!.addEventListener("click", () => {
      const select = overlay.querySelector("#timeline-sort-order") as HTMLSelectElement;
      const textarea = overlay.querySelector("#timeline-ignore-content") as HTMLTextAreaElement;
      const truncateInput = overlay.querySelector("#timeline-truncate-lines") as HTMLInputElement;
      this.settings.contentSortOrder = select.value as ContentSortOrder;
      this.settings.ignoreContent = textarea.value;
      const val = parseInt(truncateInput.value, 10);
      this.settings.truncateLines = isNaN(val) ? 3 : Math.max(0, val);

      const jumpMethodSelect = overlay.querySelector("#timeline-jump-method") as HTMLSelectElement;
      this.settings.jumpMethod = jumpMethodSelect.value as JumpMethod;
      const zoomInCheckbox = overlay.querySelector("#timeline-zoom-in") as HTMLInputElement;
      this.settings.zoomIn = zoomInCheckbox.checked;
      const refreshDelaySlider = overlay.querySelector("#timeline-refresh-delay") as HTMLInputElement;
      this.settings.refreshDelay = parseFloat(refreshDelaySlider.value) || 2;

      // 隐藏无内容文档 + 折叠设置
      const hideEmptyDocsCheckbox = overlay.querySelector("#timeline-hide-empty-docs") as HTMLInputElement;
      this.settings.hideEmptyContentDocs = hideEmptyDocsCheckbox.checked;
      const foldModeSel = overlay.querySelector("#timeline-fold-mode") as HTMLSelectElement;
      this.settings.contentFoldMode = foldModeSel.value as ContentFoldMode;
      const foldCountInput = overlay.querySelector("#timeline-fold-count") as HTMLInputElement;
      const foldVal = parseInt(foldCountInput.value, 10);
      this.settings.contentFoldCount = isNaN(foldVal) ? 5 : Math.max(1, foldVal);

      // 收集样式设置
      this.settings.style = this.collectStyleSettings(overlay);
      this.applyStyles();

      // 通知 plugin 保存设置
      const plugin = this.plugin as any;
      if (plugin.saveTimelineSettings) {
        plugin.saveTimelineSettings(this.settings);
      }
      this.closeSettings();
      // 刷新数据
      this.loadData();
    });
  }

  private collectStyleSettings(overlay: HTMLElement): StyleSettings {
    const s = { ...this.settings.style };
    const getNum = (id: string) => {
      const el = overlay.querySelector(`#${id}`) as HTMLInputElement;
      return el ? parseFloat(el.value) : 0;
    };
    const getColor = (id: string) => {
      const el = overlay.querySelector(`#${id}`) as HTMLInputElement;
      if (!el) return "";
      return el.dataset.reset === "true" ? "" : el.value;
    };
    
    s.titleFontSize = getNum("style-title-font-size");
    s.titleFontWeight = getNum("style-title-font-weight");
    s.titleColor = getColor("style-title-color");
    s.titleLineHeight = getNum("style-title-line-height");
    s.titleBarWidth = getNum("style-title-bar-width");
    s.titleBarColor = getColor("style-title-bar-color");
    s.contentFontSize = getNum("style-content-font-size");
    s.contentColor = getColor("style-content-color");
    s.contentLineHeight = getNum("style-content-line-height");
    s.dateFontSize = getNum("style-date-font-size");
    s.dateColor = getColor("style-date-color");
    s.timeFontSize = getNum("style-time-font-size");
    s.timeColor = getColor("style-time-color");
    s.dotSize = getNum("style-dot-size");
    s.lineWidth = getNum("style-line-width");
    s.cardBorderRadius = getNum("style-card-border-radius");
    s.cardPadding = getNum("style-card-padding");
    s.metaFontSize = getNum("style-meta-font-size");
    s.metaColor = getColor("style-meta-color");
    return s;
  }

  private updateStyleControls(overlay: HTMLElement, s: StyleSettings) {
    const setRange = (id: string, val: number) => {
      const el = overlay.querySelector(`#${id}`) as HTMLInputElement;
      if (el) {
        el.value = String(val);
        const valueEl = overlay.querySelector(`[data-for="${id}"]`);
        if (valueEl) {
          // 行高不显示 px 后缀
          if (id === "style-title-line-height" || id === "style-content-line-height") {
            valueEl.textContent = String(val);
          } else {
            valueEl.textContent = val + "px";
          }
        }
      }
    };
    const setColor = (id: string, val: string) => {
      const el = overlay.querySelector(`#${id}`) as HTMLInputElement;
      if (el) {
        el.value = val || "#000000";
        el.dataset.reset = val ? "" : "true";
      }
    };
    
    setRange("style-title-font-size", s.titleFontSize);
    setRange("style-title-font-weight", s.titleFontWeight);
    setColor("style-title-color", s.titleColor);
    setRange("style-title-line-height", s.titleLineHeight);
    setRange("style-title-bar-width", s.titleBarWidth);
    setColor("style-title-bar-color", s.titleBarColor);
    setRange("style-content-font-size", s.contentFontSize);
    setColor("style-content-color", s.contentColor);
    setRange("style-content-line-height", s.contentLineHeight);
    setRange("style-date-font-size", s.dateFontSize);
    setColor("style-date-color", s.dateColor);
    setRange("style-time-font-size", s.timeFontSize);
    setColor("style-time-color", s.timeColor);
    setRange("style-dot-size", s.dotSize);
    setRange("style-line-width", s.lineWidth);
    setRange("style-card-border-radius", s.cardBorderRadius);
    setRange("style-card-padding", s.cardPadding);
    setRange("style-meta-font-size", s.metaFontSize);
    setColor("style-meta-color", s.metaColor);
  }

  private getIgnoreList(): string[] {
    return (this.settings.ignoreContent || "")
      .split("\n")
      .map(line => line.trim())
      .filter(line => line.length > 0);
  }

  /** 对内容行应用截断 */
  private applyTruncation(el: HTMLElement) {
    const lines = this.settings.truncateLines;
    if (lines > 0) {
      el.style.display = "-webkit-box";
      el.style.webkitLineClamp = String(lines);
      el.style.webkitBoxOrient = "vertical";
      el.style.overflow = "hidden";
    } else {
      el.style.display = "block";
      el.style.webkitLineClamp = "";
      el.style.webkitBoxOrient = "";
      el.style.overflow = "visible";
    }
  }

  private closeSettings() {
    if (this.settingsOverlay) {
      this.settingsOverlay.remove();
      this.settingsOverlay = null;
    }
  }

  // ---- 核心逻辑 ----

  private scrollToTop() {
    if (this.scrollContainer) {
      this.scrollContainer.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  destroy() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    this.closeSettings();
  }

  private setupScrollLoading() {
    const sentinel = this.element.querySelector(
      ".timeline-sentinel"
    ) as HTMLElement;
    this.observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !this.loading) {
          this.loadMore();
        }
      },
      {
        root: this.scrollContainer,
        rootMargin: "100px",
      }
    );
    this.observer.observe(sentinel);
  }

  async loadData() {
    if (this.loading) return; // 阻止与 loadMore 并发
    const seq = ++this.requestSeq; // 标记本次请求，用于丢弃过期响应
    clearDocOrderCache(); // 刷新前清空文档顺序缓存，确保与最新文档结构一致

    const listEl = this.element.querySelector(".timeline-list") as HTMLElement;

    // 平滑淡出
    if (listEl.children.length > 0) {
      listEl.style.transition = "opacity 0.18s ease";
      listEl.style.opacity = "0";
      await new Promise(r => setTimeout(r, 180));
      if (seq !== this.requestSeq) return; // 期间有新刷新，放弃本次
    }

    this.dataList = [];
    this.seenLeftTimes = new Map();
    this.colorIndex = 0;
    this.lastRenderedDate = "";
    listEl.innerHTML = "";

    // 隐藏空状态
    const emptyEl = this.element.querySelector(".timeline-empty") as HTMLElement;
    if (emptyEl) emptyEl.style.display = "none";

    this.noteBooks = await getNotebooks();
    await this.fetchAndRender(0, PAGE_SIZE, seq);

    // 淡入
    listEl.style.transition = "opacity 0.25s ease";
    listEl.style.opacity = "1";
  }

  async loadMore() {
    if (this.loading) return;
    const seq = ++this.requestSeq;
    await this.fetchAndRender(this.dataList.length, PAGE_SIZE, seq);
  }

  /**
   * 自动填充式加载：当已渲染内容高度不足以撑满滚动容器（无滚动条）时，
   * 继续加载下一页，直到内容撑满视口或已无更多数据 (hasMore=false)。
   * 解决折叠后卡片变矮、初始高度不足导致无法滚动触底加载更多的问题。
   */
  private ensureFilled() {
    const body = this.scrollContainer;
    if (!body || !this.hasMore || this.loading) return;
    const list = this.element.querySelector(".timeline-list") as HTMLElement;
    if (!list) return;
    // 列表未产生滚动条（内容高度不超过可视区）则继续加载下一页
    if (body.scrollHeight <= body.clientHeight + 8) {
      this.loadMore();
    }
  }

  private async fetchAndRender(offset: number, limit: number, seq: number) {
    this.setLoading(true);

    try {
      const blocks = await getRecentDocs(offset, limit);
      this.hasMore = blocks.length === limit; // 满页说明可能还有下一页
      if (seq !== this.requestSeq) return; // 过期请求，直接丢弃

      if (blocks.length === 0 && offset === 0) {
        const emptyEl = this.element.querySelector(
          ".timeline-empty"
        ) as HTMLElement;
        if (emptyEl) emptyEl.style.display = "flex";
        return;
      }

      const prevLength = this.dataList.length;
      const newItems = this.transformBlocks(blocks);
      this.dataList = this.dataList.concat(newItems);

      await fillDocUpdatedContents(this.dataList, prevLength, this.settings.contentSortOrder, this.getIgnoreList());
      if (seq !== this.requestSeq) return; // 填充期间被新刷新抢占，放弃渲染

      // 功能2：隐藏无更新内容的文档卡片（如新建空文档）
      let renderItems = newItems;
      if (this.settings.hideEmptyContentDocs) {
        renderItems = newItems.filter(it => it.content.length > 0);
        if (offset === 0 && renderItems.length === 0) {
          const emptyEl = this.element.querySelector(".timeline-empty") as HTMLElement;
          if (emptyEl) emptyEl.style.display = "flex";
          return;
        }
      }
      this.renderItems(renderItems);
    } catch (err) {
      console.error("Failed to load timeline:", err);
    } finally {
      this.setLoading(false);
      this.ensureFilled(); // 内容不足撑满面板时自动续拉，直到撑满或到底
    }
  }

  /** 统一语言判定：以思源运行语言为准，避免依赖 i18n 文案文本 */
  private getLang(): "zh_CN" | "en_US" {
    const lang =
      (window as any).siyuan?.config?.lang ||
      (this.plugin as any).app?.lang ||
      "zh_CN";
    return String(lang).startsWith("zh") ? "zh_CN" : "en_US";
  }

  private transformBlock(x: BlockData): TimelineItem {
    const lang = this.getLang();
    const { year, month, day, hours, minutes } = parseSiyuanDate(x.updated);
    const leftTime = lang === "zh_CN"
      ? `${year}年\n${month}月${day}日`
      : `${year}\n${month}/${day}`;
    const leftContent = `${hours}:${minutes}`;
    let _leftTime: string;

    if (this.seenLeftTimes.has(leftTime)) {
      this.seenLeftTimes.set(leftTime, this.seenLeftTimes.get(leftTime)! + 1);
      _leftTime = "";
    } else {
      this.seenLeftTimes.set(leftTime, 1);
      _leftTime = leftTime;
    }

    return {
      id: x.id,
      updated: x.updated,
      title: x.content,
      content: [],
      sub: (this.noteBooks.get(x.box) || "") + x.hpath,
      leftTime: _leftTime,
      leftContent,
      color: getColor(this.colorIndex++),
      friendlyTime: friendlyDate(x.updated, lang),
    };
  }

  private transformBlocks(blocks: BlockData[]): TimelineItem[] {
    return blocks.map((x) => this.transformBlock(x));
  }

  private isToday(dateStr: string): boolean {
    // 与展示文本解耦，使用稳定的 YYYYMMDD 数值键比较，避免跨语言/跨天错位
    const now = new Date();
    const todayKey =
      `${now.getFullYear()}` +
      `${String(now.getMonth() + 1).padStart(2, "0")}` +
      `${String(now.getDate()).padStart(2, "0")}`;
    const digits = dateStr.replace(/\D/g, ""); // "2026年07月26日" / "2026\n07/26" → "20260726"
    return digits.startsWith(todayKey);
  }

  private extractDateKey(item: TimelineItem): string {
    const { year, month, day } = parseSiyuanDate(item.updated);
    const lang = this.getLang();
    return lang === "zh_CN" ? `${year}年${month}月${day}日` : `${year}\n${month}/${day}`;
  }

  /**
   * 创建单张文档卡片元素（含事件绑定）。
   * 全量渲染 (renderItems) 与局部刷新 (refreshDocs) 共用，确保两套路径渲染出的卡片一致。
   * @param withAnim 是否播放入场动画（局部刷新传 false，避免单卡闪烁）
   */
  private createItemElement(item: TimelineItem, index: number, withAnim: boolean): HTMLElement {
    const el = document.createElement("div");
    el.className = "timeline-item";
    el.dataset.rootId = item.id; // 文档 root id，用于局部刷新时定位该卡片

    const contentHtml = this.buildContentHtml(item);

    el.innerHTML = `
      <div class="timeline-item__left">
        <div class="timeline-item__date">${item.leftTime.replace("\n", "<br>")}</div>
        <div class="timeline-item__time">${item.leftContent}</div>
      </div>
      <div class="timeline-item__axis">
        <div class="timeline-item__dot" style="background-color: ${item.color}"></div>
        <div class="timeline-item__line"></div>
      </div>
      <div class="timeline-item__card">
        <div class="timeline-item__title" data-id="${item.id}">${this.escapeHtml(item.title)}</div>
        ${contentHtml ? `<div class="timeline-item__content">${contentHtml}</div>` : ""}
        ${item.sub ? `
        <div class="timeline-item__meta">
          <svg class="timeline-item__path-icon" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          <span class="timeline-item__path">${this.escapeHtml(item.sub)}</span>
          <span class="timeline-item__friendly">${item.friendlyTime}</span>
        </div>
        ` : ""}
      </div>
    `;

    if (withAnim) {
      el.style.animationDelay = `${index * 40}ms`;
    } else {
      // 局部刷新：禁用入场动画，避免单卡突兀闪现
      el.style.animation = "none";
    }

    // 标题点击跳转
    const titleEl = el.querySelector(".timeline-item__title") as HTMLElement;
    titleEl.addEventListener("click", (e) => {
      this.gotoBlock(item.id, e);
    });

    // 子内容：点击跳转 + 截断控制
    const contentEls = el.querySelectorAll(
      ".timeline-item__content-line"
    ) as NodeListOf<HTMLElement>;
    contentEls.forEach((cel) => {
      this.applyTruncation(cel);

      cel.addEventListener("click", (e) => {
        const cid = cel.getAttribute("data-id");
        if (cid) this.gotoBlock(cid, e);
      });
      cel.addEventListener("mouseenter", () => {
        cel.style.display = "block";
        cel.style.overflow = "";
      });
      cel.addEventListener("mouseleave", () => {
        this.applyTruncation(cel);
      });
    });

    // 折叠展开按钮交互（功能3）
    const foldToggle = el.querySelector(".timeline-item__fold-toggle") as HTMLButtonElement | null;
    if (foldToggle) {
      foldToggle.addEventListener("click", () => {
        const folded = el.querySelector(".timeline-item__folded") as HTMLElement | null;
        if (!folded) return;
        if (foldToggle.dataset.folded === "1") {
          folded.hidden = false;
          foldToggle.dataset.folded = "0";
          foldToggle.textContent = this.ti("foldCollapse");
        } else {
          folded.hidden = true;
          foldToggle.dataset.folded = "1";
          foldToggle.textContent = this.ti("foldExpand", { n: folded.children.length });
        }
      });
    }

    return el;
  }

  private renderItems(items: TimelineItem[]) {
    const listEl = this.element.querySelector(".timeline-list") as HTMLElement;

    items.forEach((item, index) => {
      // 日期分组头
      const dateKey = this.extractDateKey(item);
      if (dateKey !== this.lastRenderedDate) {
        this.lastRenderedDate = dateKey;
        const groupEl = document.createElement("div");
        const isToday = this.isToday(dateKey);
        groupEl.className = `timeline-date-group${isToday ? " timeline-date-group--today" : ""}`;
        const lang = this.getLang();
        const todayLabel = isToday
          ? (lang === "zh_CN" ? "📍 今天" : "📍 Today")
          : dateKey.replace("\n", " ");
        groupEl.innerHTML = `
          <span class="timeline-date-group__label">${todayLabel}</span>
          <span class="timeline-date-group__line"></span>
        `;
        listEl.appendChild(groupEl);
      }

      const el = this.createItemElement(item, index, true);
      listEl.appendChild(el);
    });
  }

  /**
   * 局部刷新：仅更新指定文档对应的卡片，不重建整个列表 DOM。
   * 由 index.ts 的 ws 事件监听器在文档被编辑时调用。
   * @param rootIds 需要刷新的文档 root id 集合
   */
  async refreshDocs(rootIds: string[]): Promise<void> {
    if (this.loading) return; // 全量加载进行中，跳过（下次全量会包含最新数据）
    if (!rootIds || rootIds.length === 0) return;

    const ignoreList = this.getIgnoreList();
    const sortOrder = this.settings.contentSortOrder;
    const lang = this.getLang();
    const nowStr = this.formatNow();

    const listEl = this.element.querySelector(".timeline-list") as HTMLElement | null;
    if (!listEl) return;

    for (const rid of rootIds) {
      let idx = this.dataList.findIndex((it) => it.id === rid);
      let item: TimelineItem;

      if (idx >= 0) {
        // 已在当前列表内
        item = this.dataList[idx];
      } else {
        // 老文档：不在当前已加载列表内（置顶/插入是卡片间行为，与 contentSortOrder 无关）
        const block = await getDocById(rid);
        if (!block) continue;
        item = this.transformBlock(block);
        try {
          item.content = await getDocUpdatedContents(item.id, item.updated.slice(0, 8), sortOrder, ignoreList);
        } catch (err) {
          console.warn("[Timeline] refreshDocs content failed for", rid, err);
          item.content = [];
        }
        idx = -1; // 标记为新插入
      }

      // 已在列表的文档重新拉取最新内容
      if (idx >= 0) {
        try {
          item.content = await getDocUpdatedContents(item.id, item.updated.slice(0, 8), sortOrder, ignoreList);
        } catch (err) {
          console.warn("[Timeline] refreshDocs content failed for", rid, err);
        }
      }

      // 更新时间相关字段
      item.updated = nowStr;
      item.friendlyTime = friendlyDate(nowStr, lang);
      const { hours, minutes } = parseSiyuanDate(nowStr);
      item.leftContent = `${hours}:${minutes}`;

      const newEl = this.createItemElement(item, 0, false);

      // 置顶到「今天」组（卡片间排序由文档 updated 决定，与 contentSortOrder 无关；contentSortOrder 仅影响卡片内部更新内容排序）
      if (idx >= 0) {
        const oldEl = listEl.querySelector(`.timeline-item[data-root-id="${rid}"]`);
        if (oldEl) oldEl.remove();
        this.dataList.splice(idx, 1);
      }
      item.leftTime = ""; // 由「今天」组头承载日期语义，卡片自身不重复显示
      const todayGroup = this.ensureTodayGroup(listEl);
      this.dataList.unshift(item);
      todayGroup.after(newEl); // 插到今天组头之后（置顶）
      this.cleanupEmptyGroups(listEl);
    }
  }

  /** 生成思源日期格式 YYYYMMDDHHMMSS（本地时区，与思源 updated 字段一致） */
  private formatNow(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return (
      `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
      `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
    );
  }

  /** 确保列表顶部存在「今天」日期组头，返回该组头元素 */
  private ensureTodayGroup(listEl: HTMLElement): HTMLElement {
    let g = listEl.querySelector(".timeline-date-group--today") as HTMLElement | null;
    if (!g) {
      g = document.createElement("div");
      g.className = "timeline-date-group timeline-date-group--today";
      const lang = this.getLang();
      const label = lang === "zh_CN" ? "📍 今天" : "📍 Today";
      g.innerHTML = `<span class="timeline-date-group__label">${label}</span><span class="timeline-date-group__line"></span>`;
      listEl.prepend(g);
    }
    return g;
  }

  /** 移除因卡片移走而变空的日期组头 */
  private cleanupEmptyGroups(listEl: HTMLElement): void {
    const groups = Array.from(listEl.querySelectorAll(".timeline-date-group"));
    for (const g of groups) {
      let n = g.nextElementSibling;
      let hasCard = false;
      while (n && !n.classList.contains("timeline-date-group")) {
        if (n.classList.contains("timeline-item")) { hasCard = true; break; }
        n = n.nextElementSibling;
      }
      if (!hasCard) g.remove();
    }
  }

  /**
   * 构建卡片内容区 HTML（功能3 折叠逻辑）
   * - mode=hide 或无内容：返回空（不渲染内容区）
   * - mode=fold 且超出条目数：显示前 N 条，其余折叠并提供展开按钮
   * - 其他情况：显示全部
   */
  private buildContentHtml(item: TimelineItem): string {
    const mode = this.settings.contentFoldMode;
    if (mode === "hide" || item.content.length === 0) return "";

    const lineHtml = (c: ContentItem) =>
      `<div class="timeline-item__content-line" data-id="${this.escapeHtml(c.id)}">${this.sanitizeHtml(c.html) || this.escapeHtml(c.text)}</div>`;

    if (mode === "fold" && this.settings.contentFoldCount > 0 && item.content.length > this.settings.contentFoldCount) {
      const count = this.settings.contentFoldCount;
      const shown = item.content.slice(0, count).map(lineHtml).join("");
      const rest = item.content.slice(count).map(lineHtml).join("");
      const expandLabel = this.ti("foldExpand", { n: item.content.length - count });
      return shown +
        `<div class="timeline-item__folded" hidden>${rest}</div>` +
        `<button class="timeline-item__fold-toggle" type="button" data-folded="1">${expandLabel}</button>`;
    }

    return item.content.map(lineHtml).join("");
  }

  /** 读取 i18n 文案并替换 {占位符} */
  private ti(key: string, params?: Record<string, string | number>): string {
    let t = (this.plugin.i18n as any)[key] ?? key;
    if (params) {
      for (const k in params) {
        t = t.replace(new RegExp("\\{" + k + "\\}", "g"), String(params[k]));
      }
    }
    return t;
  }

  private gotoBlock(id: string, event?: Event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const isMobile = getFrontend().endsWith("mobile");
    if (isMobile) {
      window.open(`siyuan://blocks/${id}`);
      return;
    }

    if (this.settings.jumpMethod === "siyuanLink") {
      // 思源链接方式：通过 window.open 触发 siyuan:// 协议
      window.open(`siyuan://blocks/${id}`);
    } else {
      // openTab API 方式：毫秒级跳转，支持用户配置 zoomIn 开关
      openTab({
        app: this.plugin.app,
        doc: {
          id,
          zoomIn: this.settings.zoomIn,
          ...(this.settings.zoomIn ? {} : { action: ["cb-get-scroll"] }),
        },
      });
    }
  }

  private setLoading(show: boolean) {
    this.loading = show;
    const loadingEl = this.element.querySelector(
      ".timeline-loading"
    ) as HTMLElement;
    if (loadingEl) {
      loadingEl.style.display = show ? "flex" : "none";
    }
  }

  private escapeHtml(text: string): string {
    this.escapeDiv.textContent = text;
    return this.escapeDiv.innerHTML;
  }

  /** 白名单 sanitize：仅保留安全标签，剥离 script/iframe/object/embed 及所有 on* 属性与危险协议 */
  private sanitizeHtml(html: string): string {
    if (!html) return "";
    const allowed = new Set([
      "P", "BR", "STRONG", "B", "EM", "I", "CODE", "PRE", "UL", "OL", "LI",
      "A", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "SPAN", "DIV",
      "IMG", "TABLE", "THEAD", "TBODY", "TR", "TD", "TH", "HR",
    ]);
    const doc = new DOMParser().parseFromString(html, "text/html");
    const walk = (node: Element) => {
      Array.from(node.children).forEach((child) => {
        if (!allowed.has(child.tagName)) {
          child.replaceWith(...Array.from(child.childNodes)); // 去标签保留内容
          return;
        }
        Array.from(child.attributes).forEach((attr) => {
          const name = attr.name.toLowerCase();
          if (name.startsWith("on")) child.removeAttribute(attr.name);
          if (name === "href" || name === "src") {
            const v = attr.value.toLowerCase();
            if (v.startsWith("javascript:") || v.startsWith("data:text/html"))
              child.removeAttribute(attr.name);
          }
        });
        walk(child);
      });
    };
    walk(doc.body);
    return doc.body.innerHTML;
  }
}
