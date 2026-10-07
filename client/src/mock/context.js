/**
 * The demonstration database, in memory.
 *
 * The arrays of demo-data.js are the rows of database/02_seed.sql. This file joins them the
 * way SQL Server does: an enrolment knows its section, its course, its semester and its
 * student; a student knows their programme, their advisor and their totalled GPA; a section
 * knows how full it is. Everything the screens show is computed from these rows, so the
 * demonstration mode cannot show a number that the real database could not produce.
 *
 * The letter grade and the grade points are NOT in the seed either: exactly like the trigger
 * TR_Enrollment_SetGrade, they are derived from the score (client/src/lib/grading.js).
 */
import { SEED } from './demo-data.js';
import { letterForScore, pointsForScore } from '../lib/grading.js';

const index = (rows, key) => new Map(rows.map((row) => [row[key], row]));

export const departments = SEED.Department;
export const programs = SEED.Program;
export const rooms = SEED.Room;
export const users = SEED.AppUser;
export const students = SEED.Student;
export const instructors = SEED.Instructor;
export const admins = SEED.Admin;
export const courses = SEED.Course;
export const prerequisites = SEED.Prerequisite;
export const semesters = SEED.Semester;
export const sections = SEED.Section;
export const attendance = SEED.Attendance;
export const announcements = SEED.Announcement;
export const payments = SEED.Payment;

export const userById = index(users, 'UserId');
export const studentById = index(students, 'UserId');
export const instructorById = index(instructors, 'UserId');
export const adminById = index(admins, 'UserId');
export const programById = index(programs, 'ProgramId');
export const departmentById = index(departments, 'DepartmentId');
export const courseById = index(courses, 'CourseId');
export const semesterById = index(semesters, 'SemesterId');
export const sectionById = index(sections, 'SectionId');
export const roomById = index(rooms, 'RoomId');

export const fullNameOf = (userId) => userById.get(Number(userId))?.FullName || '—';
export const emailOf = (userId) => userById.get(Number(userId))?.Email || '—';
export const roomNameOf = (roomId) => {
  const room = roomById.get(Number(roomId));
  return room ? `${room.Building} ${room.RoomNumber}` : '—';
};

/** every enrolment of the seed, joined the way the SQL joins it */
export const enrollments = SEED.Enrollment.map((row) => {
  const section = sectionById.get(row.SectionId);
  const course = courseById.get(section.CourseId);
  const semester = semesterById.get(section.SemesterId);
  const student = studentById.get(row.StudentId);
  const grade = row.Score === null || row.Score === undefined
    ? { LetterGrade: null, GradePoints: null }
    : { LetterGrade: letterForScore(row.Score), GradePoints: pointsForScore(row.Score) };
  return {
    ...row,
    ...grade,
    section,
    course,
    semester,
    student,
    studentUser: userById.get(row.StudentId),
    program: programById.get(student.ProgramId),
    instructorName: fullNameOf(section.InstructorId),
  };
});

const byStudent = new Map();
const bySection = new Map();
const byEnrollment = new Map();
for (const row of enrollments) {
  if (!byStudent.has(row.StudentId)) byStudent.set(row.StudentId, []);
  byStudent.get(row.StudentId).push(row);
  if (!bySection.has(row.SectionId)) bySection.set(row.SectionId, []);
  bySection.get(row.SectionId).push(row);
  byEnrollment.set(row.EnrollmentId, row);
}
for (const list of byStudent.values()) list.sort((a, b) => b.semester.StartDate.localeCompare(a.semester.StartDate) || a.course.Code.localeCompare(b.course.Code));
for (const list of bySection.values()) list.sort((a, b) => String(a.studentUser.StudentNumber).localeCompare(String(b.studentUser.StudentNumber)));

export const enrollmentsOfStudent = (studentId) => byStudent.get(Number(studentId)) || [];
export const enrollmentsOfSection = (sectionId) => bySection.get(Number(sectionId)) || [];
export const enrollmentById = (enrollmentId) => byEnrollment.get(Number(enrollmentId));

