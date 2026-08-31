# Generated SQL artifact

## Purpose

The compiler output is an SQL artifact, not merely a string. It is the complete handoff from Super-Join to application-owned execution.

```text
Super-Join -> SQL artifact -> application -> driver -> database
```

## Required contents

```ts
type SqlArtifact = {
  sql: string;
  parameters: Parameter[];
  dialect: SqlDialect;
  selectedFields: SelectedField[];
  resultShape: ResultShape;
};
```

- `sql` is rendered parameterized SQL.
- `parameters` are ordered to match placeholders in `sql`.
- `dialect` identifies rendering expectations.
- `selectedFields` records stable aliases/mappings for returned columns.
- `resultShape` describes how selected rows correspond to requested entities and nested fields.

Additional metadata MAY include compiler version, warnings, source mappings, or generated aliases. It must not include a live driver/connection or executable behavior.

## Invariants

- The artifact is self-contained and serializable across WIT.
- Every placeholder has one ordered parameter, and every parameter reference has a placeholder.
- Dynamic caller values are represented as parameters rather than interpolated SQL.
- An artifact does not imply execution, hydration, or a database connection.

## Result-shape minimum

For v0, `resultShape` should at least list each selected SQL alias, its logical entity/field, its output key, and its path from the root selection. For nested relationships it must also identify the parent and child identity fields needed to group rows. This metadata makes a later hydration utility possible without requiring it to be implemented now.

The compiler must document whether SQL rows are expected to be flat joined rows, JSON-aggregated rows, or another strategy. Do not leave this implicit: the strategy determines what result-shape metadata and relation pagination semantics are valid.

## Consumer example

```ts
const artifact = await graphqlToSQL({ resolveInfo, context, model });
const rows = await db.query(artifact.sql, artifact.parameters);
```

The exact driver call varies by application; this example deliberately keeps it outside Super-Join.
