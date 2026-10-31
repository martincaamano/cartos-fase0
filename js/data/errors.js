// Errors raised by the data layer, shared by every module that talks to
// Google or writes to the outbox.

// The data broke a domain rule; errors holds the codes (e.g. 'amount_invalid').
export class ValidationError extends Error {
  constructor(errors) {
    super(`Invalid data: ${errors.join(', ')}`);
    this.name = 'ValidationError';
    this.errors = errors;
  }
}

// Stops when a domain check found problems (error codes); does nothing
// when there are none.
export function assertValid(errors) {
  if (errors.length) throw new ValidationError(errors);
}

// A Google REST call failed. status 0 means it never got an answer.
export class ApiError extends Error {
  constructor(status, op) {
    super(`Google API ${op} failed with ${status}`);
    // The name goes to the log (sync:ApiError:403), so it says what failed.
    this.name = 'ApiError';
    this.status = status;
    this.op = op;
  }
}
