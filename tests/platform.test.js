import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateInviteToken } from '../server/platformSchema.js';

describe('generateInviteToken', () => {
  it('returns a 48-char hex string', () => {
    const token = generateInviteToken();
    assert.match(token, /^[a-f0-9]{48}$/);
  });

  it('generates unique tokens', () => {
    const a = generateInviteToken();
    const b = generateInviteToken();
    assert.notEqual(a, b);
  });
});
