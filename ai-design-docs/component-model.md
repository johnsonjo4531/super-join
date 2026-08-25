# Wasm Component model

## Role

The Wasm Component is a first-class supported interface for Super-Join, not merely a packaging format. WIT supplies a stable, language-neutral ABI between hosts and the Rust compiler.

The component is intentionally thin:

```text
WIT input -> generated bindings -> Rust Compiler::compile -> generated bindings -> WIT output
```

It MUST NOT introduce separate compilation semantics, query planning, GraphQL interpretation, or SQL generation.

## Host and guest responsibilities

| Party | Responsibilities |
| --- | --- |
| Host | Instantiate component, supply a `CompilerRequest`, receive result/error, execute returned SQL if desired |
| Guest/component | Convert WIT types to core types and delegate to Rust core |
| Rust core | Compile independently of Wasm and host language |

The host is not required to be TypeScript. TypeScript is the initial host/consumer, but WIT enables other hosts later without compiler redesign.

## Data crossing the boundary

Only WIT-supported serializable values cross the boundary: records, variants, lists, strings, numeric values, and byte sequences where appropriate. The boundary MUST NOT carry JavaScript object identity, closures, GraphQL schema instances, arbitrary context objects, database handles, or callback IDs.

Values have normal component ownership semantics: the caller owns request data; the callee returns independent result data. No borrowed host references may be retained by compilation.

## Lifecycle and configuration

The initial model should favor a stateless `compile(request)` operation. Stable, immutable compiler configuration may be supplied in each request or through a separately versioned construction API only if configuration becomes too large or expensive to repeat.

Compilation is synchronous at the conceptual ABI level. Hosts MAY expose an asynchronous convenience API because component instantiation/loading is asynchronous. Rust compilation itself must not require callbacks into the host.

## Versioning

WIT package and interface names must be versioned. Additive fields should be optional where possible. Breaking request/result changes require a new interface version or a carefully defined compatibility strategy. The component must document supported dialects and behavior through the contract, not through host-specific implementation details.

## Errors

Expected failures return a typed WIT error result. Traps are reserved for defects or unrecoverable component failures. Error data must be safe to render in an application and include a stable error code, message, and optional source location/path.

## Component acceptance checks

The component implementation is complete for a core feature only when it accepts the same serialized request semantics as native Rust, returns an equivalent artifact/error, does not retain host-owned values after the call, and exposes no host callback requirement. Component tests must include invalid input as well as successful compilation.
