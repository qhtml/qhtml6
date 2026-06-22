(function () {
  "use strict";

  const globalScope = typeof globalThis !== "undefined" ? globalThis : window;

  function normalizeTagName(value, fallback) {
    const tag = String(value || fallback || "div").trim();
    return tag ? tag.toLowerCase() : "div";
  }

  function parseObject(value) {
    if (!value) {
      return {};
    }
    if (typeof value === "object") {
      return value;
    }
    try {
      return JSON.parse(value);
    } catch (_error) {
      return {};
    }
  }

  function parseMeta(object) {
    return object && object.meta && typeof object.meta === "object" ? object.meta : {};
  }

  function metaType(object) {
    const meta = parseMeta(object);
    return String(meta.type || object.type || "").trim();
  }

  function readAlias(object) {
    const meta = parseMeta(object);
    return String(object.alias || meta.__qhtmlInstanceAlias || object.name || "").trim();
  }

  function collectText(node, qdomInterface) {
    if (!node) {
      return "";
    }
    const object = qdomInterface.nodeObject(node);
    const kind = object.kind || "";
    if (kind === "text") {
      return String(object.value || "");
    }
    return qdomInterface.children(node).map((child) => collectText(child, qdomInterface)).join(" ").trim();
  }

  function createRenderer(qdomInterface) {
    if (!qdomInterface) {
      throw new Error("QHTML WASM renderer requires a QDom interface");
    }

    function childContext(parentContext, owner, overrides) {
      return qdomInterface.createContext(parentContext, owner, overrides || {});
    }

    function applyAttributes(element, attributes, context, node) {
      const attrs = parseObject(attributes);
      for (const [name, value] of Object.entries(attrs)) {
        if (value == null || value === false) {
          continue;
        }
        const attrName = String(name || "");
        const attrValue = typeof value === "string"
          ? qdomInterface.interpolate(value, context, element)
          : value;
        if (/^on[A-Za-z]/.test(attrName) && typeof attrValue === "string") {
          const eventName = attrName.slice(2).toLowerCase();
          element.addEventListener(eventName, (event) => {
            qdomInterface.executeScript(attrValue, context, element, { event, node: qdomInterface.createContextValue(node, element) }, [event], ["event"]);
          });
          continue;
        }
        if (attrValue === true) {
          element.setAttribute(attrName, "");
        } else {
          element.setAttribute(attrName, String(attrValue));
        }
      }
    }

    function exposeQDom(element, node, context) {
      if (!element || !node || element.nodeType !== 1) {
        return element;
      }
      qdomInterface.rememberHandle(node);
      qdomInterface.rememberDom(node, element);
      if (context) {
        qdomInterface.bindContextValue(element, context);
      }
      Object.defineProperty(element, "qdom", {
        configurable: true,
        value() {
          return qdomInterface.createFacade(node);
        }
      });
      const contextValue = qdomInterface.createContextValue(node, element);
      if (contextValue) {
        qdomInterface.bindContextValue(contextValue, context);
      }
      return element;
    }

    function appendRenderedChildren(target, node, context) {
      for (const child of qdomInterface.children(node)) {
        const rendered = renderNode(child, context, target && target.nodeType === 1 ? target : null);
        if (rendered) {
          target.appendChild(rendered);
        }
      }
    }

    function renderFragment(node, context) {
      const fragment = document.createDocumentFragment();
      appendRenderedChildren(fragment, node, context);
      return fragment;
    }

    function runScriptRule(node, object, parent, context) {
      const name = String(object.name || "").trim();
      const type = metaType(object);
      const body = String(object.body || "");
      if (type === "SignalDeclaration") {
        const target = parent && parent.nodeType === 1 ? parent : context && context.component;
        if (target) {
          target[name] = function emitSignal(payload) {
            const facade = typeof target.qdom === "function" ? target.qdom() : null;
            if (facade && typeof facade.emit === "function") {
              facade.emit(name, payload);
            }
          };
        }
        return;
      }
      if (/^on[A-Za-z]/.test(name) && parent && parent.nodeType === 1) {
        const eventName = name.slice(2).toLowerCase();
        const parameters = object.parameters || "";
        parent.addEventListener(eventName, (event) => {
          qdomInterface.executeScript(body, context, parent, { event }, [event], parameters || ["event"]);
        });
        return;
      }
      if (type === "FunctionBlock" || (name && body)) {
        const targetValue = context && context.component ? context.component : null;
        if (targetValue && name && !/^on[A-Za-z]/.test(name)) {
          targetValue[name] = function qhtmlWasmContextFunction() {
            return qdomInterface.executeScript(body, context, parent || targetValue, {}, Array.from(arguments), object.parameters || "");
          };
          qdomInterface.registerAlias(context, name, targetValue[name]);
        }
      }
    }

    function renderElement(node, object, context) {
      const element = document.createElement(normalizeTagName(object.tagName, "div"));
      exposeQDom(element, node, context);
      applyAttributes(element, object.attributes, context, node);
      if (object.textContent) {
        element.textContent = qdomInterface.interpolate(object.textContent, context, element);
      }
      for (const child of qdomInterface.children(node)) {
        const childObject = qdomInterface.nodeObject(child);
        if ((childObject.kind || "") === "script-rule") {
          runScriptRule(child, childObject, element, context);
          continue;
        }
        const rendered = renderNode(child, context, element);
        if (rendered) {
          element.appendChild(rendered);
        }
      }
      return element;
    }

    function renderCustomInstance(node, object, context) {
      const tagName = object.componentId || object.classId || object.structId || object.tagName || "q-instance";
      const element = document.createElement(normalizeTagName(tagName, "q-instance"));
      const instanceContext = childContext(context, node, {});
      const contextValue = qdomInterface.createContextValue(node, element);
      instanceContext.component = contextValue;
      exposeQDom(element, node, instanceContext);
      applyAttributes(element, object.attributes, instanceContext, node);
      const props = parseObject(object.props);
      for (const [name, value] of Object.entries(props)) {
        const resolved = typeof value === "string" ? qdomInterface.interpolate(value, instanceContext, element) : value;
        qdomInterface.writeProperty(node, name, resolved);
      }
      const alias = readAlias(object);
      if (alias) {
        qdomInterface.registerAlias(context, alias, contextValue);
        qdomInterface.registerAlias(instanceContext, alias, contextValue);
      }
      appendRenderedChildren(element, node, instanceContext);
      return element;
    }

    function renderRawHtml(node, object, context) {
      const template = document.createElement("template");
      template.innerHTML = qdomInterface.interpolate(object.html || "", context, null);
      for (const child of template.content.querySelectorAll("*")) {
        if (!child.qdom) {
          exposeQDom(child, node, context);
        }
      }
      return template.content.cloneNode(true);
    }

    function renderShadowRoot(node, context) {
      const host = document.createElement("q-shadow-root");
      exposeQDom(host, node, context);
      const shadow = host.attachShadow({ mode: "open" });
      appendRenderedChildren(shadow, node, context);
      return host;
    }

    function registerDefinition(node, object, context) {
      const id = String(object.componentId || object.classId || object.structId || "").trim();
      if (id) {
        qdomInterface.registerAlias(context, id, qdomInterface.createContextValue(node));
      }
      qdomInterface.rememberHandle(node);
    }

    function renderQVar(node, object, context, parent) {
      const meta = parseMeta(object);
      const parsed = qdomInterface.parseQVarRaw(meta.raw || object.raw || "");
      const name = parsed.name || object.name || meta.name || "";
      if (!name) {
        return null;
      }
      const value = qdomInterface.evaluateExpression(parsed.body || object.body || "", context, parent || null, {}, { pathFallbackLiteral: false });
      const handle = qdomInterface.createQVarHandle(name, value);
      qdomInterface.registerAlias(context, name, handle);
      return null;
    }

    function renderConnect(node, object, context) {
      const source = collectText(node, qdomInterface) || String(parseMeta(object).raw || "").replace(/^\s*q-connect\s*\{|\}\s*$/g, "");
      qdomInterface.connectEndpoints(context, source);
      return null;
    }

    function renderNode(node, context, parent) {
      if (!node) {
        return null;
      }

      qdomInterface.rememberHandle(node);
      const object = qdomInterface.nodeObject(node);
      const kind = object.kind || (typeof node.kind === "function" ? node.kind() : "");
      const tagName = normalizeTagName(object.tagName, "");

      if (kind === "document") {
        return renderFragment(node, context);
      }
      if (kind === "element") {
        if (tagName === "q-connect") {
          return renderConnect(node, object, context);
        }
        if (tagName === "q-shadow-root") {
          return renderShadowRoot(node, context);
        }
        return renderElement(node, object, context);
      }
      if (kind === "text") {
        return document.createTextNode(qdomInterface.interpolate(object.value || "", context, parent));
      }
      if (kind === "raw-html") {
        return renderRawHtml(node, object, context);
      }
      if (kind === "slot" || kind === "slot-default") {
        return renderFragment(node, context);
      }
      if (kind === "qvardeclaration") {
        return renderQVar(node, object, context, parent);
      }
      if (kind === "script-rule") {
        runScriptRule(node, object, parent, context);
        return null;
      }
      if (kind === "component" || kind === "class" || kind === "struct") {
        registerDefinition(node, object, context);
        return document.createComment("qhtml definition " + (object.componentId || object.classId || object.structId || ""));
      }
      if (kind === "component-instance" || kind === "class-instance" || kind === "template-instance" || kind === "struct-instance") {
        return renderCustomInstance(node, object, context);
      }

      const fallback = document.createElement("q-" + normalizeTagName(kind || "node"));
      exposeQDom(fallback, node, context);
      appendRenderedChildren(fallback, node, context);
      return fallback;
    }

    function mountQHtmlElement(hostElement) {
      if (!hostElement) {
        throw new Error("mountQHtmlElement requires a host element");
      }

      const source = hostElement.textContent || "";
      const documentHandle = qdomInterface.createDocument(source);
      const root = documentHandle.root();
      qdomInterface.documentByHost.set(hostElement, documentHandle);
      qdomInterface.rememberHandle(root);

      hostElement.textContent = "";
      hostElement.setAttribute("data-qhtml-wasm-mounted", "true");
      const rootContext = qdomInterface.createContext(null, root, {
        hostElement,
        namedRuntimeValues: Object.create(null),
        exportAliasesToHost: true
      });
      qdomInterface.bindContextValue(hostElement, rootContext);
      exposeQDom(hostElement, root, rootContext);

      const rendered = renderNode(root, rootContext, hostElement);
      if (rendered) {
        hostElement.appendChild(rendered);
      }

      return qdomInterface.createFacade(root);
    }

    function mountAll(root) {
      const scope = root || document;
      const mounted = [];
      for (const host of scope.querySelectorAll("q-html:not([data-qhtml-wasm-mounted])")) {
        mounted.push(mountQHtmlElement(host));
      }
      return mounted;
    }

    function rerenderByUuid(uuid) {
      const element = qdomInterface.findDomByUuid(uuid);
      const node = qdomInterface.findHandleByUuid(uuid);
      if (!element || !node || !element.parentNode) {
        return null;
      }

      const replacement = renderNode(node);
      if (!replacement) {
        return null;
      }
      element.parentNode.replaceChild(replacement, element);
      return replacement;
    }

    function createFacade() {
      return {
        mountQHtmlElement,
        mountAll,
        rerenderByUuid,
        parse: qdomInterface.parse,
        createDocument: qdomInterface.createDocument,
        rootContext: qdomInterface.rootContext,
        setContextProperty: qdomInterface.rootContext.set,
        getContextProperty: qdomInterface.rootContext.get,
        createChildContext: qdomInterface.rootContext.child,
        qdomInterface
      };
    }

    return {
      mountQHtmlElement,
      mountAll,
      renderNode,
      rerenderByUuid,
      createFacade
    };
  }

  globalScope.QHTMLWasmDomRenderer = {
    create: createRenderer
  };
})();
