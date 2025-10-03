#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

async function bundleThree() {
  const repoRoot = path.resolve(__dirname, '..');
  const vendorDir = path.join(repoRoot, 'vendor');
  const outputFile = path.join(vendorDir, 'three.min.js');
  const resolvedThree = require.resolve('three');
  const entryPoint = path.join(path.dirname(resolvedThree), 'three.module.js');
  const threePackageJsonPath = path.join(path.dirname(resolvedThree), '..', 'package.json');
  const { version } = JSON.parse(fs.readFileSync(threePackageJsonPath, 'utf8'));

  await esbuild.build({
    entryPoints: [entryPoint],
    bundle: true,
    format: 'iife',
    globalName: 'THREE_GLOBAL',
    minify: true,
    sourcemap: false,
    target: ['es2020'],
    legalComments: 'inline',
    outfile: outputFile,
    banner: {
      js: `/*! three@${version} – bundled via esbuild */\n`,
    },
    footer: {
      js: `\nif (typeof globalThis !== 'undefined') {\n  if (globalThis.THREE_GLOBAL && globalThis.THREE_GLOBAL !== THREE_GLOBAL) {\n    console.warn('Multiple Three.js bundles detected; preserving the existing singleton.');\n    THREE_GLOBAL = globalThis.THREE_GLOBAL;\n  } else {\n    globalThis.THREE_GLOBAL = THREE_GLOBAL;\n  }\n}\n`,
    },
  });

  const outputSource = fs.readFileSync(outputFile, 'utf8');
  if (!outputSource.includes(`three@${version}`)) {
    throw new Error('Three.js vendor bundle missing version banner.');
  }
  if (!outputSource.includes('globalThis.THREE_GLOBAL')) {
    throw new Error('Three.js vendor bundle missing singleton guard.');
  }

  console.log(`Bundled three@${version} -> ${path.relative(repoRoot, outputFile)}`);
}

bundleThree().catch((error) => {
  console.error('Failed to bundle Three.js.', error);
  process.exitCode = 1;
});
