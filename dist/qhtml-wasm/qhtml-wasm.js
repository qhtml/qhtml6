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
    return {
      Module: qtModule,
      QObject: qtModule.QObject,
      QTimer: qtModule.QTimer,
      QPropertyAnimation: qtModule.QPropertyAnimation,
      QHtmlParser: qtModule.QHtmlParser,
      QDomDocument: qtModule.QDomDocument,
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

   /*  await loadScript(base + "qdom-core.js");
        await loadScript(base + "qhtml-parser.js");
        await loadScript(base + "dom-renderer.js");
    await loadScript(base + "qhtml-wasm-runtime.js"); */

   await loadScript(base + "qhtml-wasm-dom-runtime.js");
      await loadScript(base + "qhtml-wasm-dom-renderer.js");







    api.qdom = globalScope.QHTMLWasmDomRuntime.create({ Module: qtModule, Qt: api });
    api.renderer = globalScope.QHTMLWasmDomRenderer.create(api.qdom);
    globalScope.QHtml = api.renderer.createFacade();

    mountWhenReady(api);

    document.dispatchEvent(new CustomEvent("QHTMLQtReady", {
      detail: { Module: qtModule, Qt: api, QHtml: globalScope.QHtml }
    }));

    return api;
  }

  globalScope.QHTMLQtReady = boot();
})();
