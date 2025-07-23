use sea_query::{Expr, ExprTrait, IntoLikeExpr};
use serde::{Deserialize, Serialize};
use tsify::Tsify;

use crate::core::join_monster_schema::{FnValue, JoinFn};

#[derive(Tsify, Deserialize, Serialize, Clone, Debug)]
#[tsify(from_wasm_abi)]
pub struct ColumnRef {
    pub column: String,
    pub table: Option<String>,
    pub alias: Option<String>,
}

impl From<String> for ColumnRef {
    fn from(column: String) -> Self {
        ColumnRef {
            column,
            table: None,
            alias: None,
        }
    }
}

#[derive(Tsify, Deserialize, Serialize, Clone, Debug)]
#[tsify(from_wasm_abi)]
pub struct SqlParam {
    pub name: String,
    pub value: SqlValue,
}

#[derive(Tsify, Deserialize, Serialize, Clone, Debug)]
#[tsify(from_wasm_abi)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum SqlValue {
    Int(Value<Option<i64>>),
    Float(Value<Option<f64>>),
    Text(Value<Option<String>>),
    Bool(Value<Option<bool>>),
    // etc.
}

#[derive(Tsify, Deserialize, Serialize, Clone, Debug)]
#[tsify(from_wasm_abi)]
pub struct Value<T> {
    pub value: T,
}

impl<T> From<T> for Value<T> {
    fn from(value: T) -> Self {
        Value { value }
    }
}

impl From<&SqlValue> for sea_query::Value {
    fn from(v: &SqlValue) -> sea_query::Value {
        match v {
            SqlValue::Int(i) => sea_query::Value::BigInt(i.value.clone()), // or Int64 if needed
            SqlValue::Float(f) => sea_query::Value::Double(f.value.clone()),
            SqlValue::Text(s) => sea_query::Value::String(match s.value.clone() {
                Some(s) => Some(Box::new(s)),
                None => None,
            }),
            SqlValue::Bool(b) => sea_query::Value::Bool(b.value.clone()),
        }
    }
}

#[derive(Tsify, Serialize, Deserialize, Debug, Clone)]
#[tsify(from_wasm_abi)]
pub struct BinaryExpr {
    pub left: Box<SqlExpr>,
    pub right: Box<SqlExpr>,
}

#[derive(Tsify, Serialize, Deserialize, Debug, Clone)]
#[tsify(from_wasm_abi)]
pub struct LikeExpr {
    pub left: Box<SqlExpr>,
    pub right: String,
}

#[derive(Tsify, Serialize, Deserialize, Debug, Clone)]
#[tsify(from_wasm_abi)]
pub struct InExpr {
    pub left: Box<SqlExpr>,
    pub right: Vec<SqlExpr>,
}

#[derive(Tsify, Serialize, Deserialize, Debug, Clone)]
#[tsify(from_wasm_abi)]
pub struct NotExpr {
    pub expr: Box<SqlExpr>,
}

#[derive(Tsify, Deserialize, Serialize, Clone, Debug)]
#[tsify(from_wasm_abi)]
#[serde(tag = "kind")]
pub enum Column {
    Expr(WithAlias<SqlExpr>),
    Data(ColumnRef),
}

#[derive(Tsify, Deserialize, Serialize, Clone, Debug)]
#[tsify(from_wasm_abi)]
#[serde(tag = "kind")]
pub struct WithAlias<T> {
    pub alias: Option<String>,
    pub data: T,
}

#[derive(Tsify, Serialize, Deserialize, Debug, Clone)]
#[tsify(from_wasm_abi)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum SqlExpr {
    /// e.g. "user.id"
    Column(ColumnRef),
    /// e.g. $userId or a literal like 42
    Param(SqlParam),
    /// A raw literal value, e.g. 'admin' or 42
    Literal(Value<String>),
    /// A raw SQL string expression — e.g. "user.id = post.user_id"
    Raw(Value<String>),

    Eq(EqExpr),
    Neq(NeqExpr),
    Gt(GtExpr),
    Gte(GteExpr),
    Lt(LtExpr),
    Lte(LteExpr),

    And(AndExpr),
    Or(OrExpr),
    Not(NotExpr),

    Like(LikeExpr),
    In(InExpr),
    IsNull(IsNullExpr),
    IsNotNull(IsNotNullExpr),
}

