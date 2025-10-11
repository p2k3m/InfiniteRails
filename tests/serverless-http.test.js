import { describe, it, expect } from 'vitest';

import { createResponse, handleOptions } from '../serverless/lib/http.js';
import {
  TRACE_HEADER_TRACE_ID,
  TRACE_HEADER_SESSION_ID,
  TRACE_HEADER_REQUEST_ID,
} from '../serverless/lib/trace.js';

describe('createResponse', () => {
  it('adds trace identifiers to headers and response body', () => {
    const trace = {
      traceId: 'trace-id-123',
      sessionId: 'session-id-456',
      requestId: 'request-id-789',
    };

    const response = createResponse(
      200,
      {
        message: 'ok',
      },
      { trace },
    );

    expect(response.headers[TRACE_HEADER_TRACE_ID]).toBe('trace-id-123');
    expect(response.headers[TRACE_HEADER_SESSION_ID]).toBe('session-id-456');
    expect(response.headers[TRACE_HEADER_REQUEST_ID]).toBe('request-id-789');

    const payload = JSON.parse(response.body);
    expect(payload.message).toBe('ok');
    expect(payload.trace).toEqual({
      traceId: 'trace-id-123',
      sessionId: 'session-id-456',
      requestId: 'request-id-789',
    });
  });

  it('preserves empty bodies when no payload is supplied', () => {
    const trace = {
      traceId: 'trace-id-123',
      sessionId: 'session-id-456',
    };

    const response = createResponse(204, '', { trace });

    expect(response.body).toBe('');
    expect(response.headers[TRACE_HEADER_TRACE_ID]).toBe('trace-id-123');
  });
});

describe('handleOptions', () => {
  it('returns trace-aware headers for pre-flight responses', () => {
    const response = handleOptions({ trace: { traceId: 'abc', sessionId: 'def' } });

    expect(response.statusCode).toBe(204);
    expect(response.headers[TRACE_HEADER_TRACE_ID]).toBe('abc');
    expect(response.headers[TRACE_HEADER_SESSION_ID]).toBe('def');
    expect(response.body).toBe('');
  });
});
