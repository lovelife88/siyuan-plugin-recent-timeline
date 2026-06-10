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
  const stmt = `SELECT * FROM blocks WHERE type = 'd' ORDER BY updated DESC LIMIT ? OFFSET ?`;
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

export async function getDocUpdatedContents(
  rootId: string,
  updatedDate: string,
  sortOrder: ContentSortOrder = "updated",
  ignoreList: string[] = []
): Promise<ContentItem[]> {
  // 按更新时间排：b.updated DESC；按文档顺序排：display_sort ASC, display_id_for_sort ASC
  // sort 是思源 blocks 表的排序字段，数值越小越靠前（文档块=0, 标题=5, 段落=10, 列表项=20）
  const orderClause = sortOrder === "document"
    ? `ORDER BY display_sort ASC, display_id_for_sort ASC`
    : `ORDER BY b.updated DESC`;

  const stmt = `
    SELECT
      CASE WHEN p.id IS NULL OR p.type NOT IN ('i', 'l', 'o') THEN b.id ELSE p.id END AS display_id,
      CASE WHEN p.id IS NULL OR p.type NOT IN ('i', 'l', 'o') THEN b.content ELSE p.content END AS display_content,
      CASE WHEN p.id IS NULL OR p.type NOT IN ('i', 'l', 'o') THEN b.markdown ELSE p.markdown END AS display_markdown,
      CASE WHEN p.id IS NULL OR p.type NOT IN ('i', 'l', 'o') THEN b.sort ELSE p.sort END AS display_sort,
      CASE WHEN p.id IS NULL OR p.type NOT IN ('i', 'l', 'o') THEN b.id ELSE p.id END AS display_id_for_sort,
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
  const secs = Math.floor(diff);

  if (years > 0) { diffType = "year"; diffValue = years; }
  else if (months > 0) { diffType = "month"; diffValue = months; }
  else if (days > 0) { diffType = "day"; diffValue = days; }
  else if (hrs > 0) { diffType = "hour"; diffValue = hrs; }
  else if (mins > 0) { diffType = "minute"; diffValue = mins; }
  else { diffType = "second"; diffValue = secs === 0 ? 1 : secs; }

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
