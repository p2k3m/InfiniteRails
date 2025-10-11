      if (Array.isArray(this.zombies)) {
        const anchors = this.zombies.filter((candidate) => candidate && candidate.anchor === true && candidate !== zombie);
        if (anchors.length) {
          anchors.forEach((anchor) => this.removeZombie(anchor));
        }
      }
      if (!Array.isArray(this.zombies)) {
        this.zombies = [];
        return null;
      }
      const zombieGroup = this.zombieGroup ?? null;
      const activeZombies = this.zombies.filter((candidate) => {
        if (!candidate || !candidate.mesh || !candidate.mesh.position) {
          return false;
        }
        if (zombieGroup && candidate.mesh.parent !== zombieGroup) {
          return false;
        }
        return true;
      });
      if (activeZombies.length !== this.zombies.length) {
        this.zombies = activeZombies;
      }
      if (!activeZombies.length) {
        return null;
      }
      for (const zombie of activeZombies) {
    ensureZombieEscortAnchor() {
      const THREE = this.THREE;
      const zombieGroup = this.ensureEntityGroup('zombie');
      if (!THREE || !zombieGroup) {
        return null;
      }
      if (!Array.isArray(this.zombies)) {
        this.zombies = [];
      } else {
        this.zombies = this.zombies.filter(
          (candidate) => candidate && candidate.mesh && candidate.mesh.parent === zombieGroup,
        );
      }
      const existingAnchor = this.zombies.find((candidate) => candidate?.anchor === true);
      if (existingAnchor) {
        return existingAnchor;
      }
      if (!this.isNight()) {
        return null;
      }
      if (!this.zombieGeometry) {
        this.zombieGeometry = new THREE.BoxGeometry(0.9, 1.8, 0.9);
      }
      const baseMaterial = this.materials?.zombie;
      const supportsStandardMaterial =
        THREE && typeof THREE.MeshStandardMaterial === 'function' && !baseMaterial;
      const MaterialClass = supportsStandardMaterial
        ? THREE.MeshStandardMaterial
        : THREE?.MeshBasicMaterial;
      const material = baseMaterial?.clone
        ? baseMaterial.clone()
        : MaterialClass
          ? new MaterialClass(
              supportsStandardMaterial
                ? { color: new THREE.Color('#2e7d32'), roughness: 0.8, metalness: 0.1 }
                : { color: new THREE.Color('#2e7d32') },
            )
          : new THREE.MeshBasicMaterial({ color: new THREE.Color('#2e7d32') });
      if (material?.color?.offsetHSL) {
        material.color.offsetHSL(0, (Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.08);
      }
      const mesh = new THREE.Mesh(this.zombieGeometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const anchorPosition = this.getPlayerWorldPosition(this.tmpVector3);
      const anchorX = Number.isFinite(anchorPosition?.x) ? anchorPosition.x : 0;
      const anchorZ = Number.isFinite(anchorPosition?.z) ? anchorPosition.z : 0;
      const surfaceY = this.sampleGroundHeight(anchorX, anchorZ);
      mesh.position.set(anchorX, surfaceY + 0.9, anchorZ);
      const navChunkKey = this.getChunkKeyForWorldPosition(mesh.position.x, mesh.position.z);
      mesh.userData = {
        ...(mesh.userData || {}),
        chunkKey: navChunkKey ?? null,
        placeholder: true,
        placeholderReason: 'escort-anchor',
      };
      zombieGroup.add(mesh);
      const anchor = {
        id: `zombie-anchor-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        mesh,
        collisionRadius: ZOMBIE_COLLISION_RADIUS,
        speed: 0,
        lastAttack: this.elapsed,
        placeholder: true,
        animation: null,
        navChunkKey: navChunkKey ?? null,
        anchor: true,
        spawnedAt: this.elapsed,
        locomotionWatchdog: {
          x: mesh.position.x ?? 0,
          z: mesh.position.z ?? 0,
          lastProgress: Number.isFinite(this.elapsed) ? this.elapsed : 0,
        },
      };
      this.zombies.push(anchor);
      this.ensureNavigationMeshForActorPosition('zombie', mesh.position.x, mesh.position.z, {
        reason: 'zombie-escort-anchor',
        stage: 'anchor',
        zombieId: anchor.id,
      });
      return anchor;
    }

      if (!Array.isArray(this.zombies)) {
        this.zombies = [];
      } else {
        const zombieGroup = this.zombieGroup ?? null;
        this.zombies = this.zombies.filter(
          (candidate) => candidate && candidate.mesh && (!zombieGroup || candidate.mesh.parent === zombieGroup),
        );
      }
      if (this.isNight() && this.zombies.length === 0) {
        this.ensureZombieEscortAnchor();
      }
            if (target.anchor === true) {
              golem.cooldown = 0.2;
            } else {
              this.removeZombie(target);
              golem.cooldown = 1.1;
              this.score += 0.5;
              this.addScoreBreakdown('combat', 0.5);
              this.updateHud();
              this.audio.play('zombieGroan', { volume: 0.3 });
              this.showHint('Iron golem smashed a zombie!');
              this.scheduleScoreSync('golem-defense');
              if (golem.animation) {
                this.triggerAnimationRigPulse(golem.animation, 'attack', {
                  duration: 0.8,
                  fadeIn: 0.1,
                  fadeOut: 0.25,
                  fallbackState: baseState,
                });
              }
