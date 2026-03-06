(function attachQHtmlRuntime(global) {
  const modules = global.QHtmlModules || (global.QHtmlModules = {});
  const core = modules.qdomCore;
  const parser = modules.qhtmlParser;
  const renderer = modules.domRenderer;

  if (!core || !parser || !renderer) {
    throw new Error("qhtml-runtime requires qdom-core, qhtml-parser, and dom-renderer.");
  }

  const bindings = new WeakMap();
  const importSourceCache = new Map();
  const definitionRegistry = new Map();
  const registeredCustomElements = new Set();
  const QHTML_CONTENT_LOADED_EVENT = "QHTMLContentLoaded";
  let autoMountObserver = null;
  let autoMountRoot = null;
  let autoMountOptions = {};
  let autoMountPollTimer = null;
  let domMutationSyncEnabled = true;
  let domMutationSyncSuspendDepth = 0;
  let runtimeQdomInstanceCounter = 0;
  const qdomInstanceIds = new WeakMap();
  const qdomSlotOwnerIds = new WeakMap();
  const COLLECTION_MUTATION_KEYS = new Set(["nodes", "children", "templateNodes", "slots"]);
  const FORCED_FULL_RENDER_KEYS = new Set([
    "kind",
    "tagName",
    "componentId",
    "definitionType",
    "selectorMode",
    "selectorChain",
    "nodes",
    "children",
    "templateNodes",
    "slots",
    "lifecycleScripts",
    "methods",
    "aliasDeclarations",
    "scripts",
    "html",
  ]);
  const FORM_CONTROL_TAGS = new Set(["input", "textarea", "select"]);
  const MAX_UPDATE_CYCLES_PER_TICK = 1000;
  const MAX_UPDATE_REENTRIES_PER_EPOCH = 1000;
  const DEFAULT_QBIND_EVALUATION_INTERVAL = 10;
  const UPDATE_NONCE_KEY = typeof core.UPDATE_NONCE_KEY === "string" ? core.UPDATE_NONCE_KEY : "update-nonce";
  const DOM_MUTATION_DIRTY_ATTRIBUTE = "qhtml-unsynced";
  const DOM_MUTATION_SYNC_FLUSH_BATCH_SIZE = 25;
  const DOM_MUTATION_SYNC_FLUSH_DELAY_MS = 0;
  const DEFAULT_TEMPLATE_PERSIST_DEBOUNCE_MS = 180;
  const INLINE_REFERENCE_PATTERN = /\$\{\s*([^}]+?)\s*\}/g;
  const INLINE_REFERENCE_ESCAPE_TOKEN = "__QHTML_ESCAPED_INLINE_REF__";
  const DOM_MUTATION_SYNC_OBSERVER_OPTIONS = {
    attributes: true,
    characterData: true,
    subtree: true,
  };
  const QDOM_CHILD_COLLECTION_KEYS = new Set([
    "nodes",
    "children",
    "templateNodes",
    "slots",
    "__qhtmlSlotNodes",
    "__qhtmlRenderTree",
  ]);
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

  function ensureInstanceId(node) {
    if (!node || typeof node !== "object") {
      return "";
    }
    if (qdomInstanceIds.has(node)) {
      const existingFromMap = qdomInstanceIds.get(node);
      if (typeof existingFromMap === "string" && existingFromMap.trim()) {
        return existingFromMap.trim();
      }
    }
    const existing =
      typeof node.instanceId === "string" && node.instanceId.trim()
        ? node.instanceId.trim()
        : typeof node.__qhtmlInstanceId === "string" && node.__qhtmlInstanceId.trim()
          ? node.__qhtmlInstanceId.trim()
          : node.meta && typeof node.meta === "object" && typeof node.meta.instanceId === "string" && node.meta.instanceId.trim()
            ? node.meta.instanceId.trim()
            : "";
    if (existing) {
      qdomInstanceIds.set(node, existing);
      return existing;
    }
    runtimeQdomInstanceCounter += 1;
    const generated = "qdom-instance-" + String(runtimeQdomInstanceCounter);
    qdomInstanceIds.set(node, generated);
    return generated;
  }

  function isNumericPathSegment(segment) {
    return /^[0-9]+$/.test(String(segment || ""));
  }

  function sourceNodeOf(node) {
    if (!node || typeof node !== "object") {
      return null;
    }
    if (node.__qhtmlSourceNode && typeof node.__qhtmlSourceNode === "object") {
      return node.__qhtmlSourceNode;
    }
    return node;
  }

  function normalizeQColorKey(name) {
    return String(name || "")
      .trim()
      .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }

  function normalizeQColorPattern(name) {
    return String(name || "")
      .trim()
      .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
      .toLowerCase()
      .replace(/[^a-z0-9*]/g, "");
  }

  function hasQColorWildcardPattern(name) {
    return normalizeQColorPattern(name).indexOf("*") >= 0;
  }

  function doesQColorRequestMatchAreaName(requestPattern, areaName) {
    const pattern = normalizeQColorPattern(requestPattern);
    const candidate = normalizeQColorKey(areaName);
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

  function qColorStylePropertyForKey(key) {
    const normalized = normalizeQColorKey(key);
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

  function registerQColorSchema(context, areaName, cssProperty) {
    if (!context || !(context.schemas instanceof Map)) {
      return;
    }
    const normalized = normalizeQColorKey(areaName);
    const property = normalizeCssPropertyName(cssProperty);
    if (!normalized || !property) {
      return;
    }
    context.schemas.set(normalized, {
      name: String(areaName || "").trim() || normalized,
      property: property,
    });
  }

  function registerQColorTheme(context, themeName, assignments, options) {
    if (!context || !(context.themes instanceof Map)) {
      return;
    }
    const normalized = normalizeQColorKey(themeName);
    if (!normalized) {
      return;
    }
    context.themes.set(normalized, {
      name: String(themeName || "").trim() || normalized,
      assignments: cloneQColorAssignments(assignments),
    });
    const opts = options || {};
    if (opts.setAsDefault === true || !String(context.defaultThemeName || "").trim()) {
      context.defaultThemeName = normalized;
    }
  }

  function createQColorContext() {
    const out = {
      schemas: new Map(),
      schemaDefs: new Map(),
      themes: new Map(),
      defaultThemeName: DEFAULT_QCOLOR_THEME_NAME,
    };
    const schemaKeys = Object.keys(DEFAULT_QCOLOR_AREA_PROPERTIES);
    for (let i = 0; i < schemaKeys.length; i += 1) {
      const key = schemaKeys[i];
      registerQColorSchema(out, key, DEFAULT_QCOLOR_AREA_PROPERTIES[key]);
    }
    registerQColorTheme(out, DEFAULT_QCOLOR_THEME_NAME, DEFAULT_QCOLOR_THEME_ASSIGNMENTS, {
      setAsDefault: true,
    });
    return out;
  }

  function readDocumentQColorContext(binding) {
    if (
      binding &&
      binding.__qColorContext &&
      typeof binding.__qColorContext === "object" &&
      binding.__qColorContext.schemas instanceof Map &&
      binding.__qColorContext.themes instanceof Map
    ) {
      return binding.__qColorContext;
    }
    const out = createQColorContext();
    if (!binding || !binding.qdom || !binding.qdom.meta || typeof binding.qdom.meta !== "object") {
      if (binding) {
        binding.__qColorContext = out;
      }
      return out;
    }
    const meta = binding.qdom.meta;
    const schemaObject = meta.qColorSchemas && typeof meta.qColorSchemas === "object" ? meta.qColorSchemas : {};
    const schemaKeys = Object.keys(schemaObject);
    for (let i = 0; i < schemaKeys.length; i += 1) {
      const key = String(schemaKeys[i] || "").trim();
      const value = String(schemaObject[key] == null ? "" : schemaObject[key]).trim();
      if (!key || !value) {
        continue;
      }
      registerQColorSchema(out, key, value);
    }
    const schemaDefs = meta.qColorSchemaDefs && typeof meta.qColorSchemaDefs === "object" ? meta.qColorSchemaDefs : {};
    const schemaDefKeys = Object.keys(schemaDefs);
    for (let i = 0; i < schemaDefKeys.length; i += 1) {
      const key = String(schemaDefKeys[i] || "").trim();
      const value = schemaDefs[key];
      if (!key || !value || typeof value !== "object" || Array.isArray(value)) {
        continue;
      }
      out.schemaDefs.set(normalizeQColorKey(key), {
        name: key,
        entries: cloneQColorAssignments(value),
      });
    }

    const themeObject = meta.qColorThemes && typeof meta.qColorThemes === "object" ? meta.qColorThemes : {};
    const themeKeys = Object.keys(themeObject);
    for (let i = 0; i < themeKeys.length; i += 1) {
      const key = String(themeKeys[i] || "").trim();
      const value = themeObject[key];
      if (!key || !value || typeof value !== "object" || Array.isArray(value)) {
        continue;
      }
      registerQColorTheme(out, key, value);
    }
    const defaultTheme = String(meta.qColorDefaultTheme || "").trim();
    if (defaultTheme) {
      out.defaultThemeName = normalizeQColorKey(defaultTheme) || out.defaultThemeName;
    }
    binding.__qColorContext = out;
    delete meta.qColorSchemas;
    delete meta.qColorSchemaDefs;
    delete meta.qColorDefs;
    delete meta.qColorThemes;
    delete meta.qColorDefaultTheme;
    return out;
  }

  function persistDocumentQColorContext(binding, context) {
    if (!binding) {
      return;
    }
    if (context && typeof context === "object") {
      binding.__qColorContext = context;
    }
    if (binding.qdom && binding.qdom.meta && typeof binding.qdom.meta === "object") {
      delete binding.qdom.meta.qColorSchemas;
      delete binding.qdom.meta.qColorSchemaDefs;
      delete binding.qdom.meta.qColorDefs;
      delete binding.qdom.meta.qColorThemes;
      delete binding.qdom.meta.qColorDefaultTheme;
    }
  }

  function lookupQColorPropertyByArea(colorContext, areaName, options) {
    const opts = options && typeof options === "object" ? options : {};
    const normalized = normalizeQColorKey(areaName);
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

  function lookupQColorPropertyOnNode(node, areaName) {
    if (!node || typeof node !== "object" || !node.meta || typeof node.meta !== "object") {
      return "";
    }
    const map =
      node.meta.qColorAreaProperties &&
      typeof node.meta.qColorAreaProperties === "object" &&
      !Array.isArray(node.meta.qColorAreaProperties)
        ? node.meta.qColorAreaProperties
        : null;
    if (!map) {
      return "";
    }
    return lookupAreaValueInObject(map, areaName);
  }

  function resolveQColorThemeAssignments(colorContext, themeName) {
    const normalized = normalizeQColorKey(themeName);
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
    const target = normalizeQColorKey(areaName);
    if (!target) {
      return "";
    }
    const keys = Object.keys(mapObject);
    for (let i = 0; i < keys.length; i += 1) {
      const key = String(keys[i] || "").trim();
      if (!key) {
        continue;
      }
      if (normalizeQColorKey(key) !== target) {
        continue;
      }
      return normalizeQColorResolvedValue(mapObject[key]);
    }
    return "";
  }

  function resolveQColorValue(rawValue, colorContext) {
    const value = normalizeQColorResolvedValue(rawValue);
    if (!value) {
      return "";
    }
    const activeThemeName = String(colorContext && colorContext.defaultThemeName || "").trim();
    const activeTheme = resolveQColorThemeAssignments(colorContext, activeThemeName);
    const fromTheme = normalizeQColorResolvedValue(lookupAreaValueInObject(activeTheme, value));
    if (fromTheme) {
      return fromTheme;
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
      if (!key || normalizeQColorKey(key) === "theme") {
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
      const theme = resolveQColorThemeAssignments(colorContext, themeName);
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
      if (!key || normalizeQColorKey(key) === "theme") {
        continue;
      }
      if (source[key] === true) {
        continue;
      }
      merged[key] = source[key];
    }
    const out = {};
    const mergedKeys = Object.keys(merged);
    for (let i = 0; i < mergedKeys.length; i += 1) {
      const key = String(mergedKeys[i] || "").trim();
      if (!key) {
        continue;
      }
      const resolved = resolveQColorValue(merged[key], colorContext);
      if (!resolved) {
        continue;
      }
      out[key] = resolved;
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
      const cssProp = lookupQColorPropertyByArea(colorContext, key, {
        areaValues: source,
      }) || inferQColorCssProperty(key);
      if (!cssProp) {
        continue;
      }
      declarations.push(cssProp + ": " + value);
    }
    return declarations;
  }

  function buildQColorStyleDeclarations(assignments, colorContext) {
    return buildQColorStyleDeclarationsFromAreaMap(buildQColorAreaValueMap(assignments, colorContext), colorContext);
  }

  function buildQColorAreaValueMapFromList(assignmentsList, colorContext) {
    const list = Array.isArray(assignmentsList) ? assignmentsList : [];
    const merged = {};
    for (let i = 0; i < list.length; i += 1) {
      const values = buildQColorAreaValueMap(list[i], colorContext);
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

  function composeQColorStyle(baseStyle, declarations) {
    const base = String(baseStyle || "").trim();
    const list = Array.isArray(declarations) ? declarations.filter(Boolean) : [];
    const extra = list.join("; ").trim();
    if (!base && !extra) {
      return "";
    }
    if (!base) {
      return extra;
    }
    if (!extra) {
      return base;
    }
    const needsSemicolon = !base.endsWith(";");
    return (base + (needsSemicolon ? ";" : "") + " " + extra).trim();
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
    const normalized = normalizeQColorKey(areaName);
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

  function applyQColorAssignmentsToNode(node, colorContext) {
    if (!node || typeof node !== "object" || !node.meta || typeof node.meta !== "object") {
      return false;
    }
    const assignments = Array.isArray(node.meta.qColorAssignments) ? node.meta.qColorAssignments : [];
    const areaGroups = Array.isArray(node.meta.qColorAreas) ? node.meta.qColorAreas : [];
    const areaValues = buildQColorAreaValueMapFromList(assignments, colorContext);
    const requestedAreas = expandQColorRequestedAreas(
      areaGroups,
      colorContext,
      areaValues,
      node.meta.qColorAreaProperties
    );
    const inlineDeclarations = [];
    const propertyOrder = [];
    const declarationMap = Object.create(null);
    const sourceAreaMap = Object.create(null);
    const missingAreaWarnings = new Set();
    for (let i = 0; i < requestedAreas.length; i += 1) {
      const areaName = requestedAreas[i];
      const value = lookupAreaValueInObject(areaValues, areaName);
      if (!value) {
        const areaKey = normalizeQColorKey(areaName);
        if (areaKey && !missingAreaWarnings.has(areaKey)) {
          missingAreaWarnings.add(areaKey);
          warnQColor("qhtml q-color unknown-area", { area: areaName });
        }
        continue;
      }
      const explicitProperty = lookupQColorPropertyOnNode(node, areaName) || lookupQColorPropertyByArea(colorContext, areaName, {
        areaValues: areaValues,
      });
      const cssProperty = explicitProperty || inferQColorCssProperty(areaName);
      if (!cssProperty) {
        continue;
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
    for (let i = 0; i < propertyOrder.length; i += 1) {
      const normalizedProperty = propertyOrder[i];
      const declaration = String(declarationMap[normalizedProperty] || "").trim();
      if (!declaration) {
        continue;
      }
      inlineDeclarations.push(declaration);
    }

    const baseStyle = String(node.meta.qColorBaseStyle || "").trim();
    const declarations = requestedAreas.length > 0 ? inlineDeclarations : buildQColorStyleDeclarationsFromList(assignments, colorContext);
    const previousManaged = Array.isArray(node.meta.qColorManagedProperties)
      ? node.meta.qColorManagedProperties.slice()
      : [];
    const currentStyle = String(node.attributes && node.attributes.style || "").trim();
    const styleCompose = composeQColorStyleWithExisting({
      currentStyle: currentStyle,
      baseStyle: baseStyle,
      colorDeclarations: declarations,
      previousManagedProperties: previousManaged,
    });
    const mergedStyle = String(styleCompose.style || "").trim();
    node.meta.qColorManagedProperties = Array.isArray(styleCompose.managedProperties)
      ? styleCompose.managedProperties.slice()
      : [];
    if (!node.attributes || typeof node.attributes !== "object") {
      node.attributes = {};
    }
    const previous = String(node.attributes.style || "").trim();
    let styleChanged = false;
    if (mergedStyle) {
      node.attributes.style = mergedStyle;
      styleChanged = previous !== mergedStyle;
    } else if (Object.prototype.hasOwnProperty.call(node.attributes, "style")) {
      delete node.attributes.style;
      styleChanged = previous !== "";
    }

    if (styleChanged) {
      return true;
    }
    return false;
  }

  function collectQColorCandidateAreas(colorContext, areaValues, areaPropertyMap) {
    const out = [];
    const seen = new Set();
    function pushArea(name) {
      const areaName = String(name || "").trim();
      const normalized = normalizeQColorKey(areaName);
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
      const normalized = normalizeQColorKey(areaName);
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

  function evaluateAllNodeQColors(binding) {
    if (!binding || !binding.qdom || !core || typeof core.walkQDom !== "function") {
      return false;
    }
    const colorContext = readDocumentQColorContext(binding);
    let changed = false;
    const changedNodes = [];
    core.walkQDom(binding.rawQdom || binding.qdom, function walkQColor(node) {
      const didChange = applyQColorAssignmentsToNode(node, colorContext);
      changed = didChange || changed;
      if (didChange) {
        changedNodes.push(node);
      }
    });
    if (changed) {
      const root = sourceNodeOf(binding.rawQdom || binding.qdom);
      if (root && typeof root === "object") {
        writeNodeUpdateNonce(root);
      }
      for (let i = 0; i < changedNodes.length; i += 1) {
        writeNodeUpdateNonce(changedNodes[i]);
      }
    }
    return changed;
  }

  function createQColorNodeFromEntry(name, entry, colorContext) {
    if (!core || typeof core.createQColorNode !== "function") {
      return null;
    }
    const nodeName = String(name || "").trim();
    if (!nodeName) {
      return null;
    }
    if (typeof entry === "string") {
      const cssProperty = String(entry || "").trim();
      const node = core.createQColorNode({
        name: nodeName,
        value: cssProperty,
        mode: "schema",
        meta: { generated: true },
      });
      node.style = function styleFromSchema(sampleValue) {
        const value = String(sampleValue == null ? "" : sampleValue).trim();
        if (!cssProperty || !value) {
          return "style { }";
        }
        return "style { " + cssProperty + ": " + value + "; }";
      };
      return node;
    }
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      const entryAssignments =
        entry.assignments && typeof entry.assignments === "object" && !Array.isArray(entry.assignments)
          ? entry.assignments
          : entry;
      const keys = Object.keys(entryAssignments);
      const assignments = {};
      for (let i = 0; i < keys.length; i += 1) {
        const key = String(keys[i] || "").trim();
        if (!key) {
          continue;
        }
        const resolved = resolveQColorValue(entryAssignments[key], colorContext);
        if (!resolved) {
          continue;
        }
        assignments[key] = resolved;
      }
      const node = core.createQColorNode({
        name: nodeName,
        assignments: assignments,
        mode: "theme",
        meta: { generated: true },
      });
      node.style = function styleFromTheme() {
        const keys = Object.keys(assignments);
        const declarations = [];
        for (let i = 0; i < keys.length; i += 1) {
          const key = String(keys[i] || "").trim();
          if (!key) {
            continue;
          }
          const cssProperty = lookupQColorPropertyByArea(colorContext, key, {
            areaValues: assignments,
          }) || inferQColorCssProperty(key);
          if (!cssProperty) {
            continue;
          }
          const value = String(assignments[key] == null ? "" : assignments[key]).trim();
          if (!value) {
            continue;
          }
          declarations.push(cssProperty + ": " + value + ";");
        }
        return "style { " + declarations.join(" ") + " }";
      };
      return node;
    }
    return null;
  }

  function hasInlineReferenceExpressions(value) {
    return typeof value === "string" && value.indexOf("${") !== -1;
  }

  function readInlineReferencePath(base, tail) {
    const parts = String(tail || "")
      .split(".")
      .map(function trimInlinePathPart(part) {
        return String(part || "").trim();
      })
      .filter(Boolean);
    let cursor = base;
    for (let i = 0; i < parts.length; i += 1) {
      if (cursor == null) {
        return undefined;
      }
      try {
        cursor = cursor[parts[i]];
      } catch (error) {
        return undefined;
      }
    }
    return cursor;
  }

  function resolveInlineComponentSource(thisArg, scope) {
    if (scope && typeof scope === "object" && scope.component) {
      return scope.component;
    }
    if (thisArg && (typeof thisArg === "object" || typeof thisArg === "function")) {
      try {
        if (thisArg.component) {
          return thisArg.component;
        }
      } catch (ignoredReadComponent) {
        // no-op
      }
      if (thisArg.nodeType === 1 && typeof thisArg.closest === "function") {
        const nearest = thisArg.closest("[qhtml-component-instance='1']");
        if (nearest) {
          return nearest;
        }
      }
    }
    return null;
  }

  function ensureInlineComponentQdom(componentSource, scope) {
    if (!componentSource || componentSource.nodeType !== 1) {
      return;
    }
    if (typeof componentSource.qdom === "function") {
      return;
    }
    const fallbackQdom = scope && typeof scope === "object" ? scope.componentQdom || null : null;
    if (!fallbackQdom || typeof fallbackQdom !== "object") {
      return;
    }
    try {
      Object.defineProperty(componentSource, "qdom", {
        configurable: true,
        enumerable: false,
        writable: true,
        value: function inlineComponentQdomFallback() {
          return fallbackQdom;
        },
      });
    } catch (error) {
      componentSource.qdom = function inlineComponentQdomFallback() {
        return fallbackQdom;
      };
    }
  }

  function buildInlineExpressionScope(thisArg, extraScope) {
    const scope = Object.create(null);
    if (extraScope && typeof extraScope === "object") {
      const extraKeys = Object.keys(extraScope);
      for (let i = 0; i < extraKeys.length; i += 1) {
        scope[extraKeys[i]] = extraScope[extraKeys[i]];
      }
    }
    if (!Object.prototype.hasOwnProperty.call(scope, "window")) {
      scope.window = global;
    }
    if (!Object.prototype.hasOwnProperty.call(scope, "globalThis")) {
      scope.globalThis = global;
    }
    if (
      !Object.prototype.hasOwnProperty.call(scope, "document") &&
      thisArg &&
      typeof thisArg === "object" &&
      thisArg.ownerDocument
    ) {
      scope.document = thisArg.ownerDocument;
    }
    if ((typeof thisArg === "object" || typeof thisArg === "function") && thisArg) {
      scope.this = thisArg;
      if (!Object.prototype.hasOwnProperty.call(scope, "component")) {
        try {
          if (typeof thisArg.component !== "undefined" && thisArg.component !== null) {
            scope.component = thisArg.component;
          }
        } catch (ignoredReadComponent) {
          // no-op
        }
      }
    }
    const resolvedComponent = resolveInlineComponentSource(thisArg, scope);
    if (resolvedComponent) {
      scope.component = resolvedComponent;
      ensureInlineComponentQdom(resolvedComponent, scope);
    }
    if (scope.component && (typeof thisArg === "object" || typeof thisArg === "function") && thisArg) {
      try {
        thisArg.component = scope.component;
      } catch (ignoredAssignComponent) {
        // no-op
      }
    }
    return scope;
  }

  function evaluateInlineReferenceExpression(expression, thisArg, scope, errorLabel) {
    const source = String(expression || "").trim();
    if (!source) {
      return "";
    }
    const directPathResult = tryResolveInlineReferencePath(source, thisArg, scope);
    if (directPathResult.matched) {
      return directPathResult.value;
    }
    try {
      const evaluator = new Function("__qhtmlScope", "with(__qhtmlScope){ return (" + source + "); }");
      return evaluator.call(thisArg || scope, scope);
    } catch (error) {
      if (global.console && typeof global.console.error === "function") {
        global.console.error(errorLabel || "qhtml inline expression evaluation failed:", error);
      }
      return "";
    }
  }

  function tryResolveInlineReferencePath(expression, thisArg, scope) {
    const source = String(expression || "").trim();
    if (!source) {
      return { matched: false, value: undefined };
    }
    const componentSource = resolveInlineComponentSource(thisArg, scope);
    if (componentSource) {
      ensureInlineComponentQdom(componentSource, scope);
    }

    if (source === "this.component.qdom()" || source === "component.qdom()") {
      if (componentSource && typeof componentSource.qdom === "function") {
        try {
          return { matched: true, value: componentSource.qdom() };
        } catch (error) {
          return { matched: true, value: null };
        }
      }
      return {
        matched: true,
        value: scope && typeof scope === "object" ? scope.componentQdom || null : null,
      };
    }

    if (/^this\.component\.[A-Za-z_$][A-Za-z0-9_$]*(\.[A-Za-z_$][A-Za-z0-9_$]*)*$/.test(source)) {
      return {
        matched: true,
        value: readInlineReferencePath(componentSource, source.slice("this.component.".length)),
      };
    }

    if (/^component\.[A-Za-z_$][A-Za-z0-9_$]*(\.[A-Za-z_$][A-Za-z0-9_$]*)*$/.test(source)) {
      return {
        matched: true,
        value: readInlineReferencePath(componentSource, source.slice("component.".length)),
      };
    }

    if (/^this\.[A-Za-z_$][A-Za-z0-9_$]*(\.[A-Za-z_$][A-Za-z0-9_$]*)*$/.test(source)) {
      return {
        matched: true,
        value: readInlineReferencePath(thisArg, source.slice("this.".length)),
      };
    }

    return { matched: false, value: undefined };
  }

  function interpolateInlineReferenceExpressions(source, thisArg, extraScope, errorLabel) {
    const text = String(source == null ? "" : source);
    if (!hasInlineReferenceExpressions(text)) {
      return text;
    }
    const escaped = text.replace(/\\\$\{/g, INLINE_REFERENCE_ESCAPE_TOKEN);
    const scope = buildInlineExpressionScope(thisArg, extraScope);
    const replaced = escaped.replace(INLINE_REFERENCE_PATTERN, function replaceInlineReference(matchText, expressionText) {
      const value = evaluateInlineReferenceExpression(expressionText, thisArg, scope, errorLabel);
      if (value == null) {
        return "";
      }
      return String(value);
    });
    return replaced.split(INLINE_REFERENCE_ESCAPE_TOKEN).join("${");
  }

  function resolvePathValue(rootNode, path, endIndexExclusive) {
    if (!rootNode || !Array.isArray(path)) {
      return null;
    }
    const limit =
      typeof endIndexExclusive === "number"
        ? Math.max(0, Math.min(path.length, endIndexExclusive))
        : path.length;
    let cursor = rootNode;
    for (let i = 0; i < limit; i += 1) {
      if (!cursor || (typeof cursor !== "object" && typeof cursor !== "function")) {
        return null;
      }
      const key = String(path[i] || "");
      if (Array.isArray(cursor) && isNumericPathSegment(key)) {
        cursor = cursor[Number(key)];
      } else {
        cursor = cursor[key];
      }
    }
    return cursor;
  }

  function registerMappedDomElement(binding, qdomNode, domElement) {
    if (!binding || !qdomNode || typeof qdomNode !== "object" || !domElement || domElement.nodeType !== 1) {
      return;
    }
    if (!binding.domByQdomNode || typeof binding.domByQdomNode.get !== "function") {
      binding.domByQdomNode = new WeakMap();
    }
    let bucket = binding.domByQdomNode.get(qdomNode);
    if (!bucket) {
      bucket = new Set();
      binding.domByQdomNode.set(qdomNode, bucket);
    }
    bucket.add(domElement);
  }

  function collectMappedDomElements(binding, qdomNode) {
    if (!binding || !qdomNode || typeof qdomNode !== "object" || !binding.domByQdomNode) {
      return [];
    }
    const bucket = binding.domByQdomNode.get(qdomNode);
    if (!bucket || typeof bucket.forEach !== "function") {
      return [];
    }
    const out = [];
    bucket.forEach(function eachElement(candidate) {
      if (!candidate || candidate.nodeType !== 1) {
        return;
      }
      if (candidate.isConnected === false) {
        return;
      }
      out.push(candidate);
    });
    return out;
  }

  function isFormControlElement(element) {
    if (!element || element.nodeType !== 1) {
      return false;
    }
    const tagName = String(element.tagName || "").trim().toLowerCase();
    return FORM_CONTROL_TAGS.has(tagName);
  }

  function setDomMutationSyncEnabled(value) {
    domMutationSyncEnabled = value !== false;
    return domMutationSyncEnabled;
  }

  function isDomMutationSyncGloballyEnabled() {
    if (domMutationSyncEnabled === false) {
      return false;
    }
    return domMutationSyncSuspendDepth <= 0;
  }

  function withDomMutationSyncGloballySuspended(callback) {
    if (typeof callback !== "function") {
      return undefined;
    }
    domMutationSyncSuspendDepth += 1;
    try {
      return callback();
    } finally {
      domMutationSyncSuspendDepth = Math.max(0, domMutationSyncSuspendDepth - 1);
    }
  }

  function installGlobalDomMutationSyncToggle() {
    try {
      Object.defineProperty(global, "QHTML_MUTATION_OBSERVERS_ENABLED", {
        configurable: true,
        enumerable: false,
        get: function qhtmlMutationObserversEnabledGetter() {
          return domMutationSyncEnabled;
        },
        set: function qhtmlMutationObserversEnabledSetter(value) {
          setDomMutationSyncEnabled(value);
        },
      });
    } catch (error) {
      global.QHTML_MUTATION_OBSERVERS_ENABLED = domMutationSyncEnabled;
    }
  }

  function qdomNodeHasStructuralChildren(qdomNode) {
    if (!qdomNode || typeof qdomNode !== "object") {
      return false;
    }
    if (Array.isArray(qdomNode.nodes) && qdomNode.nodes.length > 0) {
      return true;
    }
    if (Array.isArray(qdomNode.templateNodes) && qdomNode.templateNodes.length > 0) {
      return true;
    }
    if (Array.isArray(qdomNode.children) && qdomNode.children.length > 0) {
      return true;
    }
    return false;
  }

  function isLeafQDomNode(qdomNode) {
    return !qdomNodeHasStructuralChildren(qdomNode);
  }

  function collectLeafObservedDomTargets(binding) {
    if (!binding || !binding.host) {
      return [];
    }
    const allElements = collectElementScope(binding.host);
    const out = [];
    const seen = new Set();
    for (let i = 0; i < allElements.length; i += 1) {
      const element = allElements[i];
      if (!element || element.nodeType !== 1 || seen.has(element)) {
        continue;
      }
      if (shouldIgnoreDomMutationSyncElement(element)) {
        continue;
      }
      const qdomNode = resolveDomElementQDomNode(binding, element);
      if (!qdomNode || !isLeafQDomNode(qdomNode)) {
        continue;
      }
      seen.add(element);
      out.push(element);
    }
    return out;
  }

  function refreshDomMutationObserverTargets(binding) {
    if (!binding || !binding.domMutationObserver || typeof binding.domMutationObserver.observe !== "function") {
      return;
    }
    const observer = binding.domMutationObserver;
    if (typeof observer.disconnect === "function") {
      observer.disconnect();
    }
    const targets = collectLeafObservedDomTargets(binding);
    binding.domMutationObservedElements = targets;
    for (let i = 0; i < targets.length; i += 1) {
      observer.observe(targets[i], DOM_MUTATION_SYNC_OBSERVER_OPTIONS);
    }
  }

  function reconnectDomMutationObserverTargets(binding) {
    if (!binding || !binding.domMutationObserver || typeof binding.domMutationObserver.observe !== "function") {
      return;
    }
    const observer = binding.domMutationObserver;
    if (typeof observer.disconnect === "function") {
      observer.disconnect();
    }
    const host = binding.host;
    const existingTargets = Array.isArray(binding.domMutationObservedElements) ? binding.domMutationObservedElements : [];
    const nextTargets = [];
    for (let i = 0; i < existingTargets.length; i += 1) {
      const target = existingTargets[i];
      if (!target || target.nodeType !== 1 || target.isConnected === false) {
        continue;
      }
      if (!host || (typeof host.contains === "function" && !host.contains(target))) {
        continue;
      }
      nextTargets.push(target);
      observer.observe(target, DOM_MUTATION_SYNC_OBSERVER_OPTIONS);
    }
    binding.domMutationObservedElements = nextTargets;
  }

  function isDomMutationDirtyAttributeName(attributeName) {
    return String(attributeName || "").trim().toLowerCase() === DOM_MUTATION_DIRTY_ATTRIBUTE;
  }

  function shouldIgnoreDomMutationSyncElement(element) {
    if (!element || element.nodeType !== 1 || typeof element.closest !== "function") {
      return false;
    }
    return !!element.closest("q-builder[q-builder-runtime='1']");
  }

  function markDomElementUnsynced(binding, domElement) {
    if (!binding || !domElement || domElement.nodeType !== 1) {
      return false;
    }
    if (shouldIgnoreDomMutationSyncElement(domElement)) {
      return false;
    }
    const qdomNode = resolveDomElementQDomNode(binding, domElement);
    if (!qdomNode || !isLeafQDomNode(qdomNode)) {
      return false;
    }
    if (!binding.domMutationDirtyElements || typeof binding.domMutationDirtyElements.add !== "function") {
      binding.domMutationDirtyElements = new Set();
    }
    if (!Array.isArray(binding.domMutationDirtyQueue)) {
      binding.domMutationDirtyQueue = [];
    }
    const dirtySet = binding.domMutationDirtyElements;
    const isNewDirty = !dirtySet.has(domElement);
    dirtySet.add(domElement);
    if (isNewDirty) {
      binding.domMutationDirtyQueue.push(domElement);
    }
    try {
      if (typeof domElement.getAttribute === "function" && domElement.getAttribute(DOM_MUTATION_DIRTY_ATTRIBUTE) !== "1") {
        domElement.setAttribute(DOM_MUTATION_DIRTY_ATTRIBUTE, "1");
      }
    } catch (error) {
      // ignore dirty marker attribute failures
    }
    return isNewDirty;
  }

  function clearDomElementUnsynced(binding, domElement) {
    if (binding && binding.domMutationDirtyElements && typeof binding.domMutationDirtyElements.delete === "function") {
      binding.domMutationDirtyElements.delete(domElement);
    }
    if (!domElement || domElement.nodeType !== 1 || typeof domElement.removeAttribute !== "function") {
      return;
    }
    try {
      domElement.removeAttribute(DOM_MUTATION_DIRTY_ATTRIBUTE);
    } catch (error) {
      // ignore dirty marker attribute failures
    }
  }

  function schedulePendingDomMutationSyncFlush(binding) {
    if (!binding || !binding.host || bindings.get(binding.host) !== binding) {
      return;
    }
    if (binding.domMutationFlushTimer || typeof global.setTimeout !== "function") {
      return;
    }
    binding.domMutationFlushTimer = global.setTimeout(function onDeferredDomMutationSyncFlush() {
      binding.domMutationFlushTimer = null;
      flushPendingDomMutationSync(binding, {
        maxItems: DOM_MUTATION_SYNC_FLUSH_BATCH_SIZE,
        scheduleRemainder: true,
      });
    }, DOM_MUTATION_SYNC_FLUSH_DELAY_MS);
  }

  function isInternalRuntimeAttributeName(attributeName) {
    const key = String(attributeName || "").trim().toLowerCase();
    if (!key) {
      return true;
    }
    if (key.indexOf("__qhtml") === 0) {
      return true;
    }
    if (key.indexOf("qhtml-") === 0) {
      return true;
    }
    return false;
  }

  function withDomMutationSyncSuppressed(binding, callback) {
    if (typeof callback !== "function") {
      return undefined;
    }
    return withDomMutationSyncGloballySuspended(function runSuppressed() {
      if (!binding || typeof binding !== "object") {
        return callback();
      }
      if (typeof binding.domMutationSyncSuppressDepth !== "number" || !Number.isFinite(binding.domMutationSyncSuppressDepth)) {
        binding.domMutationSyncSuppressDepth = 0;
      }
      const shouldTemporarilyDisconnect =
        binding.domMutationSyncSuppressDepth === 0 &&
        binding.domMutationSyncAttached === true &&
        binding.domMutationObserver &&
        typeof binding.domMutationObserver.disconnect === "function";
      if (shouldTemporarilyDisconnect) {
        try {
          binding.domMutationObserver.disconnect();
        } catch (error) {
          // ignore observer disconnect errors
        }
      }
      binding.domMutationSyncSuppressDepth += 1;
      try {
        return callback();
      } finally {
        binding.domMutationSyncSuppressDepth = Math.max(0, binding.domMutationSyncSuppressDepth - 1);
      if (
        shouldTemporarilyDisconnect &&
        binding.domMutationSyncSuppressDepth === 0 &&
        binding.domMutationSyncAttached === true &&
        binding.domMutationObserver &&
          typeof binding.domMutationObserver.observe === "function" &&
          binding.host &&
          bindings.get(binding.host) === binding
      ) {
        try {
          reconnectDomMutationObserverTargets(binding);
        } catch (error) {
          if (global.console && typeof global.console.error === "function") {
            global.console.error("qhtml DOM mutation sync observe failed:", error);
          }
          }
        }
      }
    });
  }

  function isDomMutationSyncSuppressed(binding) {
    return !!(
      binding &&
      typeof binding.domMutationSyncSuppressDepth === "number" &&
      Number.isFinite(binding.domMutationSyncSuppressDepth) &&
      binding.domMutationSyncSuppressDepth > 0
    );
  }

  function isTemplatePersistenceEnabled() {
    return !(global && global.QHTML_PERSIST_QDOM_TEMPLATE === false);
  }

  function readTemplatePersistDebounceMs() {
    const configured =
      global && Object.prototype.hasOwnProperty.call(global, "QHTML_TEMPLATE_PERSIST_DEBOUNCE_MS")
        ? Number(global.QHTML_TEMPLATE_PERSIST_DEBOUNCE_MS)
        : DEFAULT_TEMPLATE_PERSIST_DEBOUNCE_MS;
    if (!Number.isFinite(configured) || configured < 0) {
      return DEFAULT_TEMPLATE_PERSIST_DEBOUNCE_MS;
    }
    return Math.max(0, Math.floor(configured));
  }

  function persistQDomTemplate(binding, options) {
    if (!binding || !binding.host || !isTemplatePersistenceEnabled()) {
      return false;
    }
    if (bindings.get(binding.host) !== binding) {
      return false;
    }
    const rootNode = sourceNodeOf(binding.rawQdom || binding.qdom);
    if (!rootNode || typeof rootNode !== "object") {
      return false;
    }
    if (!binding.templatePersistState || typeof binding.templatePersistState !== "object") {
      binding.templatePersistState = {
        lastNonce: "",
        lastPersistedAt: 0,
      };
    }
    const state = binding.templatePersistState;
    const opts = options && typeof options === "object" ? options : {};
    const force = opts.force === true;
    const rootNonce = ensureNodeUpdateNonce(rootNode);
    if (!force && rootNonce && state.lastNonce === rootNonce) {
      return false;
    }
    core.saveQDomTemplateBefore(binding.host, rootNode, binding.doc);
    state.lastNonce = rootNonce || "";
    state.lastPersistedAt = Date.now();
    return true;
  }

  function scheduleTemplatePersistence(binding, options) {
    if (!binding || !isTemplatePersistenceEnabled()) {
      return;
    }
    const opts = options && typeof options === "object" ? options : {};
    const force = opts.force === true;
    const immediate = opts.immediate === true;
    const debounceMs = immediate ? 0 : readTemplatePersistDebounceMs();

    if (binding.templateSaveTimer && typeof global.clearTimeout === "function") {
      global.clearTimeout(binding.templateSaveTimer);
      binding.templateSaveTimer = null;
    }

    if (debounceMs <= 0 || typeof global.setTimeout !== "function") {
      persistQDomTemplate(binding, { force: force });
      return;
    }

    binding.templateSaveTimer = global.setTimeout(function persistLater() {
      binding.templateSaveTimer = null;
      persistQDomTemplate(binding, { force: force });
    }, debounceMs);
  }

  function describeElementForLog(element) {
    if (!element || element.nodeType !== 1) {
      return "<unknown>";
    }
    const tag = String(element.tagName || "").trim().toLowerCase() || "<unknown>";
    const id = typeof element.getAttribute === "function" ? String(element.getAttribute("id") || "").trim() : "";
    return id ? tag + "#" + id : tag;
  }

  function isRuntimeDebugLoggingEnabled() {
    return !!(global && (global.QHTML_RUNTIME_DEBUG === true || global.QHTML_DEBUG === true));
  }

  function logRuntimeEvent(message, details) {
    if (!isRuntimeDebugLoggingEnabled()) {
      return;
    }
    if (!global.console || typeof global.console.log !== "function") {
      return;
    }
    try {
      if (typeof details === "undefined") {
        global.console.log(String(message || "qhtml"));
      } else {
        global.console.log(String(message || "qhtml"), details);
      }
    } catch (error) {
      // ignore logging errors
    }
  }

  function getSignalDocument(root) {
    if (root && root.nodeType === 9) {
      return root;
    }
    if (root && root.ownerDocument) {
      return root.ownerDocument;
    }
    return global.document || null;
  }

  function ensureContentLoadedState(doc) {
    if (!doc || (typeof doc !== "object" && typeof doc !== "function")) {
      return null;
    }
    let state = doc.__qhtmlContentLoadedState;
    if (!state || typeof state !== "object") {
      state = {
        pending: 0,
        sequence: 0,
        timestamp: 0,
        emitQueued: false,
        runtimeManaged: false,
        callbacks: [],
      };
      try {
        Object.defineProperty(doc, "__qhtmlContentLoadedState", {
          value: state,
          configurable: true,
          writable: true,
          enumerable: false,
        });
      } catch (error) {
        doc.__qhtmlContentLoadedState = state;
      }
    }
    if (typeof state.pending !== "number") state.pending = 0;
    if (typeof state.sequence !== "number") state.sequence = 0;
    if (typeof state.timestamp !== "number") state.timestamp = 0;
    if (typeof state.emitQueued !== "boolean") state.emitQueued = false;
    if (typeof state.runtimeManaged !== "boolean") state.runtimeManaged = false;
    if (!Array.isArray(state.callbacks)) state.callbacks = [];
    return state;
  }

  function enqueueContentLoadedCallback(doc, callback) {
    if (typeof callback !== "function") {
      return false;
    }
    const state = ensureContentLoadedState(doc);
    if (!state) {
      return false;
    }
    state.callbacks.push(callback);
    return true;
  }

  function flushContentLoadedCallbacks(doc, detail) {
    const state = ensureContentLoadedState(doc);
    if (!state || !Array.isArray(state.callbacks) || state.callbacks.length === 0) {
      return;
    }
    const callbacks = state.callbacks.splice(0, state.callbacks.length);
    for (let i = 0; i < callbacks.length; i += 1) {
      const callback = callbacks[i];
      if (typeof callback !== "function") {
        continue;
      }
      try {
        callback(detail);
      } catch (error) {
        if (global.console && typeof global.console.error === "function") {
          global.console.error("qhtml content-loaded callback failed:", error);
        }
      }
    }
  }

  function createSignalEvent(detail) {
    if (typeof global.CustomEvent === "function") {
      return new global.CustomEvent(QHTML_CONTENT_LOADED_EVENT, { detail: detail });
    }
    return {
      type: QHTML_CONTENT_LOADED_EVENT,
      detail: detail,
    };
  }

  function createQSignalEvent(payload) {
    if (typeof global.CustomEvent === "function") {
      return new global.CustomEvent("q-signal", {
        detail: payload || {},
        bubbles: true,
        composed: true,
      });
    }
    return {
      type: "q-signal",
      detail: payload || {},
    };
  }

  function emitQSignal(target, payload, eventNamePrefix) {
    const resolvedTarget =
      target && typeof target.dispatchEvent === "function"
        ? target
        : global.document && typeof global.document.dispatchEvent === "function"
          ? global.document
          : null;
    const normalizedPayload = payload && typeof payload === "object" ? payload : {};
    const signalName = String(normalizedPayload.signal || "").trim();
    const prefix = String(eventNamePrefix || "").trim();
    const emitted = {
      qSignal: false,
      namespaced: false,
    };
    if (!resolvedTarget) {
      return emitted;
    }
    try {
      resolvedTarget.dispatchEvent(createQSignalEvent(normalizedPayload));
      emitted.qSignal = true;
    } catch (error) {
      if (global.console && typeof global.console.error === "function") {
        global.console.error("qhtml emitQSignal failed:", error);
      }
    }
    if (prefix && signalName && typeof global.CustomEvent === "function") {
      try {
        resolvedTarget.dispatchEvent(
          new global.CustomEvent(prefix + ":" + signalName, {
            detail: normalizedPayload,
            bubbles: true,
            composed: true,
          })
        );
        emitted.namespaced = true;
      } catch (error) {
        if (global.console && typeof global.console.error === "function") {
          global.console.error("qhtml emitQSignal namespaced dispatch failed:", error);
        }
      }
    }
    return emitted;
  }

  function emitContentLoadedSignal(doc, source) {
    const state = ensureContentLoadedState(doc);
    if (!state) {
      return;
    }
    state.sequence += 1;
    state.pending = 0;
    state.timestamp = Date.now();
    const detail = {
      sequence: state.sequence,
      pending: state.pending,
      timestamp: state.timestamp,
      source: source || null,
    };
    flushContentLoadedCallbacks(doc, detail);

    if (typeof doc.dispatchEvent === "function") {
      try {
        doc.dispatchEvent(createSignalEvent(detail));
      } catch (error) {
        if (global.console && typeof global.console.error === "function") {
          global.console.error("qhtml failed to dispatch QHTMLContentLoaded on document:", error);
        }
      }
    }

    if (global && global !== doc && typeof global.dispatchEvent === "function") {
      try {
        global.dispatchEvent(createSignalEvent(detail));
      } catch (error) {
        if (global.console && typeof global.console.error === "function") {
          global.console.error("qhtml failed to dispatch QHTMLContentLoaded on global:", error);
        }
      }
    }
  }

  function scheduleContentLoadedSignal(doc, source) {
    const state = ensureContentLoadedState(doc);
    if (!state) {
      return;
    }
    if (state.pending > 0 || state.emitQueued) {
      return;
    }
    state.emitQueued = true;

    const dispatch = function dispatchWhenSettled() {
      const latest = ensureContentLoadedState(doc);
      if (!latest) {
        return;
      }
      latest.emitQueued = false;
      if (latest.pending > 0) {
        return;
      }
      emitContentLoadedSignal(doc, source);
    };

    if (typeof global.setTimeout === "function") {
      global.setTimeout(dispatch, 0);
    } else {
      dispatch();
    }
  }

  function markMountPending(doc) {
    const state = ensureContentLoadedState(doc);
    if (!state) {
      return;
    }
    state.runtimeManaged = true;
    state.pending += 1;
    state.timestamp = Date.now();
  }

  function markMountSettled(doc, source) {
    const state = ensureContentLoadedState(doc);
    if (!state) {
      return;
    }
    state.runtimeManaged = true;
    if (state.pending > 0) {
      state.pending -= 1;
    }
    state.timestamp = Date.now();
    scheduleContentLoadedSignal(doc, source);
  }

  function isOnReadyHookName(name) {
    return String(name || "").trim().toLowerCase() === "onready";
  }

  function runLifecycleHookBody(target, body, doc, errorLabel) {
    const source = typeof body === "string" ? body.trim() : "";
    if (!source) {
      return;
    }
    try {
      const componentContext =
        target && (typeof target === "object" || typeof target === "function")
          ? target.component || (typeof resolveNearestComponentHost === "function" ? resolveNearestComponentHost(target) : null)
          : null;
      const executableSource = interpolateInlineReferenceExpressions(
        source,
        target || {},
        {
          component: componentContext,
          document: doc || (target && target.ownerDocument) || global.document || null,
        },
        "qhtml lifecycle interpolation failed:"
      );
      const fn = new Function("event", "document", executableSource);
      fn.call(target, null, doc);
    } catch (error) {
      if (global.console && typeof global.console.error === "function") {
        global.console.error(errorLabel, error);
      }
    }
  }

  function queueHostOnReadyHook(binding, hook) {
    if (!binding || !hook) {
      return;
    }
    const doc = binding.doc || getSignalDocument(binding.host);
    const state = ensureContentLoadedState(doc);
    const key = String(hook.name || "onready") + "::" + String(hook.body || "");
    if (!binding.readyHooksState || typeof binding.readyHooksState !== "object") {
      binding.readyHooksState = {};
    }
    if (binding.readyHooksState[key] === "pending" || binding.readyHooksState[key] === "done") {
      return;
    }
    binding.readyHooksState[key] = "pending";

    const execute = function executeHostOnReady() {
      if (binding.readyHooksState[key] === "done") {
        return;
      }
      binding.readyHooksState[key] = "done";
      runLifecycleHookBody(binding.host, hook.body, doc, "qhtml host lifecycle hook failed:");
    };

    const alreadySignaled = !!(state && Number(state.sequence || 0) > 0 && Number(state.pending || 0) === 0);
    if (!state || !state.runtimeManaged || alreadySignaled) {
      execute();
      return;
    }

    if (!enqueueContentLoadedCallback(doc, execute)) {
      execute();
      return;
    }
  }

  function isQScriptElement(node) {
    return !!node && node.nodeType === 1 && String(node.tagName || "").toLowerCase() === "q-script";
  }

  function findCompanionQScript(qHtmlElement) {
    const next = qHtmlElement ? qHtmlElement.nextElementSibling : null;
    if (isQScriptElement(next)) {
      return next;
    }
    return null;
  }

  function transformScriptBody(body) {
    if (typeof body !== "string" || body.length === 0) {
      return "";
    }
    return body.replace(/(^|[^A-Za-z0-9_$])#([A-Za-z_][A-Za-z0-9_-]*)/g, function replaceSelector(_, prefix, id) {
      return prefix + 'document.querySelector("#' + id + '")';
    });
  }

  function serializeSourceChildNode(node) {
    if (!node || typeof node !== "object") {
      return "";
    }
    if (node.nodeType === 3) {
      return String(node.nodeValue || "");
    }
    if (node.nodeType === 4) {
      return "<![CDATA[" + String(node.nodeValue || "") + "]]>";
    }
    if (node.nodeType === 8) {
      return "<!--" + String(node.nodeValue || "") + "-->";
    }
    if (node.nodeType === 1) {
      if (typeof node.outerHTML === "string") {
        return node.outerHTML;
      }
      const tagName = String(node.tagName || "").trim().toLowerCase() || "div";
      const attrs = node.attributes && typeof node.attributes.length === "number" ? node.attributes : [];
      let attrText = "";
      for (let i = 0; i < attrs.length; i += 1) {
        const attr = attrs[i];
        if (!attr || typeof attr.name !== "string") {
          continue;
        }
        const value = String(attr.value == null ? "" : attr.value).replace(/"/g, "&quot;");
        attrText += " " + attr.name + '="' + value + '"';
      }
      const children = node.childNodes && typeof node.childNodes.length === "number" ? node.childNodes : [];
      let inner = "";
      for (let i = 0; i < children.length; i += 1) {
        inner += serializeSourceChildNode(children[i]);
      }
      return "<" + tagName + attrText + ">" + inner + "</" + tagName + ">";
    }
    return "";
  }

  function readInlineSourceFromElement(element) {
    if (!element || element.nodeType !== 1) {
      return "";
    }
    const children = element.childNodes && typeof element.childNodes.length === "number" ? element.childNodes : [];
    if (children.length === 0) {
      return typeof element.textContent === "string" ? element.textContent : "";
    }
    let out = "";
    for (let i = 0; i < children.length; i += 1) {
      out += serializeSourceChildNode(children[i]);
    }
    return out;
  }

  function resolveImportBaseUrl(qHtmlElement, options) {
    const opts = options || {};
    if (typeof opts.importBaseUrl === "string" && opts.importBaseUrl.trim()) {
      return opts.importBaseUrl.trim();
    }

    const ownerDocument = qHtmlElement ? qHtmlElement.ownerDocument : null;
    if (ownerDocument && typeof ownerDocument.baseURI === "string" && ownerDocument.baseURI.trim()) {
      return ownerDocument.baseURI.trim();
    }

    if (global.location && typeof global.location.href === "string" && global.location.href.trim()) {
      return global.location.href.trim();
    }

    return "";
  }

  function normalizeImportedSource(sourceText) {
    const text = String(sourceText || "");
    const wrapper = text.match(/^\s*<\s*q-html[^>]*>([\s\S]*?)<\s*\/\s*q-html\s*>\s*$/i);
    if (wrapper) {
      return String(wrapper[1] || "");
    }
    return text;
  }

  async function loadImportSource(url) {
    const key = String(url || "").trim();
    if (!key) {
      throw new Error("q-import URL cannot be empty.");
    }
    if (importSourceCache.has(key)) {
      return importSourceCache.get(key);
    }

    if (typeof global.fetch !== "function") {
      throw new Error("q-import requires fetch() support.");
    }

    const pending = (async function fetchImport() {
      let response;
      try {
        response = await global.fetch(key);
      } catch (error) {
        throw new Error("q-import failed to load '" + key + "': " + error.message);
      }

      const status = Number(response && typeof response.status !== "undefined" ? response.status : 200);
      const ok = !!response && (response.ok === true || (status >= 200 && status < 300) || status === 0);
      if (!ok) {
        throw new Error("q-import failed to load '" + key + "' (status " + status + ").");
      }

      const text =
        response && typeof response.text === "function"
          ? await response.text()
          : String(response && typeof response.body !== "undefined" ? response.body : "");
      return normalizeImportedSource(text);
    })();

    importSourceCache.set(key, pending);
    try {
      const loaded = await pending;
      importSourceCache.set(key, Promise.resolve(loaded));
      return loaded;
    } catch (error) {
      importSourceCache.delete(key);
      throw error;
    }
  }

  function inferDefinitionType(definitionNode) {
    if (!definitionNode || typeof definitionNode !== "object") {
      return "component";
    }
    const explicit = String(definitionNode.definitionType || "").trim().toLowerCase();
    if (explicit === "component" || explicit === "template" || explicit === "signal") {
      return explicit;
    }
    const originalSource =
      definitionNode.meta && typeof definitionNode.meta.originalSource === "string"
        ? definitionNode.meta.originalSource.trim().toLowerCase()
        : "";
    if (originalSource.startsWith("q-template")) {
      return "template";
    }
    if (originalSource.startsWith("q-signal")) {
      return "signal";
    }
    return "component";
  }

  function isValidCustomElementName(name) {
    const value = String(name || "").trim().toLowerCase();
    if (!value || value.indexOf("-") === -1) {
      return false;
    }
    return /^[a-z][.0-9_a-z-]*-[.0-9_a-z-]*$/.test(value);
  }

  function registerDefinitionsFromDocument(documentNode) {
    const registry = renderer.collectComponentRegistry(documentNode);
    registry.forEach(function storeDefinition(definitionNode, definitionId) {
      const normalizedId = String(definitionId || "").trim().toLowerCase();
      if (!normalizedId) {
        return;
      }
      definitionRegistry.set(normalizedId, definitionNode);
      if (inferDefinitionType(definitionNode) === "component") {
        registerCustomElementDefinition(normalizedId);
      }
    });
  }

  function isWithinQHtml(element) {
    if (!element || element.nodeType !== 1 || typeof element.closest !== "function") {
      return false;
    }
    return !!element.closest("q-html");
  }

  function hydrateHostElementIfNeeded(hostElement, definitionId, definitionNode, targetDocument) {
    if (!hostElement || hostElement.nodeType !== 1) {
      return;
    }

    const hostTag = String(hostElement.tagName || "").toLowerCase();
    if (hostTag !== definitionId) {
      return;
    }

    const internalMarker = hostElement.getAttribute ? hostElement.getAttribute("qhtml-component-instance") : "";
    const externalMarker = hostElement.getAttribute ? hostElement.getAttribute("qhtml-external-component-instance") : "";
    if (internalMarker === "1") {
      return;
    }
    if (isWithinQHtml(hostElement) && externalMarker !== "1") {
      return;
    }

    try {
      renderer.renderComponentElement(definitionNode, hostElement, targetDocument, {
        componentRegistry: definitionRegistry,
        externalInstance: true,
      });
    } catch (error) {
      if (global.console && typeof global.console.error === "function") {
        global.console.error("qhtml component hydration failed for <" + definitionId + ">:", error);
      }
    }
  }

  function hydrateComponentElement(hostElement, targetDocument) {
    if (!hostElement || hostElement.nodeType !== 1) {
      return false;
    }
    const definitionId = String(hostElement.tagName || "").toLowerCase();
    if (!definitionId) {
      return false;
    }
    const definitionNode = definitionRegistry.get(definitionId);
    if (!definitionNode || inferDefinitionType(definitionNode) !== "component") {
      return false;
    }
    hydrateHostElementIfNeeded(hostElement, definitionId, definitionNode, targetDocument);
    return true;
  }

  function registerCustomElementDefinition(definitionId) {
    const id = String(definitionId || "").trim().toLowerCase();
    if (!id || registeredCustomElements.has(id)) {
      return;
    }
    if (!isValidCustomElementName(id)) {
      return;
    }

    const registry = global.customElements;
    if (!registry || typeof registry.define !== "function" || typeof registry.get !== "function") {
      return;
    }
    if (registry.get(id)) {
      registeredCustomElements.add(id);
      return;
    }
    if (typeof global.HTMLElement !== "function") {
      return;
    }

    class QHtmlRuntimeComponentElement extends global.HTMLElement {
      connectedCallback() {
        hydrateComponentElement(this, this.ownerDocument || global.document);
      }
    }

    try {
      registry.define(id, QHtmlRuntimeComponentElement);
      registeredCustomElements.add(id);
    } catch (error) {
      if (registry.get(id)) {
        registeredCustomElements.add(id);
        return;
      }
      if (global.console && typeof global.console.error === "function") {
        global.console.error("qhtml custom element registration failed for <" + id + ">:", error);
      }
    }
  }

  function hydrateRegisteredComponentHostsInNode(rootNode, targetDocument) {
    const doc = targetDocument || (rootNode && rootNode.ownerDocument) || global.document;
    if (!doc || definitionRegistry.size === 0) {
      return;
    }

    definitionRegistry.forEach(function eachDefinition(definitionNode, definitionId) {
      if (inferDefinitionType(definitionNode) !== "component") {
        return;
      }
      if (!definitionId) {
        return;
      }

      if (rootNode && rootNode.nodeType === 1) {
        hydrateHostElementIfNeeded(rootNode, definitionId, definitionNode, doc);
      }

      const scope = rootNode && typeof rootNode.querySelectorAll === "function" ? rootNode : doc;
      if (!scope || typeof scope.querySelectorAll !== "function") {
        return;
      }
      const matches = scope.querySelectorAll(definitionId);
      for (let i = 0; i < matches.length; i += 1) {
        hydrateHostElementIfNeeded(matches[i], definitionId, definitionNode, doc);
      }
    });
  }

  function detachAllScriptListeners(binding) {
    if (!binding || !Array.isArray(binding.listeners)) {
      return;
    }
    for (let i = 0; i < binding.listeners.length; i += 1) {
      const entry = binding.listeners[i];
      try {
        entry.target.removeEventListener(entry.eventName, entry.handler);
      } catch (error) {
        // ignore listener detach errors during lifecycle teardown
      }
    }
    binding.listeners.length = 0;
  }

  function attachScriptRules(binding) {
    detachAllScriptListeners(binding);

    const rules = Array.isArray(binding.qdom.scripts) ? binding.qdom.scripts : [];
    const doc = binding.doc;

    for (let i = 0; i < rules.length; i += 1) {
      const rule = rules[i];
      if (!rule || rule.kind !== core.NODE_TYPES.scriptRule) {
        continue;
      }

      const selector = String(rule.selector || "").trim();
      const eventName = String(rule.eventName || "").trim();
      if (!selector || !eventName) {
        continue;
      }

      const body = transformScriptBody(String(rule.body || ""));
      const hasInterpolatedBody = hasInlineReferenceExpressions(body);
      let executor;
      if (!hasInterpolatedBody) {
        try {
          executor = new Function("event", "document", body);
        } catch (error) {
          throw new Error("Failed to compile q-script rule for selector '" + selector + "': " + error.message);
        }
      }

      const targets = doc.querySelectorAll(selector);
      for (let j = 0; j < targets.length; j += 1) {
        const target = targets[j];
        const handler = function qScriptHandler(event) {
          if (hasInterpolatedBody) {
            const componentContext =
              target && (typeof target === "object" || typeof target === "function")
                ? target.component ||
                  (typeof resolveNearestComponentHost === "function" ? resolveNearestComponentHost(target) : null)
                : null;
            const interpolatedBody = interpolateInlineReferenceExpressions(
              body,
              target,
              {
                component: componentContext,
                event: event,
                document: doc,
                root: binding.host,
              },
              "qhtml q-script interpolation failed:"
            );
            try {
              const dynamicExecutor = new Function("event", "document", interpolatedBody);
              return dynamicExecutor.call(target, event, doc);
            } catch (error) {
              if (global.console && typeof global.console.error === "function") {
                global.console.error("qhtml q-script rule compile failed:", error);
              }
              return undefined;
            }
          }
          return executor.call(target, event, doc);
        };
        target.addEventListener(eventName, handler);
        binding.listeners.push({
          target: target,
          eventName: eventName,
          handler: handler,
        });
      }
    }
  }

  function runHostLifecycleHooks(binding) {
    if (!binding || binding.hostLifecycleRan) {
      return;
    }

    const lifecycleScripts =
      binding.qdom &&
      binding.qdom.meta &&
      Array.isArray(binding.qdom.meta.lifecycleScripts)
        ? binding.qdom.meta.lifecycleScripts
        : [];

    for (let i = 0; i < lifecycleScripts.length; i += 1) {
      const hook = lifecycleScripts[i];
      const body = hook && typeof hook.body === "string" ? hook.body.trim() : "";
      if (!body) {
        continue;
      }
      const hookName = hook && typeof hook.name === "string" ? hook.name : "";
      if (isOnReadyHookName(hookName)) {
        queueHostOnReadyHook(binding, hook);
      } else {
        runLifecycleHookBody(binding.host, body, binding.doc, "qhtml host lifecycle hook failed:");
      }
    }

    binding.hostLifecycleRan = true;
  }

  function normalizeMutationPath(path) {
    if (!Array.isArray(path)) {
      return [];
    }
    return path.map(function mapSegment(segment) {
      return String(segment || "");
    });
  }

  function mutationNeedsFullRender(mutation) {
    if (!mutation || typeof mutation !== "object") {
      return true;
    }
    const path = normalizeMutationPath(mutation.path);
    if (path.length === 0) {
      return true;
    }

    const last = path[path.length - 1];
    const prev = path.length > 1 ? path[path.length - 2] : "";
    const prev2 = path.length > 2 ? path[path.length - 3] : "";
    const tail = path.slice(Math.max(0, path.length - 4));

    if (prev === "attributes") {
      return false;
    }
    if (last === "attributes") {
      return false;
    }
    if (last === "textContent" || last === "value" || last === "meta" || prev === "meta") {
      return false;
    }
    if (last.indexOf("__qhtml") === 0 || prev.indexOf("__qhtml") === 0) {
      return false;
    }
    if (COLLECTION_MUTATION_KEYS.has(last)) {
      return true;
    }
    if (COLLECTION_MUTATION_KEYS.has(prev) && (isNumericPathSegment(last) || last === "length")) {
      return true;
    }
    if (FORCED_FULL_RENDER_KEYS.has(last)) {
      return true;
    }
    if (
      tail.indexOf("methods") !== -1 ||
      tail.indexOf("lifecycleScripts") !== -1 ||
      tail.indexOf("aliasDeclarations") !== -1 ||
      tail.indexOf("scripts") !== -1
    ) {
      return true;
    }
    if (isNumericPathSegment(last) && FORCED_FULL_RENDER_KEYS.has(prev)) {
      return true;
    }
    if (isNumericPathSegment(prev) && FORCED_FULL_RENDER_KEYS.has(prev2)) {
      return true;
    }
    return false;
  }

  function resolveMutationNode(binding, mutation, path) {
    if (!binding || !binding.qdom) {
      return null;
    }
    const segments = Array.isArray(path) ? path : normalizeMutationPath(mutation && mutation.path);
    if (segments.length === 0) {
      return mutation && mutation.target && typeof mutation.target === "object" ? sourceNodeOf(mutation.target) : null;
    }
    const attrIndex = segments.lastIndexOf("attributes");
    if (attrIndex >= 0) {
      const byPath = sourceNodeOf(resolvePathValue(binding.qdom, segments, attrIndex));
      if (byPath) {
        return byPath;
      }
      return mutation && mutation.target && typeof mutation.target === "object" ? sourceNodeOf(mutation.target) : null;
    }
    const resolved = sourceNodeOf(resolvePathValue(binding.qdom, segments, segments.length - 1));
    if (resolved) {
      return resolved;
    }
    return mutation && mutation.target && typeof mutation.target === "object" ? sourceNodeOf(mutation.target) : null;
  }

  function patchElementAttributeMutation(binding, mutation, path) {
    const attrIndex = path.lastIndexOf("attributes");
    if (attrIndex < 0 || attrIndex >= path.length - 1) {
      return false;
    }
    const attributeName = String(path[attrIndex + 1] || "").trim();
    if (!attributeName) {
      return false;
    }

    const qdomNode = sourceNodeOf(resolvePathValue(binding.qdom, path, attrIndex));
    if (!qdomNode || typeof qdomNode !== "object") {
      return false;
    }
    const domElements = collectMappedDomElements(binding, qdomNode);
    if (domElements.length === 0) {
      return false;
    }

    return withDomMutationSyncSuppressed(binding, function patchAttributes() {
      for (let i = 0; i < domElements.length; i += 1) {
        const element = domElements[i];
        if (!element || element.nodeType !== 1) {
          continue;
        }
        if (mutation.type === "delete" || mutation.newValue === null || typeof mutation.newValue === "undefined") {
          element.removeAttribute(attributeName);
          if (attributeName === "checked" && String(element.tagName || "").toLowerCase() === "input") {
            element.checked = false;
          }
          continue;
        }

        const value = String(mutation.newValue);
        element.setAttribute(attributeName, value);
        if (attributeName === "value" && isFormControlElement(element) && element.value !== value) {
          element.value = value;
        }
        if (attributeName === "checked" && String(element.tagName || "").toLowerCase() === "input") {
          element.checked = value !== "false" && value !== "0" && value !== "";
        }
      }
      return true;
    });
  }

  function patchElementPropertyMutation(binding, mutation, path) {
    if (path.length === 0) {
      return false;
    }
    const propertyName = String(path[path.length - 1] || "").trim();
    if (!propertyName) {
      return false;
    }
    if (propertyName === "attributes") {
      // Attribute object initialization is usually followed by keyed updates.
      return true;
    }
    if (propertyName !== "textContent" && propertyName !== "value") {
      if (propertyName === "meta" || propertyName.indexOf("__qhtml") === 0) {
        return true;
      }
      return false;
    }

    const qdomNode = resolveMutationNode(binding, mutation, path);
    if (!qdomNode || typeof qdomNode !== "object") {
      return false;
    }
    const domElements = collectMappedDomElements(binding, qdomNode);
    if (domElements.length === 0) {
      return false;
    }

    return withDomMutationSyncSuppressed(binding, function patchProperties() {
      for (let i = 0; i < domElements.length; i += 1) {
        const element = domElements[i];
        if (!element || element.nodeType !== 1) {
          continue;
        }
        if (propertyName === "textContent") {
          if (qdomNode.children && Array.isArray(qdomNode.children) && qdomNode.children.length > 0) {
            qdomNode.children.length = 0;
          }
          const textValue = typeof qdomNode.textContent === "string" ? qdomNode.textContent : "";
          element.textContent = textValue;
          continue;
        }

        if (propertyName === "value" && isFormControlElement(element)) {
          const nextValue = mutation && mutation.newValue != null ? String(mutation.newValue) : "";
          if (element.value !== nextValue) {
            element.value = nextValue;
          }
        }
      }
      return true;
    });
  }

  function readRestorableDomProperties(element) {
    if (!element || element.nodeType !== 1) {
      return null;
    }
    const snapshot = {};
    let hasValue = false;
    const tagName = String(element.tagName || "").trim().toLowerCase();

    if (isFormControlElement(element)) {
      try {
        snapshot.value = element.value == null ? "" : String(element.value);
        hasValue = true;
      } catch (error) {
        // ignore unreadable form values
      }
    }

    if (tagName === "input") {
      if (typeof element.checked === "boolean") {
        snapshot.checked = element.checked;
        hasValue = true;
      }
      if (typeof element.indeterminate === "boolean") {
        snapshot.indeterminate = element.indeterminate;
        hasValue = true;
      }
      if (typeof element.selectionStart === "number" && typeof element.selectionEnd === "number") {
        snapshot.selectionStart = element.selectionStart;
        snapshot.selectionEnd = element.selectionEnd;
        hasValue = true;
      }
    } else if (tagName === "textarea") {
      if (typeof element.selectionStart === "number" && typeof element.selectionEnd === "number") {
        snapshot.selectionStart = element.selectionStart;
        snapshot.selectionEnd = element.selectionEnd;
        hasValue = true;
      }
    } else if (tagName === "select" && typeof element.selectedIndex === "number") {
      snapshot.selectedIndex = element.selectedIndex;
      hasValue = true;
    }

    if (typeof element.scrollTop === "number" && element.scrollTop !== 0) {
      snapshot.scrollTop = element.scrollTop;
      hasValue = true;
    }
    if (typeof element.scrollLeft === "number" && element.scrollLeft !== 0) {
      snapshot.scrollLeft = element.scrollLeft;
      hasValue = true;
    }
    if (typeof element.open === "boolean") {
      snapshot.open = element.open;
      hasValue = true;
    }

    return hasValue ? snapshot : null;
  }

  function applyRestorableDomProperties(element, snapshot) {
    if (!element || element.nodeType !== 1 || !snapshot || typeof snapshot !== "object") {
      return;
    }

    if (Object.prototype.hasOwnProperty.call(snapshot, "value") && isFormControlElement(element)) {
      try {
        const nextValue = snapshot.value == null ? "" : String(snapshot.value);
        if (element.value !== nextValue) {
          element.value = nextValue;
        }
      } catch (error) {
        // ignore unwritable form values
      }
    }

    if (Object.prototype.hasOwnProperty.call(snapshot, "checked") && typeof element.checked === "boolean") {
      element.checked = !!snapshot.checked;
    }
    if (Object.prototype.hasOwnProperty.call(snapshot, "indeterminate") && typeof element.indeterminate === "boolean") {
      element.indeterminate = !!snapshot.indeterminate;
    }
    if (Object.prototype.hasOwnProperty.call(snapshot, "selectedIndex") && typeof element.selectedIndex === "number") {
      element.selectedIndex = Number(snapshot.selectedIndex);
    }
    if (
      Object.prototype.hasOwnProperty.call(snapshot, "selectionStart") &&
      Object.prototype.hasOwnProperty.call(snapshot, "selectionEnd") &&
      typeof element.setSelectionRange === "function"
    ) {
      try {
        element.setSelectionRange(Number(snapshot.selectionStart), Number(snapshot.selectionEnd));
      } catch (error) {
        // ignore invalid selection ranges
      }
    }
    if (Object.prototype.hasOwnProperty.call(snapshot, "scrollTop") && typeof element.scrollTop === "number") {
      element.scrollTop = Number(snapshot.scrollTop);
    }
    if (Object.prototype.hasOwnProperty.call(snapshot, "scrollLeft") && typeof element.scrollLeft === "number") {
      element.scrollLeft = Number(snapshot.scrollLeft);
    }
    if (Object.prototype.hasOwnProperty.call(snapshot, "open") && typeof element.open === "boolean") {
      element.open = !!snapshot.open;
    }
  }

  function collectElementScope(rootElement) {
    if (!rootElement || rootElement.nodeType !== 1) {
      return [];
    }
    const out = [rootElement];
    if (typeof rootElement.querySelectorAll !== "function") {
      return out;
    }
    const descendants = rootElement.querySelectorAll("*");
    for (let i = 0; i < descendants.length; i += 1) {
      const element = descendants[i];
      if (!element || element.nodeType !== 1) {
        continue;
      }
      out.push(element);
    }
    return out;
  }

  function resolveElementQdomNode(element) {
    if (!element || element.nodeType !== 1 || typeof element.qdom !== "function") {
      return null;
    }
    try {
      const node = element.qdom();
      const source = sourceNodeOf(node) || node;
      return source && typeof source === "object" ? source : null;
    } catch (error) {
      return null;
    }
  }

  function captureDomPropertyState(binding, rootElement) {
    if (!binding || !binding.host) {
      return new Map();
    }
    const root = rootElement && rootElement.nodeType === 1 ? rootElement : binding.host;
    const elements = collectElementScope(root);
    const snapshots = new Map();
    for (let i = 0; i < elements.length; i += 1) {
      const element = elements[i];
      const qdomNode = resolveElementQdomNode(element);
      if (!qdomNode) {
        continue;
      }
      const snapshot = readRestorableDomProperties(element);
      if (!snapshot) {
        continue;
      }
      snapshots.set(qdomNode, snapshot);
    }
    return snapshots;
  }

  function restoreDomPropertyState(binding, snapshots, rootElement) {
    if (!binding || !binding.host || !snapshots || typeof snapshots.get !== "function" || snapshots.size === 0) {
      return;
    }
    const root = rootElement && rootElement.nodeType === 1 ? rootElement : binding.host;
    const elements = collectElementScope(root);
    for (let i = 0; i < elements.length; i += 1) {
      const element = elements[i];
      const qdomNode = resolveElementQdomNode(element);
      if (!qdomNode) {
        continue;
      }
      const snapshot = snapshots.get(qdomNode);
      if (!snapshot || typeof snapshot !== "object") {
        continue;
      }
      applyRestorableDomProperties(element, snapshot);
    }
  }

  function applyNonStructuralMutation(binding, mutation) {
    const path = normalizeMutationPath(mutation && mutation.path);
    if (path.length === 0) {
      return false;
    }
    if (path.indexOf("attributes") !== -1) {
      return patchElementAttributeMutation(binding, mutation, path);
    }
    return patchElementPropertyMutation(binding, mutation, path);
  }

  function flushObservedMutations(binding) {
    if (!binding || binding.rendering) {
      return;
    }
    if (!binding.host || bindings.get(binding.host) !== binding) {
      return;
    }
    const pending = Array.isArray(binding.pendingMutations) ? binding.pendingMutations.splice(0) : [];
    if (pending.length === 0) {
      return;
    }

    let requiresFullRender = false;
    for (let i = 0; i < pending.length; i += 1) {
      const mutation = pending[i];
      if (requiresFullRender) {
        continue;
      }
      if (mutationNeedsFullRender(mutation)) {
        requiresFullRender = true;
        continue;
      }
      const patched = applyNonStructuralMutation(binding, mutation);
      if (!patched) {
        requiresFullRender = true;
      }
    }

    if (requiresFullRender) {
      renderBinding(binding);
      return;
    }

    scheduleTemplatePersistence(binding);
  }

  function queueObservedMutation(binding, mutation) {
    if (!binding || binding.rendering || binding.updating) {
      return;
    }
    if (!binding.host || bindings.get(binding.host) !== binding) {
      return;
    }

    if (!mutationNeedsFullRender(mutation)) {
      const patched = applyNonStructuralMutation(binding, mutation);
      if (patched) {
        scheduleTemplatePersistence(binding);
        return;
      }
    }

    if (!Array.isArray(binding.pendingMutations)) {
      binding.pendingMutations = [];
    }
    binding.pendingMutations.push(mutation || {});
    if (binding.mutationFlushScheduled) {
      return;
    }
    binding.mutationFlushScheduled = true;

    const flush = function flushQueuedMutations() {
      binding.mutationFlushScheduled = false;
      flushObservedMutations(binding);
    };

    if (typeof global.queueMicrotask === "function") {
      global.queueMicrotask(flush);
    } else if (typeof global.setTimeout === "function") {
      global.setTimeout(flush, 0);
    } else {
      flush();
    }
  }

  function resolveDomElementQDomNode(binding, domElement) {
    if (!binding || !domElement || domElement.nodeType !== 1) {
      return null;
    }
    const mapped = sourceNodeOf(binding.nodeMap && typeof binding.nodeMap.get === "function" ? binding.nodeMap.get(domElement) : null);
    if (mapped && typeof mapped === "object") {
      return mapped;
    }
    if (typeof domElement.qdom !== "function") {
      return null;
    }
    try {
      const resolved = sourceNodeOf(domElement.qdom());
      return resolved && typeof resolved === "object" ? resolved : null;
    } catch (error) {
      return null;
    }
  }

  function canSyncNodeAttributes(qdomNode) {
    if (!qdomNode || typeof qdomNode !== "object") {
      return false;
    }
    const kind = String(qdomNode.kind || "").trim().toLowerCase();
    return kind === "element" || kind === "component-instance" || kind === "template-instance";
  }

  function setQDomNodeAttributeValue(qdomNode, name, nextValue) {
    if (!canSyncNodeAttributes(qdomNode)) {
      return false;
    }
    const key = String(name || "").trim();
    if (!key) {
      return false;
    }
    if (!qdomNode.attributes || typeof qdomNode.attributes !== "object") {
      qdomNode.attributes = {};
    }
    const normalizedValue = String(nextValue == null ? "" : nextValue);
    if (String(qdomNode.attributes[key]) === normalizedValue) {
      return false;
    }
    qdomNode.attributes[key] = normalizedValue;
    return true;
  }

  function removeQDomNodeAttributeValue(qdomNode, name) {
    if (!canSyncNodeAttributes(qdomNode)) {
      return false;
    }
    const key = String(name || "").trim();
    if (!key || !qdomNode.attributes || typeof qdomNode.attributes !== "object") {
      return false;
    }
    if (!Object.prototype.hasOwnProperty.call(qdomNode.attributes, key)) {
      return false;
    }
    delete qdomNode.attributes[key];
    return true;
  }

  function readSyncableQDomChildrenList(qdomNode) {
    if (!qdomNode || typeof qdomNode !== "object") {
      return null;
    }
    const kind = String(qdomNode.kind || "").trim().toLowerCase();
    if (kind === "document") {
      if (!Array.isArray(qdomNode.nodes)) {
        qdomNode.nodes = [];
      }
      return qdomNode.nodes;
    }
    if (kind === "component") {
      if (!Array.isArray(qdomNode.templateNodes)) {
        qdomNode.templateNodes = [];
      }
      return qdomNode.templateNodes;
    }
    if (!Array.isArray(qdomNode.children)) {
      qdomNode.children = [];
    }
    return qdomNode.children;
  }

  function createQDomNodeFromDomNode(domNode) {
    if (!domNode) {
      return null;
    }
    if (domNode.nodeType === 3) {
      const textValue = domNode.nodeValue == null ? "" : String(domNode.nodeValue);
      if (core && typeof core.createTextNode === "function") {
        return core.createTextNode({ value: textValue });
      }
      return {
        kind: "text",
        value: textValue,
        meta: { dirty: false, originalSource: null, sourceRange: null },
      };
    }
    if (domNode.nodeType !== 1) {
      return null;
    }

    const element = domNode;
    const attributes = {};
    const attrList =
      element && element.attributes && typeof element.attributes.length === "number" ? element.attributes : [];
    for (let i = 0; i < attrList.length; i += 1) {
      const attr = attrList[i];
      if (!attr || typeof attr.name !== "string" || isInternalRuntimeAttributeName(attr.name)) {
        continue;
      }
      attributes[attr.name] = attr.value == null ? "" : String(attr.value);
    }
    if (isFormControlElement(element)) {
      attributes.value = element.value == null ? "" : String(element.value);
    }
    if (String(element.tagName || "").trim().toLowerCase() === "input" && element.checked) {
      attributes.checked = "checked";
    }

    const children = [];
    const childNodes =
      element && element.childNodes && typeof element.childNodes.length === "number" ? element.childNodes : [];
    for (let i = 0; i < childNodes.length; i += 1) {
      const child = createQDomNodeFromDomNode(childNodes[i]);
      if (child) {
        children.push(child);
      }
    }

    const tagName = String(element.tagName || "").trim().toLowerCase() || "div";
    if (core && typeof core.createElementNode === "function") {
      return core.createElementNode({
        tagName: tagName,
        attributes: attributes,
        children: children,
      });
    }
    return {
      kind: "element",
      tagName: tagName,
      attributes: attributes,
      children: children,
      textContent: null,
      selectorMode: "single",
      selectorChain: [tagName],
      meta: { dirty: false, originalSource: null, sourceRange: null },
    };
  }

  function markSyncedQDomNodeDirty(binding, qdomNode) {
    if (!binding || !qdomNode || typeof qdomNode !== "object") {
      return;
    }
    writeNodeUpdateNonce(qdomNode, createRuntimeUpdateNonceToken());
  }

  function syncDomControlToQDom(binding, domElement) {
    if (!binding || !domElement || domElement.nodeType !== 1 || !isFormControlElement(domElement)) {
      return false;
    }
    const qdomNode = resolveDomElementQDomNode(binding, domElement);
    if (!qdomNode || typeof qdomNode !== "object") {
      return false;
    }

    let changed = false;
    const tagName = String(domElement.tagName || "").trim().toLowerCase();
    const value = domElement.value == null ? "" : String(domElement.value);
    if (setQDomNodeAttributeValue(qdomNode, "value", value)) {
      changed = true;
    }

    if (tagName === "input") {
      const type = String(domElement.getAttribute("type") || domElement.type || "")
        .trim()
        .toLowerCase();
      if (type === "checkbox" || type === "radio") {
        if (domElement.checked) {
          if (setQDomNodeAttributeValue(qdomNode, "checked", "checked")) {
            changed = true;
          }
        } else if (removeQDomNodeAttributeValue(qdomNode, "checked")) {
          changed = true;
        }
      }
    }

    if (changed) {
      markSyncedQDomNodeDirty(binding, qdomNode);
    }
    return changed;
  }

  function syncDomElementAttributesSnapshotToQDom(binding, domElement) {
    const qdomNode = resolveDomElementQDomNode(binding, domElement);
    if (!qdomNode || typeof qdomNode !== "object" || !canSyncNodeAttributes(qdomNode)) {
      return false;
    }

    if (!qdomNode.attributes || typeof qdomNode.attributes !== "object") {
      qdomNode.attributes = {};
    }
    const attrs = qdomNode.attributes;
    const domAttributeMap = {};
    const attrList =
      domElement && domElement.attributes && typeof domElement.attributes.length === "number" ? domElement.attributes : [];
    for (let i = 0; i < attrList.length; i += 1) {
      const attr = attrList[i];
      if (!attr || typeof attr.name !== "string") {
        continue;
      }
      if (isInternalRuntimeAttributeName(attr.name) || isDomMutationDirtyAttributeName(attr.name)) {
        continue;
      }
      domAttributeMap[attr.name] = attr.value == null ? "" : String(attr.value);
    }

    if (isFormControlElement(domElement)) {
      domAttributeMap.value = domElement.value == null ? "" : String(domElement.value);
      if (String(domElement.tagName || "").trim().toLowerCase() === "input") {
        const inputType = String(domElement.getAttribute("type") || domElement.type || "")
          .trim()
          .toLowerCase();
        if (inputType === "checkbox" || inputType === "radio") {
          if (domElement.checked) {
            domAttributeMap.checked = "checked";
          } else if (Object.prototype.hasOwnProperty.call(domAttributeMap, "checked")) {
            delete domAttributeMap.checked;
          }
        }
      }
    }

    let changed = false;
    const existingKeys = Object.keys(attrs);
    for (let i = 0; i < existingKeys.length; i += 1) {
      const key = existingKeys[i];
      if (isInternalRuntimeAttributeName(key) || isDomMutationDirtyAttributeName(key)) {
        continue;
      }
      if (!Object.prototype.hasOwnProperty.call(domAttributeMap, key)) {
        delete attrs[key];
        changed = true;
      }
    }
    const domKeys = Object.keys(domAttributeMap);
    for (let i = 0; i < domKeys.length; i += 1) {
      const key = domKeys[i];
      const value = String(domAttributeMap[key]);
      if (String(attrs[key]) !== value) {
        attrs[key] = value;
        changed = true;
      }
    }
    if (changed) {
      markSyncedQDomNodeDirty(binding, qdomNode);
    }
    return changed;
  }

  function syncDomElementSnapshotToQDom(binding, domElement) {
    const qdomNode = resolveDomElementQDomNode(binding, domElement);
    if (!qdomNode || !isLeafQDomNode(qdomNode)) {
      return false;
    }
    let changed = false;
    changed = syncDomElementAttributesSnapshotToQDom(binding, domElement) || changed;
    if (!isFormControlElement(domElement)) {
      changed = syncDomElementTextToQDom(binding, domElement) || changed;
    } else {
      changed = syncDomControlToQDom(binding, domElement) || changed;
    }
    return changed;
  }

  function flushPendingDomMutationSyncForElement(binding, domElement) {
    if (!binding || !domElement || domElement.nodeType !== 1 || binding.rendering) {
      return false;
    }
    const dirtySet = binding.domMutationDirtyElements;
    if (!dirtySet || typeof dirtySet.has !== "function" || !dirtySet.has(domElement)) {
      return false;
    }
    const host = binding.host;
    if (!host || bindings.get(host) !== binding) {
      return false;
    }
    if (domElement.isConnected === false || (typeof host.contains === "function" && !host.contains(domElement))) {
      clearDomElementUnsynced(binding, domElement);
      return false;
    }
    const changed = syncDomElementSnapshotToQDom(binding, domElement);
    clearDomElementUnsynced(binding, domElement);
    if (Array.isArray(binding.domMutationDirtyQueue) && binding.domMutationDirtyQueue.length > 0) {
      schedulePendingDomMutationSyncFlush(binding);
    }
    if (changed) {
      scheduleTemplatePersistence(binding);
    }
    return changed;
  }

  function flushPendingDomMutationSync(binding, options) {
    if (!binding || binding.rendering) {
      return false;
    }
    const dirtySet = binding.domMutationDirtyElements;
    if (!dirtySet || typeof dirtySet.size !== "number" || dirtySet.size === 0) {
      return false;
    }
    if (!Array.isArray(binding.domMutationDirtyQueue)) {
      binding.domMutationDirtyQueue = [];
    }
    const host = binding.host;
    if (!host || bindings.get(host) !== binding) {
      return false;
    }
    const opts = options && typeof options === "object" ? options : {};
    const maxItemsRaw = Number(opts.maxItems);
    const maxItems =
      Number.isFinite(maxItemsRaw) && maxItemsRaw > 0 ? Math.max(1, Math.floor(maxItemsRaw)) : DOM_MUTATION_SYNC_FLUSH_BATCH_SIZE;
    let anyChanged = false;
    let processed = 0;
    while (binding.domMutationDirtyQueue.length > 0 && processed < maxItems) {
      const element = binding.domMutationDirtyQueue.pop();
      if (!element || !dirtySet.has(element)) {
        continue;
      }
      if (!element || element.nodeType !== 1) {
        dirtySet.delete(element);
        continue;
      }
      if (element.isConnected === false || (typeof host.contains === "function" && !host.contains(element))) {
        clearDomElementUnsynced(binding, element);
        continue;
      }
      anyChanged = syncDomElementSnapshotToQDom(binding, element) || anyChanged;
      clearDomElementUnsynced(binding, element);
      processed += 1;
    }
    if (binding.domMutationDirtyQueue.length > 0 && opts.scheduleRemainder !== false) {
      schedulePendingDomMutationSyncFlush(binding);
    }
    if (anyChanged) {
      scheduleTemplatePersistence(binding);
    }
    return anyChanged;
  }

  function syncDomElementAttributeToQDom(binding, domElement, attributeName) {
    const qdomNode = resolveDomElementQDomNode(binding, domElement);
    if (!qdomNode || typeof qdomNode !== "object" || !canSyncNodeAttributes(qdomNode)) {
      return false;
    }
    const key = String(attributeName || "").trim();
    if (!key || isInternalRuntimeAttributeName(key)) {
      return false;
    }

    let changed = false;
    if (typeof domElement.hasAttribute === "function" && domElement.hasAttribute(key)) {
      changed = setQDomNodeAttributeValue(qdomNode, key, domElement.getAttribute(key));
    } else {
      changed = removeQDomNodeAttributeValue(qdomNode, key);
    }
    if (changed) {
      markSyncedQDomNodeDirty(binding, qdomNode);
    }
    return changed;
  }

  function syncDomElementTextToQDom(binding, domElement) {
    const qdomNode = resolveDomElementQDomNode(binding, domElement);
    if (!qdomNode || typeof qdomNode !== "object") {
      return false;
    }
    const children = readSyncableQDomChildrenList(qdomNode);
    if (!Array.isArray(children)) {
      return false;
    }
    if (children.length > 0) {
      return false;
    }
    const nextText = domElement && domElement.textContent != null ? String(domElement.textContent) : "";
    let changed = false;
    if (typeof qdomNode.textContent !== "string" || qdomNode.textContent !== nextText) {
      qdomNode.textContent = nextText;
      changed = true;
    }
    if (Object.prototype.hasOwnProperty.call(qdomNode, "html")) {
      delete qdomNode.html;
      changed = true;
    }
    if (changed) {
      markSyncedQDomNodeDirty(binding, qdomNode);
    }
    return changed;
  }

  function syncDomElementChildrenToQDom(binding, domElement) {
    const qdomNode = resolveDomElementQDomNode(binding, domElement);
    if (!qdomNode || typeof qdomNode !== "object") {
      return false;
    }
    const children = readSyncableQDomChildrenList(qdomNode);
    if (!Array.isArray(children)) {
      return false;
    }
    const nextChildren = [];
    const domChildren =
      domElement && domElement.childNodes && typeof domElement.childNodes.length === "number" ? domElement.childNodes : [];
    for (let i = 0; i < domChildren.length; i += 1) {
      const childNode = createQDomNodeFromDomNode(domChildren[i]);
      if (childNode) {
        nextChildren.push(childNode);
      }
    }
    children.splice.apply(children, [0, children.length].concat(nextChildren));
    let changed = true;
    if (Object.prototype.hasOwnProperty.call(qdomNode, "textContent") && qdomNode.textContent !== null) {
      qdomNode.textContent = null;
    }
    if (Object.prototype.hasOwnProperty.call(qdomNode, "html")) {
      delete qdomNode.html;
    }
    if (isFormControlElement(domElement)) {
      changed = syncDomControlToQDom(binding, domElement) || changed;
    }
    if (changed) {
      markSyncedQDomNodeDirty(binding, qdomNode);
    }
    return changed;
  }

  function syncDomMutationRecordToQDom(binding, mutation) {
    if (!binding || !mutation || typeof mutation !== "object") {
      return false;
    }
    if (!isDomMutationSyncGloballyEnabled() || binding.rendering || isDomMutationSyncSuppressed(binding)) {
      return false;
    }
    const mutationType = String(mutation.type || "").trim().toLowerCase();
    if (!mutationType) {
      return false;
    }
    if (mutationType === "attributes") {
      const target = mutation.target;
      if (!target || target.nodeType !== 1) {
        return false;
      }
      if (isDomMutationDirtyAttributeName(mutation.attributeName)) {
        return false;
      }
      if (isInternalRuntimeAttributeName(mutation.attributeName)) {
        return false;
      }
      return markDomElementUnsynced(binding, target);
    }
    if (mutationType === "characterdata") {
      const textNode = mutation.target;
      const parent = textNode && textNode.parentElement ? textNode.parentElement : null;
      if (!parent || parent.nodeType !== 1) {
        return false;
      }
      return markDomElementUnsynced(binding, parent);
    }
    return false;
  }

  function attachDomMutationSync(binding) {
    if (!binding || !binding.host || typeof global.MutationObserver !== "function") {
      return;
    }
    if (binding.domMutationSyncAttached) {
      if (!binding.domMutationRefreshTimer && typeof global.setTimeout === "function") {
        binding.domMutationRefreshTimer = global.setTimeout(function deferredDomMutationObserverRefresh() {
          binding.domMutationRefreshTimer = null;
          if (!binding.domMutationSyncAttached || !binding.host || bindings.get(binding.host) !== binding) {
            return;
          }
          refreshDomMutationObserverTargets(binding);
        }, 0);
      }
      return;
    }
    const host = binding.host;
    const observer = new global.MutationObserver(function onDomMutation(records) {
      if (!binding || !isDomMutationSyncGloballyEnabled() || binding.rendering || isDomMutationSyncSuppressed(binding)) {
        return;
      }
      if (!binding.host || bindings.get(binding.host) !== binding) {
        return;
      }
      const mutations = Array.isArray(records) ? records : [];
      let didMarkDirty = false;
      for (let i = 0; i < mutations.length; i += 1) {
        try {
          didMarkDirty = syncDomMutationRecordToQDom(binding, mutations[i]) || didMarkDirty;
        } catch (error) {
          if (global.console && typeof global.console.error === "function") {
            global.console.error("qhtml DOM mutation sync failed:", error);
          }
        }
      }
      if (didMarkDirty) return;
    });

    binding.domMutationObserver = observer;
    refreshDomMutationObserverTargets(binding);
    binding.domMutationSyncAttached = true;
  }

  function detachDomMutationSync(binding) {
    if (!binding || !binding.domMutationSyncAttached) {
      return;
    }
    if (binding.domMutationObserver && typeof binding.domMutationObserver.disconnect === "function") {
      binding.domMutationObserver.disconnect();
    }
    if (binding.domMutationDirtyElements && typeof binding.domMutationDirtyElements.forEach === "function") {
      binding.domMutationDirtyElements.forEach(function clearEachDirtyElement(element) {
        clearDomElementUnsynced(binding, element);
      });
    }
    if (binding.domMutationFlushTimer && typeof global.clearTimeout === "function") {
      global.clearTimeout(binding.domMutationFlushTimer);
      binding.domMutationFlushTimer = null;
    }
    if (binding.domMutationRefreshTimer && typeof global.clearTimeout === "function") {
      global.clearTimeout(binding.domMutationRefreshTimer);
      binding.domMutationRefreshTimer = null;
    }
    binding.domMutationObserver = null;
    binding.domMutationObservedElements = [];
    binding.domMutationDirtyElements = new Set();
    binding.domMutationDirtyQueue = [];
    binding.domMutationSyncAttached = false;
    binding.domMutationSyncSuppressDepth = 0;
  }

  function attachDomControlSync(binding) {
    if (!binding || !binding.host || binding.domControlSyncAttached) {
      return;
    }
    const host = binding.host;
    const handler = function onControlMutation(event) {
      if (!isDomMutationSyncGloballyEnabled()) {
        return;
      }
      markDomElementUnsynced(binding, event && event.target ? event.target : null);
    };
    host.addEventListener("input", handler, true);
    host.addEventListener("change", handler, true);
    binding.domControlSyncAttached = true;
    binding.domControlSyncHandler = handler;
  }

  function detachDomControlSync(binding) {
    if (!binding || !binding.host || !binding.domControlSyncAttached || typeof binding.domControlSyncHandler !== "function") {
      return;
    }
    binding.host.removeEventListener("input", binding.domControlSyncHandler, true);
    binding.host.removeEventListener("change", binding.domControlSyncHandler, true);
    binding.domControlSyncAttached = false;
    binding.domControlSyncHandler = null;
  }

  function normalizeBindingTargetCollection(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "props") {
      return "props";
    }
    if (normalized === "textcontent") {
      return "textContent";
    }
    return "attributes";
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

  function createRuntimeUpdateNonceToken() {
    if (core && typeof core.createUpdateNonceToken === "function") {
      const token = core.createUpdateNonceToken();
      if (typeof token === "string" && token) {
        return token;
      }
    }
    const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let out = "";
    for (let i = 0; i < 12; i += 1) {
      out += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
    }
    return out || "nonce";
  }

  function readNodeUpdateNonce(node) {
    if (!node || typeof node !== "object") {
      return "";
    }
    const value = node[UPDATE_NONCE_KEY];
    return typeof value === "string" ? value : "";
  }

  function writeNodeUpdateNonce(node, nonceValue) {
    if (!node || typeof node !== "object") {
      return "";
    }
    const next = typeof nonceValue === "string" && nonceValue ? nonceValue : createRuntimeUpdateNonceToken();
    try {
      node[UPDATE_NONCE_KEY] = next;
    } catch (error) {
      // ignore nonce writes on sealed/frozen objects
    }
    return next;
  }

  function ensureNodeUpdateNonce(node) {
    const existing = readNodeUpdateNonce(node);
    if (existing) {
      return existing;
    }
    return writeNodeUpdateNonce(node);
  }

  function walkBindingNodesForNonce(binding, visitor) {
    if (!binding || typeof visitor !== "function") {
      return;
    }
    const root = sourceNodeOf(binding.rawQdom || binding.qdom);
    if (!root || typeof root !== "object") {
      return;
    }
    visitor(root);
    if (typeof core.walkQDom !== "function") {
      return;
    }
    if (String(root.kind || "").trim().toLowerCase() !== "document") {
      return;
    }
    core.walkQDom(root, function walkNode(node) {
      visitor(sourceNodeOf(node) || node);
    });
  }

  function prepareBindingNodeNoncesForUpdate(binding, lastUpdateNonce) {
    const staleNodes = [];
    const compareNonce = typeof lastUpdateNonce === "string" ? lastUpdateNonce : "";
    walkBindingNodesForNonce(binding, function markNode(node) {
      if (!node || typeof node !== "object") {
        return;
      }
      ensureNodeUpdateNonce(node);
      const currentNonce = ensureNodeUpdateNonce(node);
      if (!compareNonce || currentNonce !== compareNonce) {
        staleNodes.push(node);
      }
    });
    return staleNodes;
  }

  function finalizeBindingNodeNonces(binding, cycleNonce) {
    if (!binding) {
      return;
    }
    const updateNonce = typeof cycleNonce === "string" && cycleNonce ? cycleNonce : createRuntimeUpdateNonceToken();
    walkBindingNodesForNonce(binding, function finalizeNode(node) {
      if (!node || typeof node !== "object") {
        return;
      }
      if (readNodeUpdateNonce(node) !== updateNonce) {
        writeNodeUpdateNonce(node, updateNonce);
      }
    });
    binding.lastUpdateNonce = updateNonce;
  }

  function ensureBindingEvaluationState(binding) {
    if (!binding || typeof binding !== "object") {
      return {
        tick: 0,
        interval: DEFAULT_QBIND_EVALUATION_INTERVAL,
      };
    }
    if (!binding.bindingEvaluationState || typeof binding.bindingEvaluationState !== "object") {
      binding.bindingEvaluationState = {
        tick: 0,
        interval: DEFAULT_QBIND_EVALUATION_INTERVAL,
      };
    }
    const state = binding.bindingEvaluationState;
    const configuredInterval = Number(state.interval);
    if (!Number.isFinite(configuredInterval) || configuredInterval <= 0) {
      state.interval = DEFAULT_QBIND_EVALUATION_INTERVAL;
    } else {
      state.interval = Math.max(1, Math.floor(configuredInterval));
    }
    return state;
  }

  function isQBindExpressionBinding(bindingSpec) {
    const expressionType = String(bindingSpec && bindingSpec.expressionType ? bindingSpec.expressionType : "q-bind")
      .trim()
      .toLowerCase();
    return expressionType !== "q-script" && expressionType !== "qscriptexpression";
  }

  function ensureNodeBindingCache(node) {
    if (!node || typeof node !== "object") {
      return null;
    }
    if (!node.meta || typeof node.meta !== "object") {
      node.meta = {};
    }
    if (!node.meta.__qhtmlBindingCache || typeof node.meta.__qhtmlBindingCache !== "object") {
      node.meta.__qhtmlBindingCache = {};
    }
    return node.meta.__qhtmlBindingCache;
  }

  function bindingCacheKeyForEntry(bindingSpec) {
    const key = String(bindingSpec && bindingSpec.name ? bindingSpec.name : "").trim().toLowerCase();
    const target = normalizeBindingTargetCollection(bindingSpec && bindingSpec.targetCollection);
    return target + "::" + key;
  }

  function normalizeBindingValueForNode(bindingSpec, value) {
    const key = String(bindingSpec && bindingSpec.name ? bindingSpec.name : "").trim();
    if (!key) {
      return null;
    }
    const targetCollection = normalizeBindingTargetCollection(bindingSpec.targetCollection);
    if (targetCollection === "props") {
      return {
        key: key,
        targetCollection: "props",
        value: value,
      };
    }
    if (targetCollection === "textContent") {
      return {
        key: key,
        targetCollection: "textContent",
        value: value == null ? "" : String(value),
      };
    }
    if (value === null || typeof value === "undefined" || value === false) {
      return {
        key: key,
        targetCollection: "attributes",
        value: undefined,
      };
    }
    return {
      key: key,
      targetCollection: "attributes",
      value: String(value),
    };
  }

  function stringifyBindingValue(value, seen) {
    if (value === null) {
      return "null";
    }
    if (typeof value === "undefined") {
      return "undefined";
    }
    const type = typeof value;
    if (type === "number") {
      return Number.isNaN(value) ? "number:NaN" : "number:" + String(value);
    }
    if (type === "string") {
      return "string:" + value;
    }
    if (type === "boolean") {
      return "boolean:" + String(value);
    }
    if (type === "bigint") {
      return "bigint:" + String(value);
    }
    if (type === "function") {
      return "function:" + String(value);
    }
    if (type === "symbol") {
      return "symbol:" + String(value);
    }
    const cache = seen || new WeakSet();
    if (cache.has(value)) {
      return "[Circular]";
    }
    cache.add(value);
    if (Array.isArray(value)) {
      const parts = [];
      for (let i = 0; i < value.length; i += 1) {
        parts.push(stringifyBindingValue(value[i], cache));
      }
      return "[" + parts.join(",") + "]";
    }
    const keys = Object.keys(value).sort();
    const parts = [];
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      parts.push(key + ":" + stringifyBindingValue(value[key], cache));
    }
    return "{" + parts.join(",") + "}";
  }

  function createBindingValueFingerprint(normalizedBindingValue) {
    if (!normalizedBindingValue || typeof normalizedBindingValue !== "object") {
      return "null";
    }
    return (
      String(normalizedBindingValue.targetCollection || "attributes") +
      "|" +
      String(normalizedBindingValue.key || "") +
      "|" +
      stringifyBindingValue(normalizedBindingValue.value)
    );
  }

  function ensureBindingComponentScopeCache(binding) {
    if (!binding || (typeof binding !== "object" && typeof binding !== "function")) {
      return null;
    }
    if (!binding.__qhtmlBindingComponentScopeCache || typeof binding.__qhtmlBindingComponentScopeCache !== "object") {
      binding.__qhtmlBindingComponentScopeCache = new WeakMap();
    }
    return binding.__qhtmlBindingComponentScopeCache;
  }

  function childCollectionsForScopeLookup(node) {
    if (!node || typeof node !== "object") {
      return [];
    }
    const out = [];
    if (Array.isArray(node.nodes) && node.nodes.length > 0) {
      out.push(node.nodes);
    }
    if (Array.isArray(node.templateNodes) && node.templateNodes.length > 0) {
      out.push(node.templateNodes);
    }
    if (Array.isArray(node.children) && node.children.length > 0) {
      out.push(node.children);
    }
    if (Array.isArray(node.slots) && node.slots.length > 0) {
      out.push(node.slots);
    }
    return out;
  }

  function resolveBindingComponentScopeNode(binding, targetNode) {
    const normalizedTarget = sourceNodeOf(targetNode) || targetNode;
    if (!normalizedTarget || typeof normalizedTarget !== "object") {
      return null;
    }
    const targetKind = String(normalizedTarget.kind || "").trim().toLowerCase();
    if (targetKind === "component-instance" || targetKind === "template-instance") {
      return normalizedTarget;
    }
    const cache = ensureBindingComponentScopeCache(binding);
    if (cache && cache.has(normalizedTarget)) {
      return cache.get(normalizedTarget) || null;
    }
    const root = sourceNodeOf(binding && (binding.rawQdom || binding.qdom));
    if (!root || typeof root !== "object") {
      if (cache) {
        cache.set(normalizedTarget, null);
      }
      return null;
    }

    let resolvedScope = null;
    function walk(node, activeScope) {
      const normalized = sourceNodeOf(node) || node;
      if (!normalized || typeof normalized !== "object") {
        return false;
      }

      const kind = String(normalized.kind || "").trim().toLowerCase();
      const nextScope =
        kind === "component-instance" || kind === "template-instance" ? normalized : activeScope;

      if (cache) {
        cache.set(normalized, nextScope || null);
      }
      if (normalized === normalizedTarget) {
        resolvedScope = nextScope || null;
        return true;
      }

      const collections = childCollectionsForScopeLookup(normalized);
      for (let i = 0; i < collections.length; i += 1) {
        const list = collections[i];
        for (let j = 0; j < list.length; j += 1) {
          if (walk(list[j], nextScope)) {
            return true;
          }
        }
      }
      return false;
    }

    walk(root, null);
    if (cache && !cache.has(normalizedTarget)) {
      cache.set(normalizedTarget, resolvedScope || null);
    }
    return resolvedScope;
  }

  function createBindingComponentScopeProxy(binding, scopeNode) {
    const normalizedScope = sourceNodeOf(scopeNode) || scopeNode;
    if (!normalizedScope || typeof normalizedScope !== "object") {
      return null;
    }
    const bindingKey = binding && (typeof binding === "object" || typeof binding === "function") ? binding : null;
    let perBindingProxyCache =
      normalizedScope.__qhtmlBindingComponentProxyByBinding &&
      typeof normalizedScope.__qhtmlBindingComponentProxyByBinding.get === "function"
        ? normalizedScope.__qhtmlBindingComponentProxyByBinding
        : null;
    if (!perBindingProxyCache) {
      perBindingProxyCache = new WeakMap();
      try {
        Object.defineProperty(normalizedScope, "__qhtmlBindingComponentProxyByBinding", {
          value: perBindingProxyCache,
          configurable: true,
          writable: true,
          enumerable: false,
        });
      } catch (error) {
        normalizedScope.__qhtmlBindingComponentProxyByBinding = perBindingProxyCache;
      }
    }
    if (bindingKey && perBindingProxyCache.has(bindingKey)) {
      return perBindingProxyCache.get(bindingKey) || null;
    }

    function resolveScopedComponentHost() {
      if (
        bindingKey &&
        bindingKey.componentHostBySourceNode &&
        typeof bindingKey.componentHostBySourceNode.get === "function"
      ) {
        const mappedByScope = bindingKey.componentHostBySourceNode.get(normalizedScope);
        if (mappedByScope && mappedByScope.nodeType === 1) {
          return mappedByScope;
        }
      }
      const mappedScopeElements = collectMappedDomElements(bindingKey, normalizedScope);
      for (let i = 0; i < mappedScopeElements.length; i += 1) {
        const candidate = mappedScopeElements[i];
        if (!candidate || candidate.nodeType !== 1) {
          continue;
        }
        if (
          typeof candidate.getAttribute === "function" &&
          candidate.getAttribute("qhtml-component-instance") === "1"
        ) {
          return candidate;
        }
      }
      for (let i = 0; i < mappedScopeElements.length; i += 1) {
        const candidate = mappedScopeElements[i];
        if (!candidate || candidate.nodeType !== 1 || typeof candidate.closest !== "function") {
          continue;
        }
        const closestHost = candidate.closest("[qhtml-component-instance='1']");
        if (closestHost && closestHost.nodeType === 1) {
          return closestHost;
        }
      }
      return null;
    }

    const proxy = new Proxy({}, {
      get: function getComponentScopeValue(target, prop) {
        if (prop === "qdom") {
          return function bindingComponentScopeQdom() {
            return installQDomFactories(normalizedScope);
          };
        }
        const scopedHost = resolveScopedComponentHost();
        if (scopedHost && scopedHost.nodeType === 1 && typeof prop === "string" && prop) {
          const hostValue = scopedHost[prop];
          if (typeof hostValue === "function") {
            return function callScopedHostMethod() {
              return hostValue.apply(scopedHost, arguments);
            };
          }
          if (typeof hostValue !== "undefined") {
            return hostValue;
          }
        }
        const key = typeof prop === "string" ? prop : "";
        if (!key) {
          return undefined;
        }
        const props = normalizedScope.props && typeof normalizedScope.props === "object" ? normalizedScope.props : null;
        if (props && Object.prototype.hasOwnProperty.call(props, key)) {
          return props[key];
        }
        const attrs =
          normalizedScope.attributes && typeof normalizedScope.attributes === "object" ? normalizedScope.attributes : null;
        if (attrs && Object.prototype.hasOwnProperty.call(attrs, key)) {
          return attrs[key];
        }
        return undefined;
      },
      set: function setComponentScopeValue(target, prop, value) {
        const key = typeof prop === "string" ? prop : "";
        if (!key) {
          return true;
        }
        const scopedHost = resolveScopedComponentHost();
        if (scopedHost && scopedHost.nodeType === 1) {
          scopedHost[key] = value;
          return true;
        }
        if (!normalizedScope.props || typeof normalizedScope.props !== "object") {
          normalizedScope.props = {};
        }
        normalizedScope.props[key] = value;
        return true;
      },
    });

    if (bindingKey) {
      perBindingProxyCache.set(bindingKey, proxy);
    }
    return proxy;
  }

  function createBindingExecutionContext(binding, node) {
    const sourceNode = sourceNodeOf(node) || node;
    const host = binding && binding.host && binding.host.nodeType === 1 ? binding.host : null;
    const domElements = collectMappedDomElements(binding, sourceNode);
    const qdomRoot = sourceNodeOf(binding && (binding.rawQdom || binding.qdom));
    const componentScopeNode = resolveBindingComponentScopeNode(binding, sourceNode);

    function resolveBindingComponentHostElement(scopeNodeCandidate, fallbackElement) {
      if (
        sourceNode &&
        typeof sourceNode === "object" &&
        binding &&
        binding.componentHostBySourceNode &&
        typeof binding.componentHostBySourceNode.get === "function"
      ) {
        const mappedBySource = binding.componentHostBySourceNode.get(sourceNode);
        if (mappedBySource && mappedBySource.nodeType === 1) {
          return mappedBySource;
        }
      }
      const normalizedScope = sourceNodeOf(scopeNodeCandidate) || scopeNodeCandidate;
      if (normalizedScope && typeof normalizedScope === "object") {
        const mappedHosts = collectMappedDomElements(binding, normalizedScope);
        if (mappedHosts.length > 0) {
          return mappedHosts[0];
        }
      }
      const fallback = fallbackElement && fallbackElement.nodeType === 1 ? fallbackElement : null;
      if (!fallback) {
        return null;
      }
      if (
        typeof fallback.getAttribute === "function" &&
        fallback.getAttribute("qhtml-component-instance") === "1"
      ) {
        return fallback;
      }
      if (typeof fallback.closest === "function") {
        return fallback.closest("[qhtml-component-instance='1']");
      }
      return null;
    }

    function querySelectorInDetachedRawHtml(rawHtml, selector) {
      if (!rawHtml || !selector) {
        return null;
      }
      const targetDocument = (binding && binding.doc) || (host && host.ownerDocument) || global.document;
      if (!targetDocument || typeof targetDocument.createElement !== "function") {
        return null;
      }
      try {
        const template = targetDocument.createElement("template");
        template.innerHTML = String(rawHtml || "");
        if (!template.content || typeof template.content.querySelector !== "function") {
          return null;
        }
        return template.content.querySelector(selector);
      } catch (error) {
        return null;
      }
    }

    function resolveSelectorFromQDom(selector) {
      const query = String(selector || "").trim();
      if (!query || !qdomRoot || typeof qdomRoot !== "object") {
        return null;
      }
      let found = null;
      function walk(nodeCandidate) {
        if (found || !nodeCandidate || typeof nodeCandidate !== "object") {
          return;
        }
        const nodeKind = String(nodeCandidate.kind || "").trim().toLowerCase();
        if (nodeKind === "raw-html") {
          found = querySelectorInDetachedRawHtml(nodeCandidate.html, query);
          if (found) {
            return;
          }
        }
        if (
          (nodeKind === "element" || nodeKind === "component-instance" || nodeKind === "template-instance") &&
          nodeCandidate.attributes &&
          typeof nodeCandidate.attributes === "object" &&
          query.charAt(0) === "#" &&
          String(nodeCandidate.attributes.id || "") === query.slice(1)
        ) {
          found = {
            getAttribute: function bindingQDomSelectorGetAttribute(name) {
              const key = String(name || "").trim();
              if (!key) {
                return null;
              }
              if (!nodeCandidate.attributes || typeof nodeCandidate.attributes !== "object") {
                return null;
              }
              if (!Object.prototype.hasOwnProperty.call(nodeCandidate.attributes, key)) {
                return null;
              }
              return String(nodeCandidate.attributes[key]);
            },
            hasAttribute: function bindingQDomSelectorHasAttribute(name) {
              const key = String(name || "").trim();
              if (!key || !nodeCandidate.attributes || typeof nodeCandidate.attributes !== "object") {
                return false;
              }
              return Object.prototype.hasOwnProperty.call(nodeCandidate.attributes, key);
            },
          };
          return;
        }

        const collections = [
          Array.isArray(nodeCandidate.nodes) ? nodeCandidate.nodes : null,
          Array.isArray(nodeCandidate.templateNodes) ? nodeCandidate.templateNodes : null,
          Array.isArray(nodeCandidate.children) ? nodeCandidate.children : null,
          Array.isArray(nodeCandidate.slots) ? nodeCandidate.slots : null,
        ];
        for (let i = 0; i < collections.length; i += 1) {
          const list = collections[i];
          if (!list) {
            continue;
          }
          for (let j = 0; j < list.length; j += 1) {
            walk(list[j]);
            if (found) {
              return;
            }
          }
        }
      }
      walk(qdomRoot);
      return found;
    }

    function wrapDomElementForBinding(element) {
      if (!element || element.nodeType !== 1) {
        return element;
      }
      return new Proxy(element, {
        get: function getBindingElementProperty(target, prop, receiver) {
          if (prop === "component") {
            if (typeof target.closest === "function") {
              const closestHost = target.closest("[qhtml-component-instance='1']");
              if (closestHost && closestHost.nodeType === 1) {
                return closestHost;
              }
            }
            let existing = null;
            try {
              existing = Reflect.get(target, prop, receiver);
            } catch (ignoredComponentRead) {
              existing = null;
            }
            if (existing) {
              return existing;
            }
            const componentHost = resolveBindingComponentHostElement(componentScopeNode, target);
            if (componentHost) {
              return componentHost;
            }
            const scopedHost = resolveBindingComponentHostElement(componentScopeNode, host);
            if (scopedHost) {
              return scopedHost;
            }
            return createBindingComponentScopeProxy(binding, componentScopeNode);
          }
          if (prop === "closest") {
            return function bindingClosest(selector) {
              if (typeof target.closest !== "function") {
                return null;
              }
              const matched = target.closest(selector);
              if (
                matched &&
                matched.nodeType === 1 &&
                String(matched.tagName || "").trim().toLowerCase() === "q-html"
              ) {
                return wrapDomElementForBinding(matched);
              }
              return matched;
            };
          }
          if (prop === "querySelector") {
            return function bindingQuerySelector(selector) {
              const nativeMatch =
                typeof target.querySelector === "function" ? target.querySelector(selector) : null;
              if (nativeMatch) {
                return nativeMatch;
              }
              if (String(target.tagName || "").trim().toLowerCase() === "q-html") {
                return resolveSelectorFromQDom(selector);
              }
              return null;
            };
          }
          if (prop === "querySelectorAll") {
            return function bindingQuerySelectorAll(selector) {
              if (typeof target.querySelectorAll === "function") {
                return target.querySelectorAll(selector);
              }
              return [];
            };
          }
          const value = Reflect.get(target, prop, receiver);
          if (typeof value === "function") {
            return function callBindingElementMethod() {
              return value.apply(target, arguments);
            };
          }
          return value;
        },
      });
    }

    if (domElements.length > 0) {
      return wrapDomElementForBinding(domElements[0]);
    }
    const attributes =
      sourceNode && sourceNode.attributes && typeof sourceNode.attributes === "object" ? sourceNode.attributes : null;
    function resolveContextComponentHost() {
      const resolved = resolveBindingComponentHostElement(componentScopeNode, host);
      if (resolved && resolved.nodeType === 1) {
        return resolved;
      }
      return null;
    }
    const context = {
      qhtmlRoot: host,
      root: function bindingRootAccessor() {
        return host;
      },
      qdom: function bindingQdomAccessor() {
        return installQDomFactories(sourceNode);
      },
      closest: function bindingClosest(selector) {
        const query = String(selector || "").trim();
        if (!query || !host) {
          return null;
        }
        if (typeof host.matches === "function" && host.matches(query)) {
          return wrapDomElementForBinding(host);
        }
        const resolved = typeof host.closest === "function" ? host.closest(query) : null;
        if (
          resolved &&
          resolved.nodeType === 1 &&
          String(resolved.tagName || "").trim().toLowerCase() === "q-html"
        ) {
          return wrapDomElementForBinding(resolved);
        }
        return resolved;
      },
      querySelector: function bindingQuerySelector(selector) {
        if (host && typeof host.querySelector === "function") {
          const nativeMatch = host.querySelector(selector);
          if (nativeMatch) {
            return nativeMatch;
          }
        }
        return resolveSelectorFromQDom(selector);
      },
      querySelectorAll: function bindingQuerySelectorAll(selector) {
        if (!host || typeof host.querySelectorAll !== "function") {
          return [];
        }
        return host.querySelectorAll(selector);
      },
      getAttribute: function bindingGetAttribute(name) {
        const key = String(name || "").trim();
        if (!key || !attributes || !Object.prototype.hasOwnProperty.call(attributes, key)) {
          return null;
        }
        return String(attributes[key]);
      },
      hasAttribute: function bindingHasAttribute(name) {
        const key = String(name || "").trim();
        if (!key || !attributes) {
          return false;
        }
        return Object.prototype.hasOwnProperty.call(attributes, key);
      },
      setAttribute: function bindingSetAttribute(name, value) {
        const key = String(name || "").trim();
        if (!key || !sourceNode || typeof sourceNode !== "object") {
          return;
        }
        if (!sourceNode.attributes || typeof sourceNode.attributes !== "object") {
          sourceNode.attributes = {};
        }
        sourceNode.attributes[key] = String(value == null ? "" : value);
      },
      removeAttribute: function bindingRemoveAttribute(name) {
        const key = String(name || "").trim();
        if (!key || !sourceNode || typeof sourceNode !== "object") {
          return;
        }
        if (!sourceNode.attributes || typeof sourceNode.attributes !== "object") {
          return;
        }
        delete sourceNode.attributes[key];
      },
    };
    Object.defineProperty(context, "component", {
      configurable: true,
      enumerable: true,
      get: function getBindingContextComponent() {
        const resolved = resolveContextComponentHost();
        if (resolved) {
          return resolved;
        }
        return createBindingComponentScopeProxy(binding, componentScopeNode);
      },
      set: function setBindingContextComponent(value) {
        if (value && value.nodeType === 1) {
          return;
        }
      },
    });
    if (host) {
      context.document = host.ownerDocument || global.document || null;
    }
    return context;
  }

  function evaluateBindingExpression(binding, node, bindingSpec) {
    const scriptBody = String(bindingSpec && bindingSpec.script ? bindingSpec.script : "").trim();
    if (!scriptBody) {
      return undefined;
    }
    const fallbackContext = sourceNodeOf(node) || node || {};
    const context = createBindingExecutionContext(binding, node);
    try {
      const wrappedBody = "try {\n" + scriptBody + "\n} catch (__qbindError) { return undefined; }";
      const fn = new Function(wrappedBody);
      return fn.call(context || fallbackContext);
    } catch (error) {
      if (isRuntimeDebugLoggingEnabled() && global.console && typeof global.console.error === "function") {
        global.console.error("qhtml q-bind evaluation failed:", error);
      }
      return undefined;
    }
  }

  function applyBindingValueToNode(node, normalizedBindingValue) {
    if (!node || typeof node !== "object" || !normalizedBindingValue || typeof normalizedBindingValue !== "object") {
      return;
    }
    const key = String(normalizedBindingValue.key || "").trim();
    if (!key) {
      return;
    }
    const targetCollection = String(normalizedBindingValue.targetCollection || "attributes");
    const value = normalizedBindingValue.value;
    if (targetCollection === "props") {
      if (!node.props || typeof node.props !== "object") {
        node.props = {};
      }
      if (typeof value === "undefined") {
        delete node.props[key];
        return;
      }
      node.props[key] = value;
      return;
    }
    if (targetCollection === "textContent") {
      node.textContent = value == null ? "" : String(value);
      return;
    }
    if (!node.attributes || typeof node.attributes !== "object") {
      node.attributes = {};
    }
    if (value === null || typeof value === "undefined" || value === false) {
      delete node.attributes[key];
      return;
    }
    node.attributes[key] = String(value);
  }

  function isPatchableBindingTargetNode(node) {
    if (!node || typeof node !== "object") {
      return false;
    }
    const kind = String(node.kind || "").trim().toLowerCase();
    return kind === "element" || kind === "text";
  }

  function patchBindingChangeInDom(binding, qdomNode, normalizedBindingValue) {
    if (!binding || !qdomNode || !normalizedBindingValue || typeof normalizedBindingValue !== "object") {
      return false;
    }
    if (!isPatchableBindingTargetNode(qdomNode)) {
      return false;
    }
    const domElements = collectMappedDomElements(binding, qdomNode);
    if (domElements.length === 0) {
      return false;
    }
    const key = String(normalizedBindingValue.key || "").trim();
    if (!key) {
      return false;
    }
    const targetCollection = String(normalizedBindingValue.targetCollection || "attributes");
    const value = normalizedBindingValue.value;

    if (targetCollection === "textContent") {
      const nextText = value == null ? "" : String(value);
      for (let i = 0; i < domElements.length; i += 1) {
        const element = domElements[i];
        if (!element || element.nodeType !== 1) {
          continue;
        }
        if (element.textContent !== nextText) {
          element.textContent = nextText;
        }
      }
      return true;
    }

    if (targetCollection !== "attributes") {
      return false;
    }

    for (let i = 0; i < domElements.length; i += 1) {
      const element = domElements[i];
      if (!element || element.nodeType !== 1) {
        continue;
      }
      if (typeof value === "undefined") {
        element.removeAttribute(key);
        if (key === "checked" && String(element.tagName || "").toLowerCase() === "input") {
          element.checked = false;
        }
        continue;
      }
      const attrValue = String(value);
      element.setAttribute(key, attrValue);
      if (key === "value" && isFormControlElement(element) && element.value !== attrValue) {
        element.value = attrValue;
      }
      if (key === "checked" && String(element.tagName || "").toLowerCase() === "input") {
        element.checked = attrValue !== "false" && attrValue !== "0" && attrValue !== "";
      }
    }
    return true;
  }

  function markChangedBindingNodesForUpdate(binding, changedNodes) {
    if (!binding || !changedNodes || typeof changedNodes.forEach !== "function") {
      return;
    }
    const root = sourceNodeOf(binding.rawQdom || binding.qdom);
    if (root && typeof root === "object") {
      writeNodeUpdateNonce(root);
    }
    changedNodes.forEach(function markNode(node) {
      const source = sourceNodeOf(node) || node;
      if (!source || typeof source !== "object") {
        return;
      }
      writeNodeUpdateNonce(source);
    });
  }

  function evaluateAllNodeBindings(binding, options) {
    if (!binding || typeof core.walkQDom !== "function") {
      return {
        changed: false,
        changedNodes: new Set(),
        patchedCount: 0,
      };
    }
    const root = binding.rawQdom || binding.qdom;
    if (!root) {
      return {
        changed: false,
        changedNodes: new Set(),
        patchedCount: 0,
      };
    }
    const opts = options || {};
    const state = ensureBindingEvaluationState(binding);
    const forceAll = opts.forceAll === true;
    state.tick += 1;
    const allowQBindEvaluation = forceAll || state.tick % state.interval === 0;
    const result = evaluateNodeBindingsInTree(root, {
      forceAll: forceAll,
      allowQBindEvaluation: allowQBindEvaluation,
      evaluationTick: state.tick,
      patchDom: opts.patchDom === true,
      binding: binding,
    });
    if (result.changed) {
      markChangedBindingNodesForUpdate(binding, result.changedNodes);
    }
    if (result.patchedCount > 0) {
      scheduleTemplatePersistence(binding);
    }
    return result;
  }

  function evaluateNodeBindingsInTree(rootNode, options) {
    if (!rootNode || typeof core.walkQDom !== "function") {
      return {
        changed: false,
        changedNodes: new Set(),
        patchedCount: 0,
      };
    }
    const opts = options || {};
    let changed = false;
    const changedNodes = new Set();
    let patchedCount = 0;
    core.walkQDom(rootNode, function evaluateBindingsForNode(node) {
      const entries = readNodeBindingEntries(node);
      if (entries.length === 0) {
        return;
      }
      const cache = ensureNodeBindingCache(node);
      for (let i = 0; i < entries.length; i += 1) {
        const entry = entries[i];
        const cacheKey = bindingCacheKeyForEntry(entry);
        const cacheEntry = cache && cache[cacheKey] && typeof cache[cacheKey] === "object" ? cache[cacheKey] : {};
        const hasCachedFingerprint = Object.prototype.hasOwnProperty.call(cacheEntry, "fingerprint");
        const shouldEvaluateQBind = !isQBindExpressionBinding(entry) || opts.allowQBindEvaluation === true;
        if (opts.forceAll !== true && !shouldEvaluateQBind && hasCachedFingerprint) {
          continue;
        }
        const value = evaluateBindingExpression(opts.binding, node, entry);
        const normalized = normalizeBindingValueForNode(entry, value);
        const nextFingerprint = createBindingValueFingerprint(normalized);
        if (hasCachedFingerprint && cacheEntry.fingerprint === nextFingerprint) {
          cacheEntry.lastEvaluatedTick = Number(opts.evaluationTick) || 0;
          if (cache) {
            cache[cacheKey] = cacheEntry;
          }
          continue;
        }
        applyBindingValueToNode(node, normalized);
        if (cache) {
          cache[cacheKey] = {
            fingerprint: nextFingerprint,
            lastEvaluatedTick: Number(opts.evaluationTick) || 0,
          };
        }
        const sourceNode = sourceNodeOf(node) || node;
        const patched = opts.patchDom === true && patchBindingChangeInDom(opts.binding, sourceNode, normalized);
        if (patched) {
          patchedCount += 1;
          continue;
        }
        changed = true;
        changedNodes.add(sourceNode);
      }
    });
    return {
      changed: changed,
      changedNodes: changedNodes,
      patchedCount: patchedCount,
    };
  }

  function createScopedRenderDocument(binding, scopeNode) {
    if (!binding || !scopeNode || typeof scopeNode !== "object" || !core || typeof core.createDocument !== "function") {
      return null;
    }
    const temporary = core.createDocument({ source: "" });
    const root = sourceNodeOf(binding.rawQdom || binding.qdom);
    const rootNodes = root && Array.isArray(root.nodes) ? root.nodes : [];
    for (let i = 0; i < rootNodes.length; i += 1) {
      const candidate = rootNodes[i];
      if (!candidate || typeof candidate !== "object") {
        continue;
      }
      if (String(candidate.kind || "").trim().toLowerCase() !== "component") {
        continue;
      }
      temporary.nodes.push(candidate);
    }
    temporary.nodes.push(scopeNode);
    return temporary;
  }

  function mergeCapturedMappingsIntoBinding(binding, captured) {
    if (!binding || !captured || typeof captured !== "object") {
      return;
    }
    if (!binding.nodeMap || typeof binding.nodeMap.set !== "function") {
      binding.nodeMap = new WeakMap();
    }
    if (!binding.componentMap || typeof binding.componentMap.set !== "function") {
      binding.componentMap = new WeakMap();
    }
    if (!binding.slotMap || typeof binding.slotMap.set !== "function") {
      binding.slotMap = new WeakMap();
    }
    if (!binding.componentHostBySourceNode || typeof binding.componentHostBySourceNode.set !== "function") {
      binding.componentHostBySourceNode = new WeakMap();
    }
    if (!binding.domByQdomNode || typeof binding.domByQdomNode.get !== "function") {
      binding.domByQdomNode = new WeakMap();
    }

    const nodeMap = captured.nodeMap instanceof Map ? captured.nodeMap : null;
    const componentMap = captured.componentMap instanceof Map ? captured.componentMap : null;
    const slotMap = captured.slotMap instanceof Map ? captured.slotMap : null;

    if (nodeMap) {
      nodeMap.forEach(function mapNode(sourceNode, domElement) {
        if (!domElement || domElement.nodeType !== 1) {
          return;
        }
        const normalizedSource = sourceNodeOf(sourceNode) || sourceNode;
        if (!normalizedSource || typeof normalizedSource !== "object") {
          return;
        }
        binding.nodeMap.set(domElement, normalizedSource);
        registerMappedDomElement(binding, normalizedSource, domElement);
        const componentHost =
          componentMap && typeof componentMap.get === "function" ? componentMap.get(domElement) : null;
        if (componentHost && componentHost.nodeType === 1) {
          binding.componentHostBySourceNode.set(normalizedSource, componentHost);
        }
      });
    }
    if (componentMap) {
      componentMap.forEach(function mapComponent(hostElement, domElement) {
        if (!domElement || domElement.nodeType !== 1 || !hostElement || hostElement.nodeType !== 1) {
          return;
        }
        binding.componentMap.set(domElement, hostElement);
      });
    }
    if (slotMap) {
      slotMap.forEach(function mapSlot(slotNode, domElement) {
        if (!domElement || domElement.nodeType !== 1 || !slotNode || typeof slotNode !== "object") {
          return;
        }
        const normalizedSlot = sourceNodeOf(slotNode) || slotNode;
        binding.slotMap.set(domElement, normalizedSlot);
      });
    }
  }

  function terminateWasmRuntimesInNode(rootNode) {
    if (!rootNode || rootNode.nodeType !== 1) {
      return;
    }
    const targets = [];
    targets.push(rootNode);
    if (typeof rootNode.querySelectorAll === "function") {
      const nested = rootNode.querySelectorAll("[qhtml-component-instance='1']");
      for (let i = 0; i < nested.length; i += 1) {
        targets.push(nested[i]);
      }
    }
    for (let i = 0; i < targets.length; i += 1) {
      const element = targets[i];
      if (!element || element.nodeType !== 1) {
        continue;
      }
      const runtimeHandle =
        element.__qhtmlWasmRuntime &&
        typeof element.__qhtmlWasmRuntime === "object" &&
        typeof element.__qhtmlWasmRuntime.terminate === "function"
          ? element.__qhtmlWasmRuntime
          : null;
      if (!runtimeHandle) {
        continue;
      }
      try {
        runtimeHandle.terminate();
      } catch (error) {
        if (global.console && typeof global.console.warn === "function") {
          global.console.warn("qhtml q-wasm runtime terminate failed:", error);
        }
      }
      try {
        element.__qhtmlWasmRuntime = null;
      } catch (assignError) {
        // no-op
      }
    }
  }

  function renderScopedComponentBinding(binding, scopeElement, options) {
    if (!binding || !binding.qdom || !scopeElement || scopeElement.nodeType !== 1) {
      return false;
    }

    const sourceScopeNode = sourceNodeOf(binding.nodeMap && binding.nodeMap.get(scopeElement));
    if (!sourceScopeNode || typeof sourceScopeNode !== "object") {
      return false;
    }
    const restorableState = captureDomPropertyState(binding, scopeElement);

    const scopeKind = String(sourceScopeNode.kind || "").trim().toLowerCase();
    if (scopeKind !== "component-instance" && scopeKind !== "template-instance") {
      return false;
    }

    const targetDocument = binding.doc || scopeElement.ownerDocument || global.document;
    if (!targetDocument) {
      return false;
    }

    const opts = options || {};
    if (opts.skipBindingEvaluation !== true) {
      evaluateNodeBindingsInTree(sourceScopeNode, {
        forceAll: true,
        allowQBindEvaluation: true,
        evaluationTick: 0,
        patchDom: false,
        binding: binding,
      });
      evaluateAllNodeQColors(binding);
    }
    registerDefinitionsFromDocument(binding.rawQdom || binding.qdom);

    const scopedDocument = createScopedRenderDocument(binding, sourceScopeNode);
    if (!scopedDocument) {
      return false;
    }

    const capturedNodeMap = new Map();
    const capturedComponentMap = new Map();
    const capturedSlotMap = new Map();
    const fragment = renderer.renderDocumentToFragment(scopedDocument, targetDocument, {
      capture: {
        nodeMap: capturedNodeMap,
        componentMap: capturedComponentMap,
        slotMap: capturedSlotMap,
      },
    });

    const children =
      fragment && fragment.childNodes && typeof fragment.childNodes.length === "number"
        ? fragment.childNodes
        : [];
    let replacement = null;
    for (let i = 0; i < children.length; i += 1) {
      if (children[i] && children[i].nodeType === 1) {
        replacement = children[i];
        break;
      }
    }
    if (!replacement) {
      return false;
    }

    const parentNode = scopeElement.parentNode;
    if (!parentNode || typeof parentNode.replaceChild !== "function") {
      return false;
    }
    logRuntimeEvent("qhtml render replace scoped element", {
      host: describeElementForLog(binding.host),
      replaced: describeElementForLog(scopeElement),
      replacement: describeElementForLog(replacement),
    });
    terminateWasmRuntimesInNode(scopeElement);
    withDomMutationSyncSuppressed(binding, function replaceScopedElement() {
      parentNode.replaceChild(replacement, scopeElement);

      mergeCapturedMappingsIntoBinding(binding, {
        nodeMap: capturedNodeMap,
        componentMap: capturedComponentMap,
        slotMap: capturedSlotMap,
      });

      hydrateRegisteredComponentHostsInNode(replacement, targetDocument);
      attachDomQDomAccessors(binding);
      restoreDomPropertyState(binding, restorableState, replacement);
    });
    attachDomControlSync(binding);
    attachDomMutationSync(binding);
    attachScriptRules(binding);
    scheduleTemplatePersistence(binding);
    return true;
  }

  function renderBinding(binding, options) {
    if (!binding || !binding.qdom) {
      return;
    }
    const opts = options || {};
    const restorableState = captureDomPropertyState(binding, binding.host);
    binding.rendering = true;
    if (opts.skipBindingEvaluation !== true) {
      evaluateAllNodeBindings(binding, {
        forceAll: opts.forceBindingEvaluation === true,
        patchDom: false,
      });
      evaluateAllNodeQColors(binding);
    }
    registerDefinitionsFromDocument(binding.rawQdom || binding.qdom);
    binding.nodeMap = new WeakMap();
    binding.componentMap = new WeakMap();
    binding.slotMap = new WeakMap();
    binding.componentHostBySourceNode = new WeakMap();
    binding.domByQdomNode = new WeakMap();
    logRuntimeEvent("qhtml render replace host tree", {
      host: describeElementForLog(binding.host),
    });
    try {
      terminateWasmRuntimesInNode(binding.host);
      withDomMutationSyncSuppressed(binding, function renderHostTree() {
        renderer.renderIntoElement(binding.qdom, binding.host, binding.doc, {
          capture: {
            nodeMap: binding.nodeMap,
            componentMap: binding.componentMap,
            slotMap: binding.slotMap,
          },
        });
        hydrateRegisteredComponentHostsInNode(binding.doc, binding.doc);
        attachDomQDomAccessors(binding);
        restoreDomPropertyState(binding, restorableState, binding.host);
      });
      // Run a post-render binding pass with live DOM mapping so bindings that depend
      // on runtime component context (for example this.component.<prop>) apply to
      // the final rendered elements on the first render, not only after update().
      withDomMutationSyncSuppressed(binding, function patchBindingsPostRender() {
        evaluateAllNodeBindings(binding, {
          forceAll: true,
          patchDom: true,
        });
      });
      attachDomControlSync(binding);
      attachDomMutationSync(binding);
      runHostLifecycleHooks(binding);
      attachScriptRules(binding);
      scheduleTemplatePersistence(binding);
    } finally {
      binding.rendering = false;
    }
  }

  function attachDomQDomAccessors(binding) {
    if (!binding || !binding.host) {
      return;
    }

    const host = binding.host;
    const slotHandleByContainer = new WeakMap();
    const slotContainerByHandle = new WeakMap();
    const childrenAccessorCache = new WeakMap();

    function readNodeChildrenList(targetNode) {
      if (!targetNode || typeof targetNode !== "object") {
        return [];
      }
      const kind = String(targetNode.kind || "").trim().toLowerCase();
      if (kind === "document") {
        if (!Array.isArray(targetNode.nodes)) {
          targetNode.nodes = [];
        }
        return targetNode.nodes;
      }
      if (kind === "component") {
        if (!Array.isArray(targetNode.templateNodes)) {
          targetNode.templateNodes = [];
        }
        return targetNode.templateNodes;
      }
      if (!Array.isArray(targetNode.children)) {
        targetNode.children = [];
      }
      return targetNode.children;
    }

    function createTransientDocumentFromNodes(inputNodes, includeDefinitions) {
      const temporary = core.createDocument({ source: "" });
      const nodes = Array.isArray(inputNodes) ? inputNodes : [];
      if (includeDefinitions) {
        const root = sourceNodeOf(binding.rawQdom || binding.qdom);
        const rootNodes = root && Array.isArray(root.nodes) ? root.nodes : [];
        for (let i = 0; i < rootNodes.length; i += 1) {
          const candidate = rootNodes[i];
          if (!candidate || typeof candidate !== "object") {
            continue;
          }
          if (String(candidate.kind || "").trim().toLowerCase() === "component") {
            temporary.nodes.push(candidate);
          }
        }
      }
      for (let i = 0; i < nodes.length; i += 1) {
        temporary.nodes.push(sourceNodeOf(nodes[i]) || nodes[i]);
      }
      return temporary;
    }

    function fragmentToHtmlString(fragment, targetDocument) {
      const doc = targetDocument || binding.doc || global.document;
      if (!doc || !fragment || typeof doc.createElement !== "function") {
        return "";
      }
      const container = doc.createElement("div");
      container.appendChild(fragment);
      return typeof container.innerHTML === "string" ? container.innerHTML : "";
    }

    function createQDomNodeList(inputNodes) {
      const list = Array.isArray(inputNodes) ? inputNodes : [];
      const qdomNodeList = {
        at: function at(index) {
          const idx = Number(index);
          if (!Number.isFinite(idx) || idx < 0 || idx >= list.length) {
            return null;
          }
          return installQDomFactories(list[idx]);
        },
        toArray: function toArray() {
          return list.map(function mapNode(item) {
            return installQDomFactories(item);
          });
        },
        forEach: function forEach(callback, thisArg) {
          if (typeof callback !== "function") {
            return;
          }
          for (let i = 0; i < list.length; i += 1) {
            callback.call(thisArg, installQDomFactories(list[i]), i, qdomNodeList);
          }
        },
        map: function map(callback, thisArg) {
          if (typeof callback !== "function") {
            return [];
          }
          const out = [];
          for (let i = 0; i < list.length; i += 1) {
            out.push(callback.call(thisArg, installQDomFactories(list[i]), i, qdomNodeList));
          }
          return out;
        },
        qhtml: function qhtml(options) {
          const docNode = createTransientDocumentFromNodes(list, false);
          const opts = options && typeof options === "object" ? Object.assign({}, options) : {};
          if (!Object.prototype.hasOwnProperty.call(opts, "preserveOriginal")) {
            opts.preserveOriginal = false;
          }
          return parser.qdomToQHtml(docNode, opts);
        },
        htmldom: function htmldom(targetDocument) {
          const docNode = createTransientDocumentFromNodes(list, true);
          return renderer.renderDocumentToFragment(docNode, targetDocument || binding.doc || global.document);
        },
        html: function html(targetDocument) {
          const fragment = qdomNodeList.htmldom(targetDocument);
          return fragmentToHtmlString(fragment, targetDocument);
        },
        find: function find(callback, thisArg) {
          if (typeof callback !== "function") {
            return null;
          }
          for (let i = 0; i < list.length; i += 1) {
            const value = installQDomFactories(list[i]);
            if (callback.call(thisArg, value, i, qdomNodeList)) {
              return value;
            }
          }
          return null;
        },
        filter: function filter(callback, thisArg) {
          if (typeof callback !== "function") {
            return [];
          }
          const out = [];
          for (let i = 0; i < list.length; i += 1) {
            const value = installQDomFactories(list[i]);
            if (callback.call(thisArg, value, i, qdomNodeList)) {
              out.push(value);
            }
          }
          return out;
        },
      };

      Object.defineProperty(qdomNodeList, "length", {
        configurable: true,
        enumerable: true,
        get: function getLength() {
          return list.length;
        },
      });

      if (typeof Symbol === "function" && Symbol.iterator) {
        Object.defineProperty(qdomNodeList, Symbol.iterator, {
          configurable: true,
          enumerable: false,
          writable: false,
          value: function iterator() {
            let index = 0;
            return {
              next: function next() {
                if (index >= list.length) {
                  return { done: true, value: undefined };
                }
                const value = installQDomFactories(list[index]);
                index += 1;
                return { done: false, value: value };
              },
            };
          },
        });
      }

      return new Proxy(qdomNodeList, {
        get: function getQDomNodeList(target, prop, receiver) {
          if (typeof prop === "string" && /^[0-9]+$/.test(prop)) {
            const idx = Number(prop);
            if (!Number.isFinite(idx) || idx < 0 || idx >= list.length) {
              return undefined;
            }
            return installQDomFactories(list[idx]);
          }
          if (prop === "__qhtmlSourceArray") {
            return list;
          }
          if (prop === "push" || prop === "unshift") {
            return function pushOrUnshift() {
              const args = Array.prototype.slice.call(arguments).map(unwrapQDomInput);
              return list[prop].apply(list, args);
            };
          }
          if (prop === "splice") {
            return function splice(start, deleteCount) {
              const args = Array.prototype.slice.call(arguments);
              const head = args.slice(0, 2);
              const tail = args.slice(2).map(unwrapQDomInput);
              const removed = list.splice.apply(list, head.concat(tail));
              return removed.map(function mapRemoved(item) {
                return installQDomFactories(item);
              });
            };
          }
          if (prop === "pop" || prop === "shift") {
            return function popOrShift() {
              return installQDomFactories(list[prop]());
            };
          }
          if (prop === "at") {
            return target.at;
          }
          const value = Reflect.get(target, prop, receiver);
          if (typeof value !== "undefined") {
            return value;
          }
          const listValue = list[prop];
          if (typeof listValue === "function") {
            return function delegatedListMethod() {
              return listValue.apply(list, arguments);
            };
          }
          return listValue;
        },
        set: function setQDomNodeList(_, prop, value) {
          if (typeof prop === "string" && /^[0-9]+$/.test(prop)) {
            list[Number(prop)] = unwrapQDomInput(value);
            return true;
          }
          if (prop === "length") {
            list.length = Math.max(0, Number(value) || 0);
            return true;
          }
          return Reflect.set(list, prop, unwrapQDomInput(value));
        },
      });
    }

    function unwrapQDomInput(value) {
      if (value && typeof value === "object") {
        return sourceNodeOf(value) || value;
      }
      return value;
    }

    function shouldExposeAsQDomNodeList(prop, value) {
      if (!Array.isArray(value)) {
        return false;
      }
      const propName = String(prop == null ? "" : prop);
      if (
        propName === "nodes" ||
        propName === "templateNodes" ||
        propName === "children" ||
        propName === "slots" ||
        propName === "__qhtmlSlotNodes" ||
        propName === "__qhtmlRenderTree"
      ) {
        return true;
      }
      for (let i = 0; i < value.length; i += 1) {
        const item = value[i];
        if (
          item &&
          typeof item === "object" &&
          (isQDomTypedNode(item) ||
            Object.prototype.hasOwnProperty.call(item, "__qhtmlFactoriesInstalled") ||
            (item.__qhtmlSourceNode && typeof item.__qhtmlSourceNode === "object"))
        ) {
          return true;
        }
      }
      return false;
    }

    function createChildrenAccessor(targetNode) {
      const sourceTarget = sourceNodeOf(targetNode) || targetNode;
      if (!sourceTarget || typeof sourceTarget !== "object") {
        return function emptyChildrenAccessor() {
          return createQDomNodeList([]);
        };
      }
      if (childrenAccessorCache.has(sourceTarget)) {
        return childrenAccessorCache.get(sourceTarget);
      }

      const accessor = function childrenAccessor() {
        return createQDomNodeList(readNodeChildrenList(sourceTarget));
      };
      const proxy = new Proxy(accessor, {
        apply: function applyChildrenAccessor() {
          return createQDomNodeList(readNodeChildrenList(sourceTarget));
        },
        get: function getChildrenAccessor(_, prop) {
          const list = readNodeChildrenList(sourceTarget);
          if (prop === "length") {
            return list.length;
          }
          if (prop === "qhtml") {
            return function qhtml() {
              return createQDomNodeList(list).qhtml.apply(null, arguments);
            };
          }
          if (prop === "htmldom") {
            return function htmldom() {
              return createQDomNodeList(list).htmldom.apply(null, arguments);
            };
          }
          if (prop === "html") {
            return function html() {
              return createQDomNodeList(list).html.apply(null, arguments);
            };
          }
          if (prop === "toArray") {
            return function toArray() {
              return createQDomNodeList(list).toArray();
            };
          }
          if (typeof prop === "string" && /^[0-9]+$/.test(prop)) {
            return installQDomFactories(list[Number(prop)]);
          }
          if (typeof Symbol === "function" && prop === Symbol.iterator) {
            return function iterator() {
              return createQDomNodeList(list)[Symbol.iterator]();
            };
          }
          if (typeof prop === "string" && (prop === "push" || prop === "unshift")) {
            return function pushOrUnshift() {
              const args = Array.prototype.slice.call(arguments).map(unwrapQDomInput);
              return list[prop].apply(list, args);
            };
          }
          if (prop === "splice") {
            return function splice(start, deleteCount) {
              const args = Array.prototype.slice.call(arguments);
              const head = args.slice(0, 2);
              const tail = args.slice(2).map(unwrapQDomInput);
              const removed = list.splice.apply(list, head.concat(tail));
              return removed.map(function mapRemoved(item) {
                return installQDomFactories(item);
              });
            };
          }
          const value = list[prop];
          if (typeof value === "function") {
            return function delegatedArrayMethod() {
              return value.apply(list, arguments);
            };
          }
          return value;
        },
        set: function setChildrenAccessor(_, prop, value) {
          const list = readNodeChildrenList(sourceTarget);
          if (typeof prop === "string" && /^[0-9]+$/.test(prop)) {
            list[Number(prop)] = unwrapQDomInput(value);
            return true;
          }
          if (prop === "length") {
            list.length = Math.max(0, Number(value) || 0);
            return true;
          }
          list[prop] = value;
          return true;
        },
      });
      childrenAccessorCache.set(sourceTarget, proxy);
      return proxy;
    }

      function isQDomTypedNode(value) {
        return !!(value && typeof value === "object" && typeof value.kind === "string");
      }

      function projectedTagNameForNode(node) {
        if (!node || typeof node !== "object") {
          return "";
        }
        if (typeof node.tagName === "string" && node.tagName.trim()) {
          return node.tagName.trim();
        }
        const kind = String(node.kind || "").trim().toLowerCase();
        if (!kind) {
          return "";
        }
        if (kind === "document") {
          return "document";
        }
        if (kind === "component") {
          return String(node.componentId || "component").trim() || "component";
        }
        if (kind === "component-instance" || kind === "template-instance") {
          return String(node.componentId || node.tagName || kind).trim() || kind;
        }
        if (kind === "slot") {
          return "slot";
        }
        return kind;
      }

      function cloneForOutput(value, options, visited, depth) {
        const level = Number.isFinite(depth) ? depth : 0;
        if (value == null) {
          return value;
        }
        if (typeof value === "function") {
          return undefined;
        }
        if (typeof value !== "object") {
          return value;
        }
        if (visited.has(value)) {
          return "[Circular]";
        }

        if (Array.isArray(value)) {
          visited.add(value);
          const out = [];
          for (let i = 0; i < value.length; i += 1) {
            const next = cloneForOutput(value[i], options, visited, level + 1);
            if (typeof next !== "undefined") {
              out.push(next);
            }
          }
          visited.delete(value);
          return out;
        }

        const opts = options && typeof options === "object" ? options : {};
        const mapSpec =
          opts.mapSpec && typeof opts.mapSpec === "object" && !Array.isArray(opts.mapSpec)
            ? opts.mapSpec
            : null;
        const shallow = opts.shallow === true;
        const whitelist =
          opts.whitelist instanceof Set ? opts.whitelist : null;
        const shouldFilterNodeKeys = !!(whitelist && isQDomTypedNode(value));
        const keys = shouldFilterNodeKeys ? Array.from(whitelist) : Object.keys(value);
        const wantsTagNameAlias =
          isQDomTypedNode(value) &&
          ((!Object.prototype.hasOwnProperty.call(value, "tagName") &&
            shouldFilterNodeKeys &&
            whitelist &&
            whitelist.has("tagName")) ||
            (!Object.prototype.hasOwnProperty.call(value, "tagName") &&
              !shouldFilterNodeKeys &&
              mapSpec &&
              Object.prototype.hasOwnProperty.call(mapSpec, "tagName")));

        visited.add(value);
        const out = {};
        for (let i = 0; i < keys.length; i += 1) {
          const key = String(keys[i] || "");
          if (!key || !Object.prototype.hasOwnProperty.call(value, key)) {
            continue;
          }
          if (shallow && QDOM_CHILD_COLLECTION_KEYS.has(key)) {
            if (level >= 1) {
              continue;
            }
            if (!whitelist || !whitelist.has(key)) {
              continue;
            }
          }
          const mappedKey =
            mapSpec && Object.prototype.hasOwnProperty.call(mapSpec, key)
              ? String(mapSpec[key] || "").trim() || key
              : key;
          const next = cloneForOutput(value[key], opts, visited, level + 1);
          if (typeof next !== "undefined") {
            out[mappedKey] = next;
          }
        }
        if (wantsTagNameAlias) {
          const mappedKey =
            mapSpec && Object.prototype.hasOwnProperty.call(mapSpec, "tagName")
              ? String(mapSpec.tagName || "").trim() || "tagName"
              : "tagName";
          out[mappedKey] = projectedTagNameForNode(value);
        }
        visited.delete(value);
        return out;
      }

      function normalizeShowKeys(args) {
        const keys = [];
        const seen = new Set();
        const input = Array.isArray(args) ? args : [];
        for (let i = 0; i < input.length; i += 1) {
          const key = String(input[i] == null ? "" : input[i]).trim();
          if (!key || seen.has(key)) {
            continue;
          }
          seen.add(key);
          keys.push(key);
        }
        return keys;
      }

      function remapShowKeysToSource(keys, mapSpec) {
        const out = Array.isArray(keys) ? keys.slice() : [];
        if (!mapSpec || typeof mapSpec !== "object" || Array.isArray(mapSpec)) {
          return out;
        }
        const byMappedName = {};
        const sourceKeys = Object.keys(mapSpec);
        for (let i = 0; i < sourceKeys.length; i += 1) {
          const sourceKey = String(sourceKeys[i] || "").trim();
          if (!sourceKey) {
            continue;
          }
          const mappedKey = String(mapSpec[sourceKey] == null ? "" : mapSpec[sourceKey]).trim();
          if (!mappedKey || Object.prototype.hasOwnProperty.call(byMappedName, mappedKey)) {
            continue;
          }
          byMappedName[mappedKey] = sourceKey;
        }
        for (let i = 0; i < out.length; i += 1) {
          const key = String(out[i] == null ? "" : out[i]).trim();
          if (!key) {
            continue;
          }
          if (Object.prototype.hasOwnProperty.call(byMappedName, key)) {
            out[i] = byMappedName[key];
          }
        }
        return out;
      }

      function createProjectedView(sourceTarget, mapSpec, whitelist) {
        const options = {};
        if (mapSpec && typeof mapSpec === "object" && !Array.isArray(mapSpec)) {
          options.mapSpec = mapSpec;
        }
        options.shallow = true;
        if (whitelist instanceof Set && whitelist.size > 0) {
          options.whitelist = whitelist;
        }
        const out = [cloneForOutput(sourceTarget, options, new Set(), 0)];
        Object.defineProperty(out, "show", {
          configurable: true,
          enumerable: false,
          writable: false,
          value: function showProjected() {
            const keys = remapShowKeysToSource(
              normalizeShowKeys(Array.prototype.slice.call(arguments)),
              mapSpec
            );
            return createProjectedView(
              sourceTarget,
              mapSpec,
              keys.length > 0 ? new Set(keys) : null
            );
          },
        });
        Object.defineProperty(out, "map", {
          configurable: true,
          enumerable: false,
          writable: false,
          value: function mapProjected(nextMappingSpec) {
            const nextMapping =
              nextMappingSpec && typeof nextMappingSpec === "object" && !Array.isArray(nextMappingSpec)
                ? nextMappingSpec
                : {};
            const merged = Object.assign({}, mapSpec || {}, nextMapping);
            return createProjectedView(sourceTarget, merged, whitelist);
          },
        });
        return out;
      }

      function createNodeFacade(targetNode) {
        const sourceTarget = sourceNodeOf(targetNode) || targetNode;
        if (!sourceTarget || typeof sourceTarget !== "object") {
          return sourceTarget;
        }
        return sourceTarget;
      }

    function installQDomFactories(node) {
      if (!node || typeof node !== "object") {
        return node;
      }
      if (Object.prototype.hasOwnProperty.call(node, "__qhtmlFactoriesInstalled")) {
        return node;
      }

      // Preserve parsed instance slot arrays before installing facade methods
      // that occupy the same public property names (e.g. slots()).
      if (Array.isArray(node.slots) && !Array.isArray(node.__qhtmlSlotNodes)) {
        try {
          Object.defineProperty(node, "__qhtmlSlotNodes", {
            value: node.slots,
            configurable: true,
            writable: true,
            enumerable: false,
          });
        } catch (error) {
          node.__qhtmlSlotNodes = node.slots;
        }
      }

      function buildElementFallback(options) {
        const opts = options && typeof options === "object" ? options : {};
        const tag = String(opts.tagName || "div").trim().toLowerCase() || "div";
        return {
          kind: "element",
          tagName: tag,
          attributes: opts.attributes && typeof opts.attributes === "object" ? Object.assign({}, opts.attributes) : {},
          children: Array.isArray(opts.children) ? opts.children : [],
          textContent: typeof opts.textContent === "string" ? opts.textContent : null,
          selectorMode: "single",
          selectorChain: [tag],
          meta: { dirty: false, originalSource: null, sourceRange: null },
        };
      }

      function buildTextFallback(options) {
        const opts = options && typeof options === "object" ? options : {};
        return {
          kind: "text",
          value: typeof opts.value === "string" ? opts.value : "",
          meta: { dirty: false, originalSource: null, sourceRange: null },
        };
      }

      function buildSlotFallback(options) {
        const opts = options && typeof options === "object" ? options : {};
        return {
          kind: "slot",
          name: String(opts.name || "default").trim() || "default",
          children: Array.isArray(opts.children) ? opts.children : [],
          meta: { dirty: false, originalSource: null, sourceRange: null },
        };
      }

      function buildComponentInstanceFallback(options) {
        const opts = options && typeof options === "object" ? options : {};
        const tag = String(opts.tagName || opts.componentId || "div").trim().toLowerCase() || "div";
        return {
          kind: String(opts.kind || "component-instance").trim().toLowerCase() === "template-instance" ? "template-instance" : "component-instance",
          componentId: String(opts.componentId || tag).trim().toLowerCase(),
          tagName: tag,
          attributes: opts.attributes && typeof opts.attributes === "object" ? Object.assign({}, opts.attributes) : {},
          slots: Array.isArray(opts.slots) ? opts.slots : [],
          children: Array.isArray(opts.children) ? opts.children : [],
          textContent: typeof opts.textContent === "string" ? opts.textContent : null,
          selectorMode: "single",
          selectorChain: [tag],
          meta: { dirty: false, originalSource: null, sourceRange: null },
        };
      }

      const createElementFactory =
        core && typeof core.createElementNode === "function"
          ? core.createElementNode
          : buildElementFallback;
      const createTextFactory =
        core && typeof core.createTextNode === "function"
          ? core.createTextNode
          : buildTextFallback;
      const createRawHtmlFactory =
        core && typeof core.createRawHtmlNode === "function"
          ? core.createRawHtmlNode
          : function rawHtmlFallback(options) {
              const opts = options && typeof options === "object" ? options : {};
              return {
                kind: "raw-html",
                html: typeof opts.html === "string" ? opts.html : "",
                meta: { dirty: false, originalSource: null, sourceRange: null },
              };
            };
      const createSlotFactory =
        core && typeof core.createSlotNode === "function"
          ? core.createSlotNode
          : buildSlotFallback;
      const createComponentInstanceFactory =
        core && typeof core.createComponentInstanceNode === "function"
          ? core.createComponentInstanceNode
          : buildComponentInstanceFallback;

      function asArray(value) {
        return Array.isArray(value) ? value : [];
      }

      function normalizedKind(targetNode) {
        return String(targetNode && targetNode.kind ? targetNode.kind : "").trim().toLowerCase();
      }

      function isInstanceKind(kind) {
        return kind === "component-instance" || kind === "template-instance";
      }

      function ensureChildrenList(targetNode) {
        if (!targetNode || typeof targetNode !== "object") {
          return [];
        }
        if (!Array.isArray(targetNode.children)) {
          targetNode.children = [];
        }
        return targetNode.children;
      }

      function findSlotWrapperChild(targetNode, slotName) {
        const wanted = String(slotName || "default").trim().toLowerCase();
        if (!wanted || wanted === "default") {
          return null;
        }
        const children = ensureChildrenList(targetNode);
        for (let i = 0; i < children.length; i += 1) {
          const child = children[i];
          if (!child || normalizedKind(child) !== "element") {
            continue;
          }
          if (String(child.tagName || "").trim().toLowerCase() === wanted) {
            return child;
          }
        }
        return null;
      }

      function createSlotWrapperChild(targetNode, slotName) {
        const tagName = String(slotName || "default").trim().toLowerCase() || "default";
        const wrapper = createElementFactory({
          tagName: tagName,
          attributes: {},
          children: [],
          meta: { generated: true },
        });
        ensureChildrenList(targetNode).push(wrapper);
        return wrapper;
      }

      function normalizeLegacySlotArrays(targetNode) {
        return;
      }

      function slotHandleForContainer(targetNode, slotName, containerNode) {
        const normalizedName = String(slotName || "default").trim() || "default";
        const container = containerNode && typeof containerNode === "object" ? containerNode : targetNode;
        if (!container || typeof container !== "object") {
          return null;
        }
        if (!Array.isArray(container.children)) {
          container.children = [];
        }
        const existing = slotHandleByContainer.get(container);
        if (existing && typeof existing === "object" && String(existing.name || "default") === normalizedName) {
          existing.children = container.children;
          return existing;
        }
        const slotNode = createSlotFactory({
          name: normalizedName,
          children: container.children,
          meta: { generated: true, virtual: true },
        });
        try {
          Object.defineProperty(slotNode, "__qhtmlVirtualSlot", {
            value: true,
            configurable: true,
            writable: true,
            enumerable: false,
          });
        } catch (error) {
          slotNode.__qhtmlVirtualSlot = true;
        }
        slotHandleByContainer.set(container, slotNode);
        slotContainerByHandle.set(slotNode, container);
        const ownerId = ensureInstanceId(targetNode);
        if (ownerId) {
          qdomSlotOwnerIds.set(slotNode, ownerId);
        }
        return slotNode;
      }

      function nodeAttributes(targetNode) {
        return targetNode && targetNode.attributes && typeof targetNode.attributes === "object" ? targetNode.attributes : {};
      }

      function splitClasses(value) {
        return String(value || "")
          .split(/\s+/)
          .map(function trimClassName(name) {
            return name.trim();
          })
          .filter(Boolean);
      }

      function selectNodeName(targetNode) {
        const kind = normalizedKind(targetNode);
        if (kind === "component" || kind === "component-instance" || kind === "template-instance") {
          return String(targetNode.componentId || targetNode.tagName || "").trim().toLowerCase();
        }
        return String(targetNode && targetNode.tagName ? targetNode.tagName : "").trim().toLowerCase();
      }

      function matchesAttributeSelector(targetNode, selectorText) {
        const match = String(selectorText || "")
          .trim()
          .match(/^\[\s*([A-Za-z0-9_.:-]+)\s*(?:=\s*(?:\"([^\"]*)\"|'([^']*)'|([^\]\s]+)))?\s*\]$/);
        if (!match) {
          return false;
        }
        const attrs = nodeAttributes(targetNode);
        const attrName = String(match[1] || "").trim();
        if (!attrName) {
          return false;
        }
        if (!Object.prototype.hasOwnProperty.call(attrs, attrName)) {
          return false;
        }
        const expected = typeof match[2] === "string" ? match[2] : typeof match[3] === "string" ? match[3] : typeof match[4] === "string" ? match[4] : null;
        if (expected === null) {
          return true;
        }
        return String(attrs[attrName]) === String(expected);
      }

      function matchesNodeSelector(targetNode, selectorText) {
        if (!targetNode || typeof targetNode !== "object") {
          return false;
        }
        const selector = String(selectorText || "").trim();
        if (!selector) {
          return false;
        }

        if (selector.charAt(0) === "[") {
          return matchesAttributeSelector(targetNode, selector);
        }

        const attrs = nodeAttributes(targetNode);
        if (selector.charAt(0) === "#") {
          const expectedId = selector.slice(1);
          return String(attrs.id || "") === expectedId;
        }
        if (selector.charAt(0) === ".") {
          const requiredClass = selector.slice(1);
          if (!requiredClass) {
            return false;
          }
          return splitClasses(attrs.class).indexOf(requiredClass) !== -1;
        }

        let expectedTag = selector;
        let expectedId = "";
        const requiredClasses = [];
        const hashIndex = expectedTag.indexOf("#");
        if (hashIndex !== -1) {
          expectedId = expectedTag.slice(hashIndex + 1).split(".")[0];
          expectedTag = expectedTag.slice(0, hashIndex) + expectedTag.slice(hashIndex + 1 + expectedId.length);
        }
        const classSplit = expectedTag.split(".");
        expectedTag = String(classSplit.shift() || "").trim().toLowerCase();
        for (let i = 0; i < classSplit.length; i += 1) {
          const cls = String(classSplit[i] || "").trim();
          if (cls) {
            requiredClasses.push(cls);
          }
        }

        if (expectedTag) {
          const nodeName = selectNodeName(targetNode);
          if (nodeName !== expectedTag) {
            return false;
          }
        }
        if (expectedId && String(attrs.id || "") !== expectedId) {
          return false;
        }
        if (requiredClasses.length > 0) {
          const classes = splitClasses(attrs.class);
          for (let i = 0; i < requiredClasses.length; i += 1) {
            if (classes.indexOf(requiredClasses[i]) === -1) {
              return false;
            }
          }
        }
        return true;
      }

      function childCollections(targetNode) {
        if (!targetNode || typeof targetNode !== "object") {
          return [];
        }
        const out = [];
        const kind = normalizedKind(targetNode);
        if (isInstanceKind(kind)) {
          normalizeLegacySlotArrays(targetNode);
        }
        if (Array.isArray(targetNode.nodes)) {
          out.push(targetNode.nodes);
        }
        if (Array.isArray(targetNode.templateNodes)) {
          out.push(targetNode.templateNodes);
        }
        if (Array.isArray(targetNode.children)) {
          out.push(targetNode.children);
        }
        if (Array.isArray(targetNode.slots)) {
          out.push(targetNode.slots);
        }
        if (Array.isArray(targetNode.__qhtmlSlotNodes)) {
          out.push(targetNode.__qhtmlSlotNodes);
        }
        if (Array.isArray(targetNode.__qhtmlRenderTree)) {
          out.push(targetNode.__qhtmlRenderTree);
        }
        return out;
      }

      function walkTree(rootNode, visitor, visited) {
        if (!rootNode || typeof rootNode !== "object") {
          return;
        }
        const seen = visited || new Set();
        if (seen.has(rootNode)) {
          return;
        }
        seen.add(rootNode);

        const shouldStop = visitor(rootNode);
        if (shouldStop === true) {
          return;
        }

        const collections = childCollections(rootNode);
        for (let i = 0; i < collections.length; i += 1) {
          const list = collections[i];
          for (let j = 0; j < list.length; j += 1) {
            walkTree(list[j], visitor, seen);
          }
        }
      }

      function findMatches(rootNode, selectorText, allMatches) {
        const matches = [];
        walkTree(rootNode, function collect(nodeCandidate) {
          if (matchesNodeSelector(nodeCandidate, selectorText)) {
            matches.push(nodeCandidate);
            if (!allMatches) {
              return true;
            }
          }
          return false;
        });
        return matches;
      }

      function findParentNodeInTree(rootNode, targetNode) {
        const rootSource = sourceNodeOf(rootNode);
        const targetSource = sourceNodeOf(targetNode);
        if (!rootSource || !targetSource || rootSource === targetSource) {
          return null;
        }
        const seen = new Set([rootSource]);
        const stack = [rootSource];
        while (stack.length > 0) {
          const current = stack.pop();
          if (!current || typeof current !== "object") {
            continue;
          }
          const collections = childCollections(current);
          for (let i = 0; i < collections.length; i += 1) {
            const list = collections[i];
            for (let j = 0; j < list.length; j += 1) {
              const child = list[j];
              if (!child || typeof child !== "object") {
                continue;
              }
              const childSource = sourceNodeOf(child) || child;
              if (childSource === targetSource) {
                return current;
              }
              if (seen.has(childSource)) {
                continue;
              }
              seen.add(childSource);
              stack.push(childSource);
            }
          }
        }
        return null;
      }

      function sourceNodeOf(targetNode) {
        if (!targetNode || typeof targetNode !== "object") {
          return null;
        }
        if (targetNode.__qhtmlSourceNode && typeof targetNode.__qhtmlSourceNode === "object") {
          return targetNode.__qhtmlSourceNode;
        }
        return targetNode;
      }

      function resolveTargetNode(input) {
        if (!input || typeof input !== "object") {
          return null;
        }
        if (typeof input.qdom === "function" && typeof input.nodeType === "number") {
          try {
            return sourceNodeOf(input.qdom());
          } catch (error) {
            return null;
          }
        }
        return sourceNodeOf(input);
      }

      function readOwnerInstanceId(nodeCandidate) {
        if (!nodeCandidate || typeof nodeCandidate !== "object") {
          return "";
        }
        if (qdomSlotOwnerIds.has(nodeCandidate)) {
          const fromMap = qdomSlotOwnerIds.get(nodeCandidate);
          if (typeof fromMap === "string" && fromMap.trim()) {
            return fromMap.trim();
          }
        }
        if (qdomInstanceIds.has(nodeCandidate)) {
          const fromInstanceMap = qdomInstanceIds.get(nodeCandidate);
          if (typeof fromInstanceMap === "string" && fromInstanceMap.trim()) {
            return fromInstanceMap.trim();
          }
        }
        if (typeof nodeCandidate.ownerInstanceId === "string" && nodeCandidate.ownerInstanceId.trim()) {
          return nodeCandidate.ownerInstanceId.trim();
        }
        if (typeof nodeCandidate.instanceId === "string" && nodeCandidate.instanceId.trim()) {
          return nodeCandidate.instanceId.trim();
        }
        if (typeof nodeCandidate.__qhtmlInstanceId === "string" && nodeCandidate.__qhtmlInstanceId.trim()) {
          return nodeCandidate.__qhtmlInstanceId.trim();
        }
        if (nodeCandidate.meta && typeof nodeCandidate.meta === "object") {
          if (typeof nodeCandidate.meta.ownerInstanceId === "string" && nodeCandidate.meta.ownerInstanceId.trim()) {
            return nodeCandidate.meta.ownerInstanceId.trim();
          }
          if (typeof nodeCandidate.meta.instanceId === "string" && nodeCandidate.meta.instanceId.trim()) {
            return nodeCandidate.meta.instanceId.trim();
          }
        }
        return "";
      }

      function listSlots(rootNode, ownerInstanceId) {
        const expectedOwner = String(ownerInstanceId || "").trim();
        const matches = [];
        walkTree(rootNode, function collect(candidate) {
          if (!candidate || typeof candidate !== "object") {
            return false;
          }
          if (normalizedKind(candidate) !== "slot") {
            return false;
          }
          if (!expectedOwner || readOwnerInstanceId(candidate) === expectedOwner) {
            matches.push(candidate);
          }
          return false;
        });
        return matches;
      }

      function collectDeclaredSlotNamesFromTemplate(nodes, outSet) {
        const set = outSet || new Set();
        const list = Array.isArray(nodes) ? nodes : [];
        for (let i = 0; i < list.length; i += 1) {
          const candidate = list[i];
          if (!candidate || typeof candidate !== "object") {
            continue;
          }
          if (normalizedKind(candidate) === "element" && String(candidate.tagName || "").trim().toLowerCase() === "slot") {
            const attrs = candidate.attributes && typeof candidate.attributes === "object" ? candidate.attributes : {};
            const slotName = typeof attrs.name === "string" && attrs.name.trim() ? attrs.name.trim() : "default";
            set.add(slotName);
          }
          if (Array.isArray(candidate.children)) {
            collectDeclaredSlotNamesFromTemplate(candidate.children, set);
          }
          if (Array.isArray(candidate.templateNodes)) {
            collectDeclaredSlotNamesFromTemplate(candidate.templateNodes, set);
          }
        }
        return set;
      }

      function getDeclaredSlotNamesForInstance(instanceNode) {
        const key = String(instanceNode && (instanceNode.componentId || instanceNode.tagName) ? instanceNode.componentId || instanceNode.tagName : "")
          .trim()
          .toLowerCase();
        if (!key) {
          return new Set();
        }
        let found = null;
        walkTree(binding.qdom, function findDefinition(candidate) {
          if (!candidate || typeof candidate !== "object") {
            return false;
          }
          if (normalizedKind(candidate) !== "component") {
            return false;
          }
          const id = String(candidate.componentId || "").trim().toLowerCase();
          if (!id || id !== key) {
            return false;
          }
          found = collectDeclaredSlotNamesFromTemplate(candidate.templateNodes || [], new Set());
          return true;
        });
        return found || new Set();
      }

      function readInstanceSlotNodes(instanceNode) {
        if (!instanceNode || typeof instanceNode !== "object") {
          return [];
        }
        if (Array.isArray(instanceNode.slots)) {
          return instanceNode.slots;
        }
        if (Array.isArray(instanceNode.__qhtmlSlotNodes)) {
          return instanceNode.__qhtmlSlotNodes;
        }
        return [];
      }

      function findNearestSlotForTarget(rootNode, target) {
        const targetSource = resolveTargetNode(target);
        if (!targetSource) {
          return null;
        }

        const seen = new Set();
        let found = null;

        function walkWithSlot(nodeCandidate, activeSlot, activeOwnerInstanceId) {
          if (!nodeCandidate || typeof nodeCandidate !== "object") {
            return false;
          }
          if (seen.has(nodeCandidate)) {
            return false;
          }
          seen.add(nodeCandidate);

          const kind = normalizedKind(nodeCandidate);
          const candidateOwnerId =
            kind === "component-instance" || kind === "template-instance"
              ? readOwnerInstanceId(nodeCandidate)
              : "";
          const currentOwnerId = candidateOwnerId || activeOwnerInstanceId || "";
          let currentSlot = activeSlot;
          if (kind === "slot") {
            if (!readOwnerInstanceId(nodeCandidate) && currentOwnerId) {
              qdomSlotOwnerIds.set(nodeCandidate, currentOwnerId);
            }
            currentSlot = nodeCandidate;
          }
          if (sourceNodeOf(nodeCandidate) === targetSource) {
            found = currentSlot || null;
            return true;
          }

          const collections = childCollections(nodeCandidate);
          for (let i = 0; i < collections.length; i += 1) {
            const list = collections[i];
            for (let j = 0; j < list.length; j += 1) {
              if (walkWithSlot(list[j], currentSlot, currentOwnerId)) {
                return true;
              }
            }
          }
          return false;
        }

        walkWithSlot(rootNode, null, "");
        return found;
      }

      function normalizeNodesForAppend(input, selfNode) {
        let payload = input;
        if (typeof payload === "string" && typeof selfNode.createInstanceFromQHTML === "function") {
          payload = selfNode.createInstanceFromQHTML(payload);
        }
        if (Array.isArray(payload)) {
          return payload
            .map(function mapSource(item) {
              return sourceNodeOf(item) || item;
            })
            .filter(function keepObjects(item) {
              return !!item && typeof item === "object";
            });
        }
        if (payload && typeof payload === "object") {
          const sourcePayload = sourceNodeOf(payload) || payload;
          if (sourcePayload && typeof sourcePayload === "object") {
            return [sourcePayload];
          }
          return [];
        }
        return [];
      }

      function normalizeProjectedNodes(nodes) {
        const list = Array.isArray(nodes) ? nodes : [];
        const out = [];
        for (let i = 0; i < list.length; i += 1) {
          const normalized = sourceNodeOf(list[i]) || list[i];
          if (normalized && typeof normalized === "object") {
            out.push(normalized);
          }
        }
        return out;
      }

      function installFactoryResult(value) {
        if (Array.isArray(value)) {
          return value.map(function installEach(item) {
            return installQDomFactories(item);
          });
        }
        return installQDomFactories(value);
      }

      if (isInstanceKind(normalizedKind(node))) {
        normalizeLegacySlotArrays(node);
      }

      Object.defineProperty(node, "createQElement", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: function createQElement(options, attributes, children) {
          if (options && typeof options === "object" && !Array.isArray(options)) {
            return createElementFactory(options);
          }
          return createElementFactory({
            tagName: options,
            attributes: attributes,
            children: children,
          });
        },
      });
      Object.defineProperty(node, "createQText", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: function createQText(options) {
          if (options && typeof options === "object" && !Array.isArray(options)) {
            return createTextFactory(options);
          }
          return createTextFactory({ value: options });
        },
      });
      Object.defineProperty(node, "createQRawHtml", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: function createQRawHtml(options) {
          if (options && typeof options === "object" && !Array.isArray(options)) {
            return createRawHtmlFactory(options);
          }
          return createRawHtmlFactory({ html: options });
        },
      });
      Object.defineProperty(node, "createQSlot", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: function createQSlot(options, children) {
          if (options && typeof options === "object" && !Array.isArray(options)) {
            return createSlotFactory(options);
          }
          return createSlotFactory({ name: options, children: children });
        },
      });
      Object.defineProperty(node, "qcolor", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: function qcolor(name) {
          const key = String(name || "").trim();
          if (!key) {
            return null;
          }
          const context = readDocumentQColorContext(binding);
          const normalized = normalizeQColorKey(key);
          const schemaEntry = context.schemas.get(normalized);
          if (schemaEntry && typeof schemaEntry === "object") {
            return createQColorNodeFromEntry(schemaEntry.name || key, schemaEntry.property, context);
          }
          const schemaDefEntry = context.schemaDefs && context.schemaDefs instanceof Map
            ? context.schemaDefs.get(normalized)
            : null;
          if (schemaDefEntry && typeof schemaDefEntry === "object") {
            return createQColorNodeFromEntry(schemaDefEntry.name || key, schemaDefEntry.entries, context);
          }
          const themeEntry = context.themes.get(normalized);
          if (themeEntry && typeof themeEntry === "object") {
            return createQColorNodeFromEntry(themeEntry.name || key, themeEntry.assignments, context);
          }
          return null;
        },
      });
      Object.defineProperty(node, "qcolors", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: function qcolors() {
          const context = readDocumentQColorContext(binding);
          const out = [];
          context.schemas.forEach(function eachSchema(entry) {
            if (!entry || typeof entry !== "object") {
              return;
            }
            const nodeValue = createQColorNodeFromEntry(entry.name, entry.property, context);
            if (nodeValue) {
              out.push(nodeValue);
            }
          });
          if (context.schemaDefs && context.schemaDefs instanceof Map) {
            context.schemaDefs.forEach(function eachSchemaDef(entry) {
              if (!entry || typeof entry !== "object") {
                return;
              }
              const nodeValue = createQColorNodeFromEntry(entry.name, entry.entries, context);
              if (nodeValue) {
                out.push(nodeValue);
              }
            });
          }
          context.themes.forEach(function eachTheme(entry) {
            if (!entry || typeof entry !== "object") {
              return;
            }
            const nodeValue = createQColorNodeFromEntry(entry.name, entry.assignments, context);
            if (nodeValue) {
              out.push(nodeValue);
            }
          });
          return out;
        },
      });
      Object.defineProperty(node, "setQColorSchema", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: function setQColorSchema(name, value, options) {
          const key = String(name || "").trim();
          const colorValue = String(value == null ? "" : value).trim();
          if (!key || !colorValue) {
            return false;
          }
          const context = readDocumentQColorContext(binding);
          registerQColorSchema(context, key, colorValue);
          persistDocumentQColorContext(binding, context);
          const opts = options && typeof options === "object" ? options : {};
          if (opts.update === false) {
            evaluateAllNodeQColors(binding);
            return true;
          }
          return updateQHtmlElement(host, { forceBindings: true });
        },
      });
      Object.defineProperty(node, "setQColorTheme", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: function setQColorTheme(name, assignments, options) {
          const key = String(name || "").trim();
          if (!key || !assignments || typeof assignments !== "object" || Array.isArray(assignments)) {
            return false;
          }
          const context = readDocumentQColorContext(binding);
          const opts = options && typeof options === "object" ? options : {};
          registerQColorTheme(context, key, assignments, {
            setAsDefault: opts.makeDefault === true,
          });
          persistDocumentQColorContext(binding, context);
          if (opts.update === false) {
            evaluateAllNodeQColors(binding);
            return true;
          }
          return updateQHtmlElement(host, { forceBindings: true });
        },
      });
      Object.defineProperty(node, "setQColorDefaultTheme", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: function setQColorDefaultTheme(name, options) {
          const key = normalizeQColorKey(name);
          if (!key) {
            return false;
          }
          const context = readDocumentQColorContext(binding);
          if (!context.themes.has(key)) {
            return false;
          }
          context.defaultThemeName = key;
          persistDocumentQColorContext(binding, context);
          const opts = options && typeof options === "object" ? options : {};
          if (opts.update === false) {
            evaluateAllNodeQColors(binding);
            return true;
          }
          return updateQHtmlElement(host, { forceBindings: true });
        },
      });
      Object.defineProperty(node, "find", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: function find(selector) {
          const selectorText = String(selector || "").trim();
          if (!selectorText) {
            return null;
          }
          const matches = findMatches(node, selectorText, false);
          return matches.length > 0 ? installQDomFactories(matches[0]) : null;
        },
      });
      Object.defineProperty(node, "findAll", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: function findAll(selector) {
          const selectorText = String(selector || "").trim();
          if (!selectorText) {
            return [];
          }
          const matches = findMatches(node, selectorText, true);
          return matches.map(function mapMatch(found) {
            return installQDomFactories(found);
          });
        },
      });
      Object.defineProperty(node, "root", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: function root(options) {
          const documentRoot = sourceNodeOf(binding.rawQdom || binding.qdom);
          if (!documentRoot || typeof documentRoot !== "object") {
            return null;
          }
          let cursor = sourceNodeOf(node) || node;
          let depth = 0;
          while (cursor && cursor !== documentRoot && depth < 10000) {
            cursor = findParentNodeInTree(documentRoot, cursor);
            depth += 1;
          }
          if (cursor !== documentRoot) {
            return null;
          }

          const mode =
            typeof options === "string"
              ? options.trim().toLowerCase()
              : options && typeof options === "object" && typeof options.mode === "string"
                ? String(options.mode).trim().toLowerCase()
                : "";
          if (mode === "qdom" || options === true || (options && typeof options === "object" && options.qdom === true)) {
            return installQDomFactories(documentRoot);
          }
          return host;
        },
      });
      Object.defineProperty(node, "findSlotFor", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: function findSlotFor(target) {
          const slotNode = findNearestSlotForTarget(node, target);
          return slotNode ? installQDomFactories(slotNode) : null;
        },
      });
      function listSlotsByOwner(ownerInstanceId) {
        const kind = normalizedKind(node);
        if (kind === "slot") {
          return [installQDomFactories(node)];
        }
        if (isInstanceKind(kind)) {
          normalizeLegacySlotArrays(node);
          const result = [];
          const declaredSlotNames = getDeclaredSlotNamesForInstance(node);
          const children = ensureChildrenList(node);
          const expectedOwnerId =
            typeof ownerInstanceId === "string" && ownerInstanceId.trim()
              ? ownerInstanceId.trim()
              : readOwnerInstanceId(node);
          const effectiveOwnerId = expectedOwnerId || ensureInstanceId(node);

          // Prefer explicit parsed slot nodes first.
          const explicitSlots = readInstanceSlotNodes(node);
          for (let i = 0; i < explicitSlots.length; i += 1) {
            const slotNode = explicitSlots[i];
            if (!slotNode || normalizedKind(slotNode) !== "slot") {
              continue;
            }
            if (!readOwnerInstanceId(slotNode) && effectiveOwnerId) {
              qdomSlotOwnerIds.set(slotNode, effectiveOwnerId);
            }
            const slotName = String(slotNode.name || "default").trim() || "default";
            if (declaredSlotNames.size > 0 && !declaredSlotNames.has(slotName)) {
              continue;
            }
            if (!expectedOwnerId || readOwnerInstanceId(slotNode) === expectedOwnerId) {
              result.push(installQDomFactories(slotNode));
            }
          }
          if (result.length > 0) {
            return result;
          }

          // If nothing is declared and no explicit slots exist, keep legacy behavior.
          if (declaredSlotNames.size === 0) {
            return result;
          }

          declaredSlotNames.forEach(function eachDeclaredSlot(slotNameRaw) {
            const slotName = String(slotNameRaw || "default").trim() || "default";
            if (slotName === "default") {
              const handle = slotHandleForContainer(node, "default", node);
              if (handle && (!expectedOwnerId || readOwnerInstanceId(handle) === expectedOwnerId)) {
                result.push(installQDomFactories(handle));
              }
              return;
            }
            let wrapper = null;
            for (let i = 0; i < children.length; i += 1) {
              const child = children[i];
              if (!child || normalizedKind(child) !== "element") {
                continue;
              }
              if (String(child.tagName || "").trim().toLowerCase() === slotName.toLowerCase()) {
                wrapper = child;
                break;
              }
            }
            if (!wrapper) {
              return;
            }
            const handle = slotHandleForContainer(node, slotName, wrapper);
            if (handle && (!expectedOwnerId || readOwnerInstanceId(handle) === expectedOwnerId)) {
              result.push(installQDomFactories(handle));
            }
          });
          if (result.length > 0) {
            return result;
          }
          for (let i = 0; i < children.length; i += 1) {
            const child = children[i];
            if (!child || normalizedKind(child) !== "element") {
              continue;
            }
            const slotName = String(child.tagName || "").trim();
            if (!slotName) {
              continue;
            }
            const handle = slotHandleForContainer(node, slotName, child);
            if (!handle) {
              continue;
            }
            if (!expectedOwnerId || readOwnerInstanceId(handle) === expectedOwnerId) {
              result.push(installQDomFactories(handle));
            }
          }
          return result;
        }
        const effectiveOwnerId =
          typeof ownerInstanceId === "string" && ownerInstanceId.trim()
            ? ownerInstanceId.trim()
            : kind === "component-instance" || kind === "template-instance"
              ? readOwnerInstanceId(node)
              : "";
        return listSlots(node, effectiveOwnerId).map(function installEach(found) {
          return installQDomFactories(found);
        });
      }

      Object.defineProperty(node, "listSlots", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: listSlotsByOwner,
      });
      Object.defineProperty(node, "slots", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: listSlotsByOwner,
      });
      Object.defineProperty(node, "slot", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: function slot(name) {
          const slotName = String(name || "default").trim() || "default";
          const kind = normalizedKind(node);

          if (kind === "slot") {
            if (String(node.name || "default") === slotName) {
              return installQDomFactories(node);
            }
            return null;
          }

          if (kind === "component-instance" || kind === "template-instance") {
            normalizeLegacySlotArrays(node);
            const ownerInstanceId = ensureInstanceId(node);
            const explicitSlots = readInstanceSlotNodes(node);
            for (let i = 0; i < explicitSlots.length; i += 1) {
              const slotNode = explicitSlots[i];
              if (!slotNode || normalizedKind(slotNode) !== "slot") {
                continue;
              }
              if (String(slotNode.name || "default") !== slotName) {
                continue;
              }
              if (!readOwnerInstanceId(slotNode) && ownerInstanceId) {
                qdomSlotOwnerIds.set(slotNode, ownerInstanceId);
              }
              return installQDomFactories(slotNode);
            }

            if (explicitSlots.length > 0) {
              const createdSlot = createSlotFactory({
                name: slotName,
                children: [],
                meta: { generated: true },
              });
              if (!Array.isArray(node.slots)) {
                node.slots = [];
              }
              node.slots.push(createdSlot);
              if (ownerInstanceId) {
                qdomSlotOwnerIds.set(createdSlot, ownerInstanceId);
              }
              return installQDomFactories(createdSlot);
            }

            if (slotName === "default") {
              const defaultHandle = slotHandleForContainer(node, "default", node);
              if (defaultHandle && !readOwnerInstanceId(defaultHandle)) {
                qdomSlotOwnerIds.set(defaultHandle, ownerInstanceId);
              }
              return defaultHandle ? installQDomFactories(defaultHandle) : null;
            }
            const wrapper = findSlotWrapperChild(node, slotName) || createSlotWrapperChild(node, slotName);
            const handle = slotHandleForContainer(node, slotName, wrapper);
            if (handle && !readOwnerInstanceId(handle)) {
              qdomSlotOwnerIds.set(handle, ownerInstanceId);
            }
            return handle ? installQDomFactories(handle) : null;
          }

          const matches = [];
          walkTree(node, function collectSlots(candidate) {
            if (!candidate || typeof candidate !== "object") {
              return false;
            }
            if (normalizedKind(candidate) === "slot" && String(candidate.name || "default") === slotName) {
              matches.push(candidate);
              return true;
            }
            return false;
          });
          return matches.length > 0 ? installQDomFactories(matches[0]) : null;
        },
      });
      Object.defineProperty(node, "appendNode", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: function appendNode(input) {
          const nodesToAppend = normalizeNodesForAppend(input, node);
          if (nodesToAppend.length === 0) {
            return null;
          }

          const kind = normalizedKind(node);
          let targetList = null;
          if (kind === "document") {
            if (!Array.isArray(node.nodes)) {
              node.nodes = [];
            }
            targetList = node.nodes;
          } else if (kind === "component") {
            if (!Array.isArray(node.templateNodes)) {
              node.templateNodes = [];
            }
            targetList = node.templateNodes;
          } else if (kind === "slot" || kind === "element") {
            const slotContainer = kind === "slot" ? slotContainerByHandle.get(node) : null;
            if (slotContainer && typeof slotContainer === "object") {
              if (!Array.isArray(slotContainer.children)) {
                slotContainer.children = [];
              }
              node.children = slotContainer.children;
              targetList = slotContainer.children;
            } else {
              if (!Array.isArray(node.children)) {
                node.children = [];
              }
              targetList = node.children;
            }
          } else if (kind === "component-instance" || kind === "template-instance") {
            const appendAsSlot =
              nodesToAppend.length === 1 &&
              nodesToAppend[0] &&
              normalizedKind(nodesToAppend[0]) === "slot";
            if (appendAsSlot) {
              normalizeLegacySlotArrays(node);
              const slotNode = nodesToAppend[0];
              const slotName = String(slotNode && slotNode.name ? slotNode.name : "default").trim() || "default";
              if (slotName === "default") {
                targetList = ensureChildrenList(node);
              } else {
                const wrapper = findSlotWrapperChild(node, slotName) || createSlotWrapperChild(node, slotName);
                if (!Array.isArray(wrapper.children)) {
                  wrapper.children = [];
                }
                targetList = wrapper.children;
              }
              nodesToAppend.splice(0, nodesToAppend.length);
              const projectedChildren = normalizeProjectedNodes(slotNode && Array.isArray(slotNode.children) ? slotNode.children : []);
              for (let i = 0; i < projectedChildren.length; i += 1) {
                nodesToAppend.push(projectedChildren[i]);
              }
            } else {
              if (!Array.isArray(node.children)) {
                node.children = [];
              }
              targetList = node.children;
            }
          } else if (Array.isArray(node.children)) {
            targetList = node.children;
          } else {
            node.children = [];
            targetList = node.children;
          }

          for (let i = 0; i < nodesToAppend.length; i += 1) {
            targetList.push(nodesToAppend[i]);
          }
          return nodesToAppend.length === 1
            ? installQDomFactories(nodesToAppend[0])
            : nodesToAppend.map(function mapNode(appended) {
                return installQDomFactories(appended);
              });
        },
      });
      Object.defineProperty(node, "setAttribute", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: function setAttribute(name, value) {
          const key = String(name || "").trim();
          if (!key) {
            return installQDomFactories(node);
          }
          if (!node.attributes || typeof node.attributes !== "object") {
            node.attributes = {};
          }
          node.attributes[key] = String(value);
          return installQDomFactories(node);
        },
      });
      Object.defineProperty(node, "removeAttribute", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: function removeAttribute(name) {
          const key = String(name || "").trim();
          if (!key || !node.attributes || typeof node.attributes !== "object") {
            return installQDomFactories(node);
          }
          delete node.attributes[key];
          return installQDomFactories(node);
        },
      });
      Object.defineProperty(node, "setProperty", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: function setProperty(name, value) {
          const key = String(name || "").trim();
          if (!key) {
            return installQDomFactories(node);
          }
          if (!node.props || typeof node.props !== "object" || Array.isArray(node.props)) {
            node.props = {};
          }
          node.props[key] = value;
          if (!Array.isArray(node.properties)) {
            node.properties = [];
          }
          let matched = false;
          for (let i = 0; i < node.properties.length; i += 1) {
            const entry = node.properties[i];
            if (!entry || typeof entry !== "object") {
              continue;
            }
            if (String(entry.name || "").trim() !== key) {
              continue;
            }
            entry.value = value;
            matched = true;
            break;
          }
          if (!matched) {
            node.properties.push({
              kind: "property",
              name: key,
              value: value,
            });
          }
          return installQDomFactories(node);
        },
      });
      Object.defineProperty(node, "addProperty", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: function addProperty(name, value) {
          return node.setProperty(name, value);
        },
      });
      Object.defineProperty(node, "removeProperty", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: function removeProperty(name) {
          const key = String(name || "").trim();
          if (!key) {
            return installQDomFactories(node);
          }
          if (node.props && typeof node.props === "object" && !Array.isArray(node.props)) {
            delete node.props[key];
          }
          if (Array.isArray(node.properties)) {
            node.properties = node.properties.filter(function keepProperty(entry) {
              return String(entry && entry.name ? entry.name : "").trim() !== key;
            });
          }
          return installQDomFactories(node);
        },
      });
      Object.defineProperty(node, "addTheme", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: function addTheme(themeName) {
          const key = String(themeName || "").trim();
          if (!key) {
            return installQDomFactories(node);
          }
          if (!Array.isArray(node.themes)) {
            node.themes = [];
          }
          if (node.themes.indexOf(key) === -1) {
            node.themes.push(key);
          }
          return installQDomFactories(node);
        },
      });
      Object.defineProperty(node, "removeTheme", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: function removeTheme(themeName) {
          const key = String(themeName || "").trim();
          if (!key) {
            return installQDomFactories(node);
          }
          if (!Array.isArray(node.themes)) {
            node.themes = [];
            return installQDomFactories(node);
          }
          node.themes = node.themes.filter(function keepTheme(name) {
            return String(name || "").trim() !== key;
          });
          return installQDomFactories(node);
        },
      });
      Object.defineProperty(node, "createInstanceFromQHTML", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: function createInstanceFromQHTML(source, options) {
          const qhtmlSource = String(source || "").trim();
          if (!qhtmlSource) {
            return null;
          }
          if (!parser || typeof parser.parseQHtmlToQDom !== "function") {
            throw new Error("createInstanceFromQHTML requires parser.parseQHtmlToQDom");
          }
          const parsed = parser.parseQHtmlToQDom(qhtmlSource, Object.assign({ resolveImportsBeforeParse: false }, options || {}));
          const nodes = parsed && Array.isArray(parsed.nodes) ? parsed.nodes : [];
          if (nodes.length === 0) {
            return null;
          }
          if (nodes.length === 1) {
            return installQDomFactories(nodes[0]);
          }
          return installFactoryResult(nodes);
        },
      });
      Object.defineProperty(node, "replaceWithQHTML", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: function replaceWithQHTML(source, rootNode, options) {
          const qhtmlSource = String(source || "").trim();
          if (!qhtmlSource) {
            return null;
          }

          const rootCandidateFromArg =
            rootNode && typeof rootNode === "object"
              ? typeof rootNode.qdom === "function"
                ? rootNode.qdom()
                : rootNode
              : null;
          const rootCandidate =
            binding && binding.qdom && typeof binding.qdom === "object"
              ? binding.qdom
              : rootCandidateFromArg;
          if (!rootCandidate || typeof rootCandidate !== "object") {
            return null;
          }
          if (typeof rootCandidate.createInstanceFromQHTML !== "function") {
            return null;
          }

          const created = rootCandidate.createInstanceFromQHTML(qhtmlSource, options);
          const inserted = normalizeNodesForAppend(created, rootCandidate);
          if (inserted.length === 0) {
            return null;
          }

          const targetSource = sourceNodeOf(node);
          let replaced = false;

          const stack = [rootCandidate];
          while (stack.length > 0 && !replaced) {
            const current = stack.pop();
            if (!current || typeof current !== "object") {
              continue;
            }

            const lists = [current.nodes, current.templateNodes, current.children];
            for (let li = 0; li < lists.length && !replaced; li += 1) {
              const list = lists[li];
              if (!Array.isArray(list)) {
                continue;
              }
              for (let i = 0; i < list.length; i += 1) {
                const child = list[i];
                if (child && typeof child === "object") {
                  stack.push(child);
                }
                if (sourceNodeOf(child) !== targetSource) {
                  continue;
                }
                list.splice.apply(list, [i, 1].concat(inserted));
                replaced = true;
                break;
              }
            }
          }

          if (!replaced) {
            return null;
          }
          if (binding && !binding.rendering) {
            renderBinding(binding);
          }
          return inserted.length === 1
            ? installQDomFactories(inserted[0])
            : inserted.map(function mapInserted(item) {
                return installQDomFactories(item);
              });
        },
      });
      Object.defineProperty(node, "rewrite", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: function rewrite(parameterBindings, rewriteCallback) {
          let bindings = parameterBindings;
          let callback = rewriteCallback;
          if (typeof bindings === "function" && typeof callback === "undefined") {
            callback = bindings;
            bindings = null;
          }
          if (typeof callback !== "function") {
            throw new Error("rewrite requires a callback function.");
          }
          const facade = installQDomFactories(node);
          const effectiveBindings =
            bindings && typeof bindings === "object" && !Array.isArray(bindings)
              ? Object.assign({}, bindings)
              : {};
          if (!Object.prototype.hasOwnProperty.call(effectiveBindings, "this")) {
            effectiveBindings.this = facade;
          }
          const rewritten = callback.call(effectiveBindings.this, effectiveBindings, facade);
          if (rewritten == null) {
            return null;
          }
          return node.replaceWithQHTML(String(rewritten), null);
        },
      });
      Object.defineProperty(node, "serialize", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: function serialize() {
          return core.serializeQDomCompressed(node);
        },
      });
      Object.defineProperty(node, "show", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: function show() {
          const keys = normalizeShowKeys(Array.prototype.slice.call(arguments));
          const sourceTarget = sourceNodeOf(node) || node;
          return createProjectedView(sourceTarget, null, keys.length > 0 ? new Set(keys) : null);
        },
      });
      Object.defineProperty(node, "map", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: function map(mappingSpec) {
          const mapping =
            mappingSpec && typeof mappingSpec === "object" && !Array.isArray(mappingSpec)
              ? mappingSpec
              : {};
          const sourceTarget = sourceNodeOf(node) || node;
          return createProjectedView(sourceTarget, mapping, null);
        },
      });
      Object.defineProperty(node, "traverse", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: function traverse(visitor, thisArg) {
          if (typeof visitor !== "function") {
            return 0;
          }
          let visitedCount = 0;
          const sourceRoot = sourceNodeOf(node) || node;
          walkTree(sourceRoot, function walkTraverse(candidate) {
            visitedCount += 1;
            const res = visitor.call(
              typeof thisArg === "undefined" ? installQDomFactories(node) : thisArg,
              installQDomFactories(candidate),
              visitedCount - 1,
              installQDomFactories(sourceRoot)
            );
            return res === true;
          });
          return visitedCount;
        },
      });
      Object.defineProperty(node, "deserialize", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: function deserialize(serializedPayload, shouldReplaceQDom) {
          if (!core || typeof core.deserializeQDomCompressed !== "function") {
            throw new Error("deserialize requires qdomCore.deserializeQDomCompressed.");
          }
          const payload = String(serializedPayload || "");
          if (!payload.trim()) {
            return null;
          }
          const decoded = core.deserializeQDomCompressed(payload);
          const decodedSource = sourceNodeOf(decoded) || decoded;
          const decodedKind = normalizedKind(decodedSource);
          const incomingNodes = [];
          if (decodedKind === "document") {
            const decodedNodeList = Array.isArray(decodedSource && decodedSource.nodes) ? decodedSource.nodes : [];
            for (let i = 0; i < decodedNodeList.length; i += 1) {
              const candidate = sourceNodeOf(decodedNodeList[i]) || decodedNodeList[i];
              if (candidate && typeof candidate === "object") {
                incomingNodes.push(candidate);
              }
            }
          } else if (decodedSource && typeof decodedSource === "object") {
            incomingNodes.push(decodedSource);
          }

          const replace = shouldReplaceQDom === true;
          const targetKind = normalizedKind(node);
          if (replace) {
            if (targetKind === "document") {
              if (!Array.isArray(node.nodes)) {
                node.nodes = [];
              }
              node.nodes.splice(0, node.nodes.length);
              if (Array.isArray(decodedSource && decodedSource.scripts)) {
                node.scripts = decodedSource.scripts.slice();
              } else if (!Array.isArray(node.scripts)) {
                node.scripts = [];
              }
            } else if (targetKind === "component") {
              if (!Array.isArray(node.templateNodes)) {
                node.templateNodes = [];
              }
              node.templateNodes.splice(0, node.templateNodes.length);
            } else if (targetKind === "slot") {
              const slotContainer = slotContainerByHandle.get(node);
              if (slotContainer && typeof slotContainer === "object") {
                if (!Array.isArray(slotContainer.children)) {
                  slotContainer.children = [];
                }
                slotContainer.children.splice(0, slotContainer.children.length);
                node.children = slotContainer.children;
              } else {
                if (!Array.isArray(node.children)) {
                  node.children = [];
                }
                node.children.splice(0, node.children.length);
              }
            } else {
              if (!Array.isArray(node.children)) {
                node.children = [];
              }
              node.children.splice(0, node.children.length);
            }
          } else if (targetKind === "document" && decodedKind === "document" && Array.isArray(decodedSource && decodedSource.scripts)) {
            if (!Array.isArray(node.scripts)) {
              node.scripts = [];
            }
            for (let i = 0; i < decodedSource.scripts.length; i += 1) {
              node.scripts.push(decodedSource.scripts[i]);
            }
          }

          if (incomingNodes.length === 0) {
            return installQDomFactories(node);
          }

          const appended = node.appendNode(incomingNodes);
          return appended == null ? installQDomFactories(node) : appended;
        },
      });
      Object.defineProperty(node, "createQComponentInstance", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: function createQComponentInstance(options, attributes) {
          let created;
          if (options && typeof options === "object" && !Array.isArray(options)) {
            created = createComponentInstanceFactory(
              Object.assign({}, options, {
                kind: "component-instance",
              })
            );
          } else {
            created = createComponentInstanceFactory({
              kind: "component-instance",
              componentId: options,
              tagName: options,
              attributes: attributes,
            });
          }
          return installQDomFactories(created);
        },
      });
      Object.defineProperty(node, "createQTemplateInstance", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: function createQTemplateInstance(options, attributes) {
          let created;
          if (options && typeof options === "object" && !Array.isArray(options)) {
            created = createComponentInstanceFactory(
              Object.assign({}, options, {
                kind: "template-instance",
              })
            );
          } else {
            created = createComponentInstanceFactory({
              kind: "template-instance",
              componentId: options,
              tagName: options,
              attributes: attributes,
            });
          }
          return installQDomFactories(created);
        },
      });
      Object.defineProperty(node, "invalidate", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: function invalidate(options) {
          const opts = options && typeof options === "object" ? Object.assign({}, options) : {};
          if (!Object.prototype.hasOwnProperty.call(opts, "forceBindings")) {
            opts.forceBindings = true;
          }
          return updateQHtmlElement(host, opts);
        },
      });
      Object.defineProperty(node, "component", {
        configurable: true,
        enumerable: true,
        get: function getNodeComponentRef() {
          const sourceTarget = sourceNodeOf(node) || node;
          if (binding && binding.domByQdomNode && typeof binding.domByQdomNode.get === "function") {
            const mapped = binding.domByQdomNode.get(sourceTarget);
            if (mapped && mapped.nodeType === 1) {
              return mapped;
            }
          }
          return null;
        },
      });
      Object.defineProperty(node, "qhtml", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: function qhtml(options) {
          const docNode = createTransientDocumentFromNodes([node], true);
          const opts = options && typeof options === "object" ? Object.assign({}, options) : {};
          if (!Object.prototype.hasOwnProperty.call(opts, "preserveOriginal")) {
            opts.preserveOriginal = false;
          }
          return parser.qdomToQHtml(docNode, opts);
        },
      });
      Object.defineProperty(node, "htmldom", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: function htmldom(targetDocument) {
          const docNode = createTransientDocumentFromNodes([node], true);
          return renderer.renderDocumentToFragment(docNode, targetDocument || binding.doc || global.document);
        },
      });
      Object.defineProperty(node, "html", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: function html(targetDocument) {
          const fragment = node.htmldom(targetDocument);
          return fragmentToHtmlString(fragment, targetDocument);
        },
      });
      Object.defineProperty(node, "__qhtmlFactoriesInstalled", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: true,
      });

      return node;
    }

    host.qdom = function hostQdomAccessor() {
      flushPendingDomMutationSync(binding, {
        maxItems: DOM_MUTATION_SYNC_FLUSH_BATCH_SIZE,
        scheduleRemainder: true,
      });
      return installQDomFactories(binding.qdom);
    };
    host.update = function hostUpdateAccessor() {
      return updateQHtmlElement(host);
    };
    host.invalidate = function hostInvalidateAccessor(options) {
      const opts = options && typeof options === "object" ? Object.assign({}, options) : {};
      if (!Object.prototype.hasOwnProperty.call(opts, "forceBindings")) {
        opts.forceBindings = true;
      }
      return updateQHtmlElement(host, opts);
    };
    host.qhtmlRoot = function hostQhtmlRootAccessor() {
      return host;
    };
    host.root = function hostRootAccessor() {
      return host;
    };
    host.component = null;

    function setSlotContextAccessor(element, slotNode, dynamicResolver) {
      if (!element || element.nodeType !== 1) {
        return;
      }

      function createSlotContext(rawSlotNode) {
        if (!rawSlotNode || typeof rawSlotNode !== "object") {
          return null;
        }
        if (
          typeof rawSlotNode.qdom === "function" &&
          (typeof rawSlotNode.name === "string" || typeof rawSlotNode.name === "number") &&
          !Object.prototype.hasOwnProperty.call(rawSlotNode, "kind")
        ) {
          return rawSlotNode;
        }
        const slotName = String(rawSlotNode.name || "default");
        return {
          name: slotName,
          qdom: function slotQdomAccessor() {
            return installQDomFactories(rawSlotNode);
          },
        };
      }

      const slotContext = createSlotContext(slotNode);

      try {
        if (!Object.prototype.hasOwnProperty.call(element, "__qhtmlSlotAccessorInstalled")) {
          Object.defineProperty(element, "slot", {
            configurable: true,
            enumerable: false,
            get: function qhtmlSlotGetter() {
              if (this.__qhtmlSlotContext) {
                return this.__qhtmlSlotContext;
              }
              if (typeof this.__qhtmlResolveSlotContext === "function") {
                const resolvedSlot = this.__qhtmlResolveSlotContext(this);
                const resolvedContext = createSlotContext(resolvedSlot);
                if (resolvedContext) {
                  this.__qhtmlSlotContext = resolvedContext;
                  return resolvedContext;
                }
              }
              if (typeof this.getAttribute === "function") {
                const attr = this.getAttribute("slot");
                return attr == null ? "" : String(attr);
              }
              return "";
            },
            set: function qhtmlSlotSetter(value) {
              if (value && typeof value === "object" && typeof value.qdom === "function") {
                this.__qhtmlSlotContext = value;
                return;
              }
              this.__qhtmlSlotContext = null;
              if (!this || typeof this.setAttribute !== "function" || typeof this.removeAttribute !== "function") {
                return;
              }
              if (value === null || typeof value === "undefined" || value === "") {
                this.removeAttribute("slot");
                return;
              }
              this.setAttribute("slot", String(value));
            },
          });
          Object.defineProperty(element, "__qhtmlSlotAccessorInstalled", {
            value: true,
            configurable: true,
            enumerable: false,
            writable: true,
          });
        }
        element.__qhtmlResolveSlotContext = typeof dynamicResolver === "function" ? dynamicResolver : null;
        element.__qhtmlSlotContext = slotContext;
      } catch (error) {
        element.qslot = slotContext;
      }

      if (!slotContext) {
        if (Object.prototype.hasOwnProperty.call(element, "__qhtmlSlotContext")) {
          element.__qhtmlSlotContext = null;
        }
        if (Object.prototype.hasOwnProperty.call(element, "qslot")) {
          element.qslot = null;
        }
      }
    }

    function resolveNearestSlotNode(element) {
      if (!element || element.nodeType !== 1) {
        return null;
      }

      let cursor = element;
      while (cursor && cursor.nodeType === 1) {
        const mapped = binding.slotMap && binding.slotMap.get(cursor);
        if (mapped && typeof mapped === "object") {
          return mapped;
        }
        cursor = cursor.parentElement || cursor.parentNode || null;
      }

      const componentHost = resolveNearestComponentHost(element);
      if (componentHost && typeof componentHost.qdom === "function") {
        try {
          const componentQdom = componentHost.qdom();
          if (componentQdom && typeof componentQdom.findSlotFor === "function") {
            const slotFromComponent = componentQdom.findSlotFor(element);
            if (slotFromComponent) {
              return slotFromComponent;
            }
          }
        } catch (error) {
          // ignore dynamic slot resolution errors and continue fallback chain
        }
      }

      if (host && typeof host.qdom === "function") {
        try {
          const hostQdom = host.qdom();
          if (hostQdom && typeof hostQdom.findSlotFor === "function") {
            const slotFromHost = hostQdom.findSlotFor(element);
            if (slotFromHost) {
              return slotFromHost;
            }
          }
        } catch (error) {
          // ignore host-level slot resolution errors
        }
      }

      return null;
    }

    function setComponentContextAccessor(element, componentHost) {
      if (!element || element.nodeType !== 1) {
        return;
      }

      const resolvedHost = componentHost && componentHost.nodeType === 1 ? componentHost : null;
      try {
        if (!Object.prototype.hasOwnProperty.call(element, "__qhtmlComponentAccessorInstalled")) {
          Object.defineProperty(element, "component", {
            configurable: true,
            enumerable: false,
            get: function qhtmlComponentGetter() {
              if (this.__qhtmlComponentContext && this.__qhtmlComponentContext.nodeType === 1) {
                return this.__qhtmlComponentContext;
              }
              return resolveNearestComponentHost(this) || null;
            },
            set: function qhtmlComponentSetter(value) {
              this.__qhtmlComponentContext = value && value.nodeType === 1 ? value : null;
            },
          });
          Object.defineProperty(element, "__qhtmlComponentAccessorInstalled", {
            value: true,
            configurable: true,
            enumerable: false,
            writable: true,
          });
        }
        element.__qhtmlComponentContext = resolvedHost;
      } catch (error) {
        element.component = resolvedHost || resolveNearestComponentHost(element) || null;
      }
    }

    function setRootContextAccessor(element) {
      if (!element || element.nodeType !== 1) {
        return;
      }
      if (
        Object.prototype.hasOwnProperty.call(element, "root") &&
        typeof element.root === "function" &&
        element.__qhtmlRootAccessorInstalled !== true
      ) {
        return;
      }
      try {
        if (!Object.prototype.hasOwnProperty.call(element, "__qhtmlRootAccessorInstalled")) {
          Object.defineProperty(element, "root", {
            configurable: true,
            enumerable: false,
            writable: true,
            value: function qhtmlRootAccessor() {
              return host;
            },
          });
          Object.defineProperty(element, "__qhtmlRootAccessorInstalled", {
            value: true,
            configurable: true,
            enumerable: false,
            writable: true,
          });
        }
      } catch (error) {
        element.root = function qhtmlRootAccessorFallback() {
          return host;
        };
      }
    }

    function setComponentUpdateAccessor(componentHost) {
      if (!componentHost || componentHost.nodeType !== 1) {
        return;
      }
      if (
        Object.prototype.hasOwnProperty.call(componentHost, "update") &&
        typeof componentHost.update === "function" &&
        componentHost.__qhtmlComponentUpdateAccessorInstalled !== true
      ) {
        return;
      }
      try {
        if (!Object.prototype.hasOwnProperty.call(componentHost, "__qhtmlComponentUpdateAccessorInstalled")) {
          Object.defineProperty(componentHost, "update", {
            configurable: true,
            enumerable: false,
            writable: true,
            value: function qhtmlComponentUpdateAccessor() {
              return updateQHtmlElement(host, { scopeElement: this });
            },
          });
          Object.defineProperty(componentHost, "invalidate", {
            configurable: true,
            enumerable: false,
            writable: true,
            value: function qhtmlComponentInvalidateAccessor(options) {
              const opts = options && typeof options === "object" ? Object.assign({}, options) : {};
              opts.scopeElement = this;
              if (!Object.prototype.hasOwnProperty.call(opts, "forceBindings")) {
                opts.forceBindings = true;
              }
              return updateQHtmlElement(host, opts);
            },
          });
          Object.defineProperty(componentHost, "__qhtmlComponentUpdateAccessorInstalled", {
            value: true,
            configurable: true,
            enumerable: false,
            writable: true,
          });
        }
      } catch (error) {
        componentHost.update = function qhtmlComponentUpdateAccessorFallback() {
          return updateQHtmlElement(host, { scopeElement: this });
        };
        componentHost.invalidate = function qhtmlComponentInvalidateAccessorFallback(options) {
          const opts = options && typeof options === "object" ? Object.assign({}, options) : {};
          opts.scopeElement = this;
          if (!Object.prototype.hasOwnProperty.call(opts, "forceBindings")) {
            opts.forceBindings = true;
          }
          return updateQHtmlElement(host, opts);
        };
        componentHost.__qhtmlComponentUpdateAccessorInstalled = true;
      }
    }

    function resolveNearestComponentHost(element) {
      if (!element || element.nodeType !== 1) {
        return null;
      }
      function isComponentHostNode(node) {
        return !!(
          node &&
          node.nodeType === 1 &&
          typeof node.getAttribute === "function" &&
          node.getAttribute("qhtml-component-instance") === "1"
        );
      }

      if (isComponentHostNode(element)) {
        return element;
      }
      if (typeof element.closest === "function") {
        const nearest = element.closest("[qhtml-component-instance='1']");
        if (isComponentHostNode(nearest)) {
          return nearest;
        }
      }
      let cursor = element.parentElement || element.parentNode || null;
      while (cursor) {
        if (isComponentHostNode(cursor)) {
          return cursor;
        }
        cursor = cursor.parentElement || cursor.parentNode || null;
      }
      return null;
    }

    const scope = [];
    function collectScopeElements(node) {
      if (!node || node.nodeType !== 1) {
        return;
      }
      scope.push(node);
      const children = node && node.childNodes && typeof node.childNodes.length === "number" ? node.childNodes : [];
      for (let i = 0; i < children.length; i += 1) {
        collectScopeElements(children[i]);
      }
    }
    collectScopeElements(host);

    for (let i = 0; i < scope.length; i += 1) {
      const element = scope[i];
      if (!element || element.nodeType !== 1) {
        continue;
      }

      const node = binding.nodeMap && binding.nodeMap.get(element);
      if (node) {
        const sourceNode =
          node && typeof node === "object" && node.__qhtmlSourceNode && typeof node.__qhtmlSourceNode === "object"
            ? node.__qhtmlSourceNode
            : node;
        registerMappedDomElement(binding, sourceNode, element);
        element.qdom = function elementQdomAccessor() {
          flushPendingDomMutationSyncForElement(binding, element);
          flushPendingDomMutationSync(binding, {
            maxItems: DOM_MUTATION_SYNC_FLUSH_BATCH_SIZE,
            scheduleRemainder: true,
          });
          return installQDomFactories(sourceNode);
        };
      }
      element.qhtmlRoot = function elementQhtmlRootAccessor() {
        return host;
      };
      setRootContextAccessor(element);

      const componentHost = binding.componentMap && binding.componentMap.get(element);
      const resolvedComponentHost = componentHost || resolveNearestComponentHost(element) || null;
      setComponentContextAccessor(element, resolvedComponentHost);
      setComponentUpdateAccessor(resolvedComponentHost);

      const slotNode = binding.slotMap && binding.slotMap.get(element);
      setSlotContextAccessor(element, slotNode || null, resolveNearestSlotNode);
    }
  }

  function createObservedBinding(binding) {
    const rawQdom = binding.qdom;
    binding.rawQdom = rawQdom;
    const observer = core.observeQDom(rawQdom, function onMutation(mutation) {
      queueObservedMutation(binding, mutation);
    });
    binding.qdom = observer.qdom;
    binding.disconnect = observer.disconnect;
  }

  async function loadOrParseDocument(qHtmlElement, options) {
    const opts = options || {};
    if (opts.preferTemplate !== false) {
      const loaded = core.loadQDomTemplateBefore(qHtmlElement);
      if (loaded) {
        return loaded;
      }
    }

    const source = readInlineSourceFromElement(qHtmlElement);
    const companionScript = findCompanionQScript(qHtmlElement);
    let rules = [];
    if (companionScript) {
      rules = parser.parseQScript(companionScript.textContent || "");
    }

    const importUrls = [];
    let effectiveSource = source;
    if (typeof parser.resolveQImportsAsync === "function") {
      effectiveSource = await parser.resolveQImportsAsync(source, {
        loadImport: loadImportSource,
        baseUrl: resolveImportBaseUrl(qHtmlElement, opts),
        maxImports: opts.maxImports,
        cache: opts.importCache,
        onImport: function onImport(info) {
          if (info && info.url) {
            importUrls.push(info.url);
          }
        },
      });
    }

    const parsed = parser.parseQHtmlToQDom(effectiveSource, {
      scriptRules: rules,
      resolveImportsBeforeParse: false,
    });
    if (!parsed.meta || typeof parsed.meta !== "object") {
      parsed.meta = {};
    }
    if (importUrls.length > 0) {
      parsed.meta.imports = importUrls.slice();
    }
    parsed.meta.resolvedSource = effectiveSource;
    return parsed;
  }

  function mountQHtmlElement(qHtmlElement, options) {
    if (!qHtmlElement || qHtmlElement.nodeType !== 1) {
      throw new Error("mountQHtmlElement expects a q-html element node.");
    }

    const tagName = String(qHtmlElement.tagName || "").toLowerCase();
    if (tagName !== "q-html") {
      throw new Error("mountQHtmlElement expects <q-html>, received <" + tagName + ">.");
    }

    const existing = bindings.get(qHtmlElement);
    if (existing) {
      return existing;
    }

    const doc = qHtmlElement.ownerDocument || global.document;
    markMountPending(doc);
    const binding = {
      host: qHtmlElement,
      doc: doc,
      qdom: null,
      rawQdom: null,
      nodeMap: new WeakMap(),
      componentMap: new WeakMap(),
      slotMap: new WeakMap(),
      componentHostBySourceNode: new WeakMap(),
      domByQdomNode: new WeakMap(),
      listeners: [],
      hostLifecycleRan: false,
      readyHooksState: {},
      rendering: false,
      updating: false,
      pendingMutations: [],
      mutationFlushScheduled: false,
      templateSaveTimer: null,
      domControlSyncAttached: false,
      domControlSyncHandler: null,
      domMutationSyncAttached: false,
      domMutationObserver: null,
      domMutationObservedElements: [],
      domMutationDirtyElements: new Set(),
      domMutationDirtyQueue: [],
      domMutationFlushTimer: null,
      domMutationRefreshTimer: null,
      domMutationSyncSuppressDepth: 0,
      disconnect: function noop() {},
      ready: null,
    };

    bindings.set(qHtmlElement, binding);
    binding.ready = Promise.resolve()
      .then(function loadAndRender() {
        return withDomMutationSyncGloballySuspended(function suspendedParse() {
          return loadOrParseDocument(qHtmlElement, options);
        });
      })
      .then(function attachLoadedDocument(qdomDocument) {
        if (bindings.get(qHtmlElement) !== binding) {
          return binding;
        }
        binding.qdom = qdomDocument;
        binding.rawQdom = qdomDocument;
        binding.hostLifecycleRan = false;
        createObservedBinding(binding);
        renderBinding(binding);
        return binding;
      })
      .catch(function handleMountError(error) {
        if (bindings.get(qHtmlElement) === binding) {
          bindings.delete(qHtmlElement);
        }
        if (global.console && typeof global.console.error === "function") {
          global.console.error("qhtml mount failed:", error);
        }
        throw error;
      })
      .finally(function onMountSettled() {
        markMountSettled(doc, qHtmlElement);
      });

    return binding;
  }

  function mountWithinNode(node, options) {
    if (!node || node.nodeType !== 1) {
      return [];
    }

    const mounted = [];
    const tagName = String(node.tagName || "").toLowerCase();
    if (tagName === "q-html") {
      mounted.push(mountQHtmlElement(node, options));
    }

    if (typeof node.querySelectorAll === "function") {
      const nested = node.querySelectorAll("q-html");
      for (let i = 0; i < nested.length; i += 1) {
        mounted.push(mountQHtmlElement(nested[i], options));
      }
    }

    return mounted;
  }

  function unmountWithinNode(node) {
    if (!node || node.nodeType !== 1) {
      return;
    }

    const tagName = String(node.tagName || "").toLowerCase();
    if (tagName === "q-html") {
      unmountQHtmlElement(node);
    }

    if (typeof node.querySelectorAll === "function") {
      const nested = node.querySelectorAll("q-html");
      for (let i = 0; i < nested.length; i += 1) {
        unmountQHtmlElement(nested[i]);
      }
    }
  }

  function getObserverTarget(root) {
    if (!root) {
      return null;
    }
    if (root.nodeType === 9) {
      return root.documentElement || root.body || null;
    }
    return root;
  }

  function stopAutoMountObserver() {
    if (autoMountObserver && typeof autoMountObserver.disconnect === "function") {
      autoMountObserver.disconnect();
    }
    if (autoMountPollTimer && typeof global.clearTimeout === "function") {
      global.clearTimeout(autoMountPollTimer);
    }
    autoMountObserver = null;
    autoMountPollTimer = null;
    autoMountRoot = null;
  }

  function scheduleFallbackPolling(root, options) {
    if (!root || typeof global.setTimeout !== "function") {
      return null;
    }

    autoMountRoot = root;
    autoMountOptions = options || {};

    const run = function run() {
      if (!autoMountRoot || typeof autoMountRoot.querySelectorAll !== "function") {
        autoMountPollTimer = null;
        return;
      }

      const elements = autoMountRoot.querySelectorAll("q-html");
      for (let i = 0; i < elements.length; i += 1) {
        mountQHtmlElement(elements[i], autoMountOptions);
      }
      hydrateRegisteredComponentHostsInNode(autoMountRoot, autoMountRoot.ownerDocument || global.document);

      autoMountPollTimer = global.setTimeout(run, 50);
      if (autoMountPollTimer && typeof autoMountPollTimer.unref === "function") {
        autoMountPollTimer.unref();
      }
    };

    run();
    return { mode: "polling" };
  }

  function startAutoMountObserver(root, options) {
    const requestedRoot = root || global.document;
    if (autoMountObserver && autoMountRoot === requestedRoot) {
      return autoMountObserver;
    }
    if (autoMountPollTimer && autoMountRoot === requestedRoot) {
      autoMountOptions = options || {};
      return { mode: "polling" };
    }

    const target = getObserverTarget(requestedRoot);
    if (!target) {
      return null;
    }

    if (typeof global.MutationObserver !== "function") {
      stopAutoMountObserver();
      return scheduleFallbackPolling(requestedRoot, options);
    }

    autoMountOptions = options || {};

    stopAutoMountObserver();

    autoMountRoot = requestedRoot;
    autoMountObserver = new global.MutationObserver(function onMutations(mutations) {
      for (let i = 0; i < mutations.length; i += 1) {
        const mutation = mutations[i];
        for (let j = 0; j < mutation.removedNodes.length; j += 1) {
          unmountWithinNode(mutation.removedNodes[j]);
        }
        for (let j = 0; j < mutation.addedNodes.length; j += 1) {
          mountWithinNode(mutation.addedNodes[j], autoMountOptions);
          hydrateRegisteredComponentHostsInNode(mutation.addedNodes[j], requestedRoot.ownerDocument || global.document);
        }
      }
    });

    autoMountObserver.observe(target, {
      childList: true,
      subtree: true,
    });

    return autoMountObserver;
  }

  function unmountQHtmlElement(qHtmlElement) {
    const binding = bindings.get(qHtmlElement);
    if (!binding) {
      return;
    }
    detachAllScriptListeners(binding);
    detachDomControlSync(binding);
    detachDomMutationSync(binding);
    if (binding.templateSaveTimer && typeof global.clearTimeout === "function") {
      global.clearTimeout(binding.templateSaveTimer);
      binding.templateSaveTimer = null;
    }
    if (Array.isArray(binding.pendingMutations)) {
      binding.pendingMutations.length = 0;
    }
    if (typeof binding.disconnect === "function") {
      binding.disconnect();
    }
    terminateWasmRuntimesInNode(binding.host);
    bindings.delete(qHtmlElement);
  }

  function getQDomForElement(qHtmlElement) {
    const binding = bindings.get(qHtmlElement);
    if (!binding) {
      return null;
    }
    flushPendingDomMutationSync(binding, {
      maxItems: DOM_MUTATION_SYNC_FLUSH_BATCH_SIZE,
      scheduleRemainder: true,
    });
    return binding.qdom;
  }

  function describeUpdateHost(binding) {
    const host = binding && binding.host ? binding.host : null;
    if (!host || host.nodeType !== 1) {
      return "<unknown>";
    }
    const tag = String(host.tagName || "q-html").toLowerCase();
    const id = typeof host.getAttribute === "function" ? String(host.getAttribute("id") || "").trim() : "";
    return id ? tag + "#" + id : tag;
  }

  function resolveScopedUpdateElementFromStaleNodes(binding, staleNodes) {
    if (!binding || !Array.isArray(staleNodes) || staleNodes.length === 0) {
      return null;
    }
    for (let i = 0; i < staleNodes.length; i += 1) {
      const sourceNode = sourceNodeOf(staleNodes[i]) || staleNodes[i];
      if (!sourceNode || typeof sourceNode !== "object") {
        continue;
      }
      const mappedElements = collectMappedDomElements(binding, sourceNode);
      for (let j = 0; j < mappedElements.length; j += 1) {
        const element = mappedElements[j];
        if (!element || element.nodeType !== 1) {
          continue;
        }
        let cursor = element;
        while (cursor && cursor.nodeType === 1) {
          if (cursor === binding.host) {
            break;
          }
          if (typeof cursor.hasAttribute === "function" && cursor.hasAttribute("qhtml-component-instance")) {
            return cursor;
          }
          cursor = cursor.parentElement || null;
        }
      }
    }
    return null;
  }

  function ensureBindingUpdateGuardState(binding) {
    if (!binding || typeof binding !== "object") {
      return null;
    }
    let state = binding.updateGuardState;
    if (!state || typeof state !== "object") {
      state = {
        inProgress: false,
        queued: false,
        epoch: 0,
        activeEpoch: 0,
        cyclesInTick: 0,
        reentryCountInEpoch: 0,
        nextScopeElement: null,
      };
      binding.updateGuardState = state;
    }
    return state;
  }

  function reportUpdateLoopError(binding, reason, details) {
    if (!global.console || typeof global.console.error !== "function") {
      return;
    }
    global.console.error(
      "qhtml update() aborted due to potential binding loop:",
      Object.assign(
        {
          host: describeUpdateHost(binding),
          reason: String(reason || "unknown"),
        },
        details || {}
      )
    );
  }

  function updateQHtmlElement(qHtmlElement, options) {
    const binding = bindings.get(qHtmlElement);
    if (!binding || !binding.qdom) {
      return false;
    }
    const previousUpdating = binding.updating === true;
    binding.updating = true;
    try {
      flushPendingDomMutationSync(binding, {
        maxItems: DOM_MUTATION_SYNC_FLUSH_BATCH_SIZE,
        scheduleRemainder: true,
      });
      const opts = options && typeof options === "object" ? options : null;
      const forceBindings = !!(
        opts &&
        (opts.forceBindings === true || opts.invalidate === true || opts.force === true || opts.bindings === "all")
      );
      const requestedScopeElement =
        opts && opts.scopeElement && opts.scopeElement.nodeType === 1 ? opts.scopeElement : null;
      logRuntimeEvent("qhtml update() called", {
        host: describeElementForLog(binding.host),
        scope: requestedScopeElement ? describeElementForLog(requestedScopeElement) : null,
        forceBindings: forceBindings === true,
      });
      const state = ensureBindingUpdateGuardState(binding);
      if (!state) {
        return false;
      }

    if (state.inProgress) {
      state.queued = true;
      if (!requestedScopeElement) {
        state.nextScopeElement = null;
      } else if (state.nextScopeElement !== null) {
        // keep pending full update when already requested
      } else {
        state.nextScopeElement = requestedScopeElement;
      }
      state.reentryCountInEpoch += 1;
      if (state.reentryCountInEpoch > MAX_UPDATE_REENTRIES_PER_EPOCH) {
        state.queued = false;
        reportUpdateLoopError(binding, "reentry-limit", {
          epoch: state.activeEpoch,
          reentryCount: state.reentryCountInEpoch,
          limit: MAX_UPDATE_REENTRIES_PER_EPOCH,
        });
        return false;
      }
      return true;
    }

    state.cyclesInTick = 0;
    state.reentryCountInEpoch = 0;
    if (!requestedScopeElement) {
      state.nextScopeElement = null;
    } else if (state.nextScopeElement !== null) {
      // keep pending full update when already requested
    } else {
      state.nextScopeElement = requestedScopeElement;
    }

      while (true) {
      state.queued = false;
      state.epoch += 1;
      state.activeEpoch = state.epoch;
      state.inProgress = true;
      state.reentryCountInEpoch = 0;
      state.cyclesInTick += 1;
      if (state.cyclesInTick > MAX_UPDATE_CYCLES_PER_TICK) {
        state.inProgress = false;
        reportUpdateLoopError(binding, "cycle-limit", {
          epoch: state.activeEpoch,
          cycleCount: state.cyclesInTick,
          limit: MAX_UPDATE_CYCLES_PER_TICK,
        });
        return false;
      }
      try {
        const activeScopeElement = state.nextScopeElement;
        state.nextScopeElement = null;
        evaluateAllNodeBindings(binding, {
          forceAll: forceBindings,
          patchDom: true,
        });
        evaluateAllNodeQColors(binding);
        const updateNonce = createRuntimeUpdateNonceToken();
        const staleNodes = prepareBindingNodeNoncesForUpdate(binding, binding.lastUpdateNonce);
        const inferredScopeElement = activeScopeElement || resolveScopedUpdateElementFromStaleNodes(binding, staleNodes);
        let didRender = false;
        try {
          if (inferredScopeElement) {
            if (!renderScopedComponentBinding(binding, inferredScopeElement, { skipBindingEvaluation: true })) {
              renderBinding(binding, { skipBindingEvaluation: true });
            }
            didRender = true;
          } else if (staleNodes.length > 0) {
            renderBinding(binding, { skipBindingEvaluation: true });
            didRender = true;
          }
        } finally {
          if (didRender) {
            finalizeBindingNodeNonces(binding, updateNonce);
          }
        }
      } finally {
        state.inProgress = false;
      }
      if (!state.queued) {
        break;
      }
    }
      return true;
    } finally {
      binding.updating = previousUpdating;
    }
  }

  function toQHtmlSource(qHtmlElement, options) {
    const binding = bindings.get(qHtmlElement);
    if (!binding) {
      return null;
    }
    flushPendingDomMutationSync(binding, {
      maxItems: DOM_MUTATION_SYNC_FLUSH_BATCH_SIZE,
      scheduleRemainder: true,
    });
    return parser.qdomToQHtml(binding.qdom, options);
  }

  function initAll(root, options) {
    const scope = root || global.document;
    if (!scope || typeof scope.querySelectorAll !== "function") {
      return [];
    }

    const elements = scope.querySelectorAll("q-html");
    const out = [];
    for (let i = 0; i < elements.length; i += 1) {
      out.push(mountQHtmlElement(elements[i], options));
    }
    hydrateRegisteredComponentHostsInNode(scope, scope.ownerDocument || global.document);
    startAutoMountObserver(scope, options);
    const signalDoc = getSignalDocument(scope);
    const signalState = ensureContentLoadedState(signalDoc);
    if (signalState) {
      signalState.runtimeManaged = true;
    }
    scheduleContentLoadedSignal(signalDoc, scope);
    return out;
  }

  const runtimeApi = {
    SIGNALS: {
      QHTMLContentLoaded: QHTML_CONTENT_LOADED_EVENT,
    },
    mountQHtmlElement: mountQHtmlElement,
    unmountQHtmlElement: unmountQHtmlElement,
    getQDomForElement: getQDomForElement,
    updateQHtmlElement: updateQHtmlElement,
    toQHtmlSource: toQHtmlSource,
    createQSignalEvent: createQSignalEvent,
    emitQSignal: emitQSignal,
    hydrateComponentElement: hydrateComponentElement,
    setDomMutationObserversEnabled: setDomMutationSyncEnabled,
    getDomMutationObserversEnabled: function getDomMutationObserversEnabled() {
      return domMutationSyncEnabled;
    },
    isDomMutationObserversActive: isDomMutationSyncGloballyEnabled,
    initAll: initAll,
    startAutoMountObserver: startAutoMountObserver,
    stopAutoMountObserver: stopAutoMountObserver,
  };

  modules.qhtmlRuntime = runtimeApi;
  installGlobalDomMutationSyncToggle();
  global.QHtml = runtimeApi;

  if (global.document && global.document.readyState === "loading") {
    global.document.addEventListener("DOMContentLoaded", function onReady() {
      runtimeApi.initAll(global.document);
    });
  } else if (global.document) {
    runtimeApi.initAll(global.document);
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
