# Code examples

## Purpose

The `examples/` directory holds small, complete applications that consume super-join the way a real product would. They exist to prove the public API is usable end-to-end (compile → run → hydrate) and to serve as copy-paste starting points. Examples are consumer code, not tests: they MUST NOT import from `src-js/`, `crates/`, or any internal path — only the published package surface (`super-join`, `super-join/graphql`).

## Layout

```text
examples/
  graphql-js/           # Node.js GraphQL server (graphql-js + node:sqlite)
    package.json        # private, "type": "module", super-join via file:../..
    README.md           # how to run, sample queries with expected output
    <source files>      # plain JavaScript, runnable with the Node LTS version below
```

One directory per example. Each is a standalone npm package (`"private": true`) so its dependencies never mix with the repository root's dev dependencies. Example names are kebab-case and describe the frontend being demonstrated (a future REST or drizzle example would be `examples/rest-js/`, etc.).

## Linking to super-join

super-join is not published to npm yet, and MUST NOT be published just to make an example work. Examples depend on it through the local path:

```json
{ "dependencies": { "super-join": "file:../.." } }
```

`npm install` copies the staged `dist/` (including `dist/pkg` glue and the Wasm Component) into the example's `node_modules`, which is exactly what a future published version will deliver. This makes examples verify the packaged shape, not just the source tree. When super-join is eventually published, each example switches its dependency to the version range in one deliberate change; until then the `file:` spec MUST stay.

Because npm copies (not links) `file:` dependencies, a previously installed copy can go stale. The make target removes the copied package before installing so an example always runs against a freshly built `dist/`.

## Running from the repository root

Every example MUST have a matching make target named `example_<directory>`:

```make
example_graphql-js: build
	rm -rf examples/graphql-js/node_modules/super-join
	npm install --prefix examples/graphql-js
	npm start --prefix examples/graphql-js
```

Rules:

1. The target depends on `build`, so the Wasm Component, the TypeScript build, and package staging are fresh.
2. It installs with `--prefix` (no `cd`) and starts through the example's own `npm start`.
3. A server example blocks in the foreground; its README documents the port and sample requests.

## Runtime rules

- Examples run on plain Node.js LTS (`node --version` >= 22.5) with no build step: plain `.js`, ESM, no TypeScript, no bundler. The repository's toolchain (cargo, jco, vite) is only needed to build super-join itself, never the example.
- Examples MUST be runnable offline after `npm install` and MUST NOT require external services (no Postgres/MySQL servers). Use embedded/in-memory storage — `node:sqlite` for SQL — so CI and laptops run identically.
- Keep dependencies minimal: the frontend library being demonstrated plus super-join. No ORMs, no frameworks on top of the demonstrated path.
- Every example README MUST include: run command, at least one sample request with its expected response, the generated SQL when illustrative, and a limitations section mirroring current super-join alpha limits (e.g. no `text` scalar yet — model string columns as non-selectable; nested ids need response aliases to avoid duplicate SQL aliases).

## Keeping examples in sync

Examples are user-facing code. When a public API change lands (signature renames, new required arguments, artifact shape changes), the update MUST happen in the same change as the code — the same rule as [user-facing-docs.md](user-facing-docs.md). Concretely:

1. Update every affected example source file and its README in the change.
2. Run `make example_<name>` and execute at least one sample request from the README, comparing against the documented output.
3. If an example demonstrates a behavior that changed (hooks, dialects, pagination), update the guide pages' prose to match or note the difference.

## Adding a new example

1. Create `examples/<name>/` with `package.json` (private, ESM, `file:../..` dependency, `engines.node`), source files, and `README.md`.
2. Add the `example_<name>` make target following the pattern above.
3. Register the example in this document's layout section and in `docs/super-join/index.md` if it belongs in the guide navigation.
4. All comments and README prose are English only.

## Verification checklist for a change touching examples

- [ ] `make example_<name>` builds, installs, and starts cleanly.
- [ ] Every sample request in the example's README returns the documented response.
- [ ] No imports from super-join internals; only package entry points.
- [ ] The example still runs with only Node.js and npm (plus super-join's build toolchain for `build`).
