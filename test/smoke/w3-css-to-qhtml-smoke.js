const fs = require("fs");
const path = require("path");
const vm = require("vm");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const context = { console, TextEncoder, TextDecoder, Buffer };
context.globalThis = context;
context.window = context;
vm.createContext(context);

for (const file of ["src/modules/qdom-core/src/qdom-core.js", "src/modules/qhtml-parser/src/qhtml-parser.js"]) {
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, "..", "..", file), "utf8"), context, {
    filename: file,
  });
}

const parser = context.QHtmlModules && context.QHtmlModules.qhtmlParser;
assert(parser && typeof parser.parseQHtmlToQDom === "function", "parser failed to load");

const generated = fs.readFileSync(path.resolve(__dirname, "..", "..", "dist/w3.qhtml"), "utf8");
assert(generated.includes("q-theme w3-css"), "generated file is missing q-theme w3-css");
assert(
  generated.includes(".w3-table th:first-child,.w3-table td:first-child,.w3-table-all th:first-child,.w3-table-all td:first-child"),
  "generated file did not preserve grouped table selector"
);
assert(generated.includes("padding-left: 16px"), "generated file did not preserve padding-left declaration");

const baseFile = path.resolve(__dirname, "..", "..", "index.html");
const doc = parser.parseQHtmlToQDom(
  [
    "q-import { dist/w3.qhtml }",
    "w3-css {",
    "  div.w3-container { text { themed } }",
    "  table.w3-table { tr { th { text { heading } } } }",
    "}",
  ].join("\n"),
  {
    importBaseUrl: baseFile,
    loadImportSync(importPath, baseInfo) {
      const baseUrl =
        typeof baseInfo === "string"
          ? baseInfo
          : String((baseInfo && (baseInfo.baseUrl || baseInfo.importBaseUrl || baseInfo.url)) || baseFile);
      return fs.readFileSync(path.resolve(path.dirname(baseUrl), importPath), "utf8");
    },
  }
);

const themedDiv = doc.nodes.find((node) => node && node.tagName === "div");
assert(themedDiv, "themed div was not parsed");
const runtimeRules =
  themedDiv.meta &&
  themedDiv.meta.qRuntimeThemeRules &&
  Array.isArray(themedDiv.meta.qRuntimeThemeRules.rules)
    ? themedDiv.meta.qRuntimeThemeRules.rules
    : [];

assert(runtimeRules.length > 300, "expected W3 runtime q-theme rules to be attached");
assert(
  runtimeRules.some((rule) => String(rule.selector || "").includes(".w3-container")),
  "runtime rules did not include .w3-container"
);
assert(
  runtimeRules.some((rule) => String(rule.selector || "").includes(".w3-table th:first-child")),
  "runtime rules did not preserve complex table selector"
);

console.log("w3-css-to-qhtml smoke ok");
