const fs = require('fs');
const vm = require('vm');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

class NodeBase {
  constructor(nodeType) {
    this.nodeType = nodeType;
    this.parentNode = null;
    this.ownerDocument = null;
    this.childNodes = [];
  }

  appendChild(node) {
    if (!node) return null;
    if (node.nodeType === 11) {
      while (node.childNodes.length > 0) {
        this.appendChild(node.childNodes.shift());
      }
      return node;
    }
    node.parentNode = this;
    node.ownerDocument = this.ownerDocument || this;
    this.childNodes.push(node);
    return node;
  }

  get textContent() {
    return this.childNodes.map((node) => node.textContent).join('');
  }
}

class TextNode extends NodeBase {
  constructor(text) {
    super(3);
    this.data = String(text || '');
  }

  get textContent() {
    return this.data;
  }
}

class ElementNode extends NodeBase {
  constructor(tagName) {
    super(1);
    this.tagName = String(tagName || '').toUpperCase();
    this.attributes = {};
    this.style = {};
  }

  setAttribute(name, value) {
    this.attributes[String(name)] = String(value);
    if (String(name) === 'id') {
      this.id = String(value);
    }
  }

  getAttribute(name) {
    const key = String(name);
    return Object.prototype.hasOwnProperty.call(this.attributes, key) ? this.attributes[key] : null;
  }

  addEventListener() {}
  removeEventListener() {}
  dispatchEvent() { return true; }
}

class DocumentFragment extends NodeBase {
  constructor() {
    super(11);
  }
}

class DocumentNode extends NodeBase {
  constructor() {
    super(9);
    this.ownerDocument = this;
  }

  createElement(tagName) {
    const node = new ElementNode(tagName);
    node.ownerDocument = this;
    return node;
  }

  createTextNode(text) {
    const node = new TextNode(text);
    node.ownerDocument = this;
    return node;
  }

  createDocumentFragment() {
    const node = new DocumentFragment();
    node.ownerDocument = this;
    return node;
  }
}

function loadModule(context, relpath) {
  const source = fs.readFileSync(relpath, 'utf8');
  vm.runInNewContext(source, context, { filename: relpath });
}

const document = new DocumentNode();
const context = {
  globalThis: null,
  window: null,
  document,
  console,
  TextEncoder,
  TextDecoder,
  Buffer,
};
context.globalThis = context;
context.window = context;

loadModule(context, 'src/modules/qdom-core/src/qdom-core.js');
loadModule(context, 'src/modules/qhtml-parser/src/qhtml-parser.js');
loadModule(context, 'src/modules/dom-renderer/src/dom-renderer.js');

const parser = context.QHtmlModules.qhtmlParser;
const renderer = context.QHtmlModules.domRenderer;
const core = context.QHtmlModules.qdomCore;

const source = `
q-class baseThing {
  constructor(prefix) {
    this.prefix = prefix;
  }

  function baseLabel() {
    return this.prefix + ":" + this.id;
  }
}

q-class myClass extends baseThing {
  slot { myslot }

  myClass(prefix, suffix) {
    super(prefix);
    this.suffix = suffix;
    this.readyValue = this.id + ":" + suffix;
  }

  function label() {
    return this.baseLabel() + ":" + this.suffix;
  }
}

myClass myObject("pre", "done") {
  id: "x"
  myslot {
    div { text { hello } }
  }
}
`;

const qdom = parser.parseQHtmlToQDom(source);
const classDef = qdom.nodes.find((node) => node && node.kind === core.NODE_TYPES.class && node.classId === 'myClass');
assert(classDef, 'q-class definition was not converted to QDomClass');
assert(classDef.extendsClassId === 'baseThing', 'q-class extends target was not captured');
assert(classDef.slotDeclarations.includes('myslot'), 'q-class slot declaration was not captured');
assert(classDef.constructorDefinition && classDef.constructorDefinition.parameters === 'prefix, suffix', 'q-class constructor was not captured');

const classInstance = qdom.nodes.find((node) => node && node.kind === core.NODE_TYPES.classInstance);
assert(classInstance, 'typed q-class invocation was not converted to QDomClassInstance');
assert(classInstance.meta.__qhtmlInstanceAlias === 'myObject', 'q-class instance alias was not preserved');
assert(classInstance.attributes.id === 'x', 'q-class instance attribute was not preserved');
assert(classInstance.constructorArguments.length === 2, 'q-class constructor arguments were not captured');
assert(classInstance.slots[0].name === 'myslot', 'q-class slot fill was not captured');

const fragment = renderer.renderDocumentToFragment(qdom, document, { namedRuntimeValues: {} });
const rendered = fragment.childNodes.find((node) => node && node.tagName === 'MYCLASS');
assert(rendered, 'q-class instance did not render as a custom DOM element');
assert(rendered.getAttribute('id') === 'x', 'q-class instance did not render attributes');
assert(rendered.textContent.includes('hello'), 'q-class instance did not render slot children');
assert(rendered.__qhtmlClassInstance, 'rendered q-class element missing runtime class instance');
assert(rendered.__qhtmlClassInstance.readyValue === 'x:done', 'q-class constructor did not see pre-applied attributes');
assert(rendered.__qhtmlClassInstance.label() === 'pre:x:done', 'q-class method or inherited method failed');
assert(rendered.__qhtmlClassInstance.qdom() === classInstance, 'q-class instance qdom() did not resolve to QDomClassInstance');
assert(rendered.__qhtmlClassInstance.element() === rendered, 'q-class instance element() did not resolve to rendered element');
assert(rendered.__qhtmlClassInstance.slots().length === 1, 'q-class instance slots() did not expose slot QDom');

const referenceSource = `
q-class sink {
  constructor() {
    this.calls = [];
  }

  function setProperty(propName, value) {
    this.calls.push(propName + ":" + value);
    this[propName] = value;
  }
}

q-class bridge {
  constructor() {
    if (this.target) {
      this.target.setProperty("x", 42);
    }
  }
}

sink target1 { }

bridge bridge1 {
  target: target1
  label: "target1"
}
`;

const referenceQdom = parser.parseQHtmlToQDom(referenceSource);
const referenceFragment = renderer.renderDocumentToFragment(referenceQdom, document, { namedRuntimeValues: {} });
const sinkElement = referenceFragment.childNodes.find((node) => node && node.tagName === 'SINK');
const bridgeElement = referenceFragment.childNodes.find((node) => node && node.tagName === 'BRIDGE');
assert(sinkElement && sinkElement.__qhtmlClassInstance, 'q-class reference target did not render');
assert(bridgeElement && bridgeElement.__qhtmlClassInstance, 'q-class reference bridge did not render');
assert(bridgeElement.__qhtmlClassInstance.target === sinkElement.__qhtmlClassInstance, 'q-class initial prop did not resolve named instance reference');
assert(bridgeElement.__qhtmlClassInstance.label === 'target1', 'quoted q-class initial prop should remain literal text');
assert(sinkElement.__qhtmlClassInstance.calls.includes('x:42'), 'q-class initial prop reference was not usable in constructor');

console.log('q-class smoke ok');
