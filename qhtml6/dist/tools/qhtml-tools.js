(function (globalScope) {
  'use strict';

  var INDENT = '  ';

  function repeatIndent(level) {
    if (level <= 0) return '';
    return INDENT.repeat(level);
  }

  function ensureDomAvailable(fnName) {
    if (typeof document === 'undefined' || typeof Node === 'undefined') {
      throw new Error('qhtml-tools.' + fnName + ' requires a browser DOM environment.');
    }
  }

  function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  function isEmptyObject(obj) {
    for (var k in obj) {
      if (hasOwn(obj, k)) return false;
    }
    return true;
  }

  function cloneAttrMap(attrs) {
    var out = {};
    var keys = Object.keys(attrs || {});
    for (var i = 0; i < keys.length; i++) out[keys[i]] = attrs[keys[i]];
    return out;
  }

  function cloneStyleDecls(decls) {
    var out = [];
    var list = decls || [];
    for (var i = 0; i < list.length; i++) {
      out.push({ name: list[i].name, value: list[i].value });
    }
    return out;
  }

  function normalizeTextContent(raw) {
    return String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim();
  }

  function splitClasses(classValue) {
    if (!classValue) return [];
    return String(classValue)
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  }

  function parseStyleDeclarations(styleText) {
    var source = String(styleText == null ? '' : styleText);
    var parts = source.split(';');
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i].trim();
      if (!part) continue;
      var idx = part.indexOf(':');
      if (idx < 1) continue;
      var name = part.slice(0, idx).trim();
      var value = part.slice(idx + 1).trim();
      if (!name || !value) continue;
      out.push({ name: name, value: value });
    }
    return out;
  }

  function escapePropertyValue(value) {
    return String(value == null ? '' : value)
      .replace(/"/g, '&quot;')
      .replace(/\r?\n/g, ' ');
  }

  function escapeTextBlockValue(value) {
    return String(value == null ? '' : value)
      .replace(/{/g, '(')
      .replace(/}/g, ')');
  }

  function escapeHtmlInlineValue(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/{/g, '&#123;')
      .replace(/}/g, '&#125;');
  }

  function sanitizeToken(value) {
    return String(value == null ? '' : value)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function normalizeComponentName(value, ctx) {
    var name = sanitizeToken(value);
    if (name) return name;
    ctx.componentCounter += 1;
    return 'component-' + ctx.componentCounter;
  }

  function nodeListToAst(nodeList, visit) {
    var out = [];
    var list = nodeList || [];
    for (var i = 0; i < list.length; i++) {
      var parts = visit(list[i]);
      for (var j = 0; j < parts.length; j++) out.push(parts[j]);
    }
    return out;
  }

  function domToAst(source) {
    ensureDomAvailable('fromDOM');

    function visit(node) {
      if (!node) return [];

      if (node.nodeType === Node.DOCUMENT_NODE) {
        if (node.body) return nodeListToAst(node.body.childNodes, visit);
        return nodeListToAst(node.childNodes, visit);
      }

      if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
        return nodeListToAst(node.childNodes, visit);
      }

      if (node.nodeType === Node.TEXT_NODE) {
        var text = normalizeTextContent(node.nodeValue);
        if (!text) return [];
        return [{ type: 'text', value: text }];
      }

      if (node.nodeType !== Node.ELEMENT_NODE) return [];

      var tag = String(node.tagName || '').toLowerCase();
      if (tag === 'body') {
        return nodeListToAst(node.childNodes, visit);
      }

      var attrs = {};
      var rawAttrs = node.attributes || [];
      for (var i = 0; i < rawAttrs.length; i++) {
        attrs[rawAttrs[i].name] = rawAttrs[i].value;
      }

      return [{
        type: 'element',
        tag: tag,
        attrs: attrs,
        classes: [],
        styleDecls: [],
        children: nodeListToAst(node.childNodes, visit)
      }];
    }

    return visit(source);
  }

  function makeSlotName(componentName, elementNode) {
    var tagPart = sanitizeToken(elementNode && elementNode.tag ? elementNode.tag : 'content') || 'content';
    var colorPart = '';
    var decls = elementNode && elementNode.styleDecls ? elementNode.styleDecls : [];
    for (var i = 0; i < decls.length; i++) {
      if (decls[i].name.toLowerCase() === 'color') {
        colorPart = sanitizeToken(decls[i].value);
        break;
      }
    }
    if (colorPart) return tagPart + '-' + colorPart + '-content';
    var namePart = sanitizeToken(componentName);
    if (namePart) return namePart + '-content';
    return tagPart + '-content';
  }

  function registerComponentDefinition(componentName, node, ctx) {
    var normalized = normalizeComponentName(componentName, ctx);
    var slotName = makeSlotName(normalized, node);

    var templateNode = {
      type: 'element',
      tag: node.tag,
      attrs: cloneAttrMap(node.attrs),
      classes: (node.classes || []).slice(),
      styleDecls: cloneStyleDecls(node.styleDecls),
      children: [{ type: 'slot', name: slotName }]
    };

    var fingerprint = JSON.stringify(templateNode);
    var existing = ctx.componentsByName[normalized];
    if (!existing) {
      existing = {
        name: normalized,
        slotName: slotName,
        templateNode: templateNode,
        fingerprint: fingerprint
      };
      ctx.componentsByName[normalized] = existing;
      ctx.componentOrder.push(existing);
      return { componentName: normalized, slotName: slotName };
    }

    return {
      componentName: normalized,
      slotName: existing.slotName
    };
  }

  function optimizeNode(node, ctx) {
    if (!node) return null;

    if (node.type === 'text') {
      return { type: 'text', value: node.value };
    }

    if (node.type !== 'element') {
      return null;
    }

    var attrs = cloneAttrMap(node.attrs);
    var children = [];
    var sourceChildren = node.children || [];
    for (var i = 0; i < sourceChildren.length; i++) {
      var optimizedChild = optimizeNode(sourceChildren[i], ctx);
      if (optimizedChild) children.push(optimizedChild);
    }

    var classes = splitClasses(attrs.class);
    delete attrs.class;

    var styleDecls = parseStyleDeclarations(attrs.style);
    delete attrs.style;

    var componentAttr = hasOwn(attrs, 'q-component') ? String(attrs['q-component']) : '';
    if (hasOwn(attrs, 'q-component')) delete attrs['q-component'];

    var elementNode = {
      type: 'element',
      tag: node.tag,
      attrs: attrs,
      classes: classes,
      styleDecls: styleDecls,
      children: children
    };

    if (componentAttr) {
      var reg = registerComponentDefinition(componentAttr, elementNode, ctx);
      return {
        type: 'component-invocation',
        name: reg.componentName,
        attrs: {},
        classes: [],
        styleDecls: [],
        children: children
      };
    }

    return elementNode;
  }

  function optimizeNodes(nodes, ctx) {
    var out = [];
    var list = nodes || [];
    for (var i = 0; i < list.length; i++) {
      var optimized = optimizeNode(list[i], ctx);
      if (optimized) out.push(optimized);
    }
    return out;
  }

  function formatTagToken(node) {
    var token = node.tag || 'div';
    var classes = node.classes || [];
    if (classes.length) token += '.' + classes.join('.');
    return token;
  }

  function canCollapseIntoSingleChild(node) {
    if (!node || node.type !== 'element') return false;
    if (!isEmptyObject(node.attrs)) return false;
    if ((node.styleDecls || []).length) return false;
    if (!node.children || node.children.length !== 1) return false;
    return node.children[0] && node.children[0].type === 'element';
  }

  function collapseNode(node) {
    if (!node) return null;

    if (node.type === 'element' || node.type === 'component-invocation') {
      var collapsedChildren = [];
      var sourceChildren = node.children || [];
      for (var i = 0; i < sourceChildren.length; i++) {
        var next = collapseNode(sourceChildren[i]);
        if (next) collapsedChildren.push(next);
      }
      node.children = collapsedChildren;
    }

    if (node.type !== 'element') {
      return node;
    }

    while (canCollapseIntoSingleChild(node)) {
      var child = node.children[0];
      node = {
        type: 'element',
        tag: formatTagToken(node) + ',' + formatTagToken(child),
        attrs: cloneAttrMap(child.attrs),
        classes: [],
        styleDecls: cloneStyleDecls(child.styleDecls),
        children: child.children || []
      };
    }

    return node;
  }

  function collapseNodes(nodes) {
    var out = [];
    var list = nodes || [];
    for (var i = 0; i < list.length; i++) {
      var collapsed = collapseNode(list[i]);
      if (collapsed) out.push(collapsed);
    }
    return out;
  }

  function attrMapsEqual(a, b) {
    var ak = Object.keys(a || {}).sort();
    var bk = Object.keys(b || {}).sort();
    if (ak.length !== bk.length) return false;
    for (var i = 0; i < ak.length; i++) {
      if (ak[i] !== bk[i]) return false;
      if (String(a[ak[i]]) !== String(b[bk[i]])) return false;
    }
    return true;
  }

  function styleDeclsEqual(a, b) {
    var al = a || [];
    var bl = b || [];
    if (al.length !== bl.length) return false;
    for (var i = 0; i < al.length; i++) {
      if (String(al[i].name) !== String(bl[i].name)) return false;
      if (String(al[i].value) !== String(bl[i].value)) return false;
    }
    return true;
  }

  function stringArraysEqual(a, b) {
    var al = a || [];
    var bl = b || [];
    if (al.length !== bl.length) return false;
    for (var i = 0; i < al.length; i++) {
      if (String(al[i]) !== String(bl[i])) return false;
    }
    return true;
  }

  function arrayPathEqual(a, b) {
    if (!a || !b) return false;
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  function deepCloneNode(node) {
    if (!node) return null;
    if (node.type === 'text') {
      return { type: 'text', value: node.value };
    }
    if (node.type === 'slot') {
      return { type: 'slot', name: node.name };
    }
    if (node.type === 'component-invocation') {
      var invChildren = [];
      for (var i = 0; i < (node.children || []).length; i++) {
        invChildren.push(deepCloneNode(node.children[i]));
      }
      return {
        type: 'component-invocation',
        name: node.name,
        attrs: cloneAttrMap(node.attrs),
        classes: (node.classes || []).slice(),
        styleDecls: cloneStyleDecls(node.styleDecls),
        children: invChildren
      };
    }
    if (node.type === 'element') {
      var elChildren = [];
      for (var j = 0; j < (node.children || []).length; j++) {
        elChildren.push(deepCloneNode(node.children[j]));
      }
      return {
        type: 'element',
        tag: node.tag,
        attrs: cloneAttrMap(node.attrs),
        classes: (node.classes || []).slice(),
        styleDecls: cloneStyleDecls(node.styleDecls),
        children: elChildren
      };
    }
    return null;
  }

  function getNodeAtPath(root, path) {
    var cur = root;
    for (var i = 0; i < path.length; i++) {
      if (!cur || !cur.children || typeof cur.children[path[i]] === 'undefined') {
        return null;
      }
      cur = cur.children[path[i]];
    }
    return cur;
  }

  function setNodeAtPath(root, path, replacement) {
    if (!path.length) return replacement;
    var cur = root;
    for (var i = 0; i < path.length - 1; i++) {
      cur = cur.children[path[i]];
      if (!cur) return root;
    }
    var last = path[path.length - 1];
    if (!cur.children) cur.children = [];
    cur.children[last] = replacement;
    return root;
  }

  function countTagNodes(node) {
    if (!node) return 0;
    var count = (node.type === 'element' || node.type === 'component-invocation') ? 1 : 0;
    var children = node.children || [];
    for (var i = 0; i < children.length; i++) {
      count += countTagNodes(children[i]);
    }
    return count;
  }

  function markMismatchState(state, path) {
    if (!state.path) {
      state.path = path.slice();
      return;
    }
    if (!arrayPathEqual(state.path, path)) {
      state.fail = true;
    }
  }

  function findSingleMismatchPath(a, b) {
    var state = { path: null, fail: false };

    function walk(x, y, path) {
      if (state.fail) return;
      if (!x || !y) {
        markMismatchState(state, path);
        return;
      }

      if (x.type !== y.type) {
        markMismatchState(state, path);
        return;
      }

      if (x.type === 'text') {
        if (String(x.value) !== String(y.value)) {
          markMismatchState(state, path);
        }
        return;
      }

      if (x.type === 'slot') {
        if (String(x.name) !== String(y.name)) {
          markMismatchState(state, path);
        }
        return;
      }

      if (x.type === 'component-invocation') {
        if (String(x.name) !== String(y.name)) {
          markMismatchState(state, path);
          return;
        }
      } else if (x.type === 'element') {
        if (String(x.tag) !== String(y.tag)) {
          markMismatchState(state, path);
          return;
        }
      } else {
        markMismatchState(state, path);
        return;
      }

      if (!attrMapsEqual(x.attrs, y.attrs)) {
        markMismatchState(state, path);
        return;
      }
      if (!stringArraysEqual(x.classes, y.classes)) {
        markMismatchState(state, path);
        return;
      }
      if (!styleDeclsEqual(x.styleDecls, y.styleDecls)) {
        markMismatchState(state, path);
        return;
      }

      var xc = x.children || [];
      var yc = y.children || [];
      if (xc.length !== yc.length) {
        markMismatchState(state, path);
        return;
      }

      for (var i = 0; i < xc.length; i++) {
        walk(xc[i], yc[i], path.concat(i));
        if (state.fail) return;
      }
    }

    walk(a, b, []);

    if (state.fail) return null;
    if (!state.path || !state.path.length) return null;
    return state.path;
  }

  function generateFactoredComponentName(sourceNode, ctx) {
    var rootToken = (sourceNode && sourceNode.type === 'element' && sourceNode.tag)
      ? String(sourceNode.tag).split(',')[0]
      : 'block';
    var rootBase = sanitizeToken(rootToken.split('.')[0]) || 'block';
    var candidate = '';
    do {
      ctx.factoredComponentCounter += 1;
      candidate = 'auto-' + rootBase + '-' + ctx.factoredComponentCounter;
    } while (ctx.componentsByName[candidate]);
    return candidate;
  }

  function registerFactoredComponent(templateNode, sourceNode, ctx) {
    var fingerprint = JSON.stringify(templateNode);
    for (var i = 0; i < ctx.componentOrder.length; i++) {
      if (ctx.componentOrder[i].fingerprint === fingerprint) {
        return ctx.componentOrder[i];
      }
    }

    var name = generateFactoredComponentName(sourceNode, ctx);
    var entry = {
      name: name,
      slotName: 'content',
      templateNode: templateNode,
      fingerprint: fingerprint
    };
    ctx.componentsByName[name] = entry;
    ctx.componentOrder.push(entry);
    return entry;
  }

  function factorDuplicateSiblings(nodes, ctx) {
    var out = [];
    for (var i = 0; i < (nodes || []).length; i++) {
      var current = nodes[i];
      if (current && (current.type === 'element' || current.type === 'component-invocation')) {
        current = deepCloneNode(current);
        current.children = factorDuplicateSiblings(current.children || [], ctx);
      } else if (current) {
        current = deepCloneNode(current);
      }
      if (current) out.push(current);
    }

    var changed = true;
    while (changed) {
      changed = false;

      outer:
      for (var a = 0; a < out.length; a++) {
        var base = out[a];
        if (!base || base.type !== 'element') continue;

        for (var b = a + 1; b < out.length; b++) {
          var peer = out[b];
          if (!peer || peer.type !== 'element') continue;

          var mismatchPath = findSingleMismatchPath(base, peer);
          if (!mismatchPath) continue;

          var templateCandidate = deepCloneNode(base);
          templateCandidate = setNodeAtPath(templateCandidate, mismatchPath, {
            type: 'slot',
            name: 'content'
          });

          if (countTagNodes(templateCandidate) <= 2) continue;

          var group = [a, b];
          for (var c = b + 1; c < out.length; c++) {
            var extra = out[c];
            if (!extra || extra.type !== 'element') continue;
            var p = findSingleMismatchPath(base, extra);
            if (p && arrayPathEqual(p, mismatchPath)) {
              group.push(c);
            }
          }

          var componentDef = registerFactoredComponent(templateCandidate, base, ctx);
          var replacements = {};
          for (var g = 0; g < group.length; g++) {
            var source = out[group[g]];
            var payload = deepCloneNode(getNodeAtPath(source, mismatchPath));
            var children = payload ? [payload] : [];
            replacements[group[g]] = {
              type: 'component-invocation',
              name: componentDef.name,
              attrs: {},
              classes: [],
              styleDecls: [],
              children: children
            };
          }

          var nextOut = [];
          for (var k = 0; k < out.length; k++) {
            nextOut.push(hasOwn(replacements, k) ? replacements[k] : out[k]);
          }
          out = nextOut;
          changed = true;
          break outer;
        }
      }
    }

    return out;
  }

  function emitPropertyLines(node, level) {
    var lines = [];
    var indent = repeatIndent(level);

    var attrs = node.attrs || {};
    var keys = Object.keys(attrs).sort();
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      lines.push(indent + key + ': "' + escapePropertyValue(attrs[key]) + '";');
    }

    var decls = node.styleDecls || [];
    if (decls.length) {
      lines.push(indent + 'style {');
      for (var d = 0; d < decls.length; d++) {
        lines.push(repeatIndent(level + 1) + decls[d].name + ': ' + decls[d].value + ';');
      }
      lines.push(indent + '}');
    }

    return lines;
  }

  function emitTextNode(node, level) {
    var value = String(node.value == null ? '' : node.value);
    if (!value) return '';
    if (/[{}]/.test(value)) {
      return repeatIndent(level) + 'html { ' + escapeHtmlInlineValue(value) + ' }';
    }
    return repeatIndent(level) + 'text { ' + escapeTextBlockValue(value) + ' }';
  }

  function emitNode(node, level) {
    if (!node) return '';

    if (node.type === 'text') {
      return emitTextNode(node, level);
    }

    if (node.type === 'slot') {
      return repeatIndent(level) + 'slot { ' + node.name + ' }';
    }

    if (node.type !== 'element' && node.type !== 'component-invocation') {
      return '';
    }

    var token;
    if (node.type === 'component-invocation') {
      token = node.name;
      if ((node.classes || []).length) token += '.' + node.classes.join('.');
    } else {
      token = formatTagToken(node);
    }

    var lines = emitPropertyLines(node, level + 1);
    var children = node.children || [];
    for (var i = 0; i < children.length; i++) {
      var childLine = emitNode(children[i], level + 1);
      if (childLine) lines.push(childLine);
    }

    var indent = repeatIndent(level);
    if (!lines.length) return indent + token + ' {}';
    return indent + token + ' {\n' + lines.join('\n') + '\n' + indent + '}';
  }

  function emitComponentDefinition(definition) {
    var lines = [];
    lines.push('q-component ' + definition.name + ' {');
    lines.push(emitNode(definition.templateNode, 1));
    lines.push('}');
    return lines.join('\n');
  }

  function emitDocument(nodes, components) {
    var blocks = [];

    for (var i = 0; i < components.length; i++) {
      blocks.push(emitComponentDefinition(components[i]));
    }

    for (var j = 0; j < nodes.length; j++) {
      blocks.push(emitNode(nodes[j], 0));
    }

    return blocks.filter(Boolean).join('\n\n');
  }

  function convertDomSourceToQhtml(source) {
    var rawNodes = domToAst(source);
    var context = {
      componentsByName: Object.create(null),
      componentOrder: [],
      componentCounter: 0,
      factoredComponentCounter: 0
    };

    var optimizedNodes = optimizeNodes(rawNodes, context);
    var collapsedNodes = collapseNodes(optimizedNodes);
    var factoredNodes = factorDuplicateSiblings(collapsedNodes, context);

    var collapsedComponents = [];
    for (var i = 0; i < context.componentOrder.length; i++) {
      collapsedComponents.push({
        name: context.componentOrder[i].name,
        slotName: context.componentOrder[i].slotName,
        templateNode: collapseNode(context.componentOrder[i].templateNode)
      });
    }

    return emitDocument(factoredNodes, collapsedComponents);
  }

  function parseHtmlContainer(rawHtml) {
    ensureDomAvailable('fromHTML');
    var html = rawHtml == null ? '' : String(rawHtml);

    var template = document.createElement('template');
    template.innerHTML = html;
    return template.content;
  }

  function fromDOM(node) {
    ensureDomAvailable('fromDOM');
    return convertDomSourceToQhtml(node);
  }

  function fromHTML(rawHtml) {
    var container = parseHtmlContainer(rawHtml);
    return convertDomSourceToQhtml(container);
  }

  function toHTML(qhtmlCode) {
    ensureDomAvailable('toHTML');
    var qhtml = qhtmlCode == null ? '' : String(qhtmlCode);
    var mountPoint = document.body || document.documentElement;
    if (!mountPoint) {
      throw new Error('qhtml-tools.toHTML could not find a mount point (document.body).');
    }

    var host = document.createElement('q-html');
    host.innerHTML = qhtml;

    var pendingRender = null;
    if (typeof host.render === 'function') {
      var originalRender = host.render.bind(host);
      host.render = function () {
        pendingRender = Promise.resolve(originalRender());
        host.render = originalRender;
        return pendingRender;
      };
    }

    mountPoint.appendChild(host);

    if (pendingRender && typeof pendingRender.then === 'function') {
      return pendingRender.then(function () {
        return host.innerHTML;
      });
    }

    return host.innerHTML;
  }

  var api = {
    fromHTML: fromHTML,
    fromDOM: fromDOM,
    toHTML: toHTML
  };

  var sharedApi = api;
  if (globalScope.qhtml && (typeof globalScope.qhtml === 'object' || typeof globalScope.qhtml === 'function')) {
    sharedApi = globalScope.qhtml;
    sharedApi.fromHTML = fromHTML;
    sharedApi.fromDOM = fromDOM;
    sharedApi.toHTML = toHTML;
  } else {
    globalScope.qhtml = sharedApi;
  }

  globalScope.qhtml = sharedApi;
  globalScope.qhtmlTools = sharedApi;
  globalScope['qhtml-tools'] = sharedApi;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = sharedApi;
  }
})(typeof window !== 'undefined' ? window : globalThis);
