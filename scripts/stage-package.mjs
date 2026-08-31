// Package staging step (see ai-design-docs/typescript-build.md).
//
// Copies the built Wasm Component into its visible package path
// (dist/wasm/super_join.wasm), stages the jco glue next to the built JS, and
// validates that every package.json export maps to a real file. Fails when a
// required artifact is missing so `npm pack` can never ship an incomplete
// package.

import { cpSync, existsSync, mkdirSync, readFileSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');
const pkgDir = resolve(root, 'pkg');
const wasmCandidates = [
  resolve(root, 'target/wasm32-wasip1/debug/super_join.wasm'),
  resolve(root, 'target/wasm32-wasip1/release/super_join.wasm'),
];

const errors = [];

if (!existsSync(dist)) {
  errors.push('dist/ is missing; run the Vite library build first (npm run build:js)');
}

// 1. Stage the component as a visible package asset.
const wasmSource = wasmCandidates.find((candidate) => existsSync(candidate));
if (!wasmSource) {
  errors.push(
    'no built component found; run npm run build:wasm (expected target/wasm32-wasip1/{debug,release}/super_join.wasm)',
  );
} else if (existsSync(dist)) {
  mkdirSync(resolve(dist, 'wasm'), { recursive: true });
  copyFileSync(wasmSource, resolve(dist, 'wasm', 'super_join.wasm'));
}

// 2. Stage the transpiled glue so the built loader resolves it from dist/pkg/.
if (!existsSync(pkgDir)) {
  errors.push('pkg/ glue is missing; run npm run build:wasm (jco transpile)');
} else if (existsSync(dist)) {
  cpSync(pkgDir, resolve(dist, 'pkg'), { recursive: true });
}

// 3. Stage the generated WIT declarations so dist/wit.d.ts resolves inside the
//    package (the source tree path does not exist in a published tarball).
const typesDir = resolve(root, 'src-js/types');
if (!existsSync(typesDir)) {
  errors.push('src-js/types is missing; run npm run build:wasm (jco types)');
} else if (existsSync(dist)) {
  cpSync(typesDir, resolve(dist, 'types'), { recursive: true });
}

// 4. Validate package.json exports against real files.
const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
for (const [subpath, target] of Object.entries(manifest.exports ?? {})) {
  const entries = typeof target === 'string' ? { default: target } : target;
  for (const conditionTarget of Object.values(entries)) {
    if (typeof conditionTarget !== 'string') continue;
    if (!existsSync(resolve(root, conditionTarget))) {
      errors.push(`export "${subpath}" (${conditionTarget}) does not resolve to a real file`);
    }
  }
}

if (errors.length > 0) {
  console.error('super-join package staging failed:');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log('staged dist/wasm/super_join.wasm and validated package exports');
