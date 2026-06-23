(function () {
  "use strict";

  const globalScope = typeof globalThis !== "undefined" ? globalThis : window;

  function normalizeTagName(value, fallback) {
    const tag = String(value || fallback || "div").trim();
    return tag ? tag.toLowerCase() : "div";
  }

  function parseObject(value) {
    if (!value) {
      return {};
    }
    if (typeof value === "object") {
      return value;
    }
    try {
      return JSON.parse(value);
    } catch (_error) {
      return {};
    }
  }

  function parseMeta(object) {
    return object && object.meta && typeof object.meta === "object" ? object.meta : {};
  }

  function metaType(object) {
    const meta = parseMeta(object);
    return String(meta.type || object.type || "").trim();
  }

  function readAlias(object) {
    const meta = parseMeta(object);
    return String(object.alias || meta.__qhtmlInstanceAlias || object.name || "").trim();
  }

  function collectText(node, qdomInterface) {
    if (!node) {
      return "";
    }
    const object = qdomInterface.nodeObject(node);
    const kind = object.kind || "";
    if (kind === "text") {
      return String(object.value || "");
    }
    return qdomInterface.children(node).map((child) => collectText(child, qdomInterface)).join(" ").trim();
  }

  function createRenderer(qdomInterface) {
    if (!qdomInterface) {
      throw new Error("QHTML WASM renderer requires a QDom interface");
    }

    const styleDefinitions = new Map();
    const themeDefinitions = new Map();
    const defaultThemeDefinitions = new Map();
    const transitionDefinitions = new Map();
    const painterDefinitions = new Map();
    const componentDefinitions = new Map();
    const painterRegistrations = new Map();
    let anonymousStyleCounter = 0;

    function childContext(parentContext, owner, overrides) {
      return qdomInterface.createContext(parentContext, owner, overrides || {});
    }

    function normalizeResourceKey(value) {
      return String(value || "").trim().toLowerCase();
    }

    function normalizeCssPropertyName(rawProperty) {
      const value = String(rawProperty || "").trim();
      if (!value) {
        return "";
      }
      if (value.indexOf("-") !== -1) {
        return value.toLowerCase();
      }
      return value.replace(/[A-Z]/g, (letter) => "-" + letter.toLowerCase());
    }

    function splitResourceNames(value) {
      return String(value || "").trim().split(/[\s,]+/).map((entry) => entry.trim()).filter(Boolean);
    }

    function isPropertyReference(value) {
      return /^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)+$/.test(String(value || "").trim());
    }

    function resolvePropertyValue(value, context, element) {
      if (typeof value === "string" && isPropertyReference(value)) {
        return qdomInterface.createPropertyReference(value, context, element);
      }
      return value;
    }

    function exposeInstanceProperties(element, contextValue, names) {
      for (const name of names) {
        if (!name) {
          continue;
        }
        Object.defineProperty(element, name, {
          configurable: true,
          enumerable: true,
          get() {
            return contextValue[name];
          },
          set(value) {
            contextValue[name] = value;
          }
        });
      }
    }

    function registerInstancePropertyHandles(context, contextValue, names) {
      for (const name of names) {
        if (!name) {
          continue;
        }
        qdomInterface.registerAlias(context, name, qdomInterface.createPropertyHandle(contextValue, name));
      }
    }

    function collectDefinitionSignalNames(definitionNode) {
      const names = [];
      for (const child of qdomInterface.children(definitionNode)) {
        const object = qdomInterface.nodeObject(child);
        if ((object.kind || "") !== "script-rule") {
          continue;
        }
        if (metaType(object) !== "SignalDeclaration") {
          continue;
        }
        const name = String(object.name || "").trim();
        if (name && names.indexOf(name) === -1) {
          names.push(name);
        }
      }
      return names;
    }

    function mergeSignalNames(target, source) {
      for (const entry of Array.isArray(source) ? source : []) {
        const name = typeof entry === "string"
          ? entry
          : entry && typeof entry === "object"
            ? entry.name || entry.signalId || entry.signalName
            : "";
        const key = String(name || "").trim();
        if (key && target.indexOf(key) === -1) {
          target.push(key);
        }
      }
      return target;
    }

    function setBackendSignalsBlocked(backend, blocked) {
      if (!backend || typeof backend.blockSignals !== "function") {
        return false;
      }
      return backend.blockSignals(blocked === true);
    }

    function defineHiddenValue(target, name, value) {
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

    function tagKeywordType(target, keywordType) {
      const value = String(keywordType || "").trim();
      if (!target || !value) {
        return target;
      }
      defineHiddenValue(target, "_keywordtype", value);
      defineHiddenValue(target, "_keywordType", value);
      defineHiddenValue(target, "__qhtmlKeywordType", value);
      return target;
    }

    function attachDeclaredSignal(target, signalName, node) {
      const signal = String(signalName || "").trim();
      if (!target || !signal) {
        return target;
      }
      const existing = target[signal];
      if (typeof existing === "function" && existing.__qhtmlSignalFunction === true) {
        return target;
      }
      const signalFunction = function qhtmlWasmDeclaredSignal(payload) {
        const facade = typeof target.qdom === "function"
          ? target.qdom()
          : node && typeof qdomInterface.createFacade === "function"
            ? qdomInterface.createFacade(node)
            : null;
        if (facade && typeof facade.emit === "function") {
          facade.emit(signal, payload);
        } else if (typeof target.emit === "function") {
          target.emit(signal, payload);
        }
        return target;
      };
      signalFunction.connect = function connectQhtmlWasmDeclaredSignal(callback) {
        if (typeof target.connect === "function") {
          return target.connect(signal, callback);
        }
        const facade = typeof target.qdom === "function" ? target.qdom() : null;
        return facade && typeof facade.connect === "function" ? facade.connect(signal, callback) : 0;
      };
      signalFunction.disconnect = function disconnectQhtmlWasmDeclaredSignal(connectionId) {
        if (typeof target.disconnect === "function") {
          return target.disconnect(connectionId);
        }
        const facade = typeof target.qdom === "function" ? target.qdom() : null;
        return facade && typeof facade.disconnect === "function" ? facade.disconnect(connectionId) : false;
      };
      signalFunction.emit = function emitQhtmlWasmDeclaredSignal(payload) {
        return signalFunction(payload);
      };
      defineHiddenValue(signalFunction, "__qhtmlSignalFunction", true);
      defineHiddenValue(signalFunction, "__qhtmlSignalName", signal);
      target[signal] = signalFunction;
      return target;
    }

    function attachDeclaredSignals(targets, signalNames, node) {
      const list = Array.isArray(targets) ? targets : [targets];
      for (const target of list) {
        for (const signalName of Array.isArray(signalNames) ? signalNames : []) {
          attachDeclaredSignal(target, signalName, node);
        }
      }
    }

    function createClassMethodScope(instance) {
      const scope = Object.create(null);
      if (!instance || (typeof instance !== "object" && typeof instance !== "function")) {
        return scope;
      }
      for (const name of Object.keys(instance)) {
        if (typeof instance[name] === "function") {
          scope[name] = instance[name].bind(instance);
        }
      }
      return scope;
    }

    function compileClassFunction(entry, context) {
      const body = String(entry && entry.body || "");
      const parameters = String(entry && entry.parameters || "");
      return function qhtmlWasmRuntimeClassFunction() {
        return qdomInterface.executeScript(
          body,
          context,
          this,
          createClassMethodScope(this),
          Array.from(arguments),
          parameters
        );
      };
    }

    function extractClassSignals(object) {
      const meta = parseMeta(object);
      const rawMembers = Array.isArray(meta.__qhtmlClassRawMembers) ? meta.__qhtmlClassRawMembers : [];
      const body = [String(meta.__qhtmlClassBody || ""), ...rawMembers.map((entry) => String(entry || ""))].join("\n");
      const signals = [];
      mergeSignalNames(signals, object && object.signals);
      mergeSignalNames(signals, object && object.signalDeclarations);
      body.replace(/\bq-signal\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*(?:\(([^)]*)\))?/g, (_match, name) => {
        if (name && signals.indexOf(name) === -1) {
          signals.push(name);
        }
        return _match;
      });
      return signals;
    }

    function collectClassSignalNames(definitionNode, object) {
      return mergeSignalNames(extractClassSignals(object), collectDefinitionSignalNames(definitionNode));
    }

    function classConstructorFor(classId, context) {
      const name = String(classId || "").trim();
      return function qhtmlWasmClassConstructor() {
        return qdomInterface.createRuntimeClassInstance(name, "", Array.from(arguments), {});
      };
    }

    function registerClassDefinition(node, object, context, id) {
      const methods = Object.create(null);
      const methodEntries = Array.isArray(object.methods) ? object.methods : [];
      for (const entry of methodEntries) {
        const name = String(entry && entry.name || "").trim();
        if (name) {
          methods[name] = compileClassFunction(entry, context);
        }
      }
      const constructorEntry = object.constructorDefinition && typeof object.constructorDefinition === "object"
        ? object.constructorDefinition
        : null;
      qdomInterface.defineRuntimeClass(id, {
        _keywordtype: "q-class",
        _keywordType: "q-class",
        signals: collectClassSignalNames(node, object),
        methods,
        constructor: constructorEntry ? compileClassFunction(constructorEntry, context) : null
      });
      qdomInterface.registerAlias(context, id, classConstructorFor(id, context));
      qdomInterface.rememberHandle(node);
    }

    function signalNameFromHook(name) {
      const raw = String(name || "").trim();
      const body = raw.slice(2);
      const lowerBody = body.toLowerCase();
      if (lowerBody.endsWith("changed") && lowerBody.length > "changed".length) {
        return lowerBody.slice(0, -"changed".length) + "Changed";
      }
      return body;
    }

    function createBodyParser(rawBody) {
      return { text: String(rawBody || ""), index: 0 };
    }

    function skipBodyWhitespace(parser) {
      while (parser.index < parser.text.length && /[\s;]/.test(parser.text[parser.index])) {
        parser.index += 1;
      }
    }

    function readBodyIdentifier(parser) {
      skipBodyWhitespace(parser);
      const start = parser.index;
      while (parser.index < parser.text.length && !/[\s:{};,]/.test(parser.text[parser.index])) {
        parser.index += 1;
      }
      return parser.text.slice(start, parser.index).trim();
    }

    function readBalancedBodyBlock(parser) {
      skipBodyWhitespace(parser);
      if (parser.text[parser.index] !== "{") {
        return "";
      }
      parser.index += 1;
      const start = parser.index;
      let depth = 1;
      let quote = "";
      while (parser.index < parser.text.length) {
        const ch = parser.text[parser.index];
        if (quote) {
          if (ch === "\\" && parser.index + 1 < parser.text.length) {
            parser.index += 2;
            continue;
          }
          if (ch === quote) {
            quote = "";
          }
          parser.index += 1;
          continue;
        }
        if (ch === "\"" || ch === "'") {
          quote = ch;
          parser.index += 1;
          continue;
        }
        if (ch === "{") {
          depth += 1;
        } else if (ch === "}") {
          depth -= 1;
          if (depth === 0) {
            const body = parser.text.slice(start, parser.index).trim();
            parser.index += 1;
            return body;
          }
        }
        parser.index += 1;
      }
      return parser.text.slice(start).trim();
    }

    function readStyleValue(parser) {
      skipBodyWhitespace(parser);
      if (parser.text[parser.index] === ":") {
        parser.index += 1;
        const start = parser.index;
        while (parser.index < parser.text.length && !/[;\n\r}]/.test(parser.text[parser.index])) {
          parser.index += 1;
        }
        return parser.text.slice(start, parser.index).trim();
      }
      if (parser.text[parser.index] === "{") {
        return readBalancedBodyBlock(parser);
      }
      const start = parser.index;
      while (parser.index < parser.text.length && !/[;\n\r}]/.test(parser.text[parser.index])) {
        parser.index += 1;
      }
      return parser.text.slice(start, parser.index).trim();
    }

    function parsePainterMappings(rawBody) {
      const parser = createBodyParser(rawBody);
      const out = Object.create(null);
      while (parser.index < parser.text.length) {
        const slot = readBodyIdentifier(parser).toLowerCase();
        if (!slot) {
          break;
        }
        const value = readStyleValue(parser);
        if ((slot === "background" || slot === "border" || slot === "mask") && value) {
          out[slot] = splitResourceNames(value)[0] || value;
        }
      }
      return out;
    }

    function parseStyleBody(rawBody) {
      const parser = createBodyParser(rawBody);
      const style = {
        declarations: Object.create(null),
        classes: [],
        painters: Object.create(null),
        transitions: []
      };
      while (parser.index < parser.text.length) {
        const name = readBodyIdentifier(parser);
        if (!name) {
          break;
        }
        const key = name.toLowerCase();
        const value = readStyleValue(parser);
        if (key === "q-style-class") {
          style.classes.push(...splitResourceNames(value));
        } else if (key === "q-style-painter") {
          Object.assign(style.painters, parsePainterMappings(value));
        } else if (key === "q-style-transition") {
          style.transitions.push(...splitResourceNames(value));
        } else if (value) {
          style.declarations[name] = value;
        }
      }
      return style;
    }

    function normalizeTransitionTime(value, fallback) {
      const text = String(value || "").trim();
      if (!text) {
        return fallback;
      }
      return /^-?(?:\d+|\d*\.\d+)$/.test(text) ? text + "ms" : text;
    }

    function parseTransitionBody(rawBody) {
      const parser = createBodyParser(rawBody);
      const transition = { property: "", duration: "0ms", delay: "0ms", timing: "ease" };
      while (parser.index < parser.text.length) {
        const name = readBodyIdentifier(parser).toLowerCase();
        if (!name) {
          break;
        }
        const value = readStyleValue(parser);
        if (name === "property") {
          transition.property = splitResourceNames(value).join(", ") || value;
        } else if (name === "duration") {
          transition.duration = normalizeTransitionTime(value, "0ms");
        } else if (name === "delay") {
          transition.delay = normalizeTransitionTime(value, "0ms");
        } else if (name === "timing") {
          transition.timing = value || "ease";
        }
      }
      return transition;
    }

    function parsePainterBody(rawBody) {
      const parser = createBodyParser(rawBody);
      const painter = { properties: Object.create(null), onPaint: "" };
      while (parser.index < parser.text.length) {
        const name = readBodyIdentifier(parser);
        if (!name) {
          break;
        }
        const value = readStyleValue(parser);
        if (name.toLowerCase() === "onpaint") {
          painter.onPaint = value;
        } else if (value) {
          painter.properties[name] = value;
        }
      }
      return painter;
    }

    function createAnonymousStyleName() {
      anonymousStyleCounter += 1;
      return "__qhtmlWasmAnonymousStyle" + String(anonymousStyleCounter);
    }

    function parseThemeRuleBody(rawBody) {
      const parser = createBodyParser(rawBody);
      const styles = [];
      const anonymousStyles = [];
      while (parser.index < parser.text.length) {
        const name = readBodyIdentifier(parser);
        if (!name) {
          break;
        }
        skipBodyWhitespace(parser);
        if (name.toLowerCase() === "q-style" && parser.text[parser.index] === "{") {
          const styleName = createAnonymousStyleName();
          anonymousStyles.push(Object.assign({ name: styleName }, parseStyleBody(readBalancedBodyBlock(parser))));
          styles.push(styleName);
          continue;
        }
        styles.push(name);
        if (parser.text[parser.index] === "{") {
          readBalancedBodyBlock(parser);
        }
      }
      return { styles, anonymousStyles };
    }

    function parseThemeBody(rawBody) {
      const parser = createBodyParser(rawBody);
      const rules = [];
      while (parser.index < parser.text.length) {
        const selector = readBodyIdentifier(parser);
        if (!selector) {
          break;
        }
        const body = readBalancedBodyBlock(parser);
        if (!body.trim()) {
          rules.push({ include: selector });
          continue;
        }
        const parsed = parseThemeRuleBody(body);
        rules.push({ selector, styles: parsed.styles, anonymousStyles: parsed.anonymousStyles });
      }
      return rules;
    }

    function readResourceName(object) {
      const meta = parseMeta(object);
      return String(object.name || meta.name || "").trim();
    }

    function readResourceBody(object) {
      const meta = parseMeta(object);
      return String(object.body || meta.body || "").trim();
    }

    function registerStyleResource(node, object) {
      const kind = String(object.kind || "").trim();
      const name = readResourceName(object);
      if (!name) {
        return document.createComment("qhtml unnamed style resource");
      }
      const key = normalizeResourceKey(name);
      const body = readResourceBody(object);
      if (kind === "style-definition") {
        styleDefinitions.set(key, Object.assign({ name }, parseStyleBody(body)));
      } else if (kind === "theme-definition" || kind === "default-theme-definition") {
        const rules = parseThemeBody(body);
        const target = kind === "default-theme-definition" ? defaultThemeDefinitions : themeDefinitions;
        for (const rule of rules) {
          for (const anonymous of rule.anonymousStyles || []) {
            styleDefinitions.set(normalizeResourceKey(anonymous.name), anonymous);
          }
        }
        target.set(key, { name, rules });
      } else if (kind === "transition-definition") {
        transitionDefinitions.set(key, Object.assign({ name }, parseTransitionBody(body)));
      } else if (kind === "painter-definition") {
        painterDefinitions.set(key, Object.assign({ name }, parsePainterBody(body)));
      }
      qdomInterface.rememberHandle(node);
      return document.createComment("qhtml " + kind + " " + name);
    }

    function resolveStyleDefinition(name) {
      return styleDefinitions.get(normalizeResourceKey(name)) || null;
    }

    function mergeStyleNames(styleNames) {
      const merged = { declarations: Object.create(null), classes: [], painters: Object.create(null), transitions: [] };
      for (const styleName of styleNames || []) {
        const style = resolveStyleDefinition(styleName);
        if (!style) {
          continue;
        }
        merged.classes.push(...(Array.isArray(style.classes) ? style.classes : []));
        Object.assign(merged.declarations, style.declarations || {});
        Object.assign(merged.painters, style.painters || {});
        merged.transitions.push(...(Array.isArray(style.transitions) ? style.transitions : []));
      }
      return merged;
    }

    function buildTransitionCss(transitionName) {
      const transition = transitionDefinitions.get(normalizeResourceKey(transitionName));
      if (!transition || !transition.property) {
        return "";
      }
      return [transition.property, normalizeTransitionTime(transition.duration, "0ms"), String(transition.timing || "ease").trim() || "ease", normalizeTransitionTime(transition.delay, "0ms")].join(" ");
    }

    function ensurePainterRegistration(painterName, painter) {
      const key = normalizeResourceKey(painterName);
      if (!key || !painter || !painter.onPaint || !globalScope.CSS || !globalScope.CSS.paintWorklet ||
          typeof globalScope.CSS.paintWorklet.addModule !== "function" || typeof globalScope.Blob !== "function") {
        return "";
      }
      if (painterRegistrations.has(key)) {
        return painterRegistrations.get(key);
      }
      const internalName = "qhtml-wasm-" + key.replace(/[^a-z0-9_-]/g, "-");
      const source = [
        "registerPaint(" + JSON.stringify(internalName) + ", class QHtmlWasmPainter {",
        "  paint(ctx, size) {",
        "    const target = new Proxy({ width: size.width, height: size.height }, {",
        "      get(state, prop) { return prop in state ? state[prop] : (typeof ctx[prop] === 'function' ? ctx[prop].bind(ctx) : ctx[prop]); },",
        "      set(state, prop, value) { if (prop in ctx) { try { ctx[prop] = value; return true; } catch (e) {} } state[prop] = value; return true; }",
        "    });",
        "    (function(){",
        painter.onPaint,
        "    }).call(target);",
        "  }",
        "});"
      ].join("\n");
      const url = globalScope.URL.createObjectURL(new Blob([source], { type: "application/javascript" }));
      painterRegistrations.set(key, internalName);
      globalScope.CSS.paintWorklet.addModule(url).catch(() => undefined);
      return internalName;
    }

    function applyPainterSlot(element, slot, paintName) {
      if (!element || !element.style || !paintName) {
        return;
      }
      const value = "paint(" + paintName + ")";
      if (slot === "background") {
        element.style.setProperty("background-image", value);
      } else if (slot === "border") {
        element.style.setProperty("border-image-source", value);
        element.style.setProperty("border-image-slice", "1 fill");
      } else if (slot === "mask") {
        element.style.setProperty("mask-image", value);
        element.style.setProperty("-webkit-mask-image", value);
      }
    }

    function applyStyleObject(element, styleObject) {
      if (!element || element.nodeType !== 1 || !styleObject) {
        return;
      }
      for (const className of styleObject.classes || []) {
        if (className && element.classList) {
          element.classList.add(className);
        }
      }
      const transitionCss = [];
      for (const transitionName of styleObject.transitions || []) {
        const css = buildTransitionCss(transitionName);
        if (css) {
          transitionCss.push(css);
        }
      }
      if (transitionCss.length) {
        element.style.setProperty("transition", transitionCss.join(", "));
      }
      for (const [property, value] of Object.entries(styleObject.declarations || {})) {
        const cssProperty = normalizeCssPropertyName(property);
        if (cssProperty && value != null && value !== "") {
          element.style.setProperty(cssProperty, String(value));
        }
      }
      for (const [slot, painterName] of Object.entries(styleObject.painters || {})) {
        const painter = painterDefinitions.get(normalizeResourceKey(painterName));
        const paintName = ensurePainterRegistration(painterName, painter);
        applyPainterSlot(element, slot, paintName);
      }
    }

    function collectElementRoots(fragment) {
      const out = [];
      const children = fragment && fragment.childNodes ? fragment.childNodes : [];
      for (let i = 0; i < children.length; i += 1) {
        if (children[i] && children[i].nodeType === 1) {
          out.push(children[i]);
        }
      }
      return out;
    }

    function applyThemeRules(rootElement, themeName) {
      const key = normalizeResourceKey(themeName);
      const ordered = [];
      const defaults = defaultThemeDefinitions.get(key);
      const theme = themeDefinitions.get(key);
      if (defaults && Array.isArray(defaults.rules)) {
        ordered.push(...defaults.rules);
      }
      if (theme && Array.isArray(theme.rules)) {
        ordered.push(...theme.rules);
      }
      for (const rule of ordered) {
        const includeName = String(rule && rule.include || "").trim();
        if (includeName) {
          applyThemeRules(rootElement, includeName);
          continue;
        }
        const selector = String(rule && rule.selector || "").trim();
        if (!selector) {
          continue;
        }
        const targets = [];
        try {
          if (rootElement.matches && rootElement.matches(selector)) {
            targets.push(rootElement);
          }
          if (rootElement.querySelectorAll) {
            targets.push(...Array.from(rootElement.querySelectorAll(selector)));
          }
        } catch (_error) {
          continue;
        }
        const styleObject = mergeStyleNames(rule.styles || []);
        for (const target of targets) {
          applyStyleObject(target, styleObject);
        }
      }
    }

    function renderStyleInvocation(node, styleName, context) {
      const fragment = renderFragment(node, context);
      const styleObject = mergeStyleNames([styleName]);
      for (const root of collectElementRoots(fragment)) {
        applyStyleObject(root, styleObject);
      }
      return fragment;
    }

    function renderThemeInvocation(node, themeName, context) {
      const fragment = renderFragment(node, context);
      for (const root of collectElementRoots(fragment)) {
        applyThemeRules(root, themeName);
      }
      return fragment;
    }

    function applyAttributes(element, attributes, context, node) {
      const attrs = parseObject(attributes);
      for (const [name, value] of Object.entries(attrs)) {
        if (value == null || value === false) {
          continue;
        }
        const attrName = String(name || "");
        const attrValue = typeof value === "string"
          ? qdomInterface.interpolate(value, context, element)
          : value;
        if (/^on[A-Za-z]/.test(attrName) && typeof attrValue === "string") {
          const eventName = attrName.slice(2).toLowerCase();
          element.addEventListener(eventName, (event) => {
            qdomInterface.executeScript(attrValue, context, element, { event, node: qdomInterface.createContextValue(node, element) }, [event], ["event"]);
          });
          continue;
        }
        if (attrValue === true) {
          element.setAttribute(attrName, "");
        } else {
          element.setAttribute(attrName, String(attrValue));
        }
      }
    }

    function createRenderedFacade(node, element, context) {
      const facade = qdomInterface.createFacade(node);
      Object.defineProperty(facade, "appendInstance", {
        configurable: true,
        value(typeName, alias, args) {
          const child = qdomInterface.createInstance(typeName, alias || "", args || []);
          node.addChild(child);
          qdomInterface.rememberHandle(child);
          const target = element || qdomInterface.findDomByUuid(facade.uuid());
          const rendered = renderNode(child, context, target);
          target.appendChild(rendered);
          return createRenderedFacade(child, rendered && rendered.nodeType === 1 ? rendered : null, context);
        }
      });
      return facade;
    }

    function exposeQDom(element, node, context) {
      if (!element || !node || element.nodeType !== 1) {
        return element;
      }
      qdomInterface.rememberHandle(node);
      qdomInterface.rememberDom(node, element);
      if (context) {
        qdomInterface.bindContextValue(element, context);
      }
      Object.defineProperty(element, "qdom", {
        configurable: true,
        value() {
          return createRenderedFacade(node, element, context);
        }
      });
      const contextValue = qdomInterface.createContextValue(node, element);
      if (contextValue) {
        qdomInterface.bindContextValue(contextValue, context);
      }
      return element;
    }

    function appendRenderedChildren(target, node, context) {
      for (const child of qdomInterface.children(node)) {
        const rendered = renderNode(child, context, target && target.nodeType === 1 ? target : null);
        if (rendered) {
          target.appendChild(rendered);
        }
      }
    }

    function renderFragment(node, context) {
      const fragment = document.createDocumentFragment();
      appendRenderedChildren(fragment, node, context);
      return fragment;
    }

    function runScriptRule(node, object, parent, context) {
      const name = String(object.name || "").trim();
      const type = metaType(object);
      const body = String(object.body || "");
      const lowerName = name.toLowerCase();
      if (type === "SignalDeclaration") {
        const target = parent && parent.nodeType === 1 ? parent : context && context.component;
        attachDeclaredSignals([target, context && context.component], [name], node);
        return;
      }
      if ((lowerName === "onready" || lowerName === "onload" || lowerName === "onloaded") && parent && parent.nodeType === 1) {
        globalScope.requestAnimationFrame(() => {
          qdomInterface.executeScript(body, context, parent, {}, [], []);
        });
        return;
      }
      if (/^on[A-Za-z]/.test(name) && parent && parent.nodeType === 1) {
        const targetValue = context && context.component ? context.component : null;
        if (targetValue) {
          const signalName = signalNameFromHook(name);
          const facade = typeof targetValue.qdom === "function" ? targetValue.qdom() : null;
          const handle = facade && facade.handle ? facade.handle : null;
          const runSignalHandler = function qhtmlWasmDeclaredSignalHandler(payload) {
            const isPropertyEvent = payload && typeof payload === "object" &&
              String(payload.type || "") === "property" &&
              String(payload.signalName || payload.name || "") === signalName;
            const hookValue = isPropertyEvent ? payload.value : payload;
            return qdomInterface.executeScript(
              body,
              context,
              parent || targetValue,
              {
                event: isPropertyEvent ? payload : undefined,
                payload: hookValue,
                value: hookValue,
                signalName
              },
              [hookValue],
              object.parameters || ["payload"]
            );
          };
          targetValue[name] = runSignalHandler;
          targetValue[name.toLowerCase()] = runSignalHandler;
          if (handle && typeof qdomInterface.connectSignal === "function") {
            qdomInterface.connectSignal(handle, signalName, runSignalHandler);
          }
        }
        const eventName = name.slice(2).toLowerCase();
        const parameters = object.parameters || "";
        parent.addEventListener(eventName, (event) => {
          qdomInterface.executeScript(body, context, parent, { event }, [event], parameters || ["event"]);
        });
        return;
      }
      if (type === "FunctionBlock" || (name && body)) {
        const targetValue = context && context.component ? context.component : null;
        if (targetValue && name && !/^on[A-Za-z]/.test(name)) {
          targetValue[name] = function qhtmlWasmContextFunction() {
            return qdomInterface.executeScript(body, context, parent || targetValue, {}, Array.from(arguments), object.parameters || "");
          };
          qdomInterface.registerAlias(context, name, targetValue[name]);
        }
      }
    }

    function renderElement(node, object, context) {
      const element = document.createElement(normalizeTagName(object.tagName, "div"));
      exposeQDom(element, node, context);
      applyAttributes(element, object.attributes, context, node);
      if (object.textContent) {
        element.textContent = qdomInterface.interpolate(object.textContent, context, element);
      }
      for (const child of qdomInterface.children(node)) {
        const childObject = qdomInterface.nodeObject(child);
        if ((childObject.kind || "") === "script-rule") {
          runScriptRule(child, childObject, element, context);
          continue;
        }
        const rendered = renderNode(child, context, element);
        if (rendered) {
          element.appendChild(rendered);
        }
      }
      return element;
    }

    function renderCustomInstance(node, object, context) {
      const tagName = object.componentId || object.classId || object.structId || object.tagName || "q-instance";
      const element = document.createElement(normalizeTagName(tagName, "q-instance"));
      const instanceContext = childContext(context, node, {});
      let contextValue = qdomInterface.createContextValue(node, element);
      if ((object.kind || "") === "class-instance") {
        const classId = String(object.classId || object.componentId || object.tagName || "").trim();
        const alias = readAlias(object);
        const args = Array.isArray(object.arguments) ? object.arguments : [];
        const runtimeInstance = qdomInterface.createRuntimeClassInstance(classId, alias, args, { qdomNode: node, node });
        if (runtimeInstance) {
          defineHiddenValue(runtimeInstance, "qdom", function qhtmlClassInstanceQDom() {
            return qdomInterface.createFacade(node);
          });
          defineHiddenValue(runtimeInstance, "element", function qhtmlClassInstanceElement() {
            return element;
          });
          tagKeywordType(runtimeInstance, "q-class");
          contextValue = runtimeInstance;
        }
      } else if ((object.kind || "") === "component-instance") {
        tagKeywordType(contextValue, "q-component");
      }
      instanceContext.component = contextValue;
      exposeQDom(element, node, instanceContext);
      applyAttributes(element, object.attributes, instanceContext, node);
      const props = parseObject(object.props);
      const propertyNames = new Set(Object.keys(props));
      if ((object.kind || "") !== "component-instance") {
        for (const [name, value] of Object.entries(props)) {
          const resolved = resolvePropertyValue(value, instanceContext, element);
          qdomInterface.writeProperty(node, name, resolved);
        }
      }
      const alias = readAlias(object);
      if (alias) {
        qdomInterface.registerAlias(context, alias, contextValue);
        qdomInterface.registerAlias(instanceContext, alias, contextValue);
      }
      if ((object.kind || "") === "component-instance") {
        renderComponentInstanceBody(element, node, object, instanceContext, propertyNames);
      } else {
        appendRenderedChildren(element, node, instanceContext);
      }
      return element;
    }

    function renderComponentInstanceBody(element, instanceNode, instanceObject, instanceContext, propertyNames) {
      const componentId = String(instanceObject.componentId || "").trim();
      const definitionNode = componentDefinitions.get(componentId);
      if (!definitionNode) {
        throw new Error("Missing q-component definition for " + componentId);
      }

      const definitionObject = qdomInterface.nodeObject(definitionNode);
      const defaults = parseObject(definitionObject.properties);
      const overrides = parseObject(instanceObject.props);
      const exposedNames = propertyNames || new Set();
      for (const [name, value] of Object.entries(defaults)) {
        exposedNames.add(name);
      }

      const signalNames = collectDefinitionSignalNames(definitionNode);
      tagKeywordType(instanceContext.component, "q-component");

      const backend = typeof qdomInterface.createComponentBackend === "function"
        ? qdomInterface.createComponentBackend(componentId, Array.from(exposedNames), signalNames)
        : null;
      if (backend && typeof qdomInterface.attachComponentBackend === "function") {
        qdomInterface.attachComponentBackend(instanceNode, backend);
      }

      const previousBlocked = setBackendSignalsBlocked(backend, true);
      try {
        for (const [name, value] of Object.entries(defaults)) {
          if (Object.prototype.hasOwnProperty.call(overrides, name)) {
            continue;
          }
          const resolved = resolvePropertyValue(value, instanceContext, element);
          qdomInterface.writeProperty(instanceNode, name, resolved);
        }
        for (const [name, value] of Object.entries(overrides)) {
          const resolved = resolvePropertyValue(value, instanceContext, element);
          qdomInterface.writeProperty(instanceNode, name, resolved);
        }
      } finally {
        setBackendSignalsBlocked(backend, previousBlocked);
      }

      exposeInstanceProperties(element, instanceContext.component, exposedNames);
      registerInstancePropertyHandles(instanceContext, instanceContext.component, exposedNames);
      attachDeclaredSignals([instanceContext.component, element], signalNames, instanceNode);
      appendRenderedChildren(element, definitionNode, instanceContext);
      appendRenderedChildren(element, instanceNode, instanceContext);
    }

    function renderRawHtml(node, object, context) {
      const template = document.createElement("template");
      template.innerHTML = qdomInterface.interpolate(object.html || "", context, null);
      for (const child of template.content.querySelectorAll("*")) {
        if (!child.qdom) {
          exposeQDom(child, node, context);
        }
      }
      return template.content.cloneNode(true);
    }

    function renderShadowRoot(node, context) {
      const host = document.createElement("q-shadow-root");
      exposeQDom(host, node, context);
      const shadow = host.attachShadow({ mode: "open" });
      appendRenderedChildren(shadow, node, context);
      return host;
    }

    function registerDefinition(node, object, context) {
      const id = String(object.componentId || object.classId || object.structId || "").trim();
      if (id) {
        if ((object.kind || "") === "component") {
          componentDefinitions.set(id, node);
        } else if ((object.kind || "") === "class") {
          registerClassDefinition(node, object, context, id);
          return;
        }
        qdomInterface.registerAlias(context, id, qdomInterface.createContextValue(node));
      }
      qdomInterface.rememberHandle(node);
    }

    function renderQVar(node, object, context, parent) {
      const meta = parseMeta(object);
      const parsed = qdomInterface.parseQVarRaw(meta.raw || object.raw || "");
      const name = parsed.name || object.name || meta.name || "";
      if (!name) {
        return null;
      }
      const value = qdomInterface.evaluateExpression(parsed.body || object.body || "", context, parent || null, {}, { pathFallbackLiteral: false });
      const handle = qdomInterface.createQVarHandle(name, value);
      qdomInterface.registerAlias(context, name, handle);
      return null;
    }

    function renderConnect(node, object, context) {
      const source = collectText(node, qdomInterface) || String(parseMeta(object).raw || "").replace(/^\s*q-connect\s*\{|\}\s*$/g, "");
      qdomInterface.connectEndpoints(context, source);
      return null;
    }

    function splitBindingExpressions(source) {
      const parts = String(source || "").trim().split(/\s+/).filter(Boolean);
      return parts.length >= 2 ? { source: parts[0], target: parts[1] } : null;
    }

    function resolveCssBindingTarget(targetExpression, context, parent) {
      const target = String(targetExpression || "").trim();
      const componentStylePrefix = "this.component.style.";
      const thisStylePrefix = "this.style.";
      if (target.indexOf(componentStylePrefix) === 0 || target.indexOf(thisStylePrefix) === 0) {
        const propertyName = target.indexOf(componentStylePrefix) === 0
          ? target.slice(componentStylePrefix.length)
          : target.slice(thisStylePrefix.length);
        return parent && parent.style && propertyName ? { object: parent.style, propertyName } : null;
      }
      const dot = target.lastIndexOf(".");
      if (dot <= 0 || dot >= target.length - 1) {
        return null;
      }
      const owner = qdomInterface.evaluateExpression(target.slice(0, dot), context, parent || context && context.component, {}, { pathFallbackLiteral: false });
      return owner ? { object: owner, propertyName: target.slice(dot + 1) } : null;
    }

    function sourcePropertyName(sourceExpression) {
      const source = String(sourceExpression || "").trim();
      const prefixes = ["this.component.", "component.", "this."];
      for (const prefix of prefixes) {
        if (source.indexOf(prefix) === 0) {
          const rest = source.slice(prefix.length);
          return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(rest) ? rest : "";
        }
      }
      return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(source) ? source : "";
    }

    function renderBindCss(node, object, context, parent) {
      const binding = splitBindingExpressions(collectText(node, qdomInterface) || String(parseMeta(object).raw || ""));
      const target = binding ? resolveCssBindingTarget(binding.target, context, parent) : null;
      if (!binding || !target || !target.object || !target.propertyName) {
        return null;
      }
      const applyBinding = function applyQBindCss() {
        const value = qdomInterface.evaluateExpression(binding.source, context, parent || context && context.component, {}, { pathFallbackLiteral: false });
        target.object[target.propertyName] = value == null ? "" : String(value);
      };
      applyBinding();
      const propertyName = sourcePropertyName(binding.source);
      const component = context && context.component ? context.component : null;
      const facade = component && typeof component.qdom === "function" ? component.qdom() : null;
      const handle = facade && facade.handle ? facade.handle : null;
      if (propertyName && handle && typeof qdomInterface.connectSignal === "function") {
        qdomInterface.connectSignal(handle, propertyName + "Changed", applyBinding);
      }
      return null;
    }

    function renderNode(node, context, parent) {
      if (!node) {
        return null;
      }

      qdomInterface.rememberHandle(node);
      const object = qdomInterface.nodeObject(node);
      const kind = object.kind || (typeof node.kind === "function" ? node.kind() : "");
      const tagName = normalizeTagName(object.tagName, "");

      if (kind === "document") {
        return renderFragment(node, context);
      }
      if (kind === "style-definition" || kind === "theme-definition" || kind === "default-theme-definition" ||
          kind === "transition-definition" || kind === "painter-definition") {
        return registerStyleResource(node, object);
      }
      if (kind === "element") {
        if (tagName === "q-bind-css") {
          return renderBindCss(node, object, context, parent);
        }
        if (resolveStyleDefinition(tagName)) {
          return renderStyleInvocation(node, tagName, context);
        }
        if (themeDefinitions.has(normalizeResourceKey(tagName)) || defaultThemeDefinitions.has(normalizeResourceKey(tagName))) {
          return renderThemeInvocation(node, tagName, context);
        }
        if (tagName === "q-connect") {
          return renderConnect(node, object, context);
        }
        if (tagName === "q-shadow-root") {
          return renderShadowRoot(node, context);
        }
        return renderElement(node, object, context);
      }
      if (kind === "text") {
        return document.createTextNode(qdomInterface.interpolate(object.value || "", context, parent));
      }
      if (kind === "raw-html") {
        return renderRawHtml(node, object, context);
      }
      if (kind === "slot" || kind === "slot-default") {
        return renderFragment(node, context);
      }
      if (kind === "qvardeclaration") {
        return renderQVar(node, object, context, parent);
      }
      if (kind === "script-rule") {
        runScriptRule(node, object, parent, context);
        return null;
      }
      if (kind === "component" || kind === "class" || kind === "struct") {
        registerDefinition(node, object, context);
        return document.createComment("qhtml definition " + (object.componentId || object.classId || object.structId || ""));
      }
      if (kind === "component-instance" || kind === "class-instance" || kind === "template-instance" || kind === "struct-instance") {
        return renderCustomInstance(node, object, context);
      }

      const fallback = document.createElement("q-" + normalizeTagName(kind || "node"));
      exposeQDom(fallback, node, context);
      appendRenderedChildren(fallback, node, context);
      return fallback;
    }

    function mountQHtmlElement(hostElement) {
      if (!hostElement) {
        throw new Error("mountQHtmlElement requires a host element");
      }

      const source = hostElement.textContent || "";
      const documentHandle = qdomInterface.createDocument(source);
      const root = documentHandle.root();
      qdomInterface.documentByHost.set(hostElement, documentHandle);
      qdomInterface.rememberHandle(root);

      hostElement.textContent = "";
      hostElement.setAttribute("data-qhtml-wasm-mounted", "true");
      const rootContext = qdomInterface.createContext(null, root, {
        hostElement,
        namedRuntimeValues: Object.create(null),
        exportAliasesToHost: true
      });
      qdomInterface.bindContextValue(hostElement, rootContext);
      exposeQDom(hostElement, root, rootContext);

      const rendered = renderNode(root, rootContext, hostElement);
      if (rendered) {
        hostElement.appendChild(rendered);
      }

      return createRenderedFacade(root, hostElement, rootContext);
    }

    function mountAll(root) {
      const scope = root || document;
      const mounted = [];
      for (const host of scope.querySelectorAll("q-html:not([data-qhtml-wasm-mounted])")) {
        mounted.push(mountQHtmlElement(host));
      }
      return mounted;
    }

    function rerenderByUuid(uuid) {
      const element = qdomInterface.findDomByUuid(uuid);
      const node = qdomInterface.findHandleByUuid(uuid);
      if (!element || !node || !element.parentNode) {
        return null;
      }

      const replacement = renderNode(node);
      if (!replacement) {
        return null;
      }
      element.parentNode.replaceChild(replacement, element);
      return replacement;
    }

    function createFacade() {
      return {
        mountQHtmlElement,
        mountAll,
        rerenderByUuid,
        parse: qdomInterface.parse,
        createDocument: qdomInterface.createDocument,
        rootContext: qdomInterface.rootContext,
        setContextProperty: qdomInterface.rootContext.set,
        getContextProperty: qdomInterface.rootContext.get,
        createChildContext: qdomInterface.rootContext.child,
        qdomInterface
      };
    }

    return {
      mountQHtmlElement,
      mountAll,
      renderNode,
      rerenderByUuid,
      createFacade
    };
  }

  globalScope.QHTMLWasmDomRenderer = {
    create: createRenderer
  };
})();
