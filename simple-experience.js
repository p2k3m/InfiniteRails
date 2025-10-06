      this.onInputModeChange = this.handleInputModeChange.bind(this);
    handleInputModeChange(event) {
      const rawDetail =
        event && typeof event === 'object' && event !== null ? event.detail || event : {};
      let modeCandidate = '';
      if (typeof rawDetail === 'string') {
        modeCandidate = rawDetail;
      } else if (typeof rawDetail?.mode === 'string') {
        modeCandidate = rawDetail.mode;
      } else if (typeof rawDetail?.inputMode === 'string') {
        modeCandidate = rawDetail.inputMode;
      } else if (typeof event === 'string') {
        modeCandidate = event;
      }

      const normaliseModeValue = (value) => {
        const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
        if (!raw) {
          return '';
        }
        if (raw === 'touch' || raw === 'mobile' || raw === 'coarse') {
          return 'touch';
        }
        return 'pointer';
      };

      const normalisedMode = normaliseModeValue(modeCandidate);
      const previousPreference = Boolean(this.isTouchPreferred);
      const previousMobileState = Boolean(this.mobileControlsActive);

      if (normalisedMode) {
        this.isTouchPreferred = normalisedMode === 'touch';
      }

      if (normalisedMode === 'touch') {
        if (!this.mobileControlsActive || !previousPreference) {
          this.initializeMobileControls();
        }
      } else if (normalisedMode === 'pointer') {
        if (this.mobileControlsActive || previousPreference) {
          this.initializeMobileControls();
        }
      }

      this.updatePointerHintForInputMode();
      if (typeof this.refreshFirstRunTutorialContent === 'function') {
        this.refreshFirstRunTutorialContent();
      }

      const preferenceChanged = previousPreference !== Boolean(this.isTouchPreferred);
      const mobileControlsChanged = previousMobileState !== Boolean(this.mobileControlsActive);
      const sourceRaw =
        rawDetail && typeof rawDetail.source === 'string' ? rawDetail.source.trim() : '';
      const reason = normalisedMode ? `input-mode-change:${normalisedMode}` : 'input-mode-change';

      this.runControlUiSyncCheck({
        reason,
        mode: normalisedMode || null,
        source: sourceRaw || null,
        preferenceChanged,
        mobileControlsChanged,
        touchPreferred: Boolean(this.isTouchPreferred),
        mobileControlsActive: Boolean(this.mobileControlsActive),
      });

      return normalisedMode || null;
    }

      add(document, 'infinite-rails:input-mode-change', this.onInputModeChange, 'synchronising input mode state');
