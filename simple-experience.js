      this.progressiveBootstrapEnabled = options.progressiveBootstrap !== false;
      this.progressiveBootstrapToken = null;
      this.progressiveBootstrapPromise = null;
    createProgressiveBootstrapToken(sessionId) {
      const token = { sessionId, cancelled: false };
      this.progressiveBootstrapToken = token;
      return token;
    }

    cancelProgressiveBootstrap(reason = 'manual') {
      const token = this.progressiveBootstrapToken;
      if (token) {
        token.cancelled = true;
        token.reason = typeof reason === 'string' && reason.trim().length ? reason.trim() : 'manual';
      }
    }

    async yieldForProgressiveBootstrap(minimumDelayMs = 16) {
      const delay = Number.isFinite(minimumDelayMs) ? Math.max(0, minimumDelayMs) : 0;
      const scope =
        (typeof window !== 'undefined' && window) ||
        (typeof globalThis !== 'undefined' && globalThis) ||
        null;
      const raf = scope?.requestAnimationFrame ?? (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : null);
      const setTimer = scope?.setTimeout ?? (typeof setTimeout === 'function' ? setTimeout : null);
      await new Promise((resolve) => {
        if (raf) {
          raf(() => {
            if (delay > 0 && setTimer) {
              setTimer(resolve, delay);
            } else {
              resolve();
            }
          });
          return;
        }
        if (setTimer) {
          setTimer(resolve, Math.max(delay, 16));
          return;
        }
        resolve();
      });
    }

    handleStartFailure(error, failureMessage = 'Renderer initialisation failed. Check your browser console for details.') {
      const message =
        typeof failureMessage === 'string' && failureMessage.trim().length
          ? failureMessage.trim()
          : 'Renderer initialisation failed. Check your browser console for details.';
      this.presentRendererFailure(message, { error });
      this.started = false;
      const errorMessage =
        typeof error?.message === 'string' && error.message.trim().length ? error.message.trim() : message;
      const errorName = typeof error?.name === 'string' && error.name.trim().length ? error.name.trim() : undefined;
      const errorStack = typeof error?.stack === 'string' && error.stack.trim().length ? error.stack.trim() : undefined;
      this.markBootPerformanceFailure(error, errorMessage, 'start');
      const worldGenMetrics = this.performanceMetrics?.worldGen;
      const worldGenCompleted = Number.isFinite(worldGenMetrics?.completedAt);
      if (!worldGenCompleted && typeof this.emitGameEvent === 'function') {
        const reasonLabel =
          typeof worldGenMetrics?.reason === 'string' && worldGenMetrics.reason.trim().length
            ? worldGenMetrics.reason.trim()
            : 'start';
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
        });
      }
      this.emitGameEvent('start-error', {
        message,
        errorMessage,
        errorName,
        stack: errorStack,
        stage: 'startup',
      });
      this.publishStateSnapshot('start-error');
      this.logEngineBootDiagnostics({ status: 'error', phase: 'start', error });
    }

    async runProgressiveBootstrap(sessionId, token) {
      const ensureActive = () => {
        if (
          !this.started ||
          this.rendererUnavailable ||
          this.activeSessionId !== sessionId ||
          !token ||
          token.cancelled
        ) {
          const cancellationError = new Error('Progressive bootstrap cancelled.');
          cancellationError.code = 'progressive-bootstrap-cancelled';
          throw cancellationError;
        }
      };

      try {
        ensureActive();
        await this.yieldForProgressiveBootstrap(16);
        ensureActive();
        this.buildTerrain();
        this.populateSceneAfterTerrain({ reason: 'start' });

        ensureActive();
        await this.yieldForProgressiveBootstrap(24);
        ensureActive();
        this.buildRails();
        this.refreshPortalState();
        this.attachPlayerToSimulation();
        this.evaluateBossChallenge();

        ensureActive();
        await this.yieldForProgressiveBootstrap(24);
        ensureActive();
        this.bindEvents();
        this.initializeMobileControls();
        this.updatePointerHintForInputMode();
        this.showDesktopPointerTutorialHint();
        this.updateHud();
        this.revealDimensionIntro(this.dimensionSettings, { duration: 6200, intent: 'arrival' });
        this.refreshCraftingUi();

        ensureActive();
        const tutorialShown = this.maybeShowFirstRunTutorial();
        if (!tutorialShown) {
          this.showBriefingOverlay();
        }
        ensureActive();
        this.autoCaptureLocation({ updateOnFailure: true }).catch((locationError) => {
          if (typeof console !== 'undefined' && typeof console.warn === 'function') {
            console.warn('Location capture failed', locationError);
          }
        });
        this.updateLocalScoreEntry('start');
        this.loadScoreboard();
        this.exposeDebugInterface();

        ensureActive();
        this.emitGameEvent('started', { summary: this.createRunSummary('start') });
        this.publishStateSnapshot('started');
        this.markBootPerformanceSuccess('start');
        this.logEngineBootDiagnostics({ status: 'success', phase: 'start' });
        this.lastStatePublish = 0;
      } catch (error) {
        if (error?.code === 'progressive-bootstrap-cancelled') {
          return;
        }
        this.handleStartFailure(error);
      }
    }

      this.cancelProgressiveBootstrap('restart');
      const progressiveEnabled = this.progressiveBootstrapEnabled !== false;
        this.updateHud();
        if (progressiveEnabled) {
          this.renderFrame(performance.now());
        } else {
          this.buildTerrain();
          this.populateSceneAfterTerrain({ reason: 'start' });
          this.buildRails();
          this.refreshPortalState();
          this.attachPlayerToSimulation();
          this.evaluateBossChallenge();
          this.bindEvents();
          this.initializeMobileControls();
          this.updatePointerHintForInputMode();
          this.showDesktopPointerTutorialHint();
          this.updateHud();
          this.revealDimensionIntro(this.dimensionSettings, { duration: 6200, intent: 'arrival' });
          this.refreshCraftingUi();
          const tutorialShown = this.maybeShowFirstRunTutorial();
          if (!tutorialShown) {
            this.showBriefingOverlay();
          }
          this.autoCaptureLocation({ updateOnFailure: true }).catch((error) => {
            if (typeof console !== 'undefined' && typeof console.warn === 'function') {
              console.warn('Location capture failed', error);
            }
          this.updateLocalScoreEntry('start');
          this.loadScoreboard();
          this.exposeDebugInterface();
          this.renderFrame(performance.now());
          this.emitGameEvent('started', { summary: this.createRunSummary('start') });
          this.publishStateSnapshot('started');
          this.markBootPerformanceSuccess('start');
          this.logEngineBootDiagnostics({ status: 'success', phase: 'start' });
          this.lastStatePublish = 0;
      } catch (error) {
        this.handleStartFailure(error);
        return;
      }
      if (!progressiveEnabled) {
        return;
      const token = this.createProgressiveBootstrapToken(sessionId);
      const promise = this.runProgressiveBootstrap(sessionId, token);
      this.progressiveBootstrapPromise = promise;
      promise.finally(() => {
        if (this.progressiveBootstrapToken === token) {
          this.progressiveBootstrapToken = null;
        }
        if (this.progressiveBootstrapPromise === promise) {
          this.progressiveBootstrapPromise = null;
        }
      });
      this.cancelProgressiveBootstrap('stop');
  function resolveProgressiveBootstrapEnabled(options = {}) {
    if (options && Object.prototype.hasOwnProperty.call(options, 'progressiveBootstrap')) {
      return options.progressiveBootstrap !== false;
    }
    const automationDetected = Boolean(
      (typeof navigator !== 'undefined' && navigator?.webdriver === true) ||
        (typeof globalThis !== 'undefined' &&
          globalThis?.__SIMPLE_EXPERIENCE_PROGRESSIVE_BOOTSTRAP__ === false) ||
        (typeof globalThis !== 'undefined' && globalThis?.__vitest_worker__) ||
        (typeof process !== 'undefined' && typeof process?.env === 'object' && process.env?.VITEST) ||
        (typeof process !== 'undefined' && typeof process.versions === 'object' && process.versions?.node)
    );
    return !automationDetected;
  }

    const baseOptions = options && typeof options === 'object' ? options : {};
    const progressiveBootstrapEnabled = resolveProgressiveBootstrapEnabled(baseOptions);
    const mergedOptions = { ...baseOptions, progressiveBootstrap: progressiveBootstrapEnabled };
    const experience = new SimpleExperience(mergedOptions);
