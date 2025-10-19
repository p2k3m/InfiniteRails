# Error handling reference

This reference lists every `catch` branch in the interactive bootstrap (`script.js`) and the gameplay sandbox (`simple-experience.js`). Each entry documents what can fail and the defensive action the runtime takes so maintainers can quickly trace resilience behaviour.

## Developer triage

Use the following runbook when the diagnostics console starts filling with new entries. Severity is determined by the `level` supplied to `logDiagnosticsEvent`/`logThroughDiagnostics`, which in turn steers the bootstrap overlay, the server-side beacon, and the critical error presenter.【F:script.js†L7625-L7643】【F:script.js†L7868-L7944】

### Debug / informational noise

* **Console output** – surfaced through `console.debug` or an info-level diagnostics entry. These lines are primarily for local traceability and never ship to the critical overlay or the central diagnostics endpoint unless the session runs in a development or CI environment.【F:script.js†L7625-L7643】【F:script.js†L7868-L7944】
* **What it means** – state probes, feature toggles, or “best effort” flows that recovered without user impact (for example, storage preference fallbacks).
* **Triage** – capture the log snippet if it looks new, but treat as non-actionable unless it becomes noisy or points at a regression under active test.
* **Escalation** – only file a follow-up ticket if the noise increases materially or QA cannot verify a related feature; no paging.

### Warnings

* **Console output** – tagged `level: 'warning'` on diagnostics entries, styling the overlay entry amber while staying off the critical error modal.【F:script.js†L6172-L6244】【F:styles.css†L6500-L6526】
* **What it means** – degraded functionality with a graceful fallback (for example, cached scoreboard data failing to refresh or optional audio actions that were skipped).
* **Triage** – reproduce locally, confirm the fallback matches the table below, and assess whether player impact is minor. Capture HAR/trace data if the warning references network APIs.
* **Escalation** – raise in the daily triage channel and file a bug if it impacts release criteria; page on-call only if the warning repeats every session and no fallback remains.

### Errors

* **Console output** – diagnostics entries marked `level: 'error'` and mirrored into the critical error overlay once per fingerprint, often paired with a red border in the live log.【F:script.js†L7801-L7865】【F:styles.css†L6509-L6535】
* **What it means** – a primary system failed but the runtime kept itself alive (for example, renderer boot retry logic or identity persistence problems).
* **Triage** – gather the overlay screenshot, the diagnostics entry (including `traceId`/`sessionId`), and any recovery action results. Validate whether `sendDiagnosticsEventToServer` attempted to beacon the payload for observability.【F:script.js†L7625-L7643】
* **Escalation** – notify the on-call engineer if the error reproduces for multiple accounts or blocks critical stories; otherwise open a P1 bug with collected traces.

### Critical errors

* **Console output** – entries explicitly flagged as critical (or errors emitted from a critical asset scope) trigger the blocking boot diagnostics and keep the critical overlay pinned until the user intervenes.【F:script.js†L7801-L7865】【F:script.js†L23674-L23710】
* **What it means** – failure to load a required asset, renderer, or API endpoint that prevents progress even after retry logic.
* **Triage** – confirm which diagnostic section shows a blocking status, dump the associated detail payload, and attempt the documented recovery action in the overlay.
* **Escalation** – page the on-call engineer immediately and log an incident; include the `traceId`, recovery attempts, and whether the preload or availability checks succeeded earlier in boot.【F:script.js†L23687-L23710】

### Fatal errors

* **Console output** – entries marked `level: 'fatal'` (or rethrown initialisation failures) halt boot entirely and rethrow so upstream monitoring captures the crash.【F:script.js†L7625-L7643】【F:script.js†L21566-L21620】
* **What it means** – an unrecoverable setup failure, such as Google identity bootstrap throwing synchronously before any fallbacks are available.【F:script.js†L21566-L21620】
* **Triage** – capture the browser console stack, note which bootstrap phase was active, and verify whether the failure is environment-specific (ad blockers, third-party cookies, etc.).
* **Escalation** – treat as a Sev-0: page immediately, open an incident, and attach environment details. Hand off to SRE if external identity or platform dependencies are implicated.

