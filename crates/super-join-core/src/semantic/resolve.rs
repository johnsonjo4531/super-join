//! Semantic resolution and validation.
//!
//! Resolution walks the request tree, resolving every entity/field/relation id
//! against the model, validates that expressions only reference columns in
//! scope, and produces a `SemanticQuery`. Errors carry a stable code and a
//! path to the offending location.

use crate::error::{CompilerError, ErrorCode};
use crate::expression::Expression;
use crate::model::{EntityMetadata, FieldMetadata, Model, RelationMetadata};
use super::{QueryNode, ResolvedQueryNode, ResolvedSelection, SemanticQuery, Selection};

pub struct Validator<'a> {
    entities: &'a [EntityMetadata],
    fields_by_entity: Vec<(u64, Vec<FieldMetadata>)>,
}

impl<'a> Validator<'a> {
    pub fn new(model: &'a Model) -> Self {
        let fields_by_entity: Vec<(u64, Vec<FieldMetadata>)> = model
            .entities
            .iter()
            .map(|e| (e.id, e.fields.clone()))
            .collect();
        Validator {
            entities: &model.entities,
            fields_by_entity,
        }
    }

    /// Validates that entity, field, and relation identifiers are well-formed
    /// and self-consistent. Must run once per request before lowering.
    pub fn validate_model(&self) -> Result<(), CompilerError> {
        let mut seen_entities = Vec::new();
        for entity in self.entities {
            if seen_entities.contains(&entity.id) {
                return Err(CompilerError::new(
                    ErrorCode::InvalidModel,
                    format!("duplicate entity id {}", entity.id),
                )
                .with_path(format!("entity:{}", entity.source.dotted())));
            }
            seen_entities.push(entity.id);

            let mut seen_fields = Vec::new();
            for field in &entity.fields {
                if seen_fields.contains(&field.id) {
                    return Err(CompilerError::new(
                        ErrorCode::InvalidModel,
                        format!(
                            "duplicate field id {} on entity {}",
                            field.id,
                            entity.source.dotted()
                        ),
                    ));
                }
                seen_fields.push(field.id);
            }

            // Computed fields must reference a real model entity and may not be
            // identity fields (identity columns regroup flattened rows by value).
            for field in &entity.fields {
                if let Some(sub) = &field.computed {
                    if !self.entities.iter().any(|e| e.id == sub.entity) {
                        return Err(CompilerError::new(
                            ErrorCode::InvalidModel,
                            format!(
                                "computed field {} on entity {} selects from unknown entity {}",
                                field.identifier.dotted(),
                                entity.source.dotted(),
                                sub.entity
                            ),
                        ));
                    }
                    if entity.identity.contains(&field.id) {
                        return Err(CompilerError::new(
                            ErrorCode::InvalidModel,
                            format!(
                                "computed field {} on entity {} cannot be an identity field",
                                field.identifier.dotted(),
                                entity.source.dotted()
                            ),
                        ));
                    }
                }
            }

            let mut seen_relations = Vec::new();
            for rel in &entity.relations {
                if seen_relations.contains(&rel.id) {
                    return Err(CompilerError::new(
                        ErrorCode::InvalidModel,
                        format!(
                            "duplicate relation id {} on entity {}",
                            rel.id,
                            entity.source.dotted()
                        ),
                    ));
                }
                seen_relations.push(rel.id);
                if !self.entities.iter().any(|e| e.id == rel.target) {
                    return Err(CompilerError::new(
                        ErrorCode::InvalidModel,
                        format!(
                            "relation {} targets unknown entity {}",
                            rel.id, rel.target
                        ),
                    ));
                }
            }

            let mut seen_identity = Vec::new();
            for field_id in &entity.identity {
                if seen_identity.contains(field_id) {
                    return Err(CompilerError::new(
                        ErrorCode::InvalidModel,
                        format!(
                            "duplicate identity field id {} on entity {}",
                            field_id,
                            entity.source.dotted()
                        ),
                    ));
                }
                seen_identity.push(*field_id);
                if !entity.fields.iter().any(|f| f.id == *field_id) {
                    return Err(CompilerError::new(
                        ErrorCode::InvalidModel,
                        format!(
                            "identity field id {} does not exist on entity {}",
                            field_id,
                            entity.source.dotted()
                        ),
                    ));
                }
            }
        }
        Ok(())
    }

    pub fn resolve(&self, root: &QueryNode, model: &Model) -> Result<SemanticQuery, CompilerError> {
        self.validate_model()?;
        let root_node = self.resolve_node(root, model, &[])?;
        if root_node.selection.is_empty() {
            return Err(CompilerError::new(
                ErrorCode::InvalidRequest,
                "root query node must contain at least one selection",
            )
            .with_path(format!("root:{}", root.path.join("."))));
        }
        Ok(SemanticQuery { root: root_node })
    }

