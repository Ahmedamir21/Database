/**
 * The demonstration mode of the client.
 *
 * The delivered application talks to the Express API, which talks to SQL Server. A machine
 * that has no SQL Server (a marker's laptop, the machine of a presentation, the sandbox of
 * the preview) can still open the whole interface: with VITE_API_MODE=mock every call of
 * src/api.js lands here instead of on the network.
 *
 * The answers of this file are written to be the same answers the API gives - same keys, same
 * parameter names, same refusal sentences, same order of columns - so no screen of the
 * application knows which mode it is running in. The data itself is generated from
 * database/02_seed.sql (client/src/mock/demo-data.js) and the reports are the translations in
 * client/src/mock/reports.js.
 *
 * What it is NOT: a second implementation of the project. There is no SQL here, no rule of the
 * database is re-decided, and the demonstration mode says so on the sign in page. The deliverable
 * of CSAI 202 is the SQL Server database and the API on top of it.
 */
import { REPORT_META } from './demo-reports.js';
import { catalogue as reportCatalogue, runReport, reportKeysFor } from './reports.js';
import { CREDIT_LIMIT, isValidScore, letterForScore, pointsForScore, standingOf } from '../lib/grading.js';
import * as DB from './context.js';

const PASSWORD = 'Desk#2025';
const API_TODAY = () => new Date();

/** the accounts of the sample data that the sign in page offers */
const ACCOUNTS = [
  { role: 'Student', userId: 9, email: 'mina.ibrahim1@zewailcity.edu.eg' },
  { role: 'Instructor', userId: 1, email: 'ahmed.hassan@zewailcity.edu.eg' },
  { role: 'Admin', userId: 49, email: 'sara.ibrahim@zewailcity.edu.eg' },
  { role: 'Instructor', userId: 52, email: 'bassem.kamal@zewailcity.edu.eg', note: 'waiting for approval' },
];

class MockError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const fail = (status, code, message) => {
  throw new MockError(status, code, message);
};

let session = null;
const passwords = new Map(ACCOUNTS.map((account) => [account.email, PASSWORD]));

/* ------------------------------------------------------------------------------ the session */

function sessionUser(userId) {
  const user = DB.userById.get(Number(userId));
  if (!user) return null;
  const student = DB.studentById.get(user.UserId);
  const instructor = DB.instructorById.get(user.UserId);
  const admin = DB.adminById.get(user.UserId);
  const program = student ? DB.programById.get(student.ProgramId) : null;
  const department = instructor ? DB.departmentById.get(instructor.DepartmentId) : null;
  return {
    userId: user.UserId,
    fullName: user.FullName,
    email: user.Email,
    role: user.Role,
    isActive: Boolean(user.IsActive),
    createdAt: user.CreatedAt,
    lastLoginAt: user.LastLoginAt,
    studentNumber: student ? student.StudentNumber : null,
    studentId: user.Role === 'Student' ? user.UserId : null,
    level: student ? student.Level : null,
    programId: student ? student.ProgramId : null,
    programName: program ? program.Name : null,
    totalCreditHours: program ? program.TotalCreditHours : null,
    advisorId: student ? student.AdvisorId : null,
    departmentId: instructor ? instructor.DepartmentId : null,
    departmentName: department ? department.Name : null,
    title: instructor ? instructor.Title : null,
    position: admin ? admin.Position : null,
    canRecordPayments: admin ? Boolean(admin.CanRecordPayments) : false,
  };
}

function needRole(...roles) {
  if (!session) fail(401, 'not_signed_in', 'Please sign in to use this page.');
  if (roles.length && !roles.includes(session.role)) {
    fail(403, 'not_allowed', 'Your account is not allowed to use this page.');
  }
  return session;
}

/** used by the sign in page of the demonstration: sign in as one of the sample accounts */
export const mockSession = {
  accounts: ACCOUNTS,
  current: () => session,
  as(role) {
    const account = ACCOUNTS.find((item) => item.role === role) || ACCOUNTS[0];
    session = sessionUser(account.userId);
    return session;
  },
  clear() {
    session = null;
  },
};

/* ------------------------------------------------------------------------------- the views */

const B1_SEMESTERS = () => DB.semestersNewestFirst().map((semester) => ({
  SemesterId: semester.SemesterId,
  Name: semester.Name,
  StartDate: semester.StartDate,
  EndDate: semester.EndDate,
  RegistrationOpen: semester.RegistrationOpen,
  RegistrationDeadline: semester.RegistrationDeadline,
  DropDeadline: semester.DropDeadline,
}));

const A12_DEPARTMENTS = () => DB.departments.map((department) => ({
  DepartmentId: department.DepartmentId,
  Code: department.Code,
  Name: department.Name,
  Instructors: DB.instructors.filter((instructor) => instructor.DepartmentId === department.DepartmentId
    && DB.userById.get(instructor.UserId).IsActive === 1).length,
}));

const S1_PROGRAMS = () => DB.programs.map((program) => ({
  ProgramId: program.ProgramId,
  Name: program.Name,
  TotalCreditHours: program.TotalCreditHours,
  DepartmentCode: DB.departmentById.get(program.DepartmentId).Code,
}));

const S2_DEPARTMENTS = () => DB.departments.map((department) => ({
  DepartmentId: department.DepartmentId,
  Code: department.Code,
  Name: department.Name,
}));

const D6_ROOMS = () => DB.rooms.map((room) => ({
  RoomId: room.RoomId, Building: room.Building, RoomNumber: room.RoomNumber,
  Capacity: room.Capacity, RoomType: room.RoomType,
}));

const D7_INSTRUCTOR_OPTIONS = (onlyActive = true) => DB.instructors
  .map((instructor) => {
    const user = DB.userById.get(instructor.UserId);
    const department = DB.departmentById.get(instructor.DepartmentId);
    return {
      UserId: instructor.UserId, FullName: user.FullName, Title: instructor.Title,
      DepartmentCode: department.Code, DepartmentName: department.Name, IsActive: user.IsActive,
    };
  })
  .filter((row) => (onlyActive ? row.IsActive === 1 : true));

const D5_COURSE_CATALOGUE = (search = null) => DB.courses
  .filter((course) => {
    if (!search) return true;
    const needle = String(search).toLowerCase();
    return course.Code.toLowerCase().includes(needle) || course.Title.toLowerCase().includes(needle);
  })
  .map((course) => {
    const department = DB.departmentById.get(course.DepartmentId);
    return {
      CourseId: course.CourseId, Code: course.Code, Title: course.Title,
      CreditHours: course.CreditHours, Level: course.Level, Description: course.Description,
      DepartmentCode: department.Code, DepartmentName: department.Name,
      SectionCount: DB.sections.filter((section) => section.CourseId === course.CourseId).length,
      PrerequisiteCount: DB.prerequisites.filter((row) => row.CourseId === course.CourseId).length,
    };
  })
  .sort((a, b) => a.Code.localeCompare(b.Code));

const D4_SECTION_FILL = (semesterId = null) => DB.sectionsNewestFirst()
  .filter((section) => !semesterId || section.SemesterId === Number(semesterId))
  .map(DB.fillOf)
  .sort((a, b) => b.FillPercent - a.FillPercent || a.CourseCode.localeCompare(b.CourseCode));

const B5_MY_ENROLLMENTS = (studentId, semesterId) => DB.enrollmentsOfStudent(studentId)
  .filter((row) => row.semester.SemesterId === Number(semesterId))
  .map((row) => ({
    EnrollmentId: row.EnrollmentId,
    Status: row.Status,
    EnrolledAt: row.EnrolledAt,
    Score: row.Score,
    LetterGrade: row.LetterGrade,
    GradePoints: row.GradePoints,
    GradePublished: row.GradePublished,
    Code: row.course.Code,
    Title: row.course.Title,
    CreditHours: row.course.CreditHours,
    SectionCode: row.section.SectionCode,
    InstructorName: row.instructorName,
    RoomName: DB.roomNameOf(row.section.RoomId),
    DayOfWeek: row.section.DayOfWeek,
    StartTime: row.section.StartTime,
    EndTime: row.section.EndTime,
  }))
  .sort((a, b) => a.DayOfWeek - b.DayOfWeek || String(a.StartTime).localeCompare(String(b.StartTime)));

const B6_TRANSCRIPT = (studentId) => DB.enrollmentsOfStudent(studentId).map((row) => ({
  SemesterId: row.semester.SemesterId,
  SemesterName: row.semester.Name,
  StartDate: row.semester.StartDate,
  Code: row.course.Code,
  Title: row.course.Title,
  CreditHours: row.course.CreditHours,
  Score: row.Score,
  LetterGrade: row.LetterGrade,
  GradePoints: row.GradePoints,
  Status: row.Status,
  GradePublished: row.GradePublished,
  InstructorName: row.instructorName,
}));

const B13_ANNOUNCEMENTS = (studentId) => DB.announcements
  .filter((row) => !row.SectionId || DB.enrollmentsOfStudent(studentId)
    .some((enrollment) => enrollment.SectionId === row.SectionId && enrollment.Status === 'Enrolled'))
  .sort((a, b) => b.IsPinned - a.IsPinned || b.PostedAt.localeCompare(a.PostedAt))
  .map((row) => {
    const author = DB.userById.get(row.AuthorId);
    const section = row.SectionId ? DB.sectionById.get(row.SectionId) : null;
    return {
      AnnouncementId: row.AnnouncementId,
      Title: row.Title,
      Body: row.Body,
      PostedAt: row.PostedAt,
      IsPinned: row.IsPinned,
      CourseCode: section ? DB.courseById.get(section.CourseId).Code : null,
      SemesterName: section ? DB.semesterById.get(section.SemesterId).Name : null,
      AuthorName: author.FullName,
      AuthorRole: author.Role,
    };
  });

