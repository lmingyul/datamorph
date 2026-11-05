import {
  isLosslessNumber,
  LosslessNumber,
  parse,
  stringify,
} from "lossless-json";
import { js2xml, xml2js } from "xml-js";

import { convertDataFormat, parseDataFormat } from "./dataFormatConverter";
import { cellText, convertToCSV, tableRows } from "./tableExport";

/** 工具栏「JSON 转换」支持的格式。数值全程用 LosslessNumber，避免大整数和小数被舍入。 */
export type JsonBridgeFormat =
  | "csv"
  | "tsv"
  | "xml"
  | "yaml"
  | "toml"
  | "ini"
  | "properties"
  | "markdown"
  | "sql"
  | "pydict";

type Json = unknown;
type JsonObject = Record<string, Json>;

const isObject = (value: Json): value is JsonObject =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  !isLosslessNumber(value);

const NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

/** 文本格式没有类型信息：数字、布尔、null 按字面识别，其余保持字符串（如 007 不会变成 7）。 */
function inferScalar(text: string): Json {
  if (NUMBER.test(text)) return new LosslessNumber(text);
  if (text === "true") return true;
  if (text === "false") return false;
  if (text === "null") return null;
  return text;
}

function scalarText(value: Json): string {
  if (value === null) return "";
  if (isLosslessNumber(value)) return value.value;
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return String(value);
  return stringify(value)!;
}

/** 当前文档可能是 JSON 或 JSON5。 */
function parseJsonInput(text: string): Json {
  try {
    return parseDataFormat(text, "json");
  } catch {
    return parseDataFormat(text, "json5");
  }
}

export function convertToJson(text: string, format: JsonBridgeFormat): string {
  if (format === "yaml" || format === "toml")
    return convertDataFormat(text, format, "json");
  const value = {
    csv: () => parseDelimited(text, ","),
    tsv: () => parseDelimited(text, "\t"),
    xml: () => parseXml(text),
    ini: () => parseIni(text),
    properties: () => parseProperties(text),
    markdown: () => parseMarkdownTable(text),
    sql: () => parseSqlInserts(text),
    pydict: () => parsePythonLiteral(text),
  }[format]();
  return stringify(value, null, 2)!;
}

export function convertFromJson(
  text: string,
  format: JsonBridgeFormat,
): string {
  if (format === "yaml" || format === "toml")
    return convertDataFormat(stringify(parseJsonInput(text))!, "json", format);
  const value = parseJsonInput(text);
  return {
    csv: () => convertToCSV(value),
    tsv: () => toTsv(value),
    xml: () => toXml(value),
    ini: () => toIni(value),
    properties: () => toProperties(value),
    markdown: () => toMarkdownTable(value),
    sql: () => toSqlInserts(value),
    pydict: () => toPython(value, ""),
  }[format]();
}

// ---------- CSV / TSV ----------

function splitDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const source = text.replace(/^﻿/, "");

  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char !== '"') field += char;
      else if (source[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = false;
    } else if (char === '"' && field === "") quoted = true;
    else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i++;
      rows.push([...row, field]);
      row = [];
      field = "";
    } else field += char;
  }
  if (quoted) throw new Error("引号未闭合");
  if (field || row.length) rows.push([...row, field]);
  return rows.filter((cells) => cells.length > 1 || cells[0] !== "");
}

function uniqueHeaders(headers: string[]): string[] {
  const seen = new Map<string, number>();
  return headers.map((header, index) => {
    const name = header.trim() || `column${index + 1}`;
    const count = (seen.get(name) ?? 0) + 1;
    seen.set(name, count);
    return count > 1 ? `${name}_${count}` : name;
  });
}

function parseDelimited(text: string, delimiter: string): Json {
  const [header, ...rows] = splitDelimited(text, delimiter);
  if (!header) throw new Error("没有可转换的数据");
  const keys = uniqueHeaders(header);
  return rows.map((cells) =>
    Object.fromEntries(
      keys.map((key, index) => [key, inferScalar(cells[index] ?? "")]),
    ),
  );
}

function toTsv(value: Json): string {
  return tableRows(value)
    .map((row) =>
      row
        .map((cell) => {
          const text = cellText(cell);
          return /["\t\r\n]/.test(text)
            ? `"${text.replace(/"/g, '""')}"`
            : text;
        })
        .join("\t"),
    )
    .join("\n");
}

// ---------- Markdown 表格 ----------

const MD_SEPARATOR = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

function markdownCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/(?<!\\)\|$/, "")
    .split(/(?<!\\)\|/)
    .map((cell) =>
      cell
        .trim()
        .replace(/\\\|/g, "|")
        .replace(/<br\s*\/?>/gi, "\n"),
    );
}

