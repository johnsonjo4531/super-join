go:
	cargo test

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
