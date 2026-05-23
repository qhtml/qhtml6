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
      "body{margin:0;background:rgba(15,23,42,.92);font-family:'Aptos','Segoe UI',sans-serif;color:var(--pb-ink)}",
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
      ".pb-rendered-component-editable{position:relative}.pb-rendered-instance-edit{position:absolute;top:6px;right:6px;z-index:28;width:28px;height:28px;display:grid;place-items:center;border:1px solid rgba(37,99,235,.3);border-radius:999px;background:rgba(255,255,255,.95);color:#1d4ed8;box-shadow:0 8px 20px rgba(15,23,42,.18);cursor:pointer;opacity:0;pointer-events:none;transform:translateY(-3px);transition:opacity .14s ease,transform .14s ease}.pb-rendered-component-editable:hover>.pb-rendered-instance-edit,.pb-rendered-component-editable:focus-within>.pb-rendered-instance-edit{opacity:1;pointer-events:auto;transform:translateY(0)}.pb-rendered-instance-edit:hover{background:#eff6ff;color:#0f172a}.pb-rendered-instance-edit svg{width:13px;height:13px;display:block}",
      ".pb-hero-block{padding:32px;border-radius:20px;background:linear-gradient(135deg,#0f172a,#1d4ed8);color:white}.pb-hero-block h1{margin:0;font-size:38px;letter-spacing:-.06em}.pb-hero-block p{max-width:560px;color:#dbeafe}.pb-demo-button{border:0;border-radius:999px;background:#22d3ee;color:#0f172a;font-weight:900;padding:10px 16px}.pb-demo-button.ghost{background:white;color:#1d4ed8;border:1px solid #bfdbfe}.pb-feature-card{padding:22px;border-radius:18px;background:#f8fafc;border:1px solid #dbe4f0}.pb-feature-card h3,.pb-two-column-copy h3{margin-top:0}.pb-two-column-copy{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.pb-two-column-copy>div{padding:18px;border-radius:16px;background:#f8fafc;border:1px solid #dbe4f0}.pb-callout{padding:18px;border-radius:18px;background:#fffbeb;border:1px solid #fde68a;color:#78350f}.pb-button-row{display:flex;gap:12px;flex-wrap:wrap}",
      ".q-drag-ghost{position:fixed;z-index:99999;pointer-events:none;width:128px;min-height:82px;display:grid;place-items:center;border-radius:18px;border:2px solid #2563eb;background:white;color:#1d4ed8;font-size:13px;font-weight:950;text-align:center;padding:12px;box-shadow:0 22px 60px rgba(0,0,0,.38);opacity:.96}.q-drop-indicator{position:fixed;z-index:99998;pointer-events:none;border:3px solid #2563eb;border-radius:14px;background:rgba(37,99,235,.1);box-shadow:0 0 0 2px rgba(255,255,255,.72)}.q-drop-indicator.row-line{height:7px;border:0;border-radius:999px;background:#2563eb;box-shadow:0 0 0 2px rgba(255,255,255,.85)}.q-drop-indicator.col-line{width:7px;border:0;border-radius:999px;background:#2563eb;box-shadow:0 0 0 2px rgba(255,255,255,.85)}",
      ".pb-export-panel{min-height:0}.pb-export-panel q-editor{display:block;border-top:1px solid rgba(148,163,184,.28)}.pb-export-panel q-editor .qe{border:0;border-radius:0}.pb-export-panel q-editor .qe-editor-wrap,.pb-export-panel q-editor .qe-highlight,.pb-export-panel q-editor .qe-input,.pb-export-panel q-editor .qe-code,.pb-export-panel q-editor .qe-preview,.pb-export-panel q-editor .qe-cm-host,.pb-export-panel q-editor .qe-cm-host .cm-editor{min-height:174px}",
      ".pb-palette-editor{border:0;padding:0;background:transparent;max-width:min(980px,calc(100vw - 34px));width:980px}.pb-palette-editor::backdrop{background:rgba(15,23,42,.55);backdrop-filter:blur(5px)}.pb-palette-editor-card{background:#f8fafc;border:1px solid rgba(148,163,184,.45);border-radius:24px;box-shadow:0 36px 120px rgba(15,23,42,.38);overflow:hidden}.pb-palette-editor-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;padding:20px 22px;background:white;border-bottom:1px solid #dbe4f0}.pb-palette-editor-head h2{margin:0;font-size:20px;letter-spacing:-.04em}.pb-palette-editor-head p{margin:6px 0 0;color:#64748b;font-size:13px}.pb-icon-button{width:34px;height:34px;border:0;border-radius:999px;background:#eef2ff;color:#1e293b;font-size:23px;line-height:1;cursor:pointer}.pb-editor-label{display:block;padding:16px 22px 8px;color:#334155;font-size:12px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.pb-palette-editor q-editor{display:block;margin:0 22px 14px}.pb-palette-editor q-editor .qe{border-color:#cbd5e1;border-radius:16px}.pb-palette-editor q-editor .qe-editor-wrap,.pb-palette-editor q-editor .qe-highlight,.pb-palette-editor q-editor .qe-input,.pb-palette-editor q-editor .qe-code,.pb-palette-editor q-editor .qe-preview,.pb-palette-editor q-editor .qe-cm-host,.pb-palette-editor q-editor .qe-cm-host .cm-editor{min-height:340px}.pb-palette-editor-error{min-height:20px;margin:0 22px 10px;color:#be123c;font-size:13px;font-weight:800}.pb-palette-editor-actions{display:flex;justify-content:flex-end;gap:10px;padding:16px 22px 20px;border-top:1px solid #dbe4f0;background:#fff}",
      ".pb-palette-preview.new-component{border-color:#111827;background:linear-gradient(135deg,#ffffff,#e0f2fe)}q-palette-toolbox-button[data-pb-create-component='true']{cursor:pointer}.pb-component-builder{border:0;padding:0;background:transparent;width:min(1120px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto}.pb-component-builder::backdrop{background:rgba(15,23,42,.58);backdrop-filter:blur(5px)}.pb-component-builder-card{background:#f8fafc;border:1px solid rgba(148,163,184,.45);border-radius:24px;box-shadow:0 36px 120px rgba(15,23,42,.38);overflow:hidden}.pb-component-builder-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;padding:18px 22px;background:white;border-bottom:1px solid #dbe4f0}.pb-component-builder-head h2{margin:0;font-size:20px;letter-spacing:-.04em}.pb-component-builder-head p{margin:6px 0 0;color:#64748b;font-size:13px}.pb-component-builder-tabs{display:flex;gap:8px;flex-wrap:wrap;padding:12px 22px;background:#f1f5f9;border-bottom:1px solid #dbe4f0}.pb-component-builder-tabs button{border:1px solid #cbd5e1;background:white;color:#334155;border-radius:999px;padding:9px 13px;font-weight:900;cursor:pointer}.pb-component-builder-tabs button.active{background:#0f172a;border-color:#0f172a;color:white}.pb-component-builder-panel{padding:16px 22px}.pb-component-builder-panel[hidden]{display:none!important}.pb-component-general-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.pb-component-general-grid label{display:grid;gap:7px;color:#334155;font-size:12px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.pb-component-general-grid input{min-width:0;border:1px solid #cbd5e1;border-radius:12px;background:white;color:#0f172a;padding:11px 12px;font-size:14px}.pb-component-builder-workbench{display:grid;grid-template-columns:170px minmax(0,1fr);gap:14px;align-items:start}.pb-component-builder-tools{display:grid;gap:8px;max-height:60vh;overflow:auto}.pb-component-builder-tools button{border:1px solid #cbd5e1;border-radius:12px;background:white;color:#1d4ed8;font-weight:900;text-align:left;padding:9px 10px;cursor:pointer}.pb-component-builder-tools button:hover{background:#eff6ff;color:#0f172a}.pb-component-builder q-editor{display:block;min-height:58vh}.pb-component-builder q-editor .qe{min-height:58vh;border-color:#cbd5e1;border-radius:16px}.pb-component-builder q-editor .qe-editor-wrap,.pb-component-builder q-editor .qe-highlight,.pb-component-builder q-editor .qe-input,.pb-component-builder q-editor .qe-code,.pb-component-builder q-editor .qe-preview,.pb-component-builder q-editor .qe-cm-host,.pb-component-builder q-editor .qe-cm-host .cm-editor{min-height:58vh}.pb-component-builder-error{min-height:20px;padding:0 22px 8px;color:#be123c;font-size:13px;font-weight:800}.pb-component-builder-actions{display:flex;justify-content:flex-end;gap:10px;padding:14px 22px 18px;border-top:1px solid #dbe4f0;background:#fff}.pb-mini-dialog{border:0;border-radius:18px;padding:0;background:white;box-shadow:0 28px 90px rgba(15,23,42,.38);width:min(420px,calc(100vw - 32px))}.pb-mini-dialog::backdrop{background:rgba(15,23,42,.45)}.pb-mini-card{display:grid;gap:14px;padding:18px}.pb-mini-card h3{margin:0;font-size:16px}.pb-mini-card select{width:100%;border:1px solid #cbd5e1;border-radius:12px;padding:10px;background:white}.pb-mini-actions{display:flex;justify-content:flex-end;gap:9px}",
      ".pb-instance-editor{border:0;padding:0;background:transparent;width:min(90vw,1180px);max-width:90vw;max-height:calc(100vh - 32px);overflow-y:auto}.pb-instance-editor::backdrop{background:rgba(15,23,42,.58);backdrop-filter:blur(5px)}.pb-instance-editor-card{background:#f8fafc;border:1px solid rgba(148,163,184,.45);border-radius:24px;box-shadow:0 36px 120px rgba(15,23,42,.38);overflow:hidden}.pb-instance-editor-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;padding:18px 22px;background:white;border-bottom:1px solid #dbe4f0}.pb-instance-editor-head h2{margin:0;font-size:20px;letter-spacing:-.04em}.pb-instance-editor-head p{margin:6px 0 0;color:#64748b;font-size:13px}.pb-instance-controls{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;padding:14px 22px;background:#f1f5f9;border-bottom:1px solid #dbe4f0}.pb-instance-controls label{display:grid;gap:6px;color:#334155;font-size:12px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.pb-instance-controls select{min-width:0;border:1px solid #cbd5e1;border-radius:12px;background:white;color:#0f172a;padding:10px;font-size:14px}.pb-instance-editor-body{padding:16px 22px}.pb-instance-editor q-editor{display:block;min-height:60vh}.pb-instance-editor q-editor .qe{min-height:60vh;border-color:#cbd5e1;border-radius:16px}.pb-instance-editor q-editor .qe-editor-wrap,.pb-instance-editor q-editor .qe-highlight,.pb-instance-editor q-editor .qe-input,.pb-instance-editor q-editor .qe-code,.pb-instance-editor q-editor .qe-preview,.pb-instance-editor q-editor .qe-cm-host,.pb-instance-editor q-editor .qe-cm-host .cm-editor{min-height:60vh}.pb-instance-editor-error{min-height:20px;padding:0 22px 8px;color:#be123c;font-size:13px;font-weight:800}.pb-instance-editor-actions{display:flex;justify-content:flex-end;gap:10px;padding:14px 22px 18px;border-top:1px solid #dbe4f0;background:#fff}.pb-instance-editor-actions .primary{background:#0f172a;color:white}",
      ".pb-file-dialog{border:0;padding:0;background:transparent;width:min(760px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto}.pb-file-dialog::backdrop{background:rgba(15,23,42,.58);backdrop-filter:blur(5px)}.pb-file-card{background:#f8fafc;border:1px solid rgba(148,163,184,.45);border-radius:24px;box-shadow:0 36px 120px rgba(15,23,42,.38);overflow:hidden}.pb-file-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;padding:18px 22px;background:white;border-bottom:1px solid #dbe4f0}.pb-file-head h2{margin:0;font-size:20px;letter-spacing:-.04em}.pb-file-head p{margin:6px 0 0;color:#64748b;font-size:13px}.pb-file-toolbar{display:flex;gap:10px;flex-wrap:wrap;padding:14px 22px;background:#f1f5f9;border-bottom:1px solid #dbe4f0}.pb-file-body{padding:14px 18px 18px;min-height:360px}.pb-file-body q-tree-view{display:none}.pb-file-tree{min-height:340px;max-height:54vh;overflow:auto;border:1px solid #dbe4f0;border-radius:16px;background:white;padding:8px}.pb-file-list{list-style:none;margin:0;padding:0}.pb-file-node{width:100%;display:flex;align-items:center;gap:8px;border:0;background:transparent;color:#0f172a;text-align:left;border-radius:10px;padding:8px 10px;font-size:14px;cursor:pointer}.pb-file-node:hover{background:#eff6ff}.pb-file-node.selected{background:#dbeafe;color:#1d4ed8;font-weight:900}.pb-file-node.folder{font-weight:850}.pb-file-glyph{width:18px;color:#64748b}.pb-file-actions{display:flex;align-items:center;justify-content:flex-end;gap:10px;padding:14px 22px 18px;border-top:1px solid #dbe4f0;background:#fff}.pb-file-selected{margin-right:auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#475569;font-size:13px;font-weight:800}.pb-file-context-menu{min-width:150px;background:white;border:1px solid #cbd5e1;border-radius:14px;box-shadow:0 22px 70px rgba(15,23,42,.24);padding:6px}.pb-file-context-menu button{display:block;width:100%;border:0;background:transparent;text-align:left;border-radius:10px;padding:9px 10px;color:#0f172a;font-weight:800;cursor:pointer}.pb-file-context-menu button:hover{background:#eff6ff;color:#1d4ed8}#pb-file-context-menu{display:none;width:auto!important;height:auto!important;z-index:7000}#pb-file-context-menu .q-popup-container{width:auto;height:auto}",
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

  function qhtmlSupportSource(el) {
    return rawAttr(el, "support");
  }

  function qhtmlInstanceSource(el) {
    return safeAttr(el, "instance", qhtmlAttrSource(el));
  }

  function qhtmlStringLiteral(value) {
    return JSON.stringify(String(value == null ? "" : value));
  }

  function builderItemQHtml(name, component, source, instance, support) {
    var definition = source == null ? "" : String(source);
    var instantiation = instance == null || instance === "" ? (definition || "div { text { Empty component } }") : String(instance);
    var lines = [
      "q-builder-item {",
      "  name: " + qhtmlStringLiteral(name || "Item"),
      "  component: " + qhtmlStringLiteral(component || "pb-item"),
      "  qhtml: " + qhtmlStringLiteral(definition)
    ];
    if (support) {
      lines.push("  support: " + qhtmlStringLiteral(support));
    }
    lines.push("  instance: " + qhtmlStringLiteral(instantiation));
    lines.push("}");
    return lines.join("\n");
  }

  function componentDefinitionBlock(component, source) {
    var name = String(component || "").trim();
    var body = formatQHtmlSource(source);
    if (!name || !body) {
      return "";
    }
    return "q-component " + name + " {\n" + indentBlock(body, 1) + "\n}";
  }

  function collectPaletteDefinitions(primaryComponent, primaryDefinition, primarySupport) {
    var map = Object.create(null);
    var support = [];
    var seenSupport = Object.create(null);
    var primaryName = String(primaryComponent || "").trim();
    function addSupport(source) {
      var text = String(source || "").trim();
      if (text && !seenSupport[text]) {
        seenSupport[text] = true;
        support.push(text);
      }
    }
    addSupport(primarySupport);
    if (primaryName && String(primaryDefinition || "").trim()) {
      map[primaryName] = String(primaryDefinition || "");
    }
    arr(document.querySelectorAll(Q.button)).forEach(function (button) {
      var name = componentName(button);
      var source = qhtmlDefinitionSource(button);
      addSupport(qhtmlSupportSource(button));
      if (name && source && !map[name]) {
        map[name] = source;
      }
    });
    return support.concat(Object.keys(map).sort().map(function (name) {
      return componentDefinitionBlock(name, map[name]);
    }).filter(Boolean)).join("\n\n");
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

  function setQEditorRawSource(editor, source) {
    var raw = String(source || "");
    if (!editor) {
      return;
    }
    if (typeof editor.setQhtmlSource === "function" && editor.querySelector && editor.querySelector(".qe")) {
      editor.setQhtmlSource(raw);
      return;
    }
    editor.textContent = raw;
    if (typeof editor.setQhtmlSource === "function") {
      editor.setQhtmlSource(raw);
    }
  }

  function readQEditorRawSource(editor) {
    if (!editor) {
      return "";
    }
    if (typeof editor.getQhtmlSource === "function") {
      return String(editor.getQhtmlSource() || "");
    }
    return String(editor.textContent || editor.innerHTML || "");
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
    var support = qhtmlSupportSource(el);
    var instance = qhtmlInstanceSource(el);
    if (definition) {
      return collectPaletteDefinitions(component, definition, support) + "\n\n" + instance;
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

  function slotSourceInInstanceBlock(instanceSource, slotName) {
    var source = String(instanceSource || "").trim();
    var roots = readQHtmlBlocks(source, 0, source.length);
    var root = roots[0] || null;
    var block;
    if (!root || !slotName) {
      return "";
    }
    block = directBlockByName(source, root.bodyStart, root.bodyEnd, slotName);
    return block ? source.slice(block.bodyStart, block.bodyEnd).trim() : "";
  }

  function transformSlotInInstanceBlock(instanceSource, slotName, transform) {
    var current = slotSourceInInstanceBlock(instanceSource, slotName);
    var next = typeof transform === "function" ? transform(current) : current;
    return replaceInstanceSlotSource(instanceSource, slotName, next);
  }

  function transformSlotInComponentOccurrence(instanceSource, componentName, ordinal, slotName, transform) {
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
          nextBlock = transformSlotInInstanceBlock(blockSource, slotName, transform);
          return nextBlock ? source.slice(0, nameStart) + nextBlock + source.slice(blockClose + 1) : "";
        }
        count += 1;
      }
      i = blockOpen + 1;
    }
    return "";
  }

  function qhtmlColumnSource(source) {
    var body = formatQHtmlSource(source);
    return "q-col {\n  width: \"1fr\"\n" + (body ? indentBlock(body, 1) + "\n" : "") + "}";
  }

  function qhtmlRowSource(source) {
    var body = formatQHtmlSource(source);
    return "q-row {\n  height: \"auto\"\n  q-col {\n    width: \"1fr\"\n" + (body ? indentBlock(body, 2) + "\n" : "") + "  }\n}";
  }

  function insertDirectionalIntoLayoutSlotSource(slotSource, layoutBlock, dropSource, direction) {
    var source = String(slotSource || "").trim();
    var layout = layoutBlock;
    var row = directBlockByName(source, layout.bodyStart, layout.bodyEnd, Q.row);
    var insertion;
    var dir = String(direction || "right").toLowerCase();
    if (dir === "left" || dir === "right") {
      if (row) {
        insertion = "\n" + indentBlock(qhtmlColumnSource(dropSource), 2) + "\n";
        return dir === "left"
          ? source.slice(0, row.bodyStart) + insertion + source.slice(row.bodyStart)
          : source.slice(0, row.end).trimEnd() + insertion + source.slice(row.end);
      }
      insertion = "\n" + indentBlock(qhtmlColumnSource(dropSource), 1) + "\n";
      return dir === "left"
        ? source.slice(0, layout.bodyStart) + insertion + source.slice(layout.bodyStart)
        : source.slice(0, layout.end).trimEnd() + insertion + source.slice(layout.end);
    }
    insertion = "\n" + indentBlock(qhtmlRowSource(dropSource), 1) + "\n";
    return dir === "top"
      ? source.slice(0, layout.bodyStart) + insertion + source.slice(layout.bodyStart)
      : source.slice(0, layout.end).trimEnd() + insertion + source.slice(layout.end);
  }

  function appendDirectionalToSlotSource(slotSource, dropSource, direction) {
    var existing = String(slotSource || "").trim();
    var dropped = String(dropSource || "").trim();
    var dir = String(direction || "right").toLowerCase();
    var blocks;
    var layout;
    if (!dropped) {
      return existing;
    }
    if (!existing) {
      return dropped;
    }
    blocks = readQHtmlBlocks(existing, 0, existing.length);
    layout = blocks.filter(function (block) {
      return String(block.name || "").toLowerCase() === Q.layout;
    })[0] || null;
    if (layout) {
      return formatQHtmlSource(insertDirectionalIntoLayoutSlotSource(existing, layout, dropped, dir));
    }
    if (dir === "top" || dir === "bottom") {
      return formatQHtmlSource([
        "q-layout {",
        "  width: \"100%\"",
        "  gap: \"8px\"",
        dir === "top" ? indentBlock(qhtmlRowSource(dropped), 1) : indentBlock(qhtmlRowSource(existing), 1),
        dir === "top" ? indentBlock(qhtmlRowSource(existing), 1) : indentBlock(qhtmlRowSource(dropped), 1),
        "}"
      ].join("\n"));
    }
    return formatQHtmlSource([
      "q-layout {",
      "  width: \"100%\"",
      "  gap: \"8px\"",
      "  q-row {",
      "    height: \"auto\"",
      dir === "left" ? indentBlock(qhtmlColumnSource(dropped), 2) : indentBlock(qhtmlColumnSource(existing), 2),
      dir === "left" ? indentBlock(qhtmlColumnSource(existing), 2) : indentBlock(qhtmlColumnSource(dropped), 2),
      "  }",
      "}"
    ].join("\n"));
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

  function horizontalDistanceToSlotEdge(surface, line) {
    var r = surface.getBoundingClientRect();
    return Math.min(Math.abs(Number(line) - r.left), Math.abs(Number(line) - r.right));
  }

  function edgeDistanceForPoint(rect, point) {
    if (!rect || !point) {
      return Infinity;
    }
    return Math.min(
      Math.abs(Number(point.x) - rect.left),
      Math.abs(Number(point.x) - rect.right),
      Math.abs(Number(point.y) - rect.top),
      Math.abs(Number(point.y) - rect.bottom)
    );
  }

  function edgeDirectionForPoint(rect, point, fallback) {
    var distances;
    var ordered;
    if (!rect || !point) {
      return fallback || "right";
    }
    distances = {
      left: Math.abs(Number(point.x) - rect.left),
      right: Math.abs(Number(point.x) - rect.right),
      top: Math.abs(Number(point.y) - rect.top),
      bottom: Math.abs(Number(point.y) - rect.bottom)
    };
    ordered = Object.keys(distances).sort(function (a, b) {
      return distances[a] - distances[b];
    });
    return ordered[0] || fallback || "right";
  }

  function pointInRect(point, rect) {
    return !!(point && rect && point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom);
  }

  function verticalOverlap(a, b) {
    return Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  }

  function closestRenderedSlotSurfaceForIntent(intent) {
    var target = intent && (intent.target || intent.container);
    var directSurface = target && target.closest ? target.closest("[data-pb-slot]") : null;
    var owner = target && target.closest ? target.closest(Q.item) : null;
    var preview = owner && owner.querySelector ? owner.querySelector(":scope > .q-builder-item-preview") : null;
    var point = intent && intent.point ? intent.point : null;
    var lineX = intent && intent.type === "insert-col" ? Number(intent.line) : point ? Number(point.x) : NaN;
    var containerRect = intent && intent.container && intent.container.getBoundingClientRect
      ? intent.container.getBoundingClientRect()
      : null;
    var directDistance = directSurface && Number.isFinite(lineX) ? horizontalDistanceToSlotEdge(directSurface, lineX) : Infinity;
    var candidates;
    if (!intent || !preview || !Number.isFinite(lineX)) {
      return directSurface;
    }
    candidates = arr(preview.querySelectorAll("[data-pb-slot]")).filter(function (surface) {
      var r = surface.getBoundingClientRect();
      if (surface.closest(Q.toolbox)) {
        return false;
      }
      if (point) {
        if (point.y < r.top || point.y > r.bottom) {
          return false;
        }
      } else if (containerRect && verticalOverlap(r, containerRect) <= 0) {
        return false;
      }
      return point ? edgeDistanceForPoint(r, point) <= directDistance : horizontalDistanceToSlotEdge(surface, lineX) <= directDistance;
    }).sort(function (a, b) {
      var ar = a.getBoundingClientRect();
      var br = b.getBoundingClientRect();
      var ad = point ? edgeDistanceForPoint(ar, point) : horizontalDistanceToSlotEdge(a, lineX);
      var bd = point ? edgeDistanceForPoint(br, point) : horizontalDistanceToSlotEdge(b, lineX);
      if (ad !== bd) {
        return ad - bd;
      }
      return ar.width * ar.height - br.width * br.height;
    });
    return candidates[0] || directSurface;
  }

  function directionalRenderedSlotDrop(intent, surface) {
    var r;
    var edge;
    var point;
    if (!intent || !surface || !surface.getBoundingClientRect) {
      return "";
    }
    r = surface.getBoundingClientRect();
    point = intent.point || null;
    if (!point) {
      if (intent.type === "insert-col") {
        point = { x: Number(intent.line), y: r.top + r.height / 2 };
      } else if (intent.type === "insert-row") {
        point = { x: r.left + r.width / 2, y: Number(intent.line) };
      }
    }
    if (!point || !Number.isFinite(Number(point.x)) || !Number.isFinite(Number(point.y))) {
      return "";
    }
    edge = Math.min(48, Math.max(18, Math.min(r.width, r.height) * 0.25));
    return edgeDistanceForPoint(r, point) <= edge ? edgeDirectionForPoint(r, point, "right") : "";
  }

  function applyPaletteItemToRenderedSlot(intent, source, moving) {
    var surface = closestRenderedSlotSurfaceForIntent(intent);
    var owner = surface && surface.closest ? surface.closest(Q.item) : null;
    var componentHost = renderedComponentHostForSlot(surface, owner);
    var slotName = surface ? surface.getAttribute("data-pb-slot") : "";
    var droppedSource = source ? qhtmlInstanceSource(source) : "";
    var direction = directionalRenderedSlotDrop(intent, surface);
    var slotTransform;
    var nextInstance;
    if (!surface || !owner || !slotName || !source || owner === source || (source.contains && source.contains(owner))) {
      return false;
    }
    slotTransform = direction
      ? function appendDirectionalSlotTransform(slotSource) { return appendDirectionalToSlotSource(slotSource, droppedSource, direction); }
      : function replaceSlotTransform() { return droppedSource; };
    if (componentHost) {
      nextInstance = transformSlotInComponentOccurrence(
        qhtmlInstanceSource(owner),
        tag(componentHost),
        renderedComponentOrdinal(owner, componentHost),
        slotName,
        slotTransform
      );
    }
    if (!nextInstance) {
      nextInstance = transformSlotInInstanceBlock(
        qhtmlInstanceSource(owner),
        slotName,
        slotTransform
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

  function dropTargetBuilderItem(intent, source) {
    var target = intent && (intent.target || intent.container);
    var item = target && target.closest ? target.closest(Q.item) : null;
    var point = intent && intent.point ? intent.point : null;
    var pointed;
    if (!item && intent && intent.type === "item-edge" && intent.target) {
      item = intent.target;
    }
    if (!item && point && document.elementFromPoint) {
      pointed = document.elementFromPoint(Number(point.x), Number(point.y));
      item = pointed && pointed.closest ? pointed.closest(Q.item) : null;
    }
    if (!item || item.closest(Q.toolbox) || item === source || (source && source.contains && source.contains(item)) || (item.contains && item.contains(source))) {
      return null;
    }
    return item;
  }

  function entryLabelForSlotChoice(entry, slotName) {
    return (entry && entry.label ? entry.label : entry && entry.component ? entry.component : "component") + " / " + slotName;
  }

  function slotChoicesForBuilderItem(owner) {
    var source = qhtmlInstanceSource(owner);
    var choices = [];
    collectInstanceEntries(owner).forEach(function (entry) {
      (entry.slots || []).forEach(function (slotName) {
        choices.push({
          entry: entry,
          slotName: slotName,
          label: entryLabelForSlotChoice(entry, slotName),
          current: slotSourceForEntry(source, entry, slotName)
        });
      });
    });
    return choices;
  }

  function closestSlotChoiceForSurface(owner, surface) {
    var componentHost = renderedComponentHostForSlot(surface, owner);
    var entry = componentHost ? entryForRenderedComponentHost(owner, componentHost) : collectInstanceEntries(owner)[0] || null;
    var slotName = surface && surface.getAttribute ? surface.getAttribute("data-pb-slot") : "";
    if (!entry || !slotName) {
      return null;
    }
    return {
      entry: entry,
      slotName: slotName,
      label: entryLabelForSlotChoice(entry, slotName),
      current: slotSourceForEntry(qhtmlInstanceSource(owner), entry, slotName)
    };
  }

  function slotChoiceForHoveredInstance(owner, intent) {
    var point = intent && intent.point ? intent.point : null;
    var preview = owner && owner.querySelector ? owner.querySelector(":scope > .q-builder-item-preview") : null;
    var node = point && document.elementFromPoint ? document.elementFromPoint(Number(point.x), Number(point.y)) : null;
    var host = node && node.closest ? node.closest("[q-component]") : null;
    var entries;
    var entry;
    var parts;
    var slotName;
    var parentPath;
    var parentEntry;
    if (!host || !preview || !preview.contains(host) || host === owner) {
      return null;
    }
    entries = collectInstanceEntries(owner);
    entry = entryForRenderedComponentHost(owner, host);
    parts = entry && entry.path ? String(entry.path).split(".") : [];
    if (parts.length < 3) {
      return null;
    }
    slotName = parts[parts.length - 2];
    parentPath = parts.slice(0, -2).join(".");
    parentEntry = entryByPath(entries, parentPath);
    if (!parentEntry || !slotName) {
      return null;
    }
    return {
      entry: parentEntry,
      slotName: slotName,
      label: entryLabelForSlotChoice(parentEntry, slotName),
      current: slotSourceForEntry(qhtmlInstanceSource(owner), parentEntry, slotName)
    };
  }

  function directSlotChoiceForIntent(owner, intent) {
    var surface = closestRenderedSlotSurfaceForIntent(intent);
    var directChoice = surface && owner && surface.closest && surface.closest(Q.item) === owner
      ? closestSlotChoiceForSurface(owner, surface)
      : null;
    return directChoice || slotChoiceForHoveredInstance(owner, intent);
  }

  function createBuilderDialog(title, body) {
    var dialog = document.createElement("dialog");
    var card = document.createElement("div");
    var heading = document.createElement("h3");
    dialog.className = "pb-mini-dialog";
    card.className = "pb-mini-card";
    heading.textContent = title;
    card.appendChild(heading);
    if (body) {
      card.appendChild(body);
    }
    dialog.appendChild(card);
    document.body.appendChild(dialog);
    return dialog;
  }

  function closeBuilderDialog(dialog) {
    closeDialog(dialog);
    setTimeout(function () {
      if (dialog && dialog.parentNode) {
        dialog.remove();
      }
    }, 0);
  }

  function showSlotDropActionDialog(onInsert, onReplace) {
    var body = document.createElement("div");
    var message = document.createElement("p");
    var actions = document.createElement("div");
    var replace = document.createElement("button");
    var insert = document.createElement("button");
    var dialog;
    message.textContent = "Do you want to insert this item into a component slot or replace the target?";
    actions.className = "pb-mini-actions";
    insert.className = "pb-action primary";
    insert.type = "button";
    insert.textContent = "Insert into slot";
    replace.className = "pb-action secondary";
    replace.type = "button";
    replace.textContent = "Replace Target";
    actions.appendChild(replace);
    actions.appendChild(insert);
    body.appendChild(message);
    body.appendChild(actions);
    dialog = createBuilderDialog("Choose drop action", body);
    insert.addEventListener("click", function () {
      closeBuilderDialog(dialog);
      onInsert();
    });
    replace.addEventListener("click", function () {
      closeBuilderDialog(dialog);
      onReplace();
    });
    dialog.addEventListener("cancel", function (event) {
      event.preventDefault();
      closeBuilderDialog(dialog);
    });
    showDialog(dialog);
  }

  function showSlotChoiceDialog(choices, preferredChoice, onChoose) {
    var body = document.createElement("div");
    var label = document.createElement("label");
    var select = document.createElement("select");
    var actions = document.createElement("div");
    var cancel = document.createElement("button");
    var ok = document.createElement("button");
    var dialog;
    var preferredIndex = choices.reduce(function (found, choice, index) {
      if (found >= 0 || !preferredChoice) {
        return found;
      }
      return choice.slotName === preferredChoice.slotName && choice.label === preferredChoice.label ? index : found;
    }, -1);
    preferredIndex = Math.max(0, preferredIndex);
    label.textContent = "Slot";
    choices.forEach(function (choice, index) {
      var option = document.createElement("option");
      option.value = String(index);
      option.textContent = choice.label;
      select.appendChild(option);
    });
    select.value = String(preferredIndex);
    actions.className = "pb-mini-actions";
    cancel.className = "pb-action secondary";
    cancel.type = "button";
    cancel.textContent = "Cancel";
    ok.className = "pb-action primary";
    ok.type = "button";
    ok.textContent = "Insert";
    label.appendChild(select);
    actions.appendChild(cancel);
    actions.appendChild(ok);
    body.appendChild(label);
    body.appendChild(actions);
    dialog = createBuilderDialog("Choose slot", body);
    cancel.addEventListener("click", function () {
      closeBuilderDialog(dialog);
    });
    ok.addEventListener("click", function () {
      var choice = choices[Number(select.value)] || choices[0];
      closeBuilderDialog(dialog);
      onChoose(Object.assign({}, choice, { mode: "replace" }));
    });
    dialog.addEventListener("cancel", function (event) {
      event.preventDefault();
      closeBuilderDialog(dialog);
    });
    showDialog(dialog);
  }

  function applyPaletteItemToSlotChoice(owner, source, moving, choice) {
    var droppedSource = source ? qhtmlInstanceSource(source) : "";
    var nextInstance;
    var slotTransform;
    if (!owner || !source || !droppedSource || !choice || !choice.entry || !choice.slotName) {
      return false;
    }
    slotTransform = choice.mode === "append"
      ? function appendPromptedSlot(current) {
        return String(current || "").trim() ? String(current || "").trim() + "\n" + droppedSource : droppedSource;
      }
      : function replacePromptedSlot() { return droppedSource; };
    nextInstance = replaceSlotInEntrySource(
      qhtmlInstanceSource(owner),
      choice.entry,
      choice.slotName,
      slotTransform(slotSourceForEntry(qhtmlInstanceSource(owner), choice.entry, choice.slotName))
    );
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
    renderLayoutSoon("Updated " + choice.slotName);
    return true;
  }

  function openSlotDropDialog(owner, intent, source, moving, choices, preferredChoice) {
    showSlotDropActionDialog(function insertIntoSlot() {
      showSlotChoiceDialog(choices, preferredChoice, function chooseSlot(choice) {
        applyPaletteItemToSlotChoice(owner, source, moving, choice);
      });
    }, function replaceTarget() {
      Applier.apply(Object.assign({}, intent, { __pbSkipSlotDialog: true }), source, moving);
    });
  }

  function applyPaletteItemToPromptedSlot(intent, source, moving) {
    var owner = dropTargetBuilderItem(intent, source);
    var choices;
    var directChoice;
    if (!owner || !source || !qhtmlInstanceSource(source)) {
      return false;
    }
    choices = slotChoicesForBuilderItem(owner);
    if (!choices.length) {
      return false;
    }
    directChoice = directSlotChoiceForIntent(owner, intent);
    openSlotDropDialog(owner, intent, source, moving, choices, directChoice);
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

  function createRenderedInstanceEditButton(owner, path) {
    var edit = document.createElement("button");
    edit.type = "button";
    edit.className = "pb-rendered-instance-edit";
    edit.setAttribute("aria-label", "Edit nested instance");
    edit.innerHTML = pencilSvg();
    edit.addEventListener("pointerdown", function (event) {
      event.preventDefault();
      event.stopPropagation();
    });
    edit.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      InstanceEditor.open(owner, path);
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

  function entryForRenderedComponentHost(owner, componentHost) {
    var component = tag(componentHost);
    var ordinal = renderedComponentOrdinal(owner, componentHost);
    var matches = collectInstanceEntries(owner).filter(function (entry) {
      return String(entry.component || "").toLowerCase() === component;
    });
    return matches[ordinal] || matches[0] || null;
  }

  function enhanceRenderedInstanceEditors(owner) {
    var preview = owner && owner.querySelector ? owner.querySelector(":scope > .q-builder-item-preview") : null;
    if (!preview || owner.closest(Q.toolbox)) {
      return;
    }
    arr(preview.querySelectorAll("[q-component]")).forEach(function (host) {
      var entry;
      if (host === owner || host.querySelector(":scope > .pb-rendered-instance-edit")) {
        return;
      }
      entry = entryForRenderedComponentHost(owner, host);
      if (!entry) {
        return;
      }
      host.classList.add("pb-rendered-component-editable");
      host.appendChild(createRenderedInstanceEditButton(owner, entry.path));
    });
  }

  function createBuilderItem(opts) {
    var options = opts || {};
    var item = document.createElement(Q.item);
    item.setAttribute("name", options.name || "Item");
    item.setAttribute("component", options.component || "pb-item");
    item.setAttribute("qhtml", options.qhtml || "");
    if (options.support) {
      item.setAttribute("support", options.support);
    }
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
      qhtmlInstanceSource(source),
      qhtmlSupportSource(source)
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

  function paletteToolboxBody() {
    var toolbox = document.querySelector(Q.toolbox + "[docked='true']") || document.querySelector(Q.toolbox);
    return toolbox ? toolbox.querySelector(".q-palette-body") || toolbox : null;
  }

  function paletteRecordFromButton(button) {
    return {
      name: button.getAttribute("name") || componentName(button),
      component: componentName(button),
      qhtml: qhtmlDefinitionSource(button),
      instance: qhtmlInstanceSource(button),
      support: qhtmlSupportSource(button)
    };
  }

  function importedPaletteButtons() {
    return arr(document.querySelectorAll(Q.button + "[data-pb-imported='page']"));
  }

  function collectImportedPaletteRecords() {
    return importedPaletteButtons().map(paletteRecordFromButton);
  }

  function clearImportedPaletteButtons() {
    importedPaletteButtons().forEach(function (button) {
      button.remove();
    });
  }

  function importedPaletteInsertBefore(body) {
    var launcher = body && body.querySelector ? body.querySelector(Q.button + "[data-pb-create-component='true']") : null;
    var node = launcher ? launcher.nextSibling : null;
    if (!launcher) {
      return null;
    }
    while (node && node.nodeType === 1 && node.matches && node.matches(Q.button + "[data-pb-imported='page']")) {
      node = node.nextSibling;
    }
    return node;
  }

  function revealPaletteComponent(component) {
    var button = paletteButtonForComponent(component);
    if (button && typeof button.scrollIntoView === "function") {
      button.scrollIntoView({ block: "nearest" });
    }
    return button;
  }

  function addPaletteButtonRecord(record) {
    var data = record || {};
    var component = String(data.component || "").trim().toLowerCase();
    var existing;
    var button;
    var preview;
    var body;
    if (!component) {
      return null;
    }
    existing = paletteButtonForComponent(component);
    if (existing) {
      existing.setAttribute("name", data.name || existing.getAttribute("name") || component);
      existing.setAttribute("qhtml", data.qhtml || data.definition || qhtmlDefinitionSource(existing));
      existing.setAttribute("instance", data.instance || qhtmlInstanceSource(existing));
      existing.setAttribute("data-pb-imported", "page");
      if (data.support) {
        existing.setAttribute("support", data.support);
      } else {
        existing.removeAttribute("support");
      }
      existing.__sourceEdited = true;
      if (typeof existing.renderLabel === "function") {
        existing.renderLabel();
      }
      return existing;
    }
    body = paletteToolboxBody();
    if (!body) {
      return null;
    }
    button = document.createElement(Q.button);
    button.setAttribute("name", data.name || component);
    button.setAttribute("component", component);
    button.setAttribute("qhtml", data.qhtml || data.definition || "");
    button.setAttribute("instance", data.instance || component + " { }");
    button.setAttribute("data-pb-imported", "page");
    if (data.support) {
      button.setAttribute("support", data.support);
    }
    preview = document.createElement("div");
    preview.className = "pb-palette-preview edited";
    preview.innerHTML = "<h3>" + escapeHtmlText(data.name || component) + "</h3><p>Imported component</p>";
    button.appendChild(preview);
    body.insertBefore(button, importedPaletteInsertBefore(body));
    return button;
  }

  function applyImportedPaletteRecords(records) {
    clearImportedPaletteButtons();
    (Array.isArray(records) ? records : []).forEach(function (record) {
      addPaletteButtonRecord(record);
    });
  }

  function isTokenBoundary(text, index, length) {
    var before = index <= 0 ? "" : text.charAt(index - 1);
    var after = index + length >= text.length ? "" : text.charAt(index + length);
    return !qhtmlSourceNameChar(before) && !qhtmlSourceNameChar(after);
  }

  function readIdentifierAt(text, index) {
    var i = qhtmlSourceSkipWhitespace(text, index);
    var start = i;
    while (i < text.length && qhtmlSourceNameChar(text.charAt(i))) {
      i += 1;
    }
    return { value: text.slice(start, i), end: i };
  }

  function scanTopLevelDefinitionBlocks(source, keywords) {
    var text = String(source || "");
    var wanted = keywords || [];
    var blocks = [];
    var quote = "";
    var escaped = false;
    var depth = 0;
    var i;
    var k;
    var keyword;
    var nameInfo;
    var open;
    var close;
    var name;
    for (i = 0; i < text.length; i += 1) {
      var ch = text.charAt(i);
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
        continue;
      }
      if (ch === "}") {
        depth = Math.max(0, depth - 1);
        continue;
      }
      if (depth !== 0) {
        continue;
      }
      for (k = 0; k < wanted.length; k += 1) {
        keyword = wanted[k];
        if (text.slice(i, i + keyword.length).toLowerCase() !== keyword || !isTokenBoundary(text, i, keyword.length)) {
          continue;
        }
        nameInfo = keyword === "q-import" ? { value: "", end: i + keyword.length } : readIdentifierAt(text, i + keyword.length);
        name = nameInfo.value;
        open = text.indexOf("{", nameInfo.end);
        if (open < 0) {
          continue;
        }
        close = qhtmlSourceMatchingBrace(text, open);
        if (close < 0) {
          continue;
        }
        blocks.push({
          keyword: keyword,
          name: name,
          start: i,
          open: open,
          end: close,
          bodyStart: open + 1,
          bodyEnd: close,
          source: text.slice(i, close + 1),
          body: text.slice(open + 1, close)
        });
        i = close;
        break;
      }
    }
    return blocks;
  }

  function removeSourceRanges(source, ranges) {
    var text = String(source || "");
    var sorted = (ranges || []).slice().sort(function (a, b) { return a[0] - b[0]; });
    var out = "";
    var cursor = 0;
    sorted.forEach(function (range) {
      out += text.slice(cursor, range[0]);
      cursor = Math.max(cursor, range[1] + 1);
    });
    out += text.slice(cursor);
    return out;
  }

  function analyzeImportedQHtmlSource(source) {
    var definitions = scanTopLevelDefinitionBlocks(source, ["q-component"]);
    var components = Object.create(null);
    var ranges = [];
    definitions.forEach(function (block) {
      ranges.push([block.start, block.end]);
      components[String(block.name || "").toLowerCase()] = {
        component: String(block.name || "").toLowerCase(),
        name: block.name || "Imported",
        qhtml: block.body.trim()
      };
    });
    return {
      components: components,
      remainder: removeSourceRanges(source, ranges).trim()
    };
  }

  function findFirstImportedInstance(source, componentSet, componentNameValue) {
    var wanted = String(componentNameValue || "").toLowerCase();
    var found = "";
    function visit(rangeSource, start, end) {
      readQHtmlBlocks(rangeSource, start, end).some(function (block) {
        var name = String(block.name || "").toLowerCase();
        if (name === wanted) {
          found = block.source;
          return true;
        }
        if (!componentSet[name]) {
          visit(rangeSource, block.bodyStart, block.bodyEnd);
        }
        return !!found;
      });
    }
    visit(String(source || ""), 0, String(source || "").length);
    return found;
  }

  function transformImportedInstancesToBuilderItems(source, componentMap, supportSource) {
    var text = String(source || "");
    var rawBlocks = { html: true, text: true, style: true, onclick: true, onchange: true, oninput: true, onmount: true, onpaint: true };
    function transformRange(start, end) {
      var blocks = readQHtmlBlocks(text, start, end);
      var out = "";
      var cursor = start;
      blocks.forEach(function (block) {
        var name = String(block.name || "").toLowerCase();
        var component = componentMap[name];
        out += text.slice(cursor, block.start);
        if (component) {
          out += builderItemQHtml(component.name || name, name, component.qhtml || "", block.source, component.support || supportSource || "");
        } else if (rawBlocks[name]) {
          out += text.slice(block.start, block.end + 1);
        } else {
          out += text.slice(block.start, block.bodyStart) + transformRange(block.bodyStart, block.bodyEnd) + text.slice(block.bodyEnd, block.end + 1);
        }
        cursor = block.end + 1;
      });
      out += text.slice(cursor, end);
      return out;
    }
    return transformRange(0, text.length).trim();
  }

  function importedLayoutSourceFromPieces(pieces) {
    var rows = (pieces || []).map(function (piece) {
      return indentBlock(qhtmlRowSource(piece), 1);
    }).join("\n");
    return "q-layout {\n  width: \"100%\"\n  gap: \"14px\"\n" + rows + "\n}";
  }

  function renderImportedLayoutToCanvas(source) {
    var layout = document.getElementById("pb-builder-layout");
    var temp = document.createElement("div");
    var imported;
    if (!layout || !String(source || "").trim()) {
      return false;
    }
    if (!renderQHtmlSourceInto(temp, source, "Imported layout")) {
      return false;
    }
    imported = temp.querySelector(Q.layout);
    arr(imported ? imported.childNodes : temp.childNodes).forEach(function (node) {
      layout.appendChild(node.cloneNode(true));
    });
    arr(layout.querySelectorAll(Q.row + "," + Q.col)).forEach(installApi);
    arr(layout.querySelectorAll(Q.item)).forEach(function (item) {
      if (typeof item.refreshSourcePreview === "function") {
        item.refreshSourcePreview();
      }
    });
    relayout(layout);
    BuilderStore.dirty = true;
    BuilderStore.saveSoon();
    updateExportPanel(false);
    return true;
  }

  function mergePaletteRecords(existing, imported) {
    var map = Object.create(null);
    var out = [];
    function add(record) {
      var component = String(record && record.component || "").toLowerCase();
      if (!component) {
        return;
      }
      if (!map[component]) {
        map[component] = Object.assign({}, record);
        out.push(map[component]);
      } else {
        Object.keys(record).forEach(function (key) {
          map[component][key] = record[key];
        });
      }
    }
    (Array.isArray(existing) ? existing : []).forEach(add);
    (Array.isArray(imported) ? imported : []).forEach(add);
    return out;
  }

  function importQHtmlSource(qhtmlSource, filename) {
    var analysis = analyzeImportedQHtmlSource(qhtmlSource);
    var componentSet = Object.create(null);
    var records = [];
    var pieces = [];
    var importedCount = 0;
    if (!FileStore.ensureCurrentFile(filename || "imported.qhtml")) {
      setStatus("Import cancelled");
      return false;
    }
    Object.keys(analysis.components).forEach(function (name) {
      componentSet[name] = true;
    });
    Object.keys(analysis.components).forEach(function (name) {
      var component = analysis.components[name];
      component.instance = findFirstImportedInstance(analysis.remainder, componentSet, name) || name + " { }";
      addPaletteButtonRecord(component);
      records.push(component);
      importedCount += 1;
    });
    if (analysis.remainder) {
      pieces.push(transformImportedInstancesToBuilderItems(analysis.remainder, analysis.components, ""));
    }
    pieces = pieces.map(function (piece) { return String(piece || "").trim(); }).filter(Boolean);
    if (!pieces.length && !records.length) {
      setStatus("No importable QHTML found");
      return false;
    }
    FileStore.setCurrentPalette(mergePaletteRecords(collectImportedPaletteRecords(), records));
    if (pieces.length && !renderImportedLayoutToCanvas(importedLayoutSourceFromPieces(pieces))) {
      setStatus("Imported QHTML could not be rendered");
      return false;
    }
    FileStore.saveCurrent({ silent: true });
    setStatus("Imported " + (filename || "QHTML") + " with " + importedCount + " component" + (importedCount === 1 ? "" : "s"));
    return true;
  }

  function importQHtmlFile() {
    var input = document.createElement("input");
    input.type = "file";
    input.accept = ".qhtml,text/plain";
    input.addEventListener("change", function () {
      var file = input.files && input.files[0];
      var reader;
      if (!file) {
        return;
      }
      reader = new FileReader();
      reader.onload = function () {
        importQHtmlSource(String(reader.result || ""), file.name);
      };
      reader.onerror = function () {
        setStatus("Import failed");
      };
      reader.readAsText(file);
    });
    input.click();
  }

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
        enhanceRenderedInstanceEditors(this);
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
        enhanceRenderedInstanceEditors(this);
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
      enhanceRenderedInstanceEditors(this);
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
        support: qhtmlSupportSource(this),
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
      if (this.isComponentBuilderLauncher()) {
        this.addEventListener("click", function (event) {
          event.preventDefault();
          event.stopPropagation();
          if (window.QPageBuilder && typeof window.QPageBuilder.openComponentBuilder === "function") {
            window.QPageBuilder.openComponentBuilder();
          }
        });
        return;
      }
      this.addEventListener("pointerdown", function (event) {
        if (event.target.closest(".pb-palette-edit-button")) { return; }
        if (event.button !== 0) { return; }
        event.preventDefault();
        event.stopPropagation();
        Drag.start(event, this, false);
      });
    }

    isComponentBuilderLauncher() {
      return this.getAttribute("data-pb-create-component") === "true";
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
      if (this.isComponentBuilderLauncher()) {
        this.setAttribute("title", "Create a new q-component palette item");
        return;
      }
      this.appendChild(createPaletteEditButton(this));
      this.setAttribute("title", "Drag " + (this.getAttribute("name") || "Item") + " onto the canvas");
    }

    setQhtmlSource(source) {
      this.__sourceEdited = true;
      this.setAttribute("qhtml", String(source || ""));
      this.renderLabel();
    }

    createPayload() {
      if (this.isComponentBuilderLauncher()) {
        return null;
      }
      return createBuilderItem({
        name: this.getAttribute("name") || "Item",
        component: componentName(this),
        qhtml: qhtmlDefinitionSource(this),
        instance: qhtmlInstanceSource(this),
        support: qhtmlSupportSource(this),
        preview: previewFragmentFromSource(previewSourceForElement(this), this.getAttribute("name") || "Item")
      });
    }

    sourceQHtml() {
      if (this.isComponentBuilderLauncher()) {
        return "";
      }
      return builderItemQHtml(this.getAttribute("name") || "Item", componentName(this), qhtmlDefinitionSource(this), qhtmlInstanceSource(this), qhtmlSupportSource(this));
    }
  }

  class QPaletteToolbox extends HTMLElement {
    connectedCallback() {
      if (this.__ready) { return; }
      this.__ready = true;
      this.render();
      FileStore.applyCurrentPalette();
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
        return;
      }
      if (intent.type === "item-edge") {
        r = intent.target.getBoundingClientRect();
        if (intent.direction === "top" || intent.direction === "bottom") {
          y = intent.direction === "top" ? r.top : r.bottom;
          this.el.classList.add("row-line");
          this.el.style.left = r.left + "px";
          this.el.style.top = y - 3.5 + "px";
          this.el.style.width = r.width + "px";
          this.el.style.height = "7px";
          return;
        }
        x = intent.direction === "left" ? r.left : r.right;
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
      var intent = this.itemEdge(point, movingItem) || (layout ? this.container(layout, point, movingItem) : null);
      if (intent && point) {
        intent.point = { x: point.x, y: point.y };
      }
      return intent;
    },
    itemEdge: function (point, movingItem) {
      var candidates;
      if (!point) {
        return null;
      }
      candidates = arr(document.querySelectorAll(Q.item)).filter(function (item) {
        var r;
        var edge;
        if (item.closest(Q.toolbox)) { return false; }
        if (movingItem && (item === movingItem || movingItem.contains(item) || item.contains(movingItem))) { return false; }
        r = item.getBoundingClientRect();
        if (!pointInRect(point, r)) { return false; }
        edge = Math.min(54, Math.max(18, Math.min(r.width, r.height) * 0.28));
        return edgeDistanceForPoint(r, point) <= edge;
      }).sort(function (a, b) {
        var ar = a.getBoundingClientRect();
        var br = b.getBoundingClientRect();
        return ar.width * ar.height - br.width * br.height;
      });
      if (!candidates.length) {
        return null;
      }
      return {
        type: "item-edge",
        target: candidates[0],
        direction: edgeDirectionForPoint(candidates[0].getBoundingClientRect(), point, "right")
      };
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

  function appendItemToCol(col, item) {
    if (!col || !item) {
      return;
    }
    col.appendChild(item);
    if (typeof item.ensureInstanceEditButton === "function") {
      item.ensureInstanceEditButton();
    }
  }

  function cleanupMovedFromCell(cell, root) {
    var row;
    if (!cell || !cell.isConnected || cell.querySelector(Q.item) || direct(cell, Q.layout).length || direct(cell, Q.row).length) {
      return;
    }
    row = cell.closest ? cell.closest(Q.row) : null;
    cell.remove();
    if (row && row.isConnected && direct(row, Q.col).length === 0) {
      row.remove();
    }
    if (root) {
      ensureCanvasPlaceholder(root);
    }
  }

  function createDirectionalItemLayout(target, payload, direction) {
    var layout = make(Q.layout, { width: "100%", gap: "8px" });
    var firstRow;
    var secondRow;
    var firstCol;
    var secondCol;
    var dir = String(direction || "right").toLowerCase();
    if (dir === "top" || dir === "bottom") {
      firstRow = make(Q.row, { height: "auto" });
      secondRow = make(Q.row, { height: "auto" });
      firstCol = make(Q.col, { width: "1fr" });
      secondCol = make(Q.col, { width: "1fr" });
      firstRow.appendChild(firstCol);
      secondRow.appendChild(secondCol);
      layout.appendChild(firstRow);
      layout.appendChild(secondRow);
      appendItemToCol(dir === "top" ? firstCol : secondCol, payload);
      appendItemToCol(dir === "top" ? secondCol : firstCol, target);
      return layout;
    }
    firstRow = make(Q.row, { height: "auto" });
    firstCol = make(Q.col, { width: "1fr" });
    secondCol = make(Q.col, { width: "1fr" });
    firstRow.appendChild(firstCol);
    firstRow.appendChild(secondCol);
    layout.appendChild(firstRow);
    appendItemToCol(dir === "left" ? firstCol : secondCol, payload);
    appendItemToCol(dir === "left" ? secondCol : firstCol, target);
    return layout;
  }

  function applyItemEdgeDrop(intent, source, moving) {
    var target = intent && intent.target;
    var payload;
    var parent;
    var oldCell;
    var root;
    var wrapper;
    var marker;
    if (!target || !source || target === source || (source.contains && source.contains(target)) || (target.contains && target.contains(source))) {
      return false;
    }
    payload = moving ? source.createPayload() : source.createPayload();
    if (!payload) {
      return false;
    }
    parent = target.parentNode;
    if (!parent) {
      return false;
    }
    oldCell = moving && source.closest ? source.closest(Q.col) : null;
    root = rootOf(target) || rootOf(source);
    marker = document.createTextNode("");
    parent.insertBefore(marker, target);
    wrapper = createDirectionalItemLayout(target, payload, intent.direction);
    parent.replaceChild(wrapper, marker);
    schedule(wrapper);
    cleanupMovedFromCell(oldCell, root);
    relayout(root || wrapper);
    BuilderStore.saveSoon();
    renderLayoutSoon("Canvas item moved");
    return true;
  }

  var Applier = {
    apply: function (intent, source, moving) {
      var row;
      var col;
      var payload;
      var payloadSource;
      var qrow;
      var qcol;
      var oldCell;
      if (!intent || !source) { return; }
      if (!intent.__pbSkipSlotDialog && applyPaletteItemToRenderedSlot(intent, source, moving)) {
        return;
      }
      if (!intent.__pbSkipSlotDialog && applyPaletteItemToPromptedSlot(intent, source, moving)) {
        return;
      }
      if (intent.type === "item-edge" && applyItemEdgeDrop(intent, source, moving)) {
        return;
      }
      if (intentTouchesEditorPreview(intent)) {
        setStatus("Drop onto a component slot");
        return;
      }
      payloadSource = typeof source.sourceQHtml === "function" ? source.sourceQHtml() : payloadQHtmlFromSource(source);
      payload = moving ? source.createPayload() : source.createPayload();
      if (!payload && !payloadSource) { return; }
      oldCell = moving && source.closest ? source.closest(Q.col) : null;

      if (intent.type === "replace") {
        if (moving && (intent.target === payload || payload.contains(intent.target))) { return; }
        if (!moving && payloadSource && replaceQDomWithQHtml(intent.target, "q-col { width: \"auto\"\n" + indentBlock(payloadSource, 1) + "\n}")) {
          if (moving && source && typeof source.remove === "function") {
            source.remove();
          }
          BuilderStore.saveSoon();
          return;
        }
        intent.target.innerHTML = "";
        intent.target.appendChild(payload);
        cleanupMovedFromCell(oldCell, rootOf(intent.target));
        schedule(intent.target);
        BuilderStore.saveSoon();
        return;
      }

      if (intent.type === "insert-row") {
        qrow = moving ? null : insertQDomRow(intent.container, intent.index, { height: "auto" });
        if (qrow && typeof qrow.addCol === "function" && payloadSource) {
          qcol = qrow.addCol(Infinity, { width: "auto" });
          if (qcol && typeof qcol.appendNode === "function") {
            qcol.appendNode(payloadSource);
            BuilderStore.saveSoon();
            renderLayoutSoon("Canvas updated");
            return;
          }
        }
        row = intent.container.addRow(intent.index, { height: "auto" });
        col = row.addCol(Infinity, { width: "auto" });
        col.appendChild(payload);
        cleanupMovedFromCell(oldCell, rootOf(intent.container));
        schedule(intent.container);
        BuilderStore.saveSoon();
        return;
      }

      if (intent.type === "insert-col") {
        qcol = moving ? null : insertQDomCol(intent.container, intent.index, { width: "auto" });
        if (qcol && typeof qcol.appendNode === "function" && payloadSource) {
          qcol.appendNode(payloadSource);
          BuilderStore.saveSoon();
          renderLayoutSoon("Canvas updated");
          return;
        }
        col = intent.container.addCol(intent.index, { width: "auto" });
        col.appendChild(payload);
        cleanupMovedFromCell(oldCell, rootOf(intent.container));
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
    var support = [];
    var seenSupport = Object.create(null);
    function addSupport(source) {
      var text = String(source || "").trim();
      if (text && !seenSupport[text]) {
        seenSupport[text] = true;
        support.push(text);
      }
    }
    arr(document.querySelectorAll(Q.button)).forEach(function (button) {
      var name = componentName(button);
      var definition = qhtmlDefinitionSource(button);
      addSupport(qhtmlSupportSource(button));
      if (name && definition && !map[name]) {
        map[name] = definition;
      }
    });
    arr(layout.querySelectorAll(Q.item)).forEach(function (item) {
      var name = item.getAttribute("component") || "pb-item";
      var definition = qhtmlDefinitionSource(item);
      addSupport(qhtmlSupportSource(item));
      if (definition && !map[name]) {
        map[name] = definition;
      }
    });
    return { components: map, support: support };
  }

  function emitComponentDefinitions(layout) {
    var collected = collectUsedComponents(layout);
    var components = collected.components || {};
    var names = Object.keys(components).sort();
    var out = (collected.support || []).slice();
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

  function componentBuilderNameInputSafe(value) {
    var text = String(value || "");
    var out = "";
    var i;
    var ch;
    for (i = 0; i < text.length; i += 1) {
      ch = text.charAt(i);
      if (/[A-Za-z0-9-]/.test(ch) || ch.charCodeAt(0) > 127) {
        out += ch;
      }
    }
    out = out.replace(/^-+|-+$/g, "");
    return out || "my-component";
  }

  function componentBuilderExtendsInputSafe(value) {
    return String(value || "")
      .split(/\s+/)
      .map(function (item) {
        return item ? componentBuilderNameInputSafe(item) : "";
      })
      .filter(Boolean)
      .join(" ");
  }

  function componentBuilderHeader(name, extendsText) {
    var parts = ["q-component", componentBuilderNameInputSafe(name)];
    componentBuilderExtendsInputSafe(extendsText).split(/\s+/).filter(Boolean).forEach(function (item) {
      parts.push("extends");
      parts.push(item);
    });
    return parts.join(" ");
  }

  function componentBuilderBlockInfo(source) {
    var blocks = scanTopLevelDefinitionBlocks(source, ["q-component"]);
    return blocks[0] || null;
  }

  function componentBuilderBodySource(source) {
    var block = componentBuilderBlockInfo(source);
    return block ? block.body : "";
  }

  function componentBuilderParseHeader(source) {
    var block = componentBuilderBlockInfo(source);
    var head;
    var parts;
    if (!block) {
      return null;
    }
    head = String(source || "").slice(block.start, block.open).trim();
    parts = head.split(/\s+/);
    return {
      name: parts[1] || block.name || "my-component",
      extendsText: parts.filter(function (part, index) {
        return index > 1 && part !== "extends";
      }).join(" ")
    };
  }

  function componentBuilderReplaceHeader(source, name, extendsText) {
    var block = componentBuilderBlockInfo(source);
    var header = componentBuilderHeader(name, extendsText);
    if (!block) {
      return header + " {\n}\n";
    }
    return String(source || "").slice(0, block.start) + header + " " + String(source || "").slice(block.open);
  }

  function componentBuilderExtractPreview(source) {
    var text = String(source || "");
    var block = componentBuilderBlockInfo(text);
    if (!block) {
      return { componentSource: text.trim(), instanceSource: "" };
    }
    return {
      componentSource: text.slice(block.start, block.end + 1).trim(),
      instanceSource: text.slice(block.end + 1).trim()
    };
  }

  function componentBuilderSnippet(kind) {
    var tagName;
    var name;
    var expr;
    switch (kind) {
      case "tag":
        tagName = prompt("Tag or selector chain", "div");
        if (tagName === null) { return null; }
        tagName = String(tagName || "div").replace(/[^\w.#,: -]+/g, "").trim() || "div";
        return { text: tagName + " {\n  \n}\n", offset: tagName.length + 5 };
      case "q-signal":
        name = prompt("Signal name and params", "saved(value)");
        if (name === null) { return null; }
        return { text: "q-signal " + String(name || "saved(value)").trim() + "\n" };
      case "slot":
        name = prompt("Slot name", "content");
        if (name === null) { return null; }
        name = String(name || "content").replace(/[^\w-]+/g, "") || "content";
        return { text: "slot { " + name + " }\n" };
      case "function":
        name = prompt("Function name", "run");
        if (name === null) { return null; }
        name = String(name || "run").replace(/[^\w$]+/g, "") || "run";
        return { text: "function " + name + "() {\n  \n}\n", offset: ("function " + name + "() {\n  ").length };
      case "q-property":
        name = prompt("Property name", "label");
        if (name === null) { return null; }
        name = String(name || "label").replace(/[^\w-]+/g, "") || "label";
        return { text: "q-property " + name + ": \"\"\n", offset: ("q-property " + name + ": \"").length };
      case "q-var":
        name = prompt("q-var name", "value");
        if (name === null) { return null; }
        name = String(name || "value").replace(/[^\w-]+/g, "") || "value";
        return { text: "q-var " + name + " { \"\" }\n", offset: ("q-var " + name + " { \"").length };
      case "q-layout":
        return { text: "q-layout {\n  width: \"100%\"\n  gap: \"12px\"\n  q-row {\n    q-col {\n      \n    }\n  }\n}\n", offset: 66 };
      case "q-row":
        return { text: "q-row {\n  q-col {\n    \n  }\n}\n", offset: 20 };
      case "q-col":
        return { text: "q-col {\n  \n}\n", offset: 10 };
      case "q-connect":
        expr = prompt("q-connect expression", "sender.signal receiver.handler");
        if (expr === null) { return null; }
        return { text: "q-connect { " + String(expr || "sender.signal receiver.handler").trim() + " }\n" };
      case "html":
        return { text: "html {\n  \n}\n", offset: 9 };
      case "text":
        return { text: "text {  }\n", offset: 7 };
      case "onclick":
        return { text: "onclick {\n  \n}\n", offset: 12 };
      case "onready":
        return { text: "onReady {\n  \n}\n", offset: 12 };
      case "onpaint":
        return { text: "onpaint {\n  \n}\n", offset: 12 };
      default:
        return null;
    }
  }

  function componentBuilderFindTextInput(editor) {
    return editor && editor.querySelector ? editor.querySelector(".qe-input,textarea") : null;
  }

  function componentBuilderCursorRange(editor, source) {
    var text = String(source || "");
    var view = editor && editor._cmView;
    var input;
    var sel;
    var start;
    var end;
    if (view && view.state && view.state.selection && view.state.selection.main) {
      sel = view.state.selection.main;
      start = Math.max(0, Math.min(text.length, Math.min(Number(sel.anchor), Number(sel.head))));
      end = Math.max(0, Math.min(text.length, Math.max(Number(sel.anchor), Number(sel.head))));
      editor.__pbComponentBuilderCursor = { start: start, end: end };
      return { start: start, end: end };
    }
    input = componentBuilderFindTextInput(editor);
    if (input && typeof input.selectionStart === "number") {
      start = Math.max(0, Math.min(text.length, input.selectionStart));
      end = Math.max(0, Math.min(text.length, typeof input.selectionEnd === "number" ? input.selectionEnd : start));
      editor.__pbComponentBuilderCursor = { start: start, end: end };
      return { start: start, end: end };
    }
    if (editor && editor.__pbComponentBuilderCursor) {
      return {
        start: Math.max(0, Math.min(text.length, editor.__pbComponentBuilderCursor.start || 0)),
        end: Math.max(0, Math.min(text.length, editor.__pbComponentBuilderCursor.end || editor.__pbComponentBuilderCursor.start || 0))
      };
    }
    start = Math.max(0, text.lastIndexOf("}"));
    return { start: start, end: start };
  }

  function componentBuilderRememberCursor(editor) {
    if (!editor) {
      return;
    }
    componentBuilderCursorRange(editor, readQEditorRawSource(editor));
  }

  function componentBuilderSetCursor(editor, pos) {
    var next = Math.max(0, Number(pos) || 0);
    var view = editor && editor._cmView;
    var input;
    if (view && view.state && view.state.doc && typeof view.dispatch === "function") {
      next = Math.min(view.state.doc.length, next);
      view.dispatch({ selection: { anchor: next, head: next } });
      if (typeof view.focus === "function") {
        view.focus();
      }
      editor.__pbComponentBuilderCursor = { start: next, end: next };
      return;
    }
    input = componentBuilderFindTextInput(editor);
    if (input && typeof input.focus === "function") {
      next = Math.min(String(readQEditorRawSource(editor) || "").length, next);
      input.focus();
      if (typeof input.setSelectionRange === "function") {
        input.setSelectionRange(next, next);
      }
      editor.__pbComponentBuilderCursor = { start: next, end: next };
    }
  }

  function componentBuilderInsertText(editor, insertion) {
    var source = readQEditorRawSource(editor);
    var range = componentBuilderCursorRange(editor, source);
    var start = range.start;
    var end = range.end;
    var text = insertion && insertion.text != null ? String(insertion.text) : "";
    var block = componentBuilderBlockInfo(source);
    var prefix;
    if (block && (start <= block.open || start > block.end || end > block.end)) {
      start = block.end;
      end = block.end;
      prefix = source.charAt(start - 1) === "\n" ? "" : "\n";
      text = prefix + indentBlock(text.replace(/\n$/, ""), 1) + "\n";
    }
    var next = source.slice(0, start) + text + source.slice(end);
    setQEditorRawSource(editor, next);
    setTimeout(function () {
      componentBuilderSetCursor(editor, start + (insertion && typeof insertion.offset === "number" ? insertion.offset : text.length));
    }, 0);
    return next;
  }

  function componentBuilderIndentSelection(editor, outdent) {
    var input = componentBuilderFindTextInput(editor);
    var source = readQEditorRawSource(editor);
    var start = input && typeof input.selectionStart === "number" ? input.selectionStart : 0;
    var end = input && typeof input.selectionEnd === "number" ? input.selectionEnd : source.length;
    var lineStart = source.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
    var before = source.slice(0, lineStart);
    var selected = source.slice(lineStart, end);
    var after = source.slice(end);
    var nextSelected = selected.split("\n").map(function (line) {
      return outdent ? line.replace(/^ {1,2}/, "") : "  " + line;
    }).join("\n");
    setQEditorRawSource(editor, before + nextSelected + after);
  }

  function componentBuilderSignalList(source) {
    var list = [];
    String(source || "").replace(/q-signal\s+([A-Za-z0-9_-]+)(?:\s*\(([^)]*)\))?/g, function (_, name, params) {
      list.push({ name: name, params: String(params || "").trim() });
      return _;
    });
    return list;
  }

  function componentBuilderPropertyList(source) {
    var list = [];
    String(source || "").replace(/q-property\s+([A-Za-z0-9_-]+)/g, function (_, name) {
      list.push({ name: name });
      return _;
    });
    return list;
  }

  function componentBuilderHandlerName(name, suffix) {
    var base = String(name || "").split(/[^A-Za-z0-9]+/).filter(Boolean).map(function (part) {
      return part.charAt(0).toUpperCase() + part.slice(1);
    }).join("");
    return "on" + (base || "Signal") + (suffix || "");
  }

  function componentBuilderParamName(name) {
    var parts = String(name || "value").split(/[^A-Za-z0-9]+/).filter(Boolean);
    if (!parts.length) {
      return "value";
    }
    return parts[0].toLowerCase() + parts.slice(1).map(function (part) {
      return part.charAt(0).toUpperCase() + part.slice(1);
    }).join("");
  }

  function chooseComponentBuilderItem(title, options, callback) {
    var dialog = document.createElement("dialog");
    var card = document.createElement("div");
    var heading = document.createElement("h3");
    var select = document.createElement("select");
    var actions = document.createElement("div");
    var cancel = document.createElement("button");
    var ok = document.createElement("button");
    dialog.className = "pb-mini-dialog";
    card.className = "pb-mini-card";
    actions.className = "pb-mini-actions";
    heading.textContent = title;
    (options || []).forEach(function (item, index) {
      var option = document.createElement("option");
      option.value = String(index);
      option.textContent = item.label || item.name || String(item);
      select.appendChild(option);
    });
    cancel.className = "pb-action secondary";
    cancel.type = "button";
    cancel.textContent = "Cancel";
    ok.className = "pb-action primary";
    ok.type = "button";
    ok.textContent = "OK";
    cancel.addEventListener("click", function () {
      closeDialog(dialog);
      dialog.remove();
    });
    ok.addEventListener("click", function () {
      var item = options[Number(select.value)] || options[0];
      closeDialog(dialog);
      dialog.remove();
      callback(item);
    });
    actions.appendChild(cancel);
    actions.appendChild(ok);
    card.appendChild(heading);
    card.appendChild(select);
    card.appendChild(actions);
    dialog.appendChild(card);
    document.body.appendChild(dialog);
    showDialog(dialog);
  }

  var ComponentBuilder = {
    activeTab: "general",
    componentSource: "",
    instanceSource: "",
    syncing: false,
    bound: false,
    syncTimer: 0,
    syncDelay: 120,
    modal: function () { return document.getElementById("pb-component-builder"); },
    nameInput: function () { return document.getElementById("pb-component-builder-name"); },
    extendsInput: function () { return document.getElementById("pb-component-builder-extends"); },
    structureEditor: function () { return document.getElementById("pb-component-builder-structure"); },
    handlersEditor: function () { return document.getElementById("pb-component-builder-handlers"); },
    previewEditor: function () { return document.getElementById("pb-component-builder-preview"); },
    error: function () { return document.getElementById("pb-component-builder-error"); },
    bind: function () {
      var modal;
      if (this.bound) {
        return;
      }
      this.bound = true;
      modal = this.modal();
      [this.structureEditor(), this.handlersEditor()].forEach(function (editor) {
        if (!editor) { return; }
        ["q-editor-output", "input", "keyup"].forEach(function (eventName) {
          editor.addEventListener(eventName, function () {
            componentBuilderRememberCursor(editor);
            ComponentBuilder.queueEditorChanged(editor, false);
          });
        });
        ["click", "mouseup", "pointerup"].forEach(function (eventName) {
          editor.addEventListener(eventName, function () {
            setTimeout(function () { componentBuilderRememberCursor(editor); }, 0);
          });
        });
      });
      if (this.previewEditor()) {
        ["q-editor-output", "input", "keyup"].forEach(function (eventName) {
          ComponentBuilder.previewChangedBound = true;
          ComponentBuilder.previewEditor().addEventListener(eventName, function () {
            componentBuilderRememberCursor(ComponentBuilder.previewEditor());
            ComponentBuilder.queueEditorChanged(ComponentBuilder.previewEditor(), true);
          });
        });
        ["click", "mouseup", "pointerup"].forEach(function (eventName) {
          ComponentBuilder.previewEditor().addEventListener(eventName, function () {
            setTimeout(function () { componentBuilderRememberCursor(ComponentBuilder.previewEditor()); }, 0);
          });
        });
      }
      if (modal) {
        modal.addEventListener("click", function (event) {
          if (event.target === modal) {
            ComponentBuilder.close();
          }
        });
      }
    },
    shouldIgnoreEditorEvent: function (editor) {
      return !!(this.syncing || !editor || editor.__pbComponentBuilderSyncing || (editor.__pbComponentBuilderSuppressUntil && Date.now() < editor.__pbComponentBuilderSuppressUntil));
    },
    setSyncedEditorSource: function (editor, source) {
      if (!editor) {
        return;
      }
      if (readQEditorRawSource(editor) === String(source || "")) {
        return;
      }
      editor.__pbComponentBuilderSyncing = true;
      editor.__pbComponentBuilderSuppressUntil = Date.now() + 500;
      setQEditorRawSource(editor, source);
      setTimeout(function () {
        editor.__pbComponentBuilderSyncing = false;
      }, 0);
      setTimeout(function () {
        if (Date.now() >= (editor.__pbComponentBuilderSuppressUntil || 0)) {
          editor.__pbComponentBuilderSuppressUntil = 0;
        }
      }, 520);
    },
    queueEditorChanged: function (editor, isPreview) {
      if (this.shouldIgnoreEditorEvent(editor)) {
        return;
      }
      clearTimeout(this.syncTimer);
      this.syncTimer = setTimeout(function () {
        if (ComponentBuilder.shouldIgnoreEditorEvent(editor)) {
          return;
        }
        if (isPreview) {
          ComponentBuilder.previewChanged();
        } else {
          ComponentBuilder.editorChanged(editor);
        }
      }, this.syncDelay);
    },
    open: function () {
      var modal = this.modal();
      this.bind();
      this.activeTab = "general";
      if (!this.componentSource) {
        this.componentSource = "q-component my-component {\n  text { New component }\n}\n";
        this.instanceSource = "my-component { }\n";
      }
      if (this.nameInput()) {
        this.nameInput().value = (componentBuilderParseHeader(this.componentSource) || {}).name || "my-component";
      }
      if (this.extendsInput()) {
        this.extendsInput().value = (componentBuilderParseHeader(this.componentSource) || {}).extendsText || "";
      }
      this.renderAll();
      this.switchTab("general");
      showDialog(modal);
    },
    close: function () {
      this.commitVisibleEditor();
      closeDialog(this.modal());
    },
    currentEditor: function () {
      if (this.activeTab === "handlers") {
        return this.handlersEditor();
      }
      if (this.activeTab === "preview") {
        return this.previewEditor();
      }
      return this.structureEditor();
    },
    switchTab: function (tab) {
      this.commitVisibleEditor();
      this.activeTab = String(tab || "general");
      arr(document.querySelectorAll("[data-pb-builder-tab]")).forEach(function (button) {
        button.classList.toggle("active", button.getAttribute("data-pb-builder-tab") === ComponentBuilder.activeTab);
      });
      arr(document.querySelectorAll("[data-pb-builder-panel]")).forEach(function (panel) {
        if (panel.getAttribute("data-pb-builder-panel") === ComponentBuilder.activeTab) {
          panel.removeAttribute("hidden");
        } else {
          panel.setAttribute("hidden", "hidden");
        }
      });
      this.renderAll();
    },
    updateGeneral: function () {
      var name = componentBuilderNameInputSafe(this.nameInput() ? this.nameInput().value : "my-component");
      var ext = componentBuilderExtendsInputSafe(this.extendsInput() ? this.extendsInput().value : "");
      if (this.nameInput() && this.nameInput().value !== name) {
        this.nameInput().value = name;
      }
      if (this.extendsInput() && this.extendsInput().value !== ext) {
        this.extendsInput().value = ext;
      }
      this.componentSource = componentBuilderReplaceHeader(this.componentSource, name, ext);
      this.instanceSource = name + " { }\n";
      this.renderAll();
    },
    renderAll: function (skipEditor) {
      var preview = formatQHtmlSource(this.componentSource) + "\n\n" + formatQHtmlSource(this.instanceSource || componentBuilderNameInputSafe(this.nameInput() ? this.nameInput().value : "my-component") + " { }") + "\n";
      this.syncing = true;
      if (this.structureEditor() !== skipEditor) {
        this.setSyncedEditorSource(this.structureEditor(), formatQHtmlSource(this.componentSource) + "\n");
      }
      if (this.handlersEditor() !== skipEditor) {
        this.setSyncedEditorSource(this.handlersEditor(), formatQHtmlSource(this.componentSource) + "\n");
      }
      if (this.previewEditor() !== skipEditor) {
        this.setSyncedEditorSource(this.previewEditor(), preview);
      }
      this.syncing = false;
      this.validate();
    },
    commitVisibleEditor: function (force) {
      if (this.activeTab === "preview") {
        this.previewChanged(force);
      } else if (this.activeTab === "structure") {
        this.editorChanged(this.structureEditor(), force);
      } else if (this.activeTab === "handlers") {
        this.editorChanged(this.handlersEditor(), force);
      }
    },
    editorChanged: function (editor, force) {
      var header;
      if (!force && this.shouldIgnoreEditorEvent(editor)) {
        return;
      }
      this.componentSource = readQEditorRawSource(editor);
      header = componentBuilderParseHeader(this.componentSource);
      if (header) {
        if (this.nameInput()) {
          this.nameInput().value = header.name;
        }
        if (this.extendsInput()) {
          this.extendsInput().value = header.extendsText;
        }
        this.instanceSource = header.name + " { }\n";
      }
      this.renderAll(editor);
    },
    previewChanged: function (force) {
      var extracted;
      var header;
      if (!force && this.shouldIgnoreEditorEvent(this.previewEditor())) {
        return;
      }
      extracted = componentBuilderExtractPreview(readQEditorRawSource(this.previewEditor()));
      if (extracted.componentSource) {
        this.componentSource = extracted.componentSource;
      }
      if (extracted.instanceSource) {
        this.instanceSource = extracted.instanceSource;
      }
      header = componentBuilderParseHeader(this.componentSource);
      if (header) {
        if (this.nameInput()) {
          this.nameInput().value = header.name;
        }
        if (this.extendsInput()) {
          this.extendsInput().value = header.extendsText;
        }
      }
      this.renderAll(this.previewEditor());
    },
    insertSnippet: function (kind) {
      var editor = this.currentEditor();
      var snippet;
      if (kind === "on-signal") {
        this.insertSignalHandler();
        return;
      }
      if (kind === "on-property-changed") {
        this.insertPropertyChangedHandler();
        return;
      }
      if (this.activeTab === "preview") {
        editor = this.structureEditor();
        this.switchTab("structure");
      }
      snippet = componentBuilderSnippet(kind);
      if (!snippet) {
        return;
      }
      this.componentSource = componentBuilderInsertText(editor, snippet);
      this.renderAll(editor);
    },
    insertSignalHandler: function () {
      var signals = componentBuilderSignalList(this.componentSource);
      if (!signals.length) {
        var raw = prompt("Signal name and params", "saved(value)");
        var match;
        if (raw === null) { return; }
        match = String(raw || "saved(value)").match(/^([A-Za-z0-9_-]+)(?:\(([^)]*)\))?/);
        signals = [{ name: match ? match[1] : "saved", params: match && match[2] ? match[2] : "value" }];
      }
      chooseComponentBuilderItem("Choose signal", signals.map(function (sig) {
        return { label: sig.name + (sig.params ? "(" + sig.params + ")" : ""), value: sig };
      }), function (choice) {
        var sig = choice.value;
        var handler = componentBuilderHandlerName(sig.name, "");
        var params = sig.params || "";
        ComponentBuilder.componentSource = componentBuilderInsertText(ComponentBuilder.handlersEditor(), {
          text: handler + "(" + params + ") {\n  \n}\n",
          offset: (handler + "(" + params + ") {\n  ").length
        });
        ComponentBuilder.renderAll(ComponentBuilder.handlersEditor());
      });
    },
    insertPropertyChangedHandler: function () {
      var props = componentBuilderPropertyList(this.componentSource);
      if (!props.length) {
        var raw = prompt("Property name", "value");
        if (raw === null) { return; }
        props = [{ name: String(raw || "value").replace(/[^\w-]+/g, "") || "value" }];
      }
      chooseComponentBuilderItem("Choose property", props.map(function (prop) {
        return { label: prop.name, value: prop };
      }), function (choice) {
        var prop = choice.value;
        var handler = componentBuilderHandlerName(prop.name, "Changed");
        var param = componentBuilderParamName(prop.name);
        ComponentBuilder.componentSource = componentBuilderInsertText(ComponentBuilder.handlersEditor(), {
          text: handler + "(" + param + ") {\n  \n}\n",
          offset: (handler + "(" + param + ") {\n  ").length
        });
        ComponentBuilder.renderAll(ComponentBuilder.handlersEditor());
      });
    },
    indent: function (outdent) {
      var editor = this.currentEditor();
      if (this.activeTab === "preview") {
        return;
      }
      componentBuilderIndentSelection(editor, outdent);
      this.componentSource = readQEditorRawSource(editor);
      this.renderAll(editor);
    },
    validate: function () {
      var source = formatQHtmlSource(this.componentSource) + "\n\n" + formatQHtmlSource(this.instanceSource || "");
      try {
        parseQHtmlSource(source);
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
    create: function () {
      this.commitVisibleEditor(true);
      if (this.activeTab === "general" && this.structureEditor()) {
        this.editorChanged(this.structureEditor(), true);
      }
      var header = componentBuilderParseHeader(this.componentSource);
      var name = header ? componentBuilderNameInputSafe(header.name) : componentBuilderNameInputSafe(this.nameInput() ? this.nameInput().value : "my-component");
      var body = componentBuilderBodySource(this.componentSource);
      var record;
      var button;
      if (!this.validate()) {
        setStatus("Component builder source has a QHTML error");
        return;
      }
      if (!String(body || "").trim()) {
        body = "text { }";
      }
      record = {
        name: name,
        component: name.toLowerCase(),
        qhtml: formatQHtmlSource(body),
        instance: formatQHtmlSource(this.instanceSource || name + " { }")
      };
      button = addPaletteButtonRecord(record);
      if (!button) {
        if (this.error()) {
          this.error().textContent = "Could not add the palette item. Make sure the palette is loaded.";
        }
        setStatus("Could not add palette component " + name);
        return;
      }
      if (FileStore.currentFile()) {
        FileStore.setCurrentPalette(mergePaletteRecords(collectImportedPaletteRecords(), [record]));
        button = revealPaletteComponent(record.component) || button;
      } else {
        BuilderStore.saveSoon();
        revealPaletteComponent(record.component);
      }
      setStatus("Created palette component " + name);
      setTimeout(function () {
        setStatus("Created palette component " + name);
      }, 120);
      this.close();
      this.componentSource = "";
      this.instanceSource = "";
    }
  };

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
    open: function (item, path) {
      var modal = this.modal();
      this.currentItem = item;
      this.currentPath = String(path || "");
      this.currentSlot = "";
      this.drafts = Object.create(null);
      this.draftOrder = [];
      reconcileRenderedSlotsForItem(item);
      this.bind();
      this.populateInstances(this.currentPath);
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
    populateInstances: function (preferredPath) {
      var select = this.instanceSelect();
      var row = this.instanceRow();
      var entries = this.entries();
      var preferred = String(preferredPath || "");
      var selected;
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
      selected = preferred ? entryByPath(entries, preferred) : entries[0] || null;
      this.currentPath = selected ? selected.path : "";
      select.value = this.currentPath;
      this.populateSlots();
    },
    populateSlots: function () {
      var entry = this.selectedEntry();
      var select = this.slotSelect();
      var row = this.slotRow();
      var noneOption;
      if (!select) {
        return;
      }
      select.innerHTML = "";
      noneOption = document.createElement("option");
      noneOption.value = "";
      noneOption.textContent = "none";
      select.appendChild(noneOption);
      if (entry && entry.slots && entry.slots.length) {
        entry.slots.forEach(function (slotName) {
          var option = document.createElement("option");
          option.value = slotName;
          option.textContent = slotName;
          select.appendChild(option);
        });
        this.currentSlot = "";
        select.value = this.currentSlot;
        if (row) {
          row.hidden = false;
        }
      } else {
        this.currentSlot = "";
        select.value = "";
        if (row) {
          row.hidden = false;
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

  function timestampId(prefix) {
    return String(prefix || "node") + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  function normalizeFileName(name, extension) {
    var ext = String(extension || ".qhtml");
    var value = String(name || "").trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ");
    if (!value) {
      value = "untitled" + ext;
    }
    if (ext && value.toLowerCase().slice(-ext.length) !== ext.toLowerCase()) {
      value += ext;
    }
    return value;
  }

  function normalizeFolderName(name) {
    return String(name || "").trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ") || "Folder";
  }

  function htmlFileName(name) {
    var value = String(name || "index.qhtml").trim().replace(/[\\/:*?"<>|]+/g, "-");
    value = value.replace(/\.qhtml$/i, ".html");
    if (!/\.html?$/i.test(value)) {
      value += ".html";
    }
    return value;
  }

  function escapeHtmlAttribute(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function htmlPageForQHtml(source, title) {
    return [
      "<!doctype html>",
      "<html lang=\"en\">",
      "<head>",
      "  <meta charset=\"utf-8\" />",
      "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />",
      "  <title>" + escapeHtmlAttribute(String(title || "QHTML Page").replace(/\.qhtml$/i, "")) + "</title>",
      "  <script src=\"qhtml.js\"></script>",
      "</head>",
      "<body>",
      "  <q-html>",
      String(source || "").replace(/<\/q-html/gi, "<\\/q-html"),
      "  </q-html>",
      "</body>",
      "</html>"
    ].join("\n");
  }

  function showDialog(dialog) {
    if (dialog && typeof dialog.showModal === "function") {
      dialog.showModal();
    } else if (dialog) {
      dialog.setAttribute("open", "open");
    }
  }

  function closeDialog(dialog) {
    if (dialog && typeof dialog.close === "function") {
      dialog.close();
    } else if (dialog) {
      dialog.removeAttribute("open");
    }
  }

  function triggerDownload(name, contents, type) {
    var blob = new Blob([String(contents || "")], { type: type || "text/html;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  var BuilderStore = {
    saveTimer: 0,
    restoring: false,
    dirty: false,
    saveSoon: function () {
      if (this.restoring) { return; }
      this.dirty = true;
      clearTimeout(this.saveTimer);
      updateExportPanel(false);
      this.saveTimer = setTimeout(function () {
        updateExportPanel(false);
        setStatus(FileStore.currentLabel() ? "Unsaved changes in " + FileStore.currentLabel() : "Unsaved changes");
      }, 80);
    },
    save: function () {
      FileStore.saveCurrent();
    },
    load: function () {
      FileStore.openDialog();
    },
    restoreSoon: function () {
      FileStore.restoreCurrentSoon();
    }
  };

  var FileStore = {
    key: "qhtml6.pageBuilder.files.v1",
    legacyKey: "qhtml6.pageBuilder.wysiwyg.dom",
    cache: null,
    selectedId: "root",
    pickerMode: "",
    pickerTargetId: "",
    pickerSelectedFolderId: "root",
    restoreQueued: false,
    defaultState: function () {
      return {
        version: 1,
        currentFileId: "",
        root: {
          id: "root",
          type: "folder",
          name: "/",
          children: []
        }
      };
    },
    read: function () {
      var parsed;
      if (this.cache) {
        return this.cache;
      }
      try {
        parsed = JSON.parse(localStorage.getItem(this.key) || "");
      } catch (error) {
        parsed = null;
      }
      if (!parsed || !parsed.root || parsed.root.type !== "folder") {
        parsed = this.defaultState();
      }
      parsed.root.id = "root";
      parsed.root.type = "folder";
      parsed.root.name = "/";
      if (!Array.isArray(parsed.root.children)) {
        parsed.root.children = [];
      }
      this.cache = parsed;
      this.migrateLegacy();
      return this.cache;
    },
    write: function () {
      try {
        localStorage.setItem(this.key, JSON.stringify(this.read()));
      } catch (error) {
        setStatus("File storage unavailable");
      }
    },
    migrateLegacy: function () {
      var state = this.cache;
      var html = "";
      if (!state || !state.root || state.root.children.length) {
        return;
      }
      try {
        html = localStorage.getItem(this.legacyKey) || "";
      } catch (error) {
        html = "";
      }
      if (!html) {
        return;
      }
      var file = this.makeNode("file", "Recovered layout.qhtml");
      file.html = html;
      file.source = "";
      state.root.children.push(file);
      state.currentFileId = file.id;
      this.write();
    },
    makeNode: function (type, name) {
      var node = {
        id: timestampId(type),
        type: type,
        name: type === "folder" ? normalizeFolderName(name) : normalizeFileName(name),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      if (type === "folder") {
        node.children = [];
      } else {
        node.source = "";
        node.html = "";
        node.palette = [];
      }
      return node;
    },
    walk: function (fn, node, parent) {
      var current = node || this.read().root;
      var result = fn(current, parent || null);
      if (result) {
        return result;
      }
      if (current.type === "folder") {
        for (var i = 0; i < current.children.length; i += 1) {
          result = this.walk(fn, current.children[i], current);
          if (result) {
            return result;
          }
        }
      }
      return null;
    },
    find: function (id) {
      var wanted = String(id || "root");
      return this.walk(function (node, parent) {
        return node.id === wanted ? { node: node, parent: parent } : null;
      });
    },
    folderForCreate: function () {
      var found = this.find(this.selectedId);
      if (found && found.node.type === "folder") {
        return found.node;
      }
      if (found && found.parent) {
        return found.parent;
      }
      return this.read().root;
    },
    pathOf: function (id) {
      var parts = [];
      var target = String(id || "root");
      function visit(node, stack) {
        var next = node.id === "root" ? ["/"] : stack.concat(node.name);
        if (node.id === target) {
          parts = next;
          return true;
        }
        if (node.type === "folder") {
          for (var i = 0; i < node.children.length; i += 1) {
            if (visit(node.children[i], next)) {
              return true;
            }
          }
        }
        return false;
      }
      visit(this.read().root, []);
      return parts.length ? parts.join("/").replace(/^\/\//, "/") : "/";
    },
    currentLabel: function () {
      var id = this.read().currentFileId;
      var found = id ? this.find(id) : null;
      return found && found.node && found.node.type === "file" ? this.pathOf(found.node.id) : "";
    },
    currentFile: function () {
      var id = this.read().currentFileId;
      var found = id ? this.find(id) : null;
      return found && found.node && found.node.type === "file" ? found.node : null;
    },
    ensureCurrentFile: function (defaultName) {
      var state = this.read();
      var file = this.currentFile();
      var name;
      if (file) {
        return file;
      }
      name = prompt("Save file as", normalizeFileName(defaultName || "index.qhtml"));
      if (name === null) {
        return null;
      }
      file = this.createChild("file", name || defaultName || "index.qhtml", state.root);
      file.palette = [];
      state.currentFileId = file.id;
      this.selectedId = file.id;
      this.write();
      return file;
    },
    applyCurrentPalette: function () {
      var file = this.currentFile();
      applyImportedPaletteRecords(file && Array.isArray(file.palette) ? file.palette : []);
    },
    setCurrentPalette: function (records) {
      var file = this.currentFile();
      if (!file) {
        return;
      }
      file.palette = Array.isArray(records) ? records.slice() : [];
      applyImportedPaletteRecords(file.palette);
      file.updatedAt = new Date().toISOString();
      this.write();
    },
    uniqueName: function (folder, name, type, ignoreId) {
      var base = type === "folder" ? normalizeFolderName(name) : normalizeFileName(name);
      var ext = "";
      var stem = base;
      var n = 2;
      var match;
      if (type !== "folder") {
        match = base.match(/^(.*?)(\.[^.]+)$/);
        if (match) {
          stem = match[1];
          ext = match[2];
        }
      }
      function exists(candidate) {
        return (folder.children || []).some(function (child) {
          if (ignoreId && child.id === ignoreId) {
            return false;
          }
          return child.name.toLowerCase() === candidate.toLowerCase();
        });
      }
      while (exists(base)) {
        base = stem + " " + n + ext;
        n += 1;
      }
      return base;
    },
    createChild: function (type, name, folder) {
      var parent = folder && folder.type === "folder" ? folder : this.folderForCreate();
      var node = this.makeNode(type, this.uniqueName(parent, name, type));
      parent.children.push(node);
      this.selectedId = node.id;
      this.write();
      this.renderOpenDialogs();
      return node;
    },
    newFolder: function () {
      var name = prompt("Folder name", "New Folder");
      if (name === null) { return null; }
      return this.createChild("folder", name || "New Folder");
    },
    newFile: function () {
      var name = prompt("File name", "index.qhtml");
      if (name === null) { return null; }
      return this.createChild("file", name || "index.qhtml");
    },
    startNewFile: function () {
      var state = this.read();
      var layout = document.getElementById("pb-builder-layout");
      var name = prompt("File name", "index.qhtml");
      var file;
      if (name === null) {
        setStatus("New file cancelled");
        return null;
      }
      file = this.createChild("file", name || "index.qhtml", state.root);
      file.html = "";
      file.source = "";
      file.palette = [];
      file.updatedAt = new Date().toISOString();
      state.currentFileId = file.id;
      this.selectedId = file.id;
      applyImportedPaletteRecords([]);
      if (layout) {
        BuilderStore.restoring = true;
        layout.innerHTML = "";
        relayout(layout);
        BuilderStore.restoring = false;
      }
      BuilderStore.dirty = false;
      this.write();
      this.renderOpenDialogs();
      updateExportPanel(false);
      setStatus("New file " + this.pathOf(file.id));
      return file;
    },
    saveCurrent: function (options) {
      var opts = options || {};
      var state = this.read();
      var layout = document.getElementById("pb-builder-layout");
      var file = state.currentFileId ? this.find(state.currentFileId) : null;
      if (!layout) { return; }
      if (!file || !file.node || file.node.type !== "file") {
        var name = prompt("Save file as", "index.qhtml");
        if (name === null) {
          setStatus("Save cancelled");
          return;
        }
        file = { node: this.createChild("file", name || "index.qhtml", state.root) };
      }
      file.node.html = layout.innerHTML;
      file.node.source = exportQHtml(layout);
      file.node.palette = collectImportedPaletteRecords();
      file.node.updatedAt = new Date().toISOString();
      state.currentFileId = file.node.id;
      this.selectedId = file.node.id;
      BuilderStore.dirty = false;
      this.write();
      this.renderOpenDialogs();
      updateExportPanel(false);
      if (!opts.silent) {
        setStatus("Saved " + this.pathOf(file.node.id));
      }
    },
    loadFile: function (id) {
      var found = this.find(id);
      var layout = document.getElementById("pb-builder-layout");
      if (!found || found.node.type !== "file" || !layout) {
        return;
      }
      BuilderStore.restoring = true;
      applyImportedPaletteRecords(Array.isArray(found.node.palette) ? found.node.palette : []);
      layout.innerHTML = found.node.html || "";
      arr(layout.querySelectorAll(".pb-empty-drop")).forEach(function (node) { node.remove(); });
      arr(layout.querySelectorAll(Q.row + "," + Q.col)).forEach(installApi);
      relayout(layout);
      this.read().currentFileId = found.node.id;
      this.selectedId = found.node.id;
      BuilderStore.dirty = false;
      this.write();
      updateExportPanel(false);
      BuilderStore.restoring = false;
      this.closeDialog();
      setStatus("Loaded " + this.pathOf(found.node.id));
    },
    restoreCurrentSoon: function () {
      var self = this;
      if (this.restoreQueued) { return; }
      this.restoreQueued = true;
      setTimeout(function () {
        var currentId = self.read().currentFileId;
        if (currentId && self.find(currentId)) {
          self.loadFile(currentId);
        }
      }, 40);
    },
    removeNode: function (id) {
      var found = this.find(id);
      var siblings;
      var index;
      if (!found || !found.parent || found.node.id === "root") {
        return;
      }
      if (!confirm("Delete " + found.node.name + "?")) {
        return;
      }
      siblings = found.parent.children || [];
      index = siblings.indexOf(found.node);
      if (index >= 0) {
        siblings.splice(index, 1);
      }
      if (this.read().currentFileId === found.node.id) {
        this.read().currentFileId = "";
      }
      this.selectedId = found.parent.id || "root";
      this.write();
      this.renderOpenDialogs();
    },
    renameNode: function (id) {
      var found = this.find(id);
      var name;
      if (!found || found.node.id === "root") {
        return;
      }
      name = prompt("Rename", found.node.name);
      if (name === null) { return; }
      found.node.name = this.uniqueName(found.parent || this.read().root, found.node.type === "folder" ? normalizeFolderName(name) : normalizeFileName(name), found.node.type, found.node.id);
      found.node.updatedAt = new Date().toISOString();
      this.write();
      this.renderOpenDialogs();
    },
    isDescendant: function (node, folderId) {
      var found = false;
      if (!node || node.type !== "folder") { return false; }
      function visit(item) {
        if (item.id === folderId) {
          found = true;
          return;
        }
        if (item.type === "folder") {
          (item.children || []).forEach(visit);
        }
      }
      visit(node);
      return found;
    },
    moveNode: function (id, folderId) {
      var found = this.find(id);
      var dest = this.find(folderId);
      var index;
      if (!found || !found.parent || !dest || dest.node.type !== "folder" || found.node.id === "root") {
        return false;
      }
      if (found.node.id === dest.node.id || this.isDescendant(found.node, dest.node.id)) {
        setStatus("Cannot move a folder into itself");
        return false;
      }
      index = found.parent.children.indexOf(found.node);
      if (index >= 0) {
        found.parent.children.splice(index, 1);
      }
      found.node.name = this.uniqueName(dest.node, found.node.name, found.node.type);
      dest.node.children.push(found.node);
      this.selectedId = found.node.id;
      this.write();
      this.renderOpenDialogs();
      return true;
    },
    toTreeModel: function (foldersOnly) {
      function convert(node) {
        var label = node.id === "root" ? "/" : node.name;
        var out = {};
        if (node.type === "folder") {
          out[label] = {};
          (node.children || []).forEach(function (child) {
            if (foldersOnly && child.type !== "folder") { return; }
            Object.assign(out[label], convert(child));
          });
          return out;
        }
        out[label] = "file";
        return out;
      }
      return convert(this.read().root);
    },
    renderTree: function (containerId, foldersOnly, selectedId) {
      var container = document.getElementById(containerId);
      var probe = document.getElementById(containerId + "-probe");
      var self = this;
      if (!container) { return; }
      if (probe && typeof probe.setModel === "function") {
        probe.setModel(this.toTreeModel(foldersOnly));
      }
      container.innerHTML = "";
      function renderNode(node, parentEl, depth) {
        var item = document.createElement("li");
        var button = document.createElement("button");
        var list;
        item.className = "pb-file-item";
        button.type = "button";
        button.className = "pb-file-node " + (node.type === "folder" ? "folder" : "file");
        if (node.id === (selectedId || self.selectedId)) {
          button.className += " selected";
        }
        button.style.paddingLeft = String(12 + depth * 18) + "px";
        button.dataset.nodeId = node.id;
        button.innerHTML = "<span class=\"pb-file-glyph\">" + (node.type === "folder" ? "▸" : "•") + "</span><span>" + escapeHtmlText(node.name) + "</span>";
        button.addEventListener("click", function () {
          if (foldersOnly && node.type !== "folder") { return; }
          if (containerId === "pb-folder-tree") {
            self.pickerSelectedFolderId = node.id;
          } else {
            self.selectedId = node.id;
          }
          self.renderOpenDialogs();
        });
        button.addEventListener("dblclick", function () {
          if (containerId === "pb-file-tree" && !foldersOnly && node.type === "file") {
            self.loadFile(node.id);
          }
        });
        button.addEventListener("contextmenu", function (event) {
          if (foldersOnly) { return; }
          event.preventDefault();
          self.selectedId = node.id;
          self.renderOpenDialogs();
          self.showContextMenu(node.id, event.clientX, event.clientY);
        });
        item.appendChild(button);
        if (node.type === "folder") {
          list = document.createElement("ul");
          list.className = "pb-file-list";
          (node.children || []).forEach(function (child) {
            if (!foldersOnly || child.type === "folder") {
              renderNode(child, list, depth + 1);
            }
          });
          item.appendChild(list);
        }
        parentEl.appendChild(item);
      }
      var rootList = document.createElement("ul");
      rootList.className = "pb-file-list q-tree q-tree-list";
      renderNode(this.read().root, rootList, 0);
      container.appendChild(rootList);
      this.updateSelectedLabels();
    },
    renderOpenDialogs: function () {
      if (document.getElementById("pb-file-dialog") && document.getElementById("pb-file-dialog").open) {
        this.renderTree("pb-file-tree", false, this.selectedId);
      }
      if (document.getElementById("pb-file-manager") && document.getElementById("pb-file-manager").open) {
        this.renderTree("pb-file-manager-tree", false, this.selectedId);
      }
      if (document.getElementById("pb-folder-picker") && document.getElementById("pb-folder-picker").open) {
        this.renderTree("pb-folder-tree", true, this.pickerSelectedFolderId);
      }
    },
    updateSelectedLabels: function () {
      var fileLabel = document.getElementById("pb-file-selected");
      var managerLabel = document.getElementById("pb-file-manager-selected");
      var folderLabel = document.getElementById("pb-folder-selected");
      if (fileLabel) { fileLabel.textContent = this.pathOf(this.selectedId); }
      if (managerLabel) { managerLabel.textContent = this.pathOf(this.selectedId); }
      if (folderLabel) { folderLabel.textContent = this.pathOf(this.pickerSelectedFolderId); }
    },
    openDialog: function () {
      this.read();
      this.selectedId = this.selectedId || "root";
      this.renderTree("pb-file-tree", false, this.selectedId);
      showDialog(document.getElementById("pb-file-dialog"));
    },
    closeDialog: function () {
      this.hideContextMenu();
      closeDialog(document.getElementById("pb-file-dialog"));
    },
    openManager: function () {
      this.read();
      this.selectedId = this.selectedId || "root";
      this.renderTree("pb-file-manager-tree", false, this.selectedId);
      showDialog(document.getElementById("pb-file-manager"));
    },
    closeManager: function () {
      this.hideContextMenu();
      closeDialog(document.getElementById("pb-file-manager"));
    },
    selectedManagedFile: function () {
      var found = this.find(this.selectedId);
      if (!found || !found.node || found.node.type !== "file") {
        setStatus("Select a file first");
        return null;
      }
      return found.node;
    },
    renameManagedFile: function () {
      var file = this.selectedManagedFile();
      if (file) {
        this.renameNode(file.id);
      }
    },
    deleteManagedFile: function () {
      var file = this.selectedManagedFile();
      if (file) {
        this.removeNode(file.id);
      }
    },
    moveManagedFile: function () {
      var file = this.selectedManagedFile();
      if (file) {
        this.openFolderPicker("move", file.id);
      }
    },
    showContextMenu: function (id, x, y) {
      var found = this.find(id);
      var menu = document.getElementById("pb-file-context-menu");
      var contents = document.getElementById("pb-file-context-menu-contents");
      var self = this;
      var actions = [];
      if (!found || !contents) { return; }
      if (found.node.type === "file") {
        actions.push(["load", "Load"]);
      }
      actions.push(["new-file", "New file"]);
      if (found.node.type === "folder") {
        actions.push(["new-folder", "New folder"]);
      }
      if (found.node.id !== "root") {
        actions.push(["rename", "Rename"], ["move", "Move"], ["delete", "Delete"]);
      }
      contents.innerHTML = actions.map(function (action) {
        return "<button type=\"button\" data-action=\"" + action[0] + "\">" + escapeHtmlText(action[1]) + "</button>";
      }).join("");
      contents.onclick = function (event) {
        var button = event.target && event.target.closest ? event.target.closest("button[data-action]") : null;
        var action = button ? button.getAttribute("data-action") : "";
        if (!action) { return; }
        self.hideContextMenu();
        if (action === "load") { self.loadFile(id); }
        if (action === "new-file") { self.newFile(); }
        if (action === "new-folder") { self.newFolder(); }
        if (action === "rename") { self.renameNode(id); }
        if (action === "move") { self.openFolderPicker("move", id); }
        if (action === "delete") { self.removeNode(id); }
      };
      if (menu && typeof menu.show === "function") {
        menu.show(String(x) + "px", String(y) + "px");
      } else if (menu) {
        menu.style.display = "block";
        menu.style.left = String(x) + "px";
        menu.style.top = String(y) + "px";
      }
    },
    hideContextMenu: function () {
      var menu = document.getElementById("pb-file-context-menu");
      if (menu && typeof menu.hide === "function") {
        menu.hide();
      } else if (menu) {
        menu.style.display = "none";
      }
    },
    openFolderPicker: function (mode, targetId) {
      var title = document.getElementById("pb-folder-picker-title");
      var subtitle = document.getElementById("pb-folder-picker-subtitle");
      this.pickerMode = mode || "move";
      this.pickerTargetId = targetId || "";
      this.pickerSelectedFolderId = "root";
      if (title) { title.textContent = this.pickerMode === "export" ? "Export Folder" : "Move To Folder"; }
      if (subtitle) { subtitle.textContent = this.pickerMode === "export" ? "Choose a folder to export as HTML pages." : "Choose the destination folder."; }
      this.renderTree("pb-folder-tree", true, this.pickerSelectedFolderId);
      showDialog(document.getElementById("pb-folder-picker"));
    },
    closeFolderPicker: function () {
      closeDialog(document.getElementById("pb-folder-picker"));
    },
    confirmFolderPicker: function () {
      if (this.pickerMode === "export") {
        this.exportFolderById(this.pickerSelectedFolderId);
      } else if (this.pickerMode === "move") {
        this.moveNode(this.pickerTargetId, this.pickerSelectedFolderId);
      }
      this.closeFolderPicker();
    },
    collectExportFiles: function (folder, prefix, out) {
      var path = prefix || "";
      var list = out || [];
      (folder.children || []).forEach(function (child) {
        if (child.type === "folder") {
          FileStore.collectExportFiles(child, path + child.name + "/", list);
        } else {
          list.push({
            path: path + htmlFileName(child.name),
            name: child.name,
            contents: htmlPageForQHtml(child.source || "", child.name)
          });
        }
      });
      return list;
    },
    exportFolderById: function (folderId) {
      var found = this.find(folderId || "root");
      var files;
      if (!found || found.node.type !== "folder") { return; }
      files = this.collectExportFiles(found.node, "", []);
      if (!files.length) {
        setStatus("Folder has no files to export");
        return;
      }
      if (window.showDirectoryPicker) {
        this.exportToDirectory(found.node, files);
        return;
      }
      files.forEach(function (file) {
        triggerDownload(file.path.replace(/[\\/]+/g, "__"), file.contents, "text/html;charset=utf-8");
      });
      setStatus("Exported " + files.length + " HTML file download" + (files.length === 1 ? "" : "s"));
    },
    exportToDirectory: function (folder, files) {
      window.showDirectoryPicker().then(function (dirHandle) {
        function writeFile(parts, contents, handle) {
          var name = parts.shift();
          if (!parts.length) {
            return handle.getFileHandle(name, { create: true }).then(function (fileHandle) {
              return fileHandle.createWritable();
            }).then(function (writable) {
              return writable.write(contents).then(function () { return writable.close(); });
            });
          }
          return handle.getDirectoryHandle(name, { create: true }).then(function (nextHandle) {
            return writeFile(parts, contents, nextHandle);
          });
        }
        return Promise.all(files.map(function (file) {
          return writeFile(file.path.split("/").filter(Boolean), file.contents, dirHandle);
        }));
      }).then(function () {
        setStatus("Exported folder " + (folder && folder.name || "/"));
      }).catch(function (error) {
        if (error && error.name !== "AbortError") {
          setStatus("Export folder failed");
        }
      });
    }
  };

  function clearCanvas() {
    var layout = document.getElementById("pb-builder-layout");
    if (!layout) { return; }
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

  function newLayoutFile() {
    FileStore.startNewFile();
  }

  function exportFolder() {
    FileStore.openFolderPicker("export", "");
  }

  function updateExportPanel(focusOutput) {
    var output = document.getElementById("pb-export-output");
    var source = exportQHtml();
    if (output) {
      setQEditorRawSource(output, source);
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
    exportFolder: exportFolder,
    newLayoutFile: newLayoutFile,
    clearCanvas: clearCanvas,
    saveLayout: saveLayout,
    loadLayout: loadLayout,
    importQHtmlFile: importQHtmlFile,
    importQHtmlSource: importQHtmlSource,
    closeFileDialog: function () { FileStore.closeDialog(); },
    openFileManager: function () { FileStore.openManager(); },
    closeFileManager: function () { FileStore.closeManager(); },
    renameManagedFile: function () { FileStore.renameManagedFile(); },
    deleteManagedFile: function () { FileStore.deleteManagedFile(); },
    moveManagedFile: function () { FileStore.moveManagedFile(); },
    newFileFolder: function () { FileStore.newFolder(); },
    newFile: function () { FileStore.newFile(); },
    closeFolderPicker: function () { FileStore.closeFolderPicker(); },
    confirmFolderPicker: function () { FileStore.confirmFolderPicker(); },
    addRow: addRow,
    addColumn: addColumn,
    openComponentBuilder: function () { ComponentBuilder.open(); },
    closeComponentBuilder: function () { ComponentBuilder.close(); },
    switchComponentBuilderTab: function (tab) { ComponentBuilder.switchTab(tab); },
    updateComponentBuilderGeneral: function () { ComponentBuilder.updateGeneral(); },
    insertComponentBuilderSnippet: function (kind) { ComponentBuilder.insertSnippet(kind); },
    indentComponentBuilderEditor: function () { ComponentBuilder.indent(false); },
    outdentComponentBuilderEditor: function () { ComponentBuilder.indent(true); },
    createComponentBuilderItem: function () { ComponentBuilder.create(); },
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
