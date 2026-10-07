/**
 * The student side of the API.
 *
 * Nothing here writes to a table directly when a rule is involved: registration goes through
 * sp_RegisterStudent and dropping a course through sp_DropEnrollment, so the rules of the
 * project are enforced in the database itself (see database/01_schema.sql, rules R1 - R7 and
 * the drop rules 51020 - 51022).
 */
import * as SQL from '../sql/statements.js';
import { execute, query, queryOne } from '../db.js';
import { badRequest, notFound } from '../http/errors.js';
import { checkDrop, checkRegistration } from '../rules/registration.js';
import { gpa, standingOf } from '../rules/grading.js';

function parseId(value, name) {
  const id = Number.parseInt(value, 10);
  if (!Number.isInteger(id) || id <= 0) throw badRequest('bad_id', `${name} is not a valid identifier.`);
  return id;
}

export async function currentSemester() {
  return queryOne(SQL.B2_OPEN_SEMESTER);
}

export async function semesters() {
  return query(SQL.B1_SEMESTERS);
}

export async function departments() {
  return query(SQL.A12_DEPARTMENTS);
}

export async function myCourses(studentId, semesterId) {
  const term = semesterId ? await queryOne(
    `SELECT SemesterId, Name, StartDate, EndDate, RegistrationOpen, RegistrationDeadline, DropDeadline
       FROM dbo.Semester WHERE SemesterId = @SemesterId`, { SemesterId: semesterId },
  ) : await currentSemester();
  if (!term) throw notFound('There is no semester to show.', 'no_semester');

  const [rows, load] = await Promise.all([
    query(SQL.B5_MY_ENROLLMENTS, { StudentId: studentId, SemesterId: term.SemesterId }),
    queryOne(SQL.B18_CREDIT_LOAD, { StudentId: studentId }),
  ]);
  return {
    term,
    rows: rows.map((row) => ({
      ...row,
      status: row.Status,
      grade: row.LetterGrade,
      published: Boolean(row.GradePublished),
    })),
    load: load || { CreditHours: 0, Courses: 0 },
  };
}

export async function catalogue(studentId, filters = {}) {
  const term = filters.termId
    ? await queryOne(
      `SELECT SemesterId, Name, StartDate, EndDate, RegistrationOpen, RegistrationDeadline, DropDeadline
         FROM dbo.Semester WHERE SemesterId = @SemesterId`, { SemesterId: parseId(filters.termId, 'Semester') },
    )
    : await currentSemester();
  if (!term) throw notFound('There is no semester to show.', 'no_semester');

  const search = filters.search ? String(filters.search).trim().slice(0, 60) : null;
  const departmentId = filters.departmentId ? parseId(filters.departmentId, 'Department') : null;
  const level = filters.level ? parseId(filters.level, 'Level') : null;

  const rows = await query(SQL.B3_CATALOGUE, {
    StudentId: studentId,
    SemesterId: term.SemesterId,
    Search: search || null,
    DepartmentId: departmentId,
    Level: level,
  });
  return {
    term,
    filters: { search, departmentId, level },
    rows: rows.map((row) => ({
      ...row,
      canRegister: row.SeatsLeft > 0 && row.PrerequisitesMet === 1 && row.AlreadyRegistered === 0,
      blockedReason: row.AlreadyRegistered > 0
        ? 'You already have this course'
        : row.PrerequisitesMet === 0 ? 'A prerequisite is not passed yet'
          : row.SeatsLeft <= 0 ? 'The section is full' : null,
    })),
  };
}

