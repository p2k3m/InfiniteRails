      this.controlUiSyncIssueActive = false;
        this.runControlUiSyncCheck({ reason: 'mobile-controls-unavailable' });
        this.runControlUiSyncCheck({ reason: 'touch-controls-deactivated' });
      this.runControlUiSyncCheck({ reason: 'touch-controls-activated' });
    diffKeyBindingMaps(expected = {}, actual = {}) {
      const differences = [];
      const actions = new Set([
        ...Object.keys(expected || {}),
        ...Object.keys(actual || {}),
      ]);
      actions.forEach((action) => {
        const expectedKeys = Array.isArray(expected?.[action]) ? expected[action] : [];
        const actualKeys = Array.isArray(actual?.[action]) ? actual[action] : [];
        if (!this.areKeyListsEqual(expectedKeys, actualKeys)) {
          differences.push({
            action,
            expected: [...expectedKeys],
            actual: [...actualKeys],
          });
        }
      });
      return differences;
    }

    runControlUiSyncCheck(context = {}) {
      const reasonRaw = typeof context?.reason === 'string' ? context.reason.trim() : '';
      const reason = reasonRaw || 'input-mode-switch';
      let controlsMap;
      try {
        controlsMap = getDeclarativeControlMap() || {};
      } catch (error) {
        controlsMap = {};
      }
      const hudMap = cloneKeyBindingMap(this.keyBindings || {});
      const mismatches = [];
      const hudDiff = this.diffKeyBindingMaps(controlsMap, hudMap);
      if (hudDiff.length) {
        mismatches.push({ source: 'controls', target: 'hud', differences: hudDiff });
      }
      let settingsMap = null;
      const settingsApi = typeof window !== 'undefined' ? window.InfiniteRailsControls : null;
      if (settingsApi && typeof settingsApi.get === 'function') {
        try {
          const rawMap = settingsApi.get();
          settingsMap = cloneKeyBindingMap(rawMap || {});
        } catch (error) {
          mismatches.push({
            source: 'controls',
            target: 'settings',
            differences: [],
            error: error?.message || 'settings-get-failed',
          });
        }
      }
      if (settingsMap) {
        const settingsDiff = this.diffKeyBindingMaps(controlsMap, settingsMap);
        if (settingsDiff.length) {
          mismatches.push({ source: 'controls', target: 'settings', differences: settingsDiff });
        }
      }
      if (mismatches.length) {
        this.controlUiSyncIssueActive = true;
        this.recordMajorIssue(
          'Input bindings desynchronised — HUD or settings showing stale controls.',
          {
            scope: 'input-binding-sync',
            code: 'control-ui-sync',
            reason,
            mismatches,
          },
        );
        return false;
      }
      if (this.controlUiSyncIssueActive) {
        this.clearMajorIssues('input-binding-sync');
        this.controlUiSyncIssueActive = false;
      }
      return true;
    }

