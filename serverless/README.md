# Infinite Dimension Serverless Backend

This directory packages the optional AWS backend that powers Google-authenticated explorer profiles and the multiverse scoreboard. It is built with [AWS Serverless Application Model (SAM)](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/what-is-sam.html) and deploys two Lambda functions alongside DynamoDB tables.

## Architecture overview

- **UsersFunction (`/users`, POST)** – Accepts signed-in Google profile metadata plus device and geolocation snapshots. Records the latest explorer state in the `UsersTable` keyed by `googleId`.
- **ScoresFunction (`/scores`, GET & POST)** – Reads leaderboard entries from the `ScoreIndex` global secondary index and upserts victories. The handler preserves a player's best score while updating run statistics and location metadata.
- **UsersTable** – Pay-per-request DynamoDB table storing explorer profiles.
- **ScoresTable** – Pay-per-request DynamoDB table storing leaderboard entries. A GSI named `ScoreIndex` keeps the highest scores at the top by sorting on the negated score.
- **DiagnosticsFunction (`/diagnostics`, POST)** – Captures critical runtime diagnostics emitted by the browser client. When the handler observes repeated boot or asset failures from multiple sessions within a short window it publishes an incident notification email to the support contact.
- **HealthFunction (`/health`, GET & HEAD)** – Exposes a lightweight JSON heartbeat so operators can monitor deployment metadata, configuration coverage, and Lambda uptime.
- **IncidentCountersTable** – Pay-per-request DynamoDB table that aggregates recent critical incidents for boot and asset scopes with TTL-backed session tracking and notification cooldown metadata.
- **IncidentNotificationsTopic** – SNS topic wired to the support email address. Diagnostics ingestion publishes to this topic when the critical incident threshold is met.

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
| `EVENTS_TABLE` | Name of the DynamoDB table for gameplay events captured by `/events`. |
| `RATE_LIMITS_TABLE` | Name of the DynamoDB table that stores rate limit counters. |
| `INCIDENTS_TABLE` | Name of the DynamoDB table that aggregates critical diagnostics incidents. |
| `INCIDENT_NOTIFICATION_TOPIC_ARN` | SNS topic ARN that receives published incident notifications. |
| `INCIDENT_NOTIFICATION_THRESHOLD` | Unique session threshold that must be reached before an incident notification is sent (default `5`). |
| `INCIDENT_NOTIFICATION_WINDOW_SECONDS` | Rolling window, in seconds, used for incident aggregation (default `900`). |
| `INCIDENT_NOTIFICATION_COOLDOWN_SECONDS` | Minimum interval, in seconds, between repeated notifications for the same incident key (default `1800`). |

## Local testing

Install the SAM CLI and start a local API instance:

```bash
sam local start-api
```

The local gateway proxies requests to the Lambda handlers, allowing you to validate Google payload parsing and DynamoDB writes with [DynamoDB Local](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DynamoDBLocal.html) or a provisioned test table.
