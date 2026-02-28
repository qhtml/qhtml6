(function attachQEditor(globalScope) {
  'use strict';

  if (typeof document === 'undefined' || typeof customElements === 'undefined') {
    return;
  }

  const qEditorImportSourceCache = new Map();

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

  async function loadImportSource(url) {
    const key = String(url || '').trim();
    if (!key) {
      throw new Error('q-import URL cannot be empty.');
    }
    if (qEditorImportSourceCache.has(key)) {
      return qEditorImportSourceCache.get(key);
    }
    if (typeof globalScope.fetch !== 'function') {
      throw new Error('fetch() is required for q-import in q-editor.');
    }

    const pending = (async function fetchImport() {
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
    })();

    qEditorImportSourceCache.set(key, pending);
    try {
      const loaded = await pending;
      qEditorImportSourceCache.set(key, Promise.resolve(loaded));
      return loaded;
    } catch (error) {
      qEditorImportSourceCache.delete(key);
      throw error;
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

      const analysisLine = stripQhtmlQuotedSections(trimmed).replace(/\/\/.*$/, '');
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
      renderer.renderIntoElement(qdom, host, doc);
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
    }

    connectedCallback() {
      if (this._mounted) return;
      this._mounted = true;

      const doMount = () => {
        if (!this.isConnected) return;
        this._clearPendingMount();

        const initialFromAttr = this.getAttribute('initial-qhtml');
        const initialFromBody = this.textContent || '';
        const initialSource = initialFromAttr != null ? String(initialFromAttr) : initialFromBody;

        this.textContent = '';
        this._renderShell();
        this._cacheNodes();
        this._bindEvents();
        this._setTab('qhtml');
        this.setQhtmlSource(initialSource);
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
    }

    setQhtmlSource(source) {
      const normalized = String(source || '').replace(/\r\n/g, '\n');
      this._source = formatQhtml(normalized);
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
          'q-editor .qe-highlight,q-editor .qe-input,q-editor .qe-code,q-editor .qe-preview{box-sizing:border-box;width:100%;min-height:20rem;margin:0;padding:1rem;border:0;font:inherit;font-size:13px;line-height:1.45;white-space:pre;overflow:auto}' +
          'q-editor .qe-highlight{pointer-events:none;background:var(--qe-bg);color:var(--qe-fg)}' +
          'q-editor .qe-input{resize:none;background:transparent;color:transparent;caret-color:#f8fafc;outline:none}' +
          'q-editor .qe-input::selection{background:rgba(130,170,255,.35);color:transparent}' +
          'q-editor .qe-code{background:var(--qe-bg);color:var(--qe-fg)}' +
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
            '<pre class="qe-code qe-qdom"></pre>' +
          '</section>' +
        '</div>';
    }

    _cacheNodes() {
      this._tabs = Array.from(this.querySelectorAll('.qe-tab'));
      this._panels = Array.from(this.querySelectorAll('.qe-panel'));
      this._qhtmlInput = this.querySelector('.qe-input');
      this._qhtmlHighlight = this.querySelector('.qe-qhtml-highlight');
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
      if (!this._qhtmlInput) return;
      this._scheduleTimer('_formatTimer', delayMs, () => {
        this._applyAutoFormat();
      });
    }

    _applyAutoFormat() {
      if (!this._qhtmlInput || this._isApplyingFormat) return;
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
      if (!this._qhtmlInput || !this._qhtmlHighlight) return;
      this._qhtmlHighlight.scrollTop = this._qhtmlInput.scrollTop;
      this._qhtmlHighlight.scrollLeft = this._qhtmlInput.scrollLeft;
    }

    _refreshQhtmlHighlight() {
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
      const shouldPopulateQDom = this._activeTab === 'qdom';

      let adapter = null;
      let htmlRaw = '';
      let qdomSerialized = '';
      let qdomDecodedText = '';
      let renderError = null;

      try {
        adapter = await createQDomAdapter(source, { baseUrl: resolveImportBaseUrl() });
        htmlRaw = adapter.toHTML(document);
        if (shouldPopulateQDom) {
          qdomSerialized = adapter.serialize();
          const decoded = adapter.deserialize(qdomSerialized);
          qdomDecodedText = JSON.stringify(decoded, null, 2);
        }
      } catch (error) {
        renderError = error;
        if (shouldPopulateQDom) {
          qdomDecodedText = String(error && error.stack ? error.stack : error);
        }
      }

      if (version !== this._renderVersion) return;

      this._adapter = adapter;
      this._qdomSerialized = shouldPopulateQDom ? qdomSerialized : '';
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

      if (this._qdomNode) {
        if (!shouldPopulateQDom) {
          this._qdomNode.innerHTML = '<span class="qe-tok-comment">Select the QDom tab to render QDom output.</span>';
        } else if (renderError) {
          this._qdomNode.innerHTML = '<span class="qe-tok-comment">' + escapeHtml(this._qdomDecoded || '') + '</span>';
        } else {
          this._qdomNode.innerHTML = highlightQdomJson(this._qdomDecoded || '', this._componentNames);
        }
      }

      if (this._previewNode) {
        this._detachPreviewListeners();
        this._unmountPreviewQHtml();
        this._previewNode.innerHTML = '';

        if (renderError) {
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
    }
  }

  if (!customElements.get('q-editor')) {
    customElements.define('q-editor', QEditor);
  }
})(typeof window !== 'undefined' ? window : globalThis);
