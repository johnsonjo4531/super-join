# Component Model Quick Reference

## Prerequisites

```bash
# Install required tools
cargo install cargo-component
npm install -g @bytecodealliance/jco
cargo install wasm-tools
```

## Build Commands

### Build Component WASM
```bash
cargo component build --release --features component --target wasm32-wasip1
# Output: target/wasm32-wasip1/release/super_join.wasm
```

### Regenerate WIT Bindings
```bash
cargo component bindings
```

### Transpile to JavaScript (once component is ready)
```bash
jco transpile target/super_join.component.wasm -o src-js/__component__
```

## Testing

### Run Rust Tests
```bash
# Standard tests (wasm-pack)
cargo test

# With component feature
cargo test --features component
```

### Test with Deno (native component support)
```bash
# Once JS bindings are generated
deno test --allow-all src-js/__component__/*.test.ts
```

## File Structure
```
├── wit/
│   └── super-join.wit          # WIT interface definition
├── src/
│   ├── component.rs             # Component implementation
│   ├── bindings.rs              # Auto-generated WIT bindings
│   └── core/                    # Shared core logic
├── target/
│   └── wasm32-wasip1/release/
│       └── super_join.wasm     # Built WASM module
└── src-js/
    └── __component__/          # JS/TS bindings (to be generated)
```

## Current Limitations

1. WASM binary needs WASI adapter to become a component
2. JavaScript bindings not yet generated
3. Deno runtime testing not yet implemented

## Next Steps

1. Add WASI adapter to create final component
2. Generate JS/TS bindings with jco
3. Add Deno/Node.js test suite
4. Update documentation
