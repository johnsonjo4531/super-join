# User-facing documentation

This document describes how the user-facing documentation in `./docs/super-join/` is organized and how it MUST be updated when the public API changes. It is a maintenance guide, not a design contract for the compiler itself.

## Source of truth

The user-facing APIs are defined by the current signatures of the code, never by hand-maintained copies:

- TypeScript API: the exported surface of `src-js/index.ts`, `src-js/graphql.ts`, `src-js/decorators.ts`, and `src-js/decorators/graphql.ts`.
- Rust API: the public items of `crates/super-join-core` and `crates/super-join-component`.

When a public signature changes, the documentation update MUST happen in the same change as the code. The reference pages themselves are generated; only prose and comments are hand-written.

## Layout

```text
docs/super-join/
  index.md            # human home page; also the typedoc site readme
  guides/             # hand-written Markdown prose: TypeScript tutorials and examples
    getting-started.md              # shared step 0: install, superjoin main API, error basics
    decorators/                     # the preferred guide series (TypeScript decorators)
      intro.md                      # what choosing decorators means; why it is preferred
      building-a-graphql-server.md  # decorator server via graphQLModelFromClasses + superjoin.graphql
      filtering-pagination-hooks.md # @GraphQLField options, hooks on entities/relations, error codes
      result-shape-and-hydration.md # what superjoin.graphql's hydration does under the hood
    core-api/                       # the parallel series using hand-authored metadata
      intro.md                      # what choosing the core API means; when to pick it
      building-a-graphql-server.md  # complete graphql-js server with Model/GraphQLModel objects
      filtering-pagination-hooks.md # argument options, hooks, expression builder, error codes
      result-shape-and-hydration.md # artifact anatomy and regrouping flattened rows into entities
  api/                # GENERATED: typedoc + clean-jsdoc-theme site (TypeScript reference)
  rust-api/           # GENERATED: cargo doc output (Rust reference)
```

`api/` and `rust-api/` are generated artifacts and MUST NOT be edited by hand; they are rebuilt with the commands below. Everything else in `docs/super-join/` is authored content.

### Guide inventory

The guide pages under `docs/super-join/guides/` form two parallel tutorial series — one for the decorator pattern (preferred, listed first everywhere) and one for the core API — plus a shared getting-started page. They MUST stay consistent with each other and with the current code:

1. `getting-started.md` — install, the `superjoin` main API (`superjoin` / `superjoin.graphql`), error basics, and how to choose between the two series.
2. `decorators/intro.md` — what authoring metadata with decorators means and why it is the preferred pattern.
3. `decorators/building-a-graphql-server.md` — a complete graphql-js server: decorated classes, `graphQLModelFromClasses`, resolvers calling `superjoin.graphql`, driver callback, HTTP wiring, current limitations.
4. `decorators/filtering-pagination-hooks.md` — `@GraphQLField` argument options, hooks declared on entities/relations, the expression builder and computed select expressions, fragments/directives, the full error-code table.
5. `decorators/result-shape-and-hydration.md` — SQL artifact anatomy, identity aliases, and what the built-in hydration does for the decorator pattern.
6. `core-api/intro.md` — what hand-authoring metadata means and when to pick it over decorators.
7. `core-api/building-a-graphql-server.md` — a complete graphql-js server: model metadata objects, name→id resolvers, resolver-level compile + driver execution + hydration, HTTP wiring, current limitations.
8. `core-api/filtering-pagination-hooks.md` — field-level argument options, offset and cursor (Relay) pagination, the hook API including relation hooks, the expression builder and computed select expressions, fragments/directives, the full error-code table.
9. `core-api/result-shape-and-hydration.md` — SQL artifact anatomy, identity aliases, the built-in hydrator, and writing a custom regrouping step.

Every code example in these pages MUST be runnable against the current package (modulo placeholder driver code); when a public API change alters what an example shows, update the example in the same change.

## TypeScript documentation

The TypeScript reference is generated from TSDoc comments with TypeDoc, rendered through the clean-jsdoc-theme TypeDoc plugin (`@clean-jsdoc-theme/typedoc`). Its configuration lives in `typedoc.json` at the repository root.

Rules for updating:

1. Every exported type, interface, class, function, and constant in `src-js/` MUST carry a TSDoc (`/** ... */`) comment: one concise sentence for the summary, plus `@param`, `@returns`, and `@example` where behavior is not obvious from the signature.
2. TypeScript-specific tutorials and examples live as Markdown pages under `docs/super-join/guides/`. They are pulled into the generated site through the theme's `docs` option, so prose and API reference share one sidebar and one search index.
3. Cross-references between doc pages use `{@link Symbol}`; the theme resolves them to real anchors.
4. Regenerate after any public change:

   ```sh
   npm run docs:ts
   ```

   This runs `typedoc` against `typedoc.json` and writes the site to `docs/super-join/api/`. Serve it with `npx serve docs/super-join/api` (full-text search needs HTTP).

Theme options live under the `cleanJsdocTheme` key in `typedoc.json`; the plugin is loaded via `plugin` and selected via `outputs`. See the theme's TypeDoc guide at <https://ankdev.me/clean-jsdoc-theme/theme/typedoc-getting-started.html> for every option.

## Rust documentation

The Rust reference is generated by `cargo doc` (rustdoc), with no extra tooling.

Rules for updating:

1. Every public item in the crates MUST have a rustdoc comment (`///`, or `//!` for modules): one concise summary line, then details only as needed.
2. Rust-specific tutorials and examples go into this documentation too: crate- and module-level `//!` pages carry the prose, and runnable examples use doctest code blocks (` `) so `cargo test` keeps them honest.
3. Regenerate after any public change:

   ```sh
   npm run docs:rust
   ```

   This runs `cargo doc --no-deps -p super-join-core -p super-join-component` and copies the result to `docs/super-join/rust-api/`. Open `docs/super-join/rust-api/index.html`.

## Update workflow

When a public API change lands:

1. Update the TSDoc comments (TypeScript) or rustdoc comments/doctests (Rust) at the definition site.
2. Add or adjust any guide page under `docs/super-join/guides/` that the change affects.
3. Run `npm run docs` to rebuild both references, and skim the generated pages for broken links or stale prose.
4. Keep `docs/super-join/index.md` pointing at the current guides and references.

## Prose rules

- All documentation prose is English only.
- Be concise and clear: one idea per sentence, no marketing language, no restating the signature in prose.
- Prefer a short runnable example over a paragraph of explanation.