const attendanceByEnrollment = new Map();
for (const row of attendance) {
  if (!attendanceByEnrollment.has(row.EnrollmentId)) attendanceByEnrollment.set(row.EnrollmentId, []);
  attendanceByEnrollment.get(row.EnrollmentId).push(row);
}
export const attendanceOf = (enrollmentId) => attendanceByEnrollment.get(Number(enrollmentId)) || [];

/** the view vw_StudentGpa, student by student and term by term */
export function gpaRows(studentId) {
  const grouped = new Map();
  for (const row of enrollmentsOfStudent(studentId)) {
    if (!row.GradePublished || row.Status === 'Dropped' || row.Score === null) continue;
    const entry = grouped.get(row.semester.SemesterId) || {
      StudentId: Number(studentId),
      SemesterId: row.semester.SemesterId,
      SemesterName: row.semester.Name,
      StartDate: row.semester.StartDate,
      CreditHours: 0,
      QualityPoints: 0,
    };
    entry.CreditHours += row.course.CreditHours;
    entry.QualityPoints += row.course.CreditHours * Number(row.GradePoints);
    grouped.set(row.semester.SemesterId, entry);
  }
  return [...grouped.values()]
    .sort((a, b) => a.StartDate.localeCompare(b.StartDate))
    .map((entry) => ({
      SemesterId: entry.SemesterId,
      SemesterName: entry.SemesterName,
      CreditHours: entry.CreditHours,
      SemesterGpa: entry.CreditHours ? Math.round((entry.QualityPoints / entry.CreditHours) * 100 + 1e-9) / 100 : null,
    }));
}

/** the totals the API reads from B8_CUMULATIVE_GPA */
export function totalsOf(studentId) {
  let graded = 0;
  let quality = 0;
  let passed = 0;
  let failed = 0;
  for (const row of enrollmentsOfStudent(studentId)) {
    if (!row.GradePublished || row.Status === 'Dropped' || row.Score === null) continue;
    graded += row.course.CreditHours;
    quality += row.course.CreditHours * Number(row.GradePoints);
    if (Number(row.Score) >= 60) passed += row.course.CreditHours;
    if (row.LetterGrade === 'F') failed += 1;
  }
  return {
    CumulativeGpa: graded ? Math.round((quality / graded) * 100 + 1e-9) / 100 : null,
    GradedCreditHours: graded,
    PassedCreditHours: passed,
    FailedCourses: failed,
  };
}

/** the view vw_SectionFill */
export function fillOf(section) {
  const registered = enrollmentsOfSection(section.SectionId)
    .filter((row) => row.Status === 'Enrolled' || row.Status === 'Completed');
  const capacity = Number(section.Capacity);
  return {
    SectionId: section.SectionId,
    CourseCode: courseById.get(section.CourseId).Code,
    CourseTitle: courseById.get(section.CourseId).Title,
    SemesterName: semesterById.get(section.SemesterId).Name,
    SemesterId: section.SemesterId,
    SectionCode: section.SectionCode,
    InstructorName: fullNameOf(section.InstructorId),
    RoomName: roomNameOf(section.RoomId),
    Capacity: capacity,
    Enrolled: registered.length,
    FillPercent: capacity ? Math.round(((registered.length / capacity) * 100) * 10 + 1e-9) / 10 : 0,
  };
}

export const openSemester = () => semesters
  .filter((semester) => semester.RegistrationOpen === 1)
  .sort((a, b) => b.StartDate.localeCompare(a.StartDate))[0] || null;

export const semestersNewestFirst = () => [...semesters].sort((a, b) => b.StartDate.localeCompare(a.StartDate));

export function instructorOf(userId) {
  const row = instructorById.get(Number(userId));
  const user = userById.get(Number(userId));
  return { ...row, FullName: user?.FullName, Email: user?.Email, IsActive: user?.IsActive };
}

