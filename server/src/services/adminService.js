/**
 * The administrator side of the API.
 *
 * The administrator is the only role that maintains the reference data (courses, sections,
 * semesters) and the accounts. Three habits are kept everywhere in this file, because they
 * are what makes the application safe around a real database:
 *
 *   1. an administrator never deletes themself, and the last administrator cannot be
 *      switched off (otherwise nobody could ever create another one),
 *   2. a section is refused when its room or its instructor is already busy in that slot,
 *   3. a section that already has registrations or announcements is NOT deleted: the message
 *      explains why, instead of letting the foreign key be the only protection.
 */
import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import * as SQL from '../sql/statements.js';
import { execute, query, queryOne, withTransaction } from '../db.js';
import { badRequest, conflict, forbidden, notFound } from '../http/errors.js';
import { describePasswordProblem, normaliseEmail } from './authService.js';

const PAYMENT_METHODS = ['Cash', 'Card', 'BankTransfer'];
const TITLES = ['Prof.', 'Dr.', 'T.A.'];

function parseId(value, name) {
  const id = Number.parseInt(value, 10);
  if (!Number.isInteger(id) || id <= 0) throw badRequest('bad_id', `${name} is not a valid identifier.`);
  return id;
}

function parseTime(value, name) {
  const text = String(value || '').slice(0, 5);
  if (!/^\d{2}:\d{2}$/.test(text)) throw badRequest('bad_time', `${name} has to look like 09:30.`);
  const [h, m] = text.split(':').map(Number);
  if (h > 23 || m > 59) throw badRequest('bad_time', `${name} is not a real time.`);
  return `${text}:00`;
}

function text(value, name, max, min = 1) {
  const clean = String(value ?? '').trim();
  if (clean.length < min) throw badRequest('too_short', `${name} is missing.`);
  if (clean.length > max) throw badRequest('too_long', `${name} may have ${max} characters.`);
  return clean;
}

/* ------------------------------------------------------------------------------------
   overview and accounts
   ------------------------------------------------------------------------------------ */

export async function overview() {
  const [numbers, board, counts] = await Promise.all([
    queryOne(SQL.D1_OVERVIEW),
    query(SQL.S4_MY_SECTIONS_TODAY),
    query(SQL.S5_TABLE_COUNTS),
  ]);
  return { numbers, board: board.slice(0, 12), tableCounts: counts };
}

export async function tableCounts() {
  return query(SQL.S5_TABLE_COUNTS);
}

export async function users({ role = null, status = null, search = null } = {}) {
  const cleanRole = role ? String(role) : null;
  if (cleanRole && !['Student', 'Instructor', 'Admin'].includes(cleanRole)) {
    throw badRequest('bad_role', 'A role is Student, Instructor or Admin.');
  }
  const rows = await query(SQL.D2_USER_LIST, {
    Role: cleanRole,
    Status: status === null || status === undefined || status === '' ? null : (String(status) === '1' || status === true ? 1 : 0),
    Search: search ? String(search).trim().slice(0, 60) : null,
  });
  return rows.map((row) => ({ ...row, IsActive: Boolean(row.IsActive) }));
}

export async function setActive(callerId, userId, isActive) {
  const id = parseId(userId, 'User');
  if (id === Number(callerId) && !isActive) {
    throw forbidden('You cannot switch off your own account.', 'cannot_disable_self');
  }
  const target = await queryOne(
    `SELECT UserId, FullName, Role, IsActive FROM dbo.AppUser WHERE UserId = @UserId`, { UserId: id },
  );
  if (!target) throw notFound('There is no account with that identifier.', 'account_missing');

  if (target.Role === 'Admin' && !isActive) {
    const admins = await queryOne(SQL.A9_COUNT_ADMINS);
    if (admins.AdminCount <= 1) {
      throw forbidden('This is the last administrator, so it cannot be switched off.', 'last_admin');
    }
  }

  await query(SQL.D3_SET_ACTIVE, { UserId: id, IsActive: isActive ? 1 : 0 });
  return { userId: id, isActive: Boolean(isActive), fullName: target.FullName };
}

