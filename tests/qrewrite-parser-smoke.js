const fs = require('fs');
const vm = require('vm');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function loadModuleScript(context, filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  vm.runInNewContext(source, context, { filename: filePath });
}

function walkNodes(nodes, visitor) {
  const list = Array.isArray(nodes) ? nodes : [];
  for (let i = 0; i < list.length; i += 1) {
    const node = list[i];
    visitor(node);
    if (!node || typeof node !== 'object') {
      continue;
    }
    if (Array.isArray(node.nodes)) {
      walkNodes(node.nodes, visitor);
    }
    if (Array.isArray(node.templateNodes)) {
      walkNodes(node.templateNodes, visitor);
    }
    if (Array.isArray(node.children)) {
      walkNodes(node.children, visitor);
    }
    if (Array.isArray(node.slots)) {
      walkNodes(node.slots, visitor);
    }
  }
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

const qdomCorePath = '/home/mike/build/test/modules/qdom-core/src/qdom-core.js';
const parserPath = '/home/mike/build/test/modules/qhtml-parser/src/qhtml-parser.js';
loadModuleScript(context, qdomCorePath);
loadModuleScript(context, parserPath);

const parser = context.QHtmlModules && context.QHtmlModules.qhtmlParser;
assert(parser && typeof parser.parseQHtmlToQDom === 'function', 'qhtml parser module failed to load');

const source = `
q-rewrite my-transformer {
  slot { main-slot }
  return {
    q-script { return this.qdom().slot("main-slot").replace(/this\\./g, "this.qdom().") }
  }
}

q-rewrite q-dom {
  my-transformer { slot { main-slot } }
}

div {
  id: "rewrite-target"
  text {
    q-dom { this.find("my-component") }
  }
}
`;

const doc = parser.parseQHtmlToQDom(source, {});
assert(doc && doc.kind === 'document', 'parseQHtmlToQDom did not return a document');
assert(doc.meta && typeof doc.meta.rewrittenSource === 'string', 'rewrittenSource metadata missing');
assert(doc.meta.rewrittenSource.indexOf('q-rewrite') === -1, 'q-rewrite definitions were not stripped before parse');
assert(
  doc.meta.rewrittenSource.includes('this.qdom().find("my-component")'),
  'q-rewrite invocation did not expand to qdom access before q-script parsing'
);

let targetNode = null;
walkNodes(doc.nodes, (node) => {
  if (
    !targetNode &&
    node &&
    node.kind === 'element' &&
    node.attributes &&
    node.attributes.id === 'rewrite-target'
  ) {
    targetNode = node;
  }
});

assert(targetNode, 'rewrite target element not found in parsed qdom');
const renderedText = (Array.isArray(targetNode.children) ? targetNode.children : [])
  .filter((child) => child && child.kind === 'text')
  .map((child) => String(child.value || ''))
  .join(' ')
  .replace(/\s+/g, ' ')
  .trim();

assert(
  renderedText.includes('this.qdom().find("my-component")'),
  'rewrite output text did not contain transformed qdom call'
);

console.log('qrewrite parser smoke ok');
