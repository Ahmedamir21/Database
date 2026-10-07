/* =====================================================================================
   Zewail Desk - CSAI 202 Database Systems - the queries the application needs
   =====================================================================================
   Every query the API runs is written here once, with a number, so that the report of the
   project can point at one place. In the server the same statement is executed with
   parameters (@UserId, @SemesterId, ...); here the parameters are declared as variables so
   the file can be pasted into SQL Server Management Studio and demonstrated row by row.

   Rule of the project: the application never touches a table directly and never builds SQL
   by joining strings. Every statement below is parameterised where it takes input.
   ===================================================================================== */

USE ZewailDesk;
GO
SET NOCOUNT ON;
GO

/* =====================================================================================
   A. Authentication and the account of the signed in user
   ===================================================================================== */

/* A1. Find the account behind an e-mail. The password hash is returned only to the login
   route, which compares it with bcrypt and never sends it to the client. */
DECLARE @Email VARCHAR(150) = 'ahmed.hassan@zewailcity.edu.eg';
SELECT  u.UserId, u.FullName, u.Email, u.PasswordHash, u.Role, u.IsActive, u.LastLoginAt
FROM    dbo.AppUser u
WHERE   u.Email = @Email;
GO

/* A2. Everything the header of the application needs after a successful login. */
DECLARE @UserId INT = 1;
SELECT  u.UserId, u.FullName, u.Email, u.Role, u.IsActive,
        s.StudentNumber, s.Level, s.ProgramId, p.Name AS ProgramName,
        i.DepartmentId, d.Name AS DepartmentName, i.Title,
        a.Position
FROM        dbo.AppUser u
LEFT JOIN   dbo.Student    s ON s.UserId = u.UserId
LEFT JOIN   dbo.Program    p ON p.ProgramId = s.ProgramId
LEFT JOIN   dbo.Instructor i ON i.UserId = u.UserId
LEFT JOIN   dbo.Department d ON d.DepartmentId = i.DepartmentId
LEFT JOIN   dbo.Admin      a ON a.UserId = u.UserId
WHERE   u.UserId = @UserId;
GO

/* A3. Sign up of a student. The API runs these three statements in ONE transaction, so a
   person never exists without their subtype row. The hash is produced by bcryptjs. */
-- INSERT INTO dbo.AppUser (FullName, Email, PasswordHash, Role, IsActive) VALUES (@FullName, @Email, @Hash, 'Student', 1);
-- INSERT INTO dbo.Student (UserId, StudentNumber, ProgramId, EnrollmentYear, Level) VALUES (SCOPE_IDENTITY(), @StudentNumber, @ProgramId, @Year, 1);
-- same shape for an instructor sign up, with IsActive = 0 until an admin approves the account:
-- INSERT INTO dbo.Instructor (UserId, DepartmentId, Title, Specialization) VALUES (SCOPE_IDENTITY(), @DepartmentId, 'T.A.', @Specialization);

/* A4. Change the password of the signed in user. */
-- UPDATE dbo.AppUser SET PasswordHash = @NewHash WHERE UserId = @UserId;

/* A5. Remember the last login so the admin screen can show inactive accounts. */
-- UPDATE dbo.AppUser SET LastLoginAt = SYSDATETIME() WHERE UserId = @UserId;

/* A6. Number of administrators, used before an admin account is created. */
SELECT COUNT(*) AS AdminCount FROM dbo.AppUser WHERE Role = 'Admin';
GO

/* =====================================================================================
   B. Student area
   ===================================================================================== */

/* B1. The course catalogue of the open semester, with the teacher, the free seats and the
   prerequisite codes. @Search, @DepartmentId and @CreditHours are NULL when the student
   did not filter; the pattern for the text search is built in T-SQL, not in the client. */
DECLARE @SemesterId INT = 3, @Search NVARCHAR(80) = NULL, @DepartmentId INT = NULL, @CreditHours INT = NULL;
SELECT  sec.SectionId,
        c.CourseId, c.Code, c.Title, c.CreditHours, c.Level,
        d.Code AS DepartmentCode, d.Name AS DepartmentName,
        u.FullName AS InstructorName,
        r.Building + ' ' + r.RoomNumber AS RoomName,
        sec.SectionCode, sec.Capacity, sec.DayOfWeek, sec.StartTime, sec.EndTime,
        (sec.Capacity - COUNT(e.EnrollmentId)) AS SeatsLeft,
        STUFF((SELECT ', ' + pc.Code
                 FROM dbo.Prerequisite p
                 JOIN dbo.Course pc ON pc.CourseId = p.PrerequisiteCourseId
                WHERE p.CourseId = c.CourseId
                FOR XML PATH(''), TYPE).value('.', 'NVARCHAR(MAX)'), 1, 2, '') AS PrerequisiteCodes
