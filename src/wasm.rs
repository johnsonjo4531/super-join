use bindings::exports::super_join::graphql::Guest;

use crate::core::schema::{Options, RootInput};

struct Component;

impl Guest for Component {
    fn build_sql(
        query: String,
        root: RootInput,
        context: Option<String>,
        options: Option<Options>,
    ) -> String {
        crate::core::to_sql::build_sql_query(query, root, context, options)
    }
}
