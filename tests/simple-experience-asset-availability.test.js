import { describe, expect, it, vi } from 'vitest';
import { createExperience } from './helpers/simple-experience-test-utils.js';

describe('SimpleExperience critical asset availability', () => {
  it('reports missing assets when probes fail to resolve sources', async () => {
    const { experience } = createExperience();
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {});

    experience.collectCriticalTextureKeys = vi.fn(() => ['grass', 'missing-texture']);
    experience.collectCriticalModelEntries = vi.fn(() => [
      { key: 'steve', url: 'https://assets.example.com/steve.gltf' },
    ]);
    experience.collectCriticalAudioSampleNames = vi.fn(() => ['bubble']);

    const sourceMap = {
      'texture:grass': ['https://assets.example.com/grass.png'],
      'texture:missing-texture': ['https://assets.example.com/missing.png'],
      steve: ['https://assets.example.com/steve.gltf'],
      'audio:bubble': ['https://assets.example.com/audio/bubble.mp3'],
    };

    experience.resolveAssetSourceCandidates = vi.fn((key) => {
      const sources = sourceMap[key];
      return Array.isArray(sources) ? [...sources] : [];
    });

    const fetchMock = vi.fn((url, init = {}) => {
      if (url.includes('grass.png')) {
        return Promise.resolve({ ok: true, status: 200, type: 'basic' });
      }
      if (url.includes('missing.png')) {
        return Promise.resolve({ ok: false, status: 404, type: 'basic' });
      }
      if (url.includes('steve.gltf')) {
        if (init.method === 'HEAD') {
          return Promise.resolve({ ok: false, status: 405, type: 'basic' });
        }
        return Promise.resolve({ ok: true, status: 206, type: 'basic' });
      }
      if (url.includes('bubble.mp3')) {
        return Promise.resolve({ ok: false, status: 404, type: 'basic' });
      }
      return Promise.resolve({ ok: false, status: 500, type: 'basic' });
    });

    const summary = await experience.verifyCriticalAssetAvailability({
      fetch: fetchMock,
      concurrency: 1,
      timeoutMs: 50,
    });

    expect(fetchMock).toHaveBeenCalled();
    expect(summary.status).toBe('missing');
    expect(summary.missing).toContain('texture:missing-texture');
    expect(summary.missing).toContain('audio:bubble');
    expect(summary.reachable).toBeGreaterThanOrEqual(2);
    expect(consoleWarn).toHaveBeenCalled();
    const warningMessages = consoleWarn.mock.calls.map(([message]) => String(message));
    expect(warningMessages.some((message) => message.includes('Audio availability check detected'))).toBe(true);

    consoleWarn.mockRestore();
    consoleInfo.mockRestore();
  });
});
