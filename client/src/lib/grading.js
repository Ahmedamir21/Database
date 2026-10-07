/**
 * The grade scale, written down once for the client.
 *
 * It is the same scale as the database (dbo.fn_LetterGrade and dbo.fn_GradePoints in
 * database/01_schema.sql) and the same as server/src/rules/grading.js, and the transcript page
 * shows the two numbers side by side on purpose: if SQL Server and the screen ever disagreed,
 * the page would say so in red.
 *
 *   score  93+  A   4.00     |  80+  B-  2.70  |  73+  C   2.00  |  67+  D+  1.30
 *          90+  A-  3.70     |  77+  C+  2.30  |  70+  C-  1.70  |  60+  D   1.00
 *          87+  B+  3.30     |                          under 60: F, 0.00
 *          83+  B   3.00
 */

const BANDS = [
  { min: 93, letter: 'A', points: 4.0 },
  { min: 90, letter: 'A-', points: 3.7 },
  { min: 87, letter: 'B+', points: 3.3 },
  { min: 83, letter: 'B', points: 3.0 },
  { min: 80, letter: 'B-', points: 2.7 },
  { min: 77, letter: 'C+', points: 2.3 },
  { min: 73, letter: 'C', points: 2.0 },
  { min: 70, letter: 'C-', points: 1.7 },
  { min: 67, letter: 'D+', points: 1.3 },
  { min: 60, letter: 'D', points: 1.0 },
  { min: 0, letter: 'F', points: 0.0 },
];

export const PASS_SCORE = 60;
export const CREDIT_LIMIT = 18;

export function isValidScore(score) {
  return Number.isFinite(Number(score)) && Number(score) >= 0 && Number(score) <= 100;
}

export function letterForScore(score) {
  const value = Number(score);
  return BANDS.find((band) => value >= band.min).letter;
}

export function pointsForScore(score) {
  const value = Number(score);
  return BANDS.find((band) => value >= band.min).points;
}

/** the quality points over the graded credit hours, rounded the way T-SQL ROUND does */
export function gpa(rows) {
  const credits = rows.reduce((sum, row) => sum + row.credits, 0);
  if (!credits) return null;
  const quality = rows.reduce((sum, row) => sum + row.credits * row.points, 0);
  return Math.round((quality / credits) * 100 + 1e-9) / 100;
}

export function standingOf(value) {
  if (value === null || value === undefined) return { label: 'No graded course yet', tone: 'neutral' };
  if (value >= 3.6) return { label: 'Excellent standing', tone: 'success' };
  if (value >= 3.0) return { label: 'Very good standing', tone: 'success' };
  if (value >= 2.0) return { label: 'Good standing', tone: 'info' };
  if (value >= 1.0) return { label: 'Warning: below 2.00', tone: 'warn' };
  return { label: 'At risk of dismissal', tone: 'danger' };
}

export default { letterForScore, pointsForScore, gpa, standingOf, isValidScore };
