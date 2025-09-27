# Coding Agent Prompt Library

The original design brief for **Infinite Rails: Portals of Dimension** shipped
with a series of detailed prompts intended for automated coding agents. These
snippets are preserved here so that follow-up improvements can reuse the same
language without digging through external documents. Each prompt mirrors the
systems now implemented inside `script.js` and `simple-experience.js` and should
be used whenever a future PR needs to extend or refactor that subsystem.

## Rendering and World Generation
```
In the InfiniteRails repo's script.js, enhance the bootstrap() function to fully
initialize a Three.js (r161 CDN) scene with an OrthographicCamera (position
[0,1.8,5], fixed forward lookAt [0,1.8,10], no pitch tilt for Minecraft-like
stability). Create a worldGroup and procedurally generate a 64x64 grass island
using BoxGeometry(1,1,1) meshes with MeshLambertMaterial loaded from S3 textures
(e.g., 'https://your-bucket.s3.amazonaws.com/grass.png'). Add HemisphereLight
for ambient and DirectionalLight for sun (orbit for day/night cycle every 600s).
Start requestAnimationFrame(gameLoop) with delta = clock.getDelta(), calling
update(delta) then renderer.render(scene, camera). Fix empty scene bug by
ensuring worldGroup.add(voxel) in a nested loop. Validate: On load,
console.log('World generated: 4096 voxels'); target 60 FPS. Output the complete
bootstrap() and gameLoop() functions, integrating with existing APP_CONFIG.
```

## Player Visibility and First-Person View
```
Building on script.js from InfiniteRails, add a loadPlayerModel() function using
GLTFLoader to fetch 'steve.gltf' from S3 (free Minecraft-like asset: detailed
blue-shirted humanoid with walk/idle animations). Clone the model, scale to 1
unit, position at [0,0,0] in entityGroup (add to scene), and attach camera as
child of head bone for first-person view (visible arms/hands). Implement
AnimationMixer for idle loop. Call loadPlayerModel() in bootstrap() after world
gen. Ensure no third-person—camera locked to Steve's perspective. Fix
invisibility: Add error handler logging 'Model load failed, using fallback cube'.
Validate: Console.log('Steve visible in scene'); move test with temp keydown.
Output loadPlayerModel() and camera attachment code, with Minecraft-style
low-poly textures.
```

## Input Controls and Responsiveness
```
In InfiniteRails script.js, complete initEventListeners() called from
bootstrap(): Bind document.addEventListener('keydown', handleKey) for WASD
(update player.position.x/z by 5delta, raycast snap to nearest rail via
THREE.Raycaster); 'mousemove' for yaw-only look (sensitivity 0.002, quaternion
rotateY); 'click' for pointerlock and left/right mine/place (raycast from camera,
remove/add voxel to hotbar). For mobile, add touchstart/move/end on canvas for
virtual joystick (bottom-left div, analog vector to movement). Fix no-response:
Use preventDefault(), global scope, and pressedKeys Set for held keys. Add Space
for jump (velocity.y += 10delta). Validate: Press W → log('Moving forward');
ensure 1 unit/sec speed. Output full event handlers, normalized for
desktop/mobile like Minecraft controls.
```

## Entities and Combat
```
Extend InfiniteRails script.js entity system: In createZombie(), GLTFLoader
'zombie.gltf' (green-skinned Minecraft model), add to entityGroup at random
chunk edges during night (spawn 2-4 if daylight <50%). Update in gameLoop:
Vector3 towards player (speed 2delta), collision detect (distance <1 → deduct
0.5 heart, play Howler moan). For iron golems ('golem.gltf', spawn near player
every 30s), target nearest zombie (intercept if <10 units). Health: Array of 10
heart meshes (scale on damage); 5 hits → fade screen black, respawn player at
[0,0,0] retaining inventory. Fix missing characters: Ensure add to scene.
Validate: Simulate night → log('Zombie spawned, chasing'); 5 hits → 'Respawn
triggered'. Output entity creation/update functions with AI pathing (simple A
stub).
```

## Crafting, Inventory, and UI Dynamics
```
In InfiniteRails script.js, implement inventory as 10-slot hotbar array (stack
to 99, variants separate) and 3x3 modal on 'E' key (draggable icons via mouse
events). Crafting button (circle near hearts) opens sequence UI: Drag items to
linear slots, validate order (e.g., ['stick','stick','stone'] → create pickaxe
mesh, +2 score, unlock recipe). Update HUD in gameLoop: textContent for score
(total pts), dimension progress bar. Add bubbles UI for underwater (deplete over
time). Fix static UI: Use requestAnimationFrame for refreshes. Minecraft-like:
No table, instant feedback glow. Validate: Drag sequence → log('Craft success,
+2 pts'); hotbar shows mined grass. Output inventory/crafting modules with drag
logic.
```

## Portals, Dimensions, and Progression
```
Integrate InfiniteRails portal-mechanics.js into script.js: Detect 4x3 frame on
place (raycast check uniform material, 2x2 center empty), 'F' interact with
torch → activate ShaderMaterial swirl (uTime uniform animated). On step-in
collision, fade (alpha tween 2s) and swap worldGroup to new dimension
(procedural gen: Rock adds gravity*1.5 via velocity scale, +5 pts). Sequential
unlocks: Track currentDimension index. Netherite boss: Timer crumbles rails
(remove meshes), align jumps to collect Ingot → victory modal. Fix
non-functional: Bind raycast to place. Validate: Build frame → log('Portal
active'); enter → 'Dimension: Rock unlocked'. Output portal detection/transition
code with shaders.
```

## Backend Sync, Polish, and Deployment
```
For InfiniteRails, in script.js add fetch to APP_CONFIG.apiBaseUrl + '/scores'
(GET top 10, POST on unlock with {name, score, dimensions}). Wire Google SSO
button: gapi.load → signIn callback posts to /users (Google ID, geolocation via
navigator). Add Howler.js for SFX (mine: crunch.wav from S3). Polish: Tooltips
on UI ('WASD: Move'), 'Made by Manu' footer, win screen replay. Update
deploy.yml: Add asset sync step, validate FPS >50 post-deploy. Fix slowness:
Compress GLTF, error logs for shaders. Validate: Login → log('Score synced');
full playthrough no lags. Output API/fetch code, footer HTML, and workflow YAML
additions.
```

---

> **Note:** The gameplay sandbox already implements the systems above inside
> `simple-experience.js` and `script.js`. When building new features, reference
> the implementations noted in [`docs/enhancement-roadmap.md`](./enhancement-roadmap.md)
> to keep the codebase aligned with this brief.
