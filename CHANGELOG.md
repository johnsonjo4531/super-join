# Changelog

## 0.0.0

- Added a general-purpose `hydrate(rows, artifact)` function to the main API (`super-join`) that regroups an artifact's flattened rows into nested entities at any nesting depth, driven entirely by the result-shape metadata.
- Added `superjoin()` as the primary API: it compiles a request, hands the SQL artifact to a user-supplied driver callback, and hydrates the returned rows into entities. It is presented as the main entry point throughout the user-facing docs.
- Added `superjoin.graphql()`, combining `graphqlToSQL` with the `superjoin` pipeline: pass `resolveInfo`, context, model, and an `execute` callback to get hydrated entities in one call.
- Moved the core decorators (`@Entity`, `@Field`, `@Relation`, `entityIdOf`, `entityMetadataOf`, `modelFromClasses`) from the package root to a new `super-join/decorators` entry point.
- Moved the GraphQL-specific decorator entry point from `super-join/graphql/decorators` to `super-join/decorators/graphql` and added it (plus `super-join/decorators`) to the generated API docs.
- Added the `examples/decorators-graphql-js` example: a TypeScript graphql-js server using the decorator pattern and `superjoin.graphql`, startable with `make example_decorators-graphql-js`.
- Implemented the `text` and `varchar` scalar data types across the WIT boundary, the Rust core, and dialect support, so string columns can be selected.
- Fixed auto-selected identity columns in the result shape to carry the field name as their last path segment (previously they were keyed at the relation occurrence, which corrupted hydrated parents).
- Fixed `graphQLModelFromClasses` resolving a relation field to its target entity when the relation id was auto-assigned.
- Fixed the GitHub URL in the user-facing docs to point to <https://github.com/johnsonjo4531/super-join>.
- Reorganized the user-facing guides into two parallel series — a decorator guide (shown as the preferred pattern) and a core API guide, each with an intro, building-a-GraphQL-server step, filtering/pagination/hooks step, and result-shape/hydration step.
