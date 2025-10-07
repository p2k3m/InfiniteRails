      this.lastControlUiSyncContext = null;
      this.lastControlUiSyncSnapshots = null;
        const rawControlsMap = getDeclarativeControlMap() || {};
        controlsMap = normaliseKeyBindingMap(rawControlsMap) || {};
      const hudMap = normaliseKeyBindingMap(this.keyBindings) || {};
      let settingsAvailable = false;
          settingsMap = normaliseKeyBindingMap(rawMap) || {};
          settingsAvailable = true;
      if (settingsAvailable) {
      const snapshots = {
        controls: freezeKeyBindingMap(controlsMap),
        hud: freezeKeyBindingMap(hudMap),
      };
      if (settingsAvailable) {
        snapshots.settings = freezeKeyBindingMap(settingsMap);
      }
      this.lastControlUiSyncSnapshots = Object.freeze(snapshots);
      const safeContextDetail = Object.keys(contextDetail).length ? { ...contextDetail } : null;
      const contextSnapshot = safeContextDetail ? Object.freeze({ ...safeContextDetail }) : null;
      this.lastControlUiSyncContext = Object.freeze(
        safeContextDetail ? { reason, ...safeContextDetail } : { reason },
      );
        if (contextSnapshot) {
          detail.context = contextSnapshot;
        detail.snapshots = this.lastControlUiSyncSnapshots;
