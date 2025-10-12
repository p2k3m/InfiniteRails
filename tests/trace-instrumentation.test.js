import { describe, expect, it } from 'vitest';

import { createBootstrapSandbox, evaluateBootstrapScript } from './helpers/bootstrap-test-utils.js';

describe('trace instrumentation', () => {
  it('appends trace metadata to console output and fetch requests during bootstrap', async () => {
    const { sandbox } = createBootstrapSandbox();

    const consoleCalls = {
      log: [],
      info: [],
      warn: [],
      error: [],
      debug: [],
      trace: [],
      assert: [],
    };

    const instrumentedConsole = {
      log: (...args) => {
        consoleCalls.log.push(args);
      },
      info: (...args) => {
        consoleCalls.info.push(args);
      },
      warn: (...args) => {
        consoleCalls.warn.push(args);
      },
      error: (...args) => {
        consoleCalls.error.push(args);
      },
      debug: (...args) => {
        consoleCalls.debug.push(args);
      },
      trace: (...args) => {
        consoleCalls.trace.push(args);
      },
      assert: (...args) => {
        consoleCalls.assert.push(args);
      },
    };

    sandbox.window.console = instrumentedConsole;
    sandbox.console = instrumentedConsole;

    class MockXMLHttpRequest {
      constructor() {
        this.headers = {};
      }

      open(...args) {
        this.openArgs = args;
      }

      setRequestHeader(name, value) {
        this.headers[name] = value;
      }

      send(body) {
        this.body = body;
        return undefined;
      }
    }

    sandbox.window.XMLHttpRequest = MockXMLHttpRequest;
    sandbox.XMLHttpRequest = MockXMLHttpRequest;

    const fetchCalls = [];
    const fetchStub = (resource, init = {}) => {
      fetchCalls.push([resource, init]);
      return Promise.resolve({ ok: true, status: 204, json: async () => ({}) });
    };
    sandbox.window.fetch = fetchStub;
    sandbox.fetch = fetchStub;

    evaluateBootstrapScript(sandbox);

    sandbox.window.console.info('Trace check bootstrap');
    expect(consoleCalls.info.length).toBeGreaterThan(0);
    const infoArgs = consoleCalls.info.at(-1);
    expect(infoArgs).toBeDefined();
    const metadata = infoArgs.at(-1);
    expect(metadata).toBeDefined();
    expect(typeof metadata.traceId).toBe('string');
    expect(metadata.traceId.length).toBeGreaterThan(0);
    expect(typeof metadata.sessionId).toBe('string');
    expect(metadata.sessionId.length).toBeGreaterThan(0);
    expect(metadata.trace).toMatchObject({ traceId: metadata.traceId, sessionId: metadata.sessionId });

    await sandbox.window.fetch('https://example.invalid/api', { method: 'GET' });
    expect(fetchCalls.length).toBeGreaterThan(0);
    const [, requestInit] = fetchCalls.at(-1);
    const headers = requestInit?.headers;
    const traceId =
      typeof headers?.get === 'function'
        ? headers.get('x-trace-id')
        : headers?.['x-trace-id'] ?? headers?.['X-Trace-Id'];
    const sessionId =
      typeof headers?.get === 'function'
        ? headers.get('x-trace-session')
        : headers?.['x-trace-session'] ?? headers?.['X-Trace-Session'];
    expect(typeof traceId).toBe('string');
    expect(traceId?.length ?? 0).toBeGreaterThan(0);
    expect(typeof sessionId).toBe('string');
    expect(sessionId?.length ?? 0).toBeGreaterThan(0);

    const xhr = new sandbox.window.XMLHttpRequest();
    xhr.open('POST', 'https://example.invalid/xhr');
    xhr.send('payload');
    const xhrTraceId = xhr.headers['X-Trace-Id'] ?? xhr.headers['x-trace-id'];
    const xhrSessionId = xhr.headers['X-Trace-Session'] ?? xhr.headers['x-trace-session'];
    expect(typeof xhrTraceId).toBe('string');
    expect(xhrTraceId?.length ?? 0).toBeGreaterThan(0);
    expect(typeof xhrSessionId).toBe('string');
    expect(xhrSessionId?.length ?? 0).toBeGreaterThan(0);
  });
});
