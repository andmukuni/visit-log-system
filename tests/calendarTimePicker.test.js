import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatTimePickerLabel,
  isSameDay,
  parseTimeInputValue,
  setScheduleEndTime,
  setScheduleStartTime,
  toTimeInputFromParts,
} from '../src/components/executive/calendarUtils.js';

test('parseTimeInputValue keeps quarter-past and quarter-to minutes', () => {
  assert.deepEqual(parseTimeInputValue('08:15'), {
    hour12: 8, minute: 15, period: 'AM', hours24: 8,
  });
  // Regression: snapping the minute on its own rounded :45 up to 60, then %60
  // dropped it to :00 without carrying the hour, moving the visit 45m earlier.
  assert.deepEqual(parseTimeInputValue('08:45'), {
    hour12: 8, minute: 45, period: 'AM', hours24: 8,
  });
  assert.equal(formatTimePickerLabel('08:45'), '8:45am');
});

test('parseTimeInputValue rounds to the picker step and carries into the hour', () => {
  assert.deepEqual(parseTimeInputValue('08:58'), {
    hour12: 9, minute: 0, period: 'AM', hours24: 9,
  });
  assert.deepEqual(parseTimeInputValue('13:47'), {
    hour12: 1, minute: 45, period: 'PM', hours24: 13,
  });
});

test('parseTimeInputValue clamps at the end of the day instead of wrapping to midnight', () => {
  assert.deepEqual(parseTimeInputValue('23:58'), {
    hour12: 11, minute: 55, period: 'PM', hours24: 23,
  });
});

test('parseTimeInputValue maps midnight and noon to 12-hour form', () => {
  assert.equal(formatTimePickerLabel('00:00'), '12:00am');
  assert.equal(formatTimePickerLabel('00:30'), '12:30am');
  assert.equal(formatTimePickerLabel('12:00'), '12:00pm');
  assert.equal(formatTimePickerLabel('12:30'), '12:30pm');
});

test('time parts round-trip through the picker', () => {
  for (const value of ['00:00', '00:05', '09:15', '11:55', '12:00', '13:45', '23:55']) {
    assert.equal(toTimeInputFromParts(parseTimeInputValue(value)), value);
  }
});

test('setScheduleEndTime never rolls the appointment onto the next day', () => {
  const startAt = new Date(2026, 7, 15, 13, 0, 0, 0);
  const endAt = new Date(2026, 7, 15, 14, 0, 0, 0);

  const next = setScheduleEndTime(startAt, endAt, '12:00');

  assert.equal(next.adjusted, true);
  assert.ok(isSameDay(next.startAt, next.endAt));
  assert.equal(next.endAt.getHours(), 14);
});

test('setScheduleEndTime rejects an end equal to the start', () => {
  // The reported case: a 1:00am slot whose end wheel was scrolled back to 1:00am
  // silently became a 24-hour visit rendered as "1:00am – 1:00am".
  const startAt = new Date(2026, 7, 15, 1, 0, 0, 0);
  const endAt = new Date(2026, 7, 15, 2, 0, 0, 0);

  const next = setScheduleEndTime(startAt, endAt, '01:00');

  assert.equal(next.adjusted, true);
  assert.ok(isSameDay(next.startAt, next.endAt));
  assert.ok(next.endAt > next.startAt);
});

test('setScheduleEndTime accepts a later time unchanged', () => {
  const startAt = new Date(2026, 7, 15, 13, 0, 0, 0);
  const endAt = new Date(2026, 7, 15, 14, 0, 0, 0);

  const next = setScheduleEndTime(startAt, endAt, '15:30');

  assert.equal(next.adjusted, false);
  assert.equal(next.endAt.getHours(), 15);
  assert.equal(next.endAt.getMinutes(), 30);
});

test('setScheduleEndTime keeps an end that already sits on a later date', () => {
  const startAt = new Date(2026, 7, 15, 22, 0, 0, 0);
  const endAt = new Date(2026, 7, 16, 1, 0, 0, 0);

  const next = setScheduleEndTime(startAt, endAt, '02:30');

  assert.equal(next.adjusted, false);
  assert.equal(next.endAt.getDate(), 16);
  assert.equal(next.endAt.getHours(), 2);
});

test('setScheduleStartTime pushes the end forward when the start passes it', () => {
  const startAt = new Date(2026, 7, 15, 13, 0, 0, 0);
  const endAt = new Date(2026, 7, 15, 14, 0, 0, 0);

  const next = setScheduleStartTime(startAt, endAt, '14:30');

  assert.equal(next.startAt.getHours(), 14);
  assert.equal(next.startAt.getMinutes(), 30);
  assert.equal(next.endAt.getHours(), 15);
  assert.equal(next.endAt.getMinutes(), 30);
});
