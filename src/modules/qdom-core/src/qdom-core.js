(function attachQDomCore(global) {
  const modules = global.QHtmlModules || (global.QHtmlModules = {});

  const NODE_TYPES = Object.freeze({
    document: "document",
    element: "element",
    text: "text",
    rawHtml: "raw-html",
    model: "model",
    repeater: "repeater",
    component: "component",
    componentInstance: "component-instance",
    templateInstance: "template-instance",
    struct: "struct",
    structInstance: "struct-instance",
    class: "class",
    classInstance: "class-instance",
    slot: "slot",
    slotDefault: "slot-default",
    scriptRule: "script-rule",
    color: "color",
  });

  const TEXT_ALIASES = new Set(["content", "contents", "text", "textcontents", "innertext"]);
  const QDOM_HOST_ID_ATTR = "data-qdom-host-id";
  const QDOM_TEMPLATE_OWNER_ATTR = "data-qdom-for";
  const UPDATE_NONCE_KEY = "update-nonce";
  const QDOM_UUID_KEY = "uuid";
  const QCSS_VALUE_MARKER = "__qhtmlCssValue";
  const QCSS_SUPPORTED_UNITS = new Set(["", "px", "%", "vw", "vh", "rem", "em"]);
  const QCSS_LITERAL_PATTERN = /^\s*(-?(?:\d+\.\d+|\d+|\.\d+)(?:[eE][+-]?\d+)?)\s*(px|%|vw|vh|rem|em)?\s*$/i;
  const QCSS_LITERAL_TOKEN_PATTERN = /-?(?:\d+\.\d+|\d+|\.\d+)(?:[eE][+-]?\d+)?(?:px|%|vw|vh|rem|em)\b|-?(?:\d+\.\d+|\d+|\.\d+)(?:[eE][+-]?\d+)?%/gi;
  let qdomHostIdCounter = 0;
  let qdomUuidCounter = 0;

  function normalizeCssUnit(unit) {
    const normalized = String(unit || "").trim().toLowerCase();
    return QCSS_SUPPORTED_UNITS.has(normalized) ? normalized : normalized;
  }

  function normalizeCssNumber(value) {
    const numeric = typeof value === "number" ? value : Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  }

  function formatCssNumber(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return "0";
    }
    if (Object.is(numeric, -0)) {
      return "0";
    }
    return String(Math.round(numeric * 1000000) / 1000000);
  }

  function getCssContextElement(context) {
    if (context && typeof context === "object") {
      if (context.nodeType === 1) {
        return context;
      }
      if (context.component && context.component.nodeType === 1) {
        return context.component;
      }
      if (context.host && context.host.nodeType === 1) {
        return context.host;
      }
      if (context.element && context.element.nodeType === 1) {
        return context.element;
      }
    }
    return global && global.document && global.document.documentElement
      ? global.document.documentElement
      : null;
  }

  function readComputedStyleValue(element, propertyName) {
    if (!element || !global || typeof global.getComputedStyle !== "function") {
      return "";
    }
    try {
      const computed = global.getComputedStyle(element);
      if (!computed) {
        return "";
      }
      const prop = String(propertyName || "").trim();
      if (prop && typeof computed.getPropertyValue === "function") {
        const cssName = prop.indexOf("-") >= 0 ? prop : prop.replace(/[A-Z]/g, function replaceUpper(match) {
          return "-" + match.toLowerCase();
        });
        const direct = computed.getPropertyValue(cssName);
        if (direct) {
          return direct;
        }
      }
      return prop && Object.prototype.hasOwnProperty.call(computed, prop) ? computed[prop] : "";
    } catch (error) {
      return "";
    }
  }

  function readCssPixelBasis(element, propertyName) {
    const prop = String(propertyName || "").trim().toLowerCase();
    const useHeight = prop === "height" || prop === "top" || prop === "bottom" || prop.indexOf("height") >= 0;
    const useWidth = prop === "width" || prop === "left" || prop === "right" || prop.indexOf("width") >= 0;
    const parent = element && element.parentNode && element.parentNode.nodeType === 1 ? element.parentNode : null;
    const target = parent || element;
    if (!target) {
      return null;
    }
    if (useWidth) {
      const width = Number(target.clientWidth || 0);
      if (Number.isFinite(width) && width > 0) {
        return width;
      }
      const computedWidth = parseFloat(readComputedStyleValue(target, "width"));
      return Number.isFinite(computedWidth) ? computedWidth : null;
    }
    if (useHeight) {
      const height = Number(target.clientHeight || 0);
      if (Number.isFinite(height) && height > 0) {
        return height;
      }
      const computedHeight = parseFloat(readComputedStyleValue(target, "height"));
      return Number.isFinite(computedHeight) ? computedHeight : null;
    }
    return null;
  }

  class QCssValue {
    constructor(options) {
      const opts = options && typeof options === "object" ? options : {};
      this[QCSS_VALUE_MARKER] = true;
      this.value = Object.prototype.hasOwnProperty.call(opts, "value") ? normalizeCssNumber(opts.value) : 0;
      this.unit = normalizeCssUnit(opts.unit);
      this.op = String(opts.op || "").trim();
      this.left = opts.left || null;
      this.right = opts.right || null;
      this.raw = typeof opts.raw === "string" ? opts.raw : "";
      this.property = typeof opts.property === "string" ? opts.property : "";
      defineCssContext(this, opts.context || null);
    }

    withContext(context, property) {
      const next = new QCssValue({
        value: this.value,
        unit: this.unit,
        op: this.op,
        left: isCssValue(this.left) ? this.left.withContext(context, property) : this.left,
        right: isCssValue(this.right) ? this.right.withContext(context, property) : this.right,
        raw: this.raw,
        property: typeof property === "string" && property ? property : this.property,
        context: context || readCssContext(this),
      });
      return next;
    }

    toString() {
      return serializeCssValue(this, readCssContext(this), this.property);
    }

    valueOf() {
      const resolved = resolveCssValue(this, readCssContext(this), this.property);
      return resolved && resolved.resolved ? resolved.value : Number.NaN;
    }

    [Symbol.toPrimitive](hint) {
      if (hint === "number") {
        return this.valueOf();
      }
      return this.toString();
    }

    toJSON() {
      return {
        [QCSS_VALUE_MARKER]: true,
        value: this.value,
        unit: this.unit,
        op: this.op,
        left: this.left,
        right: this.right,
        raw: this.raw,
        property: this.property,
      };
    }
  }

  function defineCssContext(value, context) {
    if (!value || typeof value !== "object") {
      return value;
    }
    try {
      Object.defineProperty(value, "__qhtmlCssContext", {
        configurable: true,
        enumerable: false,
        writable: true,
        value: context || null,
      });
    } catch (error) {
      value.__qhtmlCssContext = context || null;
    }
    return value;
  }

  function readCssContext(value) {
    return value && typeof value === "object" ? value.__qhtmlCssContext || null : null;
  }

  function isCssValue(value) {
    return !!(value && typeof value === "object" && value[QCSS_VALUE_MARKER] === true);
  }

  function parseCssValue(value, options) {
    if (isCssValue(value)) {
      const opts = options && typeof options === "object" ? options : {};
      return opts.context || opts.property ? value.withContext(opts.context || readCssContext(value), opts.property || value.property) : value;
    }
    if (value && typeof value === "object" && value[QCSS_VALUE_MARKER] === true) {
      return createCssValue(value, "", options);
    }
    if (typeof value !== "string") {
      return null;
    }
    const match = String(value || "").trim().match(QCSS_LITERAL_PATTERN);
    if (!match) {
      return null;
    }
    return createCssValue(Number(match[1]), match[2] || "", options);
  }

  function createCssValue(value, unit, options) {
    const opts = options && typeof options === "object" ? options : {};
    if (isCssValue(value)) {
      return value.withContext(opts.context || readCssContext(value), opts.property || value.property);
    }
    if (value && typeof value === "object" && value[QCSS_VALUE_MARKER] === true) {
      return new QCssValue({
        value: value.value,
        unit: value.unit,
        op: value.op,
        left: value.left ? createCssValue(value.left, "", opts) : null,
        right: value.right ? createCssValue(value.right, "", opts) : null,
        raw: value.raw,
        property: opts.property || value.property,
        context: opts.context || null,
      });
    }
    if (typeof value === "string" && typeof unit === "undefined") {
      const parsed = parseCssValue(value, opts);
      if (parsed) {
        return parsed;
      }
    }
    return new QCssValue({
      value: value,
      unit: unit,
      property: opts.property || "",
      context: opts.context || null,
    });
  }

  function createCssExpressionValue(op, left, right, options) {
    const opts = options && typeof options === "object" ? options : {};
    return new QCssValue({
      op: op,
      left: coerceCssOperand(left, opts),
      right: coerceCssOperand(right, opts),
      property: opts.property || "",
      context: opts.context || null,
    });
  }

  function unwrapCssOperandHandle(value) {
    if (!value || (typeof value !== "object" && typeof value !== "function")) {
      return value;
    }
    try {
      if (value.__qhtmlVarHandle === true) {
        if (typeof value.get === "function") {
          return value.get();
        }
        if (typeof value.valueOf === "function") {
          return value.valueOf();
        }
      }
    } catch (error) {
      return value;
    }
    return value;
  }

  function coerceCssOperand(value, options) {
    const opts = options && typeof options === "object" ? options : {};
    value = unwrapCssOperandHandle(value);
    if (isCssValue(value) || (value && typeof value === "object" && value[QCSS_VALUE_MARKER] === true)) {
      return createCssValue(value, "", opts);
    }
    const parsed = parseCssValue(value, opts);
    if (parsed) {
      return parsed;
    }
    return value;
  }

  function operandIsCssLike(value) {
    return isCssValue(value) || !!parseCssValue(value);
  }

  function cssCalcOperand(value, context, property) {
    const cssValue = coerceCssOperand(value, { context: context, property: property });
    if (isCssValue(cssValue)) {
      if (cssValue.op) {
        return "(" + cssCalcOperand(cssValue.left, context, property) + " " + cssValue.op + " " + cssCalcOperand(cssValue.right, context, property) + ")";
      }
      return formatCssNumber(cssValue.value) + (cssValue.unit || "");
    }
    return String(cssValue == null ? "" : cssValue);
  }

  function resolveCssValue(value, context, property) {
    const cssValue = coerceCssOperand(value, { context: context, property: property });
    if (!isCssValue(cssValue)) {
      const numeric = Number(cssValue);
      return Number.isFinite(numeric)
        ? { resolved: true, value: numeric, unit: "" }
        : { resolved: false, value: Number.NaN, unit: "" };
    }
    const element = getCssContextElement(context || readCssContext(cssValue));
    const prop = property || cssValue.property || "";
    if (cssValue.op) {
      const left = resolveCssValue(cssValue.left, element, prop);
      const right = resolveCssValue(cssValue.right, element, prop);
      if (left.resolved && right.resolved) {
        if (cssValue.op === "+") {
          return { resolved: true, value: left.value + right.value, unit: "px" };
        }
        if (cssValue.op === "-") {
          return { resolved: true, value: left.value - right.value, unit: "px" };
        }
        if (cssValue.op === "*") {
          return { resolved: true, value: left.value * right.value, unit: left.unit || right.unit || "" };
        }
        if (cssValue.op === "/") {
          return right.value === 0
            ? { resolved: false, value: Number.NaN, unit: "" }
            : { resolved: true, value: left.value / right.value, unit: left.unit || "" };
        }
      }
      return { resolved: false, value: Number.NaN, unit: "" };
    }
    const amount = Number(cssValue.value);
    const unit = normalizeCssUnit(cssValue.unit);
    if (!Number.isFinite(amount)) {
      return { resolved: false, value: Number.NaN, unit: unit };
    }
    if (!unit || unit === "px") {
      return { resolved: true, value: amount, unit: unit || "" };
    }
    if (unit === "vw") {
      const width = global && Number(global.innerWidth || (global.document && global.document.documentElement && global.document.documentElement.clientWidth) || 0);
      return Number.isFinite(width) && width > 0
        ? { resolved: true, value: width * amount / 100, unit: "px" }
        : { resolved: false, value: Number.NaN, unit: unit };
    }
    if (unit === "vh") {
      const height = global && Number(global.innerHeight || (global.document && global.document.documentElement && global.document.documentElement.clientHeight) || 0);
      return Number.isFinite(height) && height > 0
        ? { resolved: true, value: height * amount / 100, unit: "px" }
        : { resolved: false, value: Number.NaN, unit: unit };
    }
    if (unit === "rem") {
      const root = global && global.document ? global.document.documentElement : null;
      const fontSize = parseFloat(readComputedStyleValue(root, "font-size") || readComputedStyleValue(root, "fontSize") || "16");
      return Number.isFinite(fontSize)
        ? { resolved: true, value: amount * fontSize, unit: "px" }
        : { resolved: false, value: Number.NaN, unit: unit };
    }
    if (unit === "em") {
      const fontSize = parseFloat(readComputedStyleValue(element, "font-size") || readComputedStyleValue(element, "fontSize") || "16");
      return Number.isFinite(fontSize)
        ? { resolved: true, value: amount * fontSize, unit: "px" }
        : { resolved: false, value: Number.NaN, unit: unit };
    }
    if (unit === "%") {
      const basis = readCssPixelBasis(element, prop);
      return Number.isFinite(basis)
        ? { resolved: true, value: basis * amount / 100, unit: "px" }
        : { resolved: false, value: Number.NaN, unit: unit };
    }
    return { resolved: false, value: Number.NaN, unit: unit };
  }

  function simplifyCssOperation(op, left, right, options) {
    const opts = options && typeof options === "object" ? options : {};
    const leftValue = coerceCssOperand(left, opts);
    const rightValue = coerceCssOperand(right, opts);
    const leftCss = isCssValue(leftValue);
    const rightCss = isCssValue(rightValue);
    if (op === "+" && !leftCss && !rightCss) {
      if (typeof leftValue === "string" || typeof rightValue === "string") {
        return String(leftValue == null ? "" : leftValue) + String(rightValue == null ? "" : rightValue);
      }
      return Number(leftValue || 0) + Number(rightValue || 0);
    }
    if (op === "-" && !leftCss && !rightCss) {
      return Number(leftValue || 0) - Number(rightValue || 0);
    }
    if (op === "*" && !leftCss && !rightCss) {
      return Number(leftValue || 0) * Number(rightValue || 0);
    }
    if (op === "/" && !leftCss && !rightCss) {
      return Number(rightValue || 0) === 0 ? Number.NaN : Number(leftValue || 0) / Number(rightValue || 0);
    }
    if ((op === "+" || op === "-") && leftCss && rightCss && !leftValue.op && !rightValue.op && leftValue.unit === rightValue.unit) {
      return createCssValue(
        op === "+" ? leftValue.value + rightValue.value : leftValue.value - rightValue.value,
        leftValue.unit,
        opts
      );
    }
    if ((op === "*" || op === "/") && leftCss && !rightCss && !leftValue.op) {
      const numeric = Number(rightValue);
      if (Number.isFinite(numeric)) {
        return createCssValue(op === "*" ? leftValue.value * numeric : leftValue.value / numeric, leftValue.unit, opts);
      }
    }
    if (op === "*" && !leftCss && rightCss && !rightValue.op) {
      const numeric = Number(leftValue);
      if (Number.isFinite(numeric)) {
        return createCssValue(rightValue.value * numeric, rightValue.unit, opts);
      }
    }
    const expression = createCssExpressionValue(op, leftValue, rightValue, opts);
    const resolved = resolveCssValue(expression, opts.context || null, opts.property || "");
    return resolved.resolved ? createCssValue(resolved.value, "px", opts) : expression;
  }

  function serializeCssValue(value, context, property) {
    const cssValue = coerceCssOperand(value, { context: context, property: property });
    if (!isCssValue(cssValue)) {
      return String(cssValue == null ? "" : cssValue);
    }
    const prop = property || cssValue.property || "";
    const ctx = context || readCssContext(cssValue);
    if (cssValue.op) {
      const resolved = resolveCssValue(cssValue, ctx, prop);
      if (resolved.resolved) {
        return formatCssNumber(resolved.value) + "px";
      }
      return "calc(" + cssCalcOperand(cssValue.left, ctx, prop) + " " + cssValue.op + " " + cssCalcOperand(cssValue.right, ctx, prop) + ")";
    }
    return formatCssNumber(cssValue.value) + (cssValue.unit || "");
  }

  function cssAdd(left, right, options) {
    return simplifyCssOperation("+", left, right, options);
  }

  function cssSub(left, right, options) {
    return simplifyCssOperation("-", left, right, options);
  }

  function cssMul(left, right, options) {
    return simplifyCssOperation("*", left, right, options);
  }

  function cssDiv(left, right, options) {
    return simplifyCssOperation("/", left, right, options);
  }

  function createCssContextHelper(context, property) {
    const opts = { context: context || null, property: property || "" };
    return {
      v: function cssContextValue(value, unit) {
        return typeof unit === "undefined" ? createCssValue(value, undefined, opts) : createCssValue(value, unit, opts);
      },
      css: function cssContextCss(value, unit) {
        return typeof unit === "undefined" ? createCssValue(value, undefined, opts) : createCssValue(value, unit, opts);
      },
      add: function cssContextAdd(left, right) {
        return cssAdd(left, right, opts);
      },
      sub: function cssContextSub(left, right) {
        return cssSub(left, right, opts);
      },
      mul: function cssContextMul(left, right) {
        return cssMul(left, right, opts);
      },
      div: function cssContextDiv(left, right) {
        return cssDiv(left, right, opts);
      },
      resolve: function cssContextResolve(value, targetContext, targetProperty) {
        return resolveCssValue(value, targetContext || opts.context, targetProperty || opts.property);
      },
      serialize: function cssContextSerialize(value, targetContext, targetProperty) {
        return serializeCssValue(value, targetContext || opts.context, targetProperty || opts.property);
      },
    };
  }

  function skipQuotedSource(source, index) {
    const quote = source.charAt(index);
    let cursor = index + 1;
    while (cursor < source.length) {
      const ch = source.charAt(cursor);
      if (ch === "\\") {
        cursor += 2;
        continue;
      }
      cursor += 1;
      if (ch === quote) {
        break;
      }
    }
    return cursor;
  }

  function splitTopLevelArguments(source) {
    const args = [];
    let depth = 0;
    let start = 0;
    let cursor = 0;
    while (cursor < source.length) {
      const ch = source.charAt(cursor);
      if (ch === "\"" || ch === "'" || ch === "`") {
        cursor = skipQuotedSource(source, cursor);
        continue;
      }
      if (ch === "(" || ch === "[" || ch === "{") {
        depth += 1;
      } else if (ch === ")" || ch === "]" || ch === "}") {
        depth = Math.max(0, depth - 1);
      } else if (ch === "," && depth === 0) {
        args.push(source.slice(start, cursor).trim());
        start = cursor + 1;
      }
      cursor += 1;
    }
    const tail = source.slice(start).trim();
    if (tail) {
      args.push(tail);
    }
    return args;
  }

  function readBalancedExpressionCall(source, openIndex) {
    let depth = 0;
    let cursor = openIndex;
    while (cursor < source.length) {
      const ch = source.charAt(cursor);
      if (ch === "\"" || ch === "'" || ch === "`") {
        cursor = skipQuotedSource(source, cursor);
        continue;
      }
      if (ch === "(") {
        depth += 1;
      } else if (ch === ")") {
        depth -= 1;
        if (depth === 0) {
          return cursor + 1;
        }
      }
      cursor += 1;
    }
    return source.length;
  }

  function sourceHasUnquotedPattern(source, pattern) {
    const text = String(source || "");
    let cursor = 0;
    let segmentStart = 0;
    function testSegment(end) {
      if (end <= segmentStart) {
        return false;
      }
      pattern.lastIndex = 0;
      const matched = pattern.test(text.slice(segmentStart, end));
      pattern.lastIndex = 0;
      return matched;
    }
    while (cursor < text.length) {
      const ch = text.charAt(cursor);
      if (ch === "\"" || ch === "'" || ch === "`") {
        if (testSegment(cursor)) {
          return true;
        }
        cursor = skipQuotedSource(text, cursor);
        segmentStart = cursor;
        continue;
      }
      cursor += 1;
    }
    return testSegment(text.length);
  }

  function sourceHasCssExpressionSignal(source) {
    return sourceHasUnquotedPattern(source, QCSS_LITERAL_TOKEN_PATTERN) ||
      sourceHasUnquotedPattern(source, /(?:^|[^A-Za-z0-9_$])(?:qcss\s*\.|css\s*\()/g) ||
      sourceHasUnquotedPattern(source, /\.style\./g);
  }

  function tokenizeCssExpression(source) {
    const text = String(source || "");
    const tokens = [];
    let cursor = 0;
    while (cursor < text.length) {
      const ch = text.charAt(cursor);
      if (/\s/.test(ch)) {
        cursor += 1;
        continue;
      }
      QCSS_LITERAL_TOKEN_PATTERN.lastIndex = 0;
      const literalMatch = QCSS_LITERAL_TOKEN_PATTERN.exec(text.slice(cursor));
      QCSS_LITERAL_TOKEN_PATTERN.lastIndex = 0;
      if (literalMatch && literalMatch.index === 0) {
        const token = literalMatch[0];
        const prev = cursor > 0 ? text.charAt(cursor - 1) : "";
        const next = text.charAt(cursor + token.length);
        if (!/[A-Za-z0-9_$.)\]]/.test(prev) && !/[A-Za-z0-9_$]/.test(next)) {
          tokens.push({ type: "atom", text: "qcss.v(" + JSON.stringify(token) + ")", cssAware: true });
          cursor += token.length;
          continue;
        }
      }
      if (ch === "\"" || ch === "'" || ch === "`") {
        const end = skipQuotedSource(text, cursor);
        const raw = text.slice(cursor, end);
        tokens.push({ type: "atom", text: raw, cssAware: false });
        cursor = end;
        continue;
      }
      if (ch === "(" || ch === ")") {
        tokens.push({ type: ch, text: ch, cssAware: false });
        cursor += 1;
        continue;
      }
      if (ch === "+" || ch === "-" || ch === "*" || ch === "/") {
        tokens.push({ type: "op", text: ch, cssAware: false });
        cursor += 1;
        continue;
      }
      if (/[A-Za-z_$]/.test(ch)) {
        const start = cursor;
        cursor += 1;
        while (cursor < text.length && /[A-Za-z0-9_$.]/.test(text.charAt(cursor))) {
          cursor += 1;
        }
        if (text.charAt(cursor) === "(") {
          const end = readBalancedExpressionCall(text, cursor);
          tokens.push({ type: "atom", text: text.slice(start, end), cssAware: text.slice(start, end).indexOf("qcss.") >= 0 });
          cursor = end;
          continue;
        }
        const atom = text.slice(start, cursor);
        tokens.push({ type: "atom", text: atom, cssAware: atom.indexOf(".style.") >= 0 || atom.indexOf("qcss.") >= 0 });
        continue;
      }
      if (/\d/.test(ch) || (ch === "." && /\d/.test(text.charAt(cursor + 1)))) {
        const match = text.slice(cursor).match(/^(?:\d+\.\d+|\d+|\.\d+)(?:[eE][+-]?\d+)?/);
        if (match) {
          tokens.push({ type: "atom", text: match[0], cssAware: false });
          cursor += match[0].length;
          continue;
        }
      }
      return null;
    }
    return tokens;
  }

  function parseCssExpressionTokens(tokens) {
    let cursor = 0;
    function precedence(op) {
      return op === "*" || op === "/" ? 2 : op === "+" || op === "-" ? 1 : 0;
    }
    function parsePrimary() {
      const token = tokens[cursor];
      if (!token) {
        return { text: "", cssAware: false };
      }
      if (token.type === "op" && (token.text === "+" || token.text === "-")) {
        cursor += 1;
        const inner = parsePrimary();
        return {
          text: token.text === "-" ? "qcss.mul(" + inner.text + ", -1)" : inner.text,
          cssAware: inner.cssAware,
        };
      }
      if (token.type === "(") {
        cursor += 1;
        const inner = parseBinary(0);
        if (tokens[cursor] && tokens[cursor].type === ")") {
          cursor += 1;
        }
        return { text: "(" + inner.text + ")", cssAware: inner.cssAware };
      }
      if (token.type === "atom") {
        cursor += 1;
        return { text: token.text, cssAware: token.cssAware };
      }
      return { text: "", cssAware: false };
    }
    function parseBinary(minPrecedence) {
      let left = parsePrimary();
      while (cursor < tokens.length) {
        const token = tokens[cursor];
        if (!token || token.type !== "op") {
          break;
        }
        const prec = precedence(token.text);
        if (prec < minPrecedence || prec === 0) {
          break;
        }
        cursor += 1;
        const right = parseBinary(prec + 1);
        const helper = token.text === "+"
          ? "add"
          : token.text === "-"
            ? "sub"
            : token.text === "*"
              ? "mul"
              : "div";
        left = {
          text: "qcss." + helper + "(" + left.text + ", " + right.text + ")",
          cssAware: true,
        };
      }
      return left;
    }
    const parsed = parseBinary(0);
    if (cursor < tokens.length) {
      return null;
    }
    return parsed;
  }

  function transformCssExpression(source) {
    const text = String(source || "").trim();
    if (!text || text.indexOf("=>") >= 0) {
      return source;
    }
    if (!sourceHasCssExpressionSignal(text)) {
      return source;
    }
    const tokens = tokenizeCssExpression(text);
    if (!tokens || tokens.length === 0) {
      return source;
    }
    const parsed = parseCssExpressionTokens(tokens);
    if (!parsed || (!parsed.cssAware && !/[+\-*/]/.test(text))) {
      return source;
    }
    return parsed.text;
  }

  function transformCssScriptBody(source) {
    const text = String(source || "");
    let out = "";
    let cursor = 0;
    while (cursor < text.length) {
      const ch = text.charAt(cursor);
      if (ch === "\"" || ch === "'" || ch === "`") {
        const end = skipQuotedSource(text, cursor);
        out += text.slice(cursor, end);
        cursor = end;
        continue;
      }
      const returnMatch = text.slice(cursor).match(/^return\b/);
      if (returnMatch) {
        out += "return";
        cursor += returnMatch[0].length;
        const start = cursor;
        while (cursor < text.length && text.charAt(cursor) !== ";" && text.charAt(cursor) !== "\n" && text.charAt(cursor) !== "\r" && text.charAt(cursor) !== "}") {
          cursor += 1;
        }
        out += transformCssExpression(text.slice(start, cursor));
        continue;
      }
      if (
        ch === "=" &&
        text.charAt(cursor - 1) !== "=" &&
        text.charAt(cursor - 1) !== "!" &&
        text.charAt(cursor - 1) !== "<" &&
        text.charAt(cursor - 1) !== ">" &&
        text.charAt(cursor + 1) !== "=" &&
        text.charAt(cursor + 1) !== ">"
      ) {
        out += ch;
        cursor += 1;
        const start = cursor;
        while (cursor < text.length && text.charAt(cursor) !== ";" && text.charAt(cursor) !== "\n" && text.charAt(cursor) !== "\r") {
          cursor += 1;
        }
        out += transformCssExpression(text.slice(start, cursor));
        continue;
      }
      out += ch;
      cursor += 1;
    }
    return out;
  }

  function normalizeQDomUuid(value) {
    if (typeof value !== "string") {
      return "";
    }
    const trimmed = value.trim();
    return trimmed || "";
  }

  function createFallbackQDomUuid() {
    qdomUuidCounter += 1;
    const timePart = Date.now().toString(36);
    const randomPart = Math.floor(Math.random() * 0xffffffff)
      .toString(16)
      .padStart(8, "0");
    return "qdom-" + timePart + "-" + randomPart + "-" + qdomUuidCounter.toString(36);
  }

  function createQDomUuid() {
    const cryptoObj = global && global.crypto;
    if (cryptoObj && typeof cryptoObj.randomUUID === "function") {
      try {
        const generated = cryptoObj.randomUUID();
        const normalized = normalizeQDomUuid(generated);
        if (normalized) {
          return normalized;
        }
      } catch (error) {
        // fallback path below
      }
    }
    return createFallbackQDomUuid();
  }

  function ensureNodeUuid(node) {
    if (!node || typeof node !== "object") {
      return "";
    }
    if (!node.meta || typeof node.meta !== "object") {
      node.meta = {};
    }
    const existing = normalizeQDomUuid(node.meta[QDOM_UUID_KEY]);
    if (existing) {
      node.meta[QDOM_UUID_KEY] = existing;
      return existing;
    }
    const generated = createQDomUuid();
    node.meta[QDOM_UUID_KEY] = generated;
    return generated;
  }

  function getNodeUuid(node) {
    if (!node || typeof node !== "object" || !node.meta || typeof node.meta !== "object") {
      return "";
    }
    return normalizeQDomUuid(node.meta[QDOM_UUID_KEY]);
  }

  class QDomNode {
    constructor(kind, meta) {
      this.kind = String(kind || "").trim().toLowerCase();
      this.meta = createNodeMeta(meta);
    }
  }

  class QDocumentNode extends QDomNode {
    constructor(options) {
      const opts = options || {};
      super(NODE_TYPES.document, Object.assign({ source: typeof opts.source === "string" ? opts.source : "" }, opts.meta || {}));
      this.version = Number.isFinite(opts.version) ? Number(opts.version) : 1;
      this.nodes = Array.isArray(opts.nodes) ? opts.nodes : [];
      this.scripts = Array.isArray(opts.scripts) ? opts.scripts : [];
      if (!this.meta || typeof this.meta !== "object") {
        this.meta = {};
      }
      if (typeof this.meta.source !== "string") {
        this.meta.source = "";
      }
      if (typeof this.meta.dirty !== "boolean") {
        this.meta.dirty = false;
      }
    }
  }

  class QElementNode extends QDomNode {
    constructor(options) {
      const opts = options || {};
      const tagName = String(opts.tagName || "div").toLowerCase();
      super(NODE_TYPES.element, opts.meta);
      this.tagName = tagName;
      this.attributes = Object.assign({}, opts.attributes || {});
      this.children = Array.isArray(opts.children) ? opts.children : [];
      this.textContent = typeof opts.textContent === "string" ? opts.textContent : null;
      this.selectorMode = opts.selectorMode || "single";
      this.selectorChain = Array.isArray(opts.selectorChain) ? opts.selectorChain.slice() : [tagName];
    }
  }

  class QTextNode extends QDomNode {
    constructor(options) {
      const opts = options || {};
      super(NODE_TYPES.text, opts.meta);
      this.value = typeof opts.value === "string" ? opts.value : "";
    }
  }

  class QRawHtmlNode extends QDomNode {
    constructor(options) {
      const opts = options || {};
      super(NODE_TYPES.rawHtml, opts.meta);
      this.html = typeof opts.html === "string" ? opts.html : "";
    }
  }

  class QDomModel extends QDomNode {
    constructor(options) {
      const opts = options || {};
      super(NODE_TYPES.model, opts.meta);
      this.entries = Array.isArray(opts.entries) ? opts.entries : [];
      this.source = typeof opts.source === "string" ? opts.source : "";
    }
  }

  class QRepeaterNode extends QDomNode {
    constructor(options) {
      const opts = options || {};
      super(NODE_TYPES.repeater, opts.meta);
      this.repeaterId = String(opts.repeaterId || "").trim();
      this.keyword = String(opts.keyword || "q-repeater").trim().toLowerCase() || "q-repeater";
      this.slotName = String(opts.slotName || "item").trim() || "item";
      const modelNode =
        opts.model && typeof opts.model === "object" && opts.model.kind === NODE_TYPES.model
          ? opts.model
          : new QDomModel({
              entries: Array.isArray(opts.modelEntries) ? opts.modelEntries : [],
              source: typeof opts.modelSource === "string" ? opts.modelSource : "",
            });
      this.model = modelNode;
      this.modelEntries = Array.isArray(modelNode.entries) ? modelNode.entries : [];
      this.templateNodes = Array.isArray(opts.templateNodes) ? opts.templateNodes : [];
    }
  }

  class QComponentNode extends QDomNode {
    constructor(options) {
      const opts = options || {};
      super(NODE_TYPES.component, opts.meta);
      this.componentId = String(opts.componentId || "").trim();
      const inheritedList = [];
      const rawInheritedList = Array.isArray(opts.extendsComponentIds) ? opts.extendsComponentIds : [];
      for (let i = 0; i < rawInheritedList.length; i += 1) {
        const inheritedId = String(rawInheritedList[i] || "").trim();
        if (!inheritedId) {
          continue;
        }
        inheritedList.push(inheritedId);
      }
      if (inheritedList.length === 0) {
        const legacyInheritedId = String(opts.extendsComponentId || "").trim();
        if (legacyInheritedId) {
          inheritedList.push(legacyInheritedId);
        }
      }
      this.extendsComponentIds = inheritedList;
      this.extendsComponentId = inheritedList.length > 0 ? inheritedList[0] : "";
      this.definitionType = String(opts.definitionType || "component").trim().toLowerCase() || "component";
      this.templateNodes = Array.isArray(opts.templateNodes) ? opts.templateNodes : [];
      this.slotDefaults = Array.isArray(opts.slotDefaults) ? opts.slotDefaults : [];
      this.propertyDefinitions = Array.isArray(opts.propertyDefinitions) ? opts.propertyDefinitions : [];
      this.methods = Array.isArray(opts.methods) ? opts.methods : [];
      this.signalDeclarations = Array.isArray(opts.signalDeclarations) ? opts.signalDeclarations : [];
      this.callbackDeclarations = Array.isArray(opts.callbackDeclarations) ? opts.callbackDeclarations : [];
      this.aliasDeclarations = Array.isArray(opts.aliasDeclarations) ? opts.aliasDeclarations : [];
      this.varDeclarations = Array.isArray(opts.varDeclarations) ? opts.varDeclarations : [];
      this.switchDeclarations = Array.isArray(opts.switchDeclarations) ? opts.switchDeclarations : [];
      this.qTimerDefinitions = Array.isArray(opts.qTimerDefinitions) ? opts.qTimerDefinitions : [];
      this.wasmConfig =
        opts.wasmConfig && typeof opts.wasmConfig === "object" && !Array.isArray(opts.wasmConfig)
          ? Object.assign({}, opts.wasmConfig)
          : null;
      this.lifecycleScripts = Array.isArray(opts.lifecycleScripts) ? opts.lifecycleScripts : [];
      this.attributes = Object.assign({}, opts.attributes || {});
      this.properties = Array.isArray(opts.properties) ? opts.properties.slice() : [];
    }
  }

  class QSlotNode extends QDomNode {
    constructor(options) {
      const opts = options || {};
      super(NODE_TYPES.slot, opts.meta);
      this.name = String(opts.name || "default").trim() || "default";
      this.children = Array.isArray(opts.children) ? opts.children : [];
    }
  }

  class QSlotDefaultNode extends QDomNode {
    constructor(options) {
      const opts = options || {};
      super(NODE_TYPES.slotDefault, opts.meta);
      this.name = String(opts.name || "default").trim() || "default";
      this.children = Array.isArray(opts.children) ? opts.children : [];
    }
  }

  class QStructNode extends QDomNode {
    constructor(options) {
      const opts = options || {};
      super(NODE_TYPES.struct, opts.meta);
      this.structId = String(opts.structId || "").trim();
      this.componentId = this.structId;
      this.definitionType = "struct";
      this.fields = Array.isArray(opts.fields) ? opts.fields : [];
    }
  }

  class QStructInstanceNode extends QDomNode {
    constructor(options) {
      const opts = options || {};
      const id = String(opts.structId || opts.componentId || opts.tagName || "").trim().toLowerCase();
      super(NODE_TYPES.structInstance, opts.meta);
      this.structId = id;
      this.componentId = id;
      this.tagName = id;
      this.fields = Array.isArray(opts.fields) ? opts.fields : [];
      this.props = Object.assign({}, opts.props || {});
      this.selectorMode = opts.selectorMode || "single";
      this.selectorChain = Array.isArray(opts.selectorChain) ? opts.selectorChain.slice() : [id];
    }

    properties() {
      return Object.assign({}, this.props || {});
    }

    getProperty(key) {
      const name = String(key || "").trim();
      if (!name || !this.props || typeof this.props !== "object") {
        return undefined;
      }
      return Object.prototype.hasOwnProperty.call(this.props, name) ? this.props[name] : undefined;
    }
  }

  class QClassNode extends QDomNode {
    constructor(options) {
      const opts = options || {};
      const classId = String(opts.classId || opts.componentId || "").trim();
      super(NODE_TYPES.class, opts.meta);
      this.classId = classId;
      this.componentId = classId;
      this.definitionType = "class";
      this.extendsClassId = String(opts.extendsClassId || opts.extendsComponentId || "").trim();
      this.constructorDefinition =
        opts.constructorDefinition && typeof opts.constructorDefinition === "object"
          ? Object.assign({}, opts.constructorDefinition)
          : null;
      this.methods = Array.isArray(opts.methods) ? opts.methods.slice() : [];
      this.slotDeclarations = Array.isArray(opts.slotDeclarations) ? opts.slotDeclarations.slice() : [];
      this.templateNodes = Array.isArray(opts.templateNodes) ? opts.templateNodes : [];
    }
  }

  class QClassInstanceNode extends QDomNode {
    constructor(options) {
      const opts = options || {};
      const id = String(opts.classId || opts.componentId || opts.tagName || "").trim().toLowerCase();
      super(NODE_TYPES.classInstance, opts.meta);
      this.classId = id;
      this.componentId = id;
      this.tagName = id;
      this.attributes = Object.assign({}, opts.attributes || {});
      this.props = Object.assign({}, opts.props || {});
      this.constructorArguments = Array.isArray(opts.constructorArguments) ? opts.constructorArguments.slice() : [];
      this.argumentSource = typeof opts.argumentSource === "string" ? opts.argumentSource : "";
      this.slots = Array.isArray(opts.slots) ? opts.slots : [];
      this.children = Array.isArray(opts.children) ? opts.children : [];
      this.textContent = typeof opts.textContent === "string" ? opts.textContent : null;
      this.lifecycleScripts = Array.isArray(opts.lifecycleScripts) ? opts.lifecycleScripts : [];
      this.selectorMode = opts.selectorMode || "single";
      this.selectorChain = Array.isArray(opts.selectorChain) ? opts.selectorChain.slice() : [id];
    }

    properties() {
      return Object.assign({}, this.props || {});
    }

    getProperty(key) {
      const name = String(key || "").trim();
      if (!name || !this.props || typeof this.props !== "object") {
        return undefined;
      }
      return Object.prototype.hasOwnProperty.call(this.props, name) ? this.props[name] : undefined;
    }
  }

  class QComponentInstanceNode extends QDomNode {
    constructor(options) {
      const opts = options || {};
      const tag = String(opts.tagName || opts.componentId || "div").trim().toLowerCase();
      super(normalizeInstanceKind(opts.kind), opts.meta);
      this.componentId = String(opts.componentId || tag).trim().toLowerCase();
      this.tagName = tag;
      this.attributes = Object.assign({}, opts.attributes || {});
      this.props = Object.assign({}, opts.props || {});
      this.slots = Array.isArray(opts.slots) ? opts.slots : [];
      this.lifecycleScripts = Array.isArray(opts.lifecycleScripts) ? opts.lifecycleScripts : [];
      this.children = Array.isArray(opts.children) ? opts.children : [];
      this.textContent = typeof opts.textContent === "string" ? opts.textContent : null;
      this.selectorMode = opts.selectorMode || "single";
      this.selectorChain = Array.isArray(opts.selectorChain) ? opts.selectorChain.slice() : [tag];
    }

    properties() {
      return Object.assign({}, this.props || {});
    }

    getProperty(key) {
      const name = String(key || "").trim();
      if (!name || !this.props || typeof this.props !== "object") {
        return undefined;
      }
      return Object.prototype.hasOwnProperty.call(this.props, name) ? this.props[name] : undefined;
    }
  }

  class QTemplateInstanceNode extends QComponentInstanceNode {
    constructor(options) {
      super(Object.assign({}, options || {}, { kind: NODE_TYPES.templateInstance }));
    }
  }

  class QScriptRuleNode extends QDomNode {
    constructor(options) {
      const opts = options || {};
      super(NODE_TYPES.scriptRule, opts.meta);
      this.selector = String(opts.selector || "");
      this.eventName = String(opts.eventName || "");
      this.body = typeof opts.body === "string" ? opts.body : "";
    }
  }

  class QColorNode extends QDomNode {
    constructor(options) {
      const opts = options || {};
      super(NODE_TYPES.color, opts.meta);
      this.name = String(opts.name || "").trim();
      this.value = typeof opts.value === "string" ? opts.value : "";
      this.assignments =
        opts.assignments && typeof opts.assignments === "object" && !Array.isArray(opts.assignments)
          ? Object.assign({}, opts.assignments)
          : null;
      this.mode = String(opts.mode || (this.assignments ? "theme" : "schema")).trim().toLowerCase();
    }

    style(usage) {
      const map = {
        background: "background-color",
        foreground: "color",
        border: "border-color",
        primary: "--q-color-primary",
        secondary: "--q-color-secondary",
        accent: "--q-color-accent",
      };
      if (this.assignments && typeof this.assignments === "object") {
        const keys = Object.keys(this.assignments);
        const declarations = [];
        for (let i = 0; i < keys.length; i += 1) {
          const key = String(keys[i] || "").trim();
          if (!key) {
            continue;
          }
          const value = String(this.assignments[key] == null ? "" : this.assignments[key]).trim();
          if (!value) {
            continue;
          }
          const cssProp = Object.prototype.hasOwnProperty.call(map, key)
            ? map[key]
            : "--q-color-" + key.replace(/[^A-Za-z0-9_-]/g, "-");
          declarations.push(cssProp + ": " + value + ";");
        }
        return "style { " + declarations.join(" ") + " }";
      }
      const value = String(this.value || "").trim();
      if (!value) {
        return "style { }";
      }
      if (typeof usage === "string" && usage.trim()) {
        const key = String(usage || "").trim();
        const normalized = key.toLowerCase();
        const cssProp = Object.prototype.hasOwnProperty.call(map, normalized)
          ? map[normalized]
          : key;
        return "style { " + cssProp + ": " + value + "; }";
      }
      if (usage && typeof usage === "object" && !Array.isArray(usage)) {
        const keys = Object.keys(usage);
        const declarations = [];
        for (let i = 0; i < keys.length; i += 1) {
          const key = String(keys[i] || "").trim();
          if (!key || !usage[key]) {
            continue;
          }
          const normalized = key.toLowerCase();
          const cssProp = Object.prototype.hasOwnProperty.call(map, normalized)
            ? map[normalized]
            : key;
          declarations.push(cssProp + ": " + value + ";");
        }
        return "style { " + declarations.join(" ") + " }";
      }
      return "style { color: " + value + "; }";
    }
  }

  function createNodeMeta(overrides) {
    const meta = Object.assign(
      {
        dirty: false,
        originalSource: null,
        sourceRange: null,
      },
      overrides || {}
    );
    const existingUuid = normalizeQDomUuid(meta[QDOM_UUID_KEY]);
    meta[QDOM_UUID_KEY] = existingUuid || createQDomUuid();
    return meta;
  }

  function createUpdateNonceToken(length) {
    const size = Number.isFinite(length) && length > 0 ? Math.floor(length) : 12;
    const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let out = "";
    for (let i = 0; i < size; i += 1) {
      const index = Math.floor(Math.random() * alphabet.length);
      out += alphabet.charAt(index);
    }
    return out || "nonce";
  }

  function setUpdateNonce(target, nonceValue) {
    if (!target || (typeof target !== "object" && typeof target !== "function")) {
      return "";
    }
    const next = typeof nonceValue === "string" && nonceValue ? nonceValue : createUpdateNonceToken();
    try {
      Object.defineProperty(target, UPDATE_NONCE_KEY, {
        value: next,
        configurable: true,
        writable: true,
        enumerable: false,
      });
    } catch (error) {
      // ignore nonce write failures on frozen targets
      try {
        target[UPDATE_NONCE_KEY] = next;
      } catch (innerError) {
        // ignore fallback failure
      }
    }
    return next;
  }

  function ensureUpdateNonce(target) {
    if (!target || (typeof target !== "object" && typeof target !== "function")) {
      return "";
    }
    const existing = target[UPDATE_NONCE_KEY];
    if (typeof existing === "string" && existing) {
      return existing;
    }
    return setUpdateNonce(target);
  }

  function ensureUpdateNonceInTree(root) {
    if (!root || (typeof root !== "object" && typeof root !== "function")) {
      return;
    }
    const seen = new WeakSet();
    const stack = [root];
    while (stack.length > 0) {
      const node = stack.pop();
      if (!node || (typeof node !== "object" && typeof node !== "function")) {
        continue;
      }
      if (seen.has(node)) {
        continue;
      }
      seen.add(node);
      ensureUpdateNonce(node);
      const keys = Object.keys(node);
      for (let i = 0; i < keys.length; i += 1) {
        const value = node[keys[i]];
        if (value && (typeof value === "object" || typeof value === "function")) {
          stack.push(value);
        }
      }
    }
  }

  function findNearestNodeForPath(rootNode, path) {
    if (!rootNode || !Array.isArray(path)) {
      return null;
    }
    let cursor = rootNode;
    let nearest = cursor && typeof cursor.kind === "string" ? cursor : null;
    for (let i = 0; i < path.length; i += 1) {
      if (!cursor || (typeof cursor !== "object" && typeof cursor !== "function")) {
        break;
      }
      const key = String(path[i] || "");
      if (Array.isArray(cursor)) {
        cursor = cursor[key];
      } else {
        cursor = cursor[key];
      }
      if (cursor && typeof cursor.kind === "string") {
        nearest = cursor;
      }
    }
    return nearest;
  }

  function createDocument(options) {
    const opts = options || {};
    return new QDocumentNode(opts);
  }

  function createElementNode(options) {
    const opts = options || {};
    return new QElementNode(opts);
  }

  function createTextNode(options) {
    const opts = options || {};
    return new QTextNode(opts);
  }

  function createRawHtmlNode(options) {
    const opts = options || {};
    return new QRawHtmlNode(opts);
  }

  function createModelNode(options) {
    const opts = options || {};
    return new QDomModel(opts);
  }

  function createRepeaterNode(options) {
    const opts = options || {};
    return new QRepeaterNode(opts);
  }

  function createComponentNode(options) {
    const opts = options || {};
    return new QComponentNode(opts);
  }

  function createSlotNode(options) {
    const opts = options || {};
    return new QSlotNode(opts);
  }

  function createSlotDefaultNode(options) {
    const opts = options || {};
    return new QSlotDefaultNode(opts);
  }

  function createStructNode(options) {
    return new QStructNode(options || {});
  }

  function createStructInstanceNode(options) {
    return new QStructInstanceNode(options || {});
  }

  function createClassNode(options) {
    return new QClassNode(options || {});
  }

  function createClassInstanceNode(options) {
    return new QClassInstanceNode(options || {});
  }

  function normalizeInstanceKind(kind) {
    const value = String(kind || "").trim().toLowerCase();
    if (value === NODE_TYPES.templateInstance || value === "template") {
      return NODE_TYPES.templateInstance;
    }
    return NODE_TYPES.componentInstance;
  }

  function createComponentInstanceNode(options) {
    const opts = options || {};
    const kind = normalizeInstanceKind(opts.kind);
    return kind === NODE_TYPES.templateInstance
      ? new QTemplateInstanceNode(opts)
      : new QComponentInstanceNode(opts);
  }

  function readSlotNodes(node) {
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

  function ensureSlotNodes(node) {
    if (!node || typeof node !== "object") {
      return [];
    }
    if (Array.isArray(node.slots)) {
      return node.slots;
    }
    if (Array.isArray(node.__qhtmlSlotNodes)) {
      return node.__qhtmlSlotNodes;
    }
    const created = [];
    try {
      Object.defineProperty(node, "__qhtmlSlotNodes", {
        value: created,
        configurable: true,
        writable: true,
        enumerable: false,
      });
    } catch (error) {
      node.__qhtmlSlotNodes = created;
    }
    return created;
  }

  function createScriptRule(options) {
    const opts = options || {};
    return new QScriptRuleNode(opts);
  }

  function createQColorNode(options) {
    return new QColorNode(options || {});
  }

  function isNode(value) {
    return !!value && typeof value === "object" && typeof value.kind === "string";
  }

  function walkNodes(nodes, visitor, parent, pathPrefix) {
    if (!Array.isArray(nodes)) {
      return;
    }
    const basePath = Array.isArray(pathPrefix) ? pathPrefix : [];
    for (let i = 0; i < nodes.length; i += 1) {
      const node = nodes[i];
      const path = basePath.concat(i);
      visitor(node, parent || null, path);
      if (!node || typeof node !== "object") {
        continue;
      }
      if (node.kind === NODE_TYPES.element && Array.isArray(node.children)) {
        walkNodes(node.children, visitor, node, path.concat("children"));
      }
      if (node.kind === NODE_TYPES.component && Array.isArray(node.templateNodes)) {
        walkNodes(node.templateNodes, visitor, node, path.concat("templateNodes"));
      }
      if (node.kind === NODE_TYPES.component && Array.isArray(node.slotDefaults)) {
        walkNodes(node.slotDefaults, visitor, node, path.concat("slotDefaults"));
      }
      if ((node.kind === NODE_TYPES.struct || node.kind === NODE_TYPES.structInstance) && Array.isArray(node.fields)) {
        for (let j = 0; j < node.fields.length; j += 1) {
          const field = node.fields[j];
          if (!field || typeof field !== "object" || !Array.isArray(field.nodes)) {
            continue;
          }
          walkNodes(field.nodes, visitor, node, path.concat("fields", j, "nodes"));
        }
      }
      if (node.kind === NODE_TYPES.class && Array.isArray(node.templateNodes)) {
        walkNodes(node.templateNodes, visitor, node, path.concat("templateNodes"));
      }
      if (node.kind === NODE_TYPES.model && Array.isArray(node.entries)) {
        for (let j = 0; j < node.entries.length; j += 1) {
          const entry = node.entries[j];
          if (!entry || typeof entry !== "object" || !Array.isArray(entry.nodes)) {
            continue;
          }
          walkNodes(entry.nodes, visitor, node, path.concat("entries", j, "nodes"));
        }
      }
      if (node.kind === NODE_TYPES.repeater) {
        if (node.model && node.model.kind === NODE_TYPES.model) {
          walkNodes([node.model], visitor, node, path.concat("model"));
        }
        if (Array.isArray(node.templateNodes)) {
          walkNodes(node.templateNodes, visitor, node, path.concat("templateNodes"));
        }
      }
      if (
        (node.kind === NODE_TYPES.componentInstance ||
          node.kind === NODE_TYPES.templateInstance ||
          node.kind === NODE_TYPES.classInstance) &&
        readSlotNodes(node).length >= 0
      ) {
        walkNodes(readSlotNodes(node), visitor, node, path.concat("slots"));
      }
      if (
        (node.kind === NODE_TYPES.componentInstance ||
          node.kind === NODE_TYPES.templateInstance ||
          node.kind === NODE_TYPES.classInstance) &&
        Array.isArray(node.children)
      ) {
        walkNodes(node.children, visitor, node, path.concat("children"));
      }
      if ((node.kind === NODE_TYPES.slot || node.kind === NODE_TYPES.slotDefault) && Array.isArray(node.children)) {
        walkNodes(node.children, visitor, node, path.concat("children"));
      }
    }
  }

  function walkQDom(documentNode, visitor) {
    if (!documentNode || documentNode.kind !== NODE_TYPES.document) {
      return;
    }
    walkNodes(documentNode.nodes, visitor, documentNode, ["nodes"]);
    if (Array.isArray(documentNode.scripts)) {
      for (let i = 0; i < documentNode.scripts.length; i += 1) {
        visitor(documentNode.scripts[i], documentNode, ["scripts", i]);
      }
    }
  }

  function cloneDeep(value) {
    if (Array.isArray(value)) {
      return value.map(cloneDeep);
    }
    if (value && typeof value === "object") {
      const out = {};
      for (const key of Object.keys(value)) {
        out[key] = cloneDeep(value[key]);
      }
      return out;
    }
    return value;
  }

  function cloneDocument(documentNode) {
    return cloneDeep(documentNode);
  }

  function ensureStringArray(value) {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.map((item) => String(item));
  }

  function mergeClasses(existing, classNames) {
    const fromExisting = typeof existing === "string" ? existing.split(/\s+/).filter(Boolean) : [];
    const merged = new Set(fromExisting);
    for (const name of classNames) {
      if (name) {
        merged.add(name);
      }
    }
    return Array.from(merged).join(" ");
  }

  function encodeBase64(bytes) {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    if (typeof global.btoa === "function") {
      return global.btoa(binary);
    }
    if (typeof global.Buffer === "function") {
      return global.Buffer.from(binary, "binary").toString("base64");
    }
    throw new Error("No base64 encoder available in this environment.");
  }

  function decodeBase64(text) {
    if (typeof text !== "string") {
      throw new Error("decodeBase64 expects a string.");
    }
    let binary;
    if (typeof global.atob === "function") {
      binary = global.atob(text);
    } else if (typeof global.Buffer === "function") {
      binary = global.Buffer.from(text, "base64").toString("binary");
    } else {
      throw new Error("No base64 decoder available in this environment.");
    }
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i) & 0xff;
    }
    return bytes;
  }

  function binaryStringFromBytes(bytes) {
    let out = "";
    for (let i = 0; i < bytes.length; i += 1) {
      out += String.fromCharCode(bytes[i]);
    }
    return out;
  }

  function bytesFromBinaryString(value) {
    const bytes = new Uint8Array(value.length);
    for (let i = 0; i < value.length; i += 1) {
      bytes[i] = value.charCodeAt(i) & 0xff;
    }
    return bytes;
  }

  function lzwCompressBinaryString(input) {
    if (!input || input.length === 0) {
      return [];
    }

    const dictionary = new Map();
    for (let i = 0; i < 256; i += 1) {
      dictionary.set(String.fromCharCode(i), i);
    }

    let nextCode = 256;
    let phrase = input.charAt(0);
    const output = [];

    for (let i = 1; i < input.length; i += 1) {
      const currentChar = input.charAt(i);
      const candidate = phrase + currentChar;
      if (dictionary.has(candidate)) {
        phrase = candidate;
      } else {
        output.push(dictionary.get(phrase));
        dictionary.set(candidate, nextCode);
        nextCode += 1;
        phrase = currentChar;
      }
    }

    output.push(dictionary.get(phrase));
    return output;
  }

  function lzwDecompressBinaryString(codes) {
    if (!codes || codes.length === 0) {
      return "";
    }

    const dictionary = [];
    for (let i = 0; i < 256; i += 1) {
      dictionary[i] = String.fromCharCode(i);
    }

    let nextCode = 256;
    let previous = dictionary[codes[0]];
    if (typeof previous !== "string") {
      throw new Error("Invalid compressed payload.");
    }

    let result = previous;

    for (let i = 1; i < codes.length; i += 1) {
      const code = codes[i];
      let entry;
      if (typeof dictionary[code] === "string") {
        entry = dictionary[code];
      } else if (code === nextCode) {
        entry = previous + previous.charAt(0);
      } else {
        throw new Error("Invalid compressed payload code sequence.");
      }

      result += entry;
      dictionary[nextCode] = previous + entry.charAt(0);
      nextCode += 1;
      previous = entry;
    }

    return result;
  }

  function encodeVarints(codes) {
    const out = [];
    for (let i = 0; i < codes.length; i += 1) {
      let value = codes[i] >>> 0;
      while (value >= 0x80) {
        out.push((value & 0x7f) | 0x80);
        value >>>= 7;
      }
      out.push(value);
    }
    return new Uint8Array(out);
  }

  function decodeVarints(bytes) {
    const out = [];
    let value = 0;
    let shift = 0;

    for (let i = 0; i < bytes.length; i += 1) {
      const byte = bytes[i];
      value |= (byte & 0x7f) << shift;
      if (byte & 0x80) {
        shift += 7;
        if (shift > 28) {
          throw new Error("Invalid varint payload.");
        }
      } else {
        out.push(value >>> 0);
        value = 0;
        shift = 0;
      }
    }

    if (shift !== 0) {
      throw new Error("Truncated varint payload.");
    }

    return out;
  }

  function createQDomSerializationReplacer() {
    const seen = typeof WeakSet === "function" ? new WeakSet() : null;
    return function qdomSerializationReplacer(key, value) {
      if (typeof value === "function") {
        return undefined;
      }
      if (!value || typeof value !== "object") {
        return value;
      }
      const keyText = String(key || "");
      if (keyText && (keyText.indexOf("__qhtml") === 0 || keyText.indexOf("__QHTML") === 0)) {
        return undefined;
      }
      if (typeof value.nodeType === "number") {
        return undefined;
      }
      if (
        typeof value.dispatchEvent === "function" &&
        typeof value.addEventListener === "function"
      ) {
        return undefined;
      }
      if (seen) {
        if (seen.has(value)) {
          return undefined;
        }
        seen.add(value);
      }
      return value;
    };
  }

  function serializeQDomCompressed(documentNode) {
    const text = JSON.stringify(documentNode, createQDomSerializationReplacer());
    const bytes = new TextEncoder().encode(text);
    const binary = binaryStringFromBytes(bytes);
    const codes = lzwCompressBinaryString(binary);
    const packed = encodeVarints(codes);
    return "qdom-lzw-base64:" + encodeBase64(packed);
  }

  function deserializeQDomCompressed(payload) {
    if (typeof payload !== "string") {
      throw new Error("Serialized payload must be a string.");
    }
    const prefix = "qdom-lzw-base64:";
    if (!payload.startsWith(prefix)) {
      throw new Error("Unsupported serialized payload prefix.");
    }
    const packed = decodeBase64(payload.slice(prefix.length));
    const codes = decodeVarints(packed);
    const binary = lzwDecompressBinaryString(codes);
    const utf8 = bytesFromBinaryString(binary);
    const text = new TextDecoder().decode(utf8);
    const parsed = JSON.parse(text);
    return reviveQDomTree(parsed);
  }

  function reviveQDomTree(value) {
    if (Array.isArray(value)) {
      return value.map(reviveQDomTree);
    }
    if (!value || typeof value !== "object") {
      return value;
    }
    const kind = String(value.kind || "").trim().toLowerCase();
    if (!kind) {
      const out = {};
      const keys = Object.keys(value);
      for (let i = 0; i < keys.length; i += 1) {
        const key = keys[i];
        out[key] = reviveQDomTree(value[key]);
      }
      return out;
    }

    if (kind === NODE_TYPES.document) {
      return createDocument({
        version: Number.isFinite(value.version) ? Number(value.version) : 1,
        nodes: reviveQDomTree(Array.isArray(value.nodes) ? value.nodes : []),
        scripts: reviveQDomTree(Array.isArray(value.scripts) ? value.scripts : []),
        source: value.meta && typeof value.meta.source === "string" ? value.meta.source : "",
        meta: reviveQDomTree(value.meta || {}),
      });
    }
    if (kind === NODE_TYPES.element) {
      return createElementNode({
        tagName: value.tagName,
        attributes: reviveQDomTree(value.attributes || {}),
        children: reviveQDomTree(Array.isArray(value.children) ? value.children : []),
        textContent: typeof value.textContent === "string" ? value.textContent : null,
        selectorMode: value.selectorMode,
        selectorChain: reviveQDomTree(Array.isArray(value.selectorChain) ? value.selectorChain : []),
        meta: reviveQDomTree(value.meta || {}),
      });
    }
    if (kind === NODE_TYPES.text) {
      return createTextNode({
        value: value.value,
        meta: reviveQDomTree(value.meta || {}),
      });
    }
    if (kind === NODE_TYPES.rawHtml) {
      return createRawHtmlNode({
        html: value.html,
        meta: reviveQDomTree(value.meta || {}),
      });
    }
    if (kind === NODE_TYPES.slot) {
      return createSlotNode({
        name: value.name,
        children: reviveQDomTree(Array.isArray(value.children) ? value.children : []),
        meta: reviveQDomTree(value.meta || {}),
      });
    }
    if (kind === NODE_TYPES.slotDefault) {
      return createSlotDefaultNode({
        name: value.name,
        children: reviveQDomTree(Array.isArray(value.children) ? value.children : []),
        meta: reviveQDomTree(value.meta || {}),
      });
    }
    if (kind === NODE_TYPES.model) {
      return createModelNode({
        entries: reviveQDomTree(Array.isArray(value.entries) ? value.entries : []),
        source: typeof value.source === "string" ? value.source : "",
        meta: reviveQDomTree(value.meta || {}),
      });
    }
    if (kind === NODE_TYPES.repeater) {
      return createRepeaterNode({
        repeaterId: value.repeaterId,
        keyword: value.keyword,
        slotName: value.slotName,
        model: reviveQDomTree(
          value.model && typeof value.model === "object"
            ? value.model
            : {
                kind: NODE_TYPES.model,
                entries: Array.isArray(value.modelEntries) ? value.modelEntries : [],
                source: typeof value.modelSource === "string" ? value.modelSource : "",
              }
        ),
        modelEntries: reviveQDomTree(Array.isArray(value.modelEntries) ? value.modelEntries : []),
        modelSource: typeof value.modelSource === "string" ? value.modelSource : "",
        templateNodes: reviveQDomTree(Array.isArray(value.templateNodes) ? value.templateNodes : []),
        meta: reviveQDomTree(value.meta || {}),
      });
    }
    if (kind === NODE_TYPES.component) {
      return createComponentNode({
        componentId: value.componentId,
        extendsComponentIds: reviveQDomTree(Array.isArray(value.extendsComponentIds) ? value.extendsComponentIds : []),
        extendsComponentId: value.extendsComponentId,
        definitionType: value.definitionType,
        templateNodes: reviveQDomTree(Array.isArray(value.templateNodes) ? value.templateNodes : []),
        slotDefaults: reviveQDomTree(Array.isArray(value.slotDefaults) ? value.slotDefaults : []),
        propertyDefinitions: reviveQDomTree(Array.isArray(value.propertyDefinitions) ? value.propertyDefinitions : []),
        methods: reviveQDomTree(Array.isArray(value.methods) ? value.methods : []),
        signalDeclarations: reviveQDomTree(Array.isArray(value.signalDeclarations) ? value.signalDeclarations : []),
        callbackDeclarations: reviveQDomTree(Array.isArray(value.callbackDeclarations) ? value.callbackDeclarations : []),
        aliasDeclarations: reviveQDomTree(Array.isArray(value.aliasDeclarations) ? value.aliasDeclarations : []),
        varDeclarations: reviveQDomTree(Array.isArray(value.varDeclarations) ? value.varDeclarations : []),
        switchDeclarations: reviveQDomTree(Array.isArray(value.switchDeclarations) ? value.switchDeclarations : []),
        qTimerDefinitions: reviveQDomTree(Array.isArray(value.qTimerDefinitions) ? value.qTimerDefinitions : []),
        wasmConfig: reviveQDomTree(
          value.wasmConfig && typeof value.wasmConfig === "object" && !Array.isArray(value.wasmConfig)
            ? value.wasmConfig
            : null
        ),
        lifecycleScripts: reviveQDomTree(Array.isArray(value.lifecycleScripts) ? value.lifecycleScripts : []),
        attributes: reviveQDomTree(value.attributes || {}),
        properties: reviveQDomTree(Array.isArray(value.properties) ? value.properties : []),
        meta: reviveQDomTree(value.meta || {}),
      });
    }
    if (kind === NODE_TYPES.struct) {
      return createStructNode({
        structId: value.structId || value.componentId,
        fields: reviveQDomTree(Array.isArray(value.fields) ? value.fields : []),
        meta: reviveQDomTree(value.meta || {}),
      });
    }
    if (kind === NODE_TYPES.structInstance) {
      return createStructInstanceNode({
        structId: value.structId || value.componentId || value.tagName,
        componentId: value.componentId,
        tagName: value.tagName,
        fields: reviveQDomTree(Array.isArray(value.fields) ? value.fields : []),
        props: reviveQDomTree(value.props || {}),
        selectorMode: value.selectorMode,
        selectorChain: reviveQDomTree(Array.isArray(value.selectorChain) ? value.selectorChain : []),
        meta: reviveQDomTree(value.meta || {}),
      });
    }
    if (kind === NODE_TYPES.class) {
      return createClassNode({
        classId: value.classId || value.componentId,
        extendsClassId: value.extendsClassId || value.extendsComponentId,
        constructorDefinition: reviveQDomTree(value.constructorDefinition || null),
        methods: reviveQDomTree(Array.isArray(value.methods) ? value.methods : []),
        slotDeclarations: reviveQDomTree(Array.isArray(value.slotDeclarations) ? value.slotDeclarations : []),
        templateNodes: reviveQDomTree(Array.isArray(value.templateNodes) ? value.templateNodes : []),
        meta: reviveQDomTree(value.meta || {}),
      });
    }
    if (kind === NODE_TYPES.classInstance) {
      return createClassInstanceNode({
        classId: value.classId || value.componentId || value.tagName,
        componentId: value.componentId,
        tagName: value.tagName,
        attributes: reviveQDomTree(value.attributes || {}),
        props: reviveQDomTree(value.props || {}),
        constructorArguments: reviveQDomTree(Array.isArray(value.constructorArguments) ? value.constructorArguments : []),
        argumentSource: value.argumentSource,
        slots: reviveQDomTree(Array.isArray(value.slots) ? value.slots : []),
        children: reviveQDomTree(Array.isArray(value.children) ? value.children : []),
        textContent: value.textContent,
        lifecycleScripts: reviveQDomTree(Array.isArray(value.lifecycleScripts) ? value.lifecycleScripts : []),
        selectorMode: value.selectorMode,
        selectorChain: reviveQDomTree(Array.isArray(value.selectorChain) ? value.selectorChain : []),
        meta: reviveQDomTree(value.meta || {}),
      });
    }
    if (kind === NODE_TYPES.componentInstance || kind === NODE_TYPES.templateInstance) {
      return createComponentInstanceNode({
        kind: kind,
        componentId: value.componentId,
        tagName: value.tagName,
        attributes: reviveQDomTree(value.attributes || {}),
        props: reviveQDomTree(value.props || {}),
        slots: reviveQDomTree(Array.isArray(value.slots) ? value.slots : []),
        lifecycleScripts: reviveQDomTree(Array.isArray(value.lifecycleScripts) ? value.lifecycleScripts : []),
        children: reviveQDomTree(Array.isArray(value.children) ? value.children : []),
        textContent: typeof value.textContent === "string" ? value.textContent : null,
        selectorMode: value.selectorMode,
        selectorChain: reviveQDomTree(Array.isArray(value.selectorChain) ? value.selectorChain : []),
        meta: reviveQDomTree(value.meta || {}),
      });
    }
    if (kind === NODE_TYPES.scriptRule) {
      return createScriptRule({
        selector: value.selector,
        eventName: value.eventName,
        body: value.body,
        meta: reviveQDomTree(value.meta || {}),
      });
    }
    if (kind === NODE_TYPES.color) {
      return createQColorNode({
        name: value.name,
        value: value.value,
        assignments: reviveQDomTree(value.assignments || null),
        mode: value.mode,
        meta: reviveQDomTree(value.meta || {}),
      });
    }
    const fallback = {};
    const keys = Object.keys(value);
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      fallback[key] = reviveQDomTree(value[key]);
    }
    return fallback;
  }

  function nextQDomHostId() {
    qdomHostIdCounter += 1;
    return "qdom-host-" + qdomHostIdCounter;
  }

  function ensureQDomHostId(qHtmlElement) {
    if (!qHtmlElement || typeof qHtmlElement.getAttribute !== "function") {
      return "";
    }
    const existing = String(qHtmlElement.getAttribute(QDOM_HOST_ID_ATTR) || "").trim();
    if (existing) {
      return existing;
    }
    const generated = nextQDomHostId();
    qHtmlElement.setAttribute(QDOM_HOST_ID_ATTR, generated);
    return generated;
  }

  function isQDomTemplateNode(node) {
    return !!(
      node &&
      node.tagName &&
      String(node.tagName).toLowerCase() === "template" &&
      node.getAttribute &&
      node.getAttribute("data-qdom") === "1"
    );
  }

  function findMappedTemplate(parentNode, hostId) {
    if (!parentNode || !hostId || !parentNode.children) {
      return null;
    }
    const children = parentNode.children;
    for (let i = 0; i < children.length; i += 1) {
      const node = children[i];
      if (!isQDomTemplateNode(node)) {
        continue;
      }
      if (String(node.getAttribute(QDOM_TEMPLATE_OWNER_ATTR) || "").trim() === hostId) {
        return node;
      }
    }
    return null;
  }

  function findMappedTemplatesInDocument(contextNode, hostId) {
    if (!contextNode || !hostId) {
      return [];
    }

    const ownerDocument =
      contextNode.nodeType === 9
        ? contextNode
        : contextNode.ownerDocument || (contextNode.parentNode && contextNode.parentNode.ownerDocument) || null;
    if (!ownerDocument || typeof ownerDocument.querySelectorAll !== "function") {
      return [];
    }

    const candidates = ownerDocument.querySelectorAll("template");
    const out = [];
    for (let i = 0; i < candidates.length; i += 1) {
      const node = candidates[i];
      if (!isQDomTemplateNode(node)) {
        continue;
      }
      if (String(node.getAttribute(QDOM_TEMPLATE_OWNER_ATTR) || "").trim() !== hostId) {
        continue;
      }
      out.push(node);
    }
    return out;
  }

  function findMappedTemplateInDocument(contextNode, hostId) {
    const matches = findMappedTemplatesInDocument(contextNode, hostId);
    return matches.length > 0 ? matches[0] : null;
  }

  function removeDuplicateMappedTemplates(parentNode, hostId, keepTemplate) {
    if (!parentNode || !hostId || !parentNode.children) {
      return;
    }
    const children = Array.from(parentNode.children);
    for (let i = 0; i < children.length; i += 1) {
      const node = children[i];
      if (node === keepTemplate) {
        continue;
      }
      if (!isQDomTemplateNode(node)) {
        continue;
      }
      if (String(node.getAttribute(QDOM_TEMPLATE_OWNER_ATTR) || "").trim() !== hostId) {
        continue;
      }
      parentNode.removeChild(node);
    }
  }

  function removeDuplicateMappedTemplatesInDocument(contextNode, hostId, keepTemplate) {
    const matches = findMappedTemplatesInDocument(contextNode, hostId);
    for (let i = 0; i < matches.length; i += 1) {
      const node = matches[i];
      if (node === keepTemplate) {
        continue;
      }
      if (node.parentNode && typeof node.parentNode.removeChild === "function") {
        node.parentNode.removeChild(node);
      }
    }
  }

  function saveQDomTemplateBefore(qHtmlElement, documentNode, doc) {
    const targetDocument = doc || (qHtmlElement && qHtmlElement.ownerDocument) || global.document;
    if (!targetDocument || !qHtmlElement || !qHtmlElement.parentNode) {
      throw new Error("saveQDomTemplateBefore requires a q-html element attached to a document.");
    }

    const hostId = ensureQDomHostId(qHtmlElement);
    const parentNode = qHtmlElement.parentNode;
    const serialized = serializeQDomCompressed(documentNode);
    let template = findMappedTemplate(parentNode, hostId);
    if (!template) {
      template = findMappedTemplateInDocument(qHtmlElement, hostId);
    }
    if (!template) {
      const previous = qHtmlElement.previousElementSibling;
      if (isQDomTemplateNode(previous) && !String(previous.getAttribute(QDOM_TEMPLATE_OWNER_ATTR) || "").trim()) {
        template = previous;
      }
    }
    if (!template) {
      template = targetDocument.createElement("template");
    }

    template.setAttribute("data-qdom", "1");
    template.setAttribute(QDOM_TEMPLATE_OWNER_ATTR, hostId);
    template.setAttribute("data-qdom-encoding", "qdom-lzw-base64");
    template.textContent = serialized;
    if (template.parentNode !== parentNode || template.nextSibling !== qHtmlElement) {
      parentNode.insertBefore(template, qHtmlElement);
    }
    removeDuplicateMappedTemplates(parentNode, hostId, template);
    removeDuplicateMappedTemplatesInDocument(qHtmlElement, hostId, template);
    return template;
  }

  function loadQDomTemplateBefore(qHtmlElement) {
    if (!qHtmlElement) {
      return null;
    }
    const hostId = ensureQDomHostId(qHtmlElement);
    let template = qHtmlElement.previousElementSibling;
    if (!isQDomTemplateNode(template)) {
      template = findMappedTemplate(qHtmlElement.parentNode, hostId);
    }
    if (!isQDomTemplateNode(template)) {
      template = findMappedTemplateInDocument(qHtmlElement, hostId);
    }
    if (!isQDomTemplateNode(template)) {
      return null;
    }
    const owner = String(template.getAttribute(QDOM_TEMPLATE_OWNER_ATTR) || "").trim();
    if (owner && owner !== hostId) {
      return null;
    }
    if (template.parentNode === qHtmlElement.parentNode && template.nextSibling !== qHtmlElement) {
      qHtmlElement.parentNode.insertBefore(template, qHtmlElement);
    }
    removeDuplicateMappedTemplatesInDocument(qHtmlElement, hostId, template);
    return deserializeQDomCompressed(template.textContent || "");
  }

  function markDirty(target) {
    if (!target || typeof target !== "object") {
      return;
    }
    if (target.kind === NODE_TYPES.document) {
      if (!target.meta || typeof target.meta !== "object") {
        target.meta = {};
      }
      target.meta.dirty = true;
      return;
    }
    if (!target.meta || typeof target.meta !== "object") {
      target.meta = {};
    }
    target.meta.dirty = true;
  }

  function observeQDom(documentNode, onChange) {
    const callback = typeof onChange === "function" ? onChange : function noop() {};
    const proxyCache = new WeakMap();
    let active = true;
    let suppressDepth = 0;
    const qdomMethodKinds = new Set([
      NODE_TYPES.document,
      NODE_TYPES.componentInstance,
      NODE_TYPES.templateInstance,
      NODE_TYPES.structInstance,
      NODE_TYPES.slot,
    ]);

    function withMutationsSuppressed(run) {
      if (typeof run !== "function") {
        return undefined;
      }
      suppressDepth += 1;
      try {
        return run();
      } finally {
        suppressDepth = Math.max(0, suppressDepth - 1);
      }
    }

    function isDomLikeObject(value) {
      if (!value || typeof value !== "object") {
        return false;
      }
      if (typeof value.nodeType === "number") {
        return true;
      }
      if (value === global || value === (global && global.document)) {
        return true;
      }
      const tag = Object.prototype.toString.call(value);
      return tag === "[object Window]" || tag === "[object HTMLDocument]" || tag === "[object Document]";
    }

    function proxify(target, path) {
      if (!target || typeof target !== "object") {
        return target;
      }
      if (proxyCache.has(target)) {
        return proxyCache.get(target);
      }

      const localPath = Array.isArray(path) ? path.slice() : [];
      const proxy = new Proxy(target, {
        get(obj, prop, receiver) {
          if (prop === "__qhtmlSourceNode") {
            return obj;
          }
          if (prop === "qdom") {
            const kind = obj && typeof obj.kind === "string" ? obj.kind : "";
            if (qdomMethodKinds.has(kind)) {
              return function qdomSubtree() {
                return proxify(obj, localPath);
              };
            }
          }
          const value = Reflect.get(obj, prop, obj);
          if (typeof value === "function" && isDomLikeObject(obj)) {
            return value.bind(obj);
          }
          if (typeof prop === "symbol") {
            return value;
          }
          return proxify(value, localPath.concat(String(prop)));
        },
        set(obj, prop, value, receiver) {
          const previousValue = obj[prop];
          const didSet = Reflect.set(obj, prop, value, receiver);
          if (!didSet || !active || suppressDepth > 0) {
            return didSet;
          }

          if (previousValue !== value) {
            const mutationPath = localPath.concat(String(prop));
            markDirty(obj);
            markDirty(documentNode);
            callback({
              type: "set",
              path: mutationPath,
              oldValue: previousValue,
              newValue: value,
              target: obj,
            });
          }
          return true;
        },
        deleteProperty(obj, prop) {
          if (!Object.prototype.hasOwnProperty.call(obj, prop)) {
            return true;
          }
          const previousValue = obj[prop];
          const didDelete = Reflect.deleteProperty(obj, prop);
          if (didDelete && active && suppressDepth <= 0) {
            const mutationPath = localPath.concat(String(prop));
            markDirty(obj);
            markDirty(documentNode);
            callback({
              type: "delete",
              path: mutationPath,
              oldValue: previousValue,
              target: obj,
            });
          }
          return didDelete;
        },
      });

      proxyCache.set(target, proxy);
      return proxy;
    }

    return {
      qdom: proxify(documentNode, []),
      disconnect: function disconnect() {
        active = false;
      },
      withMutationsSuppressed: withMutationsSuppressed,
    };
  }

  const api = {
    QDomNode: QDomNode,
    QDocumentNode: QDocumentNode,
    QElementNode: QElementNode,
    QTextNode: QTextNode,
    QRawHtmlNode: QRawHtmlNode,
    QDomModel: QDomModel,
    QRepeaterNode: QRepeaterNode,
    QComponentNode: QComponentNode,
    QStructNode: QStructNode,
    QStructInstanceNode: QStructInstanceNode,
    QClassNode: QClassNode,
    QClassInstanceNode: QClassInstanceNode,
    QComponentInstanceNode: QComponentInstanceNode,
    QTemplateInstanceNode: QTemplateInstanceNode,
    QSlotNode: QSlotNode,
    QSlotDefaultNode: QSlotDefaultNode,
    QScriptRuleNode: QScriptRuleNode,
    QColorNode: QColorNode,
    QCssValue: QCssValue,
    NODE_TYPES: NODE_TYPES,
    TEXT_ALIASES: TEXT_ALIASES,
    QCSS_VALUE_MARKER: QCSS_VALUE_MARKER,
    createCssValue: createCssValue,
    parseCssValue: parseCssValue,
    isCssValue: isCssValue,
    serializeCssValue: serializeCssValue,
    resolveCssValue: resolveCssValue,
    cssAdd: cssAdd,
    cssSub: cssSub,
    cssMul: cssMul,
    cssDiv: cssDiv,
    createCssContextHelper: createCssContextHelper,
    transformCssExpression: transformCssExpression,
    transformCssScriptBody: transformCssScriptBody,
    createDocument: createDocument,
    createElementNode: createElementNode,
    createTextNode: createTextNode,
    createRawHtmlNode: createRawHtmlNode,
    createModelNode: createModelNode,
    createRepeaterNode: createRepeaterNode,
    createComponentNode: createComponentNode,
    createComponentInstanceNode: createComponentInstanceNode,
    createStructNode: createStructNode,
    createStructInstanceNode: createStructInstanceNode,
    createClassNode: createClassNode,
    createClassInstanceNode: createClassInstanceNode,
    createSlotNode: createSlotNode,
    createSlotDefaultNode: createSlotDefaultNode,
    createScriptRule: createScriptRule,
    createQColorNode: createQColorNode,
    isNode: isNode,
    walkQDom: walkQDom,
    cloneDocument: cloneDocument,
    ensureStringArray: ensureStringArray,
    mergeClasses: mergeClasses,
    observeQDom: observeQDom,
    UPDATE_NONCE_KEY: UPDATE_NONCE_KEY,
    QDOM_UUID_KEY: QDOM_UUID_KEY,
    createQDomUuid: createQDomUuid,
    ensureNodeUuid: ensureNodeUuid,
    getNodeUuid: getNodeUuid,
    createUpdateNonceToken: createUpdateNonceToken,
    setUpdateNonce: setUpdateNonce,
    ensureUpdateNonce: ensureUpdateNonce,
    serializeQDomCompressed: serializeQDomCompressed,
    deserializeQDomCompressed: deserializeQDomCompressed,
    saveQDomTemplateBefore: saveQDomTemplateBefore,
    loadQDomTemplateBefore: loadQDomTemplateBefore,
  };

  modules.qdomCore = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
