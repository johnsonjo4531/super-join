// Unit tests for the ExpressionBuilder (src-js/expressions.ts).
// Exercises shape, resolution, optional-term omission, flatten order, and null
// handling. No Wasm or database is required.

import { describe, expect, test } from 'vitest';

import { ExpressionBuilder, expr } from '../src-js/expressions.js';

const RESOLVER = (name: string): bigint | undefined => {
  const ids: Record<string, bigint> = { id: 0n, name: 1n, status: 5n, a: 10n, b: 11n, c: 12n };
  return ids[name];
};

const LAST = (nodes: Array<unknown>): { kind: string } =>
  (nodes[nodes.length - 1] as { kind: string });

describe('ExpressionBuilder.column', () => {
  test('resolves a string field through the resolver to a numeric id', () => {
    const builder = new ExpressionBuilder(RESOLVER);
    const { nodes } = builder.build(builder.column('status'));
    expect(nodes.length).toBe(1);
    expect(nodes[0]?.kind).toBe('column');
    expect(nodes[0]?.column).toBe(5n);
  });

  test('accepts an explicit bigint id without a resolver', () => {
    const builder = new ExpressionBuilder();
    const { nodes } = builder.build(builder.column(7n));
    expect(nodes[0]?.kind).toBe('column');
    expect(nodes[0]?.column).toBe(7n);
  });

  test('throws when a string column has no resolver', () => {
    const builder = new ExpressionBuilder();
    expect(() => builder.build(builder.column('name'))).toThrow(/numeric field id/);
  });

  test('throws when the resolver rejects a field', () => {
    const builder = new ExpressionBuilder((name) => (name === 'missing' ? undefined : 0n));
    expect(() => builder.build(builder.column('missing'))).toThrow(/rejected field/);
  });
});

describe('ExpressionBuilder.literal', () => {
  test('maps integers to an integer tag', () => {
    const { nodes } = expr.build(expr.literal(42, 'int64'));
    expect(nodes[0]).toEqual({
      kind: 'parameter',
      value: { tag: 'integer', val: 42n },
      dataType: 'int64',
      operands: new BigUint64Array(0),
      values: [],
    });
  });

  test('maps floats to a float tag and text to a text tag', () => {
    expect(expr.build(expr.literal(3.5, 'float64')).nodes[0]?.value).toEqual({
      tag: 'float',
      val: 3.5,
    });
    expect(expr.build(expr.literal('ACTIVE', 'text')).nodes[0]?.value).toEqual({
      tag: 'text',
      val: 'ACTIVE',
    });
  });
});

describe('ExpressionBuilder.compare', () => {
  test('references operands by their topological indices', () => {
    const builder = new ExpressionBuilder(RESOLVER);
    const spec = builder.compare('eq', builder.column('status'), expr.literal(1, 'int64'));
    const { nodes } = builder.build(spec);
    expect(nodes.map((n) => n?.kind)).toEqual(['column', 'parameter', 'compare']);
    expect(LAST(nodes).operands).toEqual(BigUint64Array.from([0n, 1n]));
  });
});

describe('ExpressionBuilder booleans and null', () => {
  test('flattens nested same-operator terms', () => {
    const builder = new ExpressionBuilder(RESOLVER);
    const spec = builder.and(
      builder.and(builder.column('a'), builder.column('b')),
      builder.column('c'),
    );
    const { nodes } = builder.build(spec);
    const last = LAST(nodes);
    expect(last.kind).toBe('boolean-and');
    expect(last.operands).toEqual(BigUint64Array.from([0n, 1n, 2n]));
  });

  test('skips absent optional operands but still emits the and node', () => {
    const builder = new ExpressionBuilder(RESOLVER);
    const spec = builder.and(builder.column('a'), undefined as never, builder.column('b'));
    const { nodes } = builder.build(spec);
    // The undefined operand is skipped; the boolean-and node has the two terms.
    expect(LAST(nodes).kind).toBe('boolean-and');
    expect(LAST(nodes).operands).toEqual(BigUint64Array.from([0n, 1n]));
  });

  test('throws when an and/or has no remaining operands', () => {
    const builder = new ExpressionBuilder(RESOLVER);
    expect(() => builder.build(builder.and(undefined as never))).toThrow(/at least one operand/);
  });

  test('is-null / is-not-null are the supported null tests', () => {
    // Equality against null is a caller misuse; the supported path is an
    // explicit null-test node, which the renderer emits as IS NULL / IS NOT NULL.
    const builder = new ExpressionBuilder(RESOLVER);
    const built = builder.build(builder.isNotNull(builder.column('name')));
    expect(LAST(built.nodes).kind).toBe('is-not-null');
  });

  test('supports is-null / is-not-null', () => {
    const builder = new ExpressionBuilder(RESOLVER);
    const notNull = builder.build(builder.isNotNull(builder.column('name')));
    expect(LAST(notNull.nodes).kind).toBe('is-not-null');
    const isNull = builder.build(builder.isNull(builder.column('name')));
    expect(LAST(isNull.nodes).kind).toBe('is-null');
  });

  test('supports in-list membership with mapped values', () => {
    const builder = new ExpressionBuilder(RESOLVER);
    const spec = builder.inList(builder.column('status'), [
      { value: 'A', dataType: 'text' as const },
      { value: 'B', dataType: 'text' as const },
    ]);
    const { nodes } = builder.build(spec);
    const last = LAST(nodes);
    expect(last.kind).toBe('in-list');
    expect(last.values).toEqual([
      { value: { tag: 'text', val: 'A' }, dataType: 'text' },
      { value: { tag: 'text', val: 'B' }, dataType: 'text' },
    ]);
  });
});
