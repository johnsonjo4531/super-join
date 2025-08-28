use wasm_bindgen::prelude::*;

use crate::{
    core::schema::{Options, Root, RootInput},
    error::try_pretty_print_serde_error,
};

#[wasm_bindgen(js_name = buildSqlQuery)]
pub fn build_sql_query(
    query: &str,
    metadata: RootInput,
    context: JsValue,
    options: Option<Options>,
) -> Result<String, JsValue> {
    let root = Root::from(metadata.0);
    let result = crate::core::to_sql::build_sql_query(query, root, Some(context), options);

    match result {
        Ok(sql) => Ok(sql),
        Err(err) => {
            // Try to detect and pretty-print Serde error if it occurred inside the logic
            let pretty = try_pretty_print_serde_error(&err);
            Err(JsValue::from_str(&pretty))
        }
    }
}

// #[wasm_bindgen(js_name = hydrateResults)]
// pub fn hydrate_results(rows: JsValue, resolve_info: &str) -> Result<JsValue, JsValue> {
//     // This is a stub for now; real hydration would map flat rows to nested JSON.
//     match hydrate_results(rows, resolve_info) {
//         Ok(sql) => Ok(JsValue::from_str(&sql)),
//         Err(err) => Err(JsValue::from_str(&err)),
//     }
// }
