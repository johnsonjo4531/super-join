go:
	$(MAKE) build && $(MAKE) test

build:
	cargo build &&  cargo component build --target wasm32-wasip2 && npm run build

test:
	cargo test && npm run test

vibe_code:
	jai -j opencode opencode .
