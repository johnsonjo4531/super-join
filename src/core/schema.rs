use serde::Deserialize;
use std::{collections::HashMap, sync::Arc};
use tsify::Tsify;
use wasm_bindgen::prelude::*;

use crate::core::{
    join_monster_schema,
    shared_schema::{Column, ColumnRef, JoinExpr},
};

#[derive(Tsify, Deserialize, Debug)]
#[tsify(from_wasm_abi)]
pub struct Options {
    pub builder: BuilderType,
}

#[derive(Tsify, Deserialize, Clone, Debug)]
#[tsify(from_wasm_abi)]
pub enum BuilderType {
    #[serde(rename = "postgres")]
    Postgres,
    #[serde(rename = "mysql")]
    MySql,
    #[serde(rename = "sqlite")]
    Sqlite,
}

#[derive(Tsify, Deserialize, Debug)]
#[tsify(from_wasm_abi)]
pub struct RootInput(pub Vec<Node>);

#[derive(Tsify, Deserialize, Debug)]
#[tsify(from_wasm_abi)]
pub struct Root(#[tsify(type = "Record<string, Node>")] pub HashMap<String, Arc<Node>>);

impl From<Vec<Node>> for Root {
    fn from(values: Vec<Node>) -> Self {
        let mut map = std::collections::HashMap::new();
        for value in values {
            map.insert(value.alias.clone(), Arc::new(value));
        }
        Root(map)
    }
}

#[derive(Tsify, Deserialize, Debug)]
#[tsify(from_wasm_abi)]
pub enum AnyNode {
    #[serde(rename = "alias")]
    AliasNode(Arc<ExtendsNode>),
    #[serde(rename = "node")]
    Node(Arc<Node>),
}

#[derive(Tsify, Deserialize, Clone, Debug)]
#[tsify(from_wasm_abi)]
pub struct ExtendsNode {
    pub alias: String,
    pub field_name: String,
    /// The alias this node extends from the Root
    pub extends: String,
}

#[derive(Tsify, Deserialize, Debug)]
#[tsify(from_wasm_abi)]
pub struct Node {
    /// The SuperJoin Identifier and SQL alias.
    pub alias: String,
    /// The GraphQL Field Name!
    pub field_name: String,
    /// The SQL table name
    pub table: String,
    /// Metadata about how to fetch the fields from SQL
    #[tsify(type = "Record<string, Field>")]
    pub fields: HashMap<String, Field>,
}

#[derive(Tsify, Deserialize, Debug)]
#[tsify(from_wasm_abi)]
#[serde(tag = "field_type")]
pub enum Field {
    #[serde(rename = "column")]
    Column(Column),
    #[serde(rename = "join")]
    Join(JoinInfo),
    #[serde(rename = "where")]
    Where(String),
    #[serde(rename = "order_by")]
    OrderBy(Vec<OrderBy>),
    #[serde(rename = "limit")]
    Limit(u64),
}

#[derive(Tsify, Deserialize, Clone, Debug)]
#[tsify(from_wasm_abi)]
pub struct OrderBy {
    pub expr: ColumnRef,
    pub direction: OrderDirection,
}

#[derive(Tsify, Deserialize, Clone, Debug)]
#[tsify(from_wasm_abi)]
#[serde(tag = "order_dir")]
pub enum OrderDirection {
    Asc,
    Desc,
}

impl From<join_monster_schema::JoinMonsterOrderDirection> for OrderDirection {
    fn from(value: join_monster_schema::JoinMonsterOrderDirection) -> Self {
        match value {
            join_monster_schema::JoinMonsterOrderDirection::Asc
            | join_monster_schema::JoinMonsterOrderDirection::AscCaps => {
                crate::core::schema::OrderDirection::Asc
            }
            join_monster_schema::JoinMonsterOrderDirection::Desc
            | join_monster_schema::JoinMonsterOrderDirection::DescCaps => {
                crate::core::schema::OrderDirection::Asc
            }
        }
    }
}

#[derive(Tsify, Deserialize, Clone, Debug)]
#[tsify(from_wasm_abi)]
pub struct ColumnInfo {
    pub column: String,
    pub table: Option<String>,
}

impl From<String> for ColumnInfo {
    fn from(column: String) -> Self {
        ColumnInfo {
            column,
            table: None,
        }
    }
}

impl From<&str> for ColumnInfo {
    fn from(column: &str) -> Self {
        String::from(column).into()
    }
}

#[derive(Tsify, Deserialize, Debug)]
#[tsify(from_wasm_abi)]
pub struct JoinInfo {
    /// The id of a root type
    pub extends: ExtendsNode,
    pub join: JoinExpr,
}
