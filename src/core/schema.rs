use serde::Deserialize;
use std::collections::HashMap;
use tsify::Tsify;
use wasm_bindgen::prelude::*;

use crate::core::shared_schema::Join;

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
pub struct Root(#[tsify(type = "Record<string, Node>")] pub HashMap<String, Node>);

impl From<Vec<Node>> for Root {
    fn from(values: Vec<Node>) -> Self {
        let mut map = std::collections::HashMap::new();
        for value in values {
            map.insert(value.alias.clone(), value);
        }
        Root(map)
    }
}

#[derive(Tsify, Deserialize, Clone, Debug)]
#[tsify(from_wasm_abi)]
pub enum AnyNode {
    #[serde(rename = "alias")]
    AliasNode(ExtendsNode),
    #[serde(rename = "node")]
    Node(Node),
}

#[derive(Tsify, Deserialize, Clone, Debug)]
#[tsify(from_wasm_abi)]
pub struct ExtendsNode {
    pub alias: String,
    pub field_name: String,
    /// The alias this node extends
    pub extends: String,
}

#[derive(Tsify, Deserialize, Clone, Debug)]
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

#[derive(Tsify, Deserialize, Clone, Debug)]
#[tsify(from_wasm_abi)]
#[serde(tag = "kind")]
pub enum Field {
    #[serde(rename = "column")]
    Column(ColumnInfo),
    #[serde(rename = "join")]
    Join(JoinInfo),
    #[serde(rename = "where")]
    Where(String),
    #[serde(rename = "order_by")]
    OrderBy(OrderBy),
    #[serde(rename = "limit")]
    Limit(u32),
}

#[derive(Tsify, Deserialize, Clone, Debug)]
#[tsify(from_wasm_abi)]
#[serde(tag = "kind")]
pub struct OrderBy {
    pub expr: ColumnInfo,
    pub direction: OrderDirection,
}

#[derive(Tsify, Deserialize, Clone, Debug)]
#[tsify(from_wasm_abi)]
#[serde(tag = "kind")]
pub enum OrderDirection {
    Asc,
    Desc,
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

#[derive(Tsify, Deserialize, Clone, Debug)]
#[tsify(from_wasm_abi)]
pub struct JoinInfo {
    /// The id of a root type
    pub extends: ExtendsNode,
    pub join: Join,
}