const B14_ADVISOR = (studentId) => {
  const student = DB.studentById.get(Number(studentId));
  if (!student) return null;
  const advisor = DB.instructorById.get(student.AdvisorId);
  const advisorUser = advisor ? DB.userById.get(advisor.UserId) : null;
  return {
    StudentNumber: student.StudentNumber,
    StudentName: DB.userById.get(student.UserId).FullName,
    AdvisorName: advisorUser?.FullName ?? null,
    AdvisorEmail: advisorUser?.Email ?? null,
    AdvisorTitle: advisor?.Title ?? null,
    AdvisorSpecialization: advisor?.Specialization ?? null,
    AdvisorDepartment: advisor ? DB.departmentById.get(advisor.DepartmentId).Name : null,
  };
};

const B18_CREDIT_LOAD = (studentId) => DB.creditLoadOf(studentId);

const B17 = (enrollmentId, studentId) => {
  const row = DB.enrollmentById(enrollmentId);
  if (!row || row.StudentId !== Number(studentId)) return null;
  return {
    EnrollmentId: row.EnrollmentId, Status: row.Status, Code: row.course.Code, Title: row.course.Title,
    CreditHours: row.course.CreditHours, SectionId: row.SectionId, SemesterId: row.semester.SemesterId,
    RegistrationOpen: row.semester.RegistrationOpen, DropDeadline: row.semester.DropDeadline,
  };
};