export async function createAdmin(callerId, input) {
  const fullName = text(input.fullName, 'The name', 120, 3);
  const email = normaliseEmail(input.email);
  if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email)) {
    throw badRequest('bad_email', 'That is not a valid e-mail address.');
  }
  const position = text(input.position || 'Student Records Officer', 'The position', 80, 3);
  const canRecordPayments = input.canRecordPayments ? 1 : 0;
  const problem = describePasswordProblem(input.password, email, fullName);
  if (problem) throw badRequest('weak_password', problem);
  if (String(input.password) !== String(input.confirmPassword)) {
    throw badRequest('password_mismatch', 'The password and its confirmation are not the same.');
  }
  const taken = await queryOne(SQL.A13_EMAIL_TAKEN, { Email: email });
  if (taken.Taken > 0) throw conflict('email_taken', 'There is already an account with this e-mail address.');

  const hash = await bcrypt.hash(String(input.password), config.auth.bcryptRounds);
  const userId = await withTransaction(async (trx) => {
    const inserted = await trx.queryOne(SQL.A3_INSERT_APP_USER, {
      FullName: fullName, Email: email, PasswordHash: hash, Role: 'Admin', IsActive: 1,
    });
    await trx.query(SQL.A6_INSERT_ADMIN, {
      UserId: inserted.UserId, Position: position, CanRecordPayments: canRecordPayments,
    });
    return inserted.UserId;
  });
  return { userId, fullName, email, position, canRecordPayments: Boolean(canRecordPayments), createdBy: callerId };
}

/* ------------------------------------------------------------------------------------
   the catalogue: courses, sections, semesters, rooms
   ------------------------------------------------------------------------------------ */

export async function catalogue(search = null) {
  const rows = await query(SQL.D5_COURSE_CATALOGUE, {
    Search: search ? String(search).trim().slice(0, 60) : null,
  });
  const [departments, sections] = await Promise.all([
    query(SQL.A12_DEPARTMENTS),
    query(SQL.D4_SECTION_FILL, { SemesterId: null }),
  ]);
  return { rows, departments, sections };
}

export async function createCourse(input) {
  const code = text(input.code, 'The course code', 12, 2).toUpperCase();
  if (!/^[A-Z]{2,4}[0-9]{3}$/.test(code)) {
    throw badRequest('bad_code', 'A course code looks like CS201: two to four letters and three digits.');
  }
  const credits = Number.parseInt(input.creditHours, 10);
  if (!Number.isInteger(credits) || credits < 1 || credits > 6) {
    throw badRequest('bad_credits', 'The credit hours are a whole number between 1 and 6.');
  }
  const level = Number.parseInt(input.level, 10);
  if (!Number.isInteger(level) || level < 1 || level > 5) {
    throw badRequest('bad_level', 'The level is a number between 1 and 5.');
  }
  const departmentId = parseId(input.departmentId, 'Department');
  const existing = await queryOne(`SELECT CourseId FROM dbo.Course WHERE Code = @Code`, { Code: code });
  if (existing) throw conflict('course_exists', `The code ${code} is already used by another course.`);

  const rows = await query(SQL.D8_INSERT_COURSE, {
    Code: code,
    Title: text(input.title, 'The course title', 150, 3),
    CreditHours: credits,
    DepartmentId: departmentId,
    Level: level,
    Description: input.description ? String(input.description).slice(0, 400) : null,
  });
  return { courseId: rows[0].CourseId, code, credits };
}

