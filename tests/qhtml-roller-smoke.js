const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { QHtmlRoller } = require('../qhtml-roller.js');

const root = path.join(__dirname, '..');
const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qhtml-roller-smoke-'));
const fixture = path.join(fixtureDir, 'index.html');
const componentDir = path.join(fixtureDir, 'components');
const nestedDir = path.join(componentDir, 'nested');

fs.mkdirSync(nestedDir, { recursive: true });
fs.writeFileSync(path.join(nestedDir, 'label.qhtml'), `
q-component imported-label {
  strong { text { Nested import } }
}
`);
fs.writeFileSync(path.join(componentDir, 'import-card.qhtml'), `
q-import { nested/label.qhtml }

q-component import-card {
  section.import-card {
    imported-label { }
    h3 { text { \${this.component.title} } }
  }
}
`);

fs.writeFileSync(fixture, `<!doctype html>
<html>
<head>
  <script src="qhtml.js"></script>
</head>
<body>
<q-html id="page">
q-import { components/import-card.qhtml }

q-component card-box {
  div.card {
    h2 { text { \${this.component.title} } }
    slot { body }
    button {
      onclick { document.body.setAttribute("data-clicked", this.textContent.trim()); }
      text { Go }
    }
  }
}

q-component ready-frame {
  q-property defaultUrl: "about:blank"

  function markReady() {
    document.body.setAttribute("data-frame-src", this.component.defaultUrl);
  }

  onReady {
    this.markReady();
  }

  iframe {
    src: "\${this.component.defaultUrl}"
  }
}

card-box {
  title: "Hello"
  body { p { text { Body copy } } }
}

ready-frame {
  defaultUrl: "docs/page.html"
}

q-model-view {
  model { q-model { q-array { q-map { name: "One" }, q-map { name: "Two" } } } }
  as { item }
  span.item { text { \${item.name} } }
}

onReady { document.body.setAttribute("data-ready", "1"); }
</q-html>
<q-html id="second">
import-card {
  title: "Relative import"
}
</q-html>
</body>
</html>
`);

const output = new QHtmlRoller({
  inputPath: fixture,
  projectRoot: root,
}).rollHtml(fs.readFileSync(fixture, 'utf8'));
const rerolledOutput = new QHtmlRoller({
  inputPath: fixture,
  projectRoot: root,
}).rollHtml(output);
const hiddenMatch = output.match(/<rendered-qhtml\b[^>]*>([\s\S]*?)<\/rendered-qhtml>/);
const hiddenOutput = hiddenMatch ? hiddenMatch[1] : '';

assert(output.includes('<q-html id="page">'), 'rolled output should preserve q-html tags');
assert(output.includes('src="qhtml.js"'), 'rolled output should preserve qhtml.js script tags');
assert(output.includes('<style>rendered-qhtml{display:none}</style>'), 'rolled output should hide SEO shadow markup');
assert(hiddenMatch, 'rolled output should append rendered-qhtml');
assert(hiddenOutput.includes('<h2> Hello </h2>'), 'component property interpolation should render into SEO shadow markup');
assert(hiddenOutput.includes('<p> Body copy </p>'), 'component slot content should render into SEO shadow markup');
assert(hiddenOutput.includes('src="docs/page.html"'), 'component-bound attributes should render into SEO shadow markup');
assert(hiddenOutput.includes('<strong> Nested import </strong>'), 'nested q-import should resolve relative to importing file');
assert(hiddenOutput.includes('<h3> Relative import </h3>'), 'imported components should be available before rendering later q-html blocks');
assert(hiddenOutput.includes('<span class="item"> One </span>'), 'model-view first row should render into SEO shadow markup');
assert(hiddenOutput.includes('<span class="item"> Two </span>'), 'model-view second row should render into SEO shadow markup');
assert(!output.includes('var payload='), 'rolled output should not emit runtime handler payloads');
assert(!output.includes('componentMethods'), 'rolled output should not emit component method scripts');
assert(!hiddenOutput.includes('${this.component.defaultUrl}'), 'component-bound attribute expressions should not leak into SEO shadow markup');
assert.strictEqual((rerolledOutput.match(/<rendered-qhtml\b/g) || []).length, 1, 'rerolling should replace the SEO shadow markup instead of duplicating it');
assert.strictEqual(rerolledOutput, output, 'rerolling should be byte-stable');

console.log('qhtml roller smoke ok');
