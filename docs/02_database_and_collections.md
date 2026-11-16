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

### Logical Query Operators (`$or`, `$and`, `$nor`, `$not`)
XorinDB supports MongoDB/Mango-compatible logical operators for advanced query branching:

```typescript
// $or: matches if any condition is true
const urgentOrPending = await todos.find({
  $or: [
    { priority: { $gt: 3 } },
    { status: 'pending' }
  ]
}).exec();

// $nor: matches if none of the conditions are true
const activeItems = await todos.find({
  $nor: [
    { status: 'done' },
    { archived: true }
  ]
}).exec();

// $and: matches if all conditions are satisfied
const highPriorityActive = await todos.find({
  $and: [
    { priority: { $gte: 4 } },
    { status: 'active' }
  ]
}).exec();

// $not: top-level inverted condition or field-level operator
const notCompleted = await todos.find({
  $not: { status: 'completed' }
}).exec();

// Field-level $not operator
const nonThreeRating = await todos.find({
  rating: { $not: { $eq: 3 } }
}).exec();
```

---

### Nested Object Dot-Notation (`'user.profile.name'`)
XorinDB supports deep dot-notation paths in both query filters and sort definitions without requiring schema flattening:

```typescript
// Query by nested child properties
const engineersInSF = await users.find({
  'department.code': 'ENG',
  'department.location.city': 'San Francisco'
}).exec();

// Combine dot-notation with comparison operators
const seniorStaff = await users.find({
  'metrics.yearsOfExperience': { $gte: 5 }
}).exec();

// Sort by deeply nested properties
const sortedByBuilding = await users.find(
  { 'department.code': 'ENG' },
  { sort: { 'department.location.building': 'asc' } }
).exec();
```

---

### Regular Expressions (`$regex`) & Pattern Matching
Search and filter strings using native JavaScript `RegExp` instances or MongoDB-style `$regex` strings with `$options`:

```typescript
// 1. Direct RegExp instance
const reactArticles = await articles.find({
  title: /react/i
}).exec();

// 2. Mango-style $regex string with flags ($options)
const prefixMatch = await articles.find({
  title: { $regex: '^xorin', $options: 'i' }
}).exec();

// 3. Nested property regex search
const devAuthors = await articles.find({
  'author.username': { $regex: '^dev_' }
}).exec();

// 4. Combined with logical and inverted operators
const nonBeta = await articles.find({
  title: { $not: { $regex: /beta/i } }
}).exec();
```
