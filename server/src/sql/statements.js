/**
 * Every statement the API runs, in one place.
 *
 * The numbers (A1, B2, C3, D7, S1 ...) are the same numbers that are used in
 * database/03_queries.sql, so a reader of the report can put the two files next to each
 * other: 03_queries.sql is the readable version with sample values, this file is the one
 * the server executes. The statement text is written once and is never built from user
 * input; every input is a bound parameter (@UserId, @SemesterId, ...).
 */

/* =====================================================================================
   A. accounts and sessions                                        (03_queries.sql part A)
   ===================================================================================== */
export const A1_FIND_ACCOUNT_BY_EMAIL = `
SELECT  u.UserId, u.FullName, u.Email, u.PasswordHash, u.Role, u.IsActive, u.LastLoginAt
FROM    dbo.AppUser u
WHERE   u.Email = @Email;`;

export const A2_SESSION_USER = `
SELECT  u.UserId, u.FullName, u.Email, u.Role, u.IsActive, u.CreatedAt, u.LastLoginAt,
        s.StudentNumber, s.Level, s.ProgramId, s.AdvisorId,
        p.Name  AS ProgramName, p.TotalCreditHours,
        i.DepartmentId, d.Name AS DepartmentName, i.Title,
        a.Position, a.CanRecordPayments
FROM        dbo.AppUser u
LEFT JOIN   dbo.Student    s ON s.UserId = u.UserId
LEFT JOIN   dbo.Program    p ON p.ProgramId = s.ProgramId
LEFT JOIN   dbo.Instructor i ON i.UserId = u.UserId
LEFT JOIN   dbo.Department d ON d.DepartmentId = i.DepartmentId
LEFT JOIN   dbo.Admin      a ON a.UserId = u.UserId
WHERE   u.UserId = @UserId;`;

export const A2B_ACCOUNT_BY_ID = `
SELECT  u.UserId, u.FullName, u.Email, u.PasswordHash
FROM    dbo.AppUser u
WHERE   u.UserId = @UserId;`;

export const A3_INSERT_APP_USER = `
INSERT INTO dbo.AppUser (FullName, Email, PasswordHash, Role, IsActive)
OUTPUT INSERTED.UserId
VALUES (@FullName, @Email, @PasswordHash, @Role, @IsActive);`;

export const A4_INSERT_STUDENT = `
INSERT INTO dbo.Student (UserId, StudentNumber, ProgramId, EnrollmentYear, Level)
VALUES (@UserId, @StudentNumber, @ProgramId, @EnrollmentYear, 1);`;

export const A5_INSERT_INSTRUCTOR = `
INSERT INTO dbo.Instructor (UserId, DepartmentId, Title, Specialization)
VALUES (@UserId, @DepartmentId, @Title, @Specialization);`;

export const A6_INSERT_ADMIN = `
INSERT INTO dbo.Admin (UserId, Position, CanRecordPayments)
VALUES (@UserId, @Position, @CanRecordPayments);`;

export const A7_UPDATE_PASSWORD = `
UPDATE dbo.AppUser SET PasswordHash = @PasswordHash WHERE UserId = @UserId;`;

export const A8_TOUCH_LOGIN = `
UPDATE dbo.AppUser SET LastLoginAt = SYSDATETIME() WHERE UserId = @UserId;`;

export const A9_COUNT_ADMINS = `
SELECT COUNT(*) AS AdminCount FROM dbo.AppUser WHERE Role = 'Admin';`;

export const A10_NEXT_STUDENT_NUMBER = `
SELECT CAST(@Year AS VARCHAR(4)) + RIGHT('0000' + CAST(ISNULL(MAX(CAST(RIGHT(StudentNumber, 4) AS INT)), 0) + 1 AS VARCHAR(4)), 4)
       AS NextStudentNumber
FROM   dbo.Student
WHERE  StudentNumber LIKE CAST(@Year AS VARCHAR(4)) + '%';`;


export const A12_DEPARTMENTS = `
SELECT d.DepartmentId, d.Code, d.Name, COUNT(i.UserId) AS Instructors
FROM        dbo.Department d
LEFT JOIN   dbo.Instructor i ON i.DepartmentId = d.DepartmentId
GROUP BY    d.DepartmentId, d.Code, d.Name
ORDER BY    d.Code;`;

export const A13_EMAIL_TAKEN = `
SELECT COUNT(*) AS Taken FROM dbo.AppUser WHERE Email = @Email;`;

/* =====================================================================================
   B. student screens                                              (03_queries.sql part B)
   ===================================================================================== */

export const B1_SEMESTERS = `
SELECT  SemesterId, Name, StartDate, EndDate, RegistrationOpen, RegistrationDeadline, DropDeadline
FROM    dbo.Semester
ORDER BY StartDate DESC;`;

export const B2_OPEN_SEMESTER = `
SELECT TOP 1 SemesterId, Name, StartDate, EndDate, RegistrationOpen, RegistrationDeadline, DropDeadline
FROM    dbo.Semester
WHERE   RegistrationOpen = 1
ORDER BY StartDate DESC;`;

