/* =====================================================================================
   Zewail Desk - CSAI 202 Database Systems - schema
   =====================================================================================
   Run this file first, on a fresh database, in Microsoft SQL Server 2019 or later.

   What is in here
     1. the database itself
     2. the 15 tables, with named constraints (PK_, FK_, CK_, UQ_) and indexes
     3. the grade scale helper functions
     4. the trigger that fills LetterGrade and GradePoints from Score
     5. the two views used by the reports (vw_StudentGpa, vw_SectionFill)
     6. the stored procedures that enforce the registration rules

   Conventions used everywhere in this file
     - every primary key is an IDENTITY column
     - every constraint has a name, so an error message can be traced back to this file
     - ON DELETE rules are chosen one by one and each one has a short comment

   Note on naming: the user table is called AppUser, not User, because USER is a reserved
   word in T-SQL.
   ===================================================================================== */

/* ----------------------------------------------------------------------------------
   Create the database if the person running the script has not created it yet.
   Change the name here if your team wants another one, and change it in .env too.
   ---------------------------------------------------------------------------------- */
IF DB_ID('ZewailDesk') IS NULL
BEGIN
    CREATE DATABASE ZewailDesk;
END
GO

USE ZewailDesk;
GO

SET NOCOUNT ON;
GO

/* =====================================================================================
   1. Department and Program
   Departments own programs, courses and instructors.
   ===================================================================================== */

CREATE TABLE dbo.Department
(
    DepartmentId      INT           IDENTITY(1,1) NOT NULL,
    Code              VARCHAR(10)   NOT NULL,          -- CSAI, MATH, ...
    Name              NVARCHAR(120) NOT NULL,
    HeadInstructorId  INT           NULL,              -- filled after the instructors exist
    CONSTRAINT PK_Department          PRIMARY KEY (DepartmentId),
    CONSTRAINT UQ_Department_Code     UNIQUE (Code),
    CONSTRAINT UQ_Department_Name     UNIQUE (Name),
    CONSTRAINT CK_Department_Code     CHECK (Code = UPPER(Code))
);
GO

CREATE TABLE dbo.Program
(
    ProgramId          INT            IDENTITY(1,1) NOT NULL,
    DepartmentId       INT            NOT NULL,
    Name               NVARCHAR(120)  NOT NULL,
    TotalCreditHours   INT            NOT NULL,
    FeePerCreditHour   DECIMAL(10,2)  NOT NULL,
    CONSTRAINT PK_Program                 PRIMARY KEY (ProgramId),
    CONSTRAINT FK_Program_Department      FOREIGN KEY (DepartmentId) REFERENCES dbo.Department (DepartmentId),
    CONSTRAINT UQ_Program_Department_Name UNIQUE (DepartmentId, Name),
    CONSTRAINT CK_Program_TotalCredits    CHECK (TotalCreditHours > 0),
    CONSTRAINT CK_Program_Fee             CHECK (FeePerCreditHour > 0)
);
GO

/* A department cannot point at an instructor that does not exist, so the foreign key is
   added after the Instructor table is created (second half of this file, section 8).  */

/* =====================================================================================
   2. AppUser: the super entity, and its three sub entities Student, Instructor, Admin.
   Every person who can sign in has exactly one AppUser row; the subtype row shares that
   primary key, which is what makes Student, Instructor and Admin sub entities of AppUser.
   ===================================================================================== */

CREATE TABLE dbo.AppUser
(
    UserId       INT            IDENTITY(1,1) NOT NULL,
    FullName     NVARCHAR(120)  NOT NULL,
    Email        VARCHAR(150)   NOT NULL,
    PasswordHash VARCHAR(100)   NOT NULL,              -- bcrypt hash, never a plain password
    Role         VARCHAR(12)    NOT NULL,
    IsActive     BIT            NOT NULL CONSTRAINT DF_AppUser_IsActive  DEFAULT (1),
    CreatedAt    DATETIME2(0)   NOT NULL CONSTRAINT DF_AppUser_CreatedAt DEFAULT (SYSDATETIME()),
    LastLoginAt  DATETIME2(0)   NULL,
    CONSTRAINT PK_AppUser        PRIMARY KEY (UserId),
    CONSTRAINT UQ_AppUser_Email  UNIQUE (Email),
    CONSTRAINT CK_AppUser_Role   CHECK (Role IN ('Student', 'Instructor', 'Admin')),
    -- an e-mail has to look like an e-mail: one @, something before it, a dot after it
    CONSTRAINT CK_AppUser_Email  CHECK (Email LIKE '%_@_%._%')
);
GO

/* Which columns are searched on every login and every user list.  */
CREATE INDEX IX_AppUser_Role_IsActive ON dbo.AppUser (Role, IsActive);
GO

