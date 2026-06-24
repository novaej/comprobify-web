// RFC 7807 Problem Details shape returned by the Comprobify API on all 4xx/5xx responses.
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  code: string; // Stable SCREAMING_SNAKE_CASE i18n key (e.g. DOCUMENT_NOT_FOUND)
  detail: string;
  instance: string;
  errors?: FieldError[]; // Present on VALIDATION_ERROR responses
}

export interface FieldError {
  field: string;
  code: string;
  message: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly detail: string;
  readonly errors?: FieldError[];

  constructor(problem: ProblemDetails) {
    super(problem.detail);
    this.name = 'ApiError';
    this.status = problem.status;
    this.code = problem.code;
    this.detail = problem.detail;
    this.errors = problem.errors;
  }

  isNotFound(): boolean {
    return this.status === 404;
  }

  isUnauthorized(): boolean {
    return this.status === 401;
  }

  isValidation(): boolean {
    return this.code === 'VALIDATION_FAILED';
  }

  isRateLimit(): boolean {
    return this.status === 429;
  }
}
