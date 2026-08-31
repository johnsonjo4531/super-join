// Hydration tests (src-js/hydration.ts). Pure function: no Wasm component is
// needed — the result-shape metadata drives everything.

import { describe, expect, test } from 'vitest';

import { hydrate } from '../src-js/hydration.js';
import type { SqlArtifact } from '../src-js/wit.js';

function artifact(shape: SqlArtifact['resultShape']): SqlArtifact {
  return {
    sql: 'SELECT ...',
    parameters: [],
    dialect: 'postgres',
    selectedFields: shape.rows,
    resultShape: shape,
  };
}

describe('hydrate', () => {
  test('flat shapes return the rows unchanged', () => {
    const rows = [
      { id: 1n },
      { id: 2n },
    ];
    const out = hydrate(rows, artifact({ kind: 'flat', rows: [{ alias: 'id', field: 0n, path: ['users', 'id'] }], nesting: [] }));
    expect(out).toEqual(rows);
  });

  test('one nesting level regroups parents and children', () => {
    const shape = artifact({
      kind: 'nested',
      rows: [
        { alias: 'id', field: 0n, path: ['users', 'id'] },
        { alias: 'postId', field: 2n, path: ['users', 'posts', 'id'] },
        { alias: 'views', field: 4n, path: ['users', 'posts', 'views'] },
      ],
      nesting: [
        {
          path: ['users', 'posts'],
          parentAlias: 'users',
          childAlias: 'posts',
          parentIdentity: [{ field: 0n, alias: 'id' }],
          childIdentity: [{ field: 2n, alias: 'postId' }],
        },
      ],
    });
    const out = hydrate(
      [
        { id: 1n, postId: 101n, views: 5n },
        { id: 1n, postId: 102n, views: 9n },
        { id: 2n, postId: null, views: null },
      ],
      shape,
    );
    expect(out).toEqual([
      {
        id: 1n,
        posts: [
          { id: 101n, views: 5n },
          { id: 102n, views: 9n },
        ],
      },
      { id: 2n, posts: [] },
    ]);
  });

  test('deep nesting regroups every level', () => {
    const shape = artifact({
      kind: 'nested',
      rows: [
        { alias: 'id', field: 0n, path: ['users', 'id'] },
        { alias: '__sj_identity_posts_id', field: 2n, path: ['users', 'posts', 'id'] },
        { alias: '__sj_identity_comments_id', field: 5n, path: ['users', 'posts', 'comments', 'id'] },
        { alias: 'comment', field: 6n, path: ['users', 'posts', 'comments', 'body'] },
      ],
      nesting: [
        {
          path: ['users', 'posts'],
          parentAlias: 'users',
          childAlias: 'posts',
          parentIdentity: [{ field: 0n, alias: 'id' }],
          childIdentity: [{ field: 2n, alias: '__sj_identity_posts_id' }],
        },
        {
          path: ['users', 'posts', 'comments'],
          parentAlias: 'posts',
          childAlias: 'comments',
          parentIdentity: [{ field: 2n, alias: '__sj_identity_posts_id' }],
          childIdentity: [{ field: 5n, alias: '__sj_identity_comments_id' }],
        },
      ],
    });
    const out = hydrate(
      [
        { id: 1n, __sj_identity_posts_id: 101n, comment: 'hi', __sj_identity_comments_id: 7n },
        { id: 1n, __sj_identity_posts_id: 101n, comment: 'yo', __sj_identity_comments_id: 8n },
        { id: 1n, __sj_identity_posts_id: 102n, comment: null, __sj_identity_comments_id: null },
      ],
      shape,
    );
    expect(out).toEqual([
      {
        id: 1n,
        posts: [
          {
            id: 101n,
            comments: [
              { body: 'hi', id: 7n },
              { body: 'yo', id: 8n },
            ],
          },
          { id: 102n, comments: [] },
        ],
      },
    ]);
  });

  test('auto-selected identity columns do not shadow the relation field', () => {
    // The compiler auto-selects an unselected child id under a namespaced
    // alias; its row path ends with the field name, so it must land on the
    // child as `id` and never overwrite the parent's `posts` list.
    const shape = artifact({
      kind: 'nested',
      rows: [
        { alias: 'id', field: 0n, path: ['users', 'id'] },
        { alias: 'views', field: 4n, path: ['users', 'posts', 'views'] },
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
    });
    const out = hydrate(
      [
        { id: 1n, views: 5n, __sj_identity_posts_id: 101n },
        { id: 2n, views: null, __sj_identity_posts_id: null },
      ],
      shape,
    );
    expect(out).toEqual([
      { id: 1n, posts: [{ views: 5n, id: 101n }] },
      { id: 2n, posts: [] },
    ]);
  });

  test('hydrated entities do not expose the internal children bucket', () => {
    const shape = artifact({
      kind: 'nested',
      rows: [
        { alias: 'id', field: 0n, path: ['users', 'id'] },
        { alias: 'postId', field: 2n, path: ['users', 'posts', 'id'] },
      ],
      nesting: [
        {
          path: ['users', 'posts'],
          parentAlias: 'users',
          childAlias: 'posts',
          parentIdentity: [{ field: 0n, alias: 'id' }],
          childIdentity: [{ field: 2n, alias: 'postId' }],
        },
      ],
    });
    const out = hydrate([{ id: '1', postId: '101' }], shape);
    expect(Object.keys(out[0]!)).toEqual(['id', 'posts']);
    expect(JSON.parse(JSON.stringify(out))).toEqual([{ id: '1', posts: [{ id: '101' }] }]);
  });
});