export const B3_CATALOGUE = `
SELECT  sec.SectionId, c.CourseId, c.Code, c.Title, c.CreditHours, c.Level,
        d.Code AS DepartmentCode, d.Name AS DepartmentName,
        u.FullName AS InstructorName,
        r.Building + ' ' + r.RoomNumber AS RoomName,
        sec.SectionCode, sec.Capacity, sec.DayOfWeek, sec.StartTime, sec.EndTime,
        sec.Capacity - COUNT(e.EnrollmentId) AS SeatsLeft,
        CASE WHEN EXISTS (SELECT 1
                            FROM dbo.Prerequisite pr
                           WHERE pr.CourseId = c.CourseId
                             AND NOT EXISTS (SELECT 1
                                               FROM dbo.Enrollment pe
                                               JOIN dbo.Section  ps ON ps.SectionId = pe.SectionId
                                              WHERE pe.StudentId      = @StudentId
                                                AND ps.CourseId       = pr.PrerequisiteCourseId
                                                AND pe.GradePublished = 1
                                                AND pe.Score         >= 60))
             THEN 0 ELSE 1 END AS PrerequisitesMet,
        ISNULL((SELECT SUM(CASE WHEN e2.Status <> 'Dropped' THEN 1 ELSE 0 END)
                  FROM dbo.Enrollment e2
                 WHERE e2.StudentId = @StudentId
                   AND e2.SectionId = sec.SectionId), 0) AS AlreadyRegistered
FROM        dbo.Section sec
JOIN        dbo.Course   c ON c.CourseId     = sec.CourseId
JOIN        dbo.Department d ON d.DepartmentId = c.DepartmentId
JOIN        dbo.AppUser  u ON u.UserId       = sec.InstructorId
JOIN        dbo.Room     r ON r.RoomId       = sec.RoomId
LEFT JOIN   dbo.Enrollment e ON e.SectionId = sec.SectionId AND e.Status IN ('Enrolled', 'Completed')
WHERE       sec.SemesterId = @SemesterId
  AND       (@Search IS NULL OR c.Code LIKE '%' + @Search + '%' OR c.Title LIKE '%' + @Search + '%')
  AND       (@DepartmentId IS NULL OR c.DepartmentId = @DepartmentId)
  AND       (@Level IS NULL OR c.Level = @Level)
GROUP BY    sec.SectionId, c.CourseId, c.Code, c.Title, c.CreditHours, c.Level,
            d.Code, d.Name, u.FullName, r.Building, r.RoomNumber,
            sec.SectionCode, sec.Capacity, sec.DayOfWeek, sec.StartTime, sec.EndTime
ORDER BY    c.Code, sec.SectionCode;`;

export const B4_SECTIONS_WITH_PREREQUISITES = `
SELECT  sec.SectionId, c.Code, c.Title, c.CreditHours,
        STUFF((SELECT ', ' + pc.Code
                 FROM dbo.Prerequisite p
                 JOIN dbo.Course pc ON pc.CourseId = p.PrerequisiteCourseId
                WHERE p.CourseId = c.CourseId
                FOR XML PATH(''), TYPE).value('.', 'NVARCHAR(MAX)'), 1, 2, '') AS PrerequisiteCodes
FROM        dbo.Section sec
JOIN        dbo.Course  c   ON c.CourseId = sec.CourseId
JOIN        dbo.Enrollment e ON e.SectionId = sec.SectionId
WHERE       e.StudentId = @StudentId
  AND       e.Status = 'Enrolled'
ORDER BY    c.Code;`;

export const B5_MY_ENROLLMENTS = `
SELECT  e.EnrollmentId, e.Status, e.EnrolledAt, e.Score, e.LetterGrade, e.GradePoints, e.GradePublished,
        c.Code, c.Title, c.CreditHours, sec.SectionCode,
        u.FullName AS InstructorName,
        r.Building + ' ' + r.RoomNumber AS RoomName,
        sec.DayOfWeek, sec.StartTime, sec.EndTime
FROM        dbo.Enrollment e
JOIN        dbo.Section  sec ON sec.SectionId = e.SectionId
JOIN        dbo.Course   c   ON c.CourseId    = sec.CourseId
JOIN        dbo.AppUser  u   ON u.UserId      = sec.InstructorId
JOIN        dbo.Room     r   ON r.RoomId      = sec.RoomId
WHERE       e.StudentId = @StudentId
  AND       sec.SemesterId = @SemesterId
ORDER BY    sec.DayOfWeek, sec.StartTime;`;

export const B6_TRANSCRIPT = `
SELECT  sem.SemesterId, sem.Name AS SemesterName, sem.StartDate,
        c.Code, c.Title, c.CreditHours, e.Score, e.LetterGrade, e.GradePoints,
        e.Status, e.GradePublished, u.FullName AS InstructorName
FROM        dbo.Enrollment e
JOIN        dbo.Section  sec ON sec.SectionId = e.SectionId
JOIN        dbo.Semester sem ON sem.SemesterId = sec.SemesterId
JOIN        dbo.Course   c   ON c.CourseId    = sec.CourseId
JOIN        dbo.AppUser  u   ON u.UserId      = sec.InstructorId
WHERE       e.StudentId = @StudentId
ORDER BY    sem.StartDate DESC, c.Code;`;

export const B7_GPA_BY_SEMESTER = `
SELECT  g.SemesterId, g.SemesterName, g.CreditHours, g.SemesterGpa
FROM    dbo.vw_StudentGpa g
WHERE   g.StudentId = @StudentId
ORDER BY g.SemesterId;`;

export const B8_CUMULATIVE_GPA = `
SELECT  CAST(SUM(e.GradePoints * c.CreditHours) / NULLIF(SUM(c.CreditHours), 0) AS DECIMAL(4,2)) AS CumulativeGpa,
        SUM(c.CreditHours) AS GradedCreditHours,
        SUM(CASE WHEN e.Score >= 60 THEN c.CreditHours ELSE 0 END) AS PassedCreditHours
FROM        dbo.Enrollment e
JOIN        dbo.Section sec ON sec.SectionId = e.SectionId
JOIN        dbo.Course  c   ON c.CourseId    = sec.CourseId
WHERE       e.StudentId = @StudentId
  AND       e.GradePublished = 1
  AND       e.Status <> 'Dropped';`;

export const B9_TIMETABLE = `
SELECT  sec.DayOfWeek, sec.StartTime, sec.EndTime, c.Code, c.Title, c.CreditHours,
        sec.SectionCode, u.FullName AS InstructorName,
        r.Building + ' ' + r.RoomNumber AS RoomName
FROM        dbo.Enrollment e
JOIN        dbo.Section  sec ON sec.SectionId = e.SectionId
JOIN        dbo.Course   c   ON c.CourseId    = sec.CourseId
JOIN        dbo.AppUser  u   ON u.UserId      = sec.InstructorId
JOIN        dbo.Room     r   ON r.RoomId      = sec.RoomId
WHERE       e.StudentId = @StudentId
  AND       sec.SemesterId = @SemesterId
  AND       e.Status = 'Enrolled'
ORDER BY    sec.DayOfWeek, sec.StartTime;`;


