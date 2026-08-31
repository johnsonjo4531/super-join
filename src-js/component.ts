// Runtime boundary for the super-join compiler component.
//
// The Rust core implements the compiler behind a WIT/Component boundary. This
// module hides the WASI glue behind a small `CompiledComponent` interface,
// injects a loader for tests, and translates boundary failures into a typed
// `SuperJoinError` that an application can inspect without a host exception.

import type { CompilerRequest, CompilerResult, ErrorCode } from './wit.js';

/** A compiled component: the thin facade over the WASI glue's `compiler.compile`. */
export type CompiledComponent = {
  compile(request: CompilerRequest): CompilerResult;
};

/** Produces a `CompiledComponent`. Injectable in tests via `setComponentLoaderForTesting`. */
export type ComponentLoader = () => Promise<CompiledComponent>;

let currentLoader: ComponentLoader | undefined;

/** Swap in a fake loader. Clears the injected loader when called with no argument. */
export function setComponentLoaderForTesting(loader?: ComponentLoader): void {
  currentLoader = loader;
}

/** Remove any loader installed by `setComponentLoaderForTesting`. */
export function resetComponentLoaderForTesting(): void {
  currentLoader = undefined;
}

/**
 * Effective default loader: a loader installed via
 * `setComponentLoaderForTesting` wins, otherwise the real glue is imported.
 */
const effectiveLoader: ComponentLoader = async () => (currentLoader ? currentLoader() : defaultComponentLoader());

/**
 * Glue module candidates, in resolution order. `./pkg/...` matches the staged
 * package layout (`dist/index.js` next to `dist/pkg/super_join.js`);
 * `../pkg/...` matches the source-tree layout used by tests and development.
 * The glue is produced by `jco transpile` and loads the component's wasm from
 * disk beside it — the component is never bundled into JavaScript.
 */
const GLUE_CANDIDATES = ['./pkg/super_join.js', '../pkg/super_join.js'];

/**
 * Default loader: imports the transpiled jco glue (which reads the component
 * wasm from disk and wires WASI through @bytecodealliance/preview2-shim).
 * Supported hosts: Node.js with the preview2 shim available; a browser without
 * WASI support reports a structured initialization error instead of crashing.
 */
export async function defaultComponentLoader(): Promise<CompiledComponent> {
  if (typeof process === 'undefined' || process.versions?.node === undefined) {
    throw new SuperJoinError(
      'unsupported-dialect',
      'super-join runs on a WASI-capable host runtime (e.g. Node.js); it cannot load in a browser',
    );
  }

  let glue: unknown;
  let lastError: unknown;
  for (const candidate of GLUE_CANDIDATES) {
    try {
      glue = await import(/* @vite-ignore */ /* webpackIgnore: true */ candidate);
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!glue) {
    const detail = lastError instanceof Error ? lastError.message : String(lastError);
    throw new SuperJoinError(
      'unsupported-dialect',
      `the super-join component artifact is unavailable (looked for ${GLUE_CANDIDATES.join(', ')}): ${detail}`,
    );
  }
  const { compiler } = glue as unknown as {
    compiler?: { compile(request: CompilerRequest): CompilerResult };
  };
  if (!compiler || typeof compiler.compile !== 'function') {
    throw new SuperJoinError(
      'unsupported-dialect',
      'component glue did not expose a "compiler.compile" export',
    );
  }
  return { compile: compiler.compile.bind(compiler) };
}

/**
 * Compile a request into a SQL artifact. Awaits the (async) component loader and
 * converts any trap or WIT failure into a typed `SuperJoinError`.
 */
export async function compile(
  request: CompilerRequest,
  loader: ComponentLoader = effectiveLoader,
): Promise<CompilerResult> {
  try {
    const component = await loader();
    return component.compile(request);
  } catch (error) {
    throw toSuperJoinError(error);
  }
}

const ERROR_CODE_RE =
  /^(invalid-request|invalid-model|unknown-field|unknown-relation|invalid-expression|unsupported-feature|unsupported-dialect)\b/;

/**
 * Turns a thrown value (a WASI trap, a glue validation error, etc.) into a
 * structured `SuperJoinError`. A WIT typed error arrives as an exception whose
 * `payload` carries the stable compiler code/message/path, so that payload is
 * preferred; anything unparseable becomes `invalid-request` rather than a raw
 * exception.
 */
function toSuperJoinError(error: unknown): SuperJoinError {
  if (error instanceof SuperJoinError) {
    return error;
  }
  const payload = (error as { payload?: Partial<CompilerErrorPayload> } | undefined)?.payload;
  if (payload && typeof payload.code === 'string' && ERROR_CODES.has(payload.code)) {
    const structured = new SuperJoinError(payload.code, payload.message ?? 'compilation failed');
    if (payload.path) {
      structured.path = payload.path;
    }
    return structured;
  }
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(ERROR_CODE_RE);
  const code: ErrorCode = match ? (match[1] as ErrorCode) : 'invalid-request';
  return new SuperJoinError(code, message || 'compilation failed');
}

interface CompilerErrorPayload {
  code: ErrorCode;
  message: string;
  path?: string | undefined;
}

const ERROR_CODES = new Set<ErrorCode>([
  'invalid-request',
  'invalid-model',
  'unknown-field',
  'unknown-relation',
  'invalid-expression',
  'unsupported-feature',
  'unsupported-dialect',
]);

/** Structured error surfaced across the component boundary for application handling. */
export class SuperJoinError extends Error {
  readonly code: ErrorCode;
  /** Optional request-relative path carried from the compiler when available. */
  path?: string;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'SuperJoinError';
    // Restore the prototype chain after ES transpilation so `instanceof` holds.
    Object.setPrototypeOf(this, SuperJoinError.prototype);
  }
}
