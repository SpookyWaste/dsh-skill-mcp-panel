# dsh-skill-mcp-panel

Fork自[dsh-skill-mcp-panel](https://github.com/Fishquito7/dsh-skill-mcp-panel)，详细文档见原仓库

原作者[Fishquito7](https://github.com/Fishquito7)

## 本 fork 的改动

- **MCP 工作区作用域**：MCP 服务器可以按工作区声明，写在 `<工作区>/.dsh/mcp.json`，只对 cwd 落在该工作区（项目根）的会话生效——工具注册进该会话自己的 agent 作用域，随会话释放一起回卷；面板顶部可在「全局 / 工作区」之间切换。该文件**只记键名**（`envKeys` 与 `headerRefs`），值由宿主写进 DSH 官方凭证存储。
- **CLI 同步支持工作区作用域**：`dsh-panel mcp` 的 `add` / `list` / `remove` / `enable` / `disable` / `test` 都接受 `--workspace <path>`，写法与全局作用域对齐，但只声明键名（`--env-key` / `--header-key`）。
- **DSH 0.1.7-alpha 适配**：现在按新名优先、旧名回退解析，同一份构建同时兼容两代 DSH。
- **CLI 参数与写路径收敛**：未知 flag 不再被当成位置参数静默忽略（`--workspce` 拼错以前会去改**全局**作用域），传输方式与凭证参数错配会报错而不是静默丢弃，工作区声明文件损坏或版本不认识时写路径拒绝覆盖（不再清空已有声明），非交互 stdin 下的确认操作要求显式 `--yes`。

## 用法（本 fork 新增部分）

```bash
# 工作区作用域 → <工作区>/.dsh/mcp.json（只记键名，不存密钥值；路径归一化到项目根）
dsh-panel mcp list --workspace <path>
dsh-panel mcp add --workspace <path> --name <serverName> --stdio --command <cmd> [--args <arg> ...] [--env-key NAME ...] [--cwd <path>]
dsh-panel mcp add --workspace <path> --name <serverName> --http --url <url> [--header-key NAME ...]
dsh-panel mcp enable|disable --workspace <path> <serverName>
dsh-panel mcp remove --workspace <path> <serverName> [--yes]
dsh-panel mcp test --workspace <path> <serverName>
```

`--workspace` 的路径会先归一化到该项目的 git 根；改动只对新开的会话生效。CLI 没有运行中的 host，读不到 DSH 凭证存储，因此 `--env-key` / `--header-key` 只声明键名——值请在 Web 面板的「MCP」页设置，`mcp test --workspace` 只能用 CLI 进程环境里已有的值探活（缺值时会打印提示）。非交互环境（CI、管道、重定向的 stdin）下的 `remove` 等确认操作必须显式加 `--yes`。

安装方式与原仓库相同（npm 包与 Release tarball 由原作者发布）；本 fork 未单独发布，可锁定 commit 用 git 直装，仓库已提交 `lib/` 产物。

## Changelog

### 2026-09-22
  - feat: MCP支持工作区作用域，补充相关UI
### 2026-09-23
  - fix: DSH 0.1.7-alpha1适配
  - fix: CLI 工作区作用域的未知 flag、传输错配、损坏文件覆盖、非交互确认
### 2026-09-24
  - fix: skill和MCP面板现在显示合并到项目根的作用域

## Todo

## 链接

- 原仓库：[Fishquito7/dsh-skill-mcp-panel](https://github.com/Fishquito7/dsh-skill-mcp-panel)
- 本仓库：[SpookyWaste/dsh-skill-mcp-panel](https://github.com/SpookyWaste/dsh-skill-mcp-panel)
- 问题反馈：[Issues](https://github.com/SpookyWaste/dsh-skill-mcp-panel/issues)
- 英文文档：[README.en.md](https://github.com/SpookyWaste/dsh-skill-mcp-panel/blob/dev/README.en.md)

## License

MIT
