# Auto pipeline fixer

The auto pipeline fixer combines GitHub Actions and an LLM-backed remediation script to repair
failed workflow runs on the `main` branch. The workflow is triggered whenever another workflow
completes with a `failure` conclusion on `main` and automatically iterates on fixes until the
pipeline succeeds or the retry budget is exhausted.

## Required secrets and configuration

Add the following repository or organisation secrets so the fixer can authenticate with external
services and push changes:

| Secret | Purpose |
| --- | --- |
| `AUTO_FIX_GITHUB_TOKEN` | Fine-grained PAT with `contents:write`, `pull_requests:write`, `checks:read`, and `actions:read` scopes so the fixer can push branches, open PRs, and toggle auto-merge. Falls back to `GITHUB_TOKEN` when unset. |
| `AUTO_FIX_OPENAI_API_KEY` | API key used to request unified diffs from the LLM. |
| `AUTO_FIX_GIT_AUTHOR_NAME` (optional) | Overrides the Git author name when commits are created. |
| `AUTO_FIX_GIT_AUTHOR_EMAIL` (optional) | Overrides the Git author email when commits are created. |

The script also honours the environment variables below when you need to customise behaviour:

- `TARGET_BRANCH` (default `main`)
- `MAX_FIX_ATTEMPTS` (default `3`)
- `POLL_INTERVAL_MS` (default `60000`)
- `CHECK_TIMEOUT_MS`, `MERGE_TIMEOUT_MS`, `MAIN_RUN_TIMEOUT_MS`
- `OPENAI_MODEL` (default `gpt-4o-mini`)
- `AUTO_FIX_BRANCH_PREFIX` (default `auto-fix/`)
- `AUTO_MERGE_METHOD` (default `SQUASH`)

## Execution flow

1. Detect the most recent failed workflow run on `main` (or the `TARGET_RUN_ID` provided by the
   workflow event).
2. Collect failing job logs and build a concise summary for the LLM prompt.
3. Request a unified diff from the configured LLM model.
4. Clone the repository, create a scratch branch, apply the diff, commit, and push.
5. Open a pull request, enable auto-merge, and wait for branch checks to pass.
6. After the PR merges, monitor the subsequent workflow run on `main`. If it fails, feed the new
   failure back into the loop until success or until the maximum attempts is reached.

If the fixer cannot apply the diff, pushes a PR that fails checks, or reaches the attempt limit,
the workflow exits with a non-zero status so that manual intervention can step in.
