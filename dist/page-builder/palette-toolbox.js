(function () {
  "use strict";

  var Q = {
    layout: "q-layout",
    row: "q-row",
    col: "q-col",
    toolbox: "q-palette-toolbox",
    button: "q-palette-toolbox-button",
    item: "q-builder-item",
    fill: "fill",
    gap: "12px"
  };

  function arr(x) {
    return Array.prototype.slice.call(x || []);
  }

  function tag(el) {
    return el && el.tagName ? el.tagName.toLowerCase() : "";
  }

  function direct(parent, tagName) {
    return arr(parent ? parent.children : []).filter(function (x) {
      return tag(x) === tagName;
    });
  }

  function safeAttr(el, name, fallback) {
    var value = el && el.getAttribute ? el.getAttribute(name) : null;
    return value === null || value === undefined || value === "" ? fallback : value;
  }

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function indexOf(idx, len, insert) {
    if (idx === Infinity || idx === "inf" || idx === "infinity") {
      return insert ? len : Math.max(0, len - 1);
    }
    if (idx === undefined || idx === null) {
      return insert ? len : 0;
    }
    idx = Number(idx);
    if (!Number.isFinite(idx)) {
      return insert ? len : 0;
    }
    if (idx < 0) {
      return Math.max(0, len + idx);
    }
    return insert ? clamp(idx, 0, len) : clamp(idx, 0, Math.max(0, len - 1));
  }

  function sizeValue(v, fallback) {
    if (v === undefined || v === null || v === "") {
      return fallback || "auto";
    }
    v = String(v).trim();
    if (v === Q.fill) {
      return Q.fill;
    }
    if (/^-?\d+(\.\d+)?$/.test(v)) {
      return v + "px";
    }
    return v;
  }

  function track(v) {
    v = sizeValue(v, Q.fill);
    return v === Q.fill ? "minmax(0, 1fr)" : v;
  }

  function rootOf(el) {
    return tag(el) === Q.layout ? el : el && el.closest ? el.closest(Q.layout) : null;
  }

  function axisOf(el) {
    var axis = el ? el.getAttribute("axis") || el.getAttribute("flow") : "";
    var rows = direct(el, Q.row);
    var cols = direct(el, Q.col);

    if (axis === "rows" || axis === "row" || axis === "vertical") {
      return "rows";
    }
    if (axis === "cols" || axis === "columns" || axis === "horizontal") {
      return "cols";
    }
    if (rows.length && !cols.length) {
      return "rows";
    }
    if (cols.length && !rows.length) {
      return "cols";
    }
    if (tag(el) === Q.layout) {
      return "rows";
    }
    if (tag(el) === Q.row) {
      return "cols";
    }
    if (tag(el) === Q.col) {
      return rows.length ? "rows" : null;
    }
    return null;
  }

  function layoutType(el) {
    var root = rootOf(el);
    var type = safeAttr(el, "type", root && root.getAttribute("type") || "grid");
    return String(type).toLowerCase() === "flex" ? "flex" : "grid";
  }

  function childSize(child, axis) {
    return axis === "rows" ? child.getAttribute("height") || Q.fill : child.getAttribute("width") || Q.fill;
  }

  function installApi(el) {
    if (!el || el.__qLayoutApi) {
      return el;
    }

    Object.defineProperties(el, {
      rows: { value: function () { return direct(this, Q.row).map(installApi); } },
      row: { value: function (idx) { var rows = this.rows(); return rows.length ? rows[indexOf(idx, rows.length, false)] : null; } },
      cols: { value: function () { return direct(this, Q.col).map(installApi); } },
      col: { value: function (idx) { var cols = this.cols(); return cols.length ? cols[indexOf(idx, cols.length, false)] : null; } },
      addRow: { value: function (idx, attrs, text) { return insertChild(this, Q.row, idx, attrs, text); } },
      addCol: { value: function (idx, attrs, text) { return insertChild(this, Q.col, idx, attrs, text); } },
      removeRow: { value: function (idx) { return removeChild(this, Q.row, idx); } },
      removeCol: { value: function (idx) { return removeChild(this, Q.col, idx); } },
      relayout: { value: function () { schedule(this); return this; } }
    });

    el.__qLayoutApi = true;
    return el;
  }

  function make(tagName, attrs, text) {
    var el = document.createElement(tagName);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (attrs[k] !== undefined && attrs[k] !== null) {
          el.setAttribute(k, String(attrs[k]));
        }
      });
    }
    if (text !== undefined && text !== null) {
      el.textContent = String(text);
    }
    return installApi(el);
  }

  function insertChild(parent, tagName, idx, attrs, text) {
    var children = direct(parent, tagName);
    var i = indexOf(idx, children.length, true);
    var child = make(tagName, attrs, text);
    parent.insertBefore(child, children[i] || null);
    schedule(parent);
    BuilderStore.saveSoon();
    return child;
  }

  function removeChild(parent, tagName, idx) {
    var children = direct(parent, tagName);
    var child;
    if (!children.length) {
      return null;
    }
    child = children[indexOf(idx, children.length, false)];
    if (child) {
      child.remove();
      schedule(parent);
      BuilderStore.saveSoon();
    }
    return child;
  }

  function applyContainer(el) {
    var axis = axisOf(el);
    var children;
    var width;
    var height;

    installApi(el);

    if (tag(el) === Q.layout) {
      width = sizeValue(el.getAttribute("width"), "");
      height = sizeValue(el.getAttribute("height"), "");
      if (width) { el.style.width = width; }
      if (height) { el.style.height = height; }
    }

    if (!axis) {
      return;
    }

    children = axis === "rows" ? direct(el, Q.row) : direct(el, Q.col);
    if (!children.length) {
      return;
    }

    el.style.gap = el.getAttribute("gap") || Q.gap;

    if (layoutType(el) === "flex") {
      el.style.display = "flex";
      el.style.flexDirection = axis === "rows" ? "column" : "row";
      children.forEach(function (child) {
        var s = sizeValue(childSize(child, axis), Q.fill);
        if (s === Q.fill) {
          child.style.flex = "1 1 0";
        } else {
          child.style.flex = "0 0 " + s;
          if (axis === "rows") { child.style.height = s; } else { child.style.width = s; }
        }
      });
      return;
    }

    el.style.display = "grid";
    if (axis === "rows") {
      el.style.gridTemplateRows = children.map(function (child) { return track(childSize(child, "rows")); }).join(" ");
      el.style.gridTemplateColumns = "";
    } else {
      el.style.gridTemplateColumns = children.map(function (child) { return track(childSize(child, "cols")); }).join(" ");
      el.style.gridTemplateRows = "";
    }
  }

  function walk(root, fn) {
    if (!root) { return; }
    fn(root);
    arr(root.querySelectorAll(Q.row + "," + Q.col)).forEach(fn);
  }

  function relayout(root) {
    if (!root) { return; }
    walk(root, installApi);
    walk(root, applyContainer);
    markEmptyColumns(root);
  }

  function schedule(el) {
    var root = rootOf(el);
    if (!root) { return; }
    if (root.__qLayoutFrame) {
      cancelAnimationFrame(root.__qLayoutFrame);
    }
    root.__qLayoutFrame = requestAnimationFrame(function () {
      root.__qLayoutFrame = 0;
      relayout(root);
    });
  }

  function markEmptyColumns(root) {
    directAndNested(root, Q.col).forEach(function (col) {
      var hasItems = !!col.querySelector(Q.item);
      var hasStructural = direct(col, Q.row).length > 0 || direct(col, Q.layout).length > 0;
      col.classList.toggle("q-col-empty", !hasItems && !hasStructural && !col.querySelector(".pb-empty-drop"));
    });
  }

  function directAndNested(root, tagName) {
    var out = [];
    if (tag(root) === tagName) { out.push(root); }
    return out.concat(arr(root.querySelectorAll(tagName)));
  }

  function injectStyles() {
    if (document.getElementById("q-layout-toolbox-style")) {
      return;
    }

    var style = document.createElement("style");
    style.id = "q-layout-toolbox-style";
    style.textContent = [
      ":root{--pb-ink:#172033;--pb-muted:#607089;--pb-panel:#ffffff;--pb-line:#d8e0ec;--pb-blue:#2563eb;--pb-cyan:#06b6d4;--pb-red:#dc2626;--pb-bg:#ecf2f9}",
      "body{margin:0;background:radial-gradient(circle at 10% 0%,#dbeafe 0,#eef5ff 34%,#e7edf5 100%);font-family:'Aptos','Segoe UI',sans-serif;color:var(--pb-ink)}",
      ".pb-app{min-height:100vh;display:grid;grid-template-rows:auto minmax(0,1fr)}",
      ".pb-toolbar{height:78px;display:flex;align-items:center;justify-content:space-between;padding:0 24px;background:rgba(255,255,255,.86);backdrop-filter:blur(18px);border-bottom:1px solid rgba(148,163,184,.38);box-shadow:0 14px 48px rgba(15,23,42,.08);position:sticky;top:0;z-index:50}",
      ".pb-brand{display:flex;align-items:center;gap:14px}.pb-logo{width:44px;height:44px;border-radius:16px;display:grid;place-items:center;background:linear-gradient(135deg,#0f172a,#2563eb);color:white;font-weight:950;font-size:22px;box-shadow:0 12px 28px rgba(37,99,235,.28)}",
      ".pb-brand h1{font-size:22px;line-height:1;margin:0;letter-spacing:-.04em}.pb-brand p{margin:.35rem 0 0;color:var(--pb-muted);font-size:13px}",
      ".pb-actions{display:flex;gap:10px;flex-wrap:wrap}.pb-action{border:0;border-radius:999px;padding:10px 15px;font-weight:800;cursor:pointer;box-shadow:0 8px 22px rgba(15,23,42,.08)}.pb-action.primary{background:#0f172a;color:white}.pb-action.secondary{background:white;color:#1d4ed8;border:1px solid #c7d2fe}.pb-action.danger{background:#fff1f2;color:#be123c;border:1px solid #fecdd3}",
      ".pb-workspace{min-height:0;display:grid;grid-template-columns:300px minmax(0,1fr);gap:18px;padding:18px}.pb-main{min-width:0;display:grid;grid-template-rows:minmax(0,1fr) 260px;gap:18px}.pb-sidebar{min-height:0;background:rgba(15,23,42,.92);border:1px solid rgba(148,163,184,.24);border-radius:26px;box-shadow:0 28px 80px rgba(15,23,42,.22);overflow:hidden;color:white}.pb-sidebar-head{padding:22px 22px 10px}.pb-sidebar h2,.pb-canvas-meta h2,.pb-export-head h2{margin:0;font-size:18px;letter-spacing:-.03em}.pb-sidebar p,.pb-canvas-meta p,.pb-export-head p{margin:.45rem 0 0;color:#93a4bc;font-size:13px;line-height:1.4}",
      "q-layout,q-row,q-col,q-palette-toolbox,q-palette-toolbox-button,q-builder-item{box-sizing:border-box;min-width:0;min-height:0}",
      "q-layout{display:grid;gap:12px;background:linear-gradient(180deg,#f8fbff,#edf4ff);border:1px solid #cbd8ea;border-radius:24px;padding:14px;overflow:auto;color:#0f172a;position:relative}",
      "q-row{display:grid;gap:12px;overflow:visible;border:1px dashed rgba(37,99,235,.24);border-radius:20px;padding:10px;background:rgba(255,255,255,.38)}",
      "q-col{display:block;overflow:visible;background:rgba(255,255,255,.92);border:1px solid #d8e0ec;border-radius:18px;padding:14px;color:#0f172a;box-shadow:0 12px 28px rgba(15,23,42,.08);position:relative;transition:border-color .14s ease,box-shadow .14s ease,background .14s ease}",
      "q-col.q-col-empty:after{content:'Drop here';display:grid;place-items:center;min-height:92px;border:1px dashed #adc2df;border-radius:14px;color:#7b8da5;font-weight:800;background:rgba(241,245,249,.72)}",
      ".pb-canvas-shell,.pb-export-panel{background:rgba(255,255,255,.78);border:1px solid rgba(148,163,184,.42);border-radius:26px;box-shadow:0 22px 70px rgba(15,23,42,.12);overflow:hidden}.pb-canvas-meta,.pb-export-head{display:flex;justify-content:space-between;align-items:center;padding:18px 20px;border-bottom:1px solid rgba(148,163,184,.28);background:rgba(248,250,252,.82)}.pb-status{font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:#1d4ed8;background:#dbeafe;border:1px solid #bfdbfe;border-radius:999px;padding:8px 11px}.pb-stage{padding:18px;overflow:auto}.pb-empty-drop{min-height:180px;display:grid;place-items:center;text-align:center;border:1px dashed #b7c6dc;border-radius:16px;background:linear-gradient(180deg,#f8fbff,#eef5ff);color:#64748b}.pb-empty-drop h3{margin:0 0 6px;font-size:20px;color:#1e293b}.pb-empty-drop p{margin:0;font-size:13px}",
      "q-palette-toolbox{display:block;color:#0f172a}q-palette-toolbox:not([docked='true']){position:fixed;left:24px;top:24px;z-index:5000;width:250px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:20px;box-shadow:0 24px 70px rgba(0,0,0,.35);overflow:hidden;user-select:none}.q-palette-titlebar{cursor:move;padding:13px 15px;background:#0f172a;color:white;font-weight:950;letter-spacing:-.035em}.q-palette-body{border:0;border-radius:0;background:transparent;box-shadow:none;padding:10px 16px 18px}.q-palette-body q-layout{background:transparent;border:0;padding:0;overflow:visible}.q-palette-body q-row{border:0;background:transparent;padding:0}.q-palette-body q-col{padding:0;border:0;background:transparent;box-shadow:none}",
      "q-palette-toolbox-button{display:block;position:relative;min-height:76px;padding:0;border-radius:18px;background:white;border:1px solid rgba(148,163,184,.3);box-shadow:0 12px 26px rgba(0,0,0,.18);cursor:grab;overflow:hidden}q-palette-toolbox-button:active{cursor:grabbing}.pb-palette-preview{min-height:76px;padding:14px;background:linear-gradient(135deg,#ffffff,#eef6ff);border-left:5px solid #2563eb}.pb-palette-preview h3{margin:0;font-size:14px}.pb-palette-preview p{margin:4px 0 0;font-size:12px;color:#64748b}.pb-palette-preview.hero{border-color:#06b6d4}.pb-palette-preview.card{border-color:#6366f1}.pb-palette-preview.columns{border-color:#14b8a6}.pb-palette-preview.callout{border-color:#f59e0b}.pb-palette-preview.buttons{border-color:#ec4899}.pb-palette-preview.edited{max-height:132px;overflow:hidden;border-color:#2563eb}.pb-palette-edit-button{position:absolute;top:8px;right:8px;z-index:4;width:30px;height:30px;display:grid;place-items:center;border:1px solid rgba(37,99,235,.22);border-radius:999px;background:rgba(255,255,255,.92);color:#1d4ed8;box-shadow:0 8px 20px rgba(15,23,42,.16);cursor:pointer}.pb-palette-edit-button:hover{background:#eff6ff;color:#0f172a}.pb-palette-edit-button svg{width:15px;height:15px;display:block}",
      "q-builder-item{display:block;position:relative;margin:0;border-radius:18px;border:1px solid rgba(37,99,235,.28);background:white;box-shadow:0 14px 34px rgba(15,23,42,.1);overflow:hidden;cursor:grab}q-builder-item:active{cursor:grabbing}q-builder-item.pb-selected{outline:3px solid rgba(37,99,235,.32)}.q-builder-item-bar{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 9px;background:#eff6ff;border-bottom:1px solid #bfdbfe;color:#1d4ed8;font-size:11px;font-weight:950;letter-spacing:.04em;text-transform:uppercase}.q-builder-item-actions{display:flex;gap:5px}.q-builder-item-actions button{border:0;border-radius:999px;background:white;color:#1d4ed8;font-weight:950;font-size:11px;padding:3px 7px;cursor:pointer}.q-builder-item-actions button.danger{color:#be123c}.q-builder-item-preview{padding:14px}",
      ".pb-hero-block{padding:32px;border-radius:20px;background:linear-gradient(135deg,#0f172a,#1d4ed8);color:white}.pb-hero-block h1{margin:0;font-size:38px;letter-spacing:-.06em}.pb-hero-block p{max-width:560px;color:#dbeafe}.pb-demo-button{border:0;border-radius:999px;background:#22d3ee;color:#0f172a;font-weight:900;padding:10px 16px}.pb-demo-button.ghost{background:white;color:#1d4ed8;border:1px solid #bfdbfe}.pb-feature-card{padding:22px;border-radius:18px;background:#f8fafc;border:1px solid #dbe4f0}.pb-feature-card h3,.pb-two-column-copy h3{margin-top:0}.pb-two-column-copy{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.pb-two-column-copy>div{padding:18px;border-radius:16px;background:#f8fafc;border:1px solid #dbe4f0}.pb-callout{padding:18px;border-radius:18px;background:#fffbeb;border:1px solid #fde68a;color:#78350f}.pb-button-row{display:flex;gap:12px;flex-wrap:wrap}",
      ".q-drag-ghost{position:fixed;z-index:99999;pointer-events:none;width:128px;min-height:82px;display:grid;place-items:center;border-radius:18px;border:2px solid #2563eb;background:white;color:#1d4ed8;font-size:13px;font-weight:950;text-align:center;padding:12px;box-shadow:0 22px 60px rgba(0,0,0,.38);opacity:.96}.q-drop-indicator{position:fixed;z-index:99998;pointer-events:none;border:3px solid #2563eb;border-radius:14px;background:rgba(37,99,235,.1);box-shadow:0 0 0 2px rgba(255,255,255,.72)}.q-drop-indicator.row-line{height:7px;border:0;border-radius:999px;background:#2563eb;box-shadow:0 0 0 2px rgba(255,255,255,.85)}.q-drop-indicator.col-line{width:7px;border:0;border-radius:999px;background:#2563eb;box-shadow:0 0 0 2px rgba(255,255,255,.85)}",
      ".pb-export-panel{min-height:0}.pb-export-panel textarea{display:block;width:100%;height:174px;border:0;border-top:1px solid rgba(148,163,184,.28);padding:16px;box-sizing:border-box;background:#0b1020;color:#dbeafe;font:12px/1.5 'Cascadia Code','Consolas',monospace;resize:none;outline:0}",
      ".pb-palette-editor{border:0;padding:0;background:transparent;max-width:min(860px,calc(100vw - 34px));width:860px}.pb-palette-editor::backdrop{background:rgba(15,23,42,.55);backdrop-filter:blur(5px)}.pb-palette-editor-card{background:#f8fafc;border:1px solid rgba(148,163,184,.45);border-radius:24px;box-shadow:0 36px 120px rgba(15,23,42,.38);overflow:hidden}.pb-palette-editor-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;padding:20px 22px;background:white;border-bottom:1px solid #dbe4f0}.pb-palette-editor-head h2{margin:0;font-size:20px;letter-spacing:-.04em}.pb-palette-editor-head p{margin:6px 0 0;color:#64748b;font-size:13px}.pb-icon-button{width:34px;height:34px;border:0;border-radius:999px;background:#eef2ff;color:#1e293b;font-size:23px;line-height:1;cursor:pointer}.pb-editor-label{display:block;padding:16px 22px 8px;color:#334155;font-size:12px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.pb-palette-editor textarea{display:block;width:calc(100% - 44px);height:360px;margin:0 22px 14px;border:1px solid #cbd5e1;border-radius:16px;padding:14px;box-sizing:border-box;background:#0b1020;color:#dbeafe;font:13px/1.5 'Cascadia Code','Consolas',monospace;outline:0;resize:vertical}.pb-palette-editor textarea:focus{border-color:#2563eb;box-shadow:0 0 0 4px rgba(37,99,235,.14)}.pb-palette-editor-error{min-height:20px;margin:0 22px 10px;color:#be123c;font-size:13px;font-weight:800}.pb-palette-editor-actions{display:flex;justify-content:flex-end;gap:10px;padding:16px 22px 20px;border-top:1px solid #dbe4f0;background:#fff}",
      "@media (max-width:980px){.pb-workspace{grid-template-columns:1fr}.pb-main{grid-template-rows:auto auto}.pb-toolbar{height:auto;align-items:flex-start;gap:14px;flex-direction:column;padding:16px}.pb-actions{width:100%}.pb-workspace{padding:12px}.pb-two-column-copy{grid-template-columns:1fr}}"
    ].join("\n");

    document.head.appendChild(style);
  }

  function qhtmlAttrSource(el) {
    return safeAttr(el, "qhtml", "div { text { Empty component } }");
  }

  function componentName(el) {
    var raw = safeAttr(el, "component", safeAttr(el, "name", "palette-item"));
    return String(raw).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "palette-item";
  }

  function qhtmlModules() {
    return window.QHtmlModules || {};
  }

  function parseQHtmlSource(source) {
    var modules = qhtmlModules();
    var parser = modules.qhtmlParser;
    if (!parser || typeof parser.parseQHtmlToQDom !== "function") {
      return null;
    }
    return parser.parseQHtmlToQDom(String(source || ""));
  }

  function renderQHtmlSourceInto(target, source, fallbackLabel) {
    var modules = qhtmlModules();
    var renderer = modules.domRenderer;
    var doc;
    var fragment;
    if (!target) {
      return false;
    }
    target.innerHTML = "";
    try {
      doc = parseQHtmlSource(source);
      if (doc && renderer && typeof renderer.renderDocumentToFragment === "function") {
        fragment = renderer.renderDocumentToFragment(doc, document);
        target.appendChild(fragment);
        return true;
      }
    } catch (error) {
      target.textContent = String(fallbackLabel || "Invalid QHTML source");
      target.setAttribute("data-render-error", String(error && error.message ? error.message : error));
      return false;
    }
    target.textContent = String(fallbackLabel || "QHTML preview");
    return false;
  }

  function previewFragmentFromSource(source, label) {
    var wrap = document.createElement("div");
    wrap.className = "pb-palette-preview edited";
    renderQHtmlSourceInto(wrap, source, label || "Component preview");
    return wrap;
  }

  function previewFragmentFromButton(button) {
    return button.__payloadTemplate ? button.__payloadTemplate.content.cloneNode(true) : document.createTextNode(button.getAttribute("name") || "Item");
  }

  function pencilSvg() {
    return [
      "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\" focusable=\"false\">",
      "<path fill=\"currentColor\" d=\"M4 17.25V21h3.75L18.81 9.94l-3.75-3.75L4 17.25Zm16.71-10.04a1.003 1.003 0 0 0 0-1.42l-2.5-2.5a1.003 1.003 0 0 0-1.42 0l-1.96 1.96 3.75 3.75 2.13-1.79Z\"/>",
      "</svg>"
    ].join("");
  }

  function createPaletteEditButton(button) {
    var edit = document.createElement("button");
    edit.type = "button";
    edit.className = "pb-palette-edit-button";
    edit.setAttribute("aria-label", "Edit " + (button.getAttribute("name") || "palette item"));
    edit.innerHTML = pencilSvg();
    edit.addEventListener("pointerdown", function (event) {
      event.preventDefault();
      event.stopPropagation();
    });
    edit.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      PaletteEditor.open(button);
    });
    return edit;
  }

  function createBuilderItem(opts) {
    var options = opts || {};
    var item = document.createElement(Q.item);
    item.setAttribute("name", options.name || "Item");
    item.setAttribute("component", options.component || "pb-item");
    item.setAttribute("qhtml", options.qhtml || "div { text { Empty component } }");
    item.appendPreview(options.preview || null);
    return item;
  }

  var PaletteStore = {
    key: "qhtml6.pageBuilder.paletteSources",
    cache: null,
    read: function () {
      if (this.cache) {
        return this.cache;
      }
      try {
        this.cache = JSON.parse(localStorage.getItem(this.key) || "{}") || {};
      } catch (error) {
        this.cache = {};
      }
      return this.cache;
    },
    get: function (component) {
      var map = this.read();
      return map[String(component || "")] || "";
    },
    set: function (component, source) {
      var key = String(component || "");
      var map = this.read();
      if (!key) {
        return;
      }
      map[key] = String(source || "");
      try {
        localStorage.setItem(this.key, JSON.stringify(map));
      } catch (error) {
        // localStorage is optional for the builder.
      }
    },
    applyToButton: function (button) {
      var component = componentName(button);
      var stored = this.get(component);
      if (stored) {
        button.__sourceEdited = true;
        button.setAttribute("qhtml", stored);
      }
    }
  };

  function updatePaletteQDomSource(component, source) {
    var host = document.getElementById("page-builder-host");
    var root = null;
    var seen = typeof WeakSet === "function" ? new WeakSet() : null;
    function visit(node) {
      var keys;
      var i;
      var attrs;
      if (!node || typeof node !== "object") {
        return false;
      }
      if (seen) {
        if (seen.has(node)) {
          return false;
        }
        seen.add(node);
      }
      attrs = node.attributes && typeof node.attributes === "object" ? node.attributes : null;
      if (
        String(node.tagName || "").toLowerCase() === Q.button &&
        attrs &&
        String(attrs.component || "").trim() === String(component || "").trim()
      ) {
        attrs.qhtml = String(source || "");
        return true;
      }
      keys = ["nodes", "children", "templateNodes", "slots"];
      for (i = 0; i < keys.length; i += 1) {
        if (Array.isArray(node[keys[i]])) {
          for (var j = 0; j < node[keys[i]].length; j += 1) {
            if (visit(node[keys[i]][j])) {
              return true;
            }
          }
        }
      }
      return false;
    }
    try {
      root = host && typeof host.qdom === "function" ? host.qdom() : null;
      if (root && typeof root.findAll === "function") {
        arr(root.findAll(Q.button)).forEach(function (node) {
          try {
            if (node && typeof node.getAttribute === "function" && node.getAttribute("component") === component && typeof node.setAttribute === "function") {
              node.setAttribute("qhtml", source);
            }
          } catch (error) {
            // best effort only
          }
        });
      } else {
        visit(root);
      }
    } catch (error) {
      // QDOM mutation is best-effort; DOM attributes remain authoritative for the live builder.
    }
  }

  class QLayout extends HTMLElement {
    connectedCallback() {
      installApi(this);
      this.observe();
      schedule(this);
      BuilderStore.restoreSoon();
    }

    static get observedAttributes() {
      return ["width", "height", "type", "gap", "axis", "flow"];
    }

    attributeChangedCallback() {
      schedule(this);
    }

    observe() {
      var self = this;
      if (this.__observer) { return; }
      this.__observer = new MutationObserver(function () {
        arr(self.querySelectorAll(Q.row + "," + Q.col)).forEach(installApi);
        schedule(self);
      });
      this.__observer.observe(this, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["width", "height", "type", "gap", "axis", "flow"]
      });
    }
  }

  class QRow extends HTMLElement {
    connectedCallback() {
      installApi(this);
      schedule(this);
    }
  }

  class QCol extends HTMLElement {
    connectedCallback() {
      installApi(this);
      schedule(this);
    }
  }

  class QBuilderItem extends HTMLElement {
    connectedCallback() {
      if (this.__ready) { return; }
      this.__ready = true;
      this.renderChrome();
      this.addEventListener("pointerdown", this.onPointerDown.bind(this));
      this.addEventListener("click", this.onClick.bind(this));
    }

    renderChrome() {
      var name = this.getAttribute("name") || "Item";
      var existing = arr(this.childNodes);
      var bar = document.createElement("div");
      var label = document.createElement("span");
      var actions = document.createElement("span");
      var duplicate = document.createElement("button");
      var remove = document.createElement("button");
      var preview = document.createElement("div");

      if (this.querySelector(":scope > .q-builder-item-bar")) {
        return;
      }

      label.textContent = name;
      duplicate.type = "button";
      duplicate.textContent = "Clone";
      duplicate.addEventListener("click", function (event) {
        event.stopPropagation();
        this.duplicate();
      }.bind(this));
      remove.type = "button";
      remove.className = "danger";
      remove.textContent = "Delete";
      remove.addEventListener("click", function (event) {
        event.stopPropagation();
        this.removeItem();
      }.bind(this));
      actions.className = "q-builder-item-actions";
      actions.appendChild(duplicate);
      actions.appendChild(remove);
      bar.className = "q-builder-item-bar";
      bar.appendChild(label);
      bar.appendChild(actions);
      preview.className = "q-builder-item-preview";
      existing.forEach(function (node) {
        preview.appendChild(node);
      });
      this.appendChild(bar);
      this.appendChild(preview);
    }

    appendPreview(fragment) {
      var preview = this.querySelector(":scope > .q-builder-item-preview");
      if (!preview) {
        preview = document.createElement("div");
        preview.className = "q-builder-item-preview";
        this.appendChild(preview);
      }
      preview.innerHTML = "";
      if (fragment) {
        preview.appendChild(fragment);
      } else {
        preview.textContent = this.getAttribute("name") || "Item";
      }
    }

    refreshSourcePreview() {
      this.appendPreview(previewFragmentFromSource(
        this.getAttribute("qhtml") || "div { text { Empty component } }",
        this.getAttribute("name") || "Item"
      ));
    }

    createPayload() {
      return this;
    }

    clonePayload() {
      var clone = createBuilderItem({
        name: this.getAttribute("name") || "Item",
        component: this.getAttribute("component") || "pb-item",
        qhtml: this.getAttribute("qhtml") || "div { text { Empty component } }",
        preview: previewFragmentFromSource(
          this.getAttribute("qhtml") || "div { text { Empty component } }",
          this.getAttribute("name") || "Item"
        )
      });
      return clone;
    }

    onPointerDown(event) {
      if (event.button !== 0 || event.target.closest("button")) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      Drag.start(event, this, true);
    }

    onClick() {
      arr(document.querySelectorAll(Q.item + ".pb-selected")).forEach(function (el) { el.classList.remove("pb-selected"); });
      this.classList.add("pb-selected");
      setStatus("Selected " + (this.getAttribute("name") || "item"));
    }

    duplicate() {
      this.parentNode.insertBefore(this.clonePayload(), this.nextSibling);
      schedule(this);
      BuilderStore.saveSoon();
    }

    removeItem() {
      var root = rootOf(this);
      this.remove();
      if (root) { schedule(root); }
      BuilderStore.saveSoon();
    }
  }

  class QPaletteButton extends HTMLElement {
    connectedCallback() {
      if (this.__ready) { return; }
      this.__ready = true;
      PaletteStore.applyToButton(this);
      this.capturePayload();
      this.renderLabel();
      this.addEventListener("pointerdown", function (event) {
        if (event.target.closest(".pb-palette-edit-button")) { return; }
        if (event.button !== 0) { return; }
        event.preventDefault();
        event.stopPropagation();
        Drag.start(event, this, false);
      });
    }

    capturePayload() {
      var template = document.createElement("template");
      while (this.firstChild) {
        template.content.appendChild(this.firstChild);
      }
      this.__payloadTemplate = template;
    }

    renderLabel() {
      var preview = this.__sourceEdited ? previewFragmentFromSource(qhtmlAttrSource(this), this.getAttribute("name") || "Item") : previewFragmentFromButton(this);
      this.innerHTML = "";
      this.appendChild(preview);
      this.appendChild(createPaletteEditButton(this));
      this.setAttribute("title", "Drag " + (this.getAttribute("name") || "Item") + " onto the canvas");
    }

    setQhtmlSource(source) {
      this.__sourceEdited = true;
      this.setAttribute("qhtml", String(source || ""));
      this.renderLabel();
    }

    createPayload() {
      return createBuilderItem({
        name: this.getAttribute("name") || "Item",
        component: componentName(this),
        qhtml: qhtmlAttrSource(this),
        preview: previewFragmentFromSource(qhtmlAttrSource(this), this.getAttribute("name") || "Item")
      });
    }
  }

  class QPaletteToolbox extends HTMLElement {
    connectedCallback() {
      if (this.__ready) { return; }
      this.__ready = true;
      this.render();
      this.enableMove();
    }

    render() {
      var title = this.getAttribute("title") || "Palette";
      var docked = this.getAttribute("docked") === "true";
      var buttons = direct(this, Q.button);
      var body = document.createElement(Q.layout);
      var bar = null;

      if (!docked) {
        bar = document.createElement("div");
        bar.className = "q-palette-titlebar";
        bar.textContent = title;
      }

      body.className = "q-palette-body";
      body.setAttribute("width", "100%");
      body.setAttribute("height", "auto");
      body.setAttribute("gap", "10px");

      this.innerHTML = "";
      if (bar) { this.appendChild(bar); }
      this.appendChild(body);

      buttons.forEach(function (button) {
        var row = document.createElement(Q.row);
        var col = document.createElement(Q.col);
        row.setAttribute("height", "auto");
        col.setAttribute("width", Q.fill);
        col.appendChild(button);
        row.appendChild(col);
        body.appendChild(row);
      });

      this.__titlebar = bar;
      relayout(body);
    }

    enableMove() {
      var host = this;
      var state = null;
      if (!this.__titlebar) { return; }
      this.__titlebar.addEventListener("pointerdown", function (event) {
        var r;
        if (event.button !== 0) { return; }
        event.preventDefault();
        r = host.getBoundingClientRect();
        state = { dx: event.clientX - r.left, dy: event.clientY - r.top };
        host.setPointerCapture(event.pointerId);
      });
      this.addEventListener("pointermove", function (event) {
        if (!state) { return; }
        host.style.left = event.clientX - state.dx + "px";
        host.style.top = event.clientY - state.dy + "px";
      });
      this.addEventListener("pointerup", function (event) {
        if (!state) { return; }
        state = null;
        try { host.releasePointerCapture(event.pointerId); } catch (e) {}
      });
    }
  }

  var Indicator = {
    el: null,
    show: function (intent) {
      var r;
      var x;
      var y;
      if (!intent) { this.hide(); return; }
      if (!this.el) {
        this.el = document.createElement("div");
        document.body.appendChild(this.el);
      }
      this.el.className = "q-drop-indicator";
      if (intent.type === "replace") {
        r = intent.target.getBoundingClientRect();
        this.el.style.left = r.left + "px";
        this.el.style.top = r.top + "px";
        this.el.style.width = r.width + "px";
        this.el.style.height = r.height + "px";
        return;
      }
      if (intent.type === "insert-row") {
        r = intent.container.getBoundingClientRect();
        y = intent.line;
        this.el.classList.add("row-line");
        this.el.style.left = r.left + "px";
        this.el.style.top = y - 3.5 + "px";
        this.el.style.width = r.width + "px";
        this.el.style.height = "7px";
        return;
      }
      if (intent.type === "insert-col") {
        r = intent.container.getBoundingClientRect();
        x = intent.line;
        this.el.classList.add("col-line");
        this.el.style.left = x - 3.5 + "px";
        this.el.style.top = r.top + "px";
        this.el.style.width = "7px";
        this.el.style.height = r.height + "px";
      }
    },
    hide: function () {
      if (this.el) {
        this.el.remove();
        this.el = null;
      }
    }
  };

  var Resolver = {
    resolve: function (point, movingItem) {
      var layout = this.bestLayout(point);
      return layout ? this.container(layout, point, movingItem) : null;
    },
    bestLayout: function (point) {
      var layouts = arr(document.querySelectorAll(Q.layout)).filter(function (layout) {
        var r;
        if (layout.closest(Q.toolbox)) { return false; }
        r = layout.getBoundingClientRect();
        return point.x >= r.left && point.x <= r.right && point.y >= r.top && point.y <= r.bottom;
      });
      layouts.sort(function (a, b) {
        var ar = a.getBoundingClientRect();
        var br = b.getBoundingClientRect();
        return ar.width * ar.height - br.width * br.height;
      });
      return layouts[0] || null;
    },
    container: function (container, point, movingItem) {
      var axis = axisOf(container);
      var rows = direct(container, Q.row);
      var cols = direct(container, Q.col);
      if (movingItem && (container === movingItem || movingItem.contains(container))) {
        return null;
      }
      if (axis === "rows") {
        return rows.length ? this.track(container, rows, "row", point, movingItem) : this.empty(container, "insert-row");
      }
      if (axis === "cols") {
        return cols.length ? this.track(container, cols, "col", point, movingItem) : this.empty(container, "insert-col");
      }
      if (tag(container) === Q.col) {
        return { type: "replace", target: container };
      }
      return this.empty(container, "insert-row");
    },
    empty: function (container, type) {
      var r = container.getBoundingClientRect();
      return { type: type, container: container, index: 0, line: type === "insert-row" ? r.top : r.left };
    },
    track: function (container, children, kind, point, movingItem) {
      var isRow = kind === "row";
      var coord = isRow ? point.y : point.x;
      var start = isRow ? "top" : "left";
      var end = isRow ? "bottom" : "right";
      var size = isRow ? "height" : "width";
      var type = isRow ? "insert-row" : "insert-col";
      var child;
      var r;
      var i;
      var edge;
      var center;

      for (i = 0; i < children.length; i += 1) {
        r = children[i].getBoundingClientRect();
        if (point.x >= r.left && point.x <= r.right && point.y >= r.top && point.y <= r.bottom) {
          child = children[i];
          break;
        }
      }

      if (child) {
        if (movingItem && (child === movingItem || movingItem.contains(child))) {
          return null;
        }
        r = child.getBoundingClientRect();
        edge = Math.min(34, Math.max(12, r[size] * 0.22));
        center = r[start] + r[size] / 2;
        if (Math.abs(coord - r[start]) < edge && Math.abs(coord - r[start]) < Math.abs(coord - center)) {
          return { type: type, container: container, index: i, line: r[start] };
        }
        if (Math.abs(coord - r[end]) < edge && Math.abs(coord - r[end]) < Math.abs(coord - center)) {
          return { type: type, container: container, index: i + 1, line: r[end] };
        }
        return this.container(child, point, movingItem);
      }

      for (i = 0; i < children.length; i += 1) {
        r = children[i].getBoundingClientRect();
        center = r[start] + r[size] / 2;
        if (coord < center) {
          return { type: type, container: container, index: i, line: r[start] };
        }
      }

      r = children[children.length - 1].getBoundingClientRect();
      return { type: type, container: container, index: children.length, line: r[end] };
    }
  };

  var Applier = {
    apply: function (intent, source, moving) {
      var row;
      var col;
      var payload;
      if (!intent || !source) { return; }
      payload = moving ? source.createPayload() : source.createPayload();
      if (!payload) { return; }

      if (intent.type === "replace") {
        if (moving && (intent.target === payload || payload.contains(intent.target))) { return; }
        intent.target.innerHTML = "";
        intent.target.appendChild(payload);
        schedule(intent.target);
        BuilderStore.saveSoon();
        return;
      }

      if (intent.type === "insert-row") {
        row = intent.container.addRow(intent.index, { height: Q.fill });
        col = row.addCol(Infinity, { width: Q.fill });
        col.appendChild(payload);
        schedule(intent.container);
        BuilderStore.saveSoon();
        return;
      }

      if (intent.type === "insert-col") {
        col = intent.container.addCol(intent.index, { width: Q.fill });
        col.appendChild(payload);
        schedule(intent.container);
        BuilderStore.saveSoon();
      }
    }
  };

  var Drag = {
    state: null,
    start: function (event, source, moving) {
      var ghost = document.createElement("div");
      ghost.className = "q-drag-ghost";
      ghost.textContent = source.getAttribute("name") || "Item";
      document.body.appendChild(ghost);
      this.state = { source: source, moving: !!moving, ghost: ghost, intent: null };
      if (moving) { source.classList.add("pb-being-dragged"); }
      window.addEventListener("pointermove", this.move);
      window.addEventListener("pointerup", this.end);
      this.place(event.clientX, event.clientY);
      this.update();
    },
    move: function (event) {
      Drag.place(event.clientX, event.clientY);
      Drag.update();
    },
    end: function () {
      if (Drag.state && Drag.state.intent) {
        Applier.apply(Drag.state.intent, Drag.state.source, Drag.state.moving);
      }
      Drag.cleanup();
    },
    place: function (x, y) {
      var ghost;
      if (!this.state) { return; }
      ghost = this.state.ghost;
      ghost.style.left = x - ghost.offsetWidth / 2 + "px";
      ghost.style.top = y - ghost.offsetHeight / 2 + "px";
    },
    center: function () {
      var r;
      if (!this.state) { return null; }
      r = this.state.ghost.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    },
    update: function () {
      if (!this.state) { return; }
      this.state.intent = Resolver.resolve(this.center(), this.state.moving ? this.state.source : null);
      Indicator.show(this.state.intent);
    },
    cleanup: function () {
      if (this.state && this.state.ghost) { this.state.ghost.remove(); }
      if (this.state && this.state.source) { this.state.source.classList.remove("pb-being-dragged"); }
      this.state = null;
      Indicator.hide();
      window.removeEventListener("pointermove", this.move);
      window.removeEventListener("pointerup", this.end);
    }
  };

  function indent(level) {
    return new Array(level + 1).join("  ");
  }

  function attrsToQHtml(el, names) {
    var out = [];
    names.forEach(function (name) {
      var value = el.getAttribute(name);
      if (value !== null && value !== "") {
        out.push(indent(0) + name + ": " + JSON.stringify(value));
      }
    });
    return out;
  }

  function collectUsedComponents(layout) {
    var map = Object.create(null);
    arr(layout.querySelectorAll(Q.item)).forEach(function (item) {
      var name = item.getAttribute("component") || "pb-item";
      if (!map[name]) {
        map[name] = item.getAttribute("qhtml") || "div { text { Empty component } }";
      }
    });
    return map;
  }

  function emitComponentDefinitions(layout) {
    var components = collectUsedComponents(layout);
    var names = Object.keys(components).sort();
    var out = [];
    names.forEach(function (name) {
      out.push("q-component " + name + " {");
      out.push(indentBlock(String(components[name] || ""), 1));
      out.push("}");
      out.push("");
    });
    return out.join("\n");
  }

  function indentBlock(source, level) {
    return String(source || "")
      .split(/\r?\n/)
      .map(function (line) { return indent(level) + line; })
      .join("\n");
  }

  function emitLayoutNode(el, level) {
    var t = tag(el);
    var lines = [];
    var attrNames = t === Q.layout ? ["width", "height", "gap", "type", "axis", "flow"] : t === Q.row ? ["height", "gap", "axis", "flow"] : ["width", "gap", "axis", "flow"];
    var attrs = attrsToQHtml(el, attrNames);
    var children = arr(el.children).filter(function (child) {
      return tag(child) === Q.row || tag(child) === Q.col || tag(child) === Q.layout || tag(child) === Q.item;
    });

    lines.push(indent(level) + t + " {");
    attrs.forEach(function (line) { lines.push(indent(level + 1) + line.trim()); });
    children.forEach(function (child) {
      if (tag(child) === Q.item) {
        lines.push(indent(level + 1) + (child.getAttribute("component") || "pb-item") + " { }");
      } else {
        lines.push(emitLayoutNode(child, level + 1));
      }
    });
    lines.push(indent(level) + "}");
    return lines.join("\n");
  }

  function exportQHtml(layout) {
    var root = layout || document.getElementById("pb-builder-layout") || document.querySelector(".pb-stage " + Q.layout);
    if (!root) { return ""; }
    return emitComponentDefinitions(root) + emitLayoutNode(root, 0) + "\n";
  }

  function setStatus(text) {
    var status = document.getElementById("pb-builder-status");
    if (status) { status.textContent = String(text || "Ready"); }
  }

  var PaletteEditor = {
    currentButton: null,
    modal: function () { return document.getElementById("pb-palette-editor"); },
    componentInput: function () { return document.getElementById("pb-palette-editor-component"); },
    sourceInput: function () { return document.getElementById("pb-palette-editor-source"); },
    subtitle: function () { return document.getElementById("pb-palette-editor-subtitle"); },
    error: function () { return document.getElementById("pb-palette-editor-error"); },
    open: function (button) {
      var modal = this.modal();
      var component = componentName(button);
      var source = qhtmlAttrSource(button);
      this.currentButton = button;
      if (this.componentInput()) { this.componentInput().value = component; }
      if (this.sourceInput()) { this.sourceInput().value = source; }
      if (this.subtitle()) { this.subtitle().textContent = "Editing " + (button.getAttribute("name") || component) + " (" + component + ")"; }
      if (this.error()) { this.error().textContent = ""; }
      if (modal && typeof modal.showModal === "function") {
        modal.showModal();
      } else if (modal) {
        modal.setAttribute("open", "open");
      }
      setTimeout(function () {
        var input = PaletteEditor.sourceInput();
        if (input) {
          input.focus();
          input.setSelectionRange(0, 0);
        }
      }, 0);
    },
    close: function () {
      var modal = this.modal();
      if (modal && typeof modal.close === "function") {
        modal.close();
      } else if (modal) {
        modal.removeAttribute("open");
      }
      this.currentButton = null;
    },
    validate: function (source) {
      try {
        parseQHtmlSource(source);
        if (this.error()) { this.error().textContent = ""; }
        setStatus("QHTML source parsed");
        return true;
      } catch (error) {
        if (this.error()) {
          this.error().textContent = String(error && error.message ? error.message : error);
        }
        setStatus("Palette source has a QHTML error");
        return false;
      }
    },
    save: function () {
      var button = this.currentButton;
      var component = this.componentInput() ? this.componentInput().value : "";
      var source = this.sourceInput() ? this.sourceInput().value : "";
      if (!button && component) {
        button = arr(document.querySelectorAll(Q.button)).filter(function (candidate) {
          return componentName(candidate) === component;
        })[0] || null;
      }
      if (!button) {
        return;
      }
      if (!this.validate(source)) {
        return;
      }
      applyPaletteSource(button, source);
      this.close();
    },
    preview: function () {
      var source = this.sourceInput() ? this.sourceInput().value : "";
      this.validate(source);
    }
  };

  function applyPaletteSource(button, source) {
    var component = componentName(button);
    var normalizedSource = String(source || "");
    button.setQhtmlSource(normalizedSource);
    PaletteStore.set(component, normalizedSource);
    updatePaletteQDomSource(component, normalizedSource);
    arr(document.querySelectorAll(Q.item)).filter(function (item) {
      return String(item.getAttribute("component") || "") === component;
    }).forEach(function (item) {
      item.setAttribute("qhtml", normalizedSource);
      if (typeof item.refreshSourcePreview === "function") {
        item.refreshSourcePreview();
      }
    });
    BuilderStore.saveSoon();
    setStatus("Updated " + component);
  }

  var BuilderStore = {
    key: "qhtml6.pageBuilder.wysiwyg.dom",
    saveTimer: 0,
    restoring: false,
    saveSoon: function () {
      if (this.restoring) { return; }
      clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(function () {
        BuilderStore.save();
      }, 80);
    },
    save: function () {
      var layout = document.getElementById("pb-builder-layout");
      if (!layout) { return; }
      try {
        localStorage.setItem(this.key, layout.innerHTML);
        setStatus("Saved");
      } catch (error) {
        setStatus("Save unavailable");
      }
    },
    restoreSoon: function () {
      if (this.restoring || this.didRestore) { return; }
      this.didRestore = true;
      setTimeout(function () { BuilderStore.restore(); }, 40);
    },
    restore: function () {
      var layout = document.getElementById("pb-builder-layout");
      var html;
      if (!layout) { return; }
      try { html = localStorage.getItem(this.key); } catch (error) { html = ""; }
      if (!html) { return; }
      this.restoring = true;
      layout.innerHTML = html;
      arr(layout.querySelectorAll(Q.row + "," + Q.col)).forEach(installApi);
      relayout(layout);
      this.restoring = false;
      setStatus("Restored saved layout");
    }
  };

  function clearCanvas() {
    var layout = document.getElementById("pb-builder-layout");
    if (!layout) { return; }
    layout.innerHTML = "";
    var row = layout.addRow(Infinity, { height: Q.fill });
    var col = row.addCol(Infinity, { width: Q.fill });
    var empty = document.createElement("div");
    empty.className = "pb-empty-drop";
    empty.innerHTML = "<div><h3>Drop a block here</h3><p>Start with a hero, card, callout, or button row.</p></div>";
    col.appendChild(empty);
    relayout(layout);
    BuilderStore.saveSoon();
    setStatus("Canvas cleared");
  }

  function addRow() {
    var layout = document.getElementById("pb-builder-layout");
    var row;
    var col;
    if (!layout) { return; }
    row = layout.addRow(Infinity, { height: Q.fill });
    col = row.addCol(Infinity, { width: Q.fill });
    col.classList.add("q-col-empty");
    relayout(layout);
    setStatus("Row added");
  }

  function addColumn() {
    var selected = document.querySelector(Q.item + ".pb-selected");
    var row = selected ? selected.closest(Q.row) : null;
    var layout = document.getElementById("pb-builder-layout");
    var col;
    if (!row && layout) { row = layout.row(0); }
    if (!row) { return; }
    col = row.addCol(Infinity, { width: Q.fill });
    col.classList.add("q-col-empty");
    relayout(layout || row);
    setStatus("Column added");
  }

  function exportToPanel() {
    var output = document.getElementById("pb-export-output");
    var source = exportQHtml();
    if (output) {
      output.value = source;
      output.focus();
      output.select();
    }
    setStatus("Exported QHTML");
    return source;
  }

  function define(tagName, klass) {
    if (!customElements.get(tagName)) {
      customElements.define(tagName, klass);
    }
  }

  injectStyles();
  define(Q.layout, QLayout);
  define(Q.row, QRow);
  define(Q.col, QCol);
  define(Q.item, QBuilderItem);
  define(Q.toolbox, QPaletteToolbox);
  define(Q.button, QPaletteButton);

  window.QPageBuilder = {
    exportQHtml: exportQHtml,
    exportToPanel: exportToPanel,
    clearCanvas: clearCanvas,
    addRow: addRow,
    addColumn: addColumn,
    openPaletteEditor: function (button) { PaletteEditor.open(button); },
    closePaletteEditor: function () { PaletteEditor.close(); },
    savePaletteEdit: function () { PaletteEditor.save(); },
    previewPaletteEdit: function () { PaletteEditor.preview(); },
    relayout: relayout
  };

  if (!("inf" in window)) {
    Object.defineProperty(window, "inf", { value: Infinity, configurable: false, enumerable: false, writable: false });
  }
}());
