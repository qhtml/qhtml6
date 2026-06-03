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
assert(parser && typeof parser.parseQHtmlToQDom === 'function', 'parser failed to load');

const source = `
q-context { object1 object2.somechild; thirdcomponent }
q-context { 11111111-2222-3333-4444-555555555555 }

q-component ctx-target {
  q-context { this.component object1 }
  div { text { ok } }
}
`;

const doc = parser.parseQHtmlToQDom(source);
const rootContext = doc.nodes.find(function findRootContext(node) {
  return node && String(node.kind || '').toLowerCase() === 'q-context';
});
assert(rootContext, 'top-level q-context node missing');
assert(rootContext.sources.join('|') === 'object1|object2.somechild|thirdcomponent', 'top-level q-context sources were not parsed');

const uuidContext = doc.nodes.filter(function findContextNodes(node) {
  return node && String(node.kind || '').toLowerCase() === 'q-context';
})[1];
assert(uuidContext, 'uuid q-context node missing');
assert(
  uuidContext.sources.join('|') === '11111111-2222-3333-4444-555555555555',
  'uuid q-context source was not parsed'
);

const component = doc.nodes.find(function findComponent(node) {
  return node && node.kind === 'component' && node.componentId === 'ctx-target';
});
assert(component, 'component node missing');
assert(
  component.meta &&
    Array.isArray(component.meta.__qhtmlContextDeclarations) &&
    component.meta.__qhtmlContextDeclarations.length === 1,
  'component-local q-context declaration missing'
);
assert(
  component.meta.__qhtmlContextDeclarations[0].sources.join('|') === 'this.component|object1',
  'component-local q-context sources were not parsed'
);
assert(
  !component.templateNodes.some(function hasRenderedContextNode(node) {
    return node && String(node.kind || '').toLowerCase() === 'q-context';
  }),
  'component-local q-context should not render as template content'
);

console.log('q-context parser smoke ok');