const C1_MY_SECTIONS = (instructorId, semesterId = null) => DB.sections
  .filter((section) => section.InstructorId === Number(instructorId)
    && (!semesterId || section.SemesterId === Number(semesterId)))
  .map((section) => {
    const registered = DB.enrollmentsOfSection(section.SectionId).filter((row) => row.Status !== 'Dropped');
    const published = registered.filter((row) => row.GradePublished === 1);
    const scores = published.map((row) => Number(row.Score));
    return {
      SectionId: section.SectionId,
      Code: DB.courseById.get(section.CourseId).Code,
      Title: DB.courseById.get(section.CourseId).Title,
      CreditHours: DB.courseById.get(section.CourseId).CreditHours,
      SectionCode: section.SectionCode,
      Capacity: section.Capacity,
      RoomName: DB.roomNameOf(section.RoomId),
      DayOfWeek: section.DayOfWeek,
      StartTime: section.StartTime,
      EndTime: section.EndTime,
      SemesterName: DB.semesterById.get(section.SemesterId).Name,
      SemesterId: section.SemesterId,
      Enrolled: registered.length,
      AverageScore: scores.length ? DB.round2(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
      Published: published.length,
      openToGrade: registered.length > 0,
      publishedAll: registered.length > 0 && published.length >= registered.length,
      fillPercent: section.Capacity ? Math.round((registered.length / section.Capacity) * 1000) / 10 : 0,
    };
  })
  .sort((a, b) => b.SemesterId - a.SemesterId || a.Code.localeCompare(b.Code));

const C2_ROSTER = (sectionId) => DB.enrollmentsOfSection(sectionId).map((row) => {
  const attendance = DB.attendanceOf(row.EnrollmentId);
  return {
    EnrollmentId: row.EnrollmentId,
    StudentNumber: row.student.StudentNumber,
    FullName: row.studentUser.FullName,
    ProgramName: row.program.Name,
    Level: row.student.Level,
    Status: row.Status,
    Score: row.Score,
    LetterGrade: row.LetterGrade,
    GradePublished: row.GradePublished,
    Sessions: attendance.length,
    Absences: attendance.filter((entry) => entry.Status === 'Absent').length,
    Excused: attendance.filter((entry) => entry.Status === 'Excused').length,
  };
}).sort((a, b) => String(a.StudentNumber).localeCompare(String(b.StudentNumber)));

const C6_SECTION_STATISTICS = (sectionId) => {
  const published = DB.enrollmentsOfSection(sectionId).filter((row) => row.GradePublished === 1 && row.Score !== null);
  const scores = published.map((row) => Number(row.Score));
  const count = (letter) => published.filter((row) => row.LetterGrade === letter).length;
  if (!published.length) {
    return {
      Graded: 0, AverageScore: null, HighestScore: null, LowestScore: null, Passed: 0, Failed: 0,
      PassRate: null, GradeA: 0, GradeAMinus: 0, GradeBPlus: 0, GradeB: 0, GradeBMinus: 0,
      GradeC: 0, GradeD: 0, GradeF: 0,
    };
  }
  return {
    Graded: published.length,
    AverageScore: DB.round2(scores.reduce((a, b) => a + b, 0) / scores.length),
    HighestScore: Math.max(...scores),
    LowestScore: Math.min(...scores),
    Passed: published.filter((row) => Number(row.Score) >= 60).length,
    Failed: published.filter((row) => Number(row.Score) < 60).length,
    PassRate: DB.round1((100 * published.filter((row) => Number(row.Score) >= 60).length) / published.length),
    GradeA: count('A'), GradeAMinus: count('A-'), GradeBPlus: count('B+'), GradeB: count('B'),
    GradeBMinus: count('B-'), GradeC: count('C'), GradeD: count('D'), GradeF: count('F'),
  };
};

const C7_ATTENDANCE_RATE = (sectionId) => {
  const rows = DB.enrollmentsOfSection(sectionId).flatMap((row) => DB.attendanceOf(row.EnrollmentId));
  const count = (status) => rows.filter((row) => row.Status === status).length;
  return {
    Sessions: new Set(rows.map((row) => row.SessionDate)).size,
    AttendanceRows: rows.length,
    Present: count('Present'),
    Absent: count('Absent'),
    Excused: count('Excused'),
    AttendanceRate: rows.length
      ? DB.round1((100 * rows.filter((row) => row.Status === 'Present' || row.Status === 'Excused').length) / rows.length)
      : null,
  };
};

const C11_MY_STUDENTS = (instructorId) => {
  const seen = new Map();
  for (const section of DB.sections.filter((row) => row.InstructorId === Number(instructorId))) {
    for (const enrollment of DB.enrollmentsOfSection(section.SectionId)) {
      if (enrollment.Status === 'Dropped') continue;
      seen.set(enrollment.StudentId, {
        StudentNumber: enrollment.student.StudentNumber,
        FullName: enrollment.studentUser.FullName,
        Level: enrollment.student.Level,
        ProgramName: enrollment.program.Name,
        Email: enrollment.studentUser.Email,
      });
    }
  }
  return [...seen.values()].sort((a, b) => String(a.StudentNumber).localeCompare(String(b.StudentNumber)));
};

const D2_USER_LIST = ({ role = null, status = null, search = null } = {}) => DB.users
  .filter((user) => (!role || user.Role === role)
    && (status === null || Boolean(user.IsActive) === Boolean(Number(status))))
  .filter((user) => {
    if (!search) return true;
    const student = DB.studentById.get(user.UserId);
    const needle = String(search).toLowerCase();
    return user.FullName.toLowerCase().includes(needle)
      || user.Email.toLowerCase().includes(needle)
      || String(student?.StudentNumber || '').includes(needle);
  })
  .map((user) => {
    const student = DB.studentById.get(user.UserId);
    const instructor = DB.instructorById.get(user.UserId);
    const admin = DB.adminById.get(user.UserId);
    return {
      UserId: user.UserId, FullName: user.FullName, Email: user.Email, Role: user.Role,
      IsActive: Boolean(user.IsActive), CreatedAt: user.CreatedAt, LastLoginAt: user.LastLoginAt,
      StudentNumber: student?.StudentNumber ?? null,
      Level: student?.Level ?? null,
      ProgramName: student ? DB.programById.get(student.ProgramId).Name : null,
      Title: instructor?.Title ?? null,
      DepartmentName: instructor ? DB.departmentById.get(instructor.DepartmentId).Name : null,
      Position: admin?.Position ?? null,
    };
  })
  .sort((a, b) => a.Role.localeCompare(b.Role) || a.FullName.localeCompare(b.FullName));

const D14_SEMESTERS = () => DB.semestersNewestFirst().map((semester) => ({
  SemesterId: semester.SemesterId,
  Name: semester.Name,
  StartDate: semester.StartDate,
  EndDate: semester.EndDate,
  RegistrationOpen: semester.RegistrationOpen,
  RegistrationDeadline: semester.RegistrationDeadline,
  DropDeadline: semester.DropDeadline,
  Sections: DB.sections.filter((section) => section.SemesterId === semester.SemesterId).length,
  Enrollments: DB.enrollments.filter((row) => row.Status === 'Enrolled'
    && row.semester.SemesterId === semester.SemesterId).length,
}));

const D19_PAYMENTS = ({ semesterId = null, search = null } = {}) => DB.payments
  .filter((row) => !semesterId || row.SemesterId === Number(semesterId))
  .filter((row) => {
    if (!search) return true;
    const student = DB.studentById.get(row.StudentId);
    const needle = String(search).toLowerCase();
    return String(row.ReceiptNumber).toLowerCase().includes(needle)
      || String(student?.StudentNumber || '').includes(needle)
      || DB.fullNameOf(row.StudentId).toLowerCase().includes(needle);
  })
  .sort((a, b) => b.PaidAt.localeCompare(a.PaidAt) || b.PaymentId - a.PaymentId)
  .map((row) => ({
    PaymentId: row.PaymentId,
    PaidAt: row.PaidAt,
    Amount: row.Amount,
    Method: row.Method,
    ReceiptNumber: row.ReceiptNumber,
    StudentNumber: DB.studentById.get(row.StudentId).StudentNumber,
    StudentName: DB.fullNameOf(row.StudentId),
    SemesterName: DB.semesterById.get(row.SemesterId).Name,
    RecordedBy: DB.fullNameOf(row.RecordedByAdminId),
  }));

const D20_FEES_NOT_PAID = () => {
  const rows = [];
  for (const student of DB.students) {
    const byTerm = new Map();
    for (const enrollment of DB.enrollmentsOfStudent(student.UserId)) {
      if (enrollment.Status !== 'Enrolled' && enrollment.Status !== 'Completed') continue;
      const key = enrollment.semester.SemesterId;
      byTerm.set(key, (byTerm.get(key) || 0) + enrollment.course.CreditHours);
    }
    for (const [semesterId, credits] of byTerm) {
      const fee = Number(DB.programById.get(student.ProgramId).FeePerCreditHour);
      const paid = DB.payments.filter((row) => row.StudentId === student.UserId && row.SemesterId === Number(semesterId))
        .reduce((sum, row) => sum + Number(row.Amount), 0);
      const balance = DB.round2(credits * fee - paid);
      if (balance === 0) continue;
      rows.push({
        StudentNumber: student.StudentNumber,
        StudentName: DB.fullNameOf(student.UserId),
        SemesterName: DB.semesterById.get(Number(semesterId)).Name,
        CreditHours: credits,
        FeePerCreditHour: fee,
        FeesDue: DB.round2(credits * fee),
        PaidSoFar: DB.round2(paid),
        Balance: balance,
      });
    }
  }
  return rows.sort((a, b) => b.Balance - a.Balance);
};

const D22_ANNOUNCEMENTS = () => [...DB.announcements]
  .sort((a, b) => b.IsPinned - a.IsPinned || b.PostedAt.localeCompare(a.PostedAt))
  .map((row) => {
    const author = DB.userById.get(row.AuthorId);
    const section = row.SectionId ? DB.sectionById.get(row.SectionId) : null;
    return {
      AnnouncementId: row.AnnouncementId,
      Title: row.Title,
      Body: row.Body,
      PostedAt: row.PostedAt,
      IsPinned: row.IsPinned,
      AuthorName: author.FullName,
      AuthorRole: author.Role,
      CourseCode: section ? DB.courseById.get(section.CourseId).Code : null,
      SemesterName: section ? DB.semesterById.get(section.SemesterId).Name : null,
    };
  });

const D31_STUDENT_OPTIONS = () => DB.students
  .map((student) => ({
    UserId: student.UserId,
    StudentNumber: student.StudentNumber,
    FullName: DB.fullNameOf(student.UserId),
    ProgramName: DB.programById.get(student.ProgramId).Name,
    Level: student.Level,
  }))
  .sort((a, b) => String(a.StudentNumber).localeCompare(String(b.StudentNumber)));

const S4_SECTIONS_OF_THE_TERM = (limit = null) => {
  const term = DB.openSemester();
  const rows = DB.sections
    .filter((section) => term && section.SemesterId === term.SemesterId)
    .sort((a, b) => a.DayOfWeek - b.DayOfWeek || String(a.StartTime).localeCompare(String(b.StartTime)))
    .map((section) => ({
      SectionId: section.SectionId,
      Code: DB.courseById.get(section.CourseId).Code,
      Title: DB.courseById.get(section.CourseId).Title,
      SectionCode: section.SectionCode,
      DayOfWeek: section.DayOfWeek,
      StartTime: section.StartTime,
      EndTime: section.EndTime,
      RoomName: DB.roomNameOf(section.RoomId),
    }));
  return limit ? rows.slice(0, limit) : rows;
};

const S5_TABLE_COUNTS = () => [
  ['AppUser', DB.users.length],
  ['Announcement', DB.announcements.length],
  ['Attendance', DB.attendance.length],
  ['Admin', DB.admins.length],
  ['Course', DB.courses.length],
  ['Department', DB.departments.length],
  ['Enrollment', DB.enrollments.length],
  ['Instructor', DB.instructors.length],
  ['Payment', DB.payments.length],
  ['Program', DB.programs.length],
  ['Prerequisite', DB.prerequisites.length],
  ['Room', DB.rooms.length],
  ['Section', DB.sections.length],
  ['Semester', DB.semesters.length],
  ['Student', DB.students.length],
].map(([TableName, Rows]) => ({ TableName, Rows })).sort((a, b) => a.TableName.localeCompare(b.TableName));

const D1_OVERVIEW = () => {
  const term = DB.openSemester();
  return {
    ActiveStudents: DB.users.filter((user) => user.Role === 'Student' && user.IsActive === 1).length,
    ActiveInstructors: DB.users.filter((user) => user.Role === 'Instructor' && user.IsActive === 1).length,
    PendingInstructors: DB.users.filter((user) => user.Role === 'Instructor' && user.IsActive === 0).length,
    Courses: DB.courses.length,
    OpenSemesterId: term ? term.SemesterId : null,
    SectionsThisSemester: term ? DB.sections.filter((section) => section.SemesterId === term.SemesterId).length : 0,
    EnrollmentsThisSemester: term ? DB.enrollments.filter((row) => row.Status === 'Enrolled'
      && row.semester.SemesterId === term.SemesterId).length : 0,
    FullSections: term ? DB.sections.filter((section) => section.SemesterId === term.SemesterId)
      .map(DB.fillOf).filter((row) => row.Enrolled >= row.Capacity).length : 0,
    CollectedTotal: DB.round2(DB.payments.reduce((sum, row) => sum + Number(row.Amount), 0)),
  };
};

/* ---------------------------------------------------------------------------- the finance */

function receiptNumber(semesterId) {
  const used = DB.payments.filter((row) => row.SemesterId === Number(semesterId)).length;
  let running = Number(semesterId) * 100000 + used + 1;
  let number = `RC-${running}`;
  while (DB.payments.some((row) => row.ReceiptNumber === number)) {
    running += 1;
    number = `RC-${running}`;
  }
  return number;
}

/* ------------------------------------------------------------------------ the registration */

function overlaps(a, b) {
  if (Number(a.DayOfWeek) !== Number(b.DayOfWeek)) return false;
  const minutes = (value) => {
    const [hours, mins] = String(value).split(':').map(Number);
    return hours * 60 + mins;
  };
  return minutes(a.StartTime) < minutes(b.EndTime) && minutes(a.EndTime) > minutes(b.StartTime);
}

function checkRegistration(studentId, section) {
  const term = DB.semesterById.get(section.SemesterId);
  const course = DB.courseById.get(section.CourseId);
  const problems = [];
  const today = API_TODAY().toISOString().slice(0, 10);

  if (!term.RegistrationOpen) {
    problems.push({ rule: 'R1', message: 'Registration is closed for this semester.' });
  } else if (term.RegistrationDeadline && today > String(term.RegistrationDeadline).slice(0, 10)) {
    problems.push({ rule: 'R1', message: 'The registration deadline for this semester has passed.' });
  }
  if (!DB.userById.get(studentId).IsActive) {
    problems.push({ rule: 'R2', message: 'The student account is not active.' });
  }

  const missing = DB.prerequisites
    .filter((row) => row.CourseId === course.CourseId)
    .map((row) => DB.courseById.get(row.PrerequisiteCourseId).Code)
    .filter((code) => !DB.enrollmentsOfStudent(studentId).some((other) => other.course.Code === code
      && other.GradePublished === 1 && Number(other.Score) >= 60));
  if (missing.length) {
    problems.push({
      rule: 'R3',
      message: `Prerequisite not passed: ${missing.join(', ')}. Pass it with a score of 60 or more first.`,
    });
  }

  const seatsLeft = DB.seatsLeftOf(section);
  if (seatsLeft <= 0) problems.push({ rule: 'R4', message: 'The section is full.' });

  const ofTerm = DB.enrollmentsOfStudent(studentId)
    .filter((row) => row.semester.SemesterId === section.SemesterId && row.Status === 'Enrolled');
  if (ofTerm.some((row) => overlaps(row.section, section))) {
    problems.push({ rule: 'R5', message: 'This section clashes with another section you are registered in.' });
  }
  if (ofTerm.some((row) => row.course.CourseId === course.CourseId)) {
    problems.push({ rule: 'R6', message: 'You are already registered in this course or you already completed it.' });
  }

  const load = ofTerm.reduce((sum, row) => sum + row.course.CreditHours, 0);
  if (load + course.CreditHours > CREDIT_LIMIT) {
    problems.push({ rule: 'R7', message: `The credit limit of ${CREDIT_LIMIT} hours for this semester would be exceeded.` });
  }

  return { section, term, course, problems, seatsLeft };
}

/* --------------------------------------------------------------------------- the router */

export async function mockRequest(path, { method = 'GET', body = null, params = null } = {}) {
  const url = path.split('?')[0];
  const segments = url.split('/').filter(Boolean);
  const query = params || {};
  const verb = String(method || 'GET').toUpperCase();

  /* ------------------------------------------------------------------ meta */
  if (url === '/meta/health') {
    return {
      api: 'up',
      database: 'mock',
      connection: 'the demonstration data of the client (no SQL Server is in use)',
      environment: 'demonstration',
      milliseconds: 0,
    };
  }
  if (url === '/meta/summary') {
    return {
      counts: {
        Students: DB.students.length,
        Courses: DB.courses.length,
        Sections: DB.sections.length,
        Instructors: DB.instructors.length,
        Semesters: DB.semesters.length,
        Enrollments: DB.enrollments.length,
      },
      reports: Object.keys(REPORT_META).length,
    };
  }
  if (url === '/meta/semesters') { needRole(); return { rows: B1_SEMESTERS() }; }
  if (url === '/meta/departments') { needRole(); return { rows: A12_DEPARTMENTS() }; }

  /* ------------------------------------------------------------------ accounts */
  if (url === '/auth/login') {
    const email = String(body?.email || '').trim().toLowerCase();
    const user = DB.users.find((row) => row.Email.toLowerCase() === email);
    // every account of the sample data uses the same password, exactly like the seed file
    const expected = user ? passwords.get(user.Email) || PASSWORD : null;
    if (!user || expected === null || String(body?.password || '') !== expected) {
      fail(401, 'bad_credentials', 'The e-mail address or the password is not correct.');
    }
    if (!user.IsActive) {
      fail(403, 'account_inactive', 'This account is waiting for the approval of an administrator.');
    }
    user.LastLoginAt = new Date().toISOString().slice(0, 19);
    session = sessionUser(user.UserId);
    return { user: session };
  }
  if (url === '/auth/logout') { session = null; return { message: 'You are signed out.' }; }
  if (url === '/auth/me') return { user: session };
  if (url === '/auth/signup-options') return { programs: S1_PROGRAMS(), departments: S2_DEPARTMENTS() };
  if (url === '/auth/signup') {
    const fullName = String(body?.fullName || '').trim();
    const email = String(body?.email || '').trim().toLowerCase();
    if (fullName.length < 3) fail(400, 'name_too_short', 'Please type your full name.');
    if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email)) fail(400, 'bad_email', 'That is not a valid e-mail address.');
    const programId = Number.parseInt(body?.programId, 10);
    if (!Number.isInteger(programId)) fail(400, 'program_required', 'Please choose a program.');
    const passwordProblem = passwordComplaint(body?.password, email, fullName);
    if (passwordProblem) fail(400, 'weak_password', passwordProblem);
    if (String(body?.password) !== String(body?.confirmPassword)) fail(400, 'password_mismatch', 'The password and its confirmation are not the same.');
    if (DB.users.some((row) => row.Email.toLowerCase() === email)) fail(409, 'email_taken', 'There is already an account with this e-mail address.');

    const year = Number.parseInt(body?.enrollmentYear, 10) || new Date().getFullYear();
    const yearNumbers = DB.students.map((student) => String(student.StudentNumber))
      .filter((number) => number.startsWith(String(year)))
      .map((number) => Number.parseInt(number.slice(4), 10));
    const studentNumber = `${year}${String(yearNumbers.length ? Math.max(...yearNumbers) + 1 : 1).padStart(4, '0')}`;
    const departmentOfProgram = DB.programById.get(programId).DepartmentId;
    const advisor = DB.instructors.find((instructor) => instructor.DepartmentId === departmentOfProgram
      && DB.userById.get(instructor.UserId).IsActive === 1) || DB.instructors[0];
    const created = DB.addUser({ FullName: fullName, Email: email, PasswordHash: '(bcrypt hash)', Role: 'Student', IsActive: 1 });
    DB.addStudent({
      UserId: created.UserId, StudentNumber: studentNumber, ProgramId: programId,
      EnrollmentYear: year, Level: 1, AdvisorId: advisor.UserId,
    });
    passwords.set(email, String(body.password));
    session = sessionUser(created.UserId);
    return { user: session, message: `Welcome, ${fullName}. Your student number is ${studentNumber}.` };
  }
  if (url === '/auth/signup-instructor') {
    const fullName = String(body?.fullName || '').trim();
    const email = String(body?.email || '').trim().toLowerCase();
    if (fullName.length < 3) fail(400, 'name_too_short', 'Please type your full name.');
    if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email)) fail(400, 'bad_email', 'That is not a valid e-mail address.');
    const departmentId = Number.parseInt(body?.departmentId, 10);
    if (!Number.isInteger(departmentId)) fail(400, 'department_required', 'Please choose a department.');
    const passwordProblem = passwordComplaint(body?.password, email, fullName);
    if (passwordProblem) fail(400, 'weak_password', passwordProblem);
    if (String(body?.password) !== String(body?.confirmPassword)) fail(400, 'password_mismatch', 'The password and its confirmation are not the same.');
    if (DB.users.some((row) => row.Email.toLowerCase() === email)) fail(409, 'email_taken', 'There is already an account with this e-mail address.');

    const created = DB.addUser({
      FullName: fullName, Email: email, PasswordHash: '(bcrypt hash)', Role: 'Instructor', IsActive: 0,
    });
    DB.instructors.push({
      UserId: created.UserId, DepartmentId: departmentId,
      Title: ['Prof.', 'Dr.', 'T.A.'].includes(body?.title) ? body.title : 'T.A.',
      OfficeRoomId: null, Specialization: String(body?.specialization || '').slice(0, 120) || null,
    });
    DB.instructorById.set(created.UserId, DB.instructors[DB.instructors.length - 1]);
    passwords.set(email, String(body.password));
    return { userId: created.UserId, message: 'Your account was created. An administrator has to approve it before you can sign in.' };
  }
  if (url === '/auth/change-password') {
    const me = needRole();
    const user = DB.userById.get(me.userId);
    if (String(body?.currentPassword || '') !== (passwords.get(user.Email) || PASSWORD)) {
      fail(403, 'wrong_current_password', 'The current password is not correct.');
    }
    if (String(body?.newPassword) !== String(body?.confirmPassword)) fail(400, 'password_mismatch', 'The new password and its confirmation are not the same.');
    const problem = passwordComplaint(body?.newPassword, user.Email, user.FullName);
    if (problem) fail(400, 'weak_password', problem);
    if (String(body?.newPassword) === String(body?.currentPassword)) fail(400, 'password_reused', 'The new password must be different from the current one.');
    passwords.set(user.Email, String(body.newPassword));
    return { message: 'Your password was changed.' };
  }

  /* ------------------------------------------------------------------ student */
  if (segments[0] === 'student') {
    const me = needRole('Student');
    const userId = me.userId;

    if (segments[1] === 'overview') {
      const term = DB.openSemester();
      const courses = {
        term,
        rows: B5_MY_ENROLLMENTS(userId, term.SemesterId),
        load: B18_CREDIT_LOAD(userId),
      };
      const totals = DB.totalsOf(userId);
      const fees = studentFees(userId);
      return {
        term,
        sections: courses.rows.filter((row) => row.Status === 'Enrolled'),
        load: courses.load,
        gpa: {
          cumulativeGpa: totals.CumulativeGpa,
          gradedCreditHours: totals.GradedCreditHours,
          passedCreditHours: totals.PassedCreditHours,
          standing: standingOf(totals.CumulativeGpa),
        },
        finance: fees.summary,
        advisor: B14_ADVISOR(userId),
        announcements: B13_ANNOUNCEMENTS(userId).slice(0, 5),
      };
    }
    if (segments[1] === 'semesters') return { rows: B1_SEMESTERS() };
    if (segments[1] === 'courses') {
      const term = query.semesterId ? DB.semesterById.get(Number(query.semesterId)) : DB.openSemester();
      if (!term) fail(404, 'no_semester', 'There is no semester to show.');
      const rows = B5_MY_ENROLLMENTS(userId, term.SemesterId).map((row) => ({
        ...row, status: row.Status, grade: row.LetterGrade, published: Boolean(row.GradePublished),
      }));
      return { term, rows, load: B18_CREDIT_LOAD(userId) };
    }
    if (segments[1] === 'catalogue') {
      const term = query.termId || query.semesterId
        ? DB.semesterById.get(Number(query.termId || query.semesterId))
        : DB.openSemester();
      if (!term) fail(404, 'no_semester', 'There is no semester to show.');
      const search = query.search ? String(query.search).trim().toLowerCase() : null;
      const departmentId = query.departmentId ? Number(query.departmentId) : null;
      const level = query.level ? Number(query.level) : null;
      const rows = DB.sections
        .filter((section) => section.SemesterId === term.SemesterId)
        .map((section) => {
          const course = DB.courseById.get(section.CourseId);
          const department = DB.departmentById.get(course.DepartmentId);
          const seatsLeft = DB.seatsLeftOf(section);
          const already = DB.enrollmentsOfStudent(userId)
            .some((row) => row.course.CourseId === course.CourseId && row.Status !== 'Dropped');
          const missing = DB.prerequisites.filter((row) => row.CourseId === course.CourseId)
            .filter((row) => !DB.enrollmentsOfStudent(userId).some((other) => other.course.CourseId === row.PrerequisiteCourseId
              && other.GradePublished === 1 && Number(other.Score) >= 60)).length;
          return {
            SectionId: section.SectionId,
            CourseId: course.CourseId,
            Code: course.Code,
            Title: course.Title,
            CreditHours: course.CreditHours,
            Level: course.Level,
            DepartmentCode: department.Code,
            DepartmentName: department.Name,
            InstructorName: DB.fullNameOf(section.InstructorId),
            RoomName: DB.roomNameOf(section.RoomId),
            SectionCode: section.SectionCode,
            Capacity: section.Capacity,
            DayOfWeek: section.DayOfWeek,
            StartTime: section.StartTime,
            EndTime: section.EndTime,
            SeatsLeft: seatsLeft,
            PrerequisitesMet: missing ? 0 : 1,
            AlreadyRegistered: already ? 1 : 0,
          };
        })
        .filter((row) => (!search || row.Code.toLowerCase().includes(search) || row.Title.toLowerCase().includes(search))
          && (!departmentId || DB.courseById.get(row.CourseId).DepartmentId === departmentId)
          && (!level || row.Level === level))
        .sort((a, b) => a.Code.localeCompare(b.Code) || a.SectionCode.localeCompare(b.SectionCode))
        .map((row) => ({
          ...row,
          canRegister: row.SeatsLeft > 0 && row.PrerequisitesMet === 1 && row.AlreadyRegistered === 0,
          blockedReason: row.AlreadyRegistered > 0 ? 'You already have this course'
            : row.PrerequisitesMet === 0 ? 'A prerequisite is not passed yet'
              : row.SeatsLeft <= 0 ? 'The section is full' : null,
        }));
      return { term, filters: { search, departmentId, level }, rows };
    }
    if (segments[1] === 'sections' && segments[3] === 'eligibility') {
      const section = DB.sectionById.get(Number(segments[2]));
      if (!section) fail(404, 'section_missing', 'That section does not exist.');
      const check = checkRegistration(userId, section);
      return {
        section: {
          SectionId: section.SectionId, SemesterId: section.SemesterId, CourseId: section.CourseId,
          Capacity: section.Capacity, DayOfWeek: section.DayOfWeek, StartTime: section.StartTime,
          EndTime: section.EndTime, Code: check.course.Code, Title: check.course.Title,
          CreditHours: check.course.CreditHours, SeatsLeft: check.seatsLeft,
          AlreadyRegistered: check.problems.some((p) => p.rule === 'R6') ? 1 : 0,
        },
        term: check.term,
        problems: check.problems,
        canRegister: check.problems.length === 0,
      };
    }
    if (segments[1] === 'registrations' && !segments[2] && verb === 'POST') {
      const section = DB.sectionById.get(Number(body?.sectionId));
      if (!section) fail(404, 'section_missing', 'That section does not exist.');
      const check = checkRegistration(userId, section);
      if (check.problems.length) {
        fail(400, 'registration_blocked', check.problems.map((p) => `${p.rule}: ${p.message}`).join(' '));
      }
      const created = DB.addEnrollment({
        EnrollmentId: DB.nextId(DB.enrollments, 'EnrollmentId'),
        StudentId: userId,
        SectionId: section.SectionId,
        EnrolledAt: new Date().toISOString().slice(0, 19),
        Status: 'Enrolled',
        Score: null,
        GradePublished: 0,
      });
      return {
        enrollmentId: created.EnrollmentId,
        section: { SectionId: section.SectionId, Code: check.course.Code, Title: check.course.Title },
        term: check.term,
        message: `${check.course.Code} ${check.course.Title} was added to your registration.`,
      };
    }
    if (segments[1] === 'registrations' && segments[2] && verb === 'DELETE') {
      const row = B17(segments[2], userId);
      if (!row) fail(404, 'enrollment_missing', 'That registration does not belong to your account.');
      if (!row.RegistrationOpen) fail(400, 'drop_blocked', 'The semester is not open, so nothing can be dropped.');
      if (row.DropDeadline && API_TODAY().toISOString().slice(0, 10) > String(row.DropDeadline).slice(0, 10)) {
        fail(400, 'drop_blocked', 'The deadline for dropping a course has passed.');
      }
      if (row.Status !== 'Enrolled') fail(400, 'drop_blocked', 'Only a course that is still Enrolled can be dropped.');
      DB.updateEnrollment(row.EnrollmentId, { Status: 'Dropped' });
      return { enrollmentId: row.EnrollmentId, course: row.Code, message: `${row.Code} was dropped.` };
    }
    if (segments[1] === 'transcript') {
      const totals = DB.totalsOf(userId);
      const published = DB.enrollmentsOfStudent(userId)
        .filter((row) => row.GradePublished === 1 && row.Status !== 'Dropped' && row.GradePoints !== null);
      const credits = published.reduce((sum, row) => sum + row.course.CreditHours, 0);
      const quality = published.reduce((sum, row) => sum + row.course.CreditHours * Number(row.GradePoints), 0);
      return {
        rows: B6_TRANSCRIPT(userId),
        byTerm: DB.gpaRows(userId),
        summary: {
          cumulativeGpa: totals.CumulativeGpa,
          gradedCreditHours: totals.GradedCreditHours,
          passedCreditHours: totals.PassedCreditHours,
          standing: standingOf(totals.CumulativeGpa),
          computedGpa: credits ? DB.round2(quality / credits) : null,
        },
      };
    }
    if (segments[1] === 'timetable') {
      const term = query.semesterId ? DB.semesterById.get(Number(query.semesterId)) : DB.openSemester();
      if (!term) fail(404, 'no_semester', 'There is no semester to show.');
      return { term, rows: B5_MY_ENROLLMENTS(userId, term.SemesterId) };
    }
    if (segments[1] === 'fees') return studentFees(userId);
    if (segments[1] === 'attendance') {
      const summary = [];
      const grouped = DB.groupBy(DB.enrollmentsOfStudent(userId)
        .filter((row) => row.Status === 'Enrolled' || row.Status === 'Completed'), (row) => `${row.course.Code}|${row.section.SectionCode}`);
      for (const [, list] of grouped) {
        const rows = list.flatMap((row) => DB.attendanceOf(row.EnrollmentId));
        const count = (status) => rows.filter((row) => row.Status === status).length;
        summary.push({
          Code: list[0].course.Code,
          Title: list[0].course.Title,
          SectionCode: list[0].section.SectionCode,
          Sessions: rows.length,
          Present: count('Present'),
          Absent: count('Absent'),
          Excused: count('Excused'),
          AttendancePercent: rows.length
            ? DB.round1((100 * (count('Present') + count('Excused'))) / rows.length)
            : null,
        });
      }
      summary.sort((a, b) => a.Code.localeCompare(b.Code));
      const detail = DB.enrollmentsOfStudent(userId)
        .flatMap((row) => DB.attendanceOf(row.EnrollmentId).map((entry) => ({
          CourseCode: row.course.Code, SessionDate: entry.SessionDate, Status: entry.Status,
        })))
        .sort((a, b) => b.SessionDate.localeCompare(a.SessionDate) || a.CourseCode.localeCompare(b.CourseCode));
      return { summary, detail: detail.slice(0, 60) };
    }
    if (segments[1] === 'announcements') return { rows: B13_ANNOUNCEMENTS(userId) };
    if (segments[1] === 'advisor') return { advisor: B14_ADVISOR(userId) };
    if (segments[1] === 'credit-load') return { load: B18_CREDIT_LOAD(userId) };
  }

  /* --------------------------------------------------------------- instructor */
  if (segments[0] === 'instructor') {
    const me = needRole('Instructor');
    const userId = me.userId;

    const owned = (sectionId) => {
      const section = DB.sectionById.get(Number(sectionId));
      if (!section || section.InstructorId !== userId) {
        fail(403, 'not_your_section', 'This section is not one of your sections.');
      }
      return section;
    };

    if (segments[1] === 'overview') {
      const term = DB.openSemester();
      const all = C1_MY_SECTIONS(userId);
      const current = term ? all.filter((section) => section.SemesterId === term.SemesterId) : [];
      const students = new Set(C11_MY_STUDENTS(userId).map((row) => row.StudentNumber));
      return {
        term,
        sections: current.length ? current : all.slice(0, 4),
        allSections: all.length,
        students: students.size,
        publishedSections: all.filter((section) => section.publishedAll).length,
      };
    }
    if (segments[1] === 'sections' && !segments[2]) {
      return { rows: C1_MY_SECTIONS(userId, query.semesterId ? Number(query.semesterId) : null) };
    }
    if (segments[1] === 'sections' && segments[3] === 'roster') {
      const section = owned(segments[2]);
      return {
        section: {
          SectionId: section.SectionId, SemesterId: section.SemesterId,
          Code: DB.courseById.get(section.CourseId).Code, Title: DB.courseById.get(section.CourseId).Title,
          SectionCode: section.SectionCode,
        },
        rows: C2_ROSTER(section.SectionId),
        statistics: C6_SECTION_STATISTICS(section.SectionId),
        attendance: C7_ATTENDANCE_RATE(section.SectionId),
      };
    }
    if (segments[1] === 'sections' && segments[3] === 'statistics') {
      const section = owned(segments[2]);
      return {
        section: {
          SectionId: section.SectionId, SemesterId: section.SemesterId,
          Code: DB.courseById.get(section.CourseId).Code, Title: DB.courseById.get(section.CourseId).Title,
          SectionCode: section.SectionCode,
        },
        statistics: C6_SECTION_STATISTICS(section.SectionId),
        attendance: C7_ATTENDANCE_RATE(section.SectionId),
      };
    }
    if (segments[1] === 'sections' && segments[3] === 'scores' && verb === 'POST') {
      const section = owned(segments[2]);
      const score = Number(body?.score);
      if (!isValidScore(score)) fail(400, 'bad_score', 'A score is a number between 0 and 100.');
      const enrollment = DB.enrollmentsOfSection(section.SectionId)
        .find((row) => row.EnrollmentId === Number(body?.enrollmentId));
      if (!enrollment) fail(404, 'not_in_section', 'That student is not registered in this section.');
      if (enrollment.Status === 'Dropped') fail(400, 'student_dropped', 'This student dropped the course, so there is no score to write.');
      if (enrollment.Status === 'Completed') {
        fail(400, 'grades_published', 'The grades of this section are published. Ask the student office for a correction.');
      }
      DB.updateEnrollment(enrollment.EnrollmentId, { Score: score });
      return {
        enrollmentId: enrollment.EnrollmentId,
        score,
        letter: letterForScore(score),
        points: pointsForScore(score),
        note: 'The letter grade and the grade points were written by the trigger inside the database.',
      };
    }
    if (segments[1] === 'sections' && segments[3] === 'publish' && verb === 'POST') {
      const section = owned(segments[2]);
      const roster = DB.enrollmentsOfSection(section.SectionId).filter((row) => row.Status !== 'Dropped');
      const missing = roster.filter((row) => row.Score === null || row.Score === undefined);
      if (missing.length) {
        fail(409, 'db_rule_51030', 'The grades of the section cannot be published: 1 student(s) have no score yet.');
      }
      for (const row of roster) DB.updateEnrollment(row.EnrollmentId, { GradePublished: 1, Status: 'Completed' });
      return {
        section: {
          SectionId: section.SectionId, Code: DB.courseById.get(section.CourseId).Code,
          Title: DB.courseById.get(section.CourseId).Title, SectionCode: section.SectionCode,
        },
        published: roster.length,
        message: `The grades of ${roster.length} students were published.`,
      };
    }
    if (segments[1] === 'sections' && segments[3] === 'attendance' && verb === 'GET') {
      const section = owned(segments[2]);
      const saved = DB.enrollmentsOfSection(section.SectionId)
        .flatMap((row) => DB.attendanceOf(row.EnrollmentId));
      const dates = [...new Set(saved.map((row) => String(row.SessionDate).slice(0, 10)))].sort().reverse();
      const date = query.date ? String(query.date).slice(0, 10) : null;
      return {
        section: {
          SectionId: section.SectionId, Code: DB.courseById.get(section.CourseId).Code,
          Title: DB.courseById.get(section.CourseId).Title, SectionCode: section.SectionCode,
        },
        sessionDate: date,
        students: C2_ROSTER(section.SectionId).filter((row) => row.Status !== 'Dropped'),
        saved: date ? saved.filter((row) => String(row.SessionDate).slice(0, 10) === date) : [],
        dates,
      };
    }
    if (segments[1] === 'sections' && segments[3] === 'attendance' && verb === 'POST') {
      const section = owned(segments[2]);
      const date = String(body?.sessionDate || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail(400, 'bad_date', 'Session date has to look like 2025-10-04.');
      if (!Array.isArray(body?.entries) || !body.entries.length) fail(400, 'nothing_to_save', 'There is no attendance in the request.');
      const allowed = new Set(C2_ROSTER(section.SectionId).map((row) => row.EnrollmentId));
      let count = 0;
      for (const entry of body.entries) {
        const enrollmentId = Number.parseInt(entry.enrollmentId, 10);
        if (!allowed.has(enrollmentId)) fail(400, 'not_in_section', `Registration ${entry.enrollmentId} is not part of this section.`);
        if (!['Present', 'Absent', 'Excused'].includes(entry.status)) {
          fail(400, 'bad_attendance_status', `Attendance status "${entry.status}" is not one of Present, Absent, Excused.`);
        }
        DB.upsertAttendance(enrollmentId, date, entry.status);
        count += 1;
      }
      return {
        section: {
          SectionId: section.SectionId, Code: DB.courseById.get(section.CourseId).Code,
          Title: DB.courseById.get(section.CourseId).Title, SectionCode: section.SectionCode,
        },
        sessionDate: date,
        saved: count,
        message: `The attendance of ${count} students was saved for ${date}.`,
      };
    }
    if (segments[1] === 'sections' && segments[3] === 'announcements' && verb === 'GET') {
      const section = owned(segments[2]);
      return {
        section: {
          SectionId: section.SectionId, Code: DB.courseById.get(section.CourseId).Code,
          Title: DB.courseById.get(section.CourseId).Title, SectionCode: section.SectionCode,
        },
        rows: DB.announcements
          .filter((row) => row.SectionId === section.SectionId)
          .sort((a, b) => b.IsPinned - a.IsPinned || b.PostedAt.localeCompare(a.PostedAt))
          .map((row) => {
            const author = DB.userById.get(row.AuthorId);
            return {
              AnnouncementId: row.AnnouncementId, Title: row.Title, Body: row.Body,
              PostedAt: row.PostedAt, IsPinned: row.IsPinned,
              AuthorName: author.FullName, AuthorRole: author.Role,
            };
          }),
      };
    }
    if (segments[1] === 'sections' && segments[3] === 'announcements' && verb === 'POST') {
      const section = owned(segments[2]);
      const title = String(body?.title || '').trim();
      const text = String(body?.body || '').trim();
      if (title.length < 3) fail(400, 'title_too_short', 'The title needs at least three characters.');
      if (text.length < 3) fail(400, 'body_too_short', 'The text of the announcement is empty.');
      const created = DB.addAnnouncement({
        SectionId: section.SectionId, AuthorId: userId, Title: title, Body: text,
        PostedAt: new Date().toISOString().slice(0, 19), IsPinned: body?.isPinned ? 1 : 0,
      });
      return {
        announcementId: created.AnnouncementId,
        section: { SectionId: section.SectionId, Code: DB.courseById.get(section.CourseId).Code },
        message: 'The announcement was posted to the section.',
      };
    }
    if (segments[1] === 'students') return { rows: C11_MY_STUDENTS(userId) };
  }

  /* ------------------------------------------------------------------- office */
  if (segments[0] === 'admin') {
    const me = needRole('Admin');

    if (segments[1] === 'overview') {
      return { numbers: D1_OVERVIEW(), board: S4_SECTIONS_OF_THE_TERM(12), tableCounts: S5_TABLE_COUNTS() };
    }
    if (segments[1] === 'table-counts') return { rows: S5_TABLE_COUNTS() };
    if (segments[1] === 'users' && !segments[2]) {
      return {
        rows: D2_USER_LIST({
          role: query.role || null,
          status: query.status === undefined || query.status === '' ? null : query.status,
          search: query.search || null,
        }),
      };
    }
    if (segments[1] === 'users' && segments[3] === 'active' && verb === 'PATCH') {
      const userId = Number(segments[2]);
      const isActive = body?.isActive === true;
      const target = DB.userById.get(userId);
      if (!target) fail(404, 'account_missing', 'There is no account with that identifier.');
      if (userId === me.userId && !isActive) fail(403, 'cannot_disable_self', 'You cannot switch off your own account.');
      if (target.Role === 'Admin' && !isActive
        && DB.users.filter((user) => user.Role === 'Admin' && user.IsActive === 1).length <= 1) {
        fail(403, 'last_admin', 'This is the last administrator, so it cannot be switched off.');
      }
      DB.setActive(userId, isActive);
      return {
        userId, isActive, fullName: target.FullName,
        message: isActive ? `${target.FullName} can sign in now.` : `${target.FullName} cannot sign in any more.`,
      };
    }
    if (segments[1] === 'admins' && verb === 'POST') {
      const fullName = String(body?.fullName || '').trim();
      const email = String(body?.email || '').trim().toLowerCase();
      const position = String(body?.position || 'Student Records Officer').trim();
      if (fullName.length < 3) fail(400, 'too_short', 'The name is missing.');
      if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email)) fail(400, 'bad_email', 'That is not a valid e-mail address.');
      const problem = passwordComplaint(body?.password, email, fullName);
      if (problem) fail(400, 'weak_password', problem);
      if (String(body?.password) !== String(body?.confirmPassword)) fail(400, 'password_mismatch', 'The password and its confirmation are not the same.');
      if (DB.users.some((user) => user.Email.toLowerCase() === email)) fail(409, 'email_taken', 'There is already an account with this e-mail address.');
      const created = DB.addUser({
        FullName: fullName, Email: email, PasswordHash: '(bcrypt hash)', Role: 'Admin', IsActive: 1,
      });
      DB.addAdmin({ UserId: created.UserId, Position: position, CanRecordPayments: body?.canRecordPayments ? 1 : 0 });
      passwords.set(email, String(body.password));
      return {
        userId: created.UserId, fullName, email, position,
        canRecordPayments: Boolean(body?.canRecordPayments), createdBy: me.userId,
        message: `${fullName} is an administrator now.`,
      };
    }
    if (segments[1] === 'students') return { rows: D31_STUDENT_OPTIONS() };
    if (segments[1] === 'catalogue') {
      return { rows: D5_COURSE_CATALOGUE(query.search || null), departments: A12_DEPARTMENTS(), sections: D4_SECTION_FILL() };
    }
    if (segments[1] === 'courses' && verb === 'POST') {
      const code = String(body?.code || '').trim().toUpperCase();
      if (!/^[A-Z]{2,4}[0-9]{3}$/.test(code)) fail(400, 'bad_code', 'A course code looks like CS201: two to four letters and three digits.');
      const credits = Number.parseInt(body?.creditHours, 10);
      if (!Number.isInteger(credits) || credits < 1 || credits > 6) fail(400, 'bad_credits', 'The credit hours are a whole number between 1 and 6.');
      const level = Number.parseInt(body?.level, 10);
      if (!Number.isInteger(level) || level < 1 || level > 5) fail(400, 'bad_level', 'The level is a number between 1 and 5.');
      const departmentId = Number.parseInt(body?.departmentId, 10);
      if (!DB.departmentById.has(departmentId)) fail(404, 'department_missing', 'There is no department with that identifier.');
      if (DB.courses.some((course) => course.Code === code)) fail(409, 'course_exists', `The code ${code} is already used by another course.`);
      const created = DB.addCourse({
        Code: code, Title: String(body?.title || '').trim(), CreditHours: credits,
        DepartmentId: departmentId, Level: level,
        Description: body?.description ? String(body.description).slice(0, 400) : null,
      });
      return { courseId: created.CourseId, code, credits, message: `${code} was added to the catalogue.` };
    }
    if (segments[1] === 'courses' && segments[2] && verb === 'PATCH') {
      const course = DB.courseById.get(Number(segments[2]));
      if (!course) fail(404, 'course_missing', 'There is no course with that identifier.');
      const credits = Number.parseInt(body?.creditHours, 10);
      const level = Number.parseInt(body?.level, 10);
      if (!Number.isInteger(credits) || credits < 1 || credits > 6) fail(400, 'bad_credits', 'The credit hours are a number between 1 and 6.');
      if (!Number.isInteger(level) || level < 1 || level > 5) fail(400, 'bad_level', 'The level is a number between 1 and 5.');
      DB.updateCourse(course.CourseId, {
        Title: String(body?.title || '').trim(), CreditHours: credits, Level: level,
        Description: body?.description ? String(body.description).slice(0, 400) : null,
      });
      return { courseId: course.CourseId, code: course.Code, message: `${course.Code} was updated.` };
    }
    if (segments[1] === 'sections' && !segments[2] && verb === 'GET') {
      return {
        rows: D4_SECTION_FILL(query.semesterId || null).map((row) => ({ ...row, isFull: row.Enrolled >= row.Capacity })),
        semesters: D14_SEMESTERS(),
        rooms: D6_ROOMS(),
        instructors: D7_INSTRUCTOR_OPTIONS(true),
        courses: D5_COURSE_CATALOGUE(),
      };
    }
    if (segments[1] === 'sections' && verb === 'POST') {
      const course = DB.courseById.get(Number(body?.courseId));
      const semester = DB.semesterById.get(Number(body?.semesterId));
      const instructor = DB.instructorById.get(Number(body?.instructorId));
      const room = DB.roomById.get(Number(body?.roomId));
      if (!course) fail(404, 'course_missing', 'There is no course with that identifier.');
      if (!semester) fail(404, 'semester_missing', 'There is no semester with that identifier.');
      if (!room) fail(404, 'room_missing', 'There is no room with that identifier.');
      if (!instructor) fail(404, 'instructor_missing', 'There is no instructor with that identifier.');
      if (DB.userById.get(instructor.UserId).IsActive !== 1) fail(409, 'instructor_inactive', 'That instructor account is not active, so it cannot be given a section.');
      const sectionCode = String(body?.sectionCode || '01');
      const dayOfWeek = Number.parseInt(body?.dayOfWeek, 10);
      const startTime = `${String(body?.startTime || '').slice(0, 5)}:00`;
      const endTime = `${String(body?.endTime || '').slice(0, 5)}:00`;
      const capacity = Number.parseInt(body?.capacity, 10);
      if (!Number.isInteger(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 7) fail(400, 'bad_day', 'The day is a number from 1 (Saturday) to 7 (Friday).');
      if (endTime <= startTime) fail(400, 'bad_slot', 'The end of the lecture has to be after its start.');
      if (!Number.isInteger(capacity) || capacity < 5 || capacity > 500) fail(400, 'bad_capacity', 'The capacity is a number between 5 and 500.');
      if (DB.sections.some((section) => section.CourseId === course.CourseId
        && section.SemesterId === semester.SemesterId && section.SectionCode === sectionCode)) {
        fail(409, 'section_exists', `The course already has a section ${sectionCode} in ${semester.Name}.`);
      }
      const clash = (other) => other.SemesterId === semester.SemesterId
        && other.DayOfWeek === dayOfWeek
        && startTime < other.EndTime && endTime > other.StartTime;
      const roomClash = DB.sections.find((other) => other.RoomId === room.RoomId && clash(other));
      if (roomClash) {
        fail(409, 'room_busy', `The room is already used by ${DB.courseById.get(roomClash.CourseId).Code} ${roomClash.SectionCode} in this slot.`);
      }
      const instructorClash = DB.sections.find((other) => other.InstructorId === instructor.UserId && clash(other));
      if (instructorClash) {
        fail(409, 'instructor_busy', `The instructor already teaches ${DB.courseById.get(instructorClash.CourseId).Code} ${instructorClash.SectionCode} in this slot.`);
      }
      const created = DB.addSection({
        CourseId: course.CourseId, SemesterId: semester.SemesterId, InstructorId: instructor.UserId,
        RoomId: room.RoomId, SectionCode: sectionCode, Capacity: capacity,
        DayOfWeek: dayOfWeek, StartTime: startTime, EndTime: endTime,
      });
      return {
        sectionId: created.SectionId, course: course.Code, semester: semester.Name,
        message: `Section ${course.Code} of ${semester.Name} was created.`,
      };
    }
    if (segments[1] === 'sections' && segments[2] && verb === 'PATCH') {
      const section = DB.sectionById.get(Number(segments[2]));
      if (!section) fail(404, 'section_missing', 'There is no section with that identifier.');
      const capacity = Number.parseInt(body?.capacity, 10);
      const enrolled = DB.enrollmentsOfSection(section.SectionId)
        .filter((row) => row.Status === 'Enrolled' || row.Status === 'Completed').length;
      if (Number.isInteger(capacity) && capacity < enrolled) {
        fail(409, 'capacity_too_small', `There are already ${enrolled} registrations in this section, so the capacity cannot go below that.`);
      }
      Object.assign(section, {
        Capacity: Number.isInteger(capacity) ? capacity : section.Capacity,
        InstructorId: Number(body?.instructorId) || section.InstructorId,
        RoomId: Number(body?.roomId) || section.RoomId,
        DayOfWeek: Number(body?.dayOfWeek) || section.DayOfWeek,
        StartTime: body?.startTime ? `${String(body.startTime).slice(0, 5)}:00` : section.StartTime,
        EndTime: body?.endTime ? `${String(body.endTime).slice(0, 5)}:00` : section.EndTime,
      });
      return { sectionId: section.SectionId, capacity: section.Capacity, message: 'The section was updated.' };
    }
    if (segments[1] === 'sections' && segments[2] && verb === 'DELETE') {
      const section = DB.sectionById.get(Number(segments[2]));
      if (!section) fail(404, 'section_missing', 'There is no section with that identifier.');
      const registrations = DB.enrollmentsOfSection(section.SectionId).length;
      if (registrations > 0) {
        fail(409, 'section_has_registrations', `${DB.courseById.get(section.CourseId).Code} ${section.SectionCode} has ${registrations} registrations. Close the section instead of deleting it: the academic history may never disappear.`);
      }
      const announcements = DB.announcements.filter((row) => row.SectionId === section.SectionId).length;
      for (const row of DB.announcements.filter((entry) => entry.SectionId === section.SectionId)) {
        DB.deleteAnnouncement(row.AnnouncementId);
      }
      DB.deleteSection(section.SectionId);
      return { sectionId: section.SectionId, announcementsRemoved: announcements, message: 'The section was deleted.' };
    }
    if (segments[1] === 'semesters' && !segments[2] && verb === 'GET') return { rows: D14_SEMESTERS() };
    if (segments[1] === 'semesters' && verb === 'POST') {
      const name = String(body?.name || '').trim();
      if (name.length < 3) fail(400, 'too_short', 'The semester name is missing.');
      if (String(body?.endDate) <= String(body?.startDate)) fail(400, 'bad_dates', 'The semester has to end after it starts.');
      if (DB.semesters.some((semester) => semester.Name === name)) fail(409, 'semester_exists', `There is already a semester called ${name}.`);
      const created = DB.addSemester({
        Name: name, StartDate: String(body?.startDate).slice(0, 10), EndDate: String(body?.endDate).slice(0, 10),
        RegistrationOpen: body?.registrationOpen ? 1 : 0,
        RegistrationDeadline: body?.registrationDeadline ? String(body.registrationDeadline).slice(0, 10) : null,
        DropDeadline: body?.dropDeadline ? String(body.dropDeadline).slice(0, 10) : null,
      });
      if (created.RegistrationOpen) {
        for (const semester of DB.semesters) {
          if (semester.SemesterId !== created.SemesterId) DB.updateSemester(semester.SemesterId, { RegistrationOpen: 0 });
        }
      }
      return { semesterId: created.SemesterId, name, message: `${name} was created.` };
    }
    if (segments[1] === 'semesters' && segments[2] && verb === 'PATCH') {
      const semester = DB.semesterById.get(Number(segments[2]));
      if (!semester) fail(404, 'semester_missing', 'There is no semester with that identifier.');
      const open = body?.registrationOpen ? 1 : 0;
      if (open) {
        for (const other of DB.semesters) {
          if (other.SemesterId !== semester.SemesterId) DB.updateSemester(other.SemesterId, { RegistrationOpen: 0 });
        }
      }
      DB.updateSemester(semester.SemesterId, {
        RegistrationOpen: open,
        RegistrationDeadline: body?.registrationDeadline ? String(body.registrationDeadline).slice(0, 10) : semester.RegistrationDeadline,
        DropDeadline: body?.dropDeadline ? String(body.dropDeadline).slice(0, 10) : semester.DropDeadline,
      });
      return {
        semesterId: semester.SemesterId, registrationOpen: Boolean(open),
        registrationDeadline: semester.RegistrationDeadline, dropDeadline: semester.DropDeadline,
        message: open
          ? 'Registration is open for this semester, and closed for the others.'
          : 'Registration is closed for this semester.',
      };
    }
    if (segments[1] === 'rooms') return { rows: D6_ROOMS() };
    if (segments[1] === 'payments' && !segments[2] && verb === 'GET') {
      const rows = D19_PAYMENTS({ semesterId: query.semesterId || null, search: query.search || null });
      const outstanding = D20_FEES_NOT_PAID();
      return {
        rows,
        outstanding,
        semesters: D14_SEMESTERS(),
        summary: {
          payments: rows.length,
          collected: DB.round2(rows.reduce((sum, row) => sum + Number(row.Amount), 0)),
          outstanding: DB.round2(outstanding.reduce((sum, row) => sum + Number(row.Balance || 0), 0)),
        },
      };
    }
    if (segments[1] === 'payments' && verb === 'POST') {
      if (!me.canRecordPayments) fail(403, 'no_payment_permission', 'Your administrator account may not record payments.');
      const student = DB.studentById.get(Number(body?.studentId));
      if (!student) fail(404, 'student_missing', 'There is no student with that identifier.');
      const semester = DB.semesterById.get(Number(body?.semesterId));
      if (!semester) fail(404, 'semester_missing', 'There is no semester with that identifier.');
      if (DB.userById.get(student.UserId).IsActive !== 1) fail(409, 'student_inactive', 'The account of this student is not active.');
      const amount = Number(body?.amount);
      if (!Number.isFinite(amount) || amount <= 0 || amount > 100000) fail(400, 'bad_amount', 'The amount is a number between 0 and 100000.');
      if (!['Cash', 'Card', 'BankTransfer'].includes(String(body?.method))) {
        fail(400, 'bad_method', 'The method is one of Cash, Card, BankTransfer.');
      }
      const number = receiptNumber(semester.SemesterId);
      const created = DB.addPayment({
        StudentId: student.UserId, SemesterId: semester.SemesterId, Amount: DB.round2(amount),
        PaidAt: body?.paidAt ? String(body.paidAt) : new Date().toISOString().slice(0, 19),
        Method: String(body.method), ReceiptNumber: number, RecordedByAdminId: me.userId,
      });
      return {
        receiptNumber: number,
        paymentId: created.PaymentId,
        studentNumber: student.StudentNumber,
        studentName: DB.fullNameOf(student.UserId),
        amount: DB.round2(amount),
        method: String(body.method),
        semester: semester.Name,
        message: `${DB.round2(amount)} was received from ${DB.fullNameOf(student.UserId)}. Receipt ${number}.`,
      };
    }
    if (segments[1] === 'fees-not-paid') return { rows: D20_FEES_NOT_PAID() };
    if (segments[1] === 'announcements' && !segments[2] && verb === 'GET') return { rows: D22_ANNOUNCEMENTS() };
    if (segments[1] === 'announcements' && verb === 'POST') {
      const title = String(body?.title || '').trim();
      const text = String(body?.body || '').trim();
      if (title.length < 3) fail(400, 'too_short', 'The title is missing.');
      if (text.length < 3) fail(400, 'too_short', 'The text is missing.');
      const created = DB.addAnnouncement({
        SectionId: null, AuthorId: me.userId, Title: title, Body: text,
        PostedAt: new Date().toISOString().slice(0, 19), IsPinned: body?.isPinned ? 1 : 0,
      });
      return { announcementId: created.AnnouncementId, title, message: 'The announcement was published for everybody.' };
    }
    if (segments[1] === 'announcements' && segments[2] && verb === 'DELETE') {
      const announcementsBefore = DB.announcements.length;
      const removed = DB.deleteAnnouncement(segments[2]);
      if (removed === announcementsBefore) fail(404, 'announcement_missing', 'There is no announcement with that identifier.');
      return { announcementId: Number(segments[2]), message: 'The announcement was removed.' };
    }
    if (segments[1] === 'signup-options') return { programs: S1_PROGRAMS(), departments: S2_DEPARTMENTS() };
  }

  /* ------------------------------------------------------------------ reports */
  if (segments[0] === 'reports') {
    const me = needRole('Admin', 'Instructor');
    if (!segments[1]) return reportCatalogue(me);
    if (segments[1] === 'options') {
      const term = DB.openSemester();
      const mySections = me.role === 'Instructor'
        ? DB.sections.filter((row) => row.InstructorId === me.userId)
        : DB.sections;
      return {
        semesters: DB.semestersNewestFirst().map((semester) => ({
          id: semester.SemesterId,
          label: semester.Name + (semester.SemesterId === term?.SemesterId ? ' (open)' : ''),
        })),
        sections: mySections
          .sort((a, b) => a.SemesterId - b.SemesterId || a.CourseId - b.CourseId)
          .map((section) => ({
            id: section.SectionId,
            label: `${DB.courseById.get(section.CourseId).Code} ${section.SectionCode} — ${DB.semesterById.get(section.SemesterId).Name}`,
          })),
        students: me.role === 'Admin' ? D31_STUDENT_OPTIONS().map((row) => ({
          id: row.UserId, label: `${row.StudentNumber} — ${row.FullName} (${row.ProgramName})`,
        })) : [],
        instructors: me.role === 'Admin' ? D7_INSTRUCTOR_OPTIONS(true).map((row) => ({
          id: row.UserId, label: `${row.Title || ''} ${row.FullName} (${row.DepartmentCode})`.trim(),
        })) : [{
          id: me.userId,
          label: `${me.title || ''} ${me.fullName}`.trim(),
        }],
      };
    }
    return runReport(decodeURIComponent(segments[1]), query, me);
  }

  fail(404, 'unknown_endpoint', `The demonstration mode does not know ${path}.`);
  return null;
}

