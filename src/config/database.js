const env = require('./env');

const database = {
  url: env.databaseUrl,
  isConfigured: Boolean(env.databaseUrl),
};

module.exports = database;
