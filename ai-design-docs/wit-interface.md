# WIT interface

## Goal

This document defines the public component contract, independently of Rust internals and TypeScript convenience APIs. Names below are illustrative until the `.wit` source is created; their semantics are normative.

## Minimal interface

```wit
package super-join:compiler@0.1.0;

interface compiler {
  compile: func(request: compiler-request) -> result<compiler-result, compiler-error>;
}
```

The public world exports `compiler`. A single request produces exactly one SQL artifact or one structured compiler error.

## Request shape

`compiler-request` MUST contain:

- `query`: a frontend-neutral requested result shape.
- `model`: relational/model metadata required to resolve entities, fields, and relations.
- `expressions`: serializable predicates, ordering, join conditions, and other evaluated frontend contributions, directly or embedded within the query/model nodes.
- `options`: explicit compilation options such as SQL dialect.

It MAY include declared parameter values, feature flags, source locations, and a request identifier for diagnostics. It MUST NOT contain executable code or runtime-specific objects.

### Concrete conceptual schema

The first implementation should use a single explicit request tree rather than a collection of loosely related JSON blobs. This Rust-like pseudocode fixes the intended ownership of each concern:

```rust
struct CompilerRequest {
    model: Model,
    root: QueryNode,
    dialect: SqlDialect,
    options: CompileOptions,
}

struct QueryNode {
    entity: EntityId,
    selection: Vec<Selection>,
    predicate: Option<Expression>,
    order_by: Vec<OrderBy>,
    limit: Option<u64>,
    offset: Option<u64>,
    path: SourcePath,
}

enum Selection {
    Field { field: FieldId, output_key: String, path: SourcePath },
    Relation { relation: RelationId, output_key: String, query: Box<QueryNode>, path: SourcePath },
}
```

The final WIT types may use strings/records/variants instead of Rust identifiers. They must preserve the same separation: model metadata, requested shape, expressions, options, and diagnostics. Do not make frontend code precompute a relational plan or SQL aliases.

### Initial supported value types

The v0 request/result contract SHOULD initially support `null`, boolean, signed 64-bit integer, float, string, and bytes. Decimal, date/time, UUID, JSON, unsigned integers, arrays, and dialect-native types require an explicit tagged representation before being added. Do not accept `any`/untyped JSON as a shortcut; it makes WIT and parameter semantics ambiguous.

## Result shape

```wit
record compiler-result {
  artifact: sql-artifact,
}

record sql-artifact {
  sql: string,
  parameters: list<parameter>,
  dialect: sql-dialect,
  selected-fields: list<selected-field>,
  result-shape: result-shape,
}
```

Exact WIT representations for dynamic parameter values need deliberate design. The initial set should support null, boolean, integers, floats/decimals, strings, bytes, and structured temporal values. Unsupported values must be rejected explicitly rather than silently stringified.

## Error shape

```wit
record compiler-error {
  code: error-code,
  message: string,
  path: option<string>,
  source: option<source-location>,
}
```

Suggested error codes include `invalid-request`, `invalid-model`, `unknown-field`, `unknown-relation`, `invalid-expression`, `unsupported-feature`, and `unsupported-dialect`.

## Compatibility rules

- WIT is the only cross-language compiler ABI.
- All WIT-visible types must have a direct core representation.
- Any behavior exposed through WIT must be callable through the native Rust API.
- WIT should expose concepts, not Rust implementation types or raw internal IRs.

## Implementation decisions still required

Before writing the `.wit` file, choose and document: the initial dialect enum, the exact parameter value variant, whether `Model` is supplied per request or registered/constructed separately, the stable identifier format, and whether source paths are user-visible in v0. These are bounded decisions; do not start work on advanced SQL features until they are resolved.
