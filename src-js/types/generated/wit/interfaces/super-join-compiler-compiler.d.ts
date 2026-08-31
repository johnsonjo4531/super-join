/** @module Interface super-join:compiler/compiler@0.1.0 **/
/**
 * The stable exported operation. One request yields exactly one result
 * (either a successful artifact or a structured error).
 */
export function compile(request: CompilerRequest): CompilerResult;
/**
 * =====================================================================
 * Scalar values that may cross the boundary
 * =====================================================================
 * A scalar value supplied by a host. Values are always typed; untyped JSON is
 * rejected at the boundary rather than silently stringified.
 */
export type Value = ValueNull | ValueBoolean | ValueInteger | ValueFloat | ValueText | ValueBinary;
export interface ValueNull {
  tag: 'null',
}
export interface ValueBoolean {
  tag: 'boolean',
  val: boolean,
}
export interface ValueInteger {
  tag: 'integer',
  val: bigint,
}
export interface ValueFloat {
  tag: 'float',
  val: number,
}
export interface ValueText {
  tag: 'text',
  val: string,
}
export interface ValueBinary {
  tag: 'binary',
  val: Uint8Array,
}
/**
 * Declared scalar type of a model field / parameter.
 * # Variants
 * 
 * ## `"null"`
 * 
 * ## `"boolean"`
 * 
 * ## `"int8"`
 * 
 * ## `"int16"`
 * 
 * ## `"int32"`
 * 
 * ## `"int64"`
 * 
 * ## `"uint8"`
 * 
 * ## `"uint16"`
 * 
 * ## `"uint32"`
 * 
 * ## `"uint64"`
 * 
 * ## `"float32"`
 * 
 * ## `"float64"`
 * 
 * ## `"decimal"`
 * 
 * ## `"date"`
 * 
 * ## `"time"`
 * 
 * ## `"time-tz"`
 * 
 * ## `"timestamp"`
 * 
 * ## `"timestamp-tz"`
 * 
 * ## `"uuid"`
 * 
 * ## `"jsonb"`
 */
export type ScalarType = 'null' | 'boolean' | 'int8' | 'int16' | 'int32' | 'int64' | 'uint8' | 'uint16' | 'uint32' | 'uint64' | 'float32' | 'float64' | 'decimal' | 'date' | 'time' | 'time-tz' | 'timestamp' | 'timestamp-tz' | 'uuid' | 'jsonb';
/**
 * =====================================================================
 * Diagnostics
 * =====================================================================
 * Source location for a diagnostic, when available.
 */
export interface SourceLocation {
  path: string,
  line: bigint,
  column: bigint,
  length: bigint,
}
/**
 * =====================================================================
 * Identifiers (dotted, never raw SQL fragments)
 * =====================================================================
 * A dotted identifier expressed as ordered components (e.g. ["users","id"]).
 * Physical identifiers are always components, never raw SQL.
 */
export interface Identifier {
  components: Array<string>,
}
/**
 * Cardinality of a relation endpoint.
 * # Variants
 * 
 * ## `"one"`
 * 
 * ## `"many"`
 */
export type Cardinality = 'one' | 'many';
/**
 * =====================================================================
 * Expression model: serializable, database-independent meaning
 * =====================================================================
 * 
 * Expressions are flattened into a list of `expr-node`s. The last node
 * (`nodes[-1]`) is the root. Every operand references a node by its index into
 * `nodes`, so operands must always precede their use (topological order).
 * Values become parameters; identifiers resolve to columns. No SQL text
 * appears here.
 * # Variants
 * 
 * ## `"eq"`
 * 
 * ## `"ne"`
 * 
 * ## `"lt"`
 * 
 * ## `"lte"`
 * 
 * ## `"gt"`
 * 
 * ## `"gte"`
 */
export type ComparisonOperator = 'eq' | 'ne' | 'lt' | 'lte' | 'gt' | 'gte';
/**
 * # Variants
 * 
 * ## `"and"`
 * 
 * ## `"or"`
 */
export type BooleanOperator = 'and' | 'or';
/**
 * # Variants
 * 
 * ## `"is-null"`
 * 
 * ## `"is-not-null"`
 */
export type IsNullOperator = 'is-null' | 'is-not-null';
/**
 * SQL aggregate function applied to one term (`*` when the node has no
 * operand; only `count` allows that). Used in computed-field projections.
 * # Variants
 * 
 * ## `"count"`
 * 
 * ## `"sum"`
 * 
 * ## `"min"`
 * 
 * ## `"max"`
 * 
 * ## `"avg"`
 */
