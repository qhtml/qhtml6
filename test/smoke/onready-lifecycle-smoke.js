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
q-component ready-probe {
  q-logger { q-component q-signal function }
  q-property message: "ready-ok"
  div#ready-output { text { waiting } }
  onReady {
    setReadyText(message)
  }
  function setReadyText(value) {
    this.component.setAttribute("data-ready", value)
  }
}

ready-probe probe { }
`;

const doc = parser.parseQHtmlToQDom(source);
const component = doc.nodes.find(function findComponent(node) {
  return node && node.kind === 'component' && node.componentId === 'ready-probe';
});

assert(component, 'component node missing');
assert(
  component.meta &&
    Array.isArray(component.meta.__qhtmlLoggerCategories) &&
    component.meta.__qhtmlLoggerCategories.join('|') === 'q-component|q-signal|function',
  'q-logger categories were not parsed on component'
);
assert(
  Array.isArray(component.lifecycleScripts) && component.lifecycleScripts.length === 1,
  'component onReady lifecycle script missing'
);
assert(
  String(component.lifecycleScripts[0].name || '').toLowerCase() === 'onready',
  'component lifecycle script is not onReady'
);
assert(
  String(component.lifecycleScripts[0].body || '').indexOf('setReadyText(message)') !== -1,
  'component onReady lifecycle body missing scoped function call'
);
assert(
  component.templateNodes.some(function hasRenderedDiv(node) {
    return node && node.kind === 'element' && node.tagName === 'div';
  }),
  'component template content missing'
);

console.log('onReady lifecycle parser smoke ok');
