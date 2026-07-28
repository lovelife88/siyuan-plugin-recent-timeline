/**
 * 思源笔记内核 API 封装
 *
 * 展示逻辑：
 *   - 一个卡片 = 一个文档（标题为文档标题）
 *   - 卡片内容 = 该文档当天更新的段落
 *     - 如果段落的父节点是文档(d) → 展示段落本身
 *     - 如果段落的父节点是容器块(i/l/o/b/h 等) → 展示父容器块
 *   - 按 display_id 去重，同一容器只显示一次
 */

/// <reference types="siyuan" />

const COLORS = [
  "#11998e", "#5da748", "#e74c3c", "#3498db", "#9b59b6",
  "#f39c12", "#1abc9c", "#e67e22", "#2ecc71", "#e91e63",
];

export interface BlockData {
  id: string;
  updated: string;
  content: string;
  box: string;
  hpath: string;
  root_id: string;
}

export interface TimelineItem {
  id: string;
  updated: string;
  title: string;
  content: ContentItem[];
  sub: string;
  leftTime: string;
  leftContent: string;
  color: string;
  friendlyTime: string;
}

export interface ContentItem {
  text: string;
  markdown: string;
  html: string;
  id: string;
}

// ============ 内核 API 调用 ============

async function sql(stmt: string, args?: (string | number)[]): Promise<any[]> {
  // Replace ? placeholders with escaped values (防 SQL 注入)
  let query = stmt;
  if (args && args.length > 0) {
    let i = 0;
    query = stmt.replace(/\?/g, () => {
      const val = args[i++];
      if (typeof val === "string") {
        return "'" + val.replace(/'/g, "''") + "'";
      }
      return String(val);
    });
  }
  const result = await fetch("/api/query/sql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stmt: query }),
  });
  const json = await result.json();
  if (json.code !== 0) {
    console.error("SQL query error:", json.msg);
    return [];
  }
  return json.data;
}

/**
 * 获取笔记本列表
 */
export async function getNotebooks(): Promise<Map<string, string>> {
  const result = await fetch("/api/notebook/lsNotebooks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  const json = await result.json();
  const map = new Map<string, string>();
  if (json.code === 0 && json.data?.notebooks) {
    for (const nb of json.data.notebooks) {
      map.set(nb.id, nb.name);
    }
  }
  return map;
}

/**
 * 获取最近更新的文档列表
 */
export async function getRecentDocs(
  offset: number,
  limit: number
): Promise<BlockData[]> {
  const stmt = `SELECT id, updated, content, box, hpath, root_id FROM blocks WHERE type = 'd' ORDER BY updated DESC LIMIT ? OFFSET ?`;
  return sql(stmt, [limit, offset]);
}

/** 使用思源内置 Lute 引擎将 Markdown 渲染为 HTML */
function renderMarkdown(md: string): string {
  try {
    const Lute = (window as any).Lute;
    if (Lute) {
      const lute = Lute.New();
      const html = lute.Md2HTML(md);
      if (html) {
        // Md2HTML 返回完整 HTML 文档，提取 <p> 内容
        const match = html.match(/<p[^>]*>([\s\S]*?)<\/p>/);
        if (match) {
          return match[1];
        }
        // 如果没有 <p> 包裹（如列表/标题），提取 <body> 内容
        const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/);
        if (bodyMatch) {
          return bodyMatch[1].trim();
        }
        return html;
      }
    }
  } catch (e) {
    console.warn("[Timeline] Lute render failed, fallback to plain text:", e);
  }
  const div = document.createElement("div");
  div.textContent = md;
  return div.innerHTML;
}

/**
 * 获取某文档在某天内更新的内容
 *
 * 核心逻辑：
 *   查询所有有更新的段落(type='p')，JOIN 父节点
 *   - 父节点是文档(d) → 展示段落本身
 *   - 父节点是容器块(i/l/o/b/h 等) → 展示父容器块
 *   按 display_id 去重
 */
/** 排序方式 */
export type ContentSortOrder = "updated" | "document";

// 文档内块顺序映射缓存：blockId -> 文档顺序索引（基于 DOM 顺序，与思源内核渲染一致）
const docOrderCache = new Map<string, Map<string, number>>();