function parseMarkdownTable(text: string): Json {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex(
    (line, i) => line.includes("|") && MD_SEPARATOR.test(lines[i + 1] ?? ""),
  );
  if (start < 0) throw new Error("未找到 Markdown 表格");
  const keys = uniqueHeaders(markdownCells(lines[start]));
  const rows: Json[] = [];
  for (const line of lines.slice(start + 2)) {
    if (!line.trim() || !line.includes("|")) break;
    const cells = markdownCells(line);
    rows.push(
      Object.fromEntries(
        keys.map((key, index) => [key, inferScalar(cells[index] ?? "")]),
      ),
    );
  }
  return rows;
}

function toMarkdownTable(value: Json): string {
  const [header, ...rows] = tableRows(value);
  const line = (cells: unknown[]) =>
    `| ${cells
      .map((cell) =>
        cellText(cell).replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>"),
      )
      .join(" | ")} |`;
  return [
    line(header),
    `| ${header.map(() => "---").join(" | ")} |`,
    ...rows.map(line),
  ].join("\n");
}

// ---------- XML ----------
// 采用常见约定：属性写作 "@name"，元素同时有属性/子元素和文本时文本写作 "#text"。

function simplifyXml(node: JsonObject): Json {
  const result: JsonObject = {};
  let text = "";
  for (const [key, value] of Object.entries(node)) {
    if (key === "_attributes")
      for (const [name, attr] of Object.entries(value as JsonObject))
        result[`@${name}`] = inferScalar(String(attr));
    else if (key === "_text" || key === "_cdata")
      text += Array.isArray(value) ? value.join("") : String(value);
    else
      result[key] = Array.isArray(value)
        ? value.map((item) => simplifyXml(item as JsonObject))
        : simplifyXml(value as JsonObject);
  }
  if (Object.keys(result).length === 0) return inferScalar(text);
  if (text) result["#text"] = inferScalar(text);
  return result;
}

function parseXml(text: string): Json {
  const doc = xml2js(text, {
    compact: true,
    trim: true,
    ignoreDeclaration: true,
    ignoreInstruction: true,
    ignoreComment: true,
    ignoreDoctype: true,
  }) as JsonObject;
  return simplifyXml(doc);
}

function xmlName(key: string): string {
  const name = key.replace(/[^\w.-]/g, "_") || "_";
  return /^[A-Za-z_]/.test(name) ? name : `_${name}`;
}

function xmlChild(value: Json): Json {
  return Array.isArray(value)
    ? { item: value.map(xmlChild) }
    : xmlElement(value);
}

function xmlElement(value: Json): JsonObject {
  if (!isObject(value))
    return value === null ? {} : { _text: scalarText(value) };
  const node: JsonObject = {};
  for (const [key, item] of Object.entries(value)) {
    if (key.startsWith("@")) {
      const attributes = (node._attributes ??= {}) as JsonObject;
      attributes[xmlName(key.slice(1))] = scalarText(item);
    } else if (key === "#text") node._text = scalarText(item);
    else
      node[xmlName(key)] = Array.isArray(item)
        ? item.map(xmlChild)
        : xmlChild(item);
  }
  return node;
}

function toXml(value: Json): string {
  const keys = isObject(value) ? Object.keys(value) : [];
  // 只有一个键的对象直接作为根元素，否则包一层 <root>
  const root =
    keys.length === 1 &&
    !keys[0].startsWith("@") &&
    !Array.isArray((value as JsonObject)[keys[0]])
      ? { [xmlName(keys[0])]: xmlElement((value as JsonObject)[keys[0]]) }
      : { root: xmlChild(value) };
  return js2xml(
    {
      _declaration: { _attributes: { version: "1.0", encoding: "UTF-8" } },
      ...root,
    },
    { compact: true, spaces: 2 },
  );
}

// ---------- INI ----------

function unquote(text: string): Json {
  if (/^"(?:[^"\\]|\\.)*"$/.test(text)) return JSON.parse(text);
  if (/^'.*'$/.test(text)) return text.slice(1, -1);
  return inferScalar(text);
}