CREATE TABLE dbo.Student
(
    UserId         INT          NOT NULL,              -- PK and FK at the same time (sub entity)
    StudentNumber  VARCHAR(20)  NOT NULL,
    ProgramId      INT          NOT NULL,
    EnrollmentYear INT          NOT NULL,
    Level          INT          NOT NULL,
    AdvisorId      INT          NULL,
    CONSTRAINT PK_Student            PRIMARY KEY (UserId),
    CONSTRAINT FK_Student_AppUser    FOREIGN KEY (UserId)    REFERENCES dbo.AppUser (UserId)   ON DELETE CASCADE,
    CONSTRAINT FK_Student_Program    FOREIGN KEY (ProgramId) REFERENCES dbo.Program (ProgramId),
    -- CASCADE on the super entity: deleting a person deletes the subtype row (and nothing else,
    -- because the academic history hangs from Enrollment, which is protected by NO ACTION)
    CONSTRAINT UQ_Student_Number     UNIQUE (StudentNumber),
    CONSTRAINT CK_Student_Level      CHECK (Level BETWEEN 1 AND 5),
    CONSTRAINT CK_Student_Year       CHECK (EnrollmentYear BETWEEN 2000 AND 2100)
);
GO

CREATE INDEX IX_Student_ProgramId ON dbo.Student (ProgramId);
CREATE INDEX IX_Student_AdvisorId ON dbo.Student (AdvisorId);
GO

CREATE TABLE dbo.Instructor
(
    UserId         INT           NOT NULL,             -- PK and FK at the same time
    DepartmentId   INT           NOT NULL,
    Title          VARCHAR(10)   NOT NULL,
    OfficeRoomId   INT           NULL,
    Specialization NVARCHAR(120) NULL,
    CONSTRAINT PK_Instructor           PRIMARY KEY (UserId),
    CONSTRAINT FK_Instructor_AppUser   FOREIGN KEY (UserId)       REFERENCES dbo.AppUser (UserId) ON DELETE CASCADE,
    CONSTRAINT FK_Instructor_Department FOREIGN KEY (DepartmentId) REFERENCES dbo.Department (DepartmentId),
    CONSTRAINT CK_Instructor_Title     CHECK (Title IN ('Prof.', 'Dr.', 'T.A.'))
);
GO

CREATE INDEX IX_Instructor_DepartmentId ON dbo.Instructor (DepartmentId);
GO

CREATE TABLE dbo.Admin
(
    UserId            INT           NOT NULL,          -- PK and FK at the same time
    Position          NVARCHAR(80)  NOT NULL,
    CanRecordPayments BIT           NOT NULL CONSTRAINT DF_Admin_CanRecordPayments DEFAULT (1),
    CONSTRAINT PK_Admin         PRIMARY KEY (UserId),
    CONSTRAINT FK_Admin_AppUser FOREIGN KEY (UserId) REFERENCES dbo.AppUser (UserId) ON DELETE CASCADE
);
GO

/* =====================================================================================
   3. Course, Prerequisite, Semester, Room, Section
   ===================================================================================== */

CREATE TABLE dbo.Course
(
    CourseId     INT           IDENTITY(1,1) NOT NULL,
    Code         VARCHAR(12)   NOT NULL,
    Title        NVARCHAR(150) NOT NULL,
    CreditHours  INT           NOT NULL,
    DepartmentId INT           NOT NULL,
    Level        INT           NOT NULL,
    Description  NVARCHAR(400) NULL,
    CONSTRAINT PK_Course             PRIMARY KEY (CourseId),
    CONSTRAINT FK_Course_Department  FOREIGN KEY (DepartmentId) REFERENCES dbo.Department (DepartmentId),
    CONSTRAINT UQ_Course_Code        UNIQUE (Code),
    CONSTRAINT CK_Course_Credits     CHECK (CreditHours BETWEEN 1 AND 6),
    CONSTRAINT CK_Course_Level       CHECK (Level BETWEEN 1 AND 5)
);
GO

CREATE INDEX IX_Course_DepartmentId ON dbo.Course (DepartmentId);
GO

/* A course can need several other courses. The pair (CourseId, PrerequisiteCourseId) is the
   primary key, so the same prerequisite cannot be listed twice.  */
CREATE TABLE dbo.Prerequisite
(
    CourseId             INT NOT NULL,
    PrerequisiteCourseId INT NOT NULL,
    CONSTRAINT PK_Prerequisite            PRIMARY KEY (CourseId, PrerequisiteCourseId),
    CONSTRAINT FK_Prerequisite_Course     FOREIGN KEY (CourseId)             REFERENCES dbo.Course (CourseId),
    -- NO ACTION here on purpose: deleting a course that another course needs must fail loudly,
    -- so that the catalogue cannot silently lose a prerequisite chain.
    CONSTRAINT FK_Prerequisite_Prereq     FOREIGN KEY (PrerequisiteCourseId) REFERENCES dbo.Course (CourseId),
    CONSTRAINT CK_Prerequisite_NotSelf    CHECK (CourseId <> PrerequisiteCourseId)
);
GO

CREATE INDEX IX_Prerequisite_PrereqCourseId ON dbo.Prerequisite (PrerequisiteCourseId);
GO

