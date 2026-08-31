# GraphQL frontend

## Purpose

The GraphQL frontend maps GraphQL.js resolver information and Super-Join metadata into a generic `CompilerRequest`. It is a TypeScript adapter and is the only layer that knows GraphQL.js concepts.

## Input and translation

The primary input is conceptually:

```ts
graphqlToSQL({ resolveInfo, context, model })
```

`model` is the Super-Join metadata (`GraphQLModel`): the model, dialect, name→id resolvers, and hooks. `context` is the GraphQL server's own resolver context; graphql-js does not export a concrete type for it, so the TypeScript API keeps it generic (`unknown` by default).

The adapter reads only the required parts of `GraphQLResolveInfo`:

- Operation and selected fields.
- Field arguments and operation variables.
- Fragments, directives, aliases, and GraphQL type information.
- Schema metadata and Super-Join extensions.

It converts them into frontend-neutral requested fields, generic model metadata, and serializable expressions. The `resolveInfo` object itself never crosses WIT.

## Context

GraphQL context is frontend-local. It is passed alongside the `GraphQLModel` and handed to hooks (which receive both) so they can compute an expression or parameter, but arbitrary context must not be copied into `CompilerRequest`.

```text
GraphQL context -> metadata hook -> expression/value -> CompilerRequest
```

For example, `context.tenantId` may become `parameter(123)` in an equality condition. Rust only receives the resulting condition.

## Recognized arguments are a field-level option

Which GraphQL arguments super-join recognizes for one field is configured through `GraphQLModel.fields` (keyed by GraphQL field name, applying to root and nested fields alike):

- `pagination: "offset"` (default) recognizes exactly `limit`/`offset`.
- `pagination: "cursor"` recognizes the Relay connection arguments `first`/`last`/`after`/`before`; cursors are opaque base64url payloads of the ordering values (`encodeCursor`/`decodeCursor`). The frontend compiles them into existing request features only: a strict lexicographic tuple comparison over the ordering columns plus `limit = pageSize + 1` (the probe row lets the driver detect `hasNextPage`/`hasPreviousPage` and trim). A `last`/`before` pass flips every ordering direction; the driver reverses rows back.
- `orderBy: false` stops recognizing the `orderBy` argument.
- `filterArgs` opts into mapping named arguments onto model-field equality predicates (`true` = same-name mapping, or an explicit argument→field map).

Arguments that are not recognized are ignored for SQL purposes — they never become predicates and never error — but they remain in `HookEnvironment.args`, so extra schema arguments stay usable by the hooks themselves.

Nested ordering is supported: a nested query node's order-by entries are appended after the parent's, qualified by the child table alias. Nested limit/offset remain `unsupported-feature` because the flat join strategy cannot preserve them.

## GraphQL semantics

The adapter is responsible for correctly expanding fragments and aliases, resolving variables, applying relevant directives, and mapping GraphQL field/type metadata to model entities and fields. It should preserve source paths where feasible so errors can name the GraphQL location that produced them.

## Translation algorithm

Implement the frontend as a pure translation pipeline where possible:

1. Start from the resolver field and its `GraphQLResolveInfo`.
2. Resolve the root field's Super-Join metadata to a model entity.
3. Evaluate applicable directives using operation variables; omit excluded selections.
4. Expand fragment spreads and inline fragments for the concrete GraphQL type, preserving response aliases.
5. For each scalar field, resolve metadata to a model field and append a `Field` selection.
6. For each object/list field, resolve a relation, evaluate its hooks, and recursively build a child `QueryNode`.
7. Resolve GraphQL argument AST values using variables to plain TypeScript values.
8. Execute hooks with those values and construct only expression/order/relation values allowed by the generic request schema.
9. Produce a fully serializable request and invoke the component.

The adapter must reject unsupported GraphQL constructs explicitly. In particular, it must not guess how unions/interfaces map to a relational model; those require defined metadata and a separate design.

## Metadata requirements

For the first vertical slice, every SQL-backed GraphQL field should declare enough metadata to map it to one of: a root entity, scalar model field, or model relation. Missing/ambiguous metadata is a frontend-translation error naming the GraphQL path. GraphQL resolver return types do not automatically determine physical model structure.

## Boundary rule

No Rust compiler module, WIT type, or internal IR may require `GraphQLResolveInfo`, GraphQL AST nodes, GraphQL schema objects, or GraphQL context.
