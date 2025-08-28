use serde_json::Error as SerdeError;

pub fn format_serde_json_error(json: &str, err: &SerdeError) -> String {
    let (line, column) = (err.line(), err.column());
    let lines: Vec<&str> = json.lines().collect();
    let err_line = lines.get(line - 1).unwrap_or(&"");

    let pointer = format!(
        " --> line {}, column {}\n      {}\n      {:>width$}^",
        line,
        column,
        err_line,
        "",
        width = column
    );

    format!("{}\n{}", err.to_string(), pointer)
}

pub fn try_pretty_print_serde_error(err: &str) -> String {
    // Try to parse the original Serde error message
    // Example: "missing field `value` at line 1 column 783"
    let re = regex::Regex::new(r"at line (\d+) column (\d+)").unwrap();

    if let Some(captures) = re.captures(err) {
        let line: usize = captures[1].parse().unwrap_or(0);
        let column: usize = captures[2].parse().unwrap_or(0);

        // If you have access to the original source string, you can pass it here.
        // But here, we're limited to best-effort enhancement
        let pointer = format!(
            " --> line {}, column {}\n      {:>width$}^",
            line,
            column,
            "",
            width = column
        );

        format!("{}\n{}", err, pointer)
    } else {
        err.to_string()
    }
}