CREATE TABLE dbo.Semester
(
    SemesterId           INT           IDENTITY(1,1) NOT NULL,
    Name                 NVARCHAR(60)  NOT NULL,       -- 'Fall 2025'
    StartDate            DATE          NOT NULL,
    EndDate              DATE          NOT NULL,
    RegistrationOpen     BIT           NOT NULL CONSTRAINT DF_Semester_RegistrationOpen DEFAULT (0),
    RegistrationDeadline DATE          NULL,
    DropDeadline         DATE          NULL,
    CONSTRAINT PK_Semester        PRIMARY KEY (SemesterId),
    CONSTRAINT UQ_Semester_Name   UNIQUE (Name),
    CONSTRAINT CK_Semester_Dates  CHECK (EndDate > StartDate),
    CONSTRAINT CK_Semester_Reg    CHECK (RegistrationDeadline IS NULL OR RegistrationDeadline >= StartDate),
    CONSTRAINT CK_Semester_Drop   CHECK (DropDeadline IS NULL OR DropDeadline >= StartDate)
);
GO

CREATE TABLE dbo.Room
(
    RoomId     INT          IDENTITY(1,1) NOT NULL,
    Building   NVARCHAR(60) NOT NULL,
    RoomNumber VARCHAR(10)  NOT NULL,
    Capacity   INT          NOT NULL,
    RoomType   VARCHAR(10)  NOT NULL,
    CONSTRAINT PK_Room              PRIMARY KEY (RoomId),
    CONSTRAINT UQ_Room_Building_No  UNIQUE (Building, RoomNumber),
    CONSTRAINT CK_Room_Capacity     CHECK (Capacity > 0),
    CONSTRAINT CK_Room_Type         CHECK (RoomType IN ('Lecture', 'Lab'))
);
GO

/* A section is one group of students taking one course in one semester, in one room, at one
   weekly slot (DayOfWeek 1 = Saturday ... 7 = Friday), taught by one instructor.  */
CREATE TABLE dbo.Section
(
    SectionId    INT         IDENTITY(1,1) NOT NULL,
    CourseId     INT         NOT NULL,
    SemesterId   INT         NOT NULL,
    InstructorId INT         NOT NULL,
    RoomId       INT         NOT NULL,
    SectionCode  VARCHAR(10) NOT NULL,                 -- '01', '02', ...
    Capacity     INT         NOT NULL,
    DayOfWeek    TINYINT     NOT NULL,
    StartTime    TIME(0)     NOT NULL,
    EndTime      TIME(0)     NOT NULL,
    CONSTRAINT PK_Section                PRIMARY KEY (SectionId),
    CONSTRAINT FK_Section_Course         FOREIGN KEY (CourseId)     REFERENCES dbo.Course (CourseId),
    -- NO ACTION on both of these on purpose: a course or a semester that has sections must not
    -- disappear, the office has to close the sections first.
    CONSTRAINT FK_Section_Semester       FOREIGN KEY (SemesterId)   REFERENCES dbo.Semester (SemesterId),
    CONSTRAINT FK_Section_Instructor     FOREIGN KEY (InstructorId) REFERENCES dbo.Instructor (UserId),
    CONSTRAINT FK_Section_Room           FOREIGN KEY (RoomId)       REFERENCES dbo.Room (RoomId),
    CONSTRAINT UQ_Section_Offering       UNIQUE (CourseId, SemesterId, SectionCode),
    CONSTRAINT CK_Section_Capacity       CHECK (Capacity > 0),
    CONSTRAINT CK_Section_DayOfWeek      CHECK (DayOfWeek BETWEEN 1 AND 7),
    CONSTRAINT CK_Section_Times          CHECK (EndTime > StartTime)
);
GO

CREATE INDEX IX_Section_SemesterId   ON dbo.Section (SemesterId);
CREATE INDEX IX_Section_InstructorId ON dbo.Section (InstructorId);
CREATE INDEX IX_Section_CourseId     ON dbo.Section (CourseId);
CREATE INDEX IX_Section_RoomId       ON dbo.Section (RoomId);
-- the clash check of the registration rules searches by day and time
CREATE INDEX IX_Section_Day_Time     ON dbo.Section (SemesterId, DayOfWeek, StartTime, EndTime);
GO

/* =====================================================================================
   4. Enrollment: the heart of the system.
   One row = one student in one section, with the score, the letter grade, the grade points
   and the flag that says whether the grade has been published.
   ===================================================================================== */

