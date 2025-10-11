import { describe, it, expect, vi, afterEach } from 'vitest';
import crypto from 'crypto';

import {
  createTraceContext,
  createTraceLogger,
  TRACE_HEADER_TRACE_ID,
  TRACE_HEADER_SESSION_ID,
  TRACE_HEADER_REQUEST_ID,
} from '../serverless/lib/trace.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createTraceContext', () => {
  it('prefers trace identifiers supplied via headers', () => {
    const context = createTraceContext({
      headers: {
        [TRACE_HEADER_TRACE_ID]: 'trace-from-header',
        'x-trace-session': 'session-from-header',
      },
    });

    expect(context.traceId).toBe('trace-from-header');
    expect(context.sessionId).toBe('session-from-header');
    expect(context.headers[TRACE_HEADER_TRACE_ID]).toBe('trace-from-header');
    expect(context.headers[TRACE_HEADER_SESSION_ID]).toBe('session-from-header');
  });

  it('generates stable identifiers when headers are absent', () => {
    const randomUUIDSpy = vi
      .spyOn(crypto, 'randomUUID')
      .mockImplementationOnce(() => 'generated-trace-id')
      .mockImplementationOnce(() => 'generated-session-id');

    const context = createTraceContext({ headers: {} });

    expect(randomUUIDSpy).toHaveBeenCalledTimes(2);
    expect(context.traceId).toBe('generated-trace-id');
    expect(context.sessionId).toBe('generated-session-id');
    expect(context.headers[TRACE_HEADER_TRACE_ID]).toBe('generated-trace-id');
    expect(context.headers[TRACE_HEADER_SESSION_ID]).toBe('generated-session-id');
  });

  it('captures aws request identifiers when provided', () => {
    const context = createTraceContext(
      {},
      {
        awsRequestId: 'aws-request-id',
      },
    );

    expect(context.requestId).toBe('aws-request-id');
    expect(context.headers[TRACE_HEADER_REQUEST_ID]).toBe('aws-request-id');
  });
});

describe('createTraceLogger', () => {
  it('prefixes log output with trace identifiers', () => {
    const baseLogger = {
      error: vi.fn(),
    };

    const logger = createTraceLogger(
      {
        traceId: 'trace-123',
        sessionId: 'session-456',
      },
      baseLogger,
    );

    logger.error('Something happened');

    expect(baseLogger.error).toHaveBeenCalledTimes(1);
    expect(baseLogger.error).toHaveBeenCalledWith('[traceId=trace-123 sessionId=session-456]', 'Something happened');
  });
});
