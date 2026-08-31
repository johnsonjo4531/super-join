.PHONY: docs example_graphql-js

go:
	$(MAKE) build && $(MAKE) test

docs:
	npm run docs

build:
	cargo build && npm run build:wasm && npm run build && npm run stage

serve:
	$(MAKE) -j serve-rs serve-ts

serve-rs:
	npx serve -l 4423 ./docs/super-join/rust-api/

serve-ts:
	npx serve -l 4422 ./docs/super-join/api

test:
	cargo test && npm run test:run && npm run smoke:packaged

# Build super-join, install the example's dependencies (super-join is linked
# from this source tree via file:../..), and start the example server. The
# linked copy is removed first so a freshly built dist/ is always used.
example_graphql-js: build
	rm -rf examples/graphql-js/node_modules/super-join
	npm install --prefix examples/graphql-js
	npm start --prefix examples/graphql-js

docs:
	npm run docs

vibe_code:
	jai -j opencode opencode .