FROM        dbo.Section sec
JOIN        dbo.Course   c ON c.CourseId     = sec.CourseId
JOIN        dbo.Department d ON d.DepartmentId = c.DepartmentId
JOIN        dbo.AppUser  u ON u.UserId       = sec.InstructorId
JOIN        dbo.Room     r ON r.RoomId       = sec.RoomId
LEFT JOIN   dbo.Enrollment e ON e.SectionId = sec.SectionId AND e.Status = 'Enrolled'
WHERE       sec.SemesterId = @SemesterId
  AND       (@Search IS NULL OR c.Code LIKE '%' + @Search + '%' OR c.Title LIKE '%' + @Search + '%')
  AND       (@DepartmentId IS NULL OR c.DepartmentId = @DepartmentId)
  AND       (@CreditHours IS NULL OR c.CreditHours = @CreditHours)
GROUP BY    sec.SectionId, c.CourseId, c.Code, c.Title, c.CreditHours, c.Level,
            d.Code, d.Name, u.FullName, r.Building, r.RoomNumber,
            sec.SectionCode, sec.Capacity, sec.DayOfWeek, sec.StartTime, sec.EndTime
ORDER BY    c.Code, sec.SectionCode;
GO

/* B2. The sections of one student in one semester, with the room and the teacher. */
DECLARE @StudentId INT = 9, @SemesterId2 INT = 3;
SELECT  e.EnrollmentId, e.Status, e.Score, e.LetterGrade, e.GradePoints, e.GradePublished,
        c.Code, c.Title, c.CreditHours, sec.SectionCode,
        u.FullName AS InstructorName, r.Building + ' ' + r.RoomNumber AS RoomName,
        sec.DayOfWeek, sec.StartTime, sec.EndTime
FROM        dbo.Enrollment e
JOIN        dbo.Section  sec ON sec.SectionId = e.SectionId
JOIN        dbo.Course   c   ON c.CourseId    = sec.CourseId
JOIN        dbo.AppUser  u   ON u.UserId      = sec.InstructorId
JOIN        dbo.Room     r   ON r.RoomId      = sec.RoomId
WHERE       e.StudentId  = @StudentId
  AND       sec.SemesterId = @SemesterId2
  AND       e.Status <> 'Dropped'
ORDER BY    sec.DayOfWeek, sec.StartTime;
GO

/* B3. The full transcript of a student, semester by semester, with the grade of each course. */
DECLARE @StudentId3 INT = 9;
SELECT  sem.SemesterId, sem.Name AS SemesterName, sem.StartDate,
        c.Code, c.Title, c.CreditHours, e.Score, e.LetterGrade, e.GradePoints, e.Status,
        u.FullName AS InstructorName
FROM        dbo.Enrollment e
JOIN        dbo.Section  sec ON sec.SectionId = e.SectionId
JOIN        dbo.Semester sem ON sem.SemesterId = sec.SemesterId
JOIN        dbo.Course   c   ON c.CourseId    = sec.CourseId
JOIN        dbo.AppUser  u   ON u.UserId      = sec.InstructorId
WHERE       e.StudentId = @StudentId3
  AND       e.Status <> 'Dropped'
ORDER BY    sem.StartDate DESC, c.Code;
GO

/* B4. The GPA of every finished semester, plus the cumulative GPA. The per-semester part
   reuses the view vw_StudentGpa, so the arithmetic is written once (in the view). */
DECLARE @StudentId4 INT = 9;
SELECT  g.SemesterName, g.CreditHours, g.SemesterGpa
FROM    dbo.vw_StudentGpa g
WHERE   g.StudentId = @StudentId4
ORDER BY g.SemesterId;
GO

DECLARE @StudentId5 INT = 9;
SELECT  CAST(SUM(e.GradePoints * c.CreditHours) / NULLIF(SUM(c.CreditHours), 0) AS DECIMAL(4,2)) AS CumulativeGpa,
        SUM(c.CreditHours) AS GradedCreditHours
FROM    dbo.Enrollment e
JOIN    dbo.Section sec ON sec.SectionId = e.SectionId
JOIN    dbo.Course  c   ON c.CourseId    = sec.CourseId
WHERE   e.StudentId = @StudentId5
  AND   e.GradePublished = 1
  AND   e.Status <> 'Dropped';
