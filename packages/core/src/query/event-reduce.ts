import { ChangeEvent, DocumentWithMeta, FilterQuery, QueryOptions } from '../types';
import { applySortAndPagination, matchQuery } from './matcher';

export type EventReduceAction = 'run-full-query' | 'do-nothing' | 'insert' | 'update' | 'remove';

export interface EventReduceDecision<T> {
  action: EventReduceAction;
  updatedResult?: DocumentWithMeta<T>[];
}

/**
 * EventReduce Algorithm:
 * Evaluates whether an incoming ChangeEvent (insert/update/delete) actually affects
 * the cached query result set. If not, it skips running a full expensive disk query
 * and avoids triggering unnecessary React / Vue UI re-renders.
 */
export function calculateEventReduce<T>(
  previousResult: DocumentWithMeta<T>[] | null,
  changeEvent: ChangeEvent<T>,
  filter?: FilterQuery<T>,
  options?: QueryOptions<T>
): EventReduceDecision<T> {
  // If there is no previous result cached, we must run the full query
  if (!previousResult) {
    return { action: 'run-full-query' };
  }

  const { type, doc, previous } = changeEvent;
  const isSortedOrLimited = Boolean(options?.sort || options?.limit || options?.skip);

  // 1. DELETE EVENT
  if (type === 'delete') {
    const existingIndex = previousResult.findIndex((item) => item.id === changeEvent.id);
    if (existingIndex === -1) {
      // Document was never part of this query result -> DO NOTHING!
      return { action: 'do-nothing' };
    }

    if (options?.limit && previousResult.length === options.limit) {
      // If result set has a limit and an item was removed, we need to query disk to backfill the next item
      return { action: 'run-full-query' };
    }

    // In-memory removal without querying disk
    const updated = [...previousResult];
    updated.splice(existingIndex, 1);
    return { action: 'remove', updatedResult: updated };
  }

  // 2. INSERT EVENT
  if (type === 'insert' && doc) {
    const matches = matchQuery(doc, filter);
    if (!matches) {
      // Document does not match filter criteria -> DO NOTHING!
      return { action: 'do-nothing' };
    }

    // If query has sorting or limits, running full query or re-sorting is safer
    if (isSortedOrLimited) {
      return { action: 'run-full-query' };
    }

    // Append directly in-memory
    const updated = [...previousResult, doc];
    return { action: 'insert', updatedResult: updated };
  }

  // 3. UPDATE EVENT
  if (type === 'update' && doc) {
    const existingIndex = previousResult.findIndex((item) => item.id === doc.id);
    const matchesNow = matchQuery(doc, filter);

    if (existingIndex === -1) {
      if (!matchesNow) {
        // Document didn't match before and doesn't match now -> DO NOTHING!
        return { action: 'do-nothing' };
      }
      // Document now newly matches this query
      return { action: 'run-full-query' };
    }

    // It was in the result set before
    if (!matchesNow) {
      // Document no longer matches -> removed from result set
      if (options?.limit) {
        return { action: 'run-full-query' };
      }
      const updated = [...previousResult];
      updated.splice(existingIndex, 1);
      return { action: 'remove', updatedResult: updated };
    }

    // Still matches: check if anything actually changed
    const oldDoc = previousResult[existingIndex];
    if (JSON.stringify(oldDoc) === JSON.stringify(doc)) {
      return { action: 'do-nothing' };
    }

    if (options?.sort) {
      // Re-sort needed
      const updated = [...previousResult];
      updated[existingIndex] = doc;
      return {
        action: 'update',
        updatedResult: applySortAndPagination(updated, options)
      };
    }

    const updated = [...previousResult];
    updated[existingIndex] = doc;
    return { action: 'update', updatedResult: updated };
  }

  return { action: 'run-full-query' };
}