export const B11_FEES_ALL_SEMESTERS = `
SELECT  sem.SemesterId, sem.Name AS SemesterName, sem.StartDate,
        SUM(c.CreditHours) AS CreditHours,
        p.FeePerCreditHour,
        CAST(SUM(c.CreditHours) * p.FeePerCreditHour AS DECIMAL(10,2)) AS FeesDue,
        CAST(ISNULL((SELECT SUM(pm.Amount) FROM dbo.Payment pm
                      WHERE pm.StudentId = @StudentId AND pm.SemesterId = sem.SemesterId), 0) AS DECIMAL(10,2)) AS PaidSoFar,
        CAST(SUM(c.CreditHours) * p.FeePerCreditHour
             - ISNULL((SELECT SUM(pm.Amount) FROM dbo.Payment pm
                        WHERE pm.StudentId = @StudentId AND pm.SemesterId = sem.SemesterId), 0) AS DECIMAL(10,2)) AS Balance
FROM        dbo.Enrollment e
JOIN        dbo.Section  sec ON sec.SectionId = e.SectionId
JOIN        dbo.Course   c   ON c.CourseId    = sec.CourseId
JOIN        dbo.Semester sem ON sem.SemesterId = sec.SemesterId
JOIN        dbo.Student  st  ON st.UserId     = e.StudentId
JOIN        dbo.Program  p   ON p.ProgramId   = st.ProgramId
WHERE       e.StudentId = @StudentId
  AND       e.Status IN ('Enrolled', 'Completed')
GROUP BY    sem.SemesterId, sem.Name, sem.StartDate, p.FeePerCreditHour
ORDER BY    sem.StartDate DESC;`;

export const B12_PAYMENTS_OF_STUDENT = `
SELECT  p.PaymentId, p.Amount, p.PaidAt, p.Method, p.ReceiptNumber,
        sem.Name AS SemesterName, adm.FullName AS RecordedBy
FROM        dbo.Payment  p
JOIN        dbo.Semester sem ON sem.SemesterId = p.SemesterId
JOIN        dbo.AppUser  adm ON adm.UserId     = p.RecordedByAdminId
WHERE       p.StudentId = @StudentId
ORDER BY    p.PaidAt DESC;`;

export const B13_ANNOUNCEMENTS_FOR_STUDENT = `
SELECT  an.AnnouncementId, an.Title, an.Body, an.PostedAt, an.IsPinned,
        c.Code AS CourseCode, sem.Name AS SemesterName,
        u.FullName AS AuthorName, u.Role AS AuthorRole
FROM        dbo.Announcement an
JOIN        dbo.AppUser  u   ON u.UserId      = an.AuthorId
LEFT JOIN   dbo.Section  sec ON sec.SectionId = an.SectionId
LEFT JOIN   dbo.Course   c   ON c.CourseId    = sec.CourseId
LEFT JOIN   dbo.Semester sem ON sem.SemesterId = sec.SemesterId
WHERE       an.SectionId IS NULL
   OR       EXISTS (SELECT 1
                      FROM dbo.Enrollment e
                     WHERE e.StudentId = @StudentId
                       AND e.SectionId = an.SectionId
                       AND e.Status = 'Enrolled')
ORDER BY    an.IsPinned DESC, an.PostedAt DESC;`;

export const B14_ADVISOR_OF_STUDENT = `
SELECT  st.StudentNumber, student.FullName AS StudentName,
        adv.FullName AS AdvisorName, adv.Email AS AdvisorEmail,
        i.Title AS AdvisorTitle, i.Specialization AS AdvisorSpecialization,
        dep.Name AS AdvisorDepartment
FROM        dbo.Student    st
JOIN        dbo.AppUser    student ON student.UserId = st.UserId
LEFT JOIN   dbo.Instructor i       ON i.UserId       = st.AdvisorId
LEFT JOIN   dbo.AppUser    adv     ON adv.UserId     = i.UserId
LEFT JOIN   dbo.Department dep     ON dep.DepartmentId = i.DepartmentId
WHERE       st.UserId = @StudentId;`;

export const B15_ATTENDANCE_SUMMARY = `
SELECT  c.Code, c.Title, sec.SectionCode,
        COUNT(a.AttendanceId) AS Sessions,
        SUM(CASE WHEN a.Status = 'Present' THEN 1 ELSE 0 END) AS Present,
        SUM(CASE WHEN a.Status = 'Absent'  THEN 1 ELSE 0 END) AS Absent,
        SUM(CASE WHEN a.Status = 'Excused' THEN 1 ELSE 0 END) AS Excused,
        CAST(100.0 * SUM(CASE WHEN a.Status IN ('Present', 'Excused') THEN 1 ELSE 0 END)
             / NULLIF(COUNT(a.AttendanceId), 0) AS DECIMAL(5,1)) AS AttendancePercent
FROM        dbo.Enrollment e
JOIN        dbo.Section  sec ON sec.SectionId = e.SectionId
JOIN        dbo.Course   c   ON c.CourseId    = sec.CourseId
LEFT JOIN   dbo.Attendance a ON a.EnrollmentId = e.EnrollmentId
WHERE       e.StudentId = @StudentId
  AND       e.Status IN ('Enrolled', 'Completed')
GROUP BY    c.Code, c.Title, sec.SectionCode
ORDER BY    c.Code;`;

export const B16_ATTENDANCE_DETAIL = `
SELECT  c.Code AS CourseCode, a.SessionDate, a.Status
FROM        dbo.Attendance a
JOIN        dbo.Enrollment e ON e.EnrollmentId = a.EnrollmentId
JOIN        dbo.Section    sec ON sec.SectionId = e.SectionId
JOIN        dbo.Course     c ON c.CourseId = sec.CourseId
WHERE       e.StudentId = @StudentId
ORDER BY    a.SessionDate DESC, c.Code;

`;

export const B17_ENROLLMENT_FOR_DROP = `
SELECT  e.EnrollmentId, e.Status, c.Code, c.Title, c.CreditHours,
        sec.SectionId, sec.SemesterId, sem.RegistrationOpen, sem.DropDeadline
FROM        dbo.Enrollment e
JOIN        dbo.Section  sec ON sec.SectionId = e.SectionId
JOIN        dbo.Course   c   ON c.CourseId    = sec.CourseId
JOIN        dbo.Semester sem ON sem.SemesterId = sec.SemesterId
WHERE       e.EnrollmentId = @EnrollmentId
  AND       e.StudentId = @StudentId;`;

