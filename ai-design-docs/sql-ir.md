# SQL IR

## Role

The SQL IR is the dialect-aware but still structured representation immediately before SQL text generation. It represents SQL concepts such as select lists, FROM sources, joins, predicates, grouping, ordering, aliases, and parameter references.

```text
relational plan -> SQL IR -> renderer -> SQL text + parameters
```

Example:

```text
Select
  columns: users.id AS user__id, posts.id AS post__id
  from: users AS users
  join: LEFT JOIN posts AS posts ON posts.author_id = users.id
  where: users.tenant_id = parameter(0)
```

## Responsibilities

SQL IR determines explicit aliases, physical identifiers, operator forms, parameter references, and dialect-specific capabilities. It may use a SQL AST library internally, but the library is not part of the public contract.

## Parameter safety

SQL IR represents values by parameter references, never SQL string interpolation. Rendering assigns the dialect's placeholder syntax and returns parameter values in exactly that order.

## Dialects

Dialect selection is explicit in compiler options. Unsupported SQL features must yield an `unsupported-feature` or `unsupported-dialect` error, not silently generate nonportable SQL.

## Rendering algorithm

The renderer traverses SQL IR deterministically and maintains one parameter collector. When it sees a parameter expression, it appends the typed value to the collector and emits the next dialect placeholder. Identifier rendering takes structured identifier components and quotes each component according to the dialect. It must never quote a whole dotted identifier as one component and must never treat an identifier as a value parameter.

The initial implementation SHOULD support one named dialect end to end. Additional dialects require a test matrix covering quoting, placeholders, limit/offset syntax, boolean/null behavior, and any join/pagination differences.