export async function transcript(studentId) {
  const [rows, byTerm, cumulative] = await Promise.all([
    query(SQL.B6_TRANSCRIPT, { StudentId: studentId }),
    query(SQL.B7_GPA_BY_SEMESTER, { StudentId: studentId }),
    queryOne(SQL.B8_CUMULATIVE_GPA, { StudentId: studentId }),
  ]);
  const cumulativeGpa = cumulative ? cumulative.CumulativeGpa : null;
  return {
    rows,
    byTerm,
    summary: {
      cumulativeGpa,
      gradedCreditHours: cumulative ? cumulative.GradedCreditHours : 0,
      passedCreditHours: cumulative ? cumulative.PassedCreditHours : 0,
      standing: standingOf(cumulativeGpa),
      computedGpa: gpa(rows
        .filter((r) => r.GradePublished && r.GradePoints !== null && r.Status !== 'Dropped')
        .map((r) => ({ credits: r.CreditHours, points: Number(r.GradePoints) }))),
    },
  };
}

export async function timetable(studentId, semesterId) {
  const term = semesterId ? await queryOne(
    `SELECT SemesterId, Name, StartDate, EndDate, RegistrationOpen, RegistrationDeadline, DropDeadline
       FROM dbo.Semester WHERE SemesterId = @SemesterId`, { SemesterId: parseId(semesterId, 'Semester') },
  ) : await currentSemester();
  if (!term) throw notFound('There is no semester to show.', 'no_semester');
  const rows = await query(SQL.B9_TIMETABLE, { StudentId: studentId, SemesterId: term.SemesterId });
  return { term, rows };
}

export async function feesAndPayments(studentId) {
  const [terms, payments] = await Promise.all([
    query(SQL.B11_FEES_ALL_SEMESTERS, { StudentId: studentId }),
    query(SQL.B12_PAYMENTS_OF_STUDENT, { StudentId: studentId }),
  ]);
  const billed = terms.reduce((sum, t) => sum + Number(t.FeesDue || 0), 0);
  const paid = payments.reduce((sum, p) => sum + Number(p.Amount || 0), 0);
  return {
    terms: terms.map((t) => ({
      ...t,
      FeesDue: Number(t.FeesDue || 0),
      PaidSoFar: Number(t.PaidSoFar || 0),
      Balance: Number(t.Balance || 0),
    })),
    payments,
    summary: {
      billed: Math.round(billed * 100) / 100,
      paid: Math.round(paid * 100) / 100,
      balance: Math.round((billed - paid) * 100) / 100,
    },
  };
}

export async function announcements(studentId) {
  return query(SQL.B13_ANNOUNCEMENTS_FOR_STUDENT, { StudentId: studentId });
}

export async function advisor(studentId) {
  return queryOne(SQL.B14_ADVISOR_OF_STUDENT, { StudentId: studentId });
}

export async function attendance(studentId) {
  const [summary, detail] = await Promise.all([
    query(SQL.B15_ATTENDANCE_SUMMARY, { StudentId: studentId }),
    query(SQL.B16_ATTENDANCE_DETAIL, { StudentId: studentId }),
  ]);
  return { summary, detail: detail.slice(0, 60) };
}

export async function overview(studentId) {
  const [term, courses, profile, cumulative, finance] = await Promise.all([
    currentSemester(),
    myCourses(studentId),
    advisor(studentId),
    queryOne(SQL.B8_CUMULATIVE_GPA, { StudentId: studentId }),
    feesAndPayments(studentId),
  ]);
  const news = await announcements(studentId);
  const cumulativeGpa = cumulative ? cumulative.CumulativeGpa : null;
  return {
    term: courses.term,
    sections: courses.rows.filter((row) => row.status === 'Enrolled'),
    load: courses.load,
    gpa: {
      cumulativeGpa,
      gradedCreditHours: cumulative ? cumulative.GradedCreditHours : 0,
      passedCreditHours: cumulative ? cumulative.PassedCreditHours : 0,
      standing: standingOf(cumulativeGpa),
    },
    finance: finance.summary,
    advisor: profile,
    announcements: news.slice(0, 5),
  };
}

/**
 * Can this student take this section?  The answer is built from the same facts the procedure
 * reads, and it is used by the screen to explain the button before it is pressed. The
 * decision itself is still taken inside the database.
 */
