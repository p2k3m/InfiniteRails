#!/usr/bin/env node
/**
 * Runs the automated test suites required before publishing a release.
 * This ensures the Vitest unit tests and Playwright smoke tests both pass
 * before `npm publish` or an explicit pre-release check.
 */
const { spawnSync } = require('node:child_process');

const checks = [
  {
    label: 'Asset manifest validation',
    command: 'npm',
    args: ['run', 'check:assets'],
  },
  {
    label: 'Vitest unit suite',
    command: 'npm',
    args: ['run', 'test'],
  },
  {
    label: 'Playwright E2E suite',
    command: 'npm',
    args: ['run', 'test:e2e'],
  },
];

for (const { label, command, args } of checks) {
  console.log(`\n[pre-release] Running ${label}...`);
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.status !== 0) {
    console.error(`\n[pre-release] ${label} failed. Aborting.`);
    process.exit(result.status ?? 1);
  }
}

console.log('\n[pre-release] All required test suites passed.');
