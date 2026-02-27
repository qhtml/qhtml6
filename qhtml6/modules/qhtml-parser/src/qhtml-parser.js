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

  function ParseError(message, index) {
    const error = new Error(message + " (at index " + index + ")");
    error.name = "QHtmlParseError";
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

  function parseValue(parser) {
    skipWhitespace(parser);
    const ch = peek(parser);
    if (ch === '"' || ch === "'") {
      return parseQuotedString(parser);
    }
    return parseBareValue(parser);
  }

  function parseSelectorList(parser, firstSelector) {
    const selectors = [firstSelector || parseIdentifier(parser)];
    skipWhitespace(parser);
    while (peek(parser) === ",") {
      consume(parser);
      skipWhitespace(parser);
      selectors.push(parseIdentifier(parser));
      skipWhitespace(parser);
    }
    return selectors;
  }

  function readBalancedBlockContent(parser) {
    const start = parser.index;
    let depth = 1;
    let quote = "";
    let escaped = false;

    while (!eof(parser)) {
      const ch = consume(parser);

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
          return parser.source.slice(start, parser.index - 1);
        }
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

  function parseBlockItems(parser) {
    const items = [];

    while (!eof(parser)) {
      skipWhitespaceAndSemicolons(parser);
      if (peek(parser) === "}") {
        break;
      }

      const itemStart = parser.index;
      const name = parseIdentifier(parser);
      const afterName = parser.index;
      skipWhitespace(parser);

      const nextChar = peek(parser);
      if (nextChar === ":") {
        consume(parser);
        const value = parseValue(parser);
        items.push({
          type: "Property",
          name: name,
          value: value,
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
        const childItems = parseBlockItems(parser);
        expect(parser, "}");
        items.push({
          type: "Element",
          selectors: selectors,
          prefixDirectives: prefixDirectives,
          items: childItems,
          start: itemStart,
          end: parser.index,
          raw: parser.source.slice(itemStart, parser.index),
        });
        continue;
      }

      if (nextChar === "{") {
        const lowerName = name.toLowerCase();

        if (lowerName === "html") {
          consume(parser);
          const rawHtml = readBalancedBlockContent(parser);
          items.push({
            type: "HtmlBlock",
            html: rawHtml,
            start: itemStart,
            end: parser.index,
            raw: parser.source.slice(itemStart, parser.index),
          });
          continue;
        }

        if (TEXT_BLOCK_KEYWORDS.has(lowerName)) {
          consume(parser);
          const textBody = readBalancedBlockContent(parser);
          items.push({
            type: "TextBlock",
            text: textBody,
            start: itemStart,
            end: parser.index,
            raw: parser.source.slice(itemStart, parser.index),
          });
          continue;
        }

        if (lowerName === "style") {
          consume(parser);
          const styleBody = readBalancedBlockContent(parser);
          items.push({
            type: "StyleBlock",
            css: styleBody,
            start: itemStart,
            end: parser.index,
            raw: parser.source.slice(itemStart, parser.index),
          });
          continue;
        }

        if (lowerName === "q-script") {
          consume(parser);
          const scriptBody = readBalancedBlockContent(parser);
          items.push({
            type: "QScriptInline",
            script: scriptBody,
            start: itemStart,
            end: parser.index,
            raw: parser.source.slice(itemStart, parser.index),
          });
          continue;
        }

        if (lowerName === "q-import") {
          consume(parser);
          const importBody = readBalancedBlockContent(parser);
          items.push({
            type: "ImportBlock",
            path: String(importBody || "").trim(),
            start: itemStart,
            end: parser.index,
            raw: parser.source.slice(itemStart, parser.index),
          });
          continue;
        }

        if (isEventBlockName(name)) {
          consume(parser);
          const scriptBody = readBalancedBlockContent(parser);
          items.push({
            type: "EventBlock",
            name: name,
            script: scriptBody,
            isLifecycle: LIFECYCLE_BLOCKS.has(lowerName),
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
        const childItems = parseBlockItems(parser);
        expect(parser, "}");

        items.push({
          type: "Element",
          selectors: [name],
          prefixDirectives: prefixDirectives,
          items: childItems,
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
        start: itemStart,
        end: parser.index,
        raw: parser.source.slice(itemStart, parser.index),
      });
    }

    return items;
  }

  function parseQHtmlToAst(source) {
    const parser = parserFor(source);
    const body = [];

    while (!eof(parser)) {
      skipWhitespaceAndSemicolons(parser);
      if (eof(parser)) {
        break;
      }

      const start = parser.index;
      const firstSelector = parseIdentifier(parser);
      const firstLower = firstSelector.toLowerCase();
      skipWhitespace(parser);

      if (LIFECYCLE_BLOCKS.has(firstLower) && peek(parser) === "{") {
        consume(parser);
        const scriptBody = readBalancedBlockContent(parser);
        body.push({
          type: "LifecycleBlock",
          name: firstSelector,
          script: scriptBody,
          isLifecycle: true,
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
        const items = parseBlockItems(parser);
        expect(parser, "}");
        body.push({
          type: "TemplateDefinition",
          templateId: templateId,
          items: items,
          start: start,
          end: parser.index,
          raw: parser.source.slice(start, parser.index),
        });
        continue;
      }

      if (firstLower === "q-component" && peek(parser) !== "{" && peek(parser) !== ",") {
        const componentIdExprStart = parser.index;
        let componentIdExpression = null;

        if (parser.source.slice(parser.index, parser.index + 8).toLowerCase() === "q-script") {
          const keyword = parseIdentifier(parser);
          skipWhitespace(parser);
          if (peek(parser) !== "{") {
            throw ParseError("Expected '{' after q-script in component id expression", parser.index);
          }
          consume(parser);
          const scriptBody = readBalancedBlockContent(parser);
          componentIdExpression = {
            type: "QScriptExpression",
            keyword: keyword,
            script: scriptBody,
            raw: parser.source.slice(componentIdExprStart, parser.index),
          };
        } else {
          const componentId = parseIdentifier(parser);
          componentIdExpression = {
            type: "IdentifierExpression",
            identifier: componentId,
            raw: parser.source.slice(componentIdExprStart, parser.index),
          };
        }

        skipWhitespace(parser);
        if (peek(parser) !== "{") {
          throw ParseError("Expected '{' after q-component id", parser.index);
        }
        consume(parser);
        const items = parseBlockItems(parser);
        expect(parser, "}");

        body.push({
          type: "ComponentDefinition",
          componentIdExpression: componentIdExpression,
          items: items,
          start: start,
          end: parser.index,
          raw: parser.source.slice(start, parser.index),
        });
        continue;
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
          start: start,
          end: parser.index,
          raw: parser.source.slice(start, parser.index),
        });
        continue;
      }

      const items = parseBlockItems(parser);
      expect(parser, "}");
      body.push({
        type: "Element",
        selectors: selectors,
        prefixDirectives: prefixDirectives,
        items: items,
        start: start,
        end: parser.index,
        raw: parser.source.slice(start, parser.index),
      });
    }

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
    const fragmentRe = /([.#])([A-Za-z_][A-Za-z0-9_-]*)/g;
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

    return null;
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

  function findStandaloneQScriptKeyword(source, fromIndex) {
    const input = String(source || "");
    const token = "q-script";
    let pos = Math.max(0, Number(fromIndex) || 0);
    while (pos < input.length) {
      const idx = input.indexOf(token, pos);
      if (idx === -1) {
        return -1;
      }
      const before = idx > 0 ? input[idx - 1] : "";
      const after = input[idx + token.length] || "";
      if (isQScriptIdentifierChar(before) || isQScriptIdentifierChar(after)) {
        pos = idx + token.length;
        continue;
      }
      return idx;
    }
    return -1;
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

  function findNextQRewriteDefinition(source, fromIndex) {
    const input = String(source || "");
    let pos = Math.max(0, Number(fromIndex) || 0);

    while (pos < input.length) {
      const token = findNextIdentifierTokenSkippingLiterals(input, pos);
      if (!token) {
        return null;
      }
      pos = token.end;
      if (String(token.name || "").toLowerCase() !== "q-rewrite") {
        continue;
      }

      let nameStart = skipWhitespaceInSource(input, token.end);
      if (!isQRewriteIdentifierStart(input[nameStart])) {
        throw new Error("Expected q-rewrite identifier after 'q-rewrite'.");
      }
      let nameEnd = nameStart + 1;
      while (nameEnd < input.length && isQRewriteIdentifierChar(input[nameEnd])) {
        nameEnd += 1;
      }
      const name = input.slice(nameStart, nameEnd);

      const open = skipWhitespaceInSource(input, nameEnd);
      if (input[open] !== "{") {
        throw new Error("Expected '{' after q-rewrite id '" + name + "'.");
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
    const qdomFacade = {
      slot: function slot(name) {
        const key = normalizeQRewriteSlotName(name);
        if (Object.prototype.hasOwnProperty.call(values, key)) {
          return String(values[key] || "");
        }
        if (Object.prototype.hasOwnProperty.call(values, "default")) {
          return String(values.default || "");
        }
        return "";
      },
    };
    return {
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
    const hasReturnBody = typeof definition.returnBody === "string" && definition.returnBody.trim().length > 0;

    if (hasReturnBody) {
      const thisArg = createQRewriteExecutionContext(slotValues);
      return evaluateQScriptBlocks(definition.returnBody, {
        maxPasses: opts.maxQScriptPasses,
        executor: function runQRewriteQScript(body) {
          return executeQScriptReplacement(body, thisArg);
        },
      });
    }

    const template = String(definition.templateBody || "");
    if (!template) {
      return slots.length === 1 ? String(slotValues[slots[0]] || "") : String(invocationBody || "");
    }
    return applyQRewriteSlotsToTemplate(template, slotValues);
  }

  function findNextQRewriteInvocation(source, definitions, fromIndex) {
    const input = String(source || "");
    const defs = definitions || {};
    let pos = Math.max(0, Number(fromIndex) || 0);

    while (pos < input.length) {
      const token = findNextIdentifierTokenSkippingLiterals(input, pos);
      if (!token) {
        return null;
      }
      pos = token.end;
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

  function collectQRewriteDefinitions(source) {
    let working = String(source || "");
    const definitions = Object.create(null);
    let pos = 0;

    while (true) {
      const found = findNextQRewriteDefinition(working, pos);
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
    const collected = collectQRewriteDefinitions(source);
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

  function executeQScriptReplacement(scriptBody, thisArg) {
    const fn = new Function(String(scriptBody || ""));
    const out = fn.call(thisArg || {});
    if (out == null) {
      return "";
    }
    return String(out);
  }

  function evaluateQScriptBlocks(source, options) {
    let out = String(source || "");
    const opts = options || {};
    const maxPasses = Number(opts.maxPasses) > 0 ? Number(opts.maxPasses) : 200;
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
        const start = findStandaloneQScriptKeyword(out, pos);
        if (start === -1) {
          break;
        }

        let open = start + 8;
        while (open < out.length && /\s/.test(out[open])) {
          open += 1;
        }
        if (out[open] !== "{") {
          pos = start + 8;
          continue;
        }

        const close = findMatchingBraceWithLiterals(out, open);
        if (close === -1) {
          throw new Error("Unterminated q-script block.");
        }

        const body = out.slice(open + 1, close);
        let replacement = executor(body, {
          source: out,
          start: start,
          open: open,
          close: close,
        });
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

  function applyPropertyToElement(elementNode, prop) {
    const key = normalizePropertyName(prop.name);
    if (core.TEXT_ALIASES.has(key)) {
      appendTextChildNode(elementNode, prop.value, {
        originalSource: prop.raw || null,
        sourceRange:
          typeof prop.start === "number" && typeof prop.end === "number"
            ? [prop.start, prop.end]
            : null,
      });
      return;
    }
    elementNode.attributes[prop.name] = prop.value;
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

  function convertElementInvocationToInstance(elementNode, definitionNode) {
    const definitionType =
      String(definitionNode && definitionNode.definitionType ? definitionNode.definitionType : "component")
        .trim()
        .toLowerCase() === "template"
        ? "template"
        : "component";
    const slotFills = splitInvocationSlotFills(elementNode, definitionNode);
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
      attributes: Object.assign({}, elementNode.attributes || {}),
      slots: slots,
      children: Array.isArray(elementNode.children) ? elementNode.children : [],
      textContent: typeof elementNode.textContent === "string" ? elementNode.textContent : null,
      selectorMode: elementNode.selectorMode || "single",
      selectorChain: Array.isArray(elementNode.selectorChain)
        ? elementNode.selectorChain.slice()
        : [String(elementNode.tagName || definitionNode.componentId || "div").trim().toLowerCase()],
      meta: Object.assign({}, elementNode.meta || {}),
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
      if (tag && tag !== "slot" && definitionRegistry.has(tag)) {
        return convertElementInvocationToInstance(node, definitionRegistry.get(tag));
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

  function processElementItems(targetElement, astItems, source) {
    for (let i = 0; i < astItems.length; i += 1) {
      const item = astItems[i];
      if (item.type === "Property") {
        applyPropertyToElement(targetElement, item);
      } else if (item.type === "HtmlBlock") {
        targetElement.children.push(core.createRawHtmlNode({ html: item.html, meta: { originalSource: item.raw } }));
      } else if (item.type === "TextBlock") {
        appendTextChildNode(targetElement, item.text, {
          originalSource: item.raw || null,
          sourceRange:
            typeof item.start === "number" && typeof item.end === "number"
              ? [item.start, item.end]
              : null,
        });
      } else if (item.type === "StyleBlock") {
        mergeStyleAttribute(targetElement, item.css);
      } else if (item.type === "RawTextLine") {
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
            const nested = convertAstItemToNode(nestedAst.body[j], resolved);
            if (nested) {
              targetElement.children.push(nested);
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
        const childNode = convertAstItemToNode(item, source);
        if (childNode) {
          targetElement.children.push(childNode);
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

  function buildComponentNodeFromAst(astNode, source, options) {
    const opts = options || {};
    const componentAttributes = {};
    const templateNodes = [];
    const methods = [];
    const lifecycleScripts = [];
    const definitionType = String(opts.definitionType || "component").trim().toLowerCase() || "component";
    let componentId = String(opts.componentId || "").trim();

    const items = Array.isArray(astNode.items) ? astNode.items : [];
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (item.type === "Property") {
        const key = normalizePropertyName(item.name);
        if (key === "id") {
          componentId = String(item.value || componentId || "").trim();
        } else {
          componentAttributes[item.name] = item.value;
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
        if (definitionType === "component") {
          methods.push({
            name: String(item.name || "").trim(),
            signature: String(item.signature || "").trim(),
            parameters: String(item.parameters || "").trim(),
            body: compactScriptBody(item.body || ""),
          });
        }
        continue;
      }
      if (item.type === "EventBlock" && item.isLifecycle) {
        if (definitionType === "component") {
          lifecycleScripts.push({
            name: String(item.name || "").trim(),
            body: compactScriptBody(item.script || ""),
          });
        }
        continue;
      }
      const node = convertAstItemToNode(item, source);
      if (node) {
        templateNodes.push(node);
      }
    }

    return core.createComponentNode({
      componentId: componentId,
      definitionType: definitionType,
      templateNodes: templateNodes,
      methods: methods,
      lifecycleScripts: lifecycleScripts,
      attributes: componentAttributes,
      meta: {
        originalSource: astNode.raw,
        sourceRange: [astNode.start, astNode.end],
      },
    });
  }

  function buildElementFromAst(astElement, source) {
    const selectors = astElement.selectors.map((entry) => String(entry).trim()).filter(Boolean);
    const prefixDirectives = Array.isArray(astElement.prefixDirectives) ? astElement.prefixDirectives.slice() : [];
    if (selectors.length === 0) {
      throw new Error("Element with empty selector list cannot be converted.");
    }

    if (selectors.length === 1 && selectors[0].toLowerCase() === "q-component") {
      return buildComponentNodeFromAst(astElement, source, {
        definitionType: "component",
      });
    }

    const selectorTokens = selectors.map(parseTagToken);
    const selectorMode = detectSelectorMode(selectorTokens);

    if (selectorMode === "class-shorthand") {
      const last = selectorTokens[selectorTokens.length - 1];
      const leaf = createElementFromToken(
        last,
        "class-shorthand",
        selectors,
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
      processElementItems(leaf, astElement.items, source);
      return leaf;
    }

    const chain = selectorTokens.map(function build(token, index) {
      return createElementFromToken(
        token,
        index === 0 && selectorTokens.length > 1 ? "nest" : "single",
        index === 0 ? selectors : [selectors[index]],
        index === 0 ? [astElement.start, astElement.end] : null,
        index === 0 ? astElement.raw : null
      );
    });

    for (let i = 0; i < chain.length - 1; i += 1) {
      chain[i].children.push(chain[i + 1]);
    }

    const leaf = chain[chain.length - 1];
    if (prefixDirectives.length > 0) {
      leaf.slotDirectives = prefixDirectives;
    }
    processElementItems(leaf, astElement.items, source);

    return chain[0];
  }

  function convertAstItemToNode(item, source) {
    if (!item || typeof item !== "object") {
      return null;
    }

    if (item.type === "Element") {
      return buildElementFromAst(item, source);
    }

    if (item.type === "TemplateDefinition") {
      return buildComponentNodeFromAst(item, source, {
        componentId: item.templateId,
        definitionType: "template",
      });
    }

    if (item.type === "ComponentDefinition") {
      const componentId = resolveComponentIdExpression(item.componentIdExpression, "");
      return buildComponentNodeFromAst(item, source, {
        componentId: componentId,
        definitionType: "component",
      });
    }

    if (item.type === "HtmlBlock") {
      return core.createRawHtmlNode({
        html: item.html,
        meta: {
          originalSource: item.raw,
          sourceRange: [item.start, item.end],
        },
      });
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
      return styleElement;
    }

    if (item.type === "TextBlock" || item.type === "RawTextLine" || item.type === "BareWord") {
      return createTextContentNode(item.type === "TextBlock" ? String(item.text || "") : String(item.text || item.name || ""), {
        originalSource: item.raw || null,
        sourceRange:
          typeof item.start === "number" && typeof item.end === "number"
            ? [item.start, item.end]
            : null,
      });
    }

    return null;
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
    const rewriteResult = applyQRewriteBlocks(effectiveSource, {
      maxPasses: opts.maxQRewritePasses,
      maxQScriptPasses: opts.maxQScriptPasses,
    });
    const rewrittenSource = rewriteResult.source;
    const evaluatedSource = evaluateQScriptBlocks(rewrittenSource, {
      maxPasses: opts.maxQScriptPasses,
    });
    const ast = parseQHtmlToAst(evaluatedSource);
    const doc = core.createDocument({ source: rawSource });

    const imports = [];
    const lifecycleScripts = [];
    for (let i = 0; i < ast.body.length; i += 1) {
      const item = ast.body[i];
      if (item.type === "ImportBlock") {
        imports.push(String(item.path || "").trim());
        continue;
      }
      if (item.type === "LifecycleBlock" && item.isLifecycle) {
        lifecycleScripts.push({
          name: String(item.name || "").trim(),
          body: compactScriptBody(item.script || ""),
        });
        continue;
      }
      const node = convertAstItemToNode(item, evaluatedSource);
      if (node) {
        doc.nodes.push(node);
      }
    }

    const definitionRegistry = buildDefinitionRegistry(doc.nodes);
    doc.nodes = normalizeNodesForDefinitions(doc.nodes, definitionRegistry);

    if (!doc.meta || typeof doc.meta !== "object") {
      doc.meta = {};
    }
    doc.meta.imports = imports.length > 0 ? imports : importUrls;
    doc.meta.resolvedSource = effectiveSource;
    doc.meta.rewrittenSource = rewrittenSource;
    doc.meta.qRewrites = rewriteResult.definitions;
    doc.meta.evaluatedSource = evaluatedSource;
    doc.meta.lifecycleScripts = lifecycleScripts;
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

    if (node.kind === core.NODE_TYPES.component) {
      const definitionType = String(node.definitionType || "").trim().toLowerCase() === "template" ? "template" : "component";
      const keyword = definitionType === "template" ? "q-template" : "q-component";
      const definitionId = String(node.componentId || "").trim();
      const lines = [indent + (definitionId ? keyword + " " + definitionId + " {" : keyword + " {")];
      const attrs = node.attributes || {};
      const attrKeys = Object.keys(attrs);
      for (let i = 0; i < attrKeys.length; i += 1) {
        const key = attrKeys[i];
        lines.push(indent + "  " + key + ": \"" + escapeQuoted(attrs[key]) + "\"");
      }
      if (definitionType === "component" && Array.isArray(node.methods)) {
        for (let i = 0; i < node.methods.length; i += 1) {
          lines.push(serializeFunctionBlock(node.methods[i], indentLevel + 1));
        }
      }
      if (definitionType === "component" && Array.isArray(node.lifecycleScripts)) {
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
      const lines = [indent + tagName + " {"];

      const attrs = node.attributes || {};
      const attrKeys = Object.keys(attrs);
      for (let i = 0; i < attrKeys.length; i += 1) {
        const key = attrKeys[i];
        lines.push(indent + "  " + key + ": \"" + escapeQuoted(attrs[key]) + "\"");
      }

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

      lines.push(indent + "}");
      return lines.join("\n");
    }

    if (node.kind !== core.NODE_TYPES.element) {
      return "";
    }

    const chain = Array.isArray(node.selectorChain) && node.selectorChain.length > 0 ? node.selectorChain : [node.tagName];
    const selectorText = node.selectorMode === "class-shorthand" ? chain.join(",") : chain[0];

    const lines = [indent + selectorText + " {"];

    if (typeof node.textContent === "string") {
      lines.push(indent + "  content: \"" + escapeQuoted(node.textContent) + "\"");
    }

    const attrs = node.attributes || {};
    const attrKeys = Object.keys(attrs);
    for (let i = 0; i < attrKeys.length; i += 1) {
      const key = attrKeys[i];
      lines.push(indent + "  " + key + ": \"" + escapeQuoted(attrs[key]) + "\"");
    }

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
    applyQRewriteBlocks: applyQRewriteBlocks,
    resolveQImportsSync: resolveQImportsSync,
    resolveQImportsAsync: resolveQImportsAsync,
    qdomToQHtml: qdomToQHtml,
    parseQScript: parseQScript,
    serializeQScript: serializeQScript,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