CREATE TABLE dbo.Enrollment
(
    EnrollmentId   INT           IDENTITY(1,1) NOT NULL,
    StudentId      INT           NOT NULL,
    SectionId      INT           NOT NULL,
    EnrolledAt     DATETIME2(0)  NOT NULL CONSTRAINT DF_Enrollment_EnrolledAt DEFAULT (SYSDATETIME()),
    Status         VARCHAR(12)   NOT NULL CONSTRAINT DF_Enrollment_Status     DEFAULT ('Enrolled'),
    Score          DECIMAL(5,2)  NULL,
    LetterGrade    VARCHAR(2)    NULL,
    GradePoints    DECIMAL(3,2)  NULL,
    GradePublished BIT           NOT NULL CONSTRAINT DF_Enrollment_Published  DEFAULT (0),
    CONSTRAINT PK_Enrollment            PRIMARY KEY (EnrollmentId),
    CONSTRAINT FK_Enrollment_Student    FOREIGN KEY (StudentId) REFERENCES dbo.Student (UserId),
    -- NO ACTION under Section: closing a section is done with Status, not by deleting rows,
    -- and the academic history must never disappear because of a delete.
    CONSTRAINT FK_Enrollment_Section    FOREIGN KEY (SectionId) REFERENCES dbo.Section (SectionId),
    CONSTRAINT UQ_Enrollment_Student_Section UNIQUE (StudentId, SectionId),
    CONSTRAINT CK_Enrollment_Status     CHECK (Status IN ('Enrolled', 'Dropped', 'Completed')),
    CONSTRAINT CK_Enrollment_Score      CHECK (Score IS NULL OR (Score >= 0 AND Score <= 100)),
    -- a score of 0 always means 0.00 grade points, so the older stored procedure or the trigger
    -- always fills both columns together: either the grade is published and both are set,
    -- or the grade is not published and both are null
    CONSTRAINT CK_Enrollment_Published  CHECK (GradePublished = 0 OR Score IS NOT NULL),
    CONSTRAINT CK_Enrollment_GradeSet   CHECK ((LetterGrade IS NULL AND GradePoints IS NULL)
                                            OR (LetterGrade IS NOT NULL AND GradePoints IS NOT NULL)),
    CONSTRAINT CK_Enrollment_GradeRange CHECK (GradePoints IS NULL OR (GradePoints >= 0 AND GradePoints <= 4))
);
GO

CREATE INDEX IX_Enrollment_StudentId ON dbo.Enrollment (StudentId);
CREATE INDEX IX_Enrollment_SectionId ON dbo.Enrollment (SectionId);
CREATE INDEX IX_Enrollment_Status    ON dbo.Enrollment (Status, GradePublished);
GO

/* =====================================================================================
   5. Attendance: one row per student per session date.
   ===================================================================================== */

CREATE TABLE dbo.Attendance
(
    AttendanceId INT          IDENTITY(1,1) NOT NULL,
    EnrollmentId INT          NOT NULL,
    SessionDate  DATE         NOT NULL,
    Status       VARCHAR(10)  NOT NULL,
    CONSTRAINT PK_Attendance            PRIMARY KEY (AttendanceId),
    -- CASCADE is correct here: attendance only exists inside a registration, so when the
    -- registration is deleted the attendance rows have no meaning any more
    CONSTRAINT FK_Attendance_Enrollment FOREIGN KEY (EnrollmentId) REFERENCES dbo.Enrollment (EnrollmentId) ON DELETE CASCADE,
    CONSTRAINT UQ_Attendance_Enrollment_Date UNIQUE (EnrollmentId, SessionDate),
    CONSTRAINT CK_Attendance_Status     CHECK (Status IN ('Present', 'Absent', 'Excused'))
);
GO

CREATE INDEX IX_Attendance_Date ON dbo.Attendance (SessionDate);
GO

/* =====================================================================================
   6. Payment: money received from a student for a semester.
   ===================================================================================== */

CREATE TABLE dbo.Payment
(
    PaymentId         INT           IDENTITY(1,1) NOT NULL,
    StudentId         INT           NOT NULL,
    SemesterId        INT           NOT NULL,
    Amount            DECIMAL(10,2) NOT NULL,
    PaidAt            DATETIME2(0)  NOT NULL CONSTRAINT DF_Payment_PaidAt DEFAULT (SYSDATETIME()),
    Method            VARCHAR(12)   NOT NULL,
    ReceiptNumber     VARCHAR(20)   NOT NULL,
    RecordedByAdminId INT           NOT NULL,
    CONSTRAINT PK_Payment               PRIMARY KEY (PaymentId),
    CONSTRAINT FK_Payment_Student       FOREIGN KEY (StudentId) REFERENCES dbo.Student (UserId),
    CONSTRAINT FK_Payment_Semester      FOREIGN KEY (SemesterId) REFERENCES dbo.Semester (SemesterId),
    -- NO ACTION: the audit trail of who took the money must not break because an admin
    -- account is removed; an admin that recorded payments is deactivated instead of deleted
    CONSTRAINT FK_Payment_Admin         FOREIGN KEY (RecordedByAdminId) REFERENCES dbo.Admin (UserId),
    CONSTRAINT UQ_Payment_Receipt       UNIQUE (ReceiptNumber),
    CONSTRAINT CK_Payment_Amount        CHECK (Amount > 0),
    CONSTRAINT CK_Payment_Method        CHECK (Method IN ('Cash', 'Card', 'BankTransfer'))
);
GO

CREATE INDEX IX_Payment_StudentId  ON dbo.Payment (StudentId, SemesterId);
CREATE INDEX IX_Payment_SemesterId ON dbo.Payment (SemesterId);
GO

/* =====================================================================================
   7. Announcement: SectionId NULL means a global announcement for everybody.
   ===================================================================================== */

