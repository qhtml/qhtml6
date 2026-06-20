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

  function createRenderer(qdomInterface) {
    if (!qdomInterface) {
      throw new Error("QHTML WASM renderer requires a QDom interface");
    }

    function applyAttributes(element, attributes) {
      const attrs = parseObject(attributes);
      for (const [name, value] of Object.entries(attrs)) {
        if (value == null || value === false) {
          continue;
        }
        if (value === true) {
          element.setAttribute(name, "");
        } else {
          element.setAttribute(name, String(value));
        }
      }
    }

    function exposeQDom(element, node) {
      if (!element || !node || element.nodeType !== 1) {
        return element;
      }
      qdomInterface.rememberHandle(node);
      qdomInterface.rememberDom(node, element);
      Object.defineProperty(element, "qdom", {
        configurable: true,
        value() {
          return qdomInterface.createFacade(node);
        }
      });
      return element;
    }

    function appendRenderedChildren(target, node) {
      for (const child of qdomInterface.children(node)) {
        const rendered = renderNode(child);
        if (rendered) {
          target.appendChild(rendered);
        }
      }
    }

    function renderFragment(node) {
      const fragment = document.createDocumentFragment();
      appendRenderedChildren(fragment, node);
      return fragment;
    }

    function renderElement(node, object) {
      const element = document.createElement(normalizeTagName(object.tagName, "div"));
      applyAttributes(element, object.attributes);
      exposeQDom(element, node);
      if (object.textContent) {
        element.textContent = object.textContent;
      }
      appendRenderedChildren(element, node);
      return element;
    }

    function renderCustomInstance(node, object) {
      const tagName = object.componentId || object.classId || object.structId || object.tagName || "q-instance";
      const element = document.createElement(normalizeTagName(tagName, "q-instance"));
      applyAttributes(element, object.attributes);
      exposeQDom(element, node);
      appendRenderedChildren(element, node);
      return element;
    }

    function renderRawHtml(node, object) {
      const template = document.createElement("template");
      template.innerHTML = object.html || "";
      for (const child of template.content.querySelectorAll("*")) {
        if (!child.qdom) {
          exposeQDom(child, node);
        }
      }
      return template.content.cloneNode(true);
    }

    function renderShadowRoot(node) {
      const host = document.createElement("q-shadow-root");
      exposeQDom(host, node);
      const shadow = host.attachShadow({ mode: "open" });
      appendRenderedChildren(shadow, node);
      return host;
    }

    function renderNode(node) {
      if (!node) {
        return null;
      }

      qdomInterface.rememberHandle(node);
      const object = qdomInterface.nodeObject(node);
      const kind = object.kind || (typeof node.kind === "function" ? node.kind() : "");

      if (kind === "document") {
        return renderFragment(node);
      }
      if (kind === "element") {
        const tagName = normalizeTagName(object.tagName, "div");
        if (tagName === "q-shadow-root") {
          return renderShadowRoot(node);
        }
        return renderElement(node, object);
      }
      if (kind === "text") {
        return document.createTextNode(object.value || "");
      }
      if (kind === "raw-html") {
        return renderRawHtml(node, object);
      }
      if (kind === "slot" || kind === "slot-default") {
        return renderFragment(node);
      }
      if (kind === "component" || kind === "class" || kind === "struct") {
        qdomInterface.rememberHandle(node);
        return document.createComment("qhtml definition " + (object.componentId || object.classId || object.structId || ""));
      }
      if (kind === "component-instance" || kind === "class-instance" || kind === "template-instance" || kind === "struct-instance") {
        return renderCustomInstance(node, object);
      }

      const fallback = document.createElement("q-" + normalizeTagName(kind || "node"));
      exposeQDom(fallback, node);
      appendRenderedChildren(fallback, node);
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
      exposeQDom(hostElement, root);

      const rendered = renderNode(root);
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
