const { chromium } = require('playwright');

const MAX_RUN_DURATION_MS = 5 * 60 * 1000;

function logCheckpoint(scope, message, { elapsedFrom } = {}) {
  const elapsed = elapsedFrom ? ` +${Math.round((Date.now() - elapsedFrom) / 10) / 100}s` : '';
  console.info(`[E2E][${scope}] ${message}${elapsed}`);
}

const ALLOWED_WARNING_SUBSTRINGS = [
  'accounts.google.com',
  'ERR_CERT_AUTHORITY_INVALID',
  'ERR_TUNNEL_CONNECTION_FAILED',
  'GPU stall',
  'Automatic fallback to software WebGL',
  'WebGL output appears blocked',
  'Diagnostics context: {boundary: overlay, stage: blank-frame, scope: startup, status: error, level: error}',
  'Diagnostics context: {boundary: overlay, stage: boot, scope: audio, status: error, level: error}',
  'URL scheme "file" is not supported',
  'Failed to load model',
  'Model load failed',
  'Multiple instances of Three.js being imported',
  'Failed to load script',
  'Asset load failure',
  'Retrying explorer avatar asset',
  'Retrying first-person hands asset',
  'Retrying golem armour asset',
  'Texture pack unavailable — missing textures for',
  'No embedded audio samples were detected. Gameplay actions will fall back to an alert tone',
  'Portal shader initialisation failed; falling back to a standard material and default lighting.',
  'Welcome audio playback test failed',
  'Missing audio samples detected during startup',
  'Fallback beep active until audio assets are restored',
  "Refused to load media from 'data:audio/wav",
  "The Content Security Policy directive 'frame-ancestors' is ignored when delivered via a <meta> element.",
  "Refused to load media from 'data:audio/wav;base64,UklGRuQDAABXQVZFZm10'",
];

const FAIL_FAST_CONSOLE_IGNORE_SUBSTRINGS = [
  'Welcome audio playback test failed',
  'Diagnostics context: {boundary: overlay, stage: boot, scope: audio, status: error, level: error}',
  'Missing audio samples detected during startup',
  'Fallback beep active until audio assets are restored',
  'Critical asset availability check detected',
  'Texture pack unavailable — missing textures for',
];

const FAIL_FAST_PATTERNS = [
  { category: 'scene', regex: /\bscene\b[^\n]*(?:failed|failure|missing|unavailable|panic)/i },
  { category: 'scene', regex: /\brenderer\b[^\n]*(?:failed|failure|crash|panic|missing|unavailable)/i },
  { category: 'ui', regex: /\b(hud|overlay|ui|menu)\b[^\n]*(?:failed|failure|missing|unavailable|error)/i },
  {
    category: 'asset',
    regex:
      /\b(asset|texture|model|gltf|sprite)\b[^\n]*(?:load|preload|download|import)[^\n]*(?:fail|failure|error|missing|denied|blocked)/i,
  },
  { category: 'asset', regex: /\basset\b[^\n]*critical[^\n]*(?:fail|failure|error|missing|denied|blocked)/i },
  { category: 'asset', regex: /Missing audio samples/i },
];

function createConsoleCapture(page, scope) {
  const warnings = [];
  const infoLogs = [];
  let failFastError = null;
  let failFastReject;
  const failFastPromise = new Promise((_, reject) => {
    failFastReject = reject;
  });
  failFastPromise.catch(() => {});

  const triggerFailFast = (category, detail) => {
    if (failFastError) {
      return;
    }
    const reason = category ? `${category} error` : 'critical error';
    failFastError = new Error(`[E2E][${scope}] Fail-fast triggered by ${reason}: ${detail}`);
    failFastReject(failFastError);
  };

  page.on('console', (msg) => {
    const text = msg.text();
    if (msg.type() === 'log') {
      infoLogs.push(text);
    }
    if (msg.type() === 'error' || msg.type() === 'warning') {
      warnings.push(text);
    }
    if (msg.type() === 'error') {
      if (text.startsWith('Diagnostics context:')) {
        return;
      }
      if (FAIL_FAST_CONSOLE_IGNORE_SUBSTRINGS.some((value) => text.includes(value))) {
        return;
      }
      const pattern = FAIL_FAST_PATTERNS.find(({ regex }) => regex.test(text));
      if (pattern) {
        triggerFailFast(pattern.category, text);
      }
    }
  });
  page.on('requestfailed', (request) => {
    const failure = request.failure();
    console.error(
      `[E2E][${scope}] Request failed: ${request.method()} ${request.url()} (${failure?.errorText ?? 'unknown error'})`,
    );
    if (/(asset|texture|model|audio|sprite)/i.test(request.url())) {
      triggerFailFast('asset', `${request.method()} ${request.url()} (${failure?.errorText ?? 'unknown error'})`);
    }
  });
  return {
    warnings,
    infoLogs,
    guard(promise) {
      if (failFastError) {
        return Promise.reject(failFastError);
      }
      return Promise.race([Promise.resolve(promise), failFastPromise]);
    },
    assertHealthy() {
      if (failFastError) {
        throw failFastError;
      }
    },
  };
}

function findUnexpectedWarnings(warnings) {
  return warnings.filter(
    (msg) => !ALLOWED_WARNING_SUBSTRINGS.some((allowed) => msg.includes(allowed)),
  );
}