export async function updateCourse(courseId, input) {
  const id = parseId(courseId, 'Course');
  const course = await queryOne(`SELECT CourseId, Code FROM dbo.Course WHERE CourseId = @CourseId`, { CourseId: id });
  if (!course) throw notFound('There is no course with that identifier.', 'course_missing');
  const credits = Number.parseInt(input.creditHours, 10);
  const level = Number.parseInt(input.level, 10);
  if (!Number.isInteger(credits) || credits < 1 || credits > 6) throw badRequest('bad_credits', 'The credit hours are a number between 1 and 6.');
  if (!Number.isInteger(level) || level < 1 || level > 5) throw badRequest('bad_level', 'The level is a number between 1 and 5.');
  await query(SQL.D9_UPDATE_COURSE, {
    CourseId: id,
    Title: text(input.title, 'The course title', 150, 3),
    CreditHours: credits,
    Level: level,
    Description: input.description ? String(input.description).slice(0, 400) : null,
  });
  return { courseId: id, code: course.Code };
}

export async function sections({ semesterId = null } = {}) {
  const rows = await query(SQL.D4_SECTION_FILL, {
    SemesterId: semesterId ? parseId(semesterId, 'Semester') : null,
  });
  const [semesters, rooms, instructors, courses] = await Promise.all([
    query(SQL.D14_SEMESTERS),
    query(SQL.D6_ROOMS),
    query(SQL.D7_INSTRUCTOR_OPTIONS, { OnlyActive: 1 }),
    query(SQL.D5_COURSE_CATALOGUE, { Search: null }),
  ]);
  return {
    rows: rows.map((row) => ({ ...row, isFull: row.Enrolled >= row.Capacity })),
    semesters, rooms, instructors, courses,
  };
}

async function assertSlotIsFree({ semesterId, roomId, instructorId, dayOfWeek, startTime, endTime, ignoreSectionId = 0 }) {
  const params = {
    SemesterId: semesterId, RoomId: roomId, InstructorId: instructorId,
    DayOfWeek: dayOfWeek, StartTime: startTime, EndTime: endTime, SectionId: ignoreSectionId || 0,
  };
  const [roomClash, instructorClash] = await Promise.all([
    query(SQL.D25_ROOM_CLASH, params),
    query(SQL.D26_INSTRUCTOR_CLASH, params),
  ]);
  if (roomClash.length) {
    throw conflict('room_busy', `The room is already used by ${roomClash[0].Code} ${roomClash[0].SectionCode} in this slot.`, roomClash);
  }
  if (instructorClash.length) {
    throw conflict('instructor_busy', `The instructor already teaches ${instructorClash[0].Code} ${instructorClash[0].SectionCode} in this slot.`, instructorClash);
  }
}

function readSlot(input) {
  const dayOfWeek = Number.parseInt(input.dayOfWeek, 10);
  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 7) {
    throw badRequest('bad_day', 'The day is a number from 1 (Saturday) to 7 (Friday).');
  }
  const startTime = parseTime(input.startTime, 'The start time');
  const endTime = parseTime(input.endTime, 'The end time');
  if (endTime <= startTime) throw badRequest('bad_slot', 'The end of the lecture has to be after its start.');
  const capacity = Number.parseInt(input.capacity, 10);
  if (!Number.isInteger(capacity) || capacity < 5 || capacity > 500) {
    throw badRequest('bad_capacity', 'The capacity is a number between 5 and 500.');
  }
  return { dayOfWeek, startTime, endTime, capacity };
}

