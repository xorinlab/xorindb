# 04. Reactivity & EventReduce

## 1. Live Queries (`subscribe` & `.$`)
Any query constructed with `.find()` or `.findOne()` can be subscribed to for real-time reactivity:

```typescript
// Multi-document live query
const query = issues.find(
  { status: 'todo' },
  { sort: { priority: 'desc' } }
);

// Subscribe directly or via RxDB-style .$ observable alias
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

## 2. EventReduce Query Optimization
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

## 3. Cross-Tab Reactivity
XorinDB utilizes native browser `BroadcastChannel` instances (`xorindb_${dbName}`). When tab A performs a mutation:
1. Tab A writes to IndexedDB and emits an event.
2. Event is broadcast across open browser windows.
3. Tab B receives event and updates its own reactive live queries without requiring page refreshes.
