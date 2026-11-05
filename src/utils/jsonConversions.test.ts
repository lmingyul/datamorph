import assert from "node:assert/strict";
import test from "node:test";

import {
  convertFromJson,
  convertToJson,
  type JsonBridgeFormat,
} from "./jsonConversions";
import { executeConversion } from "../workers/conversion";

const big = "9007199254740993123";
const json = (text: string) => JSON.parse(text);

test("every bridge format round-trips a flat record list losslessly", () => {
  const source = `[{"id":${big},"name":"a,\\"b\\"","ok":true,"note":null},{"id":2,"name":"line\\nbreak","ok":false,"note":"x|y"}]`;
  for (const format of [
    "csv",
    "tsv",
    "markdown",
    "sql",
    "pydict",
    "yaml",
  ] as JsonBridgeFormat[]) {
    const back = convertToJson(convertFromJson(source, format), format);
    assert.ok(back.includes(big), `${format} keeps big integer`);
    const rows = json(back);
    assert.equal(rows[0].name, 'a,"b"', format);
    assert.equal(rows[1].name, "line\nbreak", format);
    assert.equal(rows[1].note, "x|y", format);
    assert.equal(rows[0].ok, true, format);
  }
});

test("text formats keep zero-padded values as strings", () => {
  assert.deepEqual(json(convertToJson("code,n\n007,1.50\n", "csv")), [
    { code: "007", n: 1.5 },
  ]);
  assert.match(convertToJson("code,n\n007,1.50\n", "csv"), /1\.50/);
});

test("nested objects round-trip through INI, Properties and XML", () => {
  const source = `{"app":{"name":"demo","port":8080,"tags":["a","b"]},"db":{"url":"x=y; z"}}`;
  for (const format of ["ini", "properties"] as JsonBridgeFormat[])
    assert.deepEqual(
      json(convertToJson(convertFromJson(source, format), format)),
      json(source),
      format,
    );
  assert.equal(
    convertFromJson(source, "properties"),
    "app.name=demo\napp.port=8080\napp.tags[0]=a\napp.tags[1]=b\ndb.url=x=y; z",
  );

  const xml = convertFromJson(
    `{"user":{"@id":7,"name":"Tom","#text":""}}`,
    "xml",
  );
  assert.match(xml, /<user id="7">/);
  assert.deepEqual(json(convertToJson(xml, "xml")), {
    user: { "@id": 7, name: "Tom" },
  });
});

test("SQL INSERT parsing handles quoting, NULL and multiple rows", () => {
  const sql = `INSERT INTO \`users\` (id, name, active) VALUES (1, 'O''Brien', TRUE), (2, NULL, FALSE);`;
  assert.deepEqual(json(convertToJson(sql, "sql")), [
    { id: 1, name: "O'Brien", active: true },
    { id: 2, name: null, active: false },
  ]);
});

test("Python literals accept tuples, trailing commas and non-string keys", () => {
  assert.deepEqual(
    json(
      convertToJson(
        "{'a': (1, 2,), 1: None, True: 'x\\'y', 'f': 1.}",
        "pydict",
      ),
    ),
    { a: [1, 2], "1": null, true: "x'y", f: 1.0 },
  );
  assert.throws(() => convertToJson("{'a': len(x)}", "pydict"), /不支持/);
});

test("invalid inputs report readable errors", () => {
  assert.throws(() => convertFromJson("[1,2]", "ini"), /INI/);
  assert.throws(() => convertFromJson("[1,2]", "sql"), /SQL/);
  assert.throws(() => convertToJson("no table here", "markdown"), /Markdown/);
});

test("quicktype generates code for all 15 toolbar languages", async () => {
  for (const language of [
    "python",
    "java",
    "csharp",
    "cjson",
    "c++",
    "go",
    "rust",
    "swift",
    "kotlin",
    "scala3",
    "dart",
    "ruby",
    "javascript",
    "typescript",
    "php",
  ]) {
    const { content } = await executeConversion({
      action: "type",
      content: `{"userName":"a","age":3,"tags":["x"]}`,
      language,
      name: "Root",
    });
    assert.match(content, /Root/, language);
  }
});
