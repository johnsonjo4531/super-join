# Frontend hooks

## Purpose

Frontend hooks provide dynamic metadata without contaminating the compiler boundary. A hook is a runtime function executed by its native frontend. Its serializable result—not the function—becomes compiler input.

> Frontend hooks are runtime functions and are never transmitted across the Wasm Component boundary. A frontend executes its hooks against native runtime state and converts their results into Super-Join's serializable compiler representation. The Rust compiler receives only that representation and is independent of the frontend runtime.

## Hook environment

An initial GraphQL hook environment is conceptually:

```ts
type SuperJoinHookContext = {
  args: Record<string, unknown>;
  context: unknown;
  info: GraphQLResolveInfo;
  field: FieldMetadata;
  parent: ParentMetadata;
  expr: ExpressionBuilder;
};
```

The exact TypeScript types may refine this shape. `args`, `context`, and `info` are available only while the hook is executing in TypeScript.

## Hook categories

Initial metadata may support hooks for `where`, `orderBy`, `join`/relation conditions, `select`, and filters. Each hook must return a documented generic concept such as an expression, ordering specification, relation specification, or no contribution. It must not return SQL text.

```ts
where: ({ args, context, expr }) =>
  expr.eq(expr.column("tenant_id"), expr.value(context.tenantId))
```

The first implementation SHOULD intentionally limit hooks to `where` and `orderBy`. Relation join definitions should initially be static model metadata. Add dynamic joins, selection hooks, or computed fields only after the expression scopes and result-shape behavior are designed and tested.

`where` returns `Expression | undefined`. `orderBy` returns one `OrderBy`, a list of `OrderBy`, or `undefined`; each entry consists of a model field reference and explicit ascending/descending direction. A hook may return no contribution, but it may not erase a mandatory compiler/model predicate such as a static relation condition.

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
