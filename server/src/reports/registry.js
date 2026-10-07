/**
 * The report registry.
 *
 * Every report of database/04_reports.sql appears here under the same number, so the report
 * page, the SQL file and the written report of the project all speak about the same thing.
 * A report declares:
 *   number      - R1.x statistical, R2.x detailed, R3.x managerial (the division the course asks for)
 *   title       - what the screen shows
 *   category    - the group of the list on the left of the report page
 *   description - one sentence for the person who runs it
 *   params      - the inputs; kind decides which dropdown the client fills
 *   sql         - one statement, with bound parameters only
 *   labels      - nicer column headers for the screen (optional)
 *
 * The client never sends SQL: it sends the key of a report and the values of its parameters,
 * and the API binds those values (the class ReportService below). That is the difference
 * between "the application uses the database" and "the application is a database console".
 */

export const REPORT_CATEGORIES = [
  { key: 'Statistical', title: 'Statistical reports', hint: 'Counts, averages, distributions and rates.' },
  { key: 'Detailed', title: 'Detailed reports', hint: 'Everything about one student, one section, one term or one room.' },
  { key: 'Managerial', title: 'Managerial reports', hint: 'The overview the head of the office reads, with trends and risks.' },
];

const SEMESTER_PARAM = {
  // not required: when the office does not choose a term, the open one is used
  name: 'SemesterId', label: 'Semester', kind: 'semester', defaultTo: 'openSemester',
};
const STUDENT_PARAM = { name: 'StudentId', label: 'Student', kind: 'student', required: true };
const SECTION_PARAM = { name: 'SectionId', label: 'Section', kind: 'section', required: true };

