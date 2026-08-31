# 🦸🏻 super-join

⚠️ SUPER-JOIN is a VERY EARLY work in progress and currently a PROTOTYPE!! Please don't expect much from this project yet!

> ⚠️ super-join is alpha level software (if not even just a prototype at this point) if you aren't afraid of things changing out from under you without any form of notifying (for the time being) feel free to try it otherwise beware!

super-join is a wasm library for turning your graphql queries into SQL queries which solve the n+1 problem.

The goal of this library is to take a graphql query AST along with super-join's intermediate metadata format capable of turning the graphql query AST and super-join's intermediate AST (which will generally be created from a graphql service/server AST, but could come from elsewhere) into a SQL ast that can then be turned into a SQL query of type string. That sql query can then be ran outside this library using a SQL driver for the language at hand then its result can be sent back into this library to finally be hydrated (shaped) to the form of the graphql query.

The nice thing about having an intermediate metadata format is it could at some point be targeted from other source documents besides graphql service documents allowing for more possible ways to generate SQL.

## Usage

The main API is `superjoin`: compile and hydrate in one call, with a callback you use to run your own db driver against the compiled artifact:

```ts
import { superjoin } from "super-join";

const users = await superjoin(request, async (artifact) => {
  return db.query(artifact.sql, artifact.parameters);
});
```

For GraphQL servers there is `superjoin.graphql`, which also translates the resolver's `ResolveInfo` for you:

```ts
import { superjoin } from "super-join";

async function queryUsers(_args, context, info) {
  return superjoin.graphql({ resolveInfo: info, context, model, execute });
}
```

Model metadata is most ergonomically declared with the TypeScript decorators (`@Entity`, `@Field`, `@Relation` from `super-join/decorators`, GraphQL options via `super-join/decorators/graphql`); the lower-level pieces (`compile`, `graphqlToSQL`, `hydrate`) remain exported individually from `super-join` and `super-join/graphql` for hosts that want to drive each step separately. See the guides under `docs/super-join/` (and `examples/`) for complete walkthroughs.

## License

Copyright (c) 2026 John Johnson II

Licensed under either of

- [Apache License, Version 2.0](https://www.apache.org/licenses/LICENSE-2.0)
- [MIT license](https://opensource.org/licenses/MIT)

at your option.

## Background

Super-join started as a question that floated in my mind for a long time, but it didn't actually start to come to fruition until I posed it to ChatGPT, "Would something like join-monster ever work well used by developers from js but written in wasm from rust?". With it's positive attitude towards it (who would've guessed 🤣) I decided to give it a whirl. It also helped give me a rough prototype to code against.