async function loadTestDriver(page) {
  try {
    const handle = await page.waitForFunction(
      () => {
        if (!navigator.webdriver) {
          return { status: 'skipped' };
        }
        const driver = window.__INFINITE_RAILS_TEST_DRIVER__;
        if (!driver || typeof driver !== 'object') {
          return null;
        }
        if (typeof driver.start !== 'function' || typeof driver.isRunning !== 'function') {
          return null;
        }
        const marker = 'simpleExperienceAutoStart';
        const normalise = (value) => {
          if (typeof value !== 'string') {
            return null;
          }
          const trimmed = value.trim();
          return trimmed.length ? trimmed : null;
        };
        const readAutomationMarker = () => {
          const button = document.querySelector('#startButton');
          const buttonState = normalise(button?.dataset?.[marker]);
          if (buttonState) {
            return buttonState;
          }
          const bodyState = normalise(document?.body?.dataset?.[marker]);
          if (bodyState) {
            return bodyState;
          }
          const globalState = normalise(
            typeof window.__INFINITE_RAILS_AUTOMATION_STATE__ === 'object'
              ? window.__INFINITE_RAILS_AUTOMATION_STATE__[marker]
              : null,
          );
          if (globalState) {
            return globalState;
          }
          return null;
        };
        return {
          status: 'ready',
          autoStartState: readAutomationMarker(),
        };
      },
      undefined,
      { timeout: 15000 },
    );
    const snapshot = await handle.jsonValue();
    await handle.dispose();
    return snapshot;
  } catch (error) {
    if (error?.name === 'TimeoutError') {
      return { status: 'timeout', error: 'Timed out while waiting for test driver.' };
    }
    return { status: 'error', error: error?.message ?? 'unknown error' };
  }
}

