        if (typeof console !== 'undefined' && typeof console.info === 'function') {
          console.info(
            `Player model missing animation channel(s): ${missingLabel}. Falling back to placeholder avatar mesh.`,
          );
        }
          logLevel: 'info',
      const resolvedLogLevel =
        typeof options.logLevel === 'string' && options.logLevel.trim().length
          ? options.logLevel.trim().toLowerCase()
          : error
            ? 'error'
            : 'warn';
      if (typeof console !== 'undefined' && resolvedLogLevel !== 'silent') {
        const logArgs = [`Asset load failure for ${key || 'unknown asset'}.`];
        if (error) {
          logArgs.push(error);
        }
        if (resolvedLogLevel === 'error' && typeof console.error === 'function') {
          console.error(...logArgs);
        } else if (resolvedLogLevel === 'warn' && typeof console.warn === 'function') {
          console.warn(...logArgs);
        } else if (resolvedLogLevel === 'info' && typeof console.info === 'function') {
          console.info(...logArgs);
        } else if (resolvedLogLevel === 'debug' && typeof console.debug === 'function') {
          console.debug(...logArgs);
        }