export const REPORTS = {
  /* ---------------------------------------------------------------- statistical */
  'R1.1': {
    number: 'R1.1',
    title: 'Registrations per program and semester',
    category: 'Statistical',
    description: 'One row per program with the number of registrations in each of the three terms of the sample data.',
    params: [],
    sql: `
SELECT  p.Name                                                       AS ProgramName,
        d.Code                                                       AS DepartmentCode,
        SUM(CASE WHEN sem.Name = 'Fall 2025'   THEN 1 ELSE 0 END)     AS Fall2025,
        SUM(CASE WHEN sem.Name = 'Spring 2026' THEN 1 ELSE 0 END)     AS Spring2026,
        SUM(CASE WHEN sem.Name = 'Fall 2026'   THEN 1 ELSE 0 END)     AS Fall2026,
        COUNT(*)                                                     AS RegistrationsTotal
FROM        dbo.Enrollment e
JOIN        dbo.Section  sec ON sec.SectionId = e.SectionId
JOIN        dbo.Semester sem ON sem.SemesterId = sec.SemesterId
JOIN        dbo.Student  st  ON st.UserId     = e.StudentId
JOIN        dbo.Program  p   ON p.ProgramId   = st.ProgramId
JOIN        dbo.Department d ON d.DepartmentId = p.DepartmentId
WHERE       e.Status <> 'Dropped'
GROUP BY    p.Name, d.Code
ORDER BY    p.Name;`,
  },

  'R1.2': {
    number: 'R1.2',
    title: 'Grade distribution of every section',
    category: 'Statistical',
    description: 'How many students got each letter of the grade scale, with the average and the pass rate.',
    params: [],
    labels: { AMinus: 'A-', BPlus: 'B+', BMinus: 'B-', CPlus: 'C+', CMinus: 'C-', DPlus: 'D+', PassRate: 'Pass rate %' },
    sql: `
SELECT  sem.Name                                                     AS SemesterName,
        c.Code                                                       AS CourseCode,
        sec.SectionCode,
        COUNT(*)                                                     AS Graded,
        CAST(AVG(e.Score) AS DECIMAL(5,2))                            AS Average,
        SUM(CASE WHEN e.LetterGrade = 'A'  THEN 1 ELSE 0 END)        AS A,
        SUM(CASE WHEN e.LetterGrade = 'A-' THEN 1 ELSE 0 END)        AS AMinus,
        SUM(CASE WHEN e.LetterGrade = 'B+' THEN 1 ELSE 0 END)        AS BPlus,
        SUM(CASE WHEN e.LetterGrade = 'B'  THEN 1 ELSE 0 END)        AS B,
        SUM(CASE WHEN e.LetterGrade = 'B-' THEN 1 ELSE 0 END)        AS BMinus,
        SUM(CASE WHEN e.LetterGrade = 'C+' THEN 1 ELSE 0 END)        AS CPlus,
        SUM(CASE WHEN e.LetterGrade = 'C'  THEN 1 ELSE 0 END)        AS C,
        SUM(CASE WHEN e.LetterGrade = 'C-' THEN 1 ELSE 0 END)        AS CMinus,
        SUM(CASE WHEN e.LetterGrade = 'D+' THEN 1 ELSE 0 END)        AS DPlus,
        SUM(CASE WHEN e.LetterGrade = 'D'  THEN 1 ELSE 0 END)        AS D,
        SUM(CASE WHEN e.LetterGrade = 'F'  THEN 1 ELSE 0 END)        AS F,
        CAST(100.0 * SUM(CASE WHEN e.Score >= 60 THEN 1 ELSE 0 END)
             / NULLIF(COUNT(*), 0) AS DECIMAL(5,1))                  AS PassRate
FROM        dbo.Enrollment e
JOIN        dbo.Section  sec ON sec.SectionId = e.SectionId
JOIN        dbo.Semester sem ON sem.SemesterId = sec.SemesterId
JOIN        dbo.Course   c   ON c.CourseId    = sec.CourseId
WHERE       e.GradePublished = 1
  AND       e.Status <> 'Dropped'
GROUP BY    sem.Name, c.Code, sec.SectionCode
ORDER BY    sem.Name DESC, c.Code, sec.SectionCode;`,
  },

  'R1.3': {
    number: 'R1.3',
    title: 'Section fill rate',
    category: 'Statistical',
    description: 'Seats, registrations and the band the office uses, from the view vw_SectionFill.',
    params: [SEMESTER_PARAM],
    labels: { FillPercent: 'Fill %' },
    sql: `
SELECT  f.CourseCode, f.CourseTitle, f.SectionCode, f.InstructorName, f.RoomName,
        f.Capacity, f.Enrolled, f.FillPercent,
        CASE WHEN f.FillPercent >= 100 THEN 'Full'
             WHEN f.FillPercent >= 80  THEN 'Almost full'
             WHEN f.FillPercent >= 50  THEN 'Half'
             ELSE 'Plenty of seats' END                              AS FillBand
FROM    dbo.vw_SectionFill f
WHERE   f.SemesterId = @SemesterId
ORDER BY f.FillPercent DESC, f.CourseCode;`,
  },

  'R1.4': {
    number: 'R1.4',
    title: 'Attendance statistics per section',
    category: 'Statistical',
    description: 'Sessions recorded, present, absent and excused rows and the present rate of every section.',
    params: [],
    labels: { SessionsRecorded: 'Sessions', AttendanceRows: 'Rows', PresentRows: 'Present', AbsentRows: 'Absent', ExcusedRows: 'Excused', PresentRate: 'Present %' },
    sql: `
SELECT  sem.Name                                                     AS SemesterName,
        c.Code                                                       AS CourseCode,
        sec.SectionCode,
        u.FullName                                                   AS InstructorName,
        COUNT(DISTINCT a.SessionDate)                                AS SessionsRecorded,
        COUNT(*)                                                     AS AttendanceRows,
        SUM(CASE WHEN a.Status = 'Present' THEN 1 ELSE 0 END)        AS PresentRows,
        SUM(CASE WHEN a.Status = 'Absent'  THEN 1 ELSE 0 END)        AS AbsentRows,
        SUM(CASE WHEN a.Status = 'Excused' THEN 1 ELSE 0 END)        AS ExcusedRows,
        CAST(100.0 * SUM(CASE WHEN a.Status = 'Present' THEN 1 ELSE 0 END)
             / NULLIF(COUNT(*), 0) AS DECIMAL(5,1))                  AS PresentRate
FROM        dbo.Attendance a
JOIN        dbo.Enrollment e   ON e.EnrollmentId = a.EnrollmentId
JOIN        dbo.Section    sec ON sec.SectionId  = e.SectionId
JOIN        dbo.Semester   sem ON sem.SemesterId = sec.SemesterId
JOIN        dbo.Course     c   ON c.CourseId     = sec.CourseId
JOIN        dbo.AppUser    u   ON u.UserId       = sec.InstructorId
GROUP BY    sem.Name, c.Code, sec.SectionCode, u.FullName
HAVING      COUNT(*) >= 5
ORDER BY    PresentRate, c.Code;`,
  },

  'R1.5': {
    number: 'R1.5',
    title: 'The heaviest terms of the students',
    category: 'Statistical',
    description: 'The twenty students with the most credit hours in the chosen semester.',
    params: [SEMESTER_PARAM],
    labels: { CoursesCount: 'Courses', CreditHours: 'Credits', AveragedScore: 'Average score' },
    sql: `
SELECT  TOP 20
        st.StudentNumber, u.FullName, p.Name AS ProgramName, st.Level,
        COUNT(*)                                                     AS CoursesCount,
        SUM(c.CreditHours)                                           AS CreditHours,
        CAST(AVG(CASE WHEN e.GradePublished = 1 THEN e.Score END)
             AS DECIMAL(5,2))                                        AS AveragedScore
FROM        dbo.Enrollment e
JOIN        dbo.Section  sec ON sec.SectionId = e.SectionId
JOIN        dbo.Course   c   ON c.CourseId    = sec.CourseId
JOIN        dbo.Student  st  ON st.UserId     = e.StudentId
JOIN        dbo.AppUser  u   ON u.UserId      = st.UserId
JOIN        dbo.Program  p   ON p.ProgramId   = st.ProgramId
WHERE       sec.SemesterId = @SemesterId
  AND       e.Status = 'Enrolled'
GROUP BY    st.StudentNumber, u.FullName, p.Name, st.Level
ORDER BY    SUM(c.CreditHours) DESC, u.FullName;`,
  },

  'R1.6': {
    number: 'R1.6',
    title: 'Registrations per department and level',
    category: 'Statistical',
    description: 'The same data with a subtotal per department, produced with ROLLUP and GROUPING.',
    params: [],
    sql: `
SELECT  CASE WHEN GROUPING(d.Code) = 1 THEN 'ALL DEPARTMENTS' ELSE d.Code END AS DepartmentCode,
        CASE WHEN GROUPING(st.Level) = 1 THEN 0 ELSE st.Level END              AS StudentLevel,
        COUNT(*)                                                               AS Registrations,
        SUM(c.CreditHours)                                                     AS CreditHours
FROM        dbo.Enrollment e
JOIN        dbo.Section  sec ON sec.SectionId = e.SectionId
JOIN        dbo.Course   c   ON c.CourseId    = sec.CourseId
JOIN        dbo.Department d ON d.DepartmentId = c.DepartmentId
JOIN        dbo.Student  st  ON st.UserId     = e.StudentId
WHERE       e.Status <> 'Dropped'
GROUP BY ROLLUP (d.Code, st.Level)
ORDER BY    DepartmentCode, StudentLevel;`,
  },

  'R1.7': {
    number: 'R1.7',
    title: 'Demand per course',
    category: 'Statistical',
    description: 'Seats offered against seats taken in a semester, with the demand percentage.',
    params: [SEMESTER_PARAM],
    labels: { SeatsOffered: 'Seats offered', SeatsTaken: 'Seats taken', SeatsLeft: 'Seats left', DemandPercent: 'Demand %' },
    sql: `
WITH SectionSeats AS (
    SELECT  sec.SectionId, sec.CourseId, sec.Capacity,
            (SELECT COUNT(*) FROM dbo.Enrollment e
              WHERE e.SectionId = sec.SectionId AND e.Status = 'Enrolled') AS Taken
    FROM    dbo.Section sec
    WHERE   sec.SemesterId = @SemesterId
)
SELECT  c.Code                                                       AS CourseCode,
        c.Title                                                      AS CourseTitle,
        COUNT(*)                                                     AS Sections,
        SUM(s.Capacity)                                              AS SeatsOffered,
        SUM(s.Taken)                                                 AS SeatsTaken,
        SUM(s.Capacity) - SUM(s.Taken)                               AS SeatsLeft,
        CAST(100.0 * SUM(s.Taken) / NULLIF(SUM(s.Capacity), 0) AS DECIMAL(5,1)) AS DemandPercent
FROM        SectionSeats s
JOIN        dbo.Course   c ON c.CourseId = s.CourseId
GROUP BY    c.Code, c.Title
ORDER BY    DemandPercent DESC, c.Code;`,
  },

  'R1.8': {
    number: 'R1.8',
    title: 'The busiest days and hours',
    category: 'Statistical',
    description: 'Which weekly slots carry the most sections and students, so a new section can be placed well.',
    params: [],
    labels: { DayOfWeek: 'Day #', DayName: 'Day', StartTime: 'Start', EndTime: 'End' },
    sql: `
SELECT  sec.DayOfWeek,
        CASE sec.DayOfWeek WHEN 1 THEN 'Saturday' WHEN 2 THEN 'Sunday'   WHEN 3 THEN 'Monday'
                           WHEN 4 THEN 'Tuesday'  WHEN 5 THEN 'Wednesday' WHEN 6 THEN 'Thursday'
                           ELSE 'Friday' END                         AS DayName,
        sec.StartTime, sec.EndTime,
        COUNT(DISTINCT sec.SectionId)                                AS Sections,
        COUNT(e.EnrollmentId)                                        AS Students
FROM        dbo.Section sec
LEFT JOIN   dbo.Enrollment e ON e.SectionId = sec.SectionId AND e.Status <> 'Dropped'
GROUP BY    sec.DayOfWeek, sec.StartTime, sec.EndTime
ORDER BY    COUNT(e.EnrollmentId) DESC, sec.DayOfWeek, sec.StartTime;`,
  },

  'R1.9': {
    number: 'R1.9',
    title: 'Payments per method and semester',
    category: 'Statistical',
    description: 'How the money arrived: cash, card or bank transfer, with the totals and the averages.',
    params: [],
    labels: { CashCount: 'Cash', CardCount: 'Card', TransferCount: 'Transfer', TotalCollected: 'Total collected', AveragePayment: 'Average payment' },
    sql: `
SELECT  sem.Name                                                     AS SemesterName,
        COUNT(*)                                                     AS Payments,
        SUM(CASE WHEN p.Method = 'Cash'         THEN 1 ELSE 0 END)   AS CashCount,
        SUM(CASE WHEN p.Method = 'Card'         THEN 1 ELSE 0 END)   AS CardCount,
        SUM(CASE WHEN p.Method = 'BankTransfer' THEN 1 ELSE 0 END)   AS TransferCount,
        CAST(SUM(p.Amount) AS DECIMAL(12,2))                         AS TotalCollected,
        CAST(AVG(p.Amount) AS DECIMAL(10,2))                         AS AveragePayment,
        MIN(p.PaidAt)                                                AS FirstPayment,
        MAX(p.PaidAt)                                                AS LastPayment
FROM        dbo.Payment  p
JOIN        dbo.Semester sem ON sem.SemesterId = p.SemesterId
GROUP BY    sem.Name
ORDER BY    sem.Name;`,
  },

  'R1.10': {
    number: 'R1.10',
    title: 'Students of every program at every level',
    category: 'Statistical',
    description: 'The spread of the students over the five levels of a program.',
    params: [],
    labels: { StudentsTotal: 'Total' },
    sql: `
SELECT  p.Name                                                       AS ProgramName,
        SUM(CASE WHEN st.Level = 1 THEN 1 ELSE 0 END)                AS Level1,
        SUM(CASE WHEN st.Level = 2 THEN 1 ELSE 0 END)                AS Level2,
        SUM(CASE WHEN st.Level = 3 THEN 1 ELSE 0 END)                AS Level3,
        SUM(CASE WHEN st.Level = 4 THEN 1 ELSE 0 END)                AS Level4,
        SUM(CASE WHEN st.Level = 5 THEN 1 ELSE 0 END)                AS Level5,
        COUNT(*)                                                     AS StudentsTotal
FROM        dbo.Student st
JOIN        dbo.Program p ON p.ProgramId = st.ProgramId
GROUP BY    p.Name
ORDER BY    p.Name;`,
  },

  /* ---------------------------------------------------------------- detailed */
  'R2.1': {
    number: 'R2.1',
    title: 'Transcript of one student',
    category: 'Detailed',
    description: 'Every course of the student with its grade and the running GPA of the semester (a window function).',
    params: [STUDENT_PARAM],
    labels: { SemesterGpaRun: 'Semester GPA' },
    sql: `
WITH Transcript AS (
    SELECT  sem.SemesterId, sem.Name AS SemesterName, sem.StartDate,
            c.Code AS CourseCode, c.Title AS CourseTitle, c.CreditHours,
            e.Score, e.LetterGrade, e.GradePoints, e.GradePublished,
            u.FullName AS InstructorName
    FROM        dbo.Enrollment e
    JOIN        dbo.Section  sec ON sec.SectionId = e.SectionId
    JOIN        dbo.Semester sem ON sem.SemesterId = sec.SemesterId
    JOIN        dbo.Course   c   ON c.CourseId    = sec.CourseId
    JOIN        dbo.AppUser  u   ON u.UserId      = sec.InstructorId
    WHERE       e.StudentId = @StudentId
      AND       e.Status <> 'Dropped'
)
SELECT  t.SemesterName, t.CourseCode, t.CourseTitle, t.CreditHours,
        t.Score, t.LetterGrade, t.GradePoints, t.InstructorName,
        CASE WHEN t.GradePublished = 1
             THEN CAST(SUM(CASE WHEN t.GradePublished = 1 THEN t.GradePoints * t.CreditHours END)
                       OVER (PARTITION BY t.SemesterId)
                       / NULLIF(SUM(CASE WHEN t.GradePublished = 1 THEN t.CreditHours END)
                                OVER (PARTITION BY t.SemesterId), 0) AS DECIMAL(4,2))
        END                                                          AS SemesterGpaRun
FROM        Transcript t
ORDER BY    t.StartDate DESC, t.CourseCode;`,
  },

  'R2.2': {
    number: 'R2.2',
    title: 'Roster of one section',
    category: 'Detailed',
    description: 'Who is registered, with the attendance summary and the grade of each student.',
    params: [SECTION_PARAM],
    labels: { GradePublished: 'Published', Sessions: 'Sessions', Present: 'Present', Absent: 'Absent', Excused: 'Excused', LastLoginAt: 'Last sign in' },
    sql: `
SELECT  st.StudentNumber, u.FullName, st.Level, p.Name AS ProgramName,
        u.Email, u.LastLoginAt, e.Status,
        e.Score, e.LetterGrade, e.GradePublished,
        (SELECT COUNT(*) FROM dbo.Attendance a WHERE a.EnrollmentId = e.EnrollmentId) AS Sessions,
        (SELECT COUNT(*) FROM dbo.Attendance a WHERE a.EnrollmentId = e.EnrollmentId AND a.Status = 'Present') AS Present,
        (SELECT COUNT(*) FROM dbo.Attendance a WHERE a.EnrollmentId = e.EnrollmentId AND a.Status = 'Absent')  AS Absent,
        (SELECT COUNT(*) FROM dbo.Attendance a WHERE a.EnrollmentId = e.EnrollmentId AND a.Status = 'Excused') AS Excused
FROM        dbo.Enrollment e
JOIN        dbo.Student    st ON st.UserId = e.StudentId
JOIN        dbo.AppUser    u  ON u.UserId  = e.StudentId
JOIN        dbo.Program    p  ON p.ProgramId = st.ProgramId
WHERE       e.SectionId = @SectionId
ORDER BY    u.FullName;`,
  },

  'R2.3': {
    number: 'R2.3',
    title: 'Cash book of one semester',
    category: 'Detailed',
    description: 'Every payment with its receipt, the cashier and the running total of the day.',
    params: [SEMESTER_PARAM],
    labels: { DayRunningTotal: 'Running total of the day', RecordedBy: 'Cashier' },
    sql: `
SELECT  p.PaymentId, p.PaidAt, p.ReceiptNumber, p.Method,
        st.StudentNumber, u.FullName AS StudentName, p.Amount,
        CAST(SUM(p.Amount) OVER (PARTITION BY CAST(p.PaidAt AS DATE)
                                 ORDER BY p.PaymentId
                                 ROWS UNBOUNDED PRECEDING) AS DECIMAL(12,2)) AS DayRunningTotal,
        adm.FullName AS RecordedBy
FROM        dbo.Payment  p
JOIN        dbo.Student  st  ON st.UserId = p.StudentId
JOIN        dbo.AppUser  u   ON u.UserId  = st.UserId
JOIN        dbo.AppUser  adm ON adm.UserId = p.RecordedByAdminId
WHERE       p.SemesterId = @SemesterId
ORDER BY    p.PaidAt, p.PaymentId;`,
  },

  'R2.4': {
    number: 'R2.4',
    title: 'What is still owed for one semester',
    category: 'Detailed',
    description: 'Fees of the registered credit hours minus the payments, per student, biggest debt first.',
    params: [SEMESTER_PARAM],
    labels: { CreditHours: 'Credits', FeePerCreditHour: 'Fee per credit', FeesDue: 'Fees due', PaidSoFar: 'Paid', Balance: 'Balance' },
    sql: `
WITH Fees AS (
    SELECT  e.StudentId, SUM(c.CreditHours) AS CreditHours
    FROM        dbo.Enrollment e
    JOIN        dbo.Section sec ON sec.SectionId = e.SectionId
    JOIN        dbo.Course  c   ON c.CourseId    = sec.CourseId
    WHERE       sec.SemesterId = @SemesterId
      AND       e.Status IN ('Enrolled', 'Completed')
    GROUP BY    e.StudentId
),
Paid AS (
    SELECT  p.StudentId, SUM(p.Amount) AS PaidAmount
    FROM    dbo.Payment p
    WHERE   p.SemesterId = @SemesterId
    GROUP BY p.StudentId
)
SELECT  st.StudentNumber, u.FullName, pr.Name AS ProgramName,
        f.CreditHours, pr.FeePerCreditHour,
        CAST(f.CreditHours * pr.FeePerCreditHour AS DECIMAL(12,2))    AS FeesDue,
        CAST(ISNULL(pd.PaidAmount, 0) AS DECIMAL(12,2))               AS PaidSoFar,
        CAST(f.CreditHours * pr.FeePerCreditHour - ISNULL(pd.PaidAmount, 0) AS DECIMAL(12,2)) AS Balance
FROM        Fees     f
JOIN        dbo.Student st  ON st.UserId = f.StudentId
JOIN        dbo.AppUser u   ON u.UserId  = st.UserId
JOIN        dbo.Program pr  ON pr.ProgramId = st.ProgramId
LEFT JOIN   Paid        pd  ON pd.StudentId = f.StudentId
WHERE       f.CreditHours * pr.FeePerCreditHour - ISNULL(pd.PaidAmount, 0) <> 0
ORDER BY    Balance DESC;`,
  },

  'R2.5': {
    number: 'R2.5',
    title: 'Statement of fees of one student',
    category: 'Detailed',
    description: 'Term by term: what was charged, what was paid and what is left (an OUTER APPLY).',
    params: [STUDENT_PARAM],
    labels: { Charges: 'Charged', Payments: 'Paid', BalanceOfSemester: 'Balance' },
    sql: `
SELECT  sem.Name                                                     AS SemesterName,
        CAST(SUM(c.CreditHours) * MAX(pr.FeePerCreditHour) AS DECIMAL(12,2)) AS Charges,
        CAST(ISNULL(MAX(pay.PaidAmount), 0) AS DECIMAL(12,2))         AS Payments,
        CAST(SUM(c.CreditHours) * MAX(pr.FeePerCreditHour)
             - ISNULL(MAX(pay.PaidAmount), 0) AS DECIMAL(12,2))       AS BalanceOfSemester
FROM        dbo.Enrollment e
JOIN        dbo.Section  sec ON sec.SectionId = e.SectionId
JOIN        dbo.Semester sem ON sem.SemesterId = sec.SemesterId
JOIN        dbo.Course   c   ON c.CourseId    = sec.CourseId
JOIN        dbo.Student  st  ON st.UserId     = e.StudentId
JOIN        dbo.Program  pr  ON pr.ProgramId  = st.ProgramId
OUTER APPLY (SELECT SUM(p.Amount) AS PaidAmount
               FROM dbo.Payment p
              WHERE p.StudentId  = @StudentId
                AND p.SemesterId = sem.SemesterId) AS pay
WHERE       e.StudentId = @StudentId
  AND       e.Status IN ('Enrolled', 'Completed')
GROUP BY    sem.SemesterId, sem.Name, sem.StartDate
ORDER BY    sem.StartDate;`,
  },

  'R2.6': {
    number: 'R2.6',
    title: 'Prerequisite check of a semester',
    category: 'Detailed',
    description: 'Registrations whose course needs a prerequisite that was not passed. The procedure should keep this list empty.',
    params: [SEMESTER_PARAM],
    sql: `
SELECT  st.StudentNumber, u.FullName AS StudentName,
        c.Code AS CourseCode, pc.Code AS MissingPrerequisite
FROM        dbo.Enrollment e
JOIN        dbo.Section  sec ON sec.SectionId = e.SectionId
JOIN        dbo.Course   c   ON c.CourseId    = sec.CourseId
JOIN        dbo.Student  st  ON st.UserId     = e.StudentId
JOIN        dbo.AppUser  u   ON u.UserId      = st.UserId
JOIN        dbo.Prerequisite pr ON pr.CourseId = c.CourseId
JOIN        dbo.Course   pc  ON pc.CourseId   = pr.PrerequisiteCourseId
WHERE       sec.SemesterId = @SemesterId
  AND       e.Status = 'Enrolled'
  AND       NOT EXISTS (SELECT 1
                          FROM dbo.Enrollment pe
                          JOIN dbo.Section  psec ON psec.SectionId = pe.SectionId
                         WHERE pe.StudentId      = e.StudentId
                           AND psec.CourseId     = pr.PrerequisiteCourseId
                           AND pe.GradePublished = 1
                           AND pe.Score         >= 60)
ORDER BY    st.StudentNumber, c.Code;`,
  },

  'R2.7': {
    number: 'R2.7',
    title: 'Teaching load of every instructor',
    category: 'Detailed',
    description: 'Sections, students and courses of each teacher in a semester, with a load band.',
    params: [SEMESTER_PARAM],
    labels: { InstructorName: 'Instructor', DepartmentCode: 'Department', CoursesTaught: 'Courses', LoadBand: 'Load' },
    sql: `
SELECT  u.FullName                                                   AS InstructorName,
        i.Title, d.Code                                               AS DepartmentCode,
        COUNT(DISTINCT sec.SectionId)                                AS Sections,
        COUNT(e.EnrollmentId)                                        AS Students,
        COUNT(DISTINCT c.CourseId)                                   AS CoursesTaught,
        CASE WHEN COUNT(DISTINCT sec.SectionId) > 3 THEN 'Heavy load'
             WHEN COUNT(DISTINCT sec.SectionId) = 0 THEN 'No section'
             ELSE 'Normal' END                                       AS LoadBand
FROM        dbo.Instructor i
JOIN        dbo.AppUser    u   ON u.UserId = i.UserId
JOIN        dbo.Department d   ON d.DepartmentId = i.DepartmentId
LEFT JOIN   dbo.Section    sec ON sec.InstructorId = i.UserId AND sec.SemesterId = @SemesterId
LEFT JOIN   dbo.Course     c   ON c.CourseId = sec.CourseId
LEFT JOIN   dbo.Enrollment e   ON e.SectionId = sec.SectionId AND e.Status <> 'Dropped'
GROUP BY    u.FullName, i.Title, d.Code
ORDER BY    Students DESC;`,
  },

  'R2.8': {
    number: 'R2.8',
    title: 'Use of the rooms',
    category: 'Detailed',
    description: 'Sections hosted per room and how much of the offered seat-time is used.',
    params: [SEMESTER_PARAM],
    labels: { StudentsSeated: 'Students', SeatUsePercent: 'Seat use %' },
    sql: `
SELECT  r.Building, r.RoomNumber, r.RoomType, r.Capacity,
        COUNT(DISTINCT sec.SectionId)                                AS Sections,
        COUNT(e.EnrollmentId)                                        AS StudentsSeated,
        CAST(100.0 * COUNT(e.EnrollmentId)
             / NULLIF(MAX(r.Capacity) * COUNT(DISTINCT sec.SectionId), 0) AS DECIMAL(5,1))
                                                                     AS SeatUsePercent
FROM        dbo.Room r
LEFT JOIN   dbo.Section sec ON sec.RoomId = r.RoomId AND sec.SemesterId = @SemesterId
LEFT JOIN   dbo.Enrollment e ON e.SectionId = sec.SectionId AND e.Status <> 'Dropped'
GROUP BY    r.Building, r.RoomNumber, r.RoomType, r.Capacity
ORDER BY    COUNT(DISTINCT sec.SectionId) DESC, r.Building, r.RoomNumber;`,
  },

  'R2.9': {
    number: 'R2.9',
    title: 'Reach of the announcements',
    category: 'Detailed',
    description: 'Which announcements exist, who wrote them and how many students can see each one.',
    params: [],
    labels: { AudienceSize: 'Students who see it' },
    sql: `
SELECT  an.PostedAt, an.IsPinned, an.Title,
        u.FullName                                                   AS AuthorName,
        u.Role                                                       AS AuthorRole,
        CASE WHEN an.SectionId IS NULL THEN 'Everybody'
             ELSE c.Code + ' ' + sec.SectionCode END                 AS Scope,
        CASE WHEN an.SectionId IS NULL
             THEN (SELECT COUNT(*) FROM dbo.Student)
             ELSE (SELECT COUNT(*) FROM dbo.Enrollment e
                    WHERE e.SectionId = an.SectionId AND e.Status = 'Enrolled') END AS AudienceSize
FROM        dbo.Announcement an
JOIN        dbo.AppUser      u   ON u.UserId = an.AuthorId
LEFT JOIN   dbo.Section      sec ON sec.SectionId = an.SectionId
LEFT JOIN   dbo.Course       c   ON c.CourseId = sec.CourseId
ORDER BY    an.IsPinned DESC, an.PostedAt DESC;`,
  },

  /* ---------------------------------------------------------------- managerial */
  'R3.1': {
    number: 'R3.1',
    title: 'The numbers of the term',
    category: 'Managerial',
    description: 'One row with the numbers the head of the office looks at: students, sections, registrations, money.',
    params: [SEMESTER_PARAM],
    labels: { ActiveStudents: 'Active students', ActiveInstructors: 'Active instructors', SectionsThisTerm: 'Sections', RegistrationsThisTerm: 'Registrations', CollectedAllTime: 'Collected (all time)', InstructorsWaiting: 'Waiting approval', FullSections: 'Full sections', Announcements30Days: 'Announcements (30 days)' },
    sql: `
SELECT  (SELECT COUNT(*) FROM dbo.AppUser WHERE Role = 'Student' AND IsActive = 1)   AS ActiveStudents,
        (SELECT COUNT(*) FROM dbo.AppUser WHERE Role = 'Instructor' AND IsActive = 1) AS ActiveInstructors,
        (SELECT COUNT(*) FROM dbo.Section WHERE SemesterId = @SemesterId)             AS SectionsThisTerm,
        (SELECT COUNT(*) FROM dbo.Enrollment e JOIN dbo.Section s ON s.SectionId = e.SectionId
          WHERE s.SemesterId = @SemesterId AND e.Status = 'Enrolled')                 AS RegistrationsThisTerm,
        (SELECT CAST(ISNULL(SUM(Amount), 0) AS DECIMAL(14,2)) FROM dbo.Payment)       AS CollectedAllTime,
        (SELECT COUNT(*) FROM dbo.AppUser WHERE Role = 'Instructor' AND IsActive = 0) AS InstructorsWaiting,
        (SELECT COUNT(*) FROM dbo.vw_SectionFill f
          WHERE f.SemesterId = @SemesterId AND f.Enrolled >= f.Capacity)              AS FullSections,
        (SELECT COUNT(*) FROM dbo.Announcement WHERE PostedAt >= DATEADD(DAY, -30, SYSDATETIME())) AS Announcements30Days;`,
  },

  'R3.2': {
    number: 'R3.2',
    title: 'The trend of the semesters',
    category: 'Managerial',
    description: 'Sections, registrations, credit hours, average GPA and money collected for every semester.',
    params: [],
    labels: { RegistrationState: 'Registration', AverageGpa: 'Average GPA', Collected: 'Collected' },
    sql: `
SELECT  sem.Name                                                     AS SemesterName,
        sem.StartDate, sem.EndDate,
        CASE WHEN sem.RegistrationOpen = 1 THEN 'Open' ELSE 'Closed' END AS RegistrationState,
        (SELECT COUNT(*) FROM dbo.Section s WHERE s.SemesterId = sem.SemesterId)          AS Sections,
        (SELECT COUNT(*) FROM dbo.Enrollment e JOIN dbo.Section s ON s.SectionId = e.SectionId
          WHERE s.SemesterId = sem.SemesterId AND e.Status = 'Enrolled')                  AS Registrations,
        (SELECT SUM(c.CreditHours)
           FROM dbo.Enrollment e
           JOIN dbo.Section s ON s.SectionId = e.SectionId
           JOIN dbo.Course  c ON c.CourseId  = s.CourseId
          WHERE s.SemesterId = sem.SemesterId AND e.Status <> 'Dropped')                  AS CreditHours,
        (SELECT CAST(AVG(g.SemesterGpa) AS DECIMAL(4,2))
           FROM dbo.vw_StudentGpa g WHERE g.SemesterId = sem.SemesterId)                  AS AverageGpa,
        (SELECT CAST(ISNULL(SUM(p.Amount), 0) AS DECIMAL(14,2))
           FROM dbo.Payment p WHERE p.SemesterId = sem.SemesterId)                        AS Collected
FROM        dbo.Semester sem
ORDER BY    sem.StartDate DESC;`,
  },

  'R3.3': {
    number: 'R3.3',
    title: 'Performance of the programs',
    category: 'Managerial',
    description: 'Students, average cumulative GPA, credits passed, money billed and collected per program.',
    params: [],
    labels: { Students: 'Students', AverageGpa: 'Average GPA', CreditsPassed: 'Credits passed', BilledAmount: 'Billed', CollectedAmount: 'Collected', CollectionRate: 'Collected %', TotalCreditHours: 'Program credits', FeePerCreditHour: 'Fee per credit' },
    sql: `
WITH StudentTotals AS (
    SELECT  st.UserId AS StudentId, st.ProgramId,
            CAST(SUM(e.GradePoints * c.CreditHours) / NULLIF(SUM(c.CreditHours), 0) AS DECIMAL(4,2)) AS CumulativeGpa,
            SUM(CASE WHEN e.Score >= 60 THEN c.CreditHours ELSE 0 END) AS PassedCredits
    FROM        dbo.Enrollment e
    JOIN        dbo.Section  sec ON sec.SectionId = e.SectionId
    JOIN        dbo.Course   c   ON c.CourseId    = sec.CourseId
    JOIN        dbo.Student  st  ON st.UserId     = e.StudentId
    WHERE       e.GradePublished = 1
      AND       e.Status <> 'Dropped'
    GROUP BY    st.UserId, st.ProgramId
),
Billed AS (
    SELECT  st.ProgramId,
            CAST(SUM(c.CreditHours) * MAX(pr.FeePerCreditHour) AS DECIMAL(14,2)) AS BilledAmount
    FROM        dbo.Enrollment e
    JOIN        dbo.Section  sec ON sec.SectionId = e.SectionId
    JOIN        dbo.Course   c   ON c.CourseId    = sec.CourseId
    JOIN        dbo.Student  st  ON st.UserId     = e.StudentId
    JOIN        dbo.Program  pr  ON pr.ProgramId  = st.ProgramId
    WHERE       e.Status IN ('Enrolled', 'Completed')
    GROUP BY    st.ProgramId, st.UserId
),
BilledPerProgram AS (
    SELECT ProgramId, CAST(SUM(BilledAmount) AS DECIMAL(14,2)) AS BilledAmount
    FROM   Billed GROUP BY ProgramId
),
Collected AS (
    SELECT  st.ProgramId, CAST(SUM(p.Amount) AS DECIMAL(14,2)) AS CollectedAmount
    FROM        dbo.Payment p
    JOIN        dbo.Student st ON st.UserId = p.StudentId
    GROUP BY    st.ProgramId
)
SELECT  p.Name                                                       AS ProgramName,
        d.Code                                                       AS DepartmentCode,
        p.TotalCreditHours,
        p.FeePerCreditHour,
        COUNT(st.StudentId)                                          AS Students,
        CAST(AVG(st.CumulativeGpa) AS DECIMAL(4,2))                  AS AverageGpa,
        SUM(ISNULL(st.PassedCredits, 0))                             AS CreditsPassed,
        ISNULL(b.BilledAmount, 0)                                    AS BilledAmount,
        ISNULL(c.CollectedAmount, 0)                                 AS CollectedAmount,
        CAST(100.0 * ISNULL(c.CollectedAmount, 0)
             / NULLIF(ISNULL(b.BilledAmount, 0), 0) AS DECIMAL(5,1)) AS CollectionRate
FROM        dbo.Program p
JOIN        dbo.Department d ON d.DepartmentId = p.DepartmentId
LEFT JOIN   StudentTotals  st ON st.ProgramId = p.ProgramId
LEFT JOIN   BilledPerProgram b ON b.ProgramId = p.ProgramId
LEFT JOIN   Collected      c  ON c.ProgramId = p.ProgramId
GROUP BY    p.Name, d.Code, p.TotalCreditHours, p.FeePerCreditHour,
            b.BilledAmount, c.CollectedAmount
ORDER BY    AverageGpa DESC, p.Name;`,
  },

  'R3.4': {
    number: 'R3.4',
    title: 'Students at risk',
    category: 'Managerial',
    description: 'Cumulative GPA under 2.00, attendance under 75% or a failed course, with the reason named.',
    params: [SEMESTER_PARAM],
    labels: { CumulativeGpa: 'GPA', FailedCourses: 'Failed', AttendanceRate: 'Attendance %', AdvisorName: 'Advisor', AdvisorTitle: 'Title', Reason: 'Why the student is on the list' },
    sql: `
WITH Gpa AS (
    SELECT  e.StudentId,
            CAST(SUM(e.GradePoints * c.CreditHours) / NULLIF(SUM(c.CreditHours), 0) AS DECIMAL(4,2)) AS CumulativeGpa,
            SUM(CASE WHEN e.LetterGrade = 'F' THEN 1 ELSE 0 END)    AS FailedCourses
    FROM        dbo.Enrollment e
    JOIN        dbo.Section  sec ON sec.SectionId = e.SectionId
    JOIN        dbo.Course   c   ON c.CourseId    = sec.CourseId
    WHERE       e.GradePublished = 1
      AND       e.Status <> 'Dropped'
    GROUP BY    e.StudentId
),
AttendanceRate AS (
    SELECT  e.StudentId,
            COUNT(a.AttendanceId)                                   AS AttendanceRows,
            CASE WHEN COUNT(a.AttendanceId) = 0 THEN NULL
                 ELSE CAST(100.0 * SUM(CASE WHEN a.Status IN ('Present', 'Excused') THEN 1 ELSE 0 END)
                           / COUNT(a.AttendanceId) AS DECIMAL(5,1)) END AS Rate
    FROM        dbo.Enrollment e
    JOIN        dbo.Section  sec ON sec.SectionId = e.SectionId
    LEFT JOIN   dbo.Attendance a ON a.EnrollmentId = e.EnrollmentId
    WHERE       sec.SemesterId = @SemesterId
      AND       e.Status = 'Enrolled'
    GROUP BY    e.StudentId
)
SELECT  st.StudentNumber, u.FullName, p.Name AS ProgramName, st.Level,
        i.Title                                                      AS AdvisorTitle,
        advisor.FullName                                             AS AdvisorName,
        g.CumulativeGpa, g.FailedCourses,
        ar.Rate                                                      AS AttendanceRate,
        STUFF(CONCAT(
            CASE WHEN g.CumulativeGpa < 2.0 THEN ', low GPA' ELSE '' END,
            CASE WHEN ar.Rate < 75    THEN ', attendance under 75%' ELSE '' END,
            CASE WHEN g.FailedCourses > 0 THEN ', failed course' ELSE '' END), 1, 2, '') AS Reason
FROM        dbo.Student  st
JOIN        dbo.AppUser  u       ON u.UserId = st.UserId
JOIN        dbo.Program  p       ON p.ProgramId = st.ProgramId
JOIN        Gpa          g       ON g.StudentId = st.UserId
LEFT JOIN   AttendanceRate ar    ON ar.StudentId = st.UserId
LEFT JOIN   dbo.Instructor i     ON i.UserId = st.AdvisorId
LEFT JOIN   dbo.AppUser  advisor ON advisor.UserId = i.UserId
WHERE       g.CumulativeGpa < 2.0
   OR       ar.Rate < 75
   OR       g.FailedCourses > 0
ORDER BY    g.CumulativeGpa, st.StudentNumber;`,
  },

  'R3.5': {
    number: 'R3.5',
    title: 'The honour list',
    category: 'Managerial',
    description: 'Students with a GPA of 3.60 or more over at least 12 graded credits, with their rank.',
    params: [],
    labels: { GradedCredits: 'Graded credits', CumulativeGpa: 'GPA', RankOverall: 'Rank', RankInProgram: 'Rank in program' },
    sql: `
WITH StudentTotals AS (
    SELECT  st.UserId AS StudentId, st.StudentNumber, st.ProgramId,
            SUM(c.CreditHours) AS GradedCredits,
            CAST(SUM(e.GradePoints * c.CreditHours) / NULLIF(SUM(c.CreditHours), 0) AS DECIMAL(4,2)) AS CumulativeGpa
    FROM        dbo.Enrollment e
    JOIN        dbo.Section  sec ON sec.SectionId = e.SectionId
    JOIN        dbo.Course   c   ON c.CourseId    = sec.CourseId
    JOIN        dbo.Student  st  ON st.UserId     = e.StudentId
    WHERE       e.GradePublished = 1
      AND       e.Status <> 'Dropped'
    GROUP BY    st.UserId, st.StudentNumber, st.ProgramId
    HAVING      SUM(c.CreditHours) >= 12
)
SELECT  t.StudentNumber, u.FullName, p.Name AS ProgramName,
        t.GradedCredits, t.CumulativeGpa,
        RANK() OVER (ORDER BY t.CumulativeGpa DESC)                  AS RankOverall,
        RANK() OVER (PARTITION BY t.ProgramId ORDER BY t.CumulativeGpa DESC) AS RankInProgram
FROM        StudentTotals t
JOIN        dbo.AppUser   u ON u.UserId = t.StudentId
JOIN        dbo.Program   p ON p.ProgramId = t.ProgramId
WHERE       t.CumulativeGpa >= 3.60
ORDER BY    t.CumulativeGpa DESC, u.FullName;`,
  },

  'R3.6': {
    number: 'R3.6',
    title: 'Students with no registration in the term',
    category: 'Managerial',
    description: 'The list the office calls before the deadline, with the last sign in of each student.',
    params: [SEMESTER_PARAM],
    labels: { LastLoginAt: 'Last sign in', PaidInTotal: 'Paid in total' },
    sql: `
SELECT  st.StudentNumber, u.FullName, p.Name AS ProgramName, st.Level, u.LastLoginAt,
        CASE WHEN u.LastLoginAt IS NULL THEN 'Never signed in'
             WHEN u.LastLoginAt < DATEADD(DAY, -60, SYSDATETIME()) THEN 'Not signed in for 60 days'
             ELSE 'Active account, no registration' END              AS Note,
        ISNULL((SELECT CAST(SUM(pp.Amount) AS DECIMAL(12,2))
                  FROM dbo.Payment pp WHERE pp.StudentId = st.UserId), 0) AS PaidInTotal
FROM        dbo.Student st
JOIN        dbo.AppUser u ON u.UserId = st.UserId
JOIN        dbo.Program p ON p.ProgramId = st.ProgramId
WHERE       u.IsActive = 1
  AND       NOT EXISTS (SELECT 1
                          FROM dbo.Enrollment e
                          JOIN dbo.Section  sec ON sec.SectionId = e.SectionId
                         WHERE e.StudentId = st.UserId
                           AND sec.SemesterId = @SemesterId
                           AND e.Status = 'Enrolled')
ORDER BY    u.FullName;`,
  },

  'R3.7': {
    number: 'R3.7',
    title: 'The money page',
    category: 'Managerial',
    description: 'Charged, collected and outstanding per program, with a total row at the end.',
    params: [],
    labels: { Charged: 'Charged', Collected: 'Collected', Outstanding: 'Outstanding', CollectionRate: 'Collected %' },
    sql: `
WITH Charged AS (
    SELECT  st.ProgramId,
            CAST(SUM(c.CreditHours) * MAX(pr.FeePerCreditHour) AS DECIMAL(14,2)) AS ChargedAmount
    FROM        dbo.Enrollment e
    JOIN        dbo.Section  sec ON sec.SectionId = e.SectionId
    JOIN        dbo.Course   c   ON c.CourseId    = sec.CourseId
    JOIN        dbo.Student  st  ON st.UserId     = e.StudentId
    JOIN        dbo.Program  pr  ON pr.ProgramId  = st.ProgramId
    WHERE       e.Status IN ('Enrolled', 'Completed')
    GROUP BY    st.ProgramId, e.StudentId
),
ChargedPerProgram AS (
    SELECT ProgramId, CAST(SUM(ChargedAmount) AS DECIMAL(14,2)) AS ChargedAmount
    FROM   Charged GROUP BY ProgramId
),
PaidPerProgram AS (
    SELECT  st.ProgramId, CAST(SUM(p.Amount) AS DECIMAL(14,2)) AS PaidAmount
    FROM        dbo.Payment p
    JOIN        dbo.Student st ON st.UserId = p.StudentId
    GROUP BY    st.ProgramId
)
SELECT  p.Name                                                       AS ProgramName,
        ISNULL(cp.ChargedAmount, 0)                                  AS Charged,
        ISNULL(pp.PaidAmount, 0)                                     AS Collected,
        CAST(ISNULL(cp.ChargedAmount, 0) - ISNULL(pp.PaidAmount, 0) AS DECIMAL(14,2)) AS Outstanding,
        CAST(100.0 * ISNULL(pp.PaidAmount, 0)
             / NULLIF(ISNULL(cp.ChargedAmount, 0), 0) AS DECIMAL(5,1)) AS CollectionRate
FROM        dbo.Program p
LEFT JOIN   ChargedPerProgram cp ON cp.ProgramId = p.ProgramId
LEFT JOIN   PaidPerProgram    pp ON pp.ProgramId = p.ProgramId
UNION ALL
SELECT  'ALL PROGRAMS',
        CAST(SUM(ISNULL(cp.ChargedAmount, 0)) AS DECIMAL(14,2)),
        CAST(SUM(ISNULL(pp.PaidAmount, 0)) AS DECIMAL(14,2)),
        CAST(SUM(ISNULL(cp.ChargedAmount, 0)) - SUM(ISNULL(pp.PaidAmount, 0)) AS DECIMAL(14,2)),
        CAST(100.0 * SUM(ISNULL(pp.PaidAmount, 0))
             / NULLIF(SUM(ISNULL(cp.ChargedAmount, 0)), 0) AS DECIMAL(5,1))
FROM        dbo.Program p
LEFT JOIN   ChargedPerProgram cp ON cp.ProgramId = p.ProgramId
LEFT JOIN   PaidPerProgram    pp ON pp.ProgramId = p.ProgramId
ORDER BY    CollectionRate DESC;`,
  },

  'R3.8': {
    number: 'R3.8',
    title: 'State of the catalogue',
    category: 'Managerial',
    description: 'Courses, sections, registrations and courses that never opened a section, per department.',
    params: [],
    labels: { HeadOfDepartment: 'Head', DepartmentCode: 'Code', Courses: 'Courses', SectionsEver: 'Sections ever', RegistrationsEver: 'Registrations', CoursesNeverOpened: 'Never opened' },
    sql: `
SELECT  d.Code                                                       AS DepartmentCode,
        d.Name                                                       AS DepartmentName,
        ISNULL(head.FullName, 'not assigned')                        AS HeadOfDepartment,
        (SELECT COUNT(*) FROM dbo.Course c WHERE c.DepartmentId = d.DepartmentId)          AS Courses,
        (SELECT COUNT(*) FROM dbo.Course c JOIN dbo.Section s ON s.CourseId = c.CourseId
          WHERE c.DepartmentId = d.DepartmentId)                                           AS SectionsEver,
        (SELECT COUNT(*) FROM dbo.Course c JOIN dbo.Section s ON s.CourseId = c.CourseId
          JOIN dbo.Enrollment e ON e.SectionId = s.SectionId
          WHERE c.DepartmentId = d.DepartmentId AND e.Status <> 'Dropped')                 AS RegistrationsEver,
        ISNULL((SELECT COUNT(*) FROM dbo.Course c
                 WHERE c.DepartmentId = d.DepartmentId
                   AND NOT EXISTS (SELECT 1 FROM dbo.Section s WHERE s.CourseId = c.CourseId)), 0) AS CoursesNeverOpened
FROM        dbo.Department d
LEFT JOIN   dbo.Instructor i    ON i.UserId = d.HeadInstructorId
LEFT JOIN   dbo.AppUser    head ON head.UserId = i.UserId
ORDER BY    RegistrationsEver DESC, d.Code;`,
  },
};

export function listReports() {
  return Object.values(REPORTS)
    .map((r) => ({
      key: r.number, number: r.number, title: r.title, category: r.category,
      description: r.description, params: r.params,
    }))
    .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
}

export function getReport(key) {
  return REPORTS[key] || null;
}

export function categoryOf(key) {
  const report = getReport(key);
  return report ? report.category : null;
}
