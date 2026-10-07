/**
 * The reports, answered from the demonstration data.
 *
 * Every report here is a translation of the SQL of the same number (server/src/reports/
 * registry.js, written out in database/04_reports.sql): same rows, same columns, same order,
 * same arithmetic. The point of the exercise is that the report screen is written once and
 * works against either answer, and that a marker without SQL Server can still see the three
 * kinds of reporting the course asks for:
 *
 *     R1.x  statistical   counts, averages, distributions, rates
 *     R2.x  detailed      one student, one section, one term, one room, one teacher
 *     R3.x  managerial    trends, performance of the programmes, students at risk
 *
 * The two rules of the real API are kept as well: a teacher only sees their own sections, and
 * the value of an "instructor" parameter is never taken from the request.
 */
import { REPORT_META, INSTRUCTOR_REPORTS } from './demo-reports.js';
import {
  announcements, attendance, courseById, courses, departments, enrollments, enrollmentsOfSection,
  enrollmentsOfStudent, fillOf, fullNameOf, gpaRows, groupBy, instructorById, instructors,
  openSemester, payments, prerequisites, programById, programs, rooms,
  sectionById, sections, semesterById, semestersNewestFirst, studentById, students,
  totalsOf, userById, users, DAY_NAMES,
} from './context.js';

/** T-SQL rounds half away from zero (CAST(... AS DECIMAL(n,d))) */
const roundTo = (value, digits = 2) => (value === null || value === undefined || Number.isNaN(Number(value))
  ? null
  : Math.round(Number(value) * 10 ** digits + 1e-9) / 10 ** digits);

const FALL_2025 = 'Fall 2025';
const SPRING_2026 = 'Spring 2026';
const FALL_2026 = 'Fall 2026';

const notDropped = (row) => row.Status !== 'Dropped';
const registered = (row) => row.Status === 'Enrolled' || row.Status === 'Completed';
const sum = (rows, pick) => rows.reduce((total, row) => total + Number(pick(row) || 0), 0);
const round2 = (value) => roundTo(value, 2);
const round1 = (value) => roundTo(value, 1);

/* ------------------------------------------------------------------ statistical reports */

function R1_1() {
  const programNames = [...new Set(enrollments.map((row) => row.program.Name))].sort();
  return programNames.map((name) => {
    const rows = enrollments.filter((row) => row.program.Name === name && notDropped(row));
    const program = rows[0].program;
    return {
      ProgramName: name,
      DepartmentCode: departments.find((d) => d.DepartmentId === program.DepartmentId).Code,
      Fall2025: rows.filter((row) => row.semester.Name === FALL_2025).length,
      Spring2026: rows.filter((row) => row.semester.Name === SPRING_2026).length,
      Fall2026: rows.filter((row) => row.semester.Name === FALL_2026).length,
      RegistrationsTotal: rows.length,
    };
  });
}

function R1_2() {
  const graded = enrollments.filter((row) => row.GradePublished === 1 && notDropped(row));
  const grouped = groupBy(graded, (row) => `${row.semester.Name}|${row.course.Code}|${row.section.SectionCode}`)
    .values();
  const rows = [...grouped].map((list) => {
    const first = list[0];
    const count = (letter) => list.filter((row) => row.LetterGrade === letter).length;
    return {
      SemesterName: first.semester.Name,
      CourseCode: first.course.Code,
      CourseTitle: first.course.Title,
      SectionCode: first.section.SectionCode,
      Graded: list.length,
      AverageScore: round2(sum(list, (row) => row.Score) / list.length),
      A: count('A'), AMinus: count('A-'), BPlus: count('B+'), B: count('B'), BMinus: count('B-'),
      CPlus: count('C+'), C: count('C'), CMinus: count('C-'), DPlus: count('D+'), D: count('D'), F: count('F'),
      PassRate: round1((100 * list.filter((row) => Number(row.Score) >= 60).length) / list.length),
    };
  });
  return rows.sort((a, b) => b.SemesterName.localeCompare(a.SemesterName)
    || a.CourseCode.localeCompare(b.CourseCode) || a.SectionCode.localeCompare(b.SectionCode));
}

function R1_3(params) {
  const term = semesterById.get(Number(params.SemesterId));
  return sections
    .filter((section) => section.SemesterId === term.SemesterId)
    .map(fillOf)
    .map((row) => ({
      ...row,
      FillBand: row.FillPercent >= 100 ? 'Full'
        : row.FillPercent >= 80 ? 'Almost full'
          : row.FillPercent >= 50 ? 'Half' : 'Plenty of seats',
    }))
    .map(({ SectionId, SemesterId, SemesterName, ...rest }) => rest)
    .sort((a, b) => b.FillPercent - a.FillPercent || a.CourseCode.localeCompare(b.CourseCode));
}

