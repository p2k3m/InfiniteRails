# Feature & Deliverable Checklist Cross-Check

This audit documents how each major Infinite Rails module maps to the "Portals of Dimension" runtime checklist so reviewers can confirm the shipped experience still satisfies the deliverables without re-deriving references from scratch.【F:docs/portals-of-dimension-runtime-checklist.md†L1-L36】 Supplementary checkpoints from the spec-compliance table are included where they provide broader coverage for UI polish or backend obligations.【F:docs/spec-compliance.md†L5-L23】

## Source checklists consulted
- [`docs/portals-of-dimension-runtime-checklist.md`](./portals-of-dimension-runtime-checklist.md) – definitive runtime deliverables spanning rendering, controls, gameplay, backend sync, audio, performance, and regression coverage.【F:docs/portals-of-dimension-runtime-checklist.md†L5-L35】
- [`docs/spec-compliance.md`](./spec-compliance.md) – specification-to-implementation ledger used to validate UI polish, accessibility, and backend integrations alongside the runtime checklist.【F:docs/spec-compliance.md†L5-L23】

## Module coverage

### `simple-experience.js` – Sandbox renderer & gameplay loop
- **Render + world initialisation:** The runtime checklist calls for `SimpleExperience.start()` to bootstrap the renderer, world, rails, boss hooks, HUD refresh, tutorials, and debug interface, which the implementation executes before scheduling the first frame; `buildTerrain()` then repopulates the 64×64 island and logs voxel/chunk diagnostics as required.【F:docs/portals-of-dimension-runtime-checklist.md†L5-L17】【F:simple-experience.js†L1279-L1333】【F:simple-experience.js†L4840-L4970】
- **Day/night lighting cadence:** The checklist’s daylight orbit requirement is satisfied by `updateDayNightCycle()`, which advances sun/moon transforms, ambient/fog colours, and the HUD time label every tick.【F:docs/portals-of-dimension-runtime-checklist.md†L5-L8】【F:simple-experience.js†L7626-L7718】
- **Player view & inputs:** Pointer lock, keyboard bindings, touch look, joystick controls, and crafting/portal shortcuts enumerated in the checklist are wired in `bindEvents()` and `initializeMobileControls()`, covering both desktop and mobile flows.【F:docs/portals-of-dimension-runtime-checklist.md†L10-L13】【F:simple-experience.js†L6568-L6652】【F:simple-experience.js†L3665-L3778】
- **Gameplay progression systems:** Rail layout, loot chest spawning, Netherite collapse scheduling, and portal activation logging called out in the deliverables are handled in `buildRails()`, `spawnDimensionChests()`, `evaluateBossChallenge()`, and related helpers that manage the Eternal Ingot finale.【F:docs/portals-of-dimension-runtime-checklist.md†L14-L17】【F:simple-experience.js†L5083-L5200】
- **Entities & combat:** Zombie wave spawning, golem escorts, collision-driven damage, and respawn bookkeeping meet the checklist’s combat expectations via `updateZombies()`, `spawnZombie()`, `spawnGolem()`, `updateGolems()`, and defeat handlers.【F:docs/portals-of-dimension-runtime-checklist.md†L18-L19】【F:simple-experience.js†L7699-L8008】
- **HUD & victory telemetry:** Portal progress, victory summaries, replay triggers, and portal status audio cues render through `updateHud()`, `setPortalStatusIndicator()`, and `updatePortalProgress()`, mirroring the progression feedback bullet.【F:docs/portals-of-dimension-runtime-checklist.md†L21-L22】【F:simple-experience.js†L9882-L10040】
- **Backend score sync:** Score POST scheduling, local fallbacks, and leaderboard refreshes demanded by the checklist are orchestrated in `scheduleScoreSync()`/`flushScoreSync()` and the start-up load pipeline.【F:docs/portals-of-dimension-runtime-checklist.md†L24-L27】【F:simple-experience.js†L1279-L1332】【F:simple-experience.js†L2375-L2405】
- **Audio, performance & asset telemetry:** The Howler/fallback audio controller, `[AssetBudget]` timers, and mobile control instrumentation uphold the audio/performance requirements, including console diagnostics for budget breaches.【F:docs/portals-of-dimension-runtime-checklist.md†L28-L31】【F:simple-experience.js†L3550-L3662】【F:simple-experience.js†L2729-L2786】

