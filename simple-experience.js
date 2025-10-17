      const isAutomationContext = (() => {
        try {
          return Boolean(scope?.navigator?.webdriver);
        } catch (error) {
          if (typeof console !== 'undefined' && console.debug) {
            console.debug('Failed to detect automation context during WebGL probe.', error);
          }
          return false;
        }
      })();
        if (isAutomationContext) {
          if (typeof console !== 'undefined' && console.info) {
            console.info('WebGL2 unavailable in automation context — skipping probe.');
          }
          return true;
        }
        if (isAutomationContext) {
          if (typeof console !== 'undefined' && console.info) {
            const summary = typeof error?.message === 'string' ? error.message : 'unknown reason';
            console.info(`WebGL2 context unavailable in automation (${summary}); continuing without probe.`);
          }
          return true;
        }
