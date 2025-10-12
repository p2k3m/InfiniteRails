      const watchdogFrameBudget = Number.isFinite(options.rendererWatchdogFrameBudget)
        ? Math.max(30, Math.floor(options.rendererWatchdogFrameBudget))
        : 240;
      const watchdogTargetFps = Number.isFinite(options.rendererWatchdogTargetFps)
        ? Math.max(15, Math.min(120, Math.floor(options.rendererWatchdogTargetFps)))
        : 60;
      this.rendererWatchdogState = {
        enabled: options.rendererWatchdog !== false,
        frameBudget: watchdogFrameBudget,
        targetFps: watchdogTargetFps,
        handle: null,
        lastArmedAt: 0,
        recovering: false,
        lastTriggerContext: null,
      };
      this.disarmRendererWatchdog();
      if (!this.started) {
        this.disarmRendererWatchdog();
        return;
      }
        this.disarmRendererWatchdog();
      const armedAt =
        typeof this.getHighResTimestamp === 'function'
          ? this.getHighResTimestamp()
          : typeof performance !== 'undefined' && typeof performance.now === 'function'
            ? performance.now()
            : Date.now();
      this.armRendererWatchdog(armedAt);
      this.disarmRendererWatchdog();
      if (!this.started) {
        this.disarmRendererWatchdog();
        this.animationFrame = null;
        this.resetFrameStats(0);
        return;
      }
        this.disarmRendererWatchdog();
        this.disarmRendererWatchdog();
    getRendererWatchdogTimeoutMs() {
      const state = this.rendererWatchdogState || {};
      const frameBudget = Number.isFinite(state.frameBudget) ? Math.max(1, state.frameBudget) : 240;
      const targetFps = Number.isFinite(state.targetFps) ? Math.max(1, state.targetFps) : 60;
      const interval = Math.round((frameBudget * 1000) / targetFps);
      return Math.max(250, interval);
    }

    disarmRendererWatchdog() {
      const state = this.rendererWatchdogState;
      if (!state) {
        return;
      }
      const scope = typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null;
      const clearFn = scope?.clearTimeout ?? (typeof clearTimeout === 'function' ? clearTimeout : null);
      if (state.handle && clearFn) {
        try {
          clearFn(state.handle);
        } catch (error) {
          if (typeof console !== 'undefined' && typeof console.debug === 'function') {
            console.debug('Failed to clear renderer watchdog timer.', error);
          }
        }
      }
      state.handle = null;
    }

    armRendererWatchdog(timestamp) {
      const state = this.rendererWatchdogState;
      if (!state || state.enabled === false) {
        return;
      }
      if (!this.started || this.rendererUnavailable || state.recovering) {
        this.disarmRendererWatchdog();
        return;
      }
      const scope = typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null;
      const setFn = scope?.setTimeout ?? (typeof setTimeout === 'function' ? setTimeout : null);
      const clearFn = scope?.clearTimeout ?? (typeof clearTimeout === 'function' ? clearTimeout : null);
      if (!setFn) {
        return;
      }
      if (state.handle && clearFn) {
        try {
          clearFn(state.handle);
        } catch (error) {
          if (typeof console !== 'undefined' && typeof console.debug === 'function') {
            console.debug('Failed to clear renderer watchdog timer before rearming.', error);
          }
        }
        state.handle = null;
      }
      const timeoutMs = this.getRendererWatchdogTimeoutMs();
      const armedAt = Number.isFinite(timestamp)
        ? timestamp
        : typeof this.getHighResTimestamp === 'function'
          ? this.getHighResTimestamp()
          : typeof performance !== 'undefined' && typeof performance.now === 'function'
            ? performance.now()
            : Date.now();
      state.lastArmedAt = armedAt;
      state.handle = setFn(() => {
        state.handle = null;
        this.handleRendererWatchdogTimeout({ reason: 'stall', timeoutMs, armedAt });
      }, timeoutMs);
    }

    handleRendererWatchdogTimeout(context = {}) {
      const state = this.rendererWatchdogState;
      if (!state || state.recovering) {
        return;
      }
      if (!this.started || this.rendererUnavailable) {
        return;
      }
      state.recovering = true;
      state.lastTriggerContext = context && typeof context === 'object' ? { ...context } : null;
      const triggerTimestamp =
        typeof this.getHighResTimestamp === 'function'
          ? this.getHighResTimestamp()
          : typeof performance !== 'undefined' && typeof performance.now === 'function'
            ? performance.now()
            : Date.now();
      const reasonRaw = typeof context.reason === 'string' ? context.reason.trim() : '';
      const detail = {
        reason: reasonRaw.length ? reasonRaw : 'stall',
        timeoutMs: Number.isFinite(context.timeoutMs) ? context.timeoutMs : this.getRendererWatchdogTimeoutMs(),
        armedAt: Number.isFinite(context.armedAt) ? context.armedAt : state.lastArmedAt ?? null,
        triggeredAt: triggerTimestamp,
        frames: Number.isFinite(state.frameBudget) ? state.frameBudget : null,
        stage: 'render-loop',
      };
      if (typeof console !== 'undefined' && typeof console.warn === 'function') {
        try {
          console.warn('Renderer watchdog detected stalled frames — attempting renderer reset.', detail);
        } catch (error) {
          // Ignore console failures in restricted environments.
        }
      }
      try {
        this.emitGameEvent('renderer-watchdog', detail);
      } catch (error) {
        if (typeof console !== 'undefined' && typeof console.debug === 'function') {
          console.debug('Failed to emit renderer watchdog event.', error);
        }
      }
      if (typeof logDiagnosticsEvent === 'function') {
        try {
          logDiagnosticsEvent('renderer', 'Renderer watchdog detected stalled frames.', {
            level: 'warning',
            detail,
          });
        } catch (error) {
          if (typeof console !== 'undefined' && typeof console.debug === 'function') {
            console.debug('Renderer watchdog diagnostics logging failed.', error);
          }
        }
      }
      const success = this.resetRendererSceneGraph('renderer-watchdog', detail);
      if (!success) {
        state.recovering = false;
      }
    }

    disposeRendererSceneGraph() {
      if (this.renderer) {
        try {
          this.renderer.renderLists?.dispose?.();
        } catch (error) {
          if (typeof console !== 'undefined' && typeof console.debug === 'function') {
            console.debug('Failed to dispose renderer lists during watchdog reset.', error);
          }
        }
        try {
          this.renderer.dispose?.();
        } catch (error) {
          if (typeof console !== 'undefined' && typeof console.debug === 'function') {
            console.debug('Failed to dispose renderer during watchdog reset.', error);
          }
        }
        try {
          const context = typeof this.renderer.getContext === 'function' ? this.renderer.getContext() : null;
          const loseContext =
            context && typeof context.getExtension === 'function' ? context.getExtension('WEBGL_lose_context') : null;
          loseContext?.loseContext?.();
        } catch (error) {
          if (typeof console !== 'undefined' && typeof console.debug === 'function') {
            console.debug('Failed to lose WebGL context during watchdog reset.', error);
          }
        }
      }
      this.renderer = null;
      this.scene = null;
      this.worldRoot = null;
      this.camera = null;
      this.cameraBoom = null;
      this.playerRig = null;
      this.terrainGroup = null;
      this.railsGroup = null;
      this.portalGroup = null;
      this.zombieGroup = null;
      this.golemGroup = null;
      this.chestGroup = null;
      this.challengeGroup = null;
      this.webglEventsBound = false;
    }

    resetRendererSceneGraph(reason = 'renderer-watchdog', context = {}) {
      const state = this.rendererWatchdogState || null;
      this.disarmRendererWatchdog();
      if (this.animationFrame !== null) {
        try {
          cancelAnimationFrame(this.animationFrame);
        } catch (error) {
          if (typeof console !== 'undefined' && typeof console.debug === 'function') {
            console.debug('Failed to cancel animation frame during renderer reset.', error);
          }
        }
        this.animationFrame = null;
      }
      try {
        this.stop();
      } catch (error) {
        if (typeof console !== 'undefined' && typeof console.debug === 'function') {
          console.debug('Renderer watchdog stop routine failed.', error);
        }
      }
      try {
        this.disposeRendererSceneGraph();
      } catch (error) {
        if (typeof console !== 'undefined' && typeof console.debug === 'function') {
          console.debug('Renderer watchdog dispose routine failed.', error);
        }
      }
      this.rendererUnavailable = false;
      this.contextLost = false;
      this.prevTime = null;
      this.renderAccumulator = 0;
      this.renderedFrameCount = 0;
      this.resetFrameStats(0);
      this.blankFrameDetectionState = {
        enabled: true,
        samples: 0,
        clearFrameMatches: 0,
        triggered: false,
      };
      let success = false;
      let failureError = null;
      try {
        this.start();
        success = true;
      } catch (error) {
        failureError = error instanceof Error ? error : new Error(String(error));
        if (typeof console !== 'undefined' && typeof console.error === 'function') {
          console.error('Renderer watchdog recovery failed.', failureError);
        }
        this.presentRendererFailure('Renderer recovery failed. Reload the page to continue your run.', {
          stage: 'watchdog-reset',
          reason,
          error: failureError,
        });
      }
      const detail = {
        reason,
        success,
        frames: Number.isFinite(state?.frameBudget) ? state.frameBudget : null,
        timeoutMs: Number.isFinite(context?.timeoutMs) ? context.timeoutMs : this.getRendererWatchdogTimeoutMs(),
      };
      if (!success && failureError) {
        detail.error = failureError;
      }
      try {
        this.emitGameEvent('renderer-watchdog-reset', detail);
      } catch (error) {
        if (typeof console !== 'undefined' && typeof console.debug === 'function') {
          console.debug('Failed to emit renderer watchdog reset event.', error);
        }
      }
      if (success) {
        try {
          this.publishStateSnapshot('renderer-watchdog-reset');
        } catch (error) {
          if (typeof console !== 'undefined' && typeof console.debug === 'function') {
            console.debug('Failed to publish renderer watchdog reset snapshot.', error);
          }
        }
      }
      if (state) {
        state.recovering = false;
        state.handle = null;
        state.lastArmedAt = 0;
        state.lastTriggerContext = { ...context, reason };
      }
      return success;
    }

        this.disarmRendererWatchdog();
      this.disarmRendererWatchdog();