function parseIni(text: string): Json {
  const result: JsonObject = {};
  let section = result;
  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line || line.startsWith(";") || line.startsWith("#")) continue;
    const header = line.match(/^\[(.+)\]$/);
    if (header) {
      section = result;
      for (const part of header[1].trim().split(".")) {
        if (!isObject(section[part])) section[part] = {};
        section = section[part] as JsonObject;
      }
      continue;
    }
    const separator = line.search(/[=:]/);
    if (separator <= 0)
      throw new Error(`第 ${index + 1} 行不是 key=value 格式`);
    const key = line.slice(0, separator).trim();
    const value = unquote(line.slice(separator + 1).trim());
    if (key.endsWith("[]")) {
      const name = key.slice(0, -2);
      section[name] = [
        ...(Array.isArray(section[name]) ? (section[name] as Json[]) : []),
        value,
      ];
    } else section[key] = value;
  }
  return result;
}

function iniValue(value: Json): string {
  if (typeof value !== "string")
    return isObject(value) || Array.isArray(value)
      ? JSON.stringify(stringify(value))
      : scalarText(value) || "null";
  return value !== value.trim() || /[;#="'\r\n]/.test(value) || value === ""
    ? JSON.stringify(value)
    : value;
}

function toIni(value: Json): string {
  if (!isObject(value)) throw new Error("INI 的顶层需要是对象");
  const lines: string[] = [];
  const write = (node: JsonObject, path: string[]) => {
    const entries = Object.entries(node);
    const scalars = entries.filter(([, item]) => !isObject(item));
    if (path.length && (scalars.length || !entries.length)) {
      if (lines.length) lines.push("");
      lines.push(`[${path.join(".")}]`);
    }
    for (const [key, item] of scalars) {
      if (
        Array.isArray(item) &&
        item.every((x) => !isObject(x) && !Array.isArray(x))
      )
        for (const element of item) lines.push(`${key}[]=${iniValue(element)}`);
      else lines.push(`${key}=${iniValue(item)}`);
    }
    for (const [key, item] of entries)
      if (isObject(item)) write(item, [...path, key]);
  };
  write(value, []);
  return lines.join("\n");
}

// ---------- Properties ----------

function unescapeProperties(text: string): string {
  return text.replace(/\\(u[0-9a-fA-F]{4}|.)/g, (_, code: string) => {
    if (code.length === 5)
      return String.fromCharCode(parseInt(code.slice(1), 16));
    return { t: "\t", n: "\n", r: "\r", f: "\f" }[code] ?? code;
  });
}

/** a.b[0].c → ["a", "b", 0, "c"] */
function propertyPath(key: string): (string | number)[] {
  return key
    .split(".")
    .flatMap((part) =>
      [...part.matchAll(/([^[\]]+)|\[(\d+)\]/g)].map((m) =>
        m[2] !== undefined ? Number(m[2]) : m[1],
      ),
    );
}

function parseProperties(text: string): Json {
  const result: JsonObject = {};
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].replace(/^\s+/, "");
    if (!line || line.startsWith("#") || line.startsWith("!")) continue;
    // 行尾奇数个反斜杠表示续行
    while (/(?:^|[^\\])(?:\\\\)*\\$/.test(line) && i + 1 < lines.length)
      line = line.slice(0, -1) + lines[++i].replace(/^\s+/, "");
    const match = line.match(/^((?:\\.|[^\s=:\\])*)\s*[=:]?\s*(.*)$/s)!;
    const key = unescapeProperties(match[1]);
    const value = inferScalar(unescapeProperties(match[2]));
    const path = propertyPath(key);
    let node: Record<string | number, Json> = result;
    path.forEach((segment, index) => {
      if (index === path.length - 1) {
        node[segment] = value;
        return;
      }
      const container = typeof path[index + 1] === "number" ? [] : {};
      node[segment] ??= container;
      if (
        node[segment] === null ||
        typeof node[segment] !== "object" ||
        isLosslessNumber(node[segment])
      )
        throw new Error(`属性 "${key}" 与同名的值冲突，无法组成嵌套结构`);
      node = node[segment] as Record<string | number, Json>;
    });
  }
  return result;
}

function escapeProperties(text: string, isKey: boolean): string {
  const escaped = text
    .replace(/\\/g, "\\\\")
    .replace(/\t/g, "\\t")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\f/g, "\\f");
  return isKey
    ? escaped.replace(/[ =:#!]/g, "\\$&")
    : escaped.replace(/^ /, "\\ ");
}

function toProperties(value: Json): string {
  const lines: string[] = [];
  const walk = (node: Json, key: string) => {
    if (Array.isArray(node) && node.length)
      node.forEach((item, i) => walk(item, `${key}[${i}]`));
    else if (isObject(node) && Object.keys(node).length)
      for (const [name, item] of Object.entries(node))
        walk(item, key ? `${key}.${name}` : name);
    else if (!key) throw new Error("Properties 的顶层需要是对象");
    else
      lines.push(
        `${escapeProperties(key, true)}=${escapeProperties(
          Array.isArray(node) ? "[]" : isObject(node) ? "{}" : scalarText(node),
          false,
        )}`,
      );
  };
  walk(value, "");
  return lines.join("\n");
}

// ---------- SQL INSERT ----------

const SQL_TABLE = "table_name";

function sqlIdentifier(name: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name)
    ? name
    : `\`${name.replace(/`/g, "``")}\``;
}

