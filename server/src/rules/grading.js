/**
 * The grade scale, in JavaScript.
 *
 * The database is the authority: fn_LetterGrade, fn_GradePoints and the trigger
 * TR_Enrollment_SetGrade write the letter and the points of a score, so a value that is
 * inserted by any path is always graded the same way. This file is the mirror of that
 * scale for two purposes only:
 *   1. the client can show the letter of a score while the teacher is still typing
 *   2. the unit tests can prove that the mirror is identical to the scale in the schema
 *      (tests/grading.test.js compares both tables).
 * The scale follows the Zewail City grading table: A 93, A- 90, B+ 87, B 83, B- 80,
 * C+ 77, C 73, C- 70, D+ 67, D 60, and F below 60.
 */
export const GRADE_SCALE = [
  { letter: 'A',  min: 93, points: 4.0 },
  { letter: 'A-', min: 90, points: 3.7 },
  { letter: 'B+', min: 87, points: 3.3 },
  { letter: 'B',  min: 83, points: 3.0 },
  { letter: 'B-', min: 80, points: 2.7 },
  { letter: 'C+', min: 77, points: 2.3 },
  { letter: 'C',  min: 73, points: 2.0 },
  { letter: 'C-', min: 70, points: 1.7 },
  { letter: 'D+', min: 67, points: 1.3 },
  { letter: 'D',  min: 60, points: 1.0 },
  { letter: 'F',  min: 0,  points: 0.0 },
];

export const PASSING_SCORE = 60;
export const PASSING_GRADE_POINTS = 1.0;

export function isValidScore(score) {
  return typeof score === 'number' && Number.isFinite(score) && score >= 0 && score <= 100;
}

export function letterForScore(score) {
  if (!isValidScore(score)) return null;
  return GRADE_SCALE.find((band) => score >= band.min).letter;
}

export function pointsForScore(score) {
  if (!isValidScore(score)) return null;
  return GRADE_SCALE.find((band) => score >= band.min).points;
}

export function pointsForLetter(letter) {
  const band = GRADE_SCALE.find((b) => b.letter === String(letter).trim().toUpperCase());
  return band ? band.points : null;
}

export function passesCourse(score) {
  return isValidScore(score) && score >= PASSING_SCORE;
}

/**
 * GPA of a list of { credits, points } items (the same arithmetic as vw_StudentGpa:
 * quality points divided by graded credit hours, half-up rounding on two decimals).
 */
export function gpa(items) {
  const graded = items.filter((i) => Number.isFinite(i.points) && Number.isFinite(i.credits));
  const credits = graded.reduce((sum, i) => sum + i.credits, 0);
  if (credits === 0) return null;
  const quality = graded.reduce((sum, i) => sum + i.credits * i.points, 0);
  return Math.round((quality / credits + Number.EPSILON) * 100) / 100;
}

/** W and I stay on the transcript but are not graded, so they do not change the GPA */
export function countsInGpa(letter) {
  if (letter === null || letter === undefined) return false;
  const clean = String(letter).trim().toUpperCase();
  return clean !== 'W' && clean !== 'I' && clean !== 'IP' && clean !== 'AU';
}

export function standingOf(gpaValue) {
  if (gpaValue === null || gpaValue === undefined) return { label: 'No grades yet', tone: 'info' };
  if (gpaValue >= 3.6) return { label: 'Honour list', tone: 'success' };
  if (gpaValue >= 3.0) return { label: 'Good standing', tone: 'success' };
  if (gpaValue >= 2.0) return { label: 'Satisfactory', tone: 'info' };
  if (gpaValue >= 1.5) return { label: 'Warning', tone: 'warning' };
  return { label: 'Academic risk', tone: 'danger' };
}

export const GRADING_RULES = {
  maxCreditsPerTerm: 21,
  normalCreditsPerTerm: 18,
  minCreditsPerTerm: 12,
  graduationCredits: 132,
};
