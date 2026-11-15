# XorinDB - AI & Developer Master Context (AGENTS.md)

Welcome to **XorinDB** (`github.com/xorinlab/xorindb`), a modern, reactive, zero-config local-first NoSQL database for JavaScript.
This document serves as the single source of truth for AI agents (Claude, Antigravity, Cursor, ChatGPT, etc.) and human developers working on this codebase.

---

## 1. Project Overview & Architecture

- **Repository:** `https://github.com/xorinlab/xorindb`
- **Application Type:** Framework-Agnostic Reactive Local-First Database Library.
- **Runtime & Package Manager:** **Bun** (`v1.4+`) with workspace monorepo.
- **Build Tool:** `tsup` (Dual output: ESM + CJS + TypeScript `.d.ts`).
- **Test Runner:** `vitest` + `fake-indexeddb`.
- **Target Environments:** Modern Browsers (Chrome, Firefox, Safari, Edge), Electron, React Native, SSR (Next.js, Nuxt 3), Node.js, Bun, Deno.

---

## 2. Directory Structure

```text
xorindb/
├── AGENTS.md                  # Master orientation for AI agents & developers
├── README.md                  # Public documentation & getting started
├── bun.lock                   # Bun lockfile
├── package.json               # Monorepo root package definition
├── tsconfig.base.json         # Shared TypeScript compiler options
├── docs/                      # Architectural & functional deep-dives
│   ├── 01_architecture.md     # Layered architecture, storage adapters, leadership
│   ├── 02_database_and_collections.md # CRUD, lifecycle (remove/close), metadata
│   ├── 03_schema_indexing_and_security.md # JSON schema, custom PK, indexes, AES-GCM
│   ├── 04_reactivity_and_event_reduce.md # Live queries, EventReduce algorithm, multi-tab
│   ├── 05_http_replication_and_sync.md # Pull/Push, checkpoints, SSE live stream
│   └── 06_framework_integrations.md # React 18/19, Vue 3, Next.js SSR, Svelte
├── packages/
│   └── core/                  # Main package published as 'xorindb'
│       ├── package.json
│       ├── tsup.config.ts
│       ├── src/
│       │   ├── index.ts       # Unified export root
│       │   ├── database.ts    # Database class, singleton cache, remove()
│       │   ├── collection.ts  # Collection CRUD, encryption/compression hooks
│       │   ├── types.ts       # Core interfaces & type definitions
│       │   ├── sync.ts        # SyncEngine, checkpoints, tombstones
│       │   ├── leader/        # Web Locks API Leader Election (waitForLeadership)
│       │   ├── query/         # Query class, matcher, EventReduce engine
│       │   ├── schema/        # JSON Schema validator, migrator, key compressor, AES-GCM
│       │   ├── storage/       # IndexedDB & In-Memory storage adapters
│       │   ├── replication/   # Standard HTTP pull/push + SSE stream replication
│       │   ├── react/         # useXorinQuery React hook (useSyncExternalStore)
│       │   └── vue/           # useXorinQuery Vue composable (shallowRef)
│       └── test/              # Vitest test suite
└── .agents/
    └── skills/                # Agent capabilities (Graphify, Ponytail, Agent-Skill)
```

---

## 3. Core Architectural Rules (CRITICAL)

1. **Zero External Dependencies in Core**:
   The core database runtime must remain featherweight (<15KB minified) and free from heavy third-party packages (no RxJS, no external validation or crypto packages). Rely strictly on web standards: `IndexedDB`, `BroadcastChannel`, `crypto.subtle`, `navigator.locks`.
2. **SSR Safety**:
   Never assume `window` or `indexedDB` exist at runtime. If absent, transparently fall back to `MemoryStorageAdapter` without throwing errors.
3. **Data Integrity & Sync Invariants**:
   - Every document must retain `id`, `_deleted: boolean`, and `_updatedAt: number`.
   - Never perform destructive hard deletes during normal operations; use tombstones (`_deleted: true`) to ensure disconnected clients learn about deletions upon reconnection.
4. **Non-Blocking In-Memory Optimizations**:
   Mutations should calculate query delta updates in-memory using `EventReduce` to avoid unnecessary linear disk reads and redundant UI re-renders.
5. **Testing Verification**:
   All new features, bug fixes, or architectural changes must include automated tests in `packages/core/test/` and pass `bun run test` cleanly.
