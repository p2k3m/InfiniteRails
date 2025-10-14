        this.handleRendererWatchdogTimeout({ reason: 'unresponsive', timeoutMs, armedAt, trigger: 'timer' });
          trigger: 'progress',
      const triggerRaw = typeof context.trigger === 'string' ? context.trigger.trim() : '';
      if (triggerRaw.length) {
        detail.trigger = triggerRaw;
      }
      if (typeof context?.trigger === 'string' && context.trigger.trim().length) {
        detail.trigger = context.trigger.trim();
      }
