// Public WIT contract for the super-join compiler boundary.
//
// The declarations below are produced by the WIT generator. This file only
// re-exports them (as types) so downstream code depends on a single stable
// surface instead of the generator's output location. `export type` keeps this
// a type-only boundary: the generated `.d.ts` carries no runtime output to load,
// so bundlers and the Node runtime never try to import it at runtime.
export type * from '../types/generated/wit/interfaces/super-join-compiler-compiler.d.ts';
