# super-join

Super-join is a wasm library for turning your graphql queries into SQL queries which solves the n+1 problem with graphql queries.

The goal of this library is to take a graphql AST and convert it into a format capable of super-join's intermediate metadata format capable of turning itself into a SQL ast that can then be turned into a SQL query of type string. That sql query can then be ran outside this library using a SQL driver for the language at hand then it's result can be sent back into this library to finally be hydrated (shaped) to the form of the graphql query.

The nice thing about having an intermediate metadata format is it could at some point be targeted from other source documents besides graphql allowing for more possible ways to generate SQL.

Super-join is like join-monster only made in Rust and wasm. Super-join will be compatible with join-monster graphql extension metadata.
