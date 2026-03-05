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
  const DEPRECATED_FEATURE_WARNED = new Set();
  const CANONICAL_KEYWORD_TARGETS = new Set([
    "q-component",
    "q-template",
    "q-macro",
    "q-rewrite",
    "q-script",
    "q-bind",
    "q-property",
    "q-signal",
    "q-alias",
    "q-style",
    "q-style-class",
    "q-theme",
    "q-color",
    "q-color-schema",
    "q-color-theme",
    "q-import",
    "slot",
    "style",
    "text",
    "html",
  ]);

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
      nameLower === "q-style" ||
      nameLower === "q-theme"
    ) {
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
      type: resolvedKeyword === "q-bind" ? "QBindExpression" : "QScriptExpression",
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
          const propertyName = parseIdentifier(parser);
          const normalizedPropertyName = String(propertyName || "").trim();
          if (!normalizedPropertyName) {
            throw ParseError("Expected property name after property", parser.index);
          }
          skipWhitespace(parser);
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

          if (nameLower === "q-bind" || nameLower === "q-script") {
            consume(parser);
            const expressionBody = readBalancedBlockContent(parser);
            const expressionType = nameLower === "q-script" ? "QScriptExpression" : "QBindExpression";
            items.push({
              type: "Property",
              name: "content",
              value: {
                type: expressionType,
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
          const items = parseBlockItems(parser, scopedKeywordAliases);
          expect(parser, "}");

          body.push({
            type: "ComponentDefinition",
            componentIdExpression: componentIdExpression,
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
    return {
      qColors: createQColorContext(parentColors),
      qStyles: createQStyleContext(parentStyles),
    };
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

  function registerQThemeDefinition(styleContext, themeName, rules) {
    if (!styleContext || !(styleContext.themes instanceof Map)) {
      return;
    }
    const name = String(themeName || "").trim();
    const normalized = normalizeColorLookupKey(name);
    if (!name || !normalized) {
      return;
    }
    styleContext.themes.set(normalized, {
      name: name,
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
    if (!styleContext || !Array.isArray(styleContext.activeThemes)) {
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
    styleContext.activeThemes.push({
      name: themeName,
      rules: expandedRules,
    });
  }

  function createQStyleContext(parentContext) {
    const context = {
      styles: new Map(),
      themes: new Map(),
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
    if (parsed.id && String(attrs.id || "").trim() !== parsed.id) {
      return false;
    }
    if (Array.isArray(parsed.classes) && parsed.classes.length > 0) {
      const classNameSet = new Set(String(attrs.class || "").split(/\s+/).filter(Boolean));
      for (let i = 0; i < parsed.classes.length; i += 1) {
        if (!classNameSet.has(parsed.classes[i])) {
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
    if (!styleContext || !Array.isArray(styleContext.activeThemes) || styleContext.activeThemes.length === 0) {
      return;
    }
    for (let ti = 0; ti < styleContext.activeThemes.length; ti += 1) {
      const theme = styleContext.activeThemes[ti];
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
      const key = normalizeScopedReferenceKey(expression);
      if (refs && key && Object.prototype.hasOwnProperty.call(refs, key)) {
        const referenceValue = refs[key];
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
    const fn = new Function(String(scriptBody || ""));
    const out = fn.call(thisArg || {});
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
    return String(expressionType || "").trim().toLowerCase() === "qscriptexpression" ? "q-script" : "q-bind";
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

  function applyPropertyToElement(elementNode, prop) {
    const assignment = parseAssignmentName(prop.name);
    const key = normalizePropertyName(assignment.name);
    const value = coercePropertyValue(prop.value);
    if (isBindingExpressionValue(prop.value)) {
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

  function convertElementInvocationToInstance(elementNode, definitionNode) {
    const explicitType = String(definitionNode && definitionNode.definitionType ? definitionNode.definitionType : "component")
      .trim()
      .toLowerCase();
    const definitionType = explicitType === "template" ? "template" : explicitType === "signal" ? "signal" : "component";
    const slotFills = splitInvocationSlotFills(elementNode, definitionNode);
    const declaredProperties = new Set(
      (Array.isArray(definitionNode && definitionNode.properties) ? definitionNode.properties : [])
        .map(normalizePropertyName)
        .filter(Boolean)
    );
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
    registerQThemeDefinition(styleContext, themeName, normalizedRules);
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

  function processElementItems(targetElement, astItems, source, context) {
    const colorContext =
      context && context.qColors && typeof context.qColors === "object"
        ? context.qColors
        : createQColorContext();
    const styleContext =
      context && context.qStyles && typeof context.qStyles === "object"
        ? context.qStyles
        : createQStyleContext();
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
      const namedTheme = resolveNamedQThemeInvocation(item, styleContext);
      if (namedTheme && Array.isArray(item.items) && item.items.length > 0) {
        const invocationContext = createScopedConversionContext({ qColors: colorContext, qStyles: styleContext });
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
        const invocationContext = createScopedConversionContext({ qColors: colorContext, qStyles: styleContext });
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
      if (item.type === "Property") {
        applyPropertyToElement(targetElement, item);
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
            const nested = convertAstItemToNode(
              nestedAst.body[j],
              resolved,
              createScopedConversionContext({ qColors: colorContext, qStyles: styleContext })
            );
            if (nested) {
              appendChildNode(nested);
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
        const childNode = convertAstItemToNode(
          item,
          source,
          createScopedConversionContext({ qColors: colorContext, qStyles: styleContext })
        );
        if (childNode) {
          appendChildNode(childNode);
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
    const componentAttributes = {};
    const componentProperties = [];
    const componentPropertiesSeen = new Set();
    const templateNodes = [];
    const propertyDefinitions = [];
    const methods = [];
    const signalDeclarations = [];
    const aliasDeclarations = [];
    const lifecycleScripts = [];
    const definitionType = String(opts.definitionType || "component").trim().toLowerCase() || "component";
    let componentId = String(opts.componentId || "").trim();

    const items = Array.isArray(astNode.items) ? astNode.items : [];
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      const namedTheme = resolveNamedQThemeInvocation(item, styleContext);
      if (namedTheme && Array.isArray(item.items) && item.items.length > 0) {
        const invocationContext = createScopedConversionContext({ qColors: colorContext, qStyles: styleContext });
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
        const invocationContext = createScopedConversionContext({ qColors: colorContext, qStyles: styleContext });
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
      if (item.type === "Property") {
        const assignment = parseAssignmentName(item.name);
        const key = normalizePropertyName(assignment.name);
        const value = coercePropertyValue(item.value);
        if (key === "id" && !componentId) {
          componentId = String(value || "").trim();
        } else {
          componentAttributes[assignment.name] = value;
        }
        continue;
      }
      if (item.type === "PropertyDefinitionBlock") {
        if (definitionType === "component") {
          const propertyName = String(item.name || "").trim();
          const normalized = normalizePropertyName(propertyName);
          if (propertyName && normalized && !componentPropertiesSeen.has(normalized)) {
            componentPropertiesSeen.add(normalized);
            componentProperties.push(propertyName);
          }
          const propertyNodes = [];
          const nestedItems = Array.isArray(item.items) ? item.items : [];
          for (let j = 0; j < nestedItems.length; j += 1) {
            const propertyNode = convertAstItemToNode(nestedItems[j], source, scopedContext);
            if (!propertyNode) {
              continue;
            }
            if (propertyName) {
              markPropertyBindingNode(propertyNode, propertyName);
            }
            propertyNodes.push(propertyNode);
          }
          propertyDefinitions.push({
            name: propertyName,
            nodes: propertyNodes,
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
      if (item.type === "SignalDeclaration") {
        if (definitionType === "component") {
          const signalName = String(item.name || "").trim();
          if (signalName) {
            signalDeclarations.push({
              name: signalName,
              signature: String(item.signature || "").trim(),
              parameters: Array.isArray(item.parameters) ? item.parameters.slice() : [],
            });
          }
        }
        continue;
      }
      if (item.type === "AliasDeclaration") {
        if (definitionType === "component") {
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
      if (item.type === "EventBlock" && item.isLifecycle) {
        if (definitionType === "component") {
          lifecycleScripts.push({
            name: String(item.name || "").trim(),
            body: compactScriptBody(item.script || ""),
          });
        }
        continue;
      }
      const node = convertAstItemToNode(item, source, scopedContext);
      if (node) {
        templateNodes.push(node);
      }
    }

    const componentNode = core.createComponentNode({
      componentId: componentId,
      definitionType: definitionType,
      templateNodes: templateNodes,
      methods: methods,
      propertyDefinitions: propertyDefinitions,
      signalDeclarations: signalDeclarations,
      aliasDeclarations: aliasDeclarations,
      lifecycleScripts: lifecycleScripts,
      attributes: componentAttributes,
      properties: componentProperties,
      meta: {
        originalSource: astNode.raw,
        sourceRange: [astNode.start, astNode.end],
      },
    });
    applyKeywordAliasesToNode(componentNode, astNode.keywords);
    return componentNode;
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

    if (selectors.length === 1 && selectors[0].toLowerCase() === "q-component") {
      return buildComponentNodeFromAst(astElement, source, {
        definitionType: "component",
      }, scopedContext);
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
      processElementItems(leaf, astElement.items, source, leafContext);
      applyKeywordAliasesToNode(leaf, astElement.keywords);
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

    return chain[0];
  }

  function convertAstItemToNode(item, source, context) {
    if (!item || typeof item !== "object") {
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
      return buildComponentNodeFromAst(item, source, {
        componentId: componentId,
        definitionType: "component",
      }, context);
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
        return !isAssignmentQScriptContext(context && context.source, context && context.start);
      },
    });
    const ast = parseQHtmlToAst(evaluatedSource);
    const doc = core.createDocument({ source: rawSource });
    const conversionContext = createScopedConversionContext();

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
      const node = convertAstItemToNode(item, evaluatedSource, createScopedConversionContext(conversionContext));
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
    doc.meta.macroExpandedSource = macroExpandedSource;
    doc.meta.qMacros = macroResult.definitions;
    doc.meta.rewrittenSource = rewrittenSource;
    doc.meta.qRewrites = rewriteResult.definitions;
    doc.meta.evaluatedSource = evaluatedSource;
    doc.meta.lifecycleScripts = lifecycleScripts;
    doc.meta.qColorSchemas = serializeQColorSchemas(conversionContext.qColors);
    doc.meta.qColorSchemaDefs = serializeQColorSchemaDefinitions(conversionContext.qColors);
    doc.meta.qColorDefs = serializeQColorDefinitions(conversionContext.qColors);
    doc.meta.qColorThemes = serializeQColorThemes(conversionContext.qColors);
    doc.meta.qColorDefaultTheme = String(
      conversionContext.qColors && conversionContext.qColors.defaultThemeName
        ? conversionContext.qColors.defaultThemeName
        : DEFAULT_QCOLOR_THEME_NAME
    ).trim() || DEFAULT_QCOLOR_THEME_NAME;
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
    const expressionType = normalizeBindingExpressionKind(spec.expressionType);
    const keyword = expressionType === "q-script" ? "q-script" : "q-bind";
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
      const explicitDefinitionType = String(node.definitionType || "").trim().toLowerCase();
      const definitionType =
        explicitDefinitionType === "template" ? "template" : explicitDefinitionType === "signal" ? "signal" : "component";
      const keyword = definitionType === "template" ? "q-template" : definitionType === "signal" ? "q-signal" : "q-component";
      const definitionId = String(node.componentId || "").trim();
      const lines = [indent + (definitionId ? keyword + " " + definitionId + " {" : keyword + " {")];
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
        lines.push(indent + "  " + key + ": \"" + escapeQuoted(coercePropertyValue(attrs[key])) + "\"");
      }
      if (definitionType === "component" && Array.isArray(node.propertyDefinitions)) {
        for (let i = 0; i < node.propertyDefinitions.length; i += 1) {
          const serializedPropertyDefinition = serializePropertyDefinitionBlock(node.propertyDefinitions[i], indentLevel + 1);
          if (serializedPropertyDefinition) {
            lines.push(serializedPropertyDefinition);
          }
        }
      }
      if (definitionType === "component" && Array.isArray(node.methods)) {
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
          lines.push(indent + "  " + key + ": \"" + escapeQuoted(coercePropertyValue(attrs[key])) + "\"");
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
          lines.push(indent + "  " + key + ": \"" + escapeQuoted(coercePropertyValue(props[key])) + "\"");
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
        lines.push(indent + "  " + key + ": \"" + escapeQuoted(coercePropertyValue(attrs[key])) + "\"");
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