/** 清空文档顺序缓存（每次刷新前调用，确保顺序与最新文档结构一致） */
export function clearDocOrderCache(): void {
  docOrderCache.clear();
}

/**
 * 获取文档内块的文档顺序映射（blockId -> 顺序索引，从上到下递增）。
 * 通过 /api/block/getBlockDOM 获取根文档 DOM，解析其中 [data-node-id] 的出现顺序，
 * 该顺序与思源内核渲染及官方 Task 排序（taskSortShared.buildLiveTaskDomOrderMap）一致，
 * 精确反映文档物理顺序，优于纯 SQL 近似（display_sort 字段不存在，ORDER BY path/id 对插入/移动块会错位）。
 */
async function getDocBlockOrder(rootId: string): Promise<Map<string, number>> {
  const cached = docOrderCache.get(rootId);
  if (cached) return cached;
  const orderMap = new Map<string, number>();
  try {
    const res = await fetch("/api/block/getBlockDOM", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: rootId }),
    });
    const json = await res.json();
    if (json.code === 0 && json.data && json.data.dom) {
      const doc = new DOMParser().parseFromString(json.data.dom, "text/html");
      const nodes = doc.querySelectorAll("[data-node-id]");
      nodes.forEach((node, index) => {
        const id = node.getAttribute("data-node-id");
        if (id) orderMap.set(id, index);
      });
    }
  } catch (e) {
    console.warn("[Timeline] getDocBlockOrder failed for", rootId, e);
  }
  docOrderCache.set(rootId, orderMap);
  return orderMap;
}

export async function getDocUpdatedContents(
  rootId: string,
  updatedDate: string,
  sortOrder: ContentSortOrder = "updated",
  ignoreList: string[] = []
): Promise<ContentItem[]> {
  // 按更新时间排：b.updated DESC；按文档顺序排：不在 SQL 层排序，
  // 取数后在 JS 层用 getDocBlockOrder 的 DOM 顺序映射排序（精确、与内核一致）
  const orderClause = sortOrder === "document" ? "" : `ORDER BY b.updated DESC`;

  const stmt = `
    SELECT
      CASE WHEN p.id IS NULL OR p.type NOT IN ('i', 'l', 'o') THEN b.id ELSE p.id END AS display_id,
      CASE WHEN p.id IS NULL OR p.type NOT IN ('i', 'l', 'o') THEN b.content ELSE p.content END AS display_content,
      CASE WHEN p.id IS NULL OR p.type NOT IN ('i', 'l', 'o') THEN b.markdown ELSE p.markdown END AS display_markdown,
      CASE WHEN p.id IS NULL THEN 'd' ELSE p.type END AS parent_type
    FROM blocks AS b
    LEFT JOIN blocks AS p ON b.parent_id = p.id
    WHERE b.root_id = ?
      AND b.type IN ('p', 'h', 'c', 'm', 't', 'html')
      AND b.updated >= ?
      AND b.updated <= ?
    ${orderClause}
  `;

  const data = await sql(stmt, [rootId, `${updatedDate}000000`, `${updatedDate}235959`]);

  // 按 display_id 去重，保留第一个（文档顺序模式下即文档中最早出现的位置）
  const seen = new Set<string>();
  const result: ContentItem[] = [];

  for (const item of data) {
    const did = item.display_id;
    if (seen.has(did)) continue;
    seen.add(did);

    if (item.display_content && item.display_content.length > 0) {
      // 忽略内容过滤：去除标记/空白后与忽略列表完全匹配则跳过
      const plainContent = removeURL(item.display_content).trim();
      if (ignoreList.length > 0 && ignoreList.includes(plainContent)) continue;

      const md = item.display_markdown || item.display_content;
      result.push({
        text: removeURL(item.display_content),
        markdown: md,
        html: renderMarkdown(md),
        id: did,
      });
    }
  }

  // 按文档顺序排序：基于文档内块的 DOM 顺序映射，与思源内核渲染顺序一致
  if (sortOrder === "document" && result.length > 0) {
    const orderMap = await getDocBlockOrder(rootId);
    result.sort((a, b) => {
      const oa = orderMap.has(a.id) ? orderMap.get(a.id)! : Number.MAX_SAFE_INTEGER;
      const ob = orderMap.has(b.id) ? orderMap.get(b.id)! : Number.MAX_SAFE_INTEGER;
      return oa - ob;
    });
  }

  return result;
}

