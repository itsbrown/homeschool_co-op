import { buildPostgresUrl } from './server/lib/database-url.ts';

const encodedUrl = buildPostgresUrl();
if (!encodedUrl) {
  console.error('❌ Could not build DATABASE_URL');
  process.exit(1);
}

console.log('✅ Generated properly encoded DATABASE_URL');
console.log('🔄 Setting DATABASE_URL and running db:push...\n');

// Set the environment variable
process.env.DATABASE_URL = encodedUrl;

// Run db:push
const { execSync } = await import('child_process');
try {
  execSync('npm run db:push -- --force', { 
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: encodedUrl }
  });
  console.log('\n✅ Schema sync complete!');
} catch (error) {
  console.error('\n❌ Schema sync failed:', error.message);
  process.exit(1);
}
