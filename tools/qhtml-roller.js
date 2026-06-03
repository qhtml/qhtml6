#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

function usage() {
  console.error("Usage: node qhtml-roller.js somefile.html > rolled.html");
}

function main(argv) {
  const inputPath = argv[2];

  if (!inputPath || inputPath === "-h" || inputPath === "--help") {
    usage();
    process.exit(inputPath ? 0 : 1);
  }

  const absoluteInputPath = path.resolve(process.cwd(), inputPath);
  const html = fs.readFileSync(absoluteInputPath, "utf8");
  const compiler = new QHtmlRoller({
    inputPath: absoluteInputPath,
    projectRoot: __dirname,
  });

  process.stdout.write(compiler.rollHtml(html));
}

class QHtmlRoller {
  constructor(options) {
    const opts = options || {};

    this.inputPath = opts.inputPath ? path.resolve(opts.inputPath) : process.cwd();
    this.inputDir = path.dirname(this.inputPath);
    this.projectRoot = opts.projectRoot ? path.resolve(opts.projectRoot) : __dirname;
    this.modules = loadQHtmlModules(this.projectRoot);
    this.nextRootId = 1;
    this.warnings = [];
    this.importCache = new Map();
  }

  rollHtml(html) {
    const sourceHtml = removeExistingRenderedQHtml(String(html || ""));
    const blocks = this.collectQHtmlBlocks(sourceHtml);
    const preparedBlocks = blocks.map((block) => this.prepareQHtmlBlock(block));
    const globalRegistry = collectPreparedDefinitions(preparedBlocks);

    if (preparedBlocks.length === 0) {
      this.flushWarnings();
      return sourceHtml;
    }

    const rendered = this.createHiddenRenderedQHtml(preparedBlocks, globalRegistry);
    const rolled = injectBeforeBodyEnd(sourceHtml, rendered);

    this.flushWarnings();
    return rolled;
  }

  collectQHtmlBlocks(html) {
    const blocks = [];
    const pattern = /<q-html\b([^>]*)>([\s\S]*?)<\/q-html>/gi;
    let match;

    while ((match = pattern.exec(html))) {
      blocks.push({
        attrsSource: match[1] || "",
        source: match[2] || "",
      });
    }

    return blocks;
  }

  prepareQHtmlBlock(block) {
    const parser = this.modules.qhtmlParser;
    const doc = parser.parseQHtmlToQDom(block.source || "", {
      importBaseUrl: this.inputPath,
      loadImportSync: (importPath, baseUrl) => this.loadImportSync(importPath, baseUrl),
      importCache: this.importCache,
    });

    return {
      attrsSource: block.attrsSource || "",
      doc,
    };
  }

  compilePreparedQHtmlBlock(prepared, globalRegistry) {
    const doc = prepared.doc;
    const registry = new Map(globalRegistry || []);
    collectDefinitions(doc).forEach((definition, key) => registry.set(key, definition));
    const rootId = "rendered-qhtml-block-" + this.nextRootId++;
    const rootAttrs = {
      "data-rendered-qhtml-block": rootId,
    };

    const context = {
      registry,
      componentStack: [],
      componentProps: null,
      slots: Object.create(null),
      scope: Object.create(null),
      rootId,
    };
    const body = renderNodes(doc.nodes || [], context, this);

    return "<div" + renderAttributes(rootAttrs) + ">" + body + "</div>";
  }

  createHiddenRenderedQHtml(preparedBlocks, globalRegistry) {
    const renderedBlocks = (preparedBlocks || [])
      .map((prepared) => this.compilePreparedQHtmlBlock(prepared, globalRegistry))
      .join("");

    return [
      "<style>rendered-qhtml{display:none}</style>",
      "<rendered-qhtml aria-hidden=\"true\">",
      renderedBlocks,
      "</rendered-qhtml>",
    ].join("");
  }

  loadImportSync(importPath, baseUrl) {
    const raw = String(importPath || "").trim();

    if (!raw) {
      return "";
    }

    if (/^(?:https?:)?\/\//i.test(raw)) {
      throw new Error("qhtml-roller cannot resolve network q-import: " + raw);
    }

    const candidates = [];
    if (path.isAbsolute(raw)) {
      candidates.push(raw);
    } else {
      candidates.push(path.resolve(resolveImportBaseDirectory(baseUrl || this.inputPath), raw));
      candidates.push(path.resolve(this.inputDir, raw));
      candidates.push(path.resolve(this.projectRoot, raw));
      candidates.push(path.resolve(this.projectRoot, "dist", raw));
    }

    for (const candidate of candidates) {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return fs.readFileSync(candidate, "utf8");
      }
    }

