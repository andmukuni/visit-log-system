import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_ADMIN_ROLES,
  ALL_PERMISSION_KEYS,
  RECEPTION_KEYS,
  permissionMatches,
} from '../shared/rbacPermissions.js';
import {
  getVisibleNavItems,
  hasReceptionLockRole,
  hasHostLockRole,
  resolveDefaultHomeRoute,
} from '../shared/portalNavigation.js';

const role = (slug) => DEFAULT_ADMIN_ROLES.find((r) => r.slug === slug);
const perms = (slug) => role(slug)?.permissions || [];

describe('role integrity — every role must be able to use the portal it is locked to', () => {
  // The defect this guards: `receptionist` carried station.* permissions while
  // being a reception-lock role, so holders were pinned to /reception with an
  // entirely empty sidebar and no usable page.
  for (const r of DEFAULT_ADMIN_ROLES) {
    it(`${r.slug} lands on a portal with at least one usable nav item`, () => {
      const p = r.permissions || [];
      const slugs = [r.slug];
      const has = (key) => permissionMatches(p, key);

      let portalId;
      if (hasReceptionLockRole(slugs)) portalId = 'reception';
      else if (hasHostLockRole(slugs)) portalId = 'host';
      else portalId = resolveDefaultHomeRoute(p, slugs).split('/')[1] || 'admin';

      const items = getVisibleNavItems(portalId, has);
      assert.ok(
        items.length > 0,
        `${r.slug} is locked/routed to /${portalId} but has 0 visible nav items there`,
      );
    });
  }
});

describe('role integrity — permission hygiene', () => {
  it('every permission referenced by a role exists in the catalogue', () => {
    const known = new Set(ALL_PERMISSION_KEYS);
    for (const r of DEFAULT_ADMIN_ROLES) {
      for (const key of r.permissions || []) {
        if (key === '*') continue;
        assert.ok(known.has(key), `${r.slug} references unknown permission "${key}"`);
      }
    }
  });

  it('no role lists a duplicate permission key', () => {
    for (const r of DEFAULT_ADMIN_ROLES) {
      const p = r.permissions || [];
      assert.equal(new Set(p).size, p.length, `${r.slug} has duplicate permission entries`);
    }
  });

  it('every role has a slug, name and description', () => {
    for (const r of DEFAULT_ADMIN_ROLES) {
      assert.ok(r.slug && r.name && r.description, `${r.slug || '(no slug)'} is missing metadata`);
    }
  });
});

describe('reception roles', () => {
  it('receptionist is a reception desk role, not a station/gate role', () => {
    const p = perms('receptionist');
    assert.deepEqual([...p].sort(), [...RECEPTION_KEYS].sort());
    assert.equal(p.some((k) => k.startsWith('station.')), false,
      'receptionist must not carry station permissions — that made it a broken reception-lock role');
  });

  it('every reception-lock role can actually open the reception portal', () => {
    for (const slug of ['receptionist', 'main_reception', 'executive_reception']) {
      const p = perms(slug);
      assert.ok(p.includes('reception.dashboard'), `${slug} cannot open /reception`);
    }
  });

  it('only executive_reception may see VIP contact detail', () => {
    assert.ok(perms('executive_reception').includes('executive.full_contact'));
    for (const slug of ['receptionist', 'main_reception']) {
      assert.equal(perms(slug).includes('executive.full_contact'), false,
        `${slug} must not have VIP full-contact access`);
    }
  });

  it('desks are differentiated by zone, not permissions (receptionist == main_reception is intentional)', () => {
    assert.deepEqual([...perms('receptionist')].sort(), [...perms('main_reception')].sort());
  });
});

describe('host and executive roles', () => {
  it('host owns the full host permission group', () => {
    const p = perms('host');
    for (const key of ['host.dashboard', 'host.invite', 'host.visitors', 'host.approvals', 'host.onsite']) {
      assert.ok(p.includes(key), `host is missing ${key}`);
    }
  });

  it('host can keep its own contacts', () => {
    assert.ok(perms('host').includes('executive.contacts'));
  });

  it('host must NOT have VIP contact access or VIP classification', () => {
    const p = perms('host');
    assert.equal(p.includes('executive.full_contact'), false, 'a general employee must not see VIP contact detail');
    assert.equal(p.includes('executive.assign_vip'), false, 'a general employee must not classify visitors as VIP');
  });

  it('executives may assign VIP status', () => {
    for (const slug of ['ceo', 'dceo']) {
      assert.ok(perms(slug).includes('executive.assign_vip'), `${slug} should be able to assign VIP`);
      assert.ok(perms(slug).includes('executive.full_contact'), `${slug} should see VIP contact detail`);
    }
  });

  it('secretaries coordinate but must NOT assign VIP status', () => {
    for (const slug of ['ceo_secretary', 'dceo_secretary']) {
      const p = perms(slug);
      assert.equal(p.includes('executive.assign_vip'), false,
        `${slug} must not assign VIP status — that stays with the executive`);
      // They still need enough to actually do the job.
      assert.ok(p.includes('executive.calendar'), `${slug} needs calendar access`);
      assert.ok(p.includes('executive.appointments'), `${slug} needs appointment access`);
      assert.ok(p.includes('executive.full_contact'), `${slug} needs contact detail to coordinate`);
    }
  });

  it('a secretary has strictly fewer permissions than the executive they support', () => {
    for (const [sec, exec] of [['ceo_secretary', 'ceo'], ['dceo_secretary', 'dceo']]) {
      assert.ok(perms(sec).length < perms(exec).length,
        `${sec} should not equal ${exec} in permissions`);
    }
  });
});

describe('station/gate roles stay out of the reception portal', () => {
  it('gate_security is a station role and is not reception-locked', () => {
    const p = perms('gate_security');
    assert.ok(p.includes('station.dashboard'));
    assert.equal(hasReceptionLockRole(['gate_security']), false);
    assert.equal(p.some((k) => k.startsWith('reception.')), false);
  });
});
