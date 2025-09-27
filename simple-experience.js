(function () {
  const WORLD_SIZE = 48;
  const BLOCK_SIZE = 1;
  const PLAYER_EYE_HEIGHT = 1.7;
  const PLAYER_BASE_SPEED = 4.5;
  const PLAYER_INERTIA = 0.88;
  const DAY_LENGTH_SECONDS = 600;
  const POINTER_SENSITIVITY = 0.0022;
  const FALLBACK_HEALTH = 10;
  const PORTAL_BLOCK_REQUIREMENT = 12;
  const PORTAL_INTERACTION_RANGE = 4.5;
  const ZOMBIE_CONTACT_RANGE = 1.35;
  const ZOMBIE_SPAWN_INTERVAL = 8;
  const ZOMBIE_MAX_PER_DIMENSION = 4;
  const DIMENSION_THEME = [
    {
      id: 'origin',
      name: 'Origin Grassland',
      palette: {
        grass: '#69c368',
        dirt: '#b07a42',
        stone: '#9d9d9d',
        rails: '#c9a14d',
      },
      fog: '#87ceeb',
      sky: '#87ceeb',
      sun: '#ffffff',
      hemi: '#bddcff',
      gravity: 1,
      speedMultiplier: 1,
      description:
        'Gentle plains with forgiving gravity. Harvest and craft to stabilise the portal frame.',
    },
    {
      id: 'rock',
      name: 'Rock Frontier',
      palette: {
        grass: '#7b858a',
        dirt: '#5d6468',
        stone: '#3b4248',
        rails: '#e0b072',
      },
      fog: '#65727c',
      sky: '#4d565f',
      sun: '#f6f1d9',
      hemi: '#5b748a',
      gravity: 1.35,
      speedMultiplier: 0.92,
      description:
        'Heavier steps and denser air. Keep momentum up and beware of zombies charging along the rails.',
    },
    {
      id: 'tar',
      name: 'Tar Marsh',
      palette: {
        grass: '#3c3a45',
        dirt: '#2d2b33',
        stone: '#1f1e25',
        rails: '#ffb347',
      },
      fog: '#1f1a21',
      sky: '#261c2f',
      sun: '#ffb347',
      hemi: '#45364d',
      gravity: 0.85,
      speedMultiplier: 1.1,
      description:
        'Low gravity swamp. Use the extra lift to hop across gaps while night creatures emerge from the mist.',
    },
    {
      id: 'netherite',
      name: 'Netherite Terminus',
      palette: {
        grass: '#4c1f24',
        dirt: '#321016',
        stone: '#14070a',
        rails: '#ff7043',
      },
      fog: '#160607',
      sky: '#1a0304',
      sun: '#ff7043',
      hemi: '#471414',
      gravity: 1.15,
      speedMultiplier: 1,
      description:
        'Final gauntlet of collapsing rails. Activate the portal swiftly to claim the Eternal Ingot.',
    },
  ];

  function pseudoRandom(x, z) {
    const value = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
    return value - Math.floor(value);
  }

  function createHeartMarkup(health) {
    const fullHearts = Math.floor(health / 2);
    const halfHeart = health % 2;
    const pieces = [];
    for (let i = 0; i < 5; i += 1) {
      const index = i * 2;
      let glyph = '♡';
      if (index + 1 <= fullHearts) {
        glyph = '❤';
      } else if (index < fullHearts + halfHeart) {
        glyph = '❥';
      }
      const span = `<span class="heart-icon" aria-hidden="true">${glyph}</span>`;
      pieces.push(span);
    }
    return `<span class="hud-hearts" role="img" aria-label="${health / 2} hearts remaining">${pieces.join('')}</span>`;
  }

  class SimpleExperience {
    constructor(options) {
      const THREE = window.THREE_GLOBAL || window.THREE;
      if (!THREE) {
        throw new Error('Three.js is required for the simplified experience.');
      }
      this.THREE = THREE;
      this.canvas = options.canvas;
      this.ui = options.ui;
      this.scene = null;
      this.camera = null;
      this.renderer = null;
      this.sunLight = null;
      this.hemiLight = null;
      this.terrainGroup = null;
      this.railsGroup = null;
      this.portalGroup = null;
      this.zombieGroup = null;
      this.columns = new Map();
      this.heightMap = Array.from({ length: WORLD_SIZE }, () => Array(WORLD_SIZE).fill(0));
      this.blockGeometry = new THREE.BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
      this.railGeometry = new THREE.BoxGeometry(BLOCK_SIZE * 0.9, BLOCK_SIZE * 0.15, BLOCK_SIZE * 1.2);
      this.materials = {
        grass: new THREE.MeshStandardMaterial({ color: new THREE.Color('#69c368'), roughness: 0.7, metalness: 0.05 }),
        dirt: new THREE.MeshStandardMaterial({ color: new THREE.Color('#b07a42'), roughness: 0.95, metalness: 0.02 }),
        stone: new THREE.MeshStandardMaterial({ color: new THREE.Color('#9d9d9d'), roughness: 0.8, metalness: 0.18 }),
        rails: new THREE.MeshStandardMaterial({ color: new THREE.Color('#c9a14d'), roughness: 0.35, metalness: 0.65 }),
        zombie: new THREE.MeshStandardMaterial({ color: new THREE.Color('#2e7d32'), roughness: 0.8, metalness: 0.1 }),
        portal: new THREE.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          uniforms: {
            uTime: { value: 0 },
            uColorA: { value: new THREE.Color('#7f5af0') },
            uColorB: { value: new THREE.Color('#2cb67d') },
          },
          vertexShader: `
            varying vec2 vUv;
            void main() {
              vUv = uv;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `,
          fragmentShader: `
            uniform float uTime;
            uniform vec3 uColorA;
            uniform vec3 uColorB;
            varying vec2 vUv;
            void main() {
              float swirl = sin((vUv.x + vUv.y + uTime * 0.7) * 6.2831) * 0.5 + 0.5;
              float vignette = smoothstep(0.95, 0.35, distance(vUv, vec2(0.5)));
              vec3 color = mix(uColorA, uColorB, swirl) * vignette;
              gl_FragColor = vec4(color, vignette);
            }
          `,
        }),
      };
      this.keys = new Set();
      this.velocity = new THREE.Vector3();
      this.tmpForward = new THREE.Vector3();
      this.tmpRight = new THREE.Vector3();
      this.tmpVector = new THREE.Vector3();
      this.tmpVector2 = new THREE.Vector3();
      this.pointerLocked = false;
      this.yaw = 0;
      this.pitch = 0;
      this.elapsed = 0;
      this.health = FALLBACK_HEALTH;
      this.score = 0;
      this.blocksMined = 0;
      this.blocksPlaced = 0;
      this.portalBlocksPlaced = 0;
      this.portalActivated = false;
      this.portalMesh = null;
      this.portalActivations = 0;
      this.portalHintShown = false;
      this.victoryAchieved = false;
      this.currentDimensionIndex = 0;
      this.dimensionSettings = DIMENSION_THEME[0];
      this.currentSpeed = PLAYER_BASE_SPEED;
      this.gravityScale = this.dimensionSettings.gravity;
      this.verticalVelocity = 0;
      this.isGrounded = false;
      this.portalAnchor = new THREE.Vector3(0, 0, -WORLD_SIZE * 0.45);
      this.zombies = [];
      this.lastZombieSpawn = 0;
      this.zombieIdCounter = 0;
      this.zombieGeometry = null;
      this.portalFrameGeometryVertical = null;
      this.portalFrameGeometryHorizontal = null;
      this.portalPlaneGeometry = null;
      this.daylightIntensity = 1;
      this.raycaster = new THREE.Raycaster();
      this.animationFrame = null;
      this.started = false;
      this.prevTime = null;
      this.onPointerLockChange = this.handlePointerLockChange.bind(this);
      this.onPointerLockError = this.handlePointerLockError.bind(this);
      this.onMouseMove = this.handleMouseMove.bind(this);
      this.onKeyDown = this.handleKeyDown.bind(this);
      this.onKeyUp = this.handleKeyUp.bind(this);
      this.onResize = this.handleResize.bind(this);
      this.onMouseDown = this.handleMouseDown.bind(this);
      this.preventContextMenu = (event) => event.preventDefault();
    }

    start() {
      if (this.started) return;
      this.started = true;
      this.setupScene();
      this.applyDimensionSettings(this.currentDimensionIndex);
      this.buildTerrain();
      this.buildRails();
      this.refreshPortalState();
      this.positionPlayer();
      this.bindEvents();
      this.updateHud();
      this.hideIntro();
      this.renderFrame(performance.now());
    }

    hideIntro() {
      const { introModal, startButton, hudRootEl } = this.ui;
      if (introModal) {
        introModal.hidden = true;
        introModal.style.display = 'none';
        introModal.setAttribute('aria-hidden', 'true');
      }
      if (startButton) {
        startButton.disabled = true;
        startButton.setAttribute('aria-hidden', 'true');
        startButton.setAttribute('tabindex', '-1');
        startButton.blur();
      }
      if (hudRootEl) {
        document.body.classList.add('game-active');
      }
      this.canvas.focus({ preventScroll: true });
    }

    stop() {
      if (this.animationFrame !== null) {
        cancelAnimationFrame(this.animationFrame);
        this.animationFrame = null;
      }
      this.unbindEvents();
    }

    setupScene() {
      const THREE = this.THREE;
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color('#87ceeb');
      this.scene.fog = new THREE.Fog(0x87ceeb, 40, 140);

      const width = this.canvas.clientWidth || this.canvas.width || 1;
      const height = this.canvas.clientHeight || this.canvas.height || 1;
      this.camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 250);
      this.camera.position.set(0, PLAYER_EYE_HEIGHT, 12);

      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.05;
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer.setPixelRatio(window.devicePixelRatio ?? 1);
      this.renderer.setSize(width, height, false);

      this.hemiLight = new THREE.HemisphereLight(0xbddcff, 0x34502d, 0.9);
      this.scene.add(this.hemiLight);

      this.sunLight = new THREE.DirectionalLight(0xffffff, 1.1);
      this.sunLight.position.set(18, 32, 12);
      this.sunLight.castShadow = true;
      this.sunLight.shadow.mapSize.set(2048, 2048);
      this.sunLight.shadow.camera.near = 0.5;
      this.sunLight.shadow.camera.far = 160;
      this.sunLight.shadow.camera.left = -60;
      this.sunLight.shadow.camera.right = 60;
      this.sunLight.shadow.camera.top = 60;
      this.sunLight.shadow.camera.bottom = -60;
      this.scene.add(this.sunLight);
      this.scene.add(this.sunLight.target);

      const ambient = new THREE.AmbientLight(0xffffff, 0.18);
      this.scene.add(ambient);

      this.terrainGroup = new THREE.Group();
      this.railsGroup = new THREE.Group();
      this.portalGroup = new THREE.Group();
      this.zombieGroup = new THREE.Group();
      this.scene.add(this.terrainGroup);
      this.scene.add(this.railsGroup);
      this.scene.add(this.portalGroup);
      this.scene.add(this.zombieGroup);
    }

    applyDimensionSettings(index) {
      const themeCount = DIMENSION_THEME.length;
      const safeIndex = ((index % themeCount) + themeCount) % themeCount;
      this.currentDimensionIndex = safeIndex;
      const theme = DIMENSION_THEME[safeIndex] ?? DIMENSION_THEME[0];
      this.dimensionSettings = theme;
      this.currentSpeed = PLAYER_BASE_SPEED * (theme.speedMultiplier ?? 1);
      this.gravityScale = theme.gravity ?? 1;

      const { palette } = theme;
      if (palette?.grass) this.materials.grass.color.set(palette.grass);
      if (palette?.dirt) this.materials.dirt.color.set(palette.dirt);
      if (palette?.stone) this.materials.stone.color.set(palette.stone);
      if (palette?.rails) this.materials.rails.color.set(palette.rails);
      if (palette?.rails) {
        this.materials.portal.uniforms.uColorA.value.set(palette.rails);
      }
      if (palette?.grass) {
        this.materials.portal.uniforms.uColorB.value.set(palette.grass);
      }
      if (this.scene?.background && theme.sky) {
        this.scene.background.set(theme.sky);
      }
      if (this.scene?.fog && theme.fog) {
        this.scene.fog.color.set(theme.fog);
      }
      if (this.hemiLight && theme.hemi) {
        this.hemiLight.color.set(theme.hemi);
      }
      if (this.sunLight && theme.sun) {
        this.sunLight.color.set(theme.sun);
      }
      this.updateDimensionInfoPanel();
    }

    buildTerrain() {
      const THREE = this.THREE;
      this.columns.clear();
      this.heightMap = Array.from({ length: WORLD_SIZE }, () => Array(WORLD_SIZE).fill(0));
      this.terrainGroup.clear();
      const half = WORLD_SIZE / 2;
      for (let gx = 0; gx < WORLD_SIZE; gx += 1) {
        for (let gz = 0; gz < WORLD_SIZE; gz += 1) {
          const offsetX = gx - half;
          const offsetZ = gz - half;
          const worldX = offsetX * BLOCK_SIZE;
          const worldZ = offsetZ * BLOCK_SIZE;
          const distance = Math.hypot(offsetX, offsetZ);
          const falloff = Math.max(0, 1 - distance / (WORLD_SIZE * 0.68));
          if (falloff <= 0.02) {
            continue;
          }
          const heightNoise = pseudoRandom(gx * 0.35, gz * 0.35);
          const secondary = pseudoRandom(gz * 0.12, gx * 0.18);
          const maxHeight = Math.max(1, Math.round(1 + falloff * 2.6 + heightNoise * 2 + secondary * 0.9));
          this.heightMap[gx][gz] = maxHeight;
          const columnKey = `${gx}|${gz}`;
          const column = [];
          for (let level = 0; level < maxHeight; level += 1) {
            const isSurface = level === maxHeight - 1;
            const material = isSurface
              ? this.materials.grass
              : level > maxHeight - 3
                ? this.materials.dirt
                : this.materials.stone;
            const mesh = new THREE.Mesh(this.blockGeometry, material);
            mesh.castShadow = isSurface;
            mesh.receiveShadow = true;
            mesh.position.set(worldX, level * BLOCK_SIZE + BLOCK_SIZE / 2, worldZ);
            mesh.userData = {
              columnKey,
              level,
              gx,
              gz,
            };
            mesh.matrixAutoUpdate = false;
            mesh.updateMatrix();
            this.terrainGroup.add(mesh);
            column.push(mesh);
          }
          this.columns.set(columnKey, column);
        }
      }
      if (typeof console !== 'undefined') {
        console.log(`World generated: ${this.terrainGroup.children.length} voxels`);
      }
    }

    buildRails() {
      const THREE = this.THREE;
      this.railsGroup.clear();
      const segments = 22;
      const radius = WORLD_SIZE * 0.18;
      for (let i = 0; i < segments; i += 1) {
        const t = i / (segments - 1);
        const angle = (t - 0.5) * Math.PI * 0.45;
        const x = Math.sin(angle) * radius;
        const z = -t * WORLD_SIZE * 0.65;
        const ground = this.sampleGroundHeight(x, z);
        const mesh = new THREE.Mesh(this.railGeometry, this.materials.rails);
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        mesh.position.set(x, ground + 0.1, z);
        mesh.rotation.y = angle * 0.6;
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        this.railsGroup.add(mesh);
      }
    }

    refreshPortalState() {
      this.portalGroup.clear();
      this.portalMesh = null;
      this.portalBlocksPlaced = 0;
      this.portalActivated = false;
      this.portalHintShown = false;
      this.updatePortalProgress();
    }

    activatePortal() {
      const THREE = this.THREE;
      this.portalGroup.clear();
      this.portalActivated = true;
      const anchorX = this.portalAnchor.x;
      const anchorZ = this.portalAnchor.z;
      const groundHeight = this.sampleGroundHeight(anchorX, anchorZ);
      const anchorY = groundHeight + 1.6;
      const frameMaterial = this.materials.stone;
      if (!this.portalFrameGeometryVertical) {
        this.portalFrameGeometryVertical = new THREE.BoxGeometry(0.4, 3.6, 0.4);
      }
      if (!this.portalFrameGeometryHorizontal) {
        this.portalFrameGeometryHorizontal = new THREE.BoxGeometry(2.6, 0.4, 0.4);
      }

      const left = new THREE.Mesh(this.portalFrameGeometryVertical, frameMaterial);
      left.position.set(anchorX - 1.2, anchorY, anchorZ);
      left.castShadow = true;
      left.receiveShadow = true;
      this.portalGroup.add(left);

      const right = left.clone();
      right.position.x = anchorX + 1.2;
      this.portalGroup.add(right);

      const top = new THREE.Mesh(this.portalFrameGeometryHorizontal, frameMaterial);
      top.position.set(anchorX, anchorY + 1.8, anchorZ);
      top.castShadow = true;
      top.receiveShadow = true;
      this.portalGroup.add(top);

      const bottom = top.clone();
      bottom.position.y = anchorY - 1.8;
      this.portalGroup.add(bottom);

      if (!this.portalPlaneGeometry) {
        this.portalPlaneGeometry = new THREE.PlaneGeometry(2.4, 3.2);
      }
      const portalMaterial = this.materials.portal.clone();
      portalMaterial.uniforms = {
        uTime: { value: 0 },
        uColorA: { value: this.materials.portal.uniforms.uColorA.value.clone() },
        uColorB: { value: this.materials.portal.uniforms.uColorB.value.clone() },
      };
      const plane = new THREE.Mesh(this.portalPlaneGeometry, portalMaterial);
      plane.position.set(anchorX, anchorY, anchorZ + 0.02);
      plane.rotation.y = Math.PI;
      this.portalGroup.add(plane);
      this.portalMesh = plane;
      this.updatePortalProgress();
      this.portalActivations = Math.max(this.portalActivations, 0);
      this.portalHintShown = true;
      this.updateHud();
    }

    isPlayerNearPortal() {
      if (!this.portalMesh || !this.camera) return false;
      const distance = this.portalMesh.position.distanceTo(this.camera.position);
      return distance <= PORTAL_INTERACTION_RANGE;
    }

    checkPortalActivation() {
      if (this.portalActivated) {
        this.updatePortalProgress();
        return;
      }
      if (this.portalBlocksPlaced >= PORTAL_BLOCK_REQUIREMENT) {
        this.activatePortal();
        this.score += 5;
        this.updateHud();
      } else {
        const progress = this.portalBlocksPlaced / PORTAL_BLOCK_REQUIREMENT;
        if (!this.portalHintShown && progress >= 0.5) {
          this.portalHintShown = true;
          this.score += 1;
        }
        this.updatePortalProgress();
      }
    }

    advanceDimension() {
      if (!this.portalActivated || this.victoryAchieved) return;
      this.portalActivations += 1;
      if (this.currentDimensionIndex >= DIMENSION_THEME.length - 1) {
        this.triggerVictory();
        return;
      }
      const nextIndex = this.currentDimensionIndex + 1;
      this.applyDimensionSettings(nextIndex);
      this.buildTerrain();
      this.buildRails();
      this.refreshPortalState();
      this.positionPlayer();
      this.clearZombies();
      this.score += 8;
      this.updateHud();
    }

    triggerVictory() {
      this.victoryAchieved = true;
      this.portalActivated = false;
      this.portalGroup.clear();
      this.portalMesh = null;
      this.score += 25;
      this.clearZombies();
      this.updatePortalProgress();
      this.updateHud();
    }

    positionPlayer() {
      const spawnColumn = `${Math.floor(WORLD_SIZE / 2)}|${Math.floor(WORLD_SIZE / 2)}`;
      const column = this.columns.get(spawnColumn);
      if (column && column.length) {
        const top = column[column.length - 1];
        this.camera.position.set(top.position.x, top.position.y + PLAYER_EYE_HEIGHT, top.position.z + 2.5);
      } else {
        this.camera.position.set(0, PLAYER_EYE_HEIGHT + 1, 0);
      }
    }

    bindEvents() {
      document.addEventListener('pointerlockchange', this.onPointerLockChange);
      document.addEventListener('pointerlockerror', this.onPointerLockError);
      document.addEventListener('keydown', this.onKeyDown);
      document.addEventListener('keyup', this.onKeyUp);
      document.addEventListener('mousemove', this.onMouseMove);
      document.addEventListener('mousedown', this.onMouseDown);
      window.addEventListener('resize', this.onResize);
      this.canvas.addEventListener('click', () => {
        if (document.pointerLockElement !== this.canvas) {
          this.canvas.requestPointerLock({ unadjustedMovement: true }).catch(() => {});
        }
      });
      this.canvas.addEventListener('contextmenu', this.preventContextMenu);
    }

    unbindEvents() {
      document.removeEventListener('pointerlockchange', this.onPointerLockChange);
      document.removeEventListener('pointerlockerror', this.onPointerLockError);
      document.removeEventListener('keydown', this.onKeyDown);
      document.removeEventListener('keyup', this.onKeyUp);
      document.removeEventListener('mousemove', this.onMouseMove);
      document.removeEventListener('mousedown', this.onMouseDown);
      window.removeEventListener('resize', this.onResize);
      this.canvas.removeEventListener('contextmenu', this.preventContextMenu);
    }

    handlePointerLockChange() {
      this.pointerLocked = document.pointerLockElement === this.canvas;
    }

    handlePointerLockError() {
      this.pointerLocked = false;
    }

    handleMouseMove(event) {
      if (!this.pointerLocked) return;
      this.yaw -= event.movementX * POINTER_SENSITIVITY;
      this.pitch -= event.movementY * POINTER_SENSITIVITY;
      const maxPitch = Math.PI / 2 - 0.01;
      this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));
    }

    handleKeyDown(event) {
      this.keys.add(event.code);
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'].includes(event.code)) {
        event.preventDefault();
      }
      if (event.code === 'KeyR') {
        this.resetPosition();
        event.preventDefault();
      }
      if (event.code === 'KeyF') {
        if (this.portalActivated && this.isPlayerNearPortal()) {
          this.advanceDimension();
        }
        event.preventDefault();
      }
    }

    handleKeyUp(event) {
      this.keys.delete(event.code);
    }

    handleResize() {
      if (!this.renderer || !this.camera) return;
      const width = this.canvas.clientWidth || window.innerWidth || 1;
      const height = this.canvas.clientHeight || window.innerHeight || 1;
      this.renderer.setSize(width, height, false);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    }

    handleMouseDown(event) {
      if (!this.pointerLocked || !this.camera) return;
      if (event.button === 0) {
        this.mineBlock();
      } else if (event.button === 2) {
        this.placeBlock();
      }
    }

    resetPosition() {
      this.velocity.set(0, 0, 0);
      this.verticalVelocity = 0;
      this.isGrounded = false;
      this.positionPlayer();
    }

    renderFrame(timestamp) {
      this.animationFrame = requestAnimationFrame((nextTimestamp) => this.renderFrame(nextTimestamp));
      if (!this.prevTime) {
        this.prevTime = timestamp;
      }
      const delta = Math.min(0.05, (timestamp - this.prevTime) / 1000);
      this.prevTime = timestamp;
      this.elapsed += delta;
      this.updateDayNightCycle();
      this.updateMovement(delta);
      this.updateZombies(delta);
      this.updatePortalAnimation(delta);
      this.renderer.render(this.scene, this.camera);
    }

    updateMovement(delta) {
      const THREE = this.THREE;
      const forward = this.tmpForward;
      const right = this.tmpRight;
      forward.set(0, 0, -1).applyEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
      forward.y = 0;
      if (forward.lengthSq() > 0) forward.normalize();
      right.set(1, 0, 0).applyEuler(new THREE.Euler(0, this.yaw + Math.PI / 2, 0));
      right.y = 0;
      if (right.lengthSq() > 0) right.normalize();

      const speed = this.currentSpeed;
      if (this.keys.has('KeyW')) {
        this.velocity.addScaledVector(forward, speed * delta);
      }
      if (this.keys.has('KeyS')) {
        this.velocity.addScaledVector(forward, -speed * delta);
      }
      if (this.keys.has('KeyA')) {
        this.velocity.addScaledVector(right, -speed * delta);
      }
      if (this.keys.has('KeyD')) {
        this.velocity.addScaledVector(right, speed * delta);
      }

      this.velocity.multiplyScalar(PLAYER_INERTIA);

      const cameraQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
      this.camera.quaternion.copy(cameraQuaternion);

      this.camera.position.add(this.velocity);

      const groundHeight = this.sampleGroundHeight(this.camera.position.x, this.camera.position.z);
      if (this.keys.has('Space') && this.isGrounded) {
        const jumpBoost = 4.6 + (1.5 - Math.min(1.5, this.gravityScale));
        this.verticalVelocity = jumpBoost;
        this.isGrounded = false;
      }
      const gravityForce = 22 * this.gravityScale;
      this.verticalVelocity -= gravityForce * delta;
      this.camera.position.y += this.verticalVelocity * delta;
      const desiredHeight = groundHeight + PLAYER_EYE_HEIGHT;
      if (this.camera.position.y <= desiredHeight) {
        this.camera.position.y = desiredHeight;
        this.verticalVelocity = 0;
        this.isGrounded = true;
      }

      const maxDistance = (WORLD_SIZE / 2 - 2) * BLOCK_SIZE;
      this.camera.position.x = THREE.MathUtils.clamp(this.camera.position.x, -maxDistance, maxDistance);
      this.camera.position.z = THREE.MathUtils.clamp(this.camera.position.z, -maxDistance, maxDistance);
    }

    sampleGroundHeight(x, z) {
      const gridX = Math.round(x / BLOCK_SIZE + WORLD_SIZE / 2);
      const gridZ = Math.round(z / BLOCK_SIZE + WORLD_SIZE / 2);
      const height = this.heightMap[gridX]?.[gridZ] ?? 0;
      return height * BLOCK_SIZE;
    }

    updateDayNightCycle() {
      if (!this.sunLight || !this.hemiLight) return;
      const cycle = (this.elapsed % DAY_LENGTH_SECONDS) / DAY_LENGTH_SECONDS;
      const angle = cycle * Math.PI * 2;
      const intensity = Math.max(0.12, Math.sin(angle) * 0.5 + 0.55);
      this.daylightIntensity = intensity;
      this.sunLight.position.set(Math.cos(angle) * 60, Math.sin(angle) * 45, Math.sin(angle * 0.7) * 40);
      this.sunLight.intensity = 0.6 + intensity * 0.8;
      this.hemiLight.intensity = 0.6 + intensity * 0.4;
      if (this.scene?.fog) {
        this.scene.fog.color.setHSL(0.55, 0.5, 0.7 - intensity * 0.2);
      }
      if (this.ui?.timeEl) {
        const daylight = Math.round(Math.min(1, Math.max(0, intensity)) * 100);
        let label = 'Daylight';
        if (intensity < 0.28) {
          label = 'Nightfall';
        } else if (intensity < 0.45) {
          label = 'Dusk';
        } else if (intensity > 0.85) {
          label = 'Dawn';
        }
        this.ui.timeEl.textContent = `${label} ${daylight}%`;
      }
    }

    updatePortalAnimation(delta) {
      if (!this.portalMesh) return;
      const material = this.portalMesh.material;
      if (material?.uniforms?.uTime) {
        material.uniforms.uTime.value += delta * 1.2;
      }
    }

    updateZombies(delta) {
      if (!this.zombieGroup) return;
      const THREE = this.THREE;
      if (!this.isNight()) {
        if (this.zombies.length) {
          this.clearZombies();
        }
        return;
      }
      if (this.elapsed - this.lastZombieSpawn > ZOMBIE_SPAWN_INTERVAL && this.zombies.length < ZOMBIE_MAX_PER_DIMENSION) {
        this.spawnZombie();
        this.lastZombieSpawn = this.elapsed;
      }
      const playerPosition = this.camera?.position;
      if (!playerPosition) return;
      const tmpDir = this.tmpVector;
      const tmpStep = this.tmpVector2;
      for (const zombie of this.zombies) {
        const { mesh } = zombie;
        tmpDir.subVectors(playerPosition, mesh.position);
        const distance = tmpDir.length();
        if (distance > 0.001) {
          tmpDir.normalize();
          tmpStep.copy(tmpDir).multiplyScalar(zombie.speed * delta);
          mesh.position.add(tmpStep);
          mesh.rotation.y = Math.atan2(tmpDir.x, tmpDir.z);
        }
        const groundHeight = this.sampleGroundHeight(mesh.position.x, mesh.position.z);
        mesh.position.y = THREE.MathUtils.lerp(mesh.position.y, groundHeight + 0.9, delta * 10);
        if (distance < ZOMBIE_CONTACT_RANGE && this.elapsed - zombie.lastAttack > 1.2) {
          this.damagePlayer(1);
          zombie.lastAttack = this.elapsed;
        }
      }
    }

    isNight() {
      return this.daylightIntensity < 0.32;
    }

    spawnZombie() {
      const THREE = this.THREE;
      if (!THREE) return;
      const id = (this.zombieIdCounter += 1);
      const angle = Math.random() * Math.PI * 2;
      const radius = WORLD_SIZE * 0.45;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const ground = this.sampleGroundHeight(x, z);
      if (!this.zombieGeometry) {
        this.zombieGeometry = new THREE.BoxGeometry(0.9, 1.8, 0.9);
      }
      const material = this.materials.zombie.clone();
      material.color.offsetHSL(0, (Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.1);
      const mesh = new THREE.Mesh(this.zombieGeometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.position.set(x, ground + 0.9, z);
      this.zombieGroup.add(mesh);
      this.zombies.push({ id, mesh, speed: 2.4, lastAttack: this.elapsed });
    }

    clearZombies() {
      for (const zombie of this.zombies) {
        this.zombieGroup.remove(zombie.mesh);
        zombie.mesh.material?.dispose?.();
      }
      this.zombieGroup.clear();
      this.zombies = [];
    }

    damagePlayer(amount) {
      const previous = this.health;
      this.health = Math.max(0, this.health - amount);
      if (this.health !== previous) {
        this.updateHud();
      }
      if (this.health <= 0) {
        this.handleDefeat();
      }
    }

    handleDefeat() {
      this.health = FALLBACK_HEALTH;
      this.score = Math.max(0, this.score - 4);
      this.portalBlocksPlaced = Math.max(0, this.portalBlocksPlaced - 3);
      this.verticalVelocity = 0;
      this.isGrounded = false;
      this.positionPlayer();
      this.clearZombies();
      this.lastZombieSpawn = this.elapsed;
      this.updateHud();
    }

    mineBlock() {
      const intersections = this.castFromCamera();
      if (!intersections.length) return;
      const hit = intersections.find((intersection) => intersection.object?.userData?.columnKey);
      if (!hit) return;
      const mesh = hit.object;
      const columnKey = mesh.userData.columnKey;
      const column = this.columns.get(columnKey);
      if (!column || !column.length) return;
      const top = column[column.length - 1];
      if (top !== mesh) {
        return;
      }
      column.pop();
      this.terrainGroup.remove(mesh);
      this.blocksMined += 1;
      this.score += 1;
      this.heightMap[mesh.userData.gx][mesh.userData.gz] = column.length;
      if (column.length) {
        const newTop = column[column.length - 1];
        newTop.material = this.materials.grass;
      }
      this.portalBlocksPlaced = Math.max(0, this.portalBlocksPlaced - 1);
      this.checkPortalActivation();
      this.updateHud();
    }

    placeBlock() {
      const intersections = this.castFromCamera();
      if (!intersections.length) return;
      const hit = intersections.find((intersection) => intersection.object?.userData?.columnKey);
      if (!hit) return;
      const mesh = hit.object;
      const { columnKey, gx, gz } = mesh.userData;
      const column = this.columns.get(columnKey) ?? [];
      const newLevel = column.length;
      const worldX = mesh.position.x;
      const worldZ = mesh.position.z;
      if (newLevel >= 12) {
        return;
      }
      if (column.length) {
        const prevTop = column[column.length - 1];
        prevTop.material = this.materials.dirt;
      }
      const newMesh = new this.THREE.Mesh(this.blockGeometry, this.materials.grass);
      newMesh.castShadow = true;
      newMesh.receiveShadow = true;
      newMesh.position.set(worldX, newLevel * BLOCK_SIZE + BLOCK_SIZE / 2, worldZ);
      newMesh.matrixAutoUpdate = false;
      newMesh.updateMatrix();
      newMesh.userData = { columnKey, level: newLevel, gx, gz };
      this.terrainGroup.add(newMesh);
      column.push(newMesh);
      this.columns.set(columnKey, column);
      this.heightMap[gx][gz] = column.length;
      this.blocksPlaced += 1;
      this.score = Math.max(0, this.score - 0.5);
      this.portalBlocksPlaced += 1;
      this.checkPortalActivation();
      this.updateHud();
    }

    castFromCamera() {
      const THREE = this.THREE;
      if (!this.camera) return [];
      const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
      this.raycaster.set(this.camera.position, direction.normalize());
      return this.raycaster.intersectObjects(this.terrainGroup.children, false);
    }

    updateHud() {
      const { heartsEl, scoreTotalEl, scoreRecipesEl, scoreDimensionsEl } = this.ui;
      if (heartsEl) {
        heartsEl.innerHTML = createHeartMarkup(this.health);
      }
      if (scoreTotalEl) {
        scoreTotalEl.textContent = Math.round(this.score).toString();
      }
      if (scoreRecipesEl) {
        scoreRecipesEl.textContent = `${this.portalActivations}`;
      }
      if (scoreDimensionsEl) {
        scoreDimensionsEl.textContent = `${this.currentDimensionIndex + 1}`;
      }
      this.updateDimensionInfoPanel();
      this.updatePortalProgress();
    }

    updatePortalProgress() {
      const { portalProgressLabel, portalProgressBar } = this.ui;
      const progress = Math.min(1, this.portalBlocksPlaced / PORTAL_BLOCK_REQUIREMENT);
      if (portalProgressLabel) {
        if (this.victoryAchieved) {
          portalProgressLabel.textContent = 'Eternal Ingot secured';
        } else if (this.portalActivated) {
          portalProgressLabel.textContent = 'Portal stabilised';
        } else {
          portalProgressLabel.textContent = `Portal frame ${Math.round(progress * 100)}%`;
        }
      }
      if (portalProgressBar) {
        const displayProgress = this.victoryAchieved ? 1 : progress;
        portalProgressBar.style.setProperty('--progress', displayProgress.toFixed(2));
      }
    }

    updateDimensionInfoPanel() {
      const { dimensionInfoEl } = this.ui;
      if (!dimensionInfoEl) return;
      if (this.victoryAchieved) {
        dimensionInfoEl.innerHTML = `
          <h3>Netherite Terminus</h3>
          <p>You stabilised every dimension and recovered the Eternal Ingot. Reload to chase a faster run!</p>
        `;
        return;
      }
      const theme = this.dimensionSettings ?? DIMENSION_THEME[0];
      dimensionInfoEl.dataset.simpleInit = 'true';
      const gravity = (theme.gravity ?? 1).toFixed(2);
      const speed = (theme.speedMultiplier ?? 1).toFixed(2);
      dimensionInfoEl.innerHTML = `
        <h3>${theme.name}</h3>
        <p>${theme.description ?? ''}</p>
        <p class="dimension-meta">Gravity ×${gravity} · Speed ×${speed} · Dimension ${
          this.currentDimensionIndex + 1
        }/${DIMENSION_THEME.length}</p>
      `;
    }
  }

  function createSimpleExperience(options) {
    return new SimpleExperience(options);
  }

  window.SimpleExperience = {
    create: createSimpleExperience,
  };
})();