function R1_4() {
  const grouped = groupBy(attendance, (row) => row.EnrollmentId);
  const bySection = new Map();
  for (const [enrollmentId, list] of grouped) {
    const enrollment = enrollments.find((row) => row.EnrollmentId === enrollmentId);
    if (!enrollment) continue;
    const key = enrollment.SectionId;
    if (!bySection.has(key)) bySection.set(key, []);
    bySection.get(key).push(...list);
  }
  const rows = [];
  for (const [sectionId, list] of bySection) {
    if (list.length < 5) continue;
    const section = sectionById.get(sectionId);
    const count = (status) => list.filter((row) => row.Status === status).length;
    rows.push({
      SemesterName: semesterById.get(section.SemesterId).Name,
      CourseCode: courseById.get(section.CourseId).Code,
      SectionCode: section.SectionCode,
      InstructorName: fullNameOf(section.InstructorId),
      SessionsRecorded: new Set(list.map((row) => row.SessionDate)).size,
      AttendanceRows: list.length,
      PresentRows: count('Present'),
      AbsentRows: count('Absent'),
      ExcusedRows: count('Excused'),
      PresentRate: round1((100 * count('Present')) / list.length),
    });
  }
  return rows.sort((a, b) => a.PresentRate - b.PresentRate || a.CourseCode.localeCompare(b.CourseCode));
}

function R1_5(params) {
  const term = semesterById.get(Number(params.SemesterId));
  const rows = enrollments
    .filter((row) => row.Status === 'Enrolled' && row.semester.SemesterId === term.SemesterId)
    .map((row) => ({ ...row, student: studentById.get(row.StudentId), user: userById.get(row.StudentId) }));
  const grouped = groupBy(rows, (row) => row.StudentId).values();
  const answer = [...grouped].map((list) => {
    const scores = list.filter((row) => row.GradePublished === 1).map((row) => Number(row.Score));
    return {
      StudentNumber: list[0].student.StudentNumber,
      FullName: list[0].user.FullName,
      ProgramName: list[0].program.Name,
      Level: list[0].student.Level,
      CoursesCount: list.length,
      CreditHours: sum(list, (row) => row.course.CreditHours),
      AveragedScore: scores.length ? round2(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
    };
  });
  return answer
    .sort((a, b) => b.CreditHours - a.CreditHours || a.FullName.localeCompare(b.FullName))
    .slice(0, 20);
}

function R1_6() {
  const rows = enrollments.filter(notDropped);
  const departmentCodes = [...new Set(courses.map((course) => departments
    .find((d) => d.DepartmentId === course.DepartmentId).Code))].sort();
  const answer = [];
  for (const code of departmentCodes) {
    const ofDepartment = rows.filter((row) => departments
      .find((d) => d.DepartmentId === row.course.DepartmentId).Code === code);
    for (const level of [1, 2, 3, 4, 5]) {
      const ofLevel = ofDepartment.filter((row) => row.student.Level === level);
      if (ofLevel.length) {
        answer.push({
          DepartmentCode: code,
          StudentLevel: level,
          Registrations: ofLevel.length,
          CreditHours: sum(ofLevel, (row) => row.course.CreditHours),
        });
      }
    }
    answer.push({
      DepartmentCode: code,
      StudentLevel: 0,
      Registrations: ofDepartment.length,
      CreditHours: sum(ofDepartment, (row) => row.course.CreditHours),
    });
  }
  answer.push({
    DepartmentCode: 'ALL DEPARTMENTS',
    StudentLevel: 0,
    Registrations: rows.length,
    CreditHours: sum(rows, (row) => row.course.CreditHours),
  });
  return answer;
}

function R1_7(params) {
  const term = semesterById.get(Number(params.SemesterId));
  const ofTerm = sections.filter((section) => section.SemesterId === term.SemesterId);
  const byCourse = groupBy(ofTerm, (section) => section.CourseId);
  const rows = [...byCourse.entries()].map(([courseId, list]) => {
    const course = courseById.get(Number(courseId));
    const offered = sum(list, (section) => section.Capacity);
    const taken = sum(list, (section) => enrollmentsOfSection(section.SectionId)
      .filter((row) => row.Status === 'Enrolled').length);
    return {
      CourseCode: course.Code,
      CourseTitle: course.Title,
      Sections: list.length,
      SeatsOffered: offered,
      SeatsTaken: taken,
      SeatsLeft: offered - taken,
      DemandPercent: offered ? round1((100 * taken) / offered) : null,
    };
  });
  return rows.sort((a, b) => (b.DemandPercent ?? -1) - (a.DemandPercent ?? -1) || a.CourseCode.localeCompare(b.CourseCode));
}

function R1_8() {
  const grouped = groupBy(sections, (section) => `${section.DayOfWeek}|${section.StartTime}|${section.EndTime}`);
  const rows = [...grouped.entries()].map(([key, list]) => {
    const [day, start, end] = key.split('|');
    return {
      DayOfWeek: Number(day),
      DayName: DAY_NAMES[Number(day) - 1],
      StartTime: start,
      EndTime: end,
      Sections: list.length,
      Students: sum(list, (section) => enrollmentsOfSection(section.SectionId).filter(notDropped).length),
    };
  });
  return rows.sort((a, b) => b.Students - a.Students || a.DayOfWeek - b.DayOfWeek
    || a.StartTime.localeCompare(b.StartTime));
}

function R1_9() {
  const byTerm = groupBy(payments, (row) => row.SemesterId);
  const rows = [...byTerm.entries()].map(([semesterId, list]) => {
    const count = (method) => list.filter((row) => row.Method === method).length;
    const dates = list.map((row) => row.PaidAt).sort();
    return {
      SemesterName: semesterById.get(Number(semesterId)).Name,
      Payments: list.length,
      CashCount: count('Cash'),
      CardCount: count('Card'),
      TransferCount: count('BankTransfer'),
      TotalCollected: round2(sum(list, (row) => row.Amount)),
      AveragePayment: round2(sum(list, (row) => row.Amount) / list.length),
      FirstPayment: dates[0] || null,
      LastPayment: dates[dates.length - 1] || null,
    };
  });
  return rows.sort((a, b) => a.SemesterName.localeCompare(b.SemesterName));
}

function R1_10() {
  const rows = [...students].map((student) => ({
    student,
    program: programById.get(student.ProgramId),
  }));
  return [...groupBy(rows, (row) => row.program.Name).entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, list]) => {
      const level = (n) => list.filter((row) => row.student.Level === n).length;
      return {
        ProgramName: name,
        Level1: level(1), Level2: level(2), Level3: level(3), Level4: level(4), Level5: level(5),
        StudentsTotal: list.length,
      };
    });
}

