'use strict';

function getDbSslConfig() {
  return process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false;
}

function getPostgresJsSslOption() {
  return process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false;
}

module.exports = {
  getDbSslConfig,
  getPostgresJsSslOption,
};
