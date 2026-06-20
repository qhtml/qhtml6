(function () {
  "use strict";

  const globalScope = typeof globalThis !== "undefined" ? globalThis : window;

  function parseJson(value, fallback) {
    if (value == null || value === "") {
      return fallback;
    }
    if (typeof value !== "string") {
      return value;
    }
    try {
      return JSON.parse(value);
    } catch (_error) {
      return fallback;
    }
  }

  function callMaybe(target, name, args, fallback) {
    if (target && typeof target[name] === "function") {
      return target[name].apply(target, args || []);
    }
    return fallback;
  }

  function createInterface(options) {
    const Module = options && options.Module ? options.Module : globalScope.Module;
    if (!Module) {
      throw new Error("QHTML WASM QDom interface requires an initialized Module");
    }

    const domByUuid = new Map();
    const handleByUuid = new Map();
    const facadeByUuid = new Map();
    const documentByHost = new WeakMap();

    function uuidOf(node) {
      return callMaybe(node, "uuid", [], "");
    }

    function rememberHandle(node) {
      const uuid = uuidOf(node);
      if (uuid) {
        handleByUuid.set(uuid, node);
      }
      return node;
    }

    function rememberDom(node, element) {
      const uuid = uuidOf(node);
      if (uuid && element) {
        domByUuid.set(uuid, element);
        if (typeof node.setDomUuid === "function") {
          node.setDomUuid(uuid);
        }
      }
      return element;
    }

    function nodeObject(node) {
      return callMaybe(node, "toObject", [], parseJson(callMaybe(node, "toJson", [], "{}"), {}));
    }

    function propertyJson(node, name) {
      if (!node) {
        return "null";
      }
      if (typeof node.propertyJson === "function") {
        const json = node.propertyJson(name);
        if (json != null && json !== "") {
          return json;
        }
      }
      if (typeof node.hasProperty === "function" && !node.hasProperty(name)) {
        return "null";
      }
      if (typeof node.stringProperty === "function") {
        return JSON.stringify(node.stringProperty(name));
      }
      return "null";
    }

    function readProperty(node, name) {
      if (!node) {
        return undefined;
      }
      const json = propertyJson(node, name);
      if (json == null || json === "") {
        return null;
      }
      return parseJson(json, null);
    }

    function writeProperty(node, name, value) {
      if (!node) {
        return;
      }
      if (typeof value === "number" && typeof node.setNumberProperty === "function") {
        node.setNumberProperty(name, value);
      } else if (typeof value === "boolean" && typeof node.setBoolProperty === "function") {
        node.setBoolProperty(name, value);
      } else if (typeof node.setStringProperty === "function") {
        if (value == null || typeof value === "string") {
          node.setStringProperty(name, value == null ? "" : value);
        } else if (typeof node.setPropertyValue === "function") {
          node.setPropertyValue(name, value);
        } else {
          node.setStringProperty(name, JSON.stringify(value));
        }
      } else if (typeof node.setPropertyValue === "function") {
        node.setPropertyValue(name, value);
      }
    }

    function childAt(node, index) {
      return rememberHandle(callMaybe(node, "childAt", [index], null));
    }

    function children(node) {
      const count = callMaybe(node, "childCount", [], 0);
      const out = [];
      for (let i = 0; i < count; i += 1) {
        const child = childAt(node, i);
        if (child) {
          out.push(child);
        }
      }
      return out;
    }

    function createFacade(node) {
      if (!node) {
        return null;
      }
      const uuid = uuidOf(node);
      if (uuid && facadeByUuid.has(uuid)) {
        return facadeByUuid.get(uuid);
      }

      const facade = {
        handle: node,
        kind() {
          return callMaybe(node, "kind", [], "");
        },
        uuid() {
          return uuidOf(node);
        },
        domUuid() {
          return callMaybe(node, "domUuid", [], "");
        },
        objectName() {
          return callMaybe(node, "objectName", [], "");
        },
        setObjectName(name) {
          callMaybe(node, "setObjectName", [String(name || "")]);
          return facade;
        },
        parent() {
          return createFacade(callMaybe(node, "parent", [], callMaybe(node, "parentNode", [], null)));
        },
        childAt(index) {
          return createFacade(childAt(node, index));
        },
        childCount() {
          return callMaybe(node, "childCount", [], 0);
        },
        children() {
          return children(node).map(createFacade);
        },
        property(name) {
          return readProperty(node, name);
        },
        setProperty(name, value) {
          writeProperty(node, name, value);
          return facade;
        },
        propertyJson(name) {
          return propertyJson(node, name);
        },
        propertyKeys() {
          return parseJson(callMaybe(node, "propertyKeys", [], "[]"), []);
        },
        connect(signalName, callback) {
          return callMaybe(node, "connect", [signalName, callback], 0);
        },
        disconnect(connectionId) {
          return callMaybe(node, "disconnect", [connectionId], false);
        },
        emit(signalName, payload) {
          if (typeof node.emit === "function") {
            node.emit(signalName, payload);
          }
          return facade;
        },
        find(query) {
          return createFacade(callMaybe(node, "find", [query], null));
        },
        findByUuid(query) {
          return createFacade(callMaybe(node, "findByUuid", [query], null));
        },
        findByName(query) {
          return createFacade(callMaybe(node, "findByName", [query], null));
        },
        findByKind(query) {
          return createFacade(callMaybe(node, "findByKind", [query], null));
        },
        toObject() {
          return nodeObject(node);
        },
        toJson() {
          return callMaybe(node, "toJson", [], JSON.stringify(nodeObject(node)));
        },
        element() {
          return domByUuid.get(uuidOf(node)) || null;
        }
      };

      if (uuid) {
        facadeByUuid.set(uuid, facade);
      }
      return facade;
    }

    function parse(source) {
      const parser = new Module.QHtmlParser();
      return parser.toAST(source);
    }

    function createDocument(sourceOrAst) {
      const ast = typeof sourceOrAst === "string" ? parse(sourceOrAst) : sourceOrAst;
      const created = new Module.QDomDocument().fromAST(ast);
      if (created && typeof created.root === "function") {
        return created;
      }

      const shim = {
        root() {
          return created;
        },
        findByUuid(uuid) {
          return callMaybe(created, "findByUuid", [uuid], null);
        },
        findByName(name) {
          return callMaybe(created, "findByName", [name], null);
        },
        findByKind(kind) {
          return callMaybe(created, "findByKind", [kind], null);
        },
        find(query) {
          return callMaybe(created, "find", [query], null);
        }
      };
      return shim;
    }

    return {
      Module,
      domByUuid,
      handleByUuid,
      documentByHost,
      parseJson,
      nodeObject,
      rememberHandle,
      rememberDom,
      createFacade,
      createDocument,
      parse,
      childAt,
      children,
      readProperty,
      writeProperty,
      findHandleByUuid(uuid) {
        return handleByUuid.get(uuid) || null;
      },
      findDomByUuid(uuid) {
        return domByUuid.get(uuid) || null;
      }
    };
  }

  globalScope.QHTMLWasmDomRuntime = {
    create: createInterface
  };
})();
