//! Builds a flat relational plan from a `SemanticQuery`.
//!
//! Every entity occurrence in the request becomes a table alias in one flat
//! joined row (the v0 result strategy). Logical expressions are resolved here,
//! against the validated model, into physical column references; anything that
//! cannot be preserved by the flat strategy is rejected with an explicit
//! `unsupported-feature` error rather than silently dropped.

use crate::error::{CompilerError, ErrorCode};
use crate::expression::Expression;
use crate::model::{Model, RelationMetadata};
use crate::semantic::{OrderDirection, ResolvedQueryNode, ResolvedSelection, SemanticQuery};
use super::entity_source;
use crate::relational::{
    ColumnRef, JoinClause, JoinType, OrderBySql, RelColumn, RelExpr, RelationalPlan, TableRef,
};

/// One entity occurrence in the current planning scope. The last entry is the
/// "current" entity that unqualified `Column` references resolve against;
/// `ParentColumn { depth }` walks backwards from it (depth 1 == direct parent).
#[derive(Clone)]
pub(crate) struct ScopeEntry {
    entity_id: u64,
    alias: String,
}

/// Builds the flat relational plan for a request.
pub fn build_plan(semantic: &SemanticQuery, model: &Model) -> Result<RelationalPlan, CompilerError> {
    let root = &semantic.root;
    let source = entity_source(model, root.entity_id)?;
    let mut plan = RelationalPlan {
        from: TableRef {
            alias: root.alias.clone(),
            table: source.components.clone(),
        },
        joins: Vec::new(),
        filters: Vec::new(),
        columns: Vec::new(),
        order_by: Vec::new(),
        limit: root.limit,
        offset: root.offset,
    };

    let scope = vec![ScopeEntry {
        entity_id: root.entity_id,
        alias: root.alias.clone(),
    }];
    plan_node(root, model, &scope, false, &mut plan)?;

    if plan.columns.is_empty() {
        return Err(CompilerError::new(
            ErrorCode::InvalidRequest,
            "no columns selected",
        )
        .with_path(format!("entity:{}", source.dotted())));
    }

    Ok(plan)
}

/// Lowers one query node into the shared flat plan. `scope` ends with this
/// node's entity occurrence; nested relations append joins after their parent.
fn plan_node(
    node: &ResolvedQueryNode,
    model: &Model,
    scope: &[ScopeEntry],
    nested: bool,
    plan: &mut RelationalPlan,
) -> Result<(), CompilerError> {
    let current = scope.last().expect("scope always has a current entity");

    if nested && (node.limit.is_some() || node.offset.is_some()) {
        return Err(CompilerError::new(
            ErrorCode::UnsupportedFeature,
            "limit/offset on nested relations cannot be preserved by the flat join strategy",
        )
        .with_path(path_label(&node.path)));
    }

    for sel in &node.selection {
        match sel {
            ResolvedSelection::Field {
                field_id,
                alias,
                path,
                ..
            } => {
                let column = lookup_column(model, current.entity_id, current.alias.clone(), *field_id)?;
                plan.columns.push(RelColumn {
                    alias: alias.clone(),
                    field_id: *field_id,
                    path: path.clone(),
                    source: column,
                });
            }
            ResolvedSelection::Relation {
                relation_id,
                entity_id,
                query,
                path,
                ..
            } => {
                let rel = relation_by_id(model, *relation_id)?;
                let child_alias = alias_for_occurrence(model, &query.alias, path);
                if alias_taken(plan, &child_alias) {
                    return Err(CompilerError::new(
                        ErrorCode::InvalidRequest,
                        format!("duplicate table alias '{}' in plan", child_alias),
                    )
                    .with_path(path_label(path)));
                }

                // The join condition resolves with the target entity as the
                // current scope and its parent chain ahead of it.
                let mut join_scope: Vec<ScopeEntry> = scope.to_vec();
                join_scope.push(ScopeEntry {
                    entity_id: *entity_id,
                    alias: child_alias.clone(),
                });
                let on = resolve_expr(&rel.join, &join_scope, model)?;

                // A nested predicate cannot live in WHERE without changing the
                // outer join's null semantics, so it is folded into the join.
                let on = match &query.predicate {
                    Some(pred) => {
                        let resolved = resolve_expr(pred, &join_scope, model)?;
                        crate::relational::RelExpr::Boolean {
                            operator: crate::expression::BooleanOperator::And,
                            terms: vec![on, resolved],
                        }
                    }
                    None => on,
                };

                plan.joins.push(JoinClause {
                    join_type: JoinType::LeftOuter,
                    table: TableRef {
                        alias: child_alias.clone(),
                        table: entity_source(model, *entity_id)?.components.clone(),
                    },
                    on,
                });

                if !query.order_by.is_empty() {
                    return Err(CompilerError::new(
                        ErrorCode::UnsupportedFeature,
                        "ordering inside a nested relation is not supported by the flat join strategy",
                    )
                    .with_path(path_label(&query.path)));
                }

                let child_scope = join_scope;
                plan_node(query, model, &child_scope, true, plan)?;
            }
        }
    }

    // A nested node's predicate was already folded into its join condition by
    // the parent; only the root contributes WHERE-level filters.
    if !nested {
        if let Some(pred) = &node.predicate {
            let resolved = resolve_expr(pred, scope, model)?;
            plan.filters.push(resolved);
        }
    }

    for ob in &node.order_by {
        let direction = match ob.direction {
            OrderDirection::Asc => OrderBySql::Asc,
            OrderDirection::Desc => OrderBySql::Desc,
        };
        let column = lookup_column(model, current.entity_id, current.alias.clone(), ob.field)?;
        plan.order_by.push((column, direction));
    }

    Ok(())
}