    throw new Error("Unable to resolve q-import '" + raw + "' from " + (baseUrl || this.inputDir));
  }

  warn(message) {
    this.warnings.push(String(message || ""));
  }

  flushWarnings() {
    for (const warning of this.warnings) {
      console.error("qhtml-roller warning: " + warning);
    }
  }
}

function loadQHtmlModules(projectRoot) {
  const context = {
    globalThis: null,
    window: null,
    console,
    TextEncoder,
    TextDecoder,
    Buffer,
    crypto: {
      randomUUID:
        typeof crypto !== "undefined" && crypto.randomUUID
          ? () => crypto.randomUUID()
          : undefined,
    },
  };

  context.globalThis = context;
  context.window = context;

  for (const relpath of [
    "src/modules/qdom-core/src/qdom-core.js",
    "src/modules/qhtml-parser/src/qhtml-parser.js",
  ]) {
    const fullpath = path.join(projectRoot, relpath);
    vm.runInNewContext(fs.readFileSync(fullpath, "utf8"), context, { filename: relpath });
  }

  return context.QHtmlModules;
}

function collectDefinitions(doc) {
  const registry = new Map();
  const nodes = Array.isArray(doc && doc.nodes) ? doc.nodes : [];

  for (const node of nodes) {
    if (!node || typeof node !== "object") {
      continue;
    }
    if (node.kind === "component" && node.componentId) {
      registry.set(String(node.componentId).toLowerCase(), node);
    }
    if (node.kind === "struct" && node.structId) {
      registry.set(String(node.structId).toLowerCase(), node);
    }
  }

  return registry;
}

function collectPreparedDefinitions(preparedBlocks) {
  const registry = new Map();

  for (const block of preparedBlocks || []) {
    collectDefinitions(block && block.doc).forEach((definition, key) => {
      registry.set(key, definition);
    });
  }

  return registry;
}

function renderNodes(nodes, context, roller) {
  if (!Array.isArray(nodes)) {
    return "";
  }

  return nodes.map((node) => renderNode(node, context, roller)).join("");
}

function renderNode(node, context, roller) {
  if (!node || typeof node !== "object") {
    return "";
  }

  if (node.kind === "component" || node.kind === "struct" || node.kind === "struct-instance" || node.kind === "model") {
    return "";
  }

  if (node.kind === "text") {
    return escapeHtml(interpolate(node.value || "", context));
  }

  if (node.kind === "raw-html") {
    return String(node.html || "");
  }

  if (node.kind === "slot") {
    const slotName = normalizeName(node.name || "default");
    const projected = context.slots && context.slots[slotName];
    return projected ? renderNodes(projected, context, roller) : renderNodes(node.children || [], context, roller);
  }

  if (node.kind === "repeater") {
    return renderRepeater(node, context, roller);
  }

  if (node.kind === "component-instance" || node.kind === "template-instance") {
    return renderComponentInstance(node, context, roller);
  }

  if (node.kind === "element") {
    const component = context.registry.get(String(node.tagName || "").toLowerCase());
    if (component && component.kind === "component") {
      return renderComponentInstance(elementToComponentInstance(node), context, roller);
    }
    if (component && component.kind === "struct") {
      return "";
    }
    return renderElement(node, context, roller);
  }

  return "";
}

function renderElement(node, context, roller) {
  if (String(node.tagName || "").toLowerCase() === "slot") {
    const slotName = normalizeName((node.attributes && node.attributes.name) || "default");
    const projected = context.slots && context.slots[slotName];
    return projected ? renderNodes(projected, context, roller) : renderNodes(node.children || [], context, roller);
  }

  const tag = normalizeOutputTag(node.tagName || "div");
  const attrs = interpolateAttributes(Object.assign({}, node.attributes || {}), context);

  extractEventAttributes(attrs);

  const text = typeof node.textContent === "string" ? escapeHtml(interpolate(node.textContent, context)) : "";
  const children = renderNodes(node.children || [], context, roller);

  return "<" + tag + renderAttributes(attrs) + ">" + text + children + "</" + tag + ">";
}

