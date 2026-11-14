/** Fejl der er sikre at vise for brugeren. */
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    this.expose = true;
  }
}

export const notFound = (message = 'Ressourcen blev ikke fundet.') =>
  new AppError(404, 'NOT_FOUND', message);
