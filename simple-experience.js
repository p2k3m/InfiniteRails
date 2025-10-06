      const contextDetail = {};
      if (context && typeof context === 'object') {
        Object.keys(context).forEach((key) => {
          if (key === 'reason') {
            return;
          }
          const value = context[key];
          if (typeof value === 'function') {
            return;
          }
          if (value !== undefined) {
            contextDetail[key] = value;
          }
        });
      }
        const hudSettingsDiff = this.diffKeyBindingMaps(hudMap, settingsMap);
        if (hudSettingsDiff.length) {
          mismatches.push({ source: 'hud', target: 'settings', differences: hudSettingsDiff });
        }
        const detail = {
          scope: 'input-binding-sync',
          code: 'control-ui-sync',
          reason,
          mismatches,
        };
        if (Object.keys(contextDetail).length) {
          detail.context = contextDetail;
        }
          detail,
