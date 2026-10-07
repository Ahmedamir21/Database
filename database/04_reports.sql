/* =====================================================================================
   Zewail Desk - CSAI 202 Database Systems - the reports of the system
   =====================================================================================
   The course asks for three kinds of reporting and this file follows that division:

     R1  statistical reports      - counts, averages, distributions, rates
     R2  detailed reports         - everything about ONE part of the database
                                    (one student, one section, one semester, one room)
     R3  managerial reports       - the overview the head of the office reads: trends,
                                    performance of the programs, students at risk

   Every report is a single SELECT, so the same text can be pasted into Management Studio
   and it can be exposed by the API as it is. Where a report takes input, the input is a
   declared variable with a sample value, exactly like in 03_queries.sql.
   ===================================================================================== */

USE ZewailDesk;
GO
SET NOCOUNT ON;
GO

/* =====================================================================================
   R1. STATISTICAL REPORTS
   ===================================================================================== */

/* R1.1 Registrations per program and semester, one column per semester (three semesters in
   the sample data, so three CASE columns and a row total).  */
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
ORDER BY    p.Name;
GO

/* R1.2 Grade distribution of every section that has published grades. The eleven letters of
   the grade scale become columns, together with the average and the pass rate. */
SELECT  sem.Name                                                     AS SemesterName,
        c.Code                                                       AS CourseCode,
        c.Title                                                      AS CourseTitle,
        sec.SectionCode,
        COUNT(*)                                                     AS Graded,
        CAST(AVG(e.Score) AS DECIMAL(5,2))                            AS AverageScore,
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
GROUP BY    sem.Name, c.Code, c.Title, sec.SectionCode
ORDER BY    sem.Name DESC, c.Code, sec.SectionCode;
GO

/* R1.3 How full the sections of a semester are, using the view that counts the enrolments.
   The CASE turns the percentage into the word the office uses. */
DECLARE @SemesterName NVARCHAR(60) = 'Fall 2026';
SELECT  f.CourseCode, f.CourseTitle, f.SectionCode, f.InstructorName, f.RoomName,
        f.Capacity, f.Enrolled, f.FillPercent,
        CASE WHEN f.FillPercent >= 100 THEN 'Full'
             WHEN f.FillPercent >= 80  THEN 'Almost full'
             WHEN f.FillPercent >= 50  THEN 'Half'
             ELSE 'Plenty of seats' END                              AS FillBand
FROM    dbo.vw_SectionFill f
WHERE   f.SemesterName = @SemesterName
ORDER BY f.FillPercent DESC, f.CourseCode;
GO

/* R1.4 Attendance statistics per section: how many session dates were recorded and what part
   of the students were present. Excused absences are reported but do not count against. */
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
ORDER BY    PresentRate, c.Code;
GO

/* R1.5 The students who carry the heaviest term, highest credit hours first. */
DECLARE @SemesterId INT = 3;
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
ORDER BY    SUM(c.CreditHours) DESC, u.FullName;
GO

/* R1.6 Registrations per department and level of the student, with a subtotal per department
   (ROLLUP) and the word "ALL" printed for the subtotal rows with GROUPING(). */
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
ORDER BY    DepartmentCode, StudentLevel;
GO

/* R1.7 Demand per course in the open semester: how many seats were offered and how many were
   actually taken, sorted by the courses that filled up. */