export async function createSection(input) {
  const courseId = parseId(input.courseId, 'Course');
  const semesterId = parseId(input.semesterId, 'Semester');
  const instructorId = parseId(input.instructorId, 'Instructor');
  const roomId = parseId(input.roomId, 'Room');
  const sectionCode = text(input.sectionCode || '01', 'The section code', 10, 1);
  const slot = readSlot(input);

  const [course, semester, room, instructor] = await Promise.all([
    queryOne(`SELECT CourseId, Code, CreditHours FROM dbo.Course WHERE CourseId = @CourseId`, { CourseId: courseId }),
    queryOne(SQL.D28_SEMESTER_BY_ID, { SemesterId: semesterId }),
    queryOne(SQL.D29_ROOM_BY_ID, { RoomId: roomId }),
    queryOne(SQL.D30_INSTRUCTOR_BY_ID, { UserId: instructorId }),
  ]);
  if (!course) throw notFound('There is no course with that identifier.', 'course_missing');
  if (!semester) throw notFound('There is no semester with that identifier.', 'semester_missing');
  if (!room) throw notFound('There is no room with that identifier.', 'room_missing');
  if (!instructor) throw notFound('There is no instructor with that identifier.', 'instructor_missing');
  if (!instructor.IsActive) throw conflict('instructor_inactive', 'That instructor account is not active, so it cannot be given a section.');

  const duplicate = await queryOne(
    `SELECT SectionId FROM dbo.Section WHERE CourseId = @CourseId AND SemesterId = @SemesterId AND SectionCode = @SectionCode`,
    { CourseId: courseId, SemesterId: semesterId, SectionCode: sectionCode });
  if (duplicate) throw conflict('section_exists', `The course already has a section ${sectionCode} in ${semester.Name}.`);

  await assertSlotIsFree({
    semesterId, roomId, instructorId,
    dayOfWeek: slot.dayOfWeek, startTime: slot.startTime, endTime: slot.endTime,
  });

  const rows = await query(SQL.D10_INSERT_SECTION, {
    CourseId: courseId, SemesterId: semesterId, InstructorId: instructorId, RoomId: roomId,
    SectionCode: sectionCode, Capacity: slot.capacity,
    DayOfWeek: slot.dayOfWeek, StartTime: slot.startTime, EndTime: slot.endTime,
  });
  return { sectionId: rows[0].SectionId, course: course.Code, semester: semester.Name };
}

export async function updateSection(sectionId, input) {
  const id = parseId(sectionId, 'Section');
  const section = await queryOne(SQL.D24_SECTION_BY_ID, { SectionId: id });
  if (!section) throw notFound('There is no section with that identifier.', 'section_missing');
  const instructorId = parseId(input.instructorId, 'Instructor');
  const roomId = parseId(input.roomId, 'Room');
  const slot = readSlot(input);

  if (slot.capacity < section.Capacity) {
    const enrolled = await queryOne(
      `SELECT COUNT(*) AS Enrolled FROM dbo.Enrollment WHERE SectionId = @SectionId AND Status IN ('Enrolled', 'Completed')`,
      { SectionId: id });
    if (enrolled.Enrolled > slot.capacity) {
      throw conflict('capacity_too_small', `There are already ${enrolled.Enrolled} registrations in this section, so the capacity cannot go below that.`);
    }
  }

  await assertSlotIsFree({
    semesterId: section.SemesterId, roomId, instructorId,
    dayOfWeek: slot.dayOfWeek, startTime: slot.startTime, endTime: slot.endTime,
    ignoreSectionId: id,
  });

  await query(SQL.D11_UPDATE_SECTION, {
    SectionId: id, InstructorId: instructorId, RoomId: roomId, Capacity: slot.capacity,
    DayOfWeek: slot.dayOfWeek, StartTime: slot.startTime, EndTime: slot.endTime,
  });
  return { sectionId: id, capacity: slot.capacity };
}

export async function deleteSection(sectionId) {
  const id = parseId(sectionId, 'Section');
  const section = await queryOne(SQL.D24_SECTION_BY_ID, { SectionId: id });
  if (!section) throw notFound('There is no section with that identifier.', 'section_missing');
  const deps = await queryOne(SQL.D13_SECTION_DEPENDENCIES, { SectionId: id });
  if (deps.Enrollments > 0) {
    throw conflict('section_has_registrations',
      `${section.Code} ${section.SectionCode} has ${deps.Enrollments} registrations. Close the section instead of deleting it: the academic history may never disappear.`,
      deps);
  }
  await query(SQL.D12_DELETE_SECTION, { SectionId: id });
  return { sectionId: id, announcementsRemoved: deps.Announcements };
}

