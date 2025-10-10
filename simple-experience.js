  let PORTAL_MECHANICS =
  if (!PORTAL_MECHANICS && typeof require === 'function') {
    try {
      PORTAL_MECHANICS = require('./portal-mechanics');
    } catch (error) {
      if (typeof console !== 'undefined' && typeof console.debug === 'function') {
        console.debug('Portal mechanics module unavailable during bootstrap.', error);
      }
    }
  }
      this.portalGhostMeshes = new Map();
      this.portalPreviewGroup = null;
      this.portalFramePreview = null;
      this.portalFramePreviewSummary = null;
      this.portalPreviewGroup = new THREE.Group();
      this.portalPreviewGroup.name = 'PortalPreview';
      this.worldRoot.add(this.portalPreviewGroup);
        portalGhost: new THREE.MeshStandardMaterial({
          color: new THREE.Color('#9aa8ff'),
          emissive: new THREE.Color('#7f5af0'),
          emissiveIntensity: 0.18,
          transparent: true,
          opacity: 0.32,
          roughness: 0.45,
          metalness: 0.05,
          depthWrite: false,
        }),
      this.clearPortalPreviewGhosts();
      this.portalFramePreview = null;
      this.portalFramePreviewSummary = null;
      this.buildPortalFramePreview();
    ensurePortalPreviewGroup() {
      const THREE = this.THREE;
      if (this.portalPreviewGroup && typeof this.portalPreviewGroup.add === 'function') {
        return this.portalPreviewGroup;
      if (!THREE || !this.worldRoot || typeof this.worldRoot.add !== 'function') {
        return null;
      }
      this.portalPreviewGroup = new THREE.Group();
      this.portalPreviewGroup.name = 'PortalPreview';
      this.worldRoot.add(this.portalPreviewGroup);
      return this.portalPreviewGroup;
    }

    clearPortalPreviewGhosts() {
      if (!(this.portalGhostMeshes instanceof Map)) {
        this.portalGhostMeshes = new Map();
      }
      this.portalGhostMeshes.forEach((mesh) => {
        if (!mesh) return;
        if (mesh.parent && typeof mesh.parent.remove === 'function') {
          mesh.parent.remove(mesh);
        }
        if (mesh.matrixAutoUpdate === false && typeof mesh.updateMatrix === 'function') {
          mesh.updateMatrix();
        }
        mesh.visible = false;
      });
      this.portalGhostMeshes.clear();
      if (this.portalPreviewGroup && typeof this.portalPreviewGroup.clear === 'function') {
        this.portalPreviewGroup.clear();
      }
    }

    updatePortalPreviewGhosts(preview) {
      if (!(this.portalGhostMeshes instanceof Map)) {
        this.portalGhostMeshes = new Map();
      }
      const group = this.ensurePortalPreviewGroup();
      if (!group || !this.THREE || !this.blockGeometry) {
        return;
      }
      const activeKeys = new Set();
      if (preview && preview.frameSlots instanceof Map) {
        preview.frameSlots.forEach((slotPreview) => {
          if (!slotPreview || slotPreview.role !== 'frame' || !slotPreview.ghost) {
            return;
          }
          const slotKey = this.getPortalSlotKey(slotPreview.gridX, slotPreview.gridZ, slotPreview.relY);
          const slot = this.portalFrameSlots.get(slotKey);
          if (!slot) {
            return;
          }
          const baseHeight = Number.isFinite(slot.baseHeight)
            ? slot.baseHeight
            : this.initialHeightMap?.[slot.gridX]?.[slot.gridZ] ?? 0;
          const worldX = (slot.gridX - WORLD_SIZE / 2) * BLOCK_SIZE;
          const worldZ = (slot.gridZ - WORLD_SIZE / 2) * BLOCK_SIZE;
          const worldY = (baseHeight + slot.relY) * BLOCK_SIZE + BLOCK_SIZE / 2;
          let mesh = this.portalGhostMeshes.get(slotKey);
          if (!mesh) {
            const THREE = this.THREE;
            mesh = new THREE.Mesh(this.blockGeometry, this.materials.portalGhost || this.materials.stone);
            mesh.name = 'PortalPreviewGhost';
            mesh.castShadow = false;
            mesh.receiveShadow = false;
            mesh.matrixAutoUpdate = false;
            if (!mesh.userData) {
              mesh.userData = {};
            }
            mesh.userData.portalGhost = true;
            mesh.userData.slotKey = slotKey;
            group.add(mesh);
            this.portalGhostMeshes.set(slotKey, mesh);
          }
          mesh.position.set(worldX, worldY, worldZ);
          mesh.visible = true;
          mesh.updateMatrix();
          activeKeys.add(slotKey);
        });
      }
      this.portalGhostMeshes.forEach((mesh, key) => {
        if (!activeKeys.has(key) && mesh) {
          mesh.visible = false;
        }
      });
    }

    createManualPortalPreview() {
      if (!this.portalFrameSlots?.size) {
        return null;
      }
      const frameSlots = new Map();
      const tolerance = 1e-4;
      const ensureColumnStat = (slot, baseHeight) => {
        const columnKey = `${slot.gridX}|${slot.gridZ}`;
        let stat = columnStats.get(columnKey);
          stat = {
            gridX: slot.gridX,
            gridZ: slot.gridZ,
            baseHeight: Number.isFinite(baseHeight) ? baseHeight : null,
            slots: [],
            foundationLevel: null,
            topLevel: null,
          };
          columnStats.set(columnKey, stat);
      const appendIssue = (slotPreview, issue, reason = null) => {
        if (!slotPreview) {
        if (!Array.isArray(slotPreview.issues)) {
          slotPreview.issues = [];
        if (issue && !slotPreview.issues.includes(issue)) {
          slotPreview.issues.push(issue);
        }
        if (reason) {
          if (slotPreview.reason) {
            if (!slotPreview.reason.includes(reason)) {
              slotPreview.reason = `${slotPreview.reason};${reason}`;
            }
          } else {
            slotPreview.reason = reason;
      };
      this.portalFrameSlots.forEach((slot, key) => {
        const baseHeight = Number.isFinite(slot.baseHeight)
          ? slot.baseHeight
          : this.initialHeightMap?.[slot.gridX]?.[slot.gridZ] ?? 0;
        const worldLevel = Number.isFinite(baseHeight) ? baseHeight + slot.relY : null;
        const mesh = this.getPortalSlotMesh(slot);
        const obstructions = this.collectPortalFrameSlotObstructions(slot);
        const slotPreview = {
          gridX: slot.gridX,
          gridZ: slot.gridZ,
          relY: slot.relY,
          role: 'frame',
          present: false,
          blocked: false,
          ghost: false,
          baseHeight: Number.isFinite(baseHeight) ? baseHeight : null,
          worldLevel: Number.isFinite(worldLevel) ? worldLevel : null,
        };
        if (Array.isArray(obstructions) && obstructions.length) {
          slotPreview.blocked = true;
          slotPreview.reason = this.formatPortalPlacementRejectionMessage(obstructions);
          slotPreview.obstructions = obstructions;
          appendIssue(slotPreview, 'obstructed');
        } else if (mesh?.userData?.blockType === 'stone') {
          slotPreview.present = true;
        } else if (mesh) {
          slotPreview.blocked = true;
          slotPreview.reason = `mismatched-block:${mesh.userData?.blockType ?? 'unknown'}`;
          appendIssue(slotPreview, 'mismatched-block');
        } else {
          slotPreview.ghost = true;
        }
        frameSlots.set(key, slotPreview);

        const stat = ensureColumnStat(slot, baseHeight);
        stat.slots.push(slotPreview);
        if (slot.relY === 0 && Number.isFinite(worldLevel)) {
          stat.foundationLevel = worldLevel;
        } else if (slot.relY === 3 && Number.isFinite(worldLevel)) {
          stat.topLevel = worldLevel;

      const evaluateLevelDistribution = (selector) => {
        const levels = [];
        const buckets = new Map();
        columnStats.forEach((stat) => {
          const level = selector(stat);
          if (!Number.isFinite(level)) {
            return;
          }
          levels.push(level);
          let bucket = buckets.get(level);
          if (!bucket) {
            bucket = { level, stats: [] };
            buckets.set(level, bucket);
          }
          bucket.stats.push(stat);
        });
        if (!levels.length) {
          return {
            uneven: false,
            spread: 0,
            levels: [],
            majorityLevel: null,
            deviatingStats: [],
          };
        }
        const min = Math.min(...levels);
        const max = Math.max(...levels);
        const spread = max - min;
        let majorityLevel = levels[0];
        let majoritySize = 0;
        buckets.forEach((bucket) => {
          if (bucket.stats.length > majoritySize) {
            majorityLevel = bucket.level;
            majoritySize = bucket.stats.length;
          } else if (bucket.stats.length === majoritySize && bucket.level < majorityLevel) {
            majorityLevel = bucket.level;
          }
        });
        const uneven = spread > tolerance;
        let deviatingStats = [];
        if (uneven) {
          buckets.forEach((bucket) => {
            if (Math.abs(bucket.level - majorityLevel) > tolerance) {
              deviatingStats = deviatingStats.concat(bucket.stats);
          });
        }
        const uniqueLevels = Array.from(new Set(levels)).sort((a, b) => a - b);
        return {
          uneven,
          spread,
          levels: uniqueLevels,
          majorityLevel,
          deviatingStats,
        };
      };

      const foundationInfo = evaluateLevelDistribution((stat) => stat.foundationLevel);
      const topInfo = evaluateLevelDistribution((stat) => stat.topLevel);

      const applyLevelIssue = (info, relY, issueTag) => {
        if (!info?.uneven || !Array.isArray(info.deviatingStats) || !info.deviatingStats.length) {
          return;
        }
        info.deviatingStats.forEach((stat) => {
          stat.slots.forEach((slotPreview) => {
            if (!slotPreview || slotPreview.relY !== relY) {
              return;
            const expected = Number.isFinite(info.majorityLevel) ? info.majorityLevel : null;
            const actual = Number.isFinite(slotPreview.worldLevel) ? slotPreview.worldLevel : null;
            const reasonDetail =
              expected !== null && actual !== null
                ? `${issueTag}:${actual}->${expected}`
                : issueTag;
            slotPreview.present = false;
            slotPreview.ghost = false;
            slotPreview.blocked = true;
            appendIssue(slotPreview, issueTag, reasonDetail);
        });
      };

      applyLevelIssue(foundationInfo, 0, 'foundation-unlevel');
      applyLevelIssue(topInfo, 3, 'crown-unlevel');

      let missing = 0;
      let blocked = 0;
      let present = 0;
      frameSlots.forEach((slotPreview) => {
        if (slotPreview.blocked) {
          blocked += 1;
        } else if (slotPreview.present) {
          present += 1;
        } else if (slotPreview.ghost) {
          missing += 1;
      });
      const columnSummaries = [];
        let columnPresent = 0;
        let columnBlocked = 0;
        let columnMissing = 0;
        stat.slots.forEach((slotPreview) => {
          if (slotPreview.blocked) {
            columnBlocked += 1;
          } else if (slotPreview.present) {
            columnPresent += 1;
          } else if (slotPreview.ghost) {
            columnMissing += 1;
          }
        });
        columnSummaries.push({
          gridX: stat.gridX,
          gridZ: stat.gridZ,
          baseHeight: stat.baseHeight,
          foundationLevel: Number.isFinite(stat.foundationLevel) ? stat.foundationLevel : null,
          topLevel: Number.isFinite(stat.topLevel) ? stat.topLevel : null,
          presentSlots: columnPresent,
          blockedSlots: columnBlocked,
          missingSlots: columnMissing,
        });
      });

      const summary = {
        totalFrameSlots: frameSlots.size,
        missingFrameSlots: missing,
        blockedFrameSlots: blocked,
        presentFrameSlots: present,
        unevenFoundation: Boolean(foundationInfo?.uneven),
        unevenTop: Boolean(topInfo?.uneven),
        foundationSpread: foundationInfo?.spread ?? 0,
        topSpread: topInfo?.spread ?? 0,
        foundationLevels: foundationInfo?.levels ?? [],
        topLevels: topInfo?.levels ?? [],
        columnSummaries,
      };

      const messages = [];
      if (summary.unevenFoundation) {
        messages.push('Portal frame base uneven — align the highlighted blocks to form a level 4×3 stone ring.');
      }
      if (summary.unevenTop) {
        messages.push('Portal frame top uneven — ensure the 4×3 stone ring forms a flat rectangle.');
      }
      const hasPlacementBlocks = Array.from(frameSlots.values()).some((slotPreview) => {
        if (!slotPreview.blocked) {
          return false;
        }
        if (!Array.isArray(slotPreview.issues) || !slotPreview.issues.length) {
          return true;
        return slotPreview.issues.some((issue) => issue === 'obstructed' || issue === 'mismatched-block');
      if (hasPlacementBlocks) {
        messages.push('Portal frame placement blocked by incorrect blocks or obstructions.');
      }
      if (missing > 0) {
        messages.push(`Missing ${missing} of ${frameSlots.size} required portal frame blocks.`);
      }
      if (!messages.length) {
        messages.push('Portal frame footprint complete.');
      }

      return {
        frameSlots,
        interiorSlots: new Map(),
        summary,
        messages,
        footprintValid: missing === 0 && blocked === 0,
      };
    }

    buildPortalFramePreview() {
      if (!this.portalMechanics?.buildPortalPlacementPreview) {
        const manualPreview = this.createManualPortalPreview();
        if (manualPreview) {
          this.portalFramePreview = manualPreview;
          this.portalFramePreviewSummary = manualPreview.summary || null;
          this.updatePortalPreviewGhosts(manualPreview);
          return manualPreview;
        }
        this.portalFramePreview = null;
        this.portalFramePreviewSummary = null;
        this.updatePortalPreviewGhosts(null);
        return null;
      }
      if (!this.portalFrameSlots?.size) {
        this.portalFramePreview = null;
        this.portalFramePreviewSummary = null;
        this.updatePortalPreviewGhosts(null);
        return null;
      }
      const anchor = this.portalAnchorGrid || this.computePortalAnchorGrid();
      if (!anchor) {
        this.portalFramePreview = null;
        this.portalFramePreviewSummary = null;
        this.updatePortalPreviewGhosts(null);
        return null;
      }
      const previewPlacements = [];
      this.portalFrameSlots.forEach((slot) => {
        const baseHeight = Number.isFinite(slot.baseHeight)
          ? slot.baseHeight
          : this.initialHeightMap?.[slot.gridX]?.[slot.gridZ] ?? 0;
        const level = baseHeight + slot.relY;
        const mesh = this.getPortalSlotMesh(slot);
        const obstructions = this.collectPortalFrameSlotObstructions(slot);
        const hasObstructions = Array.isArray(obstructions) && obstructions.length > 0;
        if (!mesh && !hasObstructions) {
          return;
        }
        const entry = {
          gridX: slot.gridX,
          gridZ: slot.gridZ,
          level,
        };
        if (mesh) {
          entry.blockType = mesh.userData?.blockType ?? (slot.filled ? 'stone' : null);
        }
        if (hasObstructions) {
          entry.blocked = true;
          entry.reason = this.formatPortalPlacementRejectionMessage(obstructions);
        }
        previewPlacements.push(entry);
      });
      let preview = null;
      try {
        const anchorHeight = this.initialHeightMap?.[anchor.x]?.[anchor.z];
        preview = this.portalMechanics.buildPortalPlacementPreview(
          { x: anchor.x, z: anchor.z, y: anchorHeight },
          {
            placedBlocks: previewPlacements,
            requiredBlockType: 'stone',
            blockSize: BLOCK_SIZE,
            columns: this.columns,
            heightMap: this.heightMap,
            baseHeightMap: this.initialHeightMap,
          },
        );
      } catch (error) {
        console.warn('Portal preview evaluation failed', error);
        preview = null;
      }
      if (preview) {
        this.portalFramePreview = preview;
        this.portalFramePreviewSummary = preview.summary || null;
        this.updatePortalPreviewGhosts(preview);
      } else {
        const manualPreview = this.createManualPortalPreview();
        if (manualPreview) {
          this.portalFramePreview = manualPreview;
          this.portalFramePreviewSummary = manualPreview.summary || null;
          this.updatePortalPreviewGhosts(manualPreview);
          return manualPreview;
        }
        this.portalFramePreview = null;
        this.portalFramePreviewSummary = null;
        this.updatePortalPreviewGhosts(null);
      }
      return preview;
    }

    validatePortalFrameFootprint(filledCount = this.portalBlocksPlaced) {
      if (!this.portalFrameSlots.size) {
        this.portalFramePreview = null;
        this.portalFramePreviewSummary = null;
        this.updatePortalPreviewGhosts(null);
        return { valid: false, message: '', highlightSlots: [] };
      }
      const preview = this.buildPortalFramePreview();
      if (preview) {
        const highlightSlots = [];
        if (preview.frameSlots instanceof Map) {
          preview.frameSlots.forEach((slotPreview) => {
            if (!slotPreview || slotPreview.role !== 'frame') {
            if (slotPreview.blocked || !slotPreview.present) {
              const key = this.getPortalSlotKey(
                slotPreview.gridX,
                slotPreview.gridZ,
                slotPreview.relY,
              );
              const slot = this.portalFrameSlots.get(key);
              if (slot) {
                highlightSlots.push(slot);
              }
        let message = '';
        if (!preview.footprintValid) {
          const summaryMessage = Array.isArray(preview.messages) && preview.messages.length
            ? preview.messages.join(' ')
            : '';
          const base = 'Portal frame must form a level 4×3 stone ring.';
          message = summaryMessage ? `${summaryMessage} ${base}` : base;
        }
        return {
          valid: Boolean(preview.footprintValid),
          message,
          highlightSlots,
          preview,
        };
      const missing = Math.max(0, required - Math.max(0, filledCount));
      const fallbackMessage = missing > 0
        ? `Missing ${missing} of ${required} required portal frame blocks. Portal frame must form a level 4×3 stone ring.`
        : 'Portal frame must form a level 4×3 stone ring.';
      this.portalFramePreview = null;
      this.portalFramePreviewSummary = null;
      this.updatePortalPreviewGhosts(null);
        valid: missing === 0,
        message: fallbackMessage,
        highlightSlots: [],
      const previewSummary = this.portalFramePreviewSummary
        ? {
            totalFrameSlots: this.portalFramePreviewSummary.totalFrameSlots ?? null,
            missingFrameSlots: this.portalFramePreviewSummary.missingFrameSlots ?? null,
            blockedFrameSlots: this.portalFramePreviewSummary.blockedFrameSlots ?? null,
            presentFrameSlots: this.portalFramePreviewSummary.presentFrameSlots ?? null,
          }
        : null;
        previewSummary,
