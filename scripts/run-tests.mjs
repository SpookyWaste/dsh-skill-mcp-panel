// 跑仓库根目录下所有 test-*.mjs，逐个用当前 Node 进程执行并汇总结果。
// 存在的意义：本地与 CI 共用一条入口（npm test），不依赖任何 shell 的 glob 语义。
// 子套件用 stdio 继承，输出直接进终端/CI 日志，不经管道中转。
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const suites = readdirSync(root)
  .filter((name) => name.startsWith("test-") && name.endsWith(".mjs"))
  .sort();

if (suites.length === 0) {
  console.error("run-tests: 仓库根目录下没有找到任何 test-*.mjs");
  process.exit(1);
}

const failed = [];
for (const suite of suites) {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL(`../${suite}`, import.meta.url))], {
    stdio: "inherit",
  });
  const ok = result.status === 0;
  if (!ok) failed.push(suite);
  console.log(`${ok ? "ok  " : "FAIL"}  ${suite}`);
}

console.log(`\n${suites.length - failed.length}/${suites.length} 套件通过`);
if (failed.length > 0) {
  console.error(`失败：${failed.join(", ")}`);
  process.exit(1);
}