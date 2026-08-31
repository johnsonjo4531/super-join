//! WIT <-> core conversions for the super-join compiler boundary.
//!
//! The WIT boundary cannot express recursive types, so the `expression` tree
//! and the query/selection graph are serialized as flat lists of nodes with
//! index-based back-references; these functions rebuild the recursive core
//! structures (`Expression`, `QueryNode`, `Selection`) from those flat lists.
//! Results and errors map back across the boundary without being reinterpreted.

wit_bindgen::generate!({
    world: "superjoin",
    path: ["../../wit"],
    ownership: Owning,
});

use super_join_core::error::{CompilerError, ErrorCode};
use super_join_core::expression::{
    AggregateFunction, BooleanOperator, ComparisonOperator, Expression, IsNullOperator, Parameter,
    Value,
};
use super_join_core::model::{
    Cardinality, EntityMetadata, FieldMetadata, Identifier, Model, RelationMetadata, ScalarType,
};
use super_join_core::semantic::{OrderDirection, OrderBy, QueryNode, Selection};
use super_join_core::sql::{Dialect, Param, SqlArtifact};

use self::exports::super_join::compiler::compiler as wit;
use wit::{
    CompilerError as WitCompilerError, CompilerRequest as WitCompilerRequest,
    CompilerResult as WitCompilerResult, ExprKind as WitExprKind, ExprNode as WitExprNode,
    Model as WitModel, OrderBy as WitOrderBy, QueryNode as WitQueryNode,
    ScalarType as WitScalarType, SelectionKind as WitSelectionKind,
    SelectionNode as WitSelectionNode, SqlArtifact as WitSqlArtifact, SqlDialect as WitSqlDialect,
    SortDirection as WitSortDirection, Value as WitValue,
};

// ---------------------------------------------------------------------------
// WIT value / scalar / identifier conversions
// ---------------------------------------------------------------------------

fn convert_value(v: WitValue) -> Value {
    match v {
        WitValue::Null => Value::Null,
        WitValue::Boolean(b) => Value::Bool(b),
        WitValue::Integer(i) => Value::I64(i),
        WitValue::Float(f) => Value::F64(f),
        WitValue::Text(s) => Value::Str(s),
        WitValue::Binary(b) => Value::Bytes(b),
    }
}

fn convert_value_to_wit(v: Value) -> WitValue {
    match v {
        Value::Null => WitValue::Null,
        Value::Bool(b) => WitValue::Boolean(b),
        Value::I64(i) => WitValue::Integer(i),
        Value::F64(f) => WitValue::Float(f),
        Value::Str(s) => WitValue::Text(s),
        Value::Bytes(b) => WitValue::Binary(b),
    }
}

fn convert_scalar(t: WitScalarType) -> ScalarType {
    match t {
        WitScalarType::Null => ScalarType::Null,
        WitScalarType::Boolean => ScalarType::Bool,
        WitScalarType::Int8 => ScalarType::Int8,
        WitScalarType::Int16 => ScalarType::Int16,
        WitScalarType::Int32 => ScalarType::Int32,
        WitScalarType::Int64 => ScalarType::Int64,
        WitScalarType::Uint8 => ScalarType::Uint8,
        WitScalarType::Uint16 => ScalarType::Uint16,
        WitScalarType::Uint32 => ScalarType::Uint32,
        WitScalarType::Uint64 => ScalarType::Uint64,
        WitScalarType::Float32 => ScalarType::Float32,
        WitScalarType::Float64 => ScalarType::Float64,
        WitScalarType::Decimal => ScalarType::Decimal,
        WitScalarType::Date => ScalarType::Date,
        WitScalarType::Time => ScalarType::Time,
        WitScalarType::TimeTz => ScalarType::TimeTz,
        WitScalarType::Timestamp => ScalarType::Timestamp,
        WitScalarType::TimestampTz => ScalarType::TimestampTz,
        WitScalarType::Uuid => ScalarType::Uuid,
        WitScalarType::Jsonb => ScalarType::Jsonb,
        WitScalarType::Text => ScalarType::Text,
        WitScalarType::Varchar => ScalarType::Varchar,
    }
}

