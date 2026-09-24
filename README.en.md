# dsh-skill-mcp-panel

A fork of [dsh-skill-mcp-panel](https://github.com/Fishquito7/dsh-skill-mcp-panel) — see the upstream repository for the full documentation

Original author: [Fishquito7](https://github.com/Fishquito7)

## What this fork changes

- **MCP workspace scope**: MCP servers can be declared per workspace in `<workspace>/.dsh/mcp.json`, in effect only for sessions whose cwd resolves to that workspace (its project root) — the tools register into that session's own agent scope and unwind with it. A scope switch at the top of the panel moves between “Global” and “Workspace”. The file **records key names only** (`envKeys` and `headerRefs`); values are written by the host into DSH's official credential store.
- **The CLI covers the workspace scope too**: `add` / `list` / `remove` / `enable` / `disable` / `test` under `dsh-panel mcp` all accept `--workspace <path>`, matching the global-scope syntax, but declare key names only (`--env-key` / `--header-key`).
- **DSH 0.1.7-alpha compatibility**: the build now resolves the new icon names first and falls back to the legacy ones, so one artifact works on both DSH generations.
- **CLI argument and write-path hardening**: unknown flags are no longer silently treated as positional arguments (a typo like `--workspce` used to mutate the **global** scope), a credential flag that does not match the transport now fails loudly instead of being dropped, a corrupt or unrecognized workspace declaration file is never overwritten (previously its declarations were wiped), and confirmation prompts on a non-interactive stdin now require an explicit `--yes`.

## Usage (fork additions)

```bash
# Workspace scope → <workspace>/.dsh/mcp.json (key names only, never a value; the path normalizes to its project root)
dsh-panel mcp list --workspace <path>
dsh-panel mcp add --workspace <path> --name <serverName> --stdio --command <cmd> [--args <arg> ...] [--env-key NAME ...] [--cwd <path>]
dsh-panel mcp add --workspace <path> --name <serverName> --http --url <url> [--header-key NAME ...]
dsh-panel mcp enable|disable --workspace <path> <serverName>
dsh-panel mcp remove --workspace <path> <serverName> [--yes]
dsh-panel mcp test --workspace <path> <serverName>
```

The `--workspace` path is first normalized to that project's git root, and changes apply to newly opened sessions only. The CLI has no running host and cannot read DSH's credential store, so `--env-key` / `--header-key` declare key names only — set the values on that server's card in the web panel; `mcp test --workspace` can only probe with values already present in the CLI process environment and prints a notice when one is missing. Confirmation prompts (`remove` and friends) on a non-interactive stdin (CI, pipes, redirected stdin) require an explicit `--yes`.

Installation is the same as upstream (the npm package and Release tarball are published by the original author). This fork is not published separately; install it from git pinned to a commit — the compiled `lib/` is committed.

## Changelog

### 2026-09-22
  - feat: MCP workspace scope, with the matching UI
### 2026-09-23
  - fix: DSH 0.1.7-alpha.1 compatibility
  - fix: CLI workspace scope — unknown flags, transport mismatches, overwriting a corrupt file, non-interactive confirmation
### 2026-09-24
  - fix: the skills and MCP panels now show scopes folded onto their project root

## Todo

## Links

- Upstream: [Fishquito7/dsh-skill-mcp-panel](https://github.com/Fishquito7/dsh-skill-mcp-panel)
- This repository: [SpookyWaste/dsh-skill-mcp-panel](https://github.com/SpookyWaste/dsh-skill-mcp-panel)
- Issues: [github.com/SpookyWaste/dsh-skill-mcp-panel/issues](https://github.com/SpookyWaste/dsh-skill-mcp-panel/issues)
- Chinese docs: [README.md](https://github.com/SpookyWaste/dsh-skill-mcp-panel/blob/dev/README.md)

## License

MIT