export function studentOf(userId) {
  const row = studentById.get(Number(userId));
  const user = userById.get(Number(userId));
  return {
    ...row,
    FullName: user?.FullName,
    Email: user?.Email,
    IsActive: user?.IsActive,
    ProgramName: programById.get(row.ProgramId)?.Name,
    FeePerCreditHour: programById.get(row.ProgramId)?.FeePerCreditHour,
    AdvisorId: row.AdvisorId,
  };
}

/** the credits a student carries in the open semester, the way B18_CREDIT_LOAD reads them */
export function creditLoadOf(studentId) {
  const term = openSemester();
  const rows = enrollmentsOfStudent(studentId)
    .filter((row) => row.Status === 'Enrolled' && term && row.semester.SemesterId === term.SemesterId);
  return {
    CreditHours: rows.reduce((sum, row) => sum + row.course.CreditHours, 0),
    Courses: rows.length,
  };
}

/** how full is a section, counted the way the catalogue counts it */
export function seatsLeftOf(section) {
  const taken = enrollmentsOfSection(section.SectionId)
    .filter((row) => row.Status === 'Enrolled' || row.Status === 'Completed').length;
  return Number(section.Capacity) - taken;
}

/* ------------------------------------------------------------------------------------
   writing to the demonstration data

   The screens of the demonstration mode have to behave like the real ones: registering a
   course has to show up in "my courses", a score has to move the average, a payment has to
   reduce the balance. These helpers keep the flat list and the three indexes in step, so a
   write is visible everywhere at once.
   ------------------------------------------------------------------------------------ */

export const nextId = (rows, key) => rows.reduce((top, row) => Math.max(top, Number(row[key]) || 0), 0) + 1;

function joinEnrollment(row) {
  const section = sectionById.get(row.SectionId);
  const course = courseById.get(section.CourseId);
  const semester = semesterById.get(section.SemesterId);
  const student = studentById.get(row.StudentId);
  const grade = row.Score === null || row.Score === undefined
    ? { LetterGrade: null, GradePoints: null }
    : { LetterGrade: letterForScore(row.Score), GradePoints: pointsForScore(row.Score) };
  return {
    ...row,
    ...grade,
    section,
    course,
    semester,
    student,
    studentUser: userById.get(row.StudentId),
    program: programById.get(student.ProgramId),
    instructorName: fullNameOf(section.InstructorId),
  };
}

export function addEnrollment(row) {
  const joined = joinEnrollment(row);
  enrollments.push(joined);
  if (!byStudent.has(joined.StudentId)) byStudent.set(joined.StudentId, []);
  byStudent.get(joined.StudentId).push(joined);
  if (!bySection.has(joined.SectionId)) bySection.set(joined.SectionId, []);
  bySection.get(joined.SectionId).push(joined);
  byEnrollment.set(joined.EnrollmentId, joined);
  return joined;
}

export function updateEnrollment(enrollmentId, patch) {
  const row = byEnrollment.get(Number(enrollmentId));
  if (!row) return null;
  Object.assign(row, patch);
  if ('Score' in patch) {
    if (row.Score === null || row.Score === undefined) {
      row.LetterGrade = null;
      row.GradePoints = null;
    } else {
      row.LetterGrade = letterForScore(row.Score);
      row.GradePoints = pointsForScore(row.Score);
    }
  }
  return row;
}

export function addAttendance(row) {
  const created = { AttendanceId: nextId(attendance, 'AttendanceId'), ...row };
  attendance.push(created);
  if (!attendanceByEnrollment.has(created.EnrollmentId)) attendanceByEnrollment.set(created.EnrollmentId, []);
  attendanceByEnrollment.get(created.EnrollmentId).push(created);
  return created;
}

export function upsertAttendance(enrollmentId, sessionDate, status) {
  const existing = attendanceOf(enrollmentId)
    .find((row) => String(row.SessionDate).slice(0, 10) === String(sessionDate).slice(0, 10));
  if (existing) {
    existing.Status = status;
    return existing;
  }
  return addAttendance({ EnrollmentId: Number(enrollmentId), SessionDate: sessionDate, Status: status });
}

