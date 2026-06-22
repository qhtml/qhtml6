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
    return String(object.alias || meta.__qhtmlInstanceAlias || meta.instanceAlias || object.name || "").trim();
  }

  function normalizeDefinitionName(value) {
    return String(value || "").trim().toLowerCase();
  }

  function readBehaviorRules(object) {
    const meta = parseMeta(object);
    return meta.__qhtmlBehaviors && typeof meta.__qhtmlBehaviors === "object" ? meta.__qhtmlBehaviors : {};
  }

  function readAnchorRules(object) {
    const meta = parseMeta(object);
    return meta.__qhtmlAnchorRules && typeof meta.__qhtmlAnchorRules === "object" ? meta.__qhtmlAnchorRules : {};
  }

  function firstDefined() {
    for (let i = 0; i < arguments.length; i += 1) {
      if (arguments[i] != null && arguments[i] !== "") {
        return arguments[i];
      }
    }
    return undefined;
  }

  function readBoolean(value, fallback) {
    if (value == null || value === "") {
      return fallback;
    }
    if (typeof value === "boolean") {
      return value;
    }
    if (typeof value === "number") {
      return value !== 0;
    }
    const text = String(value).trim().toLowerCase();
    if (text === "true" || text === "yes" || text === "on" || text === "1") {
      return true;
    }
    if (text === "false" || text === "no" || text === "off" || text === "0") {
      return false;
    }
    return fallback;
  }

  function readNumber(value, fallback) {
    if (value == null || value === "") {
      return fallback;
    }
    const numeric = typeof value === "number" ? value : Number(String(value).trim());
    return Number.isFinite(numeric) ? numeric : fallback;
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

    const componentDefinitions = new Map();
    const classDefinitions = new Map();
    const classConstructors = new Map();
    const structDefinitions = new Map();
    const anchoredElements = [];

    function childContext(parentContext, owner, overrides) {
      return qdomInterface.createContext(parentContext, owner, overrides || {});
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

    function exposeQDom(element, node, context) {
      if (!element || !node || element.nodeType !== 1) {
        return element;
      }
      qdomInterface.rememberHandle(node);
      qdomInterface.rememberDom(node, element);
      const uuid = typeof node.uuid === "function" ? node.uuid() : "";
      if (uuid && element.style && typeof element.style.setProperty === "function") {
        element.style.setProperty("anchor-name", "--qhtml-anchor-" + uuid);
      }
      if (context) {
        qdomInterface.bindContextValue(element, context);
      }
      Object.defineProperty(element, "qdom", {
        configurable: true,
        value() {
          return qdomInterface.createFacade(node);
        }
      });
      const contextValue = qdomInterface.createContextValue(node, element);
      if (contextValue) {
        qdomInterface.bindContextValue(contextValue, context);
      }
      return element;
    }

    function resolveAnchorTarget(expression, context, element) {
      const source = String(expression || "").trim();
      if (!source) {
        return null;
      }
      const parts = source.split(".");
      const name = parts.shift();
      const side = (parts.shift() || "").toLowerCase();
      let value = qdomInterface.evaluateExpression(name, context, element, {}, { pathFallbackLiteral: false });
      let target = null;
      if (value && typeof value.element === "function") {
        target = value.element();
      } else if (value && value.nodeType === 1) {
        target = value;
      }
      if (!target && context && context.hostElement) {
        target = context.hostElement.querySelector("#" + CSS.escape(name))
          || context.hostElement.querySelector(name);
      }
      return target ? { element: target, side } : null;
    }

    function edgeCoordinate(rect, side, axis) {
      if (side === "right") {
        return rect.right;
      }
      if (side === "bottom") {
        return rect.bottom;
      }
      if (side === "center") {
        return axis === "x" ? rect.left + rect.width / 2 : rect.top + rect.height / 2;
      }
      if (side === "hcenter") {
        return rect.left + rect.width / 2;
      }
      if (side === "vcenter") {
        return rect.top + rect.height / 2;
      }
      return axis === "y" ? rect.top : rect.left;
    }

    function ensurePositionedContainer(element) {
      const container = element && element.parentElement ? element.parentElement : null;
      if (!container) {
        return null;
      }
      const position = getComputedStyle(container).position;
      if (!position || position === "static") {
        container.style.position = "relative";
      }
      return container;
    }

    function applyAnchorEntry(entry) {
      const element = entry.element;
      if (!element || !element.isConnected) {
        return;
      }
      const rules = entry.rules || {};
      const container = ensurePositionedContainer(element);
      if (!container) {
        return;
      }
      const containerRect = container.getBoundingClientRect();
      const ownRect = element.getBoundingClientRect();
      const style = element.style;
      style.position = "absolute";

      if (rules.fill) {
        const target = resolveAnchorTarget(rules.fill, entry.context, element);
        if (target) {
          const rect = target.element.getBoundingClientRect();
          style.left = (rect.left - containerRect.left) + "px";
          style.top = (rect.top - containerRect.top) + "px";
          style.width = rect.width + "px";
          style.height = rect.height + "px";
          return;
        }
      }

      for (const [rule, expression] of Object.entries(rules)) {
        if (rule === "fill") {
          continue;
        }
        const target = resolveAnchorTarget(expression, entry.context, element);
        if (!target) {
          continue;
        }
        const rect = target.element.getBoundingClientRect();
        if (target.element.style && typeof target.element.style.getPropertyValue === "function") {
          const uuid = typeof target.element.qdom === "function" ? target.element.qdom().uuid() : "";
          if (uuid) {
            style.setProperty("position-anchor", "--qhtml-anchor-" + uuid);
          }
        }
        if (rule === "left") {
          style.left = (edgeCoordinate(rect, target.side, "x") - containerRect.left) + "px";
        } else if (rule === "right") {
          style.right = (containerRect.right - edgeCoordinate(rect, target.side, "x")) + "px";
        } else if (rule === "top") {
          style.top = (edgeCoordinate(rect, target.side, "y") - containerRect.top) + "px";
        } else if (rule === "bottom") {
          style.bottom = (containerRect.bottom - edgeCoordinate(rect, target.side, "y")) + "px";
        } else if (rule === "center") {
          style.left = (edgeCoordinate(rect, "center", "x") - containerRect.left - ownRect.width / 2) + "px";
          style.top = (edgeCoordinate(rect, "center", "y") - containerRect.top - ownRect.height / 2) + "px";
        } else if (rule === "hcenter") {
          style.left = (edgeCoordinate(rect, "hcenter", "x") - containerRect.left - ownRect.width / 2) + "px";
        } else if (rule === "vcenter") {
          style.top = (edgeCoordinate(rect, "vcenter", "y") - containerRect.top - ownRect.height / 2) + "px";
        }
      }
    }

    function enqueueAnchors(element, node, object, context) {
      const rules = readAnchorRules(object);
      if (!rules || !Object.keys(rules).length) {
        return;
      }
      anchoredElements.push({ element, node, context, rules });
    }

    function applyAllAnchors() {
      for (const entry of anchoredElements) {
        applyAnchorEntry(entry);
      }
    }

    function scheduleAnchorPass() {
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => applyAllAnchors());
      } else {
        setTimeout(() => applyAllAnchors(), 0);
      }
    }

    function installComponentElementProperty(element, componentValue, propertyName) {
      const key = String(propertyName || "").trim();
      if (!element || element.nodeType !== 1 || !componentValue || !key || Object.prototype.hasOwnProperty.call(element, key)) {
        return;
      }
      Object.defineProperty(element, key, {
        configurable: true,
        enumerable: true,
        get() {
          return componentValue[key];
        },
        set(nextValue) {
          componentValue[key] = nextValue;
        }
      });
    }

    function appendRenderedChildren(target, node, context) {
      for (const child of qdomInterface.children(node)) {
        const childObject = qdomInterface.nodeObject(child);
        if ((childObject.kind || "") === "text") {
          const value = String(childObject.value || "").trim();
          const fieldMatch = value.match(/^var\s+this\.([A-Za-z_$][A-Za-z0-9_$]*)\b/);
          if (fieldMatch) {
            installComponentElementProperty(target, context && context.component, fieldMatch[1]);
            qdomInterface.executeScript(value.replace(/^var\s+/, ""), context, target && target.nodeType === 1 ? target : context && context.component, {}, [], []);
            continue;
          }
        }
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
      const lowerName = name.toLowerCase();
      const type = metaType(object);
      const body = String(object.body || "");
      if (type === "QScriptActionBlock") {
        qdomInterface.executeScript(body, context, parent || context && context.component || null, {}, [], []);
        return;
      }
      if (type === "SignalDeclaration") {
        const targets = [];
        if (context && context.component) {
          targets.push(context.component);
        }
        if (parent && parent.nodeType === 1) {
          targets.push(parent);
        }
        const emitDeclaredSignal = function emitSignal(payload) {
          const componentTarget = context && context.component ? context.component : null;
          const facade = componentTarget && typeof componentTarget.qdom === "function"
            ? componentTarget.qdom()
            : parent && typeof parent.qdom === "function"
              ? parent.qdom()
              : null;
          if (facade && typeof facade.emit === "function") {
            facade.emit(name, payload);
          }
        };
        for (const target of targets) {
          target[name] = emitDeclaredSignal;
        }
        return;
      }
      if (lowerName === "onready" || lowerName === "onload" || lowerName === "onloaded") {
        const target = parent && parent.nodeType === 1 ? parent : context && context.component;
        const runReady = () => qdomInterface.executeScript(body, context, target, {}, [], object.parameters || []);
        if (typeof requestAnimationFrame === "function") {
          requestAnimationFrame(runReady);
        } else {
          setTimeout(runReady, 0);
        }
        return;
      }
      if (/^on[A-Za-z]/.test(name) && parent && parent.nodeType === 1) {
        if (/changed$/i.test(name)) {
          const targetValue = context && context.component ? context.component : null;
          if (targetValue) {
            const propertyName = name.slice(2).replace(/changed$/i, "");
            const signalName = propertyName + "Changed";
            const facade = typeof targetValue.qdom === "function" ? targetValue.qdom() : null;
            const handle = facade && facade.handle ? facade.handle : null;
            const runChangedHandler = function qhtmlWasmChangedSignalHandler(payload) {
              const event = payload && typeof payload === "object" ? payload : {};
              const nextValue = Object.prototype.hasOwnProperty.call(event, "value")
                ? event.value
                : targetValue[propertyName];
              return qdomInterface.executeScript(
                body,
                context,
                parent || targetValue,
                {
                  event,
                  value: nextValue,
                  propertyName
                },
                [nextValue, event],
                object.parameters || ["value", "event"]
              );
            };
            targetValue[name] = runChangedHandler;
            targetValue[name.toLowerCase()] = runChangedHandler;
            if (handle && typeof qdomInterface.connectSignal === "function") {
              qdomInterface.connectSignal(handle, signalName, runChangedHandler);
            }
          }
          return;
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
      enqueueAnchors(element, node, object, context);
      return element;
    }

    function readClassFieldInitializers(node) {
      const fields = [];
      for (const child of qdomInterface.children(node)) {
        const object = qdomInterface.nodeObject(child);
        if ((object.kind || "") !== "text") {
          continue;
        }
        const value = String(object.value || "").trim();
        if (/^var\s+this\./.test(value)) {
          fields.push(value.replace(/^var\s+/, ""));
        }
      }
      return fields;
    }

    function readClassSignalNames(node, object) {
      const signals = [];
      const addSignal = function addSignal(name) {
        const signalName = String(name || "").trim();
        if (signalName && !signals.includes(signalName)) {
          signals.push(signalName);
        }
      };
      if (Array.isArray(object && object.signals)) {
        for (const signal of object.signals) {
          addSignal(signal && typeof signal === "object" ? signal.name : signal);
        }
      }
      for (const child of qdomInterface.children(node)) {
        const childObject = qdomInterface.nodeObject(child);
        if ((childObject.kind || "") === "script-rule" && metaType(childObject) === "SignalDeclaration") {
          addSignal(childObject.name);
        }
      }
      return signals;
    }

    function defineMethodOnPrototype(ctor, method, ownerContext) {
      const name = String(method && method.name || "").trim();
      if (!name) {
        return;
      }
      const body = String(method.body || "");
      const parameters = method.parameters || method.parameterList || "";
      ctor.prototype[name] = function qhtmlWasmClassMethod() {
        return qdomInterface.executeScript(body, ownerContext, this, {}, Array.from(arguments), parameters);
      };
    }

    function compileClassDefinition(node, object, context) {
      const classId = String(object.classId || "").trim();
      const key = normalizeDefinitionName(classId);
      if (!key) {
        return null;
      }
      if (classConstructors.has(key)) {
        return classConstructors.get(key);
      }

      const parentKey = normalizeDefinitionName(object.extendsClassId || "");
      const ParentCtor = parentKey ? classConstructors.get(parentKey) : null;
      const constructorDefinition = object.constructorDefinition && typeof object.constructorDefinition === "object"
        ? object.constructorDefinition
        : {};
      const constructorBody = String(constructorDefinition.body || "");
      const constructorParameters = constructorDefinition.parameters || constructorDefinition.parameterList || "";
      const fieldInitializers = readClassFieldInitializers(node);
      const signalNames = readClassSignalNames(node, object);
      const ownerContext = childContext(context, node, {});

      const ctor = function QHtmlWasmRuntimeClass() {
        if (!(this instanceof ctor)) {
          return new ctor(...Array.from(arguments));
        }
        if (ParentCtor) {
          ParentCtor.apply(this, arguments);
        }
        qdomInterface.bindContextValue(this, ownerContext);
        if (typeof qdomInterface.attachRuntimeSignalBridge === "function") {
          qdomInterface.attachRuntimeSignalBridge(this, null, { signals: signalNames });
        }
        Object.defineProperty(this, "__qhtmlClassId", {
          configurable: true,
          enumerable: false,
          writable: true,
          value: classId
        });
        for (const source of fieldInitializers) {
          qdomInterface.executeScript(source, ownerContext, this, {}, [], []);
        }
        if (constructorBody.trim()) {
          const methodScope = Object.create(null);
          for (const methodName of Object.getOwnPropertyNames(ctor.prototype)) {
            if (methodName !== "constructor" && typeof this[methodName] === "function") {
              methodScope[methodName] = this[methodName].bind(this);
            }
          }
          qdomInterface.executeScript(constructorBody, ownerContext, this, methodScope, Array.from(arguments), constructorParameters);
        }
      };

      Object.defineProperty(ctor, "name", {
        configurable: true,
        value: classId
      });
      if (ParentCtor) {
        ctor.prototype = Object.create(ParentCtor.prototype);
      }
      Object.defineProperty(ctor.prototype, "constructor", {
        configurable: true,
        writable: true,
        value: ctor
      });
      ctor.prototype.qdomClassName = function qdomClassName() {
        return classId;
      };

      const methods = Array.isArray(object.methods) ? object.methods : [];
      for (const method of methods) {
        defineMethodOnPrototype(ctor, method, ownerContext);
      }

      classDefinitions.set(key, node);
      classConstructors.set(key, ctor);
      qdomInterface.registerAlias(context, classId, ctor);
      qdomInterface.rememberHandle(node);
      return ctor;
    }

    function instantiateClassNode(node, object, context) {
      const classId = String(object.classId || "").trim();
      const key = normalizeDefinitionName(classId);
      const ctor = classConstructors.get(key);
      if (!ctor) {
        return null;
      }
      const instanceContext = childContext(context, node, {});
      const args = Array.isArray(object.arguments)
        ? object.arguments.map((source) => qdomInterface.evaluateExpression(source, instanceContext, null, {}, { pathFallbackLiteral: true }))
        : [];
      const instance = new ctor(...args);
      qdomInterface.bindContextValue(instance, instanceContext);
      if (typeof qdomInterface.attachRuntimeSignalBridge === "function") {
        qdomInterface.attachRuntimeSignalBridge(instance, node, {});
      } else if (typeof instance.__qhtmlAttachSignalNode === "function") {
        instance.__qhtmlAttachSignalNode(node);
      }
      Object.defineProperty(instance, "qdom", {
        configurable: true,
        value() {
          return qdomInterface.createFacade(node);
        }
      });
      Object.defineProperty(instance, "element", {
        configurable: true,
        value() {
          return null;
        }
      });

      const attrs = Object.assign({}, parseObject(object.attributes), parseObject(object.props));
      for (const [name, value] of Object.entries(attrs)) {
        instance[name] = typeof value === "string" ? qdomInterface.interpolate(value, instanceContext, null) : value;
        qdomInterface.writeProperty(node, name, instance[name]);
      }

      const alias = readAlias(object);
      if (alias) {
        qdomInterface.registerAlias(context, alias, instance);
        qdomInterface.registerAlias(instanceContext, alias, instance);
      }
      return document.createComment("qhtml class instance " + (alias || classId));
    }

    function renderCustomInstance(node, object, context) {
      const tagName = object.componentId || object.classId || object.structId || object.tagName || "q-instance";
      const element = document.createElement(normalizeTagName(tagName, "q-instance"));
      const definition = componentDefinitions.get(normalizeDefinitionName(object.componentId || tagName))
        || classDefinitions.get(normalizeDefinitionName(object.classId || tagName))
        || structDefinitions.get(normalizeDefinitionName(object.structId || tagName))
        || null;
      const definitionObject = definition ? qdomInterface.nodeObject(definition) : null;
      const instanceContext = childContext(context, node, {});
      const contextValue = qdomInterface.createContextValue(node, element);
      instanceContext.component = contextValue;
      exposeQDom(element, node, instanceContext);
      applyAttributes(element, definitionObject && definitionObject.attributes, instanceContext, definition || node);
      applyAttributes(element, object.attributes, instanceContext, node);
      const definitionProps = Object.assign({}, parseObject(definitionObject && definitionObject.properties), parseObject(definitionObject && definitionObject.props));
      const props = Object.assign({}, definitionProps, parseObject(object.props));
      for (const [name, value] of Object.entries(props)) {
        const resolved = typeof value === "string" ? qdomInterface.interpolate(value, instanceContext, element) : value;
        qdomInterface.writeProperty(node, name, resolved);
        if (!Object.prototype.hasOwnProperty.call(element, name)) {
          Object.defineProperty(element, name, {
            configurable: true,
            enumerable: true,
            get() {
              return contextValue[name];
            },
            set(nextValue) {
              contextValue[name] = nextValue;
            }
          });
        }
      }
      if (typeof qdomInterface.installBehaviorRules === "function") {
        qdomInterface.installBehaviorRules(contextValue, Object.assign({}, readBehaviorRules(definitionObject), readBehaviorRules(object)));
      }
      const alias = readAlias(object);
      if (alias) {
        qdomInterface.registerAlias(context, alias, contextValue);
        qdomInterface.registerAlias(instanceContext, alias, contextValue);
      }
      if (definition) {
        appendRenderedChildren(element, definition, instanceContext);
      }
      appendRenderedChildren(element, node, instanceContext);
      enqueueAnchors(element, node, object, instanceContext);
      return element;
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
      const key = normalizeDefinitionName(id);
      if (key) {
        if ((object.kind || "") === "component") {
          componentDefinitions.set(key, node);
        } else if ((object.kind || "") === "class") {
          compileClassDefinition(node, object, context);
        } else if ((object.kind || "") === "struct") {
          structDefinitions.set(key, node);
        }
      }
      if (id && (object.kind || "") !== "class") {
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

    function renderQTimer(node, object, context, parent) {
      const meta = parseMeta(object);
      const attrs = parseObject(object.attributes);
      const parsed = qdomInterface.parseTimerRaw(meta.raw || object.raw || "");
      const alias = readAlias(object) || parsed.name || String(firstDefined(attrs.name, attrs.id) || "").trim();
      const rawDuration = firstDefined(attrs.duration, attrs.interval, attrs.timeoutMs, attrs.timeout);
      const rawRepeat = firstDefined(attrs.repeat, attrs.repeating);
      const rawRunning = firstDefined(attrs.running, attrs.active);
      const resolveAttr = function resolveTimerAttribute(value) {
        return typeof value === "string" ? qdomInterface.interpolate(value, context, parent || null) : value;
      };
      const timerOptions = {
        interval: readNumber(resolveAttr(rawDuration), 1000),
        repeat: readBoolean(resolveAttr(rawRepeat), true),
        running: false,
        qdomNode: node
      };
      const timer = typeof qdomInterface.createRuntimeClassInstance === "function"
        ? qdomInterface.createRuntimeClassInstance("q-timer", alias, [], timerOptions)
        : qdomInterface.createTimerHandle(alias, timerOptions);

      if (alias) {
        qdomInterface.registerAlias(context, alias, timer);
      }

      for (const child of qdomInterface.children(node)) {
        const childObject = qdomInterface.nodeObject(child);
        const childKind = childObject.kind || "";
        const childName = String(childObject.name || "").trim().toLowerCase();
        if (childKind === "script-rule" && (childName === "ontimeout" || childName === "timeout")) {
          timer.connect("timeout", (event) => {
            const extraScope = { event, timer };
            if (alias) {
              extraScope[alias] = timer;
            }
            qdomInterface.executeScript(
              childObject.body || "",
              context,
              parent || (context && context.component) || (context && context.hostElement) || null,
              extraScope,
              [event],
              childObject.parameters || ["event"]
            );
          });
          continue;
        }
        renderNode(child, context, parent || null);
      }

      if (readBoolean(resolveAttr(rawRunning), true)) {
        timer.start();
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
      if (kind === "element") {
        if (tagName === "q-timer") {
          return renderQTimer(node, object, context, parent);
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
      if (kind === "class-instance") {
        return instantiateClassNode(node, object, context);
      }
      if (kind === "component-instance" || kind === "template-instance" || kind === "struct-instance") {
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
      scheduleAnchorPass();

      return qdomInterface.createFacade(root);
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
      scheduleAnchorPass();
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
