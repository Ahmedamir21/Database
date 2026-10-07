/**
 * Accounts: sign in, sign up, sign out, change the password, create the first administrator.
 *
 * Everything that touches AppUser goes through this file, so there is exactly one place
 * where a password is read, hashed or compared, and exactly one place that decides what a
 * session means.
 */
import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import * as SQL from '../sql/statements.js';
import { query, queryOne, withTransaction } from '../db.js';
import { badRequest, conflict, forbidden, notFound, unauthorized } from '../http/errors.js';

const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const ALLOWED_ROLES = ['Student', 'Instructor', 'Admin'];

export function normaliseEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function describePasswordProblem(password, ...forbidden) {
  const value = String(password || '');
  if (value.length < 8) return 'The password must be at least 8 characters long.';
  if (!/[A-Za-z]/.test(value) || !/[0-9]/.test(value)) {
    return 'The password must contain at least one letter and one digit.';
  }
  const lowered = value.toLowerCase();
  for (const item of forbidden.filter(Boolean)) {
    if (item.length >= 4 && lowered.includes(String(item).toLowerCase())) {
      return 'The password must not contain your name or your e-mail address.';
    }
  }
  return null;
}

export async function findAccountByEmail(email) {
  return queryOne(SQL.A1_FIND_ACCOUNT_BY_EMAIL, { Email: normaliseEmail(email) });
}

/**
 * Check the credentials. The comparison is bcrypt.compare on the stored hash: the plain
 * password exists only in the body of this request and is never written down, neither in
 * the database nor in a log.
 */
export async function login(email, password) {
  const account = await findAccountByEmail(email);
  if (!account) {
    // the same answer for "no such e-mail" and "wrong password": nothing is leaked
    throw unauthorized('The e-mail address or the password is not correct.', 'bad_credentials');
  }
  const ok = await bcrypt.compare(String(password || ''), account.PasswordHash);
  if (!ok) {
    throw unauthorized('The e-mail address or the password is not correct.', 'bad_credentials');
  }
  if (!account.IsActive) {
    throw forbidden('This account is waiting for the approval of an administrator.', 'account_inactive');
  }
  await query(SQL.A8_TOUCH_LOGIN, { UserId: account.UserId });
  return getSessionUser(account.UserId);
}

/** everything the client needs to know about the signed in person */
export async function getSessionUser(userId) {
  const row = await queryOne(SQL.A2_SESSION_USER, { UserId: userId });
  if (!row) return null;
  return {
    userId: row.UserId,
    fullName: row.FullName,
    email: row.Email,
    role: row.Role,
    isActive: Boolean(row.IsActive),
    createdAt: row.CreatedAt,
    lastLoginAt: row.LastLoginAt,
    studentNumber: row.StudentNumber,
    studentId: row.Role === 'Student' ? row.UserId : null,
    level: row.Level,
    programId: row.ProgramId,
    programName: row.ProgramName,
    totalCreditHours: row.TotalCreditHours,
    advisorId: row.AdvisorId,
    departmentId: row.DepartmentId,
    departmentName: row.DepartmentName,
    title: row.Title,
    position: row.Position,
    canRecordPayments: row.CanRecordPayments === null ? false : Boolean(row.CanRecordPayments),
  };
}

export async function changePassword(userId, currentPassword, newPassword, confirmPassword) {
  const row = await queryOne(SQL.A2B_ACCOUNT_BY_ID, { UserId: userId });
  if (!row) throw notFound('The account does not exist.', 'account_missing');

  const ok = await bcrypt.compare(String(currentPassword || ''), row.PasswordHash);
  if (!ok) throw forbidden('The current password is not correct.', 'wrong_current_password');

  if (String(newPassword || '') !== String(confirmPassword || '')) {
    throw badRequest('password_mismatch', 'The new password and its confirmation are not the same.');
  }
  const problem = describePasswordProblem(newPassword, row.Email, row.FullName);
  if (problem) throw badRequest('weak_password', problem);

  const sameAsOld = await bcrypt.compare(String(newPassword), row.PasswordHash);
  if (sameAsOld) throw badRequest('password_reused', 'The new password must be different from the current one.');

  const hash = await bcrypt.hash(String(newPassword), config.auth.bcryptRounds);
  await query(SQL.A7_UPDATE_PASSWORD, { UserId: userId, PasswordHash: hash });
  return true;
}

/** a student number of the form 20250001, unique inside the enrollment year */
async function nextStudentNumber(enrollmentYear) {
  const row = await queryOne(SQL.A10_NEXT_STUDENT_NUMBER, { Year: enrollmentYear });
  return row ? row.NextStudentNumber : `${enrollmentYear}0001`;
}