fn convert_scalar_to_wit(t: ScalarType) -> WitScalarType {
    match t {
        ScalarType::Null => WitScalarType::Null,
        ScalarType::Bool => WitScalarType::Boolean,
        ScalarType::Int8 => WitScalarType::Int8,
        ScalarType::Int16 => WitScalarType::Int16,
        ScalarType::Int32 => WitScalarType::Int32,
        ScalarType::Int64 => WitScalarType::Int64,
        ScalarType::Uint8 => WitScalarType::Uint8,
        ScalarType::Uint16 => WitScalarType::Uint16,
        ScalarType::Uint32 => WitScalarType::Uint32,
        ScalarType::Uint64 => WitScalarType::Uint64,
        ScalarType::Float32 => WitScalarType::Float32,
        ScalarType::Float64 => WitScalarType::Float64,
        ScalarType::Decimal => WitScalarType::Decimal,
        ScalarType::Date => WitScalarType::Date,
        ScalarType::Time => WitScalarType::Time,
        ScalarType::TimeTz => WitScalarType::TimeTz,
        ScalarType::Timestamp => WitScalarType::Timestamp,
        ScalarType::TimestampTz => WitScalarType::TimestampTz,
        ScalarType::Uuid => WitScalarType::Uuid,
        ScalarType::Jsonb => WitScalarType::Jsonb,
        ScalarType::Text => WitScalarType::Text,
        ScalarType::Varchar => WitScalarType::Varchar,
    }
}

fn convert_identifier(i: wit::Identifier) -> Identifier {
    Identifier {
        components: i.components,
    }
}

fn convert_field(f: &wit::FieldMetadata) -> Result<FieldMetadata, CompilerError> {
    Ok(FieldMetadata {
        id: f.id,
        identifier: convert_identifier(f.identifier.clone()),
        type_: convert_scalar(f.data_type),
        nullable: f.nullable,
        selectable: f.selectable,
        computed: match &f.computed {
            Some(sub) => Some(convert_computed_field(sub)?),
            None => None,
        },
    })
}

/// Converts a computed-field definition: the SELECT expression plus its FROM
/// entity and optional WHERE clause.
fn convert_computed_field(
    sub: &wit::ComputedField,
) -> Result<super_join_core::model::SelectSubquery, CompilerError> {
    Ok(super_join_core::model::SelectSubquery {
        entity: sub.entity,
        projection: convert_expression(&sub.projection.nodes)?,
        predicate: match &sub.predicate {
            Some(expr) => Some(convert_expression(&expr.nodes)?),
            None => None,
        },
    })
}

fn convert_cardinality(c: &wit::Cardinality) -> Cardinality {
    match c {
        wit::Cardinality::One => Cardinality::One,
        wit::Cardinality::Many => Cardinality::Many,
    }
}

// ---------------------------------------------------------------------------
// Flattened expression -> core Expression
//
// `nodes` is a topologically ordered list where the last element is the root.
// Each node references its operands by index into this same list, so operands
// must always precede the node that uses them.
// ---------------------------------------------------------------------------

fn convert_expression(nodes: &[WitExprNode]) -> Result<Expression, CompilerError> {
    if nodes.is_empty() {
        return Err(invalid_request("a flattened expression must contain at least its root node"));
    }
    let n = nodes.len();
    let mut built: Vec<Option<Expression>> = vec![None; n];
    for i in 0..n {
        let node = &nodes[i];
        let expr = match node.kind {
            WitExprKind::Parameter => Expression::Parameter(Parameter {
                value: convert_value(
                    node.value
                        .clone()
                        .ok_or_else(|| invalid_request("parameter node needs a value"))?,
                ),
                type_: convert_scalar(
                    node.data_type
                        .ok_or_else(|| invalid_request("parameter node needs a data type"))?,
                ),
            }),
            WitExprKind::Column => Expression::Column(
                node.column
                    .ok_or_else(|| invalid_request("column node needs a column id"))?,
            ),
            WitExprKind::ParentColumn => Expression::ParentColumn {
                depth: node
                    .depth
                    .ok_or_else(|| invalid_request("parent-column node needs a depth"))?,
                field: node
                    .column
                    .ok_or_else(|| invalid_request("parent-column node needs a column id"))?,
            },
            WitExprKind::Compare => {
                let left = single_operand(&built, &node.operands, 0, "compare left operand")?;
                let right = single_operand(&built, &node.operands, 1, "compare right operand")?;
                Expression::Compare {
                    operator: convert_operator(
                        node.compare_op
                            .ok_or_else(|| invalid_request("compare node needs an operator"))?,
                    ),
                    left: Box::new(left),
                    right: Box::new(right),
                }
            }
            WitExprKind::BooleanAnd => Expression::Boolean {
                operator: BooleanOperator::And,
                terms: many_operands(&built, &node.operands, "AND term")?,
            },
            WitExprKind::BooleanOr => Expression::Boolean {
                operator: BooleanOperator::Or,
                terms: many_operands(&built, &node.operands, "OR term")?,
            },
            WitExprKind::Not => Expression::Not(Box::new(single_operand(
                &built,
                &node.operands,
                0,
                "NOT operand",
            )?)),
            WitExprKind::IsNull => Expression::IsNull {
                operator: IsNullOperator::IsNull,
                term: Box::new(single_operand(&built, &node.operands, 0, "IS NULL operand")?),
            },
            WitExprKind::IsNotNull => Expression::IsNull {
                operator: IsNullOperator::IsNotNull,
                term: Box::new(single_operand(&built, &node.operands, 0, "IS NOT NULL operand")?),
            },
            WitExprKind::InList => {
                let term = single_operand(&built, &node.operands, 0, "IN list term")?;
                let values = node
                    .values
                    .iter()
                    .map(|p| Parameter {
                        value: convert_value(p.value.clone()),
                        type_: convert_scalar(p.data_type.clone()),
                    })
                    .collect();
                Expression::InList {
                    term: Box::new(term),
                    values,
                }
            }
            WitExprKind::Aggregate => {
                let function = node.agg_func.ok_or_else(|| {
                    invalid_request("aggregate node needs an aggregate function")
                })?;
                Expression::Aggregate {
                    function: convert_aggregate_function(function),
                    term: if node.operands.is_empty() {
                        None
                    } else {
                        Some(Box::new(single_operand(
                            &built,
                            &node.operands,
                            0,
                            "aggregate operand",
                        )?))
                    },
                }
            }
        };
        built[i] = Some(expr);
    }
    built[n - 1]
        .clone()
        .ok_or_else(|| invalid_request("root expression must exist"))
}

