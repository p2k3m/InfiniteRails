      const previousPreference = Boolean(this.isTouchPreferred);
      const previousMobileState = Boolean(this.mobileControlsActive);

      const preferenceChanged = previousPreference !== Boolean(this.isTouchPreferred);
      const mobileControlsChanged = previousMobileState !== Boolean(this.mobileControlsActive);
      if (!preferenceChanged && !mobileControlsChanged) {
        return;
      }

      const mode = prefersTouch ? 'touch' : 'pointer';
      this.runControlUiSyncCheck({
        reason: `pointer-preference-change:${mode}`,
        mode,
        source: 'pointer-preference',
        preferenceChanged,
        mobileControlsChanged,
        touchPreferred: Boolean(this.isTouchPreferred),
        mobileControlsActive: Boolean(this.mobileControlsActive),
      });
