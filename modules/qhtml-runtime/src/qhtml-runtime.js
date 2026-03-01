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
  const MAX_UPDATE_CYCLES_PER_TICK = 1000;
  const MAX_UPDATE_REENTRIES_PER_EPOCH = 1000;

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

  function evaluateBindingExpression(node, bindingSpec) {
    const scriptBody = String(bindingSpec && bindingSpec.script ? bindingSpec.script : "").trim();
    if (!scriptBody) {
      return undefined;
    }
    try {
      const fn = new Function(scriptBody);
      return fn.call(node || {});
    } catch (error) {
      if (global.console && typeof global.console.error === "function") {
        global.console.error("qhtml q-bind evaluation failed:", error);
      }
      return undefined;
    }
  }

  function applyBindingValueToNode(node, bindingSpec, value) {
    if (!node || typeof node !== "object" || !bindingSpec || typeof bindingSpec !== "object") {
      return;
    }
    const key = String(bindingSpec.name || "").trim();
    if (!key) {
      return;
    }
    const targetCollection = normalizeBindingTargetCollection(bindingSpec.targetCollection);
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

  function evaluateAllNodeBindings(binding) {
    if (!binding || typeof core.walkQDom !== "function") {
      return;
    }
    const root = binding.rawQdom || binding.qdom;
    if (!root) {
      return;
    }
    evaluateNodeBindingsInTree(root);
  }

  function evaluateNodeBindingsInTree(rootNode) {
    if (!rootNode || typeof core.walkQDom !== "function") {
      return;
    }
    core.walkQDom(rootNode, function evaluateBindingsForNode(node) {
      const entries = readNodeBindingEntries(node);
      if (entries.length === 0) {
        return;
      }
      for (let i = 0; i < entries.length; i += 1) {
        const entry = entries[i];
        const value = evaluateBindingExpression(node, entry);
        applyBindingValueToNode(node, entry, value);
      }
    });
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

  function renderScopedComponentBinding(binding, scopeElement) {
    if (!binding || !binding.qdom || !scopeElement || scopeElement.nodeType !== 1) {
      return false;
    }

    const sourceScopeNode = sourceNodeOf(binding.nodeMap && binding.nodeMap.get(scopeElement));
    if (!sourceScopeNode || typeof sourceScopeNode !== "object") {
      return false;
    }

    const scopeKind = String(sourceScopeNode.kind || "").trim().toLowerCase();
    if (scopeKind !== "component-instance" && scopeKind !== "template-instance") {
      return false;
    }

    const targetDocument = binding.doc || scopeElement.ownerDocument || global.document;
    if (!targetDocument) {
      return false;
    }

    evaluateNodeBindingsInTree(sourceScopeNode);
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
    parentNode.replaceChild(replacement, scopeElement);

    mergeCapturedMappingsIntoBinding(binding, {
      nodeMap: capturedNodeMap,
      componentMap: capturedComponentMap,
      slotMap: capturedSlotMap,
    });

    hydrateRegisteredComponentHostsInNode(replacement, targetDocument);
    attachDomQDomAccessors(binding);
    attachDomControlSync(binding);
    attachScriptRules(binding);
    persistQDomTemplate(binding);
    return true;
  }

  function renderBinding(binding) {
    if (!binding || !binding.qdom) {
      return;
    }
    binding.rendering = true;
    evaluateAllNodeBindings(binding);
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
    host.update = function hostUpdateAccessor() {
      return updateQHtmlElement(host);
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

    const source =
      typeof qHtmlElement.textContent === "string" && qHtmlElement.textContent.length > 0
        ? qHtmlElement.textContent
        : (qHtmlElement.innerHTML || "");
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
    if (
      binding.updateGuardState &&
      binding.updateGuardState.tickResetTimer &&
      typeof global.clearTimeout === "function"
    ) {
      global.clearTimeout(binding.updateGuardState.tickResetTimer);
      binding.updateGuardState.tickResetTimer = null;
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
        tickResetTimer: null,
      };
      binding.updateGuardState = state;
    }
    return state;
  }

  function scheduleUpdateGuardTickReset(state) {
    if (!state || state.tickResetTimer || typeof global.setTimeout !== "function") {
      return;
    }
    state.tickResetTimer = global.setTimeout(function onTickReset() {
      state.tickResetTimer = null;
      state.cyclesInTick = 0;
      state.reentryCountInEpoch = 0;
    }, 0);
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
    const opts = options && typeof options === "object" ? options : null;
    const requestedScopeElement =
      opts && opts.scopeElement && opts.scopeElement.nodeType === 1 ? opts.scopeElement : null;
    const state = ensureBindingUpdateGuardState(binding);
    if (!state) {
      return false;
    }
    scheduleUpdateGuardTickReset(state);

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
        if (!activeScopeElement || !renderScopedComponentBinding(binding, activeScopeElement)) {
          renderBinding(binding);
        }
      } finally {
        state.inProgress = false;
      }
      if (!state.queued) {
        break;
      }
    }
    return true;
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
    updateQHtmlElement: updateQHtmlElement,
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
