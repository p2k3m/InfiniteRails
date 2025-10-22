(function () {
  const globalScope =
    (typeof globalThis !== 'undefined' && globalThis) ||
    (typeof window !== 'undefined' && window) ||
    (typeof self !== 'undefined' && self) ||
    this ||
    {};

  const defaultHintClass = 'visible';

  function capitalise(value) {
    if (typeof value !== 'string' || value.length === 0) {
      return '';
    }
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function resolveThree(scope, override) {
    if (override && typeof override === 'object') {
      return override;
    }
    if (scope && typeof scope.THREE === 'object') {
      return scope.THREE;
    }
    try {
      // eslint-disable-next-line global-require
      return require('three');
    } catch (error) {
      return null;
    }
  }

  class SimpleExperienceInstance {
    constructor(options = {}) {
      this.options = options;
      this.scope = options.scope || globalScope;
      this.THREE = resolveThree(this.scope, options.THREE);

      if (!this.scope.THREE) {
        this.scope.THREE = this.THREE;
      }

      this.assetRetryLimit = 3;
      this.assetRetryBackoffMs = 1500;
      this.assetRetryBackoffMaxMs = 4500;

      this.loadedModels = new Map();
      this.assetFailureCounts = new Map();
      this.majorIssueLog = [];
      this.assetIssueHistory = [];

      this.playerHintEl = options.playerHintEl ?? null;
      this.footerStatusEl = options.footerStatusEl ?? null;
      this.footerEl = options.footerEl ?? null;
      this.hintVisibilityClass = options.hintVisibilityClass || defaultHintClass;
      this.lastHintMessage = '';
    }

    get placeholderColorMap() {
      return {
        steve: 0x2f6bff,
        zombie: 0x1c9c3d,
        golem: 0xb28b4c,
      };
    }

    get overlayColorMap() {
      return {
        steve: 0xffffff,
        zombie: 0x8b0000,
        golem: 0x4b3f2f,
      };
    }

    recordModelFallback(key, reason, detail = {}) {
      const normalisedKey = typeof key === 'string' && key.trim().length ? key.trim() : 'asset';
      const count = (this.assetFailureCounts.get(normalisedKey) || 0) + 1;
      this.assetFailureCounts.set(normalisedKey, count);

      const label =
        normalisedKey === 'steve'
          ? 'Explorer avatar'
          : `${capitalise(normalisedKey)} model`;

      let message = `${label} unavailable. Showing placeholder visuals.`;
      if (reason === 'loader-unavailable') {
        message = `${label} unavailable — model loader offline. Showing placeholder visuals.`;
      } else if (reason === 'failed') {
        message = `${label} failed to load. Showing placeholder visuals.`;
      }

      this.lastHintMessage = message;

      if (this.playerHintEl) {
        try {
          this.playerHintEl.textContent = message;
          if (this.playerHintEl.classList?.add) {
            this.playerHintEl.classList.add(this.hintVisibilityClass);
          }
          if (typeof this.playerHintEl.setAttribute === 'function') {
            this.playerHintEl.setAttribute('data-placeholder', 'true');
          }
        } catch (error) {
          // Ignore DOM update failures in non-browser environments.
        }
      }

      if (this.footerStatusEl) {
        try {
          this.footerStatusEl.textContent = message;
        } catch (error) {
          // Ignore DOM update failures in non-browser environments.
        }
      }

      if (this.footerEl?.dataset) {
        try {
          this.footerEl.dataset.state = detail.severity || 'warning';
        } catch (error) {
          // Ignore dataset assignment issues.
        }
      }

      this.majorIssueLog.push({
        key: normalisedKey,
        reason,
        message,
        timestamp: Date.now(),
        detail,
      });
      this.assetIssueHistory.push({ key: normalisedKey, reason, detail });
    }

    createQuestionMarkSprite(key) {
      if (!this.THREE || typeof this.THREE.Sprite !== 'function') {
        return null;
      }

      const overlayColor = this.overlayColorMap[key] || 0xffffff;
      const background = 0x000000;
      const canvasFactory = () => {
        if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
          return document.createElement('canvas');
        }
        return null;
      };

      const canvas = canvasFactory();
      if (!canvas) {
        return null;
      }

      const size = 128;
      canvas.width = size;
      canvas.height = size;
      const ctx = typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
      if (!ctx) {
        return null;
      }

      try {
        ctx.fillStyle = `#${background.toString(16).padStart(6, '0')}`;
        if (typeof ctx.fillRect === 'function') {
          ctx.fillRect(0, 0, size, size);
        }
        ctx.fillStyle = `#${overlayColor.toString(16).padStart(6, '0')}`;
        if (typeof ctx.font === 'string') {
          ctx.font = `${Math.floor(size * 0.7)}px sans-serif`;
        }
        if (typeof ctx.textAlign === 'string') {
          ctx.textAlign = 'center';
        }
        if (typeof ctx.textBaseline === 'string') {
          ctx.textBaseline = 'middle';
        }
        if (typeof ctx.fillText === 'function') {
          ctx.fillText('?', size / 2, size / 2);
        }
      } catch (error) {
        // Ignore drawing failures – the sprite will remain blank but still serve as overlay indicator.
      }

      let texture = null;
      if (typeof this.THREE.CanvasTexture === 'function') {
        texture = new this.THREE.CanvasTexture(canvas);
      }
      const materialOptions = texture ? { map: texture, transparent: true } : { color: overlayColor, transparent: true };
      const material = new this.THREE.SpriteMaterial(materialOptions);
      const sprite = new this.THREE.Sprite(material);
      sprite.name = 'PlaceholderQuestionMark';
      sprite.scale.set(0.9, 0.9, 0.9);
      sprite.position.set(0, 0, 0);
      return sprite;
    }

    createModelFallbackMesh(key, { reason = 'unknown' } = {}) {
      if (!this.THREE) {
        throw new Error('Three.js unavailable – cannot create placeholder mesh.');
      }

      const group = new this.THREE.Group();
      group.name = `Fallback:${capitalise(key)}`;
      group.userData = {
        ...(typeof group.userData === 'object' && group.userData ? group.userData : {}),
        placeholder: true,
        placeholderKey: key,
        placeholderReason: reason,
        placeholderSource: 'model-fallback',
      };

      const color = this.placeholderColorMap[key] || 0x666666;
      const geometry = new this.THREE.BoxGeometry(1, 2, 1);
      const material = new this.THREE.MeshBasicMaterial({ color });
      const cube = new this.THREE.Mesh(geometry, material);
      cube.name = 'PlaceholderBody';
      cube.position.set(0, 1, 0);
      group.add(cube);

      const overlayName = `${capitalise(key)}ErrorOverlay`;
      const overlayGroup = new this.THREE.Group();
      overlayGroup.name = overlayName;
      overlayGroup.position.set(0, 1.6, 0);
      overlayGroup.userData = {
        placeholder: true,
        placeholderOverlay: true,
        placeholderKey: key,
        placeholderReason: reason,
      };

      const sprite = this.createQuestionMarkSprite(key);
      if (sprite) {
        sprite.scale.set(0.8, 0.8, 0.8);
        overlayGroup.add(sprite);
      } else if (typeof this.THREE.PlaneGeometry === 'function') {
        const overlayGeometry = new this.THREE.PlaneGeometry(0.9, 0.9);
        const overlayMaterial = new this.THREE.MeshBasicMaterial({
          color: this.overlayColorMap[key] || 0xffffff,
          transparent: true,
          opacity: 0.65,
          side: this.THREE.DoubleSide ?? 2,
        });
        const overlay = new this.THREE.Mesh(overlayGeometry, overlayMaterial);
        overlay.name = 'PlaceholderOverlayPlane';
        overlay.position.set(0, 0, 0.01);
        overlayGroup.add(overlay);
      }

      if (overlayGroup.children.length > 0) {
        group.add(overlayGroup);
      }

      return group;
    }

    buildFallbackPayload(key, reason, detail = {}) {
      const scene = this.createModelFallbackMesh(key, { reason });
      const payload = {
        scene,
        animations: [],
        metadata: {
          placeholder: true,
          placeholderReason: reason,
        },
      };
      this.loadedModels.set(key, payload);
      if (key === 'steve') {
        this.playerAvatar = scene;
      }
      this.recordModelFallback(key, reason, detail);
      return payload;
    }

    extractAvatarRigMetadata(gltfJson) {
      if (!gltfJson || typeof gltfJson !== 'object') {
        return null;
      }
      const nodes = Array.isArray(gltfJson.nodes) ? gltfJson.nodes : [];
      const meshes = Array.isArray(gltfJson.meshes) ? gltfJson.meshes : [];
      if (nodes.length === 0) {
        return null;
      }

      const metadata = {
        valid: true,
        errors: [],
        hierarchy: {},
        meshAssignments: {},
        meshExpectations: {},
        meshNameByIndex: {},
        missingNodes: [],
        hierarchyIssues: [],
        meshMismatches: [],
      };

      nodes.forEach((node, index) => {
        const nodeName = typeof node?.name === 'string' && node.name.length ? node.name : `Node${index}`;
        if (Array.isArray(node?.children) && node.children.length > 0) {
          metadata.hierarchy[nodeName] = node.children
            .map((childIndex) => nodes[childIndex]?.name)
            .filter((name) => typeof name === 'string' && name.length > 0);
        } else if (!metadata.hierarchy[nodeName]) {
          metadata.hierarchy[nodeName] = [];
        }

        if (Number.isInteger(node?.mesh)) {
          const meshIndex = node.mesh;
          const meshName = meshes[meshIndex]?.name ?? `Mesh${meshIndex}`;
          metadata.meshAssignments[nodeName] = meshName;
          metadata.meshNameByIndex[meshIndex] = meshName;
        }
      });

      return metadata;
    }

    normaliseModelPayload(key, gltf) {
      const scene = gltf?.scene instanceof this.THREE.Object3D ? gltf.scene : new this.THREE.Group();
      scene.userData = scene.userData || {};
      scene.userData.placeholder = false;
      scene.userData.placeholderSource = null;
      scene.userData.placeholderReason = null;

      const animations = Array.isArray(gltf?.animations) ? gltf.animations.slice() : [];
      const metadata = {};

      if (gltf?.parser?.json) {
        const rigMetadata = this.extractAvatarRigMetadata(gltf.parser.json);
        if (rigMetadata) {
          metadata.avatarRig = rigMetadata;
          scene.userData.avatarRigMetadata = rigMetadata;
        }
      }

      this.assetFailureCounts.set(key, 0);
      const payload = { scene, animations, metadata };
      this.loadedModels.set(key, payload);
      return payload;
    }

    async loadModel(key, options = {}) {
      const loaderUnavailable = !this.THREE || typeof this.THREE.GLTFLoader !== 'function';
      if (loaderUnavailable) {
        return this.buildFallbackPayload(key, 'loader-unavailable', { reason: 'loader-missing' });
      }

      let loader;
      try {
        loader = new this.THREE.GLTFLoader();
      } catch (error) {
        return this.buildFallbackPayload(key, 'loader-unavailable', { error, reason: 'loader-construction' });
      }

      return new Promise((resolve) => {
        const onFailure = (error) => {
          const detail = { error, reason: 'load-error' };
          resolve(this.buildFallbackPayload(key, 'failed', detail));
        };

        const url = options.url || key;
        try {
          loader.load(
            url,
            (gltf) => {
              try {
                const payload = this.normaliseModelPayload(key, gltf || {});
                resolve(payload);
              } catch (error) {
                const detail = { error, reason: 'normalisation-error' };
                resolve(this.buildFallbackPayload(key, 'failed', detail));
              }
            },
            null,
            (error) => {
              onFailure(error instanceof Error ? error : new Error('Model load failed.'));
            },
          );
        } catch (error) {
          resolve(this.buildFallbackPayload(key, 'loader-unavailable', { error, reason: 'load-invocation' }));
        }
      });
    }

    async cloneModelScene(key) {
      const payload = this.loadedModels.get(key);
      if (!payload) {
        return null;
      }
      const sceneClone = payload.scene?.clone ? payload.scene.clone(true) : payload.scene;
      if (sceneClone && typeof sceneClone.userData === 'object') {
        sceneClone.userData = { ...payload.scene.userData };
      }
      return {
        scene: sceneClone,
        animations: Array.isArray(payload.animations) ? payload.animations.slice() : [],
        metadata: payload.metadata,
      };
    }

    ensurePlayerAvatarPlaceholder(reason = 'unknown') {
      const placeholder = this.createModelFallbackMesh('steve', { reason });
      this.playerAvatar = placeholder;
      return placeholder;
    }

    static create(options = {}) {
      return new SimpleExperienceInstance(options);
    }
  }

  const SimpleExperience = {
    // class SimpleExperience facade for compatibility with legacy bundles.
    create(options = {}) {
      return new SimpleExperienceInstance(options);
    },
  };

  globalScope.SimpleExperience = SimpleExperience;
  if (typeof window !== 'undefined') {
    window.SimpleExperience = SimpleExperience;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = SimpleExperience;
  }

  // Scene population check fired – placeholder instrumentation for asset watchdogs.
})();
