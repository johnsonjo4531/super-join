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

// /// Macro to implement `AsFunction` for any list of types
// macro_rules! impl_as_function {
//     ($($t:ty),* $(,)?) => {
//         $(
//             impl AsFn for $t {
//                 fn as_fn(&self) -> &Function {
//                     // Optional: safety check in debug builds
//                     debug_assert!(self.obj.is_function(), concat!(stringify!($t), " is not a JS function"));
//                     self.obj.unchecked_ref()
//                 }
//             }
//         )*
//     };
// }

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

// impl_as_function! {
//     ExprFn,
//     WhereFn,
//     JoinFn,
//     OrderByFn,
//     ThunkFn,
// }

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
    pub sql_expr: Option<FnValue<ExprFn, String>>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "where")]
    pub where_clause: Option<FnValue<WhereFn, String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub order_by: Option<OrderBy>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sql_join: Option<FnValue<JoinFn, String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sql_batch: Option<String>,
}

#[derive(Tsify, Deserialize, Serialize)]
#[tsify(from_wasm_abi)]
#[serde(rename_all = "camelCase")]
pub enum FnValue<F, V> {
    #[serde(skip_deserializing, skip_serializing)] // can't deserialize or serialize the Function
    Fn(F),
    Value(V),
}

impl<F: Clone, V: Clone> Clone for FnValue<F, V> {
    fn clone(&self) -> Self {
        match self {
            Self::Fn(arg0) => Self::Fn(arg0.clone()),
            Self::Value(arg0) => Self::Value(arg0.clone()),
        }
    }
}

impl<F, V: ToString> ToString for FnValue<F, V> {
    fn to_string(&self) -> String {
        match self {
            FnValue::Fn(_) => "Fn(<function>)".into(),
            FnValue::Value(v) => format!("Value({})", v.to_string()),
        }
    }
}

impl<F, V: std::fmt::Debug> std::fmt::Debug for FnValue<F, V> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            FnValue::Fn(_) => write!(f, "Fn(<function>)"),
            FnValue::Value(v) => f.debug_tuple("Value").field(v).finish(),
        }
    }
}

#[derive(Tsify, Deserialize, Debug)]
#[tsify(from_wasm_abi)]
#[serde(rename_all = "camelCase")]
pub enum OrderBy {
    Old(HashMap<String, OrderDirection>),
    Explicit(Vec<ExplicitOrderBy>),
    #[serde(skip_deserializing)] // can't deserialize into Function
    Dynamic(OrderByFn),
}

#[derive(Tsify, Deserialize, Debug)]
#[tsify(from_wasm_abi)]
#[serde(rename_all = "camelCase")]
pub struct ExplicitOrderBy {
    column: String,
    direction: OrderDirection,
}

#[derive(Tsify, Deserialize, Debug)]
#[tsify(from_wasm_abi)]
#[serde(rename_all = "snake_case")]
pub enum OrderDirection {
    Asc,
    Desc,
    #[serde(rename = "ASC")]
    AscCaps,
    #[serde(rename = "DESC")]
    DescCaps,
}
