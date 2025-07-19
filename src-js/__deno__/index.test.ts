const { test } = Deno;
import { expect } from "jsr:@std/expect";
import * as tests from "../__specs__/test-code.js";

function assertContains(string: string, substring: string) {
  expect(string).toEqual(expect.stringMatching(substring));
}

for (const [name, fn] of Object.entries(tests)) {
  test(name, (t) => fn(assertContains));
}
