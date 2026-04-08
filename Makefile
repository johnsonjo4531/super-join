go:
	 cargo test

node:
	wasm-pack build --release --target nodejs && npm i && npm run test

deno:
	wasm-pack build --release --target deno && deno test --allow-env --allow-read --unstable-sloppy-imports ./src-js/__deno__/**/*.test.ts

# Build with component model
component:
	cargo component build --release --target wasm32-wasip1
	rm -rf src-js/__component__
	jco transpile target/wasm32-wasip1/release/super_join.wasm -o src-js/__component__

# Run component example with Node.js (requires @bytecodealliance/preview2-shim)
component-node:
	node src-js/__component__/node_example.js

# Install preview2-shim for Node.js examples
component-node-setup:
	npm install @bytecodealliance/preview2-shim

# One time setup
# Stuff that only needs to be run once
init:
	$(MAKE) add_external_docs

add_external_docs:
	mkdir -p external-docs && $(MAKE) joinmonster_docs

joinmonster_docs:
	(\
	    ls external-repos/join-monster-full/docs || \
	    mkdir -p external-repos && git clone git@github.com:join-monster/join-monster.git external-repos/join-monster-full\
	)\
	    && mv ./external-repos/join-monster-full/docs ./external-docs/join-monster-docs
