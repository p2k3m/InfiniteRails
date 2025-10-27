#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function ensureEnv() {
  const required = ['GITHUB_TOKEN', 'GITHUB_REPOSITORY'];
  const missingRequired = required.filter((key) => !process.env[key] || !process.env[key].trim());
  if (missingRequired.length > 0) {
    console.error(`Missing required environment variables: ${missingRequired.join(', ')}`);
    console.error('Ensure the workflow or runner exports these secrets before invoking the fixer.');
  }

  const hasOpenAiKey = Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim());
  if (!hasOpenAiKey) {
    console.warn('OPENAI_API_KEY is not set. Auto fixer will run in no-op mode.');
  }

  return { missingRequired, hasOpenAiKey };
}

const { missingRequired, hasOpenAiKey } = ensureEnv();

const githubToken = process.env.GITHUB_TOKEN ? process.env.GITHUB_TOKEN.trim() : null;
const repo = process.env.GITHUB_REPOSITORY ? process.env.GITHUB_REPOSITORY.trim() : null;

const config = {
  repo,
  githubToken,
  githubApiBase: process.env.GITHUB_API_URL || 'https://api.github.com',
  githubGraphqlUrl: process.env.GITHUB_GRAPHQL_URL || 'https://api.github.com/graphql',
  githubServerUrl: process.env.GITHUB_SERVER_URL || 'https://github.com',
  targetBranch: process.env.TARGET_BRANCH || 'main',
  maxAttempts: Number(process.env.MAX_FIX_ATTEMPTS || 3),
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS || 60000),
  checkTimeoutMs: Number(process.env.CHECK_TIMEOUT_MS || 30 * 60 * 1000),
  mergeTimeoutMs: Number(process.env.MERGE_TIMEOUT_MS || 30 * 60 * 1000),
  mainRunTimeoutMs: Number(process.env.MAIN_RUN_TIMEOUT_MS || 30 * 60 * 1000),
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  openaiUrl: process.env.OPENAI_API_URL || 'https://api.openai.com/v1/chat/completions',
  useOpenAi: hasOpenAiKey,
  hasRequiredEnv: missingRequired.length === 0,
  maxLogLines: Number(process.env.MAX_LOG_LINES || 200),
  branchPrefix: process.env.AUTO_FIX_BRANCH_PREFIX || 'auto-fix/',
  autoMergeMethod: process.env.AUTO_MERGE_METHOD || 'SQUASH',
  targetRunId: process.env.TARGET_RUN_ID ? Number(process.env.TARGET_RUN_ID) : null,
  gitUserName: process.env.GIT_AUTHOR_NAME || 'infinite-rails-auto-fixer',
  gitUserEmail: process.env.GIT_AUTHOR_EMAIL || 'auto-fixer@example.com',
};

config.githubHost = new URL(config.githubServerUrl).host;

