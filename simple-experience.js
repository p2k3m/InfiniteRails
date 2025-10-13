      this.unbindWebglContextEvents();
      if (this.scene) {
        try {
          disposeObject3D(this.scene);
          if (typeof this.scene.clear === 'function') {
            this.scene.clear();
          }
        } catch (error) {
          if (typeof console !== 'undefined' && typeof console.debug === 'function') {
            console.debug('Failed to dispose scene graph during watchdog reset.', error);
          }
        }
      }
    unbindWebglContextEvents() {
      if (!this.webglEventsBound) {
        this.webglEventsBound = false;
        return;
      }
      const canvas = this.canvas;
      if (canvas) {
        try {
          canvas.removeEventListener('webglcontextlost', this.onWebglContextLost, false);
        } catch (error) {
          if (typeof console !== 'undefined' && typeof console.debug === 'function') {
            console.debug('Failed to remove webglcontextlost listener during watchdog reset.', error);
          }
        }
        try {
          canvas.removeEventListener('webglcontextrestored', this.onWebglContextRestored, false);
        } catch (error) {
          if (typeof console !== 'undefined' && typeof console.debug === 'function') {
            console.debug('Failed to remove webglcontextrestored listener during watchdog reset.', error);
          }
        }
      }
      this.webglEventsBound = false;
    }

