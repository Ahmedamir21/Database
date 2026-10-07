/* =====================================================================================
   Zewail Desk - CSAI 202 Database Systems - backup and restore
   =====================================================================================
   The project has to be handed in with a database backup that already contains the random
   sample data, and the marker has to be able to restore that backup on their own machine.
   This file does the two halves of that job:

     1. BACKUP  - after 01_schema.sql, 02_seed.sql (and any data the demo added) were run,
                  the database is written to a .bak file with a matching .log copy.
     2. RESTORE - the .bak file is turned back into a working ZewailDesk database, from
                  scratch, and the row counts are printed so the restore can be trusted.

   Run this file with a login that is allowed to back up databases (SysAdmin or
   db_backupoperator + db_owner on ZewailDesk). The paths below are the default folders of
   a normal SQL Server installation; change them if the server stores its files elsewhere
   and check the current defaults first with:

       SELECT SERVERPROPERTY('InstanceDefaultDataPath') AS DataPath,
              SERVERPROPERTY('InstanceDefaultLogPath')  AS LogPath;

   The commands themselves cannot be executed in this development sandbox (there is no SQL
   Server here), so they are written for the machine of the demonstration; the checks that
   were run without a server are listed in docs/PROGRESS.md.
   ===================================================================================== */

USE master;
GO
SET NOCOUNT ON;
GO

/* -------------------------------------------------------------------------------------
   1. BACKUP
   The name of the file carries the date, so a backup of last week is never overwritten by
   the one of today. FORMAT INIT starts a fresh media set; if the .bak file already exists
   and its content should be kept, delete FORMAT (SQL Server then appends to the media set).
   ------------------------------------------------------------------------------------- */

DECLARE @BackupFolder SYSNAME = N'C:\ZewailDesk_Backups\';
DECLARE @BackupFile   NVARCHAR(400);
DECLARE @LogFile      NVARCHAR(400);
DECLARE @BackupName   NVARCHAR(200);

SET @BackupFile = @BackupFolder + N'ZewailDesk_' + CONVERT(CHAR(8), SYSDATETIME(), 112) + N'.bak';
SET @LogFile    = @BackupFolder + N'ZewailDesk_' + CONVERT(CHAR(8), SYSDATETIME(), 112) + N'.log.bak';
SET @BackupName = N'ZewailDesk full backup ' + CONVERT(NVARCHAR(30), SYSDATETIME(), 120);

/* the folder has to exist before the backup starts: SQL Server does not create it */
EXEC master.dbo.xp_create_subdir @BackupFolder;

PRINT N'Backing up ZewailDesk to ' + @BackupFile;

BACKUP DATABASE ZewailDesk
TO      DISK = @BackupFile
WITH    NAME = @BackupName,
        DESCRIPTION = N'CSAI 202 project database, sample data of the demo',
        INIT,
        FORMAT,
        CHECKSUM,
        STATS = 10;

PRINT N'Backing up the transaction log to ' + @LogFile;

BACKUP LOG ZewailDesk
TO      DISK = @LogFile
WITH    NAME = N'ZewailDesk log backup',
        INIT,
        CHECKSUM,
        STATS = 10;

/* Verify the file that was just written, without restoring it: this reads the header and
   every page of the media set and fails loudly when a page is broken. */
RESTORE VERIFYONLY
FROM    DISK = @BackupFile
WITH    CHECKSUM;

PRINT N'Backup finished and verified.';
GO

/* The list of the backups that are inside one file. Useful when a marker gets a .bak from
   the team and wants to know which database and which date it holds. */
-- RESTORE HEADERONLY FROM DISK = N'C:\ZewailDesk_Backups\ZewailDesk_20260116.bak';
-- RESTORE FILELISTONLY FROM DISK = N'C:\ZewailDesk_Backups\ZewailDesk_20260116.bak';

/* -------------------------------------------------------------------------------------
   2. RESTORE
   This is the half the marker runs. It works on a machine that has never seen the project:
   the database is created by the restore itself, the logical file names of the backup are
   moved to the default folders of the local server, and the connection is closed at the end
   so that no session keeps the old database.
   ------------------------------------------------------------------------------------- */

DECLARE @RestoreFile NVARCHAR(400) = N'C:\ZewailDesk_Backups\ZewailDesk_20260116.bak';

/* Read the logical file names out of the backup, so the RESTORE can move them. */
RESTORE FILELISTONLY FROM DISK = @RestoreFile;
GO

/* Copy the two names that the query above printed into @DataLogical and @LogLogical
   (they are ZewailDesk and ZewailDesk_log for a database that was created by
   01_schema.sql), and put the .mdf / .ldf where this server keeps its own files. */