export async function semesters() {
  return query(SQL.D14_SEMESTERS);
}

export async function createSemester(input) {
  const name = text(input.name, 'The semester name', 60, 3);
  const startDate = text(input.startDate, 'The start date', 10, 10);
  const endDate = text(input.endDate, 'The end date', 10, 10);
  if (endDate <= startDate) throw badRequest('bad_dates', 'The semester has to end after it starts.');
  const registrationDeadline = input.registrationDeadline ? String(input.registrationDeadline).slice(0, 10) : null;
  const dropDeadline = input.dropDeadline ? String(input.dropDeadline).slice(0, 10) : null;
  const exists = await queryOne(`SELECT SemesterId FROM dbo.Semester WHERE Name = @Name`, { Name: name });
  if (exists) throw conflict('semester_exists', `There is already a semester called ${name}.`);

  const rows = await query(SQL.D15_INSERT_SEMESTER, {
    Name: name, StartDate: startDate, EndDate: endDate,
    RegistrationOpen: input.registrationOpen ? 1 : 0,
    RegistrationDeadline: registrationDeadline, DropDeadline: dropDeadline,
  });
  return { semesterId: rows[0].SemesterId, name };
}

/** open or close the registration window; opening one semester closes the others */
export async function updateSemester(semesterId, input) {
  const id = parseId(semesterId, 'Semester');
  const semester = await queryOne(SQL.D28_SEMESTER_BY_ID, { SemesterId: id });
  if (!semester) throw notFound('There is no semester with that identifier.', 'semester_missing');
  const registrationOpen = input.registrationOpen ? 1 : 0;
  const registrationDeadline = input.registrationDeadline ? String(input.registrationDeadline).slice(0, 10) : semester.RegistrationDeadline;
  const dropDeadline = input.dropDeadline ? String(input.dropDeadline).slice(0, 10) : semester.DropDeadline;

  await withTransaction(async (trx) => {
    if (registrationOpen) {
      await trx.query(`UPDATE dbo.Semester SET RegistrationOpen = 0 WHERE SemesterId <> @SemesterId`, { SemesterId: id });
    }
    await trx.query(SQL.D16_UPDATE_SEMESTER, {
      SemesterId: id, RegistrationOpen: registrationOpen,
      RegistrationDeadline: registrationDeadline, DropDeadline: dropDeadline,
    });
  });
  return { semesterId: id, registrationOpen: Boolean(registrationOpen), registrationDeadline, dropDeadline };
}

export async function rooms() {
  return query(SQL.D6_ROOMS);
}

/* ------------------------------------------------------------------------------------
   money
   ------------------------------------------------------------------------------------ */

export async function payments({ semesterId = null, search = null } = {}) {
  const rows = await query(SQL.D19_PAYMENTS, {
    SemesterId: semesterId ? parseId(semesterId, 'Semester') : null,
    Search: search ? String(search).trim().slice(0, 40) : null,
  });
  const [outstanding, semesters] = await Promise.all([
    query(SQL.D20_FEES_NOT_PAID),
    query(SQL.D14_SEMESTERS),
  ]);
  const collected = rows.reduce((sum, row) => sum + Number(row.Amount), 0);
  return {
    rows,
    outstanding,
    semesters,
    summary: {
      payments: rows.length,
      collected: Math.round(collected * 100) / 100,
      outstanding: Math.round(outstanding.reduce((sum, row) => sum + Number(row.Balance || 0), 0) * 100) / 100,
    },
  };
}

/**
 * Record a payment. The receipt number is produced inside the transaction
 * (RC-<semester><running number>), and the unique index UQ_Payment_Receipt is the last
 * protection: if two officers save at the same second, one of them gets the retry.
 */
