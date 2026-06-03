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
q-component mycomp {
  q-layout {
    q-row {
      q-col {
        slot { duh }
      }
    }
  }
}

mycomp {
  duh { text { hello world } }
}
`;

const doc = parser.parseQHtmlToQDom(source);
const instance = doc.nodes.find(function findMyCompInstance(node) {
  return node && node.kind === 'component-instance' && node.componentId === 'mycomp';
});

assert(instance, 'component instance was not normalized');
assert(Array.isArray(instance.slots) && instance.slots.length === 1, 'layout-descendant slot fill was not collected');
assert(instance.slots[0].name === 'duh', 'layout-descendant named slot was not recognized');
assert(instance.slots[0].children.length === 1, 'named slot fill should contain one projected child');
assert(instance.slots[0].children[0].kind === 'text', 'single-slot shorthand wrapper should be unwrapped');
assert(
  String(instance.slots[0].children[0].value || '').indexOf('hello world') >= 0,
  'named slot fill text was not preserved'
);

console.log('layout slot context smoke ok');
