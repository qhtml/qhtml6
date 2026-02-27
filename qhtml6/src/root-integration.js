(function attachRootIntegration(global) {
  const modules = global.QHtmlModules || (global.QHtmlModules = {});
  const runtime = modules.qhtmlRuntime;

  if (!runtime) {
    return;
  }

  const api = runtime;
  api.version = "0.1.0";

  api.parseQHtml = function parseQHtml(source) {
    return modules.qhtmlParser.parseQHtmlToQDom(source || "");
  };

  api.parseQScript = function parseQScript(source) {
    return modules.qhtmlParser.parseQScript(source || "");
  };

  api.serializeQDom = function serializeQDom(qdomDocument) {
    return modules.qdomCore.serializeQDomCompressed(qdomDocument);
  };

  api.deserializeQDom = function deserializeQDom(payload) {
    return modules.qdomCore.deserializeQDomCompressed(payload);
  };

  api.renderInto = function renderInto(qdomDocument, hostElement) {
    return modules.domRenderer.renderIntoElement(qdomDocument, hostElement);
  };

  global.QHtml = api;
})(typeof globalThis !== "undefined" ? globalThis : window);

