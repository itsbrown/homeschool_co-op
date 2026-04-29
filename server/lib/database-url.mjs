export function getDbSslConfig() {
  return process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false;
}

export function getPostgresJsSslOption() {
  return process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false;
}
