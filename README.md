# Shulingge Architecture

Shulingge is a TypeScript monorepo for a desktop-first writing workspace. It contains the web UI, local server, Electron shell, and shared domain packages.

## Workspace

- `apps/web`: React and Vite frontend.
- `apps/server`: local service layer and API routes.
- `apps/desktop`: Electron desktop shell and packaging scripts.
- `packages/*`: shared core modules for agents, rules, skills, themes, security, vault data, indexing, and import/export.
- `scripts`: workspace helper scripts.
- `templates`: bundled template metadata.

## Development

Install dependencies:

```bash
pnpm install
```

Run checks:

```bash
pnpm test
pnpm typecheck
```

Start the web app:

```bash
pnpm --filter @shulingge/web dev
```

Start the local server:

```bash
pnpm --filter @shulingge/server dev
```

Start the desktop app:

```bash
pnpm --filter @shulingge/desktop dev
```

## Repository Scope

Planning documents, handoff notes, progress logs, and other local-only materials are kept outside the GitHub code history in `_local_docs_archive/`.