function passwordComplaint(password, email, fullName) {
  const value = String(password || '');
  if (value.length < 8) return 'The password must be at least 8 characters long.';
  if (!/[A-Za-z]/.test(value) || !/[0-9]/.test(value)) {
    return 'The password must contain at least one letter and one digit.';
  }
  const lowered = value.toLowerCase();
  for (const item of [email, fullName]) {
    if (item && item.length >= 4 && lowered.includes(String(item).toLowerCase())) {
      return 'The password must not contain your name or your e-mail address.';
    }
  }
  return null;
}

function studentFees(studentId) {
  const terms = [];
  const byTerm = new Map();
  for (const enrollment of DB.enrollmentsOfStudent(studentId)) {
    if (enrollment.Status !== 'Enrolled' && enrollment.Status !== 'Completed') continue;
    const key = enrollment.semester.SemesterId;
    byTerm.set(key, (byTerm.get(key) || 0) + enrollment.course.CreditHours);
  }
  const fee = Number(DB.programById.get(DB.studentById.get(Number(studentId)).ProgramId).FeePerCreditHour);
  for (const [semesterId, credits] of byTerm) {
    const semester = DB.semesterById.get(Number(semesterId));
    const paid = DB.round2(DB.payments.filter((row) => row.StudentId === Number(studentId)
      && row.SemesterId === Number(semesterId)).reduce((sum, row) => sum + Number(row.Amount), 0));
    terms.push({
      SemesterId: semester.SemesterId,
      SemesterName: semester.Name,
      StartDate: semester.StartDate,
      CreditHours: credits,
      FeePerCreditHour: fee,
      FeesDue: DB.round2(credits * fee),
      PaidSoFar: paid,
      Balance: DB.round2(credits * fee - paid),
    });
  }
  terms.sort((a, b) => String(b.StartDate).localeCompare(String(a.StartDate)));
  const payments = DB.payments
    .filter((row) => row.StudentId === Number(studentId))
    .sort((a, b) => b.PaidAt.localeCompare(a.PaidAt))
    .map((row) => ({
      PaymentId: row.PaymentId, Amount: row.Amount, PaidAt: row.PaidAt, Method: row.Method,
      ReceiptNumber: row.ReceiptNumber, SemesterName: DB.semesterById.get(row.SemesterId).Name,
      RecordedBy: DB.fullNameOf(row.RecordedByAdminId),
    }));
  const billed = DB.round2(terms.reduce((sum, row) => sum + row.FeesDue, 0));
  const paid = DB.round2(payments.reduce((sum, row) => sum + Number(row.Amount), 0));
  return { terms, payments, summary: { billed, paid, balance: DB.round2(billed - paid) } };
}

export default { mockRequest, mockSession };
