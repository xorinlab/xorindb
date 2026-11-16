# 04. Reactivity & EventReduce

## 1. Live Queries (`subscribe` & `.$`)
Any query constructed with `.find()` or `.findOne()` can be subscribed to for real-time reactivity:

```typescript
// Multi-document live query
const query = issues.find(
  { status: 'todo' },
  { sort: { priority: 'desc' } }
);

// Subscribe directly or via .$ observable alias
const unsubscribe = query.$.subscribe((currentList) => {
  console.log('Updated Todo List:', currentList);
});

// Single-document live query
const unsubSingle = issues.findOne('issue-101').$.subscribe((issue) => {
  console.log('Issue updated in real-time:', issue);
});

// Clean up listener
unsubscribe();
unsubSingle();
```

---

## 2. Query Result-Set Mutations (`update` & `remove`)
You can mutate or delete documents directly matching a query result set in bulk:

```typescript
// Bulk update all matching documents
const updated = await issues.find({ status: 'todo' }).update({
  status: 'in_progress',
  priority: 2
});

// Bulk remove all matching documents (soft-delete with tombstone)
const removed = await issues.find({ status: 'archived' }).remove();

// Single document query update/remove
await issues.findOne('issue-101').update({ priority: 5 });
await issues.findOne('issue-101').remove();
```

---

## 3. Query Caching & De-duplication
To avoid redundant object allocations, duplicate event subscriptions, and memory bloat, XorinDB maintains an internal **Query Cache**:

```typescript
// Identical queries reuse the same in-memory instance
const q1 = issues.find({ status: 'todo' });
const q2 = issues.find({ status: 'todo' });

console.log(q1 === q2); // true! (Zero memory duplication)

// Cache can be accessed or cleared if needed
issues.getQueryCache().clear();
```

---

## 4. EventReduce Query Optimization
Traditional reactive query engines re-run complete storage scans on every database write. XorinDB implements the **EventReduce** algorithm to optimize UI responsiveness and battery efficiency:

### EventReduce Decision Flow:
1. **Unrelated Mutations (`do-nothing`)**:
   - If a query filters for `{ status: 'todo' }` and a document is updated with `{ status: 'done' }`, EventReduce calculates that this change cannot affect the query result.
   - **Result:** Storage query is skipped and zero UI component re-renders are triggered.
2. **In-Memory Delta Update (`insert` / `update` / `remove`)**:
   - For simple additions or removals that do not require complex pagination backfilling, the cached result is updated in-memory and immediately dispatched.
   - **Result:** Update delay is 0ms.
3. **Full Query Fallback (`run-full-query`)**:
   - Executed only when sort orders change or limit/skip boundaries require fresh disk scans.

---

## 5. Cross-Tab Reactivity
XorinDB utilizes native browser `BroadcastChannel` instances (`xorindb_${dbName}`). When tab A performs a mutation:
1. Tab A writes to IndexedDB and emits an event.
2. Event is broadcast across open browser windows.
3. Tab B receives event and updates its own reactive live queries without requiring page refreshes.