#[derive(Tsify, Serialize, Deserialize, Debug, Clone)]
#[tsify(from_wasm_abi)]
pub struct EqExpr {
    pub left: Box<SqlExpr>,
    pub right: Box<SqlExpr>,
}

#[derive(Tsify, Serialize, Deserialize, Debug, Clone)]
#[tsify(from_wasm_abi)]
pub struct NeqExpr {
    pub left: Box<SqlExpr>,
    pub right: Box<SqlExpr>,
}

#[derive(Tsify, Serialize, Deserialize, Debug, Clone)]
#[tsify(from_wasm_abi)]
pub struct GtExpr {
    pub left: Box<SqlExpr>,
    pub right: Box<SqlExpr>,
}

#[derive(Tsify, Serialize, Deserialize, Debug, Clone)]
#[tsify(from_wasm_abi)]
pub struct GteExpr {
    pub left: Box<SqlExpr>,
    pub right: Box<SqlExpr>,
}

#[derive(Tsify, Serialize, Deserialize, Debug, Clone)]
#[tsify(from_wasm_abi)]
pub struct LtExpr {
    pub left: Box<SqlExpr>,
    pub right: Box<SqlExpr>,
}

#[derive(Tsify, Serialize, Deserialize, Debug, Clone)]
#[tsify(from_wasm_abi)]
pub struct LteExpr {
    pub left: Box<SqlExpr>,
    pub right: Box<SqlExpr>,
}

// Logic

#[derive(Tsify, Serialize, Deserialize, Debug, Clone)]
#[tsify(from_wasm_abi)]
pub struct AndExpr {
    pub left: Box<SqlExpr>,
    pub right: Box<SqlExpr>,
}

#[derive(Tsify, Serialize, Deserialize, Debug, Clone)]
#[tsify(from_wasm_abi)]
pub struct OrExpr {
    pub left: Box<SqlExpr>,
    pub right: Box<SqlExpr>,
}

#[derive(Tsify, Serialize, Deserialize, Debug, Clone)]
#[tsify(from_wasm_abi)]
pub struct IsNullExpr {
    pub expr: Box<SqlExpr>,
}

#[derive(Tsify, Serialize, Deserialize, Debug, Clone)]
#[tsify(from_wasm_abi)]
pub struct IsNotNullExpr {
    pub expr: Box<SqlExpr>,
}

impl SqlExpr {
    pub fn to_sea_expr(&self) -> sea_query::SimpleExpr {
        match self {
            SqlExpr::Column(column_ref) => match column_ref.table {
                Some(ref table) => {
                    let table_alias = sea_query::Alias::new(table);
                    let col_alias = sea_query::Alias::new(column_ref.column.clone());
                    Expr::column((table_alias, col_alias))
                }
                None => Expr::column(sea_query::Alias::new(column_ref.column.clone())),
            },
            SqlExpr::Param(SqlParam { name, value }) => {
                Expr::cust_with_values(format!("${}", name), &[value.clone()]).into()
            }

            SqlExpr::Literal(val) => Expr::val(sea_query::Value::from(val.value.clone())).into(),

            SqlExpr::Raw(raw) => Expr::cust(raw.value.clone()).into(),

            SqlExpr::Eq(EqExpr { left, right }) => Expr::expr(left.to_sea_expr())
                .eq(right.to_sea_expr())
                .into(),
            SqlExpr::Neq(NeqExpr { left, right }) => Expr::expr(left.to_sea_expr())
                .ne(right.to_sea_expr())
                .into(),
            SqlExpr::Gt(GtExpr { left, right }) => Expr::expr(left.to_sea_expr())
                .gt(right.to_sea_expr())
                .into(),
            SqlExpr::Gte(GteExpr { left, right }) => Expr::expr(left.to_sea_expr())
                .gte(right.to_sea_expr())
                .into(),
            SqlExpr::Lt(LtExpr { left, right }) => Expr::expr(left.to_sea_expr())
                .lt(right.to_sea_expr())
                .into(),
            SqlExpr::Lte(LteExpr { left, right }) => Expr::expr(left.to_sea_expr())
                .lte(right.to_sea_expr())
                .into(),

            SqlExpr::And(AndExpr { left, right }) => Expr::expr(left.to_sea_expr())
                .and(right.to_sea_expr())
                .into(),
            SqlExpr::Or(OrExpr { left, right }) => Expr::expr(left.to_sea_expr())
                .or(right.to_sea_expr())
                .into(),
            SqlExpr::Not(NotExpr { expr }) => Expr::expr(expr.to_sea_expr()).not().into(),

            SqlExpr::Like(LikeExpr { left, right }) => Expr::expr(left.to_sea_expr())
                .like(right.into_like_expr())
                .into(),

            SqlExpr::In(InExpr { left, right }) => {
                let values = right.iter().map(|e| e.to_sea_expr()).collect::<Vec<_>>();
                Expr::expr(left.to_sea_expr()).is_in(values).into()
            }

            SqlExpr::IsNull(IsNullExpr { expr }) => Expr::expr(expr.to_sea_expr()).is_null().into(),
            SqlExpr::IsNotNull(IsNotNullExpr { expr }) => {
                Expr::expr(expr.to_sea_expr()).is_not_null().into()
            }
        }
    }
}

