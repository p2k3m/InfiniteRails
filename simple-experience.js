        stalledFrameCount: 0,
        lastProgressFrame: null,
        lastProgressAt: null,
        this.resetRendererWatchdogProgress();
        this.resetRendererWatchdogProgress();
      state.stalledFrameCount = 0;
      state.lastProgressFrame = null;
      state.lastProgressAt = null;
      if (Number.isFinite(context.stalledFrames)) {
        detail.stalledFrames = context.stalledFrames;
      }
    resetRendererWatchdogProgress() {
      const state = this.rendererWatchdogState;
      if (!state) {
        return;
      }
      state.stalledFrameCount = 0;
      state.lastProgressFrame = null;
      state.lastProgressAt = null;
    }

    evaluateRendererWatchdogProgress(timestamp) {
      const state = this.rendererWatchdogState;
      if (!state || state.enabled === false || state.recovering) {
        return false;
      }
      if (!this.started || this.rendererUnavailable) {
        this.resetRendererWatchdogProgress();
        return false;
      }
      const info = this.renderer?.info;
      const infoFrame = info && info.render && Number.isFinite(info.render.frame) ? info.render.frame : null;
      const counter = Number.isFinite(infoFrame) ? infoFrame : this.renderedFrameCount;
      if (!Number.isFinite(counter)) {
        this.resetRendererWatchdogProgress();
        return false;
      }
      const lastFrame = Number.isFinite(state.lastProgressFrame) ? state.lastProgressFrame : null;
      if (lastFrame !== null && counter === lastFrame) {
        state.stalledFrameCount = (Number.isInteger(state.stalledFrameCount) ? state.stalledFrameCount : 0) + 1;
      } else {
        state.stalledFrameCount = 0;
      }
      state.lastProgressFrame = counter;
      state.lastProgressAt = Number.isFinite(timestamp) ? timestamp : null;
      const frameBudget = Number.isFinite(state.frameBudget) ? Math.max(1, state.frameBudget) : 240;
      if (state.stalledFrameCount >= frameBudget) {
        const detail = {
          reason: 'unresponsive',
          timeoutMs: this.getRendererWatchdogTimeoutMs(),
          armedAt: Number.isFinite(state.lastArmedAt) ? state.lastArmedAt : null,
          stalledFrames: state.stalledFrameCount,
        };
        this.handleRendererWatchdogTimeout(detail);
        return true;
      }
      return false;
    }

      this.resetRendererWatchdogProgress();
      if (Number.isFinite(context?.stalledFrames)) {
        detail.stalledFrames = context.stalledFrames;
      }
        state.stalledFrameCount = 0;
        state.lastProgressFrame = null;
        state.lastProgressAt = null;
        this.resetRendererWatchdogProgress();
        this.resetRendererWatchdogProgress();
        this.resetRendererWatchdogProgress();
      if (this.evaluateRendererWatchdogProgress(timestamp)) {
        return;
      }