export type AggregateFunction = 'count' | 'sum' | 'min' | 'max' | 'avg';
/**
 * A runtime value bound as a SQL parameter.
 */
export interface Parameter {
  value: Value,
  dataType: ScalarType,
}
/**
 * A parent-scoped column reference (correlation).
 */
export interface ParentColumn {
  depth: bigint,
  field: bigint,
}
/**
 * # Variants
 * 
 * ## `"parameter"`
 * 
 * ## `"column"`
 * 
 * ## `"parent-column"`
 * 
 * ## `"compare"`
 * 
 * ## `"boolean-and"`
 * 
 * ## `"boolean-or"`
 * 
 * ## `"not"`
 * 
 * ## `"is-null"`
 * 
 * ## `"is-not-null"`
 * 
 * ## `"in-list"`
 * 
 * ## `"aggregate"`
 */
export type ExprKind = 'parameter' | 'column' | 'parent-column' | 'compare' | 'boolean-and' | 'boolean-or' | 'not' | 'is-null' | 'is-not-null' | 'in-list' | 'aggregate';
/**
 * One node of a flattened expression tree.
 */
export interface ExprNode {
  kind: ExprKind,
  /**
   * Literal value (kind = parameter).
   */
  value?: Value,
  /**
   * Scalar type of a parameter value (kind = parameter).
   */
  dataType?: ScalarType,
  /**
   * Operand indices into the enclosing `nodes` list.
   *   compare:            [left, right]
   *   boolean-and/or:     [term, term, ...]
   *   not/is-null/is-not: [term]
   *   in-list:            [term]
   */
  operands: BigUint64Array,
  /**
   * Comparison operator (kind = compare).
   */
  compareOp?: ComparisonOperator,
  /**
   * Column id (kind = column or parent-column).
   */
  column?: bigint,
  /**
   * Join depth (kind = parent-column).
   */
  depth?: bigint,
  /**
   * The RHS value list (kind = in-list).
   */
  values: Array<Parameter>,
  /**
   * Aggregate function (kind = aggregate; no operand means `*` for count).
   */
  aggFunc?: AggregateFunction,
}
/**
 * The flattened expression: list of nodes, last one being the root.
 */
export interface Expression {
  nodes: Array<ExprNode>,
}
/**
 * A scalar SELECT expression that satisfies a field instead of a physical
 * column. `projection` is the part after `SELECT`; `entity` is the FROM
 * source (a model entity id); `predicate` is the optional WHERE clause.
 * Columns in these expressions resolve against `entity`; `parent-column`
 * correlates to the occurrence that owns the field.
 */
export interface ComputedField {
  entity: bigint,
  projection: Expression,
  predicate?: Expression,
}
/**
 * =====================================================================
 * Model: declarative description of queryable data
 * =====================================================================
 * Metadata for one scalar field. `computed` marks a field whose value is a
 * SELECT expression (e.g. `(SELECT COUNT(*) FROM posts WHERE ...)`) rather
 * than a physical column; `identifier` then names the output only.
 */
export interface FieldMetadata {
  id: bigint,
  identifier: Identifier,
  dataType: ScalarType,
  nullable: boolean,
  selectable: boolean,
  computed?: ComputedField,
}
/**
 * Metadata for one relation between two entities.
 */
export interface RelationMetadata {
  id: bigint,
  target: bigint,
  cardinality: Cardinality,
  /**
   * Flattened expression: last node is the root, operands are indices.
   */
  join: Expression,
}
/**
 * Metadata for one root entity. `source` names the backing table(s).
 * `identity` lists the field ids that uniquely identify a row (the primary
 * key); both endpoints of any nested relation must declare an identity so
 * result-shape metadata can record how flattened rows regroup.
 */
export interface EntityMetadata {
  id: bigint,
  source: Identifier,
  fields: Array<FieldMetadata>,
  relations: Array<RelationMetadata>,
  identity: BigUint64Array,
}
/**
 * The complete set of entities that make up a request model.
 */
export interface Model {
  entities: Array<EntityMetadata>,
}
/**
 * # Variants
 * 
 * ## `"asc"`
 * 
 * ## `"desc"`
 */
export type SortDirection = 'asc' | 'desc';
export interface OrderBy {
  direction: SortDirection,
  field: bigint,
}
/**
 * # Variants
 * 
 * ## `"field"`
 * 
 * ## `"relation"`
 */
