// Schema sync helper.
// DATABASE_URL is now the single source of truth for the application's
// Postgres connection. This script just confirms it is present and
// invokes drizzle-kit. SSL behavior is encoded in DATABASE_URL itself
// (or omitted entirely for the local Helium dev DB).
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('❌ DATABASE_URL is not set');
  process.exit(1);
}

console.log('✅ DATABASE_URL detected');
console.log('🔄 Running db:push...\n');

const { execSync } = await import('child_process');
try {
  execSync('npm run db:push -- --force', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
  console.log('\n✅ Schema sync complete!');
} catch (error) {
  console.error('\n❌ Schema sync failed:', error.message);
  process.exit(1);
}
