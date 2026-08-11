import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  maskVisitForViewer,
  canAssignVipClassification,
  canViewFullVipContact,
  isRestrictedClassification,
} from '../shared/visitorPrivacy.js';

describe('visitorPrivacy', () => {
  const vipRow = {
    full_name: 'Jane VIP',
    phone: '+260971111111',
    email: 'jane@vip.com',
    id_number: '123456/78/1',
    purpose: 'Board meeting',
    classification: 'vip',
  };

  it('masks VIP contact for gate/reception roles', () => {
    const masked = maskVisitForViewer(vipRow, ['station.visitors.view']);
    assert.equal(masked.phone, '260**** ********');
    assert.equal(masked.email.includes('***'), true);
    assert.equal(masked.id_number, '***');
    assert.equal(masked.purpose, '[Confidential meeting details]');
    assert.equal(masked._vipContactMasked, true);
  });

  it('shows full VIP contact for executive roles', () => {
    const full = maskVisitForViewer(vipRow, ['executive.full_contact']);
    assert.equal(full.phone, vipRow.phone);
    assert.equal(full.email, vipRow.email);
    assert.equal(full._vipContactVisible, true);
  });

  it('does not mask standard visitors for station staff', () => {
    const standard = maskVisitForViewer({ ...vipRow, classification: 'standard' }, ['station.visitors.view']);
    assert.equal(standard.phone, vipRow.phone);
  });

  it('identifies restricted classifications', () => {
    assert.equal(isRestrictedClassification('vip'), true);
    assert.equal(isRestrictedClassification('vvip'), true);
    assert.equal(isRestrictedClassification('standard'), false);
  });

  it('executive permission gates VIP assignment', () => {
    assert.equal(canAssignVipClassification(['host.invite']), false);
    assert.equal(canAssignVipClassification(['executive.assign_vip']), true);
    assert.equal(canViewFullVipContact(['executive.full_contact']), true);
  });
});
