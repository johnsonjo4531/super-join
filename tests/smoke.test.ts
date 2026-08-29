// Package smoke tests: the public entry point exposes the documented API and
// error type behaves correctly across the boundary.

import { describe, expect, test } from 'vitest';

import {
  ExpressionBuilder,
  compile,
  expr,
  graphqlToSQL,
  SuperJoinError,
} from '../src-js/index.js';

describe('public API surface', () => {
  test('exports the documented symbols', () => {
    expect(typeof compile).toBe('function');
    expect(typeof graphqlToSQL).toBe('function');
    expect(typeof ExpressionBuilder).toBe('function');
    expect(typeof expr).toBe('object');
  });

  test('expr builder returns serializable specs', () => {
    const spec = expr.column(0n);
    expect(spec).toEqual({ kind: 'column', ref: 0n, resolver: undefined });
  });
});

describe('SuperJoinError', () => {
  test('is an Error with a code', () => {
    const error = new SuperJoinError('invalid-model', 'bad model');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(SuperJoinError);
    expect(error.code).toBe('invalid-model');
    expect(error.message).toBe('bad model');
    expect(error.name).toBe('SuperJoinError');
  });
});
