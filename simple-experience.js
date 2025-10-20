      this.progressiveBootPromise = null;
      this.progressiveBootStage = 'idle';
      this.progressiveSceneSkinPending = false;
      this.progressiveMinimalBackgroundColor = '#0b1728';
      this.progressiveMinimalFogColor = '#131d3b';
      this.pointerHintAutoDismissTimerClear = null;
        this.prepareProgressiveBootstrapState();
        this.applyMinimalSceneSkin();
        this.hideIntro();
        this.updateHud();
        this.renderFrame(performance.now());
        this.buildTerrain({ reason: 'start' });
        this.scheduleProgressiveStart(sessionId);
        this.handleStartFailure(error);
      }
    }

    prepareProgressiveBootstrapState() {
      this.progressiveBootStage = 'preparing';
      this.progressiveSceneSkinPending = false;
      this.progressiveBootPromise = null;
    }

    applyMinimalSceneSkin() {
      const THREE = this.THREE;
      if (!THREE || !this.scene) {
        return;
      }
      const background =
        typeof this.progressiveMinimalBackgroundColor === 'string'
          ? this.progressiveMinimalBackgroundColor
          : '#0b1728';
      const fogColor =
        typeof this.progressiveMinimalFogColor === 'string'
          ? this.progressiveMinimalFogColor
          : background;
      try {
        if (this.scene.background && typeof this.scene.background.set === 'function') {
          this.scene.background.set(background);
        } else {
          this.scene.background = new THREE.Color(background);
        }
        if (this.scene.fog && this.scene.fog.color && typeof this.scene.fog.color.set === 'function') {
          this.scene.fog.color.set(fogColor);
        } else if (typeof THREE.Fog === 'function') {
          this.scene.fog = new THREE.Fog(fogColor, 40, 140);
        }
      } catch (error) {
        if (typeof console !== 'undefined' && typeof console.debug === 'function') {
          console.debug('Failed to apply minimal progressive scene skin.', error);
        }
      }
      this.progressiveSceneSkinPending = true;
      this.progressiveBootStage = 'minimal';
    }

    restoreDimensionSceneSkin() {
      if (!this.scene) {
        return;
      }
      try {
        if (this.scene.background) {
          if (typeof this.scene.background.copy === 'function' && this.daySkyColor) {
            this.scene.background.copy(this.daySkyColor);
          } else if (typeof this.scene.background.set === 'function' && this.daySkyColor) {
            this.scene.background.set(this.daySkyColor);
          }
        } else if (this.THREE && typeof this.THREE.Color === 'function' && this.daySkyColor) {
          this.scene.background = this.daySkyColor.clone ? this.daySkyColor.clone() : new this.THREE.Color(this.daySkyColor);
        }
        if (this.scene.fog && this.scene.fog.color && typeof this.scene.fog.color.copy === 'function' && this.dayFogColor) {
          this.scene.fog.color.copy(this.dayFogColor);
        } else if (
          this.scene.fog &&
          this.scene.fog.color &&
          typeof this.scene.fog.color.set === 'function' &&
          this.dayFogColor
        ) {
          this.scene.fog.color.set(this.dayFogColor);
        }
      } catch (error) {
        if (typeof console !== 'undefined' && typeof console.debug === 'function') {
          console.debug('Failed to restore dimension scene palette after progressive bootstrap.', error);
        }
      }
      this.progressiveSceneSkinPending = false;
    }

    shouldContinueProgressiveBoot(sessionId) {
      return this.started && !this.rendererUnavailable && sessionId === this.activeSessionId;
    }

    waitForProgressiveFrame() {
      const scope = typeof window !== 'undefined' ? window : globalThis;
      const raf = scope && typeof scope.requestAnimationFrame === 'function' ? scope.requestAnimationFrame.bind(scope) : null;
      if (raf) {
        return new Promise((resolve) => {
          raf(() => resolve());
      }
      return Promise.resolve();
    }

    scheduleProgressiveStart(sessionId) {
      this.progressiveBootStage = this.progressiveBootStage === 'minimal' ? 'scheduled' : 'preparing';
      const runBootstrap = () => {
        if (!this.shouldContinueProgressiveBoot(sessionId)) {
          return;
        }
        const bootPromise = this.runProgressiveBootstrap(sessionId);
        this.progressiveBootPromise = bootPromise;
        if (bootPromise && typeof bootPromise.finally === 'function') {
          bootPromise.finally(() => {
            if (this.progressiveBootPromise === bootPromise) {
              this.progressiveBootPromise = null;
            }
      };
      const scope = typeof window !== 'undefined' ? window : globalThis;
      if (scope && typeof scope.requestAnimationFrame === 'function') {
        scope.requestAnimationFrame(() => runBootstrap());
        return;
      }
      if (typeof queueMicrotask === 'function') {
        queueMicrotask(runBootstrap);
        return;
      }
      Promise.resolve().then(runBootstrap);
    }

    async runProgressiveBootstrap(sessionId) {
      if (!this.shouldContinueProgressiveBoot(sessionId)) {
        return;
      }
      try {
        this.progressiveBootStage = 'waiting-frame';
        await this.waitForProgressiveFrame();
        if (!this.shouldContinueProgressiveBoot(sessionId)) {
          return;
        }
        if (this.progressiveSceneSkinPending) {
          this.restoreDimensionSceneSkin();
          try {
            this.updateHud();
          } catch (error) {
            if (typeof console !== 'undefined' && typeof console.debug === 'function') {
              console.debug('HUD refresh failed after restoring scene skin.', error);
            }
          }
        }
        this.progressiveBootStage = 'scene-restored';

        await this.waitForProgressiveFrame();
        if (!this.shouldContinueProgressiveBoot(sessionId)) {
          return;
        }
        try {
          this.revealDimensionIntro(this.dimensionSettings, { duration: 6200, intent: 'arrival' });
        } catch (error) {
          if (typeof console !== 'undefined' && typeof console.debug === 'function') {
            console.debug('Failed to reveal dimension intro during progressive bootstrap.', error);
          }
        }
        try {
          this.refreshCraftingUi();
        } catch (error) {
          if (typeof console !== 'undefined' && typeof console.debug === 'function') {
            console.debug('Crafting UI refresh failed during progressive bootstrap.', error);
          }
        }
        let tutorialShown = false;
        try {
          tutorialShown = this.maybeShowFirstRunTutorial();
        } catch (error) {
          if (typeof console !== 'undefined' && typeof console.debug === 'function') {
            console.debug('First run tutorial presentation failed during progressive bootstrap.', error);
          }
        }
        if (!tutorialShown) {
          try {
            this.showBriefingOverlay();
          } catch (error) {
            if (typeof console !== 'undefined' && typeof console.debug === 'function') {
              console.debug('Briefing overlay presentation failed during progressive bootstrap.', error);
            }
          }
        }
        this.progressiveBootStage = 'ui-layered';

        await this.waitForProgressiveFrame();
        if (!this.shouldContinueProgressiveBoot(sessionId)) {
          return;
        }
        try {
          this.updateHud();
        } catch (error) {
          if (typeof console !== 'undefined' && typeof console.debug === 'function') {
            console.debug('HUD refresh failed after progressive bootstrap.', error);
          }
        }
        this.progressiveBootStage = 'complete';
      } catch (error) {
        this.progressiveBootStage = 'error';
        if (typeof console !== 'undefined' && typeof console.error === 'function') {
          console.error('Progressive bootstrap failed — continuing with core scene.', error);
        }
      }
    }

    handleStartFailure(error, options = {}) {
      const failureMessageRaw =
        options && typeof options.failureMessage === 'string' ? options.failureMessage.trim() : '';
      const failureMessage = failureMessageRaw.length
        ? failureMessageRaw
        : 'Renderer initialisation failed. Check your browser console for details.';
      const stageRaw = options && typeof options.stage === 'string' ? options.stage.trim() : '';
      const stage = stageRaw.length ? stageRaw : 'startup';
      const phaseRaw = options && typeof options.phase === 'string' ? options.phase.trim() : '';
      const phase = phaseRaw.length ? phaseRaw : 'start';
      this.progressiveBootStage = 'error';
      this.progressiveSceneSkinPending = false;
      this.progressiveBootPromise = null;
      this.presentRendererFailure(failureMessage, {
        error,
        stage,
      });
      this.started = false;
      const errorMessage =
        typeof error?.message === 'string' && error.message.trim().length ? error.message.trim() : failureMessage;
      const errorName = typeof error?.name === 'string' && error.name.trim().length ? error.name.trim() : undefined;
      const errorStack = typeof error?.stack === 'string' && error.stack.trim().length ? error.stack.trim() : undefined;
      this.markBootPerformanceFailure(error, errorMessage, phase);
      const worldGenMetrics = this.performanceMetrics?.worldGen;
      const worldGenCompleted = Number.isFinite(worldGenMetrics?.completedAt);
      if (!worldGenCompleted && typeof this.emitGameEvent === 'function') {
        const reasonLabel =
          typeof worldGenMetrics?.reason === 'string' && worldGenMetrics.reason.trim().length
            ? worldGenMetrics.reason.trim()
            : phase;
        const dimensionDetail = (() => {
          const id =
            typeof this.dimensionSettings?.id === 'string' && this.dimensionSettings.id.trim().length
              ? this.dimensionSettings.id.trim()
              : null;
          const name =
            typeof this.dimensionSettings?.name === 'string' && this.dimensionSettings.name.trim().length
              ? this.dimensionSettings.name.trim()
              : null;
          const label =
            typeof this.dimensionSettings?.label === 'string' && this.dimensionSettings.label.trim().length
              ? this.dimensionSettings.label.trim()
              : null;
          return id || name || label ? { id, name, label } : null;
        })();
        this.emitGameEvent('world-generation-complete', {
          reason: reasonLabel,
          error: {
            message: errorMessage,
            name: errorName ?? null,
            stack: errorStack ?? null,
          },
          dimension: dimensionDetail ?? undefined,
      this.emitGameEvent('start-error', {
        message: failureMessage,
        errorMessage,
        errorName,
        stack: errorStack,
        stage,
      });
      this.publishStateSnapshot('start-error');
      this.logEngineBootDiagnostics({ status: 'error', phase, error });
      const clearTimer =
        (typeof this.pointerHintAutoDismissTimerClear === 'function'
          ? this.pointerHintAutoDismissTimerClear
          : null) ||
        ((typeof window !== 'undefined' && typeof window.clearTimeout === 'function'
          ? window.clearTimeout.bind(window)
          : null) || (typeof clearTimeout === 'function' ? clearTimeout : null));
      if (clearTimer) {
        try {
          clearTimer(this.pointerHintAutoDismissTimer);
        } catch (error) {
          if (typeof console !== 'undefined' && typeof console.debug === 'function') {
            console.debug('Failed to clear pointer hint auto-dismiss timer.', error);
          }
        }
      }
      this.pointerHintAutoDismissTimerClear = null;
      const setTimer =
        (scope && typeof scope.setTimeout === 'function' ? scope.setTimeout.bind(scope) : null) ||
        (typeof setTimeout === 'function' ? setTimeout : null);
      const clearTimer =
        (scope && typeof scope.clearTimeout === 'function' ? scope.clearTimeout.bind(scope) : null) ||
        (typeof clearTimeout === 'function' ? clearTimeout : null);
      if (!setTimer) {
        return;
      }
      this.pointerHintAutoDismissTimerClear = clearTimer;
      this.pointerHintAutoDismissTimer = setTimer(() => {
        this.pointerHintAutoDismissTimerClear = null;
