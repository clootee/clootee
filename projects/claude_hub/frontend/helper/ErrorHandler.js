// Shared error formatter for browser actions; alert integrations belong here.
const ErrorHandler = {
  handle(error, context) {
    this._alert(error, context);
    return error instanceof Error ? error.message : String(error || '');
  },
  _alert(_error, _context) {},
};
