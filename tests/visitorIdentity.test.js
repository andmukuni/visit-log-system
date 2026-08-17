import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { maskNrc, normalizeNrc, resolveVisitorIdNumberMasked } from '../server/visitorIdentity.js';

describe('visitorIdentity', () => {
  it('normalizes and masks Zambian NRC values', () => {
    assert.equal(normalizeNrc('123456789'), '123456/78/9');
    assert.equal(maskNrc('123456/78/9'), '12****/78/9');
  });

  it('prefers stored masked NRC over deriving from contact details', () => {
    const masked = resolveVisitorIdNumberMasked({
      id_type: 'nrc',
      id_number: '999999/99/9',
      id_number_masked: '12****/78/9',
    });
    assert.equal(masked, '12****/78/9');
  });

  it('derives masked NRC from contact details when visitors row has none', () => {
    const masked = resolveVisitorIdNumberMasked({
      id_type: 'nrc',
      id_number: '123456/78/9',
    });
    assert.equal(masked, '12****/78/9');
  });
});
