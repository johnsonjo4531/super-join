use graphql_parser::query::Text;
use graphql_parser::schema::{
    Definition, Document, Field as GqlField, Type, TypeDefinition, Value,
};
use sea_query::Value;
use serde::Deserialize;
use std::collections::{BTreeMap, HashMap};
use tsify::Tsify;
use wasm_bindgen::JsValue;

use crate::core::join_monster_schema::{Extension, FnValue};
use crate::core::schema::{
    ColumnInfo, ExtendsNode, Field as IRField, JoinInfo, Node, OrderBy, RootInput,
};
use crate::core::shared_schema::{
    Column, ColumnRef, IRParseError, Join, JoinExpr, JoinType, SqlExpr,
};

#[derive(Tsify, Deserialize, Debug)]
#[tsify(from_wasm_abi)]
pub struct Extensions {
    #[tsify(type = "Record<String, Extension>")]
    pub extensions: HashMap<String, Extension>,
}

pub fn ir_from_join_monster(
    doc: &Document<'_, String>,
    extensions: Extensions,
    context: JsValue,
) -> Result<RootInput, IRParseError> {
    let mut nodes = Vec::new();

    let obj_num = 1;
    let field_num = 1;

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

        let table_name = ext.sql_table;

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

            if let Some(col) = ext.sql_column {
                fields.insert(
                    field.name.clone(),
                    IRField::Column(Column::Data(ColumnRef {
                        column: col.to_string(),
                        table: Some(alias.clone()),
                        alias: Some(alias.clone()),
                    })),
                );
            }

            if let Some(expr) = ext.sql_expr {
                fields.insert(
                    field.name.clone(),
                    IRField::Column(Column::Expr(SqlExpr::Raw(expr.to_string().into()))),
                );
            }

            if let Some(expr) = ext.where_clause {
                fields.insert(field.name.clone(), IRField::Where(expr.to_string()));
            }

            if let Some(order_by) = ext.order_by {
                let order_by: Vec<OrderBy> = match order_by {
                    join_monster_schema::OrderBy::Dynamic(value) => {
                        // Unimplemented
                    }
                    join_monster_schema::OrderBy::Explicit(value) => value,
                    join_monster_schema::OrderBy::Old(value) => value
                        .iter()
                        .map(|x| OrderBy {
                            expr: ColumnInfo {
                                column: column.to_string(),
                                table: Some(alias.clone()),
                            },
                            direction,
                        })
                        .into(),
                };

                fields.insert(field.name.clone(), IRField::OrderBy(order_by));
            }

            if let Some(limit) = ext.limit {
                fields.insert(field.name.clone(), IRField::Limit(limit as u64));
            }

            if let Some(join_expr) = ext.sql_join {
                // let root_table_alias = alias.clone().into();
                // let other_table_alias = get_named_type(&field.field_type)
                //     .ok_or(IRParseError::MissingNamedType)
                //     .into()?;
                // let arguments = js_sys::Array::new();
                // for value in field.arguments.iter() {
                //     let value: JsValue = value_into_js_value(value.);
                //     arguments.push(&value);
                // }

                // let context = context;
                // let sql_ast_node = JsValue::null();
                // let value_array: [JsValue; 5] = [
                //     root_table_alias,
                //     other_table_alias,
                //     arguments,
                //     context,
                //     sql_ast_node,
                // ];

                // // Create an array of arguments
                // let args = js_sys::Array::new();
                // for value in value_array.iter() {
                //     args.push(value);
                // }
                // let join_expr: String = match join_expr {
                //     FnValue::Fn(js_function) => {
                //         let value = js_function.apply(&JsValue::null(), &args);

                //         let value = match value {
                //             Ok(value) => Ok(value.as_string()),
                //             _ => Err(IRParseError::FnValueExpected),
                //         }?;
                //         let value = value.ok_or(IRParseError::ExpectedStringValue)?;
                //         value
                //     }
                //     FnValue::Value(value) => value,
                // };
                // let parsed_join = SqlExpr::Raw(join_expr.into());

                fields.insert(
                    field.name.clone(),
                    IRField::Join(JoinInfo {
                        extends: ExtendsNode {
                            alias: field.name.clone(),
                            field_name: field.name.clone(),
                            extends: alias.clone(),
                        },
                        join: match join_expr {
                            FnValue::Fn(func) => JoinExpr::Fn(FnValue::Fn(func)),
                            FnValue::Value(value) => JoinExpr::Join(Join {
                                on: SqlExpr::Raw(value.into()),
                                kind: JoinType::LeftJoin,
                            }),
                        },
                    }),
                );

                let nested_type = get_named_type(&field.field_type)
                    .ok_or(IRParseError::TypeNotFound(field.name.clone()))?;

                let alias = format!("{}_{}", field.name.clone(), field_num);
                field_num += 1;
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
            field_name: obj.name.into(),
            table: table_name,
            fields,
        });
    }

    Ok(RootInput(nodes))
}

trait ValueExt<'a> {
    fn as_object(&self) -> Option<&BTreeMap<String, Value<'a, String>>>;
    fn as_str_value(&self) -> Option<&str>;
    fn as_i64(&self) -> Option<i64>;
}

impl<'a> ValueExt<'a> for Value<'a, String> {
    fn as_object(&self) -> Option<&BTreeMap<String, Value<'a, String>>> {
        match self {
            Value::Object(map) => Some(map.into()),
            _ => None,
        }
    }

    fn as_str_value(&self) -> Option<&str> {
        match self {
            Value::String(s) => Some(s),
            _ => None,
        }
    }

    fn as_i64(&self) -> Option<i64> {
        match self {
            Value::Int(i) => i.as_i64(),
            _ => None,
        }
    }
}
