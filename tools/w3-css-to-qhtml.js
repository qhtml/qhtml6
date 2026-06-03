#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

function usage() {
  console.error([
    "Usage: node tools/w3-css-to-qhtml.js [input.css] [output.qhtml]",
    "",
    "Defaults:",
    "  input.css    dist/w3.css",
    "  output.qhtml dist/w3.qhtml",
  ].join("\n"));
}

function readBalancedBlock(source, openBraceIndex) {
  let quote = "";
  let escaped = false;
  let depth = 0;
  for (let i = openBraceIndex; i < source.length; i += 1) {
    const ch = source[i];
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
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === "{") {
      depth += 1;
      continue;
    }
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return {
          body: source.slice(openBraceIndex + 1, i),
          end: i + 1,
        };
      }
    }
  }
  throw new Error("Unclosed CSS block at offset " + openBraceIndex);
}

function stripComments(css) {
  return String(css || "").replace(/\/\*[\s\S]*?\*\//g, "");
}

function findNextTopLevelBrace(source, start) {
  let quote = "";
  let escaped = false;
  let parenDepth = 0;
  let bracketDepth = 0;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
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
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === "(") {
      parenDepth += 1;
      continue;
    }
    if (ch === ")" && parenDepth > 0) {
      parenDepth -= 1;
      continue;
    }
    if (ch === "[") {
      bracketDepth += 1;
      continue;
    }
    if (ch === "]" && bracketDepth > 0) {
      bracketDepth -= 1;
      continue;
    }
    if (parenDepth === 0 && bracketDepth === 0 && ch === "{") {
      return i;
    }
  }
  return -1;
}

function findDeclarationColon(text) {
  let quote = "";
  let escaped = false;
  let parenDepth = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
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
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === "(") {
      parenDepth += 1;
      continue;
    }
    if (ch === ")" && parenDepth > 0) {
      parenDepth -= 1;
      continue;
    }
    if (parenDepth === 0 && ch === ":") {
      return i;
    }
  }
  return -1;
}

function splitDeclarations(body) {
  const declarations = [];
  let quote = "";
  let escaped = false;
  let parenDepth = 0;
  let start = 0;
  const text = String(body || "");
  for (let i = 0; i <= text.length; i += 1) {
    const ch = i < text.length ? text[i] : ";";
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
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === "(") {
      parenDepth += 1;
      continue;
    }
    if (ch === ")" && parenDepth > 0) {
      parenDepth -= 1;
      continue;
    }
    if (parenDepth === 0 && ch === ";") {
      const declaration = text.slice(start, i).trim();
      start = i + 1;
      if (!declaration) {
        continue;
      }
      const colon = findDeclarationColon(declaration);
      if (colon <= 0) {
        continue;
      }
      const property = declaration.slice(0, colon).trim().toLowerCase();
      const value = declaration.slice(colon + 1).trim();
      if (property && value) {
        declarations.push({ property, value });
      }
    }
  }
  return declarations;
}

function normalizeSelector(selector) {
  return String(selector || "")
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ",")
    .trim();
}

function parseCssRules(css) {
  const source = stripComments(css);
  const rules = [];
  const skippedAtRules = [];
  let index = 0;

  while (index < source.length) {
    while (index < source.length && /\s/.test(source[index])) {
      index += 1;
    }
    if (index >= source.length) {
      break;
    }
    if (source[index] === "@") {
      const open = findNextTopLevelBrace(source, index);
      const semi = source.indexOf(";", index);
      if (semi !== -1 && (open === -1 || semi < open)) {
        skippedAtRules.push(source.slice(index, semi + 1).trim());
        index = semi + 1;
        continue;
      }
      if (open === -1) {
        skippedAtRules.push(source.slice(index).trim());
        break;
      }
      const atHeader = source.slice(index, open).trim();
      const block = readBalancedBlock(source, open);
      skippedAtRules.push(atHeader);
      index = block.end;
      continue;
    }

    const open = findNextTopLevelBrace(source, index);
    if (open === -1) {
      break;
    }
    const selector = normalizeSelector(source.slice(index, open));
    const block = readBalancedBlock(source, open);
    index = block.end;
    if (!selector || selector.indexOf("@") === 0) {
      continue;
    }
    const declarations = splitDeclarations(block.body);
    if (declarations.length > 0) {
      rules.push({ selector, declarations });
    }
  }

  return { rules, skippedAtRules };
}

function qhtmlValueFor(value) {
  const text = String(value || "").trim();
  if (/[,\n\r;{}]/.test(text)) {
    return " { " + text + " }";
  }
  return ": " + text;
}

function renderQTheme(rules, metadata) {
  const lines = [
    "/*",
    "  Auto-generated by tools/w3-css-to-qhtml.js.",
    "  Source: " + metadata.source,
    "  Generated rules: " + rules.length,
    "  Skipped at-rules: " + metadata.skippedAtRuleCount,
    "*/",
    "",
    "q-theme w3-css {",
  ];

  for (const rule of rules) {
    lines.push("  " + rule.selector + " {");
    lines.push("    q-style {");
    for (const declaration of rule.declarations) {
      lines.push("      " + declaration.property + qhtmlValueFor(declaration.value));
    }
    lines.push("    }");
    lines.push("  }");
  }

  lines.push("}");
  lines.push("");
  return lines.join("\n");
}

function main(argv) {
  const projectRoot = path.resolve(__dirname, "..");
  const inputPath = path.resolve(projectRoot, argv[2] || "dist/w3.css");
  const outputPath = path.resolve(projectRoot, argv[3] || "dist/w3.qhtml");

  if (argv[2] === "-h" || argv[2] === "--help") {
    usage();
    process.exit(0);
  }
  if (!fs.existsSync(inputPath)) {
    throw new Error("Input CSS file not found: " + inputPath);
  }

  const css = fs.readFileSync(inputPath, "utf8");
  const parsed = parseCssRules(css);
  const output = renderQTheme(parsed.rules, {
    source: path.relative(projectRoot, inputPath),
    skippedAtRuleCount: parsed.skippedAtRules.length,
  });

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, output, "utf8");
  console.log("Wrote " + outputPath);
  console.log("Rules: " + parsed.rules.length);
  if (parsed.skippedAtRules.length > 0) {
    console.log("Skipped at-rules: " + parsed.skippedAtRules.length);
  }
}

if (require.main === module) {
  try {
    main(process.argv);
  } catch (error) {
    console.error(error && error.message ? error.message : error);
    process.exit(1);
  }
}
