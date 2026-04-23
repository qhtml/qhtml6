(function attachQEditor(globalScope) {
  'use strict';

  if (typeof document === 'undefined' || typeof customElements === 'undefined') {
    return;
  }

  const qEditorImportSourceInFlight = new Map();
  const qEditorCodeMirrorState = { promise: null };
  const QEDITOR_FALLBACK_VERSION = '6.4.0';
  const QEDITOR_IMPORT_CACHE_RECORDS_KEY = 'qhtml.import.records';
  const QEDITOR_IMPORT_CACHE_INDEX_KEY = 'qhtml.import.index';
  const QHTML_CANONICAL_KEYWORDS = [
    'q-component',
    'q-template',
    'q-macro',
    'q-rewrite',
    'q-script',
    'q-bind',
    'q-property',
    'q-signal',
    'q-alias',
    'q-import',
    'q-keyword',
    'slot',
    'style',
    'text',
    'html',
    'onReady'
  ];
  const QHTML_KEYWORD_COMPLETIONS = [
    'q-component',
    'q-template',
    'q-macro',
    'q-rewrite',
    'q-script',
    'q-bind',
    'q-property',
    'q-signal',
    'q-alias',
    'q-import',
    'q-keyword',
    'slot',
    'style',
    'text',
    'html',
    'onReady'
  ];
  const QHTML_PUNCTUATION_CHARS = new Set(['{', '}', '[', ']', '(', ')', ':', ';', ',']);
  const QEDITOR_CODEMIRROR_SCRIPT = 'codemirror/codemirror.js';
  const QEDITOR_CODEMIRROR_CSS = 'codemirror/codemirror.css';
  const QEDITOR_QDOM_DISPLAY_HIDDEN_KEYS = new Set([
    'originalSource',
    'resolvedSource',
    'macroExpandedSource',
    'rewrittenSource',
    'evaluatedSource'
  ]);
  const QEDITOR_QDOM_WRAP_INDENT = '\u3164\u3164\u3164';

  const HTML_TAGS = new Set([
    'a', 'abbr', 'address', 'area', 'article', 'aside', 'audio', 'b', 'base', 'bdi', 'bdo', 'blockquote', 'body',
    'br', 'button', 'canvas', 'caption', 'cite', 'code', 'col', 'colgroup', 'data', 'datalist', 'dd', 'del',
    'details', 'dfn', 'dialog', 'div', 'dl', 'dt', 'em', 'embed', 'fieldset', 'figcaption', 'figure', 'footer',
    'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'header', 'hr', 'html', 'i', 'iframe', 'img', 'input',
    'ins', 'kbd', 'label', 'legend', 'li', 'link', 'main', 'map', 'mark', 'menu', 'meta', 'meter', 'nav',
    'noscript', 'object', 'ol', 'optgroup', 'option', 'output', 'p', 'param', 'picture', 'pre', 'progress',
    'q', 'rp', 'rt', 'ruby', 's', 'samp', 'script', 'section', 'select', 'slot', 'small', 'source', 'span',
    'strong', 'style', 'sub', 'summary', 'sup', 'svg', 'table', 'tbody', 'td', 'template', 'textarea', 'tfoot',
    'th', 'thead', 'time', 'title', 'tr', 'track', 'u', 'ul', 'var', 'video', 'wbr'
  ]);

  function resolveQEditorScriptBaseUrl() {
    const scripts = document && document.scripts ? Array.from(document.scripts) : [];
    for (let i = scripts.length - 1; i >= 0; i -= 1) {
      const src = scripts[i] && typeof scripts[i].src === 'string' ? scripts[i].src.trim() : '';
      if (!src) continue;
      if (!/\/q-editor\.js(?:$|[?#])/.test(src)) continue;
      try {
        return new URL('.', src).toString();
      } catch (error) {
        // ignore malformed script src and continue
      }
    }
    if (document && typeof document.baseURI === 'string' && document.baseURI.trim()) {
      return document.baseURI.trim();
    }
    if (globalScope.location && typeof globalScope.location.href === 'string' && globalScope.location.href.trim()) {
      return globalScope.location.href.trim();
    }
    return '';
  }

  const qEditorScriptBaseUrl = resolveQEditorScriptBaseUrl();

  function resolveQEditorAssetUrl(relativePath) {
    const rel = String(relativePath || '').trim();
    if (!rel) return '';
    try {
      return new URL(rel, qEditorScriptBaseUrl || document.baseURI || globalScope.location.href || '').toString();
    } catch (error) {
      return rel;
    }
  }

  function getCodeMirrorGlobal() {
    const cm = globalScope.CM || null;
    if (!cm || typeof cm !== 'object') return null;
    if (!cm['codemirror'] || !cm['@codemirror/state'] || !cm['@codemirror/view']) return null;
    return cm;
  }

  function ensureCodeMirrorStylesheet() {
    const href = resolveQEditorAssetUrl(QEDITOR_CODEMIRROR_CSS);
    if (!href || !document || !document.head) return;
    if (document.querySelector('link[data-qeditor-codemirror-css="1"]')) {
      return;
    }
    const existing = Array.from(document.querySelectorAll('link[rel="stylesheet"][href]')).find(function findLink(link) {
      const src = String(link.getAttribute('href') || '').trim();
      return src === href || /\/codemirror\/codemirror\.css(?:$|[?#])/.test(src);
    });
    if (existing) {
      existing.setAttribute('data-qeditor-codemirror-css', '1');
      return;
    }
    const link = document.createElement('link');
    link.setAttribute('rel', 'stylesheet');
    link.setAttribute('href', href);
    link.setAttribute('data-qeditor-codemirror-css', '1');
    document.head.appendChild(link);
  }

  function ensureCodeMirrorLoaded() {
    const ready = getCodeMirrorGlobal();
    if (ready) {
      ensureCodeMirrorStylesheet();
      return Promise.resolve(ready);
    }
    if (qEditorCodeMirrorState.promise) {
      return qEditorCodeMirrorState.promise;
    }

    qEditorCodeMirrorState.promise = new Promise(function loadCodeMirror(resolve, reject) {
      ensureCodeMirrorStylesheet();
      const scriptUrl = resolveQEditorAssetUrl(QEDITOR_CODEMIRROR_SCRIPT);
      if (!scriptUrl || !document || !document.head) {
        reject(new Error('Unable to resolve CodeMirror script URL for q-editor.'));
        return;
      }

      const existing = Array.from(document.querySelectorAll('script[src]')).find(function findScript(script) {
        const src = String(script.getAttribute('src') || '').trim();
        return src === scriptUrl || /\/codemirror\/codemirror\.js(?:$|[?#])/.test(src);
      });

      const onReady = function onReady() {
        const cm = getCodeMirrorGlobal();
        if (cm) {
          resolve(cm);
          return;
        }
        reject(new Error('CodeMirror loaded but global CM exports are unavailable.'));
      };

      if (existing) {
        if (getCodeMirrorGlobal()) {
          resolve(getCodeMirrorGlobal());
          return;
        }
        existing.addEventListener('load', onReady, { once: true });
        existing.addEventListener('error', function onExistingError() {
          reject(new Error('Failed to load existing CodeMirror script.'));
        }, { once: true });
        return;
      }

      const script = document.createElement('script');
      script.async = true;
      script.src = scriptUrl;
      script.setAttribute('data-qeditor-codemirror-script', '1');
      script.addEventListener('load', onReady, { once: true });
      script.addEventListener('error', function onLoadError() {
        reject(new Error('Failed to load CodeMirror from ' + scriptUrl));
      }, { once: true });
      document.head.appendChild(script);
    }).catch(function onLoadFailure(error) {
      qEditorCodeMirrorState.promise = null;
      throw error;
    });

    return qEditorCodeMirrorState.promise;
  }

  function getQHtmlModules() {
    const modules = globalScope.QHtmlModules || null;
    if (!modules) return null;
    if (!modules.qhtmlParser || !modules.domRenderer || !modules.qdomCore) return null;
    return modules;
  }

  function getQHtmlRuntime() {
    const runtime = globalScope.QHtml || null;
    if (!runtime || typeof runtime !== 'object') return null;
    if (typeof runtime.mountQHtmlElement !== 'function') return null;
    return runtime;
  }

  function normalizeImportedSource(sourceText) {
    const text = String(sourceText || '');
    const wrapper = text.match(/^\s*<\s*q-html[^>]*>([\s\S]*?)<\s*\/\s*q-html\s*>\s*$/i);
    if (wrapper) {
      return String(wrapper[1] || '');
    }
    return text;
  }

  function resolveImportBaseUrl() {
    if (document && typeof document.baseURI === 'string' && document.baseURI.trim()) {
      return document.baseURI.trim();
    }
    if (globalScope.location && typeof globalScope.location.href === 'string' && globalScope.location.href.trim()) {
      return globalScope.location.href.trim();
    }
    return '';
  }

  function qEditorVersionValue() {
    const explicit = String(globalScope && globalScope.QHTML_VERSION ? globalScope.QHTML_VERSION : '').trim();
    if (explicit) return explicit;
    const runtime = globalScope && globalScope.QHtml && typeof globalScope.QHtml === 'object' ? globalScope.QHtml : null;
    const runtimeVersion = runtime && typeof runtime.version === 'string' ? String(runtime.version || '').trim() : '';
    if (runtimeVersion) return runtimeVersion;
    return QEDITOR_FALLBACK_VERSION;
  }

  function qEditorImportStorage() {
    try {
      if (globalScope && globalScope.localStorage && typeof globalScope.localStorage.getItem === 'function') {
        return globalScope.localStorage;
      }
    } catch (error) {
      return null;
    }
    return null;
  }

  function qEditorBytesToBinary(bytes) {
    if (!bytes || typeof bytes.length !== 'number') return '';
    let out = '';
    for (let i = 0; i < bytes.length; i += 1) {
      out += String.fromCharCode(bytes[i] & 0xff);
    }
    return out;
  }

  function qEditorBinaryToBytes(value) {
    const text = String(value || '');
    const out = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i += 1) {
      out[i] = text.charCodeAt(i) & 0xff;
    }
    return out;
  }

  function qEditorEncodeBase64(value) {
    const text = String(value == null ? '' : value);
    const BufferCtor = globalScope && typeof globalScope.Buffer !== 'undefined' ? globalScope.Buffer : null;
    if (typeof globalScope.TextEncoder === 'function') {
      try {
        const bytes = new globalScope.TextEncoder().encode(text);
        if (typeof globalScope.btoa === 'function') {
          return globalScope.btoa(qEditorBytesToBinary(bytes));
        }
        if (BufferCtor && typeof BufferCtor.from === 'function') {
          return BufferCtor.from(bytes).toString('base64');
        }
      } catch (error) {
        // fall through
      }
    }
    if (BufferCtor && typeof BufferCtor.from === 'function') {
      try {
        return BufferCtor.from(text, 'utf8').toString('base64');
      } catch (error) {
        // fall through
      }
    }
    if (typeof globalScope.btoa === 'function') {
      try {
        return globalScope.btoa(unescape(encodeURIComponent(text)));
      } catch (error) {
        return '';
      }
    }
    return '';
  }

  function qEditorDecodeBase64(value) {
    const encoded = String(value || '').trim();
    if (!encoded) return '';
    const BufferCtor = globalScope && typeof globalScope.Buffer !== 'undefined' ? globalScope.Buffer : null;
    if (typeof globalScope.atob === 'function') {
      try {
        const binary = globalScope.atob(encoded);
        if (typeof globalScope.TextDecoder === 'function') {
          return new globalScope.TextDecoder().decode(qEditorBinaryToBytes(binary));
        }
        return decodeURIComponent(escape(binary));
      } catch (error) {
        // fall through
      }
    }
    if (BufferCtor && typeof BufferCtor.from === 'function') {
      try {
        return BufferCtor.from(encoded, 'base64').toString('utf8');
      } catch (error) {
        return '';
      }
    }
    return '';
  }

  function qEditorReadImportRecords(storage) {
    const targetStorage = storage || qEditorImportStorage();
    if (!targetStorage) return [];
    try {
      const raw = targetStorage.getItem(QEDITOR_IMPORT_CACHE_RECORDS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed;
    } catch (error) {
      return [];
    }
  }

  function qEditorReadImportIndex(storage) {
    const targetStorage = storage || qEditorImportStorage();
    if (!targetStorage) return {};
    try {
      const raw = targetStorage.getItem(QEDITOR_IMPORT_CACHE_INDEX_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      return parsed;
    } catch (error) {
      return {};
    }
  }

  function qEditorWriteImportCache(storage, records, index) {
    const targetStorage = storage || qEditorImportStorage();
    if (!targetStorage) return;
    try {
      targetStorage.setItem(QEDITOR_IMPORT_CACHE_RECORDS_KEY, JSON.stringify(Array.isArray(records) ? records : []));
      targetStorage.setItem(
        QEDITOR_IMPORT_CACHE_INDEX_KEY,
        JSON.stringify(index && typeof index === 'object' && !Array.isArray(index) ? index : {})
      );
    } catch (error) {
      // ignore storage write failures
    }
  }

  function qEditorCreateImportUuid() {
    if (globalScope.crypto && typeof globalScope.crypto.randomUUID === 'function') {
      try {
        const generated = String(globalScope.crypto.randomUUID() || '').trim();
        if (generated) return generated;
      } catch (error) {
        // fall through
      }
    }
    return 'qimport-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 0xffffffff).toString(16);
  }

  function qEditorSelectRecordByUuid(records, uuid) {
    const list = Array.isArray(records) ? records : [];
    const id = String(uuid || '').trim();
    if (!id) return null;
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const candidate = list[i];
      if (!candidate || typeof candidate !== 'object') continue;
      if (String(candidate.uuid || '').trim() === id) {
        return candidate;
      }
    }
    return null;
  }

  async function qEditorFetchImport(url) {
    const key = String(url || '').trim();
    if (typeof globalScope.fetch !== 'function') {
      throw new Error('fetch() is required for q-import in q-editor.');
    }
    let response;
    try {
      response = await globalScope.fetch(key);
    } catch (error) {
      throw new Error("Failed to fetch q-import '" + key + "': " + error.message);
    }

    const status = Number(response && typeof response.status !== 'undefined' ? response.status : 200);
    const ok = !!response && (response.ok === true || (status >= 200 && status < 300) || status === 0);
    if (!ok) {
      throw new Error("q-import fetch failed for '" + key + "' (status " + status + ").");
    }
    const text = await response.text();
    return normalizeImportedSource(text);
  }

  async function qEditorFetchAndPersist(url, fileKey, storage, records, index) {
    const loaded = await qEditorFetchImport(url);
    const version = qEditorVersionValue();
    const uuid = qEditorCreateImportUuid();
    records.push({
      version: version,
      file: String(fileKey || ''),
      contents: qEditorEncodeBase64(loaded),
      uuid: uuid
    });
    index[fileKey] = uuid;
    qEditorWriteImportCache(storage, records, index);
    return loaded;
  }

  function qEditorShouldForceRefresh() {
    const roll = 1 + Math.floor(Math.random() * 5);
    return roll === 2 || roll === 3;
  }

  async function qEditorLoadFromPersistentCache(url) {
    const key = String(url || '').trim();
    const storage = qEditorImportStorage();
    if (!storage) {
      return qEditorFetchImport(key);
    }
    const fileKey = qEditorEncodeBase64(key);
    if (!fileKey) {
      return qEditorFetchImport(key);
    }
    const version = qEditorVersionValue();
    let records = qEditorReadImportRecords(storage);
    let index = qEditorReadImportIndex(storage);
    const entryUuid = String(index[fileKey] || '').trim();
    if (entryUuid) {
      const cachedRecord = qEditorSelectRecordByUuid(records, entryUuid);
      if (cachedRecord) {
        const cachedVersion = String(cachedRecord.version || '').trim();
        if (cachedVersion !== version) {
          records = records.filter(function dropStale(record) {
            return String(record && record.uuid ? record.uuid : '').trim() !== entryUuid;
          });
          delete index[fileKey];
          qEditorWriteImportCache(storage, records, index);
          return qEditorFetchAndPersist(key, fileKey, storage, records, index);
        }
        if (qEditorShouldForceRefresh()) {
          return qEditorFetchAndPersist(key, fileKey, storage, records, index);
        }
        const decoded = qEditorDecodeBase64(cachedRecord.contents);
        if (decoded) {
          return normalizeImportedSource(decoded);
        }
        return qEditorFetchAndPersist(key, fileKey, storage, records, index);
      }
      delete index[fileKey];
      qEditorWriteImportCache(storage, records, index);
    }
    return qEditorFetchAndPersist(key, fileKey, storage, records, index);
  }

  async function loadImportSource(url, options) {
    const opts = options && typeof options === 'object' ? options : {};
    const key = String(url || '').trim();
    if (!key) {
      throw new Error('q-import URL cannot be empty.');
    }
    const noCache = opts.noCache === true;
    const inFlightKey = key + '::' + (noCache ? 'nocache' : 'cache');
    if (qEditorImportSourceInFlight.has(inFlightKey)) {
      return qEditorImportSourceInFlight.get(inFlightKey);
    }
    const pending = (async function resolveImport() {
      if (noCache) {
        return qEditorFetchImport(key);
      }
      return qEditorLoadFromPersistentCache(key);
    })();
    qEditorImportSourceInFlight.set(inFlightKey, pending);
    try {
      return await pending;
    } finally {
      qEditorImportSourceInFlight.delete(inFlightKey);
    }
  }

  async function resolveImports(source, parser, baseUrl) {
    const text = String(source || '');
    if (!text.trim()) {
      return text;
    }

    if (typeof parser.resolveQImportsAsync === 'function') {
      return parser.resolveQImportsAsync(text, {
        loadImport: loadImportSource,
        baseUrl: baseUrl || '',
        maxImports: 400,
      });
    }

    if (typeof parser.resolveQImportsSync === 'function') {
      return parser.resolveQImportsSync(text, {
        loadImportSync: function unsupportedSyncLoader() {
          throw new Error('Synchronous q-import loader unavailable in q-editor; async resolver is required.');
        },
        baseUrl: baseUrl || '',
        maxImports: 400,
      });
    }

    return text;
  }

  function transformScriptBody(body) {
    if (typeof body !== 'string' || body.length === 0) {
      return '';
    }
    return body.replace(/(^|[^A-Za-z0-9_$])#([A-Za-z_][A-Za-z0-9_-]*)/g, function replaceSelector(_, prefix, id) {
      return prefix + 'document.querySelector("#' + id + '")';
    });
  }

  function serializeSourceChildNode(node) {
    if (!node || typeof node !== 'object') {
      return '';
    }
    if (node.nodeType === Node.TEXT_NODE) {
      return String(node.nodeValue || '');
    }
    if (node.nodeType === Node.CDATA_SECTION_NODE) {
      return '<![CDATA[' + String(node.nodeValue || '') + ']]>';
    }
    if (node.nodeType === Node.COMMENT_NODE) {
      return '<!--' + String(node.nodeValue || '') + '-->';
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      if (typeof node.outerHTML === 'string') {
        return node.outerHTML;
      }
      const tagName = String(node.tagName || '').trim().toLowerCase() || 'div';
      const attrs = node.attributes && typeof node.attributes.length === 'number' ? node.attributes : [];
      let attrText = '';
      for (let i = 0; i < attrs.length; i += 1) {
        const attr = attrs[i];
        if (!attr || typeof attr.name !== 'string') continue;
        const value = String(attr.value == null ? '' : attr.value).replace(/"/g, '&quot;');
        attrText += ' ' + attr.name + '="' + value + '"';
      }
      const children = node.childNodes && typeof node.childNodes.length === 'number' ? node.childNodes : [];
      let inner = '';
      for (let i = 0; i < children.length; i += 1) {
        inner += serializeSourceChildNode(children[i]);
      }
      return '<' + tagName + attrText + '>' + inner + '</' + tagName + '>';
    }
    return '';
  }

  function readInlineSourceFromElement(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) {
      return '';
    }
    const children = element.childNodes && typeof element.childNodes.length === 'number' ? element.childNodes : [];
    if (children.length === 0) {
      return typeof element.textContent === 'string' ? element.textContent : '';
    }
    let out = '';
    for (let i = 0; i < children.length; i += 1) {
      out += serializeSourceChildNode(children[i]);
    }
    return out;
  }

  function formatHtmlOutput(html) {
    const source = String(html || '').trim();
    if (!source) return '';

    try {
      const template = document.createElement('template');
      template.innerHTML = source;
      const lines = [];
      const voidTags = new Set([
        'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'
      ]);

      function push(depth, text) {
        lines.push('  '.repeat(Math.max(0, depth)) + text);
      }

      function walk(node, depth) {
        if (!node) return;

        if (node.nodeType === Node.TEXT_NODE) {
          const text = String(node.nodeValue || '').replace(/\s+/g, ' ').trim();
          if (text) push(depth, text);
          return;
        }

        if (node.nodeType !== Node.ELEMENT_NODE) {
          return;
        }

        const tag = node.tagName.toLowerCase();
        const attrs = Array.from(node.attributes || []).map(function mapAttr(attr) {
          const escaped = String(attr.value || '').replace(/"/g, '&quot;');
          return attr.name + '="' + escaped + '"';
        });
        const open = '<' + tag + (attrs.length ? ' ' + attrs.join(' ') : '') + '>';

        if (voidTags.has(tag)) {
          push(depth, open);
          return;
        }

        const children = Array.from(node.childNodes || []).filter(function filterChild(child) {
          if (child.nodeType !== Node.TEXT_NODE) return true;
          return !!String(child.nodeValue || '').replace(/\s+/g, ' ').trim();
        });

        if (children.length === 0) {
          push(depth, open + '</' + tag + '>');
          return;
        }

        if (children.length === 1 && children[0].nodeType === Node.TEXT_NODE) {
          const text = String(children[0].nodeValue || '').replace(/\s+/g, ' ').trim();
          push(depth, open + text + '</' + tag + '>');
          return;
        }

        push(depth, open);
        children.forEach(function eachChild(child) {
          walk(child, depth + 1);
        });
        push(depth, '</' + tag + '>');
      }

      Array.from(template.content.childNodes || []).forEach(function each(node) {
        walk(node, 0);
      });

      return lines.join('\n').trim();
    } catch (error) {
      return source;
    }
  }

  function countLeadingIndentChars(line) {
    let i = 0;
    while (i < line.length && (line[i] === ' ' || line[i] === '\t')) i += 1;
    return i;
  }

  function stripQhtmlQuotedSections(line) {
    let result = '';
    let quote = '';
    let escaped = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (quote) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === '\\') {
          escaped = true;
          continue;
        }
        if (ch === quote) {
          quote = '';
        }
        continue;
      }
      if (ch === '"' || ch === '\'' || ch === '`') {
        quote = ch;
        continue;
      }
      result += ch;
    }
    return result;
  }

  function stripQhtmlCommentsForDepth(line, inBlockComment) {
    const input = String(line || '');
    let out = '';
    let block = !!inBlockComment;
    let i = 0;
    while (i < input.length) {
      const ch = input[i];
      const next = input[i + 1];
      if (block) {
        if (ch === '*' && next === '/') {
          block = false;
          i += 2;
          continue;
        }
        i += 1;
        continue;
      }
      if (ch === '/' && next === '*') {
        block = true;
        i += 2;
        continue;
      }
      if (ch === '/' && next === '/') {
        break;
      }
      out += ch;
      i += 1;
    }
    return { text: out, inBlockComment: block };
  }

  function lineOffsets(lines) {
    const starts = [];
    let pos = 0;
    for (let i = 0; i < lines.length; i += 1) {
      starts.push(pos);
      pos += lines[i].length;
      if (i < lines.length - 1) pos += 1;
    }
    return starts;
  }

  function lineIndexAtOffset(starts, lines, offset) {
    let idx = 0;
    const totalLength = lines.join('\n').length;
    const clamped = Math.max(0, Math.min(offset, totalLength));
    while (idx + 1 < starts.length && starts[idx + 1] <= clamped) idx += 1;
    return idx;
  }

  function formatQhtmlForEditing(source, cursorStart, cursorEnd, protectRadius) {
    const raw = String(source || '').replace(/\r\n/g, '\n');
    if (!raw) {
      return {
        text: '',
        cursorStart: 0,
        cursorEnd: 0,
      };
    }

    const lines = raw.split('\n');
    const oldStarts = lineOffsets(lines);
    const protect = new Set();

    const safeStart = typeof cursorStart === 'number' ? cursorStart : null;
    const safeEnd = typeof cursorEnd === 'number' ? cursorEnd : safeStart;
    const radius = typeof protectRadius === 'number' ? Math.max(0, protectRadius) : 0;

    if (safeStart !== null && safeEnd !== null && lines.length) {
      const startLine = lineIndexAtOffset(oldStarts, lines, safeStart);
      const endLine = lineIndexAtOffset(oldStarts, lines, safeEnd);
      const lo = Math.max(0, Math.min(startLine, endLine) - radius);
      const hi = Math.min(lines.length - 1, Math.max(startLine, endLine) + radius);
      for (let i = lo; i <= hi; i += 1) protect.add(i);
    }

    const newLines = [];
    const oldLeading = [];
    const newLeading = [];
    let depth = 0;
    let inBlockCommentForDepth = false;

    for (let idx = 0; idx < lines.length; idx += 1) {
      const originalLine = lines[idx];
      const trimmed = originalLine.trim();
      const oldLead = countLeadingIndentChars(originalLine);
      oldLeading[idx] = oldLead;

      if (!trimmed) {
        newLines.push('');
        newLeading[idx] = 0;
        continue;
      }

      let leadingClosers = 0;
      while (leadingClosers < trimmed.length && trimmed[leadingClosers] === '}') {
        leadingClosers += 1;
      }
      const targetDepth = Math.max(0, depth - leadingClosers);
      const desiredIndent = '  '.repeat(targetDepth);
      const content = originalLine.slice(oldLead);
      const keepAsTyped = protect.has(idx);
      const formattedLine = keepAsTyped ? originalLine : (desiredIndent + content);

      newLines.push(formattedLine);
      newLeading[idx] = keepAsTyped ? oldLead : desiredIndent.length;

      const analysisQuoted = stripQhtmlQuotedSections(trimmed);
      const analysisResult = stripQhtmlCommentsForDepth(analysisQuoted, inBlockCommentForDepth);
      const analysisLine = analysisResult.text;
      inBlockCommentForDepth = analysisResult.inBlockComment;
      const opens = (analysisLine.match(/\{/g) || []).length;
      const closes = (analysisLine.match(/\}/g) || []).length;
      depth = Math.max(0, depth + opens - closes);
    }

    const text = newLines.join('\n');
    const newStarts = lineOffsets(newLines);

    const mapOffset = (offset) => {
      if (typeof offset !== 'number') return 0;
      const oldTotal = raw.length;
      const clamped = Math.max(0, Math.min(offset, oldTotal));
      const lineIdx = lineIndexAtOffset(oldStarts, lines, clamped);
      const oldLineStart = oldStarts[lineIdx];
      const newLineStart = newStarts[lineIdx];
      const oldLine = lines[lineIdx] || '';
      const newLine = newLines[lineIdx] || '';
      const oldIndent = oldLeading[lineIdx] || 0;
      const newIndent = newLeading[lineIdx] || 0;
      const oldColumn = clamped - oldLineStart;

      let newColumn;
      if (oldColumn <= oldIndent) {
        const deltaFromCodeStart = oldColumn - oldIndent;
        newColumn = Math.max(0, newIndent + deltaFromCodeStart);
      } else {
        newColumn = oldColumn + (newIndent - oldIndent);
      }

      newColumn = Math.max(0, Math.min(newColumn, newLine.length));
      return Math.max(0, Math.min(newLineStart + newColumn, text.length));
    };

    return {
      text: text,
      cursorStart: mapOffset(safeStart),
      cursorEnd: mapOffset(safeEnd),
    };
  }

  function formatQhtml(source) {
    return formatQhtmlForEditing(source, null, null, 0).text.trim();
  }

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function stringifyQDomForDisplay(qdomValue) {
    return JSON.stringify(qdomValue, function qdomDisplayReplacer(key, value) {
      if (QEDITOR_QDOM_DISPLAY_HIDDEN_KEYS.has(key)) {
        return undefined;
      }
      return value;
    });
  }

  function estimateTextareaColumns(textarea) {
    if (!textarea || typeof globalScope.getComputedStyle !== 'function') {
      return 120;
    }
    const style = globalScope.getComputedStyle(textarea);
    const width = Number(textarea.clientWidth) || 0;
    if (width <= 0) {
      return 120;
    }
    const paddingLeft = parseFloat(style.paddingLeft || '0') || 0;
    const paddingRight = parseFloat(style.paddingRight || '0') || 0;
    const availableWidth = Math.max(40, width - paddingLeft - paddingRight);
    const fontSize = parseFloat(style.fontSize || '14') || 14;
    const averageGlyphWidth = Math.max(5, fontSize * 0.62);
    return Math.max(24, Math.floor(availableWidth / averageGlyphWidth));
  }

  function wrapLineWithHangingIndent(line, maxColumns, indentText) {
    const sourceLine = String(line || '');
    const width = Math.max(24, Number(maxColumns) || 120);
    const indent = String(indentText || '');
    if (sourceLine.length <= width) return sourceLine;

    const chunks = [];
    let remaining = sourceLine;
    let first = true;
    while (remaining.length > 0) {
      const chunkWidth = first ? width : Math.max(12, width - indent.length);
      if (remaining.length <= chunkWidth) {
        chunks.push((first ? '' : indent) + remaining);
        break;
      }
      let breakAt = remaining.lastIndexOf(' ', chunkWidth);
      if (breakAt <= 0) {
        breakAt = chunkWidth;
      }
      const piece = remaining.slice(0, breakAt);
      chunks.push((first ? '' : indent) + piece);
      remaining = remaining.slice(breakAt);
      if (remaining[0] === ' ') {
        remaining = remaining.slice(1);
      }
      first = false;
    }
    return chunks.join('\n');
  }

  function wrapQDomTextForTextarea(textarea, text) {
    const rawText = String(text || '');
    if (!rawText) return rawText;
    const columns = estimateTextareaColumns(textarea);
    return rawText
      .split('\n')
      .map(function wrapLine(line) {
        return wrapLineWithHangingIndent(line, columns, QEDITOR_QDOM_WRAP_INDENT);
      })
      .join('\n');
  }

  function wrapToken(className, value) {
    const safe = escapeHtml(value);
    if (!className) return safe;
    return '<span class="' + className + '">' + safe + '</span>';
  }

  function collectComponentNames(source) {
    const text = String(source || '');
    const names = new Set();
    const re = /\bq-component\s+([A-Za-z][A-Za-z0-9_-]*)\b/g;
    let match;
    while ((match = re.exec(text))) {
      names.add(String(match[1] || '').toLowerCase());
    }
    return names;
  }

  function collectSlotNames(source) {
    const text = String(source || '');
    const names = new Set();
    const re = /\bslot\s*\{\s*([A-Za-z_][A-Za-z0-9_-]*)\s*\}/g;
    let match;
    while ((match = re.exec(text))) {
      names.add(String(match[1] || '').toLowerCase());
    }
    return names;
  }

  function normalizeSemanticIdentifier(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(text)) return '';
    return text.toLowerCase();
  }

  function addSemanticIdentifier(set, value) {
    if (!(set instanceof Set)) return;
    const normalized = normalizeSemanticIdentifier(value);
    if (!normalized) return;
    set.add(normalized);
  }

  function buildCodeMask(source) {
    const text = String(source || '');
    const mask = new Uint8Array(text.length);
    let inSingle = false;
    let inDouble = false;
    let inBacktick = false;
    let inLineComment = false;
    let inBlockComment = false;
    let escaped = false;

    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      const next = text[i + 1];

      if (inLineComment) {
        if (ch === '\n' || ch === '\r') {
          inLineComment = false;
          mask[i] = 1;
        }
        continue;
      }
      if (inBlockComment) {
        if (ch === '*' && next === '/') {
          i += 1;
          inBlockComment = false;
        }
        continue;
      }
      if (inSingle) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === '\\') {
          escaped = true;
          continue;
        }
        if (ch === '\'') {
          inSingle = false;
        }
        continue;
      }
      if (inDouble) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === '\\') {
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
        if (ch === '\\') {
          escaped = true;
          continue;
        }
        if (ch === '`') {
          inBacktick = false;
        }
        continue;
      }

      if (ch === '/' && next === '/') {
        inLineComment = true;
        i += 1;
        continue;
      }
      if (ch === '/' && next === '*') {
        inBlockComment = true;
        i += 1;
        continue;
      }
      if (ch === '\'') {
        inSingle = true;
        continue;
      }
      if (ch === '"') {
        inDouble = true;
        continue;
      }
      if (ch === '`') {
        inBacktick = true;
        continue;
      }

      mask[i] = 1;
    }

    return mask;
  }

  function isCodeRange(mask, from, to) {
    if (!(mask instanceof Uint8Array)) return true;
    const start = Math.max(0, Number(from) || 0);
    const end = Math.max(start, Number(to) || start);
    for (let i = start; i < end; i += 1) {
      if (mask[i] !== 1) return false;
    }
    return true;
  }

  function collectDotOrHashRanges(source, mask, markerChar, includeMarker) {
    const text = String(source || '');
    const out = [];
    const marker = String(markerChar || '.');
    const includePrefix = includeMarker === true;
    const re = new RegExp('\\' + marker + '([A-Za-z_][A-Za-z0-9_-]*)', 'g');
    let match;
    while ((match = re.exec(text))) {
      const name = String(match[1] || '');
      if (!name) continue;
      const nameFrom = match.index + 1;
      const from = includePrefix ? match.index : nameFrom;
      const to = nameFrom + name.length;
      if (!isCodeRange(mask, match.index, to)) continue;
      out.push({ from: from, to: to, name: name.toLowerCase() });
    }
    return out;
  }

  function collectAttrValueNameRanges(source, attrName) {
    const text = String(source || '');
    const name = String(attrName || '').trim().toLowerCase();
    if (!name) return [];
    const out = [];
    const re = new RegExp('\\b' + name + '\\s*:\\s*(["\'])([\\s\\S]*?)\\1', 'gi');
    let match;
    while ((match = re.exec(text))) {
      const value = String(match[2] || '');
      const valueStart = re.lastIndex - value.length - 1;
      if (name === 'class') {
        const tokenRe = /[A-Za-z_][A-Za-z0-9_-]*/g;
        let tokenMatch;
        while ((tokenMatch = tokenRe.exec(value))) {
          const from = valueStart + tokenMatch.index;
          const token = String(tokenMatch[0] || '');
          out.push({ from: from, to: from + token.length, name: token.toLowerCase() });
        }
      } else {
        const trimmed = value.trim();
        if (trimmed && /^[A-Za-z_][A-Za-z0-9_-]*$/.test(trimmed)) {
          const innerIndex = value.indexOf(trimmed);
          const from = valueStart + Math.max(0, innerIndex);
          out.push({ from: from, to: from + trimmed.length, name: trimmed.toLowerCase() });
        }
      }
    }
    return out;
  }

  function collectKeywordAliasNames(source) {
    const text = String(source || '');
    const aliases = new Set();
    const canonical = new Set(QHTML_CANONICAL_KEYWORDS.map(function mapKeyword(name) {
      return String(name || '').toLowerCase();
    }));
    const re = /\bq-keyword\s+([A-Za-z_][A-Za-z0-9_-]*)\s*\{\s*([A-Za-z_][A-Za-z0-9_-]*)\s*\}/gi;
    let match;
    while ((match = re.exec(text))) {
      const left = normalizeSemanticIdentifier(match[1]);
      const right = normalizeSemanticIdentifier(match[2]);
      if (!left || !right) continue;
      if (canonical.has(left) && !canonical.has(right)) {
        aliases.add(right);
      } else if (canonical.has(right) && !canonical.has(left)) {
        aliases.add(left);
      } else if (!canonical.has(left)) {
        aliases.add(left);
      }
    }
    return aliases;
  }

  function collectCanonicalAliasNames(source, canonicalKeyword) {
    const text = String(source || '');
    const canonical = normalizeSemanticIdentifier(canonicalKeyword);
    const names = new Set();
    if (!canonical) return names;
    names.add(canonical);
    const re = /\bq-keyword\s+([A-Za-z_][A-Za-z0-9_-]*)\s*\{\s*([A-Za-z_][A-Za-z0-9_-]*)\s*\}/gi;
    let match;
    while ((match = re.exec(text))) {
      const left = normalizeSemanticIdentifier(match[1]);
      const right = normalizeSemanticIdentifier(match[2]);
      if (!left || !right) continue;
      if (left === canonical) {
        names.add(right);
      } else if (right === canonical) {
        names.add(left);
      }
    }
    return names;
  }

  function collectScriptBodyRanges(source, mask, scriptKeywordNames) {
    const text = String(source || '');
    const out = [];
    const scriptNames = scriptKeywordNames instanceof Set ? scriptKeywordNames : new Set(['q-bind', 'q-script']);
    let i = 0;
    while (i < text.length) {
      const ch = text[i];
      if (!isIdentStart(ch)) {
        i += 1;
        continue;
      }
      let j = i + 1;
      while (j < text.length && isIdentChar(text[j])) j += 1;
      const name = text.slice(i, j).toLowerCase();
      if (!scriptNames.has(name) || !isCodeRange(mask, i, j)) {
        i = j;
        continue;
      }
      const ws = skipWhitespaceInText(text, j);
      if (text[ws] !== '{') {
        i = j;
        continue;
      }
      const balanced = readBalancedBrace(text, ws);
      if (!balanced) {
        i = j;
        continue;
      }
      const innerFrom = balanced.start + 1;
      const innerTo = balanced.end;
      if (innerTo > innerFrom && isCodeRange(mask, innerFrom, innerTo)) {
        out.push({ from: innerFrom, to: innerTo });
      }
      i = balanced.end + 1;
    }
    return out;
  }

  function collectPunctuationRanges(source, mask) {
    const text = String(source || '');
    const out = [];
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (!QHTML_PUNCTUATION_CHARS.has(ch)) continue;
      if (!isCodeRange(mask, i, i + 1)) continue;
      out.push({ from: i, to: i + 1 });
    }
    return out;
  }

  function collectCommentRanges(source) {
    const text = String(source || '');
    const out = [];
    let inSingle = false;
    let inDouble = false;
    let inBacktick = false;
    let inLineComment = false;
    let inBlockComment = false;
    let escaped = false;
    let commentStart = -1;

    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      const next = text[i + 1];

      if (inLineComment) {
        if (ch === '\n' || ch === '\r') {
          out.push({ from: commentStart, to: i });
          inLineComment = false;
          commentStart = -1;
        }
        continue;
      }
      if (inBlockComment) {
        if (ch === '*' && next === '/') {
          out.push({ from: commentStart, to: i + 2 });
          inBlockComment = false;
          commentStart = -1;
          i += 1;
        }
        continue;
      }
      if (inSingle) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === '\\') {
          escaped = true;
          continue;
        }
        if (ch === '\'') {
          inSingle = false;
        }
        continue;
      }
      if (inDouble) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === '\\') {
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
        if (ch === '\\') {
          escaped = true;
          continue;
        }
        if (ch === '`') {
          inBacktick = false;
        }
        continue;
      }

      if (ch === '/' && next === '/') {
        inLineComment = true;
        commentStart = i;
        i += 1;
        continue;
      }
      if (ch === '/' && next === '*') {
        inBlockComment = true;
        commentStart = i;
        i += 1;
        continue;
      }
      if (ch === '\'') {
        inSingle = true;
        continue;
      }
      if (ch === '"') {
        inDouble = true;
        continue;
      }
      if (ch === '`') {
        inBacktick = true;
      }
    }

    if ((inLineComment || inBlockComment) && commentStart >= 0) {
      out.push({ from: commentStart, to: text.length });
    }
    return out;
  }

  function skipWhitespaceInText(text, index) {
    let i = Math.max(0, Number(index) || 0);
    while (i < text.length && /\s/.test(text[i])) i += 1;
    return i;
  }

  function collectSemanticIdentifiersFromQDom(source) {
    const names = new Set();
    const componentNames = new Set();
    const tagNames = new Set();
    const keywords = new Set(QHTML_CANONICAL_KEYWORDS.map(function mapKeyword(name) {
      return String(name || '').toLowerCase();
    }));
    const modules = getQHtmlModules();
    if (!modules || !modules.qhtmlParser) {
      return { names: names, componentNames: componentNames, tagNames: tagNames, keywords: keywords };
    }

    try {
      const qdom = modules.qhtmlParser.parseQHtmlToQDom(String(source || ''), {
        resolveImportsBeforeParse: false
      });
      const core = modules.qdomCore || null;
      const walk = core && typeof core.walkQDom === 'function'
        ? function walkQDomTree(callback) {
            core.walkQDom(qdom, callback);
          }
        : function walkGeneric(callback) {
            const stack = [qdom];
            const seen = new Set();
            while (stack.length > 0) {
              const node = stack.pop();
              if (!node || typeof node !== 'object') continue;
              if (seen.has(node)) continue;
              seen.add(node);
              callback(node);
              const keys = Object.keys(node);
              for (let i = 0; i < keys.length; i += 1) {
                const value = node[keys[i]];
                if (value && typeof value === 'object') {
                  stack.push(value);
                }
              }
            }
          };

      walk(function visitNode(node) {
        if (!node || typeof node !== 'object') return;
        const kind = String(node.kind || '').toLowerCase();
        if (kind === 'component') {
          addSemanticIdentifier(names, node.componentId);
          addSemanticIdentifier(componentNames, node.componentId);
          const defType = String(node.definitionType || '').toLowerCase();
          if (defType === 'template' || defType === 'signal') {
            addSemanticIdentifier(names, node.componentId);
          }
          if (Array.isArray(node.properties)) {
            node.properties.forEach(function eachPropertyName(name) {
              addSemanticIdentifier(names, name);
            });
          }
          if (Array.isArray(node.methods)) {
            node.methods.forEach(function eachMethod(method) {
              addSemanticIdentifier(names, method && method.name);
            });
          }
          if (Array.isArray(node.signalDeclarations)) {
            node.signalDeclarations.forEach(function eachSignal(signal) {
              addSemanticIdentifier(names, signal && signal.name);
            });
          }
          if (Array.isArray(node.aliasDeclarations)) {
            node.aliasDeclarations.forEach(function eachAlias(alias) {
              addSemanticIdentifier(names, alias && alias.name);
            });
          }
          if (Array.isArray(node.propertyDefinitions)) {
            node.propertyDefinitions.forEach(function eachDef(def) {
              addSemanticIdentifier(names, def && def.name);
            });
          }
        }
        if (kind === 'component-instance' || kind === 'template-instance') {
          addSemanticIdentifier(names, node.componentId || node.tagName);
          addSemanticIdentifier(componentNames, node.componentId || node.tagName);
        }
        if (kind === 'slot') {
          addSemanticIdentifier(names, node.name);
        }
        if (kind === 'element') {
          const tag = normalizeSemanticIdentifier(node.tagName);
          if (tag) {
            if (HTML_TAGS.has(tag)) {
              addSemanticIdentifier(tagNames, tag);
            } else {
              addSemanticIdentifier(names, tag);
            }
          }
        }
        if (node.keywords && typeof node.keywords === 'object') {
          const keys = Object.keys(node.keywords);
          for (let i = 0; i < keys.length; i += 1) {
            const mapped = normalizeSemanticIdentifier(node.keywords[keys[i]]);
            if (mapped && keywords.has(mapped)) {
              addSemanticIdentifier(keywords, mapped);
            }
          }
        }
      });
    } catch (error) {
      // ignore parser errors for incomplete source while typing
    }

    const fallbackRe = /\b(?:q-component|component|q-template|template|q-macro|macro|q-rewrite|rewrite|q-signal|signal)\s+([A-Za-z_][A-Za-z0-9_-]*)\b/gi;
    let fallbackMatch;
    while ((fallbackMatch = fallbackRe.exec(String(source || '')))) {
      addSemanticIdentifier(names, fallbackMatch[1]);
      addSemanticIdentifier(componentNames, fallbackMatch[1]);
    }
    const symbolRe = /\b(?:q-property|property|function)\s+([A-Za-z_][A-Za-z0-9_-]*)\b/gi;
    while ((fallbackMatch = symbolRe.exec(String(source || '')))) {
      addSemanticIdentifier(names, fallbackMatch[1]);
    }

    return { names: names, componentNames: componentNames, tagNames: tagNames, keywords: keywords };
  }

  function collectIdentifierRangesByName(source, mask, lowerName) {
    const text = String(source || '');
    const needle = String(lowerName || '').toLowerCase();
    if (!needle) return [];
    const out = [];
    const lowered = text.toLowerCase();
    let idx = 0;
    while ((idx = lowered.indexOf(needle, idx)) !== -1) {
      const from = idx;
      const to = idx + needle.length;
      const before = from > 0 ? text[from - 1] : '';
      const after = to < text.length ? text[to] : '';
      const beforeOk = !before || !isIdentChar(before);
      const afterOk = !after || !isIdentChar(after);
      if (beforeOk && afterOk && isCodeRange(mask, from, to)) {
        out.push({ from: from, to: to, name: needle });
      }
      idx = to;
    }
    return out;
  }

  function isIdentStart(ch) {
    return !!ch && /[A-Za-z_]/.test(ch);
  }

  function isIdentChar(ch) {
    return !!ch && /[A-Za-z0-9_-]/.test(ch);
  }

  function nextNonWhitespaceChar(text, fromIndex) {
    let idx = Number(fromIndex) || 0;
    while (idx < text.length && /\s/.test(text[idx])) idx += 1;
    return idx < text.length ? text[idx] : '';
  }

  function readBalancedBrace(text, openIndex) {
    if (text[openIndex] !== '{') return null;
    let depth = 0;
    let inSingle = false;
    let inDouble = false;
    let inBacktick = false;
    let inLineComment = false;
    let inBlockComment = false;
    let escaped = false;

    for (let i = openIndex; i < text.length; i += 1) {
      const ch = text[i];
      const next = text[i + 1];

      if (inLineComment) {
        if (ch === '\n' || ch === '\r') inLineComment = false;
        continue;
      }
      if (inBlockComment) {
        if (ch === '*' && next === '/') {
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
        if (ch === '\\') {
          escaped = true;
          continue;
        }
        if (ch === '\'') inSingle = false;
        continue;
      }
      if (inDouble) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === '\\') {
          escaped = true;
          continue;
        }
        if (ch === '"') inDouble = false;
        continue;
      }
      if (inBacktick) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === '\\') {
          escaped = true;
          continue;
        }
        if (ch === '`') inBacktick = false;
        continue;
      }

      if (ch === '/' && next === '/') {
        inLineComment = true;
        i += 1;
        continue;
      }
      if (ch === '/' && next === '*') {
        inBlockComment = true;
        i += 1;
        continue;
      }
      if (ch === '\'') {
        inSingle = true;
        continue;
      }
      if (ch === '"') {
        inDouble = true;
        continue;
      }
      if (ch === '`') {
        inBacktick = true;
        continue;
      }

      if (ch === '{') {
        depth += 1;
        continue;
      }
      if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          return {
            start: openIndex,
            end: i,
            inner: text.slice(openIndex + 1, i),
          };
        }
        if (depth < 0) {
          return null;
        }
      }
    }
    return null;
  }

  function highlightSlotBody(text) {
    const source = String(text || '');
    let out = '';
    let i = 0;
    while (i < source.length) {
      const ch = source[i];
      if (isIdentStart(ch)) {
        let j = i + 1;
        while (j < source.length && isIdentChar(source[j])) j += 1;
        out += wrapToken('qe-tok-slotname', source.slice(i, j));
        i = j;
        continue;
      }
      out += wrapToken('qe-tok-slotbody', ch);
      i += 1;
    }
    return out;
  }

  function highlightQHtmlCode(source, componentNames) {
    const text = String(source || '');
    if (!text) return '';

    const components = componentNames instanceof Set ? componentNames : collectComponentNames(text);
    const slotNames = collectSlotNames(text);
    let out = '';
    let i = 0;
    let pendingBlockKeyword = '';

    while (i < text.length) {
      const ch = text[i];

      if (ch === '/' && text[i + 1] === '*') {
        const end = text.indexOf('*/', i + 2);
        if (end === -1) {
          out += wrapToken('qe-tok-comment', text.slice(i));
          break;
        }
        out += wrapToken('qe-tok-comment', text.slice(i, end + 2));
        i = end + 2;
        continue;
      }

      if (ch === '/' && text[i + 1] === '/') {
        const end = text.indexOf('\n', i);
        if (end === -1) {
          out += wrapToken('qe-tok-comment', text.slice(i));
          break;
        }
        out += wrapToken('qe-tok-comment', text.slice(i, end));
        i = end;
        continue;
      }

      if (ch === '"' || ch === '\'' || ch === '`') {
        const quote = ch;
        let j = i + 1;
        let escaped = false;
        while (j < text.length) {
          const c = text[j];
          if (escaped) {
            escaped = false;
          } else if (c === '\\') {
            escaped = true;
          } else if (c === quote) {
            j += 1;
            break;
          }
          j += 1;
        }
        out += wrapToken('qe-tok-string', text.slice(i, j));
        i = j;
        continue;
      }

      if (ch === '.' && isIdentStart(text[i + 1])) {
        let j = i + 2;
        while (j < text.length && isIdentChar(text[j])) j += 1;
        out += wrapToken('qe-tok-punc', '.');
        out += wrapToken('qe-tok-class', text.slice(i + 1, j));
        i = j;
        continue;
      }

      if (ch === '{') {
        out += wrapToken('qe-tok-brace', ch);

        if (pendingBlockKeyword === 'text' || pendingBlockKeyword === 'html' || pendingBlockKeyword === 'slot') {
          const balanced = readBalancedBrace(text, i);
          if (balanced) {
            let innerHtml = '';
            if (pendingBlockKeyword === 'text') {
              innerHtml = wrapToken('qe-tok-textbody', balanced.inner);
            } else if (pendingBlockKeyword === 'html') {
              innerHtml = wrapToken('qe-tok-htmlbody', balanced.inner);
            } else {
              innerHtml = highlightSlotBody(balanced.inner);
            }
            out += innerHtml;
            out += wrapToken('qe-tok-brace', '}');
            i = balanced.end + 1;
            pendingBlockKeyword = '';
            continue;
          }
        }

        i += 1;
        continue;
      }

      if (ch === '}') {
        out += wrapToken('qe-tok-brace', ch);
        pendingBlockKeyword = '';
        i += 1;
        continue;
      }

      if (ch === ':' || ch === ';' || ch === ',' || ch === '(' || ch === ')') {
        out += wrapToken('qe-tok-punc', ch);
        i += 1;
        continue;
      }

      if (isIdentStart(ch)) {
        let j = i + 1;
        while (j < text.length && isIdentChar(text[j])) j += 1;
        const token = text.slice(i, j);
        const lower = token.toLowerCase();
        const nextChar = nextNonWhitespaceChar(text, j);

        let cls = '';
        if (lower === 'q-component' || lower === 'q-template') {
          cls = 'qe-tok-qkw';
        } else if (lower === 'text' || lower === 'html' || lower === 'slot') {
          cls = 'qe-tok-flowkw';
          if (nextChar === '{') pendingBlockKeyword = lower;
        } else if (lower === 'return') {
          cls = 'qe-tok-jskw';
        } else if (components.has(lower)) {
          cls = 'qe-tok-component';
        } else if (slotNames.has(lower) && nextChar === '{') {
          cls = 'qe-tok-slotname';
        } else if (HTML_TAGS.has(lower)) {
          cls = 'qe-tok-tag';
        }

        out += wrapToken(cls, token);
        i = j;
        continue;
      }

      if (!/\S/.test(ch)) {
        out += escapeHtml(ch);
        i += 1;
        continue;
      }

      out += escapeHtml(ch);
      i += 1;
    }

    return out;
  }

  function highlightClassValue(value) {
    const text = String(value || '');
    let out = '';
    let i = 0;
    while (i < text.length) {
      const ch = text[i];
      if (/\s/.test(ch)) {
        out += escapeHtml(ch);
        i += 1;
        continue;
      }
      let j = i + 1;
      while (j < text.length && !/\s/.test(text[j])) j += 1;
      out += wrapToken('qe-tok-class', text.slice(i, j));
      i = j;
    }
    return out;
  }

  function highlightHtmlAttributes(attrsRaw) {
    const attrs = String(attrsRaw || '');
    let out = '';
    let i = 0;

    while (i < attrs.length) {
      const ch = attrs[i];
      if (/\s/.test(ch)) {
        out += escapeHtml(ch);
        i += 1;
        continue;
      }
      if (ch === '/' || ch === '>') {
        out += wrapToken('qe-tok-angle', ch);
        i += 1;
        continue;
      }

      let j = i;
      while (j < attrs.length && /[^\s=/>]/.test(attrs[j])) j += 1;
      const attrName = attrs.slice(i, j);
      out += wrapToken('qe-tok-attr', attrName);
      i = j;

      while (i < attrs.length && /\s/.test(attrs[i])) {
        out += escapeHtml(attrs[i]);
        i += 1;
      }

      if (attrs[i] !== '=') {
        continue;
      }

      out += wrapToken('qe-tok-punc', '=');
      i += 1;
      while (i < attrs.length && /\s/.test(attrs[i])) {
        out += escapeHtml(attrs[i]);
        i += 1;
      }

      if (i >= attrs.length) break;

      if (attrs[i] === '"' || attrs[i] === '\'') {
        const quote = attrs[i];
        let k = i + 1;
        let escaped = false;
        while (k < attrs.length) {
          const c = attrs[k];
          if (escaped) {
            escaped = false;
          } else if (c === '\\') {
            escaped = true;
          } else if (c === quote) {
            break;
          }
          k += 1;
        }
        const content = attrs.slice(i + 1, Math.min(k, attrs.length));
        out += wrapToken('qe-tok-string', quote);
        if (String(attrName || '').toLowerCase() === 'class') {
          out += highlightClassValue(content);
        } else {
          out += wrapToken('qe-tok-string', content);
        }
        if (k < attrs.length && attrs[k] === quote) {
          out += wrapToken('qe-tok-string', quote);
          i = k + 1;
        } else {
          i = k;
        }
        continue;
      }

      let k = i;
      while (k < attrs.length && /[^\s>]/.test(attrs[k])) k += 1;
      out += wrapToken('qe-tok-string', attrs.slice(i, k));
      i = k;
    }

    return out;
  }

  function highlightHtmlTag(tagRaw, componentNames) {
    const raw = String(tagRaw || '');
    const components = componentNames instanceof Set ? componentNames : new Set();
    const match = raw.match(/^<\s*(\/?)\s*([A-Za-z][A-Za-z0-9:_-]*)([\s\S]*?)(\/?)\s*>$/);
    if (!match) {
      return escapeHtml(raw);
    }

    const isClosing = !!match[1];
    const tagName = String(match[2] || '');
    const attrsRaw = String(match[3] || '');
    const isSelfClosing = !!match[4];
    const lower = tagName.toLowerCase();
    const tagClass = components.has(lower) ? 'qe-tok-component' : 'qe-tok-tag';

    let out = '';
    out += wrapToken('qe-tok-angle', '<' + (isClosing ? '/' : ''));
    out += wrapToken(tagClass, tagName);
    if (!isClosing && attrsRaw) {
      out += highlightHtmlAttributes(attrsRaw);
    }
    if (!isClosing && isSelfClosing) {
      out += wrapToken('qe-tok-angle', '/');
    }
    out += wrapToken('qe-tok-angle', '>');
    return out;
  }

  function highlightHtmlCode(source, componentNames) {
    const text = String(source || '');
    if (!text) return '';

    const components = componentNames instanceof Set ? componentNames : new Set();
    let out = '';
    const tokenRe = /<!--[\s\S]*?-->|<\/?[A-Za-z][^>]*>|[^<]+/g;
    let match;

    while ((match = tokenRe.exec(text))) {
      const chunk = match[0];
      if (!chunk) continue;
      if (chunk.startsWith('<!--')) {
        out += wrapToken('qe-tok-comment', chunk);
        continue;
      }
      if (chunk[0] === '<') {
        out += highlightHtmlTag(chunk, components);
        continue;
      }
      out += wrapToken('qe-tok-htmltext', chunk);
    }

    return out;
  }

  function decodeJsonStringToken(token) {
    try {
      return JSON.parse(token);
    } catch (error) {
      return String(token || '').slice(1, -1);
    }
  }

  function highlightQdomJson(source, componentNames) {
    const text = String(source || '');
    if (!text) return '';

    const components = componentNames instanceof Set ? componentNames : new Set();
    let out = '';
    let i = 0;

    while (i < text.length) {
      const ch = text[i];

      if (ch === '"') {
        let j = i + 1;
        let escaped = false;
        while (j < text.length) {
          const c = text[j];
          if (escaped) {
            escaped = false;
          } else if (c === '\\') {
            escaped = true;
          } else if (c === '"') {
            j += 1;
            break;
          }
          j += 1;
        }

        const token = text.slice(i, j);
        let k = j;
        while (k < text.length && /\s/.test(text[k])) k += 1;
        const isKey = text[k] === ':';
        if (isKey) {
          out += wrapToken('qe-tok-qkey', token);
        } else {
          const value = String(decodeJsonStringToken(token) || '').toLowerCase();
          out += wrapToken(components.has(value) ? 'qe-tok-component' : 'qe-tok-string', token);
        }
        i = j;
        continue;
      }

      if (ch === '{' || ch === '}' || ch === '[' || ch === ']') {
        out += wrapToken('qe-tok-brace', ch);
        i += 1;
        continue;
      }

      if (ch === ':' || ch === ',') {
        out += wrapToken('qe-tok-punc', ch);
        i += 1;
        continue;
      }

      if (text.startsWith('true', i) || text.startsWith('false', i)) {
        const token = text.startsWith('true', i) ? 'true' : 'false';
        out += wrapToken('qe-tok-bool', token);
        i += token.length;
        continue;
      }

      if (text.startsWith('null', i)) {
        out += wrapToken('qe-tok-null', 'null');
        i += 4;
        continue;
      }

      if (ch === '-' || /[0-9]/.test(ch)) {
        let j = i + 1;
        while (j < text.length && /[0-9eE+\-.]/.test(text[j])) j += 1;
        out += wrapToken('qe-tok-number', text.slice(i, j));
        i = j;
        continue;
      }

      out += escapeHtml(ch);
      i += 1;
    }

    return out;
  }

  async function createQDomAdapter(source, options) {
    const modules = getQHtmlModules();
    if (!modules) {
      throw new Error('QHtml modules are not loaded yet.');
    }

    const parser = modules.qhtmlParser;
    const renderer = modules.domRenderer;
    const core = modules.qdomCore;
    const rawSource = String(source || '');
    const baseUrl = options && typeof options.baseUrl === 'string' ? options.baseUrl : resolveImportBaseUrl();
    const resolvedSource = await resolveImports(rawSource, parser, baseUrl);
    const qdom = parser.parseQHtmlToQDom(resolvedSource, {
      resolveImportsBeforeParse: false,
    });
    const renderHost = function renderHost(targetDocument) {
      const doc = targetDocument || document;
      const host = doc.createElement('div');
      renderer.renderIntoElement(qdom, host, doc, { disableLifecycleHooks: true });
      return { doc: doc, host: host };
    };

    return {
      source: rawSource,
      resolvedSource: resolvedSource,
      qdom: qdom,
      toHTMLDom: function toHTMLDom(targetDocument) {
        const rendered = renderHost(targetDocument);
        const doc = rendered.doc;
        const host = rendered.host;
        const fragment = doc.createDocumentFragment();
        while (host.firstChild) {
          fragment.appendChild(host.firstChild);
        }
        return fragment;
      },
      toHTML: function toHTML(targetDocument) {
        return renderHost(targetDocument).host.innerHTML;
      },
      serialize: function serialize() {
        return core.serializeQDomCompressed(qdom);
      },
      deserialize: function deserialize(payload) {
        return core.deserializeQDomCompressed(payload);
      }
    };
  }

  class QEditor extends HTMLElement {
    constructor() {
      super();
      this._mounted = false;
      this._mountTimer = null;
      this._pendingMountListener = null;
      this._activeTab = 'qhtml';
      this._source = '';
      this._htmlOutput = '';
      this._qdomDecoded = '';
      this._qdomSerialized = '';
      this._adapter = null;
      this._componentNames = new Set();
      this._renderVersion = 0;
      this._renderTimer = null;
      this._formatTimer = null;
      this._isApplyingFormat = false;
      this._previewListeners = [];
      this._previewQHtmlNode = null;
      this._previewMountBinding = null;
      this._cmView = null;
      this._cmHost = null;
      this._cmLoadError = null;
      this._semanticCacheSource = null;
      this._semanticCacheModel = null;
    }

    connectedCallback() {
      if (this._mounted) return;
      this._mounted = true;

      const doMount = () => {
        if (!this.isConnected) return;
        this._clearPendingMount();

        const initialFromAttr = this.getAttribute('initial-qhtml');
        const initialFromBody = readInlineSourceFromElement(this);
        const initialSource = initialFromAttr != null ? String(initialFromAttr) : initialFromBody;

        this.textContent = '';
        this._renderShell();
        this._cacheNodes();
        this._bindEvents();
        this._setTab('qhtml');
        this.setQhtmlSource(initialSource);
        this._initializeCodeMirror();
      };

      if (document.readyState === 'loading' && !this.hasAttribute('initial-qhtml')) {
        this._pendingMountListener = () => {
          this._pendingMountListener = null;
          doMount();
        };
        document.addEventListener('DOMContentLoaded', this._pendingMountListener, { once: true });
        return;
      }

      this._mountTimer = setTimeout(() => {
        this._mountTimer = null;
        doMount();
      }, 0);
    }

    disconnectedCallback() {
      this._mounted = false;
      this._clearPendingMount();
      this._clearTimer('_renderTimer');
      this._clearTimer('_formatTimer');
      this._detachPreviewListeners();
      this._unmountPreviewQHtml();
      this._destroyCodeMirror();
    }

    setQhtmlSource(source) {
      const normalized = String(source || '').replace(/\r\n/g, '\n');
      this._source = formatQhtml(normalized);
      this._semanticCacheSource = null;
      this._semanticCacheModel = null;
      if (this._cmView && this._cmView.state && this._cmView.state.doc) {
        const currentDoc = this._cmView.state.doc.toString();
        if (currentDoc !== this._source) {
          const nextCursor = Math.min(this._source.length, this._cmView.state.selection.main.head);
          this._isApplyingFormat = true;
          this._cmView.dispatch({
            changes: { from: 0, to: currentDoc.length, insert: this._source },
            selection: { anchor: nextCursor, head: nextCursor }
          });
          this._isApplyingFormat = false;
        }
      }
      if (this._qhtmlInput) {
        this._qhtmlInput.value = this._source;
      }
      this._refreshQhtmlHighlight();
      this._syncQhtmlScroll();
      this._scheduleRender(0);
    }

    getQhtmlSource() {
      return this._source;
    }

    _clearTimer(timerKey) {
      if (!this[timerKey]) {
        return;
      }
      clearTimeout(this[timerKey]);
      this[timerKey] = null;
    }

    _clearPendingMount() {
      this._clearTimer('_mountTimer');
      if (this._pendingMountListener) {
        document.removeEventListener('DOMContentLoaded', this._pendingMountListener);
        this._pendingMountListener = null;
      }
    }

    _scheduleTimer(timerKey, delayMs, callback) {
      if (!this.isConnected) return;
      this._clearTimer(timerKey);
      this[timerKey] = setTimeout(() => {
        this[timerKey] = null;
        callback();
      }, Math.max(0, Number(delayMs) || 0));
    }

    _renderShell() {
      this.innerHTML = '' +
        '<style>' +
          'q-editor{display:block;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;--qe-bg:#0f1220;--qe-fg:#dbeafe;--qe-qkw:#ff7ab2;--qe-tag:#82aaff;--qe-class:#8be9fd;--qe-flowkw:#f1fa8c;--qe-textbody:#ffd6a5;--qe-htmlbody:#ffb86c;--qe-slotname:#7ee787;--qe-slotbody:#a5d6ff;--qe-component:#c792ea;--qe-attr:#9cdcfe;--qe-comment:#5c6370;--qe-string:#ce9178;--qe-number:#b5cea8;--qe-bool:#4ec9b0;--qe-null:#c586c0;--qe-qkey:#9cdcfe;--qe-htmltext:#c9d1d9;--qe-jskw:#f97583;}' +
          'q-editor .qe{border:1px solid #dbe2ea;border-radius:12px;overflow:hidden;background:#fff}' +
          'q-editor .qe-tabs{display:flex;flex-wrap:wrap;gap:6px;padding:8px;background:#f8fafc;border-bottom:1px solid #e2e8f0}' +
          'q-editor .qe-tab{appearance:none;border:0;background:transparent;padding:.45rem .7rem;border-radius:8px;cursor:pointer;font-size:.82rem;color:#334155}' +
          'q-editor .qe-tab[aria-selected="true"]{background:#fff;color:#0f172a;box-shadow:0 1px 0 #e5e7eb inset,0 -1px 0 #fff inset}' +
          'q-editor .qe-actions{margin-left:auto;display:flex;gap:.4rem}' +
          'q-editor .qe-btn{appearance:none;border:1px solid #cbd5e1;background:#fff;color:#0f172a;padding:.4rem .65rem;border-radius:8px;cursor:pointer;font-size:.75rem}' +
          'q-editor .qe-panel{display:none;position:relative}' +
          'q-editor .qe-panel[data-active="true"]{display:block}' +
          'q-editor .qe-copy{position:absolute;top:.6rem;right:.6rem;z-index:2;appearance:none;border:0;background:#111827;color:#fff;padding:.35rem .55rem;border-radius:8px;cursor:pointer;font-size:.66rem}' +
          'q-editor .qe-editor-wrap{display:grid;min-height:20rem;background:var(--qe-bg)}' +
          'q-editor .qe-editor-wrap>*{grid-area:1 / 1}' +
          'q-editor .qe-cm-host{display:none;min-height:20rem;overflow:hidden}' +
          'q-editor .qe-cm-host[data-active="true"]{display:block}' +
          'q-editor .qe-cm-host .cm-editor{height:100%;min-height:20rem;background:var(--qe-bg);color:var(--qe-fg)}' +
          'q-editor .qe-cm-host .cm-scroller{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;line-height:1.45}' +
          'q-editor .qe-cm-host .cm-gutters{background:#0b1328;border-right:1px solid #24314a;color:#8b9ab8}' +
          'q-editor .qe-cm-host .cm-content,.qe-cm-host .cm-line{caret-color:#f8fafc}' +
          'q-editor .qe-cm-host .cm-activeLine{background:rgba(130,170,255,.10)}' +
          'q-editor .qe-cm-host .cm-activeLineGutter{background:rgba(130,170,255,.12)}' +
          'q-editor .qe-highlight,q-editor .qe-input,q-editor .qe-code,q-editor .qe-preview{box-sizing:border-box;width:100%;min-height:20rem;margin:0;padding:1rem;border:0;font:inherit;font-size:13px;line-height:1.45;white-space:pre;overflow:auto}' +
          'q-editor .qe-highlight{pointer-events:none;background:var(--qe-bg);color:var(--qe-fg)}' +
          'q-editor .qe-input{resize:none;background:transparent;color:transparent;caret-color:#f8fafc;outline:none}' +
          'q-editor .qe-input::selection{background:rgba(130,170,255,.35);color:transparent}' +
          'q-editor .qe-code{background:var(--qe-bg);color:var(--qe-fg)}' +
          'q-editor .qe-qdom{resize:vertical;outline:none}' +
          'q-editor .qe-preview{background:#fff;color:#0f172a;white-space:normal}' +
          'q-editor .qe-preview > *{max-width:100%}' +
          'q-editor .qe-error{color:#fecaca;white-space:pre-wrap}' +
          'q-editor .qe-tok-qkw{color:var(--qe-qkw)}' +
          'q-editor .qe-tok-tag{color:var(--qe-tag)}' +
          'q-editor .qe-tok-class{color:var(--qe-class)}' +
          'q-editor .qe-tok-flowkw{color:var(--qe-flowkw)}' +
          'q-editor .qe-tok-textbody{color:var(--qe-textbody)}' +
          'q-editor .qe-tok-htmlbody{color:var(--qe-htmlbody)}' +
          'q-editor .qe-tok-slotname{color:var(--qe-slotname)}' +
          'q-editor .qe-tok-slotbody{color:var(--qe-slotbody)}' +
          'q-editor .qe-tok-component{color:var(--qe-component)}' +
          'q-editor .qe-tok-attr{color:var(--qe-attr)}' +
          'q-editor .qe-tok-comment{color:var(--qe-comment);font-style:italic}' +
          'q-editor .qe-tok-string{color:var(--qe-string)}' +
          'q-editor .qe-tok-number{color:var(--qe-number)}' +
          'q-editor .qe-tok-bool{color:var(--qe-bool)}' +
          'q-editor .qe-tok-null{color:var(--qe-null)}' +
          'q-editor .qe-tok-qkey{color:var(--qe-qkey)}' +
          'q-editor .qe-tok-htmltext{color:var(--qe-htmltext)}' +
          'q-editor .qe-tok-jskw{color:var(--qe-jskw)}' +
          'q-editor .qe-tok-brace,q-editor .qe-tok-angle,q-editor .qe-tok-punc{color:#9aa4b2}' +
          'q-editor .qe-cm-host .cm-content *{color:inherit}' +
          'q-editor .qe-cm-host .cm-content{color:rgb(238, 243, 251)}' +
          'q-editor .qe-cm-host .cm-content .qe-sem-keyword{color:#9cdcfe !important;font-weight:600}' +
          'q-editor .qe-cm-host .cm-content .qe-sem-tag{color:#82aaff !important}' +
          'q-editor .qe-cm-host .cm-content .qe-sem-name{color:var(--qe-string) !important}' +
          'q-editor .qe-cm-host .cm-content .qe-sem-class{color:#569cd6 !important}' +
          'q-editor .qe-cm-host .cm-content .qe-sem-id{color:#569cd6 !important}' +
          'q-editor .qe-cm-host .cm-content .qe-sem-punc{color:#b8c0cc !important}' +
          'q-editor .qe-cm-host .cm-content .qe-sem-comment{color:var(--qe-comment) !important;font-style:italic}' +
          'q-editor .qe-cm-host .cm-content .qe-sem-script{color:rgb(238, 243, 251) !important}' +
        '</style>' +
        '<div class="qe">' +
          '<div class="qe-tabs" role="tablist" aria-label="Q Editor tabs">' +
            '<button class="qe-tab" type="button" data-tab="qhtml" aria-selected="true">QHTML</button>' +
            '<button class="qe-tab" type="button" data-tab="html" aria-selected="false">HTML</button>' +
            '<button class="qe-tab" type="button" data-tab="preview" aria-selected="false">Preview</button>' +
            '<button class="qe-tab" type="button" data-tab="qdom" aria-selected="false">QDom</button>' +
            '<div class="qe-actions">' +
              '<button class="qe-btn" type="button" data-copy="qhtml">Copy QHTML</button>' +
              '<button class="qe-btn" type="button" data-copy="html">Copy HTML</button>' +
              '<button class="qe-btn" type="button" data-copy="qdom">Copy QDom</button>' +
            '</div>' +
          '</div>' +
          '<section class="qe-panel" data-tab="qhtml" data-active="true" aria-hidden="false">' +
            '<div class="qe-editor-wrap">' +
              '<div class="qe-cm-host" data-active="false" aria-label="QHTML editor"></div>' +
              '<pre class="qe-highlight qe-qhtml-highlight" aria-hidden="true"></pre>' +
              '<textarea class="qe-input" spellcheck="false" wrap="off"></textarea>' +
            '</div>' +
          '</section>' +
          '<section class="qe-panel" data-tab="html" data-active="false" aria-hidden="true">' +
            '<button class="qe-copy" type="button" data-copy="html">Copy</button>' +
            '<pre class="qe-code qe-html"></pre>' +
          '</section>' +
          '<section class="qe-panel" data-tab="preview" data-active="false" aria-hidden="true">' +
            '<div class="qe-preview"></div>' +
          '</section>' +
          '<section class="qe-panel" data-tab="qdom" data-active="false" aria-hidden="true">' +
            '<button class="qe-copy" type="button" data-copy="qdom">Copy</button>' +
            '<textarea class="qe-code qe-qdom" spellcheck="false" wrap="off"></textarea>' +
          '</section>' +
        '</div>';
    }

    _cacheNodes() {
      this._tabs = Array.from(this.querySelectorAll('.qe-tab'));
      this._panels = Array.from(this.querySelectorAll('.qe-panel'));
      this._qhtmlInput = this.querySelector('.qe-input');
      this._qhtmlHighlight = this.querySelector('.qe-qhtml-highlight');
      this._cmHost = this.querySelector('.qe-cm-host');
      this._htmlNode = this.querySelector('.qe-html');
      this._previewNode = this.querySelector('.qe-preview');
      this._qdomNode = this.querySelector('.qe-qdom');
      this._copyButtons = Array.from(this.querySelectorAll('[data-copy]'));
    }

    _bindEvents() {
      this._tabs.forEach((tab) => {
        tab.addEventListener('click', () => {
          this._setTab(tab.getAttribute('data-tab') || 'qhtml');
        });
      });

      if (this._qhtmlInput) {
        this._qhtmlInput.addEventListener('input', () => {
          if (this._isApplyingFormat) return;
          this._source = this._qhtmlInput.value || '';
          this._refreshQhtmlHighlight();
          this._scheduleAutoFormat(220);
          this._scheduleRender(160);
        });
        this._qhtmlInput.addEventListener('scroll', () => {
          this._syncQhtmlScroll();
        });
      }

      const copyValueByKind = {
        qhtml: () => this._source,
        html: () => this._htmlOutput,
        qdom: () => this._qdomDecoded,
      };
      this._copyButtons.forEach((button) => {
        button.addEventListener('click', async () => {
          const kind = button.getAttribute('data-copy') || '';
          const text = copyValueByKind[kind] ? copyValueByKind[kind]() : '';
          try {
            await navigator.clipboard.writeText(text || '');
            const oldText = button.textContent;
            button.textContent = 'Copied';
            setTimeout(function restoreText() {
              button.textContent = oldText;
            }, 900);
          } catch (error) {
            // ignore clipboard failures
          }
        });
      });
    }

    _buildCompletionOptions() {
      const names = new Set(QHTML_KEYWORD_COMPLETIONS);
      const components = this._componentNames && this._componentNames.size
        ? this._componentNames
        : collectComponentNames(this._source || '');
      components.forEach(function addComponent(name) {
        if (name) names.add(String(name));
      });
      return Array.from(names).sort().map(function toOption(label) {
        const value = String(label || '').trim();
        return {
          label: value,
          type: value.indexOf('q-') === 0 || value === 'slot' || value === 'style' || value === 'text' || value === 'html'
            ? 'keyword'
            : 'type'
        };
      });
    }

    _getSemanticHighlightModel(source) {
      const text = String(source || '');
      if (this._semanticCacheSource === text && this._semanticCacheModel) {
        return this._semanticCacheModel;
      }

      const codeMask = buildCodeMask(text);
      const semantic = collectSemanticIdentifiersFromQDom(text);
      const keywords = semantic && semantic.keywords instanceof Set
        ? new Set(semantic.keywords)
        : new Set(QHTML_CANONICAL_KEYWORDS.map(function mapKeyword(name) {
            return String(name || '').toLowerCase();
          }));
      QHTML_CANONICAL_KEYWORDS.forEach(function eachKeyword(name) {
        addSemanticIdentifier(keywords, name);
      });

      const objectNames = new Set();
      if (semantic && semantic.names instanceof Set) {
        semantic.names.forEach(function eachName(name) {
          const normalized = normalizeSemanticIdentifier(name);
          if (!normalized || keywords.has(normalized)) return;
          objectNames.add(normalized);
        });
      }
      if (semantic && semantic.componentNames instanceof Set) {
        semantic.componentNames.forEach(function eachComponent(name) {
          const normalized = normalizeSemanticIdentifier(name);
          if (!normalized || keywords.has(normalized)) return;
          objectNames.add(normalized);
        });
      }
      collectKeywordAliasNames(text).forEach(function eachAliasName(name) {
        const normalized = normalizeSemanticIdentifier(name);
        if (!normalized || keywords.has(normalized)) return;
        objectNames.add(normalized);
      });

      const classRanges = []
        .concat(collectDotOrHashRanges(text, codeMask, '.', true))
        .concat(collectAttrValueNameRanges(text, 'class'));
      const idRanges = []
        .concat(collectDotOrHashRanges(text, codeMask, '#', true))
        .concat(collectAttrValueNameRanges(text, 'id'));
      const scriptKeywordNames = new Set();
      collectCanonicalAliasNames(text, 'q-bind').forEach(function eachName(name) {
        scriptKeywordNames.add(name);
      });
      collectCanonicalAliasNames(text, 'q-script').forEach(function eachName(name) {
        scriptKeywordNames.add(name);
      });
      const scriptRanges = collectScriptBodyRanges(text, codeMask, scriptKeywordNames);
      const punctuationRanges = collectPunctuationRanges(text, codeMask);
      const commentRanges = collectCommentRanges(text);

      const keywordRanges = [];
      keywords.forEach(function eachKeywordName(name) {
        keywordRanges.push.apply(keywordRanges, collectIdentifierRangesByName(text, codeMask, name));
      });

      const objectRanges = [];
      objectNames.forEach(function eachObjectName(name) {
        objectRanges.push.apply(objectRanges, collectIdentifierRangesByName(text, codeMask, name));
      });
      const tagRanges = [];
      const tagNames = semantic && semantic.tagNames instanceof Set ? semantic.tagNames : new Set();
      tagNames.forEach(function eachTagName(name) {
        tagRanges.push.apply(tagRanges, collectIdentifierRangesByName(text, codeMask, name));
      });

      const model = {
        keywordRanges: keywordRanges,
        tagRanges: tagRanges,
        objectRanges: objectRanges,
        classRanges: classRanges,
        idRanges: idRanges,
        scriptRanges: scriptRanges,
        punctuationRanges: punctuationRanges,
        commentRanges: commentRanges
      };
      this._semanticCacheSource = text;
      this._semanticCacheModel = model;
      return model;
    }

    _buildCodeMirrorDecorations(editorState, cmState, cmView) {
      if (!editorState || !cmState || !cmView || !cmState.RangeSetBuilder || !cmView.Decoration) {
        return cmView && cmView.Decoration && cmView.Decoration.none ? cmView.Decoration.none : null;
      }
      const text = editorState.doc ? editorState.doc.toString() : '';
      const model = this._getSemanticHighlightModel(text);
      const builder = new cmState.RangeSetBuilder();
      const markCache = new Map();
      const emitted = new Set();
      const pendingRanges = [];

      const markFor = function markFor(className) {
        if (markCache.has(className)) return markCache.get(className);
        const mark = cmView.Decoration.mark({ class: className });
        markCache.set(className, mark);
        return mark;
      };

      const emitRange = function emitRange(from, to, className) {
        const start = Math.max(0, Number(from) || 0);
        const end = Math.max(start, Number(to) || start);
        if (end <= start) return;
        const key = start + ':' + end + ':' + className;
        if (emitted.has(key)) return;
        emitted.add(key);
        pendingRanges.push({
          from: start,
          to: end,
          className: String(className || '')
        });
      };

      (Array.isArray(model.keywordRanges) ? model.keywordRanges : []).forEach(function eachKeywordRange(range) {
        emitRange(range.from, range.to, 'qe-sem-keyword');
      });

      (Array.isArray(model.tagRanges) ? model.tagRanges : []).forEach(function eachTagRange(range) {
        emitRange(range.from, range.to, 'qe-sem-tag');
      });

      (Array.isArray(model.objectRanges) ? model.objectRanges : []).forEach(function eachObjectRange(range) {
        emitRange(range.from, range.to, 'qe-sem-name');
      });

      (Array.isArray(model.classRanges) ? model.classRanges : []).forEach(function eachClassRange(range) {
        emitRange(range.from, range.to, 'qe-sem-class');
      });

      (Array.isArray(model.idRanges) ? model.idRanges : []).forEach(function eachIdRange(range) {
        emitRange(range.from, range.to, 'qe-sem-id');
      });

      (Array.isArray(model.scriptRanges) ? model.scriptRanges : []).forEach(function eachScriptRange(range) {
        emitRange(range.from, range.to, 'qe-sem-script');
      });

      (Array.isArray(model.punctuationRanges) ? model.punctuationRanges : []).forEach(function eachPunctuationRange(range) {
        emitRange(range.from, range.to, 'qe-sem-punc');
      });

      (Array.isArray(model.commentRanges) ? model.commentRanges : []).forEach(function eachCommentRange(range) {
        emitRange(range.from, range.to, 'qe-sem-comment');
      });

      pendingRanges.sort(function sortRanges(a, b) {
        const fromDiff = Number(a.from || 0) - Number(b.from || 0);
        if (fromDiff !== 0) return fromDiff;
        const toDiff = Number(a.to || 0) - Number(b.to || 0);
        if (toDiff !== 0) return toDiff;
        if (a.className < b.className) return -1;
        if (a.className > b.className) return 1;
        return 0;
      });
      for (let i = 0; i < pendingRanges.length; i += 1) {
        const entry = pendingRanges[i];
        builder.add(entry.from, entry.to, markFor(entry.className));
      }

      return builder.finish();
    }

    _createCodeMirrorSemanticExtension(cmState, cmView) {
      if (!cmState || !cmView || !cmState.StateField || !cmView.EditorView) {
        return null;
      }
      const owner = this;
      const buildDecorations = function buildDecorations(state) {
        return owner._buildCodeMirrorDecorations(state, cmState, cmView);
      };

      return cmState.StateField.define({
        create: function createDecorations(state) {
          return buildDecorations(state);
        },
        update: function updateDecorations(decorations, transaction) {
          if (transaction && transaction.docChanged) {
            return buildDecorations(transaction.state);
          }
          return decorations;
        },
        provide: function provideDecorations(field) {
          return cmView.EditorView.decorations.from(field);
        }
      });
    }

    async _initializeCodeMirror() {
      if (this._cmView || !this._cmHost) {
        return;
      }

      let cmModules = null;
      try {
        cmModules = await ensureCodeMirrorLoaded();
      } catch (error) {
        this._cmLoadError = error;
        if (globalScope.console && typeof globalScope.console.error === 'function') {
          globalScope.console.error('q-editor CodeMirror load failed:', error);
        }
        return;
      }

      if (!this.isConnected || this._cmView || !this._cmHost) {
        return;
      }

      const cmCore = cmModules && cmModules['codemirror'] ? cmModules['codemirror'] : null;
      const cmState = cmModules && cmModules['@codemirror/state'] ? cmModules['@codemirror/state'] : null;
      const cmView = cmModules && cmModules['@codemirror/view'] ? cmModules['@codemirror/view'] : null;
      const cmCommands = cmModules && cmModules['@codemirror/commands'] ? cmModules['@codemirror/commands'] : null;
      const cmLangHtml = cmModules && cmModules['@codemirror/lang-html'] ? cmModules['@codemirror/lang-html'] : null;
      if (!cmCore || !cmState || !cmView || !cmState.EditorState || !cmView.EditorView) {
        return;
      }

      const extensions = [];
      if (cmCore.basicSetup) {
        extensions.push(cmCore.basicSetup);
      }
      if (cmLangHtml && typeof cmLangHtml.html === 'function') {
        extensions.push(cmLangHtml.html());
      }
      const semanticExtension = this._createCodeMirrorSemanticExtension(cmState, cmView);
      if (semanticExtension) {
        extensions.push(semanticExtension);
      }
      if (cmState.EditorState.tabSize && typeof cmState.EditorState.tabSize.of === 'function') {
        extensions.push(cmState.EditorState.tabSize.of(2));
      }
      if (cmView.EditorView.lineWrapping) {
        extensions.push(cmView.EditorView.lineWrapping);
      }
      if (
        cmView.keymap && typeof cmView.keymap.of === 'function' &&
        cmCommands && cmCommands.indentWithTab
      ) {
        extensions.push(cmView.keymap.of([cmCommands.indentWithTab]));
      }
      if (cmState.EditorState.languageData && typeof cmState.EditorState.languageData.of === 'function') {
        extensions.push(cmState.EditorState.languageData.of((state, pos) => {
          void state;
          void pos;
          const options = this._buildCompletionOptions();
          return [{
            autocomplete: function autocompleteQHtml(context) {
              const before = context && typeof context.matchBefore === 'function'
                ? context.matchBefore(/[A-Za-z_][A-Za-z0-9_-]*/)
                : null;
              if (!before) {
                if (!context || context.explicit !== true) {
                  return null;
                }
                return { from: context.pos, options: options };
              }
              if (before.from === before.to && context.explicit !== true) {
                return null;
              }
              return {
                from: before.from,
                options: options
              };
            }
          }];
        }));
      }
      if (cmView.EditorView.updateListener && typeof cmView.EditorView.updateListener.of === 'function') {
        extensions.push(cmView.EditorView.updateListener.of((update) => {
          if (!update || !update.docChanged) {
            return;
          }
          this._source = update.state.doc.toString();
          this._semanticCacheSource = null;
          this._semanticCacheModel = null;
          if (this._isApplyingFormat) {
            return;
          }
          this._scheduleAutoFormat(220);
          this._scheduleRender(160);
        }));
      }
      if (cmView.EditorView.theme && typeof cmView.EditorView.theme === 'function') {
        extensions.push(cmView.EditorView.theme({
          '&': { backgroundColor: '#0f1220', color: '#dbeafe' },
          '.cm-content': { caretColor: '#f8fafc' },
          '&.cm-focused .cm-cursor': { borderLeftColor: '#f8fafc' },
          '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
            backgroundColor: 'rgba(130,170,255,.35)'
          }
        }, { dark: true }));
      }

      const initialDoc = String(this._source || '');
      const editorState = cmState.EditorState.create({
        doc: initialDoc,
        extensions: extensions
      });

      this._cmHost.innerHTML = '';
      this._cmView = new cmView.EditorView({
        state: editorState,
        parent: this._cmHost
      });
      this._cmHost.setAttribute('data-active', 'true');
      if (this._qhtmlInput) {
        this._qhtmlInput.style.display = 'none';
      }
      if (this._qhtmlHighlight) {
        this._qhtmlHighlight.style.display = 'none';
      }
    }

    _destroyCodeMirror() {
      if (this._cmView && typeof this._cmView.destroy === 'function') {
        try {
          this._cmView.destroy();
        } catch (error) {
          // ignore destroy failures during detach
        }
      }
      this._cmView = null;
      if (this._cmHost) {
        this._cmHost.removeAttribute('data-active');
        this._cmHost.innerHTML = '';
      }
      if (this._qhtmlInput) {
        this._qhtmlInput.style.display = '';
      }
      if (this._qhtmlHighlight) {
        this._qhtmlHighlight.style.display = '';
      }
      this._semanticCacheSource = null;
      this._semanticCacheModel = null;
    }

    _setTab(tabName) {
      this._activeTab = tabName;
      this._tabs.forEach((tab) => {
        const active = tab.getAttribute('data-tab') === tabName;
        tab.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      this._panels.forEach((panel) => {
        const active = panel.getAttribute('data-tab') === tabName;
        panel.setAttribute('data-active', active ? 'true' : 'false');
        panel.setAttribute('aria-hidden', active ? 'false' : 'true');
      });
      if (tabName === 'qhtml') {
        this._refreshQhtmlHighlight();
        this._syncQhtmlScroll();
        if (this._cmView && typeof this._cmView.focus === 'function') {
          this._cmView.focus();
        }
      }
      if (tabName === 'html' || tabName === 'preview' || tabName === 'qdom') {
        this._scheduleRender(0);
      }
    }

    _scheduleRender(delayMs) {
      this._scheduleTimer('_renderTimer', delayMs, () => {
        this._updateOutputs();
      });
    }

    _scheduleAutoFormat(delayMs) {
      if (!this._qhtmlInput && !this._cmView) return;
      this._scheduleTimer('_formatTimer', delayMs, () => {
        this._applyAutoFormat();
      });
    }

    _applyAutoFormat() {
      if (this._isApplyingFormat) return;

      if (this._cmView && this._cmView.state && this._cmView.state.doc) {
        const value = this._cmView.state.doc.toString();
        const selection = this._cmView.state.selection && this._cmView.state.selection.main
          ? this._cmView.state.selection.main
          : { anchor: value.length, head: value.length };
        const start = Math.min(selection.anchor, selection.head);
        const end = Math.max(selection.anchor, selection.head);
        const formatted = formatQhtmlForEditing(value, start, end, 1);
        if (!formatted || typeof formatted.text !== 'string' || formatted.text === value) {
          return;
        }

        const isForward = selection.anchor <= selection.head;
        const nextAnchor = isForward ? formatted.cursorStart : formatted.cursorEnd;
        const nextHead = isForward ? formatted.cursorEnd : formatted.cursorStart;

        this._isApplyingFormat = true;
        this._cmView.dispatch({
          changes: { from: 0, to: value.length, insert: formatted.text },
          selection: { anchor: nextAnchor, head: nextHead }
        });
        this._isApplyingFormat = false;
        this._source = formatted.text;
        this._scheduleRender(0);
        return;
      }

      if (!this._qhtmlInput) return;
      const value = String(this._qhtmlInput.value || '');
      const start = typeof this._qhtmlInput.selectionStart === 'number' ? this._qhtmlInput.selectionStart : value.length;
      const end = typeof this._qhtmlInput.selectionEnd === 'number' ? this._qhtmlInput.selectionEnd : start;
      const formatted = formatQhtmlForEditing(value, start, end, 1);
      if (!formatted || typeof formatted.text !== 'string' || formatted.text === value) {
        return;
      }

      this._isApplyingFormat = true;
      this._qhtmlInput.value = formatted.text;
      try {
        this._qhtmlInput.setSelectionRange(formatted.cursorStart, formatted.cursorEnd);
      } catch (error) {
        // ignore selection assignment failures
      }
      this._isApplyingFormat = false;

      this._source = formatted.text;
      this._refreshQhtmlHighlight();
      this._syncQhtmlScroll();
      this._scheduleRender(0);
    }

    _syncQhtmlScroll() {
      if (this._cmView) return;
      if (!this._qhtmlInput || !this._qhtmlHighlight) return;
      this._qhtmlHighlight.scrollTop = this._qhtmlInput.scrollTop;
      this._qhtmlHighlight.scrollLeft = this._qhtmlInput.scrollLeft;
    }

    _refreshQhtmlHighlight() {
      if (this._cmView) return;
      if (!this._qhtmlHighlight) return;
      const components = this._componentNames && this._componentNames.size
        ? this._componentNames
        : collectComponentNames(this._source);
      this._qhtmlHighlight.innerHTML = highlightQHtmlCode(this._source || '', components);
    }

    _detachPreviewListeners() {
      if (!Array.isArray(this._previewListeners)) {
        this._previewListeners = [];
        return;
      }
      for (const entry of this._previewListeners) {
        if (!entry || !entry.target || typeof entry.target.removeEventListener !== 'function') continue;
        entry.target.removeEventListener(entry.eventName, entry.handler);
      }
      this._previewListeners.length = 0;
    }

    _unmountPreviewQHtml() {
      const runtime = getQHtmlRuntime();
      const host = this._previewQHtmlNode;
      if (host && runtime && typeof runtime.unmountQHtmlElement === 'function') {
        try {
          runtime.unmountQHtmlElement(host);
        } catch (error) {
          // ignore unmount failures during re-render/disconnect
        }
      } else if (this._previewMountBinding && typeof this._previewMountBinding.disconnect === 'function') {
        try {
          this._previewMountBinding.disconnect();
        } catch (error) {
          // ignore disconnect failures during re-render/disconnect
        }
      }
      this._previewQHtmlNode = null;
      this._previewMountBinding = null;
    }

    _attachPreviewQScriptRules(qdomDocument) {
      this._detachPreviewListeners();
      if (!qdomDocument || !Array.isArray(qdomDocument.scripts) || !this._previewNode) {
        return;
      }

      const rules = qdomDocument.scripts;
      const previewRoot = this._previewNode;
      const previewDocument = previewRoot.ownerDocument || document;

      for (let i = 0; i < rules.length; i += 1) {
        const rule = rules[i];
        if (!rule || rule.kind !== 'script-rule') continue;
        const selector = String(rule.selector || '').trim();
        const eventName = String(rule.eventName || '').trim();
        const body = transformScriptBody(String(rule.body || ''));
        if (!selector || !eventName || !body) continue;

        let executor;
        try {
          executor = new Function('event', 'document', body);
        } catch (error) {
          continue;
        }

        let targets = [];
        try {
          targets = Array.from(previewRoot.querySelectorAll(selector));
          if (typeof previewRoot.matches === 'function' && previewRoot.matches(selector)) {
            targets.unshift(previewRoot);
          }
        } catch (error) {
          targets = [];
        }

        targets.forEach((target) => {
          const handler = function qScriptPreviewHandler(event) {
            return executor.call(target, event, previewDocument);
          };
          target.addEventListener(eventName, handler);
          this._previewListeners.push({
            target: target,
            eventName: eventName,
            handler: handler,
          });
        });
      }
    }

    async _updateOutputs() {
      if (!this.isConnected) return;
      const version = ++this._renderVersion;
      const source = String(this._source || '');
      const shouldPopulateHtml = this._activeTab === 'html';
      const shouldPopulateQDom = this._activeTab === 'qdom';
      const shouldPopulatePreview = this._activeTab === 'preview';
      const shouldBuildAdapter = shouldPopulateHtml || shouldPopulateQDom || shouldPopulatePreview;

      if (!shouldBuildAdapter) {
        this._adapter = null;
        this._qdomSerialized = '';
        this._qdomDecoded = '';
        this._htmlOutput = '';
        this._componentNames = collectComponentNames(source);
        globalScope.__QEDITOR_QDOM_SERIALIZED__ = this._qdomSerialized;
        globalScope.__QEDITOR_QDOM_DECODED__ = this._qdomDecoded;
        this.dispatchEvent(new CustomEvent('q-editor-output', { bubbles: true, composed: true }));
        this._refreshQhtmlHighlight();
        this._syncQhtmlScroll();
        if (this._previewNode) {
          this._detachPreviewListeners();
          this._unmountPreviewQHtml();
          this._previewNode.innerHTML = '';
        }
        return;
      }

      let adapter = null;
      let htmlRaw = '';
      let qdomDecodedText = '';
      let renderError = null;

      try {
        adapter = await createQDomAdapter(source, { baseUrl: resolveImportBaseUrl() });
        htmlRaw = adapter.toHTML(document);
        if (shouldPopulateQDom) {
          qdomDecodedText = JSON.stringify(adapter && adapter.qdom ? adapter.qdom : null);
        }
      } catch (error) {
        renderError = error;
        if (shouldPopulateQDom) {
          qdomDecodedText = String(error && error.stack ? error.stack : error);
        }
      }

      if (version !== this._renderVersion) return;

      this._adapter = adapter;
      this._qdomSerialized = '';
      this._qdomDecoded = shouldPopulateQDom ? qdomDecodedText : '';
      this._htmlOutput = renderError ? '' : formatHtmlOutput(htmlRaw);
      this._componentNames = collectComponentNames(adapter && adapter.resolvedSource ? adapter.resolvedSource : source);

      globalScope.__QEDITOR_QDOM_SERIALIZED__ = this._qdomSerialized;
      globalScope.__QEDITOR_QDOM_DECODED__ = this._qdomDecoded;
      this.dispatchEvent(new CustomEvent('q-editor-output', { bubbles: true, composed: true }));

      this._refreshQhtmlHighlight();
      this._syncQhtmlScroll();

      if (this._htmlNode) {
        if (renderError) {
          this._htmlNode.innerHTML = '<span class="qe-tok-comment">' + escapeHtml('QDom render error:\n' + String(renderError && renderError.stack ? renderError.stack : renderError)) + '</span>';
        } else {
          this._htmlNode.innerHTML = highlightHtmlCode(this._htmlOutput, this._componentNames);
        }
      }

      if (this._previewNode) {
        this._detachPreviewListeners();
        this._unmountPreviewQHtml();
        this._previewNode.innerHTML = '';

        if (!shouldPopulatePreview) {
          // Preview runtime is mounted lazily only when preview tab is active.
        } else if (renderError) {
          this._previewNode.innerHTML = '<pre class="qe-error">' + escapeHtml(String(renderError && renderError.stack ? renderError.stack : renderError)) + '</pre>';
        } else {
          let mountedRuntimePreview = false;
          const runtime = getQHtmlRuntime();
          if (runtime && typeof runtime.mountQHtmlElement === 'function') {
            const previewQHtml = document.createElement('q-html');
            previewQHtml.textContent = source;
            this._previewNode.appendChild(previewQHtml);
            this._previewQHtmlNode = previewQHtml;
            try {
              const mountBinding = runtime.mountQHtmlElement(previewQHtml, { preferTemplate: false });
              this._previewMountBinding = mountBinding || null;
              if (mountBinding && mountBinding.ready && typeof mountBinding.ready.then === 'function') {
                await mountBinding.ready;
                if (version !== this._renderVersion) {
                  this._unmountPreviewQHtml();
                  if (previewQHtml.parentNode) {
                    previewQHtml.parentNode.removeChild(previewQHtml);
                  }
                  return;
                }
              }
              mountedRuntimePreview = true;
            } catch (error) {
              this._unmountPreviewQHtml();
              this._previewNode.innerHTML = '<pre class="qe-error">' + escapeHtml(String(error && error.stack ? error.stack : error)) + '</pre>';
              mountedRuntimePreview = true;
            }
          }

          if (!mountedRuntimePreview && adapter) {
            const previewFragment = adapter.toHTMLDom(document);
            if (previewFragment) {
              this._previewNode.appendChild(previewFragment);
            }
            if (adapter.qdom) {
              this._attachPreviewQScriptRules(adapter.qdom);
            }
          }
        }
      }

      if (shouldPopulateQDom && !renderError) {
        try {
          const previewQDom =
            this._previewQHtmlNode && typeof this._previewQHtmlNode.qdom === 'function'
              ? this._previewQHtmlNode.qdom()
              : adapter && adapter.qdom
                ? adapter.qdom
                : null;
          this._qdomDecoded = stringifyQDomForDisplay(previewQDom);
        } catch (error) {
          this._qdomDecoded = String(error && error.stack ? error.stack : error);
        }
      }

      if (this._qdomNode) {
        const rawQdomText = !shouldPopulateQDom
          ? 'Select the QDom tab to render QDom output.'
          : String(this._qdomDecoded || '');
        const qdomText = shouldPopulateQDom
          ? rawQdomText
              .replace(/\\r\\n/g, '\n')
              .replace(/\\n/g, '\n')
          : rawQdomText;
        if (String(this._qdomNode.tagName || '').toLowerCase() === 'textarea') {
          this._qdomNode.value = shouldPopulateQDom
            ? wrapQDomTextForTextarea(this._qdomNode, qdomText)
            : qdomText;
        } else {
          this._qdomNode.textContent = qdomText;
        }
      }
    }
  }

  if (!customElements.get('q-editor')) {
    customElements.define('q-editor', QEditor);
  }
})(typeof window !== 'undefined' ? window : globalThis);
