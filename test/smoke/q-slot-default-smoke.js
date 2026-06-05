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
q-component notice-card {
  q-slot { body }
  q-slot-default body {
    span.default-marker { text { Default body } }
  }

  div.result {
    slot { body }
  }
}

q-template notice-template {
  slot-default body {
    span.template-default { text { Template default } }
  }
  slot { body }
}

notice-card missingDefault { }
notice-card explicitEmpty { body { } }
notice-card explicitContent { body { span.explicit-marker { text { Explicit body } } } }
`;

const doc = parser.parseQHtmlToQDom(source);

const noticeCard = doc.nodes.find(function findNoticeCard(node) {
  return node && node.kind === 'component' && node.componentId === 'notice-card';
});
assert(noticeCard, 'notice-card definition missing');
assert(Array.isArray(noticeCard.slotDefaults), 'notice-card slotDefaults missing');
assert(noticeCard.slotDefaults.length === 1, 'notice-card should have one slot default');
assert(noticeCard.slotDefaults[0].kind === 'slot-default', 'notice-card slot default has wrong kind');
assert(noticeCard.slotDefaults[0].name === 'body', 'notice-card slot default has wrong name');
assert(noticeCard.slotDefaults[0].children.length === 1, 'notice-card slot default children missing');

const noticeTemplate = doc.nodes.find(function findNoticeTemplate(node) {
  return node && node.kind === 'component' && node.componentId === 'notice-template';
});
assert(noticeTemplate, 'notice-template definition missing');
assert(noticeTemplate.definitionType === 'template', 'notice-template should be a template definition');
assert(noticeTemplate.slotDefaults.length === 1, 'template slot-default alias was not captured');
assert(noticeTemplate.slotDefaults[0].name === 'body', 'template slot-default alias has wrong name');

const missingDefault = doc.nodes.find(function findMissingDefault(node) {
  return node && node.kind === 'component-instance' && node.meta && node.meta.__qhtmlInstanceAlias === 'missingDefault';
});
assert(missingDefault, 'missingDefault instance missing');
assert(Array.isArray(missingDefault.slots) && missingDefault.slots.length === 0, 'omitted slot should not create an explicit slot');

const explicitEmpty = doc.nodes.find(function findExplicitEmpty(node) {
  return node && node.kind === 'component-instance' && node.meta && node.meta.__qhtmlInstanceAlias === 'explicitEmpty';
});
assert(explicitEmpty, 'explicitEmpty instance missing');
assert(explicitEmpty.slots.length === 1, 'explicit empty slot should be recorded');
assert(explicitEmpty.slots[0].name === 'body', 'explicit empty slot has wrong name');
assert(explicitEmpty.slots[0].children.length === 0, 'explicit empty slot should have zero children');

const explicitContent = doc.nodes.find(function findExplicitContent(node) {
  return node && node.kind === 'component-instance' && node.meta && node.meta.__qhtmlInstanceAlias === 'explicitContent';
});
assert(explicitContent, 'explicitContent instance missing');
assert(explicitContent.slots.length === 1, 'explicit content slot should be recorded');
assert(explicitContent.slots[0].children.length === 1, 'explicit content slot should keep children');

console.log('q-slot-default smoke ok');
