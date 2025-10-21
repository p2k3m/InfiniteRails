  const globalScope =
    typeof globalThis !== 'undefined'
      ? globalThis
      : typeof window !== 'undefined'
        ? window
        : {};
  const documentRef = typeof document !== 'undefined' ? document : null;

  function ensureTrailingSlash(value) {
    if (typeof value !== 'string') {
      return value;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return trimmed;
    }

    return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
  }

  const PRODUCTION_ASSET_ROOT = ensureTrailingSlash('https://d3gj6x3ityfh5o.cloudfront.net/');

  const simpleModeToggleState = {
    control: null,
    status: null,
    baselineConfig: null,
    baselineCaptured: false,
  };

  function initSimpleModeToggle() {
    if (!documentRef || typeof documentRef.getElementById !== 'function') {
      return;
    }
    const toggle = documentRef.getElementById('forceSimpleModeToggle');
    const status = documentRef.getElementById('forceSimpleModeStatus');
    if (!toggle) {
      return;
    }
    simpleModeToggleState.control = toggle;
    simpleModeToggleState.status = status ?? null;
    const config = globalScope.APP_CONFIG || (globalScope.APP_CONFIG = {});
    if (config.forceSimpleMode !== true) {
      rememberSimpleModeBaseline(config);
    }
    updateSimpleModeToggle({ source: 'init' });
    toggle.addEventListener('change', (event) => {
      const checked = Boolean(event?.target?.checked);
      const scopeConfig = globalScope.APP_CONFIG || (globalScope.APP_CONFIG = {});
      if (checked) {
        rememberSimpleModeBaseline(scopeConfig);
        applySimpleFallbackConfig(scopeConfig);
        updateSimpleModeToggle({ active: true, reason: 'user-toggle', source: 'user' });
        if (typeof tryStartSimpleFallback === 'function') {
          const activeMode =
            typeof getActiveRendererMode === 'function' ? getActiveRendererMode() : null;
          try {
            tryStartSimpleFallback(null, {
              reason: 'user-toggle',
              source: 'user-toggle',
              mode: activeMode || 'unknown',
              allowRetry: true,
            });
          } catch (fallbackError) {
            globalScope?.console?.debug?.(
              'Failed to activate sandbox renderer from settings toggle.',
              fallbackError,
            );
          }
        }
        return;
      }
      restoreSimpleModeConfig(scopeConfig);
      updateSimpleModeToggle({ active: false, reason: 'user-toggle-off', source: 'user' });
      const reloadRenderer =
        typeof reloadActiveRenderer === 'function'
          ? reloadActiveRenderer
          : typeof globalScope?.InfiniteRails?.renderers?.reloadActive === 'function'
            ? globalScope.InfiniteRails.renderers.reloadActive
            : null;
      if (reloadRenderer) {
        try {
          const reloadResult = reloadRenderer({
            mode: 'advanced',
            reason: 'user-toggle',
            ensurePlugins: true,
          });
          if (reloadResult && typeof reloadResult.catch === 'function') {
            reloadResult.catch((error) => {
              globalScope?.console?.debug?.(
                'Failed to reload advanced renderer after disabling sandbox toggle.',
                error,
              );
              if (typeof globalScope?.location?.reload === 'function') {
                try {
                  globalScope.location.reload();
                } catch (reloadError) {
                  globalScope?.console?.debug?.(
                    'Failed to reload page after sandbox toggle.',
                    reloadError,
                  );
                }
              }
            });
          }
        } catch (error) {
          globalScope?.console?.debug?.(
            'Advanced renderer reload threw from sandbox toggle.',
            error,
          );
          if (typeof globalScope?.location?.reload === 'function') {
            try {
              globalScope.location.reload();
            } catch (reloadError) {
              globalScope?.console?.debug?.(
                'Failed to reload page after sandbox toggle failure.',
                reloadError,
              );
            }
          }
        }
      } else if (typeof globalScope?.location?.reload === 'function') {
        try {
          globalScope.location.reload();
        } catch (reloadError) {
          globalScope?.console?.debug?.(
            'Failed to reload page after sandbox toggle deactivation.',
            reloadError,
          );
        }
      }
    });
  }

  initSimpleModeToggle();
  function captureSimpleModeConfigSnapshot(config) {
    if (!config || typeof config !== 'object') {
      return null;
    }
    return {
      forceSimpleMode: config.forceSimpleMode,
      enableAdvancedExperience: config.enableAdvancedExperience,
      preferAdvanced: config.preferAdvanced,
      defaultMode: config.defaultMode,
      forceAdvanced: config.forceAdvanced,
    };
  }

  function rememberSimpleModeBaseline(config) {
    if (!config || typeof config !== 'object') {
      return;
    }
    if (config.forceSimpleMode === true) {
      return;
    }
    if (simpleModeToggleState.baselineCaptured) {
      return;
    }
    simpleModeToggleState.baselineConfig = captureSimpleModeConfigSnapshot(config);
    simpleModeToggleState.baselineCaptured = true;
  }

  function restoreSimpleModeConfig(config) {
    if (!config || typeof config !== 'object') {
      return;
    }
    const baseline = simpleModeToggleState.baselineConfig;
    const assign = (key, value) => {
      if (typeof value === 'undefined') {
        try {
          delete config[key];
        } catch (error) {
          config[key] = undefined;
        }
        return;
      }
      config[key] = value;
    };
    if (baseline && typeof baseline === 'object') {
      ['forceSimpleMode', 'enableAdvancedExperience', 'preferAdvanced', 'defaultMode', 'forceAdvanced'].forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(baseline, key)) {
          assign(key, baseline[key]);
        } else {
          assign(key, undefined);
        }
      });
    } else {
      assign('forceSimpleMode', undefined);
      if (config.enableAdvancedExperience === false) {
        config.enableAdvancedExperience = true;
      }
      if (config.preferAdvanced === false) {
        config.preferAdvanced = true;
      }
      if (config.defaultMode === 'simple') {
        assign('defaultMode', undefined);
      }
      if (config.forceAdvanced === false) {
        assign('forceAdvanced', undefined);
      }
    }
    simpleModeToggleState.baselineCaptured = false;
    simpleModeToggleState.baselineConfig = null;
    simpleFallbackAttempted = false;
  }

  function resolveSimpleModeToggleStatusMessage(reason, source) {
    const normalised = typeof reason === 'string' ? reason.trim().toLowerCase() : '';
    if (source === 'user') {
      return 'Sandbox renderer forced manually.';
    }
    switch (normalised) {
      case 'renderer-timeout':
        return 'Enabled automatically after renderer timeout.';
      case 'renderer-failure':
        return 'Enabled automatically after renderer failure.';
      case 'ensurethree-failure':
        return 'Enabled automatically after loading error.';
      case 'user-toggle':
        return source === 'user-toggle'
          ? 'Sandbox renderer forced manually.'
          : 'Sandbox renderer is active.';
      default:
        return 'Sandbox renderer is active.';
    }
  }

  function updateSimpleModeToggle(options = {}) {
    const scope = globalScope || (typeof globalThis !== 'undefined' ? globalThis : null);
    if (!scope) {
      return;
    }
    const config = scope.APP_CONFIG || (scope.APP_CONFIG = {});
    if (!simpleModeToggleState.control || !simpleModeToggleState.control.isConnected) {
      if (documentRef && typeof documentRef.getElementById === 'function') {
        simpleModeToggleState.control =
          documentRef.getElementById('forceSimpleModeToggle') ?? simpleModeToggleState.control;
        if (!simpleModeToggleState.status) {
          simpleModeToggleState.status =
            documentRef.getElementById('forceSimpleModeStatus') ?? null;
        }
      }
    } else if (!simpleModeToggleState.status && documentRef?.getElementById) {
      simpleModeToggleState.status = documentRef.getElementById('forceSimpleModeStatus') ?? null;
    }
    const toggle = simpleModeToggleState.control;
    const status = simpleModeToggleState.status;
    const active =
      typeof options.active === 'boolean'
        ? options.active
        : config.forceSimpleMode === true || config.enableAdvancedExperience === false;
    if (toggle) {
      toggle.checked = active;
      toggle.dataset = toggle.dataset || {};
      toggle.dataset.simpleModeForced = active ? 'true' : 'false';
      toggle.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
    if (status) {
      if (active) {
        status.textContent = resolveSimpleModeToggleStatusMessage(options.reason, options.source);
        status.hidden = false;
      } else {
        status.textContent = '';
        status.hidden = true;
      }
    }
  }

    updateSimpleModeToggle({ source: 'config' });
    rememberSimpleModeBaseline(config);
    applySimpleFallbackConfig(config);
    updateSimpleModeToggle({
      active: true,
      reason: fallbackReason,
      source: typeof context?.source === 'string' && context.source.trim().length ? context.source : 'fallback',
    });
    let bootstrapInvoked = false;
    const triggerBootstrap = () => {
      if (bootstrapInvoked) {
        return true;
      }
      bootstrapInvoked = true;
      try {
        if (typeof scope.bootstrap === 'function') {
          const bootstrapResult = scope.bootstrap();
          if (bootstrapResult && typeof bootstrapResult.then === 'function') {
            bootstrapResult.catch((bootstrapError) => {
              handleBootstrapFailure(bootstrapError);
            });
          }
        }
      } catch (bootstrapError) {
        return handleBootstrapFailure(bootstrapError);
      }
      return true;
    };
    if (typeof ensureRendererModule === 'function') {
      const ensureOptions = {
        mode: 'simple',
        reason: `fallback:${fallbackReason || 'forced'}`,
        detail: {
          source:
            typeof context?.source === 'string' && context.source.trim().length
              ? context.source.trim()
              : 'fallback',
        },
      };
      let ensureResult;
      let ensureScheduled = false;
      try {
        ensureResult = ensureRendererModule('simple', ensureOptions);
        ensureScheduled = true;
      } catch (ensureError) {
        scope.console?.debug?.('Simple renderer module ensure threw during fallback.', ensureError);
        ensureScheduled = false;
      }
      if (ensureScheduled) {
        if (ensureResult && typeof ensureResult.then === 'function') {
          ensureResult
            .then(() => {
              triggerBootstrap();
            })
            .catch((ensureError) => {
              scope.console?.debug?.('Simple renderer module ensure failed during fallback.', ensureError);
              triggerBootstrap();
            });
          return true;
        triggerBootstrap();
        return true;
    triggerBootstrap();
    const allowRetry = context?.allowRetry === true;
    if (simpleFallbackAttempted && !allowRetry) {
    if (allowRetry && simpleFallbackAttempted) {
      simpleFallbackAttempted = false;
    }