DECLARE @SemesterId2 INT = 3;
WITH SectionSeats AS (
    -- one row per section of the semester: capacity, and how many students are in it.
    -- The seats are counted here, before the sections of a course are added up, so that the
    -- capacity of a section is never multiplied by the number of its students.
    SELECT  sec.SectionId, sec.CourseId, sec.Capacity,
            (SELECT COUNT(*) FROM dbo.Enrollment e
              WHERE e.SectionId = sec.SectionId AND e.Status = 'Enrolled') AS Taken
    FROM    dbo.Section sec
    WHERE   sec.SemesterId = @SemesterId2
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
ORDER BY    DemandPercent DESC, c.Code;
GO

/* R1.8 Which days and hours of the week are the busiest, so the office knows where a new
   section fits. DayOfWeek 1 = Saturday ... 7 = Friday. */
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
ORDER BY    COUNT(e.EnrollmentId) DESC, sec.DayOfWeek, sec.StartTime;
GO

/* R1.9 Payments grouped by the way the money arrived, per semester. */
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
ORDER BY    sem.Name;
GO

/* R1.10 How the students of each program are spread over the five levels. */
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
ORDER BY    p.Name;
GO

/* =====================================================================================
   R2. DETAILED REPORTS FOR ONE PART OF THE DATABASE
   ===================================================================================== */

/* R2.1 The transcript of one student: every course with its grade, then the semester
   subtotal and the cumulative GPA of the transcript, in one result set.  */
DECLARE @StudentId INT = 9;
WITH Transcript AS (
    SELECT  sem.SemesterId,
            sem.Name            AS SemesterName,
            sem.StartDate,
            c.Code              AS CourseCode,
            c.Title             AS CourseTitle,
            c.CreditHours,
            e.Score,
            e.LetterGrade,
            e.GradePoints,
            e.GradePublished,
            u.FullName          AS InstructorName
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
ORDER BY    t.StartDate DESC, t.CourseCode;
GO

/* R2.2 The roster of one section: who is registered, their attendance summary and the grade
   if it has been published. This is the list the instructor prints before an exam. */
DECLARE @SectionId INT = 1;
SELECT  st.StudentNumber, u.FullName, st.Level,
        p.Name                                                       AS ProgramName,
        u.Email, u.LastLoginAt,
        e.Status,
        e.Score, e.LetterGrade, e.GradePublished,
        (SELECT COUNT(*) FROM dbo.Attendance a
          WHERE a.EnrollmentId = e.EnrollmentId)                      AS Sessions,
        (SELECT COUNT(*) FROM dbo.Attendance a
          WHERE a.EnrollmentId = e.EnrollmentId AND a.Status = 'Present') AS Present,
        (SELECT COUNT(*) FROM dbo.Attendance a
          WHERE a.EnrollmentId = e.EnrollmentId AND a.Status = 'Absent')  AS Absent,
        (SELECT COUNT(*) FROM dbo.Attendance a
          WHERE a.EnrollmentId = e.EnrollmentId AND a.Status = 'Excused') AS Excused
FROM        dbo.Enrollment e
JOIN        dbo.Student    st ON st.UserId = e.StudentId
JOIN        dbo.AppUser    u  ON u.UserId  = e.StudentId
JOIN        dbo.Program    p  ON p.ProgramId = st.ProgramId
WHERE       e.SectionId = @SectionId
ORDER BY    u.FullName;
GO

/* R2.3 The cash book of one semester: every payment with the receipt number, the cashier and
   the running total of the day. */
DECLARE @SemesterId3 INT = 1;
SELECT  p.PaymentId, p.PaidAt, p.ReceiptNumber, p.Method,
        st.StudentNumber, u.FullName AS StudentName,
        p.Amount,
        CAST(SUM(p.Amount) OVER (PARTITION BY CAST(p.PaidAt AS DATE)
                                 ORDER BY p.PaymentId
                                 ROWS UNBOUNDED PRECEDING) AS DECIMAL(12,2)) AS DayRunningTotal,
        adm.FullName AS RecordedBy
FROM        dbo.Payment  p
JOIN        dbo.Student  st  ON st.UserId = p.StudentId
JOIN        dbo.AppUser  u   ON u.UserId  = st.UserId
JOIN        dbo.Admin    a   ON a.UserId  = p.RecordedByAdminId
JOIN        dbo.AppUser  adm ON adm.UserId = a.UserId
WHERE       p.SemesterId = @SemesterId3
ORDER BY    p.PaidAt, p.PaymentId;
GO

/* R2.4 What every student still owes for one semester: the fees of the registered credit
   hours minus the payments of that student that semester. */
DECLARE @SemesterId4 INT = 1;
WITH Fees AS (
    SELECT  e.StudentId, SUM(c.CreditHours) AS CreditHours
    FROM        dbo.Enrollment e
    JOIN        dbo.Section sec ON sec.SectionId = e.SectionId
    JOIN        dbo.Course  c   ON c.CourseId    = sec.CourseId
    WHERE       sec.SemesterId = @SemesterId4
      AND       e.Status IN ('Enrolled', 'Completed')
    GROUP BY    e.StudentId
),
Paid AS (
    SELECT  p.StudentId, SUM(p.Amount) AS PaidAmount
    FROM    dbo.Payment p
    WHERE   p.SemesterId = @SemesterId4
    GROUP BY p.StudentId
)
SELECT  st.StudentNumber, u.FullName, pr.Name AS ProgramName,
        f.CreditHours,
        pr.FeePerCreditHour,
        CAST(f.CreditHours * pr.FeePerCreditHour AS DECIMAL(12,2))    AS FeesDue,
        CAST(ISNULL(pd.PaidAmount, 0) AS DECIMAL(12,2))               AS PaidSoFar,
        CAST(f.CreditHours * pr.FeePerCreditHour - ISNULL(pd.PaidAmount, 0) AS DECIMAL(12,2)) AS Balance
FROM        Fees     f
JOIN        dbo.Student st  ON st.UserId = f.StudentId
JOIN        dbo.AppUser u   ON u.UserId  = st.UserId
JOIN        dbo.Program pr  ON pr.ProgramId = st.ProgramId
LEFT JOIN   Paid        pd  ON pd.StudentId = f.StudentId
WHERE       f.CreditHours * pr.FeePerCreditHour - ISNULL(pd.PaidAmount, 0) <> 0
ORDER BY    Balance DESC;
GO

/* R2.5 The statement of fees of one student, semester by semester: charged, paid and the
   balance that is carried forward. */
DECLARE @StudentId2 INT = 9;
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
              WHERE p.StudentId = @StudentId2
                AND p.SemesterId = sem.SemesterId) AS pay
WHERE       e.StudentId = @StudentId2
  AND       e.Status IN ('Enrolled', 'Completed')
GROUP BY    sem.SemesterId, sem.Name, sem.StartDate
ORDER BY    sem.StartDate;
GO

/* R2.6 Prerequisite check report: for every registration of the open semester, are the
   prerequisites of the course already passed? It should return no row, because the stored
   procedure sp_RegisterStudent refuses to register a student that misses one. */
DECLARE @SemesterId5 INT = 3;
SELECT  st.StudentNumber, u.FullName AS StudentName,
        c.Code AS CourseCode, pc.Code AS MissingPrerequisite
FROM        dbo.Enrollment e
JOIN        dbo.Section  sec ON sec.SectionId = e.SectionId
JOIN        dbo.Course   c   ON c.CourseId    = sec.CourseId
JOIN        dbo.Student  st  ON st.UserId     = e.StudentId
JOIN        dbo.AppUser  u   ON u.UserId      = st.UserId
JOIN        dbo.Prerequisite pr ON pr.CourseId = c.CourseId
JOIN        dbo.Course   pc  ON pc.CourseId   = pr.PrerequisiteCourseId
WHERE       sec.SemesterId = @SemesterId5
  AND       e.Status = 'Enrolled'
  AND       NOT EXISTS (SELECT 1
                          FROM dbo.Enrollment pe
                          JOIN dbo.Section  psec ON psec.SectionId = pe.SectionId
                         WHERE pe.StudentId        = e.StudentId
                           AND psec.CourseId       = pr.PrerequisiteCourseId
                           AND pe.GradePublished   = 1
                           AND pe.Score           >= 60)
ORDER BY    st.StudentNumber, c.Code;
GO

/* R2.7 The teaching load of every instructor in one semester: sections, students and credit
   hours of teaching, with a warning when the load passes the normal ceiling of 12 hours. */
DECLARE @SemesterId6 INT = 3;
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
LEFT JOIN   dbo.Section    sec ON sec.InstructorId = i.UserId AND sec.SemesterId = @SemesterId6
LEFT JOIN   dbo.Course     c   ON c.CourseId = sec.CourseId
LEFT JOIN   dbo.Enrollment e   ON e.SectionId = sec.SectionId AND e.Status <> 'Dropped'
GROUP BY    u.FullName, i.Title, d.Code
ORDER BY    Students DESC;
GO

/* R2.8 How the rooms are used in one semester: how many sections each room hosts and what
   part of its seats are taken. */
DECLARE @SemesterId7 INT = 3;
SELECT  r.Building, r.RoomNumber, r.RoomType, r.Capacity,
        COUNT(DISTINCT sec.SectionId)                                AS Sections,
        COUNT(e.EnrollmentId)                                        AS StudentsSeated,
        CAST(100.0 * COUNT(e.EnrollmentId)
             / NULLIF(MAX(r.Capacity) * COUNT(DISTINCT sec.SectionId), 0) AS DECIMAL(5,1))
                                                                     AS SeatUsePercent
FROM        dbo.Room r
LEFT JOIN   dbo.Section sec ON sec.RoomId = r.RoomId AND sec.SemesterId = @SemesterId7
LEFT JOIN   dbo.Enrollment e ON e.SectionId = sec.SectionId AND e.Status <> 'Dropped'
GROUP BY    r.Building, r.RoomNumber, r.RoomType, r.Capacity
ORDER BY    COUNT(DISTINCT sec.SectionId) DESC, r.Building, r.RoomNumber;
GO

/* R2.9 Reach of the announcements: the global ones and the ones of each section, with the
   number of students that can see them. */
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
ORDER BY    an.IsPinned DESC, an.PostedAt DESC;
GO

/* R2.10 The sections of one instructor with the class average, so the teacher can compare the
   groups of the same course. */
DECLARE @InstructorId INT = 1;
SELECT  sem.Name                                                     AS SemesterName,
        c.Code                                                       AS CourseCode,
        sec.SectionCode, sec.Capacity,
        COUNT(e.EnrollmentId)                                        AS Registered,
        CAST(AVG(CASE WHEN e.GradePublished = 1 THEN e.Score END)
             AS DECIMAL(5,2))                                        AS AverageScore,
        MIN(CASE WHEN e.GradePublished = 1 THEN e.Score END)         AS Lowest,
        MAX(CASE WHEN e.GradePublished = 1 THEN e.Score END)         AS Highest
FROM        dbo.Section sec
JOIN        dbo.Course  c   ON c.CourseId    = sec.CourseId
JOIN        dbo.Semester sem ON sem.SemesterId = sec.SemesterId
LEFT JOIN   dbo.Enrollment e ON e.SectionId = sec.SectionId AND e.Status <> 'Dropped'
WHERE       sec.InstructorId = @InstructorId
GROUP BY    sem.Name, sem.StartDate, c.Code, sec.SectionCode, sec.Capacity
ORDER BY    sem.StartDate DESC, c.Code;
GO

/* =====================================================================================
   R3. MANAGERIAL REPORTS
   ===================================================================================== */

/* R3.1 The dashboard of the head of the office: one row with the numbers of the term. */
DECLARE @SemesterId8 INT = 3;
SELECT  (SELECT COUNT(*) FROM dbo.AppUser WHERE Role = 'Student' AND IsActive = 1)   AS ActiveStudents,
        (SELECT COUNT(*) FROM dbo.AppUser WHERE Role = 'Instructor' AND IsActive = 1) AS ActiveInstructors,
        (SELECT COUNT(*) FROM dbo.Section WHERE SemesterId = @SemesterId8)            AS SectionsThisTerm,
        (SELECT COUNT(*) FROM dbo.Enrollment e JOIN dbo.Section s ON s.SectionId = e.SectionId
          WHERE s.SemesterId = @SemesterId8 AND e.Status = 'Enrolled')                AS RegistrationsThisTerm,
        (SELECT CAST(ISNULL(SUM(Amount), 0) AS DECIMAL(14,2)) FROM dbo.Payment)       AS CollectedAllTime,
        (SELECT COUNT(*) FROM dbo.AppUser WHERE Role = 'Instructor' AND IsActive = 0) AS InstructorsWaiting,
        (SELECT COUNT(*) FROM dbo.vw_SectionFill f
          WHERE f.SemesterId = @SemesterId8 AND f.Enrolled >= f.Capacity)             AS FullSections,
        (SELECT COUNT(*) FROM dbo.Announcement WHERE PostedAt >= DATEADD(DAY, -30, SYSDATETIME())) AS Announcements30Days;
GO

/* R3.2 The three semesters side by side: registrations, credit hours, grade average and money
   collected. This is the trend page the office shows at the end of the year. */
DECLARE @SemesterId9 INT = 3;
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
ORDER BY    sem.StartDate DESC;
GO

/* R3.3 The performance of every program: students, their average cumulative GPA, the credit
   hours they already passed and the part of the fees that was collected.  */
WITH StudentTotals AS (
    SELECT  st.UserId                                               AS StudentId,
            st.ProgramId,
            CAST(SUM(e.GradePoints * c.CreditHours)
                 / NULLIF(SUM(c.CreditHours), 0) AS DECIMAL(4,2))   AS CumulativeGpa,
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
    -- the CTE above gives one row per student, the outer query adds the rows up per program
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
ORDER BY    AverageGpa DESC, p.Name;
GO

/* R3.4 Students at risk: the list the advisor acts on. A student is at risk when the
   cumulative GPA is under 2.00, when the attendance rate in the open semester is under 75%,
   or when the student has a failed course. Every reason is named in a column. */
DECLARE @SemesterId10 INT = 3;
WITH Gpa AS (
    SELECT  e.StudentId,
            CAST(SUM(e.GradePoints * c.CreditHours)
                 / NULLIF(SUM(c.CreditHours), 0) AS DECIMAL(4,2))   AS CumulativeGpa,
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
    WHERE       sec.SemesterId = @SemesterId10
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
ORDER BY    g.CumulativeGpa, st.StudentNumber;
GO

/* R3.5 The honour list: students with a cumulative GPA of 3.60 or more over at least 12
   graded credit hours, best GPA first, with their rank per program. */
WITH StudentTotals AS (
    SELECT  st.UserId                                               AS StudentId,
            st.StudentNumber,
            st.ProgramId,
            SUM(c.CreditHours)                                       AS GradedCredits,
            CAST(SUM(e.GradePoints * c.CreditHours)
                 / NULLIF(SUM(c.CreditHours), 0) AS DECIMAL(4,2))    AS CumulativeGpa
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
ORDER BY    t.CumulativeGpa DESC, u.FullName;
GO

/* R3.6 How many students registered nothing in the open semester, and who they are. The
   office calls them two weeks before the deadline. */
DECLARE @SemesterId11 INT = 3;
SELECT  st.StudentNumber, u.FullName, p.Name AS ProgramName, st.Level,
        u.LastLoginAt,
        CASE WHEN u.LastLoginAt IS NULL THEN 'Never signed in'
             WHEN u.LastLoginAt < DATEADD(DAY, -60, SYSDATETIME()) THEN 'Not signed in for 60 days'
             ELSE 'Active account, no registration' END              AS Note,
        ISNULL((SELECT CAST(SUM(pp.Amount) AS DECIMAL(12,2))
                  FROM dbo.Payment pp
                 WHERE pp.StudentId = st.UserId), 0)                 AS PaidInTotal
FROM        dbo.Student st
JOIN        dbo.AppUser u ON u.UserId = st.UserId
JOIN        dbo.Program p ON p.ProgramId = st.ProgramId
WHERE       u.IsActive = 1
  AND       NOT EXISTS (SELECT 1
                          FROM dbo.Enrollment e
                          JOIN dbo.Section  sec ON sec.SectionId = e.SectionId
                         WHERE e.StudentId = st.UserId
                           AND sec.SemesterId = @SemesterId11
                           AND e.Status = 'Enrolled')
ORDER BY    u.FullName;
GO

/* R3.7 The money page of the term: what was charged, what was collected and what is still
   open, per program. */
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
ORDER BY    CollectionRate DESC;
GO

/* R3.8 The state of the catalogue: how many courses, sections and enrolled students each
   department has, ordered by size, with the courses that never ran a section. */
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
ORDER BY    RegistrationsEver DESC, d.Code;
GO

PRINT 'Reports finished. Run 05_backup_restore.sql next to take the .bak copy.';
GO