CREATE TABLE dbo.Announcement
(
    AnnouncementId INT            IDENTITY(1,1) NOT NULL,
    SectionId      INT            NULL,
    AuthorId       INT            NOT NULL,
    Title          NVARCHAR(150)  NOT NULL,
    Body           NVARCHAR(1000) NOT NULL,
    PostedAt       DATETIME2(0)   NOT NULL CONSTRAINT DF_Announcement_PostedAt DEFAULT (SYSDATETIME()),
    IsPinned       BIT            NOT NULL CONSTRAINT DF_Announcement_IsPinned DEFAULT (0),
    CONSTRAINT PK_Announcement          PRIMARY KEY (AnnouncementId),
    -- CASCADE: an announcement of a section is content of that section, it has no life without it
    CONSTRAINT FK_Announcement_Section  FOREIGN KEY (SectionId) REFERENCES dbo.Section (SectionId) ON DELETE CASCADE,
    -- NO ACTION: the author is kept for the audit trail, authors are deactivated, never deleted
    CONSTRAINT FK_Announcement_Author   FOREIGN KEY (AuthorId)  REFERENCES dbo.AppUser (UserId),
    CONSTRAINT CK_Announcement_Title    CHECK (LEN(Title) >= 3)
);
GO

CREATE INDEX IX_Announcement_SectionId ON dbo.Announcement (SectionId);
CREATE INDEX IX_Announcement_PostedAt  ON dbo.Announcement (PostedAt DESC);
GO

/* =====================================================================================
   8. The foreign key that closes the circle Department -> Instructor -> Department.
   It is added last because the Instructor table did not exist in section 1.
   ===================================================================================== */

ALTER TABLE dbo.Department
    ADD CONSTRAINT FK_Department_Head
        FOREIGN KEY (HeadInstructorId) REFERENCES dbo.Instructor (UserId);
GO

/* =====================================================================================
   9. The grade scale, written once and reused by the trigger, by the reports and by the
   application (server/src/rules/grading.js implements the same table).

   Score range        Letter   Points
   93.00 - 100.00     A        4.00
   90.00 -  92.99     A-       3.70
   87.00 -  89.99     B+       3.30
   83.00 -  86.99     B        3.00
   80.00 -  82.99     B-       2.70
   77.00 -  79.99     C+       2.30
   73.00 -  76.99     C        2.00
   70.00 -  72.99     C-       1.70
   67.00 -  69.99     D+       1.30
   60.00 -  66.99     D        1.00
   below 60.00        F        0.00
   ===================================================================================== */

CREATE FUNCTION dbo.fn_LetterGrade (@Score DECIMAL(5,2))
RETURNS VARCHAR(2)
AS
BEGIN
    RETURN CASE
        WHEN @Score >= 93 THEN 'A'
        WHEN @Score >= 90 THEN 'A-'
        WHEN @Score >= 87 THEN 'B+'
        WHEN @Score >= 83 THEN 'B'
        WHEN @Score >= 80 THEN 'B-'
        WHEN @Score >= 77 THEN 'C+'
        WHEN @Score >= 73 THEN 'C'
        WHEN @Score >= 70 THEN 'C-'
        WHEN @Score >= 67 THEN 'D+'
        WHEN @Score >= 60 THEN 'D'
        ELSE 'F'
    END;
END
GO

CREATE FUNCTION dbo.fn_GradePoints (@Score DECIMAL(5,2))
RETURNS DECIMAL(3,2)
AS
BEGIN
    RETURN CASE
        WHEN @Score >= 93 THEN 4.00
        WHEN @Score >= 90 THEN 3.70
        WHEN @Score >= 87 THEN 3.30
        WHEN @Score >= 83 THEN 3.00
        WHEN @Score >= 80 THEN 2.70
        WHEN @Score >= 77 THEN 2.30
        WHEN @Score >= 73 THEN 2.00
        WHEN @Score >= 70 THEN 1.70
        WHEN @Score >= 67 THEN 1.30
        WHEN @Score >= 60 THEN 1.00
        ELSE 0.00
    END;
END
GO

/* =====================================================================================
   10. Trigger: every time a score is written, the letter grade and the grade points are
   filled in by the database itself. The application never computes them, so the two can
   never disagree. The trigger also keeps the rule "grade points only exist when the grade
   is published" true.
   ===================================================================================== */

CREATE TRIGGER dbo.TR_Enrollment_SetGrade
ON dbo.Enrollment
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    /* One statement is enough: for every row that was inserted or updated, the letter and the
       points are either both filled (score entered and grade published) or both cleared.
       Doing it in a single UPDATE means the order of the rows can never matter.  */
    UPDATE e
       SET e.LetterGrade = CASE WHEN i.Score IS NOT NULL AND i.GradePublished = 1
                                THEN dbo.fn_LetterGrade(i.Score) ELSE NULL END,
           e.GradePoints = CASE WHEN i.Score IS NOT NULL AND i.GradePublished = 1
                                THEN dbo.fn_GradePoints(i.Score) ELSE NULL END
      FROM dbo.Enrollment AS e
      JOIN inserted       AS i ON i.EnrollmentId = e.EnrollmentId;
END
GO

/* =====================================================================================
   11. Views used by the application and the reports.
   ===================================================================================== */

