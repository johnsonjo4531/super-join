use graphql_parser::schema::{Definition, Document, Type, TypeDefinition};

use js_sys::Function;
use serde::Deserialize;
use std::collections::HashMap;
use tsify::Tsify;

use crate::core::join_monster_schema::{self, Extension, FnValue};
use crate::core::schema::{ExtendsNode, Field as IRField, JoinInfo, Node, OrderBy, RootInput};
use crate::core::shared_schema::{
    Column, ColumnRef, IRParseError, Join, JoinExpr, JoinType, SqlExpr,
};

#[derive(Tsify, Deserialize, Debug)]
#[tsify(from_wasm_abi)]
pub struct Extensions {
    #[tsify(type = "Record<string, Extension>")]
    pub extensions: HashMap<String, Extension>,
}

pub fn ir_from_join_monster(
    doc: &Document<'_, String>,
    extensions: Extensions,
) -> Result<RootInput, IRParseError> {
    let mut nodes = Vec::new();

    let mut obj_num = 1;
    let mut field_num = 1;

    for def in &doc.definitions {
        let obj = match def {
            Definition::TypeDefinition(TypeDefinition::Object(obj)) => obj,
            _ => continue,
        };

        let ext = extensions
            .extensions
            .get(&obj.name)
            .ok_or(IRParseError::MissingExtension)?;

        let ext = match ext {
            Extension::Object(obj) => Ok(obj),
            Extension::Field(_) => Err(IRParseError::ObjectExtensionExpected),
        }?;

        let table_name = ext.sql_table.clone();

        let alias = format!("{}_{}", obj.name.clone(), obj_num);
        obj_num += 1;

        let mut fields = HashMap::new();

        for field in &obj.fields {
            let ext = match extensions.extensions.get(&field.name) {
                Some(ext) => ext,
                _ => continue,
            };

            let ext = match ext {
                Extension::Field(obj) => Ok(obj),
                Extension::Object(_) => Err(IRParseError::FieldExtensionExpected),
            }?;

            if let Some(col) = &ext.sql_column {
                let field_alias = format!("{}_{}", field.name.clone(), field_num);
                field_num += 1;
                fields.insert(
                    field.name.clone(),
                    IRField::Column(Column::Data(ColumnRef {
                        column: col.to_string(),
                        table: Some(alias.clone()),
                        alias: Some(field_alias.clone()),
                    })),
                );
            }

            if let Some(expr) = &ext.sql_expr {
                let field_alias = format!("{}_{}", field.name.clone(), field_num);
                field_num += 1;
                fields.insert(
                    field.name.clone(),
                    IRField::Column(Column::Expr(crate::core::shared_schema::WithAlias {
                        alias: Some(field_alias.clone()),
                        data: SqlExpr::Raw(expr.to_string().into()),
                    })),
                );
            }

            if let Some(expr) = &ext.where_clause {
                fields.insert(field.name.clone(), IRField::Where(expr.to_string()));
            }

            if let Some(order_by) = &ext.order_by {
                let field_alias = format!("{}_{}", field.name.clone(), field_num);
                field_num += 1;
                let order_by: Vec<OrderBy> = match order_by {
                    join_monster_schema::JoinMonsterOrderBy::Dynamic(_) => {
                        // Unimplemented
                        vec![]
                    }
                    join_monster_schema::JoinMonsterOrderBy::Explicit(value) => value
                        .iter()
                        .map(|x| OrderBy {
                            expr: ColumnRef {
                                table: Some(alias.clone()),
                                alias: Some(field_alias.clone()),
                                column: x.column.clone(),
                            },
                            direction: x.direction.clone().into(),
                        })
                        .collect(),
                    join_monster_schema::JoinMonsterOrderBy::Old(value) => value
                        .clone()
                        .into_keys()
                        .map(|col| {
                            let val = value
                                .get(&col)
                                .ok_or(IRParseError::UnexpectedType("None in OrderBy".into()))?;
                            Ok(OrderBy {
                                expr: ColumnRef {
                                    column: col.to_string(),
                                    table: Some(alias.clone()),
                                    alias: Some(field_alias.clone()),
                                },
                                direction: val.clone().into(),
                            })
                        })
                        .collect::<Result<Vec<_>, _>>()?,
                };

                fields.insert(field.name.clone(), IRField::OrderBy(order_by));
            }

            if let Some(limit) = ext.limit {
                fields.insert(field.name.clone(), IRField::Limit(limit as u64));
            }

            if let Some(join_expr) = &ext.sql_join {
                let field_alias = format!("{}_{}", field.name.clone(), field_num);
                field_num += 1;

                fields.insert(
                    field.name.clone(),
                    IRField::Join(JoinInfo {
                        extends: ExtendsNode {
                            alias: field_alias.clone(),
                            field_name: field.name.clone(),
                            extends: alias.clone(),
                        },
                        join: match join_expr {
                            FnValue::Func(func) => {
                                let func: Function = func.clone();
                                JoinExpr::FromJs(FnValue::Func(func).into())
                            }
                            FnValue::Value(value) => JoinExpr::Join(Join {
                                on: SqlExpr::Raw(value.clone().into()),
                                kind: JoinType::LeftJoin,
                            }),
                        },
                    }),
                );

                let nested_type = get_named_type(&field.field_type)
                    .ok_or(IRParseError::TypeNotFound(field.name.clone()))?;

                nodes.push(Node {
                    alias: alias.clone(),
                    field_name: field.name.clone(),
                    table: nested_type,
                    fields: HashMap::new(),
                });
            }

            // if let Some(batch) = ext.sql_batch {
            //     let this_key = batch
            //         .get("thisKey")
            //         .and_then(|v| v.as_str_value())
            //         .unwrap_or("id");
            //     let parent_key = batch
            //         .get("parentKey")
            //         .and_then(|v| v.as_str_value())
            //         .unwrap_or("id");

            //     fields.insert(
            //         field.name.clone(),
            //         IRField::Join(JoinInfo {
            //             extends: ExtendsNode {
            //                 alias: field.name.clone(),
            //                 field_name: field.name.clone(),
            //                 extends: alias.clone(),
            //             },
            //             join: Join {
            //                 kind: JoinType::LeftJoin,
            //                 on: SqlExpr::Eq(crate::core::shared_schema::EqExpr {
            //                     left: Box::new(SqlExpr::Column(ColumnRef {
            //                         table: Some(alias.clone()),
            //                         column: parent_key.to_string(),
            //                     })),
            //                     right: Box::new(SqlExpr::Column(ColumnRef {
            //                         table: Some(field.name.clone()),
            //                         column: this_key.to_string(),
            //                     })),
            //                 }),
            //             },
            //         }),
            //     );

            //     let nested_type = get_named_type(&field.field_type)
            //         .ok_or(IRParseError::TypeNotFound(field.name.clone()))?;

            //     nodes.push(Node {
            //         alias: field.name.clone(),
            //         field_name: field.name.clone(),
            //         table: nested_type,
            //         fields: HashMap::new(),
            //     });
            // }
        }

        nodes.push(Node {
            alias: alias.clone(),
            field_name: obj.name.clone().into(),
            table: table_name,
            fields,
        });
    }

    Ok(RootInput(nodes))
}

pub fn get_named_type(ty: &Type<'_, String>) -> Option<String> {
    match ty {
        Type::NamedType(name) => Some(name.to_string()),
        Type::ListType(inner) => get_named_type(inner),
        Type::NonNullType(inner) => get_named_type(inner),
    }
}

// trait ValueExt<'a> {
//     fn as_object(&self) -> Option<&BTreeMap<String, Value<'a, String>>>;
//     fn as_str_value(&self) -> Option<&str>;
//     fn as_i64(&self) -> Option<i64>;
// }

// impl<'a> ValueExt<'a> for Value<'a, String> {
//     fn as_object(&self) -> Option<&BTreeMap<String, Value<'a, String>>> {
//         match self {
//             Value::Object(map) => Some(map.into()),
//             _ => None,
//         }
//     }

//     fn as_str_value(&self) -> Option<&str> {
//         match self {
//             Value::String(s) => Some(s),
//             _ => None,
//         }
//     }

//     fn as_i64(&self) -> Option<i64> {
//         match self {
//             Value::Int(i) => i.as_i64(),
//             _ => None,
//         }
//     }
// }
