#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const INCLUDE_EXTENSIONS = new Set(['.js']);
const EXCLUDE_DIRS = new Set(['node_modules', '.git', 'coverage']);
const TARGET_DIRECTORIES = ['scripts', 'serverless'];
const EXCLUDE_FILES = new Set([path.join(__dirname, 'check-inline-docs.js')]);

function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    return null;
  }
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) {
      continue;
    }
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) {
        continue;
      }
      files.push(...walk(absolute));
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    const extension = path.extname(entry.name).toLowerCase();
    if (!INCLUDE_EXTENSIONS.has(extension)) {
      continue;
    }
    if (EXCLUDE_FILES.has(absolute)) {
      continue;
    }
    files.push(absolute);
  }
  return files;
}

function extractObjectLiteral(source, startIndex) {
  let index = startIndex;
  if (source[index] !== '{') {
    return null;
  }
  let depth = 0;
  let inSingleLineComment = false;
  let inMultiLineComment = false;
  let inString = false;
  let stringChar = '';
  for (; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (inSingleLineComment) {
      if (char === '\n') {
        inSingleLineComment = false;
      }
      continue;
    }
    if (inMultiLineComment) {
      if (char === '*' && next === '/') {
        inMultiLineComment = false;
        index += 1;
      }
      continue;
    }
    if (inString) {
      if (char === '\\') {
        index += 1;
        continue;
      }
      if (char === stringChar) {
        inString = false;
        stringChar = '';
      }
      continue;
    }

    if (char === '/' && next === '/') {
      inSingleLineComment = true;
      index += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      inMultiLineComment = true;
      index += 1;
      continue;
    }
    if (char === '\'' || char === '"' || char === '`') {
      inString = true;
      stringChar = char;
      continue;
    }

    if (char === '{') {
      depth += 1;
      continue;
    }
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return { content: source.slice(startIndex + 1, index), end: index };
      }
      continue;
    }
  }
  return null;
}

function parseObjectExports(source, prefixPattern) {
  const exports = new Set();
  const regex = new RegExp(prefixPattern, 'g');
  let match;
  while ((match = regex.exec(source))) {
    let index = match.index + match[0].length;
    while (index < source.length && /\s/.test(source[index])) {
      index += 1;
    }
    if (source[index] !== '{') {
      continue;
    }
    const literal = extractObjectLiteral(source, index);
    if (!literal) {
      continue;
    }
    const parts = splitTopLevel(literal.content);
    for (const part of parts) {
      const name = parsePropertyName(part);
      if (name) {
        exports.add(name);
      }
    }
  }
  return exports;
}

function splitTopLevel(content) {
  const parts = [];
  let depth = 0;
  let current = '';
  let inString = false;
  let stringChar = '';
  let inSingleLineComment = false;
  let inMultiLineComment = false;
  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];
    const next = content[i + 1];
    if (inSingleLineComment) {
      if (char === '\n') {
        inSingleLineComment = false;
      }
      current += char;
      continue;
    }
    if (inMultiLineComment) {
      if (char === '*' && next === '/') {
        inMultiLineComment = false;
        current += '*/';
        i += 1;
        continue;
      }
      current += char;
      continue;
    }
    if (inString) {
      current += char;
      if (char === '\\') {
        current += content[i + 1];
        i += 1;
        continue;
      }
      if (char === stringChar) {
        inString = false;
        stringChar = '';
      }
      continue;
    }
    if (char === '/' && next === '/') {
      inSingleLineComment = true;
      current += '//';
      i += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      inMultiLineComment = true;
      current += '/*';
      i += 1;
      continue;
    }
    if (char === '\'' || char === '"' || char === '`') {
      inString = true;
      stringChar = char;
      current += char;
      continue;
    }
    if (char === '{' || char === '[' || char === '(') {
      depth += 1;
      current += char;
      continue;
    }
    if (char === '}' || char === ']' || char === ')') {
      depth -= 1;
      current += char;
      continue;
    }
    if (char === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) {
    parts.push(current);
  }
  return parts;
}

