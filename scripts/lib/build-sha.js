const { execSync } = require('node:child_process');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..');
const BUILD_SHA_LENGTH = 12;

function normaliseSha(value) {
  if (!value || typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const hex = trimmed.toLowerCase();
  if (!/^[0-9a-f]+$/.test(hex)) {
    return null;
  }
  return hex.slice(0, BUILD_SHA_LENGTH);
}

function runGit(command) {
  try {
    return execSync(command, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (error) {
    return null;
  }
}

function describeWorkingTreeState() {
  const status = runGit('git status --porcelain');
  if (!status) {
    return 'clean';
  }
  return status.split('\n').some((line) => line.trim()) ? 'dirty' : 'clean';
}

function resolveBuildSha({ allowDirty = true } = {}) {
  const envCandidates = [process.env.BUILD_SHA, process.env.GITHUB_SHA, process.env.COMMIT_SHA];
  for (const candidate of envCandidates) {
    const normalised = normaliseSha(candidate);
    if (normalised) {
      return normalised;
    }
  }

  const headSha = normaliseSha(runGit('git rev-parse HEAD'));
  if (headSha) {
    const state = describeWorkingTreeState();
    if (state === 'clean' || allowDirty) {
      if (state === 'dirty' && allowDirty) {
        return `${headSha}-dirty`;
      }
      return headSha;
    }
  }

  const treeSha = normaliseSha(runGit('git write-tree'));
  if (treeSha) {
    return treeSha;
  }

  return 'devbuild';
}

module.exports = {
  BUILD_SHA_LENGTH,
  resolveBuildSha,
};