/// Resolves a logical expression against the model into a relational
/// expression with physical column references.
pub(crate) fn resolve_expr(
    expr: &Expression,
    scope: &[ScopeEntry],
    model: &Model,
) -> Result<RelExpr, CompilerError> {
    match expr {
        Expression::Parameter(p) => Ok(RelExpr::Param(p.clone())),
        Expression::Column(field_id) => {
            let current = scope.last().expect("scope always has a current entity");
            let column = lookup_column(model, current.entity_id, current.alias.clone(), *field_id)?;
            Ok(RelExpr::Column(column))
        }
        Expression::ParentColumn { depth, field } => {
            if *depth == 0 || *depth as usize >= scope.len() {
                return Err(CompilerError::new(
                    ErrorCode::InvalidExpression,
                    format!(
                        "parent column depth {} is outside the correlation scope ({} levels)",
                        depth,
                        scope.len() - 1
                    ),
                ));
            }
            let ancestor = &scope[scope.len() - 1 - *depth as usize];
            let column = lookup_column(model, ancestor.entity_id, ancestor.alias.clone(), *field)?;
            Ok(RelExpr::Column(column))
        }
        Expression::Compare {
            operator,
            left,
            right,
        } => Ok(RelExpr::Compare {
            operator: *operator,
            left: Box::new(resolve_expr(left, scope, model)?),
            right: Box::new(resolve_expr(right, scope, model)?),
        }),
        Expression::Boolean { operator, terms } => {
            let mut resolved = Vec::with_capacity(terms.len());
            for term in terms {
                resolved.push(resolve_expr(term, scope, model)?);
            }
            Ok(RelExpr::Boolean {
                operator: *operator,
                terms: resolved,
            })
        }
        Expression::Not(inner) => Ok(RelExpr::Not(Box::new(resolve_expr(inner, scope, model)?))),
        Expression::IsNull { operator, term } => Ok(RelExpr::IsNull {
            operator: *operator,
            term: Box::new(resolve_expr(term, scope, model)?),
        }),
        Expression::InList { term, values } => Ok(RelExpr::InList {
            term: Box::new(resolve_expr(term, scope, model)?),
            values: values.clone(),
        }),
    }
}

fn lookup_column(
    model: &Model,
    entity_id: u64,
    table_alias: String,
    field_id: u64,
) -> Result<ColumnRef, CompilerError> {
    let entity = model
        .entities
        .iter()
        .find(|e| e.id == entity_id)
        .ok_or_else(|| {
            CompilerError::new(
                ErrorCode::InvalidModel,
                format!("entity {} missing from model", entity_id),
            )
        })?;
    let field = entity
        .fields
        .iter()
        .find(|f| f.id == field_id)
        .ok_or_else(|| {
            CompilerError::new(
                ErrorCode::UnknownField,
                format!("unknown field id {} on entity {}", field_id, entity.source.dotted()),
            )
            .with_path(format!("entity:{}", entity.source.dotted()))
        })?;
    Ok(ColumnRef {
        table_alias,
        column: field.identifier.clone(),
    })
}

/// Looks up a relation by id across all entities.
fn relation_by_id<'a>(model: &'a Model, id: u64) -> Result<&'a RelationMetadata, CompilerError> {
    for entity in &model.entities {
        for rel in &entity.relations {
            if rel.id == id {
                return Ok(rel);
            }
        }
    }
    Err(CompilerError::new(
        ErrorCode::UnknownRelation,
        format!("relation {} not found", id),
    ))
}

fn alias_for_occurrence(model: &Model, proposed: &str, path: &[String]) -> String {
    if !proposed.is_empty() {
        return proposed.to_string();
    }
    match path.last() {
        Some(last) if !last.is_empty() => last.clone(),
        _ => format!("entity{}", model.entities.len()),
    }
}

fn alias_taken(plan: &RelationalPlan, alias: &str) -> bool {
    plan.from.alias == alias || plan.joins.iter().any(|j| j.table.alias == alias)
}

fn path_label(path: &[String]) -> String {
    if path.is_empty() {
        "root".to_string()
    } else {
        path.join(".")
    }
}
