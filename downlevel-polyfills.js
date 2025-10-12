'use strict';
(function installDownlevelPolyfills() {
  var scope =
    (typeof globalThis !== 'undefined' && globalThis) ||
    (typeof self !== 'undefined' && self) ||
    (typeof window !== 'undefined' && window) ||
    (typeof global !== 'undefined' && global) ||
    null;

  if (!scope) {
    return;
  }

  var namespace = scope.InfiniteRails || (scope.InfiniteRails = {});
  var registry = namespace.polyfills || (namespace.polyfills = {});
  var applied = registry.applied || (registry.applied = {});

  function mark(name, detail) {
    try {
      applied[name] = detail || true;
    } catch (error) {
      // Ignore assignment failures in frozen environments.
    }
  }

  if (typeof scope.globalThis !== 'object' || scope.globalThis !== scope) {
    try {
      Object.defineProperty(scope, 'globalThis', {
        configurable: true,
        enumerable: false,
        writable: true,
        value: scope,
      });
      mark('globalThis', 'defined');
    } catch (error) {
      // Ignore environments where globalThis cannot be defined.
    }
  }

  if (typeof scope.queueMicrotask !== 'function') {
    var resolvedPromise =
      typeof scope.Promise === 'function' && scope.Promise.resolve
        ? scope.Promise.resolve()
        : null;
    scope.queueMicrotask = function queueMicrotaskPolyfill(callback) {
      if (typeof callback !== 'function') {
        throw new TypeError('queueMicrotask callback must be a function.');
      }
      if (resolvedPromise) {
        resolvedPromise
          .then(function executeMicrotask() {
            callback();
          })
          .catch(function rethrowAsync(error) {
            setTimeout(function throwAsync() {
              throw error;
            }, 0);
          });
        return;
      }
      setTimeout(callback, 0);
    };
    mark('queueMicrotask', resolvedPromise ? 'promise' : 'timeout');
  }

  var rafInstalled = false;
  if (typeof scope.requestAnimationFrame !== 'function') {
    var rafLastTime = 0;
    scope.requestAnimationFrame = function requestAnimationFramePolyfill(callback) {
      var now = Date.now();
      var delay = Math.max(0, 16 - (now - rafLastTime));
      var id = scope.setTimeout(function invokeCallback() {
        rafLastTime = Date.now();
        if (typeof callback === 'function') {
          callback(rafLastTime);
        }
      }, delay);
      return id;
    };
    rafInstalled = true;
    mark('requestAnimationFrame', 'timeout');
  }

  if (typeof scope.cancelAnimationFrame !== 'function') {
    scope.cancelAnimationFrame = function cancelAnimationFramePolyfill(handle) {
      if (typeof scope.clearTimeout === 'function') {
        scope.clearTimeout(handle);
      }
    };
    if (!rafInstalled) {
      mark('cancelAnimationFrame', 'timeout');
    }
  }

  var performanceRef = scope.performance;
  if (!performanceRef || typeof performanceRef !== 'object') {
    performanceRef = {};
    scope.performance = performanceRef;
    mark('performance', 'created');
  }
  if (typeof performanceRef.now !== 'function') {
    var navigationStart = Date.now();
    performanceRef.now = function performanceNowPolyfill() {
      return Date.now() - navigationStart;
    };
    if (typeof performanceRef.timeOrigin !== 'number') {
      performanceRef.timeOrigin = navigationStart;
    }
    mark('performance.now', 'date');
  } else if (typeof performanceRef.timeOrigin !== 'number') {
    try {
      performanceRef.timeOrigin = Date.now() - performanceRef.now();
      mark('performance.timeOrigin', 'derived');
    } catch (error) {
      // Ignore failures when deriving timeOrigin.
    }
  }

  function normaliseEntries(entries) {
    var list = [];
    for (var index = 0; index < entries.length; index += 1) {
      var entry = entries[index];
      if (!entry) {
        continue;
      }
      var key = entry.key;
      var value = entry.value;
      list.push({ key: key, value: value });
    }
    return list;
  }

  if (typeof scope.URLSearchParams !== 'function') {
    var plusPattern = /\+/g;
    function decode(value) {
      try {
        return decodeURIComponent(String(value || '').replace(plusPattern, ' '));
      } catch (error) {
        return String(value || '');
      }
    }
    function encode(value) {
      return encodeURIComponent(String(value)).replace(/%20/g, '+');
    }
    function createIterator(source, mapper) {
      var entries = normaliseEntries(source);
      var index = 0;
      return {
        next: function next() {
          if (index >= entries.length) {
            return { value: undefined, done: true };
          }
          var entry = entries[index];
          index += 1;
          return { value: mapper(entry), done: false };
        },
      };
    }
    function URLSearchParamsPolyfill(init) {
      if (!(this instanceof URLSearchParamsPolyfill)) {
        throw new TypeError('Failed to construct URLSearchParams: use the new operator.');
      }
      var entries = [];
      function appendEntry(key, value) {
        entries.push({ key: String(key), value: String(value) });
      }
      function setEntry(key, value) {
        var targetKey = String(key);
        var nextEntries = [];
        var replaced = false;
        for (var index = 0; index < entries.length; index += 1) {
          var entry = entries[index];
          if (!replaced && entry.key === targetKey) {
            nextEntries.push({ key: targetKey, value: String(value) });
            replaced = true;
          } else {
            nextEntries.push(entry);
          }
        }
        if (!replaced) {
          nextEntries.push({ key: targetKey, value: String(value) });
        }
        entries = nextEntries;
      }
      function deleteEntry(key) {
        var targetKey = String(key);
        var nextEntries = [];
        for (var index = 0; index < entries.length; index += 1) {
          var entry = entries[index];
          if (entry.key !== targetKey) {
            nextEntries.push(entry);
          }
        }
        entries = nextEntries;
      }
      this.append = function append(key, value) {
        appendEntry(key, value);
      };
      this.delete = function remove(key) {
        deleteEntry(key);
      };
      this.get = function get(key) {
        var targetKey = String(key);
        for (var index = 0; index < entries.length; index += 1) {
          var entry = entries[index];
          if (entry.key === targetKey) {
            return entry.value;
          }
        }
        return null;
      };
      this.getAll = function getAll(key) {
        var targetKey = String(key);
        var values = [];
        for (var index = 0; index < entries.length; index += 1) {
          var entry = entries[index];
          if (entry.key === targetKey) {
            values.push(entry.value);
          }
        }
        return values;
      };
      this.has = function has(key) {
        var targetKey = String(key);
        for (var index = 0; index < entries.length; index += 1) {
          if (entries[index].key === targetKey) {
            return true;
          }
        }
        return false;
      };
      this.set = function set(key, value) {
        setEntry(key, value);
      };
      this.sort = function sort() {
        entries.sort(function compare(a, b) {
          if (a.key === b.key) {
            return 0;
          }
          return a.key < b.key ? -1 : 1;
        });
      };
      this.forEach = function forEach(callback, thisArg) {
        if (typeof callback !== 'function') {
          return;
        }
        for (var index = 0; index < entries.length; index += 1) {
          var entry = entries[index];
          callback.call(thisArg, entry.value, entry.key, this);
        }
      };
      this.keys = function keys() {
        var iterator = createIterator(entries, function mapKey(entry) {
          return entry.key;
        });
        if (typeof Symbol === 'function' && Symbol.iterator) {
          iterator[Symbol.iterator] = function iteratorSymbol() {
            return iterator;
          };
        }
        return iterator;
      };
      this.values = function values() {
        var iterator = createIterator(entries, function mapValue(entry) {
          return entry.value;
        });
        if (typeof Symbol === 'function' && Symbol.iterator) {
          iterator[Symbol.iterator] = function iteratorSymbol() {
            return iterator;
          };
        }
        return iterator;
      };
      this.entries = function entriesIterator() {
        var iterator = createIterator(entries, function mapEntry(entry) {
          return [entry.key, entry.value];
        });
        if (typeof Symbol === 'function' && Symbol.iterator) {
          iterator[Symbol.iterator] = function iteratorSymbol() {
            return iterator;
          };
        }
        return iterator;
      };
      this.toString = function toString() {
        if (entries.length === 0) {
          return '';
        }
        var segments = [];
        for (var index = 0; index < entries.length; index += 1) {
          var entry = entries[index];
          segments.push(encode(entry.key) + '=' + encode(entry.value));
        }
        return segments.join('&');
      };
      if (typeof Symbol === 'function' && Symbol.iterator) {
        this[Symbol.iterator] = this.entries;
      }

      if (typeof init === 'string') {
        var query = init.charAt(0) === '?' ? init.slice(1) : init;
        if (query) {
          var pairs = query.split('&');
          for (var i = 0; i < pairs.length; i += 1) {
            if (!pairs[i]) {
              continue;
            }
            var parts = pairs[i].split('=');
            var key = decode(parts.shift());
            var value = decode(parts.join('='));
            appendEntry(key, value);
          }
        }
      } else if (init && typeof init === 'object') {
        if (typeof init.forEach === 'function') {
          init.forEach(function iterate(value, key) {
            appendEntry(key, value);
          });
        } else if (typeof Symbol === 'function' && Symbol.iterator && typeof init[Symbol.iterator] === 'function') {
          var iterator = init[Symbol.iterator]();
          var step = iterator.next();
          while (!step.done) {
            var entry = step.value;
            if (entry && entry.length >= 2) {
              appendEntry(entry[0], entry[1]);
            }
            step = iterator.next();
          }
        } else {
          for (var key in init) {
            if (Object.prototype.hasOwnProperty.call(init, key)) {
              appendEntry(key, init[key]);
            }
          }
        }
      }
    }
    URLSearchParamsPolyfill.prototype = URLSearchParamsPolyfill.prototype || {};
    scope.URLSearchParams = URLSearchParamsPolyfill;
    mark('URLSearchParams', 'polyfill');
  }

  if (typeof scope.CustomEvent !== 'function') {
    function CustomEventPolyfill(event, params) {
      params = params || { bubbles: false, cancelable: false, detail: null };
      var customEvent;
      if (scope.document && typeof scope.document.createEvent === 'function') {
        customEvent = scope.document.createEvent('CustomEvent');
        customEvent.initCustomEvent(event, params.bubbles, params.cancelable, params.detail);
      } else {
        customEvent = { type: event, detail: params.detail, bubbles: !!params.bubbles, cancelable: !!params.cancelable };
      }
      return customEvent;
    }
    if (scope.Event && scope.Event.prototype) {
      CustomEventPolyfill.prototype = scope.Event.prototype;
    }
    scope.CustomEvent = CustomEventPolyfill;
    mark('CustomEvent', 'createEvent');
  }

  var canvasProto = scope.HTMLCanvasElement && scope.HTMLCanvasElement.prototype;
  if (canvasProto && typeof canvasProto.getContext === 'function' && !canvasProto.__infiniteRailsPatchedGetContext) {
    var originalGetContext = canvasProto.getContext;
    canvasProto.getContext = function patchedGetContext(type) {
      try {
        return originalGetContext.apply(this, arguments);
      } catch (error) {
        if (
          type === 'webgl' ||
          type === 'webgl2' ||
          type === 'experimental-webgl' ||
          type === 'experimental-webgl2'
        ) {
          if (scope.console && typeof scope.console.warn === 'function') {
            scope.console.warn('Canvas getContext threw while requesting "' + type + '" context. Returning null.', error);
          }
          return null;
        }
        throw error;
      }
    };
    canvasProto.__infiniteRailsPatchedGetContext = true;
    mark('canvas.getContext', 'webgl-guard');
  }
})();