export const B18_CREDIT_LOAD = `
SELECT  SUM(c.CreditHours) AS CreditHours, COUNT(*) AS Courses
FROM        dbo.Enrollment e
JOIN        dbo.Section  sec ON sec.SectionId = e.SectionId
JOIN        dbo.Course   c   ON c.CourseId    = sec.CourseId
JOIN        dbo.Semester sem ON sem.SemesterId = sec.SemesterId
WHERE       e.StudentId = @StudentId
  AND       sem.RegistrationOpen = 1
  AND       e.Status = 'Enrolled';`;


export const B19_SECTION_FOR_CHECK = `
SELECT  sec.SectionId, sec.SemesterId, sec.CourseId, sec.Capacity,
        sec.DayOfWeek, sec.StartTime, sec.EndTime,
        c.Code, c.Title, c.CreditHours,
        (sec.Capacity - (SELECT COUNT(*) FROM dbo.Enrollment e
                          WHERE e.SectionId = sec.SectionId
                            AND e.Status IN ('Enrolled', 'Completed'))) AS SeatsLeft,
        (SELECT COUNT(*) FROM dbo.Enrollment e2
           JOIN dbo.Section s2 ON s2.SectionId = e2.SectionId
          WHERE e2.StudentId = @StudentId
            AND s2.CourseId  = sec.CourseId
            AND e2.Status IN ('Enrolled', 'Completed')) AS AlreadyRegistered
FROM        dbo.Section sec
JOIN        dbo.Course  c ON c.CourseId = sec.CourseId
WHERE       sec.SectionId = @SectionId;`;

export const B20_MISSING_PREREQUISITES = `
SELECT  pc.Code
FROM        dbo.Prerequisite p
JOIN        dbo.Course pc ON pc.CourseId = p.PrerequisiteCourseId
WHERE       p.CourseId = @CourseId
  AND       NOT EXISTS (SELECT 1
                          FROM dbo.Enrollment e
                          JOIN dbo.Section  s ON s.SectionId = e.SectionId
                         WHERE e.StudentId      = @StudentId
                           AND s.CourseId       = p.PrerequisiteCourseId
                           AND e.GradePublished = 1
                           AND e.Score         >= 60)
ORDER BY    pc.Code;`;

export const B21_ANNOUNCEMENTS_FOR_SECTION = `
SELECT  an.AnnouncementId, an.Title, an.Body, an.PostedAt, an.IsPinned,
        u.FullName AS AuthorName, u.Role AS AuthorRole
FROM        dbo.Announcement an
JOIN        dbo.AppUser u ON u.UserId = an.AuthorId
WHERE       an.SectionId = @SectionId
ORDER BY    an.IsPinned DESC, an.PostedAt DESC;`;

/* =====================================================================================
   C. instructor screens                                           (03_queries.sql part C)
   ===================================================================================== */

export const C1_MY_SECTIONS = `
SELECT  sec.SectionId, c.Code, c.Title, c.CreditHours, sec.SectionCode, sec.Capacity,
        r.Building + ' ' + r.RoomNumber AS RoomName,
        sec.DayOfWeek, sec.StartTime, sec.EndTime,
        sem.Name AS SemesterName, sem.SemesterId,
        COUNT(CASE WHEN e.Status <> 'Dropped' THEN 1 END) AS Enrolled,
        CAST(AVG(CASE WHEN e.GradePublished = 1 THEN e.Score END) AS DECIMAL(5,2)) AS AverageScore,
        SUM(CASE WHEN e.GradePublished = 1 THEN 1 ELSE 0 END) AS Published
FROM        dbo.Section sec
JOIN        dbo.Course   c ON c.CourseId  = sec.CourseId
JOIN        dbo.Semester sem ON sem.SemesterId = sec.SemesterId
JOIN        dbo.Room     r ON r.RoomId    = sec.RoomId
LEFT JOIN   dbo.Enrollment e ON e.SectionId = sec.SectionId
WHERE       sec.InstructorId = @InstructorId
  AND       (@SemesterId IS NULL OR sec.SemesterId = @SemesterId)
GROUP BY    sec.SectionId, c.Code, c.Title, c.CreditHours, sec.SectionCode, sec.Capacity,
            r.Building, r.RoomNumber, sec.DayOfWeek, sec.StartTime, sec.EndTime,
            sem.Name, sem.SemesterId
ORDER BY    sem.SemesterId DESC, c.Code;`;

export const C2_ROSTER = `
SELECT  e.EnrollmentId, st.StudentNumber, u.FullName, p.Name AS ProgramName, st.Level,
        e.Status, e.Score, e.LetterGrade, e.GradePublished,
        (SELECT COUNT(*) FROM dbo.Attendance at
          WHERE at.EnrollmentId = e.EnrollmentId) AS Sessions,
        (SELECT COUNT(*) FROM dbo.Attendance at
          WHERE at.EnrollmentId = e.EnrollmentId AND at.Status = 'Absent') AS Absences,
        (SELECT COUNT(*) FROM dbo.Attendance at
          WHERE at.EnrollmentId = e.EnrollmentId AND at.Status = 'Excused') AS Excused
FROM        dbo.Enrollment e
JOIN        dbo.Student    st ON st.UserId = e.StudentId
JOIN        dbo.AppUser    u  ON u.UserId  = e.StudentId
JOIN        dbo.Program    p  ON p.ProgramId = st.ProgramId
WHERE       e.SectionId = @SectionId
ORDER BY    st.StudentNumber;`;

export const C3_SECTION_OF_INSTRUCTOR = `
SELECT  sec.SectionId, sec.SemesterId, c.Code, c.Title, sec.SectionCode
FROM        dbo.Section sec
JOIN        dbo.Course  c ON c.CourseId = sec.CourseId
WHERE       sec.SectionId = @SectionId
  AND       sec.InstructorId = @InstructorId;`;

export const C4_SET_SCORE = `
UPDATE dbo.Enrollment SET Score = @Score WHERE EnrollmentId = @EnrollmentId;`;

