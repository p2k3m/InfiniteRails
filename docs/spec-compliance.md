# Spec Compliance Summary: Infinite Rails — Portals of Dimension

The previous revision of this document incorrectly claimed full compliance with the design brief. In reality the repository lacks the majority of the requested gameplay systems. This page now functions as a gap analysis so stakeholders can see what still needs to be delivered.

| Spec Area | Current Status | Gap Summary |
| --- | --- | --- |
| **Initialization & Onboarding** | ❌ Not implemented | The intro UI renders but no tutorial overlay, pointer lock, or camera focus logic exists. Players receive no controls briefing on load. |
| **Procedural World & Lighting** | ❌ Not implemented | Three.js initialises, yet the scene contains no voxel meshes, lights, or skybox. The day/night cycle and sun orbit are missing. |
| **Player Visibility & First-Person Perspective** | ❌ Not implemented | No player model (Steve or fallback) is loaded, leaving the scene empty and the camera detached from any avatar. |
| **Movement, Input & Mining/Placement** | ❌ Not implemented | WASD, mouse look, mining, placement, and mobile joystick controls are unbound; hotbar/inventory never change. |
| **Entities, Combat & Survival** | ❌ Not implemented | There are no zombies, golems, health deductions, oxygen bubbles, or respawn flows. Hearts stay static. |
| **Crafting, Inventory & Score Feedback** | ❌ Not implemented | The crafting modal is decorative. Recipes, scoring, and hotbar management are absent. |
| **Portals, Dimensions & Progression** | ❌ Not implemented | Portal frames cannot be constructed or activated. Realm-specific physics, the Netherite boss, and victory flow do not exist. |
| **Backend Sync & SSO Hooks** | ⚠️ Partially scaffolded | Serverless handlers are present, but the frontend never calls `/users` or `/scores` because gameplay hooks are missing. Google SSO buttons render without completing the auth flow. |
| **UI Feedback & Accessibility** | ⚠️ Partially scaffolded | HUD panels render static placeholder copy. Tooltips, leaderboard data, and responsive states require implementation. |
| **Performance & Asset Optimisation** | ❌ Not implemented | No delta-time pacing, frustum culling, or asset caching exists. Performance targets are unmet because the scene is empty. |

## Next steps

- Track implementation progress in [docs/enhancement-roadmap.md](./enhancement-roadmap.md).
- Use [docs/portals-of-dimension-plan.md](./portals-of-dimension-plan.md) for per-system engineering guidance.
- Update this compliance table once code lands that demonstrably satisfies each requirement.
