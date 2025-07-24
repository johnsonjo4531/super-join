use js_sys::Function;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fmt::{self, Debug, Formatter};
use tsify::Tsify;
use wasm_bindgen::prelude::*;

/// Trait to convert opaque JS function types into `&Function`
pub trait AsFn {
    fn as_fn(&self) -> &Function;
}

/// Macro to implement `AsFunction` for any list of types
macro_rules! impl_as_function {
    ($($t:ty),* $(,)?) => {
        $(
            impl AsFn for $t {
                fn as_fn(&self) -> &Function {
                    // Optional: safety check in debug builds
                    debug_assert!(self.obj.is_function(), concat!(stringify!($t), " is not a JS function"));
                    self.obj.unchecked_ref()
                }
            }
        )*
    };
}

// Common implementation pattern
macro_rules! impl_debug_for_js_fn {
    ($($t:ty),* $(,)?) => {
        $(
            impl Debug for $t {
                fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
                    write!(f, "<js-function-call>")
                }
            }
        )*
    };
}

/// Wrapper around join-monster JS function
#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(
        typescript_type = "(tableAlias: string, args: any, context: any, sqlASTNode: any) => (string | Promise<string>)"
    )]
    pub type ExprFn;
    #[wasm_bindgen(
        typescript_type = "(tableAlias: string, args: any, context: any, sqlASTNode: any) => (string | Promise<string>)"
    )]
    pub type WhereFn;
    #[wasm_bindgen(
        typescript_type = "(rootTableAlias: string, otherTableAlias: string, args: any, context: any, sqlASTNode: any) => string",
        extends = js_sys::Function
    )]
    pub type JoinFn;
    #[wasm_bindgen(
        typescript_type = "(args: any, context: any) => {column: string, direction: 'asc' | 'desc' | 'ASC' | 'DESC'}[]",
        extends = js_sys::Function
    )]
    pub type OrderByFn;
    #[wasm_bindgen(typescript_type = "(args: any, context: any) => any", extends = js_sys::Function)]
    pub type ThunkFn;
}

impl_debug_for_js_fn! {
    ExprFn,
    WhereFn,
    JoinFn,
    OrderByFn,
    ThunkFn,
}

impl_as_function! {
    ExprFn,
    WhereFn,
    JoinFn,
    OrderByFn,
    ThunkFn,
}

#[derive(Tsify, Deserialize, Debug)]
#[tsify(from_wasm_abi)]
#[serde(rename_all = "camelCase")]
pub struct ObjectTypeExtension {
    pub sql_table: String,
    #[tsify(type = "string | string[]")]
    pub unique_key: MultiString,
}

#[derive(Tsify, Deserialize, Debug)]
#[tsify(from_wasm_abi)]
#[serde(rename_all = "snake_case")]
pub enum Extension {
    Object(ObjectTypeExtension),
    Field(FieldTypeExtension),
}

#[derive(Tsify, Deserialize, Debug)]
#[tsify(from_wasm_abi)]
#[serde(rename_all = "camelCase")]
pub enum MultiString {
    One(String),
    Multi(Vec<String>),
}

#[derive(Tsify, Deserialize, Debug)]
#[tsify(from_wasm_abi)]
#[serde(rename_all = "camelCase")]
pub struct FieldTypeExtension {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sql_column: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[tsify(
        type = "string | ((tableAlias: string, args: any, context: any, sqlASTNode: any) => (string | Promise<string>))"
    )]
    pub sql_expr: Option<FnValue<String>>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "where")]
    #[tsify(
        type = "string | ((tableAlias: string, args: any, context: any, sqlASTNode: any) => (string | Promise<string>))"
    )]
    pub where_clause: Option<FnValue<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub order_by: Option<JoinMonsterOrderBy>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[tsify(
        type = "string | ((args: any, context: any) => {column: string, direction: 'asc' | 'desc' | 'ASC' | 'DESC'}[])"
    )]
    pub sql_join: Option<FnValue<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sql_batch: Option<String>,
}

#[derive(Tsify, Deserialize, Serialize)]
#[tsify(from_wasm_abi)]
#[serde(rename_all = "snake_case", tag = "value_type", content = "value")]
pub enum FnValue<V: Clone> {
    #[serde(skip_serializing, skip_deserializing)] // can't deserialize or serialize the Function
    Func(js_sys::Function),
    Value(V),
}

impl<V: Clone> Clone for FnValue<V> {
    fn clone(&self) -> Self {
        match self {
            Self::Func(arg0) => Self::Func(arg0.clone()),
            Self::Value(arg0) => Self::Value(arg0.clone()),
        }
    }
}

impl<V: ToString + Clone> ToString for FnValue<V> {
    fn to_string(&self) -> String {
        match self {
            FnValue::Func(_) => "Fn(<function>)".into(),
            FnValue::Value(v) => format!("Value({})", v.to_string()),
        }
    }
}

impl<V: std::fmt::Debug + Clone> std::fmt::Debug for FnValue<V> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            FnValue::Func(_) => write!(f, "Fn(<function>)"),
            FnValue::Value(v) => f.debug_tuple("Value").field(v).finish(),
        }
    }
}

#[derive(Tsify, Deserialize, Debug)]
#[tsify(from_wasm_abi)]
#[serde(rename_all = "camelCase")]
pub enum JoinMonsterOrderBy {
    Old(HashMap<String, JoinMonsterOrderDirection>),
    Explicit(Vec<ExplicitOrderBy>),
    #[serde(skip_deserializing)] // can't deserialize into Function
    Dynamic(OrderByFn),
}

#[derive(Tsify, Deserialize, Debug)]
#[tsify(from_wasm_abi)]
#[serde(rename_all = "camelCase")]
pub struct ExplicitOrderBy {
    pub column: String,
    pub direction: JoinMonsterOrderDirection,
}

#[derive(Tsify, Deserialize, Clone, Debug)]
#[tsify(from_wasm_abi)]
#[serde(rename_all = "snake_case")]
pub enum JoinMonsterOrderDirection {
    Asc,
    Desc,
    #[serde(rename = "ASC")]
    AscCaps,
    #[serde(rename = "DESC")]
    DescCaps,
}