/* --------------------------------------------------------------------- detailed reports */

function R2_1(params) {
  const studentId = Number(params.StudentId);
  const rows = enrollmentsOfStudent(studentId).filter(notDropped);
  const gpa = new Map(gpaRows(studentId).map((row) => [row.SemesterId, row.SemesterGpa]));
  return rows.map((row) => ({
    SemesterName: row.semester.Name,
    CourseCode: row.course.Code,
    CourseTitle: row.course.Title,
    CreditHours: row.course.CreditHours,
    Score: row.Score,
    LetterGrade: row.LetterGrade,
    GradePoints: row.GradePoints,
    InstructorName: row.instructorName,
    SemesterGpaRun: row.GradePublished === 1 ? gpa.get(row.semester.SemesterId) ?? null : null,
  }));
}

function R2_2(params) {
  const roster = [...enrollmentsOfSection(Number(params.SectionId))]
    .sort((a, b) => String(a.studentUser.FullName).localeCompare(String(b.studentUser.FullName)));
  return roster.map((row) => {
    const list = attendanceOfRow(row);
    const count = (status) => list.filter((entry) => entry.Status === status).length;
    return {
      StudentNumber: row.student.StudentNumber,
      FullName: row.studentUser.FullName,
      Level: row.student.Level,
      ProgramName: row.program.Name,
      Email: row.studentUser.Email,
      LastLoginAt: row.studentUser.LastLoginAt,
      Status: row.Status,
      Score: row.Score,
      LetterGrade: row.LetterGrade,
      GradePublished: row.GradePublished,
      Sessions: list.length,
      Present: count('Present'),
      Absent: count('Absent'),
      Excused: count('Excused'),
    };
  });
}

function attendanceOfRow(enrollment) {
  return attendance.filter((row) => row.EnrollmentId === enrollment.EnrollmentId);
}

