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

  function rawAttr(el, name) {
    var value = el && el.getAttribute ? el.getAttribute(name) : null;
    return value === null || value === undefined ? "" : String(value);
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
    return v === Q.fill ? "auto" : v;
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
          child.style.flex = "0 1 auto";
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
    if (root && root.closest && root.closest(Q.toolbox)) {
      return;
    }
    directAndNested(root, Q.col).forEach(function (col) {
      if (col.closest && col.closest(Q.toolbox)) {
        return;
      }
      var hasItems = !!col.querySelector(Q.item);
      var hasStructural = direct(col, Q.row).length > 0 || direct(col, Q.layout).length > 0;
      col.classList.toggle("q-col-empty", !hasItems && !hasStructural);
    });
  }

  function ensureCanvasPlaceholder(layout) {
    if (!layout) {
      return;
    }
    relayout(layout);
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
      "q-layout{display:grid;gap:12px;background:transparent;border:0;border-radius:0;padding:0;overflow:visible;color:#0f172a;position:relative}",
      "q-row{display:grid;gap:12px;overflow:visible;border:0;border-radius:0;padding:0;background:transparent}",
      "q-col{display:block;overflow:visible;background:rgba(255,255,255,.92);border:1px solid #d8e0ec;border-radius:18px;padding:14px;color:#0f172a;box-shadow:0 12px 28px rgba(15,23,42,.08);position:relative;transition:border-color .14s ease,box-shadow .14s ease,background .14s ease}",
      "q-col.q-col-empty{min-height:96px;border-style:dashed;background:rgba(248,250,252,.62);box-shadow:none}",
      ".pb-canvas-shell,.pb-export-panel{background:rgba(255,255,255,.78);border:1px solid rgba(148,163,184,.42);border-radius:26px;box-shadow:0 22px 70px rgba(15,23,42,.12);overflow:hidden}.pb-canvas-meta,.pb-export-head{display:flex;justify-content:space-between;align-items:center;padding:18px 20px;border-bottom:1px solid rgba(148,163,184,.28);background:rgba(248,250,252,.82)}.pb-status{font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:#1d4ed8;background:#dbeafe;border:1px solid #bfdbfe;border-radius:999px;padding:8px 11px}.pb-stage{padding:18px;overflow:auto}.pb-stage>#pb-builder-layout{min-height:280px;padding:12px;border:1px dashed rgba(37,99,235,.25);border-radius:20px;background:rgba(248,250,252,.42)}",
      "q-palette-toolbox{display:block;color:#0f172a}q-palette-toolbox:not([docked='true']){position:fixed;left:24px;top:24px;z-index:5000;width:250px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:20px;box-shadow:0 24px 70px rgba(0,0,0,.35);overflow:hidden;user-select:none}.q-palette-titlebar{cursor:move;padding:13px 15px;background:#0f172a;color:white;font-weight:950;letter-spacing:-.035em}.q-palette-body{display:grid;gap:10px;border:0;border-radius:0;background:transparent;box-shadow:none;padding:10px 16px 18px}",
      "q-palette-toolbox-button{display:block;position:relative;min-height:76px;padding:0;border-radius:18px;background:white;border:1px solid rgba(148,163,184,.3);box-shadow:0 12px 26px rgba(0,0,0,.18);cursor:grab;overflow:hidden}q-palette-toolbox-button:active{cursor:grabbing}.pb-palette-preview{min-height:76px;padding:14px;background:linear-gradient(135deg,#ffffff,#eef6ff);border-left:5px solid #2563eb}.pb-palette-preview h3{margin:0;font-size:14px}.pb-palette-preview p{margin:4px 0 0;font-size:12px;color:#64748b}.pb-palette-preview.hero{border-color:#06b6d4}.pb-palette-preview.card{border-color:#6366f1}.pb-palette-preview.columns{border-color:#14b8a6}.pb-palette-preview.callout{border-color:#f59e0b}.pb-palette-preview.buttons{border-color:#ec4899}.pb-palette-preview.layout{border-color:#10b981}.pb-palette-preview.heading{border-color:#8b5cf6}.pb-palette-preview.price{border-color:#0ea5e9}.pb-palette-preview.edited{border-color:#2563eb}.pb-palette-edit-button{position:absolute;top:8px;right:8px;z-index:4;width:30px;height:30px;display:grid;place-items:center;border:1px solid rgba(37,99,235,.22);border-radius:999px;background:rgba(255,255,255,.92);color:#1d4ed8;box-shadow:0 8px 20px rgba(15,23,42,.16);cursor:pointer}.pb-palette-edit-button:hover{background:#eff6ff;color:#0f172a}.pb-palette-edit-button svg{width:15px;height:15px;display:block}",
      "q-builder-item{display:block;position:relative;margin:0;border-radius:18px;border:1px solid rgba(37,99,235,.28);background:white;box-shadow:0 14px 34px rgba(15,23,42,.1);overflow:hidden;cursor:grab}q-builder-item:active{cursor:grabbing}q-builder-item.pb-selected{outline:3px solid rgba(37,99,235,.32)}.q-builder-item-bar{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 9px;background:#eff6ff;border-bottom:1px solid #bfdbfe;color:#1d4ed8;font-size:11px;font-weight:950;letter-spacing:.04em;text-transform:uppercase}.q-builder-item-preview{padding:14px}",
      ".q-builder-instance-edit{position:absolute;top:10px;right:10px;z-index:30;width:34px;height:34px;display:grid;place-items:center;border:1px solid rgba(37,99,235,.28);border-radius:999px;background:rgba(255,255,255,.97);color:#1d4ed8;box-shadow:0 10px 24px rgba(15,23,42,.2);cursor:pointer;opacity:0;pointer-events:none;transform:translateY(-4px);transition:opacity .14s ease,transform .14s ease,color .14s ease,background .14s ease}q-builder-item:hover>.q-builder-instance-edit,q-builder-item.pb-selected>.q-builder-instance-edit,q-builder-item:focus-within>.q-builder-instance-edit{opacity:1;pointer-events:auto;transform:translateY(0)}.q-builder-instance-edit:hover{background:#eff6ff;color:#0f172a}.q-builder-instance-edit svg{width:15px;height:15px;display:block}",
      ".pb-hero-block{padding:32px;border-radius:20px;background:linear-gradient(135deg,#0f172a,#1d4ed8);color:white}.pb-hero-block h1{margin:0;font-size:38px;letter-spacing:-.06em}.pb-hero-block p{max-width:560px;color:#dbeafe}.pb-demo-button{border:0;border-radius:999px;background:#22d3ee;color:#0f172a;font-weight:900;padding:10px 16px}.pb-demo-button.ghost{background:white;color:#1d4ed8;border:1px solid #bfdbfe}.pb-feature-card{padding:22px;border-radius:18px;background:#f8fafc;border:1px solid #dbe4f0}.pb-feature-card h3,.pb-two-column-copy h3{margin-top:0}.pb-two-column-copy{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.pb-two-column-copy>div{padding:18px;border-radius:16px;background:#f8fafc;border:1px solid #dbe4f0}.pb-callout{padding:18px;border-radius:18px;background:#fffbeb;border:1px solid #fde68a;color:#78350f}.pb-button-row{display:flex;gap:12px;flex-wrap:wrap}",
      ".q-drag-ghost{position:fixed;z-index:99999;pointer-events:none;width:128px;min-height:82px;display:grid;place-items:center;border-radius:18px;border:2px solid #2563eb;background:white;color:#1d4ed8;font-size:13px;font-weight:950;text-align:center;padding:12px;box-shadow:0 22px 60px rgba(0,0,0,.38);opacity:.96}.q-drop-indicator{position:fixed;z-index:99998;pointer-events:none;border:3px solid #2563eb;border-radius:14px;background:rgba(37,99,235,.1);box-shadow:0 0 0 2px rgba(255,255,255,.72)}.q-drop-indicator.row-line{height:7px;border:0;border-radius:999px;background:#2563eb;box-shadow:0 0 0 2px rgba(255,255,255,.85)}.q-drop-indicator.col-line{width:7px;border:0;border-radius:999px;background:#2563eb;box-shadow:0 0 0 2px rgba(255,255,255,.85)}",
      ".pb-export-panel{min-height:0}.pb-export-panel q-editor{display:block;border-top:1px solid rgba(148,163,184,.28)}.pb-export-panel q-editor .qe{border:0;border-radius:0}.pb-export-panel q-editor .qe-editor-wrap,.pb-export-panel q-editor .qe-highlight,.pb-export-panel q-editor .qe-input,.pb-export-panel q-editor .qe-code,.pb-export-panel q-editor .qe-preview,.pb-export-panel q-editor .qe-cm-host,.pb-export-panel q-editor .qe-cm-host .cm-editor{min-height:174px}",
      ".pb-palette-editor{border:0;padding:0;background:transparent;max-width:min(980px,calc(100vw - 34px));width:980px}.pb-palette-editor::backdrop{background:rgba(15,23,42,.55);backdrop-filter:blur(5px)}.pb-palette-editor-card{background:#f8fafc;border:1px solid rgba(148,163,184,.45);border-radius:24px;box-shadow:0 36px 120px rgba(15,23,42,.38);overflow:hidden}.pb-palette-editor-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;padding:20px 22px;background:white;border-bottom:1px solid #dbe4f0}.pb-palette-editor-head h2{margin:0;font-size:20px;letter-spacing:-.04em}.pb-palette-editor-head p{margin:6px 0 0;color:#64748b;font-size:13px}.pb-icon-button{width:34px;height:34px;border:0;border-radius:999px;background:#eef2ff;color:#1e293b;font-size:23px;line-height:1;cursor:pointer}.pb-editor-label{display:block;padding:16px 22px 8px;color:#334155;font-size:12px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.pb-palette-editor q-editor{display:block;margin:0 22px 14px}.pb-palette-editor q-editor .qe{border-color:#cbd5e1;border-radius:16px}.pb-palette-editor q-editor .qe-editor-wrap,.pb-palette-editor q-editor .qe-highlight,.pb-palette-editor q-editor .qe-input,.pb-palette-editor q-editor .qe-code,.pb-palette-editor q-editor .qe-preview,.pb-palette-editor q-editor .qe-cm-host,.pb-palette-editor q-editor .qe-cm-host .cm-editor{min-height:340px}.pb-palette-editor-error{min-height:20px;margin:0 22px 10px;color:#be123c;font-size:13px;font-weight:800}.pb-palette-editor-actions{display:flex;justify-content:flex-end;gap:10px;padding:16px 22px 20px;border-top:1px solid #dbe4f0;background:#fff}",
      ".pb-instance-editor{border:0;padding:0;background:transparent;width:min(90vw,1180px);max-width:90vw}.pb-instance-editor::backdrop{background:rgba(15,23,42,.58);backdrop-filter:blur(5px)}.pb-instance-editor-card{height:min(90vh,920px);display:grid;grid-template-rows:auto auto minmax(0,1fr) auto;background:#f8fafc;border:1px solid rgba(148,163,184,.45);border-radius:24px;box-shadow:0 36px 120px rgba(15,23,42,.38);overflow:hidden}.pb-instance-editor-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;padding:18px 22px;background:white;border-bottom:1px solid #dbe4f0}.pb-instance-editor-head h2{margin:0;font-size:20px;letter-spacing:-.04em}.pb-instance-editor-head p{margin:6px 0 0;color:#64748b;font-size:13px}.pb-instance-controls{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;padding:14px 22px;background:#f1f5f9;border-bottom:1px solid #dbe4f0}.pb-instance-controls label{display:grid;gap:6px;color:#334155;font-size:12px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.pb-instance-controls select{min-width:0;border:1px solid #cbd5e1;border-radius:12px;background:white;color:#0f172a;padding:10px;font-size:14px}.pb-instance-editor-body{min-height:0;padding:16px 22px}.pb-instance-editor q-editor{display:block;height:100%;min-height:0}.pb-instance-editor q-editor .qe{height:100%;border-color:#cbd5e1;border-radius:16px}.pb-instance-editor q-editor .qe-editor-wrap,.pb-instance-editor q-editor .qe-highlight,.pb-instance-editor q-editor .qe-input,.pb-instance-editor q-editor .qe-code,.pb-instance-editor q-editor .qe-preview,.pb-instance-editor q-editor .qe-cm-host,.pb-instance-editor q-editor .qe-cm-host .cm-editor{min-height:calc(80vh - 190px);height:100%}.pb-instance-editor-error{min-height:20px;padding:0 22px 8px;color:#be123c;font-size:13px;font-weight:800}.pb-instance-editor-actions{display:flex;justify-content:flex-end;gap:10px;padding:14px 22px 18px;border-top:1px solid #dbe4f0;background:#fff}.pb-instance-editor-actions .primary{background:#0f172a;color:white}",
      "@media (max-width:980px){.pb-workspace{grid-template-columns:1fr}.pb-main{grid-template-rows:auto auto}.pb-toolbar{height:auto;align-items:flex-start;gap:14px;flex-direction:column;padding:16px}.pb-actions{width:100%}.pb-workspace{padding:12px}.pb-two-column-copy{grid-template-columns:1fr}}"
    ].join("\n");

    document.head.appendChild(style);
  }

  function qhtmlAttrSource(el) {
    return safeAttr(el, "qhtml", "div { text { Empty component } }");
  }

  function qhtmlDefinitionSource(el) {
    return rawAttr(el, "qhtml");
  }

  function qhtmlInstanceSource(el) {
    return safeAttr(el, "instance", qhtmlAttrSource(el));
  }

  function qhtmlStringLiteral(value) {
    return JSON.stringify(String(value == null ? "" : value));
  }

  function builderItemQHtml(name, component, source, instance) {
    var definition = source == null ? "" : String(source);
    var instantiation = instance == null || instance === "" ? (definition || "div { text { Empty component } }") : String(instance);
    return [
      "q-builder-item {",
      "  name: " + qhtmlStringLiteral(name || "Item"),
      "  component: " + qhtmlStringLiteral(component || "pb-item"),
      "  qhtml: " + qhtmlStringLiteral(definition),
      "  instance: " + qhtmlStringLiteral(instantiation),
      "}"
    ].join("\n");
  }

  function componentDefinitionBlock(component, source) {
    var name = String(component || "").trim();
    var body = formatQHtmlSource(source);
    if (!name || !body) {
      return "";
    }
    return "q-component " + name + " {\n" + indentBlock(body, 1) + "\n}";
  }

  function collectPaletteDefinitions(primaryComponent, primaryDefinition) {
    var map = Object.create(null);
    var primaryName = String(primaryComponent || "").trim();
    if (primaryName && String(primaryDefinition || "").trim()) {
      map[primaryName] = String(primaryDefinition || "");
    }
    arr(document.querySelectorAll(Q.button)).forEach(function (button) {
      var name = componentName(button);
      var source = qhtmlDefinitionSource(button);
      if (name && source && !map[name]) {
        map[name] = source;
      }
    });
    return Object.keys(map).sort().map(function (name) {
      return componentDefinitionBlock(name, map[name]);
    }).filter(Boolean).join("\n\n");
  }

  function qdomOf(el) {
    if (!el || typeof el.qdom !== "function") {
      return null;
    }
    try {
      return el.qdom();
    } catch (error) {
      return null;
    }
  }

  function rootQDom() {
    var host = document.getElementById("page-builder-host");
    return qdomOf(host);
  }

  function isEditorPreviewTarget(el) {
    return !!(el && el.closest && el.closest(Q.item));
  }

  function intentTouchesEditorPreview(intent) {
    return !!(intent && (
      isEditorPreviewTarget(intent.target) ||
      isEditorPreviewTarget(intent.container)
    ));
  }

  function renderLayoutSoon(reason) {
    clearTimeout(renderLayoutSoon.timer);
    renderLayoutSoon.timer = setTimeout(function () {
      arr(document.querySelectorAll(Q.layout + "," + Q.row + "," + Q.col)).forEach(installApi);
      arr(document.querySelectorAll(Q.layout)).forEach(relayout);
      updateExportPanel(false);
      if (reason) {
        setStatus(reason);
      }
    }, 40);
  }

  function appendQHtmlToQDom(target, source) {
    var qdom = qdomOf(target);
    if (isEditorPreviewTarget(target) || !qdom || typeof qdom.appendNode !== "function") {
      return false;
    }
    qdom.appendNode(String(source || ""));
    renderLayoutSoon("Canvas updated");
    return true;
  }

  function replaceQDomWithQHtml(target, source) {
    var qdom = qdomOf(target);
    var root = rootQDom();
    if (isEditorPreviewTarget(target) || !qdom || typeof qdom.replaceWithQHTML !== "function") {
      return false;
    }
    qdom.replaceWithQHTML(String(source || ""), root || null);
    renderLayoutSoon("Canvas updated");
    return true;
  }

  function insertQDomRow(container, index, attrs) {
    var qdom = qdomOf(container);
    if (isEditorPreviewTarget(container) || !qdom || typeof qdom.addRow !== "function") {
      return null;
    }
    return qdom.addRow(index, attrs || { height: "auto" });
  }

  function insertQDomCol(container, index, attrs) {
    var qdom = qdomOf(container);
    if (isEditorPreviewTarget(container) || !qdom || typeof qdom.addCol !== "function") {
      return null;
    }
    return qdom.addCol(index, attrs || { width: "auto" });
  }

  function escapeHtmlText(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function wrapQHtmlEditorSource(source) {
    return "<q-html>\n" + formatQHtmlSource(source) + "\n</q-html>";
  }

  function unwrapQHtmlEditorSource(source) {
    var text = String(source || "").replace(/\r\n/g, "\n").trim();
    var match = text.match(/^\s*<\s*q-html[^>]*>([\s\S]*?)<\s*\/\s*q-html\s*>\s*$/i);
    return match ? String(match[1] || "").trim() : text;
  }

  function setPaletteEditorSource(editor, source) {
    var wrapped = wrapQHtmlEditorSource(source);
    if (!editor) {
      return;
    }
    if (typeof editor.setQhtmlSource === "function" && editor.querySelector && editor.querySelector(".qe")) {
      editor.setQhtmlSource(wrapped);
      return;
    }
    editor.innerHTML = escapeHtmlText(wrapped);
    if (typeof editor.setQhtmlSource === "function") {
      editor.setQhtmlSource(wrapped);
    }
  }

  function readPaletteEditorSource(editor) {
    if (!editor) {
      return "";
    }
    if (typeof editor.getQhtmlSource === "function") {
      return unwrapQHtmlEditorSource(editor.getQhtmlSource());
    }
    return unwrapQHtmlEditorSource(editor.textContent || editor.innerHTML || "");
  }

  function trimRightWhitespace(text) {
    return String(text || "").replace(/[ \t]+$/g, "");
  }

  function splitFormattedLine(line) {
    var match;
    var indentText;
    var props;
    var block;
    var propMatches;
    if (!line || line.indexOf(":") < 0) {
      return [line];
    }
    if (line.indexOf("{") < 0) {
      match = line.match(/^(\t*)(.*)$/);
      indentText = match ? match[1] : "";
      props = match ? match[2] : line;
      propMatches = props.match(/[A-Za-z_][A-Za-z0-9_-]*\s*:\s*(?:"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|[^ \t]+)/g);
      if (propMatches && propMatches.length > 1 && propMatches.join(" ").length === props.trim().length) {
        return propMatches.map(function (prop) {
          return indentText + prop.trim();
        });
      }
      return [line];
    }
    match = line.match(/^(\t*)(.*\S)\s+([A-Za-z_][A-Za-z0-9_-]*(?:[.#][A-Za-z0-9_-]+)?(?:\s+[A-Za-z_][A-Za-z0-9_-]*)?\s*\{)$/);
    if (!match) {
      return [line];
    }
    indentText = match[1];
    props = match[2];
    block = match[3];
    propMatches = props.match(/[A-Za-z_][A-Za-z0-9_-]*\s*:\s*(?:"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|[^ \t]+)/g);
    if (!propMatches || propMatches.join(" ").length !== props.trim().length) {
      return [indentText + props.trim(), indentText + block.trim()];
    }
    return propMatches.map(function (prop) {
      return indentText + prop.trim();
    }).concat(indentText + block.trim());
  }

  function normalizeFormattedLines(text) {
    var lines = [];
    String(text || "").replace(/[ \t]+\n/g, "\n").split(/\n+/).forEach(function (line) {
      splitFormattedLine(line).forEach(function (splitLine) {
        if (splitLine.trim()) {
          lines.push(splitLine);
        }
      });
    });
    return lines.join("\n");
  }

  function formatQHtmlSource(source) {
    var text = String(source || "").replace(/\r\n/g, "\n").trim();
    var out = "";
    var level = 0;
    var quote = "";
    var escaped = false;
    var pendingSpace = false;
    var i;
    var ch;
    function writeIndent() {
      if (!out || out.charAt(out.length - 1) === "\n") {
        out += indent(level).replace(/  /g, "\t");
      }
    }
    function newline() {
      out = trimRightWhitespace(out);
      if (out && out.charAt(out.length - 1) !== "\n") {
        out += "\n";
      }
    }
    if (!text) {
      return "";
    }
    for (i = 0; i < text.length; i += 1) {
      ch = text.charAt(i);
      if (quote) {
        writeIndent();
        out += ch;
        if (escaped) {
          escaped = false;
        } else if (ch === "\\") {
          escaped = true;
        } else if (ch === quote) {
          quote = "";
        }
        continue;
      }
      if (ch === "\"" || ch === "'") {
        writeIndent();
        if (pendingSpace && out && !/[\s{([]$/.test(out.charAt(out.length - 1))) {
          out += " ";
        }
        pendingSpace = false;
        quote = ch;
        out += ch;
        continue;
      }
      if (ch === "{") {
        out = trimRightWhitespace(out);
        out += " {\n";
        level += 1;
        pendingSpace = false;
        continue;
      }
      if (ch === "}") {
        newline();
        level = Math.max(0, level - 1);
        out += indent(level).replace(/  /g, "\t") + "}\n";
        pendingSpace = false;
        continue;
      }
      if (ch === ";") {
        newline();
        pendingSpace = false;
        continue;
      }
      if (/\s/.test(ch)) {
        pendingSpace = true;
        continue;
      }
      writeIndent();
      if (pendingSpace && out && !/[\s{([]$/.test(out.charAt(out.length - 1))) {
        out += " ";
      }
      pendingSpace = false;
      out += ch;
    }
    return normalizeFormattedLines(out).trim();
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

  function previewSourceForElement(el) {
    var component = componentName(el);
    var definition = qhtmlDefinitionSource(el);
    var instance = qhtmlInstanceSource(el);
    if (definition) {
      return collectPaletteDefinitions(component, definition) + "\n\n" + instance;
    }
    return instance;
  }

  function previewFragmentFromButton(button) {
    return button.__payloadTemplate ? button.__payloadTemplate.content.cloneNode(true) : document.createTextNode(button.getAttribute("name") || "Item");
  }

  function replaceInstanceSlotSource(instanceSource, slotName, slotSource) {
    var source = String(instanceSource || "").trim();
    var slotKey = String(slotName || "").trim();
    var slotKeyLower = slotKey.toLowerCase();
    var openIndex;
    var closeIndex;
    var i;
    var nameStart;
    var name;
    var blockOpen;
    var blockClose;
    var replacement;
    if (!source || !slotKey) {
      return "";
    }

    function isNameChar(ch) {
      return /[A-Za-z0-9_-]/.test(ch || "");
    }

    function skipWhitespace(index) {
      while (index < source.length && /\s/.test(source.charAt(index))) {
        index += 1;
      }
      return index;
    }

    function matchingBrace(index) {
      var depth = 0;
      var quote = "";
      var escaped = false;
      for (var j = index; j < source.length; j += 1) {
        var ch = source.charAt(j);
        if (quote) {
          if (escaped) {
            escaped = false;
          } else if (ch === "\\") {
            escaped = true;
          } else if (ch === quote) {
            quote = "";
          }
          continue;
        }
        if (ch === "\"" || ch === "'") {
          quote = ch;
          continue;
        }
        if (ch === "{") {
          depth += 1;
        } else if (ch === "}") {
          depth -= 1;
          if (depth === 0) {
            return j;
          }
        }
      }
      return -1;
    }

    openIndex = source.indexOf("{");
    if (openIndex < 0) {
      return "";
    }
    closeIndex = matchingBrace(openIndex);
    if (closeIndex < 0) {
      return "";
    }
    replacement = slotKey + " {\n" + indentBlock(slotSource, 1) + "\n}";
    i = openIndex + 1;
    while (i < closeIndex) {
      i = skipWhitespace(i);
      nameStart = i;
      while (i < closeIndex && isNameChar(source.charAt(i))) {
        i += 1;
      }
      if (i === nameStart) {
        i += 1;
        continue;
      }
      name = source.slice(nameStart, i);
      i = skipWhitespace(i);
      if (source.charAt(i) !== "{") {
        continue;
      }
      blockOpen = i;
      blockClose = matchingBrace(blockOpen);
      if (blockClose < 0) {
        return "";
      }
      if (name.toLowerCase() === slotKeyLower) {
        return source.slice(0, nameStart) + replacement + source.slice(blockClose + 1);
      }
      i = blockClose + 1;
    }
    return source.slice(0, closeIndex).trimEnd() + "\n  " + replacement.replace(/\n/g, "\n  ") + "\n" + source.slice(closeIndex);
  }

  function qhtmlSourceMatchingBrace(source, index) {
    var depth = 0;
    var quote = "";
    var escaped = false;
    for (var i = index; i < source.length; i += 1) {
      var ch = source.charAt(i);
      if (quote) {
        if (escaped) {
          escaped = false;
        } else if (ch === "\\") {
          escaped = true;
        } else if (ch === quote) {
          quote = "";
        }
        continue;
      }
      if (ch === "\"" || ch === "'") {
        quote = ch;
        continue;
      }
      if (ch === "{") {
        depth += 1;
      } else if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          return i;
        }
      }
    }
    return -1;
  }

  function qhtmlSourceNameChar(ch) {
    return /[A-Za-z0-9_-]/.test(ch || "");
  }

  function qhtmlSourceSkipWhitespace(source, index) {
    while (index < source.length && /\s/.test(source.charAt(index))) {
      index += 1;
    }
    return index;
  }

  function replaceSlotInComponentOccurrence(instanceSource, componentName, ordinal, slotName, slotSource) {
    var source = String(instanceSource || "").trim();
    var wanted = String(componentName || "").trim().toLowerCase();
    var occurrence = Math.max(0, Number(ordinal) || 0);
    var count = 0;
    var i = 0;
    var nameStart;
    var name;
    var blockOpen;
    var blockClose;
    var blockSource;
    var nextBlock;
    if (!source || !wanted || !slotName) {
      return "";
    }
    while (i < source.length) {
      i = qhtmlSourceSkipWhitespace(source, i);
      nameStart = i;
      while (i < source.length && qhtmlSourceNameChar(source.charAt(i))) {
        i += 1;
      }
      if (i === nameStart) {
        i += 1;
        continue;
      }
      name = source.slice(nameStart, i);
      i = qhtmlSourceSkipWhitespace(source, i);
      if (source.charAt(i) !== "{") {
        continue;
      }
      blockOpen = i;
      blockClose = qhtmlSourceMatchingBrace(source, blockOpen);
      if (blockClose < 0) {
        return "";
      }
      if (name.toLowerCase() === wanted) {
        if (count === occurrence) {
          blockSource = source.slice(nameStart, blockClose + 1);
          nextBlock = replaceInstanceSlotSource(blockSource, slotName, slotSource);
          return nextBlock ? source.slice(0, nameStart) + nextBlock + source.slice(blockClose + 1) : "";
        }
        count += 1;
      }
      i = blockOpen + 1;
    }
    return "";
  }

  function renderedComponentHostForSlot(surface, owner) {
    var preview = owner && owner.querySelector ? owner.querySelector(":scope > .q-builder-item-preview") : null;
    var host = surface && surface.closest ? surface.closest("[q-component]") : null;
    return host && preview && preview.contains(host) ? host : null;
  }

  function renderedComponentOrdinal(owner, componentHost) {
    var componentTag = tag(componentHost);
    var preview = owner && owner.querySelector ? owner.querySelector(":scope > .q-builder-item-preview") : null;
    var hosts;
    var i;
    if (!componentTag || !preview) {
      return 0;
    }
    hosts = arr(preview.querySelectorAll("[q-component]")).filter(function (candidate) {
      return tag(candidate) === componentTag;
    });
    for (i = 0; i < hosts.length; i += 1) {
      if (hosts[i] === componentHost) {
        return i;
      }
    }
    return 0;
  }

  function applyPaletteItemToRenderedSlot(intent, source, moving) {
    var target = intent && (intent.target || intent.container);
    var surface = target && target.closest ? target.closest("[data-pb-slot]") : null;
    var owner = surface && surface.closest ? surface.closest(Q.item) : null;
    var componentHost = renderedComponentHostForSlot(surface, owner);
    var slotName = surface ? surface.getAttribute("data-pb-slot") : "";
    var nextInstance;
    if (!surface || !owner || !slotName || !source || owner === source || (source.contains && source.contains(owner))) {
      return false;
    }
    if (componentHost) {
      nextInstance = replaceSlotInComponentOccurrence(
        qhtmlInstanceSource(owner),
        tag(componentHost),
        renderedComponentOrdinal(owner, componentHost),
        slotName,
        qhtmlInstanceSource(source)
      );
    }
    if (!nextInstance) {
      nextInstance = replaceInstanceSlotSource(
        qhtmlInstanceSource(owner),
        slotName,
        qhtmlInstanceSource(source)
      );
    }
    if (!nextInstance) {
      return false;
    }
    owner.setAttribute("instance", nextInstance);
    if (typeof owner.refreshSourcePreview === "function") {
      owner.refreshSourcePreview();
    }
    if (moving && source && typeof source.removeItem === "function") {
      source.removeItem();
    }
    BuilderStore.saveSoon();
    renderLayoutSoon("Updated " + slotName);
    return true;
  }

  function directRenderedBuilderItemsIn(surface, owner) {
    return arr(surface ? surface.querySelectorAll(Q.item) : []).filter(function (item) {
      var parentOwner = item.parentElement && item.parentElement.closest
        ? item.parentElement.closest(Q.item)
        : null;
      return parentOwner === owner;
    });
  }

  function reconcileRenderedSlotsForItem(owner) {
    var nextInstance = qhtmlInstanceSource(owner);
    var changed = false;
    if (!owner || !owner.querySelectorAll) {
      return false;
    }
    arr(owner.querySelectorAll(":scope > .q-builder-item-preview [data-pb-slot]")).forEach(function (surface) {
      var slotName = surface.getAttribute("data-pb-slot") || "";
      var droppedItems = directRenderedBuilderItemsIn(surface, owner);
      var slotSource;
      if (!slotName || droppedItems.length === 0) {
        return;
      }
      slotSource = droppedItems.map(function (item) {
        return qhtmlInstanceSource(item);
      }).join("\n");
      nextInstance = replaceInstanceSlotSource(nextInstance, slotName, slotSource);
      changed = true;
    });
    if (changed && nextInstance) {
      owner.setAttribute("instance", nextInstance);
    }
    return changed;
  }

  function reconcileRenderedSlotState(layout) {
    arr((layout || document).querySelectorAll(Q.item)).forEach(reconcileRenderedSlotsForItem);
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

  function createInstanceEditButton(item) {
    var edit = document.createElement("button");
    edit.type = "button";
    edit.className = "q-builder-instance-edit";
    edit.setAttribute("aria-label", "Edit " + (item.getAttribute("name") || "palette instance"));
    edit.innerHTML = pencilSvg();
    edit.addEventListener("pointerdown", function (event) {
      event.preventDefault();
      event.stopPropagation();
    });
    edit.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      InstanceEditor.open(item);
    });
    return edit;
  }

  function paletteButtonForComponent(component) {
    var wanted = String(component || "").toLowerCase();
    return arr(document.querySelectorAll(Q.button)).filter(function (button) {
      return componentName(button) === wanted;
    })[0] || null;
  }

  function paletteComponentNames() {
    var names = Object.create(null);
    arr(document.querySelectorAll(Q.button)).forEach(function (button) {
      names[componentName(button)] = true;
    });
    return names;
  }

  function slotNamesForComponent(component) {
    var button = paletteButtonForComponent(component);
    var source = button ? qhtmlDefinitionSource(button) : "";
    var seen = Object.create(null);
    var slots = [];
    var match;
    var re = /\bslot\s*\{\s*([A-Za-z_][A-Za-z0-9_-]*)\s*\}/g;
    while ((match = re.exec(source))) {
      if (!seen[match[1]]) {
        seen[match[1]] = true;
        slots.push(match[1]);
      }
    }
    return slots;
  }

  function readQHtmlBlocks(source, start, end) {
    var text = String(source || "");
    var limit = typeof end === "number" ? end : text.length;
    var i = typeof start === "number" ? start : 0;
    var out = [];
    var nameStart;
    var name;
    var open;
    var close;
    while (i < limit) {
      i = qhtmlSourceSkipWhitespace(text, i);
      nameStart = i;
      while (i < limit && qhtmlSourceNameChar(text.charAt(i))) {
        i += 1;
      }
      if (i === nameStart) {
        i += 1;
        continue;
      }
      name = text.slice(nameStart, i);
      i = qhtmlSourceSkipWhitespace(text, i);
      if (text.charAt(i) !== "{") {
        continue;
      }
      open = i;
      close = qhtmlSourceMatchingBrace(text, open);
      if (close < 0) {
        break;
      }
      out.push({
        name: name,
        start: nameStart,
        open: open,
        end: close,
        bodyStart: open + 1,
        bodyEnd: close,
        source: text.slice(nameStart, close + 1)
      });
      i = close + 1;
    }
    return out;
  }

  function findPaletteBlocksDeep(source, start, end, paletteSet) {
    var found = [];
    readQHtmlBlocks(source, start, end).forEach(function (block) {
      if (paletteSet[String(block.name || "").toLowerCase()]) {
        found.push(block);
      } else {
        found = found.concat(findPaletteBlocksDeep(source, block.bodyStart, block.bodyEnd, paletteSet));
      }
    });
    return found;
  }

  function directBlockByName(source, start, end, wanted) {
    var wantedLower = String(wanted || "").toLowerCase();
    var blocks = readQHtmlBlocks(source, start, end);
    var i;
    for (i = 0; i < blocks.length; i += 1) {
      if (String(blocks[i].name || "").toLowerCase() === wantedLower) {
        return blocks[i];
      }
    }
    return null;
  }

  function collectInstanceEntries(owner) {
    var source = qhtmlInstanceSource(owner);
    var paletteSet = paletteComponentNames();
    var roots = readQHtmlBlocks(source, 0, source.length);
    var ownerComponent = String(owner && owner.getAttribute ? owner.getAttribute("component") || "" : "").toLowerCase();
    var root = null;
    var entries = [];
    var counts = Object.create(null);

    roots.forEach(function (block) {
      if (!root && (String(block.name || "").toLowerCase() === ownerComponent || paletteSet[String(block.name || "").toLowerCase()])) {
        root = block;
      }
    });
    root = root || roots[0] || null;
    if (!root) {
      return entries;
    }

    function uniquePath(base) {
      counts[base] = (counts[base] || 0) + 1;
      return counts[base] === 1 ? base : base + "[" + counts[base] + "]";
    }

    function addEntry(block, parentPath, viaSlot) {
      var component = String(block.name || "").toLowerCase();
      var slots = slotNamesForComponent(component);
      var path = uniquePath(parentPath ? parentPath + "." + viaSlot + "." + component : component);
      var label = component + (viaSlot ? " in " + viaSlot : " root");
      var entry = {
        path: path,
        label: label,
        component: component,
        block: block,
        slots: slots
      };
      entries.push(entry);
      slots.forEach(function (slotName) {
        var slotBlock = directBlockByName(source, block.bodyStart, block.bodyEnd, slotName);
        if (!slotBlock) {
          return;
        }
        findPaletteBlocksDeep(source, slotBlock.bodyStart, slotBlock.bodyEnd, paletteSet).forEach(function (childBlock) {
          addEntry(childBlock, path, slotName);
        });
      });
    }

    if (paletteSet[String(root.name || "").toLowerCase()]) {
      addEntry(root, "", "");
    } else {
      entries.push({
        path: uniquePath(ownerComponent || String(root.name || "instance").toLowerCase()),
        label: (owner && owner.getAttribute ? owner.getAttribute("name") : "") || root.name || "Instance",
        component: ownerComponent || String(root.name || "").toLowerCase(),
        block: root,
        slots: slotNamesForComponent(ownerComponent || root.name)
      });
    }
    return entries;
  }

  function entryByPath(entries, path) {
    var wanted = String(path || "");
    return arr(entries).filter(function (entry) {
      return entry.path === wanted;
    })[0] || entries[0] || null;
  }

  function slotBlockForEntry(source, entry, slotName) {
    if (!entry || !slotName) {
      return null;
    }
    return directBlockByName(source, entry.block.bodyStart, entry.block.bodyEnd, slotName);
  }

  function slotSourceForEntry(source, entry, slotName) {
    var block = slotBlockForEntry(source, entry, slotName);
    return block ? source.slice(block.bodyStart, block.bodyEnd).trim() : "";
  }

  function replaceSlotInEntrySource(instanceSource, entry, slotName, slotSource) {
    var source = String(instanceSource || "");
    var blockSource;
    var nextBlock;
    if (!entry || !slotName) {
      return "";
    }
    blockSource = source.slice(entry.block.start, entry.block.end + 1);
    nextBlock = replaceInstanceSlotSource(blockSource, slotName, slotSource);
    return nextBlock ? source.slice(0, entry.block.start) + nextBlock + source.slice(entry.block.end + 1) : "";
  }

  function replaceEntryBlockSource(instanceSource, entry, nextBlockSource) {
    var source = String(instanceSource || "");
    if (!entry) {
      return String(nextBlockSource || "");
    }
    return source.slice(0, entry.block.start) + String(nextBlockSource || "").trim() + source.slice(entry.block.end + 1);
  }

  function createBuilderItem(opts) {
    var options = opts || {};
    var item = document.createElement(Q.item);
    item.setAttribute("name", options.name || "Item");
    item.setAttribute("component", options.component || "pb-item");
    item.setAttribute("qhtml", options.qhtml || "");
    item.setAttribute("instance", options.instance || options.qhtml || "div { text { Empty component } }");
    item.appendPreview(options.preview || null);
    return item;
  }

  function payloadQHtmlFromSource(source) {
    if (!source || typeof source.getAttribute !== "function") {
      return "";
    }
    return builderItemQHtml(
      source.getAttribute("name") || "Item",
      source.getAttribute("component") || componentName(source),
      qhtmlDefinitionSource(source),
      qhtmlInstanceSource(source)
    );
  }

  var PaletteStore = {
    key: "qhtml6.pageBuilder.paletteSources.v2",
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
      if (this.__ready) {
        this.ensureInstanceEditButton();
        return;
      }
      this.__ready = true;
      this.renderChrome();
      this.addEventListener("pointerdown", this.onPointerDown.bind(this));
      this.addEventListener("click", this.onClick.bind(this));
    }

    ensureInstanceEditButton() {
      if (!this.querySelector(":scope > .q-builder-instance-edit")) {
        this.appendChild(createInstanceEditButton(this));
      }
    }

    renderChrome() {
      var name = this.getAttribute("name") || "Item";
      var existing = arr(this.childNodes);
      var bar = document.createElement("div");
      var label = document.createElement("span");
      var preview = document.createElement("div");

      if (this.querySelector(":scope > .q-builder-item-bar")) {
        this.ensureInstanceEditButton();
        return;
      }

      label.textContent = name;
      bar.className = "q-builder-item-bar";
      bar.appendChild(label);
      preview.className = "q-builder-item-preview";
      existing.forEach(function (node) {
        preview.appendChild(node);
      });
      if (existing.length === 0) {
        preview.appendChild(previewFragmentFromSource(
          previewSourceForElement(this),
          name
        ));
      }
      this.appendChild(bar);
      this.appendChild(preview);
      this.ensureInstanceEditButton();
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
      this.ensureInstanceEditButton();
    }

    refreshSourcePreview() {
      this.appendPreview(previewFragmentFromSource(
        previewSourceForElement(this),
        this.getAttribute("name") || "Item"
      ));
    }

    createPayload() {
      return this;
    }

    sourceQHtml() {
      return payloadQHtmlFromSource(this);
    }

    clonePayload() {
      var clone = createBuilderItem({
        name: this.getAttribute("name") || "Item",
        component: this.getAttribute("component") || "pb-item",
        qhtml: qhtmlDefinitionSource(this),
        instance: qhtmlInstanceSource(this),
        preview: previewFragmentFromSource(
          previewSourceForElement(this),
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
      var cell = this.closest(Q.col);
      var row = cell && cell.closest ? cell.closest(Q.row) : null;
      if (cell && root && !cell.closest(Q.toolbox)) {
        cell.remove();
        if (row && direct(row, Q.col).length === 0) {
          row.remove();
        }
        ensureCanvasPlaceholder(root);
        relayout(root);
      } else {
        this.remove();
        if (root) {
          ensureCanvasPlaceholder(root);
          relayout(root);
        }
      }
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
      var preview = this.__sourceEdited ? previewFragmentFromSource(previewSourceForElement(this), this.getAttribute("name") || "Item") : previewFragmentFromButton(this);
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
        qhtml: qhtmlDefinitionSource(this),
        instance: qhtmlInstanceSource(this),
        preview: previewFragmentFromSource(previewSourceForElement(this), this.getAttribute("name") || "Item")
      });
    }

    sourceQHtml() {
      return builderItemQHtml(this.getAttribute("name") || "Item", componentName(this), qhtmlDefinitionSource(this), qhtmlInstanceSource(this));
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
      var body = document.createElement("div");
      var bar = null;

      if (!docked) {
        bar = document.createElement("div");
        bar.className = "q-palette-titlebar";
        bar.textContent = title;
      }

      body.className = "q-palette-body";
      this.innerHTML = "";
      if (bar) { this.appendChild(bar); }
      this.appendChild(body);

      buttons.forEach(function (button) {
        body.appendChild(button);
      });

      this.__titlebar = bar;
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
      var payloadSource;
      var qrow;
      var qcol;
      if (!intent || !source) { return; }
      if (applyPaletteItemToRenderedSlot(intent, source, moving)) {
        return;
      }
      if (intentTouchesEditorPreview(intent)) {
        setStatus("Drop onto a component slot");
        return;
      }
      payloadSource = typeof source.sourceQHtml === "function" ? source.sourceQHtml() : payloadQHtmlFromSource(source);
      payload = moving ? source.createPayload() : source.createPayload();
      if (!payload && !payloadSource) { return; }

      if (intent.type === "replace") {
        if (moving && (intent.target === payload || payload.contains(intent.target))) { return; }
        if (payloadSource && replaceQDomWithQHtml(intent.target, "q-col { width: \"auto\"\n" + indentBlock(payloadSource, 1) + "\n}")) {
          if (moving && source && typeof source.remove === "function") {
            source.remove();
          }
          BuilderStore.saveSoon();
          return;
        }
        intent.target.innerHTML = "";
        intent.target.appendChild(payload);
        schedule(intent.target);
        BuilderStore.saveSoon();
        return;
      }

      if (intent.type === "insert-row") {
        qrow = insertQDomRow(intent.container, intent.index, { height: "auto" });
        if (qrow && typeof qrow.addCol === "function" && payloadSource) {
          qcol = qrow.addCol(Infinity, { width: "auto" });
          if (qcol && typeof qcol.appendNode === "function") {
            qcol.appendNode(payloadSource);
            if (moving && source && typeof source.remove === "function") {
              source.remove();
            }
            BuilderStore.saveSoon();
            renderLayoutSoon("Canvas updated");
            return;
          }
        }
        row = intent.container.addRow(intent.index, { height: "auto" });
        col = row.addCol(Infinity, { width: "auto" });
        col.appendChild(payload);
        schedule(intent.container);
        BuilderStore.saveSoon();
        return;
      }

      if (intent.type === "insert-col") {
        qcol = insertQDomCol(intent.container, intent.index, { width: "auto" });
        if (qcol && typeof qcol.appendNode === "function" && payloadSource) {
          qcol.appendNode(payloadSource);
          if (moving && source && typeof source.remove === "function") {
            source.remove();
          }
          BuilderStore.saveSoon();
          renderLayoutSoon("Canvas updated");
          return;
        }
        col = intent.container.addCol(intent.index, { width: "auto" });
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
    arr(document.querySelectorAll(Q.button)).forEach(function (button) {
      var name = componentName(button);
      var definition = qhtmlDefinitionSource(button);
      if (name && definition && !map[name]) {
        map[name] = definition;
      }
    });
    arr(layout.querySelectorAll(Q.item)).forEach(function (item) {
      var name = item.getAttribute("component") || "pb-item";
      var definition = qhtmlDefinitionSource(item);
      if (definition && !map[name]) {
        map[name] = definition;
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
      out.push(indentBlock(formatQHtmlSource(components[name] || ""), 1));
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
        lines.push(indentBlock(formatQHtmlSource(qhtmlInstanceSource(child)), level + 1));
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
    reconcileRenderedSlotState(root);
    return formatQHtmlSource(emitComponentDefinitions(root) + emitLayoutNode(root, 0)) + "\n";
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
      setPaletteEditorSource(this.sourceInput(), source);
      if (this.subtitle()) { this.subtitle().textContent = "Editing " + (button.getAttribute("name") || component) + " (" + component + ")"; }
      if (this.error()) { this.error().textContent = ""; }
      if (modal && typeof modal.showModal === "function") {
        modal.showModal();
      } else if (modal) {
        modal.setAttribute("open", "open");
      }
      setTimeout(function () {
        var editor = PaletteEditor.sourceInput();
        var input = editor && editor.querySelector ? editor.querySelector(".qe-input,.cm-content") : null;
        if (input && typeof input.focus === "function") {
          input.focus();
          if (typeof input.setSelectionRange === "function") {
            input.setSelectionRange(0, 0);
          }
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
      var source = readPaletteEditorSource(this.sourceInput());
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
      var source = readPaletteEditorSource(this.sourceInput());
      this.validate(source);
    }
  };

  var InstanceEditor = {
    currentItem: null,
    currentPath: "",
    currentSlot: "",
    drafts: null,
    draftOrder: null,
    bound: false,
    modal: function () { return document.getElementById("pb-instance-editor"); },
    instanceSelect: function () { return document.getElementById("pb-instance-editor-instance"); },
    slotSelect: function () { return document.getElementById("pb-instance-editor-slot"); },
    sourceInput: function () { return document.getElementById("pb-instance-editor-source"); },
    subtitle: function () { return document.getElementById("pb-instance-editor-subtitle"); },
    error: function () { return document.getElementById("pb-instance-editor-error"); },
    instanceRow: function () { return document.getElementById("pb-instance-editor-instance-row"); },
    slotRow: function () { return document.getElementById("pb-instance-editor-slot-row"); },
    bind: function () {
      var editor;
      if (this.bound) {
        return;
      }
      this.bound = true;
      editor = this.sourceInput();
      if (editor) {
        editor.addEventListener("q-editor-output", function () {
          InstanceEditor.validateCurrentEditor();
        });
        editor.addEventListener("input", function () {
          InstanceEditor.validateCurrentEditor();
        });
        editor.addEventListener("keyup", function () {
          InstanceEditor.validateCurrentEditor();
        });
      }
    },
    open: function (item) {
      var modal = this.modal();
      this.currentItem = item;
      this.currentPath = "";
      this.currentSlot = "";
      this.drafts = Object.create(null);
      this.draftOrder = [];
      reconcileRenderedSlotsForItem(item);
      this.bind();
      this.populateInstances();
      if (this.subtitle()) {
        this.subtitle().textContent = "Editing " + (item.getAttribute("name") || item.getAttribute("component") || "palette instance");
      }
      if (this.error()) {
        this.error().textContent = "";
      }
      if (modal && typeof modal.showModal === "function") {
        modal.showModal();
      } else if (modal) {
        modal.setAttribute("open", "open");
      }
    },
    close: function () {
      var modal = this.modal();
      if (modal && typeof modal.close === "function") {
        modal.close();
      } else if (modal) {
        modal.removeAttribute("open");
      }
      this.currentItem = null;
      this.currentPath = "";
      this.currentSlot = "";
      this.drafts = null;
      this.draftOrder = null;
    },
    entries: function () {
      return this.currentItem ? collectInstanceEntries(this.currentItem) : [];
    },
    selectedEntry: function () {
      return entryByPath(this.entries(), this.currentPath);
    },
    draftKey: function (path, slot) {
      return String(path || "") + "\u0000" + String(slot || "");
    },
    rememberDraft: function (path, slot, source) {
      var key = this.draftKey(path, slot);
      if (!this.drafts) {
        this.drafts = Object.create(null);
        this.draftOrder = [];
      }
      if (!this.drafts[key]) {
        this.draftOrder.push(key);
      }
      this.drafts[key] = {
        path: String(path || ""),
        slot: String(slot || ""),
        source: String(source || "")
      };
    },
    commitCurrentDraft: function () {
      if (!this.currentItem || !this.currentPath) {
        return;
      }
      this.rememberDraft(this.currentPath, this.currentSlot, readPaletteEditorSource(this.sourceInput()));
    },
    draftFor: function (path, slot) {
      var key = this.draftKey(path, slot);
      return this.drafts && this.drafts[key] ? this.drafts[key].source : null;
    },
    populateInstances: function () {
      var select = this.instanceSelect();
      var row = this.instanceRow();
      var entries = this.entries();
      if (!select) {
        return;
      }
      select.innerHTML = "";
      entries.forEach(function (entry) {
        var option = document.createElement("option");
        option.value = entry.path;
        option.textContent = entry.label;
        select.appendChild(option);
      });
      if (row) {
        row.hidden = entries.length <= 1;
      }
      this.currentPath = entries[0] ? entries[0].path : "";
      select.value = this.currentPath;
      this.populateSlots();
    },
    populateSlots: function () {
      var entry = this.selectedEntry();
      var select = this.slotSelect();
      var row = this.slotRow();
      if (!select) {
        return;
      }
      select.innerHTML = "";
      if (entry && entry.slots && entry.slots.length) {
        entry.slots.forEach(function (slotName) {
          var option = document.createElement("option");
          option.value = slotName;
          option.textContent = slotName;
          select.appendChild(option);
        });
        this.currentSlot = entry.slots[0];
        select.value = this.currentSlot;
        if (row) {
          row.hidden = false;
        }
      } else {
        this.currentSlot = "";
        if (row) {
          row.hidden = true;
        }
      }
      this.loadEditor();
    },
    loadEditor: function () {
      var item = this.currentItem;
      var entry = this.selectedEntry();
      var source = item ? qhtmlInstanceSource(item) : "";
      var editorSource = "";
      if (entry && this.currentSlot) {
        editorSource = slotSourceForEntry(source, entry, this.currentSlot);
      } else if (entry) {
        editorSource = source.slice(entry.block.start, entry.block.end + 1).trim();
      }
      if (this.draftFor(this.currentPath, this.currentSlot) !== null) {
        editorSource = this.draftFor(this.currentPath, this.currentSlot);
      }
      setPaletteEditorSource(this.sourceInput(), editorSource);
    },
    selectInstance: function (path) {
      this.commitCurrentDraft();
      this.currentPath = String(path || "");
      if (this.instanceSelect()) {
        this.instanceSelect().value = this.currentPath;
      }
      this.populateSlots();
    },
    selectSlot: function (slot) {
      this.commitCurrentDraft();
      this.currentSlot = String(slot || "");
      if (this.slotSelect()) {
        this.slotSelect().value = this.currentSlot;
      }
      this.loadEditor();
    },
    validate: function (source, finalSource) {
      if (!String(source || "").trim()) {
        if (this.error()) {
          this.error().textContent = "";
        }
        return true;
      }
      try {
        parseQHtmlSource(source);
        if (finalSource !== undefined) {
          parseQHtmlSource(finalSource);
        }
        if (this.error()) {
          this.error().textContent = "";
        }
        return true;
      } catch (error) {
        if (this.error()) {
          this.error().textContent = String(error && error.message ? error.message : error);
        }
        return false;
      }
    },
    validateCurrentEditor: function () {
      if (!this.currentItem) {
        return false;
      }
      return this.validate(readPaletteEditorSource(this.sourceInput()));
    },
    apply: function () {
      var item = this.currentItem;
      var source;
      var entries;
      var entry;
      var nextInstance;
      var draftList;
      var i;
      var draft;
      if (!item) {
        return;
      }
      this.commitCurrentDraft();
      source = qhtmlInstanceSource(item);
      draftList = (this.draftOrder || []).map(function (key) {
        return InstanceEditor.drafts[key];
      }).filter(Boolean);
      for (i = 0; i < draftList.length; i += 1) {
        draft = draftList[i];
        if (!this.validate(draft.source)) {
          setStatus("Instance editor source has a QHTML error");
          return;
        }
        entries = collectInstanceEntries({ getAttribute: function (name) {
          return name === "instance" ? source : item.getAttribute(name);
        } });
        entry = entryByPath(entries, draft.path);
        if (!entry) {
          if (this.error()) {
            this.error().textContent = "Could not find edited instance path: " + draft.path;
          }
          setStatus("Edited instance path no longer exists");
          return;
        }
        if (draft.slot) {
          nextInstance = replaceSlotInEntrySource(source, entry, draft.slot, draft.source);
        } else {
          nextInstance = replaceEntryBlockSource(source, entry, draft.source);
        }
        if (!nextInstance || !this.validate(draft.source, nextInstance)) {
          setStatus("Recomposed instance has a QHTML error");
          return;
        }
        source = nextInstance;
      }
      item.setAttribute("instance", formatQHtmlSource(source));
      if (typeof item.refreshSourcePreview === "function") {
        item.refreshSourcePreview();
      }
      relayout(rootOf(item));
      BuilderStore.saveSoon();
      setStatus("Updated instance QHTML");
      this.close();
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
      updateExportPanel(false);
      this.saveTimer = setTimeout(function () {
        BuilderStore.save();
      }, 80);
    },
    save: function () {
      var layout = document.getElementById("pb-builder-layout");
      if (!layout) { return; }
      try {
        localStorage.setItem(this.key, layout.innerHTML);
        updateExportPanel(false);
        setStatus("Saved");
      } catch (error) {
        setStatus("Save unavailable");
      }
    },
    load: function () {
      this.didRestore = false;
      this.restore();
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
      arr(layout.querySelectorAll(".pb-empty-drop")).forEach(function (node) { node.remove(); });
      arr(layout.querySelectorAll(Q.row + "," + Q.col)).forEach(installApi);
      relayout(layout);
      updateExportPanel(false);
      this.restoring = false;
      setStatus("Restored saved layout");
    }
  };

  function clearCanvas() {
    var layout = document.getElementById("pb-builder-layout");
    var qdom;
    if (!layout) { return; }
    qdom = qdomOf(layout);
    if (qdom && typeof qdom.replaceWithQHTML === "function") {
      qdom.replaceWithQHTML("q-layout#pb-builder-layout { width: \"100%\" gap: \"14px\" }", rootQDom());
      renderLayoutSoon("Canvas cleared");
      BuilderStore.saveSoon();
      return;
    }
    layout.innerHTML = "";
    relayout(layout);
    BuilderStore.saveSoon();
    setStatus("Canvas cleared");
  }

  function addRow() {
    var layout = document.getElementById("pb-builder-layout");
    var row;
    var col;
    var qrow;
    if (!layout) { return; }
    qrow = insertQDomRow(layout, Infinity, { height: "auto" });
    if (qrow && typeof qrow.addCol === "function") {
      qrow.addCol(Infinity, { width: "auto" });
      BuilderStore.saveSoon();
      renderLayoutSoon("Row added");
      return;
    }
    row = layout.addRow(Infinity, { height: "auto" });
    col = row.addCol(Infinity, { width: "auto" });
    col.classList.add("q-col-empty");
    relayout(layout);
    setStatus("Row added");
  }

  function addColumn() {
    var selected = document.querySelector(Q.item + ".pb-selected");
    var row = selected ? selected.closest(Q.row) : null;
    var layout = document.getElementById("pb-builder-layout");
    var col;
    var qcol;
    if (!row && layout) { row = layout.row(0); }
    if (!row) { return; }
    qcol = insertQDomCol(row, Infinity, { width: "auto" });
    if (qcol) {
      BuilderStore.saveSoon();
      renderLayoutSoon("Column added");
      return;
    }
    col = row.addCol(Infinity, { width: "auto" });
    col.classList.add("q-col-empty");
    relayout(layout || row);
    setStatus("Column added");
  }

  function exportToPanel() {
    return updateExportPanel(true);
  }

  function saveLayout() {
    BuilderStore.save();
  }

  function loadLayout() {
    BuilderStore.load();
  }

  function updateExportPanel(focusOutput) {
    var output = document.getElementById("pb-export-output");
    var source = exportQHtml();
    if (output) {
      setPaletteEditorSource(output, source);
      if (focusOutput && typeof output.focus === "function") {
        output.focus();
      }
    }
    if (focusOutput) {
      setStatus("Exported QHTML");
    }
    return source;
  }

  function define(tagName, klass) {
    if (!customElements.get(tagName)) {
      customElements.define(tagName, klass);
    }
  }

	  injectStyles();
	  define(Q.item, QBuilderItem);
	  define(Q.toolbox, QPaletteToolbox);
	  define(Q.button, QPaletteButton);
	  arr(document.querySelectorAll(Q.layout + "," + Q.row + "," + Q.col)).forEach(installApi);
	  arr(document.querySelectorAll(Q.layout)).forEach(relayout);
	  BuilderStore.restoreSoon();
	  updateExportPanel(false);

  window.QPageBuilder = {
    exportQHtml: exportQHtml,
    exportToPanel: exportToPanel,
    clearCanvas: clearCanvas,
    saveLayout: saveLayout,
    loadLayout: loadLayout,
    addRow: addRow,
    addColumn: addColumn,
    openPaletteEditor: function (button) { PaletteEditor.open(button); },
    closePaletteEditor: function () { PaletteEditor.close(); },
    savePaletteEdit: function () { PaletteEditor.save(); },
    previewPaletteEdit: function () { PaletteEditor.preview(); },
    openInstanceEditor: function (item) { InstanceEditor.open(item); },
    closeInstanceEditor: function () { InstanceEditor.close(); },
    saveInstanceEdit: function () { InstanceEditor.apply(); },
    selectInstanceEditTarget: function (path) { InstanceEditor.selectInstance(path); },
    selectInstanceEditSlot: function (slot) { InstanceEditor.selectSlot(slot); },
    relayout: relayout
  };

  if (!("inf" in window)) {
    Object.defineProperty(window, "inf", { value: Infinity, configurable: false, enumerable: false, writable: false });
  }
}());
