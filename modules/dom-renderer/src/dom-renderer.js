(function attachDomRenderer(global) {
  const modules = global.QHtmlModules || (global.QHtmlModules = {});
  const core = modules.qdomCore;
  const parser = modules.qhtmlParser;
  const RENDER_SLOT_REF = typeof Symbol === "function" ? Symbol("qhtml.render.slotRef") : "__qhtmlRenderSlotRef__";
  const RENDER_SLOT_CONTEXT = typeof Symbol === "function" ? Symbol("qhtml.render.slotContext") : "__qhtmlRenderSlotContext__";

  if (!core) {
    throw new Error("dom-renderer requires qdom-core to be loaded first.");
  }

  const INVALID_METHOD_NAMES = new Set(["constructor", "prototype", "__proto__"]);
  const COMPONENT_PROP_STATE_KEY = "__qhtmlDeclaredPropertyState";
  const QLOGGER_META_KEY = "__qhtmlLoggerCategories";
  const QDOM_UUID_META_KEY = typeof core.QDOM_UUID_KEY === "string" ? core.QDOM_UUID_KEY : "uuid";
  const QINSTANCE_ALIAS_META_KEY = "__qhtmlInstanceAlias";
  const QCONTEXT_SCOPE_FRAME_KEY = "__qhtmlScopeFrame";
  const QCONTEXT_RUNTIME_FRAME_KEY = "__qhtmlContextFrame";
  const QCONTEXT_SYMBOL_HANDLE_FLAG = "__qhtmlContextSymbolHandle";
  const QCONTEXT_SYMBOL_UUID_KEY = "__qhtmlContextSymbolUuid";
  const QCONTEXT_SYMBOL_KIND_KEY = "__qhtmlContextSymbolKind";
  const QCONTEXT_SYMBOL_HEAD_ONLY_KEY = "__qhtmlContextSymbolHeadOnly";
  const QCONTEXT_OWNER_TYPE_NAME_KEY = "__qhtmlContextOwnerTypeName";
  const QCONTEXT_OWNER_PARENT_HANDLE_KEY = "__qhtmlContextOwnerParentHandle";
  const Q_VAR_NODE_KIND = "q-var";
  const Q_SWITCH_NODE_KIND = "q-switch";
  const Q_TIMER_NODE_KIND = "q-timer";
  const QHTML_QVAR_HANDLE_FLAG = "__qhtmlVarHandle";
  const Q_MODEL_VIEW_INSTANCE_ATTR = "q-model-view-instance";
  const Q_MODEL_VIEW_SCOPE_TAG = "q-model-view-scope";
  const QHTML_CONTENT_LOADED_EVENT = "QHTMLContentLoaded";
  const Q_CALLBACK_NODE_KIND = "callback";
  const QHTML_FRAGMENT_MARKER = "__qhtmlFragment";
  const QHTML_NAMED_CALLBACKS_KEY = "__qhtmlNamedCallbacks";
  const QHTML_PAINTER_REGISTRY_KEY = "__qhtmlPainterRegistry";
  const QHTML_PAINTER_SCOPE_KEY = "__qhtmlPainterScopeId";
  const QHTML_PATH_ANIMATION_STYLE_KEY = "__qhtmlPathAnimationStyleNames";
  const INLINE_REFERENCE_PATTERN = /\$\{\s*([^}]+?)\s*\}/g;
  const INLINE_REFERENCE_ESCAPE_TOKEN = "__QHTML_ESCAPED_INLINE_REF__";
  const Q_SIGNAL_META_KEY = "__qhtmlSignalMeta";
  const Q_PROPERTY_INSTANCES_KEY = "__qhtmlPropertyInstances";
  const Q_PROPERTY_META_KEY = "__qhtmlPropertyMeta";
  const Q_PROPERTY_MODEL_LISTENER_STORE_KEY = "__qhtmlDeclaredPropertyModelListeners";
  const Q_COMPONENT_INSTANCE_META_KEY = "__qhtmlComponentInstanceMeta";
  const Q_COMPONENT_TIMER_STORE_KEY = "__qhtmlComponentTimers";
  const WASM_DEFAULT_TIMEOUT_MS = 15000;
  const WASM_DEFAULT_MAX_PAYLOAD_BYTES = 1024 * 1024;
  let qdomInstanceCounter = 0;
  const qdomInstanceIds = new WeakMap();
  const qdomSlotOwnerIds = new WeakMap();
  let wasmWorkerScriptUrl = null;
  let qWorkerExecutorScriptUrl = null;
  const qWorkerRuntimeRegistryFallback = new Map();
  const qPainterRuntimeRegistryFallback = new Map();
  const qPainterScopeIds = new WeakMap();
  let qPainterScopeCounter = 0;
  let qPainterSupportWarningShown = false;
  const Q_WORKER_IDLE_TERMINATE_MS = 30000;
  let qWorkerFallbackRuntimeCounter = 0;
  let wasmCallSequence = 0;
  const qVarRuntimeStateByUuid = new Map();
  const qAnchorBindings = typeof WeakMap === "function" ? new WeakMap() : null;
  const qAnchorBindingList = [];
  const qAnchorListenerDocuments = typeof WeakSet === "function" ? new WeakSet() : null;
  let qAnchorApplyScheduled = false;
  const CSS_DIMENSIONAL_PROPERTIES = new Set([
    "width",
    "height",
    "minwidth",
    "minheight",
    "maxwidth",
    "maxheight",
    "left",
    "right",
    "top",
    "bottom",
    "margin",
    "margintop",
    "marginright",
    "marginbottom",
    "marginleft",
    "padding",
    "paddingtop",
    "paddingright",
    "paddingbottom",
    "paddingleft",
    "fontsize",
    "borderradius",
    "borderwidth",
  ]);
  const qBehaviorRegistry = typeof WeakMap === "function" ? new WeakMap() : null;
  const qBehaviorCommitBypass = typeof WeakMap === "function" ? new WeakMap() : null;
  const qBehaviorInterceptors = typeof WeakMap === "function" ? new WeakMap() : null;
  const CSS_NUMERIC_VALUE_PATTERN = /^(-?(?:\d+|\d*\.\d+))(px|%|em|rem|vh|vw|vmin|vmax|svh|lvh|dvh|svw|lvw|dvw|ch|ex|cm|mm|in|pt|pc|q)?$/i;

  class QSignal {
    connect(handler) {
      const meta = this && this[Q_SIGNAL_META_KEY] && typeof this[Q_SIGNAL_META_KEY] === "object"
        ? this[Q_SIGNAL_META_KEY]
        : null;
      if (!meta || typeof meta.connectImpl !== "function") {
        return null;
      }
      return meta.connectImpl(handler);
    }
    disconnect(handler) {
      const meta = this && this[Q_SIGNAL_META_KEY] && typeof this[Q_SIGNAL_META_KEY] === "object"
        ? this[Q_SIGNAL_META_KEY]
        : null;
      if (!meta || typeof meta.disconnectImpl !== "function") {
        return false;
      }
      return meta.disconnectImpl(handler);
    }
    emit() {
      const meta = this && this[Q_SIGNAL_META_KEY] && typeof this[Q_SIGNAL_META_KEY] === "object"
        ? this[Q_SIGNAL_META_KEY]
        : null;
      if (!meta || typeof meta.emitImpl !== "function") {
        return undefined;
      }
      return meta.emitImpl.apply(meta.owner || null, arguments);
    }
    get name() {
      const meta = this && this[Q_SIGNAL_META_KEY] && typeof this[Q_SIGNAL_META_KEY] === "object"
        ? this[Q_SIGNAL_META_KEY]
        : null;
      return meta ? String(meta.name || "") : "";
    }
    get owner() {
      const meta = this && this[Q_SIGNAL_META_KEY] && typeof this[Q_SIGNAL_META_KEY] === "object"
        ? this[Q_SIGNAL_META_KEY]
        : null;
      return meta ? meta.owner || null : null;
    }
  }

  class QProperty {
    constructor(owner, name) {
      this.owner = owner && typeof owner === "object" ? owner : null;
      this.name = String(name || "").trim();
      this[Q_PROPERTY_META_KEY] = true;
    }
    get value() {
      if (!this.owner || !this.name) {
        return undefined;
      }
      return this.owner[this.name];
    }
    set value(next) {
      if (!this.owner || !this.name) {
        return;
      }
      this.owner[this.name] = next;
    }
    get() {
      return this.value;
    }
    set(next) {
      this.value = next;
      return this.value;
    }
  }

  class QComponentInstance {
    constructor(host, componentNode) {
      this.host = host && host.nodeType === 1 ? host : null;
      this.componentId = String(componentNode && componentNode.componentId || this.host && this.host.tagName || "").trim().toLowerCase();
      this.definitionType = inferDefinitionType(componentNode);
    }
    get uuid() {
      return this.host ? String(readHostQDomUuid(this.host) || "").trim() : "";
    }
    property(name) {
      const key = String(name || "").trim();
      if (!this.host || !key) {
        return null;
      }
      const map = this.host[Q_PROPERTY_INSTANCES_KEY];
      return map && typeof map === "object" && map[key] instanceof QProperty ? map[key] : null;
    }
    signal(name) {
      const key = String(name || "").trim();
      if (!this.host || !key) {
        return null;
      }
      const value = this.host[key];
      return value instanceof QSignal ? value : null;
    }
  }

  class QVar {
    constructor(state) {
      this.__qhtmlVarState = state && typeof state === "object" ? state : null;
      this[QHTML_QVAR_HANDLE_FLAG] = true;
    }
    get name() {
      return this.__qhtmlVarState ? String(this.__qhtmlVarState.name || "") : "";
    }
    get uuid() {
      return this.__qhtmlVarState ? String(this.__qhtmlVarState.uuid || "") : "";
    }
    get value() {
      return readQVarStateValue(this.__qhtmlVarState);
    }
    set value(next) {
      assignQVarStateValue(this.__qhtmlVarState, next);
    }
    get changed() {
      return this.__qhtmlVarState ? this.__qhtmlVarState.changed : null;
    }
    get() {
      return this.value;
    }
    set(next) {
      this.value = next;
      return this.value;
    }
    toString() {
      const value = this.value;
      return String(value == null ? "" : value);
    }
    valueOf() {
      return this.value;
    }
    [Symbol.toPrimitive]() {
      return this.value;
    }
  }

  function isQVarHandle(value) {
    return !!(value && (typeof value === "object" || typeof value === "function") && value[QHTML_QVAR_HANDLE_FLAG] === true);
  }

  function readQVarHandleValue(value) {
    if (!isQVarHandle(value)) {
      return value;
    }
    try {
      return readQVarStateValue(value.__qhtmlVarState);
    } catch (error) {
      return undefined;
    }
  }

  function readQVarStateValue(state) {
    if (!state || typeof state !== "object") {
      return undefined;
    }
    if (state.initialized) {
      return state.value;
    }
    if (state.evaluating) {
      return state.value;
    }
    state.evaluating = true;
    try {
      state.value = evaluateQVarBody(state.node, state.owner, state.context);
      state.initialized = true;
      return state.value;
    } finally {
      state.evaluating = false;
    }
  }

  function assignQVarStateValue(state, next) {
    if (!state || typeof state !== "object") {
      return undefined;
    }
    if (isQVarHandle(next) && next.__qhtmlVarState === state) {
      if (state.initialized && state.value === next) {
        state.value = undefined;
        state.previousValue = undefined;
        state.initialized = false;
        state.evaluating = false;
      }
      return readQVarStateValue(state);
    }
    const previous = state.initialized ? state.value : undefined;
    state.previousValue = previous;
    state.value = next;
    state.initialized = true;
    state.evaluating = false;
    if (!Object.is(previous, next) && state.changed && typeof state.changed.emit === "function") {
      state.changed.emit(next, previous, true);
    }
    return state.value;
  }

  function createQVarSignal(name, owner) {
    const listeners = [];
    const signal = createQSignalInstance(name, owner, function emitQVarSignal() {
      const args = Array.prototype.slice.call(arguments);
      const snapshot = listeners.slice();
      for (let i = 0; i < snapshot.length; i += 1) {
        try {
          snapshot[i].apply(owner || null, args);
        } catch (error) {
          if (global.console && typeof global.console.error === "function") {
            global.console.error("qhtml q-var signal listener failed:", error);
          }
        }
      }
      return args[0];
    });
    const meta = signal && signal[Q_SIGNAL_META_KEY] && typeof signal[Q_SIGNAL_META_KEY] === "object"
      ? signal[Q_SIGNAL_META_KEY]
      : null;
    if (meta) {
      meta.connectImpl = function connectQVarChanged(handler) {
        if (typeof handler !== "function") {
          return null;
        }
        listeners.push(handler);
        return function disconnectQVarChanged() {
          const index = listeners.indexOf(handler);
          if (index >= 0) {
            listeners.splice(index, 1);
          }
        };
      };
      meta.disconnectImpl = function disconnectQVarChanged(handler) {
        const index = listeners.indexOf(handler);
        if (index < 0) {
          return false;
        }
        listeners.splice(index, 1);
        return true;
      };
    }
    return signal;
  }

  function createQVarHandle(state) {
    const base = function qVarCallableProxy() {
      const value = readQVarStateValue(state);
      if (typeof value === "function") {
        return value.apply(state && state.owner ? state.owner : null, arguments);
      }
      return value;
    };
    Object.setPrototypeOf(base, QVar.prototype);
    base.__qhtmlVarState = state;
    base[QHTML_QVAR_HANDLE_FLAG] = true;
    return new Proxy(base, {
      get: function getQVarProperty(target, prop) {
        if (
          prop === QHTML_QVAR_HANDLE_FLAG ||
          prop === "__qhtmlVarState" ||
          prop === "name" ||
          prop === "uuid" ||
          prop === "value" ||
          prop === "get" ||
          prop === "set" ||
          prop === "changed" ||
          prop === "toString" ||
          prop === "valueOf" ||
          prop === Symbol.toPrimitive
        ) {
          if (prop === QHTML_QVAR_HANDLE_FLAG) {
            return true;
          }
          if (prop === "__qhtmlVarState") {
            return state;
          }
          if (prop === "name") {
            return state ? String(state.name || "") : "";
          }
          if (prop === "uuid") {
            return state ? String(state.uuid || "") : "";
          }
          if (prop === "value") {
            return readQVarStateValue(state);
          }
          if (prop === "changed") {
            return state ? state.changed || null : null;
          }
          if (prop === "get") {
            return function getQVarProxyValue() {
              return readQVarStateValue(state);
            };
          }
          if (prop === "set") {
            return function setQVarProxyValue(next) {
              return assignQVarStateValue(state, next);
            };
          }
          if (prop === "toString") {
            return function qVarProxyToString() {
              const value = readQVarStateValue(state);
              return String(value == null ? "" : value);
            };
          }
          if (prop === "valueOf" || prop === Symbol.toPrimitive) {
            return function qVarProxyValueOf() {
              return readQVarStateValue(state);
            };
          }
          const ownValue = target[prop];
          return typeof ownValue === "function" ? Function.prototype.bind.call(ownValue, target) : ownValue;
        }
        const value = readQVarStateValue(state);
        if (value != null && (typeof value === "object" || typeof value === "function")) {
          const child = value[prop];
          return typeof child === "function" ? child.bind(value) : child;
        }
        return undefined;
      },
      set: function setQVarProperty(target, prop, next) {
        if (prop === "value") {
          assignQVarStateValue(state, next);
          return true;
        }
        const value = readQVarStateValue(state);
        if (value != null && (typeof value === "object" || typeof value === "function")) {
          value[prop] = next;
        }
        return true;
      },
    });
  }

  function createQSignalInstance(name, owner, emitImpl) {
    const signal = function qSignalCallable() {
      return signal.emit.apply(signal, arguments);
    };
    Object.setPrototypeOf(signal, QSignal.prototype);
    const meta = {
      name: String(name || "").trim(),
      owner: owner && owner.nodeType === 1 ? owner : null,
      emitImpl: typeof emitImpl === "function" ? emitImpl : null,
      connectImpl: null,
      disconnectImpl: null,
    };
    try {
      Object.defineProperty(signal, Q_SIGNAL_META_KEY, {
        configurable: true,
        enumerable: false,
        writable: true,
        value: meta,
      });
    } catch (error) {
      signal[Q_SIGNAL_META_KEY] = meta;
    }
    return signal;
  }

  function registerQPropertyInstance(owner, propertyName) {
    if (!owner || owner.nodeType !== 1) {
      return null;
    }
    const name = String(propertyName || "").trim();
    if (!name) {
      return null;
    }
    let map = owner[Q_PROPERTY_INSTANCES_KEY];
    if (!map || typeof map !== "object") {
      map = Object.create(null);
      try {
        Object.defineProperty(owner, Q_PROPERTY_INSTANCES_KEY, {
          configurable: true,
          enumerable: false,
          writable: true,
          value: map,
        });
      } catch (error) {
        owner[Q_PROPERTY_INSTANCES_KEY] = map;
      }
    }
    if (!(map[name] instanceof QProperty)) {
      map[name] = new QProperty(owner, name);
    }
    return map[name];
  }

  function registerQComponentInstanceType(hostElement, componentNode) {
    if (!hostElement || hostElement.nodeType !== 1) {
      return null;
    }
    let instance = hostElement[Q_COMPONENT_INSTANCE_META_KEY];
    if (!(instance instanceof QComponentInstance)) {
      instance = new QComponentInstance(hostElement, componentNode);
      try {
        Object.defineProperty(hostElement, Q_COMPONENT_INSTANCE_META_KEY, {
          configurable: true,
          enumerable: false,
          writable: true,
          value: instance,
        });
      } catch (error) {
        hostElement[Q_COMPONENT_INSTANCE_META_KEY] = instance;
      }
    }
    return instance;
  }

  function ensureComponentSelfReference(target) {
    if (!target || target.nodeType !== 1) {
      return null;
    }
    let existing = null;
    try {
      existing = target.component;
    } catch (ignoredReadComponentContextError) {
      existing = null;
    }
    if (existing && existing.nodeType === 1) {
      return existing;
    }
    let resolved = null;
    if (typeof target.getAttribute === "function" && target.getAttribute("qhtml-component-instance") === "1") {
      resolved = target;
    } else if (typeof target.closest === "function") {
      resolved = target.closest("[qhtml-component-instance='1']");
    }
    if (resolved && resolved.nodeType === 1) {
      try {
        target.component = resolved;
      } catch (ignoredAssignComponentContextError) {
        // no-op
      }
      return resolved;
    }
    return null;
  }

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

  function assignFreshQDomNodeUuid(node) {
    if (!node || typeof node !== "object" || Array.isArray(node)) {
      return;
    }
    if (!node.meta || typeof node.meta !== "object") {
      return;
    }
    if (typeof core.createQDomUuid === "function") {
      node.meta[QDOM_UUID_META_KEY] = core.createQDomUuid();
      return;
    }
    if (Object.prototype.hasOwnProperty.call(node.meta, QDOM_UUID_META_KEY)) {
      delete node.meta[QDOM_UUID_META_KEY];
    }
    if (typeof core.ensureNodeUuid === "function") {
      core.ensureNodeUuid(node);
    }
  }

  function refreshQDomNodeUuidsDeep(node) {
    const queue = [node];
    while (queue.length > 0) {
      const current = queue.pop();
      if (!current || typeof current !== "object") {
        continue;
      }
      if (Array.isArray(current)) {
        for (let i = 0; i < current.length; i += 1) {
          queue.push(current[i]);
        }
        continue;
      }
      assignFreshQDomNodeUuid(current);
      if (Array.isArray(current.nodes)) {
        queue.push(current.nodes);
      }
      if (Array.isArray(current.templateNodes)) {
        queue.push(current.templateNodes);
      }
      if (Array.isArray(current.slotDefaults)) {
        queue.push(current.slotDefaults);
      }
      if (Array.isArray(current.children)) {
        queue.push(current.children);
      }
      if (Array.isArray(current.slots)) {
        queue.push(current.slots);
      }
      if (current.model && typeof current.model === "object") {
        queue.push(current.model);
      }
      if (Array.isArray(current.entries)) {
        queue.push(current.entries);
      }
    }
  }

  function stripQDomSourceRefsDeep(node) {
    const queue = [node];
    while (queue.length > 0) {
      const current = queue.pop();
      if (!current || typeof current !== "object") {
        continue;
      }
      if (Array.isArray(current)) {
        for (let i = 0; i < current.length; i += 1) {
          queue.push(current[i]);
        }
        continue;
      }
      if (Object.prototype.hasOwnProperty.call(current, "__qhtmlSourceNode")) {
        try {
          delete current.__qhtmlSourceNode;
        } catch (error) {
          current.__qhtmlSourceNode = null;
        }
      }
      if (Array.isArray(current.nodes)) {
        queue.push(current.nodes);
      }
      if (Array.isArray(current.templateNodes)) {
        queue.push(current.templateNodes);
      }
      if (Array.isArray(current.slotDefaults)) {
        queue.push(current.slotDefaults);
      }
      if (Array.isArray(current.children)) {
        queue.push(current.children);
      }
      if (Array.isArray(current.slots)) {
        queue.push(current.slots);
      }
      if (current.model && typeof current.model === "object") {
        queue.push(current.model);
      }
      if (Array.isArray(current.entries)) {
        queue.push(current.entries);
      }
    }
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

  function readNamedCallbackStore() {
    const existing = global && typeof global[QHTML_NAMED_CALLBACKS_KEY] === "object"
      ? global[QHTML_NAMED_CALLBACKS_KEY]
      : null;
    if (existing) {
      return existing;
    }
    const created = Object.create(null);
    try {
      global[QHTML_NAMED_CALLBACKS_KEY] = created;
    } catch (error) {
      // fallback
    }
    return global && typeof global[QHTML_NAMED_CALLBACKS_KEY] === "object"
      ? global[QHTML_NAMED_CALLBACKS_KEY]
      : created;
  }

  function registerNamedCallbackRuntime(name, callbackFn) {
    const callbackName = String(name || "").trim();
    if (!callbackName || typeof callbackFn !== "function") {
      return;
    }
    const store = readNamedCallbackStore();
    store[callbackName] = callbackFn;
    const lowerName = callbackName.toLowerCase();
    if (lowerName && lowerName !== callbackName) {
      store[lowerName] = callbackFn;
    }
  }

  function resolveNamedCallbackRuntime(name) {
    const callbackName = String(name || "").trim();
    if (!callbackName) {
      return null;
    }
    const store = readNamedCallbackStore();
    if (Object.prototype.hasOwnProperty.call(store, callbackName) && typeof store[callbackName] === "function") {
      return store[callbackName];
    }
    const lowerName = callbackName.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(store, lowerName) && typeof store[lowerName] === "function") {
      return store[lowerName];
    }
    return null;
  }

  function resolveCallbackReferenceValue(value) {
    if (typeof value !== "string") {
      return value;
    }
    const reference = String(value || "").trim();
    if (!reference) {
      return value;
    }
    const callback = resolveNamedCallbackRuntime(reference);
    return typeof callback === "function" ? callback : value;
  }

  function getRuntimeThemeRules(instanceNode) {
    const meta = instanceNode && instanceNode.meta && typeof instanceNode.meta === "object" ? instanceNode.meta : null;
    if (!meta || !meta.qRuntimeThemeRules || typeof meta.qRuntimeThemeRules !== "object") {
      return null;
    }
    return meta.qRuntimeThemeRules;
  }

  function normalizePainterLookupKey(name) {
    return String(name || "").trim().toLowerCase();
  }

  function normalizePainterSlotName(name) {
    const value = String(name || "").trim().toLowerCase();
    if (value === "background" || value === "border" || value === "mask") {
      return value;
    }
    return "";
  }

  function encodePainterPropertyValue(value) {
    if (typeof value === "string") {
      return value;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    if (value == null) {
      return "";
    }
    try {
      return JSON.stringify(value);
    } catch (error) {
      return String(value);
    }
  }

  function readPainterRegistryStore() {
    const existing =
      global &&
      global[QHTML_PAINTER_REGISTRY_KEY] &&
      global[QHTML_PAINTER_REGISTRY_KEY] instanceof Map
        ? global[QHTML_PAINTER_REGISTRY_KEY]
        : null;
    if (existing) {
      return existing;
    }
    try {
      if (global) {
        global[QHTML_PAINTER_REGISTRY_KEY] = qPainterRuntimeRegistryFallback;
      }
    } catch (error) {
      // fallback map only
    }
    return qPainterRuntimeRegistryFallback;
  }

  function supportsPaintWorklet() {
    return !!(
      global &&
      global.CSS &&
      global.CSS.paintWorklet &&
      typeof global.CSS.paintWorklet.addModule === "function" &&
      typeof global.Blob === "function" &&
      global.URL &&
      typeof global.URL.createObjectURL === "function"
    );
  }

  function warnPainterSupportUnavailableOnce() {
    if (qPainterSupportWarningShown) {
      return;
    }
    qPainterSupportWarningShown = true;
    if (typeof console !== "undefined" && console && typeof console.warn === "function") {
      console.warn("[q-painter] CSS Paint Worklet is unavailable in this environment; painter styles were skipped.");
    }
  }

  function ensurePainterScopeId(hostElement) {
    if (!hostElement || hostElement.nodeType !== 1) {
      return "global";
    }
    const fromMap = qPainterScopeIds.get(hostElement);
    if (fromMap) {
      return fromMap;
    }
    const attrScope = String(hostElement.getAttribute && hostElement.getAttribute("qhtml-instance-id") || "").trim();
    if (attrScope) {
      qPainterScopeIds.set(hostElement, attrScope);
      return attrScope;
    }
    let existing = String(hostElement[QHTML_PAINTER_SCOPE_KEY] || "").trim();
    if (!existing) {
      qPainterScopeCounter += 1;
      existing = "p" + String(qPainterScopeCounter);
      try {
        Object.defineProperty(hostElement, QHTML_PAINTER_SCOPE_KEY, {
          configurable: true,
          enumerable: false,
          writable: true,
          value: existing,
        });
      } catch (error) {
        hostElement[QHTML_PAINTER_SCOPE_KEY] = existing;
      }
    }
    qPainterScopeIds.set(hostElement, existing);
    return existing;
  }

  function sanitizePainterNameToken(name) {
    const raw = String(name || "").trim().toLowerCase();
    if (!raw) {
      return "";
    }
    return raw.replace(/[^a-z0-9_-]/g, "-");
  }

  function resolveRuntimePainterDefinition(runtimeRules, painterName) {
    const rules = runtimeRules && typeof runtimeRules === "object" ? runtimeRules : {};
    const painterMap =
      rules.painters && typeof rules.painters === "object" && !Array.isArray(rules.painters)
        ? rules.painters
        : {};
    const directKey = normalizePainterLookupKey(painterName);
    if (directKey && painterMap[directKey] && typeof painterMap[directKey] === "object") {
      return painterMap[directKey];
    }
    const keys = Object.keys(painterMap);
    for (let i = 0; i < keys.length; i += 1) {
      const key = String(keys[i] || "").trim();
      const entry = painterMap[key];
      if (!entry || typeof entry !== "object") {
        continue;
      }
      if (normalizePainterLookupKey(entry.name) === directKey) {
        return entry;
      }
    }
    return null;
  }

  function resolveRuntimeTransitionDefinition(runtimeRules, transitionName) {
    const rules = runtimeRules && typeof runtimeRules === "object" ? runtimeRules : {};
    const transitionMap =
      rules.transitions && typeof rules.transitions === "object" && !Array.isArray(rules.transitions)
        ? rules.transitions
        : {};
    const directKey = normalizePainterLookupKey(transitionName);
    if (directKey && transitionMap[directKey] && typeof transitionMap[directKey] === "object") {
      return transitionMap[directKey];
    }
    const keys = Object.keys(transitionMap);
    for (let i = 0; i < keys.length; i += 1) {
      const key = String(keys[i] || "").trim();
      const entry = transitionMap[key];
      if (!entry || typeof entry !== "object") {
        continue;
      }
      if (normalizePainterLookupKey(entry.name) === directKey) {
        return entry;
      }
    }
    return null;
  }

  function normalizeTransitionTimeValue(value, fallbackValue) {
    const fallback = String(fallbackValue || "").trim() || "0ms";
    const text = String(value || "").trim();
    if (!text) {
      return fallback;
    }
    if (/^-?(?:\d+|\d*\.\d+)$/.test(text)) {
      return text + "ms";
    }
    return text;
  }

  function normalizeTransitionPropertyValue(value) {
    const text = String(value || "").trim();
    if (!text) {
      return "";
    }
    return text;
  }

  function buildTransitionCssEntry(transitionDefinition) {
    const entry = transitionDefinition && typeof transitionDefinition === "object" ? transitionDefinition : {};
    const property = normalizeTransitionPropertyValue(entry.property);
    if (!property) {
      return "";
    }
    const duration = normalizeTransitionTimeValue(entry.duration, "0ms");
    const timing = String(entry.timing || "").trim() || "ease";
    const delay = normalizeTransitionTimeValue(entry.delay, "0ms");
    return property + " " + duration + " " + timing + " " + delay;
  }

  function sanitizeKeyframeNameToken(value) {
    const raw = String(value || "").trim();
    if (!raw) {
      return "";
    }
    return raw.replace(/[^A-Za-z0-9_-]/g, "-");
  }

  function getPathAnimationStyleRegistry(doc) {
    const targetDocument = doc || global.document || null;
    if (!targetDocument) {
      return null;
    }
    if (!targetDocument[QHTML_PATH_ANIMATION_STYLE_KEY]) {
      try {
        Object.defineProperty(targetDocument, QHTML_PATH_ANIMATION_STYLE_KEY, {
          configurable: true,
          enumerable: false,
          writable: true,
          value: new Set(),
        });
      } catch (error) {
        targetDocument[QHTML_PATH_ANIMATION_STYLE_KEY] = new Set();
      }
    }
    return targetDocument[QHTML_PATH_ANIMATION_STYLE_KEY];
  }

  function buildPathAnimationKeyframesCss(pathAnimation) {
    const animation = pathAnimation && typeof pathAnimation === "object" ? pathAnimation : {};
    const name = sanitizeKeyframeNameToken(animation.keyframeName);
    if (!name) {
      return "";
    }
    return [
      "@keyframes " + name + " {",
      "  from {",
      "    offset-distance: 0%;",
      "  }",
      "  to {",
      "    offset-distance: 100%;",
      "  }",
      "}",
    ].join("\n");
  }

  function ensurePathAnimationStyle(targetDocument, pathAnimation) {
    const doc = targetDocument || global.document || null;
    const animation = pathAnimation && typeof pathAnimation === "object" ? pathAnimation : {};
    const name = sanitizeKeyframeNameToken(animation.keyframeName);
    if (!doc || !name) {
      return;
    }
    const registry = getPathAnimationStyleRegistry(doc);
    if (registry && registry.has(name)) {
      return;
    }
    const css = buildPathAnimationKeyframesCss(animation);
    if (!css) {
      return;
    }
    const styleElement = doc.createElement("style");
    styleElement.setAttribute("data-qhtml-path-animation", name);
    styleElement.textContent = css;
    const head = doc.head || doc.getElementsByTagName("head")[0] || doc.documentElement;
    if (head && typeof head.appendChild === "function") {
      head.appendChild(styleElement);
      if (registry) {
        registry.add(name);
      }
    }
  }

  function normalizeRuntimePathAnimationList(pathAnimations) {
    const list = Array.isArray(pathAnimations) ? pathAnimations : [];
    const out = [];
    for (let i = 0; i < list.length; i += 1) {
      const entry = list[i] && typeof list[i] === "object" ? list[i] : null;
      if (!entry || !entry.keyframeName) {
        continue;
      }
      out.push(Object.assign({}, entry));
    }
    return out;
  }

  function applyPathAnimationsToElement(element, pathAnimations, targetDocument) {
    if (!element || !element.style || typeof element.style.setProperty !== "function") {
      return;
    }
    const animations = normalizeRuntimePathAnimationList(pathAnimations);
    for (let i = 0; i < animations.length; i += 1) {
      ensurePathAnimationStyle(targetDocument || element.ownerDocument || global.document || null, animations[i]);
    }
  }

  function buildPainterWorkletModuleSource(internalName, painterDefinition) {
    const painter = painterDefinition && typeof painterDefinition === "object" ? painterDefinition : {};
    const defaults =
      painter.properties && typeof painter.properties === "object" && !Array.isArray(painter.properties)
        ? painter.properties
        : {};
    const onPaintSource = String(painter.onPaint || "").trim();
    const propertyNames = Object.keys(defaults)
      .map(function mapPropertyName(name) { return String(name || "").trim(); })
      .filter(Boolean);
    const inputPropertiesLiteral = JSON.stringify(
      propertyNames.map(function mapInputName(name) { return "--" + name; })
    );
    const defaultsLiteral = JSON.stringify(defaults);
    return [
      "const __qhtmlPainterDefaults = " + defaultsLiteral + ";",
      "const __qhtmlPainterInputProperties = " + inputPropertiesLiteral + ";",
      "function __qhtmlDecodeValue(rawValue, fallback) {",
      "  const raw = String(rawValue == null ? \"\" : rawValue).trim();",
      "  if (!raw) { return fallback; }",
      "  if (raw === \"true\") { return true; }",
      "  if (raw === \"false\") { return false; }",
      "  const num = Number(raw);",
      "  if (Number.isFinite(num)) { return num; }",
      "  try { return JSON.parse(raw); } catch (error) { return raw; }",
      "}",
      "registerPaint(" + JSON.stringify(String(internalName || "")) + ", class QHtmlPainter {",
      "  static get inputProperties() { return __qhtmlPainterInputProperties; }",
      "  paint(ctx, size, properties, args) {",
      "    const target = {",
      "      context: ctx,",
      "      size: size,",
      "      args: args,",
      "      width: Number(size && size.width || 0),",
      "      height: Number(size && size.height || 0)",
      "    };",
      "    const names = Object.keys(__qhtmlPainterDefaults);",
      "    for (let i = 0; i < names.length; i += 1) {",
      "      const name = names[i];",
      "      const prop = properties.get(\"--\" + name);",
      "      target[name] = __qhtmlDecodeValue(prop, __qhtmlPainterDefaults[name]);",
      "    }",
      "    const painterThis = new Proxy(target, {",
      "      get(state, key) {",
      "        if (Object.prototype.hasOwnProperty.call(state, key)) { return state[key]; }",
      "        const fromCtx = ctx[key];",
      "        return typeof fromCtx === \"function\" ? fromCtx.bind(ctx) : fromCtx;",
      "      },",
      "      set(state, key, value) {",
      "        if (Object.prototype.hasOwnProperty.call(state, key)) {",
      "          state[key] = value;",
      "          return true;",
      "        }",
      "        if (ctx && key in ctx) {",
      "          try {",
      "            ctx[key] = value;",
      "            return true;",
      "          } catch (error) {",
      "            // fall through to local state storage when context rejects assignment",
      "          }",
      "        }",
      "        state[key] = value;",
      "        return true;",
      "      },",
      "    });",
      "    try {",
      "      (function(){",
      onPaintSource,
      "      }).call(painterThis);",
      "    } catch (error) {",
      "      // Keep painting pipeline alive if user script throws.",
      "    }",
      "  }",
      "});",
    ].join("\n");
  }

  function ensurePainterWorkletRegistration(hostElement, painterName, painterDefinition) {
    if (!supportsPaintWorklet()) {
      warnPainterSupportUnavailableOnce();
      return "";
    }
    const scopeId = sanitizePainterNameToken(ensurePainterScopeId(hostElement)) || "global";
    const painterToken = sanitizePainterNameToken(painterName) || "painter";
    const internalName = "qhtml-" + scopeId + "-" + painterToken;
    const registry = readPainterRegistryStore();
    const existing = registry.get(internalName);
    if (existing && (existing.status === "ready" || existing.status === "pending")) {
      return internalName;
    }
    const source = buildPainterWorkletModuleSource(internalName, painterDefinition);
    const blob = new Blob([source], { type: "application/javascript" });
    const moduleUrl = global.URL.createObjectURL(blob);
    registry.set(internalName, {
      status: "pending",
      name: internalName,
      moduleUrl: moduleUrl,
    });
    global.CSS.paintWorklet.addModule(moduleUrl).then(function onPainterRegistered() {
      const next = registry.get(internalName);
      if (next) {
        next.status = "ready";
      }
      try {
        global.URL.revokeObjectURL(moduleUrl);
      } catch (error) {
        // ignore URL revocation failures
      }
    }).catch(function onPainterRegisterError(error) {
      const next = registry.get(internalName);
      if (next) {
        next.status = "error";
        next.error = error;
      }
      if (typeof console !== "undefined" && console && typeof console.warn === "function") {
        console.warn("[q-painter] Failed to register painter '" + String(painterName || "") + "':", error);
      }
      try {
        global.URL.revokeObjectURL(moduleUrl);
      } catch (revokeError) {
        // ignore URL revocation failures
      }
    });
    return internalName;
  }

  function applyPainterCustomPropertyDefaultsToElement(element, painterDefinition) {
    if (!element || !element.style || typeof element.style.setProperty !== "function") {
      return;
    }
    const painter = painterDefinition && typeof painterDefinition === "object" ? painterDefinition : {};
    const properties =
      painter.properties && typeof painter.properties === "object" && !Array.isArray(painter.properties)
        ? painter.properties
        : {};
    const keys = Object.keys(properties);
    for (let i = 0; i < keys.length; i += 1) {
      const propertyName = String(keys[i] || "").trim();
      if (!propertyName) {
        continue;
      }
      const cssName = "--" + propertyName;
      const current = String(element.style.getPropertyValue(cssName) || "").trim();
      if (current) {
        continue;
      }
      const encoded = encodePainterPropertyValue(properties[propertyName]);
      if (!encoded) {
        continue;
      }
      element.style.setProperty(cssName, encoded);
    }
  }

  function applyPainterSlotToElement(element, slotName, internalPainterName) {
    if (!element || !element.style || typeof element.style.setProperty !== "function") {
      return;
    }
    const slot = normalizePainterSlotName(slotName);
    const paintValue = "paint(" + String(internalPainterName || "") + ")";
    if (!slot || !internalPainterName) {
      return;
    }
    if (slot === "background") {
      element.style.setProperty("background-image", paintValue);
      return;
    }
    if (slot === "mask") {
      element.style.setProperty("mask-image", paintValue);
      element.style.setProperty("-webkit-mask-image", paintValue);
      if (!String(element.style.getPropertyValue("mask-mode") || "").trim()) {
        element.style.setProperty("mask-mode", "alpha");
      }
      if (!String(element.style.getPropertyValue("mask-repeat") || "").trim()) {
        element.style.setProperty("mask-repeat", "no-repeat");
      }
      if (!String(element.style.getPropertyValue("mask-size") || "").trim()) {
        element.style.setProperty("mask-size", "100% 100%");
      }
      if (!String(element.style.getPropertyValue("mask-position") || "").trim()) {
        element.style.setProperty("mask-position", "center");
      }
      if (!String(element.style.getPropertyValue("-webkit-mask-repeat") || "").trim()) {
        element.style.setProperty("-webkit-mask-repeat", "no-repeat");
      }
      if (!String(element.style.getPropertyValue("-webkit-mask-size") || "").trim()) {
        element.style.setProperty("-webkit-mask-size", "100% 100%");
      }
      if (!String(element.style.getPropertyValue("-webkit-mask-position") || "").trim()) {
        element.style.setProperty("-webkit-mask-position", "center");
      }
      return;
    }
    if (slot === "border") {
      element.style.removeProperty("border-image");
      element.style.setProperty("border-image-source", paintValue);
      if (!String(element.style.getPropertyValue("border-image-slice") || "").trim()) {
        element.style.setProperty("border-image-slice", "1 fill");
      }
      if (!String(element.style.getPropertyValue("border-image-width") || "").trim()) {
        element.style.setProperty("border-image-width", "1");
      }
      if (!String(element.style.getPropertyValue("border-image-repeat") || "").trim()) {
        element.style.setProperty("border-image-repeat", "stretch");
      }
      if (!String(element.style.getPropertyValue("border-style") || "").trim()) {
        element.style.setProperty("border-style", "solid");
      }
    }
  }

  function walkElementsInScope(scopeRoot, visitor) {
    if (!scopeRoot || scopeRoot.nodeType !== 1 || typeof visitor !== "function") {
      return;
    }
    const stack = [scopeRoot];
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current || current.nodeType !== 1) {
        continue;
      }
      visitor(current);
      const children =
        current.children && typeof current.children.length === "number"
          ? current.children
          : current.childNodes && typeof current.childNodes.length === "number"
            ? current.childNodes
            : [];
      for (let i = children.length - 1; i >= 0; i -= 1) {
        const child = children[i];
        if (child && child.nodeType === 1) {
          stack.push(child);
        }
      }
    }
  }

  function escapeCssAttributeSelectorValue(value) {
    return String(value == null ? "" : value)
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"');
  }

  function wildcardTokenToAttributeSelectors(attributeName, token) {
    const raw = String(token || "");
    const parts = raw.split("*").filter(function keep(part) { return part.length > 0; });
    if (parts.length === 0) {
      return "[" + attributeName + "]";
    }
    let out = "";
    for (let i = 0; i < parts.length; i += 1) {
      out += "[" + attributeName + "*=\"" + escapeCssAttributeSelectorValue(parts[i]) + "\"]";
    }
    return out;
  }

  function compileThemeSelector(selector) {
    const raw = String(selector || "").trim();
    if (!raw) {
      return "";
    }
    let normalized = raw;
    normalized = normalized.replace(
      /(^|[\s>+~,(])\.([A-Za-z0-9_-]*\*[A-Za-z0-9_*-]*)/g,
      function replaceWildcardClass(matchText, prefix, token) {
        const value = String(token || "").trim();
        if (!value || value.indexOf("*") === -1) {
          return matchText;
        }
        return String(prefix || "") + wildcardTokenToAttributeSelectors("class", value);
      }
    );
    normalized = normalized.replace(
      /(^|[\s>+~,(])#([A-Za-z0-9_-]*\*[A-Za-z0-9_*-]*)/g,
      function replaceWildcardId(matchText, prefix, token) {
        const value = String(token || "").trim();
        if (!value || value.indexOf("*") === -1) {
          return matchText;
        }
        return String(prefix || "") + wildcardTokenToAttributeSelectors("id", value);
      }
    );
    return normalized;
  }

  function collectSelectorTargets(rootElement, selector) {
    const out = [];
    const root = rootElement && rootElement.nodeType === 1 ? rootElement : null;
    const query = compileThemeSelector(selector);
    if (!root || !query) {
      return out;
    }
    const hasScopePseudo = query.indexOf(":scope") !== -1;
    if (hasScopePseudo && typeof root.querySelectorAll === "function") {
      try {
        if (typeof root.matches === "function" && root.matches(query)) {
          out.push(root);
        }
      } catch (error) {
        // no-op
      }
      try {
        const list = root.querySelectorAll(query);
        for (let i = 0; i < list.length; i += 1) {
          const candidate = list[i];
          if (!candidate || candidate.nodeType !== 1) {
            continue;
          }
          out.push(candidate);
        }
      } catch (error) {
        return out;
      }
      return out;
    }
    walkElementsInScope(root, function collectCandidate(element) {
      if (!element || typeof element.matches !== "function") {
        return;
      }
      try {
        if (element.matches(query)) {
          out.push(element);
        }
      } catch (error) {
        // invalid selector; ignore for this scope
      }
    });
    return out;
  }

  function applyRuntimeThemeRuleToElement(element, rule, hostElement, runtimeRules) {
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
    const transitions = Array.isArray(rule.transitions) ? rule.transitions : [];
    if (transitions.length > 0 && element.style && typeof element.style.setProperty === "function") {
      const transitionEntries = [];
      for (let i = 0; i < transitions.length; i += 1) {
        const transitionName = String(transitions[i] || "").trim();
        if (!transitionName) {
          continue;
        }
        const transitionDefinition = resolveRuntimeTransitionDefinition(runtimeRules, transitionName);
        if (!transitionDefinition) {
          continue;
        }
        const transitionEntry = buildTransitionCssEntry(transitionDefinition);
        if (!transitionEntry) {
          continue;
        }
        transitionEntries.push(transitionEntry);
      }
      if (transitionEntries.length > 0) {
        element.style.setProperty("transition", transitionEntries.join(", "));
      }
    }
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
    applyPathAnimationsToElement(
      element,
      Array.isArray(rule.pathAnimations) ? rule.pathAnimations : [],
      element.ownerDocument || global.document || null
    );

    const painters =
      rule.painters && typeof rule.painters === "object" && !Array.isArray(rule.painters)
        ? rule.painters
        : {};
    const painterSlots = Object.keys(painters);
    for (let i = 0; i < painterSlots.length; i += 1) {
      const slot = normalizePainterSlotName(painterSlots[i]);
      const painterName = String(painters[painterSlots[i]] || "").trim();
      if (!slot || !painterName) {
        continue;
      }
      const painterDefinition = resolveRuntimePainterDefinition(runtimeRules, painterName);
      if (!painterDefinition) {
        continue;
      }
      const internalPainterName = ensurePainterWorkletRegistration(hostElement, painterName, painterDefinition);
      if (!internalPainterName) {
        continue;
      }
      applyPainterCustomPropertyDefaultsToElement(element, painterDefinition);
      applyPainterSlotToElement(element, slot, internalPainterName);
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
        applyRuntimeThemeRuleToElement(targets[ti], rule, hostElement, runtimeRules);
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

  function observePromiseRejection(promise, label) {
    if (!promise || typeof promise.then !== "function" || typeof promise.catch !== "function") {
      return promise;
    }
    promise.catch(function onObservedPromiseRejection(error) {
      if (global.console && typeof global.console.error === "function") {
        global.console.error(String(label || "qhtml async operation failed:"), error);
      }
      return undefined;
    });
    return promise;
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

    const ready = withWasmTimeout(readyPromise, config.timeoutMs, "q-wasm init");
    observePromiseRejection(ready, "qhtml q-wasm init failed:");
    return {
      mode: "main",
      ready: ready,
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

    const ready = withWasmTimeout(readyPromise, config.timeoutMs, "q-wasm init");
    observePromiseRejection(ready, "qhtml q-wasm worker init failed:");
    return {
      mode: "worker",
      ready: ready,
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

  function isProjectedSlotNode(node) {
    return !!(node && typeof node === "object" && node[RENDER_SLOT_REF]);
  }

  function isInsideProjectedSlotContext(context) {
    return !!(context && Array.isArray(context.slotStack) && context.slotStack.length > 0);
  }

  function inferDefinitionType(definitionNode) {
    if (!definitionNode || typeof definitionNode !== "object") {
      return "component";
    }

    const explicit = String(definitionNode.definitionType || "").trim().toLowerCase();
    if (explicit === "component" || explicit === "template" || explicit === "signal" || explicit === "worker" || explicit === "struct") {
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
    if (originalSource.startsWith("q-worker")) {
      return "worker";
    }
    if (originalSource.startsWith("q-struct")) {
      return "struct";
    }

    return "component";
  }

  function normalizeComponentKey(value) {
    return String(value || "").trim().toLowerCase();
  }

  function readInheritedComponentIds(definitionNode) {
    const out = [];
    if (!definitionNode || typeof definitionNode !== "object") {
      return out;
    }
    const rawList = Array.isArray(definitionNode.extendsComponentIds) ? definitionNode.extendsComponentIds : [];
    for (let i = 0; i < rawList.length; i += 1) {
      const inheritedId = String(rawList[i] || "").trim();
      if (!inheritedId) {
        continue;
      }
      out.push(inheritedId);
    }
    if (out.length === 0) {
      const legacyInheritedId = String(definitionNode.extendsComponentId || "").trim();
      if (legacyInheritedId) {
        out.push(legacyInheritedId);
      }
    }
    return out;
  }

  function readComponentRepeaterConfig(definitionNode) {
    if (!definitionNode || typeof definitionNode !== "object") {
      return null;
    }
    const meta = definitionNode.meta && typeof definitionNode.meta === "object" ? definitionNode.meta : null;
    const cfg =
      meta &&
      meta.__qhtmlInheritedRepeaterConfig &&
      typeof meta.__qhtmlInheritedRepeaterConfig === "object" &&
      !Array.isArray(meta.__qhtmlInheritedRepeaterConfig)
        ? meta.__qhtmlInheritedRepeaterConfig
        : null;
    if (!cfg) {
      return null;
    }
    const modelEntries = Array.isArray(cfg.modelEntries) ? cfg.modelEntries : [];
    const aliasNamesRaw = Array.isArray(cfg.aliasNames) ? cfg.aliasNames : [];
    const aliasNames = [];
    const seenAlias = new Set();
    for (let i = 0; i < aliasNamesRaw.length; i += 1) {
      const aliasName = String(aliasNamesRaw[i] || "").trim();
      if (!aliasName || seenAlias.has(aliasName)) {
        continue;
      }
      seenAlias.add(aliasName);
      aliasNames.push(aliasName);
    }
    const slotName = String(cfg.slotName || "item").trim() || "item";
    if (aliasNames.length === 0) {
      aliasNames.push(slotName);
    } else if (!seenAlias.has(slotName)) {
      aliasNames.push(slotName);
    }
    return {
      keyword: String(cfg.keyword || "").trim().toLowerCase(),
      slotName: slotName,
      aliasNames: aliasNames,
      explicitSlot: !!cfg.explicitSlot,
      explicitModel: !!cfg.explicitModel,
      modelEntries: modelEntries.slice(),
      modelSource: String(cfg.modelSource || "").trim(),
    };
  }

  function mergeRepeaterConfig(baseConfig, incomingConfig) {
    const base = baseConfig && typeof baseConfig === "object" ? baseConfig : null;
    const incoming = incomingConfig && typeof incomingConfig === "object" ? incomingConfig : null;
    if (!incoming) {
      return base ? Object.assign({}, base, { modelEntries: Array.isArray(base.modelEntries) ? base.modelEntries.slice() : [] }) : null;
    }
    const incomingKeyword = String(incoming.keyword || "").trim().toLowerCase();
    const incomingAliasesRaw = Array.isArray(incoming.aliasNames) ? incoming.aliasNames : [];
    const incomingAliases = [];
    for (let i = 0; i < incomingAliasesRaw.length; i += 1) {
      const aliasName = String(incomingAliasesRaw[i] || "").trim();
      if (!aliasName) {
        continue;
      }
      incomingAliases.push(aliasName);
    }
    if (!base) {
      if (!incomingKeyword) {
        return null;
      }
      const slotName = String(incoming.slotName || "item").trim() || "item";
      const aliasNames = [];
      const aliasSeen = new Set();
      for (let i = 0; i < incomingAliases.length; i += 1) {
        const aliasName = incomingAliases[i];
        if (!aliasName || aliasSeen.has(aliasName)) {
          continue;
        }
        aliasSeen.add(aliasName);
        aliasNames.push(aliasName);
      }
      if (!aliasSeen.has(slotName)) {
        aliasSeen.add(slotName);
        aliasNames.push(slotName);
      }
      return Object.assign({}, incoming, {
        slotName: slotName,
        aliasNames: aliasNames,
        keyword: incomingKeyword,
        modelEntries: Array.isArray(incoming.modelEntries) ? incoming.modelEntries.slice() : [],
      });
    }
    const baseAliasesRaw = Array.isArray(base.aliasNames) ? base.aliasNames : [];
    const baseAliases = [];
    for (let i = 0; i < baseAliasesRaw.length; i += 1) {
      const aliasName = String(baseAliasesRaw[i] || "").trim();
      if (!aliasName) {
        continue;
      }
      baseAliases.push(aliasName);
    }
    const mergedAliases = [];
    const mergedAliasSeen = new Set();
    for (let i = 0; i < baseAliases.length; i += 1) {
      const aliasName = baseAliases[i];
      if (!aliasName || mergedAliasSeen.has(aliasName)) {
        continue;
      }
      mergedAliasSeen.add(aliasName);
      mergedAliases.push(aliasName);
    }
    for (let i = 0; i < incomingAliases.length; i += 1) {
      const aliasName = incomingAliases[i];
      if (!aliasName || mergedAliasSeen.has(aliasName)) {
        continue;
      }
      mergedAliasSeen.add(aliasName);
      mergedAliases.push(aliasName);
    }
    const out = {
      keyword: incomingKeyword || String(base.keyword || "q-model-view").trim().toLowerCase() || "q-model-view",
      slotName: String(base.slotName || "item").trim() || "item",
      aliasNames: mergedAliases,
      explicitSlot: !!base.explicitSlot,
      explicitModel: !!base.explicitModel,
      modelEntries: Array.isArray(base.modelEntries) ? base.modelEntries.slice() : [],
      modelSource: String(base.modelSource || "").trim(),
    };
    if (incoming.explicitSlot) {
      out.slotName = String(incoming.slotName || out.slotName || "item").trim() || "item";
      out.explicitSlot = true;
      if (!mergedAliasSeen.has(out.slotName)) {
        mergedAliasSeen.add(out.slotName);
        out.aliasNames.push(out.slotName);
      }
    }
    if (incoming.explicitModel) {
      out.modelEntries = Array.isArray(incoming.modelEntries) ? incoming.modelEntries.slice() : [];
      out.modelSource = String(incoming.modelSource || "").trim();
      out.explicitModel = true;
    }
    if (!Array.isArray(out.aliasNames)) {
      out.aliasNames = [];
    }
    let hasSlotAlias = false;
    for (let i = 0; i < out.aliasNames.length; i += 1) {
      if (String(out.aliasNames[i] || "").trim() === out.slotName) {
        hasSlotAlias = true;
        break;
      }
    }
    if (!hasSlotAlias) {
      out.aliasNames.push(out.slotName);
    }
    return out;
  }

  function readInheritedRepeaterKeyword(definitionNode) {
    const inheritedIds = readInheritedComponentIds(definitionNode);
    for (let ii = 0; ii < inheritedIds.length; ii += 1) {
      const inheritedLower = String(inheritedIds[ii] || "").trim().toLowerCase();
      if (inheritedLower === "q-model-view") {
        return "q-model-view";
      }
      if (inheritedLower === "q-repeater" || inheritedLower === "q-foreach") {
        return "q-repeater";
      }
    }
    return "";
  }

  function readInheritedCanvasKeyword(definitionNode) {
    if (
      definitionNode &&
      definitionNode.meta &&
      typeof definitionNode.meta === "object" &&
      definitionNode.meta.__qhtmlInheritedCanvasConfig &&
      typeof definitionNode.meta.__qhtmlInheritedCanvasConfig === "object" &&
      definitionNode.meta.__qhtmlInheritedCanvasConfig.enabled === true
    ) {
      return true;
    }
    const inheritedIds = readInheritedComponentIds(definitionNode);
    for (let ii = 0; ii < inheritedIds.length; ii += 1) {
      const inheritedLower = String(inheritedIds[ii] || "").trim().toLowerCase();
      if (inheritedLower === "q-canvas") {
        return true;
      }
    }
    return false;
  }

  function componentNodeHasCanvasSemantics(componentNode) {
    return readInheritedCanvasKeyword(componentNode) === true;
  }

  function readPlainNodeText(node) {
    if (!node || typeof node !== "object") {
      return "";
    }
    if (core.NODE_TYPES.text && node.kind === core.NODE_TYPES.text) {
      return String(node.value || "");
    }
    if (node.kind !== core.NODE_TYPES.element && node.kind !== core.NODE_TYPES.componentInstance) {
      return "";
    }
    let out = "";
    if (typeof node.textContent === "string") {
      out += node.textContent;
    }
    const children = Array.isArray(node.children) ? node.children : [];
    for (let i = 0; i < children.length; i += 1) {
      out += readPlainNodeText(children[i]);
    }
    return out;
  }

  function readRepeaterAliasFromTemplateNode(node) {
    if (!node || typeof node !== "object" || node.kind !== core.NODE_TYPES.element) {
      return "";
    }
    const tag = String(node.tagName || "").trim().toLowerCase();
    if (tag !== "as" && tag !== "slot") {
      return "";
    }
    const text = readPlainNodeText(node).trim();
    if (/^[A-Za-z_][A-Za-z0-9_-]*$/.test(text)) {
      return text;
    }
    return "";
  }

  function resolveInheritedComponentDefinition(componentNode, componentRegistry, cache) {
    if (!componentNode || typeof componentNode !== "object" || componentNode.kind !== core.NODE_TYPES.component) {
      return componentNode;
    }
    const cacheMap = cache instanceof Map ? cache : null;
    const cacheKey = normalizeComponentKey(componentNode.componentId) || componentNode;
    if (cacheMap && cacheMap.has(cacheKey)) {
      return cacheMap.get(cacheKey);
    }

    const chain = [];
    const emittedNodes = new Set();
    const emittedKeys = new Set();

    function visitInheritance(node, pathNodes, pathKeys) {
      if (!node || typeof node !== "object" || node.kind !== core.NODE_TYPES.component) {
        return;
      }
      const nodeKey = normalizeComponentKey(node.componentId);
      if (pathNodes.has(node) || (nodeKey && pathKeys.has(nodeKey))) {
        const recursiveKey = nodeKey || normalizeComponentKey(componentNode.componentId) || "component";
        throw new Error("Recursive q-component extends chain detected for '" + recursiveKey + "'.");
      }
      const nextPathNodes = new Set(pathNodes);
      nextPathNodes.add(node);
      const nextPathKeys = new Set(pathKeys);
      if (nodeKey) {
        nextPathKeys.add(nodeKey);
      }

      const inheritedIds = readInheritedComponentIds(node);
      for (let i = 0; i < inheritedIds.length; i += 1) {
        const inheritedKey = normalizeComponentKey(inheritedIds[i]);
        if (!inheritedKey || !(componentRegistry instanceof Map) || !componentRegistry.has(inheritedKey)) {
          continue;
        }
        visitInheritance(componentRegistry.get(inheritedKey), nextPathNodes, nextPathKeys);
      }

      if (nodeKey && emittedKeys.has(nodeKey)) {
        return;
      }
      if (emittedNodes.has(node)) {
        return;
      }
      emittedNodes.add(node);
      if (nodeKey) {
        emittedKeys.add(nodeKey);
      }
      chain.push(node);
    }

    visitInheritance(componentNode, new Set(), new Set());

    if (chain.length <= 1) {
      const directKeywordRepeater = readInheritedRepeaterKeyword(componentNode);
      const directCanvasSemantics = componentNodeHasCanvasSemantics(componentNode);
      const directConfig = readComponentRepeaterConfig(componentNode);
      const hasDirectRepeaterSemantics =
        !!directKeywordRepeater ||
        !!(directConfig && (
          String(directConfig.keyword || "").trim().toLowerCase() ||
          directConfig.explicitModel ||
          directConfig.explicitSlot
        ));
      if (!hasDirectRepeaterSemantics && !directCanvasSemantics) {
        if (cacheMap) {
          cacheMap.set(cacheKey, componentNode);
        }
        return componentNode;
      }
    }

    if (chain.length <= 0) {
      if (cacheMap) {
        cacheMap.set(cacheKey, componentNode);
      }
      return componentNode;
    }

    const leaf = chain[chain.length - 1];
    const leafInheritedIds = readInheritedComponentIds(leaf);
    const merged = {
      kind: core.NODE_TYPES.component,
      componentId: String(leaf.componentId || "").trim(),
      extendsComponentIds: leafInheritedIds.slice(),
      extendsComponentId: leafInheritedIds.length > 0 ? leafInheritedIds[0] : "",
      definitionType: String(leaf.definitionType || "component").trim().toLowerCase() || "component",
      templateNodes: [],
      slotDefaults: [],
      propertyDefinitions: [],
      methods: [],
      signalDeclarations: [],
      callbackDeclarations: [],
      aliasDeclarations: [],
      varDeclarations: [],
      switchDeclarations: [],
      qTimerDefinitions: [],
      wasmConfig: null,
      lifecycleScripts: [],
      attributes: {},
      properties: [],
      meta: leaf.meta && typeof leaf.meta === "object" ? Object.assign({}, leaf.meta) : {},
    };

    const propertyIndex = new Map();
    const slotDefaultIndex = new Map();
    const propertyDefinitionIndex = new Map();
    const methodIndex = new Map();
    const signalIndex = new Map();
    const callbackIndex = new Map();
    const aliasIndex = new Map();
    const varIndex = new Map();
    const switchIndex = new Map();
    const qTimerIndex = new Map();
    const lifecycleIndex = new Map();
    const behaviorIndex = new Map();
    const cssBindingIndex = new Map();
    let mergedRepeaterConfig = null;
    let mergedCanvasSemantics = false;

    function mergeNamedEntries(target, sourceEntries, indexMap) {
      const list = Array.isArray(sourceEntries) ? sourceEntries : [];
      for (let i = 0; i < list.length; i += 1) {
        const entry = list[i];
        if (!entry || typeof entry !== "object") {
          continue;
        }
        const entryName = normalizeComponentKey(entry.name);
        if (!entryName) {
          target.push(Object.assign({}, entry));
          continue;
        }
        if (indexMap.has(entryName)) {
          target[indexMap.get(entryName)] = Object.assign({}, entry);
        } else {
          indexMap.set(entryName, target.length);
          target.push(Object.assign({}, entry));
        }
      }
    }

    for (let i = 0; i < chain.length; i += 1) {
      const node = chain[i];
      if (!node || typeof node !== "object") {
        continue;
      }
      const attrs = node.attributes && typeof node.attributes === "object" ? node.attributes : null;
      if (attrs) {
        Object.assign(merged.attributes, attrs);
      }

      const properties = Array.isArray(node.properties) ? node.properties : [];
      for (let pi = 0; pi < properties.length; pi += 1) {
        const propertyName = String(properties[pi] || "").trim();
        const propertyKey = normalizeComponentKey(propertyName);
        if (!propertyName || !propertyKey) {
          continue;
        }
        if (propertyIndex.has(propertyKey)) {
          merged.properties[propertyIndex.get(propertyKey)] = propertyName;
        } else {
          propertyIndex.set(propertyKey, merged.properties.length);
          merged.properties.push(propertyName);
        }
      }

      mergeNamedEntries(merged.propertyDefinitions, node.propertyDefinitions, propertyDefinitionIndex);
      mergeNamedEntries(merged.methods, node.methods, methodIndex);
      mergeNamedEntries(merged.signalDeclarations, node.signalDeclarations, signalIndex);
      mergeNamedEntries(merged.callbackDeclarations, node.callbackDeclarations, callbackIndex);
      mergeNamedEntries(merged.aliasDeclarations, node.aliasDeclarations, aliasIndex);
      mergeNamedEntries(merged.varDeclarations, node.varDeclarations, varIndex);
      mergeNamedEntries(merged.switchDeclarations, node.switchDeclarations, switchIndex);
      const timerDefinitions = Array.isArray(node.qTimerDefinitions) ? node.qTimerDefinitions : [];
      for (let qti = 0; qti < timerDefinitions.length; qti += 1) {
        const timerDefinition = timerDefinitions[qti];
        if (!timerDefinition || typeof timerDefinition !== "object") {
          continue;
        }
        const timerName = normalizeComponentKey(timerDefinition.timerId || timerDefinition.name || timerDefinition.id);
        const clonedTimerDefinition = Object.assign({}, timerDefinition);
        if (!timerName) {
          merged.qTimerDefinitions.push(clonedTimerDefinition);
          continue;
        }
        if (qTimerIndex.has(timerName)) {
          merged.qTimerDefinitions[qTimerIndex.get(timerName)] = clonedTimerDefinition;
        } else {
          qTimerIndex.set(timerName, merged.qTimerDefinitions.length);
          merged.qTimerDefinitions.push(clonedTimerDefinition);
        }
      }

      if (Array.isArray(node.lifecycleScripts) && node.lifecycleScripts.length > 0) {
        for (let li = 0; li < node.lifecycleScripts.length; li += 1) {
          const hook = node.lifecycleScripts[li];
          if (!hook || typeof hook !== "object") {
            continue;
          }
          const hookName = normalizeComponentKey(hook.name);
          const clonedHook = Object.assign({}, hook);
          if (!hookName) {
            merged.lifecycleScripts.push(clonedHook);
            continue;
          }
          if (lifecycleIndex.has(hookName)) {
            merged.lifecycleScripts[lifecycleIndex.get(hookName)] = clonedHook;
          } else {
            lifecycleIndex.set(hookName, merged.lifecycleScripts.length);
            merged.lifecycleScripts.push(clonedHook);
          }
        }
      }

      if (node.wasmConfig && typeof node.wasmConfig === "object" && !Array.isArray(node.wasmConfig)) {
        merged.wasmConfig = Object.assign({}, node.wasmConfig);
      }

      if (Array.isArray(node.templateNodes) && node.templateNodes.length > 0) {
        for (let ti = 0; ti < node.templateNodes.length; ti += 1) {
          merged.templateNodes.push(node.templateNodes[ti]);
        }
      }

      const slotDefaults = readRendererSlotDefaultNodes(node);
      for (let sdi = 0; sdi < slotDefaults.length; sdi += 1) {
        const slotDefault = slotDefaults[sdi];
        if (!slotDefault || typeof slotDefault !== "object") {
          continue;
        }
        const slotKey = normalizeComponentKey(slotDefault.name || "default") || "default";
        if (slotDefaultIndex.has(slotKey)) {
          merged.slotDefaults[slotDefaultIndex.get(slotKey)] = slotDefault;
        } else {
          slotDefaultIndex.set(slotKey, merged.slotDefaults.length);
          merged.slotDefaults.push(slotDefault);
        }
      }

      const behaviorDefinitions =
        node && node.meta && Array.isArray(node.meta.__qhtmlBehaviors)
          ? node.meta.__qhtmlBehaviors
          : [];
      for (let bi = 0; bi < behaviorDefinitions.length; bi += 1) {
        const behavior = behaviorDefinitions[bi];
        const behaviorKey = normalizeComponentKey(behavior && behavior.propertyName);
        if (!behaviorKey) {
          continue;
        }
        if (!Array.isArray(merged.meta.__qhtmlBehaviors)) {
          merged.meta.__qhtmlBehaviors = [];
        }
        const clonedBehavior = Object.assign({}, behavior, {
          animation:
            behavior && behavior.animation && typeof behavior.animation === "object"
              ? Object.assign({}, behavior.animation)
              : behavior ? behavior.animation : null,
          meta:
            behavior && behavior.meta && typeof behavior.meta === "object"
              ? Object.assign({}, behavior.meta)
              : behavior ? behavior.meta : null,
        });
        if (behaviorIndex.has(behaviorKey)) {
          merged.meta.__qhtmlBehaviors[behaviorIndex.get(behaviorKey)] = clonedBehavior;
        } else {
          behaviorIndex.set(behaviorKey, merged.meta.__qhtmlBehaviors.length);
          merged.meta.__qhtmlBehaviors.push(clonedBehavior);
        }
      }

      const cssBindingDefinitions =
        node && node.meta && Array.isArray(node.meta.__qhtmlCssBindings)
          ? node.meta.__qhtmlCssBindings
          : [];
      for (let cbi = 0; cbi < cssBindingDefinitions.length; cbi += 1) {
        const binding = cssBindingDefinitions[cbi];
        const bindingKey =
          normalizeComponentKey(binding && binding.propertyName) +
          "->" +
          String(binding && binding.targetExpression || "").trim();
        if (!bindingKey || bindingKey === "->") {
          continue;
        }
        if (!Array.isArray(merged.meta.__qhtmlCssBindings)) {
          merged.meta.__qhtmlCssBindings = [];
        }
        const clonedBinding = Object.assign({}, binding, {
          meta:
            binding && binding.meta && typeof binding.meta === "object"
              ? Object.assign({}, binding.meta)
              : binding ? binding.meta : null,
        });
        if (cssBindingIndex.has(bindingKey)) {
          merged.meta.__qhtmlCssBindings[cssBindingIndex.get(bindingKey)] = clonedBinding;
        } else {
          cssBindingIndex.set(bindingKey, merged.meta.__qhtmlCssBindings.length);
          merged.meta.__qhtmlCssBindings.push(clonedBinding);
        }
      }

      mergedRepeaterConfig = mergeRepeaterConfig(mergedRepeaterConfig, readComponentRepeaterConfig(node));
      mergedCanvasSemantics = mergedCanvasSemantics || componentNodeHasCanvasSemantics(node);
      if (!mergedRepeaterConfig) {
        const fallbackKeyword = readInheritedRepeaterKeyword(node);
        if (fallbackKeyword) {
          mergedRepeaterConfig = {
            keyword: fallbackKeyword,
            slotName: "item",
            aliasNames: ["item"],
            explicitSlot: false,
            explicitModel: false,
            modelEntries: [],
            modelSource: "",
          };
        }
      }
    }

    if (mergedRepeaterConfig) {
      const filteredTemplateNodes = [];
      const templateCandidates = Array.isArray(merged.templateNodes) ? merged.templateNodes : [];
      for (let ti = 0; ti < templateCandidates.length; ti += 1) {
        const templateNode = templateCandidates[ti];
        if (!templateNode || typeof templateNode !== "object") {
          continue;
        }
        if (templateNode.kind === core.NODE_TYPES.element) {
          const tag = String(templateNode.tagName || "").trim().toLowerCase();
          if (tag === "as" || tag === "slot") {
            const alias = readRepeaterAliasFromTemplateNode(templateNode);
            if (alias) {
              mergedRepeaterConfig.slotName = alias;
              mergedRepeaterConfig.explicitSlot = true;
              const aliases = Array.isArray(mergedRepeaterConfig.aliasNames) ? mergedRepeaterConfig.aliasNames : [];
              let exists = false;
              for (let ai = 0; ai < aliases.length; ai += 1) {
                if (String(aliases[ai] || "").trim() === alias) {
                  exists = true;
                  break;
                }
              }
              if (!exists) {
                aliases.push(alias);
              }
              mergedRepeaterConfig.aliasNames = aliases;
            }
            continue;
          }
          if (tag === "model" || tag === "q-model") {
            continue;
          }
        }
        filteredTemplateNodes.push(templateNode);
      }

      const repeaterNode = core.createRepeaterNode({
        repeaterId: "",
        keyword: String(mergedRepeaterConfig.keyword || "q-model-view").trim().toLowerCase() || "q-model-view",
        slotName: String(mergedRepeaterConfig.slotName || "item").trim() || "item",
        modelEntries: Array.isArray(mergedRepeaterConfig.modelEntries)
          ? mergedRepeaterConfig.modelEntries.slice()
          : [],
        modelSource: String(mergedRepeaterConfig.modelSource || "").trim(),
        templateNodes: filteredTemplateNodes,
        meta: {
          generated: true,
          inherited: true,
          aliasNames: Array.isArray(mergedRepeaterConfig.aliasNames)
            ? mergedRepeaterConfig.aliasNames.slice()
            : [String(mergedRepeaterConfig.slotName || "item").trim() || "item"],
        },
      });
      merged.templateNodes = [repeaterNode];
      if (!merged.meta || typeof merged.meta !== "object") {
        merged.meta = {};
      }
      merged.meta.__qhtmlInheritedRepeaterConfig = {
        keyword: repeaterNode.keyword,
        slotName: repeaterNode.slotName,
        explicitSlot: !!mergedRepeaterConfig.explicitSlot,
        explicitModel: !!mergedRepeaterConfig.explicitModel,
        aliasNames: Array.isArray(mergedRepeaterConfig.aliasNames)
          ? mergedRepeaterConfig.aliasNames.slice()
          : [repeaterNode.slotName],
        modelEntries: Array.isArray(mergedRepeaterConfig.modelEntries)
          ? mergedRepeaterConfig.modelEntries.slice()
          : [],
        modelSource: String(mergedRepeaterConfig.modelSource || "").trim(),
      };
    }

    if (mergedCanvasSemantics) {
      if (!merged.meta || typeof merged.meta !== "object") {
        merged.meta = {};
      }
      merged.meta.__qhtmlInheritedCanvasConfig = {
        enabled: true,
      };
    }

    if (cacheMap) {
      cacheMap.set(cacheKey, merged);
    }
    return merged;
  }

  function collectComponentDefinitionsInNodes(nodes, registry) {
    const items = Array.isArray(nodes) ? nodes : [];
    for (let i = 0; i < items.length; i += 1) {
      const node = items[i];
      if (!node || typeof node !== "object") {
        continue;
      }
      if (node.kind === core.NODE_TYPES.component) {
        const id = String(node.componentId || "").trim().toLowerCase();
        if (id) {
          registry.set(id, node);
        }
      } else if (core.NODE_TYPES.struct && node.kind === core.NODE_TYPES.struct) {
        const id = String(node.structId || node.componentId || "").trim().toLowerCase();
        if (id) {
          registry.set(id, node);
        }
      }
      if (Array.isArray(node.children)) {
        collectComponentDefinitionsInNodes(node.children, registry);
      }
      if (Array.isArray(node.templateNodes)) {
        collectComponentDefinitionsInNodes(node.templateNodes, registry);
      }
      if (Array.isArray(node.slotDefaults)) {
        collectComponentDefinitionsInNodes(node.slotDefaults, registry);
      }
      const slotNodes = readRendererSlotNodes(node);
      if (slotNodes.length > 0) {
        collectComponentDefinitionsInNodes(slotNodes, registry);
      }
      if (core.NODE_TYPES.repeater && node.kind === core.NODE_TYPES.repeater) {
        if (Array.isArray(node.templateNodes)) {
          collectComponentDefinitionsInNodes(node.templateNodes, registry);
        }
        const modelNode =
          core.NODE_TYPES.model &&
          node.model &&
          typeof node.model === "object" &&
          node.model.kind === core.NODE_TYPES.model
            ? node.model
            : null;
        const modelEntries = modelNode && Array.isArray(modelNode.entries)
          ? modelNode.entries
          : Array.isArray(node.modelEntries)
            ? node.modelEntries
            : [];
        for (let j = 0; j < modelEntries.length; j += 1) {
          const entry = modelEntries[j];
          if (!entry || typeof entry !== "object" || !Array.isArray(entry.nodes)) {
            continue;
          }
          collectComponentDefinitionsInNodes(entry.nodes, registry);
        }
      }
    }
  }

  function collectComponentRegistry(documentNode) {
    const registry = new Map();
    if (!documentNode || !Array.isArray(documentNode.nodes)) {
      return registry;
    }
    collectComponentDefinitionsInNodes(documentNode.nodes, registry);
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

  function readRendererSlotDefaultNodes(node) {
    if (!node || typeof node !== "object") {
      return [];
    }
    return Array.isArray(node.slotDefaults) ? node.slotDefaults : [];
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

      if (core.NODE_TYPES.slotDefault && node.kind === core.NODE_TYPES.slotDefault) {
        const slotName = typeof node.name === "string" && node.name.trim() ? String(node.name).trim() : "default";
        out.add(slotName);
      }

      if (Array.isArray(node.children)) {
        collectSlotNames(node.children, out);
      }
      const slotDefaultNodes = readRendererSlotDefaultNodes(node);
      if (slotDefaultNodes.length > 0) {
        collectSlotNames(slotDefaultNodes, out);
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

    const nameSet = collectSlotNames(definitionNode.templateNodes);
    collectSlotNames(readRendererSlotDefaultNodes(definitionNode), nameSet);
    const names = Array.from(nameSet);
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

  function readInlineReferencePath(base, tail) {
    const parts = String(tail || "")
      .split(".")
      .map(function trimInlinePathPart(part) {
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

  function isSimpleDotPathExpression(value) {
    const source = String(value || "").trim();
    if (!source) {
      return false;
    }
    return /^(?:this\.component\.|component\.|this\.)?[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/.test(source);
  }

  function isCanonicalInstancePathExpression(value) {
    const source = String(value || "").trim();
    if (!source) {
      return false;
    }
    return /^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/.test(source);
  }

  function readCandidatePathFromScope(source, scope, thisArg, componentSource, resolutionContext) {
    const expression = String(source || "").trim();
    if (!expression || !isSimpleDotPathExpression(expression)) {
      return { found: false, value: undefined };
    }
    const parts = expression.split(".");
    const head = String(parts[0] || "").trim();
    const tail = parts.slice(1);
    if (!head) {
      return { found: false, value: undefined };
    }

    const candidates = [];
    if (scope && typeof scope === "object" && Object.prototype.hasOwnProperty.call(scope, head)) {
      candidates.push(scope[head]);
    }
    if (thisArg && (typeof thisArg === "object" || typeof thisArg === "function")) {
      try {
        if (Object.prototype.hasOwnProperty.call(thisArg, head) || typeof thisArg[head] !== "undefined") {
          candidates.push(thisArg[head]);
        }
      } catch (ignoredThisPathReadError) {
        // no-op
      }
    }
    if (componentSource && (typeof componentSource === "object" || typeof componentSource === "function")) {
      try {
        if (Object.prototype.hasOwnProperty.call(componentSource, head) || typeof componentSource[head] !== "undefined") {
          candidates.push(componentSource[head]);
        }
      } catch (ignoredComponentPathReadError) {
        // no-op
      }
    }

    for (let i = 0; i < candidates.length; i += 1) {
      const resolved = readPathValueFromBase(candidates[i], tail, resolutionContext);
      if (resolved.found) {
        return resolved;
      }
      if (resolved.cycle) {
        return { found: false, value: undefined, cycle: true };
      }
    }

    const namedCallback = resolveNamedCallbackRuntime(head);
    if (typeof namedCallback === "function") {
      return readPathValueFromBase(namedCallback, tail, resolutionContext);
    }

    return { found: false, value: undefined, cycle: false };
  }

  function resolveInlineComponentSource(thisArg, scope) {
    if (scope && typeof scope === "object" && scope.component) {
      return scope.component;
    }
    if (thisArg && (typeof thisArg === "object" || typeof thisArg === "function")) {
      try {
        if (thisArg.component) {
          return thisArg.component;
        }
      } catch (ignoredReadComponent) {
        // no-op
      }
      if (thisArg.nodeType === 1 && typeof thisArg.closest === "function") {
        const nearest = thisArg.closest("[qhtml-component-instance='1']");
        if (nearest) {
          return nearest;
        }
      }
    }
    return null;
  }

  function collectInlineComponentSymbolNames(componentSource) {
    const out = new Set();
    if (!componentSource || (typeof componentSource !== "object" && typeof componentSource !== "function")) {
      return out;
    }
    const ownKeys = Object.keys(componentSource);
    for (let i = 0; i < ownKeys.length; i += 1) {
      const key = String(ownKeys[i] || "").trim();
      if (key) {
        out.add(key);
      }
    }
    const trackedState =
      componentSource[COMPONENT_PROP_STATE_KEY] &&
      typeof componentSource[COMPONENT_PROP_STATE_KEY] === "object" &&
      !Array.isArray(componentSource[COMPONENT_PROP_STATE_KEY])
        ? componentSource[COMPONENT_PROP_STATE_KEY]
        : null;
    if (trackedState) {
      const trackedKeys = Object.keys(trackedState);
      for (let i = 0; i < trackedKeys.length; i += 1) {
        const key = String(trackedKeys[i] || "").trim();
        if (key) {
          out.add(key);
        }
      }
    }
    let qdomNode = null;
    try {
      qdomNode = typeof componentSource.qdom === "function" ? componentSource.qdom() : null;
    } catch (ignoredReadComponentQdom) {
      qdomNode = null;
    }
    if (qdomNode && typeof qdomNode === "object") {
      const props = qdomNode.props && typeof qdomNode.props === "object" ? qdomNode.props : null;
      if (props) {
        const propKeys = Object.keys(props);
        for (let i = 0; i < propKeys.length; i += 1) {
          const key = String(propKeys[i] || "").trim();
          if (key) {
            out.add(key);
          }
        }
      }
      const declared =
        qdomNode.meta &&
        typeof qdomNode.meta === "object" &&
        Array.isArray(qdomNode.meta.__qhtmlDeclaredProperties)
          ? qdomNode.meta.__qhtmlDeclaredProperties
          : [];
      for (let i = 0; i < declared.length; i += 1) {
        const key = String(declared[i] || "").trim();
        if (key) {
          out.add(key);
        }
      }
    }
    return out;
  }

  function injectInlineComponentSymbols(scope, componentSource) {
    if (!scope || typeof scope !== "object" || !componentSource) {
      return;
    }
    const symbolNames = collectInlineComponentSymbolNames(componentSource);
    symbolNames.forEach(function exposeSymbol(name) {
      if (!name || Object.prototype.hasOwnProperty.call(scope, name)) {
        return;
      }
      try {
        scope[name] = componentSource[name];
      } catch (error) {
        // no-op
      }
    });
  }

  function isQHtmlHostElement(node) {
    if (!node || node.nodeType !== 1) {
      return false;
    }
    return String(node.tagName || "").trim().toLowerCase() === "q-html";
  }

  function normalizeScopedSelectorRootCandidate(candidate) {
    if (!candidate || typeof candidate !== "object") {
      return null;
    }
    if (isQHtmlHostElement(candidate)) {
      return candidate;
    }
    if (typeof candidate.closest === "function") {
      try {
        const closestRoot = candidate.closest("q-html");
        if (closestRoot && isQHtmlHostElement(closestRoot)) {
          return closestRoot;
        }
      } catch (ignoredClosestError) {
        // no-op
      }
    }
    return null;
  }

  function resolveScopedSelectorRoot(thisArg, explicitRoot) {
    const tryResolve = function tryResolve(candidate) {
      const normalized = normalizeScopedSelectorRootCandidate(candidate);
      if (normalized) {
        return normalized;
      }
      if (candidate && (typeof candidate === "object" || typeof candidate === "function")) {
        try {
          if (typeof candidate.qhtmlRoot === "function") {
            const viaQhtmlRoot = normalizeScopedSelectorRootCandidate(candidate.qhtmlRoot());
            if (viaQhtmlRoot) {
              return viaQhtmlRoot;
            }
          }
        } catch (ignoredQHtmlRootError) {
          // no-op
        }
        try {
          if (candidate.component) {
            const fromComponent = normalizeScopedSelectorRootCandidate(candidate.component);
            if (fromComponent) {
              return fromComponent;
            }
          }
        } catch (ignoredComponentError) {
          // no-op
        }
      }
      return null;
    };

    const explicitResolved = tryResolve(explicitRoot);
    if (explicitResolved) {
      return explicitResolved;
    }
    const thisResolved = tryResolve(thisArg);
    if (thisResolved) {
      return thisResolved;
    }
    return null;
  }

  function escapeIdForQuery(rawId) {
    const value = String(rawId || "").trim();
    if (!value) {
      return "";
    }
    if (typeof CSS !== "undefined" && CSS && typeof CSS.escape === "function") {
      return CSS.escape(value);
    }
    return value.replace(/([ #;?%&,.+*~':"!^$[\]()=>|/\\])/g, "\\$1");
  }

  function createScopedSelectorShortcut(thisArg, explicitRoot) {
    return function qhtmlScopedSelectorShortcut(selector) {
      const query = String(selector == null ? "" : selector).trim();
      if (!query) {
        return null;
      }
      const root = resolveScopedSelectorRoot(thisArg, explicitRoot);
      if (!root || typeof root.querySelector !== "function") {
        return null;
      }
      try {
        return root.querySelector(query);
      } catch (ignoredQueryError) {
        return null;
      }
    };
  }

  function ensureScopedSelectorShortcut(target, explicitRoot) {
    const shortcut = createScopedSelectorShortcut(target, explicitRoot);
    if (target && (typeof target === "object" || typeof target === "function")) {
      try {
        Object.defineProperty(target, "__qhtmlScopedSelector", {
          configurable: true,
          enumerable: false,
          writable: true,
          value: shortcut,
        });
      } catch (error) {
        try {
          target.__qhtmlScopedSelector = shortcut;
        } catch (ignoredAssignShortcut) {
          // no-op
        }
      }
    }
    return shortcut;
  }

  function coerceQHtmlFragmentSource(source) {
    if (source == null) {
      return "";
    }
    if (typeof source === "string") {
      return source;
    }
    if (typeof source === "number" || typeof source === "boolean" || typeof source === "bigint") {
      return String(source);
    }
    if (source && typeof source === "object") {
      if (source.__qhtmlFragment === true && typeof source.source === "string") {
        return source.source;
      }
      if (typeof source.source === "string") {
        return source.source;
      }
      if (typeof source.qhtml === "string") {
        return source.qhtml;
      }
      if (typeof source.html === "string") {
        return source.html;
      }
      if (typeof source.textContent === "string") {
        return source.textContent;
      }
    }
    try {
      return String(source);
    } catch (error) {
      try {
        return JSON.stringify(source);
      } catch (jsonError) {
        return "";
      }
    }
  }

  function createQHtmlFragmentToken(source) {
    return {
      __qhtmlFragment: true,
      source: coerceQHtmlFragmentSource(source),
    };
  }

  function isQHtmlFragmentToken(value) {
    return !!(
      value &&
      typeof value === "object" &&
      value[QHTML_FRAGMENT_MARKER] === true &&
      typeof value.source === "string"
    );
  }

  function resolveLiveComponentHostElement(currentHost) {
    if (!currentHost || currentHost.nodeType !== 1) {
      return null;
    }
    if (typeof currentHost.isConnected === "boolean" && currentHost.isConnected) {
      return currentHost;
    }
    let rootHost = null;
    try {
      rootHost = typeof currentHost.qhtmlRoot === "function" ? currentHost.qhtmlRoot() : null;
    } catch (readRootError) {
      rootHost = null;
    }
    let qdomUuid = "";
    try {
      const qdomNode = typeof currentHost.qdom === "function" ? currentHost.qdom() : null;
      qdomUuid =
        qdomNode &&
        qdomNode.meta &&
        typeof qdomNode.meta === "object" &&
        typeof qdomNode.meta.uuid === "string"
          ? String(qdomNode.meta.uuid).trim()
          : "";
    } catch (readUuidError) {
      qdomUuid = "";
    }
    if (rootHost && typeof rootHost.elementForUuid === "function" && qdomUuid) {
      try {
        const mappedByUuid = rootHost.elementForUuid(qdomUuid);
        if (mappedByUuid && mappedByUuid.nodeType === 1) {
          return mappedByUuid;
        }
      } catch (resolveByUuidError) {
        // fallback to id selector below
      }
    }
    if (rootHost && typeof rootHost.querySelector === "function") {
      const hostId = String(currentHost.id || "").trim();
      if (hostId) {
        try {
          const mappedById = rootHost.querySelector("#" + escapeIdForQuery(hostId));
          if (mappedById && mappedById.nodeType === 1) {
            return mappedById;
          }
        } catch (resolveByIdError) {
          // no-op
        }
      }
    }
    return currentHost;
  }

  function createQCallbackWrapper(callbackFn, options) {
    if (typeof callbackFn !== "function") {
      return null;
    }
    const opts = options && typeof options === "object" ? options : {};
    const callbackName = String(opts.name || "").trim();
    const creatorHost = opts.creatorHost && opts.creatorHost.nodeType === 1 ? opts.creatorHost : null;
    const factory = typeof global.QCallback === "function" ? global.QCallback : null;
    if (factory) {
      try {
        const created = factory(callbackFn, {
          name: callbackName,
          creator: creatorHost,
        });
        if (created && typeof created === "function") {
          return created;
        }
      } catch (error) {
        // fallback below
      }
    }
    const wrapped = function qhtmlCallbackFallbackProxy() {
      const args = Array.prototype.slice.call(arguments);
      const runtimeApi = global.QHtml && typeof global.QHtml === "object" ? global.QHtml : null;
      const caller =
        runtimeApi && typeof runtimeApi.getCurrentExecutionHost === "function"
          ? runtimeApi.getCurrentExecutionHost()
          : this && this.nodeType === 1
            ? this
            : null;
      const callerHost = caller && caller.nodeType === 1 ? resolveLiveComponentHostElement(caller) || caller : null;
      const callerUuid = callerHost ? String(readHostQDomUuid(callerHost) || "").trim() : "";
      const callerMeta = {
        caller: callerHost,
        callerUuid: callerUuid,
        callerTag: callerHost ? String(callerHost.tagName || "").trim().toLowerCase() : "",
        timestamp: Date.now(),
      };
      const executionHost = creatorHost ? resolveLiveComponentHostElement(creatorHost) || creatorHost : null;
      ensureScopedSelectorShortcut(executionHost || {}, null);
      return invokeWithRuntimeExecutionHost(executionHost, function invokeQCallbackFallback() {
        return callbackFn.apply(executionHost || null, args.concat([callerMeta]));
      });
    };
    try {
      Object.defineProperty(wrapped, "__qhtmlIsQCallback", {
        value: true,
        configurable: true,
        writable: true,
        enumerable: false,
      });
    } catch (error) {
      wrapped.__qhtmlIsQCallback = true;
    }
    if (callbackName) {
      try {
        Object.defineProperty(wrapped, "__qhtmlCallbackName", {
          value: callbackName,
          configurable: true,
          writable: true,
          enumerable: false,
        });
      } catch (error) {
        wrapped.__qhtmlCallbackName = callbackName;
      }
    }
    return wrapped;
  }

  function isQCallbackFunction(value) {
    return !!(typeof value === "function" && value.__qhtmlIsQCallback === true);
  }

  function withScopedSelectorPrelude(body) {
    const source = String(body == null ? "" : body);
    if (!source.trim()) {
      return source;
    }
    const prelude =
      "const $ = (this && typeof this.__qhtmlScopedSelector === \"function\")" +
      " ? this.__qhtmlScopedSelector : function(){ return null; };\n" +
      "const qhtml = (typeof globalThis !== \"undefined\" && typeof globalThis.qhtml === \"function\")" +
      " ? globalThis.qhtml : function(source){ return { __qhtmlFragment: true, source: String(source == null ? \"\" : source) }; };\n";
    const scopedBlock =
      "const __qhtmlRootHost = (this && this.nodeType === 1 && typeof this.closest === \"function\") ? this.closest(\"q-html\") : null;\n" +
      "const __qhtmlRootNamedValues = (__qhtmlRootHost && __qhtmlRootHost.__qhtmlNamedRuntimeValues && typeof __qhtmlRootHost.__qhtmlNamedRuntimeValues === \"object\") ? __qhtmlRootHost.__qhtmlNamedRuntimeValues : null;\n" +
      "const __qhtmlNearestComponentHost = (this && this.nodeType === 1 && typeof this.closest === \"function\") ? this.closest(\"[qhtml-component-instance='1']\") : null;\n" +
      "const __qhtmlNearestComponentScope = (__qhtmlNearestComponentHost && __qhtmlNearestComponentHost.__qhtmlScriptScope && typeof __qhtmlNearestComponentHost.__qhtmlScriptScope === \"object\") ? __qhtmlNearestComponentHost.__qhtmlScriptScope : null;\n" +
      "const __qhtmlLocalScriptScope = (this && this.__qhtmlScriptScope && typeof this.__qhtmlScriptScope === \"object\") ? this.__qhtmlScriptScope : null;\n" +
      "const __qhtmlNamedValues = (this && this.__qhtmlNamedRuntimeValues && typeof this.__qhtmlNamedRuntimeValues === \"object\") ? this.__qhtmlNamedRuntimeValues : null;\n" +
      "let __qhtmlScriptScope = null;\n" +
      "const __qhtmlResolveRuntimeSymbol = (this && typeof this.__qhtmlResolveSymbol === \"function\") ? function(name){ return this.__qhtmlResolveSymbol(name); }.bind(this) : null;\n" +
      "if (__qhtmlRootNamedValues || __qhtmlNearestComponentScope || __qhtmlNamedValues || __qhtmlLocalScriptScope || __qhtmlResolveRuntimeSymbol) {\n" +
      "  __qhtmlScriptScope = Object.assign(Object.create(null), __qhtmlRootNamedValues || null, __qhtmlNearestComponentScope || null, __qhtmlNamedValues || null, __qhtmlLocalScriptScope || null);\n" +
      "  __qhtmlScriptScope = new Proxy(__qhtmlScriptScope, { has: function(target, prop) { if (prop in target) { return true; } if (__qhtmlResolveRuntimeSymbol) { return typeof __qhtmlResolveRuntimeSymbol(prop) !== 'undefined'; } return false; }, get: function(target, prop) { var current = prop in target ? target[prop] : (__qhtmlResolveRuntimeSymbol ? __qhtmlResolveRuntimeSymbol(prop) : undefined); if (current && current.__qhtmlVarHandle === true && typeof current.get === 'function') { return current.get(); } return current; }, set: function(target, prop, value) { var current = prop in target ? target[prop] : (__qhtmlResolveRuntimeSymbol ? __qhtmlResolveRuntimeSymbol(prop) : undefined); if (current && current.__qhtmlVarHandle === true && typeof current.set === 'function') { current.set(value); return true; } target[prop] = value; return true; } });\n" +
      "}\n" +
      "if (__qhtmlScriptScope) { with(__qhtmlScriptScope) {\n" +
      source +
      "\n} } else {\n" +
      source +
      "\n}\n";
    return prelude + scopedBlock;
  }

  function ensureInlineComponentQdom(componentSource, scope) {
    if (!componentSource || componentSource.nodeType !== 1) {
      return;
    }
    if (typeof componentSource.qdom === "function") {
      return;
    }
    const fallbackQdom = scope && typeof scope === "object" ? scope.componentQdom || null : null;
    if (!fallbackQdom || typeof fallbackQdom !== "object") {
      return;
    }
    try {
      Object.defineProperty(componentSource, "qdom", {
        configurable: true,
        enumerable: false,
        writable: true,
        value: function inlineComponentQdomFallback() {
          return fallbackQdom;
        },
      });
    } catch (error) {
      componentSource.qdom = function inlineComponentQdomFallback() {
        return fallbackQdom;
      };
    }
  }

  function tryResolveInlineReferencePath(expression, thisArg, scope, resolutionContext) {
    const source = String(expression || "").trim();
    if (!source) {
      return { matched: false, value: undefined };
    }
    const componentSource = resolveInlineComponentSource(thisArg, scope);
    if (componentSource) {
      ensureInlineComponentQdom(componentSource, scope);
    }
    if (source === "this.component.qdom()" || source === "component.qdom()") {
      if (componentSource && typeof componentSource.qdom === "function") {
        try {
          return { matched: true, resolved: true, value: componentSource.qdom() };
        } catch (error) {
          return { matched: true, resolved: true, value: null };
        }
      }
      return {
        matched: true,
        resolved: true,
        value: scope && typeof scope === "object" ? scope.componentQdom || null : null,
      };
    }
    if (/^this\.component\.[A-Za-z_$][A-Za-z0-9_$]*(\.[A-Za-z_$][A-Za-z0-9_$]*)*$/.test(source)) {
      const resolvedPath = readPathValueFromBase(componentSource, source.slice("this.component.".length).split("."), resolutionContext);
      return {
        matched: true,
        resolved: resolvedPath.found,
        value: resolvedPath.value,
        cycle: !!resolvedPath.cycle,
      };
    }
    if (/^component\.[A-Za-z_$][A-Za-z0-9_$]*(\.[A-Za-z_$][A-Za-z0-9_$]*)*$/.test(source)) {
      const resolvedPath = readPathValueFromBase(componentSource, source.slice("component.".length).split("."), resolutionContext);
      return {
        matched: true,
        resolved: resolvedPath.found,
        value: resolvedPath.value,
        cycle: !!resolvedPath.cycle,
      };
    }
    if (/^this\.[A-Za-z_$][A-Za-z0-9_$]*(\.[A-Za-z_$][A-Za-z0-9_$]*)*$/.test(source)) {
      const resolvedPath = readPathValueFromBase(thisArg, source.slice("this.".length).split("."), resolutionContext);
      return {
        matched: true,
        resolved: resolvedPath.found,
        value: resolvedPath.value,
        cycle: !!resolvedPath.cycle,
      };
    }
    return { matched: false, value: undefined };
  }

  function resolveQHtmlHostForInlineScope(thisArg, scope) {
    const scopeObj = scope && typeof scope === "object" ? scope : null;
    const explicitRoot = scopeObj ? scopeObj.root || scopeObj.host || null : null;
    const direct = resolveScopedSelectorRoot(thisArg, explicitRoot);
    if (direct) {
      return direct;
    }
    if (scopeObj && isQHtmlHostElement(scopeObj.host)) {
      return scopeObj.host;
    }
    return null;
  }

  function resolveRuntimeFrameForTarget(target, frameKey) {
    const key = String(frameKey || "").trim();
    if (!key) {
      return null;
    }
    const seen = typeof WeakSet === "function" ? new WeakSet() : null;
    let cursor = target;
    while (cursor && (typeof cursor === "object" || typeof cursor === "function")) {
      if (seen) {
        if (seen.has(cursor)) {
          break;
        }
        seen.add(cursor);
      }
      const direct = cursor[key];
      if (direct && typeof direct === "object") {
        return direct;
      }
      if (cursor.component && cursor.component !== cursor) {
        cursor = cursor.component;
        continue;
      }
      if (cursor.nodeType === 1 && typeof cursor.closest === "function") {
        const host = cursor.closest("[qhtml-component-instance='1']");
        if (host && host !== cursor) {
          cursor = host;
          continue;
        }
      }
      break;
    }
    return null;
  }

  function isBareDotWalkExpression(source) {
    const expression = String(source || "").trim();
    if (!expression || !isSimpleDotPathExpression(expression)) {
      return false;
    }
    return (
      expression.indexOf("this.component.") !== 0 &&
      expression.indexOf("component.") !== 0 &&
      expression.indexOf("this.") !== 0 &&
      expression.indexOf(".") !== -1
    );
  }

  function collectCanonicalNamedRootCandidates(scope, thisArg, head) {
    const candidates = [];
    const seen = [];
    const addCandidate = function addCandidate(value) {
      if (typeof value === "undefined") {
        return;
      }
      for (let i = 0; i < seen.length; i += 1) {
        if (seen[i] === value) {
          return;
        }
      }
      seen.push(value);
      candidates.push(value);
    };
    const key = String(head || "").trim();
    if (!key) {
      return candidates;
    }
    if (scope && typeof scope === "object" && Object.prototype.hasOwnProperty.call(scope, key)) {
      addCandidate(scope[key]);
    }
    const addFromNamedStore = function addFromNamedStore(target) {
      if (!target || (typeof target !== "object" && typeof target !== "function")) {
        return;
      }
      const values =
        target.__qhtmlNamedRuntimeValues && typeof target.__qhtmlNamedRuntimeValues === "object"
          ? target.__qhtmlNamedRuntimeValues
          : null;
      if (!values || !Object.prototype.hasOwnProperty.call(values, key)) {
        return;
      }
      addCandidate(values[key]);
    };
    addFromNamedStore(thisArg);
    const resolvedRoot = resolveScopedSelectorRoot(thisArg, scope && scope.root ? scope.root : null);
    addFromNamedStore(resolvedRoot);
    return candidates;
  }

  function normalizeObjectCollection(value) {
    if (!value) {
      return null;
    }
    if (Array.isArray(value)) {
      return value;
    }
    if (typeof value === "object" && typeof value.length === "number" && value.length >= 0) {
      try {
        return Array.prototype.slice.call(value);
      } catch (error) {
        return null;
      }
    }
    return null;
  }

  function resolveCanonicalPathStep(cursor, key) {
    if (cursor == null) {
      return { found: false, value: undefined, ambiguous: false };
    }
    const pathKey = String(key || "").trim();
    if (!pathKey) {
      return { found: false, value: undefined, ambiguous: false };
    }
    if (isOwnerTypeSymbolHandle(cursor)) {
      const ownerTypeName = readOwnerTypeSymbolName(cursor);
      if (ownerTypeName && pathKey === ownerTypeName) {
        const parentOwner = readOwnerTypeParentHandle(cursor);
        return {
          found: true,
          value: parentOwner || cursor,
          ambiguous: false,
        };
      }
    }
    try {
      const direct = cursor[pathKey];
      if (typeof direct !== "undefined") {
        return { found: true, value: direct, ambiguous: false };
      }
    } catch (error) {
      return { found: false, value: undefined, ambiguous: false };
    }

    const asCollection = normalizeObjectCollection(cursor);
    if (asCollection) {
      if (/^\d+$/.test(pathKey)) {
        const index = Number(pathKey);
        if (index >= 0 && index < asCollection.length) {
          return { found: true, value: asCollection[index], ambiguous: false };
        }
        return { found: false, value: undefined, ambiguous: false };
      }
      const matches = [];
      for (let i = 0; i < asCollection.length; i += 1) {
        const entry = asCollection[i];
        if (entry == null) {
          continue;
        }
        let value;
        try {
          value = entry[pathKey];
        } catch (error) {
          continue;
        }
        if (typeof value !== "undefined") {
          matches.push(value);
        }
      }
      if (matches.length === 1) {
        return { found: true, value: matches[0], ambiguous: false };
      }
      if (matches.length > 1) {
        return { found: false, value: undefined, ambiguous: true };
      }
    }

    if (cursor && cursor.nodeType === 1 && typeof cursor.querySelectorAll === "function") {
      let children = null;
      try {
        children = cursor.querySelectorAll("[qhtml-component-instance='1']");
      } catch (error) {
        children = null;
      }
      if (children && typeof children.length === "number") {
        const matches = [];
        for (let i = 0; i < children.length; i += 1) {
          const child = children[i];
          if (!child || child === cursor) {
            continue;
          }
          let value;
          try {
            value = child[pathKey];
          } catch (error) {
            continue;
          }
          if (typeof value !== "undefined") {
            matches.push(value);
          }
        }
        if (matches.length === 1) {
          return { found: true, value: matches[0], ambiguous: false };
        }
        if (matches.length > 1) {
          return { found: false, value: undefined, ambiguous: true };
        }
      }
    }

    return { found: false, value: undefined, ambiguous: false };
  }

  function readCanonicalPathValueFromBase(base, pathParts, resolutionContext) {
    const context = createPathResolutionContext(resolutionContext);
    let cursor = base;
    if (markPathResolutionVisit(cursor, context)) {
      return { found: false, value: undefined, ambiguous: false, cycle: true };
    }
    const parts = Array.isArray(pathParts) ? pathParts : [];
    for (let i = 0; i < parts.length; i += 1) {
      const step = resolveCanonicalPathStep(cursor, parts[i]);
      if (step.ambiguous) {
        return { found: false, value: undefined, ambiguous: true, cycle: false };
      }
      if (!step.found) {
        return { found: false, value: undefined, ambiguous: false, cycle: false };
      }
      cursor = step.value;
      if (markPathResolutionVisit(cursor, context)) {
        return { found: false, value: undefined, ambiguous: false, cycle: true };
      }
    }
    return { found: true, value: cursor, ambiguous: false, cycle: false };
  }

  function resolveCanonicalPropertyReferenceExpression(expression, scope, thisArg, resolutionContext) {
    const source = String(expression || "").trim();
    if (!isCanonicalInstancePathExpression(source)) {
      return { matched: false, resolved: false, value: undefined, ambiguous: false };
    }
    const parts = source.split(".");
    const head = String(parts[0] || "").trim();
    const tail = parts.slice(1);
    const roots = collectCanonicalNamedRootCandidates(scope, thisArg, head);
    if (roots.length === 0) {
      return { matched: true, resolved: false, value: undefined, ambiguous: false };
    }
    const root = roots[0];
    const resolved = readCanonicalPathValueFromBase(root, tail, resolutionContext);
    if (resolved.ambiguous) {
      return { matched: true, resolved: false, value: "", ambiguous: true };
    }
    if (resolved.cycle) {
      return { matched: true, resolved: false, value: "", ambiguous: false, cycle: true };
    }
    if (!resolved.found) {
      return { matched: true, resolved: false, value: undefined, ambiguous: false };
    }
    return { matched: true, resolved: true, value: resolved.value, ambiguous: false };
  }

  function resolveScopedDotWalkExpression(source, scope, resolutionContext) {
    const expression = String(source || "").trim();
    if (!expression || expression.indexOf(".") === -1) {
      return { matched: false, resolved: false, value: undefined };
    }
    const parts = expression.split(".");
    const head = String(parts[0] || "").trim();
    const tail = parts.slice(1);
    if (!head || !scope || typeof scope !== "object" || !Object.prototype.hasOwnProperty.call(scope, head)) {
      return { matched: false, resolved: false, value: undefined };
    }
    const resolved = readPathValueFromBase(scope[head], tail, resolutionContext);
    if (resolved.cycle) {
      return { matched: true, resolved: false, value: "", cycle: true };
    }
    if (!resolved.found) {
      return { matched: true, resolved: false, value: undefined, cycle: false };
    }
    return { matched: true, resolved: true, value: resolved.value, cycle: false };
  }

  function mergeNamedRuntimeValuesIntoInlineScope(scope, thisArg) {
    if (!scope || typeof scope !== "object") {
      return;
    }
    const host = resolveQHtmlHostForInlineScope(thisArg, scope);
    if (!host || !host.__qhtmlNamedRuntimeValues || typeof host.__qhtmlNamedRuntimeValues !== "object") {
      return;
    }
    const values = host.__qhtmlNamedRuntimeValues;
    const names = Object.keys(values);
    const lexicalFrame =
      resolveRuntimeFrameForTarget(scope, QCONTEXT_SCOPE_FRAME_KEY) ||
      resolveRuntimeFrameForTarget(thisArg, QCONTEXT_SCOPE_FRAME_KEY) ||
      resolveRuntimeFrameForTarget(scope.component, QCONTEXT_SCOPE_FRAME_KEY);
    for (let i = 0; i < names.length; i += 1) {
      const name = String(names[i] || "").trim();
      if (!name || Object.prototype.hasOwnProperty.call(scope, name)) {
        continue;
      }
      if (
        lexicalFrame &&
        typeof lexicalFrame.has === "function" &&
        lexicalFrame.has(name)
      ) {
        continue;
      }
      scope[name] = values[name];
    }
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
    const resolvedComponent = resolveInlineComponentSource(thisArg, scope);
    if (resolvedComponent) {
      scope.component = resolvedComponent;
      ensureInlineComponentQdom(resolvedComponent, scope);
      injectInlineComponentSymbols(scope, resolvedComponent);
    }
    if (scope.component && (typeof thisArg === "object" || typeof thisArg === "function") && thisArg) {
      try {
        thisArg.component = scope.component;
      } catch (ignoredAssignComponent) {
        // no-op
      }
    }
    if (!Object.prototype.hasOwnProperty.call(scope, "$")) {
      scope.$ = createScopedSelectorShortcut(
        thisArg || scope.component || null,
        scope.root || scope.host || null
      );
    }
    if (thisArg && (typeof thisArg === "object" || typeof thisArg === "function")) {
      ensureScopedSelectorShortcut(thisArg, scope.root || scope.host || null);
    }
    mergeNamedRuntimeValuesIntoInlineScope(scope, thisArg);
    return scope;
  }

  function warnPathResolutionCycle(source, resolutionContext) {
    if (!resolutionContext || resolutionContext.cycleDetected !== true) {
      return;
    }
    if (global.console && typeof global.console.warn === "function") {
      global.console.warn(
        "qhtml property reference cycle detected:",
        String(source || ""),
        resolutionContext.cycleToken || resolutionContext.cycleNode || ""
      );
    }
  }

  function evaluateInlineReferenceExpression(expression, thisArg, scope, errorLabel, options) {
    const source = String(expression || "").trim();
    if (!source) {
      return "";
    }
    const opts = options && typeof options === "object" ? options : null;
    const pathFallbackLiteral = !(opts && opts.pathFallbackLiteral === false);
    const resolutionContext = createPathResolutionContext(opts && opts.resolutionContext ? opts.resolutionContext : null);
    const directPathResult = tryResolveInlineReferencePath(source, thisArg, scope, resolutionContext);
    if (directPathResult.matched) {
      if (directPathResult.cycle) {
        warnPathResolutionCycle(source, resolutionContext);
        return "";
      }
      if (directPathResult.resolved === false) {
        return pathFallbackLiteral ? source : "";
      }
      return unwrapModelMethodBridgeValue(directPathResult.value, source);
    }
    if (isBareDotWalkExpression(source)) {
      const resolvedScopedDotWalk = resolveScopedDotWalkExpression(source, scope, resolutionContext);
      if (resolvedScopedDotWalk.matched) {
        if (resolvedScopedDotWalk.cycle) {
          warnPathResolutionCycle(source, resolutionContext);
          return "";
        }
        if (resolvedScopedDotWalk.resolved) {
          return unwrapModelMethodBridgeValue(resolvedScopedDotWalk.value, source);
        }
        return pathFallbackLiteral ? source : "";
      }
      const allowBareDotWalk = !!(opts && opts.allowBareDotWalk === true);
      if (!allowBareDotWalk) {
        return pathFallbackLiteral ? source : "";
      }
      const resolvedCanonical = resolveCanonicalPropertyReferenceExpression(source, scope, thisArg, resolutionContext);
      if (resolvedCanonical.matched && resolvedCanonical.resolved) {
        return unwrapModelMethodBridgeValue(resolvedCanonical.value, source);
      }
      if (resolvedCanonical.cycle) {
        warnPathResolutionCycle(source, resolutionContext);
        return "";
      }
      if (resolvedCanonical.ambiguous && global.console && typeof global.console.warn === "function") {
        global.console.warn("qhtml dot-walk warning: ambiguous path resolved to empty string:", source);
      }
      return pathFallbackLiteral ? source : "";
    }
    try {
      const evaluator = new Function("__qhtmlScope", "with(__qhtmlScope){ return (" + source + "); }");
      const evaluatedValue = evaluator.call(thisArg || scope, scope);
      return unwrapModelMethodBridgeValue(evaluatedValue, source);
    } catch (error) {
      if (global.console && typeof global.console.error === "function") {
        global.console.error(errorLabel || "qhtml inline expression evaluation failed:", error);
      }
      return "";
    }
  }

  function unwrapModelMethodBridgeValue(value, expressionSource) {
    if (isQVarHandle(value)) {
      return readQVarHandleValue(value);
    }
    if (!value || typeof value !== "function") {
      return value;
    }
    if (value.__qhtmlIsQModelMethodBridge !== true || typeof value.__qhtmlReadDataValue !== "function") {
      return value;
    }
    const source = String(expressionSource || "");
    if (source.indexOf("(") !== -1) {
      return value;
    }
    try {
      return value.__qhtmlReadDataValue();
    } catch (readBridgeValueError) {
      return value;
    }
  }

  function formatInlineReferenceReplacement(value, options) {
    const opts = options && typeof options === "object" ? options : null;
    const asScriptLiteral = !!(opts && opts.scriptLiteral === true);
    if (!asScriptLiteral) {
      return value == null ? "" : String(value);
    }
    if (value === null) {
      return "null";
    }
    if (typeof value === "undefined") {
      return "undefined";
    }
    if (typeof value === "string") {
      return JSON.stringify(value);
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    if (typeof value === "bigint") {
      return String(value) + "n";
    }
    return String(value);
  }

  function interpolateInlineReferenceExpressions(source, thisArg, extraScope, errorLabel, options) {
    const text = String(source == null ? "" : source);
    if (!hasInlineReferenceExpressions(text)) {
      return text;
    }
    const escaped = text.replace(/\\\$\{/g, INLINE_REFERENCE_ESCAPE_TOKEN);
    const scope = resolveInlineExpressionScope(thisArg, extraScope);
    const replaced = escaped.replace(INLINE_REFERENCE_PATTERN, function replaceInlineReference(matchText, expressionText) {
      const value = evaluateInlineReferenceExpression(expressionText, thisArg, scope, errorLabel, options);
      return formatInlineReferenceReplacement(value, options);
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

  function resolveComponentQdomForInterpolation(context) {
    const stack = context && Array.isArray(context.componentQdomStack) ? context.componentQdomStack : [];
    if (stack.length > 0) {
      return stack[stack.length - 1];
    }
    return null;
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
    const sourceContext = opts.sourceContext && typeof opts.sourceContext === "object" ? opts.sourceContext : null;
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
          sourceContext: sourceContext,
        };
      bucket.nodes.push(value);
      if (resolvedSlotNode && !bucket.slotNode) {
        bucket.slotNode = resolvedSlotNode;
      }
      if (sourceContext && !bucket.sourceContext) {
        bucket.sourceContext = sourceContext;
      }
      fills.set(key, bucket);
    }

    function ensureFill(slotName, sourceSlotNode, synthesizeSlotRef) {
      const key = String(slotName || "default").trim() || "default";
      if (fills.has(key)) {
        const existing = fills.get(key);
        if (sourceSlotNode && existing && !existing.slotNode) {
          existing.slotNode = sourceSlotNode;
        }
        return existing;
      }
      const resolvedSlotNode = sourceSlotNode || (synthesizeSlotRef ? createRuntimeSlotRef(key) : null);
      const bucket = {
        nodes: [],
        slotNode: resolvedSlotNode || null,
        sourceContext: sourceContext,
      };
      fills.set(key, bucket);
      return bucket;
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

    const declaredSlotNodes = readRendererSlotNodes(instanceNode);
    if (declaredSlotNodes.length > 0) {
      for (let i = 0; i < declaredSlotNodes.length; i += 1) {
        const slotNode = declaredSlotNodes[i];
        if (!slotNode || slotNode.kind !== core.NODE_TYPES.slot) {
          continue;
        }

        const slotName = String(slotNode.name || "default").trim() || "default";
        const slotChildren = Array.isArray(slotNode.children) ? slotNode.children : [];
        ensureFill(slotName, slotNode, false);
        if (slotChildren.length > 0) {
          for (let j = 0; j < slotChildren.length; j += 1) {
            const normalized = collectNormalizedSlotChildren(slotName, slotChildren[j], []);
            for (let k = 0; k < normalized.length; k += 1) {
              pushFill(slotName, normalized[k], slotNode, false);
            }
          }
        } else if (typeof slotNode.textContent === "string" && slotNode.textContent.length > 0) {
          pushFill(slotName, createTextFillNode(slotNode.textContent), slotNode, false);
        }
      }

      return fills;
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

  function buildSlotDefaultFills(definitionNode) {
    const defaults = readRendererSlotDefaultNodes(definitionNode);
    const out = new Map();
    for (let i = 0; i < defaults.length; i += 1) {
      const slotDefault = defaults[i];
      if (!slotDefault || typeof slotDefault !== "object") {
        continue;
      }
      const key = String(slotDefault.name || "default").trim() || "default";
      out.set(key, {
        nodes: Array.isArray(slotDefault.children) ? slotDefault.children : [],
        slotDefaultNode: slotDefault,
      });
    }
    return out;
  }

  function materializeSlots(nodes, slotFills, slotDefaults) {
    const out = [];

    function readSlotFillEntry(slotName) {
      const requestedName = String(slotName || "default").trim() || "default";
      if (!(slotFills instanceof Map)) {
        return null;
      }
      if (slotFills.has(requestedName)) {
        return slotFills.get(requestedName);
      }
      const requestedLower = requestedName.toLowerCase();
      const entries = slotFills.entries();
      let next = entries.next();
      while (!next.done) {
        const key = String(next.value[0] || "").trim();
        if (key.toLowerCase() === requestedLower) {
          return next.value[1];
        }
        next = entries.next();
      }
      return null;
    }

    function readSlotDefaultEntry(slotName) {
      const requestedName = String(slotName || "default").trim() || "default";
      if (!(slotDefaults instanceof Map)) {
        return null;
      }
      if (slotDefaults.has(requestedName)) {
        return slotDefaults.get(requestedName);
      }
      const requestedLower = requestedName.toLowerCase();
      const entries = slotDefaults.entries();
      let next = entries.next();
      while (!next.done) {
        const key = String(next.value[0] || "").trim();
        if (key.toLowerCase() === requestedLower) {
          return next.value[1];
        }
        next = entries.next();
      }
      return null;
    }

    for (let i = 0; i < nodes.length; i += 1) {
      const node = nodes[i];
      if (!node || typeof node !== "object") {
        continue;
      }

      if (node.kind === core.NODE_TYPES.element && node.tagName === "slot") {
        const slotName = node.attributes && typeof node.attributes.name === "string" ? node.attributes.name : "default";
        const fillEntry = readSlotFillEntry(slotName);
        const defaultEntry = fillEntry ? null : readSlotDefaultEntry(slotName);
        const effectiveEntry = fillEntry || defaultEntry;
        const fillNodes = effectiveEntry && Array.isArray(effectiveEntry.nodes) ? effectiveEntry.nodes : [];
        if (fillNodes.length > 0) {
          for (let j = 0; j < fillNodes.length; j += 1) {
            const projected = cloneNodeDeep(fillNodes[j]);
            refreshQDomNodeUuidsDeep(projected);
            if (effectiveEntry && effectiveEntry.slotNode && projected && typeof projected === "object") {
              projected[RENDER_SLOT_REF] = effectiveEntry.slotNode;
            }
            if (effectiveEntry && effectiveEntry.sourceContext && projected && typeof projected === "object") {
              projected[RENDER_SLOT_CONTEXT] = effectiveEntry.sourceContext;
            }
            out.push(projected);
          }
        } else if (!effectiveEntry && Array.isArray(node.children) && node.children.length > 0) {
          const fallback = materializeSlots(node.children, slotFills, slotDefaults);
          for (let j = 0; j < fallback.length; j += 1) {
            out.push(fallback[j]);
          }
        }
        continue;
      }

      const clone = cloneNodeDeep(node);
      refreshQDomNodeUuidsDeep(clone);
      if (clone.kind === core.NODE_TYPES.element && Array.isArray(clone.children) && clone.children.length > 0) {
        clone.children = materializeSlots(clone.children, slotFills, slotDefaults);
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
            slotNode.children = materializeSlots(slotNode.children, slotFills, slotDefaults);
          }
        }
        writeRendererSlotNodes(clone, slotNodes);
      }
      if (
        (clone.kind === core.NODE_TYPES.componentInstance || clone.kind === core.NODE_TYPES.templateInstance) &&
        Array.isArray(clone.children) &&
        clone.children.length > 0
      ) {
        clone.children = materializeSlots(clone.children, slotFills, slotDefaults);
      }
      if (core.NODE_TYPES.repeater && clone.kind === core.NODE_TYPES.repeater) {
        if (Array.isArray(clone.templateNodes) && clone.templateNodes.length > 0) {
          clone.templateNodes = materializeSlots(clone.templateNodes, slotFills, slotDefaults);
        }
      }
      if (clone.kind === core.NODE_TYPES.slot && Array.isArray(clone.children) && clone.children.length > 0) {
        clone.children = materializeSlots(clone.children, slotFills, slotDefaults);
      }
      out.push(clone);
    }

    return out;
  }

  function readQAnchorRulesFromNode(node) {
    const meta = node && node.meta && typeof node.meta === "object" ? node.meta : null;
    const rules = meta && Array.isArray(meta.__qhtmlAnchorRules) ? meta.__qhtmlAnchorRules : [];
    const out = [];
    for (let i = 0; i < rules.length; i += 1) {
      const rule = rules[i] && typeof rules[i] === "object" ? rules[i] : {};
      const key = String(rule.key || "").trim().toLowerCase();
      if (!key) {
        continue;
      }
      out.push({
        key: key,
        value: String(rule.value == null ? "" : rule.value).trim(),
      });
    }
    return out;
  }

  function readQAnchorRulesFromNodes(nodes) {
    const list = Array.isArray(nodes) ? nodes : [nodes];
    const out = [];
    for (let i = 0; i < list.length; i += 1) {
      const rules = readQAnchorRulesFromNode(list[i]);
      for (let j = 0; j < rules.length; j += 1) {
        out.push(rules[j]);
      }
    }
    return out;
  }

  function resolveQAnchorHandleTarget(value) {
    if (isContextSymbolHandle(value)) {
      return readHandleResolutionTarget(value);
    }
    return value && typeof value === "object" ? value : null;
  }

  function normalizeQAnchorCssValue(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value) + "px";
    }
    return String(value == null ? "" : value).trim();
  }

  function qAnchorOffsetParentForElement(element) {
    if (!element || !element.ownerDocument) {
      return null;
    }
    return element.offsetParent || element.parentElement || element.ownerDocument.documentElement || null;
  }

  function qAnchorCoordinateFrame(element) {
    const ownerDocument = element && element.ownerDocument ? element.ownerDocument : null;
    const parent = qAnchorOffsetParentForElement(element);
    const rect =
      parent && typeof parent.getBoundingClientRect === "function"
        ? parent.getBoundingClientRect()
        : { left: 0, top: 0 };
    return {
      element: parent,
      left: Number(rect && rect.left) || 0,
      top: Number(rect && rect.top) || 0,
      scrollLeft: parent && typeof parent.scrollLeft === "number" ? parent.scrollLeft : 0,
      scrollTop: parent && typeof parent.scrollTop === "number" ? parent.scrollTop : 0,
      document: ownerDocument,
    };
  }

  function qAnchorSideValue(target, side, frame) {
    const element = resolveQAnchorHandleTarget(target);
    if (!element || typeof element.getBoundingClientRect !== "function") {
      return null;
    }
    const rect = element.getBoundingClientRect();
    const relativeLeft = Number(rect.left || 0) - frame.left + frame.scrollLeft;
    const relativeTop = Number(rect.top || 0) - frame.top + frame.scrollTop;
    const width = Number(rect.width || 0);
    const height = Number(rect.height || 0);
    if (side === "left") {
      return relativeLeft;
    }
    if (side === "right") {
      return relativeLeft + width;
    }
    if (side === "top") {
      return relativeTop;
    }
    if (side === "bottom") {
      return relativeTop + height;
    }
    if (side === "hcenter") {
      return relativeLeft + width / 2;
    }
    if (side === "vcenter") {
      return relativeTop + height / 2;
    }
    if (side === "center") {
      return {
        x: relativeLeft + width / 2,
        y: relativeTop + height / 2,
      };
    }
    return null;
  }

  function resolveQAnchorSideReference(expression, context, element, frame) {
    const source = String(expression || "").trim();
    const match = source.match(/^(.+)\.(left|right|top|bottom|center|hcenter|vcenter)$/);
    if (!match) {
      return { matched: false, value: null };
    }
    const baseExpression = String(match[1] || "").trim();
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/.test(baseExpression)) {
      return { matched: false, value: null };
    }
    const side = String(match[2] || "").trim().toLowerCase();
    const resolution = tryResolveDirectSymbolValue(baseExpression, context, element, createPathResolutionContext());
    if (!resolution || !resolution.matched || !resolution.found) {
      return { matched: true, value: null };
    }
    return {
      matched: true,
      value: qAnchorSideValue(resolution.value, side, frame),
    };
  }

  function evaluateQAnchorExpression(expression, context, element) {
    const source = String(expression || "").trim();
    if (!source) {
      return "";
    }
    const direct = tryResolveDirectSymbolValue(source, context, element, createPathResolutionContext());
    if (direct && direct.matched && direct.found) {
      return direct.value;
    }

    const scope = buildInterpolationScope(context, element);
    const ownerDocument = element && element.ownerDocument ? element.ownerDocument : global.document || null;
    const ownerWindow = ownerDocument && ownerDocument.defaultView ? ownerDocument.defaultView : global.window || global;
    const names = Object.keys(scope || {}).filter(function filterScopeName(name) {
      return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);
    });
    const values = names.map(function mapScopeValue(name) {
      return scope[name];
    });
    names.push("document");
    values.push(ownerDocument);
    names.push("window");
    values.push(ownerWindow);
    try {
      const fn = Function.apply(null, names.concat(["return (" + source + ");"]));
      return fn.apply(element, values);
    } catch (error) {
      return source;
    }
  }

  function assignQAnchorAxis(element, axis, targetCoordinate) {
    if (!element || !element.style || targetCoordinate == null || targetCoordinate === "") {
      return;
    }
    const coordinate = Number(targetCoordinate);
    if (!Number.isFinite(coordinate)) {
      const cssValue = normalizeQAnchorCssValue(targetCoordinate);
      if (!cssValue) {
        return;
      }
      if (axis === "left" || axis === "right") {
        element.style.left = cssValue;
      } else {
        element.style.top = cssValue;
      }
      return;
    }
    const rect =
      typeof element.getBoundingClientRect === "function"
        ? element.getBoundingClientRect()
        : { width: 0, height: 0 };
    if (axis === "left") {
      element.style.left = String(coordinate) + "px";
    } else if (axis === "right") {
      element.style.left = String(coordinate - (Number(rect.width) || 0)) + "px";
    } else if (axis === "top") {
      element.style.top = String(coordinate) + "px";
    } else if (axis === "bottom") {
      element.style.top = String(coordinate - (Number(rect.height) || 0)) + "px";
    } else if (axis === "hcenter") {
      element.style.left = String(coordinate - (Number(rect.width) || 0) / 2) + "px";
    } else if (axis === "vcenter") {
      element.style.top = String(coordinate - (Number(rect.height) || 0) / 2) + "px";
    }
  }

  function applyQAnchorRule(element, rule, context, frame) {
    const key = String(rule && rule.key || "").trim().toLowerCase();
    const expression = String(rule && rule.value || "").trim();
    if (!key || !expression) {
      return;
    }
    const sideReference = resolveQAnchorSideReference(expression, context, element, frame);
    const resolved = sideReference.matched
      ? sideReference.value
      : evaluateQAnchorExpression(expression, context, element);
    if (resolved == null || resolved === "") {
      return;
    }
    if (key === "center") {
      if (typeof resolved === "object") {
        const x = Object.prototype.hasOwnProperty.call(resolved, "x") ? resolved.x : resolved.hcenter;
        const y = Object.prototype.hasOwnProperty.call(resolved, "y") ? resolved.y : resolved.vcenter;
        assignQAnchorAxis(element, "hcenter", x);
        assignQAnchorAxis(element, "vcenter", y);
      } else {
        assignQAnchorAxis(element, "hcenter", resolved);
        assignQAnchorAxis(element, "vcenter", resolved);
      }
      return;
    }
    assignQAnchorAxis(element, key, resolved);
  }

  function applyQAnchorBinding(binding) {
    const element = binding && binding.element ? binding.element : null;
    if (!element || !element.style || (typeof element.isConnected === "boolean" && !element.isConnected)) {
      return;
    }
    const rules = Array.isArray(binding.rules) ? binding.rules : [];
    if (rules.length === 0) {
      return;
    }
    const currentPosition = String(element.style.position || "").trim().toLowerCase();
    if (!currentPosition || currentPosition === "static") {
      element.style.position = "absolute";
    }
    const frame = qAnchorCoordinateFrame(element);
    for (let i = 0; i < rules.length; i += 1) {
      applyQAnchorRule(element, rules[i], binding.context || {}, frame);
    }
  }

  function applyRegisteredQAnchors() {
    qAnchorApplyScheduled = false;
    for (let i = 0; i < qAnchorBindingList.length; i += 1) {
      applyQAnchorBinding(qAnchorBindingList[i]);
    }
  }

  function scheduleQAnchorApplication() {
    if (qAnchorApplyScheduled) {
      return;
    }
    qAnchorApplyScheduled = true;
    const schedule =
      global && typeof global.requestAnimationFrame === "function"
        ? global.requestAnimationFrame
        : typeof global.setTimeout === "function"
          ? function qAnchorTimeout(cb) { global.setTimeout(cb, 0); }
          : null;
    if (schedule) {
      schedule(applyRegisteredQAnchors);
    } else {
      applyRegisteredQAnchors();
    }
  }

  function installQAnchorDocumentListeners(doc) {
    if (!doc || !doc.defaultView) {
      return;
    }
    if (qAnchorListenerDocuments && qAnchorListenerDocuments.has(doc)) {
      return;
    }
    if (qAnchorListenerDocuments) {
      qAnchorListenerDocuments.add(doc);
    } else if (doc.__qhtmlAnchorListenersInstalled) {
      return;
    } else {
      doc.__qhtmlAnchorListenersInstalled = true;
    }
    const win = doc.defaultView;
    if (win && typeof win.addEventListener === "function") {
      win.addEventListener("resize", scheduleQAnchorApplication);
      win.addEventListener("scroll", scheduleQAnchorApplication, true);
    }
  }

  function registerQAnchorTarget(element, nodes, context) {
    if (!element || !element.ownerDocument) {
      return;
    }
    const rules = readQAnchorRulesFromNodes(nodes);
    if (rules.length === 0) {
      return;
    }
    let binding = qAnchorBindings ? qAnchorBindings.get(element) : null;
    if (!binding) {
      binding = {
        element: element,
        rules: [],
        context: context || {},
      };
      if (qAnchorBindings) {
        qAnchorBindings.set(element, binding);
      }
      qAnchorBindingList.push(binding);
    }
    binding.rules = rules;
    binding.context = context || binding.context || {};
    installQAnchorDocumentListeners(element.ownerDocument);
    applyQAnchorBinding(binding);
    scheduleQAnchorApplication();
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

  function isDomEventAttributeName(attributeName) {
    const key = String(attributeName || "").trim().toLowerCase();
    if (!key || key.length <= 2 || key.indexOf("on") !== 0) {
      return false;
    }
    return key !== "onready";
  }

  function ensureEventAttributeListenerStore(element) {
    if (!element || element.nodeType !== 1) {
      return null;
    }
    let store = element.__qhtmlEventAttributeListeners;
    if (!store || typeof store !== "object") {
      store = {};
      element.__qhtmlEventAttributeListeners = store;
    }
    return store;
  }

  function createEventNameVariants(rawEventName) {
    const base = String(rawEventName || "").trim();
    if (!base) {
      return [];
    }
    const seen = new Set();
    const out = [];
    function push(name) {
      const value = String(name || "").trim();
      if (!value || seen.has(value)) {
        return;
      }
      seen.add(value);
      out.push(value);
    }
    push(base);
    push(base.toLowerCase());
    push(base.toUpperCase());
    push(base.charAt(0).toLowerCase() + base.slice(1));
    push(base.charAt(0).toUpperCase() + base.slice(1));
    const lowerBase = base.toLowerCase();
    if (lowerBase.endsWith("changed")) {
      const stem = base.slice(0, base.length - "changed".length);
      if (stem) {
        push(stem.charAt(0).toLowerCase() + stem.slice(1) + "Changed");
      }
    }
    return out;
  }

  function hasExactEventName(eventNames, targetName) {
    const list = Array.isArray(eventNames) ? eventNames : [];
    const target = String(targetName || "").trim();
    if (!target) {
      return false;
    }
    for (let i = 0; i < list.length; i += 1) {
      if (String(list[i] || "").trim() === target) {
        return true;
      }
    }
    return false;
  }

  function detachEventAttributeListener(element, attributeName) {
    if (!element || element.nodeType !== 1) {
      return;
    }
    const key = String(attributeName || "").trim().toLowerCase();
    if (!key) {
      return;
    }
    const store = ensureEventAttributeListenerStore(element);
    if (!store || !store[key]) {
      return;
    }
    const entry = store[key];
    try {
      if (
        entry &&
        entry.runtimeSignalRegistration &&
        global.QHtml &&
        typeof global.QHtml.unregisterSignalSubscriber === "function"
      ) {
        const runtimeReg = entry.runtimeSignalRegistration;
        if (runtimeReg.token != null) {
          global.QHtml.unregisterSignalSubscriber({ token: runtimeReg.token });
        } else if (runtimeReg.emitterUuid && runtimeReg.signalName && runtimeReg.routeKey) {
          global.QHtml.unregisterSignalSubscriber({
            emitterUuid: runtimeReg.emitterUuid,
            signalName: runtimeReg.signalName,
            routeKey: runtimeReg.routeKey,
          });
        }
      }
      if (
        entry &&
        entry.runtimeSignalReference &&
        global.QHtml &&
        typeof global.QHtml.unregisterSignalReference === "function"
      ) {
        const runtimeRef = entry.runtimeSignalReference;
        if (runtimeRef.emitterUuid && runtimeRef.referenceKey) {
          global.QHtml.unregisterSignalReference({
            emitterUuid: runtimeRef.emitterUuid,
            referenceKey: runtimeRef.referenceKey,
          });
        }
      }
      const eventNames = Array.isArray(entry.eventNames) && entry.eventNames.length > 0
        ? entry.eventNames
        : [entry.eventName];
      for (let i = 0; i < eventNames.length; i += 1) {
        const name = String(eventNames[i] || "").trim();
        if (!name) {
          continue;
        }
        element.removeEventListener(name, entry.handler);
      }
      if (typeof entry.signalBridge === "function") {
        element.removeEventListener("q-signal", entry.signalBridge);
      }
    } catch (error) {
      // ignore listener detach failures
    }
    delete store[key];
  }

  function invokeWithRuntimeExecutionHost(host, callback) {
    if (typeof callback !== "function") {
      return undefined;
    }
    const runtimeApi = global.QHtml && typeof global.QHtml === "object" ? global.QHtml : null;
    if (runtimeApi && typeof runtimeApi.runWithExecutionHost === "function") {
      return runtimeApi.runWithExecutionHost(host && host.nodeType === 1 ? host : null, callback);
    }
    return callback();
  }

  function rewriteHashSelectorShorthand(source) {
    const input = String(source == null ? "" : source);
    if (!input || input.indexOf("#") === -1) {
      return input;
    }
    let out = "";
    let inSingle = false;
    let inDouble = false;
    let inBacktick = false;
    let inLineComment = false;
    let inBlockComment = false;
    let escaped = false;
    let i = 0;
    while (i < input.length) {
      const ch = input[i];
      const next = i + 1 < input.length ? input[i + 1] : "";
      if (inLineComment) {
        out += ch;
        if (ch === "\n" || ch === "\r") {
          inLineComment = false;
        }
        i += 1;
        continue;
      }
      if (inBlockComment) {
        out += ch;
        if (ch === "*" && next === "/") {
          out += "/";
          i += 2;
          inBlockComment = false;
          continue;
        }
        i += 1;
        continue;
      }
      if (inSingle) {
        out += ch;
        if (escaped) {
          escaped = false;
          i += 1;
          continue;
        }
        if (ch === "\\") {
          escaped = true;
        } else if (ch === "'") {
          inSingle = false;
        }
        i += 1;
        continue;
      }
      if (inDouble) {
        out += ch;
        if (escaped) {
          escaped = false;
          i += 1;
          continue;
        }
        if (ch === "\\") {
          escaped = true;
        } else if (ch === '"') {
          inDouble = false;
        }
        i += 1;
        continue;
      }
      if (inBacktick) {
        out += ch;
        if (escaped) {
          escaped = false;
          i += 1;
          continue;
        }
        if (ch === "\\") {
          escaped = true;
        } else if (ch === "`") {
          inBacktick = false;
        }
        i += 1;
        continue;
      }
      if (ch === "/" && next === "/") {
        out += "//";
        i += 2;
        inLineComment = true;
        continue;
      }
      if (ch === "/" && next === "*") {
        out += "/*";
        i += 2;
        inBlockComment = true;
        continue;
      }
      if (ch === "'") {
        out += ch;
        inSingle = true;
        i += 1;
        continue;
      }
      if (ch === '"') {
        out += ch;
        inDouble = true;
        i += 1;
        continue;
      }
      if (ch === "`") {
        out += ch;
        inBacktick = true;
        i += 1;
        continue;
      }
      if (ch === "#") {
        const prev = i > 0 ? input[i - 1] : "";
        if (prev && /[A-Za-z0-9_$]/.test(prev)) {
          out += ch;
          i += 1;
          continue;
        }
        const first = next;
        if (!first || !/[A-Za-z_]/.test(first)) {
          out += ch;
          i += 1;
          continue;
        }
        let j = i + 2;
        while (j < input.length && /[A-Za-z0-9_-]/.test(input[j])) {
          j += 1;
        }
        const id = input.slice(i + 1, j);
        out += 'document.querySelector("#' + id + '")';
        i = j;
        continue;
      }
      out += ch;
      i += 1;
    }
    return out;
  }

  function transformScriptBody(body) {
    if (typeof body !== "string" || body.length === 0) {
      return "";
    }
    return rewriteHashSelectorShorthand(body);
  }

  function normalizeHandlerParameterNames(entries) {
    const input = Array.isArray(entries) ? entries : [];
    const out = [];
    const seen = new Set();
    for (let i = 0; i < input.length; i += 1) {
      const name = String(input[i] || "").trim();
      if (!name || !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) {
        continue;
      }
      const key = name.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      out.push(name);
    }
    return out;
  }

  function normalizeEventAttributeParameterMap(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return {};
    }
    const out = {};
    const keys = Object.keys(input);
    for (let i = 0; i < keys.length; i += 1) {
      const key = String(keys[i] || "").trim().toLowerCase();
      if (!key) {
        continue;
      }
      const names = normalizeHandlerParameterNames(input[key]);
      if (names.length > 0) {
        out[key] = names;
      }
    }
    return out;
  }

  function normalizeEventAttributeThenMap(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return {};
    }
    const out = {};
    const keys = Object.keys(input);
    for (let i = 0; i < keys.length; i += 1) {
      const key = String(keys[i] || "").trim().toLowerCase();
      if (!key) {
        continue;
      }
      const thenBodies = normalizeThenBodies(input[key]);
      if (thenBodies.length > 0) {
        out[key] = thenBodies;
      }
    }
    return out;
  }

  function normalizeThenBodies(entries) {
    const input = Array.isArray(entries) ? entries : [];
    const out = [];
    for (let i = 0; i < input.length; i += 1) {
      const value = String(input[i] || "").trim();
      if (value) {
        out.push(value);
      }
    }
    return out;
  }

  function thenBodiesEqual(a, b) {
    const left = normalizeThenBodies(a);
    const right = normalizeThenBodies(b);
    if (left.length !== right.length) {
      return false;
    }
    for (let i = 0; i < left.length; i += 1) {
      if (String(left[i] || "") !== String(right[i] || "")) {
        return false;
      }
    }
    return true;
  }

  function eventHandlerParameterNamesEqual(a, b) {
    const left = normalizeHandlerParameterNames(a);
    const right = normalizeHandlerParameterNames(b);
    if (left.length !== right.length) {
      return false;
    }
    for (let i = 0; i < left.length; i += 1) {
      if (String(left[i] || "") !== String(right[i] || "")) {
        return false;
      }
    }
    return true;
  }

  function buildEventHandlerParameterPrelude(parameterNames) {
    const names = normalizeHandlerParameterNames(parameterNames);
    if (names.length === 0) {
      return "";
    }
    const lines = [];
    for (let i = 0; i < names.length; i += 1) {
      const name = names[i];
      const key = JSON.stringify(name);
      const fallbackIndex = String(i);
      lines.push(
        "var " + name + " = (" +
          "(event && event.__qhtmlParams && Object.prototype.hasOwnProperty.call(event.__qhtmlParams, " + key + ")) ? event.__qhtmlParams[" + key + "] :" +
          "((event && event.__qhtmlArgs && event.__qhtmlArgs.length > " + fallbackIndex + ") ? event.__qhtmlArgs[" + fallbackIndex + "] :" +
          "((event && event.detail && event.detail.params && Object.prototype.hasOwnProperty.call(event.detail.params, " + key + ")) ? event.detail.params[" + key + "] :" +
          "((event && event.detail && Array.isArray(event.detail.args) && event.detail.args.length > " + fallbackIndex + ") ? event.detail.args[" + fallbackIndex + "] : undefined)" +
          "))" +
        ");"
      );
    }
    return lines.join("\n") + "\n";
  }

  function bindEventAttributeListener(element, attributeName, body, options) {
    if (!element || element.nodeType !== 1 || !isDomEventAttributeName(attributeName)) {
      return false;
    }
    const rawKey = String(attributeName || "").trim();
    const key = rawKey.toLowerCase();
    const rawEventName = rawKey.slice(2);
    const eventNames = createEventNameVariants(rawEventName);
    if (eventNames.length === 0) {
      return false;
    }
    const source = String(body || "").trim();
    if (!source) {
      detachEventAttributeListener(element, key);
      try {
        element.removeAttribute(key);
      } catch (error) {
        // ignore attribute removal failures
      }
      return true;
    }
    const opts = options && typeof options === "object" ? options : {};
    if (opts.scope && typeof opts.scope === "object") {
      mergeScriptScopeIntoElement(element, opts.scope);
    }
    const doc = opts.doc || element.ownerDocument || global.document || null;
    const scopeRoot =
      opts.scopeRoot && opts.scopeRoot.nodeType === 1
        ? opts.scopeRoot
        : null;
    const handlerParameterNames = normalizeHandlerParameterNames(opts.parameterNames);
    const thenBodies = normalizeThenBodies(opts.thenBodies);
    const handlerPrelude = buildEventHandlerParameterPrelude(handlerParameterNames);
    const transformedSource = transformScriptBody(handlerPrelude + source);
    const transformedThenBodies = thenBodies.map(function mapThenBody(entry) {
      return transformScriptBody(handlerPrelude + entry);
    });
    const store = ensureEventAttributeListenerStore(element);
    const current = store && store[key] ? store[key] : null;
    const currentNames = current && Array.isArray(current.eventNames) ? current.eventNames : [];
    const sameNames =
      currentNames.length === eventNames.length &&
      currentNames.every(function sameName(name, index) {
        return String(name || "") === String(eventNames[index] || "");
      });
    if (
      current &&
      current.source === transformedSource &&
      sameNames &&
      eventHandlerParameterNamesEqual(current.parameterNames, handlerParameterNames) &&
      thenBodiesEqual(current.thenBodies, transformedThenBodies)
    ) {
      return true;
    }
    detachEventAttributeListener(element, key);
    const stages = [{ source: transformedSource }].concat(
      transformedThenBodies.map(function mapThenBodySource(entry) {
        return { source: entry };
      })
    );
    const compiledStages = [];
    for (let i = 0; i < stages.length; i += 1) {
      const stageSource = String(stages[i] && stages[i].source ? stages[i].source : "");
      const hasInterpolatedBody = hasInlineReferenceExpressions(stageSource);
      let compiled = null;
      if (!hasInterpolatedBody) {
        try {
          compiled = new Function("event", "document", withScopedSelectorPrelude(stageSource));
        } catch (error) {
          if (global.console && typeof global.console.error === "function") {
            global.console.error("qhtml event handler compile failed:", error);
          }
          return false;
        }
      }
      compiledStages.push({
        source: stageSource,
        hasInterpolatedBody: hasInterpolatedBody,
        compiled: compiled,
      });
    }
    const reportEventHandlerFailure = function reportEventHandlerFailure(stageSource, error) {
      if (global.console && typeof global.console.error === "function") {
        global.console.error("qhtml event handler failed:", error);
      }
      return undefined;
    };
    const runEventStage = function runEventStage(stage, event, componentContext) {
      let executableSource = stage.source;
      const isSignalEvent =
        !!(
          event &&
          event.detail &&
          typeof event.detail === "object" &&
          typeof event.detail.signal === "string" &&
          String(event.detail.signal || "").trim()
        );
      if (stage.hasInterpolatedBody) {
        executableSource = interpolateInlineReferenceExpressions(
          stage.source,
          element,
          {
            component: componentContext,
            event: event,
            document: doc,
            root: scopeRoot,
          },
          "qhtml event interpolation failed:",
          { scriptLiteral: true, allowBareDotWalk: isSignalEvent }
        );
      }
      ensureScopedSelectorShortcut(element, scopeRoot);
      const executionThis = element;
      if (stage.compiled) {
        const boundCompiled = stage.compiled.bind(executionThis);
        return invokeWithRuntimeExecutionHost(element, function invokeCompiledInlineHandler() {
          return boundCompiled(event, doc);
        });
      }
      const dynamic = new Function("event", "document", withScopedSelectorPrelude(executableSource));
      const boundDynamic = dynamic.bind(executionThis);
      return invokeWithRuntimeExecutionHost(element, function invokeDynamicInlineHandler() {
        return boundDynamic(event, doc);
      });
    };
    const runEventStageChain = function runEventStageChain(event, componentContext) {
      let pending = null;
      for (let i = 0; i < compiledStages.length; i += 1) {
        const stage = compiledStages[i];
        const invokeStage = function invokeStage() {
          try {
            return runEventStage(stage, event, componentContext);
          } catch (error) {
            return reportEventHandlerFailure(stage.source, error);
          }
        };
        if (pending && typeof pending.then === "function") {
          pending = pending.then(
            function runAfterResolve() {
              return invokeStage();
            },
            function runAfterReject(error) {
              reportEventHandlerFailure(stage.source, error);
              return invokeStage();
            }
          );
        } else {
          pending = invokeStage();
        }
      }
      if (pending && typeof pending.then === "function" && typeof pending.catch === "function") {
        pending.catch(function onUnhandledStageError(error) {
          reportEventHandlerFailure(transformedSource, error);
        });
      }
      return pending;
    };
    const handler = function qHtmlInlineEventAttributeHandler(event) {
      const componentContext =
        element && (typeof element === "object" || typeof element === "function")
          ? ensureComponentSelfReference(element) || (typeof resolveNearestComponentHost === "function" ? resolveNearestComponentHost(element) : null)
          : null;
      try {
        return runEventStageChain(event, componentContext);
      } catch (error) {
        return reportEventHandlerFailure(transformedSource, error);
      }
    };
    for (let i = 0; i < eventNames.length; i += 1) {
      element.addEventListener(eventNames[i], handler);
    }
    const signalBridge = function qHtmlSignalCaseBridge(event) {
      const detail = event && event.detail && typeof event.detail === "object" ? event.detail : null;
      const signalName = detail && typeof detail.signal === "string" ? String(detail.signal || "").trim() : "";
      if (!signalName) {
        return;
      }
      if (signalName.toLowerCase() !== String(rawEventName || "").trim().toLowerCase()) {
        return;
      }
      if (hasExactEventName(eventNames, signalName)) {
        return;
      }
      return handler.call(this, event);
    };
    element.addEventListener("q-signal", signalBridge);
    let runtimeSignalRegistration = null;
    let runtimeSignalReference = null;
    const runtimeApi = global.QHtml && typeof global.QHtml === "object" ? global.QHtml : null;
    const loweredRawEventName = String(rawEventName || "").trim().toLowerCase();
    const resolveSignalSubscriberUuid = function resolveSignalSubscriberUuid(target) {
      if (!target || target.nodeType !== 1) {
        return "";
      }
      let candidate = target;
      if (candidate.component && candidate.component.nodeType === 1) {
        candidate = candidate.component;
      }
      return String(readHostQDomUuid(candidate) || "").trim();
    };
    const registerDeclarativeSignalReference = function registerDeclarativeSignalReference(emitterUuid, subscriberUuid) {
      if (
        !runtimeApi ||
        typeof runtimeApi.registerSignalReference !== "function" ||
        !emitterUuid ||
        !subscriberUuid ||
        !loweredRawEventName
      ) {
        return null;
      }
      return runtimeApi.registerSignalReference({
        emitterUuid: emitterUuid,
        signalName: loweredRawEventName,
        subscriberUuid: subscriberUuid,
        routeKey: "attr:" + key + ":" + loweredRawEventName + ":" + subscriberUuid,
      });
    };
    const emitterUuidForReference = String(readHostQDomUuid(element) || "").trim();
    const subscriberUuidForReference = resolveSignalSubscriberUuid(element) || emitterUuidForReference;
    runtimeSignalReference = registerDeclarativeSignalReference(
      emitterUuidForReference,
      subscriberUuidForReference
    );
    if (
      runtimeApi &&
      typeof runtimeApi.getEventLoopMode === "function" &&
      runtimeApi.getEventLoopMode() === "queued" &&
      typeof runtimeApi.registerSignalSubscriber === "function" &&
      loweredRawEventName
    ) {
      const tryRegisterDeclarativeSignal = function tryRegisterDeclarativeSignal() {
        if (runtimeSignalRegistration) {
          return true;
        }
        let emitterUuid = "";
        try {
          emitterUuid = readHostQDomUuid(element);
        } catch (ignoredReadEmitterUuidError) {
          emitterUuid = "";
        }
        if (!emitterUuid) {
          return false;
        }
        const queuedWrapped = function onDeclarativeSignalQueued(detailPayload) {
          const detail = detailPayload && typeof detailPayload === "object" ? detailPayload : {};
          const queuedEvent = {
            type: loweredRawEventName,
            detail: detail,
            target: element,
            currentTarget: element,
          };
          return handler.call(element, queuedEvent);
        };
        const registration = runtimeApi.registerSignalSubscriber({
          emitterUuid: emitterUuid,
          signalName: loweredRawEventName,
          subscriberUuid: resolveSignalSubscriberUuid(element) || emitterUuid,
          handler: queuedWrapped,
          mode: "declarative",
          attributeName: key,
        });
        if (!registration || typeof registration !== "object") {
          return false;
        }
        runtimeSignalRegistration = {
          token: registration.token,
          routeKey: registration.routeKey,
          emitterUuid: registration.emitterUuid || emitterUuid,
          signalName: registration.signalName || loweredRawEventName,
        };
        return true;
      };
      if (!tryRegisterDeclarativeSignal()) {
        const deferredRegistration = function onDeferredDeclarativeRegistration() {
          element.removeEventListener(QHTML_CONTENT_LOADED_EVENT, deferredRegistration);
          if (!tryRegisterDeclarativeSignal()) {
            return;
          }
          const activeStore = ensureEventAttributeListenerStore(element);
          const activeEntry = activeStore && activeStore[key] ? activeStore[key] : null;
          if (activeEntry && activeEntry.source === transformedSource) {
            activeEntry.runtimeSignalRegistration = runtimeSignalRegistration;
            activeEntry.runtimeSignalReference = runtimeSignalReference;
          }
        };
        element.addEventListener(QHTML_CONTENT_LOADED_EVENT, deferredRegistration, { once: true });
      }
    }
    store[key] = {
      eventName: eventNames[0],
      eventNames: eventNames.slice(),
      handler: handler,
      signalBridge: signalBridge,
      source: transformedSource,
      parameterNames: handlerParameterNames.slice(),
      thenBodies: transformedThenBodies.slice(),
      runtimeSignalRegistration: runtimeSignalRegistration,
      runtimeSignalReference: runtimeSignalReference,
    };
    return true;
  }

  function mergeScriptScopeIntoElement(element, scope) {
    if (!element || element.nodeType !== 1 || !scope || typeof scope !== "object") {
      return;
    }
    if (!element.__qhtmlScriptScope || typeof element.__qhtmlScriptScope !== "object") {
      element.__qhtmlScriptScope = Object.create(null);
    }
    const names = Object.keys(scope);
    for (let i = 0; i < names.length; i += 1) {
      const name = String(names[i] || "").trim();
      if (!name || !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) {
        continue;
      }
      element.__qhtmlScriptScope[name] = scope[name];
    }
  }

  function warnQBehavior(message, details) {
    if (global.console && typeof global.console.warn === "function") {
      if (typeof details !== "undefined") {
        global.console.warn(message, details);
      } else {
        global.console.warn(message);
      }
    }
  }

  function registerBehavior(target, prop, behaviorController) {
    if (!qBehaviorRegistry || !target || !prop || !behaviorController) {
      return null;
    }
    let map = qBehaviorRegistry.get(target);
    if (!map) {
      map = new Map();
      qBehaviorRegistry.set(target, map);
    }
    map.set(String(prop), behaviorController);
    return behaviorController;
  }

  function getBehavior(target, prop) {
    if (!qBehaviorRegistry || !target || !prop) {
      return null;
    }
    const map = qBehaviorRegistry.get(target);
    if (!map) {
      return null;
    }
    return map.get(String(prop)) || map.get(String(prop).toLowerCase()) || null;
  }

  function removeBehavior(target, prop) {
    if (!qBehaviorRegistry || !target || !prop) {
      return false;
    }
    const map = qBehaviorRegistry.get(target);
    if (!map) {
      return false;
    }
    const controller = map.get(String(prop));
    if (controller && typeof controller.cancel === "function") {
      controller.cancel();
    }
    return map.delete(String(prop));
  }

  function withBehaviorCommitBypass(target, prop, callback) {
    if (!qBehaviorCommitBypass || !target || !prop) {
      return callback();
    }
    let set = qBehaviorCommitBypass.get(target);
    if (!set) {
      set = new Set();
      qBehaviorCommitBypass.set(target, set);
    }
    const key = String(prop);
    set.add(key);
    try {
      return callback();
    } finally {
      set.delete(key);
      if (set.size === 0) {
        qBehaviorCommitBypass.delete(target);
      }
    }
  }

  function isBehaviorCommitBypassed(target, prop) {
    if (!qBehaviorCommitBypass || !target || !prop) {
      return false;
    }
    const set = qBehaviorCommitBypass.get(target);
    return !!(set && set.has(String(prop)));
  }

  const qEasingRegistry = {
    linear: function linear(t) { return t; },
    easeInQuad: function easeInQuad(t) { return t * t; },
    easeOutQuad: function easeOutQuad(t) { return t * (2 - t); },
    easeInOutQuad: function easeInOutQuad(t) {
      return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    },
  };

  function getEasing(name) {
    const key = String(name || "linear").trim();
    if (Object.prototype.hasOwnProperty.call(qEasingRegistry, key)) {
      return qEasingRegistry[key];
    }
    warnQBehavior("qhtml behavior warning: unknown easing '" + key + "', using linear.");
    return qEasingRegistry.linear;
  }

  function normalizeBehaviorAnimationType(type) {
    const raw = String(type || "").trim();
    const normalized = raw.toLowerCase();
    if (!normalized || normalized === "numberanimation" || normalized === "q-number-animation") {
      return "NumberAnimation";
    }
    if (normalized === "q-property-animation" || normalized === "propertyanimation" || normalized === "property-animation") {
      return "q-property-animation";
    }
    if (normalized === "q-parallel-animation-group" || normalized === "q-parallel-animation" || normalized === "parallelanimationgroup" || normalized === "parallel-animation-group") {
      return "q-parallel-animation-group";
    }
    if (normalized === "q-sequential-animation-group" || normalized === "q-sequential-animation" || normalized === "sequentialanimationgroup" || normalized === "sequential-animation-group") {
      return "q-sequential-animation-group";
    }
    return raw;
  }

  function executeBehaviorAnimationHook(hook, target, args) {
    if (!hook || !target || target.nodeType !== 1) {
      return undefined;
    }
    const body = String(hook.script || "");
    if (!body.trim()) {
      return undefined;
    }
    const doc = target.ownerDocument || global.document || null;
    const values = Array.isArray(args) ? args : [];
    ensureComponentSelfReference(target);
    ensureScopedSelectorShortcut(target, null);
    try {
      const compiled = new Function("value", "currentStep", "progress", "event", "document", withScopedSelectorPrelude(transformScriptBody(body)));
      return invokeWithRuntimeExecutionHost(target, function invokeBehaviorAnimationHook() {
        return compiled.call(target, values[0], values[1], values[2], null, doc);
      });
    } catch (error) {
      if (global.console && typeof global.console.error === "function") {
        global.console.error("qhtml behavior animation hook failed:", error);
      }
      return undefined;
    }
  }

  class AnimationJob {
    constructor(options) {
      const opts = options || {};
      this.duration = Math.max(0, Number(opts.duration) || 0);
      this.step = typeof opts.step === "function" ? opts.step : function noopStep() {};
      this.done = typeof opts.done === "function" ? opts.done : function noopDone() {};
      this.running = false;
      this._frame = 0;
      this._timer = 0;
      this._cancelled = false;
      this._startedAt = 0;
      this._scheduleToken = 0;
    }

    start() {
      if (this.running) {
        return this;
      }
      const raf = typeof global.requestAnimationFrame === "function"
        ? global.requestAnimationFrame.bind(global)
        : function fallbackRequestAnimationFrame(callback) {
            return global.setTimeout(function runFallbackFrame() {
              callback((global.performance && typeof global.performance.now === "function") ? global.performance.now() : Date.now());
            }, 16);
          };
      const caf = typeof global.cancelAnimationFrame === "function"
        ? global.cancelAnimationFrame.bind(global)
        : function fallbackCancelAnimationFrame(handle) {
            global.clearTimeout(handle);
          };
      const clearScheduled = () => {
        if (this._frame) {
          caf(this._frame);
          this._frame = 0;
        }
        if (this._timer) {
          global.clearTimeout(this._timer);
          this._timer = 0;
        }
      };
      const schedule = (callback) => {
        clearScheduled();
        const token = this._scheduleToken + 1;
        this._scheduleToken = token;
        const run = (now) => {
          if (this._cancelled || token !== this._scheduleToken) {
            return;
          }
          clearScheduled();
          callback(now);
        };
        this._frame = raf(run);
        this._timer = global.setTimeout(function runAnimationTimerFallback() {
          const now = (global.performance && typeof global.performance.now === "function") ? global.performance.now() : Date.now();
          run(now);
        }, 16);
      };
      this.running = true;
      this._cancelled = false;
      this._startedAt = (global.performance && typeof global.performance.now === "function") ? global.performance.now() : Date.now();
      if (this.duration === 0) {
        this.step(1);
        this.running = false;
        this.done();
        return this;
      }
      const tick = (now) => {
        if (this._cancelled) {
          return;
        }
        const elapsed = Math.max(0, Number(now) - this._startedAt);
        const progress = Math.max(0, Math.min(1, elapsed / this.duration));
        this.step(progress);
        if (progress >= 1) {
          this.running = false;
          this._frame = 0;
          this._timer = 0;
          this.done();
          return;
        }
        schedule(tick);
      };
      schedule(tick);
      return this;
    }

    cancel() {
      if (!this.running && !this._frame) {
        this._cancelled = true;
        return;
      }
      this._cancelled = true;
      this.running = false;
      this._scheduleToken += 1;
      const caf = typeof global.cancelAnimationFrame === "function"
        ? global.cancelAnimationFrame.bind(global)
        : function fallbackCancelAnimationFrame(handle) {
            global.clearTimeout(handle);
          };
      if (this._frame) {
        caf(this._frame);
        this._frame = 0;
      }
      if (this._timer) {
        global.clearTimeout(this._timer);
        this._timer = 0;
      }
    }
  }

  function cssStylePropertyName(prop) {
    const raw = String(prop || "").trim();
    return raw.replace(/-([a-z])/g, function camelizeStyleName(_, ch) {
      return String(ch || "").toUpperCase();
    });
  }

  function isDimensionalStyleProperty(prop) {
    const key = cssStylePropertyName(prop).toLowerCase();
    return CSS_DIMENSIONAL_PROPERTIES.has(key);
  }

  function parseNumericStyleValue(value, defaultUnit) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return {
        valid: true,
        value: Number(value),
        unit: defaultUnit || "px",
        serialized: String(Number(value)) + (defaultUnit || "px"),
      };
    }
    const text = String(value == null ? "" : value).trim();
    if (!text) {
      return { valid: false, value: 0, unit: defaultUnit || "px", serialized: "" };
    }
    const match = text.match(CSS_NUMERIC_VALUE_PATTERN);
    if (!match) {
      return { valid: false, value: 0, unit: defaultUnit || "px", serialized: text };
    }
    const unit = match[2] || defaultUnit || "px";
    const number = Number(match[1]);
    return {
      valid: Number.isFinite(number),
      value: number,
      unit: unit,
      serialized: String(number) + unit,
    };
  }

  function serializeNumericStyleValue(value, unit) {
    const number = Number(value);
    const safeNumber = Number.isFinite(number) ? number : 0;
    const rounded = Math.abs(safeNumber) < 0.000001 ? 0 : Math.round(safeNumber * 10000) / 10000;
    return String(rounded) + String(unit || "px");
  }

  function parseNumericPropertyValue(value) {
    const animatedValue = readAnimatedStyleCommitValue(value);
    if (animatedValue) {
      return {
        valid: true,
        value: Number(animatedValue.value),
        unit: animatedValue.unit || "",
        serialized: animatedValue.serialized,
        propertyValue: animatedValue.propertyValue,
      };
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return {
        valid: true,
        value: Number(value),
        unit: "",
        serialized: String(Number(value)),
        propertyValue: Number(value),
      };
    }
    const text = String(value == null ? "" : value).trim();
    if (!text) {
      return { valid: false, value: 0, unit: "", serialized: "", propertyValue: value };
    }
    const match = text.match(CSS_NUMERIC_VALUE_PATTERN);
    if (!match) {
      return { valid: false, value: value, unit: "", serialized: text, propertyValue: value };
    }
    const number = Number(match[1]);
    const unit = String(match[2] || "");
    const serialized = Number.isFinite(number) ? String(number) + unit : text;
    return {
      valid: Number.isFinite(number),
      value: number,
      unit: unit,
      serialized: serialized,
      propertyValue: unit ? serialized : number,
    };
  }

  function createAnimatedStyleCommitValue(numberValue, unit) {
    const number = Number(numberValue);
    const safeNumber = Number.isFinite(number) ? number : 0;
    const normalizedUnit = String(unit || "");
    const serialized = normalizedUnit ? serializeNumericStyleValue(safeNumber, normalizedUnit) : String(Math.abs(safeNumber) < 0.000001 ? 0 : Math.round(safeNumber * 10000) / 10000);
    return {
      __qhtmlAnimatedStyleValue: true,
      value: safeNumber,
      propertyValue: normalizedUnit ? serialized : safeNumber,
      unit: normalizedUnit,
      serialized: serialized,
    };
  }

  function readAnimatedStyleCommitValue(value) {
    return value && typeof value === "object" && value.__qhtmlAnimatedStyleValue === true
      ? value
      : null;
  }

  function updateQDomPropertyExtension(qdomNode, prop, value) {
    if (!qdomNode || typeof qdomNode !== "object" || !prop) {
      return;
    }
    const parsed = parseNumericPropertyValue(value);
    const unit = parsed && parsed.valid && parsed.unit ? String(parsed.unit || "") : "";
    if (unit) {
      if (!qdomNode.property_extensions || typeof qdomNode.property_extensions !== "object" || Array.isArray(qdomNode.property_extensions)) {
        qdomNode.property_extensions = {};
      }
      qdomNode.property_extensions[prop] = unit;
      return;
    }
    if (qdomNode.property_extensions && typeof qdomNode.property_extensions === "object") {
      delete qdomNode.property_extensions[prop];
      if (Object.keys(qdomNode.property_extensions).length === 0) {
        delete qdomNode.property_extensions;
      }
    }
  }

  function syncQDomProperty(target, prop, value) {
    if (!target || typeof target !== "object" || !prop) {
      return;
    }
    try {
      const qdomNode = typeof target.qdom === "function" ? target.qdom() : target;
      const qdomSourceNode =
        qdomNode &&
        qdomNode.__qhtmlSourceNode &&
        typeof qdomNode.__qhtmlSourceNode === "object"
          ? qdomNode.__qhtmlSourceNode
          : qdomNode;
      if (qdomSourceNode && typeof qdomSourceNode === "object") {
        if (!qdomSourceNode.props || typeof qdomSourceNode.props !== "object" || Array.isArray(qdomSourceNode.props)) {
          qdomSourceNode.props = {};
        }
        qdomSourceNode.props[prop] = value;
        updateQDomPropertyExtension(qdomSourceNode, prop, value);
      }
    } catch (syncError) {
      // qdom syncing is best-effort for arbitrary DOM properties.
    }
  }

  function getPropertyAdapter(target, prop, options) {
    const adapterOptions = options || {};
    const propertyName = String(prop || "").trim();
    const styleName = cssStylePropertyName(propertyName);
    const normalizedStyleName = styleName.toLowerCase();
    const isDomElement = !!(target && target.nodeType === 1);
    const qPropertyMap = isDomElement && target[Q_PROPERTY_INSTANCES_KEY] && typeof target[Q_PROPERTY_INSTANCES_KEY] === "object"
      ? target[Q_PROPERTY_INSTANCES_KEY]
      : null;
    if (qPropertyMap && Object.prototype.hasOwnProperty.call(qPropertyMap, propertyName)) {
      return {
        read: function readDeclaredProperty() {
          try {
            return target[propertyName];
          } catch (error) {
            return undefined;
          }
        },
        normalize: function normalizeDeclaredValue(value) {
          return parseNumericPropertyValue(value);
        },
        interpolate: function interpolateDeclaredValue(from, to, progress) {
          return createAnimatedStyleCommitValue(
            from.value + (to.value - from.value) * progress,
            to.unit || from.unit || ""
          );
        },
        commit: function commitDeclaredProperty(value) {
          const animatedValue = readAnimatedStyleCommitValue(value);
          const committedValue = animatedValue ? animatedValue.propertyValue : value;
          withBehaviorCommitBypass(target, propertyName, function assignDeclaredProperty() {
            target[propertyName] = committedValue;
          });
          syncQDomProperty(target, propertyName, committedValue);
        },
      };
    }
    if (isDomElement && adapterOptions.propertyTarget !== "property" && isDimensionalStyleProperty(propertyName)) {
      return {
        read: function readStyleDimension() {
          const inlineValue = target.style && typeof target.style[styleName] === "string" ? target.style[styleName] : "";
          if (inlineValue) {
            return inlineValue;
          }
          const attrValue = typeof target.getAttribute === "function" ? target.getAttribute(propertyName) : "";
          if (attrValue) {
            return attrValue;
          }
          const doc = target.ownerDocument || global.document || null;
          const view = doc && doc.defaultView ? doc.defaultView : global;
          const computed = view && typeof view.getComputedStyle === "function" ? view.getComputedStyle(target) : null;
          return computed && typeof computed[styleName] === "string" ? computed[styleName] : "";
        },
        normalize: function normalizeStyleDimension(value) {
          const animatedValue = readAnimatedStyleCommitValue(value);
          if (animatedValue) {
            return {
              valid: true,
              value: Number(animatedValue.value),
              unit: animatedValue.unit || "px",
              serialized: animatedValue.serialized,
            };
          }
          return parseNumericStyleValue(value, "px");
        },
        interpolate: function interpolateStyleDimension(from, to, progress) {
          return createAnimatedStyleCommitValue(
            from.value + (to.value - from.value) * progress,
            to.unit || from.unit || "px"
          );
        },
        commit: function commitStyleDimension(value) {
          const animatedValue = readAnimatedStyleCommitValue(value);
          const normalized = animatedValue || parseNumericStyleValue(value, "px");
          const serialized = normalized.valid === false ? String(value == null ? "" : value) : normalized.serialized;
          const propertyValue =
            animatedValue
              ? animatedValue.propertyValue
              : normalized.valid
                ? serialized
                : value;
          if (target.style) {
            target.style[styleName] = serialized;
          }
          if (typeof target.setAttribute === "function") {
            target.setAttribute(propertyName, serialized);
          }
          withBehaviorCommitBypass(target, propertyName, function assignAnimatedStyleProperty() {
            try {
              target[propertyName] = propertyValue;
            } catch (assignPropertyError) {
              // Style projection already succeeded; property mirroring is best-effort.
            }
          });
          syncQDomProperty(target, propertyName, propertyValue);
        },
      };
    }
    if (isDomElement && adapterOptions.propertyTarget !== "property" && target.style && normalizedStyleName in target.style) {
      return {
        read: function readStyleProperty() {
          return target.style[styleName] || "";
        },
        normalize: function normalizeStyleProperty(value) {
          const number = Number(value);
          return Number.isFinite(number)
            ? { valid: true, value: number, unit: "", raw: value }
            : { valid: false, value: value, unit: "", raw: value };
        },
        interpolate: function interpolateStyleProperty(from, to, progress) {
          return from.value + (to.value - from.value) * progress;
        },
        commit: function commitStyleProperty(value) {
          target.style[styleName] = String(value == null ? "" : value);
          syncQDomProperty(target, propertyName, value);
        },
      };
    }
    return {
      read: function readGenericProperty() {
        try {
          return target ? target[propertyName] : undefined;
        } catch (error) {
          return undefined;
        }
      },
      normalize: function normalizeGenericProperty(value) {
        return parseNumericPropertyValue(value);
      },
      interpolate: function interpolateGenericProperty(from, to, progress) {
        return createAnimatedStyleCommitValue(
          from.value + (to.value - from.value) * progress,
          to.unit || from.unit || ""
        );
      },
      commit: function commitGenericProperty(value) {
        if (!target || typeof target !== "object") {
          return;
        }
        const animatedValue = readAnimatedStyleCommitValue(value);
        const committedValue = animatedValue ? animatedValue.propertyValue : value;
        withBehaviorCommitBypass(target, propertyName, function assignGenericProperty() {
          target[propertyName] = committedValue;
        });
        syncQDomProperty(target, propertyName, committedValue);
      },
    };
  }

  function commitProperty(target, prop, value, options) {
    const propertyName = String(prop || "").trim();
    if (!target || !propertyName) {
      return value;
    }
    const adapter = getPropertyAdapter(target, propertyName, options || {});
    adapter.commit(value, options || {});
    return value;
  }

  function qSet(target, prop, value, options) {
    const opts = Object.assign(
      {
        bypassBehavior: false,
        preserveBinding: true,
        source: "user",
      },
      options || {}
    );
    const propertyName = String(prop || "").trim();
    if (!target || !propertyName) {
      return value;
    }
    if (!opts.bypassBehavior) {
      const behavior = getBehavior(target, propertyName);
      if (behavior && behavior.enabled) {
        return behavior.write(value, opts);
      }
    }
    return commitProperty(target, propertyName, value, opts);
  }

  class QBehaviorAbstractAnimation {
    constructor(options) {
      const opts = options || {};
      this.type = normalizeBehaviorAnimationType(opts.type || "q-abstract-animation");
      this.running = opts.running !== false && String(opts.running).trim().toLowerCase() !== "false";
      this.hooks = opts.hooks && typeof opts.hooks === "object" ? opts.hooks : {};
    }

    createJob() {
      return null;
    }
  }

  function normalizeBehaviorAnimationConfigValue(value) {
    if (value == null) {
      return "";
    }
    if (typeof value === "string") {
      const text = value.trim();
      if (text.length >= 2) {
        const first = text.charAt(0);
        const last = text.charAt(text.length - 1);
        if ((first === "\"" && last === "\"") || (first === "'" && last === "'") || (first === "`" && last === "`")) {
          return text.slice(1, -1);
        }
      }
      return text;
    }
    return value;
  }

  function splitBehaviorReferencePath(pathText) {
    const text = String(normalizeBehaviorAnimationConfigValue(pathText) || "").trim();
    if (!text) {
      return [];
    }
    return text.split(".").map(function cleanBehaviorReferenceToken(part) {
      return String(part || "").trim();
    }).filter(Boolean);
  }

  function resolveBehaviorReferenceOwner(pathText, fallbackTarget, fallbackProp) {
    const parts = splitBehaviorReferencePath(pathText);
    if (parts.length < 2) {
      return {
        target: fallbackTarget,
        prop: fallbackProp,
      };
    }
    let root = null;
    let index = 1;
    const rootName = parts[0];
    if (rootName === "this") {
      if (parts[1] === "component") {
        root = ensureComponentSelfReference(fallbackTarget) || (fallbackTarget && fallbackTarget.component) || fallbackTarget;
        index = 2;
      } else {
        root = fallbackTarget;
        index = 1;
      }
    } else if (rootName === "component") {
      root = ensureComponentSelfReference(fallbackTarget) || (fallbackTarget && fallbackTarget.component) || fallbackTarget;
      index = 1;
    } else if (fallbackTarget && fallbackTarget.__qhtmlScriptScope && Object.prototype.hasOwnProperty.call(fallbackTarget.__qhtmlScriptScope, rootName)) {
      root = fallbackTarget.__qhtmlScriptScope[rootName];
      index = 1;
    } else if (fallbackTarget && fallbackTarget.component && fallbackTarget.component.__qhtmlScriptScope && Object.prototype.hasOwnProperty.call(fallbackTarget.component.__qhtmlScriptScope, rootName)) {
      root = fallbackTarget.component.__qhtmlScriptScope[rootName];
      index = 1;
    } else if (global && typeof global[rootName] !== "undefined") {
      root = global[rootName];
      index = 1;
    } else {
      const doc = fallbackTarget && fallbackTarget.ownerDocument ? fallbackTarget.ownerDocument : global.document || null;
      if (doc && typeof doc.querySelector === "function") {
        try {
          root = doc.querySelector(rootName);
        } catch (queryError) {
          root = null;
        }
      }
      index = 1;
    }
    if (root == null) {
      return {
        target: fallbackTarget,
        prop: fallbackProp,
      };
    }
    for (let i = index; i < parts.length - 1; i += 1) {
      root = root[parts[i]];
      if (root == null) {
        return {
          target: fallbackTarget,
          prop: fallbackProp,
        };
      }
    }
    return {
      target: root,
      prop: parts[parts.length - 1],
    };
  }

  class NumberAnimation extends QBehaviorAbstractAnimation {
    constructor(options) {
      const opts = options || {};
      super(Object.assign({}, opts, { type: opts.type || "NumberAnimation" }));
      this.duration = Math.max(0, Number(opts.duration == null ? 250 : opts.duration) || 0);
      this.easing = String(opts.easing || "linear").trim() || "linear";
      this.from = Object.prototype.hasOwnProperty.call(opts, "from") ? opts.from : undefined;
      this.to = Object.prototype.hasOwnProperty.call(opts, "to") ? opts.to : undefined;
    }

    createJob(config) {
      const opts = config || {};
      const adapter = getPropertyAdapter(opts.target, opts.prop);
      const fromNormalized = adapter.normalize(opts.from);
      const toNormalized = adapter.normalize(opts.to);
      if (!fromNormalized.valid || !toNormalized.valid) {
        warnQBehavior("qhtml behavior warning: NumberAnimation requires numeric values; committing immediately.", {
          property: opts.prop,
          from: opts.from,
          to: opts.to,
        });
        return null;
      }
      if (fromNormalized.unit !== toNormalized.unit) {
        warnQBehavior("qhtml behavior warning: NumberAnimation unit mismatch; committing immediately.", {
          property: opts.prop,
          from: opts.from,
          to: opts.to,
          fromUnit: fromNormalized.unit,
          toUnit: toNormalized.unit,
        });
        return null;
      }
      const easing = getEasing(this.easing);
      return new AnimationJob({
        duration: this.duration,
        step: function animationStep(progress) {
          const eased = easing(Math.max(0, Math.min(1, progress)));
          opts.commit(adapter.interpolate(fromNormalized, toNormalized, eased));
        },
        done: function animationDone() {
          opts.finish(opts.to);
        },
      });
    }
  }

  class QBehaviorPropertyAnimation extends QBehaviorAbstractAnimation {
    constructor(options) {
      const opts = options || {};
      super(Object.assign({}, opts, { type: opts.type || "q-property-animation" }));
      this.targetExpression = Object.prototype.hasOwnProperty.call(opts, "target") ? opts.target : "";
      this.duration = Math.max(0, Number(opts.duration == null ? 250 : opts.duration) || 0);
      this.easing = String(opts.easing || "linear").trim() || "linear";
      this.from = Object.prototype.hasOwnProperty.call(opts, "from") ? opts.from : undefined;
      this.to = Object.prototype.hasOwnProperty.call(opts, "to") ? opts.to : undefined;
    }

    createJob(config) {
      const opts = config || {};
      const resolvedTarget = this.targetExpression
        ? resolveBehaviorReferenceOwner(this.targetExpression, opts.target, opts.prop)
        : { target: opts.target, prop: opts.prop };
      const target = resolvedTarget.target;
      const prop = String(resolvedTarget.prop || "").trim();
      if (!target || !prop) {
        return null;
      }
      const adapter = getPropertyAdapter(target, prop);
      const fromValue = Object.prototype.hasOwnProperty.call(this, "from") && typeof this.from !== "undefined"
        ? this.from
        : adapter.read();
      const toValue = Object.prototype.hasOwnProperty.call(this, "to") && typeof this.to !== "undefined"
        ? this.to
        : opts.to;
      const fromNormalized = adapter.normalize(fromValue);
      const toNormalized = adapter.normalize(toValue);
      if (!fromNormalized.valid || !toNormalized.valid) {
        warnQBehavior("qhtml behavior warning: q-property-animation requires numeric values; committing immediately.", {
          property: prop,
          from: fromValue,
          to: toValue,
        });
        return null;
      }
      if (fromNormalized.unit !== toNormalized.unit) {
        warnQBehavior("qhtml behavior warning: q-property-animation unit mismatch; committing immediately.", {
          property: prop,
          from: fromValue,
          to: toValue,
          fromUnit: fromNormalized.unit,
          toUnit: toNormalized.unit,
        });
        return null;
      }
      const easing = getEasing(this.easing);
      const self = this;
      let currentStep = 0;
      return new AnimationJob({
        duration: this.duration,
        step: function propertyAnimationStep(progress) {
          currentStep += 1;
          const clamped = Math.max(0, Math.min(1, progress));
          const eased = easing(clamped);
          const interpolated = adapter.interpolate(fromNormalized, toNormalized, eased);
          commitProperty(target, prop, interpolated, {
            bypassBehavior: true,
            preserveBinding: true,
            source: "animation",
          });
          const animatedValue = readAnimatedStyleCommitValue(interpolated);
          const hookValue = animatedValue ? animatedValue.propertyValue : interpolated;
          executeBehaviorAnimationHook(self.hooks.onstepped || self.hooks.onstep, opts.target, [hookValue, currentStep, clamped]);
        },
        done: function propertyAnimationDone() {
          commitProperty(target, prop, toValue, {
            bypassBehavior: true,
            preserveBinding: true,
            source: "animation-final",
          });
          executeBehaviorAnimationHook(self.hooks.onended || self.hooks.onend, opts.target, [toValue, currentStep, 1]);
          opts.finish(toValue);
        },
      });
    }
  }

  class QBehaviorAnimationGroup extends QBehaviorAbstractAnimation {
    constructor(options) {
      const opts = options || {};
      super(opts);
      this.mode = String(opts.mode || "").trim().toLowerCase() === "sequential" ? "sequential" : "parallel";
      this.children = Array.isArray(opts.children) ? opts.children : [];
    }

    createJob(config) {
      const opts = config || {};
      const children = this.children.slice();
      const self = this;
      let running = false;
      let cancelled = false;
      let activeJobs = [];
      const cancelActiveJobs = function cancelActiveGroupJobs() {
        for (let i = 0; i < activeJobs.length; i += 1) {
          const job = activeJobs[i];
          if (job && typeof job.cancel === "function") {
            job.cancel();
          }
        }
        activeJobs = [];
      };
      const job = {
        running: false,
        start: function startAnimationGroup() {
          if (running) {
            return job;
          }
          running = true;
          cancelled = false;
          job.running = true;
          executeBehaviorAnimationHook(self.hooks.onstarted || self.hooks.onstart, opts.target, [opts.to, 0, 0]);
          if (!children.length) {
            running = false;
            job.running = false;
            executeBehaviorAnimationHook(self.hooks.onended || self.hooks.onend, opts.target, [opts.to, 0, 1]);
            opts.finish(opts.to);
            return job;
          }
          if (self.mode === "sequential") {
            let index = 0;
            const startNext = function startNextSequentialAnimation() {
              if (cancelled) {
                return;
              }
              if (index >= children.length) {
                running = false;
                job.running = false;
                executeBehaviorAnimationHook(self.hooks.onended || self.hooks.onend, opts.target, [opts.to, index, 1]);
                opts.finish(opts.to);
                return;
              }
              const child = children[index];
              index += 1;
              const childJob = child && typeof child.createJob === "function"
                ? child.createJob(Object.assign({}, opts, { finish: startNext }))
                : null;
              if (!childJob) {
                startNext();
                return;
              }
              activeJobs = [childJob];
              childJob.start();
            };
            startNext();
            return job;
          }
          let remaining = children.length;
          const finishOne = function finishOneParallelAnimation() {
            remaining -= 1;
            if (remaining <= 0 && !cancelled) {
              running = false;
              job.running = false;
              executeBehaviorAnimationHook(self.hooks.onended || self.hooks.onend, opts.target, [opts.to, children.length, 1]);
              opts.finish(opts.to);
            }
          };
          activeJobs = children.map(function createParallelChildJob(child) {
            return child && typeof child.createJob === "function"
              ? child.createJob(Object.assign({}, opts, { finish: finishOne }))
              : null;
          }).filter(Boolean);
          if (!activeJobs.length) {
            running = false;
            job.running = false;
            opts.finish(opts.to);
            return job;
          }
          remaining = activeJobs.length;
          activeJobs.forEach(function startParallelChildJob(childJob) {
            childJob.start();
          });
          return job;
        },
        cancel: function cancelAnimationGroup() {
          cancelled = true;
          running = false;
          job.running = false;
          cancelActiveJobs();
        },
      };
      return job;
    }
  }

  class BehaviorController {
    constructor(options) {
      const opts = options || {};
      this.target = opts.target || null;
      this.prop = String(opts.prop || "").trim();
      this.animation = opts.animation || null;
      this.enabled = opts.enabled !== false;
      this.targetValue = undefined;
      this.currentJob = null;
    }

    cancel() {
      if (this.currentJob && typeof this.currentJob.cancel === "function") {
        this.currentJob.cancel();
      }
      this.currentJob = null;
    }

    setEnabled(enabled) {
      this.enabled = enabled !== false;
      if (!this.enabled) {
        this.cancel();
      }
    }

    write(nextValue, options) {
      const opts = options || {};
      if (!this.enabled || !this.animation || this.animation.running === false) {
        return commitProperty(this.target, this.prop, nextValue, Object.assign({}, opts, { bypassBehavior: true }));
      }
      this.cancel();
      this.targetValue = nextValue;
      const adapter = getPropertyAdapter(this.target, this.prop);
      const fromValue = Object.prototype.hasOwnProperty.call(this.animation, "from") && typeof this.animation.from !== "undefined"
        ? this.animation.from
        : adapter.read();
      const toValue = Object.prototype.hasOwnProperty.call(this.animation, "to") && typeof this.animation.to !== "undefined"
        ? this.animation.to
        : nextValue;
      const self = this;
      const job = this.animation.createJob({
        target: this.target,
        prop: this.prop,
        from: fromValue,
        to: toValue,
        commit: function commitAnimationValue(interpolatedValue) {
          commitProperty(self.target, self.prop, interpolatedValue, {
            bypassBehavior: true,
            preserveBinding: true,
            source: "animation",
          });
        },
        finish: function finishAnimationValue(finalValue) {
          commitProperty(self.target, self.prop, finalValue, {
            bypassBehavior: true,
            preserveBinding: true,
            source: "animation-final",
          });
          self.currentJob = null;
        },
      });
      if (!job) {
        return commitProperty(this.target, this.prop, nextValue, Object.assign({}, opts, { bypassBehavior: true }));
      }
      this.currentJob = job;
      job.start();
      return nextValue;
    }
  }

  function normalizeBehaviorDefinitionList(node) {
    return node && node.meta && Array.isArray(node.meta.__qhtmlBehaviors)
      ? node.meta.__qhtmlBehaviors
      : [];
  }

  function installBehaviorPropertyInterceptor(target, prop) {
    if (!target || typeof target !== "object" || !prop) {
      return false;
    }
    const propertyName = String(prop);
    const existingOwn = Object.getOwnPropertyDescriptor(target, propertyName);
    if (existingOwn && existingOwn.configurable === false) {
      return false;
    }
    const installed = qBehaviorInterceptors ? qBehaviorInterceptors.get(target) : null;
    if (installed && installed.has(propertyName)) {
      return true;
    }
    if (existingOwn && (typeof existingOwn.get === "function" || typeof existingOwn.set === "function")) {
      return false;
    }
    const storageKey = "__qhtmlBehaviorLocalValue__" + propertyName;
    const initialValue = existingOwn && Object.prototype.hasOwnProperty.call(existingOwn, "value") ? existingOwn.value : undefined;
    if (typeof initialValue !== "undefined") {
      target[storageKey] = initialValue;
    }
    const descriptor = {
      configurable: true,
      enumerable: true,
      get: function getBehaviorPropertyValue() {
        if (Object.prototype.hasOwnProperty.call(this, storageKey)) {
          return this[storageKey];
        }
        return getPropertyAdapter(this, propertyName).read();
      },
      set: function setBehaviorPropertyValue(value) {
        if (isBehaviorCommitBypassed(this, propertyName)) {
          this[storageKey] = value;
          syncQDomProperty(this, propertyName, value);
          return;
        }
        qSet(this, propertyName, value, { source: "user" });
      },
    };
    try {
      Object.defineProperty(target, propertyName, descriptor);
      if (qBehaviorInterceptors) {
        let set = qBehaviorInterceptors.get(target);
        if (!set) {
          set = new Set();
          qBehaviorInterceptors.set(target, set);
        }
        set.add(propertyName);
      }
      return true;
    } catch (error) {
      warnQBehavior("qhtml behavior warning: failed to install property interceptor.", {
        property: propertyName,
        error: error,
      });
      return false;
    }
  }

  function createAnimationFromBehaviorConfig(config) {
    const animationConfig = config && config.animation && typeof config.animation === "object" ? config.animation : null;
    if (!animationConfig) {
      return null;
    }
    return createBehaviorAnimationFromConfig(animationConfig);
  }

  function createBehaviorAnimationFromConfig(animationConfig) {
    if (!animationConfig || typeof animationConfig !== "object") {
      return null;
    }
    const type = normalizeBehaviorAnimationType(animationConfig.type || "NumberAnimation");
    if (type === "NumberAnimation") {
      return new NumberAnimation(animationConfig);
    }
    if (type === "q-property-animation") {
      return new QBehaviorPropertyAnimation(animationConfig);
    }
    if (type === "q-parallel-animation-group" || type === "q-sequential-animation-group") {
      const children = Array.isArray(animationConfig.children)
        ? animationConfig.children.map(createBehaviorAnimationFromConfig).filter(Boolean)
        : [];
      return new QBehaviorAnimationGroup(Object.assign({}, animationConfig, {
        type: type,
        mode: type === "q-sequential-animation-group" ? "sequential" : "parallel",
        children: children,
      }));
    }
    warnQBehavior("qhtml behavior warning: unsupported animation type '" + animationConfig.type + "'.");
    return null;
  }

  function attachQBehaviorsToTarget(target, node) {
    if (!target || typeof target !== "object") {
      return;
    }
    const behaviors = normalizeBehaviorDefinitionList(node);
    for (let i = 0; i < behaviors.length; i += 1) {
      const spec = behaviors[i] || {};
      const prop = String(spec.propertyName || "").trim();
      if (!prop) {
        continue;
      }
      if (getBehavior(target, prop)) {
        warnQBehavior("qhtml behavior warning: duplicate behavior ignored for property '" + prop + "'.");
        continue;
      }
      const animation = createAnimationFromBehaviorConfig(spec);
      const controller = new BehaviorController({
        target: target,
        prop: prop,
        animation: animation,
        enabled: !!animation && animation.running !== false,
      });
      registerBehavior(target, prop, controller);
      installBehaviorPropertyInterceptor(target, prop);
    }
  }

  function initializeBehaviorTargetProperties(target, node) {
    const behaviors = normalizeBehaviorDefinitionList(node);
    if (!target || behaviors.length === 0) {
      return;
    }
    const attrs = node && node.attributes && typeof node.attributes === "object" ? node.attributes : {};
    const props = node && node.props && typeof node.props === "object" ? node.props : {};
    for (let i = 0; i < behaviors.length; i += 1) {
      const prop = String(behaviors[i] && behaviors[i].propertyName || "").trim();
      if (!prop) {
        continue;
      }
      if (Object.prototype.hasOwnProperty.call(props, prop)) {
        commitProperty(target, prop, props[prop], { bypassBehavior: true, source: "internal" });
      } else if (Object.prototype.hasOwnProperty.call(attrs, prop)) {
        commitProperty(target, prop, attrs[prop], { bypassBehavior: true, source: "internal" });
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
    const eventAttributeParameterMap = normalizeEventAttributeParameterMap(opts.eventAttributeParameters);
    const eventAttributeThenMap = normalizeEventAttributeThenMap(opts.eventAttributeThen);
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
      if (
        bindEventAttributeListener(element, key, String(normalized), {
          doc: element.ownerDocument || global.document || null,
          scope: interpolationScope,
          scopeRoot:
            interpolationScope && interpolationScope.root && interpolationScope.root.nodeType === 1
              ? interpolationScope.root
              : null,
          parameterNames: eventAttributeParameterMap[String(key || "").trim().toLowerCase()] || [],
          thenBodies: eventAttributeThenMap[String(key || "").trim().toLowerCase()] || [],
        })
      ) {
        continue;
      }
      element.setAttribute(key, String(normalized));
    }
  }

  function setElementProperties(element, props, options) {
    if (!props || typeof props !== "object") {
      return;
    }
    const opts = options || {};
    const declaredProperties =
      opts.declaredProperties instanceof Set ? opts.declaredProperties : new Set();
    const directScope = opts.scope && typeof opts.scope === "object" ? opts.scope : null;
    const loggerHost =
      opts.hostElement && opts.hostElement.nodeType === 1 ? opts.hostElement : element && element.nodeType === 1 ? element : null;
    const componentNode = opts.componentNode && typeof opts.componentNode === "object" ? opts.componentNode : null;
    const instanceNode = opts.instanceNode && typeof opts.instanceNode === "object" ? opts.instanceNode : null;
    const thisArg = opts.thisArg || element || null;
    const keys = Object.keys(props);
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      if (!key) {
        continue;
      }
      let nextValue = props[key];
      const normalizedProperty = String(key || "").trim().toLowerCase();
      const declaredProperty = declaredProperties.has(normalizedProperty);
      const shouldResolveDirectReferenceOrCall =
        typeof nextValue === "string" &&
        !hasInlineReferenceExpressions(nextValue);
      if (shouldResolveDirectReferenceOrCall) {
        const referenceSource = String(nextValue || "");
        const trimmedReference = String(referenceSource || "").trim();
        const resolutionContext = createPathResolutionContext();
        let canonicalReferenceHandled = false;
        if (declaredProperty && isCanonicalInstancePathExpression(trimmedReference)) {
          const canonicalReference = resolveCanonicalPropertyReferenceExpression(
            trimmedReference,
            directScope,
            thisArg,
            resolutionContext
          );
          if (canonicalReference.matched) {
            canonicalReferenceHandled = true;
            if (canonicalReference.resolved) {
              nextValue = canonicalReference.value;
            } else if (canonicalReference.cycle) {
              nextValue = "";
            } else if (trimmedReference.indexOf(".") !== -1) {
              nextValue = "";
            }
            if (canonicalReference.cycle) {
              warnPathResolutionCycle(trimmedReference, resolutionContext);
            }
            if (canonicalReference.ambiguous && global.console && typeof global.console.warn === "function") {
              global.console.warn("qhtml property dot-walk warning: ambiguous path resolved to empty string:", trimmedReference);
            }
          }
        }
        const runtimeNamedCallback =
          trimmedReference ? resolveNamedCallbackRuntime(trimmedReference) : null;
        if (typeof runtimeNamedCallback === "function") {
          nextValue = runtimeNamedCallback;
        }
        if (
          trimmedReference &&
          directScope &&
          typeof directScope === "object" &&
          Object.prototype.hasOwnProperty.call(directScope, trimmedReference)
        ) {
          nextValue = directScope[trimmedReference];
        }
        if (!canonicalReferenceHandled) {
          const callableReference = tryResolveDirectCallableValue(referenceSource, { inlineScope: directScope || {} }, thisArg);
          if (callableReference && callableReference.matched && callableReference.found) {
            nextValue = callableReference.value;
          } else {
            const directReference = tryResolveDirectSymbolValue(
              referenceSource,
              { inlineScope: directScope || {} },
              thisArg,
              resolutionContext
            );
            if (directReference && directReference.matched) {
              if (directReference.found) {
                nextValue = directReference.value;
              } else if (directReference.cycle) {
                nextValue = "";
                warnPathResolutionCycle(trimmedReference, resolutionContext);
              } else if (declaredProperty && referenceSource.indexOf(".") !== -1) {
                nextValue = "";
              }
            }
            if (typeof nextValue === "string" && nextValue === referenceSource && directScope && typeof directScope === "object") {
              if (trimmedReference && Object.prototype.hasOwnProperty.call(directScope, trimmedReference)) {
                nextValue = directScope[trimmedReference];
              }
            }
          }
        }
      }
      nextValue = readQVarHandleValue(nextValue);
      try {
        qSet(element, key, nextValue, {
          source: "internal",
          propertyTarget: declaredProperty ? "property" : "auto",
        });
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

  function buildLifecycleHookStages(hook) {
    const source = hook && typeof hook.body === "string" ? hook.body.trim() : "";
    if (!source) {
      return [];
    }
    const thenBodies = normalizeThenBodies(hook && hook.thenBodies);
    const out = [{ source: source }];
    for (let i = 0; i < thenBodies.length; i += 1) {
      out.push({ source: thenBodies[i] });
    }
    return out;
  }

  function lifecycleHookKey(hook) {
    const name = String(hook && hook.name ? hook.name : "onready");
    const body = String(hook && hook.body ? hook.body : "");
    const thenBodies = normalizeThenBodies(hook && hook.thenBodies);
    return name + "::" + body + "::" + thenBodies.join("::");
  }

  function runLifecycleHookNow(hook, thisArg, targetDocument, errorLabel) {
    const stages = buildLifecycleHookStages(hook);
    if (stages.length === 0) {
      return;
    }
    if (thisArg && thisArg.nodeType === 1) {
      ensureComponentSelfReference(thisArg);
    }
    const doc = targetDocument || (thisArg && thisArg.ownerDocument) || global.document || null;
    const reportError = function reportLifecycleStageError(error) {
      if (global.console && typeof global.console.error === "function") {
        global.console.error(errorLabel, error);
      }
      return undefined;
    };
    const runStage = function runStage(stage) {
      try {
        const hasInterpolatedBody = hasInlineReferenceExpressions(stage.source);
        const hookBody = hasInterpolatedBody
          ? interpolateInlineReferenceExpressions(
              stage.source,
              thisArg || {},
              {
                component:
                  thisArg && typeof thisArg === "object" && thisArg
                    ? thisArg.component || null
                    : null,
                document: doc,
              },
              "qhtml lifecycle interpolation failed:",
              { scriptLiteral: true }
            )
          : stage.source;
        ensureScopedSelectorShortcut(thisArg || {}, null);
        const fn = new Function("event", "document", withScopedSelectorPrelude(hookBody));
        const executionThis = thisArg || null;
        const boundFn = fn.bind(executionThis);
        return invokeWithRuntimeExecutionHost(executionThis && executionThis.nodeType === 1 ? executionThis : null, function invokeLifecycleHook() {
          return boundFn(null, targetDocument);
        });
      } catch (error) {
        return reportError(error);
      }
    };
    let pending = null;
    for (let i = 0; i < stages.length; i += 1) {
      const stage = stages[i];
      if (pending && typeof pending.then === "function") {
        pending = pending.then(
          function runAfterResolved() {
            return runStage(stage);
          },
          function runAfterRejected(error) {
            reportError(error);
            return runStage(stage);
          }
        );
      } else {
        pending = runStage(stage);
      }
    }
    if (pending && typeof pending.then === "function" && typeof pending.catch === "function") {
      pending.catch(function onUnhandledLifecycleStageError(error) {
        reportError(error);
      });
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

  function ensureDocumentReadyHookState(targetDocument) {
    if (!targetDocument || (typeof targetDocument !== "object" && typeof targetDocument !== "function")) {
      return null;
    }
    let store = targetDocument.__qhtmlReadyHookGlobalState;
    if (!store || typeof store !== "object") {
      store = {};
      try {
        Object.defineProperty(targetDocument, "__qhtmlReadyHookGlobalState", {
          value: store,
          configurable: true,
          writable: true,
          enumerable: false,
        });
      } catch (error) {
        targetDocument.__qhtmlReadyHookGlobalState = store;
      }
    }
    return store;
  }

  function resolveReadyHookGlobalKey(thisArg, hookKey) {
    if (!thisArg) {
      return "";
    }
    const hostUuid = String(readHostQDomUuid(thisArg) || "").trim();
    if (!hostUuid) {
      return "";
    }
    return "uuid:" + hostUuid + "::" + String(hookKey || "");
  }

  function scheduleReadyHookExecution(callback) {
    if (typeof callback !== "function") {
      return;
    }
    if (typeof global.queueMicrotask === "function") {
      global.queueMicrotask(callback);
      return;
    }
    if (typeof Promise === "function" && typeof Promise.resolve === "function") {
      Promise.resolve()
        .then(callback)
        .catch(function reportReadyHookError(error) {
          if (global.console && typeof global.console.error === "function") {
            global.console.error("qhtml ready-hook scheduling failed:", error);
          }
        });
      return;
    }
    callback();
  }

  function runLifecycleHookMaybeDeferred(hook, thisArg, targetDocument, errorLabel) {
    if (hook && hook.isQConnect === true) {
      runLifecycleHookNow(hook, thisArg, targetDocument, errorLabel);
      return;
    }

    if (!isOnReadyHook(hook)) {
      runLifecycleHookNow(hook, thisArg, targetDocument, errorLabel);
      return;
    }

    const doc = targetDocument || (thisArg && thisArg.ownerDocument) || global.document || null;
    const state = doc && doc.__qhtmlContentLoadedState && typeof doc.__qhtmlContentLoadedState === "object" ? doc.__qhtmlContentLoadedState : null;
    const runtimeManaged = !!(state && state.runtimeManaged);
    const alreadySignaled = !!(state && Number(state.sequence || 0) > 0 && Number(state.pending || 0) === 0);
    const readyStore = ensureReadyHookState(thisArg);
    const readyGlobalStore = ensureDocumentReadyHookState(doc);
    const key = lifecycleHookKey(hook);
    const globalKey = resolveReadyHookGlobalKey(thisArg, key);
    if (readyStore && (readyStore[key] === "pending" || readyStore[key] === "done")) {
      return;
    }
    if (readyGlobalStore && globalKey && (readyGlobalStore[globalKey] === "pending" || readyGlobalStore[globalKey] === "done")) {
      return;
    }
    if (readyStore) {
      readyStore[key] = "pending";
    }
    if (readyGlobalStore && globalKey) {
      readyGlobalStore[globalKey] = "pending";
    }

    const execute = function executeReadyHook() {
      if (readyStore && readyStore[key] === "done") {
        return;
      }
      if (readyGlobalStore && globalKey && readyGlobalStore[globalKey] === "done") {
        return;
      }
      if (readyStore) {
        readyStore[key] = "done";
      }
      if (readyGlobalStore && globalKey) {
        readyGlobalStore[globalKey] = "done";
      }
      runLifecycleHookNow(hook, thisArg, doc || targetDocument, errorLabel);
    };

    const deferExecute = function deferExecuteReadyHook() {
      scheduleReadyHookExecution(execute);
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
    const runtimeApi = global.QHtml && typeof global.QHtml === "object" ? global.QHtml : null;
    if (
      runtimeApi &&
      typeof runtimeApi.getEventLoopMode === "function" &&
      runtimeApi.getEventLoopMode() === "queued" &&
      typeof runtimeApi.dispatchSignalPayload === "function"
    ) {
      runtimeApi.dispatchSignalPayload(target, signalName, payload);
      return;
    }
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
      if (
        shouldLogQLoggerCategory(target, null, null, "q-signal") &&
        global.console &&
        typeof global.console.log === "function"
      ) {
        global.console.log("qhtml signal dispatch failed for '" + signalName + "':", error);
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
      if (
        shouldLogQLoggerCategory(target, null, null, "q-signal") &&
        global.console &&
        typeof global.console.log === "function"
      ) {
        global.console.log("qhtml named signal dispatch failed for '" + signalName + "':", error);
      }
    }
  }

  function readHostQDomNode(hostElement) {
    if (!hostElement || typeof hostElement.qdom !== "function") {
      return null;
    }
    try {
      const qdomNode = hostElement.qdom();
      return qdomNode && typeof qdomNode === "object" ? qdomNode : null;
    } catch (error) {
      return null;
    }
  }

  function readHostQDomUuid(hostElement) {
    const qdomNode = readHostQDomNode(hostElement);
    if (!qdomNode || !qdomNode.meta || typeof qdomNode.meta !== "object") {
      return "";
    }
    const preferred = typeof qdomNode.meta[QDOM_UUID_META_KEY] === "string" ? String(qdomNode.meta[QDOM_UUID_META_KEY] || "").trim() : "";
    if (preferred) {
      return preferred;
    }
    if (core && typeof core.ensureNodeUuid === "function") {
      try {
        const ensured = String(core.ensureNodeUuid(qdomNode) || "").trim();
        if (ensured) {
          return ensured;
        }
      } catch (ignoredEnsureUuidError) {
        // fall through to legacy value path
      }
    }
    const legacy = typeof qdomNode.meta.uuid === "string" ? String(qdomNode.meta.uuid || "").trim() : "";
    return legacy;
  }

  function getComponentPropertyStateStore(hostElement) {
    const qdomNode = readHostQDomNode(hostElement);
    if (qdomNode && (!qdomNode.meta || typeof qdomNode.meta !== "object")) {
      qdomNode.meta = {};
    }
    const qdomMeta = qdomNode && qdomNode.meta && typeof qdomNode.meta === "object" ? qdomNode.meta : null;
    if (qdomMeta) {
      if (!qdomMeta[COMPONENT_PROP_STATE_KEY] || typeof qdomMeta[COMPONENT_PROP_STATE_KEY] !== "object" || Array.isArray(qdomMeta[COMPONENT_PROP_STATE_KEY])) {
        qdomMeta[COMPONENT_PROP_STATE_KEY] = {};
      }
      return qdomMeta[COMPONENT_PROP_STATE_KEY];
    }
    if (!hostElement || typeof hostElement !== "object") {
      return null;
    }
    if (!hostElement[COMPONENT_PROP_STATE_KEY] || typeof hostElement[COMPONENT_PROP_STATE_KEY] !== "object" || Array.isArray(hostElement[COMPONENT_PROP_STATE_KEY])) {
      hostElement[COMPONENT_PROP_STATE_KEY] = {};
    }
    return hostElement[COMPONENT_PROP_STATE_KEY];
  }

  function readTrackedDeclaredProperty(hostElement, propertyName) {
    const store = getComponentPropertyStateStore(hostElement);
    if (!store || !Object.prototype.hasOwnProperty.call(store, propertyName)) {
      return {
        exists: false,
        value: undefined,
      };
    }
    return {
      exists: true,
      value: store[propertyName],
    };
  }

  function writeTrackedDeclaredProperty(hostElement, propertyName, value) {
    const store = getComponentPropertyStateStore(hostElement);
    if (!store) {
      return;
    }
    store[propertyName] = value;
  }

  function ensureDeclaredPropertyModelListenerStore(hostElement) {
    if (!hostElement || typeof hostElement !== "object") {
      return null;
    }
    let store = hostElement[Q_PROPERTY_MODEL_LISTENER_STORE_KEY];
    if (!store || typeof store !== "object" || Array.isArray(store)) {
      store = Object.create(null);
      try {
        Object.defineProperty(hostElement, Q_PROPERTY_MODEL_LISTENER_STORE_KEY, {
          configurable: true,
          enumerable: false,
          writable: true,
          value: store,
        });
      } catch (error) {
        hostElement[Q_PROPERTY_MODEL_LISTENER_STORE_KEY] = store;
      }
    }
    return store;
  }

  function detachDeclaredPropertyModelListener(hostElement, propertyName) {
    const store = hostElement && hostElement[Q_PROPERTY_MODEL_LISTENER_STORE_KEY];
    if (!store || typeof store !== "object" || Array.isArray(store)) {
      return;
    }
    const key = String(propertyName || "").trim();
    if (!key || !Object.prototype.hasOwnProperty.call(store, key)) {
      return;
    }
    const entry = store[key] && typeof store[key] === "object" ? store[key] : null;
    delete store[key];
    if (!entry) {
      return;
    }
    if (typeof entry.disconnect === "function") {
      try {
        entry.disconnect();
        return;
      } catch (error) {
        // fall through
      }
    }
    if (entry.signal && typeof entry.signal.disconnect === "function" && typeof entry.listener === "function") {
      try {
        entry.signal.disconnect(entry.listener);
      } catch (error) {
        // no-op
      }
    }
  }

  function attachDeclaredPropertyModelListener(hostElement, componentId, propertyName, value) {
    const key = String(propertyName || "").trim();
    if (!hostElement || !key) {
      return;
    }
    if (!value || typeof value !== "object" || value.__qhtmlIsQModel !== true) {
      return;
    }
    const signal = value.modelChanged || value.modelchanged;
    const canConnectSignal = signal && typeof signal.connect === "function";
    const canSubscribeModel = typeof value.subscribe === "function";
    if (!canConnectSignal && !canSubscribeModel) {
      return;
    }

    const listener = function onDeclaredPropertyModelMutation() {
      const tracked = readTrackedDeclaredProperty(hostElement, key);
      const currentValue = tracked.exists ? tracked.value : hostElement[key];
      emitDeclaredPropertyChangedEvent(hostElement, componentId, key, currentValue, currentValue);
    };

    let disconnect = null;
    if (canConnectSignal) {
      try {
        const connected = signal.connect(listener);
        if (typeof connected === "function") {
          disconnect = connected;
        }
      } catch (error) {
        disconnect = null;
      }
      if (!disconnect && typeof signal.disconnect === "function") {
        disconnect = function disconnectModelChangedSignal() {
          try {
            signal.disconnect(listener);
          } catch (error) {
            // no-op
          }
        };
      }
    }
    if (!disconnect && canSubscribeModel) {
      try {
        const unsub = value.subscribe(listener);
        if (typeof unsub === "function") {
          disconnect = unsub;
        }
      } catch (error) {
        disconnect = null;
      }
    }

    if (!disconnect) {
      return;
    }

    const store = ensureDeclaredPropertyModelListenerStore(hostElement);
    if (!store) {
      return;
    }
    store[key] = {
      listener: listener,
      disconnect: disconnect,
      signal: signal || null,
      model: value,
    };
  }

  function normalizeQLoggerCategoryToken(rawToken) {
    const token = String(rawToken || "").trim().toLowerCase();
    if (!token) {
      return "";
    }
    const condensed = token.replace(/[^a-z0-9]/g, "");
    if (condensed === "all" || condensed === "qall") {
      return "all";
    }
    if (condensed === "property" || condensed === "qproperty") {
      return "q-property";
    }
    if (condensed === "signal" || condensed === "qsignal") {
      return "q-signal";
    }
    if (condensed === "component" || condensed === "qcomponent") {
      return "q-component";
    }
    if (condensed === "function" || condensed === "qfunction") {
      return "function";
    }
    if (condensed === "slot" || condensed === "qslot") {
      return "slot";
    }
    if (condensed === "model" || condensed === "qmodel") {
      return "model";
    }
    if (condensed === "instantiation" || condensed === "instantiate" || condensed === "qinstantiation") {
      return "instantiation";
    }
    return token;
  }

  function readQLoggerCategorySet(rawValue) {
    const out = new Set();
    if (Array.isArray(rawValue)) {
      for (let i = 0; i < rawValue.length; i += 1) {
        const normalized = normalizeQLoggerCategoryToken(rawValue[i]);
        if (normalized) {
          out.add(normalized);
        }
      }
      return out;
    }
    if (typeof rawValue === "string") {
      const matches = rawValue.match(/[A-Za-z_][A-Za-z0-9_-]*/g) || [];
      for (let i = 0; i < matches.length; i += 1) {
        const normalized = normalizeQLoggerCategoryToken(matches[i]);
        if (normalized) {
          out.add(normalized);
        }
      }
      return out;
    }
    if (rawValue && typeof rawValue === "object") {
      const keys = Object.keys(rawValue);
      for (let i = 0; i < keys.length; i += 1) {
        const key = String(keys[i] || "").trim();
        if (!key || rawValue[key] !== true) {
          continue;
        }
        const normalized = normalizeQLoggerCategoryToken(key);
        if (normalized) {
          out.add(normalized);
        }
      }
    }
    return out;
  }

  function resolveQLoggerCategories(hostElement, componentNode, instanceNode) {
    if (hostElement && hostElement.__qhtmlQLoggerDisabled === true) {
      return new Set();
    }
    if (hostElement && Object.prototype.hasOwnProperty.call(hostElement, "__qhtmlQLoggerCategories")) {
      return readQLoggerCategorySet(hostElement.__qhtmlQLoggerCategories);
    }
    const qdomNode = readHostQDomNode(hostElement);
    if (qdomNode && qdomNode.meta && typeof qdomNode.meta === "object" && Object.prototype.hasOwnProperty.call(qdomNode.meta, QLOGGER_META_KEY)) {
      return readQLoggerCategorySet(qdomNode.meta[QLOGGER_META_KEY]);
    }
    if (
      instanceNode &&
      instanceNode.meta &&
      typeof instanceNode.meta === "object" &&
      Object.prototype.hasOwnProperty.call(instanceNode.meta, QLOGGER_META_KEY)
    ) {
      return readQLoggerCategorySet(instanceNode.meta[QLOGGER_META_KEY]);
    }
    if (
      componentNode &&
      componentNode.meta &&
      typeof componentNode.meta === "object" &&
      Object.prototype.hasOwnProperty.call(componentNode.meta, QLOGGER_META_KEY)
    ) {
      return readQLoggerCategorySet(componentNode.meta[QLOGGER_META_KEY]);
    }
    return new Set();
  }

  function shouldLogQLoggerCategory(hostElement, componentNode, instanceNode, categoryToken) {
    const target = normalizeQLoggerCategoryToken(categoryToken);
    if (!target) {
      return false;
    }
    const categories = resolveQLoggerCategories(hostElement, componentNode, instanceNode);
    if (!(categories instanceof Set) || categories.size === 0) {
      return false;
    }
    return categories.has("all") || categories.has(target);
  }

  function emitDeclaredPropertyChangedEvent(hostElement, componentId, propertyName, nextValue, previousValue) {
    if (!hostElement) {
      return;
    }
    const payload = {
      type: "signal",
      component: componentId,
      componentId: componentId,
      componentTag: String(hostElement && hostElement.tagName ? hostElement.tagName : componentId || "").trim().toLowerCase(),
      componentUuid: readHostQDomUuid(hostElement),
      property: propertyName,
      signal: String(propertyName || "") + "Changed",
      signalId: String(propertyName || "") + "Changed",
      value: nextValue,
      previousValue: previousValue,
      timestamp: Date.now(),
    };
    const runtimeApi = global.QHtml && typeof global.QHtml === "object" ? global.QHtml : null;
    if (runtimeApi && typeof runtimeApi.dispatchPropertyChangedEvent === "function") {
      runtimeApi.dispatchPropertyChangedEvent(hostElement, payload);
      return;
    }
    const signalName = String(payload.signal || "").trim();
    if (!signalName || typeof hostElement.dispatchEvent !== "function") {
      return;
    }
    const signalPayload = {
      type: "signal",
      signal: signalName,
      signalId: signalName,
      component: payload.component,
      componentId: payload.componentId,
      componentTag: payload.componentTag,
      componentUuid: payload.componentUuid,
      property: payload.property,
      value: payload.value,
      source: "q-property",
      timestamp: payload.timestamp,
      args: [payload.value],
      params: {
        value: payload.value,
      },
    };
    try {
      if (typeof global.CustomEvent === "function") {
        hostElement.dispatchEvent(
          new global.CustomEvent("q-signal", {
            detail: signalPayload,
            bubbles: true,
            composed: true,
          })
        );
        hostElement.dispatchEvent(
          new global.CustomEvent(signalName, {
            detail: signalPayload,
            bubbles: true,
            composed: true,
          })
        );
      } else {
        hostElement.dispatchEvent({
          type: "q-signal",
          detail: signalPayload,
        });
        hostElement.dispatchEvent({
          type: signalName,
          detail: signalPayload,
        });
      }
    } catch (error) {
      if (
        shouldLogQLoggerCategory(hostElement, null, null, "q-signal") &&
        global.console &&
        typeof global.console.log === "function"
      ) {
        global.console.log("qhtml property changed signal dispatch failed:", error);
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
    let session;
    try {
      session = createWasmSession(config);
    } catch (error) {
      if (global.console && typeof global.console.error === "function") {
        global.console.error("qhtml q-wasm session init failed:", error);
      }
      const rejectedReady = Promise.reject(error);
      observePromiseRejection(rejectedReady, "qhtml q-wasm ready rejected:");
      hostElement.wasm = {
        mode: "none",
        ready: rejectedReady,
        call: function callFailedWasmExport() {
          return Promise.reject(error);
        },
        terminate: function terminateFailedWasmSession() {},
      };
      hostElement.__qhtmlWasmRuntime = {
        session: null,
        terminate: hostElement.wasm.terminate,
        config: config,
      };
      return;
    }
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
    observePromiseRejection(wasmApi.ready, "qhtml q-wasm ready rejected:");

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
      observePromiseRejection(wasmApi.ready, "qhtml q-wasm init export failed:");
    }
  }

  function qWorkerIsSupported() {
    return !!(
      typeof global.Worker === "function" &&
      typeof global.Blob === "function" &&
      global.URL &&
      typeof global.URL.createObjectURL === "function"
    );
  }

  function qWorkerSerializeError(error) {
    if (!error) {
      return {
        error: true,
        message: "Unknown q-worker error",
      };
    }
    return {
      error: true,
      name: String(error.name || "Error"),
      message: String(error.message || String(error)),
      stack: String(error.stack || ""),
    };
  }

  function qWorkerCloneable(value, depth, seen) {
    if (value == null) {
      return value;
    }
    if (depth > 8) {
      return null;
    }
    if (value && typeof value === "object" && value.__qhtmlIsQModel === true) {
      try {
        const mode = typeof value.mode === "function" ? String(value.mode() || "").trim().toLowerCase() : "";
        if (mode === "array" && typeof value.toArray === "function") {
          return qWorkerCloneable(value.toArray(), depth + 1, seen);
        }
        if (typeof value.toObject === "function") {
          return qWorkerCloneable(value.toObject(), depth + 1, seen);
        }
      } catch (error) {
        return null;
      }
    }
    if (typeof value === "function") {
      return null;
    }
    if (value && value.nodeType === 1) {
      return null;
    }
    if (typeof ArrayBuffer !== "undefined") {
      if (value instanceof ArrayBuffer) {
        return value.slice(0);
      }
      if (typeof ArrayBuffer.isView === "function" && ArrayBuffer.isView(value)) {
        if (typeof DataView !== "undefined" && value instanceof DataView) {
          return new DataView(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
        }
        if (typeof value.constructor === "function") {
          return new value.constructor(value);
        }
      }
    }
    if (typeof value !== "object") {
      return value;
    }
    const cache = seen instanceof WeakMap ? seen : new WeakMap();
    if (cache.has(value)) {
      return cache.get(value);
    }
    if (Array.isArray(value)) {
      const outArray = [];
      cache.set(value, outArray);
      for (let i = 0; i < value.length; i += 1) {
        outArray.push(qWorkerCloneable(value[i], depth + 1, cache));
      }
      return outArray;
    }
    const outObject = {};
    cache.set(value, outObject);
    const keys = Object.keys(value);
    for (let i = 0; i < keys.length; i += 1) {
      const key = String(keys[i] || "").trim();
      if (!key) {
        continue;
      }
      outObject[key] = qWorkerCloneable(value[key], depth + 1, cache);
    }
    return outObject;
  }

  function collectWorkerSnapshotState(hostElement, declaredProperties) {
    const out = {};
    const names = Array.isArray(declaredProperties) ? declaredProperties.slice() : [];
    const trackedState =
      hostElement &&
      hostElement[COMPONENT_PROP_STATE_KEY] &&
      typeof hostElement[COMPONENT_PROP_STATE_KEY] === "object" &&
      !Array.isArray(hostElement[COMPONENT_PROP_STATE_KEY])
        ? hostElement[COMPONENT_PROP_STATE_KEY]
        : null;
    if (trackedState) {
      const trackedNames = Object.keys(trackedState);
      for (let i = 0; i < trackedNames.length; i += 1) {
        names.push(trackedNames[i]);
      }
    }
    const seen = new Set();
    for (let i = 0; i < names.length; i += 1) {
      const name = String(names[i] || "").trim();
      if (!name || seen.has(name)) {
        continue;
      }
      seen.add(name);
      let value = null;
      try {
        value = hostElement ? hostElement[name] : null;
      } catch (error) {
        value = null;
      }
      if (typeof value === "function") {
        continue;
      }
      const cloned = qWorkerCloneable(value, 0, new WeakMap());
      if (typeof cloned === "undefined" && typeof value !== "undefined") {
        continue;
      }
      out[name] = cloned;
    }
    return out;
  }

  function coerceWorkerReturnedValue(previousValue, nextValue) {
    if (previousValue && typeof previousValue === "object" && previousValue.__qhtmlIsQModel === true) {
      try {
        const mode = typeof previousValue.mode === "function" ? String(previousValue.mode() || "").trim().toLowerCase() : "";
        if (mode === "array" && Array.isArray(nextValue) && typeof global.QArray === "function") {
          return global.QArray(nextValue);
        }
        if ((mode === "map" || mode === "object") && nextValue && typeof nextValue === "object" && !Array.isArray(nextValue)) {
          if (typeof global.QModel === "function") {
            return global.QModel(nextValue);
          }
        }
      } catch (error) {
        return nextValue;
      }
    }
    return nextValue;
  }

  function getQWorkerExecutorScriptUrl() {
    if (qWorkerExecutorScriptUrl) {
      return qWorkerExecutorScriptUrl;
    }
    if (!qWorkerIsSupported()) {
      return "";
    }
    const script =
      "function __qhtmlWorkerSerializeError(error){return {error:true,name:String(error&&error.name||'Error'),message:String(error&&error.message||String(error||'')),stack:String(error&&error.stack||'')}}\n" +
      "function __qhtmlWorkerCloneSafe(value, seen){if(value===null||typeof value==='undefined'){return value;}var t=typeof value;if(t==='string'||t==='number'||t==='boolean'){return value;}if(t==='function'){return undefined;}if(t==='bigint'){return Number(value);}if(typeof ArrayBuffer!=='undefined'){if(value instanceof ArrayBuffer){return value.slice(0);}if(typeof ArrayBuffer.isView==='function'&&ArrayBuffer.isView(value)){if(typeof DataView!=='undefined'&&value instanceof DataView){return new DataView(value.buffer.slice(value.byteOffset,value.byteOffset+value.byteLength));}if(typeof value.constructor==='function'){return new value.constructor(value);}}}if(!seen||typeof seen.has!=='function'){seen=new Map();}if(seen.has(value)){return undefined;}if(Array.isArray(value)){seen.set(value,true);var outArr=[];for(var i=0;i<value.length;i+=1){var next=__qhtmlWorkerCloneSafe(value[i],seen);if(typeof next!=='undefined'){outArr.push(next);}}seen.delete(value);return outArr;}if(t==='object'){seen.set(value,true);var outObj={};var keys=Object.keys(value);for(var k=0;k<keys.length;k+=1){var key=keys[k];if(!key){continue;}var nextVal=__qhtmlWorkerCloneSafe(value[key],seen);if(typeof nextVal!=='undefined'){outObj[key]=nextVal;}}seen.delete(value);return outObj;}return undefined;}\n" +
      "self.onmessage = async function(event){var data = event && event.data && typeof event.data === 'object' ? event.data : {}; if (data.type !== 'run'){ return; }\n" +
      "var state = data.state && typeof data.state === 'object' ? data.state : {}; var emitted = []; var runtimeThis = { component: state }; var signalNames = Array.isArray(data.signalNames) ? data.signalNames : [];\n" +
      "for (var i=0;i<signalNames.length;i+=1){(function(name){if(!name){return;} var fn=function(){emitted.push({name:name,args:Array.prototype.slice.call(arguments)})}; runtimeThis[name]=fn; runtimeThis.component[name]=fn;})(String(signalNames[i]||'').trim());}\n" +
      "var fn=null; try{ fn = new Function(String(data.params||''), String(data.body||'')); }catch(compileError){ self.postMessage({id:data.id, ok:false, error:__qhtmlWorkerSerializeError(compileError), state:state, signals:emitted}); return; }\n" +
      "try{ var args = Array.isArray(data.args) ? data.args : []; var result = fn.apply(runtimeThis, args); if (result && typeof result.then === 'function'){ result = await result; }\n" +
      "var safeState=__qhtmlWorkerCloneSafe(runtimeThis.component && typeof runtimeThis.component === 'object' ? runtimeThis.component : state); var safeResult=__qhtmlWorkerCloneSafe(result); var safeSignals=__qhtmlWorkerCloneSafe(emitted); self.postMessage({id:data.id, ok:true, result:safeResult, state:safeState||{}, signals:Array.isArray(safeSignals)?safeSignals:[]}); }\n" +
      "catch(runError){ var safeStateErr=__qhtmlWorkerCloneSafe(runtimeThis.component && typeof runtimeThis.component === 'object' ? runtimeThis.component : state); var safeSignalsErr=__qhtmlWorkerCloneSafe(emitted); self.postMessage({id:data.id, ok:false, error:__qhtmlWorkerSerializeError(runError), state:safeStateErr||{}, signals:Array.isArray(safeSignalsErr)?safeSignalsErr:[]}); }};\n";
    const blob = new global.Blob([script], { type: "application/javascript" });
    qWorkerExecutorScriptUrl = global.URL.createObjectURL(blob);
    return qWorkerExecutorScriptUrl;
  }

  function getQWorkerRuntimeApi() {
    const runtimeApi = global.QHtml && typeof global.QHtml === "object" ? global.QHtml : null;
    if (!runtimeApi) {
      return null;
    }
    return runtimeApi;
  }

  function resolveQWorkerRuntimeUuid(componentNode, hostElement) {
    let runtimeUuid = "";
    try {
      runtimeUuid = String(readHostQDomUuid(hostElement) || "").trim();
    } catch (error) {
      runtimeUuid = "";
    }
    if (runtimeUuid) {
      return runtimeUuid;
    }
    const existing = String(hostElement && hostElement.__qhtmlWorkerRuntimeUuid || "").trim();
    if (existing) {
      return existing;
    }
    qWorkerFallbackRuntimeCounter += 1;
    const componentId = String(componentNode && (componentNode.componentId || hostElement.tagName) || "q-worker")
      .trim()
      .toLowerCase();
    runtimeUuid = "qworker:" + componentId + ":" + String(qWorkerFallbackRuntimeCounter);
    try {
      hostElement.__qhtmlWorkerRuntimeUuid = runtimeUuid;
    } catch (error) {
      // no-op
    }
    return runtimeUuid;
  }

  function getQWorkerRuntimeFromRegistry(runtimeApi, runtimeUuid) {
    if (!runtimeUuid) {
      return null;
    }
    if (runtimeApi && typeof runtimeApi.getWorkerRuntime === "function") {
      const record = runtimeApi.getWorkerRuntime(runtimeUuid);
      return record && typeof record === "object" ? record : null;
    }
    const fallback = qWorkerRuntimeRegistryFallback.get(runtimeUuid);
    return fallback && typeof fallback === "object" ? fallback : null;
  }

  function registerQWorkerRuntime(runtimeApi, runtimeUuid, record) {
    if (!runtimeUuid || !record || typeof record !== "object") {
      return;
    }
    if (runtimeApi && typeof runtimeApi.registerWorkerRuntime === "function") {
      runtimeApi.registerWorkerRuntime(runtimeUuid, record);
      return;
    }
    qWorkerRuntimeRegistryFallback.set(runtimeUuid, record);
  }

  function unregisterQWorkerRuntime(runtimeApi, runtimeUuid) {
    if (!runtimeUuid) {
      return;
    }
    if (runtimeApi && typeof runtimeApi.unregisterWorkerRuntime === "function") {
      runtimeApi.unregisterWorkerRuntime(runtimeUuid);
      return;
    }
    qWorkerRuntimeRegistryFallback.delete(runtimeUuid);
  }

  function terminateQWorkerRuntime(runtimeApi, runtimeUuid, record) {
    if (!record || typeof record !== "object") {
      unregisterQWorkerRuntime(runtimeApi, runtimeUuid);
      return;
    }
    if (record.idleHandle != null && typeof global.clearTimeout === "function") {
      try {
        global.clearTimeout(record.idleHandle);
      } catch (error) {
        // no-op
      }
    }
    record.idleHandle = null;
    if (record.pending instanceof Map && record.pending.size > 0) {
      const errorPayload = {
        error: true,
        code: "worker_terminated",
        message: "q-worker runtime terminated before completing queued request.",
      };
      record.pending.forEach(function eachPending(entry) {
        if (!entry || typeof entry.resolve !== "function") {
          return;
        }
        try {
          entry.resolve(errorPayload);
        } catch (error) {
          // no-op
        }
      });
      record.pending.clear();
    }
    if (record.worker) {
      try {
        record.worker.terminate();
      } catch (error) {
        // no-op
      }
    }
    record.worker = null;
    unregisterQWorkerRuntime(runtimeApi, runtimeUuid);
  }

  function scheduleQWorkerIdleTermination(runtimeApi, runtimeUuid, record) {
    if (!record || typeof record !== "object") {
      return;
    }
    if (record.idleHandle != null && typeof global.clearTimeout === "function") {
      try {
        global.clearTimeout(record.idleHandle);
      } catch (error) {
        // no-op
      }
      record.idleHandle = null;
    }
    if (record.pending instanceof Map && record.pending.size > 0) {
      return;
    }
    if (typeof global.setTimeout !== "function") {
      return;
    }
    record.idleHandle = global.setTimeout(function terminateQWorkerRuntimeWhenIdle() {
      const latest = getQWorkerRuntimeFromRegistry(runtimeApi, runtimeUuid);
      if (!latest || latest !== record) {
        return;
      }
      if (latest.pending instanceof Map && latest.pending.size > 0) {
        return;
      }
      terminateQWorkerRuntime(runtimeApi, runtimeUuid, latest);
    }, Q_WORKER_IDLE_TERMINATE_MS);
  }

  function applyQWorkerStateToHost(targetHost, detail) {
    if (!targetHost || targetHost.nodeType !== 1) {
      return;
    }
    const nextState = detail && detail.state && typeof detail.state === "object" ? detail.state : null;
    if (nextState) {
      const stateKeys = Object.keys(nextState);
      for (let i = 0; i < stateKeys.length; i += 1) {
        const key = String(stateKeys[i] || "").trim();
        if (!key) {
          continue;
        }
        let previousValue;
        try {
          previousValue = targetHost[key];
        } catch (error) {
          previousValue = undefined;
        }
        const coerced = coerceWorkerReturnedValue(previousValue, nextState[key]);
        try {
          targetHost[key] = coerced;
        } catch (error) {
          // no-op
        }
      }
    }
    const emittedSignals = Array.isArray(detail && detail.signals) ? detail.signals : [];
    for (let i = 0; i < emittedSignals.length; i += 1) {
      const signalRecord = emittedSignals[i] && typeof emittedSignals[i] === "object" ? emittedSignals[i] : null;
      if (!signalRecord) {
        continue;
      }
      const signalName = String(signalRecord.name || "").trim();
      if (!signalName || typeof targetHost[signalName] !== "function") {
        continue;
      }
      const signalArgs = Array.isArray(signalRecord.args) ? signalRecord.args : [];
      const signalFn = targetHost[signalName];
      try {
        Function.prototype.apply.call(signalFn, targetHost, signalArgs);
      } catch (error) {
        // no-op
      }
    }
  }

  function ensureQWorkerRuntime(componentNode, hostElement, runtimeApi, runtimeUuid) {
    const existing = getQWorkerRuntimeFromRegistry(runtimeApi, runtimeUuid);
    if (existing && typeof existing === "object" && existing.worker) {
      existing.hostElement = hostElement;
      return existing;
    }
    const workerScriptUrl = getQWorkerExecutorScriptUrl();
    if (!workerScriptUrl) {
      return null;
    }
    let worker = null;
    try {
      worker = new global.Worker(workerScriptUrl);
    } catch (error) {
      return null;
    }
    const record = {
      uuid: runtimeUuid,
      hostElement: hostElement,
      worker: worker,
      pending: new Map(),
      nextRequestId: 0,
      idleHandle: null,
    };
    worker.onmessage = function onQWorkerRuntimeMessage(event) {
      const detail = event && event.data && typeof event.data === "object" ? event.data : {};
      const requestId = Number(detail.id);
      const pendingEntry = Number.isFinite(requestId) ? record.pending.get(requestId) : null;
      if (!pendingEntry || typeof pendingEntry.resolve !== "function") {
        return;
      }
      record.pending.delete(requestId);
      const targetHost = pendingEntry.targetHost && pendingEntry.targetHost.nodeType === 1
        ? pendingEntry.targetHost
        : record.hostElement;
      applyQWorkerStateToHost(targetHost, detail);
      if (detail && detail.ok === true) {
        pendingEntry.resolve(detail.result);
      } else {
        pendingEntry.resolve(
          detail && detail.error && typeof detail.error === "object"
            ? detail.error
            : {
                error: true,
                code: "worker_execution_failed",
                message: "q-worker execution failed.",
              }
        );
      }
      scheduleQWorkerIdleTermination(runtimeApi, runtimeUuid, record);
    };
    worker.onerror = function onQWorkerRuntimeError(error) {
      const serialized = qWorkerSerializeError(error);
      if (record.pending instanceof Map && record.pending.size > 0) {
        record.pending.forEach(function eachPending(entry) {
          if (!entry || typeof entry.resolve !== "function") {
            return;
          }
          try {
            entry.resolve(serialized);
          } catch (resolveError) {
            // no-op
          }
        });
        record.pending.clear();
      }
      terminateQWorkerRuntime(runtimeApi, runtimeUuid, record);
    };
    registerQWorkerRuntime(runtimeApi, runtimeUuid, record);
    return record;
  }

  function invokeQWorkerMethod(componentNode, hostElement, declaredProperties, signalNames, method, invocationArgs) {
    if (!hostElement || typeof method !== "object") {
      return Promise.resolve({
        error: true,
        code: "worker_method_invalid",
        message: "q-worker method could not be invoked.",
      });
    }
    if (!qWorkerIsSupported()) {
      return Promise.resolve({
        error: true,
        code: "worker_unavailable",
        message: "Web Worker is not available in this runtime.",
      });
    }
    const params = String(method.parameters || "").trim();
    const rawBody = String(method.body || "");
    const executableBody = hasInlineReferenceExpressions(rawBody)
      ? interpolateInlineReferenceExpressions(
          rawBody,
          hostElement,
          { component: hostElement },
          "qhtml q-worker interpolation failed:",
          { scriptLiteral: true }
        )
      : rawBody;
    const snapshotState = collectWorkerSnapshotState(hostElement, declaredProperties);
    const argsArray = Array.prototype.slice.call(invocationArgs || []);
    const runtimeApi = getQWorkerRuntimeApi();
    const runtimeUuid = resolveQWorkerRuntimeUuid(componentNode, hostElement);

    return new Promise(function resolveWorkerInvocation(resolve) {
      const dispatch = function dispatchQWorkerInvocation() {
        const runtimeRecord = ensureQWorkerRuntime(componentNode, hostElement, runtimeApi, runtimeUuid);
        if (!runtimeRecord || !runtimeRecord.worker) {
          resolve({
            error: true,
            code: "worker_create_failed",
            message: "q-worker could not initialize worker runtime.",
          });
          return;
        }
        if (runtimeRecord.idleHandle != null && typeof global.clearTimeout === "function") {
          try {
            global.clearTimeout(runtimeRecord.idleHandle);
          } catch (error) {
            // no-op
          }
          runtimeRecord.idleHandle = null;
        }
        runtimeRecord.nextRequestId = Number(runtimeRecord.nextRequestId || 0) + 1;
        const requestId = runtimeRecord.nextRequestId;
        runtimeRecord.pending.set(requestId, {
          resolve: resolve,
          targetHost: hostElement,
          createdAt: Date.now(),
        });
        try {
          runtimeRecord.worker.postMessage({
            type: "run",
            id: requestId,
            params: params,
            body: executableBody,
            args: qWorkerCloneable(argsArray, 0, new WeakMap()),
            state: qWorkerCloneable(snapshotState, 0, new WeakMap()),
            signalNames: Array.isArray(signalNames) ? signalNames.slice() : [],
          });
        } catch (error) {
          runtimeRecord.pending.delete(requestId);
          resolve(qWorkerSerializeError(error));
          scheduleQWorkerIdleTermination(runtimeApi, runtimeUuid, runtimeRecord);
          return;
        }
      };

      if (runtimeApi && typeof runtimeApi.enqueueWorkerEvent === "function") {
        runtimeApi.enqueueWorkerEvent(
          "worker-method-dispatch",
          dispatch,
          {
            target: hostElement,
            payload: {
              workerUuid: runtimeUuid,
              methodName: String(method && method.name || "").trim(),
            },
          }
        );
      } else {
        dispatch();
      }
    });
  }

  function ensureComponentTimerStore(hostElement) {
    if (!hostElement || hostElement.nodeType !== 1) {
      return null;
    }
    let store = hostElement[Q_COMPONENT_TIMER_STORE_KEY];
    if (!store || typeof store !== "object") {
      store = Object.create(null);
      try {
        Object.defineProperty(hostElement, Q_COMPONENT_TIMER_STORE_KEY, {
          configurable: true,
          enumerable: false,
          writable: true,
          value: store,
        });
      } catch (error) {
        hostElement[Q_COMPONENT_TIMER_STORE_KEY] = store;
      }
    }
    return store;
  }

  function stopComponentTimers(hostElement) {
    const store = ensureComponentTimerStore(hostElement);
    if (!store) {
      return;
    }
    const names = Object.keys(store);
    for (let i = 0; i < names.length; i += 1) {
      const entry = store[names[i]];
      if (!entry || typeof entry !== "object") {
        continue;
      }
      if (typeof entry.stop === "function") {
        try {
          entry.stop();
        } catch (error) {
          // no-op
        }
      }
      if (entry.timeoutSignal && typeof entry.timeoutSignal.disconnect === "function") {
        try {
          entry.timeoutSignal.disconnect();
        } catch (error) {
          // no-op
        }
      }
    }
    for (let i = 0; i < names.length; i += 1) {
      delete store[names[i]];
    }
  }

  function normalizeComponentTimerDefinitions(componentNode) {
    const raw = Array.isArray(componentNode && componentNode.qTimerDefinitions)
      ? componentNode.qTimerDefinitions
      : [];
    const out = [];
    const seen = new Set();
    for (let i = 0; i < raw.length; i += 1) {
      const entry = raw[i] && typeof raw[i] === "object" ? raw[i] : {};
      const timerId = String(entry.timerId || "").trim();
      if (!timerId) {
        continue;
      }
      const key = timerId.toLowerCase();
      if (seen.has(key)) {
        throw new Error("Duplicate q-timer id in component scope: '" + timerId + "'.");
      }
      seen.add(key);
      const intervalValue = Number(entry.interval);
      out.push({
        timerId: timerId,
        interval: Number.isFinite(intervalValue) && intervalValue >= 0 ? Math.floor(intervalValue) : 0,
        repeat: entry.repeat !== false,
        running: entry.running !== false,
        onTimeout: String(entry.onTimeout || ""),
      });
    }
    return out;
  }

  function createComponentTimerTimeoutSignal(hostElement, runtimeApi, timerName) {
    const listeners = new Set();
    const signal = createQSignalInstance("timeout", hostElement, function emitComponentTimerTimeoutSignal() {
      const args = Array.prototype.slice.call(arguments);
      const emitNow = function emitConnectedTimerListeners() {
        const list = Array.from(listeners.values());
        for (let i = 0; i < list.length; i += 1) {
          const handler = list[i];
          if (typeof handler !== "function") {
            continue;
          }
          try {
            invokeWithRuntimeExecutionHost(hostElement, function invokeTimerSignalHandler() {
              return handler.apply(hostElement, args);
            });
          } catch (error) {
            if (global.console && typeof global.console.error === "function") {
              global.console.error("qhtml q-timer timeout signal handler failed:", timerName, error);
            }
          }
        }
      };
      if (runtimeApi && typeof runtimeApi.enqueueRuntimeEvent === "function") {
        runtimeApi.enqueueRuntimeEvent(
          "component-timer-timeout-signal",
          emitNow,
          {
            target: hostElement,
            payload: {
              timerId: timerName,
            },
          }
        );
        return undefined;
      }
      emitNow();
      return undefined;
    });
    const meta = signal && signal[Q_SIGNAL_META_KEY] && typeof signal[Q_SIGNAL_META_KEY] === "object"
      ? signal[Q_SIGNAL_META_KEY]
      : null;
    if (meta) {
      meta.connectImpl = function connectComponentTimerTimeout(handler) {
        if (typeof handler !== "function") {
          return null;
        }
        listeners.add(handler);
        return handler;
      };
      meta.disconnectImpl = function disconnectComponentTimerTimeout(handler) {
        if (!handler) {
          listeners.clear();
          return true;
        }
        if (typeof handler !== "function") {
          return false;
        }
        return listeners.delete(handler);
      };
    }
    return signal;
  }

  function createComponentTimerHandle(runtimeState) {
    const runtime = runtimeState && typeof runtimeState === "object" ? runtimeState : null;
    if (!runtime) {
      return null;
    }
    const handle = {
      start: function startComponentTimerHandle() {
        return typeof runtime.start === "function" ? runtime.start() : null;
      },
      stop: function stopComponentTimerHandle() {
        return typeof runtime.stop === "function" ? runtime.stop() : false;
      },
      restart: function restartComponentTimerHandle() {
        return typeof runtime.restart === "function" ? runtime.restart() : null;
      },
      valueOf: function valueOfComponentTimerHandle() {
        return runtime.timerId == null ? 0 : runtime.timerId;
      },
      toString: function toStringComponentTimerHandle() {
        return String(runtime.timerId == null ? "" : runtime.timerId);
      },
    };
    if (typeof Symbol !== "undefined" && Symbol && Symbol.toPrimitive) {
      handle[Symbol.toPrimitive] = function componentTimerToPrimitive(hint) {
        if (hint === "string") {
          return String(runtime.timerId == null ? "" : runtime.timerId);
        }
        return runtime.timerId == null ? 0 : runtime.timerId;
      };
    }
    Object.defineProperty(handle, "name", {
      configurable: true,
      enumerable: true,
      get: function getComponentTimerName() { return String(runtime.name || ""); },
    });
    Object.defineProperty(handle, "timerId", {
      configurable: true,
      enumerable: true,
      get: function getComponentTimerId() { return runtime.timerId; },
    });
    Object.defineProperty(handle, "running", {
      configurable: true,
      enumerable: true,
      get: function getComponentTimerRunning() { return runtime.running === true; },
    });
    Object.defineProperty(handle, "repeat", {
      configurable: true,
      enumerable: true,
      get: function getComponentTimerRepeat() { return runtime.repeat === true; },
      set: function setComponentTimerRepeat(next) {
        runtime.repeat = next !== false;
      },
    });
    Object.defineProperty(handle, "interval", {
      configurable: true,
      enumerable: true,
      get: function getComponentTimerInterval() { return Number(runtime.interval || 0); },
      set: function setComponentTimerInterval(next) {
        const numeric = Number(next);
        if (Number.isFinite(numeric) && numeric >= 0) {
          runtime.interval = Math.max(0, Math.floor(numeric));
        }
      },
    });
    Object.defineProperty(handle, "timeout", {
      configurable: true,
      enumerable: true,
      get: function getComponentTimerTimeoutSignal() { return runtime.timeoutSignal || null; },
    });
    return handle;
  }

  function createComponentTimerExecutor(timerDefinition, hostElement, targetDocument) {
    const scriptBody = transformScriptBody(String(timerDefinition && timerDefinition.onTimeout || ""));
    if (!scriptBody.trim()) {
      return function noopComponentTimerExecutor() {};
    }
    const hasInterpolatedBody = hasInlineReferenceExpressions(scriptBody);
    let compiled = null;
    if (!hasInterpolatedBody) {
      try {
        compiled = new Function("event", "document", withScopedSelectorPrelude(scriptBody));
      } catch (error) {
        if (global.console && typeof global.console.error === "function") {
          global.console.error("qhtml q-timer compile failed:", error);
        }
        return function noopComponentTimerExecutor() {};
      }
    }
    const doc = targetDocument || (hostElement && hostElement.ownerDocument) || global.document || null;
    return function runComponentTimerExecutor(runtimeState, eventPayload) {
      const runtime = runtimeState && typeof runtimeState === "object" ? runtimeState : null;
      const event = eventPayload && typeof eventPayload === "object"
        ? eventPayload
        : {
            type: "timeout",
            timerId: runtime && runtime.name ? runtime.name : "",
            timerHandle: runtime ? runtime.timerId : null,
          };
      const invocationHost = hostElement && hostElement.nodeType === 1 ? hostElement : null;
      if (!invocationHost) {
        return;
      }
      ensureScopedSelectorShortcut(invocationHost, null);
      if (hasInterpolatedBody) {
        const executableSource = interpolateInlineReferenceExpressions(
          scriptBody,
          invocationHost,
          {
            component: invocationHost,
            event: event,
            timer: runtime && runtime.handle ? runtime.handle : null,
            document: doc,
          },
          "qhtml q-timer interpolation failed:",
          { scriptLiteral: true }
        );
        try {
          const dynamic = new Function("event", "document", withScopedSelectorPrelude(executableSource));
          invokeWithRuntimeExecutionHost(invocationHost, function invokeDynamicComponentTimer() {
            dynamic.call(invocationHost, event, doc);
          });
        } catch (error) {
          if (global.console && typeof global.console.error === "function") {
            global.console.error("qhtml q-timer execution failed:", error);
          }
        }
        return;
      }
      try {
        invokeWithRuntimeExecutionHost(invocationHost, function invokeCompiledComponentTimer() {
          compiled.call(invocationHost, event, doc);
        });
      } catch (error) {
        if (global.console && typeof global.console.error === "function") {
          global.console.error("qhtml q-timer execution failed:", error);
        }
      }
    };
  }

  function bindSingleComponentTimer(timerDefinition, componentNode, hostElement, targetDocument, runtimeApi, scopeFrame, runtimeFrame) {
    if (!timerDefinition || !hostElement || hostElement.nodeType !== 1) {
      return null;
    }
    const timerStore = ensureComponentTimerStore(hostElement);
    const timerName = String(timerDefinition.timerId || "").trim();
    if (!timerName) {
      return null;
    }
    if (timerStore[timerName] && typeof timerStore[timerName].stop === "function") {
      timerStore[timerName].stop();
    } else if (Object.prototype.hasOwnProperty.call(hostElement, timerName)) {
      throw new Error("q-timer id conflicts with existing component member: '" + timerName + "'.");
    }
    const runtime = {
      name: timerName,
      interval: Number(timerDefinition.interval || 0),
      repeat: timerDefinition.repeat !== false,
      running: timerDefinition.running !== false,
      timerId: null,
      timeoutSignal: null,
      handle: null,
      executeTimeout: null,
      stop: null,
      start: null,
      restart: null,
    };
    runtime.timeoutSignal = createComponentTimerTimeoutSignal(hostElement, runtimeApi, timerName);
    runtime.executeTimeout = createComponentTimerExecutor(timerDefinition, hostElement, targetDocument);
    const scheduleTick = function scheduleComponentTimerTick() {
      if (runtime.running !== true) {
        return;
      }
      const delay = Math.max(0, Math.floor(Number(runtime.interval || 0)));
      if (typeof global.setTimeout === "function") {
        runtime.timerId = global.setTimeout(onTick, delay);
      } else {
        runtime.timerId = null;
      }
    };
    const onTick = function onComponentTimerTick() {
      if (runtime.running !== true) {
        return;
      }
      if (hostElement.isConnected === false) {
        runtime.stop();
        return;
      }
      const eventPayload = {
        type: "timeout",
        timerId: runtime.name,
        timerHandle: runtime.timerId,
        component: String(componentNode && componentNode.componentId || hostElement.tagName || "").trim().toLowerCase(),
        componentUuid: String(readHostQDomUuid(hostElement) || "").trim(),
      };
      const invokeTimeout = function invokeComponentTimerTimeout() {
        runtime.executeTimeout(runtime, eventPayload);
        if (runtime.timeoutSignal && typeof runtime.timeoutSignal.emit === "function") {
          runtime.timeoutSignal.emit(eventPayload);
        }
        if (runtime.repeat === true && runtime.running === true) {
          scheduleTick();
        } else {
          runtime.stop();
        }
      };
      if (runtimeApi && typeof runtimeApi.enqueueRuntimeEvent === "function") {
        runtimeApi.enqueueRuntimeEvent(
          "component-timer-timeout",
          invokeTimeout,
          {
            target: hostElement,
            payload: {
              timerId: runtime.name,
            },
          }
        );
        return;
      }
      invokeTimeout();
    };
    runtime.stop = function stopComponentTimer() {
      if (runtime.timerId != null && typeof global.clearTimeout === "function") {
        try {
          global.clearTimeout(runtime.timerId);
        } catch (error) {
          // no-op
        }
      }
      runtime.timerId = null;
      runtime.running = false;
      return true;
    };
    runtime.start = function startComponentTimer() {
      runtime.stop();
      runtime.running = true;
      scheduleTick();
      return runtime.timerId;
    };
    runtime.restart = function restartComponentTimer() {
      return runtime.start();
    };
    runtime.handle = createComponentTimerHandle(runtime);
    timerStore[timerName] = runtime;
    if (scopeFrame && typeof scopeFrame.set === "function") {
      scopeFrame.set(timerName, runtime.handle);
    }
    if (runtimeFrame && typeof runtimeFrame.set === "function") {
      runtimeFrame.set(timerName, runtime.handle);
    }
    exportNamedAliasToHost(hostElement, timerName, runtime.handle);
    if (runtime.running === true) {
      runtime.start();
    } else {
      runtime.stop();
    }
    return runtime.handle;
  }

  function bindComponentTimers(componentNode, hostElement, targetDocument, runtimeApi, scopeFrame, runtimeFrame) {
    if (!componentNode || !hostElement || hostElement.nodeType !== 1) {
      return;
    }
    const definitions = normalizeComponentTimerDefinitions(componentNode);
    stopComponentTimers(hostElement);
    if (definitions.length === 0) {
      return;
    }
    for (let i = 0; i < definitions.length; i += 1) {
      bindSingleComponentTimer(definitions[i], componentNode, hostElement, targetDocument, runtimeApi, scopeFrame, runtimeFrame);
    }
  }

  function normalizeQBindCssExpression(expression) {
    const source = String(expression || "").trim();
    if (!source) {
      return "";
    }
    if (source === "this.component") {
      return "component";
    }
    if (source.indexOf("this.component.") === 0) {
      return "component." + source.slice("this.component.".length);
    }
    return source;
  }

  function warnQBindCss(message, details) {
    if (!global.console || typeof global.console.warn !== "function") {
      return;
    }
    if (typeof details === "undefined") {
      global.console.warn("qhtml q-bind-css warning: " + message);
    } else {
      global.console.warn("qhtml q-bind-css warning: " + message, details);
    }
  }

  function parseQBindCssTargetReference(expression) {
    const normalized = normalizeQBindCssExpression(expression);
    const match = normalized.match(/^([\s\S]+)\.([A-Za-z_$][A-Za-z0-9_$-]*)$/);
    if (!match) {
      return null;
    }
    return {
      objectExpression: String(match[1] || "").trim(),
      propertyName: String(match[2] || "").trim(),
    };
  }

  function evaluateQBindCssObjectReference(expression, hostElement) {
    const objectExpression = String(expression || "").trim();
    if (!objectExpression || !hostElement) {
      return undefined;
    }
    try {
      ensureScopedSelectorShortcut(hostElement, null);
      const doc = hostElement.ownerDocument || global.document || null;
      const evaluator = new Function(
        "component",
        "document",
        "window",
        "globalThis",
        "return (" + objectExpression + ");"
      );
      return evaluator.call(hostElement, hostElement, doc, global, global);
    } catch (error) {
      warnQBindCss("target reference evaluation failed", {
        target: objectExpression,
        error: error && error.message ? error.message : String(error || ""),
      });
      return undefined;
    }
  }

  function assignQBindCssTarget(hostElement, binding, value) {
    const targetExpression = String(binding && binding.targetExpression || "").trim();
    const target = parseQBindCssTargetReference(targetExpression);
    if (!target || !target.objectExpression || !target.propertyName) {
      warnQBindCss("target must be a writable property reference", {
        target: targetExpression,
      });
      return false;
    }
    const owner = evaluateQBindCssObjectReference(target.objectExpression, hostElement);
    if (owner === null || typeof owner === "undefined") {
      warnQBindCss("target owner is undefined", {
        target: targetExpression,
      });
      return false;
    }
    try {
      const styleCtor = global.CSSStyleDeclaration;
      const isCssStyleDeclaration =
        !!(
          owner &&
          (
            (typeof styleCtor === "function" && owner instanceof styleCtor) ||
            (typeof owner.setProperty === "function" && typeof owner.cssText === "string")
          )
        );
      if (isCssStyleDeclaration && isDimensionalStyleProperty(target.propertyName)) {
        const styleName = cssStylePropertyName(target.propertyName);
        const animatedValue = readAnimatedStyleCommitValue(value);
        const normalized = animatedValue || parseNumericStyleValue(value, "px");
        owner[styleName] = normalized && normalized.valid === false
          ? String(value == null ? "" : value)
          : normalized.serialized;
      } else {
        owner[target.propertyName] = value;
      }
      return true;
    } catch (error) {
      warnQBindCss("target assignment failed", {
        target: targetExpression,
        error: error && error.message ? error.message : String(error || ""),
      });
      return false;
    }
  }

  function bindComponentCssBindings(componentNode, hostElement, declaredPropertiesSeen) {
    if (!componentNode || !hostElement) {
      return;
    }
    const bindings =
      componentNode && componentNode.meta && Array.isArray(componentNode.meta.__qhtmlCssBindings)
        ? componentNode.meta.__qhtmlCssBindings
        : [];
    if (bindings.length === 0) {
      return;
    }
    const declared = declaredPropertiesSeen instanceof Set ? declaredPropertiesSeen : new Set();
    for (let i = 0; i < bindings.length; i += 1) {
      const binding = bindings[i] || {};
      const propertyName = String(binding.propertyName || "").trim();
      const propertyKey = normalizeComponentKey(propertyName);
      if (!propertyName || !propertyKey || !declared.has(propertyKey)) {
        warnQBindCss("source property is not declared on this component", {
          property: propertyName,
          source: String(binding.propertyExpression || "").trim(),
        });
        continue;
      }
      const changedSignalName = propertyName + "Changed";
      const signal = hostElement[changedSignalName];
      if (signal && typeof signal.connect === "function") {
        signal.connect(function qBindCssPropertyChanged(nextValue) {
          assignQBindCssTarget(hostElement, binding, nextValue);
        });
      } else {
        warnQBindCss("property changed signal is not available", {
          property: propertyName,
          signal: changedSignalName,
        });
      }
      try {
        assignQBindCssTarget(hostElement, binding, hostElement[propertyName]);
      } catch (error) {
        warnQBindCss("initial assignment failed", {
          property: propertyName,
          target: String(binding.targetExpression || "").trim(),
          error: error && error.message ? error.message : String(error || ""),
        });
      }
    }
  }

  function bindComponentMethods(componentNode, hostElement, instanceNode) {
    if (!componentNode || !hostElement) {
      return;
    }
    try {
      hostElement.component = hostElement;
    } catch (ignoredSetSelfComponentContext) {
      // best effort
    }
    ensureComponentSelfReference(hostElement);
    registerQComponentInstanceType(hostElement, componentNode);
    ensureScopedSelectorShortcut(hostElement, null);
    const componentDefinitionType = inferDefinitionType(componentNode);
    const isWorkerDefinition = componentDefinitionType === "worker";
    const componentId = String(componentNode.componentId || hostElement.tagName || "").trim().toLowerCase();
    const runtimeApi = global.QHtml && typeof global.QHtml === "object" ? global.QHtml : null;
    const runtimeQueuedSignalRoutingEnabled = !!(
      runtimeApi &&
      typeof runtimeApi.getEventLoopMode === "function" &&
      runtimeApi.getEventLoopMode() === "queued" &&
      typeof runtimeApi.registerSignalSubscriber === "function" &&
      typeof runtimeApi.unregisterSignalSubscriber === "function"
    );
    function readSignalEmitterUuid() {
      const fromHost = readHostQDomUuid(hostElement);
      if (fromHost) {
        return fromHost;
      }
      if (!instanceNode || typeof instanceNode !== "object" || !instanceNode.meta || typeof instanceNode.meta !== "object") {
        return "";
      }
      const preferred = typeof instanceNode.meta[QDOM_UUID_META_KEY] === "string"
        ? String(instanceNode.meta[QDOM_UUID_META_KEY] || "").trim()
        : "";
      if (preferred) {
        return preferred;
      }
      const legacy = typeof instanceNode.meta.uuid === "string" ? String(instanceNode.meta.uuid || "").trim() : "";
      return legacy;
    }
    const componentAttributes = componentNode.attributes && typeof componentNode.attributes === "object"
      ? componentNode.attributes
      : {};
    const componentEventAttributeParameters = normalizeEventAttributeParameterMap(
      componentNode && componentNode.meta && componentNode.meta.__qhtmlEventAttributeParams
        ? componentNode.meta.__qhtmlEventAttributeParams
        : null
    );
    const componentEventAttributeThen = normalizeEventAttributeThenMap(
      componentNode && componentNode.meta && componentNode.meta.__qhtmlEventAttributeThen
        ? componentNode.meta.__qhtmlEventAttributeThen
        : null
    );
    const hasCanvasSemantics = componentNodeHasCanvasSemantics(componentNode);
    const instanceAttributes =
      instanceNode && instanceNode.attributes && typeof instanceNode.attributes === "object"
        ? instanceNode.attributes
        : {};
    const instanceProperties =
      instanceNode && instanceNode.props && typeof instanceNode.props === "object"
        ? instanceNode.props
        : {};
    const instanceEventAttributeParameters = normalizeEventAttributeParameterMap(
      instanceNode && instanceNode.meta && instanceNode.meta.__qhtmlEventAttributeParams
        ? instanceNode.meta.__qhtmlEventAttributeParams
        : null
    );
    const instanceEventAttributeThen = normalizeEventAttributeThenMap(
      instanceNode && instanceNode.meta && instanceNode.meta.__qhtmlEventAttributeThen
        ? instanceNode.meta.__qhtmlEventAttributeThen
        : null
    );
    const instanceAttributeKeySet = new Set();
    const instanceAttributeKeys = Object.keys(instanceAttributes);
    for (let i = 0; i < instanceAttributeKeys.length; i += 1) {
      const instanceKey = String(instanceAttributeKeys[i] || "").trim().toLowerCase();
      if (!instanceKey) {
        continue;
      }
      instanceAttributeKeySet.add(instanceKey);
    }
    const declaredProperties = [];
    const declaredPropertiesSeen = new Set();
    function appendDeclaredProperties(entries) {
      const list = Array.isArray(entries) ? entries : [];
      for (let i = 0; i < list.length; i += 1) {
        const propertyName = String(list[i] || "").trim();
        const normalized = propertyName.toLowerCase();
        if (!propertyName || declaredPropertiesSeen.has(normalized)) {
          continue;
        }
        declaredPropertiesSeen.add(normalized);
        declaredProperties.push(propertyName);
      }
    }
    appendDeclaredProperties(componentNode.properties);
    appendDeclaredProperties(
      instanceNode && instanceNode.meta && Array.isArray(instanceNode.meta.__qhtmlDeclaredProperties)
        ? instanceNode.meta.__qhtmlDeclaredProperties
        : []
    );
    const hostScopeFrame = resolveRuntimeFrameForTarget(hostElement, QCONTEXT_SCOPE_FRAME_KEY);
    const hostRuntimeFrame = resolveRuntimeFrameForTarget(hostElement, QCONTEXT_RUNTIME_FRAME_KEY);
    for (let i = 0; i < declaredProperties.length; i += 1) {
      const propertyName = declaredProperties[i];
      if (!propertyName || INVALID_METHOD_NAMES.has(propertyName)) {
        continue;
      }
      const normalizedPropertyName = String(propertyName || "").trim().toLowerCase();
      if (componentId && normalizedPropertyName === componentId) {
        warnScopedAliasConflict(
          propertyName,
          "declared property name conflicts with component type alias inside its own definition; binding is blanked"
        );
        if (hostScopeFrame && typeof hostScopeFrame.set === "function") {
          hostScopeFrame.set(componentId, "");
        }
        if (hostRuntimeFrame && typeof hostRuntimeFrame.set === "function") {
          hostRuntimeFrame.set(componentId, "");
        }
        exportNamedAliasToHost(hostElement, componentId, "");
        continue;
      }
      const existingDescriptor = Object.getOwnPropertyDescriptor(hostElement, propertyName);
      if (existingDescriptor && existingDescriptor.configurable === false) {
        continue;
      }
      const storageKey = "__qhtmlDeclaredPropValue__" + propertyName;
      const rawStorageKey = "__qhtmlDeclaredPropRawValue__" + propertyName;
      const bindingKey = "__qhtmlDeclaredPropBinding__" + propertyName;
      const hasInitialValue = Object.prototype.hasOwnProperty.call(hostElement, propertyName);
      let initialValue = hasInitialValue ? hostElement[propertyName] : undefined;
      const rawDefault = Object.prototype.hasOwnProperty.call(instanceProperties, propertyName)
        ? instanceProperties[propertyName]
        : Object.prototype.hasOwnProperty.call(componentAttributes, propertyName)
          ? componentAttributes[propertyName]
          : undefined;
      let literalDefault = rawDefault;
      let compiledBinding = null;
      let declaredReferenceExpression = "";
      const bindingMatch = typeof rawDefault === "string" ? rawDefault.match(/^\s*q-(bind|script)\s*\{([\s\S]*)\}\s*$/i) : null;
      if (bindingMatch) {
        const bindingBody = String(bindingMatch[2] || "");
        compiledBinding = function declaredPropertyBindingProxy() {
          const interpolatedBody = interpolateInlineReferenceExpressions(
            bindingBody,
            this,
            { component: this },
            "qhtml declared property binding interpolation failed:",
            { scriptLiteral: true }
          );
          try {
            ensureScopedSelectorShortcut(this, null);
            const runtimeBinding = new Function(withScopedSelectorPrelude(interpolatedBody));
            return runtimeBinding.call(this);
          } catch (error) {
            if (global.console && typeof global.console.error === "function") {
              global.console.error("qhtml declared property binding compile failed:", propertyName, error);
            }
            return null;
          }
        };
        literalDefault = undefined;
      } else if (typeof literalDefault === "string" && !hasInlineReferenceExpressions(literalDefault)) {
        const literalReference = String(literalDefault || "").trim();
        const isPotentialReferenceExpression =
          /^this\.[A-Za-z_$][A-Za-z0-9_$]*(\.[A-Za-z_$][A-Za-z0-9_$]*)*$/.test(literalReference) ||
          /^component\.[A-Za-z_$][A-Za-z0-9_$]*(\.[A-Za-z_$][A-Za-z0-9_$]*)*$/.test(literalReference) ||
          /^[A-Za-z_$][A-Za-z0-9_$]*\.[A-Za-z_$][A-Za-z0-9_$]*(\.[A-Za-z_$][A-Za-z0-9_$]*)*$/.test(literalReference);
        const hostReference =
          literalReference &&
          Object.prototype.hasOwnProperty.call(hostElement, literalReference)
            ? hostElement[literalReference]
            : undefined;
        const resolvedReference =
          typeof hostReference === "function"
            ? hostReference
            : resolveNamedCallbackRuntime(literalReference);
        if (typeof resolvedReference === "function") {
          literalDefault = resolvedReference;
          if (hasInitialValue && typeof initialValue === "string" && String(initialValue || "").trim() === literalReference) {
            initialValue = resolvedReference;
          }
        } else if (isPotentialReferenceExpression && literalReference) {
          declaredReferenceExpression = literalReference;
        }
      }
      try {
        Object.defineProperty(hostElement, propertyName, {
          configurable: true,
          enumerable: true,
          get: function getDeclaredComponentProperty() {
            if (Object.prototype.hasOwnProperty.call(this, rawStorageKey)) {
              return resolveCallbackReferenceValue(this[rawStorageKey]);
            }
            let qdomNode = null;
            try {
              qdomNode = typeof this.qdom === "function" ? this.qdom() : null;
            } catch (readQdomError) {
              qdomNode = null;
            }
            if (qdomNode && typeof qdomNode === "object") {
              if (qdomNode.props && typeof qdomNode.props === "object" && !Array.isArray(qdomNode.props)) {
                if (Object.prototype.hasOwnProperty.call(qdomNode.props, propertyName)) {
                  return resolveCallbackReferenceValue(qdomNode.props[propertyName]);
                }
              }
              if (typeof qdomNode.property === "function") {
                const resolvedQDomProperty = qdomNode.property(propertyName);
                if (typeof resolvedQDomProperty !== "undefined") {
                  return resolveCallbackReferenceValue(resolvedQDomProperty);
                }
              }
            }
            if (Object.prototype.hasOwnProperty.call(this, storageKey)) {
              return resolveCallbackReferenceValue(this[storageKey]);
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
            if (declaredReferenceExpression) {
              const scope = resolveInlineExpressionScope(this, { component: this });
              const resolvedReference = evaluateInlineReferenceExpression(
                declaredReferenceExpression,
                this,
                scope,
                "qhtml declared property reference evaluation failed:",
                { pathFallbackLiteral: true, scriptLiteral: false }
              );
              return resolveCallbackReferenceValue(resolvedReference);
            }
            return resolveCallbackReferenceValue(literalDefault);
          },
          set: function setDeclaredComponentProperty(value) {
            if (!isBehaviorCommitBypassed(this, propertyName)) {
              const behavior = getBehavior(this, propertyName);
              if (behavior && behavior.enabled) {
                behavior.write(value, { source: "user" });
                return;
              }
            }
            const normalizedValue = resolveCallbackReferenceValue(value);
            if (normalizedValue && typeof normalizedValue.then === "function") {
              const self = this;
              Promise.resolve(normalizedValue)
                .then(function onResolvedPromiseValue(resolvedValue) {
                  try {
                    self[propertyName] = resolvedValue;
                  } catch (error) {
                    // no-op
                  }
                })
                .catch(function onRejectedPromiseValue(error) {
                  try {
                    self[propertyName] = qWorkerSerializeError(error);
                  } catch (assignErrorObjectFailure) {
                    // no-op
                  }
                });
              return;
            }
            let hadValue = false;
            let previousValue = undefined;
            const trackedState = readTrackedDeclaredProperty(this, propertyName);
            if (trackedState.exists) {
              hadValue = true;
              previousValue = trackedState.value;
            }
            try {
              const qdomNode = readHostQDomNode(this);
              if (qdomNode && typeof qdomNode === "object" && qdomNode.props && typeof qdomNode.props === "object") {
                if (Object.prototype.hasOwnProperty.call(qdomNode.props, propertyName)) {
                  hadValue = true;
                  previousValue = resolveCallbackReferenceValue(qdomNode.props[propertyName]);
                }
              }
            } catch (readQdomError) {
              // fallback to local storage
            }
            if (!hadValue && Object.prototype.hasOwnProperty.call(this, storageKey)) {
              hadValue = true;
              previousValue = this[storageKey];
            }
            if (!hadValue) {
              try {
                previousValue = resolveCallbackReferenceValue(this[propertyName]);
                hadValue = true;
              } catch (readPreviousValueError) {
                // ignore getter failures and continue with write path
              }
            }
            detachDeclaredPropertyModelListener(this, propertyName);
            this[rawStorageKey] = normalizedValue;
            this[storageKey] = normalizedValue;
            try {
              const qdomNode = typeof this.qdom === "function" ? this.qdom() : null;
              const qdomSourceNode =
                qdomNode &&
                qdomNode.__qhtmlSourceNode &&
                typeof qdomNode.__qhtmlSourceNode === "object"
                  ? qdomNode.__qhtmlSourceNode
                  : null;
              const writeTarget = qdomSourceNode || qdomNode;
              if (writeTarget && typeof writeTarget === "object") {
                if (!writeTarget.props || typeof writeTarget.props !== "object" || Array.isArray(writeTarget.props)) {
                  writeTarget.props = {};
                }
                writeTarget.props[propertyName] = normalizedValue;
              }
            } catch (syncError) {
              // best-effort qdom sync for declared property writes
            }
            if (hadValue && Object.is(previousValue, normalizedValue)) {
              writeTrackedDeclaredProperty(this, propertyName, normalizedValue);
              attachDeclaredPropertyModelListener(this, componentId, propertyName, normalizedValue);
              return;
            }
            writeTrackedDeclaredProperty(this, propertyName, normalizedValue);
            attachDeclaredPropertyModelListener(this, componentId, propertyName, normalizedValue);
            if (hadValue) {
              if (
                shouldLogQLoggerCategory(this, componentNode, instanceNode, "q-property") &&
                global.console &&
                typeof global.console.log === "function"
              ) {
                global.console.log("[QHTML][property][changed]", {
                  component: componentId,
                  componentUuid: readHostQDomUuid(this),
                  property: propertyName,
                  previousValue: previousValue,
                  value: normalizedValue,
                });
              }
              emitDeclaredPropertyChangedEvent(this, componentId, propertyName, normalizedValue, previousValue);
            }
          },
        });
        registerQPropertyInstance(hostElement, propertyName);
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
            "qhtml q-alias interpolation failed:",
            { scriptLiteral: true }
          );
          try {
            ensureScopedSelectorShortcut(this, null);
            const runtimeAlias = new Function(withScopedSelectorPrelude(interpolatedBody));
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
          compiledAlias = new Function(withScopedSelectorPrelude(aliasBody));
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
    const workerSignalNames = Array.isArray(componentNode.signalDeclarations)
      ? componentNode.signalDeclarations.map(function mapSignalName(entry) {
          return String(entry && entry.name ? entry.name : "").trim();
        }).filter(Boolean)
      : [];

    function escapeIdForQuery(rawId) {
      const value = String(rawId || "").trim();
      if (!value) {
        return "";
      }
      if (typeof CSS !== "undefined" && CSS && typeof CSS.escape === "function") {
        return CSS.escape(value);
      }
      return value.replace(/([ #;?%&,.+*~':"!^$[\]()=>|/\\])/g, "\\$1");
    }

    function resolveLiveComponentHost(hostCandidate) {
      const currentHost = hostCandidate && hostCandidate.nodeType === 1 ? hostCandidate : null;
      if (!currentHost) {
        return hostCandidate;
      }
      if (currentHost.isConnected !== false) {
        return currentHost;
      }
      let rootHost = null;
      try {
        rootHost =
          typeof currentHost.qhtmlRoot === "function"
            ? currentHost.qhtmlRoot()
            : typeof currentHost.root === "function"
              ? currentHost.root()
              : null;
      } catch (readRootError) {
        rootHost = null;
      }
      let qdomUuid = "";
      try {
        const qdomNode = typeof currentHost.qdom === "function" ? currentHost.qdom() : null;
        qdomUuid =
          qdomNode &&
          qdomNode.meta &&
          typeof qdomNode.meta === "object" &&
          typeof qdomNode.meta.uuid === "string"
            ? String(qdomNode.meta.uuid).trim()
            : "";
      } catch (readUuidError) {
        qdomUuid = "";
      }
      if (rootHost && typeof rootHost.elementForUuid === "function" && qdomUuid) {
        try {
          const mappedByUuid = rootHost.elementForUuid(qdomUuid);
          if (mappedByUuid && mappedByUuid.nodeType === 1) {
            return mappedByUuid;
          }
        } catch (resolveByUuidError) {
          // fallback to id selector below
        }
      }
      if (rootHost && typeof rootHost.querySelector === "function") {
        const hostId = String(currentHost.id || "").trim();
        if (hostId) {
          try {
            const mappedById = rootHost.querySelector("#" + escapeIdForQuery(hostId));
            if (mappedById && mappedById.nodeType === 1) {
              return mappedById;
            }
          } catch (resolveByIdError) {
            // no-op
          }
        }
      }
      return currentHost;
    }

    const callbackDeclarations = Array.isArray(componentNode.callbackDeclarations) ? componentNode.callbackDeclarations : [];
    for (let i = 0; i < callbackDeclarations.length; i += 1) {
      const callbackDecl = callbackDeclarations[i] || {};
      const callbackName = String(callbackDecl.name || "").trim();
      if (!callbackName || INVALID_METHOD_NAMES.has(callbackName)) {
        continue;
      }
      const existingDescriptor = Object.getOwnPropertyDescriptor(hostElement, callbackName);
      if (existingDescriptor && existingDescriptor.configurable === false) {
        continue;
      }
      const parameterNames = Array.isArray(callbackDecl.parameters)
        ? callbackDecl.parameters.map(function mapName(entry) { return String(entry || "").trim(); }).filter(Boolean)
        : [];
      const paramsSource = parameterNames.join(", ");
      const callbackBody = String(callbackDecl.body || "").trim();
      const hasInterpolatedBody = hasInlineReferenceExpressions(callbackBody);
      let compiledCallback = null;
      if (!hasInterpolatedBody) {
        try {
          compiledCallback = new Function(paramsSource, withScopedSelectorPrelude(callbackBody));
        } catch (error) {
          if (global.console && typeof global.console.error === "function") {
            global.console.error("qhtml callback compile failed:", callbackName, error);
          }
          continue;
        }
      }
      const callbackExecutor = function callbackExecutorProxy() {
        const invocationHost = resolveLiveComponentHost(hostElement);
        const invocationArgs = arguments;
        if (hasInterpolatedBody) {
          const interpolatedBody = interpolateInlineReferenceExpressions(
            callbackBody,
            invocationHost,
            { component: invocationHost },
            "qhtml callback interpolation failed:",
            { scriptLiteral: true }
          );
          try {
            ensureScopedSelectorShortcut(invocationHost, null);
            const runtimeCallback = new Function(paramsSource, withScopedSelectorPrelude(interpolatedBody));
            return invokeWithRuntimeExecutionHost(invocationHost, function invokeRuntimeCallback() {
              return runtimeCallback.apply(invocationHost, invocationArgs);
            });
          } catch (error) {
            if (global.console && typeof global.console.error === "function") {
              global.console.error("qhtml callback compile failed:", callbackName, error);
            }
            return undefined;
          }
        }
        ensureScopedSelectorShortcut(invocationHost, null);
        return invokeWithRuntimeExecutionHost(invocationHost, function invokeCompiledCallback() {
          return compiledCallback.apply(invocationHost, invocationArgs);
        });
      };
      const wrappedCallback = createQCallbackWrapper(callbackExecutor, {
        name: callbackName,
        creatorHost: hostElement,
      });
      if (wrappedCallback && typeof wrappedCallback === "function") {
        hostElement[callbackName] = wrappedCallback;
      } else {
        hostElement[callbackName] = callbackExecutor;
      }
    }

    for (let i = 0; i < methods.length; i += 1) {
      const method = methods[i];
      const name = method && typeof method.name === "string" ? method.name.trim() : "";
      if (!name || INVALID_METHOD_NAMES.has(name)) {
        continue;
      }
      if (isWorkerDefinition) {
        hostElement[name] = function qWorkerMethodProxy() {
          return invokeQWorkerMethod(
            componentNode,
            hostElement,
            declaredProperties,
            workerSignalNames,
            method,
            arguments
          );
        };
        continue;
      }
      const params = method && typeof method.parameters === "string" ? method.parameters : "";
      const body = method && typeof method.body === "string" ? method.body : "";
      const hasInterpolatedBody = hasInlineReferenceExpressions(body);

      let compiled;
      if (!hasInterpolatedBody) {
        try {
          compiled = new Function(params, withScopedSelectorPrelude(body));
        } catch (error) {
          if (global.console && typeof global.console.error === "function") {
            global.console.error("qhtml component method compile failed:", name, error);
          }
          continue;
        }
      }

      hostElement[name] = function componentMethodProxy() {
        const invocationHost = resolveLiveComponentHost(hostElement);
        const invocationArgs = arguments;
        if (hasInterpolatedBody) {
          const interpolatedBody = interpolateInlineReferenceExpressions(
            body,
            invocationHost,
            { component: invocationHost },
            "qhtml component method interpolation failed:",
            { scriptLiteral: true }
          );
          try {
            ensureScopedSelectorShortcut(invocationHost, null);
            const runtimeMethod = new Function(params, withScopedSelectorPrelude(interpolatedBody));
            return invokeWithRuntimeExecutionHost(invocationHost, function invokeRuntimeMethod() {
              return runtimeMethod.apply(invocationHost, invocationArgs);
            });
          } catch (error) {
            if (global.console && typeof global.console.error === "function") {
              global.console.error("qhtml component method compile failed:", name, error);
            }
            return undefined;
          }
        }
        ensureScopedSelectorShortcut(invocationHost, null);
        return invokeWithRuntimeExecutionHost(invocationHost, function invokeCompiledMethod() {
          return compiled.apply(invocationHost, invocationArgs);
        });
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
      let connectionRouteCounter = 1;
      const resolveConnectedSubscriberUuid = function resolveConnectedSubscriberUuid() {
        let currentHost = null;
        if (runtimeApi && typeof runtimeApi.getCurrentExecutionHost === "function") {
          try {
            currentHost = runtimeApi.getCurrentExecutionHost();
          } catch (ignoredReadCurrentHostError) {
            currentHost = null;
          }
        }
        const fromCurrent = currentHost && currentHost.nodeType === 1 ? String(readHostQDomUuid(currentHost) || "").trim() : "";
        if (fromCurrent) {
          return fromCurrent;
        }
        return String(readHostQDomUuid(hostElement) || "").trim();
      };
      const resolveConnectedSubscriberHost = function resolveConnectedSubscriberHost(subscriberUuid, fallbackHost) {
        const normalizedSubscriberUuid = String(subscriberUuid || "").trim();
        if (normalizedSubscriberUuid && global.QHTML_UUID_LOOKUP_MAP instanceof Map) {
          const lookup = global.QHTML_UUID_LOOKUP_MAP.get(normalizedSubscriberUuid);
          if (lookup && typeof lookup === "object") {
            if (lookup.dom && lookup.dom.nodeType === 1) {
              const liveFromDom = resolveLiveComponentHost(lookup.dom);
              if (liveFromDom && liveFromDom.nodeType === 1) {
                return liveFromDom;
              }
              return lookup.dom;
            }
            if (lookup.host && lookup.host.nodeType === 1) {
              const liveFromHost = resolveLiveComponentHost(lookup.host);
              if (liveFromHost && liveFromHost.nodeType === 1) {
                return liveFromHost;
              }
              return lookup.host;
            }
          }
        }
        const fallback = fallbackHost && fallbackHost.nodeType === 1 ? resolveLiveComponentHost(fallbackHost) || fallbackHost : null;
        return fallback && fallback.nodeType === 1 ? fallback : null;
      };
      const signalFn = function componentSignalProxy() {
        const args = Array.prototype.slice.call(arguments);
        const payloadSlots = {};
        const payloadSlotQDom = {};
        const payloadParams = {};
        const signalParameters = [];
        for (let j = 0; j < parameterNames.length; j += 1) {
          const paramName = parameterNames[j];
          const value = j < args.length ? args[j] : null;
          const serializedValue = serializeSignalSlotValue(value);
          payloadParams[paramName] = serializedValue;
          payloadSlots[paramName] = [serializedValue];
          payloadSlotQDom[paramName] = [cloneNodeDeep(value)];
          signalParameters.push({
            name: paramName,
            value: serializedValue,
          });
        }
        const emitterUuid = String(readSignalEmitterUuid() || "").trim();
        const payload = {
          type: "signal",
          signal: signalName,
          component: componentId,
          signalId: signalName,
          componentUuid: emitterUuid,
          emitterUuid: emitterUuid,
          source: null,
          args: args.map(serializeSignalSlotValue),
          parameters: args.map(serializeSignalSlotValue),
          signalParameters: signalParameters,
          params: payloadParams,
          slots: payloadSlots,
          slotQDom: payloadSlotQDom,
          timestamp: Date.now(),
        };
        dispatchSignalPayload(hostElement, signalName, payload);
        return payload;
      };
      Object.setPrototypeOf(signalFn, QSignal.prototype);
      const signalMeta = {
        name: signalName,
        owner: hostElement,
        emitImpl: function emitComponentSignal() {
          return Function.prototype.apply.call(signalFn, hostElement, arguments);
        },
        connectImpl: null,
        disconnectImpl: null,
      };
      try {
        Object.defineProperty(signalFn, Q_SIGNAL_META_KEY, {
          configurable: true,
          enumerable: false,
          writable: true,
          value: signalMeta,
        });
      } catch (error) {
        signalFn[Q_SIGNAL_META_KEY] = signalMeta;
      }

      signalFn.connect = function connectSignalHandler(handler) {
        if (typeof handler !== "function") {
          return null;
        }
        if (connectionMap.has(handler)) {
          return handler;
        }
        let currentExecutionHost = null;
        if (runtimeApi && typeof runtimeApi.getCurrentExecutionHost === "function") {
          try {
            currentExecutionHost = runtimeApi.getCurrentExecutionHost();
          } catch (ignoredReadCurrentExecutionHostError) {
            currentExecutionHost = null;
          }
        }
        const connectedSubscriberHost = currentExecutionHost && currentExecutionHost.nodeType === 1
          ? resolveLiveComponentHost(currentExecutionHost) || currentExecutionHost
          : null;
        const connectedSubscriberUuid = resolveConnectedSubscriberUuid();
        const emitterUuid = String(readSignalEmitterUuid() || "").trim();
        const normalizedSignalName = String(signalName || "").trim().toLowerCase();
        const isPropertyChangedSignal = normalizedSignalName.endsWith("changed");
        const referenceRouteKey = "conn:" + String(signalName || "").trim().toLowerCase() + ":" + String(connectionRouteCounter);
        connectionRouteCounter += 1;
        let runtimeSignalReference = null;
        if (
          runtimeApi &&
          typeof runtimeApi.registerSignalReference === "function" &&
          emitterUuid &&
          connectedSubscriberUuid
        ) {
          runtimeSignalReference = runtimeApi.registerSignalReference({
            emitterUuid: emitterUuid,
            signalName: signalName,
            subscriberUuid: connectedSubscriberUuid,
            routeKey: referenceRouteKey,
          });
        }
        const invokeConnectedHandlerWithDetail = function invokeConnectedHandlerWithDetail(sourceDetail, eventCandidate) {
          const detail = sourceDetail && typeof sourceDetail === "object" ? Object.assign({}, sourceDetail) : {};
          if (!Number.isFinite(Number(detail.timestamp))) {
            detail.timestamp = Date.now();
          }
          const resolvedEmitterUuid = String(detail.emitterUuid || detail.componentUuid || emitterUuid || "").trim();
          if (resolvedEmitterUuid) {
            detail.emitterUuid = resolvedEmitterUuid;
            detail.componentUuid = resolvedEmitterUuid;
          }
          const invocationHost =
            resolveConnectedSubscriberHost(connectedSubscriberUuid, connectedSubscriberHost) ||
            resolveLiveComponentHost(hostElement);
          const invocationUuid = String(
            connectedSubscriberUuid || readHostQDomUuid(invocationHost) || ""
          ).trim();
          detail.receiverUuid = invocationUuid;
          const signalParameters = Array.isArray(detail.signalParameters)
            ? detail.signalParameters.slice()
            : [];
          signalParameters.push({
            name: "receiverUuid",
            value: invocationUuid,
          });
          detail.signalParameters = signalParameters;
          const eventForHandler = Object.assign({}, eventCandidate || {}, {
            detail: detail,
            target: invocationHost || (eventCandidate && eventCandidate.target) || null,
            currentTarget: invocationHost || (eventCandidate && eventCandidate.currentTarget) || null,
          });
          return handler.apply(invocationHost || null, buildConnectedSignalArgs(detail, parameterNames, eventForHandler));
        };
        let runtimeRegistrationToken = null;
        if (
          runtimeApi &&
          typeof runtimeApi.registerSignalSubscriber === "function" &&
          emitterUuid &&
          connectedSubscriberUuid &&
          !isPropertyChangedSignal
        ) {
          const runtimeRegistration = runtimeApi.registerSignalSubscriber({
            emitterUuid: emitterUuid,
            signalName: signalName,
            routeKey: referenceRouteKey,
            subscriberUuid: connectedSubscriberUuid,
            mode: "connect",
            handler: function onRuntimeConnectedSignal(payload) {
              return invokeConnectedHandlerWithDetail(payload, {
                type: signalName,
                detail: payload,
                target: hostElement,
                currentTarget: hostElement,
              });
            },
          });
          if (runtimeRegistration && Number.isFinite(Number(runtimeRegistration.token))) {
            runtimeRegistrationToken = Number(runtimeRegistration.token);
          }
        }
        if (runtimeApi && typeof runtimeApi.enqueueRuntimeEvent === "function") {
          runtimeApi.enqueueRuntimeEvent(
            "signal-connect",
            function processSignalConnectAck() {},
            {
              target: hostElement,
              payload: {
                componentUuid: emitterUuid,
                signal: signalName,
                subscriberUuid: connectedSubscriberUuid,
                routeKey: referenceRouteKey,
              },
            }
          );
        }
        const wrapped = function onConnectedSignal(event) {
          const sourceDetail = event && event.detail && typeof event.detail === "object" ? event.detail : {};
          return invokeConnectedHandlerWithDetail(sourceDetail, event || null);
        };
        connectionMap.set(handler, {
          mode: runtimeRegistrationToken != null ? "both" : "dom",
          token: runtimeRegistrationToken,
          wrapped: wrapped,
          runtimeSignalReference: runtimeSignalReference,
        });
        const useDomSignalListener =
          !(
            runtimeRegistrationToken != null &&
            runtimeApi &&
            typeof runtimeApi.getEventLoopMode === "function" &&
            String(runtimeApi.getEventLoopMode() || "").trim().toLowerCase() === "queued"
          );
        if (useDomSignalListener && typeof hostElement.addEventListener === "function") {
          hostElement.addEventListener(signalName, wrapped);
        }
        return handler;
      };
      signalMeta.connectImpl = signalFn.connect;

      signalFn.disconnect = function disconnectSignalHandler(handler) {
        if (!handler) {
          connectionMap.forEach(function eachConnection(entry) {
            const descriptor = entry && typeof entry === "object" ? entry : { mode: "dom", wrapped: entry };
            if ((descriptor.mode === "runtime" || descriptor.mode === "both") && runtimeApi && typeof runtimeApi.unregisterSignalSubscriber === "function" && descriptor.token != null) {
              runtimeApi.unregisterSignalSubscriber({ token: descriptor.token });
            }
            if (
              descriptor.runtimeSignalReference &&
              runtimeApi &&
              typeof runtimeApi.unregisterSignalReference === "function"
            ) {
              const runtimeRef = descriptor.runtimeSignalReference;
              if (runtimeRef.emitterUuid && runtimeRef.referenceKey) {
                runtimeApi.unregisterSignalReference({
                  emitterUuid: runtimeRef.emitterUuid,
                  referenceKey: runtimeRef.referenceKey,
                });
              }
            }
            if (typeof hostElement.removeEventListener === "function" && typeof descriptor.wrapped === "function") {
              hostElement.removeEventListener(signalName, descriptor.wrapped);
            }
          });
          connectionMap.clear();
          return true;
        }
        if (typeof handler !== "function") {
          return false;
        }
        const entry = connectionMap.get(handler);
        if (!entry) {
          return false;
        }
        const descriptor = entry && typeof entry === "object" ? entry : { mode: "dom", wrapped: entry };
        if ((descriptor.mode === "runtime" || descriptor.mode === "both") && runtimeApi && typeof runtimeApi.unregisterSignalSubscriber === "function" && descriptor.token != null) {
          runtimeApi.unregisterSignalSubscriber({ token: descriptor.token });
        }
        if (
          descriptor.runtimeSignalReference &&
          runtimeApi &&
          typeof runtimeApi.unregisterSignalReference === "function"
        ) {
          const runtimeRef = descriptor.runtimeSignalReference;
          if (runtimeRef.emitterUuid && runtimeRef.referenceKey) {
            runtimeApi.unregisterSignalReference({
              emitterUuid: runtimeRef.emitterUuid,
              referenceKey: runtimeRef.referenceKey,
            });
          }
        }
        if (typeof hostElement.removeEventListener === "function" && typeof descriptor.wrapped === "function") {
          hostElement.removeEventListener(signalName, descriptor.wrapped);
        }
        connectionMap.delete(handler);
        return true;
      };
      signalMeta.disconnectImpl = signalFn.disconnect;

      signalFn.emit = function emitSignalProxy() {
        return Function.prototype.apply.call(signalFn, hostElement, arguments);
      };
      signalMeta.emitImpl = signalFn.emit;

      return signalFn;
    }

    function ensureComponentSignalAttributeConnectionStore(element) {
      if (!element || element.nodeType !== 1) {
        return null;
      }
      let store = element.__qhtmlComponentSignalAttributeConnections;
      if (!store || typeof store !== "object") {
        store = {};
        element.__qhtmlComponentSignalAttributeConnections = store;
      }
      return store;
    }

    function detachComponentSignalAttributeConnection(element, attributeName) {
      const key = String(attributeName || "").trim().toLowerCase();
      if (!key) {
        return;
      }
      const store = ensureComponentSignalAttributeConnectionStore(element);
      if (!store || !store[key]) {
        return;
      }
      const entry = store[key];
      const signalName = String(entry.signalName || "").trim();
      const signalProxy = signalName ? element[signalName] : null;
      if (signalProxy && typeof signalProxy.disconnect === "function" && typeof entry.handler === "function") {
        signalProxy.disconnect(entry.handler);
      }
      delete store[key];
    }

    function bindComponentSignalAttributeConnection(attributeName, body, signalDecl, handlerParamNames, handlerThenBodies) {
      const signalName = String(signalDecl && signalDecl.name || "").trim();
      if (!signalName) {
        return false;
      }
      const signalProxy = hostElement[signalName];
      if (!signalProxy || typeof signalProxy.connect !== "function") {
        return false;
      }
      const key = String(attributeName || "").trim().toLowerCase();
      if (!key) {
        return false;
      }
      const source = String(body || "").trim();
      if (!source) {
        detachComponentSignalAttributeConnection(hostElement, key);
        return true;
      }
      const declaredHandlerParamNames = normalizeHandlerParameterNames(handlerParamNames);
      const normalizedThenBodies = normalizeThenBodies(handlerThenBodies);
      const store = ensureComponentSignalAttributeConnectionStore(hostElement);
      const current = store && store[key] ? store[key] : null;
      const signalParameterNames = Array.isArray(signalDecl.parameters)
        ? signalDecl.parameters.map(function mapSignalParam(entry) { return String(entry || "").trim(); }).filter(Boolean)
        : [];
      const effectiveParameterNames = declaredHandlerParamNames.length > 0
        ? declaredHandlerParamNames
        : signalParameterNames;
      const handlerPrelude = buildEventHandlerParameterPrelude(effectiveParameterNames);
      const transformedSource = transformScriptBody(handlerPrelude + source);
      const transformedThenBodies = normalizedThenBodies.map(function mapThenBody(entry) {
        return transformScriptBody(handlerPrelude + entry);
      });
      if (
        current &&
        current.source === transformedSource &&
        String(current.signalName || "") === signalName &&
        eventHandlerParameterNamesEqual(current.parameterNames, effectiveParameterNames) &&
        thenBodiesEqual(current.thenBodies, transformedThenBodies)
      ) {
        return true;
      }
      detachComponentSignalAttributeConnection(hostElement, key);
      const doc = hostElement.ownerDocument || global.document || null;
      const stages = [{ source: transformedSource }].concat(
        transformedThenBodies.map(function mapThenSource(entry) {
          return { source: entry };
        })
      );
      const compiledStages = [];
      for (let i = 0; i < stages.length; i += 1) {
        const stageSource = String(stages[i] && stages[i].source ? stages[i].source : "");
        const hasInterpolatedBody = hasInlineReferenceExpressions(stageSource);
        let compiled = null;
        if (!hasInterpolatedBody) {
          try {
            compiled = new Function("event", "document", withScopedSelectorPrelude(stageSource));
          } catch (error) {
            if (
              shouldLogQLoggerCategory(hostElement, componentNode, instanceNode, "q-signal") &&
              global.console &&
              typeof global.console.log === "function"
            ) {
              global.console.log("qhtml signal handler compile failed:", signalName, error);
            }
            return false;
          }
        }
        compiledStages.push({
          source: stageSource,
          hasInterpolatedBody: hasInterpolatedBody,
          compiled: compiled,
        });
      }
      const reportSignalHandlerFailure = function reportSignalHandlerFailure(error) {
        if (
          shouldLogQLoggerCategory(hostElement, componentNode, instanceNode, "q-signal") &&
          global.console &&
          typeof global.console.log === "function"
        ) {
          global.console.log("qhtml signal handler failed:", signalName, error);
        }
        return undefined;
      };
      const connectedHandler = function onComponentSignalAttributeConnected() {
        const invocationHost = resolveLiveComponentHost(hostElement);
        const args = Array.prototype.slice.call(arguments);
        const params = {};
        for (let i = 0; i < signalParameterNames.length; i += 1) {
          params[signalParameterNames[i]] = i < args.length ? args[i] : null;
        }
        const handlerParams = {};
        for (let i = 0; i < effectiveParameterNames.length; i += 1) {
          handlerParams[effectiveParameterNames[i]] = i < args.length ? args[i] : null;
        }
        const detail = {
          type: "signal",
          signal: signalName,
          signalId: signalName,
          component: String(componentNode.componentId || invocationHost.tagName || "").trim().toLowerCase(),
          componentUuid: readSignalEmitterUuid(),
          args: args.slice(),
          params: params,
        };
        const event = {
          type: signalName,
          detail: detail,
          target: invocationHost,
          currentTarget: invocationHost,
        };
        event.__qhtmlArgs = args.slice();
        event.__qhtmlParams = handlerParams;
        const runSignalStage = function runSignalStage(stage) {
          try {
            let executableSource = stage.source;
            if (stage.hasInterpolatedBody) {
              executableSource = interpolateInlineReferenceExpressions(
                stage.source,
                invocationHost,
                {
                  component: invocationHost,
                  event: event,
                  document: doc,
                  root: null,
                },
                "qhtml signal interpolation failed:",
                { scriptLiteral: true }
              );
            }
            ensureScopedSelectorShortcut(invocationHost, null);
            const executionThis = invocationHost;
            if (stage.compiled) {
              const boundCompiled = stage.compiled.bind(executionThis);
              return invokeWithRuntimeExecutionHost(invocationHost, function invokeCompiledSignalHandler() {
                return boundCompiled(event, doc);
              });
            }
            const dynamic = new Function("event", "document", withScopedSelectorPrelude(executableSource));
            const boundDynamic = dynamic.bind(executionThis);
            return invokeWithRuntimeExecutionHost(invocationHost, function invokeDynamicSignalHandler() {
              return boundDynamic(event, doc);
            });
          } catch (error) {
            return reportSignalHandlerFailure(error);
          }
        };
        let pending = null;
        for (let i = 0; i < compiledStages.length; i += 1) {
          const stage = compiledStages[i];
          if (pending && typeof pending.then === "function") {
            pending = pending.then(
              function runAfterResolve() {
                return runSignalStage(stage);
              },
              function runAfterReject(error) {
                reportSignalHandlerFailure(error);
                return runSignalStage(stage);
              }
            );
          } else {
            pending = runSignalStage(stage);
          }
        }
        if (pending && typeof pending.then === "function" && typeof pending.catch === "function") {
          pending.catch(function onUnhandledSignalStageError(error) {
            reportSignalHandlerFailure(error);
          });
        }
        return pending;
      };
      signalProxy.connect(connectedHandler);
      store[key] = {
        signalName: signalName,
        source: transformedSource,
        parameterNames: effectiveParameterNames.slice(),
        thenBodies: transformedThenBodies.slice(),
        handler: connectedHandler,
      };
      return true;
    }

    const signalDeclarations = Array.isArray(componentNode.signalDeclarations) ? componentNode.signalDeclarations : [];
    const implicitSignalMap = new Map();
    for (let i = 0; i < signalDeclarations.length; i += 1) {
      const declared = signalDeclarations[i] || {};
      const declaredName = String(declared.name || "").trim();
      if (!declaredName) {
        continue;
      }
      implicitSignalMap.set(declaredName.toLowerCase(), {
        name: declaredName,
        parameters: Array.isArray(declared.parameters)
          ? declared.parameters.map(function mapDeclaredParam(entry) { return String(entry || "").trim(); }).filter(Boolean)
          : [],
      });
    }
    for (let i = 0; i < declaredProperties.length; i += 1) {
      const propertyName = String(declaredProperties[i] || "").trim();
      if (!propertyName) {
        continue;
      }
      const changedSignalName = propertyName + "Changed";
      const changedSignalKey = changedSignalName.toLowerCase();
      if (implicitSignalMap.has(changedSignalKey)) {
        continue;
      }
      implicitSignalMap.set(changedSignalKey, {
        name: changedSignalName,
        parameters: ["value"],
      });
    }
    if (hasCanvasSemantics && !implicitSignalMap.has("paint")) {
      implicitSignalMap.set("paint", {
        name: "paint",
        parameters: ["event"],
      });
    }
    const runtimeSignals = Array.from(implicitSignalMap.values());
    for (let i = 0; i < runtimeSignals.length; i += 1) {
      const signalDecl = runtimeSignals[i] || {};
      const signalName = String(signalDecl.name || "").trim();
      if (!signalName || INVALID_METHOD_NAMES.has(signalName) || typeof hostElement[signalName] === "function") {
        continue;
      }
      const parameterNames = Array.isArray(signalDecl.parameters)
        ? signalDecl.parameters.map(function mapName(entry) { return String(entry || "").trim(); }).filter(Boolean)
        : [];
      hostElement[signalName] = createComponentSignalEmitter(signalName, parameterNames);
    }

    bindComponentCssBindings(componentNode, hostElement, declaredPropertiesSeen);

    const signalAttributeLookup = new Map();
    for (let i = 0; i < runtimeSignals.length; i += 1) {
      const signalDecl = runtimeSignals[i] || {};
      const signalName = String(signalDecl.name || "").trim();
      if (!signalName) {
        continue;
      }
      const variants = createEventNameVariants(signalName);
      for (let j = 0; j < variants.length; j += 1) {
        const key = String(variants[j] || "").trim().toLowerCase();
        if (!key || signalAttributeLookup.has(key)) {
          continue;
        }
        signalAttributeLookup.set(key, signalDecl);
      }
    }

    const componentAttributeKeys = Object.keys(componentAttributes);
    for (let i = 0; i < componentAttributeKeys.length; i += 1) {
      const attributeName = String(componentAttributeKeys[i] || "").trim();
      if (!isDomEventAttributeName(attributeName)) {
        continue;
      }
      if (instanceAttributeKeySet.has(attributeName.toLowerCase())) {
        continue;
      }
      const body = String(componentAttributes[attributeName] || "").trim();
      if (!body) {
        continue;
      }
      const parameterNames =
        instanceEventAttributeParameters[attributeName.toLowerCase()] ||
        componentEventAttributeParameters[attributeName.toLowerCase()] ||
        [];
      const thenBodies =
        instanceEventAttributeThen[attributeName.toLowerCase()] ||
        componentEventAttributeThen[attributeName.toLowerCase()] ||
        [];
      const rawSignalName = String(attributeName.slice(2) || "").trim();
      const rawSignalKey = rawSignalName.toLowerCase();
      let signalDecl = signalAttributeLookup.get(rawSignalKey) || null;
      if (!signalDecl) {
        const variants = createEventNameVariants(rawSignalName);
        for (let j = 0; j < variants.length; j += 1) {
          signalDecl = signalAttributeLookup.get(String(variants[j] || "").trim().toLowerCase()) || null;
          if (signalDecl) {
            break;
          }
        }
      }
      if (signalDecl && bindComponentSignalAttributeConnection(attributeName, body, signalDecl, parameterNames, thenBodies)) {
        continue;
      }
      bindEventAttributeListener(hostElement, attributeName, body, {
        doc: hostElement.ownerDocument || global.document || null,
        scopeRoot: null,
        parameterNames: parameterNames,
        thenBodies: thenBodies,
      });
    }

    if (hasCanvasSemantics) {
      const onPaintSource = String(componentAttributes.onpaint || "").trim();
      if (onPaintSource) {
        try {
          Object.defineProperty(hostElement, "__qhtmlCanvasOnPaintSource", {
            configurable: true,
            enumerable: false,
            writable: true,
            value: onPaintSource,
          });
        } catch (error) {
          hostElement.__qhtmlCanvasOnPaintSource = onPaintSource;
        }
      }
    }

    bindComponentTimers(
      componentNode,
      hostElement,
      hostElement.ownerDocument || global.document || null,
      runtimeApi,
      hostScopeFrame,
      hostRuntimeFrame
    );
    bindComponentWasm(componentNode, hostElement);
  }

  function isRepeaterPlaceholderOnly(text, slotName) {
    const value = String(text || "").trim();
    const escaped = String(slotName || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp("^\\$\\{\\s*" + escaped + "\\s*\\}$");
    return re.test(value);
  }

  function resolveRepeaterEntryValue(entry) {
    if (!entry || typeof entry !== "object") {
      return entry;
    }
    if (Object.prototype.hasOwnProperty.call(entry, "value")) {
      return entry.value;
    }
    if (Object.prototype.hasOwnProperty.call(entry, "text")) {
      return entry.text;
    }
    return entry;
  }

  function stringifyRepeaterEntry(entry, options) {
    const opts = options || {};
    const preferModelValue = !!opts.preferModelValue;
    if (!entry || typeof entry !== "object") {
      return String(entry == null ? "" : entry);
    }
    if (entry.kind === "qobject") {
      if (preferModelValue && Object.prototype.hasOwnProperty.call(entry, "value")) {
        return String(entry.value == null ? "" : entry.value);
      }
      return String(entry.source || "").trim();
    }
    if (Object.prototype.hasOwnProperty.call(entry, "value")) {
      return String(entry.value == null ? "" : entry.value);
    }
    return String(entry.text || "");
  }

  function replaceRepeaterPlaceholderText(source, slotName, entry, options) {
    const text = String(source == null ? "" : source);
    const escaped = String(slotName || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp("\\$\\{\\s*" + escaped + "\\s*\\}", "g");
    return text.replace(re, stringifyRepeaterEntry(entry, options));
  }

  function applyRepeaterEntryToValue(value, slotName, entry, options) {
    if (typeof value === "string") {
      const text = String(value == null ? "" : value);
      const escapedSlotName = String(slotName || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (escapedSlotName && !hasInlineReferenceExpressions(text)) {
        const wholeSlotPattern = new RegExp("^\\s*" + escapedSlotName + "\\s*$");
        if (wholeSlotPattern.test(text)) {
          return stringifyRepeaterEntry(entry, options);
        }
      }
      return replaceRepeaterPlaceholderText(value, slotName, entry, options);
    }
    if (Array.isArray(value)) {
      const out = [];
      for (let i = 0; i < value.length; i += 1) {
        out.push(applyRepeaterEntryToValue(value[i], slotName, entry, options));
      }
      return out;
    }
    if (!value || typeof value !== "object") {
      return value;
    }
    const keys = Object.keys(value);
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      value[key] = applyRepeaterEntryToValue(value[key], slotName, entry, options);
    }
    return value;
  }

  function materializeRepeaterTemplateNodes(repeaterNode, entry) {
    const templateNodes = Array.isArray(repeaterNode && repeaterNode.templateNodes) ? repeaterNode.templateNodes : [];
    const slotName = String(repeaterNode && repeaterNode.slotName || "item").trim() || "item";
    const preferModelValue = String(repeaterNode && repeaterNode.keyword || "").trim().toLowerCase() === "q-model-view";
    const out = [];
    for (let i = 0; i < templateNodes.length; i += 1) {
      const templateNode = templateNodes[i];
      const cloned = cloneNodeDeep(templateNode);
      refreshQDomNodeUuidsDeep(cloned);
      stripQDomSourceRefsDeep(cloned);
      if (
        entry &&
        typeof entry === "object" &&
        entry.kind === "qobject" &&
        !preferModelValue &&
        core.NODE_TYPES.text &&
        cloned &&
        cloned.kind === core.NODE_TYPES.text &&
        isRepeaterPlaceholderOnly(cloned.value, slotName)
      ) {
        const objectNodes = Array.isArray(entry.nodes) ? entry.nodes : [];
        for (let j = 0; j < objectNodes.length; j += 1) {
          const objectClone = cloneNodeDeep(objectNodes[j]);
          refreshQDomNodeUuidsDeep(objectClone);
          stripQDomSourceRefsDeep(objectClone);
          out.push(objectClone);
        }
        continue;
      }
      out.push(applyRepeaterEntryToValue(cloned, slotName, entry, { preferModelValue: preferModelValue }));
    }
    return out;
  }

  function createRepeaterRenderContext(baseContext, repeaterNode, entry, index) {
    const next = Object.assign({}, baseContext || {});
    const inheritedScope =
      baseContext && baseContext.inlineScope && typeof baseContext.inlineScope === "object"
        ? baseContext.inlineScope
        : null;
    const inlineScope = Object.assign({}, inheritedScope || {});
    const slotName = String(repeaterNode && repeaterNode.slotName || "item").trim() || "item";
    const aliasNames =
      repeaterNode &&
      repeaterNode.meta &&
      Array.isArray(repeaterNode.meta.aliasNames)
        ? repeaterNode.meta.aliasNames
        : [slotName];
    const entryValue = resolveRepeaterEntryValue(entry);
    for (let i = 0; i < aliasNames.length; i += 1) {
      const aliasName = String(aliasNames[i] || "").trim();
      if (!aliasName) {
        continue;
      }
      inlineScope[aliasName] = entryValue;
    }
    inlineScope[slotName] = entryValue;
    inlineScope.index = Number(index) || 0;
    next.inlineScope = inlineScope;
    if (baseContext && baseContext[QCONTEXT_SCOPE_FRAME_KEY]) {
      next[QCONTEXT_SCOPE_FRAME_KEY] = baseContext[QCONTEXT_SCOPE_FRAME_KEY].child("repeater");
    }
    if (baseContext && baseContext[QCONTEXT_RUNTIME_FRAME_KEY]) {
      next[QCONTEXT_RUNTIME_FRAME_KEY] = baseContext[QCONTEXT_RUNTIME_FRAME_KEY].child("repeater");
    }
    return next;
  }

  function createContextFrame(parentFrame, kind, owner) {
    const parent = parentFrame && typeof parentFrame === "object" ? parentFrame : null;
    const localSymbols = Object.create(null);
    const frame = {
      kind: String(kind || "context").trim() || "context",
      parent: parent,
      owner: owner || null,
      set: function setContextFrameSymbol(name, value) {
        const key = String(name || "").trim();
        if (!key) {
          return false;
        }
        localSymbols[key] = value;
        return true;
      },
      getLocal: function getContextFrameLocal(name) {
        const key = String(name || "").trim();
        if (!key || !Object.prototype.hasOwnProperty.call(localSymbols, key)) {
          return undefined;
        }
        return localSymbols[key];
      },
      get: function getContextFrameSymbol(name) {
        const key = String(name || "").trim();
        if (!key) {
          return undefined;
        }
        if (Object.prototype.hasOwnProperty.call(localSymbols, key)) {
          return localSymbols[key];
        }
        if (parent && typeof parent.get === "function") {
          return parent.get(key);
        }
        return undefined;
      },
      hasLocal: function hasContextFrameLocal(name) {
        const key = String(name || "").trim();
        return !!(key && Object.prototype.hasOwnProperty.call(localSymbols, key));
      },
      has: function hasContextFrameSymbol(name) {
        const key = String(name || "").trim();
        if (!key) {
          return false;
        }
        if (Object.prototype.hasOwnProperty.call(localSymbols, key)) {
          return true;
        }
        return !!(parent && typeof parent.has === "function" && parent.has(key));
      },
      toObject: function contextFrameToObject() {
        const out = parent && typeof parent.toObject === "function" ? parent.toObject() : {};
        const keys = Object.keys(localSymbols);
        for (let i = 0; i < keys.length; i += 1) {
          out[keys[i]] = localSymbols[keys[i]];
        }
        return out;
      },
      child: function createContextFrameChild(childKind, childOwner) {
        return createContextFrame(frame, childKind || frame.kind, childOwner || null);
      },
    };
    return frame;
  }

  function ensureContextFrames(context) {
    if (!context || typeof context !== "object") {
      const fallbackScope = createContextFrame(null, "scope", null);
      const fallbackRuntime = createContextFrame(null, "runtime", null);
      return {
        scope: fallbackScope,
        runtime: fallbackRuntime,
      };
    }
    if (!context[QCONTEXT_SCOPE_FRAME_KEY] || typeof context[QCONTEXT_SCOPE_FRAME_KEY] !== "object") {
      context[QCONTEXT_SCOPE_FRAME_KEY] = createContextFrame(null, "scope", null);
    }
    if (!context[QCONTEXT_RUNTIME_FRAME_KEY] || typeof context[QCONTEXT_RUNTIME_FRAME_KEY] !== "object") {
      context[QCONTEXT_RUNTIME_FRAME_KEY] = createContextFrame(null, "runtime", null);
    }
    return {
      scope: context[QCONTEXT_SCOPE_FRAME_KEY],
      runtime: context[QCONTEXT_RUNTIME_FRAME_KEY],
    };
  }

  function ensureInstanceAliasScopeStack(context) {
    if (!context || typeof context !== "object") {
      const fallbackRoot = createContextFrame(null, "scope", null);
      return [fallbackRoot];
    }
    ensureContextFrames(context);
    const activeScopeFrame = context[QCONTEXT_SCOPE_FRAME_KEY];
    let stack = Array.isArray(context.instanceAliasScopeStack) ? context.instanceAliasScopeStack : null;
    const shouldRebuild =
      !stack ||
      stack.length === 0 ||
      stack[stack.length - 1] !== activeScopeFrame;
    if (shouldRebuild) {
      const rebuilt = [];
      const seen = new Set();
      let cursor = activeScopeFrame;
      while (cursor && typeof cursor === "object" && !seen.has(cursor)) {
        rebuilt.push(cursor);
        seen.add(cursor);
        cursor = cursor.parent && typeof cursor.parent === "object" ? cursor.parent : null;
      }
      rebuilt.reverse();
      context.instanceAliasScopeStack = rebuilt.length > 0 ? rebuilt : [activeScopeFrame];
      stack = context.instanceAliasScopeStack;
    }
    return stack;
  }

  function pushInstanceAliasScope(context) {
    const stack = ensureInstanceAliasScopeStack(context);
    const parentFrame = stack.length > 0 ? stack[stack.length - 1] : null;
    const frame = createContextFrame(parentFrame, "scope", null);
    stack.push(frame);
    context[QCONTEXT_SCOPE_FRAME_KEY] = frame;
    return frame;
  }

  function popInstanceAliasScope(context) {
    if (!context || !Array.isArray(context.instanceAliasScopeStack) || context.instanceAliasScopeStack.length === 0) {
      return;
    }
    if (context.instanceAliasScopeStack.length === 1) {
      const rootFrame = context.instanceAliasScopeStack[0];
      context[QCONTEXT_SCOPE_FRAME_KEY] = rootFrame;
      return;
    }
    context.instanceAliasScopeStack.pop();
    context[QCONTEXT_SCOPE_FRAME_KEY] =
      context.instanceAliasScopeStack[context.instanceAliasScopeStack.length - 1] || null;
  }

  function mergeInstanceAliasesIntoScope(scope, context) {
    if (!scope || typeof scope !== "object" || !context) {
      return;
    }
    ensureContextFrames(context);
    const scopeFrame =
      context[QCONTEXT_SCOPE_FRAME_KEY] && typeof context[QCONTEXT_SCOPE_FRAME_KEY].toObject === "function"
        ? context[QCONTEXT_SCOPE_FRAME_KEY]
        : null;
    if (!scopeFrame) {
      return;
    }
    const values = scopeFrame.toObject();
    const names = Object.keys(values);
    for (let i = 0; i < names.length; i += 1) {
      const name = String(names[i] || "").trim();
      if (!name) {
        continue;
      }
      scope[name] = values[name];
    }
  }

  function resolveAliasUuid(value) {
    if (!value || typeof value !== "object") {
      return "";
    }
    if (typeof value[QCONTEXT_SYMBOL_UUID_KEY] === "string") {
      return String(value[QCONTEXT_SYMBOL_UUID_KEY] || "").trim();
    }
    if (typeof value.uuid === "string") {
      return String(value.uuid || "").trim();
    }
    if (value.meta && typeof value.meta === "object" && typeof value.meta[QDOM_UUID_META_KEY] === "string") {
      return String(value.meta[QDOM_UUID_META_KEY] || "").trim();
    }
    if (typeof core.ensureNodeUuid === "function") {
      try {
        const ensured = core.ensureNodeUuid(value);
        if (ensured && typeof ensured === "object" && ensured.meta && typeof ensured.meta === "object") {
          const uuid = String(ensured.meta[QDOM_UUID_META_KEY] || "").trim();
          if (uuid) {
            return uuid;
          }
        }
      } catch (error) {
        // no-op
      }
    }
    return "";
  }

  function readHandleResolutionTarget(handle) {
    if (!handle || handle[QCONTEXT_SYMBOL_HANDLE_FLAG] !== true) {
      return null;
    }
    if (handle.__qhtmlAliasTarget && typeof handle.__qhtmlAliasTarget === "object") {
      return handle.__qhtmlAliasTarget;
    }
    const runtime = global.QHtml || modules.qhtmlRuntime || null;
    if (runtime && typeof runtime.resolveUuidPointer === "function") {
      try {
        const pointer = runtime.resolveUuidPointer(handle[QCONTEXT_SYMBOL_UUID_KEY]);
        if (pointer && typeof pointer === "object") {
          return pointer;
        }
      } catch (error) {
        // no-op
      }
    }
    if (global.QHTML_UUID_LOOKUP_MAP && typeof global.QHTML_UUID_LOOKUP_MAP.get === "function") {
      const lookup = global.QHTML_UUID_LOOKUP_MAP.get(handle[QCONTEXT_SYMBOL_UUID_KEY]);
      if (lookup && typeof lookup === "object" && lookup.pointer && typeof lookup.pointer === "object") {
        return lookup.pointer;
      }
    }
    if (global.QHTML_UUID_MAP && typeof global.QHTML_UUID_MAP.get === "function") {
      const mapped = global.QHTML_UUID_MAP.get(handle[QCONTEXT_SYMBOL_UUID_KEY]);
      if (mapped && typeof mapped === "object") {
        return mapped;
      }
    }
    return null;
  }

  function isContextSymbolHandle(value) {
    return !!(value && value[QCONTEXT_SYMBOL_HANDLE_FLAG] === true);
  }

  function isOwnerTypeSymbolHandle(value) {
    return !!(
      isContextSymbolHandle(value) &&
      String(value[QCONTEXT_SYMBOL_KIND_KEY] || "").trim().toLowerCase() === "owner-type"
    );
  }

  function readOwnerTypeSymbolName(value) {
    if (!isOwnerTypeSymbolHandle(value)) {
      return "";
    }
    return String(value[QCONTEXT_OWNER_TYPE_NAME_KEY] || "").trim();
  }

  function readOwnerTypeParentHandle(value) {
    if (!isOwnerTypeSymbolHandle(value)) {
      return null;
    }
    const parentHandle = value[QCONTEXT_OWNER_PARENT_HANDLE_KEY];
    return isContextSymbolHandle(parentHandle) ? parentHandle : null;
  }

  function createNamedSymbolHandle(options) {
    const opts = options && typeof options === "object" ? options : {};
    const uuid = String(opts.uuid || "").trim();
    const symbolKind = String(opts.kind || "instance").trim().toLowerCase() || "instance";
    const headOnly = opts.headOnly === true;
    const label = String(opts.label || opts.kind || "").trim() || symbolKind;
    const aliasTarget = opts.target && typeof opts.target === "object" ? opts.target : null;
    const ownerTypeName = String(opts.ownerTypeName || "").trim();
    const ownerTypeParentHandle = isContextSymbolHandle(opts.ownerTypeParentHandle)
      ? opts.ownerTypeParentHandle
      : null;
    const base = Object.create(null);
    base[QCONTEXT_SYMBOL_HANDLE_FLAG] = true;
    base[QCONTEXT_SYMBOL_UUID_KEY] = uuid;
    base[QCONTEXT_SYMBOL_KIND_KEY] = symbolKind;
    base[QCONTEXT_SYMBOL_HEAD_ONLY_KEY] = headOnly;
    base[QCONTEXT_OWNER_TYPE_NAME_KEY] = ownerTypeName;
    base[QCONTEXT_OWNER_PARENT_HANDLE_KEY] = ownerTypeParentHandle;
    base.__qhtmlAliasTarget = aliasTarget;
    base.uuid = uuid;
    const callableCache = typeof WeakMap === "function" ? new WeakMap() : null;
    function wrapNamedSymbolCallable(fn, owner) {
      if (typeof fn !== "function") {
        return fn;
      }
      if (callableCache && callableCache.has(fn)) {
        return callableCache.get(fn);
      }
      const callable = function namedSymbolCallableProxy() {
        return fn.apply(owner, arguments);
      };
      const proxied = new Proxy(callable, {
        get: function getNamedSymbolCallableProperty(_target, prop) {
          if (prop === "__qhtmlContextFunctionTarget") {
            return fn;
          }
          if (prop === "__qhtmlContextFunctionOwner") {
            return owner;
          }
          const value = fn[prop];
          if (typeof value === "function") {
            return function callNamedSymbolCallableProperty() {
              return value.apply(fn, arguments);
            };
          }
          return value;
        },
        set: function setNamedSymbolCallableProperty(_target, prop, value) {
          fn[prop] = value;
          return true;
        },
        has: function hasNamedSymbolCallableProperty(_target, prop) {
          return prop in fn;
        },
        ownKeys: function ownNamedSymbolCallableKeys() {
          return Reflect.ownKeys(fn);
        },
        getOwnPropertyDescriptor: function getNamedSymbolCallableDescriptor(_target, prop) {
          return Object.getOwnPropertyDescriptor(fn, prop);
        },
      });
      if (callableCache) {
        callableCache.set(fn, proxied);
      }
      return proxied;
    }
    let handle = null;
    handle = new Proxy(base, {
      get: function getNamedSymbolHandle(target, prop) {
        if (
          prop === QCONTEXT_SYMBOL_HANDLE_FLAG ||
          prop === QCONTEXT_SYMBOL_UUID_KEY ||
          prop === QCONTEXT_SYMBOL_KIND_KEY ||
          prop === QCONTEXT_SYMBOL_HEAD_ONLY_KEY ||
          prop === QCONTEXT_OWNER_TYPE_NAME_KEY ||
          prop === QCONTEXT_OWNER_PARENT_HANDLE_KEY ||
          prop === "__qhtmlAliasTarget" ||
          prop === "uuid"
        ) {
          return target[prop];
        }
        if (prop === "toString") {
          return function namedSymbolHandleToString() {
            return label;
          };
        }
        if (prop === Symbol.toPrimitive) {
          return function namedSymbolHandleToPrimitive() {
            return label;
          };
        }
        if (
          target[QCONTEXT_SYMBOL_KIND_KEY] === "owner-type" &&
          typeof prop === "string"
        ) {
          const key = String(prop || "").trim();
          const typeName = String(target[QCONTEXT_OWNER_TYPE_NAME_KEY] || "").trim();
          if (key && typeName && key === typeName) {
            const parentHandle = target[QCONTEXT_OWNER_PARENT_HANDLE_KEY];
            return isContextSymbolHandle(parentHandle) ? parentHandle : handle;
          }
        }
        if (target[QCONTEXT_SYMBOL_HEAD_ONLY_KEY] === true) {
          return undefined;
        }
        const resolvedTarget = readHandleResolutionTarget(target);
        if (!resolvedTarget) {
          return undefined;
        }
        const value = resolvedTarget[prop];
        if (typeof value === "function") {
          return wrapNamedSymbolCallable(value, resolvedTarget);
        }
        return value;
      },
      set: function setNamedSymbolHandle(target, prop, value) {
        if (
          target[QCONTEXT_SYMBOL_KIND_KEY] === "owner-type" &&
          typeof prop === "string"
        ) {
          const key = String(prop || "").trim();
          const typeName = String(target[QCONTEXT_OWNER_TYPE_NAME_KEY] || "").trim();
          if (key && typeName && key === typeName) {
            return true;
          }
        }
        if (target[QCONTEXT_SYMBOL_HEAD_ONLY_KEY] === true) {
          return true;
        }
        const resolvedTarget = readHandleResolutionTarget(target);
        if (resolvedTarget && typeof resolvedTarget === "object") {
          resolvedTarget[prop] = value;
        }
        return true;
      },
    });
    return handle;
  }

  function exportNamedAliasToHost(hostElement, aliasName, value) {
    if (!hostElement || (typeof hostElement !== "object" && typeof hostElement !== "function")) {
      return;
    }
    const name = String(aliasName || "").trim();
    if (!name) {
      return;
    }
    if (!hostElement.__qhtmlNamedRuntimeValues || typeof hostElement.__qhtmlNamedRuntimeValues !== "object") {
      hostElement.__qhtmlNamedRuntimeValues = Object.create(null);
    }
    if (!hostElement.__qhtmlScriptScope || typeof hostElement.__qhtmlScriptScope !== "object") {
      hostElement.__qhtmlScriptScope = Object.create(null);
    }
    hostElement.__qhtmlNamedRuntimeValues[name] = value;
    hostElement.__qhtmlScriptScope[name] = value;
    if (!isQVarHandle(value)) {
      try {
        hostElement[name] = value;
      } catch (ignoredAssignNamedAlias) {
        // no-op
      }
    }
  }

  function hydrateHostNamedRuntimeScope(hostElement, context) {
    if (!hostElement || (typeof hostElement !== "object" && typeof hostElement !== "function")) {
      return;
    }
    const namedValues = Object.create(null);
    if (context && context.namedRuntimeValues && typeof context.namedRuntimeValues === "object") {
      const directNames = Object.keys(context.namedRuntimeValues);
      for (let i = 0; i < directNames.length; i += 1) {
        const key = String(directNames[i] || "").trim();
        if (!key) {
          continue;
        }
        namedValues[key] = context.namedRuntimeValues[key];
      }
    }
    if (
      context &&
      context[QCONTEXT_RUNTIME_FRAME_KEY] &&
      typeof context[QCONTEXT_RUNTIME_FRAME_KEY].toObject === "function"
    ) {
      const runtimeValues = context[QCONTEXT_RUNTIME_FRAME_KEY].toObject();
      const runtimeNames = Object.keys(runtimeValues);
      for (let i = 0; i < runtimeNames.length; i += 1) {
        const key = String(runtimeNames[i] || "").trim();
        if (!key || Object.prototype.hasOwnProperty.call(namedValues, key)) {
          continue;
        }
        namedValues[key] = runtimeValues[key];
      }
    }
    const names = Object.keys(namedValues);
    if (names.length === 0) {
      return;
    }
    for (let i = 0; i < names.length; i += 1) {
      const name = String(names[i] || "").trim();
      if (!name) {
        continue;
      }
      exportNamedAliasToHost(hostElement, name, namedValues[name]);
    }
  }

  function warnScopedAliasConflict(aliasName, message) {
    if (!global.console || typeof global.console.warn !== "function") {
      return;
    }
    global.console.warn(
      "[QHTML][scope][alias-conflict]",
      String(aliasName || ""),
      String(message || "")
    );
  }

  function findNearestOwnerTypeHandle(scopeFrame, ownerTypeName) {
    const key = String(ownerTypeName || "").trim();
    if (!key || !scopeFrame || typeof scopeFrame !== "object") {
      return null;
    }
    let cursor = scopeFrame;
    const visited = typeof WeakSet === "function" ? new WeakSet() : null;
    while (cursor && typeof cursor === "object") {
      if (visited) {
        if (visited.has(cursor)) {
          break;
        }
        visited.add(cursor);
      }
      const local =
        typeof cursor.getLocal === "function"
          ? cursor.getLocal(key)
          : typeof cursor.get === "function"
            ? cursor.get(key)
            : undefined;
      if (isOwnerTypeSymbolHandle(local) && readOwnerTypeSymbolName(local) === key) {
        return local;
      }
      cursor = cursor.parent && typeof cursor.parent === "object" ? cursor.parent : null;
    }
    return null;
  }

  function registerComponentOwnerTypeAlias(hostElement, componentNode, scopeFrame, runtimeFrame, parentScopeFrame) {
    if (!hostElement || hostElement.nodeType !== 1 || !componentNode || typeof componentNode !== "object") {
      return null;
    }
    const ownerTypeName = String(componentNode.componentId || hostElement.tagName || "").trim().toLowerCase();
    if (!ownerTypeName) {
      return null;
    }
    const nearestOwnerParent = findNearestOwnerTypeHandle(parentScopeFrame, ownerTypeName);
    const ownerHandle = createNamedSymbolHandle({
      uuid: resolveAliasUuid(hostElement),
      kind: "owner-type",
      headOnly: false,
      target: hostElement,
      label: ownerTypeName,
      ownerTypeName: ownerTypeName,
      ownerTypeParentHandle: nearestOwnerParent,
    });
    if (scopeFrame && typeof scopeFrame.hasLocal === "function" && scopeFrame.hasLocal(ownerTypeName)) {
      warnScopedAliasConflict(
        ownerTypeName,
        "owner type alias already exists in local scope; preserving existing value"
      );
      return null;
    }
    if (scopeFrame && typeof scopeFrame.set === "function") {
      scopeFrame.set(ownerTypeName, ownerHandle);
    }
    if (runtimeFrame && typeof runtimeFrame.set === "function") {
      runtimeFrame.set(ownerTypeName, ownerHandle);
    }
    exportNamedAliasToHost(hostElement, ownerTypeName, ownerHandle);
    return ownerHandle;
  }

  function registerNamedInstanceAlias(context, hostElement, componentNode, instanceNode) {
    if (!context || !instanceNode || !instanceNode.meta || typeof instanceNode.meta !== "object") {
      return;
    }
    const alias = String(instanceNode.meta[QINSTANCE_ALIAS_META_KEY] || "").trim();
    if (!alias) {
      return;
    }
    ensureContextFrames(context);
    const definitionType = inferDefinitionType(componentNode);
    const headOnly = definitionType === "template";
    const sourceTarget = hostElement && typeof hostElement === "object" ? hostElement : componentNode;
    const aliasUuid = resolveAliasUuid(sourceTarget) || resolveAliasUuid(instanceNode) || resolveAliasUuid(componentNode);
    const aliasHandle = createNamedSymbolHandle({
      uuid: aliasUuid,
      kind: headOnly ? "template-type" : "instance",
      headOnly: headOnly,
      target: sourceTarget,
      label: alias,
    });
    const stack = ensureInstanceAliasScopeStack(context);
    const frame = stack[stack.length - 1] || createContextFrame(context[QCONTEXT_SCOPE_FRAME_KEY], "scope", null);
    if (frame !== stack[stack.length - 1]) {
      stack[stack.length - 1] = frame;
    }
    const hostStack =
      context && Array.isArray(context.componentHostStack) ? context.componentHostStack : null;
    const ownerHost = hostStack && hostStack.length > 0 ? hostStack[hostStack.length - 1] : null;
    const existingLocal = typeof frame.getLocal === "function" ? frame.getLocal(alias) : undefined;
    if (typeof frame.hasLocal === "function" && frame.hasLocal(alias)) {
      if (isOwnerTypeSymbolHandle(existingLocal)) {
        warnScopedAliasConflict(
          alias,
          "child instance alias conflicts with enclosing component type alias; binding is blanked"
        );
        frame.set(alias, "");
        context[QCONTEXT_RUNTIME_FRAME_KEY].set(alias, "");
        if (ownerHost) {
          exportNamedAliasToHost(ownerHost, alias, "");
        } else {
          if (context && context.namedRuntimeValues && typeof context.namedRuntimeValues === "object") {
            context.namedRuntimeValues[alias] = "";
          }
          if (context && context.rootHostElement) {
            exportNamedAliasToHost(context.rootHostElement, alias, "");
          }
        }
        return;
      }
    }
    frame.set(alias, aliasHandle);
    context[QCONTEXT_SCOPE_FRAME_KEY] = frame;
    context[QCONTEXT_RUNTIME_FRAME_KEY].set(alias, aliasHandle);
    if (ownerHost) {
      exportNamedAliasToHost(ownerHost, alias, aliasHandle);
    } else {
      if (context && context.namedRuntimeValues && typeof context.namedRuntimeValues === "object") {
        context.namedRuntimeValues[alias] = aliasHandle;
      }
      if (context && context.rootHostElement) {
        exportNamedAliasToHost(context.rootHostElement, alias, aliasHandle);
      }
    }
  }

  function registerNamedRuntimeValueAlias(context, aliasName, value) {
    if (!context || !aliasName) {
      return;
    }
    const alias = String(aliasName || "").trim();
    if (!alias) {
      return;
    }
    ensureContextFrames(context);
    const stack = ensureInstanceAliasScopeStack(context);
    const frame = stack[stack.length - 1] || createContextFrame(context[QCONTEXT_SCOPE_FRAME_KEY], "scope", null);
    if (frame !== stack[stack.length - 1]) {
      stack[stack.length - 1] = frame;
    }
    frame.set(alias, value);
    context[QCONTEXT_SCOPE_FRAME_KEY] = frame;
    context[QCONTEXT_RUNTIME_FRAME_KEY].set(alias, value);
    const hostStack = Array.isArray(context.componentHostStack) ? context.componentHostStack : null;
    const ownerHost = hostStack && hostStack.length > 0 ? hostStack[hostStack.length - 1] : null;
    if (ownerHost) {
      exportNamedAliasToHost(ownerHost, alias, value);
      return;
    }
    if (context.namedRuntimeValues && typeof context.namedRuntimeValues === "object") {
      context.namedRuntimeValues[alias] = value;
    }
    if (context.rootHostElement) {
      exportNamedAliasToHost(context.rootHostElement, alias, value);
    }
  }

  function bindRuntimeContextToTarget(target, scopeFrame, runtimeFrame) {
    if (!target || (typeof target !== "object" && typeof target !== "function")) {
      return;
    }
    const scope = scopeFrame && typeof scopeFrame === "object" ? scopeFrame : null;
    const runtime = runtimeFrame && typeof runtimeFrame === "object" ? runtimeFrame : null;
    try {
      Object.defineProperty(target, QCONTEXT_SCOPE_FRAME_KEY, {
        value: scope,
        configurable: true,
        enumerable: false,
        writable: true,
      });
    } catch (error) {
      target[QCONTEXT_SCOPE_FRAME_KEY] = scope;
    }
    try {
      Object.defineProperty(target, QCONTEXT_RUNTIME_FRAME_KEY, {
        value: runtime,
        configurable: true,
        enumerable: false,
        writable: true,
      });
    } catch (error) {
      target[QCONTEXT_RUNTIME_FRAME_KEY] = runtime;
    }
    if (!target.__qhtmlResolveSymbol || typeof target.__qhtmlResolveSymbol !== "function") {
      try {
        Object.defineProperty(target, "__qhtmlResolveSymbol", {
          configurable: true,
          enumerable: false,
          writable: true,
          value: function resolveRuntimeSymbol(name) {
            const key = String(name || "").trim();
            if (!key) {
              return undefined;
            }
            const activeScope = this && this[QCONTEXT_SCOPE_FRAME_KEY] && typeof this[QCONTEXT_SCOPE_FRAME_KEY].get === "function"
              ? this[QCONTEXT_SCOPE_FRAME_KEY]
              : null;
            if (activeScope) {
              const local = activeScope.get(key);
              if (typeof local !== "undefined") {
                return local;
              }
            }
            const activeRuntime =
              this && this[QCONTEXT_RUNTIME_FRAME_KEY] && typeof this[QCONTEXT_RUNTIME_FRAME_KEY].get === "function"
                ? this[QCONTEXT_RUNTIME_FRAME_KEY]
                : null;
            if (activeRuntime) {
              return activeRuntime.get(key);
            }
            return undefined;
          },
        });
      } catch (error) {
        target.__qhtmlResolveSymbol = function resolveRuntimeSymbol(name) {
          const key = String(name || "").trim();
          if (!key) {
            return undefined;
          }
          const activeScope = this && this[QCONTEXT_SCOPE_FRAME_KEY] && typeof this[QCONTEXT_SCOPE_FRAME_KEY].get === "function"
            ? this[QCONTEXT_SCOPE_FRAME_KEY]
            : null;
          if (activeScope) {
            const local = activeScope.get(key);
            if (typeof local !== "undefined") {
              return local;
            }
          }
          const activeRuntime =
            this && this[QCONTEXT_RUNTIME_FRAME_KEY] && typeof this[QCONTEXT_RUNTIME_FRAME_KEY].get === "function"
              ? this[QCONTEXT_RUNTIME_FRAME_KEY]
              : null;
          return activeRuntime ? activeRuntime.get(key) : undefined;
        };
      }
    }
  }

  function bindRepeaterEntryToComponentHost(context, repeaterNode, entry, index) {
    const hostStack =
      context && Array.isArray(context.componentHostStack) ? context.componentHostStack : null;
    const componentHost = hostStack && hostStack.length > 0 ? hostStack[hostStack.length - 1] : null;
    if (!componentHost || typeof componentHost !== "object") {
      return function noopRestore() {};
    }
    const slotName = String(repeaterNode && repeaterNode.slotName || "item").trim() || "item";
    const aliasNames =
      repeaterNode &&
      repeaterNode.meta &&
      Array.isArray(repeaterNode.meta.aliasNames)
        ? repeaterNode.meta.aliasNames
        : [slotName];
    const entryValue = resolveRepeaterEntryValue(entry);
    const prior = [];
    for (let i = 0; i < aliasNames.length; i += 1) {
      const aliasName = String(aliasNames[i] || "").trim();
      if (!aliasName) {
        continue;
      }
      prior.push({
        name: aliasName,
        had: Object.prototype.hasOwnProperty.call(componentHost, aliasName),
        value: componentHost[aliasName],
      });
      componentHost[aliasName] = entryValue;
    }
    if (prior.length === 0) {
      prior.push({
        name: slotName,
        had: Object.prototype.hasOwnProperty.call(componentHost, slotName),
        value: componentHost[slotName],
      });
      componentHost[slotName] = entryValue;
    }
    const hadIndex = Object.prototype.hasOwnProperty.call(componentHost, "index");
    const prevIndex = componentHost.index;
    componentHost.index = Number(index) || 0;
    return function restoreRepeaterEntryBinding() {
      for (let i = 0; i < prior.length; i += 1) {
        const entryState = prior[i];
        if (!entryState || !entryState.name) {
          continue;
        }
        if (entryState.had) {
          componentHost[entryState.name] = entryState.value;
          continue;
        }
        try {
          delete componentHost[entryState.name];
        } catch (error) {
          componentHost[entryState.name] = undefined;
        }
      }
      if (hadIndex) {
        componentHost.index = prevIndex;
      } else {
        try {
          delete componentHost.index;
        } catch (error) {
          componentHost.index = undefined;
        }
      }
    };
  }

  function toRuntimeRepeaterPrimitiveEntries(values) {
    const list = Array.isArray(values) ? values : [];
    const out = [];
    for (let i = 0; i < list.length; i += 1) {
      const value = list[i];
      out.push({
        kind: "primitive",
        value: value,
        text: String(value == null ? "" : value),
      });
    }
    return out;
  }

  function readForExpressionSource(repeaterNode) {
    if (!repeaterNode || typeof repeaterNode !== "object") {
      return "";
    }
    if (
      repeaterNode.meta &&
      typeof repeaterNode.meta === "object" &&
      typeof repeaterNode.meta.sourceExpression === "string" &&
      repeaterNode.meta.sourceExpression.trim()
    ) {
      return repeaterNode.meta.sourceExpression.trim();
    }
    if (typeof repeaterNode.modelSource === "string" && repeaterNode.modelSource.trim()) {
      return repeaterNode.modelSource.trim();
    }
    if (
      repeaterNode.model &&
      typeof repeaterNode.model === "object" &&
      typeof repeaterNode.model.source === "string" &&
      repeaterNode.model.source.trim()
    ) {
      return repeaterNode.model.source.trim();
    }
    return "";
  }

  function resolveForIterableValues(modelValue) {
    if (modelValue == null) {
      return [];
    }
    if (modelValue === "") {
      return [];
    }
    if (modelValue && typeof modelValue === "object" && modelValue.__qhtmlIsQModel === true) {
      const mode = typeof modelValue.mode === "function" ? String(modelValue.mode() || "").trim().toLowerCase() : "";
      if (mode === "map" && typeof modelValue.keys === "function") {
        return modelValue.keys();
      }
      if (typeof modelValue.values === "function") {
        return modelValue.values();
      }
      if (typeof modelValue.toArray === "function") {
        return modelValue.toArray();
      }
      if (typeof modelValue.toObject === "function") {
        const objectValue = modelValue.toObject();
        return objectValue && typeof objectValue === "object" ? Object.keys(objectValue) : [];
      }
      return [];
    }
    if (
      typeof Symbol === "function" &&
      Symbol.iterator &&
      modelValue &&
      typeof modelValue !== "string" &&
      typeof modelValue[Symbol.iterator] === "function"
    ) {
      try {
        return Array.from(modelValue);
      } catch (ignoredIterableCoercionError) {
        // fall through to other coercions
      }
    }
    if (Array.isArray(modelValue)) {
      return modelValue.slice();
    }
    if (modelValue && typeof modelValue === "object") {
      if (typeof modelValue.toArray === "function") {
        const arrayValue = modelValue.toArray();
        return Array.isArray(arrayValue) ? arrayValue.slice() : [];
      }
      if (typeof modelValue.toObject === "function") {
        const objectValue = modelValue.toObject();
        return objectValue && typeof objectValue === "object" ? Object.keys(objectValue) : [];
      }
      return Object.keys(modelValue);
    }
    return [modelValue];
  }

  function tryResolveForExpressionFromComponentScope(sourceExpression, interpolationScope) {
    const source = String(sourceExpression || "").trim();
    if (!source) {
      return {
        matched: false,
        value: undefined,
      };
    }
    const scope = interpolationScope && typeof interpolationScope === "object" ? interpolationScope : null;
    const component = scope && scope.component ? scope.component : null;
    if (!component || (typeof component !== "object" && typeof component !== "function")) {
      return {
        matched: false,
        value: undefined,
      };
    }

    let path = "";
    if (source.indexOf("this.component.") === 0) {
      path = source.slice("this.component.".length);
    } else if (source.indexOf("component.") === 0) {
      path = source.slice("component.".length);
    } else if (/^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*(?:\(\))?)*$/.test(source)) {
      const firstDot = source.indexOf(".");
      const head = firstDot >= 0 ? source.slice(0, firstDot) : source;
      if (Object.prototype.hasOwnProperty.call(component, head) || typeof component[head] !== "undefined") {
        path = source;
      }
    }

    if (!path || !/^[A-Za-z_$][A-Za-z0-9_$]*(?:\(\))?(?:\.[A-Za-z_$][A-Za-z0-9_$]*(?:\(\))?)*$/.test(path)) {
      return {
        matched: false,
        value: undefined,
      };
    }

    const parts = path.split(".");
    let cursor = component;
    for (let i = 0; i < parts.length; i += 1) {
      const token = String(parts[i] || "").trim();
      if (!token) {
        return {
          matched: true,
          value: undefined,
        };
      }
      const isCall = token.length > 2 && token.slice(-2) === "()";
      const name = isCall ? token.slice(0, -2) : token;
      if (!name) {
        return {
          matched: true,
          value: undefined,
        };
      }
      if (cursor == null) {
        return {
          matched: true,
          value: undefined,
        };
      }
      const next = cursor[name];
      if (isCall) {
        if (typeof next !== "function") {
          return {
            matched: true,
            value: undefined,
          };
        }
        try {
          cursor = next.call(cursor);
        } catch (ignoredForPathCallError) {
          return {
            matched: true,
            value: undefined,
          };
        }
      } else {
        cursor = next;
      }
    }
    return {
      matched: true,
      value: cursor,
    };
  }

  function resolveForRuntimeModelEntries(repeaterNode, parent, context) {
    const sourceExpression = readForExpressionSource(repeaterNode);
    if (!sourceExpression) {
      const fallbackModelNode =
        core.NODE_TYPES.model &&
        repeaterNode &&
        repeaterNode.model &&
        typeof repeaterNode.model === "object" &&
        repeaterNode.model.kind === core.NODE_TYPES.model
          ? repeaterNode.model
          : null;
      return fallbackModelNode && Array.isArray(fallbackModelNode.entries)
        ? fallbackModelNode.entries
        : Array.isArray(repeaterNode && repeaterNode.modelEntries)
          ? repeaterNode.modelEntries
          : [];
    }
    const interpolationScope = buildInterpolationScope(context, parent);
    const thisArg =
      interpolationScope && interpolationScope.component
        ? interpolationScope.component
        : parent && parent.nodeType === 1
          ? parent
          : null;
    let modelValue;
    const fastResolved = tryResolveForExpressionFromComponentScope(sourceExpression, interpolationScope);
    if (fastResolved.matched) {
      modelValue = fastResolved.value;
    } else {
      modelValue = evaluateInlineReferenceExpression(
      sourceExpression,
      thisArg,
      interpolationScope,
      "qhtml for model source evaluation failed:",
      { pathFallbackLiteral: false }
    );
    }
    const iterableValues = resolveForIterableValues(modelValue);
    return toRuntimeRepeaterPrimitiveEntries(iterableValues);
  }

  function renderRepeaterNode(repeaterNode, parent, targetDocument, context) {
    const keyword = String(repeaterNode && repeaterNode.keyword || "").trim().toLowerCase();
    const isModelView = keyword === "q-model-view";
    const isFor = keyword === "for";
    const suppressModelViewWrapper = !!(context && context.suppressModelViewWrapper === true);

    function resolveModelViewInstanceMarker(node) {
      if (!(isModelView || isFor)) {
        return "";
      }
      if (node && node.meta && typeof node.meta === "object") {
        const preferred = String(node.meta[QDOM_UUID_META_KEY] || "").trim();
        if (preferred) {
          return preferred;
        }
      }
      if (core && typeof core.ensureNodeUuid === "function") {
        try {
          const ensured = String(core.ensureNodeUuid(node) || "").trim();
          if (ensured) {
            return ensured;
          }
        } catch (ignoredEnsureUuidError) {
          // fall through
        }
      }
      return ensureInstanceId(node);
    }

    function applyModelViewInstanceMarker(element, activeContext) {
      if (!element || element.nodeType !== 1) {
        return;
      }
      const marker =
        activeContext && typeof activeContext.modelViewInstanceMarker === "string"
          ? String(activeContext.modelViewInstanceMarker || "").trim()
          : "";
      if (!marker || !(isModelView || isFor)) {
        return;
      }
      element.setAttribute(Q_MODEL_VIEW_INSTANCE_ATTR, marker);
    }

    const modelViewInstanceMarker = resolveModelViewInstanceMarker(repeaterNode);
    let renderParent = parent;
    if (isModelView && !isFor && !suppressModelViewWrapper && parent && typeof parent.appendChild === "function") {
      const scopeElement = targetDocument.createElement(Q_MODEL_VIEW_SCOPE_TAG);
      if (modelViewInstanceMarker) {
        scopeElement.setAttribute(Q_MODEL_VIEW_INSTANCE_ATTR, modelViewInstanceMarker);
      }
      scopeElement.style.display = "contents";
      parent.appendChild(scopeElement);
      if (context && context.capture) {
        if (context.capture.nodeMap) {
          context.capture.nodeMap.set(scopeElement, repeaterNode);
        }
        if (context.capture.componentMap && context.componentHostStack.length > 0) {
          context.capture.componentMap.set(
            scopeElement,
            context.componentHostStack[context.componentHostStack.length - 1]
          );
        }
        if (context.capture.slotMap && context.slotStack.length > 0) {
          context.capture.slotMap.set(scopeElement, context.slotStack[context.slotStack.length - 1]);
        }
      }
      renderParent = scopeElement;
    }

    const modelNode =
      core.NODE_TYPES.model &&
      repeaterNode &&
      repeaterNode.model &&
      typeof repeaterNode.model === "object" &&
      repeaterNode.model.kind === core.NODE_TYPES.model
        ? repeaterNode.model
        : null;
    const modelEntries = isFor
      ? resolveForRuntimeModelEntries(repeaterNode, parent, context)
      : modelNode && Array.isArray(modelNode.entries)
        ? modelNode.entries
        : Array.isArray(repeaterNode && repeaterNode.modelEntries)
          ? repeaterNode.modelEntries
          : [];
    for (let i = 0; i < modelEntries.length; i += 1) {
      const entry = modelEntries[i];
      const expanded = materializeRepeaterTemplateNodes(repeaterNode, entry);
      const entryContext = createRepeaterRenderContext(context, repeaterNode, entry, i);
      if (modelViewInstanceMarker) {
        entryContext.modelViewInstanceMarker = modelViewInstanceMarker;
      }
      const restoreBinding = bindRepeaterEntryToComponentHost(entryContext, repeaterNode, entry, i);
      pushInstanceAliasScope(entryContext);
      try {
        for (let j = 0; j < expanded.length; j += 1) {
          // Mark all DOM created under this q-model-view instantiation scope.
          if (entryContext && typeof entryContext === "object") {
            entryContext.__applyModelViewMarker = applyModelViewInstanceMarker;
          }
          renderNode(expanded[j], renderParent, targetDocument, entryContext);
        }
      } finally {
        popInstanceAliasScope(entryContext);
        restoreBinding();
      }
    }
  }

  function buildInterpolationScope(context, fallbackNode) {
    const scope = {};
    mergeInstanceAliasesIntoScope(scope, context);
    if (
      context &&
      context[QCONTEXT_RUNTIME_FRAME_KEY] &&
      typeof context[QCONTEXT_RUNTIME_FRAME_KEY].toObject === "function"
    ) {
      const runtimeValues = context[QCONTEXT_RUNTIME_FRAME_KEY].toObject();
      const runtimeNames = Object.keys(runtimeValues);
      for (let i = 0; i < runtimeNames.length; i += 1) {
        const name = String(runtimeNames[i] || "").trim();
        if (!name) {
          continue;
        }
        scope[name] = runtimeValues[name];
      }
    }
    if (context && context.namedRuntimeValues && typeof context.namedRuntimeValues === "object") {
      const names = Object.keys(context.namedRuntimeValues);
      for (let i = 0; i < names.length; i += 1) {
        const name = String(names[i] || "").trim();
        if (!name) {
          continue;
        }
        scope[name] = context.namedRuntimeValues[name];
      }
    }
    if (context && context.inlineScope && typeof context.inlineScope === "object") {
      const keys = Object.keys(context.inlineScope);
      for (let i = 0; i < keys.length; i += 1) {
        const key = keys[i];
        scope[key] = context.inlineScope[key];
      }
    }
    scope.component = resolveComponentForInterpolation(context, fallbackNode);
    scope.componentQdom = resolveComponentQdomForInterpolation(context);
    scope.qhtml = typeof global.qhtml === "function" ? global.qhtml : createQHtmlFragmentToken;
    return scope;
  }

  function createChildRenderContext(context, overrides) {
    const next = Object.assign({}, context || {});
    const opts = overrides && typeof overrides === "object" ? overrides : null;
    next.inlineScope =
      context && context.inlineScope && typeof context.inlineScope === "object"
        ? Object.assign({}, context.inlineScope)
        : {};
    ensureContextFrames(next);
    if (opts && opts.scopeFrame && typeof opts.scopeFrame === "object") {
      next[QCONTEXT_SCOPE_FRAME_KEY] = opts.scopeFrame;
    }
    if (opts && opts.runtimeFrame && typeof opts.runtimeFrame === "object") {
      next[QCONTEXT_RUNTIME_FRAME_KEY] = opts.runtimeFrame;
    }
    ensureInstanceAliasScopeStack(next);
    return next;
  }

  function createProjectedSlotRenderContext(currentContext, sourceContext) {
    const current = currentContext && typeof currentContext === "object" ? currentContext : {};
    const source = sourceContext && typeof sourceContext === "object" ? sourceContext : null;
    if (!source) {
      return current;
    }
    const next = Object.assign({}, current);
    ensureContextFrames(next);
    if (source[QCONTEXT_SCOPE_FRAME_KEY] && typeof source[QCONTEXT_SCOPE_FRAME_KEY] === "object") {
      next[QCONTEXT_SCOPE_FRAME_KEY] = source[QCONTEXT_SCOPE_FRAME_KEY];
    }
    if (source[QCONTEXT_RUNTIME_FRAME_KEY] && typeof source[QCONTEXT_RUNTIME_FRAME_KEY] === "object") {
      next[QCONTEXT_RUNTIME_FRAME_KEY] = source[QCONTEXT_RUNTIME_FRAME_KEY];
    }
    next.inlineScope =
      source.inlineScope && typeof source.inlineScope === "object"
        ? Object.assign({}, source.inlineScope)
        : {};
    next.namedRuntimeValues =
      source.namedRuntimeValues && typeof source.namedRuntimeValues === "object"
        ? source.namedRuntimeValues
        : current.namedRuntimeValues || null;
    if (Array.isArray(source.instanceAliasScopeStack)) {
      next.instanceAliasScopeStack = source.instanceAliasScopeStack.slice();
    }
    if (Array.isArray(source.componentHostStack)) {
      next.componentHostStack = source.componentHostStack.slice();
    }
    if (Array.isArray(source.componentQdomStack)) {
      next.componentQdomStack = source.componentQdomStack.slice();
    }
    next.componentRegistry = current.componentRegistry;
    next.resolvedComponentRegistry = current.resolvedComponentRegistry;
    next.componentStack = Array.isArray(current.componentStack) ? current.componentStack : [];
    next.slotStack = Array.isArray(current.slotStack) ? current.slotStack : [];
    next.capture = current.capture || null;
    next.rootHostElement = current.rootHostElement || source.rootHostElement || null;
    next.disableComponentRuntime = !!(current.disableComponentRuntime || source.disableComponentRuntime);
    next.disableLifecycleHooks = !!(current.disableLifecycleHooks || source.disableLifecycleHooks || next.disableComponentRuntime);
    ensureInstanceAliasScopeStack(next);
    return next;
  }

  function isQStateMachineNode(node) {
    return !!(
      node &&
      typeof node === "object" &&
      node.meta &&
      node.meta.__qhtmlStateMachine &&
      typeof node.meta.__qhtmlStateMachine === "object"
    );
  }

  const QHTML_LAYOUT_TAGS = new Set(["q-layout", "q-row", "q-col"]);
  const QHTML_LAYOUT_DEFAULT_GAP = "12px";
  const QHTML_LAYOUT_DEFAULT_MIN_COL_WIDTH = "240px";
  const qLayoutResponsiveRows = new WeakMap();

  function isQLayoutTagName(tagName) {
    return QHTML_LAYOUT_TAGS.has(String(tagName || "").trim().toLowerCase());
  }

  function directLayoutChildren(element, tagName) {
    const wanted = String(tagName || "").trim().toLowerCase();
    const out = [];
    if (!element || !element.children || !wanted) {
      return out;
    }
    for (let i = 0; i < element.children.length; i += 1) {
      const child = element.children[i];
      if (String(child && child.tagName || "").trim().toLowerCase() === wanted) {
        out.push(child);
      }
    }
    return out;
  }

  function normalizeLayoutSizeValue(value, fallback) {
    if (value == null || value === "") {
      return typeof fallback === "undefined" ? "auto" : fallback;
    }
    const text = String(value).trim();
    if (!text) {
      return typeof fallback === "undefined" ? "auto" : fallback;
    }
    if (text === "fill") {
      return "minmax(0, 1fr)";
    }
    if (/^-?\d+(?:\.\d+)?$/.test(text)) {
      return text + "px";
    }
    return text;
  }

  function readLayoutAxis(element) {
    if (!element || element.nodeType !== 1) {
      return "";
    }
    const tagName = String(element.tagName || "").trim().toLowerCase();
    const explicit = String(element.getAttribute("axis") || element.getAttribute("flow") || "").trim().toLowerCase();
    if (explicit === "rows" || explicit === "row" || explicit === "vertical") {
      return "rows";
    }
    if (explicit === "cols" || explicit === "columns" || explicit === "column" || explicit === "horizontal") {
      return "cols";
    }
    const rows = directLayoutChildren(element, "q-row");
    const cols = directLayoutChildren(element, "q-col");
    if (rows.length > 0 && cols.length === 0) {
      return "rows";
    }
    if (cols.length > 0 && rows.length === 0) {
      return "cols";
    }
    if (tagName === "q-layout") {
      return "rows";
    }
    if (tagName === "q-row") {
      return "cols";
    }
    if (tagName === "q-col" && rows.length > 0) {
      return "rows";
    }
    if (tagName === "q-col" && cols.length > 0) {
      return "cols";
    }
    return "";
  }

  function readLayoutTrackValue(child, axis) {
    if (!child || child.nodeType !== 1) {
      return "auto";
    }
    const attrName = axis === "rows" ? "height" : "width";
    return normalizeLayoutSizeValue(child.getAttribute(attrName), "auto");
  }

  function readLayoutAttr(element, names) {
    if (!element || element.nodeType !== 1) {
      return "";
    }
    for (let i = 0; i < names.length; i += 1) {
      const value = element.getAttribute(names[i]);
      if (value != null && String(value).trim() !== "") {
        return String(value).trim();
      }
    }
    return "";
  }

  function isLayoutResponsiveStackDisabled(element) {
    const responsive = readLayoutAttr(element, ["responsive", "responsiveStack", "responsivestack", "responsive-stack"]);
    if (/^(0|false|off|no)$/i.test(responsive)) {
      return true;
    }
    const stack = readLayoutAttr(element, ["stack", "stackCols", "stackcols", "stack-cols"]);
    return /^(0|false|off|no|never)$/i.test(stack);
  }

  function parseLayoutLengthToPx(value, element, basis) {
    if (value == null || value === "") {
      return null;
    }
    const text = String(value).trim().toLowerCase();
    if (!text || text === "auto" || text === "normal" || text.indexOf("fr") !== -1) {
      return null;
    }
    const numeric = Number(text);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
    const match = text.match(/^(-?\d+(?:\.\d+)?)(px|rem|em|vw|vh|%)$/);
    if (!match) {
      return null;
    }
    const amount = Number(match[1]);
    if (!Number.isFinite(amount)) {
      return null;
    }
    const unit = match[2];
    if (unit === "px") {
      return amount;
    }
    if (unit === "vw" && global && global.innerWidth) {
      return global.innerWidth * amount / 100;
    }
    if (unit === "vh" && global && global.innerHeight) {
      return global.innerHeight * amount / 100;
    }
    if (unit === "%" && Number.isFinite(basis)) {
      return basis * amount / 100;
    }
    if ((unit === "rem" || unit === "em") && global && global.getComputedStyle) {
      const doc = element && element.ownerDocument ? element.ownerDocument : global.document;
      const target = unit === "rem" ? doc && doc.documentElement : element;
      const fontSize = target ? parseFloat(global.getComputedStyle(target).fontSize || "16") : 16;
      return amount * (Number.isFinite(fontSize) ? fontSize : 16);
    }
    return null;
  }

  function readLayoutGapPx(element) {
    if (!element || !global || typeof global.getComputedStyle !== "function") {
      return 0;
    }
    const computed = global.getComputedStyle(element);
    const gap = computed.columnGap || computed.gap || element.style.gap || QHTML_LAYOUT_DEFAULT_GAP;
    const px = parseLayoutLengthToPx(gap, element, element.getBoundingClientRect().width);
    return Number.isFinite(px) ? Math.max(0, px) : 0;
  }

  function readLayoutResponsiveMinColWidth(element, child, availableWidth) {
    const childMin = readLayoutAttr(child, ["minWidth", "minwidth", "min-width", "minColWidth", "mincolwidth", "min-col-width"]);
    const childWidth = readLayoutAttr(child, ["width"]);
    const rowMin = readLayoutAttr(element, ["minColWidth", "mincolwidth", "min-col-width", "responsiveMinColWidth", "responsivemincolwidth", "responsive-min-col-width"]);
    const candidates = [childMin, childWidth, rowMin, QHTML_LAYOUT_DEFAULT_MIN_COL_WIDTH];
    for (let i = 0; i < candidates.length; i += 1) {
      const px = parseLayoutLengthToPx(normalizeLayoutSizeValue(candidates[i], ""), child || element, availableWidth);
      if (Number.isFinite(px) && px > 0) {
        return px;
      }
    }
    return 240;
  }

  function shouldStackResponsiveQRow(element, children) {
    if (!element || String(element.tagName || "").trim().toLowerCase() !== "q-row" || !Array.isArray(children) || children.length < 2) {
      return false;
    }
    if (isLayoutResponsiveStackDisabled(element)) {
      return false;
    }
    const rect = typeof element.getBoundingClientRect === "function" ? element.getBoundingClientRect() : null;
    const availableWidth = rect && Number.isFinite(rect.width) && rect.width > 0 ? rect.width : element.clientWidth || 0;
    if (!availableWidth) {
      return false;
    }
    const stackAt = readLayoutAttr(element, ["stackAt", "stackat", "stack-at", "stackWidth", "stackwidth", "stack-width"]);
    if (stackAt) {
      const threshold = parseLayoutLengthToPx(stackAt, element, availableWidth);
      return Number.isFinite(threshold) && threshold > 0 && availableWidth < threshold;
    }
    const gap = readLayoutGapPx(element);
    let requiredWidth = gap * Math.max(0, children.length - 1);
    for (let i = 0; i < children.length; i += 1) {
      requiredWidth += readLayoutResponsiveMinColWidth(element, children[i], availableWidth);
    }
    return requiredWidth > availableWidth + 0.5;
  }

  function ensureQLayoutResponsiveObserver(element) {
    if (!element || String(element.tagName || "").trim().toLowerCase() !== "q-row") {
      return;
    }
    if (qLayoutResponsiveRows.has(element)) {
      return;
    }
    if (global && typeof global.ResizeObserver === "function") {
      const observer = new global.ResizeObserver(function onQLayoutResize() {
        applyQLayoutKeywordStyles(element);
      });
      observer.observe(element);
      qLayoutResponsiveRows.set(element, observer);
      return;
    }
    qLayoutResponsiveRows.set(element, true);
    if (global && typeof global.addEventListener === "function" && !global.__qhtmlLayoutResponsiveResizeListener) {
      global.__qhtmlLayoutResponsiveResizeListener = true;
      global.addEventListener("resize", function onQLayoutWindowResize() {
        relayoutQLayoutTree(global.document && global.document.documentElement);
      });
    }
  }

  function applyQLayoutKeywordStyles(element) {
    if (!element || element.nodeType !== 1 || !isQLayoutTagName(element.tagName)) {
      return;
    }
    const tagName = String(element.tagName || "").trim().toLowerCase();
    const style = element.style;
    style.boxSizing = style.boxSizing || "border-box";
    style.minWidth = style.minWidth || "0";
    style.minHeight = style.minHeight || "0";
    style.gap = element.getAttribute("gap") || style.gap || QHTML_LAYOUT_DEFAULT_GAP;

    const width = normalizeLayoutSizeValue(element.getAttribute("width"), "");
    const height = normalizeLayoutSizeValue(element.getAttribute("height"), "");
    if ((tagName === "q-layout" || tagName === "q-col") && width) {
      style.width = width;
    }
    if ((tagName === "q-layout" || tagName === "q-row" || tagName === "q-col") && height) {
      style.height = height;
    }

    const axis = readLayoutAxis(element);
    if (!axis) {
      if (tagName === "q-col") {
        style.display = style.display || "block";
      }
      return;
    }

    const children = axis === "rows" ? directLayoutChildren(element, "q-row") : directLayoutChildren(element, "q-col");
    style.display = "grid";
    if (axis === "rows") {
      style.gridTemplateRows = children.length > 0
        ? children.map(function mapRowTrack(child) { return readLayoutTrackValue(child, "rows"); }).join(" ")
        : "";
      style.gridTemplateColumns = "";
    } else {
      ensureQLayoutResponsiveObserver(element);
      const stacked = shouldStackResponsiveQRow(element, children);
      element.__qhtmlLayoutResponsiveStacked = stacked;
      style.gridTemplateColumns = stacked
        ? "minmax(0, 1fr)"
        : children.length > 0
        ? children.map(function mapColTrack(child) { return readLayoutTrackValue(child, "cols"); }).join(" ")
        : "";
      style.gridTemplateRows = "";
    }
  }

  function relayoutQLayoutTree(root) {
    if (!root || root.nodeType !== 1) {
      return root;
    }
    const nodes = [];
    if (isQLayoutTagName(root.tagName)) {
      nodes.push(root);
    }
    if (typeof root.querySelectorAll === "function") {
      const found = root.querySelectorAll("q-layout,q-row,q-col");
      for (let i = 0; i < found.length; i += 1) {
        nodes.push(found[i]);
      }
    }
    for (let i = nodes.length - 1; i >= 0; i -= 1) {
      applyQLayoutKeywordStyles(nodes[i]);
    }
    return root;
  }

  function installQLayoutDomApi(element) {
    if (!element || element.nodeType !== 1 || !isQLayoutTagName(element.tagName) || element.__qhtmlLayoutKeywordApi) {
      return element;
    }

    function indexOfLayoutChild(idx, length, insert) {
      if (idx === Infinity || idx === "inf" || idx === "infinity") {
        return insert ? length : Math.max(0, length - 1);
      }
      if (idx == null || idx === "") {
        return insert ? length : 0;
      }
      const parsed = Number(idx);
      if (!Number.isFinite(parsed)) {
        return insert ? length : 0;
      }
      if (parsed < 0) {
        return Math.max(0, length + parsed);
      }
      return Math.max(0, Math.min(insert ? length : Math.max(0, length - 1), parsed));
    }

    function setLayoutAttrs(target, attrs) {
      const input = attrs && typeof attrs === "object" && !Array.isArray(attrs) ? attrs : {};
      const keys = Object.keys(input);
      for (let i = 0; i < keys.length; i += 1) {
        const key = String(keys[i] || "").trim();
        if (key && input[key] != null) {
          target.setAttribute(key, String(input[key]));
        }
      }
    }

    function makeLayoutChild(owner, tagName, idx, attrs, text) {
      const doc = owner.ownerDocument || global.document;
      const child = doc.createElement(tagName);
      setLayoutAttrs(child, attrs);
      if (text != null) {
        child.textContent = String(text);
      }
      installQLayoutDomApi(child);
      const siblings = directLayoutChildren(owner, tagName);
      owner.insertBefore(child, siblings[indexOfLayoutChild(idx, siblings.length, true)] || null);
      relayoutQLayoutTree(owner);
      return child;
    }

    function removeLayoutChild(owner, tagName, idx) {
      const siblings = directLayoutChildren(owner, tagName);
      if (siblings.length === 0) {
        return null;
      }
      const child = siblings[indexOfLayoutChild(idx, siblings.length, false)];
      if (child && child.parentNode) {
        child.parentNode.removeChild(child);
        relayoutQLayoutTree(owner);
      }
      return child || null;
    }

    Object.defineProperties(element, {
      rows: { configurable: true, value: function rows() { return directLayoutChildren(this, "q-row").map(installQLayoutDomApi); } },
      row: { configurable: true, value: function row(idx) { const rows = this.rows(); return rows.length ? rows[indexOfLayoutChild(idx, rows.length, false)] : null; } },
      cols: { configurable: true, value: function cols() { return directLayoutChildren(this, "q-col").map(installQLayoutDomApi); } },
      col: { configurable: true, value: function col(idx) { const cols = this.cols(); return cols.length ? cols[indexOfLayoutChild(idx, cols.length, false)] : null; } },
      addRow: { configurable: true, value: function addRow(idx, attrs, text) { return makeLayoutChild(this, "q-row", idx, attrs, text); } },
      addCol: { configurable: true, value: function addCol(idx, attrs, text) { return makeLayoutChild(this, "q-col", idx, attrs, text); } },
      addLayout: { configurable: true, value: function addLayout(idx, attrs, text) { return makeLayoutChild(this, "q-layout", idx, attrs, text); } },
      removeRow: { configurable: true, value: function removeRow(idx) { return removeLayoutChild(this, "q-row", idx); } },
      removeCol: { configurable: true, value: function removeCol(idx) { return removeLayoutChild(this, "q-col", idx); } },
      relayout: { configurable: true, value: function relayout() { return relayoutQLayoutTree(this); } },
    });
    element.__qhtmlLayoutKeywordApi = true;
    return element;
  }

  function readInlineQStateMachineComponent(node) {
    return node &&
      node.meta &&
      node.meta.__qhtmlStateMachineComponent &&
      typeof node.meta.__qhtmlStateMachineComponent === "object"
        ? node.meta.__qhtmlStateMachineComponent
        : null;
  }

  function readQStateMachineConfig(node) {
    const meta = node && node.meta && typeof node.meta === "object" ? node.meta.__qhtmlStateMachine : null;
    const attrs = node && node.attributes && typeof node.attributes === "object" ? node.attributes : {};
    const props = node && node.props && typeof node.props === "object" ? node.props : {};
    const states = meta && Array.isArray(meta.states) ? meta.states : [];
    let initialState = String(meta && meta.initialState || props.state || attrs.state || "").trim();
    if (!initialState && states.length > 0) {
      initialState = String(states[0] && states[0].name || "").trim();
    }
    return {
      name: String(meta && meta.name || attrs["q-state-machine-name"] || "").trim(),
      initialState: initialState,
      states: states,
    };
  }

  function findQStateMachineState(config, stateName) {
    const name = String(stateName || "").trim();
    const states = config && Array.isArray(config.states) ? config.states : [];
    for (let i = 0; i < states.length; i += 1) {
      const state = states[i];
      if (String(state && state.name || "").trim() === name) {
        return state;
      }
    }
    return null;
  }

  function createSyntheticQStateMachineComponent(node, config) {
    const stateMachineConfig = config || readQStateMachineConfig(node);
    return core.createComponentNode({
      componentId: "q-state-machine",
      definitionType: "component",
      templateNodes: [],
      methods: [],
      propertyDefinitions: [],
      signalDeclarations: [
        {
          name: "statechanged",
          signature: "statechanged(value, previousValue, passing)",
          parameters: ["value", "previousValue", "passing"],
        },
      ],
      attributes: {},
      properties: ["state"],
      meta: {
        __qhtmlStateMachine: stateMachineConfig,
        __qhtmlStateMachineDefinition: true,
      },
    });
  }

  function createSyntheticQStateMachineInstance(node, config, componentNode) {
    const stateMachineConfig = config || readQStateMachineConfig(node);
    const attrs = Object.assign({}, node && node.attributes || {});
    const props = Object.assign({}, node && node.props || {});
    attrs["q-state-machine"] = "1";
    if (stateMachineConfig.name) {
      attrs["q-state-machine-name"] = stateMachineConfig.name;
    }
    if (!Object.prototype.hasOwnProperty.call(props, "state") && stateMachineConfig.initialState) {
      props.state = stateMachineConfig.initialState;
    }
    return core.createComponentInstanceNode({
      kind: core.NODE_TYPES.componentInstance,
      componentId: "q-state-machine",
      tagName: "q-state-machine",
      attributes: attrs,
      props: props,
      slots: [],
      children: [],
      selectorMode: "single",
      selectorChain: ["q-state-machine"],
      meta: Object.assign({}, node && node.meta || {}, {
        __qhtmlInstanceAlias: stateMachineConfig.name,
        __qhtmlStateMachine: stateMachineConfig,
        __qhtmlStateMachineComponent: componentNode,
      }),
    });
  }

  function renderQStateMachineNode(node, parent, targetDocument, context) {
    const config = readQStateMachineConfig(node);
    const inlineComponent = readInlineQStateMachineComponent(node) || createSyntheticQStateMachineComponent(node, config);
    const instanceNode =
      node.kind === core.NODE_TYPES.componentInstance || node.kind === core.NODE_TYPES.templateInstance
        ? node
        : createSyntheticQStateMachineInstance(node, config, inlineComponent);
    renderComponentInstance(inlineComponent, instanceNode, parent, targetDocument, context);
  }

  function parseCallableExpression(rawExpression) {
    const source = String(rawExpression || "").trim();
    if (!source) {
      return null;
    }
    const match = source.match(/^([A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*)\s*\(([\s\S]*)\)$/);
    if (!match) {
      return null;
    }
    return {
      source: source,
      callee: String(match[1] || "").trim(),
    };
  }

  function tryResolveDirectCallableValue(rawExpression, context, parent) {
    const parsed = parseCallableExpression(rawExpression);
    if (!parsed) {
      return { matched: false, found: false, value: undefined };
    }
    const calleeResolution = tryResolveDirectSymbolValue(parsed.callee, context, parent);
    if (!calleeResolution.matched || !calleeResolution.found || typeof calleeResolution.value !== "function") {
      return { matched: true, found: false, value: undefined };
    }
    const interpolationScope = buildInterpolationScope(context, parent);
    const thisArg =
      parent && parent.nodeType === 1
        ? parent
        : interpolationScope.component && interpolationScope.component.nodeType === 1
          ? interpolationScope.component
          : null;
    const inlineScope = resolveInlineExpressionScope(thisArg, interpolationScope);
    return {
      matched: true,
      found: true,
      value: evaluateInlineReferenceExpression(
        parsed.source,
        thisArg,
        inlineScope,
        "qhtml direct callable expression failed:"
      ),
    };
  }

  function registerCallbackDeclarationNode(node, parent, targetDocument, context) {
    if (!node || String(node.kind || "").trim().toLowerCase() !== Q_CALLBACK_NODE_KIND) {
      return false;
    }
    const callbackName = String(node.name || node.callbackId || "").trim();
    if (!callbackName || INVALID_METHOD_NAMES.has(callbackName)) {
      return true;
    }
    const body = String(node.body || "").trim();
    const parameterNames = Array.isArray(node.parameters)
      ? node.parameters.map(function mapName(entry) { return String(entry || "").trim(); }).filter(Boolean)
      : [];
    const paramsSource = parameterNames.join(", ");
    const hasInterpolatedBody = hasInlineReferenceExpressions(body);
    let compiled = null;
    if (!hasInterpolatedBody) {
      try {
        compiled = new Function(paramsSource, withScopedSelectorPrelude(body));
      } catch (error) {
        if (global.console && typeof global.console.error === "function") {
          global.console.error("qhtml callback declaration compile failed:", callbackName, error);
        }
        return true;
      }
    }
    const declaredScope = context && context.inlineScope && typeof context.inlineScope === "object"
      ? context.inlineScope
      : {};
    if (context && (!context.inlineScope || typeof context.inlineScope !== "object")) {
      context.inlineScope = declaredScope;
    }
    const creatorHost = resolveComponentForInterpolation(context, parent);
    const callbackExecutor = function callbackDeclarationExecutor() {
      const invocationHost =
        creatorHost && creatorHost.nodeType === 1
          ? resolveLiveComponentHostElement(creatorHost) || creatorHost
          : null;
      const invocationArgs = arguments;
      if (hasInterpolatedBody) {
        const interpolatedBody = interpolateInlineReferenceExpressions(
          body,
          invocationHost,
          {
            component: invocationHost,
            document: targetDocument || (invocationHost && invocationHost.ownerDocument) || global.document || null,
          },
          "qhtml callback interpolation failed:",
          { scriptLiteral: true }
        );
        try {
          ensureScopedSelectorShortcut(invocationHost || {}, null);
          const runtimeCallback = new Function(paramsSource, withScopedSelectorPrelude(interpolatedBody));
          return invokeWithRuntimeExecutionHost(invocationHost, function invokeInterpolatedCallback() {
            return runtimeCallback.apply(invocationHost || null, invocationArgs);
          });
        } catch (error) {
          if (global.console && typeof global.console.error === "function") {
            global.console.error("qhtml callback declaration compile failed:", callbackName, error);
          }
          return undefined;
        }
      }
      ensureScopedSelectorShortcut(invocationHost || {}, null);
      return invokeWithRuntimeExecutionHost(invocationHost, function invokeCompiledCallback() {
        return compiled.apply(invocationHost || null, invocationArgs);
      });
    };
    const wrapped = createQCallbackWrapper(callbackExecutor, {
      name: callbackName,
      creatorHost: creatorHost && creatorHost.nodeType === 1 ? creatorHost : null,
    });
    const resolvedCallback = wrapped && typeof wrapped === "function" ? wrapped : callbackExecutor;
    ensureContextFrames(context);
    const aliasStack = ensureInstanceAliasScopeStack(context);
    const activeFrame =
      aliasStack.length > 0
        ? aliasStack[aliasStack.length - 1]
        : context[QCONTEXT_SCOPE_FRAME_KEY];
    if (
      activeFrame &&
      typeof activeFrame.hasLocal === "function" &&
      activeFrame.hasLocal(callbackName)
    ) {
      throw new Error("Duplicate named callback in same scope: '" + callbackName + "'.");
    }
    if (activeFrame && typeof activeFrame.set === "function") {
      activeFrame.set(callbackName, resolvedCallback);
    }
    if (
      context &&
      context[QCONTEXT_RUNTIME_FRAME_KEY] &&
      typeof context[QCONTEXT_RUNTIME_FRAME_KEY].set === "function"
    ) {
      context[QCONTEXT_RUNTIME_FRAME_KEY].set(callbackName, resolvedCallback);
    }
    declaredScope[callbackName] = resolvedCallback;
    if (creatorHost) {
      exportNamedAliasToHost(creatorHost, callbackName, resolvedCallback);
    } else if (context && context.rootHostElement) {
      exportNamedAliasToHost(context.rootHostElement, callbackName, resolvedCallback);
    }
    registerNamedCallbackRuntime(callbackName, resolvedCallback);
    return true;
  }

  function readQVarNodeUuid(node) {
    if (!node || typeof node !== "object") {
      return "";
    }
    if (typeof node.uuid === "string" && node.uuid.trim()) {
      return node.uuid.trim();
    }
    if (node.meta && typeof node.meta === "object") {
      if (typeof node.meta[QDOM_UUID_META_KEY] === "string" && node.meta[QDOM_UUID_META_KEY].trim()) {
        return node.meta[QDOM_UUID_META_KEY].trim();
      }
      if (typeof node.meta.uuid === "string" && node.meta.uuid.trim()) {
        return node.meta.uuid.trim();
      }
    }
    if (typeof core.ensureNodeUuid === "function") {
      try {
        const ensured = core.ensureNodeUuid(node);
        if (ensured && ensured.meta && typeof ensured.meta[QDOM_UUID_META_KEY] === "string") {
          return ensured.meta[QDOM_UUID_META_KEY].trim();
        }
      } catch (error) {
        // no-op
      }
    }
    return "";
  }

  function evaluateQVarBody(node, ownerHost, context) {
    const body = String(node && node.body || "").trim();
    if (!body) {
      return undefined;
    }
    const thisArg = ownerHost && ownerHost.nodeType === 1 ? ownerHost : null;
    const interpolationScope = buildInterpolationScope(context, thisArg);
    const scopeNames = Object.keys(interpolationScope).filter(function filterQVarScopeParam(name) {
      return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(String(name || ""));
    });
    const scopeValues = scopeNames.map(function mapQVarScopeParam(name) {
      return readQVarHandleValue(interpolationScope[name]);
    });
    try {
      const expressionExecutor = new Function(scopeNames.join(","), "return (" + body + ");");
      return expressionExecutor.apply(thisArg, scopeValues);
    } catch (expressionError) {
      try {
        const bodyExecutor = new Function(scopeNames.join(","), body);
        return bodyExecutor.apply(thisArg, scopeValues);
      } catch (bodyError) {
        if (global.console && typeof global.console.error === "function") {
          global.console.error("qhtml q-var evaluation failed:", String(node && node.name || ""), bodyError);
        }
        return undefined;
      }
    }
  }

  function ensureQVarState(node, ownerHost, context) {
    const uuid = readQVarNodeUuid(node) || String(node && node.name || "");
    let state = qVarRuntimeStateByUuid.get(uuid);
    if (!state) {
      state = {
        uuid: uuid,
        name: String(node && node.name || "").trim(),
        owner: ownerHost && ownerHost.nodeType === 1 ? ownerHost : null,
        value: undefined,
        previousValue: undefined,
        initialized: false,
        evaluating: false,
        changed: null,
        handle: null,
        node: node,
        context: context,
        body: String(node && node.body || ""),
      };
      state.changed = createQVarSignal("changed", ownerHost || null);
      state.handle = createQVarHandle(state);
      qVarRuntimeStateByUuid.set(uuid, state);
    }
    state.name = String(node && node.name || state.name || "").trim();
    state.owner = ownerHost && ownerHost.nodeType === 1 ? ownerHost : state.owner || null;
    state.node = node;
    state.context = context;
    const nextBody = String(node && node.body || "");
    if (state.body !== nextBody) {
      state.body = nextBody;
      state.value = undefined;
      state.previousValue = undefined;
      state.initialized = false;
      state.evaluating = false;
    }
    return state;
  }

  function registerQVarHandleInContext(name, handle, ownerHost, context) {
    const key = String(name || "").trim();
    if (!key) {
      return;
    }
    ensureContextFrames(context);
    const aliasStack = ensureInstanceAliasScopeStack(context);
    const activeFrame =
      aliasStack.length > 0
        ? aliasStack[aliasStack.length - 1]
        : context[QCONTEXT_SCOPE_FRAME_KEY];
    if (activeFrame && typeof activeFrame.set === "function") {
      activeFrame.set(key, handle);
    }
    if (context[QCONTEXT_RUNTIME_FRAME_KEY] && typeof context[QCONTEXT_RUNTIME_FRAME_KEY].set === "function") {
      context[QCONTEXT_RUNTIME_FRAME_KEY].set(key, handle);
    }
    if (context && context.namedRuntimeValues && typeof context.namedRuntimeValues === "object") {
      context.namedRuntimeValues[key] = handle;
    }
    if (ownerHost && ownerHost.nodeType === 1) {
      exportNamedAliasToHost(ownerHost, key, handle);
      try {
        Object.defineProperty(ownerHost, key, {
          configurable: true,
          enumerable: true,
          get: function getOwnedQVarValue() {
            return handle.value;
          },
          set: function setOwnedQVarValue(next) {
            handle.value = next;
          },
        });
      } catch (error) {
        // If the host already has a fixed property, the scoped handle still works.
      }
    } else if (context && context.rootHostElement) {
      exportNamedAliasToHost(context.rootHostElement, key, handle);
      try {
        Object.defineProperty(context.rootHostElement, key, {
          configurable: true,
          enumerable: true,
          get: function getRootQVarValue() {
            return handle.value;
          },
          set: function setRootQVarValue(next) {
            handle.value = next;
          },
        });
      } catch (error) {
        // If the host already has a fixed property, the scoped handle still works.
      }
    }
  }

  function registerQVarDeclarationNode(node, parent, targetDocument, context, ownerHostOverride) {
    if (!node || String(node.kind || "").trim().toLowerCase() !== Q_VAR_NODE_KIND) {
      return false;
    }
    const name = String(node.name || "").trim();
    if (!name) {
      return true;
    }
    const stackOwner =
      context && Array.isArray(context.componentHostStack) && context.componentHostStack.length > 0
        ? context.componentHostStack[context.componentHostStack.length - 1]
        : null;
    const parentOwner =
      parent && parent.nodeType === 1 && typeof parent.closest === "function"
        ? parent.closest("[qhtml-component-instance='1']")
        : null;
    const ownerHost =
      ownerHostOverride && ownerHostOverride.nodeType === 1
        ? ownerHostOverride
        : parentOwner || stackOwner || (context && context.rootHostElement && context.rootHostElement.nodeType === 1 ? context.rootHostElement : null);
    const state = ensureQVarState(node, ownerHost, context);
    registerQVarHandleInContext(name, state.handle, ownerHost, context);
    return true;
  }

  function normalizeQTimerNodeDefinition(node) {
    const timerId = String(node && (node.timerId || node.name || node.id) || "").trim();
    if (!timerId) {
      return null;
    }
    const interval = Number(node && node.interval);
    return {
      timerId: timerId,
      interval: Number.isFinite(interval) && interval >= 0 ? Math.floor(interval) : 0,
      repeat: !node || node.repeat !== false,
      running: !node || node.running !== false,
      onTimeout: String(node && node.onTimeout || ""),
    };
  }

  function resolveContextOwnerHost(parent, context, ownerHostOverride) {
    if (ownerHostOverride && ownerHostOverride.nodeType === 1) {
      return ownerHostOverride;
    }
    const stackOwner =
      context && Array.isArray(context.componentHostStack) && context.componentHostStack.length > 0
        ? context.componentHostStack[context.componentHostStack.length - 1]
        : null;
    if (stackOwner && stackOwner.nodeType === 1) {
      return stackOwner;
    }
    if (context && context.rootHostElement && context.rootHostElement.nodeType === 1) {
      return context.rootHostElement;
    }
    if (parent && parent.nodeType === 1) {
      return parent;
    }
    return null;
  }

  function registerNamedRuntimeValueInContext(name, value, ownerHost, context) {
    const key = String(name || "").trim();
    if (!key) {
      return;
    }
    ensureContextFrames(context);
    const aliasStack = ensureInstanceAliasScopeStack(context);
    const activeFrame =
      aliasStack.length > 0
        ? aliasStack[aliasStack.length - 1]
        : context[QCONTEXT_SCOPE_FRAME_KEY];
    if (activeFrame && typeof activeFrame.set === "function") {
      activeFrame.set(key, value);
    }
    if (context[QCONTEXT_RUNTIME_FRAME_KEY] && typeof context[QCONTEXT_RUNTIME_FRAME_KEY].set === "function") {
      context[QCONTEXT_RUNTIME_FRAME_KEY].set(key, value);
    }
    if (ownerHost && ownerHost.nodeType === 1) {
      exportNamedAliasToHost(ownerHost, key, value);
    } else if (context && context.rootHostElement) {
      exportNamedAliasToHost(context.rootHostElement, key, value);
      if (context.namedRuntimeValues && typeof context.namedRuntimeValues === "object") {
        context.namedRuntimeValues[key] = value;
      }
    }
  }

  function evaluateQSwitchCaseBody(body, ownerHost, context, inputValue) {
    const source = String(body || "").trim();
    if (!source) {
      return undefined;
    }
    const thisArg = ownerHost && ownerHost.nodeType === 1 ? ownerHost : null;
    const interpolationScope = buildInterpolationScope(context, thisArg);
    interpolationScope.item = inputValue;
    interpolationScope.value = inputValue;
    const scopeNames = Object.keys(interpolationScope).filter(function filterQSwitchScopeParam(name) {
      return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(String(name || ""));
    });
    const scopeValues = scopeNames.map(function mapQSwitchScopeParam(name) {
      return readQVarHandleValue(interpolationScope[name]);
    });
    try {
      const expressionExecutor = new Function(scopeNames.join(","), "return (" + source + ");");
      return expressionExecutor.apply(thisArg, scopeValues);
    } catch (expressionError) {
      try {
        const bodyExecutor = new Function(scopeNames.join(","), source);
        return bodyExecutor.apply(thisArg, scopeValues);
      } catch (bodyError) {
        if (global.console && typeof global.console.error === "function") {
          global.console.error("qhtml q-switch evaluation failed:", bodyError);
        }
        return undefined;
      }
    }
  }

  function createQSwitchFunction(node, ownerHost, context) {
    const cases = Array.isArray(node && node.cases) ? node.cases.slice() : [];
    const byKey = Object.create(null);
    for (let i = 0; i < cases.length; i += 1) {
      const entry = cases[i] && typeof cases[i] === "object" ? cases[i] : {};
      const key = String(entry.key || "");
      if (!key && key !== "") {
        continue;
      }
      byKey[key] = entry;
    }
    return function qSwitchRuntimeLookup(inputValue) {
      const key = String(inputValue);
      const selected = Object.prototype.hasOwnProperty.call(byKey, key)
        ? byKey[key]
        : Object.prototype.hasOwnProperty.call(byKey, "*")
          ? byKey["*"]
          : null;
      if (!selected) {
        return undefined;
      }
      return evaluateQSwitchCaseBody(selected.body, ownerHost, context, inputValue);
    };
  }

  function registerQSwitchDeclarationNode(node, parent, targetDocument, context, ownerHostOverride) {
    if (!node || String(node.kind || "").trim().toLowerCase() !== Q_SWITCH_NODE_KIND) {
      return false;
    }
    const name = String(node.name || "").trim();
    if (!name) {
      return true;
    }
    const ownerHost = resolveContextOwnerHost(parent, context, ownerHostOverride);
    const switchFn = createQSwitchFunction(node, ownerHost, context);
    registerNamedRuntimeValueInContext(name, switchFn, ownerHost, context);
    return true;
  }

  function registerQTimerDeclarationNode(node, parent, targetDocument, context, ownerHostOverride) {
    if (!node || String(node.kind || "").trim().toLowerCase() !== Q_TIMER_NODE_KIND) {
      return false;
    }
    const timerDefinition = normalizeQTimerNodeDefinition(node);
    if (!timerDefinition) {
      return true;
    }
    ensureContextFrames(context);
    const ownerHost = resolveContextOwnerHost(parent, context, ownerHostOverride);
    if (!ownerHost) {
      return true;
    }
    const runtimeApi = global.QHtml && typeof global.QHtml === "object" ? global.QHtml : null;
    bindSingleComponentTimer(
      timerDefinition,
      { componentId: String(ownerHost.tagName || "q-html").trim().toLowerCase() },
      ownerHost,
      targetDocument || ownerHost.ownerDocument || global.document || null,
      runtimeApi,
      context[QCONTEXT_SCOPE_FRAME_KEY],
      context[QCONTEXT_RUNTIME_FRAME_KEY]
    );
    return true;
  }

  function renderQHtmlFragmentToken(value, parent, targetDocument, context) {
    if (!isQHtmlFragmentToken(value)) {
      return false;
    }
    const source = coerceQHtmlFragmentSource(value.source);
    if (!source.trim()) {
      return true;
    }
    if (!parser || typeof parser.parseQHtmlToQDom !== "function") {
      parent.appendChild(targetDocument.createTextNode(source));
      return true;
    }
    try {
      const fragmentDoc = parser.parseQHtmlToQDom(source);
      const nodes = fragmentDoc && Array.isArray(fragmentDoc.nodes) ? fragmentDoc.nodes : [];
      for (let i = 0; i < nodes.length; i += 1) {
        const nodeClone = cloneNodeDeep(nodes[i]);
        refreshQDomNodeUuidsDeep(nodeClone);
        stripQDomSourceRefsDeep(nodeClone);
        renderNode(nodeClone, parent, targetDocument, context);
      }
    } catch (error) {
      if (global.console && typeof global.console.error === "function") {
        global.console.error("qhtml fragment render failed:", error);
      }
      parent.appendChild(targetDocument.createTextNode(source));
    }
    return true;
  }

  function createPathResolutionContext(existingContext) {
    if (existingContext && typeof existingContext === "object") {
      return existingContext;
    }
    return {
      seenUuids: new Set(),
      seenObjects: typeof WeakSet === "function" ? new WeakSet() : [],
      cycleDetected: false,
      cycleToken: "",
      cycleNode: null,
    };
  }

  function readResolverNodeUuid(value) {
    if (!value || (typeof value !== "object" && typeof value !== "function")) {
      return "";
    }
    if (value.meta && typeof value.meta === "object") {
      const fromMetaPreferred =
        typeof value.meta[QDOM_UUID_META_KEY] === "string" ? String(value.meta[QDOM_UUID_META_KEY] || "").trim() : "";
      if (fromMetaPreferred) {
        return fromMetaPreferred;
      }
      const fromMetaLegacy = typeof value.meta.uuid === "string" ? String(value.meta.uuid || "").trim() : "";
      if (fromMetaLegacy) {
        return fromMetaLegacy;
      }
    }
    if (value.nodeType === 1) {
      const hostUuid = readHostQDomUuid(value);
      if (hostUuid) {
        return hostUuid;
      }
    }
    if (typeof value[QDOM_UUID_META_KEY] === "string") {
      return String(value[QDOM_UUID_META_KEY] || "").trim();
    }
    if (typeof value.uuid === "string") {
      return String(value.uuid || "").trim();
    }
    return "";
  }

  function markPathResolutionVisit(value, resolutionContext) {
    if (!value || (typeof value !== "object" && typeof value !== "function")) {
      return false;
    }
    const context = createPathResolutionContext(resolutionContext);
    const uuid = readResolverNodeUuid(value);
    if (uuid) {
      if (context.seenUuids.has(uuid)) {
        context.cycleDetected = true;
        context.cycleToken = uuid;
        context.cycleNode = value;
        return true;
      }
      context.seenUuids.add(uuid);
      return false;
    }
    if (context.seenObjects && typeof context.seenObjects.has === "function" && typeof context.seenObjects.add === "function") {
      if (context.seenObjects.has(value)) {
        context.cycleDetected = true;
        context.cycleNode = value;
        return true;
      }
      context.seenObjects.add(value);
      return false;
    }
    if (Array.isArray(context.seenObjects)) {
      for (let i = 0; i < context.seenObjects.length; i += 1) {
        if (context.seenObjects[i] === value) {
          context.cycleDetected = true;
          context.cycleNode = value;
          return true;
        }
      }
      context.seenObjects.push(value);
    }
    return false;
  }

  function readPathValueFromBase(base, pathParts, resolutionContext) {
    const context = createPathResolutionContext(resolutionContext);
    let cursor = base;
    if (typeof cursor === "undefined") {
      return { found: false, value: undefined, cycle: false };
    }
    if (markPathResolutionVisit(cursor, context)) {
      return { found: false, value: undefined, cycle: true };
    }

    function readQModelPathSegment(modelValue, key) {
      if (!modelValue || typeof modelValue !== "object" || modelValue.__qhtmlIsQModel !== true) {
        return { matched: false, found: false, value: undefined };
      }
      let mode = "";
      try {
        mode = typeof modelValue.mode === "function" ? String(modelValue.mode() || "").trim().toLowerCase() : "";
      } catch (modeError) {
        mode = "";
      }

      if (mode === "map") {
        try {
          if (typeof modelValue.value === "function") {
            const mapValue = modelValue.value(key);
            if (typeof mapValue !== "undefined") {
              return { matched: true, found: true, value: mapValue };
            }
          }
          if (typeof modelValue.toObject === "function") {
            const objectValue = modelValue.toObject();
            if (objectValue && typeof objectValue === "object" && Object.prototype.hasOwnProperty.call(objectValue, key)) {
              return { matched: true, found: true, value: objectValue[key] };
            }
          }
        } catch (mapReadError) {
          return { matched: true, found: false, value: undefined };
        }
        return { matched: true, found: false, value: undefined };
      }

      if (mode === "array") {
        if (!/^-?\d+$/.test(key)) {
          return { matched: true, found: false, value: undefined };
        }
        const index = Number(key);
        try {
          if (typeof modelValue.at === "function") {
            const itemAt = modelValue.at(index);
            if (typeof itemAt !== "undefined") {
              return { matched: true, found: true, value: itemAt };
            }
          }
          if (typeof modelValue.value === "function") {
            const itemValue = modelValue.value(index);
            if (typeof itemValue !== "undefined") {
              return { matched: true, found: true, value: itemValue };
            }
          }
        } catch (arrayReadError) {
          return { matched: true, found: false, value: undefined };
        }
        return { matched: true, found: false, value: undefined };
      }

      return { matched: false, found: false, value: undefined };
    }

    const parts = Array.isArray(pathParts) ? pathParts : [];
    for (let i = 0; i < parts.length; i += 1) {
      if (cursor == null) {
        return { found: false, value: undefined, cycle: false };
      }
      const key = String(parts[i] || "").trim();
      if (!key) {
        return { found: false, value: undefined, cycle: false };
      }
      if (isOwnerTypeSymbolHandle(cursor)) {
        const ownerTypeName = readOwnerTypeSymbolName(cursor);
        if (ownerTypeName && key === ownerTypeName) {
          const parentOwner = readOwnerTypeParentHandle(cursor);
          cursor = parentOwner || cursor;
          if (markPathResolutionVisit(cursor, context)) {
            return { found: false, value: undefined, cycle: true };
          }
          continue;
        }
      }
      const qModelResolved = readQModelPathSegment(cursor, key);
      if (qModelResolved.matched) {
        if (!qModelResolved.found) {
          return { found: false, value: undefined, cycle: false };
        }
        cursor = qModelResolved.value;
        if (markPathResolutionVisit(cursor, context)) {
          return { found: false, value: undefined, cycle: true };
        }
        continue;
      }
      let nextValue;
      try {
        nextValue = cursor[key];
      } catch (error) {
        return { found: false, value: undefined, cycle: false };
      }
      if (typeof nextValue === "undefined") {
        return { found: false, value: undefined, cycle: false };
      }
      cursor = nextValue;
      if (markPathResolutionVisit(cursor, context)) {
        return { found: false, value: undefined, cycle: true };
      }
    }
    return { found: true, value: cursor, cycle: false };
  }

  function tryResolveDirectSymbolValue(rawExpression, context, parent, resolutionContext) {
    const expression = String(rawExpression || "").trim();
    if (!expression) {
      return { matched: false, found: false, value: undefined };
    }
    const simplePathPattern = /^(?:this\.component\.|component\.|this\.)?[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/;
    if (!simplePathPattern.test(expression)) {
      return { matched: false, found: false, value: undefined };
    }
    const scope = buildInterpolationScope(context, parent);
    const componentSource = resolveInlineComponentSource(parent, scope);
    const source = expression;
    if (source.indexOf("this.component.") === 0) {
      return Object.assign(
        { matched: true },
        readPathValueFromBase(componentSource, source.slice("this.component.".length).split("."), resolutionContext)
      );
    }
    if (source.indexOf("component.") === 0) {
      return Object.assign(
        { matched: true },
        readPathValueFromBase(componentSource, source.slice("component.".length).split("."), resolutionContext)
      );
    }
    if (source.indexOf("this.") === 0) {
      return Object.assign(
        { matched: true },
        readPathValueFromBase(parent && parent.nodeType === 1 ? parent : null, source.slice("this.".length).split("."), resolutionContext)
      );
    }
    if (source.indexOf(".") !== -1) {
      return { matched: true, found: false, value: undefined };
    }
    const resolvedPath = readCandidatePathFromScope(source, scope, parent, componentSource, resolutionContext);
    return { matched: true, found: !!resolvedPath.found, value: resolvedPath.value, cycle: !!resolvedPath.cycle };
  }

  function renderNode(node, parent, targetDocument, context) {
    if (!node || typeof node !== "object") {
      return;
    }
    const projectedSlotContext = node[RENDER_SLOT_CONTEXT] || null;
    if (projectedSlotContext && projectedSlotContext !== context) {
      context = createProjectedSlotRenderContext(context, projectedSlotContext);
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

      if (core.NODE_TYPES.repeater && node.kind === core.NODE_TYPES.repeater) {
        renderRepeaterNode(node, parent, targetDocument, context);
        return;
      }

      if (String(node.kind || "").trim().toLowerCase() === Q_CALLBACK_NODE_KIND) {
        registerCallbackDeclarationNode(node, parent, targetDocument, context);
        return;
      }

      if (String(node.kind || "").trim().toLowerCase() === Q_VAR_NODE_KIND) {
        registerQVarDeclarationNode(node, parent, targetDocument, context);
        return;
      }

      if (String(node.kind || "").trim().toLowerCase() === Q_SWITCH_NODE_KIND) {
        registerQSwitchDeclarationNode(node, parent, targetDocument, context);
        return;
      }

      if (String(node.kind || "").trim().toLowerCase() === Q_TIMER_NODE_KIND) {
        if (context.disableComponentRuntime) {
          return;
        }
        registerQTimerDeclarationNode(node, parent, targetDocument, context);
        return;
      }

      if (core.NODE_TYPES.text && node.kind === core.NODE_TYPES.text) {
        let textValue = String(node.value || "");
        if (hasInlineReferenceExpressions(textValue)) {
          textValue = interpolateInlineReferenceExpressions(
            textValue,
            parent && parent.nodeType === 1 ? parent : null,
            buildInterpolationScope(context, parent),
            "qhtml text interpolation failed:"
          );
        } else {
          const callableReference = tryResolveDirectCallableValue(textValue, context, parent);
          if (callableReference.matched && callableReference.found) {
            if (renderQHtmlFragmentToken(callableReference.value, parent, targetDocument, context)) {
              return;
            }
            textValue = String(callableReference.value == null ? "" : callableReference.value);
          } else {
            const directReference = tryResolveDirectSymbolValue(textValue, context, parent);
            if (directReference.matched && directReference.found) {
              if (renderQHtmlFragmentToken(directReference.value, parent, targetDocument, context)) {
                return;
              }
              textValue = String(directReference.value == null ? "" : directReference.value);
            }
          }
        }
        parent.appendChild(targetDocument.createTextNode(textValue));
        return;
      }

      if (node.kind === core.NODE_TYPES.component) {
        const componentId = String(node.componentId || "").trim().toLowerCase();
        if (componentId && context && context.componentRegistry instanceof Map) {
          context.componentRegistry.set(componentId, node);
        }
        return;
      }

      if (core.NODE_TYPES.struct && node.kind === core.NODE_TYPES.struct) {
        const structId = String(node.structId || node.componentId || "").trim().toLowerCase();
        if (structId && context && context.componentRegistry instanceof Map) {
          context.componentRegistry.set(structId, node);
        }
        return;
      }

      if (core.NODE_TYPES.structInstance && node.kind === core.NODE_TYPES.structInstance) {
        const registry = context.componentRegistry;
        const key = String(node.structId || node.componentId || node.tagName || "").toLowerCase();
        const structNode = registry && typeof registry.get === "function" ? registry.get(key) : null;
        if (structNode && core.NODE_TYPES.struct && structNode.kind === core.NODE_TYPES.struct) {
          renderStructInstance(structNode, node, parent, targetDocument, context);
        }
        return;
      }

      if (node.kind === core.NODE_TYPES.componentInstance || node.kind === core.NODE_TYPES.templateInstance) {
        if (isQStateMachineNode(node)) {
          renderQStateMachineNode(node, parent, targetDocument, context);
          return;
        }
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

      if (isQStateMachineNode(node)) {
        renderQStateMachineNode(node, parent, targetDocument, context);
        return;
	      }
	
	      const tagName = String(node.tagName || "div").toLowerCase();
	      const isLayoutKeywordElement = isQLayoutTagName(tagName);
	      const registry = context.componentRegistry;
	      const component = registry.get(tagName);
	
	      if (component && !isLayoutKeywordElement) {
	        if (core.NODE_TYPES.struct && component.kind === core.NODE_TYPES.struct) {
	          renderStructInstance(component, createStructInstanceNodeFromElement(node, component), parent, targetDocument, context);
	          return;
	        }
	        renderComponentInstance(component, node, parent, targetDocument, context);
	        return;
	      }
	
	      const element = targetDocument.createElement(tagName);
	      if (isLayoutKeywordElement) {
	        installQLayoutDomApi(element);
	      }
      bindRuntimeContextToTarget(
        element,
        context[QCONTEXT_SCOPE_FRAME_KEY],
        context[QCONTEXT_RUNTIME_FRAME_KEY]
      );
      if (
        context &&
        typeof context.__applyModelViewMarker === "function"
      ) {
        context.__applyModelViewMarker(element, context);
      }
      const interpolationScope = buildInterpolationScope(context, parent);
      const interpolationComponent = interpolationScope.component || null;
      setElementAttributes(element, node.attributes, {
        thisArg: element,
        scope: interpolationScope,
        eventAttributeParameters:
          node && node.meta && node.meta.__qhtmlEventAttributeParams
            ? node.meta.__qhtmlEventAttributeParams
            : null,
        eventAttributeThen:
          node && node.meta && node.meta.__qhtmlEventAttributeThen
            ? node.meta.__qhtmlEventAttributeThen
            : null,
      });
      parent.appendChild(element);
      if (
        node &&
        node.meta &&
        Array.isArray(node.meta.__qhtmlStylePathAnimations)
      ) {
        applyPathAnimationsToElement(element, node.meta.__qhtmlStylePathAnimations, targetDocument);
      }
      if (!context.disableComponentRuntime) {
        attachQBehaviorsToTarget(element, node);
        initializeBehaviorTargetProperties(element, node);
      }

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
            buildInterpolationScope(context, element),
            "qhtml text interpolation failed:"
          );
        }
        element.appendChild(targetDocument.createTextNode(textContent));
      }

	      if (Array.isArray(node.children)) {
	        const childContext = createChildRenderContext(context);
	        for (let i = 0; i < node.children.length; i += 1) {
	          renderNode(node.children[i], element, targetDocument, childContext);
	        }
	      }
	      applyRuntimeThemeRulesToHost(element, node);
	      registerQAnchorTarget(element, node, context);
	      if (isLayoutKeywordElement) {
	        relayoutQLayoutTree(element);
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
    if (stack.indexOf(key) !== -1 && !isProjectedSlotNode(instanceNode) && !isInsideProjectedSlotContext(context)) {
      throw new Error("Recursive q-component usage detected for '" + key + "'.");
    }
    registerNamedInstanceAlias(context, componentNode, componentNode, instanceNode);

    const templateNodes = Array.isArray(componentNode.templateNodes) ? componentNode.templateNodes : [];
    const singleSlotName = resolveSingleSlotName(componentNode);
    const slotNames = collectSlotNames(templateNodes);
    collectSlotNames(readRendererSlotDefaultNodes(componentNode), slotNames);
    const ownerInstanceId = ensureInstanceId(instanceNode);
    const slotFills = splitSlotFills(instanceNode, {
      singleSlotName: singleSlotName,
      slotNames: slotNames,
      ownerComponentId: String(componentNode.componentId || "").trim().toLowerCase(),
      ownerDefinitionType: inferDefinitionType(componentNode),
      ownerInstanceId: ownerInstanceId,
      sourceContext: context,
    });
    const slotDefaults = buildSlotDefaultFills(componentNode);
    const expanded = materializeSlots(templateNodes, slotFills, slotDefaults);

    stack.push(key);
    const contentContext = createChildRenderContext(context);
    try {
      for (let i = 0; i < expanded.length; i += 1) {
        renderNode(expanded[i], parent, targetDocument, contentContext);
      }
    } finally {
      stack.pop();
    }
  }

  function readQStateMachineActiveStateName(componentNode, instanceNode, hostElement) {
    const config = readQStateMachineConfig(componentNode);
    const fromHost =
      hostElement && Object.prototype.hasOwnProperty.call(hostElement, "state")
        ? hostElement.state
        : undefined;
    const props = instanceNode && instanceNode.props && typeof instanceNode.props === "object" ? instanceNode.props : {};
    const fromProps = Object.prototype.hasOwnProperty.call(props, "state") ? props.state : undefined;
    const activeState = String(
      typeof fromProps !== "undefined"
        ? fromProps
        : typeof fromHost !== "undefined"
          ? fromHost
          : config.initialState || ""
    ).trim();
    return activeState || String(config.initialState || "").trim();
  }

  function readQStateMachineTemplateNodes(componentNode, instanceNode, hostElement) {
    if (!componentNode || !componentNode.meta || !componentNode.meta.__qhtmlStateMachine) {
      return null;
    }
    const config = readQStateMachineConfig(componentNode);
    const activeState = readQStateMachineActiveStateName(componentNode, instanceNode, hostElement);
    const state = findQStateMachineState(config, activeState);
    if (hostElement && activeState && typeof hostElement.setAttribute === "function") {
      hostElement.setAttribute("state", activeState);
    }
    if (instanceNode && typeof instanceNode === "object") {
      if (!instanceNode.props || typeof instanceNode.props !== "object" || Array.isArray(instanceNode.props)) {
        instanceNode.props = {};
      }
      if (activeState) {
        instanceNode.props.state = activeState;
      }
    }
    return state && Array.isArray(state.nodes) ? state.nodes : [];
  }

  function installQStateMachineStateBridge(componentNode, instanceNode, hostElement, targetDocument, context) {
    if (
      !componentNode ||
      !componentNode.meta ||
      !componentNode.meta.__qhtmlStateMachine ||
      !hostElement ||
      hostElement.__qhtmlStateMachineStateBridgeInstalled
    ) {
      return;
    }
    const descriptor = Object.getOwnPropertyDescriptor(hostElement, "state");
    if (!descriptor || typeof descriptor.get !== "function" || typeof descriptor.set !== "function") {
      return;
    }
    try {
      Object.defineProperty(hostElement, "__qhtmlStateMachineStateBridgeInstalled", {
        configurable: true,
        enumerable: false,
        writable: true,
        value: true,
      });
    } catch (markError) {
      hostElement.__qhtmlStateMachineStateBridgeInstalled = true;
    }
    Object.defineProperty(hostElement, "states", {
      configurable: true,
      enumerable: true,
      get: function getQStateMachineStates() {
        const config = readQStateMachineConfig(componentNode);
        return config.states.map(function mapState(entry) {
          return String(entry && entry.name || "").trim();
        }).filter(Boolean);
      },
    });
    let localStateValue;
    try {
      localStateValue = descriptor.get.call(hostElement);
    } catch (readInitialStateError) {
      localStateValue = readQStateMachineActiveStateName(componentNode, instanceNode, hostElement);
    }
    Object.defineProperty(hostElement, "state", {
      configurable: true,
      enumerable: true,
      get: function getQStateMachineState() {
        if (instanceNode && instanceNode.props && Object.prototype.hasOwnProperty.call(instanceNode.props, "state")) {
          return instanceNode.props.state;
        }
        return localStateValue;
      },
      set: function setQStateMachineState(value) {
        const previousValue = this.state;
        const nextValue = resolveCallbackReferenceValue(value);
        localStateValue = nextValue;
        if (instanceNode && typeof instanceNode === "object") {
          if (!instanceNode.props || typeof instanceNode.props !== "object" || Array.isArray(instanceNode.props)) {
            instanceNode.props = {};
          }
          instanceNode.props.state = nextValue;
        }
        if (typeof this.setAttribute === "function") {
          this.setAttribute("state", String(nextValue == null ? "" : nextValue));
        }
        if (Object.is(previousValue, nextValue)) {
          return;
        }
        const host = this;
        const renderAndEmitStateChanged = function renderAndEmitQStateMachineStateChanged() {
          if (host.ownerDocument) {
            renderComponentContentIntoHost(
              componentNode,
              instanceNode,
              host,
              targetDocument || host.ownerDocument,
              createChildRenderContext(context || {})
            );
          }
          if (typeof host.statechanged === "function") {
            host.statechanged(nextValue, previousValue, true);
          }
        };
        if (typeof global.setTimeout === "function") {
          global.setTimeout(renderAndEmitStateChanged, 0);
        } else {
          renderAndEmitStateChanged();
        }
      },
    });
  }

  function renderComponentContentIntoHost(componentNode, instanceNode, hostElement, targetDocument, context, slotSourceContext) {
    const persistRenderTree = !!(instanceNode && instanceNode.__qhtmlPersistRenderTree);
    let expanded = persistRenderTree && Array.isArray(instanceNode.__qhtmlRenderTree) ? instanceNode.__qhtmlRenderTree : null;
    if (!expanded) {
      const stateMachineNodes = readQStateMachineTemplateNodes(componentNode, instanceNode, hostElement);
      const templateNodes = Array.isArray(stateMachineNodes)
        ? stateMachineNodes
        : Array.isArray(componentNode.templateNodes)
          ? componentNode.templateNodes
          : [];
      const singleSlotName = resolveSingleSlotName(componentNode);
      const slotNames = collectSlotNames(templateNodes);
      collectSlotNames(readRendererSlotDefaultNodes(componentNode), slotNames);
      const ownerInstanceId = ensureInstanceId(instanceNode);
      const slotFills = splitSlotFills(instanceNode, {
        singleSlotName: singleSlotName,
        slotNames: slotNames,
        ownerComponentId: String(componentNode.componentId || "").trim().toLowerCase(),
        ownerDefinitionType: inferDefinitionType(componentNode),
        ownerInstanceId: ownerInstanceId,
        sourceContext: slotSourceContext && typeof slotSourceContext === "object" ? slotSourceContext : context,
      });
      const slotDefaults = buildSlotDefaultFills(componentNode);
      expanded = materializeSlots(templateNodes, slotFills, slotDefaults);
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

    const contentContext = createChildRenderContext(context);
    for (let i = 0; i < expanded.length; i += 1) {
      renderNode(expanded[i], hostElement, targetDocument, contentContext);
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

    function readStaticPropertyDefinitionValue(entry) {
      const nodes = entry && Array.isArray(entry.nodes) ? entry.nodes : [];
      if (nodes.length === 0) {
        return null;
      }
      let out = "";
      let hasValue = false;
      for (let i = 0; i < nodes.length; i += 1) {
        const node = nodes[i];
        if (!node || typeof node !== "object") {
          continue;
        }
        if (core.NODE_TYPES.text && node.kind === core.NODE_TYPES.text) {
          out += String(node.value || "");
          hasValue = true;
          continue;
        }
        if (node.kind === core.NODE_TYPES.element && typeof node.textContent === "string" && (!Array.isArray(node.children) || node.children.length === 0)) {
          out += String(node.textContent || "");
          hasValue = true;
          continue;
        }
        return null;
      }
      return hasValue ? out : null;
    }

    const nodeMap =
      context &&
      context.capture &&
      context.capture.nodeMap &&
      typeof context.capture.nodeMap.get === "function"
        ? context.capture.nodeMap
        : null;
    const resolvedByName = {};
    const fallbackByName = {};
    for (let i = 0; i < propertyDefinitions.length; i += 1) {
      const entry = propertyDefinitions[i] || {};
      const propertyName = String(entry.name || "").trim();
      if (!propertyName || Object.prototype.hasOwnProperty.call(resolvedByName, propertyName)) {
        continue;
      }
      resolvedByName[propertyName] = null;
      fallbackByName[propertyName] = readStaticPropertyDefinitionValue(entry);
    }
    const propertyNames = Object.keys(resolvedByName);
    if (propertyNames.length === 0 || !nodeMap) {
      for (let i = 0; i < propertyNames.length; i += 1) {
        const propertyName = propertyNames[i];
        hostElement[propertyName] = Object.prototype.hasOwnProperty.call(fallbackByName, propertyName)
          ? fallbackByName[propertyName]
          : null;
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
      hostElement[propertyName] = resolvedByName[propertyName] || fallbackByName[propertyName];
    }
  }

  function collectDeclaredComponentPropertySet(componentNode, instanceNode) {
    const out = new Set();
    const componentProperties = Array.isArray(componentNode && componentNode.properties) ? componentNode.properties : [];
    for (let i = 0; i < componentProperties.length; i += 1) {
      const propertyName = String(componentProperties[i] || "").trim().toLowerCase();
      if (propertyName) {
        out.add(propertyName);
      }
    }
    const instanceDeclaredProperties =
      instanceNode &&
      instanceNode.meta &&
      Array.isArray(instanceNode.meta.__qhtmlDeclaredProperties)
        ? instanceNode.meta.__qhtmlDeclaredProperties
        : [];
    for (let i = 0; i < instanceDeclaredProperties.length; i += 1) {
      const propertyName = String(instanceDeclaredProperties[i] || "").trim().toLowerCase();
      if (propertyName) {
        out.add(propertyName);
      }
    }
    return out;
  }

  function renderComponentHostInstance(componentNode, instanceNode, parent, targetDocument, context) {
    const stack = context.componentStack;
    const key = String(componentNode.componentId || instanceNode.tagName || "").toLowerCase();
    if (stack.indexOf(key) !== -1 && !isProjectedSlotNode(instanceNode) && !isInsideProjectedSlotContext(context)) {
      throw new Error("Recursive q-component usage detected for '" + key + "'.");
    }

    const hostTag = String(componentNode.componentId || instanceNode.tagName || "div").trim().toLowerCase();
    const hostElement = targetDocument.createElement(hostTag || "div");
    if (
      context &&
      typeof context.__applyModelViewMarker === "function"
    ) {
      context.__applyModelViewMarker(hostElement, context);
    }
    const interpolationScope = buildInterpolationScope(context, parent);
    setElementAttributes(hostElement, instanceNode.attributes, {
      thisArg: hostElement,
      scope: interpolationScope,
      eventAttributeParameters:
        instanceNode && instanceNode.meta && instanceNode.meta.__qhtmlEventAttributeParams
          ? instanceNode.meta.__qhtmlEventAttributeParams
          : null,
      eventAttributeThen:
        instanceNode && instanceNode.meta && instanceNode.meta.__qhtmlEventAttributeThen
          ? instanceNode.meta.__qhtmlEventAttributeThen
          : null,
    });
    setElementProperties(hostElement, instanceNode.props, {
      declaredProperties: collectDeclaredComponentPropertySet(componentNode, instanceNode),
      scope: interpolationScope,
      thisArg: hostElement,
      hostElement: hostElement,
      componentNode: componentNode,
      instanceNode: instanceNode,
    });
    if (key) {
      hostElement.setAttribute("q-component", key);
      hostElement.setAttribute("qhtml-component-instance", "1");
    }
    if (componentNodeHasCanvasSemantics(componentNode)) {
      hostElement.setAttribute("q-canvas-host", "1");
    }
    ensureContextFrames(context);
    const parentScopeFrame = context[QCONTEXT_SCOPE_FRAME_KEY];
    const parentRuntimeFrame = context[QCONTEXT_RUNTIME_FRAME_KEY];
    const componentScopeFrame =
      parentScopeFrame && typeof parentScopeFrame.child === "function"
        ? parentScopeFrame.child("scope", hostElement)
        : createContextFrame(null, "scope", hostElement);
    const componentRuntimeFrame =
      parentRuntimeFrame && typeof parentRuntimeFrame.child === "function"
        ? parentRuntimeFrame.child("runtime", hostElement)
        : createContextFrame(null, "runtime", hostElement);
    bindRuntimeContextToTarget(hostElement, componentScopeFrame, componentRuntimeFrame);
    registerComponentOwnerTypeAlias(
      hostElement,
      componentNode,
      componentScopeFrame,
      componentRuntimeFrame,
      parentScopeFrame
    );
    parent.appendChild(hostElement);
    hydrateHostNamedRuntimeScope(hostElement, context);
    registerNamedInstanceAlias(context, hostElement, componentNode, instanceNode);

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

    if (!context.disableComponentRuntime) {
      bindComponentMethods(componentNode, hostElement, instanceNode);
      attachQBehaviorsToTarget(hostElement, componentNode);
      initializeBehaviorTargetProperties(hostElement, instanceNode);
      installQStateMachineStateBridge(componentNode, instanceNode, hostElement, targetDocument, context);
    }

    stack.push(key);
    context.componentHostStack.push(hostElement);
    context.componentQdomStack.push(instanceNode);
    const componentContext = createChildRenderContext(context, {
      scopeFrame: componentScopeFrame,
      runtimeFrame: componentRuntimeFrame,
    });
    const varDeclarations = Array.isArray(componentNode.varDeclarations) ? componentNode.varDeclarations : [];
    for (let vi = 0; vi < varDeclarations.length; vi += 1) {
      registerQVarDeclarationNode(
        Object.assign({ kind: Q_VAR_NODE_KIND }, varDeclarations[vi]),
        hostElement,
        targetDocument,
        componentContext,
        hostElement
      );
    }
    const switchDeclarations = Array.isArray(componentNode.switchDeclarations) ? componentNode.switchDeclarations : [];
    for (let si = 0; si < switchDeclarations.length; si += 1) {
      registerQSwitchDeclarationNode(
        Object.assign({ kind: Q_SWITCH_NODE_KIND }, switchDeclarations[si]),
        hostElement,
        targetDocument,
        componentContext,
        hostElement
      );
    }
    try {
      renderComponentContentIntoHost(componentNode, instanceNode, hostElement, targetDocument, componentContext, context);
    } finally {
      context.componentQdomStack.pop();
      context.componentHostStack.pop();
      stack.pop();
    }
    stripRenderedSlotElements(hostElement);
    applyRuntimeThemeRulesToHost(hostElement, instanceNode);
    registerQAnchorTarget(hostElement, [componentNode, instanceNode], context);
    if (!context.disableComponentRuntime) {
      bindDeclaredComponentPropertyNodes(componentNode, hostElement, context);
    }

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
      sourceContext: context,
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

  function renderWorkerInstance(componentNode, instanceNode, parent, targetDocument, context) {
    const workerTag = String(componentNode.componentId || instanceNode.tagName || "q-worker-runtime").trim().toLowerCase() || "q-worker-runtime";
    const workerHost = targetDocument.createElement(workerTag);
    const instanceQdomNode = sourceNodeOf(instanceNode) || instanceNode;
    workerHost.setAttribute("q-component", workerTag);
    workerHost.setAttribute("qhtml-component-instance", "1");
    workerHost.setAttribute("q-worker-instance", "1");
    if (instanceQdomNode && instanceQdomNode.meta && typeof instanceQdomNode.meta === "object") {
      if (!instanceQdomNode.meta[QDOM_UUID_META_KEY] && typeof core.ensureNodeUuid === "function") {
        core.ensureNodeUuid(instanceQdomNode);
      }
    }
    try {
      Object.defineProperty(workerHost, "qdom", {
        configurable: true,
        enumerable: false,
        writable: true,
        value: function workerRuntimeQdom() {
          return instanceQdomNode;
        },
      });
    } catch (error) {
      workerHost.qdom = function workerRuntimeQdom() {
        return instanceQdomNode;
      };
    }
    try {
      workerHost.component = workerHost;
    } catch (error) {
      // no-op
    }
    const interpolationScope = buildInterpolationScope(context, parent);
    setElementAttributes(workerHost, instanceNode.attributes, {
      thisArg: workerHost,
      scope: interpolationScope,
      eventAttributeParameters:
        instanceNode && instanceNode.meta && instanceNode.meta.__qhtmlEventAttributeParams
          ? instanceNode.meta.__qhtmlEventAttributeParams
          : null,
      eventAttributeThen:
        instanceNode && instanceNode.meta && instanceNode.meta.__qhtmlEventAttributeThen
          ? instanceNode.meta.__qhtmlEventAttributeThen
          : null,
    });
    setElementProperties(workerHost, instanceNode.props, {
      declaredProperties: collectDeclaredComponentPropertySet(componentNode, instanceNode),
      scope: interpolationScope,
      thisArg: workerHost,
      hostElement: workerHost,
      componentNode: componentNode,
      instanceNode: instanceNode,
    });
    ensureContextFrames(context);
    const parentScopeFrame = context[QCONTEXT_SCOPE_FRAME_KEY];
    const parentRuntimeFrame = context[QCONTEXT_RUNTIME_FRAME_KEY];
    const workerScopeFrame =
      parentScopeFrame && typeof parentScopeFrame.child === "function"
        ? parentScopeFrame.child("scope", workerHost)
        : createContextFrame(null, "scope", workerHost);
    const workerRuntimeFrame =
      parentRuntimeFrame && typeof parentRuntimeFrame.child === "function"
        ? parentRuntimeFrame.child("runtime", workerHost)
        : createContextFrame(null, "runtime", workerHost);
    bindRuntimeContextToTarget(workerHost, workerScopeFrame, workerRuntimeFrame);
    registerComponentOwnerTypeAlias(
      workerHost,
      componentNode,
      workerScopeFrame,
      workerRuntimeFrame,
      parentScopeFrame
    );
    hydrateHostNamedRuntimeScope(workerHost, context);
    registerNamedInstanceAlias(context, workerHost, componentNode, instanceNode);
    if (!context.disableComponentRuntime) {
      bindComponentMethods(componentNode, workerHost, instanceNode);
    }
    if (!context.disableLifecycleHooks) {
      runLifecycleHooks(instanceNode, workerHost, targetDocument);
      runComponentLifecycleHooks(componentNode, workerHost, targetDocument);
    }
  }

  function renderComponentInstance(componentNode, instanceNode, parent, targetDocument, context) {
    if (core.NODE_TYPES.struct && componentNode && componentNode.kind === core.NODE_TYPES.struct) {
      const structInstanceNode =
        core.NODE_TYPES.structInstance && instanceNode && instanceNode.kind === core.NODE_TYPES.structInstance
          ? instanceNode
          : createStructInstanceNodeFromElement(instanceNode, componentNode);
      renderStructInstance(componentNode, structInstanceNode, parent, targetDocument, context);
      return;
    }
    const effectiveComponentNode = resolveInheritedComponentDefinition(
      componentNode,
      context && context.componentRegistry,
      context && context.resolvedComponentRegistry
    );
    const definitionType = inferDefinitionType(effectiveComponentNode);
    if (definitionType === "template") {
      renderComponentTemplateInstance(effectiveComponentNode, instanceNode, parent, targetDocument, context);
      return;
    }
    if (definitionType === "signal") {
      dispatchSignalInstance(effectiveComponentNode, instanceNode, parent, targetDocument, context);
      return;
    }
    if (definitionType === "worker") {
      renderWorkerInstance(effectiveComponentNode, instanceNode, parent, targetDocument, context);
      return;
    }
    renderComponentHostInstance(effectiveComponentNode, instanceNode, parent, targetDocument, context);
  }

  function normalizeStructFieldMap(fields) {
    const map = new Map();
    const list = Array.isArray(fields) ? fields : [];
    for (let i = 0; i < list.length; i += 1) {
      const field = list[i];
      const name = String(field && field.name || "").trim();
      if (!name) {
        continue;
      }
      map.set(name.toLowerCase(), Object.assign({}, field, { name: name }));
    }
    return map;
  }

  function readStructInstanceAlias(instanceNode) {
    return String(
      instanceNode &&
      instanceNode.meta &&
      typeof instanceNode.meta === "object" &&
      typeof instanceNode.meta.__qhtmlInstanceAlias === "string"
        ? instanceNode.meta.__qhtmlInstanceAlias
        : ""
    ).trim();
  }

  function evaluateStructExpressionSource(sourceValue, instanceValue, parent, context) {
    const source = String(sourceValue || "").trim();
    if (!source) {
      return undefined;
    }
    const scope = buildInterpolationScope(context, parent && parent.nodeType === 1 ? parent : null);
    const alias = instanceValue && typeof instanceValue.__qhtmlAlias === "string" ? instanceValue.__qhtmlAlias : "";
    if (alias) {
      scope[alias] = instanceValue;
    }
    return evaluateInlineReferenceExpression(
      source,
      parent && parent.nodeType === 1 ? parent : null,
      scope,
      "qhtml q-struct field evaluation failed:",
      { pathFallbackLiteral: false, allowBareDotWalk: true }
    );
  }

  function evaluateStructBindingField(field, instanceValue, parent, context) {
    return evaluateStructExpressionSource(field && field.source, instanceValue, parent, context);
  }

  function createStructFunctionField(field, instanceValue, parent, context) {
    const params = String(field && field.parameters || "").trim();
    const body = String(field && field.body || "");
    const scope = buildInterpolationScope(context, parent && parent.nodeType === 1 ? parent : null);
    const alias = instanceValue && typeof instanceValue.__qhtmlAlias === "string" ? instanceValue.__qhtmlAlias : "";
    if (alias) {
      scope[alias] = instanceValue;
    }
    let factory = null;
    try {
      factory = new Function("__qhtmlScope", "return function(" + params + ") { with(__qhtmlScope){ " + body + " } };");
      return factory(scope).bind(instanceValue);
    } catch (error) {
      if (global.console && typeof global.console.error === "function") {
        global.console.error("qhtml q-struct function field failed:", error);
      }
      return function qStructInvalidFunctionField() {};
    }
  }

  function createQStructInstanceValue(structNode, instanceNode, parent, targetDocument, context) {
    const definitionFields = normalizeStructFieldMap(structNode && structNode.fields);
    const overrideFields = normalizeStructFieldMap(instanceNode && instanceNode.fields);
    overrideFields.forEach(function applyStructOverride(field, key) {
      definitionFields.set(key, field);
    });
    const fieldKeys = Array.from(definitionFields.keys());
    const manualValues = Object.create(null);
    const functionValues = Object.create(null);
    const instanceValue = {
      __qhtmlIsQStructInstance: true,
      __qhtmlStructId: String(structNode && (structNode.structId || structNode.componentId) || "").trim().toLowerCase(),
      __qhtmlAlias: readStructInstanceAlias(instanceNode),
      qdom: function qStructInstanceQdom() {
        return instanceNode;
      },
      definition: function qStructDefinition() {
        return structNode;
      },
      toObject: function qStructInstanceToObject() {
        const out = {};
        for (let i = 0; i < fieldKeys.length; i += 1) {
          const field = definitionFields.get(fieldKeys[i]);
          if (!field || !field.name) {
            continue;
          }
          out[field.name] = instanceValue[field.name];
        }
        return out;
      },
    };

    function setStructFieldValue(fieldName, value) {
      const key = String(fieldName || "").trim().toLowerCase();
      if (!key) {
        return;
      }
      manualValues[key] = value;
      const existing = definitionFields.get(key);
      const name = existing && existing.name ? existing.name : String(fieldName || "").trim();
      definitionFields.set(key, {
        name: name,
        kind: "literal",
        value: value,
      });
      if (instanceNode && typeof instanceNode === "object") {
        if (!Array.isArray(instanceNode.fields)) {
          instanceNode.fields = [];
        }
        let updated = false;
        for (let i = 0; i < instanceNode.fields.length; i += 1) {
          const field = instanceNode.fields[i];
          if (String(field && field.name || "").trim().toLowerCase() === key) {
            instanceNode.fields[i] = { name: name, kind: "literal", value: value };
            updated = true;
            break;
          }
        }
        if (!updated) {
          instanceNode.fields.push({ name: name, kind: "literal", value: value });
        }
        if (!instanceNode.props || typeof instanceNode.props !== "object") {
          instanceNode.props = {};
        }
        instanceNode.props[name] = value;
      }
    }

    for (let i = 0; i < fieldKeys.length; i += 1) {
      const key = fieldKeys[i];
      const field = definitionFields.get(key);
      const fieldName = String(field && field.name || "").trim();
      if (!fieldName || Object.prototype.hasOwnProperty.call(instanceValue, fieldName)) {
        continue;
      }
      Object.defineProperty(instanceValue, fieldName, {
        configurable: true,
        enumerable: true,
        get: function getQStructField() {
          if (Object.prototype.hasOwnProperty.call(manualValues, key)) {
            return manualValues[key];
          }
          const activeField = definitionFields.get(key) || field;
          const kind = String(activeField && activeField.kind || "literal").trim().toLowerCase();
          if (kind === "binding" || kind === "expression") {
            return evaluateStructBindingField(activeField, instanceValue, parent, context);
          }
          if (kind === "function") {
            if (!Object.prototype.hasOwnProperty.call(functionValues, key)) {
              functionValues[key] = createStructFunctionField(activeField, instanceValue, parent, context);
            }
            return functionValues[key];
          }
          return activeField ? activeField.value : undefined;
        },
        set: function setQStructField(value) {
          setStructFieldValue(fieldName, value);
        },
      });
    }

    for (let i = 0; i < fieldKeys.length; i += 1) {
      const field = definitionFields.get(fieldKeys[i]);
      const kind = String(field && field.kind || "").trim().toLowerCase();
      const source = String(field && field.source || "").trim();
      if (kind !== "binding" || source.indexOf(".") === -1) {
        continue;
      }
      const head = source.split(".")[0].trim();
      if (!head || Object.prototype.hasOwnProperty.call(instanceValue, head)) {
        continue;
      }
      Object.defineProperty(instanceValue, head, {
        configurable: true,
        enumerable: false,
        get: function getQStructBoundPathHead() {
          return new Proxy(Object.create(null), {
            get: function getQStructBoundPathSegment(_target, prop) {
              if (prop === "toString") {
                return function qStructBoundPathToString() {
                  return String(evaluateStructExpressionSource(head, instanceValue, parent, context) || "");
                };
              }
              if (prop === Symbol.toPrimitive) {
                return function qStructBoundPathToPrimitive() {
                  return evaluateStructExpressionSource(head, instanceValue, parent, context);
                };
              }
              if (typeof prop !== "string") {
                return undefined;
              }
              return evaluateStructExpressionSource(head + "." + prop, instanceValue, parent, context);
            },
          });
        },
      });
    }

    return instanceValue;
  }

  function renderStructInstance(structNode, instanceNode, parent, targetDocument, context) {
    const alias = readStructInstanceAlias(instanceNode);
    if (!alias) {
      return;
    }
    const value = createQStructInstanceValue(structNode, instanceNode, parent, targetDocument, context);
    registerNamedRuntimeValueAlias(context, alias, value);
  }

  function createStructInstanceNodeFromElement(elementNode, structNode) {
    const meta = Object.assign({}, elementNode && elementNode.meta || {});
    const structId = String(structNode && (structNode.structId || structNode.componentId) || elementNode && elementNode.tagName || "")
      .trim()
      .toLowerCase();
    return core.createStructInstanceNode({
      structId: structId,
      componentId: structId,
      tagName: String(elementNode && elementNode.tagName || structId).trim().toLowerCase(),
      fields: meta && Array.isArray(meta.__qhtmlStructFieldOverrides) ? meta.__qhtmlStructFieldOverrides.slice() : [],
      selectorMode: elementNode && elementNode.selectorMode || "single",
      selectorChain:
        elementNode && Array.isArray(elementNode.selectorChain)
          ? elementNode.selectorChain.slice()
          : [structId],
      meta: meta,
    });
  }

  function renderDocumentToFragment(documentNode, targetDocument, options) {
    const doc = targetDocument || global.document;
    if (!doc) {
      throw new Error("renderDocumentToFragment requires a document context.");
    }

    const fragment = doc.createDocumentFragment();
    const opts = options || {};
    const componentRegistry = new Map();
    if (opts.componentRegistry instanceof Map) {
      opts.componentRegistry.forEach(function copyExternalDefinition(definitionNode, definitionId) {
        const key = String(definitionId || "").trim().toLowerCase();
        if (!key) {
          return;
        }
        componentRegistry.set(key, definitionNode);
      });
    }
    const localRegistry = collectComponentRegistry(documentNode);
    localRegistry.forEach(function applyLocalDefinition(definitionNode, definitionId) {
      componentRegistry.set(definitionId, definitionNode);
    });
    const context = {
      componentRegistry: componentRegistry,
      resolvedComponentRegistry: new Map(),
      componentStack: [],
      componentHostStack: [],
      componentQdomStack: [],
      slotStack: [],
      inlineScope: {},
      instanceAliasScopeStack: [Object.create(null)],
      namedRuntimeValues:
        opts && opts.namedRuntimeValues && typeof opts.namedRuntimeValues === "object"
          ? opts.namedRuntimeValues
          : null,
      rootHostElement:
        opts && opts.rootHostElement && opts.rootHostElement.nodeType === 1
          ? opts.rootHostElement
          : null,
      disableComponentRuntime: !!(opts.disableComponentRuntime || opts.staticPreview),
      disableLifecycleHooks: !!(opts.disableLifecycleHooks || opts.disableComponentRuntime || opts.staticPreview),
      suppressModelViewWrapper: !!opts.suppressModelViewWrapper,
      capture: opts.capture ? opts.capture : null,
    };
    ensureContextFrames(context);
    if (context.namedRuntimeValues && typeof context.namedRuntimeValues === "object") {
      const names = Object.keys(context.namedRuntimeValues);
      for (let i = 0; i < names.length; i += 1) {
        const name = String(names[i] || "").trim();
        if (!name) {
          continue;
        }
        context[QCONTEXT_RUNTIME_FRAME_KEY].set(name, context.namedRuntimeValues[name]);
      }
    }
    if (!Array.isArray(context.instanceAliasScopeStack) || context.instanceAliasScopeStack.length === 0) {
      context.instanceAliasScopeStack = [context[QCONTEXT_SCOPE_FRAME_KEY]];
    } else {
      context.instanceAliasScopeStack[0] = context[QCONTEXT_SCOPE_FRAME_KEY];
    }

    const rootTimers =
      documentNode &&
      documentNode.meta &&
      Array.isArray(documentNode.meta.qTimers)
        ? documentNode.meta.qTimers
        : [];
    if (!context.disableComponentRuntime && rootTimers.length > 0 && context.rootHostElement && context.rootHostElement.nodeType === 1) {
      for (let ti = 0; ti < rootTimers.length; ti += 1) {
        registerQTimerDeclarationNode(
          Object.assign({ kind: Q_TIMER_NODE_KIND }, rootTimers[ti]),
          context.rootHostElement,
          doc,
          context,
          context.rootHostElement
        );
      }
    }

    const nodes = Array.isArray(documentNode && documentNode.nodes) ? documentNode.nodes : [];
    for (let i = 0; i < nodes.length; i += 1) {
      const node = nodes[i];
      if (
        node &&
        (node.kind === core.NODE_TYPES.component || (core.NODE_TYPES.struct && node.kind === core.NODE_TYPES.struct))
      ) {
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
    const opts = options || {};
    const capture = opts.capture ? opts.capture : null;
    const fragment = renderDocumentToFragment(documentNode, doc, {
      capture: capture,
      componentRegistry: opts.componentRegistry instanceof Map ? opts.componentRegistry : null,
      namedRuntimeValues:
        opts && opts.namedRuntimeValues && typeof opts.namedRuntimeValues === "object"
          ? opts.namedRuntimeValues
          : null,
      rootHostElement:
        opts && opts.rootHostElement && opts.rootHostElement.nodeType === 1
          ? opts.rootHostElement
          : hostElement && hostElement.nodeType === 1
            ? hostElement
            : null,
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
      resolvedComponentRegistry: new Map(),
      componentStack: Array.isArray(opts.componentStack) ? opts.componentStack : [],
      componentHostStack: Array.isArray(opts.componentHostStack) ? opts.componentHostStack : [],
      componentQdomStack: Array.isArray(opts.componentQdomStack) ? opts.componentQdomStack : [],
      slotStack: Array.isArray(opts.slotStack) ? opts.slotStack : [],
      inlineScope:
        opts.inlineScope && typeof opts.inlineScope === "object"
          ? Object.assign({}, opts.inlineScope)
          : {},
      instanceAliasScopeStack: [Object.create(null)],
      disableComponentRuntime: !!(opts.disableComponentRuntime || opts.staticPreview),
      disableLifecycleHooks: !!(opts.disableLifecycleHooks || opts.disableComponentRuntime || opts.staticPreview),
    };
    ensureContextFrames(context);
    if (opts && opts.namedRuntimeValues && typeof opts.namedRuntimeValues === "object") {
      const names = Object.keys(opts.namedRuntimeValues);
      for (let i = 0; i < names.length; i += 1) {
        const name = String(names[i] || "").trim();
        if (!name) {
          continue;
        }
        context[QCONTEXT_RUNTIME_FRAME_KEY].set(name, opts.namedRuntimeValues[name]);
      }
    }
    context.instanceAliasScopeStack = [context[QCONTEXT_SCOPE_FRAME_KEY]];
    const effectiveComponentNode = resolveInheritedComponentDefinition(
      componentNode,
      context.componentRegistry,
      context.resolvedComponentRegistry
    );

    const instanceNode = domElementToInstanceNode(hostElement);
    const key = String(effectiveComponentNode.componentId || instanceNode.tagName || "").toLowerCase();

    if (key) {
      hostElement.setAttribute("q-component", key);
      hostElement.setAttribute("qhtml-component-instance", "1");
      if (opts.externalInstance !== false) {
        hostElement.setAttribute("qhtml-external-component-instance", "1");
      }
    }

    if (!context.disableComponentRuntime) {
      bindComponentMethods(effectiveComponentNode, hostElement, instanceNode);
    }

    if (
      context.componentStack.indexOf(key) !== -1 &&
      !isProjectedSlotNode(instanceNode) &&
      !isInsideProjectedSlotContext(context)
    ) {
      throw new Error("Recursive q-component usage detected for '" + key + "'.");
    }

    context.componentStack.push(key);
    context.componentHostStack.push(hostElement);
    context.componentQdomStack.push(instanceNode);
    const varDeclarations = Array.isArray(effectiveComponentNode.varDeclarations) ? effectiveComponentNode.varDeclarations : [];
    for (let vi = 0; vi < varDeclarations.length; vi += 1) {
      registerQVarDeclarationNode(
        Object.assign({ kind: Q_VAR_NODE_KIND }, varDeclarations[vi]),
        hostElement,
        doc,
        context,
        hostElement
      );
    }
    const switchDeclarations = Array.isArray(effectiveComponentNode.switchDeclarations) ? effectiveComponentNode.switchDeclarations : [];
    for (let si = 0; si < switchDeclarations.length; si += 1) {
      registerQSwitchDeclarationNode(
        Object.assign({ kind: Q_SWITCH_NODE_KIND }, switchDeclarations[si]),
        hostElement,
        doc,
        context,
        hostElement
      );
    }
    try {
      renderComponentContentIntoHost(effectiveComponentNode, instanceNode, hostElement, doc, context);
    } finally {
      context.componentQdomStack.pop();
      context.componentHostStack.pop();
      context.componentStack.pop();
    }
    stripRenderedSlotElements(hostElement);

    if (!context.disableLifecycleHooks) {
      runComponentLifecycleHooks(effectiveComponentNode, hostElement, doc);
    }
    return hostElement;
  }

  modules.domRenderer = {
    collectComponentRegistry: collectComponentRegistry,
    renderDocumentToFragment: renderDocumentToFragment,
    renderIntoElement: renderIntoElement,
    renderComponentElement: renderComponentElement,
    QSignal: QSignal,
    QProperty: QProperty,
    QComponentInstance: QComponentInstance,
    QVar: QVar,
    createQSignalInstance: createQSignalInstance,
    qSet: qSet,
    commitProperty: commitProperty,
    registerBehavior: registerBehavior,
    getBehavior: getBehavior,
    removeBehavior: removeBehavior,
    QBehaviorAbstractAnimation: QBehaviorAbstractAnimation,
    BehaviorController: BehaviorController,
    NumberAnimation: NumberAnimation,
    QBehaviorPropertyAnimation: QBehaviorPropertyAnimation,
    QBehaviorAnimationGroup: QBehaviorAnimationGroup,
    AnimationJob: AnimationJob,
    getEasing: getEasing,
    getPropertyAdapter: getPropertyAdapter,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
