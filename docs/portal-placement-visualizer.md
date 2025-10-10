# Portal Placement Visualizer

This guide documents how the sandbox exposes real-time feedback while a player assembles a portal frame. The flow stitches together the sandbox runtime in `simple-experience.js` with the shared helpers exported from `portal-mechanics.js` to surface ghost blocks, obstruction warnings, and overall footprint validation.

## Ghost block previews

`SimpleExperience` maintains a dedicated preview group and pool of mesh instances that render any missing frame slot as a semi-transparent ghost block. Whenever the preview data marks a slot as `ghost`, the runtime positions a reusable cube mesh at the target world coordinates and toggles its visibility so players can see the outstanding placements without spawning real blocks into the scene.【F:simple-experience.js†L18528-L18622】

## Preview data pipeline

When the player updates the frame, the sandbox inspects each slot, collates placed block metadata or obstruction reasons, and hands that context to `portalMechanics.buildPortalPlacementPreview()`. The shared helper evaluates collisions, required block types, and column heights before returning per-slot status flags plus a summary that powers both HUD messaging and the ghost mesh pass.【F:simple-experience.js†L18860-L18939】【F:portal-mechanics.js†L270-L408】

## Footprint validation & messaging

Final validation leans on the same preview object. `validatePortalFrameFootprint()` derives highlight targets for misaligned blocks, assembles player-facing guidance, and reuses the `footprintValid` signal from the mechanics module to decide whether the frame is ready to ignite.【F:simple-experience.js†L18942-L18980】【F:portal-mechanics.js†L411-L418】
