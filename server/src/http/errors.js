/**
 * Errors of the API.
 *
 * Every failure that the client can do something about (a rule of registration, a wrong
 * password, a validation problem) is an ApiError with a status code and a code of its own.
 * The messages of the procedures of the database are passed through unchanged, so the user
 * sees the sentence that the database wrote.
 */
export class ApiError extends Error {
  constructor(status, code, message, details = undefined) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (code, message, details) => new ApiError(400, code, message, details);
export const unauthorized = (message = 'Sign in first.', code = 'not_signed_in') =>
  new ApiError(401, code, message);
export const forbidden = (message = 'Your account is not allowed to do this.', code = 'forbidden') =>
  new ApiError(403, code, message);
export const notFound = (message = 'Not found.', code = 'not_found') => new ApiError(404, code, message);
export const conflict = (code, message, details) => new ApiError(409, code, message, details);

/**
 * Turn a driver error into something the client understands.
 *
 * The procedures of database/01_schema.sql throw their own error numbers:
 *   51000 - 51009  sp_RegisterStudent (registration rules R1 .. R7)
 *   51020 - 51022  sp_DropEnrollment
 *   51030          sp_PublishGrades
 *   51040          sp_CreateFirstAdmin
 * The message of a THROW is written for the student who sees it, so it is used as it is.
 */
export function translateDatabaseError(error) {
  const number = error?.number;
  const message = error?.message || 'The database refused the operation.';

  if (typeof number === 'number' && number >= 51000 && number < 51050) {
    const status = number === 51040 ? 409 : 409;      // a rule, not a crash: 409 Conflict
    return new ApiError(status, `db_rule_${number}`, message);
  }
  switch (number) {
    case 2627:                                        // unique key violation
    case 2601:
      return conflict('duplicate_value', 'This value already exists in the database. A second row with the same key was refused.', message);
    case 547:                                         // foreign key or check constraint
      return conflict('constraint_violation', 'The related row does not exist, or is still used by another row, so the database refused to change it.', message);
    case 515:
      return badRequest('missing_value', 'A value that the database needs was not sent.', message);
    case 245:
      return badRequest('wrong_type', 'A value has the wrong type for its column.', message);
    case 4060:
    case 18456:
      return new ApiError(503, 'cannot_open_database', 'The API cannot open the project database. Check DB_NAME, DB_USER and DB_PASSWORD.', message);
    case 1205:
      return conflict('deadlock', 'Two operations touched the same rows at the same time. Please try again.', message);
    default:
      if (error?.code === 'ETIMEOUT' || error?.code === 'ESOCKET' || error?.code === 'ECONNCLOSED') {
        return new ApiError(503, 'database_unreachable', 'The API cannot reach SQL Server. Is the server running and is DB_SERVER correct?', message);
      }
      return new ApiError(500, 'database_error', 'The database reported an error.', message);
  }
}