fn invalid_request(message: impl Into<String>) -> CompilerError {
    CompilerError::new(ErrorCode::InvalidRequest, message)
}

fn single_operand(
    built: &[Option<Expression>],
    operands: &[u64],
    index: usize,
    what: &str,
) -> Result<Expression, CompilerError> {
    let idx = operands
        .get(index)
        .copied()
        .ok_or_else(|| CompilerError::new(ErrorCode::InvalidExpression, format!("{what} is missing")))?;
    built.get(idx as usize).and_then(Clone::clone).ok_or_else(|| {
        CompilerError::new(
            ErrorCode::InvalidExpression,
            format!("{what} index {idx} out of bounds"),
        )
    })
}

fn many_operands(
    built: &[Option<Expression>],
    operands: &[u64],
    what: &str,
) -> Result<Vec<Expression>, CompilerError> {
    operands
        .iter()
        .map(|&idx| {
            built.get(idx as usize).and_then(Clone::clone).ok_or_else(|| {
                CompilerError::new(
                    ErrorCode::InvalidExpression,
                    format!("{what} index {idx} out of bounds"),
                )
            })
        })
        .collect()
}

fn convert_operator(o: wit::ComparisonOperator) -> ComparisonOperator {
    match o {
        wit::ComparisonOperator::Eq => ComparisonOperator::Eq,
        wit::ComparisonOperator::Ne => ComparisonOperator::Ne,
        wit::ComparisonOperator::Lt => ComparisonOperator::Lt,
        wit::ComparisonOperator::Lte => ComparisonOperator::Lte,
        wit::ComparisonOperator::Gt => ComparisonOperator::Gt,
        wit::ComparisonOperator::Gte => ComparisonOperator::Gte,
    }
}

fn convert_aggregate_function(f: wit::AggregateFunction) -> AggregateFunction {
    match f {
        wit::AggregateFunction::Count => AggregateFunction::Count,
        wit::AggregateFunction::Sum => AggregateFunction::Sum,
        wit::AggregateFunction::Min => AggregateFunction::Min,
        wit::AggregateFunction::Max => AggregateFunction::Max,
        wit::AggregateFunction::Avg => AggregateFunction::Avg,
    }
}

// ---------------------------------------------------------------------------
// Model conversions
// ---------------------------------------------------------------------------

fn convert_relation(r: &wit::RelationMetadata) -> Result<RelationMetadata, CompilerError> {
    Ok(RelationMetadata {
        id: r.id,
        target: r.target,
        cardinality: convert_cardinality(&r.cardinality),
        join: convert_expression(&r.join.nodes)?,
    })
}

