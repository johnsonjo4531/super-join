// Decorator API tests (src-js/decorators.ts + src-js/decorators/graphql.ts).
//
// Uses legacy TypeScript decorators (experimentalDecorators) to attach model
// metadata to classes, then asserts on the generated Model / GraphQLModel.

import { describe, expect, test } from 'vitest';

import { Entity, Field, Relation, entityIdOf, entityMetadataOf, modelFromClasses } from '../src-js/decorators.js';
import { GraphQLField, graphQLModelFromClasses } from '../src-js/decorators/graphql.js';
import { expr } from '../src-js/expressions.js';

@Entity({ id: 0n, source: ['public', 'users'] })
class User {
  @Field({ dataType: 'int64', identity: true })
  id!: bigint;

  @Field({ column: 'name', dataType: 'jsonb' })
  name!: string;

  @Relation(() => Post, { cardinality: 'many', key: { from: 'id', to: 'authorId' } })
  posts!: Post[];
}

@Entity({ id: 1n, source: ['public', 'posts'] })
class Post {
  @Field({ dataType: 'int64', identity: true })
  id!: bigint;

  @Field({ dataType: 'jsonb' })
  title!: string;

  @Field({ dataType: 'int64' })
  authorId!: bigint;
}

describe('modelFromClasses', () => {
  test('builds entities, fields, relations, and identity from decorators', () => {
    const model = modelFromClasses([User, Post]);
    expect(model.entities.length).toBe(2);

    const users = model.entities[0]!;
    expect(users.id).toBe(0n);
    expect(users.source.components).toEqual(['public', 'users']);
    expect(users.identity).toEqual(new BigUint64Array([0n]));
    // ids are tied to the class, not an instance.
    expect(entityIdOf(User)).toBe(0n);
    expect(entityIdOf(Post)).toBe(1n);

    const postsRel = users.relations[0]!;
    expect(postsRel.target).toBe(1n);
    expect(postsRel.cardinality).toBe('many');
    // join: Column(posts.author_id) = ParentColumn(1, users.id)
    const kinds = postsRel.join.nodes.map((n) => n.kind);
    expect(kinds).toEqual(['column', 'parent-column', 'compare']);

    const postFields = model.entities[1]!.fields.map((f) => f.identifier.components[0]);
    expect(postFields).toEqual(['id', 'title', 'authorId']);
  });

  test('metadata lives on the class and survives repeated reads', () => {
    const first = entityMetadataOf(User);
    expect(first?.fields.get('name')?.dataType).toBe('jsonb');
    expect(entityMetadataOf(User)).toBe(first);
  });

  test('computed fields carry their select definition through to the model', () => {
    @Entity({ id: 9n, source: 'authors' })
    class Author {
      @Field({ dataType: 'int64', identity: true })
      id!: bigint;

      @Field({
        dataType: 'int64',
        computed: expr.select(
          1n,
          expr.count(),
          { where: expr.eq(expr.column(2n), expr.parentColumn(1, 0n)) },
        ),
      })
      postCount!: number;
    }
    const model = modelFromClasses([Author]);
    const computed = model.entities[0]!.fields[1]!.computed;
    expect(computed?.entity).toBe(1n);
    expect(computed?.projection.nodes[0]?.kind).toBe('aggregate');
  });

  test('rejects undecorated classes', () => {
    class Plain {}
    expect(() => modelFromClasses([Plain])).toThrow(/not decorated/);
  });
});

describe('graphQLModelFromClasses', () => {
  @Entity({ id: 20n, source: 'members' })
  class Member {
    @Field({ dataType: 'int64', identity: true })
    id!: bigint;

    @Field({ dataType: 'jsonb' })
    @GraphQLField({ pagination: 'cursor' })
    name!: string;

    @Relation(() => Tag, { cardinality: 'many', key: { from: 'id', to: 'memberId' }, hooks: { orderBy: () => 'name' } })
    tags!: Tag[];
  }

  @Entity({ id: 21n, source: 'tags' })
  class Tag {
    @Field({ dataType: 'int64', identity: true })
    id!: bigint;

    @Field({ dataType: 'jsonb' })
    name!: string;

    @Field({ dataType: 'int64' })
    memberId!: bigint;
  }

  test('produces a GraphQLModel with resolvers and field options', () => {
    const gql = graphQLModelFromClasses([Member, Tag], { dialect: 'postgres' });
    expect(gql.dialect).toBe('postgres');
    expect(gql.entityForField?.('member')).toBe(20n);
    expect(gql.fieldForEntity?.(20n, 'name')).toBeDefined();
    expect(gql.relationForField?.(20n, 'tags')).toBeDefined();
    // @GraphQLField lands as a field-level option.
    expect(gql.fields?.name?.pagination).toBe('cursor');
    // Relation hooks land on the relation field.
    expect(gql.fields?.tags?.hooks?.orderBy).toBeDefined();
  });

  test('a relation field resolves to its target entity (auto ids included)', () => {
    const gql = graphQLModelFromClasses([Member, Tag], { dialect: 'postgres' });
    // `tags` has an auto-assigned relation id; the fallback must still find
    // the target entity through class/declaration position.
    expect(gql.entityForField?.('tags')).toBe(21n);
  });

  test('entity hooks land under the class name', () => {
    const meta = entityMetadataOf(Member);
    void meta;
    @Entity({ id: 30n, source: 'orgs', hooks: { where: () => undefined } })
    class Org {
      @Field({ dataType: 'int64', identity: true })
      id!: bigint;
    }
    const gql = graphQLModelFromClasses([Org]);
    expect(gql.fields?.Org?.hooks?.where).toBeDefined();
  });
});