// impl From<&SqlExpr> for SimpleExpr {
//     fn from(expr: &SqlExpr) -> Self {
//         match expr {
//             SqlExpr::Column(column_ref) => match column_ref.table {
//                 Some(ref table) => {
//                     let table_alias = sea_query::Alias::new(table);
//                     let col_alias = sea_query::Alias::new(column_ref.column.clone());
//                     Expr::column((table_alias, col_alias))
//                 }
//                 None => Expr::column(sea_query::Alias::new(column_ref.column.clone())),
//             },
//             SqlExpr::Param(name) => {
//                 let s: SimpleExpr = (&name.value).into();
//                 Expr::value(s)
//             }
//             SqlExpr::Literal(val) => Expr::cust(val.value.clone()),
//             SqlExpr::Raw(expr) => Expr::cust(expr.value.clone()),

//             SqlExpr::Binary(_) => Expr::cust(format!("-- bool expr inside Expr: {:?}", expr)),
//         }
//     }
// }

impl From<&SqlExpr> for sea_query::SimpleExpr {
    fn from(value: &SqlExpr) -> Self {
        value.to_sea_expr()
    }
}

#[derive(Tsify, Deserialize, Serialize, Clone, Debug)]
#[tsify(from_wasm_abi)]
pub struct BinaryOp<L, R> {
    pub left: L,
    pub right: R,
}

#[derive(Tsify, Deserialize, Serialize, Clone, Debug)]
#[tsify(from_wasm_abi)]
#[serde(rename_all = "snake_case")]
pub enum JoinType {
    Join,
    CrossJoin,
    InnerJoin,
    LeftJoin,
    RightJoin,
    FullOuterJoin,
}

impl From<&JoinType> for sea_query::JoinType {
    fn from(value: &JoinType) -> Self {
        match value {
            JoinType::Join => sea_query::JoinType::Join,
            JoinType::CrossJoin => sea_query::JoinType::CrossJoin,
            JoinType::InnerJoin => sea_query::JoinType::InnerJoin,
            JoinType::LeftJoin => sea_query::JoinType::LeftJoin,
            JoinType::RightJoin => sea_query::JoinType::RightJoin,
            JoinType::FullOuterJoin => sea_query::JoinType::FullOuterJoin,
        }
    }
}

#[derive(Tsify, Deserialize, Serialize, Debug)]
#[tsify(from_wasm_abi)]
pub enum JoinExpr {
    Fn(FnValue<JoinFn, String>),
    Join(Join),
}

#[derive(Tsify, Deserialize, Serialize, Clone, Debug)]
#[tsify(from_wasm_abi)]
pub struct Join {
    pub on: SqlExpr,
    pub kind: JoinType,
}

#[derive(Debug)]
pub enum IRParseError {
    MissingNamedType,
    MissingExtension,
    ExpectedStringValue,
    ObjectExtensionExpected,
    FieldExtensionExpected,
    FnValueExpected,
    InvalidJoinExpr(String),
    TypeNotFound(String),
    MissingField(String),
    UnexpectedType(String),
}
