    applyDimensionPluginResources(resources, detail) {
      try {
        applyDimensionPluginResources(resources, detail);
      } catch (error) {
        if (typeof console !== 'undefined' && typeof console.error === 'function') {
          console.error('Failed to apply dimension plugin resources via public API.', error);
        }
        throw error;
      }
      return dimensionPluginState.lastApplied;
    },
