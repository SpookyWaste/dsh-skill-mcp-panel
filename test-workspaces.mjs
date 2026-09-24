/**
 * test-workspaces.mjs —— 工作区作用域条目的归并（foldWorkspaces）。
 *
 * 覆盖那次真实现象：仓库根工作区（有 .git）与它的子目录工作区（无 .git）解析到
 * 同一个项目根，于是面板只能给出一条作用域，其余工作区的名字进 `aliases`；
 * 以及显示名必须只取决于集合内容、与注册表返回顺序无关。
 */
import { foldWorkspaces } from "./lib/workspaces.js";

let passed = 0;
let failed = 0;
function check(cond, label) {
  if (cond) {
    passed += 1;
    console.log("PASS  " + label);
  } else {
    failed += 1;
    console.log("FAIL  " + label);
  }
}

const PAPER = "D:\\Pi\\Paper";
const QUANTUM = "D:\\Pi\\Paper\\Quantum";
const byPath = (list, path) => list.find((entry) => entry.path === path);

// 1. 嵌套工作区折叠：Paper 拥有项目根，Quantum 被并入
const rows = [
  { project: PAPER, path: PAPER, title: "Paper", sessions: 22 },
  { project: PAPER, path: QUANTUM, title: "Quantum", sessions: 3 },
  { project: "D:\\Pi\\ComfyUI", path: "D:\\Pi\\ComfyUI", title: "ComfyUI", sessions: 19 },
  { project: "D:\\Pi\\dsh_plugins", path: "D:\\Pi\\dsh_plugins", title: "dsh_plugins", sessions: 1 }
];
const folded = foldWorkspaces(rows);
check(folded.length === 3, "4 个工作区折叠成 3 条作用域");
check(byPath(folded, PAPER).label === "Paper", "显示名取拥有项目根的那条工作区");
check(JSON.stringify(byPath(folded, PAPER).aliases) === JSON.stringify(["Quantum"]), "被并入的 Quantum 进 aliases");
check(byPath(folded, PAPER).sessions === 25, "sessions 是该作用域下全部来源之和");
check(folded.map((entry) => entry.label).join(",") === "ComfyUI,dsh_plugins,Paper", "按显示名排序");
check(byPath(folded, PAPER).aliases.length === 1 && byPath(folded, "D:\\Pi\\ComfyUI").aliases.length === 0, "没有并发的根 aliases 为空");

// 2. 顺序无关：早先「谁先到谁当显示名」会让同一份数据换个顺序就改名
const reversed = foldWorkspaces([...rows].reverse());
check(byPath(reversed, PAPER).label === "Paper", "倒序输入下显示名不变");
check(JSON.stringify(byPath(reversed, PAPER).aliases) === JSON.stringify(["Quantum"]), "倒序输入下 aliases 不变");

// 3. 会话 cwd 来源：没有标题，不该进 aliases，但要计入 sessions
const withSession = foldWorkspaces([...rows, { project: PAPER, path: QUANTUM, sessions: 1 }]);
check(JSON.stringify(byPath(withSession, PAPER).aliases) === JSON.stringify(["Quantum"]), "会话来源不会重复计入 aliases");
check(byPath(withSession, PAPER).sessions === 26, "会话来源计入 sessions");

// 4. 只有会话 cwd 发现的项目根：自己的条目、文件夹名、空 aliases
const sessionOnly = foldWorkspaces([{ project: "D:\\tmp-ws", path: "D:\\tmp-ws", sessions: 1 }]);
check(
  sessionOnly.length === 1 && sessionOnly[0].label === "tmp-ws" && sessionOnly[0].aliases.length === 0,
  "纯会话来源用文件夹名且没有别名"
);

// 5. 只登记了子目录工作区、根上没有任何工作区：显示名仍命名项目根（文件夹名），
//    其余工作区全部进 aliases
const nestedOnly = [
  { project: "D:\\repo", path: "D:\\repo\\sub", title: "Sub", sessions: 2 },
  { project: "D:\\repo", path: "D:\\repo\\other", title: "Other", sessions: 5 }
];
const picked = foldWorkspaces(nestedOnly);
check(picked.length === 1 && picked[0].label === "repo", "根上没有工作区时用项目根的文件夹名");
check(JSON.stringify(picked[0].aliases) === JSON.stringify(["Other", "Sub"]), "该根下的工作区全部进 aliases");

// 5b. 关键回归：根工作区没登记时，显示名不能因为「有个会话 cwd 正好落在根上」而改变
//     （conversation cwd 只用来发现新的根，不参与命名）
const quantumOnly = [{ project: PAPER, path: QUANTUM, title: "Quantum", sessions: 3 }];
const withRootSession = [...quantumOnly, { project: PAPER, path: PAPER, sessions: 1 }];
const withoutSession = foldWorkspaces(quantumOnly);
const foldedWithRootSession = foldWorkspaces(withRootSession);
check(
  withoutSession[0].label === "Paper" && JSON.stringify(withoutSession[0].aliases) === JSON.stringify(["Quantum"]),
  "只登记 Quantum 时显示名为项目根 Paper，Quantum 作别名"
);
check(
  foldedWithRootSession[0].label === withoutSession[0].label && JSON.stringify(foldedWithRootSession[0].aliases) === JSON.stringify(withoutSession[0].aliases),
  "根上出现会话 cwd 也不改变显示名（同输入同输出）"
);
check(foldedWithRootSession[0].sessions === 4, "会话来源仍计入 sessions");

// 6. 同名去重与排序
const dup = foldWorkspaces([
  { project: "D:\\r", path: "D:\\r", title: "Root", sessions: 0 },
  { project: "D:\\r", path: "D:\\r\\b", title: "Beta", sessions: 0 },
  { project: "D:\\r", path: "D:\\r\\a", title: "Alpha", sessions: 0 },
  { project: "D:\\r", path: "D:\\r\\b2", title: "Beta", sessions: 0 }
]);
check(JSON.stringify(dup[0].aliases) === JSON.stringify(["Alpha", "Beta"]), "aliases 去重并按名排序");

// 7. 路径大小写：Windows 上必须折叠成同一条
if (process.platform === "win32") {
  const cased = foldWorkspaces([
    { project: "D:\\Pi\\Paper", path: "D:\\Pi\\Paper", title: "Paper", sessions: 1 },
    { project: "d:\\pi\\paper", path: "D:\\Pi\\Paper\\Quantum", title: "Quantum", sessions: 1 }
  ]);
  check(cased.length === 1 && cased[0].aliases.length === 1, "同一路径的大小写差异折叠为一条");
}

// 8. 空输入
check(foldWorkspaces([]).length === 0, "空输入返回空列表");

console.log("\n" + passed + " passed, " + failed + " failed");
if (failed > 0) process.exit(1);
console.log("ALL WORKSPACE FOLD TESTS PASSED");