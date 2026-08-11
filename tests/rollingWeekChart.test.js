import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rollingWeekDates, buildRollingWeekTrend } from '../shared/rollingWeekChart.js';

test('rollingWeekDates returns 7 chronological days ending on the anchor date', () => {
  const dates = rollingWeekDates(new Date('2026-08-11T12:00:00'));
  assert.equal(dates.length, 7);
  assert.equal(dates[0].iso, '2026-08-05');
  assert.equal(dates[6].iso, '2026-08-11');
  assert.equal(dates[5].label, 'Mon 10');
  assert.equal(dates[6].label, 'Tue 11');
});

test('buildRollingWeekTrend maps counts to dated chart rows', () => {
  const trend = buildRollingWeekTrend([1, 0, 2, 0, 0, 4, 3], new Date('2026-08-11T12:00:00'));
  assert.equal(trend.length, 7);
  assert.equal(trend[0].visits, 1);
  assert.equal(trend[6].visits, 3);
  assert.equal(trend[6].label, 'Tue 11');
  assert.equal(trend[6].date, '2026-08-11');
});
