import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveMaskLevel,
  maskPhone,
  maskEmail,
  maskVisitorFields,
} from '../shared/reportMasking.js';

describe('resolveMaskLevel', () => {
  it('returns full for super admin', () => {
    assert.equal(resolveMaskLevel(['super_admin']), 'full');
  });

  it('returns management for management viewer', () => {
    assert.equal(resolveMaskLevel(['management.reports', 'management.analytics']), 'management');
  });

  it('returns security for security manager', () => {
    assert.equal(resolveMaskLevel(['security.reports', 'security.dashboard']), 'security');
  });

  it('returns operational for station staff', () => {
    assert.equal(resolveMaskLevel(['station.visitors.view']), 'operational');
  });
});

describe('maskVisitorFields', () => {
  it('masks phone and email for management level', () => {
    const row = { full_name: 'Jane Doe', phone: '+260971234567', email: 'jane@example.com' };
    const masked = maskVisitorFields(row, 'management');
    assert.notEqual(masked.phone, row.phone);
    assert.notEqual(masked.email, row.email);
    assert.equal(masked.full_name, 'Jane Doe');
  });

  it('leaves fields unchanged for security level', () => {
    const row = { full_name: 'Jane Doe', phone: '+260971234567', email: 'jane@example.com' };
    const masked = maskVisitorFields(row, 'security');
    assert.equal(masked.phone, row.phone);
    assert.equal(masked.email, row.email);
  });
});

describe('maskPhone and maskEmail', () => {
  it('masks phone to first 3 digits plus **** ********', () => {
    assert.equal(maskPhone('+260971234567'), '260**** ********');
    assert.equal(maskPhone('0971234567'), '097**** ********');
  });

  it('masks email local part', () => {
    assert.equal(maskEmail('jane.doe@example.com'), 'j***@example.com');
  });
});
