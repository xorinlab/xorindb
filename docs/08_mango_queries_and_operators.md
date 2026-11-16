# 08. Mango Queries & Query Operators

XorinDB supports MongoDB/Mango-compatible query syntax, rich operators, and dot-notation paths without external dependencies.

---

## 1. Logical Query Operators (`$or`, `$and`, `$nor`, `$not`)
XorinDB supports Mango-compatible logical operators for advanced query branching:

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

## 2. Nested Object Dot-Notation (`'user.profile.name'`)
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

## 3. Regular Expressions (`$regex`) & Pattern Matching
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

---

## 4. Existence (`$exists`) & Type Checking (`$type`)
Filter documents based on whether a property exists or matches a specific JSON/BSON runtime data type:

```typescript
// 1. Check if a property is defined ($exists: true / false)
const usersWithAge = await users.find({
  age: { $exists: true }
}).exec();

// 2. Check existence on nested paths
const configuredUsers = await users.find({
  'settings.theme': { $exists: true }
}).exec();

// 3. Runtime data type inspection with $type
// Supports 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null' | 'undefined'
const arrayTags = await users.find({
  tags: { $type: 'array' }
}).exec();

const nullEmails = await users.find({
  email: { $type: 'null' }
}).exec();

// 4. Combine $exists and $type with logical operators
const verifiedProfiles = await users.find({
  $and: [
    { age: { $gte: 18 } },
    { email: { $exists: true, $type: 'string' } }
  ]
}).exec();
```

---

## 5. Array Operators (`$size`, `$all`, `$elemMatch`)
Query and inspect arrays and nested arrays of objects:

```typescript
// 1. Array length matching with $size
const twoTagOrders = await orders.find({
  tags: { $size: 2 }
}).exec();

// 2. Subset matching with $all (must contain all specified elements)
const techSaleOrders = await orders.find({
  tags: { $all: ['electronics', 'sale'] }
}).exec();

// 3. Object element matching with $elemMatch
const expensiveCart = await orders.find({
  items: {
    $elemMatch: {
      price: { $gte: 500 }
    }
  }
}).exec();

// 4. Primitive element condition matching with $elemMatch
const topScorers = await players.find({
  scores: {
    $elemMatch: { $gt: 90 }
  }
}).exec();
```

---

## 6. Fluent Query Builder (`.where(field)...`)
Instead of passing raw Mango JSON objects, XorinDB supports fluent, chainable method syntax inspired by RxDB Query Builder:

```typescript
// Chain range and equality operators on multiple fields
const premiumItems = await products.find()
  .where('price').gt(50).lte(200)
  .where('inStock').eq(true)
  .where('tags').in(['tech', 'gadget'])
  .where('vendor.name').regex('^Apple', 'i')
  .sort({ price: 'asc' })
  .limit(10)
  .exec();

### Chained Comparison Operators Reference:
- `.eq(value)` / `.equals(value)` : Matches documents where field equals value.
- `.ne(value)` : Matches documents where field is not equal to value.
- `.gt(value)` : Matches values strictly greater than value.
- `.gte(value)` : Matches values greater than or equal to value.
- `.lt(value)` : Matches values strictly less than value.
- `.lte(value)` : Matches values less than or equal to value.

### Chained Set & Array Methods Reference:
- `.in(array)` : Matches if value exists in array (or array field contains at least one match).
- `.nin(array)` : Matches if value does not exist in array.
- `.all(array)` : Matches if array field contains all elements specified.
- `.size(length)` : Matches if array field has the exact length.
- `.elemMatch(condition)` : Matches if at least one array element satisfies object or operator conditions.

### Chained Pattern Matching Reference:
- `.regex(pattern, options?)` : Matches string fields using regex string (with optional flags e.g. `'i'`) or native JavaScript `RegExp` object.

// Closed interval example (20 <= temperature <= 30)
const comfortable = await sensors.find()
  .where('temperature').gte(20).lte(30)
  .exec();

// Pattern matching fluent example
const techArticles = await posts.find()
  .where('title').regex('^react', 'i')
  .where('author.domain').regex(/\.io$/)
  .exec();

// Set & Array fluent example
const digitalHolidayOrders = await orders.find()
  .where('channel').in(['web', 'mobile'])
  .where('tags').all(['electronics', 'holiday'])
  .where('items').size(2)
  .where('items').elemMatch({ price: { $gte: 500 } })
  .exec();

// Works seamlessly on single-doc queries
const singleItem = await products.findOne()
  .where('rating').gte(4.5)
  .where('vendor.city').eq('Tokyo')
  .exec();

// Reactive subscriptions with fluent builder
const unsub = products.find()
  .where('price').lt(100)
  .$.subscribe((items) => {
    console.log('Affordable products in real-time:', items);
  });
```
