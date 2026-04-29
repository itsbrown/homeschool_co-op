type PgSslConfig = { rejectUnauthorized: false } | false;

export function getDbSslConfig(): PgSslConfig;
export function getPostgresJsSslOption(): PgSslConfig;