function sqlLiteral(value: Json): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (isLosslessNumber(value)) return value.value;
  const text = typeof value === "string" ? value : stringify(value)!;
  return `'${text.replace(/'/g, "''")}'`;
}

function toSqlInserts(value: Json): string {
  const rows = isObject(value)
    ? [value]
    : Array.isArray(value) && value.length && value.every(isObject)
      ? value
      : null;
  if (!rows) throw new Error("SQL INSERT 需要对象或对象数组");
  const columns = [...new Set(rows.flatMap(Object.keys))];
  return `INSERT INTO ${SQL_TABLE} (${columns.map(sqlIdentifier).join(", ")}) VALUES\n${rows
    .map(
      (row) =>
        `  (${columns.map((column) => sqlLiteral(row[column])).join(", ")})`,
    )
    .join(",\n")};`;
}

type SqlToken = {
  type: "word" | "string" | "ident" | "number" | "punct";
  text: string;
};

function sqlTokens(text: string): SqlToken[] {
  const tokens: SqlToken[] = [];
  const pattern =
    /\s+|--[^\n]*|\/\*[\s\S]*?\*\/|'((?:[^'\\]|''|\\.)*)'|`((?:[^`]|``)*)`|"((?:[^"]|"")*)"|\[([^\]]*)\]|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|([A-Za-z_][\w$.]*)|([(),;])|(.)/gy;
  for (const m of text.matchAll(pattern)) {
    if (m[1] !== undefined)
      tokens.push({
        type: "string",
        text: m[1]
          .replace(/''/g, "'")
          .replace(
            /\\(.)/g,
            (_, c: string) =>
              ({ n: "\n", t: "\t", r: "\r", "0": "\0" })[c] ?? c,
          ),
      });
    else if (m[2] !== undefined)
      tokens.push({ type: "ident", text: m[2].replace(/``/g, "`") });
    else if (m[3] !== undefined)
      tokens.push({ type: "ident", text: m[3].replace(/""/g, '"') });
    else if (m[4] !== undefined) tokens.push({ type: "ident", text: m[4] });
    else if (m[5] !== undefined) tokens.push({ type: "number", text: m[5] });
    else if (m[6] !== undefined) tokens.push({ type: "word", text: m[6] });
    else if (m[7] !== undefined) tokens.push({ type: "punct", text: m[7] });
    else if (m[8] !== undefined) tokens.push({ type: "punct", text: m[8] });
  }
  return tokens;
}

function parseSqlInserts(text: string): Json {
  const tokens = sqlTokens(text);
  const tables = new Map<string, JsonObject[]>();
  let i = 0;
  const peek = (offset = 0) => tokens[i + offset];
  const isWord = (token: SqlToken | undefined, word: string) =>
    token?.type === "word" && token.text.toUpperCase() === word;
  const expect = (punct: string) => {
    if (peek()?.text !== punct)
      throw new Error(`SQL 语法错误：缺少 "${punct}"`);
    i++;
  };
  const list = <T>(item: () => T): T[] => {
    expect("(");
    const items: T[] = [];
    while (peek() && peek().text !== ")") {
      items.push(item());
      if (peek()?.text === ",") i++;
    }
    expect(")");
    return items;
  };
  const sqlValue = (): Json => {
    const token = tokens[i++];
    if (!token) throw new Error("SQL 语法错误：VALUES 不完整");
    if (token.type === "string") return token.text;
    if (token.type === "number") return new LosslessNumber(token.text);
    const word = token.text.toUpperCase();
    if (word === "NULL") return null;
    if (word === "TRUE" || word === "FALSE") return word === "TRUE";
    return token.text;
  };

  while (i < tokens.length) {
    if (!(isWord(peek(), "INSERT") && isWord(peek(1), "INTO"))) {
      i++;
      continue;
    }
    i += 2;
    const table = tokens[i++]?.text ?? SQL_TABLE;
    const columns = peek()?.text === "(" ? list(() => tokens[i++].text) : null;
    if (!isWord(peek(), "VALUES") && !isWord(peek(), "VALUE"))
      throw new Error("只支持 INSERT ... VALUES 语句");
    i++;
    const rows = tables.get(table) ?? [];
    do {
      if (peek()?.text === ",") i++;
      const values = list(sqlValue);
      const keys = columns ?? values.map((_, index) => `column${index + 1}`);
      rows.push(
        Object.fromEntries(
          keys.map((key, index) => [key, values[index] ?? null]),
        ),
      );
    } while (peek()?.text === ",");
    tables.set(table, rows);
  }
  if (!tables.size) throw new Error("未找到 INSERT 语句");
  return tables.size === 1
    ? [...tables.values()][0]
    : Object.fromEntries(tables);
}

