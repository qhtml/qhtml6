var Module;

(function () {
  "use strict";

  const globalScope = typeof globalThis !== "undefined" ? globalThis : window;
  const currentScript = document.currentScript;
  const base = new URL(".", currentScript && currentScript.src ? currentScript.src : window.location.href).href;
  const qtBase = base + "qhtml-wasm/";
  const qhtmlSrc = base + "qhtml.js";

  if (globalScope.QHTMLQtReady) {
    return;
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error("Failed to load " + src));
      document.head.appendChild(s);
    });
  }

  function createQtApi(Module) {
    return {
      Module,
      QObject: Module.QObject,
      QTimer: Module.QTimer,
      QPropertyAnimation: Module.QPropertyAnimation,
      createQObject() {
        return new Module.QObject();
      },
      createTimer() {
        return new Module.QTimer();
      },
      createPropertyAnimation() {
        return new Module.QPropertyAnimation();
      }
    };
  }

  function waitForQHtmlRuntime() {
    const startedAt = Date.now();
    const timeoutMs = 15000;

    return new Promise((resolve, reject) => {
      function check() {
        if (globalScope.QHtml && typeof globalScope.QHtml.mountQHtmlElement === "function") {
          resolve(globalScope.QHtml);
          return;
        }

        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error("Timed out waiting for qhtml.js runtime"));
          return;
        }

        setTimeout(check, 10);
      }

      check();
    });
  }

  function loadQHtmlRuntime() {
    const scriptPromise = loadScript(qhtmlSrc);
    const runtimePromise = waitForQHtmlRuntime();

    scriptPromise.catch(() => {});
    return Promise.race([
      Promise.all([scriptPromise, runtimePromise]).then(([, runtime]) => runtime),
      runtimePromise
    ]);
  }

  async function boot() {
    await loadScript(qtBase + "qtloader.js");
    await loadScript(qtBase + "qhtml-qt.js");

    if (typeof globalScope.qhtml_qt_entry !== "function") {
      throw new Error("qhtml_qt_entry was not registered by qhtml-qt.js");
    }

    const qtModule = await globalScope.qhtml_qt_entry().then(function(module) {
      Module = module;
      globalScope.Module = module;
      return module;
    });

    const api = createQtApi(qtModule);
    globalScope.QtWasm = qtModule;
    globalScope.QHTMLQt = api;

    await loadQHtmlRuntime();

    document.dispatchEvent(new CustomEvent("QHTMLQtReady", {
      detail: { Module: qtModule, Qt: api }
    }));

    return api;
  }

  globalScope.QHTMLQtReady = boot();
})();
