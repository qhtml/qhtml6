/* qhtml.js release bundle */
/* generated: 2026-02-27T00:55:49Z */

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
  });

  const TEXT_ALIASES = new Set(["content", "contents", "text", "textcontents", "innertext"]);
  const QDOM_HOST_ID_ATTR = "data-qdom-host-id";
  const QDOM_TEMPLATE_OWNER_ATTR = "data-qdom-for";
  let qdomHostIdCounter = 0;

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

  function createDocument(options) {
    const opts = options || {};
    return {
      kind: NODE_TYPES.document,
      version: 1,
      nodes: Array.isArray(opts.nodes) ? opts.nodes : [],
      scripts: Array.isArray(opts.scripts) ? opts.scripts : [],
      meta: Object.assign(
        {
          source: typeof opts.source === "string" ? opts.source : "",
          dirty: false,
        },
        opts.meta || {}
      ),
    };
  }

  function createElementNode(options) {
    const opts = options || {};
    return {
      kind: NODE_TYPES.element,
      tagName: String(opts.tagName || "div").toLowerCase(),
      attributes: Object.assign({}, opts.attributes || {}),
      children: Array.isArray(opts.children) ? opts.children : [],
      textContent: typeof opts.textContent === "string" ? opts.textContent : null,
      selectorMode: opts.selectorMode || "single",
      selectorChain: Array.isArray(opts.selectorChain) ? opts.selectorChain.slice() : [String(opts.tagName || "div").toLowerCase()],
      meta: createNodeMeta(opts.meta),
    };
  }

  function createTextNode(options) {
    const opts = options || {};
    return {
      kind: NODE_TYPES.text,
      value: typeof opts.value === "string" ? opts.value : "",
      meta: createNodeMeta(opts.meta),
    };
  }

  function createRawHtmlNode(options) {
    const opts = options || {};
    return {
      kind: NODE_TYPES.rawHtml,
      html: typeof opts.html === "string" ? opts.html : "",
      meta: createNodeMeta(opts.meta),
    };
  }

  function createComponentNode(options) {
    const opts = options || {};
    return {
      kind: NODE_TYPES.component,
      componentId: String(opts.componentId || "").trim(),
      definitionType: String(opts.definitionType || "component").trim().toLowerCase() || "component",
      templateNodes: Array.isArray(opts.templateNodes) ? opts.templateNodes : [],
      methods: Array.isArray(opts.methods) ? opts.methods : [],
      lifecycleScripts: Array.isArray(opts.lifecycleScripts) ? opts.lifecycleScripts : [],
      attributes: Object.assign({}, opts.attributes || {}),
      meta: createNodeMeta(opts.meta),
    };
  }

  function createSlotNode(options) {
    const opts = options || {};
    return {
      kind: NODE_TYPES.slot,
      name: String(opts.name || "default").trim() || "default",
      children: Array.isArray(opts.children) ? opts.children : [],
      meta: createNodeMeta(opts.meta),
    };
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
    const tag = String(opts.tagName || opts.componentId || "div").trim().toLowerCase();
    return {
      kind: normalizeInstanceKind(opts.kind),
      componentId: String(opts.componentId || tag).trim().toLowerCase(),
      tagName: tag,
      attributes: Object.assign({}, opts.attributes || {}),
      slots: Array.isArray(opts.slots) ? opts.slots : [],
      children: Array.isArray(opts.children) ? opts.children : [],
      textContent: typeof opts.textContent === "string" ? opts.textContent : null,
      selectorMode: opts.selectorMode || "single",
      selectorChain: Array.isArray(opts.selectorChain) ? opts.selectorChain.slice() : [tag],
      meta: createNodeMeta(opts.meta),
    };
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
    return {
      kind: NODE_TYPES.scriptRule,
      selector: String(opts.selector || ""),
      eventName: String(opts.eventName || ""),
      body: typeof opts.body === "string" ? opts.body : "",
      meta: createNodeMeta(opts.meta),
    };
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
    return JSON.parse(text);
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
            markDirty(obj);
            markDirty(documentNode);
            callback({
              type: "set",
              path: localPath.concat(String(prop)),
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
            markDirty(obj);
            markDirty(documentNode);
            callback({
              type: "delete",
              path: localPath.concat(String(prop)),
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
    isNode: isNode,
    walkQDom: walkQDom,
    cloneDocument: cloneDocument,
    ensureStringArray: ensureStringArray,
    mergeClasses: mergeClasses,
    observeQDom: observeQDom,
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

  function ParseError(message, index) {
    const error = new Error(message + " (at index " + index + ")");
    error.name = "QHtmlParseError";
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

  function parseValue(parser) {
    skipWhitespace(parser);
    const ch = peek(parser);
    if (ch === '"' || ch === "'") {
      return parseQuotedString(parser);
    }
    return parseBareValue(parser);
  }

  function parseSelectorList(parser, firstSelector) {
    const selectors = [firstSelector || parseIdentifier(parser)];
    skipWhitespace(parser);
    while (peek(parser) === ",") {
      consume(parser);
      skipWhitespace(parser);
      selectors.push(parseIdentifier(parser));
      skipWhitespace(parser);
    }
    return selectors;
  }

  function readBalancedBlockContent(parser) {
    const start = parser.index;
    let depth = 1;
    let quote = "";
    let escaped = false;

    while (!eof(parser)) {
      const ch = consume(parser);

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
          return parser.source.slice(start, parser.index - 1);
        }
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

  function parseBlockItems(parser) {
    const items = [];

    while (!eof(parser)) {
      skipWhitespaceAndSemicolons(parser);
      if (peek(parser) === "}") {
        break;
      }

      const itemStart = parser.index;
      const name = parseIdentifier(parser);
      const afterName = parser.index;
      skipWhitespace(parser);

      const nextChar = peek(parser);
      if (nextChar === ":") {
        consume(parser);
        const value = parseValue(parser);
        items.push({
          type: "Property",
          name: name,
          value: value,
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
        const childItems = parseBlockItems(parser);
        expect(parser, "}");
        items.push({
          type: "Element",
          selectors: selectors,
          prefixDirectives: prefixDirectives,
          items: childItems,
          start: itemStart,
          end: parser.index,
          raw: parser.source.slice(itemStart, parser.index),
        });
        continue;
      }

      if (nextChar === "{") {
        const lowerName = name.toLowerCase();

        if (lowerName === "html") {
          consume(parser);
          const rawHtml = readBalancedBlockContent(parser);
          items.push({
            type: "HtmlBlock",
            html: rawHtml,
            start: itemStart,
            end: parser.index,
            raw: parser.source.slice(itemStart, parser.index),
          });
          continue;
        }

        if (TEXT_BLOCK_KEYWORDS.has(lowerName)) {
          consume(parser);
          const textBody = readBalancedBlockContent(parser);
          items.push({
            type: "TextBlock",
            text: textBody,
            start: itemStart,
            end: parser.index,
            raw: parser.source.slice(itemStart, parser.index),
          });
          continue;
        }

        if (lowerName === "style") {
          consume(parser);
          const styleBody = readBalancedBlockContent(parser);
          items.push({
            type: "StyleBlock",
            css: styleBody,
            start: itemStart,
            end: parser.index,
            raw: parser.source.slice(itemStart, parser.index),
          });
          continue;
        }

        if (lowerName === "q-script") {
          consume(parser);
          const scriptBody = readBalancedBlockContent(parser);
          items.push({
            type: "QScriptInline",
            script: scriptBody,
            start: itemStart,
            end: parser.index,
            raw: parser.source.slice(itemStart, parser.index),
          });
          continue;
        }

        if (lowerName === "q-import") {
          consume(parser);
          const importBody = readBalancedBlockContent(parser);
          items.push({
            type: "ImportBlock",
            path: String(importBody || "").trim(),
            start: itemStart,
            end: parser.index,
            raw: parser.source.slice(itemStart, parser.index),
          });
          continue;
        }

        if (isEventBlockName(name)) {
          consume(parser);
          const scriptBody = readBalancedBlockContent(parser);
          items.push({
            type: "EventBlock",
            name: name,
            script: scriptBody,
            isLifecycle: LIFECYCLE_BLOCKS.has(lowerName),
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
        const childItems = parseBlockItems(parser);
        expect(parser, "}");

        items.push({
          type: "Element",
          selectors: [name],
          prefixDirectives: prefixDirectives,
          items: childItems,
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
        start: itemStart,
        end: parser.index,
        raw: parser.source.slice(itemStart, parser.index),
      });
    }

    return items;
  }

  function parseQHtmlToAst(source) {
    const parser = parserFor(source);
    const body = [];

    while (!eof(parser)) {
      skipWhitespaceAndSemicolons(parser);
      if (eof(parser)) {
        break;
      }

      const start = parser.index;
      const firstSelector = parseIdentifier(parser);
      const firstLower = firstSelector.toLowerCase();
      skipWhitespace(parser);

      if (LIFECYCLE_BLOCKS.has(firstLower) && peek(parser) === "{") {
        consume(parser);
        const scriptBody = readBalancedBlockContent(parser);
        body.push({
          type: "LifecycleBlock",
          name: firstSelector,
          script: scriptBody,
          isLifecycle: true,
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
        const items = parseBlockItems(parser);
        expect(parser, "}");
        body.push({
          type: "TemplateDefinition",
          templateId: templateId,
          items: items,
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
        const items = parseBlockItems(parser);
        expect(parser, "}");

        body.push({
          type: "ComponentDefinition",
          componentIdExpression: componentIdExpression,
          items: items,
          start: start,
          end: parser.index,
          raw: parser.source.slice(start, parser.index),
        });
        continue;
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
          start: start,
          end: parser.index,
          raw: parser.source.slice(start, parser.index),
        });
        continue;
      }

      const items = parseBlockItems(parser);
      expect(parser, "}");
      body.push({
        type: "Element",
        selectors: selectors,
        prefixDirectives: prefixDirectives,
        items: items,
        start: start,
        end: parser.index,
        raw: parser.source.slice(start, parser.index),
      });
    }

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

  function findStandaloneQScriptKeyword(source, fromIndex) {
    const input = String(source || "");
    const token = "q-script";
    let pos = Math.max(0, Number(fromIndex) || 0);
    while (pos < input.length) {
      const idx = input.indexOf(token, pos);
      if (idx === -1) {
        return -1;
      }
      const before = idx > 0 ? input[idx - 1] : "";
      const after = input[idx + token.length] || "";
      if (isQScriptIdentifierChar(before) || isQScriptIdentifierChar(after)) {
        pos = idx + token.length;
        continue;
      }
      return idx;
    }
    return -1;
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

  function findNextQRewriteDefinition(source, fromIndex) {
    const input = String(source || "");
    let pos = Math.max(0, Number(fromIndex) || 0);

    while (pos < input.length) {
      const token = findNextIdentifierTokenSkippingLiterals(input, pos);
      if (!token) {
        return null;
      }
      pos = token.end;
      if (String(token.name || "").toLowerCase() !== "q-rewrite") {
        continue;
      }

      let nameStart = skipWhitespaceInSource(input, token.end);
      if (!isQRewriteIdentifierStart(input[nameStart])) {
        throw new Error("Expected q-rewrite identifier after 'q-rewrite'.");
      }
      let nameEnd = nameStart + 1;
      while (nameEnd < input.length && isQRewriteIdentifierChar(input[nameEnd])) {
        nameEnd += 1;
      }
      const name = input.slice(nameStart, nameEnd);

      const open = skipWhitespaceInSource(input, nameEnd);
      if (input[open] !== "{") {
        throw new Error("Expected '{' after q-rewrite id '" + name + "'.");
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
    const qdomFacade = {
      slot: function slot(name) {
        const key = normalizeQRewriteSlotName(name);
        if (Object.prototype.hasOwnProperty.call(values, key)) {
          return String(values[key] || "");
        }
        if (Object.prototype.hasOwnProperty.call(values, "default")) {
          return String(values.default || "");
        }
        return "";
      },
    };
    return {
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
    const hasReturnBody = typeof definition.returnBody === "string" && definition.returnBody.trim().length > 0;

    if (hasReturnBody) {
      const thisArg = createQRewriteExecutionContext(slotValues);
      return evaluateQScriptBlocks(definition.returnBody, {
        maxPasses: opts.maxQScriptPasses,
        executor: function runQRewriteQScript(body) {
          return executeQScriptReplacement(body, thisArg);
        },
      });
    }

    const template = String(definition.templateBody || "");
    if (!template) {
      return slots.length === 1 ? String(slotValues[slots[0]] || "") : String(invocationBody || "");
    }
    return applyQRewriteSlotsToTemplate(template, slotValues);
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

  function collectQRewriteDefinitions(source) {
    let working = String(source || "");
    const definitions = Object.create(null);
    let pos = 0;

    while (true) {
      const found = findNextQRewriteDefinition(working, pos);
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
    const collected = collectQRewriteDefinitions(source);
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

  function executeQScriptReplacement(scriptBody, thisArg) {
    const fn = new Function(String(scriptBody || ""));
    const out = fn.call(thisArg || {});
    if (out == null) {
      return "";
    }
    return String(out);
  }

  function evaluateQScriptBlocks(source, options) {
    let out = String(source || "");
    const opts = options || {};
    const maxPasses = Number(opts.maxPasses) > 0 ? Number(opts.maxPasses) : 200;
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
        const start = findStandaloneQScriptKeyword(out, pos);
        if (start === -1) {
          break;
        }

        let open = start + 8;
        while (open < out.length && /\s/.test(out[open])) {
          open += 1;
        }
        if (out[open] !== "{") {
          pos = start + 8;
          continue;
        }

        const close = findMatchingBraceWithLiterals(out, open);
        if (close === -1) {
          throw new Error("Unterminated q-script block.");
        }

        const body = out.slice(open + 1, close);
        let replacement = executor(body, {
          source: out,
          start: start,
          open: open,
          close: close,
        });
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

  function applyPropertyToElement(elementNode, prop) {
    const key = normalizePropertyName(prop.name);
    if (core.TEXT_ALIASES.has(key)) {
      appendTextChildNode(elementNode, prop.value, {
        originalSource: prop.raw || null,
        sourceRange:
          typeof prop.start === "number" && typeof prop.end === "number"
            ? [prop.start, prop.end]
            : null,
      });
      return;
    }
    elementNode.attributes[prop.name] = prop.value;
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
    const definitionType =
      String(definitionNode && definitionNode.definitionType ? definitionNode.definitionType : "component")
        .trim()
        .toLowerCase() === "template"
        ? "template"
        : "component";
    const slotFills = splitInvocationSlotFills(elementNode, definitionNode);
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
      attributes: Object.assign({}, elementNode.attributes || {}),
      slots: slots,
      children: Array.isArray(elementNode.children) ? elementNode.children : [],
      textContent: typeof elementNode.textContent === "string" ? elementNode.textContent : null,
      selectorMode: elementNode.selectorMode || "single",
      selectorChain: Array.isArray(elementNode.selectorChain)
        ? elementNode.selectorChain.slice()
        : [String(elementNode.tagName || definitionNode.componentId || "div").trim().toLowerCase()],
      meta: Object.assign({}, elementNode.meta || {}),
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

  function processElementItems(targetElement, astItems, source) {
    for (let i = 0; i < astItems.length; i += 1) {
      const item = astItems[i];
      if (item.type === "Property") {
        applyPropertyToElement(targetElement, item);
      } else if (item.type === "HtmlBlock") {
        targetElement.children.push(core.createRawHtmlNode({ html: item.html, meta: { originalSource: item.raw } }));
      } else if (item.type === "TextBlock") {
        appendTextChildNode(targetElement, item.text, {
          originalSource: item.raw || null,
          sourceRange:
            typeof item.start === "number" && typeof item.end === "number"
              ? [item.start, item.end]
              : null,
        });
      } else if (item.type === "StyleBlock") {
        mergeStyleAttribute(targetElement, item.css);
      } else if (item.type === "RawTextLine") {
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
            const nested = convertAstItemToNode(nestedAst.body[j], resolved);
            if (nested) {
              targetElement.children.push(nested);
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
        const childNode = convertAstItemToNode(item, source);
        if (childNode) {
          targetElement.children.push(childNode);
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

  function buildComponentNodeFromAst(astNode, source, options) {
    const opts = options || {};
    const componentAttributes = {};
    const templateNodes = [];
    const methods = [];
    const lifecycleScripts = [];
    const definitionType = String(opts.definitionType || "component").trim().toLowerCase() || "component";
    let componentId = String(opts.componentId || "").trim();

    const items = Array.isArray(astNode.items) ? astNode.items : [];
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (item.type === "Property") {
        const key = normalizePropertyName(item.name);
        if (key === "id") {
          componentId = String(item.value || componentId || "").trim();
        } else {
          componentAttributes[item.name] = item.value;
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
      if (item.type === "EventBlock" && item.isLifecycle) {
        if (definitionType === "component") {
          lifecycleScripts.push({
            name: String(item.name || "").trim(),
            body: compactScriptBody(item.script || ""),
          });
        }
        continue;
      }
      const node = convertAstItemToNode(item, source);
      if (node) {
        templateNodes.push(node);
      }
    }

    return core.createComponentNode({
      componentId: componentId,
      definitionType: definitionType,
      templateNodes: templateNodes,
      methods: methods,
      lifecycleScripts: lifecycleScripts,
      attributes: componentAttributes,
      meta: {
        originalSource: astNode.raw,
        sourceRange: [astNode.start, astNode.end],
      },
    });
  }

  function buildElementFromAst(astElement, source) {
    const selectors = astElement.selectors.map((entry) => String(entry).trim()).filter(Boolean);
    const prefixDirectives = Array.isArray(astElement.prefixDirectives) ? astElement.prefixDirectives.slice() : [];
    if (selectors.length === 0) {
      throw new Error("Element with empty selector list cannot be converted.");
    }

    if (selectors.length === 1 && selectors[0].toLowerCase() === "q-component") {
      return buildComponentNodeFromAst(astElement, source, {
        definitionType: "component",
      });
    }

    const selectorTokens = selectors.map(parseTagToken);
    const selectorMode = detectSelectorMode(selectorTokens);

    if (selectorMode === "class-shorthand") {
      const last = selectorTokens[selectorTokens.length - 1];
      const leaf = createElementFromToken(
        last,
        "class-shorthand",
        selectors,
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
      processElementItems(leaf, astElement.items, source);
      return leaf;
    }

    const chain = selectorTokens.map(function build(token, index) {
      return createElementFromToken(
        token,
        index === 0 && selectorTokens.length > 1 ? "nest" : "single",
        index === 0 ? selectors : [selectors[index]],
        index === 0 ? [astElement.start, astElement.end] : null,
        index === 0 ? astElement.raw : null
      );
    });

    for (let i = 0; i < chain.length - 1; i += 1) {
      chain[i].children.push(chain[i + 1]);
    }

    const leaf = chain[chain.length - 1];
    if (prefixDirectives.length > 0) {
      leaf.slotDirectives = prefixDirectives;
    }
    processElementItems(leaf, astElement.items, source);

    return chain[0];
  }

  function convertAstItemToNode(item, source) {
    if (!item || typeof item !== "object") {
      return null;
    }

    if (item.type === "Element") {
      return buildElementFromAst(item, source);
    }

    if (item.type === "TemplateDefinition") {
      return buildComponentNodeFromAst(item, source, {
        componentId: item.templateId,
        definitionType: "template",
      });
    }

    if (item.type === "ComponentDefinition") {
      const componentId = resolveComponentIdExpression(item.componentIdExpression, "");
      return buildComponentNodeFromAst(item, source, {
        componentId: componentId,
        definitionType: "component",
      });
    }

    if (item.type === "HtmlBlock") {
      return core.createRawHtmlNode({
        html: item.html,
        meta: {
          originalSource: item.raw,
          sourceRange: [item.start, item.end],
        },
      });
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
      return styleElement;
    }

    if (item.type === "TextBlock" || item.type === "RawTextLine" || item.type === "BareWord") {
      return createTextContentNode(item.type === "TextBlock" ? String(item.text || "") : String(item.text || item.name || ""), {
        originalSource: item.raw || null,
        sourceRange:
          typeof item.start === "number" && typeof item.end === "number"
            ? [item.start, item.end]
            : null,
      });
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
    const rewriteResult = applyQRewriteBlocks(effectiveSource, {
      maxPasses: opts.maxQRewritePasses,
      maxQScriptPasses: opts.maxQScriptPasses,
    });
    const rewrittenSource = rewriteResult.source;
    const evaluatedSource = evaluateQScriptBlocks(rewrittenSource, {
      maxPasses: opts.maxQScriptPasses,
    });
    const ast = parseQHtmlToAst(evaluatedSource);
    const doc = core.createDocument({ source: rawSource });

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
      const node = convertAstItemToNode(item, evaluatedSource);
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
      const definitionType = String(node.definitionType || "").trim().toLowerCase() === "template" ? "template" : "component";
      const keyword = definitionType === "template" ? "q-template" : "q-component";
      const definitionId = String(node.componentId || "").trim();
      const lines = [indent + (definitionId ? keyword + " " + definitionId + " {" : keyword + " {")];
      const attrs = node.attributes || {};
      const attrKeys = Object.keys(attrs);
      for (let i = 0; i < attrKeys.length; i += 1) {
        const key = attrKeys[i];
        lines.push(indent + "  " + key + ": \"" + escapeQuoted(attrs[key]) + "\"");
      }
      if (definitionType === "component" && Array.isArray(node.methods)) {
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
      const attrKeys = Object.keys(attrs);
      for (let i = 0; i < attrKeys.length; i += 1) {
        const key = attrKeys[i];
        lines.push(indent + "  " + key + ": \"" + escapeQuoted(attrs[key]) + "\"");
      }

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

      lines.push(indent + "}");
      return lines.join("\n");
    }

    if (node.kind !== core.NODE_TYPES.element) {
      return "";
    }

    const chain = Array.isArray(node.selectorChain) && node.selectorChain.length > 0 ? node.selectorChain : [node.tagName];
    const selectorText = node.selectorMode === "class-shorthand" ? chain.join(",") : chain[0];

    const lines = [indent + selectorText + " {"];

    if (typeof node.textContent === "string") {
      lines.push(indent + "  content: \"" + escapeQuoted(node.textContent) + "\"");
    }

    const attrs = node.attributes || {};
    const attrKeys = Object.keys(attrs);
    for (let i = 0; i < attrKeys.length; i += 1) {
      const key = attrKeys[i];
      lines.push(indent + "  " + key + ": \"" + escapeQuoted(attrs[key]) + "\"");
    }

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
  let qdomInstanceCounter = 0;
  const qdomInstanceIds = new WeakMap();
  const qdomSlotOwnerIds = new WeakMap();

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

  function inferDefinitionType(definitionNode) {
    if (!definitionNode || typeof definitionNode !== "object") {
      return "component";
    }

    const explicit = String(definitionNode.definitionType || "").trim().toLowerCase();
    if (explicit === "component" || explicit === "template") {
      return explicit;
    }

    const originalSource =
      definitionNode.meta && typeof definitionNode.meta.originalSource === "string"
        ? definitionNode.meta.originalSource.trim().toLowerCase()
        : "";
    if (originalSource.startsWith("q-template")) {
      return "template";
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

  function setElementAttributes(element, attrs) {
    if (!attrs || typeof attrs !== "object") {
      return;
    }
    const keys = Object.keys(attrs);
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      const value = attrs[key];
      if (value === null || typeof value === "undefined") {
        continue;
      }
      element.setAttribute(key, String(value));
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
      const fn = new Function("event", "document", hook.body);
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
    if (!runtimeManaged || alreadySignaled) {
      runLifecycleHookNow(hook, thisArg, doc || targetDocument, errorLabel);
      return;
    }

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

    if (!doc || typeof doc.addEventListener !== "function" || typeof doc.dispatchEvent !== "function") {
      execute();
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

    for (let i = 0; i < componentNode.lifecycleScripts.length; i += 1) {
      const hook = componentNode.lifecycleScripts[i];
      runLifecycleHookMaybeDeferred(hook, hostElement, targetDocument, "qhtml component lifecycle hook failed:");
    }
  }

  function bindComponentMethods(componentNode, hostElement) {
    if (!componentNode || !Array.isArray(componentNode.methods)) {
      return;
    }

    for (let i = 0; i < componentNode.methods.length; i += 1) {
      const method = componentNode.methods[i];
      const name = method && typeof method.name === "string" ? method.name.trim() : "";
      if (!name || INVALID_METHOD_NAMES.has(name)) {
        continue;
      }
      const params = method && typeof method.parameters === "string" ? method.parameters : "";
      const body = method && typeof method.body === "string" ? method.body : "";

      let compiled;
      try {
        compiled = new Function(params, body);
      } catch (error) {
        if (global.console && typeof global.console.error === "function") {
          global.console.error("qhtml component method compile failed:", name, error);
        }
        continue;
      }

      hostElement[name] = function componentMethodProxy() {
        return compiled.apply(hostElement, arguments);
      };
    }
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
        parent.appendChild(targetDocument.createTextNode(String(node.value || "")));
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
      setElementAttributes(element, node.attributes);
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
        element.appendChild(targetDocument.createTextNode(node.textContent));
      }

      if (Array.isArray(node.children)) {
        for (let i = 0; i < node.children.length; i += 1) {
          renderNode(node.children[i], element, targetDocument, context);
        }
      }
      runLifecycleHooks(node, element, targetDocument);
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

  function renderComponentHostInstance(componentNode, instanceNode, parent, targetDocument, context) {
    const stack = context.componentStack;
    const key = String(componentNode.componentId || instanceNode.tagName || "").toLowerCase();
    if (stack.indexOf(key) !== -1) {
      throw new Error("Recursive q-component usage detected for '" + key + "'.");
    }

    const hostTag = String(componentNode.componentId || instanceNode.tagName || "div").trim().toLowerCase();
    const hostElement = targetDocument.createElement(hostTag || "div");
    setElementAttributes(hostElement, instanceNode.attributes);
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

    runComponentLifecycleHooks(componentNode, hostElement, targetDocument);
  }

  function renderComponentInstance(componentNode, instanceNode, parent, targetDocument, context) {
    if (inferDefinitionType(componentNode) === "template") {
      renderComponentTemplateInstance(componentNode, instanceNode, parent, targetDocument, context);
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

    runComponentLifecycleHooks(componentNode, hostElement, doc);
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
    "scripts",
    "html",
  ]);
  const FORM_CONTROL_TAGS = new Set(["input", "textarea", "select"]);

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
    return state;
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
      const fn = new Function("event", "document", source);
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

    if (!doc || typeof doc.addEventListener !== "function" || typeof doc.dispatchEvent !== "function") {
      execute();
      return;
    }

    const handler = function onContentLoaded() {
      if (typeof doc.removeEventListener === "function") {
        doc.removeEventListener(QHTML_CONTENT_LOADED_EVENT, handler);
      }
      execute();
    };
    doc.addEventListener(QHTML_CONTENT_LOADED_EVENT, handler);
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
    if (explicit === "component" || explicit === "template") {
      return explicit;
    }
    const originalSource =
      definitionNode.meta && typeof definitionNode.meta.originalSource === "string"
        ? definitionNode.meta.originalSource.trim().toLowerCase()
        : "";
    if (originalSource.startsWith("q-template")) {
      return "template";
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
    if (internalMarker === "1" && externalMarker !== "1") {
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
      let executor;
      try {
        executor = new Function("event", "document", body);
      } catch (error) {
        throw new Error("Failed to compile q-script rule for selector '" + selector + "': " + error.message);
      }

      const targets = doc.querySelectorAll(selector);
      for (let j = 0; j < targets.length; j += 1) {
        const target = targets[j];
        const handler = function qScriptHandler(event) {
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
    if (tail.indexOf("methods") !== -1 || tail.indexOf("lifecycleScripts") !== -1 || tail.indexOf("scripts") !== -1) {
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
    if (!binding || binding.rendering) {
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

  function syncDomControlToQDom(binding, domElement) {
    if (!binding || !domElement || domElement.nodeType !== 1 || !isFormControlElement(domElement)) {
      return;
    }
    if (typeof domElement.qdom !== "function") {
      return;
    }

    let qdomNode;
    try {
      qdomNode = domElement.qdom();
    } catch (error) {
      return;
    }
    if (!qdomNode || typeof qdomNode !== "object") {
      return;
    }

    const tagName = String(domElement.tagName || "").trim().toLowerCase();
    const value = domElement.value == null ? "" : String(domElement.value);
    if (typeof qdomNode.setAttribute === "function") {
      qdomNode.setAttribute("value", value);
    } else {
      if (!qdomNode.attributes || typeof qdomNode.attributes !== "object") {
        qdomNode.attributes = {};
      }
      qdomNode.attributes.value = value;
    }

    if (tagName === "input") {
      const type = String(domElement.getAttribute("type") || domElement.type || "")
        .trim()
        .toLowerCase();
      if (type === "checkbox" || type === "radio") {
        if (domElement.checked) {
          if (typeof qdomNode.setAttribute === "function") {
            qdomNode.setAttribute("checked", "checked");
          } else {
            qdomNode.attributes.checked = "checked";
          }
        } else if (typeof qdomNode.removeAttribute === "function") {
          qdomNode.removeAttribute("checked");
        } else if (qdomNode.attributes && typeof qdomNode.attributes === "object") {
          delete qdomNode.attributes.checked;
        }
      }
    }
  }

  function attachDomControlSync(binding) {
    if (!binding || !binding.host || binding.domControlSyncAttached) {
      return;
    }
    const host = binding.host;
    const handler = function onControlMutation(event) {
      syncDomControlToQDom(binding, event && event.target ? event.target : null);
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

  function renderBinding(binding) {
    if (!binding || !binding.qdom) {
      return;
    }
    binding.rendering = true;
    registerDefinitionsFromDocument(binding.rawQdom || binding.qdom);
    binding.nodeMap = new WeakMap();
    binding.componentMap = new WeakMap();
    binding.slotMap = new WeakMap();
    binding.domByQdomNode = new WeakMap();
    try {
      renderer.renderIntoElement(binding.qdom, binding.host, binding.doc, {
        capture: {
          nodeMap: binding.nodeMap,
          componentMap: binding.componentMap,
          slotMap: binding.slotMap,
        },
      });
      hydrateRegisteredComponentHostsInNode(binding.doc, binding.doc);
      attachDomQDomAccessors(binding);
      attachDomControlSync(binding);
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
          if (declaredSlotNames.size === 0) {
            return result;
          }
          const children = ensureChildrenList(node);
          const expectedOwnerId =
            typeof ownerInstanceId === "string" && ownerInstanceId.trim()
              ? ownerInstanceId.trim()
              : readOwnerInstanceId(node);
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

            const lists = [current.nodes, current.templateNodes, current.children, current.slots];
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
      Object.defineProperty(node, "serialize", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: function serialize() {
          return core.serializeQDomCompressed(node);
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
      Object.defineProperty(node, "__qhtmlFactoriesInstalled", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: true,
      });

      return createNodeFacade(node);
    }

    host.qdom = function hostQdomAccessor() {
      return installQDomFactories(binding.qdom);
    };
    host.qhtml = host;
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
          return installQDomFactories(sourceNode);
        };
      }
      element.qhtml = host;

      const componentHost = binding.componentMap && binding.componentMap.get(element);
      setComponentContextAccessor(element, componentHost || resolveNearestComponentHost(element) || null);

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

    const source = qHtmlElement.textContent || "";
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
      domByQdomNode: new WeakMap(),
      listeners: [],
      hostLifecycleRan: false,
      readyHooksState: {},
      rendering: false,
      pendingMutations: [],
      mutationFlushScheduled: false,
      templateSaveTimer: null,
      domControlSyncAttached: false,
      domControlSyncHandler: null,
      disconnect: function noop() {},
      ready: null,
    };

    bindings.set(qHtmlElement, binding);
    binding.ready = Promise.resolve()
      .then(function loadAndRender() {
        return loadOrParseDocument(qHtmlElement, options);
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
    bindings.delete(qHtmlElement);
  }

  function getQDomForElement(qHtmlElement) {
    const binding = bindings.get(qHtmlElement);
    if (!binding) {
      return null;
    }
    return binding.qdom;
  }

  function toQHtmlSource(qHtmlElement, options) {
    const binding = bindings.get(qHtmlElement);
    if (!binding) {
      return null;
    }
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
    toQHtmlSource: toQHtmlSource,
    hydrateComponentElement: hydrateComponentElement,
    initAll: initAll,
    startAutoMountObserver: startAutoMountObserver,
    stopAutoMountObserver: stopAutoMountObserver,
  };

  modules.qhtmlRuntime = runtimeApi;
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