// ---------- Python 字典 ----------

function decodePythonString(body: string, raw: boolean): string {
  if (raw) return body;
  return body.replace(
    /\\(x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}|[0-7]{1,3}|\r?\n|.)/g,
    (_, code: string) => {
      if (/^[xuU]/.test(code))
        return String.fromCodePoint(parseInt(code.slice(1), 16));
      if (/^[0-7]/.test(code)) return String.fromCodePoint(parseInt(code, 8));
      if (code.endsWith("\n")) return "";
      return (
        { n: "\n", t: "\t", r: "\r", b: "\b", f: "\f", a: "\x07", v: "\v" }[
          code
        ] ?? code
      );
    },
  );
}

/** 把 Python 字面量逐个记号翻译成 JSON 文本，再交给无损解析。 */
function parsePythonLiteral(text: string): Json {
  const pattern =
    /\s+|#[^\n]*|([rRuUbB]{0,2})('''[\s\S]*?'''|"""[\s\S]*?"""|'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*")|([+-]?(?:0[xX][\da-fA-F_]+|(?:\d[\d_]*)?\.?\d[\d_]*(?:[eE][+-]?\d+)?\.?))|([A-Za-z_]\w*)|([{}[\](),:])|(.)/gy;
  const parts: { json: string; key?: boolean }[] = [];
  for (const m of text.matchAll(pattern)) {
    if (m[2] !== undefined) {
      const quote = m[2].startsWith("'''") || m[2].startsWith('"""') ? 3 : 1;
      parts.push({
        json: JSON.stringify(
          decodePythonString(m[2].slice(quote, -quote), /r/i.test(m[1])),
        ),
      });
    } else if (m[3] !== undefined) {
      let number = m[3].replace(/_/g, "").replace(/^\+/, "");
      if (/^-?0x/i.test(number))
        number = (
          number.startsWith("-") ? -BigInt(number.slice(1)) : BigInt(number)
        ).toString();
      number = number.replace(/^(-?)\./, "$10.").replace(/\.(?=[eE]|$)/, ".0");
      parts.push({ json: number, key: true });
    } else if (m[4] !== undefined) {
      const word = { True: "true", False: "false", None: "null" }[m[4]];
      if (!word) throw new Error(`不支持的 Python 表达式：${m[4]}`);
      parts.push({ json: word, key: true });
    } else if (m[5] !== undefined)
      parts.push({ json: m[5] === "(" ? "[" : m[5] === ")" ? "]" : m[5] });
    else if (m[6] !== undefined) throw new Error(`无法识别的字符：${m[6]}`);
  }
  const json = parts
    .map((part, index) => {
      const next = parts[index + 1]?.json;
      if (part.json === "," && /^[}\]]$/.test(next ?? "")) return "";
      // Python 字典键可以是数字/True/None，JSON 只接受字符串键
      if (part.key && next === ":") return JSON.stringify(part.json);
      return part.json;
    })
    .join("");
  try {
    return parse(json);
  } catch {
    throw new Error("不是有效的 Python 字典或列表字面量");
  }
}

function pythonString(text: string): string {
  return `'${text
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t")
    .replace(
      /[\x00-\x1f\x7f]/g,
      (c) => `\\x${c.charCodeAt(0).toString(16).padStart(2, "0")}`,
    )}'`;
}

function toPython(value: Json, indent: string): string {
  if (value === null) return "None";
  if (typeof value === "boolean") return value ? "True" : "False";
  if (isLosslessNumber(value)) return value.value;
  if (typeof value === "string") return pythonString(value);
  const inner = indent + "    ";
  if (Array.isArray(value))
    return value.length
      ? `[\n${value.map((item) => inner + toPython(item, inner)).join(",\n")}\n${indent}]`
      : "[]";
  const entries = Object.entries(value as JsonObject);
  return entries.length
    ? `{\n${entries
        .map(
          ([key, item]) =>
            `${inner}${pythonString(key)}: ${toPython(item, inner)}`,
        )
        .join(",\n")}\n${indent}}`
    : "{}";
}
