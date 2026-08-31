// Hydration: regrouping an artifact's flattened rows back into nested entities.
//
// The compiler returns one flat SQL result set even when the request nests
// relations; `artifact.resultShape` describes how the rows regroup. This module
// performs that regrouping generically: it is driven entirely by the
// result-shape metadata (no hard-coded column names) and handles any nesting
// depth. It never executes SQL and never mutates the input rows.

import type { SqlArtifact } from './wit.js';

/** A hydrated entity: plain data keyed by GraphQL field name. */
export type HydratedEntity = Record<string, unknown>;

/** Key for grouping rows by one or more identity columns; `null` on a LEFT JOIN miss. */
function identityKey<TRow extends Record<string, unknown>>(
  row: TRow,
  columns: ReadonlyArray<{ alias: string }>,
): string | null {
  const parts: string[] = [];
  for (const { alias } of columns) {
    const value = row[alias];
    if (value === null || value === undefined) return null;
    parts.push(String(value));
  }
  return parts.join('');
}

/**
 * Regroups the flattened rows of an SQL artifact into nested entities using
 * `artifact.resultShape`. A `flat` shape returns the rows unchanged. Every
 * nesting level (root-to-leaf) attaches child objects under their parent's
 * relation field; children with a null identity are treated as "no children"
 * and stay empty lists. Works at any nesting depth and for any relation name:
 * nothing here is specific to one request.
 */
export function hydrate<TRow extends Record<string, unknown>>(
  rows: readonly TRow[],
  artifact: SqlArtifact,
): HydratedEntity[] {
  const shape = artifact.resultShape;
  if (shape.kind === 'flat' || shape.nesting.length === 0) {
    return [...rows];
  }
  if (shape.kind === 'json') {
    throw new Error('hydration of a "json" result shape is not implemented yet');
  }

  // Scalar columns of each entity occurrence, keyed by the occurrence path.
  const occurrenceOf = (path: readonly string[]) => path.slice(0, -1).join('.');
  const scalarsByOccurrence = new Map<string, Array<{ alias: string; name: string }>>();
  for (const column of shape.rows) {
    const key = occurrenceOf(column.path);
    const list = scalarsByOccurrence.get(key) ?? [];
    list.push({ alias: column.alias, name: column.path[column.path.length - 1]! });
    scalarsByOccurrence.set(key, list);
  }

  const levels = [...shape.nesting].sort((a, b) => a.path.length - b.path.length);
  const roots = new Map<string, HydratedEntity>();
  const rootOccurrence = levels[0]!.path.slice(0, -1).join('.');

  for (const row of rows) {
    const rootKey = identityKey(row, levels[0]!.parentIdentity);
    if (rootKey === null) continue;
    let parent = roots.get(rootKey);
    if (!parent) {
      parent = {};
      for (const { alias, name } of scalarsByOccurrence.get(rootOccurrence) ?? []) {
        parent[name] = row[alias];
      }
      Object.defineProperty(parent, '__sj_children', { value: new Map(), enumerable: false });
      roots.set(rootKey, parent);
    }

    let current = parent;
    for (const level of levels) {
      const relationName = level.path[level.path.length - 1]!;
      if (!current[relationName]) current[relationName] = [];
      const childKey = identityKey(row, level.childIdentity);
      if (childKey === null) break; // no child for this row: the empty list stays
      let bucket = (current.__sj_children as Map<string, Map<string, HydratedEntity>>).get(relationName);
      if (!bucket) {
        bucket = new Map();
        (current.__sj_children as Map<string, Map<string, HydratedEntity>>).set(relationName, bucket);
      }
      let child = bucket.get(childKey);
      if (!child) {
        child = {};
        for (const { alias, name } of scalarsByOccurrence.get(level.path.join('.')) ?? []) {
          child[name] = row[alias];
        }
        Object.defineProperty(child, '__sj_children', { value: new Map(), enumerable: false });
        bucket.set(childKey, child);
        (current[relationName] as HydratedEntity[]).push(child);
      }
      current = child;
    }
  }

  return [...roots.values()];
}
