import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

let passed = 0;
function pass(name) {
  passed += 1;
  console.log("PASS  " + name);
}

/**
 * 最小 stdio MCP 服务器，供 `mcp test --workspace` 探活：把解析出来的环境变量
 * 回显在工具描述里，用来证明 CLI 确实把 envKey 的值并进了子进程环境。
 */
const FIXTURE_SOURCE = `let buf = "";
process.stdin.on("data", (chunk) => {
  buf += chunk.toString("utf8");
  let index;
  while ((index = buf.indexOf("\\n")) >= 0) {
    const line = buf.slice(0, index).trim();
    buf = buf.slice(index + 1);
    if (line === "") continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      continue;
    }
    if (message.id === undefined) continue;
    const send = (result) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: message.id, result }) + "\\n");
    if (message.method === "initialize") send({ protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "fixture", version: "1.0.0" } });
    else if (message.method === "tools/list") send({ tools: [{ name: "token", description: "PROBE_TOKEN=" + String(process.env.PROBE_TOKEN ?? "<unset>"), inputSchema: { type: "object", properties: {} } }] });
    else process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "not found" } }) + "\\n");
  }
});
`;

const dir = await mkdtemp(join(tmpdir(), "dsh-panel-cli-"));
try {
  const profileDir = join(dir, "profiles", "test");
  await mkdir(profileDir, { recursive: true });
  const patchPath = join(profileDir, "cordis.patch.yml");
  await writeFile(patchPath, "[]\n");
  // 工作区命令的全局同名检查读的是 `--profile`（默认 web）那一层的 patch，
  // 所以临时 DSH_HOME 也要有 web 层——真实机器上每个 profile 都有这个文件。
  const webProfileDir = join(dir, "profiles", "web");
  await mkdir(webProfileDir, { recursive: true });
  await writeFile(join(webProfileDir, "cordis.patch.yml"), "[]\n");
  const cli = fileURLToPath(new URL("./lib/cli.js", import.meta.url));
  const run = (args, extraEnv = {}) => spawnSync(process.execPath, [cli, ...args], {
    cwd: dir,
    env: { ...process.env, DSH_HOME: dir, ...extraEnv },
    encoding: "utf8"
  });

  const add = run(["mcp", "add", "--name", "demo", "--stdio", "--command", "node", "--args", "-e", "--profile", "test"]);
  assert.equal(add.status, 0, add.stderr);
  const patch1 = await readFile(patchPath, "utf8");
  assert.match(patch1, /panel-mcp-demo/);
  assert.match(patch1, /command: node/);
  pass("dsh-panel mcp add writes managed row");

  const list1 = run(["mcp", "list", "--profile", "test"]);
  assert.equal(list1.status, 0, list1.stderr);
  assert.match(list1.stdout, /启用\s+demo/);
  pass("dsh-panel mcp list shows managed row");

  const disable = run(["mcp", "disable", "demo", "--profile", "test"]);
  assert.equal(disable.status, 0, disable.stderr);
  const patch2 = await readFile(patchPath, "utf8");
  assert.match(patch2, /disabled: true/);
  pass("dsh-panel mcp disable toggles disabled row");

  const enable = run(["mcp", "enable", "demo", "--profile", "test"]);
  assert.equal(enable.status, 0, enable.stderr);
  pass("dsh-panel mcp enable restores row");

  const remove = run(["mcp", "remove", "demo", "--yes", "--profile", "test"]);
  assert.equal(remove.status, 0, remove.stderr);
  const patch3 = await readFile(patchPath, "utf8");
  assert.equal(patch3.includes("panel-mcp-demo"), false);
  assert.match(patch3, /\[\]/);
  pass("dsh-panel mcp remove restores valid empty patch");

  const list2 = run(["mcp", "list", "--profile", "test"]);
  assert.equal(list2.status, 0, list2.stderr);
  assert.match(list2.stdout, /没有 MCP 服务器/);
  pass("dsh-panel mcp list empty state");

  // ── 工作区作用域（<项目根>/.dsh/mcp.json）──────────────────────────────
  const ws = join(dir, "ws");
  await mkdir(join(ws, ".git"), { recursive: true });
  const wsFile = join(ws, ".dsh", "mcp.json");
  const wsText = () => readFile(wsFile, "utf8");

  const addWs = run(["mcp", "add", "--workspace", ws, "--name", "ws-demo", "--stdio", "--command", "node", "--args", "s.js", "--env-key", "MY_TOKEN"]);
  assert.equal(addWs.status, 0, addWs.stderr);
  const wsDoc = JSON.parse(await wsText());
  assert.deepEqual(wsDoc.servers.map((item) => item.serverName), ["ws-demo"]);
  assert.deepEqual(wsDoc.servers[0].envKeys, ["MY_TOKEN"]);
  assert.equal(/"env"\s*:/.test(await wsText()), false, "工作区文件里不得出现值字段");
  pass("dsh-panel mcp add --workspace writes the declaration file with key names only");

  const addHttp = run(["mcp", "add", "--workspace", ws, "--name", "ws-http", "--http", "--url", "https://example.com/mcp", "--header-key", "Authorization"]);
  assert.equal(addHttp.status, 0, addHttp.stderr);
  const wsHttp = JSON.parse(await wsText()).servers.find((item) => item.serverName === "ws-http");
  assert.equal(wsHttp.headerRefs.Authorization, "MCP_WS_HTTP_AUTHORIZATION", "派生引用名与宿主同一规则");
  pass("dsh-panel mcp add --workspace derives header reference names");

  const listWs = run(["mcp", "list", "--workspace", ws]);
  assert.equal(listWs.status, 0, listWs.stderr);
  assert.match(listWs.stdout, /ws-demo/);
  assert.match(listWs.stdout, /MCP_WS_HTTP_AUTHORIZATION/);
  pass("dsh-panel mcp list --workspace shows declarations and their references");

  // 传输与凭证参数不匹配 → 响亮失败，绝不静默丢声明（此前会写出无鉴权的服务器）
  const badEnvKey = run(["mcp", "add", "--workspace", ws, "--name", "bad-envkey", "--http", "--url", "https://x/mcp", "--env-key", "SHOULD_NOT_APPLY"]);
  assert.equal(badEnvKey.status, 1);
  assert.match(badEnvKey.stderr, /--env\/--env-key 只用于 --stdio/);
  const badHeaderKey = run(["mcp", "add", "--workspace", ws, "--name", "bad-headerkey", "--stdio", "--command", "node", "--header-key", "SHOULD_NOT_APPLY"]);
  assert.equal(badHeaderKey.status, 1);
  assert.match(badHeaderKey.stderr, /--header\/--header-key 只用于 --http/);
  const badArgs = run(["mcp", "add", "--workspace", ws, "--name", "bad-args", "--http", "--url", "https://x/mcp", "--args", "-y"]);
  assert.equal(badArgs.status, 1);
  assert.match(badArgs.stderr, /--args 只用于 --stdio/);
  assert.equal(JSON.parse(await wsText()).servers.some((item) => item.serverName.startsWith("bad-")), false, "被拒的 add 不得留下任何声明");
  pass("mcp add --workspace refuses flags from the other transport instead of dropping them");

  // 全局作用域同样拒绝错配（此前静默写 env:{}/headers:{}）
  const globalHeader = run(["mcp", "add", "--profile", "test", "--name", "g-bad-header", "--stdio", "--command", "node", "--header", "A=B"]);
  assert.equal(globalHeader.status, 1);
  assert.match(globalHeader.stderr, /只用于 --http/);
  const globalEnv = run(["mcp", "add", "--profile", "test", "--name", "g-bad-env", "--http", "--url", "https://x/mcp", "--env", "A=B"]);
  assert.equal(globalEnv.status, 1);
  assert.match(globalEnv.stderr, /只用于 --stdio/);
  assert.equal(/g-bad/.test(await readFile(patchPath, "utf8")), false, "错配的 add 不得留下任何配置行");
  pass("dsh-panel mcp add refuses mismatched transport flags in the global scope too");

  // 未知 flag → 响亮失败；此前被当成 positional 静默忽略，会误改另一个作用域
  const keepGlobal = run(["mcp", "add", "--profile", "test", "--name", "keep-me", "--stdio", "--command", "node"]);
  assert.equal(keepGlobal.status, 0, keepGlobal.stderr);
  const typoRemove = run(["mcp", "remove", "keep-me", "--workspce", ws, "--yes", "--profile", "test"]);
  assert.equal(typoRemove.status, 1);
  assert.match(typoRemove.stderr, /未知参数：--workspce/);
  assert.match(await readFile(patchPath, "utf8"), /keep-me/, "拼错的 --workspace 不得跨作用域删掉全局行");
  const typoList = run(["mcp", "list", "--workspce", ws]);
  assert.equal(typoList.status, 1);
  assert.match(typoList.stderr, /未知参数：--workspce/);
  pass("mcp subcommands refuse unknown flags instead of silently switching scope");

  const conflictWs = run(["mcp", "add", "--profile", "test", "--workspace", ws, "--name", "keep-me", "--http", "--url", "https://x/mcp"]);
  assert.equal(conflictWs.status, 1);
  assert.match(conflictWs.stderr, /已被全局作用域占用/);
  pass("mcp add --workspace refuses a serverName owned by the global scope");

  // 文件损坏 / 版本不认识 → 变更路径响亮失败，一个字节都不改（此前静默覆盖）
  const goodWsText = await wsText();
  const futureText = JSON.stringify({ version: 2, servers: [] }) + "\n";
  for (const [broken, label] of [["{ this is not json", "损坏"], [futureText, "未来版本"]]) {
    await writeFile(wsFile, broken, "utf8");
    const attempt = run(["mcp", "add", "--workspace", ws, "--name", "overwrite", "--http", "--url", "https://y/mcp"]);
    assert.equal(attempt.status, 1, label + "文件上的 add 必须失败");
    assert.match(attempt.stderr, /工作区 MCP 文件无效/);
    assert.equal(await wsText(), broken, label + "文件必须保持字节不变");
  }
  await writeFile(wsFile, goodWsText, "utf8");
  pass("workspace mutations refuse to overwrite a corrupt or unrecognized declaration file");

  // 非交互 stdin 不猜意图：要求 --yes，且绝不删
  const noYes = run(["mcp", "remove", "--workspace", ws, "ws-demo"]);
  assert.equal(noYes.status, 1);
  assert.match(noYes.stderr, /--yes/);
  assert.match(await wsText(), /ws-demo/);
  pass("mcp remove without --yes fails loudly on non-interactive stdin");

  // test --workspace：envKey 从 CLI 进程环境解析并注入子进程；缺值时明确提示
  const fixture = join(dir, "fixture-mcp.mjs");
  await writeFile(fixture, FIXTURE_SOURCE, "utf8");
  const addProbe = run(["mcp", "add", "--workspace", ws, "--name", "probe", "--stdio", "--command", process.execPath, "--args", fixture, "--env-key", "PROBE_TOKEN"]);
  assert.equal(addProbe.status, 0, addProbe.stderr);
  const withToken = run(["mcp", "test", "--workspace", ws, "probe"], { PROBE_TOKEN: "token-from-cli-env" });
  assert.equal(withToken.status, 0, withToken.stderr);
  assert.match(withToken.stdout, /token-from-cli-env/);
  const withoutToken = run(["mcp", "test", "--workspace", ws, "probe"]);
  assert.equal(withoutToken.status, 0, withoutToken.stderr);
  assert.match(withoutToken.stdout, /没有值/);
  assert.match(withoutToken.stdout, /PROBE_TOKEN=<unset>/);
  pass("mcp test --workspace resolves env keys from the CLI process environment");

  const removedWs = run(["mcp", "remove", "--workspace", ws, "--yes", "probe"]);
  assert.equal(removedWs.status, 0, removedWs.stderr);
  assert.equal(JSON.parse(await wsText()).servers.some((item) => item.serverName === "probe"), false);
  pass("dsh-panel mcp remove --workspace --yes deletes the declaration");

  const version = run(["--version"]);
  assert.equal(version.status, 0, version.stderr);
  // 版本号从 package.json 读，避免每次发版都要改测试（旧写法硬编码 2.0.x）。
  const declared = JSON.parse(await readFile(fileURLToPath(new URL("./package.json", import.meta.url)), "utf8")).version;
  assert.equal(version.stdout.trim(), "dsh-panel v" + declared);
  pass("dsh-panel --version reports package version");
} finally {
  await rm(dir, { recursive: true, force: true });
}

console.log("\n" + passed + " passed, 0 failed");
console.log("ALL MCP CLI TESTS PASSED");
