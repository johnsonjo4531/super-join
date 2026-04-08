// WIT-based component implementation using JSON serialization
// This allows us to use our existing Rust types without rewriting them for WIT

// We need to use super::bindings since bindings.rs is declared in lib.rs
use super::bindings;
use crate::core::fns::build_sql_query;
use crate::core::schema::{Options, Root, RootInput};

pub struct SuperJoinComponent;

impl bindings::Guest for SuperJoinComponent {
    fn build_sql_query(
        query: String,
        metadata_json: String,
        options_json: Option<String>,
    ) -> Result<String, String> {
        // Deserialize metadata from JSON string
        let root_input: RootInput = serde_json::from_str(&metadata_json)
            .map_err(|e| format!("Failed to deserialize metadata: {}", e))?;

        // Convert to Root (HashMap)
        let root: Root = Root::from(root_input.0);

        // Deserialize options if provided
        let core_options: Option<Options> = if let Some(opts_json) = options_json {
            serde_json::from_str(&opts_json)
                .map_err(|e| format!("Failed to deserialize options: {}", e))?
        } else {
            None
        };

        match build_sql_query(&query, root, core_options) {
            Ok(sql) => Ok(sql),
            Err(err) => Err(err.to_string()),
        }
    }

    fn hydrate_results(rows_json: String, _metadata_json: String) -> Result<String, String> {
        // TODO: Implement hydration logic
        // This would take flat SQL rows and reshape them according to metadata
        // For now, just parse and return the rows as-is
        match serde_json::from_str::<serde_json::Value>(&rows_json) {
            Ok(parsed) => Ok(parsed.to_string()),
            Err(e) => Err(format!("Failed to parse rows JSON: {}", e)),
        }
    }
}

// Use the export macro from bindings module
self::bindings::export!(SuperJoinComponent with_types_in self::bindings);
