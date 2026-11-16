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
| `id` | `string` | Unique identifier (Custom `primaryKey` or UUID). |
| `_deleted` | `boolean` | Tombstone marker for synchronization. |
| `_updatedAt` | `number` | Unix timestamp of the last mutation. |

---

## 3. Advanced Collection Operations

### Insert & Bulk Insert
```typescript
// Single insert
const todo = await todos.insert({
  title: 'Setup CI/CD',
  status: 'todo'
});

// Bulk Insert with batch resilience ({ success, error })
const result = await todos.bulkInsert([
  { id: 't1', title: 'Task 1', status: 'todo' },
  { id: 't2', title: 'Task 2', status: 'done' }
]);
console.log('Inserted:', result.success);
console.log('Failed items:', result.error);
```

### Upsert & Incremental Upsert
```typescript
// Upsert: Inserts if absent, updates if exists
const doc = await todos.upsert({
  id: 't1',
  title: 'Task 1 updated'
});

// Incremental Upsert: Atomic mutation preventing race conditions
await counter.incrementalUpsert(
  { id: 'counter-1', count: 0 },
  (existing) => ({
    ...existing,
    count: existing.count + 1
  })
);
```

### Bulk Upsert
```typescript
const bulkResult = await todos.bulkUpsert([
  { id: 't1', title: 'Task 1 v2' },
  { id: 't3', title: 'Task 3 New' }
]);
```

### Find & Method Chaining
```typescript
// Find by ID
const item = await todos.findById('t1');

// findOne() with chaining
const topTask = await todos
  .findOne()
  .where({ status: 'todo' })
  .sort({ priority: 'desc' })
  .exec();

// RxDB-style Mango Query Object syntax
const activeTodos = await todos.find({
  selector: {
    status: { $eq: 'todo' },
    priority: { $gte: 2 }
  },
  sort: { priority: 'desc' },
  skip: 0,
  limit: 10
}).exec();

// Reactive Single Document Subscription
const unsub = todos.findOne('t1').$.subscribe((doc) => {
  console.log('Current t1 state:', doc);
});
```

### Performant Count
```typescript
// Fast collection-level document count
const totalActive = await todos.count();

// Filtered count
const todoCount = await todos.count({ status: 'todo' });

// Query chain count
const urgentCount = await todos.find({ priority: { $gt: 3 } }).count();
```

### Lifecycle Hooks
```typescript
// preInsert & postInsert
todos.preInsert((data) => {
  return { ...data, title: data.title?.trim() };
});
todos.postInsert((doc) => {
  console.log('Inserted new document:', doc.id);
});

// preSave & postSave (runs on insert and update)
todos.preSave((doc) => {
  return { ...doc, lastReviewedAt: Date.now() };
});
todos.postSave((doc, previous) => {
  console.log('Document modified:', doc.id, 'Previous state:', previous);
});

// preRemove & postRemove
todos.preRemove((id, doc) => {
  console.log('About to delete:', id);
});
todos.postRemove((id, doc) => {
  console.log('Successfully deleted:', id);
});
```

### Delete (Tombstone vs Hard Delete)
```typescript
// Soft delete (tombstone for replication sync - Recommended)
await todos.delete('t1');

// Hard delete (purges completely from local storage)
await todos.delete('t1', true);
```

---

For full details on logical operators (`$or`, `$and`, `$nor`, `$not`), nested dot-notation (`'user.profile.name'`), regex (`$regex`), existence (`$exists`), type checking (`$type`), and array operators (`$size`, `$all`, `$elemMatch`), see [08_mango_queries_and_operators.md](./08_mango_queries_and_operators.md).
