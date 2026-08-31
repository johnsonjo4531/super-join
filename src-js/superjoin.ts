// The primary super-join API: compile + execute-your-driver + hydrate in one
// call. `superjoin()` takes a `CompilerRequest`, compiles it to an SQL
// artifact, hands the artifact to your callback so you can run it with your
// own driver, and regroups the flattened rows into nested entities.
// `superjoin.graphql()` is the GraphQL-shaped front of the same pipeline:
// ResolveInfo + context + model in, hydrated entities out.

import { compile, type ComponentLoader } from './component.js';
import { graphqlToSQL, type GraphQLToSqlArgs } from './graphql.js';
import { hydrate, type HydratedEntity } from './hydration.js';
import type { CompilerRequest, SqlArtifact } from './wit.js';

/** One row returned by the application's driver, keyed by SQL output alias. */
export type DriverRow = Record<string, unknown>;

/**
 * Callback handed the compiled artifact. Run it with your own driver and
 * return (or resolve to) the flattened rows; super-join never connects to or
 * executes against a database itself.
 */
export type ArtifactExecutor<TRow = DriverRow> = (
  artifact: SqlArtifact,
) => Promise<readonly TRow[]> | readonly TRow[];

/** Options accepted by {@link superjoin} and {@link superjoin.graphql}. */
export interface SuperJoinOptions {
  /** Custom component loader; defaults to the packaged Wasm Component. */
  loader?: ComponentLoader;
}

async function runSuperJoin<TRow extends DriverRow>(
  request: CompilerRequest,
  execute: ArtifactExecutor<TRow>,
  options?: SuperJoinOptions,
): Promise<HydratedEntity[]> {
  const { artifact } = await compile(request, options?.loader ?? undefined);
  const rows = await execute(artifact);
  return hydrate(rows, artifact);
}

/**
 * Compile a request, run the artifact through your driver callback, and
 * hydrate the flattened rows into nested entities. This is the main super-join
 * API: most applications should call `superjoin()` (or `superjoin.graphql()`)
 * rather than driving `compile` and `hydrate` separately.
 */
export const superjoin = Object.assign(runSuperJoin, {
  /**
   * GraphQL-shaped entry point: translates a GraphQL.js `ResolveInfo` (plus
   * resolver context and Super-Join metadata) into a request, then runs the
   * same compile → execute-callback → hydrate pipeline as {@link superjoin}.
   */
  graphql: async <TContext = unknown, TRow extends DriverRow = DriverRow>({
    execute,
    loader,
    ...graphqlArgs
  }: GraphQLToSqlArgs<TContext> & {
    /** Your driver callback; receives the compiled artifact, returns rows. */
    execute: ArtifactExecutor<TRow>;
    /** Custom component loader; defaults to the packaged Wasm Component. */
    loader?: ComponentLoader;
  }): Promise<HydratedEntity[]> => {
    const request = await graphqlToSQL(graphqlArgs);
    return runSuperJoin(request, execute, { loader });
  },
});
