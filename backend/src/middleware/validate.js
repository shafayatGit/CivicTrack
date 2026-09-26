// Express 5 makes req.query a getter-only property (verified on 5.2.1), so it cannot
// be reassigned the way req.body can. Query results therefore land on
// `req.validatedQuery` and controllers read that instead of req.query.
// `validate` keeps its original body-only signature so the existing category routes
// are untouched.
const validateBody = (schema) => (req, res, next) => {
  try {
    req.body = schema.parse(req.body);
    next();
  } catch (error) {
    next(error);
  }
};

const validateQuery = (schema) => (req, res, next) => {
  try {
    req.validatedQuery = schema.parse(req.query);
    next();
  } catch (error) {
    next(error);
  }
};

export default validateBody;
export { validateBody, validateQuery };