/**
 * Sign up of a student. AppUser and Student are written inside one transaction, so a person
 * can never exist without their subtype row (that is the whole point of the super entity).
 */
export async function signUpStudent(input) {
  const fullName = String(input.fullName || '').trim();
  const email = normaliseEmail(input.email);
  const programId = Number.parseInt(input.programId, 10);
  const enrollmentYear = Number.parseInt(input.enrollmentYear, 10) || new Date().getFullYear();

  if (fullName.length < 3) throw badRequest('name_too_short', 'Please type your full name.');
  if (!EMAIL_PATTERN.test(email)) throw badRequest('bad_email', 'That is not a valid e-mail address.');
  if (!Number.isInteger(programId)) throw badRequest('program_required', 'Please choose a program.');
  if (enrollmentYear < 2000 || enrollmentYear > 2100) {
    throw badRequest('bad_year', 'The enrollment year is not plausible.');
  }
  const problem = describePasswordProblem(input.password, email, fullName);
  if (problem) throw badRequest('weak_password', problem);
  if (String(input.password) !== String(input.confirmPassword)) {
    throw badRequest('password_mismatch', 'The password and its confirmation are not the same.');
  }
  const taken = await queryOne(SQL.A13_EMAIL_TAKEN, { Email: email });
  if (taken && taken.Taken > 0) {
    throw conflict('email_taken', 'There is already an account with this e-mail address.');
  }

  const hash = await bcrypt.hash(String(input.password), config.auth.bcryptRounds);
  const userId = await withTransaction(async (trx) => {
    const inserted = await trx.queryOne(SQL.A3_INSERT_APP_USER, {
      FullName: fullName,
      Email: email,
      PasswordHash: hash,
      Role: 'Student',
      IsActive: 1,
    });
    const studentNumber = await nextStudentNumber(enrollmentYear);
    await trx.query(SQL.A4_INSERT_STUDENT, {
      UserId: inserted.UserId,
      StudentNumber: studentNumber,
      ProgramId: programId,
      EnrollmentYear: enrollmentYear,
    });
    return inserted.UserId;
  });

  return { userId, ...(await getSessionUser(userId)) };
}

/**
 * Sign up of an instructor or of a member of staff. The account is created with
 * IsActive = 0: an administrator has to approve it before the person can sign in, which is
 * exactly the "only the first administrator is created by hand" rule of the project.
 */
export async function signUpInstructor(input) {
  const fullName = String(input.fullName || '').trim();
  const email = normaliseEmail(input.email);
  const departmentId = Number.parseInt(input.departmentId, 10);
  const title = ['Prof.', 'Dr.', 'T.A.'].includes(input.title) ? input.title : 'T.A.';

  if (fullName.length < 3) throw badRequest('name_too_short', 'Please type your full name.');
  if (!EMAIL_PATTERN.test(email)) throw badRequest('bad_email', 'That is not a valid e-mail address.');
  if (!Number.isInteger(departmentId)) throw badRequest('department_required', 'Please choose a department.');
  const problem = describePasswordProblem(input.password, email, fullName);
  if (problem) throw badRequest('weak_password', problem);
  if (String(input.password) !== String(input.confirmPassword)) {
    throw badRequest('password_mismatch', 'The password and its confirmation are not the same.');
  }
  const taken = await queryOne(SQL.A13_EMAIL_TAKEN, { Email: email });
  if (taken && taken.Taken > 0) {
    throw conflict('email_taken', 'There is already an account with this e-mail address.');
  }

  const hash = await bcrypt.hash(String(input.password), config.auth.bcryptRounds);
  const userId = await withTransaction(async (trx) => {
    const inserted = await trx.queryOne(SQL.A3_INSERT_APP_USER, {
      FullName: fullName,
      Email: email,
      PasswordHash: hash,
      Role: 'Instructor',
      IsActive: 0,
    });
    await trx.query(SQL.A5_INSERT_INSTRUCTOR, {
      UserId: inserted.UserId,
      DepartmentId: departmentId,
      Title: title,
      Specialization: input.specialization ? String(input.specialization).slice(0, 120) : null,
    });
    return inserted.UserId;
  });

  return { userId, message: 'Your account was created. An administrator has to approve it before you can sign in.' };
}

export async function countAdmins() {
  const row = await queryOne(SQL.A9_COUNT_ADMINS);
  return row ? row.AdminCount : 0;
}

export async function listSignUpOptions() {
  const [programs, departments] = await Promise.all([
    query(SQL.S1_PROGRAMS_FOR_SIGNUP),
    query(SQL.S2_DEPARTMENTS_FOR_SIGNUP),
  ]);
  return { programs, departments };
}