### `script.js` – UI shell, identity, and scoreboard services
- **Backend configuration & diagnostics:** API normalisation, configuration warnings, and bootstrap overlay messages enforce the checklist’s backend readiness expectations while aligning with the spec-compliance entry for backend sync and SSO hooks.【F:docs/portals-of-dimension-runtime-checklist.md†L24-L27】【F:docs/spec-compliance.md†L14-L16】【F:script.js†L716-L848】
- **Identity + leaderboard integration:** Google Identity loading, score endpoint wiring, event log rendering, and leaderboard status messaging keep the runtime deliverable’s sync bullet satisfied and mirror the compliance table’s backend/leaderboard guarantees.【F:docs/portals-of-dimension-runtime-checklist.md†L24-L27】【F:docs/spec-compliance.md†L14-L16】【F:script.js†L847-L1158】

### UI markup & styling – `index.html`, `styles.css`
- **HUD, tutorials, and accessibility:** Mission briefing content, HUD scaffolding, hints, and responsive layout classes provide the checklist’s portal/victory feedback surfaces and the spec-compliance UI accessibility coverage.【F:docs/portals-of-dimension-runtime-checklist.md†L21-L22】【F:docs/spec-compliance.md†L7-L17】【F:index.html†L150-L320】【F:styles.css†L1400-L1558】

### Crafting & inventory logic – `crafting.js`
- **Recipe validation & score hooks:** Drag-sequence validation, stack limits, unlock tracking, and recipe metadata fulfil the crafting points tracked in the gameplay and score feedback deliverables noted in the spec-compliance summary.【F:docs/spec-compliance.md†L12-L13】【F:crafting.js†L1-L160】

### Portal mechanics – `portal-mechanics.js`
- **Frame detection & activation:** 4×3 frame construction, collision checks, ignition outcomes, and dimension transition metadata satisfy the portal assembly deliverable and underpin the sandbox portal flow.【F:docs/portals-of-dimension-runtime-checklist.md†L14-L17】【F:portal-mechanics.js†L1-L109】

### Combat helpers – `combat-utils.js`
- **Survival expectations:** Zombie strike pacing, respawn routines, inventory snapshots, and golem interception heuristics support the combat deliverable and keep manual/automated tests aligned with the spec’s survival requirements.【F:docs/portals-of-dimension-runtime-checklist.md†L18-L19】【F:combat-utils.js†L17-L124】

### Scoreboard utilities – `scoreboard-utils.js`
- **Leaderboard normalisation:** Dimension label deduplication, score sorting, runtime formatting, and upsert logic provide the data guarantees relied upon by the backend/identity deliverables.【F:docs/portals-of-dimension-runtime-checklist.md†L24-L27】【F:scoreboard-utils.js†L1-L120】

### Asset resolution – `asset-resolver.js`
- **CDN-ready asset fallbacks:** Normalised base URLs, script-relative fallbacks, and deduped warning logs backstop the asset budgeting deliverable to keep texture/GLTF streams online during runtime audits.【F:docs/portals-of-dimension-runtime-checklist.md†L28-L31】【F:asset-resolver.js†L1-L115】

## Validation coverage – `tests/`
- **Automated regression:** Vitest suites for crafting, combat maths, portal mechanics, and scoreboard formatting – plus the Playwright e2e run – directly satisfy the runtime checklist’s validation bullet, ensuring each deliverable stays monitored.【F:docs/portals-of-dimension-runtime-checklist.md†L33-L35】【F:tests/crafting.test.js†L1-L82】【F:tests/combat-utils.test.js†L1-L123】【F:tests/portal-mechanics.test.js†L1-L111】【F:tests/scoreboard-utils.test.js†L1-L75】【F:tests/e2e-check.js†L1-L200】

Maintaining this cross-check ensures future feature work can reference a single document to confirm the sandbox remains compliant with the feature and deliverable checklist before shipping.
