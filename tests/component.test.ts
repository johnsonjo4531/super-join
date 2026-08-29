// Component-adapter tests (src-js/component.ts).
//
// Verifies the TS boundary: request/result pass-through through an injected
// component loader, error normalization, and loader injection/reset. A stub
// loader is used so no Wasm artifact is needed.

import { afterEach, describe, expect, test, vi } from 'vitest';

import {
  compile,
  defaultComponentLoader,
  resetComponentLoaderForTesting,
  SuperJoinError,
  setComponentLoaderForTesting,
} from '../src-js/component.js';
import type { CompiledComponent, CompilerRequest } from '../src-js/wit.js';

const REQUEST: CompilerRequest = {
  model: { entities: [] },
  query: { root: 0n, queries: [] },
  options: { dialect: 'postgres' },
};

afterEach(() => {
  resetComponentLoaderForTesting();
  vi.restoreAllMocks();
});

describe('compile with an injected stub loader', () => {
  test('passes the artifact through unchanged', async () => {
    const stub: CompiledComponent = {
      compile: () => ({
        artifact: {
          sql: 'SELECT 1',
          parameters: [{ value: 1, dataType: 'int64' as const }],
          dialect: 'postgres' as const,
          selectedFields: [],
        },
      }),
    };
    setComponentLoaderForTesting(() => Promise.resolve(stub));
    const result = await compile(REQUEST);
    expect(result.artifact.sql).toBe('SELECT 1');
  });

  test('propagates a SuperJoinError with its code and message', async () => {
    const stub: CompiledComponent = {
      compile: () => {
        throw new SuperJoinError('unknown-field', 'missing field');
      },
    };
    setComponentLoaderForTesting(() => Promise.resolve(stub));
    await expect(compile(REQUEST)).rejects.toMatchObject({
      code: 'unknown-field',
      message: 'missing field',
    });
  });

  test('wraps a plain error whose message carries a known code', async () => {
    const stub: CompiledComponent = {
      compile: () => {
        throw new Error('invalid-request: malformed input');
      },
    };
    setComponentLoaderForTesting(() => Promise.resolve(stub));
    await expect(compile(REQUEST)).rejects.toBeInstanceOf(SuperJoinError);
    await expect(compile(REQUEST)).rejects.toMatchObject({ code: 'invalid-request' });
  });

  test('maps an unrelated error to invalid-request', async () => {
    const stub: CompiledComponent = {
      compile: () => {
        throw new Error('some internal trap');
      },
    };
    setComponentLoaderForTesting(() => Promise.resolve(stub));
    await expect(compile(REQUEST)).rejects.toMatchObject({ code: 'invalid-request' });
  });
});

describe('defaultComponentLoader', () => {
  test('exposes a compiled compile() from the bundled glue', async () => {
    const loader = await defaultComponentLoader();
    expect(typeof loader.compile).toBe('function');
  });
});

describe('real component integration', () => {
  test('compiles a nested relation request through the wasm component', async () => {
    const loader = await defaultComponentLoader();
    const field = (id: bigint, name: string) => ({
      id,
      identifier: { components: [name] },
      dataType: 'int64' as const,
      nullable: false,
      selectable: true,
    });
    const request: CompilerRequest = {
      model: {
        entities: [
          {
            id: 0n,
            source: { components: ['public', 'users'] },
            fields: [field(0n, 'id'), field(1n, 'name')],
            relations: [
              {
                id: 100n,
                target: 1n,
                cardinality: 'many' as const,
                join: {
                  nodes: [
                    { kind: 'column', column: 11n, operands: new BigUint64Array(0), values: [] },
                    { kind: 'parent-column', column: 0n, depth: 1n, operands: new BigUint64Array(0), values: [] },
                    {
                      kind: 'compare',
                      compareOp: 'eq' as const,
                      operands: new BigUint64Array([0n, 1n]),
                      values: [],
                    },
                  ],
                },
              },
            ],
          },
          {
            id: 1n,
            source: { components: ['public', 'posts'] },
            fields: [field(10n, 'id'), field(11n, 'author_id'), field(12n, 'title')],
            relations: [],
          },
        ],
      },
      query: {
        root: 1n,
        queries: [
          {
            entity: 1n,
            selection: [
              { kind: 'field', field: 12n, outputKey: 'posts__title', path: ['users', 'posts', 'title'], queryRef: null },
            ],
            predicate: [],
            orderBy: [],
            limit: null,
            offset: null,
            path: ['users', 'posts'],
            nested: new BigUint64Array(0),
          },
          {
            entity: 0n,
            selection: [
              { kind: 'field', field: 0n, outputKey: 'id', path: ['users', 'id'], queryRef: null },
              { kind: 'relation', relation: 100n, outputKey: 'posts', path: ['users', 'posts'], queryRef: 0n },
            ],
            predicate: [
              {
                kind: 'parameter',
                value: { tag: 'integer', val: 42n },
                dataType: 'int64',
                operands: new BigUint64Array(0),
                values: [],
              },
              { kind: 'column', column: 0n, operands: new BigUint64Array(0), values: [] },
              {
                kind: 'compare',
                compareOp: 'eq' as const,
                operands: new BigUint64Array([1n, 0n]),
                values: [],
              },
            ],
            orderBy: [],
            limit: null,
            offset: null,
            path: ['users'],
            nested: new BigUint64Array(0),
          },
        ],
      },
      options: { dialect: 'postgres' as const },
    };
    const result = loader.compile(request);
    expect(result.artifact.sql).toContain('LEFT OUTER JOIN "public"."posts" AS "posts"');
    expect(result.artifact.sql).toContain('"users"."id" = $1');
    expect(result.artifact.parameters.length).toBe(1);
    expect(result.artifact.resultShape.kind).toBe('nested');
  });

  test('rejects a malformed expression with a structured error, not a trap', async () => {
    const loader = await defaultComponentLoader();
    const request: CompilerRequest = {
      model: { entities: [] },
      query: {
        root: 0n,
        queries: [
          {
            entity: 0n,
            selection: [],
            predicate: [
              // compare node referencing an operand that does not exist.
              { kind: 'compare', compareOp: 'eq' as const, operands: new BigUint64Array([9n, 8n]), values: [] },
            ],
            orderBy: [],
            limit: null,
            offset: null,
            path: ['users'],
            nested: new BigUint64Array(0),
          },
        ],
      },
      options: { dialect: 'postgres' as const },
    };
    // wit-bindgen returns the typed Err payload; the glue throws it as an error
    // carrying the stable code.
    try {
      loader.compile(request);
      expect.unreachable('expected a structured compiler error');
    } catch (error) {
      const payload = (error as { payload?: { code?: string } }).payload;
      expect(payload?.code).toBe('invalid-expression');
    }
  });
});
