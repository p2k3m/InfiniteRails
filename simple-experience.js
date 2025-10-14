      const contextTrigger = typeof context?.trigger === 'string' ? context.trigger.trim() : '';
      if (contextTrigger.length > 0) {
        detail.trigger = contextTrigger;
      }
      if (Number.isFinite(context?.stalledFrames)) {
        detail.stalledFrames = context.stalledFrames;
      }
      if (Number.isFinite(context?.elapsedMs)) {
        detail.elapsedMs = context.elapsedMs;
      }
      if (Number.isFinite(context?.armedAt)) {
        detail.armedAt = context.armedAt;
      }
      if (Number.isFinite(context?.triggeredAt)) {
        detail.triggeredAt = context.triggeredAt;
      }