/* vw_StudentGpa: one row per student per semester where the student has published grades,
   plus the weighted average of that semester. GPA = sum(points * credit hours) /
   sum(credit hours) over the published enrollments of the semester.  */
CREATE VIEW dbo.vw_StudentGpa
AS
SELECT  e.StudentId,
        sem.SemesterId,
        sem.Name                                        AS SemesterName,
        SUM(c.CreditHours)                              AS CreditHours,
        CAST(SUM(e.GradePoints * c.CreditHours)
             / NULLIF(SUM(c.CreditHours), 0) AS DECIMAL(4,2)) AS SemesterGpa
FROM        dbo.Enrollment e
JOIN        dbo.Section  sec ON sec.SectionId = e.SectionId
JOIN        dbo.Semester sem ON sem.SemesterId = sec.SemesterId
JOIN        dbo.Course   c   ON c.CourseId    = sec.CourseId
WHERE       e.GradePublished = 1
  AND       e.Status <> 'Dropped'
GROUP BY    e.StudentId, sem.SemesterId, sem.Name;
GO

/* vw_SectionFill: how full each section is, with the course, the semester and the teacher
   already joined in, so the admin screens and the fill rate report need one query only.  */
CREATE VIEW dbo.vw_SectionFill
AS
SELECT  sec.SectionId,
        c.Code                                          AS CourseCode,
        c.Title                                         AS CourseTitle,
        sem.Name                                        AS SemesterName,
        sec.SectionCode,
        sec.SemesterId,
        u.FullName                                      AS InstructorName,
        r.Building + ' ' + r.RoomNumber                 AS RoomName,
        sec.Capacity,
        COUNT(e.EnrollmentId)                           AS Enrolled,
        CAST(COUNT(e.EnrollmentId) * 100.0
             / NULLIF(sec.Capacity, 0) AS DECIMAL(5,1)) AS FillPercent
FROM        dbo.Section sec
JOIN        dbo.Course   c   ON c.CourseId     = sec.CourseId
JOIN        dbo.Semester sem ON sem.SemesterId = sec.SemesterId
JOIN        dbo.AppUser  u   ON u.UserId       = sec.InstructorId
JOIN        dbo.Room     r   ON r.RoomId       = sec.RoomId
LEFT JOIN   dbo.Enrollment e ON e.SectionId    = sec.SectionId
                            AND e.Status IN ('Enrolled', 'Completed')
GROUP BY    sec.SectionId, c.Code, c.Title, sem.Name, sec.SemesterId, sec.SectionCode,
            u.FullName, r.Building, r.RoomNumber, sec.Capacity;
GO

/* =====================================================================================
   12. Stored procedures: the registration rules live inside the database, in one
   transaction, with locking hints so that two students cannot take the last seat at the
   same moment.

   Rule list enforced by sp_RegisterStudent
     R1 the semester must have RegistrationOpen = 1 and the deadline must not have passed
     R2 the student account must be active
     R3 every prerequisite must be completed with a published score of 60 or more
     R4 the section must have a free seat
     R5 the new section must not clash with another section of the student that semester
         (same day, overlapping times)
     R6 the course must not already be enrolled or completed by the student
     R7 the total credit hours of the semester must stay at or below 18
   ===================================================================================== */