export const C5_ENROLLMENT_OF_SECTION = `
SELECT  e.EnrollmentId, e.StudentId, e.Score, e.Status
FROM    dbo.Enrollment e
WHERE   e.EnrollmentId = @EnrollmentId
  AND   e.SectionId = @SectionId;`;

export const C6_SECTION_STATISTICS = `
SELECT  COUNT(*) AS Graded,
        CAST(AVG(e.Score) AS DECIMAL(5,2)) AS AverageScore,
        MAX(e.Score) AS HighestScore,
        MIN(e.Score) AS LowestScore,
        SUM(CASE WHEN e.Score >= 60 THEN 1 ELSE 0 END) AS Passed,
        SUM(CASE WHEN e.Score <  60 THEN 1 ELSE 0 END) AS Failed,
        CAST(100.0 * SUM(CASE WHEN e.Score >= 60 THEN 1 ELSE 0 END)
             / NULLIF(COUNT(*), 0) AS DECIMAL(5,1)) AS PassRate,
        SUM(CASE WHEN e.LetterGrade = 'A'  THEN 1 ELSE 0 END) AS GradeA,
        SUM(CASE WHEN e.LetterGrade = 'A-' THEN 1 ELSE 0 END) AS GradeAMinus,
        SUM(CASE WHEN e.LetterGrade = 'B+' THEN 1 ELSE 0 END) AS GradeBPlus,
        SUM(CASE WHEN e.LetterGrade = 'B'  THEN 1 ELSE 0 END) AS GradeB,
        SUM(CASE WHEN e.LetterGrade = 'B-' THEN 1 ELSE 0 END) AS GradeBMinus,
        SUM(CASE WHEN e.LetterGrade LIKE 'C%' THEN 1 ELSE 0 END) AS GradeC,
        SUM(CASE WHEN e.LetterGrade LIKE 'D%' THEN 1 ELSE 0 END) AS GradeD,
        SUM(CASE WHEN e.LetterGrade = 'F'  THEN 1 ELSE 0 END) AS GradeF
FROM        dbo.Enrollment e
WHERE       e.SectionId = @SectionId
  AND       e.GradePublished = 1;`;

export const C7_ATTENDANCE_RATE = `
SELECT  COUNT(DISTINCT a.SessionDate) AS Sessions,
        COUNT(*) AS AttendanceRows,
        SUM(CASE WHEN a.Status = 'Present' THEN 1 ELSE 0 END) AS Present,
        SUM(CASE WHEN a.Status = 'Absent'  THEN 1 ELSE 0 END) AS Absent,
        SUM(CASE WHEN a.Status = 'Excused' THEN 1 ELSE 0 END) AS Excused,
        CAST(100.0 * SUM(CASE WHEN a.Status IN ('Present', 'Excused') THEN 1 ELSE 0 END)
             / NULLIF(COUNT(*), 0) AS DECIMAL(5,1)) AS AttendanceRate
FROM        dbo.Attendance a
JOIN        dbo.Enrollment e ON e.EnrollmentId = a.EnrollmentId
WHERE       e.SectionId = @SectionId;`;

export const C8_ATTENDANCE_OF_SECTION = `
SELECT  a.AttendanceId, a.EnrollmentId, a.SessionDate, a.Status,
        st.StudentNumber, u.FullName
FROM        dbo.Attendance a
JOIN        dbo.Enrollment e ON e.EnrollmentId = a.EnrollmentId
JOIN        dbo.Student    st ON st.UserId = e.StudentId
JOIN        dbo.AppUser    u  ON u.UserId  = e.StudentId
WHERE       e.SectionId = @SectionId
ORDER BY    a.SessionDate DESC, st.StudentNumber;`;

export const C9_UPSERT_ATTENDANCE = `
MERGE dbo.Attendance AS target
USING (SELECT @EnrollmentId AS EnrollmentId, @SessionDate AS SessionDate, @Status AS Status) AS source
   ON target.EnrollmentId = source.EnrollmentId AND target.SessionDate = source.SessionDate
WHEN MATCHED THEN UPDATE SET Status = source.Status
WHEN NOT MATCHED THEN INSERT (EnrollmentId, SessionDate, Status)
                      VALUES (source.EnrollmentId, source.SessionDate, source.Status);`;

export const C10_INSERT_SECTION_ANNOUNCEMENT = `
INSERT INTO dbo.Announcement (SectionId, AuthorId, Title, Body, IsPinned)
OUTPUT INSERTED.AnnouncementId
VALUES (@SectionId, @AuthorId, @Title, @Body, @IsPinned);`;

export const C11_MY_STUDENTS = `
SELECT DISTINCT st.StudentNumber, u.FullName, st.Level, p.Name AS ProgramName, u.Email
FROM        dbo.Section    sec
JOIN        dbo.Enrollment e  ON e.SectionId = sec.SectionId
JOIN        dbo.Student    st ON st.UserId = e.StudentId
JOIN        dbo.AppUser    u  ON u.UserId = st.UserId
JOIN        dbo.Program    p  ON p.ProgramId = st.ProgramId
WHERE       sec.InstructorId = @InstructorId
  AND       e.Status <> 'Dropped'
ORDER BY    st.StudentNumber;`;

/* =====================================================================================
   D. administration                                               (03_queries.sql part D)
   ===================================================================================== */

export const D1_OVERVIEW = `
DECLARE @OpenSemester INT = (SELECT TOP 1 SemesterId FROM dbo.Semester WHERE RegistrationOpen = 1 ORDER BY StartDate DESC);
SELECT  (SELECT COUNT(*) FROM dbo.AppUser WHERE Role = 'Student'    AND IsActive = 1) AS ActiveStudents,
        (SELECT COUNT(*) FROM dbo.AppUser WHERE Role = 'Instructor' AND IsActive = 0) AS PendingInstructors,
        (SELECT COUNT(*) FROM dbo.Course)                                             AS Courses,
        @OpenSemester                                                                 AS OpenSemesterId,
        (SELECT COUNT(*) FROM dbo.Section WHERE SemesterId = @OpenSemester)           AS SectionsThisSemester,
        (SELECT COUNT(*) FROM dbo.Enrollment e JOIN dbo.Section s ON s.SectionId = e.SectionId
          WHERE s.SemesterId = @OpenSemester AND e.Status = 'Enrolled')               AS EnrollmentsThisSemester,
        (SELECT COUNT(*) FROM dbo.vw_SectionFill f
          WHERE f.SemesterId = @OpenSemester AND f.Enrolled >= f.Capacity)            AS FullSections,
        (SELECT ISNULL(SUM(Amount), 0) FROM dbo.Payment)                              AS CollectedTotal;`;

