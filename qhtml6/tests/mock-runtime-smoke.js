const fs = require('fs');
const vm = require('vm');

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
        const child = node.childNodes.shift();
        child.parentNode = null;
        this.appendChild(child);
      }
      return node;
    }
    if (node.parentNode) {
      node.parentNode.removeChild(node);
    }
    node.parentNode = this;
    node.ownerDocument = this.ownerDocument || this;
    this.childNodes.push(node);
    return node;
  }

  removeChild(node) {
    const idx = this.childNodes.indexOf(node);
    if (idx >= 0) {
      this.childNodes.splice(idx, 1);
      node.parentNode = null;
    }
    return node;
  }

  insertBefore(node, before) {
    if (!before) {
      return this.appendChild(node);
    }
    if (node.nodeType === 11) {
      const items = node.childNodes.slice();
      for (const item of items) {
        this.insertBefore(item, before);
      }
      node.childNodes = [];
      return node;
    }
    if (node.parentNode) {
      node.parentNode.removeChild(node);
    }
    const idx = this.childNodes.indexOf(before);
    if (idx === -1) {
      return this.appendChild(node);
    }
    node.parentNode = this;
    node.ownerDocument = this.ownerDocument || this;
    this.childNodes.splice(idx, 0, node);
    return node;
  }

  get firstChild() {
    return this.childNodes.length ? this.childNodes[0] : null;
  }

  cloneNode(deep = false) {
    throw new Error('cloneNode not implemented for base node');
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

  set textContent(value) {
    this.data = String(value || '');
  }

  cloneNode() {
    return new TextNode(this.data);
  }
}

class DocumentFragment extends NodeBase {
  constructor() {
    super(11);
  }

  cloneNode(deep = false) {
    const frag = new DocumentFragment();
    if (deep) {
      for (const child of this.childNodes) {
        frag.appendChild(child.cloneNode(true));
      }
    }
    return frag;
  }

  get textContent() {
    return this.childNodes.map((node) => node.textContent).join('');
  }
}

class ElementNode extends NodeBase {
  constructor(tagName) {
    super(1);
    this.tagName = String(tagName || '').toUpperCase();
    this.attributes = {};
    this._listeners = new Map();
    this._templateHtml = '';
    if (this.tagName === 'TEMPLATE') {
      this.content = new DocumentFragment();
      this.content.ownerDocument = null;
    }
  }

  get textContent() {
    return this.childNodes.map((node) => node.textContent).join('');
  }

  set textContent(value) {
    this.childNodes = [];
    this.appendChild(new TextNode(String(value || '')));
  }

  get innerHTML() {
    if (this.tagName === 'TEMPLATE') {
      return this._templateHtml;
    }
    return this.textContent;
  }

  set innerHTML(value) {
    const text = String(value || '');
    if (this.tagName === 'TEMPLATE') {
      this._templateHtml = text;
      this.content = new DocumentFragment();
      this.content.ownerDocument = this.ownerDocument;
      this.content.appendChild(new TextNode(text));
      return;
    }
    this.textContent = text;
  }

  setAttribute(name, value) {
    this.attributes[String(name)] = String(value);
  }

  getAttribute(name) {
    const key = String(name);
    return Object.prototype.hasOwnProperty.call(this.attributes, key) ? this.attributes[key] : null;
  }

  removeAttribute(name) {
    delete this.attributes[String(name)];
  }

  addEventListener(type, handler) {
    const key = String(type);
    if (!this._listeners.has(key)) this._listeners.set(key, []);
    this._listeners.get(key).push(handler);
  }

  removeEventListener(type, handler) {
    const key = String(type);
    const list = this._listeners.get(key) || [];
    const idx = list.indexOf(handler);
    if (idx >= 0) list.splice(idx, 1);
  }

  dispatchEvent(event) {
    const type = String(event && event.type ? event.type : '');
    const list = (this._listeners.get(type) || []).slice();
    for (const handler of list) {
      handler.call(this, event);
    }
    return true;
  }

