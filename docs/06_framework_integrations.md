# 06. Framework Integrations & SSR

## 1. React & Next.js (App Router / Pages)

Import and consume via `@xorindb/react` (or `xorindb/react`).

```tsx
'use client';

import React, { useState } from 'react';
import { createDatabase } from 'xorindb';
import { useXorinQuery } from 'xorindb/react';

const db = await createDatabase('team-board');
const todos = db.collection('todos');

export function TodoList() {
  const [text, setText] = useState('');

  // Built on React 18/19 native useSyncExternalStore
  const items = useXorinQuery(
    todos.find({ completed: false }, { sort: { _updatedAt: 'desc' } })
  );

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    await todos.insert({ title: text, completed: false });
    setText('');
  };

  return (
    <div>
      <form onSubmit={add}>
        <input value={text} onChange={e => setText(e.target.value)} />
      </form>
      <ul>
        {items.map(item => (
          <li key={item.id}>{item.title}</li>
        ))}
      </ul>
    </div>
  );
}
```

### SSR Safety (Next.js)
XorinDB detects server-side rendering environments where `window.indexedDB` does not exist and safely falls back to `MemoryStorageAdapter`. The hook provides an empty array for `getServerSnapshot()`, completely eliminating hydration mismatch warnings.

---

## 2. Vue & Nuxt

Import and consume via `xorindb/vue`.

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { createDatabase } from 'xorindb';
import { useXorinQuery } from 'xorindb/vue';

const db = await createDatabase('team-board');
const todos = db.collection('todos');

const newTitle = ref('');

// Returns a Vue ShallowRef that automatically triggers reactivity on mutations
const items = useXorinQuery(
  todos.find({ completed: false })
);

const addTodo = async () => {
  if (!newTitle.value.trim()) return;
  await todos.insert({ title: newTitle.value, completed: false });
  newTitle.value = '';
};
</script>

<template>
  <div>
    <input v-model="newTitle" @keyup.enter="addTodo" placeholder="What needs doing?" />
    <ul>
      <li v-for="item in items" :key="item.id">
        {{ item.title }}
      </li>
    </ul>
  </div>
</template>
```

---

## 3. Svelte 4 / 5 & Vanilla JS

Queries comply with the Svelte Store contract via `.subscribe()`.

```svelte
<script>
  import { createDatabase } from 'xorindb';

  let items = [];
  const init = async () => {
    const db = await createDatabase('todo-app');
    const todos = db.collection('todos');
    const query = todos.find({ completed: false });

    query.subscribe(data => {
      items = data;
    });
  };
  init();
</script>

<ul>
  {#each items as item (item.id)}
    <li>{item.title}</li>
  {/each}
</ul>
```
