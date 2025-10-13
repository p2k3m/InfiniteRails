      const now = Number.isFinite(timestamp) ? timestamp : null;
      const hasProgressed = lastFrame === null || counter !== lastFrame;
      if (hasProgressed) {
        state.stalledFrameCount = 0;
        if (now !== null) {
          state.lastProgressAt = now;
        }
      } else {
      const timeoutMs = this.getRendererWatchdogTimeoutMs();
      const progressElapsed =
        now !== null && Number.isFinite(state.lastProgressAt) ? now - state.lastProgressAt : null;
      const reachedFrameBudget = state.stalledFrameCount >= frameBudget;
      const exceededTimeBudget = Number.isFinite(progressElapsed) && progressElapsed >= timeoutMs;
      if (reachedFrameBudget || exceededTimeBudget) {
          timeoutMs,
        if (Number.isFinite(progressElapsed)) {
          detail.elapsedMs = progressElapsed;
        }
      const elapsedMs = Number.isFinite(context?.elapsedMs) ? context.elapsedMs : null;
      if (elapsedMs !== null) {
        detail.elapsedMs = elapsedMs;
      }