async function githubRequest(endpoint, { method = 'GET', body, headers = {}, raw = false } = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${config.githubApiBase.replace(/\/$/, '')}${endpoint}`;
  const requestHeaders = {
    Authorization: `Bearer ${config.githubToken}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'infinite-rails-auto-fixer',
    ...headers,
  };
  const response = await fetch(url, {
    method,
    headers: requestHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub API ${method} ${url} failed with ${response.status}: ${errorText}`);
  }
  if (raw) {
    return response;
  }
  if (response.status === 204) {
    return null;
  }
  return response.json();
}

async function githubGraphql(query, variables = {}) {
  const response = await fetch(config.githubGraphqlUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.githubToken}`,
      'Content-Type': 'application/json',
      'User-Agent': 'infinite-rails-auto-fixer',
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub GraphQL request failed with ${response.status}: ${errorText}`);
  }
  const payload = await response.json();
  if (payload.errors && payload.errors.length > 0) {
    throw new Error(`GitHub GraphQL returned errors: ${JSON.stringify(payload.errors)}`);
  }
  return payload.data;
}

async function fetchWorkflowRun(runId) {
  return githubRequest(`/repos/${config.repo}/actions/runs/${runId}`);
}

async function getLatestFailedRun(processed) {
  const response = await githubRequest(`/repos/${config.repo}/actions/runs?branch=${encodeURIComponent(config.targetBranch)}&status=failure&per_page=20`);
  const runs = (response.workflow_runs || []).filter((run) => !processed.has(run.id));
  if (runs.length === 0) {
    return null;
  }
  runs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return runs[0];
}

async function getInitialRun(processed) {
  if (config.targetRunId) {
    const run = await fetchWorkflowRun(config.targetRunId);
    if (!run) {
      throw new Error(`Workflow run ${config.targetRunId} not found`);
    }
    if (run.head_branch !== config.targetBranch) {
      console.warn(`Target run ${config.targetRunId} is on branch ${run.head_branch}; expected ${config.targetBranch}. Proceeding anyway.`);
    }
    if (run.conclusion && run.conclusion !== 'failure') {
      console.warn(`Target run ${config.targetRunId} concluded with ${run.conclusion}; searching for another failed run.`);
      return getLatestFailedRun(processed);
    }
    if (processed.has(run.id)) {
      return getLatestFailedRun(processed);
    }
    return run;
  }
  return getLatestFailedRun(processed);
}

async function fetchRunJobs(runId, page = 1, accumulated = []) {
  const response = await githubRequest(`/repos/${config.repo}/actions/runs/${runId}/jobs?per_page=100&page=${page}`);
  const jobs = accumulated.concat(response.jobs || []);
  if (response.total_count && jobs.length < response.total_count) {
    return fetchRunJobs(runId, page + 1, jobs);
  }
  return jobs;
}

async function downloadJobLog(jobId) {
  const response = await githubRequest(`/repos/${config.repo}/actions/jobs/${jobId}/logs`, {
    headers: { Accept: 'application/vnd.github.v3.raw' },
    raw: true,
  });
  return response.text();
}

function createLogSummary(logText) {
  const lines = logText.split(/\r?\n/);
  const tail = lines.slice(-config.maxLogLines);
  const errorLines = lines.filter((line) => /error|failed|exception|traceback/i.test(line)).slice(-Math.min(config.maxLogLines, 40));
  const summary = [];
  if (errorLines.length) {
    summary.push('Key failure markers:');
    summary.push(...errorLines);
  }
  summary.push('Recent log tail:');
  summary.push(...tail);
  return summary.join('\n');
}

async function collectFailureContext(run) {
  const jobs = await fetchRunJobs(run.id);
  if (jobs.length === 0) {
    throw new Error(`No jobs found for workflow run ${run.id}`);
  }
  const failingJob = jobs.find((job) => job.conclusion === 'failure') || jobs[0];
  const logText = await downloadJobLog(failingJob.id);
  const summary = createLogSummary(logText);
  return {
    job: failingJob,
    logSummary: summary,
    logExcerpt: summary.split('\n').slice(-config.maxLogLines).join('\n'),
  };
}

async function callLlmForPatch(run, failureContext, attempt) {
  const systemMessage = {
    role: 'system',
    content: 'You are an autonomous GitHub maintenance agent. Given CI failure context, you must generate a unified diff patch that resolves the failure. Reply with only the diff. Do not include prose, explanations, or code fences. The diff must apply cleanly with `git apply`.',
  };
  const userMessage = {
    role: 'user',
    content: `Repository: ${config.repo}\nTarget branch: ${config.targetBranch}\nWorkflow run: ${run.name} (#${run.id})\nAttempt: ${attempt}\nFailure job: ${failureContext.job.name} (${failureContext.job.id})\nFailure summary:\n${failureContext.logSummary}\n\nGenerate a unified diff that fixes the failure. Ensure file paths are relative to the repository root.`,
  };

  const response = await fetch(config.openaiUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.openaiModel,
      temperature: 0,
      messages: [systemMessage, userMessage],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI request failed with ${response.status}: ${errorText}`);
  }

  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content;
  if (!content || !content.trim()) {
    throw new Error('OpenAI response did not include content');
  }
  return content.trim();
}

function extractDiff(rawResponse) {
  const fenced = rawResponse.match(/```diff\s*([\s\S]*?)```/i) || rawResponse.match(/```\s*([\s\S]*?)```/i);
  const diffText = fenced ? fenced[1].trim() : rawResponse.trim();
  if (!diffText.startsWith('diff --git')) {
    throw new Error('LLM response did not start with "diff --git"; cannot apply patch.');
  }
  return diffText;
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit' });
    if (options.capture) {
      let stdout = '';
      let stderr = '';
      if (child.stdout) {
        child.stdout.on('data', (data) => {
          stdout += data.toString();
        });
      }
      if (child.stderr) {
        child.stderr.on('data', (data) => {
          stderr += data.toString();
        });
      }
      child.on('close', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(new Error(`Command failed (${command} ${args.join(' ')}): ${stderr || stdout}`));
        }
      });
    } else {
      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Command failed: ${command} ${args.join(' ')}`));
        }
      });
    }
  });
}

