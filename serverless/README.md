# Infinite Dimension Serverless Backend

This directory packages the optional AWS backend that powers Google-authenticated explorer profiles and the multiverse scoreboard. It is built with [AWS Serverless Application Model (SAM)](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/what-is-sam.html) and deploys two Lambda functions alongside DynamoDB tables.

## Architecture overview

- **UsersFunction (`/users`, POST)** – Accepts signed-in Google profile metadata plus device and geolocation snapshots. Records the latest explorer state in the `UsersTable` keyed by `googleId`.
- **ScoresFunction (`/scores`, GET & POST)** – Reads leaderboard entries from the `ScoreIndex` global secondary index and upserts victories. The handler preserves a player's best score while updating run statistics and location metadata.
- **UsersTable** – Pay-per-request DynamoDB table storing explorer profiles.
- **ScoresTable** – Pay-per-request DynamoDB table storing leaderboard entries. A GSI named `ScoreIndex` keeps the highest scores at the top by sorting on the negated score.

All endpoints respond with permissive CORS headers so the static frontend can call them directly from any origin.

## Deployment

```bash
cd serverless
sam build
sam deploy --guided
```

During the guided deployment you can keep the default stack name and allow SAM to create the necessary IAM roles. When the deployment completes SAM prints the API endpoint URL—copy it into `window.APP_CONFIG.apiBaseUrl` so the browser client can sync to DynamoDB.

## Environment variables

The SAM template injects the following environment variables into each Lambda at deploy time:

| Variable | Purpose |
| --- | --- |
| `USERS_TABLE` | Name of the DynamoDB table for explorer profiles. |
| `SCORES_TABLE` | Name of the DynamoDB table for leaderboard entries. |
| `SCORES_INDEX_NAME` | Name of the GSI (`ScoreIndex`) used to read the leaderboard in score order. |

## Local testing

Install the SAM CLI and start a local API instance:

```bash
sam local start-api
```

The local gateway proxies requests to the Lambda handlers, allowing you to validate Google payload parsing and DynamoDB writes with [DynamoDB Local](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DynamoDBLocal.html) or a provisioned test table.