async function maybeClickStart(page) {
  const readRendererState = async () =>
    page
      .evaluate(() => ({
        bodyActive: document.body.classList.contains('game-active'),
        stateActive: Boolean(window.__INFINITE_RAILS_STATE__?.isRunning),
      }))
      .catch(() => ({ bodyActive: false, stateActive: false }));

  const readAutomationState = async () =>
    page
      .evaluate(() => {
        const marker = 'simpleExperienceAutoStart';
        const normalise = (value) => {
          if (typeof value !== 'string') {
            return null;
          }
          const trimmed = value.trim();
          return trimmed.length ? trimmed : null;
        };
        const button = document.querySelector('#startButton');
        const buttonState = normalise(button?.dataset?.[marker]);
        if (buttonState) {
          return buttonState;
        }
        const bodyState = normalise(document?.body?.dataset?.[marker]);
        if (bodyState) {
          return bodyState;
        }
        const globalState = normalise(
          typeof window.__INFINITE_RAILS_AUTOMATION_STATE__ === 'object'
            ? window.__INFINITE_RAILS_AUTOMATION_STATE__[marker]
            : null,
        );
        if (globalState) {
          return globalState;
        }
        return null;
      })
      .catch(() => null);

  const waitForRendererActivation = async ({ timeout = 6000, reason } = {}) => {
    try {
      await page.waitForFunction(
        () =>
          document.body.classList.contains('game-active') ||
          Boolean(window.__INFINITE_RAILS_STATE__?.isRunning),
        undefined,
        { timeout },
      );
      const state = await readRendererState();
      console.info(
        `[E2E][StartButton] Renderer activated${reason ? ` after ${reason}` : ''} (bodyActive=${state.bodyActive} stateActive=${state.stateActive}).`,
      );
      return true;
    } catch (error) {
      if (error?.name === 'TimeoutError') {
        console.info(
          `[E2E][StartButton] Renderer activation wait${reason ? ` for ${reason}` : ''} timed out after ${timeout}ms.`,
        );
      } else {
        console.info(
          `[E2E][StartButton] Renderer activation wait${reason ? ` for ${reason}` : ''} failed (${error?.message ?? 'unknown error'}).`,
        );
      }
      return false;
    }
  };

  const triggerManualStart = async () =>
    page
      .evaluate(async () => {
        const experience = window.__INFINITE_RAILS_ACTIVE_EXPERIENCE__;
        if (!experience || typeof experience.start !== 'function') {
          return { triggered: false, reason: 'experience-unavailable' };
        }
        if (experience.started) {
          return { triggered: true, alreadyRunning: true };
        }
        try {
          const result = experience.start();
          if (result && typeof result.then === 'function') {
            await result;
          }
          return { triggered: true, alreadyRunning: false };
        } catch (error) {
          return {
            triggered: false,
            reason: error instanceof Error ? error.message : String(error),
          };
        }
      })
      .catch(() => ({ triggered: false, reason: 'evaluation-error' }));

  const triggerExperienceStartViaHook = async () =>
    page
      .evaluate(() => {
        const result = {
          used: false,
          status: 'unavailable',
          error: null,
          detail: {
            hasHook: false,
            simpleAvailable: Boolean(window.SimpleExperience?.create),
            canvasPresent: Boolean(document.getElementById('gameCanvas')),
          },
        };
        try {
          const hooks = window.__INFINITE_RAILS_TEST_HOOKS__;
          const ensureExperience = hooks && typeof hooks.ensureSimpleExperience === 'function'
            ? hooks.ensureSimpleExperience
            : null;
          result.detail.hasHook = Boolean(ensureExperience);
          if (!ensureExperience) {
            result.status = 'no-hook';
            return result;
          }
          const mode = window.__INFINITE_RAILS_RENDERER_MODE__ || 'advanced';
          const instance = ensureExperience(mode);
          if (!instance || typeof instance !== 'object') {
            result.status = 'no-instance';
            result.used = true;
            return result;
          }
          if (instance.started) {
            result.status = 'already-started';
            result.used = true;
            return result;
          }
          if (typeof instance.start === 'function') {
            instance.start();
            result.status = 'started';
            result.used = true;
            return result;
          }
          result.status = 'no-start-method';
          result.used = true;
          return result;
        } catch (error) {
          result.used = true;
          result.status = 'error';
          result.error = typeof error?.message === 'string' ? error.message : 'unknown error';
          return result;
        }
      })
      .catch((evaluationError) => ({
        used: false,
        status: 'error',
        error: typeof evaluationError?.message === 'string' ? evaluationError.message : null,
      }));

  console.info('[E2E][StartButton] Inspecting renderer state prior to automation.');
  const rendererState = await readRendererState();
  if (rendererState.bodyActive || rendererState.stateActive) {
    console.info(
      `[E2E][StartButton] Automation skipped — renderer already active (bodyActive=${rendererState.bodyActive} stateActive=${rendererState.stateActive}).`,
    );
    return;
  }

  const startButton = page.locator('#startButton');
  if ((await startButton.count()) === 0) {
    console.info('[E2E][StartButton] Start button not present; assuming renderer advanced naturally.');
    return;
  }

  const visible = await startButton.isVisible().catch(() => false);
  if (!visible) {
    console.info('[E2E][StartButton] Start button hidden; awaiting renderer progress without automation.');
    const manualStart = await triggerManualStart();
    if (manualStart.triggered) {
      console.info(
        `[E2E][StartButton] Manual experience start invoked (alreadyRunning=${Boolean(manualStart.alreadyRunning)}).`,
      );
      return;
    }
    console.warn(
      `[E2E][StartButton] Manual start unavailable — reason: ${manualStart.reason ?? 'unknown'}; waiting for natural progression.`,
    );
    return;
  }

  console.info('[E2E][StartButton] Start button visible; continuing automation.');

  console.info('[E2E][StartButton] Capturing initial button state.');
  const initialState = await page.evaluate(() => {
    const button = document.querySelector('#startButton');
    if (!button) {
      return { disabled: null, preloading: null };
    }
    return {
      disabled: Boolean(button.disabled),
      preloading: button.getAttribute('data-preloading'),
    };
  });

  console.info(
    `[E2E][StartButton] Initial state: disabled=${initialState.disabled} data-preloading=${
      initialState.preloading ?? 'null'
    }.`,
  );

  if (initialState.preloading && initialState.preloading !== 'true') {
    throw new Error(
      `Start button entered a failure state before automation attempt (data-preloading="${initialState.preloading}").`,
    );
  }

  console.info('[E2E][StartButton] Awaiting readiness state.');
  const waitStart = Date.now();
  const manualTimeoutMs = 20000;
  let manualTimeoutId;
  const readinessPromise = page.waitForFunction(
    () => {
      const button = document.querySelector('#startButton');
      if (!button) return { status: 'failure', reason: 'missing button' };
      const preloading = button.getAttribute('data-preloading');
      if (preloading && preloading !== 'true') {
        return { status: 'failure', reason: `data-preloading="${preloading}"` };
      }
      if (!button.disabled && preloading !== 'true') {
        return { status: 'ready', disabled: button.disabled, preloading };
      }
      return false;
    },
    undefined,
    { timeout: 30000 },
  );

  const timeoutPromise = new Promise((_, reject) => {
    manualTimeoutId = setTimeout(() => {
      page
        .evaluate(() => {
          const button = document.querySelector('#startButton');
          const overlay = document.querySelector('#bootstrapOverlay');
          return {
            buttonPresent: Boolean(button),
            buttonDisabled: button ? Boolean(button.disabled) : null,
            buttonPreloading: button?.getAttribute('data-preloading') ?? null,
            bodyPreloading: document.body.getAttribute('data-preloading') ?? null,
            overlayPresent: Boolean(overlay),
            overlayHidden: overlay ? overlay.classList.contains('hidden') : null,
            overlayText: overlay?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
          };
        })
        .then((snapshot) => {
          console.info(
            `[E2E][StartButton] Timeout snapshot — buttonPresent=${snapshot.buttonPresent} disabled=${snapshot.buttonDisabled} data-preloading=${
              snapshot.buttonPreloading ?? 'null'
            } body-preloading=${snapshot.bodyPreloading ?? 'null'} overlayPresent=${snapshot.overlayPresent} overlayHidden=${
              snapshot.overlayHidden ?? 'null'
            } overlayText="${snapshot.overlayText ?? ''}".`,
          );
          reject(
            new Error(
              `Start button did not report readiness within ${manualTimeoutMs}ms (snapshot logged above).`,
            ),
          );
        })
        .catch((error) => {
          reject(
            new Error(
              `Start button readiness wait timed out after ${manualTimeoutMs}ms and diagnostics capture failed: ${error?.message ?? error}`,
            ),
          );
        });
    }, manualTimeoutMs);
  });

  console.info(`[E2E][StartButton] Wait loop initialised; manual timeout in ${manualTimeoutMs}ms.`);

  let readinessHandle;
  try {
    readinessHandle = await Promise.race([readinessPromise, timeoutPromise]);
  } finally {
    clearTimeout(manualTimeoutId);
  }

  if (!readinessHandle) {
    throw new Error('Start button wait resolved without a readiness handle.');
  }

  const readiness = await readinessHandle.jsonValue();
  await readinessHandle.dispose();

  if (readiness?.status === 'failure') {
    throw new Error(`Start button reported a failure state while waiting (${readiness.reason}).`);
  }
  if (readiness?.status !== 'ready') {
    throw new Error('Start button did not become ready for automation.');
  }

  const waitDurationSeconds = Math.round((Date.now() - waitStart) / 10) / 100;
  console.info(
    `[E2E][StartButton] Readiness confirmed after ${waitDurationSeconds}s — disabled=${readiness.disabled} data-preloading=${
      readiness.preloading ?? 'null'
    }.`,
  );

  const driverSnapshot = await loadTestDriver(page);
  if (driverSnapshot?.status === 'ready') {
    console.info(
      `[E2E][StartButton] Test driver ready (autoStartState=${driverSnapshot.autoStartState ?? 'null'}).`,
    );
  } else if (driverSnapshot?.status === 'skipped') {
    console.info('[E2E][StartButton] Test driver skipped (automation not detected).');
  } else if (driverSnapshot?.status === 'timeout') {
    console.info('[E2E][StartButton] Test driver wait timed out; continuing with manual flow.');
  } else if (driverSnapshot?.status === 'error') {
    console.info(`[E2E][StartButton] Test driver initialisation error (${driverSnapshot.error}).`);
  }

  try {
    await page.waitForFunction(() => Boolean(window.SimpleExperience?.create), undefined, { timeout: 15000 });
  } catch (error) {
    const availability = await page
      .evaluate(() => ({
        simpleAvailable: Boolean(window.SimpleExperience?.create),
        hasHook: Boolean(window.__INFINITE_RAILS_TEST_HOOKS__?.ensureSimpleExperience),
      }))
      .catch(() => ({ simpleAvailable: false, hasHook: false }));
    console.info(
      `[E2E][StartButton] SimpleExperience availability wait failed (simpleAvailable=${availability.simpleAvailable} hasHook=${availability.hasHook}).`,
    );
  }
  console.info('[E2E][StartButton] SimpleExperience availability check completed.');

  let automationState = await readAutomationState();
  if (automationState === 'pending') {
    console.info('[E2E][StartButton] Automation flagged auto-start (pending); awaiting renderer activation.');
  } else if (automationState === 'true') {
    console.info('[E2E][StartButton] Automation flagged auto-start (true); verifying renderer activation.');
  }
  if (automationState === 'true' || automationState === 'pending') {
    console.info(
      `[E2E][StartButton] Automation flagged auto-start (${automationState}); awaiting renderer activation.`,
    );
    if (await waitForRendererActivation({ reason: 'automation flag', timeout: 12000 })) {
      const resolvedState = await readAutomationState();
      if (resolvedState === 'true') {
        console.info('[E2E][StartButton] Automation completed auto-start (state=true).');
      }
      return;
    }
    console.info(
      `[E2E][StartButton] Automation flag ${automationState} did not activate renderer in time; continuing manual flow.`,
    );
  }

  console.info('[E2E][StartButton] Dispatching click.');
  const readyVisible = await startButton.isVisible().catch(() => false);
  if (!readyVisible) {
    console.info('[E2E][StartButton] Start button became hidden before click; verifying renderer activation.');
    const hiddenDiagnostics = await page
      .evaluate(() => {
        const intro = document.querySelector('#bootstrapIntro');
        const normalise = (value) => {
          if (typeof value !== 'string') {
            return null;
          }
          const trimmed = value.trim();
          return trimmed.length ? trimmed : null;
        };
        const readMarker = (target, key) => normalise(target?.dataset?.[key]);
        const markerKey = 'simpleExperienceAutoStart';
        const button = document.querySelector('#startButton');
        const globalState =
          typeof window.__INFINITE_RAILS_AUTOMATION_STATE__ === 'object'
            ? window.__INFINITE_RAILS_AUTOMATION_STATE__[markerKey]
            : null;
        return {
          introHidden: intro ? intro.classList.contains('hidden') : null,
          introDisplay:
            intro && typeof window.getComputedStyle === 'function'
              ? window.getComputedStyle(intro).display
              : null,
          automationMarkers: {
            button: readMarker(button, markerKey),
            body: readMarker(document.body, markerKey),
            global: normalise(globalState),
          },
        };
      })
      .catch((error) => ({ introHidden: null, introDisplay: null, automationMarkersError: error?.message ?? 'evaluation error' }));
    if (hiddenDiagnostics) {
      const { introHidden, introDisplay, automationMarkers, automationMarkersError } = hiddenDiagnostics;
      if (automationMarkersError) {
        console.info(
          `[E2E][StartButton] Hidden-button diagnostics failed (${automationMarkersError}).`,
        );
      } else {
        console.info(
          `[E2E][StartButton] Hidden-button diagnostics — introHidden=${introHidden} introDisplay=${introDisplay ?? 'null'} markers=${JSON.stringify(automationMarkers)}.`,
        );
      }
    }
    automationState = await readAutomationState();
    if (automationState === 'true' || automationState === 'pending') {
      console.info(
        `[E2E][StartButton] Automation flag ${automationState} active after button hid; awaiting renderer activation.`,
      );
      if (await waitForRendererActivation({ reason: 'hidden-button automation flag', timeout: 12000 })) {
        return;
      }
      console.info(
        `[E2E][StartButton] Automation flag ${automationState} unresolved after hidden-button wait; continuing fallbacks.`,
      );
    }
    const hiddenState = await readRendererState();
    if (hiddenState.bodyActive || hiddenState.stateActive) {
      console.info(
        `[E2E][StartButton] Renderer already active after button hid (bodyActive=${hiddenState.bodyActive} stateActive=${hiddenState.stateActive}).`,
      );
      return;
    }

    if (await waitForRendererActivation({ reason: 'hidden button' })) {
      return;
    }

    const hiddenHookResult = await triggerExperienceStartViaHook();
    if (hiddenHookResult.used) {
      if (hiddenHookResult.status === 'started' || hiddenHookResult.status === 'already-started') {
        const stateAfterHook = await readRendererState();
        console.info(
          `[E2E][StartButton] Experience started via hook after button hid (${hiddenHookResult.status}) — bodyActive=${stateAfterHook.bodyActive} stateActive=${stateAfterHook.stateActive}.`,
        );
        return;
      }
      if (hiddenHookResult.status === 'error') {
        console.info(
          `[E2E][StartButton] Hidden-button hook attempt errored (${hiddenHookResult.error ?? 'unknown error'}); attempting direct start.`,
        );
      } else {
        console.info(
          `[E2E][StartButton] Hidden-button hook reported status ${hiddenHookResult.status}; attempting direct start (detail=${JSON.stringify(hiddenHookResult.detail ?? {})}).`,
        );
      }
    }

    const hiddenManualStart = await triggerManualStart();
    if (hiddenManualStart.triggered) {
      console.info(
        `[E2E][StartButton] Manual experience start invoked after hidden button (alreadyRunning=${Boolean(hiddenManualStart.alreadyRunning)}).`,
      );
      return;
    }

    const postHiddenState = await readRendererState();
    if (postHiddenState.bodyActive || postHiddenState.stateActive) {
      console.info(
        `[E2E][StartButton] Renderer activated while reconciling hidden button (bodyActive=${postHiddenState.bodyActive} stateActive=${postHiddenState.stateActive}).`,
      );
      return;
    }

    if (await waitForRendererActivation({ reason: 'post-hidden reconciliation' })) {
      return;
    }

    throw new Error('Start button became hidden before automation but renderer remained inactive.');
  }
  automationState = await readAutomationState();
  if (automationState === 'true' || automationState === 'pending') {
    console.info(
      `[E2E][StartButton] Automation flagged auto-start (${automationState}); skipping manual click.`,
    );
    return;
  }
  const hookResult = await triggerExperienceStartViaHook();
  if (hookResult.used) {
    if (hookResult.status === 'started' || hookResult.status === 'already-started') {
      const postHookState = await page
        .evaluate(() => ({
          bodyActive: document.body.classList.contains('game-active'),
          stateActive: Boolean(window.__INFINITE_RAILS_STATE__?.isRunning),
        }))
        .catch(() => ({ bodyActive: false, stateActive: false }));
      console.info(
        `[E2E][StartButton] Experience started via test hook (${hookResult.status}) — bodyActive=${postHookState.bodyActive} stateActive=${postHookState.stateActive}.`,
      );
      return;
    }
    if (hookResult.status === 'error') {
      console.info(
        `[E2E][StartButton] Experience start hook errored (${hookResult.error ?? 'unknown error'}); continuing with DOM interaction.`,
      );
    } else if (hookResult.status === 'no-start-method') {
      console.info('[E2E][StartButton] Experience hook returned an instance without start method; falling back to DOM interaction.');
    } else if (hookResult.status === 'no-instance') {
      console.info(
        `[E2E][StartButton] Experience hook returned no instance (hasHook=${hookResult.detail?.hasHook ?? false} simpleAvailable=${hookResult.detail?.simpleAvailable ?? false} canvasPresent=${hookResult.detail?.canvasPresent ?? false}); falling back to DOM interaction.`,
      );
    } else {
      console.info(
        `[E2E][StartButton] Experience hook reported status ${hookResult.status}; falling back to DOM interaction (detail=${JSON.stringify(hookResult.detail ?? {})}).`,
      );
    }
  }
  const clickResult = await page
    .evaluate(() => {
      const summary = {
        status: 'unknown',
      };
      const button = document.querySelector('#startButton');
      if (!button) {
        summary.status = 'missing';
        return summary;
      }
      if (typeof button.click === 'function') {
        button.click();
        summary.status = 'clicked';
        return summary;
      }
      if (typeof button.dispatchEvent === 'function') {
        const event =
          typeof window.MouseEvent === 'function'
            ? new window.MouseEvent('click', { bubbles: true, cancelable: true })
            : null;
        if (event) {
          button.dispatchEvent(event);
          summary.status = 'dispatched';
          return summary;
        }
        summary.status = 'no-event';
        return summary;
      }
      summary.status = 'no-method';
      return summary;
    })
    .catch((evaluationError) => ({
      status: 'error',
      message: typeof evaluationError?.message === 'string' ? evaluationError.message : null,
    }));
  if (clickResult.status === 'clicked' || clickResult.status === 'dispatched') {
    const postClickState = await page
      .evaluate(() => ({
        bodyActive: document.body.classList.contains('game-active'),
        stateActive: Boolean(window.__INFINITE_RAILS_STATE__?.isRunning),
      }))
      .catch(() => ({ bodyActive: false, stateActive: false }));
    const via = clickResult.status === 'clicked' ? 'native click' : 'dispatched event';
    console.info(
      `[E2E][StartButton] Click dispatched via ${via} — bodyActive=${postClickState.bodyActive} stateActive=${postClickState.stateActive}.`,
    );
    return;
  }
  if (clickResult.status === 'missing') {
    console.info('[E2E][StartButton] Start button vanished before dispatch; assuming renderer progressed.');
    return;
  }
  if (clickResult.status === 'no-method' || clickResult.status === 'no-event') {
    console.info('[E2E][StartButton] Start button interaction unavailable; unable to continue.');
    throw new Error('Start button automation failed — interaction methods unavailable.');
  }
  if (clickResult.status === 'error') {
    console.info(
      `[E2E][StartButton] DOM evaluation failed while clicking (${clickResult.message ?? 'unknown error'}).`,
    );
    throw new Error('Start button automation failed during DOM evaluation.');
  }
  throw new Error(`Start button automation resolved with unexpected status (${clickResult.status}).`);
}

