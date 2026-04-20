(function attachQHtmlParser(global) {
  const modules = global.QHtmlModules || (global.QHtmlModules = {});
  const core = modules.qdomCore;

  if (!core) {
    throw new Error("qhtml-parser requires qdom-core to be loaded first.");
  }

  const KNOWN_HTML_TAGS = new Set([
    "a", "abbr", "address", "article", "aside", "audio", "b", "base", "blockquote", "body", "br",
    "button", "canvas", "caption", "cite", "code", "col", "colgroup", "data", "datalist", "dd", "del",
    "details", "dfn", "dialog", "div", "dl", "dt", "em", "embed", "fieldset", "figcaption", "figure",
    "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "head", "header", "hr", "html", "i",
    "iframe", "img", "input", "label", "legend", "li", "link", "main", "meta", "meter", "nav", "noscript",
    "object", "ol", "optgroup", "option", "output", "p", "param", "picture", "pre", "progress", "q", "rp",
    "rt", "ruby", "s", "samp", "script", "section", "select", "slot", "small", "source", "span", "strong",
    "style", "sub", "summary", "sup", "table", "tbody", "td", "template", "textarea", "tfoot", "th", "thead",
    "time", "title", "tr", "track", "u", "ul", "var", "video", "wbr", "center"
  ]);

  const TEXT_BLOCK_KEYWORDS = new Set(["text", "innertext"]);
  const LIFECYCLE_BLOCKS = new Set(["onready", "onload", "onloaded"]);
  const BINDING_EXPRESSION_KEYWORDS = new Set(["q-bind", "q-script"]);
  const REPEATER_KEYWORDS = new Set(["q-repeater", "q-foreach"]);
  const FOR_KEYWORDS = new Set(["for"]);
  const MODEL_KEYWORDS = new Set(["q-model"]);
  const MODEL_VIEW_KEYWORDS = new Set(["q-model-view"]);
  const ITERATIVE_MODEL_KEYWORDS = new Set(["q-array", "q-object", "q-map"]);
  const DEPRECATED_FEATURE_WARNED = new Set();
  const CANONICAL_KEYWORD_TARGETS = new Set([
    "q-component",
    "q-worker",
    "q-template",
    "q-macro",
    "q-rewrite",
    "q-script",
    "q-bind",
    "q-property",
    "q-signal",
    "q-callback",
    "q-alias",
    "q-wasm",
    "q-style",
    "q-style-class",
    "q-theme",
    "q-default-theme",
    "q-color",
    "q-color-schema",
    "q-color-theme",
    "q-array",
    "q-object",
    "q-map",
    "q-model",
    "q-repeater",
    "q-foreach",
    "q-model-view",
    "for",
    "q-timer",
    "q-canvas",
    "q-connect",
    "q-import",
    "q-logger",
    "q-sdml-component",
    "sdml-endpoint",
    "slot",
    "style",
    "text",
    "html",
  ]);

  function createParserUuid() {
    if (global.crypto && typeof global.crypto.randomUUID === "function") {
      try {
        const generated = String(global.crypto.randomUUID() || "").trim();
        if (generated) {
          return generated;
        }
      } catch (error) {
        // fallback below
      }
    }
    if (global.crypto && typeof global.crypto.getRandomValues === "function" && typeof Uint8Array === "function") {
      try {
        const bytes = new Uint8Array(16);
        global.crypto.getRandomValues(bytes);
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const hex = [];
        for (let i = 0; i < bytes.length; i += 1) {
          hex.push(bytes[i].toString(16).padStart(2, "0"));
        }
        return (
          hex.slice(0, 4).join("") +
          "-" +
          hex.slice(4, 6).join("") +
          "-" +
          hex.slice(6, 8).join("") +
          "-" +
          hex.slice(8, 10).join("") +
          "-" +
          hex.slice(10, 16).join("")
        );
      } catch (error) {
        // fallback below
      }
    }
    const time = Date.now().toString(16).padStart(12, "0");
    const rand = Math.floor(Math.random() * 0xffffffffffff).toString(16).padStart(12, "0");
    return (
      time.slice(-8) +
      "-" +
      time.slice(0, 4) +
      "-4" +
      rand.slice(0, 3) +
      "-a" +
      rand.slice(3, 6) +
      "-" +
      rand.slice(6, 12)
    );
  }

  function createDeclarationMeta(baseMeta) {
    const meta = baseMeta && typeof baseMeta === "object" && !Array.isArray(baseMeta) ? Object.assign({}, baseMeta) : {};
    const uuid = String(meta.uuid || "").trim() || createParserUuid();
    meta.uuid = uuid;
    return meta;
  }

  function normalizeWasmMode(value) {
    const mode = String(value || "").trim().toLowerCase();
    if (mode === "main" || mode === "main-thread" || mode === "mainthread") {
      return "main";
    }
    if (mode === "worker" || mode === "worker-thread" || mode === "workerthread") {
      return "worker";
    }
    return "";
  }

  function isQObjectKeyword(name) {
    const normalized = String(name || "").trim().toLowerCase();
    return normalized === "q-object" || normalized === "q-map";
  }

  function normalizeQObjectKeyword(name) {
    return String(name || "").trim().toLowerCase() === "q-map" ? "q-map" : "q-object";
  }

  function parseWasmBoolean(value) {
    const text = String(value || "").trim().toLowerCase();
    if (!text) {
      return null;
    }
    if (text === "true" || text === "1" || text === "yes" || text === "on") {
      return true;
    }
    if (text === "false" || text === "0" || text === "no" || text === "off") {
      return false;
    }
    return null;
  }

  function parseWasmPositiveInteger(value) {
    const parsed = Number(String(value || "").trim());
    if (!Number.isFinite(parsed)) {
      return null;
    }
    const rounded = Math.floor(parsed);
    if (rounded < 0) {
      return null;
    }
    return rounded;
  }

  function parseQWasmBindingRules(rawBody) {
    const parser = parserFor(String(rawBody || ""));
    const out = [];
    const seen = new Set();
    while (!eof(parser)) {
      skipWhitespaceAndSemicolons(parser);
      if (eof(parser)) {
        break;
      }

      const exportName = parseQColorIdentifier(parser, "q-wasm bind");
      skipWhitespace(parser);
      if (!(peek(parser) === "-" && peek(parser, 1) === ">")) {
        throw ParseError("Expected '->' inside q-wasm bind block", parser.index);
      }
      parser.index += 2;

      skipWhitespace(parser);
      const targetType = String(parseIdentifier(parser) || "").trim().toLowerCase();
      if (targetType !== "method" && targetType !== "signal") {
        throw ParseError("q-wasm bind target must be 'method' or 'signal'", parser.index);
      }

      skipWhitespace(parser);
      const targetName = String(parseIdentifier(parser) || "").trim();
      if (!targetName) {
        throw ParseError("Expected target name in q-wasm bind block", parser.index);
      }

      skipInlineWhitespace(parser);
      const trailing = parseBareValue(parser);
      if (String(trailing || "").trim()) {
        throw ParseError("Unexpected trailing content in q-wasm bind entry", parser.index);
      }

      const dedupeKey = exportName.toLowerCase() + "::" + targetType + "::" + targetName.toLowerCase();
      if (!seen.has(dedupeKey)) {
        seen.add(dedupeKey);
        out.push({
          exportName: exportName,
          targetType: targetType,
          targetName: targetName,
        });
      }

      skipWhitespaceAndSemicolons(parser);
      if (peek(parser) === ",") {
        consume(parser);
      }
    }
    return out;
  }

  function parseQWasmConfig(rawBody, keywordAliases) {
    const parser = parserFor(String(rawBody || ""));
    const config = {
      src: "",
      mode: "",
      awaitWasm: null,
      timeoutMs: null,
      maxPayloadBytes: null,
      exports: [],
      allowImports: [],
      bind: [],
    };
    const seen = {
      exports: new Set(),
      allowImports: new Set(),
      bind: new Set(),
    };

    function pushUnique(list, set, value) {
      const entry = String(value || "").trim();
      const key = entry.toLowerCase();
      if (!entry || set.has(key)) {
        return;
      }
      set.add(key);
      list.push(entry);
    }

    while (!eof(parser)) {
      skipWhitespaceAndSemicolons(parser);
      if (eof(parser)) {
        break;
      }
      const key = String(parseIdentifier(parser) || "").trim();
      const keyLower = key.toLowerCase();
      skipWhitespace(parser);

      if ((keyLower === "exports" || keyLower === "allowimports" || keyLower === "bind") && peek(parser) === "{") {
        consume(parser);
        const blockBody = String(readBalancedBlockContent(parser) || "");
        if (keyLower === "exports") {
          const names = parseQPropertyNames(blockBody);
          for (let i = 0; i < names.length; i += 1) {
            pushUnique(config.exports, seen.exports, names[i]);
          }
        } else if (keyLower === "allowimports") {
          const names = parseQPropertyNames(blockBody);
          for (let i = 0; i < names.length; i += 1) {
            pushUnique(config.allowImports, seen.allowImports, names[i]);
          }
        } else {
          const bindings = parseQWasmBindingRules(blockBody);
          for (let i = 0; i < bindings.length; i += 1) {
            const entry = bindings[i];
            if (!entry || typeof entry !== "object") {
              continue;
            }
            const dedupeKey =
              String(entry.exportName || "").toLowerCase() +
              "::" +
              String(entry.targetType || "").toLowerCase() +
              "::" +
              String(entry.targetName || "").toLowerCase();
            if (!dedupeKey || seen.bind.has(dedupeKey)) {
              continue;
            }
            seen.bind.add(dedupeKey);
            config.bind.push({
              exportName: String(entry.exportName || ""),
              targetType: String(entry.targetType || ""),
              targetName: String(entry.targetName || ""),
            });
          }
        }
        continue;
      }

      if (peek(parser) !== ":") {
        throw ParseError("Expected ':' or '{...}' inside q-wasm", parser.index);
      }
      consume(parser);
      const rawValue = parseValue(parser, keywordAliases);
      const value = String(coercePropertyValue(rawValue) || "").trim();

      if (keyLower === "src") {
        config.src = value;
      } else if (keyLower === "mode") {
        config.mode = normalizeWasmMode(value);
      } else if (keyLower === "awaitwasm") {
        config.awaitWasm = parseWasmBoolean(value);
      } else if (keyLower === "timeoutms") {
        config.timeoutMs = parseWasmPositiveInteger(value);
      } else if (keyLower === "maxpayloadbytes") {
        config.maxPayloadBytes = parseWasmPositiveInteger(value);
      } else if (keyLower === "exports") {
        const names = parseQPropertyNames(value);
        for (let i = 0; i < names.length; i += 1) {
          pushUnique(config.exports, seen.exports, names[i]);
        }
      } else if (keyLower === "allowimports") {
        const names = parseQPropertyNames(value);
        for (let i = 0; i < names.length; i += 1) {
          pushUnique(config.allowImports, seen.allowImports, names[i]);
        }
      } else if (keyLower === "bind") {
        const bindings = parseQWasmBindingRules(value);
        for (let i = 0; i < bindings.length; i += 1) {
          const entry = bindings[i];
          if (!entry || typeof entry !== "object") {
            continue;
          }
          const dedupeKey =
            String(entry.exportName || "").toLowerCase() +
            "::" +
            String(entry.targetType || "").toLowerCase() +
            "::" +
            String(entry.targetName || "").toLowerCase();
          if (!dedupeKey || seen.bind.has(dedupeKey)) {
            continue;
          }
          seen.bind.add(dedupeKey);
          config.bind.push({
            exportName: String(entry.exportName || ""),
            targetType: String(entry.targetType || ""),
            targetName: String(entry.targetName || ""),
          });
        }
      }
      skipWhitespaceAndSemicolons(parser);
      if (peek(parser) === ",") {
        consume(parser);
      }
    }

    return config;
  }

  function ParseError(message, index) {
    const error = new Error(message + " (at index " + index + ")");
    error.name = "QHtmlParseError";
    error.index = index;
    return error;
  }

  function KeywordAliasError(message, index) {
    const error = new Error(message + " (at index " + index + ")");
    error.name = "QHtmlKeywordAliasError";
    error.index = index;
    return error;
  }

  function parserFor(source) {
    return {
      source: String(source || ""),
      index: 0,
      length: String(source || "").length,
    };
  }

  function isIdentifierChar(ch) {
    return /[A-Za-z0-9_\-.#]/.test(ch);
  }

  function peek(parser, offset) {
    return parser.source.charAt(parser.index + (offset || 0));
  }

  function eof(parser) {
    return parser.index >= parser.length;
  }

  function consume(parser) {
    const ch = parser.source.charAt(parser.index);
    parser.index += 1;
    return ch;
  }

  function consumeComment(parser) {
    if (peek(parser) !== "/") {
      return false;
    }
    const next = peek(parser, 1);
    if (next === "/") {
      parser.index += 2;
      while (!eof(parser)) {
        const ch = peek(parser);
        if (ch === "\n" || ch === "\r") {
          break;
        }
        parser.index += 1;
      }
      return true;
    }
    if (next === "*") {
      const start = parser.index;
      parser.index += 2;
      while (!eof(parser) && !(peek(parser) === "*" && peek(parser, 1) === "/")) {
        parser.index += 1;
      }
      if (eof(parser)) {
        throw ParseError("Unterminated comment", start);
      }
      parser.index += 2;
      return true;
    }
    return false;
  }

  function skipWhitespace(parser) {
    while (!eof(parser)) {
      const ch = peek(parser);
      if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
        parser.index += 1;
        continue;
      }
      if (consumeComment(parser)) {
        continue;
      }
      break;
    }
  }

  function skipWhitespaceAndSemicolons(parser) {
    while (!eof(parser)) {
      const ch = peek(parser);
      if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r" || ch === ";") {
        parser.index += 1;
        continue;
      }
      if (consumeComment(parser)) {
        continue;
      }
      break;
    }
  }

  function skipInlineWhitespace(parser) {
    while (!eof(parser)) {
      const ch = peek(parser);
      if (ch === " " || ch === "\t") {
        parser.index += 1;
        continue;
      }
      break;
    }
  }

  function expect(parser, expected) {
    const ch = consume(parser);
    if (ch !== expected) {
      throw ParseError("Expected '" + expected + "' but found '" + ch + "'", parser.index - 1);
    }
  }

  function parseIdentifier(parser) {
    skipWhitespace(parser);
    const start = parser.index;
    while (!eof(parser) && isIdentifierChar(peek(parser))) {
      parser.index += 1;
    }
    if (parser.index === start) {
      throw ParseError("Expected identifier", parser.index);
    }
    return parser.source.slice(start, parser.index);
  }

  function isIdentifierStartChar(ch) {
    return /[A-Za-z_]/.test(String(ch || ""));
  }

  function scanIdentifierTokenAt(source, index) {
    const input = String(source || "");
    let cursor = Math.max(0, Number(index) || 0);
    const first = input.charAt(cursor);
    if (!isIdentifierStartChar(first)) {
      return null;
    }
    cursor += 1;
    while (cursor < input.length && isIdentifierChar(input.charAt(cursor))) {
      cursor += 1;
    }
    const name = input.slice(index, cursor);
    return {
      name: name,
      nameLower: String(name || "").toLowerCase(),
      end: cursor,
    };
  }

  function looksLikeHtmlSyntax(value) {
    const text = String(value || "");
    if (!text) {
      return false;
    }
    if (/<\s*\/?\s*[A-Za-z!][^>]*>/.test(text)) {
      return true;
    }
    if (/<!doctype[\s>]/i.test(text)) {
      return true;
    }
    if (/&[A-Za-z0-9#]+;/.test(text)) {
      return true;
    }
    return false;
  }

  function createRecoveredRawItem(rawSource, start, end) {
    const raw = String(rawSource || "");
    const meaningful = raw.trim();
    if (!meaningful) {
      return null;
    }
    if (looksLikeHtmlSyntax(meaningful)) {
      return {
        type: "HtmlBlock",
        html: meaningful,
        start: start,
        end: end,
        raw: raw,
      };
    }
    return {
      type: "TextBlock",
      text: meaningful,
      start: start,
      end: end,
      raw: raw,
    };
  }

  function isLikelyBlockItemStart(source, index, stopChar) {
    const token = scanIdentifierTokenAt(source, index);
    if (!token) {
      return false;
    }
    const cursor = skipWhitespaceInSource(source, token.end);
    const next = String(source || "").charAt(cursor);
    if (!next) {
      return true;
    }
    if (next === ":" || next === "," || next === "{" || next === ";" || next === "\n" || next === "\r") {
      return true;
    }
    if (stopChar && next === stopChar) {
      return true;
    }
    if (token.nameLower === "function") {
      return true;
    }
    if (token.nameLower === "q-alias") {
      return isIdentifierStartChar(next) || next === "{";
    }
    if (token.nameLower === "q-keyword") {
      return isIdentifierStartChar(next);
    }
    if (isEventBlockName(token.name) && next === "{") {
      return true;
    }
    return false;
  }

  function isLikelyTopLevelItemStart(source, index) {
    const token = scanIdentifierTokenAt(source, index);
    if (!token) {
      return false;
    }
    const cursor = skipWhitespaceInSource(source, token.end);
    const next = String(source || "").charAt(cursor);
    const nameLower = token.nameLower;
    if (!next) {
      return true;
    }
    if (LIFECYCLE_BLOCKS.has(nameLower)) {
      return next === "{";
    }
    if (
      nameLower === "q-template" ||
      nameLower === "q-component" ||
      nameLower === "q-signal" ||
      nameLower === "q-rewrite" ||
      nameLower === "q-macro" ||
      nameLower === "q-array" ||
      isQObjectKeyword(nameLower) ||
      REPEATER_KEYWORDS.has(nameLower) ||
      nameLower === "q-style" ||
      nameLower === "q-theme" ||
      nameLower === "q-default-theme"
    ) {
      return isIdentifierStartChar(next) || next === "{";
    }
    if (nameLower === "q-sdml-component") {
      return isIdentifierStartChar(next) || next === "{";
    }
    if (nameLower === "sdml-endpoint") {
      return isIdentifierStartChar(next) || next === "{";
    }
    if (nameLower === "q-keyword") {
      return isIdentifierStartChar(next);
    }
    if (nameLower === "q-import" || nameLower === "html") {
      return next === "{";
    }
    if (next === "{" || next === ",") {
      return true;
    }
    return false;
  }

  function consumeRecoverableRaw(parser, options) {
    const opts = options || {};
    const mode = String(opts.mode || "block").toLowerCase() === "top" ? "top" : "block";
    const stopChar = typeof opts.stopChar === "string" ? opts.stopChar : "";
    const source = String(parser.source || "");
    const start = parser.index;
    let cursor = start;
    while (cursor < parser.length) {
      const ch = source.charAt(cursor);
      if (stopChar && ch === stopChar) {
        break;
      }
      if (isIdentifierStartChar(ch)) {
        const atBoundary = mode === "top"
          ? isLikelyTopLevelItemStart(source, cursor)
          : isLikelyBlockItemStart(source, cursor, stopChar);
        if (atBoundary) {
          break;
        }
      }
      cursor += 1;
    }
    if (cursor === start && cursor < parser.length) {
      cursor += 1;
    }
    parser.index = cursor;
    return createRecoveredRawItem(source.slice(start, cursor), start, cursor);
  }

  function parseQuotedString(parser) {
    const quote = consume(parser);
    let out = "";

    while (!eof(parser)) {
      const ch = consume(parser);
      if (ch === "\\") {
        const escaped = consume(parser);
        if (escaped === "n") {
          out += "\n";
        } else if (escaped === "r") {
          out += "\r";
        } else if (escaped === "t") {
          out += "\t";
        } else if (escaped === quote) {
          out += quote;
        } else if (escaped === "\\") {
          out += "\\";
        } else {
          out += escaped;
        }
        continue;
      }
      if (ch === quote) {
        return out;
      }
      out += ch;
    }

    throw ParseError("Unterminated string", parser.index);
  }

  function parseBareValue(parser) {
    const start = parser.index;
    while (!eof(parser)) {
      const ch = peek(parser);
      if (ch === "\n" || ch === "\r" || ch === ";" || ch === "}") {
        break;
      }
      parser.index += 1;
    }
    return parser.source.slice(start, parser.index).trim();
  }

  function tryParseLooseLiteral(rawText) {
    const text = String(rawText || "").trim();
    if (!text) {
      return {
        matched: false,
        value: null,
      };
    }
    try {
      return {
        matched: true,
        value: JSON.parse(text),
      };
    } catch (jsonError) {
      try {
        return {
          matched: true,
          value: new Function("return (" + text + ");")(),
        };
      } catch (scriptError) {
        return {
          matched: false,
          value: null,
        };
      }
    }
  }

  function parseTypedNumericLiteral(parser) {
    const remainder = parser.source.slice(parser.index);
    const match = remainder.match(/^-?(?:\d+\.\d+|\d+|\.\d+)(?:[eE][+-]?\d+)?/);
    if (!match) {
      return {
        matched: false,
        value: null,
      };
    }
    const token = String(match[0] || "");
    if (!token) {
      return {
        matched: false,
        value: null,
      };
    }
    const nextChar = remainder.charAt(token.length);
    if (nextChar && /[A-Za-z_#.]/.test(nextChar)) {
      return {
        matched: false,
        value: null,
      };
    }
    const value = Number(token);
    if (!Number.isFinite(value)) {
      return {
        matched: false,
        value: null,
      };
    }
    parser.index += token.length;
    return {
      matched: true,
      value: value,
    };
  }

  function parseTypedArrayBodyToValue(rawBody, keywordAliases) {
    const body = String(rawBody || "");
    const trimmedBody = body.trim();
    if (!trimmedBody) {
      return [];
    }
    if (trimmedBody.charAt(0) === "[" && trimmedBody.charAt(trimmedBody.length - 1) === "]") {
      const parsedLiteral = tryParseLooseLiteral(trimmedBody);
      if (parsedLiteral.matched) {
        if (Array.isArray(parsedLiteral.value)) {
          return parsedLiteral.value;
        }
        return [parsedLiteral.value];
      }
    }

    const parser = parserFor(body);
    const out = [];
    while (!eof(parser)) {
      skipWhitespace(parser);
      while (peek(parser) === "," || peek(parser) === ";") {
        consume(parser);
        skipWhitespace(parser);
      }
      if (eof(parser)) {
        break;
      }
      const valueStart = parser.index;
      out.push(parseTypedValueLiteral(parser, keywordAliases));
      if (parser.index === valueStart) {
        parser.index += 1;
      }
      skipWhitespace(parser);
      if (peek(parser) === "," || peek(parser) === ";") {
        consume(parser);
      }
    }
    return out;
  }

  function parseTypedMapBodyToValue(rawBody, keywordAliases) {
    const parser = parserFor(String(rawBody || ""));
    const out = {};

    while (!eof(parser)) {
      skipWhitespace(parser);
      while (peek(parser) === "," || peek(parser) === ";") {
        consume(parser);
        skipWhitespace(parser);
      }
      if (eof(parser)) {
        break;
      }

      let key = "";
      const keyFirst = peek(parser);
      if (keyFirst === '"' || keyFirst === "'") {
        key = parseQuotedString(parser);
      } else if (isIdentifierStartChar(keyFirst)) {
        key = parseIdentifier(parser);
      } else {
        const keyStart = parser.index;
        while (!eof(parser)) {
          const ch = peek(parser);
          if (ch === ":" || ch === "," || ch === ";" || ch === "\n" || ch === "\r" || ch === " " || ch === "\t") {
            break;
          }
          parser.index += 1;
        }
        key = parser.source.slice(keyStart, parser.index).trim();
      }

      const normalizedKey = String(key || "").trim();
      if (!normalizedKey) {
        const fallbackStart = parser.index;
        parseTypedValueLiteral(parser, keywordAliases);
        if (parser.index === fallbackStart) {
          parser.index += 1;
        }
        continue;
      }

      skipWhitespace(parser);
      if (peek(parser) !== ":") {
        out[normalizedKey] = true;
        continue;
      }
      consume(parser);
      out[normalizedKey] = parseTypedValueLiteral(parser, keywordAliases);

      skipWhitespace(parser);
      if (peek(parser) === "," || peek(parser) === ";") {
        consume(parser);
      }
    }

    return out;
  }

  function parseTypedContainerValue(parser, keywordAliases) {
    const snapshot = parser.index;
    if (!isIdentifierStartChar(peek(parser))) {
      return {
        matched: false,
        value: null,
      };
    }
    const keyword = parseIdentifier(parser);
    const lowerKeyword = String(keyword || "").trim().toLowerCase();
    const isQArray = lowerKeyword === "q-array";
    const isQMap = isQObjectKeyword(lowerKeyword);
    if (!isQArray && !isQMap) {
      parser.index = snapshot;
      return {
        matched: false,
        value: null,
      };
    }

    skipWhitespace(parser);
    if (peek(parser) !== "{") {
      if (isIdentifierStartChar(peek(parser))) {
        parseIdentifier(parser);
        skipWhitespace(parser);
      }
    }
    if (peek(parser) !== "{") {
      parser.index = snapshot;
      return {
        matched: false,
        value: null,
      };
    }

    consume(parser);
    const body = readBalancedBlockContent(parser);
    return {
      matched: true,
      value: isQArray
        ? parseTypedArrayBodyToValue(body, keywordAliases)
        : parseTypedMapBodyToValue(body, keywordAliases),
    };
  }

  function parseTypedValueLiteral(parser, keywordAliases) {
    skipWhitespace(parser);
    if (eof(parser)) {
      return "";
    }

    const first = peek(parser);
    if (first === '"' || first === "'") {
      return parseQuotedString(parser);
    }

    const nestedContainer = parseTypedContainerValue(parser, keywordAliases);
    if (nestedContainer.matched) {
      return nestedContainer.value;
    }

    const numeric = parseTypedNumericLiteral(parser);
    if (numeric.matched) {
      return numeric.value;
    }

    if (isIdentifierStartChar(first)) {
      const token = parseIdentifier(parser);
      const lower = String(token || "").trim().toLowerCase();
      if (lower === "true") {
        return true;
      }
      if (lower === "false") {
        return false;
      }
      if (lower === "null") {
        return null;
      }
      return token;
    }

    const tokenStart = parser.index;
    while (!eof(parser)) {
      const ch = peek(parser);
      if (ch === "," || ch === ";" || ch === "\n" || ch === "\r" || ch === " " || ch === "\t") {
        break;
      }
      parser.index += 1;
    }
    const token = parser.source.slice(tokenStart, parser.index).trim();
    if (!token) {
      return "";
    }
    if (token === "true") {
      return true;
    }
    if (token === "false") {
      return false;
    }
    if (token === "null") {
      return null;
    }
    const numericToken = Number(token);
    if (Number.isFinite(numericToken)) {
      return numericToken;
    }
    return token;
  }

  function resolveBindingExpressionKeyword(lowerKeyword, keywordAliases) {
    const normalized = String(lowerKeyword || "").trim().toLowerCase();
    if (BINDING_EXPRESSION_KEYWORDS.has(normalized)) {
      return normalized;
    }
    if (!(keywordAliases instanceof Map)) {
      return "";
    }
    const aliasSpec = keywordAliases.get(normalized);
    if (!aliasSpec || typeof aliasSpec !== "object") {
      return "";
    }
    const mapped = String(
      aliasSpec.replacementFirstLower || readFirstIdentifierLower(String(aliasSpec.replacementHead || ""))
    )
      .trim()
      .toLowerCase();
    return BINDING_EXPRESSION_KEYWORDS.has(mapped) ? mapped : "";
  }

  function parseExpressionValue(parser, keywordAliases) {
    const snapshot = parser.index;
    const first = peek(parser);
    if (!/[A-Za-z_]/.test(String(first || ""))) {
      return null;
    }
    const keyword = parseIdentifier(parser);
    const lowerKeyword = String(keyword || "").trim().toLowerCase();
    const resolvedKeyword = resolveBindingExpressionKeyword(lowerKeyword, keywordAliases);
    if (!resolvedKeyword) {
      parser.index = snapshot;
      return null;
    }

    skipWhitespace(parser);
    if (peek(parser) !== "{") {
      parser.index = snapshot;
      return null;
    }

    consume(parser);
    const scriptBody = readBalancedBlockContent(parser);
    return {
      type: "QScriptExpression",
      keyword: resolvedKeyword,
      script: scriptBody,
      raw: parser.source.slice(snapshot, parser.index),
      start: snapshot,
      end: parser.index,
    };
  }

  function parseValue(parser, keywordAliases) {
    skipWhitespace(parser);
    const ch = peek(parser);
    if (ch === '"' || ch === "'") {
      return parseQuotedString(parser);
    }
    const expression = parseExpressionValue(parser, keywordAliases);
    if (expression) {
      return expression;
    }
    const typedContainer = parseTypedContainerValue(parser, keywordAliases);
    if (typedContainer.matched) {
      return typedContainer.value;
    }
    return parseBareValue(parser);
  }

  function parseSelectorList(parser, firstSelector) {
    const selectors = [firstSelector || parseSelectorToken(parser)];
    skipWhitespace(parser);
    while (peek(parser) === ",") {
      consume(parser);
      skipWhitespace(parser);
      selectors.push(parseSelectorToken(parser));
      skipWhitespace(parser);
    }
    return selectors;
  }

  function isValidSelectorToken(token) {
    const value = String(token || "").trim();
    if (!value) {
      return false;
    }
    if (!/^(?:[^.#\s]+)?(?:[.#][A-Za-z_][A-Za-z0-9_-]*)*$/.test(value)) {
      return false;
    }
    if (value.charAt(0) === "." || value.charAt(0) === "#") {
      return /^(?:[.#][A-Za-z_][A-Za-z0-9_-]*)+$/.test(value);
    }
    return true;
  }

  function parseSelectorTokenTail(parser, baseToken) {
    let token = String(baseToken || "");

    while (peek(parser) === "." || peek(parser) === "#") {
      const marker = consume(parser);
      if (!isIdentifierStartChar(peek(parser))) {
        throw ParseError("Expected identifier after '" + marker + "' in selector", parser.index);
      }
      token += marker + parseIdentifier(parser);
    }

    if (!isValidSelectorToken(token)) {
      throw ParseError("Invalid selector token '" + token + "'", parser.index);
    }
    return token;
  }

  function parseSelectorToken(parser) {
    skipWhitespace(parser);
    const start = parser.index;
    let token = "";
    if (isIdentifierStartChar(peek(parser))) {
      token = String(parseIdentifier(parser) || "");
    } else if (peek(parser) === "." || peek(parser) === "#") {
      while (peek(parser) === "." || peek(parser) === "#") {
        const marker = consume(parser);
        if (!isIdentifierStartChar(peek(parser))) {
          throw ParseError("Expected identifier after '" + marker + "' in selector", parser.index);
        }
        token += marker + parseIdentifier(parser);
      }
    }
    if (!token) {
      throw ParseError("Expected selector", start);
    }
    return parseSelectorTokenTail(parser, token);
  }

  function readBalancedBlockContent(parser) {
    let depth = 1;
    let quote = "";
    let escaped = false;
    let inLineComment = false;
    let inBlockComment = false;
    let out = "";

    while (!eof(parser)) {
      const ch = consume(parser);
      const next = peek(parser);

      if (inLineComment) {
        out += ch;
        if (ch === "\n" || ch === "\r") {
          inLineComment = false;
        }
        continue;
      }

      if (inBlockComment) {
        out += ch;
        if (ch === "*" && next === "/") {
          out += consume(parser);
          inBlockComment = false;
        }
        continue;
      }

      if (quote) {
        if (escaped) {
          out += ch;
          escaped = false;
          continue;
        }
        if (ch === "\\") {
          out += ch;
          escaped = true;
          continue;
        }
        if (ch === quote) {
          quote = "";
        }
        out += ch;
        continue;
      }

      if (ch === '"' || ch === "'" || ch === "`") {
        quote = ch;
        out += ch;
        continue;
      }

      if (ch === "/" && next === "/") {
        out += ch;
        out += consume(parser);
        inLineComment = true;
        continue;
      }

      if (ch === "/" && next === "*") {
        out += ch;
        out += consume(parser);
        inBlockComment = true;
        continue;
      }

      if (ch === "\\") {
        if (next === "{" || next === "}" || next === "\\") {
          out += consume(parser);
          continue;
        }
        out += ch;
        continue;
      }

      if (ch === "{") {
        depth += 1;
        out += ch;
      } else if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          return out;
        }
        out += ch;
      } else {
        out += ch;
      }
    }

    throw ParseError("Unterminated block", parser.index);
  }

  function isEventBlockName(name) {
    return /^on[A-Za-z0-9_]+$/i.test(String(name || ""));
  }

  function parseLeadingSelectorDirectiveBlocks(parser) {
    const directives = [];

    while (!eof(parser)) {
      skipWhitespace(parser);
      const snapshot = parser.index;
      if (peek(parser) !== "{") {
        break;
      }

      consume(parser);
      const rawBody = readBalancedBlockContent(parser);
      const value = String(rawBody || "").trim();

      skipWhitespace(parser);
      const looksDirective = !!value && /^[A-Za-z0-9_-]+(?:\s+[A-Za-z0-9_-]+)*$/.test(value);
      if (!looksDirective || peek(parser) !== "{") {
        parser.index = snapshot;
        break;
      }

      directives.push(value);
    }

    return directives;
  }

  function parseQPropertyNames(rawBody) {
    const input = String(rawBody || "");
    const names = [];
    const seen = new Set();
    const matches = input.match(/[A-Za-z_][A-Za-z0-9_-]*/g) || [];
    for (let i = 0; i < matches.length; i += 1) {
      const name = String(matches[i] || "").trim();
      const normalized = name.toLowerCase();
      if (!name || seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      names.push(name);
    }
    return names;
  }

  function normalizeQLoggerCategoryToken(rawToken) {
    const token = String(rawToken || "").trim().toLowerCase();
    if (!token) {
      return "";
    }
    const condensed = token.replace(/[^a-z0-9]/g, "");
    if (condensed === "all" || condensed === "qall") {
      return "all";
    }
    if (condensed === "property" || condensed === "qproperty") {
      return "q-property";
    }
    if (condensed === "signal" || condensed === "qsignal") {
      return "q-signal";
    }
    if (condensed === "component" || condensed === "qcomponent") {
      return "q-component";
    }
    if (condensed === "function" || condensed === "qfunction") {
      return "function";
    }
    if (condensed === "slot" || condensed === "qslot") {
      return "slot";
    }
    if (condensed === "model" || condensed === "qmodel") {
      return "model";
    }
    if (condensed === "instantiation" || condensed === "instantiate" || condensed === "qinstantiation") {
      return "instantiation";
    }
    return token;
  }

  function parseQLoggerCategoriesFromAstItems(items) {
    const out = [];
    const seen = new Set();
    const list = Array.isArray(items) ? items : [];
    function appendToken(rawToken) {
      const normalized = normalizeQLoggerCategoryToken(rawToken);
      if (!normalized || seen.has(normalized)) {
        return;
      }
      seen.add(normalized);
      out.push(normalized);
    }
    function appendTextTokens(rawText) {
      const matches = String(rawText || "").match(/[A-Za-z_][A-Za-z0-9_-]*/g) || [];
      for (let i = 0; i < matches.length; i += 1) {
        appendToken(matches[i]);
      }
    }
    for (let i = 0; i < list.length; i += 1) {
      const item = list[i];
      if (!item || typeof item !== "object") {
        continue;
      }
      if (item.type === "BareWord") {
        appendToken(item.name);
        continue;
      }
      if (item.type === "RawTextLine" || item.type === "TextBlock") {
        appendTextTokens(item.text);
        continue;
      }
      if (item.type === "Property") {
        appendToken(item.name);
        continue;
      }
      if (item.type === "Element") {
        const selectors = Array.isArray(item.selectors) ? item.selectors : [];
        if (selectors.length === 1) {
          const token = parseTagToken(selectors[0]);
          appendToken(token && token.tag);
        }
      }
    }
    return out;
  }

  function extractQLoggerCategoriesFromElement(item) {
    if (!item || item.type !== "Element") {
      return null;
    }
    const selectors = Array.isArray(item.selectors) ? item.selectors : [];
    if (selectors.length !== 1) {
      return null;
    }
    const token = parseTagToken(selectors[0]);
    const tagLower = String(token && token.tag || "").trim().toLowerCase();
    if (tagLower !== "q-logger") {
      return null;
    }
    return parseQLoggerCategoriesFromAstItems(item.items);
  }

  function parseQColorIdentifier(parser, keyword) {
    skipWhitespace(parser);
    const start = parser.index;
    while (!eof(parser)) {
      const ch = peek(parser);
      if (!ch || ch === "{" || ch === "}" || ch === ":" || ch === "," || ch === ";" || /\s/.test(ch)) {
        break;
      }
      parser.index += 1;
    }
    const value = parser.source.slice(start, parser.index).trim();
    if (!value) {
      throw ParseError("Expected identifier after " + String(keyword || "q-color"), parser.index);
    }
    return value;
  }

  function isLikelyCssColorValue(value) {
    const text = String(value || "").trim();
    if (!text) {
      return false;
    }
    if (/^#[0-9a-f]{3,8}$/i.test(text)) {
      return true;
    }
    if (/^(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)\s*\(/i.test(text)) {
      return true;
    }
    if (/^var\s*\(/i.test(text)) {
      return true;
    }
    if (/gradient\s*\(/i.test(text)) {
      return true;
    }
    if (/^(?:transparent|currentcolor|inherit|initial|unset|revert|revert-layer)$/i.test(text)) {
      return true;
    }
    if (/^[A-Za-z][A-Za-z0-9_-]*$/.test(text)) {
      return true;
    }
    return false;
  }

  function normalizeColorLookupKey(name) {
    return String(name || "")
      .trim()
      .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }

  function normalizeColorLookupPattern(name) {
    return String(name || "")
      .trim()
      .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
      .toLowerCase()
      .replace(/[^a-z0-9*]/g, "");
  }

  function hasQColorWildcardPattern(name) {
    return normalizeColorLookupPattern(name).indexOf("*") >= 0;
  }

  function doesQColorRequestMatchAreaName(requestPattern, areaName) {
    const pattern = normalizeColorLookupPattern(requestPattern);
    const candidate = normalizeColorLookupKey(areaName);
    if (!pattern || !candidate) {
      return false;
    }
    if (pattern.indexOf("*") < 0) {
      return pattern === candidate;
    }
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp("^" + escaped.replace(/\*/g, ".*") + "$");
    return regex.test(candidate);
  }

  function doesQColorRequestMatchAnyArea(requestPatterns, areaName) {
    const patterns = Array.isArray(requestPatterns) ? requestPatterns : [];
    for (let i = 0; i < patterns.length; i += 1) {
      if (doesQColorRequestMatchAreaName(patterns[i], areaName)) {
        return true;
      }
    }
    return false;
  }

  function normalizeQColorResolvedValue(value) {
    const raw = String(value == null ? "" : value).trim();
    if (!raw) {
      return "";
    }
    if (/^--[A-Za-z0-9_-]+$/.test(raw)) {
      return "var(" + raw + ")";
    }
    return raw;
  }

  function levenshtein(a, b) {
    const m = a.length;
    const n = b.length;
    const dp = Array.from({ length: m + 1 }, function makeRow() {
      return Array(n + 1).fill(0);
    });

    for (let i = 0; i <= m; i += 1) {
      dp[i][0] = i;
    }
    for (let j = 0; j <= n; j += 1) {
      dp[0][j] = j;
    }

    for (let i = 1; i <= m; i += 1) {
      for (let j = 1; j <= n; j += 1) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + cost
        );
      }
    }
    return dp[m][n];
  }

  function bigrams(s) {
    const g = [];
    for (let i = 0; i < s.length - 1; i += 1) {
      g.push(s.slice(i, i + 2));
    }
    return g;
  }

  function bigramScore(a, b) {
    const A = bigrams(a);
    const B = bigrams(b);
    let match = 0;
    for (let i = 0; i < A.length; i += 1) {
      if (B.includes(A[i])) {
        match += 1;
      }
    }
    return match / Math.max(A.length, B.length);
  }

  function splitTokens(s) {
    return String(s || "")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .toLowerCase()
      .split(/[\s\-_]+/);
  }

  function buildTokenIndex(choices) {
    const vocab = new Set();
    for (let i = 0; i < choices.length; i += 1) {
      const tokens = splitTokens(choices[i]);
      for (let j = 0; j < tokens.length; j += 1) {
        vocab.add(tokens[j]);
      }
    }
    return Array.from(vocab);
  }

  function tokenScore(query, vocab) {
    const q = String(query || "").toLowerCase();
    let score = 0;
    for (let i = 0; i < vocab.length; i += 1) {
      if (q.includes(vocab[i])) {
        score += 1;
      }
    }
    return score;
  }

  function fuzzyResolve(query, choices, topK) {
    const limit = Number.isFinite(topK) ? Math.max(1, Math.floor(topK)) : 5;
    const vocab = buildTokenIndex(choices);
    const ranked = choices.map(function mapCandidate(candidate) {
      const tokScore = tokenScore(query, vocab);
      const bigScore = bigramScore(query, candidate);
      const lev = levenshtein(query, candidate);
      const score = tokScore * 5 + bigScore * 4 - lev * 0.5;
      return { candidate: candidate, score: score };
    });
    ranked.sort(function sortByScore(a, b) {
      return b.score - a.score;
    });
    return ranked.slice(0, limit);
  }

  function parseQColorValueToken(parser, keywordAliases) {
    skipWhitespace(parser);
    const expression = parseExpressionValue(parser, keywordAliases);
    if (expression) {
      return String(expression.raw || "").trim();
    }
    const start = parser.index;
    let quote = "";
    let escaped = false;
    let parenDepth = 0;
    let bracketDepth = 0;
    while (!eof(parser)) {
      const ch = peek(parser);
      if (quote) {
        parser.index += 1;
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === "\\") {
          escaped = true;
          continue;
        }
        if (ch === quote) {
          quote = "";
        }
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") {
        quote = ch;
        parser.index += 1;
        continue;
      }
      if (ch === "(") {
        parenDepth += 1;
        parser.index += 1;
        continue;
      }
      if (ch === ")" && parenDepth > 0) {
        parenDepth -= 1;
        parser.index += 1;
        continue;
      }
      if (ch === "[") {
        bracketDepth += 1;
        parser.index += 1;
        continue;
      }
      if (ch === "]" && bracketDepth > 0) {
        bracketDepth -= 1;
        parser.index += 1;
        continue;
      }
      if (parenDepth === 0 && bracketDepth === 0) {
        if (ch === "," || ch === ";" || ch === "\n" || ch === "\r" || ch === "}") {
          break;
        }
      }
      parser.index += 1;
    }
    return parser.source.slice(start, parser.index).trim();
  }

  function parseQColorAssignments(rawBody, keywordAliases) {
    const parser = parserFor(String(rawBody || ""));
    const out = {};
    while (!eof(parser)) {
      skipWhitespaceAndSemicolons(parser);
      if (eof(parser)) {
        break;
      }
      const key = parseQColorIdentifier(parser, "q-color-theme");
      skipWhitespace(parser);
      let value = "";
      if (peek(parser) === ":") {
        consume(parser);
        value = parseQColorValueToken(parser, keywordAliases);
      } else if (peek(parser) === "{") {
        consume(parser);
        value = String(readBalancedBlockContent(parser) || "").trim();
      } else {
        throw ParseError("Expected ':' or '{...}' inside q-color-theme", parser.index);
      }
      if (value) {
        out[key] = value;
      }
      skipWhitespaceAndSemicolons(parser);
      if (peek(parser) === ",") {
        consume(parser);
      }
    }
    return out;
  }

  function parseQColorSchemaEntries(rawBody) {
    const parser = parserFor(String(rawBody || ""));
    const out = {};
    while (!eof(parser)) {
      skipWhitespaceAndSemicolons(parser);
      if (eof(parser)) {
        break;
      }
      const areaName = parseQColorIdentifier(parser, "q-color-schema");
      skipWhitespace(parser);
      if (peek(parser) !== "{") {
        throw ParseError("Expected '{' inside q-color-schema", parser.index);
      }
      consume(parser);
      const body = String(readBalancedBlockContent(parser) || "").trim();
      if (normalizeColorLookupKey(areaName) === "area") {
        const names = body.match(/[A-Za-z_][A-Za-z0-9_-]*/g) || [];
        for (let i = 0; i < names.length; i += 1) {
          const area = String(names[i] || "").trim();
          if (!area) {
            continue;
          }
          out[area] = inferQColorCssProperty(area);
        }
      } else {
        out[areaName] = body || inferQColorCssProperty(areaName);
      }
      skipWhitespaceAndSemicolons(parser);
      if (peek(parser) === ",") {
        consume(parser);
      }
    }
    return out;
  }

  function parseQColorApplyBlock(rawBody, keywordAliases) {
    const parser = parserFor(String(rawBody || ""));
    const out = {
      areas: [],
      assignments: {},
    };
    const seen = new Set();
    while (!eof(parser)) {
      skipWhitespaceAndSemicolons(parser);
      if (eof(parser)) {
        break;
      }
      const areaName = parseQColorIdentifier(parser, "q-color");
      const normalized = normalizeColorLookupPattern(areaName);
      skipWhitespace(parser);
      if (peek(parser) === ":") {
        consume(parser);
        const value = parseQColorValueToken(parser, keywordAliases);
        if (value) {
          out.assignments[areaName] = value;
        }
      } else {
        if (normalized && !seen.has(normalized)) {
          seen.add(normalized);
          out.areas.push(areaName);
          out.assignments[areaName] = true;
        }
      }
      skipWhitespaceAndSemicolons(parser);
      if (peek(parser) === ",") {
        consume(parser);
      }
    }
    return out;
  }

  function parseQStyleDeclarations(rawBody, keywordAliases) {
    const parser = parserFor(String(rawBody || ""));
    const out = {};
    const classes = [];
    const seenClasses = new Set();
    const styleClassKeywords = collectAliasesTargeting(keywordAliases, "q-style-class");
    while (!eof(parser)) {
      skipWhitespaceAndSemicolons(parser);
      if (eof(parser)) {
        break;
      }
      const propertyName = parseQColorIdentifier(parser, "q-style");
      const propertyLower = String(propertyName || "").trim().toLowerCase();
      skipWhitespace(parser);
      if (styleClassKeywords.has(propertyLower)) {
        if (peek(parser) !== "{") {
          throw ParseError("Expected '{...}' after q-style-class inside q-style", parser.index);
        }
        consume(parser);
        const classBody = String(readBalancedBlockContent(parser) || "");
        const parsedClasses = parseQPropertyNames(classBody);
        if (parsedClasses.length === 0) {
          if (typeof console !== "undefined" && console && typeof console.warn === "function") {
            console.warn("qhtml q-style warning: q-style-class has no class names", {
              styleBlock: String(rawBody || "").trim(),
            });
          }
        } else {
          for (let i = 0; i < parsedClasses.length; i += 1) {
            const className = String(parsedClasses[i] || "").trim();
            const normalizedClass = className.toLowerCase();
            if (!className || seenClasses.has(normalizedClass)) {
              continue;
            }
            seenClasses.add(normalizedClass);
            classes.push(className);
          }
        }
        skipWhitespaceAndSemicolons(parser);
        if (peek(parser) === ",") {
          consume(parser);
        }
        continue;
      }
      let value = "";
      if (peek(parser) === ":") {
        consume(parser);
        value = parseQColorValueToken(parser, keywordAliases);
      } else if (peek(parser) === "{") {
        consume(parser);
        value = String(readBalancedBlockContent(parser) || "").trim();
      } else {
        throw ParseError("Expected ':' or '{...}' inside q-style", parser.index);
      }
      if (value) {
        out[propertyName] = value;
      }
      skipWhitespaceAndSemicolons(parser);
      if (peek(parser) === ",") {
        consume(parser);
      }
    }
    return {
      declarations: out,
      classes: classes,
    };
  }

  function parseQThemeRules(rawBody) {
    const parser = parserFor(String(rawBody || ""));
    const out = [];
    while (!eof(parser)) {
      skipWhitespaceAndSemicolons(parser);
      if (eof(parser)) {
        break;
      }
      const selector = parseQColorIdentifier(parser, "q-theme");
      skipWhitespace(parser);
      if (peek(parser) !== "{") {
        throw ParseError("Expected '{...}' inside q-theme", parser.index);
      }
      consume(parser);
      const body = String(readBalancedBlockContent(parser) || "").trim();
      const styleNames = parseQPropertyNames(body);
      out.push({
        selector: selector,
        styles: styleNames,
      });
      skipWhitespaceAndSemicolons(parser);
      if (peek(parser) === ",") {
        consume(parser);
      }
    }
    return out;
  }

  function readBalancedParenthesizedContent(parser) {
    let depth = 1;
    let quote = "";
    let escaped = false;
    let out = "";

    while (!eof(parser)) {
      const ch = consume(parser);

      if (quote) {
        if (escaped) {
          out += ch;
          escaped = false;
          continue;
        }
        if (ch === "\\") {
          out += ch;
          escaped = true;
          continue;
        }
        if (ch === quote) {
          quote = "";
        }
        out += ch;
        continue;
      }

      if (ch === '"' || ch === "'" || ch === "`") {
        quote = ch;
        out += ch;
        continue;
      }

      if (ch === "\\") {
        const next = peek(parser);
        if (next === "(" || next === ")" || next === "\\") {
          out += consume(parser);
          continue;
        }
        out += ch;
        continue;
      }

      if (ch === "(") {
        depth += 1;
        out += ch;
      } else if (ch === ")") {
        depth -= 1;
        if (depth === 0) {
          return out;
        }
        out += ch;
      } else {
        out += ch;
      }
    }

    throw ParseError("Unterminated signal parameter list", parser.index);
  }

  function parseSignalParameterNames(rawParams) {
    const text = String(rawParams || "");
    if (!text.trim()) {
      return [];
    }
    const out = [];
    const seen = new Set();
    const parts = text.split(",");
    for (let i = 0; i < parts.length; i += 1) {
      const token = String(parts[i] || "").trim();
      if (!token) {
        continue;
      }
      const match = token.match(/^[A-Za-z_$][A-Za-z0-9_$]*/);
      if (!match) {
        continue;
      }
      const name = String(match[0] || "").trim();
      const normalized = name.toLowerCase();
      if (!name || seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      out.push(name);
    }
    return out;
  }

  function cloneKeywordAliases(keywordAliases) {
    if (keywordAliases instanceof Map) {
      return new Map(keywordAliases);
    }
    return new Map();
  }

  function keywordAliasesToObject(keywordAliases) {
    if (!(keywordAliases instanceof Map) || keywordAliases.size === 0) {
      return null;
    }
    const out = {};
    keywordAliases.forEach(function eachAlias(spec, key) {
      const aliasName = String((spec && spec.name) || key || "").trim();
      const replacementHead = String((spec && spec.replacementHead) || "").trim();
      if (!aliasName || !replacementHead) {
        return;
      }
      out[aliasName] = replacementHead;
    });
    return Object.keys(out).length > 0 ? out : null;
  }

  function readFirstIdentifierLower(text) {
    const input = String(text || "");
    const start = skipWhitespaceInSource(input, 0);
    const token = scanIdentifierTokenAt(input, start);
    return token && token.nameLower ? token.nameLower : "";
  }

  function readSingleIdentifierLower(text) {
    const input = String(text || "");
    const start = skipWhitespaceInSource(input, 0);
    const token = scanIdentifierTokenAt(input, start);
    if (!token || !token.nameLower) {
      return "";
    }
    const end = skipWhitespaceInSource(input, token.end);
    if (end < input.length) {
      return "";
    }
    return token.nameLower;
  }

  function parseKeywordAliasDeclaration(parser, keywordAliases, declarationStart) {
    const aliasName = parseIdentifier(parser);
    const normalizedAliasName = String(aliasName || "").trim();
    const normalizedAliasLower = normalizedAliasName.toLowerCase();
    if (!normalizedAliasName) {
      throw ParseError("Expected alias name after q-keyword", parser.index);
    }

    skipWhitespace(parser);
    if (peek(parser) !== "{") {
      throw ParseError("Expected '{' after q-keyword alias name", parser.index);
    }
    consume(parser);

    const replacementHeadRaw = readBalancedBlockContent(parser);
    const replacementHead = String(replacementHeadRaw || "").trim();
    if (!replacementHead) {
      throw KeywordAliasError("q-keyword replacement cannot be empty", declarationStart);
    }

    let effectiveAliasName = normalizedAliasName;
    let effectiveAliasLower = normalizedAliasLower;
    let effectiveReplacementHead = replacementHead;
    let replacementFirstLower = readFirstIdentifierLower(effectiveReplacementHead);

    const singleReplacementLower = readSingleIdentifierLower(effectiveReplacementHead);
    if (
      CANONICAL_KEYWORD_TARGETS.has(normalizedAliasLower) &&
      singleReplacementLower &&
      !CANONICAL_KEYWORD_TARGETS.has(singleReplacementLower)
    ) {
      // Accept reversed declarations too:
      // q-keyword q-component { component } -> q-keyword component { q-component }
      effectiveAliasName = singleReplacementLower;
      effectiveAliasLower = singleReplacementLower;
      effectiveReplacementHead = normalizedAliasName;
      replacementFirstLower = normalizedAliasLower;
    }

    if (replacementFirstLower && replacementFirstLower === effectiveAliasLower) {
      throw KeywordAliasError("q-keyword '" + effectiveAliasName + "' cannot reference itself", declarationStart);
    }
    if (replacementFirstLower && keywordAliases instanceof Map && keywordAliases.has(replacementFirstLower)) {
      throw KeywordAliasError(
        "q-keyword '" + effectiveAliasName + "' cannot target another q-keyword '" + replacementFirstLower + "'",
        declarationStart
      );
    }

    const spec = {
      name: effectiveAliasName,
      nameLower: effectiveAliasLower,
      replacementHead: effectiveReplacementHead,
      replacementFirstLower: replacementFirstLower,
    };
    if (keywordAliases instanceof Map) {
      keywordAliases.set(effectiveAliasLower, spec);
    }
    return spec;
  }

  function ensureAliasReplacementIsDirect(aliasSpec, keywordAliases, parser, atIndex) {
    const spec = aliasSpec && typeof aliasSpec === "object" ? aliasSpec : null;
    if (!spec || !(keywordAliases instanceof Map)) {
      return;
    }
    const replacementFirstLower =
      spec.replacementFirstLower || readFirstIdentifierLower(String(spec.replacementHead || ""));
    if (!replacementFirstLower) {
      return;
    }
    if (replacementFirstLower === String(spec.nameLower || "").toLowerCase()) {
      throw KeywordAliasError("q-keyword '" + spec.name + "' cannot reference itself", atIndex);
    }
    if (keywordAliases.has(replacementFirstLower)) {
      throw KeywordAliasError(
        "q-keyword '" + spec.name + "' cannot target another q-keyword '" + replacementFirstLower + "'",
        atIndex
      );
    }
  }

  function findItemBoundaryInSource(source, startIndex, options) {
    const input = String(source || "");
    const opts = options || {};
    const mode = String(opts.mode || "block").toLowerCase() === "top" ? "top" : "block";
    const stopChar = mode === "block" ? String(opts.stopChar || "}") : "";
    let i = Math.max(0, Number(startIndex) || 0);
    let depth = 0;
    let quote = "";
    let escaped = false;

    while (i < input.length) {
      const ch = input.charAt(i);

      if (quote) {
        if (escaped) {
          escaped = false;
          i += 1;
          continue;
        }
        if (ch === "\\") {
          escaped = true;
          i += 1;
          continue;
        }
        if (ch === quote) {
          quote = "";
        }
        i += 1;
        continue;
      }

      if (ch === "/" && input.charAt(i + 1) === "/") {
        i += 2;
        while (i < input.length) {
          const lineCh = input.charAt(i);
          if (lineCh === "\n" || lineCh === "\r") {
            break;
          }
          i += 1;
        }
        continue;
      }
      if (ch === "/" && input.charAt(i + 1) === "*") {
        i += 2;
        while (i < input.length && !(input.charAt(i) === "*" && input.charAt(i + 1) === "/")) {
          i += 1;
        }
        i = i < input.length ? i + 2 : input.length;
        continue;
      }

      if (ch === '"' || ch === "'" || ch === "`") {
        quote = ch;
        i += 1;
        continue;
      }

      if (ch === "{") {
        depth += 1;
        i += 1;
        continue;
      }

      if (ch === "}") {
        if (depth === 0) {
          return i;
        }
        depth -= 1;
        i += 1;
        continue;
      }

      if (depth === 0) {
        if (ch === ";" || ch === "\n" || ch === "\r") {
          return i;
        }
        if (mode === "block" && stopChar && ch === stopChar) {
          return i;
        }
      }

      i += 1;
    }

    return input.length;
  }

  function parseAliasedItemsFromSource(sourceText, mode, keywordAliases) {
    const text = String(sourceText || "");
    if (!text.trim()) {
      return [];
    }

    if (String(mode || "").toLowerCase() === "top") {
      const nestedAst = parseQHtmlToAst(text, {
        keywordAliases: cloneKeywordAliases(keywordAliases),
      });
      return Array.isArray(nestedAst.body) ? nestedAst.body : [];
    }

    const nestedParser = parserFor(text);
    const nestedItems = parseBlockItems(nestedParser, cloneKeywordAliases(keywordAliases));
    skipWhitespaceAndSemicolons(nestedParser);
    if (!eof(nestedParser)) {
      throw ParseError("Unable to parse aliased block invocation", nestedParser.index);
    }
    return nestedItems;
  }

  function parseForHeader(parser) {
    skipWhitespace(parser);
    if (peek(parser) !== "(") {
      throw ParseError("Expected '(' after for", parser.index);
    }
    consume(parser);
    skipWhitespace(parser);
    const alias = String(parseIdentifier(parser) || "").trim();
    if (!alias) {
      throw ParseError("Expected loop alias in for (...) header", parser.index);
    }
    skipWhitespace(parser);
    const inKeyword = String(parseIdentifier(parser) || "").trim().toLowerCase();
    if (inKeyword !== "in") {
      throw ParseError("Expected 'in' in for (...) header", parser.index);
    }
    skipWhitespace(parser);
    const sourceStart = parser.index;
    let quote = "";
    let parenDepth = 0;
    while (!eof(parser)) {
      const ch = peek(parser);
      if (quote) {
        if (ch === "\\") {
          parser.index += 2;
          continue;
        }
        if (ch === quote) {
          quote = "";
        }
        parser.index += 1;
        continue;
      }
      if (ch === "'" || ch === '"' || ch === "`") {
        quote = ch;
        parser.index += 1;
        continue;
      }
      if (ch === "(") {
        parenDepth += 1;
        parser.index += 1;
        continue;
      }
      if (ch === ")") {
        if (parenDepth === 0) {
          break;
        }
        parenDepth -= 1;
        parser.index += 1;
        continue;
      }
      parser.index += 1;
    }
    if (eof(parser)) {
      throw ParseError("Unterminated for (...) header", sourceStart);
    }
    const sourceExpression = String(parser.source.slice(sourceStart, parser.index) || "").trim();
    if (!sourceExpression) {
      throw ParseError("Expected iterable source in for (...) header", sourceStart);
    }
    expect(parser, ")");
    return {
      alias: alias,
      sourceExpression: sourceExpression,
    };
  }

  function parseForDefinitionItem(parser, scopedKeywordAliases, keywordSnapshot, itemStart) {
    const header = parseForHeader(parser);
    skipWhitespace(parser);
    if (peek(parser) !== "{") {
      throw ParseError("Expected '{' after for (...) header", parser.index);
    }
    consume(parser);
    const forItems = parseBlockItems(parser, scopedKeywordAliases);
    expect(parser, "}");
    return {
      type: "ForDefinition",
      keyword: "for",
      slotName: String(header.alias || "").trim() || "item",
      sourceExpression: String(header.sourceExpression || "").trim(),
      items: forItems,
      keywords: keywordSnapshot,
      start: itemStart,
      end: parser.index,
      raw: parser.source.slice(itemStart, parser.index),
    };
  }

  function parseBlockItems(parser, keywordAliases) {
    const scopedKeywordAliases = cloneKeywordAliases(keywordAliases);
    const items = [];

    while (!eof(parser)) {
      skipWhitespaceAndSemicolons(parser);
      if (peek(parser) === "}") {
        break;
      }

      if (!isIdentifierStartChar(peek(parser))) {
        const recovered = consumeRecoverableRaw(parser, { mode: "block", stopChar: "}" });
        if (recovered) {
          items.push(recovered);
        }
        continue;
      }

      const recoveryStart = parser.index;
      try {
        const itemStart = parser.index;
        const nameBase = parseIdentifier(parser);
        const name = parseSelectorTokenTail(parser, nameBase);
        const nameLower = nameBase.toLowerCase();
        const afterName = parser.index;
        skipWhitespace(parser);

        if (nameLower === "q-keyword") {
          parseKeywordAliasDeclaration(parser, scopedKeywordAliases, itemStart);
          continue;
        }

        const aliasSpec = scopedKeywordAliases.get(nameLower);
        if (aliasSpec) {
          ensureAliasReplacementIsDirect(aliasSpec, scopedKeywordAliases, parser, itemStart);
          const itemEnd = findItemBoundaryInSource(parser.source, itemStart, { mode: "block", stopChar: "}" });
          const rest = parser.source.slice(afterName, itemEnd);
          const expandedSource = String(aliasSpec.replacementHead || "") + rest;
          const expandedItems = parseAliasedItemsFromSource(expandedSource, "block", scopedKeywordAliases);
          parser.index = itemEnd;
          for (let i = 0; i < expandedItems.length; i += 1) {
            items.push(expandedItems[i]);
          }
          continue;
        }

        const keywordSnapshot = keywordAliasesToObject(scopedKeywordAliases);
        const nextChar = peek(parser);
        if (FOR_KEYWORDS.has(nameLower) && nextChar === "(") {
          items.push(parseForDefinitionItem(parser, scopedKeywordAliases, keywordSnapshot, itemStart));
          continue;
        }
        if (nameLower === "q-array" && nextChar !== "{" && nextChar !== ",") {
          const arrayName = parseIdentifier(parser);
          skipWhitespace(parser);
          if (peek(parser) !== "{") {
            throw ParseError("Expected '{' after q-array name", parser.index);
          }
          consume(parser);
          const arrayBody = readBalancedBlockContent(parser);
          items.push({
            type: "QArrayDefinition",
            name: String(arrayName || "").trim(),
            body: String(arrayBody || ""),
            keywords: keywordSnapshot,
            start: itemStart,
            end: parser.index,
            raw: parser.source.slice(itemStart, parser.index),
          });
          continue;
        }
        if (isQObjectKeyword(nameLower) && nextChar !== "{" && nextChar !== ",") {
          const objectName = parseIdentifier(parser);
          skipWhitespace(parser);
          if (peek(parser) !== "{") {
            throw ParseError("Expected '{' after " + nameBase + " name", parser.index);
          }
          consume(parser);
          const objectItems = parseBlockItems(parser, scopedKeywordAliases);
          expect(parser, "}");
          items.push({
            type: "QObjectDefinition",
            name: String(objectName || "").trim(),
            keyword: normalizeQObjectKeyword(nameLower),
            items: objectItems,
            keywords: keywordSnapshot,
            start: itemStart,
            end: parser.index,
            raw: parser.source.slice(itemStart, parser.index),
          });
          continue;
        }
        if (REPEATER_KEYWORDS.has(nameLower) && nextChar !== "{" && nextChar !== ",") {
          const repeaterName = parseIdentifier(parser);
          skipWhitespace(parser);
          if (peek(parser) !== "{") {
            throw ParseError("Expected '{' after " + nameBase + " name", parser.index);
          }
          consume(parser);
          const repeaterItems = parseBlockItems(parser, scopedKeywordAliases);
          expect(parser, "}");
          items.push({
            type: "RepeaterDefinition",
            keyword: nameLower,
            name: String(repeaterName || "").trim(),
            items: repeaterItems,
            keywords: keywordSnapshot,
            start: itemStart,
            end: parser.index,
            raw: parser.source.slice(itemStart, parser.index),
          });
          continue;
        }
        if (MODEL_KEYWORDS.has(nameLower) && nextChar !== "{" && nextChar !== ",") {
          const modelName = parseIdentifier(parser);
          skipWhitespace(parser);
          if (peek(parser) !== "{") {
            throw ParseError("Expected '{' after " + nameBase + " name", parser.index);
          }
          consume(parser);
          const modelItems = parseBlockItems(parser, scopedKeywordAliases);
          expect(parser, "}");
          items.push({
            type: "QModelDefinition",
            keyword: nameLower,
            name: String(modelName || "").trim(),
            items: modelItems,
            keywords: keywordSnapshot,
            start: itemStart,
            end: parser.index,
            raw: parser.source.slice(itemStart, parser.index),
          });
          continue;
        }
        if (nameLower === "q-signal" && nextChar !== "{" && nextChar !== ",") {
          const signalId = parseIdentifier(parser);
          let parameterSource = "";
          let parameterNames = [];
          skipInlineWhitespace(parser);
          if (peek(parser) === "(") {
            consume(parser);
            parameterSource = readBalancedParenthesizedContent(parser);
            parameterNames = parseSignalParameterNames(parameterSource);
          }
          const declarationTailStart = parser.index;
          skipInlineWhitespace(parser);
          if (peek(parser) === "{") {
            consume(parser);
            const signalItems = parseBlockItems(parser, scopedKeywordAliases);
            expect(parser, "}");
            items.push({
              type: "SignalDefinition",
              signalId: signalId,
              items: signalItems,
              keywords: keywordSnapshot,
              start: itemStart,
              end: parser.index,
              raw: parser.source.slice(itemStart, parser.index),
            });
            continue;
          }
          parser.index = declarationTailStart;
          const trailing = parseBareValue(parser);
          const signature =
            String(signalId || "") +
            "(" +
            (parameterSource || parameterNames.join(", ")) +
            ")" +
            (trailing ? " " + trailing : "");
          items.push({
            type: "SignalDeclaration",
            name: String(signalId || "").trim(),
            signature: signature,
            parameters: parameterNames,
            keywords: keywordSnapshot,
            start: itemStart,
            end: parser.index,
            raw: parser.source.slice(itemStart, parser.index),
          });
          continue;
        }
        if (nameLower === "q-callback" && nextChar !== "{" && nextChar !== ",") {
          const callbackName = parseIdentifier(parser);
          const normalizedCallbackName = String(callbackName || "").trim();
          if (!normalizedCallbackName) {
            throw ParseError("Expected callback name after q-callback", parser.index);
          }
          let parameterSource = "";
          let parameterNames = [];
          skipInlineWhitespace(parser);
          if (peek(parser) === "(") {
            consume(parser);
            parameterSource = readBalancedParenthesizedContent(parser);
            parameterNames = parseSignalParameterNames(parameterSource);
          }
          skipWhitespace(parser);
          if (peek(parser) !== "{") {
            throw ParseError("Expected '{' after q-callback declaration", parser.index);
          }
          consume(parser);
          const callbackBody = readBalancedBlockContent(parser);
          const signature =
            normalizedCallbackName +
            "(" +
            (parameterSource || parameterNames.join(", ")) +
            ")";
          items.push({
            type: "CallbackDeclaration",
            name: normalizedCallbackName,
            signature: signature,
            parameters: parameterNames,
            body: compactScriptBody(callbackBody || ""),
            keywords: keywordSnapshot,
            start: itemStart,
            end: parser.index,
            raw: parser.source.slice(itemStart, parser.index),
          });
          continue;
        }
        if (nameLower === "q-connect" && nextChar === "{") {
          consume(parser);
          const connectBody = readBalancedBlockContent(parser);
          const connectConfig = parseQConnectDefinitionBody(String(connectBody || ""));
          if (!connectConfig.senderExpression || !connectConfig.targetExpression) {
            throw ParseError("q-connect requires sender and target expressions", parser.index);
          }
          items.push({
            type: "QConnectDefinition",
            senderExpression: connectConfig.senderExpression,
            targetExpression: connectConfig.targetExpression,
            body: String(connectBody || ""),
            keywords: keywordSnapshot,
            start: itemStart,
            end: parser.index,
            raw: parser.source.slice(itemStart, parser.index),
          });
          continue;
        }
        if (nameLower === "q-connect" && nextChar !== "{") {
          throw ParseError("q-connect requires a block body", parser.index);
        }
        if (nameLower === "q-property" && nextChar !== "{") {
          const propertyNameStart = parser.index;
          const propertyName = parseIdentifier(parser);
          const propertyNameEnd = parser.index;
          const normalizedPropertyName = String(propertyName || "").trim();
          if (!normalizedPropertyName) {
            throw ParseError("Expected property name after q-property", parser.index);
          }
          items.push({
            type: "QPropertyBlock",
            properties: [normalizedPropertyName],
            keywords: keywordSnapshot,
            start: itemStart,
            end: propertyNameEnd,
            raw: parser.source.slice(itemStart, propertyNameEnd),
          });
          skipWhitespace(parser);
          if (peek(parser) === ":") {
            consume(parser);
            const value = parseValue(parser, scopedKeywordAliases);
            items.push({
              type: "Property",
              name: normalizedPropertyName,
              value: value,
              keywords: keywordSnapshot,
              start: propertyNameStart,
              end: parser.index,
              raw: parser.source.slice(propertyNameStart, parser.index),
            });
          }
          continue;
        }
        if (nameLower === "q-color-schema" && nextChar !== "{") {
          warnDeprecatedSyntaxFeature("q-color-schema");
          const schemaName = parseQColorIdentifier(parser, "q-color-schema");
          skipWhitespace(parser);
          if (peek(parser) !== "{") {
            throw ParseError("Expected '{' after q-color-schema name", parser.index);
          }
          consume(parser);
          const schemaBody = readBalancedBlockContent(parser);
          items.push({
            type: "QColorSchemaDefinition",
            name: schemaName,
            entries: parseQColorSchemaEntries(schemaBody),
            keywords: keywordSnapshot,
            start: itemStart,
            end: parser.index,
            raw: parser.source.slice(itemStart, parser.index),
          });
          continue;
        }
        if (nameLower === "q-color-theme" && nextChar !== "{") {
          warnDeprecatedSyntaxFeature("q-color-theme");
          const themeName = parseQColorIdentifier(parser, "q-color-theme");
          skipWhitespace(parser);
          if (peek(parser) !== "{") {
            throw ParseError("Expected '{' after q-color-theme name", parser.index);
          }
          consume(parser);
          const themeBody = readBalancedBlockContent(parser);
          items.push({
            type: "QColorThemeDefinition",
            name: themeName,
            assignments: parseQColorAssignments(themeBody, scopedKeywordAliases),
            keywords: keywordSnapshot,
            start: itemStart,
            end: parser.index,
            raw: parser.source.slice(itemStart, parser.index),
          });
          continue;
        }
        if (nameLower === "q-color" && nextChar !== "{") {
          warnDeprecatedSyntaxFeature("q-color");
          const setupName = parseQColorIdentifier(parser, "q-color");
          skipWhitespace(parser);
          if (peek(parser) !== "{") {
            throw ParseError("Expected '{' after q-color name", parser.index);
          }
          consume(parser);
          const colorBody = readBalancedBlockContent(parser);
          const parsed = parseQColorApplyBlock(colorBody, scopedKeywordAliases);
          items.push({
            type: "QColorDefinition",
            name: setupName,
            assignments: parsed.assignments,
            areas: parsed.areas,
            keywords: keywordSnapshot,
            start: itemStart,
            end: parser.index,
            raw: parser.source.slice(itemStart, parser.index),
          });
          continue;
        }
        if (nameLower === "q-style" && nextChar !== "{") {
          const styleName = parseQColorIdentifier(parser, "q-style");
          skipWhitespace(parser);
          if (peek(parser) !== "{") {
            throw ParseError("Expected '{' after q-style name", parser.index);
          }
          consume(parser);
          const styleBody = readBalancedBlockContent(parser);
          const parsedStyle = parseQStyleDeclarations(styleBody, scopedKeywordAliases);
          items.push({
            type: "QStyleDefinition",
            name: styleName,
            declarations: parsedStyle.declarations,
            classes: parsedStyle.classes,
            keywords: keywordSnapshot,
            start: itemStart,
            end: parser.index,
            raw: parser.source.slice(itemStart, parser.index),
          });
          continue;
        }
        if (nameLower === "q-theme" && nextChar !== "{") {
          const themeName = parseQColorIdentifier(parser, "q-theme");
          skipWhitespace(parser);
          if (peek(parser) !== "{") {
            throw ParseError("Expected '{' after q-theme name", parser.index);
          }
          consume(parser);
          const themeBody = readBalancedBlockContent(parser);
          items.push({
            type: "QThemeDefinition",
            name: themeName,
            defaultTheme: false,
            rules: parseQThemeRules(themeBody),
            keywords: keywordSnapshot,
            start: itemStart,
            end: parser.index,
            raw: parser.source.slice(itemStart, parser.index),
          });
          continue;
        }
        if (nameLower === "q-default-theme" && nextChar !== "{") {
          const themeName = parseQColorIdentifier(parser, "q-default-theme");
          skipWhitespace(parser);
          if (peek(parser) !== "{") {
            throw ParseError("Expected '{' after q-default-theme name", parser.index);
          }
          consume(parser);
          const themeBody = readBalancedBlockContent(parser);
          items.push({
            type: "QThemeDefinition",
            name: themeName,
            defaultTheme: true,
            rules: parseQThemeRules(themeBody),
            keywords: keywordSnapshot,
            start: itemStart,
            end: parser.index,
            raw: parser.source.slice(itemStart, parser.index),
          });
          continue;
        }
        if (nameLower === "q-template" && nextChar !== "{" && nextChar !== ",") {
          const templateId = parseIdentifier(parser);
          skipWhitespace(parser);
          if (peek(parser) !== "{") {
            throw ParseError("Expected '{' after q-template id", parser.index);
          }
          consume(parser);
          const templateItems = parseBlockItems(parser, scopedKeywordAliases);
          expect(parser, "}");
          items.push({
            type: "TemplateDefinition",
            templateId: templateId,
            items: templateItems,
            keywords: keywordSnapshot,
            start: itemStart,
            end: parser.index,
            raw: parser.source.slice(itemStart, parser.index),
          });
          continue;
        }
        if (nameLower === "q-alias" && nextChar !== "{" && nextChar !== ",") {
          const aliasName = parseIdentifier(parser);
          const normalizedAliasName = String(aliasName || "").trim();
          if (!normalizedAliasName) {
            throw ParseError("Expected alias name after q-alias", parser.index);
          }
          skipWhitespace(parser);
          if (peek(parser) !== "{") {
            throw ParseError("Expected '{' after q-alias name", parser.index);
          }
          consume(parser);
          const aliasBody = readBalancedBlockContent(parser);
          items.push({
            type: "AliasDeclaration",
            name: normalizedAliasName,
            body: compactScriptBody(aliasBody),
            keywords: keywordSnapshot,
            start: itemStart,
            end: parser.index,
            raw: parser.source.slice(itemStart, parser.index),
          });
          continue;
        }
        if (nameLower === "property" && nextChar !== "{") {
          if (!isIdentifierStartChar(nextChar)) {
            parser.index = afterName;
          } else {
          const propertyNameStart = parser.index;
          const propertyName = parseIdentifier(parser);
          const propertyNameEnd = parser.index;
          const normalizedPropertyName = String(propertyName || "").trim();
          if (!normalizedPropertyName) {
            throw ParseError("Expected property name after property", parser.index);
          }
          skipWhitespace(parser);
          if (peek(parser) === ":") {
            items.push({
              type: "QPropertyBlock",
              properties: [normalizedPropertyName],
              keywords: keywordSnapshot,
              start: itemStart,
              end: propertyNameEnd,
              raw: parser.source.slice(itemStart, propertyNameEnd),
            });
            consume(parser);
            const value = parseValue(parser, scopedKeywordAliases);
            items.push({
              type: "Property",
              name: normalizedPropertyName,
              value: value,
              keywords: keywordSnapshot,
              start: propertyNameStart,
              end: parser.index,
              raw: parser.source.slice(propertyNameStart, parser.index),
            });
            continue;
          }
          if (peek(parser) !== "{") {
            throw ParseError("Expected '{' after property name", parser.index);
          }
          consume(parser);
          const propertyItems = parseBlockItems(parser, scopedKeywordAliases);
          expect(parser, "}");
          items.push({
            type: "PropertyDefinitionBlock",
            name: normalizedPropertyName,
            items: propertyItems,
            keywords: keywordSnapshot,
            start: itemStart,
            end: parser.index,
            raw: parser.source.slice(itemStart, parser.index),
          });
          continue;
          }
        }
        if (isIdentifierStartChar(nextChar)) {
          const instanceAliasStart = parser.index;
          const instanceAlias = parseIdentifier(parser);
          skipWhitespace(parser);
          if (peek(parser) === "{") {
            consume(parser);
            const childItems = parseBlockItems(parser, scopedKeywordAliases);
            expect(parser, "}");
            items.push({
              type: "Element",
              selectors: [name],
              instanceAlias: String(instanceAlias || "").trim(),
              prefixDirectives: [],
              items: childItems,
              keywords: keywordSnapshot,
              start: itemStart,
              end: parser.index,
              raw: parser.source.slice(itemStart, parser.index),
            });
            continue;
          }
          parser.index = instanceAliasStart;
          skipWhitespace(parser);
        }

        if (nextChar === ":") {
          consume(parser);
          const value = parseValue(parser, scopedKeywordAliases);
          items.push({
            type: "Property",
            name: name,
            value: value,
            keywords: keywordSnapshot,
            start: itemStart,
            end: parser.index,
            raw: parser.source.slice(itemStart, parser.index),
          });
          continue;
        }

        if (nextChar === ",") {
          const selectors = parseSelectorList(parser, name);
          const prefixDirectives = parseLeadingSelectorDirectiveBlocks(parser);
          skipWhitespace(parser);
          if (peek(parser) !== "{") {
            throw ParseError("Expected '{' after selector", parser.index);
          }
          consume(parser);
          const childItems = parseBlockItems(parser, scopedKeywordAliases);
          expect(parser, "}");
          items.push({
            type: "Element",
            selectors: selectors,
            prefixDirectives: prefixDirectives,
            items: childItems,
            keywords: keywordSnapshot,
            start: itemStart,
            end: parser.index,
            raw: parser.source.slice(itemStart, parser.index),
          });
          continue;
        }

        if (nextChar === "{") {
          if (nameLower === "q-array") {
            consume(parser);
            const arrayBody = readBalancedBlockContent(parser);
            items.push({
              type: "QArrayDefinition",
              name: "",
              body: String(arrayBody || ""),
              keywords: keywordSnapshot,
              start: itemStart,
              end: parser.index,
              raw: parser.source.slice(itemStart, parser.index),
            });
            continue;
          }

          if (isQObjectKeyword(nameLower)) {
            consume(parser);
            const objectItems = parseBlockItems(parser, scopedKeywordAliases);
            expect(parser, "}");
            items.push({
              type: "QObjectDefinition",
              name: "",
              keyword: normalizeQObjectKeyword(nameLower),
              items: objectItems,
              keywords: keywordSnapshot,
              start: itemStart,
              end: parser.index,
              raw: parser.source.slice(itemStart, parser.index),
            });
            continue;
          }

          if (REPEATER_KEYWORDS.has(nameLower)) {
            consume(parser);
            const repeaterItems = parseBlockItems(parser, scopedKeywordAliases);
            expect(parser, "}");
            items.push({
              type: "RepeaterDefinition",
              keyword: nameLower,
              name: "",
              items: repeaterItems,
              keywords: keywordSnapshot,
              start: itemStart,
              end: parser.index,
              raw: parser.source.slice(itemStart, parser.index),
            });
            continue;
          }

          if (MODEL_KEYWORDS.has(nameLower)) {
            consume(parser);
            const modelItems = parseBlockItems(parser, scopedKeywordAliases);
            expect(parser, "}");
            items.push({
              type: "QModelDefinition",
              keyword: nameLower,
              name: "",
              items: modelItems,
              keywords: keywordSnapshot,
              start: itemStart,
              end: parser.index,
              raw: parser.source.slice(itemStart, parser.index),
            });
            continue;
          }

          if (nameLower === "html") {
            consume(parser);
            const rawHtml = readBalancedBlockContent(parser);
            items.push({
              type: "HtmlBlock",
              html: rawHtml,
              keywords: keywordSnapshot,
              start: itemStart,
              end: parser.index,
              raw: parser.source.slice(itemStart, parser.index),
            });
            continue;
          }

          if (TEXT_BLOCK_KEYWORDS.has(nameLower)) {
            consume(parser);
            const textBody = readBalancedBlockContent(parser);
            items.push({
              type: "TextBlock",
              text: textBody,
              keywords: keywordSnapshot,
              start: itemStart,
              end: parser.index,
              raw: parser.source.slice(itemStart, parser.index),
            });
            continue;
          }

          if (nameLower === "style") {
            consume(parser);
            const styleBody = readBalancedBlockContent(parser);
            items.push({
              type: "StyleBlock",
              css: styleBody,
              keywords: keywordSnapshot,
              start: itemStart,
              end: parser.index,
              raw: parser.source.slice(itemStart, parser.index),
            });
            continue;
          }

          if (nameLower === "q-script") {
            consume(parser);
            const scriptBody = readBalancedBlockContent(parser);
            items.push({
              type: "QScriptInline",
              script: scriptBody,
              keywords: keywordSnapshot,
              start: itemStart,
              end: parser.index,
              raw: parser.source.slice(itemStart, parser.index),
            });
            continue;
          }

          if (nameLower === "q-wasm") {
            consume(parser);
            const wasmBody = readBalancedBlockContent(parser);
            items.push({
              type: "QWasmBlock",
              config: parseQWasmConfig(wasmBody, scopedKeywordAliases),
              keywords: keywordSnapshot,
              start: itemStart,
              end: parser.index,
              raw: parser.source.slice(itemStart, parser.index),
            });
            continue;
          }

          if (nameLower === "q-bind" || nameLower === "q-script") {
            consume(parser);
            const expressionBody = readBalancedBlockContent(parser);
            items.push({
              type: "Property",
              name: "content",
              value: {
                type: "QScriptExpression",
                keyword: nameLower,
                script: expressionBody,
                start: itemStart,
                end: parser.index,
                raw: parser.source.slice(itemStart, parser.index),
              },
              keywords: keywordSnapshot,
              start: itemStart,
              end: parser.index,
              raw: parser.source.slice(itemStart, parser.index),
            });
            continue;
          }

          if (nameLower === "q-import") {
            consume(parser);
            const importBody = readBalancedBlockContent(parser);
            items.push({
              type: "ImportBlock",
              path: String(importBody || "").trim(),
              keywords: keywordSnapshot,
              start: itemStart,
              end: parser.index,
              raw: parser.source.slice(itemStart, parser.index),
            });
            continue;
          }

          if (nameLower === "q-property") {
            consume(parser);
            const propertyBody = readBalancedBlockContent(parser);
            items.push({
              type: "QPropertyBlock",
              properties: parseQPropertyNames(propertyBody),
              keywords: keywordSnapshot,
              start: itemStart,
              end: parser.index,
              raw: parser.source.slice(itemStart, parser.index),
            });
            continue;
          }

          if (nameLower === "q-color-schema") {
            warnDeprecatedSyntaxFeature("q-color-schema");
            consume(parser);
            const schemaBody = readBalancedBlockContent(parser);
            items.push({
              type: "QColorSchemaDefinition",
              name: "",
              entries: parseQColorSchemaEntries(schemaBody),
              keywords: keywordSnapshot,
              start: itemStart,
              end: parser.index,
              raw: parser.source.slice(itemStart, parser.index),
            });
            continue;
          }

          if (nameLower === "q-color-theme") {
            warnDeprecatedSyntaxFeature("q-color-theme");
            consume(parser);
            const themeBody = readBalancedBlockContent(parser);
            items.push({
              type: "QColorThemeDefinition",
              name: "",
              assignments: parseQColorAssignments(themeBody, scopedKeywordAliases),
              keywords: keywordSnapshot,
              start: itemStart,
              end: parser.index,
              raw: parser.source.slice(itemStart, parser.index),
            });
            continue;
          }

          if (nameLower === "q-color") {
            warnDeprecatedSyntaxFeature("q-color");
            consume(parser);
            const colorBody = readBalancedBlockContent(parser);
            const parsed = parseQColorApplyBlock(colorBody, scopedKeywordAliases);
            items.push({
              type: "QColorApplyBlock",
              assignments: parsed.assignments,
              areas: parsed.areas,
              keywords: keywordSnapshot,
              start: itemStart,
              end: parser.index,
              raw: parser.source.slice(itemStart, parser.index),
            });
            continue;
          }

          if (nameLower === "q-style") {
            throw ParseError("Anonymous q-style is not allowed", parser.index);
          }

          if (nameLower === "q-theme") {
            throw ParseError("Anonymous q-theme is not allowed", parser.index);
          }
          if (nameLower === "q-default-theme") {
            throw ParseError("Anonymous q-default-theme is not allowed", parser.index);
          }

          if (isEventBlockName(name)) {
            consume(parser);
            const scriptBody = readBalancedBlockContent(parser);
            items.push({
              type: "EventBlock",
              name: name,
              script: scriptBody,
              isLifecycle: LIFECYCLE_BLOCKS.has(nameLower),
              keywords: keywordSnapshot,
              start: itemStart,
              end: parser.index,
              raw: parser.source.slice(itemStart, parser.index),
            });
            continue;
          }

          parser.index = afterName;
          const prefixDirectives = parseLeadingSelectorDirectiveBlocks(parser);
          skipWhitespace(parser);
          if (peek(parser) !== "{") {
            throw ParseError("Expected '{' after selector", parser.index);
          }
          consume(parser);
          const childItems = parseBlockItems(parser, scopedKeywordAliases);
          expect(parser, "}");

          items.push({
            type: "Element",
            selectors: [name],
            prefixDirectives: prefixDirectives,
            items: childItems,
            keywords: keywordSnapshot,
            start: itemStart,
            end: parser.index,
            raw: parser.source.slice(itemStart, parser.index),
          });
          continue;
        }

        if (nextChar === "}") {
          items.push({
            type: "BareWord",
            name: name,
            keywords: keywordSnapshot,
            start: itemStart,
            end: afterName,
            raw: parser.source.slice(itemStart, afterName),
          });
          continue;
        }

        if (String(name || "").toLowerCase() === "function") {
          parser.index = afterName;
          skipWhitespace(parser);
          const signatureStart = parser.index;
          while (!eof(parser) && peek(parser) !== "{") {
            parser.index += 1;
          }
          if (peek(parser) !== "{") {
            throw ParseError("Expected '{' after function signature", parser.index);
          }
          const signature = parser.source.slice(signatureStart, parser.index).trim();
          const sigMatch = signature.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\(([\s\S]*)\)$/);
          const methodName = sigMatch ? String(sigMatch[1] || "").trim() : "";
          const parameters = sigMatch ? String(sigMatch[2] || "").trim() : "";

          consume(parser);
          const methodBody = readBalancedBlockContent(parser);
          items.push({
            type: "FunctionBlock",
            name: methodName,
            signature: signature,
            parameters: parameters,
            body: methodBody,
            keywords: keywordSnapshot,
            start: itemStart,
            end: parser.index,
            raw: parser.source.slice(itemStart, parser.index),
          });
          continue;
        }

        parser.index = afterName;
        const rest = parseBareValue(parser);
        const text = (name + (rest ? " " + rest : "")).trim();
        items.push({
          type: "RawTextLine",
          text: text,
          keywords: keywordSnapshot,
          start: itemStart,
          end: parser.index,
          raw: parser.source.slice(itemStart, parser.index),
        });
      } catch (error) {
        if (error && error.name === "QHtmlParseError") {
          parser.index = recoveryStart;
          const recovered = consumeRecoverableRaw(parser, { mode: "block", stopChar: "}" });
          if (recovered) {
            items.push(recovered);
            continue;
          }
        }
        throw error;
      }
    }

    return items;
  }

  function parseTopLevelItems(parser, keywordAliases) {
    const scopedKeywordAliases = cloneKeywordAliases(keywordAliases);
    const body = [];

    while (!eof(parser)) {
      skipWhitespaceAndSemicolons(parser);
      if (eof(parser)) {
        break;
      }

      if (!isIdentifierStartChar(peek(parser))) {
        const recovered = consumeRecoverableRaw(parser, { mode: "top" });
        if (recovered) {
          body.push(recovered);
        }
        continue;
      }

      const recoveryStart = parser.index;
      try {
        const start = parser.index;
        const firstSelectorBase = parseIdentifier(parser);
        const firstSelector = parseSelectorTokenTail(parser, firstSelectorBase);
        const firstLower = firstSelectorBase.toLowerCase();
        const afterFirstSelector = parser.index;
        skipWhitespace(parser);

        if (firstLower === "q-keyword") {
          parseKeywordAliasDeclaration(parser, scopedKeywordAliases, start);
          continue;
        }

        const aliasSpec = scopedKeywordAliases.get(firstLower);
        if (aliasSpec) {
          ensureAliasReplacementIsDirect(aliasSpec, scopedKeywordAliases, parser, start);
          const itemEnd = findItemBoundaryInSource(parser.source, start, { mode: "top" });
          const rest = parser.source.slice(afterFirstSelector, itemEnd);
          const expandedSource = String(aliasSpec.replacementHead || "") + rest;
          const expandedItems = parseAliasedItemsFromSource(expandedSource, "top", scopedKeywordAliases);
          parser.index = itemEnd;
          for (let i = 0; i < expandedItems.length; i += 1) {
            body.push(expandedItems[i]);
          }
          continue;
        }

        const keywordSnapshot = keywordAliasesToObject(scopedKeywordAliases);

        if (FOR_KEYWORDS.has(firstLower) && peek(parser) === "(") {
          body.push(parseForDefinitionItem(parser, scopedKeywordAliases, keywordSnapshot, start));
          continue;
        }

        if (LIFECYCLE_BLOCKS.has(firstLower) && peek(parser) === "{") {
          consume(parser);
          const scriptBody = readBalancedBlockContent(parser);
          body.push({
            type: "LifecycleBlock",
            name: firstSelector,
            script: scriptBody,
            isLifecycle: true,
            keywords: keywordSnapshot,
            start: start,
            end: parser.index,
            raw: parser.source.slice(start, parser.index),
          });
          continue;
        }

        if (firstLower === "q-array" && peek(parser) !== "{" && peek(parser) !== ",") {
          const arrayName = parseIdentifier(parser);
          skipWhitespace(parser);
          if (peek(parser) !== "{") {
            throw ParseError("Expected '{' after q-array name", parser.index);
          }
          consume(parser);
          const arrayBody = readBalancedBlockContent(parser);
          body.push({
            type: "QArrayDefinition",
            name: String(arrayName || "").trim(),
            body: String(arrayBody || ""),
            keywords: keywordSnapshot,
            start: start,
            end: parser.index,
            raw: parser.source.slice(start, parser.index),
          });
          continue;
        }

        if (firstLower === "q-array" && peek(parser) === "{") {
          consume(parser);
          const arrayBody = readBalancedBlockContent(parser);
          body.push({
            type: "QArrayDefinition",
            name: "",
            body: String(arrayBody || ""),
            keywords: keywordSnapshot,
            start: start,
            end: parser.index,
            raw: parser.source.slice(start, parser.index),
          });
          continue;
        }

        if (isQObjectKeyword(firstLower) && peek(parser) !== "{" && peek(parser) !== ",") {
          const objectName = parseIdentifier(parser);
          skipWhitespace(parser);
          if (peek(parser) !== "{") {
            throw ParseError("Expected '{' after " + firstSelectorBase + " name", parser.index);
          }
          consume(parser);
          const objectItems = parseBlockItems(parser, scopedKeywordAliases);
          expect(parser, "}");
          body.push({
            type: "QObjectDefinition",
            name: String(objectName || "").trim(),
            keyword: normalizeQObjectKeyword(firstLower),
            items: objectItems,
            keywords: keywordSnapshot,
            start: start,
            end: parser.index,
            raw: parser.source.slice(start, parser.index),
          });
          continue;
        }

        if (isQObjectKeyword(firstLower) && peek(parser) === "{") {
          consume(parser);
          const objectItems = parseBlockItems(parser, scopedKeywordAliases);
          expect(parser, "}");
          body.push({
            type: "QObjectDefinition",
            name: "",
            keyword: normalizeQObjectKeyword(firstLower),
            items: objectItems,
            keywords: keywordSnapshot,
            start: start,
            end: parser.index,
            raw: parser.source.slice(start, parser.index),
          });
          continue;
        }

        if (REPEATER_KEYWORDS.has(firstLower) && peek(parser) !== "{" && peek(parser) !== ",") {
          const repeaterName = parseIdentifier(parser);
          skipWhitespace(parser);
          if (peek(parser) !== "{") {
            throw ParseError("Expected '{' after " + firstSelectorBase + " name", parser.index);
          }
          consume(parser);
          const repeaterItems = parseBlockItems(parser, scopedKeywordAliases);
          expect(parser, "}");
          body.push({
            type: "RepeaterDefinition",
            keyword: firstLower,
            name: String(repeaterName || "").trim(),
            items: repeaterItems,
            keywords: keywordSnapshot,
            start: start,
            end: parser.index,
            raw: parser.source.slice(start, parser.index),
          });
          continue;
        }

        if (MODEL_KEYWORDS.has(firstLower) && peek(parser) !== "{" && peek(parser) !== ",") {
          const modelName = parseIdentifier(parser);
          skipWhitespace(parser);
          if (peek(parser) !== "{") {
            throw ParseError("Expected '{' after " + firstSelectorBase + " name", parser.index);
          }
          consume(parser);
          const modelItems = parseBlockItems(parser, scopedKeywordAliases);
          expect(parser, "}");
          body.push({
            type: "QModelDefinition",
            keyword: firstLower,
            name: String(modelName || "").trim(),
            items: modelItems,
            keywords: keywordSnapshot,
            start: start,
            end: parser.index,
            raw: parser.source.slice(start, parser.index),
          });
          continue;
        }

        if (REPEATER_KEYWORDS.has(firstLower) && peek(parser) === "{") {
          consume(parser);
          const repeaterItems = parseBlockItems(parser, scopedKeywordAliases);
          expect(parser, "}");
          body.push({
            type: "RepeaterDefinition",
            keyword: firstLower,
            name: "",
            items: repeaterItems,
            keywords: keywordSnapshot,
            start: start,
            end: parser.index,
            raw: parser.source.slice(start, parser.index),
          });
          continue;
        }

        if (MODEL_KEYWORDS.has(firstLower) && peek(parser) === "{") {
          consume(parser);
          const modelItems = parseBlockItems(parser, scopedKeywordAliases);
          expect(parser, "}");
          body.push({
            type: "QModelDefinition",
            keyword: firstLower,
            name: "",
            items: modelItems,
            keywords: keywordSnapshot,
            start: start,
            end: parser.index,
            raw: parser.source.slice(start, parser.index),
          });
          continue;
        }

        if (firstLower === "q-template" && peek(parser) !== "{" && peek(parser) !== ",") {
          const templateId = parseIdentifier(parser);
          skipWhitespace(parser);
          if (peek(parser) !== "{") {
            throw ParseError("Expected '{' after q-template id", parser.index);
          }
          consume(parser);
          const items = parseBlockItems(parser, scopedKeywordAliases);
          expect(parser, "}");
          body.push({
            type: "TemplateDefinition",
            templateId: templateId,
            items: items,
            keywords: keywordSnapshot,
            start: start,
            end: parser.index,
            raw: parser.source.slice(start, parser.index),
          });
          continue;
        }

        if ((firstLower === "q-component" || firstLower === "q-worker") && peek(parser) !== "{" && peek(parser) !== ",") {
          const declarationDefinitionType = firstLower === "q-worker" ? "worker" : "component";
          const componentIdExprStart = parser.index;
          let componentIdExpression = null;
          const extendsComponentIdExpressions = [];

          function parseComponentReferenceExpression(exprStart, contextLabel) {
            if (parser.source.slice(parser.index, parser.index + 8).toLowerCase() === "q-script") {
              const keyword = parseIdentifier(parser);
              skipWhitespace(parser);
              if (peek(parser) !== "{") {
                throw ParseError("Expected '{' after q-script in " + contextLabel + " expression", parser.index);
              }
              consume(parser);
              const scriptBody = readBalancedBlockContent(parser);
              return {
                type: "QScriptExpression",
                keyword: keyword,
                script: scriptBody,
                raw: parser.source.slice(exprStart, parser.index),
              };
            }
            const identifier = parseIdentifier(parser);
            return {
              type: "IdentifierExpression",
              identifier: identifier,
              raw: parser.source.slice(exprStart, parser.index),
            };
          }

          componentIdExpression = parseComponentReferenceExpression(componentIdExprStart, "component id");
          skipWhitespace(parser);

          while (true) {
            const extendsToken = scanIdentifierTokenAt(parser.source, parser.index);
            if (!extendsToken || extendsToken.nameLower !== "extends") {
              break;
            }
            parseIdentifier(parser);
            skipWhitespace(parser);
            if (peek(parser) === "{" || eof(parser)) {
              throw ParseError("Expected base component id after extends", parser.index);
            }
            const extendsExprStart = parser.index;
            extendsComponentIdExpressions.push(parseComponentReferenceExpression(extendsExprStart, "base component id"));
            skipWhitespace(parser);
          }

          if (peek(parser) !== "{") {
            throw ParseError("Expected '{' after " + firstLower + " id", parser.index);
          }
          consume(parser);
          const items = parseBlockItems(parser, scopedKeywordAliases);
          expect(parser, "}");

          body.push({
            type: "ComponentDefinition",
            definitionType: declarationDefinitionType,
            componentIdExpression: componentIdExpression,
            extendsComponentIdExpressions: extendsComponentIdExpressions,
            extendsComponentIdExpression: extendsComponentIdExpressions.length > 0 ? extendsComponentIdExpressions[0] : null,
            items: items,
            keywords: keywordSnapshot,
            start: start,
            end: parser.index,
            raw: parser.source.slice(start, parser.index),
          });
          continue;
        }

        if (firstLower === "q-signal" && peek(parser) !== "{" && peek(parser) !== ",") {
          const signalId = parseIdentifier(parser);
          skipWhitespace(parser);
          if (peek(parser) !== "{") {
            throw ParseError("Expected '{' after q-signal id", parser.index);
          }
          consume(parser);
          const items = parseBlockItems(parser, scopedKeywordAliases);
          expect(parser, "}");
          body.push({
            type: "SignalDefinition",
            signalId: signalId,
            items: items,
            keywords: keywordSnapshot,
            start: start,
            end: parser.index,
            raw: parser.source.slice(start, parser.index),
          });
          continue;
        }

        if (firstLower === "q-callback" && peek(parser) !== "{" && peek(parser) !== ",") {
          const callbackName = parseIdentifier(parser);
          const normalizedCallbackName = String(callbackName || "").trim();
          if (!normalizedCallbackName) {
            throw ParseError("Expected callback name after q-callback", parser.index);
          }
          let parameterSource = "";
          let parameterNames = [];
          skipInlineWhitespace(parser);
          if (peek(parser) === "(") {
            consume(parser);
            parameterSource = readBalancedParenthesizedContent(parser);
            parameterNames = parseSignalParameterNames(parameterSource);
          }
          skipWhitespace(parser);
          if (peek(parser) !== "{") {
            throw ParseError("Expected '{' after q-callback declaration", parser.index);
          }
          consume(parser);
          const callbackBody = readBalancedBlockContent(parser);
          const signature =
            normalizedCallbackName +
            "(" +
            (parameterSource || parameterNames.join(", ")) +
            ")";
          body.push({
            type: "CallbackDeclaration",
            name: normalizedCallbackName,
            signature: signature,
            parameters: parameterNames,
            body: compactScriptBody(callbackBody || ""),
            keywords: keywordSnapshot,
            start: start,
            end: parser.index,
            raw: parser.source.slice(start, parser.index),
          });
          continue;
        }

        if (firstLower === "q-connect" && peek(parser) === "{") {
          consume(parser);
          const connectBody = readBalancedBlockContent(parser);
          const connectConfig = parseQConnectDefinitionBody(String(connectBody || ""));
          if (!connectConfig.senderExpression || !connectConfig.targetExpression) {
            throw ParseError("q-connect requires sender and target expressions", parser.index);
          }
          body.push({
            type: "QConnectDefinition",
            senderExpression: connectConfig.senderExpression,
            targetExpression: connectConfig.targetExpression,
            body: String(connectBody || ""),
            keywords: keywordSnapshot,
            start: start,
            end: parser.index,
            raw: parser.source.slice(start, parser.index),
          });
          continue;
        }

        if (firstLower === "q-connect" && peek(parser) !== "{") {
          throw ParseError("q-connect requires a block body", parser.index);
        }

        if (firstLower === "q-timer" && peek(parser) !== "{" && peek(parser) !== ",") {
          const timerId = parseIdentifier(parser);
          skipWhitespace(parser);
          if (peek(parser) !== "{") {
            throw ParseError("Expected '{' after q-timer id", parser.index);
          }
          consume(parser);
          const timerBody = readBalancedBlockContent(parser);
          body.push({
            type: "QTimerDefinition",
            timerId: String(timerId || "").trim(),
            body: String(timerBody || ""),
            config: parseQTimerDefinitionBody(String(timerBody || ""), scopedKeywordAliases),
            keywords: keywordSnapshot,
            start: start,
            end: parser.index,
            raw: parser.source.slice(start, parser.index),
          });
          continue;
        }

        if (firstLower === "q-timer" && peek(parser) === "{") {
          throw ParseError("Anonymous q-timer is not allowed", parser.index);
        }

        if (firstLower === "q-canvas" && peek(parser) !== "{" && peek(parser) !== ",") {
          const canvasId = parseIdentifier(parser);
          skipWhitespace(parser);
          if (peek(parser) !== "{") {
            throw ParseError("Expected '{' after q-canvas id", parser.index);
          }
          consume(parser);
          const canvasBody = readBalancedBlockContent(parser);
          body.push({
            type: "QCanvasDefinition",
            canvasId: String(canvasId || "").trim(),
            body: String(canvasBody || ""),
            config: parseQCanvasDefinitionBody(String(canvasBody || ""), scopedKeywordAliases),
            keywords: keywordSnapshot,
            start: start,
            end: parser.index,
            raw: parser.source.slice(start, parser.index),
          });
          continue;
        }

        if (firstLower === "q-canvas" && peek(parser) === "{") {
          throw ParseError("Anonymous q-canvas is not allowed", parser.index);
        }

        if (firstLower === "sdml-endpoint" && peek(parser) !== "{" && peek(parser) !== ",") {
          const endpointId = parseIdentifier(parser);
          skipWhitespace(parser);
          if (peek(parser) !== "{") {
            throw ParseError("Expected '{' after sdml-endpoint id", parser.index);
          }
          consume(parser);
          const endpointOpenIndex = parser.index - 1;
          const endpointCloseIndex = findMatchingBraceInText(parser.source, endpointOpenIndex);
          if (endpointCloseIndex === -1) {
            throw ParseError("Unterminated sdml-endpoint block.", parser.index);
          }
          const endpointBody = parser.source.slice(endpointOpenIndex + 1, endpointCloseIndex);
          parser.index = endpointCloseIndex + 1;
          const endpointUrl = extractSdmlEndpointUrlFromText(endpointBody);
          if (!endpointUrl) {
            throw ParseError("sdml-endpoint requires url { ... }", parser.index);
          }
          body.push({
            type: "SdmlEndpointDefinition",
            endpointId: String(endpointId || "").trim(),
            url: endpointUrl,
            body: endpointBody,
            keywords: keywordSnapshot,
            start: start,
            end: parser.index,
            raw: parser.source.slice(start, parser.index),
          });
          continue;
        }

        if (firstLower === "sdml-endpoint" && peek(parser) === "{") {
          throw ParseError("Anonymous sdml-endpoint is not allowed", parser.index);
        }

        if (firstLower === "q-sdml-component" && peek(parser) !== "{" && peek(parser) !== ",") {
          const componentId = parseIdentifier(parser);
          skipWhitespace(parser);
          if (peek(parser) !== "{") {
            throw ParseError("Expected '{' after q-sdml-component id", parser.index);
          }
          consume(parser);
          const sdmlBody = readBalancedBlockContent(parser);
          const sdmlPath = String(sdmlBody || "").trim();
          if (!sdmlPath) {
            throw ParseError("q-sdml-component URL cannot be empty.", parser.index);
          }
          body.push({
            type: "SdmlComponentDeclaration",
            componentId: String(componentId || "").trim(),
            path: sdmlPath,
            keywords: keywordSnapshot,
            start: start,
            end: parser.index,
            raw: parser.source.slice(start, parser.index),
          });
          continue;
        }

        if (firstLower === "q-sdml-component" && peek(parser) === "{") {
          throw ParseError("Anonymous q-sdml-component is not allowed", parser.index);
        }

        if (firstLower === "q-color-schema" && peek(parser) !== "{" && peek(parser) !== ",") {
          warnDeprecatedSyntaxFeature("q-color-schema");
          const schemaName = parseQColorIdentifier(parser, "q-color-schema");
          skipWhitespace(parser);
          if (peek(parser) !== "{") {
            throw ParseError("Expected '{' after q-color-schema name", parser.index);
          }
          consume(parser);
          const schemaBody = readBalancedBlockContent(parser);
          body.push({
            type: "QColorSchemaDefinition",
            name: schemaName,
            entries: parseQColorSchemaEntries(schemaBody),
            keywords: keywordSnapshot,
            start: start,
            end: parser.index,
            raw: parser.source.slice(start, parser.index),
          });
          continue;
        }

        if (firstLower === "q-color-schema" && peek(parser) === "{") {
          warnDeprecatedSyntaxFeature("q-color-schema");
          consume(parser);
          const schemaBody = readBalancedBlockContent(parser);
          body.push({
            type: "QColorSchemaDefinition",
            name: "",
            entries: parseQColorSchemaEntries(schemaBody),
            keywords: keywordSnapshot,
            start: start,
            end: parser.index,
            raw: parser.source.slice(start, parser.index),
          });
          continue;
        }

        if (firstLower === "q-color-theme" && peek(parser) === "{") {
          warnDeprecatedSyntaxFeature("q-color-theme");
          consume(parser);
          const themeBody = readBalancedBlockContent(parser);
          body.push({
            type: "QColorThemeDefinition",
            name: "",
            assignments: parseQColorAssignments(themeBody, scopedKeywordAliases),
            keywords: keywordSnapshot,
            start: start,
            end: parser.index,
            raw: parser.source.slice(start, parser.index),
          });
          continue;
        }

        if (firstLower === "q-color-theme" && peek(parser) !== "{" && peek(parser) !== ",") {
          warnDeprecatedSyntaxFeature("q-color-theme");
          const themeName = parseQColorIdentifier(parser, "q-color-theme");
          skipWhitespace(parser);
          if (peek(parser) !== "{") {
            throw ParseError("Expected '{' after q-color-theme name", parser.index);
          }
          consume(parser);
          const themeBody = readBalancedBlockContent(parser);
          body.push({
            type: "QColorThemeDefinition",
            name: themeName,
            assignments: parseQColorAssignments(themeBody, scopedKeywordAliases),
            keywords: keywordSnapshot,
            start: start,
            end: parser.index,
            raw: parser.source.slice(start, parser.index),
          });
          continue;
        }

        if (firstLower === "q-color" && peek(parser) !== "{" && peek(parser) !== ",") {
          warnDeprecatedSyntaxFeature("q-color");
          const setupName = parseQColorIdentifier(parser, "q-color");
          skipWhitespace(parser);
          if (peek(parser) !== "{") {
            throw ParseError("Expected '{' after q-color name", parser.index);
          }
          consume(parser);
          const colorBody = readBalancedBlockContent(parser);
          const parsed = parseQColorApplyBlock(colorBody, scopedKeywordAliases);
          body.push({
            type: "QColorDefinition",
            name: setupName,
            assignments: parsed.assignments,
            areas: parsed.areas,
            keywords: keywordSnapshot,
            start: start,
            end: parser.index,
            raw: parser.source.slice(start, parser.index),
          });
          continue;
        }

        if (firstLower === "q-style" && peek(parser) !== "{" && peek(parser) !== ",") {
          const styleName = parseQColorIdentifier(parser, "q-style");
          skipWhitespace(parser);
          if (peek(parser) !== "{") {
            throw ParseError("Expected '{' after q-style name", parser.index);
          }
          consume(parser);
          const styleBody = readBalancedBlockContent(parser);
          const parsedStyle = parseQStyleDeclarations(styleBody, scopedKeywordAliases);
          body.push({
            type: "QStyleDefinition",
            name: styleName,
            declarations: parsedStyle.declarations,
            classes: parsedStyle.classes,
            keywords: keywordSnapshot,
            start: start,
            end: parser.index,
            raw: parser.source.slice(start, parser.index),
          });
          continue;
        }

        if (firstLower === "q-theme" && peek(parser) !== "{" && peek(parser) !== ",") {
          const themeName = parseQColorIdentifier(parser, "q-theme");
          skipWhitespace(parser);
          if (peek(parser) !== "{") {
            throw ParseError("Expected '{' after q-theme name", parser.index);
          }
          consume(parser);
          const themeBody = readBalancedBlockContent(parser);
          body.push({
            type: "QThemeDefinition",
            name: themeName,
            defaultTheme: false,
            rules: parseQThemeRules(themeBody),
            keywords: keywordSnapshot,
            start: start,
            end: parser.index,
            raw: parser.source.slice(start, parser.index),
          });
          continue;
        }
        if (firstLower === "q-default-theme" && peek(parser) !== "{" && peek(parser) !== ",") {
          const themeName = parseQColorIdentifier(parser, "q-default-theme");
          skipWhitespace(parser);
          if (peek(parser) !== "{") {
            throw ParseError("Expected '{' after q-default-theme name", parser.index);
          }
          consume(parser);
          const themeBody = readBalancedBlockContent(parser);
          body.push({
            type: "QThemeDefinition",
            name: themeName,
            defaultTheme: true,
            rules: parseQThemeRules(themeBody),
            keywords: keywordSnapshot,
            start: start,
            end: parser.index,
            raw: parser.source.slice(start, parser.index),
          });
          continue;
        }

        if (firstLower === "q-style" && peek(parser) === "{") {
          throw ParseError("Anonymous q-style is not allowed", parser.index);
        }

        if (firstLower === "q-theme" && peek(parser) === "{") {
          throw ParseError("Anonymous q-theme is not allowed", parser.index);
        }
        if (firstLower === "q-default-theme" && peek(parser) === "{") {
          throw ParseError("Anonymous q-default-theme is not allowed", parser.index);
        }

        if (isIdentifierStartChar(peek(parser))) {
          const instanceAliasStart = parser.index;
          const instanceAlias = parseIdentifier(parser);
          skipWhitespace(parser);
          if (peek(parser) === "{") {
            const prefixDirectives = parseLeadingSelectorDirectiveBlocks(parser);
            skipWhitespace(parser);
            if (peek(parser) !== "{") {
              throw ParseError("Expected '{' at top level", parser.index);
            }
            consume(parser);
            const items = parseBlockItems(parser, scopedKeywordAliases);
            expect(parser, "}");
            body.push({
              type: "Element",
              selectors: [firstSelector],
              instanceAlias: String(instanceAlias || "").trim(),
              prefixDirectives: prefixDirectives,
              items: items,
              keywords: keywordSnapshot,
              start: start,
              end: parser.index,
              raw: parser.source.slice(start, parser.index),
            });
            continue;
          }
          parser.index = instanceAliasStart;
          skipWhitespace(parser);
        }

        const selectors = parseSelectorList(parser, firstSelector);
        const prefixDirectives = parseLeadingSelectorDirectiveBlocks(parser);
        skipWhitespace(parser);

        if (peek(parser) !== "{") {
          throw ParseError("Expected '{' at top level", parser.index);
        }

        consume(parser);
        if (selectors.length === 1 && selectors[0].toLowerCase() === "html") {
          const rawHtml = readBalancedBlockContent(parser);
          body.push({
            type: "HtmlBlock",
            html: rawHtml,
            keywords: keywordSnapshot,
            start: start,
            end: parser.index,
            raw: parser.source.slice(start, parser.index),
          });
          continue;
        }

        if (selectors.length === 1 && selectors[0].toLowerCase() === "q-import") {
          const importBody = readBalancedBlockContent(parser);
          body.push({
            type: "ImportBlock",
            path: String(importBody || "").trim(),
            keywords: keywordSnapshot,
            start: start,
            end: parser.index,
            raw: parser.source.slice(start, parser.index),
          });
          continue;
        }

        const items = parseBlockItems(parser, scopedKeywordAliases);
        expect(parser, "}");
        body.push({
          type: "Element",
          selectors: selectors,
          prefixDirectives: prefixDirectives,
          items: items,
          keywords: keywordSnapshot,
          start: start,
          end: parser.index,
          raw: parser.source.slice(start, parser.index),
        });
      } catch (error) {
        if (error && error.name === "QHtmlParseError") {
          parser.index = recoveryStart;
          const recovered = consumeRecoverableRaw(parser, { mode: "top" });
          if (recovered) {
            body.push(recovered);
            continue;
          }
        }
        throw error;
      }
    }

    return body;
  }

  function parseQHtmlToAst(source, options) {
    const parser = parserFor(source);
    const opts = options || {};
    const keywordAliases = cloneKeywordAliases(opts.keywordAliases);
    const body = parseTopLevelItems(parser, keywordAliases);
    return {
      type: "Program",
      body: body,
      source: String(source || ""),
    };
  }

  function isImportWordChar(ch) {
    return /[A-Za-z0-9_-]/.test(String(ch || ""));
  }

  function findMatchingBraceInText(source, openIndex) {
    const text = String(source || "");
    if (openIndex < 0 || openIndex >= text.length || text.charAt(openIndex) !== "{") {
      return -1;
    }

    let depth = 0;
    let quote = "";
    let escaped = false;

    for (let i = openIndex; i < text.length; i += 1) {
      const ch = text.charAt(i);
      if (quote) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === "\\") {
          escaped = true;
          continue;
        }
        if (ch === quote) {
          quote = "";
        }
        continue;
      }

      if (ch === '"' || ch === "'" || ch === "`") {
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

  function findNextQImportBlock(source, startIndex) {
    const text = String(source || "");
    const start = Math.max(0, Number(startIndex) || 0);

    let quote = "";
    let escaped = false;

    for (let i = start; i < text.length; i += 1) {
      const ch = text.charAt(i);

      if (quote) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === "\\") {
          escaped = true;
          continue;
        }
        if (ch === quote) {
          quote = "";
        }
        continue;
      }

      if (ch === '"' || ch === "'" || ch === "`") {
        quote = ch;
        continue;
      }

      if (i + 8 > text.length) {
        break;
      }
      const token = text.slice(i, i + 8);
      if (token.toLowerCase() !== "q-import") {
        continue;
      }

      const before = i > 0 ? text.charAt(i - 1) : "";
      const afterToken = i + 8 < text.length ? text.charAt(i + 8) : "";
      if (isImportWordChar(before) || isImportWordChar(afterToken)) {
        continue;
      }

      let cursor = i + 8;
      while (cursor < text.length && /\s/.test(text.charAt(cursor))) {
        cursor += 1;
      }
      if (text.charAt(cursor) !== "{") {
        continue;
      }

      const close = findMatchingBraceInText(text, cursor);
      if (close === -1) {
        throw new Error("Unterminated q-import block.");
      }

      return {
        start: i,
        open: cursor,
        close: close,
        block: text.slice(i, close + 1),
      };
    }

    return null;
  }

  function normalizeImportPath(rawPath) {
    let path = String(rawPath || "").trim();
    if (path.endsWith(";")) {
      path = path.slice(0, -1).trim();
    }
    if (
      (path.startsWith('"') && path.endsWith('"')) ||
      (path.startsWith("'") && path.endsWith("'")) ||
      (path.startsWith("`") && path.endsWith("`"))
    ) {
      path = path.slice(1, -1).trim();
    }
    return path;
  }

  function resolveImportUrl(path, baseUrl) {
    const value = String(path || "").trim();
    if (!value) {
      return "";
    }

    if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(value) || value.startsWith("//")) {
      return value;
    }

    function normalizeJoinedUrl(joined) {
      const text = String(joined || "");
      const protocolMatch = text.match(/^([A-Za-z][A-Za-z0-9+.-]*:\/\/[^/]*)(\/.*)?$/);
      const origin = protocolMatch ? protocolMatch[1] : "";
      const tail = protocolMatch ? protocolMatch[2] || "/" : text;
      const parts = tail.split("/");
      const out = [];
      for (let i = 0; i < parts.length; i += 1) {
        const part = parts[i];
        if (!part || part === ".") {
          continue;
        }
        if (part === "..") {
          if (out.length > 0) {
            out.pop();
          }
          continue;
        }
        out.push(part);
      }
      const normalizedPath = "/" + out.join("/");
      return origin ? origin + normalizedPath : normalizedPath;
    }

    function resolveRelativeWithoutURL(relative, base) {
      const cleanBase = String(base || "").split("#")[0].split("?")[0];
      if (!cleanBase) {
        return relative;
      }

      if (relative.startsWith("/")) {
        const originMatch = cleanBase.match(/^([A-Za-z][A-Za-z0-9+.-]*:\/\/[^/]+)/);
        if (originMatch) {
          return originMatch[1] + relative;
        }
        return relative;
      }

      const baseDir = cleanBase.endsWith("/") ? cleanBase : cleanBase.replace(/\/[^/]*$/, "/");
      return normalizeJoinedUrl(baseDir + relative);
    }

    const base = String(baseUrl || "").trim();
    if (base) {
      try {
        if (typeof URL === "function") {
          return new URL(value, base).toString();
        }
        return resolveRelativeWithoutURL(value, base);
      } catch (error) {
        return resolveRelativeWithoutURL(value, base);
      }
    }

    const documentBase =
      global &&
      global.document &&
      typeof global.document.baseURI === "string" &&
      global.document.baseURI
        ? String(global.document.baseURI)
        : "";
    if (documentBase) {
      try {
        if (typeof URL === "function") {
          return new URL(value, documentBase).toString();
        }
        return resolveRelativeWithoutURL(value, documentBase);
      } catch (error) {
        return resolveRelativeWithoutURL(value, documentBase);
      }
    }

    return value;
  }

  const qImportSyncCache = new Map();
  const qImportAsyncCache = new Map();

  function resolveQImportsSync(source, options) {
    const opts = options || {};
    const loadImportSync = typeof opts.loadImportSync === "function" ? opts.loadImportSync : null;
    if (!loadImportSync) {
      return String(source || "");
    }

    const maxImports = typeof opts.maxImports === "number" && opts.maxImports > 0 ? opts.maxImports : 200;
    const cache = opts.cache instanceof Map ? opts.cache : qImportSyncCache;
    const onImport = typeof opts.onImport === "function" ? opts.onImport : null;
    const counter = { value: 0 };

    function expandImports(input, baseUrl, stack) {
      let out = String(input || "");
      let cursor = 0;

      while (true) {
        const found = findNextQImportBlock(out, cursor);
        if (!found) {
          break;
        }

        const importBody = out.slice(found.open + 1, found.close);
        const importPath = normalizeImportPath(importBody);
        if (!importPath) {
          throw new Error("q-import path cannot be empty.");
        }

        if (counter.value >= maxImports) {
          throw new Error("q-import limit exceeded (" + maxImports + ").");
        }

        const resolvedUrl = resolveImportUrl(importPath, baseUrl);
        if (stack.indexOf(resolvedUrl) !== -1) {
          throw new Error("Circular q-import detected: " + stack.concat(resolvedUrl).join(" -> "));
        }
        if (onImport) {
          onImport({
            path: importPath,
            url: resolvedUrl,
            baseUrl: baseUrl || "",
          });
        }

        let replacement;
        if (cache.has(resolvedUrl)) {
          replacement = cache.get(resolvedUrl);
        } else {
          counter.value += 1;
          const importedSource = loadImportSync(resolvedUrl, {
            path: importPath,
            baseUrl: baseUrl || "",
          });
          const importedText = String(importedSource || "");
          replacement = expandImports(importedText, resolvedUrl, stack.concat(resolvedUrl));
          cache.set(resolvedUrl, replacement);
        }

        out = out.slice(0, found.start) + replacement + out.slice(found.close + 1);
        cursor = found.start + replacement.length;
      }

      return out;
    }

    return expandImports(String(source || ""), String(opts.baseUrl || ""), []);
  }

  async function resolveQImportsAsync(source, options) {
    const opts = options || {};
    const loadImport = typeof opts.loadImport === "function" ? opts.loadImport : null;
    if (!loadImport) {
      return String(source || "");
    }

    const maxImports = typeof opts.maxImports === "number" && opts.maxImports > 0 ? opts.maxImports : 200;
    const cache = opts.cache instanceof Map ? opts.cache : qImportAsyncCache;
    const onImport = typeof opts.onImport === "function" ? opts.onImport : null;
    const counter = { value: 0 };

    async function expandImports(input, baseUrl, stack) {
      let out = String(input || "");
      let cursor = 0;

      while (true) {
        const found = findNextQImportBlock(out, cursor);
        if (!found) {
          break;
        }

        const importBody = out.slice(found.open + 1, found.close);
        const importPath = normalizeImportPath(importBody);
        if (!importPath) {
          throw new Error("q-import path cannot be empty.");
        }

        if (counter.value >= maxImports) {
          throw new Error("q-import limit exceeded (" + maxImports + ").");
        }

        const resolvedUrl = resolveImportUrl(importPath, baseUrl);
        if (stack.indexOf(resolvedUrl) !== -1) {
          throw new Error("Circular q-import detected: " + stack.concat(resolvedUrl).join(" -> "));
        }
        if (onImport) {
          onImport({
            path: importPath,
            url: resolvedUrl,
            baseUrl: baseUrl || "",
          });
        }

        let replacement;
        if (cache.has(resolvedUrl)) {
          replacement = await Promise.resolve(cache.get(resolvedUrl));
        } else {
          const pending = (async function resolveImportedSource() {
            counter.value += 1;
            const importedSource = await Promise.resolve(
              loadImport(resolvedUrl, {
                path: importPath,
                baseUrl: baseUrl || "",
              })
            );
            const importedText = String(importedSource || "");
            return expandImports(importedText, resolvedUrl, stack.concat(resolvedUrl));
          })();

          cache.set(resolvedUrl, pending);
          try {
            replacement = await pending;
            cache.set(resolvedUrl, replacement);
          } catch (error) {
            cache.delete(resolvedUrl);
            throw error;
          }
        }

        out = out.slice(0, found.start) + replacement + out.slice(found.close + 1);
        cursor = found.start + replacement.length;
      }

      return out;
    }

    return expandImports(String(source || ""), String(opts.baseUrl || ""), []);
  }

  function normalizePropertyName(name) {
    return String(name || "").toLowerCase().trim();
  }

  const DEFAULT_QCOLOR_THEME_NAME = "default";
  const DEFAULT_QCOLOR_AREA_PROPERTIES = Object.freeze({
    background: "background-color",
    surface: "background-color",
    surfaceAlt: "background-color",
    foreground: "color",
    foregroundMuted: "color",
    muted: "color",
    border: "border-color",
    borderStrong: "border-color",
    primary: "color",
    primaryContrast: "color",
    secondary: "color",
    secondaryContrast: "color",
    accent: "color",
    accentContrast: "color",
    success: "color",
    successContrast: "color",
    danger: "color",
    dangerContrast: "color",
    warning: "color",
    warningContrast: "color",
    info: "color",
    infoContrast: "color",
    overlay: "background-color",
    shadow: "box-shadow",
    link: "color",
    linkHover: "color",
    focusRing: "outline-color",
    titleBackground: "background-color",
    titleForeground: "color",
    panelBackground: "background-color",
    panelForeground: "color",
    cardBackground: "background-color",
    cardForeground: "color",
    modalBackground: "background-color",
    modalForeground: "color",
    navBackground: "background-color",
    navForeground: "color",
    toolbarBackground: "background-color",
    toolbarForeground: "color",
    buttonBackground: "background-color",
    buttonForeground: "color",
    buttonBorder: "border-color",
    buttonHoverBackground: "background-color",
    buttonHoverForeground: "color",
    inputBackground: "background-color",
    inputForeground: "color",
    inputBorder: "border-color",
    badgeBackground: "background-color",
    badgeForeground: "color",
    selectionBackground: "background-color",
    selectionForeground: "color",
  });
  const DEFAULT_QCOLOR_THEME_ASSIGNMENTS = Object.freeze({
    background: "#f8fafc",
    surface: "rgb(238, 243, 251)",
    surfaceAlt: "#f1f5f9",
    foreground: "#0f172a",
    foregroundMuted: "#475569",
    muted: "#64748b",
    border: "#cbd5e1",
    borderStrong: "#94a3b8",
    primary: "#1d4ed8",
    primaryContrast: "rgb(238, 243, 251)",
    secondary: "#334155",
    secondaryContrast: "rgb(238, 243, 251)",
    accent: "#0ea5e9",
    accentContrast: "#082f49",
    success: "#16a34a",
    successContrast: "rgb(238, 243, 251)",
    danger: "#dc2626",
    dangerContrast: "rgb(238, 243, 251)",
    warning: "#f59e0b",
    warningContrast: "#111827",
    info: "#0284c7",
    infoContrast: "rgb(238, 243, 251)",
    overlay: "rgba(15, 23, 42, 0.72)",
    shadow: "rgba(15, 23, 42, 0.18)",
    link: "#1d4ed8",
    linkHover: "#1e40af",
    focusRing: "#f59e0b",
    titleBackground: "#e2e8f0",
    titleForeground: "#0f172a",
    panelBackground: "rgb(238, 243, 251)",
    panelForeground: "#0f172a",
    cardBackground: "rgb(238, 243, 251)",
    cardForeground: "#0f172a",
    modalBackground: "rgb(238, 243, 251)",
    modalForeground: "#0f172a",
    navBackground: "#334155",
    navForeground: "rgb(238, 243, 251)",
    toolbarBackground: "#0f172a",
    toolbarForeground: "#f8fafc",
    buttonBackground: "#1d4ed8",
    buttonForeground: "rgb(238, 243, 251)",
    buttonBorder: "#1e40af",
    buttonHoverBackground: "#1e40af",
    buttonHoverForeground: "rgb(238, 243, 251)",
    inputBackground: "rgb(238, 243, 251)",
    inputForeground: "#0f172a",
    inputBorder: "#cbd5e1",
    badgeBackground: "#1d4ed8",
    badgeForeground: "rgb(238, 243, 251)",
    selectionBackground: "#bfdbfe",
    selectionForeground: "#0f172a",
  });

  const Q_COLOR_STYLE_PROPERTY_MAP = Object.freeze({
    background: "background-color",
    foreground: "color",
    border: "border-color",
    outline: "outline-color",
    caret: "caret-color",
    fill: "fill",
    stroke: "stroke",
    shadow: "box-shadow",
    primary: "--q-color-primary",
    secondary: "--q-color-secondary",
    accent: "--q-color-accent",
    surface: "--q-color-surface",
    surfacealt: "--q-color-surface-alt",
    muted: "--q-color-muted",
    foregroundmuted: "--q-color-foreground-muted",
    borderstrong: "--q-color-border-strong",
    success: "--q-color-success",
    warning: "--q-color-warning",
    danger: "--q-color-danger",
    info: "--q-color-info",
    link: "--q-color-link",
    linkhover: "--q-color-link-hover",
    focusring: "--q-color-focus-ring",
    overlay: "--q-color-overlay",
    primarycontrast: "--q-color-primary-contrast",
    secondarycontrast: "--q-color-secondary-contrast",
    accentcontrast: "--q-color-accent-contrast",
    successcontrast: "--q-color-success-contrast",
    warningcontrast: "--q-color-warning-contrast",
    dangercontrast: "--q-color-danger-contrast",
    infocontrast: "--q-color-info-contrast",
    titlebackground: "--q-color-title-background",
    titleforeground: "--q-color-title-foreground",
    panelbackground: "--q-color-panel-background",
    panelforeground: "--q-color-panel-foreground",
    cardbackground: "--q-color-card-background",
    cardforeground: "--q-color-card-foreground",
    modalbackground: "--q-color-modal-background",
    modalforeground: "--q-color-modal-foreground",
    navbackground: "--q-color-nav-background",
    navforeground: "--q-color-nav-foreground",
    toolbarbackground: "--q-color-toolbar-background",
    toolbarforeground: "--q-color-toolbar-foreground",
    buttonbackground: "--q-color-button-background",
    buttonforeground: "--q-color-button-foreground",
    buttonborder: "--q-color-button-border",
    buttonhoverbackground: "--q-color-button-hover-background",
    buttonhoverforeground: "--q-color-button-hover-foreground",
    inputbackground: "--q-color-input-background",
    inputforeground: "--q-color-input-foreground",
    inputborder: "--q-color-input-border",
    badgebackground: "--q-color-badge-background",
    badgeforeground: "--q-color-badge-foreground",
    selectionbackground: "--q-color-selection-background",
    selectionforeground: "--q-color-selection-foreground",
  });

  function qColorStylePropertyForKey(key) {
    const normalized = normalizeColorLookupKey(key);
    if (!normalized) {
      return "";
    }
    if (Object.prototype.hasOwnProperty.call(Q_COLOR_STYLE_PROPERTY_MAP, normalized)) {
      return Q_COLOR_STYLE_PROPERTY_MAP[normalized];
    }
    return "--q-color-" + normalized.replace(/[^A-Za-z0-9_-]/g, "-");
  }

  function cloneQColorAssignments(assignments) {
    return assignments && typeof assignments === "object" && !Array.isArray(assignments)
      ? Object.assign({}, assignments)
      : {};
  }

  function cloneQColorAreas(areas) {
    return Array.isArray(areas) ? areas.slice() : [];
  }

  function cloneQColorSetup(setup) {
    if (!setup || typeof setup !== "object") {
      return { name: "", assignments: {}, areas: [] };
    }
    return {
      name: String(setup.name || "").trim(),
      assignments: cloneQColorAssignments(setup.assignments),
      areas: cloneQColorAreas(setup.areas),
    };
  }

  function appendActiveQColorSetup(colorContext, setup) {
    if (!colorContext || !Array.isArray(colorContext.activeSetups)) {
      return;
    }
    const cloned = cloneQColorSetup(setup);
    if (!cloned.name && Object.keys(cloned.assignments).length === 0 && cloned.areas.length === 0) {
      return;
    }
    colorContext.activeSetups.push(cloned);
  }

  function registerQColorDefinition(colorContext, definitionName, parsed) {
    if (!colorContext || !(colorContext.colorDefs instanceof Map)) {
      return;
    }
    const normalized = normalizeColorLookupKey(definitionName);
    const name = String(definitionName || "").trim();
    if (!normalized || !name) {
      return;
    }
    const definition = cloneQColorSetup({
      name: name,
      assignments: parsed && parsed.assignments,
      areas: parsed && parsed.areas,
    });
    definition.name = name;
    colorContext.colorDefs.set(normalized, definition);
  }

  function lookupQColorDefinition(colorContext, definitionName) {
    const normalized = normalizeColorLookupKey(definitionName);
    if (!normalized || !colorContext || !(colorContext.colorDefs instanceof Map)) {
      return null;
    }
    const entry = colorContext.colorDefs.get(normalized);
    if (!entry || typeof entry !== "object") {
      return null;
    }
    return cloneQColorSetup(entry);
  }

  function registerQColorSchema(colorContext, areaName, cssProperty) {
    if (!colorContext || !(colorContext.schemas instanceof Map)) {
      return;
    }
    const normalized = normalizeColorLookupKey(areaName);
    const property = normalizeCssPropertyName(cssProperty);
    if (!normalized || !property) {
      return;
    }
    colorContext.schemas.set(normalized, {
      name: String(areaName || "").trim() || normalized,
      property: property,
    });
  }

  function registerQColorTheme(colorContext, themeName, assignments, options) {
    if (!colorContext || !(colorContext.themes instanceof Map)) {
      return;
    }
    const normalized = normalizeColorLookupKey(themeName);
    if (!normalized) {
      return;
    }
    colorContext.themes.set(normalized, {
      name: String(themeName || "").trim() || normalized,
      assignments: cloneQColorAssignments(assignments),
    });
    const opts = options || {};
    if (opts.setAsDefault === true || !String(colorContext.defaultThemeName || "").trim()) {
      colorContext.defaultThemeName = normalized;
    }
  }

  function createQColorContext(parentContext) {
    const context = {
      schemas: new Map(),
      schemaDefs: new Map(),
      colorDefs: new Map(),
      activeSetups: [],
      themes: new Map(),
      defaultThemeName: DEFAULT_QCOLOR_THEME_NAME,
    };
    if (parentContext && parentContext.schemas instanceof Map) {
      parentContext.schemas.forEach(function copySchema(entry, key) {
        if (!entry || typeof entry !== "object") {
          return;
        }
        context.schemas.set(String(key || ""), {
          name: String(entry.name || key || "").trim() || String(key || ""),
          property: String(entry.property || "").trim(),
        });
      });
    }
    if (parentContext && parentContext.schemaDefs instanceof Map) {
      parentContext.schemaDefs.forEach(function copySchemaDef(entry, key) {
        if (!entry || typeof entry !== "object") {
          return;
        }
        context.schemaDefs.set(String(key || ""), {
          name: String(entry.name || key || "").trim() || String(key || ""),
          entries: cloneQColorAssignments(entry.entries),
        });
      });
    }
    if (parentContext && parentContext.colorDefs instanceof Map) {
      parentContext.colorDefs.forEach(function copyColorDef(entry, key) {
        if (!entry || typeof entry !== "object") {
          return;
        }
        context.colorDefs.set(String(key || ""), cloneQColorSetup(entry));
      });
    }
    if (parentContext && Array.isArray(parentContext.activeSetups)) {
      for (let i = 0; i < parentContext.activeSetups.length; i += 1) {
        appendActiveQColorSetup(context, parentContext.activeSetups[i]);
      }
    }
    if (parentContext && parentContext.themes instanceof Map) {
      parentContext.themes.forEach(function copyTheme(entry, key) {
        if (!entry || typeof entry !== "object") {
          return;
        }
        context.themes.set(String(key || ""), {
          name: String(entry.name || key || "").trim() || String(key || ""),
          assignments: cloneQColorAssignments(entry.assignments),
        });
      });
    }
    if (parentContext && typeof parentContext.defaultThemeName === "string" && parentContext.defaultThemeName.trim()) {
      context.defaultThemeName = parentContext.defaultThemeName.trim();
    }
    if (context.schemas.size === 0 && context.themes.size === 0 && !parentContext) {
      const schemaKeys = Object.keys(DEFAULT_QCOLOR_AREA_PROPERTIES);
      for (let i = 0; i < schemaKeys.length; i += 1) {
        const key = schemaKeys[i];
        registerQColorSchema(context, key, DEFAULT_QCOLOR_AREA_PROPERTIES[key]);
      }
      registerQColorTheme(context, DEFAULT_QCOLOR_THEME_NAME, DEFAULT_QCOLOR_THEME_ASSIGNMENTS, {
        setAsDefault: true,
      });
    }
    return context;
  }

  function createScopedConversionContext(parentContext) {
    const parentColors =
      parentContext && parentContext.qColors && typeof parentContext.qColors === "object"
        ? parentContext.qColors
        : null;
    const parentStyles =
      parentContext && parentContext.qStyles && typeof parentContext.qStyles === "object"
        ? parentContext.qStyles
        : null;
    const parentArrays =
      parentContext && parentContext.qArrays instanceof Map
        ? parentContext.qArrays
        : null;
    const parentObjects =
      parentContext && parentContext.qObjects instanceof Map
        ? parentContext.qObjects
        : null;
    const parentModels =
      parentContext && parentContext.qModels instanceof Map
        ? parentContext.qModels
        : null;
    const parentRepeaterScope =
      parentContext && parentContext.repeaterScope && typeof parentContext.repeaterScope === "object"
        ? parentContext.repeaterScope
        : null;
    const qArrays = new Map();
    const qObjects = new Map();
    const qModels = new Map();
    if (parentArrays instanceof Map) {
      parentArrays.forEach(function copyArray(value, key) {
        qArrays.set(String(key || ""), deepClonePlainValue(value));
      });
    }
    if (parentObjects instanceof Map) {
      parentObjects.forEach(function copyObject(value, key) {
        qObjects.set(String(key || ""), deepClonePlainValue(value));
      });
    }
    if (parentModels instanceof Map) {
      parentModels.forEach(function copyModel(value, key) {
        qModels.set(String(key || ""), deepClonePlainValue(value));
      });
    }
    return {
      qColors: createQColorContext(parentColors),
      qStyles: createQStyleContext(parentStyles),
      qArrays: qArrays,
      qObjects: qObjects,
      qModels: qModels,
      repeaterScope: parentRepeaterScope ? Object.assign({}, parentRepeaterScope) : {},
    };
  }

  function deepClonePlainValue(value) {
    if (Array.isArray(value)) {
      const out = [];
      for (let i = 0; i < value.length; i += 1) {
        out.push(deepClonePlainValue(value[i]));
      }
      return out;
    }
    if (!value || typeof value !== "object") {
      return value;
    }
    const out = {};
    const keys = Object.keys(value);
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      out[key] = deepClonePlainValue(value[key]);
    }
    return out;
  }

  function cloneQStyleDeclarations(declarations) {
    return declarations && typeof declarations === "object" && !Array.isArray(declarations)
      ? Object.assign({}, declarations)
      : {};
  }

  function cloneQStyleClasses(classes) {
    const list = Array.isArray(classes) ? classes : [];
    const out = [];
    const seen = new Set();
    for (let i = 0; i < list.length; i += 1) {
      const className = String(list[i] || "").trim();
      const normalized = className.toLowerCase();
      if (!className || seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      out.push(className);
    }
    return out;
  }

  function cloneQThemeRules(rules) {
    const list = Array.isArray(rules) ? rules : [];
    const out = [];
    for (let i = 0; i < list.length; i += 1) {
      const rule = list[i];
      if (!rule || typeof rule !== "object") {
        continue;
      }
      const includeTheme = String(rule.includeTheme || "").trim();
      if (includeTheme) {
        out.push({
          includeTheme: includeTheme,
        });
        continue;
      }
      out.push({
        selector: String(rule.selector || "").trim(),
        styles: Array.isArray(rule.styles)
          ? rule.styles.map(function cloneStyleName(entry) { return String(entry || "").trim(); }).filter(Boolean)
          : [],
      });
    }
    return out;
  }

  function cloneQThemeDefinition(themeDefinition) {
    const entry = themeDefinition && typeof themeDefinition === "object" ? themeDefinition : {};
    return {
      name: String(entry.name || "").trim(),
      isDefault: !!entry.isDefault,
      rules: cloneQThemeRules(entry.rules),
    };
  }

  function cloneQStyleDefinition(styleDefinition) {
    const entry = styleDefinition && typeof styleDefinition === "object" ? styleDefinition : {};
    return {
      name: String(entry.name || "").trim(),
      declarations: cloneQStyleDeclarations(entry.declarations),
      classes: cloneQStyleClasses(entry.classes),
    };
  }

  function registerQStyleDefinition(styleContext, styleName, declarations, classes) {
    if (!styleContext || !(styleContext.styles instanceof Map)) {
      return;
    }
    const name = String(styleName || "").trim();
    const normalized = normalizeColorLookupKey(name);
    if (!name || !normalized) {
      return;
    }
    styleContext.styles.set(normalized, {
      name: name,
      declarations: cloneQStyleDeclarations(declarations),
      classes: cloneQStyleClasses(classes),
    });
  }

  function lookupQStyleDefinition(styleContext, styleName) {
    if (!styleContext || !(styleContext.styles instanceof Map)) {
      return null;
    }
    const normalized = normalizeColorLookupKey(styleName);
    if (!normalized) {
      return null;
    }
    const entry = styleContext.styles.get(normalized);
    if (!entry || typeof entry !== "object") {
      return null;
    }
    const out = cloneQStyleDefinition(entry);
    out.name = out.name || String(styleName || "").trim();
    return out;
  }

  function registerQThemeDefinition(styleContext, themeName, rules, options) {
    if (!styleContext || !(styleContext.themes instanceof Map)) {
      return;
    }
    const opts = options || {};
    const name = String(themeName || "").trim();
    const normalized = normalizeColorLookupKey(name);
    if (!name || !normalized) {
      return;
    }
    styleContext.themes.set(normalized, {
      name: name,
      isDefault: !!opts.isDefault,
      rules: cloneQThemeRules(rules),
    });
  }

  function lookupQThemeDefinition(styleContext, themeName) {
    if (!styleContext || !(styleContext.themes instanceof Map)) {
      return null;
    }
    const normalized = normalizeColorLookupKey(themeName);
    if (!normalized) {
      return null;
    }
    const entry = styleContext.themes.get(normalized);
    if (!entry || typeof entry !== "object") {
      return null;
    }
    const out = cloneQThemeDefinition(entry);
    out.name = out.name || String(themeName || "").trim();
    return out;
  }

  function appendActiveQTheme(styleContext, themeDefinition) {
    if (
      !styleContext ||
      !Array.isArray(styleContext.activeThemes) ||
      !Array.isArray(styleContext.activeDefaultThemes)
    ) {
      return;
    }
    if (!themeDefinition || typeof themeDefinition !== "object") {
      return;
    }
    const themeName = String(themeDefinition.name || "").trim();
    const visited = new Set();
    const themeKey = normalizeColorLookupKey(themeName);
    if (themeKey) {
      visited.add(themeKey);
    }
    const expandedRules = expandQThemeRules(styleContext, themeDefinition, visited);
    const nextEntry = {
      name: themeName,
      isDefault: !!themeDefinition.isDefault,
      rules: expandedRules,
    };
    if (nextEntry.isDefault) {
      styleContext.activeDefaultThemes.push(nextEntry);
    } else {
      styleContext.activeThemes.push(nextEntry);
    }
  }

  function createQStyleContext(parentContext) {
    const context = {
      styles: new Map(),
      themes: new Map(),
      activeDefaultThemes: [],
      activeThemes: [],
    };
    if (parentContext && parentContext.styles instanceof Map) {
      parentContext.styles.forEach(function copyStyle(entry, key) {
        if (!entry || typeof entry !== "object") {
          return;
        }
        context.styles.set(String(key || ""), {
          name: String(entry.name || key || "").trim() || String(key || ""),
          declarations: cloneQStyleDeclarations(entry.declarations),
          classes: cloneQStyleClasses(entry.classes),
        });
      });
    }
    if (parentContext && parentContext.themes instanceof Map) {
      parentContext.themes.forEach(function copyTheme(entry, key) {
        if (!entry || typeof entry !== "object") {
          return;
        }
        context.themes.set(String(key || ""), {
          name: String(entry.name || key || "").trim() || String(key || ""),
          rules: cloneQThemeRules(entry.rules),
        });
      });
    }
    if (parentContext && Array.isArray(parentContext.activeThemes)) {
      for (let i = 0; i < parentContext.activeThemes.length; i += 1) {
        appendActiveQTheme(context, parentContext.activeThemes[i]);
      }
    }
    if (parentContext && Array.isArray(parentContext.activeDefaultThemes)) {
      for (let i = 0; i < parentContext.activeDefaultThemes.length; i += 1) {
        appendActiveQTheme(context, parentContext.activeDefaultThemes[i]);
      }
    }
    return context;
  }

  function qStyleDeclarationsToCssText(declarations) {
    const source = declarations && typeof declarations === "object" && !Array.isArray(declarations)
      ? declarations
      : {};
    const keys = Object.keys(source);
    const chunks = [];
    for (let i = 0; i < keys.length; i += 1) {
      const rawProperty = String(keys[i] || "").trim();
      if (!rawProperty) {
        continue;
      }
      const value = String(source[rawProperty] || "").trim();
      if (!value) {
        continue;
      }
      const property = normalizeCssPropertyName(rawProperty);
      if (!property) {
        continue;
      }
      chunks.push(property + ": " + value);
    }
    return chunks.join("; ").trim();
  }

  function applyQStyleToElementNode(elementNode, styleDefinition) {
    if (!elementNode || elementNode.kind !== core.NODE_TYPES.element) {
      return;
    }
    if (!styleDefinition || typeof styleDefinition !== "object") {
      return;
    }
    const classNames = cloneQStyleClasses(styleDefinition.classes);
    if (classNames.length > 0) {
      elementNode.attributes.class = core.mergeClasses(
        elementNode.attributes && elementNode.attributes.class,
        classNames
      );
    }
    const cssText = qStyleDeclarationsToCssText(styleDefinition.declarations);
    if (!cssText) {
      return;
    }
    mergeStyleAttribute(elementNode, cssText);
  }

  function doesQThemeSelectorMatchElement(selector, elementNode) {
    const target = String(selector || "").trim();
    if (!target || !elementNode || elementNode.kind !== core.NODE_TYPES.element) {
      return false;
    }
    if (target === "*") {
      return true;
    }
    const parsed = parseTagToken(target);
    const nodeTag = String(elementNode.tagName || "").trim().toLowerCase();
    if (parsed.tag && parsed.tag !== nodeTag) {
      return false;
    }
    const attrs = elementNode.attributes && typeof elementNode.attributes === "object" ? elementNode.attributes : {};
    function wildcardMatch(value, pattern) {
      const source = String(value == null ? "" : value).trim().toLowerCase();
      const query = String(pattern == null ? "" : pattern).trim().toLowerCase();
      if (!query) {
        return false;
      }
      if (query.indexOf("*") === -1) {
        return source === query;
      }
      const escaped = query.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
      const matcher = new RegExp("^" + escaped + "$");
      return matcher.test(source);
    }
    if (parsed.id && !wildcardMatch(String(attrs.id || ""), parsed.id)) {
      return false;
    }
    if (Array.isArray(parsed.classes) && parsed.classes.length > 0) {
      const classNameSet = String(attrs.class || "")
        .split(/\s+/)
        .filter(Boolean)
        .map(function lowerClassName(name) { return String(name).toLowerCase(); });
      for (let i = 0; i < parsed.classes.length; i += 1) {
        const expected = String(parsed.classes[i] || "").trim().toLowerCase();
        let matched = false;
        for (let ci = 0; ci < classNameSet.length; ci += 1) {
          if (wildcardMatch(classNameSet[ci], expected)) {
            matched = true;
            break;
          }
        }
        if (!matched) {
          return false;
        }
      }
    }
    return true;
  }

  function applyActiveQThemesToElementNode(elementNode, styleContext) {
    if (!elementNode || elementNode.kind !== core.NODE_TYPES.element) {
      return;
    }
    if (
      !styleContext ||
      (!Array.isArray(styleContext.activeThemes) && !Array.isArray(styleContext.activeDefaultThemes))
    ) {
      return;
    }
    const themeSources = []
      .concat(Array.isArray(styleContext.activeDefaultThemes) ? styleContext.activeDefaultThemes : [])
      .concat(Array.isArray(styleContext.activeThemes) ? styleContext.activeThemes : []);
    for (let ti = 0; ti < themeSources.length; ti += 1) {
      const theme = themeSources[ti];
      const rules = Array.isArray(theme && theme.rules) ? theme.rules : [];
      for (let ri = 0; ri < rules.length; ri += 1) {
        const rule = rules[ri];
        if (!rule || !doesQThemeSelectorMatchElement(rule.selector, elementNode)) {
          continue;
        }
        const styleNames = Array.isArray(rule.styles) ? rule.styles : [];
        for (let si = 0; si < styleNames.length; si += 1) {
          const styleDef = lookupQStyleDefinition(styleContext, styleNames[si]);
          if (!styleDef) {
            continue;
          }
          applyQStyleToElementNode(elementNode, styleDef);
        }
      }
    }
  }

  function resolveQThemeRuleRuntimeStyle(styleContext, styleNames) {
    const names = Array.isArray(styleNames) ? styleNames : [];
    const declarations = {};
    const classes = [];
    const seenClasses = new Set();
    for (let i = 0; i < names.length; i += 1) {
      const styleDef = lookupQStyleDefinition(styleContext, names[i]);
      if (!styleDef) {
        continue;
      }
      const nextDecls = styleDef.declarations && typeof styleDef.declarations === "object" && !Array.isArray(styleDef.declarations)
        ? styleDef.declarations
        : {};
      const declKeys = Object.keys(nextDecls);
      for (let di = 0; di < declKeys.length; di += 1) {
        const key = String(declKeys[di] || "").trim();
        if (!key) {
          continue;
        }
        declarations[key] = String(nextDecls[key] || "").trim();
      }
      const nextClasses = Array.isArray(styleDef.classes) ? styleDef.classes : [];
      for (let ci = 0; ci < nextClasses.length; ci += 1) {
        const className = String(nextClasses[ci] || "").trim();
        if (!className || seenClasses.has(className)) {
          continue;
        }
        seenClasses.add(className);
        classes.push(className);
      }
    }
    return {
      declarations: declarations,
      classes: classes,
    };
  }

  function serializeActiveQThemeRulesForRuntime(styleContext, themeList) {
    const list = Array.isArray(themeList) ? themeList : [];
    const out = [];
    for (let ti = 0; ti < list.length; ti += 1) {
      const theme = list[ti];
      const rules = Array.isArray(theme && theme.rules) ? theme.rules : [];
      for (let ri = 0; ri < rules.length; ri += 1) {
        const rule = rules[ri];
        if (!rule || typeof rule !== "object") {
          continue;
        }
        const selector = String(rule.selector || "").trim();
        if (!selector) {
          continue;
        }
        const resolved = resolveQThemeRuleRuntimeStyle(styleContext, rule.styles);
        const hasDeclarations = Object.keys(resolved.declarations).length > 0;
        const hasClasses = Array.isArray(resolved.classes) && resolved.classes.length > 0;
        if (!hasDeclarations && !hasClasses) {
          continue;
        }
        out.push({
          selector: selector,
          declarations: cloneQStyleDeclarations(resolved.declarations),
          classes: cloneQStyleClasses(resolved.classes),
        });
      }
    }
    return out;
  }

  function attachRuntimeThemeRulesToElementNode(elementNode, styleContext) {
    if (!elementNode || elementNode.kind !== core.NODE_TYPES.element) {
      return;
    }
    if (
      !styleContext ||
      (!Array.isArray(styleContext.activeThemes) && !Array.isArray(styleContext.activeDefaultThemes))
    ) {
      return;
    }
    const defaultRules = serializeActiveQThemeRulesForRuntime(styleContext, styleContext.activeDefaultThemes);
    const rules = serializeActiveQThemeRulesForRuntime(styleContext, styleContext.activeThemes);
    if (defaultRules.length === 0 && rules.length === 0) {
      return;
    }
    if (!elementNode.meta || typeof elementNode.meta !== "object") {
      elementNode.meta = {};
    }
    elementNode.meta.qRuntimeThemeRules = {
      defaultRules: defaultRules,
      rules: rules,
    };
  }

  function lookupQColorPropertyByArea(colorContext, areaName, options) {
    const opts = options && typeof options === "object" ? options : {};
    const normalized = normalizeColorLookupKey(areaName);
    if (!normalized || !colorContext || !(colorContext.schemas instanceof Map)) {
      return "";
    }
    const entry = colorContext.schemas.get(normalized);
    if (!entry || typeof entry !== "object") {
      const areaValues =
        opts.areaValues && typeof opts.areaValues === "object" && !Array.isArray(opts.areaValues)
          ? opts.areaValues
          : null;
      if (areaValues && lookupAreaValueInObject(areaValues, areaName)) {
        return normalizeCssPropertyName(areaName);
      }
      const choices = Array.from(colorContext.schemas.keys());
      if (choices.length === 0) {
        return "";
      }
      const ranked = fuzzyResolve(normalized, choices, 1);
      if (!Array.isArray(ranked) || ranked.length === 0 || !ranked[0]) {
        return "";
      }
      const fallbackEntry = colorContext.schemas.get(String(ranked[0].candidate || ""));
      if (!fallbackEntry || typeof fallbackEntry !== "object") {
        return "";
      }
      return String(fallbackEntry.property || "").trim();
    }
    return String(entry.property || "").trim();
  }

  function lookupQColorThemeAssignments(colorContext, themeName) {
    const normalized = normalizeColorLookupKey(themeName);
    if (!normalized || !colorContext || !(colorContext.themes instanceof Map)) {
      return null;
    }
    const entry = colorContext.themes.get(normalized);
    if (!entry || typeof entry !== "object") {
      return null;
    }
    return cloneQColorAssignments(entry.assignments);
  }

  function lookupAreaValueInObject(mapObject, areaName) {
    if (!mapObject || typeof mapObject !== "object" || Array.isArray(mapObject)) {
      return "";
    }
    const target = normalizeColorLookupKey(areaName);
    if (!target) {
      return "";
    }
    const keys = Object.keys(mapObject);
    for (let i = 0; i < keys.length; i += 1) {
      const key = String(keys[i] || "").trim();
      if (!key) {
        continue;
      }
      if (normalizeColorLookupKey(key) !== target) {
        continue;
      }
      return normalizeQColorResolvedValue(mapObject[key]);
    }
    return "";
  }

  function resolveQColorAssignmentValue(rawValue, colorContext) {
    const value = normalizeQColorResolvedValue(rawValue);
    if (!value) {
      return "";
    }
    const themeName = String(colorContext && colorContext.defaultThemeName || "").trim();
    const theme = lookupQColorThemeAssignments(colorContext, themeName);
    const fromTheme = normalizeQColorResolvedValue(lookupAreaValueInObject(theme, value));
    if (fromTheme) {
      return fromTheme || value;
    }
    return value;
  }

  function buildQColorAreaValueMap(assignments, colorContext) {
    const source = assignments && typeof assignments === "object" ? assignments : {};
    const merged = {};
    const sourceKeys = Object.keys(source);
    const requestedKeys = [];
    for (let i = 0; i < sourceKeys.length; i += 1) {
      const key = String(sourceKeys[i] || "").trim();
      if (!key || normalizeColorLookupKey(key) === "theme") {
        continue;
      }
      requestedKeys.push(key);
    }
    const requestedPatterns = requestedKeys.map(function mapRequestedPattern(key) {
      return String(key || "").trim();
    }).filter(Boolean);
    const hasRequestedKeys = requestedPatterns.length > 0;

    const themeName = String(source.theme || colorContext && colorContext.defaultThemeName || "").trim();
    if (themeName) {
      const theme = lookupQColorThemeAssignments(colorContext, themeName);
      if (theme && typeof theme === "object") {
        const themeKeys = Object.keys(theme);
        for (let i = 0; i < themeKeys.length; i += 1) {
          const key = String(themeKeys[i] || "").trim();
          if (!key) {
            continue;
          }
          if (hasRequestedKeys && !doesQColorRequestMatchAnyArea(requestedPatterns, key)) {
            continue;
          }
          merged[key] = theme[key];
        }
      }
    }

    for (let i = 0; i < sourceKeys.length; i += 1) {
      const key = String(sourceKeys[i] || "").trim();
      if (!key || normalizeColorLookupKey(key) === "theme") {
        continue;
      }
      if (source[key] === true) {
        continue;
      }
      merged[key] = source[key];
    }

    const out = {};
    const keys = Object.keys(merged);
    for (let i = 0; i < keys.length; i += 1) {
      const key = String(keys[i] || "").trim();
      if (!key) {
        continue;
      }
      const resolvedValue = resolveQColorAssignmentValue(merged[key], colorContext);
      if (!resolvedValue) {
        continue;
      }
      out[key] = resolvedValue;
    }
    return out;
  }

  function buildQColorStyleDeclarationsFromAreaMap(areaMap, colorContext) {
    const source = areaMap && typeof areaMap === "object" ? areaMap : {};
    const declarations = [];
    const keys = Object.keys(source);
    for (let i = 0; i < keys.length; i += 1) {
      const key = String(keys[i] || "").trim();
      const value = String(source[key] || "").trim();
      if (!key || !value) {
        continue;
      }
      const cssProperty = lookupQColorPropertyByArea(colorContext, key, {
        areaValues: source,
      }) || inferQColorCssProperty(key);
      if (!cssProperty) {
        continue;
      }
      declarations.push(cssProperty + ": " + value);
    }
    return declarations;
  }

  function buildQColorStyleDeclarations(assignments, colorContext) {
    return buildQColorStyleDeclarationsFromAreaMap(
      buildQColorAreaValueMap(assignments, colorContext),
      colorContext
    );
  }

  function buildQColorAreaValueMapFromList(assignmentsList, colorContext) {
    const list = Array.isArray(assignmentsList) ? assignmentsList : [];
    const merged = {};
    for (let i = 0; i < list.length; i += 1) {
      const assignments = list[i];
      const values = buildQColorAreaValueMap(assignments, colorContext);
      const keys = Object.keys(values);
      for (let j = 0; j < keys.length; j += 1) {
        const key = String(keys[j] || "").trim();
        const value = String(values[key] || "").trim();
        if (!key || !value) {
          continue;
        }
        merged[key] = value;
      }
    }
    return merged;
  }

  function buildQColorStyleDeclarationsFromList(assignmentsList, colorContext) {
    return buildQColorStyleDeclarationsFromAreaMap(
      buildQColorAreaValueMapFromList(assignmentsList, colorContext),
      colorContext
    );
  }

  function composeStyleFromBaseAndDeclarations(baseStyle, declarations) {
    const base = String(baseStyle || "").trim();
    const list = Array.isArray(declarations) ? declarations.filter(Boolean) : [];
    const colorStyle = list.join("; ").trim();
    if (!base && !colorStyle) {
      return "";
    }
    if (!base) {
      return colorStyle;
    }
    if (!colorStyle) {
      return base;
    }
    const needsSemicolon = !base.endsWith(";");
    return (base + (needsSemicolon ? ";" : "") + " " + colorStyle).trim();
  }

  function splitInlineStyleDeclarations(styleText) {
    const source = String(styleText || "");
    const out = [];
    let token = "";
    let quote = "";
    let escaped = false;
    let parenDepth = 0;
    for (let i = 0; i < source.length; i += 1) {
      const ch = source[i];
      if (escaped) {
        token += ch;
        escaped = false;
        continue;
      }
      if (quote) {
        token += ch;
        if (ch === "\\") {
          escaped = true;
          continue;
        }
        if (ch === quote) {
          quote = "";
        }
        continue;
      }
      if (ch === "'" || ch === "\"") {
        quote = ch;
        token += ch;
        continue;
      }
      if (ch === "(") {
        parenDepth += 1;
        token += ch;
        continue;
      }
      if (ch === ")" && parenDepth > 0) {
        parenDepth -= 1;
        token += ch;
        continue;
      }
      if (ch === ";" && parenDepth === 0) {
        const chunk = String(token || "").trim();
        if (chunk) {
          out.push(chunk);
        }
        token = "";
        continue;
      }
      token += ch;
    }
    const trailing = String(token || "").trim();
    if (trailing) {
      out.push(trailing);
    }
    return out;
  }

  function parseInlineStyleDeclarations(styleText) {
    const entries = splitInlineStyleDeclarations(styleText);
    const out = [];
    for (let i = 0; i < entries.length; i += 1) {
      const raw = String(entries[i] || "").trim();
      if (!raw) {
        continue;
      }
      const colonIndex = raw.indexOf(":");
      if (colonIndex <= 0) {
        continue;
      }
      const property = String(raw.slice(0, colonIndex) || "").trim();
      const value = String(raw.slice(colonIndex + 1) || "").trim();
      if (!property || !value) {
        continue;
      }
      out.push({
        property: property,
        normalizedProperty: normalizeCssPropertyName(property),
        value: value,
      });
    }
    return out;
  }

  function joinInlineStyleDeclarations(declarations) {
    const list = Array.isArray(declarations) ? declarations : [];
    const out = [];
    for (let i = 0; i < list.length; i += 1) {
      const item = list[i];
      if (!item || typeof item !== "object") {
        continue;
      }
      const property = String(item.property || "").trim();
      const value = String(item.value || "").trim();
      if (!property || !value) {
        continue;
      }
      out.push(property + ": " + value);
    }
    return out.join("; ").trim();
  }

  function composeQColorStyleWithExisting(options) {
    const opts = options && typeof options === "object" ? options : {};
    const currentStyle = String(opts.currentStyle || "").trim();
    const baseStyle = String(opts.baseStyle || "").trim();
    const colorDeclarations = Array.isArray(opts.colorDeclarations) ? opts.colorDeclarations : [];
    const previousManaged = Array.isArray(opts.previousManagedProperties) ? opts.previousManagedProperties : [];
    const parsedBase = parseInlineStyleDeclarations(baseStyle);
    const parsedCurrent = parseInlineStyleDeclarations(currentStyle);
    const mergedSourceMap = Object.create(null);
    const mergedSourceOrder = [];
    function mergeSourceDeclarations(list) {
      const entries = Array.isArray(list) ? list : [];
      for (let i = 0; i < entries.length; i += 1) {
        const item = entries[i];
        if (!item || !item.normalizedProperty) {
          continue;
        }
        if (!Object.prototype.hasOwnProperty.call(mergedSourceMap, item.normalizedProperty)) {
          mergedSourceOrder.push(item.normalizedProperty);
        }
        mergedSourceMap[item.normalizedProperty] = item;
      }
    }
    mergeSourceDeclarations(parsedBase);
    mergeSourceDeclarations(parsedCurrent);
    const parsedSource = [];
    for (let i = 0; i < mergedSourceOrder.length; i += 1) {
      const key = mergedSourceOrder[i];
      const item = mergedSourceMap[key];
      if (!item) {
        continue;
      }
      parsedSource.push(item);
    }

    const parsedColor = [];
    const nextManagedSet = new Set();
    for (let i = 0; i < colorDeclarations.length; i += 1) {
      const entry = parseInlineStyleDeclarations(String(colorDeclarations[i] || ""));
      for (let j = 0; j < entry.length; j += 1) {
        const item = entry[j];
        parsedColor.push(item);
        if (item.normalizedProperty) {
          nextManagedSet.add(item.normalizedProperty);
        }
      }
    }

    const removeSet = new Set();
    for (let i = 0; i < previousManaged.length; i += 1) {
      const prop = normalizeCssPropertyName(previousManaged[i]);
      if (prop) {
        removeSet.add(prop);
      }
    }
    nextManagedSet.forEach(function eachManaged(prop) {
      if (prop) {
        removeSet.add(prop);
      }
    });

    const retained = [];
    for (let i = 0; i < parsedSource.length; i += 1) {
      const item = parsedSource[i];
      if (!item || !item.normalizedProperty || removeSet.has(item.normalizedProperty)) {
        continue;
      }
      retained.push(item);
    }

    const merged = retained.concat(parsedColor);
    return {
      style: joinInlineStyleDeclarations(merged),
      managedProperties: Array.from(nextManagedSet),
    };
  }

  function inferQColorCssProperty(areaName) {
    const normalized = normalizeColorLookupKey(areaName);
    if (!normalized) {
      return "";
    }
    if (
      normalized === "background-color" ||
      normalized === "background" ||
      normalized === "bg" ||
      normalized.endsWith("-bg") ||
      normalized.indexOf("background") !== -1
    ) {
      return "background-color";
    }
    if (
      normalized === "foreground-color" ||
      normalized === "foreground" ||
      normalized === "fg" ||
      normalized.endsWith("-fg") ||
      normalized.endsWith("-foreground")
    ) {
      return "color";
    }
    if (normalized === "color" || normalized.endsWith("-color")) {
      return "color";
    }
    if (normalized.indexOf("border") !== -1) {
      return "border-color";
    }
    if (normalized.indexOf("outline") !== -1) {
      return "outline-color";
    }
    if (normalized.indexOf("shadow") !== -1) {
      return "box-shadow";
    }
    if (normalized.indexOf("fill") !== -1) {
      return "fill";
    }
    if (normalized.indexOf("stroke") !== -1) {
      return "stroke";
    }
    if (normalized.indexOf("caret") !== -1) {
      return "caret-color";
    }
    return qColorStylePropertyForKey(areaName);
  }

  function warnQColor(message, detail) {
    if (typeof console === "undefined" || !console || typeof console.warn !== "function") {
      return;
    }
    if (typeof detail === "undefined") {
      console.warn("qhtml q-color warning:", message);
      return;
    }
    console.warn("qhtml q-color warning:", message, detail);
  }

  function warnDeprecatedSyntaxFeature(featureName) {
    const feature = String(featureName || "").trim().toLowerCase();
    if (!feature || DEPRECATED_FEATURE_WARNED.has(feature)) {
      return;
    }
    DEPRECATED_FEATURE_WARNED.add(feature);
    if (typeof console === "undefined" || !console || typeof console.warn !== "function") {
      return;
    }
    console.warn(
      "[qhtml] Deprecated syntax `" +
        feature +
        "` is scheduled for removal in v6.0.8. Use `q-style` / `q-theme` instead."
    );
  }

  function normalizeCssPropertyName(name) {
    const raw = String(name || "").trim();
    if (!raw) {
      return "";
    }
    if (raw.indexOf("--") === 0) {
      return raw;
    }
    if (raw.indexOf("-") >= 0) {
      return raw.toLowerCase();
    }
    return raw.replace(/([A-Z])/g, "-$1").toLowerCase();
  }

  function isLikelyColorValue(value) {
    const text = String(value || "").trim();
    if (!text) {
      return false;
    }
    if (/^#[0-9a-f]{3,8}$/i.test(text)) {
      return true;
    }
    if (/^(rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)\(/i.test(text)) {
      return true;
    }
    if (/gradient\(/i.test(text)) {
      return true;
    }
    if (/^(var|calc|min|max|clamp)\(/i.test(text)) {
      return true;
    }
    if (/^(transparent|currentcolor|inherit|initial|unset|revert|revert-layer|[a-z-]+)$/i.test(text)) {
      return true;
    }
    return false;
  }

  function isLikelyBorderValue(value) {
    const text = String(value || "").trim();
    if (!text) {
      return false;
    }
    if (/^(var|calc|min|max|clamp)\(/i.test(text)) {
      return true;
    }
    if (/^(none|initial|inherit|unset|revert|revert-layer)$/i.test(text)) {
      return true;
    }
    if (/^([0-9.]+(px|em|rem|%)\s+)?(none|solid|dashed|dotted|double|groove|ridge|inset|outset)\s+.+$/i.test(text)) {
      return true;
    }
    return isLikelyColorValue(text);
  }

  function isLikelyBoxShadowValue(value) {
    const text = String(value || "").trim();
    if (!text) {
      return false;
    }
    if (/^(none|inherit|initial|unset|revert|revert-layer)$/i.test(text)) {
      return true;
    }
    if (/^(var|calc|min|max|clamp)\(/i.test(text)) {
      return true;
    }
    if (/(\d+(\.\d+)?(px|em|rem|%))/.test(text) || /^inset\b/i.test(text)) {
      return true;
    }
    return false;
  }

  function isValidQColorPropertyValue(propertyName, value) {
    const property = normalizeCssPropertyName(propertyName);
    const text = String(value || "").trim();
    if (!property || !text) {
      return false;
    }
    if (/[{}]/.test(text)) {
      return false;
    }
    if (property.indexOf("--") === 0) {
      return true;
    }
    if (property === "background" || property === "background-color") {
      return isLikelyColorValue(text);
    }
    if (
      property === "color" ||
      property === "border-color" ||
      property === "outline-color" ||
      property === "caret-color" ||
      property === "fill" ||
      property === "stroke"
    ) {
      return isLikelyColorValue(text);
    }
    if (property === "border") {
      return isLikelyBorderValue(text);
    }
    if (property === "box-shadow") {
      return isLikelyBoxShadowValue(text);
    }
    return true;
  }

  function applyQColorAssignmentsToElementNode(elementNode, colorContext) {
    if (!elementNode || typeof elementNode !== "object") {
      return;
    }
    if (!elementNode.meta || typeof elementNode.meta !== "object") {
      elementNode.meta = {};
    }
    const assignments = Array.isArray(elementNode.meta.qColorAssignments)
      ? elementNode.meta.qColorAssignments
      : [];
    const areaGroups = Array.isArray(elementNode.meta.qColorAreas)
      ? elementNode.meta.qColorAreas
      : [];
    const areaValues = buildQColorAreaValueMapFromList(assignments, colorContext);
    const requestedAreas = expandQColorRequestedAreas(
      areaGroups,
      colorContext,
      areaValues,
      elementNode.meta.qColorAreaProperties
    );
    const propertyOrder = [];
    const declarationMap = Object.create(null);
    const sourceAreaMap = Object.create(null);
    for (let i = 0; i < requestedAreas.length; i += 1) {
      const areaName = requestedAreas[i];
      const explicitProperty = lookupQColorPropertyByArea(colorContext, areaName, {
        areaValues: areaValues,
      });
      if (explicitProperty) {
        if (!elementNode.meta || typeof elementNode.meta !== "object") {
          elementNode.meta = {};
        }
        if (
          !elementNode.meta.qColorAreaProperties ||
          typeof elementNode.meta.qColorAreaProperties !== "object" ||
          Array.isArray(elementNode.meta.qColorAreaProperties)
        ) {
          elementNode.meta.qColorAreaProperties = {};
        }
        elementNode.meta.qColorAreaProperties[areaName] = explicitProperty;
      }
      const value = lookupAreaValueInObject(areaValues, areaName);
      if (!value) {
        continue;
      }
      const cssProperty = explicitProperty || inferQColorCssProperty(areaName);
      if (!cssProperty) {
        continue;
      }
      if (explicitProperty) {
        if (!elementNode.meta || typeof elementNode.meta !== "object") {
          elementNode.meta = {};
        }
        if (
          !elementNode.meta.qColorAreaProperties ||
          typeof elementNode.meta.qColorAreaProperties !== "object" ||
          Array.isArray(elementNode.meta.qColorAreaProperties)
        ) {
          elementNode.meta.qColorAreaProperties = {};
        }
        elementNode.meta.qColorAreaProperties[areaName] = explicitProperty;
      }
      if (!explicitProperty) {
        warnQColor("qhtml q-color fallback-map", {
          area: areaName,
          property: cssProperty,
        });
      }
      if (!isValidQColorPropertyValue(cssProperty, value)) {
        warnQColor("qhtml q-color invalid-value", {
          area: areaName,
          property: cssProperty,
          value: value,
        });
      }
      const normalizedProperty = normalizeCssPropertyName(cssProperty);
      if (normalizedProperty && Object.prototype.hasOwnProperty.call(declarationMap, normalizedProperty)) {
        warnQColor("qhtml q-color override", {
          area: areaName,
          overriddenArea: sourceAreaMap[normalizedProperty] || "",
          property: cssProperty,
        });
      }
      if (normalizedProperty && !Object.prototype.hasOwnProperty.call(declarationMap, normalizedProperty)) {
        propertyOrder.push(normalizedProperty);
      }
      if (normalizedProperty) {
        declarationMap[normalizedProperty] = cssProperty + ": " + value;
        sourceAreaMap[normalizedProperty] = areaName;
      }
    }
    const inlineDeclarations = [];
    for (let i = 0; i < propertyOrder.length; i += 1) {
      const normalizedProperty = propertyOrder[i];
      const declaration = String(declarationMap[normalizedProperty] || "").trim();
      if (!declaration) {
        continue;
      }
      inlineDeclarations.push(declaration);
    }
    const baseStyle = String(elementNode.meta.qColorBaseStyle || "").trim();
    const fallbackDeclarations = requestedAreas.length > 0
      ? inlineDeclarations
      : buildQColorStyleDeclarationsFromList(assignments, colorContext);
    const previousManaged = Array.isArray(elementNode.meta.qColorManagedProperties)
      ? elementNode.meta.qColorManagedProperties.slice()
      : [];
    const currentStyle = String(elementNode.attributes && elementNode.attributes.style || "").trim();
    const styleCompose = composeQColorStyleWithExisting({
      currentStyle: currentStyle,
      baseStyle: baseStyle,
      colorDeclarations: fallbackDeclarations,
      previousManagedProperties: previousManaged,
    });
    const mergedStyle = String(styleCompose.style || "").trim();
    elementNode.meta.qColorManagedProperties = Array.isArray(styleCompose.managedProperties)
      ? styleCompose.managedProperties.slice()
      : [];
    if (!elementNode.attributes || typeof elementNode.attributes !== "object") {
      elementNode.attributes = {};
    }
    if (mergedStyle) {
      elementNode.attributes.style = mergedStyle;
    } else {
      delete elementNode.attributes.style;
    }

    if (Array.isArray(elementNode.children)) {
      const nextChildren = [];
      for (let i = 0; i < elementNode.children.length; i += 1) {
        const child = elementNode.children[i];
        if (
          child &&
          child.kind === core.NODE_TYPES.rawHtml &&
          child.meta &&
          child.meta.qColorGeneratedStyle === true
        ) {
          continue;
        }
        nextChildren.push(child);
      }
      elementNode.children = nextChildren;
    }
  }

  function collectQColorCandidateAreas(colorContext, areaValues, areaPropertyMap) {
    const out = [];
    const seen = new Set();
    function pushArea(name) {
      const areaName = String(name || "").trim();
      const normalized = normalizeColorLookupKey(areaName);
      if (!areaName || !normalized || seen.has(normalized)) {
        return;
      }
      seen.add(normalized);
      out.push(areaName);
    }
    if (colorContext && colorContext.schemas instanceof Map) {
      colorContext.schemas.forEach(function collectSchema(entry, key) {
        if (entry && typeof entry === "object" && String(entry.name || "").trim()) {
          pushArea(entry.name);
          return;
        }
        pushArea(key);
      });
    }
    const valueKeys = Object.keys(areaValues && typeof areaValues === "object" ? areaValues : {});
    for (let i = 0; i < valueKeys.length; i += 1) {
      pushArea(valueKeys[i]);
    }
    const propertyKeys = Object.keys(
      areaPropertyMap && typeof areaPropertyMap === "object" && !Array.isArray(areaPropertyMap)
        ? areaPropertyMap
        : {}
    );
    for (let i = 0; i < propertyKeys.length; i += 1) {
      pushArea(propertyKeys[i]);
    }
    return out;
  }

  function expandQColorRequestedAreas(areaGroups, colorContext, areaValues, areaPropertyMap) {
    const groups = Array.isArray(areaGroups) ? areaGroups : [];
    const requested = [];
    const seen = new Set();
    const candidates = collectQColorCandidateAreas(colorContext, areaValues, areaPropertyMap);
    function pushArea(name) {
      const areaName = String(name || "").trim();
      const normalized = normalizeColorLookupKey(areaName);
      if (!areaName || !normalized || seen.has(normalized)) {
        return;
      }
      seen.add(normalized);
      requested.push(areaName);
    }
    for (let i = 0; i < groups.length; i += 1) {
      const group = Array.isArray(groups[i]) ? groups[i] : [];
      for (let j = 0; j < group.length; j += 1) {
        const areaName = String(group[j] || "").trim();
        if (!areaName) {
          continue;
        }
        if (hasQColorWildcardPattern(areaName)) {
          let matched = false;
          for (let k = 0; k < candidates.length; k += 1) {
            const candidate = candidates[k];
            if (!doesQColorRequestMatchAreaName(areaName, candidate)) {
              continue;
            }
            pushArea(candidate);
            matched = true;
          }
          if (!matched) {
            warnQColor("qhtml q-color wildcard-no-match", { area: areaName });
          }
          continue;
        }
        pushArea(areaName);
      }
    }
    return requested;
  }

  function applyQColorSetupToElementNode(elementNode, setup, colorContext) {
    if (!elementNode || typeof elementNode !== "object") {
      return;
    }
    const config = setup && typeof setup === "object" ? setup : null;
    if (!config) {
      return;
    }
    const assignments = cloneQColorAssignments(config.assignments);
    const areas = cloneQColorAreas(config.areas);
    const hasAssignments = Object.keys(assignments).length > 0;
    const hasAreas = areas.length > 0;
    if (!hasAssignments && !hasAreas) {
      return;
    }
    if (!elementNode.meta || typeof elementNode.meta !== "object") {
      elementNode.meta = {};
    }
    if (!Array.isArray(elementNode.meta.qColorAssignments)) {
      elementNode.meta.qColorAssignments = [];
    }
    if (!Array.isArray(elementNode.meta.qColorAreas)) {
      elementNode.meta.qColorAreas = [];
    }
    if (typeof elementNode.meta.qColorBaseStyle !== "string") {
      elementNode.meta.qColorBaseStyle = String(elementNode.attributes && elementNode.attributes.style || "").trim();
    }
    elementNode.meta.qColorAssignments.push(assignments);
    elementNode.meta.qColorAreas.push(hasAreas ? areas : Object.keys(assignments));
    applyQColorAssignmentsToElementNode(elementNode, colorContext);
  }

  function applyActiveQColorSetupsToElementNode(elementNode, colorContext) {
    if (!colorContext || !Array.isArray(colorContext.activeSetups) || colorContext.activeSetups.length === 0) {
      return;
    }
    for (let i = 0; i < colorContext.activeSetups.length; i += 1) {
      applyQColorSetupToElementNode(elementNode, colorContext.activeSetups[i], colorContext);
    }
  }

  function registerQColorSchemaItem(colorContext, item) {
    if (!item || typeof item !== "object") {
      return;
    }
    const entries = item.entries && typeof item.entries === "object" ? item.entries : {};
    const entryKeys = Object.keys(entries);
    const schemaName = String(item.name || "").trim();
    if (schemaName) {
      const normalizedSchemaName = normalizeColorLookupKey(schemaName);
      if (normalizedSchemaName && colorContext && colorContext.schemaDefs instanceof Map) {
        colorContext.schemaDefs.set(normalizedSchemaName, {
          name: schemaName,
          entries: cloneQColorAssignments(entries),
        });
      }
      return;
    }
    for (let i = 0; i < entryKeys.length; i += 1) {
      const key = String(entryKeys[i] || "").trim();
      if (!key) {
        continue;
      }
      registerQColorSchema(colorContext, key, entries[key]);
    }
  }

  function registerQColorThemeItem(colorContext, item) {
    if (!item || typeof item !== "object") {
      return;
    }
    const themeName = String(item.name || "").trim();
    const normalizedThemeName = normalizeColorLookupKey(themeName);
    if (!themeName) {
      registerQColorTheme(colorContext, DEFAULT_QCOLOR_THEME_NAME, item.assignments, { setAsDefault: true });
      return;
    }
    registerQColorTheme(colorContext, themeName, item.assignments, {
      setAsDefault: normalizedThemeName === DEFAULT_QCOLOR_THEME_NAME,
    });
  }

  function registerQColorDefinitionItem(colorContext, item) {
    if (!item || typeof item !== "object") {
      return;
    }
    const setupName = String(item.name || "").trim();
    if (!setupName) {
      return;
    }
    registerQColorDefinition(colorContext, setupName, {
      assignments: item.assignments,
      areas: item.areas,
    });
  }

  function serializeQColorSchemas(colorContext) {
    const out = {};
    if (!colorContext || !(colorContext.schemas instanceof Map)) {
      return out;
    }
    colorContext.schemas.forEach(function eachSchema(entry) {
      if (!entry || typeof entry !== "object") {
        return;
      }
      const name = String(entry.name || "").trim();
      const value = String(entry.property || "").trim();
      if (!name || !value) {
        return;
      }
      out[name] = value;
    });
    return out;
  }

  function serializeQColorThemes(colorContext) {
    const out = {};
    if (!colorContext || !(colorContext.themes instanceof Map)) {
      return out;
    }
    colorContext.themes.forEach(function eachTheme(entry) {
      if (!entry || typeof entry !== "object") {
        return;
      }
      const name = String(entry.name || "").trim();
      if (!name) {
        return;
      }
      out[name] = cloneQColorAssignments(entry.assignments);
    });
    return out;
  }

  function serializeQColorSchemaDefinitions(colorContext) {
    const out = {};
    if (!colorContext || !(colorContext.schemaDefs instanceof Map)) {
      return out;
    }
    colorContext.schemaDefs.forEach(function eachSchemaDef(entry) {
      if (!entry || typeof entry !== "object") {
        return;
      }
      const name = String(entry.name || "").trim();
      if (!name) {
        return;
      }
      out[name] = cloneQColorAssignments(entry.entries);
    });
    return out;
  }

  function serializeQColorDefinitions(colorContext) {
    const out = {};
    if (!colorContext || !(colorContext.colorDefs instanceof Map)) {
      return out;
    }
    colorContext.colorDefs.forEach(function eachColorDef(entry) {
      if (!entry || typeof entry !== "object") {
        return;
      }
      const name = String(entry.name || "").trim();
      if (!name) {
        return;
      }
      out[name] = {
        assignments: cloneQColorAssignments(entry.assignments),
        areas: cloneQColorAreas(entry.areas),
      };
    });
    return out;
  }

  function parseTagToken(token) {
    const raw = String(token || "").trim();
    if (!raw) {
      return { raw: "", tag: "", id: "", classes: [] };
    }

    const head = raw.split(/\s+/)[0] || "";
    const baseMatch = head.match(/^[^.#\s]+/);
    const tag = String(baseMatch ? baseMatch[0] : "").trim().toLowerCase();

    let id = "";
    const classes = [];
    const seen = new Set();
    const fragmentRe = /([.#])([A-Za-z_*][A-Za-z0-9_*-]*)/g;
    let match;
    while ((match = fragmentRe.exec(head))) {
      const kind = match[1];
      const value = String(match[2] || "").trim();
      if (!value) {
        continue;
      }
      if (kind === "#") {
        if (!id) {
          id = value;
        }
        continue;
      }
      if (!seen.has(value)) {
        seen.add(value);
        classes.push(value);
      }
    }

    if (!tag && classes.length === 0 && !id) {
      return { raw: raw, tag: raw.toLowerCase(), id: "", classes: [] };
    }

    return {
      raw: raw,
      tag: tag,
      id: id,
      classes: classes,
    };
  }

  function detectSelectorMode(selectorTokens) {
    if (!Array.isArray(selectorTokens) || selectorTokens.length <= 1) {
      return "single";
    }

    const last = selectorTokens[selectorTokens.length - 1];
    const hasLastTag = !!(last && last.tag);

    for (let i = 0; i < selectorTokens.length - 1; i += 1) {
      const token = selectorTokens[i];
      if (!token) {
        return "nest";
      }
      if (token.classes.length > 0 || token.id) {
        return "nest";
      }
      if (token.tag && KNOWN_HTML_TAGS.has(token.tag)) {
        return "nest";
      }
    }

    if (hasLastTag && last.tag && KNOWN_HTML_TAGS.has(last.tag)) {
      return "class-shorthand";
    }

    return "nest";
  }

  function createTextContentNode(text, sourceMeta) {
    const value = String(text == null ? "" : text);
    if (!value) {
      return null;
    }
    if (typeof core.createTextNode === "function" && core.NODE_TYPES && core.NODE_TYPES.text) {
      return core.createTextNode({
        value: value,
        meta: Object.assign({ generated: true }, sourceMeta || {}),
      });
    }
    return core.createRawHtmlNode({
      html: escapeHtmlText(value),
      meta: Object.assign({ generated: true }, sourceMeta || {}),
    });
  }

  function appendTextChildNode(elementNode, text, sourceMeta) {
    if (!elementNode || typeof elementNode !== "object") {
      return;
    }
    if (!Array.isArray(elementNode.children)) {
      elementNode.children = [];
    }
    const textNode = createTextContentNode(text, sourceMeta);
    if (textNode) {
      elementNode.children.push(textNode);
    }
  }

  function mergeStyleAttribute(elementNode, cssText) {
    const incoming = String(cssText == null ? "" : cssText).trim();
    if (!incoming) {
      return;
    }
    const existing = String(elementNode.attributes.style || "").trim();
    if (!existing) {
      elementNode.attributes.style = incoming;
      return;
    }
    const needsSemicolon = !existing.endsWith(";");
    elementNode.attributes.style = (existing + (needsSemicolon ? ";" : "") + " " + incoming).trim();
  }

  function compactScriptBody(body) {
    return String(body == null ? "" : body)
      .replace(/\r/g, "\n")
      .replace(/\n+/g, "\n")
      .trim();
  }

  function unescapeSimpleQuotedBody(value) {
    return String(value)
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'")
      .replace(/\\`/g, "`")
      .replace(/\\\\/g, "\\");
  }

  function stripQuotedScriptSegments(value) {
    const input = String(value == null ? "" : value);
    let out = "";
    let quote = "";
    for (let i = 0; i < input.length; i += 1) {
      const ch = input[i];
      if (quote) {
        if (ch === "\\") {
          i += 1;
          continue;
        }
        if (ch === quote) {
          quote = "";
          out += " ";
        }
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") {
        quote = ch;
        out += " ";
        continue;
      }
      out += ch;
    }
    if (quote) {
      return "";
    }
    return out;
  }

  function tryResolveStaticQScript(scriptBody) {
    const body = String(scriptBody || "").trim();
    const match = body.match(/^return\s+([\s\S]+?);?\s*$/);
    if (!match) {
      return null;
    }

    const expr = String(match[1] || "").trim();
    if (!expr) {
      return null;
    }

    if ((expr.startsWith('"') && expr.endsWith('"')) || (expr.startsWith("'") && expr.endsWith("'")) || (expr.startsWith("`") && expr.endsWith("`"))) {
      return unescapeSimpleQuotedBody(expr.slice(1, -1));
    }

    if (/^-?\d+(\.\d+)?$/.test(expr)) {
      return expr;
    }

    if (expr === "true" || expr === "false" || expr === "null") {
      return expr;
    }

    const stripped = stripQuotedScriptSegments(expr);
    if (!stripped) {
      return null;
    }
    if (/[A-Za-z_$]/.test(stripped)) {
      return null;
    }
    if (/[^0-9+\-*/%().,:?<>=!&|[\]\s]/.test(stripped)) {
      return null;
    }
    try {
      const evaluated = new Function('"use strict"; return (' + expr + ");")();
      if (evaluated === null || typeof evaluated === "undefined") {
        return "";
      }
      if (
        typeof evaluated === "string" ||
        typeof evaluated === "number" ||
        typeof evaluated === "boolean" ||
        typeof evaluated === "bigint"
      ) {
        return String(evaluated);
      }
    } catch (error) {
      return null;
    }

    return null;
  }

  function tryResolveStaticQScriptValue(scriptBody) {
    const body = String(scriptBody || "").trim();
    const match = body.match(/^return\s+([\s\S]+?);?\s*$/);
    if (match) {
      const expr = String(match[1] || "").trim();
      if (expr) {
        try {
          const evaluated = new Function('"use strict"; return (' + expr + ");")();
          if (typeof evaluated !== "undefined") {
            return deepClonePlainValue(evaluated);
          }
        } catch (error) {
          // fallback below
        }
      }
    }
    try {
      const evaluated = new Function('"use strict";\n' + body + "\n")();
      if (typeof evaluated === "undefined") {
        return null;
      }
      return deepClonePlainValue(evaluated);
    } catch (error) {
      return null;
    }
  }

  function isQScriptIdentifierChar(ch) {
    return !!ch && /[A-Za-z0-9_-]/.test(ch);
  }

  function isQRewriteIdentifierStart(ch) {
    return !!ch && /[A-Za-z_]/.test(ch);
  }

  function isQRewriteIdentifierChar(ch) {
    return !!ch && /[A-Za-z0-9_-]/.test(ch);
  }

  function collectKeywordAliasesFromSource(source) {
    const input = String(source || "");
    const aliases = new Map();
    let pos = 0;
    while (pos < input.length) {
      const token = findNextIdentifierTokenSkippingLiterals(input, pos);
      if (!token) {
        break;
      }
      pos = token.end;
      if (String(token.name || "").toLowerCase() !== "q-keyword") {
        continue;
      }
      const nested = parserFor(input);
      nested.index = token.end;
      try {
        parseKeywordAliasDeclaration(nested, aliases, token.start);
        pos = nested.index;
      } catch (error) {
        continue;
      }
    }
    return aliases;
  }

  function collectAliasesTargeting(keywordAliases, targetKeyword) {
    const target = String(targetKeyword || "").trim().toLowerCase();
    const out = new Set([target]);
    if (!(keywordAliases instanceof Map)) {
      return out;
    }
    keywordAliases.forEach(function eachAlias(spec) {
      const aliasName = String(spec && spec.nameLower ? spec.nameLower : "").trim().toLowerCase();
      const mapped = String(spec && spec.replacementFirstLower ? spec.replacementFirstLower : "").trim().toLowerCase();
      if (!aliasName || !mapped) {
        return;
      }
      if (mapped === target) {
        out.add(aliasName);
      }
    });
    return out;
  }

  function findNextKeywordTokenSkippingLiterals(source, fromIndex, keywords) {
    const wanted = keywords instanceof Set ? keywords : new Set();
    const input = String(source || "");
    let pos = Math.max(0, Number(fromIndex) || 0);
    while (pos < input.length) {
      const token = findNextIdentifierTokenSkippingLiterals(input, pos);
      if (!token) {
        return null;
      }
      pos = token.end;
      const lower = String(token.name || "").trim().toLowerCase();
      if (wanted.has(lower)) {
        return {
          start: token.start,
          end: token.end,
          name: token.name,
          nameLower: lower,
        };
      }
    }
    return null;
  }

  function findMatchingBraceWithLiterals(source, openIndex) {
    const input = String(source || "");
    let depth = 0;
    let inSingle = false;
    let inDouble = false;
    let inBacktick = false;
    let inLineComment = false;
    let inBlockComment = false;
    let escaped = false;

    for (let i = openIndex; i < input.length; i += 1) {
      const ch = input[i];
      const next = input[i + 1];

      if (inLineComment) {
        if (ch === "\n" || ch === "\r") {
          inLineComment = false;
        }
        continue;
      }

      if (inBlockComment) {
        if (ch === "*" && next === "/") {
          inBlockComment = false;
          i += 1;
        }
        continue;
      }

      if (inSingle) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === "\\") {
          escaped = true;
          continue;
        }
        if (ch === "'") {
          inSingle = false;
        }
        continue;
      }

      if (inDouble) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === "\\") {
          escaped = true;
          continue;
        }
        if (ch === '"') {
          inDouble = false;
        }
        continue;
      }

      if (inBacktick) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === "\\") {
          escaped = true;
          continue;
        }
        if (ch === "`") {
          inBacktick = false;
        }
        continue;
      }

      if (ch === "/" && next === "/") {
        inLineComment = true;
        i += 1;
        continue;
      }
      if (ch === "/" && next === "*") {
        inBlockComment = true;
        i += 1;
        continue;
      }
      if (ch === "'") {
        inSingle = true;
        continue;
      }
      if (ch === '"') {
        inDouble = true;
        continue;
      }
      if (ch === "`") {
        inBacktick = true;
        continue;
      }
      if (ch === "\\") {
        if (next === "{" || next === "}" || next === "\\") {
          i += 1;
        }
        continue;
      }

      if (ch === "{") {
        depth += 1;
        continue;
      }
      if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          return i;
        }
        if (depth < 0) {
          return -1;
        }
      }
    }

    return -1;
  }

  function findNextIdentifierTokenSkippingLiterals(source, fromIndex) {
    const input = String(source || "");
    let i = Math.max(0, Number(fromIndex) || 0);
    let inSingle = false;
    let inDouble = false;
    let inBacktick = false;
    let inLineComment = false;
    let inBlockComment = false;
    let escaped = false;

    while (i < input.length) {
      const ch = input[i];
      const next = input[i + 1];

      if (inLineComment) {
        if (ch === "\n" || ch === "\r") {
          inLineComment = false;
        }
        i += 1;
        continue;
      }

      if (inBlockComment) {
        if (ch === "*" && next === "/") {
          inBlockComment = false;
          i += 2;
          continue;
        }
        i += 1;
        continue;
      }

      if (inSingle) {
        if (escaped) {
          escaped = false;
          i += 1;
          continue;
        }
        if (ch === "\\") {
          escaped = true;
          i += 1;
          continue;
        }
        if (ch === "'") {
          inSingle = false;
        }
        i += 1;
        continue;
      }

      if (inDouble) {
        if (escaped) {
          escaped = false;
          i += 1;
          continue;
        }
        if (ch === "\\") {
          escaped = true;
          i += 1;
          continue;
        }
        if (ch === '"') {
          inDouble = false;
        }
        i += 1;
        continue;
      }

      if (inBacktick) {
        if (escaped) {
          escaped = false;
          i += 1;
          continue;
        }
        if (ch === "\\") {
          escaped = true;
          i += 1;
          continue;
        }
        if (ch === "`") {
          inBacktick = false;
        }
        i += 1;
        continue;
      }

      if (ch === "/" && next === "/") {
        inLineComment = true;
        i += 2;
        continue;
      }
      if (ch === "/" && next === "*") {
        inBlockComment = true;
        i += 2;
        continue;
      }
      if (ch === "'") {
        inSingle = true;
        i += 1;
        continue;
      }
      if (ch === '"') {
        inDouble = true;
        i += 1;
        continue;
      }
      if (ch === "`") {
        inBacktick = true;
        i += 1;
        continue;
      }

      if (isQRewriteIdentifierStart(ch)) {
        const start = i;
        i += 1;
        while (i < input.length && isQRewriteIdentifierChar(input[i])) {
          i += 1;
        }
        return {
          start: start,
          end: i,
          name: input.slice(start, i),
        };
      }

      i += 1;
    }

    return null;
  }

  function skipWhitespaceInSource(source, fromIndex) {
    const input = String(source || "");
    let i = Math.max(0, Number(fromIndex) || 0);
    while (i < input.length) {
      if (/\s/.test(input[i])) {
        i += 1;
        continue;
      }
      if (input[i] === "/" && input[i + 1] === "/") {
        i += 2;
        while (i < input.length && input[i] !== "\n" && input[i] !== "\r") {
          i += 1;
        }
        continue;
      }
      if (input[i] === "/" && input[i + 1] === "*") {
        i += 2;
        while (i < input.length && !(input[i] === "*" && input[i + 1] === "/")) {
          i += 1;
        }
        i = i < input.length ? i + 2 : input.length;
        continue;
      }
      break;
    }
    return i;
  }

  function parseTopLevelNamedBlocks(source) {
    const input = String(source || "");
    const blocks = [];
    let pos = 0;

    while (pos < input.length) {
      while (pos < input.length) {
        pos = skipWhitespaceInSource(input, pos);
        if (input[pos] !== ";") {
          break;
        }
        pos += 1;
      }
      if (pos >= input.length) {
        break;
      }

      if (!isQRewriteIdentifierStart(input[pos])) {
        pos += 1;
        continue;
      }

      const start = pos;
      pos += 1;
      while (pos < input.length && isQRewriteIdentifierChar(input[pos])) {
        pos += 1;
      }
      const name = input.slice(start, pos);
      const open = skipWhitespaceInSource(input, pos);
      if (input[open] !== "{") {
        pos = open + 1;
        continue;
      }

      const close = findMatchingBraceWithLiterals(input, open);
      if (close === -1) {
        throw new Error("Unterminated block '" + name + "' in q-rewrite body.");
      }

      blocks.push({
        name: name,
        nameLower: String(name).toLowerCase(),
        start: start,
        open: open,
        close: close,
        end: close + 1,
        body: input.slice(open + 1, close),
      });
      pos = close + 1;
    }

    return blocks;
  }

  function removeRangesFromSource(source, ranges) {
    const input = String(source || "");
    const list = Array.isArray(ranges) ? ranges.slice() : [];
    if (list.length === 0) {
      return input;
    }
    list.sort(function byStart(a, b) {
      return a.start - b.start;
    });
    let out = "";
    let cursor = 0;
    for (let i = 0; i < list.length; i += 1) {
      const range = list[i];
      const start = Math.max(0, Number(range.start) || 0);
      const end = Math.max(start, Number(range.end) || start);
      if (start > cursor) {
        out += input.slice(cursor, start);
      }
      cursor = Math.max(cursor, end);
    }
    if (cursor < input.length) {
      out += input.slice(cursor);
    }
    return out;
  }

  function normalizeQRewriteSlotName(name) {
    const value = String(name || "").trim().toLowerCase();
    return value || "default";
  }

  function normalizeScopedReferenceKey(name) {
    const value = String(name || "").trim();
    if (!value) {
      return "";
    }
    return value.toLowerCase();
  }

  const SCOPED_REFERENCE_ESCAPE_TOKEN = "__QHTML_ESCAPED_SCOPED_REF__";

  function resolveScopedReferenceExpression(expressionText, references) {
    const refs = references && typeof references === "object" ? references : null;
    if (!refs) {
      return null;
    }
    const expression = String(expressionText || "").trim();
    if (!expression) {
      return null;
    }

    const directKey = normalizeScopedReferenceKey(expression);
    if (directKey && Object.prototype.hasOwnProperty.call(refs, directKey)) {
      return refs[directKey];
    }

    const slotCallMatch = expression.match(/^this\.slot\s*\(\s*(["']?)([A-Za-z_][A-Za-z0-9_-]*)\1\s*\)$/i);
    if (slotCallMatch) {
      const slotKey = normalizeScopedReferenceKey(slotCallMatch[2] || "");
      if (slotKey && Object.prototype.hasOwnProperty.call(refs, slotKey)) {
        return refs[slotKey];
      }
    }

    return null;
  }

  function replaceScopedReferencesInText(source, references) {
    const text = String(source || "");
    const refs = references && typeof references === "object" ? references : null;
    if (!refs || !hasPotentialReferenceExpression(text)) {
      return text;
    }
    const escaped = text.replace(/\\\$\{/g, SCOPED_REFERENCE_ESCAPE_TOKEN);
    const replaced = escaped.replace(/\$\{\s*([^}]+?)\s*\}/g, function replaceReference(matchText, keyText) {
      const expression = String(keyText || "").trim();
      if (!expression) {
        return matchText;
      }
      const referenceValue = resolveScopedReferenceExpression(expression, refs);
      if (referenceValue !== null) {
        return referenceValue == null ? "" : String(referenceValue);
      }
      return matchText;
    });
    return replaced.split(SCOPED_REFERENCE_ESCAPE_TOKEN).join("${");
  }

  function hasPotentialReferenceExpression(source) {
    return typeof source === "string" && source.indexOf("${") !== -1;
  }

  function extractQRewriteSlotPlaceholders(source) {
    const text = String(source || "");
    const slots = new Set();
    const re = /\bslot\s*\{\s*([A-Za-z_][A-Za-z0-9_-]*)\s*\}/gi;
    let match;
    while ((match = re.exec(text))) {
      const slotName = normalizeQRewriteSlotName(match[1] || "");
      if (slotName) {
        slots.add(slotName);
      }
    }
    return Array.from(slots);
  }

  function createQRewriteDefinition(name, body) {
    const definitionName = String(name || "").trim();
    const rawBody = String(body || "");
    const blocks = parseTopLevelNamedBlocks(rawBody);
    const declaredSlots = new Set();
    const removeRanges = [];
    let returnBody = null;

    for (let i = 0; i < blocks.length; i += 1) {
      const block = blocks[i];
      if (!block || typeof block !== "object") {
        continue;
      }
      if (block.nameLower === "slot") {
        const slotName = normalizeQRewriteSlotName(block.body || "");
        if (slotName) {
          declaredSlots.add(slotName);
        }
        removeRanges.push({ start: block.start, end: block.end });
        continue;
      }
      if (block.nameLower === "return") {
        returnBody = block.body;
        removeRanges.push({ start: block.start, end: block.end });
      }
    }

    const templateBody = removeRangesFromSource(rawBody, removeRanges).trim();
    if (declaredSlots.size === 0) {
      const inferred = extractQRewriteSlotPlaceholders(templateBody);
      for (let i = 0; i < inferred.length; i += 1) {
        declaredSlots.add(inferred[i]);
      }
    }

    return {
      name: definitionName,
      nameLower: definitionName.toLowerCase(),
      slots: Array.from(declaredSlots),
      templateBody: templateBody,
      returnBody: typeof returnBody === "string" ? returnBody : "",
    };
  }

  function findNextQRewriteDefinition(source, fromIndex, rewriteKeywords) {
    const input = String(source || "");
    let pos = Math.max(0, Number(fromIndex) || 0);
    const keywordSet =
      rewriteKeywords instanceof Set && rewriteKeywords.size > 0 ? rewriteKeywords : new Set(["q-rewrite"]);

    while (pos < input.length) {
      const token = findNextKeywordTokenSkippingLiterals(input, pos, keywordSet);
      if (!token) {
        return null;
      }
      pos = token.end;

      let nameStart = skipWhitespaceInSource(input, token.end);
      if (!isQRewriteIdentifierStart(input[nameStart])) {
        // q-rewrite can appear as plain text or inside other blocks (for example q-keyword replacement bodies).
        // Only treat it as a definition when a valid identifier follows.
        continue;
      }
      let nameEnd = nameStart + 1;
      while (nameEnd < input.length && isQRewriteIdentifierChar(input[nameEnd])) {
        nameEnd += 1;
      }
      const name = input.slice(nameStart, nameEnd);

      const open = skipWhitespaceInSource(input, nameEnd);
      if (input[open] !== "{") {
        // Not a definition candidate; keep scanning.
        continue;
      }

      const close = findMatchingBraceWithLiterals(input, open);
      if (close === -1) {
        throw new Error("Unterminated q-rewrite block for '" + name + "'.");
      }

      return {
        start: token.start,
        end: close + 1,
        name: name,
        nameLower: String(name || "").toLowerCase(),
        body: input.slice(open + 1, close),
      };
    }

    return null;
  }

  function resolveQRewriteInvocationSlots(definition, invocationBody) {
    const def = definition || {};
    const rawBody = String(invocationBody || "");
    const slots = Array.isArray(def.slots) ? def.slots.map(normalizeQRewriteSlotName).filter(Boolean) : [];
    const known = new Set(slots);
    const values = Object.create(null);
    const blocks = parseTopLevelNamedBlocks(rawBody);
    const consumeRanges = [];

    for (let i = 0; i < blocks.length; i += 1) {
      const block = blocks[i];
      if (!block || typeof block !== "object") {
        continue;
      }
      const blockName = normalizeQRewriteSlotName(block.name);
      if (!known.has(blockName)) {
        continue;
      }
      values[blockName] = String(block.body || "");
      consumeRanges.push({ start: block.start, end: block.end });
    }

    const remaining = removeRangesFromSource(rawBody, consumeRanges).trim();
    if (slots.length === 1 && !Object.prototype.hasOwnProperty.call(values, slots[0])) {
      values[slots[0]] = remaining;
    } else if (remaining) {
      values.default = remaining;
    } else if (!Object.prototype.hasOwnProperty.call(values, "default")) {
      values.default = "";
    }

    for (let i = 0; i < slots.length; i += 1) {
      const key = slots[i];
      if (!Object.prototype.hasOwnProperty.call(values, key)) {
        values[key] = "";
      }
    }

    return values;
  }

  function applyQRewriteSlotsToTemplate(templateBody, slotValues) {
    const template = String(templateBody || "");
    const values = slotValues || {};
    return template.replace(/\bslot\s*\{\s*([A-Za-z_][A-Za-z0-9_-]*)\s*\}/gi, function replaceSlot(fullMatch, slotName) {
      const key = normalizeQRewriteSlotName(slotName || "");
      if (Object.prototype.hasOwnProperty.call(values, key)) {
        return String(values[key] || "");
      }
      if (Object.prototype.hasOwnProperty.call(values, "default")) {
        return String(values.default || "");
      }
      return fullMatch;
    });
  }

  function createQRewriteExecutionContext(slotValues) {
    const values = slotValues || {};
    function readSlot(name) {
      const key = normalizeQRewriteSlotName(name);
      if (Object.prototype.hasOwnProperty.call(values, key)) {
        return String(values[key] || "");
      }
      if (Object.prototype.hasOwnProperty.call(values, "default")) {
        return String(values.default || "");
      }
      return "";
    }
    const qdomFacade = {
      slot: function slot(name) {
        return readSlot(name);
      },
    };
    return {
      slot: function slot(name) {
        return readSlot(name);
      },
      qdom: function qdom() {
        return qdomFacade;
      },
    };
  }

  function executeQRewriteDefinition(definition, invocationBody, options) {
    const opts = options || {};
    const slots = Array.isArray(definition && definition.slots)
      ? definition.slots.map(normalizeQRewriteSlotName).filter(Boolean)
      : [];
    const slotValues = resolveQRewriteInvocationSlots(definition, invocationBody);
    const scopedReferences = createScopedReferenceMap(slotValues, null);
    const hasReturnBody = typeof definition.returnBody === "string" && definition.returnBody.trim().length > 0;

    if (hasReturnBody) {
      const thisArg = createQRewriteExecutionContext(slotValues);
      const rewritten = evaluateQScriptBlocks(definition.returnBody, {
        maxPasses: opts.maxQScriptPasses,
        keywordAliases: opts.keywordAliases,
        executor: function runQRewriteQScript(body) {
          return executeQScriptReplacement(body, thisArg);
        },
      });
      return replaceScopedReferencesInText(rewritten, scopedReferences);
    }

    const template = String(definition.templateBody || "");
    if (!template) {
      return slots.length === 1 ? String(slotValues[slots[0]] || "") : String(invocationBody || "");
    }
    const replaced = applyQRewriteSlotsToTemplate(template, slotValues);
    return replaceScopedReferencesInText(replaced, scopedReferences);
  }

  function findNextQRewriteInvocation(source, definitions, fromIndex) {
    const input = String(source || "");
    const defs = definitions || {};
    let pos = Math.max(0, Number(fromIndex) || 0);

    function hasValidInvocationLeftBoundary(tokenStart) {
      const index = Number(tokenStart);
      if (!Number.isFinite(index) || index <= 0) {
        return true;
      }
      const prev = input[index - 1];
      if (!prev) {
        return true;
      }
      if (/\s/.test(prev)) {
        return true;
      }
      return prev === "{" || prev === "}" || prev === ";" || prev === "," || prev === "(";
    }

    while (pos < input.length) {
      const token = findNextIdentifierTokenSkippingLiterals(input, pos);
      if (!token) {
        return null;
      }
      pos = token.end;
      if (!hasValidInvocationLeftBoundary(token.start)) {
        continue;
      }
      const nameLower = String(token.name || "").toLowerCase();
      if (!Object.prototype.hasOwnProperty.call(defs, nameLower)) {
        continue;
      }

      const open = skipWhitespaceInSource(input, token.end);
      if (input[open] !== "{") {
        continue;
      }
      const close = findMatchingBraceWithLiterals(input, open);
      if (close === -1) {
        throw new Error("Unterminated q-rewrite invocation block for '" + token.name + "'.");
      }
      return {
        start: token.start,
        end: close + 1,
        open: open,
        close: close,
        name: token.name,
        nameLower: nameLower,
      };
    }

    return null;
  }

  function collectQRewriteDefinitions(source, rewriteKeywords) {
    let working = String(source || "");
    const definitions = Object.create(null);
    let pos = 0;

    while (true) {
      const found = findNextQRewriteDefinition(working, pos, rewriteKeywords);
      if (!found) {
        break;
      }
      definitions[found.nameLower] = createQRewriteDefinition(found.name, found.body);
      working = working.slice(0, found.start) + working.slice(found.end);
      pos = found.start;
    }

    return {
      source: working,
      definitions: definitions,
    };
  }

  function applyQRewriteBlocks(source, options) {
    const opts = options || {};
    const maxPasses = Number(opts.maxPasses) > 0 ? Number(opts.maxPasses) : 200;
    const sourceAliases = opts.keywordAliases instanceof Map ? opts.keywordAliases : collectKeywordAliasesFromSource(source);
    const rewriteKeywords = collectAliasesTargeting(sourceAliases, "q-rewrite");
    const collected = collectQRewriteDefinitions(source, rewriteKeywords);
    const definitions = collected.definitions;
    let out = collected.source;

    if (!definitions || Object.keys(definitions).length === 0) {
      return {
        source: out,
        definitions: [],
      };
    }

    let pass = 0;
    while (pass < maxPasses) {
      let changed = false;
      let pos = 0;

      while (true) {
        const invocation = findNextQRewriteInvocation(out, definitions, pos);
        if (!invocation) {
          break;
        }
        const definition = definitions[invocation.nameLower];
        if (!definition) {
          pos = invocation.end;
          continue;
        }

        const body = out.slice(invocation.open + 1, invocation.close);
        const replacement = executeQRewriteDefinition(definition, body, {
          maxQScriptPasses: opts.maxQScriptPasses,
          keywordAliases: sourceAliases,
        });

        out = out.slice(0, invocation.start) + replacement + out.slice(invocation.end);
        pos = invocation.start + replacement.length;
        changed = true;
      }

      if (!changed) {
        return {
          source: out,
          definitions: Object.keys(definitions),
        };
      }
      pass += 1;
    }

    throw new Error("q-rewrite expansion exceeded max pass limit (" + maxPasses + ").");
  }

  function extractScopedReferencePlaceholders(source) {
    const text = String(source || "");
    const names = new Set();
    const re = /\$\{\s*([^}]+?)\s*\}/g;
    let match;
    while ((match = re.exec(text))) {
      const key = normalizeScopedReferenceKey(match[1] || "");
      if (!key) {
        continue;
      }
      if (!/^[a-z_][a-z0-9_.-]*$/.test(key)) {
        continue;
      }
      names.add(key);
    }
    return Array.from(names);
  }

  function createQMacroDefinition(name, body) {
    const definitionName = String(name || "").trim();
    const rawBody = String(body || "");
    const blocks = parseTopLevelNamedBlocks(rawBody);
    const declaredSlots = new Set();
    const removeRanges = [];
    let returnBody = null;

    for (let i = 0; i < blocks.length; i += 1) {
      const block = blocks[i];
      if (!block || typeof block !== "object") {
        continue;
      }
      if (block.nameLower === "slot") {
        const slotName = normalizeQRewriteSlotName(block.body || "");
        if (slotName) {
          declaredSlots.add(slotName);
        }
        removeRanges.push({ start: block.start, end: block.end });
        continue;
      }
      if (block.nameLower === "return") {
        returnBody = String(block.body || "");
        removeRanges.push({ start: block.start, end: block.end });
      }
    }

    const templateBody = removeRangesFromSource(rawBody, removeRanges).trim();
    if (declaredSlots.size === 0) {
      const inferred = extractScopedReferencePlaceholders((returnBody || "") + "\n" + templateBody);
      for (let i = 0; i < inferred.length; i += 1) {
        declaredSlots.add(inferred[i]);
      }
    }

    return {
      name: definitionName,
      nameLower: definitionName.toLowerCase(),
      slots: Array.from(declaredSlots),
      templateBody: templateBody,
      returnBody: typeof returnBody === "string" ? returnBody : "",
    };
  }

  function findNextQMacroDefinition(source, fromIndex, macroKeywords) {
    const input = String(source || "");
    let pos = Math.max(0, Number(fromIndex) || 0);
    const keywordSet =
      macroKeywords instanceof Set && macroKeywords.size > 0 ? macroKeywords : new Set(["q-macro"]);

    while (pos < input.length) {
      const token = findNextKeywordTokenSkippingLiterals(input, pos, keywordSet);
      if (!token) {
        return null;
      }
      pos = token.end;

      const nameStart = skipWhitespaceInSource(input, token.end);
      if (!isQRewriteIdentifierStart(input[nameStart])) {
        continue;
      }
      let nameEnd = nameStart + 1;
      while (nameEnd < input.length && isQRewriteIdentifierChar(input[nameEnd])) {
        nameEnd += 1;
      }
      const name = input.slice(nameStart, nameEnd);
      const open = skipWhitespaceInSource(input, nameEnd);
      if (input[open] !== "{") {
        continue;
      }
      const close = findMatchingBraceWithLiterals(input, open);
      if (close === -1) {
        throw new Error("Unterminated q-macro block for '" + name + "'.");
      }
      return {
        start: token.start,
        end: close + 1,
        name: name,
        nameLower: String(name || "").toLowerCase(),
        body: input.slice(open + 1, close),
      };
    }
    return null;
  }

  function collectQMacroDefinitions(source, macroKeywords) {
    let working = String(source || "");
    const definitions = Object.create(null);
    let pos = 0;
    while (true) {
      const found = findNextQMacroDefinition(working, pos, macroKeywords);
      if (!found) {
        break;
      }
      definitions[found.nameLower] = createQMacroDefinition(found.name, found.body);
      working = working.slice(0, found.start) + working.slice(found.end);
      pos = found.start;
    }
    return {
      source: working,
      definitions: definitions,
    };
  }

  function findNextQMacroInvocation(source, definitions, fromIndex) {
    const input = String(source || "");
    const defs = definitions || {};
    let pos = Math.max(0, Number(fromIndex) || 0);

    function hasValidInvocationLeftBoundary(tokenStart) {
      const index = Number(tokenStart);
      if (!Number.isFinite(index) || index <= 0) {
        return true;
      }
      const prev = input[index - 1];
      if (!prev) {
        return true;
      }
      if (/\s/.test(prev)) {
        return true;
      }
      return prev === "{" || prev === "}" || prev === ";" || prev === "," || prev === "(";
    }

    while (pos < input.length) {
      const token = findNextIdentifierTokenSkippingLiterals(input, pos);
      if (!token) {
        return null;
      }
      pos = token.end;
      if (!hasValidInvocationLeftBoundary(token.start)) {
        continue;
      }
      const nameLower = String(token.name || "").toLowerCase();
      if (!Object.prototype.hasOwnProperty.call(defs, nameLower)) {
        continue;
      }
      const open = skipWhitespaceInSource(input, token.end);
      if (input[open] !== "{") {
        continue;
      }
      const close = findMatchingBraceWithLiterals(input, open);
      if (close === -1) {
        throw new Error("Unterminated q-macro invocation block for '" + token.name + "'.");
      }
      return {
        start: token.start,
        end: close + 1,
        open: open,
        close: close,
        name: token.name,
        nameLower: nameLower,
      };
    }
    return null;
  }

  function createScopedReferenceMap(slotValues, inheritedReferences) {
    const out = Object.create(null);
    const inherited = inheritedReferences && typeof inheritedReferences === "object" ? inheritedReferences : null;
    if (inherited) {
      const inheritedKeys = Object.keys(inherited);
      for (let i = 0; i < inheritedKeys.length; i += 1) {
        const key = normalizeScopedReferenceKey(inheritedKeys[i]);
        if (!key) {
          continue;
        }
        out[key] = String(inherited[inheritedKeys[i]] == null ? "" : inherited[inheritedKeys[i]]).trim();
      }
    }
    const values = slotValues && typeof slotValues === "object" ? slotValues : null;
    if (values) {
      const slotKeys = Object.keys(values);
      for (let i = 0; i < slotKeys.length; i += 1) {
        const key = normalizeScopedReferenceKey(slotKeys[i]);
        if (!key) {
          continue;
        }
        out[key] = String(values[slotKeys[i]] || "").trim();
      }
    }
    return out;
  }

  function executeQMacroDefinition(definition, invocationBody, options) {
    const opts = options || {};
    const slots = Array.isArray(definition && definition.slots)
      ? definition.slots.map(normalizeQRewriteSlotName).filter(Boolean)
      : [];
    const slotValues = resolveQRewriteInvocationSlots(definition, invocationBody);
    const scopeReferences = createScopedReferenceMap(slotValues, opts.references);
    const hasReturnBody = typeof definition.returnBody === "string" && definition.returnBody.trim().length > 0;
    const template = hasReturnBody ? String(definition.returnBody || "") : String(definition.templateBody || "");

    if (!template) {
      const fallback = slots.length === 1 ? String(slotValues[slots[0]] || "") : String(invocationBody || "");
      return replaceScopedReferencesInText(fallback, scopeReferences);
    }

    const slotted = applyQRewriteSlotsToTemplate(template, slotValues);
    return replaceScopedReferencesInText(slotted, scopeReferences);
  }

  function applyQMacroBlocks(source, options) {
    const opts = options || {};
    const maxPasses = Number(opts.maxPasses) > 0 ? Number(opts.maxPasses) : 200;
    const sourceAliases = opts.keywordAliases instanceof Map ? opts.keywordAliases : collectKeywordAliasesFromSource(source);
    const macroKeywords = collectAliasesTargeting(sourceAliases, "q-macro");
    const collected = collectQMacroDefinitions(source, macroKeywords);
    const definitions = collected.definitions;
    let out = collected.source;

    if (!definitions || Object.keys(definitions).length === 0) {
      return {
        source: out,
        definitions: [],
      };
    }

    let pass = 0;
    while (pass < maxPasses) {
      let changed = false;
      let pos = 0;

      while (true) {
        const invocation = findNextQMacroInvocation(out, definitions, pos);
        if (!invocation) {
          break;
        }
        const definition = definitions[invocation.nameLower];
        if (!definition) {
          pos = invocation.end;
          continue;
        }
        const body = out.slice(invocation.open + 1, invocation.close);
        const replacement = executeQMacroDefinition(definition, body, {
          references: opts.references,
        });
        out = out.slice(0, invocation.start) + replacement + out.slice(invocation.end);
        pos = invocation.start + replacement.length;
        changed = true;
      }

      if (!changed) {
        return {
          source: out,
          definitions: Object.keys(definitions),
        };
      }
      pass += 1;
    }

    throw new Error("q-macro expansion exceeded max pass limit (" + maxPasses + ").");
  }

  function executeQScriptReplacement(scriptBody, thisArg) {
    const context = (thisArg && (typeof thisArg === "object" || typeof thisArg === "function")) ? thisArg : {};
    const scopedSelector = function parserScopedSelector(selector) {
      const query = String(selector == null ? "" : selector).trim();
      if (!query) {
        return null;
      }
      let root = null;
      if (context && typeof context.qhtmlRoot === "function") {
        try {
          root = context.qhtmlRoot();
        } catch (ignoredQHtmlRootError) {
          root = null;
        }
      }
      if (!root && context && context.nodeType === 1 && typeof context.closest === "function") {
        try {
          root = context.closest("q-html");
        } catch (ignoredClosestError) {
          root = null;
        }
      }
      if (!root && context && context.nodeType === 1 && String(context.tagName || "").toLowerCase() === "q-html") {
        root = context;
      }
      if (!root || typeof root.querySelector !== "function") {
        return null;
      }
      try {
        return root.querySelector(query);
      } catch (ignoredQueryError) {
        return null;
      }
    };
    try {
      Object.defineProperty(context, "__qhtmlScopedSelector", {
        configurable: true,
        enumerable: false,
        writable: true,
        value: scopedSelector,
      });
    } catch (error) {
      context.__qhtmlScopedSelector = scopedSelector;
    }
    const source =
      "const $ = (this && typeof this.__qhtmlScopedSelector === \"function\")" +
      " ? this.__qhtmlScopedSelector : function(){ return null; };\n" +
      String(scriptBody || "");
    const fn = new Function(source);
    const out = fn.call(context);
    if (out == null) {
      return "";
    }
    return String(out);
  }

  function isAssignmentQScriptContext(source, qScriptStart) {
    const input = String(source || "");
    let cursor = Number(qScriptStart) - 1;
    while (cursor >= 0 && /\s/.test(input[cursor])) {
      cursor -= 1;
    }
    if (cursor < 0) {
      return false;
    }
    return input[cursor] === ":";
  }

  function isModelQScriptContext(source, qScriptStart) {
    const input = String(source || "");
    let cursor = Number(qScriptStart) - 1;
    while (cursor >= 0 && /\s/.test(input[cursor])) {
      cursor -= 1;
    }
    if (cursor < 0 || input[cursor] !== "{") {
      return false;
    }
    cursor -= 1;
    while (cursor >= 0 && /\s/.test(input[cursor])) {
      cursor -= 1;
    }
    if (cursor < 0) {
      return false;
    }
    const end = cursor + 1;
    while (cursor >= 0 && /[A-Za-z0-9_-]/.test(input[cursor])) {
      cursor -= 1;
    }
    const token = input.slice(cursor + 1, end).toLowerCase();
    return token === "q-model" || token === "model";
  }

  function isQKeywordAliasDeclarationContext(source, tokenStart) {
    const input = String(source || "");
    let cursor = Math.max(0, Number(tokenStart) || 0) - 1;
    while (cursor >= 0 && /\s/.test(input[cursor])) {
      cursor -= 1;
    }
    if (cursor < 0) {
      return false;
    }
    const end = cursor + 1;
    while (cursor >= 0 && /[A-Za-z0-9_-]/.test(input[cursor])) {
      cursor -= 1;
    }
    const prevToken = input.slice(cursor + 1, end).toLowerCase();
    return prevToken === "q-keyword";
  }

  function evaluateQScriptBlocks(source, options) {
    let out = String(source || "");
    const opts = options || {};
    const maxPasses = Number(opts.maxPasses) > 0 ? Number(opts.maxPasses) : 200;
    const scriptKeywords = collectAliasesTargeting(opts.keywordAliases, "q-script");
    const shouldEvaluate = typeof opts.shouldEvaluate === "function" ? opts.shouldEvaluate : null;
    const executor =
      typeof opts.executor === "function"
        ? opts.executor
        : function defaultExecutor(scriptBody) {
            return executeQScriptReplacement(scriptBody, {});
          };
    let pass = 0;

    while (pass < maxPasses) {
      let changed = false;
      let pos = 0;

      while (true) {
        const token = findNextKeywordTokenSkippingLiterals(out, pos, scriptKeywords);
        if (!token) {
          break;
        }
        const start = token.start;

        let open = token.end;
        while (open < out.length && /\s/.test(out[open])) {
          open += 1;
        }
        if (out[open] !== "{") {
          pos = token.end;
          continue;
        }
        if (isQKeywordAliasDeclarationContext(out, start)) {
          pos = token.end;
          continue;
        }

        const close = findMatchingBraceWithLiterals(out, open);
        if (close === -1) {
          throw new Error("Unterminated q-script block.");
        }

        const body = out.slice(open + 1, close);
        const context = {
          source: out,
          start: start,
          open: open,
          close: close,
          body: body,
        };
        if (shouldEvaluate && shouldEvaluate(context) === false) {
          pos = token.end;
          continue;
        }
        let replacement = executor(body, context);
        const prevChar = start > 0 ? out[start - 1] : "";
        if (prevChar === "." && replacement.startsWith(".")) {
          replacement = replacement.slice(1);
        }

        out = out.slice(0, start) + replacement + out.slice(close + 1);
        pos = start + replacement.length;
        changed = true;
      }

      if (!changed) {
        return out;
      }
      pass += 1;
    }

    throw new Error("q-script evaluation exceeded max pass limit (" + maxPasses + ").");
  }

  function looksLikeQHtmlSnippet(value) {
    const text = String(value == null ? "" : value).trim();
    if (!text) {
      return false;
    }
    if (/<[A-Za-z!/]/.test(text)) {
      return false;
    }
    return /[A-Za-z0-9_.#-]+\s*\{/.test(text);
  }

  function parseAssignmentName(name) {
    const rawName = String(name || "").trim();
    const match = rawName.match(/^(attr|prop)\.([A-Za-z_][A-Za-z0-9_.#-]*)$/i);
    if (!match) {
      return {
        name: rawName,
        hint: "auto",
      };
    }
    return {
      name: String(match[2] || "").trim(),
      hint: String(match[1] || "").trim().toLowerCase() || "auto",
    };
  }

  function isBindingExpressionValue(value) {
    if (!value || typeof value !== "object") {
      return false;
    }
    return value.type === "QBindExpression" || value.type === "QScriptExpression";
  }

  function normalizeBindingExpressionKind(expressionType) {
    const normalized = String(expressionType || "").trim().toLowerCase();
    if (normalized === "q-bind" || normalized === "qbindexpression") {
      return "q-script";
    }
    return "q-script";
  }

  function ensureNodeBindingList(node) {
    if (!node || typeof node !== "object") {
      return [];
    }
    if (!node.meta || typeof node.meta !== "object") {
      node.meta = {};
    }
    if (!Array.isArray(node.meta.qBindings)) {
      node.meta.qBindings = [];
    }
    return node.meta.qBindings;
  }

  function registerNodeBinding(node, bindingSpec) {
    if (!bindingSpec || typeof bindingSpec !== "object") {
      return;
    }
    const key = String(bindingSpec.name || "").trim();
    if (!key) {
      return;
    }
    const entries = ensureNodeBindingList(node);
    const targetCollection =
      String(bindingSpec.targetCollection || "").trim().toLowerCase() === "props"
        ? "props"
        : String(bindingSpec.targetCollection || "").trim().toLowerCase() === "textcontent"
          ? "textContent"
          : "attributes";
    const normalizedKind = normalizeBindingExpressionKind(bindingSpec.expressionType);
    for (let i = 0; i < entries.length; i += 1) {
      const entry = entries[i];
      if (!entry || typeof entry !== "object") {
        continue;
      }
      if (String(entry.name || "").trim().toLowerCase() !== key.toLowerCase()) {
        continue;
      }
      if (String(entry.targetCollection || "attributes").toLowerCase() !== targetCollection.toLowerCase()) {
        continue;
      }
      entries[i] = Object.assign({}, entry, bindingSpec, {
        name: key,
        targetCollection: targetCollection,
        expressionType: normalizedKind,
      });
      return;
    }
    entries.push(
      Object.assign({}, bindingSpec, {
        name: key,
        targetCollection: targetCollection,
        expressionType: normalizedKind,
      })
    );
  }

  function coercePropertyValue(value) {
    if (isBindingExpressionValue(value)) {
      if (String(value.type || "").trim().toLowerCase() === "qscriptexpression") {
        const resolved = tryResolveStaticQScript(value.script || "");
        if (resolved !== null) {
          return resolved;
        }
      }
      return String(value.raw || "");
    }
    return value;
  }

  function convertScopedObjectItemsToPlainValue(items, scopedMaps, visitedRefs) {
    const out = {};
    const itemList = Array.isArray(items) ? items : [];
    const baseArrays =
      scopedMaps && scopedMaps.qArrays instanceof Map
        ? scopedMaps.qArrays
        : new Map();
    const baseObjects =
      scopedMaps && scopedMaps.qObjects instanceof Map
        ? scopedMaps.qObjects
        : new Map();
    const baseModels =
      scopedMaps && scopedMaps.qModels instanceof Map
        ? scopedMaps.qModels
        : new Map();
    const scopeValues =
      scopedMaps && scopedMaps.repeaterScope && typeof scopedMaps.repeaterScope === "object"
        ? scopedMaps.repeaterScope
        : {};
    const localArrays = new Map();
    const localObjects = new Map();
    const localModels = new Map();
    baseArrays.forEach(function copyScopedArray(value, key) {
      localArrays.set(String(key || ""), deepClonePlainValue(value));
    });
    baseObjects.forEach(function copyScopedObject(value, key) {
      localObjects.set(String(key || ""), deepClonePlainValue(value));
    });
    baseModels.forEach(function copyScopedModel(value, key) {
      localModels.set(String(key || ""), deepClonePlainValue(value));
    });
    const localScope = Object.assign({}, scopeValues);

    for (let i = 0; i < itemList.length; i += 1) {
      const item = itemList[i];
      if (!item || typeof item !== "object") {
        continue;
      }

      if (registerQArrayDefinitionItem({ qArrays: localArrays, qObjects: localObjects, qModels: localModels, repeaterScope: localScope }, item)) {
        continue;
      }
      if (registerQObjectDefinitionItem({ qArrays: localArrays, qObjects: localObjects, qModels: localModels, repeaterScope: localScope }, item)) {
        const objectName = normalizeRepeaterSymbolName(item.name);
        if (objectName) {
          continue;
        }
        const anonymousObject = convertScopedObjectItemsToPlainValue(
          Array.isArray(item.items) ? item.items : [],
          { qArrays: localArrays, qObjects: localObjects, qModels: localModels, repeaterScope: localScope },
          visitedRefs
        );
        const keys = Object.keys(anonymousObject);
        for (let ai = 0; ai < keys.length; ai += 1) {
          out[keys[ai]] = anonymousObject[keys[ai]];
        }
        continue;
      }
      if (registerQModelDefinitionItem({ qArrays: localArrays, qObjects: localObjects, qModels: localModels, repeaterScope: localScope }, item)) {
        const modelName = normalizeRepeaterSymbolName(item.name);
        if (modelName) {
          continue;
        }
        const anonymousModelEntries = resolveRepeaterModelEntries(
          Array.isArray(item.items) ? item.items : [],
          { qArrays: localArrays, qObjects: localObjects, qModels: localModels, repeaterScope: localScope },
          item
        );
        const modelValues = convertScopedArrayEntriesToPlainValue(anonymousModelEntries, {
          qArrays: localArrays,
          qObjects: localObjects,
          qModels: localModels,
          repeaterScope: localScope,
        }, visitedRefs);
        for (let mi = 0; mi < modelValues.length; mi += 1) {
          out[String(mi)] = modelValues[mi];
        }
        continue;
      }
      if (item.type !== "Property") {
        continue;
      }
      const assignment = parseAssignmentName(item.name);
      const propName = String(assignment.name || "").trim();
      if (!propName) {
        continue;
      }
      const raw = coercePropertyValue(item.value);
      out[propName] = resolveScopedPropertyValueReferences(
        raw,
        {
          qArrays: localArrays,
          qObjects: localObjects,
          qModels: localModels,
          repeaterScope: localScope,
        },
        visitedRefs
      );
    }

    return out;
  }

  function convertScopedArrayEntriesToPlainValue(entries, scopedMaps, visitedRefs) {
    const list = Array.isArray(entries) ? entries : [];
    const out = [];
    for (let i = 0; i < list.length; i += 1) {
      const entry = list[i];
      if (entry && typeof entry === "object" && entry.kind === "qobject") {
        if (Object.prototype.hasOwnProperty.call(entry, "value")) {
          out.push(resolveScopedPropertyValueReferences(entry.value, scopedMaps, visitedRefs));
          continue;
        }
        out.push(
          convertScopedObjectItemsToPlainValue(
            Array.isArray(entry.items) ? entry.items : [],
            scopedMaps,
            visitedRefs
          )
        );
        continue;
      }
      if (entry && typeof entry === "object" && entry.kind === "primitive") {
        const primitiveValue = Object.prototype.hasOwnProperty.call(entry, "value") ? entry.value : entry.text;
        out.push(resolveScopedPropertyValueReferences(primitiveValue, scopedMaps, visitedRefs));
        continue;
      }
      out.push(resolveScopedPropertyValueReferences(entry, scopedMaps, visitedRefs));
    }
    return out;
  }

  function resolveScopedPropertyValueReferences(value, scopedMaps, visitedRefs) {
    if (Array.isArray(value)) {
      const outArray = [];
      for (let i = 0; i < value.length; i += 1) {
        outArray.push(resolveScopedPropertyValueReferences(value[i], scopedMaps, visitedRefs));
      }
      return outArray;
    }
    if (value && typeof value === "object") {
      const outObject = {};
      const keys = Object.keys(value);
      for (let i = 0; i < keys.length; i += 1) {
        const key = keys[i];
        outObject[key] = resolveScopedPropertyValueReferences(value[key], scopedMaps, visitedRefs);
      }
      return outObject;
    }
    if (typeof value !== "string") {
      return value;
    }

    const token = String(value || "").trim();
    if (!token) {
      return value;
    }
    const normalized = normalizeRepeaterSymbolName(token);
    if (!normalized) {
      return value;
    }

    const qArrays =
      scopedMaps && scopedMaps.qArrays instanceof Map
        ? scopedMaps.qArrays
        : null;
    const qObjects =
      scopedMaps && scopedMaps.qObjects instanceof Map
        ? scopedMaps.qObjects
        : null;
    const qModels =
      scopedMaps && scopedMaps.qModels instanceof Map
        ? scopedMaps.qModels
        : null;
    const repeaterScope =
      scopedMaps && scopedMaps.repeaterScope && typeof scopedMaps.repeaterScope === "object"
        ? scopedMaps.repeaterScope
        : null;
    const seen = visitedRefs instanceof Set ? visitedRefs : new Set();

    if (repeaterScope && Object.prototype.hasOwnProperty.call(repeaterScope, normalized)) {
      return deepClonePlainValue(repeaterScope[normalized]);
    }

    if (qArrays && qArrays.has(normalized)) {
      const guard = "q-array:" + normalized;
      if (seen.has(guard)) {
        return value;
      }
      seen.add(guard);
      const resolvedArray = convertScopedArrayEntriesToPlainValue(
        qArrays.get(normalized),
        scopedMaps,
        seen
      );
      seen.delete(guard);
      return resolvedArray;
    }

    if (qObjects && qObjects.has(normalized)) {
      const guard = "q-object:" + normalized;
      if (seen.has(guard)) {
        return value;
      }
      seen.add(guard);
      const objectSpec = qObjects.get(normalized);
      const resolvedObject = convertScopedObjectItemsToPlainValue(
        objectSpec && Array.isArray(objectSpec.items) ? objectSpec.items : [],
        scopedMaps,
        seen
      );
      seen.delete(guard);
      return resolvedObject;
    }

    if (qModels && qModels.has(normalized)) {
      const guard = "q-model:" + normalized;
      if (seen.has(guard)) {
        return value;
      }
      seen.add(guard);
      const resolvedModel = convertScopedArrayEntriesToPlainValue(
        qModels.get(normalized),
        scopedMaps,
        seen
      );
      seen.delete(guard);
      return resolvedModel;
    }

    return value;
  }

  function applyPropertyToElement(elementNode, prop, scopedMaps) {
    const assignment = parseAssignmentName(prop.name);
    const key = normalizePropertyName(assignment.name);
    const value = resolveScopedPropertyValueReferences(
      coercePropertyValue(prop.value),
      scopedMaps,
      null
    );
    if (isBindingExpressionValue(prop.value)) {
      const expressionType = String(prop.value.type || "").trim().toLowerCase();
      if (expressionType === "qscriptexpression") {
        const staticValue = tryResolveStaticQScript(prop.value.script || "");
        if (staticValue !== null) {
          const resolvedStaticValue = resolveScopedPropertyValueReferences(
            staticValue,
            scopedMaps,
            null
          );
          if (core.TEXT_ALIASES.has(key)) {
            appendTextChildNode(elementNode, resolvedStaticValue, {
              originalSource: prop.raw || null,
              sourceRange:
                typeof prop.start === "number" && typeof prop.end === "number"
                  ? [prop.start, prop.end]
                  : null,
            });
          } else {
            elementNode.attributes[assignment.name] = resolvedStaticValue;
          }
          return;
        }
      }
      registerNodeBinding(elementNode, {
        name: assignment.name,
        targetHint: assignment.hint,
        targetCollection: core.TEXT_ALIASES.has(key) ? "textContent" : "attributes",
        expressionType: prop.value.type,
        script: String(prop.value.script || ""),
      });
      if (core.TEXT_ALIASES.has(key)) {
        if (typeof elementNode.textContent !== "string") {
          elementNode.textContent = "";
        }
      } else {
        elementNode.attributes[assignment.name] = "";
      }
      return;
    }
    if (core.TEXT_ALIASES.has(key)) {
      appendTextChildNode(elementNode, value, {
        originalSource: prop.raw || null,
        sourceRange:
          typeof prop.start === "number" && typeof prop.end === "number"
            ? [prop.start, prop.end]
            : null,
      });
      return;
    }
    elementNode.attributes[assignment.name] = value;
  }

  function createElementFromToken(tokenInfo, selectorMode, selectorChain, range, originalSource) {
    const node = core.createElementNode({
      tagName: tokenInfo.tag || "div",
      selectorMode: selectorMode,
      selectorChain: selectorChain,
      meta: {
        originalSource: originalSource || null,
        sourceRange: range || null,
      },
    });

    if (tokenInfo.id) {
      node.attributes.id = tokenInfo.id;
    }
    if (tokenInfo.classes.length > 0) {
      node.attributes.class = core.mergeClasses(node.attributes.class, tokenInfo.classes);
    }

    return node;
  }

  function collectSlotNamesFromNodes(nodes, intoSet) {
    const set = intoSet || new Set();
    const list = Array.isArray(nodes) ? nodes : [];

    function readNodeSlots(node) {
      if (!node || typeof node !== "object") {
        return [];
      }
      if (Array.isArray(node.slots)) {
        return node.slots;
      }
      if (Array.isArray(node.__qhtmlSlotNodes)) {
        return node.__qhtmlSlotNodes;
      }
      return [];
    }

    for (let i = 0; i < list.length; i += 1) {
      const node = list[i];
      if (!node || typeof node !== "object") {
        continue;
      }

      if (node.kind === core.NODE_TYPES.element && String(node.tagName || "").toLowerCase() === "slot") {
        const slotName =
          node.attributes && typeof node.attributes.name === "string" && node.attributes.name.trim()
            ? String(node.attributes.name).trim()
            : "default";
        set.add(slotName);
      }

      if (core.NODE_TYPES.slot && node.kind === core.NODE_TYPES.slot) {
        const slotName = typeof node.name === "string" && node.name.trim() ? String(node.name).trim() : "default";
        set.add(slotName);
      }

      if (Array.isArray(node.children) && node.children.length > 0) {
        collectSlotNamesFromNodes(node.children, set);
      }
      if (Array.isArray(node.templateNodes) && node.templateNodes.length > 0) {
        collectSlotNamesFromNodes(node.templateNodes, set);
      }
      const slotNodes = readNodeSlots(node);
      if (slotNodes.length > 0) {
        collectSlotNamesFromNodes(slotNodes, set);
      }
    }

    return set;
  }

  function resolveSingleSlotNameForDefinition(definitionNode) {
    if (!definitionNode || !Array.isArray(definitionNode.templateNodes)) {
      return "";
    }
    const slotNames = Array.from(collectSlotNamesFromNodes(definitionNode.templateNodes));
    return slotNames.length === 1 ? slotNames[0] : "";
  }

  function escapeHtmlText(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function createTextSlotNode(text, sourceMeta) {
    const value = String(text || "");
    if (!value) {
      return null;
    }
    if (typeof core.createTextNode === "function" && core.NODE_TYPES && core.NODE_TYPES.text) {
      return core.createTextNode({
        value: value,
        meta: Object.assign({ generated: true }, sourceMeta || {}),
      });
    }
    return core.createRawHtmlNode({
      html: escapeHtmlText(value),
      meta: Object.assign({ generated: true }, sourceMeta || {}),
    });
  }

  function splitInvocationSlotFills(elementNode, definitionNode) {
    const fills = new Map();
    const singleSlotName = resolveSingleSlotNameForDefinition(definitionNode);

    function pushFill(slotName, value) {
      if (!value) {
        return;
      }
      const key = String(slotName || "default").trim() || "default";
      const bucket = fills.get(key) || [];
      bucket.push(value);
      fills.set(key, bucket);
    }

    if (typeof elementNode.textContent === "string" && elementNode.textContent.length > 0) {
      const textNode = createTextSlotNode(elementNode.textContent, {
        originalSource: elementNode.meta && elementNode.meta.originalSource ? elementNode.meta.originalSource : null,
      });
      if (textNode) {
        pushFill(singleSlotName || "default", textNode);
      }
    }

    const children = Array.isArray(elementNode.children) ? elementNode.children : [];
    for (let i = 0; i < children.length; i += 1) {
      const child = children[i];
      if (!child || typeof child !== "object") {
        continue;
      }

      if (child.kind === core.NODE_TYPES.element) {
        const explicitSlot =
          child.attributes && typeof child.attributes.slot === "string" ? String(child.attributes.slot).trim() : "";
        if (explicitSlot) {
          pushFill(explicitSlot, child);
          continue;
        }

        if (singleSlotName) {
          pushFill(singleSlotName, child);
          continue;
        }

        const shorthandSlot = String(child.tagName || "").trim();
        if (shorthandSlot) {
          if (Array.isArray(child.children) && child.children.length > 0) {
            for (let j = 0; j < child.children.length; j += 1) {
              pushFill(shorthandSlot, child.children[j]);
            }
          } else if (typeof child.textContent === "string" && child.textContent.length > 0) {
            const textNode = createTextSlotNode(child.textContent, {
              originalSource: child.meta && child.meta.originalSource ? child.meta.originalSource : null,
            });
            if (textNode) {
              pushFill(shorthandSlot, textNode);
            }
          } else {
            pushFill(shorthandSlot, child);
          }
          continue;
        }
      }

      pushFill(singleSlotName || "default", child);
    }

    return fills;
  }

  function normalizeDefinitionRegistryKey(value) {
    return String(value || "").trim().toLowerCase();
  }

  function readExtendsComponentIds(definitionNode) {
    const out = [];
    if (!definitionNode || typeof definitionNode !== "object") {
      return out;
    }
    const rawList = Array.isArray(definitionNode.extendsComponentIds)
      ? definitionNode.extendsComponentIds
      : [];
    for (let i = 0; i < rawList.length; i += 1) {
      const inheritedId = String(rawList[i] || "").trim();
      if (!inheritedId) {
        continue;
      }
      out.push(inheritedId);
    }
    if (out.length === 0) {
      const legacyId = String(definitionNode.extendsComponentId || "").trim();
      if (legacyId) {
        out.push(legacyId);
      }
    }
    return out;
  }

  function readExtendsKeywordRepeaterHint(extendsComponentIds) {
    const list = Array.isArray(extendsComponentIds) ? extendsComponentIds : [];
    for (let i = 0; i < list.length; i += 1) {
      const inheritedId = String(list[i] || "").trim().toLowerCase();
      if (inheritedId === "q-model-view") {
        return "q-model-view";
      }
      if (inheritedId === "q-repeater" || inheritedId === "q-foreach") {
        return "q-repeater";
      }
    }
    return "";
  }

  function collectInheritedDeclaredProperties(definitionNode, definitionRegistry, state) {
    const shared = state && typeof state === "object" ? state : {};
    const out = Array.isArray(shared.out) ? shared.out : [];
    const seenDefs = shared.seenDefs instanceof Set ? shared.seenDefs : new Set();
    const seenProps = shared.seenProps instanceof Set ? shared.seenProps : new Set();
    const pathKeys = shared.pathKeys instanceof Set ? shared.pathKeys : new Set();
    if (!definitionNode || typeof definitionNode !== "object") {
      return out;
    }
    const currentKey = normalizeDefinitionRegistryKey(definitionNode.componentId);
    if (currentKey && pathKeys.has(currentKey)) {
      throw new Error("Recursive q-component extends chain detected for '" + currentKey + "'.");
    }
    if (seenDefs.has(definitionNode)) {
      return out;
    }
    seenDefs.add(definitionNode);
    const nextPathKeys = new Set(pathKeys);
    if (currentKey) {
      nextPathKeys.add(currentKey);
    }

    const inheritedIds = readExtendsComponentIds(definitionNode);
    for (let bi = 0; bi < inheritedIds.length; bi += 1) {
      const baseKey = normalizeDefinitionRegistryKey(inheritedIds[bi]);
      if (!baseKey || !(definitionRegistry instanceof Map) || !definitionRegistry.has(baseKey)) {
        continue;
      }
      collectInheritedDeclaredProperties(definitionRegistry.get(baseKey), definitionRegistry, {
        out: out,
        seenDefs: seenDefs,
        seenProps: seenProps,
        pathKeys: nextPathKeys,
      });
    }

    const definitionDeclaredProperties = Array.isArray(definitionNode.properties) ? definitionNode.properties : [];
    for (let i = 0; i < definitionDeclaredProperties.length; i += 1) {
      const propertyName = String(definitionDeclaredProperties[i] || "").trim();
      const normalized = normalizePropertyName(propertyName);
      if (!propertyName || !normalized || seenProps.has(normalized)) {
        continue;
      }
      seenProps.add(normalized);
      out.push(propertyName);
    }
    return out;
  }

  function convertElementInvocationToInstance(elementNode, definitionNode, definitionRegistry) {
    const explicitType = String(definitionNode && definitionNode.definitionType ? definitionNode.definitionType : "component")
      .trim()
      .toLowerCase();
    const definitionType =
      explicitType === "template"
        ? "template"
        : explicitType === "signal"
          ? "signal"
          : explicitType === "worker"
            ? "worker"
            : "component";
    const slotFills = splitInvocationSlotFills(elementNode, definitionNode);
    const declaredPropertyNames = collectInheritedDeclaredProperties(definitionNode, definitionRegistry, {});
    const instanceDeclaredProperties =
      elementNode && elementNode.meta && Array.isArray(elementNode.meta.__qhtmlDeclaredProperties)
        ? elementNode.meta.__qhtmlDeclaredProperties
        : [];
    for (let i = 0; i < instanceDeclaredProperties.length; i += 1) {
      declaredPropertyNames.push(instanceDeclaredProperties[i]);
    }
    const declaredProperties = new Set(declaredPropertyNames.map(normalizePropertyName).filter(Boolean));
    const invocationAttributes = Object.assign({}, elementNode.attributes || {});
    const mappedAttributes = {};
    const mappedProps = {};
    const attributeKeys = Object.keys(invocationAttributes);
    for (let i = 0; i < attributeKeys.length; i += 1) {
      const rawKey = String(attributeKeys[i] || "");
      if (!rawKey) {
        continue;
      }
      const assignment = parseAssignmentName(rawKey);
      const targetName = String(assignment.name || "").trim();
      if (!targetName) {
        continue;
      }
      const normalized = normalizePropertyName(targetName);
      const shouldUseProp =
        assignment.hint === "prop" || (assignment.hint !== "attr" && declaredProperties.has(normalized));
      if (shouldUseProp) {
        mappedProps[targetName] = invocationAttributes[rawKey];
      } else {
        mappedAttributes[targetName] = invocationAttributes[rawKey];
      }
    }

    const sourceBindings =
      elementNode && elementNode.meta && Array.isArray(elementNode.meta.qBindings) ? elementNode.meta.qBindings : [];
    const mappedBindings = [];
    for (let i = 0; i < sourceBindings.length; i += 1) {
      const candidate = sourceBindings[i];
      if (!candidate || typeof candidate !== "object") {
        continue;
      }
      const assignment = parseAssignmentName(candidate.name);
      const targetName = String(assignment.name || "").trim();
      if (!targetName) {
        continue;
      }
      const targetHint =
        String(candidate.targetHint || "").trim().toLowerCase() || String(assignment.hint || "").trim().toLowerCase() || "auto";
      let targetCollection =
        String(candidate.targetCollection || "").trim().toLowerCase() === "props"
          ? "props"
          : String(candidate.targetCollection || "").trim().toLowerCase() === "textcontent"
            ? "textContent"
            : "attributes";
      if (targetCollection === "attributes" || targetCollection === "props") {
        const normalized = normalizePropertyName(targetName);
        const shouldUseProp =
          targetHint === "prop" || (targetHint !== "attr" && declaredProperties.has(normalized));
        targetCollection = shouldUseProp ? "props" : "attributes";
      }
      mappedBindings.push(
        Object.assign({}, candidate, {
          name: targetName,
          targetHint: targetHint,
          targetCollection: targetCollection,
        })
      );
    }

    const instanceMeta = Object.assign({}, elementNode.meta || {});
    const instanceAlias =
      elementNode &&
      elementNode.meta &&
      typeof elementNode.meta === "object" &&
      typeof elementNode.meta.__qhtmlInstanceAlias === "string"
        ? String(elementNode.meta.__qhtmlInstanceAlias || "").trim()
        : "";
    if (instanceAlias) {
      instanceMeta.__qhtmlInstanceAlias = instanceAlias;
    }
    if (mappedBindings.length > 0) {
      instanceMeta.qBindings = mappedBindings;
    } else if (Object.prototype.hasOwnProperty.call(instanceMeta, "qBindings")) {
      delete instanceMeta.qBindings;
    }

    const slots = [];
    slotFills.forEach(function eachSlot(children, slotName) {
      slots.push(
        core.createSlotNode({
          name: slotName,
          children: Array.isArray(children) ? children : [],
          meta: {
            generated: true,
            originalSource: elementNode.meta && elementNode.meta.originalSource ? elementNode.meta.originalSource : null,
          },
        })
      );
    });

    return core.createComponentInstanceNode({
      kind: definitionType === "template" ? core.NODE_TYPES.templateInstance : core.NODE_TYPES.componentInstance,
      componentId: String(definitionNode.componentId || elementNode.tagName || "").trim().toLowerCase(),
      tagName: String(elementNode.tagName || definitionNode.componentId || "div").trim().toLowerCase(),
      attributes: mappedAttributes,
      props: mappedProps,
      slots: slots,
      lifecycleScripts: Array.isArray(elementNode.lifecycleScripts) ? elementNode.lifecycleScripts.slice() : [],
      children: Array.isArray(elementNode.children) ? elementNode.children : [],
      textContent: typeof elementNode.textContent === "string" ? elementNode.textContent : null,
      selectorMode: elementNode.selectorMode || "single",
      selectorChain: Array.isArray(elementNode.selectorChain)
        ? elementNode.selectorChain.slice()
        : [String(elementNode.tagName || definitionNode.componentId || "div").trim().toLowerCase()],
      meta: instanceMeta,
    });
  }

  function buildDefinitionRegistry(nodes) {
    const registry = new Map();
    const list = Array.isArray(nodes) ? nodes : [];

    for (let i = 0; i < list.length; i += 1) {
      const node = list[i];
      if (!node || typeof node !== "object") {
        continue;
      }
      if (node.kind === core.NODE_TYPES.component) {
        const key = String(node.componentId || "").trim().toLowerCase();
        if (key) {
          registry.set(key, node);
        }
      }
    }

    return registry;
  }

  function normalizeNodeForDefinitions(node, definitionRegistry) {
    if (!node || typeof node !== "object") {
      return node;
    }

    if (node.kind === core.NODE_TYPES.component) {
      if (Array.isArray(node.templateNodes)) {
        node.templateNodes = normalizeNodesForDefinitions(node.templateNodes, definitionRegistry);
      }
      return node;
    }

    if (
      (node.kind === core.NODE_TYPES.componentInstance || node.kind === core.NODE_TYPES.templateInstance) &&
      (Array.isArray(node.slots) || Array.isArray(node.__qhtmlSlotNodes))
    ) {
      const slotNodes = Array.isArray(node.slots)
        ? node.slots
        : Array.isArray(node.__qhtmlSlotNodes)
          ? node.__qhtmlSlotNodes
          : [];
      for (let i = 0; i < slotNodes.length; i += 1) {
        const slotNode = slotNodes[i];
        if (slotNode && slotNode.kind === core.NODE_TYPES.slot && Array.isArray(slotNode.children)) {
          slotNode.children = normalizeNodesForDefinitions(slotNode.children, definitionRegistry);
        }
      }
      if (Array.isArray(node.children)) {
        node.children = normalizeNodesForDefinitions(node.children, definitionRegistry);
      }
      return node;
    }

    if (node.kind === core.NODE_TYPES.slot && Array.isArray(node.children)) {
      node.children = normalizeNodesForDefinitions(node.children, definitionRegistry);
      return node;
    }

    if (node.kind === core.NODE_TYPES.element) {
      if (Array.isArray(node.children)) {
        node.children = normalizeNodesForDefinitions(node.children, definitionRegistry);
      }
      const tag = String(node.tagName || "").trim().toLowerCase();
      const instanceAlias =
        node &&
        node.meta &&
        typeof node.meta === "object" &&
        typeof node.meta.__qhtmlInstanceAlias === "string"
          ? String(node.meta.__qhtmlInstanceAlias || "").trim()
          : "";
      if (tag && tag !== "slot" && definitionRegistry.has(tag)) {
        const definitionNode = definitionRegistry.get(tag);
        return convertElementInvocationToInstance(node, definitionNode, definitionRegistry);
      }
      if (instanceAlias) {
        throw new Error("Named typed instance syntax requires a known instantiable definition: '" + tag + "'.");
      }
      return node;
    }

    return node;
  }

  function normalizeNodesForDefinitions(nodes, definitionRegistry) {
    const out = [];
    const list = Array.isArray(nodes) ? nodes : [];
    for (let i = 0; i < list.length; i += 1) {
      const normalized = normalizeNodeForDefinitions(list[i], definitionRegistry);
      if (normalized) {
        out.push(normalized);
      }
    }
    return out;
  }

  function extractQColorTextFromAstItems(items) {
    const list = Array.isArray(items) ? items : [];
    const chunks = [];
    for (let i = 0; i < list.length; i += 1) {
      const item = list[i];
      if (!item || typeof item !== "object") {
        continue;
      }
      if (item.type === "TextBlock" || item.type === "RawTextLine") {
        chunks.push(String(item.text || "").trim());
        continue;
      }
      if (item.type === "BareWord") {
        chunks.push(String(item.word || item.name || "").trim());
      }
    }
    return chunks.join(" ").trim();
  }

  function extractSdmlEndpointUrlFromText(bodyText) {
    const text = String(bodyText || "");
    const token = /\burl\b/i.exec(text);
    if (!token) {
      return "";
    }
    let openIndex = token.index + token[0].length;
    while (openIndex < text.length && /\s/.test(text.charAt(openIndex))) {
      openIndex += 1;
    }
    if (text.charAt(openIndex) !== "{") {
      return "";
    }
    const closeIndex = findMatchingBraceInText(text, openIndex);
    if (closeIndex === -1) {
      return "";
    }
    return text.slice(openIndex + 1, closeIndex).trim();
  }

  function coerceQTimerPropertyValue(value) {
    if (isBindingExpressionValue(value)) {
      const expressionType = String(value.type || "").trim().toLowerCase();
      if (expressionType === "qscriptexpression") {
        const staticValue = tryResolveStaticQScript(value.script || "");
        if (staticValue !== null) {
          return staticValue;
        }
      }
      return null;
    }
    return coercePropertyValue(value);
  }

  function coerceQCanvasPropertyValue(value) {
    if (isBindingExpressionValue(value)) {
      const expressionType = String(value.type || "").trim().toLowerCase();
      if (expressionType === "qscriptexpression") {
        const staticValue = tryResolveStaticQScript(value.script || "");
        if (staticValue !== null) {
          return staticValue;
        }
      }
      return null;
    }
    return coercePropertyValue(value);
  }

  function findTopLevelQConnectSeparator(source, mode) {
    const text = String(source || "");
    let inSingle = false;
    let inDouble = false;
    let inBacktick = false;
    let escaped = false;
    let depthParen = 0;
    let depthBracket = 0;
    let depthBrace = 0;
    let seenNonWhitespace = false;

    for (let i = 0; i < text.length; i += 1) {
      const ch = text.charAt(i);
      const next = i + 1 < text.length ? text.charAt(i + 1) : "";

      if (inSingle || inDouble || inBacktick) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === "\\") {
          escaped = true;
          continue;
        }
        if (inSingle && ch === "'") {
          inSingle = false;
          continue;
        }
        if (inDouble && ch === '"') {
          inDouble = false;
          continue;
        }
        if (inBacktick && ch === "`") {
          inBacktick = false;
        }
        continue;
      }

      if (ch === "'") {
        inSingle = true;
        continue;
      }
      if (ch === '"') {
        inDouble = true;
        continue;
      }
      if (ch === "`") {
        inBacktick = true;
        continue;
      }

      if (ch === "(") {
        depthParen += 1;
        seenNonWhitespace = true;
        continue;
      }
      if (ch === ")") {
        if (depthParen > 0) {
          depthParen -= 1;
        }
        seenNonWhitespace = true;
        continue;
      }
      if (ch === "[") {
        depthBracket += 1;
        seenNonWhitespace = true;
        continue;
      }
      if (ch === "]") {
        if (depthBracket > 0) {
          depthBracket -= 1;
        }
        seenNonWhitespace = true;
        continue;
      }
      if (ch === "{") {
        depthBrace += 1;
        seenNonWhitespace = true;
        continue;
      }
      if (ch === "}") {
        if (depthBrace > 0) {
          depthBrace -= 1;
        }
        seenNonWhitespace = true;
        continue;
      }

      if (depthParen === 0 && depthBracket === 0 && depthBrace === 0) {
        if (mode === "arrow") {
          if (ch === "-" && next === ">") {
            return i;
          }
        } else if (/\s/.test(ch)) {
          if (!seenNonWhitespace) {
            continue;
          }
          let j = i;
          while (j < text.length && /\s/.test(text.charAt(j))) {
            j += 1;
          }
          if (j < text.length) {
            return i;
          }
          return -1;
        }
      }

      if (!/\s/.test(ch)) {
        seenNonWhitespace = true;
      }
    }
    return -1;
  }

  function parseQConnectDefinitionBody(bodyText) {
    const source = String(bodyText || "").trim();
    if (!source) {
      return {
        senderExpression: "",
        targetExpression: "",
      };
    }

    const arrowIndex = findTopLevelQConnectSeparator(source, "arrow");
    if (arrowIndex >= 0) {
      return {
        senderExpression: source.slice(0, arrowIndex).trim(),
        targetExpression: source.slice(arrowIndex + 2).trim(),
      };
    }

    const splitIndex = findTopLevelQConnectSeparator(source, "whitespace");
    if (splitIndex >= 0) {
      let targetStart = splitIndex;
      while (targetStart < source.length && /\s/.test(source.charAt(targetStart))) {
        targetStart += 1;
      }
      return {
        senderExpression: source.slice(0, splitIndex).trim(),
        targetExpression: source.slice(targetStart).trim(),
      };
    }

    return {
      senderExpression: source.trim(),
      targetExpression: "",
    };
  }

  function buildQConnectLifecycleBody(connectDefinition) {
    const item = connectDefinition && typeof connectDefinition === "object" ? connectDefinition : {};
    const senderExpression = String(item.senderExpression || "").trim();
    const targetExpression = String(item.targetExpression || "").trim();
    if (!senderExpression || !targetExpression) {
      return "";
    }
    return [
      "try {",
      "  var __qconnectSender = (" + senderExpression + ");",
      "  var __qconnectTarget = (" + targetExpression + ");",
      "  if (__qconnectSender && typeof __qconnectSender.connect === \"function\" && typeof __qconnectTarget === \"function\") {",
      "    __qconnectSender.connect(__qconnectTarget);",
      "  }",
      "} catch (__qconnectError) {",
      "  // ignore q-connect wiring failures by design",
      "}",
    ].join("\n");
  }

  function parseQTimerDefinitionBody(bodyText, keywordAliases) {
    const body = String(bodyText || "");
    const parser = parserFor(body);
    const items = parseBlockItems(parser, cloneKeywordAliases(keywordAliases));
    const config = {
      interval: 0,
      repeat: true,
      running: true,
      onTimeout: "",
    };

    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (!item || typeof item !== "object") {
        continue;
      }
      if (item.type === "Property") {
        const assignment = parseAssignmentName(item.name);
        const key = normalizePropertyName(assignment.name);
        if (!key) {
          continue;
        }
        const value = coerceQTimerPropertyValue(item.value);
        if (key === "interval") {
          const numeric = Number(value);
          config.interval = Number.isFinite(numeric) && numeric >= 0 ? Math.floor(numeric) : 0;
          continue;
        }
        if (key === "repeat") {
          const parsed = parseWasmBoolean(value);
          if (parsed !== null) {
            config.repeat = parsed;
          }
          continue;
        }
        if (key === "running") {
          const parsed = parseWasmBoolean(value);
          if (parsed !== null) {
            config.running = parsed;
          }
        }
        continue;
      }
      if (item.type === "EventBlock") {
        const blockName = String(item.name || "").trim().toLowerCase();
        if (blockName === "ontimeout") {
          config.onTimeout = compactScriptBody(item.script || "");
        }
      }
    }
    return config;
  }

  function parseQCanvasDefinitionBody(bodyText, keywordAliases) {
    const body = String(bodyText || "");
    const parser = parserFor(body);
    const items = parseBlockItems(parser, cloneKeywordAliases(keywordAliases));
    const config = {
      width: 0,
      height: 0,
      onPaint: "",
    };

    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (!item || typeof item !== "object") {
        continue;
      }
      if (item.type === "Property") {
        const assignment = parseAssignmentName(item.name);
        const key = normalizePropertyName(assignment.name);
        if (!key) {
          continue;
        }
        const value = coerceQCanvasPropertyValue(item.value);
        if (key === "width") {
          const numeric = Number(value);
          config.width = Number.isFinite(numeric) && numeric >= 0 ? Math.floor(numeric) : 0;
          continue;
        }
        if (key === "height") {
          const numeric = Number(value);
          config.height = Number.isFinite(numeric) && numeric >= 0 ? Math.floor(numeric) : 0;
          continue;
        }
        continue;
      }
      if (item.type === "EventBlock") {
        const blockName = String(item.name || "").trim().toLowerCase();
        if (blockName === "onpaint") {
          config.onPaint = compactScriptBody(item.script || "");
        }
      }
    }
    return config;
  }

  function buildQCanvasKeywordNode(canvasItem) {
    const item = canvasItem && typeof canvasItem === "object" ? canvasItem : {};
    const canvasId = String(item.canvasId || "").trim();
    const config = item.config && typeof item.config === "object" ? item.config : {};
    const width = Number(config.width);
    const height = Number(config.height);
    const onPaint = String(config.onPaint || "").trim();
    const attributes = {
      "q-canvas": "1",
    };
    if (canvasId) {
      attributes["q-canvas-name"] = canvasId;
    }
    if (Number.isFinite(width) && width > 0) {
      attributes.width = String(Math.floor(width));
    }
    if (Number.isFinite(height) && height > 0) {
      attributes.height = String(Math.floor(height));
    }
    if (onPaint) {
      attributes.onpaint = onPaint;
    }
    return core.createElementNode({
      tagName: "canvas",
      selectorMode: "single",
      selectorChain: ["canvas"],
      attributes: attributes,
      children: [],
      meta: {
        originalSource: item.raw || "",
        sourceRange:
          typeof item.start === "number" && typeof item.end === "number"
            ? [item.start, item.end]
            : null,
        __qhtmlCanvasConfig: {
          name: canvasId,
          width: Number.isFinite(width) && width > 0 ? Math.floor(width) : 0,
          height: Number.isFinite(height) && height > 0 ? Math.floor(height) : 0,
          onPaint: onPaint,
        },
      },
    });
  }

  function parseQColorSchemaEntriesFromAstItems(items) {
    const out = {};
    const list = Array.isArray(items) ? items : [];
    for (let i = 0; i < list.length; i += 1) {
      const item = list[i];
      if (!item || typeof item !== "object" || item.type !== "Element") {
        continue;
      }
      const selectors = Array.isArray(item.selectors) ? item.selectors : [];
      if (selectors.length !== 1) {
        continue;
      }
      const areaName = String(selectors[0] || "").trim();
      if (!areaName) {
        continue;
      }
      const propertyText = extractQColorTextFromAstItems(item.items);
      out[areaName] = propertyText || inferQColorCssProperty(areaName);
    }
    return out;
  }

  function parseQColorThemeAssignmentsFromAstItems(items) {
    const out = {};
    const list = Array.isArray(items) ? items : [];
    for (let i = 0; i < list.length; i += 1) {
      const item = list[i];
      if (!item || typeof item !== "object") {
        continue;
      }
      if (item.type !== "Property") {
        if (item.type === "Element") {
          const selectors = Array.isArray(item.selectors) ? item.selectors : [];
          if (selectors.length !== 1) {
            continue;
          }
          const key = String(selectors[0] || "").trim();
          if (!key) {
            continue;
          }
          const value = extractQColorTextFromAstItems(item.items);
          if (!value) {
            continue;
          }
          out[key] = value;
        }
        continue;
      }
      const key = String(item.name || "").trim();
      if (!key) {
        continue;
      }
      const valueText =
        typeof item.value === "string"
          ? item.value
          : item.value && typeof item.value === "object"
            ? typeof item.value.value === "string"
              ? item.value.value
              : typeof item.value.raw === "string"
                ? item.value.raw
                : ""
            : "";
      const value = String(valueText || "").trim();
      if (!value) {
        continue;
      }
      out[key] = value;
    }
    return out;
  }

  function registerQStyleDefinitionItem(styleContext, item) {
    if (!styleContext || !item || typeof item !== "object") {
      return;
    }
    const styleName = String(item.name || "").trim();
    if (!styleName) {
      throw new Error("q-style requires a name.");
    }
    registerQStyleDefinition(styleContext, styleName, item.declarations, item.classes);
  }

  function registerQThemeDefinitionItem(styleContext, item) {
    if (!styleContext || !item || typeof item !== "object") {
      return;
    }
    const themeName = String(item.name || "").trim();
    if (!themeName) {
      throw new Error("q-theme requires a name.");
    }
    const rawRules = Array.isArray(item.rules) ? item.rules : [];
    const normalizedRules = [];
    for (let i = 0; i < rawRules.length; i += 1) {
      const rule = rawRules[i];
      if (!rule || typeof rule !== "object") {
        continue;
      }
      const selector = String(rule.selector || "").trim();
      const styles = Array.isArray(rule.styles)
        ? rule.styles.map(function normalizeStyleName(entry) { return String(entry || "").trim(); }).filter(Boolean)
        : [];
      if (!selector) {
        continue;
      }
      if (styles.length === 0 && /^[A-Za-z_][A-Za-z0-9_-]*$/.test(selector)) {
        normalizedRules.push({
          includeTheme: selector,
        });
        continue;
      }
      normalizedRules.push({
        selector: selector,
        styles: styles,
      });
    }
    registerQThemeDefinition(styleContext, themeName, normalizedRules, {
      isDefault: !!item.defaultTheme,
    });
  }

  function resolveNamedQThemeInvocation(item, styleContext) {
    if (!item || typeof item !== "object" || item.type !== "Element") {
      return null;
    }
    const selectors = Array.isArray(item.selectors) ? item.selectors : [];
    if (selectors.length !== 1) {
      return null;
    }
    const invocationName = String(selectors[0] || "").trim();
    if (!invocationName) {
      return null;
    }
    return lookupQThemeDefinition(styleContext, invocationName);
  }

  function expandQThemeRules(styleContext, themeDefinition, visited) {
    const out = [];
    const theme = themeDefinition && typeof themeDefinition === "object" ? themeDefinition : null;
    if (!theme) {
      return out;
    }
    const rules = Array.isArray(theme.rules) ? theme.rules : [];
    const seen = visited instanceof Set ? visited : new Set();
    for (let i = 0; i < rules.length; i += 1) {
      const rule = rules[i];
      if (!rule || typeof rule !== "object") {
        continue;
      }
      const includeName = String(rule.includeTheme || "").trim();
      if (includeName) {
        const includeKey = normalizeColorLookupKey(includeName);
        if (!includeKey || seen.has(includeKey)) {
          continue;
        }
        seen.add(includeKey);
        const includeTheme = lookupQThemeDefinition(styleContext, includeName);
        if (includeTheme) {
          const expanded = expandQThemeRules(styleContext, includeTheme, seen);
          for (let j = 0; j < expanded.length; j += 1) {
            out.push(expanded[j]);
          }
        }
        seen.delete(includeKey);
        continue;
      }
      const selector = String(rule.selector || "").trim();
      const styles = Array.isArray(rule.styles)
        ? rule.styles.map(function cloneStyleName(entry) { return String(entry || "").trim(); }).filter(Boolean)
        : [];
      if (!selector || styles.length === 0) {
        continue;
      }
      out.push({
        selector: selector,
        styles: styles,
      });
    }
    return out;
  }

  function tryApplyNamedQThemeInvocation(item, styleContext) {
    if (!item || typeof item !== "object" || item.type !== "Element") {
      return false;
    }
    if (!styleContext || !(styleContext.themes instanceof Map)) {
      return false;
    }
    const selectors = Array.isArray(item.selectors) ? item.selectors : [];
    if (selectors.length !== 1) {
      return false;
    }
    const invocationName = String(selectors[0] || "").trim();
    if (!invocationName) {
      return false;
    }
    const definition = lookupQThemeDefinition(styleContext, invocationName);
    if (!definition) {
      return false;
    }
    const childItems = Array.isArray(item.items) ? item.items : [];
    if (childItems.length > 0) {
      return false;
    }
    appendActiveQTheme(styleContext, definition);
    return true;
  }

  function resolveNamedQColorSetupInvocation(item, colorContext) {
    if (!item || typeof item !== "object" || item.type !== "Element") {
      return null;
    }
    if (!colorContext || typeof colorContext !== "object") {
      return null;
    }
    const selectors = Array.isArray(item.selectors) ? item.selectors : [];
    if (selectors.length !== 1) {
      return null;
    }
    const invocationName = String(selectors[0] || "").trim();
    if (!invocationName) {
      return null;
    }
    return lookupQColorDefinition(colorContext, invocationName);
  }

  function tryApplyNamedQColorInvocation(item, colorContext) {
    if (!item || typeof item !== "object" || item.type !== "Element") {
      return false;
    }
    if (!colorContext || typeof colorContext !== "object") {
      return false;
    }
    const selectors = Array.isArray(item.selectors) ? item.selectors : [];
    if (selectors.length !== 1) {
      return false;
    }
    const invocationName = String(selectors[0] || "").trim();
    const invocationKey = normalizeColorLookupKey(invocationName);
    if (!invocationKey) {
      return false;
    }

    if (colorContext.schemaDefs instanceof Map && colorContext.schemaDefs.has(invocationKey)) {
      const schemaDef = colorContext.schemaDefs.get(invocationKey) || {};
      const merged = Object.assign({}, cloneQColorAssignments(schemaDef.entries), parseQColorSchemaEntriesFromAstItems(item.items));
      const keys = Object.keys(merged);
      for (let i = 0; i < keys.length; i += 1) {
        const areaName = keys[i];
        registerQColorSchema(colorContext, areaName, merged[areaName]);
      }
      return true;
    }

    if (colorContext.themes instanceof Map && colorContext.themes.has(invocationKey)) {
      const themeDef = colorContext.themes.get(invocationKey) || {};
      const merged = Object.assign({}, cloneQColorAssignments(themeDef.assignments), parseQColorThemeAssignmentsFromAstItems(item.items));
      registerQColorTheme(colorContext, DEFAULT_QCOLOR_THEME_NAME, merged, { setAsDefault: true });
      return true;
    }

    if (colorContext.colorDefs instanceof Map && colorContext.colorDefs.has(invocationKey)) {
      const setup = lookupQColorDefinition(colorContext, invocationName);
      if (!setup) {
        return false;
      }
      const childItems = Array.isArray(item.items) ? item.items : [];
      if (childItems.length > 0) {
        return false;
      }
      appendActiveQColorSetup(colorContext, setup);
      return true;
    }

    return false;
  }

  function normalizeRepeaterSymbolName(name) {
    return String(name || "").trim().toLowerCase();
  }

  function warnRepeaterIssue(message, details) {
    if (typeof console !== "undefined" && console && typeof console.warn === "function") {
      console.warn(message, details || {});
    }
  }

  function createRepeaterPrimitiveEntry(value) {
    return {
      kind: "primitive",
      value: value,
      text: String(value == null ? "" : value),
    };
  }

  function createRepeaterObjectEntry(items, sourceText, keyword) {
    const clonedItems = deepClonePlainValue(Array.isArray(items) ? items : []);
    const rawSource = String(sourceText || "").trim();
    let resolvedSource = rawSource;
    if (!resolvedSource && clonedItems.length > 0) {
      const chunks = [];
      for (let i = 0; i < clonedItems.length; i += 1) {
        const candidate = clonedItems[i];
        if (candidate && typeof candidate.raw === "string" && candidate.raw.trim()) {
          chunks.push(candidate.raw.trim());
        }
      }
      resolvedSource = chunks.join("\n").trim();
    }
    return {
      kind: "qobject",
      items: clonedItems,
      source: resolvedSource,
      objectKeyword: normalizeQObjectKeyword(keyword),
    };
  }

  function cloneRepeaterEntries(entries) {
    const list = Array.isArray(entries) ? entries : [];
    const out = [];
    for (let i = 0; i < list.length; i += 1) {
      out.push(deepClonePlainValue(list[i]));
    }
    return out;
  }

  function createRepeaterEntriesFromModelValue(value) {
    if (Array.isArray(value)) {
      const out = [];
      for (let i = 0; i < value.length; i += 1) {
        out.push(createRepeaterPrimitiveEntry(deepClonePlainValue(value[i])));
      }
      return out;
    }
    if (value && typeof value === "object") {
      const keys = Object.keys(value);
      const out = [];
      for (let i = 0; i < keys.length; i += 1) {
        const key = keys[i];
        out.push(createRepeaterPrimitiveEntry(deepClonePlainValue(value[key])));
      }
      return out;
    }
    return [createRepeaterPrimitiveEntry(value)];
  }

  function readModelViewAlias(aliasItem) {
    if (!aliasItem || aliasItem.type !== "Element") {
      return "";
    }
    const selectors = Array.isArray(aliasItem.selectors) ? aliasItem.selectors : [];
    if (selectors.length !== 1 || String(selectors[0] || "").trim().toLowerCase() !== "as") {
      return "";
    }
    const nested = Array.isArray(aliasItem.items) ? aliasItem.items : [];
    for (let i = 0; i < nested.length; i += 1) {
      const candidate = nested[i];
      if (!candidate || typeof candidate !== "object") {
        continue;
      }
      const source =
        candidate.type === "TextBlock" || candidate.type === "RawTextLine"
          ? String(candidate.text || "")
          : candidate.type === "BareWord"
            ? String(candidate.name || "")
            : "";
      const token = source.trim();
      if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(token)) {
        return token;
      }
    }
    return "";
  }

  function parseRepeaterLiteralToken(token) {
    const raw = String(token || "").trim();
    if (!raw) {
      return null;
    }
    if (
      (raw.startsWith('"') && raw.endsWith('"')) ||
      (raw.startsWith("'") && raw.endsWith("'")) ||
      (raw.startsWith("`") && raw.endsWith("`"))
    ) {
      return unescapeSimpleQuotedBody(raw.slice(1, -1));
    }
    if (/^-?\d+(\.\d+)?$/.test(raw)) {
      return Number(raw);
    }
    if (raw === "true") {
      return true;
    }
    if (raw === "false") {
      return false;
    }
    if (raw === "null") {
      return null;
    }
    return raw;
  }

  function coerceArrayLiteralValueToEntries(value) {
    if (Array.isArray(value)) {
      const out = [];
      for (let i = 0; i < value.length; i += 1) {
        out.push(createRepeaterPrimitiveEntry(value[i]));
      }
      return out;
    }
    return [createRepeaterPrimitiveEntry(value)];
  }

  function parseQArrayBodyToEntries(rawBody, scopedContext) {
    const body = String(rawBody || "").trim();
    if (!body) {
      return [];
    }

    if (body.charAt(0) === "[" && body.charAt(body.length - 1) === "]") {
      try {
        return coerceArrayLiteralValueToEntries(JSON.parse(body));
      } catch (jsonError) {
        try {
          const fromJs = new Function("return (" + body + ");")();
          return coerceArrayLiteralValueToEntries(fromJs);
        } catch (scriptError) {
          warnRepeaterIssue("q-array warning: failed to parse array literal body", {
            body: body,
            error: scriptError && scriptError.message ? scriptError.message : String(scriptError || jsonError),
          });
          return [createRepeaterPrimitiveEntry(body)];
        }
      }
    }
    const qArrays = scopedContext && scopedContext.qArrays instanceof Map ? scopedContext.qArrays : new Map();
    const qObjects = scopedContext && scopedContext.qObjects instanceof Map ? scopedContext.qObjects : new Map();
    const qModels = scopedContext && scopedContext.qModels instanceof Map ? scopedContext.qModels : new Map();
    const repeaterScope =
      scopedContext && scopedContext.repeaterScope && typeof scopedContext.repeaterScope === "object"
        ? scopedContext.repeaterScope
        : {};
    const typedValues = parseTypedArrayBodyToValue(body, null);
    const entries = [];

    for (let i = 0; i < typedValues.length; i += 1) {
      const typedValue = typedValues[i];
      if (typeof typedValue === "string") {
        const token = String(typedValue || "").trim();
        const key = normalizeRepeaterSymbolName(token);
        if (qArrays.has(key)) {
          const clonedArrayEntries = cloneRepeaterEntries(qArrays.get(key));
          for (let ai = 0; ai < clonedArrayEntries.length; ai += 1) {
            entries.push(clonedArrayEntries[ai]);
          }
          continue;
        }
        if (qObjects.has(key)) {
          const objectSpec = qObjects.get(key);
          entries.push(
            createRepeaterObjectEntry(
              objectSpec && objectSpec.items,
              objectSpec && objectSpec.source,
              objectSpec && objectSpec.keyword
            )
          );
          continue;
        }
        if (qModels.has(key)) {
          const clonedModelEntries = cloneRepeaterEntries(qModels.get(key));
          for (let mi = 0; mi < clonedModelEntries.length; mi += 1) {
            entries.push(clonedModelEntries[mi]);
          }
          continue;
        }
        if (Object.prototype.hasOwnProperty.call(repeaterScope, key)) {
          entries.push(createRepeaterPrimitiveEntry(deepClonePlainValue(repeaterScope[key])));
          continue;
        }
      }
      const resolvedValue = resolveScopedPropertyValueReferences(typedValue, scopedContext, null);
      entries.push(createRepeaterPrimitiveEntry(resolvedValue));
    }
    return entries;
  }

  function registerQArrayDefinitionItem(scopedContext, item) {
    if (!item || item.type !== "QArrayDefinition") {
      return false;
    }
    const qArrays = scopedContext && scopedContext.qArrays instanceof Map ? scopedContext.qArrays : null;
    const arrayName = normalizeRepeaterSymbolName(item.name);
    const parsedEntries = parseQArrayBodyToEntries(item.body, scopedContext);
    if (qArrays && arrayName) {
      qArrays.set(arrayName, cloneRepeaterEntries(parsedEntries));
    }
    return true;
  }

  function registerQObjectDefinitionItem(scopedContext, item) {
    if (!item || item.type !== "QObjectDefinition") {
      return false;
    }
    const qObjects = scopedContext && scopedContext.qObjects instanceof Map ? scopedContext.qObjects : null;
    const objectName = normalizeRepeaterSymbolName(item.name);
    if (qObjects && objectName) {
      qObjects.set(objectName, {
        items: deepClonePlainValue(Array.isArray(item.items) ? item.items : []),
        source: String(item.raw || "").trim(),
        keyword: normalizeQObjectKeyword(item.keyword),
      });
    }
    return true;
  }

  function registerQModelDefinitionItem(scopedContext, item) {
    if (!item || item.type !== "QModelDefinition") {
      return false;
    }
    const qModels = scopedContext && scopedContext.qModels instanceof Map ? scopedContext.qModels : null;
    const modelName = normalizeRepeaterSymbolName(item.name);
    const rawModelEntries = resolveRepeaterModelEntries(
      Array.isArray(item.items) ? item.items : [],
      scopedContext,
      item
    );
    const modelEntries = [];
    for (let i = 0; i < rawModelEntries.length; i += 1) {
      const entry = rawModelEntries[i];
      if (entry && typeof entry === "object" && entry.kind === "qobject") {
        const objectValue = convertScopedObjectItemsToPlainValue(
          Array.isArray(entry.items) ? entry.items : [],
          scopedContext,
          null
        );
        modelEntries.push(createRepeaterPrimitiveEntry(objectValue));
        continue;
      }
      if (entry && typeof entry === "object" && Object.prototype.hasOwnProperty.call(entry, "value")) {
        modelEntries.push(
          createRepeaterPrimitiveEntry(
            resolveScopedPropertyValueReferences(entry.value, scopedContext, null)
          )
        );
        continue;
      }
      if (entry && typeof entry === "object" && Object.prototype.hasOwnProperty.call(entry, "text")) {
        modelEntries.push(createRepeaterPrimitiveEntry(entry.text));
        continue;
      }
      modelEntries.push(createRepeaterPrimitiveEntry(entry));
    }
    if (qModels && modelName) {
      qModels.set(modelName, cloneRepeaterEntries(modelEntries));
    }
    return true;
  }

  function readRepeaterSlotAlias(slotItem) {
    if (!slotItem || slotItem.type !== "Element") {
      return "";
    }
    const selectors = Array.isArray(slotItem.selectors) ? slotItem.selectors : [];
    if (selectors.length !== 1 || String(selectors[0] || "").trim().toLowerCase() !== "slot") {
      return "";
    }
    const nested = Array.isArray(slotItem.items) ? slotItem.items : [];
    for (let i = 0; i < nested.length; i += 1) {
      const candidate = nested[i];
      if (!candidate || typeof candidate !== "object") {
        continue;
      }
      const source =
        candidate.type === "TextBlock" || candidate.type === "RawTextLine"
          ? String(candidate.text || "")
          : candidate.type === "BareWord"
            ? String(candidate.name || "")
            : "";
      const token = source.trim();
      if (/^[A-Za-z_][A-Za-z0-9_-]*$/.test(token)) {
        return token;
      }
    }
    return "";
  }

  function resolveRepeaterModelEntries(modelItems, scopedContext, repeaterItem) {
    const items = Array.isArray(modelItems) ? modelItems : [];
    const entries = [];
    let hasInvalidContainer = false;
    const modelRawParts = [];
    const qArrays = scopedContext && scopedContext.qArrays instanceof Map ? scopedContext.qArrays : new Map();
    const qObjects = scopedContext && scopedContext.qObjects instanceof Map ? scopedContext.qObjects : new Map();
    const qModels = scopedContext && scopedContext.qModels instanceof Map ? scopedContext.qModels : new Map();

    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (!item || typeof item !== "object") {
        continue;
      }
      if (typeof item.raw === "string" && item.raw.trim()) {
        modelRawParts.push(item.raw.trim());
      }
      if (registerQArrayDefinitionItem(scopedContext, item)) {
        const anonymousEntries = !String(item.name || "").trim()
          ? parseQArrayBodyToEntries(item.body, scopedContext)
          : parseQArrayBodyToEntries(item.body, scopedContext);
        for (let j = 0; j < anonymousEntries.length; j += 1) {
          entries.push(anonymousEntries[j]);
        }
        continue;
      }
      if (registerQObjectDefinitionItem(scopedContext, item)) {
        entries.push(createRepeaterObjectEntry(item.items, item.raw, item.keyword));
        continue;
      }
      if (registerQModelDefinitionItem(scopedContext, item)) {
        if (!String(item.name || "").trim()) {
          const anonymousEntries = resolveRepeaterModelEntries(
            Array.isArray(item.items) ? item.items : [],
            scopedContext,
            item
          );
          for (let j = 0; j < anonymousEntries.length; j += 1) {
            entries.push(anonymousEntries[j]);
          }
        }
        continue;
      }
      if (item.type === "QScriptInline") {
        const resolvedScriptValue = tryResolveStaticQScriptValue(item.script || "");
        if (resolvedScriptValue === null) {
          hasInvalidContainer = true;
          continue;
        }
        const scriptEntries = createRepeaterEntriesFromModelValue(resolvedScriptValue);
        for (let j = 0; j < scriptEntries.length; j += 1) {
          entries.push(scriptEntries[j]);
        }
        continue;
      }
      if (item.type === "BareWord") {
        const token = String(item.name || "").trim();
        const key = normalizeRepeaterSymbolName(token);
        if (qArrays.has(key)) {
          const arrayEntries = cloneRepeaterEntries(qArrays.get(key));
          for (let j = 0; j < arrayEntries.length; j += 1) {
            entries.push(arrayEntries[j]);
          }
          continue;
        }
        if (qObjects.has(key)) {
          const objectEntry = qObjects.get(key) || {};
          entries.push(createRepeaterObjectEntry(objectEntry.items, objectEntry.source, objectEntry.keyword));
          continue;
        }
        if (qModels.has(key)) {
          const modelEntries = cloneRepeaterEntries(qModels.get(key));
          for (let j = 0; j < modelEntries.length; j += 1) {
            entries.push(modelEntries[j]);
          }
          continue;
        }
        entries.push(createRepeaterPrimitiveEntry(token));
        continue;
      }
      if (item.type === "HtmlBlock" || item.type === "TextBlock" || item.type === "RawTextLine") {
        hasInvalidContainer = true;
        continue;
      }
      entries.push(createRepeaterObjectEntry([item], item.raw, item && item.keyword));
    }

    if (hasInvalidContainer) {
      warnRepeaterIssue("q-model warning: model contains non-iterative containers; using fallback iteration.", {
        repeater: repeaterItem && repeaterItem.name ? repeaterItem.name : "",
        keyword: repeaterItem && repeaterItem.keyword ? repeaterItem.keyword : "q-repeater",
      });
      const keyword = String(repeaterItem && repeaterItem.keyword || "").trim().toLowerCase();
      if (keyword === "q-model" || keyword === "q-model-view") {
        if (entries.length > 0) {
          return entries;
        }
      } else {
        return [createRepeaterPrimitiveEntry(modelRawParts.join(" ").trim())];
      }
    }

    return entries;
  }

  function convertRepeaterObjectItemsToNodes(astItems, source, context) {
    const items = Array.isArray(astItems) ? astItems : [];
    const outNodes = [];
    const scoped = createScopedConversionContext(context);
    for (let i = 0; i < items.length; i += 1) {
      const nodes = convertAstItemToNodes(items[i], source, scoped);
      for (let j = 0; j < nodes.length; j += 1) {
        outNodes.push(nodes[j]);
      }
    }
    return outNodes;
  }

  function normalizeRepeaterModelEntry(entry, source, context) {
    if (!entry || typeof entry !== "object") {
      return createRepeaterPrimitiveEntry(entry);
    }
    if (entry.kind === "qobject") {
      const objectItems = Array.isArray(entry.items) ? entry.items : [];
      return {
        kind: "qobject",
        source: String(entry.source || "").trim(),
        objectKeyword: normalizeQObjectKeyword(entry.objectKeyword || entry.keyword),
        items: deepClonePlainValue(objectItems),
        value: convertScopedObjectItemsToPlainValue(objectItems, context, null),
        nodes: convertRepeaterObjectItemsToNodes(objectItems, source, context),
      };
    }
    if (Object.prototype.hasOwnProperty.call(entry, "value")) {
      return {
        kind: "primitive",
        value: entry.value,
        text: String(entry.value == null ? "" : entry.value),
      };
    }
    return {
      kind: "primitive",
      value: Object.prototype.hasOwnProperty.call(entry, "text") ? entry.text : "",
      text: String(entry.text || ""),
    };
  }

  function isSimpleForSourceExpression(sourceExpression) {
    const source = String(sourceExpression || "").trim();
    if (!source) {
      return false;
    }
    return /^(?:this\.component\.|component\.)?[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/.test(source);
  }

  function isUnresolvedForSourceEntries(entries, sourceExpression) {
    const list = Array.isArray(entries) ? entries : [];
    const source = String(sourceExpression || "").trim();
    if (!source || !isSimpleForSourceExpression(source)) {
      return false;
    }
    if (list.length !== 1) {
      return false;
    }
    const entry = list[0];
    if (!entry || typeof entry !== "object") {
      return false;
    }
    if (Object.prototype.hasOwnProperty.call(entry, "value")) {
      return String(entry.value == null ? "" : entry.value).trim() === source;
    }
    if (Object.prototype.hasOwnProperty.call(entry, "text")) {
      return String(entry.text == null ? "" : entry.text).trim() === source;
    }
    return false;
  }

  function buildForNodeFromAst(forItem, source, context) {
    const scopedContext = createScopedConversionContext(context);
    const items = Array.isArray(forItem && forItem.items) ? forItem.items : [];
    const templateNodes = [];
    for (let i = 0; i < items.length; i += 1) {
      const nodes = convertAstItemToNodes(items[i], source, createScopedConversionContext(scopedContext));
      for (let j = 0; j < nodes.length; j += 1) {
        templateNodes.push(nodes[j]);
      }
    }
    const slotName = String(forItem && forItem.slotName || "item").trim() || "item";
    const sourceExpression = String(forItem && forItem.sourceExpression || "").trim();
    const seedItems = sourceExpression
      ? [{ type: "BareWord", name: sourceExpression, raw: sourceExpression }]
      : [];
    let resolvedEntries = resolveRepeaterModelEntries(seedItems, scopedContext, forItem);
    if (isUnresolvedForSourceEntries(resolvedEntries, sourceExpression)) {
      resolvedEntries = [];
    }
    for (let i = 0; i < resolvedEntries.length; i += 1) {
      resolvedEntries[i] = normalizeRepeaterModelEntry(resolvedEntries[i], source, scopedContext);
    }
    const modelNode = core.createModelNode({
      entries: resolvedEntries,
      source: sourceExpression,
      meta: {
        generated: true,
        dynamicSource: true,
      },
    });
    const forNode = core.createRepeaterNode({
      repeaterId: "",
      keyword: "for",
      slotName: slotName,
      model: modelNode,
      modelEntries: resolvedEntries,
      modelSource: sourceExpression,
      templateNodes: templateNodes,
      meta: {
        aliasNames: [slotName],
        dynamicModelSource: true,
        sourceExpression: sourceExpression,
        originalSource: forItem && typeof forItem.raw === "string" ? forItem.raw : null,
        sourceRange:
          forItem && typeof forItem.start === "number" && typeof forItem.end === "number"
            ? [forItem.start, forItem.end]
            : null,
      },
    });
    applyKeywordAliasesToNode(forNode, forItem ? forItem.keywords : null);
    return forNode;
  }

  function buildRepeaterNodeFromAst(repeaterItem, source, context) {
    const modelViewBase = buildModelViewNodeFromAst(repeaterItem, source, context);
    modelViewBase.repeaterId = String(repeaterItem && repeaterItem.name || "").trim();
    modelViewBase.keyword = String(repeaterItem && repeaterItem.keyword || "q-repeater").trim().toLowerCase() || "q-repeater";
    if (!modelViewBase.meta || typeof modelViewBase.meta !== "object") {
      modelViewBase.meta = {};
    }
    modelViewBase.meta.originalSource =
      repeaterItem && typeof repeaterItem.raw === "string" ? repeaterItem.raw : null;
    modelViewBase.meta.sourceRange =
      repeaterItem && typeof repeaterItem.start === "number" && typeof repeaterItem.end === "number"
        ? [repeaterItem.start, repeaterItem.end]
        : null;
    applyKeywordAliasesToNode(modelViewBase, repeaterItem ? repeaterItem.keywords : null);
    return modelViewBase;
  }

  function buildModelViewNodeFromAst(modelViewItem, source, context) {
    const scopedContext = createScopedConversionContext(context);
    const items = Array.isArray(modelViewItem && modelViewItem.items) ? modelViewItem.items : [];
    let slotName = "item";
    let modelItems = [];
    const modelSourceParts = [];
    const templateNodes = [];

    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (!item || typeof item !== "object") {
        continue;
      }
      if (registerQArrayDefinitionItem(scopedContext, item)) {
        continue;
      }
      if (registerQObjectDefinitionItem(scopedContext, item)) {
        continue;
      }
      if (item.type === "QModelDefinition") {
        if (String(item.name || "").trim()) {
          registerQModelDefinitionItem(scopedContext, item);
        } else {
          const anonymousItems = Array.isArray(item.items) ? item.items : [];
          for (let mi = 0; mi < anonymousItems.length; mi += 1) {
            modelItems.push(anonymousItems[mi]);
          }
          const rawModelSource = String(item.raw || "").trim();
          if (rawModelSource) {
            modelSourceParts.push(rawModelSource);
          }
        }
        continue;
      }
      if (item.type === "Element") {
        const selectors = Array.isArray(item.selectors) ? item.selectors : [];
        const selectorLower = selectors.length === 1 ? String(selectors[0] || "").trim().toLowerCase() : "";
        if (selectorLower === "as" || selectorLower === "slot") {
          const alias = selectorLower === "as" ? readModelViewAlias(item) : readRepeaterSlotAlias(item);
          if (alias) {
            slotName = alias;
          }
          continue;
        }
        if (selectorLower === "q-model" || selectorLower === "model") {
          const inlineModelItems = Array.isArray(item.items) ? item.items : [];
          for (let mi = 0; mi < inlineModelItems.length; mi += 1) {
            modelItems.push(inlineModelItems[mi]);
          }
          const inlineModelSource = String(item.raw || "").trim();
          if (inlineModelSource) {
            modelSourceParts.push(inlineModelSource);
          }
          continue;
        }
      }
      const nodes = convertAstItemToNodes(item, source, createScopedConversionContext(scopedContext));
      for (let ni = 0; ni < nodes.length; ni += 1) {
        templateNodes.push(nodes[ni]);
      }
    }

    const resolvedEntries = resolveRepeaterModelEntries(modelItems, scopedContext, modelViewItem);
    for (let i = 0; i < resolvedEntries.length; i += 1) {
      resolvedEntries[i] = normalizeRepeaterModelEntry(resolvedEntries[i], source, scopedContext);
    }
    const modelSource = modelSourceParts.join("\n").trim();
    const modelNode = core.createModelNode({
      entries: resolvedEntries,
      source: modelSource,
      meta: {
        generated: true,
      },
    });
    const modelViewNode = core.createRepeaterNode({
      repeaterId: "",
      keyword: "q-model-view",
      slotName: String(slotName || "item").trim() || "item",
      model: modelNode,
      modelEntries: resolvedEntries,
      modelSource: modelSource,
      templateNodes: templateNodes,
      meta: {
        originalSource: modelViewItem && typeof modelViewItem.raw === "string" ? modelViewItem.raw : null,
        sourceRange:
          modelViewItem && typeof modelViewItem.start === "number" && typeof modelViewItem.end === "number"
            ? [modelViewItem.start, modelViewItem.end]
            : null,
      },
    });
    applyKeywordAliasesToNode(modelViewNode, modelViewItem ? modelViewItem.keywords : null);
    return modelViewNode;
  }

  function processElementItems(targetElement, astItems, source, context) {
    const colorContext =
      context && context.qColors && typeof context.qColors === "object"
        ? context.qColors
        : createQColorContext();
    const styleContext =
      context && context.qStyles && typeof context.qStyles === "object"
        ? context.qStyles
        : createQStyleContext();
    const qArrayContext =
      context && context.qArrays instanceof Map
        ? context.qArrays
        : new Map();
    const qObjectContext =
      context && context.qObjects instanceof Map
        ? context.qObjects
        : new Map();
    const qModelContext =
      context && context.qModels instanceof Map
        ? context.qModels
        : new Map();
    const repeaterScope =
      context && context.repeaterScope && typeof context.repeaterScope === "object"
        ? context.repeaterScope
        : {};
    const childScopedStyles =
      context && Array.isArray(context.qStyleChildScope)
        ? context.qStyleChildScope
        : [];
    applyActiveQColorSetupsToElementNode(targetElement, colorContext);

    function appendChildNode(childNode) {
      if (!childNode) {
        return;
      }
      if (childNode.kind === core.NODE_TYPES.element && childScopedStyles.length > 0) {
        for (let i = 0; i < childScopedStyles.length; i += 1) {
          applyQStyleToElementNode(childNode, childScopedStyles[i]);
        }
      }
      targetElement.children.push(childNode);
    }

    function tryAssignSlotNameFromText(textValue) {
      if (!targetElement || String(targetElement.tagName || "").toLowerCase() !== "slot") {
        return false;
      }
      if (targetElement.attributes && targetElement.attributes.name) {
        return false;
      }
      const candidate = String(textValue || "").trim();
      if (!candidate) {
        return false;
      }
      if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(candidate)) {
        return false;
      }
      if (!targetElement.attributes || typeof targetElement.attributes !== "object") {
        targetElement.attributes = {};
      }
      targetElement.attributes.name = candidate;
      return true;
    }

    for (let i = 0; i < astItems.length; i += 1) {
      const item = astItems[i];
      if (registerQArrayDefinitionItem({ qArrays: qArrayContext, qObjects: qObjectContext, qModels: qModelContext, repeaterScope: repeaterScope }, item)) {
        continue;
      }
      if (registerQObjectDefinitionItem({ qArrays: qArrayContext, qObjects: qObjectContext, qModels: qModelContext, repeaterScope: repeaterScope }, item)) {
        if (String(item.name || "").trim()) {
          continue;
        }
        const objectNodes = convertAstItemToNodes(item, source, {
          qColors: colorContext,
          qStyles: styleContext,
          qArrays: qArrayContext,
          qObjects: qObjectContext,
          qModels: qModelContext,
          repeaterScope: repeaterScope,
        });
        for (let oi = 0; oi < objectNodes.length; oi += 1) {
          appendChildNode(objectNodes[oi]);
        }
        continue;
      }
      if (registerQModelDefinitionItem({ qArrays: qArrayContext, qObjects: qObjectContext, qModels: qModelContext, repeaterScope: repeaterScope }, item)) {
        continue;
      }
      if (item && (item.type === "RepeaterDefinition" || item.type === "ForDefinition")) {
        const repeatedNodes = convertAstItemToNodes(item, source, {
          qColors: colorContext,
          qStyles: styleContext,
          qArrays: qArrayContext,
          qObjects: qObjectContext,
          qModels: qModelContext,
          repeaterScope: repeaterScope,
        });
        for (let ri = 0; ri < repeatedNodes.length; ri += 1) {
          appendChildNode(repeatedNodes[ri]);
        }
        continue;
      }
      const namedTheme = resolveNamedQThemeInvocation(item, styleContext);
      if (namedTheme && Array.isArray(item.items) && item.items.length > 0) {
        const invocationContext = createScopedConversionContext({
          qColors: colorContext,
          qStyles: styleContext,
          qArrays: qArrayContext,
          qObjects: qObjectContext,
          qModels: qModelContext,
          repeaterScope: repeaterScope,
        });
        appendActiveQTheme(invocationContext.qStyles, namedTheme);
        const scopeNode = core.createElementNode({
          tagName: "q-theme-scope",
          selectorMode: "single",
          selectorChain: ["q-theme-scope"],
          attributes: {},
          children: [],
          meta: {
            generated: true,
            virtual: true,
          },
        });
        processElementItems(scopeNode, item.items, source, invocationContext);
        const scopedChildren = Array.isArray(scopeNode.children) ? scopeNode.children : [];
        for (let ci = 0; ci < scopedChildren.length; ci += 1) {
          appendChildNode(scopedChildren[ci]);
        }
        continue;
      }
      if (tryApplyNamedQThemeInvocation(item, styleContext)) {
        continue;
      }
      const namedColorSetup = resolveNamedQColorSetupInvocation(item, colorContext);
      if (namedColorSetup && Array.isArray(item.items) && item.items.length > 0) {
        const invocationContext = createScopedConversionContext({
          qColors: colorContext,
          qStyles: styleContext,
          qArrays: qArrayContext,
          qObjects: qObjectContext,
          qModels: qModelContext,
          repeaterScope: repeaterScope,
        });
        appendActiveQColorSetup(invocationContext.qColors, namedColorSetup);
        const scopeNode = core.createElementNode({
          tagName: "q-color-scope",
          selectorMode: "single",
          selectorChain: ["q-color-scope"],
          attributes: {},
          children: [],
          meta: {
            generated: true,
            virtual: true,
          },
        });
        processElementItems(scopeNode, item.items, source, invocationContext);
        const scopedChildren = Array.isArray(scopeNode.children) ? scopeNode.children : [];
        for (let ci = 0; ci < scopedChildren.length; ci += 1) {
          appendChildNode(scopedChildren[ci]);
        }
        continue;
      }
      if (tryApplyNamedQColorInvocation(item, colorContext)) {
        continue;
      }
      if (item.type === "QColorSchemaDefinition") {
        registerQColorSchemaItem(colorContext, item);
        continue;
      }
      if (item.type === "QStyleDefinition") {
        registerQStyleDefinitionItem(styleContext, item);
        continue;
      }
      if (item.type === "QThemeDefinition") {
        registerQThemeDefinitionItem(styleContext, item);
        continue;
      }
      if (item.type === "QColorDefinition") {
        registerQColorDefinitionItem(colorContext, item);
        continue;
      }
      if (item.type === "QColorThemeDefinition") {
        registerQColorThemeItem(colorContext, item);
        continue;
      }
      if (item.type === "QWasmBlock") {
        throw new Error("q-wasm is only valid inside q-component definitions.");
      }
      if (item.type === "QPropertyBlock") {
        const names = Array.isArray(item.properties) ? item.properties : [];
        if (!targetElement.meta || typeof targetElement.meta !== "object") {
          targetElement.meta = {};
        }
        if (!Array.isArray(targetElement.meta.__qhtmlDeclaredProperties)) {
          targetElement.meta.__qhtmlDeclaredProperties = [];
        }
        const seen = new Set(
          targetElement.meta.__qhtmlDeclaredProperties
            .map(normalizePropertyName)
            .filter(Boolean)
        );
        for (let j = 0; j < names.length; j += 1) {
          const propertyName = String(names[j] || "").trim();
          const normalized = normalizePropertyName(propertyName);
          if (!propertyName || !normalized || seen.has(normalized)) {
            continue;
          }
          seen.add(normalized);
          targetElement.meta.__qhtmlDeclaredProperties.push(propertyName);
        }
        continue;
      }
      if (item.type === "Element") {
        const loggerCategories = extractQLoggerCategoriesFromElement(item);
        if (loggerCategories !== null) {
          if (!targetElement.meta || typeof targetElement.meta !== "object") {
            targetElement.meta = {};
          }
          targetElement.meta.__qhtmlLoggerCategories = loggerCategories.slice();
          continue;
        }
      }
      if (item.type === "Property") {
        applyPropertyToElement(targetElement, item, {
          qArrays: qArrayContext,
          qObjects: qObjectContext,
          qModels: qModelContext,
          repeaterScope: repeaterScope,
        });
      } else if (item.type === "HtmlBlock") {
        targetElement.children.push(core.createRawHtmlNode({ html: item.html, meta: { originalSource: item.raw } }));
      } else if (item.type === "TextBlock") {
        if (tryAssignSlotNameFromText(item.text)) {
          continue;
        }
        appendTextChildNode(targetElement, item.text, {
          originalSource: item.raw || null,
          sourceRange:
            typeof item.start === "number" && typeof item.end === "number"
              ? [item.start, item.end]
              : null,
        });
      } else if (item.type === "StyleBlock") {
        if (
          targetElement.meta &&
          Array.isArray(targetElement.meta.qColorAssignments) &&
          targetElement.meta.qColorAssignments.length > 0
        ) {
          const existingBase = String(targetElement.meta.qColorBaseStyle || "").trim();
          const incomingBase = String(item.css || "").trim();
          targetElement.meta.qColorBaseStyle = composeStyleFromBaseAndDeclarations(existingBase, [incomingBase]);
          applyQColorAssignmentsToElementNode(targetElement, colorContext);
        } else {
          mergeStyleAttribute(targetElement, item.css);
        }
      } else if (item.type === "QColorApplyBlock") {
        if (!targetElement.meta || typeof targetElement.meta !== "object") {
          targetElement.meta = {};
        }
        if (!Array.isArray(targetElement.meta.qColorAssignments)) {
          targetElement.meta.qColorAssignments = [];
        }
        if (!Array.isArray(targetElement.meta.qColorAreas)) {
          targetElement.meta.qColorAreas = [];
        }
        if (typeof targetElement.meta.qColorBaseStyle !== "string") {
          targetElement.meta.qColorBaseStyle = String(targetElement.attributes && targetElement.attributes.style || "").trim();
        }
        targetElement.meta.qColorAssignments.push(cloneQColorAssignments(item.assignments));
        if (Array.isArray(item.areas)) {
          targetElement.meta.qColorAreas.push(item.areas.slice());
        }
        applyQColorAssignmentsToElementNode(targetElement, colorContext);
      } else if (item.type === "RawTextLine") {
        if (tryAssignSlotNameFromText(item.text)) {
          continue;
        }
        appendTextChildNode(targetElement, item.text, {
          originalSource: item.raw || null,
          sourceRange:
            typeof item.start === "number" && typeof item.end === "number"
              ? [item.start, item.end]
              : null,
        });
      } else if (item.type === "BareWord") {
        if (targetElement.tagName === "slot" && !targetElement.attributes.name) {
          targetElement.attributes.name = item.name;
        } else {
          appendTextChildNode(targetElement, item.name, {
            originalSource: item.raw || null,
            sourceRange:
              typeof item.start === "number" && typeof item.end === "number"
                ? [item.start, item.end]
                : null,
          });
        }
      } else if (item.type === "EventBlock") {
        const key = String(item.name || "");
        const script = compactScriptBody(item.script || "");
        if (item.isLifecycle) {
          if (!Array.isArray(targetElement.lifecycleScripts)) {
            targetElement.lifecycleScripts = [];
          }
          targetElement.lifecycleScripts.push({
            name: key,
            body: script,
          });
        } else {
          targetElement.attributes[key] = script;
        }
      } else if (item.type === "QConnectDefinition") {
        const connectBody = buildQConnectLifecycleBody(item);
        if (connectBody) {
          if (!Array.isArray(targetElement.lifecycleScripts)) {
            targetElement.lifecycleScripts = [];
          }
          targetElement.lifecycleScripts.push({
            name: "onready",
            body: compactScriptBody(connectBody),
          });
        }
      } else if (item.type === "QScriptInline") {
        const resolved = tryResolveStaticQScript(item.script || "");
        if (resolved === null) {
          if (!Array.isArray(targetElement.inlineQScripts)) {
            targetElement.inlineQScripts = [];
          }
          targetElement.inlineQScripts.push({
            script: item.script,
            raw: item.raw,
          });
          continue;
        }

        if (looksLikeQHtmlSnippet(resolved)) {
          const nestedAst = parseQHtmlToAst(resolved);
          for (let j = 0; j < nestedAst.body.length; j += 1) {
            const nestedNodes = convertAstItemToNodes(
              nestedAst.body[j],
              resolved,
            createScopedConversionContext({
              qColors: colorContext,
              qStyles: styleContext,
              qArrays: qArrayContext,
              qObjects: qObjectContext,
              qModels: qModelContext,
              repeaterScope: repeaterScope,
            })
            );
            for (let ni = 0; ni < nestedNodes.length; ni += 1) {
              appendChildNode(nestedNodes[ni]);
            }
          }
        } else {
          appendTextChildNode(targetElement, resolved, {
            originalSource: item.raw || null,
            sourceRange:
              typeof item.start === "number" && typeof item.end === "number"
                ? [item.start, item.end]
                : null,
          });
        }
      } else {
        const childNodes = convertAstItemToNodes(
          item,
          source,
          createScopedConversionContext({
            qColors: colorContext,
            qStyles: styleContext,
            qArrays: qArrayContext,
            qObjects: qObjectContext,
            qModels: qModelContext,
            repeaterScope: repeaterScope,
          })
        );
        for (let ci = 0; ci < childNodes.length; ci += 1) {
          appendChildNode(childNodes[ci]);
        }
      }
    }
  }

  function resolveComponentIdExpression(expr, fallback) {
    if (!expr || typeof expr !== "object") {
      return String(fallback || "");
    }
    if (expr.type === "IdentifierExpression") {
      return String(expr.identifier || fallback || "").trim();
    }
    if (expr.type === "QScriptExpression") {
      const resolved = tryResolveStaticQScript(expr.script || "");
      return String(resolved || fallback || "").trim();
    }
    return String(fallback || "").trim();
  }

  function markPropertyBindingNode(node, propertyName) {
    if (!node || typeof node !== "object") {
      return;
    }
    if (!node.meta || typeof node.meta !== "object") {
      node.meta = {};
    }
    node.meta.__qhtmlPropertyBindingName = String(propertyName || "").trim();
  }

  function applyKeywordAliasesToNode(node, keywordMap) {
    if (!node || typeof node !== "object") {
      return;
    }
    if (!keywordMap || typeof keywordMap !== "object" || Array.isArray(keywordMap)) {
      return;
    }
    const keys = Object.keys(keywordMap);
    if (keys.length === 0) {
      return;
    }
    const mapped = {};
    for (let i = 0; i < keys.length; i += 1) {
      const key = String(keys[i] || "").trim();
      const value = String(keywordMap[key] || "").trim();
      if (!key || !value) {
        continue;
      }
      mapped[key] = value;
    }
    if (Object.keys(mapped).length > 0) {
      node.keywords = mapped;
    }
  }

  function buildComponentNodeFromAst(astNode, source, options, context) {
    const opts = options || {};
    const scopedContext = createScopedConversionContext(context);
    const colorContext = scopedContext.qColors;
    const styleContext = scopedContext.qStyles;
    const qArrayContext = scopedContext.qArrays;
    const qObjectContext = scopedContext.qObjects;
    const qModelContext = scopedContext.qModels;
    const repeaterScope = scopedContext.repeaterScope;
    const componentAttributes = {};
    const componentProperties = [];
    const componentPropertiesSeen = new Set();
    const templateNodes = [];
    const propertyDefinitions = [];
    const methods = [];
    const signalDeclarations = [];
    const callbackDeclarations = [];
    const aliasDeclarations = [];
    let componentLoggerCategories = null;
    let wasmConfig = null;
    const lifecycleScripts = [];
    const requestedDefinitionType = String(opts.definitionType || "component").trim().toLowerCase() || "component";
    const definitionType =
      requestedDefinitionType === "template"
        ? "template"
        : requestedDefinitionType === "signal"
          ? "signal"
          : requestedDefinitionType === "worker"
            ? "worker"
            : "component";
    const supportsRuntimeDefinition = definitionType === "component" || definitionType === "worker";
    let componentId = String(opts.componentId || "").trim();
    const extendsComponentIds = [];
    const rawExtendsList = Array.isArray(opts.extendsComponentIds) ? opts.extendsComponentIds : [];
    for (let ei = 0; ei < rawExtendsList.length; ei += 1) {
      const inheritedId = String(rawExtendsList[ei] || "").trim();
      if (!inheritedId) {
        continue;
      }
      extendsComponentIds.push(inheritedId);
    }
    if (extendsComponentIds.length === 0) {
      const legacyExtendsId = String(opts.extendsComponentId || "").trim();
      if (legacyExtendsId) {
        extendsComponentIds.push(legacyExtendsId);
      }
    }
    const inheritedRepeaterKeyword =
      definitionType === "component" ? readExtendsKeywordRepeaterHint(extendsComponentIds) : "";
    const canCaptureInheritedRepeaterOverrides =
      definitionType === "component" && extendsComponentIds.length > 0;
    let inheritedRepeaterSlotName = "item";
    let inheritedRepeaterExplicitSlot = false;
    let inheritedRepeaterExplicitModel = false;
    const inheritedRepeaterModelItems = [];
    const inheritedRepeaterModelSourceParts = [];

    const items = Array.isArray(astNode.items) ? astNode.items : [];
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (canCaptureInheritedRepeaterOverrides && item && typeof item === "object") {
        if (item.type === "Element") {
          const selectors = Array.isArray(item.selectors) ? item.selectors : [];
          const selectorLower = selectors.length === 1 ? String(selectors[0] || "").trim().toLowerCase() : "";
          if (selectorLower === "as" || selectorLower === "slot") {
            const alias = selectorLower === "as" ? readModelViewAlias(item) : readRepeaterSlotAlias(item);
            if (alias) {
              inheritedRepeaterSlotName = alias;
              inheritedRepeaterExplicitSlot = true;
            }
            if (inheritedRepeaterKeyword) {
              continue;
            }
          }
          if (selectorLower === "q-model" || selectorLower === "model") {
            const inlineModelItems = Array.isArray(item.items) ? item.items : [];
            for (let mi = 0; mi < inlineModelItems.length; mi += 1) {
              inheritedRepeaterModelItems.push(inlineModelItems[mi]);
            }
            const inlineModelSource = String(item.raw || "").trim();
            if (inlineModelSource) {
              inheritedRepeaterModelSourceParts.push(inlineModelSource);
            }
            inheritedRepeaterExplicitModel = true;
            if (inheritedRepeaterKeyword) {
              continue;
            }
          }
        }
        if (item.type === "QModelDefinition") {
          if (String(item.name || "").trim()) {
            registerQModelDefinitionItem(scopedContext, item);
          } else {
            const anonymousItems = Array.isArray(item.items) ? item.items : [];
            for (let mi = 0; mi < anonymousItems.length; mi += 1) {
              inheritedRepeaterModelItems.push(anonymousItems[mi]);
            }
            const rawModelSource = String(item.raw || "").trim();
            if (rawModelSource) {
              inheritedRepeaterModelSourceParts.push(rawModelSource);
            }
            inheritedRepeaterExplicitModel = true;
          }
          if (inheritedRepeaterKeyword) {
            continue;
          }
        }
      }
      if (registerQArrayDefinitionItem(scopedContext, item)) {
        continue;
      }
      if (registerQObjectDefinitionItem(scopedContext, item)) {
        if (String(item.name || "").trim()) {
          continue;
        }
        const anonymousObjectNodes = convertAstItemToNodes(item, source, scopedContext);
        for (let ai = 0; ai < anonymousObjectNodes.length; ai += 1) {
          templateNodes.push(anonymousObjectNodes[ai]);
        }
        continue;
      }
      if (registerQModelDefinitionItem(scopedContext, item)) {
        continue;
      }
      if (item && (item.type === "RepeaterDefinition" || item.type === "ForDefinition")) {
        const repeatedNodes = convertAstItemToNodes(item, source, scopedContext);
        for (let ri = 0; ri < repeatedNodes.length; ri += 1) {
          templateNodes.push(repeatedNodes[ri]);
        }
        continue;
      }
      const namedTheme = resolveNamedQThemeInvocation(item, styleContext);
      if (namedTheme && Array.isArray(item.items) && item.items.length > 0) {
        const invocationContext = createScopedConversionContext({
          qColors: colorContext,
          qStyles: styleContext,
          qArrays: qArrayContext,
          qObjects: qObjectContext,
          qModels: qModelContext,
          repeaterScope: repeaterScope,
        });
        appendActiveQTheme(invocationContext.qStyles, namedTheme);
        const scopeNode = core.createElementNode({
          tagName: "q-theme-scope",
          selectorMode: "single",
          selectorChain: ["q-theme-scope"],
          attributes: {},
          children: [],
          meta: {
            generated: true,
            virtual: true,
          },
        });
        processElementItems(scopeNode, item.items, source, invocationContext);
        const scopedChildren = Array.isArray(scopeNode.children) ? scopeNode.children : [];
        for (let ci = 0; ci < scopedChildren.length; ci += 1) {
          templateNodes.push(scopedChildren[ci]);
        }
        continue;
      }
      if (tryApplyNamedQThemeInvocation(item, styleContext)) {
        continue;
      }
      const namedColorSetup = resolveNamedQColorSetupInvocation(item, colorContext);
      if (namedColorSetup && Array.isArray(item.items) && item.items.length > 0) {
        const invocationContext = createScopedConversionContext({
          qColors: colorContext,
          qStyles: styleContext,
          qArrays: qArrayContext,
          qObjects: qObjectContext,
          qModels: qModelContext,
          repeaterScope: repeaterScope,
        });
        appendActiveQColorSetup(invocationContext.qColors, namedColorSetup);
        const scopeNode = core.createElementNode({
          tagName: "q-color-scope",
          selectorMode: "single",
          selectorChain: ["q-color-scope"],
          attributes: {},
          children: [],
          meta: {
            generated: true,
            virtual: true,
          },
        });
        processElementItems(scopeNode, item.items, source, invocationContext);
        const scopedChildren = Array.isArray(scopeNode.children) ? scopeNode.children : [];
        for (let ci = 0; ci < scopedChildren.length; ci += 1) {
          templateNodes.push(scopedChildren[ci]);
        }
        continue;
      }
      if (tryApplyNamedQColorInvocation(item, colorContext)) {
        continue;
      }
      if (item.type === "QColorSchemaDefinition") {
        registerQColorSchemaItem(colorContext, item);
        continue;
      }
      if (item.type === "QStyleDefinition") {
        registerQStyleDefinitionItem(styleContext, item);
        continue;
      }
      if (item.type === "QThemeDefinition") {
        registerQThemeDefinitionItem(styleContext, item);
        continue;
      }
      if (item.type === "QColorDefinition") {
        registerQColorDefinitionItem(colorContext, item);
        continue;
      }
      if (item.type === "QColorThemeDefinition") {
        registerQColorThemeItem(colorContext, item);
        continue;
      }
      if (item.type === "QPropertyBlock") {
        const names = Array.isArray(item.properties) ? item.properties : [];
        for (let j = 0; j < names.length; j += 1) {
          const propertyName = String(names[j] || "").trim();
          const normalized = normalizePropertyName(propertyName);
          if (!propertyName || !normalized || componentPropertiesSeen.has(normalized)) {
            continue;
          }
          componentPropertiesSeen.add(normalized);
          componentProperties.push(propertyName);
        }
        continue;
      }
      if (item.type === "Element") {
        const loggerCategories = extractQLoggerCategoriesFromElement(item);
        if (loggerCategories !== null) {
          componentLoggerCategories = loggerCategories.slice();
          continue;
        }
      }
      if (item.type === "Property") {
        const assignment = parseAssignmentName(item.name);
        const key = normalizePropertyName(assignment.name);
        const value = resolveScopedPropertyValueReferences(
          coercePropertyValue(item.value),
          {
            qArrays: qArrayContext,
            qObjects: qObjectContext,
            qModels: qModelContext,
            repeaterScope: repeaterScope,
          },
          null
        );
        if (key === "id" && !componentId) {
          componentId = String(value || "").trim();
        } else {
          componentAttributes[assignment.name] = value;
        }
        continue;
      }
      if (item.type === "PropertyDefinitionBlock") {
        if (supportsRuntimeDefinition) {
          const propertyName = String(item.name || "").trim();
          const normalized = normalizePropertyName(propertyName);
          if (propertyName && normalized && !componentPropertiesSeen.has(normalized)) {
            componentPropertiesSeen.add(normalized);
            componentProperties.push(propertyName);
          }
          const propertyNodes = [];
          const nestedItems = Array.isArray(item.items) ? item.items : [];
          for (let j = 0; j < nestedItems.length; j += 1) {
            const resolvedNodes = convertAstItemToNodes(nestedItems[j], source, scopedContext);
            for (let ni = 0; ni < resolvedNodes.length; ni += 1) {
              const propertyNode = resolvedNodes[ni];
              if (!propertyNode) {
                continue;
              }
              if (propertyName) {
                markPropertyBindingNode(propertyNode, propertyName);
              }
              propertyNodes.push(propertyNode);
            }
          }
          const declarationMeta = createDeclarationMeta({
            declarationKind: "q-property",
            declarationName: propertyName,
          });
          propertyDefinitions.push({
            name: propertyName,
            nodes: propertyNodes,
            uuid: declarationMeta.uuid,
            meta: declarationMeta,
          });
        }
        continue;
      }
      if (item.type === "HtmlBlock") {
        templateNodes.push(core.createRawHtmlNode({ html: item.html, meta: { originalSource: item.raw } }));
        continue;
      }
      if (item.type === "ImportBlock") {
        continue;
      }
      if (item.type === "FunctionBlock") {
        if (supportsRuntimeDefinition) {
          methods.push({
            name: String(item.name || "").trim(),
            signature: String(item.signature || "").trim(),
            parameters: String(item.parameters || "").trim(),
            body: compactScriptBody(item.body || ""),
          });
        }
        continue;
      }
      if (item.type === "SignalDeclaration") {
        if (supportsRuntimeDefinition) {
          const signalName = String(item.name || "").trim();
          if (signalName) {
            const declarationMeta = createDeclarationMeta({
              declarationKind: "q-signal",
              declarationName: signalName,
            });
            signalDeclarations.push({
              name: signalName,
              signature: String(item.signature || "").trim(),
              parameters: Array.isArray(item.parameters) ? item.parameters.slice() : [],
              uuid: declarationMeta.uuid,
              meta: declarationMeta,
            });
          }
        }
        continue;
      }
      if (item.type === "CallbackDeclaration") {
        if (supportsRuntimeDefinition) {
          const callbackName = String(item.name || "").trim();
          if (callbackName) {
            const declarationMeta = createDeclarationMeta({
              declarationKind: "q-callback",
              declarationName: callbackName,
            });
            callbackDeclarations.push({
              name: callbackName,
              signature: String(item.signature || "").trim(),
              parameters: Array.isArray(item.parameters) ? item.parameters.slice() : [],
              body: compactScriptBody(item.body || ""),
              uuid: declarationMeta.uuid,
              meta: declarationMeta,
            });
          }
        }
        continue;
      }
      if (item.type === "AliasDeclaration") {
        if (supportsRuntimeDefinition) {
          const aliasName = String(item.name || "").trim();
          if (aliasName) {
            aliasDeclarations.push({
              name: aliasName,
              body: compactScriptBody(item.body || ""),
            });
          }
        }
        continue;
      }
      if (item.type === "QWasmBlock") {
        if (definitionType !== "component") {
          throw new Error("q-wasm is only valid inside q-component definitions.");
        }
        const parsed =
          item.config && typeof item.config === "object" && !Array.isArray(item.config)
            ? item.config
            : parseQWasmConfig("", null);
        const exportList = Array.isArray(parsed.exports) ? parsed.exports.slice() : [];
        const allowImportsList = Array.isArray(parsed.allowImports) ? parsed.allowImports.slice() : [];
        const bindList = Array.isArray(parsed.bind) ? parsed.bind.slice() : [];
        wasmConfig = {
          src: String(parsed.src || "").trim(),
          mode: String(parsed.mode || "").trim(),
          awaitWasm: typeof parsed.awaitWasm === "boolean" ? parsed.awaitWasm : null,
          timeoutMs: Number.isFinite(parsed.timeoutMs) ? Number(parsed.timeoutMs) : null,
          maxPayloadBytes: Number.isFinite(parsed.maxPayloadBytes) ? Number(parsed.maxPayloadBytes) : null,
          exports: exportList,
          allowImports: allowImportsList,
          bind: bindList,
        };
        continue;
      }
      if (item.type === "EventBlock") {
        if (supportsRuntimeDefinition && item.isLifecycle) {
          lifecycleScripts.push({
            name: String(item.name || "").trim(),
            body: compactScriptBody(item.script || ""),
          });
          continue;
        }
        if (supportsRuntimeDefinition) {
          const eventName = String(item.name || "").trim();
          if (eventName) {
            componentAttributes[eventName] = compactScriptBody(item.script || "");
          }
        }
        continue;
      }
      if (item.type === "QConnectDefinition") {
        if (supportsRuntimeDefinition) {
          const connectBody = buildQConnectLifecycleBody(item);
          if (connectBody) {
            lifecycleScripts.push({
              name: "onready",
              body: compactScriptBody(connectBody),
            });
          }
        }
        continue;
      }
      const nodes = convertAstItemToNodes(item, source, scopedContext);
      for (let ni = 0; ni < nodes.length; ni += 1) {
        templateNodes.push(nodes[ni]);
      }
    }

    const componentNode = core.createComponentNode({
      componentId: componentId,
      extendsComponentIds: extendsComponentIds,
      extendsComponentId: extendsComponentIds.length > 0 ? extendsComponentIds[0] : "",
      definitionType: definitionType,
      templateNodes: templateNodes,
      methods: methods,
      propertyDefinitions: propertyDefinitions,
      signalDeclarations: signalDeclarations,
      callbackDeclarations: callbackDeclarations,
      aliasDeclarations: aliasDeclarations,
      wasmConfig: wasmConfig,
      lifecycleScripts: lifecycleScripts,
      attributes: componentAttributes,
      properties: componentProperties,
      meta: {
        originalSource: astNode.raw,
        sourceRange: [astNode.start, astNode.end],
      },
    });
    if (componentLoggerCategories !== null) {
      if (!componentNode.meta || typeof componentNode.meta !== "object") {
        componentNode.meta = {};
      }
      componentNode.meta.__qhtmlLoggerCategories = componentLoggerCategories.slice();
    }
    if (
      definitionType === "component" &&
      (inheritedRepeaterKeyword || inheritedRepeaterExplicitModel || inheritedRepeaterExplicitSlot)
    ) {
      const resolvedEntries = resolveRepeaterModelEntries(inheritedRepeaterModelItems, scopedContext, astNode);
      for (let i = 0; i < resolvedEntries.length; i += 1) {
        resolvedEntries[i] = normalizeRepeaterModelEntry(resolvedEntries[i], source, scopedContext);
      }
      if (!componentNode.meta || typeof componentNode.meta !== "object") {
        componentNode.meta = {};
      }
      componentNode.meta.__qhtmlInheritedRepeaterConfig = {
        keyword: String(inheritedRepeaterKeyword || "").trim().toLowerCase(),
        slotName: String(inheritedRepeaterSlotName || "item").trim() || "item",
        aliasNames: [String(inheritedRepeaterSlotName || "item").trim() || "item"],
        explicitSlot: !!inheritedRepeaterExplicitSlot,
        explicitModel: !!inheritedRepeaterExplicitModel,
        modelEntries: resolvedEntries,
        modelSource: inheritedRepeaterModelSourceParts.join("\n").trim(),
      };
    }
    applyKeywordAliasesToNode(componentNode, astNode.keywords);
    return componentNode;
  }

  function applyQCanvasSemanticsToElementNode(elementNode, canvasNameHint) {
    const node = elementNode && typeof elementNode === "object" ? elementNode : null;
    if (!node) {
      return false;
    }
    const tag = String(node.tagName || "").trim().toLowerCase();
    if (tag !== "q-canvas") {
      return false;
    }
    if (!node.attributes || typeof node.attributes !== "object") {
      node.attributes = {};
    }
    node.tagName = "canvas";
    if (Array.isArray(node.selectorChain) && node.selectorChain.length > 0) {
      node.selectorChain = node.selectorChain.map(function mapSelectorToken(token) {
        const raw = String(token || "").trim();
        return raw.toLowerCase() === "q-canvas" ? "canvas" : raw;
      });
    } else {
      node.selectorChain = ["canvas"];
    }
    node.attributes["q-canvas"] = "1";
    const canvasName = String(canvasNameHint || "").trim();
    if (canvasName) {
      node.attributes["q-canvas-name"] = canvasName;
    }
    const widthValue = Number(node.attributes.width);
    const heightValue = Number(node.attributes.height);
    const onPaintSource = String(node.attributes.onpaint || "").trim();
    if (!node.meta || typeof node.meta !== "object") {
      node.meta = {};
    }
    node.meta.__qhtmlCanvasConfig = {
      name: canvasName,
      width: Number.isFinite(widthValue) && widthValue > 0 ? Math.floor(widthValue) : 0,
      height: Number.isFinite(heightValue) && heightValue > 0 ? Math.floor(heightValue) : 0,
      onPaint: onPaintSource,
    };
    return true;
  }

  function buildElementFromAst(astElement, source, context) {
    const scopedContext = createScopedConversionContext(context);
    const colorContext = scopedContext.qColors;
    const styleContext = scopedContext.qStyles;
    const selectors = astElement.selectors.map((entry) => String(entry).trim()).filter(Boolean);
    const prefixDirectives = Array.isArray(astElement.prefixDirectives) ? astElement.prefixDirectives.slice() : [];
    if (selectors.length === 0) {
      throw new Error("Element with empty selector list cannot be converted.");
    }

    if (selectors.length === 1) {
      const definitionSelector = selectors[0].toLowerCase();
      if (definitionSelector === "q-component" || definitionSelector === "q-worker") {
        return buildComponentNodeFromAst(astElement, source, {
          definitionType: definitionSelector === "q-worker" ? "worker" : "component",
        }, scopedContext);
      }
    }

    if (selectors.length === 1) {
      const modelViewSelectorToken = parseTagToken(selectors[0]);
      if (MODEL_VIEW_KEYWORDS.has(String(modelViewSelectorToken.tag || "").toLowerCase())) {
        return buildModelViewNodeFromAst(astElement, source, scopedContext);
      }
    }

    const selectorTokens = [];
    const selectorSources = [];
    const selectorSetupScopes = [];
    const selectorStyleScopes = [];
    const selectorThemeScopes = [];
    const pendingSetups = [];
    const pendingStyles = [];
    const pendingThemes = [];
    for (let si = 0; si < selectors.length; si += 1) {
      const selectorSource = selectors[si];
      const parsedToken = parseTagToken(selectorSource);
      const hasFragments = !!parsedToken.id || (Array.isArray(parsedToken.classes) && parsedToken.classes.length > 0);
      if (!hasFragments) {
        const namedTheme = lookupQThemeDefinition(styleContext, selectorSource);
        if (namedTheme) {
          pendingThemes.push(namedTheme);
          continue;
        }
        const namedStyle = lookupQStyleDefinition(styleContext, selectorSource);
        if (namedStyle) {
          pendingStyles.push(namedStyle);
          continue;
        }
        const namedSetup = lookupQColorDefinition(colorContext, selectorSource);
        if (namedSetup) {
          pendingSetups.push(namedSetup);
          continue;
        }
      }
      selectorTokens.push(parsedToken);
      selectorSources.push(selectorSource);
      selectorSetupScopes.push(pendingSetups.map(cloneQColorSetup));
      selectorStyleScopes.push(pendingStyles.map(cloneQStyleDefinition));
      selectorThemeScopes.push(pendingThemes.map(cloneQThemeDefinition));
      pendingStyles.length = 0;
      pendingThemes.length = 0;
    }
    const trailingChildStyles = pendingStyles.map(cloneQStyleDefinition);
    if (selectorTokens.length === 0) {
      if (trailingChildStyles.length > 0) {
        const childItems = Array.isArray(astElement.items) ? astElement.items : [];
        let hasElementChild = false;
        for (let i = 0; i < childItems.length; i += 1) {
          const item = childItems[i];
          if (!item || typeof item !== "object") {
            continue;
          }
          if (item.type === "Element" || item.type === "ComponentDefinition" || item.type === "TemplateDefinition") {
            hasElementChild = true;
            break;
          }
        }
        if (!hasElementChild && typeof console !== "undefined" && console && typeof console.warn === "function") {
          const styleNames = trailingChildStyles
            .map(function mapStyleName(entry) { return String(entry && entry.name || "").trim(); })
            .filter(Boolean);
          console.warn(
            "qhtml q-style warning: cannot apply q-style to a text-only block without element children",
            { styles: styleNames, selector: selectors.slice() }
          );
        }
      }
      return null;
    }
    const selectorMode = detectSelectorMode(selectorTokens);
    const instanceAlias = String(astElement && astElement.instanceAlias || "").trim();

    if (selectorMode === "class-shorthand") {
      const last = selectorTokens[selectorTokens.length - 1];
      const leaf = createElementFromToken(
        last,
        "class-shorthand",
        selectorSources,
        [astElement.start, astElement.end],
        astElement.raw
      );
      const classNames = selectorTokens.slice(0, selectorTokens.length - 1).map((token) => token.raw).filter(Boolean);
      if (classNames.length > 0) {
        leaf.attributes.class = core.mergeClasses(leaf.attributes.class, classNames);
      }
      if (prefixDirectives.length > 0) {
        leaf.slotDirectives = prefixDirectives;
      }
      const classScopeSetups = selectorSetupScopes.length > 0 ? selectorSetupScopes[selectorSetupScopes.length - 1] : [];
      const classScopeStyles = selectorStyleScopes.length > 0 ? selectorStyleScopes[selectorStyleScopes.length - 1] : [];
      const classScopeThemes = selectorThemeScopes.length > 0 ? selectorThemeScopes[selectorThemeScopes.length - 1] : [];
      const leafContext = createScopedConversionContext(scopedContext);
      leafContext.qStyleChildScope = trailingChildStyles.map(cloneQStyleDefinition);
      for (let i = 0; i < classScopeSetups.length; i += 1) {
        appendActiveQColorSetup(leafContext.qColors, classScopeSetups[i]);
      }
      for (let i = 0; i < classScopeThemes.length; i += 1) {
        appendActiveQTheme(leafContext.qStyles, classScopeThemes[i]);
      }
      for (let i = 0; i < classScopeStyles.length; i += 1) {
        applyQStyleToElementNode(leaf, classScopeStyles[i]);
      }
      applyActiveQThemesToElementNode(leaf, leafContext.qStyles);
      attachRuntimeThemeRulesToElementNode(leaf, leafContext.qStyles);
      processElementItems(leaf, astElement.items, source, leafContext);
      const canvasApplied = applyQCanvasSemanticsToElementNode(leaf, instanceAlias);
      applyKeywordAliasesToNode(leaf, astElement.keywords);
      if (instanceAlias && !canvasApplied) {
        if (!leaf.meta || typeof leaf.meta !== "object") {
          leaf.meta = {};
        }
        leaf.meta.__qhtmlInstanceAlias = instanceAlias;
      }
      return leaf;
    }

    const chain = selectorTokens.map(function build(token, index) {
      return createElementFromToken(
        token,
        index === 0 && selectorTokens.length > 1 ? "nest" : "single",
        index === 0 ? selectorSources : [selectorSources[index]],
        index === 0 ? [astElement.start, astElement.end] : null,
        index === 0 ? astElement.raw : null
      );
    });

    for (let i = 0; i < chain.length - 1; i += 1) {
      chain[i].children.push(chain[i + 1]);
    }
    for (let i = 0; i < chain.length; i += 1) {
      const nodeContext = createQColorContext(colorContext);
      const setupsForNode = Array.isArray(selectorSetupScopes[i]) ? selectorSetupScopes[i] : [];
      for (let si = 0; si < setupsForNode.length; si += 1) {
        appendActiveQColorSetup(nodeContext, setupsForNode[si]);
      }
      applyActiveQColorSetupsToElementNode(chain[i], nodeContext);
      const stylesForNode = Array.isArray(selectorStyleScopes[i]) ? selectorStyleScopes[i] : [];
      const themesForNode = Array.isArray(selectorThemeScopes[i]) ? selectorThemeScopes[i] : [];
      for (let ssi = 0; ssi < stylesForNode.length; ssi += 1) {
        applyQStyleToElementNode(chain[i], stylesForNode[ssi]);
      }
      const nodeStyleContext = createQStyleContext(styleContext);
      for (let tsi = 0; tsi < themesForNode.length; tsi += 1) {
        appendActiveQTheme(nodeStyleContext, themesForNode[tsi]);
      }
      applyActiveQThemesToElementNode(chain[i], nodeStyleContext);
      attachRuntimeThemeRulesToElementNode(chain[i], nodeStyleContext);
      applyKeywordAliasesToNode(chain[i], astElement.keywords);
    }

    const leaf = chain[chain.length - 1];
    if (prefixDirectives.length > 0) {
      leaf.slotDirectives = prefixDirectives;
    }
    const leafContext = createScopedConversionContext(scopedContext);
    leafContext.qStyleChildScope = trailingChildStyles.map(cloneQStyleDefinition);
    const setupsForLeaf = Array.isArray(selectorSetupScopes[selectorSetupScopes.length - 1])
      ? selectorSetupScopes[selectorSetupScopes.length - 1]
      : [];
    const themesForLeaf = Array.isArray(selectorThemeScopes[selectorThemeScopes.length - 1])
      ? selectorThemeScopes[selectorThemeScopes.length - 1]
      : [];
    for (let si = 0; si < setupsForLeaf.length; si += 1) {
      appendActiveQColorSetup(leafContext.qColors, setupsForLeaf[si]);
    }
    for (let ti = 0; ti < themesForLeaf.length; ti += 1) {
      appendActiveQTheme(leafContext.qStyles, themesForLeaf[ti]);
    }
    processElementItems(leaf, astElement.items, source, leafContext);
    const canvasApplied = applyQCanvasSemanticsToElementNode(leaf, instanceAlias);
    if (instanceAlias && !canvasApplied) {
      if (!leaf.meta || typeof leaf.meta !== "object") {
        leaf.meta = {};
      }
      leaf.meta.__qhtmlInstanceAlias = instanceAlias;
    }

    return chain[0];
  }

  function convertAstItemToNode(item, source, context) {
    if (!item || typeof item !== "object") {
      return null;
    }

    if (item.type === "QArrayDefinition" || item.type === "QObjectDefinition" || item.type === "QModelDefinition") {
      return null;
    }

    if (item.type === "Element") {
      return buildElementFromAst(item, source, context);
    }

    if (item.type === "TemplateDefinition") {
      return buildComponentNodeFromAst(item, source, {
        componentId: item.templateId,
        definitionType: "template",
      }, context);
    }

    if (item.type === "SignalDefinition") {
      return buildComponentNodeFromAst(item, source, {
        componentId: item.signalId,
        definitionType: "signal",
      }, context);
    }

    if (item.type === "ComponentDefinition") {
      const componentId = resolveComponentIdExpression(item.componentIdExpression, "");
      const extendsComponentIds = [];
      const extendsExprList = Array.isArray(item.extendsComponentIdExpressions)
        ? item.extendsComponentIdExpressions
        : item.extendsComponentIdExpression
          ? [item.extendsComponentIdExpression]
          : [];
      for (let ei = 0; ei < extendsExprList.length; ei += 1) {
        const resolvedExtendsId = resolveComponentIdExpression(extendsExprList[ei], "");
        if (resolvedExtendsId) {
          extendsComponentIds.push(resolvedExtendsId);
        }
      }
      return buildComponentNodeFromAst(item, source, {
        componentId: componentId,
        extendsComponentIds: extendsComponentIds,
        extendsComponentId: extendsComponentIds.length > 0 ? extendsComponentIds[0] : "",
        definitionType: String(item.definitionType || "component").trim().toLowerCase() || "component",
      }, context);
    }

    if (item.type === "RepeaterDefinition") {
      return buildRepeaterNodeFromAst(item, source, context);
    }

    if (item.type === "ForDefinition") {
      return buildForNodeFromAst(item, source, context);
    }

    if (item.type === "QCanvasDefinition") {
      const canvasNode = buildQCanvasKeywordNode(item);
      applyKeywordAliasesToNode(canvasNode, item.keywords);
      return canvasNode;
    }

    if (item.type === "CallbackDeclaration") {
      const callbackName = String(item.name || "").trim();
      const callbackNode = {
        kind: "callback",
        callbackId: callbackName,
        name: callbackName,
        signature: String(item.signature || "").trim(),
        parameters: Array.isArray(item.parameters) ? item.parameters.slice() : [],
        body: compactScriptBody(item.body || ""),
        meta: {
          originalSource: item.raw,
          sourceRange:
            typeof item.start === "number" && typeof item.end === "number"
              ? [item.start, item.end]
              : null,
        },
      };
      applyKeywordAliasesToNode(callbackNode, item.keywords);
      return callbackNode;
    }

    if (item.type === "HtmlBlock") {
      const htmlNode = core.createRawHtmlNode({
        html: item.html,
        meta: {
          originalSource: item.raw,
          sourceRange: [item.start, item.end],
        },
      });
      applyKeywordAliasesToNode(htmlNode, item.keywords);
      return htmlNode;
    }

    if (item.type === "StyleBlock") {
      const styleElement = core.createElementNode({
        tagName: "style",
        selectorMode: "single",
        selectorChain: ["style"],
        meta: {
          originalSource: item.raw,
          sourceRange: [item.start, item.end],
        },
      });
      styleElement.textContent = String(item.css || "").trim();
      applyKeywordAliasesToNode(styleElement, item.keywords);
      return styleElement;
    }

    if (item.type === "TextBlock" || item.type === "RawTextLine" || item.type === "BareWord") {
      const textNode = createTextContentNode(item.type === "TextBlock" ? String(item.text || "") : String(item.text || item.name || ""), {
        originalSource: item.raw || null,
        sourceRange:
          typeof item.start === "number" && typeof item.end === "number"
            ? [item.start, item.end]
            : null,
      });
      applyKeywordAliasesToNode(textNode, item.keywords);
      return textNode;
    }

    if (item.type === "QWasmBlock") {
      throw new Error("q-wasm is only valid inside q-component definitions.");
    }

    return null;
  }

  function convertAstItemToNodes(item, source, context) {
    if (!item || typeof item !== "object") {
      return [];
    }

    if (item.type === "QArrayDefinition") {
      registerQArrayDefinitionItem(context, item);
      return [];
    }

    if (item.type === "QObjectDefinition") {
      registerQObjectDefinitionItem(context, item);
      if (String(item.name || "").trim()) {
        return [];
      }
      const out = [];
      const nestedItems = Array.isArray(item.items) ? item.items : [];
      for (let i = 0; i < nestedItems.length; i += 1) {
        const nestedNodes = convertAstItemToNodes(nestedItems[i], source, context);
        for (let j = 0; j < nestedNodes.length; j += 1) {
          out.push(nestedNodes[j]);
        }
      }
      return out;
    }

    if (item.type === "QModelDefinition") {
      registerQModelDefinitionItem(context, item);
      return [];
    }

    const node = convertAstItemToNode(item, source, context);
    return node ? [node] : [];
  }

  function parseQHtmlToQDom(source, options) {
    const rawSource = String(source || "");
    const opts = options || {};
    const resolveImports = opts.resolveImportsBeforeParse !== false;
    const importUrls = [];
    const effectiveSource =
      resolveImports && typeof opts.loadImportSync === "function"
        ? resolveQImportsSync(rawSource, {
            loadImportSync: opts.loadImportSync,
            baseUrl: opts.importBaseUrl || "",
            maxImports: opts.maxImports,
            cache: opts.importCache,
            onImport: function onImport(info) {
              if (info && info.url) {
                importUrls.push(info.url);
              }
            },
          })
        : rawSource;
    const sourceKeywordAliases = collectKeywordAliasesFromSource(effectiveSource);
    const macroResult = applyQMacroBlocks(effectiveSource, {
      maxPasses: opts.maxQMacroPasses,
      keywordAliases: sourceKeywordAliases,
      references: opts.references,
    });
    const macroExpandedSource = macroResult.source;
    const postMacroKeywordAliases = collectKeywordAliasesFromSource(macroExpandedSource);
    const rewriteResult = applyQRewriteBlocks(macroExpandedSource, {
      maxPasses: opts.maxQRewritePasses,
      maxQScriptPasses: opts.maxQScriptPasses,
      keywordAliases: postMacroKeywordAliases,
    });
    const rewrittenSource = rewriteResult.source;
    const evaluatedSource = evaluateQScriptBlocks(rewrittenSource, {
      maxPasses: opts.maxQScriptPasses,
      keywordAliases: postMacroKeywordAliases,
      shouldEvaluate: function shouldEvaluateQScriptBlock(context) {
        return (
          !isAssignmentQScriptContext(context && context.source, context && context.start) &&
          !isModelQScriptContext(context && context.source, context && context.start)
        );
      },
    });
    const ast = parseQHtmlToAst(evaluatedSource);
    const doc = core.createDocument({ source: rawSource });
    const conversionContext = createScopedConversionContext();

    const imports = [];
    const sdmlEndpoints = [];
    const sdmlComponents = [];
    const qTimers = [];
    const lifecycleScripts = [];
    for (let i = 0; i < ast.body.length; i += 1) {
      const item = ast.body[i];
      if (item.type === "ImportBlock") {
        imports.push(String(item.path || "").trim());
        continue;
      }
      if (item.type === "SdmlEndpointDefinition") {
        sdmlEndpoints.push({
          endpointId: String(item.endpointId || "").trim(),
          url: String(item.url || "").trim(),
        });
        continue;
      }
      if (item.type === "SdmlComponentDeclaration") {
        sdmlComponents.push({
          componentId: String(item.componentId || "").trim(),
          path: String(item.path || "").trim(),
        });
        continue;
      }
      if (item.type === "QTimerDefinition") {
        const timerId = String(item.timerId || "").trim();
        if (!timerId) {
          continue;
        }
        const config = item.config && typeof item.config === "object" ? item.config : {};
        const interval = Number(config.interval);
        qTimers.push({
          timerId: timerId,
          interval: Number.isFinite(interval) && interval >= 0 ? Math.floor(interval) : 0,
          repeat: config.repeat !== false,
          running: config.running !== false,
          onTimeout: String(config.onTimeout || ""),
        });
        continue;
      }
      if (item.type === "QConnectDefinition") {
        const connectBody = buildQConnectLifecycleBody(item);
        if (connectBody) {
          lifecycleScripts.push({
            name: "onready",
            body: compactScriptBody(connectBody),
          });
        }
        continue;
      }
      if (item.type === "LifecycleBlock" && item.isLifecycle) {
        lifecycleScripts.push({
          name: String(item.name || "").trim(),
          body: compactScriptBody(item.script || ""),
        });
        continue;
      }
      if (item.type === "QColorSchemaDefinition") {
        registerQColorSchemaItem(conversionContext.qColors, item);
        continue;
      }
      if (item.type === "QStyleDefinition") {
        registerQStyleDefinitionItem(conversionContext.qStyles, item);
        continue;
      }
      if (item.type === "QThemeDefinition") {
        registerQThemeDefinitionItem(conversionContext.qStyles, item);
        continue;
      }
      if (item.type === "QColorDefinition") {
        registerQColorDefinitionItem(conversionContext.qColors, item);
        continue;
      }
      if (item.type === "QColorThemeDefinition") {
        registerQColorThemeItem(conversionContext.qColors, item);
        continue;
      }
      if (item.type === "QWasmBlock") {
        throw new Error("q-wasm is only valid inside q-component definitions.");
      }
      if (registerQArrayDefinitionItem(conversionContext, item)) {
        continue;
      }
      if (registerQObjectDefinitionItem(conversionContext, item)) {
        if (String(item.name || "").trim()) {
          continue;
        }
        const objectNodes = convertAstItemToNodes(item, evaluatedSource, createScopedConversionContext(conversionContext));
        for (let oi = 0; oi < objectNodes.length; oi += 1) {
          doc.nodes.push(objectNodes[oi]);
        }
        continue;
      }
      if (registerQModelDefinitionItem(conversionContext, item)) {
        continue;
      }
      if (item.type === "RepeaterDefinition" || item.type === "ForDefinition") {
        const repeatedNodes = convertAstItemToNodes(item, evaluatedSource, createScopedConversionContext(conversionContext));
        for (let ri = 0; ri < repeatedNodes.length; ri += 1) {
          doc.nodes.push(repeatedNodes[ri]);
        }
        continue;
      }
      {
        const namedTheme = resolveNamedQThemeInvocation(item, conversionContext.qStyles);
        if (namedTheme && Array.isArray(item.items) && item.items.length > 0) {
          const invocationContext = createScopedConversionContext(conversionContext);
          appendActiveQTheme(invocationContext.qStyles, namedTheme);
          const scopeNode = core.createElementNode({
            tagName: "q-theme-scope",
            selectorMode: "single",
            selectorChain: ["q-theme-scope"],
            attributes: {},
            children: [],
            meta: {
              generated: true,
              virtual: true,
            },
          });
          processElementItems(scopeNode, item.items, evaluatedSource, invocationContext);
          const scopedChildren = Array.isArray(scopeNode.children) ? scopeNode.children : [];
          for (let ci = 0; ci < scopedChildren.length; ci += 1) {
            doc.nodes.push(scopedChildren[ci]);
          }
          continue;
        }
      }
      if (tryApplyNamedQThemeInvocation(item, conversionContext.qStyles)) {
        continue;
      }
      {
        const namedColorSetup = resolveNamedQColorSetupInvocation(item, conversionContext.qColors);
        if (namedColorSetup && Array.isArray(item.items) && item.items.length > 0) {
          const invocationContext = createScopedConversionContext(conversionContext);
          appendActiveQColorSetup(invocationContext.qColors, namedColorSetup);
          const scopeNode = core.createElementNode({
            tagName: "q-color-scope",
            selectorMode: "single",
            selectorChain: ["q-color-scope"],
            attributes: {},
            children: [],
            meta: {
              generated: true,
              virtual: true,
            },
          });
          processElementItems(scopeNode, item.items, evaluatedSource, invocationContext);
          const scopedChildren = Array.isArray(scopeNode.children) ? scopeNode.children : [];
          for (let ci = 0; ci < scopedChildren.length; ci += 1) {
            doc.nodes.push(scopedChildren[ci]);
          }
          continue;
        }
      }
      if (tryApplyNamedQColorInvocation(item, conversionContext.qColors)) {
        continue;
      }
      const nodes = convertAstItemToNodes(item, evaluatedSource, createScopedConversionContext(conversionContext));
      for (let ni = 0; ni < nodes.length; ni += 1) {
        doc.nodes.push(nodes[ni]);
      }
    }

    const definitionRegistry = buildDefinitionRegistry(doc.nodes);
    doc.nodes = normalizeNodesForDefinitions(doc.nodes, definitionRegistry);

    if (!doc.meta || typeof doc.meta !== "object") {
      doc.meta = {};
    }
    doc.meta.imports = imports.length > 0 ? imports : importUrls;
    doc.meta.sdmlEndpoints = sdmlEndpoints;
    doc.meta.sdmlComponents = sdmlComponents;
    doc.meta.qTimers = qTimers;
    doc.meta.resolvedSource = effectiveSource;
    doc.meta.macroExpandedSource = macroExpandedSource;
    doc.meta.qMacros = macroResult.definitions;
    doc.meta.rewrittenSource = rewrittenSource;
    doc.meta.qRewrites = rewriteResult.definitions;
    doc.meta.evaluatedSource = evaluatedSource;
    doc.meta.lifecycleScripts = lifecycleScripts;
    if (conversionContext.qModels instanceof Map) {
      const serializedModels = {};
      conversionContext.qModels.forEach(function eachModel(entries, name) {
        const key = String(name || "").trim();
        if (!key) {
          return;
        }
        serializedModels[key] = cloneRepeaterEntries(entries);
      });
      doc.meta.qModels = Object.keys(serializedModels).length > 0 ? serializedModels : {};
    }
    if (Array.isArray(opts.scriptRules)) {
      doc.scripts = opts.scriptRules.slice();
    }

    return doc;
  }

  function escapeQuoted(value) {
    return String(value)
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r")
      .replace(/\t/g, "\\t");
  }

  function serializeScriptBlock(name, body, indentLevel) {
    const indent = "  ".repeat(indentLevel);
    const blockName = String(name || "").trim();
    const scriptBody = String(body || "");
    const lines = [indent + blockName + " {"];
    if (scriptBody) {
      const chunks = scriptBody.split("\n");
      for (let i = 0; i < chunks.length; i += 1) {
        lines.push(indent + "  " + chunks[i]);
      }
    }
    lines.push(indent + "}");
    return lines.join("\n");
  }

  function serializeQTimerDefinitionBlock(timerDef, indentLevel) {
    const indent = "  ".repeat(indentLevel);
    const timer = timerDef && typeof timerDef === "object" ? timerDef : null;
    const timerId = String(timer && (timer.timerId || timer.name || timer.id) || "").trim();
    if (!timerId) {
      return "";
    }
    const interval = Number(timer && timer.interval);
    const repeat = timer && Object.prototype.hasOwnProperty.call(timer, "repeat") ? timer.repeat !== false : true;
    const running = timer && Object.prototype.hasOwnProperty.call(timer, "running") ? timer.running !== false : true;
    const onTimeout = String(timer && timer.onTimeout || "").trim();
    const lines = [indent + "q-timer " + timerId + " {"];
    lines.push(indent + "  interval: " + (Number.isFinite(interval) && interval >= 0 ? Math.floor(interval) : 0));
    lines.push(indent + "  repeat: " + (repeat ? "true" : "false"));
    lines.push(indent + "  running: " + (running ? "true" : "false"));
    lines.push(serializeScriptBlock("onTimeout", onTimeout, indentLevel + 1));
    lines.push(indent + "}");
    return lines.join("\n");
  }

  function serializeFunctionBlock(method, indentLevel) {
    const indent = "  ".repeat(indentLevel);
    if (!method || typeof method !== "object") {
      return "";
    }
    const signature = String(method.signature || "").trim();
    const name = String(method.name || "").trim();
    const params = String(method.parameters || "").trim();
    const header = signature ? "function " + signature : "function " + name + "(" + params + ")";
    const body = String(method.body || "");
    const lines = [indent + header + " {"];
    if (body) {
      const chunks = body.split("\n");
      for (let i = 0; i < chunks.length; i += 1) {
        lines.push(indent + "  " + chunks[i]);
      }
    }
    lines.push(indent + "}");
    return lines.join("\n");
  }

  function serializeSignalDeclarationBlock(signalDecl, indentLevel) {
    const indent = "  ".repeat(indentLevel);
    if (!signalDecl || typeof signalDecl !== "object") {
      return "";
    }
    const name = String(signalDecl.name || "").trim();
    if (!name) {
      return "";
    }
    const parameters = Array.isArray(signalDecl.parameters)
      ? signalDecl.parameters.map(function mapParam(entry) { return String(entry || "").trim(); }).filter(Boolean)
      : [];
    return indent + "q-signal " + name + "(" + parameters.join(", ") + ")";
  }

  function serializeAliasDeclarationBlock(aliasDecl, indentLevel) {
    const indent = "  ".repeat(indentLevel);
    if (!aliasDecl || typeof aliasDecl !== "object") {
      return "";
    }
    const name = String(aliasDecl.name || "").trim();
    if (!name) {
      return "";
    }
    const body = String(aliasDecl.body || "");
    const lines = [indent + "q-alias " + name + " {"];
    if (body) {
      const chunks = body.split("\n");
      for (let i = 0; i < chunks.length; i += 1) {
        lines.push(indent + "  " + chunks[i]);
      }
    }
    lines.push(indent + "}");
    return lines.join("\n");
  }

  function serializeCallbackDeclarationBlock(callbackDecl, indentLevel) {
    const indent = "  ".repeat(indentLevel);
    if (!callbackDecl || typeof callbackDecl !== "object") {
      return "";
    }
    const name = String(callbackDecl.name || "").trim();
    if (!name) {
      return "";
    }
    const parameters = Array.isArray(callbackDecl.parameters)
      ? callbackDecl.parameters.map(function mapParam(entry) { return String(entry || "").trim(); }).filter(Boolean)
      : [];
    const body = String(callbackDecl.body || "").trim();
    const lines = [indent + "q-callback " + name + "(" + parameters.join(", ") + ") {"];
    if (body) {
      const chunks = body.split("\n");
      for (let i = 0; i < chunks.length; i += 1) {
        lines.push(indent + "  " + chunks[i]);
      }
    }
    lines.push(indent + "}");
    return lines.join("\n");
  }

  function serializeWasmConfigBlock(wasmConfig, indentLevel) {
    const config =
      wasmConfig && typeof wasmConfig === "object" && !Array.isArray(wasmConfig)
        ? wasmConfig
        : null;
    if (!config) {
      return "";
    }
    const indent = "  ".repeat(indentLevel);
    const lines = [indent + "q-wasm {"];
    const src = String(config.src || "").trim();
    if (src) {
      lines.push(indent + "  src: " + src);
    }
    const mode = String(config.mode || "").trim();
    if (mode) {
      lines.push(indent + "  mode: " + mode);
    }
    if (typeof config.awaitWasm === "boolean") {
      lines.push(indent + "  awaitWasm: " + (config.awaitWasm ? "true" : "false"));
    }
    if (Number.isFinite(config.timeoutMs)) {
      lines.push(indent + "  timeoutMs: " + String(Math.max(0, Math.floor(Number(config.timeoutMs)))));
    }
    if (Number.isFinite(config.maxPayloadBytes)) {
      lines.push(indent + "  maxPayloadBytes: " + String(Math.max(0, Math.floor(Number(config.maxPayloadBytes)))));
    }
    const exportsList = Array.isArray(config.exports) ? config.exports : [];
    if (exportsList.length > 0) {
      lines.push(indent + "  exports { " + exportsList.join(" ") + " }");
    }
    const allowImportsList = Array.isArray(config.allowImports) ? config.allowImports : [];
    if (allowImportsList.length > 0) {
      lines.push(indent + "  allowImports { " + allowImportsList.join(" ") + " }");
    }
    const bindList = Array.isArray(config.bind) ? config.bind : [];
    if (bindList.length > 0) {
      lines.push(indent + "  bind {");
      for (let i = 0; i < bindList.length; i += 1) {
        const entry = bindList[i] || {};
        const exportName = String(entry.exportName || "").trim();
        const targetType = String(entry.targetType || "").trim();
        const targetName = String(entry.targetName || "").trim();
        if (!exportName || !targetType || !targetName) {
          continue;
        }
        lines.push(indent + "    " + exportName + " -> " + targetType + " " + targetName);
      }
      lines.push(indent + "  }");
    }
    lines.push(indent + "}");
    return lines.join("\n");
  }

  function serializePropertyDefinitionBlock(propertyDef, indentLevel) {
    const indent = "  ".repeat(indentLevel);
    if (!propertyDef || typeof propertyDef !== "object") {
      return "";
    }
    const name = String(propertyDef.name || "").trim();
    if (!name) {
      return "";
    }
    const lines = [indent + "property " + name + " {"];
    const nodes = Array.isArray(propertyDef.nodes) ? propertyDef.nodes : [];
    for (let i = 0; i < nodes.length; i += 1) {
      lines.push(serializeNode(nodes[i], indentLevel + 1));
    }
    lines.push(indent + "}");
    return lines.join("\n");
  }

  function serializeTextBlock(name, value, indentLevel) {
    const indent = "  ".repeat(indentLevel);
    const blockName = String(name || "text").trim() || "text";
    const text = String(value || "");
    const lines = [indent + blockName + " {"];
    if (text) {
      const chunks = text.split("\n");
      for (let i = 0; i < chunks.length; i += 1) {
        lines.push(indent + "  " + chunks[i]);
      }
    }
    lines.push(indent + "}");
    return lines.join("\n");
  }

  function serializeSlotNode(slotNode, indentLevel) {
    const indent = "  ".repeat(indentLevel);
    const slotName = slotNode && typeof slotNode.name === "string" && slotNode.name.trim() ? slotNode.name : "default";
    const lines = [indent + slotName + " {"];
    const children = Array.isArray(slotNode && slotNode.children) ? slotNode.children : [];
    for (let i = 0; i < children.length; i += 1) {
      lines.push(serializeNode(children[i], indentLevel + 1));
    }
    lines.push(indent + "}");
    return lines.join("\n");
  }

  function serializeRepeaterPrimitiveLiteral(value) {
    if (value === null) {
      return "null";
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    return JSON.stringify(String(value == null ? "" : value));
  }

  function serializeRepeaterModelEntries(modelEntries, indentLevel) {
    const indent = "  ".repeat(indentLevel);
    const entries = Array.isArray(modelEntries) ? modelEntries : [];
    if (entries.length === 0) {
      return [indent + "q-array { [] }"];
    }
    const primitiveValues = [];
    const lines = [];
    for (let i = 0; i < entries.length; i += 1) {
      const entry = entries[i];
      if (!entry || typeof entry !== "object") {
        primitiveValues.push(entry);
        continue;
      }
      if (entry.kind === "qobject") {
        if (primitiveValues.length > 0) {
          lines.push(indent + "q-array { [" + primitiveValues.map(serializeRepeaterPrimitiveLiteral).join(", ") + "] }");
          primitiveValues.length = 0;
        }
        const source = String(entry.source || "").trim();
        if (source) {
          lines.push(indent + source);
          continue;
        }
        lines.push(indent + normalizeQObjectKeyword(entry.objectKeyword || entry.keyword) + " {");
        const nodes = Array.isArray(entry.nodes) ? entry.nodes : [];
        for (let j = 0; j < nodes.length; j += 1) {
          lines.push(serializeNode(nodes[j], indentLevel + 1));
        }
        lines.push(indent + "}");
        continue;
      }
      primitiveValues.push(Object.prototype.hasOwnProperty.call(entry, "value") ? entry.value : entry.text);
    }
    if (primitiveValues.length > 0) {
      lines.push(indent + "q-array { [" + primitiveValues.map(serializeRepeaterPrimitiveLiteral).join(", ") + "] }");
    }
    return lines.length > 0 ? lines : [indent + "q-array { [] }"];
  }

  function readNodeBindingEntries(node) {
    if (!node || typeof node !== "object" || !node.meta || typeof node.meta !== "object") {
      return [];
    }
    if (!Array.isArray(node.meta.qBindings)) {
      return [];
    }
    return node.meta.qBindings;
  }

  function collectNodeBindingsByTarget(node, targetCollection) {
    const requested = String(targetCollection || "").trim().toLowerCase();
    const entries = readNodeBindingEntries(node);
    const map = new Map();
    for (let i = 0; i < entries.length; i += 1) {
      const entry = entries[i];
      if (!entry || typeof entry !== "object") {
        continue;
      }
      const actualTarget =
        String(entry.targetCollection || "").trim().toLowerCase() === "props"
          ? "props"
          : String(entry.targetCollection || "").trim().toLowerCase() === "textcontent"
            ? "textcontent"
            : "attributes";
      if (actualTarget !== requested) {
        continue;
      }
      const name = String(entry.name || "").trim();
      if (!name) {
        continue;
      }
      map.set(name, entry);
    }
    return map;
  }

  function serializeBindingAssignment(name, binding, indentLevel) {
    const indent = "  ".repeat(indentLevel);
    const key = String(name || "").trim();
    const spec = binding && typeof binding === "object" ? binding : {};
    const keyword = "q-script";
    const scriptBody = String(spec.script || "");
    const lines = [indent + key + ": " + keyword + " {"];
    if (scriptBody) {
      const chunks = scriptBody.split("\n");
      for (let i = 0; i < chunks.length; i += 1) {
        lines.push(indent + "  " + chunks[i]);
      }
    }
    lines.push(indent + "}");
    return lines.join("\n");
  }

  function isPlainSerializableObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  }

  function serializeTypedAssignmentLiteral(value) {
    if (Array.isArray(value)) {
      const parts = [];
      for (let i = 0; i < value.length; i += 1) {
        parts.push(serializeTypedAssignmentLiteral(value[i]));
      }
      return "q-array { " + parts.join(", ") + " }";
    }
    if (isPlainSerializableObject(value)) {
      const keys = Object.keys(value);
      const pairs = [];
      for (let i = 0; i < keys.length; i += 1) {
        const rawKey = String(keys[i] || "");
        if (!rawKey) {
          continue;
        }
        const key = /^[A-Za-z_][A-Za-z0-9_.#-]*$/.test(rawKey) ? rawKey : JSON.stringify(rawKey);
        pairs.push(key + ": " + serializeTypedAssignmentLiteral(value[rawKey]));
      }
      return "q-map { " + pairs.join(", ") + " }";
    }
    if (value === null) {
      return "null";
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    return '"' + escapeQuoted(value == null ? "" : value) + '"';
  }

  function serializeAssignmentValue(value) {
    const normalized = coercePropertyValue(value);
    if (Array.isArray(normalized) || isPlainSerializableObject(normalized)) {
      return serializeTypedAssignmentLiteral(normalized);
    }
    return '"' + escapeQuoted(normalized == null ? "" : normalized) + '"';
  }

  function serializeNode(node, indentLevel) {
    const indent = "  ".repeat(indentLevel);
    if (!node || typeof node !== "object") {
      return "";
    }

    if (node.meta && node.meta.originalSource && !node.meta.dirty) {
      return node.meta.originalSource;
    }

    if (node.kind === core.NODE_TYPES.rawHtml) {
      return indent + "html {" + (node.html || "") + "}";
    }

    if (core.NODE_TYPES.text && node.kind === core.NODE_TYPES.text) {
      return serializeTextBlock("text", node.value, indentLevel);
    }

    if (core.NODE_TYPES.repeater && node.kind === core.NODE_TYPES.repeater) {
      const normalizedKeyword = String(node.keyword || "q-repeater").trim().toLowerCase();
      const keyword =
        normalizedKeyword === "q-foreach"
          ? "q-foreach"
          : normalizedKeyword === "q-model-view"
            ? "q-model-view"
            : normalizedKeyword === "for"
              ? "for"
              : "q-repeater";
      const repeaterId = String(node.repeaterId || "").trim();
      const slotName = String(node.slotName || "item").trim() || "item";
      const modelNode =
        core.NODE_TYPES.model &&
        node.model &&
        typeof node.model === "object" &&
        node.model.kind === core.NODE_TYPES.model
          ? node.model
          : null;
      const modelSource = modelNode && typeof modelNode.source === "string" ? modelNode.source.trim() : "";
      if (keyword === "for") {
        const headerSource = modelSource || "[]";
        const lines = [indent + "for (" + slotName + " in " + headerSource + ") {"];
        const templateNodes = Array.isArray(node.templateNodes) ? node.templateNodes : [];
        for (let i = 0; i < templateNodes.length; i += 1) {
          lines.push(serializeNode(templateNodes[i], indentLevel + 1));
        }
        lines.push(indent + "}");
        return lines.join("\n");
      }
      const modelHead = keyword === "q-model-view" ? "q-model" : "model";
      const slotHead = keyword === "q-model-view" ? "as" : "slot";
      const lines = [indent + (repeaterId ? keyword + " " + repeaterId + " {" : keyword + " {")];
      lines.push(indent + "  " + modelHead + " {");
      if (modelSource) {
        const sourceLines = modelSource.split("\n");
        for (let i = 0; i < sourceLines.length; i += 1) {
          lines.push(indent + "    " + sourceLines[i]);
        }
      } else {
        const modelEntries = modelNode && Array.isArray(modelNode.entries) ? modelNode.entries : node.modelEntries;
        const modelLines = serializeRepeaterModelEntries(modelEntries, indentLevel + 2);
        for (let i = 0; i < modelLines.length; i += 1) {
          lines.push(modelLines[i]);
        }
      }
      lines.push(indent + "  }");
      lines.push(indent + "  " + slotHead + " { " + slotName + " }");
      const templateNodes = Array.isArray(node.templateNodes) ? node.templateNodes : [];
      for (let i = 0; i < templateNodes.length; i += 1) {
        lines.push(serializeNode(templateNodes[i], indentLevel + 1));
      }
      lines.push(indent + "}");
      return lines.join("\n");
    }

    if (String(node.kind || "").trim().toLowerCase() === "callback") {
      return serializeCallbackDeclarationBlock(node, indentLevel);
    }

    if (node.kind === core.NODE_TYPES.component) {
      const explicitDefinitionType = String(node.definitionType || "").trim().toLowerCase();
      const definitionType =
        explicitDefinitionType === "template"
          ? "template"
          : explicitDefinitionType === "signal"
            ? "signal"
            : explicitDefinitionType === "worker"
              ? "worker"
              : "component";
      const keyword =
        definitionType === "template"
          ? "q-template"
          : definitionType === "signal"
            ? "q-signal"
            : definitionType === "worker"
              ? "q-worker"
              : "q-component";
      const definitionId = String(node.componentId || "").trim();
      const extendsComponentIds = (definitionType === "component" || definitionType === "worker") ? readExtendsComponentIds(node) : [];
      const extendsClause =
        extendsComponentIds.length > 0 ? " extends " + extendsComponentIds.join(" extends ") : "";
      const definitionHead =
        definitionId
          ? keyword + " " + definitionId + extendsClause + " {"
          : keyword + extendsClause + " {";
      const lines = [indent + definitionHead];
      const properties = Array.isArray(node.properties) ? node.properties : [];
      if (properties.length > 0) {
        lines.push(indent + "  q-property {");
        for (let i = 0; i < properties.length; i += 1) {
          const propertyName = String(properties[i] || "").trim();
          if (!propertyName) {
            continue;
          }
          lines.push(indent + "    " + propertyName);
        }
        lines.push(indent + "  }");
      }
      const attrs = node.attributes || {};
      const attrKeys = Object.keys(attrs);
      for (let i = 0; i < attrKeys.length; i += 1) {
        const key = attrKeys[i];
        lines.push(indent + "  " + key + ": " + serializeAssignmentValue(attrs[key]));
      }
      if ((definitionType === "component" || definitionType === "worker") && Array.isArray(node.propertyDefinitions)) {
        for (let i = 0; i < node.propertyDefinitions.length; i += 1) {
          const serializedPropertyDefinition = serializePropertyDefinitionBlock(node.propertyDefinitions[i], indentLevel + 1);
          if (serializedPropertyDefinition) {
            lines.push(serializedPropertyDefinition);
          }
        }
      }
      if ((definitionType === "component" || definitionType === "worker") && Array.isArray(node.methods)) {
        if (Array.isArray(node.signalDeclarations)) {
          for (let i = 0; i < node.signalDeclarations.length; i += 1) {
            const serializedSignalDeclaration = serializeSignalDeclarationBlock(node.signalDeclarations[i], indentLevel + 1);
            if (serializedSignalDeclaration) {
              lines.push(serializedSignalDeclaration);
            }
          }
        }
        if (Array.isArray(node.aliasDeclarations)) {
          for (let i = 0; i < node.aliasDeclarations.length; i += 1) {
            const serializedAliasDeclaration = serializeAliasDeclarationBlock(node.aliasDeclarations[i], indentLevel + 1);
            if (serializedAliasDeclaration) {
              lines.push(serializedAliasDeclaration);
            }
          }
        }
        if (Array.isArray(node.callbackDeclarations)) {
          for (let i = 0; i < node.callbackDeclarations.length; i += 1) {
            const serializedCallbackDeclaration = serializeCallbackDeclarationBlock(node.callbackDeclarations[i], indentLevel + 1);
            if (serializedCallbackDeclaration) {
              lines.push(serializedCallbackDeclaration);
            }
          }
        }
        const serializedWasmConfig = serializeWasmConfigBlock(node.wasmConfig, indentLevel + 1);
        if (serializedWasmConfig) {
          lines.push(serializedWasmConfig);
        }
        for (let i = 0; i < node.methods.length; i += 1) {
          lines.push(serializeFunctionBlock(node.methods[i], indentLevel + 1));
        }
      }
      if ((definitionType === "component" || definitionType === "worker") && Array.isArray(node.lifecycleScripts)) {
        for (let i = 0; i < node.lifecycleScripts.length; i += 1) {
          const hook = node.lifecycleScripts[i] || {};
          lines.push(serializeScriptBlock(hook.name, hook.body, indentLevel + 1));
        }
      }
      for (let i = 0; i < node.templateNodes.length; i += 1) {
        lines.push(serializeNode(node.templateNodes[i], indentLevel + 1));
      }
      lines.push(indent + "}");
      return lines.join("\n");
    }

    if (node.kind === core.NODE_TYPES.slot) {
      return serializeSlotNode(node, indentLevel);
    }

    if (node.kind === core.NODE_TYPES.componentInstance || node.kind === core.NODE_TYPES.templateInstance) {
      const tagName = String(node.tagName || node.componentId || "div").trim().toLowerCase();
      const instanceAlias =
        node &&
        node.meta &&
        typeof node.meta === "object" &&
        typeof node.meta.__qhtmlInstanceAlias === "string"
          ? String(node.meta.__qhtmlInstanceAlias || "").trim()
          : "";
      const head = instanceAlias ? tagName + " " + instanceAlias + " {" : tagName + " {";
      const lines = [indent + head];

      const attrs = node.attributes || {};
      const attrBindings = collectNodeBindingsByTarget(node, "attributes");
      const attrKeys = Object.keys(attrs);
      const serializedAttrBindings = new Set();
      for (let i = 0; i < attrKeys.length; i += 1) {
        const key = attrKeys[i];
        const binding = attrBindings.get(key);
        if (binding) {
          lines.push(serializeBindingAssignment(key, binding, indentLevel + 1));
          serializedAttrBindings.add(key);
        } else {
          lines.push(indent + "  " + key + ": " + serializeAssignmentValue(attrs[key]));
        }
      }
      attrBindings.forEach(function serializeRemainingAttrBinding(binding, key) {
        if (serializedAttrBindings.has(key)) {
          return;
        }
        lines.push(serializeBindingAssignment(key, binding, indentLevel + 1));
      });

      const props = node.props || {};
      const propBindings = collectNodeBindingsByTarget(node, "props");
      const propKeys = Object.keys(props);
      const serializedPropBindings = new Set();
      for (let i = 0; i < propKeys.length; i += 1) {
        const key = propKeys[i];
        const binding = propBindings.get(key);
        if (binding) {
          lines.push(serializeBindingAssignment(key, binding, indentLevel + 1));
          serializedPropBindings.add(key);
        } else {
          lines.push(indent + "  " + key + ": " + serializeAssignmentValue(props[key]));
        }
      }
      propBindings.forEach(function serializeRemainingPropBinding(binding, key) {
        if (serializedPropBindings.has(key)) {
          return;
        }
        lines.push(serializeBindingAssignment(key, binding, indentLevel + 1));
      });

      if (typeof node.textContent === "string" && node.textContent.length > 0) {
        lines.push(serializeTextBlock("text", node.textContent, indentLevel + 1));
      }

      const serializedSlotNodes = Array.isArray(node.slots)
        ? node.slots
        : Array.isArray(node.__qhtmlSlotNodes)
          ? node.__qhtmlSlotNodes
          : [];
      if (serializedSlotNodes.length > 0) {
        for (let i = 0; i < serializedSlotNodes.length; i += 1) {
          const slotNode = serializedSlotNodes[i];
          if (!slotNode || slotNode.kind !== core.NODE_TYPES.slot) {
            continue;
          }
          const slotName = String(slotNode.name || "default").trim() || "default";
          if (slotName === "default") {
            const slotChildren = Array.isArray(slotNode.children) ? slotNode.children : [];
            for (let j = 0; j < slotChildren.length; j += 1) {
              lines.push(serializeNode(slotChildren[j], indentLevel + 1));
            }
            continue;
          }
          lines.push(serializeSlotNode(slotNode, indentLevel + 1));
        }
      } else if (Array.isArray(node.children)) {
        for (let i = 0; i < node.children.length; i += 1) {
          lines.push(serializeNode(node.children[i], indentLevel + 1));
        }
      }

      if (Array.isArray(node.lifecycleScripts)) {
        for (let i = 0; i < node.lifecycleScripts.length; i += 1) {
          const hook = node.lifecycleScripts[i] || {};
          lines.push(serializeScriptBlock(hook.name, hook.body, indentLevel + 1));
        }
      }

      lines.push(indent + "}");
      return lines.join("\n");
    }

    if (node.kind !== core.NODE_TYPES.element) {
      return "";
    }

    const chain = Array.isArray(node.selectorChain) && node.selectorChain.length > 0 ? node.selectorChain : [node.tagName];
    const selectorText = node.selectorMode === "class-shorthand" ? chain.join(",") : chain[0];

    const lines = [indent + selectorText + " {"];

    const textBindings = collectNodeBindingsByTarget(node, "textcontent");
    const contentBinding = textBindings.get("content") || textBindings.get("text") || null;
    if (contentBinding) {
      lines.push(serializeBindingAssignment("content", contentBinding, indentLevel + 1));
    } else if (typeof node.textContent === "string") {
      lines.push(indent + "  content: \"" + escapeQuoted(node.textContent) + "\"");
    }

    const attrs = node.attributes || {};
    const attrBindings = collectNodeBindingsByTarget(node, "attributes");
    const attrKeys = Object.keys(attrs);
    const serializedAttrBindings = new Set();
    for (let i = 0; i < attrKeys.length; i += 1) {
      const key = attrKeys[i];
      const binding = attrBindings.get(key);
      if (binding) {
        lines.push(serializeBindingAssignment(key, binding, indentLevel + 1));
        serializedAttrBindings.add(key);
      } else {
        lines.push(indent + "  " + key + ": " + serializeAssignmentValue(attrs[key]));
      }
    }
    attrBindings.forEach(function serializeRemainingAttrBinding(binding, key) {
      if (serializedAttrBindings.has(key)) {
        return;
      }
      lines.push(serializeBindingAssignment(key, binding, indentLevel + 1));
    });

    if (Array.isArray(node.lifecycleScripts)) {
      for (let i = 0; i < node.lifecycleScripts.length; i += 1) {
        const hook = node.lifecycleScripts[i] || {};
        lines.push(serializeScriptBlock(hook.name, hook.body, indentLevel + 1));
      }
    }

    if (Array.isArray(node.children)) {
      for (let i = 0; i < node.children.length; i += 1) {
        lines.push(serializeNode(node.children[i], indentLevel + 1));
      }
    }

    lines.push(indent + "}");
    return lines.join("\n");
  }

  function qdomToQHtml(documentNode, options) {
    const opts = options || {};
    const preserve = opts.preserveOriginal !== false;

    if (preserve && documentNode && documentNode.meta && !documentNode.meta.dirty && typeof documentNode.meta.source === "string") {
      return documentNode.meta.source;
    }

    const lines = [];
    const nodes = documentNode && Array.isArray(documentNode.nodes) ? documentNode.nodes : [];
    for (let i = 0; i < nodes.length; i += 1) {
      lines.push(serializeNode(nodes[i], 0));
    }
    const qTimers =
      documentNode &&
      documentNode.meta &&
      Array.isArray(documentNode.meta.qTimers)
        ? documentNode.meta.qTimers
        : [];
    for (let i = 0; i < qTimers.length; i += 1) {
      const timerBlock = serializeQTimerDefinitionBlock(qTimers[i], 0);
      if (timerBlock) {
        lines.push(timerBlock);
      }
    }
    const lifecycleScripts =
      documentNode &&
      documentNode.meta &&
      Array.isArray(documentNode.meta.lifecycleScripts)
        ? documentNode.meta.lifecycleScripts
        : [];
    for (let i = 0; i < lifecycleScripts.length; i += 1) {
      const hook = lifecycleScripts[i] || {};
      lines.push(serializeScriptBlock(hook.name, hook.body, 0));
    }
    return lines.join("\n\n");
  }

  function parseQScript(source) {
    const parser = parserFor(source);
    const rules = [];

    while (!eof(parser)) {
      skipWhitespaceAndSemicolons(parser);
      if (eof(parser)) {
        break;
      }

      const start = parser.index;
      const onIndex = parser.source.indexOf(".on(", parser.index);
      if (onIndex === -1) {
        throw ParseError("Expected '.on(' in q-script rule", parser.index);
      }

      const selector = parser.source.slice(parser.index, onIndex).trim();
      parser.index = onIndex + 4;

      skipWhitespace(parser);
      const quote = peek(parser);
      if (quote !== '"' && quote !== "'") {
        throw ParseError("Expected quoted event name", parser.index);
      }
      consume(parser);

      const eventStart = parser.index;
      while (!eof(parser) && peek(parser) !== quote) {
        if (peek(parser) === "\\") {
          parser.index += 2;
          continue;
        }
        parser.index += 1;
      }
      if (eof(parser)) {
        throw ParseError("Unterminated event name", parser.index);
      }
      const eventName = parser.source.slice(eventStart, parser.index);
      consume(parser);

      skipWhitespace(parser);
      expect(parser, ")");
      skipWhitespace(parser);
      expect(parser, ":");
      skipWhitespace(parser);
      expect(parser, "{");
      const body = readBalancedBlockContent(parser);

      const raw = parser.source.slice(start, parser.index);
      rules.push(
        core.createScriptRule({
          selector: selector,
          eventName: eventName,
          body: body.trim(),
          meta: {
            originalSource: raw,
            sourceRange: [start, parser.index],
          },
        })
      );
    }

    return rules;
  }

  function serializeQScript(rules) {
    if (!Array.isArray(rules) || rules.length === 0) {
      return "";
    }

    const lines = [];
    for (let i = 0; i < rules.length; i += 1) {
      const rule = rules[i];
      if (rule.meta && rule.meta.originalSource && !rule.meta.dirty) {
        lines.push(rule.meta.originalSource);
        continue;
      }
      lines.push(
        rule.selector +
          '.on("' +
          escapeQuoted(rule.eventName) +
          '"): {' +
          (rule.body ? "\n" + rule.body + "\n" : "") +
          "}"
      );
    }
    return lines.join("\n");
  }

  modules.qhtmlParser = {
    KNOWN_HTML_TAGS: KNOWN_HTML_TAGS,
    parseQHtmlToAst: parseQHtmlToAst,
    parseQHtmlToQDom: parseQHtmlToQDom,
    applyQMacroBlocks: applyQMacroBlocks,
    applyQRewriteBlocks: applyQRewriteBlocks,
    resolveQImportsSync: resolveQImportsSync,
    resolveQImportsAsync: resolveQImportsAsync,
    qdomToQHtml: qdomToQHtml,
    parseQScript: parseQScript,
    serializeQScript: serializeQScript,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
