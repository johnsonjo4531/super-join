use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn build_sql_query(resolve_info: &str, metadata_json: &str) -> Result<JsValue, JsValue> {
    match crate::core::build_sql_query(resolve_info, metadata_json) {
        Ok(sql) => Ok(JsValue::from_str(&sql)),
        Err(err) => Err(JsValue::from_str(&err)),
    }
}

// #[wasm_bindgen]
// pub fn hydrateResults(rows: JsValue, resolve_info: &str) -> Result<JsValue, JsValue> {
//     // This is a stub for now; real hydration would map flat rows to nested JSON.
//     match hydrate_results(rows, resolve_info) {
//         Ok(sql) => Ok(JsValue::from_str(&sql)),
//         Err(err) => Err(JsValue::from_str(&err)),
//     }
// }