    fn resolve_node(
        &self,
        node: &QueryNode,
        model: &'a Model,
        ancestor_ids: &[u64],
    ) -> Result<ResolvedQueryNode, CompilerError> {
        let entity = self.lookup_entity(node.entity, &node.path)?;
        let alias = occurrence_alias(node, entity);
        let scope = build_scope(ancestor_ids, entity.id);

        let mut selection = Vec::with_capacity(node.selection.len());
        for sel in &node.selection {
            match sel {
                Selection::Field {
                    field,
                    output_key,
                    path,
                } => {
                    let resolved = self.lookup_field(entity, *field, path)?;
                    if let Some(sub) = &resolved.computed {
                        // Computed select expressions resolve with the
                        // subquery's entity as "current" and the owning chain
                        // correlated ahead of it.
                        let mut sub_scope = scope.clone();
                        sub_scope.push(sub.entity);
                        self.validate_expr_scope(&sub.projection, &sub_scope)
                            .map_err(|e| e.with_path(path_to_string(path)))?;
                        if let Some(pred) = &sub.predicate {
                            self.validate_expr_scope(pred, &sub_scope)
                                .map_err(|e| e.with_path(path_to_string(path)))?;
                        }
                    }
                    let alias = if output_key.is_empty() {
                        format!("{}__{}", entity.source.dotted(), resolved.identifier.dotted())
                    } else {
                        output_key.clone()
                    };
                    selection.push(ResolvedSelection::Field {
                        entity_id: entity.id,
                        field_id: *field,
                        alias,
                        path: path.clone(),
                    });
                }
                Selection::Relation {
                    relation,
                    output_key,
                    query,
                    path,
                } => {
                    let rel = self.lookup_relation(entity, *relation, path)?;
                    // The flat join strategy regroups nested rows by identity,
                    // so both endpoints must declare an identity.
                    if entity.identity.is_empty() {
                        return Err(CompilerError::new(
                            ErrorCode::InvalidModel,
                            format!(
                                "entity {} must declare identity fields to nest a relation",
                                entity.source.dotted()
                            ),
                        )
                        .with_path(path_to_string(path)));
                    }
                    let target = self.lookup_entity(rel.target, path)?;
                    if target.identity.is_empty() {
                        return Err(CompilerError::new(
                            ErrorCode::InvalidModel,
                            format!(
                                "relation {} targets entity {}, which must declare identity fields to be nested",
                                rel.id,
                                target.source.dotted()
                            ),
                        )
                        .with_path(path_to_string(path)));
                    }
                    let child = self.resolve_node(query, model, &scope)?;
                    // The relation join condition references the parent entity
                    // via ParentColumn and the target via Column; both must be
                    // in scope.
                    let mut join_scope = scope.clone();
                    join_scope.push(rel.target);
                    self.validate_expr_scope(&rel.join, &join_scope)
                        .map_err(|e| e.with_path(path_to_string(path)))?;
                    let alias = if output_key.is_empty() {
                        entity.source.dotted()
                    } else {
                        output_key.clone()
                    };
                    selection.push(ResolvedSelection::Relation {
                        relation_id: rel.id,
                        entity_id: rel.target,
                        alias,
                        path: path.clone(),
                        query: child,
                    });
                }
            }
        }

        if let Some(pred) = &node.predicate {
            self.validate_expr_scope(pred, &scope)
                .map_err(|e| e.with_path(path_to_string(&node.path)))?;
        }

        Ok(ResolvedQueryNode {
            entity_id: entity.id,
            alias,
            selection,
            predicate: node.predicate.clone(),
            order_by: node.order_by.clone(),
            limit: node.limit,
            offset: node.offset,
            path: node.path.clone(),
        })
    }

