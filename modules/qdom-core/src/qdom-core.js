(function attachQDomCore(global) {
  const modules = global.QHtmlModules || (global.QHtmlModules = {});

  const NODE_TYPES = Object.freeze({
    document: "document",
    element: "element",
    text: "text",
    rawHtml: "raw-html",
    model: "model",
    repeater: "repeater",
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
  const QDOM_UUID_KEY = "uuid";
  let qdomHostIdCounter = 0;
  let qdomUuidCounter = 0;

  function normalizeQDomUuid(value) {
    if (typeof value !== "string") {
      return "";
    }
    const trimmed = value.trim();
    return trimmed || "";
  }

  function createFallbackQDomUuid() {
    qdomUuidCounter += 1;
    const timePart = Date.now().toString(36);
    const randomPart = Math.floor(Math.random() * 0xffffffff)
      .toString(16)
      .padStart(8, "0");
    return "qdom-" + timePart + "-" + randomPart + "-" + qdomUuidCounter.toString(36);
  }

  function createQDomUuid() {
    const cryptoObj = global && global.crypto;
    if (cryptoObj && typeof cryptoObj.randomUUID === "function") {
      try {
        const generated = cryptoObj.randomUUID();
        const normalized = normalizeQDomUuid(generated);
        if (normalized) {
          return normalized;
        }
      } catch (error) {
        // fallback path below
      }
    }
    return createFallbackQDomUuid();
  }

  function ensureNodeUuid(node) {
    if (!node || typeof node !== "object") {
      return "";
    }
    if (!node.meta || typeof node.meta !== "object") {
      node.meta = {};
    }
    const existing = normalizeQDomUuid(node.meta[QDOM_UUID_KEY]);
    if (existing) {
      node.meta[QDOM_UUID_KEY] = existing;
      return existing;
    }
    const generated = createQDomUuid();
    node.meta[QDOM_UUID_KEY] = generated;
    return generated;
  }

  function getNodeUuid(node) {
    if (!node || typeof node !== "object" || !node.meta || typeof node.meta !== "object") {
      return "";
    }
    return normalizeQDomUuid(node.meta[QDOM_UUID_KEY]);
  }

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

  class QDomModel extends QDomNode {
    constructor(options) {
      const opts = options || {};
      super(NODE_TYPES.model, opts.meta);
      this.entries = Array.isArray(opts.entries) ? opts.entries : [];
      this.source = typeof opts.source === "string" ? opts.source : "";
    }
  }

  class QRepeaterNode extends QDomNode {
    constructor(options) {
      const opts = options || {};
      super(NODE_TYPES.repeater, opts.meta);
      this.repeaterId = String(opts.repeaterId || "").trim();
      this.keyword = String(opts.keyword || "q-repeater").trim().toLowerCase() || "q-repeater";
      this.slotName = String(opts.slotName || "item").trim() || "item";
      const modelNode =
        opts.model && typeof opts.model === "object" && opts.model.kind === NODE_TYPES.model
          ? opts.model
          : new QDomModel({
              entries: Array.isArray(opts.modelEntries) ? opts.modelEntries : [],
              source: typeof opts.modelSource === "string" ? opts.modelSource : "",
            });
      this.model = modelNode;
      this.modelEntries = Array.isArray(modelNode.entries) ? modelNode.entries : [];
      this.templateNodes = Array.isArray(opts.templateNodes) ? opts.templateNodes : [];
    }
  }

  class QComponentNode extends QDomNode {
    constructor(options) {
      const opts = options || {};
      super(NODE_TYPES.component, opts.meta);
      this.componentId = String(opts.componentId || "").trim();
      const inheritedList = [];
      const rawInheritedList = Array.isArray(opts.extendsComponentIds) ? opts.extendsComponentIds : [];
      for (let i = 0; i < rawInheritedList.length; i += 1) {
        const inheritedId = String(rawInheritedList[i] || "").trim();
        if (!inheritedId) {
          continue;
        }
        inheritedList.push(inheritedId);
      }
      if (inheritedList.length === 0) {
        const legacyInheritedId = String(opts.extendsComponentId || "").trim();
        if (legacyInheritedId) {
          inheritedList.push(legacyInheritedId);
        }
      }
      this.extendsComponentIds = inheritedList;
      this.extendsComponentId = inheritedList.length > 0 ? inheritedList[0] : "";
      this.definitionType = String(opts.definitionType || "component").trim().toLowerCase() || "component";
      this.templateNodes = Array.isArray(opts.templateNodes) ? opts.templateNodes : [];
      this.propertyDefinitions = Array.isArray(opts.propertyDefinitions) ? opts.propertyDefinitions : [];
      this.methods = Array.isArray(opts.methods) ? opts.methods : [];
      this.signalDeclarations = Array.isArray(opts.signalDeclarations) ? opts.signalDeclarations : [];
      this.callbackDeclarations = Array.isArray(opts.callbackDeclarations) ? opts.callbackDeclarations : [];
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

    properties() {
      return Object.assign({}, this.props || {});
    }

    getProperty(key) {
      const name = String(key || "").trim();
      if (!name || !this.props || typeof this.props !== "object") {
        return undefined;
      }
      return Object.prototype.hasOwnProperty.call(this.props, name) ? this.props[name] : undefined;
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
    const meta = Object.assign(
      {
        dirty: false,
        originalSource: null,
        sourceRange: null,
      },
      overrides || {}
    );
    const existingUuid = normalizeQDomUuid(meta[QDOM_UUID_KEY]);
    meta[QDOM_UUID_KEY] = existingUuid || createQDomUuid();
    return meta;
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
    return new QDocumentNode(opts);
  }

  function createElementNode(options) {
    const opts = options || {};
    return new QElementNode(opts);
  }

  function createTextNode(options) {
    const opts = options || {};
    return new QTextNode(opts);
  }

  function createRawHtmlNode(options) {
    const opts = options || {};
    return new QRawHtmlNode(opts);
  }

  function createModelNode(options) {
    const opts = options || {};
    return new QDomModel(opts);
  }

  function createRepeaterNode(options) {
    const opts = options || {};
    return new QRepeaterNode(opts);
  }

  function createComponentNode(options) {
    const opts = options || {};
    return new QComponentNode(opts);
  }

  function createSlotNode(options) {
    const opts = options || {};
    return new QSlotNode(opts);
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
    return kind === NODE_TYPES.templateInstance
      ? new QTemplateInstanceNode(opts)
      : new QComponentInstanceNode(opts);
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
    return new QScriptRuleNode(opts);
  }

  function createQColorNode(options) {
    return new QColorNode(options || {});
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
      if (node.kind === NODE_TYPES.model && Array.isArray(node.entries)) {
        for (let j = 0; j < node.entries.length; j += 1) {
          const entry = node.entries[j];
          if (!entry || typeof entry !== "object" || !Array.isArray(entry.nodes)) {
            continue;
          }
          walkNodes(entry.nodes, visitor, node, path.concat("entries", j, "nodes"));
        }
      }
      if (node.kind === NODE_TYPES.repeater) {
        if (node.model && node.model.kind === NODE_TYPES.model) {
          walkNodes([node.model], visitor, node, path.concat("model"));
        }
        if (Array.isArray(node.templateNodes)) {
          walkNodes(node.templateNodes, visitor, node, path.concat("templateNodes"));
        }
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

  function createQDomSerializationReplacer() {
    const seen = typeof WeakSet === "function" ? new WeakSet() : null;
    return function qdomSerializationReplacer(key, value) {
      if (typeof value === "function") {
        return undefined;
      }
      if (!value || typeof value !== "object") {
        return value;
      }
      const keyText = String(key || "");
      if (keyText && (keyText.indexOf("__qhtml") === 0 || keyText.indexOf("__QHTML") === 0)) {
        return undefined;
      }
      if (typeof value.nodeType === "number") {
        return undefined;
      }
      if (
        typeof value.dispatchEvent === "function" &&
        typeof value.addEventListener === "function"
      ) {
        return undefined;
      }
      if (seen) {
        if (seen.has(value)) {
          return undefined;
        }
        seen.add(value);
      }
      return value;
    };
  }

  function serializeQDomCompressed(documentNode) {
    const text = JSON.stringify(documentNode, createQDomSerializationReplacer());
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
    if (kind === NODE_TYPES.model) {
      return createModelNode({
        entries: reviveQDomTree(Array.isArray(value.entries) ? value.entries : []),
        source: typeof value.source === "string" ? value.source : "",
        meta: reviveQDomTree(value.meta || {}),
      });
    }
    if (kind === NODE_TYPES.repeater) {
      return createRepeaterNode({
        repeaterId: value.repeaterId,
        keyword: value.keyword,
        slotName: value.slotName,
        model: reviveQDomTree(
          value.model && typeof value.model === "object"
            ? value.model
            : {
                kind: NODE_TYPES.model,
                entries: Array.isArray(value.modelEntries) ? value.modelEntries : [],
                source: typeof value.modelSource === "string" ? value.modelSource : "",
              }
        ),
        modelEntries: reviveQDomTree(Array.isArray(value.modelEntries) ? value.modelEntries : []),
        modelSource: typeof value.modelSource === "string" ? value.modelSource : "",
        templateNodes: reviveQDomTree(Array.isArray(value.templateNodes) ? value.templateNodes : []),
        meta: reviveQDomTree(value.meta || {}),
      });
    }
    if (kind === NODE_TYPES.component) {
      return createComponentNode({
        componentId: value.componentId,
        extendsComponentIds: reviveQDomTree(Array.isArray(value.extendsComponentIds) ? value.extendsComponentIds : []),
        extendsComponentId: value.extendsComponentId,
        definitionType: value.definitionType,
        templateNodes: reviveQDomTree(Array.isArray(value.templateNodes) ? value.templateNodes : []),
        propertyDefinitions: reviveQDomTree(Array.isArray(value.propertyDefinitions) ? value.propertyDefinitions : []),
        methods: reviveQDomTree(Array.isArray(value.methods) ? value.methods : []),
        signalDeclarations: reviveQDomTree(Array.isArray(value.signalDeclarations) ? value.signalDeclarations : []),
        callbackDeclarations: reviveQDomTree(Array.isArray(value.callbackDeclarations) ? value.callbackDeclarations : []),
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
    let suppressDepth = 0;
    const qdomMethodKinds = new Set([
      NODE_TYPES.document,
      NODE_TYPES.componentInstance,
      NODE_TYPES.templateInstance,
      NODE_TYPES.slot,
    ]);

    function withMutationsSuppressed(run) {
      if (typeof run !== "function") {
        return undefined;
      }
      suppressDepth += 1;
      try {
        return run();
      } finally {
        suppressDepth = Math.max(0, suppressDepth - 1);
      }
    }

    function isDomLikeObject(value) {
      if (!value || typeof value !== "object") {
        return false;
      }
      if (typeof value.nodeType === "number") {
        return true;
      }
      if (value === global || value === (global && global.document)) {
        return true;
      }
      const tag = Object.prototype.toString.call(value);
      return tag === "[object Window]" || tag === "[object HTMLDocument]" || tag === "[object Document]";
    }

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
          if (prop === "__qhtmlSourceNode") {
            return obj;
          }
          if (prop === "qdom") {
            const kind = obj && typeof obj.kind === "string" ? obj.kind : "";
            if (qdomMethodKinds.has(kind)) {
              return function qdomSubtree() {
                return proxify(obj, localPath);
              };
            }
          }
          const value = Reflect.get(obj, prop, obj);
          if (typeof value === "function" && isDomLikeObject(obj)) {
            return value.bind(obj);
          }
          if (typeof prop === "symbol") {
            return value;
          }
          return proxify(value, localPath.concat(String(prop)));
        },
        set(obj, prop, value, receiver) {
          const previousValue = obj[prop];
          const didSet = Reflect.set(obj, prop, value, receiver);
          if (!didSet || !active || suppressDepth > 0) {
            return didSet;
          }

          if (previousValue !== value) {
            const mutationPath = localPath.concat(String(prop));
            markDirty(obj);
            markDirty(documentNode);
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
          if (didDelete && active && suppressDepth <= 0) {
            const mutationPath = localPath.concat(String(prop));
            markDirty(obj);
            markDirty(documentNode);
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
      withMutationsSuppressed: withMutationsSuppressed,
    };
  }

  const api = {
    QDomNode: QDomNode,
    QDocumentNode: QDocumentNode,
    QElementNode: QElementNode,
    QTextNode: QTextNode,
    QRawHtmlNode: QRawHtmlNode,
    QDomModel: QDomModel,
    QRepeaterNode: QRepeaterNode,
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
    createModelNode: createModelNode,
    createRepeaterNode: createRepeaterNode,
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
    QDOM_UUID_KEY: QDOM_UUID_KEY,
    createQDomUuid: createQDomUuid,
    ensureNodeUuid: ensureNodeUuid,
    getNodeUuid: getNodeUuid,
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