function renderComponentInstance(instanceNode, context, roller) {
  const componentId = String(instanceNode.componentId || instanceNode.tagName || "").toLowerCase();
  const component = context.registry.get(componentId);

  if (!component || component.kind !== "component") {
    roller.warn("Unknown component/template instance '" + componentId + "' rendered as literal element.");
    return renderElement(componentInstanceToElement(instanceNode), context, roller);
  }

  if (context.componentStack.indexOf(componentId) !== -1) {
    throw new Error("Recursive q-component usage detected for '" + componentId + "'.");
  }

  const effectiveComponent = resolveComponent(component, context.registry);
  const props = Object.assign({}, effectiveComponent.attributes || {}, instanceNode.attributes || {}, instanceNode.props || {});
  const attrs = interpolateAttributes(Object.assign({}, instanceNode.attributes || {}), Object.assign({}, context, { componentProps: props }));

  extractEventAttributes(attrs);

  const slots = collectSlots(instanceNode);
  const childContext = Object.assign({}, context, {
    componentStack: context.componentStack.concat(componentId),
    componentProps: props,
    slots,
    scope: Object.assign(Object.create(null), context.scope || {}),
  });

  const tag = normalizeOutputTag(componentId || "div");
  const content = renderNodes(effectiveComponent.templateNodes || [], childContext, roller);

  return "<" + tag + renderAttributes(attrs) + ">" + content + "</" + tag + ">";
}

function renderRepeater(node, context, roller) {
  const entries =
    node.model && Array.isArray(node.model.entries)
      ? node.model.entries
      : Array.isArray(node.modelEntries)
        ? node.modelEntries
        : [];
  const alias = String(node.slotName || "item").trim() || "item";
  let html = "";

  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    const value = entry && Object.prototype.hasOwnProperty.call(entry, "value") ? entry.value : entry && entry.text;
    const scope = Object.assign(Object.create(null), context.scope || {});

    scope[alias] = value;
    scope.index = i;
    html += renderNodes(node.templateNodes || [], Object.assign({}, context, { scope }), roller);
  }

  return html;
}

function resolveComponent(component, registry, seen) {
  const visited = seen || new Set();
  const id = String(component.componentId || "").toLowerCase();

  if (!id || visited.has(id)) {
    return component;
  }

  visited.add(id);

  const merged = Object.assign({}, component, {
    attributes: Object.assign({}, component.attributes || {}),
    templateNodes: [],
    lifecycleScripts: [],
    methods: [],
  });
  const bases = Array.isArray(component.extendsComponentIds) ? component.extendsComponentIds : [];

  for (const baseId of bases) {
    const base = registry.get(String(baseId || "").toLowerCase());
    if (!base || base.kind !== "component") {
      continue;
    }
    const resolvedBase = resolveComponent(base, registry, visited);
    Object.assign(merged.attributes, resolvedBase.attributes || {});
    merged.templateNodes = merged.templateNodes.concat(resolvedBase.templateNodes || []);
    merged.lifecycleScripts = merged.lifecycleScripts.concat(resolvedBase.lifecycleScripts || []);
    merged.methods = merged.methods.concat(resolvedBase.methods || []);
  }

  Object.assign(merged.attributes, component.attributes || {});
  merged.templateNodes = merged.templateNodes.concat(component.templateNodes || []);
  merged.lifecycleScripts = merged.lifecycleScripts.concat(component.lifecycleScripts || []);
  merged.methods = merged.methods.concat(component.methods || []);
  return merged;
}

function resolveImportBaseDirectory(baseUrl) {
  const raw = String(baseUrl || "").trim();

  if (!raw) {
    return process.cwd();
  }

  if (/^file:\/\//i.test(raw)) {
    try {
      return resolveImportBaseDirectory(new URL(raw).pathname);
    } catch (error) {
      return process.cwd();
    }
  }

  if (fs.existsSync(raw)) {
    const stat = fs.statSync(raw);
    return stat.isDirectory() ? raw : path.dirname(raw);
  }

  if (path.extname(raw)) {
    return path.dirname(raw);
  }

  return raw;
}

function collectSlots(instanceNode) {
  const slots = Object.create(null);

  for (const slot of instanceNode.slots || []) {
    slots[normalizeName(slot.name || "default")] = slot.children || [];
  }

  for (const child of instanceNode.children || []) {
    if (child && child.kind === "element" && child.tagName) {
      const name = normalizeName(child.tagName);
      if (!slots[name]) {
        slots[name] = child.children || [];
      }
    }
  }

  return slots;
}

function extractEventAttributes(attrs) {
  for (const key of Object.keys(attrs)) {
    if (!/^on[a-z]/i.test(key)) {
      continue;
    }
    delete attrs[key];
  }
}

