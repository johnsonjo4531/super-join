//! Builds a flat relational plan from a `SemanticQuery`.
//!
//! Every entity occurrence in the request becomes a table alias in one flat
//! joined row (the v0 result strategy). Logical expressions are resolved here,
//! against the validated model, into physical column references; anything that
//! cannot be preserved by the flat strategy is rejected with an explicit
//! `unsupported-feature` error rather than silently dropped.

use crate::error::{CompilerError, ErrorCode};
use crate::expression::Expression;
use crate::model::{FieldMetadata, Identifier, Model, RelationMetadata};
use crate::semantic::{OrderDirection, ResolvedQueryNode, ResolvedSelection, SemanticQuery};
use super::entity_source;
use crate::relational::{
    ColumnRef, JoinClause, JoinType, OrderBySql, RelColumn, RelExpr, RelationalPlan, ScalarSubquery,
    SelectSource, TableRef,
};
use crate::sql::{IdentityColumn, NestingLevel};

/// One entity occurrence in the current planning scope. The last entry is the
/// "current" entity that unqualified `Column` references resolve against;
/// `ParentColumn { depth }` walks backwards from it (depth 1 == direct parent).
#[derive(Clone)]
pub(crate) struct ScopeEntry {
    entity_id: u64,
    alias: String,
}

/// An order-by entry collected during planning, resolved after the full tree is
/// planned so parent ordering always precedes nested ordering (flat rows stay
/// grouped per parent while children sort within each group).
struct OrderingRequest {
    depth: usize,
    entity_id: u64,
    alias: String,
    field: u64,
    direction: OrderDirection,
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
        nesting: Vec::new(),
    };

    let scope = vec![ScopeEntry {
        entity_id: root.entity_id,
        alias: root.alias.clone(),
    }];
    let mut pending = Vec::new();
    let mut orderings: Vec<OrderingRequest> = Vec::new();
    plan_node(root, model, &scope, false, 0, &mut plan, &mut pending, &mut orderings)?;

    // Resolve collected ordering in depth order: the root's ordering first so
    // parent rows stay contiguous, then each nesting level.
    orderings.sort_by_key(|o| o.depth);
    for ob in orderings {
        let direction = match ob.direction {
            OrderDirection::Asc => OrderBySql::Asc,
            OrderDirection::Desc => OrderBySql::Desc,
        };
        let column = lookup_column(model, ob.entity_id, ob.alias.clone(), ob.field)?;
        plan.order_by.push((column, direction));
    }

    if plan.columns.is_empty() {
        return Err(CompilerError::new(
            ErrorCode::InvalidRequest,
            "no columns selected",
        )
        .with_path(format!("entity:{}", source.dotted())));
    }

    // Two selections may share an output name (e.g. `users.id` and `posts.id`
    // both aliased `id`); rename later duplicates deterministically so the
    // flattened row stays unambiguous.
    disambiguate_column_aliases(&mut plan);

    // Identity pass: now that every caller selection is planned, resolve each
    // nesting level's parent/child identity columns (reusing any alias the
    // caller already chose, adding one only when a field was not selected).
    for level in pending {
        let parent_identity = ensure_identity_columns(
            model,
            level.parent_entity,
            &level.parent_alias,
            &level.parent_path,
            &mut plan,
        )?;
        let child_identity = ensure_identity_columns(
            model,
            level.child_entity,
            &level.child_alias,
            &level.path,
            &mut plan,
        )?;
        plan.nesting.push(NestingLevel {
            path: level.path,
            parent_alias: level.parent_alias,
            child_alias: level.child_alias,
            parent_identity,
            child_identity,
        });
    }

    Ok(plan)
}

/// A nested relation occurrence whose identity columns are resolved after the
/// full selection pass so caller-chosen aliases are always preferred.
struct PendingLevel {
    path: Vec<String>,
    parent_entity: u64,
    parent_alias: String,
    parent_path: Vec<String>,
    child_entity: u64,
    child_alias: String,
}