/**
 * 批量填充文档的更新内容
 */
export async function fillDocUpdatedContents(
  dataList: TimelineItem[],
  indexStart: number,
  sortOrder: ContentSortOrder = "updated",
  ignoreList: string[] = []
): Promise<void> {
  const promises = [];
  for (let i = indexStart; i < dataList.length; i++) {
    const item = dataList[i];
    const updatedDate = item.updated.slice(0, 8);
    promises.push(
      getDocUpdatedContents(item.id, updatedDate, sortOrder, ignoreList).then((contents) => {
        dataList[i].content = contents;
      })
    );
  }
  await Promise.all(promises);
}

// ============ 工具函数 ============

/**
 * 友好时间格式（如 "3小时前"）
 * @param dateString 思源日期字符串
 * @param lang 语言代码，'zh_CN' 使用中文，其他使用英文
 */
export function friendlyDate(dateString: string, lang: string = "zh_CN"): string {
  const now = new Date();
  const year = parseInt(dateString.slice(0, 4));
  const month = parseInt(dateString.slice(4, 6)) - 1;
  const day = parseInt(dateString.slice(6, 8));
  const hours = parseInt(dateString.slice(8, 10));
  const minutes = parseInt(dateString.slice(10, 12));
  const seconds = parseInt(dateString.slice(12, 14));
  const target = new Date(year, month, day, hours, minutes, seconds);

  const diff = (now.getTime() - target.getTime()) / 1000;

  const isZh = lang === "zh_CN";
  const formats: Record<string, string> = isZh
    ? { second: "%n% 秒前", minute: "%n% 分钟前", hour: "%n% 小时前", day: "%n% 天前", month: "%n% 月前", year: "%n% 年前" }
    : { second: "%n% sec ago", minute: "%n% min ago", hour: "%n% hr ago", day: "%n% day ago", month: "%n% mo ago", year: "%n% yr ago" };

  let diffType = "second";
  let diffValue = 0;

  const years = Math.floor(diff / (365 * 24 * 3600));
  const months = Math.floor(diff / (30 * 24 * 3600));
  const days = Math.floor(diff / (24 * 3600));
  const hrs = Math.floor(diff / 3600);
  const mins = Math.floor(diff / 60);
  const totalSecs = Math.floor(diff);

  if (years > 0) { diffType = "year"; diffValue = years; }
  else if (months > 0) { diffType = "month"; diffValue = months; }
  else if (days > 0) { diffType = "day"; diffValue = days; }
  else if (hrs > 0) { diffType = "hour"; diffValue = hrs; }
  else if (mins > 0) { diffType = "minute"; diffValue = mins; }
  else { diffType = "second"; diffValue = totalSecs === 0 ? 1 : totalSecs; }

  // 英文复数处理
  if (!isZh && diffValue > 1 && diffType !== "hour") {
    const pluralMap: Record<string, string> = {
      second: "secs", minute: "mins", day: "days", month: "mos", year: "yrs",
    };
    formats[diffType] = `%n% ${pluralMap[diffType] || formats[diffType].split(" ")[1]} ago`;
  }

  return formats[diffType].replace("%n%", String(diffValue));
}

/**
 * 解析思源日期字符串
 */
export function parseSiyuanDate(dateString: string): {
  year: string;
  month: string;
  day: string;
  hours: string;
  minutes: string;
  seconds: string;
} {
  return {
    year: dateString.slice(0, 4),
    month: dateString.slice(4, 6),
    day: dateString.slice(6, 8),
    hours: dateString.slice(8, 10),
    minutes: dateString.slice(10, 12),
    seconds: dateString.slice(12, 14),
  };
}

/**
 * 移除思源内部链接
 */
export function removeURL(text: string): string {
  return text.replace(
    /siyuan:\/\/blocks\/[a-zA-Z0-9-]{22}(\?focus=[01])?/g,
    ""
  );
}

/**
 * 获取时间线颜色
 */
export function getColor(index: number): string {
  return COLORS[index % COLORS.length];
}