function R2_3(params) {
  const term = semesterById.get(Number(params.SemesterId));
  const list = payments
    .filter((row) => row.SemesterId === term.SemesterId)
    .sort((a, b) => a.PaidAt.localeCompare(b.PaidAt) || a.PaymentId - b.PaymentId);
  const running = new Map();
  return list.map((row) => {
    const day = String(row.PaidAt).slice(0, 10);
    const total = round2((running.get(day) || 0) + Number(row.Amount));
    running.set(day, total);
    const student = studentById.get(row.StudentId);
    return {
      PaymentId: row.PaymentId,
      PaidAt: row.PaidAt,
      ReceiptNumber: row.ReceiptNumber,
      Method: row.Method,
      StudentNumber: student.StudentNumber,
      StudentName: fullNameOf(row.StudentId),
      Amount: row.Amount,
      DayRunningTotal: total,
      RecordedBy: fullNameOf(row.RecordedByAdminId),
    };
  });
}

function R2_4(params) {
  const term = semesterById.get(Number(params.SemesterId));
  const fees = groupBy(
    enrollments.filter((row) => row.semester.SemesterId === term.SemesterId && registered(row)),
    (row) => row.StudentId,
  );
  const paid = groupBy(
    payments.filter((row) => row.SemesterId === term.SemesterId),
    (row) => row.StudentId,
  );
  const rows = [];
  for (const [studentId, list] of fees) {
    const student = studentById.get(studentId);
    const user = userById.get(studentId);
    const credits = sum(list, (row) => row.course.CreditHours);
    const fee = Number(programById.get(student.ProgramId).FeePerCreditHour);
    const paidSoFar = sum(paid.get(studentId) || [], (row) => row.Amount);
    const balance = round2(credits * fee - paidSoFar);
    if (balance === 0) continue;
    rows.push({
      StudentNumber: student.StudentNumber,
      FullName: user.FullName,
      ProgramName: programById.get(student.ProgramId).Name,
      CreditHours: credits,
      FeePerCreditHour: fee,
      FeesDue: round2(credits * fee),
      PaidSoFar: round2(paidSoFar),
      Balance: balance,
    });
  }
  return rows.sort((a, b) => b.Balance - a.Balance);
}

function R2_5(params) {
  const studentId = Number(params.StudentId);
  const student = studentById.get(studentId);
  const fee = Number(programById.get(student.ProgramId).FeePerCreditHour);
  const rows = enrollmentsOfStudent(studentId).filter(registered);
  const byTerm = groupBy(rows, (row) => row.semester.SemesterId);
  return semestersNewestFirst()
    .filter((semester) => byTerm.has(semester.SemesterId))
    .sort((a, b) => a.StartDate.localeCompare(b.StartDate))
    .map((semester) => {
      const charges = round2(sum(byTerm.get(semester.SemesterId), (row) => row.course.CreditHours) * fee);
      const paid = round2(sum(payments.filter((row) => row.StudentId === studentId
        && row.SemesterId === semester.SemesterId), (row) => row.Amount));
      return {
        SemesterName: semester.Name,
        Charges: charges,
        Payments: paid,
        BalanceOfSemester: round2(charges - paid),
      };
    });
}

function R2_6(params) {
  const term = semesterById.get(Number(params.SemesterId));
  const rows = [];
  for (const row of enrollments) {
    if (row.Status !== 'Enrolled' || row.semester.SemesterId !== term.SemesterId) continue;
    for (const link of prerequisites.filter((item) => item.CourseId === row.course.CourseId)) {
      const passed = enrollmentsOfStudent(row.StudentId).some((other) => other.course.CourseId === link.PrerequisiteCourseId
        && other.GradePublished === 1 && Number(other.Score) >= 60);
      if (!passed) {
        rows.push({
          StudentNumber: row.studentUser.StudentNumber,
          StudentName: row.studentUser.FullName,
          CourseCode: row.course.Code,
          MissingPrerequisite: courseById.get(link.PrerequisiteCourseId).Code,
        });
      }
    }
  }
  return rows.sort((a, b) => a.StudentNumber.localeCompare(b.StudentNumber) || a.CourseCode.localeCompare(b.CourseCode));
}

