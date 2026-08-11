import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeZmPhone, normalizeBaseUrl } from '../server/adapters/ontechSmsClient.js';

describe('ontechSmsClient helpers', () => {
  it('normalizes Zambian phone numbers', () => {
    assert.equal(normalizeZmPhone('0971234567'), '260971234567');
    assert.equal(normalizeZmPhone('+260971234567'), '260971234567');
    assert.equal(normalizeZmPhone('260971234567'), '260971234567');
    assert.equal(normalizeZmPhone('260 971 234 567'), '260971234567');
  });

  it('normalizes base URL to /smsservice', () => {
    assert.equal(
      normalizeBaseUrl('https://bulksms.ontech.co.zm/smsservice'),
      'https://bulksms.ontech.co.zm/smsservice',
    );
    assert.equal(
      normalizeBaseUrl('https://bulksms.ontech.co.zm/api/'),
      'https://bulksms.ontech.co.zm/smsservice',
    );
  });
});