export type SelectionKind = 'field' | 'relation';
export interface SelectionNode {
  kind: SelectionKind,
  /**
   * For field selections.
   */
  field?: bigint,
  /**
   * For relation selections.
   */
  relation?: bigint,
  outputKey?: string,
  path: Array<string>,
  /**
   * For relation selections: index into `query.queries`.
   */
  queryRef?: bigint,
}
export interface QueryNode {
  entity: bigint,
  selection: Array<SelectionNode>,
  /**
   * Flattened predicate; last node is the root. Empty == no predicate.
   */
  predicate: Array<ExprNode>,
  orderBy: Array<OrderBy>,
  limit?: bigint,
  offset?: bigint,
  path: Array<string>,
  /**
   * Indices (into `query.queries`) of directly-nested queries.
   */
  nested: BigUint64Array,
}
/**
 * =====================================================================
 * Query / selection graph: serialized as a flat list of nodes
 * =====================================================================
 * 
 * All query nodes (the root plus every nested query) live in
 * `query.queries`. Each `query-node` may reference deeper queries by index via
 * `nested`, and each `selection-node` references a nested query via
 * `query-ref`. Every referenced index must be strictly less than the
 * referencing index, so the list is in topological order with the root last.
 */
export interface Query {
  /**
   * Index of the root query within `queries` (always the last element).
   */
  root: bigint,
  queries: Array<QueryNode>,
}
/**
 * =====================================================================
 * Result: the SQL artifact (not executed here)
 * =====================================================================
 * One selected output column and how it maps to a logical field.
 */
export interface SelectedField {
  alias: string,
  field: bigint,
  path: Array<string>,
}
/**
 * How selected rows correspond to the requested entities.
 * # Variants
 * 
 * ## `"flat"`
 * 
 * ## `"nested"`
 * 
 * ## `"json"`
 */
export type ResultShapeKind = 'flat' | 'nested' | 'json';
/**
 * One identity (primary-key) column of an entity occurrence as it appears
 * in a flattened row: the logical field and its output alias.
 */
export interface IdentityColumn {
  field: bigint,
  alias: string,
}
/**
 * One nested relation occurrence: the joined table aliases and the output
 * aliases carrying the parent/child identity fields needed to regroup
 * flattened rows back into entities.
 */
export interface NestingLevel {
  path: Array<string>,
  parentAlias: string,
  childAlias: string,
  parentIdentity: Array<IdentityColumn>,
  childIdentity: Array<IdentityColumn>,
}
/**
 * Describes how result rows map to requested entities and nested fields.
 */
export interface ResultShape {
  kind: ResultShapeKind,
  rows: Array<SelectedField>,
  nesting: Array<NestingLevel>,
}
/**
 * Supported SQL dialects.
 * # Variants
 * 
 * ## `"postgres"`
 * 
 * ## `"mysql"`
 * 
 * ## `"sqlite"`
 * 
 * ## `"mssql"`
 * 
 * ## `"other"`
 */
export type SqlDialect = 'postgres' | 'mysql' | 'sqlite' | 'mssql' | 'other';
/**
 * The complete compiler output handed to an application-owned driver.
 */
export interface SqlArtifact {
  sql: string,
  parameters: Array<Parameter>,
  dialect: SqlDialect,
  selectedFields: Array<SelectedField>,
  resultShape: ResultShape,
}
/**
 * Successful compilation result.
 */
export interface CompilerResult {
  artifact: SqlArtifact,
}
/**
 * =====================================================================
 * Errors: typed, safe to render in an application
 * =====================================================================
 * # Variants
 * 
 * ## `"invalid-request"`
 * 
 * ## `"invalid-model"`
 * 
 * ## `"unknown-field"`
 * 
 * ## `"unknown-relation"`
 * 
 * ## `"invalid-expression"`
 * 
 * ## `"unsupported-feature"`
 * 
 * ## `"unsupported-dialect"`
 */
export type ErrorCode = 'invalid-request' | 'invalid-model' | 'unknown-field' | 'unknown-relation' | 'invalid-expression' | 'unsupported-feature' | 'unsupported-dialect';
/**
 * Expected failures return this typed result. Traps are reserved for defects.
 */
export interface CompilerError {
  code: ErrorCode,
  message: string,
  path?: string,
  source?: SourceLocation,
}
/**
 * Per-request compiler options.
 */
export interface CompileOptions {
  dialect: SqlDialect,
}
/**
 * The full request handed to the compiler.
 */
export interface CompilerRequest {
  model: Model,
  query: Query,
  options: CompileOptions,
}