function R2_7(params) {
  const term = semesterById.get(Number(params.SemesterId));
  return [...instructors]
    .map((instructor) => {
      const user = userById.get(instructor.UserId);
      const list = sections.filter((section) => section.InstructorId === instructor.UserId
        && section.SemesterId === term.SemesterId);
      const students = sum(list, (section) => enrollmentsOfSection(section.SectionId).filter(notDropped).length);
      const taught = new Set(list.map((section) => section.CourseId)).size;
      return {
        InstructorName: user.FullName,
        Title: instructor.Title,
        DepartmentCode: departments.find((d) => d.DepartmentId === instructor.DepartmentId).Code,
        Sections: list.length,
        Students: students,
        CoursesTaught: taught,
        LoadBand: list.length > 3 ? 'Heavy load' : list.length === 0 ? 'No section' : 'Normal',
      };
    })
    .sort((a, b) => b.Students - a.Students);
}

function R2_8(params) {
  const term = semesterById.get(Number(params.SemesterId));
  return [...rooms]
    .map((room) => {
      const list = sections.filter((section) => section.RoomId === room.RoomId
        && section.SemesterId === term.SemesterId);
      const seated = sum(list, (section) => enrollmentsOfSection(section.SectionId).filter(notDropped).length);
      const offered = Number(room.Capacity) * list.length;
      return {
        Building: room.Building,
        RoomNumber: room.RoomNumber,
        RoomType: room.RoomType,
        Capacity: room.Capacity,
        Sections: list.length,
        StudentsSeated: seated,
        SeatUsePercent: offered ? round1((100 * seated) / offered) : null,
      };
    })
    .sort((a, b) => b.Sections - a.Sections || a.Building.localeCompare(b.Building)
      || a.RoomNumber.localeCompare(b.RoomNumber));
}

function R2_9() {
  return [...announcements]
    .sort((a, b) => b.IsPinned - a.IsPinned || b.PostedAt.localeCompare(a.PostedAt))
    .map((row) => {
      const author = userById.get(row.AuthorId);
      const section = row.SectionId ? sectionById.get(row.SectionId) : null;
      return {
        PostedAt: row.PostedAt,
        IsPinned: row.IsPinned,
        Title: row.Title,
        AuthorName: author.FullName,
        AuthorRole: author.Role,
        Scope: section ? `${courseById.get(section.CourseId).Code} ${section.SectionCode}` : 'Everybody',
        AudienceSize: section
          ? enrollmentsOfSection(section.SectionId).filter((entry) => entry.Status === 'Enrolled').length
          : students.length,
      };
    });
}

