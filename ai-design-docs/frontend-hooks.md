# Frontend hooks

## Purpose

Frontend hooks provide dynamic metadata without contaminating the compiler boundary. A hook is a runtime function executed by its native frontend. Its serializable result—not the function—becomes compiler input.

> Frontend hooks are runtime functions and are never transmitted across the Wasm Component boundary. A frontend executes its hooks against native runtime state and converts their results into Super-Join's serializable compiler representation. The Rust compiler receives only that representation and is independent of the frontend runtime.

## Hook environment

An initial GraphQL hook environment is conceptually:

```ts
type HookEnvironment<TContext> = {
  args: Record<string, unknown>;
  model: GraphQLModel<TContext>;
  context: TContext;
  expr: ExpressionBuilder;
  path: string[];
};
```

The exact TypeScript types may refine this shape. `args`, `model`, `context`, and `expr` are available only while the hook is executing in TypeScript. Hooks receive both the Super-Join metadata (`model`) and the GraphQL server's own resolver context (`context`).

## Hook categories

Initial metadata may support hooks for `where`, `orderBy`, `join`/relation conditions, `select`, and filters. Each hook must return a documented generic concept such as an expression, ordering specification, relation specification, or no contribution. It must not return SQL text.

```ts
where: ({ args, context, expr }) =>
  expr.eq(expr.column("tenant_id"), expr.value(context.tenantId))
```

The first implementation SHOULD intentionally limit hooks to `where` and `orderBy`. Relation join definitions should initially be static model metadata. Add dynamic joins, selection hooks, or computed fields only after the expression scopes and result-shape behavior are designed and tested.

`where` returns `Expression | undefined`. `orderBy` returns one `OrderBy`, a list of `OrderBy`, or `undefined`; each entry consists of a model field reference and explicit ascending/descending direction. A hook may return no contribution, but it may not erase a mandatory compiler/model predicate such as a static relation condition.

## Hooks on relations and entities

Hooks are first-class on relation fields exactly as on entity fields. A relation `where` contribution is folded into the relation's join condition (so nested filtering cannot change the outer join's null semantics), and a relation `orderBy` appends ordering qualified by the nested table alias after the parent's ordering, so nested rows arrive sorted within each parent group. Entity-level and relation-level hooks may also be declared on decorated classes (`@Entity({ hooks })`, `@Relation(..., { hooks })`) and are collected into the GraphQL frontend's per-field options (see typescript-decorators.md).

## Execution and errors

Hooks execute during frontend translation before WIT compilation. Start with synchronous hooks. Async hooks should be added only with an explicit reason and a defined ordering/error model. A thrown hook error is a frontend error and must include metadata location/path when possible.

Hooks execute once per applicable field occurrence after GraphQL variables and arguments have been resolved. They run in a deterministic traversal order (root-to-leaf, selection order after fragment expansion). A frontend must not call hooks twice for the same occurrence merely to inspect their result; this prevents accidental duplicated side effects. Hooks SHOULD be treated as pure even though TypeScript cannot enforce purity.

## Forbidden behavior

Hooks must not:

- Return SQL fragments or parameter placeholders.
- Pass functions, promises, native runtime objects, or context references to the compiler.
- Depend on Rust calling them back during compilation.
- Mutate compiler-owned state.

## Hook versus expression

A hook is executable, non-serializable frontend code. An expression is a serializable value created by a hook and consumed by Rust. This distinction is foundational and must be maintained by public API types.
