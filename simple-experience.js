      this.progressiveBootstrapPromise = null;
        this.updateHud({ reason: 'bootstrap-minimal' });
        this.hideIntro();
        const now =
          typeof performance !== 'undefined' && typeof performance.now === 'function'
            ? performance.now()
            : Date.now();
        this.renderFrame(now);
        this.publishStateSnapshot('booting');
        this.scheduleProgressiveSceneBootstrap(sessionId);
      } catch (error) {
        this.handleStartFailure(error, { stage: 'startup-sync' });
      }
    }

    scheduleProgressiveSceneBootstrap(sessionId) {
      const promise = this.runProgressiveSceneBootstrap(sessionId);
      this.progressiveBootstrapPromise = promise;
      if (promise && typeof promise.finally === 'function') {
        promise.finally(() => {
          if (this.progressiveBootstrapPromise === promise) {
            this.progressiveBootstrapPromise = null;
          }
        });
      }
      return promise;
    }

    async runProgressiveSceneBootstrap(sessionId) {
      const ensureActive = () =>
        sessionId === this.activeSessionId && this.started && !this.rendererUnavailable;
      const waitAndCheck = async (minimumDelayMs = 16) => {
        await this.waitForBootstrapFrame(minimumDelayMs);
        return ensureActive();
      };

      try {
        if (!(await waitAndCheck(32))) {
          return;
        }

        if (!(await waitAndCheck(16))) {
          return;
        }

        if (!(await waitAndCheck(16))) {
          return;
        }

        if (!(await waitAndCheck(16))) {
          return;
        }
        this.updateHud({ reason: 'bootstrap-complete' });

        if (!(await waitAndCheck(16))) {
          return;
        }


        if (this.animationFrame === null) {
          const now =
            typeof performance !== 'undefined' && typeof performance.now === 'function'
              ? performance.now()
              : Date.now();
          this.renderFrame(now);
        }

        if (!ensureActive()) {
          return;
        }
        if (!ensureActive()) {
          return;
        this.handleStartFailure(error, { stage: 'progressive-bootstrap' });
      }
    }

    handleStartFailure(error, context = {}) {
      const failureMessage =
        typeof context?.message === 'string' && context.message.trim().length
          ? context.message.trim()
          : 'Renderer initialisation failed. Check your browser console for details.';
      const stageLabel =
        typeof context?.stage === 'string' && context.stage.trim().length
          ? context.stage.trim()
          : 'startup';
      const shouldPresent = context?.presentFailure !== false;
      if (shouldPresent) {
        this.presentRendererFailure(failureMessage, { error, stage: stageLabel });
      }
      this.started = false;
      const errorMessage =
        typeof error?.message === 'string' && error.message.trim().length
          ? error.message.trim()
          : failureMessage;
      const errorName =
        typeof error?.name === 'string' && error.name.trim().length ? error.name.trim() : undefined;
      const errorStack =
        typeof error?.stack === 'string' && error.stack.trim().length ? error.stack.trim() : undefined;
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
      this.emitGameEvent('start-error', {
        message: failureMessage,
        errorMessage,
        errorName,
        stack: errorStack,
        stage: stageLabel,
      });
      this.publishStateSnapshot('start-error');
      this.logEngineBootDiagnostics({ status: 'error', phase: 'start', error });
    waitForBootstrapFrame(minimumDelayMs = 16) {
      const runtime =
        (typeof window !== 'undefined' ? window : null) ||
        runtimeScope ||
        (typeof globalThis !== 'undefined' ? globalThis : null);
      const timeoutMs = Number.isFinite(minimumDelayMs)
        ? Math.max(0, Math.floor(minimumDelayMs))
        : 16;
      const requestFrame =
        runtime?.requestAnimationFrame ||
        (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : null);
      const cancelFrame =
        runtime?.cancelAnimationFrame ||
        (typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : null);
      const scheduleTimeout =
        runtime?.setTimeout || (typeof setTimeout === 'function' ? setTimeout : null);
      const clearTimeoutFn =
        runtime?.clearTimeout || (typeof clearTimeout === 'function' ? clearTimeout : null);
      return new Promise((resolve) => {
        let resolved = false;
        let timerId = null;
        let rafId = null;
        const finalize = () => {
          if (resolved) {
            return;
          }
          resolved = true;
          if (timerId !== null && typeof clearTimeoutFn === 'function') {
            try {
              clearTimeoutFn(timerId);
            } catch (error) {}
            timerId = null;
          }
          if (rafId !== null && typeof cancelFrame === 'function') {
            try {
              cancelFrame(rafId);
            } catch (error) {}
            rafId = null;
          }
          resolve();
        };
        if (typeof requestFrame === 'function') {
          try {
            rafId = requestFrame(() => {
              rafId = null;
              finalize();
            });
          } catch (error) {
            rafId = null;
          }
        }
        const timeoutImpl = typeof scheduleTimeout === 'function' ? scheduleTimeout : null;
        if (timeoutImpl) {
          try {
            timerId = timeoutImpl(() => {
              timerId = null;
              finalize();
            }, timeoutMs);
          } catch (error) {
            timerId = null;
          }
        } else if (rafId === null) {
          finalize();
        }
      });
    }

