(function () {
  "use strict";

  const globalScope = typeof globalThis !== "undefined" ? globalThis : window;
  const NODE_ELEMENT = "element";
  const NODE_TEXT = "text";
  const NODE_HTML = "raw-html";
  const NODE_COMPONENT = "component";
  const NODE_COMPONENT_INSTANCE = "component-instance";
  const NODE_SLOT = "slot";
  const NODE_SCRIPT = "script-rule";
  const NODE_Q_VAR = "q-var";
  const NODE_Q_SWITCH = "q-switch";
  const NODE_STATE_MACHINE = "state-machine";
  const NODE_STYLE_DEFINITION = "style-definition";
  const NODE_THEME_DEFINITION = "theme-definition";
  const NODE_THEME_SCOPE = "theme-scope";
  const NODE_TRANSITION_DEFINITION = "transition-definition";
  let runtimeUuidCounter = 0;
  const rendererScript = typeof document !== "undefined" ? document.currentScript : null;
  const rendererBase = rendererScript && rendererScript.src
    ? new URL(".", rendererScript.src).href
    : typeof location !== "undefined"
      ? new URL(".", location.href).href
      : "";

  function normalizeName(value) {
    return String(value == null ? "" : value).trim();
  }

  function nextRuntimeUuid(prefix) {
    runtimeUuidCounter += 1;
    return `qhtml-wasm-${prefix || "runtime"}-${runtimeUuidCounter}`;
  }

  function defineHidden(target, name, value) {
    if (!target || (typeof target !== "object" && typeof target !== "function")) {
      return target;
    }
    Object.defineProperty(target, name, {
      configurable: true,
      enumerable: false,
      writable: true,
      value
    });
    return target;
  }

  function stripQuotes(value) {
    const text = normalizeName(value);
    if ((text.startsWith("\"") && text.endsWith("\"")) || (text.startsWith("'") && text.endsWith("'"))) {
      return text.slice(1, -1);
    }
    return text;
  }

  function parseScalar(value) {
    const text = normalizeName(value);
    if (!text) {
      return "";
    }
    if ((text.startsWith("\"") && text.endsWith("\"")) || (text.startsWith("'") && text.endsWith("'"))) {
      return text.slice(1, -1);
    }
    if (/^(true|false)$/i.test(text)) {
      return /^true$/i.test(text);
    }
    if (/^-?(?:\d+|\d*\.\d+)$/.test(text)) {
      return Number(text);
    }
    return text;
  }

  function qdomUuid(node, prefix) {
    if (!node || typeof node !== "object") {
      return "";
    }
    if (node.uuid) {
      return String(node.uuid);
    }
    node.meta = node.meta && typeof node.meta === "object" ? node.meta : {};
    if (!node.meta.uuid) {
      node.meta.uuid = nextRuntimeUuid(prefix || "node");
    }
    return String(node.meta.uuid);
  }

  function objectUuid(value, prefix) {
    if (!value || (typeof value !== "object" && typeof value !== "function")) {
      return "";
    }
    if (value.__qhtmlUuid) {
      return String(value.__qhtmlUuid);
    }
    const node = value.__qhtmlWasmNode && typeof value.__qhtmlWasmNode === "object"
      ? value.__qhtmlWasmNode
      : value.meta && typeof value.meta === "object"
        ? value
        : null;
    const uuid = node ? qdomUuid(node, prefix) : nextRuntimeUuid(prefix || "object");
    defineHidden(value, "__qhtmlUuid", uuid);
    return uuid;
  }

  function splitWhitespace(value) {
    return normalizeName(value).split(/\s+/).filter(Boolean);
  }

  function splitCommaAware(value) {
    const out = [];
    let current = "";
    let quote = "";
    let parenDepth = 0;
    for (const ch of String(value || "")) {
      if (quote) {
        current += ch;
        if (ch === quote) {
          quote = "";
        }
        continue;
      }
      if (ch === "\"" || ch === "'") {
        quote = ch;
        current += ch;
        continue;
      }
      if (ch === "(") {
        parenDepth += 1;
      } else if (ch === ")") {
        parenDepth = Math.max(0, parenDepth - 1);
      }
      if (ch === "," && parenDepth === 0) {
        if (current.trim()) {
          out.push(current.trim());
        }
        current = "";
      } else {
        current += ch;
      }
    }
    if (current.trim()) {
      out.push(current.trim());
    }
    return out;
  }

  function readHead(source, state) {
    const start = state.index;
    let quote = "";
    let parenDepth = 0;
    let bracketDepth = 0;
    while (state.index < source.length) {
      const ch = source[state.index];
      if (quote) {
        if (ch === quote && source[state.index - 1] !== "\\") {
          quote = "";
        }
        state.index += 1;
        continue;
      }
      if (ch === "\"" || ch === "'") {
        quote = ch;
        state.index += 1;
        continue;
      }
      if (ch === "(") {
        parenDepth += 1;
      } else if (ch === ")") {
        parenDepth = Math.max(0, parenDepth - 1);
      } else if (ch === "[") {
        bracketDepth += 1;
      } else if (ch === "]") {
        bracketDepth = Math.max(0, bracketDepth - 1);
      }
      if (parenDepth === 0 && bracketDepth === 0 && (ch === "{" || ch === "\n" || ch === ";")) {
        break;
      }
      state.index += 1;
    }
    return source.slice(start, state.index).trim();
  }

  function readBlock(source, state) {
    while (/\s/.test(source[state.index] || "")) {
      state.index += 1;
    }
    if (source[state.index] !== "{") {
      return "";
    }
    state.index += 1;
    const start = state.index;
    let depth = 1;
    let quote = "";
    while (state.index < source.length && depth > 0) {
      const ch = source[state.index++];
      if (quote) {
        if (ch === quote && source[state.index - 2] !== "\\") {
          quote = "";
        }
        continue;
      }
      if (ch === "\"" || ch === "'") {
        quote = ch;
      } else if (ch === "{") {
        depth += 1;
      } else if (ch === "}") {
        depth -= 1;
      }
    }
    return source.slice(start, depth === 0 ? state.index - 1 : state.index);
  }

  function consumeLineEnd(source, state) {
    while (state.index < source.length && source[state.index] !== "\n" && source[state.index] !== ";") {
      state.index += 1;
    }
    while (state.index < source.length && (source[state.index] === "\n" || source[state.index] === ";")) {
      state.index += 1;
    }
  }

  function skipSeparators(source, state) {
    while (state.index < source.length && (/[\s;]/.test(source[state.index] || ""))) {
      state.index += 1;
    }
  }

  function headParts(head) {
    const tokens = splitWhitespace(head);
    const keyword = tokens[0] || "";
    const fnMatch = /^(function|constructor)\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*$/i.exec(head);
    if (fnMatch) {
      return {
        keyword: fnMatch[1],
        name: fnMatch[2],
        parameters: fnMatch[3],
        tokens
      };
    }
    const signalMatch = /^q-signal\s+([A-Za-z_$][\w$]*)\s*(?:\(([^)]*)\))?/i.exec(head);
    if (signalMatch) {
      return {
        keyword,
        name: signalMatch[1],
        parameters: signalMatch[2] || "",
        tokens
      };
    }
    const callableMatch = /^([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*$/.exec(head);
    if (callableMatch) {
      return {
        keyword: callableMatch[1],
        name: callableMatch[1],
        parameters: callableMatch[2] || "",
        tokens
      };
    }
    const typedCallableMatch = /^([A-Za-z_$][\w$-]*)\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*$/.exec(head);
    if (typedCallableMatch) {
      return {
        keyword: typedCallableMatch[1],
        name: typedCallableMatch[2],
        parameters: typedCallableMatch[3] || "",
        tokens
      };
    }
    return {
      keyword,
      name: tokens[1] || "",
      parameters: "",
      tokens
    };
  }

  function selectorTag(selector) {
    const text = normalizeName(selector);
    const match = /^[A-Za-z][A-Za-z0-9_-]*/.exec(text);
    return match ? match[0].toLowerCase() : "div";
  }

  function selectorAttributes(selector) {
    const text = normalizeName(selector);
    const attrs = {};
    const idMatch = /#([A-Za-z0-9_-]+)/.exec(text);
    const classes = [];
    text.replace(/\.([A-Za-z0-9_-]+)/g, (_all, cls) => {
      classes.push(cls);
      return "";
    });
    if (idMatch) {
      attrs.id = idMatch[1];
    }
    if (classes.length) {
      attrs.class = classes.join(" ");
    }
    return attrs;
  }

  function cssPropertyName(name) {
    const text = normalizeName(name);
    if (!text) {
      return "";
    }
    if (text.includes("-")) {
      return text.toLowerCase();
    }
    return text.replace(/[A-Z]/g, (letter) => "-" + letter.toLowerCase());
  }

  function appendStyleText(target, declarations) {
    const parts = [];
    Object.keys(declarations || {}).forEach((name) => {
      const prop = cssPropertyName(name);
      if (prop) {
        parts.push(`${prop}: ${declarations[name]}`);
      }
    });
    if (!parts.length) {
      return;
    }
    const existing = normalizeName(target.getAttribute ? target.getAttribute("style") : target.attributes && target.attributes.style);
    const next = parts.join("; ");
    target.setAttribute("style", existing ? `${existing}; ${next}` : next);
  }

  function selectorMatchesElement(selector, element) {
    const text = normalizeName(selector);
    if (!text || !element) {
      return false;
    }
    if (text.startsWith(".")) {
      const cls = text.slice(1);
      const classes = String(element.getAttribute ? element.getAttribute("class") || "" : element.attributes && element.attributes.class || "").split(/\s+/);
      return classes.includes(cls);
    }
    const tag = element.tagName ? String(element.tagName).toLowerCase() : "";
    if (text.includes(".")) {
      const expectedTag = selectorTag(text);
      const expectedClass = text.split(".").slice(1);
      const classes = String(element.getAttribute ? element.getAttribute("class") || "" : element.attributes && element.attributes.class || "").split(/\s+/);
      return tag === expectedTag && expectedClass.every((cls) => classes.includes(cls));
    }
    if (text.includes("#")) {
      const expectedTag = selectorTag(text);
      const id = text.split("#")[1].split(".")[0];
      return tag === expectedTag && (element.id === id || element.getAttribute && element.getAttribute("id") === id);
    }
    return tag === text.toLowerCase();
  }

  function convertWasmObject(value) {
    if (!value) {
      return null;
    }
    if (typeof value === "object" && !value.toObject && !value.toJson) {
      return value;
    }
    if (typeof value.toObject === "function") {
      try {
        return value.toObject();
      } catch (_error) {
        return value;
      }
    }
    if (typeof value.toJson === "function") {
      try {
        return JSON.parse(value.toJson());
      } catch (_error) {
        return value;
      }
    }
    return value;
  }

  function createParser(Module) {
    function importPathFromBody(body) {
      return stripQuotes(normalizeName(body).split(/\s+/)[0] || "");
    }

    function localImportUrl(path) {
      const normalized = importPathFromBody(path).replace(/^dist\//, "").replace(/^\.\//, "");
      if (!normalized) {
        return "";
      }
      if (/^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(normalized)) {
        return normalized;
      }
      const baseUrl = rendererBase || (typeof location !== "undefined" ? location.href : "");
      if (!baseUrl) {
        return "";
      }
      if (normalized === "q-components.qhtml" || normalized.startsWith("q-components/")) {
        return new URL("../" + normalized, baseUrl).href;
      }
      return new URL(normalized, baseUrl).href;
    }

    function readLocalImport(path) {
      if (typeof XMLHttpRequest === "undefined") {
        return "";
      }
      const url = localImportUrl(path);
      if (!url) {
        return "";
      }
      try {
        const request = new XMLHttpRequest();
        request.open("GET", url, false);
        request.send(null);
        if ((request.status >= 200 && request.status < 300) || request.status === 0) {
          return request.responseText || "";
        }
      } catch (_error) {
        return "";
      }
      return "";
    }

    function fallbackExpandImports(source) {
      return String(source || "").replace(/\b(q-import(?:-resource)?)\s*\{([^{}]*)\}/g, (all, keyword, body) => {
        const imported = readLocalImport(body);
        if (imported) {
          return fallbackExpandImports(imported);
        }
        if (String(keyword).toLowerCase() === "q-import-resource") {
          throw new Error(`q-import-resource could not resolve ${importPathFromBody(body)}`);
        }
        return all;
      });
    }

    function expandImports(source) {
      const text = String(source || "");
      if (Module && typeof Module.qhtmlExpandResourceImportsInSource === "function") {
        const expanded = Module.qhtmlExpandResourceImportsInSource(text);
        if (expanded !== text) {
          return expanded;
        }
      }
      return fallbackExpandImports(text);
    }

    function parse(source, inheritedDefinitions) {
      const definitions = inheritedDefinitions || {
        components: new Map(),
        templates: new Map(),
        classes: new Map(),
        structs: new Map(),
        styles: new Map(),
        themes: new Map(),
        defaultThemes: new Map(),
        transitions: new Map(),
        painters: new Map()
      };
      const documentNode = {
        kind: "document",
        nodes: parseNodes(expandImports(source), definitions, null),
        definitions
      };
      return documentNode;
    }

    function registerParsedDefinitions(nodes, definitions) {
      for (const node of nodes || []) {
        if (!node) {
          continue;
        }
        const kind = String(node.kind || "").toLowerCase();
        if (kind === NODE_COMPONENT || kind === "struct-definition" || kind === "template") {
          const id = node.componentId || node.classId || node.templateId || node.name;
          if (id) {
            definitions.components.set(id, node);
          }
        } else if (kind === "class-definition") {
          const id = node.classId || node.componentId || node.name;
          if (id) {
            definitions.classes.set(id, node);
          }
        } else if (kind === NODE_STYLE_DEFINITION && node.name) {
          definitions.styles.set(node.name, node);
        } else if (kind === NODE_THEME_DEFINITION && node.name) {
          (node.isDefault ? definitions.defaultThemes : definitions.themes).set(node.name, node);
        } else if (kind === NODE_TRANSITION_DEFINITION && node.name) {
          definitions.transitions.set(node.name, node);
        }
      }
    }

    function parseNodes(source, definitions, owner) {
      const state = { index: 0 };
      const nodes = [];
      while (state.index < source.length) {
        skipSeparators(source, state);
        if (state.index >= source.length) {
          break;
        }
        const head = readHead(source, state);
        if (!head) {
          consumeLineEnd(source, state);
          continue;
        }
        while (/\s/.test(source[state.index] || "")) {
          state.index += 1;
        }
        if (source[state.index] === "{") {
          const body = readBlock(source, state);
          handleBlock(head, body, definitions, owner, nodes);
        } else {
          handleLine(head, owner, nodes);
          consumeLineEnd(source, state);
        }
      }
      return nodes;
    }

    function handleBlock(head, body, definitions, owner, nodes) {
      const parts = headParts(head);
      const keyword = parts.keyword.toLowerCase();
      if (keyword === "text" || keyword === "innertext") {
        nodes.push({ kind: NODE_TEXT, value: body });
        return;
      }
      if (keyword === "html") {
        nodes.push({ kind: NODE_HTML, html: body });
        return;
      }
      if (keyword === "style" && owner) {
        nodes.push({ kind: NODE_SCRIPT, scriptType: "style", body });
        return;
      }
      if (keyword === "q-var") {
        nodes.push({
          kind: NODE_Q_VAR,
          name: parts.name,
          body
        });
        return;
      }
      if (keyword === "q-switch") {
        nodes.push({
          kind: NODE_Q_SWITCH,
          name: parts.name,
          cases: parseSwitchCases(body)
        });
        return;
      }
      if (keyword === "q-state-machine") {
        nodes.push(parseStateMachine(parts, body, definitions));
        return;
      }
      if (keyword === "q-import-resource") {
        const expandedImport = expandImports(`q-import-resource { ${body} }`);
        if (expandedImport !== `q-import-resource { ${body} }`) {
          const importedNodes = parseNodes(expandedImport, definitions, owner);
          registerParsedDefinitions(importedNodes, definitions);
          nodes.push(...importedNodes);
        }
        return;
      }
      if (keyword === "q-import") {
        const expandedImport = expandImports(`q-import { ${body} }`);
        if (expandedImport !== `q-import { ${body} }`) {
          const importedNodes = parseNodes(expandedImport, definitions, owner);
          registerParsedDefinitions(importedNodes, definitions);
          nodes.push(...importedNodes);
        }
        return;
      }
      if (keyword === "q-style") {
        const definition = parseStyleDefinition(parts.name, body, definitions);
        definitions.styles.set(definition.name, definition);
        nodes.push(definition);
        return;
      }
      if (keyword === "q-transition") {
        const definition = parseTransitionDefinition(parts.name, body);
        definitions.transitions.set(definition.name, definition);
        nodes.push(definition);
        return;
      }
      if (keyword === "q-painter") {
        definitions.painters.set(parts.name, { kind: "painter-definition", name: parts.name, body });
        return;
      }
      if (keyword === "q-theme" || keyword === "q-default-theme") {
        const definition = parseThemeDefinition(parts.name, body, definitions, keyword === "q-default-theme");
        const target = definition.isDefault ? definitions.defaultThemes : definitions.themes;
        target.set(definition.name, definition);
        nodes.push(definition);
        return;
      }
      if (keyword === "q-component" || keyword === "q-template" || keyword === "q-worker") {
        const definition = parseDefinition(parts, body, definitions, keyword);
        definitions.components.set(definition.componentId, definition);
        nodes.push(definition);
        return;
      }
      if (keyword === "q-class") {
        const definition = parseClassDefinition(parts, body, definitions);
        definitions.classes.set(definition.classId, definition);
        nodes.push(definition);
        return;
      }
      if (keyword === "slot") {
        nodes.push({
          kind: NODE_SLOT,
          name: parts.name || normalizeName(body).split(/\s+/)[0] || "default",
          children: parseNodes(body, definitions, owner)
        });
        return;
      }
      if (keyword === "onready" || keyword === "onload" || keyword.startsWith("on") ||
          keyword === "q-script" || keyword === "q-connect") {
        nodes.push({
          kind: NODE_SCRIPT,
          name: parts.keyword,
          parameters: parts.parameters,
          body,
          isLifecycle: keyword === "onready" || keyword === "onload"
        });
        return;
      }
      if (definitions.components.has(parts.keyword)) {
        nodes.push(parseComponentInstance(parts, body, definitions));
        return;
      }
      if (definitions.classes.has(parts.keyword)) {
        nodes.push({
          kind: "class-instance",
          classId: parts.keyword,
          alias: parts.name,
          argumentSource: parts.parameters,
          children: parseNodes(body, definitions, owner),
          props: parseAssignments(body)
        });
        return;
      }
      if (definitions.themes.has(parts.keyword) || definitions.defaultThemes.has(parts.keyword)) {
        nodes.push({
          kind: NODE_THEME_SCOPE,
          themeNames: [parts.keyword],
          children: parseNodes(body, definitions, owner)
        });
        return;
      }
      const chain = splitCommaAware(head);
      const styleRefs = [];
      while (chain.length > 1 && definitions.styles.has(chain[0])) {
        styleRefs.push(chain.shift());
      }
      let root = null;
      let previous = null;
      for (const selector of chain) {
        const element = {
          kind: NODE_ELEMENT,
          tagName: selectorTag(selector),
          attributes: selectorAttributes(selector),
          selector,
          styleRefs: root ? [] : styleRefs.slice(),
          children: []
        };
        if (!root) {
          root = element;
          nodes.push(root);
        }
        if (previous) {
          previous.children.push(element);
        }
        previous = element;
      }
      if (previous) {
        previous.children.push(...parseNodes(body, definitions, previous));
      }
    }

    function parseStyleDefinition(name, body, definitions) {
      const style = {
        kind: NODE_STYLE_DEFINITION,
        name,
        classes: [],
        declarations: {},
        transitions: [],
        painters: {}
      };
      const state = { index: 0 };
      while (state.index < body.length) {
        skipSeparators(body, state);
        const head = readHead(body, state);
        if (!head) {
          consumeLineEnd(body, state);
          continue;
        }
        while (/\s/.test(body[state.index] || "")) {
          state.index += 1;
        }
        const hasBlock = body[state.index] === "{";
        const nested = hasBlock ? readBlock(body, state).trim() : "";
        const parts = headParts(head);
        const keyword = parts.keyword.toLowerCase();
        if (keyword === "q-style-class") {
          style.classes.push(...splitWhitespace(nested));
        } else if (keyword === "q-style-transition") {
          style.transitions.push(...splitWhitespace(nested).filter((entry) => definitions.transitions.has(entry) || entry));
        } else if (keyword === "q-style-painter") {
          const painterMatch = /([A-Za-z-]+)\s*\{\s*([^{}\s]+)\s*\}/.exec(nested);
          if (painterMatch) {
            style.painters[painterMatch[1]] = painterMatch[2];
          }
        } else {
          const colon = head.indexOf(":");
          if (colon > 0) {
            style.declarations[head.slice(0, colon).trim()] = stripQuotes(head.slice(colon + 1).trim());
          } else if (hasBlock) {
            style.declarations[head.trim()] = stripQuotes(nested);
          }
        }
      }
      return style;
    }

    function parseTransitionDefinition(name, body) {
      const transition = {
        kind: NODE_TRANSITION_DEFINITION,
        name,
        properties: []
      };
      const state = { index: 0 };
      while (state.index < body.length) {
        skipSeparators(body, state);
        const head = readHead(body, state);
        if (!head) {
          consumeLineEnd(body, state);
          continue;
        }
        while (/\s/.test(body[state.index] || "")) {
          state.index += 1;
        }
        const nested = body[state.index] === "{" ? readBlock(body, state).trim() : "";
        transition.properties.push({ name: head.trim(), value: stripQuotes(nested || head.split(":").slice(1).join(":")) });
      }
      return transition;
    }

    function parseThemeDefinition(name, body, definitions, isDefault) {
      const theme = {
        kind: NODE_THEME_DEFINITION,
        name,
        isDefault: !!isDefault,
        rules: [],
        includes: []
      };
      const state = { index: 0 };
      while (state.index < body.length) {
        skipSeparators(body, state);
        const head = readHead(body, state);
        if (!head) {
          consumeLineEnd(body, state);
          continue;
        }
        while (/\s/.test(body[state.index] || "")) {
          state.index += 1;
        }
        const nested = body[state.index] === "{" ? readBlock(body, state).trim() : "";
        const selector = head.trim();
        if (definitions.themes.has(selector) || definitions.defaultThemes.has(selector)) {
          theme.includes.push(selector);
        } else {
          theme.rules.push({
            selector,
            styleRefs: parseThemeStyleRefs(nested, definitions)
          });
        }
      }
      return theme;
    }

    function parseThemeStyleRefs(body, definitions) {
      const refs = [];
      const state = { index: 0 };
      while (state.index < body.length) {
        skipSeparators(body, state);
        const head = readHead(body, state);
        if (!head) {
          consumeLineEnd(body, state);
          continue;
        }
        while (/\s/.test(body[state.index] || "")) {
          state.index += 1;
        }
        if (head.trim() === "q-style" && body[state.index] === "{") {
          const anonymous = parseStyleDefinition(`__anonymous_style_${refs.length}_${state.index}`, readBlock(body, state), definitions);
          refs.push(anonymous);
        } else if (body[state.index] === "{") {
          readBlock(body, state);
          refs.push(...splitWhitespace(head));
        } else {
          refs.push(...splitWhitespace(head));
          consumeLineEnd(body, state);
        }
      }
      return refs;
    }

    function handleLine(line, owner, nodes) {
      const text = normalizeName(line);
      if (!text) {
        return;
      }
      const qhtmlCall = /^qhtml\s*\(([\s\S]*)\)\s*$/.exec(text);
      if (qhtmlCall) {
        nodes.push({
          kind: NODE_SCRIPT,
          name: "qhtml",
          scriptType: "qhtml-call",
          body: qhtmlCall[1] || ""
        });
        return;
      }
      const colon = text.indexOf(":");
      if (owner && colon > 0) {
        const name = text.slice(0, colon).trim();
        const value = parseScalar(text.slice(colon + 1));
        owner.properties = owner.properties || {};
        owner.properties[name] = value;
        owner.attributes = owner.attributes || {};
        owner.attributes[name] = String(value);
        return;
      }
      nodes.push({ kind: NODE_TEXT, value: text });
    }

    function parseSwitchCases(body) {
      const cases = [];
      const state = { index: 0 };
      while (state.index < body.length) {
        skipSeparators(body, state);
        if (state.index >= body.length) {
          break;
        }
        const head = readHead(body, state);
        if (!head) {
          consumeLineEnd(body, state);
          continue;
        }
        while (/\s/.test(body[state.index] || "")) {
          state.index += 1;
        }
        const colon = head.indexOf(":");
        const key = normalizeName(colon >= 0 ? head.slice(0, colon) : head);
        const inlineValue = normalizeName(colon >= 0 ? head.slice(colon + 1) : "");
        const value = body[state.index] === "{"
          ? readBlock(body, state)
          : inlineValue;
        if (key) {
          cases.push({ key, value });
        }
        if (body[state.index] !== "{" && !inlineValue) {
          consumeLineEnd(body, state);
        }
      }
      return cases;
    }

    function parsePropertyDeclaration(head, body, keyword) {
      const raw = String(head || "").slice(String(keyword || "").length).trim();
      const colon = raw.indexOf(":");
      const name = (colon >= 0 ? raw.slice(0, colon) : raw).trim();
      const value = colon >= 0 ? raw.slice(colon + 1).trim() : String(body || "").trim();
      return { name, value: parseScalar(value) };
    }

    function parseNamedSelector(name) {
      const text = normalizeName(name);
      const match = /^([A-Za-z_$][\w$-]*)(.*)$/.exec(text);
      return {
        name: match ? match[1] : text,
        selector: match ? match[2] || "" : ""
      };
    }

    function parseStateMachine(parts, body, definitions) {
      const named = parseNamedSelector(parts.name);
      const machine = {
        kind: NODE_STATE_MACHINE,
        name: named.name,
        selector: named.selector,
        properties: [],
        propertyDefaults: {},
        signals: [{ name: "statechanged", parameters: ["value"] }],
        methods: {},
        lifecycleScripts: [],
        states: [],
        initialState: ""
      };
      const state = { index: 0 };
      while (state.index < body.length) {
        skipSeparators(body, state);
        const head = readHead(body, state);
        if (!head) {
          consumeLineEnd(body, state);
          continue;
        }
        while (/\s/.test(body[state.index] || "")) {
          state.index += 1;
        }
        const hasBlock = body[state.index] === "{";
        const nested = hasBlock ? readBlock(body, state) : "";
        const nestedParts = headParts(head);
        const nestedKeyword = nestedParts.keyword.toLowerCase();
        if (nestedKeyword === "q-property" || nestedKeyword === "property") {
          const property = parsePropertyDeclaration(head, nested, nestedKeyword);
          if (property.name) {
            machine.properties.push(property.name);
            machine.propertyDefaults[property.name] = property.value;
          }
        } else if (nestedKeyword === "q-signal") {
          machine.signals.push({
            name: nestedParts.name,
            parameters: splitCommaAware(nestedParts.parameters)
          });
        } else if (nestedKeyword === "function") {
          machine.methods[nestedParts.name] = {
            name: nestedParts.name,
            parameters: splitCommaAware(nestedParts.parameters),
            body: nested
          };
        } else if (nestedKeyword === "onready" || nestedKeyword.startsWith("on") || nestedKeyword === "q-connect") {
          machine.lifecycleScripts.push({
            name: nestedParts.keyword,
            parameters: nestedParts.parameters,
            body: nested,
            isQConnect: nestedKeyword === "q-connect",
            isLifecycle: nestedKeyword === "onready" || nestedKeyword === "onload"
          });
        } else if (hasBlock) {
          const stateName = normalizeName(nestedParts.keyword || head);
          machine.states.push({
            name: stateName,
            children: parseNodes(nested, definitions, null)
          });
          if (!machine.initialState) {
            machine.initialState = stateName;
          }
        } else {
          consumeLineEnd(body, state);
        }
      }
      return machine;
    }

    function parseDefinition(parts, body, definitions, keyword) {
      const definition = {
        kind: NODE_COMPONENT,
        componentId: parts.name,
        definitionType: keyword === "q-worker" ? "worker" : keyword === "q-template" ? "template" : "component",
        properties: [],
        propertyDefaults: {},
        methods: {},
        signals: [],
        lifecycleScripts: [],
        templateNodes: []
      };
      const state = { index: 0 };
      while (state.index < body.length) {
        skipSeparators(body, state);
        const head = readHead(body, state);
        if (!head) {
          consumeLineEnd(body, state);
          continue;
        }
        while (/\s/.test(body[state.index] || "")) {
          state.index += 1;
        }
        const hasBlock = body[state.index] === "{";
        const nested = hasBlock ? readBlock(body, state) : "";
        const nestedParts = headParts(head);
        const nestedKeyword = nestedParts.keyword.toLowerCase();
        if (nestedKeyword === "q-property" || nestedKeyword === "property") {
          const property = parsePropertyDeclaration(head, nested, nestedKeyword);
          const name = property.name;
          if (name) {
            definition.properties.push(name);
            definition.propertyDefaults[name] = property.value;
          }
        } else if (nestedKeyword === "q-signal") {
          definition.signals.push({
            name: nestedParts.name,
            parameters: splitCommaAware(nestedParts.parameters)
          });
        } else if (nestedKeyword === "function" || nestedKeyword === "constructor" ||
            nestedKeyword === normalizeName(definition.componentId).toLowerCase()) {
          const isConstructor = nestedKeyword === "constructor" ||
            nestedKeyword === normalizeName(definition.componentId).toLowerCase();
          definition.methods[nestedParts.name || nestedKeyword] = {
            name: nestedParts.name || nestedKeyword,
            parameters: splitCommaAware(nestedParts.parameters),
            body: nested,
            isConstructor
          };
        } else if (nestedKeyword === "slot") {
          definition.templateNodes.push({
            kind: NODE_SLOT,
            name: nestedParts.name || normalizeName(nested).split(/\s+/)[0] || "default",
            children: []
          });
        } else if (nestedKeyword === "onready" || nestedKeyword.startsWith("on") || nestedKeyword === "q-connect") {
          definition.lifecycleScripts.push({
            name: nestedParts.keyword,
            parameters: nestedParts.parameters,
            body: nested,
            isQConnect: nestedKeyword === "q-connect"
          });
        } else if (hasBlock) {
          handleBlock(head, nested, definitions, definition, definition.templateNodes);
        } else {
          consumeLineEnd(body, state);
        }
      }
      return definition;
    }

    function parseClassDefinition(parts, body, definitions) {
      const definition = parseDefinition({ ...parts, name: parts.name }, body, definitions, "q-class");
      definition.kind = "class-definition";
      definition.classId = parts.name;
      return definition;
    }

    function parseAssignments(body) {
      const assignments = {};
      const state = { index: 0 };
      while (state.index < body.length) {
        skipSeparators(body, state);
        const head = readHead(body, state);
        if (!head) {
          consumeLineEnd(body, state);
          continue;
        }
        while (/\s/.test(body[state.index] || "")) {
          state.index += 1;
        }
        if (body[state.index] === "{") {
          readBlock(body, state);
        } else {
          const colon = head.indexOf(":");
          if (colon > 0) {
            assignments[head.slice(0, colon).trim()] = parseScalar(head.slice(colon + 1));
          }
          consumeLineEnd(body, state);
        }
      }
      return assignments;
    }

    function parseComponentInstance(parts, body, definitions) {
      const definition = definitions.components.get(parts.keyword);
      const declaredSlots = new Set(collectSlotNames(definition && definition.templateNodes || []));
      const children = [];
      const slotNodes = new Map();
      const props = {};
      const state = { index: 0 };
      while (state.index < body.length) {
        skipSeparators(body, state);
        const head = readHead(body, state);
        if (!head) {
          consumeLineEnd(body, state);
          continue;
        }
        while (/\s/.test(body[state.index] || "")) {
          state.index += 1;
        }
        const hasBlock = body[state.index] === "{";
        if (hasBlock) {
          const nested = readBlock(body, state);
          const slot = normalizeName(headParts(head).keyword || head);
          if (declaredSlots.has(slot)) {
            slotNodes.set(slot, parseNodes(nested, definitions, null));
          } else {
            const nestedNodes = [];
            handleBlock(head, nested, definitions, null, nestedNodes);
            children.push(...nestedNodes);
          }
        } else {
          const colon = head.indexOf(":");
          if (colon > 0) {
            props[head.slice(0, colon).trim()] = parseScalar(head.slice(colon + 1));
          }
          consumeLineEnd(body, state);
        }
      }
      return {
        kind: NODE_COMPONENT_INSTANCE,
        componentId: parts.keyword,
        tagName: parts.keyword,
        alias: parts.name,
        props,
        children,
        slotNodes
      };
    }

    function collectSlotNames(nodes, out) {
      const names = out || [];
      for (const node of nodes || []) {
        if (!node) {
          continue;
        }
        if (node.kind === NODE_SLOT && node.name && names.indexOf(node.name) === -1) {
          names.push(node.name);
        }
        collectSlotNames(node.children || node.templateNodes || [], names);
      }
      return names;
    }

    return {
      parse,
      expandImports
    };
  }

  function dispatchContextItemAdded(scope, name, value) {
    if (!scope || !name) {
      return;
    }
    const owner = typeof scope.owner === "function" ? scope.owner() : null;
    if (!owner || typeof owner.dispatchEvent !== "function") {
      return;
    }
    const itemUuid = objectUuid(value, "context-item");
    if (!itemUuid) {
      return;
    }
    const parentUuid = objectUuid(owner, "context-parent");
    const detail = {
      args: [parentUuid, itemUuid, name],
      parentUuid,
      parent_uuid: parentUuid,
      itemUuid,
      item_uuid: itemUuid,
      namedReference: name,
      named_reference: name,
      parent: owner,
      item: value
    };
    for (const eventName of ["contextItemAdded", "contextitemadded", "contextItemAded"]) {
      owner.dispatchEvent(new CustomEvent(eventName, {
        bubbles: true,
        detail
      }));
    }
  }

  function createScope(parent, owner, host) {
    const values = new Map();
    let contextOwner = owner || null;
    let contextHost = host || parent && typeof parent.host === "function" && parent.host() || contextOwner;
    return {
      parent: parent || null,
      set(name, value, options) {
        const key = normalizeName(name);
        if (key) {
          values.set(key, value);
          if (!options || options.silent !== true) {
            dispatchContextItemAdded(this, key, value);
          }
        }
        return value;
      },
      get(name) {
        const key = normalizeName(name);
        if (values.has(key)) {
          return values.get(key);
        }
        return parent ? parent.get(key) : undefined;
      },
      has(name) {
        const key = normalizeName(name);
        return values.has(key) || !!(parent && typeof parent.has === "function" && parent.has(key));
      },
      assign(name, value) {
        const key = normalizeName(name);
        if (!key) {
          return value;
        }
        if (values.has(key)) {
          values.set(key, value);
          const owner = this.owner();
          if (owner && (typeof owner === "object" || typeof owner === "function")) {
            owner[key] = value;
          }
          return value;
        }
        if (parent && typeof parent.assign === "function" && parent.has(key)) {
          return parent.assign(key, value);
        }
        return this.set(key, value);
      },
      toObject() {
        const out = parent ? parent.toObject() : Object.create(null);
        values.forEach((value, key) => {
          out[key] = value;
        });
        return out;
      },
      child() {
        return createScope(this, contextOwner, contextHost);
      },
      forOwner(nextOwner) {
        return createScope(this, nextOwner || contextOwner, contextHost);
      },
      owner(nextOwner) {
        if (arguments.length) {
          contextOwner = nextOwner || null;
        }
        return contextOwner || parent && typeof parent.owner === "function" && parent.owner() || null;
      },
      host(nextHost) {
        if (arguments.length) {
          contextHost = nextHost || null;
        }
        return contextHost || parent && typeof parent.host === "function" && parent.host() || null;
      }
    };
  }

  function createRenderer(options) {
    const Module = options && options.Module ? options.Module : globalScope.Module;
    const parser = createParser(Module);
    const componentDefinitions = new Map();
    const classDefinitions = new Map();
    const styleDefinitions = new Map();
    const themeDefinitions = new Map();
    const defaultThemeDefinitions = new Map();
    const transitionDefinitions = new Map();
    const mountedHosts = new WeakMap();

    function clearDefinitions() {
      componentDefinitions.clear();
      classDefinitions.clear();
      styleDefinitions.clear();
      themeDefinitions.clear();
      defaultThemeDefinitions.clear();
      transitionDefinitions.clear();
    }

    function normalizeDocument(input) {
      const object = convertWasmObject(input);
      if (!object) {
        return {
          kind: "document",
          nodes: [],
          definitions: {
            components: new Map(),
            classes: new Map(),
            styles: new Map(),
            themes: new Map(),
            defaultThemes: new Map(),
            transitions: new Map(),
            painters: new Map()
          }
        };
      }
      if (typeof object === "string") {
        if (Module && typeof Module.qhtmlParseSourceToObject === "function") {
          const parsed = convertWasmObject(Module.qhtmlParseSourceToObject(object));
          if (parsed && (parsed.kind === "document" || parsed.nodes || parsed.children)) {
            return parsed;
          }
        }
        return parser.parse(object);
      }
      if (object.kind === "document" || object.nodes || object.children) {
        return object;
      }
      return parser.parse(String(object));
    }

    function createDocument(sourceOrQdom) {
      return normalizeDocument(sourceOrQdom);
    }

    function interpolate(value, scope, thisArg) {
      return String(value == null ? "" : value).replace(/\$\{\s*([^}]+?)\s*\}/g, (_all, expression) => {
        const result = evaluateExpression(expression, scope, thisArg);
        return result == null ? "" : String(result);
      });
    }

    function createScopeProxy(scope, extras) {
      const locals = Object.assign(Object.create(null), extras || {});
      return new Proxy(locals, {
        has(target, key) {
          if (key === Symbol.unscopables) {
            return false;
          }
          return Object.prototype.hasOwnProperty.call(target, key) ||
            !!(scope && typeof scope.has === "function" && scope.has(key));
        },
        get(target, key) {
          if (key === Symbol.unscopables) {
            return undefined;
          }
          if (Object.prototype.hasOwnProperty.call(target, key)) {
            return target[key];
          }
          if (scope && typeof scope.has === "function" && scope.has(key)) {
            return scope.get(key);
          }
          return globalScope[key];
        },
        set(target, key, value) {
          if (Object.prototype.hasOwnProperty.call(target, key)) {
            target[key] = value;
            return true;
          }
          if (scope && typeof scope.has === "function" && scope.has(key)) {
            scope.assign(key, value);
            return true;
          }
          target[key] = value;
          return true;
        }
      });
    }

    function scopedQuery(thisArg, selector) {
      const root = thisArg && thisArg.__qhtmlRoot ? thisArg.__qhtmlRoot : document;
      const matches = Array.from(root.querySelectorAll(selector));
      return matches.length === 1 ? matches[0] : matches;
    }

    function evaluateExpression(expression, scope, thisArg) {
      const proxy = createScopeProxy(scope, {
        component: thisArg && thisArg.component ? thisArg.component : thisArg,
        $: (selector) => scopedQuery(thisArg, selector)
      });
      return Function("__qhtmlScope", `with (__qhtmlScope) { return (${expression}); }`).call(thisArg || null, proxy);
    }

    function executeScript(body, scope, thisArg, args) {
      const proxy = createScopeProxy(scope, {
        component: thisArg && thisArg.component ? thisArg.component : thisArg,
        event: args && args.event ? args.event : undefined,
        $: (selector) => scopedQuery(thisArg, selector)
      });
      return Function("__qhtmlScope", `with (__qhtmlScope) { ${String(body || "")} }`).call(thisArg || null, proxy);
    }

    function evaluateQVarBody(body, scope, thisArg) {
      return evaluateExpression(normalizeName(body), scope, thisArg);
    }

    function exportQVar(node, scope, thisArg) {
      const name = normalizeName(node && node.name);
      if (!name || !scope || typeof scope.set !== "function") {
        return undefined;
      }
      const value = evaluateQVarBody(node.body || "", scope, thisArg);
      scope.set(name, value);
      const owner = typeof scope.owner === "function" ? scope.owner() : thisArg;
      if (owner && (typeof owner === "object" || typeof owner === "function")) {
        owner[name] = value;
      }
      return value;
    }

    function switchKeyValue(key) {
      const text = normalizeName(key);
      return text === "*" ? text : parseScalar(text);
    }

    function exportQSwitch(node, scope, thisArg) {
      const name = normalizeName(node && node.name);
      if (!name || !scope || typeof scope.set !== "function") {
        return undefined;
      }
      const cases = (node.cases || []).map((entry) => ({
        key: switchKeyValue(entry.key),
        value: entry.value
      }));
      const switchFunction = function qhtmlWasmSwitch(value) {
        let fallback = null;
        for (const entry of cases) {
          if (entry.key === "*") {
            fallback = entry;
            continue;
          }
          if (Object.is(entry.key, value) || String(entry.key) === String(value)) {
            return evaluateExpression(normalizeName(entry.value), scope, thisArg);
          }
        }
        return fallback ? evaluateExpression(normalizeName(fallback.value), scope, thisArg) : undefined;
      };
      scope.set(name, switchFunction);
      const owner = typeof scope.owner === "function" ? scope.owner() : thisArg;
      if (owner && (typeof owner === "object" || typeof owner === "function")) {
        owner[name] = switchFunction;
      }
      return switchFunction;
    }

    function executeScopedBody(body, argNames, argValues, scope, thisArg, extraValues) {
      const localNames = Array.isArray(argNames) ? argNames : splitCommaAware(argNames || "");
      const extras = {
        component: thisArg && thisArg.component ? thisArg.component : thisArg,
        $: (selector) => scopedQuery(thisArg, selector)
      };
      Object.assign(extras, extraValues || {});
      localNames.forEach((name, index) => {
        extras[name] = (argValues || [])[index];
      });
      return Function("__qhtmlScope", `with (__qhtmlScope) { ${String(body || "")} }`).call(thisArg || null, createScopeProxy(scope, extras));
    }

    function activeThemeNames(scope) {
      return scope && typeof scope.get === "function" ? scope.get("__qhtmlActiveThemes") || [] : [];
    }

    function withActiveThemes(scope, themeNames) {
      const next = scope && typeof scope.child === "function" ? scope.child() : createScope(scope);
      next.set("__qhtmlActiveThemes", activeThemeNames(scope).concat(themeNames || []), { silent: true });
      return next;
    }

    function ensureContextSignals(element) {
      if (!element || typeof element !== "object") {
        return element;
      }
      if (typeof element.contextItemAdded !== "function") {
        element.contextItemAdded = createSignalFunction(element, "contextItemAdded");
      }
      if (typeof element.contextItemAded !== "function") {
        element.contextItemAded = createSignalFunction(element, "contextItemAded");
      }
      return element;
    }

    function attachQdom(element, node, host) {
      defineHidden(element, "__qhtmlWasmNode", node);
      defineHidden(element, "__qhtmlRoot", host || element.closest && element.closest("q-html") || null);
      defineHidden(element, "__qhtmlUuid", qdomUuid(node, "element"));
      ensureContextSignals(element);
      element.qdom = function qhtmlWasmElementQdom() {
        return node;
      };
      return element;
    }

    function appendRendered(parent, rendered) {
      if (!rendered) {
        return;
      }
      if (Array.isArray(rendered)) {
        for (const child of rendered) {
          appendRendered(parent, child);
        }
      } else {
        parent.appendChild(rendered);
      }
    }

    function mergeClassNames(element, classes) {
      const incoming = Array.isArray(classes) ? classes : splitWhitespace(classes || "");
      if (!incoming.length) {
        return;
      }
      const current = splitWhitespace(element.getAttribute ? element.getAttribute("class") : element.attributes && element.attributes.class || "");
      for (const cls of incoming) {
        if (current.indexOf(cls) === -1) {
          current.push(cls);
        }
      }
      element.setAttribute("class", current.join(" "));
    }

    function transitionCssValue(transition) {
      if (!transition || !Array.isArray(transition.properties)) {
        return "";
      }
      const valueFor = (name, fallback) => {
        const found = transition.properties.find((entry) => normalizeName(entry.name).toLowerCase() === name);
        return normalizeName(found && found.value) || fallback;
      };
      const property = valueFor("property", "all");
      const duration = valueFor("duration", "0");
      const timing = valueFor("timing", "ease");
      const delay = valueFor("delay", "0");
      const durationCss = /^\d+(?:\.\d+)?$/.test(duration) ? `${duration}ms` : duration;
      const delayCss = /^\d+(?:\.\d+)?$/.test(delay) ? `${delay}ms` : delay;
      return `${property} ${durationCss} ${timing} ${delayCss}`;
    }

    function applyStyleDefinition(element, style) {
      if (!style) {
        return;
      }
      mergeClassNames(element, style.classes || []);
      appendStyleText(element, style.declarations || {});
      const transitions = [];
      for (const transitionName of style.transitions || []) {
        const transition = transitionDefinitions.get(transitionName);
        const css = transitionCssValue(transition);
        if (css) {
          transitions.push(css);
        }
      }
      if (transitions.length) {
        appendStyleText(element, { transition: transitions.join(", ") });
      }
      if (style.painters && style.painters.background && !((style.declarations || {}).background || (style.declarations || {}).backgroundColor)) {
        appendStyleText(element, { background: "linear-gradient(90deg, #2563eb 0 50%, #f97316 50% 100%)" });
      }
    }

    function applyStyleRefs(element, styleRefs) {
      for (const ref of styleRefs || []) {
        if (!ref) {
          continue;
        }
        if (typeof ref === "object") {
          applyStyleDefinition(element, ref);
        } else {
          applyStyleDefinition(element, styleDefinitions.get(ref));
        }
      }
    }

    function themeByName(name) {
      return themeDefinitions.get(name) || defaultThemeDefinitions.get(name) || null;
    }

    function collectThemeRules(themeName, visited) {
      const key = normalizeName(themeName);
      if (!key || visited.has(key)) {
        return [];
      }
      visited.add(key);
      const theme = themeByName(key);
      if (!theme) {
        return [];
      }
      const rules = [];
      for (const include of theme.includes || []) {
        rules.push(...collectThemeRules(include, visited));
      }
      rules.push(...(theme.rules || []));
      return rules;
    }

    function applyThemeRules(element, themeNames) {
      for (const themeName of themeNames || []) {
        const rules = collectThemeRules(themeName, new Set());
        for (const rule of rules) {
          if (selectorMatchesElement(rule.selector, element)) {
            applyStyleRefs(element, rule.styleRefs || []);
          }
        }
      }
    }

    function renderNode(inputNode, scope, host, componentElement) {
      const node = convertWasmObject(inputNode);
      if (!node) {
        return null;
      }
      const kind = String(node.kind || node.nodeKind || node.type || "").toLowerCase();
      if (kind === "document") {
        const fragment = document.createDocumentFragment();
        for (const child of node.nodes || node.children || []) {
          appendRendered(fragment, renderNode(child, scope, host, componentElement));
        }
        return fragment;
      }
      if (kind === NODE_COMPONENT || kind === "struct-definition" || kind === "template") {
        const id = node.componentId || node.classId || node.templateId || node.name;
        if (id) {
          componentDefinitions.set(id, node);
        }
        return null;
      }
      if (kind === "class-definition") {
        const id = node.classId || node.componentId || node.name;
        if (id) {
          classDefinitions.set(id, node);
          if (scope && typeof scope.set === "function") {
            scope.set(id, createClassConstructor(id, scope, host));
          }
        }
        return null;
      }
      if (kind === NODE_STYLE_DEFINITION) {
        if (node.name) {
          styleDefinitions.set(node.name, node);
        }
        return null;
      }
      if (kind === NODE_TRANSITION_DEFINITION) {
        if (node.name) {
          transitionDefinitions.set(node.name, node);
        }
        return null;
      }
      if (kind === NODE_THEME_DEFINITION) {
        if (node.name) {
          (node.isDefault ? defaultThemeDefinitions : themeDefinitions).set(node.name, node);
        }
        return null;
      }
      if (kind === NODE_THEME_SCOPE) {
        const fragment = document.createDocumentFragment();
        const themedScope = withActiveThemes(scope, node.themeNames || []);
        for (const child of node.children || []) {
          appendRendered(fragment, renderNode(child, themedScope, host, componentElement));
        }
        return fragment;
      }
      if (kind === NODE_STATE_MACHINE) {
        return renderStateMachine(node, scope, host);
      }
      if (kind === NODE_COMPONENT_INSTANCE || (node.componentId && componentDefinitions.has(node.componentId))) {
        return renderComponentInstance(node, scope, host);
      }
      if (kind === "class-instance" || (node.classId && classDefinitions.has(node.classId))) {
        return renderClassInstance(node, scope, host);
      }
      if (kind === NODE_TEXT) {
        return document.createTextNode(interpolate(node.value || node.text || node.textContent || "", scope, componentElement || host));
      }
      if (kind === NODE_HTML || kind === "html") {
        const template = document.createElement("template");
        template.innerHTML = interpolate(node.html || node.value || "", scope, componentElement || host);
        return template.content.cloneNode(true);
      }
      if (kind === NODE_SLOT) {
        return renderSlot(node, scope, host, componentElement);
      }
      if (kind === NODE_Q_VAR) {
        exportQVar(node, scope, componentElement || host);
        return null;
      }
      if (kind === NODE_Q_SWITCH) {
        exportQSwitch(node, scope, componentElement || host);
        return null;
      }
      if (kind === NODE_SCRIPT) {
        if (node.scriptType === "style") {
          const style = document.createElement("style");
          style.textContent = node.body || "";
          return style;
        }
        if (String(node.name || "").toLowerCase() === "q-connect") {
          applyQConnect(node.body, scope, componentElement || host);
          return null;
        }
        if (!node.isLifecycle && String(node.name || "").toLowerCase() === "q-script") {
          const result = executeScript(node.body, scope, componentElement || host);
          return typeof result === "string" && /[{]/.test(result)
            ? renderNode(parser.parse(result), scope, host, componentElement)
            : document.createTextNode(result == null ? "" : String(result));
        }
        if (node.scriptType === "qhtml-call") {
          const result = evaluateExpression(node.body, scope, componentElement || host);
          return renderNode(parser.parse(result == null ? "" : String(result)), scope, host, componentElement);
        }
        return null;
      }
      const tagName = node.tagName || selectorTag(node.selector || node.meta && node.meta.source || "div");
      const element = attachQdom(document.createElement(tagName), node, host);
      if (componentElement) {
        defineHidden(element, "component", componentElement);
      }
      const attributes = node.attributes || {};
      Object.keys(attributes).forEach((name) => {
        element.setAttribute(name, interpolate(attributes[name], scope, componentElement || element));
      });
      applyStyleRefs(element, node.styleRefs || []);
      applyThemeRules(element, activeThemeNames(scope));
      const properties = node.properties || {};
      Object.keys(properties).forEach((name) => {
        const value = properties[name];
        if (!(name in attributes)) {
          element.setAttribute(name, interpolate(value, scope, componentElement || element));
        }
      });
      for (const child of node.children || node.nodes || []) {
        appendRendered(element, renderNode(child, scope, host, componentElement || element));
      }
      wireElementScripts(element, node, scope, host);
      return element;
    }

    function renderSlot(node, scope, host, componentElement) {
      const name = node.name || "default";
      const slots = componentElement && componentElement.__qhtmlSlots;
      const fill = slots && (slots.get(name) || slots.get("default"));
      const fragment = document.createDocumentFragment();
      for (const child of fill || node.children || []) {
        appendRendered(fragment, renderNode(child, scope, host, componentElement));
      }
      return fragment;
    }

    function createSignalFunction(element, name) {
      const signalName = normalizeName(name);
      const signal = function qhtmlWasmSignal(...args) {
        element.dispatchEvent(new CustomEvent(signalName, {
          bubbles: true,
          detail: { args, value: args[0] }
        }));
        return element;
      };
      signal.connect = function connect(callback) {
        element.addEventListener(signalName, (event) => callback.apply(element, event.detail && event.detail.args || [event.detail]));
        return 1;
      };
      return signal;
    }

    function eventArguments(event, parameters) {
      const detail = event && event.detail ? event.detail : {};
      const args = Array.isArray(detail.args) ? detail.args : typeof detail.value !== "undefined" ? [detail.value] : [detail];
      const names = Array.isArray(parameters) ? parameters : splitCommaAware(parameters || "");
      if (!names.length) {
        return args;
      }
      return names.map((_name, index) => args[index]);
    }

    function addComponentEventHandler(element, eventName, script, scope) {
      const name = normalizeName(eventName);
      if (!name) {
        return;
      }
      element.addEventListener(name, (event) => {
        const argNames = splitCommaAware(script.parameters || "");
        const argValues = eventArguments(event, argNames);
        executeScopedBody(script.body, argNames, argValues, scope, element, { event });
      });
    }

    function eventNameFromHandler(scriptName) {
      const name = normalizeName(scriptName);
      if (!/^on/i.test(name) || name.toLowerCase() === "onready") {
        return "";
      }
      return name.slice(2);
    }

    function wireComponentLifecycleHandlers(element, scripts, scope) {
      for (const script of scripts || []) {
        const eventName = eventNameFromHandler(script.name);
        if (!eventName) {
          continue;
        }
        addComponentEventHandler(element, eventName, script, scope);
      }
    }

    function parseEndpointExpression(path) {
      const text = normalizeName(path);
      const match = /^(.+?)\s*(?:\((.*)\))?$/.exec(text);
      const memberPath = normalizeName(match && match[1] || text);
      return {
        memberPath,
        parameters: splitCommaAware(match && match[2] || "")
      };
    }

    function resolveEndpoint(path, scope, thisObject) {
      const endpoint = parseEndpointExpression(path);
      const parts = endpoint.memberPath.split(".").filter(Boolean);
      if (!parts.length || !scope || typeof scope.get !== "function") {
        return null;
      }
      const root = parts.shift();
      let target = root === "this" ? thisObject : scope.get(root);
      while (target && parts.length > 1) {
        target = target[parts.shift()];
      }
      return {
        object: target,
        member: parts.shift() || "",
        parameters: endpoint.parameters
      };
    }

    function applyQConnect(body, scope, thisObject) {
      const tokens = normalizeName(body).replace(/\s*->\s*/g, " ").split(/\s+/).filter(Boolean);
      if (tokens.length < 2) {
        return false;
      }
      const sender = resolveEndpoint(tokens[0], scope, thisObject);
      const receiver = resolveEndpoint(tokens[1], scope, thisObject);
      if (!sender || !sender.object || !sender.member || !receiver || !receiver.object || !receiver.member) {
        return false;
      }
      const handler = typeof receiver.object[receiver.member] === "function"
        ? receiver.object[receiver.member].bind(receiver.object)
        : null;
      if (!handler) {
        return false;
      }
      const signal = sender.object[sender.member];
      if (signal && typeof signal.connect === "function") {
        signal.connect(handler);
        return true;
      }
      if (sender.object && typeof sender.object.addEventListener === "function") {
        sender.object.addEventListener(sender.member, (event) => {
          const detail = event && event.detail ? event.detail : {};
          const args = Array.isArray(detail.args) ? detail.args : [detail.value];
          handler(...args);
        });
        return true;
      }
      return false;
    }

    function clearElementChildren(element) {
      while (element.firstChild) {
        element.removeChild(element.firstChild);
      }
    }

    function stateByName(node, name) {
      const target = normalizeName(name);
      return (node.states || []).find((entry) => normalizeName(entry.name) === target) || null;
    }

    function createStateRenderScope(parentScope, element, host) {
      const stateScope = createScope(parentScope, element, host);
      const baseSet = stateScope.set;
      stateScope.set = function setStateScopedName(name, value, options) {
        const result = baseSet.call(this, name, value, options);
        const key = normalizeName(name);
        if (key && value && (typeof value === "object" || typeof value === "function")) {
          element[key] = value;
        }
        return result;
      };
      return stateScope;
    }

    function renderStateMachineState(element, node, scope, host, stateName) {
      const active = stateByName(node, stateName);
      clearElementChildren(element);
      if (!active) {
        return false;
      }
      const stateScope = createStateRenderScope(scope, element, host);
      for (const child of active.children || []) {
        appendRendered(element, renderNode(child, stateScope, host, element));
      }
      return true;
    }

    function defineStateMachineStateProperty(element, node, scope, host, initialState) {
      let current = initialState;
      Object.defineProperty(element, "state", {
        configurable: true,
        enumerable: true,
        get() {
          return current;
        },
        set(value) {
          const next = normalizeName(value);
          if (!next || next === current) {
            return;
          }
          if (!renderStateMachineState(element, node, scope, host, next)) {
            return;
          }
          const previous = current;
          current = next;
          element.dispatchEvent(new CustomEvent("statechanged", {
            bubbles: true,
            detail: { args: [next], value: next, previous }
          }));
          element.dispatchEvent(new CustomEvent("stateChanged", {
            bubbles: true,
            detail: { args: [next], value: next, previous }
          }));
        }
      });
    }

    function renderStateMachine(node, scope, host) {
      const element = attachQdom(document.createElement("q-state-machine"), node, host);
      const machineScope = scope.forOwner ? scope.forOwner(element) : scope.child();
      const attrs = selectorAttributes((node.name || "") + (node.selector || ""));
      Object.keys(attrs).forEach((name) => element.setAttribute(name, attrs[name]));
      element.component = element;
      element._keywordType = "q-state-machine";

      const properties = Object.assign({}, node.propertyDefaults || {});
      Object.keys(properties).forEach((name) => defineComponentProperty(element, name, properties[name]));
      for (const prop of node.properties || []) {
        if (!Object.prototype.hasOwnProperty.call(properties, prop)) {
          defineComponentProperty(element, prop, undefined);
        }
      }
      for (const signal of node.signals || []) {
        const name = typeof signal === "string" ? signal : signal.name;
        if (name && typeof element[name] !== "function") {
          element[name] = createSignalFunction(element, name);
        }
      }
      Object.keys(node.methods || {}).forEach((name) => {
        const method = node.methods[name];
        element[name] = function qhtmlWasmStateMachineMethod(...args) {
          return executeScopedBody(method.body, method.parameters || [], args, machineScope, element);
        };
      });
      const initialState = node.initialState || node.states && node.states[0] && node.states[0].name || "";
      defineStateMachineStateProperty(element, node, machineScope, host, initialState);
      bindComponentScopeProperties(machineScope, element, new Set([...(node.properties || []), "state"]));
      wireComponentConnections(element, node.lifecycleScripts || [], machineScope);
      wireComponentLifecycleHandlers(element, node.lifecycleScripts || [], machineScope);

      const alias = node.name || node.alias || node.meta && node.meta.instanceAlias;
      if (alias) {
        machineScope.set(alias, element);
        scope.set(alias, element);
      }

      if (initialState) {
        renderStateMachineState(element, node, machineScope, host, initialState);
      }
      queueLifecycle(element, node.lifecycleScripts || [], machineScope, host);
      return element;
    }

    function defineComponentProperty(element, name, initialValue) {
      let current = initialValue;
      Object.defineProperty(element, name, {
        configurable: true,
        enumerable: true,
        get() {
          return current;
        },
        set(value) {
          const previous = current;
          current = value;
          if (!Object.is(previous, value)) {
            element.dispatchEvent(new CustomEvent(`${name}Changed`, {
              bubbles: true,
              detail: { args: [value], value, previous }
            }));
            element.dispatchEvent(new CustomEvent(`${String(name).toLowerCase()}changed`, {
              bubbles: true,
              detail: { args: [value], value, previous }
            }));
          }
        }
      });
    }

    function bindComponentScopeProperties(scope, element, propertyNames) {
      for (const name of propertyNames) {
        const key = normalizeName(name);
        if (!key) {
          continue;
        }
        scope.set(key, element[key], { silent: true });
      }
    }

    function wireComponentConnections(element, scripts, scope) {
      for (const script of scripts || []) {
        if (script && script.isQConnect) {
          applyQConnect(script.body, scope, element);
        }
      }
    }

    function renderComponentInstance(node, scope, host) {
      const componentId = node.componentId || node.tagName;
      const definition = componentDefinitions.get(componentId);
      const element = attachQdom(document.createElement((node.tagName || componentId || "q-component").toLowerCase()), node, host);
      const componentScope = scope.forOwner ? scope.forOwner(element) : scope.child();
      const props = Object.assign({}, definition && definition.propertyDefaults || {}, node.props || node.properties || {});
      const propertyNames = new Set(Object.keys(props));
      element.component = element;
      element.__qhtmlSlots = node.slotNodes instanceof Map ? node.slotNodes : new Map();
      Object.keys(props).forEach((name) => defineComponentProperty(element, name, props[name]));
      if (definition) {
        for (const prop of definition.properties || []) {
          propertyNames.add(prop);
          if (!Object.prototype.hasOwnProperty.call(props, prop)) {
            defineComponentProperty(element, prop, undefined);
          }
        }
        for (const signal of definition.signals || []) {
          const name = typeof signal === "string" ? signal : signal.name;
          if (name && typeof element[name] !== "function") {
            element[name] = createSignalFunction(element, name);
          }
        }
        Object.keys(definition.methods || {}).forEach((name) => {
          const method = definition.methods[name];
          if (method && !method.isConstructor) {
            element[name] = function qhtmlWasmComponentMethod(...args) {
              return executeScopedBody(method.body, method.parameters || [], args, componentScope, element);
            };
          }
        });
      }
      bindComponentScopeProperties(componentScope, element, propertyNames);
      wireComponentConnections(element, definition && definition.lifecycleScripts || [], componentScope);
      wireComponentLifecycleHandlers(element, definition && definition.lifecycleScripts || [], componentScope);
      const alias = node.alias || node.meta && node.meta.instanceAlias;
      if (alias) {
        componentScope.set(alias, element);
        scope.set(alias, element);
      }
      const attrs = Object.assign({}, node.attributes || {});
      Object.keys(attrs).forEach((name) => element.setAttribute(name, interpolate(attrs[name], componentScope, element)));
      for (const child of definition && definition.templateNodes || node.children || []) {
        appendRendered(element, renderNode(child, componentScope, host, element));
      }
      if (!definition) {
        for (const child of node.children || []) {
          appendRendered(element, renderNode(child, componentScope, host, element));
        }
      }
      queueLifecycle(element, definition && definition.lifecycleScripts || [], componentScope, host);
      return element;
    }

    function evaluateArguments(source, scope, thisArg) {
      return splitCommaAware(source || "").map((expression) => evaluateExpression(expression, scope, thisArg));
    }

    function createClassQObject(instance) {
      return {
        emit(signalName, ...args) {
          const signal = instance && instance[signalName];
          if (typeof signal === "function") {
            signal.apply(instance, args);
          } else if (instance && typeof instance.dispatchEvent === "function") {
            instance.dispatchEvent(new CustomEvent(signalName, {
              bubbles: true,
              detail: { args, value: args[0] }
            }));
          }
          return instance;
        }
      };
    }

    function createClassConstructor(classId, scope, host) {
      const className = normalizeName(classId);
      const constructor = function qhtmlWasmClassConstructor(...args) {
        return renderClassInstance({
          kind: "class-instance",
          classId: className,
          tagName: className,
          argumentValues: args,
          children: [],
          props: {}
        }, scope, host);
      };
      const definition = classDefinitions.get(className);
      if (definition) {
        defineHidden(constructor, "__qhtmlWasmNode", definition);
        defineHidden(constructor, "__qhtmlUuid", qdomUuid(definition, "class-definition"));
      }
      return constructor;
    }

    function renderClassInstance(node, scope, host) {
      const classId = node.classId || node.tagName;
      const definition = classDefinitions.get(classId);
      const element = attachQdom(document.createElement((classId || "q-class").toLowerCase()), node, host);
      const classScope = scope.forOwner ? scope.forOwner(element) : scope.child();
      element.component = element;
      element._keywordType = "q-class";
      element.qobject = function qhtmlWasmClassQObject() {
        if (!element.__qhtmlQObject) {
          defineHidden(element, "__qhtmlQObject", createClassQObject(element));
        }
        return element.__qhtmlQObject;
      };
      if (definition) {
        for (const signal of definition.signals || []) {
          const name = typeof signal === "string" ? signal : signal.name;
          if (name && typeof element[name] !== "function") {
            element[name] = createSignalFunction(element, name);
          }
        }
        Object.keys(definition.methods || {}).forEach((name) => {
          const method = definition.methods[name];
          if (method && !method.isConstructor) {
            element[name] = function qhtmlWasmClassMethod(...args) {
              return executeScopedBody(method.body, method.parameters || [], args, classScope, element);
            };
          }
        });
      }
      Object.keys(node.props || {}).forEach((name) => {
        element[name] = node.props[name];
      });
      const alias = node.alias || node.meta && node.meta.instanceAlias;
      if (alias) {
        classScope.set(alias, element);
        scope.set(alias, element);
      }
      if (definition) {
        const constructor = Object.keys(definition.methods || {})
          .map((name) => definition.methods[name])
          .find((method) => method && method.isConstructor);
        if (constructor) {
          const args = Array.isArray(node.argumentValues)
            ? node.argumentValues
            : evaluateArguments(node.argumentSource || "", scope, element);
          executeScopedBody(constructor.body, constructor.parameters || [], args, classScope, element);
        }
      }
      for (const child of node.children || []) {
        appendRendered(element, renderNode(child, classScope, host, element));
      }
      return element;
    }

    function wireElementScripts(element, node, scope, host) {
      for (const child of node.children || []) {
        if (!child || child.kind !== NODE_SCRIPT) {
          continue;
        }
        const name = String(child.name || "").toLowerCase();
        if (name.startsWith("on") && name !== "onready") {
          const eventName = name.slice(2);
          element.addEventListener(eventName, (event) => executeScript(child.body, scope, element, { event }));
        }
      }
      queueLifecycle(element, (node.children || []).filter((child) => child && child.kind === NODE_SCRIPT && child.isLifecycle), scope, host);
    }

    function queueLifecycle(element, scripts, scope, host) {
      const readyScripts = (scripts || []).filter((script) => String(script.name || "").toLowerCase() === "onready");
      if (!readyScripts.length) {
        return;
      }
      requestAnimationFrame(() => {
        for (const script of readyScripts) {
          executeScript(script.body, scope, element, { host });
        }
      });
    }

    function mountQHtmlElement(hostElement) {
      if (!hostElement) {
        return null;
      }
      const source = hostElement.textContent || "";
      const documentNode = parser.parse(source);
      defineHidden(hostElement, "__qhtmlWasmNode", documentNode);
      defineHidden(hostElement, "__qhtmlUuid", qdomUuid(documentNode, "document"));
      ensureContextSignals(hostElement);
      const scope = createScope(null, hostElement, hostElement);
      const fragment = document.createDocumentFragment();
      clearDefinitions();
      hostElement.textContent = "";
      for (const node of documentNode.nodes || []) {
        if (node.kind === NODE_COMPONENT) {
          const id = node.componentId;
          if (id) {
            componentDefinitions.set(id, node);
          }
          continue;
        }
        if (node.kind === "class-definition") {
          const id = node.classId || node.componentId;
          if (id) {
            classDefinitions.set(id, node);
            scope.set(id, createClassConstructor(id, scope, hostElement));
          }
          continue;
        }
        appendRendered(fragment, renderNode(node, scope, hostElement, null));
      }
      hostElement.appendChild(fragment);
      hostElement.qdom = function qhtmlWasmHostQdom() {
        return documentNode;
      };
      hostElement.update = function qhtmlWasmHostUpdate() {
        return mountQHtmlElement(hostElement);
      };
      mountedHosts.set(hostElement, documentNode);
      hostElement.dispatchEvent(new CustomEvent("QHTMLContentLoaded", {
        bubbles: true,
        detail: { qdom: documentNode, renderer: api }
      }));
      return hostElement;
    }

    function mountAll(root) {
      const base = root || document;
      const hosts = base.matches && base.matches("q-html")
        ? [base]
        : Array.from(base.querySelectorAll ? base.querySelectorAll("q-html") : []);
      return hosts.map(mountQHtmlElement);
    }

    function createFacade() {
      return {
        parse: parser.parse,
        renderNode,
        mountQHtmlElement,
        mountAll,
        createDocument
      };
    }

    const api = {
      createDocument,
      parse: parser.parse,
      renderNode,
      mountQHtmlElement,
      mountAll,
      createFacade,
      qdomInterface: {
        createDocument,
        parse: parser.parse,
        mountedHosts
      }
    };
    return api;
  }

  globalScope.QHTMLWasmRenderer = {
    create: createRenderer
  };
})();