export const D2_USER_LIST = `
SELECT  u.UserId, u.FullName, u.Email, u.Role, u.IsActive, u.CreatedAt, u.LastLoginAt,
        s.StudentNumber, s.Level, p.Name AS ProgramName,
        i.Title, d.Name AS DepartmentName,
        a.Position
FROM        dbo.AppUser u
LEFT JOIN   dbo.Student    s ON s.UserId = u.UserId
LEFT JOIN   dbo.Program    p ON p.ProgramId = s.ProgramId
LEFT JOIN   dbo.Instructor i ON i.UserId = u.UserId
LEFT JOIN   dbo.Department d ON d.DepartmentId = i.DepartmentId
LEFT JOIN   dbo.Admin      a ON a.UserId = u.UserId
WHERE       (@Role   IS NULL OR u.Role = @Role)
  AND       (@Status IS NULL OR u.IsActive = @Status)
  AND       (@Search IS NULL OR u.FullName LIKE '%' + @Search + '%'
                              OR u.Email LIKE '%' + @Search + '%'
                              OR s.StudentNumber LIKE '%' + @Search + '%')
ORDER BY    u.Role, u.FullName;`;

export const D3_SET_ACTIVE = `
UPDATE dbo.AppUser SET IsActive = @IsActive WHERE UserId = @UserId;`;

export const D4_SECTION_FILL = `
SELECT  f.SectionId, f.SectionCode, f.CourseCode, f.CourseTitle, f.SemesterName, f.SemesterId,
        f.InstructorName, f.RoomName, f.Capacity, f.Enrolled, f.FillPercent
FROM    dbo.vw_SectionFill f
WHERE   (@SemesterId IS NULL OR f.SemesterId = @SemesterId)
ORDER BY f.FillPercent DESC, f.CourseCode;`;

export const D5_COURSE_CATALOGUE = `
SELECT  c.CourseId, c.Code, c.Title, c.CreditHours, c.Level, c.Description,
        d.Code AS DepartmentCode, d.Name AS DepartmentName,
        (SELECT COUNT(*) FROM dbo.Section s WHERE s.CourseId = c.CourseId)      AS SectionCount,
        (SELECT COUNT(*) FROM dbo.Prerequisite p WHERE p.CourseId = c.CourseId) AS PrerequisiteCount
FROM        dbo.Course c
JOIN        dbo.Department d ON d.DepartmentId = c.DepartmentId
WHERE       (@Search IS NULL OR c.Code LIKE '%' + @Search + '%' OR c.Title LIKE '%' + @Search + '%')
ORDER BY    c.Code;`;

export const D6_ROOMS = `
SELECT RoomId, Building, RoomNumber, Capacity, RoomType
FROM   dbo.Room
ORDER BY Building, RoomNumber;`;

export const D7_INSTRUCTOR_OPTIONS = `
SELECT  u.UserId, u.FullName, i.Title, d.Code AS DepartmentCode, d.Name AS DepartmentName
FROM        dbo.Instructor i
JOIN        dbo.AppUser    u ON u.UserId = i.UserId
JOIN        dbo.Department d ON d.DepartmentId = i.DepartmentId
WHERE       (@OnlyActive = 0 OR u.IsActive = 1)
ORDER BY    u.FullName;`;

export const D8_INSERT_COURSE = `
INSERT INTO dbo.Course (Code, Title, CreditHours, DepartmentId, Level, Description)
OUTPUT INSERTED.CourseId
VALUES (@Code, @Title, @CreditHours, @DepartmentId, @Level, @Description);`;

export const D9_UPDATE_COURSE = `
UPDATE dbo.Course
SET    Title = @Title, CreditHours = @CreditHours, Level = @Level, Description = @Description
WHERE  CourseId = @CourseId;`;

export const D10_INSERT_SECTION = `
INSERT INTO dbo.Section (CourseId, SemesterId, InstructorId, RoomId, SectionCode, Capacity,
                         DayOfWeek, StartTime, EndTime)
OUTPUT INSERTED.SectionId
VALUES (@CourseId, @SemesterId, @InstructorId, @RoomId, @SectionCode, @Capacity,
        @DayOfWeek, @StartTime, @EndTime);`;

export const D11_UPDATE_SECTION = `
UPDATE dbo.Section
SET    InstructorId = @InstructorId, RoomId = @RoomId, Capacity = @Capacity,
       DayOfWeek = @DayOfWeek, StartTime = @StartTime, EndTime = @EndTime
WHERE  SectionId = @SectionId;`;

export const D12_DELETE_SECTION = `
DELETE FROM dbo.Section WHERE SectionId = @SectionId;`;

export const D13_SECTION_DEPENDENCIES = `
SELECT  (SELECT COUNT(*) FROM dbo.Enrollment   WHERE SectionId = @SectionId)   AS Enrollments,
        (SELECT COUNT(*) FROM dbo.Announcement WHERE SectionId = @SectionId)   AS Announcements,
        (SELECT COUNT(*) FROM dbo.Section
          WHERE SemesterId     = (SELECT SemesterId FROM dbo.Section WHERE SectionId = @SectionId)
            AND DayOfWeek      = (SELECT DayOfWeek   FROM dbo.Section WHERE SectionId = @SectionId)
            AND RoomId         = (SELECT RoomId      FROM dbo.Section WHERE SectionId = @SectionId)
            AND SectionId     <> @SectionId)                                   AS SectionsInSameRoomSlot;`;

