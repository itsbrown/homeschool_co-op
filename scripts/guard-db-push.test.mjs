import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { evaluateDbPush, refusalMessage } from './guard-db-push.mjs';

const root = resolve(import.meta.dirname, '..');
const localUrl = 'postgresql://test:test@localhost:5432/asa_test';

function env(overrides) {
  return { ...overrides };
}

test('refuses when ALLOW_DB_PUSH is missing', () => {
  const result = evaluateDbPush(env({ DATABASE_URL: localUrl, NODE_ENV: 'development' }));
  assert.equal(result.allowed, false);
  assert.match(result.reasons.join('\n'), /ALLOW_DB_PUSH=1/);
});

test('allows a local database only when ALLOW_DB_PUSH=1', () => {
  const result = evaluateDbPush(
    env({ DATABASE_URL: localUrl, NODE_ENV: 'development', ALLOW_DB_PUSH: '1' }),
  );
  assert.equal(result.allowed, true);
  assert.deepEqual(result.reasons, []);
});

test('ALLOW_DB_PUSH=true is not enough', () => {
  const result = evaluateDbPush(
    env({ DATABASE_URL: localUrl, NODE_ENV: 'test', ALLOW_DB_PUSH: 'true' }),
  );
  assert.equal(result.allowed, false);
});

test('refuses NODE_ENV=production even with ALLOW_DB_PUSH=1', () => {
  const result = evaluateDbPush(
    env({ DATABASE_URL: localUrl, NODE_ENV: 'production', ALLOW_DB_PUSH: '1' }),
  );
  assert.equal(result.allowed, false);
  assert.match(result.reasons.join('\n'), /NODE_ENV=production/);
});

test('refuses when REPLIT_DEPLOYMENT is set', () => {
  const result = evaluateDbPush(
    env({
      DATABASE_URL: localUrl,
      NODE_ENV: 'development',
      ALLOW_DB_PUSH: '1',
      REPLIT_DEPLOYMENT: '1',
    }),
  );
  assert.equal(result.allowed, false);
  assert.match(result.reasons.join('\n'), /REPLIT_DEPLOYMENT/);
});

test('refuses the known Supabase production project without echoing the password', () => {
  const password = 'super-secret-db-password';
  const databaseUrl = `postgresql://postgres:${password}@db.moivwjuglwwfrhqeewju.supabase.co:5432/postgres`;
  const result = evaluateDbPush(
    env({ DATABASE_URL: databaseUrl, NODE_ENV: 'development', ALLOW_DB_PUSH: '1' }),
  );
  assert.equal(result.allowed, false);
  assert.match(result.reasons.join('\n'), /production host/);
  const message = refusalMessage(result.reasons);
  assert.equal(message.includes(password), false);
  assert.equal(message.includes(databaseUrl), false);
});

test('refuses a pooler URL that only carries the project ref in the user', () => {
  const result = evaluateDbPush(
    env({
      DATABASE_URL: 'postgresql://postgres.moivwjuglwwfrhqeewju:secret@aws-0-us-east-1.pooler.supabase.com:5432/postgres',
      ALLOW_DB_PUSH: '1',
      NODE_ENV: 'development',
    }),
  );
  assert.equal(result.allowed, false);
  assert.equal(refusalMessage(result.reasons).includes('secret'), false);
});

test('refuses a host listed in PROD_DATABASE_HOST or PRODUCTION_DATABASE_URL', () => {
  const byHost = evaluateDbPush(
    env({
      DATABASE_URL: 'postgresql://u:p@ep-prod.example.neon.tech/asa',
      ALLOW_DB_PUSH: '1',
      NODE_ENV: 'development',
      PROD_DATABASE_HOST: 'ep-prod.example.neon.tech',
    }),
  );
  assert.equal(byHost.allowed, false);

  const byUrl = evaluateDbPush(
    env({
      DATABASE_URL: 'postgresql://u:p@db.prod.internal:5432/asa',
      ALLOW_DB_PUSH: '1',
      PRODUCTION_DATABASE_URL: 'postgresql://other:other@db.prod.internal:5432/asa',
    }),
  );
  assert.equal(byUrl.allowed, false);
});

test('refuses when DATABASE_URL is unset', () => {
  const result = evaluateDbPush(env({ ALLOW_DB_PUSH: '1', NODE_ENV: 'development' }));
  assert.equal(result.allowed, false);
  assert.match(result.reasons.join('\n'), /DATABASE_URL is not set/);
});

test('db:push is guarded and deploy/start/build do not push', () => {
  const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  assert.match(pkg.scripts['db:push'], /^node scripts\/guard-db-push\.mjs && drizzle-kit push/);
  for (const [name, command] of Object.entries(pkg.scripts)) {
    if (name === 'db:push') continue;
    assert.doesNotMatch(
      command,
      /drizzle-kit|db:push|sync_schema|db-push/,
      `${name} must not invoke a schema push`,
    );
  }
  assert.equal(pkg.scripts.postinstall, undefined);
  assert.equal(pkg.scripts.prestart, undefined);

  const replit = readFileSync(resolve(root, '.replit'), 'utf8');
  assert.doesNotMatch(replit, /drizzle-kit|db:push|sync_schema|db-push/);

  const index = readFileSync(resolve(root, 'server/index.ts'), 'utf8');
  assert.doesNotMatch(index, /drizzle-kit|db:push/);

  const postMerge = readFileSync(resolve(root, 'scripts/post-merge.sh'), 'utf8');
  const executable = postMerge
    .split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n');
  assert.doesNotMatch(executable, /db:push|drizzle-kit/);

  const drizzleConfig = readFileSync(resolve(root, 'drizzle.config.ts'), 'utf8');
  assert.match(drizzleConfig, /assertDbPushAllowed/);

  for (const rel of ['scripts/db-push.js', 'scripts/db-push-with-env.mjs', 'scripts/ci-db-push.mjs']) {
    const source = readFileSync(resolve(root, rel), 'utf8');
    assert.match(source, /guard-db-push/, `${rel} must call the guard`);
  }
});

test('removed secret files stay gone and gitignore covers tooling output', () => {
  assert.equal(existsSync(resolve(root, 'db_push_output.txt')), false);
  const gitignore = readFileSync(resolve(root, '.gitignore'), 'utf8');
  assert.match(gitignore, /\*_output\.txt/);
  assert.match(gitignore, /^\.env\*$/m);

  const banned = [
    'server/db/supabase.ts',
    'scripts/create-admin.ts',
    'start-with-test-keys.sh',
    'create-supabase-auth-account.js',
    'scripts/create-all-test-accounts.js',
    'scripts/create-parent-test-account.js',
  ];
  for (const rel of banned) {
    const text = readFileSync(resolve(root, rel), 'utf8');
    assert.doesNotMatch(text, /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vaXZ3anVnbHd3ZnJocWVld2p1/);
    assert.doesNotMatch(text, /sk_(live|test)_51/);
    assert.doesNotMatch(text, /postgres(ql)?:\/\/[^'"\s]+:[^'"\s]+@/i);
    assert.doesNotMatch(text, /password\s*[:=]\s*['"][^'"]+['"]/i);
  }
});
