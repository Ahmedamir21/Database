/**
 * The grade scale of the application has to be the same as the grade scale of the database.
 *
 * These tests read the bands out of database/01_schema.sql (the two functions fn_LetterGrade
 * and fn_GradePoints) and compare them with the table in src/rules/grading.js. If somebody
 * changes a cut-off on one side only, the test fails: that is the whole point.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  GRADE_SCALE, PASSING_SCORE, countsInGpa, gpa, letterForScore, passesCourse,
  pointsForLetter, pointsForScore, standingOf, isValidScore,
} from '../src/rules/grading.js';
import { projectRoot } from '../src/config.js';

const schema = fs.readFileSync(path.join(projectRoot, 'database', '01_schema.sql'), 'utf8');

function bandsOf(functionName) {
  const body = schema.match(new RegExp(`CREATE FUNCTION dbo\\.${functionName}[\\s\\S]*?\\nGO`))[0];
  const bands = [];
  for (const match of body.matchAll(/WHEN @Score >= (\d+) THEN ('[^']*'|[\d.]+)/g)) {
    bands.push({ min: Number(match[1]), value: match[2].replace(/'/g, '') });
  }
  // the lowest band of the schema is written as ELSE (a score under 60 fails the course)
  const last = body.match(/ELSE ('[^']*'|[\d.]+)/);
  if (last) bands.push({ min: 0, value: last[1].replace(/'/g, '') });
  return bands;
}

test('the letters of the schema and of the application are the same', () => {
  const fromSchema = bandsOf('fn_LetterGrade').map((b) => ({ min: b.min, letter: b.value }));
  const fromApp = GRADE_SCALE.map((b) => ({ min: b.min, letter: b.letter }));
  assert.deepEqual(fromApp, fromSchema);
});

test('the grade points of the schema and of the application are the same', () => {
  const fromSchema = bandsOf('fn_GradePoints').map((b) => ({ min: b.min, points: Number(b.value) }));
  const fromApp = GRADE_SCALE.map((b) => ({ min: b.min, points: b.points }));
  assert.deepEqual(fromApp, fromSchema);
});

test('the scale covers 0 to 100 without a hole and starts with A at 93', () => {
  assert.equal(GRADE_SCALE[0].letter, 'A');
  assert.equal(GRADE_SCALE[0].min, 93);
  assert.equal(GRADE_SCALE.at(-1).letter, 'F');
  assert.equal(GRADE_SCALE.at(-1).min, 0);
  for (let i = 1; i < GRADE_SCALE.length; i += 1) {
    assert.ok(GRADE_SCALE[i].min < GRADE_SCALE[i - 1].min, 'the bands have to go down');
  }
  for (const score of [0, 1, 59.99, 60, 72.5, 89.9, 93, 100]) {
    assert.ok(letterForScore(score), `score ${score} needs a letter`);
  }
});

test('the letter of a score, at every cut-off', () => {
  assert.equal(letterForScore(93), 'A');
  assert.equal(letterForScore(92.99), 'A-');
  assert.equal(letterForScore(90), 'A-');
  assert.equal(letterForScore(87), 'B+');
  assert.equal(letterForScore(83), 'B');
  assert.equal(letterForScore(80), 'B-');
  assert.equal(letterForScore(77), 'C+');
  assert.equal(letterForScore(73), 'C');
  assert.equal(letterForScore(70), 'C-');
  assert.equal(letterForScore(67), 'D+');
  assert.equal(letterForScore(60), 'D');
  assert.equal(letterForScore(59.99), 'F');
  assert.equal(letterForScore(0), 'F');
});

test('the grade points of a score, at every cut-off', () => {
  assert.equal(pointsForScore(93), 4.0);
  assert.equal(pointsForScore(90), 3.7);
  assert.equal(pointsForScore(60), 1.0);
  assert.equal(pointsForScore(0), 0.0);
  assert.equal(pointsForLetter('b+'), 3.3);
  assert.equal(pointsForLetter('Z'), null);
});

test('a score outside 0 to 100 is not a score', () => {
  for (const bad of [-1, 101, Number.NaN, 'eighty', null, undefined]) {
    assert.equal(isValidScore(bad), false);
    assert.equal(letterForScore(bad), null);
  }
});

test('only a score of 60 or more passes a course', () => {
  assert.equal(PASSING_SCORE, 60);
  assert.equal(passesCourse(60), true);
  assert.equal(passesCourse(59.5), false);
});

test('W and I stay on the transcript but not in the GPA', () => {
  assert.equal(countsInGpa('W'), false);
  assert.equal(countsInGpa('I'), false);
  assert.equal(countsInGpa('F'), true);
  assert.equal(countsInGpa('A'), true);
  assert.equal(countsInGpa(null), false);
});

test('the GPA is quality points divided by graded credit hours, rounded half up', () => {
  assert.equal(gpa([{ credits: 3, points: 4 }, { credits: 3, points: 3 }]), 3.5);
  assert.equal(gpa([{ credits: 4, points: 3.3 }, { credits: 3, points: 2.7 }, { credits: 3, points: 2 }]), 2.73);
  assert.equal(gpa([]), null);
  assert.equal(gpa([{ credits: 0, points: 4 }]), null);
  // a course without points (still registered) does not count
  assert.equal(gpa([{ credits: 3, points: 4 }, { credits: 3, points: null }]), 4);
});

test('the standing of a student follows the GPA', () => {
  assert.equal(standingOf(3.8).tone, 'success');
  assert.equal(standingOf(3.8).label, 'Honour list');
  assert.equal(standingOf(2.2).tone, 'info');
  assert.equal(standingOf(1.6).tone, 'warning');
  assert.equal(standingOf(1.0).tone, 'danger');
  assert.equal(standingOf(null).label, 'No grades yet');
});
