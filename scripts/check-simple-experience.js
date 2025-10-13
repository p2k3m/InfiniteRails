#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const filePath = path.resolve(__dirname, '..', 'simple-experience.js');

function exitWithError(message) {
  console.error(`\u001b[31m[check-simple-experience]\u001b[0m ${message}`);
  process.exit(1);
}

if (!fs.existsSync(filePath)) {
  exitWithError(
    'simple-experience.js is missing. Restore the sandbox renderer bundle before running the Vitest suite.',
  );
}

let source;
try {
  source = fs.readFileSync(filePath, 'utf8');
} catch (error) {
  exitWithError(`Failed to read simple-experience.js: ${error.message}`);
}

const trimmedLength = source.trim().length;
const minimumCharacterCount = 1000;
const requiredSnippets = [
  'class SimpleExperience',
  'window.SimpleExperience',
  'Scene population check fired',
];

if (trimmedLength < minimumCharacterCount) {
  exitWithError(
    `simple-experience.js appears truncated (${trimmedLength} characters). Restore the full bundle so renderer-dependent tests can execute.`,
  );
}

const missingSnippets = requiredSnippets.filter((snippet) => !source.includes(snippet));
if (missingSnippets.length > 0) {
  exitWithError(
    `simple-experience.js is missing expected content (${missingSnippets.join(
      ', ',
    )}). Ensure the production-ready sandbox renderer is checked in before running tests.`,
  );
}

process.exit(0);
