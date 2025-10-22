'use strict';
(function setupBootstrapFallback() {
        var doc = document;
        var timer = null;
        var fallbackActive = false;
        var originalTitle = null;
        var originalMessage = null;
        var bootStatusElements = null;
        var bootStatusPhases = [
          { key: 'script', label: 'Script', defaultMessage: 'Loading bootstrap script…' },
          { key: 'assets', label: 'Assets', defaultMessage: 'Waiting for asset checks…' },
          { key: 'ui', label: 'UI', defaultMessage: 'Preparing interface…' },
          { key: 'gltf', label: 'GLTF', defaultMessage: 'Waiting for model preload…' },
          { key: 'audio', label: 'Audio', defaultMessage: 'Validating audio samples…' },
          { key: 'controls', label: 'Controls', defaultMessage: 'Binding input controls…' },
        ];
        var bootStatusConfigMap = bootStatusPhases.reduce(function (acc, config) {
          acc[config.key] = config;
          return acc;
        }, {});

        function ensureBootStatusElements() {
          if (bootStatusElements) {
            return bootStatusElements;
          }
          var hud = doc.getElementById('bootstrapStatusHud');
          if (!hud) {
            hud = doc.createElement('div');
            hud.id = 'bootstrapStatusHud';
            hud.className = 'bootstrap-status';
            hud.setAttribute('role', 'status');
            hud.setAttribute('aria-live', 'polite');
            var overlayBody = doc.querySelector('#globalOverlayDialog .compose-overlay__body');
            if (overlayBody) {
              overlayBody.insertBefore(hud, overlayBody.firstChild || null);
            } else {
              doc.body.appendChild(hud);
            }
          }
          var list = doc.getElementById('bootstrapStatusList');
          if (!list) {
            list = doc.createElement('ul');
            list.id = 'bootstrapStatusList';
            list.className = 'bootstrap-status__list';
            list.setAttribute('role', 'list');
            hud.appendChild(list);
          }
          var items = {};
          for (var i = 0; i < bootStatusPhases.length; i += 1) {
            var config = bootStatusPhases[i];
            var item = list.querySelector('[data-phase="' + config.key + '"]');
            if (!item) {
              item = doc.createElement('li');
              item.className = 'bootstrap-status__item';
              item.setAttribute('data-phase', config.key);
              item.setAttribute('data-status', 'pending');
              var indicator = doc.createElement('span');
              indicator.className = 'bootstrap-status__indicator';
              indicator.setAttribute('aria-hidden', 'true');
              item.appendChild(indicator);
              var label = doc.createElement('span');
              label.className = 'bootstrap-status__label';
              label.textContent = config.label;
              item.appendChild(label);
              var message = doc.createElement('span');
              message.className = 'bootstrap-status__message';
              message.textContent = config.defaultMessage;
              item.appendChild(message);
              list.appendChild(item);
            }
            var messageEl = item.querySelector('.bootstrap-status__message');
            if (!messageEl) {
              messageEl = doc.createElement('span');
              messageEl.className = 'bootstrap-status__message';
              messageEl.textContent = config.defaultMessage;
              item.appendChild(messageEl);
            }
            items[config.key] = { container: item, message: messageEl };
          }
          bootStatusElements = { container: hud, list: list, items: items };
          return bootStatusElements;
        }

        function normaliseBootStatusValue(value) {
          if (typeof value !== 'string') {
            return 'pending';
          }
          var trimmed = value.trim().toLowerCase();
          if (trimmed === 'success') {
            return 'ok';
          }
          if (trimmed === 'in-progress' || trimmed === 'loading' || trimmed === 'working') {
            return 'active';
          }
          if (trimmed === 'fail' || trimmed === 'failure') {
            return 'error';
          }
          if (trimmed === 'complete') {
            return 'ok';
          }
          if (trimmed === 'queued') {
            return 'pending';
          }
          return trimmed || 'pending';
        }

        function formatBootStatusProgress(progress) {
          if (!progress || typeof progress !== 'object') {
            return null;
          }
          var current = Number(progress.current);
          var total = Number(progress.total);
          var percent = Number(progress.percent);
          var segments = [];
          if (Number.isFinite(current) && Number.isFinite(total) && total > 0) {
            segments.push(current + ' / ' + total);
            if (!Number.isFinite(percent)) {
              percent = Math.round((current / total) * 100);
            }
          } else if (Number.isFinite(current) && !Number.isFinite(total)) {
            segments.push(String(current));
          }
          if (Number.isFinite(percent)) {
            var bounded = Math.max(0, Math.min(100, Math.round(percent)));
            segments.push(bounded + '%');
          }
          return segments.length ? segments.join(' • ') : null;
        }

        function updateBootStatusPhase(phase, detail) {
          if (!phase) {
            return;
          }
          var elements = ensureBootStatusElements();
          if (!elements) {
            return;
          }
          var key = String(phase).trim().toLowerCase();
          var config = bootStatusConfigMap[key];
          if (!config) {
            return;
          }
          var entry = elements.items[key];
          if (!entry) {
            return;
          }
          var statusValue = normaliseBootStatusValue(detail && detail.status);
          entry.container.setAttribute('data-status', statusValue);
          if (detail && typeof detail.title === 'string' && detail.title.trim().length) {
            entry.container.setAttribute('aria-label', detail.title.trim());
          } else {
            entry.container.removeAttribute('aria-label');
          }
          var message = config.defaultMessage;
          if (detail && typeof detail.message === 'string' && detail.message.trim().length) {
            message = detail.message.trim();
          }
          var progressText = formatBootStatusProgress(detail ? detail.progress : null);
          if (progressText) {
            message = message + ' — ' + progressText;
          }
          entry.message.textContent = message;
        }

        function updateBootStatusMany(entries) {
          if (!entries || typeof entries !== 'object') {
            return;
          }
          var keys = Object.keys(entries);
          for (var i = 0; i < keys.length; i += 1) {
            updateBootStatusPhase(keys[i], entries[keys[i]]);
          }
        }

        function resetBootStatus() {
          for (var i = 0; i < bootStatusPhases.length; i += 1) {
            var config = bootStatusPhases[i];
            updateBootStatusPhase(config.key, {
              status: 'pending',
              message: config.defaultMessage,
            });
          }
        }

        var bootStatusApi = {
          update: updateBootStatusPhase,
          updateMany: updateBootStatusMany,
          reset: resetBootStatus,
        };

        resetBootStatus();
        bootStatusApi.update('script', { status: 'active', message: 'Loading bootstrap script…' });

        function restoreOverlayContent() {
          var title = doc.getElementById('globalOverlayTitle');
          if (title && originalTitle !== null) {
            title.textContent = originalTitle;
          }
          var message = doc.getElementById('globalOverlayMessage');
          if (message && originalMessage !== null) {
            message.textContent = originalMessage;
          }
        }

        function showOverlayFallback() {
          var overlay = doc.getElementById('globalOverlay');
          if (!overlay) {
            return false;
          }
          var dialog = doc.getElementById('globalOverlayDialog');
          var spinner = doc.getElementById('globalOverlaySpinner');
          var title = doc.getElementById('globalOverlayTitle');
          var message = doc.getElementById('globalOverlayMessage');

          overlay.hidden = false;
          overlay.removeAttribute('hidden');
          overlay.removeAttribute('aria-hidden');
          overlay.removeAttribute('inert');
          overlay.setAttribute('data-mode', 'loading');
          overlay.setAttribute('data-fallback-active', 'true');

          if (dialog) {
            dialog.setAttribute('aria-busy', 'true');
          }
          if (spinner) {
            spinner.removeAttribute('aria-hidden');
          }
          if (title) {
            if (originalTitle === null) {
              originalTitle = title.textContent;
            }
            title.textContent = 'Preparing experience…';
          }
          if (message) {
            if (originalMessage === null) {
              originalMessage = message.textContent;
            }
            message.textContent = 'Still loading — please check your connection if this persists.';
          }
          return true;
        }

        function ensureFallbackVisible() {
          if (fallbackActive) {
            return;
          }
          fallbackActive = showOverlayFallback();
          if (fallbackActive) {
            return;
          }

          var basicFallback = doc.getElementById('bootstrapFallbackMessage');
          if (!basicFallback) {
            basicFallback = doc.createElement('div');
            basicFallback.id = 'bootstrapFallbackMessage';
            basicFallback.setAttribute('role', 'status');
            basicFallback.setAttribute('aria-live', 'assertive');
            basicFallback.style.position = 'fixed';
            basicFallback.style.inset = '0';
            basicFallback.style.display = 'grid';
            basicFallback.style.placeItems = 'center';
            basicFallback.style.background = 'rgba(4, 18, 29, 0.86)';
            basicFallback.style.color = '#e8f6ff';
            basicFallback.style.fontFamily = "'Chakra Petch', 'Exo 2', sans-serif";
            basicFallback.style.fontSize = '1.25rem';
            basicFallback.style.textAlign = 'center';
            basicFallback.style.padding = '2rem';
            basicFallback.textContent = 'Preparing experience… Still loading — please check your connection if this persists.';
            doc.body.appendChild(basicFallback);
          }
          fallbackActive = true;
        }

        function hideFallback() {
          if (timer) {
            clearTimeout(timer);
            timer = null;
          }
          if (!fallbackActive) {
            return;
          }
          var overlay = doc.getElementById('globalOverlay');
          if (overlay && overlay.getAttribute('data-fallback-active') === 'true') {
            var dialog = doc.getElementById('globalOverlayDialog');
            var previouslyFocused = doc.activeElement;
            if (dialog && previouslyFocused && dialog.contains(previouslyFocused)) {
              if (typeof previouslyFocused.blur === 'function') {
                previouslyFocused.blur();
              }
              var focusTarget = doc.body;
              if (focusTarget) {
                var originalTabIndex = focusTarget.getAttribute('tabindex');
                if (originalTabIndex === null) {
                  focusTarget.setAttribute('tabindex', '-1');
                }
                if (typeof focusTarget.focus === 'function') {
                  focusTarget.focus();
                }
                if (originalTabIndex === null) {
                  focusTarget.removeAttribute('tabindex');
                }
              }
            }

            overlay.removeAttribute('aria-hidden');
            overlay.setAttribute('data-mode', 'idle');
            overlay.removeAttribute('data-fallback-active');
            overlay.setAttribute('inert', '');
            overlay.setAttribute('hidden', '');
            overlay.hidden = true;

            if (dialog) {
              dialog.removeAttribute('aria-busy');
            }
            var spinner = doc.getElementById('globalOverlaySpinner');
            if (spinner) {
              spinner.setAttribute('aria-hidden', 'true');
            }
            restoreOverlayContent();
          }

          var basicFallback = doc.getElementById('bootstrapFallbackMessage');
          if (basicFallback && basicFallback.parentNode) {
            basicFallback.parentNode.removeChild(basicFallback);
          }

          fallbackActive = false;
        }

        timer = setTimeout(ensureFallbackVisible, 2000);

        window.__infiniteRailsBootStatus = bootStatusApi;

        window.__infiniteRailsBootstrapFallback = {
          cancel: hideFallback,
          timer: timer,
          bootStatus: bootStatusApi,
        };
      })();
