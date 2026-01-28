const asyncHandler = (requestHandler) => {
  return async (req, res, next) => {
    try {
      await requestHandler(req, res, next);
    } catch (error) {
      console.error('❌ Error in asyncHandler:', error); // Optional logging for debugging
      next(error); // Pass error to global error handler
    }
  };
};

export { asyncHandler };