        const missingSampleCode =
          detail.code === 'missing-sample' ||
          detail.code === 'boot-missing-sample' ||
          info?.missingSample === true;
        if (missingSampleCode) {
          detail.missingSample = true;
          detail.fallbackActive = true;
        } else if (info?.fallbackActive === true) {
          detail.fallbackActive = true;
        }
              missingSample: true,
              fallbackActive: true,
            playFallbackBeep();
      function playFallbackBeep(options = {}) {
        const beepOptions = Object.assign({}, options);
        if (beepOptions.volume === undefined) {
          beepOptions.volume = 0.7;
        }
        beepOptions.loop = false;
        playInternal(fallbackAlertName, fallbackAlertName, beepOptions);
      }

        fallbackOptions.loop = false;
            missingSample: true,
            fallbackActive: true,
        playFallbackBeep(fallbackOptions);
