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

        function setupLegacyEntrypointRecovery() {
          if (!doc || typeof doc.addEventListener !== 'function') {
            return;
          }

          var globalScope =
            (typeof window !== 'undefined' && window) ||
            (typeof globalThis !== 'undefined' && globalThis) ||
            null;

          var manifestCache = null;
          var manifestResolved = false;
          var experienceLabel = 'Infinite Rails';

          if (globalScope && globalScope.APP_CONFIG && typeof globalScope.APP_CONFIG === 'object') {
            var config = globalScope.APP_CONFIG;
            var labelCandidates = [
              config.portalName,
              config.experienceName,
              config.productName,
              config.appName,
              config.title,
            ];
            for (var i = 0; i < labelCandidates.length; i += 1) {
              var candidate = labelCandidates[i];
              if (typeof candidate === 'string') {
                var trimmed = candidate.trim();
                if (trimmed) {
                  experienceLabel = trimmed;
                  break;
                }
              }
            }
          }

          function loadManifest() {
            if (manifestResolved) {
              return manifestCache;
            }
            manifestResolved = true;

            var scopeManifest =
              globalScope &&
              globalScope.__INFINITE_RAILS_ASSET_MANIFEST__ &&
              typeof globalScope.__INFINITE_RAILS_ASSET_MANIFEST__ === 'object'
                ? globalScope.__INFINITE_RAILS_ASSET_MANIFEST__
                : null;
            if (scopeManifest && Array.isArray(scopeManifest.assets)) {
              manifestCache = scopeManifest;
              return manifestCache;
            }

            var inline = doc.getElementById && doc.getElementById('assetManifest');
            if (inline && typeof inline.textContent === 'string') {
              try {
                var parsed = JSON.parse(inline.textContent);
                if (parsed && typeof parsed === 'object') {
                  manifestCache = parsed;
                  return manifestCache;
                }
              } catch (error) {
                /* ignore manifest parse failures */
              }
            }

            manifestCache = null;
            return manifestCache;
          }

          function findManifestAlias(manifest, key) {
            if (!manifest || !Array.isArray(manifest.assets) || !key) {
              return null;
            }
            for (var i = 0; i < manifest.assets.length; i += 1) {
              var entry = manifest.assets[i];
              if (typeof entry !== 'string' || !entry) {
                continue;
              }
              if (entry === key || entry.indexOf(key + '?') === 0) {
                return entry;
              }
            }
            return null;
          }

          function resolveAliasUrl(sourceUrl, aliasPath) {
            if (!aliasPath) {
              return null;
            }
            if (!sourceUrl) {
              return aliasPath;
            }
            try {
              return new URL(aliasPath, sourceUrl).toString();
            } catch (primaryError) {
              try {
                var baseMatch = sourceUrl.match(/^[^?#]*\//);
                var basePath = baseMatch ? baseMatch[0] : '';
                var normalisedAlias = aliasPath.replace(/^\.\/?/, '');
                return basePath + normalisedAlias;
              } catch (fallbackError) {
                return aliasPath;
              }
            }
          }

          function cloneLinkAttributes(source, target) {
            if (!source || !target) {
              return;
            }
            if (source.rel) {
              target.rel = source.rel;
            }
            if (source.media) {
              target.media = source.media;
            }
            if (source.type) {
              target.type = source.type;
            }
            if (source.crossOrigin) {
              target.crossOrigin = source.crossOrigin;
            }
            if (source.referrerPolicy) {
              target.referrerPolicy = source.referrerPolicy;
            }
            if (source.integrity) {
              target.integrity = source.integrity;
            }
            if (source.as) {
              target.as = source.as;
            }
            if (source.disabled) {
              target.disabled = true;
            }
          }

          function cloneScriptAttributes(source, target) {
            if (!source || !target) {
              return;
            }
            if (source.type) {
              target.type = source.type;
            }
            if (source.noModule) {
              target.noModule = true;
            }
            if (source.crossOrigin) {
              target.crossOrigin = source.crossOrigin;
            }
            if (source.referrerPolicy) {
              target.referrerPolicy = source.referrerPolicy;
            }
            if (source.integrity) {
              target.integrity = source.integrity;
            }
            if (source.async) {
              target.async = true;
            }
            if (source.defer) {
              target.defer = true;
            }
          }

          function logAliasAttempt(context) {
            try {
              if (globalScope && globalScope.console && typeof globalScope.console.warn === 'function') {
                globalScope.console.warn(
                  experienceLabel + ' static asset failed to load. Retrying via alias.',
                  context,
                );
              }
            } catch (error) {
              /* ignore console failures */
            }
          }

          function markAliasAttempt(element) {
            if (!element) {
              return;
            }
            if (!element.dataset) {
              element.dataset = {};
            }
            element.dataset.aliasRecoveryApplied = 'true';
          }

          function attemptAliasReload(target, extension, sourceUrl) {
            if (!target || !extension) {
              return false;
            }
            if (target.dataset && target.dataset.aliasRecoveryApplied === 'true') {
              return false;
            }

            var manifest = loadManifest();
            var aliasKey = extension === 'css' ? 'assets/index-latest.css' : extension === 'js' ? 'assets/index-latest.js' : null;
            if (!aliasKey) {
              return false;
            }
            var aliasEntry = findManifestAlias(manifest, aliasKey) || aliasKey;
            var resolvedAlias = resolveAliasUrl(sourceUrl, aliasEntry);
            if (!resolvedAlias) {
              return false;
            }

            var parent = target.parentNode || doc.head || doc.body || doc.documentElement;
            if (!parent) {
              return false;
            }

            var replacement = null;
            if (target.tagName === 'LINK') {
              replacement = doc.createElement('link');
              cloneLinkAttributes(target, replacement);
              replacement.href = resolvedAlias;
            } else if (target.tagName === 'SCRIPT') {
              replacement = doc.createElement('script');
              cloneScriptAttributes(target, replacement);
              replacement.src = resolvedAlias;
            } else {
              return false;
            }

            markAliasAttempt(replacement);
            if (target.dataset && target.dataset.localSrc && !replacement.dataset.localSrc) {
              replacement.dataset.localSrc = target.dataset.localSrc;
            }

            logAliasAttempt({ source: sourceUrl, alias: resolvedAlias, base: aliasEntry });

            try {
              parent.insertBefore(replacement, target.nextSibling || null);
              if (typeof parent.removeChild === 'function') {
                parent.removeChild(target);
              }
            } catch (error) {
              return false;
            }
            return true;
          }

          function handleLegacyEntrypointFailure(event) {
            var target = event && event.target;
            if (!target || (target.tagName !== 'LINK' && target.tagName !== 'SCRIPT')) {
              return;
            }
            var url = target.href || target.src || '';
            if (typeof url !== 'string' || url.length === 0) {
              return;
            }
            var match = url.match(/assets\/index-[0-9a-f]+\.(css|js)/i);
            if (!match) {
              return;
            }
            var extension = match[1].toLowerCase();
            attemptAliasReload(target, extension, url);
          }

          doc.addEventListener('error', handleLegacyEntrypointFailure, true);
        }

        setupLegacyEntrypointRecovery();

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
