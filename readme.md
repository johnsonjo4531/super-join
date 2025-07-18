# 🦸🏻 super-join

⚠️ SUPER-JOIN is a VERY EARLY work in progress and currently a PROTOTYPE!! Please don't expect much from this projec yet!

> ⚠️ super-join is alpha level software (if not even just a prototype at this point) if you aren't afraid of things changing out from under you without any form of notifying (for the time being) feel free to try it otherwise beware!

super-join is a wasm library for turning your graphql queries into SQL queries which solves the n+1 problem.

The goal of this library is to take a graphql query AST along with super-join's intermediate metadata format capable of turning the graphql query AST and super-join's intermediate AST (which will generally be created from a graphql service/server AST, but could come from elsewhere) into a SQL ast that can then be turned into a SQL query of type string. That sql query can then be ran outside this library using a SQL driver for the language at hand then its result can be sent back into this library to finally be hydrated (shaped) to the form of the graphql query.

The nice thing about having an intermediate metadata format is it could at some point be targeted from other source documents besides graphql service documents allowing for more possible ways to generate SQL.

Super-join is like join-monster only made in Rust and wasm (so it can be used literally anywhere that wasm can be used, which is pretty much anywhere.) One goal of super-join is it will hopefully 🤞 be compatible with join-monster's graphql extension metadata.

## Background

Super-join started as a question that floated in my mind for a long time, but it didn't actually start to come to fruition until I posed it to ChatGPT, "Would something like join-monster ever work well used by developers from js but written in wasm from rust?". With it's positive attitude towards it (who would've guessed 🤣) I decided to give it a whirl. It also helped give me a rough prototype to code against.