async function applyPatchAndPush(diffText, run, attempt) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-fix-'));
  const remoteBase = config.githubServerUrl.endsWith('/')
    ? config.githubServerUrl
    : `${config.githubServerUrl}/`;
  const remote = new URL(`${config.repo}.git`, remoteBase);
  remote.username = config.githubToken;
  const authRemote = remote.toString();

  await runCommand('git', ['clone', authRemote, tempDir]);
  await runCommand('git', ['config', 'user.name', config.gitUserName], { cwd: tempDir });
  await runCommand('git', ['config', 'user.email', config.gitUserEmail], { cwd: tempDir });
  await runCommand('git', ['checkout', config.targetBranch], { cwd: tempDir });

  const branchName = `${config.branchPrefix}${run.id}-${Date.now()}-attempt-${attempt}`;
  await runCommand('git', ['checkout', '-b', branchName], { cwd: tempDir });

  const patchPath = path.join(tempDir, 'llm.patch');
  fs.writeFileSync(patchPath, `${diffText}\n`, 'utf8');

  try {
    await runCommand('git', ['apply', '--whitespace=fix', patchPath], { cwd: tempDir });
  } catch (error) {
    throw new Error(`Failed to apply diff: ${error.message}`);
  }

  const status = await runCommand('git', ['status', '--porcelain'], { cwd: tempDir, capture: true });
  if (!status.stdout.trim()) {
    throw new Error('Patch applied but produced no changes; aborting.');
  }

  await runCommand('git', ['add', '-A'], { cwd: tempDir });
  const commitMessage = `Auto fix for workflow run #${run.id} (attempt ${attempt})`;
  await runCommand('git', ['commit', '-m', commitMessage], { cwd: tempDir });
  await runCommand('git', ['push', 'origin', branchName], { cwd: tempDir });
  const headSha = (await runCommand('git', ['rev-parse', branchName], { cwd: tempDir, capture: true })).stdout.trim();

  return { branchName, headSha, localDir: tempDir };
}

async function createPullRequest(run, branchName, attempt, failureContext) {
  const bodyLines = [
    `Automated fix attempt ${attempt} for workflow run [#${run.id}](${run.html_url}).`,
    '',
    'Failure summary:',
    '```',
    failureContext.logExcerpt,
    '```',
  ];
  const pullRequest = await githubRequest(`/repos/${config.repo}/pulls`, {
    method: 'POST',
    body: {
      title: `Auto fix: workflow run #${run.id} (attempt ${attempt})`,
      head: branchName,
      base: config.targetBranch,
      body: bodyLines.join('\n'),
      maintainer_can_modify: true,
    },
  });
  return pullRequest;
}

async function enableAutoMerge(pr) {
  try {
    await githubGraphql(
      `mutation EnableAutoMerge($pullRequestId: ID!, $mergeMethod: PullRequestMergeMethod!) {
        enablePullRequestAutoMerge(input: { pullRequestId: $pullRequestId, mergeMethod: $mergeMethod }) {
          pullRequest { number }
        }
      }`,
      { pullRequestId: pr.node_id, mergeMethod: config.autoMergeMethod }
    );
    console.log(`Enabled auto-merge for PR #${pr.number}`);
  } catch (error) {
    console.warn(`Failed to enable auto-merge for PR #${pr.number}: ${error.message}`);
  }
}

async function waitForChecks(headSha) {
  const start = Date.now();
  while (Date.now() - start < config.checkTimeoutMs) {
    const status = await githubRequest(`/repos/${config.repo}/commits/${headSha}/status`);
    if (!status || !status.state) {
      await delay(config.pollIntervalMs);
      continue;
    }
    if (status.state === 'success') {
      return { state: 'success', status };
    }
    if (status.state === 'failure' || status.state === 'error') {
      return { state: 'failure', status };
    }
    await delay(config.pollIntervalMs);
  }
  throw new Error('Timed out waiting for status checks to complete');
}