fn convert_entity(e: &wit::EntityMetadata) -> Result<EntityMetadata, CompilerError> {
    let mut fields = Vec::with_capacity(e.fields.len());
    for f in &e.fields {
        fields.push(convert_field(f)?);
    }
    let mut relations = Vec::with_capacity(e.relations.len());
    for rel in &e.relations {
        relations.push(convert_relation(rel)?);
    }
    Ok(EntityMetadata {
        id: e.id,
        source: convert_identifier(e.source.clone()),
        fields,
        relations,
        identity: e.identity.clone(),
    })
}

fn convert_model(m: &WitModel) -> Result<Model, CompilerError> {
    let mut entities = Vec::with_capacity(m.entities.len());
    for e in &m.entities {
        entities.push(convert_entity(e)?);
    }
    Ok(Model { entities })
}

// ---------------------------------------------------------------------------
// Query / selection graph (flat) -> core QueryNode / Selection
//
// All query nodes (root + nested) live in `query.queries`; every referenced
// index must be strictly less than the referencing index, so the list is in
// topological order with the root last.
// ---------------------------------------------------------------------------

fn convert_request(r: WitCompilerRequest) -> Result<super_join_core::CompilerRequest, CompilerError> {
    let queries = r.query.queries.clone();
    let n = queries.len();
    let mut built: Vec<Option<QueryNode>> = vec![None; n];
    for i in 0..n {
        built[i] = Some(convert_query_node(&queries[i], &built)?);
    }
    let root = built
        .get(r.query.root as usize)
        .and_then(Clone::clone)
        .ok_or_else(|| invalid_request("query root index is out of bounds"))?;
    Ok(super_join_core::CompilerRequest {
        model: convert_model(&r.model)?,
        root,
        dialect: convert_options(&r.options)?,
    })
}

fn convert_query_node(
    q: &WitQueryNode,
    built: &[Option<QueryNode>],
) -> Result<QueryNode, CompilerError> {
    let mut selection = Vec::with_capacity(q.selection.len());
    for s in &q.selection {
        selection.push(convert_selection_node(s, built)?);
    }
    let predicate = if q.predicate.is_empty() {
        None
    } else {
        Some(convert_expression(&q.predicate)?)
    };
    Ok(QueryNode {
        entity: q.entity,
        selection,
        predicate,
        order_by: q.order_by.iter().map(convert_order_by).collect(),
        limit: q.limit,
        offset: q.offset,
        path: q.path.clone(),
    })
}

fn convert_selection_node(
    s: &WitSelectionNode,
    built: &[Option<QueryNode>],
) -> Result<Selection, CompilerError> {
    match s.kind {
        WitSelectionKind::Field => Ok(Selection::Field {
            field: s.field.ok_or_else(|| invalid_request("field selection needs a field id"))?,
            output_key: s.output_key.clone().unwrap_or_default(),
            path: s.path.clone(),
        }),
        WitSelectionKind::Relation => Ok(Selection::Relation {
            relation: s
                .relation
                .ok_or_else(|| invalid_request("relation selection needs a relation id"))?,
            output_key: s.output_key.clone().unwrap_or_default(),
            query: built
                .get(s.query_ref.ok_or_else(|| {
                    invalid_request("relation selection must reference a nested query")
                })? as usize)
                .and_then(Clone::clone)
                .ok_or_else(|| invalid_request("relation selection references an unknown query"))?,
            path: s.path.clone(),
        }),
    }
}

fn convert_order_direction(d: &WitSortDirection) -> OrderDirection {
    match d {
        WitSortDirection::Asc => OrderDirection::Asc,
        WitSortDirection::Desc => OrderDirection::Desc,
    }
}

fn convert_order_by(o: &WitOrderBy) -> OrderBy {
    OrderBy {
        field: o.field,
        direction: convert_order_direction(&o.direction),
    }
}

fn convert_options(o: &wit::CompileOptions) -> Result<Dialect, CompilerError> {
    convert_dialect(o.dialect)
}

fn convert_dialect(d: WitSqlDialect) -> Result<Dialect, CompilerError> {
    match d {
        WitSqlDialect::Postgres => Ok(Dialect::Postgres),
        WitSqlDialect::Mysql => Ok(Dialect::MySQL),
        WitSqlDialect::Sqlite => Ok(Dialect::Sqlite),
        WitSqlDialect::Mssql => Ok(Dialect::MsSql),
        WitSqlDialect::Other => Err(CompilerError::new(
            ErrorCode::UnsupportedDialect,
            "the 'other' SQL dialect is not supported; choose a concrete dialect",
        )),
    }
}