export const D14_SEMESTERS = `
SELECT  s.SemesterId, s.Name, s.StartDate, s.EndDate, s.RegistrationOpen,
        s.RegistrationDeadline, s.DropDeadline,
        (SELECT COUNT(*) FROM dbo.Section sec WHERE sec.SemesterId = s.SemesterId) AS Sections,
        (SELECT COUNT(*) FROM dbo.Enrollment e
           JOIN dbo.Section sec ON sec.SectionId = e.SectionId
          WHERE sec.SemesterId = s.SemesterId AND e.Status = 'Enrolled') AS Enrollments
FROM    dbo.Semester s
ORDER BY s.StartDate DESC;`;

export const D15_INSERT_SEMESTER = `
INSERT INTO dbo.Semester (Name, StartDate, EndDate, RegistrationOpen, RegistrationDeadline, DropDeadline)
OUTPUT INSERTED.SemesterId
VALUES (@Name, @StartDate, @EndDate, @RegistrationOpen, @RegistrationDeadline, @DropDeadline);`;

export const D16_UPDATE_SEMESTER = `
UPDATE dbo.Semester
SET    RegistrationOpen = @RegistrationOpen,
       RegistrationDeadline = @RegistrationDeadline,
       DropDeadline = @DropDeadline
WHERE  SemesterId = @SemesterId;`;

export const D17_INSERT_PAYMENT = `
INSERT INTO dbo.Payment (StudentId, SemesterId, Amount, Method, ReceiptNumber, RecordedByAdminId, PaidAt)
OUTPUT INSERTED.PaymentId
VALUES (@StudentId, @SemesterId, @Amount, @Method, @ReceiptNumber, @AdminId, ISNULL(@PaidAt, SYSDATETIME()));`;

export const D18_NEXT_RECEIPT_NUMBER = `
SELECT 'RC-' + CAST(@SemesterId AS VARCHAR(4)) + RIGHT('00000' + CAST(ISNULL(MAX(CAST(RIGHT(ReceiptNumber, 5) AS INT)), 0) + 1 AS VARCHAR(5)), 5)
       AS NextReceiptNumber
FROM   dbo.Payment
WHERE  ReceiptNumber LIKE 'RC-' + CAST(@SemesterId AS VARCHAR(4)) + '%';`;

export const D19_PAYMENTS = `
SELECT  p.PaymentId, p.PaidAt, p.Amount, p.Method, p.ReceiptNumber,
        st.StudentNumber, stu.FullName AS StudentName,
        sem.Name AS SemesterName, adm.FullName AS RecordedBy
FROM        dbo.Payment  p
JOIN        dbo.Student  st  ON st.UserId = p.StudentId
JOIN        dbo.AppUser  stu ON stu.UserId = st.UserId
JOIN        dbo.Semester sem ON sem.SemesterId = p.SemesterId
JOIN        dbo.Admin    a   ON a.UserId = p.RecordedByAdminId
JOIN        dbo.AppUser  adm ON adm.UserId = a.UserId
WHERE       (@SemesterId IS NULL OR p.SemesterId = @SemesterId)
  AND       (@Search IS NULL OR st.StudentNumber LIKE '%' + @Search + '%'
                              OR stu.FullName LIKE '%' + @Search + '%'
                              OR p.ReceiptNumber LIKE '%' + @Search + '%')
ORDER BY    p.PaidAt DESC, p.PaymentId DESC;`;

export const D20_FEES_NOT_PAID = `
WITH Fees AS (
    SELECT  e.StudentId, sec.SemesterId, SUM(c.CreditHours) AS CreditHours
    FROM        dbo.Enrollment e
    JOIN        dbo.Section sec ON sec.SectionId = e.SectionId
    JOIN        dbo.Course  c   ON c.CourseId    = sec.CourseId
    WHERE       e.Status IN ('Enrolled', 'Completed')
    GROUP BY    e.StudentId, sec.SemesterId
)
SELECT  st.StudentNumber, u.FullName AS StudentName, sem.Name AS SemesterName,
        f.CreditHours, pr.FeePerCreditHour,
        CAST(f.CreditHours * pr.FeePerCreditHour AS DECIMAL(12,2)) AS FeesDue,
        CAST(ISNULL(pd.PaidAmount, 0) AS DECIMAL(12,2)) AS PaidSoFar,
        CAST(f.CreditHours * pr.FeePerCreditHour - ISNULL(pd.PaidAmount, 0) AS DECIMAL(12,2)) AS Balance
FROM        Fees     f
JOIN        dbo.Student st  ON st.UserId = f.StudentId
JOIN        dbo.AppUser u   ON u.UserId  = st.UserId
JOIN        dbo.Program pr  ON pr.ProgramId = st.ProgramId
JOIN        dbo.Semester sem ON sem.SemesterId = f.SemesterId
LEFT JOIN  (SELECT p.StudentId, p.SemesterId, SUM(p.Amount) AS PaidAmount
              FROM dbo.Payment p GROUP BY p.StudentId, p.SemesterId) pd
        ON  pd.StudentId = f.StudentId AND pd.SemesterId = f.SemesterId
WHERE       f.CreditHours * pr.FeePerCreditHour - ISNULL(pd.PaidAmount, 0) <> 0
ORDER BY    Balance DESC;`;

export const D21_GLOBAL_ANNOUNCEMENT = `
INSERT INTO dbo.Announcement (SectionId, AuthorId, Title, Body, IsPinned)
OUTPUT INSERTED.AnnouncementId
VALUES (NULL, @AuthorId, @Title, @Body, @IsPinned);`;

export const D22_ANNOUNCEMENTS = `
SELECT  an.AnnouncementId, an.Title, an.Body, an.PostedAt, an.IsPinned,
        u.FullName AS AuthorName, u.Role AS AuthorRole,
        c.Code AS CourseCode, sem.Name AS SemesterName
FROM        dbo.Announcement an
JOIN        dbo.AppUser  u   ON u.UserId = an.AuthorId
LEFT JOIN   dbo.Section  sec ON sec.SectionId = an.SectionId
LEFT JOIN   dbo.Course   c   ON c.CourseId = sec.CourseId
LEFT JOIN   dbo.Semester sem ON sem.SemesterId = sec.SemesterId
ORDER BY    an.IsPinned DESC, an.PostedAt DESC;`;

export const D23_DELETE_ANNOUNCEMENT = `
DELETE FROM dbo.Announcement WHERE AnnouncementId = @AnnouncementId;`;