## script.js

| Line | Context | Failure scenario | Fallback / Notes |
| --- | --- | --- | --- |
| 41 | `loadInitialDebugModePreference` | Browsers can throw when reading `localStorage` (for example in private browsing). | Logs the failure at debug level and forces debug mode off to keep bootstrap stable. |
| 86 | `loadStoredColorMode` | Persisted colour mode cannot be read from storage. | Emits a debug log and falls back to the automatic theme selector. |
| 100 | `saveColorMode` | Writing the colour mode preference to storage fails. | Logs the failure and continues without persisting the preference. |
| 140 | `bindColorSchemeListener` | Creating a `matchMedia('(prefers-color-scheme: dark)')` query throws. | Resets the media query to `null` and records the issue so the UI simply ignores ambient colour changes. |
| 245 | `loadCaptionPreference` | Reading the caption toggle from storage fails. | Logs a debug message and returns `false` so captions remain disabled by default. |
| 259 | `saveCaptionPreference` | Persisting the caption toggle fails. | Writes a debug log and continues; the preference just is not saved. |
| 547 | `sanitiseLogDetail` | Deep-copying diagnostic detail via `JSON.stringify` fails (cyclic or complex values). | Builds a manual shallow copy, serialising primitives and safe conversions to keep diagnostic output readable. |
| 609 | `updateLogElements` | Serialising structured detail into `data-detail` fails. | Clears the dataset entry so the UI never receives stale or invalid JSON. |
| 828 | `summariseAssetUrl` | `new URL()` rejects malformed asset URLs. | Returns the trimmed string so diagnostics still show what was attempted. |
| 1143 | `normaliseApiBaseUrl` | Invalid `APP_CONFIG.apiBaseUrl` values (not absolute HTTP(S) URLs). | Logs a configuration warning and disables remote sync by returning `null`. |
| 1330 | `formatEventTimestamp` | Browser refuses the locale-aware timestamp formatting. | Falls back to the ISO string representation to keep the log usable. |
| 1374 | `serialiseEventDetail` | Deep-cloning analytics payloads fails. | Generates a string/primitive-only copy so instrumentation can still be emitted. |
| 1499 | `createDebugDetailString` | JSON cloning of nested debug entries fails. | Serialises problematic values with `String(value)` before continuing. |
| 1513 | `createDebugDetailString` | Joining diagnostic details fails due to unserialisable payloads. | Falls back to a simple `${key}: value` newline list to guarantee output. |
| 1680 | `downloadDiagnosticsReport` | Building the JSON payload for diagnostics throws. | Regenerates a minimal payload with an error message so users can still download a report. |
| 1727 | `downloadDiagnosticsReport` | Triggering a download via `Blob` fails (headless/test contexts). | Emits a debug warning and aborts quietly instead of crashing. |
| 1777 | `persistDebugModePreference` | Storing the debug toggle fails. | Logs at debug level and keeps runtime state only. |
| 1871 | `setDebugModeEnabled` | Persisting debug mode or notifying listeners fails. | Logs the problem but still updates in-memory state to the requested value. |
| 1947 | `createAssetUrlCandidates` | Deriving URLs from script/document context fails. | Warns once per context and simply skips the failed candidate. |
| 1978 | `loadScript` | Setting metadata attributes on the injected `<script>` fails. | Ignores the error—the load continues via event listeners. |
| 2176 | `buildIdentityPayload` | Syncing identity back to the leaderboard throws. | Logs a warning and carries on with local identity state. |
| 2287 | `loadStoredIdentitySnapshot` | Restoring identity from `localStorage` fails (parse or access error). | Warns and returns `null`, meaning the session starts unauthenticated. |
| 2308 | `persistIdentitySnapshot` | Saving the identity snapshot fails. | Warns and continues so in-memory identity still works. |
| 2327 | `notifyIdentityConsumers` | Pushing identity to the active `SimpleExperience` instance fails. | Warns and leaves the in-flight gameplay session untouched. |
| 2334 | `notifyIdentityConsumers` | Updating the legacy `window.InfiniteRails` bridge fails. | Logs the warning and continues; external embeds simply miss the update. |
| 2344 | `notifyIdentityConsumers` | Dispatching the DOM `identitychange` event fails. | Debug-logs the error and suppresses it so other listeners still run. |
| 2463 | `handleSignOut` | `google.accounts.id.disableAutoSelect()` fails. | Logs a debug message and continues the sign-out clean-up. |
| 2470 | `handleSignOut` | `google.accounts.id.cancel()` throws during teardown. | Logs at debug level and keeps going so the UI resolves. |
| 2501 | `decodeJwtPayload` | Decoding the Google credential token fails (bad base64). | Logs at debug level and returns `null` so sign-in gracefully aborts. |
| 2507 | `decodeJwtPayload` | Parsing the decoded JSON payload fails. | Logs at debug level and returns `null`. |
| 2542 | `handleGoogleCredential` | Applying a Google credential to local identity fails. | Warns, informs the scoreboard UI, and leaves the user on a guest profile. |
| 2648 | `renderGoogleButtons` | Rendering a Google sign-in button throws. | Warns but continues initialisation so other UI pieces remain responsive. |
| 2682 | `initialiseGoogleSignIn` | Initialising the Google identity API throws synchronously. | Rethrows so the bootstrapper surfaces the fatal setup failure. |
| 2695 | `initialiseGoogleSignIn` | `google.accounts.id.prompt()` fails. | Logs at debug level and returns the account object so callers can retry. |
| 2720 | `hasCoarsePointer` | Evaluating the coarse pointer media query fails. | Logs at debug level and falls back to assuming fine-grained input. |
| 2803 | `shouldStartSimpleMode` | Probing WebGL contexts throws (sandboxed/offscreen). | Treats WebGL as unsupported and requests the simplified renderer. |
| 3008 | `ensureSimpleExperience` | Instantiating the fallback renderer fails. | Logs as an error and surfaces the issue via the diagnostics overlay. |
| 3042 | `ensureSimpleExperience` | Propagating identity into the experience fails. | Debug-logs and continues so gameplay still starts. |
| 3056 | `ensureSimpleExperience` | `experience.start()` throws during boot. | Logs an error and leaves the diagnostics overlay visible. |
| 3072 | `ensureSimpleExperience` | Showing the tutorial overlay throws. | Logs an error but allows the session to continue without the tutorial. |

