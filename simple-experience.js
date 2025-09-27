(function () {
  const WORLD_SIZE = 48;
  const BLOCK_SIZE = 1;
  const PLAYER_EYE_HEIGHT = 1.7;
  const PLAYER_SPEED = 4.5;
  const PLAYER_INERTIA = 0.88;
  const DAY_LENGTH_SECONDS = 600;
  const POINTER_SENSITIVITY = 0.0022;
  const FALLBACK_HEALTH = 10;

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
      this.columns = new Map();
      this.heightMap = Array.from({ length: WORLD_SIZE }, () => Array(WORLD_SIZE).fill(0));
      this.blockGeometry = new THREE.BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
      this.materials = {
        grass: new THREE.MeshStandardMaterial({ color: new THREE.Color('#69c368'), roughness: 0.7, metalness: 0.05 }),
        dirt: new THREE.MeshStandardMaterial({ color: new THREE.Color('#b07a42'), roughness: 0.95, metalness: 0.02 }),
        stone: new THREE.MeshStandardMaterial({ color: new THREE.Color('#9d9d9d'), roughness: 0.8, metalness: 0.18 }),
      };
      this.keys = new Set();
      this.velocity = new THREE.Vector3();
      this.tmpForward = new THREE.Vector3();
      this.tmpRight = new THREE.Vector3();
      this.pointerLocked = false;
      this.yaw = 0;
      this.pitch = 0;
      this.elapsed = 0;
      this.health = FALLBACK_HEALTH;
      this.score = 0;
      this.blocksMined = 0;
      this.blocksPlaced = 0;
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
      this.buildTerrain();
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
      this.scene.add(this.terrainGroup);
    }

    buildTerrain() {
      const THREE = this.THREE;
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
      if (event.code === 'KeyR') {
        this.resetPosition();
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

      if (this.keys.has('KeyW')) {
        this.velocity.addScaledVector(forward, PLAYER_SPEED * delta);
      }
      if (this.keys.has('KeyS')) {
        this.velocity.addScaledVector(forward, -PLAYER_SPEED * delta);
      }
      if (this.keys.has('KeyA')) {
        this.velocity.addScaledVector(right, -PLAYER_SPEED * delta);
      }
      if (this.keys.has('KeyD')) {
        this.velocity.addScaledVector(right, PLAYER_SPEED * delta);
      }

      this.velocity.multiplyScalar(PLAYER_INERTIA);

      const cameraQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
      this.camera.quaternion.copy(cameraQuaternion);

      this.camera.position.add(this.velocity);

      const groundHeight = this.sampleGroundHeight(this.camera.position.x, this.camera.position.z);
      this.camera.position.y = groundHeight + PLAYER_EYE_HEIGHT;

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
      this.sunLight.position.set(Math.cos(angle) * 60, Math.sin(angle) * 45, Math.sin(angle * 0.7) * 40);
      this.sunLight.intensity = 0.6 + intensity * 0.8;
      this.hemiLight.intensity = 0.6 + intensity * 0.4;
      if (this.scene?.fog) {
        this.scene.fog.color.setHSL(0.55, 0.5, 0.7 - intensity * 0.2);
      }
      if (this.ui?.timeEl) {
        const daylight = Math.round(intensity * 100);
        this.ui.timeEl.textContent = `Daylight ${daylight}%`;
      }
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
      const { heartsEl, scoreTotalEl, scoreRecipesEl, scoreDimensionsEl, dimensionInfoEl, portalProgressLabel, portalProgressBar }
 = this.ui;
      if (heartsEl) {
        heartsEl.innerHTML = createHeartMarkup(this.health);
      }
      if (scoreTotalEl) {
        scoreTotalEl.textContent = Math.round(this.score).toString();
      }
      if (scoreRecipesEl) {
        scoreRecipesEl.textContent = `${this.blocksMined}`;
      }
      if (scoreDimensionsEl) {
        scoreDimensionsEl.textContent = `${this.blocksPlaced}`;
      }
      if (dimensionInfoEl && !dimensionInfoEl.dataset.simpleInit) {
        dimensionInfoEl.dataset.simpleInit = 'true';
        dimensionInfoEl.innerHTML = `
          <h3>Origin Grassland</h3>
          <p>Explore the sandbox prototype. WASD to move, mouse to look, left-click to mine, right-click to place.</p>
        `;
      }
      if (portalProgressLabel && portalProgressBar) {
        portalProgressLabel.textContent = 'Prototype Progress';
        portalProgressBar.style.setProperty('--progress', '0.12');
      }
    }
  }

  function createSimpleExperience(options) {
    return new SimpleExperience(options);
  }

  window.SimpleExperience = {
    create: createSimpleExperience,
  };
})();
