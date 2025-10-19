import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
const documentClientConstructor = vi.fn(() => ({ get: getMock }));

let handler;

describe('serverless config handler', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    getMock.mockReset();
    documentClientConstructor.mockClear();
    globalThis.__INFINITERAILS_AWS_SDK__ = {
      DynamoDB: { DocumentClient: documentClientConstructor },
    };
    ({ handler } = await import('../serverless/handlers/config.js'));
  });

  afterEach(() => {
    delete process.env.CONFIG_TABLE;
    delete globalThis.__INFINITERAILS_AWS_SDK__;
  });

  it('returns defaults when CONFIG_TABLE is not configured', async () => {
    const response = await handler({ httpMethod: 'GET' }, {});

    expect(documentClientConstructor).not.toHaveBeenCalled();
    expect(getMock).not.toHaveBeenCalled();
    expect(response.statusCode).toBe(200);
    const payload = JSON.parse(response.body);
    expect(payload.config.features).toEqual({
      forceSimpleRenderer: false,
      disableScoreSync: false,
    });
    expect(payload.config.messages.scoreboard).toBeNull();
    expect(payload.config.health).toEqual({ degraded: false });
  });

  it('loads feature configuration from DynamoDB', async () => {
    process.env.CONFIG_TABLE = 'FeatureFlagsTable';
    getMock.mockReturnValue({
      promise: () =>
        Promise.resolve({
          Item: {
            configKey: 'feature-flags',
            version: 'v1',
            updatedAt: '2025-01-02T00:00:00Z',
            features: { forceSimpleRenderer: true, disableScoreSync: true },
            messages: { scoreboard: 'Maintenance mode — runs stored locally.' },
          },
        }),
    });

    const response = await handler({ httpMethod: 'GET' }, {});

    expect(documentClientConstructor).toHaveBeenCalledTimes(1);
    expect(getMock).toHaveBeenCalledTimes(1);
    expect(response.statusCode).toBe(200);
    const payload = JSON.parse(response.body);
    expect(payload.config.features.forceSimpleRenderer).toBe(true);
    expect(payload.config.features.disableScoreSync).toBe(true);
    expect(payload.config.messages.scoreboard).toBe('Maintenance mode — runs stored locally.');
    expect(payload.config.version).toBe('v1');
    expect(payload.config.updatedAt).toBe('2025-01-02T00:00:00.000Z');
    expect(payload.config.health).toEqual({ degraded: true, message: 'Maintenance mode — runs stored locally.' });
  });

  it('enforces safe mode when health status indicates a major outage', async () => {
    process.env.CONFIG_TABLE = 'FeatureFlagsTable';
    getMock.mockReturnValue({
      promise: () =>
        Promise.resolve({
          Item: {
            configKey: 'feature-flags',
            updatedAt: '2025-04-05T12:00:00Z',
            health: {
              status: 'major_outage',
              message: 'Game services degraded — leaderboard paused.',
            },
          },
        }),
    });

    const response = await handler({ httpMethod: 'GET' }, {});

    expect(response.statusCode).toBe(200);
    const payload = JSON.parse(response.body);
    expect(payload.config.features.forceSimpleRenderer).toBe(true);
    expect(payload.config.features.disableScoreSync).toBe(true);
    expect(payload.config.messages.scoreboard).toBe('Game services degraded — leaderboard paused.');
    expect(payload.config.health).toEqual({
      degraded: true,
      message: 'Game services degraded — leaderboard paused.',
      status: 'major-outage',
    });
  });

  it('returns 405 for unsupported methods', async () => {
    const response = await handler({ httpMethod: 'POST' }, {});
    expect(response.statusCode).toBe(405);
    expect(JSON.parse(response.body).message).toBe('Method Not Allowed');
  });

  it('handles pre-flight requests', async () => {
    const response = await handler({ httpMethod: 'OPTIONS' }, {});
    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');
  });
});
