import test from "ava";
import { buildSqlQuery, extractSubQuery } from "../index.js";

test("foo", (t) => {
  t.pass();
});

test("bar", async (t) => {
  const bar = Promise.resolve("bar");
  t.is(await bar, "bar");
});
