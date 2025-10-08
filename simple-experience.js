      let normalizedMessage =
      const ensureFallbackMessage = (text) => {
        const trimmed = typeof text === 'string' ? text.trim() : '';
        const suffix = 'Fallback alert tone active until audio assets are restored.';
        if (!trimmed) {
          return suffix;
        }
        if (/fallback alert tone/i.test(trimmed)) {
          return trimmed;
        }
        if (/fallback/i.test(trimmed) && /(audio|tone)/i.test(trimmed)) {
          return trimmed;
        }
        if (/[.!?]$/.test(trimmed)) {
          return `${trimmed} ${suffix}`;
        }
        return `${trimmed}. ${suffix}`;
      };
      if (payload.fallbackActive) {
        normalizedMessage = ensureFallbackMessage(normalizedMessage);
        payload.message = normalizedMessage;
      }
      if (options?.showOverlay !== false) {
        const scope =
          (typeof window !== 'undefined' && window) ||
          (typeof globalThis !== 'undefined' && globalThis) ||
          (typeof self !== 'undefined' && self) ||
          null;
        const missingSampleDetected =
          payload.missingSample === true ||
          payload.code === 'missing-sample' ||
          payload.code === 'boot-missing-sample';
        const fallbackActive = payload.fallbackActive === true || missingSampleDetected;
        const overlayTitle = missingSampleDetected ? 'Missing audio sample' : 'Audio playback failed';
        const overlayBaseMessage = fallbackActive ? ensureFallbackMessage(normalizedMessage) : normalizedMessage;
        const overlayParts = [overlayBaseMessage];
        const errorName =
          typeof payload.errorName === 'string' && payload.errorName.trim().length ? payload.errorName.trim() : null;
        const errorMessage =
          typeof payload.errorMessage === 'string' && payload.errorMessage.trim().length
            ? payload.errorMessage.trim()
            : null;
        if (errorName && errorMessage) {
          overlayParts.push(`${errorName}: ${errorMessage}`);
        } else if (errorMessage) {
          overlayParts.push(errorMessage);
        } else if (errorName) {
          overlayParts.push(errorName);
        }
        const overlayCode =
          typeof payload.code === 'string' && payload.code.trim().length ? payload.code.trim() : null;
        if (overlayCode) {
          overlayParts.push(`Code: ${overlayCode}`);
        }
        const overlayMessage = overlayParts.join(' — ');
        const overlayStatus = fallbackActive ? 'error' : 'warning';
        let overlayPresented = false;
        const overlayApi =
          scope?.bootstrapOverlay ||
          scope?.InfiniteRails?.bootstrapOverlay ||
          scope?.__INFINITE_RAILS_BOOTSTRAP_OVERLAY__ ||
          null;
        if (overlayApi) {
          if (typeof overlayApi.showError === 'function') {
            try {
              overlayApi.showError({ title: overlayTitle, message: overlayMessage });
              overlayPresented = true;
            } catch (error) {
              if (typeof console !== 'undefined' && typeof console.debug === 'function') {
                console.debug('Welcome audio overlay API unavailable; using DOM fallback.', error);
              }
            }
          }
          if (typeof overlayApi.setDiagnostic === 'function') {
            try {
              overlayApi.setDiagnostic('audio', { status: overlayStatus, message: overlayBaseMessage });
            } catch (error) {
              if (typeof console !== 'undefined' && typeof console.debug === 'function') {
                console.debug('Unable to record welcome audio diagnostic overlay state.', error);
              }
            }
          }
          if (typeof overlayApi.logEvent === 'function') {
            try {
              overlayApi.logEvent('audio', overlayBaseMessage, {
                level: overlayStatus === 'error' ? 'error' : 'warning',
                detail: payload,
              });
            } catch (error) {
              if (typeof console !== 'undefined' && typeof console.debug === 'function') {
                console.debug('Unable to log welcome audio overlay event.', error);
              }
            }
          }
        }
        if (!overlayPresented) {
          const doc =
            this.canvas?.ownerDocument ||
            scope?.document ||
            (typeof document !== 'undefined' ? document : null);
          if (doc && typeof doc.getElementById === 'function') {
            const overlay = doc.getElementById('globalOverlay');
            if (overlay) {
              if (typeof overlay.removeAttribute === 'function') {
                overlay.removeAttribute('hidden');
              }
              overlay.hidden = false;
              if (typeof overlay.setAttribute === 'function') {
                overlay.setAttribute('data-mode', 'error');
                overlay.setAttribute('data-audio-error', 'true');
                overlay.setAttribute('data-fallback-active', fallbackActive ? 'true' : 'false');
              }
              try {
                setInertState(overlay, false);
                activateOverlayIsolation(overlay);
              } catch (error) {
                if (typeof console !== 'undefined' && typeof console.debug === 'function') {
                  console.debug('Failed to activate welcome audio overlay isolation.', error);
                }
              }
              const titleEl = doc.getElementById('globalOverlayTitle');
              if (titleEl) {
                titleEl.textContent = overlayTitle;
              }
              const messageEl = doc.getElementById('globalOverlayMessage');
              if (messageEl) {
                messageEl.textContent = overlayMessage;
              }
              const diagnosticEl = doc.getElementById('globalOverlayAudioStatus');
              if (diagnosticEl) {
                diagnosticEl.textContent = overlayBaseMessage;
              }
              const diagnosticItem =
                typeof doc.querySelector === 'function'
                  ? doc.querySelector('[data-diagnostic="audio"]')
                  : null;
              if (diagnosticItem && typeof diagnosticItem.setAttribute === 'function') {
                diagnosticItem.setAttribute('data-status', overlayStatus);
              }
              overlayPresented = true;
            }
          }
        }
      }
