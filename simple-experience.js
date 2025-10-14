      const parseFiniteNumber = (value) => {
        if (Number.isFinite(value)) {
          return value;
        }
        if (typeof value === 'string' && value.trim().length > 0) {
          const parsed = Number.parseFloat(value.trim());
          return Number.isFinite(parsed) ? parsed : null;
        }
        return null;
      };
      const hasOwn = (target, key) => Object.prototype.hasOwnProperty.call(target, key);
      const configWatchdogEnabled =
        appConfig && hasOwn(appConfig, 'rendererWatchdog')
          ? appConfig.rendererWatchdog !== false
          : true;
      const rendererWatchdogEnabled = hasOwn(options, 'rendererWatchdog')
        ? options.rendererWatchdog !== false
        : configWatchdogEnabled;
      const optionFrameBudget = parseFiniteNumber(options.rendererWatchdogFrameBudget);
      const configFrameBudget = parseFiniteNumber(appConfig?.rendererWatchdogFrameBudget);
      const watchdogFrameBudget = optionFrameBudget !== null
        ? Math.max(1, Math.floor(optionFrameBudget))
        : configFrameBudget !== null
          ? Math.max(1, Math.floor(configFrameBudget))
          : 240;
      const optionTargetFps = parseFiniteNumber(options.rendererWatchdogTargetFps);
      const configTargetFps = parseFiniteNumber(appConfig?.rendererWatchdogTargetFps);
      const watchdogTargetFps = optionTargetFps !== null
        ? Math.max(15, Math.min(120, Math.floor(optionTargetFps)))
        : configTargetFps !== null
          ? Math.max(15, Math.min(120, Math.floor(configTargetFps)))
          : 60;
        enabled: rendererWatchdogEnabled,
