import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { VaultService } from './vault.service.js';

function vaultWith(key: string): VaultService {
  return new VaultService(new ConfigService({ VAULT_KEY: key }));
}

describe('VaultService', () => {
  const key = randomBytes(32).toString('base64');

  it('round-trips a secret', () => {
    const vault = vaultWith(key);
    const stored = vault.encrypt('p@ss word ₹ 123');
    expect(stored).not.toContain('p@ss');
    expect(vault.decrypt(stored)).toBe('p@ss word ₹ 123');
  });

  it('produces a different ciphertext each time', () => {
    const vault = vaultWith(key);
    expect(vault.encrypt('same')).not.toBe(vault.encrypt('same'));
  });

  it('rejects a tampered value', () => {
    const vault = vaultWith(key);
    const parts = vault.encrypt('secret').split('.');
    parts[3] = Buffer.from('tampered').toString('base64url');
    expect(() => vault.decrypt(parts.join('.'))).toThrow();
  });

  it('cannot decrypt with another key', () => {
    const stored = vaultWith(key).encrypt('secret');
    const other = vaultWith(randomBytes(32).toString('base64'));
    expect(() => other.decrypt(stored)).toThrow();
  });

  it('refuses a key of the wrong length', () => {
    expect(() => vaultWith(randomBytes(16).toString('base64'))).toThrow();
  });
});
