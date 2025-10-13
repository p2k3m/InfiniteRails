# Restoring `simple-experience.js`

The sandbox renderer that powers Infinite Dimension lives in `simple-experience.js`. The repository currently checks in a truncated placeholder copy of the bundle so the file loads quickly in lightweight environments, but the Vitest suites exercise the full renderer implementation.

When the lightweight stub is present, `npm test` fails as soon as Vitest attempts to evaluate `simple-experience.js` because the file contains incomplete statements (for example the first `if` blocks are missing their closing braces). The new `scripts/check-simple-experience.js` guard short-circuits the test command with a clearer error when the bundle is missing.

## Restoring the production bundle

1. Retrieve the full compiled renderer artifact from a known-good release or regenerate it locally from the authoring source. (The original project uses a custom build step outside of this repository; check internal build instructions or CI artifacts.)
2. Replace the placeholder `simple-experience.js` with the complete bundle. The restored file should contain the `SimpleExperience` class definition along with the telemetry strings referenced throughout the documentation (scene population checks, portal activation logs, etc.).
3. Re-run `npm test` to confirm that the sandbox renderer loads correctly and that all suites pass.

## Troubleshooting

- Run `node scripts/check-simple-experience.js` directly to verify whether the repo contains the expected bundle. The script validates both the file length and the presence of critical identifiers such as `class SimpleExperience` and `window.SimpleExperience`.
- If Vitest still reports syntax errors after restoring the file, confirm that the bundle was not minified with incompatible ECMAScript features. The current toolchain targets Node 18 and browsers with WebGL2 support.
- Keep the bundle committed to avoid future regressions; the spec regression tests (`tests/spec-coverage.spec.js`) parse the source to ensure that telemetry and instrumentation strings remain intact.
