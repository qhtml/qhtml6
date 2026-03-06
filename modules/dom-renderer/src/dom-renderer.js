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
    }
    if (scope.component && (typeof thisArg === "object" || typeof thisArg === "function") && thisArg) {
      try {
        thisArg.component = scope.component;
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
              componentQdom: resolveComponentQdomForInterpolation(context),
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
          componentQdom: resolveComponentQdomForInterpolation(context),
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
              componentQdom: resolveComponentQdomForInterpolation(context),
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
      componentQdomStack: [],
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
      componentHostStack: Array.isArray(opts.componentHostStack) ? opts.componentHostStack : [],
      componentQdomStack: Array.isArray(opts.componentQdomStack) ? opts.componentQdomStack : [],
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
    context.componentHostStack.push(hostElement);
    context.componentQdomStack.push(instanceNode);
    try {
      renderComponentContentIntoHost(componentNode, instanceNode, hostElement, doc, context);
    } finally {
      context.componentQdomStack.pop();
      context.componentHostStack.pop();
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
