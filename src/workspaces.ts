/**
 * dsh-skill-mcp-panel —— 工作区作用域条目的归并（纯函数：无 ctx、无文件系统）。
 *
 * 作用域的单位是**项目根**——向上找最近的含 `.git` 的祖先，一个都没有就退回
 * 目录自己。这不是本插件的发明，而是技能提供方
 * `@deepseek-ai/dsh-skill-filesystem` 读 `<root>/.dsh/skills` 的口径，本插件读
 * `<root>/.dsh/mcp.json` 时沿用同一口径。
 *
 * 因此同一项目根下的多个 DSH 工作区在磁盘上**共用一份声明**：例如
 * `D:\Pi\Paper`（仓库根，有 `.git`）与其子目录工作区 `D:\Pi\Paper\Quantum`
 * （无 `.git`，向上走到 Paper 才停）解析到同一个根。面板只能、也只该给出一条
 * 作用域。
 *
 * 这一条作用域的显示名永远命名**项目根**：根上有登记的工作区（路径正好等于项目
 * 根的那条）就用它的标题，否则用根的文件夹名——声明文件就在那里，名与位对齐。
 * 该根下其余工作区的名字进 `aliases`，由 UI 折叠成计数徽标（`Paper +1`）与悬停
 * 明细。
 *
 * 三个不变量：
 *   1. 显示名与遍历顺序无关。注册表 `list()` 的返回顺序不是契约，早先「谁先到
 *      谁当显示名」的写法会让同一份数据在不同顺序下显示成 `Paper` 或 `Quantum`。
 *   2. 显示名与会话无关。只有工作区能承担显示名；会话 cwd 只用来发现新的根，
 *      否则同一个作用域会随会话开合在 `Quantum` 与 `Paper` 之间改名。
 *   3. `aliases` 只收 DSH 工作区标题。会话 cwd 也会带来新的项目根，但它不是
 *      工作区、也没有名字，不该出现在「被并入的工作区」里。
 */
import { basename } from "node:path";

/** 归并输入：一条已解析到项目根的来源（一个 DSH 工作区，或某个会话的 cwd）。 */
export interface WorkspaceRow {
  /** 解析后的项目根，即作用域键。 */
  project: string;
  /** 来源路径本身（工作区路径或会话 cwd）。 */
  path: string;
  /** DSH 工作区标题；会话 cwd 来源没有标题。 */
  title?: string;
  /** 归属该来源的会话数。 */
  sessions: number;
}

/** 归并输出：一条作用域条目，也是 `workspaces` 远程方法的 wire 形状。 */
export interface WorkspaceEntry {
  /** 项目根（作用域键）。 */
  path: string;
  /** 拥有该根的工作区名，取不到标题时退回文件夹名。 */
  label: string;
  /** 与该根共用一份声明的其他工作区名，已去重并按名排序。 */
  aliases: string[];
  /** 该作用域下全部来源的会话数之和。 */
  sessions: number;
}

/** 路径比较键：Windows 上大小写不敏感。 */
function keyOf(path: string): string {
  return process.platform === "win32" ? path.toLowerCase() : path;
}

/** 一条来源的标题；会话 cwd 来源没有标题。 */
function titleOf(row: WorkspaceRow): string | undefined {
  return row.title !== undefined && row.title !== "" ? row.title : undefined;
}

/** 一条来源的显示名，仅用于「同一路径被重复登记」时的稳定排序。 */
function sortNameOf(row: WorkspaceRow): string {
  return titleOf(row) ?? (basename(row.path) || row.path);
}

/**
 * 该根上「拥有显示名」的工作区：**有标题**且路径正好等于项目根的那条。
 *
 * 必须限定「有标题」，否则会话 cwd 带来的无标题来源会顶掉工作区名——那样同一
 * 个作用域的芯片会随会话开合在 `Quantum` 与 `Paper` 之间改名。没有这样的工作区
 * 时返回 undefined，由调用方用项目根的文件夹名兜底：显示名永远命名**项目根**，
 * 因为声明文件就在那里。
 *
 * @param members - 同一项目根的全部来源，至少一条。
 * @param project - 该组的项目根。
 * @returns 承担显示名的工作区来源；根上没有登记工作区时为 undefined。
 */
function owningWorkspace(members: WorkspaceRow[], project: string): WorkspaceRow | undefined {
  const atRoot = members.filter((member) => keyOf(member.path) === keyOf(project) && titleOf(member) !== undefined);
  if (atRoot.length === 0) return undefined;
  return [...atRoot].sort((a, b) => sortNameOf(a).localeCompare(sortNameOf(b)) || a.path.localeCompare(b.path))[0];
}

/**
 * 把来源折叠成互不相同的项目根：一条根一个条目，附上被并入的工作区名。
 *
 * @param rows - 全部已知来源（含重复的项目根）。
 * @returns 按显示名排序的条目；顺序即面板横栏的芯片顺序。
 */
export function foldWorkspaces(rows: WorkspaceRow[]): WorkspaceEntry[] {
  const groups = new Map<string, WorkspaceRow[]>();
  for (const row of rows) {
    const key = keyOf(row.project);
    const bucket = groups.get(key);
    if (bucket === undefined) groups.set(key, [row]);
    else bucket.push(row);
  }

  const entries: WorkspaceEntry[] = [];
  for (const members of groups.values()) {
    const project = members[0].project;
    // 显示名永远命名项目根：根上有登记的工作区就用它的标题，没有就用文件夹名。
    const owner = owningWorkspace(members, project);
    const label = (owner === undefined ? undefined : titleOf(owner)) ?? (basename(project) || project);
    // 别名 = 该根下全部工作区标题（含嵌套子工作区），去掉与显示名重名的那条。
    const titles = new Set<string>();
    for (const member of members) {
      const title = titleOf(member);
      if (title !== undefined && title !== label) titles.add(title);
    }
    entries.push({
      path: project,
      label,
      aliases: [...titles].sort((a, b) => a.localeCompare(b)),
      sessions: members.reduce((total, member) => total + member.sessions, 0)
    });
  }

  return entries.sort((a, b) => a.label.localeCompare(b.label) || a.path.localeCompare(b.path));
}