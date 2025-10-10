  let PORTAL_MECHANICS =
  if (!PORTAL_MECHANICS) {
    try {
      const portalMechanicsModule =
        typeof require === 'function' ? require('./portal-mechanics') : null;
      PORTAL_MECHANICS =
        portalMechanicsModule?.default || portalMechanicsModule || PORTAL_MECHANICS;
    } catch (error) {
      PORTAL_MECHANICS = PORTAL_MECHANICS || null;
    }
  }
  const FALLBACK_PORTAL_LAYOUT_BOUNDS = { width: 3, height: 4 };

  function fallbackCreatePortalFrameLayout(anchor, options = {}) {
    const anchorX = Math.max(0, Math.min(WORLD_SIZE - 1, anchor?.x ?? 0));
    const anchorZ = Math.max(0, Math.min(WORLD_SIZE - 1, anchor?.z ?? 0));
    const anchorY = Number.isFinite(anchor?.y) ? anchor.y : 0;
    const frameSlots = new Map();
    const interiorSlots = new Map();
    const columnSlots = new Map();
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let relY = 0; relY < 4; relY += 1) {
        const gridX = Math.max(0, Math.min(WORLD_SIZE - 1, anchorX + dx));
        const gridZ = Math.max(0, Math.min(WORLD_SIZE - 1, anchorZ));
        const columnKey = `${gridX}|${gridZ}`;
        const baseHeight = Number.isFinite(options.initialHeightMap?.[gridX]?.[gridZ])
          ? options.initialHeightMap[gridX][gridZ]
          : anchorY;
        const level = baseHeight + relY;
        const slot = {
          id: `${columnKey}|${relY}`,
          columnKey,
          gridX,
          gridZ,
          relX: dx,
          relZ: 0,
          relY,
          baseHeight,
          level,
          role: Math.abs(dx) === 1 || relY === 0 || relY === 3 ? 'frame' : 'interior',
          orientation: 'horizontal',
          bounds: FALLBACK_PORTAL_LAYOUT_BOUNDS,
          worldPosition: {
            x: (gridX - WORLD_SIZE / 2) * BLOCK_SIZE,
            y: level * BLOCK_SIZE,
            z: (gridZ - WORLD_SIZE / 2) * BLOCK_SIZE,
          },
        };
        if (!columnSlots.has(columnKey)) {
          columnSlots.set(columnKey, { key: columnKey, gridX, gridZ, slots: [] });
        }
        columnSlots.get(columnKey).slots.push(slot);
        if (slot.role === 'frame') {
          frameSlots.set(slot.id, slot);
        } else {
          interiorSlots.set(slot.id, slot);
        }
      }
    }
    return {
      anchor: { x: anchorX, z: anchorZ, y: anchorY },
      facing: { x: 0, y: 1 },
      orientation: 'horizontal',
      bounds: FALLBACK_PORTAL_LAYOUT_BOUNDS,
      start: { x: anchorX - 1, z: anchorZ },
      frameSlots,
      interiorSlots,
      columnSlots,
      blockSize: BLOCK_SIZE,
    };
  }

  function fallbackBuildPortalPlacementPreview(layout, options = {}) {
    const framePreview = new Map();
    const interiorPreview = new Map();
    const previewEntries = [];
    let missing = 0;
    let blocked = 0;
    let present = 0;
    const requiredBlockType = typeof options.requiredBlockType === 'string' ? options.requiredBlockType : null;
    const columns = options.columns instanceof Map ? options.columns : null;

    const evaluateSlot = (slot, role) => {
      const columnKey = slot.columnKey ?? `${slot.gridX}|${slot.gridZ}`;
      const column = columns?.get(columnKey) ?? [];
      const level = Number.isFinite(slot.level) ? slot.level : slot.baseHeight + slot.relY;
      const block = Array.isArray(column) ? column[level] : null;
      let status = 'missing';
      let reason = '';
      let blockType = null;
      const countTowardsSummary = role === 'frame';
      if (block?.userData?.blockType) {
        blockType = block.userData.blockType;
        if (!requiredBlockType || blockType === requiredBlockType) {
          status = 'present';
          if (countTowardsSummary) {
            present += 1;
          }
        } else {
          status = 'blocked';
          reason = `mismatched-block:${blockType}`;
          if (countTowardsSummary) {
            blocked += 1;
          }
        }
      } else if (block) {
        status = 'blocked';
        reason = 'blocked';
        if (countTowardsSummary) {
          blocked += 1;
        }
      } else {
        if (countTowardsSummary) {
          missing += 1;
        }
      }
      const entry = {
        ...slot,
        role,
        status,
        reason,
        blockType,
        present: status === 'present',
        blocked: status === 'blocked',
        ghost: status !== 'present' && status !== 'blocked',
      };
      previewEntries.push(entry);
      return entry;
    };

    layout.frameSlots.forEach((slot, key) => {
      framePreview.set(key, evaluateSlot(slot, 'frame'));
    });
    layout.interiorSlots?.forEach((slot, key) => {
      interiorPreview.set(key, evaluateSlot(slot, 'interior'));
    });

    const summary = {
      totalFrameSlots: layout.frameSlots.size,
      missingFrameSlots: missing,
      blockedFrameSlots: blocked,
      presentFrameSlots: present,
    };

    const messages = [];
    if (blocked > 0) {
      messages.push('Portal frame placement blocked by mismatched materials.');
    }
    if (missing > 0) {
      messages.push(`Missing ${missing} of ${layout.frameSlots.size} required portal frame blocks.`);
    }
    if (!messages.length) {
      messages.push('Portal frame footprint complete.');
    }

    return {
      layout,
      frameSlots: framePreview,
      interiorSlots: interiorPreview,
      preview: previewEntries,
      summary,
      footprintValid: missing === 0 && blocked === 0,
      messages,
    };
  }

  function fallbackValidatePortalFrameFootprint(anchorOrLayout, options = {}) {
    const layout = anchorOrLayout?.frameSlots
      ? anchorOrLayout
      : fallbackCreatePortalFrameLayout(anchorOrLayout, options);
    const preview = fallbackBuildPortalPlacementPreview(layout, options);
    return {
      valid: preview.footprintValid,
      messages: preview.messages,
      summary: preview.summary,
      preview,
    };
  }

  if (!PORTAL_MECHANICS) {
    PORTAL_MECHANICS = {
      createPortalFrameLayout: fallbackCreatePortalFrameLayout,
      buildPortalPlacementPreview: fallbackBuildPortalPlacementPreview,
      validatePortalFrameFootprint: fallbackValidatePortalFrameFootprint,
    };
  }
      if (
        !this.portalMechanics ||
        typeof this.portalMechanics.buildPortalPlacementPreview !== 'function' ||
        typeof this.portalMechanics.createPortalFrameLayout !== 'function'
      ) {
        this.portalMechanics = {
          createPortalFrameLayout: fallbackCreatePortalFrameLayout,
          buildPortalPlacementPreview: fallbackBuildPortalPlacementPreview,
          validatePortalFrameFootprint: fallbackValidatePortalFrameFootprint,
        };
      }
      this.portalPreviewGroup = null;
      this.portalGhostBlocks = new Map();
      this.portalGhostMaterial = null;
      this.portalPlacementPreview = null;
      this.portalPreviewGroup = new THREE.Group();
      this.portalPreviewGroup.name = 'PortalPreview';
      this.portalGroup.add(this.portalPreviewGroup);
    buildLegacyPortalLayout(anchorGrid, anchorHeight = 0) {
      const anchorX = Math.max(0, Math.min(WORLD_SIZE - 1, anchorGrid?.x ?? 0));
      const anchorZ = Math.max(0, Math.min(WORLD_SIZE - 1, anchorGrid?.z ?? 0));
      const anchorY = Number.isFinite(anchorHeight) ? anchorHeight : 0;
      const layout = {
        anchor: { x: anchorX, z: anchorZ, y: anchorY },
        facing: { x: 0, y: 1 },
        orientation: 'horizontal',
        bounds: { width: 3, height: 4 },
        start: { x: anchorX - 1, z: anchorZ },
        frameSlots: new Map(),
        interiorSlots: new Map(),
        columnSlots: new Map(),
        blockSize: BLOCK_SIZE,
      };
      for (let dx = -1; dx <= 1; dx += 1) {
        for (let relY = 0; relY < 4; relY += 1) {
          const gridX = Math.max(0, Math.min(WORLD_SIZE - 1, anchorX + dx));
          const gridZ = Math.max(0, Math.min(WORLD_SIZE - 1, anchorZ));
          const columnKey = `${gridX}|${gridZ}`;
          const baseHeight = Number.isFinite(this.initialHeightMap?.[gridX]?.[gridZ])
            ? this.initialHeightMap[gridX][gridZ]
            : anchorY;
          const level = baseHeight + relY;
          const slot = {
            id: `${columnKey}|${relY}`,
            columnKey,
            gridX,
            gridZ,
            relX: dx,
            relZ: 0,
            relY,
            baseHeight,
            level,
            role: Math.abs(dx) === 1 || relY === 0 || relY === 3 ? 'frame' : 'interior',
            orientation: 'horizontal',
            bounds: layout.bounds,
            worldPosition: {
              x: (gridX - WORLD_SIZE / 2) * BLOCK_SIZE,
              y: level * BLOCK_SIZE,
              z: (gridZ - WORLD_SIZE / 2) * BLOCK_SIZE,
            },
          };
          if (!layout.columnSlots.has(columnKey)) {
            layout.columnSlots.set(columnKey, { key: columnKey, gridX, gridZ, slots: [] });
          }
          layout.columnSlots.get(columnKey).slots.push(slot);
          if (slot.role === 'frame') {
            layout.frameSlots.set(slot.id, slot);
          } else {
            layout.interiorSlots.set(slot.id, slot);
          }
        }
      }
      return layout;
    }

      const anchorGrid = this.portalAnchorGrid || this.computePortalAnchorGrid() || { x: 0, z: 0 };
      const anchorX = Number.isFinite(anchorGrid?.x) ? anchorGrid.x : 0;
      const anchorZ = Number.isFinite(anchorGrid?.z) ? anchorGrid.z : 0;
      const anchorHeight = Number.isFinite(this.initialHeightMap?.[anchorX]?.[anchorZ])
        ? this.initialHeightMap[anchorX][anchorZ]
        : 0;
      let layout = null;
      if (this.portalMechanics?.createPortalFrameLayout) {
        try {
          layout = this.portalMechanics.createPortalFrameLayout(
            { x: anchorX, z: anchorZ, y: anchorHeight },
            {
              blockSize: BLOCK_SIZE,
              baseHeightMap: this.initialHeightMap,
              columns: this.columns,
              heightMap: this.heightMap,
              getColumnHeight: (x, z) => {
                const columnKey = `${x}|${z}`;
                const column = this.columns?.get(columnKey);
                if (Array.isArray(column) && column.length) {
                  return column.length;
                }
                const columnHeight = this.heightMap?.[x]?.[z];
                if (Number.isFinite(columnHeight)) {
                  return columnHeight;
                }
                const initialHeight = this.initialHeightMap?.[x]?.[z];
                if (Number.isFinite(initialHeight)) {
                  return initialHeight;
                }
                return null;
              },
            },
          );
        } catch (error) {
          if (typeof console !== 'undefined' && typeof console.warn === 'function') {
            console.warn('Portal mechanics layout generation failed; using fallback layout.', error);
          }
          layout = null;
      if (!layout || !(layout.frameSlots instanceof Map)) {
        layout = this.buildLegacyPortalLayout({ x: anchorX, z: anchorZ }, anchorHeight);
      }
      this.portalFrameLayout = layout;
      this.portalPlacementPreview = null;
      this.clearPortalGhostBlocks();
      const layout = this.createPortalFrameLayout();
      if (layout?.frameSlots instanceof Map) {
        layout.frameSlots.forEach((slot) => {
          if (!slot) {
            return;
          }
          const gridX = Math.max(0, Math.min(WORLD_SIZE - 1, Number(slot.gridX)));
          const gridZ = Math.max(0, Math.min(WORLD_SIZE - 1, Number(slot.gridZ)));
          const relY = Number.isFinite(slot.relY) ? slot.relY : 0;
          const baseHeight = Number.isFinite(slot.baseHeight)
            ? slot.baseHeight
            : this.initialHeightMap?.[gridX]?.[gridZ] ?? 0;
          const slotKey = this.getPortalSlotKey(gridX, gridZ, relY);
          this.portalFrameSlots.set(slotKey, {
            id: slot.id ?? slotKey,
            columnKey: slot.columnKey ?? `${gridX}|${gridZ}`,
            gridX,
            gridZ,
            relY,
            baseHeight,
            level: baseHeight + relY,
            filled: false,
          });
          requiredCount += 1;
      }
      this.updatePortalPlacementPreview();
    ensurePortalPreviewGroup() {
      const THREE = this.THREE;
      if (!this.portalPreviewGroup && this.portalGroup && THREE) {
        this.portalPreviewGroup = new THREE.Group();
        this.portalPreviewGroup.name = 'PortalPreview';
        this.portalGroup.add(this.portalPreviewGroup);
      } else if (
        this.portalPreviewGroup &&
        this.portalGroup &&
        this.portalPreviewGroup.parent !== this.portalGroup &&
        typeof this.portalGroup.add === 'function'
      ) {
        this.portalGroup.add(this.portalPreviewGroup);
      }
      return this.portalPreviewGroup || null;
    }
    getPortalGhostMaterial() {
      const THREE = this.THREE;
      if (!THREE || typeof THREE.MeshStandardMaterial !== 'function') {
        return null;
      }
      if (!this.portalGhostMaterial) {
        this.portalGhostMaterial = new THREE.MeshStandardMaterial({
          color: '#7f8cff',
          emissive: '#3f51b5',
          emissiveIntensity: 0.4,
          transparent: true,
          opacity: 0.35,
          depthWrite: false,
        });
      }
      return this.portalGhostMaterial;
    }

    clearPortalGhostBlocks() {
      if (this.portalPreviewGroup?.clear) {
        this.portalPreviewGroup.clear();
      }
      if (this.portalGhostBlocks instanceof Map) {
        this.portalGhostBlocks.clear();
      } else {
        this.portalGhostBlocks = new Map();
      }
    }

    updatePortalGhostBlocks(preview) {
      if (!preview || !(preview.frameSlots instanceof Map) || preview.frameSlots.size === 0) {
        this.clearPortalGhostBlocks();
        return;
      }
      const group = this.ensurePortalPreviewGroup();
      const THREE = this.THREE;
      if (!group || !THREE || typeof THREE.Mesh !== 'function') {
        return;
      }
      if (!(this.portalGhostBlocks instanceof Map)) {
        this.portalGhostBlocks = new Map();
      }
      const ghostMaterial = this.getPortalGhostMaterial();
      const activeSlots = new Set();
      preview.frameSlots.forEach((entry, key) => {
        if (!entry || entry.role !== 'frame' || !entry.ghost) {
        const slotId = entry.id ?? key ?? this.getPortalSlotKey(entry.gridX, entry.gridZ, entry.relY ?? 0);
        if (!slotId) {
          return;
        activeSlots.add(slotId);
        let mesh = this.portalGhostBlocks.get(slotId);
        if (!mesh) {
          mesh = new THREE.Mesh(this.blockGeometry, ghostMaterial);
          mesh.name = 'PortalGhostBlock';
          mesh.castShadow = false;
          mesh.receiveShadow = false;
          mesh.renderOrder = 1.5;
          mesh.userData = { ...(mesh.userData || {}), portalGhost: true, slotId };
          group.add(mesh);
          this.portalGhostBlocks.set(slotId, mesh);
        } else if (mesh.material !== ghostMaterial) {
          mesh.material = ghostMaterial;
        }
        const bounds = this.getPortalFrameSlotBounds(entry, 0);
        const worldX = bounds?.centerX ?? entry.worldPosition?.x ?? (entry.gridX - WORLD_SIZE / 2) * BLOCK_SIZE;
        const worldY = bounds?.centerY ??
          (Number.isFinite(entry.level) ? (entry.level + 0.5) * BLOCK_SIZE : mesh.position?.y ?? 0);
        const worldZ = bounds?.centerZ ?? entry.worldPosition?.z ?? (entry.gridZ - WORLD_SIZE / 2) * BLOCK_SIZE;
        mesh.position.set(worldX, worldY, worldZ);
        mesh.visible = true;
        if (!mesh.userData) {
          mesh.userData = {};
        mesh.userData.portalGhost = true;
        mesh.userData.slotId = slotId;
        mesh.userData.portalGhostReason = entry.reason || 'missing';
      if (this.portalGhostBlocks instanceof Map) {
        const removals = [];
        this.portalGhostBlocks.forEach((mesh, id) => {
          if (!activeSlots.has(id)) {
            if (mesh?.parent && typeof mesh.parent.remove === 'function') {
              mesh.parent.remove(mesh);
            removals.push(id);
          }
        });
        removals.forEach((id) => this.portalGhostBlocks.delete(id));
    }
    updatePortalPlacementPreview() {
      if (!this.portalFrameSlots?.size || !this.portalMechanics?.buildPortalPlacementPreview) {
        this.portalPlacementPreview = null;
        this.clearPortalGhostBlocks();
        return null;
      }
      const layout = this.portalFrameLayout || this.createPortalFrameLayout();
      if (!layout || !(layout.frameSlots instanceof Map) || layout.frameSlots.size === 0) {
        this.portalPlacementPreview = null;
        this.clearPortalGhostBlocks();
        return null;
      }
      let preview = null;
      try {
        preview = this.portalMechanics.buildPortalPlacementPreview(layout, {
          columns: this.columns,
          heightMap: this.heightMap,
          requiredBlockType: 'stone',
          getBlockState: (slot) => {
            const mesh = this.getPortalSlotMesh(slot);
            if (mesh?.userData?.blockType === 'stone') {
              return { present: true, blockType: 'stone' };
            }
            if (mesh?.userData?.blockType && mesh.userData.blockType !== 'stone') {
              return {
                blocked: true,
                blockType: mesh.userData.blockType,
                reason: `mismatched-block:${mesh.userData.blockType}`,
              };
            if (mesh) {
              return { blocked: true, reason: 'occupied' };
            const obstructions = this.collectPortalFrameSlotObstructions(slot, 0.05);
            if (Array.isArray(obstructions) && obstructions.length) {
              return {
                blocked: true,
                reason: this.formatPortalObstructionLabel(obstructions, 'obstruction'),
              };
            }
            return null;
          },
        });
      } catch (error) {
        if (typeof console !== 'undefined' && typeof console.warn === 'function') {
          console.warn('Portal placement preview failed to build.', error);
        preview = null;
      if (!preview) {
        this.portalPlacementPreview = null;
        this.clearPortalGhostBlocks();
        return null;
      this.portalPlacementPreview = preview;
      this.updatePortalGhostBlocks(preview);
      return preview;
    }
    validatePortalFrameFootprint(filledCount = this.portalBlocksPlaced, previewOverride = null) {
      if (!this.portalFrameSlots.size) {
        return { valid: false, message: '', highlightSlots: [], summary: null, preview: null };
      }
      const preview = previewOverride || this.portalPlacementPreview || this.updatePortalPlacementPreview();
      if (!preview) {
        return { valid: false, message: '', highlightSlots: [], summary: null, preview: null };
      }
      const messages = Array.isArray(preview.messages) ? preview.messages.filter(Boolean) : [];
      const highlightSlots = [];
      const iterate = Array.isArray(preview.preview)
        ? preview.preview
        : preview.frameSlots instanceof Map
          ? Array.from(preview.frameSlots.values())
          : [];
      iterate.forEach((entry) => {
        if (!entry || entry.role !== 'frame') {
          return;
        }
        if (entry.blocked) {
          highlightSlots.push(entry);
        } else if (typeof entry.reason === 'string' && entry.reason.startsWith('mismatched-block')) {
          highlightSlots.push(entry);
        }
      });
      const message = preview.footprintValid
        ? ''
        : messages.length
          ? messages[0]
          : preview.summary?.missingFrameSlots > 0
            ? 'Missing portal frame blocks.'
            : '';
        valid: preview.footprintValid === true,
        highlightSlots,
        summary: preview.summary ?? null,
        preview,
        slot.level = targetIndex;
        slot.baseHeight = baseHeight;
      const preview = this.updatePortalPlacementPreview();
      if (preview?.summary && Number.isFinite(preview.summary.presentFrameSlots)) {
        filled = preview.summary.presentFrameSlots;
      } else {
        this.portalFrameSlots.forEach((slot) => {
          if (slot.filled) {
            filled += 1;
          }
        });
      }
      const validation = this.validatePortalFrameFootprint(filled, preview);
      this.clearPortalGhostBlocks();
      this.portalPlacementPreview = null;
      const preview = this.updatePortalPlacementPreview();
        validation = this.validatePortalFrameFootprint(this.portalBlocksPlaced, preview);
      this.clearPortalGhostBlocks();
        slot.baseHeight = slot.baseHeight ?? this.initialHeightMap?.[slot.gridX]?.[slot.gridZ] ?? 0;
        slot.level = slot.baseHeight + slot.relY;
      const preview = this.updatePortalPlacementPreview();
      if (preview?.summary && Number.isFinite(preview.summary.presentFrameSlots)) {
        this.portalBlocksPlaced = preview.summary.presentFrameSlots;
      } else {
        this.portalBlocksPlaced = this.portalFrameSlots.size;
      }
      this.clearPortalGhostBlocks();
