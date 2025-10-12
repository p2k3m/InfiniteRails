# S3/APIGW error budget and retry throttling plan

The Infinite Rails launcher, CDN, and gameplay APIs depend on Amazon S3 for static
asset delivery and Amazon API Gateway for identity and leaderboard mutations.
This plan defines the shared error budget for both services and documents how we
monitor consumption, throttle retries, and protect the UI during partial outages
so the platform stays within budget while remaining responsive.

## Objectives

- **Error budget**: Maintain a combined availability of 99.5% across asset reads
  (S3 + CloudFront) and API Gateway invocations per calendar month.
- **Cost guardrail**: Keep incremental retry-driven AWS spend below USD 200 per
  incident.
- **User experience**: Ensure the launcher and gameplay UIs stay interactive and
  degrade gracefully when S3 or API Gateway return elevated errors.

## Monitoring strategy

### Key CloudWatch metrics

| Service | Metric | Purpose |
| --- | --- | --- |
| S3 (via CloudFront) | `4xxErrorRate`, `5xxErrorRate`, `TotalErrorRate` | Detect origin and viewer failures breaking asset loads. |
| API Gateway | `5XXError`, `4XXError`, `Latency`, `IntegrationLatency` | Surface backend failures and timeouts. |
| Lambda (score sync) | `Errors`, `Throttles`, `Duration` | Identify downstream capacity limits causing API Gateway to retry. |
| S3 | `FirstByteLatency`, `GetRequests`, `4xxErrors`, `5xxErrors` | Confirm the origin is healthy when CloudFront reports issues. |

### Dashboards and alerts

1. Build a unified CloudWatch dashboard tracking the metrics above with a
   5-minute view for rapid incident triage and a 1-hour view for budget
   consumption trends.
2. Alert thresholds:
   - **Warning**: Error rate ≥ 1% for 5 consecutive minutes.
   - **Critical**: Error rate ≥ 5% for 3 consecutive minutes or 5XX count ≥ 100
     per minute.
   - **Budget burn**: Projected monthly availability < 99.5% based on the last
     6 hours of data (use Service Quotas' `error_budget_burn` metric math).
3. Send warning-level alerts to the on-call channel and critical/budget alerts to
   both on-call and the incident-commander role.

### Synthetic probes

- Continue running global synthetic checks (US/EU/APAC) that fetch the splash
  page assets and call the `/status/ping` API Gateway route.
- Record success/error counts separately from user traffic so we can calculate
  true availability during partial outages where browsers aggressively retry.

## Retry throttling policy

### Client behaviour

- Bootstrap (script.js):
  - Use exponential backoff with jitter for asset retries, capped at 5 attempts
    within 2 minutes.
  - When the throttling policy engages, surface the diagnostics overlay with a
    "Retrying asset downloads" banner.
- Gameplay (simple-experience.js):
  - Queue API Gateway retries with exponential backoff, doubling delay per
    attempt up to a 60-second ceiling.
  - After 3 failed attempts, pause further retries and display the offline
    scoreboard UI state.

### Server-side safeguards

- Configure API Gateway usage plans with burst and steady-state limits that align
  with baseline traffic plus a 30% error-margin headroom. During incidents this
  prevents infinite client retries from overwhelming downstream Lambdas.
- Enable `throttle_retries` in the API Gateway stage settings so gateway-managed
  retries obey the same quotas.
- For Lambda, set reserved concurrency to a value that limits cost blast radius
  but still allows the steady-state success path. Combine with Dead Letter Queues
  so failed writes can be replayed after the outage.

### Monitoring budget burn

- Implement a metric math expression for each service: `error_rate * 43,200`
  (minutes per 30-day month) to estimate minutes consumed.
- Fire a `HighErrorBudgetBurn` alarm when the projected consumption exceeds 30%
  of the monthly allowance. The incident commander can then decide whether to
  disable optional features (live score sync) to reduce pressure.

## Operational response checklist

1. **Confirm outage scope** via CloudWatch dashboards and synthetic probes.
2. **Activate throttling**:
   - Toggle the feature flag that enables aggressive retry limits in both the
     bootstrapper and gameplay clients.
   - Apply API Gateway stage throttling overrides if automatic limits are not
     slowing the retry storm.
3. **Communicate**:
   - Post an incident update in the player status channel and the internal
     incident room.
   - Update the in-app diagnostics banner with the estimated recovery time.
4. **Mitigate costs**:
   - Inspect AWS Cost Explorer for real-time spikes in S3 `Requests-Tier1` and
     API Gateway `Requests` cost categories.
   - If spend exceeds USD 200, escalate to the engineering director for
     approval before relaxing throttles.
5. **Recover UI responsiveness**:
   - Keep the simplified gameplay renderer active while the main asset pipeline
     is throttled.
   - Defer non-critical background sync tasks (`navigator.sendBeacon`) until
     error rates return to baseline.
6. **Post-incident review**:
   - Document the timeline, the amount of error budget consumed, and any cost
     incurred from retries.
   - File follow-up tasks for automation gaps (e.g., missing alarms or feature
     flags that required manual toggles).

## Implementation milestones

| Milestone | Owner | Target date |
| --- | --- | --- |
| Dashboard and alarms live | Observability team | 2024-11-15 |
| Client retry throttling feature flag shipped | Front-end team | 2024-11-22 |
| API Gateway usage plan tuning | Backend team | 2024-11-25 |
| Cost anomaly alert configured | FinOps | 2024-11-25 |
| First monthly budget review | SRE | 2024-12-01 |

Aligning monitoring, throttling, and communication around this shared error
budget keeps Infinite Rails responsive for players while preventing retry storms
from causing runaway AWS bills.
