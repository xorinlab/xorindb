import { DocumentWithMeta, FilterQuery, QueryOptions } from '../types';

export function matchQuery<T>(doc: DocumentWithMeta<T>, filter?: FilterQuery<T>): boolean {
  if (!filter || Object.keys(filter).length === 0) {
    return !doc._deleted;
  }

  // Soft deleted documents are excluded by default unless explicitly queried
  if (doc._deleted && (filter as Record<string, unknown>)._deleted === undefined) {
    return false;
  }

  for (const [key, condition] of Object.entries(filter)) {
    const docValue = (doc as Record<string, unknown>)[key];

    if (condition !== null && typeof condition === 'object' && !Array.isArray(condition)) {
      const cond = condition as Record<string, unknown>;
      if ('$eq' in cond && docValue !== cond.$eq) return false;
      if ('$ne' in cond && docValue === cond.$ne) return false;
      if ('$gt' in cond && !(typeof docValue === typeof cond.$gt && (docValue as number) > (cond.$gt as number))) return false;
      if ('$gte' in cond && !(typeof docValue === typeof cond.$gte && (docValue as number) >= (cond.$gte as number))) return false;
      if ('$lt' in cond && !(typeof docValue === typeof cond.$lt && (docValue as number) < (cond.$lt as number))) return false;
      if ('$lte' in cond && !(typeof docValue === typeof cond.$lte && (docValue as number) <= (cond.$lte as number))) return false;
      if ('$in' in cond && Array.isArray(cond.$in) && !cond.$in.includes(docValue)) return false;
      if ('$nin' in cond && Array.isArray(cond.$nin) && cond.$nin.includes(docValue)) return false;
    } else {
      if (docValue !== condition) return false;
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
    const [sortKey, sortDir] = Object.entries(options.sort)[0] as [keyof T, string | number];
    const isAsc = sortDir === 'asc' || sortDir === 1;

    result.sort((a, b) => {
      const valA = (a as Record<keyof T, unknown>)[sortKey];
      const valB = (b as Record<keyof T, unknown>)[sortKey];

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
