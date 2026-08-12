import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { visitSecurityScopeFilterClause } from '../server/securityGuardService.js';
import { VISIT_JOINS } from '../server/visitResponseService.js';
import { buildReceptionSearchClause } from '../server/receptionistService.js';
import { buildFullExpectedVisitorDTO } from '../server/visitorDto.js';

/**
 * Regression tests for defects found during the confidentiality audit.
 * Both were silent: neither broke a build nor an existing test.
 */

describe('AUDIT DEFECT 1 — security scope clause must only reference aliases the query actually joins', () => {
  it('emits no sec_zone/sec_ofc references when the caller cannot provide those joins', () => {
    // createVisitsRouter builds its FROM clause from VISIT_JOINS, which joins
    // visitors/hosts/offices as v/h/ofc — there is no sec_zone or sec_ofc.
    assert.doesNotMatch(VISIT_JOINS, /sec_zone/);
    assert.doesNotMatch(VISIT_JOINS, /sec_ofc/);

    const guardWithBuilding = { siteId: 'site1', stationIds: [], buildingIds: ['bld-1'] };
    const { sql } = visitSecurityScopeFilterClause(guardWithBuilding, { buildingJoinAvailable: false });

    // Referencing an unjoined alias would make the whole endpoint 500 for that
    // officer; falling back to site+gate scope keeps it correct and safe.
    assert.doesNotMatch(sql, /sec_zone/);
    assert.doesNotMatch(sql, /sec_ofc/);
  });

  it('still emits the building predicate when the caller does provide the joins', () => {
    const guardWithBuilding = { siteId: 'site1', stationIds: [], buildingIds: ['bld-1'] };
    const { sql, params } = visitSecurityScopeFilterClause(guardWithBuilding);
    assert.match(sql, /sec_zone\.building_id/);
    assert.deepEqual(params, ['site1', 'bld-1']);
  });

  it('never widens scope when the building predicate is dropped — site+gate still bind', () => {
    const guard = { siteId: 'site1', stationIds: ['gate-a'], buildingIds: ['bld-1'] };
    const { sql, params } = visitSecurityScopeFilterClause(guard, { buildingJoinAvailable: false });
    assert.match(sql, /vis\.site_id = \?/);
    assert.match(sql, /vis\.station_id IN/);
    assert.deepEqual(params, ['site1', 'gate-a']);
  });

  it('a guard scoped ONLY by building falls back to site scope, never to unscoped', () => {
    const guard = { siteId: 'site1', stationIds: [], buildingIds: ['bld-1'] };
    const { sql, params } = visitSecurityScopeFilterClause(guard, { buildingJoinAvailable: false });
    assert.match(sql, /vis\.site_id = \?/);
    assert.deepEqual(params, ['site1']);
    assert.doesNotMatch(sql, /1=1/);
  });
});

describe('AUDIT DEFECT 3 — full DTO must not ship private notes / raw ID numbers over the wire', () => {
  const row = {
    id: 'v1',
    full_name: 'Jane Doe',
    id_number: '123456/78/9',
    id_number_masked: '******78/9',
    confidential_notes: 'Host private note: candidate for acquisition talks',
    invite_token: 'tok',
    check_in_signature: 'sig',
  };

  it('omits confidential_notes and raw id_number by default (same-zone reception, gate)', () => {
    const dto = buildFullExpectedVisitorDTO(row);
    assert.equal(dto.confidential_notes, undefined);
    assert.equal(dto.id_number, undefined);
    assert.equal(dto.invite_token, undefined);
    assert.equal(dto.check_in_signature, undefined);
  });

  it('keeps the masked ID variant the reception desk actually uses', () => {
    const dto = buildFullExpectedVisitorDTO(row);
    assert.equal(dto.id_number_masked, '******78/9');
    assert.equal(dto.full_name, 'Jane Doe');
  });

  it('exposes them only on explicit opt-in', () => {
    const dto = buildFullExpectedVisitorDTO(row, { includePrivateNotes: true, includeRawIdNumber: true });
    assert.equal(dto.confidential_notes, 'Host private note: candidate for acquisition talks');
    assert.equal(dto.id_number, '123456/78/9');
  });
});

describe('AUDIT DEFECT 2 — search must not become a cross-zone inference oracle', () => {
  // A trivial stand-in for the real CASE expression keeps the branch split readable.
  const zoneMatch = { sql: 'ZM', params: [] };

  it('cross-zone rows are matchable only on visitor name, never company/host/pass code', () => {
    const { sql } = buildReceptionSearchClause(zoneMatch);

    // In-zone half may search the rich columns.
    assert.match(sql, /v\.company LIKE/);
    assert.match(sql, /h\.name LIKE/);
    assert.match(sql, /vis\.pass_code LIKE/);

    // The cross-zone half must be gated to full_name only.
    const crossZoneBranch = sql.split('ZM = 0')[1] || '';
    assert.ok(crossZoneBranch.length > 0, 'expected a cross-zone branch');
    assert.match(crossZoneBranch, /v\.full_name LIKE/);
    assert.doesNotMatch(crossZoneBranch, /v\.company/);
    assert.doesNotMatch(crossZoneBranch, /h\.name/);
    assert.doesNotMatch(crossZoneBranch, /pass_code/);
  });

  it('binds one parameter per placeholder so params cannot desynchronise', () => {
    const { sql, params } = buildReceptionSearchClause(zoneMatch, 'Acme');
    const placeholders = (sql.match(/\?/g) || []).length;
    assert.equal(params.length, placeholders);
    assert.ok(params.every((p) => p === '%Acme%'));
  });

  it('interleaves the zone-match expression params in SQL emission order', () => {
    // The real expression carries its own params and is inlined twice, so the
    // returned params must alternate expr-params / like-params correctly or
    // every bound value shifts and the filter silently matches the wrong rows.
    const realish = { sql: '(CASE WHEN x IN (?, ?) THEN 1 ELSE 0 END)', params: ['z1', 'z2'] };
    const { sql, params } = buildReceptionSearchClause(realish, 'Acme');
    assert.equal(params.length, (sql.match(/\?/g) || []).length);
    assert.deepEqual(params, ['z1', 'z2', '%Acme%', '%Acme%', '%Acme%', '%Acme%', 'z1', 'z2', '%Acme%']);
  });

  it('degrades to never-match rather than always-match when no zones are assigned', () => {
    const { sql } = buildReceptionSearchClause(null, 'Acme');
    assert.match(sql, /0 = 1/);
    assert.match(sql, /0 = 0/);
  });
});
