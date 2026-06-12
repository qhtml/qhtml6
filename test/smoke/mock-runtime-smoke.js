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

  get nextSibling() {
    if (!this.parentNode) return null;
    const siblings = this.parentNode.childNodes || [];
    const idx = siblings.indexOf(this);
    return idx >= 0 && idx + 1 < siblings.length ? siblings[idx + 1] : null;
  }

  get previousSibling() {
    if (!this.parentNode) return null;
    const siblings = this.parentNode.childNodes || [];
    const idx = siblings.indexOf(this);
    return idx > 0 ? siblings[idx - 1] : null;
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

class StyleDeclaration {
  constructor() {
    this._values = Object.create(null);
  }

  _camelName(name) {
    return String(name || '').trim().replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
  }

  setProperty(name, value) {
    const cssName = String(name || '').trim();
    const camelName = this._camelName(cssName);
    const stringValue = String(value == null ? '' : value);
    this._values[cssName] = stringValue;
    this._values[camelName] = stringValue;
    this[camelName] = stringValue;
  }

  getPropertyValue(name) {
    const cssName = String(name || '').trim();
    const camelName = this._camelName(cssName);
    return this._values[cssName] || this._values[camelName] || this[camelName] || '';
  }

  removeProperty(name) {
    const cssName = String(name || '').trim();
    const camelName = this._camelName(cssName);
    const previous = this.getPropertyValue(cssName);
    delete this._values[cssName];
    delete this._values[camelName];
    delete this[camelName];
    return previous;
  }
}

class ElementNode extends NodeBase {
  constructor(tagName) {
    super(1);
    this.tagName = String(tagName || '').toUpperCase();
    this.attributes = {};
    this.style = new StyleDeclaration();
    this.clientWidth = 200;
    this.clientHeight = 200;
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
  qhtml.textContent = process.env.QHTML_QBIND_CSS_SMOKE_ONLY === '1' ? `
q-component mycomp {
  q-property w: 5vw
  q-property h: 50%
  q-bind-css { this.component.w this.component.style.width }
  q-bind-css { this.component.h this.component.style.height }
  q-bind-css { this.component.h document.querySelector("#test").style.height }
  q-bind-css { this.component.h document.querySelector("#test").style.#test.width }

  div#test {
    &nbsp;
  }
}

mycomp comp1 { }
button {
  text { click here }
  onclick {
    comp1.h = 44vh;
    comp1.w = comp1.h * 0.5;
  }
}
` : `
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
q-component {
  id: "behavior-script-action-box"
  q-property boxWidth: "10px"
  behavior on boxWidth {
    q-sequential-animation {
      q-property-animation {
        duration: 0
        steps: 1
      }
      q-script-action {
        this.component.setAttribute("data-script-action-width", String(this.component.boxWidth));
        this.component.setAttribute("data-script-action-this", this === this.component ? "1" : "0");
      }
    }
  }
  style { display: block; width: 10px; }
  text { behavior script action }
}
q-component {
  id: "css-box"
  q-property x: 100px
  q-property y: 50vh - x
  q-property pct: 100%
  q-property doubled: x * 2
  q-bind-css { this.component.pct this.component.style.left }
  onready {
    this.component.style.width = this.component.x;
    this.component.x = this.component.style.width + 10vw;
  }
  style { display: block; }
  text { css numeric values }
}
q-component {
  id: "css-primitive-box"
  q-property x: 100px
  q-property y: 50vh
  q-property w: 120px
  q-property doubled: w * 2
  q-property halved: w / 2
  q-property summed: 100px + 20px
  q-property mixed: 30% + 4rem - 100px
  q-bind-css { this.component.x this.component.style.width }
  onready {
    this.component.setAttribute("data-x", String(this.component.x));
    this.component.setAttribute("data-y", String(this.component.y));
    this.component.setAttribute("data-doubled", String(this.component.doubled));
    this.component.setAttribute("data-halved", String(this.component.halved));
    this.component.setAttribute("data-summed", String(this.component.summed));
    this.component.setAttribute("data-mixed", String(this.component.mixed));
    let localWidth = this.component.w;
    localWidth = localWidth * 2;
    this.component.setAttribute("data-local-width", String(localWidth));
  }
  text { primitive \${this.component.x} \${this.component.y} \${this.component.doubled} }
}
q-component parent-box {
  div {
    class: "parent-box"
    slot { }
    slot { body }
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
parent-box parentA {
  body {
    parent-box childA {
      body {
        span { text { child content } }
      }
    }
  }
}
parent-box parentB {
  body {
    span { text { parent b } }
  }
}
behavior-script-action-box { }
css-box { }
css-primitive-box { }
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
    innerWidth: 200,
    innerHeight: 200,
    getComputedStyle(element) {
      return {
        fontSize: '16px',
        width: element && element.style ? element.style.width || '200px' : '200px',
        height: element && element.style ? element.style.height || '200px' : '200px',
        getPropertyValue(name) {
          if (element && element.style && typeof element.style.getPropertyValue === 'function') {
            const direct = element.style.getPropertyValue(name);
            if (direct) return direct;
          }
          if (name === 'font-size') return '16px';
          if (name === 'width') return '200px';
          if (name === 'height') return '200px';
          return '';
        },
      };
    },
    QHTML_PERSIST_QDOM_TEMPLATE: true,
    QHTML_TEMPLATE_PERSIST_DEBOUNCE_MS: 0,
  };
  context.globalThis = context;
  context.window = context;

  const bundle = fs.readFileSync('dist/qhtml.js', 'utf8');
  vm.runInNewContext(bundle, context);
  const mountBinding = context.QHtml.mountQHtmlElement(qhtml);
  if (mountBinding && mountBinding.ready && typeof mountBinding.ready.then === 'function') {
    await mountBinding.ready;
  } else {
    await delay(0);
  }

  assert(context.QHtml, 'QHtml API not exposed');
  if (process.env.QHTML_QBIND_CSS_SMOKE_ONLY === '1') {
    await delay(25);
    const comp = document.querySelector('mycomp');
    const testNode = document.querySelector('#test');
    const button = document.querySelector('button');
    assert(comp, 'q-bind-css smoke component was not rendered');
    assert(testNode, 'q-bind-css smoke target was not rendered');
    assert(button, 'q-bind-css smoke button was not rendered');
    assert(comp.style.width === '5vw', 'q-bind-css did not initialize host width from q-property');
    assert(comp.style.height === '50%', 'q-bind-css did not initialize host height from q-property');
    assert(testNode.style.height === '50%', 'q-bind-css did not initialize document.querySelector target height');
    button.dispatchEvent({ type: 'click' });
    await delay(0);
    assert(String(comp.h) === '44vh', 'button did not update named component h property');
    assert(String(comp.w) === '22vh', 'button did not update named component w arithmetic value');
    assert(comp.style.width === '22vh', 'q-bind-css did not synchronize host width after named property change');
    assert(comp.style.height === '44vh', 'q-bind-css did not synchronize host height after named property change');
    assert(testNode.style.height === '44vh', 'q-bind-css did not synchronize document.querySelector target after named property change');
    context.QHtml.stopAutoMountObserver();
    console.log('mock-runtime q-bind-css smoke ok');
    return;
  }
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
  assert(qhtml.getAttribute('data-qhtml-processed') === 'true', 'Mounted q-html host was not marked processed');

  const staticCopiedQHtml = document.createElement('q-html');
  staticCopiedQHtml.setAttribute('data-qhtml-processed', 'true');
  staticCopiedQHtml.innerHTML = '<section id="static-copy">regular copied html</section>';
  document.body.appendChild(staticCopiedQHtml);
  const skippedStaticBinding = context.QHtml.mountQHtmlElement(staticCopiedQHtml);
  assert(skippedStaticBinding === null, 'Processed static q-html host should not mount');
  const skippedByInitAll = context.QHtml.initAll(document);
  assert(
    Array.isArray(skippedByInitAll) && skippedByInitAll.indexOf(skippedStaticBinding) === -1,
    'initAll should skip processed static q-html hosts'
  );
  await delay(120);
  assert(
    staticCopiedQHtml.innerHTML === '<section id="static-copy">regular copied html</section>',
    'Processed static q-html host content was reparsed or replaced'
  );
  assert(
    staticCopiedQHtml.getAttribute('data-qdom-host-id') === null,
    'Processed static q-html host should not receive a QDom binding id'
  );

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

  const behaviorScriptBox = document.querySelector('behavior-script-action-box');
  assert(behaviorScriptBox, 'Behavior q-script-action component was not rendered');
  behaviorScriptBox.boxWidth = '42px';
  await delay(0);
  assert(
    behaviorScriptBox.getAttribute('data-script-action-width') === '42px',
    'Behavior q-script-action did not run after property animation completion'
  );
  assert(
    behaviorScriptBox.getAttribute('data-script-action-this') === '1',
    'Behavior q-script-action did not execute with component root context'
  );

  await delay(5);
  const cssBox = document.querySelector('css-box');
  assert(cssBox, 'CSS numeric component was not rendered');
  const cssHelper = context.QHtml.cssCalc(cssBox);
  assert(String(context.QHtml.cssValue(100, 'px')) === '100px', 'CSS numeric helper did not serialize 100px');
  assert(String(context.QHtml.cssValue('100px')) === '100px', 'Quoted CSS numeric string did not remain compatible');
  assert(String(cssHelper.add(context.QHtml.cssValue('100px'), context.QHtml.cssValue('20px'))) === '120px', 'Same-unit CSS numeric addition did not preserve px unit');
  assert(String(cssHelper.sub(context.QHtml.cssValue('50vh'), context.QHtml.cssValue('100px'))) === '0px', 'Mixed-unit viewport arithmetic did not resolve 50vh - 100px to 0px');
  assert(String(cssBox.doubled) === '240px', 'CSS numeric multiplication did not preserve px unit');
  assert(String(cssBox.x) === '120px', 'Style read arithmetic did not produce 120px');
  assert(String(Number(cssBox.x)) === '120', 'CSS numeric valueOf did not resolve px primitive');
  assert(String(context.QHtml.resolveCssValue(cssBox.pct, cssBox, 'left').value) === '200', 'Percent CSS numeric value did not resolve against parent width');
  assert(String(cssHelper.add(cssBox.pct, context.QHtml.cssValue('100px'))).includes('calc('), 'Ambiguous mixed-unit math did not preserve calc()');
  assert(cssBox.style.left === '100%', 'q-bind-css did not write CSS numeric percent to style.left');
  const cssPrimitiveBox = document.querySelector('css-primitive-box');
  assert(cssPrimitiveBox, 'CSS primitive component was not rendered');
  assert(String(cssPrimitiveBox.x) === '100px', 'q-property x: 100px did not preserve px unit');
  assert(String(cssPrimitiveBox.y) === '50vh', 'q-property y: 50vh did not preserve vh unit');
  assert(String(cssPrimitiveBox.doubled) === '240px', 'q-property scalar multiplication did not preserve px unit');
  assert(String(cssPrimitiveBox.halved) === '60px', 'q-property scalar division did not preserve px unit');
  assert(String(cssPrimitiveBox.summed) === '120px', 'q-property same-unit addition did not preserve px unit');
  assert(String(cssPrimitiveBox.mixed).includes('calc('), 'Ambiguous mixed-unit q-property did not preserve calc()');
  assert(cssPrimitiveBox.getAttribute('data-x') === '100px', 'Template interpolation did not use CSS string form for px');
  assert(cssPrimitiveBox.getAttribute('data-y') === '50vh', 'Template interpolation did not use CSS string form for vh');
  assert(cssPrimitiveBox.getAttribute('data-doubled') === '240px', 'Interpolated scalar multiplication lost px unit');
  assert(cssPrimitiveBox.getAttribute('data-local-width') === '240px', 'QHTML script scalar multiplication lost px unit');
  assert(cssPrimitiveBox.style.width === '100px', 'q-bind-css did not receive CSS string form for width');
  cssPrimitiveBox.x = context.QHtml.cssValue('120px');
  await delay(0);
  assert(cssPrimitiveBox.style.width === '120px', 'q-bind-css did not keep width synchronized after property change');
  assert((qhtml.textContent || '').includes('primitive 100px 50vh 240px'), 'Text interpolation lost CSS primitive units');
  if (process.env.QHTML_CSS_NUMERIC_SMOKE_ONLY === '1') {
    context.QHtml.stopAutoMountObserver();
    console.log('mock-runtime css numeric smoke ok');
    return;
  }

  const parentA = qhtml.parentA;
  const parentB = qhtml.parentB;
  assert(parentA, 'Root named component parentA was not exported');
  assert(parentB, 'Root named component parentB was not exported');
  assert(parentA.parent === null, 'Root named component parent should be null');
  assert(parentB.parent === null, 'Second root named component parent should be null');
  assert(typeof parentA.slot === 'function', 'Named component reference did not expose slot()');
  const parentABody = parentA.slot('body');
  assert(parentABody, 'Named component body slot did not resolve');
  assert(parentABody.childA, 'Slot child named component was not exported through slot()');
  assert(parentABody.childA.parent === parentA, 'Slot child parent did not resolve to owning named reference');
  parentABody.childA.parent = parentB;
  await delay(150);
  assert(qhtml.parentB.childA, 'Reparented child was not exported under new parent');
  assert(qhtml.parentB.childA.parent === qhtml.parentB, 'Reparented child parent did not resolve to new named reference');
  assert(qhtml.parentB.childA.qdom().parent === qhtml.parentB.qdom(), 'Reparented child QDom parent was not updated');

  const currentMyDiv = document.querySelector('#myDiv');
  assert(currentMyDiv, '#myDiv not rendered after behavior q-script-action update');
  currentMyDiv.dispatchEvent({ type: 'mouseover' });
  assert((currentMyDiv.getAttribute('class') || '').includes('w3-green'), 'q-script event handler did not execute');

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
  await delay(0);

  const updatedDiv = document.querySelector('#myDiv');
  assert(updatedDiv && updatedDiv.textContent.includes('Updated text'), 'Reactive rerender failed after QDom mutation');

  const moveTarget = document.createElement('section');
  document.body.appendChild(moveTarget);
  moveTarget.appendChild(qhtml);
  qdomTarget.textContent = 'Updated text after move';
  await delay(0);

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
