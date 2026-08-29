// Test fixtures for super-join.
//
// These describe a small relational model plus a GraphQL schema that reference
// it. The model uses logical field ids that the GraphQL layer maps through
// context resolvers, mirroring how a real deployment wires a GraphQL schema to
// a database schema.

import type { Model } from '../../src-js/wit.js';

export const USER_ENTITY_ID = 0n;
export const POST_ENTITY_ID = 1n;
export const USER_ID_FIELD_ID = 0n;
export const USER_NAME_FIELD_ID = 1n;
export const POST_ID_FIELD_ID = 2n;
export const POST_TITLE_FIELD_ID = 3n;
export const POST_AUTHOR_FIELD_ID = 4n;
export const USER_POSTS_RELATION_ID = 0n;

export const model: Model = {
  entities: [
    {
      id: USER_ENTITY_ID,
      source: 'users',
      fields: [
        { id: USER_ID_FIELD_ID, identifier: { components: ['id'] }, name: 'id', type: 'int64', nullable: false, selectable: true },
        {
          id: USER_NAME_FIELD_ID,
          identifier: { components: ['name'] },
          name: 'name',
          type: 'text',
          nullable: false,
          selectable: true,
        },
      ],
      relations: [
        {
          id: USER_POSTS_RELATION_ID,
          target: POST_ENTITY_ID,
          cardinality: 'many',
          join: { nodes: [] },
        },
      ],
    },
    {
      id: POST_ENTITY_ID,
      source: 'posts',
      fields: [
        { id: POST_ID_FIELD_ID, identifier: { components: ['id'] }, name: 'id', type: 'int64', nullable: false, selectable: true },
        {
          id: POST_TITLE_FIELD_ID,
          identifier: { components: ['title'] },
          name: 'title',
          type: 'text',
          nullable: true,
          selectable: true,
        },
      ],
      relations: [],
    },
  ],
};
