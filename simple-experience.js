        lastPresentedFrame: null,
      state.lastPresentedFrame = null;
      if (!Number.isFinite(infoFrame)) {
      const lastFrame = Number.isFinite(state.lastPresentedFrame) ? state.lastPresentedFrame : null;
      if (lastFrame !== null && infoFrame === lastFrame) {
      state.lastPresentedFrame = infoFrame;
          presentedFrame: infoFrame,
