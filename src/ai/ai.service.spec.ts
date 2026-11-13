import { modelId } from './ai.service.js';

describe('modelId', () => {
  it('uses the default when nothing is set', () => {
    expect(modelId()).toBe('claude-opus-5-5');
    expect(modelId('  ')).toBe('claude-opus-5-5');
  });

  it('turns a spoken name into the id and leaves a real id alone', () => {
    expect(modelId('Sonnet 5')).toBe('claude-sonnet-5');
    expect(modelId('Haiku 5.5')).toBe('claude-haiku-5-5');
    expect(modelId('claude-sonnet-5-5')).toBe('claude-sonnet-5-5');
  });
});
