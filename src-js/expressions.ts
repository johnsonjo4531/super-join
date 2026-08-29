import type {
  ComparisonOperator,
  ExprNode,
  Expression,
  Parameter,
  ScalarType,
  Value,
} from './wit.js';

/** Raw values accepted by the builder before being wrapped as a WIT `Value`. */
export type RawValue = number | bigint | string | boolean | Uint8Array;

/** Maps a field reference (e.g. "users.id") to its numeric id in the model. */
export type ColumnResolver = (field: string) => bigint | undefined;

// In-memory description of the flattened WIT expression tree. Callers only ever
// see the public builder API and the serializable `Expression`; `ExpressionSpec`
// is exposed so other modules can accumulate expressions before building.
export type ExpressionSpec =
  | { kind: 'parameter'; value: Value; dataType: ScalarType }
  | { kind: 'column'; ref: string | bigint; resolver?: ColumnResolver }
  | { kind: 'parent-column'; depth: number; ref: string | bigint; resolver?: ColumnResolver }
  | { kind: 'and'; children: ExpressionSpec[] }
  | { kind: 'or'; children: ExpressionSpec[] }
  | { kind: 'not'; child: ExpressionSpec }
  | { kind: 'compare'; op: ComparisonOperator; left: ExpressionSpec; right: ExpressionSpec }
  | { kind: 'is-null'; child: ExpressionSpec }
  | { kind: 'is-not-null'; child: ExpressionSpec }
  | { kind: 'in-list'; child: ExpressionSpec; values: Array<{ value: RawValue; dataType: ScalarType }> };

const emptyBigUint64 = (): BigUint64Array => new BigUint64Array(0);
const emptyParameterArray = (): Array<Parameter> => [];

function bigUint64(items: bigint[]): BigUint64Array {
  const array = new BigUint64Array(items.length);
  for (let i = 0; i < items.length; i += 1) {
    array[i] = items[i]!;
  }
  return array;
}

function toValue(value: RawValue, dataType: ScalarType): Value {
  switch (dataType) {
    case 'boolean':
      return { tag: 'boolean', val: Boolean(value) };
    case 'int8':
    case 'int16':
    case 'int32':
    case 'int64':
    case 'uint8':
    case 'uint16':
    case 'uint32':
    case 'uint64':
      return { tag: 'integer', val: BigInt(Number(value)) };
    case 'float32':
    case 'float64':
    case 'decimal':
      return { tag: 'float', val: Number(value) };
    default:
      return { tag: 'text', val: String(value) };
  }
}

function resolveColumn(ref: string | bigint, resolver?: ColumnResolver): bigint {
  if (typeof ref === 'bigint') {
    return ref;
  }
  if (resolver) {
    const id = resolver(ref);
    if (id === undefined || id === null) {
      throw new TypeError(`column resolver rejected field "${ref}"`);
    }
    return id;
  }
  throw new TypeError(
    `column reference "${ref}" must be a numeric field id (bigint) or supplied with a resolver`,
  );
}

function flatten(spec: ExpressionSpec, nodes: ExprNode[], resolver?: ColumnResolver): number {
  switch (spec.kind) {
    case 'parameter': {
      nodes.push({
        kind: 'parameter',
        value: spec.value,
        dataType: spec.dataType,
        operands: emptyBigUint64(),
        values: emptyParameterArray(),
      });
      return nodes.length - 1;
    }
    case 'column': {
      nodes.push({
        kind: 'column',
        column: resolveColumn(spec.ref, spec.resolver ?? resolver),
        operands: emptyBigUint64(),
        values: emptyParameterArray(),
      });
      return nodes.length - 1;
    }
    case 'parent-column': {
      nodes.push({
        kind: 'parent-column',
        column: resolveColumn(spec.ref, spec.resolver ?? resolver),
        depth: BigInt(spec.depth),
        operands: emptyBigUint64(),
        values: emptyParameterArray(),
      });
      return nodes.length - 1;
    }
    case 'compare': {
      const left = flatten(spec.left, nodes, resolver);
      const right = flatten(spec.right, nodes, resolver);
      nodes.push({
        kind: 'compare',
        compareOp: spec.op,
        operands: bigUint64([BigInt(left), BigInt(right)]),
        values: emptyParameterArray(),
      });
      return nodes.length - 1;
    }
    case 'and':
    case 'or': {
      const flattened: number[] = [];
      for (const child of spec.children) {
        if (!child) {
          // Skip absent optional operands rather than materializing an empty node.
          continue;
        }
        if (child.kind === spec.kind) {
          // Hoist nested same-operator operands into this node.
          for (const grandchild of child.children) {
            if (grandchild) {
              flattened.push(flatten(grandchild, nodes, resolver));
            }
          }
        } else {
          flattened.push(flatten(child, nodes, resolver));
        }
      }
      if (flattened.length === 0) {
        throw new TypeError(`${spec.kind} expression needs at least one operand`);
      }
      nodes.push({
        kind: spec.kind === 'and' ? 'boolean-and' : 'boolean-or',
        operands: bigUint64(flattened.map((index) => BigInt(index))),
        values: emptyParameterArray(),
      });
      return nodes.length - 1;
    }
    case 'not':
    case 'is-null':
    case 'is-not-null': {
      const operand = flatten(spec.child, nodes, resolver);
      nodes.push({
        kind: spec.kind,
        operands: bigUint64([BigInt(operand)]),
        values: emptyParameterArray(),
      });
      return nodes.length - 1;
    }
    case 'in-list': {
      const operand = flatten(spec.child, nodes, resolver);
      nodes.push({
        kind: 'in-list',
        operands: bigUint64([BigInt(operand)]),
        values: spec.values.map((entry) => ({
          value: toValue(entry.value, entry.dataType),
          dataType: entry.dataType,
        })),
      });
      return nodes.length - 1;
    }
    default: {
      const exhaustivenessCheck: never = spec;
      throw new TypeError(`unhandled expression spec: ${JSON.stringify(exhaustivenessCheck)}`);
    }
  }
}

