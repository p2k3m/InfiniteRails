      if (this.scene && typeof this.scene.traverse === 'function') {
        try {
          const disposeMaterial = (material) => {
            if (!material) {
              return;
            }
            const materials = Array.isArray(material) ? material : [material];
            materials.forEach((mat) => {
              if (!mat || typeof mat !== 'object') {
                return;
              }
              try {
                Object.keys(mat).forEach((key) => {
                  const value = mat[key];
                  if (value && typeof value === 'object' && typeof value.dispose === 'function') {
                    if (value.isTexture || value.isWebGLRenderTarget) {
                      value.dispose();
                    }
                  }
                });
                mat.dispose?.();
              } catch (materialError) {
                if (typeof console !== 'undefined' && typeof console.debug === 'function') {
                  console.debug('Failed to dispose material during renderer reset.', materialError);
                }
              }
            });
          };

          const disposeGeometry = (geometry) => {
            if (geometry && typeof geometry.dispose === 'function') {
              try {
                geometry.dispose();
              } catch (geometryError) {
                if (typeof console !== 'undefined' && typeof console.debug === 'function') {
                  console.debug('Failed to dispose geometry during renderer reset.', geometryError);
                }
              }
            }
          };

          this.scene.traverse((node) => {
            if (!node || typeof node !== 'object') {
              return;
            }
            disposeGeometry(node.geometry);
            if (Array.isArray(node.material) || node.material) {
              disposeMaterial(node.material);
            }
          });
        } catch (error) {
          if (typeof console !== 'undefined' && typeof console.debug === 'function') {
            console.debug('Failed to dispose scene graph resources during watchdog reset.', error);
          }
        }
      }
      if (this.scene) {
        try {
          this.scene.clear?.();
        } catch (error) {
          if (typeof console !== 'undefined' && typeof console.debug === 'function') {
            console.debug('Failed to clear scene graph during watchdog reset.', error);
          }
        }
      }
      if (this.worldRoot) {
        try {
          this.worldRoot.clear?.();
        } catch (error) {
          if (typeof console !== 'undefined' && typeof console.debug === 'function') {
            console.debug('Failed to clear world root during watchdog reset.', error);
          }
        }
      }
      this.unbindWebglContextEvents();
    unbindWebglContextEvents() {
      if (!this.canvas || !this.webglEventsBound) {
        return;
      }
      try {
        this.canvas.removeEventListener('webglcontextlost', this.onWebglContextLost, false);
      } catch (error) {
        if (typeof console !== 'undefined' && typeof console.debug === 'function') {
          console.debug('Failed to remove webglcontextlost listener during watchdog reset.', error);
        }
      }
      try {
        this.canvas.removeEventListener('webglcontextrestored', this.onWebglContextRestored, false);
      } catch (error) {
        if (typeof console !== 'undefined' && typeof console.debug === 'function') {
          console.debug('Failed to remove webglcontextrestored listener during watchdog reset.', error);
        }
      }
      this.webglEventsBound = false;
    }

