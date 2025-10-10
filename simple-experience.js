      this.portalPlacementPreview = null;
      this.portalPreviewMeshes = new Map();
      this.portalPreviewGroup = null;
        portalPreview: new THREE.MeshStandardMaterial({
          color: new THREE.Color('#7f5af0'),
          emissive: new THREE.Color('#7f5af0'),
          emissiveIntensity: 0.18,
          roughness: 0.4,
          metalness: 0.1,
          transparent: true,
          opacity: 0.28,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
    buildPortalPreviewLayout() {
      if (!this.portalFrameSlots?.size) {
        return null;
      }
      const clampIndex = (value) => {
        const numeric = Math.round(Number(value));
        if (!Number.isFinite(numeric)) {
          return 0;
        }
        return Math.max(0, Math.min(WORLD_SIZE - 1, numeric));
      };
      const anchor = this.portalAnchorGrid || this.computePortalAnchorGrid();
      const anchorX = clampIndex(anchor?.x ?? 0);
      const anchorZ = clampIndex(anchor?.z ?? 0);
      const anchorHeight = this.initialHeightMap?.[anchorX]?.[anchorZ];
      let minOffsetX = Infinity;
      let maxOffsetX = -Infinity;
      let minRelY = Infinity;
      let maxRelY = -Infinity;
      if (Array.isArray(this.portalFrameLayout) && this.portalFrameLayout.length) {
        this.portalFrameLayout.forEach((entry) => {
          const xOffset = Number(entry?.xOffset);
          const relY = Number(entry?.y);
          if (!Number.isFinite(xOffset) || !Number.isFinite(relY)) {
            return;
          }
          minOffsetX = Math.min(minOffsetX, xOffset);
          maxOffsetX = Math.max(maxOffsetX, xOffset);
          minRelY = Math.min(minRelY, relY);
          maxRelY = Math.max(maxRelY, relY);
        });
      }
      if (!Number.isFinite(minOffsetX) || !Number.isFinite(maxOffsetX)) {
        minOffsetX = -1;
        maxOffsetX = 1;
      }
      if (!Number.isFinite(minRelY) || !Number.isFinite(maxRelY)) {
        minRelY = 0;
        maxRelY = 3;
      }
      const bounds = {
        width: Math.max(0, Math.round(maxOffsetX - minOffsetX + 1)),
        height: Math.max(0, Math.round(maxRelY - minRelY + 1)),
      };
      const frameSlots = new Map();
      const interiorSlots = new Map();
      const columnSlots = new Map();
      const ensureColumn = (gridX, gridZ) => {
        const key = `${gridX}|${gridZ}`;
        if (!columnSlots.has(key)) {
          columnSlots.set(key, { key, gridX, gridZ, slots: [] });
        }
        return columnSlots.get(key);
      };
      const resolveBaseHeight = (gridX, gridZ, fallback) => {
        if (Number.isFinite(fallback)) {
          return fallback;
        }
        const initial = this.initialHeightMap?.[gridX]?.[gridZ];
        if (Number.isFinite(initial)) {
          return initial;
        }
        if (Number.isFinite(anchorHeight)) {
          return anchorHeight;
        }
        return 0;
      };
      const enrichSlot = (slot, role, explicitId) => {
        if (!slot) {
          return null;
        }
        const gridX = clampIndex(slot.gridX);
        const gridZ = clampIndex(slot.gridZ);
        const relY = Number.isFinite(slot.relY) ? Math.round(slot.relY) : 0;
        const baseHeight = resolveBaseHeight(gridX, gridZ, slot.baseHeight);
        const level = (Number.isFinite(baseHeight) ? baseHeight : 0) + relY;
        const id = explicitId || `${gridX}|${gridZ}|${relY}`;
        const relX = gridX - anchorX;
        const relZ = gridZ - anchorZ;
        const enriched = {
          id,
          columnKey: `${gridX}|${gridZ}`,
          gridX,
          gridZ,
          relX,
          relZ,
          relY,
          baseHeight,
          level,
          role,
          orientation: 'vertical',
          bounds,
        };
        ensureColumn(gridX, gridZ).slots.push(enriched);
        return enriched;
      };
      this.portalFrameSlots.forEach((slot, key) => {
        const enriched = enrichSlot(
          {
            gridX: slot.gridX,
            gridZ: slot.gridZ,
            relY: slot.relY,
            baseHeight: slot.baseHeight,
          },
          'frame',
          key,
        );
        if (enriched) {
          frameSlots.set(key, enriched);
        }
      });
      if (Array.isArray(this.portalFrameLayout) && this.portalFrameLayout.length) {
        this.portalFrameLayout.forEach((entry) => {
          if (!entry || entry.required) {
            return;
          }
          const relY = Number(entry.y);
          const gridX = clampIndex(anchorX + Number(entry.xOffset));
          const gridZ = anchorZ;
          const enriched = enrichSlot(
            {
              gridX,
              gridZ,
              relY,
              baseHeight: this.initialHeightMap?.[gridX]?.[gridZ],
            },
            'interior',
          );
          if (enriched) {
            interiorSlots.set(enriched.id, enriched);
          }
        });
      }
      return {
        anchor: {
          x: anchorX,
          z: anchorZ,
          y: Number.isFinite(anchorHeight) ? anchorHeight : 0,
        },
        facing: { x: 0, y: 1 },
        orientation: 'vertical',
        bounds,
        start: { x: anchorX + minOffsetX, z: anchorZ },
        frameSlots,
        interiorSlots,
        columnSlots,
        blockSize: BLOCK_SIZE,
      };
    }

      this.applyPortalPlacementPreview(null);
      const validation = this.validatePortalFrameFootprint(0);
      this.portalFrameFootprintValid = validation.valid;
      this.portalFrameValidationMessage = validation.message || '';
      this.highlightPortalFrameIssues(validation.highlightSlots);
    ensurePortalPreviewGroup() {
      const THREE = this.THREE;
      if (!THREE || typeof THREE.Group !== 'function') {
        return null;
      }
      if (!this.portalPreviewGroup || this.portalPreviewGroup.isObject3D !== true) {
        try {
          this.portalPreviewGroup = new THREE.Group();
          this.portalPreviewGroup.name = 'PortalFramePreview';
        } catch (error) {
          if (typeof console !== 'undefined' && typeof console.debug === 'function') {
            console.debug('Failed to initialise portal preview group.', error);
          }
          this.portalPreviewGroup = null;
          return null;
        }
      }
      const group = this.portalPreviewGroup;
      if (group.parent !== this.portalGroup && this.portalGroup && typeof this.portalGroup.add === 'function') {
        if (group.parent && typeof group.parent.remove === 'function') {
          try {
            group.parent.remove(group);
          } catch (error) {
            if (typeof console !== 'undefined' && typeof console.debug === 'function') {
              console.debug('Failed to detach stale portal preview group.', error);
            }
          }
        }
        try {
          this.portalGroup.add(group);
        } catch (error) {
          if (typeof console !== 'undefined' && typeof console.debug === 'function') {
            console.debug('Failed to attach portal preview group to portal root.', error);
          }
        }
      }
      return group;
    }

    clearPortalPreviewGhosts() {
      if (!(this.portalPreviewMeshes instanceof Map)) {
        this.portalPreviewMeshes = new Map();
      }
      this.portalPreviewMeshes.forEach((mesh) => {
        if (mesh?.parent && typeof mesh.parent.remove === 'function') {
          mesh.parent.remove(mesh);
        }
      });
      this.portalPreviewMeshes.clear();
      const group = this.portalPreviewGroup;
      if (group && Array.isArray(group.children) && group.children.length) {
        for (let i = group.children.length - 1; i >= 0; i -= 1) {
          const child = group.children[i];
          group.remove(child);
        }
      }
    }

    syncPortalPreviewGhosts(preview) {
      if (!preview || !Array.isArray(preview.preview) || preview.preview.length === 0) {
        this.clearPortalPreviewGhosts();
        return;
      }
      const THREE = this.THREE;
      if (!THREE || typeof THREE.Mesh !== 'function') {
        return;
      }
      const group = this.ensurePortalPreviewGroup();
      if (!group) {
        return;
      }
      if (!(this.portalPreviewMeshes instanceof Map)) {
        this.portalPreviewMeshes = new Map();
      }
      const required = new Set();
      preview.preview.forEach((entry) => {
        if (entry && entry.role === 'frame' && entry.ghost) {
          required.add(entry.id);
        }
      });
      const stale = [];
      this.portalPreviewMeshes.forEach((mesh, key) => {
        if (!required.has(key)) {
          if (mesh?.parent && typeof mesh.parent.remove === 'function') {
            mesh.parent.remove(mesh);
          }
          stale.push(key);
        }
      });
      stale.forEach((key) => this.portalPreviewMeshes.delete(key));
      if (!required.size) {
        if (group.children && group.children.length) {
          for (let i = group.children.length - 1; i >= 0; i -= 1) {
            const child = group.children[i];
            group.remove(child);
          }
        }
        return;
      }
      required.forEach((id) => {
        const source =
          (preview.frameSlots && preview.frameSlots.get && preview.frameSlots.get(id)) ||
          preview.preview.find((entry) => entry.id === id);
        if (!source) {
          return;
        }
        let mesh = this.portalPreviewMeshes.get(id);
        if (!mesh) {
          const material = this.materials.portalPreview || this.getMaterialForBlock('stone');
          mesh = new THREE.Mesh(this.blockGeometry, material);
          mesh.name = `PortalPreviewGhost:${id}`;
          mesh.castShadow = false;
          mesh.receiveShadow = false;
          mesh.matrixAutoUpdate = false;
          this.portalPreviewMeshes.set(id, mesh);
        }
        if (mesh.parent !== group) {
          if (mesh.parent && typeof mesh.parent.remove === 'function') {
            mesh.parent.remove(mesh);
          }
          group.add(mesh);
        }
        const gridX = Number(source.gridX);
        const gridZ = Number(source.gridZ);
        const level = Number(source.level);
        const worldX = (gridX - WORLD_SIZE / 2) * BLOCK_SIZE;
        const worldY = (level + 0.5) * BLOCK_SIZE;
        const worldZ = (gridZ - WORLD_SIZE / 2) * BLOCK_SIZE;
        mesh.position.set(worldX, worldY, worldZ);
        mesh.scale.set(1, 1, 1);
        mesh.visible = true;
        mesh.updateMatrix();
      });
    }

    applyPortalPlacementPreview(preview) {
      if (this.portalActivated) {
        this.portalPlacementPreview = null;
        this.clearPortalPreviewGhosts();
        return;
      }
      if (!preview) {
        this.portalPlacementPreview = null;
        this.clearPortalPreviewGhosts();
        return;
      }
      this.portalPlacementPreview = preview;
      this.syncPortalPreviewGhosts(preview);
    }

    legacyValidatePortalFrameFootprint(filledCount = this.portalBlocksPlaced) {
    validatePortalFrameFootprint(filledCount = this.portalBlocksPlaced) {
      if (this.portalMechanics?.validatePortalFrameFootprint && this.portalFrameSlots?.size) {
        try {
          const layout = this.buildPortalPreviewLayout();
          if (layout) {
            const validation = this.portalMechanics.validatePortalFrameFootprint(layout, {
              columns: this.columns,
              heightMap: this.heightMap,
              requiredBlockType: 'stone',
            });
            const preview = validation?.preview ?? null;
            this.applyPortalPlacementPreview(preview);
            const highlightSlots = [];
            if (preview?.preview?.length) {
              preview.preview.forEach((entry) => {
                if (!entry || entry.role !== 'frame' || !entry.blocked) {
                  return;
                }
                const slot = this.portalFrameSlots.get(entry.id);
                if (slot) {
                  highlightSlots.push(slot);
                }
              });
            }
            const message = Array.isArray(validation?.messages)
              ? validation.messages.find((value) => typeof value === 'string' && value.trim().length)
              : '';
            return {
              valid: Boolean(validation?.valid),
              message: message || '',
              highlightSlots,
            };
          }
        } catch (error) {
          if (typeof console !== 'undefined' && typeof console.warn === 'function') {
            console.warn('Advanced portal footprint validation failed; reverting to legacy rules.', error);
          }
        }
      }
      this.applyPortalPlacementPreview(null);
      return this.legacyValidatePortalFrameFootprint(filledCount);
    }

      const validation = this.validatePortalFrameFootprint(this.portalBlocksPlaced);
      this.portalFrameFootprintValid = validation.valid;
      this.portalFrameValidationMessage = validation.message || '';
      this.highlightPortalFrameIssues(validation.highlightSlots);
      this.clearPortalPreviewGhosts();
