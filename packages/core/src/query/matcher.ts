import { DocumentWithMeta, FilterQuery, QueryOptions } from '../types';

export function getNestedProperty(obj: unknown, path: string): unknown {
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return undefined;
  }
  if (!path.includes('.')) {
    return (obj as Record<string, unknown>)[path];
  }
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function getFieldType(val: unknown): string {
  if (val === null) return 'null';
  if (val === undefined) return 'undefined';
  if (Array.isArray(val)) return 'array';
  return typeof val;
}

function evaluateFieldCondition(docValue: unknown, condition: unknown): boolean {
  if (condition instanceof RegExp) {
    return typeof docValue === 'string' && condition.test(docValue);
  }

  if (condition !== null && typeof condition === 'object' && !Array.isArray(condition)) {
    const cond = condition as Record<string, unknown>;
    if ('$exists' in cond) {
      const exists = docValue !== undefined;
      if (Boolean(cond.$exists) !== exists) return false;
    }
    if ('$type' in cond) {
      const expectedType = String(cond.$type).toLowerCase();
      const actualType = getFieldType(docValue);
      if (actualType !== expectedType) return false;
    }
    if ('$eq' in cond && docValue !== cond.$eq) return false;
    if ('$ne' in cond && docValue === cond.$ne) return false;
    if ('$gt' in cond && !(typeof docValue === typeof cond.$gt && (docValue as number) > (cond.$gt as number))) return false;
    if ('$gte' in cond && !(typeof docValue === typeof cond.$gte && (docValue as number) >= (cond.$gte as number))) return false;
    if ('$lt' in cond && !(typeof docValue === typeof cond.$lt && (docValue as number) < (cond.$lt as number))) return false;
    if ('$lte' in cond && !(typeof docValue === typeof cond.$lte && (docValue as number) <= (cond.$lte as number))) return false;
    if ('$in' in cond && Array.isArray(cond.$in) && !cond.$in.includes(docValue)) return false;
    if ('$nin' in cond && Array.isArray(cond.$nin) && cond.$nin.includes(docValue)) return false;
    if ('$regex' in cond) {
      if (typeof docValue !== 'string') return false;
      const regexVal = cond.$regex;
      const flags = typeof cond.$options === 'string' ? cond.$options : undefined;
      const re = regexVal instanceof RegExp ? regexVal : new RegExp(String(regexVal), flags);
      if (!re.test(docValue)) return false;
    }
    if ('$not' in cond && evaluateFieldCondition(docValue, cond.$not)) return false;
    return true;
  }
  return docValue === condition;
}

export function matchQuery<T>(doc: DocumentWithMeta<T>, filter?: FilterQuery<T>): boolean {
  if (!filter || Object.keys(filter).length === 0) {
    return !doc._deleted;
  }

  // Soft deleted documents are excluded by default unless explicitly queried
  if (doc._deleted && (filter as Record<string, unknown>)._deleted === undefined) {
    return false;
  }

  for (const [key, condition] of Object.entries(filter)) {
    // 1. Logical $and: every sub-filter must match
    if (key === '$and') {
      if (Array.isArray(condition)) {
        for (const subFilter of condition) {
          if (!matchQuery(doc, subFilter as FilterQuery<T>)) return false;
        }
      }
      continue;
    }

    // 2. Logical $or: at least one sub-filter must match
    if (key === '$or') {
      if (Array.isArray(condition) && condition.length > 0) {
        const matchesAny = condition.some(subFilter => matchQuery(doc, subFilter as FilterQuery<T>));
        if (!matchesAny) return false;
      }
      continue;
    }

    // 3. Logical $nor: no sub-filter must match
    if (key === '$nor') {
      if (Array.isArray(condition) && condition.length > 0) {
        const matchesAny = condition.some(subFilter => matchQuery(doc, subFilter as FilterQuery<T>));
        if (matchesAny) return false;
      }
      continue;
    }

    // 4. Logical $not: inverted sub-filter
    if (key === '$not') {
      if (condition && typeof condition === 'object') {
        if (matchQuery(doc, condition as FilterQuery<T>)) return false;
      }
      continue;
    }

    // Standard or nested dot-notation field condition
    const docValue = getNestedProperty(doc, key);
    if (!evaluateFieldCondition(docValue, condition)) {
      return false;
    }
  }

  return true;
}

export function applySortAndPagination<T>(
  docs: DocumentWithMeta<T>[],
  options?: QueryOptions<T>
): DocumentWithMeta<T>[] {
  let result = [...docs];

  if (options?.sort) {
    const [sortKey, sortDir] = Object.entries(options.sort)[0] as [string, string | number];
    const isAsc = sortDir === 'asc' || sortDir === 1;

    result.sort((a, b) => {
      const valA = getNestedProperty(a, sortKey) as string | number | undefined | null;
      const valB = getNestedProperty(b, sortKey) as string | number | undefined | null;

      if (valA === valB) return 0;
      if (valA === undefined || valA === null) return isAsc ? -1 : 1;
      if (valB === undefined || valB === null) return isAsc ? 1 : -1;

      if (valA < valB) return isAsc ? -1 : 1;
      return isAsc ? 1 : -1;
    });
  }

  if (options?.skip && options.skip > 0) {
    result = result.slice(options.skip);
  }

  if (options?.limit && options.limit > 0) {
    result = result.slice(0, options.limit);
  }

  return result;
}
