# 02. Database & Collections API

## 1. Database Lifecycle

### Initialization
```typescript
import { createDatabase } from 'xorindb';

// Basic Initialization
const db = await createDatabase('team-board');

// Advanced Options
const secureDb = await createDatabase({
  name: 'secure-vault',
  password: 'user-master-password', // Enables AES-GCM encryption
  multiTab: true,                   // Enables cross-tab BroadcastChannel
  ignoreDuplicate: true             // Singleton pattern (prevents React HMR leaks)
});
```

### Methods
- **`db.collection(name, options?)`**: Returns or creates a collection instance.
- **`db.isLeader()`**: Returns `true` if current tab/process is elected leader.
- **`db.waitForLeadership()`**: Resolves when current tab wins Web Lock leadership.
- **`db.close()`**: Closes connections, emitters, and electors.
- **`db.remove()`**: Drops physical IndexedDB from disk and purges cache.

---

## 2. Document Structure & Metadata
Every stored document is automatically stamped with internal properties:

| Property | Type | Description |
|---|---|---|
| `id` | `string` | Unique identifier (Custom primaryKey or `crypto.randomUUID()`). |
| `_deleted` | `boolean` | Tombstone marker for synchronization. |
| `_updatedAt` | `number` | Unix timestamp of the last mutation. |

---

## 3. CRUD Operations

### Insert
```typescript
const todo = await todos.insert({
  title: 'Setup CI/CD',
  status: 'todo'
});

const batch = await todos.insertMany([
  { title: 'Task 1', status: 'todo' },
  { title: 'Task 2', status: 'done' }
]);
```

### Find & Query
```typescript
// Find by ID
const item = await todos.findById('todo-123');

// Mango-style Query
const activeTodos = await todos.find(
  { status: 'todo', priority: { $gte: 2 } },
  { sort: { _updatedAt: 'desc' }, limit: 10 }
).exec();
```

### Update
```typescript
const updated = await todos.update('todo-123', {
  status: 'done'
});
```

### Delete (Tombstone vs Hard Delete)
```typescript
// Soft delete (tombstone for replication sync - Recommended)
await todos.delete('todo-123');

// Hard delete (purges completely from local storage)
await todos.delete('todo-123', true);
```