async function closePullRequest(prNumber, reason) {
  try {
    await githubRequest(`/repos/${config.repo}/pulls/${prNumber}`, {
      method: 'PATCH',
      body: { state: 'closed' },
    });
    console.log(`Closed PR #${prNumber}: ${reason}`);
  } catch (error) {
    console.warn(`Failed to close PR #${prNumber}: ${error.message}`);
  }
}

async function waitForMerge(prNumber) {
  const start = Date.now();
  while (Date.now() - start < config.mergeTimeoutMs) {
    const pr = await githubRequest(`/repos/${config.repo}/pulls/${prNumber}`);
    if (pr.merged) {
      return { merged: true, mergeSha: pr.merge_commit_sha };
    }
    if (pr.state === 'closed' && !pr.merged) {
      return { merged: false };
    }
    await delay(config.pollIntervalMs);
  }
  throw new Error(`Timed out waiting for PR #${prNumber} to merge`);
}

async function waitForMainRun(sha) {
  const start = Date.now();
  while (Date.now() - start < config.mainRunTimeoutMs) {
    const response = await githubRequest(`/repos/${config.repo}/actions/runs?branch=${encodeURIComponent(config.targetBranch)}&per_page=50`);
    const run = (response.workflow_runs || []).find((item) => item.head_sha === sha);
    if (run) {
      if (run.status === 'completed') {
        return run;
      }
    }
    await delay(config.pollIntervalMs);
  }
  throw new Error(`Timed out waiting for workflow on ${config.targetBranch} with head SHA ${sha}`);
}

async function main() {
  if (!config.hasRequiredEnv) {
    console.log('Missing GitHub credentials. Skipping automated fix attempt.');
    return;
  }

  if (!config.useOpenAi) {
    console.log('OPENAI_API_KEY is not available. Skipping automated fix attempt.');
    return;
  }

  const processedRuns = new Set();
  let attempt = 1;
  let run = await getInitialRun(processedRuns);

  if (!run) {
    console.log('No failed workflow runs detected on the target branch. Exiting.');
    return;
  }

  while (attempt <= config.maxAttempts && run) {
    processedRuns.add(run.id);
    console.log(`Attempt ${attempt}: addressing workflow run #${run.id} (${run.html_url})`);

    const failureContext = await collectFailureContext(run);
    console.log('Failure summary prepared for LLM.');

    const llmResponse = await callLlmForPatch(run, failureContext, attempt);
    const diffText = extractDiff(llmResponse);
    console.log('Received diff from LLM. Applying patch...');

    const { branchName, headSha } = await applyPatchAndPush(diffText, run, attempt);
    console.log(`Pushed branch ${branchName} with head SHA ${headSha}`);

    const pr = await createPullRequest(run, branchName, attempt, failureContext);
    console.log(`Opened PR #${pr.number}: ${pr.html_url}`);

    await enableAutoMerge(pr);

    const checkResult = await waitForChecks(headSha);
    if (checkResult.state !== 'success') {
      console.warn(`Status checks failed for commit ${headSha}.`);
      await closePullRequest(pr.number, 'status checks failed');
      run = await getLatestFailedRun(processedRuns);
      attempt += 1;
      if (!run) {
        console.log('No additional failed runs detected. Exiting.');
      }
      continue;
    }

    console.log('PR checks succeeded. Waiting for auto-merge...');
    const mergeResult = await waitForMerge(pr.number);
    if (!mergeResult.merged) {
      throw new Error(`PR #${pr.number} was closed without merging. Manual intervention required.`);
    }

    console.log(`PR merged. Waiting for workflow on ${config.targetBranch} (SHA ${mergeResult.mergeSha}).`);
    const mainRun = await waitForMainRun(mergeResult.mergeSha);
    if (mainRun.conclusion === 'success') {
      console.log('Main branch workflow succeeded. Auto fixer completed successfully.');
      return;
    }

    console.warn(`Main branch workflow ${mainRun.id} failed after merge. Iterating.`);
    run = mainRun;
    attempt += 1;
  }

  if (attempt > config.maxAttempts) {
    throw new Error(`Reached maximum number of attempts (${config.maxAttempts}) without resolving failures.`);
  }
}

main().catch((error) => {
  console.error(`Auto pipeline fixer failed: ${error.stack || error.message}`);
  process.exit(1);
});