function parsePropertyName(part) {
  const trimmed = part.trim();
  if (!trimmed || trimmed.startsWith('...')) {
    return null;
  }
  const match = trimmed.match(/^(?:['"]([^'"]+)['"]|([A-Za-z_$][\w$]*))/);
  if (!match) {
    return null;
  }
  return match[1] || match[2];
}

function findAssignmentExports(source, pattern) {
  const exports = new Set();
  const regex = new RegExp(pattern, 'g');
  let match;
  while ((match = regex.exec(source))) {
    exports.add(match[1]);
  }
  return exports;
}

function locateDefinition(source, name) {
  const patterns = [
    new RegExp(`function\\s+${name}\\s*\\(`),
    new RegExp(`const\\s+${name}\\s*=`),
    new RegExp(`let\\s+${name}\\s*=`),
    new RegExp(`var\\s+${name}\\s*=`),
    new RegExp(`${name}\\s*:\\s*(function|\\()`),
    new RegExp(`exports\\.${name}\\s*=`),
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(source);
    if (match) {
      return match.index;
    }
  }
  return -1;
}

function hasLeadingDoc(source, index) {
  if (index <= 0) {
    return false;
  }
  const before = source.slice(0, index);
  const docMatch = /\/\*\*[\s\S]*?\*\/\s*$/.exec(before);
  if (!docMatch) {
    return false;
  }
  const between = before.slice(docMatch.index + docMatch[0].length);
  return /^\s*$/.test(between);
}

function computeCoverage(filePath) {
  const source = readFile(filePath);
  if (!source) {
    return null;
  }
  const exports = new Set();
  const fromModuleExports = parseObjectExports(source, 'module\\.exports\\s*=');
  fromModuleExports.forEach((name) => exports.add(name));
  const fromAssignments = findAssignmentExports(
    source,
    'module\\.exports\\.([A-Za-z_$][\\w$]*)\\s*='
  );
  fromAssignments.forEach((name) => exports.add(name));
  const fromExportsAlias = findAssignmentExports(
    source,
    'exports\\.([A-Za-z_$][\\w$]*)\\s*='
  );
  fromExportsAlias.forEach((name) => exports.add(name));

  const exportedNames = Array.from(exports);
  if (exportedNames.length === 0) {
    return null;
  }
  let documented = 0;
  for (const name of exportedNames) {
    const index = locateDefinition(source, name);
    if (index !== -1 && hasLeadingDoc(source, index)) {
      documented += 1;
    }
  }
  const coverage = documented / exportedNames.length;
  return {
    filePath,
    source,
    exported: exportedNames,
    documented,
    total: exportedNames.length,
    coverage,
  };
}

function collectTargetFiles() {
  const files = [];
  for (const relativeDir of TARGET_DIRECTORIES) {
    const directory = path.join(PROJECT_ROOT, relativeDir);
    if (!fs.existsSync(directory)) {
      continue;
    }
    files.push(...walk(directory));
  }
  return files;
}

function main() {
  const allFiles = collectTargetFiles();
  const results = [];
  for (const file of allFiles) {
    const coverage = computeCoverage(file);
    if (coverage) {
      results.push(coverage);
    }
  }
  const failures = results.filter((entry) => entry.coverage < 0.8);
  if (failures.length > 0) {
    console.error('\nInline documentation coverage check failed.');
    for (const failure of failures) {
      const missing = failure.exported.filter((name) => {
        const index = locateDefinition(failure.source, name);
        return !(index !== -1 && hasLeadingDoc(failure.source, index));
      });
      const relativePath = path.relative(PROJECT_ROOT, failure.filePath);
      const percentage = Math.round(failure.coverage * 100);
      console.error(
        `- ${relativePath}: ${failure.documented}/${failure.total} documented (${percentage}%) missing => ${missing.join(', ')}`
      );
    }
    process.exitCode = 1;
    return;
  }
  console.log('Inline documentation coverage passed.');
}

main();
