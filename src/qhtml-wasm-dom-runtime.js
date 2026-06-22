(function () {
  "use strict";

  const globalScope = typeof globalThis !== "undefined" ? globalThis : window;

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

  function callMaybe(target, name, args, fallback) {
    if (target && typeof target[name] === "function") {
      return target[name].apply(target, args || []);
    }
    return fallback;
  }

  const QCONTEXT_SCOPE_FRAME_KEY = "__qhtmlScopeFrame";
  const QCONTEXT_RUNTIME_FRAME_KEY = "__qhtmlContextFrame";
  const INLINE_REFERENCE_PATTERN = /\$\{\s*([^}]+?)\s*\}/g;
  const SIMPLE_DOT_PATH_PATTERN = /^(?:this\.component\.|component\.|this\.)?[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/;
  const QHTML_QVAR_HANDLE_FLAG = "__qhtmlVarHandle";

  function normalizeName(value) {
    return String(value == null ? "" : value).trim();
  }

  function defineHidden(target, name, value) {
    if (!target || (typeof target !== "object" && typeof target !== "function")) {
      return target;
    }
    try {
      Object.defineProperty(target, name, {
        configurable: true,
        enumerable: false,
        writable: true,
        value
      });
    } catch (_error) {
      target[name] = value;
    }
    return target;
  }

  function createRuntimeContextFrame(parentFrame, kind, owner) {
    const values = new Map();
    const parent = parentFrame && typeof parentFrame.get === "function" ? parentFrame : null;
    return {
      kind: normalizeName(kind || "scope") || "scope",
      owner: owner || null,
      parent,
      set(name, value) {
        const key = normalizeName(name);
        if (key) {
          values.set(key, value);
        }
        return value;
      },
      get(name) {
        const key = normalizeName(name);
        if (!key) {
          return undefined;
        }
        if (values.has(key)) {
          return values.get(key);
        }
        return parent ? parent.get(key) : undefined;
      },
      has(name) {
        const key = normalizeName(name);
        return !!(key && (values.has(key) || (parent && parent.has(key))));
      },
      delete(name) {
        const key = normalizeName(name);
        return key ? values.delete(key) : false;
      },
      child(childKind, childOwner) {
        return createRuntimeContextFrame(this, childKind || kind || "scope", childOwner || owner || null);
      },
      ownObject() {
        const out = Object.create(null);
        values.forEach((value, key) => {
          out[key] = value;
        });
        return out;
      },
      toObject() {
        const out = parent && typeof parent.toObject === "function" ? parent.toObject() : Object.create(null);
        values.forEach((value, key) => {
          out[key] = value;
        });
        return out;
      }
    };
  }

  function bindContextToTarget(target, scopeFrame, runtimeFrame) {
    defineHidden(target, QCONTEXT_SCOPE_FRAME_KEY, scopeFrame || null);
    defineHidden(target, QCONTEXT_RUNTIME_FRAME_KEY, runtimeFrame || null);
    defineHidden(target, "__qhtmlResolveSymbol", function resolveRuntimeSymbol(name) {
      const key = normalizeName(name);
      if (!key) {
        return undefined;
      }
      const localScope = this && this[QCONTEXT_SCOPE_FRAME_KEY] && typeof this[QCONTEXT_SCOPE_FRAME_KEY].get === "function"
        ? this[QCONTEXT_SCOPE_FRAME_KEY]
        : null;
      if (localScope) {
        const scoped = localScope.get(key);
        if (typeof scoped !== "undefined") {
          return unwrapQVarValue(scoped);
        }
      }
      const runtimeScope = this && this[QCONTEXT_RUNTIME_FRAME_KEY] && typeof this[QCONTEXT_RUNTIME_FRAME_KEY].get === "function"
        ? this[QCONTEXT_RUNTIME_FRAME_KEY]
        : null;
      return runtimeScope ? unwrapQVarValue(runtimeScope.get(key)) : undefined;
    });
    return target;
  }

  function resolveFrameForTarget(target, frameKey) {
    if (!target || (typeof target !== "object" && typeof target !== "function")) {
      return null;
    }
    return target[frameKey] && typeof target[frameKey].get === "function" ? target[frameKey] : null;
  }

  function createQVarHandle(name, initialValue) {
    const state = {
      name: normalizeName(name),
      value: initialValue
    };
    return {
      __qhtmlVarHandle: true,
      [QHTML_QVAR_HANDLE_FLAG]: true,
      get name() {
        return state.name;
      },
      get value() {
        return state.value;
      },
      set value(next) {
        state.value = next;
      },
      get() {
        return state.value;
      },
      set(next) {
        state.value = next;
        return state.value;
      },
      toJSON() {
        return state.value;
      },
      toString() {
        return String(state.value == null ? "" : state.value);
      }
    };
  }

  function isQVarHandle(value) {
    return !!(value && typeof value === "object" && value[QHTML_QVAR_HANDLE_FLAG] === true && typeof value.get === "function");
  }

  function unwrapQVarValue(value) {
    return isQVarHandle(value) ? value.get() : value;
  }

  function parseParameterList(value) {
    if (Array.isArray(value)) {
      return value.map(normalizeName).filter(Boolean);
    }
    const text = normalizeName(value);
    if (!text) {
      return [];
    }
    const parsed = parseJson(text, null);
    if (Array.isArray(parsed)) {
      return parsed.map(normalizeName).filter(Boolean);
    }
    return text.split(",").map(normalizeName).filter(Boolean);
  }

  function createScopedSelector(thisArg, explicitRoot) {
    return function qhtmlScopedSelector(selector) {
      const query = normalizeName(selector);
      if (!query) {
        return null;
      }
      const directRoot = explicitRoot && explicitRoot.nodeType === 1 ? explicitRoot : null;
      const root = directRoot || (thisArg && thisArg.nodeType === 1 && typeof thisArg.closest === "function" ? thisArg.closest("q-html") : null);
      if (!root || typeof root.querySelector !== "function") {
        return null;
      }
      try {
        return root.querySelector(query);
      } catch (_error) {
        return null;
      }
    };
  }

  function buildScopeObject(context, thisArg, extraScope) {
    const out = Object.create(null);
    if (extraScope && typeof extraScope === "object") {
      Object.assign(out, extraScope);
    }
    if (!Object.prototype.hasOwnProperty.call(out, "window")) {
      out.window = globalScope;
    }
    if (!Object.prototype.hasOwnProperty.call(out, "globalThis")) {
      out.globalThis = globalScope;
    }
    if (!Object.prototype.hasOwnProperty.call(out, "document") && thisArg && thisArg.ownerDocument) {
      out.document = thisArg.ownerDocument;
    }
    if (!Object.prototype.hasOwnProperty.call(out, "this")) {
      out.this = thisArg || out;
    }
    const scopeFrame =
      context && context.scopeFrame && typeof context.scopeFrame.get === "function"
        ? context.scopeFrame
        : resolveFrameForTarget(thisArg, QCONTEXT_SCOPE_FRAME_KEY);
    const runtimeFrame =
      context && context.runtimeFrame && typeof context.runtimeFrame.get === "function"
        ? context.runtimeFrame
        : resolveFrameForTarget(thisArg, QCONTEXT_RUNTIME_FRAME_KEY);
    if (runtimeFrame && typeof runtimeFrame.toObject === "function") {
      Object.assign(out, runtimeFrame.toObject());
    }
    if (scopeFrame && typeof scopeFrame.toObject === "function") {
      Object.assign(out, scopeFrame.toObject());
    }
    if (context && context.namedRuntimeValues && typeof context.namedRuntimeValues === "object") {
      Object.assign(out, context.namedRuntimeValues);
    }
    if (!Object.prototype.hasOwnProperty.call(out, "component")) {
      out.component = context && context.component ? context.component : thisArg || null;
    }
    if (!Object.prototype.hasOwnProperty.call(out, "$")) {
      out.$ = createScopedSelector(thisArg || out.component, context && context.hostElement);
    }

    const resolver = function resolveRuntimeSymbol(name) {
      const key = normalizeName(name);
      if (!key) {
        return undefined;
      }
      if (Object.prototype.hasOwnProperty.call(out, key)) {
        return unwrapQVarValue(out[key]);
      }
      const scoped = scopeFrame && typeof scopeFrame.get === "function" ? scopeFrame.get(key) : undefined;
      if (typeof scoped !== "undefined") {
        return unwrapQVarValue(scoped);
      }
      const runtime = runtimeFrame && typeof runtimeFrame.get === "function" ? runtimeFrame.get(key) : undefined;
      return unwrapQVarValue(runtime);
    };

    return new Proxy(out, {
      has(target, prop) {
        if (prop in target) {
          return true;
        }
        return typeof resolver(prop) !== "undefined";
      },
      get(target, prop) {
        if (prop in target) {
          return unwrapQVarValue(target[prop]);
        }
        return resolver(prop);
      },
      set(target, prop, value) {
        if (prop in target && isQVarHandle(target[prop])) {
          target[prop].set(value);
          return true;
        }
        const key = normalizeName(prop);
        const scoped = key && scopeFrame && typeof scopeFrame.get === "function" ? scopeFrame.get(key) : undefined;
        if (isQVarHandle(scoped)) {
          scoped.set(value);
          return true;
        }
        target[prop] = value;
        if (key && scopeFrame && typeof scopeFrame.set === "function") {
          scopeFrame.set(key, value);
        }
        return true;
      }
    });
  }

  function readPathValue(base, parts) {
    let cursor = unwrapQVarValue(base);
    for (const rawPart of parts) {
      const part = normalizeName(rawPart);
      if (!part || cursor == null) {
        return { found: false, value: undefined };
      }
      const isCall = part.endsWith("()");
      const key = isCall ? part.slice(0, -2) : part;
      let next;
      try {
        if (cursor && typeof cursor.__qhtmlResolveSymbol === "function") {
          next = cursor.__qhtmlResolveSymbol(key);
        }
        if (typeof next === "undefined") {
          next = cursor[key];
        }
        if (isCall) {
          if (typeof next !== "function") {
            return { found: false, value: undefined };
          }
          next = next.call(cursor);
        }
      } catch (_error) {
        return { found: false, value: undefined };
      }
      cursor = unwrapQVarValue(next);
    }
    return { found: true, value: cursor };
  }

  function tryResolvePathExpression(expression, scope, thisArg) {
    const source = normalizeName(expression);
    if (!source || !SIMPLE_DOT_PATH_PATTERN.test(source)) {
      return { matched: false, found: false, value: undefined };
    }
    if (source === "this") {
      return { matched: true, found: true, value: thisArg };
    }
    if (source === "this.component") {
      return { matched: true, found: true, value: scope.component || thisArg };
    }
    if (source.indexOf("this.component.") === 0) {
      return Object.assign({ matched: true }, readPathValue(scope.component || thisArg, source.slice("this.component.".length).split(".")));
    }
    const parts = source.split(".");
    let head = parts.shift();
    if (head === "this") {
      return Object.assign({ matched: true }, readPathValue(thisArg, parts));
    }
    if (head === "component") {
      return Object.assign({ matched: true }, readPathValue(scope.component || thisArg, parts));
    }
    if (head === "this" && parts[0] === "component") {
      parts.shift();
      return Object.assign({ matched: true }, readPathValue(scope.component || thisArg, parts));
    }
    if (head === "this" && parts.length) {
      return Object.assign({ matched: true }, readPathValue(thisArg, parts));
    }
    const candidate = scope[head];
    if (typeof candidate === "undefined") {
      return { matched: true, found: false, value: undefined };
    }
    return Object.assign({ matched: true }, readPathValue(candidate, parts));
  }

  function evaluateExpression(expression, context, thisArg, extraScope, options) {
    const source = normalizeName(expression);
    if (!source) {
      return "";
    }
    const opts = options && typeof options === "object" ? options : {};
    const scope = buildScopeObject(context, thisArg, extraScope);
    const pathResult = tryResolvePathExpression(source, scope, thisArg);
    if (pathResult.matched) {
      return pathResult.found ? pathResult.value : (opts.pathFallbackLiteral === false ? "" : source);
    }
    try {
      const evaluator = new Function("__qhtmlScope", "with(__qhtmlScope){ return (" + source + "); }");
      return evaluator.call(thisArg || scope, scope);
    } catch (error) {
      if (globalScope.console && typeof globalScope.console.error === "function") {
        globalScope.console.error(opts.errorLabel || "qhtml wasm expression evaluation failed:", error);
      }
      return "";
    }
  }

  function interpolate(source, context, thisArg, extraScope, options) {
    const text = String(source == null ? "" : source);
    if (text.indexOf("${") === -1) {
      return text;
    }
    return text.replace(INLINE_REFERENCE_PATTERN, (_match, expression) => {
      const value = evaluateExpression(expression, context, thisArg, extraScope, options);
      return value == null ? "" : String(value);
    });
  }

  function executeScript(source, context, thisArg, extraScope, args, parameters) {
    const body = String(source == null ? "" : source);
    if (!body.trim()) {
      return undefined;
    }
    const scope = buildScopeObject(context, thisArg, extraScope);
    const names = parseParameterList(parameters);
    const values = Array.isArray(args) ? args : [];
    for (let i = 0; i < names.length; i += 1) {
      scope[names[i]] = values[i];
    }
    try {
      const runner = new Function("__qhtmlScope", "with(__qhtmlScope){\n" + body + "\n}");
      return runner.call(thisArg || scope, scope);
    } catch (error) {
      if (globalScope.console && typeof globalScope.console.error === "function") {
        globalScope.console.error("qhtml wasm scoped script failed:", error);
      }
      return undefined;
    }
  }

  function parseQVarRaw(raw) {
    const match = String(raw || "").match(/^\s*q-var\s+([A-Za-z_$][A-Za-z0-9_$-]*)\s*\{([\s\S]*)\}\s*$/);
    if (!match) {
      return { name: "", body: "" };
    }
    return { name: normalizeName(match[1]), body: String(match[2] || "") };
  }

  function endpointParts(source) {
    const text = normalizeName(source);
    const dot = text.lastIndexOf(".");
    if (dot <= 0 || dot >= text.length - 1) {
      return null;
    }
    return {
      target: text.slice(0, dot),
      member: text.slice(dot + 1)
    };
  }

  function parseConnectSource(source) {
    const text = normalizeName(source).replace(/\s*->\s*/g, " ");
    const parts = text.split(/\s+/).filter(Boolean);
    if (parts.length < 2) {
      return null;
    }
    return {
      sender: endpointParts(parts[0]),
      receiver: endpointParts(parts[1])
    };
  }

  function createInterface(options) {
    const Module = options && options.Module ? options.Module : globalScope.Module;
    if (!Module) {
      throw new Error("QHTML WASM QDom interface requires an initialized Module");
    }

    const domByUuid = new Map();
    const handleByUuid = new Map();
    const facadeByUuid = new Map();
    const contextValueByUuid = new Map();
    const documentByHost = new WeakMap();
    const rootContextFrame = createRuntimeContextFrame(null, "runtime-root", null);

    function uuidOf(node) {
      return callMaybe(node, "uuid", [], "");
    }

    function rememberHandle(node) {
      const uuid = uuidOf(node);
      if (uuid) {
        handleByUuid.set(uuid, node);
      }
      return node;
    }

    function rememberDom(node, element) {
      const uuid = uuidOf(node);
      if (uuid && element) {
        domByUuid.set(uuid, element);
        if (typeof node.setDomUuid === "function") {
          node.setDomUuid(uuid);
        }
      }
      return element;
    }

    function nodeObject(node) {
      return callMaybe(node, "toObject", [], parseJson(callMaybe(node, "toJson", [], "{}"), {}));
    }

    function propertyJson(node, name) {
      if (!node) {
        return "null";
      }
      if (typeof node.propertyJson === "function") {
        const json = node.propertyJson(name);
        if (json != null && json !== "") {
          return json;
        }
      }
      if (typeof node.hasProperty === "function" && !node.hasProperty(name)) {
        return "null";
      }
      if (typeof node.stringProperty === "function") {
        return JSON.stringify(node.stringProperty(name));
      }
      return "null";
    }

    function readProperty(node, name) {
      if (!node) {
        return undefined;
      }
      const json = propertyJson(node, name);
      if (json != null && json !== "" && json !== "null") {
        return parseJson(json, null);
      }
      const object = nodeObject(node);
      const key = normalizeName(name);
      if (object && object.properties && Object.prototype.hasOwnProperty.call(object.properties, key)) {
        return object.properties[key];
      }
      if (object && object.props && Object.prototype.hasOwnProperty.call(object.props, key)) {
        return object.props[key];
      }
      if (object && object.attributes && Object.prototype.hasOwnProperty.call(object.attributes, key)) {
        return object.attributes[key];
      }
      if (object && Object.prototype.hasOwnProperty.call(object, key)) {
        return object[key];
      }
      return null;
    }

    function writeProperty(node, name, value) {
      if (!node) {
        return;
      }
      if (typeof value === "number" && typeof node.setNumberProperty === "function") {
        node.setNumberProperty(name, value);
      } else if (typeof value === "boolean" && typeof node.setBoolProperty === "function") {
        node.setBoolProperty(name, value);
      } else if (typeof node.setStringProperty === "function") {
        if (value == null || typeof value === "string") {
          node.setStringProperty(name, value == null ? "" : value);
        } else if (typeof node.setPropertyValue === "function") {
          node.setPropertyValue(name, value);
        } else {
          node.setStringProperty(name, JSON.stringify(value));
        }
      } else if (typeof node.setPropertyValue === "function") {
        node.setPropertyValue(name, value);
      }
    }

    function readObjectProperty(node, propertyName) {
      const name = normalizeName(propertyName);
      if (!name) {
        return undefined;
      }
      if (name === "uuid") {
        return uuidOf(node);
      }
      if (name === "kind") {
        return callMaybe(node, "kind", [], "");
      }
      if (name === "qdom") {
        return function qdom() {
          return createFacade(node);
        };
      }
      if (name === "element") {
        return function element() {
          return domByUuid.get(uuidOf(node)) || null;
        };
      }
      if (name === "connect") {
        return function connect(signalName, callback) {
          return callMaybe(node, "connect", [signalName, callback], 0);
        };
      }
      if (name === "disconnect") {
        return function disconnect(connectionId) {
          return callMaybe(node, "disconnect", [connectionId], false);
        };
      }
      if (name === "emit") {
        return function emit(signalName, payload) {
          callMaybe(node, "emit", [signalName, payload]);
        };
      }
      const value = readProperty(node, name);
      return value == null ? undefined : value;
    }

    function createContextValue(node, element) {
      if (!node) {
        return null;
      }
      rememberHandle(node);
      if (element) {
        rememberDom(node, element);
      }
      const uuid = uuidOf(node);
      if (uuid && contextValueByUuid.has(uuid)) {
        return contextValueByUuid.get(uuid);
      }
      const target = {
        handle: node,
        qdom() {
          return createFacade(node);
        },
        element() {
          return domByUuid.get(uuidOf(node)) || null;
        },
        __qhtmlResolveSymbol(name) {
          return readObjectProperty(node, name);
        }
      };
      const proxy = new Proxy(target, {
        get(proxyTarget, prop) {
          if (prop in proxyTarget) {
            return proxyTarget[prop];
          }
          if (typeof prop === "symbol") {
            return undefined;
          }
          return readObjectProperty(node, prop);
        },
        set(proxyTarget, prop, value) {
          if (typeof prop === "symbol") {
            proxyTarget[prop] = value;
            return true;
          }
          const key = normalizeName(prop);
          if (!key) {
            return true;
          }
          if (typeof value === "function") {
            proxyTarget[key] = value;
            return true;
          }
          writeProperty(node, key, value);
          return true;
        },
        has(proxyTarget, prop) {
          if (prop in proxyTarget) {
            return true;
          }
          return typeof prop === "string" && typeof readObjectProperty(node, prop) !== "undefined";
        }
      });
      if (uuid) {
        contextValueByUuid.set(uuid, proxy);
      }
      return proxy;
    }

    function childAt(node, index) {
      return rememberHandle(callMaybe(node, "childAt", [index], null));
    }

    function children(node) {
      const count = callMaybe(node, "childCount", [], 0);
      const out = [];
      for (let i = 0; i < count; i += 1) {
        const child = childAt(node, i);
        if (child) {
          out.push(child);
        }
      }
      return out;
    }

    function createFacade(node) {
      if (!node) {
        return null;
      }
      const uuid = uuidOf(node);
      if (uuid && facadeByUuid.has(uuid)) {
        return facadeByUuid.get(uuid);
      }

      const facade = {
        handle: node,
        kind() {
          return callMaybe(node, "kind", [], "");
        },
        uuid() {
          return uuidOf(node);
        },
        domUuid() {
          return callMaybe(node, "domUuid", [], "");
        },
        objectName() {
          return callMaybe(node, "objectName", [], "");
        },
        setObjectName(name) {
          callMaybe(node, "setObjectName", [String(name || "")]);
          return facade;
        },
        parent() {
          return createFacade(callMaybe(node, "parent", [], callMaybe(node, "parentNode", [], null)));
        },
        childAt(index) {
          return createFacade(childAt(node, index));
        },
        childCount() {
          return callMaybe(node, "childCount", [], 0);
        },
        children() {
          return children(node).map(createFacade);
        },
        property(name) {
          return readProperty(node, name);
        },
        setProperty(name, value) {
          writeProperty(node, name, value);
          return facade;
        },
        propertyJson(name) {
          return propertyJson(node, name);
        },
        propertyKeys() {
          return parseJson(callMaybe(node, "propertyKeys", [], "[]"), []);
        },
        connect(signalName, callback) {
          return callMaybe(node, "connect", [signalName, callback], 0);
        },
        disconnect(connectionId) {
          return callMaybe(node, "disconnect", [connectionId], false);
        },
        emit(signalName, payload) {
          if (typeof node.emit === "function") {
            node.emit(signalName, payload);
          }
          return facade;
        },
        find(query) {
          return createFacade(callMaybe(node, "find", [query], null));
        },
        findByUuid(query) {
          return createFacade(callMaybe(node, "findByUuid", [query], null));
        },
        findByName(query) {
          return createFacade(callMaybe(node, "findByName", [query], null));
        },
        findByKind(query) {
          return createFacade(callMaybe(node, "findByKind", [query], null));
        },
        toObject() {
          return nodeObject(node);
        },
        toJson() {
          return callMaybe(node, "toJson", [], JSON.stringify(nodeObject(node)));
        },
        element() {
          return domByUuid.get(uuidOf(node)) || null;
        },
        contextValue() {
          return createContextValue(node);
        }
      };

      if (uuid) {
        facadeByUuid.set(uuid, facade);
      }
      return facade;
    }

    function parse(source) {
      const parser = new Module.QHtmlParser();
      return parser.toAST(source);
    }

    function createDocument(sourceOrAst) {
      const ast = typeof sourceOrAst === "string" ? parse(sourceOrAst) : sourceOrAst;
      const created = new Module.QDomDocument().fromAST(ast);
      if (created && typeof created.root === "function") {
        return created;
      }

      const shim = {
        root() {
          return created;
        },
        findByUuid(uuid) {
          return callMaybe(created, "findByUuid", [uuid], null);
        },
        findByName(name) {
          return callMaybe(created, "findByName", [name], null);
        },
        findByKind(kind) {
          return callMaybe(created, "findByKind", [kind], null);
        },
        find(query) {
          return callMaybe(created, "find", [query], null);
        }
      };
      return shim;
    }

    return {
      Module,
      domByUuid,
      handleByUuid,
      documentByHost,
      parseJson,
      nodeObject,
      rememberHandle,
      rememberDom,
      createFacade,
      createDocument,
      parse,
      childAt,
      children,
      readProperty,
      writeProperty,
      rootContextFrame,
      createRuntimeContextFrame,
      bindContextToTarget,
      createContext(parentContext, owner, overrides) {
        const opts = overrides && typeof overrides === "object" ? overrides : {};
        const parentScope =
          parentContext && parentContext.scopeFrame && typeof parentContext.scopeFrame.child === "function"
            ? parentContext.scopeFrame
            : rootContextFrame;
        const parentRuntime =
          parentContext && parentContext.runtimeFrame && typeof parentContext.runtimeFrame.child === "function"
            ? parentContext.runtimeFrame
            : rootContextFrame;
        const context = Object.assign({
          scopeFrame: parentScope.child("scope", owner || null),
          runtimeFrame: parentRuntime.child("runtime", owner || null),
          rootContextFrame,
          hostElement: parentContext && parentContext.hostElement ? parentContext.hostElement : null,
          component: parentContext && parentContext.component ? parentContext.component : null,
          namedRuntimeValues: Object.create(parentContext && parentContext.namedRuntimeValues ? parentContext.namedRuntimeValues : null),
          exportAliasesToHost: false
        }, opts);
        if (!Object.prototype.hasOwnProperty.call(opts, "namedRuntimeValues")) {
          context.namedRuntimeValues = Object.create(parentContext && parentContext.namedRuntimeValues ? parentContext.namedRuntimeValues : null);
        }
        return context;
      },
      registerAlias(context, name, value) {
        const key = normalizeName(name);
        if (!key || !context) {
          return value;
        }
        if (context.scopeFrame && typeof context.scopeFrame.set === "function") {
          context.scopeFrame.set(key, value);
        }
        if (context.namedRuntimeValues && typeof context.namedRuntimeValues === "object") {
          context.namedRuntimeValues[key] = value;
        }
        if (context.exportAliasesToHost === true && context.hostElement && typeof context.hostElement === "object") {
          if (!context.hostElement.__qhtmlNamedRuntimeValues) {
            defineHidden(context.hostElement, "__qhtmlNamedRuntimeValues", context.namedRuntimeValues || Object.create(null));
          }
          context.hostElement.__qhtmlNamedRuntimeValues[key] = value;
        }
        return value;
      },
      createContextValue,
      createQVarHandle,
      parseQVarRaw,
      buildScopeObject,
      evaluateExpression,
      interpolate,
      executeScript,
      parseConnectSource,
      bindContextValue(target, context) {
        return bindContextToTarget(target, context && context.scopeFrame, context && context.runtimeFrame);
      },
      connectEndpoints(context, source) {
        const spec = parseConnectSource(source);
        if (!spec || !spec.sender || !spec.receiver) {
          return 0;
        }
        const scope = buildScopeObject(context, context && context.component ? context.component : null);
        const senderResult = tryResolvePathExpression(spec.sender.target, scope, context && context.component ? context.component : null);
        const receiverResult = tryResolvePathExpression(spec.receiver.target, scope, context && context.component ? context.component : null);
        const sender = senderResult.found ? senderResult.value : undefined;
        const receiver = receiverResult.found ? receiverResult.value : undefined;
        if (!sender || !receiver) {
          return 0;
        }
        const handler = typeof receiver[spec.receiver.member] === "function"
          ? receiver[spec.receiver.member].bind(receiver)
          : typeof receiver.__qhtmlResolveSymbol === "function" && typeof receiver.__qhtmlResolveSymbol(spec.receiver.member) === "function"
            ? receiver.__qhtmlResolveSymbol(spec.receiver.member).bind(receiver)
            : null;
        if (!handler || typeof sender.connect !== "function") {
          return 0;
        }
        return sender.connect(spec.sender.member, handler);
      },
      rootContext: {
        set(name, value) {
          return rootContextFrame.set(name, value);
        },
        get(name) {
          return unwrapQVarValue(rootContextFrame.get(name));
        },
        has(name) {
          return rootContextFrame.has(name);
        },
        child(parent) {
          const parentFrame = parent && typeof parent.get === "function" ? parent : rootContextFrame;
          return parentFrame.child("runtime", null);
        },
        toObject() {
          return rootContextFrame.toObject();
        }
      },
      findHandleByUuid(uuid) {
        return handleByUuid.get(uuid) || null;
      },
      findDomByUuid(uuid) {
        return domByUuid.get(uuid) || null;
      }
    };
  }

  globalScope.QHTMLWasmDomRuntime = {
    create: createInterface
  };
})();
