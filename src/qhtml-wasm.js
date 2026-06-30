var Module;

(function () {
  "use strict";

  const globalScope = typeof globalThis !== "undefined" ? globalThis : window;
  const currentScript = document.currentScript;
  const base = new URL(".", currentScript && currentScript.src ? currentScript.src : window.location.href).href;

  if (globalScope.QHTMLQtReady) {
    return;
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error("Failed to load " + src));
      document.head.appendChild(script);
    });
  }

  function createQtApi(qtModule) {
    function toVariant(value) {
      if (typeof qtModule.QVariant !== "function") {
        return value;
      }
      if (value instanceof qtModule.QVariant) {
        return value;
      }

      const variant = new qtModule.QVariant();
      if (value == null) {
        return variant;
      }
      if (typeof qtModule.QDomNode === "function" && value instanceof qtModule.QDomNode) {
        variant.setNode(value);
        return variant;
      }
      if (typeof qtModule.QDomDocument === "function" && value instanceof qtModule.QDomDocument) {
        variant.setDocument(value);
        return variant;
      }
      if (typeof value === "boolean") {
        variant.setBool(value);
        return variant;
      }
      if (typeof value === "number") {
        variant.setNumber(value);
        return variant;
      }
      if (typeof value === "string") {
        variant.setString(value);
        return variant;
      }
      if (Array.isArray(value)) {
        variant.setList();
        value.forEach((entry) => {
          variant.append(toVariant(entry));
        });
        return variant;
      }
      if (typeof value === "object") {
        variant.setMap();
        Object.keys(value).forEach((key) => {
          variant.setMapValue(key, toVariant(value[key]));
        });
        return variant;
      }
      return variant;
    }

    return {
      Module: qtModule,
      QObject: qtModule.QObject,
      QTimer: qtModule.QTimer,
      QPropertyAnimation: qtModule.QPropertyAnimation,
      QVariant: qtModule.QVariant,
      QDomNode: qtModule.QDomNode,
      QDomDocument: qtModule.QDomDocument,
      toVariant,
      createQObject() {
        return new qtModule.QObject();
      },
      createTimer() {
        return new qtModule.QTimer();
      },
      createPropertyAnimation() {
        return new qtModule.QPropertyAnimation();
      },
      createDocument(sourceOrAst) {
        return this.qdom.createDocument(sourceOrAst);
      },
      mountQHtmlElement(hostElement) {
        return this.renderer.mountQHtmlElement(hostElement);
      },
      mountAll(root) {
        return this.renderer.mountAll(root);
      }
    };
  }

  function mountWhenReady(api) {
    const run = () => api.mountAll(document);
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", run, { once: true });
    } else {
      run();
    }
  }

  async function boot() {
    await loadScript(base + "qhtml-wasm-glue.js");

    if (typeof globalScope.qhtml_qt_entry !== "function") {
      throw new Error("qhtml_qt_entry was not registered by qhtml-wasm-glue.js");
    }

    const qtModule = await globalScope.qhtml_qt_entry({
      locateFile(path) {
        if (path === "qhtml-qt.wasm") {
          return base + "qhtml-wasm.wasm";
        }
        return base + path;
      }
    }).then((module) => {
      Module = module;
      globalScope.Module = module;
      return module;
    });

    const api = createQtApi(qtModule);
    globalScope.QtWasm = qtModule;
    globalScope.QHTMLQt = api;

    await loadScript(base + "qhtml-wasm-renderer.js");

    api.renderer = globalScope.QHTMLWasmRenderer.create({ Module: qtModule, Qt: api });
    api.qdom = api.renderer.qdomInterface;
    globalScope.QHtml = api.renderer.createFacade();

    mountWhenReady(api);

    document.dispatchEvent(new CustomEvent("QHTMLQtReady", {
      detail: { Module: qtModule, Qt: api, QHtml: globalScope.QHtml }
    }));

    return api;
  }

  globalScope.QHTMLQtReady = boot();
})();
