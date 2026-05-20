const fs = require('fs');
const path = require('path');
const vm = require('vm');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function loadModule(context, relpath) {
  const source = fs.readFileSync(path.join(__dirname, '..', relpath), 'utf8');
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

loadModule(context, 'modules/qdom-core/src/qdom-core.js');
loadModule(context, 'modules/qhtml-parser/src/qhtml-parser.js');

const parser = context.QHtmlModules && context.QHtmlModules.qhtmlParser;
assert(parser && typeof parser.parseQHtmlToQDom === 'function', 'parser failed to load');

const source = `
q-style body-panel {
  backgroundColor: #e2e8f0
  padding: 0.5rem
  borderRadius: 0.4rem
}

q-theme article-theme {
  h3 { q-style { color: #1d4ed8 } }
  .summary { q-style { color: #334155 } body-panel }
}

article-theme {
  div {
    h3 { text { Theme heading } }
    p.summary { text { Summary } }
  }
}
`;

const doc = parser.parseQHtmlToQDom(source);
const root = doc.nodes[0];
assert(root && root.tagName === 'div', 'theme invocation did not render div root');
const title = root.children[0];
const summary = root.children[1];
assert(String(title.attributes.style || '').indexOf('color: #1d4ed8') >= 0, 'anonymous h3 q-style did not apply');
const summaryStyle = String(summary.attributes.style || '');
assert(summaryStyle.indexOf('color: #334155') >= 0, 'anonymous summary q-style did not apply');
assert(summaryStyle.indexOf('background-color: #e2e8f0') >= 0, 'named style after anonymous style did not apply');
assert(
  root.meta &&
    root.meta.qRuntimeThemeRules &&
    Array.isArray(root.meta.qRuntimeThemeRules.rules) &&
    root.meta.qRuntimeThemeRules.rules.length === 2,
  'runtime theme rules were not generated from anonymous q-style rules'
);

console.log('anonymous theme style smoke ok');
