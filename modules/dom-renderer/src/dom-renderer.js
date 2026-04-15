(function attachDomRenderer(global) {
  const modules = global.QHtmlModules || (global.QHtmlModules = {});
  const core = modules.qdomCore;
  const parser = modules.qhtmlParser;
  const RENDER_SLOT_REF = typeof Symbol === "function" ? Symbol("qhtml.render.slotRef") : "__qhtmlRenderSlotRef__";

  if (!core) {
    throw new Error("dom-renderer requires qdom-core to be loaded first.");
  }

  const INVALID_METHOD_NAMES = new Set(["constructor", "prototype", "__proto__"]);
  const COMPONENT_PROP_STATE_KEY = "__qhtmlDeclaredPropertyState";
  const QLOGGER_META_KEY = "__qhtmlLoggerCategories";
  const QDOM_UUID_META_KEY = typeof core.QDOM_UUID_KEY === "string" ? core.QDOM_UUID_KEY : "uuid";
  const QINSTANCE_ALIAS_META_KEY = "__qhtmlInstanceAlias";
  const Q_MODEL_VIEW_INSTANCE_ATTR = "q-model-view-instance";
  const Q_MODEL_VIEW_SCOPE_TAG = "q-model-view-scope";
  const QHTML_CONTENT_LOADED_EVENT = "QHTMLContentLoaded";
  const Q_CALLBACK_NODE_KIND = "callback";
  const QHTML_FRAGMENT_MARKER = "__qhtmlFragment";
  const QHTML_NAMED_CALLBACKS_KEY = "__qhtmlNamedCallbacks";
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
      propertyDefinitions: [],
      methods: [],
      signalDeclarations: [],
      callbackDeclarations: [],
      aliasDeclarations: [],
      wasmConfig: null,
      lifecycleScripts: [],
      attributes: {},
      properties: [],
      meta: leaf.meta && typeof leaf.meta === "object" ? Object.assign({}, leaf.meta) : {},
    };

    const propertyIndex = new Map();
    const propertyDefinitionIndex = new Map();
    const methodIndex = new Map();
    const signalIndex = new Map();
    const callbackIndex = new Map();
    const aliasIndex = new Map();
    const lifecycleIndex = new Map();
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
      }
      if (Array.isArray(node.children)) {
        collectComponentDefinitionsInNodes(node.children, registry);
      }
      if (Array.isArray(node.templateNodes)) {
        collectComponentDefinitionsInNodes(node.templateNodes, registry);
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

  function createQHtmlFragmentToken(source) {
    return {
      __qhtmlFragment: true,
      source: String(source == null ? "" : source),
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
    return (
      "const $ = (this && typeof this.__qhtmlScopedSelector === \"function\")" +
      " ? this.__qhtmlScopedSelector : function(){ return null; };\n" +
      "const qhtml = (typeof globalThis !== \"undefined\" && typeof globalThis.qhtml === \"function\")" +
      " ? globalThis.qhtml : function(source){ return { __qhtmlFragment: true, source: String(source == null ? \"\" : source) }; };\n" +
      source
    );
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

  function tryResolveInlineReferencePath(expression, thisArg, scope) {
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
          return { matched: true, value: componentSource.qdom() };
        } catch (error) {
          return { matched: true, value: null };
        }
      }
      return {
        matched: true,
        value: scope && typeof scope === "object" ? scope.componentQdom || null : null,
      };
    }
    if (/^this\.component\.[A-Za-z_$][A-Za-z0-9_$]*(\.[A-Za-z_$][A-Za-z0-9_$]*)*$/.test(source)) {
      return {
        matched: true,
        value: readInlineReferencePath(componentSource, source.slice("this.component.".length)),
      };
    }
    if (/^component\.[A-Za-z_$][A-Za-z0-9_$]*(\.[A-Za-z_$][A-Za-z0-9_$]*)*$/.test(source)) {
      return {
        matched: true,
        value: readInlineReferencePath(componentSource, source.slice("component.".length)),
      };
    }
    if (/^this\.[A-Za-z_$][A-Za-z0-9_$]*(\.[A-Za-z_$][A-Za-z0-9_$]*)*$/.test(source)) {
      return {
        matched: true,
        value: readInlineReferencePath(thisArg, source.slice("this.".length)),
      };
    }
    return { matched: false, value: undefined };
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
            refreshQDomNodeUuidsDeep(projected);
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
      refreshQDomNodeUuidsDeep(clone);
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
      if (core.NODE_TYPES.repeater && clone.kind === core.NODE_TYPES.repeater) {
        if (Array.isArray(clone.templateNodes) && clone.templateNodes.length > 0) {
          clone.templateNodes = materializeSlots(clone.templateNodes, slotFills);
        }
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
    const doc = opts.doc || element.ownerDocument || global.document || null;
    const scopeRoot =
      opts.scopeRoot && opts.scopeRoot.nodeType === 1
        ? opts.scopeRoot
        : null;
    const transformedSource = rewriteHashSelectorShorthand(source);
    const store = ensureEventAttributeListenerStore(element);
    const current = store && store[key] ? store[key] : null;
    const currentNames = current && Array.isArray(current.eventNames) ? current.eventNames : [];
    const sameNames =
      currentNames.length === eventNames.length &&
      currentNames.every(function sameName(name, index) {
        return String(name || "") === String(eventNames[index] || "");
      });
    if (current && current.source === transformedSource && sameNames) {
      return true;
    }
    detachEventAttributeListener(element, key);
    const hasInterpolatedBody = hasInlineReferenceExpressions(transformedSource);
    let compiled = null;
    if (!hasInterpolatedBody) {
      try {
        compiled = new Function("event", "document", withScopedSelectorPrelude(transformedSource));
      } catch (error) {
        if (global.console && typeof global.console.error === "function") {
          global.console.error("qhtml event handler compile failed:", error);
        }
        return false;
      }
    }
    const handler = function qHtmlInlineEventAttributeHandler(event) {
      const componentContext =
        element && (typeof element === "object" || typeof element === "function")
          ? element.component || (typeof resolveNearestComponentHost === "function" ? resolveNearestComponentHost(element) : null)
          : null;
      let executableSource = transformedSource;
      if (hasInterpolatedBody) {
        executableSource = interpolateInlineReferenceExpressions(
          transformedSource,
          element,
          {
            component: componentContext,
            event: event,
            document: doc,
            root: scopeRoot,
          },
          "qhtml event interpolation failed:"
        );
      }
      try {
        ensureScopedSelectorShortcut(element, scopeRoot);
        if (compiled) {
          return invokeWithRuntimeExecutionHost(element, function invokeCompiledInlineHandler() {
            return compiled.call(element, event, doc);
          });
        }
        const dynamic = new Function("event", "document", withScopedSelectorPrelude(executableSource));
        return invokeWithRuntimeExecutionHost(element, function invokeDynamicInlineHandler() {
          return dynamic.call(element, event, doc);
        });
      } catch (error) {
        if (global.console && typeof global.console.error === "function") {
          global.console.error("qhtml event handler failed:", error);
        }
        return undefined;
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
      runtimeSignalRegistration: runtimeSignalRegistration,
      runtimeSignalReference: runtimeSignalReference,
    };
    return true;
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
      if (
        bindEventAttributeListener(element, key, String(normalized), {
          doc: element.ownerDocument || global.document || null,
          scopeRoot:
            interpolationScope && interpolationScope.root && interpolationScope.root.nodeType === 1
              ? interpolationScope.root
              : null,
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
        const callableReference = tryResolveDirectCallableValue(referenceSource, { inlineScope: directScope || {} }, thisArg);
        if (callableReference && callableReference.matched && callableReference.found) {
          nextValue = callableReference.value;
        } else {
          const directReference = tryResolveDirectSymbolValue(referenceSource, { inlineScope: directScope || {} }, thisArg);
          if (directReference && directReference.matched) {
            if (directReference.found) {
              nextValue = directReference.value;
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
      try {
        element[key] = nextValue;
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
      ensureScopedSelectorShortcut(thisArg || {}, null);
      const fn = new Function("event", "document", withScopedSelectorPrelude(hookBody));
      invokeWithRuntimeExecutionHost(thisArg && thisArg.nodeType === 1 ? thisArg : null, function invokeLifecycleHook() {
        fn.call(thisArg, null, targetDocument);
      });
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
    const key = String(hook.name || "onready") + "::" + String(hook.body || "");
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

  function bindComponentMethods(componentNode, hostElement, instanceNode) {
    if (!componentNode || !hostElement) {
      return;
    }
    try {
      hostElement.component = hostElement;
    } catch (ignoredSetSelfComponentContext) {
      // best effort
    }
    ensureScopedSelectorShortcut(hostElement, null);
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
    const hasCanvasSemantics = componentNodeHasCanvasSemantics(componentNode);
    const instanceAttributes =
      instanceNode && instanceNode.attributes && typeof instanceNode.attributes === "object"
        ? instanceNode.attributes
        : {};
    const instanceProperties =
      instanceNode && instanceNode.props && typeof instanceNode.props === "object"
        ? instanceNode.props
        : {};
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
      let initialValue = hasInitialValue ? hostElement[propertyName] : undefined;
      const rawDefault = Object.prototype.hasOwnProperty.call(instanceProperties, propertyName)
        ? instanceProperties[propertyName]
        : Object.prototype.hasOwnProperty.call(componentAttributes, propertyName)
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
        }
      }
      try {
        Object.defineProperty(hostElement, propertyName, {
          configurable: true,
          enumerable: true,
          get: function getDeclaredComponentProperty() {
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
            return resolveCallbackReferenceValue(literalDefault);
          },
          set: function setDeclaredComponentProperty(value) {
            const normalizedValue = resolveCallbackReferenceValue(value);
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
              return;
            }
            writeTrackedDeclaredProperty(this, propertyName, normalizedValue);
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
            "qhtml callback interpolation failed:"
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
            "qhtml component method interpolation failed:"
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
          connectedSubscriberUuid
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

      signalFn.emit = function emitSignalProxy() {
        return signalFn.apply(hostElement, arguments);
      };

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

    function bindComponentSignalAttributeConnection(attributeName, body, signalDecl) {
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
      const transformedSource = rewriteHashSelectorShorthand(source);
      const store = ensureComponentSignalAttributeConnectionStore(hostElement);
      const current = store && store[key] ? store[key] : null;
      if (current && current.source === transformedSource && String(current.signalName || "") === signalName) {
        return true;
      }
      detachComponentSignalAttributeConnection(hostElement, key);
      const hasInterpolatedBody = hasInlineReferenceExpressions(transformedSource);
      const doc = hostElement.ownerDocument || global.document || null;
      let compiled = null;
      if (!hasInterpolatedBody) {
        try {
          compiled = new Function("event", "document", withScopedSelectorPrelude(transformedSource));
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
      const parameterNames = Array.isArray(signalDecl.parameters)
        ? signalDecl.parameters.map(function mapSignalParam(entry) { return String(entry || "").trim(); }).filter(Boolean)
        : [];
      const connectedHandler = function onComponentSignalAttributeConnected() {
        const invocationHost = resolveLiveComponentHost(hostElement);
        const args = Array.prototype.slice.call(arguments);
        const params = {};
        for (let i = 0; i < parameterNames.length; i += 1) {
          params[parameterNames[i]] = i < args.length ? args[i] : null;
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
        let executableSource = transformedSource;
        if (hasInterpolatedBody) {
          executableSource = interpolateInlineReferenceExpressions(
            transformedSource,
            invocationHost,
            {
              component: invocationHost,
              event: event,
              document: doc,
              root: null,
            },
            "qhtml signal interpolation failed:"
          );
        }
        try {
          ensureScopedSelectorShortcut(invocationHost, null);
          if (compiled) {
            return invokeWithRuntimeExecutionHost(invocationHost, function invokeCompiledSignalHandler() {
              return compiled.call(invocationHost, event, doc);
            });
          }
          const dynamic = new Function("event", "document", withScopedSelectorPrelude(executableSource));
          return invokeWithRuntimeExecutionHost(invocationHost, function invokeDynamicSignalHandler() {
            return dynamic.call(invocationHost, event, doc);
          });
        } catch (error) {
          if (
            shouldLogQLoggerCategory(hostElement, componentNode, instanceNode, "q-signal") &&
            global.console &&
            typeof global.console.log === "function"
          ) {
            global.console.log("qhtml signal handler failed:", signalName, error);
          }
          return undefined;
        }
      };
      signalProxy.connect(connectedHandler);
      store[key] = {
        signalName: signalName,
        source: transformedSource,
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
      if (signalDecl && bindComponentSignalAttributeConnection(attributeName, body, signalDecl)) {
        continue;
      }
      bindEventAttributeListener(hostElement, attributeName, body, {
        doc: hostElement.ownerDocument || global.document || null,
        scopeRoot: null,
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
    return next;
  }

  function ensureInstanceAliasScopeStack(context) {
    if (!context || typeof context !== "object") {
      return [Object.create(null)];
    }
    if (!Array.isArray(context.instanceAliasScopeStack)) {
      context.instanceAliasScopeStack = [Object.create(null)];
    } else if (context.instanceAliasScopeStack.length === 0) {
      context.instanceAliasScopeStack.push(Object.create(null));
    }
    return context.instanceAliasScopeStack;
  }

  function pushInstanceAliasScope(context) {
    const stack = ensureInstanceAliasScopeStack(context);
    const frame = Object.create(null);
    stack.push(frame);
    return frame;
  }

  function popInstanceAliasScope(context) {
    if (!context || !Array.isArray(context.instanceAliasScopeStack) || context.instanceAliasScopeStack.length === 0) {
      return;
    }
    if (context.instanceAliasScopeStack.length === 1) {
      context.instanceAliasScopeStack[0] = Object.create(null);
      return;
    }
    context.instanceAliasScopeStack.pop();
  }

  function mergeInstanceAliasesIntoScope(scope, context) {
    if (!scope || typeof scope !== "object" || !context || !Array.isArray(context.instanceAliasScopeStack)) {
      return;
    }
    const stack = context.instanceAliasScopeStack;
    for (let i = 0; i < stack.length; i += 1) {
      const frame = stack[i];
      if (!frame || typeof frame !== "object") {
        continue;
      }
      const names = Object.keys(frame);
      for (let j = 0; j < names.length; j += 1) {
        const name = String(names[j] || "").trim();
        if (!name) {
          continue;
        }
        scope[name] = frame[name];
      }
    }
  }

  function registerNamedInstanceAlias(context, hostElement, componentNode, instanceNode) {
    if (!context || !hostElement || !instanceNode || !instanceNode.meta || typeof instanceNode.meta !== "object") {
      return;
    }
    const alias = String(instanceNode.meta[QINSTANCE_ALIAS_META_KEY] || "").trim();
    if (!alias) {
      return;
    }
    const stack = ensureInstanceAliasScopeStack(context);
    const frame = stack[stack.length - 1] || Object.create(null);
    if (frame !== stack[stack.length - 1]) {
      stack[stack.length - 1] = frame;
    }
    const hasExisting = Object.prototype.hasOwnProperty.call(frame, alias);
    frame[alias] = hostElement;
    if (
      hasExisting &&
      shouldLogQLoggerCategory(hostElement, componentNode, instanceNode, "q-property") &&
      global.console &&
      typeof global.console.log === "function"
    ) {
      global.console.log("qhtml named instance alias overwritten:", alias);
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
      "qhtml for model source evaluation failed:"
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
    if (context && context.inlineScope && typeof context.inlineScope === "object") {
      const keys = Object.keys(context.inlineScope);
      for (let i = 0; i < keys.length; i += 1) {
        const key = keys[i];
        scope[key] = context.inlineScope[key];
      }
    }
    scope.component = resolveComponentForInterpolation(context, fallbackNode);
    scope.componentQdom = resolveComponentQdomForInterpolation(context);
    return scope;
  }

  function createChildRenderContext(context) {
    const next = Object.assign({}, context || {});
    next.inlineScope =
      context && context.inlineScope && typeof context.inlineScope === "object"
        ? Object.assign({}, context.inlineScope)
        : {};
    return next;
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
          "qhtml callback interpolation failed:"
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
    declaredScope[callbackName] = resolvedCallback;
    registerNamedCallbackRuntime(callbackName, resolvedCallback);
    return true;
  }

  function renderQHtmlFragmentToken(value, parent, targetDocument, context) {
    if (!isQHtmlFragmentToken(value)) {
      return false;
    }
    const source = String(value.source || "");
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

  function readPathValueFromBase(base, pathParts) {
    let cursor = base;
    if (typeof cursor === "undefined") {
      return { found: false, value: undefined };
    }
    const parts = Array.isArray(pathParts) ? pathParts : [];
    for (let i = 0; i < parts.length; i += 1) {
      if (cursor == null) {
        return { found: false, value: undefined };
      }
      const key = String(parts[i] || "").trim();
      if (!key) {
        return { found: false, value: undefined };
      }
      let nextValue;
      try {
        nextValue = cursor[key];
      } catch (error) {
        return { found: false, value: undefined };
      }
      if (typeof nextValue === "undefined") {
        return { found: false, value: undefined };
      }
      cursor = nextValue;
    }
    return { found: true, value: cursor };
  }

  function tryResolveDirectSymbolValue(rawExpression, context, parent) {
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
      return Object.assign({ matched: true }, readPathValueFromBase(componentSource, source.slice("this.component.".length).split(".")));
    }
    if (source.indexOf("component.") === 0) {
      return Object.assign({ matched: true }, readPathValueFromBase(componentSource, source.slice("component.".length).split(".")));
    }
    if (source.indexOf("this.") === 0) {
      return Object.assign(
        { matched: true },
        readPathValueFromBase(parent && parent.nodeType === 1 ? parent : null, source.slice("this.".length).split("."))
      );
    }
    const parts = source.split(".");
    const head = String(parts[0] || "").trim();
    if (!head) {
      return { matched: true, found: false, value: undefined };
    }
    if (Object.prototype.hasOwnProperty.call(scope, head)) {
      return Object.assign({ matched: true }, readPathValueFromBase(scope[head], parts.slice(1)));
    }
    if (componentSource && (typeof componentSource === "object" || typeof componentSource === "function")) {
      let baseValue;
      try {
        baseValue = componentSource[head];
      } catch (error) {
        return { matched: true, found: false, value: undefined };
      }
      return Object.assign({ matched: true }, readPathValueFromBase(baseValue, parts.slice(1)));
    }
    const namedCallback = resolveNamedCallbackRuntime(head);
    if (typeof namedCallback === "function") {
      return Object.assign({ matched: true }, readPathValueFromBase(namedCallback, parts.slice(1)));
    }
    return { matched: true, found: false, value: undefined };
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

      if (core.NODE_TYPES.repeater && node.kind === core.NODE_TYPES.repeater) {
        renderRepeaterNode(node, parent, targetDocument, context);
        return;
      }

      if (String(node.kind || "").trim().toLowerCase() === Q_CALLBACK_NODE_KIND) {
        registerCallbackDeclarationNode(node, parent, targetDocument, context);
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
            buildInterpolationScope(context, element),
            "qhtml text interpolation failed:"
          );
        }
        element.appendChild(targetDocument.createTextNode(textContent));
      }

      if (Array.isArray(node.children)) {
        const childContext = createChildRenderContext(context);
        pushInstanceAliasScope(childContext);
        try {
          for (let i = 0; i < node.children.length; i += 1) {
            renderNode(node.children[i], element, targetDocument, childContext);
          }
        } finally {
          popInstanceAliasScope(childContext);
        }
      }
      applyRuntimeThemeRulesToHost(element, node);
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
    const contentContext = createChildRenderContext(context);
    try {
      for (let i = 0; i < expanded.length; i += 1) {
        renderNode(expanded[i], parent, targetDocument, contentContext);
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

    const contentContext = createChildRenderContext(context);
    pushInstanceAliasScope(contentContext);
    try {
      for (let i = 0; i < expanded.length; i += 1) {
        renderNode(expanded[i], hostElement, targetDocument, contentContext);
      }
    } finally {
      popInstanceAliasScope(contentContext);
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
    parent.appendChild(hostElement);
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

    bindComponentMethods(componentNode, hostElement, instanceNode);

    stack.push(key);
    context.componentHostStack.push(hostElement);
    context.componentQdomStack.push(instanceNode);
    try {
      renderComponentContentIntoHost(componentNode, instanceNode, hostElement, targetDocument, context);
    } finally {
      context.componentQdomStack.pop();
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
    renderComponentHostInstance(effectiveComponentNode, instanceNode, parent, targetDocument, context);
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
      disableLifecycleHooks: !!opts.disableLifecycleHooks,
      suppressModelViewWrapper: !!opts.suppressModelViewWrapper,
      capture: opts.capture ? opts.capture : null,
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
    const opts = options || {};
    const capture = opts.capture ? opts.capture : null;
    const fragment = renderDocumentToFragment(documentNode, doc, {
      capture: capture,
      componentRegistry: opts.componentRegistry instanceof Map ? opts.componentRegistry : null,
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
      disableLifecycleHooks: !!opts.disableLifecycleHooks,
    };
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

    bindComponentMethods(effectiveComponentNode, hostElement, instanceNode);

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
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
