# 01. Architecture & Core Philosophy

## Overview
**XorinDB** is a lightweight, reactive, local-first NoSQL database designed for modern JavaScript applications. It runs directly inside client environments (browsers, Electron, mobile webviews) and server-side runtimes (Next.js SSR, Nuxt, Node.js, Bun, Deno).

---

## 1. Core Principles
1. **Local-First & Zero Latency**: All read and write operations hit local storage (`IndexedDB` or In-Memory) immediately without blocking on network round-trips.
2. **Framework Agnostic**: Zero-config core with seamless bindings for React (`useSyncExternalStore`), Vue (`shallowRef`), Svelte, and Vanilla JS.
3. **Reactive & Push-Driven**: Live queries update automatically whenever underlying data mutations occur.
4. **Resilient Synchronization**: Pluggable replication engine with checkpoints, tombstone deletion, and Server-Sent Events (SSE) streaming.
5. **Multi-Tab Leadership**: Built-in leader election prevents duplicate synchronization processes across multiple open tabs.

---

## 2. Layered Architecture

```text
┌───────────────────────────────────────────────────────────────────┐
│              Framework Adapters (React, Vue, Svelte)              │
│       useXorinQuery(query)  /  useXorinLive(collection)           │
├───────────────────────────────────────────────────────────────────┤
│                        XorinDB Core API                           │
│     db.collection('todos', { schema }).insert() / find()          │
├──────────────────────────────┬────────────────────────────────────┤
│      Reactivity Engine       │        Replication Engine          │
│   EventReduce Query Stream   │    HTTP Pull / Push + Checkpoints  │
│   Cross-Tab BroadcastChannel │    Live SSE Stream & RESYNC        │
├──────────────────────────────┴────────────────────────────────────┤
│                  Schema, Security & Optimization                  │
│       JSON Schema Validation   |   AES-GCM 256-bit Encryption     │
│       Key Compression          |   Versioned Schema Migration     │
├───────────────────────────────────────────────────────────────────┤
│                       Storage Adapters                            │
│   IndexedDB (Browser)  |  Memory Storage (SSR / Node / Tests)     │
└───────────────────────────────────────────────────────────────────┘
```

---

## 3. Storage Adapters
- **IndexedDBStorageAdapter**: Default for browser environments. Maps collections to native IndexedDB ObjectStores, maintaining single and compound indexes.
- **MemoryStorageAdapter**: Safe fallback for SSR (Next.js App Router, Nuxt 3) and Node.js test runners where `window.indexedDB` is undefined.

---

## 4. Multi-Instance Communication & Leadership
- **Cross-Tab Synchronization**: Uses `BroadcastChannel` to notify other open tabs of mutations.
- **Leader Election (`waitForLeadership`)**: Uses modern `navigator.locks` (Web Locks API) to elect a single tab responsible for running network sync tasks, preventing duplicate server load.
