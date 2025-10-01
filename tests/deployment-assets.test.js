import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '..');
const indexHtmlPath = path.join(repoRoot, 'index.html');
const workflowPath = path.join(repoRoot, '.github', 'workflows', 'deploy.yml');

const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
const workflowContents = fs.readFileSync(workflowPath, 'utf8');

function extractLocalScriptSources(html) {
  const results = new Set();
  const scriptRegex = /<script[^>]*\ssrc=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = scriptRegex.exec(html)) !== null) {
    const src = match[1];
    if (!isExternalReference(src)) {
      results.add(normalisePath(src));
    }
  }
  return Array.from(results);
}

function extractLocalLinkHrefs(html) {
  const results = new Set();
  const linkRegex = /<link[^>]*\shref=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[1];
    if (!isExternalReference(href)) {
      results.add(normalisePath(href));
    }
  }
  return Array.from(results);
}

function normalisePath(value) {
  if (!value) return value;
  return value.replace(/^\.\//, '').split('?')[0];
}

function isExternalReference(value) {
  if (!value) return false;
  return /^(?:https?:)?\/\//i.test(value) || value.startsWith('data:') || value.startsWith('mailto:');
}

function extractIncludePatterns(workflow) {
  const patterns = [];
  const includeRegex = /--include\s+"([^"]+)"/g;
  let match;
  while ((match = includeRegex.exec(workflow)) !== null) {
    patterns.push(match[1]);
  }
  return patterns;
}

function patternMatchesAsset(pattern, asset) {
  if (pattern.includes('*')) {
    const [prefix] = pattern.split('*', 1);
    return asset.startsWith(prefix);
  }
  return asset === pattern;
}

describe('deployment workflow asset coverage', () => {
  it('syncs every local asset referenced by index.html', () => {
    const localAssets = new Set([
      ...extractLocalScriptSources(indexHtml),
      ...extractLocalLinkHrefs(indexHtml),
    ]);

    const includePatterns = extractIncludePatterns(workflowContents);

    const missing = Array.from(localAssets).filter((asset) =>
      asset && !includePatterns.some((pattern) => patternMatchesAsset(pattern, asset)),
    );

    expect(missing).toEqual([]);
  });
});