GO

/* B5. The weekly timetable of one student: the data is returned as rows and the client
   draws the grid, days as columns and time slots as rows. */
DECLARE @StudentId6 INT = 9, @SemesterId3 INT = 3;
SELECT  sec.DayOfWeek, sec.StartTime, sec.EndTime, c.Code, c.Title,
        sec.SectionCode, u.FullName AS InstructorName,
        r.Building + ' ' + r.RoomNumber AS RoomName
FROM        dbo.Enrollment e
JOIN        dbo.Section  sec ON sec.SectionId = e.SectionId
JOIN        dbo.Course   c   ON c.CourseId    = sec.CourseId
JOIN        dbo.AppUser  u   ON u.UserId      = sec.InstructorId
JOIN        dbo.Room     r   ON r.RoomId      = sec.RoomId
WHERE       e.StudentId = @StudentId6
  AND       sec.SemesterId = @SemesterId3
  AND       e.Status = 'Enrolled'
ORDER BY    sec.DayOfWeek, sec.StartTime;
GO

/* B6. Fees of a semester: credit hours of the Enrolled and Completed registrations times the
   fee per credit hour of the program of the student. Dropped courses cost nothing. */
DECLARE @StudentId7 INT = 9, @SemesterId4 INT = 3;
SELECT  @StudentId7 AS StudentId, sem.Name AS SemesterName,
        SUM(c.CreditHours) AS CreditHours, p.FeePerCreditHour,
        CAST(SUM(c.CreditHours) * p.FeePerCreditHour AS DECIMAL(10,2)) AS FeesDue
FROM        dbo.Enrollment e
JOIN        dbo.Section  sec ON sec.SectionId = e.SectionId
JOIN        dbo.Course   c   ON c.CourseId    = sec.CourseId
JOIN        dbo.Semester sem ON sem.SemesterId = sec.SemesterId
JOIN        dbo.Student  st  ON st.UserId     = e.StudentId
JOIN        dbo.Program  p   ON p.ProgramId   = st.ProgramId
WHERE       e.StudentId = @StudentId7
  AND       sec.SemesterId = @SemesterId4
  AND       e.Status IN ('Enrolled', 'Completed')
GROUP BY    sem.Name, p.FeePerCreditHour;
GO

/* B7. Payments of a student and the balance of the semester (fees minus payments). */
DECLARE @StudentId8 INT = 9;
SELECT  sem.Name AS SemesterName, p.PaymentId, p.Amount, p.PaidAt, p.Method, p.ReceiptNumber,
        a.FullName AS RecordedBy
FROM        dbo.Payment p
JOIN        dbo.Semester sem ON sem.SemesterId = p.SemesterId
JOIN        dbo.Admin    ad  ON ad.UserId      = p.RecordedByAdminId
JOIN        dbo.AppUser  a   ON a.UserId       = ad.UserId
WHERE       p.StudentId = @StudentId8
ORDER BY    p.PaidAt DESC;
GO

/* B8. Announcements a student must see: the global ones plus the ones of the sections the
   student is registered in. Pinned announcements come first. */
DECLARE @StudentId9 INT = 9;
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
                     WHERE e.StudentId = @StudentId9
                       AND e.SectionId = an.SectionId
                       AND e.Status = 'Enrolled')
ORDER BY    an.IsPinned DESC, an.PostedAt DESC;
GO

/* B9. The advisor of a student, shown on the profile page. The advisor is an instructor,
   so the name and the e-mail live in AppUser behind the Instructor row. */
DECLARE @StudentId10 INT = 9;
SELECT  st.StudentNumber,
        student.FullName                                             AS StudentName,
        adv.FullName                                                 AS AdvisorName,
        adv.Email                                                    AS AdvisorEmail,
        i.Title                                                      AS AdvisorTitle,
        i.Specialization                                             AS AdvisorSpecialization,
        dep.Name                                                     AS AdvisorDepartment
FROM        dbo.Student    st
JOIN        dbo.AppUser    student ON student.UserId   = st.UserId
LEFT JOIN   dbo.Instructor i       ON i.UserId         = st.AdvisorId
LEFT JOIN   dbo.AppUser    adv     ON adv.UserId       = i.UserId
LEFT JOIN   dbo.Department dep     ON dep.DepartmentId = i.DepartmentId
WHERE       st.UserId = @StudentId10;
GO

