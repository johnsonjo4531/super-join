import { metadata, schema } from "../__example__/schema.js";
import { buildSqlQuery } from "../index.js";
import { aliases } from "../__example__/schema_aliases.js";

export function runtime_stats(
  assertContains: (str: string, substring: string) => void,
) {
  console.time("First run of buildSqlQuery (slow because of initialization)");
  const sql = buildSqlQuery(`{posts { title author  } }`, metadata);
  console.timeEnd(
    "First run of buildSqlQuery (slow because of initialization)",
  );
  console.time(
    "Next 100 passes of buildSqlQuery (each individual iteration is roughly 100x faster)",
  );
  for (const i of new Array(100)) {
    const sql2 = buildSqlQuery(
      `{ user { posts { title author  } } }`,
      metadata,
    );
  }
  console.timeEnd(
    "Next 100 passes of buildSqlQuery (each individual iteration is roughly 100x faster)",
  );

  assertContains(sql, "SELECT");
}

export function test_1(
  assertContains: (str: string, substring: string) => void,
) {
  console.time("buildSqlQuery");
  const sql = buildSqlQuery(`{posts { title author { name } } }`, metadata);
  console.timeEnd("buildSqlQuery");

  assertContains(sql, `"${aliases.post}"."title"`);
  assertContains(sql, `"${aliases.post_author}"."name"`);
}

export function user(assertContains: (str: string, substring: string) => void) {
  console.time("buildSqlQuery");
  const sql = buildSqlQuery(
    `{ user { posts { title author { name }  } } }`,
    metadata,
  );
  console.timeEnd("buildSqlQuery");

  console.log(sql);

  assertContains(sql, `"${aliases.post}"."title"`);
  assertContains(sql, `"${aliases.post_author}"."name"`);
}
