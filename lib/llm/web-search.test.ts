import test from "node:test";
import assert from "node:assert/strict";
import { extractJsonObject, webSearchEnabled } from "./web-search.ts";

test("extractJsonObject strips preamble and fences", () => {
  assert.equal(extractJsonObject('Here you go:\n{"a":1}\nDone'), '{"a":1}');
  assert.equal(extractJsonObject('```json\n{"a":2}\n```'), '{"a":2}');
  assert.equal(extractJsonObject('{"a":3}'), '{"a":3}');
});

test("web search is on unless LLM_WEB_SEARCH=0", () => {
  const prev = process.env.LLM_WEB_SEARCH;
  delete process.env.LLM_WEB_SEARCH;
  assert.equal(webSearchEnabled(), true);
  process.env.LLM_WEB_SEARCH = "0";
  assert.equal(webSearchEnabled(), false);
  if (prev === undefined) delete process.env.LLM_WEB_SEARCH; else process.env.LLM_WEB_SEARCH = prev;
});
