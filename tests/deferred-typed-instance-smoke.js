const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const context = { console };
context.globalThis = context;
context.window = context;
vm.createContext(context);

function loadModule(relpath) {
  vm.runInContext(fs.readFileSync(path.join(root, relpath), "utf8"), context, {
    filename: relpath
  });
}

loadModule("modules/qdom-core/src/qdom-core.js");
loadModule("modules/qhtml-parser/src/qhtml-parser.js");

const parser = context.QHtmlModules.qhtmlParser;
const componentDoc = parser.parseQHtmlToQDom([
  "q-component sample-card {",
  "  q-property-animation myanim {",
  "    target: \"this.component.style.height\"",
  "  }",
  "}",
  "",
  "sample-card { }"
].join("\n"));

const deferredNode = componentDoc.nodes[0].templateNodes[0];
if (!deferredNode || deferredNode.tagName !== "q-property-animation") {
  throw new Error("Expected q-property-animation template node to remain in the q-component definition.");
}
if (!deferredNode.meta || deferredNode.meta.__qhtmlInstanceAlias !== "myanim") {
  throw new Error("Expected named typed alias metadata to be preserved.");
}
if (deferredNode.meta.__qhtmlDeferredTypedInstance !== true) {
  throw new Error("Expected unknown typed instance to be marked deferred inside q-component definition.");
}

let topLevelThrew = false;
try {
  parser.parseQHtmlToQDom([
    "q-property-animation myanim {",
    "  target: \"this.component.style.height\"",
    "}"
  ].join("\n"));
} catch (error) {
  topLevelThrew = String(error && error.message ? error.message : error).indexOf("known instantiable") >= 0;
}

if (!topLevelThrew) {
  throw new Error("Expected top-level unknown typed instance syntax to remain a parse-time error.");
}

console.log("deferred typed instance smoke passed");
