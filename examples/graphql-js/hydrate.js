// Hydration: regrouping the artifact's flattened rows back into nested
// entities. Super-Join describes how rows regroup (`artifact.resultShape`);
// this file does the regrouping. It is driven entirely by the result-shape
// metadata — no hard-coded column names — and handles any nesting depth.
// See docs/super-join/guides/result-shape-and-hydration.md in super-join.

/** Key for grouping rows by one or more identity columns. */
function identityKey(row, columns) {
  const parts = [];
  for (const { alias } of columns) {
    const value = row[alias];
    if (value === null || value === undefined) return null; // LEFT JOIN miss
    parts.push(String(value));
  }
  return parts.join('\u0000');
}

/**
 * Regroups flattened rows into nested entities using `artifact.resultShape`.
 * A `flat` shape returns the rows unchanged. For `nested` shapes every nesting
 * level (root-to-leaf) attaches child objects under their parent's relation
 * field; children with a null identity are treated as "no children".
 */
export function hydrate(rows, artifact) {
  const shape = artifact.resultShape;
  if (shape.kind === 'flat' || shape.nesting.length === 0) {
    return rows;
  }

  // Scalar columns of each entity occurrence, keyed by the occurrence path.
  const occurrenceOf = (path) => path.slice(0, -1).join('.');
  const scalarsByOccurrence = new Map();
  for (const column of shape.rows) {
    const key = occurrenceOf(column.path);
    const list = scalarsByOccurrence.get(key) ?? [];
    list.push({ alias: column.alias, name: column.path[column.path.length - 1] });
    scalarsByOccurrence.set(key, list);
  }

  const levels = [...shape.nesting].sort((a, b) => a.path.length - b.path.length);
  const roots = new Map();
  const rootOccurrence = levels[0].path.slice(0, -1);

  for (const row of rows) {
    const rootKey = identityKey(row, levels[0].parentIdentity);
    if (rootKey === null) continue;
    let parent = roots.get(rootKey);
    if (!parent) {
      parent = {};
      for (const { alias, name } of scalarsByOccurrence.get(rootOccurrence.join('.')) ?? []) {
        parent[name] = row[alias];
      }
      Object.defineProperty(parent, '__sj_children', { value: new Map() });
      roots.set(rootKey, parent);
    }

    let current = parent;
    for (const level of levels) {
      const relationName = level.path[level.path.length - 1];
      if (!current[relationName]) current[relationName] = [];
      const childKey = identityKey(row, level.childIdentity);
      if (childKey === null) break; // no child for this row: empty list stays
      let bucket = current.__sj_children.get(relationName);
      if (!bucket) {
        bucket = new Map();
        current.__sj_children.set(relationName, bucket);
      }
      let child = bucket.get(childKey);
      if (!child) {
        child = {};
        for (const { alias, name } of scalarsByOccurrence.get(level.path.join('.')) ?? []) {
          child[name] = row[alias];
        }
        Object.defineProperty(child, '__sj_children', { value: new Map() });
        bucket.set(childKey, child);
        current[relationName].push(child);
      }
      current = child;
    }
  }

  return [...roots.values()];
}
