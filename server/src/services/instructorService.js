/**
 * The instructor side of the API.
 *
 * Every function starts by proving that the section belongs to the person who is asking
 * (C3_SECTION_OF_INSTRUCTOR). A teacher of one section must not be able to read or change
 * the grades of the section of a colleague, and that check cannot be left to the client.
 */
import * as SQL from '../sql/statements.js';
import { execute, query, queryOne, withTransaction } from '../db.js';
import { badRequest, forbidden, notFound } from '../http/errors.js';
import { isValidScore, letterForScore, pointsForScore } from '../rules/grading.js';

const ATTENDANCE_STATUSES = ['Present', 'Absent', 'Excused'];

function parseId(value, name) {
  const id = Number.parseInt(value, 10);
  if (!Number.isInteger(id) || id <= 0) throw badRequest('bad_id', `${name} is not a valid identifier.`);
  return id;
}

function parseDate(value, name = 'Date') {
  const text = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw badRequest('bad_date', `${name} has to look like 2025-10-04.`);
  const parsed = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) throw badRequest('bad_date', `${name} is not a real date.`);
  return text;
}

/** the section, only when it belongs to this instructor */
export async function ownedSection(instructorId, sectionId) {
  const section = await queryOne(SQL.C3_SECTION_OF_INSTRUCTOR, {
    SectionId: parseId(sectionId, 'Section'),
    InstructorId: instructorId,
  });
  if (!section) throw forbidden('This section is not one of your sections.', 'not_your_section');
  return section;
}

export async function mySections(instructorId, semesterId = null) {
  const rows = await query(SQL.C1_MY_SECTIONS, {
    InstructorId: instructorId,
    SemesterId: semesterId ? parseId(semesterId, 'Semester') : null,
  });
  return rows.map((row) => ({
    ...row,
    openToGrade: row.Enrolled > 0,
    publishedAll: row.Enrolled > 0 && row.Published >= row.Enrolled,
    fillPercent: row.Capacity ? Math.round((row.Enrolled / row.Capacity) * 1000) / 10 : 0,
  }));
}

export async function overview(instructorId) {
  const [term, sections, students] = await Promise.all([
    queryOne(SQL.B2_OPEN_SEMESTER),
    mySections(instructorId),
    query(SQL.C11_MY_STUDENTS, { InstructorId: instructorId }),
  ]);
  const current = term ? sections.filter((s) => s.SemesterId === term.SemesterId) : [];
  return {
    term,
    sections: current.length ? current : sections.slice(0, 4),
    allSections: sections.length,
    students: students.length,
    publishedSections: sections.filter((s) => s.publishedAll).length,
  };
}

export async function roster(instructorId, sectionId) {
  const section = await ownedSection(instructorId, sectionId);
  const [rows, statistics, attendance] = await Promise.all([
    query(SQL.C2_ROSTER, { SectionId: section.SectionId }),
    queryOne(SQL.C6_SECTION_STATISTICS, { SectionId: section.SectionId }),
    queryOne(SQL.C7_ATTENDANCE_RATE, { SectionId: section.SectionId }),
  ]);
  return { section, rows, statistics, attendance };
}

/**
 * One score. The letter grade and the grade points are NOT sent from here: the trigger
 * TR_Enrollment_SetGrade writes them inside the database, which is exactly what the project
 * means by "the grade scale is a database rule".
 */
export async function setScore(instructorId, sectionId, enrollmentId, score) {
  const section = await ownedSection(instructorId, sectionId);
  const value = Number(score);
  if (!isValidScore(value)) {
    throw badRequest('bad_score', 'A score is a number between 0 and 100.');
  }
  const enrollment = await queryOne(SQL.C5_ENROLLMENT_OF_SECTION, {
    EnrollmentId: parseId(enrollmentId, 'Enrollment'),
    SectionId: section.SectionId,
  });
  if (!enrollment) throw notFound('That student is not registered in this section.', 'not_in_section');
  if (enrollment.Status === 'Dropped') {
    throw badRequest('student_dropped', 'This student dropped the course, so there is no score to write.');
  }
  if (enrollment.Status === 'Completed') {
    throw badRequest('grades_published',
      'The grades of this section are published. Ask the student office for a correction.',
      { sectionId: section.SectionId });
  }

  await query(SQL.C4_SET_SCORE, { EnrollmentId: enrollment.EnrollmentId, Score: value });
  return {
    enrollmentId: enrollment.EnrollmentId,
    score: value,
    letter: letterForScore(value),
    points: pointsForScore(value),
    note: 'The letter grade and the grade points were written by the trigger inside the database.',
  };
}