export const D24_SECTION_BY_ID = `
SELECT  sec.SectionId, sec.CourseId, sec.SemesterId, sec.InstructorId, sec.RoomId,
        sec.SectionCode, sec.Capacity, sec.DayOfWeek, sec.StartTime, sec.EndTime,
        c.Code, c.Title, c.CreditHours, sem.Name AS SemesterName
FROM        dbo.Section sec
JOIN        dbo.Course   c   ON c.CourseId   = sec.CourseId
JOIN        dbo.Semester sem ON sem.SemesterId = sec.SemesterId
WHERE       sec.SectionId = @SectionId;`;

export const D25_ROOM_CLASH = `
SELECT  sec.SectionId, c.Code, sec.SectionCode
FROM        dbo.Section sec
JOIN        dbo.Course  c ON c.CourseId = sec.CourseId
WHERE       sec.SemesterId = @SemesterId
  AND       sec.RoomId     = @RoomId
  AND       sec.DayOfWeek  = @DayOfWeek
  AND       sec.SectionId <> @SectionId
  AND       @StartTime < sec.EndTime
  AND       @EndTime   > sec.StartTime;`;

export const D26_INSTRUCTOR_CLASH = `
SELECT  sec.SectionId, c.Code, sec.SectionCode
FROM        dbo.Section sec
JOIN        dbo.Course  c ON c.CourseId = sec.CourseId
WHERE       sec.SemesterId  = @SemesterId
  AND       sec.InstructorId = @InstructorId
  AND       sec.DayOfWeek    = @DayOfWeek
  AND       sec.SectionId   <> @SectionId
  AND       @StartTime < sec.EndTime
  AND       @EndTime   > sec.StartTime;`;

export const D27_STUDENT_FOR_PAYMENT = `
SELECT  st.UserId, st.StudentNumber, u.FullName, u.IsActive
FROM        dbo.Student st
JOIN        dbo.AppUser u ON u.UserId = st.UserId
WHERE       st.UserId = @StudentId;`;

export const D29_ROOM_BY_ID = `
SELECT RoomId, Building, RoomNumber, Capacity, RoomType
FROM   dbo.Room WHERE RoomId = @RoomId;`;

export const D30_INSTRUCTOR_BY_ID = `
SELECT  u.UserId, u.FullName, i.Title, d.Code AS DepartmentCode, u.IsActive
FROM        dbo.Instructor i
JOIN        dbo.AppUser    u ON u.UserId = i.UserId
JOIN        dbo.Department d ON d.DepartmentId = i.DepartmentId
WHERE       i.UserId = @UserId;`;

export const D28_SEMESTER_BY_ID = `
SELECT SemesterId, Name, StartDate, EndDate, RegistrationOpen, RegistrationDeadline, DropDeadline
FROM   dbo.Semester WHERE SemesterId = @SemesterId;`;

export const D31_STUDENT_OPTIONS = `
SELECT  st.UserId, st.StudentNumber, u.FullName, p.Name AS ProgramName, st.Level
FROM        dbo.Student st
JOIN        dbo.AppUser u ON u.UserId = st.UserId
JOIN        dbo.Program p ON p.ProgramId = st.ProgramId
ORDER BY    st.StudentNumber;`;

/* =====================================================================================
   S. shared lookups
   ===================================================================================== */

export const S1_PROGRAMS_FOR_SIGNUP = `
SELECT p.ProgramId, p.Name, p.TotalCreditHours, d.Code AS DepartmentCode
FROM   dbo.Program p
JOIN   dbo.Department d ON d.DepartmentId = p.DepartmentId
ORDER BY p.Name;`;

export const S2_DEPARTMENTS_FOR_SIGNUP = `
SELECT DepartmentId, Code, Name
FROM   dbo.Department
WHERE  Code IN ('CSAI', 'MATH', 'BIOM', 'GENE')
ORDER BY Code;`;

export const S3_PUBLIC_SUMMARY = `
SELECT  (SELECT COUNT(*) FROM dbo.Student)                                  AS Students,
        (SELECT COUNT(*) FROM dbo.Course)                                   AS Courses,
        (SELECT COUNT(*) FROM dbo.Section)                                  AS Sections,
        (SELECT COUNT(*) FROM dbo.AppUser WHERE Role = 'Instructor')        AS Instructors,
        (SELECT COUNT(*) FROM dbo.Semester)                                 AS Semesters,
        (SELECT COUNT(*) FROM dbo.Enrollment)                               AS Enrollments;`;

export const S4_MY_SECTIONS_TODAY = `
SELECT  sec.SectionId, c.Code, c.Title, sec.SectionCode,
        sec.DayOfWeek, sec.StartTime, sec.EndTime,
        r.Building + ' ' + r.RoomNumber AS RoomName
FROM        dbo.Section sec
JOIN        dbo.Course  c ON c.CourseId = sec.CourseId
JOIN        dbo.Room    r ON r.RoomId = sec.RoomId
WHERE       sec.SemesterId = (SELECT TOP 1 SemesterId FROM dbo.Semester WHERE RegistrationOpen = 1 ORDER BY StartDate DESC)
ORDER BY    sec.DayOfWeek, sec.StartTime;`;

export const S5_TABLE_COUNTS = `
SELECT  'AppUser' AS TableName, COUNT(*) AS Rows FROM dbo.AppUser
UNION ALL SELECT 'Student',      COUNT(*) FROM dbo.Student
UNION ALL SELECT 'Instructor',   COUNT(*) FROM dbo.Instructor
UNION ALL SELECT 'Admin',        COUNT(*) FROM dbo.Admin
UNION ALL SELECT 'Course',       COUNT(*) FROM dbo.Course
UNION ALL SELECT 'Section',      COUNT(*) FROM dbo.Section
UNION ALL SELECT 'Enrollment',   COUNT(*) FROM dbo.Enrollment
UNION ALL SELECT 'Attendance',   COUNT(*) FROM dbo.Attendance
UNION ALL SELECT 'Payment',      COUNT(*) FROM dbo.Payment
UNION ALL SELECT 'Announcement', COUNT(*) FROM dbo.Announcement
ORDER BY TableName;`;