fn convert_dialect_to_wit(d: Dialect) -> WitSqlDialect {
    match d {
        Dialect::Postgres => WitSqlDialect::Postgres,
        Dialect::MySQL => WitSqlDialect::Mysql,
        Dialect::Sqlite => WitSqlDialect::Sqlite,
        Dialect::MsSql => WitSqlDialect::Mssql,
    }
}

// ---------------------------------------------------------------------------
// core type -> WIT type
// ---------------------------------------------------------------------------

fn convert_param(p: &Param) -> wit::Parameter {
    wit::Parameter {
        value: convert_value_to_wit(p.value.clone()),
        data_type: convert_scalar_to_wit(p.type_),
    }
}

fn convert_artifact(a: SqlArtifact) -> WitSqlArtifact {
    WitSqlArtifact {
        sql: a.sql,
        parameters: a.parameters.iter().map(convert_param).collect(),
        dialect: convert_dialect_to_wit(a.dialect),
        selected_fields: a.selected_fields.iter().map(convert_selected_field).collect(),
        result_shape: wit::ResultShape {
            kind: convert_result_shape(a.result_shape.kind),
            rows: a.result_shape.rows.iter().map(convert_selected_field).collect(),
            nesting: a
                .result_shape
                .nesting
                .iter()
                .map(|n| wit::NestingLevel {
                    path: n.path.clone(),
                    parent_alias: n.parent_alias.clone(),
                    child_alias: n.child_alias.clone(),
                    parent_identity: n
                        .parent_identity
                        .iter()
                        .map(convert_identity_column)
                        .collect(),
                    child_identity: n
                        .child_identity
                        .iter()
                        .map(convert_identity_column)
                        .collect(),
                })
                .collect(),
        },
    }
}

fn convert_selected_field(f: &super_join_core::sql::SqlColumn) -> wit::SelectedField {
    wit::SelectedField {
        alias: f.alias.clone(),
        field: f.field_id,
        path: f.path.clone(),
    }
}

fn convert_identity_column(c: &super_join_core::sql::IdentityColumn) -> wit::IdentityColumn {
    wit::IdentityColumn {
        field: c.field_id,
        alias: c.alias.clone(),
    }
}

fn convert_result_shape(
    kind: super_join_core::sql::ResultShapeKind,
) -> wit::ResultShapeKind {
    match kind {
        super_join_core::sql::ResultShapeKind::Flat => wit::ResultShapeKind::Flat,
        super_join_core::sql::ResultShapeKind::Nested => wit::ResultShapeKind::Nested,
        super_join_core::sql::ResultShapeKind::Json => wit::ResultShapeKind::Json,
    }
}

fn convert_error(e: &CompilerError) -> WitCompilerError {
    WitCompilerError {
        code: convert_code(e.code),
        message: e.message.clone(),
        path: e.path.clone(),
        source: e.source.as_ref().map(convert_source),
    }
}

fn convert_code(c: ErrorCode) -> wit::ErrorCode {
    match c {
        ErrorCode::InvalidRequest => wit::ErrorCode::InvalidRequest,
        ErrorCode::InvalidModel => wit::ErrorCode::InvalidModel,
        ErrorCode::UnknownField => wit::ErrorCode::UnknownField,
        ErrorCode::UnknownRelation => wit::ErrorCode::UnknownRelation,
        ErrorCode::InvalidExpression => wit::ErrorCode::InvalidExpression,
        ErrorCode::UnsupportedFeature => wit::ErrorCode::UnsupportedFeature,
        ErrorCode::UnsupportedDialect => wit::ErrorCode::UnsupportedDialect,
    }
}

fn convert_source(loc: &super_join_core::error::SourceLocation) -> wit::SourceLocation {
    wit::SourceLocation {
        path: loc.path.clone(),
        line: loc.line,
        column: loc.column,
        length: loc.length,
    }
}

// ---------------------------------------------------------------------------
// Component export
// ---------------------------------------------------------------------------

/// The component implementing the compiler interface.
pub struct Component;

impl wit::Guest for Component {
    fn compile(request: WitCompilerRequest) -> Result<WitCompilerResult, WitCompilerError> {
        let core_request = match convert_request(request) {
            Ok(core_request) => core_request,
            Err(e) => return Err(convert_error(&e)),
        };
        let compiler = super_join_core::compiler::Compiler::new(core_request.dialect);
        match compiler.compile(&core_request) {
            Ok(result) => {
                let artifact = convert_artifact(result.artifact);
                Ok(WitCompilerResult { artifact })
            }
            Err(e) => Err(convert_error(&e)),
        }
    }
}

export!(Component);