/** publish: sp_PublishGrades refuses when anybody of the section has no score yet */
export async function publishGrades(instructorId, sectionId) {
  const section = await ownedSection(instructorId, sectionId);
  const result = await execute('dbo.sp_PublishGrades', { SectionId: section.SectionId });
  const published = result.rows.length ? result.rows[0].Published : 0;
  return { section, published };
}

export async function sectionStatistics(instructorId, sectionId) {
  const section = await ownedSection(instructorId, sectionId);
  const [statistics, attendance] = await Promise.all([
    queryOne(SQL.C6_SECTION_STATISTICS, { SectionId: section.SectionId }),
    queryOne(SQL.C7_ATTENDANCE_RATE, { SectionId: section.SectionId }),
  ]);
  return { section, statistics, attendance };
}

/** the roster of one session: the list to tick, with what was saved before */
export async function attendanceSheet(instructorId, sectionId, sessionDate) {
  const section = await ownedSection(instructorId, sectionId);
  const date = sessionDate ? parseDate(sessionDate) : null;
  const [students, saved] = await Promise.all([
    query(SQL.C2_ROSTER, { SectionId: section.SectionId }),
    query(SQL.C8_ATTENDANCE_OF_SECTION, { SectionId: section.SectionId }),
  ]);
  const forDate = date ? saved.filter((row) => String(row.SessionDate).slice(0, 10) === date) : [];
  return {
    section,
    sessionDate: date,
    students: students.filter((row) => row.Status !== 'Dropped'),
    saved: forDate,
    dates: [...new Set(saved.map((row) => String(row.SessionDate).slice(0, 10)))].sort().reverse(),
  };
}

/**
 * Save the attendance of one session. One statement per student (a MERGE), all of them in
 * one transaction, so a session is never half saved.
 */
export async function saveAttendance(instructorId, sectionId, sessionDate, entries) {
  const section = await ownedSection(instructorId, sectionId);
  const date = parseDate(sessionDate, 'Session date');
  if (!Array.isArray(entries) || entries.length === 0) {
    throw badRequest('nothing_to_save', 'There is no attendance in the request.');
  }

  const saved = await withTransaction(async (trx) => {
    const roster = await trx.query(SQL.C2_ROSTER, { SectionId: section.SectionId });
    const allowed = new Map(roster.map((row) => [Number(row.EnrollmentId), row]));
    let count = 0;
    for (const entry of entries) {
      const enrollmentId = Number.parseInt(entry.enrollmentId, 10);
      const status = String(entry.status || '');
      if (!allowed.has(enrollmentId)) {
        throw badRequest('not_in_section', `Registration ${entry.enrollmentId} is not part of this section.`);
      }
      if (!ATTENDANCE_STATUSES.includes(status)) {
        throw badRequest('bad_attendance_status', `Attendance status "${entry.status}" is not one of ${ATTENDANCE_STATUSES.join(', ')}.`);
      }
      await trx.query(SQL.C9_UPSERT_ATTENDANCE, { EnrollmentId: enrollmentId, SessionDate: date, Status: status });
      count += 1;
    }
    return count;
  });

  return { section, sessionDate: date, saved };
}

export async function myStudents(instructorId) {
  return query(SQL.C11_MY_STUDENTS, { InstructorId: instructorId });
}

export async function postAnnouncement(instructorId, sectionId, { title, body, isPinned }) {
  const section = await ownedSection(instructorId, sectionId);
  const cleanTitle = String(title || '').trim();
  const cleanBody = String(body || '').trim();
  if (cleanTitle.length < 3) throw badRequest('title_too_short', 'The title needs at least three characters.');
  if (cleanBody.length < 3) throw badRequest('body_too_short', 'The text of the announcement is empty.');
  if (cleanTitle.length > 150) throw badRequest('title_too_long', 'The title may have 150 characters.');
  if (cleanBody.length > 1000) throw badRequest('body_too_long', 'The text may have 1000 characters.');

  const rows = await query(SQL.C10_INSERT_SECTION_ANNOUNCEMENT, {
    SectionId: section.SectionId,
    AuthorId: instructorId,
    Title: cleanTitle,
    Body: cleanBody,
    IsPinned: isPinned ? 1 : 0,
  });
  return { announcementId: rows[0]?.AnnouncementId, section };
}

export async function sectionAnnouncements(instructorId, sectionId) {
  const section = await ownedSection(instructorId, sectionId);
  const rows = await query(SQL.B21_ANNOUNCEMENTS_FOR_SECTION, { SectionId: section.SectionId });
  return { section, rows };
}