/// Lowers one query node into the shared flat plan. `scope` ends with this
/// node's entity occurrence; nested relations append joins after their parent.
#[allow(clippy::too_many_arguments)]
fn plan_node(
    node: &ResolvedQueryNode,
    model: &Model,
    scope: &[ScopeEntry],
    nested: bool,
    depth: usize,
    plan: &mut RelationalPlan,
    pending: &mut Vec<PendingLevel>,
    orderings: &mut Vec<OrderingRequest>,
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
                let source = if let Some(field) = lookup_field_meta(model, current.entity_id, *field_id)?
                    .computed
                    .clone()
                {
                    // A computed field projects a scalar sub-select instead of
                    // a physical column. The subquery's entity is the "current"
                    // scope; the owning chain correlates ahead of it.
                    let inner_alias = subquery_alias(model, field.entity, plan)?;
                    let mut sub_scope: Vec<ScopeEntry> = scope.to_vec();
                    sub_scope.push(ScopeEntry {
                        entity_id: field.entity,
                        alias: inner_alias.clone(),
                    });
                    SelectSource::Scalar(ScalarSubquery {
                        alias: inner_alias,
                        table: entity_source(model, field.entity)?.components.clone(),
                        projection: Box::new(resolve_expr(&field.projection, &sub_scope, model)?),
                        predicate: match &field.predicate {
                            Some(pred) => Some(Box::new(resolve_expr(pred, &sub_scope, model)?)),
                            None => None,
                        },
                    })
                } else {
                    SelectSource::Column(lookup_column(
                        model,
                        current.entity_id,
                        current.alias.clone(),
                        *field_id,
                    )?)
                };
                plan.columns.push(RelColumn {
                    alias: alias.clone(),
                    field_id: *field_id,
                    path: path.clone(),
                    source,
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
                let child_alias = unique_table_alias(plan, alias_for_occurrence(model, &query.alias, path));

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

                // Nested ordering is preserved by appending the child's
                // order-by entries (qualified by the child alias) after the
                // parent's; flattened rows regroup by identity regardless.

                // Nested rows must be regroupable into entities: remember the
                // occurrence pair; identity columns are resolved once every
                // caller selection is planned so any existing alias is reused.
                pending.push(PendingLevel {
                    path: query.path.clone(),
                    parent_entity: current.entity_id,
                    parent_alias: current.alias.clone(),
                    parent_path: node.path.clone(),
                    child_entity: *entity_id,
                    child_alias: child_alias.clone(),
                });

                let child_scope = join_scope;
                plan_node(query, model, &child_scope, true, depth + 1, plan, pending, orderings)?;
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
        orderings.push(OrderingRequest {
            depth,
            entity_id: current.entity_id,
            alias: current.alias.clone(),
            field: ob.field,
            direction: ob.direction.clone(),
        });
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
        Expression::Aggregate { function, term } => Ok(RelExpr::Aggregate {
            function: *function,
            term: match term {
                Some(inner) => Some(Box::new(resolve_expr(inner, scope, model)?)),
                None => None,
            },
        }),
    }
}

/// Looks up a field's metadata (without the selectability rule).
fn lookup_field_meta<'a>(
    model: &'a Model,
    entity_id: u64,
    field_id: u64,
) -> Result<&'a FieldMetadata, CompilerError> {
    let entity = model.entities.iter().find(|e| e.id == entity_id).ok_or_else(|| {
        CompilerError::new(
            ErrorCode::InvalidModel,
            format!("entity {} missing from model", entity_id),
        )
    })?;
    entity
        .fields
        .iter()
        .find(|f| f.id == field_id)
        .ok_or_else(|| {
            CompilerError::new(
                ErrorCode::UnknownField,
                format!("unknown field id {} on entity {}", field_id, entity.source.dotted()),
            )
            .with_path(format!("entity:{}", entity.source.dotted()))
        })
}

/// A deterministic FROM alias for a computed field's sub-select. Namespaced so
/// it can never collide with a caller-chosen table alias in the outer query.
fn subquery_alias(model: &Model, entity_id: u64, plan: &RelationalPlan) -> Result<String, CompilerError> {
    let source = entity_source(model, entity_id)?;
    let last = source.components.last().cloned().unwrap_or_default();
    let mut candidate = format!("__sj_sub_{}", last);
    let mut n = 1;
    while alias_taken(plan, &candidate) {
        n += 1;
        candidate = format!("__sj_sub_{}_{}", last, n);
    }
    Ok(candidate)
}

