      this.webglContextMode = null;
      this.webglFallbackContextUsed = false;
        this.webglContextMode = null;
        this.webglFallbackContextUsed = false;
      const attributeCandidates = [
        { failIfMajorPerformanceCaveat: true, powerPreference: 'high-performance' },
        { powerPreference: 'high-performance' },
        {},
      ];
      const contextOrder = ['webgl2', 'webgl', 'experimental-webgl'];
      const probe = document.createElement('canvas');
      const acquireContext = (type) => {
        if (!probe || typeof probe.getContext !== 'function') {
          return null;
        }
          try {
            const context = probe.getContext(type, attributes);
            if (context) {
              return { context, type };
            }
          } catch (error) {
            if (typeof scope?.console?.debug === 'function') {
              scope.console.debug(`WebGL probe failed for context "${type}".`, error);
            }
        return null;
      };
      let acquired = null;
      for (const type of contextOrder) {
        acquired = acquireContext(type);
        if (acquired) {
          break;
      }
      if (acquired && acquired.context) {
        const { context, type } = acquired;
        this.webglContextMode = type;
        this.webglFallbackContextUsed = type !== 'webgl2';
          if (type === 'webgl2') {
            console.info('WebGL2 probe succeeded.');
          } else {
            console.info(`WebGL probe succeeded using fallback context "${type}".`);
          }
      this.webglContextMode = null;
      this.webglFallbackContextUsed = false;
      const error = new Error('WebGL support is unavailable.');
      error.name = 'WebGLContextUnavailable';
      const message =
        'WebGL support is required to explore the realms. Update your browser or enable hardware acceleration.';
      this.emitGameEvent('initialisation-error', {
        stage: 'webgl2-probe',
        reason: 'webgl2-unavailable',
        message,
        errorName: error.name,
        errorMessage: error.message,
      });
      this.presentRendererFailure(message, {
        stage: 'webgl2-probe',
        reason: 'webgl2-unavailable',
        error,
      });
      return false;
