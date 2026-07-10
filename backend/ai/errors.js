'use strict';

/**
 * Thrown when an error occurs that is temporary and should be retried
 * (e.g., timeout, connection refused, malformed JSON chunk).
 */
class TransientError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TransientError';
  }
}

/**
 * Thrown when an error occurs that cannot be fixed by retrying
 * (e.g., authentication failure, invalid schema, tool unapproved).
 */
class PermanentError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PermanentError';
  }
}

// -----------------------------------------------------
// Structured Subclasses
// -----------------------------------------------------

class ValidationError extends PermanentError {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

class CapabilityError extends PermanentError {
  constructor(message) {
    super(message);
    this.name = 'CapabilityError';
  }
}

class PermissionError extends PermanentError {
  constructor(message) {
    super(message);
    this.name = 'PermissionError';
  }
}

class ToolExecutionError extends PermanentError {
  constructor(message) {
    super(message);
    this.name = 'ToolExecutionError';
  }
}

class ProviderError extends TransientError {
  constructor(message) {
    super(message);
    this.name = 'ProviderError';
  }
}

module.exports = {
  PermanentError,
  TransientError,
  ValidationError,
  CapabilityError,
  PermissionError,
  ToolExecutionError,
  ProviderError
};