function interpolateAttributes(attrs, context) {
  const out = Object.create(null);

  for (const key of Object.keys(attrs || {})) {
    const value = attrs[key];
    out[key] = typeof value === "string" ? interpolate(value, context) : value;
  }

  return out;
}

function interpolate(value, context) {
  return String(value == null ? "" : value).replace(/\$\{([^}]+)\}/g, (match, expression) => {
    const result = evaluateExpression(expression, context);
    return result == null ? "" : String(result);
  });
}

function evaluateExpression(expression, context) {
  const src = String(expression || "").trim();

  if (!src) {
    return "";
  }

  if (src.indexOf("this.component.") === 0) {
    return getPath(context.componentProps || {}, src.slice("this.component.".length));
  }

  if (src.indexOf("component.") === 0) {
    return getPath(context.componentProps || {}, src.slice("component.".length));
  }

  const scope = context.scope || {};
  const first = src.split(/[.[\s(]/)[0];

  if (Object.prototype.hasOwnProperty.call(scope, first)) {
    return getPath(scope, src);
  }

  if (Object.prototype.hasOwnProperty.call(context.componentProps || {}, src)) {
    return context.componentProps[src];
  }

  try {
    const names = Object.keys(scope);
    const values = names.map((name) => scope[name]);
    return Function.apply(null, names.concat("component", "return (" + src + ");")).apply(null, values.concat(context.componentProps || {}));
  } catch (error) {
    return "";
  }
}

function getPath(source, pathSource) {
  const parts = String(pathSource || "").split(".").filter(Boolean);
  let current = source;

  for (const part of parts) {
    if (current == null) {
      return "";
    }
    current = current[part];
  }

  return current;
}

function elementToComponentInstance(node) {
  return {
    kind: "component-instance",
    componentId: node.tagName,
    tagName: node.tagName,
    attributes: node.attributes || {},
    props: node.attributes || {},
    slots: [],
    children: node.children || [],
  };
}

function componentInstanceToElement(node) {
  return {
    kind: "element",
    tagName: node.tagName || node.componentId || "div",
    attributes: node.attributes || {},
    children: node.children || [],
    textContent: node.textContent || null,
  };
}

function renderAttributes(attrs) {
  const parts = [];

  for (const key of Object.keys(attrs || {})) {
    const value = attrs[key];

    if (value == null || value === false) {
      continue;
    }
    if (value === true) {
      parts.push(escapeAttributeName(key));
    } else {
      parts.push(escapeAttributeName(key) + "=\"" + escapeHtmlAttribute(value) + "\"");
    }
  }

  return parts.length ? " " + parts.join(" ") : "";
}

function injectBeforeBodyEnd(html, script) {
  if (/<\/body\s*>/i.test(html)) {
    return html.replace(/<\/body\s*>/i, (match, offset, source) => {
      const prefix = source.slice(0, offset).endsWith("\n") ? "" : "\n";
      return prefix + script + "\n" + match;
    });
  }
  return html + (String(html || "").endsWith("\n") ? "" : "\n") + script;
}

function removeExistingRenderedQHtml(html) {
  return String(html || "")
    .replace(/\s*<style>\s*rendered-qhtml\s*\{\s*display\s*:\s*none\s*\}\s*<\/style>\s*<rendered-qhtml\b[^>]*>[\s\S]*?<\/rendered-qhtml>\s*/gi, "")
    .replace(/\s*<rendered-qhtml\b[^>]*>[\s\S]*?<\/rendered-qhtml>\s*/gi, "")
    .replace(/\s*<style>\s*rendered-qhtml\s*\{\s*display\s*:\s*none\s*\}\s*<\/style>\s*/gi, "");
}

function normalizeOutputTag(tagName) {
  const tag = String(tagName || "div").trim().toLowerCase();

  if (tag === "q-layout" || tag === "q-row" || tag === "q-col") {
    return "div";
  }

  return /^[a-z][a-z0-9:-]*$/.test(tag) ? tag : "div";
}

function normalizeName(name) {
  return String(name || "").trim().toLowerCase();
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtmlAttribute(value) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

function escapeAttributeName(name) {
  return String(name || "").replace(/[^A-Za-z0-9_:.:-]/g, "");
}

if (require.main === module) {
  try {
    main(process.argv);
  } catch (error) {
    console.error("qhtml-roller failed: " + (error && error.message ? error.message : error));
    process.exit(1);
  }
}

module.exports = {
  QHtmlRoller,
};
