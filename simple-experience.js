      this.lastInputBindingObservation = null;
        this.observeInputBindings({ reason: 'start' });
        this.observeInputBindings({ reason: 'dimension-rebind' });
    observeInputBindings(options = {}) {
      const reasonRaw = typeof options?.reason === 'string' ? options.reason.trim() : '';
      const reason = reasonRaw || 'manual';
      const observation = {
        reason,
        timestamp: new Date().toISOString(),
        bound: false,
        coverage: { keyboard: false, mouse: false, touch: false },
        propagation: {
          keydown: {
            target: null,
            context: null,
            handled: false,
            prevented: false,
            defaultPrevented: false,
            flagged: false,
            missing: true,
            error: null,
          },
          click: {
            target: null,
            context: null,
            handled: false,
            prevented: false,
            defaultPrevented: false,
            flagged: false,
            missing: true,
            error: null,
            effects: null,
          },
        },
        bindingFailures: Array.isArray(this.eventBindingFailures)
          ? this.eventBindingFailures.map((failure) => ({
              event: failure?.eventName ?? null,
              target: failure?.targetLabel ?? null,
              reason: failure?.reason ?? null,
            }))
          : [],
        error: null,
        records: [],
      };

      try {
        this.bindEvents();
        observation.bound = this.eventsBound === true;
      } catch (error) {
        observation.error = normaliseLiveDiagnosticError(error);
        this.lastInputBindingObservation = observation;
        return observation;
      }

      const records = Array.isArray(this.boundEventRecords) ? this.boundEventRecords : [];
      observation.records = records.map((record) => ({
        event: record?.eventName ?? null,
        target: record?.targetLabel ?? null,
        context: record?.contextLabel ?? null,
      }));

      const findRecord = (targetLabel, eventName) =>
        records.find(
          (record) => record && record.eventName === eventName && record.targetLabel === targetLabel,
        );

      observation.coverage.keyboard = Boolean(
        findRecord('document', 'keydown') || findRecord('window', 'keydown') || findRecord('canvas', 'keydown'),
      );
      observation.coverage.mouse = Boolean(
        findRecord('document', 'mousedown') || findRecord('canvas', 'mousedown'),
      );
      observation.coverage.touch = Boolean(findRecord('window', 'touchstart'));

      const evaluatePropagation = (candidates, createEvent, applyInterceptors) => {
        const outcome = {
          target: null,
          context: null,
          handled: false,
          prevented: false,
          defaultPrevented: false,
          flagged: false,
          missing: true,
          error: null,
          effects: null,
        };
        for (let index = 0; index < candidates.length; index += 1) {
          const candidate = candidates[index];
          const record = findRecord(candidate.target, candidate.event);
          if (!record) {
            continue;
          }
          outcome.target = record.targetLabel ?? candidate.target;
          outcome.context = record.contextLabel ?? null;
          outcome.missing = false;
          if (typeof record.listener !== 'function') {
            outcome.error = { message: 'listener-missing' };
            return outcome;
          }
          let event;
          try {
            event = createEvent(record);
          } catch (eventError) {
            outcome.error = normaliseLiveDiagnosticError(eventError);
            return outcome;
          }
          if (!event || typeof event !== 'object') {
            outcome.error = { message: 'event-unavailable' };
            return outcome;
          }
          let prevented = false;
          const originalPrevent =
            typeof event.preventDefault === 'function' ? event.preventDefault.bind(event) : null;
          event.preventDefault = () => {
            prevented = true;
            event.defaultPrevented = true;
            if (originalPrevent) {
              try {
                originalPrevent();
              } catch (preventError) {
                if (!outcome.error) {
                  outcome.error = normaliseLiveDiagnosticError(preventError);
                }
              }
            }
          };
          const cleanup =
            typeof applyInterceptors === 'function'
              ? applyInterceptors.call(this, event, outcome)
              : null;
          try {
            record.listener(event);
            outcome.handled = true;
          } catch (handlerError) {
            outcome.error = normaliseLiveDiagnosticError(handlerError);
          } finally {
            if (typeof cleanup === 'function') {
              try {
                cleanup();
              } catch (restoreError) {
                if (typeof console !== 'undefined' && typeof console.debug === 'function') {
                  console.debug('Failed to restore input binding observer interceptors.', restoreError);
                }
              }
            }
          }
          outcome.prevented = prevented || event.defaultPrevented === true;
          outcome.defaultPrevented = event.defaultPrevented === true;
          if (typeof event.__infiniteRailsHandled === 'boolean') {
            outcome.flagged = event.__infiniteRailsHandled === true;
          }
          return outcome;
        }
        return outcome;
      };

      const keydownOutcome = evaluatePropagation(
        [
          { target: 'document', event: 'keydown' },
          { target: 'window', event: 'keydown' },
          { target: 'canvas', event: 'keydown' },
        ],
        () => ({
          type: 'keydown',
          code: '',
          key: '',
          repeat: false,
          preventDefault() {},
          defaultPrevented: false,
          __infiniteRailsHandled: false,
        }),
      );
      observation.propagation.keydown = keydownOutcome;

      const clickOutcome = evaluatePropagation(
        [
          { target: 'document', event: 'mousedown' },
          { target: 'canvas', event: 'mousedown' },
        ],
        () => ({
          type: 'mousedown',
          button: 0,
          target: this.canvas || null,
          preventDefault() {},
          defaultPrevented: false,
        }),
        function interceptPointer(event, outcome) {
          const effects = {
            pointerLock: false,
            fallbackDrag: false,
            mine: false,
            place: false,
            pointerHint: false,
          };
          const interceptMethod = (methodName, effectKey) => {
            const original = typeof this[methodName] === 'function' ? this[methodName] : null;
            this[methodName] = (...args) => {
              effects[effectKey] = true;
              return undefined;
            };
            return () => {
              if (original) {
                this[methodName] = original;
              } else {
                delete this[methodName];
              }
            };
          };
          const restoreFns = [
            interceptMethod('attemptPointerLock', 'pointerLock'),
            interceptMethod('beginPointerFallbackDrag', 'fallbackDrag'),
            interceptMethod('mineBlock', 'mine'),
            interceptMethod('placeBlock', 'place'),
            interceptMethod('updatePointerHintForInputMode', 'pointerHint'),
          ];
          return () => {
            restoreFns.forEach((restore) => {
              if (typeof restore === 'function') {
                restore();
              }
            });
            outcome.effects = effects;
          };
        },
      );
      observation.propagation.click = clickOutcome;

      this.lastInputBindingObservation = observation;
      return observation;
    }

        listener: safeHandler,
