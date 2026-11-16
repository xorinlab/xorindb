# 07. XorinDocument API

## 1. Introduction
In XorinDB, a **`XorinDocument`** is a reactive proxy wrapper around individual JSON documents. It bridges the stored document state with convenient mutation methods, field-level reactivity, and replication tombstones.

---

## 2. Proxy Access & Properties
All stored document fields can be accessed directly as regular object properties or via explicit getters:

```typescript
const doc = createXorinDocument(users, rawUser);

// Direct property access via Proxy
console.log(doc.name);
console.log(doc.age);

// Explicit get() method
const name = doc.get('name');

// Check deletion state
console.log(doc.deleted); // false
```

---

## 3. Reactive Observables (`.$` & `.get$()`)

### Document Observable (`doc.$`)
Emits the updated document state whenever any change occurs to the document:

```typescript
const unsubscribe = doc.$.subscribe((updatedDoc) => {
  console.log('Document modified:', updatedDoc.toJSON());
});
```

### Field-Level Observable (`doc.get$()`)
Subscribes strictly to changes on a specific property, preventing unnecessary UI re-renders when other fields are modified:

```typescript
const unsubScore = doc.get$('score').subscribe((newScore) => {
  console.log('Score changed to:', newScore);
});
```

---

## 4. Document Mutations

### `incrementalPatch()`
Safely patches partial subtrees of the document without overwriting other fields:

```typescript
await doc.incrementalPatch({
  status: 'active',
  lastLogin: Date.now()
});
```

### `modify()` & `incrementalModify()`
Applies a synchronous or asynchronous mutator function against the freshest storage state, eliminating concurrent overwrite conflicts:

```typescript
await doc.modify((data) => {
  data.count += 1;
  data.tags.push('verified');
  return data;
});
```

### `remove()` & `incrementalRemove()`
Soft-deletes the document from the collection by stamping a tombstone (`_deleted: true`), allowing replication protocols to sync the deletion across peers and servers:

```typescript
await doc.remove();

console.log(doc.deleted); // true
```

---

## 5. Exporting Plain JSON (`toJSON` & `toMutableJSON`)
Essential when passing document data to React/Vue state or REST APIs:

### `doc.toJSON(withMetaFields = true)`
Returns an **immutable, deeply frozen (`Object.freeze`)** plain JavaScript object:
```typescript
// Includes metadata (id, _deleted, _updatedAt) and is frozen
const plain = doc.toJSON();
// plain.name = 'Hacked'; // Throws TypeError in strict mode

// Strips metadata fields while remaining frozen
const pureData = doc.toJSON(false);
console.log(pureData._deleted); // undefined
```

### `doc.toMutableJSON(withMetaFields = false)`
Returns a **deep-cloned, freely mutable** plain JavaScript object:
```typescript
// Pure business payload without internal metadata (ready for form binding or mutations)
const clean = doc.toMutableJSON();
clean.name = 'New Name'; // Safe to mutate freely without affecting XorinDocument

// Includes metadata if explicitly requested
const mutableWithMeta = doc.toMutableJSON(true);
```