function R2_10(params) {
  const instructorId = Number(params.InstructorId);
  return sections
    .filter((section) => section.InstructorId === instructorId)
    .map((section) => {
      const list = enrollmentsOfSection(section.SectionId).filter(notDropped);
      const scores = list.filter((row) => row.GradePublished === 1 && row.Score !== null).map((row) => Number(row.Score));
      return {
        SemesterName: semesterById.get(section.SemesterId).Name,
        CourseCode: courseById.get(section.CourseId).Code,
        SectionCode: section.SectionCode,
        Capacity: section.Capacity,
        Registered: list.length,
        AverageScore: scores.length ? round2(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
        Lowest: scores.length ? Math.min(...scores) : null,
        Highest: scores.length ? Math.max(...scores) : null,
      };
    })
    .sort((a, b) => b.SemesterName.localeCompare(a.SemesterName) || a.CourseCode.localeCompare(b.CourseCode));
}

/* ------------------------------------------------------------------- managerial reports */

function R3_1(params) {
  const term = semesterById.get(Number(params.SemesterId));
  const ofTerm = enrollments.filter((row) => row.semester.SemesterId === term.SemesterId);
  const limit = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  return [{
    ActiveStudents: users.filter((user) => user.Role === 'Student' && user.IsActive === 1).length,
    ActiveInstructors: users.filter((user) => user.Role === 'Instructor' && user.IsActive === 1).length,
    SectionsThisTerm: sections.filter((section) => section.SemesterId === term.SemesterId).length,
    RegistrationsThisTerm: ofTerm.filter((row) => row.Status === 'Enrolled').length,
    CollectedAllTime: round2(sum(payments, (row) => row.Amount)),
    InstructorsWaiting: users.filter((user) => user.Role === 'Instructor' && user.IsActive === 0).length,
    FullSections: sections
      .filter((section) => section.SemesterId === term.SemesterId)
      .map(fillOf).filter((row) => row.Enrolled >= row.Capacity).length,
    Announcements30Days: announcements.filter((row) => new Date(row.PostedAt) >= limit).length,
  }];
}

function R3_2() {
  return semestersNewestFirst().map((semester) => {
    const ofTerm = enrollments.filter((row) => row.semester.SemesterId === semester.SemesterId);
    const registered = ofTerm.filter((row) => row.Status === 'Enrolled');
    const kept = ofTerm.filter(notDropped);
    const gpas = students
      .flatMap((student) => gpaRows(student.UserId).filter((row) => row.SemesterId === semester.SemesterId))
      .map((row) => Number(row.SemesterGpa));
    return {
      SemesterName: semester.Name,
      StartDate: semester.StartDate,
      EndDate: semester.EndDate,
      RegistrationState: semester.RegistrationOpen === 1 ? 'Open' : 'Closed',
      Sections: sections.filter((section) => section.SemesterId === semester.SemesterId).length,
      Registrations: registered.length,
      CreditHours: sum(kept, (row) => row.course.CreditHours),
      AverageGpa: gpas.length ? round2(gpas.reduce((a, b) => a + b, 0) / gpas.length) : null,
      Collected: round2(sum(payments.filter((row) => row.SemesterId === semester.SemesterId), (row) => row.Amount)),
    };
  });
}

function programMoney() {
  const charged = new Map();
  const collected = new Map();
  for (const student of students) {
    const fee = Number(programById.get(student.ProgramId).FeePerCreditHour);
    const credits = sum(enrollmentsOfStudent(student.UserId).filter(registered), (row) => row.course.CreditHours);
    const paid = sum(payments.filter((row) => row.StudentId === student.UserId), (row) => row.Amount);
    charged.set(student.ProgramId, round2((charged.get(student.ProgramId) || 0) + credits * fee));
    collected.set(student.ProgramId, round2((collected.get(student.ProgramId) || 0) + paid));
  }
  return { charged, collected };
}

function R3_3() {
  const { charged, collected } = programMoney();
  return [...programs].map((program) => {
    const list = students.filter((student) => student.ProgramId === program.ProgramId);
    const gpas = list.map((student) => totalsOf(student.UserId))
      .filter((row) => row.CumulativeGpa !== null).map((row) => Number(row.CumulativeGpa));
    const billed = charged.get(program.ProgramId) || 0;
    const paid = collected.get(program.ProgramId) || 0;
    return {
      ProgramName: program.Name,
      DepartmentCode: departments.find((d) => d.DepartmentId === program.DepartmentId).Code,
      TotalCreditHours: program.TotalCreditHours,
      FeePerCreditHour: program.FeePerCreditHour,
      Students: list.length,
      AverageGpa: gpas.length ? round2(gpas.reduce((a, b) => a + b, 0) / gpas.length) : null,
      CreditsPassed: sum(list, (student) => totalsOf(student.UserId).PassedCreditHours),
      BilledAmount: billed,
      CollectedAmount: paid,
      CollectionRate: billed ? round1((100 * paid) / billed) : null,
    };
  }).sort((a, b) => (b.AverageGpa ?? -1) - (a.AverageGpa ?? -1) || a.ProgramName.localeCompare(b.ProgramName));
}

function R3_4(params) {
  const term = semesterById.get(Number(params.SemesterId));
  const rows = [];
  for (const student of students) {
    const user = userById.get(student.UserId);
    const totals = totalsOf(student.UserId);
    const published = enrollmentsOfStudent(student.UserId).filter((row) => row.GradePublished === 1 && notDropped(row));
    if (!published.length) continue;

    const ofTerm = enrollmentsOfStudent(student.UserId)
      .filter((row) => row.Status === 'Enrolled' && row.semester.SemesterId === term.SemesterId);
    const attendanceRows = ofTerm.flatMap(attendanceOfRow);
    const rate = attendanceRows.length
      ? round1((100 * attendanceRows.filter((row) => row.Status === 'Present' || row.Status === 'Excused').length)
        / attendanceRows.length)
      : null;

    const reasons = [];
    if (totals.CumulativeGpa !== null && totals.CumulativeGpa < 2.0) reasons.push('low GPA');
    if (rate !== null && rate < 75) reasons.push('attendance under 75%');
    if (totals.FailedCourses > 0) reasons.push('failed course');
    if (!reasons.length) continue;

    const advisor = instructorById.get(student.AdvisorId);
    rows.push({
      StudentNumber: student.StudentNumber,
      FullName: user.FullName,
      ProgramName: programById.get(student.ProgramId).Name,
      Level: student.Level,
      AdvisorTitle: advisor?.Title || null,
      AdvisorName: advisor ? fullNameOf(advisor.UserId) : null,
      CumulativeGpa: totals.CumulativeGpa,
      FailedCourses: totals.FailedCourses,
      AttendanceRate: rate,
      Reason: reasons.join(', '),
    });
  }
  return rows.sort((a, b) => (a.CumulativeGpa ?? 0) - (b.CumulativeGpa ?? 0)
    || a.StudentNumber.localeCompare(b.StudentNumber));
}

function R3_5() {
  const totals = students
    .map((student) => ({ student, user: userById.get(student.UserId), totals: totalsOf(student.UserId) }))
    .filter((row) => row.totals.GradedCreditHours >= 12 && row.totals.CumulativeGpa !== null
      && row.totals.CumulativeGpa >= 3.60);
  const overall = [...totals].sort((a, b) => b.totals.CumulativeGpa - a.totals.CumulativeGpa);
  return overall.map((row, index, list) => {
    const sameProgram = list.filter((other) => other.student.ProgramId === row.student.ProgramId);
    return {
      StudentNumber: row.student.StudentNumber,
      FullName: row.user.FullName,
      ProgramName: programById.get(row.student.ProgramId).Name,
      GradedCredits: row.totals.GradedCreditHours,
      CumulativeGpa: row.totals.CumulativeGpa,
      RankOverall: 1 + list.filter((other) => other.totals.CumulativeGpa > row.totals.CumulativeGpa).length,
      RankInProgram: 1 + sameProgram.filter((other) => other.totals.CumulativeGpa > row.totals.CumulativeGpa).length,
    };
  });
}

function R3_6(params) {
  const term = semesterById.get(Number(params.SemesterId));
  const limit = new Date(Date.now() - 60 * 24 * 3600 * 1000);
  return students
    .map((student) => ({ student, user: userById.get(student.UserId) }))
    .filter(({ student, user }) => user.IsActive === 1
      && !enrollmentsOfStudent(student.UserId).some((row) => row.Status === 'Enrolled'
        && row.semester.SemesterId === term.SemesterId))
    .map(({ student, user }) => ({
      StudentNumber: student.StudentNumber,
      FullName: user.FullName,
      ProgramName: programById.get(student.ProgramId).Name,
      Level: student.Level,
      LastLoginAt: user.LastLoginAt,
      Note: !user.LastLoginAt ? 'Never signed in'
        : new Date(user.LastLoginAt) < limit ? 'Not signed in for 60 days' : 'Active account, no registration',
      PaidInTotal: round2(sum(payments.filter((row) => row.StudentId === student.UserId), (row) => row.Amount)),
    }))
    .sort((a, b) => a.FullName.localeCompare(b.FullName));
}

function R3_7() {
  const { charged, collected } = programMoney();
  const rows = programs.map((program) => {
    const chargedAmount = charged.get(program.ProgramId) || 0;
    const paid = collected.get(program.ProgramId) || 0;
    return {
      ProgramName: program.Name,
      Charged: chargedAmount,
      Collected: paid,
      Outstanding: round2(chargedAmount - paid),
      CollectionRate: chargedAmount ? round1((100 * paid) / chargedAmount) : null,
    };
  });
  const totalCharged = round2(sum(rows, (row) => row.Charged));
  const totalPaid = round2(sum(rows, (row) => row.Collected));
  rows.push({
    ProgramName: 'ALL PROGRAMS',
    Charged: totalCharged,
    Collected: totalPaid,
    Outstanding: round2(totalCharged - totalPaid),
    CollectionRate: totalCharged ? round1((100 * totalPaid) / totalCharged) : null,
  });
  return rows.sort((a, b) => (b.CollectionRate ?? -1) - (a.CollectionRate ?? -1));
}

function R3_8() {
  return departments.map((department) => {
    const list = courses.filter((course) => course.DepartmentId === department.DepartmentId);
    const hosted = sections.filter((section) => list.some((course) => course.CourseId === section.CourseId));
    const registered = enrollments.filter((row) => notDropped(row)
      && list.some((course) => course.CourseId === row.course.CourseId));
    const head = department.HeadInstructorId ? instructorById.get(department.HeadInstructorId) : null;
    return {
      DepartmentCode: department.Code,
      DepartmentName: department.Name,
      HeadOfDepartment: head ? fullNameOf(head.UserId) : 'not assigned',
      Courses: list.length,
      SectionsEver: hosted.length,
      RegistrationsEver: registered.length,
      CoursesNeverOpened: list.filter((course) => !sections.some((section) => section.CourseId === course.CourseId)).length,
    };
  }).sort((a, b) => b.RegistrationsEver - a.RegistrationsEver || a.DepartmentCode.localeCompare(b.DepartmentCode));
}

/* --------------------------------------------------------------------------- the runner */

const RUNNERS = {
  'R1.1': R1_1, 'R1.2': R1_2, 'R1.3': R1_3, 'R1.4': R1_4, 'R1.5': R1_5, 'R1.6': R1_6,
  'R1.7': R1_7, 'R1.8': R1_8, 'R1.9': R1_9, 'R1.10': R1_10,
  'R2.1': R2_1, 'R2.2': R2_2, 'R2.3': R2_3, 'R2.4': R2_4, 'R2.5': R2_5, 'R2.6': R2_6,
  'R2.7': R2_7, 'R2.8': R2_8, 'R2.9': R2_9, 'R2.10': R2_10,
  'R3.1': R3_1, 'R3.2': R3_2, 'R3.3': R3_3, 'R3.4': R3_4, 'R3.5': R3_5, 'R3.6': R3_6,
  'R3.7': R3_7, 'R3.8': R3_8,
};

export class MockReportError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const roleOf = (who) => (typeof who === 'string' ? who : who?.role);

export const reportKeysFor = (who) => (roleOf(who) === 'Instructor'
  ? Object.keys(REPORT_META).filter((key) => INSTRUCTOR_REPORTS.includes(key))
  : Object.keys(REPORT_META));

export function catalogue(who) {
  const role = roleOf(who);
  const keys = reportKeysFor(role);
  const reports = keys.map((key) => ({
    key,
    title: REPORT_META[key].title,
    category: REPORT_META[key].category,
    description: REPORT_META[key].description,
    params: REPORT_META[key].params,
  }));
  return { reports, categories: [...new Set(reports.map((report) => report.category))] };
}

/** the footer of a report: the sum of every numeric column, exactly like the API does it */
function totalsOfRows(rows) {
  if (!rows.length) return null;
  const totals = {};
  for (const [key, value] of Object.entries(rows[0])) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      totals[key] = round2(rows.reduce((sum, row) => sum + (Number(row[key]) || 0), 0));
    }
  }
  return Object.keys(totals).length ? totals : null;
}

