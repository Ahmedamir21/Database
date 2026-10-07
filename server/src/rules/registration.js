/**
 * The registration rules of the project, twice.
 *
 * The authority is the database: sp_RegisterStudent enforces R1 .. R7 inside one
 * transaction with UPDLOCK / HOLDLOCK, so two students cannot take the last seat at the
 * same moment. This file is the same rule list in JavaScript, and it exists for two
 * reasons:
 *   1. the registration screen asks the API "can I take this section?" and the answer can be
 *      explained before the student presses the button (without any risk of a race, because
 *      the decision is still taken by the procedure);
 *   2. tests/registration.test.js feeds both this file and the text of the procedure, so a
 *      rule that is changed in the database and forgotten here makes the test fail.
 * The rule identifiers are the same ones that are printed in database/01_schema.sql.
 */

export const REGISTRATION_RULES = [
  { id: 'R1', title: 'The registration window is open', detail: 'RegistrationOpen = 1 and the deadline has not passed.' },
  { id: 'R2', title: 'The student account is active', detail: 'IsActive = 1 on AppUser.' },
  { id: 'R3', title: 'The prerequisites are passed', detail: 'Every prerequisite course is Completed with a published score of 60 or more.' },
  { id: 'R4', title: 'There is a free seat', detail: 'Enrolled registrations of the section are fewer than the capacity.' },
  { id: 'R5', title: 'There is no clash', detail: 'No other section of the same term overlaps in day and time.' },
  { id: 'R6', title: 'The course is not taken twice', detail: 'No Enrolled or Completed registration of the same course in any term.' },
  { id: 'R7', title: 'The credit limit holds', detail: 'The term stays at or below 18 credit hours.' },
];

export const CREDIT_LIMIT = 18;

function toMinutes(time) {
  if (time === null || time === undefined) return null;
  const [hours, minutes] = String(time).split(':').map((part) => Number.parseInt(part, 10));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

export function overlaps(a, b) {
  if (Number(a.dayOfWeek) !== Number(b.dayOfWeek)) return false;
  const aStart = toMinutes(a.startTime);
  const aEnd = toMinutes(a.endTime);
  const bStart = toMinutes(b.startTime);
  const bEnd = toMinutes(b.endTime);
  if ([aStart, aEnd, bStart, bEnd].some((v) => v === null)) return false;
  return aStart < bEnd && aEnd > bStart;
}

/**
 * Check one registration attempt.
 *
 * input:
 *   semester: { registrationOpen, registrationDeadline, today }
 *   student:  { isActive, creditHoursThisTerm }
 *   section:  { creditHours, seatsLeft, dayOfWeek, startTime, endTime, courseCode }
 *   alreadyRegistered: boolean
 *   missingPrerequisites: ['CS201', ...]
 *   existingSections: [{ dayOfWeek, startTime, endTime, courseCode }, ...]
 *
 * returns [{ rule, message }] - empty means "the database will accept it".
 */
export function checkRegistration(input) {
  const problems = [];
  const {
    semester = {}, student = {}, section = {},
    alreadyRegistered = false, missingPrerequisites = [], existingSections = [],
  } = input;

  if (!semester.registrationOpen) {
    problems.push({ rule: 'R1', message: 'Registration is closed for this semester.' });
  } else if (semester.registrationDeadline && semester.today
             && String(semester.today).slice(0, 10) > String(semester.registrationDeadline).slice(0, 10)) {
    problems.push({ rule: 'R1', message: 'The registration deadline for this semester has passed.' });
  }

  if (student.isActive === false) {
    problems.push({ rule: 'R2', message: 'The student account is not active.' });
  }

  if (missingPrerequisites.length) {
    problems.push({
      rule: 'R3',
      message: `Prerequisite not passed: ${missingPrerequisites.join(', ')}. Pass it with a score of 60 or more first.`,
    });
  }

  if (Number.isFinite(section.seatsLeft) && section.seatsLeft <= 0) {
    problems.push({ rule: 'R4', message: 'The section is full.' });
  }

  if (existingSections.some((other) => overlaps(section, other))) {
    problems.push({ rule: 'R5', message: 'This section clashes with another section you are registered in.' });
  }

  if (alreadyRegistered) {
    problems.push({ rule: 'R6', message: 'You are already registered in this course or you already completed it.' });
  }

  const current = Number(student.creditHoursThisTerm || 0);
  const wanted = Number(section.creditHours || 0);
  if (current + wanted > CREDIT_LIMIT) {
    problems.push({ rule: 'R7', message: `The credit limit of ${CREDIT_LIMIT} hours for this semester would be exceeded.` });
  }

  return problems;
}

export function checkDrop({ semester = {}, enrollment = {}, today } = {}) {
  const problems = [];
  if (!semester.registrationOpen) {
    problems.push({ rule: 'D1', message: 'The semester is not open, so nothing can be dropped.' });
  }
  if (semester.dropDeadline && today && String(today).slice(0, 10) > String(semester.dropDeadline).slice(0, 10)) {
    problems.push({ rule: 'D2', message: 'The deadline for dropping a course has passed.' });
  }
  if (enrollment.status && enrollment.status !== 'Enrolled') {
    problems.push({ rule: 'D3', message: 'Only a course that is still Enrolled can be dropped.' });
  }
  return problems;
}
