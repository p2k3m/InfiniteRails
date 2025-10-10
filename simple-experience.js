      this.portalGhostMeshes = new Map();
      this.portalGhostGroup = null;
      this.portalPlacementPreview = null;
      this.portalGroup.name = 'PortalGroup';
      this.portalGhostGroup = new THREE.Group();
      this.portalGhostGroup.name = 'PortalGhostPreview';
      this.portalGhostGroup.visible = false;
      this.portalGroup.add(this.portalGhostGroup);
        portalGhost: new THREE.MeshStandardMaterial({
          color: new THREE.Color('#7f5af0'),
          emissive: new THREE.Color('#2cb67d'),
          emissiveIntensity: 0.18,
          transparent: true,
          opacity: 0.38,
          roughness: 0.7,
          metalness: 0.1,
          depthWrite: false,
        }),
      const anchor = this.portalAnchorGrid || this.computePortalAnchorGrid();
      const anchorX = Number.isInteger(anchor?.x) ? anchor.x : 0;
      const anchorZ = Number.isInteger(anchor?.z) ? anchor.z : 0;
      const baseHeight = this.initialHeightMap?.[anchorX]?.[anchorZ] ?? 0;
      if (this.portalMechanics?.createPortalFrameLayout) {
        try {
          const layout = this.portalMechanics.createPortalFrameLayout(
            { x: anchorX, z: anchorZ, y: baseHeight },
            {
              blockSize: BLOCK_SIZE,
              baseHeightMap: this.initialHeightMap,
              heightMap: this.heightMap,
              anchorHeightFallback: true,
            },
          );
          if (layout && layout.frameSlots instanceof Map) {
            return layout;
          }
        } catch (error) {
          if (typeof console !== 'undefined' && typeof console.warn === 'function') {
            console.warn('Portal mechanics frame layout failed — falling back to manual layout.', error);
          }
        }
      }
      const frameSlots = new Map();
      const interiorSlots = new Map();
          const gridX = Math.max(0, Math.min(WORLD_SIZE - 1, anchorX + x));
          const gridZ = Math.max(0, Math.min(WORLD_SIZE - 1, anchorZ));
          const columnKey = `${gridX}|${gridZ}`;
          const slotBase = this.initialHeightMap?.[gridX]?.[gridZ] ?? baseHeight;
          const slot = {
            id: `${columnKey}|${y}`,
            columnKey,
            gridX,
            gridZ,
            relY: y,
            baseHeight: slotBase,
            level: slotBase + y,
            role: required ? 'frame' : 'interior',
            orientation: 'horizontal',
            bounds: { width: 3, height: 4 },
          };
          if (required) {
            frameSlots.set(slot.id, slot);
          } else {
            interiorSlots.set(slot.id, slot);
          }
      return {
        anchor: { x: anchorX, z: anchorZ, y: baseHeight },
        bounds: { width: 3, height: 4 },
        frameSlots,
        interiorSlots,
        columnSlots: new Map(),
        blockSize: BLOCK_SIZE,
        orientation: 'horizontal',
        start: { x: anchorX - 1, z: anchorZ - 1 },
      };
      this.clearPortalGhostBlocks();
      const layout = this.createPortalFrameLayout();
      this.portalFrameLayout = layout;
      const frameSlots = layout?.frameSlots instanceof Map ? layout.frameSlots : null;
      const anchor = layout?.anchor || this.portalAnchorGrid || this.computePortalAnchorGrid();
      if (frameSlots && frameSlots.size) {
        frameSlots.forEach((slot, key) => {
          if (!slot || slot.role !== 'frame') {
            return;
          }
          const gridX = Number.isFinite(slot.gridX) ? slot.gridX : anchor?.x ?? 0;
          const gridZ = Number.isFinite(slot.gridZ) ? slot.gridZ : anchor?.z ?? 0;
          const baseHeight = Number.isFinite(slot.baseHeight)
            ? slot.baseHeight
            : initial?.[gridX]?.[gridZ] ?? 0;
          const relY = Number.isFinite(slot.relY)
            ? slot.relY
            : Number.isFinite(slot.level)
              ? slot.level - baseHeight
              : 0;
          const slotKey = slot.id || key || this.getPortalSlotKey(gridX, gridZ, relY);
          this.portalFrameSlots.set(slotKey, {
            id: slotKey,
            gridX,
            gridZ,
            relY,
            baseHeight,
            level: baseHeight + relY,
            filled: false,
            columnKey: slot.columnKey || `${gridX}|${gridZ}`,
            status: 'missing',
            blocked: false,
            blockType: null,
          });
          requiredCount += 1;
      } else if (Array.isArray(layout)) {
        layout.forEach(({ xOffset, y, required }) => {
          if (!required) return;
          const gridX = Math.max(0, Math.min(WORLD_SIZE - 1, (anchor?.x ?? 0) + xOffset));
          const gridZ = Math.max(0, Math.min(WORLD_SIZE - 1, anchor?.z ?? 0));
          const slotKey = this.getPortalSlotKey(gridX, gridZ, y);
          const baseHeight = initial?.[gridX]?.[gridZ] ?? 0;
          this.portalFrameSlots.set(slotKey, {
            id: slotKey,
            gridX,
            gridZ,
            relY: y,
            baseHeight,
            level: baseHeight + y,
            filled: false,
            columnKey: `${gridX}|${gridZ}`,
            status: 'missing',
            blocked: false,
            blockType: null,
          });
          requiredCount += 1;
        });
      }
      this.portalPlacementPreview = null;
    ensurePortalGhostGroup() {
      const THREE = this.THREE;
      if (!THREE || typeof THREE.Group !== 'function') {
        return null;
      }
      if (!(this.portalGhostGroup instanceof THREE.Group)) {
        this.portalGhostGroup = new THREE.Group();
        this.portalGhostGroup.name = 'PortalGhostPreview';
        this.portalGhostGroup.visible = false;
      }
      if (this.portalGroup instanceof THREE.Group && this.portalGhostGroup.parent !== this.portalGroup) {
        try {
          this.portalGroup.add(this.portalGhostGroup);
        } catch (error) {
          if (typeof console !== 'undefined' && typeof console.debug === 'function') {
            console.debug('Failed to attach portal ghost preview group.', error);
          }
        }
      }
      if (!(this.portalGhostMeshes instanceof Map)) {
        this.portalGhostMeshes = new Map();
      }
      return this.portalGhostGroup;
    }

    clearPortalGhostBlocks() {
      const group = this.ensurePortalGhostGroup();
      if (!(this.portalGhostMeshes instanceof Map)) {
        this.portalGhostMeshes = new Map();
      }
      if (this.portalGhostMeshes.size) {
        this.portalGhostMeshes.forEach((mesh) => {
          if (!mesh) return;
          if (mesh.parent && typeof mesh.parent.remove === 'function') {
            try {
              mesh.parent.remove(mesh);
            } catch (error) {
              if (typeof console !== 'undefined' && typeof console.debug === 'function') {
                console.debug('Failed to detach portal ghost mesh.', error);
              }
            }
          }
          mesh.visible = false;
        });
      }
      if (group) {
        group.visible = false;
      }
    }

    updatePortalGhostBlocks(framePreview) {
      const group = this.ensurePortalGhostGroup();
      if (!group || !(this.portalGhostMeshes instanceof Map)) {
        return;
      }
      const active = new Set();
      if (framePreview instanceof Map) {
        framePreview.forEach((slot, key) => {
          if (!slot || slot.role !== 'frame') {
            return;
          }
          const slotKey = slot.id || key || this.getPortalSlotKey(slot.gridX, slot.gridZ, slot.relY ?? 0);
          if (!slotKey) {
            return;
          }
          const needsGhost = slot.ghost && !slot.blocked;
          if (!needsGhost) {
            return;
          }
          active.add(slotKey);
          let mesh = this.portalGhostMeshes.get(slotKey);
          if (!mesh) {
            if (!this.blockGeometry || !this.materials?.portalGhost) {
              return;
            }
            mesh = new this.THREE.Mesh(this.blockGeometry, this.materials.portalGhost);
            mesh.renderOrder = 1;
            mesh.visible = true;
            mesh.matrixAutoUpdate = false;
            mesh.userData = { ...(mesh.userData || {}), portalGhost: true, portalSlotId: slotKey };
            this.portalGhostMeshes.set(slotKey, mesh);
          }
          const gridX = Number.isFinite(slot.gridX) ? slot.gridX : 0;
          const gridZ = Number.isFinite(slot.gridZ) ? slot.gridZ : 0;
          const baseHeight = Number.isFinite(slot.baseHeight)
            ? slot.baseHeight
            : this.initialHeightMap?.[gridX]?.[gridZ] ?? 0;
          const relY = Number.isFinite(slot.relY)
            ? slot.relY
            : Number.isFinite(slot.level)
              ? slot.level - baseHeight
              : 0;
          const level = Number.isFinite(slot.level) ? slot.level : baseHeight + relY;
          const worldX = (gridX - WORLD_SIZE / 2) * BLOCK_SIZE;
          const worldZ = (gridZ - WORLD_SIZE / 2) * BLOCK_SIZE;
          const worldY = (level + 0.5) * BLOCK_SIZE;
          mesh.position.set(worldX, worldY, worldZ);
          mesh.updateMatrix();
          if (mesh.parent !== group) {
            try {
              group.add(mesh);
            } catch (error) {
              if (typeof console !== 'undefined' && typeof console.debug === 'function') {
                console.debug('Failed to attach portal ghost mesh to group.', error);
              }
            }
          }
          mesh.visible = true;
        });
      }
      this.portalGhostMeshes.forEach((mesh, key) => {
        if (active.has(key)) {
          return;
        }
        if (mesh?.parent && typeof mesh.parent.remove === 'function') {
          try {
            mesh.parent.remove(mesh);
          } catch (error) {
            if (typeof console !== 'undefined' && typeof console.debug === 'function') {
              console.debug('Failed to detach inactive portal ghost mesh.', error);
            }
          }
        }
        if (mesh) {
          mesh.visible = false;
        }
      });
      group.visible = active.size > 0;
    }

    describePortalFrameSlotState(slot) {
      if (!slot) {
        return null;
      }
      const gridX = Number.isFinite(slot.gridX) ? slot.gridX : null;
      const gridZ = Number.isFinite(slot.gridZ) ? slot.gridZ : null;
      if (gridX === null || gridZ === null) {
        return null;
      }
      const baseHeight = Number.isFinite(slot.baseHeight)
        ? slot.baseHeight
        : this.initialHeightMap?.[gridX]?.[gridZ] ?? 0;
      const relY = Number.isFinite(slot.relY)
        ? slot.relY
        : Number.isFinite(slot.level)
          ? slot.level - baseHeight
          : 0;
      const level = Number.isFinite(slot.level) ? slot.level : baseHeight + relY;
      const columnKey = slot.columnKey || `${gridX}|${gridZ}`;
      const column = this.columns instanceof Map ? this.columns.get(columnKey) : null;
      const mesh = Array.isArray(column) ? column[level] : null;
      let obstructions = this.collectPortalFrameSlotObstructions(slot, 0.05);
      if (this.portalDebugBypassObstructions && Array.isArray(obstructions)) {
        obstructions = obstructions.filter((entry) => {
          const kind = entry?.kind ? String(entry.kind).toLowerCase() : '';
          return kind !== 'zombie' && kind !== 'golem';
        });
      }
      if (Array.isArray(obstructions) && obstructions.length) {
        const reason = this.formatPortalObstructionLabel(obstructions, 'obstruction');
        return { blocked: true, reason, obstructions };
      }
      if (mesh) {
        const blockType = typeof mesh.userData?.blockType === 'string' ? mesh.userData.blockType : null;
        return {
          present: Boolean(blockType),
          filled: blockType === 'stone',
          blockType,
          type: blockType,
        };
      }
      return { present: false, filled: false };
    }

    refreshPortalPlacementPreview() {
      if (!this.portalFrameSlots?.size || !this.portalMechanics?.buildPortalPlacementPreview) {
        this.portalPlacementPreview = null;
        this.updatePortalGhostBlocks(new Map());
        return null;
      }
      const layout = this.portalFrameLayout || this.createPortalFrameLayout();
      if (!layout) {
        this.portalPlacementPreview = null;
        this.updatePortalGhostBlocks(new Map());
        return null;
      }
      const preview = this.portalMechanics.buildPortalPlacementPreview(layout, {
        blockSize: BLOCK_SIZE,
        baseHeightMap: this.initialHeightMap,
        heightMap: this.heightMap,
        columns: this.columns,
        requiredBlockType: 'stone',
        getBlockState: (slot) => this.describePortalFrameSlotState(slot),
      });
      this.portalPlacementPreview = preview;
      if (preview?.frameSlots instanceof Map) {
        this.portalFrameSlots.forEach((slot, key) => {
          const entry = preview.frameSlots.get(key);
          if (!entry) {
            slot.filled = false;
            slot.blocked = false;
            slot.status = 'missing';
            slot.blockType = null;
            return;
          }
          slot.filled = entry.present && !entry.blocked && entry.blockType === 'stone';
          slot.blocked = entry.blocked;
          slot.status = entry.status;
          slot.blockType = entry.blockType ?? null;
        });
        this.updatePortalGhostBlocks(preview.frameSlots);
      } else {
        this.updatePortalGhostBlocks(new Map());
      }
      return preview;
    }

    derivePortalValidationFromPreview(preview) {
      if (!preview) {
        return null;
      }
      const highlightSlots = [];
      if (preview.frameSlots instanceof Map) {
        preview.frameSlots.forEach((slot) => {
          if (!slot || slot.role !== 'frame') {
            return;
          }
          if (slot.blocked || slot.ghost) {
            highlightSlots.push(slot);
          }
        });
      }
      const messages = Array.isArray(preview.messages) ? preview.messages : [];
      const message = messages.length ? messages[0] : '';
      return {
        valid: preview.footprintValid === true,
        message,
        highlightSlots,
        summary: preview.summary || null,
      };
    }

    legacyValidatePortalFrameFootprint(filledCount = this.portalBlocksPlaced) {
    validatePortalFrameFootprint(filledCount = this.portalBlocksPlaced) {
      const preview = this.portalPlacementPreview || this.refreshPortalPlacementPreview();
      const validation = this.derivePortalValidationFromPreview(preview);
      if (validation) {
        const summary = preview?.summary || {
          totalFrameSlots: this.portalFrameSlots.size,
          presentFrameSlots:
            preview?.summary?.presentFrameSlots ?? Math.max(0, Math.min(this.portalFrameSlots.size, this.portalBlocksPlaced)),
          missingFrameSlots:
            preview?.summary?.missingFrameSlots ?? Math.max(0, this.portalFrameSlots.size - (preview?.summary?.presentFrameSlots ?? this.portalBlocksPlaced)),
          blockedFrameSlots:
            preview?.summary?.blockedFrameSlots ?? (Array.isArray(validation.highlightSlots)
              ? validation.highlightSlots.filter((slot) => slot?.role === 'frame' && slot.blocked).length
              : 0),
        };
        return {
          valid: validation.valid,
          message: validation.message,
          highlightSlots: validation.highlightSlots,
          summary,
        };
      }
      return this.legacyValidatePortalFrameFootprint(filledCount);
    }

      const preview = this.refreshPortalPlacementPreview();
      let validation = this.derivePortalValidationFromPreview(preview);
      if (preview?.summary?.presentFrameSlots !== undefined) {
        this.portalBlocksPlaced = preview.summary.presentFrameSlots;
      } else {
        let filled = 0;
        this.portalFrameSlots.forEach((slot) => {
          if (slot.filled) {
            filled += 1;
          }
        });
        this.portalBlocksPlaced = filled;
      }
      if (!validation) {
        validation = this.legacyValidatePortalFrameFootprint(this.portalBlocksPlaced);
      }
      this.clearPortalGhostBlocks();
      this.portalPlacementPreview = null;
      this.ensurePortalGhostGroup();
