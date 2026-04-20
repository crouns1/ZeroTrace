import assert from "node:assert/strict";
import test from "node:test";
import { parseQuery } from "./query.js";

test("parseQuery recognizes company filters", () => {
  const parsed = parseQuery("company:mozilla sort:risk");

  assert.equal(parsed.operator, "company");
  assert.equal(parsed.filters.company, "mozilla");
  assert.deepEqual(parsed.recognizedFilters, ["company:mozilla", "sort:risk"]);
});

test("parseQuery recognizes person filters", () => {
  const parsed = parseQuery("person:sundar-pichai limit:3");

  assert.equal(parsed.operator, "person");
  assert.equal(parsed.filters.person, "sundar-pichai");
  assert.equal(parsed.filters.limit, 3);
});