CREATE PROCEDURE dbo.sp_RegisterStudent
    @StudentId INT,
    @SectionId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;                 -- any error rolls the whole transaction back

    DECLARE @SemesterId     INT,
            @CourseId       INT,
            @Capacity       INT,
            @CreditHours    INT,
            @Enrolled       INT,
            @CurrentCredits INT,
            @Open           BIT,
            @Deadline       DATE,
            @IsActive       BIT,
            @DayOfWeek      TINYINT,
            @StartTime      TIME(0),
            @EndTime        TIME(0),
            @ClashCount     INT,
            @MissingPrereq  VARCHAR(12),
            @AlreadyCount   INT;

    BEGIN TRY
        BEGIN TRANSACTION;

        ---------------------------------------------------------------------------------
        -- lock the section row for the rest of the transaction: this is what serialises
        -- two students who register in the same section at the same second
        ---------------------------------------------------------------------------------
        SELECT  @SemesterId = sec.SemesterId,
                @CourseId   = sec.CourseId,
                @Capacity   = sec.Capacity,
                @DayOfWeek  = sec.DayOfWeek,
                @StartTime  = sec.StartTime,
                @EndTime    = sec.EndTime
        FROM    dbo.Section sec WITH (UPDLOCK, HOLDLOCK)
        WHERE   sec.SectionId = @SectionId;

        IF @@ROWCOUNT = 0
        BEGIN
            THROW 51000, 'The section does not exist.', 1;
        END

        SELECT  @CreditHours = CreditHours FROM dbo.Course WHERE CourseId = @CourseId;

        ---------------------------------------------------------------------------------
        -- R1 the registration window
        ---------------------------------------------------------------------------------
        SELECT  @Open     = RegistrationOpen,
                @Deadline = RegistrationDeadline
        FROM    dbo.Semester WITH (HOLDLOCK)
        WHERE   SemesterId = @SemesterId;

        IF @Open = 0
        BEGIN
            THROW 51001, 'Registration is closed for this semester.', 1;
        END

        IF @Deadline IS NOT NULL AND CAST(GETDATE() AS DATE) > @Deadline
        BEGIN
            THROW 51002, 'The registration deadline for this semester has passed.', 1;
        END

        ---------------------------------------------------------------------------------
        -- R2 the account of the student
        ---------------------------------------------------------------------------------
        SELECT @IsActive = u.IsActive
        FROM   dbo.AppUser u
        WHERE  u.UserId = @StudentId AND u.Role = 'Student';

        IF @IsActive IS NULL
        BEGIN
            THROW 51003, 'The student does not exist.', 1;
        END

        IF @IsActive = 0
        BEGIN
            THROW 51004, 'The student account is not active.', 1;
        END

        ---------------------------------------------------------------------------------
        -- R6 the course is not already taken
        -- A course is "already taken" when there is an Enrolled or Completed registration of
        -- the same course in any semester. A dropped registration does not count, so a
        -- student may drop a course and register again.
        ---------------------------------------------------------------------------------
        SELECT @AlreadyCount = COUNT(*)
        FROM   dbo.Enrollment e
        JOIN   dbo.Section s2 ON s2.SectionId = e.SectionId
        WHERE  e.StudentId = @StudentId
          AND  s2.CourseId = @CourseId
          AND  e.Status IN ('Enrolled', 'Completed');

        IF @AlreadyCount > 0
        BEGIN
            THROW 51005, 'You are already registered in this course or you already completed it.', 1;
        END

        ---------------------------------------------------------------------------------
        -- R3 prerequisites: every prerequisite must be Completed with a published score
        --    of 60 or more
        ---------------------------------------------------------------------------------
        SELECT TOP (1) @MissingPrereq = pc.Code
        FROM   dbo.Prerequisite p
        JOIN   dbo.Course pc ON pc.CourseId = p.PrerequisiteCourseId
        WHERE  p.CourseId = @CourseId
          AND  NOT EXISTS
               (
                   SELECT 1
                   FROM   dbo.Enrollment  e
                   JOIN   dbo.Section     s2 ON s2.SectionId = e.SectionId
                   WHERE  e.StudentId = @StudentId
                     AND  s2.CourseId = p.PrerequisiteCourseId
                     AND  e.Status = 'Completed'
                     AND  e.GradePublished = 1
                     AND  e.Score >= 60
               );

        IF @MissingPrereq IS NOT NULL
        BEGIN
            -- the message names the missing course, so the screen can show it directly
            DECLARE @PrereqMessage NVARCHAR(200) =
                CONCAT('Prerequisite not passed: ', @MissingPrereq,
                       '. Pass it with a score of 60 or more first.');
            THROW 51006, @PrereqMessage, 1;
        END

        ---------------------------------------------------------------------------------
        -- R4 a free seat. COUNT with HOLDLOCK keeps the number stable until we commit
        ---------------------------------------------------------------------------------
        SELECT @Enrolled = COUNT(*)
        FROM   dbo.Enrollment e WITH (HOLDLOCK)
        WHERE  e.SectionId = @SectionId
          AND  e.Status = 'Enrolled';

        IF @Enrolled >= @Capacity
        BEGIN
            THROW 51007, 'The section is full.', 1;
        END

        ---------------------------------------------------------------------------------
        -- R5 no time clash with another section of the same student in the same semester
        ---------------------------------------------------------------------------------
        SELECT @ClashCount = COUNT(*)
        FROM   dbo.Enrollment e
        JOIN   dbo.Section  s2 ON s2.SectionId = e.SectionId
        WHERE  e.StudentId = @StudentId
          AND  e.Status = 'Enrolled'
          AND  s2.SemesterId = @SemesterId
          AND  s2.DayOfWeek  = @DayOfWeek
          AND  @StartTime < s2.EndTime
          AND  @EndTime   > s2.StartTime;

        IF @ClashCount > 0
        BEGIN
            THROW 51008, 'This section clashes with another section you are registered in.', 1;
        END

        ---------------------------------------------------------------------------------
        -- R7 the credit limit of the semester (18 hours)
        ---------------------------------------------------------------------------------
        SELECT @CurrentCredits = COALESCE(SUM(c.CreditHours), 0)
        FROM   dbo.Enrollment e
        JOIN   dbo.Section  s2 ON s2.SectionId = e.SectionId
        JOIN   dbo.Course   c  ON c.CourseId   = s2.CourseId
        WHERE  e.StudentId = @StudentId
          AND  e.Status = 'Enrolled'
          AND  s2.SemesterId = @SemesterId;

        IF @CurrentCredits + @CreditHours > 18
        BEGIN
            THROW 51009, 'The credit limit of 18 hours for this semester would be exceeded.', 1;
        END

        ---------------------------------------------------------------------------------
        -- everything passed: create the registration
        ---------------------------------------------------------------------------------
        INSERT INTO dbo.Enrollment (StudentId, SectionId, Status)
        VALUES (@StudentId, @SectionId, 'Enrolled');

        COMMIT TRANSACTION;

        SELECT CAST(SCOPE_IDENTITY() AS INT) AS EnrollmentId;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
        BEGIN
            ROLLBACK TRANSACTION;
        END
        THROW;                          -- hand the original message to the API layer
    END CATCH