/* =====================================================================================
   C. Instructor area
   ===================================================================================== */

/* C1. The sections of the signed in instructor in the open semester, with the number of
   registered students and the average score of the published ones. */
DECLARE @InstructorId INT = 1, @SemesterId5 INT = 3;
SELECT  sec.SectionId, c.Code, c.Title, c.CreditHours, sec.SectionCode, sec.Capacity,
        r.Building + ' ' + r.RoomNumber AS RoomName,
        sec.DayOfWeek, sec.StartTime, sec.EndTime,
        COUNT(e.EnrollmentId) AS Enrolled,
        CAST(AVG(CASE WHEN e.GradePublished = 1 THEN e.Score END) AS DECIMAL(5,2)) AS AverageScore
FROM        dbo.Section sec
JOIN        dbo.Course   c ON c.CourseId  = sec.CourseId
JOIN        dbo.Room     r ON r.RoomId    = sec.RoomId
LEFT JOIN   dbo.Enrollment e ON e.SectionId = sec.SectionId AND e.Status <> 'Dropped'
WHERE       sec.InstructorId = @InstructorId
  AND       sec.SemesterId   = @SemesterId5
GROUP BY    sec.SectionId, c.Code, c.Title, c.CreditHours, sec.SectionCode, sec.Capacity,
            r.Building, r.RoomNumber, sec.DayOfWeek, sec.StartTime, sec.EndTime
ORDER BY    c.Code;
GO

/* C2. The class roster with the attendance summary of each student. The two sub queries
   count sessions of this section and the absences of the student in this section. */
DECLARE @SectionId INT = 1;
SELECT  e.EnrollmentId, st.StudentNumber, u.FullName, p.Name AS ProgramName, st.Level,
        e.Status, e.Score, e.LetterGrade,
        (SELECT COUNT(*) FROM dbo.Attendance at
          WHERE at.EnrollmentId = e.EnrollmentId)                       AS Sessions,
        (SELECT COUNT(*) FROM dbo.Attendance at
          WHERE at.EnrollmentId = e.EnrollmentId AND at.Status = 'Absent') AS Absences,
        (SELECT COUNT(*) FROM dbo.Attendance at
          WHERE at.EnrollmentId = e.EnrollmentId AND at.Status = 'Excused') AS Excused
FROM        dbo.Enrollment e
JOIN        dbo.Student    st ON st.UserId = e.StudentId
JOIN        dbo.AppUser    u  ON u.UserId  = e.StudentId
JOIN        dbo.Program    p  ON p.ProgramId = st.ProgramId
WHERE       e.SectionId = @SectionId
ORDER BY    st.StudentNumber;
GO

/* C3. Enter or change a score. The trigger TR_Enrollment_SetGrade writes the letter grade
   and the grade points, so the API only stores the number the teacher typed. */
-- UPDATE dbo.Enrollment SET Score = @Score WHERE EnrollmentId = @EnrollmentId;

/* C4. Attendance of one session: the instructor sends one row per student. The MERGE
   updates the status when the session is edited and inserts it the first time. */
DECLARE @SessionDate DATE = '2026-10-04';
MERGE dbo.Attendance AS target
USING (SELECT e.EnrollmentId, @SessionDate AS SessionDate, 'Present' AS Status
         FROM dbo.Enrollment e
        WHERE e.SectionId = 1 AND e.Status = 'Enrolled') AS source
   ON target.EnrollmentId = source.EnrollmentId AND target.SessionDate = source.SessionDate
WHEN MATCHED THEN UPDATE SET Status = source.Status
WHEN NOT MATCHED THEN INSERT (EnrollmentId, SessionDate, Status)
                      VALUES (source.EnrollmentId, source.SessionDate, source.Status);
GO

/* C5. The sections of a teacher in one semester with the statistics screen behind them:
   average, highest, lowest, pass rate and the grade distribution. */
