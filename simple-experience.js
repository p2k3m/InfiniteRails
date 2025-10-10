      this.portalFrameGhostMeshes = new Map();
      this.portalFramePreview = null;
      this.portalPreviewGroup = null;
      this.portalFrameColumnSlots = null;
      this.portalFrameInteriorSlots = null;
      this.portalFrameOrientation = 'horizontal';
      this.portalFrameBounds = null;
      this.terrainGroup.name = 'TerrainGroup';
      this.railsGroup.name = 'RailsGroup';
      this.portalGroup.name = 'PortalGroup';
      this.portalPreviewGroup = new THREE.Group();
      this.portalPreviewGroup.name = 'PortalFramePreview';
      this.portalGroup.add(this.portalPreviewGroup);
      this.zombieGroup.name = 'ZombieGroup';
      this.golemGroup.name = 'GolemGroup';
      this.chestGroup.name = 'ChestGroup';
      this.challengeGroup.name = 'ChallengeGroup';
        portalGhost: new THREE.MeshStandardMaterial({
          color: new THREE.Color('#7fc8ff'),
          emissive: new THREE.Color('#a8daff'),
          emissiveIntensity: 0.18,
          transparent: true,
          opacity: 0.32,
          roughness: 0.4,
          metalness: 0.05,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
        portalGhostBlocked: new THREE.MeshStandardMaterial({
          color: new THREE.Color('#ff6b6b'),
          emissive: new THREE.Color('#ff9999'),
          emissiveIntensity: 0.24,
          transparent: true,
          opacity: 0.36,
          roughness: 0.45,
          metalness: 0.05,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      const anchorGrid = this.portalAnchorGrid || this.computePortalAnchorGrid();
      if (!anchorGrid) {
        return null;
      }
      const baseHeight = this.initialHeightMap?.[anchorGrid.x]?.[anchorGrid.z];
      const anchorHeight = Number.isFinite(baseHeight) ? baseHeight : 0;
      const facing = { x: 1, y: 0 };
      const fallbackWidth = this.portalMechanics?.FRAME_HEIGHT ?? 3;
      const fallbackHeight = this.portalMechanics?.FRAME_WIDTH ?? 4;
      const frameSlots = new Map();
      const interiorSlots = new Map();
      const columnSlots = new Map();
      const addColumnSlot = (slot) => {
        const columnKey = `${slot.gridX}|${slot.gridZ}`;
        if (!columnSlots.has(columnKey)) {
          columnSlots.set(columnKey, { key: columnKey, gridX: slot.gridX, gridZ: slot.gridZ, slots: [] });
        }
        columnSlots.get(columnKey).slots.push(slot);
      };
      const clampIndex = (value) => Math.max(0, Math.min(WORLD_SIZE - 1, value));
      const anchorX = clampIndex(anchorGrid.x);
      const anchorZ = clampIndex(anchorGrid.z);
      for (let xOffset = -1; xOffset <= 1; xOffset += 1) {
        const gridX = clampIndex(anchorX + xOffset);
        const gridZ = anchorZ;
        const baseSlotHeight = Number.isFinite(this.initialHeightMap?.[gridX]?.[gridZ])
          ? this.initialHeightMap[gridX][gridZ]
          : anchorHeight;
        for (let relY = 0; relY < fallbackHeight; relY += 1) {
          const columnKey = `${gridX}|${gridZ}`;
          const slot = {
            id: `${columnKey}|${relY}`,
            columnKey,
            gridX,
            gridZ,
            relX: xOffset,
            relZ: 0,
            relY,
            baseHeight: Number.isFinite(baseSlotHeight) ? baseSlotHeight : 0,
            level: (Number.isFinite(baseSlotHeight) ? baseSlotHeight : 0) + relY,
            worldPosition: {
              x: gridX * BLOCK_SIZE,
              y: ((Number.isFinite(baseSlotHeight) ? baseSlotHeight : 0) + relY) * BLOCK_SIZE,
              z: gridZ * BLOCK_SIZE,
            },
            role:
              Math.abs(xOffset) === 1 || relY === 0 || relY === fallbackHeight - 1 ? 'frame' : 'interior',
            orientation: 'vertical',
            bounds: { width: fallbackWidth, height: fallbackHeight },
          };
          addColumnSlot(slot);
          if (slot.role === 'frame') {
            frameSlots.set(slot.id, slot);
          } else {
            interiorSlots.set(slot.id, slot);
          }
      return {
        anchor: { x: anchorGrid.x, z: anchorGrid.z, y: anchorHeight },
        facing,
        orientation: 'vertical',
        bounds: { width: fallbackWidth, height: fallbackHeight },
        start: { x: anchorX - 1, z: anchorZ },
        frameSlots,
        interiorSlots,
        columnSlots,
        blockSize: BLOCK_SIZE,
      };
      const columnKey = `${gridX}|${gridZ}`;
      const columnSlots = this.portalFrameColumnSlots?.get?.(columnKey)?.slots ?? null;
      if (Array.isArray(columnSlots)) {
        for (let i = 0; i < columnSlots.length; i += 1) {
          const slot = columnSlots[i];
          if (!slot || slot.role !== 'frame') {
            continue;
          }
          const slotBase = Number.isFinite(slot.baseHeight)
            ? slot.baseHeight
            : baseHeight ?? this.initialHeightMap?.[gridX]?.[gridZ] ?? 0;
          if (slotBase + slot.relY === level) {
            const key = this.getPortalSlotKey(slot.gridX, slot.gridZ, slot.relY);
            return this.portalFrameSlots.get(key) || slot;
          }
        }
      }
          : baseHeight ?? this.initialHeightMap?.[slot.gridX]?.[slot.gridZ] ?? 0;
      if (!(this.portalFrameSlots instanceof Map)) {
        this.portalFrameSlots = new Map();
      } else {
        this.portalFrameSlots.clear();
      }
      this.clearPortalGhostMeshes();
      const layout = this.createPortalFrameLayout();
      this.portalFrameLayout = layout;
      this.portalFrameColumnSlots = layout?.columnSlots instanceof Map ? layout.columnSlots : null;
      this.portalFrameInteriorSlots = layout?.interiorSlots instanceof Map ? layout.interiorSlots : null;
      this.portalFrameOrientation = layout?.orientation || 'horizontal';
      this.portalFrameBounds = layout?.bounds || null;
      const frameSlotsMap = this.portalFrameSlots;
      if (layout?.frameSlots instanceof Map) {
        layout.frameSlots.forEach((slot, key) => {
          const slotKey = slot?.id || key || this.getPortalSlotKey(slot.gridX, slot.gridZ, slot.relY);
          const baseHeight = Number.isFinite(slot.baseHeight)
            ? slot.baseHeight
            : this.initialHeightMap?.[slot.gridX]?.[slot.gridZ] ?? 0;
          frameSlotsMap.set(slotKey, {
            ...slot,
            id: slotKey,
            layoutKey: slotKey,
            baseHeight,
            filled: false,
            present: false,
            blocked: false,
            ghost: true,
            reason: '',
            blockType: null,
          });
      }
      this.portalFrameRequiredCount = frameSlotsMap.size || PORTAL_BLOCK_REQUIREMENT;
      this.recalculatePortalFrameProgress();
      const layout = this.portalFrameLayout || this.createPortalFrameLayout();
      const interiorSlots =
        this.portalFrameInteriorSlots && this.portalFrameInteriorSlots instanceof Map
          ? this.portalFrameInteriorSlots
          : layout?.interiorSlots;
      if (!interiorSlots || !(interiorSlots instanceof Map) || interiorSlots.size === 0) {
      let valid = true;
      interiorSlots.forEach((slot) => {
        if (!valid) {
          return;
        const mesh = this.getPortalSlotMesh(slot);
        if (!mesh) {
          return;
        }
        if (mesh.userData?.hiddenForPortal) {
          return;
        }
        const blockType = mesh.userData?.blockType ?? null;
        if (blockType === 'stone') {
          return;
        }
        valid = false;
      });
      return valid;
      const layout = this.portalFrameLayout || this.createPortalFrameLayout();
      const interiorSlots =
        this.portalFrameInteriorSlots && this.portalFrameInteriorSlots instanceof Map
          ? this.portalFrameInteriorSlots
          : layout?.interiorSlots;
      if (!interiorSlots || !(interiorSlots instanceof Map)) {
        return;
      }
      interiorSlots.forEach((slot) => {
        const mesh = this.getPortalSlotMesh(slot);
          if (!mesh.userData) {
            mesh.userData = {};
          mesh.userData.hiddenForPortal = true;
      });
      const layout = this.portalFrameLayout || this.createPortalFrameLayout();
      if (!layout) {
      if (layout.frameSlots instanceof Map) {
        layout.frameSlots.forEach((slot) => {
          if (!slot) return;
          const baseHeight = Number.isFinite(slot.baseHeight)
            ? slot.baseHeight
            : this.initialHeightMap?.[slot.gridX]?.[slot.gridZ] ?? 0;
          frame.push({ x: slot.gridX, y: baseHeight + slot.relY, z: slot.gridZ });
        });
      }
      const interiorSlots =
        this.portalFrameInteriorSlots && this.portalFrameInteriorSlots instanceof Map
          ? this.portalFrameInteriorSlots
          : layout.interiorSlots;
      if (interiorSlots instanceof Map) {
        interiorSlots.forEach((slot) => {
          if (!slot) return;
          const baseHeight = Number.isFinite(slot.baseHeight)
            ? slot.baseHeight
            : this.initialHeightMap?.[slot.gridX]?.[slot.gridZ] ?? 0;
          interior.push({ x: slot.gridX, y: baseHeight + slot.relY, z: slot.gridZ });
        });
        orientation: layout.orientation || 'horizontal',
        bounds: layout.bounds || { width: 4, height: 3 },
      const layout = this.portalFrameLayout || this.createPortalFrameLayout();
      if (!layout) {
      const anchorGrid = layout.anchor || this.portalAnchorGrid || this.computePortalAnchorGrid();
      if (!anchorGrid) {
        return null;
      }
      const interiorSlots =
        this.portalFrameInteriorSlots && this.portalFrameInteriorSlots instanceof Map
          ? this.portalFrameInteriorSlots
          : layout.interiorSlots;
      let minGridX = Infinity;
      let maxGridX = -Infinity;
      let minGridZ = Infinity;
      let maxGridZ = -Infinity;
      let minLevel = Infinity;
      let maxLevel = -Infinity;
      const fallbackBase = Number.isFinite(anchorGrid.y)
        ? anchorGrid.y
        : this.initialHeightMap?.[anchorGrid.x]?.[anchorGrid.z] ?? 0;
      if (interiorSlots instanceof Map && interiorSlots.size > 0) {
        interiorSlots.forEach((slot) => {
          if (!slot) return;
          const baseHeight = Number.isFinite(slot.baseHeight)
            ? slot.baseHeight
            : this.initialHeightMap?.[slot.gridX]?.[slot.gridZ] ?? fallbackBase;
          const level = baseHeight + slot.relY;
          minGridX = Math.min(minGridX, slot.gridX);
          maxGridX = Math.max(maxGridX, slot.gridX);
          minGridZ = Math.min(minGridZ, slot.gridZ);
          maxGridZ = Math.max(maxGridZ, slot.gridZ);
          minLevel = Math.min(minLevel, level);
          maxLevel = Math.max(maxLevel, level);
        });
      }
      if (!Number.isFinite(minGridX)) {
        minGridX = maxGridX = Math.max(0, Math.min(WORLD_SIZE - 1, anchorGrid.x));
      }
      if (!Number.isFinite(minGridZ)) {
        minGridZ = maxGridZ = Math.max(0, Math.min(WORLD_SIZE - 1, anchorGrid.z));
      }
      if (!Number.isFinite(minLevel)) {
        minLevel = fallbackBase + 1;
      }
      if (!Number.isFinite(maxLevel)) {
        const height = layout?.bounds?.height ?? 3;
        maxLevel = fallbackBase + height - 1;
      }
      const worldCenterX = ((minGridX + maxGridX) / 2 - WORLD_SIZE / 2) * BLOCK_SIZE;
      const worldCenterZ = ((minGridZ + maxGridZ) / 2 - WORLD_SIZE / 2) * BLOCK_SIZE;
      const centerY = ((minLevel + maxLevel) / 2 + 0.5) * BLOCK_SIZE;
      const halfWidth = ((maxGridX - minGridX + 1) * BLOCK_SIZE) / 2 + padding;
      const halfDepth = ((maxGridZ - minGridZ + 1) * BLOCK_SIZE) / 2 + padding;
      const minY = minLevel * BLOCK_SIZE - padding;
      const maxY = (maxLevel + 1) * BLOCK_SIZE + padding;
        centerX: worldCenterX,
        centerZ: worldCenterZ,
    ensurePortalPreviewGroup() {
      const THREE = this.THREE;
      if (!THREE || !this.portalGroup) {
        return null;
      if (!this.portalPreviewGroup) {
        this.portalPreviewGroup = new THREE.Group();
        this.portalPreviewGroup.name = 'PortalFramePreview';
        this.portalGroup.add(this.portalPreviewGroup);
      }
      return this.portalPreviewGroup;
    }

    clearPortalGhostMeshes() {
      if (this.portalPreviewGroup?.clear) {
        this.portalPreviewGroup.clear();
      } else if (this.portalPreviewGroup) {
        while (this.portalPreviewGroup.children.length) {
          this.portalPreviewGroup.remove(this.portalPreviewGroup.children[0]);
        }
      }
      if (this.portalFrameGhostMeshes instanceof Map) {
        this.portalFrameGhostMeshes.clear();
      } else {
        this.portalFrameGhostMeshes = new Map();
      }
    }

    updatePortalGhostMeshes(preview) {
      if (!preview || !(preview.frameSlots instanceof Map)) {
        this.clearPortalGhostMeshes();
        return;
      }
      const THREE = this.THREE;
      if (!THREE || !this.blockGeometry || !this.materials) {
        return;
      }
      const group = this.ensurePortalPreviewGroup();
      if (!group) {
        return;
      }
      if (!(this.portalFrameGhostMeshes instanceof Map)) {
        this.portalFrameGhostMeshes = new Map();
      }
      const activeKeys = new Set();
      preview.frameSlots.forEach((slotPreview, key) => {
        if (!slotPreview || slotPreview.role !== 'frame') {
          return;
        }
        const slotKey = slotPreview.id || key || this.getPortalSlotKey(slotPreview.gridX, slotPreview.gridZ, slotPreview.relY);
        const shouldGhost = slotPreview.ghost === true;
        const isBlocked = slotPreview.blocked === true;
        if (!shouldGhost) {
          const existing = this.portalFrameGhostMeshes.get(slotKey);
          if (existing) {
            existing.visible = false;
          }
          return;
        }
        activeKeys.add(slotKey);
        let mesh = this.portalFrameGhostMeshes.get(slotKey);
        const material = isBlocked && this.materials.portalGhostBlocked
          ? this.materials.portalGhostBlocked
          : this.materials.portalGhost || this.materials.portalInvalid;
        if (!mesh) {
          mesh = new THREE.Mesh(this.blockGeometry, material);
          mesh.matrixAutoUpdate = false;
          mesh.castShadow = false;
          mesh.receiveShadow = false;
          mesh.renderOrder = 1.5;
          mesh.userData = { portalGhost: true, slotKey };
          group.add(mesh);
          this.portalFrameGhostMeshes.set(slotKey, mesh);
        }
        mesh.material = material;
        const baseHeight = Number.isFinite(slotPreview.baseHeight)
          ? slotPreview.baseHeight
          : this.initialHeightMap?.[slotPreview.gridX]?.[slotPreview.gridZ] ?? 0;
        const level = baseHeight + slotPreview.relY;
        const worldX = (slotPreview.gridX - WORLD_SIZE / 2) * BLOCK_SIZE;
        const worldZ = (slotPreview.gridZ - WORLD_SIZE / 2) * BLOCK_SIZE;
        const worldY = (level + 0.5) * BLOCK_SIZE;
        mesh.position.set(worldX, worldY, worldZ);
        mesh.scale.set(0.98, 0.98, 0.98);
        mesh.visible = true;
        mesh.userData.reason = slotPreview.reason || '';
        mesh.userData.blocked = isBlocked;
        mesh.userData.blockType = slotPreview.blockType || null;
        mesh.updateMatrix();
      });
      this.portalFrameGhostMeshes.forEach((mesh, key) => {
        if (!activeKeys.has(key) && mesh) {
          mesh.visible = false;
        }
      });
    }

    applyPortalFramePreviewToSlots(preview) {
      if (!(this.portalFrameSlots instanceof Map)) {
        return;
      }
      if (!preview || !(preview.frameSlots instanceof Map)) {
        this.portalFrameSlots.forEach((slot, key) => {
          slot.present = false;
          slot.blocked = false;
          slot.ghost = true;
          slot.blockType = null;
          slot.reason = '';
          slot.filled = false;
          this.portalFrameSlots.set(key, slot);
        });
        return;
      }
      this.portalFrameSlots.forEach((slot, key) => {
        const lookupKey = slot.layoutKey || slot.id || key;
        const previewSlot = preview.frameSlots.get(lookupKey) || preview.frameSlots.get(key);
        if (previewSlot) {
          slot.present = previewSlot.present === true;
          slot.blocked = previewSlot.blocked === true;
          slot.ghost = previewSlot.ghost === true;
          slot.blockType = previewSlot.blockType ?? null;
          slot.reason = previewSlot.reason || '';
          slot.level = previewSlot.level;
          slot.baseHeight = Number.isFinite(previewSlot.baseHeight)
            ? previewSlot.baseHeight
            : slot.baseHeight;
          slot.filled = slot.present && !slot.blocked;
          this.portalFrameSlots.set(key, slot);
        } else {
          slot.present = false;
          slot.blocked = false;
          slot.ghost = true;
          slot.blockType = null;
          slot.reason = '';
          slot.filled = false;
          this.portalFrameSlots.set(key, slot);
        }
      });
    }

    buildPortalPlacementPreviewOptions(layout) {
      return {
        blockSize: BLOCK_SIZE,
        baseHeightMap: this.initialHeightMap,
        heightMap: this.heightMap,
        columns: this.columns,
        requiredBlockType: 'stone',
        getBlockState: (slot) => {
          const mesh = this.getPortalSlotMesh(slot);
          if (!mesh) {
            return { present: false, blockType: null };
          }
          const blockType = mesh.userData?.blockType ?? null;
          if (!blockType) {
            return { present: false, blockType: null };
          }
          return {
            present: true,
            blockType,
            type: blockType,
          };
        },
      };
    }

    legacyValidatePortalFrameFootprint(filledCount = this.portalBlocksPlaced) {
      if (!(this.portalFrameSlots instanceof Map) || this.portalFrameSlots.size === 0) {
        return { valid: false, message: '', highlightSlots: [], summary: null, preview: null };
      }
      this.portalFramePreview = null;
      this.clearPortalGhostMeshes();
      let missingRequired = 0;
      let wrongMaterial = 0;
      let presentCount = 0;
      this.portalFrameSlots.forEach((slot, key) => {
          slot.present = false;
          slot.blockType = null;
          slot.blocked = false;
          slot.ghost = true;
          slot.reason = '';
          slot.filled = false;
          this.portalFrameSlots.set(key, slot);
        const positionY = mesh.position?.y;
        slot.present = Boolean(blockType);
        slot.blockType = blockType;
        slot.blocked = blockType !== 'stone';
        slot.ghost = false;
        slot.reason = '';
        slot.filled = blockType === 'stone';
        if (slot.filled) {
          presentCount += 1;
        }
          if (slot.relY === (this.portalFrameBounds?.height ?? 3) - 1) {
        this.portalFrameSlots.set(key, slot);
      } else if ((presentCount > 0 || unevenFoundation || unevenTop) && (unevenFoundation || unevenTop)) {
      const summary = {
        totalFrameSlots: this.portalFrameSlots.size,
        missingFrameSlots: missingRequired,
        blockedFrameSlots: highlightSet.size,
        presentFrameSlots: presentCount,
      };
      this.portalBlocksPlaced = presentCount;
        presentCount >= required &&
        summary,
        preview: null,
    validatePortalFrameFootprint(filledCount = this.portalBlocksPlaced) {
      if (!this.portalFrameSlots?.size) {
        return { valid: false, message: '', highlightSlots: [], summary: null, preview: null };
      }
      const layout = this.portalFrameLayout || this.createPortalFrameLayout();
      if (this.portalMechanics?.validatePortalFrameFootprint && layout?.frameSlots instanceof Map) {
        try {
          const options = this.buildPortalPlacementPreviewOptions(layout);
          const result = this.portalMechanics.validatePortalFrameFootprint(layout, options);
          const preview = result?.preview ?? null;
          this.portalFramePreview = preview;
          if (preview) {
            this.applyPortalFramePreviewToSlots(preview);
            this.updatePortalGhostMeshes(preview);
          } else {
            this.clearPortalGhostMeshes();
          }
          if (result?.summary?.presentFrameSlots !== undefined) {
            this.portalBlocksPlaced = result.summary.presentFrameSlots;
          }
          const highlightSlots = [];
          if (preview?.frameSlots instanceof Map) {
            preview.frameSlots.forEach((slot) => {
              if (slot.blocked && slot.present) {
                highlightSlots.push(slot);
              }
            });
          }
          return {
            valid: Boolean(result?.valid),
            message: result?.messages?.[0] ?? '',
            highlightSlots,
            summary: result?.summary ?? null,
            preview,
          };
        } catch (error) {
          if (typeof console !== 'undefined' && typeof console.warn === 'function') {
            console.warn('Portal mechanics validation failed — using legacy portal validator.', error);
          }
        }
      }
      return this.legacyValidatePortalFrameFootprint(filledCount);
    }

      this.portalFrameSlots.forEach((slot, key) => {
        const blockType = mesh?.userData?.blockType ?? null;
        const present = Boolean(blockType);
        const filled = present && blockType === 'stone';
        if (
          slot.blockType !== blockType ||
          slot.present !== present ||
          slot.filled !== filled ||
          slot.blocked !== (present && blockType !== 'stone')
        ) {
          slot.blockType = blockType;
          slot.present = present;
          slot.filled = filled;
          slot.blocked = present && blockType !== 'stone';
          slot.ghost = !present;
          slot.reason = '';
          this.portalFrameSlots.set(key, slot);
      const validation = this.validatePortalFrameFootprint(this.portalBlocksPlaced);
      if (validation?.summary) {
        const { presentFrameSlots, totalFrameSlots } = validation.summary;
        if (Number.isFinite(presentFrameSlots)) {
          this.portalBlocksPlaced = presentFrameSlots;
        }
        if (Number.isFinite(totalFrameSlots) && totalFrameSlots > 0) {
          this.portalFrameRequiredCount = totalFrameSlots;
        }
      } else {
        let filled = 0;
        this.portalFrameSlots.forEach((slot) => {
          if (slot.filled) {
            filled += 1;
          }
        });
        this.portalBlocksPlaced = filled;
      }
      this.portalFrameSlots.forEach((slot, key) => {
        slot.present = true;
        slot.blocked = false;
        slot.ghost = false;
        slot.blockType = 'stone';
        slot.reason = '';
        this.portalFrameSlots.set(key, slot);
      this.clearPortalGhostMeshes();