END
GO

/* =====================================================================================
   sp_DropEnrollment: dropping is only allowed while the semester is running and before the
   drop deadline. The row is not deleted: the status becomes Dropped, which
   - frees the seat (the registration count looks at Status = 'Enrolled')
   - removes the course from the fees (fees count Enrolled and Completed only)
   - removes the course from the GPA (grades of a dropped course are wiped)
   ===================================================================================== */

CREATE PROCEDURE dbo.sp_DropEnrollment
    @StudentId    INT,
    @EnrollmentId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @SemesterId INT,
            @Status     VARCHAR(12),
            @DropDate   DATE,
            @Today      DATE = CAST(GETDATE() AS DATE);

    BEGIN TRY
        BEGIN TRANSACTION;

        SELECT  @SemesterId = sec.SemesterId,
                @Status     = e.Status
        FROM    dbo.Enrollment e WITH (UPDLOCK, HOLDLOCK)
        JOIN    dbo.Section    sec ON sec.SectionId = e.SectionId
        WHERE   e.EnrollmentId = @EnrollmentId
          AND   e.StudentId    = @StudentId;

        IF @@ROWCOUNT = 0
        BEGIN
            THROW 51020, 'The registration does not exist for this student.', 1;
        END

        IF @Status <> 'Enrolled'
        BEGIN
            THROW 51021, 'Only a registration with the status Enrolled can be dropped.', 1;
        END

        SELECT @DropDate = DropDeadline FROM dbo.Semester WHERE SemesterId = @SemesterId;

        IF @DropDate IS NOT NULL AND @Today > @DropDate
        BEGIN
            THROW 51022, 'The drop deadline of this semester has passed.', 1;
        END

        UPDATE dbo.Enrollment
           SET Status        = 'Dropped',
               Score         = NULL,
               LetterGrade   = NULL,
               GradePoints   = NULL,
               GradePublished = 0
         WHERE EnrollmentId = @EnrollmentId;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
        BEGIN
            ROLLBACK TRANSACTION;
        END
        THROW;
    END CATCH
END
GO

/* =====================================================================================
   sp_PublishGrades: the instructor has finished entering the numeric scores of a section.
   Publishing sets GradePublished = 1 for the rows that have a score; the trigger then
   writes the letter grade and the grade points. A score that is missing is refused, because
   the students of a section must be graded together.
   ===================================================================================== */

CREATE PROCEDURE dbo.sp_PublishGrades
    @SectionId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Missing INT;

    BEGIN TRY
        BEGIN TRANSACTION;

        SELECT  @Missing = COUNT(*)
        FROM    dbo.Enrollment WITH (UPDLOCK, HOLDLOCK)
        WHERE   SectionId = @SectionId
          AND   Status = 'Enrolled'
          AND   Score IS NULL;

        IF @Missing > 0
        BEGIN
            THROW 51030, 'Every student of the section needs a score before the grades can be published.', 1;
        END

        DECLARE @Published INT = 0;

        UPDATE dbo.Enrollment
           SET Status         = 'Completed',
               GradePublished = 1
         WHERE SectionId = @SectionId
           AND Status    = 'Enrolled';

        SET @Published = @@ROWCOUNT;      -- read the row count before the COMMIT

        COMMIT TRANSACTION;

        SELECT @Published AS Published;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
        BEGIN
            ROLLBACK TRANSACTION;
        END
        THROW;
    END CATCH
END
GO

/* =====================================================================================
   sp_CreateFirstAdmin: the only account that is created outside the application is the
   first administrator. server/scripts/seedAdmin.js calls this procedure with a bcrypt hash
   that it generated itself, and the procedure refuses to run when an admin already exists.
   ===================================================================================== */

CREATE PROCEDURE dbo.sp_CreateFirstAdmin
    @FullName     NVARCHAR(120),
    @Email        VARCHAR(150),
    @PasswordHash VARCHAR(100)
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (SELECT 1 FROM dbo.AppUser WHERE Role = 'Admin')
    BEGIN
        THROW 51040, 'An administrator already exists. Create further admins inside the application.', 1;
    END

    DECLARE @UserId INT;

    INSERT INTO dbo.AppUser (FullName, Email, PasswordHash, Role, IsActive)
    VALUES (@FullName, @Email, @PasswordHash, 'Admin', 1);

    SET @UserId = CAST(SCOPE_IDENTITY() AS INT);

    -- the Administrator is a sub entity of AppUser, so the first administrator also needs
    -- the row of the subtype: without it the person could not record a payment later on,
    -- because Payment.RecordedByAdminId points at dbo.Admin
    INSERT INTO dbo.Admin (UserId, Position, CanRecordPayments)
    VALUES (@UserId, 'System Administrator', 1);

    SELECT @UserId AS UserId;
END
GO

PRINT 'Zewail Desk schema created: 15 tables, 2 views, 4 procedures, 1 trigger.';
GO