DECLARE @SectionId2 INT = 1;
SELECT  COUNT(*)                                                        AS Graded,
        CAST(AVG(e.Score) AS DECIMAL(5,2))                              AS AverageScore,
        MAX(e.Score)                                                    AS HighestScore,
        MIN(e.Score)                                                    AS LowestScore,
        SUM(CASE WHEN e.Score >= 60 THEN 1 ELSE 0 END)                  AS Passed,
        SUM(CASE WHEN e.Score <  60 THEN 1 ELSE 0 END)                  AS Failed,
        CAST(100.0 * SUM(CASE WHEN e.Score >= 60 THEN 1 ELSE 0 END)
             / NULLIF(COUNT(*), 0) AS DECIMAL(5,1))                     AS PassRate,
        SUM(CASE WHEN e.LetterGrade = 'A'  THEN 1 ELSE 0 END)           AS GradeA,
        SUM(CASE WHEN e.LetterGrade = 'A-' THEN 1 ELSE 0 END)           AS GradeAMinus,
        SUM(CASE WHEN e.LetterGrade = 'B+' THEN 1 ELSE 0 END)           AS GradeBPlus,
        SUM(CASE WHEN e.LetterGrade = 'B'  THEN 1 ELSE 0 END)           AS GradeB,
        SUM(CASE WHEN e.LetterGrade = 'B-' THEN 1 ELSE 0 END)           AS GradeBMinus,
        SUM(CASE WHEN e.LetterGrade LIKE 'C%' THEN 1 ELSE 0 END)        AS GradeC,
        SUM(CASE WHEN e.LetterGrade LIKE 'D%' THEN 1 ELSE 0 END)        AS GradeD,
        SUM(CASE WHEN e.LetterGrade = 'F'  THEN 1 ELSE 0 END)           AS GradeF
FROM        dbo.Enrollment e
WHERE       e.SectionId = @SectionId2
  AND       e.GradePublished = 1;
GO

/* C6. Attendance rate of a section: sessions recorded and the percentage of the students
   that were present (excused absences are not counted against the student). */
DECLARE @SectionId3 INT = 1;
SELECT  COUNT(DISTINCT a.SessionDate)                                        AS Sessions,
        COUNT(*)                                                             AS AttendanceRows,
        SUM(CASE WHEN a.Status = 'Present' THEN 1 ELSE 0 END)                AS Present,
        SUM(CASE WHEN a.Status = 'Absent'  THEN 1 ELSE 0 END)                AS Absent,
        SUM(CASE WHEN a.Status = 'Excused' THEN 1 ELSE 0 END)                AS Excused,
        CAST(100.0 * SUM(CASE WHEN a.Status IN ('Present', 'Excused') THEN 1 ELSE 0 END)
             / NULLIF(COUNT(*), 0) AS DECIMAL(5,1))                          AS AttendanceRate
FROM        dbo.Attendance a
JOIN        dbo.Enrollment e ON e.EnrollmentId = a.EnrollmentId
WHERE       e.SectionId = @SectionId3;
GO

/* C7. The instructor publishes the grades of a section: the stored procedure checks that
   nobody is missing a score and then flips GradePublished, which makes the trigger write
   the letters and the points. */
-- EXEC dbo.sp_PublishGrades @SectionId = 1;

/* =====================================================================================
   D. Admin area
   ===================================================================================== */

/* D1. The numbers of the admin overview screen. */
DECLARE @OpenSemester INT = 3;
SELECT  (SELECT COUNT(*) FROM dbo.AppUser WHERE Role = 'Student'    AND IsActive = 1) AS ActiveStudents,
        (SELECT COUNT(*) FROM dbo.AppUser WHERE Role = 'Instructor' AND IsActive = 0) AS PendingInstructors,
        (SELECT COUNT(*) FROM dbo.Course)                                             AS Courses,
        (SELECT COUNT(*) FROM dbo.Section WHERE SemesterId = @OpenSemester)           AS SectionsThisSemester,
        (SELECT COUNT(*) FROM dbo.Enrollment e JOIN dbo.Section s ON s.SectionId = e.SectionId
          WHERE s.SemesterId = @OpenSemester AND e.Status = 'Enrolled')               AS EnrollmentsThisSemester,
        (SELECT COUNT(*) FROM dbo.vw_SectionFill f
          WHERE f.SemesterId = @OpenSemester AND f.Enrolled >= f.Capacity)            AS FullSections,
        (SELECT ISNULL(SUM(Amount), 0) FROM dbo.Payment)                              AS CollectedTotal;
GO

/* D2. The user list of the admin screen with the optional filters of role and status. */
DECLARE @Role VARCHAR(12) = NULL, @Status BIT = NULL;
SELECT  u.UserId, u.FullName, u.Email, u.Role, u.IsActive, u.CreatedAt, u.LastLoginAt,
        s.StudentNumber, s.Level, p.Name AS ProgramName,
        i.Title, d.Name AS DepartmentName