export async function recordPayment(adminId, input) {
  const studentId = parseId(input.studentId, 'Student');
  const semesterId = parseId(input.semesterId, 'Semester');
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000) {
    throw badRequest('bad_amount', 'The amount is a number between 0 and 100000.');
  }
  const method = String(input.method || '');
  if (!PAYMENT_METHODS.includes(method)) {
    throw badRequest('bad_method', `The method is one of ${PAYMENT_METHODS.join(', ')}.`);
  }
  const student = await queryOne(SQL.D27_STUDENT_FOR_PAYMENT, { StudentId: studentId });
  if (!student) throw notFound('There is no student with that identifier.', 'student_missing');
  const semester = await queryOne(SQL.D28_SEMESTER_BY_ID, { SemesterId: semesterId });
  if (!semester) throw notFound('There is no semester with that identifier.', 'semester_missing');
  if (!student.IsActive) throw conflict('student_inactive', 'The account of this student is not active.');

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const receipt = await withTransaction(async (trx) => {
        const next = await trx.queryOne(SQL.D18_NEXT_RECEIPT_NUMBER, { SemesterId: semesterId });
        const receiptNumber = next.NextReceiptNumber;
        const rows = await trx.query(SQL.D17_INSERT_PAYMENT, {
          StudentId: studentId, SemesterId: semesterId, Amount: Math.round(amount * 100) / 100,
          Method: method, ReceiptNumber: receiptNumber, AdminId: adminId,
          PaidAt: input.paidAt ? new Date(input.paidAt) : new Date(),
        });
        return { receiptNumber, paymentId: rows[0].PaymentId };
      });
      return {
        ...receipt, studentNumber: student.StudentNumber, studentName: student.FullName,
        amount: Math.round(amount * 100) / 100, method, semester: semester.Name,
      };
    } catch (error) {
      const duplicate = error?.number === 2627 || error?.number === 2601;
      if (!duplicate || attempt === 2) throw error;
    }
  }
  throw conflict('receipt_conflict', 'The receipt number was taken twice. Please try again.');
}

export async function feesNotPaid() {
  return query(SQL.D20_FEES_NOT_PAID);
}

/* ------------------------------------------------------------------------------------
   announcements
   ------------------------------------------------------------------------------------ */

export async function announcements() {
  return query(SQL.D22_ANNOUNCEMENTS);
}

export async function postAnnouncement(adminId, { title, body, isPinned }) {
  const cleanTitle = text(title, 'The title', 150, 3);
  const cleanBody = text(body, 'The text', 1000, 3);
  const rows = await query(SQL.D21_GLOBAL_ANNOUNCEMENT, {
    AuthorId: adminId, Title: cleanTitle, Body: cleanBody, IsPinned: isPinned ? 1 : 0,
  });
  return { announcementId: rows[0].AnnouncementId, title: cleanTitle };
}

export async function deleteAnnouncement(announcementId) {
  const id = parseId(announcementId, 'Announcement');
  await query(SQL.D23_DELETE_ANNOUNCEMENT, { AnnouncementId: id });
  return { announcementId: id };
}

/* ------------------------------------------------------------------------------------
   the first administrator
   ------------------------------------------------------------------------------------ */

/** used by scripts/seedAdmin.js: the ONLY account that is created outside the application */
export async function createFirstAdmin({ fullName, email, password }) {
  const admins = await queryOne(SQL.A9_COUNT_ADMINS);
  if (admins.AdminCount > 0) {
    throw conflict('admin_exists', 'An administrator already exists. Create the next one inside the application.');
  }
  const problem = describePasswordProblem(password, email, fullName);
  if (problem) throw badRequest('weak_password', problem);
  const hash = await bcrypt.hash(String(password), config.auth.bcryptRounds);
  const result = await execute('dbo.sp_CreateFirstAdmin', {
    FullName: text(fullName, 'The name', 120, 3),
    Email: normaliseEmail(email),
    PasswordHash: hash,
  });
  const userId = result.rows.length ? result.rows[0].UserId : null;
  return { userId, email: normaliseEmail(email) };
}
