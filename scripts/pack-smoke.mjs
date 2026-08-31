// Packed-package smoke tests (see ai-design-docs/typescript-build.md and
// typescript-testing.md). Packs the real npm tarball, extracts it into a clean
// node_modules layout, and verifies against the PACKED package — not the
// source tree — that:
//   * every public export maps to a real file in the tarball,
//   * declarations are present for both entry points,
//   * the Wasm Component is shipped as a visible dist/wasm asset,
//   * `import "super-join"` works without `graphql` installed at runtime,
//   * `import "super-join/graphql"` loads with `graphql` supplied by the host,
//   * the loader compiles through the packaged artifact, and
//   * a missing component asset fails with a structured initialization error.

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, readFileSync, existsSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const work = mkdtempSync(join(tmpdir(), 'super-join-pack-'));
let failures = 0;

function check(name, condition, detail) {
  if (condition) {
    console.log(`ok   ${name}`);
  } else {
    failures += 1;
    console.error(`FAIL ${name}${detail ? `: ${detail}` : ''}`);
  }
}

try {
  // 1. Pack and inspect the tarball contents.
  const packed = execFileSync('npm', ['pack', '--pack-destination', work], { cwd: root, encoding: 'utf8' }).trim().split('\n').pop();
  const tarball = resolve(work, packed);
  check('npm pack produced a tarball', existsSync(tarball), packed);

  const listing = execFileSync('tar', ['-tf', tarball], { encoding: 'utf8' });
  const entries = new Set(listing.split('\n').filter(Boolean));
  const required = [
    'package/package.json',
    'package/dist/index.js',
    'package/dist/index.d.ts',
    'package/dist/graphql.js',
    'package/dist/graphql.d.ts',
    'package/dist/decorators.js',
    'package/dist/decorators.d.ts',
    'package/dist/decorators/graphql.js',
    'package/dist/decorators/graphql.d.ts',
    'package/dist/wasm/super_join.wasm',
    'package/dist/pkg/super_join.js',
    'package/dist/pkg/super_join.core.wasm',
    'package/dist/types/generated/wit/interfaces/super-join-compiler-compiler.d.ts',
  ];
  for (const entry of required) {
    check(`tarball contains ${entry}`, entries.has(entry));
  }

  // 2. Extract into a clean node_modules layout.
  const pkgDir = join(work, 'extracted', 'node_modules', 'super-join');
  mkdirSync(pkgDir, { recursive: true });
  execFileSync('tar', ['-xf', tarball, '-C', pkgDir, '--strip-components', '1']);

  // The loader needs the preview2 shim from the host; supply it (and `graphql`
  // for the GraphQL entry) without network access.
  symlinkSync(resolve(root, 'node_modules/@bytecodealliance'), join(work, 'extracted/node_modules/@bytecodealliance'));

  // 3. Import the generic entry with NO graphql installed and compile through
  //    the packaged artifact (loader must resolve dist/pkg relative to itself).
  const consumer = join(work, 'extracted', 'consumer.mjs');
  writeFileSync(
    consumer,
    `
import { compile, defaultComponentLoader, expr, ExpressionBuilder, SuperJoinError } from 'super-join';

const field = (id, name) => ({
  id: BigInt(id),
  identifier: { components: [name] },
  dataType: 'int64',
  nullable: false,
  selectable: true,
});
const request = {
  model: { entities: [{
    id: 0n,
    source: { components: ['users'] },
    fields: [field(0, 'id'), field(1, 'name')],
    relations: [],
    identity: new BigUint64Array([0n]),
  }] },
  query: { root: 0n, queries: [{
    entity: 0n,
    selection: [{ kind: 'field', field: 1n, outputKey: 'name', path: ['name'], queryRef: null }],
    predicate: [], orderBy: [], limit: null, offset: null, path: ['users'], nested: new BigUint64Array(0),
  }] },
  options: { dialect: 'postgres' },
};

export async function run() {
  const result = await compile(request);
  return {
    sql: result.artifact.sql,
    exports: [typeof compile, typeof defaultComponentLoader, typeof expr, typeof ExpressionBuilder, typeof SuperJoinError],
  };
}
`,
  );
  const consumerModule = await import(pathToFileURL(consumer).href);
  const outcome = await consumerModule.run();
  check(
    'generic entry compiles through the packaged artifact',
    outcome.sql === 'SELECT "users"."name" AS "name" FROM "users" AS "users"',
    outcome.sql,
  );
  check('generic entry exposes the documented API', outcome.exports.every((kind) => kind === 'function' || kind === 'object'));

  // 4. The packaged wasm asset is a real component (magic bytes), not a stub.
  const wasmBytes = readFileSync(join(pkgDir, 'dist/wasm/super_join.wasm'));
  check('dist/wasm/super_join.wasm has wasm magic', wasmBytes.subarray(0, 4).toString('hex') === '0061736d');

  // 5. A missing component artifact yields a structured initialization error.
  const brokenDir = join(work, 'broken', 'node_modules', 'super-join');
  mkdirSync(brokenDir, { recursive: true });
  execFileSync('tar', ['-xf', tarball, '-C', brokenDir, '--strip-components', '1']);
  rmSync(join(brokenDir, 'dist/pkg'), { recursive: true, force: true });
  symlinkSync(resolve(root, 'node_modules/@bytecodealliance'), join(work, 'broken/node_modules/@bytecodealliance'));
  const brokenConsumer = join(work, 'broken', 'broken-consumer.mjs');
  writeFileSync(
    brokenConsumer,
    `
import { compile } from 'super-join';
export async function run() {
  try {
    await compile({ model: { entities: [] }, query: { root: 0n, queries: [], options: { dialect: 'postgres' } } });
    return null;
  } catch (error) {
    return { name: error.name, code: error.code };
  }
}
`,
  );
  const brokenOutcome = await import(pathToFileURL(brokenConsumer).href);
  const failure = await brokenOutcome.run();
  check(
    'missing component artifact fails with a structured SuperJoinError',
    failure !== null && failure.name === 'SuperJoinError' && typeof failure.code === 'string',
    JSON.stringify(failure),
  );

  // 6. GraphQL entry loads when the host supplies `graphql`; declarations for
  //    both entries exist and type-check against a consumer file.
  symlinkSync(resolve(root, 'node_modules/graphql'), join(work, 'extracted/node_modules/graphql'));
  const graphqlConsumer = join(work, 'extracted', 'graphql-consumer.mjs');
  writeFileSync(
    graphqlConsumer,
    `
import { graphqlToSQL } from 'super-join/graphql';
export function kind() { return typeof graphqlToSQL; }
`,
  );
  const graphqlOutcome = await import(pathToFileURL(graphqlConsumer).href);
  check('graphql entry loads with host-supplied graphql', graphqlOutcome.kind() === 'function');

  const declConsumer = join(work, 'extracted', 'decl-consumer.ts');
  writeFileSync(
    declConsumer,
    `
import { compile, expr, superjoin, hydrate } from 'super-join';
import { graphqlToSQL } from 'super-join/graphql';
import { Entity, Field, Relation, entityIdOf, entityMetadataOf, modelFromClasses } from 'super-join/decorators';
import { GraphQLField, graphQLModelFromClasses } from 'super-join/decorators/graphql';
export const kinds = [typeof compile, typeof expr, typeof superjoin, typeof hydrate, typeof graphqlToSQL, typeof Entity, typeof Field, typeof Relation, typeof entityIdOf, typeof entityMetadataOf, typeof modelFromClasses, typeof GraphQLField, typeof graphQLModelFromClasses];
`,
  );
  try {
    execFileSync(
      resolve(root, 'node_modules/.bin/tsc'),
      ['--noEmit', '--strict', '--target', 'es2022', '--module', 'nodenext', '--moduleResolution', 'nodenext', declConsumer],
      { cwd: join(work, 'extracted'), encoding: 'utf8' },
    );
    check('declarations resolve for all entry points', true);
  } catch (error) {
    check('declarations resolve for all entry points', false, error.stderr ?? String(error));
  }
} finally {
  if (failures === 0) {
    rmSync(work, { recursive: true, force: true });
  } else {
    console.error(`kept ${work} for inspection`);
  }
}

process.exit(failures === 0 ? 0 : 1);