export class ExpressionBuilder {
  #resolver?: ColumnResolver;

  constructor(resolver?: ColumnResolver) {
    this.#resolver = resolver;
  }

  /** A literal value bound into the query as a typed parameter. */
  literal(value: RawValue, dataType: ScalarType): ExpressionSpec {
    return { kind: 'parameter', value: toValue(value, dataType), dataType };
  }

  /** An already-wrapped WIT value bound as a typed parameter. */
  parameter(value: Value, dataType: ScalarType): ExpressionSpec {
    return { kind: 'parameter', value, dataType };
  }

  /** Column reference resolved to a field id. Pass a resolver to map names. */
  column(ref: string | bigint, resolver?: ColumnResolver): ExpressionSpec {
    return { kind: 'column', ref, resolver: resolver ?? this.#resolver };
  }

  /** Parent (correlated) column reference at the given join depth. */
  parentColumn(depth: number, ref: string | bigint, resolver?: ColumnResolver): ExpressionSpec {
    return { kind: 'parent-column', depth, ref, resolver: resolver ?? this.#resolver };
  }

  /** Conjunctive combination. Nested `and` operands are flattened into this node. */
  and(...children: ExpressionSpec[]): ExpressionSpec {
    return { kind: 'and', children };
  }

  /** Disjunctive combination. Nested `or` operands are flattened into this node. */
  or(...children: ExpressionSpec[]): ExpressionSpec {
    return { kind: 'or', children };
  }

  /** Unary negation of a boolean expression. */
  not(child: ExpressionSpec): ExpressionSpec {
    return { kind: 'not', child };
  }

  /** Comparison between two operands using a SQL comparison operator. */
  compare(op: ComparisonOperator, left: ExpressionSpec, right: ExpressionSpec): ExpressionSpec {
    return { kind: 'compare', op, left, right };
  }

  /** `left = right`. */
  eq(left: ExpressionSpec, right: ExpressionSpec): ExpressionSpec {
    return this.compare('eq', left, right);
  }

  /** `left <> right`. */
  ne(left: ExpressionSpec, right: ExpressionSpec): ExpressionSpec {
    return this.compare('ne', left, right);
  }

  /** `left < right`. */
  lt(left: ExpressionSpec, right: ExpressionSpec): ExpressionSpec {
    return this.compare('lt', left, right);
  }

  /** `left <= right`. */
  lte(left: ExpressionSpec, right: ExpressionSpec): ExpressionSpec {
    return this.compare('lte', left, right);
  }

  /** `left > right`. */
  gt(left: ExpressionSpec, right: ExpressionSpec): ExpressionSpec {
    return this.compare('gt', left, right);
  }

  /** `left >= right`. */
  gte(left: ExpressionSpec, right: ExpressionSpec): ExpressionSpec {
    return this.compare('gte', left, right);
  }

  /** Ergonomic alias for `literal`: a value bound as a typed parameter. */
  value(value: RawValue, dataType: ScalarType): ExpressionSpec {
    return this.literal(value, dataType);
  }

  /** `IS NULL` test. */
  isNull(child: ExpressionSpec): ExpressionSpec {
    return { kind: 'is-null', child };
  }

  /** `IS NOT NULL` test. */
  isNotNull(child: ExpressionSpec): ExpressionSpec {
    return { kind: 'is-not-null', child };
  }

  /**
   * `IN (values)` membership test. An empty value list is intentionally allowed
   * and compiles to a constant-false predicate.
   */
  inList(child: ExpressionSpec, values: Array<{ value: RawValue; dataType: ScalarType }>): ExpressionSpec {
    return { kind: 'in-list', child, values };
  }

  /** Flatten the tree into the WIT expression: a topologically ordered node list. */
  build(root: ExpressionSpec): Expression {
    const nodes: ExprNode[] = [];
    flatten(root, nodes, this.#resolver);
    return { nodes };
  }
}

/** Shared, resolver-less builder for building expressions without field names. */
export const expr = new ExpressionBuilder();
