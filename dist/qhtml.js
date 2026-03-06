/* qhtml.js release bundle */
/* generated: 2026-03-05T13:15:01Z */

/*** BEGIN: modules/qdom-core/src/qdom-core.js ***/
(function attachQDomCore(global) {
  const modules = global.QHtmlModules || (global.QHtmlModules = {});

  const NODE_TYPES = Object.freeze({
    document: "document",
    element: "element",
    text: "text",
    rawHtml: "raw-html",
    component: "component",
    componentInstance: "component-instance",
    templateInstance: "template-instance",
    slot: "slot",
    scriptRule: "script-rule",
    color: "color",
  });

  const TEXT_ALIASES = new Set(["content", "contents", "text", "textcontents", "innertext"]);
  const QDOM_HOST_ID_ATTR = "data-qdom-host-id";
  const QDOM_TEMPLATE_OWNER_ATTR = "data-qdom-for";
  const UPDATE_NONCE_KEY = "update-nonce";
  let qdomHostIdCounter = 0;

  class QDomNode {
    constructor(kind, meta) {
      this.kind = String(kind || "").trim().toLowerCase();
      this.meta = createNodeMeta(meta);
    }
  }

  class QDocumentNode extends QDomNode {
    constructor(options) {
      const opts = options || {};
      super(NODE_TYPES.document, Object.assign({ source: typeof opts.source === "string" ? opts.source : "" }, opts.meta || {}));
      this.version = Number.isFinite(opts.version) ? Number(opts.version) : 1;
      this.nodes = Array.isArray(opts.nodes) ? opts.nodes : [];
      this.scripts = Array.isArray(opts.scripts) ? opts.scripts : [];
      if (!this.meta || typeof this.meta !== "object") {
        this.meta = {};
      }
      if (typeof this.meta.source !== "string") {
        this.meta.source = "";
      }
      if (typeof this.meta.dirty !== "boolean") {
        this.meta.dirty = false;
      }
    }
  }

  class QElementNode extends QDomNode {
    constructor(options) {
      const opts = options || {};
      const tagName = String(opts.tagName || "div").toLowerCase();
      super(NODE_TYPES.element, opts.meta);
      this.tagName = tagName;
      this.attributes = Object.assign({}, opts.attributes || {});
      this.children = Array.isArray(opts.children) ? opts.children : [];
      this.textContent = typeof opts.textContent === "string" ? opts.textContent : null;
      this.selectorMode = opts.selectorMode || "single";
      this.selectorChain = Array.isArray(opts.selectorChain) ? opts.selectorChain.slice() : [tagName];
    }
  }

  class QTextNode extends QDomNode {
    constructor(options) {
      const opts = options || {};
      super(NODE_TYPES.text, opts.meta);
      this.value = typeof opts.value === "string" ? opts.value : "";
    }
  }

  class QRawHtmlNode extends QDomNode {
    constructor(options) {
      const opts = options || {};
      super(NODE_TYPES.rawHtml, opts.meta);
      this.html = typeof opts.html === "string" ? opts.html : "";
    }
  }

  class QComponentNode extends QDomNode {
    constructor(options) {
      const opts = options || {};
      super(NODE_TYPES.component, opts.meta);
      this.componentId = String(opts.componentId || "").trim();
      this.definitionType = String(opts.definitionType || "component").trim().toLowerCase() || "component";
      this.templateNodes = Array.isArray(opts.templateNodes) ? opts.templateNodes : [];
      this.propertyDefinitions = Array.isArray(opts.propertyDefinitions) ? opts.propertyDefinitions : [];
      this.methods = Array.isArray(opts.methods) ? opts.methods : [];
      this.signalDeclarations = Array.isArray(opts.signalDeclarations) ? opts.signalDeclarations : [];
      this.aliasDeclarations = Array.isArray(opts.aliasDeclarations) ? opts.aliasDeclarations : [];
      this.wasmConfig =
        opts.wasmConfig && typeof opts.wasmConfig === "object" && !Array.isArray(opts.wasmConfig)
          ? Object.assign({}, opts.wasmConfig)
          : null;
      this.lifecycleScripts = Array.isArray(opts.lifecycleScripts) ? opts.lifecycleScripts : [];
      this.attributes = Object.assign({}, opts.attributes || {});
      this.properties = Array.isArray(opts.properties) ? opts.properties.slice() : [];
    }
  }

  class QSlotNode extends QDomNode {
    constructor(options) {
      const opts = options || {};
      super(NODE_TYPES.slot, opts.meta);
      this.name = String(opts.name || "default").trim() || "default";
      this.children = Array.isArray(opts.children) ? opts.children : [];
    }
  }

  class QComponentInstanceNode extends QDomNode {
    constructor(options) {
      const opts = options || {};
      const tag = String(opts.tagName || opts.componentId || "div").trim().toLowerCase();
      super(normalizeInstanceKind(opts.kind), opts.meta);
      this.componentId = String(opts.componentId || tag).trim().toLowerCase();
      this.tagName = tag;
      this.attributes = Object.assign({}, opts.attributes || {});
      this.props = Object.assign({}, opts.props || {});
      this.slots = Array.isArray(opts.slots) ? opts.slots : [];
      this.lifecycleScripts = Array.isArray(opts.lifecycleScripts) ? opts.lifecycleScripts : [];
      this.children = Array.isArray(opts.children) ? opts.children : [];
      this.textContent = typeof opts.textContent === "string" ? opts.textContent : null;
      this.selectorMode = opts.selectorMode || "single";
      this.selectorChain = Array.isArray(opts.selectorChain) ? opts.selectorChain.slice() : [tag];
    }
  }

  class QTemplateInstanceNode extends QComponentInstanceNode {
    constructor(options) {
      super(Object.assign({}, options || {}, { kind: NODE_TYPES.templateInstance }));
    }
  }

  class QScriptRuleNode extends QDomNode {
    constructor(options) {
      const opts = options || {};
      super(NODE_TYPES.scriptRule, opts.meta);
      this.selector = String(opts.selector || "");
      this.eventName = String(opts.eventName || "");
      this.body = typeof opts.body === "string" ? opts.body : "";
    }
  }

  class QColorNode extends QDomNode {
    constructor(options) {
      const opts = options || {};
      super(NODE_TYPES.color, opts.meta);
      this.name = String(opts.name || "").trim();
      this.value = typeof opts.value === "string" ? opts.value : "";
      this.assignments =
        opts.assignments && typeof opts.assignments === "object" && !Array.isArray(opts.assignments)
          ? Object.assign({}, opts.assignments)
          : null;
      this.mode = String(opts.mode || (this.assignments ? "theme" : "schema")).trim().toLowerCase();
    }

    style(usage) {
      const map = {
        background: "background-color",
        foreground: "color",
        border: "border-color",
        primary: "--q-color-primary",
        secondary: "--q-color-secondary",
        accent: "--q-color-accent",
      };
      if (this.assignments && typeof this.assignments === "object") {
        const keys = Object.keys(this.assignments);
        const declarations = [];
        for (let i = 0; i < keys.length; i += 1) {
          const key = String(keys[i] || "").trim();
          if (!key) {
            continue;
          }
          const value = String(this.assignments[key] == null ? "" : this.assignments[key]).trim();
          if (!value) {
            continue;
          }
          const cssProp = Object.prototype.hasOwnProperty.call(map, key)
            ? map[key]
            : "--q-color-" + key.replace(/[^A-Za-z0-9_-]/g, "-");
          declarations.push(cssProp + ": " + value + ";");
        }
        return "style { " + declarations.join(" ") + " }";
      }
      const value = String(this.value || "").trim();
      if (!value) {
        return "style { }";
      }
      if (typeof usage === "string" && usage.trim()) {
        const key = String(usage || "").trim();
        const normalized = key.toLowerCase();
        const cssProp = Object.prototype.hasOwnProperty.call(map, normalized)
          ? map[normalized]
          : key;
        return "style { " + cssProp + ": " + value + "; }";
      }
      if (usage && typeof usage === "object" && !Array.isArray(usage)) {
        const keys = Object.keys(usage);
        const declarations = [];
        for (let i = 0; i < keys.length; i += 1) {
          const key = String(keys[i] || "").trim();
          if (!key || !usage[key]) {
            continue;
          }
          const normalized = key.toLowerCase();
          const cssProp = Object.prototype.hasOwnProperty.call(map, normalized)
            ? map[normalized]
            : key;
          declarations.push(cssProp + ": " + value + ";");
        }
        return "style { " + declarations.join(" ") + " }";
      }
      return "style { color: " + value + "; }";
    }
  }

  function createNodeMeta(overrides) {
    return Object.assign(
      {
        dirty: false,
        originalSource: null,
        sourceRange: null,
      },
      overrides || {}
    );
  }

  function createUpdateNonceToken(length) {
    const size = Number.isFinite(length) && length > 0 ? Math.floor(length) : 12;
    const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let out = "";
    for (let i = 0; i < size; i += 1) {
      const index = Math.floor(Math.random() * alphabet.length);
      out += alphabet.charAt(index);
    }
    return out || "nonce";
  }

  function setUpdateNonce(target, nonceValue) {
    if (!target || (typeof target !== "object" && typeof target !== "function")) {
      return "";
    }
    const next = typeof nonceValue === "string" && nonceValue ? nonceValue : createUpdateNonceToken();
    try {
      Object.defineProperty(target, UPDATE_NONCE_KEY, {
        value: next,
        configurable: true,
        writable: true,
        enumerable: false,
      });
    } catch (error) {
      // ignore nonce write failures on frozen targets
      try {
        target[UPDATE_NONCE_KEY] = next;
      } catch (innerError) {
        // ignore fallback failure
      }
    }
    return next;
  }

  function ensureUpdateNonce(target) {
    if (!target || (typeof target !== "object" && typeof target !== "function")) {
      return "";
    }
    const existing = target[UPDATE_NONCE_KEY];
    if (typeof existing === "string" && existing) {
      return existing;
    }
    return setUpdateNonce(target);
  }

  function ensureUpdateNonceInTree(root) {
    if (!root || (typeof root !== "object" && typeof root !== "function")) {
      return;
    }
    const seen = new WeakSet();
    const stack = [root];
    while (stack.length > 0) {
      const node = stack.pop();
      if (!node || (typeof node !== "object" && typeof node !== "function")) {
        continue;
      }
      if (seen.has(node)) {
        continue;
      }
      seen.add(node);
      ensureUpdateNonce(node);
      const keys = Object.keys(node);
      for (let i = 0; i < keys.length; i += 1) {
        const value = node[keys[i]];
        if (value && (typeof value === "object" || typeof value === "function")) {
          stack.push(value);
        }
      }
    }
  }

  function findNearestNodeForPath(rootNode, path) {
    if (!rootNode || !Array.isArray(path)) {
      return null;
    }
    let cursor = rootNode;
    let nearest = cursor && typeof cursor.kind === "string" ? cursor : null;
    for (let i = 0; i < path.length; i += 1) {
      if (!cursor || (typeof cursor !== "object" && typeof cursor !== "function")) {
        break;
      }
      const key = String(path[i] || "");
      if (Array.isArray(cursor)) {
        cursor = cursor[key];
      } else {
        cursor = cursor[key];
      }
      if (cursor && typeof cursor.kind === "string") {
        nearest = cursor;
      }
    }
    return nearest;
  }

  function createDocument(options) {
    const opts = options || {};
    const node = new QDocumentNode(opts);
    setUpdateNonce(node);
    return node;
  }

  function createElementNode(options) {
    const opts = options || {};
    const node = new QElementNode(opts);
    setUpdateNonce(node);
    return node;
  }

  function createTextNode(options) {
    const opts = options || {};
    const node = new QTextNode(opts);
    setUpdateNonce(node);
    return node;
  }

  function createRawHtmlNode(options) {
    const opts = options || {};
    const node = new QRawHtmlNode(opts);
    setUpdateNonce(node);
    return node;
  }

  function createComponentNode(options) {
    const opts = options || {};
    const node = new QComponentNode(opts);
    setUpdateNonce(node);
    return node;
  }

  function createSlotNode(options) {
    const opts = options || {};
    const node = new QSlotNode(opts);
    setUpdateNonce(node);
    return node;
  }

  function normalizeInstanceKind(kind) {
    const value = String(kind || "").trim().toLowerCase();
    if (value === NODE_TYPES.templateInstance || value === "template") {
      return NODE_TYPES.templateInstance;
    }
    return NODE_TYPES.componentInstance;
  }

  function createComponentInstanceNode(options) {
    const opts = options || {};
    const kind = normalizeInstanceKind(opts.kind);
    const node =
      kind === NODE_TYPES.templateInstance
        ? new QTemplateInstanceNode(opts)
        : new QComponentInstanceNode(opts);
    setUpdateNonce(node);
    return node;
  }

  function readSlotNodes(node) {
    if (!node || typeof node !== "object") {
      return [];
    }
    if (Array.isArray(node.slots)) {
      return node.slots;
    }
    if (Array.isArray(node.__qhtmlSlotNodes)) {
      return node.__qhtmlSlotNodes;
    }
    return [];
  }

  function ensureSlotNodes(node) {
    if (!node || typeof node !== "object") {
      return [];
    }
    if (Array.isArray(node.slots)) {
      return node.slots;
    }
    if (Array.isArray(node.__qhtmlSlotNodes)) {
      return node.__qhtmlSlotNodes;
    }
    const created = [];
    try {
      Object.defineProperty(node, "__qhtmlSlotNodes", {
        value: created,
        configurable: true,
        writable: true,
        enumerable: false,
      });
    } catch (error) {
      node.__qhtmlSlotNodes = created;
    }
    return created;
  }

  function createScriptRule(options) {
    const opts = options || {};
    const node = new QScriptRuleNode(opts);
    setUpdateNonce(node);
    return node;
  }

  function createQColorNode(options) {
    const node = new QColorNode(options || {});
    setUpdateNonce(node);
    return node;
  }

  function isNode(value) {
    return !!value && typeof value === "object" && typeof value.kind === "string";
  }

  function walkNodes(nodes, visitor, parent, pathPrefix) {
    if (!Array.isArray(nodes)) {
      return;
    }
    const basePath = Array.isArray(pathPrefix) ? pathPrefix : [];
    for (let i = 0; i < nodes.length; i += 1) {
      const node = nodes[i];
      const path = basePath.concat(i);
      visitor(node, parent || null, path);
      if (!node || typeof node !== "object") {
        continue;
      }
      if (node.kind === NODE_TYPES.element && Array.isArray(node.children)) {
        walkNodes(node.children, visitor, node, path.concat("children"));
      }
      if (node.kind === NODE_TYPES.component && Array.isArray(node.templateNodes)) {
        walkNodes(node.templateNodes, visitor, node, path.concat("templateNodes"));
      }
      if (
        (node.kind === NODE_TYPES.componentInstance || node.kind === NODE_TYPES.templateInstance) &&
        readSlotNodes(node).length >= 0
      ) {
        walkNodes(readSlotNodes(node), visitor, node, path.concat("slots"));
      }
      if (
        (node.kind === NODE_TYPES.componentInstance || node.kind === NODE_TYPES.templateInstance) &&
        Array.isArray(node.children)
      ) {
        walkNodes(node.children, visitor, node, path.concat("children"));
      }
      if (node.kind === NODE_TYPES.slot && Array.isArray(node.children)) {
        walkNodes(node.children, visitor, node, path.concat("children"));
      }
    }
  }

  function walkQDom(documentNode, visitor) {
    if (!documentNode || documentNode.kind !== NODE_TYPES.document) {
      return;
    }
    walkNodes(documentNode.nodes, visitor, documentNode, ["nodes"]);
    if (Array.isArray(documentNode.scripts)) {
      for (let i = 0; i < documentNode.scripts.length; i += 1) {
        visitor(documentNode.scripts[i], documentNode, ["scripts", i]);
      }
    }
  }

  function cloneDeep(value) {
    if (Array.isArray(value)) {
      return value.map(cloneDeep);
    }
    if (value && typeof value === "object") {
      const out = {};
      for (const key of Object.keys(value)) {
        out[key] = cloneDeep(value[key]);
      }
      return out;
    }
    return value;
  }

  function cloneDocument(documentNode) {
    return cloneDeep(documentNode);
  }

  function ensureStringArray(value) {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.map((item) => String(item));
  }

  function mergeClasses(existing, classNames) {
    const fromExisting = typeof existing === "string" ? existing.split(/\s+/).filter(Boolean) : [];
    const merged = new Set(fromExisting);
    for (const name of classNames) {
      if (name) {
        merged.add(name);
      }
    }
    return Array.from(merged).join(" ");
  }

  function encodeBase64(bytes) {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    if (typeof global.btoa === "function") {
      return global.btoa(binary);
    }
    if (typeof global.Buffer === "function") {
      return global.Buffer.from(binary, "binary").toString("base64");
    }
    throw new Error("No base64 encoder available in this environment.");
  }

  function decodeBase64(text) {
    if (typeof text !== "string") {
      throw new Error("decodeBase64 expects a string.");
    }
    let binary;
    if (typeof global.atob === "function") {
      binary = global.atob(text);
    } else if (typeof global.Buffer === "function") {
      binary = global.Buffer.from(text, "base64").toString("binary");
    } else {
      throw new Error("No base64 decoder available in this environment.");
    }
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i) & 0xff;
    }
    return bytes;
  }

  function binaryStringFromBytes(bytes) {
    let out = "";
    for (let i = 0; i < bytes.length; i += 1) {
      out += String.fromCharCode(bytes[i]);
    }
    return out;
  }

  function bytesFromBinaryString(value) {
    const bytes = new Uint8Array(value.length);
    for (let i = 0; i < value.length; i += 1) {
      bytes[i] = value.charCodeAt(i) & 0xff;
    }
    return bytes;
  }

  function lzwCompressBinaryString(input) {
    if (!input || input.length === 0) {
      return [];
    }

    const dictionary = new Map();
    for (let i = 0; i < 256; i += 1) {
      dictionary.set(String.fromCharCode(i), i);
    }

    let nextCode = 256;
    let phrase = input.charAt(0);
    const output = [];

    for (let i = 1; i < input.length; i += 1) {
      const currentChar = input.charAt(i);
      const candidate = phrase + currentChar;
      if (dictionary.has(candidate)) {
        phrase = candidate;
      } else {
        output.push(dictionary.get(phrase));
        dictionary.set(candidate, nextCode);
        nextCode += 1;
        phrase = currentChar;
      }
    }

    output.push(dictionary.get(phrase));
    return output;
  }

  function lzwDecompressBinaryString(codes) {
    if (!codes || codes.length === 0) {
      return "";
    }

    const dictionary = [];
    for (let i = 0; i < 256; i += 1) {
      dictionary[i] = String.fromCharCode(i);
    }

    let nextCode = 256;
    let previous = dictionary[codes[0]];
    if (typeof previous !== "string") {
      throw new Error("Invalid compressed payload.");
    }

    let result = previous;

    for (let i = 1; i < codes.length; i += 1) {
      const code = codes[i];
      let entry;
      if (typeof dictionary[code] === "string") {
        entry = dictionary[code];
      } else if (code === nextCode) {
        entry = previous + previous.charAt(0);
      } else {
        throw new Error("Invalid compressed payload code sequence.");
      }

      result += entry;
      dictionary[nextCode] = previous + entry.charAt(0);
      nextCode += 1;
      previous = entry;
    }

    return result;
  }

  function encodeVarints(codes) {
    const out = [];
    for (let i = 0; i < codes.length; i += 1) {
      let value = codes[i] >>> 0;
      while (value >= 0x80) {
        out.push((value & 0x7f) | 0x80);
        value >>>= 7;
      }
      out.push(value);
    }
    return new Uint8Array(out);
  }

  function decodeVarints(bytes) {
    const out = [];
    let value = 0;
    let shift = 0;

    for (let i = 0; i < bytes.length; i += 1) {
      const byte = bytes[i];
      value |= (byte & 0x7f) << shift;
      if (byte & 0x80) {
        shift += 7;
        if (shift > 28) {
          throw new Error("Invalid varint payload.");
        }
      } else {
        out.push(value >>> 0);
        value = 0;
        shift = 0;
      }
    }

    if (shift !== 0) {
      throw new Error("Truncated varint payload.");
    }

    return out;
  }

  function serializeQDomCompressed(documentNode) {
    const text = JSON.stringify(documentNode);
    const bytes = new TextEncoder().encode(text);
    const binary = binaryStringFromBytes(bytes);
    const codes = lzwCompressBinaryString(binary);
    const packed = encodeVarints(codes);
    return "qdom-lzw-base64:" + encodeBase64(packed);
  }

  function deserializeQDomCompressed(payload) {
    if (typeof payload !== "string") {
      throw new Error("Serialized payload must be a string.");
    }
    const prefix = "qdom-lzw-base64:";
    if (!payload.startsWith(prefix)) {
      throw new Error("Unsupported serialized payload prefix.");
    }
    const packed = decodeBase64(payload.slice(prefix.length));
    const codes = decodeVarints(packed);
    const binary = lzwDecompressBinaryString(codes);
    const utf8 = bytesFromBinaryString(binary);
    const text = new TextDecoder().decode(utf8);
    const parsed = JSON.parse(text);
    return reviveQDomTree(parsed);
  }

  function reviveQDomTree(value) {
    if (Array.isArray(value)) {
      return value.map(reviveQDomTree);
    }
    if (!value || typeof value !== "object") {
      return value;
    }
    const kind = String(value.kind || "").trim().toLowerCase();
    if (!kind) {
      const out = {};
      const keys = Object.keys(value);
      for (let i = 0; i < keys.length; i += 1) {
        const key = keys[i];
        out[key] = reviveQDomTree(value[key]);
      }
      return out;
    }

    if (kind === NODE_TYPES.document) {
      return createDocument({
        version: Number.isFinite(value.version) ? Number(value.version) : 1,
        nodes: reviveQDomTree(Array.isArray(value.nodes) ? value.nodes : []),
        scripts: reviveQDomTree(Array.isArray(value.scripts) ? value.scripts : []),
        source: value.meta && typeof value.meta.source === "string" ? value.meta.source : "",
        meta: reviveQDomTree(value.meta || {}),
      });
    }
    if (kind === NODE_TYPES.element) {
      return createElementNode({
        tagName: value.tagName,
        attributes: reviveQDomTree(value.attributes || {}),
        children: reviveQDomTree(Array.isArray(value.children) ? value.children : []),
        textContent: typeof value.textContent === "string" ? value.textContent : null,
        selectorMode: value.selectorMode,
        selectorChain: reviveQDomTree(Array.isArray(value.selectorChain) ? value.selectorChain : []),
        meta: reviveQDomTree(value.meta || {}),
      });
    }
    if (kind === NODE_TYPES.text) {
      return createTextNode({
        value: value.value,
        meta: reviveQDomTree(value.meta || {}),
      });
    }
    if (kind === NODE_TYPES.rawHtml) {
      return createRawHtmlNode({
        html: value.html,
        meta: reviveQDomTree(value.meta || {}),
      });
    }
    if (kind === NODE_TYPES.slot) {
      return createSlotNode({
        name: value.name,
        children: reviveQDomTree(Array.isArray(value.children) ? value.children : []),
        meta: reviveQDomTree(value.meta || {}),
      });
    }
    if (kind === NODE_TYPES.component) {
      return createComponentNode({
        componentId: value.componentId,
        definitionType: value.definitionType,
        templateNodes: reviveQDomTree(Array.isArray(value.templateNodes) ? value.templateNodes : []),
        propertyDefinitions: reviveQDomTree(Array.isArray(value.propertyDefinitions) ? value.propertyDefinitions : []),
        methods: reviveQDomTree(Array.isArray(value.methods) ? value.methods : []),
        signalDeclarations: reviveQDomTree(Array.isArray(value.signalDeclarations) ? value.signalDeclarations : []),
        aliasDeclarations: reviveQDomTree(Array.isArray(value.aliasDeclarations) ? value.aliasDeclarations : []),
        wasmConfig: reviveQDomTree(
          value.wasmConfig && typeof value.wasmConfig === "object" && !Array.isArray(value.wasmConfig)
            ? value.wasmConfig
            : null
        ),
        lifecycleScripts: reviveQDomTree(Array.isArray(value.lifecycleScripts) ? value.lifecycleScripts : []),
        attributes: reviveQDomTree(value.attributes || {}),
        properties: reviveQDomTree(Array.isArray(value.properties) ? value.properties : []),
        meta: reviveQDomTree(value.meta || {}),
      });
    }
    if (kind === NODE_TYPES.componentInstance || kind === NODE_TYPES.templateInstance) {
      return createComponentInstanceNode({
        kind: kind,
        componentId: value.componentId,
        tagName: value.tagName,
        attributes: reviveQDomTree(value.attributes || {}),
        props: reviveQDomTree(value.props || {}),
        slots: reviveQDomTree(Array.isArray(value.slots) ? value.slots : []),
        lifecycleScripts: reviveQDomTree(Array.isArray(value.lifecycleScripts) ? value.lifecycleScripts : []),
        children: reviveQDomTree(Array.isArray(value.children) ? value.children : []),
        textContent: typeof value.textContent === "string" ? value.textContent : null,
        selectorMode: value.selectorMode,
        selectorChain: reviveQDomTree(Array.isArray(value.selectorChain) ? value.selectorChain : []),
        meta: reviveQDomTree(value.meta || {}),
      });
    }
    if (kind === NODE_TYPES.scriptRule) {
      return createScriptRule({
        selector: value.selector,
        eventName: value.eventName,
        body: value.body,
        meta: reviveQDomTree(value.meta || {}),
      });
    }
    if (kind === NODE_TYPES.color) {
      return createQColorNode({
        name: value.name,
        value: value.value,
        assignments: reviveQDomTree(value.assignments || null),
        mode: value.mode,
        meta: reviveQDomTree(value.meta || {}),
      });
    }
    const fallback = {};
    const keys = Object.keys(value);
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      fallback[key] = reviveQDomTree(value[key]);
    }
    return fallback;
  }

  function nextQDomHostId() {
    qdomHostIdCounter += 1;
    return "qdom-host-" + qdomHostIdCounter;
  }

  function ensureQDomHostId(qHtmlElement) {
    if (!qHtmlElement || typeof qHtmlElement.getAttribute !== "function") {
      return "";
    }
    const existing = String(qHtmlElement.getAttribute(QDOM_HOST_ID_ATTR) || "").trim();
    if (existing) {
      return existing;
    }
    const generated = nextQDomHostId();
    qHtmlElement.setAttribute(QDOM_HOST_ID_ATTR, generated);
    return generated;
  }

  function isQDomTemplateNode(node) {
    return !!(
      node &&
      node.tagName &&
      String(node.tagName).toLowerCase() === "template" &&
      node.getAttribute &&
      node.getAttribute("data-qdom") === "1"
    );
  }

  function findMappedTemplate(parentNode, hostId) {
    if (!parentNode || !hostId || !parentNode.children) {
      return null;
    }
    const children = parentNode.children;
    for (let i = 0; i < children.length; i += 1) {
      const node = children[i];
      if (!isQDomTemplateNode(node)) {
        continue;
      }
      if (String(node.getAttribute(QDOM_TEMPLATE_OWNER_ATTR) || "").trim() === hostId) {
        return node;
      }
    }
    return null;
  }

  function findMappedTemplatesInDocument(contextNode, hostId) {
    if (!contextNode || !hostId) {
      return [];
    }

    const ownerDocument =
      contextNode.nodeType === 9
        ? contextNode
        : contextNode.ownerDocument || (contextNode.parentNode && contextNode.parentNode.ownerDocument) || null;
    if (!ownerDocument || typeof ownerDocument.querySelectorAll !== "function") {
      return [];
    }

    const candidates = ownerDocument.querySelectorAll("template");
    const out = [];
    for (let i = 0; i < candidates.length; i += 1) {
      const node = candidates[i];
      if (!isQDomTemplateNode(node)) {
        continue;
      }
      if (String(node.getAttribute(QDOM_TEMPLATE_OWNER_ATTR) || "").trim() !== hostId) {
        continue;
      }
      out.push(node);
    }
    return out;
  }

  function findMappedTemplateInDocument(contextNode, hostId) {
    const matches = findMappedTemplatesInDocument(contextNode, hostId);
    return matches.length > 0 ? matches[0] : null;
  }

  function removeDuplicateMappedTemplates(parentNode, hostId, keepTemplate) {
    if (!parentNode || !hostId || !parentNode.children) {
      return;
    }
    const children = Array.from(parentNode.children);
    for (let i = 0; i < children.length; i += 1) {
      const node = children[i];
      if (node === keepTemplate) {
        continue;
      }
      if (!isQDomTemplateNode(node)) {
        continue;
      }
      if (String(node.getAttribute(QDOM_TEMPLATE_OWNER_ATTR) || "").trim() !== hostId) {
        continue;
      }
      parentNode.removeChild(node);
    }
  }

  function removeDuplicateMappedTemplatesInDocument(contextNode, hostId, keepTemplate) {
    const matches = findMappedTemplatesInDocument(contextNode, hostId);
    for (let i = 0; i < matches.length; i += 1) {
      const node = matches[i];
      if (node === keepTemplate) {
        continue;
      }
      if (node.parentNode && typeof node.parentNode.removeChild === "function") {
        node.parentNode.removeChild(node);
      }
    }
  }

  function saveQDomTemplateBefore(qHtmlElement, documentNode, doc) {
    const targetDocument = doc || (qHtmlElement && qHtmlElement.ownerDocument) || global.document;
    if (!targetDocument || !qHtmlElement || !qHtmlElement.parentNode) {
      throw new Error("saveQDomTemplateBefore requires a q-html element attached to a document.");
    }

    const hostId = ensureQDomHostId(qHtmlElement);
    const parentNode = qHtmlElement.parentNode;
    const serialized = serializeQDomCompressed(documentNode);
    let template = findMappedTemplate(parentNode, hostId);
    if (!template) {
      template = findMappedTemplateInDocument(qHtmlElement, hostId);
    }
    if (!template) {
      const previous = qHtmlElement.previousElementSibling;
      if (isQDomTemplateNode(previous) && !String(previous.getAttribute(QDOM_TEMPLATE_OWNER_ATTR) || "").trim()) {
        template = previous;
      }
    }
    if (!template) {
      template = targetDocument.createElement("template");
    }

    template.setAttribute("data-qdom", "1");
    template.setAttribute(QDOM_TEMPLATE_OWNER_ATTR, hostId);
    template.setAttribute("data-qdom-encoding", "qdom-lzw-base64");
    template.textContent = serialized;
    if (template.parentNode !== parentNode || template.nextSibling !== qHtmlElement) {
      parentNode.insertBefore(template, qHtmlElement);
    }
    removeDuplicateMappedTemplates(parentNode, hostId, template);
    removeDuplicateMappedTemplatesInDocument(qHtmlElement, hostId, template);
    return template;
  }

  function loadQDomTemplateBefore(qHtmlElement) {
    if (!qHtmlElement) {
      return null;
    }
    const hostId = ensureQDomHostId(qHtmlElement);
    let template = qHtmlElement.previousElementSibling;
    if (!isQDomTemplateNode(template)) {
      template = findMappedTemplate(qHtmlElement.parentNode, hostId);
    }
    if (!isQDomTemplateNode(template)) {
      template = findMappedTemplateInDocument(qHtmlElement, hostId);
    }
    if (!isQDomTemplateNode(template)) {
      return null;
    }
    const owner = String(template.getAttribute(QDOM_TEMPLATE_OWNER_ATTR) || "").trim();
    if (owner && owner !== hostId) {
      return null;
    }
    if (template.parentNode === qHtmlElement.parentNode && template.nextSibling !== qHtmlElement) {
      qHtmlElement.parentNode.insertBefore(template, qHtmlElement);
    }
    removeDuplicateMappedTemplatesInDocument(qHtmlElement, hostId, template);
    return deserializeQDomCompressed(template.textContent || "");
  }

  function markDirty(target) {
    if (!target || typeof target !== "object") {
      return;
    }
    if (target.kind === NODE_TYPES.document) {
      if (!target.meta || typeof target.meta !== "object") {
        target.meta = {};
      }
      target.meta.dirty = true;
      return;
    }
    if (!target.meta || typeof target.meta !== "object") {
      target.meta = {};
    }
    target.meta.dirty = true;
  }

  function observeQDom(documentNode, onChange) {
    const callback = typeof onChange === "function" ? onChange : function noop() {};
    const proxyCache = new WeakMap();
    let active = true;
    const qdomMethodKinds = new Set([
      NODE_TYPES.document,
      NODE_TYPES.componentInstance,
      NODE_TYPES.templateInstance,
      NODE_TYPES.slot,
    ]);

    ensureUpdateNonceInTree(documentNode);

    function proxify(target, path) {
      if (!target || typeof target !== "object") {
        return target;
      }
      if (proxyCache.has(target)) {
        return proxyCache.get(target);
      }

      const localPath = Array.isArray(path) ? path.slice() : [];
      const proxy = new Proxy(target, {
        get(obj, prop, receiver) {
          if (prop === "qdom") {
            const kind = obj && typeof obj.kind === "string" ? obj.kind : "";
            if (qdomMethodKinds.has(kind)) {
              return function qdomSubtree() {
                return proxify(obj, localPath);
              };
            }
          }
          const value = Reflect.get(obj, prop, receiver);
          if (typeof prop === "symbol") {
            return value;
          }
          return proxify(value, localPath.concat(String(prop)));
        },
        set(obj, prop, value, receiver) {
          const previousValue = obj[prop];
          const didSet = Reflect.set(obj, prop, value, receiver);
          if (!didSet || !active) {
            return didSet;
          }

          if (previousValue !== value) {
            const mutationPath = localPath.concat(String(prop));
            markDirty(obj);
            markDirty(documentNode);
            setUpdateNonce(obj);
            setUpdateNonce(documentNode);
            setUpdateNonce(findNearestNodeForPath(documentNode, mutationPath));
            if (value && (typeof value === "object" || typeof value === "function")) {
              ensureUpdateNonceInTree(value);
            }
            callback({
              type: "set",
              path: mutationPath,
              oldValue: previousValue,
              newValue: value,
              target: obj,
            });
          }
          return true;
        },
        deleteProperty(obj, prop) {
          if (!Object.prototype.hasOwnProperty.call(obj, prop)) {
            return true;
          }
          const previousValue = obj[prop];
          const didDelete = Reflect.deleteProperty(obj, prop);
          if (didDelete && active) {
            const mutationPath = localPath.concat(String(prop));
            markDirty(obj);
            markDirty(documentNode);
            setUpdateNonce(obj);
            setUpdateNonce(documentNode);
            setUpdateNonce(findNearestNodeForPath(documentNode, mutationPath));
            callback({
              type: "delete",
              path: mutationPath,
              oldValue: previousValue,
              target: obj,
            });
          }
          return didDelete;
        },
      });

      proxyCache.set(target, proxy);
      return proxy;
    }

    return {
      qdom: proxify(documentNode, []),
      disconnect: function disconnect() {
        active = false;
      },
    };
  }

  const api = {
    QDomNode: QDomNode,
    QDocumentNode: QDocumentNode,
    QElementNode: QElementNode,
    QTextNode: QTextNode,
    QRawHtmlNode: QRawHtmlNode,
    QComponentNode: QComponentNode,
    QComponentInstanceNode: QComponentInstanceNode,
    QTemplateInstanceNode: QTemplateInstanceNode,
    QSlotNode: QSlotNode,
    QScriptRuleNode: QScriptRuleNode,
    QColorNode: QColorNode,
    NODE_TYPES: NODE_TYPES,
    TEXT_ALIASES: TEXT_ALIASES,
    createDocument: createDocument,
    createElementNode: createElementNode,
    createTextNode: createTextNode,
    createRawHtmlNode: createRawHtmlNode,
    createComponentNode: createComponentNode,
    createComponentInstanceNode: createComponentInstanceNode,
    createSlotNode: createSlotNode,
    createScriptRule: createScriptRule,
    createQColorNode: createQColorNode,
    isNode: isNode,
    walkQDom: walkQDom,
    cloneDocument: cloneDocument,
    ensureStringArray: ensureStringArray,
    mergeClasses: mergeClasses,
    observeQDom: observeQDom,
    UPDATE_NONCE_KEY: UPDATE_NONCE_KEY,
    createUpdateNonceToken: createUpdateNonceToken,
    setUpdateNonce: setUpdateNonce,
    ensureUpdateNonce: ensureUpdateNonce,
    serializeQDomCompressed: serializeQDomCompressed,
    deserializeQDomCompressed: deserializeQDomCompressed,
    saveQDomTemplateBefore: saveQDomTemplateBefore,
    loadQDomTemplateBefore: loadQDomTemplateBefore,
  };

  modules.qdomCore = api;
})(typeof globalThis !== "undefined" ? globalThis : window);

/*** END: modules/qdom-core/src/qdom-core.js ***/

/*** BEGIN: modules/qhtml-parser/src/qhtml-parser.js ***/
(function attachQHtmlParser(global) {
  const modules = global.QHtmlModules || (global.QHtmlModules = {});
  const core = modules.qdomCore;

  if (!core) {
    throw new Error("qhtml-parser requires qdom-core to be loaded first.");
  }

  const KNOWN_HTML_TAGS = new Set([
    "a", "abbr", "address", "article", "aside", "audio", "b", "base", "blockquote", "body", "br",
    "button", "canvas", "caption", "cite", "code", "col", "colgroup", "data", "datalist", "dd", "del",
    "details", "dfn", "dialog", "div", "dl", "dt", "em", "embed", "fieldset", "figcaption", "figure",
    "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "head", "header", "hr", "html", "i",
    "iframe", "img", "input", "label", "legend", "li", "link", "main", "meta", "meter", "nav", "noscript",
    "object", "ol", "optgroup", "option", "output", "p", "param", "picture", "pre", "progress", "q", "rp",
    "rt", "ruby", "s", "samp", "script", "section", "select", "slot", "small", "source", "span", "strong",
    "style", "sub", "summary", "sup", "table", "tbody", "td", "template", "textarea", "tfoot", "th", "thead",
    "time", "title", "tr", "track", "u", "ul", "var", "video", "wbr", "center"
  ]);

  const TEXT_BLOCK_KEYWORDS = new Set(["text", "innertext"]);
  const LIFECYCLE_BLOCKS = new Set(["onready", "onload", "onloaded"]);
  const BINDING_EXPRESSION_KEYWORDS = new Set(["q-bind", "q-script"]);
  const DEPRECATED_FEATURE_WARNED = new Set();
  const CANONICAL_KEYWORD_TARGETS = new Set([
    "q-component",
    "q-template",
    "q-macro",
    "q-rewrite",
    "q-script",
    "q-bind",
    "q-property",
    "q-signal",
    "q-alias",
    "q-wasm",
    "q-style",
    "q-style-class",
    "q-theme",
    "q-default-theme",
    "q-color",
    "q-color-schema",
    "q-color-theme",
    "q-import",
    "slot",
    "style",
    "text",
    "html",
  ]);

  function normalizeWasmMode(value) {
    const mode = String(value || "").trim().toLowerCase();
    if (mode === "main" || mode === "main-thread" || mode === "mainthread") {
      return "main";
    }
    if (mode === "worker" || mode === "worker-thread" || mode === "workerthread") {
      return "worker";
    }
    return "";
  }

  function parseWasmBoolean(value) {
    const text = String(value || "").trim().toLowerCase();
    if (!text) {
      return null;
    }
    if (text === "true" || text === "1" || text === "yes" || text === "on") {
      return true;
    }
    if (text === "false" || text === "0" || text === "no" || text === "off") {
      return false;
    }
    return null;
  }

  function parseWasmPositiveInteger(value) {
    const parsed = Number(String(value || "").trim());
    if (!Number.isFinite(parsed)) {
      return null;
    }
    const rounded = Math.floor(parsed);
    if (rounded < 0) {
      return null;
    }
    return rounded;
  }

  function parseQWasmBindingRules(rawBody) {
    const parser = parserFor(String(rawBody || ""));
    const out = [];
    const seen = new Set();
    while (!eof(parser)) {
      skipWhitespaceAndSemicolons(parser);
      if (eof(parser)) {
        break;
      }

      const exportName = parseQColorIdentifier(parser, "q-wasm bind");
      skipWhitespace(parser);
      if (!(peek(parser) === "-" && peek(parser, 1) === ">")) {
        throw ParseError("Expected '->' inside q-wasm bind block", parser.index);
      }
      parser.index += 2;

      skipWhitespace(parser);
      const targetType = String(parseIdentifier(parser) || "").trim().toLowerCase();
      if (targetType !== "method" && targetType !== "signal") {
        throw ParseError("q-wasm bind target must be 'method' or 'signal'", parser.index);
      }

      skipWhitespace(parser);
      const targetName = String(parseIdentifier(parser) || "").trim();
      if (!targetName) {
        throw ParseError("Expected target name in q-wasm bind block", parser.index);
      }

      skipInlineWhitespace(parser);
      const trailing = parseBareValue(parser);
      if (String(trailing || "").trim()) {
        throw ParseError("Unexpected trailing content in q-wasm bind entry", parser.index);
      }

      const dedupeKey = exportName.toLowerCase() + "::" + targetType + "::" + targetName.toLowerCase();
      if (!seen.has(dedupeKey)) {
        seen.add(dedupeKey);
        out.push({
          exportName: exportName,
          targetType: targetType,
          targetName: targetName,
        });
      }

      skipWhitespaceAndSemicolons(parser);
      if (peek(parser) === ",") {
        consume(parser);
      }
    }
    return out;
  }

  function parseQWasmConfig(rawBody, keywordAliases) {
    const parser = parserFor(String(rawBody || ""));
    const config = {
      src: "",
      mode: "",
      awaitWasm: null,
      timeoutMs: null,
      maxPayloadBytes: null,
      exports: [],
      allowImports: [],
      bind: [],
    };
    const seen = {
      exports: new Set(),
      allowImports: new Set(),
      bind: new Set(),
    };

    function pushUnique(list, set, value) {
      const entry = String(value || "").trim();
      const key = entry.toLowerCase();
      if (!entry || set.has(key)) {
        return;
      }
      set.add(key);
      list.push(entry);
    }

    while (!eof(parser)) {
      skipWhitespaceAndSemicolons(parser);
      if (eof(parser)) {
        break;
      }
      const key = String(parseIdentifier(parser) || "").trim();
      const keyLower = key.toLowerCase();
      skipWhitespace(parser);

      if ((keyLower === "exports" || keyLower === "allowimports" || keyLower === "bind") && peek(parser) === "{") {
        consume(parser);
        const blockBody = String(readBalancedBlockContent(parser) || "");
        if (keyLower === "exports") {
          const names = parseQPropertyNames(blockBody);
          for (let i = 0; i < names.length; i += 1) {
            pushUnique(config.exports, seen.exports, names[i]);
          }
        } else if (keyLower === "allowimports") {
          const names = parseQPropertyNames(blockBody);
          for (let i = 0; i < names.length; i += 1) {
            pushUnique(config.allowImports, seen.allowImports, names[i]);
          }
        } else {
          const bindings = parseQWasmBindingRules(blockBody);
          for (let i = 0; i < bindings.length; i += 1) {
            const entry = bindings[i];
            if (!entry || typeof entry !== "object") {
              continue;
            }
            const dedupeKey =
              String(entry.exportName || "").toLowerCase() +
              "::" +
              String(entry.targetType || "").toLowerCase() +
              "::" +
              String(entry.targetName || "").toLowerCase();
            if (!dedupeKey || seen.bind.has(dedupeKey)) {
              continue;
            }
            seen.bind.add(dedupeKey);
            config.bind.push({
              exportName: String(entry.exportName || ""),
              targetType: String(entry.targetType || ""),
              targetName: String(entry.targetName || ""),
            });
          }
        }
        continue;
      }

      if (peek(parser) !== ":") {
        throw ParseError("Expected ':' or '{...}' inside q-wasm", parser.index);
      }
      consume(parser);
      const rawValue = parseValue(parser, keywordAliases);
      const value = String(coercePropertyValue(rawValue) || "").trim();

      if (keyLower === "src") {
        config.src = value;
      } else if (keyLower === "mode") {
        config.mode = normalizeWasmMode(value);
      } else if (keyLower === "awaitwasm") {
        config.awaitWasm = parseWasmBoolean(value);
      } else if (keyLower === "timeoutms") {
        config.timeoutMs = parseWasmPositiveInteger(value);
      } else if (keyLower === "maxpayloadbytes") {
        config.maxPayloadBytes = parseWasmPositiveInteger(value);
      } else if (keyLower === "exports") {
        const names = parseQPropertyNames(value);
        for (let i = 0; i < names.length; i += 1) {
          pushUnique(config.exports, seen.exports, names[i]);
        }
      } else if (keyLower === "allowimports") {
        const names = parseQPropertyNames(value);
        for (let i = 0; i < names.length; i += 1) {
          pushUnique(config.allowImports, seen.allowImports, names[i]);
        }
      } else if (keyLower === "bind") {
        const bindings = parseQWasmBindingRules(value);
        for (let i = 0; i < bindings.length; i += 1) {
          const entry = bindings[i];
          if (!entry || typeof entry !== "object") {
            continue;
          }
          const dedupeKey =
            String(entry.exportName || "").toLowerCase() +
            "::" +
            String(entry.targetType || "").toLowerCase() +
            "::" +
            String(entry.targetName || "").toLowerCase();
          if (!dedupeKey || seen.bind.has(dedupeKey)) {
            continue;
          }
          seen.bind.add(dedupeKey);
          config.bind.push({
            exportName: String(entry.exportName || ""),
            targetType: String(entry.targetType || ""),
            targetName: String(entry.targetName || ""),
          });
        }
      }
      skipWhitespaceAndSemicolons(parser);
      if (peek(parser) === ",") {
        consume(parser);
      }
    }

    return config;
  }

  function ParseError(message, index) {
    const error = new Error(message + " (at index " + index + ")");
    error.name = "QHtmlParseError";
    error.index = index;
    return error;
  }

  function KeywordAliasError(message, index) {
    const error = new Error(message + " (at index " + index + ")");
    error.name = "QHtmlKeywordAliasError";
    error.index = index;
    return error;
  }

  function parserFor(source) {
    return {
      source: String(source || ""),
      index: 0,
      length: String(source || "").length,
    };
  }

  function isIdentifierChar(ch) {
    return /[A-Za-z0-9_\-.#]/.test(ch);
  }

  function peek(parser, offset) {
    return parser.source.charAt(parser.index + (offset || 0));
  }

  function eof(parser) {
    return parser.index >= parser.length;
  }

  function consume(parser) {
    const ch = parser.source.charAt(parser.index);
    parser.index += 1;
    return ch;
  }

  function consumeComment(parser) {
    if (peek(parser) !== "/") {
      return false;
    }
    const next = peek(parser, 1);
    if (next === "/") {
      parser.index += 2;
      while (!eof(parser)) {
        const ch = peek(parser);
        if (ch === "\n" || ch === "\r") {
          break;
        }
        parser.index += 1;
      }
      return true;
    }
    if (next === "*") {
      const start = parser.index;
      parser.index += 2;
      while (!eof(parser) && !(peek(parser) === "*" && peek(parser, 1) === "/")) {
        parser.index += 1;
      }
      if (eof(parser)) {
        throw ParseError("Unterminated comment", start);
      }
      parser.index += 2;
      return true;
    }
    return false;
  }

  function skipWhitespace(parser) {
    while (!eof(parser)) {
      const ch = peek(parser);
      if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
        parser.index += 1;
        continue;
      }
      if (consumeComment(parser)) {
        continue;
      }
      break;
    }
  }

  function skipWhitespaceAndSemicolons(parser) {
    while (!eof(parser)) {
      const ch = peek(parser);
      if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r" || ch === ";") {
        parser.index += 1;
        continue;
      }
      if (consumeComment(parser)) {
        continue;
      }
      break;
    }
  }

  function skipInlineWhitespace(parser) {
    while (!eof(parser)) {
      const ch = peek(parser);
      if (ch === " " || ch === "\t") {
        parser.index += 1;
        continue;
      }
      break;
    }
  }

  function expect(parser, expected) {
    const ch = consume(parser);
    if (ch !== expected) {
      throw ParseError("Expected '" + expected + "' but found '" + ch + "'", parser.index - 1);
    }
  }

  function parseIdentifier(parser) {
    skipWhitespace(parser);
    const start = parser.index;
    while (!eof(parser) && isIdentifierChar(peek(parser))) {
      parser.index += 1;
    }
    if (parser.index === start) {
      throw ParseError("Expected identifier", parser.index);
    }
    return parser.source.slice(start, parser.index);
  }

  function isIdentifierStartChar(ch) {
    return /[A-Za-z_]/.test(String(ch || ""));
  }

  function scanIdentifierTokenAt(source, index) {
    const input = String(source || "");
    let cursor = Math.max(0, Number(index) || 0);
    const first = input.charAt(cursor);
    if (!isIdentifierStartChar(first)) {
      return null;
    }
    cursor += 1;
    while (cursor < input.length && isIdentifierChar(input.charAt(cursor))) {
      cursor += 1;
    }
    const name = input.slice(index, cursor);
    return {
      name: name,
      nameLower: String(name || "").toLowerCase(),
      end: cursor,
    };
  }

  function looksLikeHtmlSyntax(value) {
    const text = String(value || "");
    if (!text) {
      return false;
    }
    if (/<\s*\/?\s*[A-Za-z!][^>]*>/.test(text)) {
      return true;
    }
    if (/<!doctype[\s>]/i.test(text)) {
      return true;
    }
    if (/&[A-Za-z0-9#]+;/.test(text)) {
      return true;
    }
    return false;
  }

  function createRecoveredRawItem(rawSource, start, end) {
    const raw = String(rawSource || "");
    const meaningful = raw.trim();
    if (!meaningful) {
      return null;
    }
    if (looksLikeHtmlSyntax(meaningful)) {
      return {
        type: "HtmlBlock",
        html: meaningful,
        start: start,
        end: end,
        raw: raw,
      };
    }
    return {
      type: "TextBlock",
      text: meaningful,
      start: start,
      end: end,
      raw: raw,
    };
  }

  function isLikelyBlockItemStart(source, index, stopChar) {
    const token = scanIdentifierTokenAt(source, index);
    if (!token) {
      return false;
    }
    const cursor = skipWhitespaceInSource(source, token.end);
    const next = String(source || "").charAt(cursor);
    if (!next) {
      return true;
    }
    if (next === ":" || next === "," || next === "{" || next === ";" || next === "\n" || next === "\r") {
      return true;
    }
    if (stopChar && next === stopChar) {
      return true;
    }
    if (token.nameLower === "function") {
      return true;
    }
    if (token.nameLower === "q-alias") {
      return isIdentifierStartChar(next) || next === "{";
    }
    if (token.nameLower === "q-keyword") {
      return isIdentifierStartChar(next);
    }
    if (isEventBlockName(token.name) && next === "{") {
      return true;
    }
    return false;
  }

  function isLikelyTopLevelItemStart(source, index) {
    const token = scanIdentifierTokenAt(source, index);
    if (!token) {
      return false;
    }
    const cursor = skipWhitespaceInSource(source, token.end);
    const next = String(source || "").charAt(cursor);
    const nameLower = token.nameLower;
    if (!next) {
      return true;
    }
    if (LIFECYCLE_BLOCKS.has(nameLower)) {
      return next === "{";
    }
    if (
      nameLower === "q-template" ||
      nameLower === "q-component" ||
      nameLower === "q-signal" ||
      nameLower === "q-rewrite" ||
      nameLower === "q-macro" ||
      nameLower === "q-style" ||
      nameLower === "q-theme" ||
      nameLower === "q-default-theme"
    ) {
      return isIdentifierStartChar(next) || next === "{";
    }
    if (nameLower === "q-keyword") {
      return isIdentifierStartChar(next);
    }
    if (nameLower === "q-import" || nameLower === "html") {
      return next === "{";
    }
    if (next === "{" || next === ",") {
      return true;
    }
    return false;
  }

  function consumeRecoverableRaw(parser, options) {
    const opts = options || {};
    const mode = String(opts.mode || "block").toLowerCase() === "top" ? "top" : "block";
    const stopChar = typeof opts.stopChar === "string" ? opts.stopChar : "";
    const source = String(parser.source || "");
    const start = parser.index;
    let cursor = start;
    while (cursor < parser.length) {
      const ch = source.charAt(cursor);
      if (stopChar && ch === stopChar) {
        break;
      }
      if (isIdentifierStartChar(ch)) {
        const atBoundary = mode === "top"
          ? isLikelyTopLevelItemStart(source, cursor)
          : isLikelyBlockItemStart(source, cursor, stopChar);
        if (atBoundary) {
          break;
        }
      }
      cursor += 1;
    }
    if (cursor === start && cursor < parser.length) {
      cursor += 1;
    }
    parser.index = cursor;
    return createRecoveredRawItem(source.slice(start, cursor), start, cursor);
  }

  function parseQuotedString(parser) {
    const quote = consume(parser);
    let out = "";

    while (!eof(parser)) {
      const ch = consume(parser);
      if (ch === "\\") {
        const escaped = consume(parser);
        if (escaped === "n") {
          out += "\n";
        } else if (escaped === "r") {
          out += "\r";
        } else if (escaped === "t") {
          out += "\t";
        } else if (escaped === quote) {
          out += quote;
        } else if (escaped === "\\") {
          out += "\\";
        } else {
          out += escaped;
        }
        continue;
      }
      if (ch === quote) {
        return out;
      }
      out += ch;
    }

    throw ParseError("Unterminated string", parser.index);
  }

  function parseBareValue(parser) {
    const start = parser.index;
    while (!eof(parser)) {
      const ch = peek(parser);
      if (ch === "\n" || ch === "\r" || ch === ";" || ch === "}") {
        break;
      }
      parser.index += 1;
    }
    return parser.source.slice(start, parser.index).trim();
  }

  function resolveBindingExpressionKeyword(lowerKeyword, keywordAliases) {
    const normalized = String(lowerKeyword || "").trim().toLowerCase();
    if (BINDING_EXPRESSION_KEYWORDS.has(normalized)) {
      return normalized;
    }
    if (!(keywordAliases instanceof Map)) {
      return "";
    }
    const aliasSpec = keywordAliases.get(normalized);
    if (!aliasSpec || typeof aliasSpec !== "object") {
      return "";
    }
    const mapped = String(
      aliasSpec.replacementFirstLower || readFirstIdentifierLower(String(aliasSpec.replacementHead || ""))
    )
      .trim()
      .toLowerCase();
    return BINDING_EXPRESSION_KEYWORDS.has(mapped) ? mapped : "";
  }

  function parseExpressionValue(parser, keywordAliases) {
    const snapshot = parser.index;
    const first = peek(parser);
    if (!/[A-Za-z_]/.test(String(first || ""))) {
      return null;
    }
    const keyword = parseIdentifier(parser);
    const lowerKeyword = String(keyword || "").trim().toLowerCase();
    const resolvedKeyword = resolveBindingExpressionKeyword(lowerKeyword, keywordAliases);
    if (!resolvedKeyword) {
      parser.index = snapshot;
      return null;
    }

    skipWhitespace(parser);
    if (peek(parser) !== "{") {
      parser.index = snapshot;
      return null;
    }

    consume(parser);
    const scriptBody = readBalancedBlockContent(parser);
    return {
      type: resolvedKeyword === "q-bind" ? "QBindExpression" : "QScriptExpression",
      keyword: resolvedKeyword,
      script: scriptBody,
      raw: parser.source.slice(snapshot, parser.index),
      start: snapshot,
      end: parser.index,
    };
  }

  function parseValue(parser, keywordAliases) {
    skipWhitespace(parser);
    const ch = peek(parser);
    if (ch === '"' || ch === "'") {
      return parseQuotedString(parser);
    }
    const expression = parseExpressionValue(parser, keywordAliases);
    if (expression) {
      return expression;
    }
    return parseBareValue(parser);
  }

  function parseSelectorList(parser, firstSelector) {
    const selectors = [firstSelector || parseSelectorToken(parser)];
    skipWhitespace(parser);
    while (peek(parser) === ",") {
      consume(parser);
      skipWhitespace(parser);
      selectors.push(parseSelectorToken(parser));
      skipWhitespace(parser);
    }
    return selectors;
  }

  function isValidSelectorToken(token) {
    const value = String(token || "").trim();
    if (!value) {
      return false;
    }
    if (!/^(?:[^.#\s]+)?(?:[.#][A-Za-z_][A-Za-z0-9_-]*)*$/.test(value)) {
      return false;
    }
    if (value.charAt(0) === "." || value.charAt(0) === "#") {
      return /^(?:[.#][A-Za-z_][A-Za-z0-9_-]*)+$/.test(value);
    }
    return true;
  }

  function parseSelectorTokenTail(parser, baseToken) {
    let token = String(baseToken || "");

    while (peek(parser) === "." || peek(parser) === "#") {
      const marker = consume(parser);
      if (!isIdentifierStartChar(peek(parser))) {
        throw ParseError("Expected identifier after '" + marker + "' in selector", parser.index);
      }
      token += marker + parseIdentifier(parser);
    }

    if (!isValidSelectorToken(token)) {
      throw ParseError("Invalid selector token '" + token + "'", parser.index);
    }
    return token;
  }

  function parseSelectorToken(parser) {
    skipWhitespace(parser);
    const start = parser.index;
    let token = "";
    if (isIdentifierStartChar(peek(parser))) {
      token = String(parseIdentifier(parser) || "");
    } else if (peek(parser) === "." || peek(parser) === "#") {
      while (peek(parser) === "." || peek(parser) === "#") {
        const marker = consume(parser);
        if (!isIdentifierStartChar(peek(parser))) {
          throw ParseError("Expected identifier after '" + marker + "' in selector", parser.index);
        }
        token += marker + parseIdentifier(parser);
      }
    }
    if (!token) {
      throw ParseError("Expected selector", start);
    }
    return parseSelectorTokenTail(parser, token);
  }

  function readBalancedBlockContent(parser) {
    let depth = 1;
    let quote = "";
    let escaped = false;
    let inLineComment = false;
    let inBlockComment = false;
    let out = "";

    while (!eof(parser)) {
      const ch = consume(parser);
      const next = peek(parser);

      if (inLineComment) {
        out += ch;
        if (ch === "\n" || ch === "\r") {
          inLineComment = false;
        }
        continue;
      }

      if (inBlockComment) {
        out += ch;
        if (ch === "*" && next === "/") {
          out += consume(parser);
          inBlockComment = false;
        }
        continue;
      }

      if (quote) {
        if (escaped) {
          out += ch;
          escaped = false;
          continue;
        }
        if (ch === "\\") {
          out += ch;
          escaped = true;
          continue;
        }
        if (ch === quote) {
          quote = "";
        }
        out += ch;
        continue;
      }

      if (ch === '"' || ch === "'" || ch === "`") {
        quote = ch;
        out += ch;
        continue;
      }

      if (ch === "/" && next === "/") {
        out += ch;
        out += consume(parser);
        inLineComment = true;
        continue;
      }

      if (ch === "/" && next === "*") {
        out += ch;
        out += consume(parser);
        inBlockComment = true;
        continue;
      }

      if (ch === "\\") {
        if (next === "{" || next === "}" || next === "\\") {
          out += consume(parser);
          continue;
        }
        out += ch;
        continue;
      }

      if (ch === "{") {
        depth += 1;
        out += ch;
      } else if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          return out;
        }
        out += ch;
      } else {
        out += ch;
      }
    }

    throw ParseError("Unterminated block", parser.index);
  }

  function isEventBlockName(name) {
    return /^on[A-Za-z0-9_]+$/i.test(String(name || ""));
  }

  function parseLeadingSelectorDirectiveBlocks(parser) {
    const directives = [];

    while (!eof(parser)) {
      skipWhitespace(parser);
      const snapshot = parser.index;
      if (peek(parser) !== "{") {
        break;
      }

      consume(parser);
      const rawBody = readBalancedBlockContent(parser);
      const value = String(rawBody || "").trim();

      skipWhitespace(parser);
      const looksDirective = !!value && /^[A-Za-z0-9_-]+(?:\s+[A-Za-z0-9_-]+)*$/.test(value);
      if (!looksDirective || peek(parser) !== "{") {
        parser.index = snapshot;
        break;
      }

      directives.push(value);
    }

    return directives;
  }

  function parseQPropertyNames(rawBody) {
    const input = String(rawBody || "");
    const names = [];
    const seen = new Set();
    const matches = input.match(/[A-Za-z_][A-Za-z0-9_-]*/g) || [];
    for (let i = 0; i < matches.length; i += 1) {
      const name = String(matches[i] || "").trim();
      const normalized = name.toLowerCase();
      if (!name || seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      names.push(name);
    }
    return names;
  }

  function parseQColorIdentifier(parser, keyword) {
    skipWhitespace(parser);
    const start = parser.index;
    while (!eof(parser)) {
      const ch = peek(parser);
      if (!ch || ch === "{" || ch === "}" || ch === ":" || ch === "," || ch === ";" || /\s/.test(ch)) {
        break;
      }
      parser.index += 1;
    }
    const value = parser.source.slice(start, parser.index).trim();
    if (!value) {
      throw ParseError("Expected identifier after " + String(keyword || "q-color"), parser.index);
    }
    return value;
  }

  function isLikelyCssColorValue(value) {
    const text = String(value || "").trim();
    if (!text) {
      return false;
    }
    if (/^#[0-9a-f]{3,8}$/i.test(text)) {
      return true;
    }
    if (/^(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)\s*\(/i.test(text)) {
      return true;
    }
    if (/^var\s*\(/i.test(text)) {
      return true;
    }
    if (/gradient\s*\(/i.test(text)) {
      return true;
    }
    if (/^(?:transparent|currentcolor|inherit|initial|unset|revert|revert-layer)$/i.test(text)) {
      return true;
    }
    if (/^[A-Za-z][A-Za-z0-9_-]*$/.test(text)) {
      return true;
    }
    return false;
  }

  function normalizeColorLookupKey(name) {
    return String(name || "")
      .trim()
      .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }

  function normalizeColorLookupPattern(name) {
    return String(name || "")
      .trim()
      .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
      .toLowerCase()
      .replace(/[^a-z0-9*]/g, "");
  }

  function hasQColorWildcardPattern(name) {
    return normalizeColorLookupPattern(name).indexOf("*") >= 0;
  }

  function doesQColorRequestMatchAreaName(requestPattern, areaName) {
    const pattern = normalizeColorLookupPattern(requestPattern);
    const candidate = normalizeColorLookupKey(areaName);
    if (!pattern || !candidate) {
      return false;
    }
    if (pattern.indexOf("*") < 0) {
      return pattern === candidate;
    }
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp("^" + escaped.replace(/\*/g, ".*") + "$");
    return regex.test(candidate);
  }

  function doesQColorRequestMatchAnyArea(requestPatterns, areaName) {
    const patterns = Array.isArray(requestPatterns) ? requestPatterns : [];
    for (let i = 0; i < patterns.length; i += 1) {
      if (doesQColorRequestMatchAreaName(patterns[i], areaName)) {
        return true;
      }
    }
    return false;
  }

  function normalizeQColorResolvedValue(value) {
    const raw = String(value == null ? "" : value).trim();
    if (!raw) {
      return "";
    }
    if (/^--[A-Za-z0-9_-]+$/.test(raw)) {
      return "var(" + raw + ")";
    }
    return raw;
  }

  function levenshtein(a, b) {
    const m = a.length;
    const n = b.length;
    const dp = Array.from({ length: m + 1 }, function makeRow() {
      return Array(n + 1).fill(0);
    });

    for (let i = 0; i <= m; i += 1) {
      dp[i][0] = i;
    }
    for (let j = 0; j <= n; j += 1) {
      dp[0][j] = j;
    }

    for (let i = 1; i <= m; i += 1) {
      for (let j = 1; j <= n; j += 1) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + cost
        );
      }
    }
    return dp[m][n];
  }

  function bigrams(s) {
    const g = [];
    for (let i = 0; i < s.length - 1; i += 1) {
      g.push(s.slice(i, i + 2));
    }
    return g;
  }

  function bigramScore(a, b) {
    const A = bigrams(a);
    const B = bigrams(b);
    let match = 0;
    for (let i = 0; i < A.length; i += 1) {
      if (B.includes(A[i])) {
        match += 1;
      }
    }
    return match / Math.max(A.length, B.length);
  }

  function splitTokens(s) {
    return String(s || "")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .toLowerCase()
      .split(/[\s\-_]+/);
  }

  function buildTokenIndex(choices) {
    const vocab = new Set();
    for (let i = 0; i < choices.length; i += 1) {
      const tokens = splitTokens(choices[i]);
      for (let j = 0; j < tokens.length; j += 1) {
        vocab.add(tokens[j]);
      }
    }
    return Array.from(vocab);
  }

  function tokenScore(query, vocab) {
    const q = String(query || "").toLowerCase();
    let score = 0;
    for (let i = 0; i < vocab.length; i += 1) {
      if (q.includes(vocab[i])) {
        score += 1;
      }
    }
    return score;
  }

  function fuzzyResolve(query, choices, topK) {
    const limit = Number.isFinite(topK) ? Math.max(1, Math.floor(topK)) : 5;
    const vocab = buildTokenIndex(choices);
    const ranked = choices.map(function mapCandidate(candidate) {
      const tokScore = tokenScore(query, vocab);
      const bigScore = bigramScore(query, candidate);
      const lev = levenshtein(query, candidate);
      const score = tokScore * 5 + bigScore * 4 - lev * 0.5;
      return { candidate: candidate, score: score };
    });
    ranked.sort(function sortByScore(a, b) {
      return b.score - a.score;
    });
    return ranked.slice(0, limit);
  }

  function parseQColorValueToken(parser, keywordAliases) {
    skipWhitespace(parser);
    const expression = parseExpressionValue(parser, keywordAliases);
    if (expression) {
      return String(expression.raw || "").trim();
    }
    const start = parser.index;
    let quote = "";
    let escaped = false;
    let parenDepth = 0;
    let bracketDepth = 0;
    while (!eof(parser)) {
      const ch = peek(parser);
      if (quote) {
        parser.index += 1;
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === "\\") {
          escaped = true;
          continue;
        }
        if (ch === quote) {
          quote = "";
        }
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") {
        quote = ch;
        parser.index += 1;
        continue;
      }
      if (ch === "(") {
        parenDepth += 1;
        parser.index += 1;
        continue;
      }
      if (ch === ")" && parenDepth > 0) {
        parenDepth -= 1;
        parser.index += 1;
        continue;
      }
      if (ch === "[") {
        bracketDepth += 1;
        parser.index += 1;
        continue;
      }
      if (ch === "]" && bracketDepth > 0) {
        bracketDepth -= 1;
        parser.index += 1;
        continue;
      }
      if (parenDepth === 0 && bracketDepth === 0) {
        if (ch === "," || ch === ";" || ch === "\n" || ch === "\r" || ch === "}") {
          break;
        }
      }
      parser.index += 1;
    }
    return parser.source.slice(start, parser.index).trim();
  }

  function parseQColorAssignments(rawBody, keywordAliases) {
    const parser = parserFor(String(rawBody || ""));
    const out = {};
    while (!eof(parser)) {
      skipWhitespaceAndSemicolons(parser);
      if (eof(parser)) {
        break;
      }
      const key = parseQColorIdentifier(parser, "q-color-theme");
      skipWhitespace(parser);
      let value = "";
      if (peek(parser) === ":") {
        consume(parser);
        value = parseQColorValueToken(parser, keywordAliases);
      } else if (peek(parser) === "{") {
        consume(parser);
        value = String(readBalancedBlockContent(parser) || "").trim();
      } else {
        throw ParseError("Expected ':' or '{...}' inside q-color-theme", parser.index);
      }
      if (value) {
        out[key] = value;
      }
      skipWhitespaceAndSemicolons(parser);
      if (peek(parser) === ",") {
        consume(parser);
      }
    }
    return out;
  }

  function parseQColorSchemaEntries(rawBody) {
    const parser = parserFor(String(rawBody || ""));
    const out = {};
    while (!eof(parser)) {
      skipWhitespaceAndSemicolons(parser);
      if (eof(parser)) {
        break;
      }
      const areaName = parseQColorIdentifier(parser, "q-color-schema");
      skipWhitespace(parser);
      if (peek(parser) !== "{") {
        throw ParseError("Expected '{' inside q-color-schema", parser.index);
      }
      consume(parser);
      const body = String(readBalancedBlockContent(parser) || "").trim();
      if (normalizeColorLookupKey(areaName) === "area") {
        const names = body.match(/[A-Za-z_][A-Za-z0-9_-]*/g) || [];
        for (let i = 0; i < names.length; i += 1) {
          const area = String(names[i] || "").trim();
          if (!area) {
            continue;
          }
          out[area] = inferQColorCssProperty(area);
        }
      } else {
        out[areaName] = body || inferQColorCssProperty(areaName);
      }
      skipWhitespaceAndSemicolons(parser);
      if (peek(parser) === ",") {
        consume(parser);
      }
    }
    return out;
  }

  function parseQColorApplyBlock(rawBody, keywordAliases) {
    const parser = parserFor(String(rawBody || ""));
    const out = {
      areas: [],
      assignments: {},
    };
    const seen = new Set();
    while (!eof(parser)) {
      skipWhitespaceAndSemicolons(parser);
      if (eof(parser)) {
        break;
      }
      const areaName = parseQColorIdentifier(parser, "q-color");
      const normalized = normalizeColorLookupPattern(areaName);
      skipWhitespace(parser);
      if (peek(parser) === ":") {
        consume(parser);
        const value = parseQColorValueToken(parser, keywordAliases);
        if (value) {
          out.assignments[areaName] = value;
        }
      } else {
        if (normalized && !seen.has(normalized)) {
          seen.add(normalized);
          out.areas.push(areaName);
          out.assignments[areaName] = true;
        }
      }
      skipWhitespaceAndSemicolons(parser);
      if (peek(parser) === ",") {
        consume(parser);
      }
    }
    return out;
  }

  function parseQStyleDeclarations(rawBody, keywordAliases) {
    const parser = parserFor(String(rawBody || ""));
    const out = {};
    const classes = [];
    const seenClasses = new Set();
    const styleClassKeywords = collectAliasesTargeting(keywordAliases, "q-style-class");
    while (!eof(parser)) {
      skipWhitespaceAndSemicolons(parser);
      if (eof(parser)) {
        break;
      }
      const propertyName = parseQColorIdentifier(parser, "q-style");
      const propertyLower = String(propertyName || "").trim().toLowerCase();
      skipWhitespace(parser);
      if (styleClassKeywords.has(propertyLower)) {
        if (peek(parser) !== "{") {
          throw ParseError("Expected '{...}' after q-style-class inside q-style", parser.index);
        }
        consume(parser);
        const classBody = String(readBalancedBlockContent(parser) || "");
        const parsedClasses = parseQPropertyNames(classBody);
        if (parsedClasses.length === 0) {
          if (typeof console !== "undefined" && console && typeof console.warn === "function") {
            console.warn("qhtml q-style warning: q-style-class has no class names", {
              styleBlock: String(rawBody || "").trim(),
            });
          }
        } else {
          for (let i = 0; i < parsedClasses.length; i += 1) {
            const className = String(parsedClasses[i] || "").trim();
            const normalizedClass = className.toLowerCase();
            if (!className || seenClasses.has(normalizedClass)) {
              continue;
            }
            seenClasses.add(normalizedClass);
            classes.push(className);
          }
        }
        skipWhitespaceAndSemicolons(parser);
        if (peek(parser) === ",") {
          consume(parser);
        }
        continue;
      }
      let value = "";
      if (peek(parser) === ":") {
        consume(parser);
        value = parseQColorValueToken(parser, keywordAliases);
      } else if (peek(parser) === "{") {
        consume(parser);
        value = String(readBalancedBlockContent(parser) || "").trim();
      } else {
        throw ParseError("Expected ':' or '{...}' inside q-style", parser.index);
      }
      if (value) {
        out[propertyName] = value;
      }
      skipWhitespaceAndSemicolons(parser);
      if (peek(parser) === ",") {
        consume(parser);
      }
    }
    return {
      declarations: out,
      classes: classes,
    };
  }

  function parseQThemeRules(rawBody) {
    const parser = parserFor(String(rawBody || ""));
    const out = [];
    while (!eof(parser)) {
      skipWhitespaceAndSemicolons(parser);
      if (eof(parser)) {
        break;
      }
      const selector = parseQColorIdentifier(parser, "q-theme");
      skipWhitespace(parser);
      if (peek(parser) !== "{") {
        throw ParseError("Expected '{...}' inside q-theme", parser.index);
      }
      consume(parser);
      const body = String(readBalancedBlockContent(parser) || "").trim();
      const styleNames = parseQPropertyNames(body);
      out.push({
        selector: selector,
        styles: styleNames,
      });
      skipWhitespaceAndSemicolons(parser);
      if (peek(parser) === ",") {
        consume(parser);
      }
    }
    return out;
  }

  function readBalancedParenthesizedContent(parser) {
    let depth = 1;
    let quote = "";
    let escaped = false;
    let out = "";

    while (!eof(parser)) {
      const ch = consume(parser);

      if (quote) {
        if (escaped) {
          out += ch;
          escaped = false;
          continue;
        }
        if (ch === "\\") {
          out += ch;
          escaped = true;
          continue;
        }
        if (ch === quote) {
          quote = "";
        }
        out += ch;
        continue;
      }

      if (ch === '"' || ch === "'" || ch === "`") {
        quote = ch;
        out += ch;
        continue;
      }

      if (ch === "\\") {
        const next = peek(parser);
        if (next === "(" || next === ")" || next === "\\") {
          out += consume(parser);
          continue;
        }
        out += ch;
        continue;
      }

      if (ch === "(") {
        depth += 1;
        out += ch;
      } else if (ch === ")") {
        depth -= 1;
        if (depth === 0) {
          return out;
        }
        out += ch;
      } else {
        out += ch;
      }
    }

    throw ParseError("Unterminated signal parameter list", parser.index);
  }

  function parseSignalParameterNames(rawParams) {
    const text = String(rawParams || "");
    if (!text.trim()) {
      return [];
    }
    const out = [];
    const seen = new Set();
    const parts = text.split(",");
    for (let i = 0; i < parts.length; i += 1) {
      const token = String(parts[i] || "").trim();
      if (!token) {
        continue;
      }
      const match = token.match(/^[A-Za-z_$][A-Za-z0-9_$]*/);
      if (!match) {
        continue;
      }
      const name = String(match[0] || "").trim();
      const normalized = name.toLowerCase();
      if (!name || seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      out.push(name);
    }
    return out;
  }

  function cloneKeywordAliases(keywordAliases) {
    if (keywordAliases instanceof Map) {
      return new Map(keywordAliases);
    }
    return new Map();
  }

  function keywordAliasesToObject(keywordAliases) {
    if (!(keywordAliases instanceof Map) || keywordAliases.size === 0) {
      return null;
    }
    const out = {};
    keywordAliases.forEach(function eachAlias(spec, key) {
      const aliasName = String((spec && spec.name) || key || "").trim();
      const replacementHead = String((spec && spec.replacementHead) || "").trim();
      if (!aliasName || !replacementHead) {
        return;
      }
      out[aliasName] = replacementHead;
    });
    return Object.keys(out).length > 0 ? out : null;
  }

  function readFirstIdentifierLower(text) {
    const input = String(text || "");
    const start = skipWhitespaceInSource(input, 0);
    const token = scanIdentifierTokenAt(input, start);
    return token && token.nameLower ? token.nameLower : "";
  }

  function readSingleIdentifierLower(text) {
    const input = String(text || "");
    const start = skipWhitespaceInSource(input, 0);
    const token = scanIdentifierTokenAt(input, start);
    if (!token || !token.nameLower) {
      return "";
    }
    const end = skipWhitespaceInSource(input, token.end);
    if (end < input.length) {
      return "";
    }
    return token.nameLower;
  }

  function parseKeywordAliasDeclaration(parser, keywordAliases, declarationStart) {
    const aliasName = parseIdentifier(parser);
    const normalizedAliasName = String(aliasName || "").trim();
    const normalizedAliasLower = normalizedAliasName.toLowerCase();
    if (!normalizedAliasName) {
      throw ParseError("Expected alias name after q-keyword", parser.index);
    }

    skipWhitespace(parser);
    if (peek(parser) !== "{") {
      throw ParseError("Expected '{' after q-keyword alias name", parser.index);
    }
    consume(parser);

    const replacementHeadRaw = readBalancedBlockContent(parser);
    const replacementHead = String(replacementHeadRaw || "").trim();
    if (!replacementHead) {
      throw KeywordAliasError("q-keyword replacement cannot be empty", declarationStart);
    }

    let effectiveAliasName = normalizedAliasName;
    let effectiveAliasLower = normalizedAliasLower;
    let effectiveReplacementHead = replacementHead;
    let replacementFirstLower = readFirstIdentifierLower(effectiveReplacementHead);

    const singleReplacementLower = readSingleIdentifierLower(effectiveReplacementHead);
    if (
      CANONICAL_KEYWORD_TARGETS.has(normalizedAliasLower) &&
      singleReplacementLower &&
      !CANONICAL_KEYWORD_TARGETS.has(singleReplacementLower)
    ) {
      // Accept reversed declarations too:
      // q-keyword q-component { component } -> q-keyword component { q-component }
      effectiveAliasName = singleReplacementLower;
      effectiveAliasLower = singleReplacementLower;
      effectiveReplacementHead = normalizedAliasName;
      replacementFirstLower = normalizedAliasLower;
    }

    if (replacementFirstLower && replacementFirstLower === effectiveAliasLower) {
      throw KeywordAliasError("q-keyword '" + effectiveAliasName + "' cannot reference itself", declarationStart);
    }
    if (replacementFirstLower && keywordAliases instanceof Map && keywordAliases.has(replacementFirstLower)) {
      throw KeywordAliasError(
        "q-keyword '" + effectiveAliasName + "' cannot target another q-keyword '" + replacementFirstLower + "'",
        declarationStart
      );
    }

    const spec = {
      name: effectiveAliasName,
      nameLower: effectiveAliasLower,
      replacementHead: effectiveReplacementHead,
      replacementFirstLower: replacementFirstLower,
    };
    if (keywordAliases instanceof Map) {
      keywordAliases.set(effectiveAliasLower, spec);
    }
    return spec;
  }

  function ensureAliasReplacementIsDirect(aliasSpec, keywordAliases, parser, atIndex) {
    const spec = aliasSpec && typeof aliasSpec === "object" ? aliasSpec : null;
    if (!spec || !(keywordAliases instanceof Map)) {
      return;
    }
    const replacementFirstLower =
      spec.replacementFirstLower || readFirstIdentifierLower(String(spec.replacementHead || ""));
    if (!replacementFirstLower) {
      return;
    }
    if (replacementFirstLower === String(spec.nameLower || "").toLowerCase()) {
      throw KeywordAliasError("q-keyword '" + spec.name + "' cannot reference itself", atIndex);
    }
    if (keywordAliases.has(replacementFirstLower)) {
      throw KeywordAliasError(
        "q-keyword '" + spec.name + "' cannot target another q-keyword '" + replacementFirstLower + "'",
        atIndex
      );
    }
  }

  function findItemBoundaryInSource(source, startIndex, options) {
    const input = String(source || "");
    const opts = options || {};
    const mode = String(opts.mode || "block").toLowerCase() === "top" ? "top" : "block";
    const stopChar = mode === "block" ? String(opts.stopChar || "}") : "";
    let i = Math.max(0, Number(startIndex) || 0);
    let depth = 0;
    let quote = "";
    let escaped = false;

    while (i < input.length) {
      const ch = input.charAt(i);

      if (quote) {
        if (escaped) {
          escaped = false;
          i += 1;
          continue;
        }
        if (ch === "\\") {
          escaped = true;
          i += 1;
          continue;
        }
        if (ch === quote) {
          quote = "";
        }
        i += 1;
        continue;
      }

      if (ch === "/" && input.charAt(i + 1) === "/") {
        i += 2;
        while (i < input.length) {
          const lineCh = input.charAt(i);
          if (lineCh === "\n" || lineCh === "\r") {
            break;
          }
          i += 1;
        }
        continue;
      }
      if (ch === "/" && input.charAt(i + 1) === "*") {
        i += 2;
        while (i < input.length && !(input.charAt(i) === "*" && input.charAt(i + 1) === "/")) {
          i += 1;
        }
        i = i < input.length ? i + 2 : input.length;
        continue;
      }

      if (ch === '"' || ch === "'" || ch === "`") {
        quote = ch;
        i += 1;
        continue;
      }

      if (ch === "{") {
        depth += 1;
        i += 1;
        continue;
      }

      if (ch === "}") {
        if (depth === 0) {
          return i;
        }
        depth -= 1;
        i += 1;
        continue;
      }

      if (depth === 0) {
        if (ch === ";" || ch === "\n" || ch === "\r") {
          return i;
        }
        if (mode === "block" && stopChar && ch === stopChar) {
          return i;
        }
      }

      i += 1;
    }

    return input.length;
  }

  function parseAliasedItemsFromSource(sourceText, mode, keywordAliases) {
    const text = String(sourceText || "");
    if (!text.trim()) {
      return [];
    }

    if (String(mode || "").toLowerCase() === "top") {
      const nestedAst = parseQHtmlToAst(text, {
        keywordAliases: cloneKeywordAliases(keywordAliases),
      });
      return Array.isArray(nestedAst.body) ? nestedAst.body : [];
    }

    const nestedParser = parserFor(text);
    const nestedItems = parseBlockItems(nestedParser, cloneKeywordAliases(keywordAliases));
    skipWhitespaceAndSemicolons(nestedParser);
    if (!eof(nestedParser)) {
      throw ParseError("Unable to parse aliased block invocation", nestedParser.index);
    }
    return nestedItems;
  }

  function parseBlockItems(parser, keywordAliases) {
    const scopedKeywordAliases = cloneKeywordAliases(keywordAliases);
    const items = [];

    while (!eof(parser)) {
      skipWhitespaceAndSemicolons(parser);
      if (peek(parser) === "}") {
        break;
      }

      if (!isIdentifierStartChar(peek(parser))) {
        const recovered = consumeRecoverableRaw(parser, { mode: "block", stopChar: "}" });
        if (recovered) {
          items.push(recovered);
        }
        continue;
      }

      const recoveryStart = parser.index;
      try {
        const itemStart = parser.index;
        const nameBase = parseIdentifier(parser);
        const name = parseSelectorTokenTail(parser, nameBase);
        const nameLower = nameBase.toLowerCase();
        const afterName = parser.index;
        skipWhitespace(parser);

        if (nameLower === "q-keyword") {
          parseKeywordAliasDeclaration(parser, scopedKeywordAliases, itemStart);
          continue;
        }

        const aliasSpec = scopedKeywordAliases.get(nameLower);
        if (aliasSpec) {
          ensureAliasReplacementIsDirect(aliasSpec, scopedKeywordAliases, parser, itemStart);
          const itemEnd = findItemBoundaryInSource(parser.source, itemStart, { mode: "block", stopChar: "}" });
          const rest = parser.source.slice(afterName, itemEnd);
          const expandedSource = String(aliasSpec.replacementHead || "") + rest;
          const expandedItems = parseAliasedItemsFromSource(expandedSource, "block", scopedKeywordAliases);
          parser.index = itemEnd;
          for (let i = 0; i < expandedItems.length; i += 1) {
            items.push(expandedItems[i]);
          }
          continue;
        }

        const keywordSnapshot = keywordAliasesToObject(scopedKeywordAliases);
        const nextChar = peek(parser);
        if (nameLower === "q-signal" && nextChar !== "{" && nextChar !== ",") {
          const signalId = parseIdentifier(parser);
          let parameterSource = "";
          let parameterNames = [];
          skipInlineWhitespace(parser);
          if (peek(parser) === "(") {
            consume(parser);
            parameterSource = readBalancedParenthesizedContent(parser);
            parameterNames = parseSignalParameterNames(parameterSource);
          }
          const declarationTailStart = parser.index;
          skipInlineWhitespace(parser);
          if (peek(parser) === "{") {
            consume(parser);
            const signalItems = parseBlockItems(parser, scopedKeywordAliases);
            expect(parser, "}");
            items.push({
              type: "SignalDefinition",
              signalId: signalId,
              items: signalItems,
              keywords: keywordSnapshot,
              start: itemStart,
              end: parser.index,
              raw: parser.source.slice(itemStart, parser.index),
            });
            continue;
          }
          parser.index = declarationTailStart;
          const trailing = parseBareValue(parser);
          const signature =
            String(signalId || "") +
            "(" +
            (parameterSource || parameterNames.join(", ")) +
            ")" +
            (trailing ? " " + trailing : "");
          items.push({
            type: "SignalDeclaration",
            name: String(signalId || "").trim(),
            signature: signature,
            parameters: parameterNames,
            keywords: keywordSnapshot,
            start: itemStart,
            end: parser.index,
            raw: parser.source.slice(itemStart, parser.index),
          });
          continue;
        }
        if (nameLower === "q-property" && nextChar !== "{") {
          const propertyNameStart = parser.index;
          const propertyName = parseIdentifier(parser);
          const propertyNameEnd = parser.index;
          const normalizedPropertyName = String(propertyName || "").trim();
          if (!normalizedPropertyName) {
            throw ParseError("Expected property name after q-property", parser.index);
          }
          items.push({
            type: "QPropertyBlock",
            properties: [normalizedPropertyName],
            keywords: keywordSnapshot,
            start: itemStart,
            end: propertyNameEnd,
            raw: parser.source.slice(itemStart, propertyNameEnd),
          });
          skipWhitespace(parser);
          if (peek(parser) === ":") {
            consume(parser);
            const value = parseValue(parser, scopedKeywordAliases);
            items.push({
              type: "Property",
              name: normalizedPropertyName,
              value: value,
              keywords: keywordSnapshot,
              start: propertyNameStart,
              end: parser.index,
              raw: parser.source.slice(propertyNameStart, parser.index),
            });
          }
          continue;
        }
        if (nameLower === "q-color-schema" && nextChar !== "{") {
          warnDeprecatedSyntaxFeature("q-color-schema");
          const schemaName = parseQColorIdentifier(parser, "q-color-schema");
          skipWhitespace(parser);
          if (peek(parser) !== "{") {
            throw ParseError("Expected '{' after q-color-schema name", parser.index);
          }
          consume(parser);
          const schemaBody = readBalancedBlockContent(parser);
          items.push({
            type: "QColorSchemaDefinition",
            name: schemaName,
            entries: parseQColorSchemaEntries(schemaBody),
            keywords: keywordSnapshot,
            start: itemStart,
            end: parser.index,
            raw: parser.source.slice(itemStart, parser.index),
          });
          continue;
        }
        if (nameLower === "q-color-theme" && nextChar !== "{") {
          warnDeprecatedSyntaxFeature("q-color-theme");
          const themeName = parseQColorIdentifier(parser, "q-color-theme");
          skipWhitespace(parser);
          if (peek(parser) !== "{") {
            throw ParseError("Expected '{' after q-color-theme name", parser.index);
          }
          consume(parser);
          const themeBody = readBalancedBlockContent(parser);
          items.push({
            type: "QColorThemeDefinition",
            name: themeName,
            assignments: parseQColorAssignments(themeBody, scopedKeywordAliases),
            keywords: keywordSnapshot,
            start: itemStart,
            end: parser.index,
            raw: parser.source.slice(itemStart, parser.index),
          });
          continue;
        }
        if (nameLower === "q-color" && nextChar !== "{") {
          warnDeprecatedSyntaxFeature("q-color");
          const setupName = parseQColorIdentifier(parser, "q-color");
          skipWhitespace(parser);
          if (peek(parser) !== "{") {
            throw ParseError("Expected '{' after q-color name", parser.index);
          }
          consume(parser);
          const colorBody = readBalancedBlockContent(parser);
          const parsed = parseQColorApplyBlock(colorBody, scopedKeywordAliases);
          items.push({
            type: "QColorDefinition",
            name: setupName,
            assignments: parsed.assignments,
            areas: parsed.areas,
            keywords: keywordSnapshot,
            start: itemStart,
            end: parser.index,
            raw: parser.source.slice(itemStart, parser.index),
          });
          continue;
        }
        if (nameLower === "q-style" && nextChar !== "{") {
          const styleName = parseQColorIdentifier(parser, "q-style");
          skipWhitespace(parser);
          if (peek(parser) !== "{") {
            throw ParseError("Expected '{' after q-style name", parser.index);
          }
          consume(parser);
          const styleBody = readBalancedBlockContent(parser);
          const parsedStyle = parseQStyleDeclarations(styleBody, scopedKeywordAliases);
          items.push({
            type: "QStyleDefinition",
            name: styleName,
            declarations: parsedStyle.declarations,
            classes: parsedStyle.classes,
            keywords: keywordSnapshot,
            start: itemStart,
            end: parser.index,
            raw: parser.source.slice(itemStart, parser.index),
          });
          continue;
        }
        if (nameLower === "q-theme" && nextChar !== "{") {
          const themeName = parseQColorIdentifier(parser, "q-theme");
          skipWhitespace(parser);
          if (peek(parser) !== "{") {
            throw ParseError("Expected '{' after q-theme name", parser.index);
          }
          consume(parser);
          const themeBody = readBalancedBlockContent(parser);
          items.push({
            type: "QThemeDefinition",
            name: themeName,
            defaultTheme: false,
            rules: parseQThemeRules(themeBody),
            keywords: keywordSnapshot,
            start: itemStart,
            end: parser.index,
            raw: parser.source.slice(itemStart, parser.index),
          });
          continue;
        }
        if (nameLower === "q-default-theme" && nextChar !== "{") {
          const themeName = parseQColorIdentifier(parser, "q-default-theme");
          skipWhitespace(parser);
          if (peek(parser) !== "{") {
            throw ParseError("Expected '{' after q-default-theme name", parser.index);
          }
          consume(parser);
          const themeBody = readBalancedBlockContent(parser);
          items.push({
            type: "QThemeDefinition",
            name: themeName,
            defaultTheme: true,
            rules: parseQThemeRules(themeBody),
            keywords: keywordSnapshot,
            start: itemStart,
            end: parser.index,
            raw: parser.source.slice(itemStart, parser.index),
          });
          continue;
        }
        if (nameLower === "q-template" && nextChar !== "{" && nextChar !== ",") {
          const templateId = parseIdentifier(parser);
          skipWhitespace(parser);
          if (peek(parser) !== "{") {
            throw ParseError("Expected '{' after q-template id", parser.index);
          }
          consume(parser);
          const templateItems = parseBlockItems(parser, scopedKeywordAliases);
          expect(parser, "}");
          items.push({
            type: "TemplateDefinition",
            templateId: templateId,
            items: templateItems,
            keywords: keywordSnapshot,
            start: itemStart,
            end: parser.index,
            raw: parser.source.slice(itemStart, parser.index),
          });
          continue;
        }
        if (nameLower === "q-alias" && nextChar !== "{" && nextChar !== ",") {
          const aliasName = parseIdentifier(parser);
          const normalizedAliasName = String(aliasName || "").trim();
          if (!normalizedAliasName) {
            throw ParseError("Expected alias name after q-alias", parser.index);
          }
          skipWhitespace(parser);
          if (peek(parser) !== "{") {
            throw ParseError("Expected '{' after q-alias name", parser.index);
          }
          consume(parser);
          const aliasBody = readBalancedBlockContent(parser);
          items.push({
            type: "AliasDeclaration",
            name: normalizedAliasName,
            body: compactScriptBody(aliasBody),
            keywords: keywordSnapshot,
            start: itemStart,
            end: parser.index,
            raw: parser.source.slice(itemStart, parser.index),
          });
          continue;
        }
        if (nameLower === "property" && nextChar !== "{") {
          const propertyName = parseIdentifier(parser);
          const normalizedPropertyName = String(propertyName || "").trim();
          if (!normalizedPropertyName) {
            throw ParseError("Expected property name after property", parser.index);
          }
          skipWhitespace(parser);
          if (peek(parser) !== "{") {
            throw ParseError("Expected '{' after property name", parser.index);
          }
          consume(parser);
          const propertyItems = parseBlockItems(parser, scopedKeywordAliases);
          expect(parser, "}");
          items.push({
            type: "PropertyDefinitionBlock",
            name: normalizedPropertyName,
            items: propertyItems,
            keywords: keywordSnapshot,
            start: itemStart,
            end: parser.index,
            raw: parser.source.slice(itemStart, parser.index),
          });
          continue;
        }
        if (nextChar === ":") {
          consume(parser);
          const value = parseValue(parser, scopedKeywordAliases);
          items.push({
            type: "Property",
            name: name,
            value: value,
            keywords: keywordSnapshot,
            start: itemStart,
            end: parser.index,
            raw: parser.source.slice(itemStart, parser.index),
          });
          continue;
        }

        if (nextChar === ",") {
          const selectors = parseSelectorList(parser, name);
          const prefixDirectives = parseLeadingSelectorDirectiveBlocks(parser);
          skipWhitespace(parser);
          if (peek(parser) !== "{") {
            throw ParseError("Expected '{' after selector", parser.index);
          }
          consume(parser);
          const childItems = parseBlockItems(parser, scopedKeywordAliases);
          expect(parser, "}");
          items.push({
            type: "Element",
            selectors: selectors,
            prefixDirectives: prefixDirectives,
            items: childItems,
            keywords: keywordSnapshot,
            start: itemStart,
            end: parser.index,
            raw: parser.source.slice(itemStart, parser.index),
          });
          continue;
        }

        if (nextChar === "{") {
          if (nameLower === "html") {
            consume(parser);
            const rawHtml = readBalancedBlockContent(parser);
            items.push({
              type: "HtmlBlock",
              html: rawHtml,
              keywords: keywordSnapshot,
              start: itemStart,
              end: parser.index,
              raw: parser.source.slice(itemStart, parser.index),
            });
            continue;
          }

          if (TEXT_BLOCK_KEYWORDS.has(nameLower)) {
            consume(parser);
            const textBody = readBalancedBlockContent(parser);
            items.push({
              type: "TextBlock",
              text: textBody,
              keywords: keywordSnapshot,
              start: itemStart,
              end: parser.index,
              raw: parser.source.slice(itemStart, parser.index),
            });
            continue;
          }

          if (nameLower === "style") {
            consume(parser);
            const styleBody = readBalancedBlockContent(parser);
            items.push({
              type: "StyleBlock",
              css: styleBody,
              keywords: keywordSnapshot,
              start: itemStart,
              end: parser.index,
              raw: parser.source.slice(itemStart, parser.index),
            });
            continue;
          }

          if (nameLower === "q-script") {
            consume(parser);
            const scriptBody = readBalancedBlockContent(parser);
            items.push({
              type: "QScriptInline",
              script: scriptBody,
              keywords: keywordSnapshot,
              start: itemStart,
              end: parser.index,
              raw: parser.source.slice(itemStart, parser.index),
            });
            continue;
          }

          if (nameLower === "q-wasm") {
            consume(parser);
            const wasmBody = readBalancedBlockContent(parser);
            items.push({
              type: "QWasmBlock",
              config: parseQWasmConfig(wasmBody, scopedKeywordAliases),
              keywords: keywordSnapshot,
              start: itemStart,
              end: parser.index,
              raw: parser.source.slice(itemStart, parser.index),
            });
            continue;
          }

          if (nameLower === "q-bind" || nameLower === "q-script") {
            consume(parser);
            const expressionBody = readBalancedBlockContent(parser);
            const expressionType = nameLower === "q-script" ? "QScriptExpression" : "QBindExpression";
            items.push({
              type: "Property",
              name: "content",
              value: {
                type: expressionType,
                keyword: nameLower,
                script: expressionBody,
                start: itemStart,
                end: parser.index,
                raw: parser.source.slice(itemStart, parser.index),
              },
              keywords: keywordSnapshot,
              start: itemStart,
              end: parser.index,
              raw: parser.source.slice(itemStart, parser.index),
            });
            continue;
          }

          if (nameLower === "q-import") {
            consume(parser);
            const importBody = readBalancedBlockContent(parser);
            items.push({
              type: "ImportBlock",
              path: String(importBody || "").trim(),
              keywords: keywordSnapshot,
              start: itemStart,
              end: parser.index,
              raw: parser.source.slice(itemStart, parser.index),
            });
            continue;
          }

          if (nameLower === "q-property") {
            consume(parser);
            const propertyBody = readBalancedBlockContent(parser);
            items.push({
              type: "QPropertyBlock",
              properties: parseQPropertyNames(propertyBody),
              keywords: keywordSnapshot,
              start: itemStart,
              end: parser.index,
              raw: parser.source.slice(itemStart, parser.index),
            });
            continue;
          }

          if (nameLower === "q-color-schema") {
            warnDeprecatedSyntaxFeature("q-color-schema");
            consume(parser);
            const schemaBody = readBalancedBlockContent(parser);
            items.push({
              type: "QColorSchemaDefinition",
              name: "",
              entries: parseQColorSchemaEntries(schemaBody),
              keywords: keywordSnapshot,
              start: itemStart,
              end: parser.index,
              raw: parser.source.slice(itemStart, parser.index),
            });
            continue;
          }

          if (nameLower === "q-color-theme") {
            warnDeprecatedSyntaxFeature("q-color-theme");
            consume(parser);
            const themeBody = readBalancedBlockContent(parser);
            items.push({
              type: "QColorThemeDefinition",
              name: "",
              assignments: parseQColorAssignments(themeBody, scopedKeywordAliases),
              keywords: keywordSnapshot,
              start: itemStart,
              end: parser.index,
              raw: parser.source.slice(itemStart, parser.index),
            });
            continue;
          }

          if (nameLower === "q-color") {
            warnDeprecatedSyntaxFeature("q-color");
            consume(parser);
            const colorBody = readBalancedBlockContent(parser);
            const parsed = parseQColorApplyBlock(colorBody, scopedKeywordAliases);
            items.push({
              type: "QColorApplyBlock",
              assignments: parsed.assignments,
              areas: parsed.areas,
              keywords: keywordSnapshot,
              start: itemStart,
              end: parser.index,
              raw: parser.source.slice(itemStart, parser.index),
            });
            continue;
          }

          if (nameLower === "q-style") {
            throw ParseError("Anonymous q-style is not allowed", parser.index);
          }

          if (nameLower === "q-theme") {
            throw ParseError("Anonymous q-theme is not allowed", parser.index);
          }
          if (nameLower === "q-default-theme") {
            throw ParseError("Anonymous q-default-theme is not allowed", parser.index);
          }

          if (isEventBlockName(name)) {
            consume(parser);
            const scriptBody = readBalancedBlockContent(parser);
            items.push({
              type: "EventBlock",
              name: name,
              script: scriptBody,
              isLifecycle: LIFECYCLE_BLOCKS.has(nameLower),
              keywords: keywordSnapshot,
              start: itemStart,
              end: parser.index,
              raw: parser.source.slice(itemStart, parser.index),
            });
            continue;
          }

          parser.index = afterName;
          const prefixDirectives = parseLeadingSelectorDirectiveBlocks(parser);
          skipWhitespace(parser);
          if (peek(parser) !== "{") {
            throw ParseError("Expected '{' after selector", parser.index);
          }
          consume(parser);
          const childItems = parseBlockItems(parser, scopedKeywordAliases);
          expect(parser, "}");

          items.push({
            type: "Element",
            selectors: [name],
            prefixDirectives: prefixDirectives,
            items: childItems,
            keywords: keywordSnapshot,
            start: itemStart,
            end: parser.index,
            raw: parser.source.slice(itemStart, parser.index),
          });
          continue;
        }

        if (nextChar === "}") {
          items.push({
            type: "BareWord",
            name: name,
            keywords: keywordSnapshot,
            start: itemStart,
            end: afterName,
            raw: parser.source.slice(itemStart, afterName),
          });
          continue;
        }

        if (String(name || "").toLowerCase() === "function") {
          parser.index = afterName;
          skipWhitespace(parser);
          const signatureStart = parser.index;
          while (!eof(parser) && peek(parser) !== "{") {
            parser.index += 1;
          }
          if (peek(parser) !== "{") {
            throw ParseError("Expected '{' after function signature", parser.index);
          }
          const signature = parser.source.slice(signatureStart, parser.index).trim();
          const sigMatch = signature.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\(([\s\S]*)\)$/);
          const methodName = sigMatch ? String(sigMatch[1] || "").trim() : "";
          const parameters = sigMatch ? String(sigMatch[2] || "").trim() : "";

          consume(parser);
          const methodBody = readBalancedBlockContent(parser);
          items.push({
            type: "FunctionBlock",
            name: methodName,
            signature: signature,
            parameters: parameters,
            body: methodBody,
            keywords: keywordSnapshot,
            start: itemStart,
            end: parser.index,
            raw: parser.source.slice(itemStart, parser.index),
          });
          continue;
        }

        parser.index = afterName;
        const rest = parseBareValue(parser);
        const text = (name + (rest ? " " + rest : "")).trim();
        items.push({
          type: "RawTextLine",
          text: text,
          keywords: keywordSnapshot,
          start: itemStart,
          end: parser.index,
          raw: parser.source.slice(itemStart, parser.index),
        });
      } catch (error) {
        if (error && error.name === "QHtmlParseError") {
          parser.index = recoveryStart;
          const recovered = consumeRecoverableRaw(parser, { mode: "block", stopChar: "}" });
          if (recovered) {
            items.push(recovered);
            continue;
          }
        }
        throw error;
      }
    }

    return items;
  }

  function parseTopLevelItems(parser, keywordAliases) {
    const scopedKeywordAliases = cloneKeywordAliases(keywordAliases);
    const body = [];

    while (!eof(parser)) {
      skipWhitespaceAndSemicolons(parser);
      if (eof(parser)) {
        break;
      }

      if (!isIdentifierStartChar(peek(parser))) {
        const recovered = consumeRecoverableRaw(parser, { mode: "top" });
        if (recovered) {
          body.push(recovered);
        }
        continue;
      }

      const recoveryStart = parser.index;
      try {
        const start = parser.index;
        const firstSelectorBase = parseIdentifier(parser);
        const firstSelector = parseSelectorTokenTail(parser, firstSelectorBase);
        const firstLower = firstSelectorBase.toLowerCase();
        const afterFirstSelector = parser.index;
        skipWhitespace(parser);

        if (firstLower === "q-keyword") {
          parseKeywordAliasDeclaration(parser, scopedKeywordAliases, start);
          continue;
        }

        const aliasSpec = scopedKeywordAliases.get(firstLower);
        if (aliasSpec) {
          ensureAliasReplacementIsDirect(aliasSpec, scopedKeywordAliases, parser, start);
          const itemEnd = findItemBoundaryInSource(parser.source, start, { mode: "top" });
          const rest = parser.source.slice(afterFirstSelector, itemEnd);
          const expandedSource = String(aliasSpec.replacementHead || "") + rest;
          const expandedItems = parseAliasedItemsFromSource(expandedSource, "top", scopedKeywordAliases);
          parser.index = itemEnd;
          for (let i = 0; i < expandedItems.length; i += 1) {
            body.push(expandedItems[i]);
          }
          continue;
        }

        const keywordSnapshot = keywordAliasesToObject(scopedKeywordAliases);

        if (LIFECYCLE_BLOCKS.has(firstLower) && peek(parser) === "{") {
          consume(parser);
          const scriptBody = readBalancedBlockContent(parser);
          body.push({
            type: "LifecycleBlock",
            name: firstSelector,
            script: scriptBody,
            isLifecycle: true,
            keywords: keywordSnapshot,
            start: start,
            end: parser.index,
            raw: parser.source.slice(start, parser.index),
          });
          continue;
        }

        if (firstLower === "q-template" && peek(parser) !== "{" && peek(parser) !== ",") {
          const templateId = parseIdentifier(parser);
          skipWhitespace(parser);
          if (peek(parser) !== "{") {
            throw ParseError("Expected '{' after q-template id", parser.index);
          }
          consume(parser);
          const items = parseBlockItems(parser, scopedKeywordAliases);
          expect(parser, "}");
          body.push({
            type: "TemplateDefinition",
            templateId: templateId,
            items: items,
            keywords: keywordSnapshot,
            start: start,
            end: parser.index,
            raw: parser.source.slice(start, parser.index),
          });
          continue;
        }

        if (firstLower === "q-component" && peek(parser) !== "{" && peek(parser) !== ",") {
          const componentIdExprStart = parser.index;
          let componentIdExpression = null;

          if (parser.source.slice(parser.index, parser.index + 8).toLowerCase() === "q-script") {
            const keyword = parseIdentifier(parser);
            skipWhitespace(parser);
            if (peek(parser) !== "{") {
              throw ParseError("Expected '{' after q-script in component id expression", parser.index);
            }
            consume(parser);
            const scriptBody = readBalancedBlockContent(parser);
            componentIdExpression = {
              type: "QScriptExpression",
              keyword: keyword,
              script: scriptBody,
              raw: parser.source.slice(componentIdExprStart, parser.index),
            };
          } else {
            const componentId = parseIdentifier(parser);
            componentIdExpression = {
              type: "IdentifierExpression",
              identifier: componentId,
              raw: parser.source.slice(componentIdExprStart, parser.index),
            };
          }

          skipWhitespace(parser);
          if (peek(parser) !== "{") {
            throw ParseError("Expected '{' after q-component id", parser.index);
          }
          consume(parser);
          const items = parseBlockItems(parser, scopedKeywordAliases);
          expect(parser, "}");

          body.push({
            type: "ComponentDefinition",
            componentIdExpression: componentIdExpression,
            items: items,
            keywords: keywordSnapshot,
            start: start,
            end: parser.index,
            raw: parser.source.slice(start, parser.index),
          });
          continue;
        }

        if (firstLower === "q-signal" && peek(parser) !== "{" && peek(parser) !== ",") {
          const signalId = parseIdentifier(parser);
          skipWhitespace(parser);
          if (peek(parser) !== "{") {
            throw ParseError("Expected '{' after q-signal id", parser.index);
          }
          consume(parser);
          const items = parseBlockItems(parser, scopedKeywordAliases);
          expect(parser, "}");
          body.push({
            type: "SignalDefinition",
            signalId: signalId,
            items: items,
            keywords: keywordSnapshot,
            start: start,
            end: parser.index,
            raw: parser.source.slice(start, parser.index),
          });
          continue;
        }

        if (firstLower === "q-color-schema" && peek(parser) !== "{" && peek(parser) !== ",") {
          warnDeprecatedSyntaxFeature("q-color-schema");
          const schemaName = parseQColorIdentifier(parser, "q-color-schema");
          skipWhitespace(parser);
          if (peek(parser) !== "{") {
            throw ParseError("Expected '{' after q-color-schema name", parser.index);
          }
          consume(parser);
          const schemaBody = readBalancedBlockContent(parser);
          body.push({
            type: "QColorSchemaDefinition",
            name: schemaName,
            entries: parseQColorSchemaEntries(schemaBody),
            keywords: keywordSnapshot,
            start: start,
            end: parser.index,
            raw: parser.source.slice(start, parser.index),
          });
          continue;
        }

        if (firstLower === "q-color-schema" && peek(parser) === "{") {
          warnDeprecatedSyntaxFeature("q-color-schema");
          consume(parser);
          const schemaBody = readBalancedBlockContent(parser);
          body.push({
            type: "QColorSchemaDefinition",
            name: "",
            entries: parseQColorSchemaEntries(schemaBody),
            keywords: keywordSnapshot,
            start: start,
            end: parser.index,
            raw: parser.source.slice(start, parser.index),
          });
          continue;
        }

        if (firstLower === "q-color-theme" && peek(parser) === "{") {
          warnDeprecatedSyntaxFeature("q-color-theme");
          consume(parser);
          const themeBody = readBalancedBlockContent(parser);
          body.push({
            type: "QColorThemeDefinition",
            name: "",
            assignments: parseQColorAssignments(themeBody, scopedKeywordAliases),
            keywords: keywordSnapshot,
            start: start,
            end: parser.index,
            raw: parser.source.slice(start, parser.index),
          });
          continue;
        }

        if (firstLower === "q-color-theme" && peek(parser) !== "{" && peek(parser) !== ",") {
          warnDeprecatedSyntaxFeature("q-color-theme");
          const themeName = parseQColorIdentifier(parser, "q-color-theme");
          skipWhitespace(parser);
          if (peek(parser) !== "{") {
            throw ParseError("Expected '{' after q-color-theme name", parser.index);
          }
          consume(parser);
          const themeBody = readBalancedBlockContent(parser);
          body.push({
            type: "QColorThemeDefinition",
            name: themeName,
            assignments: parseQColorAssignments(themeBody, scopedKeywordAliases),
            keywords: keywordSnapshot,
            start: start,
            end: parser.index,
            raw: parser.source.slice(start, parser.index),
          });
          continue;
        }

        if (firstLower === "q-color" && peek(parser) !== "{" && peek(parser) !== ",") {
          warnDeprecatedSyntaxFeature("q-color");
          const setupName = parseQColorIdentifier(parser, "q-color");
          skipWhitespace(parser);
          if (peek(parser) !== "{") {
            throw ParseError("Expected '{' after q-color name", parser.index);
          }
          consume(parser);
          const colorBody = readBalancedBlockContent(parser);
          const parsed = parseQColorApplyBlock(colorBody, scopedKeywordAliases);
          body.push({
            type: "QColorDefinition",
            name: setupName,
            assignments: parsed.assignments,
            areas: parsed.areas,
            keywords: keywordSnapshot,
            start: start,
            end: parser.index,
            raw: parser.source.slice(start, parser.index),
          });
          continue;
        }

        if (firstLower === "q-style" && peek(parser) !== "{" && peek(parser) !== ",") {
          const styleName = parseQColorIdentifier(parser, "q-style");
          skipWhitespace(parser);
          if (peek(parser) !== "{") {
            throw ParseError("Expected '{' after q-style name", parser.index);
          }
          consume(parser);
          const styleBody = readBalancedBlockContent(parser);
          const parsedStyle = parseQStyleDeclarations(styleBody, scopedKeywordAliases);
          body.push({
            type: "QStyleDefinition",
            name: styleName,
            declarations: parsedStyle.declarations,
            classes: parsedStyle.classes,
            keywords: keywordSnapshot,
            start: start,
            end: parser.index,
            raw: parser.source.slice(start, parser.index),
          });
          continue;
        }

        if (firstLower === "q-theme" && peek(parser) !== "{" && peek(parser) !== ",") {
          const themeName = parseQColorIdentifier(parser, "q-theme");
          skipWhitespace(parser);
          if (peek(parser) !== "{") {
            throw ParseError("Expected '{' after q-theme name", parser.index);
          }
          consume(parser);
          const themeBody = readBalancedBlockContent(parser);
          body.push({
            type: "QThemeDefinition",
            name: themeName,
            defaultTheme: false,
            rules: parseQThemeRules(themeBody),
            keywords: keywordSnapshot,
            start: start,
            end: parser.index,
            raw: parser.source.slice(start, parser.index),
          });
          continue;
        }
        if (firstLower === "q-default-theme" && peek(parser) !== "{" && peek(parser) !== ",") {
          const themeName = parseQColorIdentifier(parser, "q-default-theme");
          skipWhitespace(parser);
          if (peek(parser) !== "{") {
            throw ParseError("Expected '{' after q-default-theme name", parser.index);
          }
          consume(parser);
          const themeBody = readBalancedBlockContent(parser);
          body.push({
            type: "QThemeDefinition",
            name: themeName,
            defaultTheme: true,
            rules: parseQThemeRules(themeBody),
            keywords: keywordSnapshot,
            start: start,
            end: parser.index,
            raw: parser.source.slice(start, parser.index),
          });
          continue;
        }

        if (firstLower === "q-style" && peek(parser) === "{") {
          throw ParseError("Anonymous q-style is not allowed", parser.index);
        }

        if (firstLower === "q-theme" && peek(parser) === "{") {
          throw ParseError("Anonymous q-theme is not allowed", parser.index);
        }
        if (firstLower === "q-default-theme" && peek(parser) === "{") {
          throw ParseError("Anonymous q-default-theme is not allowed", parser.index);
        }

        const selectors = parseSelectorList(parser, firstSelector);
        const prefixDirectives = parseLeadingSelectorDirectiveBlocks(parser);
        skipWhitespace(parser);

        if (peek(parser) !== "{") {
          throw ParseError("Expected '{' at top level", parser.index);
        }

        consume(parser);
        if (selectors.length === 1 && selectors[0].toLowerCase() === "html") {
          const rawHtml = readBalancedBlockContent(parser);
          body.push({
            type: "HtmlBlock",
            html: rawHtml,
            keywords: keywordSnapshot,
            start: start,
            end: parser.index,
            raw: parser.source.slice(start, parser.index),
          });
          continue;
        }

        if (selectors.length === 1 && selectors[0].toLowerCase() === "q-import") {
          const importBody = readBalancedBlockContent(parser);
          body.push({
            type: "ImportBlock",
            path: String(importBody || "").trim(),
            keywords: keywordSnapshot,
            start: start,
            end: parser.index,
            raw: parser.source.slice(start, parser.index),
          });
          continue;
        }

        const items = parseBlockItems(parser, scopedKeywordAliases);
        expect(parser, "}");
        body.push({
          type: "Element",
          selectors: selectors,
          prefixDirectives: prefixDirectives,
          items: items,
          keywords: keywordSnapshot,
          start: start,
          end: parser.index,
          raw: parser.source.slice(start, parser.index),
        });
      } catch (error) {
        if (error && error.name === "QHtmlParseError") {
          parser.index = recoveryStart;
          const recovered = consumeRecoverableRaw(parser, { mode: "top" });
          if (recovered) {
            body.push(recovered);
            continue;
          }
        }
        throw error;
      }
    }

    return body;
  }

  function parseQHtmlToAst(source, options) {
    const parser = parserFor(source);
    const opts = options || {};
    const keywordAliases = cloneKeywordAliases(opts.keywordAliases);
    const body = parseTopLevelItems(parser, keywordAliases);
    return {
      type: "Program",
      body: body,
      source: String(source || ""),
    };
  }

  function isImportWordChar(ch) {
    return /[A-Za-z0-9_-]/.test(String(ch || ""));
  }

  function findMatchingBraceInText(source, openIndex) {
    const text = String(source || "");
    if (openIndex < 0 || openIndex >= text.length || text.charAt(openIndex) !== "{") {
      return -1;
    }

    let depth = 0;
    let quote = "";
    let escaped = false;

    for (let i = openIndex; i < text.length; i += 1) {
      const ch = text.charAt(i);
      if (quote) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === "\\") {
          escaped = true;
          continue;
        }
        if (ch === quote) {
          quote = "";
        }
        continue;
      }

      if (ch === '"' || ch === "'" || ch === "`") {
        quote = ch;
        continue;
      }

      if (ch === "{") {
        depth += 1;
      } else if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          return i;
        }
      }
    }

    return -1;
  }

  function findNextQImportBlock(source, startIndex) {
    const text = String(source || "");
    const start = Math.max(0, Number(startIndex) || 0);

    let quote = "";
    let escaped = false;

    for (let i = start; i < text.length; i += 1) {
      const ch = text.charAt(i);

      if (quote) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === "\\") {
          escaped = true;
          continue;
        }
        if (ch === quote) {
          quote = "";
        }
        continue;
      }

      if (ch === '"' || ch === "'" || ch === "`") {
        quote = ch;
        continue;
      }

      if (i + 8 > text.length) {
        break;
      }
      const token = text.slice(i, i + 8);
      if (token.toLowerCase() !== "q-import") {
        continue;
      }

      const before = i > 0 ? text.charAt(i - 1) : "";
      const afterToken = i + 8 < text.length ? text.charAt(i + 8) : "";
      if (isImportWordChar(before) || isImportWordChar(afterToken)) {
        continue;
      }

      let cursor = i + 8;
      while (cursor < text.length && /\s/.test(text.charAt(cursor))) {
        cursor += 1;
      }
      if (text.charAt(cursor) !== "{") {
        continue;
      }

      const close = findMatchingBraceInText(text, cursor);
      if (close === -1) {
        throw new Error("Unterminated q-import block.");
      }

      return {
        start: i,
        open: cursor,
        close: close,
        block: text.slice(i, close + 1),
      };
    }

    return null;
  }

  function normalizeImportPath(rawPath) {
    let path = String(rawPath || "").trim();
    if (path.endsWith(";")) {
      path = path.slice(0, -1).trim();
    }
    if (
      (path.startsWith('"') && path.endsWith('"')) ||
      (path.startsWith("'") && path.endsWith("'")) ||
      (path.startsWith("`") && path.endsWith("`"))
    ) {
      path = path.slice(1, -1).trim();
    }
    return path;
  }

  function resolveImportUrl(path, baseUrl) {
    const value = String(path || "").trim();
    if (!value) {
      return "";
    }

    if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(value) || value.startsWith("//")) {
      return value;
    }

    function normalizeJoinedUrl(joined) {
      const text = String(joined || "");
      const protocolMatch = text.match(/^([A-Za-z][A-Za-z0-9+.-]*:\/\/[^/]*)(\/.*)?$/);
      const origin = protocolMatch ? protocolMatch[1] : "";
      const tail = protocolMatch ? protocolMatch[2] || "/" : text;
      const parts = tail.split("/");
      const out = [];
      for (let i = 0; i < parts.length; i += 1) {
        const part = parts[i];
        if (!part || part === ".") {
          continue;
        }
        if (part === "..") {
          if (out.length > 0) {
            out.pop();
          }
          continue;
        }
        out.push(part);
      }
      const normalizedPath = "/" + out.join("/");
      return origin ? origin + normalizedPath : normalizedPath;
    }

    function resolveRelativeWithoutURL(relative, base) {
      const cleanBase = String(base || "").split("#")[0].split("?")[0];
      if (!cleanBase) {
        return relative;
      }

      if (relative.startsWith("/")) {
        const originMatch = cleanBase.match(/^([A-Za-z][A-Za-z0-9+.-]*:\/\/[^/]+)/);
        if (originMatch) {
          return originMatch[1] + relative;
        }
        return relative;
      }

      const baseDir = cleanBase.endsWith("/") ? cleanBase : cleanBase.replace(/\/[^/]*$/, "/");
      return normalizeJoinedUrl(baseDir + relative);
    }

    const base = String(baseUrl || "").trim();
    if (base) {
      try {
        if (typeof URL === "function") {
          return new URL(value, base).toString();
        }
        return resolveRelativeWithoutURL(value, base);
      } catch (error) {
        return resolveRelativeWithoutURL(value, base);
      }
    }

    const documentBase =
      global &&
      global.document &&
      typeof global.document.baseURI === "string" &&
      global.document.baseURI
        ? String(global.document.baseURI)
        : "";
    if (documentBase) {
      try {
        if (typeof URL === "function") {
          return new URL(value, documentBase).toString();
        }
        return resolveRelativeWithoutURL(value, documentBase);
      } catch (error) {
        return resolveRelativeWithoutURL(value, documentBase);
      }
    }

    return value;
  }

  const qImportSyncCache = new Map();
  const qImportAsyncCache = new Map();

  function resolveQImportsSync(source, options) {
    const opts = options || {};
    const loadImportSync = typeof opts.loadImportSync === "function" ? opts.loadImportSync : null;
    if (!loadImportSync) {
      return String(source || "");
    }

    const maxImports = typeof opts.maxImports === "number" && opts.maxImports > 0 ? opts.maxImports : 200;
    const cache = opts.cache instanceof Map ? opts.cache : qImportSyncCache;
    const onImport = typeof opts.onImport === "function" ? opts.onImport : null;
    const counter = { value: 0 };

    function expandImports(input, baseUrl, stack) {
      let out = String(input || "");
      let cursor = 0;

      while (true) {
        const found = findNextQImportBlock(out, cursor);
        if (!found) {
          break;
        }

        const importBody = out.slice(found.open + 1, found.close);
        const importPath = normalizeImportPath(importBody);
        if (!importPath) {
          throw new Error("q-import path cannot be empty.");
        }

        if (counter.value >= maxImports) {
          throw new Error("q-import limit exceeded (" + maxImports + ").");
        }

        const resolvedUrl = resolveImportUrl(importPath, baseUrl);
        if (stack.indexOf(resolvedUrl) !== -1) {
          throw new Error("Circular q-import detected: " + stack.concat(resolvedUrl).join(" -> "));
        }
        if (onImport) {
          onImport({
            path: importPath,
            url: resolvedUrl,
            baseUrl: baseUrl || "",
          });
        }

        let replacement;
        if (cache.has(resolvedUrl)) {
          replacement = cache.get(resolvedUrl);
        } else {
          counter.value += 1;
          const importedSource = loadImportSync(resolvedUrl, {
            path: importPath,
            baseUrl: baseUrl || "",
          });
          const importedText = String(importedSource || "");
          replacement = expandImports(importedText, resolvedUrl, stack.concat(resolvedUrl));
          cache.set(resolvedUrl, replacement);
        }

        out = out.slice(0, found.start) + replacement + out.slice(found.close + 1);
        cursor = found.start + replacement.length;
      }

      return out;
    }

    return expandImports(String(source || ""), String(opts.baseUrl || ""), []);
  }

  async function resolveQImportsAsync(source, options) {
    const opts = options || {};
    const loadImport = typeof opts.loadImport === "function" ? opts.loadImport : null;
    if (!loadImport) {
      return String(source || "");
    }

    const maxImports = typeof opts.maxImports === "number" && opts.maxImports > 0 ? opts.maxImports : 200;
    const cache = opts.cache instanceof Map ? opts.cache : qImportAsyncCache;
    const onImport = typeof opts.onImport === "function" ? opts.onImport : null;
    const counter = { value: 0 };

    async function expandImports(input, baseUrl, stack) {
      let out = String(input || "");
      let cursor = 0;

      while (true) {
        const found = findNextQImportBlock(out, cursor);
        if (!found) {
          break;
        }

        const importBody = out.slice(found.open + 1, found.close);
        const importPath = normalizeImportPath(importBody);
        if (!importPath) {
          throw new Error("q-import path cannot be empty.");
        }

        if (counter.value >= maxImports) {
          throw new Error("q-import limit exceeded (" + maxImports + ").");
        }

        const resolvedUrl = resolveImportUrl(importPath, baseUrl);
        if (stack.indexOf(resolvedUrl) !== -1) {
          throw new Error("Circular q-import detected: " + stack.concat(resolvedUrl).join(" -> "));
        }
        if (onImport) {
          onImport({
            path: importPath,
            url: resolvedUrl,
            baseUrl: baseUrl || "",
          });
        }

        let replacement;
        if (cache.has(resolvedUrl)) {
          replacement = await Promise.resolve(cache.get(resolvedUrl));
        } else {
          const pending = (async function resolveImportedSource() {
            counter.value += 1;
            const importedSource = await Promise.resolve(
              loadImport(resolvedUrl, {
                path: importPath,
                baseUrl: baseUrl || "",
              })
            );
            const importedText = String(importedSource || "");
            return expandImports(importedText, resolvedUrl, stack.concat(resolvedUrl));
          })();

          cache.set(resolvedUrl, pending);
          try {
            replacement = await pending;
            cache.set(resolvedUrl, replacement);
          } catch (error) {
            cache.delete(resolvedUrl);
            throw error;
          }
        }

        out = out.slice(0, found.start) + replacement + out.slice(found.close + 1);
        cursor = found.start + replacement.length;
      }

      return out;
    }

    return expandImports(String(source || ""), String(opts.baseUrl || ""), []);
  }

  function normalizePropertyName(name) {
    return String(name || "").toLowerCase().trim();
  }

  const DEFAULT_QCOLOR_THEME_NAME = "default";
  const DEFAULT_QCOLOR_AREA_PROPERTIES = Object.freeze({
    background: "background-color",
    surface: "background-color",
    surfaceAlt: "background-color",
    foreground: "color",
    foregroundMuted: "color",
    muted: "color",
    border: "border-color",
    borderStrong: "border-color",
    primary: "color",
    primaryContrast: "color",
    secondary: "color",
    secondaryContrast: "color",
    accent: "color",
    accentContrast: "color",
    success: "color",
    successContrast: "color",
    danger: "color",
    dangerContrast: "color",
    warning: "color",
    warningContrast: "color",
    info: "color",
    infoContrast: "color",
    overlay: "background-color",
    shadow: "box-shadow",
    link: "color",
    linkHover: "color",
    focusRing: "outline-color",
    titleBackground: "background-color",
    titleForeground: "color",
    panelBackground: "background-color",
    panelForeground: "color",
    cardBackground: "background-color",
    cardForeground: "color",
    modalBackground: "background-color",
    modalForeground: "color",
    navBackground: "background-color",
    navForeground: "color",
    toolbarBackground: "background-color",
    toolbarForeground: "color",
    buttonBackground: "background-color",
    buttonForeground: "color",
    buttonBorder: "border-color",
    buttonHoverBackground: "background-color",
    buttonHoverForeground: "color",
    inputBackground: "background-color",
    inputForeground: "color",
    inputBorder: "border-color",
    badgeBackground: "background-color",
    badgeForeground: "color",
    selectionBackground: "background-color",
    selectionForeground: "color",
  });
  const DEFAULT_QCOLOR_THEME_ASSIGNMENTS = Object.freeze({
    background: "#f8fafc",
    surface: "rgb(238, 243, 251)",
    surfaceAlt: "#f1f5f9",
    foreground: "#0f172a",
    foregroundMuted: "#475569",
    muted: "#64748b",
    border: "#cbd5e1",
    borderStrong: "#94a3b8",
    primary: "#1d4ed8",
    primaryContrast: "rgb(238, 243, 251)",
    secondary: "#334155",
    secondaryContrast: "rgb(238, 243, 251)",
    accent: "#0ea5e9",
    accentContrast: "#082f49",
    success: "#16a34a",
    successContrast: "rgb(238, 243, 251)",
    danger: "#dc2626",
    dangerContrast: "rgb(238, 243, 251)",
    warning: "#f59e0b",
    warningContrast: "#111827",
    info: "#0284c7",
    infoContrast: "rgb(238, 243, 251)",
    overlay: "rgba(15, 23, 42, 0.72)",
    shadow: "rgba(15, 23, 42, 0.18)",
    link: "#1d4ed8",
    linkHover: "#1e40af",
    focusRing: "#f59e0b",
    titleBackground: "#e2e8f0",
    titleForeground: "#0f172a",
    panelBackground: "rgb(238, 243, 251)",
    panelForeground: "#0f172a",
    cardBackground: "rgb(238, 243, 251)",
    cardForeground: "#0f172a",
    modalBackground: "rgb(238, 243, 251)",
    modalForeground: "#0f172a",
    navBackground: "#334155",
    navForeground: "rgb(238, 243, 251)",
    toolbarBackground: "#0f172a",
    toolbarForeground: "#f8fafc",
    buttonBackground: "#1d4ed8",
    buttonForeground: "rgb(238, 243, 251)",
    buttonBorder: "#1e40af",
    buttonHoverBackground: "#1e40af",
    buttonHoverForeground: "rgb(238, 243, 251)",
    inputBackground: "rgb(238, 243, 251)",
    inputForeground: "#0f172a",
    inputBorder: "#cbd5e1",
    badgeBackground: "#1d4ed8",
    badgeForeground: "rgb(238, 243, 251)",
    selectionBackground: "#bfdbfe",
    selectionForeground: "#0f172a",
  });

  const Q_COLOR_STYLE_PROPERTY_MAP = Object.freeze({
    background: "background-color",
    foreground: "color",
    border: "border-color",
    outline: "outline-color",
    caret: "caret-color",
    fill: "fill",
    stroke: "stroke",
    shadow: "box-shadow",
    primary: "--q-color-primary",
    secondary: "--q-color-secondary",
    accent: "--q-color-accent",
    surface: "--q-color-surface",
    surfacealt: "--q-color-surface-alt",
    muted: "--q-color-muted",
    foregroundmuted: "--q-color-foreground-muted",
    borderstrong: "--q-color-border-strong",
    success: "--q-color-success",
    warning: "--q-color-warning",
    danger: "--q-color-danger",
    info: "--q-color-info",
    link: "--q-color-link",
    linkhover: "--q-color-link-hover",
    focusring: "--q-color-focus-ring",
    overlay: "--q-color-overlay",
    primarycontrast: "--q-color-primary-contrast",
    secondarycontrast: "--q-color-secondary-contrast",
    accentcontrast: "--q-color-accent-contrast",
    successcontrast: "--q-color-success-contrast",
    warningcontrast: "--q-color-warning-contrast",
    dangercontrast: "--q-color-danger-contrast",
    infocontrast: "--q-color-info-contrast",
    titlebackground: "--q-color-title-background",
    titleforeground: "--q-color-title-foreground",
    panelbackground: "--q-color-panel-background",
    panelforeground: "--q-color-panel-foreground",
    cardbackground: "--q-color-card-background",
    cardforeground: "--q-color-card-foreground",
    modalbackground: "--q-color-modal-background",
    modalforeground: "--q-color-modal-foreground",
    navbackground: "--q-color-nav-background",
    navforeground: "--q-color-nav-foreground",
    toolbarbackground: "--q-color-toolbar-background",
    toolbarforeground: "--q-color-toolbar-foreground",
    buttonbackground: "--q-color-button-background",
    buttonforeground: "--q-color-button-foreground",
    buttonborder: "--q-color-button-border",
    buttonhoverbackground: "--q-color-button-hover-background",
    buttonhoverforeground: "--q-color-button-hover-foreground",
    inputbackground: "--q-color-input-background",
    inputforeground: "--q-color-input-foreground",
    inputborder: "--q-color-input-border",
    badgebackground: "--q-color-badge-background",
    badgeforeground: "--q-color-badge-foreground",
    selectionbackground: "--q-color-selection-background",
    selectionforeground: "--q-color-selection-foreground",
  });

  function qColorStylePropertyForKey(key) {
    const normalized = normalizeColorLookupKey(key);
    if (!normalized) {
      return "";
    }
    if (Object.prototype.hasOwnProperty.call(Q_COLOR_STYLE_PROPERTY_MAP, normalized)) {
      return Q_COLOR_STYLE_PROPERTY_MAP[normalized];
    }
    return "--q-color-" + normalized.replace(/[^A-Za-z0-9_-]/g, "-");
  }

  function cloneQColorAssignments(assignments) {
    return assignments && typeof assignments === "object" && !Array.isArray(assignments)
      ? Object.assign({}, assignments)
      : {};
  }

  function cloneQColorAreas(areas) {
    return Array.isArray(areas) ? areas.slice() : [];
  }

  function cloneQColorSetup(setup) {
    if (!setup || typeof setup !== "object") {
      return { name: "", assignments: {}, areas: [] };
    }
    return {
      name: String(setup.name || "").trim(),
      assignments: cloneQColorAssignments(setup.assignments),
      areas: cloneQColorAreas(setup.areas),
    };
  }

  function appendActiveQColorSetup(colorContext, setup) {
    if (!colorContext || !Array.isArray(colorContext.activeSetups)) {
      return;
    }
    const cloned = cloneQColorSetup(setup);
    if (!cloned.name && Object.keys(cloned.assignments).length === 0 && cloned.areas.length === 0) {
      return;
    }
    colorContext.activeSetups.push(cloned);
  }

  function registerQColorDefinition(colorContext, definitionName, parsed) {
    if (!colorContext || !(colorContext.colorDefs instanceof Map)) {
      return;
    }
    const normalized = normalizeColorLookupKey(definitionName);
    const name = String(definitionName || "").trim();
    if (!normalized || !name) {
      return;
    }
    const definition = cloneQColorSetup({
      name: name,
      assignments: parsed && parsed.assignments,
      areas: parsed && parsed.areas,
    });
    definition.name = name;
    colorContext.colorDefs.set(normalized, definition);
  }

  function lookupQColorDefinition(colorContext, definitionName) {
    const normalized = normalizeColorLookupKey(definitionName);
    if (!normalized || !colorContext || !(colorContext.colorDefs instanceof Map)) {
      return null;
    }
    const entry = colorContext.colorDefs.get(normalized);
    if (!entry || typeof entry !== "object") {
      return null;
    }
    return cloneQColorSetup(entry);
  }

  function registerQColorSchema(colorContext, areaName, cssProperty) {
    if (!colorContext || !(colorContext.schemas instanceof Map)) {
      return;
    }
    const normalized = normalizeColorLookupKey(areaName);
    const property = normalizeCssPropertyName(cssProperty);
    if (!normalized || !property) {
      return;
    }
    colorContext.schemas.set(normalized, {
      name: String(areaName || "").trim() || normalized,
      property: property,
    });
  }

  function registerQColorTheme(colorContext, themeName, assignments, options) {
    if (!colorContext || !(colorContext.themes instanceof Map)) {
      return;
    }
    const normalized = normalizeColorLookupKey(themeName);
    if (!normalized) {
      return;
    }
    colorContext.themes.set(normalized, {
      name: String(themeName || "").trim() || normalized,
      assignments: cloneQColorAssignments(assignments),
    });
    const opts = options || {};
    if (opts.setAsDefault === true || !String(colorContext.defaultThemeName || "").trim()) {
      colorContext.defaultThemeName = normalized;
    }
  }

  function createQColorContext(parentContext) {
    const context = {
      schemas: new Map(),
      schemaDefs: new Map(),
      colorDefs: new Map(),
      activeSetups: [],
      themes: new Map(),
      defaultThemeName: DEFAULT_QCOLOR_THEME_NAME,
    };
    if (parentContext && parentContext.schemas instanceof Map) {
      parentContext.schemas.forEach(function copySchema(entry, key) {
        if (!entry || typeof entry !== "object") {
          return;
        }
        context.schemas.set(String(key || ""), {
          name: String(entry.name || key || "").trim() || String(key || ""),
          property: String(entry.property || "").trim(),
        });
      });
    }
    if (parentContext && parentContext.schemaDefs instanceof Map) {
      parentContext.schemaDefs.forEach(function copySchemaDef(entry, key) {
        if (!entry || typeof entry !== "object") {
          return;
        }
        context.schemaDefs.set(String(key || ""), {
          name: String(entry.name || key || "").trim() || String(key || ""),
          entries: cloneQColorAssignments(entry.entries),
        });
      });
    }
    if (parentContext && parentContext.colorDefs instanceof Map) {
      parentContext.colorDefs.forEach(function copyColorDef(entry, key) {
        if (!entry || typeof entry !== "object") {
          return;
        }
        context.colorDefs.set(String(key || ""), cloneQColorSetup(entry));
      });
    }
    if (parentContext && Array.isArray(parentContext.activeSetups)) {
      for (let i = 0; i < parentContext.activeSetups.length; i += 1) {
        appendActiveQColorSetup(context, parentContext.activeSetups[i]);
      }
    }
    if (parentContext && parentContext.themes instanceof Map) {
      parentContext.themes.forEach(function copyTheme(entry, key) {
        if (!entry || typeof entry !== "object") {
          return;
        }
        context.themes.set(String(key || ""), {
          name: String(entry.name || key || "").trim() || String(key || ""),
          assignments: cloneQColorAssignments(entry.assignments),
        });
      });
    }
    if (parentContext && typeof parentContext.defaultThemeName === "string" && parentContext.defaultThemeName.trim()) {
      context.defaultThemeName = parentContext.defaultThemeName.trim();
    }
    if (context.schemas.size === 0 && context.themes.size === 0 && !parentContext) {
      const schemaKeys = Object.keys(DEFAULT_QCOLOR_AREA_PROPERTIES);
      for (let i = 0; i < schemaKeys.length; i += 1) {
        const key = schemaKeys[i];
        registerQColorSchema(context, key, DEFAULT_QCOLOR_AREA_PROPERTIES[key]);
      }
      registerQColorTheme(context, DEFAULT_QCOLOR_THEME_NAME, DEFAULT_QCOLOR_THEME_ASSIGNMENTS, {
        setAsDefault: true,
      });
    }
    return context;
  }

  function createScopedConversionContext(parentContext) {
    const parentColors =
      parentContext && parentContext.qColors && typeof parentContext.qColors === "object"
        ? parentContext.qColors
        : null;
    const parentStyles =
      parentContext && parentContext.qStyles && typeof parentContext.qStyles === "object"
        ? parentContext.qStyles
        : null;
    return {
      qColors: createQColorContext(parentColors),
      qStyles: createQStyleContext(parentStyles),
    };
  }

  function cloneQStyleDeclarations(declarations) {
    return declarations && typeof declarations === "object" && !Array.isArray(declarations)
      ? Object.assign({}, declarations)
      : {};
  }

  function cloneQStyleClasses(classes) {
    const list = Array.isArray(classes) ? classes : [];
    const out = [];
    const seen = new Set();
    for (let i = 0; i < list.length; i += 1) {
      const className = String(list[i] || "").trim();
      const normalized = className.toLowerCase();
      if (!className || seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      out.push(className);
    }
    return out;
  }

  function cloneQThemeRules(rules) {
    const list = Array.isArray(rules) ? rules : [];
    const out = [];
    for (let i = 0; i < list.length; i += 1) {
      const rule = list[i];
      if (!rule || typeof rule !== "object") {
        continue;
      }
      const includeTheme = String(rule.includeTheme || "").trim();
      if (includeTheme) {
        out.push({
          includeTheme: includeTheme,
        });
        continue;
      }
      out.push({
        selector: String(rule.selector || "").trim(),
        styles: Array.isArray(rule.styles)
          ? rule.styles.map(function cloneStyleName(entry) { return String(entry || "").trim(); }).filter(Boolean)
          : [],
      });
    }
    return out;
  }

  function cloneQThemeDefinition(themeDefinition) {
    const entry = themeDefinition && typeof themeDefinition === "object" ? themeDefinition : {};
    return {
      name: String(entry.name || "").trim(),
      isDefault: !!entry.isDefault,
      rules: cloneQThemeRules(entry.rules),
    };
  }

  function cloneQStyleDefinition(styleDefinition) {
    const entry = styleDefinition && typeof styleDefinition === "object" ? styleDefinition : {};
    return {
      name: String(entry.name || "").trim(),
      declarations: cloneQStyleDeclarations(entry.declarations),
      classes: cloneQStyleClasses(entry.classes),
    };
  }

  function registerQStyleDefinition(styleContext, styleName, declarations, classes) {
    if (!styleContext || !(styleContext.styles instanceof Map)) {
      return;
    }
    const name = String(styleName || "").trim();
    const normalized = normalizeColorLookupKey(name);
    if (!name || !normalized) {
      return;
    }
    styleContext.styles.set(normalized, {
      name: name,
      declarations: cloneQStyleDeclarations(declarations),
      classes: cloneQStyleClasses(classes),
    });
  }

  function lookupQStyleDefinition(styleContext, styleName) {
    if (!styleContext || !(styleContext.styles instanceof Map)) {
      return null;
    }
    const normalized = normalizeColorLookupKey(styleName);
    if (!normalized) {
      return null;
    }
    const entry = styleContext.styles.get(normalized);
    if (!entry || typeof entry !== "object") {
      return null;
    }
    const out = cloneQStyleDefinition(entry);
    out.name = out.name || String(styleName || "").trim();
    return out;
  }

  function registerQThemeDefinition(styleContext, themeName, rules, options) {
    if (!styleContext || !(styleContext.themes instanceof Map)) {
      return;
    }
    const opts = options || {};
    const name = String(themeName || "").trim();
    const normalized = normalizeColorLookupKey(name);
    if (!name || !normalized) {
      return;
    }
    styleContext.themes.set(normalized, {
      name: name,
      isDefault: !!opts.isDefault,
      rules: cloneQThemeRules(rules),
    });
  }

  function lookupQThemeDefinition(styleContext, themeName) {
    if (!styleContext || !(styleContext.themes instanceof Map)) {
      return null;
    }
    const normalized = normalizeColorLookupKey(themeName);
    if (!normalized) {
      return null;
    }
    const entry = styleContext.themes.get(normalized);
    if (!entry || typeof entry !== "object") {
      return null;
    }
    const out = cloneQThemeDefinition(entry);
    out.name = out.name || String(themeName || "").trim();
    return out;
  }

  function appendActiveQTheme(styleContext, themeDefinition) {
    if (
      !styleContext ||
      !Array.isArray(styleContext.activeThemes) ||
      !Array.isArray(styleContext.activeDefaultThemes)
    ) {
      return;
    }
    if (!themeDefinition || typeof themeDefinition !== "object") {
      return;
    }
    const themeName = String(themeDefinition.name || "").trim();
    const visited = new Set();
    const themeKey = normalizeColorLookupKey(themeName);
    if (themeKey) {
      visited.add(themeKey);
    }
    const expandedRules = expandQThemeRules(styleContext, themeDefinition, visited);
    const nextEntry = {
      name: themeName,
      isDefault: !!themeDefinition.isDefault,
      rules: expandedRules,
    };
    if (nextEntry.isDefault) {
      styleContext.activeDefaultThemes.push(nextEntry);
    } else {
      styleContext.activeThemes.push(nextEntry);
    }
  }

  function createQStyleContext(parentContext) {
    const context = {
      styles: new Map(),
      themes: new Map(),
      activeDefaultThemes: [],
      activeThemes: [],
    };
    if (parentContext && parentContext.styles instanceof Map) {
      parentContext.styles.forEach(function copyStyle(entry, key) {
        if (!entry || typeof entry !== "object") {
          return;
        }
        context.styles.set(String(key || ""), {
          name: String(entry.name || key || "").trim() || String(key || ""),
          declarations: cloneQStyleDeclarations(entry.declarations),
          classes: cloneQStyleClasses(entry.classes),
        });
      });
    }
    if (parentContext && parentContext.themes instanceof Map) {
      parentContext.themes.forEach(function copyTheme(entry, key) {
        if (!entry || typeof entry !== "object") {
          return;
        }
        context.themes.set(String(key || ""), {
          name: String(entry.name || key || "").trim() || String(key || ""),
          rules: cloneQThemeRules(entry.rules),
        });
      });
    }
    if (parentContext && Array.isArray(parentContext.activeThemes)) {
      for (let i = 0; i < parentContext.activeThemes.length; i += 1) {
        appendActiveQTheme(context, parentContext.activeThemes[i]);
      }
    }
    if (parentContext && Array.isArray(parentContext.activeDefaultThemes)) {
      for (let i = 0; i < parentContext.activeDefaultThemes.length; i += 1) {
        appendActiveQTheme(context, parentContext.activeDefaultThemes[i]);
      }
    }
    return context;
  }

  function qStyleDeclarationsToCssText(declarations) {
    const source = declarations && typeof declarations === "object" && !Array.isArray(declarations)
      ? declarations
      : {};
    const keys = Object.keys(source);
    const chunks = [];
    for (let i = 0; i < keys.length; i += 1) {
      const rawProperty = String(keys[i] || "").trim();
      if (!rawProperty) {
        continue;
      }
      const value = String(source[rawProperty] || "").trim();
      if (!value) {
        continue;
      }
      const property = normalizeCssPropertyName(rawProperty);
      if (!property) {
        continue;
      }
      chunks.push(property + ": " + value);
    }
    return chunks.join("; ").trim();
  }

  function applyQStyleToElementNode(elementNode, styleDefinition) {
    if (!elementNode || elementNode.kind !== core.NODE_TYPES.element) {
      return;
    }
    if (!styleDefinition || typeof styleDefinition !== "object") {
      return;
    }
    const classNames = cloneQStyleClasses(styleDefinition.classes);
    if (classNames.length > 0) {
      elementNode.attributes.class = core.mergeClasses(
        elementNode.attributes && elementNode.attributes.class,
        classNames
      );
    }
    const cssText = qStyleDeclarationsToCssText(styleDefinition.declarations);
    if (!cssText) {
      return;
    }
    mergeStyleAttribute(elementNode, cssText);
  }

  function doesQThemeSelectorMatchElement(selector, elementNode) {
    const target = String(selector || "").trim();
    if (!target || !elementNode || elementNode.kind !== core.NODE_TYPES.element) {
      return false;
    }
    if (target === "*") {
      return true;
    }
    const parsed = parseTagToken(target);
    const nodeTag = String(elementNode.tagName || "").trim().toLowerCase();
    if (parsed.tag && parsed.tag !== nodeTag) {
      return false;
    }
    const attrs = elementNode.attributes && typeof elementNode.attributes === "object" ? elementNode.attributes : {};
    if (parsed.id && String(attrs.id || "").trim() !== parsed.id) {
      return false;
    }
    if (Array.isArray(parsed.classes) && parsed.classes.length > 0) {
      const classNameSet = new Set(String(attrs.class || "").split(/\s+/).filter(Boolean));
      for (let i = 0; i < parsed.classes.length; i += 1) {
        if (!classNameSet.has(parsed.classes[i])) {
          return false;
        }
      }
    }
    return true;
  }

  function applyActiveQThemesToElementNode(elementNode, styleContext) {
    if (!elementNode || elementNode.kind !== core.NODE_TYPES.element) {
      return;
    }
    if (
      !styleContext ||
      (!Array.isArray(styleContext.activeThemes) && !Array.isArray(styleContext.activeDefaultThemes))
    ) {
      return;
    }
    const themeSources = []
      .concat(Array.isArray(styleContext.activeDefaultThemes) ? styleContext.activeDefaultThemes : [])
      .concat(Array.isArray(styleContext.activeThemes) ? styleContext.activeThemes : []);
    for (let ti = 0; ti < themeSources.length; ti += 1) {
      const theme = themeSources[ti];
      const rules = Array.isArray(theme && theme.rules) ? theme.rules : [];
      for (let ri = 0; ri < rules.length; ri += 1) {
        const rule = rules[ri];
        if (!rule || !doesQThemeSelectorMatchElement(rule.selector, elementNode)) {
          continue;
        }
        const styleNames = Array.isArray(rule.styles) ? rule.styles : [];
        for (let si = 0; si < styleNames.length; si += 1) {
          const styleDef = lookupQStyleDefinition(styleContext, styleNames[si]);
          if (!styleDef) {
            continue;
          }
          applyQStyleToElementNode(elementNode, styleDef);
        }
      }
    }
  }

  function resolveQThemeRuleRuntimeStyle(styleContext, styleNames) {
    const names = Array.isArray(styleNames) ? styleNames : [];
    const declarations = {};
    const classes = [];
    const seenClasses = new Set();
    for (let i = 0; i < names.length; i += 1) {
      const styleDef = lookupQStyleDefinition(styleContext, names[i]);
      if (!styleDef) {
        continue;
      }
      const nextDecls = styleDef.declarations && typeof styleDef.declarations === "object" && !Array.isArray(styleDef.declarations)
        ? styleDef.declarations
        : {};
      const declKeys = Object.keys(nextDecls);
      for (let di = 0; di < declKeys.length; di += 1) {
        const key = String(declKeys[di] || "").trim();
        if (!key) {
          continue;
        }
        declarations[key] = String(nextDecls[key] || "").trim();
      }
      const nextClasses = Array.isArray(styleDef.classes) ? styleDef.classes : [];
      for (let ci = 0; ci < nextClasses.length; ci += 1) {
        const className = String(nextClasses[ci] || "").trim();
        if (!className || seenClasses.has(className)) {
          continue;
        }
        seenClasses.add(className);
        classes.push(className);
      }
    }
    return {
      declarations: declarations,
      classes: classes,
    };
  }

  function serializeActiveQThemeRulesForRuntime(styleContext, themeList) {
    const list = Array.isArray(themeList) ? themeList : [];
    const out = [];
    for (let ti = 0; ti < list.length; ti += 1) {
      const theme = list[ti];
      const rules = Array.isArray(theme && theme.rules) ? theme.rules : [];
      for (let ri = 0; ri < rules.length; ri += 1) {
        const rule = rules[ri];
        if (!rule || typeof rule !== "object") {
          continue;
        }
        const selector = String(rule.selector || "").trim();
        if (!selector) {
          continue;
        }
        const resolved = resolveQThemeRuleRuntimeStyle(styleContext, rule.styles);
        const hasDeclarations = Object.keys(resolved.declarations).length > 0;
        const hasClasses = Array.isArray(resolved.classes) && resolved.classes.length > 0;
        if (!hasDeclarations && !hasClasses) {
          continue;
        }
        out.push({
          selector: selector,
          declarations: cloneQStyleDeclarations(resolved.declarations),
          classes: cloneQStyleClasses(resolved.classes),
        });
      }
    }
    return out;
  }

  function attachRuntimeThemeRulesToElementNode(elementNode, styleContext) {
    if (!elementNode || elementNode.kind !== core.NODE_TYPES.element) {
      return;
    }
    if (
      !styleContext ||
      (!Array.isArray(styleContext.activeThemes) && !Array.isArray(styleContext.activeDefaultThemes))
    ) {
      return;
    }
    const defaultRules = serializeActiveQThemeRulesForRuntime(styleContext, styleContext.activeDefaultThemes);
    const rules = serializeActiveQThemeRulesForRuntime(styleContext, styleContext.activeThemes);
    if (defaultRules.length === 0 && rules.length === 0) {
      return;
    }
    if (!elementNode.meta || typeof elementNode.meta !== "object") {
      elementNode.meta = {};
    }
    elementNode.meta.qRuntimeThemeRules = {
      defaultRules: defaultRules,
      rules: rules,
    };
  }

  function lookupQColorPropertyByArea(colorContext, areaName, options) {
    const opts = options && typeof options === "object" ? options : {};
    const normalized = normalizeColorLookupKey(areaName);
    if (!normalized || !colorContext || !(colorContext.schemas instanceof Map)) {
      return "";
    }
    const entry = colorContext.schemas.get(normalized);
    if (!entry || typeof entry !== "object") {
      const areaValues =
        opts.areaValues && typeof opts.areaValues === "object" && !Array.isArray(opts.areaValues)
          ? opts.areaValues
          : null;
      if (areaValues && lookupAreaValueInObject(areaValues, areaName)) {
        return normalizeCssPropertyName(areaName);
      }
      const choices = Array.from(colorContext.schemas.keys());
      if (choices.length === 0) {
        return "";
      }
      const ranked = fuzzyResolve(normalized, choices, 1);
      if (!Array.isArray(ranked) || ranked.length === 0 || !ranked[0]) {
        return "";
      }
      const fallbackEntry = colorContext.schemas.get(String(ranked[0].candidate || ""));
      if (!fallbackEntry || typeof fallbackEntry !== "object") {
        return "";
      }
      return String(fallbackEntry.property || "").trim();
    }
    return String(entry.property || "").trim();
  }

  function lookupQColorThemeAssignments(colorContext, themeName) {
    const normalized = normalizeColorLookupKey(themeName);
    if (!normalized || !colorContext || !(colorContext.themes instanceof Map)) {
      return null;
    }
    const entry = colorContext.themes.get(normalized);
    if (!entry || typeof entry !== "object") {
      return null;
    }
    return cloneQColorAssignments(entry.assignments);
  }

  function lookupAreaValueInObject(mapObject, areaName) {
    if (!mapObject || typeof mapObject !== "object" || Array.isArray(mapObject)) {
      return "";
    }
    const target = normalizeColorLookupKey(areaName);
    if (!target) {
      return "";
    }
    const keys = Object.keys(mapObject);
    for (let i = 0; i < keys.length; i += 1) {
      const key = String(keys[i] || "").trim();
      if (!key) {
        continue;
      }
      if (normalizeColorLookupKey(key) !== target) {
        continue;
      }
      return normalizeQColorResolvedValue(mapObject[key]);
    }
    return "";
  }

  function resolveQColorAssignmentValue(rawValue, colorContext) {
    const value = normalizeQColorResolvedValue(rawValue);
    if (!value) {
      return "";
    }
    const themeName = String(colorContext && colorContext.defaultThemeName || "").trim();
    const theme = lookupQColorThemeAssignments(colorContext, themeName);
    const fromTheme = normalizeQColorResolvedValue(lookupAreaValueInObject(theme, value));
    if (fromTheme) {
      return fromTheme || value;
    }
    return value;
  }

  function buildQColorAreaValueMap(assignments, colorContext) {
    const source = assignments && typeof assignments === "object" ? assignments : {};
    const merged = {};
    const sourceKeys = Object.keys(source);
    const requestedKeys = [];
    for (let i = 0; i < sourceKeys.length; i += 1) {
      const key = String(sourceKeys[i] || "").trim();
      if (!key || normalizeColorLookupKey(key) === "theme") {
        continue;
      }
      requestedKeys.push(key);
    }
    const requestedPatterns = requestedKeys.map(function mapRequestedPattern(key) {
      return String(key || "").trim();
    }).filter(Boolean);
    const hasRequestedKeys = requestedPatterns.length > 0;

    const themeName = String(source.theme || colorContext && colorContext.defaultThemeName || "").trim();
    if (themeName) {
      const theme = lookupQColorThemeAssignments(colorContext, themeName);
      if (theme && typeof theme === "object") {
        const themeKeys = Object.keys(theme);
        for (let i = 0; i < themeKeys.length; i += 1) {
          const key = String(themeKeys[i] || "").trim();
          if (!key) {
            continue;
          }
          if (hasRequestedKeys && !doesQColorRequestMatchAnyArea(requestedPatterns, key)) {
            continue;
          }
          merged[key] = theme[key];
        }
      }
    }

    for (let i = 0; i < sourceKeys.length; i += 1) {
      const key = String(sourceKeys[i] || "").trim();
      if (!key || normalizeColorLookupKey(key) === "theme") {
        continue;
      }
      if (source[key] === true) {
        continue;
      }
      merged[key] = source[key];
    }

    const out = {};
    const keys = Object.keys(merged);
    for (let i = 0; i < keys.length; i += 1) {
      const key = String(keys[i] || "").trim();
      if (!key) {
        continue;
      }
      const resolvedValue = resolveQColorAssignmentValue(merged[key], colorContext);
      if (!resolvedValue) {
        continue;
      }
      out[key] = resolvedValue;
    }
    return out;
  }

  function buildQColorStyleDeclarationsFromAreaMap(areaMap, colorContext) {
    const source = areaMap && typeof areaMap === "object" ? areaMap : {};
    const declarations = [];
    const keys = Object.keys(source);
    for (let i = 0; i < keys.length; i += 1) {
      const key = String(keys[i] || "").trim();
      const value = String(source[key] || "").trim();
      if (!key || !value) {
        continue;
      }
      const cssProperty = lookupQColorPropertyByArea(colorContext, key, {
        areaValues: source,
      }) || inferQColorCssProperty(key);
      if (!cssProperty) {
        continue;
      }
      declarations.push(cssProperty + ": " + value);
    }
    return declarations;
  }

  function buildQColorStyleDeclarations(assignments, colorContext) {
    return buildQColorStyleDeclarationsFromAreaMap(
      buildQColorAreaValueMap(assignments, colorContext),
      colorContext
    );
  }

  function buildQColorAreaValueMapFromList(assignmentsList, colorContext) {
    const list = Array.isArray(assignmentsList) ? assignmentsList : [];
    const merged = {};
    for (let i = 0; i < list.length; i += 1) {
      const assignments = list[i];
      const values = buildQColorAreaValueMap(assignments, colorContext);
      const keys = Object.keys(values);
      for (let j = 0; j < keys.length; j += 1) {
        const key = String(keys[j] || "").trim();
        const value = String(values[key] || "").trim();
        if (!key || !value) {
          continue;
        }
        merged[key] = value;
      }
    }
    return merged;
  }

  function buildQColorStyleDeclarationsFromList(assignmentsList, colorContext) {
    return buildQColorStyleDeclarationsFromAreaMap(
      buildQColorAreaValueMapFromList(assignmentsList, colorContext),
      colorContext
    );
  }

  function composeStyleFromBaseAndDeclarations(baseStyle, declarations) {
    const base = String(baseStyle || "").trim();
    const list = Array.isArray(declarations) ? declarations.filter(Boolean) : [];
    const colorStyle = list.join("; ").trim();
    if (!base && !colorStyle) {
      return "";
    }
    if (!base) {
      return colorStyle;
    }
    if (!colorStyle) {
      return base;
    }
    const needsSemicolon = !base.endsWith(";");
    return (base + (needsSemicolon ? ";" : "") + " " + colorStyle).trim();
  }

  function splitInlineStyleDeclarations(styleText) {
    const source = String(styleText || "");
    const out = [];
    let token = "";
    let quote = "";
    let escaped = false;
    let parenDepth = 0;
    for (let i = 0; i < source.length; i += 1) {
      const ch = source[i];
      if (escaped) {
        token += ch;
        escaped = false;
        continue;
      }
      if (quote) {
        token += ch;
        if (ch === "\\") {
          escaped = true;
          continue;
        }
        if (ch === quote) {
          quote = "";
        }
        continue;
      }
      if (ch === "'" || ch === "\"") {
        quote = ch;
        token += ch;
        continue;
      }
      if (ch === "(") {
        parenDepth += 1;
        token += ch;
        continue;
      }
      if (ch === ")" && parenDepth > 0) {
        parenDepth -= 1;
        token += ch;
        continue;
      }
      if (ch === ";" && parenDepth === 0) {
        const chunk = String(token || "").trim();
        if (chunk) {
          out.push(chunk);
        }
        token = "";
        continue;
      }
      token += ch;
    }
    const trailing = String(token || "").trim();
    if (trailing) {
      out.push(trailing);
    }
    return out;
  }

  function parseInlineStyleDeclarations(styleText) {
    const entries = splitInlineStyleDeclarations(styleText);
    const out = [];
    for (let i = 0; i < entries.length; i += 1) {
      const raw = String(entries[i] || "").trim();
      if (!raw) {
        continue;
      }
      const colonIndex = raw.indexOf(":");
      if (colonIndex <= 0) {
        continue;
      }
      const property = String(raw.slice(0, colonIndex) || "").trim();
      const value = String(raw.slice(colonIndex + 1) || "").trim();
      if (!property || !value) {
        continue;
      }
      out.push({
        property: property,
        normalizedProperty: normalizeCssPropertyName(property),
        value: value,
      });
    }
    return out;
  }

  function joinInlineStyleDeclarations(declarations) {
    const list = Array.isArray(declarations) ? declarations : [];
    const out = [];
    for (let i = 0; i < list.length; i += 1) {
      const item = list[i];
      if (!item || typeof item !== "object") {
        continue;
      }
      const property = String(item.property || "").trim();
      const value = String(item.value || "").trim();
      if (!property || !value) {
        continue;
      }
      out.push(property + ": " + value);
    }
    return out.join("; ").trim();
  }

  function composeQColorStyleWithExisting(options) {
    const opts = options && typeof options === "object" ? options : {};
    const currentStyle = String(opts.currentStyle || "").trim();
    const baseStyle = String(opts.baseStyle || "").trim();
    const colorDeclarations = Array.isArray(opts.colorDeclarations) ? opts.colorDeclarations : [];
    const previousManaged = Array.isArray(opts.previousManagedProperties) ? opts.previousManagedProperties : [];
    const parsedBase = parseInlineStyleDeclarations(baseStyle);
    const parsedCurrent = parseInlineStyleDeclarations(currentStyle);
    const mergedSourceMap = Object.create(null);
    const mergedSourceOrder = [];
    function mergeSourceDeclarations(list) {
      const entries = Array.isArray(list) ? list : [];
      for (let i = 0; i < entries.length; i += 1) {
        const item = entries[i];
        if (!item || !item.normalizedProperty) {
          continue;
        }
        if (!Object.prototype.hasOwnProperty.call(mergedSourceMap, item.normalizedProperty)) {
          mergedSourceOrder.push(item.normalizedProperty);
        }
        mergedSourceMap[item.normalizedProperty] = item;
      }
    }
    mergeSourceDeclarations(parsedBase);
    mergeSourceDeclarations(parsedCurrent);
    const parsedSource = [];
    for (let i = 0; i < mergedSourceOrder.length; i += 1) {
      const key = mergedSourceOrder[i];
      const item = mergedSourceMap[key];
      if (!item) {
        continue;
      }
      parsedSource.push(item);
    }

    const parsedColor = [];
    const nextManagedSet = new Set();
    for (let i = 0; i < colorDeclarations.length; i += 1) {
      const entry = parseInlineStyleDeclarations(String(colorDeclarations[i] || ""));
      for (let j = 0; j < entry.length; j += 1) {
        const item = entry[j];
        parsedColor.push(item);
        if (item.normalizedProperty) {
          nextManagedSet.add(item.normalizedProperty);
        }
      }
    }

    const removeSet = new Set();
    for (let i = 0; i < previousManaged.length; i += 1) {
      const prop = normalizeCssPropertyName(previousManaged[i]);
      if (prop) {
        removeSet.add(prop);
      }
    }
    nextManagedSet.forEach(function eachManaged(prop) {
      if (prop) {
        removeSet.add(prop);
      }
    });

    const retained = [];
    for (let i = 0; i < parsedSource.length; i += 1) {
      const item = parsedSource[i];
      if (!item || !item.normalizedProperty || removeSet.has(item.normalizedProperty)) {
        continue;
      }
      retained.push(item);
    }

    const merged = retained.concat(parsedColor);
    return {
      style: joinInlineStyleDeclarations(merged),
      managedProperties: Array.from(nextManagedSet),
    };
  }

  function inferQColorCssProperty(areaName) {
    const normalized = normalizeColorLookupKey(areaName);
    if (!normalized) {
      return "";
    }
    if (
      normalized === "background-color" ||
      normalized === "background" ||
      normalized === "bg" ||
      normalized.endsWith("-bg") ||
      normalized.indexOf("background") !== -1
    ) {
      return "background-color";
    }
    if (
      normalized === "foreground-color" ||
      normalized === "foreground" ||
      normalized === "fg" ||
      normalized.endsWith("-fg") ||
      normalized.endsWith("-foreground")
    ) {
      return "color";
    }
    if (normalized === "color" || normalized.endsWith("-color")) {
      return "color";
    }
    if (normalized.indexOf("border") !== -1) {
      return "border-color";
    }
    if (normalized.indexOf("outline") !== -1) {
      return "outline-color";
    }
    if (normalized.indexOf("shadow") !== -1) {
      return "box-shadow";
    }
    if (normalized.indexOf("fill") !== -1) {
      return "fill";
    }
    if (normalized.indexOf("stroke") !== -1) {
      return "stroke";
    }
    if (normalized.indexOf("caret") !== -1) {
      return "caret-color";
    }
    return qColorStylePropertyForKey(areaName);
  }

  function warnQColor(message, detail) {
    if (typeof console === "undefined" || !console || typeof console.warn !== "function") {
      return;
    }
    if (typeof detail === "undefined") {
      console.warn("qhtml q-color warning:", message);
      return;
    }
    console.warn("qhtml q-color warning:", message, detail);
  }

  function warnDeprecatedSyntaxFeature(featureName) {
    const feature = String(featureName || "").trim().toLowerCase();
    if (!feature || DEPRECATED_FEATURE_WARNED.has(feature)) {
      return;
    }
    DEPRECATED_FEATURE_WARNED.add(feature);
    if (typeof console === "undefined" || !console || typeof console.warn !== "function") {
      return;
    }
    console.warn(
      "[qhtml] Deprecated syntax `" +
        feature +
        "` is scheduled for removal in v6.0.8. Use `q-style` / `q-theme` instead."
    );
  }

  function normalizeCssPropertyName(name) {
    const raw = String(name || "").trim();
    if (!raw) {
      return "";
    }
    if (raw.indexOf("--") === 0) {
      return raw;
    }
    if (raw.indexOf("-") >= 0) {
      return raw.toLowerCase();
    }
    return raw.replace(/([A-Z])/g, "-$1").toLowerCase();
  }

  function isLikelyColorValue(value) {
    const text = String(value || "").trim();
    if (!text) {
      return false;
    }
    if (/^#[0-9a-f]{3,8}$/i.test(text)) {
      return true;
    }
    if (/^(rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)\(/i.test(text)) {
      return true;
    }
    if (/gradient\(/i.test(text)) {
      return true;
    }
    if (/^(var|calc|min|max|clamp)\(/i.test(text)) {
      return true;
    }
    if (/^(transparent|currentcolor|inherit|initial|unset|revert|revert-layer|[a-z-]+)$/i.test(text)) {
      return true;
    }
    return false;
  }

  function isLikelyBorderValue(value) {
    const text = String(value || "").trim();
    if (!text) {
      return false;
    }
    if (/^(var|calc|min|max|clamp)\(/i.test(text)) {
      return true;
    }
    if (/^(none|initial|inherit|unset|revert|revert-layer)$/i.test(text)) {
      return true;
    }
    if (/^([0-9.]+(px|em|rem|%)\s+)?(none|solid|dashed|dotted|double|groove|ridge|inset|outset)\s+.+$/i.test(text)) {
      return true;
    }
    return isLikelyColorValue(text);
  }

  function isLikelyBoxShadowValue(value) {
    const text = String(value || "").trim();
    if (!text) {
      return false;
    }
    if (/^(none|inherit|initial|unset|revert|revert-layer)$/i.test(text)) {
      return true;
    }
    if (/^(var|calc|min|max|clamp)\(/i.test(text)) {
      return true;
    }
    if (/(\d+(\.\d+)?(px|em|rem|%))/.test(text) || /^inset\b/i.test(text)) {
      return true;
    }
    return false;
  }

  function isValidQColorPropertyValue(propertyName, value) {
    const property = normalizeCssPropertyName(propertyName);
    const text = String(value || "").trim();
    if (!property || !text) {
      return false;
    }
    if (/[{}]/.test(text)) {
      return false;
    }
    if (property.indexOf("--") === 0) {
      return true;
    }
    if (property === "background" || property === "background-color") {
      return isLikelyColorValue(text);
    }
    if (
      property === "color" ||
      property === "border-color" ||
      property === "outline-color" ||
      property === "caret-color" ||
      property === "fill" ||
      property === "stroke"
    ) {
      return isLikelyColorValue(text);
    }
    if (property === "border") {
      return isLikelyBorderValue(text);
    }
    if (property === "box-shadow") {
      return isLikelyBoxShadowValue(text);
    }
    return true;
  }

  function applyQColorAssignmentsToElementNode(elementNode, colorContext) {
    if (!elementNode || typeof elementNode !== "object") {
      return;
    }
    if (!elementNode.meta || typeof elementNode.meta !== "object") {
      elementNode.meta = {};
    }
    const assignments = Array.isArray(elementNode.meta.qColorAssignments)
      ? elementNode.meta.qColorAssignments
      : [];
    const areaGroups = Array.isArray(elementNode.meta.qColorAreas)
      ? elementNode.meta.qColorAreas
      : [];
    const areaValues = buildQColorAreaValueMapFromList(assignments, colorContext);
    const requestedAreas = expandQColorRequestedAreas(
      areaGroups,
      colorContext,
      areaValues,
      elementNode.meta.qColorAreaProperties
    );
    const propertyOrder = [];
    const declarationMap = Object.create(null);
    const sourceAreaMap = Object.create(null);
    for (let i = 0; i < requestedAreas.length; i += 1) {
      const areaName = requestedAreas[i];
      const explicitProperty = lookupQColorPropertyByArea(colorContext, areaName, {
        areaValues: areaValues,
      });
      if (explicitProperty) {
        if (!elementNode.meta || typeof elementNode.meta !== "object") {
          elementNode.meta = {};
        }
        if (
          !elementNode.meta.qColorAreaProperties ||
          typeof elementNode.meta.qColorAreaProperties !== "object" ||
          Array.isArray(elementNode.meta.qColorAreaProperties)
        ) {
          elementNode.meta.qColorAreaProperties = {};
        }
        elementNode.meta.qColorAreaProperties[areaName] = explicitProperty;
      }
      const value = lookupAreaValueInObject(areaValues, areaName);
      if (!value) {
        continue;
      }
      const cssProperty = explicitProperty || inferQColorCssProperty(areaName);
      if (!cssProperty) {
        continue;
      }
      if (explicitProperty) {
        if (!elementNode.meta || typeof elementNode.meta !== "object") {
          elementNode.meta = {};
        }
        if (
          !elementNode.meta.qColorAreaProperties ||
          typeof elementNode.meta.qColorAreaProperties !== "object" ||
          Array.isArray(elementNode.meta.qColorAreaProperties)
        ) {
          elementNode.meta.qColorAreaProperties = {};
        }
        elementNode.meta.qColorAreaProperties[areaName] = explicitProperty;
      }
      if (!explicitProperty) {
        warnQColor("qhtml q-color fallback-map", {
          area: areaName,
          property: cssProperty,
        });
      }
      if (!isValidQColorPropertyValue(cssProperty, value)) {
        warnQColor("qhtml q-color invalid-value", {
          area: areaName,
          property: cssProperty,
          value: value,
        });
      }
      const normalizedProperty = normalizeCssPropertyName(cssProperty);
      if (normalizedProperty && Object.prototype.hasOwnProperty.call(declarationMap, normalizedProperty)) {
        warnQColor("qhtml q-color override", {
          area: areaName,
          overriddenArea: sourceAreaMap[normalizedProperty] || "",
          property: cssProperty,
        });
      }
      if (normalizedProperty && !Object.prototype.hasOwnProperty.call(declarationMap, normalizedProperty)) {
        propertyOrder.push(normalizedProperty);
      }
      if (normalizedProperty) {
        declarationMap[normalizedProperty] = cssProperty + ": " + value;
        sourceAreaMap[normalizedProperty] = areaName;
      }
    }
    const inlineDeclarations = [];
    for (let i = 0; i < propertyOrder.length; i += 1) {
      const normalizedProperty = propertyOrder[i];
      const declaration = String(declarationMap[normalizedProperty] || "").trim();
      if (!declaration) {
        continue;
      }
      inlineDeclarations.push(declaration);
    }
    const baseStyle = String(elementNode.meta.qColorBaseStyle || "").trim();
    const fallbackDeclarations = requestedAreas.length > 0
      ? inlineDeclarations
      : buildQColorStyleDeclarationsFromList(assignments, colorContext);
    const previousManaged = Array.isArray(elementNode.meta.qColorManagedProperties)
      ? elementNode.meta.qColorManagedProperties.slice()
      : [];
    const currentStyle = String(elementNode.attributes && elementNode.attributes.style || "").trim();
    const styleCompose = composeQColorStyleWithExisting({
      currentStyle: currentStyle,
      baseStyle: baseStyle,
      colorDeclarations: fallbackDeclarations,
      previousManagedProperties: previousManaged,
    });
    const mergedStyle = String(styleCompose.style || "").trim();
    elementNode.meta.qColorManagedProperties = Array.isArray(styleCompose.managedProperties)
      ? styleCompose.managedProperties.slice()
      : [];
    if (!elementNode.attributes || typeof elementNode.attributes !== "object") {
      elementNode.attributes = {};
    }
    if (mergedStyle) {
      elementNode.attributes.style = mergedStyle;
    } else {
      delete elementNode.attributes.style;
    }

    if (Array.isArray(elementNode.children)) {
      const nextChildren = [];
      for (let i = 0; i < elementNode.children.length; i += 1) {
        const child = elementNode.children[i];
        if (
          child &&
          child.kind === core.NODE_TYPES.rawHtml &&
          child.meta &&
          child.meta.qColorGeneratedStyle === true
        ) {
          continue;
        }
        nextChildren.push(child);
      }
      elementNode.children = nextChildren;
    }
  }

  function collectQColorCandidateAreas(colorContext, areaValues, areaPropertyMap) {
    const out = [];
    const seen = new Set();
    function pushArea(name) {
      const areaName = String(name || "").trim();
      const normalized = normalizeColorLookupKey(areaName);
      if (!areaName || !normalized || seen.has(normalized)) {
        return;
      }
      seen.add(normalized);
      out.push(areaName);
    }
    if (colorContext && colorContext.schemas instanceof Map) {
      colorContext.schemas.forEach(function collectSchema(entry, key) {
        if (entry && typeof entry === "object" && String(entry.name || "").trim()) {
          pushArea(entry.name);
          return;
        }
        pushArea(key);
      });
    }
    const valueKeys = Object.keys(areaValues && typeof areaValues === "object" ? areaValues : {});
    for (let i = 0; i < valueKeys.length; i += 1) {
      pushArea(valueKeys[i]);
    }
    const propertyKeys = Object.keys(
      areaPropertyMap && typeof areaPropertyMap === "object" && !Array.isArray(areaPropertyMap)
        ? areaPropertyMap
        : {}
    );
    for (let i = 0; i < propertyKeys.length; i += 1) {
      pushArea(propertyKeys[i]);
    }
    return out;
  }

  function expandQColorRequestedAreas(areaGroups, colorContext, areaValues, areaPropertyMap) {
    const groups = Array.isArray(areaGroups) ? areaGroups : [];
    const requested = [];
    const seen = new Set();
    const candidates = collectQColorCandidateAreas(colorContext, areaValues, areaPropertyMap);
    function pushArea(name) {
      const areaName = String(name || "").trim();
      const normalized = normalizeColorLookupKey(areaName);
      if (!areaName || !normalized || seen.has(normalized)) {
        return;
      }
      seen.add(normalized);
      requested.push(areaName);
    }
    for (let i = 0; i < groups.length; i += 1) {
      const group = Array.isArray(groups[i]) ? groups[i] : [];
      for (let j = 0; j < group.length; j += 1) {
        const areaName = String(group[j] || "").trim();
        if (!areaName) {
          continue;
        }
        if (hasQColorWildcardPattern(areaName)) {
          let matched = false;
          for (let k = 0; k < candidates.length; k += 1) {
            const candidate = candidates[k];
            if (!doesQColorRequestMatchAreaName(areaName, candidate)) {
              continue;
            }
            pushArea(candidate);
            matched = true;
          }
          if (!matched) {
            warnQColor("qhtml q-color wildcard-no-match", { area: areaName });
          }
          continue;
        }
        pushArea(areaName);
      }
    }
    return requested;
  }

  function applyQColorSetupToElementNode(elementNode, setup, colorContext) {
    if (!elementNode || typeof elementNode !== "object") {
      return;
    }
    const config = setup && typeof setup === "object" ? setup : null;
    if (!config) {
      return;
    }
    const assignments = cloneQColorAssignments(config.assignments);
    const areas = cloneQColorAreas(config.areas);
    const hasAssignments = Object.keys(assignments).length > 0;
    const hasAreas = areas.length > 0;
    if (!hasAssignments && !hasAreas) {
      return;
    }
    if (!elementNode.meta || typeof elementNode.meta !== "object") {
      elementNode.meta = {};
    }
    if (!Array.isArray(elementNode.meta.qColorAssignments)) {
      elementNode.meta.qColorAssignments = [];
    }
    if (!Array.isArray(elementNode.meta.qColorAreas)) {
      elementNode.meta.qColorAreas = [];
    }
    if (typeof elementNode.meta.qColorBaseStyle !== "string") {
      elementNode.meta.qColorBaseStyle = String(elementNode.attributes && elementNode.attributes.style || "").trim();
    }
    elementNode.meta.qColorAssignments.push(assignments);
    elementNode.meta.qColorAreas.push(hasAreas ? areas : Object.keys(assignments));
    applyQColorAssignmentsToElementNode(elementNode, colorContext);
  }

  function applyActiveQColorSetupsToElementNode(elementNode, colorContext) {
    if (!colorContext || !Array.isArray(colorContext.activeSetups) || colorContext.activeSetups.length === 0) {
      return;
    }
    for (let i = 0; i < colorContext.activeSetups.length; i += 1) {
      applyQColorSetupToElementNode(elementNode, colorContext.activeSetups[i], colorContext);
    }
  }

  function registerQColorSchemaItem(colorContext, item) {
    if (!item || typeof item !== "object") {
      return;
    }
    const entries = item.entries && typeof item.entries === "object" ? item.entries : {};
    const entryKeys = Object.keys(entries);
    const schemaName = String(item.name || "").trim();
    if (schemaName) {
      const normalizedSchemaName = normalizeColorLookupKey(schemaName);
      if (normalizedSchemaName && colorContext && colorContext.schemaDefs instanceof Map) {
        colorContext.schemaDefs.set(normalizedSchemaName, {
          name: schemaName,
          entries: cloneQColorAssignments(entries),
        });
      }
      return;
    }
    for (let i = 0; i < entryKeys.length; i += 1) {
      const key = String(entryKeys[i] || "").trim();
      if (!key) {
        continue;
      }
      registerQColorSchema(colorContext, key, entries[key]);
    }
  }

  function registerQColorThemeItem(colorContext, item) {
    if (!item || typeof item !== "object") {
      return;
    }
    const themeName = String(item.name || "").trim();
    const normalizedThemeName = normalizeColorLookupKey(themeName);
    if (!themeName) {
      registerQColorTheme(colorContext, DEFAULT_QCOLOR_THEME_NAME, item.assignments, { setAsDefault: true });
      return;
    }
    registerQColorTheme(colorContext, themeName, item.assignments, {
      setAsDefault: normalizedThemeName === DEFAULT_QCOLOR_THEME_NAME,
    });
  }

  function registerQColorDefinitionItem(colorContext, item) {
    if (!item || typeof item !== "object") {
      return;
    }
    const setupName = String(item.name || "").trim();
    if (!setupName) {
      return;
    }
    registerQColorDefinition(colorContext, setupName, {
      assignments: item.assignments,
      areas: item.areas,
    });
  }

  function serializeQColorSchemas(colorContext) {
    const out = {};
    if (!colorContext || !(colorContext.schemas instanceof Map)) {
      return out;
    }
    colorContext.schemas.forEach(function eachSchema(entry) {
      if (!entry || typeof entry !== "object") {
        return;
      }
      const name = String(entry.name || "").trim();
      const value = String(entry.property || "").trim();
      if (!name || !value) {
        return;
      }
      out[name] = value;
    });
    return out;
  }

  function serializeQColorThemes(colorContext) {
    const out = {};
    if (!colorContext || !(colorContext.themes instanceof Map)) {
      return out;
    }
    colorContext.themes.forEach(function eachTheme(entry) {
      if (!entry || typeof entry !== "object") {
        return;
      }
      const name = String(entry.name || "").trim();
      if (!name) {
        return;
      }
      out[name] = cloneQColorAssignments(entry.assignments);
    });
    return out;
  }

  function serializeQColorSchemaDefinitions(colorContext) {
    const out = {};
    if (!colorContext || !(colorContext.schemaDefs instanceof Map)) {
      return out;
    }
    colorContext.schemaDefs.forEach(function eachSchemaDef(entry) {
      if (!entry || typeof entry !== "object") {
        return;
      }
      const name = String(entry.name || "").trim();
      if (!name) {
        return;
      }
      out[name] = cloneQColorAssignments(entry.entries);
    });
    return out;
  }

  function serializeQColorDefinitions(colorContext) {
    const out = {};
    if (!colorContext || !(colorContext.colorDefs instanceof Map)) {
      return out;
    }
    colorContext.colorDefs.forEach(function eachColorDef(entry) {
      if (!entry || typeof entry !== "object") {
        return;
      }
      const name = String(entry.name || "").trim();
      if (!name) {
        return;
      }
      out[name] = {
        assignments: cloneQColorAssignments(entry.assignments),
        areas: cloneQColorAreas(entry.areas),
      };
    });
    return out;
  }

  function parseTagToken(token) {
    const raw = String(token || "").trim();
    if (!raw) {
      return { raw: "", tag: "", id: "", classes: [] };
    }

    const head = raw.split(/\s+/)[0] || "";
    const baseMatch = head.match(/^[^.#\s]+/);
    const tag = String(baseMatch ? baseMatch[0] : "").trim().toLowerCase();

    let id = "";
    const classes = [];
    const seen = new Set();
    const fragmentRe = /([.#])([A-Za-z_][A-Za-z0-9_-]*)/g;
    let match;
    while ((match = fragmentRe.exec(head))) {
      const kind = match[1];
      const value = String(match[2] || "").trim();
      if (!value) {
        continue;
      }
      if (kind === "#") {
        if (!id) {
          id = value;
        }
        continue;
      }
      if (!seen.has(value)) {
        seen.add(value);
        classes.push(value);
      }
    }

    if (!tag && classes.length === 0 && !id) {
      return { raw: raw, tag: raw.toLowerCase(), id: "", classes: [] };
    }

    return {
      raw: raw,
      tag: tag,
      id: id,
      classes: classes,
    };
  }

  function detectSelectorMode(selectorTokens) {
    if (!Array.isArray(selectorTokens) || selectorTokens.length <= 1) {
      return "single";
    }

    const last = selectorTokens[selectorTokens.length - 1];
    const hasLastTag = !!(last && last.tag);

    for (let i = 0; i < selectorTokens.length - 1; i += 1) {
      const token = selectorTokens[i];
      if (!token) {
        return "nest";
      }
      if (token.classes.length > 0 || token.id) {
        return "nest";
      }
      if (token.tag && KNOWN_HTML_TAGS.has(token.tag)) {
        return "nest";
      }
    }

    if (hasLastTag && last.tag && KNOWN_HTML_TAGS.has(last.tag)) {
      return "class-shorthand";
    }

    return "nest";
  }

  function createTextContentNode(text, sourceMeta) {
    const value = String(text == null ? "" : text);
    if (!value) {
      return null;
    }
    if (typeof core.createTextNode === "function" && core.NODE_TYPES && core.NODE_TYPES.text) {
      return core.createTextNode({
        value: value,
        meta: Object.assign({ generated: true }, sourceMeta || {}),
      });
    }
    return core.createRawHtmlNode({
      html: escapeHtmlText(value),
      meta: Object.assign({ generated: true }, sourceMeta || {}),
    });
  }

  function appendTextChildNode(elementNode, text, sourceMeta) {
    if (!elementNode || typeof elementNode !== "object") {
      return;
    }
    if (!Array.isArray(elementNode.children)) {
      elementNode.children = [];
    }
    const textNode = createTextContentNode(text, sourceMeta);
    if (textNode) {
      elementNode.children.push(textNode);
    }
  }

  function mergeStyleAttribute(elementNode, cssText) {
    const incoming = String(cssText == null ? "" : cssText).trim();
    if (!incoming) {
      return;
    }
    const existing = String(elementNode.attributes.style || "").trim();
    if (!existing) {
      elementNode.attributes.style = incoming;
      return;
    }
    const needsSemicolon = !existing.endsWith(";");
    elementNode.attributes.style = (existing + (needsSemicolon ? ";" : "") + " " + incoming).trim();
  }

  function compactScriptBody(body) {
    return String(body == null ? "" : body)
      .replace(/\r/g, "\n")
      .replace(/\n+/g, "\n")
      .trim();
  }

  function unescapeSimpleQuotedBody(value) {
    return String(value)
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'")
      .replace(/\\`/g, "`")
      .replace(/\\\\/g, "\\");
  }

  function tryResolveStaticQScript(scriptBody) {
    const body = String(scriptBody || "").trim();
    const match = body.match(/^return\s+([\s\S]+?);?\s*$/);
    if (!match) {
      return null;
    }

    const expr = String(match[1] || "").trim();
    if (!expr) {
      return null;
    }

    if ((expr.startsWith('"') && expr.endsWith('"')) || (expr.startsWith("'") && expr.endsWith("'")) || (expr.startsWith("`") && expr.endsWith("`"))) {
      return unescapeSimpleQuotedBody(expr.slice(1, -1));
    }

    if (/^-?\d+(\.\d+)?$/.test(expr)) {
      return expr;
    }

    if (expr === "true" || expr === "false" || expr === "null") {
      return expr;
    }

    return null;
  }

  function isQScriptIdentifierChar(ch) {
    return !!ch && /[A-Za-z0-9_-]/.test(ch);
  }

  function isQRewriteIdentifierStart(ch) {
    return !!ch && /[A-Za-z_]/.test(ch);
  }

  function isQRewriteIdentifierChar(ch) {
    return !!ch && /[A-Za-z0-9_-]/.test(ch);
  }

  function collectKeywordAliasesFromSource(source) {
    const input = String(source || "");
    const aliases = new Map();
    let pos = 0;
    while (pos < input.length) {
      const token = findNextIdentifierTokenSkippingLiterals(input, pos);
      if (!token) {
        break;
      }
      pos = token.end;
      if (String(token.name || "").toLowerCase() !== "q-keyword") {
        continue;
      }
      const nested = parserFor(input);
      nested.index = token.end;
      try {
        parseKeywordAliasDeclaration(nested, aliases, token.start);
        pos = nested.index;
      } catch (error) {
        continue;
      }
    }
    return aliases;
  }

  function collectAliasesTargeting(keywordAliases, targetKeyword) {
    const target = String(targetKeyword || "").trim().toLowerCase();
    const out = new Set([target]);
    if (!(keywordAliases instanceof Map)) {
      return out;
    }
    keywordAliases.forEach(function eachAlias(spec) {
      const aliasName = String(spec && spec.nameLower ? spec.nameLower : "").trim().toLowerCase();
      const mapped = String(spec && spec.replacementFirstLower ? spec.replacementFirstLower : "").trim().toLowerCase();
      if (!aliasName || !mapped) {
        return;
      }
      if (mapped === target) {
        out.add(aliasName);
      }
    });
    return out;
  }

  function findNextKeywordTokenSkippingLiterals(source, fromIndex, keywords) {
    const wanted = keywords instanceof Set ? keywords : new Set();
    const input = String(source || "");
    let pos = Math.max(0, Number(fromIndex) || 0);
    while (pos < input.length) {
      const token = findNextIdentifierTokenSkippingLiterals(input, pos);
      if (!token) {
        return null;
      }
      pos = token.end;
      const lower = String(token.name || "").trim().toLowerCase();
      if (wanted.has(lower)) {
        return {
          start: token.start,
          end: token.end,
          name: token.name,
          nameLower: lower,
        };
      }
    }
    return null;
  }

  function findMatchingBraceWithLiterals(source, openIndex) {
    const input = String(source || "");
    let depth = 0;
    let inSingle = false;
    let inDouble = false;
    let inBacktick = false;
    let inLineComment = false;
    let inBlockComment = false;
    let escaped = false;

    for (let i = openIndex; i < input.length; i += 1) {
      const ch = input[i];
      const next = input[i + 1];

      if (inLineComment) {
        if (ch === "\n" || ch === "\r") {
          inLineComment = false;
        }
        continue;
      }

      if (inBlockComment) {
        if (ch === "*" && next === "/") {
          inBlockComment = false;
          i += 1;
        }
        continue;
      }

      if (inSingle) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === "\\") {
          escaped = true;
          continue;
        }
        if (ch === "'") {
          inSingle = false;
        }
        continue;
      }

      if (inDouble) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === "\\") {
          escaped = true;
          continue;
        }
        if (ch === '"') {
          inDouble = false;
        }
        continue;
      }

      if (inBacktick) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === "\\") {
          escaped = true;
          continue;
        }
        if (ch === "`") {
          inBacktick = false;
        }
        continue;
      }

      if (ch === "/" && next === "/") {
        inLineComment = true;
        i += 1;
        continue;
      }
      if (ch === "/" && next === "*") {
        inBlockComment = true;
        i += 1;
        continue;
      }
      if (ch === "'") {
        inSingle = true;
        continue;
      }
      if (ch === '"') {
        inDouble = true;
        continue;
      }
      if (ch === "`") {
        inBacktick = true;
        continue;
      }
      if (ch === "\\") {
        if (next === "{" || next === "}" || next === "\\") {
          i += 1;
        }
        continue;
      }

      if (ch === "{") {
        depth += 1;
        continue;
      }
      if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          return i;
        }
        if (depth < 0) {
          return -1;
        }
      }
    }

    return -1;
  }

  function findNextIdentifierTokenSkippingLiterals(source, fromIndex) {
    const input = String(source || "");
    let i = Math.max(0, Number(fromIndex) || 0);
    let inSingle = false;
    let inDouble = false;
    let inBacktick = false;
    let inLineComment = false;
    let inBlockComment = false;
    let escaped = false;

    while (i < input.length) {
      const ch = input[i];
      const next = input[i + 1];

      if (inLineComment) {
        if (ch === "\n" || ch === "\r") {
          inLineComment = false;
        }
        i += 1;
        continue;
      }

      if (inBlockComment) {
        if (ch === "*" && next === "/") {
          inBlockComment = false;
          i += 2;
          continue;
        }
        i += 1;
        continue;
      }

      if (inSingle) {
        if (escaped) {
          escaped = false;
          i += 1;
          continue;
        }
        if (ch === "\\") {
          escaped = true;
          i += 1;
          continue;
        }
        if (ch === "'") {
          inSingle = false;
        }
        i += 1;
        continue;
      }

      if (inDouble) {
        if (escaped) {
          escaped = false;
          i += 1;
          continue;
        }
        if (ch === "\\") {
          escaped = true;
          i += 1;
          continue;
        }
        if (ch === '"') {
          inDouble = false;
        }
        i += 1;
        continue;
      }

      if (inBacktick) {
        if (escaped) {
          escaped = false;
          i += 1;
          continue;
        }
        if (ch === "\\") {
          escaped = true;
          i += 1;
          continue;
        }
        if (ch === "`") {
          inBacktick = false;
        }
        i += 1;
        continue;
      }

      if (ch === "/" && next === "/") {
        inLineComment = true;
        i += 2;
        continue;
      }
      if (ch === "/" && next === "*") {
        inBlockComment = true;
        i += 2;
        continue;
      }
      if (ch === "'") {
        inSingle = true;
        i += 1;
        continue;
      }
      if (ch === '"') {
        inDouble = true;
        i += 1;
        continue;
      }
      if (ch === "`") {
        inBacktick = true;
        i += 1;
        continue;
      }

      if (isQRewriteIdentifierStart(ch)) {
        const start = i;
        i += 1;
        while (i < input.length && isQRewriteIdentifierChar(input[i])) {
          i += 1;
        }
        return {
          start: start,
          end: i,
          name: input.slice(start, i),
        };
      }

      i += 1;
    }

    return null;
  }

  function skipWhitespaceInSource(source, fromIndex) {
    const input = String(source || "");
    let i = Math.max(0, Number(fromIndex) || 0);
    while (i < input.length) {
      if (/\s/.test(input[i])) {
        i += 1;
        continue;
      }
      if (input[i] === "/" && input[i + 1] === "/") {
        i += 2;
        while (i < input.length && input[i] !== "\n" && input[i] !== "\r") {
          i += 1;
        }
        continue;
      }
      if (input[i] === "/" && input[i + 1] === "*") {
        i += 2;
        while (i < input.length && !(input[i] === "*" && input[i + 1] === "/")) {
          i += 1;
        }
        i = i < input.length ? i + 2 : input.length;
        continue;
      }
      break;
    }
    return i;
  }

  function parseTopLevelNamedBlocks(source) {
    const input = String(source || "");
    const blocks = [];
    let pos = 0;

    while (pos < input.length) {
      while (pos < input.length) {
        pos = skipWhitespaceInSource(input, pos);
        if (input[pos] !== ";") {
          break;
        }
        pos += 1;
      }
      if (pos >= input.length) {
        break;
      }

      if (!isQRewriteIdentifierStart(input[pos])) {
        pos += 1;
        continue;
      }

      const start = pos;
      pos += 1;
      while (pos < input.length && isQRewriteIdentifierChar(input[pos])) {
        pos += 1;
      }
      const name = input.slice(start, pos);
      const open = skipWhitespaceInSource(input, pos);
      if (input[open] !== "{") {
        pos = open + 1;
        continue;
      }

      const close = findMatchingBraceWithLiterals(input, open);
      if (close === -1) {
        throw new Error("Unterminated block '" + name + "' in q-rewrite body.");
      }

      blocks.push({
        name: name,
        nameLower: String(name).toLowerCase(),
        start: start,
        open: open,
        close: close,
        end: close + 1,
        body: input.slice(open + 1, close),
      });
      pos = close + 1;
    }

    return blocks;
  }

  function removeRangesFromSource(source, ranges) {
    const input = String(source || "");
    const list = Array.isArray(ranges) ? ranges.slice() : [];
    if (list.length === 0) {
      return input;
    }
    list.sort(function byStart(a, b) {
      return a.start - b.start;
    });
    let out = "";
    let cursor = 0;
    for (let i = 0; i < list.length; i += 1) {
      const range = list[i];
      const start = Math.max(0, Number(range.start) || 0);
      const end = Math.max(start, Number(range.end) || start);
      if (start > cursor) {
        out += input.slice(cursor, start);
      }
      cursor = Math.max(cursor, end);
    }
    if (cursor < input.length) {
      out += input.slice(cursor);
    }
    return out;
  }

  function normalizeQRewriteSlotName(name) {
    const value = String(name || "").trim().toLowerCase();
    return value || "default";
  }

  function normalizeScopedReferenceKey(name) {
    const value = String(name || "").trim();
    if (!value) {
      return "";
    }
    return value.toLowerCase();
  }

  const SCOPED_REFERENCE_ESCAPE_TOKEN = "__QHTML_ESCAPED_SCOPED_REF__";

  function replaceScopedReferencesInText(source, references) {
    const text = String(source || "");
    const refs = references && typeof references === "object" ? references : null;
    if (!refs || !hasPotentialReferenceExpression(text)) {
      return text;
    }
    const escaped = text.replace(/\\\$\{/g, SCOPED_REFERENCE_ESCAPE_TOKEN);
    const replaced = escaped.replace(/\$\{\s*([^}]+?)\s*\}/g, function replaceReference(matchText, keyText) {
      const expression = String(keyText || "").trim();
      if (!expression) {
        return matchText;
      }
      const key = normalizeScopedReferenceKey(expression);
      if (refs && key && Object.prototype.hasOwnProperty.call(refs, key)) {
        const referenceValue = refs[key];
        return referenceValue == null ? "" : String(referenceValue);
      }
      return matchText;
    });
    return replaced.split(SCOPED_REFERENCE_ESCAPE_TOKEN).join("${");
  }

  function hasPotentialReferenceExpression(source) {
    return typeof source === "string" && source.indexOf("${") !== -1;
  }

  function extractQRewriteSlotPlaceholders(source) {
    const text = String(source || "");
    const slots = new Set();
    const re = /\bslot\s*\{\s*([A-Za-z_][A-Za-z0-9_-]*)\s*\}/gi;
    let match;
    while ((match = re.exec(text))) {
      const slotName = normalizeQRewriteSlotName(match[1] || "");
      if (slotName) {
        slots.add(slotName);
      }
    }
    return Array.from(slots);
  }

  function createQRewriteDefinition(name, body) {
    const definitionName = String(name || "").trim();
    const rawBody = String(body || "");
    const blocks = parseTopLevelNamedBlocks(rawBody);
    const declaredSlots = new Set();
    const removeRanges = [];
    let returnBody = null;

    for (let i = 0; i < blocks.length; i += 1) {
      const block = blocks[i];
      if (!block || typeof block !== "object") {
        continue;
      }
      if (block.nameLower === "slot") {
        const slotName = normalizeQRewriteSlotName(block.body || "");
        if (slotName) {
          declaredSlots.add(slotName);
        }
        removeRanges.push({ start: block.start, end: block.end });
        continue;
      }
      if (block.nameLower === "return") {
        returnBody = block.body;
        removeRanges.push({ start: block.start, end: block.end });
      }
    }

    const templateBody = removeRangesFromSource(rawBody, removeRanges).trim();
    if (declaredSlots.size === 0) {
      const inferred = extractQRewriteSlotPlaceholders(templateBody);
      for (let i = 0; i < inferred.length; i += 1) {
        declaredSlots.add(inferred[i]);
      }
    }

    return {
      name: definitionName,
      nameLower: definitionName.toLowerCase(),
      slots: Array.from(declaredSlots),
      templateBody: templateBody,
      returnBody: typeof returnBody === "string" ? returnBody : "",
    };
  }

  function findNextQRewriteDefinition(source, fromIndex, rewriteKeywords) {
    const input = String(source || "");
    let pos = Math.max(0, Number(fromIndex) || 0);
    const keywordSet =
      rewriteKeywords instanceof Set && rewriteKeywords.size > 0 ? rewriteKeywords : new Set(["q-rewrite"]);

    while (pos < input.length) {
      const token = findNextKeywordTokenSkippingLiterals(input, pos, keywordSet);
      if (!token) {
        return null;
      }
      pos = token.end;

      let nameStart = skipWhitespaceInSource(input, token.end);
      if (!isQRewriteIdentifierStart(input[nameStart])) {
        // q-rewrite can appear as plain text or inside other blocks (for example q-keyword replacement bodies).
        // Only treat it as a definition when a valid identifier follows.
        continue;
      }
      let nameEnd = nameStart + 1;
      while (nameEnd < input.length && isQRewriteIdentifierChar(input[nameEnd])) {
        nameEnd += 1;
      }
      const name = input.slice(nameStart, nameEnd);

      const open = skipWhitespaceInSource(input, nameEnd);
      if (input[open] !== "{") {
        // Not a definition candidate; keep scanning.
        continue;
      }

      const close = findMatchingBraceWithLiterals(input, open);
      if (close === -1) {
        throw new Error("Unterminated q-rewrite block for '" + name + "'.");
      }

      return {
        start: token.start,
        end: close + 1,
        name: name,
        nameLower: String(name || "").toLowerCase(),
        body: input.slice(open + 1, close),
      };
    }

    return null;
  }

  function resolveQRewriteInvocationSlots(definition, invocationBody) {
    const def = definition || {};
    const rawBody = String(invocationBody || "");
    const slots = Array.isArray(def.slots) ? def.slots.map(normalizeQRewriteSlotName).filter(Boolean) : [];
    const known = new Set(slots);
    const values = Object.create(null);
    const blocks = parseTopLevelNamedBlocks(rawBody);
    const consumeRanges = [];

    for (let i = 0; i < blocks.length; i += 1) {
      const block = blocks[i];
      if (!block || typeof block !== "object") {
        continue;
      }
      const blockName = normalizeQRewriteSlotName(block.name);
      if (!known.has(blockName)) {
        continue;
      }
      values[blockName] = String(block.body || "");
      consumeRanges.push({ start: block.start, end: block.end });
    }

    const remaining = removeRangesFromSource(rawBody, consumeRanges).trim();
    if (slots.length === 1 && !Object.prototype.hasOwnProperty.call(values, slots[0])) {
      values[slots[0]] = remaining;
    } else if (remaining) {
      values.default = remaining;
    } else if (!Object.prototype.hasOwnProperty.call(values, "default")) {
      values.default = "";
    }

    for (let i = 0; i < slots.length; i += 1) {
      const key = slots[i];
      if (!Object.prototype.hasOwnProperty.call(values, key)) {
        values[key] = "";
      }
    }

    return values;
  }

  function applyQRewriteSlotsToTemplate(templateBody, slotValues) {
    const template = String(templateBody || "");
    const values = slotValues || {};
    return template.replace(/\bslot\s*\{\s*([A-Za-z_][A-Za-z0-9_-]*)\s*\}/gi, function replaceSlot(fullMatch, slotName) {
      const key = normalizeQRewriteSlotName(slotName || "");
      if (Object.prototype.hasOwnProperty.call(values, key)) {
        return String(values[key] || "");
      }
      if (Object.prototype.hasOwnProperty.call(values, "default")) {
        return String(values.default || "");
      }
      return fullMatch;
    });
  }

  function createQRewriteExecutionContext(slotValues) {
    const values = slotValues || {};
    function readSlot(name) {
      const key = normalizeQRewriteSlotName(name);
      if (Object.prototype.hasOwnProperty.call(values, key)) {
        return String(values[key] || "");
      }
      if (Object.prototype.hasOwnProperty.call(values, "default")) {
        return String(values.default || "");
      }
      return "";
    }
    const qdomFacade = {
      slot: function slot(name) {
        return readSlot(name);
      },
    };
    return {
      slot: function slot(name) {
        return readSlot(name);
      },
      qdom: function qdom() {
        return qdomFacade;
      },
    };
  }

  function executeQRewriteDefinition(definition, invocationBody, options) {
    const opts = options || {};
    const slots = Array.isArray(definition && definition.slots)
      ? definition.slots.map(normalizeQRewriteSlotName).filter(Boolean)
      : [];
    const slotValues = resolveQRewriteInvocationSlots(definition, invocationBody);
    const scopedReferences = createScopedReferenceMap(slotValues, null);
    const hasReturnBody = typeof definition.returnBody === "string" && definition.returnBody.trim().length > 0;

    if (hasReturnBody) {
      const thisArg = createQRewriteExecutionContext(slotValues);
      const rewritten = evaluateQScriptBlocks(definition.returnBody, {
        maxPasses: opts.maxQScriptPasses,
        keywordAliases: opts.keywordAliases,
        executor: function runQRewriteQScript(body) {
          return executeQScriptReplacement(body, thisArg);
        },
      });
      return replaceScopedReferencesInText(rewritten, scopedReferences);
    }

    const template = String(definition.templateBody || "");
    if (!template) {
      return slots.length === 1 ? String(slotValues[slots[0]] || "") : String(invocationBody || "");
    }
    const replaced = applyQRewriteSlotsToTemplate(template, slotValues);
    return replaceScopedReferencesInText(replaced, scopedReferences);
  }

  function findNextQRewriteInvocation(source, definitions, fromIndex) {
    const input = String(source || "");
    const defs = definitions || {};
    let pos = Math.max(0, Number(fromIndex) || 0);

    while (pos < input.length) {
      const token = findNextIdentifierTokenSkippingLiterals(input, pos);
      if (!token) {
        return null;
      }
      pos = token.end;
      const nameLower = String(token.name || "").toLowerCase();
      if (!Object.prototype.hasOwnProperty.call(defs, nameLower)) {
        continue;
      }

      const open = skipWhitespaceInSource(input, token.end);
      if (input[open] !== "{") {
        continue;
      }
      const close = findMatchingBraceWithLiterals(input, open);
      if (close === -1) {
        throw new Error("Unterminated q-rewrite invocation block for '" + token.name + "'.");
      }
      return {
        start: token.start,
        end: close + 1,
        open: open,
        close: close,
        name: token.name,
        nameLower: nameLower,
      };
    }

    return null;
  }

  function collectQRewriteDefinitions(source, rewriteKeywords) {
    let working = String(source || "");
    const definitions = Object.create(null);
    let pos = 0;

    while (true) {
      const found = findNextQRewriteDefinition(working, pos, rewriteKeywords);
      if (!found) {
        break;
      }
      definitions[found.nameLower] = createQRewriteDefinition(found.name, found.body);
      working = working.slice(0, found.start) + working.slice(found.end);
      pos = found.start;
    }

    return {
      source: working,
      definitions: definitions,
    };
  }

  function applyQRewriteBlocks(source, options) {
    const opts = options || {};
    const maxPasses = Number(opts.maxPasses) > 0 ? Number(opts.maxPasses) : 200;
    const sourceAliases = opts.keywordAliases instanceof Map ? opts.keywordAliases : collectKeywordAliasesFromSource(source);
    const rewriteKeywords = collectAliasesTargeting(sourceAliases, "q-rewrite");
    const collected = collectQRewriteDefinitions(source, rewriteKeywords);
    const definitions = collected.definitions;
    let out = collected.source;

    if (!definitions || Object.keys(definitions).length === 0) {
      return {
        source: out,
        definitions: [],
      };
    }

    let pass = 0;
    while (pass < maxPasses) {
      let changed = false;
      let pos = 0;

      while (true) {
        const invocation = findNextQRewriteInvocation(out, definitions, pos);
        if (!invocation) {
          break;
        }
        const definition = definitions[invocation.nameLower];
        if (!definition) {
          pos = invocation.end;
          continue;
        }

        const body = out.slice(invocation.open + 1, invocation.close);
        const replacement = executeQRewriteDefinition(definition, body, {
          maxQScriptPasses: opts.maxQScriptPasses,
          keywordAliases: sourceAliases,
        });

        out = out.slice(0, invocation.start) + replacement + out.slice(invocation.end);
        pos = invocation.start + replacement.length;
        changed = true;
      }

      if (!changed) {
        return {
          source: out,
          definitions: Object.keys(definitions),
        };
      }
      pass += 1;
    }

    throw new Error("q-rewrite expansion exceeded max pass limit (" + maxPasses + ").");
  }

  function extractScopedReferencePlaceholders(source) {
    const text = String(source || "");
    const names = new Set();
    const re = /\$\{\s*([^}]+?)\s*\}/g;
    let match;
    while ((match = re.exec(text))) {
      const key = normalizeScopedReferenceKey(match[1] || "");
      if (!key) {
        continue;
      }
      if (!/^[a-z_][a-z0-9_.-]*$/.test(key)) {
        continue;
      }
      names.add(key);
    }
    return Array.from(names);
  }

  function createQMacroDefinition(name, body) {
    const definitionName = String(name || "").trim();
    const rawBody = String(body || "");
    const blocks = parseTopLevelNamedBlocks(rawBody);
    const declaredSlots = new Set();
    const removeRanges = [];
    let returnBody = null;

    for (let i = 0; i < blocks.length; i += 1) {
      const block = blocks[i];
      if (!block || typeof block !== "object") {
        continue;
      }
      if (block.nameLower === "slot") {
        const slotName = normalizeQRewriteSlotName(block.body || "");
        if (slotName) {
          declaredSlots.add(slotName);
        }
        removeRanges.push({ start: block.start, end: block.end });
        continue;
      }
      if (block.nameLower === "return") {
        returnBody = String(block.body || "");
        removeRanges.push({ start: block.start, end: block.end });
      }
    }

    const templateBody = removeRangesFromSource(rawBody, removeRanges).trim();
    if (declaredSlots.size === 0) {
      const inferred = extractScopedReferencePlaceholders((returnBody || "") + "\n" + templateBody);
      for (let i = 0; i < inferred.length; i += 1) {
        declaredSlots.add(inferred[i]);
      }
    }

    return {
      name: definitionName,
      nameLower: definitionName.toLowerCase(),
      slots: Array.from(declaredSlots),
      templateBody: templateBody,
      returnBody: typeof returnBody === "string" ? returnBody : "",
    };
  }

  function findNextQMacroDefinition(source, fromIndex, macroKeywords) {
    const input = String(source || "");
    let pos = Math.max(0, Number(fromIndex) || 0);
    const keywordSet =
      macroKeywords instanceof Set && macroKeywords.size > 0 ? macroKeywords : new Set(["q-macro"]);

    while (pos < input.length) {
      const token = findNextKeywordTokenSkippingLiterals(input, pos, keywordSet);
      if (!token) {
        return null;
      }
      pos = token.end;

      const nameStart = skipWhitespaceInSource(input, token.end);
      if (!isQRewriteIdentifierStart(input[nameStart])) {
        continue;
      }
      let nameEnd = nameStart + 1;
      while (nameEnd < input.length && isQRewriteIdentifierChar(input[nameEnd])) {
        nameEnd += 1;
      }
      const name = input.slice(nameStart, nameEnd);
      const open = skipWhitespaceInSource(input, nameEnd);
      if (input[open] !== "{") {
        continue;
      }
      const close = findMatchingBraceWithLiterals(input, open);
      if (close === -1) {
        throw new Error("Unterminated q-macro block for '" + name + "'.");
      }
      return {
        start: token.start,
        end: close + 1,
        name: name,
        nameLower: String(name || "").toLowerCase(),
        body: input.slice(open + 1, close),
      };
    }
    return null;
  }

  function collectQMacroDefinitions(source, macroKeywords) {
    let working = String(source || "");
    const definitions = Object.create(null);
    let pos = 0;
    while (true) {
      const found = findNextQMacroDefinition(working, pos, macroKeywords);
      if (!found) {
        break;
      }
      definitions[found.nameLower] = createQMacroDefinition(found.name, found.body);
      working = working.slice(0, found.start) + working.slice(found.end);
      pos = found.start;
    }
    return {
      source: working,
      definitions: definitions,
    };
  }

  function findNextQMacroInvocation(source, definitions, fromIndex) {
    const input = String(source || "");
    const defs = definitions || {};
    let pos = Math.max(0, Number(fromIndex) || 0);

    while (pos < input.length) {
      const token = findNextIdentifierTokenSkippingLiterals(input, pos);
      if (!token) {
        return null;
      }
      pos = token.end;
      const nameLower = String(token.name || "").toLowerCase();
      if (!Object.prototype.hasOwnProperty.call(defs, nameLower)) {
        continue;
      }
      const open = skipWhitespaceInSource(input, token.end);
      if (input[open] !== "{") {
        continue;
      }
      const close = findMatchingBraceWithLiterals(input, open);
      if (close === -1) {
        throw new Error("Unterminated q-macro invocation block for '" + token.name + "'.");
      }
      return {
        start: token.start,
        end: close + 1,
        open: open,
        close: close,
        name: token.name,
        nameLower: nameLower,
      };
    }
    return null;
  }

  function createScopedReferenceMap(slotValues, inheritedReferences) {
    const out = Object.create(null);
    const inherited = inheritedReferences && typeof inheritedReferences === "object" ? inheritedReferences : null;
    if (inherited) {
      const inheritedKeys = Object.keys(inherited);
      for (let i = 0; i < inheritedKeys.length; i += 1) {
        const key = normalizeScopedReferenceKey(inheritedKeys[i]);
        if (!key) {
          continue;
        }
        out[key] = String(inherited[inheritedKeys[i]] == null ? "" : inherited[inheritedKeys[i]]).trim();
      }
    }
    const values = slotValues && typeof slotValues === "object" ? slotValues : null;
    if (values) {
      const slotKeys = Object.keys(values);
      for (let i = 0; i < slotKeys.length; i += 1) {
        const key = normalizeScopedReferenceKey(slotKeys[i]);
        if (!key) {
          continue;
        }
        out[key] = String(values[slotKeys[i]] || "").trim();
      }
    }
    return out;
  }

  function executeQMacroDefinition(definition, invocationBody, options) {
    const opts = options || {};
    const slots = Array.isArray(definition && definition.slots)
      ? definition.slots.map(normalizeQRewriteSlotName).filter(Boolean)
      : [];
    const slotValues = resolveQRewriteInvocationSlots(definition, invocationBody);
    const scopeReferences = createScopedReferenceMap(slotValues, opts.references);
    const hasReturnBody = typeof definition.returnBody === "string" && definition.returnBody.trim().length > 0;
    const template = hasReturnBody ? String(definition.returnBody || "") : String(definition.templateBody || "");

    if (!template) {
      const fallback = slots.length === 1 ? String(slotValues[slots[0]] || "") : String(invocationBody || "");
      return replaceScopedReferencesInText(fallback, scopeReferences);
    }

    const slotted = applyQRewriteSlotsToTemplate(template, slotValues);
    return replaceScopedReferencesInText(slotted, scopeReferences);
  }

  function applyQMacroBlocks(source, options) {
    const opts = options || {};
    const maxPasses = Number(opts.maxPasses) > 0 ? Number(opts.maxPasses) : 200;
    const sourceAliases = opts.keywordAliases instanceof Map ? opts.keywordAliases : collectKeywordAliasesFromSource(source);
    const macroKeywords = collectAliasesTargeting(sourceAliases, "q-macro");
    const collected = collectQMacroDefinitions(source, macroKeywords);
    const definitions = collected.definitions;
    let out = collected.source;

    if (!definitions || Object.keys(definitions).length === 0) {
      return {
        source: out,
        definitions: [],
      };
    }

    let pass = 0;
    while (pass < maxPasses) {
      let changed = false;
      let pos = 0;

      while (true) {
        const invocation = findNextQMacroInvocation(out, definitions, pos);
        if (!invocation) {
          break;
        }
        const definition = definitions[invocation.nameLower];
        if (!definition) {
          pos = invocation.end;
          continue;
        }
        const body = out.slice(invocation.open + 1, invocation.close);
        const replacement = executeQMacroDefinition(definition, body, {
          references: opts.references,
        });
        out = out.slice(0, invocation.start) + replacement + out.slice(invocation.end);
        pos = invocation.start + replacement.length;
        changed = true;
      }

      if (!changed) {
        return {
          source: out,
          definitions: Object.keys(definitions),
        };
      }
      pass += 1;
    }

    throw new Error("q-macro expansion exceeded max pass limit (" + maxPasses + ").");
  }

  function executeQScriptReplacement(scriptBody, thisArg) {
    const fn = new Function(String(scriptBody || ""));
    const out = fn.call(thisArg || {});
    if (out == null) {
      return "";
    }
    return String(out);
  }

  function isAssignmentQScriptContext(source, qScriptStart) {
    const input = String(source || "");
    let cursor = Number(qScriptStart) - 1;
    while (cursor >= 0 && /\s/.test(input[cursor])) {
      cursor -= 1;
    }
    if (cursor < 0) {
      return false;
    }
    return input[cursor] === ":";
  }

  function isQKeywordAliasDeclarationContext(source, tokenStart) {
    const input = String(source || "");
    let cursor = Math.max(0, Number(tokenStart) || 0) - 1;
    while (cursor >= 0 && /\s/.test(input[cursor])) {
      cursor -= 1;
    }
    if (cursor < 0) {
      return false;
    }
    const end = cursor + 1;
    while (cursor >= 0 && /[A-Za-z0-9_-]/.test(input[cursor])) {
      cursor -= 1;
    }
    const prevToken = input.slice(cursor + 1, end).toLowerCase();
    return prevToken === "q-keyword";
  }

  function evaluateQScriptBlocks(source, options) {
    let out = String(source || "");
    const opts = options || {};
    const maxPasses = Number(opts.maxPasses) > 0 ? Number(opts.maxPasses) : 200;
    const scriptKeywords = collectAliasesTargeting(opts.keywordAliases, "q-script");
    const shouldEvaluate = typeof opts.shouldEvaluate === "function" ? opts.shouldEvaluate : null;
    const executor =
      typeof opts.executor === "function"
        ? opts.executor
        : function defaultExecutor(scriptBody) {
            return executeQScriptReplacement(scriptBody, {});
          };
    let pass = 0;

    while (pass < maxPasses) {
      let changed = false;
      let pos = 0;

      while (true) {
        const token = findNextKeywordTokenSkippingLiterals(out, pos, scriptKeywords);
        if (!token) {
          break;
        }
        const start = token.start;

        let open = token.end;
        while (open < out.length && /\s/.test(out[open])) {
          open += 1;
        }
        if (out[open] !== "{") {
          pos = token.end;
          continue;
        }
        if (isQKeywordAliasDeclarationContext(out, start)) {
          pos = token.end;
          continue;
        }

        const close = findMatchingBraceWithLiterals(out, open);
        if (close === -1) {
          throw new Error("Unterminated q-script block.");
        }

        const body = out.slice(open + 1, close);
        const context = {
          source: out,
          start: start,
          open: open,
          close: close,
          body: body,
        };
        if (shouldEvaluate && shouldEvaluate(context) === false) {
          pos = token.end;
          continue;
        }
        let replacement = executor(body, context);
        const prevChar = start > 0 ? out[start - 1] : "";
        if (prevChar === "." && replacement.startsWith(".")) {
          replacement = replacement.slice(1);
        }

        out = out.slice(0, start) + replacement + out.slice(close + 1);
        pos = start + replacement.length;
        changed = true;
      }

      if (!changed) {
        return out;
      }
      pass += 1;
    }

    throw new Error("q-script evaluation exceeded max pass limit (" + maxPasses + ").");
  }

  function looksLikeQHtmlSnippet(value) {
    const text = String(value == null ? "" : value).trim();
    if (!text) {
      return false;
    }
    if (/<[A-Za-z!/]/.test(text)) {
      return false;
    }
    return /[A-Za-z0-9_.#-]+\s*\{/.test(text);
  }

  function parseAssignmentName(name) {
    const rawName = String(name || "").trim();
    const match = rawName.match(/^(attr|prop)\.([A-Za-z_][A-Za-z0-9_.#-]*)$/i);
    if (!match) {
      return {
        name: rawName,
        hint: "auto",
      };
    }
    return {
      name: String(match[2] || "").trim(),
      hint: String(match[1] || "").trim().toLowerCase() || "auto",
    };
  }

  function isBindingExpressionValue(value) {
    if (!value || typeof value !== "object") {
      return false;
    }
    return value.type === "QBindExpression" || value.type === "QScriptExpression";
  }

  function normalizeBindingExpressionKind(expressionType) {
    return String(expressionType || "").trim().toLowerCase() === "qscriptexpression" ? "q-script" : "q-bind";
  }

  function ensureNodeBindingList(node) {
    if (!node || typeof node !== "object") {
      return [];
    }
    if (!node.meta || typeof node.meta !== "object") {
      node.meta = {};
    }
    if (!Array.isArray(node.meta.qBindings)) {
      node.meta.qBindings = [];
    }
    return node.meta.qBindings;
  }

  function registerNodeBinding(node, bindingSpec) {
    if (!bindingSpec || typeof bindingSpec !== "object") {
      return;
    }
    const key = String(bindingSpec.name || "").trim();
    if (!key) {
      return;
    }
    const entries = ensureNodeBindingList(node);
    const targetCollection =
      String(bindingSpec.targetCollection || "").trim().toLowerCase() === "props"
        ? "props"
        : String(bindingSpec.targetCollection || "").trim().toLowerCase() === "textcontent"
          ? "textContent"
          : "attributes";
    const normalizedKind = normalizeBindingExpressionKind(bindingSpec.expressionType);
    for (let i = 0; i < entries.length; i += 1) {
      const entry = entries[i];
      if (!entry || typeof entry !== "object") {
        continue;
      }
      if (String(entry.name || "").trim().toLowerCase() !== key.toLowerCase()) {
        continue;
      }
      if (String(entry.targetCollection || "attributes").toLowerCase() !== targetCollection.toLowerCase()) {
        continue;
      }
      entries[i] = Object.assign({}, entry, bindingSpec, {
        name: key,
        targetCollection: targetCollection,
        expressionType: normalizedKind,
      });
      return;
    }
    entries.push(
      Object.assign({}, bindingSpec, {
        name: key,
        targetCollection: targetCollection,
        expressionType: normalizedKind,
      })
    );
  }

  function coercePropertyValue(value) {
    if (isBindingExpressionValue(value)) {
      if (String(value.type || "").trim().toLowerCase() === "qscriptexpression") {
        const resolved = tryResolveStaticQScript(value.script || "");
        if (resolved !== null) {
          return resolved;
        }
      }
      return String(value.raw || "");
    }
    return value;
  }

  function applyPropertyToElement(elementNode, prop) {
    const assignment = parseAssignmentName(prop.name);
    const key = normalizePropertyName(assignment.name);
    const value = coercePropertyValue(prop.value);
    if (isBindingExpressionValue(prop.value)) {
      registerNodeBinding(elementNode, {
        name: assignment.name,
        targetHint: assignment.hint,
        targetCollection: core.TEXT_ALIASES.has(key) ? "textContent" : "attributes",
        expressionType: prop.value.type,
        script: String(prop.value.script || ""),
      });
      if (core.TEXT_ALIASES.has(key)) {
        if (typeof elementNode.textContent !== "string") {
          elementNode.textContent = "";
        }
      } else {
        elementNode.attributes[assignment.name] = "";
      }
      return;
    }
    if (core.TEXT_ALIASES.has(key)) {
      appendTextChildNode(elementNode, value, {
        originalSource: prop.raw || null,
        sourceRange:
          typeof prop.start === "number" && typeof prop.end === "number"
            ? [prop.start, prop.end]
            : null,
      });
      return;
    }
    elementNode.attributes[assignment.name] = value;
  }

  function createElementFromToken(tokenInfo, selectorMode, selectorChain, range, originalSource) {
    const node = core.createElementNode({
      tagName: tokenInfo.tag || "div",
      selectorMode: selectorMode,
      selectorChain: selectorChain,
      meta: {
        originalSource: originalSource || null,
        sourceRange: range || null,
      },
    });

    if (tokenInfo.id) {
      node.attributes.id = tokenInfo.id;
    }
    if (tokenInfo.classes.length > 0) {
      node.attributes.class = core.mergeClasses(node.attributes.class, tokenInfo.classes);
    }

    return node;
  }

  function collectSlotNamesFromNodes(nodes, intoSet) {
    const set = intoSet || new Set();
    const list = Array.isArray(nodes) ? nodes : [];

    function readNodeSlots(node) {
      if (!node || typeof node !== "object") {
        return [];
      }
      if (Array.isArray(node.slots)) {
        return node.slots;
      }
      if (Array.isArray(node.__qhtmlSlotNodes)) {
        return node.__qhtmlSlotNodes;
      }
      return [];
    }

    for (let i = 0; i < list.length; i += 1) {
      const node = list[i];
      if (!node || typeof node !== "object") {
        continue;
      }

      if (node.kind === core.NODE_TYPES.element && String(node.tagName || "").toLowerCase() === "slot") {
        const slotName =
          node.attributes && typeof node.attributes.name === "string" && node.attributes.name.trim()
            ? String(node.attributes.name).trim()
            : "default";
        set.add(slotName);
      }

      if (core.NODE_TYPES.slot && node.kind === core.NODE_TYPES.slot) {
        const slotName = typeof node.name === "string" && node.name.trim() ? String(node.name).trim() : "default";
        set.add(slotName);
      }

      if (Array.isArray(node.children) && node.children.length > 0) {
        collectSlotNamesFromNodes(node.children, set);
      }
      if (Array.isArray(node.templateNodes) && node.templateNodes.length > 0) {
        collectSlotNamesFromNodes(node.templateNodes, set);
      }
      const slotNodes = readNodeSlots(node);
      if (slotNodes.length > 0) {
        collectSlotNamesFromNodes(slotNodes, set);
      }
    }

    return set;
  }

  function resolveSingleSlotNameForDefinition(definitionNode) {
    if (!definitionNode || !Array.isArray(definitionNode.templateNodes)) {
      return "";
    }
    const slotNames = Array.from(collectSlotNamesFromNodes(definitionNode.templateNodes));
    return slotNames.length === 1 ? slotNames[0] : "";
  }

  function escapeHtmlText(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function createTextSlotNode(text, sourceMeta) {
    const value = String(text || "");
    if (!value) {
      return null;
    }
    if (typeof core.createTextNode === "function" && core.NODE_TYPES && core.NODE_TYPES.text) {
      return core.createTextNode({
        value: value,
        meta: Object.assign({ generated: true }, sourceMeta || {}),
      });
    }
    return core.createRawHtmlNode({
      html: escapeHtmlText(value),
      meta: Object.assign({ generated: true }, sourceMeta || {}),
    });
  }

  function splitInvocationSlotFills(elementNode, definitionNode) {
    const fills = new Map();
    const singleSlotName = resolveSingleSlotNameForDefinition(definitionNode);

    function pushFill(slotName, value) {
      if (!value) {
        return;
      }
      const key = String(slotName || "default").trim() || "default";
      const bucket = fills.get(key) || [];
      bucket.push(value);
      fills.set(key, bucket);
    }

    if (typeof elementNode.textContent === "string" && elementNode.textContent.length > 0) {
      const textNode = createTextSlotNode(elementNode.textContent, {
        originalSource: elementNode.meta && elementNode.meta.originalSource ? elementNode.meta.originalSource : null,
      });
      if (textNode) {
        pushFill(singleSlotName || "default", textNode);
      }
    }

    const children = Array.isArray(elementNode.children) ? elementNode.children : [];
    for (let i = 0; i < children.length; i += 1) {
      const child = children[i];
      if (!child || typeof child !== "object") {
        continue;
      }

      if (child.kind === core.NODE_TYPES.element) {
        const explicitSlot =
          child.attributes && typeof child.attributes.slot === "string" ? String(child.attributes.slot).trim() : "";
        if (explicitSlot) {
          pushFill(explicitSlot, child);
          continue;
        }

        if (singleSlotName) {
          pushFill(singleSlotName, child);
          continue;
        }

        const shorthandSlot = String(child.tagName || "").trim();
        if (shorthandSlot) {
          if (Array.isArray(child.children) && child.children.length > 0) {
            for (let j = 0; j < child.children.length; j += 1) {
              pushFill(shorthandSlot, child.children[j]);
            }
          } else if (typeof child.textContent === "string" && child.textContent.length > 0) {
            const textNode = createTextSlotNode(child.textContent, {
              originalSource: child.meta && child.meta.originalSource ? child.meta.originalSource : null,
            });
            if (textNode) {
              pushFill(shorthandSlot, textNode);
            }
          } else {
            pushFill(shorthandSlot, child);
          }
          continue;
        }
      }

      pushFill(singleSlotName || "default", child);
    }

    return fills;
  }

  function convertElementInvocationToInstance(elementNode, definitionNode) {
    const explicitType = String(definitionNode && definitionNode.definitionType ? definitionNode.definitionType : "component")
      .trim()
      .toLowerCase();
    const definitionType = explicitType === "template" ? "template" : explicitType === "signal" ? "signal" : "component";
    const slotFills = splitInvocationSlotFills(elementNode, definitionNode);
    const declaredProperties = new Set(
      (Array.isArray(definitionNode && definitionNode.properties) ? definitionNode.properties : [])
        .map(normalizePropertyName)
        .filter(Boolean)
    );
    const invocationAttributes = Object.assign({}, elementNode.attributes || {});
    const mappedAttributes = {};
    const mappedProps = {};
    const attributeKeys = Object.keys(invocationAttributes);
    for (let i = 0; i < attributeKeys.length; i += 1) {
      const rawKey = String(attributeKeys[i] || "");
      if (!rawKey) {
        continue;
      }
      const assignment = parseAssignmentName(rawKey);
      const targetName = String(assignment.name || "").trim();
      if (!targetName) {
        continue;
      }
      const normalized = normalizePropertyName(targetName);
      const shouldUseProp =
        assignment.hint === "prop" || (assignment.hint !== "attr" && declaredProperties.has(normalized));
      if (shouldUseProp) {
        mappedProps[targetName] = invocationAttributes[rawKey];
      } else {
        mappedAttributes[targetName] = invocationAttributes[rawKey];
      }
    }

    const sourceBindings =
      elementNode && elementNode.meta && Array.isArray(elementNode.meta.qBindings) ? elementNode.meta.qBindings : [];
    const mappedBindings = [];
    for (let i = 0; i < sourceBindings.length; i += 1) {
      const candidate = sourceBindings[i];
      if (!candidate || typeof candidate !== "object") {
        continue;
      }
      const assignment = parseAssignmentName(candidate.name);
      const targetName = String(assignment.name || "").trim();
      if (!targetName) {
        continue;
      }
      const targetHint =
        String(candidate.targetHint || "").trim().toLowerCase() || String(assignment.hint || "").trim().toLowerCase() || "auto";
      let targetCollection =
        String(candidate.targetCollection || "").trim().toLowerCase() === "props"
          ? "props"
          : String(candidate.targetCollection || "").trim().toLowerCase() === "textcontent"
            ? "textContent"
            : "attributes";
      if (targetCollection === "attributes" || targetCollection === "props") {
        const normalized = normalizePropertyName(targetName);
        const shouldUseProp =
          targetHint === "prop" || (targetHint !== "attr" && declaredProperties.has(normalized));
        targetCollection = shouldUseProp ? "props" : "attributes";
      }
      mappedBindings.push(
        Object.assign({}, candidate, {
          name: targetName,
          targetHint: targetHint,
          targetCollection: targetCollection,
        })
      );
    }

    const instanceMeta = Object.assign({}, elementNode.meta || {});
    if (mappedBindings.length > 0) {
      instanceMeta.qBindings = mappedBindings;
    } else if (Object.prototype.hasOwnProperty.call(instanceMeta, "qBindings")) {
      delete instanceMeta.qBindings;
    }

    const slots = [];
    slotFills.forEach(function eachSlot(children, slotName) {
      slots.push(
        core.createSlotNode({
          name: slotName,
          children: Array.isArray(children) ? children : [],
          meta: {
            generated: true,
            originalSource: elementNode.meta && elementNode.meta.originalSource ? elementNode.meta.originalSource : null,
          },
        })
      );
    });

    return core.createComponentInstanceNode({
      kind: definitionType === "template" ? core.NODE_TYPES.templateInstance : core.NODE_TYPES.componentInstance,
      componentId: String(definitionNode.componentId || elementNode.tagName || "").trim().toLowerCase(),
      tagName: String(elementNode.tagName || definitionNode.componentId || "div").trim().toLowerCase(),
      attributes: mappedAttributes,
      props: mappedProps,
      slots: slots,
      lifecycleScripts: Array.isArray(elementNode.lifecycleScripts) ? elementNode.lifecycleScripts.slice() : [],
      children: Array.isArray(elementNode.children) ? elementNode.children : [],
      textContent: typeof elementNode.textContent === "string" ? elementNode.textContent : null,
      selectorMode: elementNode.selectorMode || "single",
      selectorChain: Array.isArray(elementNode.selectorChain)
        ? elementNode.selectorChain.slice()
        : [String(elementNode.tagName || definitionNode.componentId || "div").trim().toLowerCase()],
      meta: instanceMeta,
    });
  }

  function buildDefinitionRegistry(nodes) {
    const registry = new Map();
    const list = Array.isArray(nodes) ? nodes : [];

    for (let i = 0; i < list.length; i += 1) {
      const node = list[i];
      if (!node || typeof node !== "object") {
        continue;
      }
      if (node.kind === core.NODE_TYPES.component) {
        const key = String(node.componentId || "").trim().toLowerCase();
        if (key) {
          registry.set(key, node);
        }
      }
    }

    return registry;
  }

  function normalizeNodeForDefinitions(node, definitionRegistry) {
    if (!node || typeof node !== "object") {
      return node;
    }

    if (node.kind === core.NODE_TYPES.component) {
      if (Array.isArray(node.templateNodes)) {
        node.templateNodes = normalizeNodesForDefinitions(node.templateNodes, definitionRegistry);
      }
      return node;
    }

    if (
      (node.kind === core.NODE_TYPES.componentInstance || node.kind === core.NODE_TYPES.templateInstance) &&
      (Array.isArray(node.slots) || Array.isArray(node.__qhtmlSlotNodes))
    ) {
      const slotNodes = Array.isArray(node.slots)
        ? node.slots
        : Array.isArray(node.__qhtmlSlotNodes)
          ? node.__qhtmlSlotNodes
          : [];
      for (let i = 0; i < slotNodes.length; i += 1) {
        const slotNode = slotNodes[i];
        if (slotNode && slotNode.kind === core.NODE_TYPES.slot && Array.isArray(slotNode.children)) {
          slotNode.children = normalizeNodesForDefinitions(slotNode.children, definitionRegistry);
        }
      }
      if (Array.isArray(node.children)) {
        node.children = normalizeNodesForDefinitions(node.children, definitionRegistry);
      }
      return node;
    }

    if (node.kind === core.NODE_TYPES.slot && Array.isArray(node.children)) {
      node.children = normalizeNodesForDefinitions(node.children, definitionRegistry);
      return node;
    }

    if (node.kind === core.NODE_TYPES.element) {
      if (Array.isArray(node.children)) {
        node.children = normalizeNodesForDefinitions(node.children, definitionRegistry);
      }
      const tag = String(node.tagName || "").trim().toLowerCase();
      if (tag && tag !== "slot" && definitionRegistry.has(tag)) {
        return convertElementInvocationToInstance(node, definitionRegistry.get(tag));
      }
      return node;
    }

    return node;
  }

  function normalizeNodesForDefinitions(nodes, definitionRegistry) {
    const out = [];
    const list = Array.isArray(nodes) ? nodes : [];
    for (let i = 0; i < list.length; i += 1) {
      const normalized = normalizeNodeForDefinitions(list[i], definitionRegistry);
      if (normalized) {
        out.push(normalized);
      }
    }
    return out;
  }

  function extractQColorTextFromAstItems(items) {
    const list = Array.isArray(items) ? items : [];
    const chunks = [];
    for (let i = 0; i < list.length; i += 1) {
      const item = list[i];
      if (!item || typeof item !== "object") {
        continue;
      }
      if (item.type === "TextBlock" || item.type === "RawTextLine") {
        chunks.push(String(item.text || "").trim());
        continue;
      }
      if (item.type === "BareWord") {
        chunks.push(String(item.word || item.name || "").trim());
      }
    }
    return chunks.join(" ").trim();
  }

  function parseQColorSchemaEntriesFromAstItems(items) {
    const out = {};
    const list = Array.isArray(items) ? items : [];
    for (let i = 0; i < list.length; i += 1) {
      const item = list[i];
      if (!item || typeof item !== "object" || item.type !== "Element") {
        continue;
      }
      const selectors = Array.isArray(item.selectors) ? item.selectors : [];
      if (selectors.length !== 1) {
        continue;
      }
      const areaName = String(selectors[0] || "").trim();
      if (!areaName) {
        continue;
      }
      const propertyText = extractQColorTextFromAstItems(item.items);
      out[areaName] = propertyText || inferQColorCssProperty(areaName);
    }
    return out;
  }

  function parseQColorThemeAssignmentsFromAstItems(items) {
    const out = {};
    const list = Array.isArray(items) ? items : [];
    for (let i = 0; i < list.length; i += 1) {
      const item = list[i];
      if (!item || typeof item !== "object") {
        continue;
      }
      if (item.type !== "Property") {
        if (item.type === "Element") {
          const selectors = Array.isArray(item.selectors) ? item.selectors : [];
          if (selectors.length !== 1) {
            continue;
          }
          const key = String(selectors[0] || "").trim();
          if (!key) {
            continue;
          }
          const value = extractQColorTextFromAstItems(item.items);
          if (!value) {
            continue;
          }
          out[key] = value;
        }
        continue;
      }
      const key = String(item.name || "").trim();
      if (!key) {
        continue;
      }
      const valueText =
        typeof item.value === "string"
          ? item.value
          : item.value && typeof item.value === "object"
            ? typeof item.value.value === "string"
              ? item.value.value
              : typeof item.value.raw === "string"
                ? item.value.raw
                : ""
            : "";
      const value = String(valueText || "").trim();
      if (!value) {
        continue;
      }
      out[key] = value;
    }
    return out;
  }

  function registerQStyleDefinitionItem(styleContext, item) {
    if (!styleContext || !item || typeof item !== "object") {
      return;
    }
    const styleName = String(item.name || "").trim();
    if (!styleName) {
      throw new Error("q-style requires a name.");
    }
    registerQStyleDefinition(styleContext, styleName, item.declarations, item.classes);
  }

  function registerQThemeDefinitionItem(styleContext, item) {
    if (!styleContext || !item || typeof item !== "object") {
      return;
    }
    const themeName = String(item.name || "").trim();
    if (!themeName) {
      throw new Error("q-theme requires a name.");
    }
    const rawRules = Array.isArray(item.rules) ? item.rules : [];
    const normalizedRules = [];
    for (let i = 0; i < rawRules.length; i += 1) {
      const rule = rawRules[i];
      if (!rule || typeof rule !== "object") {
        continue;
      }
      const selector = String(rule.selector || "").trim();
      const styles = Array.isArray(rule.styles)
        ? rule.styles.map(function normalizeStyleName(entry) { return String(entry || "").trim(); }).filter(Boolean)
        : [];
      if (!selector) {
        continue;
      }
      if (styles.length === 0 && /^[A-Za-z_][A-Za-z0-9_-]*$/.test(selector)) {
        normalizedRules.push({
          includeTheme: selector,
        });
        continue;
      }
      normalizedRules.push({
        selector: selector,
        styles: styles,
      });
    }
    registerQThemeDefinition(styleContext, themeName, normalizedRules, {
      isDefault: !!item.defaultTheme,
    });
  }

  function resolveNamedQThemeInvocation(item, styleContext) {
    if (!item || typeof item !== "object" || item.type !== "Element") {
      return null;
    }
    const selectors = Array.isArray(item.selectors) ? item.selectors : [];
    if (selectors.length !== 1) {
      return null;
    }
    const invocationName = String(selectors[0] || "").trim();
    if (!invocationName) {
      return null;
    }
    return lookupQThemeDefinition(styleContext, invocationName);
  }

  function expandQThemeRules(styleContext, themeDefinition, visited) {
    const out = [];
    const theme = themeDefinition && typeof themeDefinition === "object" ? themeDefinition : null;
    if (!theme) {
      return out;
    }
    const rules = Array.isArray(theme.rules) ? theme.rules : [];
    const seen = visited instanceof Set ? visited : new Set();
    for (let i = 0; i < rules.length; i += 1) {
      const rule = rules[i];
      if (!rule || typeof rule !== "object") {
        continue;
      }
      const includeName = String(rule.includeTheme || "").trim();
      if (includeName) {
        const includeKey = normalizeColorLookupKey(includeName);
        if (!includeKey || seen.has(includeKey)) {
          continue;
        }
        seen.add(includeKey);
        const includeTheme = lookupQThemeDefinition(styleContext, includeName);
        if (includeTheme) {
          const expanded = expandQThemeRules(styleContext, includeTheme, seen);
          for (let j = 0; j < expanded.length; j += 1) {
            out.push(expanded[j]);
          }
        }
        seen.delete(includeKey);
        continue;
      }
      const selector = String(rule.selector || "").trim();
      const styles = Array.isArray(rule.styles)
        ? rule.styles.map(function cloneStyleName(entry) { return String(entry || "").trim(); }).filter(Boolean)
        : [];
      if (!selector || styles.length === 0) {
        continue;
      }
      out.push({
        selector: selector,
        styles: styles,
      });
    }
    return out;
  }

  function tryApplyNamedQThemeInvocation(item, styleContext) {
    if (!item || typeof item !== "object" || item.type !== "Element") {
      return false;
    }
    if (!styleContext || !(styleContext.themes instanceof Map)) {
      return false;
    }
    const selectors = Array.isArray(item.selectors) ? item.selectors : [];
    if (selectors.length !== 1) {
      return false;
    }
    const invocationName = String(selectors[0] || "").trim();
    if (!invocationName) {
      return false;
    }
    const definition = lookupQThemeDefinition(styleContext, invocationName);
    if (!definition) {
      return false;
    }
    const childItems = Array.isArray(item.items) ? item.items : [];
    if (childItems.length > 0) {
      return false;
    }
    appendActiveQTheme(styleContext, definition);
    return true;
  }

  function resolveNamedQColorSetupInvocation(item, colorContext) {
    if (!item || typeof item !== "object" || item.type !== "Element") {
      return null;
    }
    if (!colorContext || typeof colorContext !== "object") {
      return null;
    }
    const selectors = Array.isArray(item.selectors) ? item.selectors : [];
    if (selectors.length !== 1) {
      return null;
    }
    const invocationName = String(selectors[0] || "").trim();
    if (!invocationName) {
      return null;
    }
    return lookupQColorDefinition(colorContext, invocationName);
  }

  function tryApplyNamedQColorInvocation(item, colorContext) {
    if (!item || typeof item !== "object" || item.type !== "Element") {
      return false;
    }
    if (!colorContext || typeof colorContext !== "object") {
      return false;
    }
    const selectors = Array.isArray(item.selectors) ? item.selectors : [];
    if (selectors.length !== 1) {
      return false;
    }
    const invocationName = String(selectors[0] || "").trim();
    const invocationKey = normalizeColorLookupKey(invocationName);
    if (!invocationKey) {
      return false;
    }

    if (colorContext.schemaDefs instanceof Map && colorContext.schemaDefs.has(invocationKey)) {
      const schemaDef = colorContext.schemaDefs.get(invocationKey) || {};
      const merged = Object.assign({}, cloneQColorAssignments(schemaDef.entries), parseQColorSchemaEntriesFromAstItems(item.items));
      const keys = Object.keys(merged);
      for (let i = 0; i < keys.length; i += 1) {
        const areaName = keys[i];
        registerQColorSchema(colorContext, areaName, merged[areaName]);
      }
      return true;
    }

    if (colorContext.themes instanceof Map && colorContext.themes.has(invocationKey)) {
      const themeDef = colorContext.themes.get(invocationKey) || {};
      const merged = Object.assign({}, cloneQColorAssignments(themeDef.assignments), parseQColorThemeAssignmentsFromAstItems(item.items));
      registerQColorTheme(colorContext, DEFAULT_QCOLOR_THEME_NAME, merged, { setAsDefault: true });
      return true;
    }

    if (colorContext.colorDefs instanceof Map && colorContext.colorDefs.has(invocationKey)) {
      const setup = lookupQColorDefinition(colorContext, invocationName);
      if (!setup) {
        return false;
      }
      const childItems = Array.isArray(item.items) ? item.items : [];
      if (childItems.length > 0) {
        return false;
      }
      appendActiveQColorSetup(colorContext, setup);
      return true;
    }

    return false;
  }

  function processElementItems(targetElement, astItems, source, context) {
    const colorContext =
      context && context.qColors && typeof context.qColors === "object"
        ? context.qColors
        : createQColorContext();
    const styleContext =
      context && context.qStyles && typeof context.qStyles === "object"
        ? context.qStyles
        : createQStyleContext();
    const childScopedStyles =
      context && Array.isArray(context.qStyleChildScope)
        ? context.qStyleChildScope
        : [];
    applyActiveQColorSetupsToElementNode(targetElement, colorContext);

    function appendChildNode(childNode) {
      if (!childNode) {
        return;
      }
      if (childNode.kind === core.NODE_TYPES.element && childScopedStyles.length > 0) {
        for (let i = 0; i < childScopedStyles.length; i += 1) {
          applyQStyleToElementNode(childNode, childScopedStyles[i]);
        }
      }
      targetElement.children.push(childNode);
    }

    function tryAssignSlotNameFromText(textValue) {
      if (!targetElement || String(targetElement.tagName || "").toLowerCase() !== "slot") {
        return false;
      }
      if (targetElement.attributes && targetElement.attributes.name) {
        return false;
      }
      const candidate = String(textValue || "").trim();
      if (!candidate) {
        return false;
      }
      if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(candidate)) {
        return false;
      }
      if (!targetElement.attributes || typeof targetElement.attributes !== "object") {
        targetElement.attributes = {};
      }
      targetElement.attributes.name = candidate;
      return true;
    }

    for (let i = 0; i < astItems.length; i += 1) {
      const item = astItems[i];
      const namedTheme = resolveNamedQThemeInvocation(item, styleContext);
      if (namedTheme && Array.isArray(item.items) && item.items.length > 0) {
        const invocationContext = createScopedConversionContext({ qColors: colorContext, qStyles: styleContext });
        appendActiveQTheme(invocationContext.qStyles, namedTheme);
        const scopeNode = core.createElementNode({
          tagName: "q-theme-scope",
          selectorMode: "single",
          selectorChain: ["q-theme-scope"],
          attributes: {},
          children: [],
          meta: {
            generated: true,
            virtual: true,
          },
        });
        processElementItems(scopeNode, item.items, source, invocationContext);
        const scopedChildren = Array.isArray(scopeNode.children) ? scopeNode.children : [];
        for (let ci = 0; ci < scopedChildren.length; ci += 1) {
          appendChildNode(scopedChildren[ci]);
        }
        continue;
      }
      if (tryApplyNamedQThemeInvocation(item, styleContext)) {
        continue;
      }
      const namedColorSetup = resolveNamedQColorSetupInvocation(item, colorContext);
      if (namedColorSetup && Array.isArray(item.items) && item.items.length > 0) {
        const invocationContext = createScopedConversionContext({ qColors: colorContext, qStyles: styleContext });
        appendActiveQColorSetup(invocationContext.qColors, namedColorSetup);
        const scopeNode = core.createElementNode({
          tagName: "q-color-scope",
          selectorMode: "single",
          selectorChain: ["q-color-scope"],
          attributes: {},
          children: [],
          meta: {
            generated: true,
            virtual: true,
          },
        });
        processElementItems(scopeNode, item.items, source, invocationContext);
        const scopedChildren = Array.isArray(scopeNode.children) ? scopeNode.children : [];
        for (let ci = 0; ci < scopedChildren.length; ci += 1) {
          appendChildNode(scopedChildren[ci]);
        }
        continue;
      }
      if (tryApplyNamedQColorInvocation(item, colorContext)) {
        continue;
      }
      if (item.type === "QColorSchemaDefinition") {
        registerQColorSchemaItem(colorContext, item);
        continue;
      }
      if (item.type === "QStyleDefinition") {
        registerQStyleDefinitionItem(styleContext, item);
        continue;
      }
      if (item.type === "QThemeDefinition") {
        registerQThemeDefinitionItem(styleContext, item);
        continue;
      }
      if (item.type === "QColorDefinition") {
        registerQColorDefinitionItem(colorContext, item);
        continue;
      }
      if (item.type === "QColorThemeDefinition") {
        registerQColorThemeItem(colorContext, item);
        continue;
      }
      if (item.type === "QWasmBlock") {
        throw new Error("q-wasm is only valid inside q-component definitions.");
      }
      if (item.type === "Property") {
        applyPropertyToElement(targetElement, item);
      } else if (item.type === "HtmlBlock") {
        targetElement.children.push(core.createRawHtmlNode({ html: item.html, meta: { originalSource: item.raw } }));
      } else if (item.type === "TextBlock") {
        if (tryAssignSlotNameFromText(item.text)) {
          continue;
        }
        appendTextChildNode(targetElement, item.text, {
          originalSource: item.raw || null,
          sourceRange:
            typeof item.start === "number" && typeof item.end === "number"
              ? [item.start, item.end]
              : null,
        });
      } else if (item.type === "StyleBlock") {
        if (
          targetElement.meta &&
          Array.isArray(targetElement.meta.qColorAssignments) &&
          targetElement.meta.qColorAssignments.length > 0
        ) {
          const existingBase = String(targetElement.meta.qColorBaseStyle || "").trim();
          const incomingBase = String(item.css || "").trim();
          targetElement.meta.qColorBaseStyle = composeStyleFromBaseAndDeclarations(existingBase, [incomingBase]);
          applyQColorAssignmentsToElementNode(targetElement, colorContext);
        } else {
          mergeStyleAttribute(targetElement, item.css);
        }
      } else if (item.type === "QColorApplyBlock") {
        if (!targetElement.meta || typeof targetElement.meta !== "object") {
          targetElement.meta = {};
        }
        if (!Array.isArray(targetElement.meta.qColorAssignments)) {
          targetElement.meta.qColorAssignments = [];
        }
        if (!Array.isArray(targetElement.meta.qColorAreas)) {
          targetElement.meta.qColorAreas = [];
        }
        if (typeof targetElement.meta.qColorBaseStyle !== "string") {
          targetElement.meta.qColorBaseStyle = String(targetElement.attributes && targetElement.attributes.style || "").trim();
        }
        targetElement.meta.qColorAssignments.push(cloneQColorAssignments(item.assignments));
        if (Array.isArray(item.areas)) {
          targetElement.meta.qColorAreas.push(item.areas.slice());
        }
        applyQColorAssignmentsToElementNode(targetElement, colorContext);
      } else if (item.type === "RawTextLine") {
        if (tryAssignSlotNameFromText(item.text)) {
          continue;
        }
        appendTextChildNode(targetElement, item.text, {
          originalSource: item.raw || null,
          sourceRange:
            typeof item.start === "number" && typeof item.end === "number"
              ? [item.start, item.end]
              : null,
        });
      } else if (item.type === "BareWord") {
        if (targetElement.tagName === "slot" && !targetElement.attributes.name) {
          targetElement.attributes.name = item.name;
        } else {
          appendTextChildNode(targetElement, item.name, {
            originalSource: item.raw || null,
            sourceRange:
              typeof item.start === "number" && typeof item.end === "number"
                ? [item.start, item.end]
                : null,
          });
        }
      } else if (item.type === "EventBlock") {
        const key = String(item.name || "");
        const script = compactScriptBody(item.script || "");
        if (item.isLifecycle) {
          if (!Array.isArray(targetElement.lifecycleScripts)) {
            targetElement.lifecycleScripts = [];
          }
          targetElement.lifecycleScripts.push({
            name: key,
            body: script,
          });
        } else {
          targetElement.attributes[key] = script;
        }
      } else if (item.type === "QScriptInline") {
        const resolved = tryResolveStaticQScript(item.script || "");
        if (resolved === null) {
          if (!Array.isArray(targetElement.inlineQScripts)) {
            targetElement.inlineQScripts = [];
          }
          targetElement.inlineQScripts.push({
            script: item.script,
            raw: item.raw,
          });
          continue;
        }

        if (looksLikeQHtmlSnippet(resolved)) {
          const nestedAst = parseQHtmlToAst(resolved);
          for (let j = 0; j < nestedAst.body.length; j += 1) {
            const nested = convertAstItemToNode(
              nestedAst.body[j],
              resolved,
              createScopedConversionContext({ qColors: colorContext, qStyles: styleContext })
            );
            if (nested) {
              appendChildNode(nested);
            }
          }
        } else {
          appendTextChildNode(targetElement, resolved, {
            originalSource: item.raw || null,
            sourceRange:
              typeof item.start === "number" && typeof item.end === "number"
                ? [item.start, item.end]
                : null,
          });
        }
      } else {
        const childNode = convertAstItemToNode(
          item,
          source,
          createScopedConversionContext({ qColors: colorContext, qStyles: styleContext })
        );
        if (childNode) {
          appendChildNode(childNode);
        }
      }
    }
  }

  function resolveComponentIdExpression(expr, fallback) {
    if (!expr || typeof expr !== "object") {
      return String(fallback || "");
    }
    if (expr.type === "IdentifierExpression") {
      return String(expr.identifier || fallback || "").trim();
    }
    if (expr.type === "QScriptExpression") {
      const resolved = tryResolveStaticQScript(expr.script || "");
      return String(resolved || fallback || "").trim();
    }
    return String(fallback || "").trim();
  }

  function markPropertyBindingNode(node, propertyName) {
    if (!node || typeof node !== "object") {
      return;
    }
    if (!node.meta || typeof node.meta !== "object") {
      node.meta = {};
    }
    node.meta.__qhtmlPropertyBindingName = String(propertyName || "").trim();
  }

  function applyKeywordAliasesToNode(node, keywordMap) {
    if (!node || typeof node !== "object") {
      return;
    }
    if (!keywordMap || typeof keywordMap !== "object" || Array.isArray(keywordMap)) {
      return;
    }
    const keys = Object.keys(keywordMap);
    if (keys.length === 0) {
      return;
    }
    const mapped = {};
    for (let i = 0; i < keys.length; i += 1) {
      const key = String(keys[i] || "").trim();
      const value = String(keywordMap[key] || "").trim();
      if (!key || !value) {
        continue;
      }
      mapped[key] = value;
    }
    if (Object.keys(mapped).length > 0) {
      node.keywords = mapped;
    }
  }

  function buildComponentNodeFromAst(astNode, source, options, context) {
    const opts = options || {};
    const scopedContext = createScopedConversionContext(context);
    const colorContext = scopedContext.qColors;
    const styleContext = scopedContext.qStyles;
    const componentAttributes = {};
    const componentProperties = [];
    const componentPropertiesSeen = new Set();
    const templateNodes = [];
    const propertyDefinitions = [];
    const methods = [];
    const signalDeclarations = [];
    const aliasDeclarations = [];
    let wasmConfig = null;
    const lifecycleScripts = [];
    const definitionType = String(opts.definitionType || "component").trim().toLowerCase() || "component";
    let componentId = String(opts.componentId || "").trim();

    const items = Array.isArray(astNode.items) ? astNode.items : [];
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      const namedTheme = resolveNamedQThemeInvocation(item, styleContext);
      if (namedTheme && Array.isArray(item.items) && item.items.length > 0) {
        const invocationContext = createScopedConversionContext({ qColors: colorContext, qStyles: styleContext });
        appendActiveQTheme(invocationContext.qStyles, namedTheme);
        const scopeNode = core.createElementNode({
          tagName: "q-theme-scope",
          selectorMode: "single",
          selectorChain: ["q-theme-scope"],
          attributes: {},
          children: [],
          meta: {
            generated: true,
            virtual: true,
          },
        });
        processElementItems(scopeNode, item.items, source, invocationContext);
        const scopedChildren = Array.isArray(scopeNode.children) ? scopeNode.children : [];
        for (let ci = 0; ci < scopedChildren.length; ci += 1) {
          templateNodes.push(scopedChildren[ci]);
        }
        continue;
      }
      if (tryApplyNamedQThemeInvocation(item, styleContext)) {
        continue;
      }
      const namedColorSetup = resolveNamedQColorSetupInvocation(item, colorContext);
      if (namedColorSetup && Array.isArray(item.items) && item.items.length > 0) {
        const invocationContext = createScopedConversionContext({ qColors: colorContext, qStyles: styleContext });
        appendActiveQColorSetup(invocationContext.qColors, namedColorSetup);
        const scopeNode = core.createElementNode({
          tagName: "q-color-scope",
          selectorMode: "single",
          selectorChain: ["q-color-scope"],
          attributes: {},
          children: [],
          meta: {
            generated: true,
            virtual: true,
          },
        });
        processElementItems(scopeNode, item.items, source, invocationContext);
        const scopedChildren = Array.isArray(scopeNode.children) ? scopeNode.children : [];
        for (let ci = 0; ci < scopedChildren.length; ci += 1) {
          templateNodes.push(scopedChildren[ci]);
        }
        continue;
      }
      if (tryApplyNamedQColorInvocation(item, colorContext)) {
        continue;
      }
      if (item.type === "QColorSchemaDefinition") {
        registerQColorSchemaItem(colorContext, item);
        continue;
      }
      if (item.type === "QStyleDefinition") {
        registerQStyleDefinitionItem(styleContext, item);
        continue;
      }
      if (item.type === "QThemeDefinition") {
        registerQThemeDefinitionItem(styleContext, item);
        continue;
      }
      if (item.type === "QColorDefinition") {
        registerQColorDefinitionItem(colorContext, item);
        continue;
      }
      if (item.type === "QColorThemeDefinition") {
        registerQColorThemeItem(colorContext, item);
        continue;
      }
      if (item.type === "QPropertyBlock") {
        const names = Array.isArray(item.properties) ? item.properties : [];
        for (let j = 0; j < names.length; j += 1) {
          const propertyName = String(names[j] || "").trim();
          const normalized = normalizePropertyName(propertyName);
          if (!propertyName || !normalized || componentPropertiesSeen.has(normalized)) {
            continue;
          }
          componentPropertiesSeen.add(normalized);
          componentProperties.push(propertyName);
        }
        continue;
      }
      if (item.type === "Property") {
        const assignment = parseAssignmentName(item.name);
        const key = normalizePropertyName(assignment.name);
        const value = coercePropertyValue(item.value);
        if (key === "id" && !componentId) {
          componentId = String(value || "").trim();
        } else {
          componentAttributes[assignment.name] = value;
        }
        continue;
      }
      if (item.type === "PropertyDefinitionBlock") {
        if (definitionType === "component") {
          const propertyName = String(item.name || "").trim();
          const normalized = normalizePropertyName(propertyName);
          if (propertyName && normalized && !componentPropertiesSeen.has(normalized)) {
            componentPropertiesSeen.add(normalized);
            componentProperties.push(propertyName);
          }
          const propertyNodes = [];
          const nestedItems = Array.isArray(item.items) ? item.items : [];
          for (let j = 0; j < nestedItems.length; j += 1) {
            const propertyNode = convertAstItemToNode(nestedItems[j], source, scopedContext);
            if (!propertyNode) {
              continue;
            }
            if (propertyName) {
              markPropertyBindingNode(propertyNode, propertyName);
            }
            propertyNodes.push(propertyNode);
          }
          propertyDefinitions.push({
            name: propertyName,
            nodes: propertyNodes,
          });
        }
        continue;
      }
      if (item.type === "HtmlBlock") {
        templateNodes.push(core.createRawHtmlNode({ html: item.html, meta: { originalSource: item.raw } }));
        continue;
      }
      if (item.type === "ImportBlock") {
        continue;
      }
      if (item.type === "FunctionBlock") {
        if (definitionType === "component") {
          methods.push({
            name: String(item.name || "").trim(),
            signature: String(item.signature || "").trim(),
            parameters: String(item.parameters || "").trim(),
            body: compactScriptBody(item.body || ""),
          });
        }
        continue;
      }
      if (item.type === "SignalDeclaration") {
        if (definitionType === "component") {
          const signalName = String(item.name || "").trim();
          if (signalName) {
            signalDeclarations.push({
              name: signalName,
              signature: String(item.signature || "").trim(),
              parameters: Array.isArray(item.parameters) ? item.parameters.slice() : [],
            });
          }
        }
        continue;
      }
      if (item.type === "AliasDeclaration") {
        if (definitionType === "component") {
          const aliasName = String(item.name || "").trim();
          if (aliasName) {
            aliasDeclarations.push({
              name: aliasName,
              body: compactScriptBody(item.body || ""),
            });
          }
        }
        continue;
      }
      if (item.type === "QWasmBlock") {
        if (definitionType !== "component") {
          throw new Error("q-wasm is only valid inside q-component definitions.");
        }
        const parsed =
          item.config && typeof item.config === "object" && !Array.isArray(item.config)
            ? item.config
            : parseQWasmConfig("", null);
        const exportList = Array.isArray(parsed.exports) ? parsed.exports.slice() : [];
        const allowImportsList = Array.isArray(parsed.allowImports) ? parsed.allowImports.slice() : [];
        const bindList = Array.isArray(parsed.bind) ? parsed.bind.slice() : [];
        wasmConfig = {
          src: String(parsed.src || "").trim(),
          mode: String(parsed.mode || "").trim(),
          awaitWasm: typeof parsed.awaitWasm === "boolean" ? parsed.awaitWasm : null,
          timeoutMs: Number.isFinite(parsed.timeoutMs) ? Number(parsed.timeoutMs) : null,
          maxPayloadBytes: Number.isFinite(parsed.maxPayloadBytes) ? Number(parsed.maxPayloadBytes) : null,
          exports: exportList,
          allowImports: allowImportsList,
          bind: bindList,
        };
        continue;
      }
      if (item.type === "EventBlock" && item.isLifecycle) {
        if (definitionType === "component") {
          lifecycleScripts.push({
            name: String(item.name || "").trim(),
            body: compactScriptBody(item.script || ""),
          });
        }
        continue;
      }
      const node = convertAstItemToNode(item, source, scopedContext);
      if (node) {
        templateNodes.push(node);
      }
    }

    const componentNode = core.createComponentNode({
      componentId: componentId,
      definitionType: definitionType,
      templateNodes: templateNodes,
      methods: methods,
      propertyDefinitions: propertyDefinitions,
      signalDeclarations: signalDeclarations,
      aliasDeclarations: aliasDeclarations,
      wasmConfig: wasmConfig,
      lifecycleScripts: lifecycleScripts,
      attributes: componentAttributes,
      properties: componentProperties,
      meta: {
        originalSource: astNode.raw,
        sourceRange: [astNode.start, astNode.end],
      },
    });
    applyKeywordAliasesToNode(componentNode, astNode.keywords);
    return componentNode;
  }

  function buildElementFromAst(astElement, source, context) {
    const scopedContext = createScopedConversionContext(context);
    const colorContext = scopedContext.qColors;
    const styleContext = scopedContext.qStyles;
    const selectors = astElement.selectors.map((entry) => String(entry).trim()).filter(Boolean);
    const prefixDirectives = Array.isArray(astElement.prefixDirectives) ? astElement.prefixDirectives.slice() : [];
    if (selectors.length === 0) {
      throw new Error("Element with empty selector list cannot be converted.");
    }

    if (selectors.length === 1 && selectors[0].toLowerCase() === "q-component") {
      return buildComponentNodeFromAst(astElement, source, {
        definitionType: "component",
      }, scopedContext);
    }

    const selectorTokens = [];
    const selectorSources = [];
    const selectorSetupScopes = [];
    const selectorStyleScopes = [];
    const selectorThemeScopes = [];
    const pendingSetups = [];
    const pendingStyles = [];
    const pendingThemes = [];
    for (let si = 0; si < selectors.length; si += 1) {
      const selectorSource = selectors[si];
      const parsedToken = parseTagToken(selectorSource);
      const hasFragments = !!parsedToken.id || (Array.isArray(parsedToken.classes) && parsedToken.classes.length > 0);
      if (!hasFragments) {
        const namedTheme = lookupQThemeDefinition(styleContext, selectorSource);
        if (namedTheme) {
          pendingThemes.push(namedTheme);
          continue;
        }
        const namedStyle = lookupQStyleDefinition(styleContext, selectorSource);
        if (namedStyle) {
          pendingStyles.push(namedStyle);
          continue;
        }
        const namedSetup = lookupQColorDefinition(colorContext, selectorSource);
        if (namedSetup) {
          pendingSetups.push(namedSetup);
          continue;
        }
      }
      selectorTokens.push(parsedToken);
      selectorSources.push(selectorSource);
      selectorSetupScopes.push(pendingSetups.map(cloneQColorSetup));
      selectorStyleScopes.push(pendingStyles.map(cloneQStyleDefinition));
      selectorThemeScopes.push(pendingThemes.map(cloneQThemeDefinition));
      pendingStyles.length = 0;
      pendingThemes.length = 0;
    }
    const trailingChildStyles = pendingStyles.map(cloneQStyleDefinition);
    if (selectorTokens.length === 0) {
      if (trailingChildStyles.length > 0) {
        const childItems = Array.isArray(astElement.items) ? astElement.items : [];
        let hasElementChild = false;
        for (let i = 0; i < childItems.length; i += 1) {
          const item = childItems[i];
          if (!item || typeof item !== "object") {
            continue;
          }
          if (item.type === "Element" || item.type === "ComponentDefinition" || item.type === "TemplateDefinition") {
            hasElementChild = true;
            break;
          }
        }
        if (!hasElementChild && typeof console !== "undefined" && console && typeof console.warn === "function") {
          const styleNames = trailingChildStyles
            .map(function mapStyleName(entry) { return String(entry && entry.name || "").trim(); })
            .filter(Boolean);
          console.warn(
            "qhtml q-style warning: cannot apply q-style to a text-only block without element children",
            { styles: styleNames, selector: selectors.slice() }
          );
        }
      }
      return null;
    }
    const selectorMode = detectSelectorMode(selectorTokens);

    if (selectorMode === "class-shorthand") {
      const last = selectorTokens[selectorTokens.length - 1];
      const leaf = createElementFromToken(
        last,
        "class-shorthand",
        selectorSources,
        [astElement.start, astElement.end],
        astElement.raw
      );
      const classNames = selectorTokens.slice(0, selectorTokens.length - 1).map((token) => token.raw).filter(Boolean);
      if (classNames.length > 0) {
        leaf.attributes.class = core.mergeClasses(leaf.attributes.class, classNames);
      }
      if (prefixDirectives.length > 0) {
        leaf.slotDirectives = prefixDirectives;
      }
      const classScopeSetups = selectorSetupScopes.length > 0 ? selectorSetupScopes[selectorSetupScopes.length - 1] : [];
      const classScopeStyles = selectorStyleScopes.length > 0 ? selectorStyleScopes[selectorStyleScopes.length - 1] : [];
      const classScopeThemes = selectorThemeScopes.length > 0 ? selectorThemeScopes[selectorThemeScopes.length - 1] : [];
      const leafContext = createScopedConversionContext(scopedContext);
      leafContext.qStyleChildScope = trailingChildStyles.map(cloneQStyleDefinition);
      for (let i = 0; i < classScopeSetups.length; i += 1) {
        appendActiveQColorSetup(leafContext.qColors, classScopeSetups[i]);
      }
      for (let i = 0; i < classScopeThemes.length; i += 1) {
        appendActiveQTheme(leafContext.qStyles, classScopeThemes[i]);
      }
      for (let i = 0; i < classScopeStyles.length; i += 1) {
        applyQStyleToElementNode(leaf, classScopeStyles[i]);
      }
      applyActiveQThemesToElementNode(leaf, leafContext.qStyles);
      attachRuntimeThemeRulesToElementNode(leaf, leafContext.qStyles);
      processElementItems(leaf, astElement.items, source, leafContext);
      applyKeywordAliasesToNode(leaf, astElement.keywords);
      return leaf;
    }

    const chain = selectorTokens.map(function build(token, index) {
      return createElementFromToken(
        token,
        index === 0 && selectorTokens.length > 1 ? "nest" : "single",
        index === 0 ? selectorSources : [selectorSources[index]],
        index === 0 ? [astElement.start, astElement.end] : null,
        index === 0 ? astElement.raw : null
      );
    });

    for (let i = 0; i < chain.length - 1; i += 1) {
      chain[i].children.push(chain[i + 1]);
    }
    for (let i = 0; i < chain.length; i += 1) {
      const nodeContext = createQColorContext(colorContext);
      const setupsForNode = Array.isArray(selectorSetupScopes[i]) ? selectorSetupScopes[i] : [];
      for (let si = 0; si < setupsForNode.length; si += 1) {
        appendActiveQColorSetup(nodeContext, setupsForNode[si]);
      }
      applyActiveQColorSetupsToElementNode(chain[i], nodeContext);
      const stylesForNode = Array.isArray(selectorStyleScopes[i]) ? selectorStyleScopes[i] : [];
      const themesForNode = Array.isArray(selectorThemeScopes[i]) ? selectorThemeScopes[i] : [];
      for (let ssi = 0; ssi < stylesForNode.length; ssi += 1) {
        applyQStyleToElementNode(chain[i], stylesForNode[ssi]);
      }
      const nodeStyleContext = createQStyleContext(styleContext);
      for (let tsi = 0; tsi < themesForNode.length; tsi += 1) {
        appendActiveQTheme(nodeStyleContext, themesForNode[tsi]);
      }
      applyActiveQThemesToElementNode(chain[i], nodeStyleContext);
      attachRuntimeThemeRulesToElementNode(chain[i], nodeStyleContext);
      applyKeywordAliasesToNode(chain[i], astElement.keywords);
    }

    const leaf = chain[chain.length - 1];
    if (prefixDirectives.length > 0) {
      leaf.slotDirectives = prefixDirectives;
    }
    const leafContext = createScopedConversionContext(scopedContext);
    leafContext.qStyleChildScope = trailingChildStyles.map(cloneQStyleDefinition);
    const setupsForLeaf = Array.isArray(selectorSetupScopes[selectorSetupScopes.length - 1])
      ? selectorSetupScopes[selectorSetupScopes.length - 1]
      : [];
    const themesForLeaf = Array.isArray(selectorThemeScopes[selectorThemeScopes.length - 1])
      ? selectorThemeScopes[selectorThemeScopes.length - 1]
      : [];
    for (let si = 0; si < setupsForLeaf.length; si += 1) {
      appendActiveQColorSetup(leafContext.qColors, setupsForLeaf[si]);
    }
    for (let ti = 0; ti < themesForLeaf.length; ti += 1) {
      appendActiveQTheme(leafContext.qStyles, themesForLeaf[ti]);
    }
    processElementItems(leaf, astElement.items, source, leafContext);

    return chain[0];
  }

  function convertAstItemToNode(item, source, context) {
    if (!item || typeof item !== "object") {
      return null;
    }

    if (item.type === "Element") {
      return buildElementFromAst(item, source, context);
    }

    if (item.type === "TemplateDefinition") {
      return buildComponentNodeFromAst(item, source, {
        componentId: item.templateId,
        definitionType: "template",
      }, context);
    }

    if (item.type === "SignalDefinition") {
      return buildComponentNodeFromAst(item, source, {
        componentId: item.signalId,
        definitionType: "signal",
      }, context);
    }

    if (item.type === "ComponentDefinition") {
      const componentId = resolveComponentIdExpression(item.componentIdExpression, "");
      return buildComponentNodeFromAst(item, source, {
        componentId: componentId,
        definitionType: "component",
      }, context);
    }

    if (item.type === "HtmlBlock") {
      const htmlNode = core.createRawHtmlNode({
        html: item.html,
        meta: {
          originalSource: item.raw,
          sourceRange: [item.start, item.end],
        },
      });
      applyKeywordAliasesToNode(htmlNode, item.keywords);
      return htmlNode;
    }

    if (item.type === "StyleBlock") {
      const styleElement = core.createElementNode({
        tagName: "style",
        selectorMode: "single",
        selectorChain: ["style"],
        meta: {
          originalSource: item.raw,
          sourceRange: [item.start, item.end],
        },
      });
      styleElement.textContent = String(item.css || "").trim();
      applyKeywordAliasesToNode(styleElement, item.keywords);
      return styleElement;
    }

    if (item.type === "TextBlock" || item.type === "RawTextLine" || item.type === "BareWord") {
      const textNode = createTextContentNode(item.type === "TextBlock" ? String(item.text || "") : String(item.text || item.name || ""), {
        originalSource: item.raw || null,
        sourceRange:
          typeof item.start === "number" && typeof item.end === "number"
            ? [item.start, item.end]
            : null,
      });
      applyKeywordAliasesToNode(textNode, item.keywords);
      return textNode;
    }

    if (item.type === "QWasmBlock") {
      throw new Error("q-wasm is only valid inside q-component definitions.");
    }

    return null;
  }

  function parseQHtmlToQDom(source, options) {
    const rawSource = String(source || "");
    const opts = options || {};
    const resolveImports = opts.resolveImportsBeforeParse !== false;
    const importUrls = [];
    const effectiveSource =
      resolveImports && typeof opts.loadImportSync === "function"
        ? resolveQImportsSync(rawSource, {
            loadImportSync: opts.loadImportSync,
            baseUrl: opts.importBaseUrl || "",
            maxImports: opts.maxImports,
            cache: opts.importCache,
            onImport: function onImport(info) {
              if (info && info.url) {
                importUrls.push(info.url);
              }
            },
          })
        : rawSource;
    const sourceKeywordAliases = collectKeywordAliasesFromSource(effectiveSource);
    const macroResult = applyQMacroBlocks(effectiveSource, {
      maxPasses: opts.maxQMacroPasses,
      keywordAliases: sourceKeywordAliases,
      references: opts.references,
    });
    const macroExpandedSource = macroResult.source;
    const postMacroKeywordAliases = collectKeywordAliasesFromSource(macroExpandedSource);
    const rewriteResult = applyQRewriteBlocks(macroExpandedSource, {
      maxPasses: opts.maxQRewritePasses,
      maxQScriptPasses: opts.maxQScriptPasses,
      keywordAliases: postMacroKeywordAliases,
    });
    const rewrittenSource = rewriteResult.source;
    const evaluatedSource = evaluateQScriptBlocks(rewrittenSource, {
      maxPasses: opts.maxQScriptPasses,
      keywordAliases: postMacroKeywordAliases,
      shouldEvaluate: function shouldEvaluateQScriptBlock(context) {
        return !isAssignmentQScriptContext(context && context.source, context && context.start);
      },
    });
    const ast = parseQHtmlToAst(evaluatedSource);
    const doc = core.createDocument({ source: rawSource });
    const conversionContext = createScopedConversionContext();

    const imports = [];
    const lifecycleScripts = [];
    for (let i = 0; i < ast.body.length; i += 1) {
      const item = ast.body[i];
      if (item.type === "ImportBlock") {
        imports.push(String(item.path || "").trim());
        continue;
      }
      if (item.type === "LifecycleBlock" && item.isLifecycle) {
        lifecycleScripts.push({
          name: String(item.name || "").trim(),
          body: compactScriptBody(item.script || ""),
        });
        continue;
      }
      if (item.type === "QColorSchemaDefinition") {
        registerQColorSchemaItem(conversionContext.qColors, item);
        continue;
      }
      if (item.type === "QStyleDefinition") {
        registerQStyleDefinitionItem(conversionContext.qStyles, item);
        continue;
      }
      if (item.type === "QThemeDefinition") {
        registerQThemeDefinitionItem(conversionContext.qStyles, item);
        continue;
      }
      if (item.type === "QColorDefinition") {
        registerQColorDefinitionItem(conversionContext.qColors, item);
        continue;
      }
      if (item.type === "QColorThemeDefinition") {
        registerQColorThemeItem(conversionContext.qColors, item);
        continue;
      }
      if (item.type === "QWasmBlock") {
        throw new Error("q-wasm is only valid inside q-component definitions.");
      }
      {
        const namedTheme = resolveNamedQThemeInvocation(item, conversionContext.qStyles);
        if (namedTheme && Array.isArray(item.items) && item.items.length > 0) {
          const invocationContext = createScopedConversionContext(conversionContext);
          appendActiveQTheme(invocationContext.qStyles, namedTheme);
          const scopeNode = core.createElementNode({
            tagName: "q-theme-scope",
            selectorMode: "single",
            selectorChain: ["q-theme-scope"],
            attributes: {},
            children: [],
            meta: {
              generated: true,
              virtual: true,
            },
          });
          processElementItems(scopeNode, item.items, evaluatedSource, invocationContext);
          const scopedChildren = Array.isArray(scopeNode.children) ? scopeNode.children : [];
          for (let ci = 0; ci < scopedChildren.length; ci += 1) {
            doc.nodes.push(scopedChildren[ci]);
          }
          continue;
        }
      }
      if (tryApplyNamedQThemeInvocation(item, conversionContext.qStyles)) {
        continue;
      }
      {
        const namedColorSetup = resolveNamedQColorSetupInvocation(item, conversionContext.qColors);
        if (namedColorSetup && Array.isArray(item.items) && item.items.length > 0) {
          const invocationContext = createScopedConversionContext(conversionContext);
          appendActiveQColorSetup(invocationContext.qColors, namedColorSetup);
          const scopeNode = core.createElementNode({
            tagName: "q-color-scope",
            selectorMode: "single",
            selectorChain: ["q-color-scope"],
            attributes: {},
            children: [],
            meta: {
              generated: true,
              virtual: true,
            },
          });
          processElementItems(scopeNode, item.items, evaluatedSource, invocationContext);
          const scopedChildren = Array.isArray(scopeNode.children) ? scopeNode.children : [];
          for (let ci = 0; ci < scopedChildren.length; ci += 1) {
            doc.nodes.push(scopedChildren[ci]);
          }
          continue;
        }
      }
      if (tryApplyNamedQColorInvocation(item, conversionContext.qColors)) {
        continue;
      }
      const node = convertAstItemToNode(item, evaluatedSource, createScopedConversionContext(conversionContext));
      if (node) {
        doc.nodes.push(node);
      }
    }

    const definitionRegistry = buildDefinitionRegistry(doc.nodes);
    doc.nodes = normalizeNodesForDefinitions(doc.nodes, definitionRegistry);

    if (!doc.meta || typeof doc.meta !== "object") {
      doc.meta = {};
    }
    doc.meta.imports = imports.length > 0 ? imports : importUrls;
    doc.meta.resolvedSource = effectiveSource;
    doc.meta.macroExpandedSource = macroExpandedSource;
    doc.meta.qMacros = macroResult.definitions;
    doc.meta.rewrittenSource = rewrittenSource;
    doc.meta.qRewrites = rewriteResult.definitions;
    doc.meta.evaluatedSource = evaluatedSource;
    doc.meta.lifecycleScripts = lifecycleScripts;
    if (Array.isArray(opts.scriptRules)) {
      doc.scripts = opts.scriptRules.slice();
    }

    return doc;
  }

  function escapeQuoted(value) {
    return String(value)
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r")
      .replace(/\t/g, "\\t");
  }

  function serializeScriptBlock(name, body, indentLevel) {
    const indent = "  ".repeat(indentLevel);
    const blockName = String(name || "").trim();
    const scriptBody = String(body || "");
    const lines = [indent + blockName + " {"];
    if (scriptBody) {
      const chunks = scriptBody.split("\n");
      for (let i = 0; i < chunks.length; i += 1) {
        lines.push(indent + "  " + chunks[i]);
      }
    }
    lines.push(indent + "}");
    return lines.join("\n");
  }

  function serializeFunctionBlock(method, indentLevel) {
    const indent = "  ".repeat(indentLevel);
    if (!method || typeof method !== "object") {
      return "";
    }
    const signature = String(method.signature || "").trim();
    const name = String(method.name || "").trim();
    const params = String(method.parameters || "").trim();
    const header = signature ? "function " + signature : "function " + name + "(" + params + ")";
    const body = String(method.body || "");
    const lines = [indent + header + " {"];
    if (body) {
      const chunks = body.split("\n");
      for (let i = 0; i < chunks.length; i += 1) {
        lines.push(indent + "  " + chunks[i]);
      }
    }
    lines.push(indent + "}");
    return lines.join("\n");
  }

  function serializeSignalDeclarationBlock(signalDecl, indentLevel) {
    const indent = "  ".repeat(indentLevel);
    if (!signalDecl || typeof signalDecl !== "object") {
      return "";
    }
    const name = String(signalDecl.name || "").trim();
    if (!name) {
      return "";
    }
    const parameters = Array.isArray(signalDecl.parameters)
      ? signalDecl.parameters.map(function mapParam(entry) { return String(entry || "").trim(); }).filter(Boolean)
      : [];
    return indent + "q-signal " + name + "(" + parameters.join(", ") + ")";
  }

  function serializeAliasDeclarationBlock(aliasDecl, indentLevel) {
    const indent = "  ".repeat(indentLevel);
    if (!aliasDecl || typeof aliasDecl !== "object") {
      return "";
    }
    const name = String(aliasDecl.name || "").trim();
    if (!name) {
      return "";
    }
    const body = String(aliasDecl.body || "");
    const lines = [indent + "q-alias " + name + " {"];
    if (body) {
      const chunks = body.split("\n");
      for (let i = 0; i < chunks.length; i += 1) {
        lines.push(indent + "  " + chunks[i]);
      }
    }
    lines.push(indent + "}");
    return lines.join("\n");
  }

  function serializeWasmConfigBlock(wasmConfig, indentLevel) {
    const config =
      wasmConfig && typeof wasmConfig === "object" && !Array.isArray(wasmConfig)
        ? wasmConfig
        : null;
    if (!config) {
      return "";
    }
    const indent = "  ".repeat(indentLevel);
    const lines = [indent + "q-wasm {"];
    const src = String(config.src || "").trim();
    if (src) {
      lines.push(indent + "  src: " + src);
    }
    const mode = String(config.mode || "").trim();
    if (mode) {
      lines.push(indent + "  mode: " + mode);
    }
    if (typeof config.awaitWasm === "boolean") {
      lines.push(indent + "  awaitWasm: " + (config.awaitWasm ? "true" : "false"));
    }
    if (Number.isFinite(config.timeoutMs)) {
      lines.push(indent + "  timeoutMs: " + String(Math.max(0, Math.floor(Number(config.timeoutMs)))));
    }
    if (Number.isFinite(config.maxPayloadBytes)) {
      lines.push(indent + "  maxPayloadBytes: " + String(Math.max(0, Math.floor(Number(config.maxPayloadBytes)))));
    }
    const exportsList = Array.isArray(config.exports) ? config.exports : [];
    if (exportsList.length > 0) {
      lines.push(indent + "  exports { " + exportsList.join(" ") + " }");
    }
    const allowImportsList = Array.isArray(config.allowImports) ? config.allowImports : [];
    if (allowImportsList.length > 0) {
      lines.push(indent + "  allowImports { " + allowImportsList.join(" ") + " }");
    }
    const bindList = Array.isArray(config.bind) ? config.bind : [];
    if (bindList.length > 0) {
      lines.push(indent + "  bind {");
      for (let i = 0; i < bindList.length; i += 1) {
        const entry = bindList[i] || {};
        const exportName = String(entry.exportName || "").trim();
        const targetType = String(entry.targetType || "").trim();
        const targetName = String(entry.targetName || "").trim();
        if (!exportName || !targetType || !targetName) {
          continue;
        }
        lines.push(indent + "    " + exportName + " -> " + targetType + " " + targetName);
      }
      lines.push(indent + "  }");
    }
    lines.push(indent + "}");
    return lines.join("\n");
  }

  function serializePropertyDefinitionBlock(propertyDef, indentLevel) {
    const indent = "  ".repeat(indentLevel);
    if (!propertyDef || typeof propertyDef !== "object") {
      return "";
    }
    const name = String(propertyDef.name || "").trim();
    if (!name) {
      return "";
    }
    const lines = [indent + "property " + name + " {"];
    const nodes = Array.isArray(propertyDef.nodes) ? propertyDef.nodes : [];
    for (let i = 0; i < nodes.length; i += 1) {
      lines.push(serializeNode(nodes[i], indentLevel + 1));
    }
    lines.push(indent + "}");
    return lines.join("\n");
  }

  function serializeTextBlock(name, value, indentLevel) {
    const indent = "  ".repeat(indentLevel);
    const blockName = String(name || "text").trim() || "text";
    const text = String(value || "");
    const lines = [indent + blockName + " {"];
    if (text) {
      const chunks = text.split("\n");
      for (let i = 0; i < chunks.length; i += 1) {
        lines.push(indent + "  " + chunks[i]);
      }
    }
    lines.push(indent + "}");
    return lines.join("\n");
  }

  function serializeSlotNode(slotNode, indentLevel) {
    const indent = "  ".repeat(indentLevel);
    const slotName = slotNode && typeof slotNode.name === "string" && slotNode.name.trim() ? slotNode.name : "default";
    const lines = [indent + slotName + " {"];
    const children = Array.isArray(slotNode && slotNode.children) ? slotNode.children : [];
    for (let i = 0; i < children.length; i += 1) {
      lines.push(serializeNode(children[i], indentLevel + 1));
    }
    lines.push(indent + "}");
    return lines.join("\n");
  }

  function readNodeBindingEntries(node) {
    if (!node || typeof node !== "object" || !node.meta || typeof node.meta !== "object") {
      return [];
    }
    if (!Array.isArray(node.meta.qBindings)) {
      return [];
    }
    return node.meta.qBindings;
  }

  function collectNodeBindingsByTarget(node, targetCollection) {
    const requested = String(targetCollection || "").trim().toLowerCase();
    const entries = readNodeBindingEntries(node);
    const map = new Map();
    for (let i = 0; i < entries.length; i += 1) {
      const entry = entries[i];
      if (!entry || typeof entry !== "object") {
        continue;
      }
      const actualTarget =
        String(entry.targetCollection || "").trim().toLowerCase() === "props"
          ? "props"
          : String(entry.targetCollection || "").trim().toLowerCase() === "textcontent"
            ? "textcontent"
            : "attributes";
      if (actualTarget !== requested) {
        continue;
      }
      const name = String(entry.name || "").trim();
      if (!name) {
        continue;
      }
      map.set(name, entry);
    }
    return map;
  }

  function serializeBindingAssignment(name, binding, indentLevel) {
    const indent = "  ".repeat(indentLevel);
    const key = String(name || "").trim();
    const spec = binding && typeof binding === "object" ? binding : {};
    const expressionType = normalizeBindingExpressionKind(spec.expressionType);
    const keyword = expressionType === "q-script" ? "q-script" : "q-bind";
    const scriptBody = String(spec.script || "");
    const lines = [indent + key + ": " + keyword + " {"];
    if (scriptBody) {
      const chunks = scriptBody.split("\n");
      for (let i = 0; i < chunks.length; i += 1) {
        lines.push(indent + "  " + chunks[i]);
      }
    }
    lines.push(indent + "}");
    return lines.join("\n");
  }

  function serializeNode(node, indentLevel) {
    const indent = "  ".repeat(indentLevel);
    if (!node || typeof node !== "object") {
      return "";
    }

    if (node.meta && node.meta.originalSource && !node.meta.dirty) {
      return node.meta.originalSource;
    }

    if (node.kind === core.NODE_TYPES.rawHtml) {
      return indent + "html {" + (node.html || "") + "}";
    }

    if (core.NODE_TYPES.text && node.kind === core.NODE_TYPES.text) {
      return serializeTextBlock("text", node.value, indentLevel);
    }

    if (node.kind === core.NODE_TYPES.component) {
      const explicitDefinitionType = String(node.definitionType || "").trim().toLowerCase();
      const definitionType =
        explicitDefinitionType === "template" ? "template" : explicitDefinitionType === "signal" ? "signal" : "component";
      const keyword = definitionType === "template" ? "q-template" : definitionType === "signal" ? "q-signal" : "q-component";
      const definitionId = String(node.componentId || "").trim();
      const lines = [indent + (definitionId ? keyword + " " + definitionId + " {" : keyword + " {")];
      const properties = Array.isArray(node.properties) ? node.properties : [];
      if (properties.length > 0) {
        lines.push(indent + "  q-property {");
        for (let i = 0; i < properties.length; i += 1) {
          const propertyName = String(properties[i] || "").trim();
          if (!propertyName) {
            continue;
          }
          lines.push(indent + "    " + propertyName);
        }
        lines.push(indent + "  }");
      }
      const attrs = node.attributes || {};
      const attrKeys = Object.keys(attrs);
      for (let i = 0; i < attrKeys.length; i += 1) {
        const key = attrKeys[i];
        lines.push(indent + "  " + key + ": \"" + escapeQuoted(coercePropertyValue(attrs[key])) + "\"");
      }
      if (definitionType === "component" && Array.isArray(node.propertyDefinitions)) {
        for (let i = 0; i < node.propertyDefinitions.length; i += 1) {
          const serializedPropertyDefinition = serializePropertyDefinitionBlock(node.propertyDefinitions[i], indentLevel + 1);
          if (serializedPropertyDefinition) {
            lines.push(serializedPropertyDefinition);
          }
        }
      }
      if (definitionType === "component" && Array.isArray(node.methods)) {
        if (Array.isArray(node.signalDeclarations)) {
          for (let i = 0; i < node.signalDeclarations.length; i += 1) {
            const serializedSignalDeclaration = serializeSignalDeclarationBlock(node.signalDeclarations[i], indentLevel + 1);
            if (serializedSignalDeclaration) {
              lines.push(serializedSignalDeclaration);
            }
          }
        }
        if (Array.isArray(node.aliasDeclarations)) {
          for (let i = 0; i < node.aliasDeclarations.length; i += 1) {
            const serializedAliasDeclaration = serializeAliasDeclarationBlock(node.aliasDeclarations[i], indentLevel + 1);
            if (serializedAliasDeclaration) {
              lines.push(serializedAliasDeclaration);
            }
          }
        }
        const serializedWasmConfig = serializeWasmConfigBlock(node.wasmConfig, indentLevel + 1);
        if (serializedWasmConfig) {
          lines.push(serializedWasmConfig);
        }
        for (let i = 0; i < node.methods.length; i += 1) {
          lines.push(serializeFunctionBlock(node.methods[i], indentLevel + 1));
        }
      }
      if (definitionType === "component" && Array.isArray(node.lifecycleScripts)) {
        for (let i = 0; i < node.lifecycleScripts.length; i += 1) {
          const hook = node.lifecycleScripts[i] || {};
          lines.push(serializeScriptBlock(hook.name, hook.body, indentLevel + 1));
        }
      }
      for (let i = 0; i < node.templateNodes.length; i += 1) {
        lines.push(serializeNode(node.templateNodes[i], indentLevel + 1));
      }
      lines.push(indent + "}");
      return lines.join("\n");
    }

    if (node.kind === core.NODE_TYPES.slot) {
      return serializeSlotNode(node, indentLevel);
    }

    if (node.kind === core.NODE_TYPES.componentInstance || node.kind === core.NODE_TYPES.templateInstance) {
      const tagName = String(node.tagName || node.componentId || "div").trim().toLowerCase();
      const lines = [indent + tagName + " {"];

      const attrs = node.attributes || {};
      const attrBindings = collectNodeBindingsByTarget(node, "attributes");
      const attrKeys = Object.keys(attrs);
      const serializedAttrBindings = new Set();
      for (let i = 0; i < attrKeys.length; i += 1) {
        const key = attrKeys[i];
        const binding = attrBindings.get(key);
        if (binding) {
          lines.push(serializeBindingAssignment(key, binding, indentLevel + 1));
          serializedAttrBindings.add(key);
        } else {
          lines.push(indent + "  " + key + ": \"" + escapeQuoted(coercePropertyValue(attrs[key])) + "\"");
        }
      }
      attrBindings.forEach(function serializeRemainingAttrBinding(binding, key) {
        if (serializedAttrBindings.has(key)) {
          return;
        }
        lines.push(serializeBindingAssignment(key, binding, indentLevel + 1));
      });

      const props = node.props || {};
      const propBindings = collectNodeBindingsByTarget(node, "props");
      const propKeys = Object.keys(props);
      const serializedPropBindings = new Set();
      for (let i = 0; i < propKeys.length; i += 1) {
        const key = propKeys[i];
        const binding = propBindings.get(key);
        if (binding) {
          lines.push(serializeBindingAssignment(key, binding, indentLevel + 1));
          serializedPropBindings.add(key);
        } else {
          lines.push(indent + "  " + key + ": \"" + escapeQuoted(coercePropertyValue(props[key])) + "\"");
        }
      }
      propBindings.forEach(function serializeRemainingPropBinding(binding, key) {
        if (serializedPropBindings.has(key)) {
          return;
        }
        lines.push(serializeBindingAssignment(key, binding, indentLevel + 1));
      });

      if (typeof node.textContent === "string" && node.textContent.length > 0) {
        lines.push(serializeTextBlock("text", node.textContent, indentLevel + 1));
      }

      const serializedSlotNodes = Array.isArray(node.slots)
        ? node.slots
        : Array.isArray(node.__qhtmlSlotNodes)
          ? node.__qhtmlSlotNodes
          : [];
      if (serializedSlotNodes.length > 0) {
        for (let i = 0; i < serializedSlotNodes.length; i += 1) {
          const slotNode = serializedSlotNodes[i];
          if (!slotNode || slotNode.kind !== core.NODE_TYPES.slot) {
            continue;
          }
          const slotName = String(slotNode.name || "default").trim() || "default";
          if (slotName === "default") {
            const slotChildren = Array.isArray(slotNode.children) ? slotNode.children : [];
            for (let j = 0; j < slotChildren.length; j += 1) {
              lines.push(serializeNode(slotChildren[j], indentLevel + 1));
            }
            continue;
          }
          lines.push(serializeSlotNode(slotNode, indentLevel + 1));
        }
      } else if (Array.isArray(node.children)) {
        for (let i = 0; i < node.children.length; i += 1) {
          lines.push(serializeNode(node.children[i], indentLevel + 1));
        }
      }

      if (Array.isArray(node.lifecycleScripts)) {
        for (let i = 0; i < node.lifecycleScripts.length; i += 1) {
          const hook = node.lifecycleScripts[i] || {};
          lines.push(serializeScriptBlock(hook.name, hook.body, indentLevel + 1));
        }
      }

      lines.push(indent + "}");
      return lines.join("\n");
    }

    if (node.kind !== core.NODE_TYPES.element) {
      return "";
    }

    const chain = Array.isArray(node.selectorChain) && node.selectorChain.length > 0 ? node.selectorChain : [node.tagName];
    const selectorText = node.selectorMode === "class-shorthand" ? chain.join(",") : chain[0];

    const lines = [indent + selectorText + " {"];

    const textBindings = collectNodeBindingsByTarget(node, "textcontent");
    const contentBinding = textBindings.get("content") || textBindings.get("text") || null;
    if (contentBinding) {
      lines.push(serializeBindingAssignment("content", contentBinding, indentLevel + 1));
    } else if (typeof node.textContent === "string") {
      lines.push(indent + "  content: \"" + escapeQuoted(node.textContent) + "\"");
    }

    const attrs = node.attributes || {};
    const attrBindings = collectNodeBindingsByTarget(node, "attributes");
    const attrKeys = Object.keys(attrs);
    const serializedAttrBindings = new Set();
    for (let i = 0; i < attrKeys.length; i += 1) {
      const key = attrKeys[i];
      const binding = attrBindings.get(key);
      if (binding) {
        lines.push(serializeBindingAssignment(key, binding, indentLevel + 1));
        serializedAttrBindings.add(key);
      } else {
        lines.push(indent + "  " + key + ": \"" + escapeQuoted(coercePropertyValue(attrs[key])) + "\"");
      }
    }
    attrBindings.forEach(function serializeRemainingAttrBinding(binding, key) {
      if (serializedAttrBindings.has(key)) {
        return;
      }
      lines.push(serializeBindingAssignment(key, binding, indentLevel + 1));
    });

    if (Array.isArray(node.lifecycleScripts)) {
      for (let i = 0; i < node.lifecycleScripts.length; i += 1) {
        const hook = node.lifecycleScripts[i] || {};
        lines.push(serializeScriptBlock(hook.name, hook.body, indentLevel + 1));
      }
    }

    if (Array.isArray(node.children)) {
      for (let i = 0; i < node.children.length; i += 1) {
        lines.push(serializeNode(node.children[i], indentLevel + 1));
      }
    }

    lines.push(indent + "}");
    return lines.join("\n");
  }

  function qdomToQHtml(documentNode, options) {
    const opts = options || {};
    const preserve = opts.preserveOriginal !== false;

    if (preserve && documentNode && documentNode.meta && !documentNode.meta.dirty && typeof documentNode.meta.source === "string") {
      return documentNode.meta.source;
    }

    const lines = [];
    const nodes = documentNode && Array.isArray(documentNode.nodes) ? documentNode.nodes : [];
    for (let i = 0; i < nodes.length; i += 1) {
      lines.push(serializeNode(nodes[i], 0));
    }
    const lifecycleScripts =
      documentNode &&
      documentNode.meta &&
      Array.isArray(documentNode.meta.lifecycleScripts)
        ? documentNode.meta.lifecycleScripts
        : [];
    for (let i = 0; i < lifecycleScripts.length; i += 1) {
      const hook = lifecycleScripts[i] || {};
      lines.push(serializeScriptBlock(hook.name, hook.body, 0));
    }
    return lines.join("\n\n");
  }

  function parseQScript(source) {
    const parser = parserFor(source);
    const rules = [];

    while (!eof(parser)) {
      skipWhitespaceAndSemicolons(parser);
      if (eof(parser)) {
        break;
      }

      const start = parser.index;
      const onIndex = parser.source.indexOf(".on(", parser.index);
      if (onIndex === -1) {
        throw ParseError("Expected '.on(' in q-script rule", parser.index);
      }

      const selector = parser.source.slice(parser.index, onIndex).trim();
      parser.index = onIndex + 4;

      skipWhitespace(parser);
      const quote = peek(parser);
      if (quote !== '"' && quote !== "'") {
        throw ParseError("Expected quoted event name", parser.index);
      }
      consume(parser);

      const eventStart = parser.index;
      while (!eof(parser) && peek(parser) !== quote) {
        if (peek(parser) === "\\") {
          parser.index += 2;
          continue;
        }
        parser.index += 1;
      }
      if (eof(parser)) {
        throw ParseError("Unterminated event name", parser.index);
      }
      const eventName = parser.source.slice(eventStart, parser.index);
      consume(parser);

      skipWhitespace(parser);
      expect(parser, ")");
      skipWhitespace(parser);
      expect(parser, ":");
      skipWhitespace(parser);
      expect(parser, "{");
      const body = readBalancedBlockContent(parser);

      const raw = parser.source.slice(start, parser.index);
      rules.push(
        core.createScriptRule({
          selector: selector,
          eventName: eventName,
          body: body.trim(),
          meta: {
            originalSource: raw,
            sourceRange: [start, parser.index],
          },
        })
      );
    }

    return rules;
  }

  function serializeQScript(rules) {
    if (!Array.isArray(rules) || rules.length === 0) {
      return "";
    }

    const lines = [];
    for (let i = 0; i < rules.length; i += 1) {
      const rule = rules[i];
      if (rule.meta && rule.meta.originalSource && !rule.meta.dirty) {
        lines.push(rule.meta.originalSource);
        continue;
      }
      lines.push(
        rule.selector +
          '.on("' +
          escapeQuoted(rule.eventName) +
          '"): {' +
          (rule.body ? "\n" + rule.body + "\n" : "") +
          "}"
      );
    }
    return lines.join("\n");
  }

  modules.qhtmlParser = {
    KNOWN_HTML_TAGS: KNOWN_HTML_TAGS,
    parseQHtmlToAst: parseQHtmlToAst,
    parseQHtmlToQDom: parseQHtmlToQDom,
    applyQMacroBlocks: applyQMacroBlocks,
    applyQRewriteBlocks: applyQRewriteBlocks,
    resolveQImportsSync: resolveQImportsSync,
    resolveQImportsAsync: resolveQImportsAsync,
    qdomToQHtml: qdomToQHtml,
    parseQScript: parseQScript,
    serializeQScript: serializeQScript,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);

/*** END: modules/qhtml-parser/src/qhtml-parser.js ***/

/*** BEGIN: modules/dom-renderer/src/dom-renderer.js ***/
(function attachDomRenderer(global) {
  const modules = global.QHtmlModules || (global.QHtmlModules = {});
  const core = modules.qdomCore;
  const RENDER_SLOT_REF = typeof Symbol === "function" ? Symbol("qhtml.render.slotRef") : "__qhtmlRenderSlotRef__";

  if (!core) {
    throw new Error("dom-renderer requires qdom-core to be loaded first.");
  }

  const INVALID_METHOD_NAMES = new Set(["constructor", "prototype", "__proto__"]);
  const QHTML_CONTENT_LOADED_EVENT = "QHTMLContentLoaded";
  const INLINE_REFERENCE_PATTERN = /\$\{\s*([^}]+?)\s*\}/g;
  const INLINE_REFERENCE_ESCAPE_TOKEN = "__QHTML_ESCAPED_INLINE_REF__";
  const WASM_DEFAULT_TIMEOUT_MS = 15000;
  const WASM_DEFAULT_MAX_PAYLOAD_BYTES = 1024 * 1024;
  let qdomInstanceCounter = 0;
  const qdomInstanceIds = new WeakMap();
  const qdomSlotOwnerIds = new WeakMap();
  let wasmWorkerScriptUrl = null;
  let wasmCallSequence = 0;

  function cloneNodeDeep(node) {
    if (!node || typeof node !== "object") {
      return node;
    }
    if (Array.isArray(node)) {
      return node.map(cloneNodeDeep);
    }
    const out = {};
    const keys = Object.keys(node);
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      out[key] = cloneNodeDeep(node[key]);
    }
    const sourceNode =
      node && typeof node === "object" && node.__qhtmlSourceNode && typeof node.__qhtmlSourceNode === "object"
        ? node.__qhtmlSourceNode
        : node;
    try {
      Object.defineProperty(out, "__qhtmlSourceNode", {
        value: sourceNode,
        configurable: true,
        writable: true,
        enumerable: false,
      });
    } catch (error) {
      out.__qhtmlSourceNode = sourceNode;
    }
    return out;
  }

  function normalizeCssPropertyName(rawProperty) {
    const value = String(rawProperty || "").trim();
    if (!value) {
      return "";
    }
    if (value.indexOf("-") !== -1) {
      return value.toLowerCase();
    }
    return value.replace(/[A-Z]/g, function toDash(letter) {
      return "-" + letter.toLowerCase();
    });
  }

  function getRuntimeThemeRules(instanceNode) {
    const meta = instanceNode && instanceNode.meta && typeof instanceNode.meta === "object" ? instanceNode.meta : null;
    if (!meta || !meta.qRuntimeThemeRules || typeof meta.qRuntimeThemeRules !== "object") {
      return null;
    }
    return meta.qRuntimeThemeRules;
  }

  function collectSelectorTargets(rootElement, selector) {
    const out = [];
    if (!rootElement || !selector) {
      return out;
    }
    try {
      if (typeof rootElement.matches === "function" && rootElement.matches(selector)) {
        out.push(rootElement);
      }
    } catch (error) {
      return out;
    }
    if (typeof rootElement.querySelectorAll !== "function") {
      return out;
    }
    try {
      const list = rootElement.querySelectorAll(selector);
      for (let i = 0; i < list.length; i += 1) {
        out.push(list[i]);
      }
    } catch (error) {
      return out;
    }
    return out;
  }

  function applyRuntimeThemeRuleToElement(element, rule) {
    if (!element || !rule || typeof rule !== "object") {
      return;
    }
    const classes = Array.isArray(rule.classes) ? rule.classes : [];
    for (let i = 0; i < classes.length; i += 1) {
      const className = String(classes[i] || "").trim();
      if (!className || !element.classList || typeof element.classList.add !== "function") {
        continue;
      }
      element.classList.add(className);
    }
    const declarations =
      rule.declarations && typeof rule.declarations === "object" && !Array.isArray(rule.declarations)
        ? rule.declarations
        : {};
    const keys = Object.keys(declarations);
    for (let i = 0; i < keys.length; i += 1) {
      const rawProperty = String(keys[i] || "").trim();
      if (!rawProperty || !element.style || typeof element.style.setProperty !== "function") {
        continue;
      }
      const cssProperty = normalizeCssPropertyName(rawProperty);
      if (!cssProperty) {
        continue;
      }
      const cssValue = String(declarations[rawProperty] || "").trim();
      if (!cssValue) {
        continue;
      }
      element.style.setProperty(cssProperty, cssValue);
    }
  }

  function applyRuntimeThemeRulesToHost(hostElement, instanceNode) {
    const runtimeRules = getRuntimeThemeRules(instanceNode);
    if (!runtimeRules || !hostElement) {
      return;
    }
    const defaultRules = Array.isArray(runtimeRules.defaultRules) ? runtimeRules.defaultRules : [];
    const rules = Array.isArray(runtimeRules.rules) ? runtimeRules.rules : [];
    const ordered = defaultRules.concat(rules);
    for (let i = 0; i < ordered.length; i += 1) {
      const rule = ordered[i];
      const selector = String(rule && rule.selector || "").trim();
      if (!selector) {
        continue;
      }
      const targets = collectSelectorTargets(hostElement, selector);
      for (let ti = 0; ti < targets.length; ti += 1) {
        applyRuntimeThemeRuleToElement(targets[ti], rule);
      }
    }
  }

  function resolveWasmResourceUrl(src, hostElement) {
    const value = String(src || "").trim();
    if (!value) {
      return "";
    }
    const doc = hostElement && hostElement.ownerDocument ? hostElement.ownerDocument : global.document;
    const base = doc && typeof doc.baseURI === "string" ? doc.baseURI : String(global.location && global.location.href || "");
    try {
      return new URL(value, base || undefined).toString();
    } catch (error) {
      return value;
    }
  }

  function normalizeWasmConfig(rawConfig) {
    if (!rawConfig || typeof rawConfig !== "object" || Array.isArray(rawConfig)) {
      return null;
    }
    const src = String(rawConfig.src || "").trim();
    if (!src) {
      return null;
    }
    const modeRaw = String(rawConfig.mode || "").trim().toLowerCase();
    const mode =
      modeRaw === "main" || modeRaw === "main-thread" || modeRaw === "mainthread"
        ? "main"
        : modeRaw === "worker" || modeRaw === "worker-thread" || modeRaw === "workerthread"
          ? "worker"
          : "worker";
    const awaitWasm = rawConfig.awaitWasm === true;
    const timeoutMsRaw = Number(rawConfig.timeoutMs);
    const timeoutMs =
      Number.isFinite(timeoutMsRaw) && timeoutMsRaw > 0
        ? Math.max(1, Math.floor(timeoutMsRaw))
        : WASM_DEFAULT_TIMEOUT_MS;
    const maxPayloadRaw = Number(rawConfig.maxPayloadBytes);
    const maxPayloadBytes =
      Number.isFinite(maxPayloadRaw) && maxPayloadRaw > 0
        ? Math.max(1, Math.floor(maxPayloadRaw))
        : WASM_DEFAULT_MAX_PAYLOAD_BYTES;

    const exports = [];
    const exportNames = new Set();
    const exportList = Array.isArray(rawConfig.exports) ? rawConfig.exports : [];
    for (let i = 0; i < exportList.length; i += 1) {
      const name = String(exportList[i] || "").trim();
      const key = name.toLowerCase();
      if (!name || exportNames.has(key)) {
        continue;
      }
      exportNames.add(key);
      exports.push(name);
    }

    const allowImports = [];
    const allowImportSet = new Set();
    const importList = Array.isArray(rawConfig.allowImports) ? rawConfig.allowImports : [];
    for (let i = 0; i < importList.length; i += 1) {
      const name = String(importList[i] || "").trim();
      const key = name.toLowerCase();
      if (!name || allowImportSet.has(key)) {
        continue;
      }
      allowImportSet.add(key);
      allowImports.push(name);
    }

    const bind = [];
    const bindSet = new Set();
    const bindList = Array.isArray(rawConfig.bind) ? rawConfig.bind : [];
    for (let i = 0; i < bindList.length; i += 1) {
      const entry = bindList[i];
      if (!entry || typeof entry !== "object") {
        continue;
      }
      const exportName = String(entry.exportName || "").trim();
      const targetType = String(entry.targetType || "").trim().toLowerCase();
      const targetName = String(entry.targetName || "").trim();
      if (!exportName || !targetName || (targetType !== "method" && targetType !== "signal")) {
        continue;
      }
      const key = exportName.toLowerCase() + "::" + targetType + "::" + targetName.toLowerCase();
      if (bindSet.has(key)) {
        continue;
      }
      bindSet.add(key);
      bind.push({
        exportName: exportName,
        targetType: targetType,
        targetName: targetName,
      });
    }

    return {
      src: src,
      mode: mode,
      awaitWasm: awaitWasm,
      timeoutMs: timeoutMs,
      maxPayloadBytes: maxPayloadBytes,
      exports: exports,
      exportNames: exportNames,
      allowImports: allowImports,
      bind: bind,
    };
  }

  function buildWasmBindingMaps(bindEntries) {
    const methodBindings = [];
    const signalBindingsByExport = new Map();
    const list = Array.isArray(bindEntries) ? bindEntries : [];
    for (let i = 0; i < list.length; i += 1) {
      const entry = list[i];
      if (!entry || typeof entry !== "object") {
        continue;
      }
      const exportName = String(entry.exportName || "").trim();
      const exportKey = exportName.toLowerCase();
      const targetType = String(entry.targetType || "").trim().toLowerCase();
      const targetName = String(entry.targetName || "").trim();
      if (!exportName || !exportKey || !targetName) {
        continue;
      }
      if (targetType === "method") {
        methodBindings.push({
          exportName: exportName,
          exportKey: exportKey,
          targetName: targetName,
        });
        continue;
      }
      if (targetType === "signal") {
        if (!signalBindingsByExport.has(exportKey)) {
          signalBindingsByExport.set(exportKey, []);
        }
        signalBindingsByExport.get(exportKey).push(targetName);
      }
    }
    return {
      methodBindings: methodBindings,
      signalBindingsByExport: signalBindingsByExport,
    };
  }

  function resolveGlobalFunction(path) {
    const input = String(path || "").trim();
    if (!input) {
      return null;
    }
    if (typeof global[input] === "function") {
      return global[input];
    }
    const segments = input.split(".");
    let cursor = global;
    for (let i = 0; i < segments.length; i += 1) {
      const part = String(segments[i] || "").trim();
      if (!part || cursor == null) {
        return null;
      }
      cursor = cursor[part];
    }
    return typeof cursor === "function" ? cursor : null;
  }

  function buildWasmImports(allowedImportNames) {
    const imports = {
      env: {},
    };
    const names = Array.isArray(allowedImportNames) ? allowedImportNames : [];
    for (let i = 0; i < names.length; i += 1) {
      const name = String(names[i] || "").trim();
      if (!name) {
        continue;
      }
      const fn = resolveGlobalFunction(name);
      if (typeof fn !== "function") {
        continue;
      }
      imports.env[name] = function qhtmlWasmImportedFunctionProxy() {
        return fn.apply(global, arguments);
      };
    }
    return imports;
  }

  function normalizeWasmResult(rawValue) {
    if (typeof rawValue === "string") {
      const trimmed = rawValue.trim();
      if (!trimmed) {
        return "";
      }
      try {
        return JSON.parse(trimmed);
      } catch (error) {
        return rawValue;
      }
    }
    return rawValue;
  }

  function measureUtf8Bytes(input) {
    const text = String(input || "");
    if (typeof global.TextEncoder === "function") {
      try {
        return new global.TextEncoder().encode(text).length;
      } catch (error) {
        return text.length;
      }
    }
    return text.length;
  }

  function withWasmTimeout(promise, timeoutMs, label) {
    const timeout = Number(timeoutMs);
    if (!Number.isFinite(timeout) || timeout <= 0 || typeof global.setTimeout !== "function") {
      return promise;
    }
    return new Promise(function wrapTimeout(resolve, reject) {
      let settled = false;
      const timer = global.setTimeout(function onTimeout() {
        if (settled) {
          return;
        }
        settled = true;
        reject(new Error(String(label || "WASM operation") + " timed out after " + String(timeout) + "ms."));
      }, timeout);
      promise.then(
        function onResolve(value) {
          if (settled) {
            return;
          }
          settled = true;
          if (typeof global.clearTimeout === "function") {
            global.clearTimeout(timer);
          }
          resolve(value);
        },
        function onReject(error) {
          if (settled) {
            return;
          }
          settled = true;
          if (typeof global.clearTimeout === "function") {
            global.clearTimeout(timer);
          }
          reject(error);
        }
      );
    });
  }

  function createMainThreadWasmSession(config) {
    let instanceExports = null;
    const readyPromise = Promise.resolve().then(function loadWasmInMainThread() {
      if (!global.WebAssembly || typeof global.WebAssembly.instantiate !== "function") {
        throw new Error("WebAssembly is not available in this environment.");
      }
      if (typeof global.fetch !== "function") {
        throw new Error("fetch is not available for q-wasm loading.");
      }
      return global.fetch(config.src).then(function parseFetchResponse(response) {
        const status = Number(response && typeof response.status !== "undefined" ? response.status : 200);
        const ok = !!response && (response.ok === true || (status >= 200 && status < 300) || status === 0);
        if (!ok) {
          throw new Error("q-wasm load failed for '" + config.src + "' (status " + status + ").");
        }
        if (typeof response.arrayBuffer !== "function") {
          throw new Error("q-wasm load failed for '" + config.src + "': arrayBuffer() is unavailable.");
        }
        return response.arrayBuffer();
      }).then(function instantiate(buffer) {
        return global.WebAssembly.instantiate(buffer, buildWasmImports(config.allowImports));
      }).then(function onInstantiated(result) {
        const instance = result && result.instance ? result.instance : result;
        if (!instance || !instance.exports || typeof instance.exports !== "object") {
          throw new Error("q-wasm instantiate failed for '" + config.src + "': missing exports.");
        }
        instanceExports = instance.exports;
        return true;
      });
    });

    function invoke(exportName, payloadJson) {
      return withWasmTimeout(
        readyPromise.then(function invokeLoadedWasm() {
          const key = String(exportName || "").trim();
          const fn = instanceExports && typeof instanceExports[key] === "function" ? instanceExports[key] : null;
          if (!fn) {
            throw new Error("q-wasm export '" + key + "' is missing in " + config.src + ".");
          }
          let result;
          if (fn.length <= 0) {
            result = fn();
          } else if (fn.length === 1) {
            result = fn(payloadJson);
          } else {
            result = fn(payloadJson, String(payloadJson || "").length);
          }
          if (result && typeof result.then === "function") {
            return result;
          }
          return result;
        }),
        config.timeoutMs,
        "q-wasm call '" + String(exportName || "").trim() + "'"
      );
    }

    return {
      mode: "main",
      ready: withWasmTimeout(readyPromise, config.timeoutMs, "q-wasm init"),
      invoke: invoke,
      terminate: function terminateMainThreadWasmSession() {
        instanceExports = null;
      },
    };
  }

  function getOrCreateWasmWorkerScriptUrl() {
    if (wasmWorkerScriptUrl) {
      return wasmWorkerScriptUrl;
    }
    if (typeof global.URL === "undefined" || typeof global.URL.createObjectURL !== "function" || typeof global.Blob !== "function") {
      return "";
    }
    const source = [
      "let __qhtmlWasmExports = null;",
      "self.onmessage = async function(event){",
      "  const message = event && event.data ? event.data : {};",
      "  const type = String(message.type || '').trim();",
      "  try {",
      "    if (type === 'init') {",
      "      const config = message.config || {};",
      "      if (typeof fetch !== 'function') { throw new Error('fetch is unavailable in worker.'); }",
      "      if (!self.WebAssembly || typeof self.WebAssembly.instantiate !== 'function') { throw new Error('WebAssembly is unavailable in worker.'); }",
      "      const response = await fetch(String(config.src || ''));",
      "      const status = Number(typeof response.status !== 'undefined' ? response.status : 200);",
      "      const ok = response && (response.ok === true || (status >= 200 && status < 300) || status === 0);",
      "      if (!ok) { throw new Error(\"q-wasm load failed (status \" + status + \")\"); }",
      "      const bytes = await response.arrayBuffer();",
      "      const instantiated = await self.WebAssembly.instantiate(bytes, { env: {} });",
      "      const instance = instantiated && instantiated.instance ? instantiated.instance : instantiated;",
      "      __qhtmlWasmExports = instance && instance.exports ? instance.exports : null;",
      "      if (!__qhtmlWasmExports) { throw new Error('q-wasm instantiate produced no exports.'); }",
      "      self.postMessage({ type: 'ready' });",
      "      return;",
      "    }",
      "    if (type === 'terminate') {",
      "      __qhtmlWasmExports = null;",
      "      self.postMessage({ type: 'terminated' });",
      "      close();",
      "      return;",
      "    }",
      "    if (type === 'call') {",
      "      if (!__qhtmlWasmExports) { throw new Error('q-wasm session is not initialized.'); }",
      "      const id = message.id;",
      "      const exportName = String(message.exportName || '').trim();",
      "      const fn = __qhtmlWasmExports[exportName];",
      "      if (typeof fn !== 'function') { throw new Error(\"q-wasm export '\" + exportName + \"' is missing.\"); }",
      "      const payload = String(message.payload == null ? '' : message.payload);",
      "      let result;",
      "      if (fn.length <= 0) {",
      "        result = fn();",
      "      } else if (fn.length === 1) {",
      "        result = fn(payload);",
      "      } else {",
      "        result = fn(payload, payload.length);",
      "      }",
      "      if (result && typeof result.then === 'function') {",
      "        result = await result;",
      "      }",
      "      if (typeof result === 'bigint') {",
      "        result = String(result);",
      "      }",
      "      self.postMessage({ type: 'result', id: id, result: result });",
      "      return;",
      "    }",
      "  } catch (error) {",
      "    self.postMessage({ type: 'error', id: message.id, error: error && error.message ? error.message : String(error) });",
      "  }",
      "};",
    ].join("\n");
    wasmWorkerScriptUrl = global.URL.createObjectURL(
      new global.Blob([source], {
        type: "application/javascript",
      })
    );
    return wasmWorkerScriptUrl;
  }

  function createWorkerWasmSession(config) {
    if (typeof global.Worker !== "function") {
      throw new Error("Worker is not available for q-wasm.");
    }
    const scriptUrl = getOrCreateWasmWorkerScriptUrl();
    if (!scriptUrl) {
      throw new Error("Unable to initialize q-wasm worker script.");
    }
    const worker = new global.Worker(scriptUrl);
    const pending = new Map();
    let terminated = false;
    let readyResolve;
    let readyReject;
    const readyPromise = new Promise(function captureReady(resolve, reject) {
      readyResolve = resolve;
      readyReject = reject;
    });

    function rejectPending(errorMessage) {
      pending.forEach(function rejectEntry(entry) {
        if (!entry || typeof entry.reject !== "function") {
          return;
        }
        entry.reject(new Error(errorMessage));
      });
      pending.clear();
    }

    worker.onmessage = function onWorkerMessage(event) {
      const message = event && event.data ? event.data : {};
      const type = String(message.type || "").trim();
      if (type === "ready") {
        if (typeof readyResolve === "function") {
          readyResolve(true);
        }
        return;
      }
      if (type === "error") {
        const id = message.id;
        if (typeof id !== "undefined" && pending.has(id)) {
          const pendingEntry = pending.get(id);
          pending.delete(id);
          if (pendingEntry && typeof pendingEntry.reject === "function") {
            pendingEntry.reject(new Error(String(message.error || "q-wasm worker call failed.")));
          }
          return;
        }
        if (typeof readyReject === "function") {
          readyReject(new Error(String(message.error || "q-wasm worker init failed.")));
        }
        rejectPending(String(message.error || "q-wasm worker failure."));
        return;
      }
      if (type === "result") {
        const id = message.id;
        if (!pending.has(id)) {
          return;
        }
        const pendingEntry = pending.get(id);
        pending.delete(id);
        if (pendingEntry && typeof pendingEntry.resolve === "function") {
          pendingEntry.resolve(message.result);
        }
      }
    };

    worker.onerror = function onWorkerError(event) {
      const message = event && event.message ? event.message : "q-wasm worker crashed.";
      if (typeof readyReject === "function") {
        readyReject(new Error(String(message)));
      }
      rejectPending(String(message));
    };

    worker.postMessage({
      type: "init",
      config: {
        src: config.src,
      },
    });

    function invoke(exportName, payloadJson) {
      if (terminated) {
        return Promise.reject(new Error("q-wasm worker session is terminated."));
      }
      return withWasmTimeout(
        withWasmTimeout(readyPromise, config.timeoutMs, "q-wasm init").then(function callWorkerAfterReady() {
          wasmCallSequence += 1;
          const id = "qwasm-call-" + String(wasmCallSequence);
          return new Promise(function awaitWorkerResponse(resolve, reject) {
            pending.set(id, {
              resolve: resolve,
              reject: reject,
            });
            worker.postMessage({
              type: "call",
              id: id,
              exportName: String(exportName || "").trim(),
              payload: String(payloadJson == null ? "" : payloadJson),
            });
          });
        }),
        config.timeoutMs,
        "q-wasm call '" + String(exportName || "").trim() + "'"
      );
    }

    return {
      mode: "worker",
      ready: withWasmTimeout(readyPromise, config.timeoutMs, "q-wasm init"),
      invoke: invoke,
      terminate: function terminateWorkerWasmSession() {
        if (terminated) {
          return;
        }
        terminated = true;
        rejectPending("q-wasm worker session terminated.");
        try {
          worker.postMessage({
            type: "terminate",
          });
        } catch (error) {
          // no-op
        }
        if (typeof worker.terminate === "function") {
          worker.terminate();
        }
      },
    };
  }

  function createWasmSession(config) {
    const supportsWorker = typeof global.Worker === "function";
    if (config.mode === "worker" && supportsWorker && (!Array.isArray(config.allowImports) || config.allowImports.length === 0)) {
      return createWorkerWasmSession(config);
    }
    if (config.mode === "worker" && Array.isArray(config.allowImports) && config.allowImports.length > 0) {
      if (global.console && typeof global.console.warn === "function") {
        global.console.warn("qhtml q-wasm warning: allowImports requires main-thread mode; falling back to main.");
      }
    }
    return createMainThreadWasmSession(config);
  }

  function sourceNodeOf(node) {
    if (!node || typeof node !== "object") {
      return null;
    }
    return node.__qhtmlSourceNode && typeof node.__qhtmlSourceNode === "object" ? node.__qhtmlSourceNode : node;
  }

  function inferDefinitionType(definitionNode) {
    if (!definitionNode || typeof definitionNode !== "object") {
      return "component";
    }

    const explicit = String(definitionNode.definitionType || "").trim().toLowerCase();
    if (explicit === "component" || explicit === "template" || explicit === "signal") {
      return explicit;
    }

    const originalSource =
      definitionNode.meta && typeof definitionNode.meta.originalSource === "string"
        ? definitionNode.meta.originalSource.trim().toLowerCase()
        : "";
    if (originalSource.startsWith("q-template")) {
      return "template";
    }
    if (originalSource.startsWith("q-signal")) {
      return "signal";
    }

    return "component";
  }

  function collectComponentRegistry(documentNode) {
    const registry = new Map();
    if (!documentNode || !Array.isArray(documentNode.nodes)) {
      return registry;
    }

    for (let i = 0; i < documentNode.nodes.length; i += 1) {
      const node = documentNode.nodes[i];
      if (!node || node.kind !== core.NODE_TYPES.component) {
        continue;
      }
      const id = String(node.componentId || "").trim().toLowerCase();
      if (!id) {
        continue;
      }
      registry.set(id, node);
    }

    return registry;
  }

  function readRendererSlotNodes(node) {
    if (!node || typeof node !== "object") {
      return [];
    }
    if (Array.isArray(node.slots)) {
      return node.slots;
    }
    if (Array.isArray(node.__qhtmlSlotNodes)) {
      return node.__qhtmlSlotNodes;
    }
    return [];
  }

  function writeRendererSlotNodes(node, slots) {
    if (!node || typeof node !== "object") {
      return;
    }
    if (Array.isArray(node.slots)) {
      node.slots = slots;
      return;
    }
    try {
      Object.defineProperty(node, "__qhtmlSlotNodes", {
        value: slots,
        configurable: true,
        writable: true,
        enumerable: false,
      });
    } catch (error) {
      node.__qhtmlSlotNodes = slots;
    }
  }

  function collectSlotNames(nodes, intoSet) {
    const out = intoSet || new Set();
    const items = Array.isArray(nodes) ? nodes : [];

    for (let i = 0; i < items.length; i += 1) {
      const node = items[i];
      if (!node || typeof node !== "object") {
        continue;
      }

      if (node.kind === core.NODE_TYPES.element && String(node.tagName || "").toLowerCase() === "slot") {
        const slotName =
          node.attributes && typeof node.attributes.name === "string" && node.attributes.name.trim()
            ? String(node.attributes.name).trim()
            : "default";
        out.add(slotName);
      }

      if (Array.isArray(node.children)) {
        collectSlotNames(node.children, out);
      }
      const slotNodes = readRendererSlotNodes(node);
      if (slotNodes.length > 0) {
        collectSlotNames(slotNodes, out);
      }
      if (Array.isArray(node.templateNodes)) {
        collectSlotNames(node.templateNodes, out);
      }
    }

    return out;
  }

  function resolveSingleSlotName(definitionNode) {
    if (!definitionNode || !Array.isArray(definitionNode.templateNodes)) {
      return "";
    }

    const names = Array.from(collectSlotNames(definitionNode.templateNodes));
    if (names.length !== 1) {
      return "";
    }
    return names[0];
  }

  function escapeHtmlText(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function hasInlineReferenceExpressions(value) {
    return typeof value === "string" && value.indexOf("${") !== -1;
  }

  function resolveInlineExpressionScope(thisArg, extraScope) {
    const scope = Object.create(null);
    if (extraScope && typeof extraScope === "object") {
      const keys = Object.keys(extraScope);
      for (let i = 0; i < keys.length; i += 1) {
        scope[keys[i]] = extraScope[keys[i]];
      }
    }
    if (!Object.prototype.hasOwnProperty.call(scope, "window")) {
      scope.window = global;
    }
    if (!Object.prototype.hasOwnProperty.call(scope, "globalThis")) {
      scope.globalThis = global;
    }
    if (
      !Object.prototype.hasOwnProperty.call(scope, "document") &&
      thisArg &&
      typeof thisArg === "object" &&
      thisArg.ownerDocument
    ) {
      scope.document = thisArg.ownerDocument;
    }
    if ((typeof thisArg === "object" || typeof thisArg === "function") && thisArg) {
      scope.this = thisArg;
      if (!Object.prototype.hasOwnProperty.call(scope, "component")) {
        try {
          if (typeof thisArg.component !== "undefined" && thisArg.component !== null) {
            scope.component = thisArg.component;
          }
        } catch (ignoredReadComponent) {
          // no-op
        }
      }
    }
    if (scope.component && (typeof thisArg === "object" || typeof thisArg === "function") && thisArg) {
      try {
        if (typeof thisArg.component === "undefined" || thisArg.component === null) {
          thisArg.component = scope.component;
        }
      } catch (ignoredAssignComponent) {
        // no-op
      }
    }
    return scope;
  }

  function evaluateInlineReferenceExpression(expression, thisArg, scope, errorLabel) {
    const source = String(expression || "").trim();
    if (!source) {
      return "";
    }
    try {
      const evaluator = new Function("__qhtmlScope", "with(__qhtmlScope){ return (" + source + "); }");
      return evaluator.call(thisArg || scope, scope);
    } catch (error) {
      if (global.console && typeof global.console.error === "function") {
        global.console.error(errorLabel || "qhtml inline expression evaluation failed:", error);
      }
      return "";
    }
  }

  function interpolateInlineReferenceExpressions(source, thisArg, extraScope, errorLabel) {
    const text = String(source == null ? "" : source);
    if (!hasInlineReferenceExpressions(text)) {
      return text;
    }
    const escaped = text.replace(/\\\$\{/g, INLINE_REFERENCE_ESCAPE_TOKEN);
    const scope = resolveInlineExpressionScope(thisArg, extraScope);
    const replaced = escaped.replace(INLINE_REFERENCE_PATTERN, function replaceInlineReference(matchText, expressionText) {
      const value = evaluateInlineReferenceExpression(expressionText, thisArg, scope, errorLabel);
      if (value == null) {
        return "";
      }
      return String(value);
    });
    return replaced.split(INLINE_REFERENCE_ESCAPE_TOKEN).join("${");
  }

  function resolveComponentForInterpolation(context, fallbackNode) {
    const stack = context && Array.isArray(context.componentHostStack) ? context.componentHostStack : [];
    if (stack.length > 0) {
      return stack[stack.length - 1];
    }
    const node = fallbackNode && fallbackNode.nodeType === 1 ? fallbackNode : null;
    if (!node || typeof node.closest !== "function") {
      return null;
    }
    return node.closest("[qhtml-component-instance='1']");
  }

  function createTextFillNode(text) {
    return core.createRawHtmlNode({
      html: escapeHtmlText(text),
    });
  }

  function ensureInstanceId(node) {
    if (!node || typeof node !== "object") {
      return "";
    }
    if (qdomInstanceIds.has(node)) {
      return qdomInstanceIds.get(node) || "";
    }
    const existing =
      typeof node.instanceId === "string" && node.instanceId.trim()
        ? node.instanceId.trim()
        : typeof node.__qhtmlInstanceId === "string" && node.__qhtmlInstanceId.trim()
          ? node.__qhtmlInstanceId.trim()
          : "";
    if (existing) {
      qdomInstanceIds.set(node, existing);
      return existing;
    }

    qdomInstanceCounter += 1;
    const generated = "qdom-instance-" + String(qdomInstanceCounter);
    qdomInstanceIds.set(node, generated);
    return generated;
  }

  function applySlotOwnership(slotNode, ownerId, ownerType, ownerInstanceId) {
    if (!slotNode || typeof slotNode !== "object") {
      return;
    }
    if (ownerInstanceId) {
      qdomSlotOwnerIds.set(slotNode, ownerInstanceId);
    }
  }

  function shouldUnwrapSlotWrapper(node, slotName) {
    if (!node || node.kind !== core.NODE_TYPES.element) {
      return false;
    }
    const expectedName = String(slotName || "default").trim().toLowerCase();
    const actualName = String(node.tagName || "").trim().toLowerCase();
    if (!expectedName || actualName !== expectedName) {
      return false;
    }
    const attrs = node.attributes && typeof node.attributes === "object" ? node.attributes : null;
    if (!attrs) {
      return true;
    }
    const keys = Object.keys(attrs);
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      const value = attrs[key];
      if (value !== null && typeof value !== "undefined" && String(value).trim() !== "") {
        return false;
      }
    }
    return true;
  }

  function collectNormalizedSlotChildren(slotName, inputNode, into) {
    const out = Array.isArray(into) ? into : [];
    if (!inputNode || typeof inputNode !== "object") {
      return out;
    }

    if (shouldUnwrapSlotWrapper(inputNode, slotName)) {
      const nested = Array.isArray(inputNode.children) ? inputNode.children : [];
      if (nested.length > 0) {
        for (let i = 0; i < nested.length; i += 1) {
          collectNormalizedSlotChildren(slotName, nested[i], out);
        }
      } else if (typeof inputNode.textContent === "string" && inputNode.textContent.length > 0) {
        out.push(createTextFillNode(inputNode.textContent));
      }
      return out;
    }

    out.push(inputNode);
    return out;
  }

  function splitSlotFills(instanceNode, options) {
    const opts = options || {};
    const singleSlotName = String(opts.singleSlotName || "").trim();
    const knownSlotsRaw = opts.slotNames instanceof Set ? opts.slotNames : new Set();
    const knownSlotsExact = new Set();
    const knownSlotsLower = new Set();
    knownSlotsRaw.forEach(function eachSlotName(name) {
      const value = String(name || "").trim();
      if (!value) {
        return;
      }
      knownSlotsExact.add(value);
      knownSlotsLower.add(value.toLowerCase());
    });
    const ownerId = String(opts.ownerComponentId || "").trim().toLowerCase();
    const ownerType = String(opts.ownerDefinitionType || "component").trim().toLowerCase() || "component";
    const ownerInstanceId = String(opts.ownerInstanceId || "").trim();
    const fills = new Map();
    const runtimeSlotRefs = new Map();

    function hasKnownSlotName(name) {
      const slotName = String(name || "").trim();
      if (!slotName) {
        return false;
      }
      if (knownSlotsExact.has(slotName)) {
        return true;
      }
      return knownSlotsLower.has(slotName.toLowerCase());
    }

    function createRuntimeSlotRef(slotName) {
      const key = String(slotName || "default").trim() || "default";
      const existing = runtimeSlotRefs.get(key);
      if (existing) {
        return existing;
      }
      let slotNode;
      if (core && typeof core.createSlotNode === "function") {
        slotNode = core.createSlotNode({
          name: key,
          children: [],
        });
      } else {
        slotNode = {
          kind: "slot",
          name: key,
          children: [],
          meta: {},
        };
      }
      slotNode.__qhtmlSyntheticSlotRef = true;
      applySlotOwnership(slotNode, ownerId, ownerType, ownerInstanceId);
      runtimeSlotRefs.set(key, slotNode);
      return slotNode;
    }

    function pushFill(slotName, value, sourceSlotNode, synthesizeSlotRef) {
      if (!value) {
        return;
      }
      const key = String(slotName || "default").trim() || "default";
      const resolvedSlotNode = sourceSlotNode || (synthesizeSlotRef ? createRuntimeSlotRef(key) : null);
      const bucket =
        fills.get(key) || {
          nodes: [],
          slotNode: resolvedSlotNode || null,
        };
      bucket.nodes.push(value);
      if (resolvedSlotNode && !bucket.slotNode) {
        bucket.slotNode = resolvedSlotNode;
      }
      fills.set(key, bucket);
    }

    if (typeof instanceNode.textContent === "string" && instanceNode.textContent.length > 0) {
      if (core.NODE_TYPES.text && typeof core.createTextNode === "function") {
        pushFill(
          singleSlotName || "default",
          core.createTextNode({
            value: instanceNode.textContent,
            meta: { generated: true },
          }),
          null,
          !!singleSlotName
        );
      } else {
        pushFill(singleSlotName || "default", createTextFillNode(instanceNode.textContent), null, !!singleSlotName);
      }
    }

    const children = Array.isArray(instanceNode.children) ? instanceNode.children : [];

    for (let i = 0; i < children.length; i += 1) {
      const child = children[i];
      if (!child || child.kind !== core.NODE_TYPES.element) {
        pushFill(singleSlotName || "default", child, null, !!singleSlotName);
        continue;
      }

      const explicitSlot = child.attributes && typeof child.attributes.slot === "string"
        ? String(child.attributes.slot).trim()
        : "";
      if (explicitSlot) {
        pushFill(explicitSlot, child, null, true);
        continue;
      }

      const shorthandSlot = String(child.tagName || "").trim();
      if (shorthandSlot && hasKnownSlotName(shorthandSlot)) {
        if (Array.isArray(child.children) && child.children.length > 0) {
          for (let j = 0; j < child.children.length; j += 1) {
            pushFill(shorthandSlot, child.children[j], null, true);
          }
        } else if (typeof child.textContent === "string" && child.textContent.length > 0) {
          pushFill(shorthandSlot, createTextFillNode(child.textContent), null, true);
        }
        continue;
      }

      if (singleSlotName) {
        pushFill(singleSlotName, child, null, true);
        continue;
      }

      // Legacy shorthand: `header { ... }` fills `slot { header }`.
      if (shorthandSlot) {
        if (Array.isArray(child.children) && child.children.length > 0) {
          for (let j = 0; j < child.children.length; j += 1) {
            pushFill(shorthandSlot, child.children[j], null, true);
          }
        } else if (typeof child.textContent === "string" && child.textContent.length > 0) {
          pushFill(shorthandSlot, createTextFillNode(child.textContent), null, true);
        }
        continue;
      }

      pushFill("default", child);
    }

    return fills;
  }

  function materializeSlots(nodes, slotFills) {
    const out = [];

    for (let i = 0; i < nodes.length; i += 1) {
      const node = nodes[i];
      if (!node || typeof node !== "object") {
        continue;
      }

      if (node.kind === core.NODE_TYPES.element && node.tagName === "slot") {
        const slotName = node.attributes && typeof node.attributes.name === "string" ? node.attributes.name : "default";
        const fillEntry = slotFills.get(slotName);
        const fillNodes = fillEntry && Array.isArray(fillEntry.nodes) ? fillEntry.nodes : [];
        if (fillNodes.length > 0) {
          for (let j = 0; j < fillNodes.length; j += 1) {
            const projected = cloneNodeDeep(fillNodes[j]);
            if (fillEntry && fillEntry.slotNode && projected && typeof projected === "object") {
              projected[RENDER_SLOT_REF] = fillEntry.slotNode;
            }
            out.push(projected);
          }
        } else if (Array.isArray(node.children) && node.children.length > 0) {
          const fallback = materializeSlots(node.children, slotFills);
          for (let j = 0; j < fallback.length; j += 1) {
            out.push(fallback[j]);
          }
        }
        continue;
      }

      const clone = cloneNodeDeep(node);
      if (clone.kind === core.NODE_TYPES.element && Array.isArray(clone.children) && clone.children.length > 0) {
        clone.children = materializeSlots(clone.children, slotFills);
      }
      if (
        (clone.kind === core.NODE_TYPES.componentInstance || clone.kind === core.NODE_TYPES.templateInstance) &&
        readRendererSlotNodes(clone).length > 0
      ) {
        const slotNodes = readRendererSlotNodes(clone);
        for (let j = 0; j < slotNodes.length; j += 1) {
          const slotNode = slotNodes[j];
          if (!slotNode || slotNode.kind !== core.NODE_TYPES.slot) {
            continue;
          }
          if (Array.isArray(slotNode.children) && slotNode.children.length > 0) {
            slotNode.children = materializeSlots(slotNode.children, slotFills);
          }
        }
        writeRendererSlotNodes(clone, slotNodes);
      }
      if (
        (clone.kind === core.NODE_TYPES.componentInstance || clone.kind === core.NODE_TYPES.templateInstance) &&
        Array.isArray(clone.children) &&
        clone.children.length > 0
      ) {
        clone.children = materializeSlots(clone.children, slotFills);
      }
      if (clone.kind === core.NODE_TYPES.slot && Array.isArray(clone.children) && clone.children.length > 0) {
        clone.children = materializeSlots(clone.children, slotFills);
      }
      out.push(clone);
    }

    return out;
  }

  function appendRawHtml(parent, html, targetDocument) {
    const template = targetDocument.createElement("template");
    template.innerHTML = html || "";
    parent.appendChild(template.content.cloneNode(true));
  }

  function isSlotDomElement(node) {
    return !!(node && node.nodeType === 1 && String(node.tagName || "").toLowerCase() === "slot");
  }

  function collectSlotDomElements(node, out) {
    if (!node || typeof node !== "object") {
      return;
    }
    const bucket = Array.isArray(out) ? out : [];
    if (isSlotDomElement(node)) {
      bucket.push(node);
    }

    const children = node && node.childNodes && typeof node.childNodes.length === "number" ? node.childNodes : [];
    for (let i = 0; i < children.length; i += 1) {
      collectSlotDomElements(children[i], bucket);
    }

    if (node.content && node.content.childNodes && typeof node.content.childNodes.length === "number") {
      const contentChildren = node.content.childNodes;
      for (let i = 0; i < contentChildren.length; i += 1) {
        collectSlotDomElements(contentChildren[i], bucket);
      }
    }
  }

  function stripRenderedSlotElements(rootNode) {
    if (!rootNode || typeof rootNode !== "object") {
      return;
    }

    const slots = [];
    collectSlotDomElements(rootNode, slots);
    for (let i = 0; i < slots.length; i += 1) {
      const slotNode = slots[i];
      if (!slotNode || !slotNode.parentNode || typeof slotNode.parentNode.insertBefore !== "function") {
        continue;
      }

      while (slotNode.firstChild) {
        slotNode.parentNode.insertBefore(slotNode.firstChild, slotNode);
      }
      if (typeof slotNode.parentNode.removeChild === "function") {
        slotNode.parentNode.removeChild(slotNode);
      }
    }
  }

  function setElementAttributes(element, attrs, options) {
    if (!attrs || typeof attrs !== "object") {
      return;
    }
    const opts = options || {};
    const interpolationScope = opts.scope && typeof opts.scope === "object" ? opts.scope : null;
    const interpolationThisArg = opts.thisArg || element || null;
    const keys = Object.keys(attrs);
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      const value = attrs[key];
      if (value === null || typeof value === "undefined") {
        continue;
      }
      let normalized = value;
      if (typeof normalized === "string" && hasInlineReferenceExpressions(normalized)) {
        normalized = interpolateInlineReferenceExpressions(
          normalized,
          interpolationThisArg,
          interpolationScope,
          "qhtml attribute interpolation failed:"
        );
      }
      element.setAttribute(key, String(normalized));
    }
  }

  function setElementProperties(element, props) {
    if (!props || typeof props !== "object") {
      return;
    }
    const keys = Object.keys(props);
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      if (!key) {
        continue;
      }
      try {
        element[key] = props[key];
      } catch (error) {
        if (global.console && typeof global.console.error === "function") {
          global.console.error("qhtml component property assignment failed:", key, error);
        }
      }
    }
  }

  function isOnReadyHook(hook) {
    const name = hook && typeof hook.name === "string" ? hook.name.trim().toLowerCase() : "";
    return name === "onready";
  }

  function runLifecycleHookNow(hook, thisArg, targetDocument, errorLabel) {
    if (!hook || typeof hook.body !== "string" || !hook.body.trim()) {
      return;
    }
    try {
      if (thisArg && thisArg.nodeType === 1) {
        let hasComponentContext = false;
        try {
          hasComponentContext = thisArg.component != null;
        } catch (ignoredReadComponentContext) {
          hasComponentContext = false;
        }
        if (!hasComponentContext) {
          let resolvedComponent = null;
          if (
            typeof thisArg.getAttribute === "function" &&
            thisArg.getAttribute("qhtml-component-instance") === "1"
          ) {
            resolvedComponent = thisArg;
          } else if (typeof thisArg.closest === "function") {
            resolvedComponent = thisArg.closest("[qhtml-component-instance='1']");
          }
          if (resolvedComponent) {
            try {
              thisArg.component = resolvedComponent;
            } catch (ignoredSetComponentContext) {
              // best effort only; lifecycle hooks still run even if assignment is blocked
            }
          }
        }
      }
      const hookBody = interpolateInlineReferenceExpressions(
        hook.body,
        thisArg || {},
        {
          component:
            thisArg && typeof thisArg === "object" && thisArg
              ? thisArg.component || null
              : null,
          document: targetDocument || (thisArg && thisArg.ownerDocument) || global.document || null,
        },
        "qhtml lifecycle interpolation failed:"
      );
      const fn = new Function("event", "document", hookBody);
      fn.call(thisArg, null, targetDocument);
    } catch (error) {
      if (global.console && typeof global.console.error === "function") {
        global.console.error(errorLabel, error);
      }
    }
  }

  function ensureReadyHookState(target) {
    if (!target || (typeof target !== "object" && typeof target !== "function")) {
      return null;
    }
    let store = target.__qhtmlReadyHookState;
    if (!store || typeof store !== "object") {
      store = {};
      try {
        Object.defineProperty(target, "__qhtmlReadyHookState", {
          value: store,
          configurable: true,
          writable: true,
          enumerable: false,
        });
      } catch (error) {
        target.__qhtmlReadyHookState = store;
      }
    }
    return store;
  }

  function runLifecycleHookMaybeDeferred(hook, thisArg, targetDocument, errorLabel) {
    if (!isOnReadyHook(hook)) {
      runLifecycleHookNow(hook, thisArg, targetDocument, errorLabel);
      return;
    }

    const doc = targetDocument || (thisArg && thisArg.ownerDocument) || global.document || null;
    const state = doc && doc.__qhtmlContentLoadedState && typeof doc.__qhtmlContentLoadedState === "object" ? doc.__qhtmlContentLoadedState : null;
    const runtimeManaged = !!(state && state.runtimeManaged);
    const alreadySignaled = !!(state && Number(state.sequence || 0) > 0 && Number(state.pending || 0) === 0);
    const readyStore = ensureReadyHookState(thisArg);
    const key = String(hook.name || "onready") + "::" + String(hook.body || "");
    if (readyStore && (readyStore[key] === "pending" || readyStore[key] === "done")) {
      return;
    }
    if (readyStore) {
      readyStore[key] = "pending";
    }

    const execute = function executeReadyHook() {
      if (readyStore && readyStore[key] === "done") {
        return;
      }
      if (readyStore) {
        readyStore[key] = "done";
      }
      runLifecycleHookNow(hook, thisArg, doc || targetDocument, errorLabel);
    };

    const deferExecute = function deferExecuteReadyHook() {
      if (typeof global.setTimeout === "function") {
        global.setTimeout(execute, 0);
      } else {
        execute();
      }
    };

    if (!runtimeManaged || alreadySignaled) {
      // Always defer onReady at least one tick so runtime accessors (like element.qdom())
      // can be attached after render and before hook execution.
      deferExecute();
      return;
    }

    if (!doc || typeof doc.addEventListener !== "function" || typeof doc.dispatchEvent !== "function") {
      deferExecute();
      return;
    }

    const handler = function onQHtmlContentLoaded(event) {
      if (typeof doc.removeEventListener === "function") {
        doc.removeEventListener(QHTML_CONTENT_LOADED_EVENT, handler);
      }
      execute();
    };
    doc.addEventListener(QHTML_CONTENT_LOADED_EVENT, handler);
  }

  function runLifecycleHooks(node, element, targetDocument) {
    if (!node || !Array.isArray(node.lifecycleScripts) || node.lifecycleScripts.length === 0) {
      return;
    }

    for (let i = 0; i < node.lifecycleScripts.length; i += 1) {
      const hook = node.lifecycleScripts[i];
      runLifecycleHookMaybeDeferred(hook, element, targetDocument, "qhtml lifecycle hook failed:");
    }
  }

  function runComponentLifecycleHooks(componentNode, hostElement, targetDocument) {
    if (!componentNode || !Array.isArray(componentNode.lifecycleScripts) || componentNode.lifecycleScripts.length === 0) {
      return;
    }

    const wasmConfig = normalizeWasmConfig(componentNode.wasmConfig);
    const awaitWasm = !!(wasmConfig && wasmConfig.awaitWasm === true);
    const wasmReadyPromise =
      awaitWasm &&
      hostElement &&
      hostElement.wasm &&
      hostElement.wasm.ready &&
      typeof hostElement.wasm.ready.then === "function"
        ? hostElement.wasm.ready
        : null;

    for (let i = 0; i < componentNode.lifecycleScripts.length; i += 1) {
      const hook = componentNode.lifecycleScripts[i];
      if (wasmReadyPromise && isOnReadyHook(hook)) {
        wasmReadyPromise
          .then(function deferOnReadyUntilWasmReady() {
            runLifecycleHookMaybeDeferred(hook, hostElement, targetDocument, "qhtml component lifecycle hook failed:");
          })
          .catch(function onWasmReadyError(error) {
            if (global.console && typeof global.console.error === "function") {
              global.console.error("qhtml q-wasm init failed before onReady:", error);
            }
            runLifecycleHookMaybeDeferred(hook, hostElement, targetDocument, "qhtml component lifecycle hook failed:");
          });
        continue;
      }
      runLifecycleHookMaybeDeferred(hook, hostElement, targetDocument, "qhtml component lifecycle hook failed:");
    }
  }

  function dispatchSignalPayload(target, signalName, payload) {
    if (!target || typeof target.dispatchEvent !== "function") {
      return;
    }
    try {
      if (typeof global.CustomEvent === "function") {
        target.dispatchEvent(
          new global.CustomEvent("q-signal", {
            detail: payload,
            bubbles: true,
            composed: true,
          })
        );
      } else {
        target.dispatchEvent({
          type: "q-signal",
          detail: payload,
        });
      }
    } catch (error) {
      if (global.console && typeof global.console.error === "function") {
        global.console.error("qhtml signal dispatch failed for '" + signalName + "':", error);
      }
    }

    if (!signalName) {
      return;
    }

    try {
      if (typeof global.CustomEvent === "function") {
        target.dispatchEvent(
          new global.CustomEvent(signalName, {
            detail: payload,
            bubbles: true,
            composed: true,
          })
        );
      } else {
        target.dispatchEvent({
          type: signalName,
          detail: payload,
        });
      }
    } catch (error) {
      if (global.console && typeof global.console.error === "function") {
        global.console.error("qhtml named signal dispatch failed for '" + signalName + "':", error);
      }
    }
  }

  function emitWasmMappedSignals(componentNode, hostElement, signalBindingsByExport, exportName, args, result) {
    const exportKey = String(exportName || "").trim().toLowerCase();
    if (!exportKey || !(signalBindingsByExport instanceof Map) || !signalBindingsByExport.has(exportKey)) {
      return;
    }
    const signalNames = signalBindingsByExport.get(exportKey) || [];
    const componentId = String(componentNode && (componentNode.componentId || hostElement.tagName) || "").trim().toLowerCase();
    for (let i = 0; i < signalNames.length; i += 1) {
      const signalName = String(signalNames[i] || "").trim();
      if (!signalName) {
        continue;
      }
      const payload = {
        type: "signal",
        signal: signalName,
        component: componentId,
        signalId: signalName,
        source: "wasm",
        exportName: String(exportName || ""),
        args: [result],
        params: {
          result: result,
          exportName: String(exportName || ""),
        },
        slots: {
          result: [result],
          exportName: [String(exportName || "")],
        },
        wasmArgs: Array.isArray(args) ? args.slice() : [],
      };
      dispatchSignalPayload(hostElement, signalName, payload);
    }
  }

  function emitWasmErrorSignal(componentNode, hostElement, exportName, error) {
    const signalName = "wasmError";
    const componentId = String(componentNode && (componentNode.componentId || hostElement.tagName) || "").trim().toLowerCase();
    const message =
      error && typeof error === "object" && typeof error.message === "string"
        ? error.message
        : String(error || "q-wasm call failed.");
    const payload = {
      type: "signal",
      signal: signalName,
      component: componentId,
      signalId: signalName,
      source: "wasm",
      exportName: String(exportName || ""),
      args: [message],
      params: {
        error: message,
        exportName: String(exportName || ""),
      },
      slots: {
        error: [message],
        exportName: [String(exportName || "")],
      },
    };
    dispatchSignalPayload(hostElement, signalName, payload);
  }

  function bindComponentWasm(componentNode, hostElement) {
    const normalized = normalizeWasmConfig(componentNode && componentNode.wasmConfig);
    if (!normalized || !hostElement || hostElement.nodeType !== 1) {
      return;
    }

    const existingRuntime = hostElement.__qhtmlWasmRuntime;
    if (existingRuntime && typeof existingRuntime.terminate === "function") {
      try {
        existingRuntime.terminate();
      } catch (error) {
        // no-op
      }
    }

    const config = Object.assign({}, normalized, {
      src: resolveWasmResourceUrl(normalized.src, hostElement),
    });
    const bindings = buildWasmBindingMaps(config.bind);
    const session = createWasmSession(config);
    const exportNames = config.exportNames instanceof Set ? config.exportNames : new Set();

    function serializePayload(payload) {
      const raw =
        typeof payload === "string"
          ? payload
          : payload == null
            ? ""
            : JSON.stringify(payload);
      const size = measureUtf8Bytes(raw);
      if (size > config.maxPayloadBytes) {
        throw new Error(
          "q-wasm payload exceeds maxPayloadBytes (" +
            String(size) +
            " > " +
            String(config.maxPayloadBytes) +
            ")."
        );
      }
      return String(raw);
    }

    const wasmApi = {
      mode: session.mode,
      ready: session.ready,
      call: function callWasmExport(exportName, payload, options) {
        const opts = options && typeof options === "object" ? options : {};
        const key = String(exportName || "").trim();
        const keyLower = key.toLowerCase();
        if (!key) {
          return Promise.reject(new Error("q-wasm call requires an export name."));
        }
        if (exportNames.size > 0 && !exportNames.has(keyLower)) {
          return Promise.reject(new Error("q-wasm export '" + key + "' is not declared in q-wasm exports."));
        }
        let payloadJson;
        try {
          payloadJson = serializePayload(payload);
        } catch (error) {
          emitWasmErrorSignal(componentNode, hostElement, key, error);
          return Promise.reject(error);
        }
        return session
          .invoke(key, payloadJson)
          .then(function onInvokeResult(rawResult) {
            const result = normalizeWasmResult(rawResult);
            if (opts.skipMappedSignals !== true) {
              emitWasmMappedSignals(componentNode, hostElement, bindings.signalBindingsByExport, key, [payload], result);
            }
            return result;
          })
          .catch(function onInvokeError(error) {
            emitWasmErrorSignal(componentNode, hostElement, key, error);
            throw error;
          });
      },
      terminate: function terminateWasmApi() {
        if (session && typeof session.terminate === "function") {
          session.terminate();
        }
      },
    };

    hostElement.wasm = wasmApi;
    hostElement.__qhtmlWasmRuntime = {
      session: session,
      terminate: wasmApi.terminate,
      config: config,
    };

    for (let i = 0; i < bindings.methodBindings.length; i += 1) {
      const entry = bindings.methodBindings[i] || {};
      const methodName = String(entry.targetName || "").trim();
      const exportName = String(entry.exportName || "").trim();
      if (!methodName || !exportName || INVALID_METHOD_NAMES.has(methodName)) {
        continue;
      }
      hostElement[methodName] = function createWasmBoundMethod(boundExportName) {
        return function wasmBoundMethodProxy(payload, options) {
          return this.wasm.call(boundExportName, payload, options);
        };
      }(exportName);
    }

    if (exportNames.has("init")) {
      wasmApi.ready = withWasmTimeout(
        wasmApi.ready.then(function callInitExportWhenReady() {
          return wasmApi.call("init", null, {
            skipMappedSignals: true,
          });
        }),
        config.timeoutMs,
        "q-wasm init"
      );
    }
  }

  function bindComponentMethods(componentNode, hostElement) {
    if (!componentNode || !hostElement) {
      return;
    }
    const componentAttributes = componentNode.attributes && typeof componentNode.attributes === "object"
      ? componentNode.attributes
      : {};
    const declaredProperties = Array.isArray(componentNode.properties)
      ? componentNode.properties.map(function mapDeclared(entry) { return String(entry || "").trim(); }).filter(Boolean)
      : [];
    for (let i = 0; i < declaredProperties.length; i += 1) {
      const propertyName = declaredProperties[i];
      if (!propertyName || INVALID_METHOD_NAMES.has(propertyName)) {
        continue;
      }
      const existingDescriptor = Object.getOwnPropertyDescriptor(hostElement, propertyName);
      if (existingDescriptor && existingDescriptor.configurable === false) {
        continue;
      }
      const storageKey = "__qhtmlDeclaredPropValue__" + propertyName;
      const bindingKey = "__qhtmlDeclaredPropBinding__" + propertyName;
      const hasInitialValue = Object.prototype.hasOwnProperty.call(hostElement, propertyName);
      const initialValue = hasInitialValue ? hostElement[propertyName] : undefined;
      const rawDefault = Object.prototype.hasOwnProperty.call(componentAttributes, propertyName)
        ? componentAttributes[propertyName]
        : undefined;
      let literalDefault = rawDefault;
      let compiledBinding = null;
      const bindingMatch = typeof rawDefault === "string" ? rawDefault.match(/^\s*q-(bind|script)\s*\{([\s\S]*)\}\s*$/i) : null;
      if (bindingMatch) {
        const bindingBody = String(bindingMatch[2] || "");
        compiledBinding = function declaredPropertyBindingProxy() {
          const interpolatedBody = interpolateInlineReferenceExpressions(
            bindingBody,
            this,
            { component: this },
            "qhtml declared property binding interpolation failed:"
          );
          try {
            const runtimeBinding = new Function(interpolatedBody);
            return runtimeBinding.call(this);
          } catch (error) {
            if (global.console && typeof global.console.error === "function") {
              global.console.error("qhtml declared property binding compile failed:", propertyName, error);
            }
            return null;
          }
        };
        literalDefault = undefined;
      }
      try {
        Object.defineProperty(hostElement, propertyName, {
          configurable: true,
          enumerable: true,
          get: function getDeclaredComponentProperty() {
            if (Object.prototype.hasOwnProperty.call(this, storageKey)) {
              return this[storageKey];
            }
            const bindingFn = this[bindingKey];
            if (typeof bindingFn === "function") {
              try {
                return bindingFn.call(this);
              } catch (error) {
                if (global.console && typeof global.console.error === "function") {
                  global.console.error("qhtml declared property binding failed:", propertyName, error);
                }
                return null;
              }
            }
            return literalDefault;
          },
          set: function setDeclaredComponentProperty(value) {
            this[storageKey] = value;
          },
        });
        if (compiledBinding) {
          hostElement[bindingKey] = compiledBinding;
        }
        if (hasInitialValue) {
          hostElement[propertyName] = initialValue;
        }
      } catch (error) {
        if (global.console && typeof global.console.error === "function") {
          global.console.error("qhtml declared property binding install failed:", propertyName, error);
        }
      }
    }

    const aliasDeclarations = Array.isArray(componentNode.aliasDeclarations) ? componentNode.aliasDeclarations : [];
    for (let i = 0; i < aliasDeclarations.length; i += 1) {
      const aliasDecl = aliasDeclarations[i] || {};
      const aliasName = String(aliasDecl.name || "").trim();
      if (!aliasName || INVALID_METHOD_NAMES.has(aliasName)) {
        continue;
      }
      const existingDescriptor = Object.getOwnPropertyDescriptor(hostElement, aliasName);
      if (existingDescriptor && existingDescriptor.configurable === false) {
        continue;
      }
      const aliasBody = String(aliasDecl.body || "");
      const aliasOverrideKey = "__qhtmlAliasOverride__" + aliasName;
      let compiledAlias = null;
      if (hasInlineReferenceExpressions(aliasBody)) {
        compiledAlias = function interpolatedAliasProxy() {
          const interpolatedBody = interpolateInlineReferenceExpressions(
            aliasBody,
            this,
            { component: this },
            "qhtml q-alias interpolation failed:"
          );
          try {
            const runtimeAlias = new Function(interpolatedBody);
            return runtimeAlias.call(this);
          } catch (error) {
            if (global.console && typeof global.console.error === "function") {
              global.console.error("qhtml q-alias compile failed:", aliasName, error);
            }
            return null;
          }
        };
      } else {
        try {
          compiledAlias = new Function(aliasBody);
        } catch (error) {
          if (global.console && typeof global.console.error === "function") {
            global.console.error("qhtml q-alias compile failed:", aliasName, error);
          }
          continue;
        }
      }
      try {
        Object.defineProperty(hostElement, aliasName, {
          configurable: true,
          enumerable: true,
          get: function getComponentAliasProperty() {
            if (Object.prototype.hasOwnProperty.call(this, aliasOverrideKey)) {
              return this[aliasOverrideKey];
            }
            try {
              return compiledAlias.call(this);
            } catch (error) {
              if (global.console && typeof global.console.error === "function") {
                global.console.error("qhtml q-alias evaluation failed:", aliasName, error);
              }
              return null;
            }
          },
          set: function setComponentAliasProperty(value) {
            this[aliasOverrideKey] = value;
          },
        });
      } catch (error) {
        if (global.console && typeof global.console.error === "function") {
          global.console.error("qhtml q-alias install failed:", aliasName, error);
        }
      }
    }

    const methods = Array.isArray(componentNode.methods) ? componentNode.methods : [];

    for (let i = 0; i < methods.length; i += 1) {
      const method = methods[i];
      const name = method && typeof method.name === "string" ? method.name.trim() : "";
      if (!name || INVALID_METHOD_NAMES.has(name)) {
        continue;
      }
      const params = method && typeof method.parameters === "string" ? method.parameters : "";
      const body = method && typeof method.body === "string" ? method.body : "";
      const hasInterpolatedBody = hasInlineReferenceExpressions(body);

      let compiled;
      if (!hasInterpolatedBody) {
        try {
          compiled = new Function(params, body);
        } catch (error) {
          if (global.console && typeof global.console.error === "function") {
            global.console.error("qhtml component method compile failed:", name, error);
          }
          continue;
        }
      }

      hostElement[name] = function componentMethodProxy() {
        if (hasInterpolatedBody) {
          const interpolatedBody = interpolateInlineReferenceExpressions(
            body,
            hostElement,
            { component: hostElement },
            "qhtml component method interpolation failed:"
          );
          try {
            const runtimeMethod = new Function(params, interpolatedBody);
            return runtimeMethod.apply(hostElement, arguments);
          } catch (error) {
            if (global.console && typeof global.console.error === "function") {
              global.console.error("qhtml component method compile failed:", name, error);
            }
            return undefined;
          }
        }
        return compiled.apply(hostElement, arguments);
      };
    }

    function buildConnectedSignalArgs(detail, parameterNames, fallbackEvent) {
      const payload = detail && typeof detail === "object" ? detail : {};
      const params = payload.params && typeof payload.params === "object" ? payload.params : null;
      const slots = payload.slots && typeof payload.slots === "object" ? payload.slots : null;
      if (Array.isArray(payload.args)) {
        return payload.args.slice();
      }
      if (params && parameterNames.length > 0) {
        const args = [];
        for (let i = 0; i < parameterNames.length; i += 1) {
          const key = parameterNames[i];
          args.push(Object.prototype.hasOwnProperty.call(params, key) ? params[key] : null);
        }
        return args;
      }
      if (slots && parameterNames.length > 0) {
        const args = [];
        for (let i = 0; i < parameterNames.length; i += 1) {
          const key = parameterNames[i];
          const list = slots[key];
          args.push(Array.isArray(list) && list.length > 0 ? list[0] : null);
        }
        return args;
      }
      if (slots) {
        const keys = Object.keys(slots);
        const args = [];
        for (let i = 0; i < keys.length; i += 1) {
          const list = slots[keys[i]];
          args.push(Array.isArray(list) && list.length > 0 ? list[0] : null);
        }
        return args;
      }
      return [fallbackEvent];
    }

    function createComponentSignalEmitter(signalName, parameterNames) {
      const connectionMap = new Map();
      const componentId = String(componentNode.componentId || hostElement.tagName || "").trim().toLowerCase();
      const signalFn = function componentSignalProxy() {
        const args = Array.prototype.slice.call(arguments);
        const payloadSlots = {};
        const payloadSlotQDom = {};
        const payloadParams = {};
        for (let j = 0; j < parameterNames.length; j += 1) {
          const paramName = parameterNames[j];
          const value = j < args.length ? args[j] : null;
          payloadParams[paramName] = value;
          payloadSlots[paramName] = [serializeSignalSlotValue(value)];
          payloadSlotQDom[paramName] = [cloneNodeDeep(value)];
        }
        const payload = {
          type: "signal",
          signal: signalName,
          component: componentId,
          signalId: signalName,
          source: null,
          args: args.map(serializeSignalSlotValue),
          params: payloadParams,
          slots: payloadSlots,
          slotQDom: payloadSlotQDom,
        };
        dispatchSignalPayload(hostElement, signalName, payload);
        return payload;
      };

      signalFn.connect = function connectSignalHandler(handler) {
        if (typeof handler !== "function") {
          return null;
        }
        if (connectionMap.has(handler)) {
          return handler;
        }
        const wrapped = function onConnectedSignal(event) {
          const detail = event && event.detail ? event.detail : {};
          const args = buildConnectedSignalArgs(detail, parameterNames, event);
          return handler.apply(hostElement, args);
        };
        connectionMap.set(handler, wrapped);
        if (typeof hostElement.addEventListener === "function") {
          hostElement.addEventListener(signalName, wrapped);
        }
        return handler;
      };

      signalFn.disconnect = function disconnectSignalHandler(handler) {
        if (!handler) {
          connectionMap.forEach(function eachWrapped(wrapped) {
            if (typeof hostElement.removeEventListener === "function") {
              hostElement.removeEventListener(signalName, wrapped);
            }
          });
          connectionMap.clear();
          return true;
        }
        if (typeof handler !== "function") {
          return false;
        }
        const wrapped = connectionMap.get(handler);
        if (!wrapped) {
          return false;
        }
        if (typeof hostElement.removeEventListener === "function") {
          hostElement.removeEventListener(signalName, wrapped);
        }
        connectionMap.delete(handler);
        return true;
      };

      signalFn.emit = function emitSignalProxy() {
        return signalFn.apply(hostElement, arguments);
      };

      return signalFn;
    }

    const signalDeclarations = Array.isArray(componentNode.signalDeclarations) ? componentNode.signalDeclarations : [];
    for (let i = 0; i < signalDeclarations.length; i += 1) {
      const signalDecl = signalDeclarations[i] || {};
      const signalName = String(signalDecl.name || "").trim();
      if (!signalName || INVALID_METHOD_NAMES.has(signalName) || typeof hostElement[signalName] === "function") {
        continue;
      }
      const parameterNames = Array.isArray(signalDecl.parameters)
        ? signalDecl.parameters.map(function mapName(entry) { return String(entry || "").trim(); }).filter(Boolean)
        : [];
      hostElement[signalName] = createComponentSignalEmitter(signalName, parameterNames);
    }

    bindComponentWasm(componentNode, hostElement);
  }

  function renderNode(node, parent, targetDocument, context) {
    if (!node || typeof node !== "object") {
      return;
    }
    const slotRef = node[RENDER_SLOT_REF] || null;
    if (slotRef) {
      context.slotStack.push(slotRef);
    }

    try {
      if (node.kind === core.NODE_TYPES.rawHtml) {
        appendRawHtml(parent, node.html, targetDocument);
        return;
      }

      if (core.NODE_TYPES.text && node.kind === core.NODE_TYPES.text) {
        let textValue = String(node.value || "");
        if (hasInlineReferenceExpressions(textValue)) {
          textValue = interpolateInlineReferenceExpressions(
            textValue,
            parent && parent.nodeType === 1 ? parent : null,
            {
              component: resolveComponentForInterpolation(context, parent),
            },
            "qhtml text interpolation failed:"
          );
        }
        parent.appendChild(targetDocument.createTextNode(textValue));
        return;
      }

      if (node.kind === core.NODE_TYPES.component) {
        return;
      }

      if (node.kind === core.NODE_TYPES.componentInstance || node.kind === core.NODE_TYPES.templateInstance) {
        const registry = context.componentRegistry;
        const key = String(node.componentId || node.tagName || "").toLowerCase();
        const component = registry.get(key);
        if (component) {
          renderComponentInstance(component, node, parent, targetDocument, context);
          return;
        }
      }

      if (node.kind !== core.NODE_TYPES.element) {
        return;
      }

      const tagName = String(node.tagName || "div").toLowerCase();
      const registry = context.componentRegistry;
      const component = registry.get(tagName);

      if (component) {
        renderComponentInstance(component, node, parent, targetDocument, context);
        return;
      }

      const element = targetDocument.createElement(tagName);
      const interpolationComponent = resolveComponentForInterpolation(context, parent);
      setElementAttributes(element, node.attributes, {
        thisArg: element,
        scope: {
          component: interpolationComponent,
        },
      });
      parent.appendChild(element);

      if (context.capture) {
        if (context.capture.nodeMap) {
          context.capture.nodeMap.set(element, node);
        }
        if (context.capture.componentMap && context.componentHostStack.length > 0) {
          context.capture.componentMap.set(element, context.componentHostStack[context.componentHostStack.length - 1]);
        }
        if (context.capture.slotMap && context.slotStack.length > 0) {
          context.capture.slotMap.set(element, context.slotStack[context.slotStack.length - 1]);
        }
      }

      if (typeof node.textContent === "string" && node.textContent.length > 0) {
        let textContent = node.textContent;
        if (hasInlineReferenceExpressions(textContent)) {
          textContent = interpolateInlineReferenceExpressions(
            textContent,
            element,
            {
              component: interpolationComponent,
            },
            "qhtml text interpolation failed:"
          );
        }
        element.appendChild(targetDocument.createTextNode(textContent));
      }

      if (Array.isArray(node.children)) {
        for (let i = 0; i < node.children.length; i += 1) {
          renderNode(node.children[i], element, targetDocument, context);
        }
      }
      if (!context.disableLifecycleHooks) {
        runLifecycleHooks(node, element, targetDocument);
      }
    } finally {
      if (slotRef) {
        context.slotStack.pop();
      }
    }
  }

  function renderComponentTemplateInstance(componentNode, instanceNode, parent, targetDocument, context) {
    const stack = context.componentStack;
    const key = String(componentNode.componentId || "").toLowerCase();
    if (stack.indexOf(key) !== -1) {
      throw new Error("Recursive q-component usage detected for '" + key + "'.");
    }

    const templateNodes = Array.isArray(componentNode.templateNodes) ? componentNode.templateNodes : [];
    const singleSlotName = resolveSingleSlotName(componentNode);
    const slotNames = collectSlotNames(templateNodes);
    const ownerInstanceId = ensureInstanceId(instanceNode);
    const slotFills = splitSlotFills(instanceNode, {
      singleSlotName: singleSlotName,
      slotNames: slotNames,
      ownerComponentId: String(componentNode.componentId || "").trim().toLowerCase(),
      ownerDefinitionType: inferDefinitionType(componentNode),
      ownerInstanceId: ownerInstanceId,
    });
    const expanded = materializeSlots(templateNodes, slotFills);

    stack.push(key);
    try {
      for (let i = 0; i < expanded.length; i += 1) {
        renderNode(expanded[i], parent, targetDocument, context);
      }
    } finally {
      stack.pop();
    }
  }

  function renderComponentContentIntoHost(componentNode, instanceNode, hostElement, targetDocument, context) {
    const persistRenderTree = !!(instanceNode && instanceNode.__qhtmlPersistRenderTree);
    let expanded = persistRenderTree && Array.isArray(instanceNode.__qhtmlRenderTree) ? instanceNode.__qhtmlRenderTree : null;
    if (!expanded) {
      const templateNodes = Array.isArray(componentNode.templateNodes) ? componentNode.templateNodes : [];
      const singleSlotName = resolveSingleSlotName(componentNode);
      const slotNames = collectSlotNames(templateNodes);
      const ownerInstanceId = ensureInstanceId(instanceNode);
      const slotFills = splitSlotFills(instanceNode, {
        singleSlotName: singleSlotName,
        slotNames: slotNames,
        ownerComponentId: String(componentNode.componentId || "").trim().toLowerCase(),
        ownerDefinitionType: inferDefinitionType(componentNode),
        ownerInstanceId: ownerInstanceId,
      });
      expanded = materializeSlots(templateNodes, slotFills);
      const propertyDefinitions = Array.isArray(componentNode.propertyDefinitions) ? componentNode.propertyDefinitions : [];
      if (propertyDefinitions.length > 0) {
        const propertyNodes = [];
        for (let pi = 0; pi < propertyDefinitions.length; pi += 1) {
          const entry = propertyDefinitions[pi];
          const nodes = entry && Array.isArray(entry.nodes) ? entry.nodes : [];
          for (let ni = 0; ni < nodes.length; ni += 1) {
            propertyNodes.push(nodes[ni]);
          }
        }
        if (propertyNodes.length > 0) {
          expanded = expanded.concat(propertyNodes);
        }
      }
      if (persistRenderTree) {
        try {
          Object.defineProperty(instanceNode, "__qhtmlRenderTree", {
            value: expanded,
            configurable: true,
            writable: true,
            enumerable: false,
          });
        } catch (error) {
          instanceNode.__qhtmlRenderTree = expanded;
        }
      }
    }

    while (hostElement.firstChild) {
      hostElement.removeChild(hostElement.firstChild);
    }

    for (let i = 0; i < expanded.length; i += 1) {
      renderNode(expanded[i], hostElement, targetDocument, context);
    }
  }

  function bindDeclaredComponentPropertyNodes(componentNode, hostElement, context) {
    if (!componentNode || !hostElement) {
      return;
    }
    const propertyDefinitions = Array.isArray(componentNode.propertyDefinitions) ? componentNode.propertyDefinitions : [];
    if (propertyDefinitions.length === 0) {
      return;
    }
    const nodeMap =
      context &&
      context.capture &&
      context.capture.nodeMap &&
      typeof context.capture.nodeMap.get === "function"
        ? context.capture.nodeMap
        : null;
    const resolvedByName = {};
    for (let i = 0; i < propertyDefinitions.length; i += 1) {
      const entry = propertyDefinitions[i] || {};
      const propertyName = String(entry.name || "").trim();
      if (!propertyName || Object.prototype.hasOwnProperty.call(resolvedByName, propertyName)) {
        continue;
      }
      resolvedByName[propertyName] = null;
    }
    const propertyNames = Object.keys(resolvedByName);
    if (propertyNames.length === 0 || !nodeMap) {
      for (let i = 0; i < propertyNames.length; i += 1) {
        hostElement[propertyNames[i]] = null;
      }
      return;
    }

    const candidates = [hostElement];
    if (typeof hostElement.querySelectorAll === "function") {
      const descendants = hostElement.querySelectorAll("*");
      for (let i = 0; i < descendants.length; i += 1) {
        candidates.push(descendants[i]);
      }
    }

    for (let i = 0; i < candidates.length; i += 1) {
      const element = candidates[i];
      if (!element || element.nodeType !== 1) {
        continue;
      }
      const mapped = sourceNodeOf(nodeMap.get(element));
      if (!mapped || typeof mapped !== "object") {
        continue;
      }
      const propertyName =
        mapped.meta && typeof mapped.meta.__qhtmlPropertyBindingName === "string"
          ? String(mapped.meta.__qhtmlPropertyBindingName || "").trim()
          : "";
      if (!propertyName || !Object.prototype.hasOwnProperty.call(resolvedByName, propertyName)) {
        continue;
      }
      if (!resolvedByName[propertyName]) {
        resolvedByName[propertyName] = element;
      }
    }

    for (let i = 0; i < propertyNames.length; i += 1) {
      const propertyName = propertyNames[i];
      hostElement[propertyName] = resolvedByName[propertyName];
    }
  }

  function renderComponentHostInstance(componentNode, instanceNode, parent, targetDocument, context) {
    const stack = context.componentStack;
    const key = String(componentNode.componentId || instanceNode.tagName || "").toLowerCase();
    if (stack.indexOf(key) !== -1) {
      throw new Error("Recursive q-component usage detected for '" + key + "'.");
    }

    const hostTag = String(componentNode.componentId || instanceNode.tagName || "div").trim().toLowerCase();
    const hostElement = targetDocument.createElement(hostTag || "div");
    setElementAttributes(hostElement, instanceNode.attributes);
    setElementProperties(hostElement, instanceNode.props);
    if (key) {
      hostElement.setAttribute("q-component", key);
      hostElement.setAttribute("qhtml-component-instance", "1");
    }
    parent.appendChild(hostElement);

    if (context.capture) {
      if (context.capture.nodeMap) {
        context.capture.nodeMap.set(hostElement, instanceNode);
      }
      if (context.capture.componentMap) {
        context.capture.componentMap.set(hostElement, hostElement);
      }
      if (context.capture.slotMap && context.slotStack.length > 0) {
        context.capture.slotMap.set(hostElement, context.slotStack[context.slotStack.length - 1]);
      }
    }

    bindComponentMethods(componentNode, hostElement);

    stack.push(key);
    context.componentHostStack.push(hostElement);
    try {
      renderComponentContentIntoHost(componentNode, instanceNode, hostElement, targetDocument, context);
    } finally {
      context.componentHostStack.pop();
      stack.pop();
    }
    stripRenderedSlotElements(hostElement);
    applyRuntimeThemeRulesToHost(hostElement, instanceNode);
    bindDeclaredComponentPropertyNodes(componentNode, hostElement, context);

    if (!context.disableLifecycleHooks) {
      runLifecycleHooks(instanceNode, hostElement, targetDocument);
      runComponentLifecycleHooks(componentNode, hostElement, targetDocument);
    }
  }

  function serializeSignalSlotValue(node) {
    if (!node || typeof node !== "object") {
      return node;
    }
    if (core.NODE_TYPES.text && node.kind === core.NODE_TYPES.text) {
      return String(node.value || "");
    }
    if (node.kind === core.NODE_TYPES.rawHtml) {
      return String(node.html || "");
    }
    return cloneNodeDeep(node);
  }

  function buildSignalPayloadSlots(slotFills) {
    const payloadSlots = {};
    const payloadSlotQDom = {};
    if (!(slotFills instanceof Map)) {
      return {
        slots: payloadSlots,
        slotQDom: payloadSlotQDom,
      };
    }

    slotFills.forEach(function eachFill(fillEntry, slotName) {
      const key = String(slotName || "default").trim() || "default";
      const nodes = fillEntry && Array.isArray(fillEntry.nodes) ? fillEntry.nodes : [];
      payloadSlots[key] = [];
      payloadSlotQDom[key] = [];
      for (let i = 0; i < nodes.length; i += 1) {
        const node = nodes[i];
        payloadSlots[key].push(serializeSignalSlotValue(node));
        payloadSlotQDom[key].push(cloneNodeDeep(node));
      }
    });

    return {
      slots: payloadSlots,
      slotQDom: payloadSlotQDom,
    };
  }

  function resolveSignalDispatchTarget(parent, targetDocument, context) {
    const hostStack =
      context && Array.isArray(context.componentHostStack) ? context.componentHostStack : [];
    if (hostStack.length > 0) {
      const host = hostStack[hostStack.length - 1];
      if (host && typeof host.dispatchEvent === "function") {
        return host;
      }
    }
    if (parent && typeof parent.dispatchEvent === "function") {
      return parent;
    }
    if (targetDocument && typeof targetDocument.dispatchEvent === "function") {
      return targetDocument;
    }
    return null;
  }

  function dispatchSignalInstance(componentNode, instanceNode, parent, targetDocument, context) {
    const templateNodes = Array.isArray(componentNode.templateNodes) ? componentNode.templateNodes : [];
    const singleSlotName = resolveSingleSlotName(componentNode);
    const slotNames = collectSlotNames(templateNodes);
    const ownerInstanceId = ensureInstanceId(instanceNode);
    const slotFills = splitSlotFills(instanceNode, {
      singleSlotName: singleSlotName,
      slotNames: slotNames,
      ownerComponentId: String(componentNode.componentId || "").trim().toLowerCase(),
      ownerDefinitionType: inferDefinitionType(componentNode),
      ownerInstanceId: ownerInstanceId,
    });
    const signalName = String(componentNode.componentId || instanceNode.tagName || "").trim();
    const slotsPayload = buildSignalPayloadSlots(slotFills);
    const payload = {
      type: "signal",
      signal: signalName,
      component: signalName,
      signalId: signalName,
      source: cloneNodeDeep(instanceNode),
      slots: slotsPayload.slots,
      slotQDom: slotsPayload.slotQDom,
    };
    const target = resolveSignalDispatchTarget(parent, targetDocument, context);
    if (!target || typeof target.dispatchEvent !== "function") {
      return;
    }

    dispatchSignalPayload(target, signalName, payload);
  }

  function renderComponentInstance(componentNode, instanceNode, parent, targetDocument, context) {
    const definitionType = inferDefinitionType(componentNode);
    if (definitionType === "template") {
      renderComponentTemplateInstance(componentNode, instanceNode, parent, targetDocument, context);
      return;
    }
    if (definitionType === "signal") {
      dispatchSignalInstance(componentNode, instanceNode, parent, targetDocument, context);
      return;
    }
    renderComponentHostInstance(componentNode, instanceNode, parent, targetDocument, context);
  }

  function renderDocumentToFragment(documentNode, targetDocument, options) {
    const doc = targetDocument || global.document;
    if (!doc) {
      throw new Error("renderDocumentToFragment requires a document context.");
    }

    const fragment = doc.createDocumentFragment();
    const componentRegistry = collectComponentRegistry(documentNode);
    const context = {
      componentRegistry: componentRegistry,
      componentStack: [],
      componentHostStack: [],
      slotStack: [],
      disableLifecycleHooks: !!(options && options.disableLifecycleHooks),
      capture: options && options.capture ? options.capture : null,
    };

    const nodes = Array.isArray(documentNode && documentNode.nodes) ? documentNode.nodes : [];
    for (let i = 0; i < nodes.length; i += 1) {
      const node = nodes[i];
      if (node && node.kind === core.NODE_TYPES.component) {
        continue;
      }
      renderNode(node, fragment, doc, context);
    }

    return fragment;
  }

  function renderIntoElement(documentNode, hostElement, targetDocument, options) {
    if (!hostElement) {
      throw new Error("renderIntoElement requires a host element.");
    }

    const doc = targetDocument || hostElement.ownerDocument || global.document;
    const capture = options && options.capture ? options.capture : null;
    const fragment = renderDocumentToFragment(documentNode, doc, {
      capture: capture,
    });

    while (hostElement.firstChild) {
      hostElement.removeChild(hostElement.firstChild);
    }

    hostElement.appendChild(fragment);
    stripRenderedSlotElements(hostElement);
  }

  function collectAttributesFromDom(domElement) {
    const attrs = {};
    if (!domElement || !domElement.attributes) {
      return attrs;
    }

    if (typeof domElement.attributes.length === "number") {
      for (let i = 0; i < domElement.attributes.length; i += 1) {
        const attr = domElement.attributes[i];
        if (!attr || !attr.name) {
          continue;
        }
        attrs[String(attr.name)] = String(attr.value || "");
      }
      return attrs;
    }

    const keys = Object.keys(domElement.attributes);
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      attrs[String(key)] = String(domElement.attributes[key] || "");
    }
    return attrs;
  }

  function domNodeToQDom(node) {
    if (!node || typeof node !== "object") {
      return null;
    }

    if (node.nodeType === 3) {
      const text = String(node.textContent || "");
      if (!text.trim()) {
        return null;
      }
      if (typeof core.createTextNode === "function" && core.NODE_TYPES && core.NODE_TYPES.text) {
        return core.createTextNode({ value: text });
      }
      return core.createRawHtmlNode({ html: escapeHtmlText(text) });
    }

    if (node.nodeType !== 1) {
      return null;
    }

    const elementNode = core.createElementNode({
      tagName: String(node.tagName || "div").toLowerCase(),
      attributes: collectAttributesFromDom(node),
      children: [],
    });

    const children = node && node.childNodes && typeof node.childNodes.length === "number" ? node.childNodes : [];
    for (let i = 0; i < children.length; i += 1) {
      const child = domNodeToQDom(children[i]);
      if (child) {
        elementNode.children.push(child);
      }
    }

    return elementNode;
  }

  function domElementToInstanceNode(hostElement) {
    const instanceNode = core.createElementNode({
      tagName: String(hostElement && hostElement.tagName ? hostElement.tagName : "div").toLowerCase(),
      attributes: collectAttributesFromDom(hostElement),
      children: [],
    });

    const children =
      hostElement && hostElement.childNodes && typeof hostElement.childNodes.length === "number"
        ? hostElement.childNodes
        : [];
    for (let i = 0; i < children.length; i += 1) {
      const child = domNodeToQDom(children[i]);
      if (child) {
        instanceNode.children.push(child);
      }
    }

    return instanceNode;
  }

  function renderComponentElement(componentNode, hostElement, targetDocument, options) {
    if (!componentNode || componentNode.kind !== core.NODE_TYPES.component) {
      throw new Error("renderComponentElement requires a component definition node.");
    }
    if (!hostElement || hostElement.nodeType !== 1) {
      throw new Error("renderComponentElement requires a host element.");
    }

    const doc = targetDocument || hostElement.ownerDocument || global.document;
    const opts = options || {};
    const registry =
      opts.componentRegistry instanceof Map
        ? opts.componentRegistry
        : new Map([[String(componentNode.componentId || "").toLowerCase(), componentNode]]);

    const context = {
      componentRegistry: registry,
      componentStack: Array.isArray(opts.componentStack) ? opts.componentStack : [],
      disableLifecycleHooks: !!opts.disableLifecycleHooks,
    };

    const instanceNode = domElementToInstanceNode(hostElement);
    const key = String(componentNode.componentId || instanceNode.tagName || "").toLowerCase();

    if (key) {
      hostElement.setAttribute("q-component", key);
      hostElement.setAttribute("qhtml-component-instance", "1");
      if (opts.externalInstance !== false) {
        hostElement.setAttribute("qhtml-external-component-instance", "1");
      }
    }

    bindComponentMethods(componentNode, hostElement);

    if (context.componentStack.indexOf(key) !== -1) {
      throw new Error("Recursive q-component usage detected for '" + key + "'.");
    }

    context.componentStack.push(key);
    try {
      renderComponentContentIntoHost(componentNode, instanceNode, hostElement, doc, context);
    } finally {
      context.componentStack.pop();
    }
    stripRenderedSlotElements(hostElement);

    if (!context.disableLifecycleHooks) {
      runComponentLifecycleHooks(componentNode, hostElement, doc);
    }
    return hostElement;
  }

  modules.domRenderer = {
    collectComponentRegistry: collectComponentRegistry,
    renderDocumentToFragment: renderDocumentToFragment,
    renderIntoElement: renderIntoElement,
    renderComponentElement: renderComponentElement,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);

/*** END: modules/dom-renderer/src/dom-renderer.js ***/

/*** BEGIN: modules/qhtml-runtime/src/qhtml-runtime.js ***/
(function attachQHtmlRuntime(global) {
  const modules = global.QHtmlModules || (global.QHtmlModules = {});
  const core = modules.qdomCore;
  const parser = modules.qhtmlParser;
  const renderer = modules.domRenderer;

  if (!core || !parser || !renderer) {
    throw new Error("qhtml-runtime requires qdom-core, qhtml-parser, and dom-renderer.");
  }

  const bindings = new WeakMap();
  const importSourceCache = new Map();
  const definitionRegistry = new Map();
  const registeredCustomElements = new Set();
  const QHTML_CONTENT_LOADED_EVENT = "QHTMLContentLoaded";
  let autoMountObserver = null;
  let autoMountRoot = null;
  let autoMountOptions = {};
  let autoMountPollTimer = null;
  let domMutationSyncEnabled = true;
  let domMutationSyncSuspendDepth = 0;
  let runtimeQdomInstanceCounter = 0;
  const qdomInstanceIds = new WeakMap();
  const qdomSlotOwnerIds = new WeakMap();
  const COLLECTION_MUTATION_KEYS = new Set(["nodes", "children", "templateNodes", "slots"]);
  const FORCED_FULL_RENDER_KEYS = new Set([
    "kind",
    "tagName",
    "componentId",
    "definitionType",
    "selectorMode",
    "selectorChain",
    "nodes",
    "children",
    "templateNodes",
    "slots",
    "lifecycleScripts",
    "methods",
    "aliasDeclarations",
    "scripts",
    "html",
  ]);
  const FORM_CONTROL_TAGS = new Set(["input", "textarea", "select"]);
  const MAX_UPDATE_CYCLES_PER_TICK = 1000;
  const MAX_UPDATE_REENTRIES_PER_EPOCH = 1000;
  const DEFAULT_QBIND_EVALUATION_INTERVAL = 10;
  const UPDATE_NONCE_KEY = typeof core.UPDATE_NONCE_KEY === "string" ? core.UPDATE_NONCE_KEY : "update-nonce";
  const DOM_MUTATION_DIRTY_ATTRIBUTE = "qhtml-unsynced";
  const DOM_MUTATION_SYNC_FLUSH_BATCH_SIZE = 25;
  const DOM_MUTATION_SYNC_FLUSH_DELAY_MS = 0;
  const INLINE_REFERENCE_PATTERN = /\$\{\s*([^}]+?)\s*\}/g;
  const INLINE_REFERENCE_ESCAPE_TOKEN = "__QHTML_ESCAPED_INLINE_REF__";
  const DOM_MUTATION_SYNC_OBSERVER_OPTIONS = {
    attributes: true,
    characterData: true,
    subtree: true,
  };
  const Q_COLOR_STYLE_PROPERTY_MAP = Object.freeze({
    background: "background-color",
    foreground: "color",
    border: "border-color",
    outline: "outline-color",
    caret: "caret-color",
    fill: "fill",
    stroke: "stroke",
    shadow: "box-shadow",
    primary: "--q-color-primary",
    secondary: "--q-color-secondary",
    accent: "--q-color-accent",
    surface: "--q-color-surface",
    surfacealt: "--q-color-surface-alt",
    muted: "--q-color-muted",
    foregroundmuted: "--q-color-foreground-muted",
    borderstrong: "--q-color-border-strong",
    success: "--q-color-success",
    warning: "--q-color-warning",
    danger: "--q-color-danger",
    info: "--q-color-info",
    link: "--q-color-link",
    linkhover: "--q-color-link-hover",
    focusring: "--q-color-focus-ring",
    overlay: "--q-color-overlay",
    primarycontrast: "--q-color-primary-contrast",
    secondarycontrast: "--q-color-secondary-contrast",
    accentcontrast: "--q-color-accent-contrast",
    successcontrast: "--q-color-success-contrast",
    warningcontrast: "--q-color-warning-contrast",
    dangercontrast: "--q-color-danger-contrast",
    infocontrast: "--q-color-info-contrast",
    titlebackground: "--q-color-title-background",
    titleforeground: "--q-color-title-foreground",
    panelbackground: "--q-color-panel-background",
    panelforeground: "--q-color-panel-foreground",
    cardbackground: "--q-color-card-background",
    cardforeground: "--q-color-card-foreground",
    modalbackground: "--q-color-modal-background",
    modalforeground: "--q-color-modal-foreground",
    navbackground: "--q-color-nav-background",
    navforeground: "--q-color-nav-foreground",
    toolbarbackground: "--q-color-toolbar-background",
    toolbarforeground: "--q-color-toolbar-foreground",
    buttonbackground: "--q-color-button-background",
    buttonforeground: "--q-color-button-foreground",
    buttonborder: "--q-color-button-border",
    buttonhoverbackground: "--q-color-button-hover-background",
    buttonhoverforeground: "--q-color-button-hover-foreground",
    inputbackground: "--q-color-input-background",
    inputforeground: "--q-color-input-foreground",
    inputborder: "--q-color-input-border",
    badgebackground: "--q-color-badge-background",
    badgeforeground: "--q-color-badge-foreground",
    selectionbackground: "--q-color-selection-background",
    selectionforeground: "--q-color-selection-foreground",
  });
  const DEFAULT_QCOLOR_THEME_NAME = "default";
  const DEFAULT_QCOLOR_AREA_PROPERTIES = Object.freeze({
    background: "background-color",
    surface: "background-color",
    surfaceAlt: "background-color",
    foreground: "color",
    foregroundMuted: "color",
    muted: "color",
    border: "border-color",
    borderStrong: "border-color",
    primary: "color",
    primaryContrast: "color",
    secondary: "color",
    secondaryContrast: "color",
    accent: "color",
    accentContrast: "color",
    success: "color",
    successContrast: "color",
    danger: "color",
    dangerContrast: "color",
    warning: "color",
    warningContrast: "color",
    info: "color",
    infoContrast: "color",
    overlay: "background-color",
    shadow: "box-shadow",
    link: "color",
    linkHover: "color",
    focusRing: "outline-color",
    titleBackground: "background-color",
    titleForeground: "color",
    panelBackground: "background-color",
    panelForeground: "color",
    cardBackground: "background-color",
    cardForeground: "color",
    modalBackground: "background-color",
    modalForeground: "color",
    navBackground: "background-color",
    navForeground: "color",
    toolbarBackground: "background-color",
    toolbarForeground: "color",
    buttonBackground: "background-color",
    buttonForeground: "color",
    buttonBorder: "border-color",
    buttonHoverBackground: "background-color",
    buttonHoverForeground: "color",
    inputBackground: "background-color",
    inputForeground: "color",
    inputBorder: "border-color",
    badgeBackground: "background-color",
    badgeForeground: "color",
    selectionBackground: "background-color",
    selectionForeground: "color",
  });
  const DEFAULT_QCOLOR_THEME_ASSIGNMENTS = Object.freeze({
    background: "#f8fafc",
    surface: "rgb(238, 243, 251)",
    surfaceAlt: "#f1f5f9",
    foreground: "#0f172a",
    foregroundMuted: "#475569",
    muted: "#64748b",
    border: "#cbd5e1",
    borderStrong: "#94a3b8",
    primary: "#1d4ed8",
    primaryContrast: "rgb(238, 243, 251)",
    secondary: "#334155",
    secondaryContrast: "rgb(238, 243, 251)",
    accent: "#0ea5e9",
    accentContrast: "#082f49",
    success: "#16a34a",
    successContrast: "rgb(238, 243, 251)",
    danger: "#dc2626",
    dangerContrast: "rgb(238, 243, 251)",
    warning: "#f59e0b",
    warningContrast: "#111827",
    info: "#0284c7",
    infoContrast: "rgb(238, 243, 251)",
    overlay: "rgba(15, 23, 42, 0.72)",
    shadow: "rgba(15, 23, 42, 0.18)",
    link: "#1d4ed8",
    linkHover: "#1e40af",
    focusRing: "#f59e0b",
    titleBackground: "#e2e8f0",
    titleForeground: "#0f172a",
    panelBackground: "rgb(238, 243, 251)",
    panelForeground: "#0f172a",
    cardBackground: "rgb(238, 243, 251)",
    cardForeground: "#0f172a",
    modalBackground: "rgb(238, 243, 251)",
    modalForeground: "#0f172a",
    navBackground: "#334155",
    navForeground: "rgb(238, 243, 251)",
    toolbarBackground: "#0f172a",
    toolbarForeground: "#f8fafc",
    buttonBackground: "#1d4ed8",
    buttonForeground: "rgb(238, 243, 251)",
    buttonBorder: "#1e40af",
    buttonHoverBackground: "#1e40af",
    buttonHoverForeground: "rgb(238, 243, 251)",
    inputBackground: "rgb(238, 243, 251)",
    inputForeground: "#0f172a",
    inputBorder: "#cbd5e1",
    badgeBackground: "#1d4ed8",
    badgeForeground: "rgb(238, 243, 251)",
    selectionBackground: "#bfdbfe",
    selectionForeground: "#0f172a",
  });

  function ensureInstanceId(node) {
    if (!node || typeof node !== "object") {
      return "";
    }
    if (qdomInstanceIds.has(node)) {
      const existingFromMap = qdomInstanceIds.get(node);
      if (typeof existingFromMap === "string" && existingFromMap.trim()) {
        return existingFromMap.trim();
      }
    }
    const existing =
      typeof node.instanceId === "string" && node.instanceId.trim()
        ? node.instanceId.trim()
        : typeof node.__qhtmlInstanceId === "string" && node.__qhtmlInstanceId.trim()
          ? node.__qhtmlInstanceId.trim()
          : node.meta && typeof node.meta === "object" && typeof node.meta.instanceId === "string" && node.meta.instanceId.trim()
            ? node.meta.instanceId.trim()
            : "";
    if (existing) {
      qdomInstanceIds.set(node, existing);
      return existing;
    }
    runtimeQdomInstanceCounter += 1;
    const generated = "qdom-instance-" + String(runtimeQdomInstanceCounter);
    qdomInstanceIds.set(node, generated);
    return generated;
  }

  function isNumericPathSegment(segment) {
    return /^[0-9]+$/.test(String(segment || ""));
  }

  function sourceNodeOf(node) {
    if (!node || typeof node !== "object") {
      return null;
    }
    if (node.__qhtmlSourceNode && typeof node.__qhtmlSourceNode === "object") {
      return node.__qhtmlSourceNode;
    }
    return node;
  }

  function normalizeQColorKey(name) {
    return String(name || "")
      .trim()
      .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }

  function normalizeQColorPattern(name) {
    return String(name || "")
      .trim()
      .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
      .toLowerCase()
      .replace(/[^a-z0-9*]/g, "");
  }

  function hasQColorWildcardPattern(name) {
    return normalizeQColorPattern(name).indexOf("*") >= 0;
  }

  function doesQColorRequestMatchAreaName(requestPattern, areaName) {
    const pattern = normalizeQColorPattern(requestPattern);
    const candidate = normalizeQColorKey(areaName);
    if (!pattern || !candidate) {
      return false;
    }
    if (pattern.indexOf("*") < 0) {
      return pattern === candidate;
    }
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp("^" + escaped.replace(/\*/g, ".*") + "$");
    return regex.test(candidate);
  }

  function doesQColorRequestMatchAnyArea(requestPatterns, areaName) {
    const patterns = Array.isArray(requestPatterns) ? requestPatterns : [];
    for (let i = 0; i < patterns.length; i += 1) {
      if (doesQColorRequestMatchAreaName(patterns[i], areaName)) {
        return true;
      }
    }
    return false;
  }

  function normalizeQColorResolvedValue(value) {
    const raw = String(value == null ? "" : value).trim();
    if (!raw) {
      return "";
    }
    if (/^--[A-Za-z0-9_-]+$/.test(raw)) {
      return "var(" + raw + ")";
    }
    return raw;
  }

  function levenshtein(a, b) {
    const m = a.length;
    const n = b.length;
    const dp = Array.from({ length: m + 1 }, function makeRow() {
      return Array(n + 1).fill(0);
    });

    for (let i = 0; i <= m; i += 1) {
      dp[i][0] = i;
    }
    for (let j = 0; j <= n; j += 1) {
      dp[0][j] = j;
    }

    for (let i = 1; i <= m; i += 1) {
      for (let j = 1; j <= n; j += 1) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + cost
        );
      }
    }
    return dp[m][n];
  }

  function bigrams(s) {
    const g = [];
    for (let i = 0; i < s.length - 1; i += 1) {
      g.push(s.slice(i, i + 2));
    }
    return g;
  }

  function bigramScore(a, b) {
    const A = bigrams(a);
    const B = bigrams(b);
    let match = 0;
    for (let i = 0; i < A.length; i += 1) {
      if (B.includes(A[i])) {
        match += 1;
      }
    }
    return match / Math.max(A.length, B.length);
  }

  function splitTokens(s) {
    return String(s || "")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .toLowerCase()
      .split(/[\s\-_]+/);
  }

  function buildTokenIndex(choices) {
    const vocab = new Set();
    for (let i = 0; i < choices.length; i += 1) {
      const tokens = splitTokens(choices[i]);
      for (let j = 0; j < tokens.length; j += 1) {
        vocab.add(tokens[j]);
      }
    }
    return Array.from(vocab);
  }

  function tokenScore(query, vocab) {
    const q = String(query || "").toLowerCase();
    let score = 0;
    for (let i = 0; i < vocab.length; i += 1) {
      if (q.includes(vocab[i])) {
        score += 1;
      }
    }
    return score;
  }

  function fuzzyResolve(query, choices, topK) {
    const limit = Number.isFinite(topK) ? Math.max(1, Math.floor(topK)) : 5;
    const vocab = buildTokenIndex(choices);
    const ranked = choices.map(function mapCandidate(candidate) {
      const tokScore = tokenScore(query, vocab);
      const bigScore = bigramScore(query, candidate);
      const lev = levenshtein(query, candidate);
      const score = tokScore * 5 + bigScore * 4 - lev * 0.5;
      return { candidate: candidate, score: score };
    });
    ranked.sort(function sortByScore(a, b) {
      return b.score - a.score;
    });
    return ranked.slice(0, limit);
  }

  function qColorStylePropertyForKey(key) {
    const normalized = normalizeQColorKey(key);
    if (!normalized) {
      return "";
    }
    if (Object.prototype.hasOwnProperty.call(Q_COLOR_STYLE_PROPERTY_MAP, normalized)) {
      return Q_COLOR_STYLE_PROPERTY_MAP[normalized];
    }
    return "--q-color-" + normalized.replace(/[^A-Za-z0-9_-]/g, "-");
  }

  function cloneQColorAssignments(assignments) {
    return assignments && typeof assignments === "object" && !Array.isArray(assignments)
      ? Object.assign({}, assignments)
      : {};
  }

  function registerQColorSchema(context, areaName, cssProperty) {
    if (!context || !(context.schemas instanceof Map)) {
      return;
    }
    const normalized = normalizeQColorKey(areaName);
    const property = normalizeCssPropertyName(cssProperty);
    if (!normalized || !property) {
      return;
    }
    context.schemas.set(normalized, {
      name: String(areaName || "").trim() || normalized,
      property: property,
    });
  }

  function registerQColorTheme(context, themeName, assignments, options) {
    if (!context || !(context.themes instanceof Map)) {
      return;
    }
    const normalized = normalizeQColorKey(themeName);
    if (!normalized) {
      return;
    }
    context.themes.set(normalized, {
      name: String(themeName || "").trim() || normalized,
      assignments: cloneQColorAssignments(assignments),
    });
    const opts = options || {};
    if (opts.setAsDefault === true || !String(context.defaultThemeName || "").trim()) {
      context.defaultThemeName = normalized;
    }
  }

  function createQColorContext() {
    const out = {
      schemas: new Map(),
      schemaDefs: new Map(),
      themes: new Map(),
      defaultThemeName: DEFAULT_QCOLOR_THEME_NAME,
    };
    const schemaKeys = Object.keys(DEFAULT_QCOLOR_AREA_PROPERTIES);
    for (let i = 0; i < schemaKeys.length; i += 1) {
      const key = schemaKeys[i];
      registerQColorSchema(out, key, DEFAULT_QCOLOR_AREA_PROPERTIES[key]);
    }
    registerQColorTheme(out, DEFAULT_QCOLOR_THEME_NAME, DEFAULT_QCOLOR_THEME_ASSIGNMENTS, {
      setAsDefault: true,
    });
    return out;
  }

  function readDocumentQColorContext(binding) {
    if (
      binding &&
      binding.__qColorContext &&
      typeof binding.__qColorContext === "object" &&
      binding.__qColorContext.schemas instanceof Map &&
      binding.__qColorContext.themes instanceof Map
    ) {
      return binding.__qColorContext;
    }
    const out = createQColorContext();
    if (!binding || !binding.qdom || !binding.qdom.meta || typeof binding.qdom.meta !== "object") {
      if (binding) {
        binding.__qColorContext = out;
      }
      return out;
    }
    const meta = binding.qdom.meta;
    const schemaObject = meta.qColorSchemas && typeof meta.qColorSchemas === "object" ? meta.qColorSchemas : {};
    const schemaKeys = Object.keys(schemaObject);
    for (let i = 0; i < schemaKeys.length; i += 1) {
      const key = String(schemaKeys[i] || "").trim();
      const value = String(schemaObject[key] == null ? "" : schemaObject[key]).trim();
      if (!key || !value) {
        continue;
      }
      registerQColorSchema(out, key, value);
    }
    const schemaDefs = meta.qColorSchemaDefs && typeof meta.qColorSchemaDefs === "object" ? meta.qColorSchemaDefs : {};
    const schemaDefKeys = Object.keys(schemaDefs);
    for (let i = 0; i < schemaDefKeys.length; i += 1) {
      const key = String(schemaDefKeys[i] || "").trim();
      const value = schemaDefs[key];
      if (!key || !value || typeof value !== "object" || Array.isArray(value)) {
        continue;
      }
      out.schemaDefs.set(normalizeQColorKey(key), {
        name: key,
        entries: cloneQColorAssignments(value),
      });
    }

    const themeObject = meta.qColorThemes && typeof meta.qColorThemes === "object" ? meta.qColorThemes : {};
    const themeKeys = Object.keys(themeObject);
    for (let i = 0; i < themeKeys.length; i += 1) {
      const key = String(themeKeys[i] || "").trim();
      const value = themeObject[key];
      if (!key || !value || typeof value !== "object" || Array.isArray(value)) {
        continue;
      }
      registerQColorTheme(out, key, value);
    }
    const defaultTheme = String(meta.qColorDefaultTheme || "").trim();
    if (defaultTheme) {
      out.defaultThemeName = normalizeQColorKey(defaultTheme) || out.defaultThemeName;
    }
    binding.__qColorContext = out;
    delete meta.qColorSchemas;
    delete meta.qColorSchemaDefs;
    delete meta.qColorDefs;
    delete meta.qColorThemes;
    delete meta.qColorDefaultTheme;
    return out;
  }

  function persistDocumentQColorContext(binding, context) {
    if (!binding) {
      return;
    }
    if (context && typeof context === "object") {
      binding.__qColorContext = context;
    }
    if (binding.qdom && binding.qdom.meta && typeof binding.qdom.meta === "object") {
      delete binding.qdom.meta.qColorSchemas;
      delete binding.qdom.meta.qColorSchemaDefs;
      delete binding.qdom.meta.qColorDefs;
      delete binding.qdom.meta.qColorThemes;
      delete binding.qdom.meta.qColorDefaultTheme;
    }
  }

  function lookupQColorPropertyByArea(colorContext, areaName, options) {
    const opts = options && typeof options === "object" ? options : {};
    const normalized = normalizeQColorKey(areaName);
    if (!normalized || !colorContext || !(colorContext.schemas instanceof Map)) {
      return "";
    }
    const entry = colorContext.schemas.get(normalized);
    if (!entry || typeof entry !== "object") {
      const areaValues =
        opts.areaValues && typeof opts.areaValues === "object" && !Array.isArray(opts.areaValues)
          ? opts.areaValues
          : null;
      if (areaValues && lookupAreaValueInObject(areaValues, areaName)) {
        return normalizeCssPropertyName(areaName);
      }
      const choices = Array.from(colorContext.schemas.keys());
      if (choices.length === 0) {
        return "";
      }
      const ranked = fuzzyResolve(normalized, choices, 1);
      if (!Array.isArray(ranked) || ranked.length === 0 || !ranked[0]) {
        return "";
      }
      const fallbackEntry = colorContext.schemas.get(String(ranked[0].candidate || ""));
      if (!fallbackEntry || typeof fallbackEntry !== "object") {
        return "";
      }
      return String(fallbackEntry.property || "").trim();
    }
    return String(entry.property || "").trim();
  }

  function lookupQColorPropertyOnNode(node, areaName) {
    if (!node || typeof node !== "object" || !node.meta || typeof node.meta !== "object") {
      return "";
    }
    const map =
      node.meta.qColorAreaProperties &&
      typeof node.meta.qColorAreaProperties === "object" &&
      !Array.isArray(node.meta.qColorAreaProperties)
        ? node.meta.qColorAreaProperties
        : null;
    if (!map) {
      return "";
    }
    return lookupAreaValueInObject(map, areaName);
  }

  function resolveQColorThemeAssignments(colorContext, themeName) {
    const normalized = normalizeQColorKey(themeName);
    if (!normalized || !colorContext || !(colorContext.themes instanceof Map)) {
      return null;
    }
    const entry = colorContext.themes.get(normalized);
    if (!entry || typeof entry !== "object") {
      return null;
    }
    return cloneQColorAssignments(entry.assignments);
  }

  function lookupAreaValueInObject(mapObject, areaName) {
    if (!mapObject || typeof mapObject !== "object" || Array.isArray(mapObject)) {
      return "";
    }
    const target = normalizeQColorKey(areaName);
    if (!target) {
      return "";
    }
    const keys = Object.keys(mapObject);
    for (let i = 0; i < keys.length; i += 1) {
      const key = String(keys[i] || "").trim();
      if (!key) {
        continue;
      }
      if (normalizeQColorKey(key) !== target) {
        continue;
      }
      return normalizeQColorResolvedValue(mapObject[key]);
    }
    return "";
  }

  function resolveQColorValue(rawValue, colorContext) {
    const value = normalizeQColorResolvedValue(rawValue);
    if (!value) {
      return "";
    }
    const activeThemeName = String(colorContext && colorContext.defaultThemeName || "").trim();
    const activeTheme = resolveQColorThemeAssignments(colorContext, activeThemeName);
    const fromTheme = normalizeQColorResolvedValue(lookupAreaValueInObject(activeTheme, value));
    if (fromTheme) {
      return fromTheme;
    }
    return value;
  }

  function buildQColorAreaValueMap(assignments, colorContext) {
    const source = assignments && typeof assignments === "object" ? assignments : {};
    const merged = {};
    const sourceKeys = Object.keys(source);
    const requestedKeys = [];
    for (let i = 0; i < sourceKeys.length; i += 1) {
      const key = String(sourceKeys[i] || "").trim();
      if (!key || normalizeQColorKey(key) === "theme") {
        continue;
      }
      requestedKeys.push(key);
    }
    const requestedPatterns = requestedKeys.map(function mapRequestedPattern(key) {
      return String(key || "").trim();
    }).filter(Boolean);
    const hasRequestedKeys = requestedPatterns.length > 0;

    const themeName = String(source.theme || colorContext && colorContext.defaultThemeName || "").trim();
    if (themeName) {
      const theme = resolveQColorThemeAssignments(colorContext, themeName);
      if (theme && typeof theme === "object") {
        const themeKeys = Object.keys(theme);
        for (let i = 0; i < themeKeys.length; i += 1) {
          const key = String(themeKeys[i] || "").trim();
          if (!key) {
            continue;
          }
          if (hasRequestedKeys && !doesQColorRequestMatchAnyArea(requestedPatterns, key)) {
            continue;
          }
          merged[key] = theme[key];
        }
      }
    }
    for (let i = 0; i < sourceKeys.length; i += 1) {
      const key = String(sourceKeys[i] || "").trim();
      if (!key || normalizeQColorKey(key) === "theme") {
        continue;
      }
      if (source[key] === true) {
        continue;
      }
      merged[key] = source[key];
    }
    const out = {};
    const mergedKeys = Object.keys(merged);
    for (let i = 0; i < mergedKeys.length; i += 1) {
      const key = String(mergedKeys[i] || "").trim();
      if (!key) {
        continue;
      }
      const resolved = resolveQColorValue(merged[key], colorContext);
      if (!resolved) {
        continue;
      }
      out[key] = resolved;
    }
    return out;
  }

  function buildQColorStyleDeclarationsFromAreaMap(areaMap, colorContext) {
    const source = areaMap && typeof areaMap === "object" ? areaMap : {};
    const declarations = [];
    const keys = Object.keys(source);
    for (let i = 0; i < keys.length; i += 1) {
      const key = String(keys[i] || "").trim();
      const value = String(source[key] || "").trim();
      if (!key || !value) {
        continue;
      }
      const cssProp = lookupQColorPropertyByArea(colorContext, key, {
        areaValues: source,
      }) || inferQColorCssProperty(key);
      if (!cssProp) {
        continue;
      }
      declarations.push(cssProp + ": " + value);
    }
    return declarations;
  }

  function buildQColorStyleDeclarations(assignments, colorContext) {
    return buildQColorStyleDeclarationsFromAreaMap(buildQColorAreaValueMap(assignments, colorContext), colorContext);
  }

  function buildQColorAreaValueMapFromList(assignmentsList, colorContext) {
    const list = Array.isArray(assignmentsList) ? assignmentsList : [];
    const merged = {};
    for (let i = 0; i < list.length; i += 1) {
      const values = buildQColorAreaValueMap(list[i], colorContext);
      const keys = Object.keys(values);
      for (let j = 0; j < keys.length; j += 1) {
        const key = String(keys[j] || "").trim();
        const value = String(values[key] || "").trim();
        if (!key || !value) {
          continue;
        }
        merged[key] = value;
      }
    }
    return merged;
  }

  function buildQColorStyleDeclarationsFromList(assignmentsList, colorContext) {
    return buildQColorStyleDeclarationsFromAreaMap(
      buildQColorAreaValueMapFromList(assignmentsList, colorContext),
      colorContext
    );
  }

  function composeQColorStyle(baseStyle, declarations) {
    const base = String(baseStyle || "").trim();
    const list = Array.isArray(declarations) ? declarations.filter(Boolean) : [];
    const extra = list.join("; ").trim();
    if (!base && !extra) {
      return "";
    }
    if (!base) {
      return extra;
    }
    if (!extra) {
      return base;
    }
    const needsSemicolon = !base.endsWith(";");
    return (base + (needsSemicolon ? ";" : "") + " " + extra).trim();
  }

  function splitInlineStyleDeclarations(styleText) {
    const source = String(styleText || "");
    const out = [];
    let token = "";
    let quote = "";
    let escaped = false;
    let parenDepth = 0;
    for (let i = 0; i < source.length; i += 1) {
      const ch = source[i];
      if (escaped) {
        token += ch;
        escaped = false;
        continue;
      }
      if (quote) {
        token += ch;
        if (ch === "\\") {
          escaped = true;
          continue;
        }
        if (ch === quote) {
          quote = "";
        }
        continue;
      }
      if (ch === "'" || ch === "\"") {
        quote = ch;
        token += ch;
        continue;
      }
      if (ch === "(") {
        parenDepth += 1;
        token += ch;
        continue;
      }
      if (ch === ")" && parenDepth > 0) {
        parenDepth -= 1;
        token += ch;
        continue;
      }
      if (ch === ";" && parenDepth === 0) {
        const chunk = String(token || "").trim();
        if (chunk) {
          out.push(chunk);
        }
        token = "";
        continue;
      }
      token += ch;
    }
    const trailing = String(token || "").trim();
    if (trailing) {
      out.push(trailing);
    }
    return out;
  }

  function parseInlineStyleDeclarations(styleText) {
    const entries = splitInlineStyleDeclarations(styleText);
    const out = [];
    for (let i = 0; i < entries.length; i += 1) {
      const raw = String(entries[i] || "").trim();
      if (!raw) {
        continue;
      }
      const colonIndex = raw.indexOf(":");
      if (colonIndex <= 0) {
        continue;
      }
      const property = String(raw.slice(0, colonIndex) || "").trim();
      const value = String(raw.slice(colonIndex + 1) || "").trim();
      if (!property || !value) {
        continue;
      }
      out.push({
        property: property,
        normalizedProperty: normalizeCssPropertyName(property),
        value: value,
      });
    }
    return out;
  }

  function joinInlineStyleDeclarations(declarations) {
    const list = Array.isArray(declarations) ? declarations : [];
    const out = [];
    for (let i = 0; i < list.length; i += 1) {
      const item = list[i];
      if (!item || typeof item !== "object") {
        continue;
      }
      const property = String(item.property || "").trim();
      const value = String(item.value || "").trim();
      if (!property || !value) {
        continue;
      }
      out.push(property + ": " + value);
    }
    return out.join("; ").trim();
  }

  function composeQColorStyleWithExisting(options) {
    const opts = options && typeof options === "object" ? options : {};
    const currentStyle = String(opts.currentStyle || "").trim();
    const baseStyle = String(opts.baseStyle || "").trim();
    const colorDeclarations = Array.isArray(opts.colorDeclarations) ? opts.colorDeclarations : [];
    const previousManaged = Array.isArray(opts.previousManagedProperties) ? opts.previousManagedProperties : [];
    const parsedBase = parseInlineStyleDeclarations(baseStyle);
    const parsedCurrent = parseInlineStyleDeclarations(currentStyle);
    const mergedSourceMap = Object.create(null);
    const mergedSourceOrder = [];
    function mergeSourceDeclarations(list) {
      const entries = Array.isArray(list) ? list : [];
      for (let i = 0; i < entries.length; i += 1) {
        const item = entries[i];
        if (!item || !item.normalizedProperty) {
          continue;
        }
        if (!Object.prototype.hasOwnProperty.call(mergedSourceMap, item.normalizedProperty)) {
          mergedSourceOrder.push(item.normalizedProperty);
        }
        mergedSourceMap[item.normalizedProperty] = item;
      }
    }
    mergeSourceDeclarations(parsedBase);
    mergeSourceDeclarations(parsedCurrent);
    const parsedSource = [];
    for (let i = 0; i < mergedSourceOrder.length; i += 1) {
      const key = mergedSourceOrder[i];
      const item = mergedSourceMap[key];
      if (!item) {
        continue;
      }
      parsedSource.push(item);
    }

    const parsedColor = [];
    const nextManagedSet = new Set();
    for (let i = 0; i < colorDeclarations.length; i += 1) {
      const entry = parseInlineStyleDeclarations(String(colorDeclarations[i] || ""));
      for (let j = 0; j < entry.length; j += 1) {
        const item = entry[j];
        parsedColor.push(item);
        if (item.normalizedProperty) {
          nextManagedSet.add(item.normalizedProperty);
        }
      }
    }

    const removeSet = new Set();
    for (let i = 0; i < previousManaged.length; i += 1) {
      const prop = normalizeCssPropertyName(previousManaged[i]);
      if (prop) {
        removeSet.add(prop);
      }
    }
    nextManagedSet.forEach(function eachManaged(prop) {
      if (prop) {
        removeSet.add(prop);
      }
    });

    const retained = [];
    for (let i = 0; i < parsedSource.length; i += 1) {
      const item = parsedSource[i];
      if (!item || !item.normalizedProperty || removeSet.has(item.normalizedProperty)) {
        continue;
      }
      retained.push(item);
    }

    const merged = retained.concat(parsedColor);
    return {
      style: joinInlineStyleDeclarations(merged),
      managedProperties: Array.from(nextManagedSet),
    };
  }

  function inferQColorCssProperty(areaName) {
    const normalized = normalizeQColorKey(areaName);
    if (!normalized) {
      return "";
    }
    if (
      normalized === "background-color" ||
      normalized === "background" ||
      normalized === "bg" ||
      normalized.endsWith("-bg") ||
      normalized.indexOf("background") !== -1
    ) {
      return "background-color";
    }
    if (
      normalized === "foreground-color" ||
      normalized === "foreground" ||
      normalized === "fg" ||
      normalized.endsWith("-fg") ||
      normalized.endsWith("-foreground")
    ) {
      return "color";
    }
    if (normalized === "color" || normalized.endsWith("-color")) {
      return "color";
    }
    if (normalized.indexOf("border") !== -1) {
      return "border-color";
    }
    if (normalized.indexOf("outline") !== -1) {
      return "outline-color";
    }
    if (normalized.indexOf("shadow") !== -1) {
      return "box-shadow";
    }
    if (normalized.indexOf("fill") !== -1) {
      return "fill";
    }
    if (normalized.indexOf("stroke") !== -1) {
      return "stroke";
    }
    if (normalized.indexOf("caret") !== -1) {
      return "caret-color";
    }
    return qColorStylePropertyForKey(areaName);
  }

  function warnQColor(message, detail) {
    if (typeof console === "undefined" || !console || typeof console.warn !== "function") {
      return;
    }
    if (typeof detail === "undefined") {
      console.warn("qhtml q-color warning:", message);
      return;
    }
    console.warn("qhtml q-color warning:", message, detail);
  }

  function normalizeCssPropertyName(name) {
    const raw = String(name || "").trim();
    if (!raw) {
      return "";
    }
    if (raw.indexOf("--") === 0) {
      return raw;
    }
    if (raw.indexOf("-") >= 0) {
      return raw.toLowerCase();
    }
    return raw.replace(/([A-Z])/g, "-$1").toLowerCase();
  }

  function isLikelyColorValue(value) {
    const text = String(value || "").trim();
    if (!text) {
      return false;
    }
    if (/^#[0-9a-f]{3,8}$/i.test(text)) {
      return true;
    }
    if (/^(rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)\(/i.test(text)) {
      return true;
    }
    if (/gradient\(/i.test(text)) {
      return true;
    }
    if (/^(var|calc|min|max|clamp)\(/i.test(text)) {
      return true;
    }
    if (/^(transparent|currentcolor|inherit|initial|unset|revert|revert-layer|[a-z-]+)$/i.test(text)) {
      return true;
    }
    return false;
  }

  function isLikelyBorderValue(value) {
    const text = String(value || "").trim();
    if (!text) {
      return false;
    }
    if (/^(var|calc|min|max|clamp)\(/i.test(text)) {
      return true;
    }
    if (/^(none|initial|inherit|unset|revert|revert-layer)$/i.test(text)) {
      return true;
    }
    if (/^([0-9.]+(px|em|rem|%)\s+)?(none|solid|dashed|dotted|double|groove|ridge|inset|outset)\s+.+$/i.test(text)) {
      return true;
    }
    return isLikelyColorValue(text);
  }

  function isLikelyBoxShadowValue(value) {
    const text = String(value || "").trim();
    if (!text) {
      return false;
    }
    if (/^(none|inherit|initial|unset|revert|revert-layer)$/i.test(text)) {
      return true;
    }
    if (/^(var|calc|min|max|clamp)\(/i.test(text)) {
      return true;
    }
    if (/(\d+(\.\d+)?(px|em|rem|%))/.test(text) || /^inset\b/i.test(text)) {
      return true;
    }
    return false;
  }

  function isValidQColorPropertyValue(propertyName, value) {
    const property = normalizeCssPropertyName(propertyName);
    const text = String(value || "").trim();
    if (!property || !text) {
      return false;
    }
    if (/[{}]/.test(text)) {
      return false;
    }
    if (property.indexOf("--") === 0) {
      return true;
    }
    if (property === "background" || property === "background-color") {
      return isLikelyColorValue(text);
    }
    if (
      property === "color" ||
      property === "border-color" ||
      property === "outline-color" ||
      property === "caret-color" ||
      property === "fill" ||
      property === "stroke"
    ) {
      return isLikelyColorValue(text);
    }
    if (property === "border") {
      return isLikelyBorderValue(text);
    }
    if (property === "box-shadow") {
      return isLikelyBoxShadowValue(text);
    }
    return true;
  }

  function applyQColorAssignmentsToNode(node, colorContext) {
    if (!node || typeof node !== "object" || !node.meta || typeof node.meta !== "object") {
      return false;
    }
    const assignments = Array.isArray(node.meta.qColorAssignments) ? node.meta.qColorAssignments : [];
    const areaGroups = Array.isArray(node.meta.qColorAreas) ? node.meta.qColorAreas : [];
    const areaValues = buildQColorAreaValueMapFromList(assignments, colorContext);
    const requestedAreas = expandQColorRequestedAreas(
      areaGroups,
      colorContext,
      areaValues,
      node.meta.qColorAreaProperties
    );
    const inlineDeclarations = [];
    const propertyOrder = [];
    const declarationMap = Object.create(null);
    const sourceAreaMap = Object.create(null);
    const missingAreaWarnings = new Set();
    for (let i = 0; i < requestedAreas.length; i += 1) {
      const areaName = requestedAreas[i];
      const value = lookupAreaValueInObject(areaValues, areaName);
      if (!value) {
        const areaKey = normalizeQColorKey(areaName);
        if (areaKey && !missingAreaWarnings.has(areaKey)) {
          missingAreaWarnings.add(areaKey);
          warnQColor("qhtml q-color unknown-area", { area: areaName });
        }
        continue;
      }
      const explicitProperty = lookupQColorPropertyOnNode(node, areaName) || lookupQColorPropertyByArea(colorContext, areaName, {
        areaValues: areaValues,
      });
      const cssProperty = explicitProperty || inferQColorCssProperty(areaName);
      if (!cssProperty) {
        continue;
      }
      if (!explicitProperty) {
        warnQColor("qhtml q-color fallback-map", {
          area: areaName,
          property: cssProperty,
        });
      }
      if (!isValidQColorPropertyValue(cssProperty, value)) {
        warnQColor("qhtml q-color invalid-value", {
          area: areaName,
          property: cssProperty,
          value: value,
        });
      }
      const normalizedProperty = normalizeCssPropertyName(cssProperty);
      if (normalizedProperty && Object.prototype.hasOwnProperty.call(declarationMap, normalizedProperty)) {
        warnQColor("qhtml q-color override", {
          area: areaName,
          overriddenArea: sourceAreaMap[normalizedProperty] || "",
          property: cssProperty,
        });
      }
      if (normalizedProperty && !Object.prototype.hasOwnProperty.call(declarationMap, normalizedProperty)) {
        propertyOrder.push(normalizedProperty);
      }
      if (normalizedProperty) {
        declarationMap[normalizedProperty] = cssProperty + ": " + value;
        sourceAreaMap[normalizedProperty] = areaName;
      }
    }
    for (let i = 0; i < propertyOrder.length; i += 1) {
      const normalizedProperty = propertyOrder[i];
      const declaration = String(declarationMap[normalizedProperty] || "").trim();
      if (!declaration) {
        continue;
      }
      inlineDeclarations.push(declaration);
    }

    const baseStyle = String(node.meta.qColorBaseStyle || "").trim();
    const declarations = requestedAreas.length > 0 ? inlineDeclarations : buildQColorStyleDeclarationsFromList(assignments, colorContext);
    const previousManaged = Array.isArray(node.meta.qColorManagedProperties)
      ? node.meta.qColorManagedProperties.slice()
      : [];
    const currentStyle = String(node.attributes && node.attributes.style || "").trim();
    const styleCompose = composeQColorStyleWithExisting({
      currentStyle: currentStyle,
      baseStyle: baseStyle,
      colorDeclarations: declarations,
      previousManagedProperties: previousManaged,
    });
    const mergedStyle = String(styleCompose.style || "").trim();
    node.meta.qColorManagedProperties = Array.isArray(styleCompose.managedProperties)
      ? styleCompose.managedProperties.slice()
      : [];
    if (!node.attributes || typeof node.attributes !== "object") {
      node.attributes = {};
    }
    const previous = String(node.attributes.style || "").trim();
    let styleChanged = false;
    if (mergedStyle) {
      node.attributes.style = mergedStyle;
      styleChanged = previous !== mergedStyle;
    } else if (Object.prototype.hasOwnProperty.call(node.attributes, "style")) {
      delete node.attributes.style;
      styleChanged = previous !== "";
    }

    if (styleChanged) {
      return true;
    }
    return false;
  }

  function collectQColorCandidateAreas(colorContext, areaValues, areaPropertyMap) {
    const out = [];
    const seen = new Set();
    function pushArea(name) {
      const areaName = String(name || "").trim();
      const normalized = normalizeQColorKey(areaName);
      if (!areaName || !normalized || seen.has(normalized)) {
        return;
      }
      seen.add(normalized);
      out.push(areaName);
    }
    if (colorContext && colorContext.schemas instanceof Map) {
      colorContext.schemas.forEach(function collectSchema(entry, key) {
        if (entry && typeof entry === "object" && String(entry.name || "").trim()) {
          pushArea(entry.name);
          return;
        }
        pushArea(key);
      });
    }
    const valueKeys = Object.keys(areaValues && typeof areaValues === "object" ? areaValues : {});
    for (let i = 0; i < valueKeys.length; i += 1) {
      pushArea(valueKeys[i]);
    }
    const propertyKeys = Object.keys(
      areaPropertyMap && typeof areaPropertyMap === "object" && !Array.isArray(areaPropertyMap)
        ? areaPropertyMap
        : {}
    );
    for (let i = 0; i < propertyKeys.length; i += 1) {
      pushArea(propertyKeys[i]);
    }
    return out;
  }

  function expandQColorRequestedAreas(areaGroups, colorContext, areaValues, areaPropertyMap) {
    const groups = Array.isArray(areaGroups) ? areaGroups : [];
    const requested = [];
    const seen = new Set();
    const candidates = collectQColorCandidateAreas(colorContext, areaValues, areaPropertyMap);
    function pushArea(name) {
      const areaName = String(name || "").trim();
      const normalized = normalizeQColorKey(areaName);
      if (!areaName || !normalized || seen.has(normalized)) {
        return;
      }
      seen.add(normalized);
      requested.push(areaName);
    }
    for (let i = 0; i < groups.length; i += 1) {
      const group = Array.isArray(groups[i]) ? groups[i] : [];
      for (let j = 0; j < group.length; j += 1) {
        const areaName = String(group[j] || "").trim();
        if (!areaName) {
          continue;
        }
        if (hasQColorWildcardPattern(areaName)) {
          let matched = false;
          for (let k = 0; k < candidates.length; k += 1) {
            const candidate = candidates[k];
            if (!doesQColorRequestMatchAreaName(areaName, candidate)) {
              continue;
            }
            pushArea(candidate);
            matched = true;
          }
          if (!matched) {
            warnQColor("qhtml q-color wildcard-no-match", { area: areaName });
          }
          continue;
        }
        pushArea(areaName);
      }
    }
    return requested;
  }

  function evaluateAllNodeQColors(binding) {
    if (!binding || !binding.qdom || !core || typeof core.walkQDom !== "function") {
      return false;
    }
    const colorContext = readDocumentQColorContext(binding);
    let changed = false;
    const changedNodes = [];
    core.walkQDom(binding.rawQdom || binding.qdom, function walkQColor(node) {
      const didChange = applyQColorAssignmentsToNode(node, colorContext);
      changed = didChange || changed;
      if (didChange) {
        changedNodes.push(node);
      }
    });
    if (changed) {
      const root = sourceNodeOf(binding.rawQdom || binding.qdom);
      if (root && typeof root === "object") {
        writeNodeUpdateNonce(root);
      }
      for (let i = 0; i < changedNodes.length; i += 1) {
        writeNodeUpdateNonce(changedNodes[i]);
      }
    }
    return changed;
  }

  function createQColorNodeFromEntry(name, entry, colorContext) {
    if (!core || typeof core.createQColorNode !== "function") {
      return null;
    }
    const nodeName = String(name || "").trim();
    if (!nodeName) {
      return null;
    }
    if (typeof entry === "string") {
      const cssProperty = String(entry || "").trim();
      const node = core.createQColorNode({
        name: nodeName,
        value: cssProperty,
        mode: "schema",
        meta: { generated: true },
      });
      node.style = function styleFromSchema(sampleValue) {
        const value = String(sampleValue == null ? "" : sampleValue).trim();
        if (!cssProperty || !value) {
          return "style { }";
        }
        return "style { " + cssProperty + ": " + value + "; }";
      };
      return node;
    }
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      const entryAssignments =
        entry.assignments && typeof entry.assignments === "object" && !Array.isArray(entry.assignments)
          ? entry.assignments
          : entry;
      const keys = Object.keys(entryAssignments);
      const assignments = {};
      for (let i = 0; i < keys.length; i += 1) {
        const key = String(keys[i] || "").trim();
        if (!key) {
          continue;
        }
        const resolved = resolveQColorValue(entryAssignments[key], colorContext);
        if (!resolved) {
          continue;
        }
        assignments[key] = resolved;
      }
      const node = core.createQColorNode({
        name: nodeName,
        assignments: assignments,
        mode: "theme",
        meta: { generated: true },
      });
      node.style = function styleFromTheme() {
        const keys = Object.keys(assignments);
        const declarations = [];
        for (let i = 0; i < keys.length; i += 1) {
          const key = String(keys[i] || "").trim();
          if (!key) {
            continue;
          }
          const cssProperty = lookupQColorPropertyByArea(colorContext, key, {
            areaValues: assignments,
          }) || inferQColorCssProperty(key);
          if (!cssProperty) {
            continue;
          }
          const value = String(assignments[key] == null ? "" : assignments[key]).trim();
          if (!value) {
            continue;
          }
          declarations.push(cssProperty + ": " + value + ";");
        }
        return "style { " + declarations.join(" ") + " }";
      };
      return node;
    }
    return null;
  }

  function hasInlineReferenceExpressions(value) {
    return typeof value === "string" && value.indexOf("${") !== -1;
  }

  function buildInlineExpressionScope(thisArg, extraScope) {
    const scope = Object.create(null);
    if (extraScope && typeof extraScope === "object") {
      const extraKeys = Object.keys(extraScope);
      for (let i = 0; i < extraKeys.length; i += 1) {
        scope[extraKeys[i]] = extraScope[extraKeys[i]];
      }
    }
    if (!Object.prototype.hasOwnProperty.call(scope, "window")) {
      scope.window = global;
    }
    if (!Object.prototype.hasOwnProperty.call(scope, "globalThis")) {
      scope.globalThis = global;
    }
    if (
      !Object.prototype.hasOwnProperty.call(scope, "document") &&
      thisArg &&
      typeof thisArg === "object" &&
      thisArg.ownerDocument
    ) {
      scope.document = thisArg.ownerDocument;
    }
    if ((typeof thisArg === "object" || typeof thisArg === "function") && thisArg) {
      scope.this = thisArg;
      if (!Object.prototype.hasOwnProperty.call(scope, "component")) {
        try {
          if (typeof thisArg.component !== "undefined" && thisArg.component !== null) {
            scope.component = thisArg.component;
          }
        } catch (ignoredReadComponent) {
          // no-op
        }
      }
    }
    if (scope.component && (typeof thisArg === "object" || typeof thisArg === "function") && thisArg) {
      try {
        if (typeof thisArg.component === "undefined" || thisArg.component === null) {
          thisArg.component = scope.component;
        }
      } catch (ignoredAssignComponent) {
        // no-op
      }
    }
    return scope;
  }

  function evaluateInlineReferenceExpression(expression, thisArg, scope, errorLabel) {
    const source = String(expression || "").trim();
    if (!source) {
      return "";
    }
    const directPathResult = tryResolveInlineReferencePath(source, thisArg, scope);
    if (directPathResult.matched) {
      return directPathResult.value;
    }
    try {
      const evaluator = new Function("__qhtmlScope", "with(__qhtmlScope){ return (" + source + "); }");
      return evaluator.call(thisArg || scope, scope);
    } catch (error) {
      if (global.console && typeof global.console.error === "function") {
        global.console.error(errorLabel || "qhtml inline expression evaluation failed:", error);
      }
      return "";
    }
  }

  function tryResolveInlineReferencePath(expression, thisArg, scope) {
    const source = String(expression || "").trim();
    if (!source) {
      return { matched: false, value: undefined };
    }

    function readPath(base, tail) {
      const parts = String(tail || "")
        .split(".")
        .map(function trimPathPart(part) {
          return String(part || "").trim();
        })
        .filter(Boolean);
      let cursor = base;
      for (let i = 0; i < parts.length; i += 1) {
        if (cursor == null) {
          return undefined;
        }
        try {
          cursor = cursor[parts[i]];
        } catch (error) {
          return undefined;
        }
      }
      return cursor;
    }

    if (/^this\.component\.[A-Za-z_$][A-Za-z0-9_$]*(\.[A-Za-z_$][A-Za-z0-9_$]*)*$/.test(source)) {
      const componentSource =
        (thisArg && (typeof thisArg === "object" || typeof thisArg === "function") && thisArg.component) ||
        (scope && typeof scope === "object" ? scope.component : null) ||
        null;
      return {
        matched: true,
        value: readPath(componentSource, source.slice("this.component.".length)),
      };
    }

    if (/^component\.[A-Za-z_$][A-Za-z0-9_$]*(\.[A-Za-z_$][A-Za-z0-9_$]*)*$/.test(source)) {
      const componentSource = scope && typeof scope === "object" ? scope.component : null;
      return {
        matched: true,
        value: readPath(componentSource, source.slice("component.".length)),
      };
    }

    if (/^this\.[A-Za-z_$][A-Za-z0-9_$]*(\.[A-Za-z_$][A-Za-z0-9_$]*)*$/.test(source)) {
      return {
        matched: true,
        value: readPath(thisArg, source.slice("this.".length)),
      };
    }

    return { matched: false, value: undefined };
  }

  function interpolateInlineReferenceExpressions(source, thisArg, extraScope, errorLabel) {
    const text = String(source == null ? "" : source);
    if (!hasInlineReferenceExpressions(text)) {
      return text;
    }
    const escaped = text.replace(/\\\$\{/g, INLINE_REFERENCE_ESCAPE_TOKEN);
    const scope = buildInlineExpressionScope(thisArg, extraScope);
    const replaced = escaped.replace(INLINE_REFERENCE_PATTERN, function replaceInlineReference(matchText, expressionText) {
      const value = evaluateInlineReferenceExpression(expressionText, thisArg, scope, errorLabel);
      if (value == null) {
        return "";
      }
      return String(value);
    });
    return replaced.split(INLINE_REFERENCE_ESCAPE_TOKEN).join("${");
  }

  function resolvePathValue(rootNode, path, endIndexExclusive) {
    if (!rootNode || !Array.isArray(path)) {
      return null;
    }
    const limit =
      typeof endIndexExclusive === "number"
        ? Math.max(0, Math.min(path.length, endIndexExclusive))
        : path.length;
    let cursor = rootNode;
    for (let i = 0; i < limit; i += 1) {
      if (!cursor || (typeof cursor !== "object" && typeof cursor !== "function")) {
        return null;
      }
      const key = String(path[i] || "");
      if (Array.isArray(cursor) && isNumericPathSegment(key)) {
        cursor = cursor[Number(key)];
      } else {
        cursor = cursor[key];
      }
    }
    return cursor;
  }

  function registerMappedDomElement(binding, qdomNode, domElement) {
    if (!binding || !qdomNode || typeof qdomNode !== "object" || !domElement || domElement.nodeType !== 1) {
      return;
    }
    if (!binding.domByQdomNode || typeof binding.domByQdomNode.get !== "function") {
      binding.domByQdomNode = new WeakMap();
    }
    let bucket = binding.domByQdomNode.get(qdomNode);
    if (!bucket) {
      bucket = new Set();
      binding.domByQdomNode.set(qdomNode, bucket);
    }
    bucket.add(domElement);
  }

  function collectMappedDomElements(binding, qdomNode) {
    if (!binding || !qdomNode || typeof qdomNode !== "object" || !binding.domByQdomNode) {
      return [];
    }
    const bucket = binding.domByQdomNode.get(qdomNode);
    if (!bucket || typeof bucket.forEach !== "function") {
      return [];
    }
    const out = [];
    bucket.forEach(function eachElement(candidate) {
      if (!candidate || candidate.nodeType !== 1) {
        return;
      }
      if (candidate.isConnected === false) {
        return;
      }
      out.push(candidate);
    });
    return out;
  }

  function isFormControlElement(element) {
    if (!element || element.nodeType !== 1) {
      return false;
    }
    const tagName = String(element.tagName || "").trim().toLowerCase();
    return FORM_CONTROL_TAGS.has(tagName);
  }

  function setDomMutationSyncEnabled(value) {
    domMutationSyncEnabled = value !== false;
    return domMutationSyncEnabled;
  }

  function isDomMutationSyncGloballyEnabled() {
    if (domMutationSyncEnabled === false) {
      return false;
    }
    return domMutationSyncSuspendDepth <= 0;
  }

  function withDomMutationSyncGloballySuspended(callback) {
    if (typeof callback !== "function") {
      return undefined;
    }
    domMutationSyncSuspendDepth += 1;
    try {
      return callback();
    } finally {
      domMutationSyncSuspendDepth = Math.max(0, domMutationSyncSuspendDepth - 1);
    }
  }

  function installGlobalDomMutationSyncToggle() {
    try {
      Object.defineProperty(global, "QHTML_MUTATION_OBSERVERS_ENABLED", {
        configurable: true,
        enumerable: false,
        get: function qhtmlMutationObserversEnabledGetter() {
          return domMutationSyncEnabled;
        },
        set: function qhtmlMutationObserversEnabledSetter(value) {
          setDomMutationSyncEnabled(value);
        },
      });
    } catch (error) {
      global.QHTML_MUTATION_OBSERVERS_ENABLED = domMutationSyncEnabled;
    }
  }

  function qdomNodeHasStructuralChildren(qdomNode) {
    if (!qdomNode || typeof qdomNode !== "object") {
      return false;
    }
    if (Array.isArray(qdomNode.nodes) && qdomNode.nodes.length > 0) {
      return true;
    }
    if (Array.isArray(qdomNode.templateNodes) && qdomNode.templateNodes.length > 0) {
      return true;
    }
    if (Array.isArray(qdomNode.children) && qdomNode.children.length > 0) {
      return true;
    }
    return false;
  }

  function isLeafQDomNode(qdomNode) {
    return !qdomNodeHasStructuralChildren(qdomNode);
  }

  function collectLeafObservedDomTargets(binding) {
    if (!binding || !binding.host) {
      return [];
    }
    const allElements = collectElementScope(binding.host);
    const out = [];
    const seen = new Set();
    for (let i = 0; i < allElements.length; i += 1) {
      const element = allElements[i];
      if (!element || element.nodeType !== 1 || seen.has(element)) {
        continue;
      }
      if (shouldIgnoreDomMutationSyncElement(element)) {
        continue;
      }
      const qdomNode = resolveDomElementQDomNode(binding, element);
      if (!qdomNode || !isLeafQDomNode(qdomNode)) {
        continue;
      }
      seen.add(element);
      out.push(element);
    }
    return out;
  }

  function refreshDomMutationObserverTargets(binding) {
    if (!binding || !binding.domMutationObserver || typeof binding.domMutationObserver.observe !== "function") {
      return;
    }
    const observer = binding.domMutationObserver;
    if (typeof observer.disconnect === "function") {
      observer.disconnect();
    }
    const targets = collectLeafObservedDomTargets(binding);
    binding.domMutationObservedElements = targets;
    for (let i = 0; i < targets.length; i += 1) {
      observer.observe(targets[i], DOM_MUTATION_SYNC_OBSERVER_OPTIONS);
    }
  }

  function reconnectDomMutationObserverTargets(binding) {
    if (!binding || !binding.domMutationObserver || typeof binding.domMutationObserver.observe !== "function") {
      return;
    }
    const observer = binding.domMutationObserver;
    if (typeof observer.disconnect === "function") {
      observer.disconnect();
    }
    const host = binding.host;
    const existingTargets = Array.isArray(binding.domMutationObservedElements) ? binding.domMutationObservedElements : [];
    const nextTargets = [];
    for (let i = 0; i < existingTargets.length; i += 1) {
      const target = existingTargets[i];
      if (!target || target.nodeType !== 1 || target.isConnected === false) {
        continue;
      }
      if (!host || (typeof host.contains === "function" && !host.contains(target))) {
        continue;
      }
      nextTargets.push(target);
      observer.observe(target, DOM_MUTATION_SYNC_OBSERVER_OPTIONS);
    }
    binding.domMutationObservedElements = nextTargets;
  }

  function isDomMutationDirtyAttributeName(attributeName) {
    return String(attributeName || "").trim().toLowerCase() === DOM_MUTATION_DIRTY_ATTRIBUTE;
  }

  function shouldIgnoreDomMutationSyncElement(element) {
    if (!element || element.nodeType !== 1 || typeof element.closest !== "function") {
      return false;
    }
    return !!element.closest("q-builder[q-builder-runtime='1']");
  }

  function markDomElementUnsynced(binding, domElement) {
    if (!binding || !domElement || domElement.nodeType !== 1) {
      return false;
    }
    if (shouldIgnoreDomMutationSyncElement(domElement)) {
      return false;
    }
    const qdomNode = resolveDomElementQDomNode(binding, domElement);
    if (!qdomNode || !isLeafQDomNode(qdomNode)) {
      return false;
    }
    if (!binding.domMutationDirtyElements || typeof binding.domMutationDirtyElements.add !== "function") {
      binding.domMutationDirtyElements = new Set();
    }
    if (!Array.isArray(binding.domMutationDirtyQueue)) {
      binding.domMutationDirtyQueue = [];
    }
    const dirtySet = binding.domMutationDirtyElements;
    const isNewDirty = !dirtySet.has(domElement);
    dirtySet.add(domElement);
    if (isNewDirty) {
      binding.domMutationDirtyQueue.push(domElement);
    }
    try {
      if (typeof domElement.getAttribute === "function" && domElement.getAttribute(DOM_MUTATION_DIRTY_ATTRIBUTE) !== "1") {
        domElement.setAttribute(DOM_MUTATION_DIRTY_ATTRIBUTE, "1");
      }
    } catch (error) {
      // ignore dirty marker attribute failures
    }
    return isNewDirty;
  }

  function clearDomElementUnsynced(binding, domElement) {
    if (binding && binding.domMutationDirtyElements && typeof binding.domMutationDirtyElements.delete === "function") {
      binding.domMutationDirtyElements.delete(domElement);
    }
    if (!domElement || domElement.nodeType !== 1 || typeof domElement.removeAttribute !== "function") {
      return;
    }
    try {
      domElement.removeAttribute(DOM_MUTATION_DIRTY_ATTRIBUTE);
    } catch (error) {
      // ignore dirty marker attribute failures
    }
  }

  function schedulePendingDomMutationSyncFlush(binding) {
    if (!binding || !binding.host || bindings.get(binding.host) !== binding) {
      return;
    }
    if (binding.domMutationFlushTimer || typeof global.setTimeout !== "function") {
      return;
    }
    binding.domMutationFlushTimer = global.setTimeout(function onDeferredDomMutationSyncFlush() {
      binding.domMutationFlushTimer = null;
      flushPendingDomMutationSync(binding, {
        maxItems: DOM_MUTATION_SYNC_FLUSH_BATCH_SIZE,
        scheduleRemainder: true,
      });
    }, DOM_MUTATION_SYNC_FLUSH_DELAY_MS);
  }

  function isInternalRuntimeAttributeName(attributeName) {
    const key = String(attributeName || "").trim().toLowerCase();
    if (!key) {
      return true;
    }
    if (key.indexOf("__qhtml") === 0) {
      return true;
    }
    if (key.indexOf("qhtml-") === 0) {
      return true;
    }
    return false;
  }

  function withDomMutationSyncSuppressed(binding, callback) {
    if (typeof callback !== "function") {
      return undefined;
    }
    return withDomMutationSyncGloballySuspended(function runSuppressed() {
      if (!binding || typeof binding !== "object") {
        return callback();
      }
      if (typeof binding.domMutationSyncSuppressDepth !== "number" || !Number.isFinite(binding.domMutationSyncSuppressDepth)) {
        binding.domMutationSyncSuppressDepth = 0;
      }
      const shouldTemporarilyDisconnect =
        binding.domMutationSyncSuppressDepth === 0 &&
        binding.domMutationSyncAttached === true &&
        binding.domMutationObserver &&
        typeof binding.domMutationObserver.disconnect === "function";
      if (shouldTemporarilyDisconnect) {
        try {
          binding.domMutationObserver.disconnect();
        } catch (error) {
          // ignore observer disconnect errors
        }
      }
      binding.domMutationSyncSuppressDepth += 1;
      try {
        return callback();
      } finally {
        binding.domMutationSyncSuppressDepth = Math.max(0, binding.domMutationSyncSuppressDepth - 1);
      if (
        shouldTemporarilyDisconnect &&
        binding.domMutationSyncSuppressDepth === 0 &&
        binding.domMutationSyncAttached === true &&
        binding.domMutationObserver &&
          typeof binding.domMutationObserver.observe === "function" &&
          binding.host &&
          bindings.get(binding.host) === binding
      ) {
        try {
          reconnectDomMutationObserverTargets(binding);
        } catch (error) {
          if (global.console && typeof global.console.error === "function") {
            global.console.error("qhtml DOM mutation sync observe failed:", error);
          }
          }
        }
      }
    });
  }

  function isDomMutationSyncSuppressed(binding) {
    return !!(
      binding &&
      typeof binding.domMutationSyncSuppressDepth === "number" &&
      Number.isFinite(binding.domMutationSyncSuppressDepth) &&
      binding.domMutationSyncSuppressDepth > 0
    );
  }

  function persistQDomTemplate(binding) {
    if (!binding || !binding.host) {
      return;
    }
    if (bindings.get(binding.host) !== binding) {
      return;
    }
    core.saveQDomTemplateBefore(binding.host, binding.rawQdom || binding.qdom, binding.doc);
  }

  function scheduleTemplatePersistence(binding) {
    if (!binding) {
      return;
    }
    persistQDomTemplate(binding);
  }

  function describeElementForLog(element) {
    if (!element || element.nodeType !== 1) {
      return "<unknown>";
    }
    const tag = String(element.tagName || "").trim().toLowerCase() || "<unknown>";
    const id = typeof element.getAttribute === "function" ? String(element.getAttribute("id") || "").trim() : "";
    return id ? tag + "#" + id : tag;
  }

  function isRuntimeDebugLoggingEnabled() {
    return !!(global && (global.QHTML_RUNTIME_DEBUG === true || global.QHTML_DEBUG === true));
  }

  function logRuntimeEvent(message, details) {
    if (!isRuntimeDebugLoggingEnabled()) {
      return;
    }
    if (!global.console || typeof global.console.log !== "function") {
      return;
    }
    try {
      if (typeof details === "undefined") {
        global.console.log(String(message || "qhtml"));
      } else {
        global.console.log(String(message || "qhtml"), details);
      }
    } catch (error) {
      // ignore logging errors
    }
  }

  function getSignalDocument(root) {
    if (root && root.nodeType === 9) {
      return root;
    }
    if (root && root.ownerDocument) {
      return root.ownerDocument;
    }
    return global.document || null;
  }

  function ensureContentLoadedState(doc) {
    if (!doc || (typeof doc !== "object" && typeof doc !== "function")) {
      return null;
    }
    let state = doc.__qhtmlContentLoadedState;
    if (!state || typeof state !== "object") {
      state = {
        pending: 0,
        sequence: 0,
        timestamp: 0,
        emitQueued: false,
        runtimeManaged: false,
        callbacks: [],
      };
      try {
        Object.defineProperty(doc, "__qhtmlContentLoadedState", {
          value: state,
          configurable: true,
          writable: true,
          enumerable: false,
        });
      } catch (error) {
        doc.__qhtmlContentLoadedState = state;
      }
    }
    if (typeof state.pending !== "number") state.pending = 0;
    if (typeof state.sequence !== "number") state.sequence = 0;
    if (typeof state.timestamp !== "number") state.timestamp = 0;
    if (typeof state.emitQueued !== "boolean") state.emitQueued = false;
    if (typeof state.runtimeManaged !== "boolean") state.runtimeManaged = false;
    if (!Array.isArray(state.callbacks)) state.callbacks = [];
    return state;
  }

  function enqueueContentLoadedCallback(doc, callback) {
    if (typeof callback !== "function") {
      return false;
    }
    const state = ensureContentLoadedState(doc);
    if (!state) {
      return false;
    }
    state.callbacks.push(callback);
    return true;
  }

  function flushContentLoadedCallbacks(doc, detail) {
    const state = ensureContentLoadedState(doc);
    if (!state || !Array.isArray(state.callbacks) || state.callbacks.length === 0) {
      return;
    }
    const callbacks = state.callbacks.splice(0, state.callbacks.length);
    for (let i = 0; i < callbacks.length; i += 1) {
      const callback = callbacks[i];
      if (typeof callback !== "function") {
        continue;
      }
      try {
        callback(detail);
      } catch (error) {
        if (global.console && typeof global.console.error === "function") {
          global.console.error("qhtml content-loaded callback failed:", error);
        }
      }
    }
  }

  function createSignalEvent(detail) {
    if (typeof global.CustomEvent === "function") {
      return new global.CustomEvent(QHTML_CONTENT_LOADED_EVENT, { detail: detail });
    }
    return {
      type: QHTML_CONTENT_LOADED_EVENT,
      detail: detail,
    };
  }

  function createQSignalEvent(payload) {
    if (typeof global.CustomEvent === "function") {
      return new global.CustomEvent("q-signal", {
        detail: payload || {},
        bubbles: true,
        composed: true,
      });
    }
    return {
      type: "q-signal",
      detail: payload || {},
    };
  }

  function emitQSignal(target, payload, eventNamePrefix) {
    const resolvedTarget =
      target && typeof target.dispatchEvent === "function"
        ? target
        : global.document && typeof global.document.dispatchEvent === "function"
          ? global.document
          : null;
    const normalizedPayload = payload && typeof payload === "object" ? payload : {};
    const signalName = String(normalizedPayload.signal || "").trim();
    const prefix = String(eventNamePrefix || "").trim();
    const emitted = {
      qSignal: false,
      namespaced: false,
    };
    if (!resolvedTarget) {
      return emitted;
    }
    try {
      resolvedTarget.dispatchEvent(createQSignalEvent(normalizedPayload));
      emitted.qSignal = true;
    } catch (error) {
      if (global.console && typeof global.console.error === "function") {
        global.console.error("qhtml emitQSignal failed:", error);
      }
    }
    if (prefix && signalName && typeof global.CustomEvent === "function") {
      try {
        resolvedTarget.dispatchEvent(
          new global.CustomEvent(prefix + ":" + signalName, {
            detail: normalizedPayload,
            bubbles: true,
            composed: true,
          })
        );
        emitted.namespaced = true;
      } catch (error) {
        if (global.console && typeof global.console.error === "function") {
          global.console.error("qhtml emitQSignal namespaced dispatch failed:", error);
        }
      }
    }
    return emitted;
  }

  function emitContentLoadedSignal(doc, source) {
    const state = ensureContentLoadedState(doc);
    if (!state) {
      return;
    }
    state.sequence += 1;
    state.pending = 0;
    state.timestamp = Date.now();
    const detail = {
      sequence: state.sequence,
      pending: state.pending,
      timestamp: state.timestamp,
      source: source || null,
    };
    flushContentLoadedCallbacks(doc, detail);

    if (typeof doc.dispatchEvent === "function") {
      try {
        doc.dispatchEvent(createSignalEvent(detail));
      } catch (error) {
        if (global.console && typeof global.console.error === "function") {
          global.console.error("qhtml failed to dispatch QHTMLContentLoaded on document:", error);
        }
      }
    }

    if (global && global !== doc && typeof global.dispatchEvent === "function") {
      try {
        global.dispatchEvent(createSignalEvent(detail));
      } catch (error) {
        if (global.console && typeof global.console.error === "function") {
          global.console.error("qhtml failed to dispatch QHTMLContentLoaded on global:", error);
        }
      }
    }
  }

  function scheduleContentLoadedSignal(doc, source) {
    const state = ensureContentLoadedState(doc);
    if (!state) {
      return;
    }
    if (state.pending > 0 || state.emitQueued) {
      return;
    }
    state.emitQueued = true;

    const dispatch = function dispatchWhenSettled() {
      const latest = ensureContentLoadedState(doc);
      if (!latest) {
        return;
      }
      latest.emitQueued = false;
      if (latest.pending > 0) {
        return;
      }
      emitContentLoadedSignal(doc, source);
    };

    if (typeof global.setTimeout === "function") {
      global.setTimeout(dispatch, 0);
    } else {
      dispatch();
    }
  }

  function markMountPending(doc) {
    const state = ensureContentLoadedState(doc);
    if (!state) {
      return;
    }
    state.runtimeManaged = true;
    state.pending += 1;
    state.timestamp = Date.now();
  }

  function markMountSettled(doc, source) {
    const state = ensureContentLoadedState(doc);
    if (!state) {
      return;
    }
    state.runtimeManaged = true;
    if (state.pending > 0) {
      state.pending -= 1;
    }
    state.timestamp = Date.now();
    scheduleContentLoadedSignal(doc, source);
  }

  function isOnReadyHookName(name) {
    return String(name || "").trim().toLowerCase() === "onready";
  }

  function runLifecycleHookBody(target, body, doc, errorLabel) {
    const source = typeof body === "string" ? body.trim() : "";
    if (!source) {
      return;
    }
    try {
      const componentContext =
        target && (typeof target === "object" || typeof target === "function")
          ? target.component || (typeof resolveNearestComponentHost === "function" ? resolveNearestComponentHost(target) : null)
          : null;
      const executableSource = interpolateInlineReferenceExpressions(
        source,
        target || {},
        {
          component: componentContext,
          document: doc || (target && target.ownerDocument) || global.document || null,
        },
        "qhtml lifecycle interpolation failed:"
      );
      const fn = new Function("event", "document", executableSource);
      fn.call(target, null, doc);
    } catch (error) {
      if (global.console && typeof global.console.error === "function") {
        global.console.error(errorLabel, error);
      }
    }
  }

  function queueHostOnReadyHook(binding, hook) {
    if (!binding || !hook) {
      return;
    }
    const doc = binding.doc || getSignalDocument(binding.host);
    const state = ensureContentLoadedState(doc);
    const key = String(hook.name || "onready") + "::" + String(hook.body || "");
    if (!binding.readyHooksState || typeof binding.readyHooksState !== "object") {
      binding.readyHooksState = {};
    }
    if (binding.readyHooksState[key] === "pending" || binding.readyHooksState[key] === "done") {
      return;
    }
    binding.readyHooksState[key] = "pending";

    const execute = function executeHostOnReady() {
      if (binding.readyHooksState[key] === "done") {
        return;
      }
      binding.readyHooksState[key] = "done";
      runLifecycleHookBody(binding.host, hook.body, doc, "qhtml host lifecycle hook failed:");
    };

    const alreadySignaled = !!(state && Number(state.sequence || 0) > 0 && Number(state.pending || 0) === 0);
    if (!state || !state.runtimeManaged || alreadySignaled) {
      execute();
      return;
    }

    if (!enqueueContentLoadedCallback(doc, execute)) {
      execute();
      return;
    }
  }

  function isQScriptElement(node) {
    return !!node && node.nodeType === 1 && String(node.tagName || "").toLowerCase() === "q-script";
  }

  function findCompanionQScript(qHtmlElement) {
    const next = qHtmlElement ? qHtmlElement.nextElementSibling : null;
    if (isQScriptElement(next)) {
      return next;
    }
    return null;
  }

  function transformScriptBody(body) {
    if (typeof body !== "string" || body.length === 0) {
      return "";
    }
    return body.replace(/(^|[^A-Za-z0-9_$])#([A-Za-z_][A-Za-z0-9_-]*)/g, function replaceSelector(_, prefix, id) {
      return prefix + 'document.querySelector("#' + id + '")';
    });
  }

  function serializeSourceChildNode(node) {
    if (!node || typeof node !== "object") {
      return "";
    }
    if (node.nodeType === 3) {
      return String(node.nodeValue || "");
    }
    if (node.nodeType === 4) {
      return "<![CDATA[" + String(node.nodeValue || "") + "]]>";
    }
    if (node.nodeType === 8) {
      return "<!--" + String(node.nodeValue || "") + "-->";
    }
    if (node.nodeType === 1) {
      if (typeof node.outerHTML === "string") {
        return node.outerHTML;
      }
      const tagName = String(node.tagName || "").trim().toLowerCase() || "div";
      const attrs = node.attributes && typeof node.attributes.length === "number" ? node.attributes : [];
      let attrText = "";
      for (let i = 0; i < attrs.length; i += 1) {
        const attr = attrs[i];
        if (!attr || typeof attr.name !== "string") {
          continue;
        }
        const value = String(attr.value == null ? "" : attr.value).replace(/"/g, "&quot;");
        attrText += " " + attr.name + '="' + value + '"';
      }
      const children = node.childNodes && typeof node.childNodes.length === "number" ? node.childNodes : [];
      let inner = "";
      for (let i = 0; i < children.length; i += 1) {
        inner += serializeSourceChildNode(children[i]);
      }
      return "<" + tagName + attrText + ">" + inner + "</" + tagName + ">";
    }
    return "";
  }

  function readInlineSourceFromElement(element) {
    if (!element || element.nodeType !== 1) {
      return "";
    }
    const children = element.childNodes && typeof element.childNodes.length === "number" ? element.childNodes : [];
    if (children.length === 0) {
      return typeof element.textContent === "string" ? element.textContent : "";
    }
    let out = "";
    for (let i = 0; i < children.length; i += 1) {
      out += serializeSourceChildNode(children[i]);
    }
    return out;
  }

  function resolveImportBaseUrl(qHtmlElement, options) {
    const opts = options || {};
    if (typeof opts.importBaseUrl === "string" && opts.importBaseUrl.trim()) {
      return opts.importBaseUrl.trim();
    }

    const ownerDocument = qHtmlElement ? qHtmlElement.ownerDocument : null;
    if (ownerDocument && typeof ownerDocument.baseURI === "string" && ownerDocument.baseURI.trim()) {
      return ownerDocument.baseURI.trim();
    }

    if (global.location && typeof global.location.href === "string" && global.location.href.trim()) {
      return global.location.href.trim();
    }

    return "";
  }

  function normalizeImportedSource(sourceText) {
    const text = String(sourceText || "");
    const wrapper = text.match(/^\s*<\s*q-html[^>]*>([\s\S]*?)<\s*\/\s*q-html\s*>\s*$/i);
    if (wrapper) {
      return String(wrapper[1] || "");
    }
    return text;
  }

  async function loadImportSource(url) {
    const key = String(url || "").trim();
    if (!key) {
      throw new Error("q-import URL cannot be empty.");
    }
    if (importSourceCache.has(key)) {
      return importSourceCache.get(key);
    }

    if (typeof global.fetch !== "function") {
      throw new Error("q-import requires fetch() support.");
    }

    const pending = (async function fetchImport() {
      let response;
      try {
        response = await global.fetch(key);
      } catch (error) {
        throw new Error("q-import failed to load '" + key + "': " + error.message);
      }

      const status = Number(response && typeof response.status !== "undefined" ? response.status : 200);
      const ok = !!response && (response.ok === true || (status >= 200 && status < 300) || status === 0);
      if (!ok) {
        throw new Error("q-import failed to load '" + key + "' (status " + status + ").");
      }

      const text =
        response && typeof response.text === "function"
          ? await response.text()
          : String(response && typeof response.body !== "undefined" ? response.body : "");
      return normalizeImportedSource(text);
    })();

    importSourceCache.set(key, pending);
    try {
      const loaded = await pending;
      importSourceCache.set(key, Promise.resolve(loaded));
      return loaded;
    } catch (error) {
      importSourceCache.delete(key);
      throw error;
    }
  }

  function inferDefinitionType(definitionNode) {
    if (!definitionNode || typeof definitionNode !== "object") {
      return "component";
    }
    const explicit = String(definitionNode.definitionType || "").trim().toLowerCase();
    if (explicit === "component" || explicit === "template" || explicit === "signal") {
      return explicit;
    }
    const originalSource =
      definitionNode.meta && typeof definitionNode.meta.originalSource === "string"
        ? definitionNode.meta.originalSource.trim().toLowerCase()
        : "";
    if (originalSource.startsWith("q-template")) {
      return "template";
    }
    if (originalSource.startsWith("q-signal")) {
      return "signal";
    }
    return "component";
  }

  function isValidCustomElementName(name) {
    const value = String(name || "").trim().toLowerCase();
    if (!value || value.indexOf("-") === -1) {
      return false;
    }
    return /^[a-z][.0-9_a-z-]*-[.0-9_a-z-]*$/.test(value);
  }

  function registerDefinitionsFromDocument(documentNode) {
    const registry = renderer.collectComponentRegistry(documentNode);
    registry.forEach(function storeDefinition(definitionNode, definitionId) {
      const normalizedId = String(definitionId || "").trim().toLowerCase();
      if (!normalizedId) {
        return;
      }
      definitionRegistry.set(normalizedId, definitionNode);
      if (inferDefinitionType(definitionNode) === "component") {
        registerCustomElementDefinition(normalizedId);
      }
    });
  }

  function isWithinQHtml(element) {
    if (!element || element.nodeType !== 1 || typeof element.closest !== "function") {
      return false;
    }
    return !!element.closest("q-html");
  }

  function hydrateHostElementIfNeeded(hostElement, definitionId, definitionNode, targetDocument) {
    if (!hostElement || hostElement.nodeType !== 1) {
      return;
    }

    const hostTag = String(hostElement.tagName || "").toLowerCase();
    if (hostTag !== definitionId) {
      return;
    }

    const internalMarker = hostElement.getAttribute ? hostElement.getAttribute("qhtml-component-instance") : "";
    const externalMarker = hostElement.getAttribute ? hostElement.getAttribute("qhtml-external-component-instance") : "";
    if (internalMarker === "1") {
      return;
    }
    if (isWithinQHtml(hostElement) && externalMarker !== "1") {
      return;
    }

    try {
      renderer.renderComponentElement(definitionNode, hostElement, targetDocument, {
        componentRegistry: definitionRegistry,
        externalInstance: true,
      });
    } catch (error) {
      if (global.console && typeof global.console.error === "function") {
        global.console.error("qhtml component hydration failed for <" + definitionId + ">:", error);
      }
    }
  }

  function hydrateComponentElement(hostElement, targetDocument) {
    if (!hostElement || hostElement.nodeType !== 1) {
      return false;
    }
    const definitionId = String(hostElement.tagName || "").toLowerCase();
    if (!definitionId) {
      return false;
    }
    const definitionNode = definitionRegistry.get(definitionId);
    if (!definitionNode || inferDefinitionType(definitionNode) !== "component") {
      return false;
    }
    hydrateHostElementIfNeeded(hostElement, definitionId, definitionNode, targetDocument);
    return true;
  }

  function registerCustomElementDefinition(definitionId) {
    const id = String(definitionId || "").trim().toLowerCase();
    if (!id || registeredCustomElements.has(id)) {
      return;
    }
    if (!isValidCustomElementName(id)) {
      return;
    }

    const registry = global.customElements;
    if (!registry || typeof registry.define !== "function" || typeof registry.get !== "function") {
      return;
    }
    if (registry.get(id)) {
      registeredCustomElements.add(id);
      return;
    }
    if (typeof global.HTMLElement !== "function") {
      return;
    }

    class QHtmlRuntimeComponentElement extends global.HTMLElement {
      connectedCallback() {
        hydrateComponentElement(this, this.ownerDocument || global.document);
      }
    }

    try {
      registry.define(id, QHtmlRuntimeComponentElement);
      registeredCustomElements.add(id);
    } catch (error) {
      if (registry.get(id)) {
        registeredCustomElements.add(id);
        return;
      }
      if (global.console && typeof global.console.error === "function") {
        global.console.error("qhtml custom element registration failed for <" + id + ">:", error);
      }
    }
  }

  function hydrateRegisteredComponentHostsInNode(rootNode, targetDocument) {
    const doc = targetDocument || (rootNode && rootNode.ownerDocument) || global.document;
    if (!doc || definitionRegistry.size === 0) {
      return;
    }

    definitionRegistry.forEach(function eachDefinition(definitionNode, definitionId) {
      if (inferDefinitionType(definitionNode) !== "component") {
        return;
      }
      if (!definitionId) {
        return;
      }

      if (rootNode && rootNode.nodeType === 1) {
        hydrateHostElementIfNeeded(rootNode, definitionId, definitionNode, doc);
      }

      const scope = rootNode && typeof rootNode.querySelectorAll === "function" ? rootNode : doc;
      if (!scope || typeof scope.querySelectorAll !== "function") {
        return;
      }
      const matches = scope.querySelectorAll(definitionId);
      for (let i = 0; i < matches.length; i += 1) {
        hydrateHostElementIfNeeded(matches[i], definitionId, definitionNode, doc);
      }
    });
  }

  function detachAllScriptListeners(binding) {
    if (!binding || !Array.isArray(binding.listeners)) {
      return;
    }
    for (let i = 0; i < binding.listeners.length; i += 1) {
      const entry = binding.listeners[i];
      try {
        entry.target.removeEventListener(entry.eventName, entry.handler);
      } catch (error) {
        // ignore listener detach errors during lifecycle teardown
      }
    }
    binding.listeners.length = 0;
  }

  function attachScriptRules(binding) {
    detachAllScriptListeners(binding);

    const rules = Array.isArray(binding.qdom.scripts) ? binding.qdom.scripts : [];
    const doc = binding.doc;

    for (let i = 0; i < rules.length; i += 1) {
      const rule = rules[i];
      if (!rule || rule.kind !== core.NODE_TYPES.scriptRule) {
        continue;
      }

      const selector = String(rule.selector || "").trim();
      const eventName = String(rule.eventName || "").trim();
      if (!selector || !eventName) {
        continue;
      }

      const body = transformScriptBody(String(rule.body || ""));
      const hasInterpolatedBody = hasInlineReferenceExpressions(body);
      let executor;
      if (!hasInterpolatedBody) {
        try {
          executor = new Function("event", "document", body);
        } catch (error) {
          throw new Error("Failed to compile q-script rule for selector '" + selector + "': " + error.message);
        }
      }

      const targets = doc.querySelectorAll(selector);
      for (let j = 0; j < targets.length; j += 1) {
        const target = targets[j];
        const handler = function qScriptHandler(event) {
          if (hasInterpolatedBody) {
            const componentContext =
              target && (typeof target === "object" || typeof target === "function")
                ? target.component ||
                  (typeof resolveNearestComponentHost === "function" ? resolveNearestComponentHost(target) : null)
                : null;
            const interpolatedBody = interpolateInlineReferenceExpressions(
              body,
              target,
              {
                component: componentContext,
                event: event,
                document: doc,
                root: binding.host,
              },
              "qhtml q-script interpolation failed:"
            );
            try {
              const dynamicExecutor = new Function("event", "document", interpolatedBody);
              return dynamicExecutor.call(target, event, doc);
            } catch (error) {
              if (global.console && typeof global.console.error === "function") {
                global.console.error("qhtml q-script rule compile failed:", error);
              }
              return undefined;
            }
          }
          return executor.call(target, event, doc);
        };
        target.addEventListener(eventName, handler);
        binding.listeners.push({
          target: target,
          eventName: eventName,
          handler: handler,
        });
      }
    }
  }

  function runHostLifecycleHooks(binding) {
    if (!binding || binding.hostLifecycleRan) {
      return;
    }

    const lifecycleScripts =
      binding.qdom &&
      binding.qdom.meta &&
      Array.isArray(binding.qdom.meta.lifecycleScripts)
        ? binding.qdom.meta.lifecycleScripts
        : [];

    for (let i = 0; i < lifecycleScripts.length; i += 1) {
      const hook = lifecycleScripts[i];
      const body = hook && typeof hook.body === "string" ? hook.body.trim() : "";
      if (!body) {
        continue;
      }
      const hookName = hook && typeof hook.name === "string" ? hook.name : "";
      if (isOnReadyHookName(hookName)) {
        queueHostOnReadyHook(binding, hook);
      } else {
        runLifecycleHookBody(binding.host, body, binding.doc, "qhtml host lifecycle hook failed:");
      }
    }

    binding.hostLifecycleRan = true;
  }

  function normalizeMutationPath(path) {
    if (!Array.isArray(path)) {
      return [];
    }
    return path.map(function mapSegment(segment) {
      return String(segment || "");
    });
  }

  function mutationNeedsFullRender(mutation) {
    if (!mutation || typeof mutation !== "object") {
      return true;
    }
    const path = normalizeMutationPath(mutation.path);
    if (path.length === 0) {
      return true;
    }

    const last = path[path.length - 1];
    const prev = path.length > 1 ? path[path.length - 2] : "";
    const prev2 = path.length > 2 ? path[path.length - 3] : "";
    const tail = path.slice(Math.max(0, path.length - 4));

    if (prev === "attributes") {
      return false;
    }
    if (last === "attributes") {
      return false;
    }
    if (last === "textContent" || last === "value" || last === "meta" || prev === "meta") {
      return false;
    }
    if (last.indexOf("__qhtml") === 0 || prev.indexOf("__qhtml") === 0) {
      return false;
    }
    if (COLLECTION_MUTATION_KEYS.has(last)) {
      return true;
    }
    if (COLLECTION_MUTATION_KEYS.has(prev) && (isNumericPathSegment(last) || last === "length")) {
      return true;
    }
    if (FORCED_FULL_RENDER_KEYS.has(last)) {
      return true;
    }
    if (
      tail.indexOf("methods") !== -1 ||
      tail.indexOf("lifecycleScripts") !== -1 ||
      tail.indexOf("aliasDeclarations") !== -1 ||
      tail.indexOf("scripts") !== -1
    ) {
      return true;
    }
    if (isNumericPathSegment(last) && FORCED_FULL_RENDER_KEYS.has(prev)) {
      return true;
    }
    if (isNumericPathSegment(prev) && FORCED_FULL_RENDER_KEYS.has(prev2)) {
      return true;
    }
    return false;
  }

  function resolveMutationNode(binding, mutation, path) {
    if (!binding || !binding.qdom) {
      return null;
    }
    const segments = Array.isArray(path) ? path : normalizeMutationPath(mutation && mutation.path);
    if (segments.length === 0) {
      return mutation && mutation.target && typeof mutation.target === "object" ? sourceNodeOf(mutation.target) : null;
    }
    const attrIndex = segments.lastIndexOf("attributes");
    if (attrIndex >= 0) {
      const byPath = sourceNodeOf(resolvePathValue(binding.qdom, segments, attrIndex));
      if (byPath) {
        return byPath;
      }
      return mutation && mutation.target && typeof mutation.target === "object" ? sourceNodeOf(mutation.target) : null;
    }
    const resolved = sourceNodeOf(resolvePathValue(binding.qdom, segments, segments.length - 1));
    if (resolved) {
      return resolved;
    }
    return mutation && mutation.target && typeof mutation.target === "object" ? sourceNodeOf(mutation.target) : null;
  }

  function patchElementAttributeMutation(binding, mutation, path) {
    const attrIndex = path.lastIndexOf("attributes");
    if (attrIndex < 0 || attrIndex >= path.length - 1) {
      return false;
    }
    const attributeName = String(path[attrIndex + 1] || "").trim();
    if (!attributeName) {
      return false;
    }

    const qdomNode = sourceNodeOf(resolvePathValue(binding.qdom, path, attrIndex));
    if (!qdomNode || typeof qdomNode !== "object") {
      return false;
    }
    const domElements = collectMappedDomElements(binding, qdomNode);
    if (domElements.length === 0) {
      return false;
    }

    return withDomMutationSyncSuppressed(binding, function patchAttributes() {
      for (let i = 0; i < domElements.length; i += 1) {
        const element = domElements[i];
        if (!element || element.nodeType !== 1) {
          continue;
        }
        if (mutation.type === "delete" || mutation.newValue === null || typeof mutation.newValue === "undefined") {
          element.removeAttribute(attributeName);
          if (attributeName === "checked" && String(element.tagName || "").toLowerCase() === "input") {
            element.checked = false;
          }
          continue;
        }

        const value = String(mutation.newValue);
        element.setAttribute(attributeName, value);
        if (attributeName === "value" && isFormControlElement(element) && element.value !== value) {
          element.value = value;
        }
        if (attributeName === "checked" && String(element.tagName || "").toLowerCase() === "input") {
          element.checked = value !== "false" && value !== "0" && value !== "";
        }
      }
      return true;
    });
  }

  function patchElementPropertyMutation(binding, mutation, path) {
    if (path.length === 0) {
      return false;
    }
    const propertyName = String(path[path.length - 1] || "").trim();
    if (!propertyName) {
      return false;
    }
    if (propertyName === "attributes") {
      // Attribute object initialization is usually followed by keyed updates.
      return true;
    }
    if (propertyName !== "textContent" && propertyName !== "value") {
      if (propertyName === "meta" || propertyName.indexOf("__qhtml") === 0) {
        return true;
      }
      return false;
    }

    const qdomNode = resolveMutationNode(binding, mutation, path);
    if (!qdomNode || typeof qdomNode !== "object") {
      return false;
    }
    const domElements = collectMappedDomElements(binding, qdomNode);
    if (domElements.length === 0) {
      return false;
    }

    return withDomMutationSyncSuppressed(binding, function patchProperties() {
      for (let i = 0; i < domElements.length; i += 1) {
        const element = domElements[i];
        if (!element || element.nodeType !== 1) {
          continue;
        }
        if (propertyName === "textContent") {
          if (qdomNode.children && Array.isArray(qdomNode.children) && qdomNode.children.length > 0) {
            qdomNode.children.length = 0;
          }
          const textValue = typeof qdomNode.textContent === "string" ? qdomNode.textContent : "";
          element.textContent = textValue;
          continue;
        }

        if (propertyName === "value" && isFormControlElement(element)) {
          const nextValue = mutation && mutation.newValue != null ? String(mutation.newValue) : "";
          if (element.value !== nextValue) {
            element.value = nextValue;
          }
        }
      }
      return true;
    });
  }

  function readRestorableDomProperties(element) {
    if (!element || element.nodeType !== 1) {
      return null;
    }
    const snapshot = {};
    let hasValue = false;
    const tagName = String(element.tagName || "").trim().toLowerCase();

    if (isFormControlElement(element)) {
      try {
        snapshot.value = element.value == null ? "" : String(element.value);
        hasValue = true;
      } catch (error) {
        // ignore unreadable form values
      }
    }

    if (tagName === "input") {
      if (typeof element.checked === "boolean") {
        snapshot.checked = element.checked;
        hasValue = true;
      }
      if (typeof element.indeterminate === "boolean") {
        snapshot.indeterminate = element.indeterminate;
        hasValue = true;
      }
      if (typeof element.selectionStart === "number" && typeof element.selectionEnd === "number") {
        snapshot.selectionStart = element.selectionStart;
        snapshot.selectionEnd = element.selectionEnd;
        hasValue = true;
      }
    } else if (tagName === "textarea") {
      if (typeof element.selectionStart === "number" && typeof element.selectionEnd === "number") {
        snapshot.selectionStart = element.selectionStart;
        snapshot.selectionEnd = element.selectionEnd;
        hasValue = true;
      }
    } else if (tagName === "select" && typeof element.selectedIndex === "number") {
      snapshot.selectedIndex = element.selectedIndex;
      hasValue = true;
    }

    if (typeof element.scrollTop === "number" && element.scrollTop !== 0) {
      snapshot.scrollTop = element.scrollTop;
      hasValue = true;
    }
    if (typeof element.scrollLeft === "number" && element.scrollLeft !== 0) {
      snapshot.scrollLeft = element.scrollLeft;
      hasValue = true;
    }
    if (typeof element.open === "boolean") {
      snapshot.open = element.open;
      hasValue = true;
    }

    return hasValue ? snapshot : null;
  }

  function applyRestorableDomProperties(element, snapshot) {
    if (!element || element.nodeType !== 1 || !snapshot || typeof snapshot !== "object") {
      return;
    }

    if (Object.prototype.hasOwnProperty.call(snapshot, "value") && isFormControlElement(element)) {
      try {
        const nextValue = snapshot.value == null ? "" : String(snapshot.value);
        if (element.value !== nextValue) {
          element.value = nextValue;
        }
      } catch (error) {
        // ignore unwritable form values
      }
    }

    if (Object.prototype.hasOwnProperty.call(snapshot, "checked") && typeof element.checked === "boolean") {
      element.checked = !!snapshot.checked;
    }
    if (Object.prototype.hasOwnProperty.call(snapshot, "indeterminate") && typeof element.indeterminate === "boolean") {
      element.indeterminate = !!snapshot.indeterminate;
    }
    if (Object.prototype.hasOwnProperty.call(snapshot, "selectedIndex") && typeof element.selectedIndex === "number") {
      element.selectedIndex = Number(snapshot.selectedIndex);
    }
    if (
      Object.prototype.hasOwnProperty.call(snapshot, "selectionStart") &&
      Object.prototype.hasOwnProperty.call(snapshot, "selectionEnd") &&
      typeof element.setSelectionRange === "function"
    ) {
      try {
        element.setSelectionRange(Number(snapshot.selectionStart), Number(snapshot.selectionEnd));
      } catch (error) {
        // ignore invalid selection ranges
      }
    }
    if (Object.prototype.hasOwnProperty.call(snapshot, "scrollTop") && typeof element.scrollTop === "number") {
      element.scrollTop = Number(snapshot.scrollTop);
    }
    if (Object.prototype.hasOwnProperty.call(snapshot, "scrollLeft") && typeof element.scrollLeft === "number") {
      element.scrollLeft = Number(snapshot.scrollLeft);
    }
    if (Object.prototype.hasOwnProperty.call(snapshot, "open") && typeof element.open === "boolean") {
      element.open = !!snapshot.open;
    }
  }

  function collectElementScope(rootElement) {
    if (!rootElement || rootElement.nodeType !== 1) {
      return [];
    }
    const out = [rootElement];
    if (typeof rootElement.querySelectorAll !== "function") {
      return out;
    }
    const descendants = rootElement.querySelectorAll("*");
    for (let i = 0; i < descendants.length; i += 1) {
      const element = descendants[i];
      if (!element || element.nodeType !== 1) {
        continue;
      }
      out.push(element);
    }
    return out;
  }

  function resolveElementQdomNode(element) {
    if (!element || element.nodeType !== 1 || typeof element.qdom !== "function") {
      return null;
    }
    try {
      const node = element.qdom();
      const source = sourceNodeOf(node) || node;
      return source && typeof source === "object" ? source : null;
    } catch (error) {
      return null;
    }
  }

  function captureDomPropertyState(binding, rootElement) {
    if (!binding || !binding.host) {
      return new Map();
    }
    const root = rootElement && rootElement.nodeType === 1 ? rootElement : binding.host;
    const elements = collectElementScope(root);
    const snapshots = new Map();
    for (let i = 0; i < elements.length; i += 1) {
      const element = elements[i];
      const qdomNode = resolveElementQdomNode(element);
      if (!qdomNode) {
        continue;
      }
      const snapshot = readRestorableDomProperties(element);
      if (!snapshot) {
        continue;
      }
      snapshots.set(qdomNode, snapshot);
    }
    return snapshots;
  }

  function restoreDomPropertyState(binding, snapshots, rootElement) {
    if (!binding || !binding.host || !snapshots || typeof snapshots.get !== "function" || snapshots.size === 0) {
      return;
    }
    const root = rootElement && rootElement.nodeType === 1 ? rootElement : binding.host;
    const elements = collectElementScope(root);
    for (let i = 0; i < elements.length; i += 1) {
      const element = elements[i];
      const qdomNode = resolveElementQdomNode(element);
      if (!qdomNode) {
        continue;
      }
      const snapshot = snapshots.get(qdomNode);
      if (!snapshot || typeof snapshot !== "object") {
        continue;
      }
      applyRestorableDomProperties(element, snapshot);
    }
  }

  function applyNonStructuralMutation(binding, mutation) {
    const path = normalizeMutationPath(mutation && mutation.path);
    if (path.length === 0) {
      return false;
    }
    if (path.indexOf("attributes") !== -1) {
      return patchElementAttributeMutation(binding, mutation, path);
    }
    return patchElementPropertyMutation(binding, mutation, path);
  }

  function flushObservedMutations(binding) {
    if (!binding || binding.rendering) {
      return;
    }
    if (!binding.host || bindings.get(binding.host) !== binding) {
      return;
    }
    const pending = Array.isArray(binding.pendingMutations) ? binding.pendingMutations.splice(0) : [];
    if (pending.length === 0) {
      return;
    }

    let requiresFullRender = false;
    for (let i = 0; i < pending.length; i += 1) {
      const mutation = pending[i];
      if (requiresFullRender) {
        continue;
      }
      if (mutationNeedsFullRender(mutation)) {
        requiresFullRender = true;
        continue;
      }
      const patched = applyNonStructuralMutation(binding, mutation);
      if (!patched) {
        requiresFullRender = true;
      }
    }

    if (requiresFullRender) {
      renderBinding(binding);
      return;
    }

    scheduleTemplatePersistence(binding);
  }

  function queueObservedMutation(binding, mutation) {
    if (!binding || binding.rendering || binding.updating) {
      return;
    }
    if (!binding.host || bindings.get(binding.host) !== binding) {
      return;
    }

    if (!mutationNeedsFullRender(mutation)) {
      const patched = applyNonStructuralMutation(binding, mutation);
      if (patched) {
        scheduleTemplatePersistence(binding);
        return;
      }
    }

    if (!Array.isArray(binding.pendingMutations)) {
      binding.pendingMutations = [];
    }
    binding.pendingMutations.push(mutation || {});
    if (binding.mutationFlushScheduled) {
      return;
    }
    binding.mutationFlushScheduled = true;

    const flush = function flushQueuedMutations() {
      binding.mutationFlushScheduled = false;
      flushObservedMutations(binding);
    };

    if (typeof global.queueMicrotask === "function") {
      global.queueMicrotask(flush);
    } else if (typeof global.setTimeout === "function") {
      global.setTimeout(flush, 0);
    } else {
      flush();
    }
  }

  function resolveDomElementQDomNode(binding, domElement) {
    if (!binding || !domElement || domElement.nodeType !== 1) {
      return null;
    }
    const mapped = sourceNodeOf(binding.nodeMap && typeof binding.nodeMap.get === "function" ? binding.nodeMap.get(domElement) : null);
    if (mapped && typeof mapped === "object") {
      return mapped;
    }
    if (typeof domElement.qdom !== "function") {
      return null;
    }
    try {
      const resolved = sourceNodeOf(domElement.qdom());
      return resolved && typeof resolved === "object" ? resolved : null;
    } catch (error) {
      return null;
    }
  }

  function canSyncNodeAttributes(qdomNode) {
    if (!qdomNode || typeof qdomNode !== "object") {
      return false;
    }
    const kind = String(qdomNode.kind || "").trim().toLowerCase();
    return kind === "element" || kind === "component-instance" || kind === "template-instance";
  }

  function setQDomNodeAttributeValue(qdomNode, name, nextValue) {
    if (!canSyncNodeAttributes(qdomNode)) {
      return false;
    }
    const key = String(name || "").trim();
    if (!key) {
      return false;
    }
    if (!qdomNode.attributes || typeof qdomNode.attributes !== "object") {
      qdomNode.attributes = {};
    }
    const normalizedValue = String(nextValue == null ? "" : nextValue);
    if (String(qdomNode.attributes[key]) === normalizedValue) {
      return false;
    }
    qdomNode.attributes[key] = normalizedValue;
    return true;
  }

  function removeQDomNodeAttributeValue(qdomNode, name) {
    if (!canSyncNodeAttributes(qdomNode)) {
      return false;
    }
    const key = String(name || "").trim();
    if (!key || !qdomNode.attributes || typeof qdomNode.attributes !== "object") {
      return false;
    }
    if (!Object.prototype.hasOwnProperty.call(qdomNode.attributes, key)) {
      return false;
    }
    delete qdomNode.attributes[key];
    return true;
  }

  function readSyncableQDomChildrenList(qdomNode) {
    if (!qdomNode || typeof qdomNode !== "object") {
      return null;
    }
    const kind = String(qdomNode.kind || "").trim().toLowerCase();
    if (kind === "document") {
      if (!Array.isArray(qdomNode.nodes)) {
        qdomNode.nodes = [];
      }
      return qdomNode.nodes;
    }
    if (kind === "component") {
      if (!Array.isArray(qdomNode.templateNodes)) {
        qdomNode.templateNodes = [];
      }
      return qdomNode.templateNodes;
    }
    if (!Array.isArray(qdomNode.children)) {
      qdomNode.children = [];
    }
    return qdomNode.children;
  }

  function createQDomNodeFromDomNode(domNode) {
    if (!domNode) {
      return null;
    }
    if (domNode.nodeType === 3) {
      const textValue = domNode.nodeValue == null ? "" : String(domNode.nodeValue);
      if (core && typeof core.createTextNode === "function") {
        return core.createTextNode({ value: textValue });
      }
      return {
        kind: "text",
        value: textValue,
        meta: { dirty: false, originalSource: null, sourceRange: null },
      };
    }
    if (domNode.nodeType !== 1) {
      return null;
    }

    const element = domNode;
    const attributes = {};
    const attrList =
      element && element.attributes && typeof element.attributes.length === "number" ? element.attributes : [];
    for (let i = 0; i < attrList.length; i += 1) {
      const attr = attrList[i];
      if (!attr || typeof attr.name !== "string" || isInternalRuntimeAttributeName(attr.name)) {
        continue;
      }
      attributes[attr.name] = attr.value == null ? "" : String(attr.value);
    }
    if (isFormControlElement(element)) {
      attributes.value = element.value == null ? "" : String(element.value);
    }
    if (String(element.tagName || "").trim().toLowerCase() === "input" && element.checked) {
      attributes.checked = "checked";
    }

    const children = [];
    const childNodes =
      element && element.childNodes && typeof element.childNodes.length === "number" ? element.childNodes : [];
    for (let i = 0; i < childNodes.length; i += 1) {
      const child = createQDomNodeFromDomNode(childNodes[i]);
      if (child) {
        children.push(child);
      }
    }

    const tagName = String(element.tagName || "").trim().toLowerCase() || "div";
    if (core && typeof core.createElementNode === "function") {
      return core.createElementNode({
        tagName: tagName,
        attributes: attributes,
        children: children,
      });
    }
    return {
      kind: "element",
      tagName: tagName,
      attributes: attributes,
      children: children,
      textContent: null,
      selectorMode: "single",
      selectorChain: [tagName],
      meta: { dirty: false, originalSource: null, sourceRange: null },
    };
  }

  function markSyncedQDomNodeDirty(binding, qdomNode) {
    if (!binding || !qdomNode || typeof qdomNode !== "object") {
      return;
    }
    writeNodeUpdateNonce(qdomNode, createRuntimeUpdateNonceToken());
  }

  function syncDomControlToQDom(binding, domElement) {
    if (!binding || !domElement || domElement.nodeType !== 1 || !isFormControlElement(domElement)) {
      return false;
    }
    const qdomNode = resolveDomElementQDomNode(binding, domElement);
    if (!qdomNode || typeof qdomNode !== "object") {
      return false;
    }

    let changed = false;
    const tagName = String(domElement.tagName || "").trim().toLowerCase();
    const value = domElement.value == null ? "" : String(domElement.value);
    if (setQDomNodeAttributeValue(qdomNode, "value", value)) {
      changed = true;
    }

    if (tagName === "input") {
      const type = String(domElement.getAttribute("type") || domElement.type || "")
        .trim()
        .toLowerCase();
      if (type === "checkbox" || type === "radio") {
        if (domElement.checked) {
          if (setQDomNodeAttributeValue(qdomNode, "checked", "checked")) {
            changed = true;
          }
        } else if (removeQDomNodeAttributeValue(qdomNode, "checked")) {
          changed = true;
        }
      }
    }

    if (changed) {
      markSyncedQDomNodeDirty(binding, qdomNode);
    }
    return changed;
  }

  function syncDomElementAttributesSnapshotToQDom(binding, domElement) {
    const qdomNode = resolveDomElementQDomNode(binding, domElement);
    if (!qdomNode || typeof qdomNode !== "object" || !canSyncNodeAttributes(qdomNode)) {
      return false;
    }

    if (!qdomNode.attributes || typeof qdomNode.attributes !== "object") {
      qdomNode.attributes = {};
    }
    const attrs = qdomNode.attributes;
    const domAttributeMap = {};
    const attrList =
      domElement && domElement.attributes && typeof domElement.attributes.length === "number" ? domElement.attributes : [];
    for (let i = 0; i < attrList.length; i += 1) {
      const attr = attrList[i];
      if (!attr || typeof attr.name !== "string") {
        continue;
      }
      if (isInternalRuntimeAttributeName(attr.name) || isDomMutationDirtyAttributeName(attr.name)) {
        continue;
      }
      domAttributeMap[attr.name] = attr.value == null ? "" : String(attr.value);
    }

    if (isFormControlElement(domElement)) {
      domAttributeMap.value = domElement.value == null ? "" : String(domElement.value);
      if (String(domElement.tagName || "").trim().toLowerCase() === "input") {
        const inputType = String(domElement.getAttribute("type") || domElement.type || "")
          .trim()
          .toLowerCase();
        if (inputType === "checkbox" || inputType === "radio") {
          if (domElement.checked) {
            domAttributeMap.checked = "checked";
          } else if (Object.prototype.hasOwnProperty.call(domAttributeMap, "checked")) {
            delete domAttributeMap.checked;
          }
        }
      }
    }

    let changed = false;
    const existingKeys = Object.keys(attrs);
    for (let i = 0; i < existingKeys.length; i += 1) {
      const key = existingKeys[i];
      if (isInternalRuntimeAttributeName(key) || isDomMutationDirtyAttributeName(key)) {
        continue;
      }
      if (!Object.prototype.hasOwnProperty.call(domAttributeMap, key)) {
        delete attrs[key];
        changed = true;
      }
    }
    const domKeys = Object.keys(domAttributeMap);
    for (let i = 0; i < domKeys.length; i += 1) {
      const key = domKeys[i];
      const value = String(domAttributeMap[key]);
      if (String(attrs[key]) !== value) {
        attrs[key] = value;
        changed = true;
      }
    }
    if (changed) {
      markSyncedQDomNodeDirty(binding, qdomNode);
    }
    return changed;
  }

  function syncDomElementSnapshotToQDom(binding, domElement) {
    const qdomNode = resolveDomElementQDomNode(binding, domElement);
    if (!qdomNode || !isLeafQDomNode(qdomNode)) {
      return false;
    }
    let changed = false;
    changed = syncDomElementAttributesSnapshotToQDom(binding, domElement) || changed;
    if (!isFormControlElement(domElement)) {
      changed = syncDomElementTextToQDom(binding, domElement) || changed;
    } else {
      changed = syncDomControlToQDom(binding, domElement) || changed;
    }
    return changed;
  }

  function flushPendingDomMutationSyncForElement(binding, domElement) {
    if (!binding || !domElement || domElement.nodeType !== 1 || binding.rendering) {
      return false;
    }
    const dirtySet = binding.domMutationDirtyElements;
    if (!dirtySet || typeof dirtySet.has !== "function" || !dirtySet.has(domElement)) {
      return false;
    }
    const host = binding.host;
    if (!host || bindings.get(host) !== binding) {
      return false;
    }
    if (domElement.isConnected === false || (typeof host.contains === "function" && !host.contains(domElement))) {
      clearDomElementUnsynced(binding, domElement);
      return false;
    }
    const changed = syncDomElementSnapshotToQDom(binding, domElement);
    clearDomElementUnsynced(binding, domElement);
    if (Array.isArray(binding.domMutationDirtyQueue) && binding.domMutationDirtyQueue.length > 0) {
      schedulePendingDomMutationSyncFlush(binding);
    }
    if (changed) {
      scheduleTemplatePersistence(binding);
    }
    return changed;
  }

  function flushPendingDomMutationSync(binding, options) {
    if (!binding || binding.rendering) {
      return false;
    }
    const dirtySet = binding.domMutationDirtyElements;
    if (!dirtySet || typeof dirtySet.size !== "number" || dirtySet.size === 0) {
      return false;
    }
    if (!Array.isArray(binding.domMutationDirtyQueue)) {
      binding.domMutationDirtyQueue = [];
    }
    const host = binding.host;
    if (!host || bindings.get(host) !== binding) {
      return false;
    }
    const opts = options && typeof options === "object" ? options : {};
    const maxItemsRaw = Number(opts.maxItems);
    const maxItems =
      Number.isFinite(maxItemsRaw) && maxItemsRaw > 0 ? Math.max(1, Math.floor(maxItemsRaw)) : DOM_MUTATION_SYNC_FLUSH_BATCH_SIZE;
    let anyChanged = false;
    let processed = 0;
    while (binding.domMutationDirtyQueue.length > 0 && processed < maxItems) {
      const element = binding.domMutationDirtyQueue.pop();
      if (!element || !dirtySet.has(element)) {
        continue;
      }
      if (!element || element.nodeType !== 1) {
        dirtySet.delete(element);
        continue;
      }
      if (element.isConnected === false || (typeof host.contains === "function" && !host.contains(element))) {
        clearDomElementUnsynced(binding, element);
        continue;
      }
      anyChanged = syncDomElementSnapshotToQDom(binding, element) || anyChanged;
      clearDomElementUnsynced(binding, element);
      processed += 1;
    }
    if (binding.domMutationDirtyQueue.length > 0 && opts.scheduleRemainder !== false) {
      schedulePendingDomMutationSyncFlush(binding);
    }
    if (anyChanged) {
      scheduleTemplatePersistence(binding);
    }
    return anyChanged;
  }

  function syncDomElementAttributeToQDom(binding, domElement, attributeName) {
    const qdomNode = resolveDomElementQDomNode(binding, domElement);
    if (!qdomNode || typeof qdomNode !== "object" || !canSyncNodeAttributes(qdomNode)) {
      return false;
    }
    const key = String(attributeName || "").trim();
    if (!key || isInternalRuntimeAttributeName(key)) {
      return false;
    }

    let changed = false;
    if (typeof domElement.hasAttribute === "function" && domElement.hasAttribute(key)) {
      changed = setQDomNodeAttributeValue(qdomNode, key, domElement.getAttribute(key));
    } else {
      changed = removeQDomNodeAttributeValue(qdomNode, key);
    }
    if (changed) {
      markSyncedQDomNodeDirty(binding, qdomNode);
    }
    return changed;
  }

  function syncDomElementTextToQDom(binding, domElement) {
    const qdomNode = resolveDomElementQDomNode(binding, domElement);
    if (!qdomNode || typeof qdomNode !== "object") {
      return false;
    }
    const children = readSyncableQDomChildrenList(qdomNode);
    if (!Array.isArray(children)) {
      return false;
    }
    if (children.length > 0) {
      return false;
    }
    const nextText = domElement && domElement.textContent != null ? String(domElement.textContent) : "";
    let changed = false;
    if (typeof qdomNode.textContent !== "string" || qdomNode.textContent !== nextText) {
      qdomNode.textContent = nextText;
      changed = true;
    }
    if (Object.prototype.hasOwnProperty.call(qdomNode, "html")) {
      delete qdomNode.html;
      changed = true;
    }
    if (changed) {
      markSyncedQDomNodeDirty(binding, qdomNode);
    }
    return changed;
  }

  function syncDomElementChildrenToQDom(binding, domElement) {
    const qdomNode = resolveDomElementQDomNode(binding, domElement);
    if (!qdomNode || typeof qdomNode !== "object") {
      return false;
    }
    const children = readSyncableQDomChildrenList(qdomNode);
    if (!Array.isArray(children)) {
      return false;
    }
    const nextChildren = [];
    const domChildren =
      domElement && domElement.childNodes && typeof domElement.childNodes.length === "number" ? domElement.childNodes : [];
    for (let i = 0; i < domChildren.length; i += 1) {
      const childNode = createQDomNodeFromDomNode(domChildren[i]);
      if (childNode) {
        nextChildren.push(childNode);
      }
    }
    children.splice.apply(children, [0, children.length].concat(nextChildren));
    let changed = true;
    if (Object.prototype.hasOwnProperty.call(qdomNode, "textContent") && qdomNode.textContent !== null) {
      qdomNode.textContent = null;
    }
    if (Object.prototype.hasOwnProperty.call(qdomNode, "html")) {
      delete qdomNode.html;
    }
    if (isFormControlElement(domElement)) {
      changed = syncDomControlToQDom(binding, domElement) || changed;
    }
    if (changed) {
      markSyncedQDomNodeDirty(binding, qdomNode);
    }
    return changed;
  }

  function syncDomMutationRecordToQDom(binding, mutation) {
    if (!binding || !mutation || typeof mutation !== "object") {
      return false;
    }
    if (!isDomMutationSyncGloballyEnabled() || binding.rendering || isDomMutationSyncSuppressed(binding)) {
      return false;
    }
    const mutationType = String(mutation.type || "").trim().toLowerCase();
    if (!mutationType) {
      return false;
    }
    if (mutationType === "attributes") {
      const target = mutation.target;
      if (!target || target.nodeType !== 1) {
        return false;
      }
      if (isDomMutationDirtyAttributeName(mutation.attributeName)) {
        return false;
      }
      if (isInternalRuntimeAttributeName(mutation.attributeName)) {
        return false;
      }
      return markDomElementUnsynced(binding, target);
    }
    if (mutationType === "characterdata") {
      const textNode = mutation.target;
      const parent = textNode && textNode.parentElement ? textNode.parentElement : null;
      if (!parent || parent.nodeType !== 1) {
        return false;
      }
      return markDomElementUnsynced(binding, parent);
    }
    return false;
  }

  function attachDomMutationSync(binding) {
    if (!binding || !binding.host || typeof global.MutationObserver !== "function") {
      return;
    }
    if (binding.domMutationSyncAttached) {
      if (!binding.domMutationRefreshTimer && typeof global.setTimeout === "function") {
        binding.domMutationRefreshTimer = global.setTimeout(function deferredDomMutationObserverRefresh() {
          binding.domMutationRefreshTimer = null;
          if (!binding.domMutationSyncAttached || !binding.host || bindings.get(binding.host) !== binding) {
            return;
          }
          refreshDomMutationObserverTargets(binding);
        }, 0);
      }
      return;
    }
    const host = binding.host;
    const observer = new global.MutationObserver(function onDomMutation(records) {
      if (!binding || !isDomMutationSyncGloballyEnabled() || binding.rendering || isDomMutationSyncSuppressed(binding)) {
        return;
      }
      if (!binding.host || bindings.get(binding.host) !== binding) {
        return;
      }
      const mutations = Array.isArray(records) ? records : [];
      let didMarkDirty = false;
      for (let i = 0; i < mutations.length; i += 1) {
        try {
          didMarkDirty = syncDomMutationRecordToQDom(binding, mutations[i]) || didMarkDirty;
        } catch (error) {
          if (global.console && typeof global.console.error === "function") {
            global.console.error("qhtml DOM mutation sync failed:", error);
          }
        }
      }
      if (didMarkDirty) return;
    });

    binding.domMutationObserver = observer;
    refreshDomMutationObserverTargets(binding);
    binding.domMutationSyncAttached = true;
  }

  function detachDomMutationSync(binding) {
    if (!binding || !binding.domMutationSyncAttached) {
      return;
    }
    if (binding.domMutationObserver && typeof binding.domMutationObserver.disconnect === "function") {
      binding.domMutationObserver.disconnect();
    }
    if (binding.domMutationDirtyElements && typeof binding.domMutationDirtyElements.forEach === "function") {
      binding.domMutationDirtyElements.forEach(function clearEachDirtyElement(element) {
        clearDomElementUnsynced(binding, element);
      });
    }
    if (binding.domMutationFlushTimer && typeof global.clearTimeout === "function") {
      global.clearTimeout(binding.domMutationFlushTimer);
      binding.domMutationFlushTimer = null;
    }
    if (binding.domMutationRefreshTimer && typeof global.clearTimeout === "function") {
      global.clearTimeout(binding.domMutationRefreshTimer);
      binding.domMutationRefreshTimer = null;
    }
    binding.domMutationObserver = null;
    binding.domMutationObservedElements = [];
    binding.domMutationDirtyElements = new Set();
    binding.domMutationDirtyQueue = [];
    binding.domMutationSyncAttached = false;
    binding.domMutationSyncSuppressDepth = 0;
  }

  function attachDomControlSync(binding) {
    if (!binding || !binding.host || binding.domControlSyncAttached) {
      return;
    }
    const host = binding.host;
    const handler = function onControlMutation(event) {
      if (!isDomMutationSyncGloballyEnabled()) {
        return;
      }
      markDomElementUnsynced(binding, event && event.target ? event.target : null);
    };
    host.addEventListener("input", handler, true);
    host.addEventListener("change", handler, true);
    binding.domControlSyncAttached = true;
    binding.domControlSyncHandler = handler;
  }

  function detachDomControlSync(binding) {
    if (!binding || !binding.host || !binding.domControlSyncAttached || typeof binding.domControlSyncHandler !== "function") {
      return;
    }
    binding.host.removeEventListener("input", binding.domControlSyncHandler, true);
    binding.host.removeEventListener("change", binding.domControlSyncHandler, true);
    binding.domControlSyncAttached = false;
    binding.domControlSyncHandler = null;
  }

  function normalizeBindingTargetCollection(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "props") {
      return "props";
    }
    if (normalized === "textcontent") {
      return "textContent";
    }
    return "attributes";
  }

  function readNodeBindingEntries(node) {
    if (!node || typeof node !== "object" || !node.meta || typeof node.meta !== "object") {
      return [];
    }
    if (!Array.isArray(node.meta.qBindings)) {
      return [];
    }
    return node.meta.qBindings;
  }

  function createRuntimeUpdateNonceToken() {
    if (core && typeof core.createUpdateNonceToken === "function") {
      const token = core.createUpdateNonceToken();
      if (typeof token === "string" && token) {
        return token;
      }
    }
    const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let out = "";
    for (let i = 0; i < 12; i += 1) {
      out += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
    }
    return out || "nonce";
  }

  function readNodeUpdateNonce(node) {
    if (!node || typeof node !== "object") {
      return "";
    }
    const value = node[UPDATE_NONCE_KEY];
    return typeof value === "string" ? value : "";
  }

  function writeNodeUpdateNonce(node, nonceValue) {
    if (!node || typeof node !== "object") {
      return "";
    }
    const next = typeof nonceValue === "string" && nonceValue ? nonceValue : createRuntimeUpdateNonceToken();
    try {
      node[UPDATE_NONCE_KEY] = next;
    } catch (error) {
      // ignore nonce writes on sealed/frozen objects
    }
    return next;
  }

  function ensureNodeUpdateNonce(node) {
    const existing = readNodeUpdateNonce(node);
    if (existing) {
      return existing;
    }
    return writeNodeUpdateNonce(node);
  }

  function walkBindingNodesForNonce(binding, visitor) {
    if (!binding || typeof visitor !== "function") {
      return;
    }
    const root = sourceNodeOf(binding.rawQdom || binding.qdom);
    if (!root || typeof root !== "object") {
      return;
    }
    visitor(root);
    if (typeof core.walkQDom !== "function") {
      return;
    }
    if (String(root.kind || "").trim().toLowerCase() !== "document") {
      return;
    }
    core.walkQDom(root, function walkNode(node) {
      visitor(sourceNodeOf(node) || node);
    });
  }

  function prepareBindingNodeNoncesForUpdate(binding, lastUpdateNonce) {
    const staleNodes = [];
    const compareNonce = typeof lastUpdateNonce === "string" ? lastUpdateNonce : "";
    walkBindingNodesForNonce(binding, function markNode(node) {
      if (!node || typeof node !== "object") {
        return;
      }
      ensureNodeUpdateNonce(node);
      const currentNonce = ensureNodeUpdateNonce(node);
      if (!compareNonce || currentNonce !== compareNonce) {
        staleNodes.push(node);
      }
    });
    return staleNodes;
  }

  function finalizeBindingNodeNonces(binding, cycleNonce) {
    if (!binding) {
      return;
    }
    const updateNonce = typeof cycleNonce === "string" && cycleNonce ? cycleNonce : createRuntimeUpdateNonceToken();
    walkBindingNodesForNonce(binding, function finalizeNode(node) {
      if (!node || typeof node !== "object") {
        return;
      }
      if (readNodeUpdateNonce(node) !== updateNonce) {
        writeNodeUpdateNonce(node, updateNonce);
      }
    });
    binding.lastUpdateNonce = updateNonce;
  }

  function ensureBindingEvaluationState(binding) {
    if (!binding || typeof binding !== "object") {
      return {
        tick: 0,
        interval: DEFAULT_QBIND_EVALUATION_INTERVAL,
      };
    }
    if (!binding.bindingEvaluationState || typeof binding.bindingEvaluationState !== "object") {
      binding.bindingEvaluationState = {
        tick: 0,
        interval: DEFAULT_QBIND_EVALUATION_INTERVAL,
      };
    }
    const state = binding.bindingEvaluationState;
    const configuredInterval = Number(state.interval);
    if (!Number.isFinite(configuredInterval) || configuredInterval <= 0) {
      state.interval = DEFAULT_QBIND_EVALUATION_INTERVAL;
    } else {
      state.interval = Math.max(1, Math.floor(configuredInterval));
    }
    return state;
  }

  function isQBindExpressionBinding(bindingSpec) {
    const expressionType = String(bindingSpec && bindingSpec.expressionType ? bindingSpec.expressionType : "q-bind")
      .trim()
      .toLowerCase();
    return expressionType !== "q-script" && expressionType !== "qscriptexpression";
  }

  function ensureNodeBindingCache(node) {
    if (!node || typeof node !== "object") {
      return null;
    }
    if (!node.meta || typeof node.meta !== "object") {
      node.meta = {};
    }
    if (!node.meta.__qhtmlBindingCache || typeof node.meta.__qhtmlBindingCache !== "object") {
      node.meta.__qhtmlBindingCache = {};
    }
    return node.meta.__qhtmlBindingCache;
  }

  function bindingCacheKeyForEntry(bindingSpec) {
    const key = String(bindingSpec && bindingSpec.name ? bindingSpec.name : "").trim().toLowerCase();
    const target = normalizeBindingTargetCollection(bindingSpec && bindingSpec.targetCollection);
    return target + "::" + key;
  }

  function normalizeBindingValueForNode(bindingSpec, value) {
    const key = String(bindingSpec && bindingSpec.name ? bindingSpec.name : "").trim();
    if (!key) {
      return null;
    }
    const targetCollection = normalizeBindingTargetCollection(bindingSpec.targetCollection);
    if (targetCollection === "props") {
      return {
        key: key,
        targetCollection: "props",
        value: value,
      };
    }
    if (targetCollection === "textContent") {
      return {
        key: key,
        targetCollection: "textContent",
        value: value == null ? "" : String(value),
      };
    }
    if (value === null || typeof value === "undefined" || value === false) {
      return {
        key: key,
        targetCollection: "attributes",
        value: undefined,
      };
    }
    return {
      key: key,
      targetCollection: "attributes",
      value: String(value),
    };
  }

  function stringifyBindingValue(value, seen) {
    if (value === null) {
      return "null";
    }
    if (typeof value === "undefined") {
      return "undefined";
    }
    const type = typeof value;
    if (type === "number") {
      return Number.isNaN(value) ? "number:NaN" : "number:" + String(value);
    }
    if (type === "string") {
      return "string:" + value;
    }
    if (type === "boolean") {
      return "boolean:" + String(value);
    }
    if (type === "bigint") {
      return "bigint:" + String(value);
    }
    if (type === "function") {
      return "function:" + String(value);
    }
    if (type === "symbol") {
      return "symbol:" + String(value);
    }
    const cache = seen || new WeakSet();
    if (cache.has(value)) {
      return "[Circular]";
    }
    cache.add(value);
    if (Array.isArray(value)) {
      const parts = [];
      for (let i = 0; i < value.length; i += 1) {
        parts.push(stringifyBindingValue(value[i], cache));
      }
      return "[" + parts.join(",") + "]";
    }
    const keys = Object.keys(value).sort();
    const parts = [];
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      parts.push(key + ":" + stringifyBindingValue(value[key], cache));
    }
    return "{" + parts.join(",") + "}";
  }

  function createBindingValueFingerprint(normalizedBindingValue) {
    if (!normalizedBindingValue || typeof normalizedBindingValue !== "object") {
      return "null";
    }
    return (
      String(normalizedBindingValue.targetCollection || "attributes") +
      "|" +
      String(normalizedBindingValue.key || "") +
      "|" +
      stringifyBindingValue(normalizedBindingValue.value)
    );
  }

  function ensureBindingComponentScopeCache(binding) {
    if (!binding || (typeof binding !== "object" && typeof binding !== "function")) {
      return null;
    }
    if (!binding.__qhtmlBindingComponentScopeCache || typeof binding.__qhtmlBindingComponentScopeCache !== "object") {
      binding.__qhtmlBindingComponentScopeCache = new WeakMap();
    }
    return binding.__qhtmlBindingComponentScopeCache;
  }

  function childCollectionsForScopeLookup(node) {
    if (!node || typeof node !== "object") {
      return [];
    }
    const out = [];
    if (Array.isArray(node.nodes) && node.nodes.length > 0) {
      out.push(node.nodes);
    }
    if (Array.isArray(node.templateNodes) && node.templateNodes.length > 0) {
      out.push(node.templateNodes);
    }
    if (Array.isArray(node.children) && node.children.length > 0) {
      out.push(node.children);
    }
    if (Array.isArray(node.slots) && node.slots.length > 0) {
      out.push(node.slots);
    }
    return out;
  }

  function resolveBindingComponentScopeNode(binding, targetNode) {
    const normalizedTarget = sourceNodeOf(targetNode) || targetNode;
    if (!normalizedTarget || typeof normalizedTarget !== "object") {
      return null;
    }
    const targetKind = String(normalizedTarget.kind || "").trim().toLowerCase();
    if (targetKind === "component-instance" || targetKind === "template-instance") {
      return normalizedTarget;
    }
    const cache = ensureBindingComponentScopeCache(binding);
    if (cache && cache.has(normalizedTarget)) {
      return cache.get(normalizedTarget) || null;
    }
    const root = sourceNodeOf(binding && (binding.rawQdom || binding.qdom));
    if (!root || typeof root !== "object") {
      if (cache) {
        cache.set(normalizedTarget, null);
      }
      return null;
    }

    let resolvedScope = null;
    function walk(node, activeScope) {
      const normalized = sourceNodeOf(node) || node;
      if (!normalized || typeof normalized !== "object") {
        return false;
      }

      const kind = String(normalized.kind || "").trim().toLowerCase();
      const nextScope =
        kind === "component-instance" || kind === "template-instance" ? normalized : activeScope;

      if (cache) {
        cache.set(normalized, nextScope || null);
      }
      if (normalized === normalizedTarget) {
        resolvedScope = nextScope || null;
        return true;
      }

      const collections = childCollectionsForScopeLookup(normalized);
      for (let i = 0; i < collections.length; i += 1) {
        const list = collections[i];
        for (let j = 0; j < list.length; j += 1) {
          if (walk(list[j], nextScope)) {
            return true;
          }
        }
      }
      return false;
    }

    walk(root, null);
    if (cache && !cache.has(normalizedTarget)) {
      cache.set(normalizedTarget, resolvedScope || null);
    }
    return resolvedScope;
  }

  function createBindingComponentScopeProxy(binding, scopeNode) {
    const normalizedScope = sourceNodeOf(scopeNode) || scopeNode;
    if (!normalizedScope || typeof normalizedScope !== "object") {
      return null;
    }
    if (normalizedScope.__qhtmlBindingComponentProxy && typeof normalizedScope.__qhtmlBindingComponentProxy === "object") {
      return normalizedScope.__qhtmlBindingComponentProxy;
    }

    const proxy = new Proxy({}, {
      get: function getComponentScopeValue(target, prop) {
        if (prop === "qdom") {
          return function bindingComponentScopeQdom() {
            return installQDomFactories(normalizedScope);
          };
        }
        const key = typeof prop === "string" ? prop : "";
        if (!key) {
          return undefined;
        }
        const props = normalizedScope.props && typeof normalizedScope.props === "object" ? normalizedScope.props : null;
        if (props && Object.prototype.hasOwnProperty.call(props, key)) {
          return props[key];
        }
        const attrs =
          normalizedScope.attributes && typeof normalizedScope.attributes === "object" ? normalizedScope.attributes : null;
        if (attrs && Object.prototype.hasOwnProperty.call(attrs, key)) {
          return attrs[key];
        }
        return undefined;
      },
      set: function setComponentScopeValue(target, prop, value) {
        const key = typeof prop === "string" ? prop : "";
        if (!key) {
          return true;
        }
        if (!normalizedScope.props || typeof normalizedScope.props !== "object") {
          normalizedScope.props = {};
        }
        normalizedScope.props[key] = value;
        return true;
      },
    });

    try {
      Object.defineProperty(normalizedScope, "__qhtmlBindingComponentProxy", {
        value: proxy,
        configurable: true,
        writable: true,
        enumerable: false,
      });
    } catch (error) {
      normalizedScope.__qhtmlBindingComponentProxy = proxy;
    }
    return proxy;
  }

  function createBindingExecutionContext(binding, node) {
    const sourceNode = sourceNodeOf(node) || node;
    const host = binding && binding.host && binding.host.nodeType === 1 ? binding.host : null;
    const domElements = collectMappedDomElements(binding, sourceNode);
    const qdomRoot = sourceNodeOf(binding && (binding.rawQdom || binding.qdom));
    const componentScopeNode = resolveBindingComponentScopeNode(binding, sourceNode);

    function resolveBindingComponentHostElement(scopeNodeCandidate, fallbackElement) {
      if (
        sourceNode &&
        typeof sourceNode === "object" &&
        binding &&
        binding.componentHostBySourceNode &&
        typeof binding.componentHostBySourceNode.get === "function"
      ) {
        const mappedBySource = binding.componentHostBySourceNode.get(sourceNode);
        if (mappedBySource && mappedBySource.nodeType === 1) {
          return mappedBySource;
        }
      }
      const normalizedScope = sourceNodeOf(scopeNodeCandidate) || scopeNodeCandidate;
      if (normalizedScope && typeof normalizedScope === "object") {
        const mappedHosts = collectMappedDomElements(binding, normalizedScope);
        if (mappedHosts.length > 0) {
          return mappedHosts[0];
        }
      }
      const fallback = fallbackElement && fallbackElement.nodeType === 1 ? fallbackElement : null;
      if (!fallback) {
        return null;
      }
      if (
        typeof fallback.getAttribute === "function" &&
        fallback.getAttribute("qhtml-component-instance") === "1"
      ) {
        return fallback;
      }
      if (typeof fallback.closest === "function") {
        return fallback.closest("[qhtml-component-instance='1']");
      }
      return null;
    }

    function querySelectorInDetachedRawHtml(rawHtml, selector) {
      if (!rawHtml || !selector) {
        return null;
      }
      const targetDocument = (binding && binding.doc) || (host && host.ownerDocument) || global.document;
      if (!targetDocument || typeof targetDocument.createElement !== "function") {
        return null;
      }
      try {
        const template = targetDocument.createElement("template");
        template.innerHTML = String(rawHtml || "");
        if (!template.content || typeof template.content.querySelector !== "function") {
          return null;
        }
        return template.content.querySelector(selector);
      } catch (error) {
        return null;
      }
    }

    function resolveSelectorFromQDom(selector) {
      const query = String(selector || "").trim();
      if (!query || !qdomRoot || typeof qdomRoot !== "object") {
        return null;
      }
      let found = null;
      function walk(nodeCandidate) {
        if (found || !nodeCandidate || typeof nodeCandidate !== "object") {
          return;
        }
        const nodeKind = String(nodeCandidate.kind || "").trim().toLowerCase();
        if (nodeKind === "raw-html") {
          found = querySelectorInDetachedRawHtml(nodeCandidate.html, query);
          if (found) {
            return;
          }
        }
        if (
          (nodeKind === "element" || nodeKind === "component-instance" || nodeKind === "template-instance") &&
          nodeCandidate.attributes &&
          typeof nodeCandidate.attributes === "object" &&
          query.charAt(0) === "#" &&
          String(nodeCandidate.attributes.id || "") === query.slice(1)
        ) {
          found = {
            getAttribute: function bindingQDomSelectorGetAttribute(name) {
              const key = String(name || "").trim();
              if (!key) {
                return null;
              }
              if (!nodeCandidate.attributes || typeof nodeCandidate.attributes !== "object") {
                return null;
              }
              if (!Object.prototype.hasOwnProperty.call(nodeCandidate.attributes, key)) {
                return null;
              }
              return String(nodeCandidate.attributes[key]);
            },
            hasAttribute: function bindingQDomSelectorHasAttribute(name) {
              const key = String(name || "").trim();
              if (!key || !nodeCandidate.attributes || typeof nodeCandidate.attributes !== "object") {
                return false;
              }
              return Object.prototype.hasOwnProperty.call(nodeCandidate.attributes, key);
            },
          };
          return;
        }

        const collections = [
          Array.isArray(nodeCandidate.nodes) ? nodeCandidate.nodes : null,
          Array.isArray(nodeCandidate.templateNodes) ? nodeCandidate.templateNodes : null,
          Array.isArray(nodeCandidate.children) ? nodeCandidate.children : null,
          Array.isArray(nodeCandidate.slots) ? nodeCandidate.slots : null,
        ];
        for (let i = 0; i < collections.length; i += 1) {
          const list = collections[i];
          if (!list) {
            continue;
          }
          for (let j = 0; j < list.length; j += 1) {
            walk(list[j]);
            if (found) {
              return;
            }
          }
        }
      }
      walk(qdomRoot);
      return found;
    }

    function wrapDomElementForBinding(element) {
      if (!element || element.nodeType !== 1) {
        return element;
      }
      return new Proxy(element, {
        get: function getBindingElementProperty(target, prop, receiver) {
          if (prop === "component") {
            if (typeof target.closest === "function") {
              const closestHost = target.closest("[qhtml-component-instance='1']");
              if (closestHost && closestHost.nodeType === 1) {
                return closestHost;
              }
            }
            let existing = null;
            try {
              existing = Reflect.get(target, prop, receiver);
            } catch (ignoredComponentRead) {
              existing = null;
            }
            if (existing) {
              return existing;
            }
            const componentHost = resolveBindingComponentHostElement(componentScopeNode, target);
            if (componentHost) {
              return componentHost;
            }
            return createBindingComponentScopeProxy(binding, componentScopeNode);
          }
          if (prop === "closest") {
            return function bindingClosest(selector) {
              if (typeof target.closest !== "function") {
                return null;
              }
              const matched = target.closest(selector);
              if (
                matched &&
                matched.nodeType === 1 &&
                String(matched.tagName || "").trim().toLowerCase() === "q-html"
              ) {
                return wrapDomElementForBinding(matched);
              }
              return matched;
            };
          }
          if (prop === "querySelector") {
            return function bindingQuerySelector(selector) {
              const nativeMatch =
                typeof target.querySelector === "function" ? target.querySelector(selector) : null;
              if (nativeMatch) {
                return nativeMatch;
              }
              if (String(target.tagName || "").trim().toLowerCase() === "q-html") {
                return resolveSelectorFromQDom(selector);
              }
              return null;
            };
          }
          if (prop === "querySelectorAll") {
            return function bindingQuerySelectorAll(selector) {
              if (typeof target.querySelectorAll === "function") {
                return target.querySelectorAll(selector);
              }
              return [];
            };
          }
          const value = Reflect.get(target, prop, receiver);
          if (typeof value === "function") {
            return function callBindingElementMethod() {
              return value.apply(target, arguments);
            };
          }
          return value;
        },
      });
    }

    if (domElements.length > 0) {
      return wrapDomElementForBinding(domElements[0]);
    }
    const attributes =
      sourceNode && sourceNode.attributes && typeof sourceNode.attributes === "object" ? sourceNode.attributes : null;
    const componentHost = resolveBindingComponentHostElement(componentScopeNode, host);
    const context = {
      qhtmlRoot: host,
      component: componentHost || createBindingComponentScopeProxy(binding, componentScopeNode),
      root: function bindingRootAccessor() {
        return host;
      },
      qdom: function bindingQdomAccessor() {
        return installQDomFactories(sourceNode);
      },
      closest: function bindingClosest(selector) {
        const query = String(selector || "").trim();
        if (!query || !host) {
          return null;
        }
        if (typeof host.matches === "function" && host.matches(query)) {
          return wrapDomElementForBinding(host);
        }
        const resolved = typeof host.closest === "function" ? host.closest(query) : null;
        if (
          resolved &&
          resolved.nodeType === 1 &&
          String(resolved.tagName || "").trim().toLowerCase() === "q-html"
        ) {
          return wrapDomElementForBinding(resolved);
        }
        return resolved;
      },
      querySelector: function bindingQuerySelector(selector) {
        if (host && typeof host.querySelector === "function") {
          const nativeMatch = host.querySelector(selector);
          if (nativeMatch) {
            return nativeMatch;
          }
        }
        return resolveSelectorFromQDom(selector);
      },
      querySelectorAll: function bindingQuerySelectorAll(selector) {
        if (!host || typeof host.querySelectorAll !== "function") {
          return [];
        }
        return host.querySelectorAll(selector);
      },
      getAttribute: function bindingGetAttribute(name) {
        const key = String(name || "").trim();
        if (!key || !attributes || !Object.prototype.hasOwnProperty.call(attributes, key)) {
          return null;
        }
        return String(attributes[key]);
      },
      hasAttribute: function bindingHasAttribute(name) {
        const key = String(name || "").trim();
        if (!key || !attributes) {
          return false;
        }
        return Object.prototype.hasOwnProperty.call(attributes, key);
      },
      setAttribute: function bindingSetAttribute(name, value) {
        const key = String(name || "").trim();
        if (!key || !sourceNode || typeof sourceNode !== "object") {
          return;
        }
        if (!sourceNode.attributes || typeof sourceNode.attributes !== "object") {
          sourceNode.attributes = {};
        }
        sourceNode.attributes[key] = String(value == null ? "" : value);
      },
      removeAttribute: function bindingRemoveAttribute(name) {
        const key = String(name || "").trim();
        if (!key || !sourceNode || typeof sourceNode !== "object") {
          return;
        }
        if (!sourceNode.attributes || typeof sourceNode.attributes !== "object") {
          return;
        }
        delete sourceNode.attributes[key];
      },
    };
    if (host) {
      context.document = host.ownerDocument || global.document || null;
    }
    return context;
  }

  function evaluateBindingExpression(binding, node, bindingSpec) {
    const scriptBody = String(bindingSpec && bindingSpec.script ? bindingSpec.script : "").trim();
    if (!scriptBody) {
      return undefined;
    }
    const fallbackContext = sourceNodeOf(node) || node || {};
    const context = createBindingExecutionContext(binding, node);
    try {
      const wrappedBody = "try {\n" + scriptBody + "\n} catch (__qbindError) { return undefined; }";
      const fn = new Function(wrappedBody);
      return fn.call(context || fallbackContext);
    } catch (error) {
      if (isRuntimeDebugLoggingEnabled() && global.console && typeof global.console.error === "function") {
        global.console.error("qhtml q-bind evaluation failed:", error);
      }
      return undefined;
    }
  }

  function applyBindingValueToNode(node, normalizedBindingValue) {
    if (!node || typeof node !== "object" || !normalizedBindingValue || typeof normalizedBindingValue !== "object") {
      return;
    }
    const key = String(normalizedBindingValue.key || "").trim();
    if (!key) {
      return;
    }
    const targetCollection = String(normalizedBindingValue.targetCollection || "attributes");
    const value = normalizedBindingValue.value;
    if (targetCollection === "props") {
      if (!node.props || typeof node.props !== "object") {
        node.props = {};
      }
      if (typeof value === "undefined") {
        delete node.props[key];
        return;
      }
      node.props[key] = value;
      return;
    }
    if (targetCollection === "textContent") {
      node.textContent = value == null ? "" : String(value);
      return;
    }
    if (!node.attributes || typeof node.attributes !== "object") {
      node.attributes = {};
    }
    if (value === null || typeof value === "undefined" || value === false) {
      delete node.attributes[key];
      return;
    }
    node.attributes[key] = String(value);
  }

  function isPatchableBindingTargetNode(node) {
    if (!node || typeof node !== "object") {
      return false;
    }
    const kind = String(node.kind || "").trim().toLowerCase();
    return kind === "element" || kind === "text";
  }

  function patchBindingChangeInDom(binding, qdomNode, normalizedBindingValue) {
    if (!binding || !qdomNode || !normalizedBindingValue || typeof normalizedBindingValue !== "object") {
      return false;
    }
    if (!isPatchableBindingTargetNode(qdomNode)) {
      return false;
    }
    const domElements = collectMappedDomElements(binding, qdomNode);
    if (domElements.length === 0) {
      return false;
    }
    const key = String(normalizedBindingValue.key || "").trim();
    if (!key) {
      return false;
    }
    const targetCollection = String(normalizedBindingValue.targetCollection || "attributes");
    const value = normalizedBindingValue.value;

    if (targetCollection === "textContent") {
      const nextText = value == null ? "" : String(value);
      for (let i = 0; i < domElements.length; i += 1) {
        const element = domElements[i];
        if (!element || element.nodeType !== 1) {
          continue;
        }
        if (element.textContent !== nextText) {
          element.textContent = nextText;
        }
      }
      return true;
    }

    if (targetCollection !== "attributes") {
      return false;
    }

    for (let i = 0; i < domElements.length; i += 1) {
      const element = domElements[i];
      if (!element || element.nodeType !== 1) {
        continue;
      }
      if (typeof value === "undefined") {
        element.removeAttribute(key);
        if (key === "checked" && String(element.tagName || "").toLowerCase() === "input") {
          element.checked = false;
        }
        continue;
      }
      const attrValue = String(value);
      element.setAttribute(key, attrValue);
      if (key === "value" && isFormControlElement(element) && element.value !== attrValue) {
        element.value = attrValue;
      }
      if (key === "checked" && String(element.tagName || "").toLowerCase() === "input") {
        element.checked = attrValue !== "false" && attrValue !== "0" && attrValue !== "";
      }
    }
    return true;
  }

  function markChangedBindingNodesForUpdate(binding, changedNodes) {
    if (!binding || !changedNodes || typeof changedNodes.forEach !== "function") {
      return;
    }
    const root = sourceNodeOf(binding.rawQdom || binding.qdom);
    if (root && typeof root === "object") {
      writeNodeUpdateNonce(root);
    }
    changedNodes.forEach(function markNode(node) {
      const source = sourceNodeOf(node) || node;
      if (!source || typeof source !== "object") {
        return;
      }
      writeNodeUpdateNonce(source);
    });
  }

  function evaluateAllNodeBindings(binding, options) {
    if (!binding || typeof core.walkQDom !== "function") {
      return {
        changed: false,
        changedNodes: new Set(),
        patchedCount: 0,
      };
    }
    const root = binding.rawQdom || binding.qdom;
    if (!root) {
      return {
        changed: false,
        changedNodes: new Set(),
        patchedCount: 0,
      };
    }
    const opts = options || {};
    const state = ensureBindingEvaluationState(binding);
    const forceAll = opts.forceAll === true;
    state.tick += 1;
    const allowQBindEvaluation = forceAll || state.tick % state.interval === 0;
    const result = evaluateNodeBindingsInTree(root, {
      forceAll: forceAll,
      allowQBindEvaluation: allowQBindEvaluation,
      evaluationTick: state.tick,
      patchDom: opts.patchDom === true,
      binding: binding,
    });
    if (result.changed) {
      markChangedBindingNodesForUpdate(binding, result.changedNodes);
    }
    if (result.patchedCount > 0) {
      scheduleTemplatePersistence(binding);
    }
    return result;
  }

  function evaluateNodeBindingsInTree(rootNode, options) {
    if (!rootNode || typeof core.walkQDom !== "function") {
      return {
        changed: false,
        changedNodes: new Set(),
        patchedCount: 0,
      };
    }
    const opts = options || {};
    let changed = false;
    const changedNodes = new Set();
    let patchedCount = 0;
    core.walkQDom(rootNode, function evaluateBindingsForNode(node) {
      const entries = readNodeBindingEntries(node);
      if (entries.length === 0) {
        return;
      }
      const cache = ensureNodeBindingCache(node);
      for (let i = 0; i < entries.length; i += 1) {
        const entry = entries[i];
        const cacheKey = bindingCacheKeyForEntry(entry);
        const cacheEntry = cache && cache[cacheKey] && typeof cache[cacheKey] === "object" ? cache[cacheKey] : {};
        const hasCachedFingerprint = Object.prototype.hasOwnProperty.call(cacheEntry, "fingerprint");
        const shouldEvaluateQBind = !isQBindExpressionBinding(entry) || opts.allowQBindEvaluation === true;
        if (opts.forceAll !== true && !shouldEvaluateQBind && hasCachedFingerprint) {
          continue;
        }
        const value = evaluateBindingExpression(opts.binding, node, entry);
        const normalized = normalizeBindingValueForNode(entry, value);
        const nextFingerprint = createBindingValueFingerprint(normalized);
        if (hasCachedFingerprint && cacheEntry.fingerprint === nextFingerprint) {
          cacheEntry.lastEvaluatedTick = Number(opts.evaluationTick) || 0;
          if (cache) {
            cache[cacheKey] = cacheEntry;
          }
          continue;
        }
        applyBindingValueToNode(node, normalized);
        if (cache) {
          cache[cacheKey] = {
            fingerprint: nextFingerprint,
            lastEvaluatedTick: Number(opts.evaluationTick) || 0,
          };
        }
        const sourceNode = sourceNodeOf(node) || node;
        const patched = opts.patchDom === true && patchBindingChangeInDom(opts.binding, sourceNode, normalized);
        if (patched) {
          patchedCount += 1;
          continue;
        }
        changed = true;
        changedNodes.add(sourceNode);
      }
    });
    return {
      changed: changed,
      changedNodes: changedNodes,
      patchedCount: patchedCount,
    };
  }

  function createScopedRenderDocument(binding, scopeNode) {
    if (!binding || !scopeNode || typeof scopeNode !== "object" || !core || typeof core.createDocument !== "function") {
      return null;
    }
    const temporary = core.createDocument({ source: "" });
    const root = sourceNodeOf(binding.rawQdom || binding.qdom);
    const rootNodes = root && Array.isArray(root.nodes) ? root.nodes : [];
    for (let i = 0; i < rootNodes.length; i += 1) {
      const candidate = rootNodes[i];
      if (!candidate || typeof candidate !== "object") {
        continue;
      }
      if (String(candidate.kind || "").trim().toLowerCase() !== "component") {
        continue;
      }
      temporary.nodes.push(candidate);
    }
    temporary.nodes.push(scopeNode);
    return temporary;
  }

  function mergeCapturedMappingsIntoBinding(binding, captured) {
    if (!binding || !captured || typeof captured !== "object") {
      return;
    }
    if (!binding.nodeMap || typeof binding.nodeMap.set !== "function") {
      binding.nodeMap = new WeakMap();
    }
    if (!binding.componentMap || typeof binding.componentMap.set !== "function") {
      binding.componentMap = new WeakMap();
    }
    if (!binding.slotMap || typeof binding.slotMap.set !== "function") {
      binding.slotMap = new WeakMap();
    }
    if (!binding.componentHostBySourceNode || typeof binding.componentHostBySourceNode.set !== "function") {
      binding.componentHostBySourceNode = new WeakMap();
    }
    if (!binding.domByQdomNode || typeof binding.domByQdomNode.get !== "function") {
      binding.domByQdomNode = new WeakMap();
    }

    const nodeMap = captured.nodeMap instanceof Map ? captured.nodeMap : null;
    const componentMap = captured.componentMap instanceof Map ? captured.componentMap : null;
    const slotMap = captured.slotMap instanceof Map ? captured.slotMap : null;

    if (nodeMap) {
      nodeMap.forEach(function mapNode(sourceNode, domElement) {
        if (!domElement || domElement.nodeType !== 1) {
          return;
        }
        const normalizedSource = sourceNodeOf(sourceNode) || sourceNode;
        if (!normalizedSource || typeof normalizedSource !== "object") {
          return;
        }
        binding.nodeMap.set(domElement, normalizedSource);
        registerMappedDomElement(binding, normalizedSource, domElement);
        const componentHost =
          componentMap && typeof componentMap.get === "function" ? componentMap.get(domElement) : null;
        if (componentHost && componentHost.nodeType === 1) {
          binding.componentHostBySourceNode.set(normalizedSource, componentHost);
        }
      });
    }
    if (componentMap) {
      componentMap.forEach(function mapComponent(hostElement, domElement) {
        if (!domElement || domElement.nodeType !== 1 || !hostElement || hostElement.nodeType !== 1) {
          return;
        }
        binding.componentMap.set(domElement, hostElement);
      });
    }
    if (slotMap) {
      slotMap.forEach(function mapSlot(slotNode, domElement) {
        if (!domElement || domElement.nodeType !== 1 || !slotNode || typeof slotNode !== "object") {
          return;
        }
        const normalizedSlot = sourceNodeOf(slotNode) || slotNode;
        binding.slotMap.set(domElement, normalizedSlot);
      });
    }
  }

  function terminateWasmRuntimesInNode(rootNode) {
    if (!rootNode || rootNode.nodeType !== 1) {
      return;
    }
    const targets = [];
    targets.push(rootNode);
    if (typeof rootNode.querySelectorAll === "function") {
      const nested = rootNode.querySelectorAll("[qhtml-component-instance='1']");
      for (let i = 0; i < nested.length; i += 1) {
        targets.push(nested[i]);
      }
    }
    for (let i = 0; i < targets.length; i += 1) {
      const element = targets[i];
      if (!element || element.nodeType !== 1) {
        continue;
      }
      const runtimeHandle =
        element.__qhtmlWasmRuntime &&
        typeof element.__qhtmlWasmRuntime === "object" &&
        typeof element.__qhtmlWasmRuntime.terminate === "function"
          ? element.__qhtmlWasmRuntime
          : null;
      if (!runtimeHandle) {
        continue;
      }
      try {
        runtimeHandle.terminate();
      } catch (error) {
        if (global.console && typeof global.console.warn === "function") {
          global.console.warn("qhtml q-wasm runtime terminate failed:", error);
        }
      }
      try {
        element.__qhtmlWasmRuntime = null;
      } catch (assignError) {
        // no-op
      }
    }
  }

  function renderScopedComponentBinding(binding, scopeElement, options) {
    if (!binding || !binding.qdom || !scopeElement || scopeElement.nodeType !== 1) {
      return false;
    }

    const sourceScopeNode = sourceNodeOf(binding.nodeMap && binding.nodeMap.get(scopeElement));
    if (!sourceScopeNode || typeof sourceScopeNode !== "object") {
      return false;
    }
    const restorableState = captureDomPropertyState(binding, scopeElement);

    const scopeKind = String(sourceScopeNode.kind || "").trim().toLowerCase();
    if (scopeKind !== "component-instance" && scopeKind !== "template-instance") {
      return false;
    }

    const targetDocument = binding.doc || scopeElement.ownerDocument || global.document;
    if (!targetDocument) {
      return false;
    }

    const opts = options || {};
    if (opts.skipBindingEvaluation !== true) {
      evaluateNodeBindingsInTree(sourceScopeNode, {
        forceAll: true,
        allowQBindEvaluation: true,
        evaluationTick: 0,
        patchDom: false,
        binding: binding,
      });
      evaluateAllNodeQColors(binding);
    }
    registerDefinitionsFromDocument(binding.rawQdom || binding.qdom);

    const scopedDocument = createScopedRenderDocument(binding, sourceScopeNode);
    if (!scopedDocument) {
      return false;
    }

    const capturedNodeMap = new Map();
    const capturedComponentMap = new Map();
    const capturedSlotMap = new Map();
    const fragment = renderer.renderDocumentToFragment(scopedDocument, targetDocument, {
      capture: {
        nodeMap: capturedNodeMap,
        componentMap: capturedComponentMap,
        slotMap: capturedSlotMap,
      },
    });

    const children =
      fragment && fragment.childNodes && typeof fragment.childNodes.length === "number"
        ? fragment.childNodes
        : [];
    let replacement = null;
    for (let i = 0; i < children.length; i += 1) {
      if (children[i] && children[i].nodeType === 1) {
        replacement = children[i];
        break;
      }
    }
    if (!replacement) {
      return false;
    }

    const parentNode = scopeElement.parentNode;
    if (!parentNode || typeof parentNode.replaceChild !== "function") {
      return false;
    }
    logRuntimeEvent("qhtml render replace scoped element", {
      host: describeElementForLog(binding.host),
      replaced: describeElementForLog(scopeElement),
      replacement: describeElementForLog(replacement),
    });
    terminateWasmRuntimesInNode(scopeElement);
    withDomMutationSyncSuppressed(binding, function replaceScopedElement() {
      parentNode.replaceChild(replacement, scopeElement);

      mergeCapturedMappingsIntoBinding(binding, {
        nodeMap: capturedNodeMap,
        componentMap: capturedComponentMap,
        slotMap: capturedSlotMap,
      });

      hydrateRegisteredComponentHostsInNode(replacement, targetDocument);
      attachDomQDomAccessors(binding);
      restoreDomPropertyState(binding, restorableState, replacement);
    });
    attachDomControlSync(binding);
    attachDomMutationSync(binding);
    attachScriptRules(binding);
    persistQDomTemplate(binding);
    return true;
  }

  function renderBinding(binding, options) {
    if (!binding || !binding.qdom) {
      return;
    }
    const opts = options || {};
    const restorableState = captureDomPropertyState(binding, binding.host);
    binding.rendering = true;
    if (opts.skipBindingEvaluation !== true) {
      evaluateAllNodeBindings(binding, {
        forceAll: opts.forceBindingEvaluation === true,
        patchDom: false,
      });
      evaluateAllNodeQColors(binding);
    }
    registerDefinitionsFromDocument(binding.rawQdom || binding.qdom);
    binding.nodeMap = new WeakMap();
    binding.componentMap = new WeakMap();
    binding.slotMap = new WeakMap();
    binding.componentHostBySourceNode = new WeakMap();
    binding.domByQdomNode = new WeakMap();
    logRuntimeEvent("qhtml render replace host tree", {
      host: describeElementForLog(binding.host),
    });
    try {
      terminateWasmRuntimesInNode(binding.host);
      withDomMutationSyncSuppressed(binding, function renderHostTree() {
        renderer.renderIntoElement(binding.qdom, binding.host, binding.doc, {
          capture: {
            nodeMap: binding.nodeMap,
            componentMap: binding.componentMap,
            slotMap: binding.slotMap,
          },
        });
        hydrateRegisteredComponentHostsInNode(binding.doc, binding.doc);
        attachDomQDomAccessors(binding);
        restoreDomPropertyState(binding, restorableState, binding.host);
      });
      // Run a post-render binding pass with live DOM mapping so bindings that depend
      // on runtime component context (for example this.component.<prop>) apply to
      // the final rendered elements on the first render, not only after update().
      withDomMutationSyncSuppressed(binding, function patchBindingsPostRender() {
        evaluateAllNodeBindings(binding, {
          forceAll: true,
          patchDom: true,
        });
      });
      attachDomControlSync(binding);
      attachDomMutationSync(binding);
      runHostLifecycleHooks(binding);
      attachScriptRules(binding);
      persistQDomTemplate(binding);
    } finally {
      binding.rendering = false;
    }
  }

  function attachDomQDomAccessors(binding) {
    if (!binding || !binding.host) {
      return;
    }

    const host = binding.host;
    const slotHandleByContainer = new WeakMap();
    const slotContainerByHandle = new WeakMap();
    const nodeFacadeCache = new WeakMap();
    const childrenAccessorCache = new WeakMap();

    function readNodeChildrenList(targetNode) {
      if (!targetNode || typeof targetNode !== "object") {
        return [];
      }
      const kind = String(targetNode.kind || "").trim().toLowerCase();
      if (kind === "document") {
        if (!Array.isArray(targetNode.nodes)) {
          targetNode.nodes = [];
        }
        return targetNode.nodes;
      }
      if (kind === "component") {
        if (!Array.isArray(targetNode.templateNodes)) {
          targetNode.templateNodes = [];
        }
        return targetNode.templateNodes;
      }
      if (!Array.isArray(targetNode.children)) {
        targetNode.children = [];
      }
      return targetNode.children;
    }

    function createTransientDocumentFromNodes(inputNodes, includeDefinitions) {
      const temporary = core.createDocument({ source: "" });
      const nodes = Array.isArray(inputNodes) ? inputNodes : [];
      if (includeDefinitions) {
        const root = sourceNodeOf(binding.rawQdom || binding.qdom);
        const rootNodes = root && Array.isArray(root.nodes) ? root.nodes : [];
        for (let i = 0; i < rootNodes.length; i += 1) {
          const candidate = rootNodes[i];
          if (!candidate || typeof candidate !== "object") {
            continue;
          }
          if (String(candidate.kind || "").trim().toLowerCase() === "component") {
            temporary.nodes.push(candidate);
          }
        }
      }
      for (let i = 0; i < nodes.length; i += 1) {
        temporary.nodes.push(sourceNodeOf(nodes[i]) || nodes[i]);
      }
      return temporary;
    }

    function fragmentToHtmlString(fragment, targetDocument) {
      const doc = targetDocument || binding.doc || global.document;
      if (!doc || !fragment || typeof doc.createElement !== "function") {
        return "";
      }
      const container = doc.createElement("div");
      container.appendChild(fragment);
      return typeof container.innerHTML === "string" ? container.innerHTML : "";
    }

    function createQDomNodeList(inputNodes) {
      const list = Array.isArray(inputNodes) ? inputNodes : [];
      const qdomNodeList = {
        at: function at(index) {
          const idx = Number(index);
          if (!Number.isFinite(idx) || idx < 0 || idx >= list.length) {
            return null;
          }
          return installQDomFactories(list[idx]);
        },
        toArray: function toArray() {
          return list.map(function mapNode(item) {
            return installQDomFactories(item);
          });
        },
        forEach: function forEach(callback, thisArg) {
          if (typeof callback !== "function") {
            return;
          }
          for (let i = 0; i < list.length; i += 1) {
            callback.call(thisArg, installQDomFactories(list[i]), i, qdomNodeList);
          }
        },
        map: function map(callback, thisArg) {
          if (typeof callback !== "function") {
            return [];
          }
          const out = [];
          for (let i = 0; i < list.length; i += 1) {
            out.push(callback.call(thisArg, installQDomFactories(list[i]), i, qdomNodeList));
          }
          return out;
        },
        qhtml: function qhtml(options) {
          const docNode = createTransientDocumentFromNodes(list, false);
          const opts = options && typeof options === "object" ? Object.assign({}, options) : {};
          if (!Object.prototype.hasOwnProperty.call(opts, "preserveOriginal")) {
            opts.preserveOriginal = false;
          }
          return parser.qdomToQHtml(docNode, opts);
        },
        htmldom: function htmldom(targetDocument) {
          const docNode = createTransientDocumentFromNodes(list, true);
          return renderer.renderDocumentToFragment(docNode, targetDocument || binding.doc || global.document);
        },
        html: function html(targetDocument) {
          const fragment = qdomNodeList.htmldom(targetDocument);
          return fragmentToHtmlString(fragment, targetDocument);
        },
      };

      Object.defineProperty(qdomNodeList, "length", {
        configurable: true,
        enumerable: true,
        get: function getLength() {
          return list.length;
        },
      });

      if (typeof Symbol === "function" && Symbol.iterator) {
        Object.defineProperty(qdomNodeList, Symbol.iterator, {
          configurable: true,
          enumerable: false,
          writable: false,
          value: function iterator() {
            let index = 0;
            return {
              next: function next() {
                if (index >= list.length) {
                  return { done: true, value: undefined };
                }
                const value = installQDomFactories(list[index]);
                index += 1;
                return { done: false, value: value };
              },
            };
          },
        });
      }

      return qdomNodeList;
    }

    function unwrapQDomInput(value) {
      if (value && typeof value === "object") {
        return sourceNodeOf(value) || value;
      }
      return value;
    }

    function createChildrenAccessor(targetNode) {
      const sourceTarget = sourceNodeOf(targetNode) || targetNode;
      if (!sourceTarget || typeof sourceTarget !== "object") {
        return function emptyChildrenAccessor() {
          return createQDomNodeList([]);
        };
      }
      if (childrenAccessorCache.has(sourceTarget)) {
        return childrenAccessorCache.get(sourceTarget);
      }

      const accessor = function childrenAccessor() {
        return createQDomNodeList(readNodeChildrenList(sourceTarget));
      };
      const proxy = new Proxy(accessor, {
        apply: function applyChildrenAccessor() {
          return createQDomNodeList(readNodeChildrenList(sourceTarget));
        },
        get: function getChildrenAccessor(_, prop) {
          const list = readNodeChildrenList(sourceTarget);
          if (prop === "length") {
            return list.length;
          }
          if (prop === "qhtml") {
            return function qhtml() {
              return createQDomNodeList(list).qhtml.apply(null, arguments);
            };
          }
          if (prop === "htmldom") {
            return function htmldom() {
              return createQDomNodeList(list).htmldom.apply(null, arguments);
            };
          }
          if (prop === "html") {
            return function html() {
              return createQDomNodeList(list).html.apply(null, arguments);
            };
          }
          if (prop === "toArray") {
            return function toArray() {
              return createQDomNodeList(list).toArray();
            };
          }
          if (typeof prop === "string" && /^[0-9]+$/.test(prop)) {
            return installQDomFactories(list[Number(prop)]);
          }
          if (typeof Symbol === "function" && prop === Symbol.iterator) {
            return function iterator() {
              return createQDomNodeList(list)[Symbol.iterator]();
            };
          }
          if (typeof prop === "string" && (prop === "push" || prop === "unshift")) {
            return function pushOrUnshift() {
              const args = Array.prototype.slice.call(arguments).map(unwrapQDomInput);
              return list[prop].apply(list, args);
            };
          }
          if (prop === "splice") {
            return function splice(start, deleteCount) {
              const args = Array.prototype.slice.call(arguments);
              const head = args.slice(0, 2);
              const tail = args.slice(2).map(unwrapQDomInput);
              const removed = list.splice.apply(list, head.concat(tail));
              return removed.map(function mapRemoved(item) {
                return installQDomFactories(item);
              });
            };
          }
          const value = list[prop];
          if (typeof value === "function") {
            return function delegatedArrayMethod() {
              return value.apply(list, arguments);
            };
          }
          return value;
        },
        set: function setChildrenAccessor(_, prop, value) {
          const list = readNodeChildrenList(sourceTarget);
          if (typeof prop === "string" && /^[0-9]+$/.test(prop)) {
            list[Number(prop)] = unwrapQDomInput(value);
            return true;
          }
          if (prop === "length") {
            list.length = Math.max(0, Number(value) || 0);
            return true;
          }
          list[prop] = value;
          return true;
        },
      });
      childrenAccessorCache.set(sourceTarget, proxy);
      return proxy;
    }

      function isQDomTypedNode(value) {
        return !!(value && typeof value === "object" && typeof value.kind === "string");
      }

      function projectedTagNameForNode(node) {
        if (!node || typeof node !== "object") {
          return "";
        }
        if (typeof node.tagName === "string" && node.tagName.trim()) {
          return node.tagName.trim();
        }
        const kind = String(node.kind || "").trim().toLowerCase();
        if (!kind) {
          return "";
        }
        if (kind === "document") {
          return "document";
        }
        if (kind === "component") {
          return String(node.componentId || "component").trim() || "component";
        }
        if (kind === "component-instance" || kind === "template-instance") {
          return String(node.componentId || node.tagName || kind).trim() || kind;
        }
        if (kind === "slot") {
          return "slot";
        }
        return kind;
      }

      function cloneForOutput(value, options, visited) {
        if (value == null) {
          return value;
        }
        if (typeof value === "function") {
          return undefined;
        }
        if (typeof value !== "object") {
          return value;
        }
        if (visited.has(value)) {
          return "[Circular]";
        }

        if (Array.isArray(value)) {
          visited.add(value);
          const out = [];
          for (let i = 0; i < value.length; i += 1) {
            const next = cloneForOutput(value[i], options, visited);
            if (typeof next !== "undefined") {
              out.push(next);
            }
          }
          visited.delete(value);
          return out;
        }

        const opts = options && typeof options === "object" ? options : {};
        const mapSpec =
          opts.mapSpec && typeof opts.mapSpec === "object" && !Array.isArray(opts.mapSpec)
            ? opts.mapSpec
            : null;
        const whitelist =
          opts.whitelist instanceof Set ? opts.whitelist : null;
        const shouldFilterNodeKeys = !!(whitelist && isQDomTypedNode(value));
        const keys = shouldFilterNodeKeys ? Array.from(whitelist) : Object.keys(value);
        const wantsTagNameAlias =
          isQDomTypedNode(value) &&
          ((!Object.prototype.hasOwnProperty.call(value, "tagName") &&
            shouldFilterNodeKeys &&
            whitelist &&
            whitelist.has("tagName")) ||
            (!Object.prototype.hasOwnProperty.call(value, "tagName") &&
              !shouldFilterNodeKeys &&
              mapSpec &&
              Object.prototype.hasOwnProperty.call(mapSpec, "tagName")));

        visited.add(value);
        const out = {};
        for (let i = 0; i < keys.length; i += 1) {
          const key = String(keys[i] || "");
          if (!key || !Object.prototype.hasOwnProperty.call(value, key)) {
            continue;
          }
          const mappedKey =
            mapSpec && Object.prototype.hasOwnProperty.call(mapSpec, key)
              ? String(mapSpec[key] || "").trim() || key
              : key;
          const next = cloneForOutput(value[key], opts, visited);
          if (typeof next !== "undefined") {
            out[mappedKey] = next;
          }
        }
        if (wantsTagNameAlias) {
          const mappedKey =
            mapSpec && Object.prototype.hasOwnProperty.call(mapSpec, "tagName")
              ? String(mapSpec.tagName || "").trim() || "tagName"
              : "tagName";
          out[mappedKey] = projectedTagNameForNode(value);
        }
        visited.delete(value);
        return out;
      }

      function normalizeShowKeys(args) {
        const keys = [];
        const seen = new Set();
        const input = Array.isArray(args) ? args : [];
        for (let i = 0; i < input.length; i += 1) {
          const key = String(input[i] == null ? "" : input[i]).trim();
          if (!key || seen.has(key)) {
            continue;
          }
          seen.add(key);
          keys.push(key);
        }
        return keys;
      }

      function createNodeFacade(targetNode) {
        const sourceTarget = sourceNodeOf(targetNode) || targetNode;
        if (!sourceTarget || typeof sourceTarget !== "object") {
          return sourceTarget;
        }
      if (nodeFacadeCache.has(sourceTarget)) {
        return nodeFacadeCache.get(sourceTarget);
      }

      const facade = new Proxy(sourceTarget, {
        get: function getNodeFacade(target, prop, receiver) {
          if (prop === "__qhtmlSourceNode") {
            return target;
          }
          if (prop === "children") {
            return createChildrenAccessor(target);
          }
          if (prop === "childrenArray") {
            return readNodeChildrenList(target);
          }
          const value = Reflect.get(target, prop, receiver);
          if (value && typeof value === "object") {
            if (Array.isArray(value)) {
              return value;
            }
            if (
              isQDomTypedNode(value) ||
              Object.prototype.hasOwnProperty.call(value, "__qhtmlFactoriesInstalled") ||
              (value.__qhtmlSourceNode && typeof value.__qhtmlSourceNode === "object")
            ) {
              return installQDomFactories(value);
            }
            return value;
          }
          if (typeof value === "function") {
            return function boundNodeMethod() {
              return value.apply(target, arguments);
            };
          }
          return value;
        },
        set: function setNodeFacade(target, prop, value, receiver) {
          if (prop === "children") {
            if (Array.isArray(value)) {
              target.children = value.map(unwrapQDomInput);
              return true;
            }
            return true;
          }
          return Reflect.set(target, prop, unwrapQDomInput(value), receiver);
        },
      });
      nodeFacadeCache.set(sourceTarget, facade);
      return facade;
    }

    function installQDomFactories(node) {
      if (!node || typeof node !== "object") {
        return node;
      }
      if (Object.prototype.hasOwnProperty.call(node, "__qhtmlFactoriesInstalled")) {
        return createNodeFacade(node);
      }

      // Preserve parsed instance slot arrays before installing facade methods
      // that occupy the same public property names (e.g. slots()).
      if (Array.isArray(node.slots) && !Array.isArray(node.__qhtmlSlotNodes)) {
        try {
          Object.defineProperty(node, "__qhtmlSlotNodes", {
            value: node.slots,
            configurable: true,
            writable: true,
            enumerable: false,
          });
        } catch (error) {
          node.__qhtmlSlotNodes = node.slots;
        }
      }

      function buildElementFallback(options) {
        const opts = options && typeof options === "object" ? options : {};
        const tag = String(opts.tagName || "div").trim().toLowerCase() || "div";
        return {
          kind: "element",
          tagName: tag,
          attributes: opts.attributes && typeof opts.attributes === "object" ? Object.assign({}, opts.attributes) : {},
          children: Array.isArray(opts.children) ? opts.children : [],
          textContent: typeof opts.textContent === "string" ? opts.textContent : null,
          selectorMode: "single",
          selectorChain: [tag],
          meta: { dirty: false, originalSource: null, sourceRange: null },
        };
      }

      function buildTextFallback(options) {
        const opts = options && typeof options === "object" ? options : {};
        return {
          kind: "text",
          value: typeof opts.value === "string" ? opts.value : "",
          meta: { dirty: false, originalSource: null, sourceRange: null },
        };
      }

      function buildSlotFallback(options) {
        const opts = options && typeof options === "object" ? options : {};
        return {
          kind: "slot",
          name: String(opts.name || "default").trim() || "default",
          children: Array.isArray(opts.children) ? opts.children : [],
          meta: { dirty: false, originalSource: null, sourceRange: null },
        };
      }

      function buildComponentInstanceFallback(options) {
        const opts = options && typeof options === "object" ? options : {};
        const tag = String(opts.tagName || opts.componentId || "div").trim().toLowerCase() || "div";
        return {
          kind: String(opts.kind || "component-instance").trim().toLowerCase() === "template-instance" ? "template-instance" : "component-instance",
          componentId: String(opts.componentId || tag).trim().toLowerCase(),
          tagName: tag,
          attributes: opts.attributes && typeof opts.attributes === "object" ? Object.assign({}, opts.attributes) : {},
          slots: Array.isArray(opts.slots) ? opts.slots : [],
          children: Array.isArray(opts.children) ? opts.children : [],
          textContent: typeof opts.textContent === "string" ? opts.textContent : null,
          selectorMode: "single",
          selectorChain: [tag],
          meta: { dirty: false, originalSource: null, sourceRange: null },
        };
      }

      const createElementFactory =
        core && typeof core.createElementNode === "function"
          ? core.createElementNode
          : buildElementFallback;
      const createTextFactory =
        core && typeof core.createTextNode === "function"
          ? core.createTextNode
          : buildTextFallback;
      const createRawHtmlFactory =
        core && typeof core.createRawHtmlNode === "function"
          ? core.createRawHtmlNode
          : function rawHtmlFallback(options) {
              const opts = options && typeof options === "object" ? options : {};
              return {
                kind: "raw-html",
                html: typeof opts.html === "string" ? opts.html : "",
                meta: { dirty: false, originalSource: null, sourceRange: null },
              };
            };
      const createSlotFactory =
        core && typeof core.createSlotNode === "function"
          ? core.createSlotNode
          : buildSlotFallback;
      const createComponentInstanceFactory =
        core && typeof core.createComponentInstanceNode === "function"
          ? core.createComponentInstanceNode
          : buildComponentInstanceFallback;

      function asArray(value) {
        return Array.isArray(value) ? value : [];
      }

      function normalizedKind(targetNode) {
        return String(targetNode && targetNode.kind ? targetNode.kind : "").trim().toLowerCase();
      }

      function isInstanceKind(kind) {
        return kind === "component-instance" || kind === "template-instance";
      }

      function ensureChildrenList(targetNode) {
        if (!targetNode || typeof targetNode !== "object") {
          return [];
        }
        if (!Array.isArray(targetNode.children)) {
          targetNode.children = [];
        }
        return targetNode.children;
      }

      function findSlotWrapperChild(targetNode, slotName) {
        const wanted = String(slotName || "default").trim().toLowerCase();
        if (!wanted || wanted === "default") {
          return null;
        }
        const children = ensureChildrenList(targetNode);
        for (let i = 0; i < children.length; i += 1) {
          const child = children[i];
          if (!child || normalizedKind(child) !== "element") {
            continue;
          }
          if (String(child.tagName || "").trim().toLowerCase() === wanted) {
            return child;
          }
        }
        return null;
      }

      function createSlotWrapperChild(targetNode, slotName) {
        const tagName = String(slotName || "default").trim().toLowerCase() || "default";
        const wrapper = createElementFactory({
          tagName: tagName,
          attributes: {},
          children: [],
          meta: { generated: true },
        });
        ensureChildrenList(targetNode).push(wrapper);
        return wrapper;
      }

      function normalizeLegacySlotArrays(targetNode) {
        return;
      }

      function slotHandleForContainer(targetNode, slotName, containerNode) {
        const normalizedName = String(slotName || "default").trim() || "default";
        const container = containerNode && typeof containerNode === "object" ? containerNode : targetNode;
        if (!container || typeof container !== "object") {
          return null;
        }
        if (!Array.isArray(container.children)) {
          container.children = [];
        }
        const existing = slotHandleByContainer.get(container);
        if (existing && typeof existing === "object" && String(existing.name || "default") === normalizedName) {
          existing.children = container.children;
          return existing;
        }
        const slotNode = createSlotFactory({
          name: normalizedName,
          children: container.children,
          meta: { generated: true, virtual: true },
        });
        try {
          Object.defineProperty(slotNode, "__qhtmlVirtualSlot", {
            value: true,
            configurable: true,
            writable: true,
            enumerable: false,
          });
        } catch (error) {
          slotNode.__qhtmlVirtualSlot = true;
        }
        slotHandleByContainer.set(container, slotNode);
        slotContainerByHandle.set(slotNode, container);
        const ownerId = ensureInstanceId(targetNode);
        if (ownerId) {
          qdomSlotOwnerIds.set(slotNode, ownerId);
        }
        return slotNode;
      }

      function nodeAttributes(targetNode) {
        return targetNode && targetNode.attributes && typeof targetNode.attributes === "object" ? targetNode.attributes : {};
      }

      function splitClasses(value) {
        return String(value || "")
          .split(/\s+/)
          .map(function trimClassName(name) {
            return name.trim();
          })
          .filter(Boolean);
      }

      function selectNodeName(targetNode) {
        const kind = normalizedKind(targetNode);
        if (kind === "component" || kind === "component-instance" || kind === "template-instance") {
          return String(targetNode.componentId || targetNode.tagName || "").trim().toLowerCase();
        }
        return String(targetNode && targetNode.tagName ? targetNode.tagName : "").trim().toLowerCase();
      }

      function matchesAttributeSelector(targetNode, selectorText) {
        const match = String(selectorText || "")
          .trim()
          .match(/^\[\s*([A-Za-z0-9_.:-]+)\s*(?:=\s*(?:\"([^\"]*)\"|'([^']*)'|([^\]\s]+)))?\s*\]$/);
        if (!match) {
          return false;
        }
        const attrs = nodeAttributes(targetNode);
        const attrName = String(match[1] || "").trim();
        if (!attrName) {
          return false;
        }
        if (!Object.prototype.hasOwnProperty.call(attrs, attrName)) {
          return false;
        }
        const expected = typeof match[2] === "string" ? match[2] : typeof match[3] === "string" ? match[3] : typeof match[4] === "string" ? match[4] : null;
        if (expected === null) {
          return true;
        }
        return String(attrs[attrName]) === String(expected);
      }

      function matchesNodeSelector(targetNode, selectorText) {
        if (!targetNode || typeof targetNode !== "object") {
          return false;
        }
        const selector = String(selectorText || "").trim();
        if (!selector) {
          return false;
        }

        if (selector.charAt(0) === "[") {
          return matchesAttributeSelector(targetNode, selector);
        }

        const attrs = nodeAttributes(targetNode);
        if (selector.charAt(0) === "#") {
          const expectedId = selector.slice(1);
          return String(attrs.id || "") === expectedId;
        }
        if (selector.charAt(0) === ".") {
          const requiredClass = selector.slice(1);
          if (!requiredClass) {
            return false;
          }
          return splitClasses(attrs.class).indexOf(requiredClass) !== -1;
        }

        let expectedTag = selector;
        let expectedId = "";
        const requiredClasses = [];
        const hashIndex = expectedTag.indexOf("#");
        if (hashIndex !== -1) {
          expectedId = expectedTag.slice(hashIndex + 1).split(".")[0];
          expectedTag = expectedTag.slice(0, hashIndex) + expectedTag.slice(hashIndex + 1 + expectedId.length);
        }
        const classSplit = expectedTag.split(".");
        expectedTag = String(classSplit.shift() || "").trim().toLowerCase();
        for (let i = 0; i < classSplit.length; i += 1) {
          const cls = String(classSplit[i] || "").trim();
          if (cls) {
            requiredClasses.push(cls);
          }
        }

        if (expectedTag) {
          const nodeName = selectNodeName(targetNode);
          if (nodeName !== expectedTag) {
            return false;
          }
        }
        if (expectedId && String(attrs.id || "") !== expectedId) {
          return false;
        }
        if (requiredClasses.length > 0) {
          const classes = splitClasses(attrs.class);
          for (let i = 0; i < requiredClasses.length; i += 1) {
            if (classes.indexOf(requiredClasses[i]) === -1) {
              return false;
            }
          }
        }
        return true;
      }

      function childCollections(targetNode) {
        if (!targetNode || typeof targetNode !== "object") {
          return [];
        }
        const out = [];
        const kind = normalizedKind(targetNode);
        if (isInstanceKind(kind)) {
          normalizeLegacySlotArrays(targetNode);
        }
        if (Array.isArray(targetNode.nodes)) {
          out.push(targetNode.nodes);
        }
        if (Array.isArray(targetNode.templateNodes)) {
          out.push(targetNode.templateNodes);
        }
        if (Array.isArray(targetNode.children)) {
          out.push(targetNode.children);
        }
        if (Array.isArray(targetNode.slots)) {
          out.push(targetNode.slots);
        }
        if (Array.isArray(targetNode.__qhtmlSlotNodes)) {
          out.push(targetNode.__qhtmlSlotNodes);
        }
        if (Array.isArray(targetNode.__qhtmlRenderTree)) {
          out.push(targetNode.__qhtmlRenderTree);
        }
        return out;
      }

      function walkTree(rootNode, visitor, visited) {
        if (!rootNode || typeof rootNode !== "object") {
          return;
        }
        const seen = visited || new Set();
        if (seen.has(rootNode)) {
          return;
        }
        seen.add(rootNode);

        const shouldStop = visitor(rootNode);
        if (shouldStop === true) {
          return;
        }

        const collections = childCollections(rootNode);
        for (let i = 0; i < collections.length; i += 1) {
          const list = collections[i];
          for (let j = 0; j < list.length; j += 1) {
            walkTree(list[j], visitor, seen);
          }
        }
      }

      function findMatches(rootNode, selectorText, allMatches) {
        const matches = [];
        walkTree(rootNode, function collect(nodeCandidate) {
          if (matchesNodeSelector(nodeCandidate, selectorText)) {
            matches.push(nodeCandidate);
            if (!allMatches) {
              return true;
            }
          }
          return false;
        });
        return matches;
      }

      function findParentNodeInTree(rootNode, targetNode) {
        const rootSource = sourceNodeOf(rootNode);
        const targetSource = sourceNodeOf(targetNode);
        if (!rootSource || !targetSource || rootSource === targetSource) {
          return null;
        }
        const seen = new Set([rootSource]);
        const stack = [rootSource];
        while (stack.length > 0) {
          const current = stack.pop();
          if (!current || typeof current !== "object") {
            continue;
          }
          const collections = childCollections(current);
          for (let i = 0; i < collections.length; i += 1) {
            const list = collections[i];
            for (let j = 0; j < list.length; j += 1) {
              const child = list[j];
              if (!child || typeof child !== "object") {
                continue;
              }
              const childSource = sourceNodeOf(child) || child;
              if (childSource === targetSource) {
                return current;
              }
              if (seen.has(childSource)) {
                continue;
              }
              seen.add(childSource);
              stack.push(childSource);
            }
          }
        }
        return null;
      }

      function sourceNodeOf(targetNode) {
        if (!targetNode || typeof targetNode !== "object") {
          return null;
        }
        if (targetNode.__qhtmlSourceNode && typeof targetNode.__qhtmlSourceNode === "object") {
          return targetNode.__qhtmlSourceNode;
        }
        return targetNode;
      }

      function resolveTargetNode(input) {
        if (!input || typeof input !== "object") {
          return null;
        }
        if (typeof input.qdom === "function" && typeof input.nodeType === "number") {
          try {
            return sourceNodeOf(input.qdom());
          } catch (error) {
            return null;
          }
        }
        return sourceNodeOf(input);
      }

      function readOwnerInstanceId(nodeCandidate) {
        if (!nodeCandidate || typeof nodeCandidate !== "object") {
          return "";
        }
        if (qdomSlotOwnerIds.has(nodeCandidate)) {
          const fromMap = qdomSlotOwnerIds.get(nodeCandidate);
          if (typeof fromMap === "string" && fromMap.trim()) {
            return fromMap.trim();
          }
        }
        if (qdomInstanceIds.has(nodeCandidate)) {
          const fromInstanceMap = qdomInstanceIds.get(nodeCandidate);
          if (typeof fromInstanceMap === "string" && fromInstanceMap.trim()) {
            return fromInstanceMap.trim();
          }
        }
        if (typeof nodeCandidate.ownerInstanceId === "string" && nodeCandidate.ownerInstanceId.trim()) {
          return nodeCandidate.ownerInstanceId.trim();
        }
        if (typeof nodeCandidate.instanceId === "string" && nodeCandidate.instanceId.trim()) {
          return nodeCandidate.instanceId.trim();
        }
        if (typeof nodeCandidate.__qhtmlInstanceId === "string" && nodeCandidate.__qhtmlInstanceId.trim()) {
          return nodeCandidate.__qhtmlInstanceId.trim();
        }
        if (nodeCandidate.meta && typeof nodeCandidate.meta === "object") {
          if (typeof nodeCandidate.meta.ownerInstanceId === "string" && nodeCandidate.meta.ownerInstanceId.trim()) {
            return nodeCandidate.meta.ownerInstanceId.trim();
          }
          if (typeof nodeCandidate.meta.instanceId === "string" && nodeCandidate.meta.instanceId.trim()) {
            return nodeCandidate.meta.instanceId.trim();
          }
        }
        return "";
      }

      function listSlots(rootNode, ownerInstanceId) {
        const expectedOwner = String(ownerInstanceId || "").trim();
        const matches = [];
        walkTree(rootNode, function collect(candidate) {
          if (!candidate || typeof candidate !== "object") {
            return false;
          }
          if (normalizedKind(candidate) !== "slot") {
            return false;
          }
          if (!expectedOwner || readOwnerInstanceId(candidate) === expectedOwner) {
            matches.push(candidate);
          }
          return false;
        });
        return matches;
      }

      function collectDeclaredSlotNamesFromTemplate(nodes, outSet) {
        const set = outSet || new Set();
        const list = Array.isArray(nodes) ? nodes : [];
        for (let i = 0; i < list.length; i += 1) {
          const candidate = list[i];
          if (!candidate || typeof candidate !== "object") {
            continue;
          }
          if (normalizedKind(candidate) === "element" && String(candidate.tagName || "").trim().toLowerCase() === "slot") {
            const attrs = candidate.attributes && typeof candidate.attributes === "object" ? candidate.attributes : {};
            const slotName = typeof attrs.name === "string" && attrs.name.trim() ? attrs.name.trim() : "default";
            set.add(slotName);
          }
          if (Array.isArray(candidate.children)) {
            collectDeclaredSlotNamesFromTemplate(candidate.children, set);
          }
          if (Array.isArray(candidate.templateNodes)) {
            collectDeclaredSlotNamesFromTemplate(candidate.templateNodes, set);
          }
        }
        return set;
      }

      function getDeclaredSlotNamesForInstance(instanceNode) {
        const key = String(instanceNode && (instanceNode.componentId || instanceNode.tagName) ? instanceNode.componentId || instanceNode.tagName : "")
          .trim()
          .toLowerCase();
        if (!key) {
          return new Set();
        }
        let found = null;
        walkTree(binding.qdom, function findDefinition(candidate) {
          if (!candidate || typeof candidate !== "object") {
            return false;
          }
          if (normalizedKind(candidate) !== "component") {
            return false;
          }
          const id = String(candidate.componentId || "").trim().toLowerCase();
          if (!id || id !== key) {
            return false;
          }
          found = collectDeclaredSlotNamesFromTemplate(candidate.templateNodes || [], new Set());
          return true;
        });
        return found || new Set();
      }

      function readInstanceSlotNodes(instanceNode) {
        if (!instanceNode || typeof instanceNode !== "object") {
          return [];
        }
        if (Array.isArray(instanceNode.slots)) {
          return instanceNode.slots;
        }
        if (Array.isArray(instanceNode.__qhtmlSlotNodes)) {
          return instanceNode.__qhtmlSlotNodes;
        }
        return [];
      }

      function findNearestSlotForTarget(rootNode, target) {
        const targetSource = resolveTargetNode(target);
        if (!targetSource) {
          return null;
        }

        const seen = new Set();
        let found = null;

        function walkWithSlot(nodeCandidate, activeSlot, activeOwnerInstanceId) {
          if (!nodeCandidate || typeof nodeCandidate !== "object") {
            return false;
          }
          if (seen.has(nodeCandidate)) {
            return false;
          }
          seen.add(nodeCandidate);

          const kind = normalizedKind(nodeCandidate);
          const candidateOwnerId =
            kind === "component-instance" || kind === "template-instance"
              ? readOwnerInstanceId(nodeCandidate)
              : "";
          const currentOwnerId = candidateOwnerId || activeOwnerInstanceId || "";
          let currentSlot = activeSlot;
          if (kind === "slot") {
            if (!readOwnerInstanceId(nodeCandidate) && currentOwnerId) {
              qdomSlotOwnerIds.set(nodeCandidate, currentOwnerId);
            }
            currentSlot = nodeCandidate;
          }
          if (sourceNodeOf(nodeCandidate) === targetSource) {
            found = currentSlot || null;
            return true;
          }

          const collections = childCollections(nodeCandidate);
          for (let i = 0; i < collections.length; i += 1) {
            const list = collections[i];
            for (let j = 0; j < list.length; j += 1) {
              if (walkWithSlot(list[j], currentSlot, currentOwnerId)) {
                return true;
              }
            }
          }
          return false;
        }

        walkWithSlot(rootNode, null, "");
        return found;
      }

      function normalizeNodesForAppend(input, selfNode) {
        let payload = input;
        if (typeof payload === "string" && typeof selfNode.createInstanceFromQHTML === "function") {
          payload = selfNode.createInstanceFromQHTML(payload);
        }
        if (Array.isArray(payload)) {
          return payload
            .map(function mapSource(item) {
              return sourceNodeOf(item) || item;
            })
            .filter(function keepObjects(item) {
              return !!item && typeof item === "object";
            });
        }
        if (payload && typeof payload === "object") {
          const sourcePayload = sourceNodeOf(payload) || payload;
          if (sourcePayload && typeof sourcePayload === "object") {
            return [sourcePayload];
          }
          return [];
        }
        return [];
      }

      function normalizeProjectedNodes(nodes) {
        const list = Array.isArray(nodes) ? nodes : [];
        const out = [];
        for (let i = 0; i < list.length; i += 1) {
          const normalized = sourceNodeOf(list[i]) || list[i];
          if (normalized && typeof normalized === "object") {
            out.push(normalized);
          }
        }
        return out;
      }

      function installFactoryResult(value) {
        if (Array.isArray(value)) {
          return value.map(function installEach(item) {
            return installQDomFactories(item);
          });
        }
        return installQDomFactories(value);
      }

      if (isInstanceKind(normalizedKind(node))) {
        normalizeLegacySlotArrays(node);
      }

      Object.defineProperty(node, "createQElement", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: function createQElement(options, attributes, children) {
          if (options && typeof options === "object" && !Array.isArray(options)) {
            return createElementFactory(options);
          }
          return createElementFactory({
            tagName: options,
            attributes: attributes,
            children: children,
          });
        },
      });
      Object.defineProperty(node, "createQText", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: function createQText(options) {
          if (options && typeof options === "object" && !Array.isArray(options)) {
            return createTextFactory(options);
          }
          return createTextFactory({ value: options });
        },
      });
      Object.defineProperty(node, "createQRawHtml", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: function createQRawHtml(options) {
          if (options && typeof options === "object" && !Array.isArray(options)) {
            return createRawHtmlFactory(options);
          }
          return createRawHtmlFactory({ html: options });
        },
      });
      Object.defineProperty(node, "createQSlot", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: function createQSlot(options, children) {
          if (options && typeof options === "object" && !Array.isArray(options)) {
            return createSlotFactory(options);
          }
          return createSlotFactory({ name: options, children: children });
        },
      });
      Object.defineProperty(node, "qcolor", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: function qcolor(name) {
          const key = String(name || "").trim();
          if (!key) {
            return null;
          }
          const context = readDocumentQColorContext(binding);
          const normalized = normalizeQColorKey(key);
          const schemaEntry = context.schemas.get(normalized);
          if (schemaEntry && typeof schemaEntry === "object") {
            return createQColorNodeFromEntry(schemaEntry.name || key, schemaEntry.property, context);
          }
          const schemaDefEntry = context.schemaDefs && context.schemaDefs instanceof Map
            ? context.schemaDefs.get(normalized)
            : null;
          if (schemaDefEntry && typeof schemaDefEntry === "object") {
            return createQColorNodeFromEntry(schemaDefEntry.name || key, schemaDefEntry.entries, context);
          }
          const themeEntry = context.themes.get(normalized);
          if (themeEntry && typeof themeEntry === "object") {
            return createQColorNodeFromEntry(themeEntry.name || key, themeEntry.assignments, context);
          }
          return null;
        },
      });
      Object.defineProperty(node, "qcolors", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: function qcolors() {
          const context = readDocumentQColorContext(binding);
          const out = [];
          context.schemas.forEach(function eachSchema(entry) {
            if (!entry || typeof entry !== "object") {
              return;
            }
            const nodeValue = createQColorNodeFromEntry(entry.name, entry.property, context);
            if (nodeValue) {
              out.push(nodeValue);
            }
          });
          if (context.schemaDefs && context.schemaDefs instanceof Map) {
            context.schemaDefs.forEach(function eachSchemaDef(entry) {
              if (!entry || typeof entry !== "object") {
                return;
              }
              const nodeValue = createQColorNodeFromEntry(entry.name, entry.entries, context);
              if (nodeValue) {
                out.push(nodeValue);
              }
            });
          }
          context.themes.forEach(function eachTheme(entry) {
            if (!entry || typeof entry !== "object") {
              return;
            }
            const nodeValue = createQColorNodeFromEntry(entry.name, entry.assignments, context);
            if (nodeValue) {
              out.push(nodeValue);
            }
          });
          return out;
        },
      });
      Object.defineProperty(node, "setQColorSchema", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: function setQColorSchema(name, value, options) {
          const key = String(name || "").trim();
          const colorValue = String(value == null ? "" : value).trim();
          if (!key || !colorValue) {
            return false;
          }
          const context = readDocumentQColorContext(binding);
          registerQColorSchema(context, key, colorValue);
          persistDocumentQColorContext(binding, context);
          const opts = options && typeof options === "object" ? options : {};
          if (opts.update === false) {
            evaluateAllNodeQColors(binding);
            return true;
          }
          return updateQHtmlElement(host, { forceBindings: true });
        },
      });
      Object.defineProperty(node, "setQColorTheme", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: function setQColorTheme(name, assignments, options) {
          const key = String(name || "").trim();
          if (!key || !assignments || typeof assignments !== "object" || Array.isArray(assignments)) {
            return false;
          }
          const context = readDocumentQColorContext(binding);
          const opts = options && typeof options === "object" ? options : {};
          registerQColorTheme(context, key, assignments, {
            setAsDefault: opts.makeDefault === true,
          });
          persistDocumentQColorContext(binding, context);
          if (opts.update === false) {
            evaluateAllNodeQColors(binding);
            return true;
          }
          return updateQHtmlElement(host, { forceBindings: true });
        },
      });
      Object.defineProperty(node, "setQColorDefaultTheme", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: function setQColorDefaultTheme(name, options) {
          const key = normalizeQColorKey(name);
          if (!key) {
            return false;
          }
          const context = readDocumentQColorContext(binding);
          if (!context.themes.has(key)) {
            return false;
          }
          context.defaultThemeName = key;
          persistDocumentQColorContext(binding, context);
          const opts = options && typeof options === "object" ? options : {};
          if (opts.update === false) {
            evaluateAllNodeQColors(binding);
            return true;
          }
          return updateQHtmlElement(host, { forceBindings: true });
        },
      });
      Object.defineProperty(node, "find", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: function find(selector) {
          const selectorText = String(selector || "").trim();
          if (!selectorText) {
            return null;
          }
          const matches = findMatches(node, selectorText, false);
          return matches.length > 0 ? installQDomFactories(matches[0]) : null;
        },
      });
      Object.defineProperty(node, "findAll", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: function findAll(selector) {
          const selectorText = String(selector || "").trim();
          if (!selectorText) {
            return [];
          }
          const matches = findMatches(node, selectorText, true);
          return matches.map(function mapMatch(found) {
            return installQDomFactories(found);
          });
        },
      });
      Object.defineProperty(node, "root", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: function root(options) {
          const documentRoot = sourceNodeOf(binding.rawQdom || binding.qdom);
          if (!documentRoot || typeof documentRoot !== "object") {
            return null;
          }
          let cursor = sourceNodeOf(node) || node;
          let depth = 0;
          while (cursor && cursor !== documentRoot && depth < 10000) {
            cursor = findParentNodeInTree(documentRoot, cursor);
            depth += 1;
          }
          if (cursor !== documentRoot) {
            return null;
          }

          const mode =
            typeof options === "string"
              ? options.trim().toLowerCase()
              : options && typeof options === "object" && typeof options.mode === "string"
                ? String(options.mode).trim().toLowerCase()
                : "";
          if (mode === "qdom" || options === true || (options && typeof options === "object" && options.qdom === true)) {
            return installQDomFactories(documentRoot);
          }
          return host;
        },
      });
      Object.defineProperty(node, "findSlotFor", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: function findSlotFor(target) {
          const slotNode = findNearestSlotForTarget(node, target);
          return slotNode ? installQDomFactories(slotNode) : null;
        },
      });
      function listSlotsByOwner(ownerInstanceId) {
        const kind = normalizedKind(node);
        if (kind === "slot") {
          return [installQDomFactories(node)];
        }
        if (isInstanceKind(kind)) {
          normalizeLegacySlotArrays(node);
          const result = [];
          const declaredSlotNames = getDeclaredSlotNamesForInstance(node);
          const children = ensureChildrenList(node);
          const expectedOwnerId =
            typeof ownerInstanceId === "string" && ownerInstanceId.trim()
              ? ownerInstanceId.trim()
              : readOwnerInstanceId(node);
          const effectiveOwnerId = expectedOwnerId || ensureInstanceId(node);

          // Prefer explicit parsed slot nodes first.
          const explicitSlots = readInstanceSlotNodes(node);
          for (let i = 0; i < explicitSlots.length; i += 1) {
            const slotNode = explicitSlots[i];
            if (!slotNode || normalizedKind(slotNode) !== "slot") {
              continue;
            }
            if (!readOwnerInstanceId(slotNode) && effectiveOwnerId) {
              qdomSlotOwnerIds.set(slotNode, effectiveOwnerId);
            }
            const slotName = String(slotNode.name || "default").trim() || "default";
            if (declaredSlotNames.size > 0 && !declaredSlotNames.has(slotName)) {
              continue;
            }
            if (!expectedOwnerId || readOwnerInstanceId(slotNode) === expectedOwnerId) {
              result.push(installQDomFactories(slotNode));
            }
          }
          if (result.length > 0) {
            return result;
          }

          // If nothing is declared and no explicit slots exist, keep legacy behavior.
          if (declaredSlotNames.size === 0) {
            return result;
          }

          declaredSlotNames.forEach(function eachDeclaredSlot(slotNameRaw) {
            const slotName = String(slotNameRaw || "default").trim() || "default";
            if (slotName === "default") {
              const handle = slotHandleForContainer(node, "default", node);
              if (handle && (!expectedOwnerId || readOwnerInstanceId(handle) === expectedOwnerId)) {
                result.push(installQDomFactories(handle));
              }
              return;
            }
            let wrapper = null;
            for (let i = 0; i < children.length; i += 1) {
              const child = children[i];
              if (!child || normalizedKind(child) !== "element") {
                continue;
              }
              if (String(child.tagName || "").trim().toLowerCase() === slotName.toLowerCase()) {
                wrapper = child;
                break;
              }
            }
            if (!wrapper) {
              return;
            }
            const handle = slotHandleForContainer(node, slotName, wrapper);
            if (handle && (!expectedOwnerId || readOwnerInstanceId(handle) === expectedOwnerId)) {
              result.push(installQDomFactories(handle));
            }
          });
          if (result.length > 0) {
            return result;
          }
          for (let i = 0; i < children.length; i += 1) {
            const child = children[i];
            if (!child || normalizedKind(child) !== "element") {
              continue;
            }
            const slotName = String(child.tagName || "").trim();
            if (!slotName) {
              continue;
            }
            const handle = slotHandleForContainer(node, slotName, child);
            if (!handle) {
              continue;
            }
            if (!expectedOwnerId || readOwnerInstanceId(handle) === expectedOwnerId) {
              result.push(installQDomFactories(handle));
            }
          }
          return result;
        }
        const effectiveOwnerId =
          typeof ownerInstanceId === "string" && ownerInstanceId.trim()
            ? ownerInstanceId.trim()
            : kind === "component-instance" || kind === "template-instance"
              ? readOwnerInstanceId(node)
              : "";
        return listSlots(node, effectiveOwnerId).map(function installEach(found) {
          return installQDomFactories(found);
        });
      }

      Object.defineProperty(node, "listSlots", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: listSlotsByOwner,
      });
      Object.defineProperty(node, "slots", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: listSlotsByOwner,
      });
      Object.defineProperty(node, "slot", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: function slot(name) {
          const slotName = String(name || "default").trim() || "default";
          const kind = normalizedKind(node);

          if (kind === "slot") {
            if (String(node.name || "default") === slotName) {
              return installQDomFactories(node);
            }
            return null;
          }

          if (kind === "component-instance" || kind === "template-instance") {
            normalizeLegacySlotArrays(node);
            const ownerInstanceId = ensureInstanceId(node);
            const explicitSlots = readInstanceSlotNodes(node);
            for (let i = 0; i < explicitSlots.length; i += 1) {
              const slotNode = explicitSlots[i];
              if (!slotNode || normalizedKind(slotNode) !== "slot") {
                continue;
              }
              if (String(slotNode.name || "default") !== slotName) {
                continue;
              }
              if (!readOwnerInstanceId(slotNode) && ownerInstanceId) {
                qdomSlotOwnerIds.set(slotNode, ownerInstanceId);
              }
              return installQDomFactories(slotNode);
            }

            if (explicitSlots.length > 0) {
              const createdSlot = createSlotFactory({
                name: slotName,
                children: [],
                meta: { generated: true },
              });
              if (!Array.isArray(node.slots)) {
                node.slots = [];
              }
              node.slots.push(createdSlot);
              if (ownerInstanceId) {
                qdomSlotOwnerIds.set(createdSlot, ownerInstanceId);
              }
              return installQDomFactories(createdSlot);
            }

            if (slotName === "default") {
              const defaultHandle = slotHandleForContainer(node, "default", node);
              if (defaultHandle && !readOwnerInstanceId(defaultHandle)) {
                qdomSlotOwnerIds.set(defaultHandle, ownerInstanceId);
              }
              return defaultHandle ? installQDomFactories(defaultHandle) : null;
            }
            const wrapper = findSlotWrapperChild(node, slotName) || createSlotWrapperChild(node, slotName);
            const handle = slotHandleForContainer(node, slotName, wrapper);
            if (handle && !readOwnerInstanceId(handle)) {
              qdomSlotOwnerIds.set(handle, ownerInstanceId);
            }
            return handle ? installQDomFactories(handle) : null;
          }

          const matches = [];
          walkTree(node, function collectSlots(candidate) {
            if (!candidate || typeof candidate !== "object") {
              return false;
            }
            if (normalizedKind(candidate) === "slot" && String(candidate.name || "default") === slotName) {
              matches.push(candidate);
              return true;
            }
            return false;
          });
          return matches.length > 0 ? installQDomFactories(matches[0]) : null;
        },
      });
      Object.defineProperty(node, "appendNode", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: function appendNode(input) {
          const nodesToAppend = normalizeNodesForAppend(input, node);
          if (nodesToAppend.length === 0) {
            return null;
          }

          const kind = normalizedKind(node);
          let targetList = null;
          if (kind === "document") {
            if (!Array.isArray(node.nodes)) {
              node.nodes = [];
            }
            targetList = node.nodes;
          } else if (kind === "component") {
            if (!Array.isArray(node.templateNodes)) {
              node.templateNodes = [];
            }
            targetList = node.templateNodes;
          } else if (kind === "slot" || kind === "element") {
            const slotContainer = kind === "slot" ? slotContainerByHandle.get(node) : null;
            if (slotContainer && typeof slotContainer === "object") {
              if (!Array.isArray(slotContainer.children)) {
                slotContainer.children = [];
              }
              node.children = slotContainer.children;
              targetList = slotContainer.children;
            } else {
              if (!Array.isArray(node.children)) {
                node.children = [];
              }
              targetList = node.children;
            }
          } else if (kind === "component-instance" || kind === "template-instance") {
            const appendAsSlot =
              nodesToAppend.length === 1 &&
              nodesToAppend[0] &&
              normalizedKind(nodesToAppend[0]) === "slot";
            if (appendAsSlot) {
              normalizeLegacySlotArrays(node);
              const slotNode = nodesToAppend[0];
              const slotName = String(slotNode && slotNode.name ? slotNode.name : "default").trim() || "default";
              if (slotName === "default") {
                targetList = ensureChildrenList(node);
              } else {
                const wrapper = findSlotWrapperChild(node, slotName) || createSlotWrapperChild(node, slotName);
                if (!Array.isArray(wrapper.children)) {
                  wrapper.children = [];
                }
                targetList = wrapper.children;
              }
              nodesToAppend.splice(0, nodesToAppend.length);
              const projectedChildren = normalizeProjectedNodes(slotNode && Array.isArray(slotNode.children) ? slotNode.children : []);
              for (let i = 0; i < projectedChildren.length; i += 1) {
                nodesToAppend.push(projectedChildren[i]);
              }
            } else {
              if (!Array.isArray(node.children)) {
                node.children = [];
              }
              targetList = node.children;
            }
          } else if (Array.isArray(node.children)) {
            targetList = node.children;
          } else {
            node.children = [];
            targetList = node.children;
          }

          for (let i = 0; i < nodesToAppend.length; i += 1) {
            targetList.push(nodesToAppend[i]);
          }
          return nodesToAppend.length === 1
            ? installQDomFactories(nodesToAppend[0])
            : nodesToAppend.map(function mapNode(appended) {
                return installQDomFactories(appended);
              });
        },
      });
      Object.defineProperty(node, "setAttribute", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: function setAttribute(name, value) {
          const key = String(name || "").trim();
          if (!key) {
            return installQDomFactories(node);
          }
          if (!node.attributes || typeof node.attributes !== "object") {
            node.attributes = {};
          }
          node.attributes[key] = String(value);
          return installQDomFactories(node);
        },
      });
      Object.defineProperty(node, "removeAttribute", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: function removeAttribute(name) {
          const key = String(name || "").trim();
          if (!key || !node.attributes || typeof node.attributes !== "object") {
            return installQDomFactories(node);
          }
          delete node.attributes[key];
          return installQDomFactories(node);
        },
      });
      Object.defineProperty(node, "createInstanceFromQHTML", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: function createInstanceFromQHTML(source, options) {
          const qhtmlSource = String(source || "").trim();
          if (!qhtmlSource) {
            return null;
          }
          if (!parser || typeof parser.parseQHtmlToQDom !== "function") {
            throw new Error("createInstanceFromQHTML requires parser.parseQHtmlToQDom");
          }
          const parsed = parser.parseQHtmlToQDom(qhtmlSource, Object.assign({ resolveImportsBeforeParse: false }, options || {}));
          const nodes = parsed && Array.isArray(parsed.nodes) ? parsed.nodes : [];
          if (nodes.length === 0) {
            return null;
          }
          if (nodes.length === 1) {
            return installQDomFactories(nodes[0]);
          }
          return installFactoryResult(nodes);
        },
      });
      Object.defineProperty(node, "replaceWithQHTML", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: function replaceWithQHTML(source, rootNode, options) {
          const qhtmlSource = String(source || "").trim();
          if (!qhtmlSource) {
            return null;
          }

          const rootCandidateFromArg =
            rootNode && typeof rootNode === "object"
              ? typeof rootNode.qdom === "function"
                ? rootNode.qdom()
                : rootNode
              : null;
          const rootCandidate =
            binding && binding.qdom && typeof binding.qdom === "object"
              ? binding.qdom
              : rootCandidateFromArg;
          if (!rootCandidate || typeof rootCandidate !== "object") {
            return null;
          }
          if (typeof rootCandidate.createInstanceFromQHTML !== "function") {
            return null;
          }

          const created = rootCandidate.createInstanceFromQHTML(qhtmlSource, options);
          const inserted = normalizeNodesForAppend(created, rootCandidate);
          if (inserted.length === 0) {
            return null;
          }

          const targetSource = sourceNodeOf(node);
          let replaced = false;

          const stack = [rootCandidate];
          while (stack.length > 0 && !replaced) {
            const current = stack.pop();
            if (!current || typeof current !== "object") {
              continue;
            }

            const lists = [current.nodes, current.templateNodes, current.children];
            for (let li = 0; li < lists.length && !replaced; li += 1) {
              const list = lists[li];
              if (!Array.isArray(list)) {
                continue;
              }
              for (let i = 0; i < list.length; i += 1) {
                const child = list[i];
                if (child && typeof child === "object") {
                  stack.push(child);
                }
                if (sourceNodeOf(child) !== targetSource) {
                  continue;
                }
                list.splice.apply(list, [i, 1].concat(inserted));
                replaced = true;
                break;
              }
            }
          }

          if (!replaced) {
            return null;
          }
          if (binding && !binding.rendering) {
            renderBinding(binding);
          }
          return inserted.length === 1
            ? installQDomFactories(inserted[0])
            : inserted.map(function mapInserted(item) {
                return installQDomFactories(item);
              });
        },
      });
      Object.defineProperty(node, "rewrite", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: function rewrite(parameterBindings, rewriteCallback) {
          let bindings = parameterBindings;
          let callback = rewriteCallback;
          if (typeof bindings === "function" && typeof callback === "undefined") {
            callback = bindings;
            bindings = null;
          }
          if (typeof callback !== "function") {
            throw new Error("rewrite requires a callback function.");
          }
          const facade = installQDomFactories(node);
          const effectiveBindings =
            bindings && typeof bindings === "object" && !Array.isArray(bindings)
              ? Object.assign({}, bindings)
              : {};
          if (!Object.prototype.hasOwnProperty.call(effectiveBindings, "this")) {
            effectiveBindings.this = facade;
          }
          const rewritten = callback.call(effectiveBindings.this, effectiveBindings, facade);
          if (rewritten == null) {
            return null;
          }
          return node.replaceWithQHTML(String(rewritten), null);
        },
      });
      Object.defineProperty(node, "serialize", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: function serialize() {
          return core.serializeQDomCompressed(node);
        },
      });
      Object.defineProperty(node, "show", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: function show() {
          const keys = normalizeShowKeys(Array.prototype.slice.call(arguments));
          const sourceTarget = sourceNodeOf(node) || node;
          const options = keys.length > 0 ? { whitelist: new Set(keys) } : {};
          return [cloneForOutput(sourceTarget, options, new Set())];
        },
      });
      Object.defineProperty(node, "map", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: function map(mappingSpec) {
          const mapping =
            mappingSpec && typeof mappingSpec === "object" && !Array.isArray(mappingSpec)
              ? mappingSpec
              : {};
          const sourceTarget = sourceNodeOf(node) || node;
          return [cloneForOutput(sourceTarget, { mapSpec: mapping }, new Set())];
        },
      });
      Object.defineProperty(node, "deserialize", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: function deserialize(serializedPayload, shouldReplaceQDom) {
          if (!core || typeof core.deserializeQDomCompressed !== "function") {
            throw new Error("deserialize requires qdomCore.deserializeQDomCompressed.");
          }
          const payload = String(serializedPayload || "");
          if (!payload.trim()) {
            return null;
          }
          const decoded = core.deserializeQDomCompressed(payload);
          const decodedSource = sourceNodeOf(decoded) || decoded;
          const decodedKind = normalizedKind(decodedSource);
          const incomingNodes = [];
          if (decodedKind === "document") {
            const decodedNodeList = Array.isArray(decodedSource && decodedSource.nodes) ? decodedSource.nodes : [];
            for (let i = 0; i < decodedNodeList.length; i += 1) {
              const candidate = sourceNodeOf(decodedNodeList[i]) || decodedNodeList[i];
              if (candidate && typeof candidate === "object") {
                incomingNodes.push(candidate);
              }
            }
          } else if (decodedSource && typeof decodedSource === "object") {
            incomingNodes.push(decodedSource);
          }

          const replace = shouldReplaceQDom === true;
          const targetKind = normalizedKind(node);
          if (replace) {
            if (targetKind === "document") {
              if (!Array.isArray(node.nodes)) {
                node.nodes = [];
              }
              node.nodes.splice(0, node.nodes.length);
              if (Array.isArray(decodedSource && decodedSource.scripts)) {
                node.scripts = decodedSource.scripts.slice();
              } else if (!Array.isArray(node.scripts)) {
                node.scripts = [];
              }
            } else if (targetKind === "component") {
              if (!Array.isArray(node.templateNodes)) {
                node.templateNodes = [];
              }
              node.templateNodes.splice(0, node.templateNodes.length);
            } else if (targetKind === "slot") {
              const slotContainer = slotContainerByHandle.get(node);
              if (slotContainer && typeof slotContainer === "object") {
                if (!Array.isArray(slotContainer.children)) {
                  slotContainer.children = [];
                }
                slotContainer.children.splice(0, slotContainer.children.length);
                node.children = slotContainer.children;
              } else {
                if (!Array.isArray(node.children)) {
                  node.children = [];
                }
                node.children.splice(0, node.children.length);
              }
            } else {
              if (!Array.isArray(node.children)) {
                node.children = [];
              }
              node.children.splice(0, node.children.length);
            }
          } else if (targetKind === "document" && decodedKind === "document" && Array.isArray(decodedSource && decodedSource.scripts)) {
            if (!Array.isArray(node.scripts)) {
              node.scripts = [];
            }
            for (let i = 0; i < decodedSource.scripts.length; i += 1) {
              node.scripts.push(decodedSource.scripts[i]);
            }
          }

          if (incomingNodes.length === 0) {
            return installQDomFactories(node);
          }

          const appended = node.appendNode(incomingNodes);
          return appended == null ? installQDomFactories(node) : appended;
        },
      });
      Object.defineProperty(node, "createQComponentInstance", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: function createQComponentInstance(options, attributes) {
          let created;
          if (options && typeof options === "object" && !Array.isArray(options)) {
            created = createComponentInstanceFactory(
              Object.assign({}, options, {
                kind: "component-instance",
              })
            );
          } else {
            created = createComponentInstanceFactory({
              kind: "component-instance",
              componentId: options,
              tagName: options,
              attributes: attributes,
            });
          }
          return installQDomFactories(created);
        },
      });
      Object.defineProperty(node, "createQTemplateInstance", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: function createQTemplateInstance(options, attributes) {
          let created;
          if (options && typeof options === "object" && !Array.isArray(options)) {
            created = createComponentInstanceFactory(
              Object.assign({}, options, {
                kind: "template-instance",
              })
            );
          } else {
            created = createComponentInstanceFactory({
              kind: "template-instance",
              componentId: options,
              tagName: options,
              attributes: attributes,
            });
          }
          return installQDomFactories(created);
        },
      });
      Object.defineProperty(node, "invalidate", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: function invalidate(options) {
          const opts = options && typeof options === "object" ? Object.assign({}, options) : {};
          if (!Object.prototype.hasOwnProperty.call(opts, "forceBindings")) {
            opts.forceBindings = true;
          }
          return updateQHtmlElement(host, opts);
        },
      });
      Object.defineProperty(node, "__qhtmlFactoriesInstalled", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: true,
      });

      return createNodeFacade(node);
    }

    host.qdom = function hostQdomAccessor() {
      flushPendingDomMutationSync(binding, {
        maxItems: DOM_MUTATION_SYNC_FLUSH_BATCH_SIZE,
        scheduleRemainder: true,
      });
      return installQDomFactories(binding.qdom);
    };
    host.update = function hostUpdateAccessor() {
      return updateQHtmlElement(host);
    };
    host.invalidate = function hostInvalidateAccessor(options) {
      const opts = options && typeof options === "object" ? Object.assign({}, options) : {};
      if (!Object.prototype.hasOwnProperty.call(opts, "forceBindings")) {
        opts.forceBindings = true;
      }
      return updateQHtmlElement(host, opts);
    };
    host.qhtmlRoot = function hostQhtmlRootAccessor() {
      return host;
    };
    host.root = function hostRootAccessor() {
      return host;
    };
    host.component = null;

    function setSlotContextAccessor(element, slotNode, dynamicResolver) {
      if (!element || element.nodeType !== 1) {
        return;
      }

      function createSlotContext(rawSlotNode) {
        if (!rawSlotNode || typeof rawSlotNode !== "object") {
          return null;
        }
        if (
          typeof rawSlotNode.qdom === "function" &&
          (typeof rawSlotNode.name === "string" || typeof rawSlotNode.name === "number") &&
          !Object.prototype.hasOwnProperty.call(rawSlotNode, "kind")
        ) {
          return rawSlotNode;
        }
        const slotName = String(rawSlotNode.name || "default");
        return {
          name: slotName,
          qdom: function slotQdomAccessor() {
            return installQDomFactories(rawSlotNode);
          },
        };
      }

      const slotContext = createSlotContext(slotNode);

      try {
        if (!Object.prototype.hasOwnProperty.call(element, "__qhtmlSlotAccessorInstalled")) {
          Object.defineProperty(element, "slot", {
            configurable: true,
            enumerable: false,
            get: function qhtmlSlotGetter() {
              if (this.__qhtmlSlotContext) {
                return this.__qhtmlSlotContext;
              }
              if (typeof this.__qhtmlResolveSlotContext === "function") {
                const resolvedSlot = this.__qhtmlResolveSlotContext(this);
                const resolvedContext = createSlotContext(resolvedSlot);
                if (resolvedContext) {
                  this.__qhtmlSlotContext = resolvedContext;
                  return resolvedContext;
                }
              }
              if (typeof this.getAttribute === "function") {
                const attr = this.getAttribute("slot");
                return attr == null ? "" : String(attr);
              }
              return "";
            },
            set: function qhtmlSlotSetter(value) {
              if (value && typeof value === "object" && typeof value.qdom === "function") {
                this.__qhtmlSlotContext = value;
                return;
              }
              this.__qhtmlSlotContext = null;
              if (!this || typeof this.setAttribute !== "function" || typeof this.removeAttribute !== "function") {
                return;
              }
              if (value === null || typeof value === "undefined" || value === "") {
                this.removeAttribute("slot");
                return;
              }
              this.setAttribute("slot", String(value));
            },
          });
          Object.defineProperty(element, "__qhtmlSlotAccessorInstalled", {
            value: true,
            configurable: true,
            enumerable: false,
            writable: true,
          });
        }
        element.__qhtmlResolveSlotContext = typeof dynamicResolver === "function" ? dynamicResolver : null;
        element.__qhtmlSlotContext = slotContext;
      } catch (error) {
        element.qslot = slotContext;
      }

      if (!slotContext) {
        if (Object.prototype.hasOwnProperty.call(element, "__qhtmlSlotContext")) {
          element.__qhtmlSlotContext = null;
        }
        if (Object.prototype.hasOwnProperty.call(element, "qslot")) {
          element.qslot = null;
        }
      }
    }

    function resolveNearestSlotNode(element) {
      if (!element || element.nodeType !== 1) {
        return null;
      }

      let cursor = element;
      while (cursor && cursor.nodeType === 1) {
        const mapped = binding.slotMap && binding.slotMap.get(cursor);
        if (mapped && typeof mapped === "object") {
          return mapped;
        }
        cursor = cursor.parentElement || cursor.parentNode || null;
      }

      const componentHost = resolveNearestComponentHost(element);
      if (componentHost && typeof componentHost.qdom === "function") {
        try {
          const componentQdom = componentHost.qdom();
          if (componentQdom && typeof componentQdom.findSlotFor === "function") {
            const slotFromComponent = componentQdom.findSlotFor(element);
            if (slotFromComponent) {
              return slotFromComponent;
            }
          }
        } catch (error) {
          // ignore dynamic slot resolution errors and continue fallback chain
        }
      }

      if (host && typeof host.qdom === "function") {
        try {
          const hostQdom = host.qdom();
          if (hostQdom && typeof hostQdom.findSlotFor === "function") {
            const slotFromHost = hostQdom.findSlotFor(element);
            if (slotFromHost) {
              return slotFromHost;
            }
          }
        } catch (error) {
          // ignore host-level slot resolution errors
        }
      }

      return null;
    }

    function setComponentContextAccessor(element, componentHost) {
      if (!element || element.nodeType !== 1) {
        return;
      }

      const resolvedHost = componentHost && componentHost.nodeType === 1 ? componentHost : null;
      try {
        if (!Object.prototype.hasOwnProperty.call(element, "__qhtmlComponentAccessorInstalled")) {
          Object.defineProperty(element, "component", {
            configurable: true,
            enumerable: false,
            get: function qhtmlComponentGetter() {
              if (this.__qhtmlComponentContext && this.__qhtmlComponentContext.nodeType === 1) {
                return this.__qhtmlComponentContext;
              }
              return resolveNearestComponentHost(this) || null;
            },
            set: function qhtmlComponentSetter(value) {
              this.__qhtmlComponentContext = value && value.nodeType === 1 ? value : null;
            },
          });
          Object.defineProperty(element, "__qhtmlComponentAccessorInstalled", {
            value: true,
            configurable: true,
            enumerable: false,
            writable: true,
          });
        }
        element.__qhtmlComponentContext = resolvedHost;
      } catch (error) {
        element.component = resolvedHost || resolveNearestComponentHost(element) || null;
      }
    }

    function setRootContextAccessor(element) {
      if (!element || element.nodeType !== 1) {
        return;
      }
      if (
        Object.prototype.hasOwnProperty.call(element, "root") &&
        typeof element.root === "function" &&
        element.__qhtmlRootAccessorInstalled !== true
      ) {
        return;
      }
      try {
        if (!Object.prototype.hasOwnProperty.call(element, "__qhtmlRootAccessorInstalled")) {
          Object.defineProperty(element, "root", {
            configurable: true,
            enumerable: false,
            writable: true,
            value: function qhtmlRootAccessor() {
              return host;
            },
          });
          Object.defineProperty(element, "__qhtmlRootAccessorInstalled", {
            value: true,
            configurable: true,
            enumerable: false,
            writable: true,
          });
        }
      } catch (error) {
        element.root = function qhtmlRootAccessorFallback() {
          return host;
        };
      }
    }

    function setComponentUpdateAccessor(componentHost) {
      if (!componentHost || componentHost.nodeType !== 1) {
        return;
      }
      if (
        Object.prototype.hasOwnProperty.call(componentHost, "update") &&
        typeof componentHost.update === "function" &&
        componentHost.__qhtmlComponentUpdateAccessorInstalled !== true
      ) {
        return;
      }
      try {
        if (!Object.prototype.hasOwnProperty.call(componentHost, "__qhtmlComponentUpdateAccessorInstalled")) {
          Object.defineProperty(componentHost, "update", {
            configurable: true,
            enumerable: false,
            writable: true,
            value: function qhtmlComponentUpdateAccessor() {
              return updateQHtmlElement(host, { scopeElement: this });
            },
          });
          Object.defineProperty(componentHost, "invalidate", {
            configurable: true,
            enumerable: false,
            writable: true,
            value: function qhtmlComponentInvalidateAccessor(options) {
              const opts = options && typeof options === "object" ? Object.assign({}, options) : {};
              opts.scopeElement = this;
              if (!Object.prototype.hasOwnProperty.call(opts, "forceBindings")) {
                opts.forceBindings = true;
              }
              return updateQHtmlElement(host, opts);
            },
          });
          Object.defineProperty(componentHost, "__qhtmlComponentUpdateAccessorInstalled", {
            value: true,
            configurable: true,
            enumerable: false,
            writable: true,
          });
        }
      } catch (error) {
        componentHost.update = function qhtmlComponentUpdateAccessorFallback() {
          return updateQHtmlElement(host, { scopeElement: this });
        };
        componentHost.invalidate = function qhtmlComponentInvalidateAccessorFallback(options) {
          const opts = options && typeof options === "object" ? Object.assign({}, options) : {};
          opts.scopeElement = this;
          if (!Object.prototype.hasOwnProperty.call(opts, "forceBindings")) {
            opts.forceBindings = true;
          }
          return updateQHtmlElement(host, opts);
        };
        componentHost.__qhtmlComponentUpdateAccessorInstalled = true;
      }
    }

    function resolveNearestComponentHost(element) {
      if (!element || element.nodeType !== 1) {
        return null;
      }
      function isComponentHostNode(node) {
        return !!(
          node &&
          node.nodeType === 1 &&
          typeof node.getAttribute === "function" &&
          node.getAttribute("qhtml-component-instance") === "1"
        );
      }

      if (isComponentHostNode(element)) {
        return element;
      }
      if (typeof element.closest === "function") {
        const nearest = element.closest("[qhtml-component-instance='1']");
        if (isComponentHostNode(nearest)) {
          return nearest;
        }
      }
      let cursor = element.parentElement || element.parentNode || null;
      while (cursor) {
        if (isComponentHostNode(cursor)) {
          return cursor;
        }
        cursor = cursor.parentElement || cursor.parentNode || null;
      }
      return null;
    }

    const scope = [];
    function collectScopeElements(node) {
      if (!node || node.nodeType !== 1) {
        return;
      }
      scope.push(node);
      const children = node && node.childNodes && typeof node.childNodes.length === "number" ? node.childNodes : [];
      for (let i = 0; i < children.length; i += 1) {
        collectScopeElements(children[i]);
      }
    }
    collectScopeElements(host);

    for (let i = 0; i < scope.length; i += 1) {
      const element = scope[i];
      if (!element || element.nodeType !== 1) {
        continue;
      }

      const node = binding.nodeMap && binding.nodeMap.get(element);
      if (node) {
        const sourceNode =
          node && typeof node === "object" && node.__qhtmlSourceNode && typeof node.__qhtmlSourceNode === "object"
            ? node.__qhtmlSourceNode
            : node;
        registerMappedDomElement(binding, sourceNode, element);
        element.qdom = function elementQdomAccessor() {
          flushPendingDomMutationSyncForElement(binding, element);
          flushPendingDomMutationSync(binding, {
            maxItems: DOM_MUTATION_SYNC_FLUSH_BATCH_SIZE,
            scheduleRemainder: true,
          });
          return installQDomFactories(sourceNode);
        };
      }
      element.qhtmlRoot = function elementQhtmlRootAccessor() {
        return host;
      };
      setRootContextAccessor(element);

      const componentHost = binding.componentMap && binding.componentMap.get(element);
      const resolvedComponentHost = componentHost || resolveNearestComponentHost(element) || null;
      setComponentContextAccessor(element, resolvedComponentHost);
      setComponentUpdateAccessor(resolvedComponentHost);

      const slotNode = binding.slotMap && binding.slotMap.get(element);
      setSlotContextAccessor(element, slotNode || null, resolveNearestSlotNode);
    }
  }

  function createObservedBinding(binding) {
    const rawQdom = binding.qdom;
    binding.rawQdom = rawQdom;
    const observer = core.observeQDom(rawQdom, function onMutation(mutation) {
      queueObservedMutation(binding, mutation);
    });
    binding.qdom = observer.qdom;
    binding.disconnect = observer.disconnect;
  }

  async function loadOrParseDocument(qHtmlElement, options) {
    const opts = options || {};
    if (opts.preferTemplate !== false) {
      const loaded = core.loadQDomTemplateBefore(qHtmlElement);
      if (loaded) {
        return loaded;
      }
    }

    const source = readInlineSourceFromElement(qHtmlElement);
    const companionScript = findCompanionQScript(qHtmlElement);
    let rules = [];
    if (companionScript) {
      rules = parser.parseQScript(companionScript.textContent || "");
    }

    const importUrls = [];
    let effectiveSource = source;
    if (typeof parser.resolveQImportsAsync === "function") {
      effectiveSource = await parser.resolveQImportsAsync(source, {
        loadImport: loadImportSource,
        baseUrl: resolveImportBaseUrl(qHtmlElement, opts),
        maxImports: opts.maxImports,
        cache: opts.importCache,
        onImport: function onImport(info) {
          if (info && info.url) {
            importUrls.push(info.url);
          }
        },
      });
    }

    const parsed = parser.parseQHtmlToQDom(effectiveSource, {
      scriptRules: rules,
      resolveImportsBeforeParse: false,
    });
    if (!parsed.meta || typeof parsed.meta !== "object") {
      parsed.meta = {};
    }
    if (importUrls.length > 0) {
      parsed.meta.imports = importUrls.slice();
    }
    parsed.meta.resolvedSource = effectiveSource;
    return parsed;
  }

  function mountQHtmlElement(qHtmlElement, options) {
    if (!qHtmlElement || qHtmlElement.nodeType !== 1) {
      throw new Error("mountQHtmlElement expects a q-html element node.");
    }

    const tagName = String(qHtmlElement.tagName || "").toLowerCase();
    if (tagName !== "q-html") {
      throw new Error("mountQHtmlElement expects <q-html>, received <" + tagName + ">.");
    }

    const existing = bindings.get(qHtmlElement);
    if (existing) {
      return existing;
    }

    const doc = qHtmlElement.ownerDocument || global.document;
    markMountPending(doc);
    const binding = {
      host: qHtmlElement,
      doc: doc,
      qdom: null,
      rawQdom: null,
      nodeMap: new WeakMap(),
      componentMap: new WeakMap(),
      slotMap: new WeakMap(),
      componentHostBySourceNode: new WeakMap(),
      domByQdomNode: new WeakMap(),
      listeners: [],
      hostLifecycleRan: false,
      readyHooksState: {},
      rendering: false,
      updating: false,
      pendingMutations: [],
      mutationFlushScheduled: false,
      templateSaveTimer: null,
      domControlSyncAttached: false,
      domControlSyncHandler: null,
      domMutationSyncAttached: false,
      domMutationObserver: null,
      domMutationObservedElements: [],
      domMutationDirtyElements: new Set(),
      domMutationDirtyQueue: [],
      domMutationFlushTimer: null,
      domMutationRefreshTimer: null,
      domMutationSyncSuppressDepth: 0,
      disconnect: function noop() {},
      ready: null,
    };

    bindings.set(qHtmlElement, binding);
    binding.ready = Promise.resolve()
      .then(function loadAndRender() {
        return withDomMutationSyncGloballySuspended(function suspendedParse() {
          return loadOrParseDocument(qHtmlElement, options);
        });
      })
      .then(function attachLoadedDocument(qdomDocument) {
        if (bindings.get(qHtmlElement) !== binding) {
          return binding;
        }
        binding.qdom = qdomDocument;
        binding.rawQdom = qdomDocument;
        binding.hostLifecycleRan = false;
        createObservedBinding(binding);
        renderBinding(binding);
        return binding;
      })
      .catch(function handleMountError(error) {
        if (bindings.get(qHtmlElement) === binding) {
          bindings.delete(qHtmlElement);
        }
        if (global.console && typeof global.console.error === "function") {
          global.console.error("qhtml mount failed:", error);
        }
        throw error;
      })
      .finally(function onMountSettled() {
        markMountSettled(doc, qHtmlElement);
      });

    return binding;
  }

  function mountWithinNode(node, options) {
    if (!node || node.nodeType !== 1) {
      return [];
    }

    const mounted = [];
    const tagName = String(node.tagName || "").toLowerCase();
    if (tagName === "q-html") {
      mounted.push(mountQHtmlElement(node, options));
    }

    if (typeof node.querySelectorAll === "function") {
      const nested = node.querySelectorAll("q-html");
      for (let i = 0; i < nested.length; i += 1) {
        mounted.push(mountQHtmlElement(nested[i], options));
      }
    }

    return mounted;
  }

  function unmountWithinNode(node) {
    if (!node || node.nodeType !== 1) {
      return;
    }

    const tagName = String(node.tagName || "").toLowerCase();
    if (tagName === "q-html") {
      unmountQHtmlElement(node);
    }

    if (typeof node.querySelectorAll === "function") {
      const nested = node.querySelectorAll("q-html");
      for (let i = 0; i < nested.length; i += 1) {
        unmountQHtmlElement(nested[i]);
      }
    }
  }

  function getObserverTarget(root) {
    if (!root) {
      return null;
    }
    if (root.nodeType === 9) {
      return root.documentElement || root.body || null;
    }
    return root;
  }

  function stopAutoMountObserver() {
    if (autoMountObserver && typeof autoMountObserver.disconnect === "function") {
      autoMountObserver.disconnect();
    }
    if (autoMountPollTimer && typeof global.clearTimeout === "function") {
      global.clearTimeout(autoMountPollTimer);
    }
    autoMountObserver = null;
    autoMountPollTimer = null;
    autoMountRoot = null;
  }

  function scheduleFallbackPolling(root, options) {
    if (!root || typeof global.setTimeout !== "function") {
      return null;
    }

    autoMountRoot = root;
    autoMountOptions = options || {};

    const run = function run() {
      if (!autoMountRoot || typeof autoMountRoot.querySelectorAll !== "function") {
        autoMountPollTimer = null;
        return;
      }

      const elements = autoMountRoot.querySelectorAll("q-html");
      for (let i = 0; i < elements.length; i += 1) {
        mountQHtmlElement(elements[i], autoMountOptions);
      }
      hydrateRegisteredComponentHostsInNode(autoMountRoot, autoMountRoot.ownerDocument || global.document);

      autoMountPollTimer = global.setTimeout(run, 50);
      if (autoMountPollTimer && typeof autoMountPollTimer.unref === "function") {
        autoMountPollTimer.unref();
      }
    };

    run();
    return { mode: "polling" };
  }

  function startAutoMountObserver(root, options) {
    const requestedRoot = root || global.document;
    if (autoMountObserver && autoMountRoot === requestedRoot) {
      return autoMountObserver;
    }
    if (autoMountPollTimer && autoMountRoot === requestedRoot) {
      autoMountOptions = options || {};
      return { mode: "polling" };
    }

    const target = getObserverTarget(requestedRoot);
    if (!target) {
      return null;
    }

    if (typeof global.MutationObserver !== "function") {
      stopAutoMountObserver();
      return scheduleFallbackPolling(requestedRoot, options);
    }

    autoMountOptions = options || {};

    stopAutoMountObserver();

    autoMountRoot = requestedRoot;
    autoMountObserver = new global.MutationObserver(function onMutations(mutations) {
      for (let i = 0; i < mutations.length; i += 1) {
        const mutation = mutations[i];
        for (let j = 0; j < mutation.removedNodes.length; j += 1) {
          unmountWithinNode(mutation.removedNodes[j]);
        }
        for (let j = 0; j < mutation.addedNodes.length; j += 1) {
          mountWithinNode(mutation.addedNodes[j], autoMountOptions);
          hydrateRegisteredComponentHostsInNode(mutation.addedNodes[j], requestedRoot.ownerDocument || global.document);
        }
      }
    });

    autoMountObserver.observe(target, {
      childList: true,
      subtree: true,
    });

    return autoMountObserver;
  }

  function unmountQHtmlElement(qHtmlElement) {
    const binding = bindings.get(qHtmlElement);
    if (!binding) {
      return;
    }
    detachAllScriptListeners(binding);
    detachDomControlSync(binding);
    detachDomMutationSync(binding);
    if (binding.templateSaveTimer && typeof global.clearTimeout === "function") {
      global.clearTimeout(binding.templateSaveTimer);
      binding.templateSaveTimer = null;
    }
    if (Array.isArray(binding.pendingMutations)) {
      binding.pendingMutations.length = 0;
    }
    if (typeof binding.disconnect === "function") {
      binding.disconnect();
    }
    terminateWasmRuntimesInNode(binding.host);
    bindings.delete(qHtmlElement);
  }

  function getQDomForElement(qHtmlElement) {
    const binding = bindings.get(qHtmlElement);
    if (!binding) {
      return null;
    }
    flushPendingDomMutationSync(binding, {
      maxItems: DOM_MUTATION_SYNC_FLUSH_BATCH_SIZE,
      scheduleRemainder: true,
    });
    return binding.qdom;
  }

  function describeUpdateHost(binding) {
    const host = binding && binding.host ? binding.host : null;
    if (!host || host.nodeType !== 1) {
      return "<unknown>";
    }
    const tag = String(host.tagName || "q-html").toLowerCase();
    const id = typeof host.getAttribute === "function" ? String(host.getAttribute("id") || "").trim() : "";
    return id ? tag + "#" + id : tag;
  }

  function ensureBindingUpdateGuardState(binding) {
    if (!binding || typeof binding !== "object") {
      return null;
    }
    let state = binding.updateGuardState;
    if (!state || typeof state !== "object") {
      state = {
        inProgress: false,
        queued: false,
        epoch: 0,
        activeEpoch: 0,
        cyclesInTick: 0,
        reentryCountInEpoch: 0,
        nextScopeElement: null,
      };
      binding.updateGuardState = state;
    }
    return state;
  }

  function reportUpdateLoopError(binding, reason, details) {
    if (!global.console || typeof global.console.error !== "function") {
      return;
    }
    global.console.error(
      "qhtml update() aborted due to potential binding loop:",
      Object.assign(
        {
          host: describeUpdateHost(binding),
          reason: String(reason || "unknown"),
        },
        details || {}
      )
    );
  }

  function updateQHtmlElement(qHtmlElement, options) {
    const binding = bindings.get(qHtmlElement);
    if (!binding || !binding.qdom) {
      return false;
    }
    const previousUpdating = binding.updating === true;
    binding.updating = true;
    try {
      flushPendingDomMutationSync(binding, {
        maxItems: DOM_MUTATION_SYNC_FLUSH_BATCH_SIZE,
        scheduleRemainder: true,
      });
      const opts = options && typeof options === "object" ? options : null;
      const forceBindings = !!(
        opts &&
        (opts.forceBindings === true || opts.invalidate === true || opts.force === true || opts.bindings === "all")
      );
      const requestedScopeElement =
        opts && opts.scopeElement && opts.scopeElement.nodeType === 1 ? opts.scopeElement : null;
      logRuntimeEvent("qhtml update() called", {
        host: describeElementForLog(binding.host),
        scope: requestedScopeElement ? describeElementForLog(requestedScopeElement) : null,
        forceBindings: forceBindings === true,
      });
      const state = ensureBindingUpdateGuardState(binding);
      if (!state) {
        return false;
      }

    if (state.inProgress) {
      state.queued = true;
      if (!requestedScopeElement) {
        state.nextScopeElement = null;
      } else if (state.nextScopeElement !== null) {
        // keep pending full update when already requested
      } else {
        state.nextScopeElement = requestedScopeElement;
      }
      state.reentryCountInEpoch += 1;
      if (state.reentryCountInEpoch > MAX_UPDATE_REENTRIES_PER_EPOCH) {
        state.queued = false;
        reportUpdateLoopError(binding, "reentry-limit", {
          epoch: state.activeEpoch,
          reentryCount: state.reentryCountInEpoch,
          limit: MAX_UPDATE_REENTRIES_PER_EPOCH,
        });
        return false;
      }
      return true;
    }

    state.cyclesInTick = 0;
    state.reentryCountInEpoch = 0;
    if (!requestedScopeElement) {
      state.nextScopeElement = null;
    } else if (state.nextScopeElement !== null) {
      // keep pending full update when already requested
    } else {
      state.nextScopeElement = requestedScopeElement;
    }

      while (true) {
      state.queued = false;
      state.epoch += 1;
      state.activeEpoch = state.epoch;
      state.inProgress = true;
      state.reentryCountInEpoch = 0;
      state.cyclesInTick += 1;
      if (state.cyclesInTick > MAX_UPDATE_CYCLES_PER_TICK) {
        state.inProgress = false;
        reportUpdateLoopError(binding, "cycle-limit", {
          epoch: state.activeEpoch,
          cycleCount: state.cyclesInTick,
          limit: MAX_UPDATE_CYCLES_PER_TICK,
        });
        return false;
      }
      try {
        const activeScopeElement = state.nextScopeElement;
        state.nextScopeElement = null;
        evaluateAllNodeBindings(binding, {
          forceAll: forceBindings,
          patchDom: true,
        });
        evaluateAllNodeQColors(binding);
        const updateNonce = createRuntimeUpdateNonceToken();
        const staleNodes = prepareBindingNodeNoncesForUpdate(binding, binding.lastUpdateNonce);
        let didRender = false;
        try {
          if (activeScopeElement) {
            if (!renderScopedComponentBinding(binding, activeScopeElement, { skipBindingEvaluation: true })) {
              renderBinding(binding, { skipBindingEvaluation: true });
            }
            didRender = true;
          } else if (staleNodes.length > 0) {
            renderBinding(binding, { skipBindingEvaluation: true });
            didRender = true;
          }
        } finally {
          if (didRender) {
            finalizeBindingNodeNonces(binding, updateNonce);
          }
        }
      } finally {
        state.inProgress = false;
      }
      if (!state.queued) {
        break;
      }
    }
      return true;
    } finally {
      binding.updating = previousUpdating;
    }
  }

  function toQHtmlSource(qHtmlElement, options) {
    const binding = bindings.get(qHtmlElement);
    if (!binding) {
      return null;
    }
    flushPendingDomMutationSync(binding, {
      maxItems: DOM_MUTATION_SYNC_FLUSH_BATCH_SIZE,
      scheduleRemainder: true,
    });
    return parser.qdomToQHtml(binding.qdom, options);
  }

  function initAll(root, options) {
    const scope = root || global.document;
    if (!scope || typeof scope.querySelectorAll !== "function") {
      return [];
    }

    const elements = scope.querySelectorAll("q-html");
    const out = [];
    for (let i = 0; i < elements.length; i += 1) {
      out.push(mountQHtmlElement(elements[i], options));
    }
    hydrateRegisteredComponentHostsInNode(scope, scope.ownerDocument || global.document);
    startAutoMountObserver(scope, options);
    const signalDoc = getSignalDocument(scope);
    const signalState = ensureContentLoadedState(signalDoc);
    if (signalState) {
      signalState.runtimeManaged = true;
    }
    scheduleContentLoadedSignal(signalDoc, scope);
    return out;
  }

  const runtimeApi = {
    SIGNALS: {
      QHTMLContentLoaded: QHTML_CONTENT_LOADED_EVENT,
    },
    mountQHtmlElement: mountQHtmlElement,
    unmountQHtmlElement: unmountQHtmlElement,
    getQDomForElement: getQDomForElement,
    updateQHtmlElement: updateQHtmlElement,
    toQHtmlSource: toQHtmlSource,
    createQSignalEvent: createQSignalEvent,
    emitQSignal: emitQSignal,
    hydrateComponentElement: hydrateComponentElement,
    setDomMutationObserversEnabled: setDomMutationSyncEnabled,
    getDomMutationObserversEnabled: function getDomMutationObserversEnabled() {
      return domMutationSyncEnabled;
    },
    isDomMutationObserversActive: isDomMutationSyncGloballyEnabled,
    initAll: initAll,
    startAutoMountObserver: startAutoMountObserver,
    stopAutoMountObserver: stopAutoMountObserver,
  };

  modules.qhtmlRuntime = runtimeApi;
  installGlobalDomMutationSyncToggle();
  global.QHtml = runtimeApi;

  if (global.document && global.document.readyState === "loading") {
    global.document.addEventListener("DOMContentLoaded", function onReady() {
      runtimeApi.initAll(global.document);
    });
  } else if (global.document) {
    runtimeApi.initAll(global.document);
  }
})(typeof globalThis !== "undefined" ? globalThis : window);

/*** END: modules/qhtml-runtime/src/qhtml-runtime.js ***/

/*** BEGIN: src/root-integration.js ***/
(function attachRootIntegration(global) {
  const modules = global.QHtmlModules || (global.QHtmlModules = {});
  const runtime = modules.qhtmlRuntime;

  if (!runtime) {
    return;
  }

  const api = runtime;
  api.version = "0.1.0";

  api.parseQHtml = function parseQHtml(source) {
    return modules.qhtmlParser.parseQHtmlToQDom(source || "");
  };

  api.parseQScript = function parseQScript(source) {
    return modules.qhtmlParser.parseQScript(source || "");
  };

  api.serializeQDom = function serializeQDom(qdomDocument) {
    return modules.qdomCore.serializeQDomCompressed(qdomDocument);
  };

  api.deserializeQDom = function deserializeQDom(payload) {
    return modules.qdomCore.deserializeQDomCompressed(payload);
  };

  api.renderInto = function renderInto(qdomDocument, hostElement) {
    return modules.domRenderer.renderIntoElement(qdomDocument, hostElement);
  };

  global.QHtml = api;
})(typeof globalThis !== "undefined" ? globalThis : window);


/*** END: src/root-integration.js ***/

