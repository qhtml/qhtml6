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
  const QHTML_SIGNAL_DISPATCHED = "__qhtmlSignalDispatched";
  const QHTML_PROPERTY_DISPATCHED = "__qhtmlPropertyDispatched";
  let nextSignalBridgeId = 1;

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

  function parseTimerRaw(raw) {
    const match = String(raw || "").match(/^\s*q-timer\s+([A-Za-z_$][A-Za-z0-9_$-]*)\s*\{/);
    return { name: match ? normalizeName(match[1]) : "" };
  }

  function coerceNumber(value, fallback) {
    if (value == null || value === "") {
      return fallback;
    }
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : fallback;
    }
    const numeric = Number(String(value).trim());
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  function coerceBoolean(value, fallback) {
    if (value == null || value === "") {
      return fallback;
    }
    if (typeof value === "boolean") {
      return value;
    }
    if (typeof value === "number") {
      return value !== 0;
    }
    const text = String(value).trim().toLowerCase();
    if (text === "true" || text === "yes" || text === "on" || text === "1") {
      return true;
    }
    if (text === "false" || text === "no" || text === "off" || text === "0") {
      return false;
    }
    return fallback;
  }

  function propertyDirectiveMap(item) {
    const out = Object.create(null);
    const children = item && Array.isArray(item.items) ? item.items : [];
    for (const child of children) {
      if (!child || child.type !== "Property") {
        continue;
      }
      const name = normalizeName(child.name);
      if (!name) {
        continue;
      }
      out[name] = Object.prototype.hasOwnProperty.call(child, "value") ? child.value : child.rawValue;
    }
    return out;
  }

  function parseNumericUnit(value) {
    let text = String(value == null ? "" : value).trim();
    if (text.length >= 2) {
      const quote = text[0];
      if ((quote === "\"" || quote === "'") && text[text.length - 1] === quote) {
        text = text.slice(1, -1).trim();
      }
    }
    const match = text.match(/^(-?\d+(?:\.\d+)?)([a-z%]*)$/i);
    if (!match) {
      return null;
    }
    return {
      number: Number(match[1]),
      unit: match[2] || ""
    };
  }

  function formatNumericUnit(number, unit) {
    const rounded = Math.round(number * 1000) / 1000;
    return String(rounded) + (unit || "");
  }

  function easingValue(name, t) {
    const key = normalizeName(name).toLowerCase();
    if (key === "easeinquad") {
      return t * t;
    }
    if (key === "easeoutquad") {
      return t * (2 - t);
    }
    if (key === "easeinoutquad") {
      return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    }
    return t;
  }

  function easingCurveType(name) {
    const key = normalizeName(name).toLowerCase();
    if (key === "easeinquad") {
      return 2;
    }
    if (key === "easeoutquad") {
      return 3;
    }
    if (key === "easeinoutquad") {
      return 4;
    }
    return 1;
  }

  function normalizeBehaviorAnimationType(value) {
    const tag = normalizeName(value).toLowerCase();
    if (
      tag === "numberanimation" ||
      tag === "q-number-animation" ||
      tag === "q-property-animation" ||
      tag === "propertyanimation" ||
      tag === "property-animation"
    ) {
      return "property";
    }
    if (tag === "q-script-action" || tag === "scriptaction" || tag === "script-action") {
      return "script";
    }
    if (
      tag === "q-queued-animation" ||
      tag === "q-animation-queue" ||
      tag === "q-sequential-animation" ||
      tag === "q-sequential-animation-group" ||
      tag === "sequentialanimation"
    ) {
      return "queued";
    }
    if (
      tag === "q-async-animation" ||
      tag === "q-parallel-animation" ||
      tag === "q-parallel-animation-group" ||
      tag === "parallelanimation"
    ) {
      return "async";
    }
    return "";
  }

  function applyLooseAnimationProperties(config, rawSource) {
    const source = String(rawSource || "");
    if (!source) {
      return config;
    }
    source.replace(/(?:^|[;\n\r{])\s*([A-Za-z_$][A-Za-z0-9_$]*)\s+(?![:{])([^;\n\r}]+)/g, (_match, rawName, rawValue) => {
      const key = normalizeName(rawName);
      if (key && !Object.prototype.hasOwnProperty.call(config, key)) {
        config[key] = String(rawValue || "").trim();
      }
      return _match;
    });
    return config;
  }

  function normalizeBehaviorAnimationItem(item) {
    if (!item || typeof item !== "object") {
      return null;
    }
    if (item.type === "QScriptActionBlock") {
      return {
        type: "script",
        scriptBody: String(item.script || "")
      };
    }
    if (item.type !== "Element") {
      return null;
    }
    const selectors = Array.isArray(item.selectors) ? item.selectors : [];
    const normalizedType = normalizeBehaviorAnimationType(selectors[0]);
    if (!normalizedType) {
      return null;
    }
    const config = Object.assign({ type: normalizedType }, propertyDirectiveMap(item));
    const children = [];
    const items = Array.isArray(item.items) ? item.items : [];
    for (const child of items) {
      const childAnimation = normalizeBehaviorAnimationItem(child);
      if (childAnimation) {
        children.push(childAnimation);
      }
    }
    if (normalizedType === "queued" || normalizedType === "async") {
      config.children = children;
    }
    return applyLooseAnimationProperties(config, item.raw);
  }

  function createBehaviorAnimationInterface(animation) {
    const item = animation || { type: "property" };
    if (item.type === "property" || item.type === "script") {
      return {
        type: "queued",
        children: [item]
      };
    }
    return item;
  }

  function firstBehaviorAnimationNode(rule) {
    const items = rule && Array.isArray(rule.items) ? rule.items : [];
    for (const item of items) {
      const animation = normalizeBehaviorAnimationItem(item);
      if (animation) {
        return createBehaviorAnimationInterface(animation);
      }
    }
    return createBehaviorAnimationInterface({ type: "property" });
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
    const runtimeClasses = new Map();
    const signalQueue = [];
    let signalQueueProcessing = false;

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

    function enqueueSignal(callback, payload) {
      if (typeof callback !== "function") {
        return;
      }
      signalQueue.push({ callback, payload });
      if (signalQueueProcessing) {
        return;
      }
      signalQueueProcessing = true;
      const flush = () => {
        while (signalQueue.length) {
          const entry = signalQueue.shift();
          try {
            entry.callback(entry.payload);
          } catch (error) {
            if (globalScope.console && typeof globalScope.console.error === "function") {
              globalScope.console.error("qhtml wasm signal callback failed:", error);
            }
          }
        }
        signalQueueProcessing = false;
      };
      if (typeof globalScope.queueMicrotask === "function") {
        globalScope.queueMicrotask(flush);
      } else {
        globalScope.setTimeout(flush, 0);
      }
    }

    function connectSignal(node, signalName, callback) {
      const signal = normalizeName(signalName);
      if (!node || !signal || typeof callback !== "function" || typeof node.connect !== "function") {
        return 0;
      }
      return node.connect(signal, function qhtmlWasmQueuedSignal(payload) {
        enqueueSignal(callback, payload);
      });
    }

    function emitSignal(node, signalName, payload) {
      const signal = normalizeName(signalName);
      if (!node || !signal) {
        return;
      }
      if (typeof node.dispatchSignal === "function") {
        node.dispatchSignal(signal, payload);
      } else if (typeof node.emit === "function") {
        node.emit(signal, payload);
        if (signal !== QHTML_SIGNAL_DISPATCHED) {
          node.emit(QHTML_SIGNAL_DISPATCHED, {
            type: "signal",
            signalName: signal,
            name: signal,
            payload,
            value: payload,
            uuid: uuidOf(node),
            sourceUuid: uuidOf(node)
          });
        }
      }
    }

    function emitPropertyChanged(node, propertyName, value, previous) {
      const property = normalizeName(propertyName);
      if (!node || !property) {
        return;
      }
      if (typeof node.dispatchPropertyChanged === "function") {
        node.dispatchPropertyChanged(property, value, previous);
        return;
      }
      const event = {
        type: "property",
        signalName: property + "Changed",
        name: property + "Changed",
        propertyName,
        value,
        previous,
        payload: value,
        uuid: uuidOf(node),
        sourceUuid: uuidOf(node)
      };
      if (typeof node.emit === "function") {
        node.emit(property + "Changed", event);
        node.emit(QHTML_PROPERTY_DISPATCHED, event);
        node.emit(QHTML_SIGNAL_DISPATCHED, event);
      } else {
        emitSignal(node, property + "Changed", event);
      }
    }

    function notifyPropertyChanged(proxyTarget, node, propertyName, value, previous) {
      emitPropertyChanged(node, propertyName, value, previous);
    }

    function setProxyBackedProperty(proxyTarget, node, propertyName, value, previous, notify) {
      writeProperty(node, propertyName, value);
      if (notify !== false) {
        notifyPropertyChanged(proxyTarget, node, propertyName, value, previous);
      }
    }

    function createNativePropertyAnimation(proxyTarget, node, defaultPropertyName, previous, requestedValue, animation) {
      if (!node || typeof Module.QPropertyAnimation !== "function") {
        return null;
      }
      const target = resolveBehaviorTarget(proxyTarget, node, animation || {}, defaultPropertyName);
      const targetNode = target.node || node;
      const targetProperty = target.propertyName || defaultPropertyName;
      const livePrevious = targetNode === node && targetProperty === defaultPropertyName ? previous : readProperty(targetNode, targetProperty);
      const fromValue = Object.prototype.hasOwnProperty.call(animation, "from") ? animation.from : livePrevious;
      const toValue = Object.prototype.hasOwnProperty.call(animation, "to") ? animation.to : requestedValue;
      const fromNumeric = parseNumericUnit(fromValue);
      const toNumeric = parseNumericUnit(toValue);
      if (!fromNumeric || !toNumeric || fromNumeric.unit || toNumeric.unit) {
        return null;
      }
      try {
        writeProperty(targetNode, targetProperty, fromNumeric.number);
        const proxyObject = typeof Module.QObject === "function" ? new Module.QObject() : null;
        if (!proxyObject || typeof proxyObject.setNumber !== "function") {
          return null;
        }
        proxyObject.setNumber(targetProperty, fromNumeric.number);
        const propertyAnimation = new Module.QPropertyAnimation();
        if (typeof propertyAnimation.setTarget !== "function") {
          return null;
        }
        propertyAnimation.setTarget(proxyObject);
        propertyAnimation.setPropertyName(targetProperty);
        propertyAnimation.setDuration(Math.max(0, Math.floor(coerceNumber(animation.duration, 250))));
        propertyAnimation.setStartNumber(fromNumeric.number);
        propertyAnimation.setEndNumber(toNumeric.number);
        if (typeof propertyAnimation.setEasing === "function") {
          propertyAnimation.setEasing(easingCurveType(animation.easing));
        }
        const connectionId = typeof proxyObject.connect === "function"
          ? proxyObject.connect(targetProperty + "Changed", function qhtmlWasmProxyAnimationStep(value) {
            const numericValue = Number.isFinite(Number(value))
              ? Number(value)
              : typeof proxyObject.getNumber === "function"
                ? proxyObject.getNumber(targetProperty)
                : value;
            const previousValue = readProperty(targetNode, targetProperty);
            writeProperty(targetNode, targetProperty, numericValue);
            emitPropertyChanged(targetNode, targetProperty, numericValue, previousValue);
          })
          : 0;
        return { kind: "property", object: propertyAnimation, refs: [proxyObject, connectionId] };
      } catch (_error) {
        return null;
      }
    }

    function createNativeScriptAction(proxyTarget, node, animation) {
      if (typeof Module.QScriptActionAnimation !== "function") {
        return null;
      }
      try {
        const scriptAction = new Module.QScriptActionAnimation();
        scriptAction.setDuration(Math.max(0, Math.floor(coerceNumber(animation.duration, 0))));
        scriptAction.setCallback(function qhtmlWasmNativeScriptAction() {
          runBehaviorScriptAction(proxyTarget, node, animation);
        });
        return { kind: "script", object: scriptAction };
      } catch (_error) {
        return null;
      }
    }

    function appendNativeAnimation(group, child) {
      if (!group || !child || !child.object) {
        return false;
      }
      if (child.kind === "property" && typeof group.addPropertyAnimation === "function") {
        group.addPropertyAnimation(child.object);
        return true;
      }
      if (child.kind === "script" && typeof group.addScriptAction === "function") {
        group.addScriptAction(child.object);
        return true;
      }
      if (child.kind === "group" && typeof group.addAnimationGroup === "function") {
        group.addAnimationGroup(child.object);
        return true;
      }
      return false;
    }

    function createNativeAnimationNode(proxyTarget, node, propertyName, previous, requestedValue, animation, refs) {
      const item = animation || { type: "property" };
      if (item.type === "property") {
        const propertyAnimation = createNativePropertyAnimation(proxyTarget, node, propertyName, previous, requestedValue, item);
        if (propertyAnimation && refs) {
          refs.push(propertyAnimation.object);
          if (Array.isArray(propertyAnimation.refs)) {
            refs.push(...propertyAnimation.refs);
          }
        }
        return propertyAnimation;
      }
      if (item.type === "script") {
        const scriptAction = createNativeScriptAction(proxyTarget, node, item);
        if (scriptAction && refs) {
          refs.push(scriptAction.object);
        }
        return scriptAction;
      }
      const GroupType = item.type === "async" ? Module.QParallelAnimationGroup : Module.QSequentialAnimationGroup;
      if (typeof GroupType !== "function") {
        return null;
      }
      const group = new GroupType();
      if (refs) {
        refs.push(group);
      }
      const children = Array.isArray(item.children) ? item.children : [];
      for (const child of children) {
        const nativeChild = createNativeAnimationNode(proxyTarget, node, propertyName, previous, requestedValue, child, refs);
        if (!appendNativeAnimation(group, nativeChild)) {
          return null;
        }
      }
      return { kind: "group", object: group };
    }

    function startNativeBehaviorGroup(proxyTarget, node, propertyName, previous, nextValue, animation, token) {
      if (typeof Module.QSequentialAnimationGroup !== "function") {
        return false;
      }
      const refs = [];
      const nativeRoot = createNativeAnimationNode(proxyTarget, node, propertyName, previous, nextValue, animation, refs);
      if (!nativeRoot) {
        return false;
      }
      let group = nativeRoot.object;
      if (nativeRoot.kind !== "group") {
        token.nativeAnimations = refs;
        token.cancelFns.push(() => {
          if (nativeRoot.object && typeof nativeRoot.object.stop === "function") {
            nativeRoot.object.stop();
          }
        });
        const connectionId = typeof nativeRoot.object.connect === "function"
          ? nativeRoot.object.connect("finished", function qhtmlWasmNativeAnimationFinished() {
            if (typeof nativeRoot.object.disconnect === "function") {
              nativeRoot.object.disconnect(connectionId);
            }
            if (token.cancelled) {
              return;
            }
            delete proxyTarget.__qhtmlActiveBehaviors[propertyName];
            notifyPropertyChanged(proxyTarget, node, propertyName, readProperty(node, propertyName), previous);
          })
          : 0;
        nativeRoot.object.start();
        return true;
      }
      refs.push(group);
      token.nativeAnimations = refs;
      token.cancelFns.push(() => {
        if (typeof group.stop === "function") {
          group.stop();
        }
      });
      const connectionId = typeof group.connect === "function"
        ? group.connect("finished", function qhtmlWasmNativeAnimationGroupFinished() {
          if (typeof group.disconnect === "function") {
            group.disconnect(connectionId);
          }
          if (token.cancelled) {
            return;
          }
          delete proxyTarget.__qhtmlActiveBehaviors[propertyName];
          notifyPropertyChanged(proxyTarget, node, propertyName, readProperty(node, propertyName), previous);
        })
        : 0;
      group.start();
      return true;
    }

    function behaviorExecutionContext(proxyTarget, node) {
      const element = proxyTarget && typeof proxyTarget.element === "function"
        ? proxyTarget.element()
        : domByUuid.get(uuidOf(node)) || null;
      const hostElement = element && typeof element.closest === "function" ? element.closest("q-html") : null;
      return {
        element: element || proxyTarget,
        context: {
          scopeFrame: resolveFrameForTarget(proxyTarget, QCONTEXT_SCOPE_FRAME_KEY),
          runtimeFrame: resolveFrameForTarget(proxyTarget, QCONTEXT_RUNTIME_FRAME_KEY),
          rootContextFrame,
          hostElement,
          component: proxyTarget,
          namedRuntimeValues: Object.create(null),
          exportAliasesToHost: false
        }
      };
    }

    function runBehaviorScriptAction(proxyTarget, node, animation) {
      const body = String(animation && (animation.scriptBody || animation.script) || "");
      if (!body.trim()) {
        return Promise.resolve();
      }
      const execution = behaviorExecutionContext(proxyTarget, node);
      try {
        const result = executeScript(
          body,
          execution.context,
          execution.element,
          {
            action: animation,
            component: proxyTarget,
            node: createContextValue(node, execution.element && execution.element.nodeType === 1 ? execution.element : null)
          },
          [],
          []
        );
        if (result && typeof result.then === "function") {
          return result.then(() => undefined, (error) => {
            if (globalScope.console && typeof globalScope.console.error === "function") {
              globalScope.console.error("qhtml wasm q-script-action failed:", error);
            }
          });
        }
      } catch (error) {
        if (globalScope.console && typeof globalScope.console.error === "function") {
          globalScope.console.error("qhtml wasm q-script-action failed:", error);
        }
      }
      return Promise.resolve();
    }

    function resolveBehaviorTarget(proxyTarget, node, animation, defaultPropertyName) {
      const rawTarget = normalizeName(animation && animation.target);
      if (!rawTarget) {
        return { proxyTarget, node, propertyName: defaultPropertyName };
      }
      const parts = rawTarget.split(".").map(normalizeName).filter(Boolean);
      if (parts.length === 1) {
        return { proxyTarget, node, propertyName: parts[0] };
      }
      const propertyName = parts.pop();
      const expression = parts.join(".");
      const execution = behaviorExecutionContext(proxyTarget, node);
      const owner = evaluateExpression(expression, execution.context, execution.element, { component: proxyTarget }, { pathFallbackLiteral: false });
      if (owner && typeof owner.qdom === "function") {
        const facade = owner.qdom();
        return { proxyTarget: owner, node: facade && facade.handle ? facade.handle : node, propertyName };
      }
      return { proxyTarget, node, propertyName: propertyName || defaultPropertyName };
    }

    function runPropertyAnimationNode(proxyTarget, node, defaultPropertyName, previous, requestedValue, animation, token) {
      const target = resolveBehaviorTarget(proxyTarget, node, animation || {}, defaultPropertyName);
      const targetNode = target.node || node;
      const targetProperty = target.propertyName || defaultPropertyName;
      const duration = Math.max(0, Math.floor(coerceNumber(animation.duration, 250)));
      const livePrevious = targetNode === node && targetProperty === defaultPropertyName ? previous : readProperty(targetNode, targetProperty);
      const fromValue = Object.prototype.hasOwnProperty.call(animation, "from") ? animation.from : livePrevious;
      const toValue = Object.prototype.hasOwnProperty.call(animation, "to") ? animation.to : requestedValue;
      const fromNumeric = parseNumericUnit(fromValue);
      const toNumeric = parseNumericUnit(toValue);
      const unit = toNumeric && fromNumeric && fromNumeric.unit === toNumeric.unit ? toNumeric.unit : null;
      const finalWriteValue = toNumeric ? formatNumericUnit(toNumeric.number, toNumeric.unit) : toValue;

      return new Promise((resolve) => {
        if (token.cancelled) {
          resolve();
          return;
        }

        let timeoutId = 0;
        token.cancelFns.push(() => {
          if (timeoutId) {
            globalScope.clearTimeout(timeoutId);
          }
        });

        if (!duration || !fromNumeric || !toNumeric || unit == null || typeof globalScope.setTimeout !== "function") {
          timeoutId = globalScope.setTimeout(() => {
            writeProperty(targetNode, targetProperty, finalWriteValue);
            resolve();
          }, duration);
          return;
        }

        const started = typeof globalScope.performance !== "undefined" && globalScope.performance.now
          ? globalScope.performance.now()
          : Date.now();
        const step = () => {
          if (token.cancelled) {
            resolve();
            return;
          }
          const now = typeof globalScope.performance !== "undefined" && globalScope.performance.now
            ? globalScope.performance.now()
            : Date.now();
          const progress = Math.min(1, Math.max(0, (now - started) / duration));
          const eased = easingValue(animation.easing, progress);
          const current = fromNumeric.number + ((toNumeric.number - fromNumeric.number) * eased);
          const currentValue = formatNumericUnit(current, unit);
          const previousValue = readProperty(targetNode, targetProperty);
          writeProperty(targetNode, targetProperty, currentValue);
          emitPropertyChanged(targetNode, targetProperty, currentValue, previousValue);
          if (progress >= 1) {
            writeProperty(targetNode, targetProperty, finalWriteValue);
            resolve();
            return;
          }
          timeoutId = globalScope.setTimeout(step, 16);
        };
        timeoutId = globalScope.setTimeout(step, 0);
      });
    }

    function runBehaviorAnimationNode(proxyTarget, node, propertyName, previous, requestedValue, animation, token) {
      if (token.cancelled) {
        return Promise.resolve();
      }
      const item = animation || { type: "property" };
      if (item.type === "property") {
        return runPropertyAnimationNode(proxyTarget, node, propertyName, previous, requestedValue, item, token);
      }
      if (item.type === "script") {
        return runBehaviorScriptAction(proxyTarget, node, item);
      }
      const children = Array.isArray(item.children) ? item.children : [];
      if (item.type === "async") {
        return Promise.all(children.map((child) => runBehaviorAnimationNode(proxyTarget, node, propertyName, previous, requestedValue, child, token))).then(() => undefined);
      }
      if (item.type === "queued") {
        return children.reduce(
          (chain, child) => chain.then(() => runBehaviorAnimationNode(proxyTarget, node, propertyName, previous, requestedValue, child, token)),
          Promise.resolve()
        );
      }
      return Promise.resolve();
    }

    function startPropertyBehavior(proxyTarget, node, propertyName, previous, nextValue, rule) {
      const animation = firstBehaviorAnimationNode(rule);
      if (!proxyTarget.__qhtmlActiveBehaviors) {
        defineHidden(proxyTarget, "__qhtmlActiveBehaviors", Object.create(null));
      }
      const active = proxyTarget.__qhtmlActiveBehaviors[propertyName];
      if (active && typeof active.cancel === "function") {
        active.cancel();
      }

      const token = {
        cancelled: false,
        cancelFns: []
      };
      proxyTarget.__qhtmlActiveBehaviors[propertyName] = {
        cancel() {
          token.cancelled = true;
          for (const cancel of token.cancelFns.splice(0)) {
            cancel();
          }
        }
      };

      if (startNativeBehaviorGroup(proxyTarget, node, propertyName, previous, nextValue, animation, token)) {
        return true;
      }

      runBehaviorAnimationNode(proxyTarget, node, propertyName, previous, nextValue, animation, token).then(() => {
        if (token.cancelled) {
          return;
        }
        delete proxyTarget.__qhtmlActiveBehaviors[propertyName];
        const finalValue = readProperty(node, propertyName);
        if (finalValue == null || typeof finalValue === "undefined") {
          writeProperty(node, propertyName, nextValue);
        }
        notifyPropertyChanged(proxyTarget, node, propertyName, readProperty(node, propertyName), previous);
      });
      return true;
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
          return connectSignal(node, signalName, callback);
        };
      }
      if (name === "disconnect") {
        return function disconnect(connectionId) {
          return callMaybe(node, "disconnect", [connectionId], false);
        };
      }
      if (name === "emit") {
        return function emit(signalName, payload) {
          emitSignal(node, signalName, payload);
        };
      }
      if (name === "connectAnySignal") {
        return function connectAnySignal(callback) {
          return connectSignal(node, QHTML_SIGNAL_DISPATCHED, callback);
        };
      }
      if (name === "connectAnyProperty") {
        return function connectAnyProperty(callback) {
          return connectSignal(node, QHTML_PROPERTY_DISPATCHED, callback);
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
      let proxy;
      proxy = new Proxy(target, {
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
          if (key.indexOf("__qhtml") === 0) {
            proxyTarget[key] = value;
            return true;
          }
          const previous = readProperty(node, key);
          const rules = proxyTarget.__qhtmlBehaviorRules && typeof proxyTarget.__qhtmlBehaviorRules === "object"
            ? proxyTarget.__qhtmlBehaviorRules
            : null;
          if (!proxyTarget.__qhtmlBehaviorBypass && rules && rules[key]) {
            startPropertyBehavior(proxyTarget, node, key, previous, value, rules[key]);
            return true;
          }
          setProxyBackedProperty(proxyTarget, node, key, value, previous, true);
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
      defineHidden(target, "__qhtmlProxy", proxy);
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
          const previous = readProperty(node, name);
          writeProperty(node, name, value);
          emitPropertyChanged(node, name, value, previous);
          return facade;
        },
        propertyJson(name) {
          return propertyJson(node, name);
        },
        propertyKeys() {
          return parseJson(callMaybe(node, "propertyKeys", [], "[]"), []);
        },
        connect(signalName, callback) {
          return connectSignal(node, signalName, callback);
        },
        disconnect(connectionId) {
          return callMaybe(node, "disconnect", [connectionId], false);
        },
        emit(signalName, payload) {
          emitSignal(node, signalName, payload);
          return facade;
        },
        dispatchSignal(signalName, payload) {
          emitSignal(node, signalName, payload);
          return facade;
        },
        dispatchPropertyChanged(name, value, previous) {
          emitPropertyChanged(node, name, value, previous);
          return facade;
        },
        connectAnySignal(callback) {
          return connectSignal(node, QHTML_SIGNAL_DISPATCHED, callback);
        },
        connectAnyProperty(callback) {
          return connectSignal(node, QHTML_PROPERTY_DISPATCHED, callback);
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

    function createQtSignalFacade(owner, signalName, normalizePayload) {
      const name = normalizeName(signalName);
      return {
        connect(callback) {
          if (!owner || !name || typeof callback !== "function") {
            return 0;
          }
          return callMaybe(owner, "connect", [name, function qhtmlWasmSignalCallback(payload) {
            callback(normalizePayload ? normalizePayload(payload) : payload);
          }], 0);
        },
        disconnect(connectionId) {
          return callMaybe(owner, "disconnect", [connectionId], false);
        },
        emit(payload) {
          callMaybe(owner, "emit", [name, normalizePayload ? normalizePayload(payload) : payload]);
          return this;
        }
      };
    }

    function normalizeClassName(typeName) {
      return normalizeName(typeName).toLowerCase();
    }

    function createRuntimeSignalDispatcher(peerNode) {
      const channels = new Map();
      let nextConnectionId = 1;
      let blocked = false;
      let peer = null;
      let peerConnectionId = 0;
      const bridgeId = "qhtml-js-" + String(nextSignalBridgeId++);
      const object = typeof Module.QObject === "function" ? new Module.QObject() : null;

      function localConnect(signalName, callback) {
        const signal = normalizeName(signalName);
        if (!signal || typeof callback !== "function") {
          return 0;
        }
        if (object && typeof object.connect === "function") {
          return object.connect(signal, callback);
        }
        const id = nextConnectionId++;
        if (!channels.has(signal)) {
          channels.set(signal, new Map());
        }
        channels.get(signal).set(id, callback);
        return id;
      }

      function localDisconnect(connectionId) {
        if (object && typeof object.disconnect === "function" && object.disconnect(connectionId)) {
          return true;
        }
        for (const listeners of channels.values()) {
          if (listeners.delete(connectionId)) {
            return true;
          }
        }
        return false;
      }

      function localEmit(signalName, payload) {
        const signal = normalizeName(signalName);
        if (!signal) {
          return;
        }
        if (object && typeof object.emit === "function") {
          object.emit(signal, payload);
          return;
        }
        const listeners = channels.get(signal);
        if (!listeners) {
          return;
        }
        for (const callback of listeners.values()) {
          callback(payload);
        }
      }

      function attachPeer(nextPeer) {
        const handle = nextPeer && typeof nextPeer.qdom === "function"
          ? nextPeer.qdom().handle
          : nextPeer && nextPeer.handle
            ? nextPeer.handle
            : nextPeer;
        if (peer && peerConnectionId) {
          callMaybe(peer, "disconnect", [peerConnectionId], false);
        }
        peer = handle || null;
        peerConnectionId = 0;
        if (peer) {
          peerConnectionId = connectSignal(peer, QHTML_SIGNAL_DISPATCHED, function qhtmlWasmRuntimePeerSignal(event) {
            const signal = normalizeName(event && (event.signalName || event.name));
            if (!signal) {
              return;
            }
            const payload = event && Object.prototype.hasOwnProperty.call(event, "payload")
              ? event.payload
              : event && Object.prototype.hasOwnProperty.call(event, "value")
                ? event.value
                : event;
            localEmit(signal, payload);
          });
        }
        return api;
      }

      const api = {
        object,
        bridgeId,
        peer() {
          return peer;
        },
        attachPeer,
        blockSignals(value) {
          const previous = blocked;
          blocked = coerceBoolean(value, blocked);
          if (object && typeof object.blockSignals === "function") {
            return object.blockSignals(blocked);
          }
          return previous;
        },
        signalsBlocked() {
          if (object && typeof object.signalsBlocked === "function") {
            return object.signalsBlocked() === true;
          }
          return blocked === true;
        },
        connect(signalName, callback) {
          return localConnect(signalName, callback);
        },
        disconnect(connectionId) {
          return localDisconnect(connectionId);
        },
        emit(signalName, payload) {
          if (this.signalsBlocked()) {
            return;
          }
          const signal = normalizeName(signalName);
          if (!signal) {
            return;
          }
          if (peer) {
            const eventPayload = payload && typeof payload === "object" && !Array.isArray(payload)
              ? Object.assign({ bridgeId, origin: "qclass" }, payload)
              : payload;
            emitSignal(peer, signal, eventPayload);
          } else {
            localEmit(signal, payload);
          }
        }
      };

      attachPeer(peerNode);
      return api;
    }

    function attachRuntimeSignalBridge(instance, peerNode, options) {
      if (!instance || (typeof instance !== "object" && typeof instance !== "function")) {
        return instance;
      }
      const opts = options && typeof options === "object" ? options : {};
      let dispatcher = instance.__qhtmlSignalDispatcher || null;
      if (!dispatcher) {
        dispatcher = createRuntimeSignalDispatcher(peerNode || null);
        defineHidden(instance, "__qhtmlSignalDispatcher", dispatcher);
      } else if (peerNode && typeof dispatcher.attachPeer === "function") {
        dispatcher.attachPeer(peerNode);
      }
      if (!Object.prototype.hasOwnProperty.call(instance, "handle") || instance.handle == null) {
        instance.handle = dispatcher.object || (dispatcher.peer && dispatcher.peer()) || null;
      }
      if (typeof instance.qobject !== "function") {
        defineHidden(instance, "qobject", function qhtmlRuntimeClassQObject() {
          return dispatcher.object || (typeof dispatcher.peer === "function" ? dispatcher.peer() : null);
        });
      }
      defineHidden(instance, "__qhtmlAttachSignalNode", function qhtmlAttachSignalNode(nextPeer) {
        if (typeof dispatcher.attachPeer === "function") {
          dispatcher.attachPeer(nextPeer);
        }
        return instance;
      });
      instance.connect = function qhtmlRuntimeClassConnect(signalName, callback) {
        return dispatcher.connect(signalName, callback);
      };
      instance.disconnect = function qhtmlRuntimeClassDisconnect(connectionId) {
        return dispatcher.disconnect(connectionId);
      };
      instance.blockSignals = function qhtmlRuntimeClassBlockSignals(value) {
        return dispatcher.blockSignals(value);
      };
      instance.signalsBlocked = function qhtmlRuntimeClassSignalsBlocked() {
        return dispatcher.signalsBlocked();
      };
      instance.emit = function qhtmlRuntimeClassEmit(signalName, payload) {
        dispatcher.emit(signalName, payload);
        return instance;
      };
      instance.dispatchSignal = instance.emit;
      instance.property = function qhtmlRuntimeClassProperty(propertyName) {
        return instance[normalizeName(propertyName)];
      };
      instance.setProperty = function qhtmlRuntimeClassSetProperty(propertyName, value) {
        const key = normalizeName(propertyName);
        if (!key) {
          return instance;
        }
        const previous = instance[key];
        instance[key] = value;
        instance.dispatchPropertyChanged(key, instance[key], previous);
        return instance;
      };
      instance.dispatchPropertyChanged = function qhtmlRuntimeClassDispatchProperty(propertyName, value, previous) {
        const key = normalizeName(propertyName);
        const payload = {
          propertyName: key,
          value,
          previous,
          object: instance
        };
        dispatcher.emit(key + "Changed", payload);
        return instance;
      };
      instance.defineDispatchedProperty = function qhtmlRuntimeClassDefineProperty(propertyName, initialValue) {
        const key = normalizeName(propertyName);
        if (!key) {
          return instance;
        }
        const storage = "__qhtmlProperty_" + key;
        if (!Object.prototype.hasOwnProperty.call(instance, storage)) {
          defineHidden(instance, storage, initialValue);
        }
        Object.defineProperty(instance, key, {
          configurable: true,
          enumerable: true,
          get() {
            return instance[storage];
          },
          set(nextValue) {
            const previous = instance[storage];
            instance[storage] = nextValue;
            instance.dispatchPropertyChanged(key, nextValue, previous);
          }
        });
        return instance;
      };

      const signals = Array.isArray(opts.signals) ? opts.signals : [];
      for (const signalName of signals) {
        const signal = normalizeName(signalName);
        if (!signal || Object.prototype.hasOwnProperty.call(instance, signal)) {
          continue;
        }
        const signalFunction = function qhtmlRuntimeClassDeclaredSignal(payload) {
          instance.emit(signal, payload);
          return instance;
        };
        signalFunction.connect = function connectRuntimeClassDeclaredSignal(callback) {
          return instance.connect(signal, callback);
        };
        signalFunction.disconnect = function disconnectRuntimeClassDeclaredSignal(connectionId) {
          return instance.disconnect(connectionId);
        };
        signalFunction.emit = function emitRuntimeClassDeclaredSignal(payload) {
          return instance.emit(signal, payload);
        };
        instance[signal] = signalFunction;
      }
      return instance;
    }

    function defineRuntimeClass(typeName, definition) {
      const key = normalizeClassName(typeName);
      if (!key) {
        return null;
      }
      const normalized = Object.assign({
        name: key,
        signals: [],
        properties: {},
        methods: {}
      }, definition || {});
      runtimeClasses.set(key, normalized);
      return normalized;
    }

    function createRuntimeClassInstance(typeName, name, args, options) {
      const key = normalizeClassName(typeName);
      const definition = runtimeClasses.get(key);
      if (!definition) {
        return null;
      }

      const opts = options && typeof options === "object" ? options : {};
      const signalDispatcher = createRuntimeSignalDispatcher(opts.qdomNode || opts.node || null);
      const state = Object.create(null);
      const instance = {
        __qhtmlRuntimeClass: key,
        __qhtmlClassDefinition: definition,
        __qhtmlProperties: state,
        name: normalizeName(name || opts.name || ""),
        handle: signalDispatcher.object,
        qobject() {
          return signalDispatcher.object;
        },
        connect(signalName, callback) {
          return signalDispatcher.connect(signalName, callback);
        },
        disconnect(connectionId) {
          return signalDispatcher.disconnect(connectionId);
        },
        blockSignals(value) {
          const previous = signalDispatcher.blockSignals(value);
          if (instance.timerObject && typeof instance.timerObject.blockSignals === "function") {
            instance.timerObject.blockSignals(signalDispatcher.signalsBlocked());
          }
          return previous;
        },
        signalsBlocked() {
          return signalDispatcher.signalsBlocked();
        },
        emit(signalName, payload) {
          signalDispatcher.emit(signalName, payload);
          return instance;
        },
        property(propertyName) {
          return state[normalizeName(propertyName)];
        },
        setProperty(propertyName, value) {
          const keyName = normalizeName(propertyName);
          if (keyName) {
            instance[keyName] = value;
          }
          return instance;
        }
      };

      const signals = Array.isArray(definition.signals) ? definition.signals : [];
      defineHidden(instance, "__qhtmlSignalDispatcher", signalDispatcher);
      attachRuntimeSignalBridge(instance, opts.qdomNode || opts.node || null, { signals });
      for (const signalName of signals) {
        const signal = normalizeName(signalName);
        if (!signal || Object.prototype.hasOwnProperty.call(instance, signal)) {
          continue;
        }
        const signalFunction = function runtimeClassSignal(payload) {
          instance.emit(signal, payload);
          return instance;
        };
        signalFunction.connect = function connectRuntimeClassSignal(callback) {
          return instance.connect(signal, callback);
        };
        signalFunction.disconnect = function disconnectRuntimeClassSignal(connectionId) {
          return instance.disconnect(connectionId);
        };
        signalFunction.emit = function emitRuntimeClassSignal(payload) {
          return instance.emit(signal, payload);
        };
        instance[signal] = signalFunction;
      }

      const methods = definition.methods && typeof definition.methods === "object" ? definition.methods : {};
      for (const [methodName, method] of Object.entries(methods)) {
        const keyName = normalizeName(methodName);
        if (keyName && typeof method === "function") {
          instance[keyName] = method.bind(instance);
        }
      }

      const properties = definition.properties && typeof definition.properties === "object" ? definition.properties : {};
      for (const [propertyName, descriptor] of Object.entries(properties)) {
        const keyName = normalizeName(propertyName);
        if (!keyName) {
          continue;
        }
        const spec = descriptor && typeof descriptor === "object" ? descriptor : { value: descriptor };
        state[keyName] = typeof spec.value === "function" ? spec.value.call(instance, opts) : spec.value;
        Object.defineProperty(instance, keyName, {
          configurable: true,
          enumerable: true,
          get() {
            return state[keyName];
          },
          set(nextValue) {
            const previous = state[keyName];
            state[keyName] = typeof spec.coerce === "function" ? spec.coerce.call(instance, nextValue, previous) : nextValue;
            if (typeof instance.dispatchPropertyChanged === "function") {
              instance.dispatchPropertyChanged(keyName, state[keyName], previous);
            }
            const changed = typeof spec.changed === "function"
              ? spec.changed
              : typeof instance["on" + keyName + "Changed"] === "function"
                ? instance["on" + keyName + "Changed"]
                : null;
            if (changed) {
              changed.call(instance, state[keyName], previous);
            }
          }
        });
      }

      if (typeof definition.constructor === "function") {
        definition.constructor.apply(instance, Array.isArray(args) ? args : [opts]);
      }

      for (const [propertyName, value] of Object.entries(opts)) {
        if (propertyName === "name") {
          continue;
        }
        if (Object.prototype.hasOwnProperty.call(instance, propertyName)) {
          instance[propertyName] = value;
        }
      }

      if (typeof definition.created === "function") {
        definition.created.call(instance, opts);
      }

      return instance;
    }

    function installBuiltInRuntimeClasses() {
      if (runtimeClasses.has("q-timer")) {
        return;
      }

      defineRuntimeClass("q-timer", {
        signals: ["timeout"],
        properties: {
          interval: {
            value: 1000,
            coerce(value, previous) {
              return Math.max(0, Math.floor(coerceNumber(value, previous == null ? 1000 : previous)));
            },
            changed(value) {
              if (this.timerObject && typeof this.timerObject.setInterval === "function") {
                this.timerObject.setInterval(value);
              }
            }
          },
          repeat: {
            value: true,
            coerce(value, previous) {
              return coerceBoolean(value, previous == null ? true : previous);
            },
            changed(value) {
              if (this.timerObject && typeof this.timerObject.setSingleShot === "function") {
                this.timerObject.setSingleShot(!value);
              }
            }
          },
          running: {
            value: false,
            coerce(value) {
              return coerceBoolean(value, false);
            },
            changed(value) {
              if (value) {
                this.start();
              } else {
                this.stop();
              }
            }
          }
        },
        constructor() {
          if (typeof Module.QTimer !== "function") {
            throw new Error("QHTML WASM q-timer requires Module.QTimer");
          }
          this.timerObject = new Module.QTimer();
          this.handle = this.timerObject;
          if (this.name && typeof this.timerObject.setObjectName === "function") {
            this.timerObject.setObjectName(this.name);
          }
          const timerInstance = this;
          this.timerObject.connect("timeout", function qhtmlWasmTimerTimeout(payload) {
            timerInstance.handleTimeout(payload);
          });
          this.timerObject.setInterval(this.interval);
          this.timerObject.setSingleShot(!this.repeat);
        },
        methods: {
          createTimeoutPayload(payload) {
            if (payload && typeof payload === "object") {
              return payload;
            }
            return {
              type: "timeout",
              timerId: this.name,
              name: this.name,
              timer: this
            };
          },
          handleTimeout(payload) {
            if (this.repeat === false && this.__qhtmlProperties) {
              this.__qhtmlProperties.running = false;
            }
            this.timeout(this.createTimeoutPayload(payload));
          },
          start(nextInterval) {
            if (nextInterval != null) {
              this.interval = nextInterval;
            }
            callMaybe(this.timerObject, "start", []);
            if (this.__qhtmlProperties) {
              this.__qhtmlProperties.running = true;
            }
            return this;
          },
          stop() {
            callMaybe(this.timerObject, "stop", []);
            if (this.__qhtmlProperties) {
              this.__qhtmlProperties.running = false;
            }
            return this;
          },
          restart(nextInterval) {
            this.stop();
            return this.start(nextInterval);
          },
          isActive() {
            return callMaybe(this.timerObject, "isActive", [], false) === true;
          },
          objectName() {
            return callMaybe(this.timerObject, "objectName", [], this.name);
          },
          setObjectName(nextName) {
            this.name = normalizeName(nextName);
            callMaybe(this.timerObject, "setObjectName", [this.name]);
            return this;
          },
          qobject() {
            return this.timerObject;
          },
          valueOf() {
            return this.interval;
          },
          toString() {
            return String(this.interval);
          }
        }
      });
    }

    function createTimerHandle(name, options) {
      const classInstance = createRuntimeClassInstance("q-timer", name, [], options);
      if (classInstance) {
        Object.defineProperty(classInstance, "duration", {
          configurable: true,
          enumerable: true,
          get() {
            return classInstance.interval;
          },
          set(nextValue) {
            classInstance.interval = nextValue;
          }
        });
        return classInstance;
      }

      if (typeof Module.QTimer !== "function") {
        throw new Error("QHTML WASM q-timer requires Module.QTimer");
      }

      const opts = options && typeof options === "object" ? options : {};
      const timer = new Module.QTimer();
      const timerName = normalizeName(name || opts.name || "");
      let duration = Math.max(0, Math.floor(coerceNumber(opts.duration != null ? opts.duration : opts.interval, 1000)));
      let repeat = coerceBoolean(opts.repeat, true);
      const handle = {
        handle: timer,
        qobject() {
          return timer;
        },
        objectName() {
          return callMaybe(timer, "objectName", [], timerName);
        },
        setObjectName(nextName) {
          callMaybe(timer, "setObjectName", [String(nextName || "")]);
          return handle;
        },
        start(nextDuration) {
          if (nextDuration != null) {
            handle.duration = nextDuration;
          }
          callMaybe(timer, "start", []);
          return handle;
        },
        stop() {
          callMaybe(timer, "stop", []);
          return handle;
        },
        restart(nextDuration) {
          handle.stop();
          return handle.start(nextDuration);
        },
        isActive() {
          return callMaybe(timer, "isActive", [], false) === true;
        },
        connect(signalName, callback) {
          const signal = normalizeName(signalName);
          if (signal === "timeout" && typeof callback === "function") {
            return callMaybe(timer, "connect", [signal, function qhtmlWasmTimerTimeout(payload) {
              callback(handle.createTimeoutPayload(payload));
            }], 0);
          }
          return callMaybe(timer, "connect", [signal, callback], 0);
        },
        disconnect(connectionId) {
          return callMaybe(timer, "disconnect", [connectionId], false);
        },
        emit(signalName, payload) {
          const signal = normalizeName(signalName);
          callMaybe(timer, "emit", [signal, signal === "timeout" ? handle.createTimeoutPayload(payload) : payload]);
          return handle;
        },
        createTimeoutPayload(payload) {
          if (payload && typeof payload === "object") {
            return payload;
          }
          return {
            type: "timeout",
            timerId: timerName,
            name: timerName,
            timer: handle
          };
        },
        valueOf() {
          return duration;
        },
        toString() {
          return String(duration);
        }
      };

      Object.defineProperty(handle, "name", {
        configurable: true,
        enumerable: true,
        get() {
          return timerName;
        }
      });
      Object.defineProperty(handle, "duration", {
        configurable: true,
        enumerable: true,
        get() {
          return coerceNumber(callMaybe(timer, "interval", [], duration), duration);
        },
        set(nextValue) {
          duration = Math.max(0, Math.floor(coerceNumber(nextValue, duration)));
          callMaybe(timer, "setInterval", [duration]);
        }
      });
      Object.defineProperty(handle, "interval", {
        configurable: true,
        enumerable: true,
        get() {
          return handle.duration;
        },
        set(nextValue) {
          handle.duration = nextValue;
        }
      });
      Object.defineProperty(handle, "repeat", {
        configurable: true,
        enumerable: true,
        get() {
          return !callMaybe(timer, "isSingleShot", [], !repeat);
        },
        set(nextValue) {
          repeat = coerceBoolean(nextValue, repeat);
          callMaybe(timer, "setSingleShot", [!repeat]);
        }
      });
      Object.defineProperty(handle, "running", {
        configurable: true,
        enumerable: true,
        get() {
          return handle.isActive();
        },
        set(nextValue) {
          if (coerceBoolean(nextValue, false)) {
            handle.start();
          } else {
            handle.stop();
          }
        }
      });
      Object.defineProperty(handle, "timeout", {
        configurable: true,
        enumerable: true,
        get() {
          return createQtSignalFacade(timer, "timeout", handle.createTimeoutPayload);
        }
      });

      if (timerName) {
        callMaybe(timer, "setObjectName", [timerName]);
      }
      handle.duration = duration;
      handle.repeat = repeat;
      if (coerceBoolean(opts.running, false)) {
        handle.start();
      }
      return handle;
    }

    installBuiltInRuntimeClasses();

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
      installBehaviorRules(contextValue, rules) {
        if (!contextValue || typeof contextValue !== "object") {
          return contextValue;
        }
        defineHidden(contextValue, "__qhtmlBehaviorRules", rules && typeof rules === "object" ? rules : Object.create(null));
        return contextValue;
      },
      enqueueSignal,
      connectSignal,
      emitSignal,
      emitPropertyChanged,
      createContextValue,
      createQVarHandle,
      parseQVarRaw,
      parseTimerRaw,
      defineRuntimeClass,
      createRuntimeClassInstance,
      attachRuntimeSignalBridge,
      createTimerHandle,
      signalDispatchedName: QHTML_SIGNAL_DISPATCHED,
      propertyDispatchedName: QHTML_PROPERTY_DISPATCHED,
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