FROM        dbo.AppUser u
LEFT JOIN   dbo.Student    s ON s.UserId = u.UserId
LEFT JOIN   dbo.Program    p ON p.ProgramId = s.ProgramId
LEFT JOIN   dbo.Instructor i ON i.UserId = u.UserId
LEFT JOIN   dbo.Department d ON d.DepartmentId = i.DepartmentId
WHERE       (@Role   IS NULL OR u.Role = @Role)
  AND       (@Status IS NULL OR u.IsActive = @Status)
ORDER BY    u.Role, u.FullName;
GO

/* D3. Activate or deactivate an account (the approve button of a pending instructor). */
-- UPDATE dbo.AppUser SET IsActive = @IsActive WHERE UserId = @UserId;

/* D4. Create another administrator. Only an admin reaches this route, and the new account
   is stored with a bcrypt hash of the password the admin typed. */
-- INSERT INTO dbo.AppUser (FullName, Email, PasswordHash, Role, IsActive) VALUES (@FullName, @Email, @Hash, 'Admin', 1);
-- INSERT INTO dbo.Admin (UserId, Position, CanRecordPayments) VALUES (SCOPE_IDENTITY(), @Position, @CanRecordPayments);

/* D5. Record a payment for a student (the finance desk). The receipt number is generated by
   the API as RC-<semester><running number>, and it is unique in the table. */
-- INSERT INTO dbo.Payment (StudentId, SemesterId, Amount, Method, ReceiptNumber, RecordedByAdminId)
-- VALUES (@StudentId, @SemesterId, @Amount, @Method, @ReceiptNumber, @AdminId);

/* D6. Open or close the registration of a semester and set its deadlines. */
-- UPDATE dbo.Semester SET RegistrationOpen = @Open, RegistrationDeadline = @RegDeadline, DropDeadline = @DropDeadline
--  WHERE SemesterId = @SemesterId;

/* D7. Outside the registration window the admin needs to know which section is full, so the
   section screen reads the fill view instead of counting enrolments in the client. */
SELECT  f.SectionId, f.CourseCode, f.CourseTitle, f.SemesterName, f.SectionCode,
        f.InstructorName, f.RoomName, f.Capacity, f.Enrolled, f.FillPercent
FROM    dbo.vw_SectionFill f
WHERE   f.SemesterName = 'Fall 2026'
ORDER BY f.FillPercent DESC, f.CourseCode;
GO

/* D8. The catalogue screen of the admin: courses with their department, the number of
   sections they already have and the number of prerequisites. */
SELECT  c.CourseId, c.Code, c.Title, c.CreditHours, c.Level,
        d.Code AS DepartmentCode, d.Name AS DepartmentName,
        (SELECT COUNT(*) FROM dbo.Section s WHERE s.CourseId = c.CourseId)      AS SectionCount,
        (SELECT COUNT(*) FROM dbo.Prerequisite p WHERE p.CourseId = c.CourseId) AS PrerequisiteCount
FROM        dbo.Course c
JOIN        dbo.Department d ON d.DepartmentId = c.DepartmentId
ORDER BY    c.Code;
GO

/* D9. Everything the admin needs to fill a dropdown, in one round trip: departments,
   programs, semesters, rooms and instructors. Four small tables, one result set each. */
SELECT DepartmentId, Code, Name FROM dbo.Department ORDER BY Code;
SELECT ProgramId, Name, TotalCreditHours, FeePerCreditHour FROM dbo.Program ORDER BY Name;
SELECT SemesterId, Name, RegistrationOpen, StartDate, EndDate FROM dbo.Semester ORDER BY StartDate DESC;
SELECT RoomId, Building, RoomNumber, Capacity, RoomType FROM dbo.Room ORDER BY Building, RoomNumber;
SELECT u.UserId, u.FullName, i.Title, d.Code AS DepartmentCode
FROM   dbo.Instructor i
JOIN   dbo.AppUser u ON u.UserId = i.UserId
JOIN   dbo.Department d ON d.DepartmentId = i.DepartmentId
ORDER BY u.FullName;
GO

/* D10. A delete is only allowed when nothing depends on the row. This query answers the
   question "may I delete this section / course / semester?" before the API tries it, so the
   screen can disable the button with a reason instead of showing a foreign key error. */
DECLARE @SectionId4 INT = 1;
SELECT  (SELECT COUNT(*) FROM dbo.Enrollment WHERE SectionId = @SectionId4)     AS Enrollments,
        (SELECT COUNT(*) FROM dbo.Announcement WHERE SectionId = @SectionId4)   AS Announcements;
GO

PRINT 'Application queries finished. The reports are in 04_reports.sql.';
GO
