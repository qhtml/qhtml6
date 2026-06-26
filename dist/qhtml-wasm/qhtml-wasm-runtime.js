(function attachQHtmlWasmLiteRuntime(global) {
  "use strict";

  const modules = global.QHtmlModules || (global.QHtmlModules = {});
  const parser = modules.qhtmlParser || null;
  const renderer = modules.domRenderer || null;
  const legacyRuntime = modules.qhtmlRuntimeLegacy || global.QHtmlLegacy || null;

  const RUNTIME_VERSION = "8.0.0-wasm-lite";
  const QHTML_CONTENT_LOADED_EVENT = "QHTMLContentLoaded";
  const QHTML_PROCESSED_ATTR = "data-qhtml-processed";
  const CHILD_COLLECTION_KEYS = ["nodes", "children", "templateNodes", "slots", "__qhtmlRenderTree", "__qhtmlSlotNodes"];
  const RESERVED_OBJECT_KEYS = new Set(CHILD_COLLECTION_KEYS.concat(["meta"]));
  const bindings = new WeakMap();
  const domByUuid = new Map();
  const facadeByUuid = new Map();
  const rootValues = new Map();
  const signalReferencesByEmitter = new Map();
  const signalSubscribersByEmitter = new Map();
  const signalSubscriberByToken = new Map();
  const runtimeEventQueue = [];
  let runtimeEventToken = 1;
  let signalSubscriptionToken = 1;
  let runtimeEventFlushScheduled = false;
  let rootTree = null;
  let rootNode = null;

  function normalizeName(value) {
    return String(value == null ? "" : value).trim();
  }

  function parseJson(value, fallback) {
    if (value == null || value === "") {
      return fallback;
    }
    if (typeof value !== "string") {
      return value;
    }
    try {
      return JSON.parse(value);
    } catch (_error) {
      return fallback;
    }
  }

  function stringify(value) {
    try {
      return JSON.stringify(value);
    } catch (_error) {
      return String(value == null ? "" : value);
    }
  }

  function currentModule() {
    return global.Module || global.QtWasm || global.QHTMLQt && global.QHTMLQt.Module || null;
  }

  function hasWasmRuntime() {
    const Module = currentModule();
    return !!(Module && typeof Module.QHTMLNodeTree === "function");
  }

  function requireWasmRuntime(featureName) {
    const Module = currentModule();
    if (!Module || typeof Module.QHTMLNodeTree !== "function") {
      throw new Error(
        "QHTML WASM runtime feature unavailable: " +
          featureName +
          ". Load qhtml-wasm.js and compile qhtml_runtime_bindings.cpp into the module."
      );
    }
    return Module;
  }

  function unsupported(featureName) {
    return function qhtmlUnsupportedFeature() {
      if (legacyRuntime && typeof legacyRuntime[featureName] === "function") {
        return legacyRuntime[featureName].apply(legacyRuntime, arguments);
      }
      throw new Error(
        "QHTML feature is not WASM-backed yet and no legacy fallback was registered: " + featureName
      );
    };
  }

  function normalizeUuid(value) {
    return normalizeName(value);
  }

  function normalizeSignalName(value) {
    return normalizeName(value).toLowerCase();
  }

  function enqueueRuntimeEvent(kind, callback, metadata) {
    const entry = {
      token: runtimeEventToken++,
      kind: normalizeName(kind) || "runtime",
      callback: typeof callback === "function" ? callback : function noopRuntimeEvent() {},
      metadata: metadata && typeof metadata === "object" ? metadata : {},
      createdAt: Date.now()
    };
    runtimeEventQueue.push(entry);
    if (!runtimeEventFlushScheduled) {
      runtimeEventFlushScheduled = true;
      Promise.resolve().then(flushRuntimeEventQueue);
    }
    return entry.token;
  }

  function flushRuntimeEventQueue() {
    runtimeEventFlushScheduled = false;
    let processed = 0;
    while (runtimeEventQueue.length && processed < 1000) {
      processed += 1;
      const entry = runtimeEventQueue.shift();
      try {
        entry.callback(entry.metadata);
      } catch (error) {
        if (global.console && typeof global.console.error === "function") {
          global.console.error("qhtml runtime event failed:", error);
        }
      }
    }
    if (runtimeEventQueue.length) {
      runtimeEventFlushScheduled = true;
      Promise.resolve().then(flushRuntimeEventQueue);
    }
  }

  function ensureEmitterSignalMap(registry, emitterUuid) {
    const emitter = normalizeUuid(emitterUuid);
    if (!emitter) {
      return null;
    }
    let signalMap = registry.get(emitter);
    if (!(signalMap instanceof Map)) {
      signalMap = new Map();
      registry.set(emitter, signalMap);
    }
    return signalMap;
  }

  function registerSignalReference(options) {
    const opts = options && typeof options === "object" ? options : {};
    const emitterUuid = normalizeUuid(opts.emitterUuid || opts.uuid);
    const subscriberUuid = normalizeUuid(opts.subscriberUuid || opts.targetUuid);
    const signalName = normalizeSignalName(opts.signalName || opts.signal);
    if (!emitterUuid || !subscriberUuid) {
      return null;
    }
    const signalMap = ensureEmitterSignalMap(signalReferencesByEmitter, emitterUuid);
    const routeKey = normalizeName(opts.routeKey || opts.referenceKey) ||
      "ref:" + (signalName || "*") + ":" + subscriberUuid;
    signalMap.set(routeKey, {
      emitterUuid,
      subscriberUuid,
      signalName,
      referenceKey: routeKey,
      routeKey
    });
    return { emitterUuid, subscriberUuid, signalName, referenceKey: routeKey, routeKey };
  }

  function unregisterSignalReference(options) {
    const opts = options && typeof options === "object" ? options : {};
    const emitterUuid = normalizeUuid(opts.emitterUuid || opts.uuid);
    const routeKey = normalizeName(opts.referenceKey || opts.routeKey);
    if (!emitterUuid || !routeKey) {
      return false;
    }
    const signalMap = signalReferencesByEmitter.get(emitterUuid);
    if (!(signalMap instanceof Map)) {
      return false;
    }
    const removed = signalMap.delete(routeKey);
    if (signalMap.size === 0) {
      signalReferencesByEmitter.delete(emitterUuid);
    }
    return removed;
  }

  function registerSignalSubscriber(options) {
    const opts = options && typeof options === "object" ? options : {};
    const emitterUuid = normalizeUuid(opts.emitterUuid || opts.uuid);
    const signalName = normalizeSignalName(opts.signalName || opts.signal);
    const handler = opts.handler;
    if (!emitterUuid || !signalName || typeof handler !== "function") {
      return null;
    }
    const signalMap = ensureEmitterSignalMap(signalSubscribersByEmitter, emitterUuid);
    let subscribers = signalMap.get(signalName);
    if (!(subscribers instanceof Map)) {
      subscribers = new Map();
      signalMap.set(signalName, subscribers);
    }
    const token = signalSubscriptionToken++;
    const routeKey = normalizeName(opts.routeKey) || "conn:" + token;
    const entry = {
      token,
      routeKey,
      emitterUuid,
      signalName,
      subscriberUuid: normalizeUuid(opts.subscriberUuid || opts.targetUuid || emitterUuid),
      mode: normalizeName(opts.mode) || "connect",
      attributeName: normalizeName(opts.attributeName),
      handler,
      createdAt: Date.now()
    };
    subscribers.set(routeKey, entry);
    signalSubscriberByToken.set(token, { emitterUuid, signalName, routeKey });
    return { token, routeKey, emitterUuid, signalName, mode: entry.mode };
  }

  function removeSignalSubscriberEntry(emitterUuid, signalName, routeKey) {
    const signalMap = signalSubscribersByEmitter.get(emitterUuid);
    if (!(signalMap instanceof Map)) {
      return false;
    }
    const subscribers = signalMap.get(signalName);
    if (!(subscribers instanceof Map)) {
      return false;
    }
    const entry = subscribers.get(routeKey);
    const removed = subscribers.delete(routeKey);
    if (entry && entry.token != null) {
      signalSubscriberByToken.delete(entry.token);
    }
    if (subscribers.size === 0) {
      signalMap.delete(signalName);
    }
    if (signalMap.size === 0) {
      signalSubscribersByEmitter.delete(emitterUuid);
    }
    return removed;
  }

  function unregisterSignalSubscriber(options) {
    const opts = options && typeof options === "object" ? options : {};
    if (opts.token != null) {
      const token = Number(opts.token);
      const lookup = signalSubscriberByToken.get(token);
      if (!lookup) {
        return false;
      }
      return removeSignalSubscriberEntry(lookup.emitterUuid, lookup.signalName, lookup.routeKey);
    }
    const emitterUuid = normalizeUuid(opts.emitterUuid || opts.uuid);
    const signalName = normalizeSignalName(opts.signalName || opts.signal);
    const routeKey = normalizeName(opts.routeKey);
    if (!emitterUuid || !signalName || !routeKey) {
      return false;
    }
    return removeSignalSubscriberEntry(emitterUuid, signalName, routeKey);
  }

  function clearSignalSubscribersForEmitter(emitterUuid) {
    const emitter = normalizeUuid(emitterUuid);
    const signalMap = signalSubscribersByEmitter.get(emitter);
    if (!(signalMap instanceof Map)) {
      signalReferencesByEmitter.delete(emitter);
      return 0;
    }
    let removed = 0;
    signalMap.forEach(function eachSignal(subscribers) {
      if (!(subscribers instanceof Map)) {
        return;
      }
      subscribers.forEach(function eachSubscriber(entry) {
        if (entry && entry.token != null) {
          signalSubscriberByToken.delete(entry.token);
        }
        removed += 1;
      });
    });
    signalSubscribersByEmitter.delete(emitter);
    signalReferencesByEmitter.delete(emitter);
    return removed;
  }

  function resolveSignalEmitterUuid(target, payload) {
    const detail = payload && typeof payload === "object" ? payload : {};
    return normalizeUuid(
      detail.emitterUuid ||
      detail.componentUuid ||
      detail.uuid ||
      target && typeof target.getAttribute === "function" && target.getAttribute("data-qdom-uuid") ||
      target && typeof target.qdom === "function" && target.qdom() && target.qdom().uuid && target.qdom().uuid()
    );
  }

  function dispatchRegisteredSubscribers(emitterUuid, signalName, payload, target) {
    const emitter = normalizeUuid(emitterUuid);
    const signal = normalizeSignalName(signalName);
    const signalMap = signalSubscribersByEmitter.get(emitter);
    if (!(signalMap instanceof Map)) {
      return 0;
    }
    const subscribers = signalMap.get(signal);
    if (!(subscribers instanceof Map)) {
      return 0;
    }
    let dispatched = 0;
    subscribers.forEach(function eachSubscriber(entry) {
      if (!entry || typeof entry.handler !== "function") {
        return;
      }
      const event = {
        type: signalName,
        detail: payload,
        target,
        currentTarget: target
      };
      enqueueRuntimeEvent("signal-subscriber", function invokeSubscriber() {
        entry.handler(payload, event);
      }, { target, payload, emitterUuid: emitter, signalName: signal });
      dispatched += 1;
    });
    return dispatched;
  }

  function dispatchSignalPayload(target, signalName, payload) {
    const signal = normalizeName(signalName);
    const detail = payload && typeof payload === "object" ? Object.assign({}, payload) : { value: payload };
    const emitterUuid = resolveSignalEmitterUuid(target, detail);
    if (emitterUuid) {
      detail.emitterUuid = emitterUuid;
      detail.componentUuid = detail.componentUuid || emitterUuid;
    }
    let qSignal = false;
    let named = false;
    if (target && typeof target.dispatchEvent === "function") {
      target.dispatchEvent(new CustomEvent("q-signal", { detail, bubbles: true, composed: true }));
      qSignal = true;
      if (signal) {
        target.dispatchEvent(new CustomEvent(signal, { detail, bubbles: true, composed: true }));
        named = true;
      }
    }
    if (emitterUuid && signal) {
      dispatchRegisteredSubscribers(emitterUuid, signal, detail, target);
    }
    return { qSignal, named };
  }

  function dispatchPropertyChangedEvent(target, payload) {
    const detail = payload && typeof payload === "object" ? Object.assign({}, payload) : {};
    const propertyName = normalizeName(detail.propertyName || detail.name);
    if (!propertyName) {
      return false;
    }
    dispatchSignalPayload(target, propertyName + "Changed", detail);
    return true;
  }

  function fallbackValue(featureName, factory) {
    if (legacyRuntime && legacyRuntime[featureName] != null) {
      return legacyRuntime[featureName];
    }
    return typeof factory === "function" ? factory() : null;
  }

  function ensureRootTree() {
    if (!rootTree) {
      const Module = requireWasmRuntime("rootContext");
      rootTree = new Module.QHTMLNodeTree();
      rootNode = rootTree.createComponent("__qhtmlRootContext");
      rootTree.setSymbol(rootNode.uuid(), "root", rootNode.uuid());
    }
    return rootTree;
  }

  function ensureRootNode() {
    ensureRootTree();
    return rootNode;
  }

  function createTree() {
    const Module = requireWasmRuntime("createTree");
    return new Module.QHTMLNodeTree();
  }

  function createElement(typeName, tree) {
    const targetTree = tree || ensureRootTree();
    return targetTree.createElement(normalizeName(typeName) || "element");
  }

  function createComponent(componentId, tree) {
    const targetTree = tree || ensureRootTree();
    return targetTree.createComponent(normalizeName(componentId) || "component");
  }

  function nodeUuid(node) {
    return node && typeof node.uuid === "function" ? String(node.uuid() || "") : "";
  }

  function rememberDom(node, element) {
    const uuid = nodeUuid(node);
    if (uuid && element) {
      domByUuid.set(uuid, element);
    }
    return element;
  }

  function readNodeObject(node) {
    if (!node) {
      return {};
    }
    const raw = typeof node.toObject === "function"
      ? node.toObject()
      : parseJson(typeof node.toJson === "function" ? node.toJson() : "{}", {});
    const object = raw && typeof raw === "object" ? Object.assign({}, raw) : {};
    const properties = object.properties && typeof object.properties === "object" ? object.properties : {};
    const symbols = object.symbols && typeof object.symbols === "object" ? object.symbols : {};

    Object.keys(properties).forEach(function copyProperty(key) {
      if (!Object.prototype.hasOwnProperty.call(object, key)) {
        object[key] = properties[key];
      }
    });
    object.symbols = symbols;
    object.uuid = object.uuid || nodeUuid(node);
    object.kind = object.kind || object.typeName || properties.kind || "element";
    if (!object.tagName && properties.tagName) {
      object.tagName = properties.tagName;
    }
    if (!object.componentId && properties.componentId) {
      object.componentId = properties.componentId;
    }
    return object;
  }

  function childAt(node, index) {
    return node && typeof node.childAt === "function" ? node.childAt(index) : null;
  }

  function children(node) {
    const count = node && typeof node.childCount === "function" ? node.childCount() : 0;
    const out = [];
    for (let i = 0; i < count; i += 1) {
      const child = childAt(node, i);
      if (child) {
        out.push(child);
      }
    }
    return out;
  }

  function readProperty(node, name) {
    const key = normalizeName(name);
    if (!node || !key) {
      return undefined;
    }
    if (key === "uuid") {
      return nodeUuid(node);
    }
    if (key === "kind" && typeof node.kind === "function") {
      return node.kind();
    }
    if (typeof node.propertyValue === "function" && typeof node.hasProperty === "function" && node.hasProperty(key)) {
      return node.propertyValue(key);
    }
    const object = readNodeObject(node);
    return Object.prototype.hasOwnProperty.call(object, key) ? object[key] : undefined;
  }

  function writeProperty(node, name, value) {
    const key = normalizeName(name);
    if (!node || !key) {
      return node;
    }
    if (typeof value === "number" && typeof node.setNumber === "function") {
      node.setNumber(key, value);
    } else if (typeof value === "boolean" && typeof node.setBool === "function") {
      node.setBool(key, value);
    } else if (value == null || typeof value === "string") {
      if (typeof node.setString === "function") {
        node.setString(key, value == null ? "" : value);
      } else if (typeof node.setPropertyValue === "function") {
        node.setPropertyValue(key, value);
      }
    } else if (typeof node.setPropertyValue === "function") {
      node.setPropertyValue(key, value);
    } else if (typeof node.setString === "function") {
      node.setString(key, stringify(value));
    }
    return node;
  }

  function createContextValue(node) {
    const target = {
      handle: node,
      qdom: function qdom() {
        return createFacade(node);
      },
      element: function element() {
        return domByUuid.get(nodeUuid(node)) || null;
      },
      __qhtmlResolveSymbol: function resolveSymbol(name) {
        const key = normalizeName(name);
        const resolved = node && typeof node.resolveSymbol === "function" ? node.resolveSymbol(key) : "";
        return resolved ? createContextValue(findNodeByUuid(resolved)) : readProperty(node, key);
      }
    };

    return new Proxy(target, {
      get(proxyTarget, prop) {
        if (prop in proxyTarget) {
          return proxyTarget[prop];
        }
        if (typeof prop === "symbol") {
          return undefined;
        }
        return readProperty(node, prop);
      },
      set(proxyTarget, prop, value) {
        if (typeof prop === "symbol" || String(prop).indexOf("__qhtml") === 0 || typeof value === "function") {
          proxyTarget[prop] = value;
          return true;
        }
        writeProperty(node, prop, value);
        return true;
      },
      has(proxyTarget, prop) {
        return prop in proxyTarget || typeof readProperty(node, prop) !== "undefined";
      }
    });
  }

  function createFacade(node) {
    if (!node) {
      return null;
    }
    const uuid = nodeUuid(node);
    if (uuid && facadeByUuid.has(uuid)) {
      return facadeByUuid.get(uuid);
    }
    const facade = {
      handle: node,
      uuid: function uuidFn() {
        return nodeUuid(node);
      },
      kind: function kind() {
        return typeof node.kind === "function" ? node.kind() : readNodeObject(node).kind;
      },
      parent: function parent() {
        return createFacade(typeof node.parent === "function" ? node.parent() : null);
      },
      childAt: function child(index) {
        return createFacade(childAt(node, index));
      },
      childCount: function childCount() {
        return typeof node.childCount === "function" ? node.childCount() : 0;
      },
      children: function childList() {
        return children(node).map(createFacade);
      },
      property: function property(name) {
        return readProperty(node, name);
      },
      setProperty: function setProperty(name, value) {
        writeProperty(node, name, value);
        return facade;
      },
      connect: function connect(signalName, callback) {
        return node && typeof node.connect === "function" ? node.connect(normalizeName(signalName), callback) : 0;
      },
      disconnect: function disconnect(connectionId) {
        return node && typeof node.disconnect === "function" ? node.disconnect(connectionId) : false;
      },
      emit: function emit(signalName, payload) {
        if (node && typeof node.emit === "function") {
          node.emit(normalizeName(signalName), payload);
        }
        return facade;
      },
      context: function context() {
        return node && typeof node.getContext === "function" ? node.getContext() : null;
      },
      resolveSymbol: function resolveSymbol(name) {
        return node && typeof node.resolveSymbol === "function" ? node.resolveSymbol(normalizeName(name)) : "";
      },
      toObject: function toObject() {
        return readNodeObject(node);
      },
      toJson: function toJson() {
        return stringify(readNodeObject(node));
      },
      element: function element() {
        return domByUuid.get(uuid) || null;
      },
      contextValue: function contextValue() {
        return createContextValue(node);
      }
    };
    if (uuid) {
      facadeByUuid.set(uuid, facade);
    }
    return facade;
  }

  function findNodeByUuid(uuid) {
    if (rootTree && typeof rootTree.get === "function") {
      return rootTree.get(normalizeName(uuid));
    }
    return null;
  }

  function scalarPropertiesFromQDom(qdomNode) {
    const out = {};
    if (!qdomNode || typeof qdomNode !== "object") {
      return out;
    }
    Object.keys(qdomNode).forEach(function copyScalar(key) {
      const value = qdomNode[key];
      if (RESERVED_OBJECT_KEYS.has(key)) {
        return;
      }
      if (value == null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        out[key] = value;
      } else if (Array.isArray(value) || typeof value === "object") {
        out[key] = stringify(value);
      }
    });
    return out;
  }

  function childCollectionsFromQDom(qdomNode) {
    const out = [];
    CHILD_COLLECTION_KEYS.forEach(function collect(key) {
      const list = qdomNode && Array.isArray(qdomNode[key]) ? qdomNode[key] : null;
      if (list) {
        list.forEach(function append(item) {
          if (item && typeof item === "object") {
            out.push(item);
          }
        });
      }
    });
    return out;
  }

  function inferNodeType(qdomNode) {
    const kind = normalizeName(qdomNode && (qdomNode.kind || qdomNode.type));
    if (kind) {
      return kind;
    }
    if (qdomNode && qdomNode.tagName) {
      return "element";
    }
    if (qdomNode && qdomNode.componentId) {
      return "component";
    }
    return "node";
  }

  function registerLikelySymbols(tree, node, qdomNode) {
    ["id", "name", "alias", "componentId", "classId", "structId", "tagName"].forEach(function register(key) {
      const value = normalizeName(qdomNode && qdomNode[key]);
      if (value && typeof tree.setSymbol === "function") {
        tree.setSymbol(node.uuid(), value, node.uuid());
      }
    });
  }

  function convertQDomToWasmTree(qdomRoot, tree, parentNode) {
    const typeName = inferNodeType(qdomRoot);
    const node = typeName === "component"
      ? tree.createComponent(normalizeName(qdomRoot.componentId || qdomRoot.name) || "component")
      : tree.createElement(typeName);
    const properties = scalarPropertiesFromQDom(qdomRoot);
    Object.keys(properties).forEach(function write(key) {
      writeProperty(node, key, properties[key]);
    });
    registerLikelySymbols(tree, node, qdomRoot);
    if (parentNode) {
      tree.addChild(parentNode.uuid(), node.uuid());
    }
    childCollectionsFromQDom(qdomRoot).forEach(function convertChild(child) {
      convertQDomToWasmTree(child, tree, node);
    });
    return node;
  }

  function parseSourceToQDom(source, options) {
    if (parser && typeof parser.parseQHtmlToQDom === "function") {
      return parser.parseQHtmlToQDom(String(source || ""), options || {});
    }
    const Module = currentModule();
    if (Module && typeof Module.QHtmlParser === "function") {
      const qParser = new Module.QHtmlParser();
      return qParser.toAST(String(source || ""));
    }
    throw new Error("No QHTML parser available.");
  }

  function createDocument(sourceOrQDom, options) {
    const tree = createTree();
    const qdom = typeof sourceOrQDom === "string" ? parseSourceToQDom(sourceOrQDom, options) : sourceOrQDom;
    const root = convertQDomToWasmTree(qdom || { kind: "document" }, tree, null);
    return { tree, root, rawQDom: qdom, facade: createFacade(root) };
  }

  function parseMaybeJson(value, fallback) {
    if (typeof value !== "string") {
      return value == null ? fallback : value;
    }
    return parseJson(value, fallback);
  }

  function firstSelector(object) {
    const selectors = parseMaybeJson(object.selectors || object.selectorChain, []);
    if (Array.isArray(selectors) && selectors.length) {
      return normalizeName(selectors[0]);
    }
    return normalizeName(object.selector || object.rawSelector || "");
  }

  function tagNameFromObject(object) {
    const explicit = normalizeName(object.tagName || object.componentId || object.classId || object.structId);
    if (explicit) {
      return explicit.toLowerCase();
    }
    const selector = firstSelector(object);
    if (!selector) {
      return "div";
    }
    const endCandidates = ["#", ".", "[", ":"].map(function indexOfToken(token) {
      const index = selector.indexOf(token);
      return index < 0 ? selector.length : index;
    });
    const end = Math.min.apply(Math, endCandidates);
    const tag = normalizeName(selector.slice(0, end));
    return (tag || "div").toLowerCase();
  }

  function applySelectorHints(element, object) {
    const selector = firstSelector(object);
    if (!selector || !element || element.nodeType !== 1) {
      return;
    }
    const idMatch = selector.match(/#([A-Za-z_$][A-Za-z0-9_$:-]*)/);
    if (idMatch && !element.id) {
      element.id = idMatch[1];
    }
    const classes = [];
    selector.replace(/\.([A-Za-z_$][A-Za-z0-9_$:-]*)/g, function collect(_match, className) {
      classes.push(className);
      return _match;
    });
    if (classes.length) {
      element.classList.add.apply(element.classList, classes);
    }
  }

  function normalizeAttributes(object) {
    const attrs = parseMaybeJson(object.attributes, {});
    if (attrs && typeof attrs === "object" && !Array.isArray(attrs)) {
      return attrs;
    }
    return {};
  }

  function applyAttributes(element, object) {
    const attrs = normalizeAttributes(object);
    Object.keys(attrs).forEach(function apply(name) {
      const key = normalizeName(name);
      const value = attrs[name];
      if (!key || value == null || typeof value === "object") {
        return;
      }
      element.setAttribute(key, String(value));
    });
    ["id", "class", "href", "src", "alt", "title", "type", "value", "name"].forEach(function applyKnown(name) {
      if (object[name] != null && !element.hasAttribute(name)) {
        element.setAttribute(name, String(object[name]));
      }
    });
  }

  function renderBasicNode(node, documentObject) {
    const doc = documentObject || global.document;
    const object = readNodeObject(node);
    const kind = normalizeName(object.kind || object.typeName || object.type).toLowerCase();

    if (kind === "document" || kind === "root" || kind === "fragment" || kind === "qdomdocumentnode") {
      const fragment = doc.createDocumentFragment();
      children(node).forEach(function append(child) {
        const rendered = renderBasicNode(child, doc);
        if (rendered) {
          fragment.appendChild(rendered);
        }
      });
      return fragment;
    }

    if (kind === "text" || kind === "textblock" || kind === "rawtextline") {
      return doc.createTextNode(String(object.value || object.text || object.textContent || ""));
    }

    if (kind === "raw-html" || kind === "htmlblock" || kind === "html") {
      const template = doc.createElement("template");
      template.innerHTML = String(object.html || object.value || object.text || "");
      return template.content.cloneNode(true);
    }

    if (kind === "component" || kind === "class" || kind === "struct" || kind.indexOf("definition") >= 0) {
      return doc.createComment("qhtml definition " + (object.componentId || object.classId || object.structId || ""));
    }

    const element = doc.createElement(tagNameFromObject(object));
    rememberDom(node, element);
    applySelectorHints(element, object);
    applyAttributes(element, object);

    const text = object.textContent != null ? object.textContent : object.text;
    if (text != null && String(text) !== "") {
      element.textContent = String(text);
    }

    children(node).forEach(function append(child) {
      const rendered = renderBasicNode(child, doc);
      if (rendered) {
        element.appendChild(rendered);
      }
    });
    return element;
  }

  function renderWithAvailableRenderer(binding) {
    if (renderer && typeof renderer.renderIntoElement === "function") {
      renderer.renderIntoElement(binding.rawQDom, binding.host, binding.host.ownerDocument || global.document, {
        rootHostElement: binding.host,
        namedRuntimeValues: rootContextToObject(),
        wasmTree: binding.tree,
        wasmRoot: binding.root,
        wasmFacade: binding.qdom,
        capture: binding.options && binding.options.capture ? binding.options.capture : null
      });
      return null;
    }
    if (renderer && typeof renderer.renderDocumentToFragment === "function") {
      return renderer.renderDocumentToFragment(binding.rawQDom, binding.host.ownerDocument || global.document, {
        rootHostElement: binding.host,
        namedRuntimeValues: rootContextToObject(),
        wasmTree: binding.tree,
        wasmRoot: binding.root,
        wasmFacade: binding.qdom,
        capture: binding.options && binding.options.capture ? binding.options.capture : null
      });
    }
    if (
      binding.options &&
      binding.options.preferExistingWasmRenderer === true &&
      global.QHTMLQt &&
      global.QHTMLQt.renderer &&
      typeof global.QHTMLQt.renderer.mountQHtmlElement === "function"
    ) {
      return global.QHTMLQt.renderer.mountQHtmlElement(binding.host);
    }
    if (renderer && typeof renderer.renderQDom === "function") {
      return renderer.renderQDom(binding.rawQDom, binding.host, { wasmTree: binding.tree, wasmRoot: binding.root });
    }
    if (renderer && typeof renderer.render === "function") {
      return renderer.render(binding.rawQDom, binding.host, { wasmTree: binding.tree, wasmRoot: binding.root });
    }
    if (legacyRuntime && typeof legacyRuntime.mountQHtmlElement === "function") {
      return legacyRuntime.mountQHtmlElement(binding.host, binding.options);
    }
    return renderBasicNode(binding.root, binding.host.ownerDocument || global.document);
  }

  function mountQHtmlElement(qHtmlElement, options) {
    if (!qHtmlElement || qHtmlElement.nodeType !== 1) {
      throw new Error("mountQHtmlElement expects a q-html element node.");
    }
    const existing = bindings.get(qHtmlElement);
    if (existing) {
      return existing;
    }
    const source = qHtmlElement.textContent || qHtmlElement.innerHTML || "";
    const documentHandle = createDocument(source, options || {});
    const binding = {
      host: qHtmlElement,
      tree: documentHandle.tree,
      root: documentHandle.root,
      qdom: documentHandle.facade,
      rawQDom: documentHandle.rawQDom,
      options: options || {},
      ready: null,
      disconnect: function disconnect() {}
    };
    bindings.set(qHtmlElement, binding);
    try {
      Object.defineProperty(qHtmlElement, "__qhtmlWasmTree", {
        configurable: true,
        enumerable: false,
        value: binding.tree
      });
      Object.defineProperty(qHtmlElement, "__qhtmlWasmRoot", {
        configurable: true,
        enumerable: false,
        value: binding.root
      });
      Object.defineProperty(qHtmlElement, "__qhtmlWasmFacade", {
        configurable: true,
        enumerable: false,
        value: binding.qdom
      });
      if (typeof qHtmlElement.qdom !== "function") {
        Object.defineProperty(qHtmlElement, "qdom", {
          configurable: true,
          enumerable: false,
          value: function qhtmlWasmLiteQdom() {
            return binding.qdom;
          }
        });
      }
    } catch (_error) {
      qHtmlElement.__qhtmlWasmTree = binding.tree;
      qHtmlElement.__qhtmlWasmRoot = binding.root;
      qHtmlElement.__qhtmlWasmFacade = binding.qdom;
    }
    binding.ready = Promise.resolve().then(function render() {
      const rendered = renderWithAvailableRenderer(binding);
      if (rendered && rendered.nodeType) {
        qHtmlElement.textContent = "";
        qHtmlElement.appendChild(rendered);
      }
      rememberDom(binding.root, qHtmlElement);
      qHtmlElement.setAttribute(QHTML_PROCESSED_ATTR, "true");
      return binding;
    });
    return binding;
  }

  function unmountQHtmlElement(qHtmlElement) {
    const binding = bindings.get(qHtmlElement);
    if (!binding) {
      return false;
    }
    if (typeof binding.disconnect === "function") {
      binding.disconnect();
    }
    bindings.delete(qHtmlElement);
    if (qHtmlElement && typeof qHtmlElement.removeAttribute === "function") {
      qHtmlElement.removeAttribute(QHTML_PROCESSED_ATTR);
    }
    return true;
  }

  function getQDomForElement(qHtmlElement) {
    const binding = bindings.get(qHtmlElement);
    return binding ? binding.qdom : null;
  }

  function updateQHtmlElement(qHtmlElement, options) {
    if (legacyRuntime && typeof legacyRuntime.updateQHtmlElement === "function") {
      return legacyRuntime.updateQHtmlElement(qHtmlElement, options);
    }
    const binding = bindings.get(qHtmlElement);
    if (!binding) {
      return null;
    }
    return binding.ready;
  }

  function initAll(root, options) {
    const scope = root || global.document;
    const mounted = [];
    if (!scope || typeof scope.querySelectorAll !== "function") {
      return mounted;
    }
    const elements = scope.querySelectorAll("q-html:not([" + QHTML_PROCESSED_ATTR + "])");
    for (let i = 0; i < elements.length; i += 1) {
      mounted.push(mountQHtmlElement(elements[i], options));
    }
    const doc = scope.nodeType === 9 ? scope : scope.ownerDocument || global.document;
    if (doc && typeof doc.dispatchEvent === "function") {
      Promise.resolve().then(function signalContentLoaded() {
        doc.dispatchEvent(new CustomEvent(QHTML_CONTENT_LOADED_EVENT, { detail: { runtime: runtimeApi } }));
      });
    }
    return mounted;
  }

  function createQModel(input) {
    if (legacyRuntime && typeof legacyRuntime.createQModel === "function") {
      return legacyRuntime.createQModel(input);
    }
    const values = Array.isArray(input) ? input.slice() : input && typeof input === "object" ? Object.assign({}, input) : [];
    return {
      count: function count() {
        return Array.isArray(values) ? values.length : Object.keys(values).length;
      },
      toArray: function toArray() {
        return Array.isArray(values) ? values.slice() : Object.keys(values).map(function map(key) { return values[key]; });
      },
      toObject: function toObject() {
        return Array.isArray(values) ? values.slice() : Object.assign({}, values);
      },
      set: function set(key, value) {
        values[key] = value;
        return value;
      },
      value: function value(key) {
        return values[key];
      },
      push: function push(value) {
        if (Array.isArray(values)) {
          values.push(value);
        }
        return value;
      }
    };
  }

  function createQArray(input) {
    return createQModel(Array.isArray(input) ? input : []);
  }

  function createQCallback(input) {
    return typeof input === "function" ? input : function noopCallback() {};
  }

  function createQHtmlFragment(source) {
    return createDocument(String(source || "")).facade;
  }

  function setRootContextProperty(name, value) {
    const key = normalizeName(name);
    if (!key) {
      return value;
    }
    rootValues.set(key, value);
    const node = ensureRootNode();
    writeProperty(node, key, value);
    return value;
  }

  function getRootContextProperty(name) {
    const key = normalizeName(name);
    if (!key) {
      return undefined;
    }
    if (rootValues.has(key)) {
      return rootValues.get(key);
    }
    return readProperty(ensureRootNode(), key);
  }

  function rootContextToObject() {
    const out = {};
    rootValues.forEach(function each(value, key) {
      out[key] = value;
    });
    return out;
  }

  function createChildRootContext() {
    const tree = ensureRootTree();
    const node = tree.createComponent("__qhtmlChildContext");
    tree.addChild(ensureRootNode().uuid(), node.uuid());
    return node.getContext();
  }

  function createQSignalEvent(payload) {
    return {
      type: "q-signal",
      detail: payload,
      payload: payload,
      value: payload
    };
  }

  function emitQSignal(target, payload, eventNamePrefix) {
    const eventName = normalizeName(eventNamePrefix) || "q-signal";
    if (target && typeof target.dispatchEvent === "function") {
      target.dispatchEvent(new CustomEvent(eventName, { detail: payload }));
      return true;
    }
    if (target && typeof target.emit === "function") {
      target.emit(eventName, payload);
      return true;
    }
    return false;
  }

  const wasmBacked = Object.freeze({
    createTree,
    createElement,
    createComponent,
    createDocument,
    createFacade,
    createContextValue,
    readProperty,
    writeProperty,
    mountQHtmlElement,
    unmountQHtmlElement,
    getQDomForElement,
    rootContext: true,
    propertyBindings: true,
    signals: true,
    contextResolution: true
  });

  const jsFallback = Object.freeze({
    toQHtmlSource: "requires JS serializer/parser",
    listRegisteredComponentIds: "requires JS definition registry until definitions move into QHTMLNodeTree",
    listRegisteredComponentSlots: "requires JS definition registry until slots move into QHTMLComponent",
    registerWorkerRuntime: "browser worker lifecycle",
    unregisterWorkerRuntime: "browser worker lifecycle",
    getWorkerRuntime: "browser worker lifecycle",
    setComponentParent: "renderer/DOM concern",
    updateQHtmlElement: "incremental DOM patcher is still JS fallback",
    startAutoMountObserver: "MutationObserver/browser concern",
    stopAutoMountObserver: "MutationObserver/browser concern",
    setDomMutationObserversEnabled: "MutationObserver/browser concern",
    hydrateComponentElement: "renderer/DOM concern",
    qmapNode: "debug/introspection helper",
    QModel: "small JS fallback here, full observable model should become QHTMLModel later",
    QArray: "small JS fallback here, full observable model should become QHTMLModel later",
    QCallback: "JS callable wrapper; cannot be pure WASM while user script is JS"
  });

  const runtimeApi = {
    SIGNALS: { QHTMLContentLoaded: QHTML_CONTENT_LOADED_EVENT },
    version: RUNTIME_VERSION,
    ready: global.QHTMLQtReady || Promise.resolve(currentModule()),
    wasmAvailable: hasWasmRuntime,
    wasm: wasmBacked,
    fallback: jsFallback,
    createTree,
    createElement,
    createComponent,
    createDocument,
    createFacade,
    mountQHtmlElement,
    unmountQHtmlElement,
    getQDomForElement,
    updateQHtmlElement,
    setComponentParent: unsupported("setComponentParent"),
    toQHtmlSource: unsupported("toQHtmlSource"),
    listRegisteredComponentIds: unsupported("listRegisteredComponentIds"),
    listRegisteredComponentSlots: unsupported("listRegisteredComponentSlots"),
    createQSignalEvent,
    emitQSignal,
    enqueueRuntimeEvent,
    enqueueWorkerEvent: unsupported("enqueueWorkerEvent"),
    registerSignalSubscriber,
    unregisterSignalSubscriber,
    registerSignalReference,
    unregisterSignalReference,
    runWithExecutionHost: fallbackValue("runWithExecutionHost", function identityFactory() {
      return function runWithExecutionHost(_host, callback) {
        return typeof callback === "function" ? callback() : undefined;
      };
    }),
    getCurrentExecutionHost: fallbackValue("getCurrentExecutionHost", function nullFactory() {
      return function getCurrentExecutionHost() { return null; };
    }),
    clearSignalSubscribersForEmitter,
    getEventLoopMode: fallbackValue("getEventLoopMode", function modeFactory() {
      return function getEventLoopMode() { return "wasm-lite"; };
    }),
    dispatchSignalPayload,
    dispatchPropertyChangedEvent,
    getEventLoopSnapshot: fallbackValue("getEventLoopSnapshot", function snapshotFactory() {
      return function getEventLoopSnapshot() { return { mode: "wasm-lite", queued: 0 }; };
    }),
    printEventLoopSnapshot: fallbackValue("printEventLoopSnapshot", function printFactory() {
      return function printEventLoopSnapshot() { return runtimeApi.getEventLoopSnapshot(); };
    }),
    createQModel,
    createQArray,
    createQCallback,
    QSignal: renderer && renderer.QSignal ? renderer.QSignal : null,
    QProperty: renderer && renderer.QProperty ? renderer.QProperty : null,
    QComponentInstance: renderer && renderer.QComponentInstance ? renderer.QComponentInstance : null,
    QVar: renderer && renderer.QVar ? renderer.QVar : null,
    QCssValue: modules.qdomCore && modules.qdomCore.QCssValue ? modules.qdomCore.QCssValue : null,
    cssValue: modules.qdomCore && typeof modules.qdomCore.createCssValue === "function" ? modules.qdomCore.createCssValue : null,
    cssCalc: modules.qdomCore && typeof modules.qdomCore.createCssContextHelper === "function"
      ? function cssCalc(context, property) { return modules.qdomCore.createCssContextHelper(context || null, property || ""); }
      : null,
    createCssContext: modules.qdomCore && typeof modules.qdomCore.createCssContextHelper === "function"
      ? function createCssContext(context, property) { return modules.qdomCore.createCssContextHelper(context || null, property || ""); }
      : null,
    resolveCssValue: modules.qdomCore && typeof modules.qdomCore.resolveCssValue === "function" ? modules.qdomCore.resolveCssValue : null,
    getQDomDataForUuid: unsupported("getQDomDataForUuid"),
    getQDomDataSnapshot: unsupported("getQDomDataSnapshot"),
    rootContext: {
      set: setRootContextProperty,
      get: getRootContextProperty,
      has: function has(name) { return rootValues.has(normalizeName(name)); },
      child: createChildRootContext,
      toObject: rootContextToObject
    },
    setContextProperty: setRootContextProperty,
    getContextProperty: getRootContextProperty,
    createChildContext: createChildRootContext,
    resolveUuidPointer: function resolveUuidPointer(uuid) {
      return createFacade(findNodeByUuid(uuid));
    },
    registerWorkerRuntime: unsupported("registerWorkerRuntime"),
    unregisterWorkerRuntime: unsupported("unregisterWorkerRuntime"),
    getWorkerRuntime: unsupported("getWorkerRuntime"),
    qhtml: createQHtmlFragment,
    qmapNode: unsupported("qmapNode"),
    hydrateComponentElement: unsupported("hydrateComponentElement"),
    setDomMutationObserversEnabled: unsupported("setDomMutationObserversEnabled"),
    getDomMutationObserversEnabled: function getDomMutationObserversEnabled() { return false; },
    isDomMutationObserversActive: function isDomMutationObserversActive() { return false; },
    initAll,
    startAutoMountObserver: unsupported("startAutoMountObserver"),
    stopAutoMountObserver: unsupported("stopAutoMountObserver")
  };

  modules.qhtmlRuntime = runtimeApi;
  modules.qhtmlRuntimeWasmLite = runtimeApi;
  global.QHtml = runtimeApi;
  global.QHTML_VERSION = RUNTIME_VERSION;
  global.QModel = createQModel;
  global.QArray = createQArray;
  global.QMap = function qMapFactory(value) { return createQModel(value || {}); };
  global.QCallback = createQCallback;
  global.qhtml = createQHtmlFragment;

  if (global.document) {
    const mount = function mountReady() { runtimeApi.initAll(global.document); };
    if (global.document.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", mount, { once: true });
    } else {
      Promise.resolve().then(mount);
    }
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