/// A table alias for a nested occurrence that never collides with an existing
/// one: same-name occurrences get deterministic numeric suffixes.
fn unique_table_alias(plan: &RelationalPlan, proposed: String) -> String {
    if !alias_taken(plan, &proposed) {
        return proposed;
    }
    let mut n = 1;
    loop {
        let candidate = format!("{}_{}", proposed, n);
        if !alias_taken(plan, &candidate) {
            return candidate;
        }
        n += 1;
    }
}

/// Renames duplicate output aliases so two fields named the same thing (e.g.
/// `users.id` and `posts.id` both aliased `id`) never collide in the row. The
/// first occurrence keeps its alias; later ones get a path-qualified suffix.
fn disambiguate_column_aliases(plan: &mut RelationalPlan) {
    let mut seen: Vec<String> = Vec::with_capacity(plan.columns.len());
    let mut renames: Vec<usize> = Vec::new();
    for (i, column) in plan.columns.iter().enumerate() {
        if !seen.contains(&column.alias) {
            seen.push(column.alias.clone());
            continue;
        }
        renames.push(i);
    }
    for i in renames {
        let base = plan.columns[i].alias.clone();
        let path_tag = plan.columns[i]
            .path
            .iter()
            .filter(|p| !p.is_empty())
            .cloned()
            .collect::<Vec<_>>()
            .join("_");
        let mut candidate = if path_tag.is_empty() || path_tag == base {
            format!("{}_{}", base, plan.columns[i].field_id)
        } else {
            path_tag.clone()
        };
        let mut n = 1;
        while seen.contains(&candidate) {
            candidate = format!("{}_{}", path_tag, n);
            n += 1;
        }
        seen.push(candidate.clone());
        plan.columns[i].alias = candidate;
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

/// Ensures every identity field of one entity occurrence is present as a
/// selected column (adding it when the caller did not select it) and returns
/// the identity columns exactly as they appear in the flattened row.
fn ensure_identity_columns(
    model: &Model,
    entity_id: u64,
    table_alias: &str,
    path: &[String],
    plan: &mut RelationalPlan,
) -> Result<Vec<IdentityColumn>, CompilerError> {
    let entity = model.entities.iter().find(|e| e.id == entity_id).ok_or_else(|| {
        CompilerError::new(
            ErrorCode::InvalidModel,
            format!("entity {} missing from model", entity_id),
        )
    })?;
    let mut identity = Vec::with_capacity(entity.identity.len());
    for &field_id in &entity.identity {
        if let Some(existing) = plan.columns.iter().find(|c| {
            c.field_id == field_id
                && matches!(&c.source, SelectSource::Column(col) if col.table_alias == table_alias)
        }) {
            identity.push(IdentityColumn {
                field_id,
                alias: existing.alias.clone(),
            });
            continue;
        }
        let source = lookup_column(model, entity_id, table_alias.to_string(), field_id)?;
        let alias = unique_identity_alias(table_alias, &source.column, plan);
        // The output column belongs to this occurrence's field: append the
        // physical field name so consumers can key it like any other column.
        let mut column_path = path.to_vec();
        if let Some(last) = source.column.components.last() {
            column_path.push(last.clone());
        }
        plan.columns.push(RelColumn {
            alias: alias.clone(),
            field_id,
            path: column_path,
            source: SelectSource::Column(source),
        });
        identity.push(IdentityColumn { field_id, alias });
    }
    Ok(identity)
}

/// A deterministic, collision-free output alias for an auto-selected identity
/// column. Auto aliases are namespaced so they never shadow a caller alias.
fn unique_identity_alias(table_alias: &str, column: &Identifier, plan: &RelationalPlan) -> String {
    let last = column.components.last().cloned().unwrap_or_default();
    let mut candidate = format!("__sj_identity_{table_alias}_{last}");
    let mut n = 1;
    while alias_taken(plan, &candidate) || plan.columns.iter().any(|c| c.alias == candidate) {
        n += 1;
        candidate = format!("__sj_identity_{table_alias}_{last}_{n}");
    }
    candidate
}

fn path_label(path: &[String]) -> String {
    if path.is_empty() {
        "root".to_string()
    } else {
        path.join(".")
    }
}