export function runReport(key, raw, session) {
  const meta = REPORT_META[key];
  if (!meta) throw new MockReportError('unknown_report', `There is no report with the key ${key}.`);
  if (!reportKeysFor(session).includes(key)) {
    throw new MockReportError('report_forbidden', 'Your account is not allowed to run this report.');
  }

  const params = {};
  for (const param of meta.params) {
    const given = raw?.[param.name];
    if (given === undefined || given === null || given === '') {
      if (param.defaultTo === 'openSemester') {
        const term = openSemester();
        if (!term) throw new MockReportError('no_open_semester', 'There is no open semester, so this report has no term to work on.');
        params[param.name] = term.SemesterId;
        continue;
      }
      if (param.required) {
        throw new MockReportError('missing_parameter', `The report "${meta.title}" needs ${param.label.toLowerCase()}.`);
      }
      params[param.name] = null;
      continue;
    }
    const id = Number.parseInt(given, 10);
    if (!Number.isInteger(id) || id <= 0) {
      throw new MockReportError('bad_parameter', `${param.label} is not a valid identifier.`);
    }
    params[param.name] = id;
  }

  if (session.role === 'Instructor') {
    // a teacher only looks at their own sections, and never at a transcript
    if (meta.params.some((param) => param.kind === 'student')) {
      throw new MockReportError('not_allowed', 'Transcripts of students belong to the student office.');
    }
    for (const param of meta.params) {
      if (param.kind === 'instructor') params[param.name] = session.userId;
    }
    if (params.SectionId) {
      const section = sectionById.get(Number(params.SectionId));
      if (!section || section.InstructorId !== session.userId) {
        throw new MockReportError('not_your_section', 'That section is not one of your sections.');
      }
    }
  }

  const rows = RUNNERS[key](params);
  return {
    key,
    title: meta.title,
    category: meta.category,
    description: meta.description,
    params: meta.params,
    usedParams: params,
    labels: meta.labels || {},
    columns: rows.length ? Object.keys(rows[0]) : meta.columns,
    rows,
    rowCount: rows.length,
    totals: totalsOfRows(rows),
  };
}

export default { catalogue, runReport, reportKeysFor, MockReportError };