export function addAnnouncement(row) {
  const created = { AnnouncementId: nextId(announcements, 'AnnouncementId'), ...row };
  announcements.push(created);
  return created;
}

export function deleteAnnouncement(announcementId) {
  const index = announcements.findIndex((row) => row.AnnouncementId === Number(announcementId));
  if (index >= 0) announcements.splice(index, 1);
  return announcements.length;
}

export function addPayment(row) {
  const created = { PaymentId: nextId(payments, 'PaymentId'), ...row };
  payments.push(created);
  return created;
}

export function addUser(row) {
  const created = { UserId: nextId(users, 'UserId'), CreatedAt: new Date().toISOString().slice(0, 19), LastLoginAt: null, ...row };
  users.push(created);
  userById.set(created.UserId, created);
  return created;
}

export function addStudent(row) {
  students.push(row);
  studentById.set(row.UserId, row);
  return row;
}

export function addAdmin(row) {
  admins.push(row);
  adminById.set(row.UserId, row);
  return row;
}

export function addCourse(row) {
  const created = { CourseId: nextId(courses, 'CourseId'), ...row };
  courses.push(created);
  courseById.set(created.CourseId, created);
  return created;
}

export function updateCourse(courseId, patch) {
  const row = courseById.get(Number(courseId));
  if (row) {
    Object.assign(row, patch);
    const seeded = SEED.Course.find((course) => course.CourseId === Number(courseId));
    if (seeded) Object.assign(seeded, patch);
  }
  return row;
}

export function addSection(row) {
  const created = { SectionId: nextId(sections, 'SectionId'), ...row };
  sections.push(created);
  sectionById.set(created.SectionId, created);
  return created;
}

export function deleteSection(sectionId) {
  const index = sections.findIndex((row) => row.SectionId === Number(sectionId));
  if (index >= 0) {
    const [removed] = sections.splice(index, 1);
    sectionById.delete(removed.SectionId);
  }
  return sections.length;
}

export function updateSemester(semesterId, patch) {
  const row = semesterById.get(Number(semesterId));
  if (row) {
    Object.assign(row, patch);
    const seeded = SEED.Semester.find((semester) => semester.SemesterId === Number(semesterId));
    if (seeded) Object.assign(seeded, patch);
  }
  return row;
}

export function addSemester(row) {
  const created = { SemesterId: nextId(semesters, 'SemesterId'), ...row };
  semesters.push(created);
  semesterById.set(created.SemesterId, created);
  return created;
}

export function setActive(userId, isActive) {
  const row = userById.get(Number(userId));
  if (row) {
    row.IsActive = isActive ? 1 : 0;
    const seeded = SEED.AppUser.find((user) => user.UserId === Number(userId));
    if (seeded) seeded.IsActive = isActive ? 1 : 0;
  }
  return row;
}

export const round2 = (value) => (value === null || value === undefined ? null : Math.round(value * 100 + 1e-9) / 100);
export const round1 = (value) => (value === null || value === undefined ? null : Math.round(value * 10 + 1e-9) / 10);
export const round3 = (value) => (value === null || value === undefined ? null : Math.round(value * 1000 + 1e-9) / 1000);

/** the sections of a term, newest term first, the way the office lists them */
export const sectionsNewestFirst = () => [...sections].sort((a, b) => b.SemesterId - a.SemesterId
  || a.CourseId - b.CourseId || String(a.SectionCode).localeCompare(String(b.SectionCode)));

export const sumOf = (rows, pick) => rows.reduce((sum, row) => sum + Number(pick(row) || 0), 0);

export function groupBy(rows, pick) {
  const grouped = new Map();
  for (const row of rows) {
    const key = pick(row);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }
  return grouped;
}

export const DAY_NAMES = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