export async function canRegister(studentId, sectionId) {
  const id = parseId(sectionId, 'Section');
  const section = await queryOne(SQL.B19_SECTION_FOR_CHECK, { SectionId: id, StudentId: studentId });
  if (!section) throw notFound('That section does not exist.', 'section_missing');

  const [term, missingPrerequisites, timetable, load, session] = await Promise.all([
    queryOne(
      `SELECT SemesterId, Name, RegistrationOpen, RegistrationDeadline, DropDeadline
         FROM dbo.Semester WHERE SemesterId = @SemesterId`, { SemesterId: section.SemesterId },
    ),
    query(SQL.B20_MISSING_PREREQUISITES, { CourseId: section.CourseId, StudentId: studentId }),
    query(SQL.B9_TIMETABLE, { StudentId: studentId, SemesterId: section.SemesterId }),
    queryOne(SQL.B18_CREDIT_LOAD, { StudentId: studentId }),
    queryOne(
      `SELECT u.IsActive FROM dbo.AppUser u WHERE u.UserId = @StudentId AND u.Role = 'Student'`,
      { StudentId: studentId },
    ),
  ]);

  const problems = checkRegistration({
    semester: {
      registrationOpen: Boolean(term?.RegistrationOpen),
      registrationDeadline: term?.RegistrationDeadline,
      today: new Date(),
    },
    student: { isActive: session ? Boolean(session.IsActive) : true, creditHoursThisTerm: load?.CreditHours || 0 },
    section: {
      creditHours: section.CreditHours,
      seatsLeft: section.SeatsLeft,
      dayOfWeek: section.DayOfWeek,
      startTime: section.StartTime,
      endTime: section.EndTime,
      courseCode: section.Code,
    },
    alreadyRegistered: section.AlreadyRegistered > 0,
    missingPrerequisites: missingPrerequisites.map((row) => row.Code),
    existingSections: timetable.map((row) => ({
      dayOfWeek: row.DayOfWeek, startTime: row.StartTime, endTime: row.EndTime, courseCode: row.Code,
    })),
  });

  return { section, term, problems, canRegister: problems.length === 0 };
}

/** register the student: the whole rule list is checked again inside the database */
export async function register(studentId, sectionId) {
  const id = parseId(sectionId, 'Section');
  const check = await canRegister(studentId, id);
  if (!check.canRegister) {
    throw badRequest('registration_blocked', check.problems.map((p) => `${p.rule}: ${p.message}`).join(' '), check.problems);
  }
  const result = await execute('dbo.sp_RegisterStudent', { StudentId: studentId, SectionId: id });
  const enrollmentId = result.rows.length ? result.rows[0].EnrollmentId : null;
  return { enrollmentId, section: check.section, term: check.term };
}

export async function dropCourse(studentId, enrollmentId) {
  const id = parseId(enrollmentId, 'Enrollment');
  const row = await queryOne(SQL.B17_ENROLLMENT_FOR_DROP, { EnrollmentId: id, StudentId: studentId });
  if (!row) throw notFound('That registration does not belong to your account.', 'enrollment_missing');

  const problems = checkDrop({
    semester: { registrationOpen: Boolean(row.RegistrationOpen), dropDeadline: row.DropDeadline },
    enrollment: { status: row.Status },
    today: new Date(),
  });
  if (problems.length) {
    throw badRequest('drop_blocked', problems.map((p) => p.message).join(' '), problems);
  }

  await execute('dbo.sp_DropEnrollment', { StudentId: studentId, EnrollmentId: id });
  return { enrollmentId: id, course: row.Code };
}

export async function creditLoad(studentId) {
  return queryOne(SQL.B18_CREDIT_LOAD, { StudentId: studentId });
}

export async function sectionsWithPrerequisites(studentId) {
  return query(SQL.B4_SECTIONS_WITH_PREREQUISITES, { StudentId: studentId });
}