  get id() {
    return this.getAttribute('id') || '';
  }

  set id(value) {
    this.setAttribute('id', value);
  }

  get className() {
    return this.getAttribute('class') || '';
  }

  set className(value) {
    this.setAttribute('class', value);
  }

  get classList() {
    const self = this;
    function classes() {
      return (self.getAttribute('class') || '').split(/\s+/).filter(Boolean);
    }
    return {
      add(name) {
        const set = new Set(classes());
        set.add(name);
        self.setAttribute('class', Array.from(set).join(' '));
      },
      remove(name) {
        const set = new Set(classes());
        set.delete(name);
        self.setAttribute('class', Array.from(set).join(' '));
      },
      contains(name) {
        return classes().includes(name);
      },
    };
  }

  get previousElementSibling() {
    if (!this.parentNode) return null;
    const siblings = this.parentNode.childNodes;
    const idx = siblings.indexOf(this);
    for (let i = idx - 1; i >= 0; i -= 1) {
      if (siblings[i].nodeType === 1) return siblings[i];
    }
    return null;
  }

  get nextElementSibling() {
    if (!this.parentNode) return null;
    const siblings = this.parentNode.childNodes;
    const idx = siblings.indexOf(this);
    for (let i = idx + 1; i < siblings.length; i += 1) {
      if (siblings[i].nodeType === 1) return siblings[i];
    }
    return null;
  }

  cloneNode(deep = false) {
    const clone = new ElementNode(this.tagName);
    clone.attributes = { ...this.attributes };
    if (this.tagName === 'TEMPLATE') {
      clone._templateHtml = this._templateHtml;
      clone.content = this.content.cloneNode(true);
    }
    if (deep) {
      for (const child of this.childNodes) {
        clone.appendChild(child.cloneNode(true));
      }
    }
    return clone;
  }
}

class DocumentNode extends NodeBase {
  constructor() {
    super(9);
    this.ownerDocument = this;
    this.readyState = 'complete';
    this.baseURI = 'https://example.test/app/index.html';
    this.documentElement = new ElementNode('html');
    this.documentElement.ownerDocument = this;
    this.head = new ElementNode('head');
    this.head.ownerDocument = this;
    this.body = new ElementNode('body');
    this.body.ownerDocument = this;
    this.documentElement.appendChild(this.head);
    this.documentElement.appendChild(this.body);
    this.appendChild(this.documentElement);
  }

  createElement(tagName) {
    const node = new ElementNode(tagName);
    node.ownerDocument = this;
    if (node.tagName === 'TEMPLATE') {
      node.content.ownerDocument = this;
    }
    return node;
  }

  createTextNode(text) {
    const node = new TextNode(text);
    node.ownerDocument = this;
    return node;
  }

  createDocumentFragment() {
    const frag = new DocumentFragment();
    frag.ownerDocument = this;
    return frag;
  }

  addEventListener() {}

  querySelector(selector) {
    const all = this.querySelectorAll(selector);
    return all.length ? all[0] : null;
  }

  querySelectorAll(selector) {
    const sel = String(selector || '').trim();
    const out = [];
    const isId = sel.startsWith('#');
    const idValue = isId ? sel.slice(1) : null;
    const tag = isId ? null : sel.toUpperCase();

    function visit(node) {
      if (!node || node.nodeType !== 1) return;
      if (isId) {
        if (node.getAttribute('id') === idValue) out.push(node);
      } else if (node.tagName === tag) {
        out.push(node);
      }
      for (const child of node.childNodes) visit(child);
      if (node.tagName === 'TEMPLATE' && node.content) {
        for (const child of node.content.childNodes) visit(child);
      }
    }

    visit(this.documentElement);
    return out;
  }

  cloneNode() {
    throw new Error('Not needed');
  }
}

