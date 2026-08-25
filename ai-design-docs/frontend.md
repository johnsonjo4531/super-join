# Frontends

## Definition

A frontend converts a user-facing query representation into `CompilerRequest`. A frontend is not a SQL renderer and must not require the compiler to understand its native runtime.

```text
native request + schema/metadata + runtime values
                      |
                      v
              frontend translation
                      |
                      v
              serializable CompilerRequest
```

GraphQL is the first frontend. REST query descriptions, a TypeScript DSL, a Rust DSL, or direct request construction may become future frontends.

## Required frontend outputs

Every frontend must provide enough information for the generic compiler to act without frontend knowledge:

- A requested entity/result shape and selected fields.
- A generic model representation.
- Resolved arguments, variables, and values as serializable parameters.
- Relations, filtering, ordering, pagination, and other query semantics in generic terms.
- Evaluated dynamic metadata as serializable expressions.
- Explicit compile options where needed.

## Prohibited leakage

The request must not include native AST node objects, callback functions, framework schema instances, arbitrary application context, object references, or hidden closures. If a native concept cannot be expressed generically, the frontend must reject it with a useful frontend error rather than push it into Rust.

## Frontend contract

Frontends are responsible for validating their native input before or while translating it. The core remains responsible for validating the generic request. This creates two useful error classes: frontend-translation errors and compiler errors.

## Future frontend rule

A proposed frontend must adapt to `CompilerRequest`; it must not force GraphQL concepts or its own abstractions into semantic, relational, or SQL IR.

