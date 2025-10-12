import { describe, it, expect, beforeEach } from 'vitest';

import { enforceRateLimit, deriveRateLimitIdentity } from '../serverless/lib/rate-limit.js';

function createFakeDynamo() {
  const counters = new Map();
  const calls = [];
  return {
    calls,
    update(params) {
      calls.push(params);
      return {
        async promise() {
          const bucketKey = params.Key.bucket;
          const limit = params.ExpressionAttributeValues[':limit'];
          const current = counters.get(bucketKey) ?? 0;
          if (current >= limit) {
            const error = new Error('Rate limit exceeded');
            error.code = 'ConditionalCheckFailedException';
            throw error;
          }
          const next = current + 1;
          counters.set(bucketKey, next);
          return { Attributes: { count: next } };
        },
      };
    },
  };
}

describe('deriveRateLimitIdentity', () => {
  it('prefers google identifiers before session and ip fallbacks', () => {
    expect(
      deriveRateLimitIdentity({ googleId: 'abc', sessionId: 'session-1', sourceIp: '1.2.3.4' }),
    ).toBe('user:abc');
    expect(
      deriveRateLimitIdentity({ googleId: '', sessionId: 'session-1', sourceIp: '1.2.3.4' }),
    ).toBe('session:session-1');
    expect(deriveRateLimitIdentity({ sessionId: '', sourceIp: '1.2.3.4' })).toBe('ip:1.2.3.4');
    expect(deriveRateLimitIdentity({})).toBe('anonymous');
  });

  it('allows rate limit headers to override other identifiers', () => {
    expect(
      deriveRateLimitIdentity({
        googleId: 'body-user',
        sessionId: 'session-override',
        headers: { 'X-Rate-Limit-Google-Id': 'header-user' },
      }),
    ).toBe('user:header-user');
    expect(
      deriveRateLimitIdentity({
        googleId: '',
        multiValueHeaders: { 'X-Rate-Limit-Google-Id': ['  header-user  '] },
      }),
    ).toBe('user:header-user');
  });
});

describe('enforceRateLimit', () => {
  let dynamo;

  beforeEach(() => {
    dynamo = createFakeDynamo();
  });

  it('increments counters until the configured limit is reached', async () => {
    const identity = 'session:test';
    const scope = 'scores:get';
    const now = 1_000;

    const first = await enforceRateLimit({
      dynamo,
      tableName: 'RateLimits',
      identity,
      scope,
      limit: 2,
      windowSeconds: 60,
      now,
    });
    expect(first.ok).toBe(true);
    expect(first.count).toBe(1);

    const second = await enforceRateLimit({
      dynamo,
      tableName: 'RateLimits',
      identity,
      scope,
      limit: 2,
      windowSeconds: 60,
      now: now + 500,
    });
    expect(second.ok).toBe(true);
    expect(second.count).toBe(2);

    const third = await enforceRateLimit({
      dynamo,
      tableName: 'RateLimits',
      identity,
      scope,
      limit: 2,
      windowSeconds: 60,
      now: now + 800,
    });
    expect(third.ok).toBe(false);
    expect(third.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('persists ttl values aligned with the window end', async () => {
    const identity = 'session:ttl-test';
    const scope = 'users:get';
    const now = 123_456;

    await enforceRateLimit({
      dynamo,
      tableName: 'RateLimits',
      identity,
      scope,
      limit: 5,
      windowSeconds: 60,
      now,
    });

    expect(dynamo.calls).toHaveLength(1);
    const params = dynamo.calls[0];
    const ttlValue = params.ExpressionAttributeValues[':ttl'];
    const windowMs = 60_000;
    const expectedTtl = Math.ceil((Math.floor(now / windowMs) * windowMs + windowMs) / 1000);
    expect(ttlValue).toBe(expectedTtl);
    expect(params.ExpressionAttributeNames['#ttl']).toBe('ttl');
  });
});
