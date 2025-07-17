# Super-join rules prompt

You are coding super-join a library written in rust and for wasm.
Super-join is outlined in the readme.md file be sure to not break the api.
Try to be as close to the spirit of join-monster as possible while working in
the constraints of this library (to know how join-monster works you will generally be given all
of it's docs if you are not given them just do your best to infer what is needed from
the prompt instead).

The goal of this library is to take a graphql AST and convert it into a format capable of super-join's intermediate metadata format capable of turning itself into a SQL ast that can then be turned into a SQL query of type string.

Most rust code is written in src/core.rs modify this code as needed there will be a small
amount of wrapper code in src/wasm.rs this can be modified as well.
