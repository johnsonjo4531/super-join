// superjoin main-API tests (src-js/superjoin.ts).
//
// The component loader is stubbed so no Wasm artifact is needed: the stub
// returns a fixed SQL artifact, `superjoin` hands it to the driver callback,
// and the flattened rows come back hydrated.

import { afterEach, describe, expect, test } from 'vitest';

import { resetComponentLoaderForTesting, setComponentLoaderForTesting, SuperJoinError } from '../src-js/component.js';
import type { CompiledComponent } from '../src-js/component.js';
import { superjoin } from '../src-js/superjoin.js';
import type { CompilerRequest, SqlArtifact } from '../src-js/wit.js';

import { makeModel, makeResolveInfo } from './__fixtures__/graphql.js';

const REQUEST: CompilerRequest = {
  model: { entities: [] },
  query: { root: 0n, queries: [] },
  options: { dialect: 'postgres' },
};

/** A nested artifact for `{ users { id posts { title } } }`. */
function nestedArtifact(): SqlArtifact {
  return {
    sql: 'SELECT "users"."id" AS "id", ... FROM "users" AS "users" LEFT OUTER JOIN "posts" ...',
    parameters: [],
    dialect: 'postgres',
    selectedFields: [
      { alias: 'id', field: 0n, path: ['users', 'id'] },
      { alias: 'title', field: 3n, path: ['users', 'posts', 'title'] },
      { alias: '__sj_identity_posts_id', field: 2n, path: ['users', 'posts', 'id'] },
    ],
    resultShape: {
      kind: 'nested',
      rows: [
        { alias: 'id', field: 0n, path: ['users', 'id'] },
        { alias: 'title', field: 3n, path: ['users', 'posts', 'title'] },
        { alias: '__sj_identity_posts_id', field: 2n, path: ['users', 'posts', 'id'] },
      ],
      nesting: [
        {
          path: ['users', 'posts'],
          parentAlias: 'users',
          childAlias: 'posts',
          parentIdentity: [{ field: 0n, alias: 'id' }],
          childIdentity: [{ field: 2n, alias: '__sj_identity_posts_id' }],
        },
      ],
    },
  };
}

afterEach(() => {
  resetComponentLoaderForTesting();
});

describe('superjoin', () => {
  test('compiles, hands the artifact to the driver callback, and hydrates', async () => {
    const stub: CompiledComponent = { compile: () => ({ artifact: nestedArtifact() }) };
    setComponentLoaderForTesting(() => Promise.resolve(stub));

    const seen: SqlArtifact[] = [];
    const entities = await superjoin(REQUEST, (artifact) => {
      seen.push(artifact);
      return [
        { id: 1n, title: 'hello', __sj_identity_posts_id: 101n },
        { id: 1n, title: 'world', __sj_identity_posts_id: 102n },
      ];
    });

    expect(seen.length).toBe(1);
    expect(seen[0]!.sql).toContain('LEFT OUTER JOIN');
    expect(entities).toEqual([
      {
        id: 1n,
        posts: [
          { id: 101n, title: 'hello' },
          { id: 102n, title: 'world' },
        ],
      },
    ]);
  });

  test('awaits async driver callbacks', async () => {
    const stub: CompiledComponent = { compile: () => ({ artifact: nestedArtifact() }) };
    setComponentLoaderForTesting(() => Promise.resolve(stub));
    const entities = await superjoin(REQUEST, async () => [
      { id: 2n, title: 'only', __sj_identity_posts_id: 201n },
    ]);
    expect(entities).toEqual([{ id: 2n, posts: [{ id: 201n, title: 'only' }] }]);
  });

  test('a compile failure surfaces as SuperJoinError and skips the callback', async () => {
    const stub: CompiledComponent = {
      compile: () => {
        throw new SuperJoinError('unknown-field', 'missing field');
      },
    };
    setComponentLoaderForTesting(() => Promise.resolve(stub));
    let executed = false;
    await expect(
      superjoin(REQUEST, () => {
        executed = true;
        return [];
      }),
    ).rejects.toMatchObject({ code: 'unknown-field' });
    expect(executed).toBe(false);
  });

  test('superjoin.graphql translates ResolveInfo then runs the same pipeline', async () => {
    const stub: CompiledComponent = { compile: () => ({ artifact: nestedArtifact() }) };
    setComponentLoaderForTesting(() => Promise.resolve(stub));

    let compiledRequest: CompilerRequest | undefined;
    const realStub: CompiledComponent = {
      compile: (request) => {
        compiledRequest = request;
        return { artifact: nestedArtifact() };
      },
    };
    setComponentLoaderForTesting(() => Promise.resolve(realStub));

    const resolveInfo = makeResolveInfo({
      query: `query { users { id posts { title } } }`,
      fieldName: 'users',
      parentType: { name: 'Query' },
      returnType: { name: 'User' },
    });
    const entities = await superjoin.graphql({
      resolveInfo,
      context: {},
      model: makeModel(),
      execute: () => [{ id: 1n, title: 'hello', __sj_identity_posts_id: 101n }],
    });

    expect(compiledRequest).toBeDefined();
    expect(entities).toEqual([{ id: 1n, posts: [{ id: 101n, title: 'hello' }] }]);
  });
});
