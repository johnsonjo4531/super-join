import test from "ava";
import * as tests from "./test-code.js";

escapeStringRegExp.matchOperatorsRe = /[|\\{}()[\]^$+*?.]/g;
function escapeStringRegExp(str: string) {
  return str.replace(escapeStringRegExp.matchOperatorsRe, "\\$&");
}

function str2reg(flags = "u") {
  return (strings: TemplateStringsArray, ...values: any[]) =>
    new RegExp(escapeStringRegExp(evalTemplate(strings, ...values)), flags);
}

function evalTemplate(strings: TemplateStringsArray, ...values: any[]) {
  let i = 0;
  return strings.reduce(
    (str, string) =>
      `${str}${string}${i < values.length ? values[i++].toString() : ""}`,
    "",
  );
}

for (const [name, fn] of Object.entries(tests) as [
  string,
  (str: string, substring: string) => Promise<void> | void,
][]) {
  test(name, (t) =>
    fn((string, substring) => {
      t.regex(string, str2reg("g")`${substring}`);
    }),
  );
}
