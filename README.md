# XorinDB 🚀

A lightweight, reactive, zero-config local-first database engineered to be framework-agnostic, modular, and hassle-free.

## Key Features

- 🏎️ **Local-First & Offline-Ready**: Queries and writes execute directly against local IndexedDB or In-Memory storage without waiting for the network.
- ⚡ **Zero-Config**: Works out-of-the-box. Autodetects environment (browser `IndexedDB`, SSR/Node.js fallback to `MemoryStorage`).
- 🔄 **Live Reactive Queries**: Data streams automatically to your UI when records update, insert, or delete.
- 🌐 **Cross-Tab Synchronization**: Automatically syncs state across multiple browser tabs via `BroadcastChannel` with zero extra setup.
- 🤝 **Replication & Sync Ready**: Checkpoints, soft-delete tombstones (`_deleted: true`), and pluggable push/pull synchronization with conflict resolution.
- 🧩 **Universal Framework Support**: First-class support for React, Vue, Next.js, Nuxt, and Vanilla JS.

---

## Installation

```bash
npm install xorindb
# or
pnpm add xorindb
```

---

## 1. Quick Start (Vanilla JS / TypeScript)

```typescript
import { createDatabase } from 'xorindb';

interface Task {
  title: string;
  completed: boolean;
}

// 1. Initialize DB (auto-selects IndexedDB in browser, Memory in SSR/Node)
const db = await createDatabase('my-app');
const tasks = db.collection<Task>('tasks');

// 2. Insert (automatically assigns crypto.randomUUID() and timestamp)
const newTask = await tasks.insert({
  title: 'Learn Local-First Architecture',
  completed: false,
});

// 3. Live Reactive Query
const query = tasks.find({ completed: false }, { sort: { _updatedAt: 'desc' } });

// Subscribe to real-time changes
const unsubscribe = query.subscribe((taskList) => {
  console.log('Active Tasks:', taskList);
});

// 4. Update
await tasks.update(newTask.id, { completed: true });

// 5. Soft Delete (retained as tombstone for sync)
await tasks.delete(newTask.id);
```

---

## 2. React / Next.js Usage

```tsx
import React, { useState } from 'react';
import { createDatabase } from 'xorindb';
import { useXorinQuery } from 'xorindb/react';

const db = await createDatabase('team-board');
const issues = db.collection('issues');

export function IssueBoard() {
  const [title, setTitle] = useState('');
  
  // React 18/19 concurrent-safe live query (using useSyncExternalStore)
  const openIssues = useXorinQuery(
    issues.find({ status: 'open' }, { sort: { _updatedAt: 'desc' } })
  );

  const addIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await issues.insert({ title, status: 'open' });
    setTitle('');
  };

  return (
    <div>
      <form onSubmit={addIssue}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
        <button type="submit">Add Issue</button>
      </form>

      <ul>
        {openIssues.map((issue) => (
          <li key={issue.id}>
            {issue.title}
            <button onClick={() => issues.update(issue.id, { status: 'done' })}>
              Done
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

---

## 3. Vue / Nuxt 3 Usage

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { createDatabase } from 'xorindb';
import { useXorinQuery } from 'xorindb/vue';

const db = await createDatabase('team-board');
const issues = db.collection('issues');

const title = ref('');

// Reactive ShallowRef that updates automatically on DB mutations
const openIssues = useXorinQuery(
  issues.find({ status: 'open' })
);

const addIssue = async () => {
  if (!title.value.trim()) return;
  await issues.insert({ title: title.value, status: 'open' });
  title.value = '';
};
</script>

<template>
  <div>
    <input v-model="title" @keyup.enter="addIssue" />
    <ul>
      <li v-for="issue in openIssues" :key="issue.id">
        {{ issue.title }}
      </li>
    </ul>
  </div>
</template>
```

---

## 4. Background Sync & Replication

```typescript
tasks.sync({
  pullIntervalMs: 5000,
  pull: async (checkpoint) => {
    const res = await fetch(`/api/sync/pull?since=${checkpoint}`);
    const data = await res.json();
    return {
      documents: data.documents,
      checkpoint: data.newCheckpoint,
    };
  },
  push: async (changes) => {
    await fetch(`/api/sync/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ changes }),
    });
  },
  conflictResolver: ({ clientState, serverState }) => {
    // 3-way merge or custom conflict strategy
    return {
      ...clientState,
      status: serverState.status, // preserve server status
    };
  },
});
```
