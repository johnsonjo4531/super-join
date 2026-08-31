import { defineConfig } from 'vite';

// Library-mode build for the super-join npm package (see
// ai-design-docs/typescript-build.md). The Wasm Component is NOT bundled here;
// it is staged separately into dist/wasm/super_join.wasm by scripts/stage-package.mjs.
export default defineConfig({
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    minify: false,
    lib: {
      entry: {
        index: 'src-js/index.ts',
        graphql: 'src-js/graphql.ts',
        decorators: 'src-js/decorators.ts',
        'decorators/graphql': 'src-js/decorators/graphql.ts',
      },
      formats: ['es'],
      fileName: (format, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      // `graphql` is an optional peer dependency and must stay external.
      external: ['graphql', '@bytecodealliance/preview2-shim/cli', '@bytecodealliance/preview2-shim/filesystem', '@bytecodealliance/preview2-shim/io'],
    },
  },
});