async function ensureGameHudReady(page, { requireNight = false } = {}) {
  const hudState = await page.evaluate(() => ({
    gameActive: document.body.classList.contains('game-active'),
    heartsMarkup: document.querySelector('#hearts')?.innerHTML ?? '',
    timeText: document.querySelector('#timeOfDay')?.textContent?.trim() ?? '',
    dimensionHeading: document.querySelector('#dimensionInfo h3')?.textContent?.trim() ?? '',
    portalLabel: document.querySelector('#portalProgress .label')?.textContent?.trim() ?? '',
  }));
  if (!hudState.gameActive) {
    throw new Error('HUD did not transition to the active gameplay state.');
  }
  if (!hudState.heartsMarkup || hudState.heartsMarkup.trim().length === 0) {
    throw new Error('Heart display did not initialise.');
  }
  if (!hudState.timeText) {
    throw new Error('Time-of-day indicator remained empty.');
  }
  if (requireNight && !/Nightfall|Dusk/i.test(hudState.timeText)) {
    throw new Error('Day/night indicator did not reflect forced night cycle.');
  }
  if (!hudState.dimensionHeading) {
    throw new Error('Dimension info heading was empty.');
  }
  if (!hudState.portalLabel) {
    throw new Error('Portal progress label did not populate.');
  }
  return hudState;
}

