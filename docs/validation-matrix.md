# Validation Matrix

The matrix below maps each gameplay, visual, audio, performance, and security requirement to the way it is validated.
Use it as a quick reference when planning manual or automated regression passes.

## Visual fidelity

| Requirement ID | Validation Method | Success Criteria | Test Scenarios |
| --- | --- | --- | --- |
| VIS-01 / VIS-02 | Browser testing in Chrome, Firefox, and Safari using DevTools; compare screenshots to Minecraft benchmarks. | • 60 FPS sustained.<br>• Models animate fluidly with no clipping.<br>• Camera remains stable across movements. | • Scenario 1: Load the scene and walk Steve—verify the camera never tilts.<br>• Scenario 2: Spawn a zombie and a golem—confirm aggro behaviour. |
| VIS-03 | Multi-screen inspection; resize the browser to simulate different devices. | • Logo is visible and responsive at 100% scale for loading and gameplay views.<br>• Hover state renders without lag. | • Scenario: Navigate the menu to the dimension selector—logo persists on every view. |

## User interface and onboarding

| Requirement ID | Validation Method | Success Criteria | Test Scenarios |
| --- | --- | --- | --- |
| UI-01 | Browser load; click tests. | Landing loads in <2s; buttons navigate correctly; animations smooth. | Scenario: Open URL—see title, logo, start game to gameplay. |
| UI-02 / UI-05 | Interaction simulation; guide review. | HUD non-obstructive; guide covers 100% controls; dynamics trigger as specified. | Scenario: First load—hints appear; open guide, interact demo. |

## Gameplay systems

| Requirement ID | Validation Method | Success Criteria | Test Scenarios |
| --- | --- | --- | --- |
| GM-01 | Simulated gameplay with console logging for health values. | • Player dies after exactly five hits.<br>• Respawn retains 100% of tools.<br>• Regeneration returns to full after 60 seconds of idling. | • Scenario: Provoke five zombie hits underwater—bubbles drain and health cascades as expected. |
| GM-02 | UI interaction tests covering recipe edge cases (incorrect order, maximum stack). | • Valid crafting sequences succeed 100% of the time.<br>• Search returns more than 80% relevant results. | • Scenario: Craft a pickaxe and search for "stone"—related recipes are listed. |
| GM-03 | Progression simulation with UI snapshots. | • Score has ±0 error.<br>• Breakdown values match calculated totals. | • Scenario: Unlock three recipes and one dimension—scoreboard displays 11 points. |
| GM-04 / GM-05 | End-to-end playthrough with control logging. | • Each dimension loads with unique modifiers (e.g., Tar slows velocity).<br>• Golems defend against more than 70% of threats. | • Scenario: Spend a night in the Rock dimension—zombies spawn and golems intercept attackers. |

## Multiplayer and persistence

| Requirement ID | Validation Method | Success Criteria | Test Scenarios |
| --- | --- | --- | --- |
| MP-01 / MP-02 | AWS console queries combined with multi-device login tests. | • State synchronises in under two seconds.<br>• Leaderboard updates live using mock scores. | • Scenario: Log in on mobile, play a session, then switch to desktop—score persists. |

## Audio experience

| Requirement ID | Validation Method | Success Criteria | Test Scenarios |
| --- | --- | --- | --- |
| AE-01 | Cross-browser audio playback with volume tests. | • Sound effects trigger reliably.<br>• Volume sliders adjust from 0–100% without distortion. | • Scenario: Mine a block during night—hear crunch and zombie moans. |

## Performance budgets

| Requirement ID | Validation Method | Success Criteria | Test Scenarios |
| --- | --- | --- | --- |
| PERF-01 | Performance audits via Lighthouse and stress tests (100 zombies). | • Average frame rate stays above 60 FPS.<br>• Load time remains under five seconds.<br>• Memory footprint stays below 500 MB after 30 minutes. | • Scenario: Enter a high-load dimension and confirm there are no performance drops. |

## Comprehensive validation

| Requirement ID | Validation Method | Success Criteria | Test Scenarios |
| --- | --- | --- | --- |
| All VIS / GM | End-to-end playthrough. | Interactions responsive; no freezes. | Scenario: Craft, die, respawn—verify screens/animations. |

## Security and deployment

| Requirement ID | Validation Method | Success Criteria | Test Scenarios |
| --- | --- | --- | --- |
| SEC-01 / DEP-01 | CI/CD workflow runs with security scans (`npm audit`, AWS GuardDuty). | • Deployments succeed.<br>• No secrets are exposed.<br>• HTTPS is enforced. | • Scenario: Push code, inspect the deployment URL, and verify secure access. |