const MockFetch = {
  responses: Object.create(null),
  requests: [],
  async run(url, options) {
    const entry = {
      method: String(options && options.method ? options.method : 'GET'),
      url: String(url || ''),
    };
    MockFetch.requests.push(entry);

    if (Object.prototype.hasOwnProperty.call(MockFetch.responses, entry.url)) {
      const body = String(MockFetch.responses[entry.url] || '');
      return {
        ok: true,
        status: 200,
        async text() {
          return body;
        },
      };
    }

    return {
      ok: false,
      status: 404,
      async text() {
        return '';
      },
    };
  },
};

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function countMappedTemplatesForHost(doc, hostId) {
  const templates = doc.querySelectorAll('template');
  let count = 0;
  for (const template of templates) {
    if (template.getAttribute('data-qdom') !== '1') continue;
    if (template.getAttribute('data-qdom-for') !== hostId) continue;
    count += 1;
  }
  return count;
}

async function runSmoke() {
  const document = new DocumentNode();
  const importComponentsUrl = 'https://example.test/app/imports/components.qhtml';
  const importInnerUrl = 'https://example.test/app/imports/inner.qhtml';
  MockFetch.requests = [];
  MockFetch.responses = {
    [importComponentsUrl]: `
q-import { inner.qhtml }
q-component {
  id: "import-box"
  div {
    class: "import-box"
    slot { name: "content" }
  }
}
`,
    [importInnerUrl]: `
q-template import-shell {
  section {
    class: "import-shell"
    slot { body }
  }
}
`,
  };

  const qhtml = document.createElement('q-html');
  qhtml.id = 'test-qhtml';
  qhtml.textContent = `
onLoad {
  this.setAttribute("data-host-ready", "1");
}
q-import { imports/components.qhtml }
q-template card-shell {
  div {
    class: "card-shell"
    slot { header }
    slot { body }
  }
}
q-template nested-inner {
  div {
    slot { content }
  }
}
q-template nested-outer {
  nested-inner {
    slot { content }
  }
}
q-component {
  id: "text-bar";
  div {
    class: "w3-bar w3-blue";
    span { slot { name: "custom-slot1" } }
    slot { name: "custom-slot2" }
  }
}
div {
  text-bar {
    div { slot: "custom-slot1" text: "slot 1 text" }
    div {
      slot: "custom-slot2"
      span { html { slot 2 html } }
      br { }
      span { text: "additional qhtml for custom-slot2" }
    }
  }
}
card-shell {
  header { h3 { text: "Card title" } }
  body { p { text: "Card body" } }
}
nested-outer {
  span { text { nested projection ok } }
}
import-shell {
  body {
    import-box {
      span { slot: "content" text: "recursive import ok" }
    }
  }
}
q-template one-slot-template {
  slot { main }
}
q-component {
  id: "one-slot-component"
  slot { some-slot }
}
q-component {
  id: "my-panel"
  function notify(msg) {
    this.setAttribute("data-notify", String(msg || ""));
  }
  div.shell {
    slot { body }
  }
}
q-component {
  id: "inner-box"
  div {
    slot { inner-slot }
  }
}
q-component {
  id: "outer-frame"
  div {
    inner-box {
      inner-slot {
        slot { outer-content }
      }
    }
  }
}
one-slot-template {
  text { single slot template text }
}
one-slot-component {
  div { text { single slot component text } }
}
my-panel {
  body {
    div {
      id: "panel-click-target"
      onclick {
        this.setAttribute("data-component-tag", this.component ? this.component.tagName : "none");
      }
      text { Click me }
    }
  }
}
outer-frame {
  outer-content {
    p {
      id: "wrapped-twice"
      text { Wrapped twice }
    }
  }
}
p,center,a { href: "https://www.example.com" text: "Visit Example" }
w3-red,w3-panel,div { id: "myDiv" text: "Hover mouse here to see q-script" }
div { text: "hello world" span { html { <br> hello again } } }
`;
  const qscript = document.createElement('q-script');
  qscript.textContent = `
#myDiv.on("mouseover"): {
  #myDiv.classList.remove("w3-red");
  #myDiv.classList.add("w3-green");
}
`;
  document.body.appendChild(qhtml);
  document.body.appendChild(qscript);

  const customElementRegistry = new Map();
  const customElements = {
    define(name, ctor) {
      const key = String(name || '').trim().toLowerCase();
      if (!key) {
        throw new Error('customElements.define requires a name');
      }
      if (customElementRegistry.has(key)) {
        throw new Error('custom element already defined: ' + key);
      }
      customElementRegistry.set(key, ctor);
    },
    get(name) {
      return customElementRegistry.get(String(name || '').trim().toLowerCase());
    },
  };

  const context = {
    globalThis: null,
    window: null,
    document,
    location: { href: document.baseURI },
    fetch: (url, options) => MockFetch.run(url, options),
    TextEncoder,
    TextDecoder,
    Buffer,
    HTMLElement: class HTMLElement {},
    customElements,
    console,
    setTimeout,
    clearTimeout,
  };
  context.globalThis = context;
  context.window = context;

  const bundle = fs.readFileSync('/home/mike/build/qhtml.js/dev2/dist/qhtml.js', 'utf8');
  vm.runInNewContext(bundle, context);
  const mountBinding = context.QHtml.mountQHtmlElement(qhtml);
  if (mountBinding && mountBinding.ready && typeof mountBinding.ready.then === 'function') {
    await mountBinding.ready;
  } else {
    await delay(0);
  }

  assert(context.QHtml, 'QHtml API not exposed');
  assert(customElementRegistry.has('text-bar'), 'q-component text-bar was not registered as a custom element');
  assert(customElementRegistry.has('import-box'), 'Imported q-component import-box was not registered as a custom element');
  assert(customElementRegistry.has('one-slot-component'), 'Single-slot q-component was not registered as a custom element');
  assert(!customElementRegistry.has('card-shell'), 'q-template card-shell must not register as a custom element');
  assert(!customElementRegistry.has('one-slot-template'), 'q-template one-slot-template must not register as a custom element');
  const bindingQDom = context.QHtml.getQDomForElement(qhtml);
  assert(bindingQDom, 'QDom binding not created');
  const hostQdom = typeof qhtml.qdom === 'function' ? qhtml.qdom() : null;
  assert(hostQdom, 'Host .qdom() accessor not available');
  assert(typeof hostQdom.serialize === 'function', 'Host qdom() object missing serialize()');
  const hostSerialized = hostQdom.serialize();
  assert(typeof hostSerialized === 'string' && hostSerialized.startsWith('qdom-lzw-base64:'), 'Host qdom serialize() payload mismatch');

  assert(qhtml.getAttribute('data-host-ready') === '1', 'Top-level lifecycle block did not execute on q-html host');

  const template = qhtml.previousElementSibling;
  assert(template && template.tagName === 'TEMPLATE', 'Serialized template not inserted before q-html');
  assert(template.getAttribute('data-qdom') === '1', 'Missing data-qdom marker');
  assert((template.textContent || '').startsWith('qdom-lzw-base64:'), 'Serialized payload prefix mismatch');

  const hostId = qhtml.getAttribute('data-qdom-host-id');
  assert(typeof hostId === 'string' && hostId.length > 0, 'Host qdom id was not assigned');
  assert(countMappedTemplatesForHost(document, hostId) === 1, 'Expected exactly one serialized template for host');

  const myDiv = document.querySelector('#myDiv');
  assert(myDiv, '#myDiv not rendered');
  assert((myDiv.getAttribute('class') || '').includes('w3-red'), 'class shorthand did not add w3-red');
  assert((myDiv.getAttribute('class') || '').includes('w3-panel'), 'class shorthand did not add w3-panel');

  const cardHeading = document.querySelector('h3');
  assert(cardHeading && cardHeading.textContent.includes('Card title'), 'q-template shorthand slot fill failed');
  assert(!document.querySelector('import-shell'), 'Recursive q-import did not resolve imported q-template definition');
  const importBox = document.querySelector('import-box');
  assert(importBox, 'Recursive q-import did not resolve imported q-component definition');
  assert(importBox.textContent.includes('recursive import ok'), 'Imported q-component slot content did not render');
  const importSection = document.querySelector('section');
  assert(importSection && importSection.textContent.includes('recursive import ok'), 'Imported content did not render after recursive q-import');
  const singleSlotComponentHost = document.querySelector('one-slot-component');
  assert(singleSlotComponentHost, 'Single-slot q-component host was not rendered');
  assert(
    singleSlotComponentHost.textContent.includes('single slot component text'),
    'Single-slot q-component implicit slot fill failed'
  );
  assert(!document.querySelector('one-slot-template'), 'q-template invocation should not render as host element');
  assert(
    (qhtml.textContent || '').includes('single slot template text'),
    'Single-slot q-template implicit slot fill failed'
  );
  assert((qhtml.textContent || '').includes('nested projection ok'), 'Nested template-to-template slot projection failed');
  const panelClickTarget = document.querySelector('#panel-click-target');
  assert(panelClickTarget, 'Projected panel click target was not rendered');
  assert(
    panelClickTarget.component && panelClickTarget.component.tagName === 'MY-PANEL',
    'Projected slot node did not expose this.component as nearest component host'
  );
  assert(
    panelClickTarget.slot && typeof panelClickTarget.slot === 'object' && typeof panelClickTarget.slot.qdom === 'function',
    'Projected slot node did not expose this.slot context object'
  );
  assert(
    String(panelClickTarget.slot.name || '') === 'body',
    'Projected slot node did not resolve expected slot name "body"'
  );
  const panelSlotNode = panelClickTarget.slot.qdom();
  assert(panelSlotNode && panelSlotNode.kind === 'slot', 'this.slot.qdom() did not return a slot node');
  assert(String(panelSlotNode.name || '') === 'body', 'this.slot.qdom() resolved wrong slot node');
  assert(typeof panelSlotNode.serialize === 'function', 'Slot qdom() object missing serialize()');
  const slotSerialized = panelSlotNode.serialize();
  assert(typeof slotSerialized === 'string' && slotSerialized.startsWith('qdom-lzw-base64:'), 'Slot qdom serialize() payload mismatch');
  assert(
    panelClickTarget.component && typeof panelClickTarget.component.notify === 'function',
    'Projected slot node component host is missing expected notify method'
  );
  const panelComponentQdom = panelClickTarget.component && typeof panelClickTarget.component.qdom === 'function'
    ? panelClickTarget.component.qdom()
    : null;
  assert(panelComponentQdom && typeof panelComponentQdom.serialize === 'function', 'Component qdom() object missing serialize()');
  const componentSerialized = panelComponentQdom.serialize();
  assert(
    typeof componentSerialized === 'string' && componentSerialized.startsWith('qdom-lzw-base64:'),
    'Component qdom serialize() payload mismatch'
  );
  panelClickTarget.component.notify('smoke');
  assert(
    panelClickTarget.component.getAttribute('data-notify') === 'smoke',
    'Component method invocation via projected slot context failed'
  );
  const importRequests = MockFetch.requests.filter((entry) => entry.url.includes('/imports/'));
  assert(importRequests.length >= 2, 'Expected recursive q-import to perform multiple import loads');
  assert(!document.querySelector('slot'), 'Rendered HTML DOM must not contain literal <slot> elements');
  const wrappedTwice = document.querySelector('#wrapped-twice');
  assert(wrappedTwice && wrappedTwice.textContent.includes('Wrapped twice'), 'Nested outer->inner slot forwarding did not render expected content');
  assert(
    wrappedTwice.slot && wrappedTwice.slot.qdom && String(wrappedTwice.slot.name || '') === 'inner-slot',
    'Nested projected node did not resolve nearest slot owner'
  );
  assert(!document.querySelector('inner-slot'), 'Nested slot wrapper leaked into rendered HTML as <inner-slot>');

  myDiv.dispatchEvent({ type: 'mouseover' });
  assert((myDiv.getAttribute('class') || '').includes('w3-green'), 'q-script event handler did not execute');

  let templateInstanceNode = null;
  let componentInstanceNode = null;
  context.QHtmlModules.qdomCore.walkQDom(bindingQDom, (node) => {
    if (!templateInstanceNode && node && node.kind === 'template-instance' && node.componentId === 'one-slot-template') {
      templateInstanceNode = node;
    }
    if (!componentInstanceNode && node && node.kind === 'component-instance' && node.componentId === 'one-slot-component') {
      componentInstanceNode = node;
    }
  });
  assert(templateInstanceNode, 'QDom missing template-instance node for one-slot-template');
  assert(componentInstanceNode, 'QDom missing component-instance node for one-slot-component');
  const templateMainSlot = Array.isArray(templateInstanceNode.slots)
    ? templateInstanceNode.slots.find((slot) => slot && slot.name === 'main')
    : null;
  assert(templateMainSlot, 'QDom template-instance missing main slot');
  assert(
    Array.isArray(templateMainSlot.children) &&
      templateMainSlot.children.some((child) => child && child.kind === 'text' && String(child.value).includes('single slot template text')),
    'QDom template-instance slot did not capture text as QTextNode'
  );

  let qdomTarget = null;
  context.QHtmlModules.qdomCore.walkQDom(bindingQDom, (node) => {
    if (qdomTarget) return;
    if (node && node.kind === 'element' && node.attributes && node.attributes.id === 'myDiv') {
      qdomTarget = node;
    }
  });
  assert(qdomTarget, 'Failed to locate myDiv node in QDom');
  qdomTarget.textContent = 'Updated text';

  const updatedDiv = document.querySelector('#myDiv');
  assert(updatedDiv && updatedDiv.textContent.includes('Updated text'), 'Reactive rerender failed after QDom mutation');

  const moveTarget = document.createElement('section');
  document.body.appendChild(moveTarget);
  moveTarget.appendChild(qhtml);
  qdomTarget.textContent = 'Updated text after move';

  assert(countMappedTemplatesForHost(document, hostId) === 1, 'Host move created duplicate serialized templates');
  const movedTemplate = qhtml.previousElementSibling;
  assert(
    movedTemplate && movedTemplate.tagName === 'TEMPLATE' && movedTemplate.getAttribute('data-qdom-for') === hostId,
    'Serialized template did not remain directly before q-html after host move'
  );

  const dynamicQHtml = document.createElement('q-html');
  dynamicQHtml.textContent = 'div,span,custom-tag { id: "dynamicNode" text: "dynamic content ok" }';
  document.body.appendChild(dynamicQHtml);

  await delay(150);

  const dynamicNode = document.querySelector('#dynamicNode');
  assert(dynamicNode && dynamicNode.tagName === 'CUSTOM-TAG', 'Dynamically inserted q-html did not auto-render');

  const dynamicHostId = dynamicQHtml.getAttribute('data-qdom-host-id');
  assert(dynamicHostId, 'Dynamic q-html host id not assigned');
  assert(countMappedTemplatesForHost(document, dynamicHostId) === 1, 'Dynamic q-html did not keep single template mapping');

  const roundTrip = context.QHtml.toQHtmlSource(qhtml, { preserveOriginal: false });
  assert(
    typeof roundTrip === 'string' &&
      roundTrip.includes('q-component') &&
      roundTrip.includes('q-template') &&
      roundTrip.includes('onLoad'),
    'QDom->QHTML serializer returned invalid or incomplete output'
  );

  context.QHtml.stopAutoMountObserver();
  console.log('mock-runtime smoke ok');
}

runSmoke().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