## simple-experience.js

| Line | Context | Failure scenario | Fallback / Notes |
| --- | --- | --- | --- |
| 114 | `normaliseApiBaseUrl` | Parsing a configured leaderboard base URL fails. | Logs a configuration warning and returns `null`, disabling remote sync until the value is corrected. |
| 417 | `createAssetUrlCandidates` fallback | Resolving a relative asset URL against document/window context fails. | Returns the raw relative path so asset loading still attempts local resolution. |
| 1272 | `emitGameEvent` | Dispatching the global `CustomEvent` for telemetry fails (unsupported host). | Logs at debug level and suppresses the exception so gameplay continues. |
| 1333 | `start` | Any part of `setupScene` or initial boot throws. | Presents the renderer failure overlay, emits a start-error event, and resets state for retry. |
| 1373 | `start` | `canvas.focus({ preventScroll: true })` is unsupported. | Falls back to a plain `focus()` call. |
| 1416 | `start` | Plain `canvas.focus()` is also rejected. | Logs a debug message noting the browser limitation. |
| 1433 | `start` | Releasing pointer lock during intro cleanup fails. | Logs a debug message but continues with the session bootstrap. |
| 1488 | `start` | Pausing ambient music before boot fails (e.g., audio context issues). | Swallows the error because audio is optional. |
| 1817 | `start` | Refreshing the scoreboard UI during boot throws. | Routes the error through the generic `handleEventDispatchError` helper but keeps loading. |
| 1951 | `loadScoreboard` | Fetching leaderboard data throws (network/API failure). | Logs a warning and leaves existing scoreboard entries in place. |
| 2007 | `getStoredScoreboardEntries` | Reading cached leaderboard data from storage fails. | Warns and returns an empty list so the UI hydrates from defaults. |
| 2041 | `persistScoreboardEntries` | Writing cached leaderboard data fails. | Logs a warning and proceeds without caching the snapshot. |
| 2451 | `syncScoreToBackend` | Posting a score to the backend fails. | Warns, queues a retry reason, and updates offline status messaging. |
| 2489 | `resetPlayerCharacterState` | Stopping the animation mixer throws. | Logs a debug message and continues tearing down the avatar. |
| 2501 | `resetPlayerCharacterState` | Removing the camera from its parent fails. | Logs at debug level and continues resetting the rig. |
| 2510 | `resetPlayerCharacterState` | Reparenting the camera to the boom/player rig fails. | Logs at debug level while leaving the camera in its prior location. |
| 2551 | `setupScene` | Creating the Three.js renderer throws. | Emits telemetry, logs details, clears the renderer reference, and rethrows for upstream handling. |
| 2696 | `applyCameraPerspective` | Removing the camera from the previous parent fails. | Logs at debug level and keeps going with the perspective switch. |
| 2701 | `applyCameraPerspective` | Attaching the camera to the new parent fails. | Logs the issue but proceeds, leaving the old attachment in place. |
| 2741 | `ensurePlayerArmsVisible` | Detaching the hand group from its old parent fails. | Logs a debug message and continues, so hands may remain hidden. |
| 2746 | `ensurePlayerArmsVisible` | Attaching the hand group to the camera fails. | Logs at debug level and maintains the previous layout. |
| 2935 | `restorePersistentUnlocks` | Parsing stored crafting unlocks fails. | Warns and skips restoration so the player restarts with defaults. |
| 2964 | `savePersistentUnlocks` | Saving crafting unlocks fails. | Logs a warning and continues so gameplay is not blocked. |
| 2982 | `restoreIdentitySnapshot` | Parsing stored identity snapshot fails. | Warns and aborts restore, leaving the identity at defaults. |
| 3018 | `persistIdentitySnapshot` | Writing the identity snapshot fails. | Warns while keeping the in-memory profile. |
| 3074 | `autoCaptureLocation` | `navigator.geolocation.getCurrentPosition` throws synchronously. | Routes the error to the same handler used by async failures, updating local status and continuing. |
| 3424 | `detectReducedMotion` | Evaluating the reduced-motion media query fails. | Logs at debug level and falls back to reporting reduced motion as disabled. |
| 3543 | `announceCaption` | Dispatching the caption broadcast event fails. | Debug-logs the failure and suppresses it. |
| 3583 | `createAudioController` | Adjusting playback rate on a fallback `<audio>` element fails. | Debug-logs and leaves the rate unchanged. |
| 3601 | `createAudioController` | Starting playback on a fallback `<audio>` element throws. | Removes the instance, logs a warning, and exits early. |
| 3664 | `createAudioController` | Resetting a fallback `<audio>` element throws. | Logs at debug level and continues clearing playback state. |
| 3842 | `verifyMobileControlsDom` | Inspecting the mobile controls DOM throws. | Warns and treats the controls as unavailable. |
| 3874 | `attachPointerPreferenceObserver` | Removing a pointer preference listener via `removeEventListener` fails. | Logs at debug level and clears the disposer reference. |
| 3884 | `attachPointerPreferenceObserver` | Removing a pointer preference listener via `removeListener` fails. | Logs at debug level and clears the disposer reference. |
| 3890 | `attachPointerPreferenceObserver` | Creating the pointer preference observer fails. | Logs a debug message and disables pointer preference tracking. |
| 3928 | `getPointerInputTargets` | Querying canvases in the document throws. | Treats the query as empty, preventing the crash. |
| 4002 | `teardownMobileControls` | Removing event handlers from touch controls throws. | Warns but continues cleaning up the controls. |
| 4474 | `loadModel` | Instantiating the GLTF loader throws. | Rejects the promise so retry logic can handle the failure. |
| 4557 | `cloneModelScene` | Cloning a model scene fails. | Handles the asset failure if it was not already accounted for and returns `null`. |
| 4571 | `loadFirstPersonArms` | Loading the first arm model fails. | Logs via `handleAssetLoadFailure`, keeps state consistent, and tries to continue with fallbacks. |
| 4597 | `loadFirstPersonArms` | Loading the mirrored arm fails. | Logs the failure, keeps the single-arm fallback, and records diagnostic state. |
| 4656 | `loadPlayerCharacter` | Loading the Steve model fails. | Warns and creates a fallback cube avatar so the session continues. |
| 5012 | `detectChunkDebugFlag` | Parsing the `debugChunks` query parameter fails. | Logs a debug message and reports that chunk debugging is disabled. |
| 5993 | `ignitePortal` | Portal ignition mechanics throw. | Warns and continues with manual activation flow. |
| 6207 | `enterNextDimension` | Portal transition mechanics throw. | Warns, then continues with the default dimension progression. |
| 6319 | `loadStoredKeyBindingOverrides` | Parsing stored key bindings fails. | Logs at debug level and returns `null` so defaults remain in place. |
| 6346 | `persistKeyBindings` | Saving key-binding overrides fails. | Logs a debug message and continues with in-memory bindings. |
| 6688 | `unbindEvents` | Disposing a registered event listener throws. | Logs a debug entry but continues tearing down listeners. |
| 6698 | `unbindEvents` | Detaching the pointer preference observer throws. | Logs at debug level and clears the observer reference. |
| 6846 | `attemptPointerLock` | Fallback pointer-lock request fails. | Invokes the pointer-lock fallback handler to show guidance. |
| 6865 | `attemptPointerLock` | Secondary focus attempt throws. | Falls back to enabling the pointer-lock guidance flow. |
| 7038 | `handleBeforeUnload` | Saving crafting unlocks during unload fails. | Logs at debug level and continues with other unload tasks. |
| 7043 | `handleBeforeUnload` | Persisting the identity snapshot during unload fails. | Logs and keeps going so unload cannot be blocked. |
| 7061 | `handleBeforeUnload` | `navigator.sendBeacon` fails when uploading the run summary. | Logs at debug level and falls back to `fetch`. |
| 7078 | `handleBeforeUnload` | Fallback `fetch` invocation throws. | Logs a debug message and silently gives up; the run remains stored locally. |
| 7111 | `handleCanvasPointerLockRequest` | Focus with `{ preventScroll: true }` fails during pointer-lock requests. | Falls back to a plain `focus()` call. |
| 7219 | `renderFrame` | Simulation steps throw. | Routes the error to `handleRenderLoopError`, pausing rendering safely. |
| 7226 | `renderFrame` | Rendering the frame throws. | Routes through `handleRenderLoopError` and stops the loop. |
| 7314 | `verifyWebglSupport` | Probing WebGL contexts throws. | Logs telemetry, shows the renderer failure overlay, and reports the error. |
| 8460 | Hotbar drag handlers | Writing drag data fails (platform restrictions). | Ignores the failure so dragging simply becomes a no-op. |
| 8501 | Hotbar drop handlers | Reading drag payload fails. | Ignores the error and clears drag indicators. |
| 8697 | `addSafeEventListener` | Wrapped UI handler throws. | Delegates to `handleEventDispatchError` to surface the issue and halt the run safely. |
| 8870 | `showAssetRecoveryPrompt` | Focusing the recovery dialog fails. | Logs a debug message and leaves focus unchanged. |
| 8987 | `retryFailedAssets` | Clearing the Three.js cache fails. | Logs at debug level while still retrying asset loads. |
| 10357 | `showVictoryCelebration` | Focusing the share button fails. | Ignores the error so the celebration UI still appears. |
| 10555 | `handleVictoryClose` | Refocusing the canvas after closing the celebration fails. | Ignores the error because some browsers disallow programmatic focus. |
| 10620 | `handleVictoryShare` | Web Share / clipboard operations fail. | Distinguishes cancellation vs. real errors, logs warnings, and updates the status message. |
| 10714 | Debug interface utilities | Toggling verbose debug controls throws. | Logs a debug message and leaves controls unchanged. |
| 10725 | Debug interface utilities | Checking the verbose mode flag throws. | Logs at debug level and reports verbose mode as disabled. |
| 10741 | Debug interface utilities | Dispatching the debug start event fails. | Logs at debug level and continues bootstrap. |
