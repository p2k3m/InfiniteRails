import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '..');
const scriptSource = fs.readFileSync(path.join(repoRoot, 'script.js'), 'utf8');

describe('gameplay event log coverage for world and AI triggers', () => {
  it('registers world generation and AI events with the event log', () => {
    const listenersStart = scriptSource.indexOf('function ensureEventLogListeners');
    expect(listenersStart).toBeGreaterThan(-1);
    const arrayStart = scriptSource.indexOf('[', listenersStart);
    expect(arrayStart).toBeGreaterThan(-1);
    const arrayEnd = scriptSource.indexOf('].forEach(register);', arrayStart);
    expect(arrayEnd).toBeGreaterThan(arrayStart);
    const listenerArray = scriptSource.slice(arrayStart, arrayEnd);
    expect(listenerArray).toContain("'world-generation-start'");
    expect(listenerArray).toContain("'world-generation-complete'");
    expect(listenerArray).toContain("'ai-attachment-failed'");
  });

  it('describes world generation and AI failures with defensive fallbacks', () => {
    expect(scriptSource).toMatch(/case 'world-generation-start'/);
    expect(scriptSource).toContain('World generation started — calibrating');
    expect(scriptSource).toMatch(/case 'world-generation-complete'/);
    expect(scriptSource).toContain('World generation complete —');
    expect(scriptSource).toContain('World generation failed —');
    expect(scriptSource).toMatch(/case 'ai-attachment-failed'/);
    expect(scriptSource).toContain('AI attachment failed —');
  });

  it('captures world generation and AI events for sourcing', () => {
    const captureStart = scriptSource.indexOf('const EVENT_SOURCING_CAPTURE_TYPES');
    expect(captureStart).toBeGreaterThan(-1);
    const arrayStart = scriptSource.indexOf('[', captureStart);
    expect(arrayStart).toBeGreaterThan(-1);
    const arrayEnd = scriptSource.indexOf(']);', arrayStart);
    expect(arrayEnd).toBeGreaterThan(arrayStart);
    const captureArray = scriptSource.slice(arrayStart, arrayEnd);
    expect(captureArray).toContain("'world-generation-start'");
    expect(captureArray).toContain("'world-generation-complete'");
    expect(captureArray).toContain("'ai-attachment-failed'");
  });
});