async function waitForLeaderboard(page) {
  await page.waitForFunction(
    () => {
      const rows = Array.from(document.querySelectorAll('#scoreboardList tr')).filter(
        (row) => row.textContent.trim().length > 0,
      );
      return rows.length > 0;
    },
    undefined,
    { timeout: 15000 },
  );

  const { rows, summaries } = await page.evaluate(() => {
    const entries = Array.from(document.querySelectorAll('#scoreboardList tr'))
      .map((row) => row.textContent.replace(/\s+/g, ' ').trim())
      .filter((text) => text.length > 0);
    return {
      rows: entries.length,
      summaries: entries,
    };
  });
  if (rows === 0) {
    throw new Error('Leaderboard failed to populate with the current run.');
  }
  const dimensionLabels = /Origin|Rock|Stone|Tar|Marble|Netherite/i;
  if (!summaries.some((text) => dimensionLabels.test(text))) {
    throw new Error('Leaderboard rows did not include a dimension summary.');
  }
  return { rows, summaries };
}

async function validateScoreHud(page, { requireDimensionCount = false } = {}) {
  const scoreHud = await page.evaluate(() => ({
    total: Number.parseInt(document.querySelector('#scoreTotal')?.textContent ?? '0', 10),
    recipes: Number.parseInt(document.querySelector('#scoreRecipes')?.textContent ?? '0', 10),
    dimensions: Number.parseInt(document.querySelector('#scoreDimensions')?.textContent ?? '0', 10),
  }));
  if (!Number.isFinite(scoreHud.total) || scoreHud.total < 0) {
    throw new Error('Score HUD did not initialise with a finite total.');
  }
  if (requireDimensionCount && (!Number.isFinite(scoreHud.dimensions) || scoreHud.dimensions < 1)) {
    throw new Error('Dimension counter did not reflect progression.');
  }
  return scoreHud;
}

