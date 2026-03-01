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
  const UPDATE_NONCE_KEY = "update-nonce";
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
    const node = {
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
    setUpdateNonce(node);
    return node;
  }

  function createElementNode(options) {
    const opts = options || {};
    const node = {
      kind: NODE_TYPES.element,
      tagName: String(opts.tagName || "div").toLowerCase(),
      attributes: Object.assign({}, opts.attributes || {}),
      children: Array.isArray(opts.children) ? opts.children : [],
      textContent: typeof opts.textContent === "string" ? opts.textContent : null,
      selectorMode: opts.selectorMode || "single",
      selectorChain: Array.isArray(opts.selectorChain) ? opts.selectorChain.slice() : [String(opts.tagName || "div").toLowerCase()],
      meta: createNodeMeta(opts.meta),
    };
    setUpdateNonce(node);
    return node;
  }

  function createTextNode(options) {
    const opts = options || {};
    const node = {
      kind: NODE_TYPES.text,
      value: typeof opts.value === "string" ? opts.value : "",
      meta: createNodeMeta(opts.meta),
    };
    setUpdateNonce(node);
    return node;
  }

  function createRawHtmlNode(options) {
    const opts = options || {};
    const node = {
      kind: NODE_TYPES.rawHtml,
      html: typeof opts.html === "string" ? opts.html : "",
      meta: createNodeMeta(opts.meta),
    };
    setUpdateNonce(node);
    return node;
  }

  function createComponentNode(options) {
    const opts = options || {};
    const node = {
      kind: NODE_TYPES.component,
      componentId: String(opts.componentId || "").trim(),
      definitionType: String(opts.definitionType || "component").trim().toLowerCase() || "component",
      templateNodes: Array.isArray(opts.templateNodes) ? opts.templateNodes : [],
      methods: Array.isArray(opts.methods) ? opts.methods : [],
      lifecycleScripts: Array.isArray(opts.lifecycleScripts) ? opts.lifecycleScripts : [],
      attributes: Object.assign({}, opts.attributes || {}),
      properties: Array.isArray(opts.properties) ? opts.properties.slice() : [],
      meta: createNodeMeta(opts.meta),
    };
    setUpdateNonce(node);
    return node;
  }

  function createSlotNode(options) {
    const opts = options || {};
    const node = {
      kind: NODE_TYPES.slot,
      name: String(opts.name || "default").trim() || "default",
      children: Array.isArray(opts.children) ? opts.children : [],
      meta: createNodeMeta(opts.meta),
    };
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
    const tag = String(opts.tagName || opts.componentId || "div").trim().toLowerCase();
    const node = {
      kind: normalizeInstanceKind(opts.kind),
      componentId: String(opts.componentId || tag).trim().toLowerCase(),
      tagName: tag,
      attributes: Object.assign({}, opts.attributes || {}),
      props: Object.assign({}, opts.props || {}),
      slots: Array.isArray(opts.slots) ? opts.slots : [],
      children: Array.isArray(opts.children) ? opts.children : [],
      textContent: typeof opts.textContent === "string" ? opts.textContent : null,
      selectorMode: opts.selectorMode || "single",
      selectorChain: Array.isArray(opts.selectorChain) ? opts.selectorChain.slice() : [tag],
      meta: createNodeMeta(opts.meta),
    };
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
    const node = {
      kind: NODE_TYPES.scriptRule,
      selector: String(opts.selector || ""),
      eventName: String(opts.eventName || ""),
      body: typeof opts.body === "string" ? opts.body : "",
      meta: createNodeMeta(opts.meta),
    };
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