    fn lookup_entity(
        &self,
        id: u64,
        path: &[String],
    ) -> Result<&'a EntityMetadata, CompilerError> {
        for entity in self.entities {
            if entity.id == id {
                return Ok(entity);
            }
        }
        Err(CompilerError::new(
            ErrorCode::UnknownField,
            format!("unknown entity id {}", id),
        )
        .with_path(path_to_string(path)))
    }

    fn lookup_field<'b>(
        &'b self,
        entity: &'b EntityMetadata,
        field_id: u64,
        _path: &[String],
    ) -> Result<&'b FieldMetadata, CompilerError> {
        if let Some((_eid, fields)) = self.fields_by_entity.iter().find(|(eid, _)| *eid == entity.id) {
            for field in fields {
                if field.id == field_id {
                    if !field.selectable {
                        return Err(CompilerError::new(
                            ErrorCode::UnknownField,
                            format!(
                                "field {} of entity {} is not selectable",
                                field.identifier.dotted(),
                                entity.source.dotted()
                            ),
                        )
                        .with_path(format!("{}:{}", entity.source.dotted(), field.identifier.dotted())));
                    }
                    return Ok(field);
                }
            }
        }
        Err(CompilerError::new(
            ErrorCode::UnknownField,
            format!("unknown field id {} on entity {}", field_id, entity.source.dotted()),
        )
        .with_path(format!("{}:{}", entity.source.dotted(), field_id)))
    }

    fn lookup_relation(
        &self,
        entity: &'a EntityMetadata,
        relation_id: u64,
        path: &[String],
    ) -> Result<&'a RelationMetadata, CompilerError> {
        for rel in &entity.relations {
            if rel.id == relation_id {
                return Ok(rel);
            }
        }
        Err(CompilerError::new(
            ErrorCode::UnknownRelation,
            format!(
                "unknown relation id {} on entity {}",
                relation_id,
                entity.source.dotted()
            ),
        )
        .with_path(path_to_string(path)))
    }

    /// Validates an expression against its correlation scope. `scope` lists the
    /// entity ids in scope with the current (unqualified) entity last;
    /// `ParentColumn { depth }` counts backwards from it starting at 1.
    fn validate_expr_scope(&self, expr: &Expression, scope: &[u64]) -> Result<(), CompilerError> {
        match expr {
            Expression::Parameter(_) => Ok(()),
            Expression::Column(field_id) => {
                let current = *scope.last().expect("scope always has a current entity");
                self.check_field_on_entity(current, *field_id)?;
                Ok(())
            }
            Expression::ParentColumn { depth, field } => {
                if *depth == 0 || *depth as usize >= scope.len() {
                    return Err(CompilerError::new(
                        ErrorCode::InvalidExpression,
                        format!(
                            "parent column references invalid depth {} (scope depth {})",
                            depth,
                            scope.len() - 1
                        ),
                    ));
                }
                let ancestor = scope[scope.len() - 1 - *depth as usize];
                self.check_field_on_entity(ancestor, *field)?;
                Ok(())
            }
            Expression::Compare {
                operator: _,
                left,
                right,
            } => {
                reject_null_comparison(left)?;
                reject_null_comparison(right)?;
                self.validate_expr_scope(left, scope)?;
                self.validate_expr_scope(right, scope)
            }
            Expression::Boolean { terms, .. } => {
                for term in terms {
                    self.validate_expr_scope(term, scope)?;
                }
                Ok(())
            }
            Expression::Not(inner) => self.validate_expr_scope(inner, scope),
            Expression::IsNull { term, .. } => self.validate_expr_scope(term, scope),
            Expression::InList { term, values } => {
                for v in values {
                    if matches!(v.value, crate::expression::Value::Null) {
                        return Err(CompilerError::new(
                            ErrorCode::InvalidExpression,
                            "IN list must not contain null values",
                        ));
                    }
                }
                self.validate_expr_scope(term, scope)
            }
            Expression::Aggregate { term, .. } => match term {
                Some(inner) => self.validate_expr_scope(inner, scope),
                None => Ok(()),
            },
        }
    }

    fn check_field_on_entity(&self, entity_id: u64, field_id: u64) -> Result<(), CompilerError> {
        let fields = self
            .fields_by_entity
            .iter()
            .find(|(eid, _)| *eid == entity_id)
            .map(|(_, fields)| fields)
            .ok_or_else(|| {
                CompilerError::new(
                    ErrorCode::InvalidModel,
                    format!("entity {} missing from model", entity_id),
                )
            })?;
        if fields.iter().any(|f| f.id == field_id) {
            Ok(())
        } else {
            Err(CompilerError::new(
                ErrorCode::InvalidExpression,
                format!("column {} is not a field of entity {}", field_id, entity_id),
            ))
        }
    }
}

fn occurrence_alias<'a>(node: &'a QueryNode, entity: &'a EntityMetadata) -> String {
    node.path
        .last()
        .cloned()
        .or_else(|| entity.source.components.last().cloned())
        .unwrap_or_else(|| format!("entity{}", node.entity))
}

fn build_scope(ancestor_ids: &[u64], current: u64) -> Vec<u64> {
    let mut s: Vec<u64> = ancestor_ids.to_vec();
    s.push(current);
    s
}

fn path_to_string(path: &[String]) -> String {
    if path.is_empty() {
        "root".to_string()
    } else {
        path.join(".")
    }
}

/// Comparisons against a literal `null` parameter are invalid; callers must use
/// an explicit null-test node (expression-model normalization rule).
fn reject_null_comparison(expr: &Expression) -> Result<(), CompilerError> {
    if matches!(
        expr,
        Expression::Parameter(crate::expression::Parameter {
            value: crate::expression::Value::Null,
            ..
        })
    ) {
        return Err(CompilerError::new(
            ErrorCode::InvalidExpression,
            "comparison against null is invalid; use an explicit null test",
        ));
    }
    Ok(())
}