async function runAdvancedScenario(browser) {
  const scenarioStart = Date.now();
  logCheckpoint('Advanced', 'Scenario start');
  const page = await browser.newPage();
  const capture = createConsoleCapture(page, 'Advanced');
  const { warnings } = capture;
  page.on('pageerror', (err) => {
    throw err;
  });

  try {
    logCheckpoint('Advanced', 'Navigating to advanced renderer', { elapsedFrom: scenarioStart });
    await capture.guard(
      page.goto('file://' + process.cwd() + '/index.html', {
        waitUntil: 'domcontentloaded',
      }),
    );
    logCheckpoint('Advanced', 'Ensuring start button handled', { elapsedFrom: scenarioStart });
    await capture.guard(maybeClickStart(page));
    logCheckpoint('Advanced', 'Waiting for gameplay activation', { elapsedFrom: scenarioStart });
    await capture.guard(
      page.waitForFunction(
        () => document.body.classList.contains('game-active'),
        undefined,
        {
          timeout: 15000,
        },
      ),
    );
    logCheckpoint('Advanced', 'Gameplay activation confirmed', { elapsedFrom: scenarioStart });
    await capture.guard(
      page.waitForFunction(
        () => Boolean(window.__INFINITE_RAILS_STATE__),
        undefined,
        { timeout: 15000 },
      ),
    );
    logCheckpoint('Advanced', 'Renderer state object detected', { elapsedFrom: scenarioStart });

    logCheckpoint('Advanced', 'Collecting renderer state snapshot', { elapsedFrom: scenarioStart });
    const stateSnapshot = await capture.guard(
      page.evaluate(() => {
        const state = window.__INFINITE_RAILS_STATE__;
        if (!state) return null;
        const worldRows = Array.isArray(state.world) ? state.world.length : 0;
        const worldCols = Array.isArray(state.world?.[0]) ? state.world[0].length : 0;
        const eventCount = document.querySelectorAll('#eventLog li').length;
        return {
          isRunning: Boolean(state.isRunning),
          worldRows,
          worldCols,
          rendererMode: window.__INFINITE_RAILS_RENDERER_MODE__ ?? null,
          dimensionName: state.dimension?.name ?? null,
          eventCount,
        };
      }),
    );
    if (!stateSnapshot || !stateSnapshot.isRunning) {
      throw new Error('Advanced renderer did not start running.');
    }
    if (stateSnapshot.rendererMode !== 'advanced') {
      throw new Error(`Advanced renderer did not report the expected mode flag (saw "${stateSnapshot.rendererMode}").`);
    }
    if (!stateSnapshot.dimensionName) {
      throw new Error('Advanced renderer did not report an active dimension.');
    }
    if (stateSnapshot.worldRows * stateSnapshot.worldCols < 1024) {
      throw new Error('Advanced renderer world generation incomplete.');
    }
    if (stateSnapshot.eventCount === 0) {
      throw new Error('Advanced renderer did not record any event log entries.');
    }
    logCheckpoint(
      'Advanced',
      `Renderer snapshot summary — rows: ${stateSnapshot.worldRows}, cols: ${stateSnapshot.worldCols}, events: ${stateSnapshot.eventCount}, dimension: ${stateSnapshot.dimensionName}`,
      { elapsedFrom: scenarioStart },
    );

    logCheckpoint('Advanced', 'Validating HUD and leaderboard', { elapsedFrom: scenarioStart });
    const hudState = await capture.guard(ensureGameHudReady(page));
    logCheckpoint(
      'Advanced',
      `HUD ready — time: ${hudState.timeText}, dimension: ${hudState.dimensionHeading}, portal: ${hudState.portalLabel}`,
      { elapsedFrom: scenarioStart },
    );
    const leaderboard = await capture.guard(waitForLeaderboard(page));
    logCheckpoint(
      'Advanced',
      `Leaderboard populated — rows: ${leaderboard.rows}`,
      { elapsedFrom: scenarioStart },
    );
    const scoreHud = await capture.guard(validateScoreHud(page));
    logCheckpoint(
      'Advanced',
      `Score HUD totals — total: ${scoreHud.total}, recipes: ${scoreHud.recipes}, dimensions: ${scoreHud.dimensions}`,
      { elapsedFrom: scenarioStart },
    );

    const unexpected = findUnexpectedWarnings(warnings);
    if (unexpected.length) {
      throw new Error(`Console reported unexpected issues during advanced run: ${unexpected.join(' | ')}`);
    }
    capture.assertHealthy();
    logCheckpoint('Advanced', 'Scenario complete', { elapsedFrom: scenarioStart });
  } catch (error) {
    if (error instanceof Error) {
      error.message = `[E2E][Advanced] ${error.message}`;
      throw error;
    }
    throw new Error(`[E2E][Advanced] ${error}`);
  } finally {
    await page.close();
  }
}