DECLARE @RestoreFile   NVARCHAR(400) = N'C:\ZewailDesk_Backups\ZewailDesk_20260116.bak';
DECLARE @DataLogical   SYSNAME = N'ZewailDesk';
DECLARE @LogLogical    SYSNAME = N'ZewailDesk_log';
DECLARE @DataPath      NVARCHAR(400) = CAST(SERVERPROPERTY('InstanceDefaultDataPath') AS NVARCHAR(400));
DECLARE @LogPath       NVARCHAR(400) = CAST(SERVERPROPERTY('InstanceDefaultLogPath')  AS NVARCHAR(400));

IF DB_ID(N'ZewailDesk') IS NOT NULL
BEGIN
    ALTER DATABASE ZewailDesk SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    PRINT N'Existing ZewailDesk is taken over by the restore.';
END

RESTORE DATABASE ZewailDesk
FROM    DISK = @RestoreFile
WITH    MOVE @DataLogical TO @DataPath + N'ZewailDesk.mdf',
        MOVE @LogLogical  TO @LogPath  + N'ZewailDesk_log.ldf',
        REPLACE,
        RECOVERY,
        STATS = 10;

IF DB_ID(N'ZewailDesk') IS NOT NULL
BEGIN
    ALTER DATABASE ZewailDesk SET MULTI_USER;
    PRINT N'Restore finished, the database is back online.';
END
GO

/* -------------------------------------------------------------------------------------
   3. IS THE RESTORED DATABASE THE ONE OF THE DEMO?
   The row counts of the restored database have to match the table in README.md and in
   docs/PROGRESS.md. The last two queries prove that the objects of the schema are there
   and that the data of the sample still obeys its own rules.
   ------------------------------------------------------------------------------------- */

USE ZewailDesk;
GO

PRINT 'Row counts after the restore:';
SELECT  'AppUser' AS TableName, COUNT(*) AS Rows FROM dbo.AppUser
UNION ALL SELECT 'Student',    COUNT(*) FROM dbo.Student
UNION ALL SELECT 'Instructor', COUNT(*) FROM dbo.Instructor
UNION ALL SELECT 'Admin',      COUNT(*) FROM dbo.Admin
UNION ALL SELECT 'Department', COUNT(*) FROM dbo.Department
UNION ALL SELECT 'Program',    COUNT(*) FROM dbo.Program
UNION ALL SELECT 'Course',     COUNT(*) FROM dbo.Course
UNION ALL SELECT 'Prerequisite', COUNT(*) FROM dbo.Prerequisite
UNION ALL SELECT 'Semester',   COUNT(*) FROM dbo.Semester
UNION ALL SELECT 'Room',       COUNT(*) FROM dbo.Room
UNION ALL SELECT 'Section',    COUNT(*) FROM dbo.Section
UNION ALL SELECT 'Enrollment', COUNT(*) FROM dbo.Enrollment
UNION ALL SELECT 'Attendance', COUNT(*) FROM dbo.Attendance
UNION ALL SELECT 'Payment',    COUNT(*) FROM dbo.Payment
UNION ALL SELECT 'Announcement', COUNT(*) FROM dbo.Announcement
ORDER BY TableName;
GO

PRINT 'Objects of the schema:';
SELECT  o.type_desc, COUNT(*) AS Objects
FROM    sys.objects o
WHERE   o.is_ms_shipped = 0
GROUP BY o.type_desc
ORDER BY o.type_desc;
GO

PRINT 'Foreign keys that are not trusted or not enabled (both have to be 0):';
SELECT  SUM(CASE WHEN is_disabled = 1 THEN 1 ELSE 0 END)      AS DisabledForeignKeys,
        SUM(CASE WHEN is_not_trusted = 1 THEN 1 ELSE 0 END)   AS UntrustedForeignKeys
FROM    sys.foreign_keys;
GO

PRINT 'Registrations that still break a rule (all the counts have to be 0):';
WITH Overbooked AS (
    -- sections whose active enrolments are more than the seats they announced
    SELECT  s.SectionId
    FROM    dbo.Section s
    LEFT JOIN dbo.Enrollment e ON e.SectionId = s.SectionId
                              AND e.Status IN ('Enrolled', 'Completed')
    GROUP BY s.SectionId, s.Capacity
    HAVING  COUNT(e.EnrollmentId) > s.Capacity
)
SELECT  (SELECT COUNT(*) FROM Overbooked)                                             AS OverbookedSections,
        (SELECT COUNT(*) FROM dbo.Enrollment WHERE GradePublished = 1 AND Score IS NULL) AS PublishedWithoutScore,
        (SELECT COUNT(*) FROM dbo.Enrollment
          WHERE (LetterGrade IS NULL) <> (GradePoints IS NULL))                        AS HalfSetGrade,
        (SELECT COUNT(*) FROM dbo.Enrollment e
          JOIN dbo.Section s     ON s.SectionId  = e.SectionId
          JOIN dbo.Semester sem  ON sem.SemesterId = s.SemesterId
         WHERE sem.RegistrationOpen = 1 AND e.EnrolledAt > sem.RegistrationDeadline)   AS LateRegistrations;
GO

PRINT 'Backup and restore script finished.';
GO
