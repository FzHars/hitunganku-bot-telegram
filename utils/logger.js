const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL] || 1;

const log = (level, message, meta = {}) => {
  if (LOG_LEVELS[level] < currentLevel) return;

  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...meta,
  };

  const output = JSON.stringify(entry);
  if (level === 'error') console.error(output);
  else console.log(output);
};

module.exports = {
  debug: (msg, meta) => log('debug', msg, meta),
  info: (msg, meta) => log('info', msg, meta),
  warn: (msg, meta) => log('warn', msg, meta),
  error: (msg, meta) => log('error', msg, meta),
};
