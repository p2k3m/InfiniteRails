      const missingAudioOverlayPresented = new Set();
      const presentMissingAudioOverlay = (requestedName, resolvedName, message, detail = {}) => {
        const requestedNormalised = normaliseAudioName(requestedName);
        const resolvedNormalised = normaliseAudioName(resolvedName);
        const overlayKeyParts = [];
        if (requestedNormalised) {
          overlayKeyParts.push(`req:${requestedNormalised}`);
        }
        if (resolvedNormalised) {
          overlayKeyParts.push(`res:${resolvedNormalised}`);
        }
        const detailCode =
          typeof detail?.code === 'string' && detail.code.trim().length ? detail.code.trim() : null;
        if (detailCode) {
          overlayKeyParts.push(`code:${detailCode}`);
        }
        const overlayKey = overlayKeyParts.length ? overlayKeyParts.join('|') : 'generic';
        if (missingAudioOverlayPresented.has(overlayKey)) {
          return;
        }
        missingAudioOverlayPresented.add(overlayKey);

        const scope =
          (typeof window !== 'undefined' && window) ||
          (typeof globalThis !== 'undefined' && globalThis) ||
          (typeof self !== 'undefined' && self) ||
          null;
        const overlayTitle = 'Missing audio sample';
        const overlayBaseMessage = ensureAudioFallbackMessage(message);
        const overlayParts = [overlayBaseMessage];
        const sampleLabel =
          requestedNormalised && resolvedNormalised && requestedNormalised !== resolvedNormalised
            ? `${requestedNormalised} → ${resolvedNormalised}`
            : requestedNormalised || resolvedNormalised || null;
        if (sampleLabel) {
          overlayParts.push(`Sample: ${sampleLabel}`);
        }
        if (detailCode) {
          overlayParts.push(`Code: ${detailCode}`);
        }
        const overlayMessage = overlayParts.join(' — ');
        const overlayStatus = 'error';

        if (typeof notifyLiveDiagnostics === 'function') {
          const diagnosticDetail = Object.assign(
            {
              requestedName: requestedNormalised || requestedName || null,
              resolvedName: resolvedNormalised || resolvedName || null,
              code: detailCode || detail?.code || 'missing-sample',
              fallbackActive: true,
              missingSample: true,
            },
            detail && typeof detail === 'object' ? detail : {},
          );
          try {
            notifyLiveDiagnostics('audio', overlayBaseMessage, diagnosticDetail, { level: 'error' });
          } catch (error) {
            if (typeof console !== 'undefined' && typeof console.debug === 'function') {
              console.debug('Unable to record missing audio diagnostic.', error);
            }
          }
        }

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
                console.debug('Missing audio overlay API unavailable; using DOM fallback.', error);
              }
            }
          }
          if (typeof overlayApi.setDiagnostic === 'function') {
            try {
              overlayApi.setDiagnostic('audio', { status: overlayStatus, message: overlayBaseMessage });
            } catch (error) {
              if (typeof console !== 'undefined' && typeof console.debug === 'function') {
                console.debug('Unable to record missing audio diagnostic overlay state.', error);
              }
            }
          }
          if (typeof overlayApi.logEvent === 'function') {
            try {
              overlayApi.logEvent('audio', overlayBaseMessage, {
                level: 'error',
                detail: Object.assign(
                  {
                    requestedName: requestedNormalised || requestedName || null,
                    resolvedName: resolvedNormalised || resolvedName || null,
                    code: detailCode || detail?.code || 'missing-sample',
                    fallbackActive: true,
                    missingSample: true,
                  },
                  detail && typeof detail === 'object' ? detail : {},
                ),
              });
            } catch (error) {
              if (typeof console !== 'undefined' && typeof console.debug === 'function') {
                console.debug('Unable to log missing audio overlay event.', error);
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
                overlay.setAttribute('data-fallback-active', 'true');
                overlay.setAttribute('data-missing-audio', 'true');
              }
              try {
                setInertState(overlay, false);
                activateOverlayIsolation(overlay);
              } catch (error) {
                if (typeof console !== 'undefined' && typeof console.debug === 'function') {
                  console.debug('Failed to activate missing audio overlay isolation.', error);
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
            }
          }
        }
      };
        if (
          detail.missingSample === true ||
          detail.code === 'missing-sample' ||
          detail.code === 'boot-missing-sample'
        ) {
          presentMissingAudioOverlay(requestedName, resolvedName, message, detail);
        }
        if (typeof scope?.dispatchEvent !== 'function' || typeof CustomEvent !== 'function') {
          return;
        }
