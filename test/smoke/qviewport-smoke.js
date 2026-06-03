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
q-viewport myviewport {
  minWidth: 75vw
  minHeight: 500px
  x: vv.pageLeft
  y: vv.pageTop
  width: vv.width
  height: vv.height
  scale: vv.scale
  offsetLeft: vv.offsetLeft
  offsetTop: vv.offsetTop
  right: vv.pageLeft + vv.width
  bottom: vv.pageTop + vv.height
  type: "visualViewport"
}

myviewport {
  div,span { text { hello world } }
}
`;

const doc = parser.parseQHtmlToQDom(source);
const viewportDef = doc.nodes.find(function findViewportDef(node) {
  return node && node.kind === core.NODE_TYPES.viewport && node.viewportId === 'myviewport';
});
assert(viewportDef, 'q-viewport definition was not converted to a QViewport node');
assert(viewportDef.constraints.minWidth === '75vw', 'minWidth constraint was not captured');
assert(viewportDef.constraints.minHeight === '500px', 'minHeight constraint was not captured');
assert(viewportDef.constraints.x === 'vv.pageLeft', 'visualViewport x expression was not captured');
assert(viewportDef.constraints.y === 'vv.pageTop', 'visualViewport y expression was not captured');
assert(viewportDef.constraints.width === 'vv.width', 'visualViewport width expression was not captured');
assert(viewportDef.constraints.height === 'vv.height', 'visualViewport height expression was not captured');
assert(viewportDef.constraints.scale === 'vv.scale', 'visualViewport scale expression was not captured');
assert(viewportDef.constraints.offsetLeft === 'vv.offsetLeft', 'visualViewport offsetLeft expression was not captured');
assert(viewportDef.constraints.offsetTop === 'vv.offsetTop', 'visualViewport offsetTop expression was not captured');
assert(viewportDef.constraints.right === 'vv.pageLeft + vv.width', 'visualViewport right expression was not captured');
assert(viewportDef.constraints.bottom === 'vv.pageTop + vv.height', 'visualViewport bottom expression was not captured');
assert(viewportDef.constraints.type === 'visualViewport', 'visualViewport type literal was not captured');

const viewportInstance = doc.nodes.find(function findViewportInstance(node) {
  return node && node.kind === core.NODE_TYPES.viewportInstance && node.viewportId === 'myviewport';
});
assert(viewportInstance, 'q-viewport invocation was not converted to a QViewportInstance node');
assert(viewportInstance.constraints.minWidth === '75vw', 'viewport instance did not inherit minWidth');
assert(viewportInstance.constraints.minHeight === '500px', 'viewport instance did not inherit minHeight');
assert(Array.isArray(viewportInstance.children) && viewportInstance.children.length === 1, 'viewport instance children missing');
assert(
  viewportInstance.children[0].kind === core.NODE_TYPES.element && viewportInstance.children[0].tagName === 'div',
  'viewport child div missing'
);
assert(
  viewportInstance.children[0].children[0] &&
    viewportInstance.children[0].children[0].kind === core.NODE_TYPES.element &&
    viewportInstance.children[0].children[0].tagName === 'span',
  'viewport child span missing'
);

const serialized = parser.qdomToQHtml(doc, { preserveOriginal: false });
assert(serialized.includes('q-viewport myviewport'), 'q-viewport definition did not serialize');
assert(serialized.includes('myviewport {'), 'q-viewport invocation did not serialize');

console.log('q-viewport smoke ok');
