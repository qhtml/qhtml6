const fs = require('fs');
const path = require('path');
const vm = require('vm');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function loadModule(context, relpath) {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', relpath), 'utf8');
  vm.runInNewContext(source, context, { filename: relpath });
}

const context = {
  globalThis: null,
  window: null,
  console,
  TextEncoder,
  TextDecoder,
  Buffer,
};
context.globalThis = context;
context.window = context;

loadModule(context, 'src/modules/qdom-core/src/qdom-core.js');
loadModule(context, 'src/modules/qhtml-parser/src/qhtml-parser.js');

const parser = context.QHtmlModules && context.QHtmlModules.qhtmlParser;
const core = context.QHtmlModules && context.QHtmlModules.qdomCore;
assert(parser && typeof parser.parseQHtmlToQDom === 'function', 'parser failed to load');

const source = `
q-struct mystruct {
  myvar { otherstruct.var }
  othervar { 25 }
  thirdvar { "hello world" }
  fn { function() { return 2 } }
}

div {
  mystruct struct1 { thirdvar { "goodbye world" } }
  text { \${struct1.othervar} \${struct1.thirdvar} \${struct1.fn()} }
}
`;

const doc = parser.parseQHtmlToQDom(source);
const structDef = doc.nodes.find(function findStructDef(node) {
  return node && node.kind === core.NODE_TYPES.struct && node.structId === 'mystruct';
});
assert(structDef, 'q-struct definition was not converted to a QStruct node');
assert(structDef.fields.length === 4, 'q-struct fields were not captured');
assert(structDef.fields[0].kind === 'binding', 'dot path field should be a binding');
assert(structDef.fields[1].value === 25, 'numeric field should be captured as a number');
assert(structDef.fields[2].value === 'hello world', 'quoted field should be captured as a string');
assert(structDef.fields[3].kind === 'function', 'function field should be captured');

const divNode = doc.nodes.find(function findDiv(node) {
  return node && node.kind === core.NODE_TYPES.element && node.tagName === 'div';
});
assert(divNode, 'div node missing');
const structInstance = divNode.children.find(function findStructInstance(node) {
  return node && node.kind === core.NODE_TYPES.structInstance && node.structId === 'mystruct';
});
assert(structInstance, 'q-struct typed instance was not converted to QStructInstance');
assert(
  structInstance.meta && structInstance.meta.__qhtmlInstanceAlias === 'struct1',
  'q-struct instance alias was not preserved'
);
assert(structInstance.fields.length === 1, 'q-struct instance overrides were not captured');
assert(structInstance.fields[0].value === 'goodbye world', 'q-struct override value was not captured');

console.log('q-struct smoke ok');
