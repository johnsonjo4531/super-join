// Model metadata declared with super-join decorators.
//
// Classes carry the model: `@Entity` names the backing table, `@Field` declares
// columns (with `text` for strings), and `@Relation(() => Post, ...)` declares
// the join. Ids are pinned explicitly so hooks can reference columns by the
// same constants; omit them and `modelFromClasses` assigns ids automatically.

import { Entity, Field, Relation } from 'super-join/decorators';

export const USER_ENTITY_ID = 0n;
export const POST_ENTITY_ID = 1n;
export const USER_ID = 0n;
export const USER_NAME = 1n;
export const POST_ID = 2n;
export const POST_AUTHOR_ID = 3n;
export const POST_VIEWS = 4n;

@Entity({ id: USER_ENTITY_ID, source: ['users'] })
export class User {
  @Field({ id: USER_ID, dataType: 'int64', identity: true })
  id!: bigint;

  // `text` is a first-class scalar type: string columns are selectable.
  @Field({ id: USER_NAME, dataType: 'text' })
  name!: string;

  @Relation(() => Post, {
    cardinality: 'many',
    key: { from: 'id', to: 'authorId' },
    hooks: {
      // Tenant-scoping-style filter fed from the GraphQL server's own context:
      // MIN_VIEWS=5 makes every `posts` selection only match views > 5.
      where: ({ expr, context }) => {
        const minViews = Number((context as { minViews?: number }).minViews ?? 0);
        if (!Number.isFinite(minViews) || minViews <= 0) return undefined;
        return expr.gt(expr.column(POST_VIEWS), expr.literal(Math.trunc(minViews), 'int64'));
      },
    },
  })
  posts!: Post[];
}

@Entity({ id: POST_ENTITY_ID, source: ['posts'] })
export class Post {
  @Field({ id: POST_ID, dataType: 'int64', identity: true })
  id!: bigint;

  // Not selectable: it can never leak into a GraphQL response. The physical
  // column is snake_case, so name it explicitly (the property is camelCase).
  @Field({ id: POST_AUTHOR_ID, column: 'author_id', dataType: 'int64', selectable: false })
  authorId!: bigint;

  @Field({ id: POST_VIEWS, dataType: 'int64' })
  views!: number;
}