async function runSimpleScenario(browser) {
  const scenarioStart = Date.now();
  logCheckpoint('Sandbox', 'Scenario start');
  const page = await browser.newPage();
  const capture = createConsoleCapture(page, 'Sandbox');
  const { warnings, infoLogs } = capture;
  page.on('pageerror', (err) => {
    throw err;
  });

  try {
    logCheckpoint('Sandbox', 'Navigating to simple renderer', { elapsedFrom: scenarioStart });
    await capture.guard(
      page.goto('file://' + process.cwd() + '/index.html?mode=simple', {
        waitUntil: 'domcontentloaded',
      }),
    );
    logCheckpoint('Sandbox', 'Handling start flow', { elapsedFrom: scenarioStart });
    await capture.guard(maybeClickStart(page));
    await capture.guard(page.waitForTimeout(1500));
    const introVisible = await capture.guard(page.isVisible('#introModal').catch(() => false));
    if (introVisible) {
      throw new Error('Intro modal remained visible after starting the game.');
    }

    const eventCount = await capture.guard(
      page.evaluate(() => document.querySelectorAll('#eventLog li').length),
    );
    if (eventCount === 0) {
      throw new Error('Sandbox event log did not record any entries.');
    }

    const worldGenerated = infoLogs.find((line) => line.includes('World generation summary —'));
    if (!worldGenerated) {
      console.warn('World generation log was not captured; relying on debug snapshot.');
    }
    const steveVisible = infoLogs.find((line) => line.includes('Avatar visibility confirmed —'));
    if (!steveVisible) {
      console.warn('Player visibility confirmation log missing; verifying via scene graph.');
    }
    const dimensionLog = infoLogs.find((line) => line.includes('Dimension activation notice —'));
    if (!dimensionLog) {
      console.warn('Dimension activation log missing; relying on HUD validation.');
    }

    logCheckpoint('Sandbox', 'Waiting for debug hooks', { elapsedFrom: scenarioStart });
    await capture.guard(
      page.waitForFunction(
        () => Boolean(window.__INFINITE_RAILS_DEBUG__?.getSnapshot),
        undefined,
        {
          timeout: 15000,
        },
      ),
    );
    await capture.guard(
      page.waitForFunction(
        () => (window.__INFINITE_RAILS_DEBUG__?.getSnapshot?.()?.voxelColumns ?? 0) >= 4096,
        undefined,
        { timeout: 15000 },
      ),
    );
    logCheckpoint('Sandbox', 'Applying debug mutations', { elapsedFrom: scenarioStart });
    await capture.guard(
      page.evaluate(() => {
        const debug = window.__INFINITE_RAILS_DEBUG__;
        debug?.forceNight?.();
        debug?.spawnZombieWave?.(3);
      }),
    );
    await capture.guard(
      page.waitForFunction(
        () => (window.__INFINITE_RAILS_DEBUG__?.getSnapshot?.()?.zombieCount ?? 0) > 0,
        undefined,
        { timeout: 10000 },
      ),
    );
    logCheckpoint('Sandbox', 'Collecting debug snapshot', { elapsedFrom: scenarioStart });
    const debugSnapshot = await capture.guard(
      page.evaluate(() =>
        window.__INFINITE_RAILS_DEBUG__?.getSnapshot ? window.__INFINITE_RAILS_DEBUG__.getSnapshot() : null,
      ),
    );
    if (!debugSnapshot) {
      throw new Error('Debug snapshot unavailable — gameplay instance not exposed.');
    }
    if (!debugSnapshot.started) {
      throw new Error('Gameplay instance did not report a started state.');
    }
    if (debugSnapshot.voxelColumns < 4096) {
      throw new Error(`World generation incomplete — expected 4096 columns, saw ${debugSnapshot.voxelColumns}.`);
    }
    if (debugSnapshot.sceneChildren < 3) {
      throw new Error('Scene graph missing expected child nodes.');
    }

    logCheckpoint('Sandbox', 'Validating HUD after debug actions', { elapsedFrom: scenarioStart });
    const hudState = await capture.guard(ensureGameHudReady(page, { requireNight: true }));
    logCheckpoint(
      'Sandbox',
      `HUD ready — time: ${hudState.timeText}, dimension: ${hudState.dimensionHeading}, portal: ${hudState.portalLabel}`,
      { elapsedFrom: scenarioStart },
    );

    logCheckpoint('Sandbox', 'Driving portal progression', { elapsedFrom: scenarioStart });
    await capture.guard(
      page.evaluate(() => {
        const debug = window.__INFINITE_RAILS_DEBUG__;
        debug?.completePortalFrame?.();
        debug?.ignitePortal?.();
      }),
    );
    await capture.guard(
      page.waitForFunction(
        () => Boolean(window.__INFINITE_RAILS_DEBUG__?.getSnapshot?.()?.portalActivated),
        undefined,
        { timeout: 8000 },
      ),
    );
    await capture.guard(
      page.evaluate(() => {
        window.__INFINITE_RAILS_DEBUG__?.advanceDimension?.();
      }),
    );
    await capture.guard(
      page.waitForFunction(
        () => (window.__INFINITE_RAILS_DEBUG__?.getSnapshot?.()?.dimensionIndex ?? 0) > 0,
        undefined,
        { timeout: 10000 },
      ),
    );

    logCheckpoint('Sandbox', 'Validating leaderboard and score HUD', { elapsedFrom: scenarioStart });
    const leaderboard = await capture.guard(waitForLeaderboard(page));
    logCheckpoint('Sandbox', `Leaderboard populated — rows: ${leaderboard.rows}`, {
      elapsedFrom: scenarioStart,
    });
    const scoreHud = await capture.guard(validateScoreHud(page, { requireDimensionCount: true }));
    logCheckpoint(
      'Sandbox',
      `Score HUD totals — total: ${scoreHud.total}, recipes: ${scoreHud.recipes}, dimensions: ${scoreHud.dimensions}`,
      { elapsedFrom: scenarioStart },
    );

    if (!debugSnapshot.hudActive) {
      throw new Error('Debug snapshot indicates HUD inactive despite gameplay start.');
    }

    const unexpected = findUnexpectedWarnings(warnings);
    if (unexpected.length) {
      throw new Error(`Console reported unexpected issues during sandbox run: ${unexpected.join(' | ')}`);
    }
    capture.assertHealthy();
    logCheckpoint('Sandbox', 'Scenario complete', { elapsedFrom: scenarioStart });
  } finally {
    await page.close();
  }
}

async function run() {
  const runStart = Date.now();
  let timeoutId;
  const watchdog = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`[E2E] Playwright scenarios exceeded ${MAX_RUN_DURATION_MS}ms.`));
    }, MAX_RUN_DURATION_MS);
  });

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    await Promise.race([
      (async () => {
        await runAdvancedScenario(browser);
        await runSimpleScenario(browser);
      })(),
      watchdog,
    ]);
    const totalSeconds = Math.round((Date.now() - runStart) / 10) / 100;
    console.info(`[E2E] Completed all Playwright scenarios in ${totalSeconds}s.`);
  } finally {
    clearTimeout(timeoutId);
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
