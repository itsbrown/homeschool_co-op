import { describe, it, expect, afterEach } from '@jest/globals';
import {
  normalizeDatabaseUrl,
  getNormalizedDatabaseUrl,
  getDbSslConfig,
  getPostgresJsSslOption,
} from '../../lib/database-url';

describe('normalizeDatabaseUrl', () => {
  it('returns undefined / null / empty input unchanged', () => {
    expect(normalizeDatabaseUrl(undefined as any)).toBeUndefined();
    expect(normalizeDatabaseUrl(null as any)).toBeNull();
    expect(normalizeDatabaseUrl('')).toBe('');
  });

  it('returns an already-valid URL unchanged', () => {
    const url = 'postgresql://postgres:simplepw@db.example.com:5432/postgres';
    expect(normalizeDatabaseUrl(url)).toBe(url);
  });

  it('returns an already-percent-encoded URL unchanged', () => {
    const url = 'postgresql://postgres:abc%2Bdef@db.example.com:5432/postgres';
    expect(normalizeDatabaseUrl(url)).toBe(url);
  });

  it('percent-encodes a password containing reserved characters (+, ?, ))', () => {
    const raw = 'postgresql://postgres:abc+d?ef)gh@db.example.com:5432/postgres';
    const fixed = normalizeDatabaseUrl(raw);
    // The repaired URL must now parse cleanly.
    expect(() => new URL(fixed!)).not.toThrow();
    const parsed = new URL(fixed!);
    expect(parsed.username).toBe('postgres');
    expect(parsed.host).toBe('db.example.com:5432');
    expect(parsed.pathname).toBe('/postgres');
    // decodeURIComponent should round-trip back to the original password.
    expect(decodeURIComponent(parsed.password)).toBe('abc+d?ef)gh');
  });

  it('preserves trailing query string / search params after the database name', () => {
    const raw = 'postgresql://u:p+wd@db.example.com:5432/postgres?sslmode=require';
    const fixed = normalizeDatabaseUrl(raw);
    expect(() => new URL(fixed!)).not.toThrow();
    const parsed = new URL(fixed!);
    expect(parsed.searchParams.get('sslmode')).toBe('require');
    expect(decodeURIComponent(parsed.password)).toBe('p+wd');
  });

  it('returns the raw input when the URL is too malformed to repair', () => {
    expect(normalizeDatabaseUrl('not a url at all')).toBe('not a url at all');
  });
});

describe('getDbSslConfig / getPostgresJsSslOption', () => {
  const originalEnv = process.env.NODE_ENV;
  afterEach(() => {
    if (originalEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnv;
  });

  it('disables SSL in development when no URL is supplied (Helium dev DB)', () => {
    process.env.NODE_ENV = 'development';
    expect(getDbSslConfig()).toBe(false);
    expect(getPostgresJsSslOption()).toBe(false);
  });

  it('enables SSL in production regardless of URL', () => {
    process.env.NODE_ENV = 'production';
    expect(getDbSslConfig()).toEqual({ rejectUnauthorized: false });
    expect(getPostgresJsSslOption('postgresql://u:p@localhost:5432/db')).toEqual({
      rejectUnauthorized: false,
    });
  });

  it('forces SSL in dev for managed cloud Postgres hosts (Neon, Supabase, RDS, ...)', () => {
    process.env.NODE_ENV = 'development';
    const hosts = [
      'postgresql://u:p@ep-foo.us-west-2.aws.neon.tech:5432/db',
      'postgresql://u:p@db.proj.supabase.co:5432/db',
      'postgresql://u:p@aws-0-us-west-1.pooler.supabase.com:5432/db',
      'postgresql://u:p@example.us-east-1.rds.amazonaws.com:5432/db',
    ];
    for (const url of hosts) {
      expect(getDbSslConfig(url)).toEqual({ rejectUnauthorized: false });
      expect(getPostgresJsSslOption(url)).toEqual({ rejectUnauthorized: false });
    }
  });

  it('forces SSL in dev when sslmode=require is in the URL', () => {
    process.env.NODE_ENV = 'development';
    const url = 'postgresql://u:p@localhost:5432/db?sslmode=require';
    expect(getDbSslConfig(url)).toEqual({ rejectUnauthorized: false });
    expect(getPostgresJsSslOption(url)).toEqual({ rejectUnauthorized: false });
  });

  it('keeps SSL disabled in dev for plain localhost / Helium-style URLs', () => {
    process.env.NODE_ENV = 'development';
    const url = 'postgresql://u:p@localhost:5432/asa_dev';
    expect(getDbSslConfig(url)).toBe(false);
    expect(getPostgresJsSslOption(url)).toBe(false);
  });
});

describe('getNormalizedDatabaseUrl', () => {
  const originalUrl = process.env.DATABASE_URL;

  afterEach(() => {
    if (originalUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalUrl;
    }
  });

  it('returns undefined when DATABASE_URL is not set', () => {
    delete process.env.DATABASE_URL;
    expect(getNormalizedDatabaseUrl()).toBeUndefined();
  });

  it('returns a normalized URL when DATABASE_URL contains reserved characters', () => {
    process.env.DATABASE_URL =
      'postgresql://postgres:abc+d?ef)gh@db.example.com:5432/postgres';
    const fixed = getNormalizedDatabaseUrl();
    expect(fixed).toBeDefined();
    expect(() => new URL(fixed!)).not.toThrow();
  });
});
