import { describe, expect, it, vi } from 'vitest';

import { createExperience } from './helpers/simple-experience-test-utils.js';

describe('simple experience model loader fallback', () => {
  it('falls back to a placeholder mesh when the GLTF loader fails to initialise', async () => {
    const { experience } = createExperience();
    experience.assetRetryLimit = 1;
    experience.assetRetryBackoffMs = 0;
    experience.assetRetryBackoffMaxMs = 0;

    const hintClassList = { add: vi.fn(), remove: vi.fn() };
    const playerHintEl = { textContent: '', classList: hintClassList, setAttribute: vi.fn() };
    experience.playerHintEl = playerHintEl;
    experience.footerStatusEl = { textContent: '' };
    experience.footerEl = { dataset: {} };

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const originalThree = experience.THREE;
    const threeStub = Object.create(originalThree);
    threeStub.GLTFLoader = class {
      constructor() {
        throw new Error('GLTFLoader unavailable for tests');
      }
    };
    experience.THREE = threeStub;
    if (typeof window !== 'undefined') {
      window.THREE = threeStub;
    }

    let payload;
    try {
      payload = await experience.loadModel('steve');
    } finally {
      errorSpy.mockRestore();
    }

    expect(payload).toBeTruthy();
    expect(payload.scene).toBeTruthy();
    expect(payload.animations).toEqual([]);
    expect(payload.scene.userData).toMatchObject({
      placeholder: true,
      placeholderReason: 'loader-unavailable',
      placeholderSource: 'model-fallback',
    });
    expect(experience.loadedModels.get('steve')).toEqual(payload);
    expect(experience.lastHintMessage).toContain(
      'Explorer avatar unavailable — model loader offline. Showing placeholder visuals.',
    );
    expect(playerHintEl.textContent).toContain(
      'Explorer avatar unavailable — model loader offline. Showing placeholder visuals.',
    );
    expect(hintClassList.add).toHaveBeenCalledWith('visible');
    expect(experience.footerStatusEl.textContent).toContain(
      'Explorer avatar unavailable — model loader offline. Showing placeholder visuals.',
    );
    expect(experience.footerEl.dataset.state).toBe('warning');
  });

  it('adds an error overlay when zombie fallbacks are created after a failure', () => {
    const { experience } = createExperience();
    const fallback = experience.createModelFallbackMesh('zombie', { reason: 'failed' });
    expect(fallback).toBeTruthy();
    const overlay = fallback.children.find((child) => child?.name === 'ZombieErrorOverlay');
    expect(overlay).toBeTruthy();
    expect(overlay.userData).toMatchObject({
      placeholder: true,
      placeholderOverlay: true,
      placeholderKey: 'zombie',
      placeholderReason: 'failed',
    });
  });

  it('adds an error overlay when golem fallbacks are created after a failure', () => {
    const { experience } = createExperience();
    const fallback = experience.createModelFallbackMesh('golem', { reason: 'loader-unavailable' });
    expect(fallback).toBeTruthy();
    const overlay = fallback.children.find((child) => child?.name === 'GolemErrorOverlay');
    expect(overlay).toBeTruthy();
    expect(overlay.userData).toMatchObject({
      placeholder: true,
      placeholderOverlay: true,
      placeholderKey: 'golem',
      placeholderReason: 'loader-unavailable',
    });
  });
});

