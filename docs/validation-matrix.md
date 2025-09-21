# Validation Matrix

The following matrix summarises how each gameplay, visual, audio, performance, and security requirement is validated. Use it as a quick reference when planning manual or automated regression passes.

| Requirement ID | Validation Method | Success Criteria | Test Scenarios |
| --- | --- | --- | --- |
| VIS-01 / VIS-02 | Browser testing in Chrome, Firefox, and Safari with DevTools; compare screenshots to Minecraft benchmarks. | 60 FPS sustained; models animate fluidly without clipping; camera remains stable throughout movements. | Scenario 1: Load the scene and walk Steve—verify the camera never tilts. Scenario 2: Spawn a zombie and a golem—confirm aggro behaviour. |
| VIS-03 | Multi-screen inspection; resize the browser to simulate different devices. | Logo is visible and responsive at 100% scale on loading and gameplay views; hover state renders without lag. | Scenario: Navigate the menu to the dimension selector—logo persists on every view. |
| GM-01 | Simulated gameplay with console logging for health values. | Player dies after exactly five hits; respawn retains 100% of tools; regeneration returns to full after 60 seconds of idling. | Scenario: Provoke five zombie hits underwater—bubbles drain and health cascades as expected. |
| GM-02 | UI interaction tests covering recipe edge cases (incorrect order, maximum stack). | Valid crafting sequences succeed 100% of the time; search returns more than 80% relevant results. | Scenario: Craft a pickaxe and search for “stone”—verify related recipes are listed. |
| GM-03 | Progression simulation with UI snapshots. | Score has ±0 error; breakdown values match calculated totals. | Scenario: Unlock three recipes and one dimension—scoreboard displays 11 points. |
| GM-04 / GM-05 | End-to-end playthrough with control logging. | Each dimension loads with unique modifiers (e.g., Tar slows velocity); golems defend against more than 70% of threats. | Scenario: Spend a night in the Rock dimension—zombies spawn and golems intercept attackers. |
| MP-01 / MP-02 | AWS console queries combined with multi-device login tests. | State synchronises in under two seconds; leaderboard updates live using mock scores. | Scenario: Log in on mobile, play a session, then switch to desktop—score persists. |
| AE-01 | Cross-browser audio playback with volume tests. | Sound effects trigger reliably; volume sliders adjust from 0–100% without distortion. | Scenario: Mine a block during night—hear crunch and zombie moans. |
| PERF-01 | Performance audits via Lighthouse and stress tests (100 zombies). | Average frame rate stays above 60 FPS; load time under five seconds; memory footprint below 500 MB after 30 minutes. | Scenario: Enter a high-load dimension and confirm there are no performance drops. |
| SEC-01 / DEP-01 | CI/CD workflow runs with security scans (`npm audit`, AWS GuardDuty). | Deployments succeed; no secrets are exposed; HTTPS is enforced. | Scenario: Push code, inspect the deployment URL, and verify secure access. |

