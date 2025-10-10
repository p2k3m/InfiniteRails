      this.portalFallbackGeometry = null;
    createPortalFallbackFlashMesh(theme) {
      const THREE = this.THREE;
      if (!THREE) {
        return null;
      }
      if (!this.portalFallbackGeometry) {
        this.portalFallbackGeometry = new THREE.PlaneGeometry(2.4, 3.2);
      }
      const palette = theme?.palette ?? {};
      const baseHex = palette.rails || '#7f5af0';
      const flashHex = palette.grass || '#2cb67d';
      const material = new THREE.MeshBasicMaterial({
        color: baseHex,
        transparent: true,
        opacity: 0.65,
        side: THREE.DoubleSide,
        toneMapped: false,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this.portalFallbackGeometry, material);
      mesh.renderOrder = 2;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.userData = {
        ...(mesh.userData || {}),
        placeholder: true,
        placeholderKey: 'portal-core',
        placeholderReason: 'shader-fallback',
        placeholderSource: 'portal-placeholder',
        portalFallbackFlash: {
          material,
          baseColor: new THREE.Color(baseHex),
          flashColor: new THREE.Color(flashHex),
          workingColor: new THREE.Color(baseHex),
          minOpacity: 0.45,
          maxOpacity: 0.85,
        },
      };
      return mesh;
    }

        let placeholder = null;
        if (this.portalShaderFallbackActive && typeof this.createPortalFallbackFlashMesh === 'function') {
          placeholder = this.createPortalFallbackFlashMesh(this.dimensionSettings || null);
        }
        if (!placeholder) {
          placeholder = this.createPortalPlaceholderMesh(this.dimensionSettings || null);
        }
      const fallbackFlash = this.portalMesh.userData?.portalFallbackFlash;
      if (fallbackFlash?.material) {
        this.portalFallbackPulse = (this.portalFallbackPulse || 0) + delta;
        const flashTime = this.portalFallbackPulse * 4.2;
        const mix = 0.5 + Math.sin(flashTime) * 0.5;
        const opacityWave = 0.5 + Math.sin(flashTime * 0.75 + Math.PI / 3) * 0.5;
        const workingColor = fallbackFlash.workingColor || fallbackFlash.baseColor?.clone();
        if (workingColor && fallbackFlash.baseColor && fallbackFlash.flashColor) {
          workingColor.copy(fallbackFlash.baseColor);
          workingColor.lerp(fallbackFlash.flashColor, Math.min(1, Math.max(0, mix)));
          fallbackFlash.material.color.copy(workingColor);
          fallbackFlash.workingColor = workingColor;
        }
        if (typeof fallbackFlash.material.opacity === 'number') {
          const minOpacity = Number.isFinite(fallbackFlash.minOpacity) ? fallbackFlash.minOpacity : 0.4;
          const maxOpacity = Number.isFinite(fallbackFlash.maxOpacity) ? fallbackFlash.maxOpacity : 0.9;
          const opacityRange = Math.max(0, maxOpacity - minOpacity);
          fallbackFlash.material.opacity = minOpacity + opacityRange * Math.min(1, Math.max(0, opacityWave));
        }
        return;
      }
