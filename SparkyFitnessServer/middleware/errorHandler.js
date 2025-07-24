const { log } = require("../config/logging");

const errorHandler = (err, req, res, next) => {
  log(
    "error",
    `Error caught by centralized handler: ${err.message}`,
    err.stack,
  );

  // Default to 500 Internal Server Error
  let statusCode = err.statusCode || 500;
  let message = err.message || "Internal Server Error";

  // Handle specific error types if needed (e.g., database errors, validation errors)
  switch (err.name) {
    case "UnauthorizedError": // Example for JWT errors
      statusCode = 401;
      message = "Unauthorized: Invalid or missing token.";
      break;

    case "ForbiddenError": // Example for custom forbidden errors
      statusCode = 403;
      message = "Forbidden: You do not have permission to perform this action.";
      break;

    case "ValidationError": // Example for validation errors
      statusCode = 400;
      message = err.message;
      break;

    default:
      // Handle cases not based on err.name inside the default
      if (err.code === "23505") {
        statusCode = 409;
        message =
          "Conflict: A resource with this unique identifier already exists.";
      }
      break;
  }
  res.status(statusCode).json({
    error: message,
    details: process.env.NODE_ENV === "development" ? err.stack : undefined, // Only send stack in development
  });
};

module.exports = errorHandler;
