# Production Setup Guide

## Before Deploying to Production

### 1. Clean Test Data

**⚠️ IMPORTANT: Run this before going live to remove all test data**

```bash
# Preview what will be removed (safe to run)
node scripts/cleanup-test-data.js

# Actually remove test data (requires confirmation)
node scripts/cleanup-test-data.js --confirm
```

This script will:
- Remove all users with test emails (testing321, @test, etc.)
- Remove test staff members and children
- Remove test classes and enrollments
- Keep production data for American Seekers Academy
- Create backups of all data before cleanup

### 2. Environment Variables for Production

Ensure these environment variables are set:

```bash
# Stripe (Production Keys)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Brevo Email Service
BREVO_API_KEY=your_brevo_api_key
BREVO_SENDER_EMAIL=your_verified_sender_email

# Database (Production)
DATABASE_URL=your_production_database_url

# Auth0 (Production)
AUTH0_DOMAIN=your_auth0_domain
AUTH0_CLIENT_ID=your_auth0_client_id
AUTH0_CLIENT_SECRET=your_auth0_client_secret
```

### 3. Test Data Patterns Removed

The cleanup script removes data containing:
- "test", "debug", "sample", "demo", "mock", "fake"
- Email addresses with @test, @testing, testing321
- Staff with test names or positions
- Classes created for testing purposes

### 4. Production Data Preserved

The script keeps:
- coreycreates@gmail.com (admin account)
- American Seekers Academy school data
- Production classes and legitimate enrollments
- Real parent and student accounts

### 5. Manual Verification

After running the cleanup script:

1. **Check User Accounts**: Verify only real parents/staff remain
2. **Verify Classes**: Ensure only legitimate classes are available
3. **Test Enrollment**: Try enrolling a real student in a real class
4. **Test Payments**: Verify Stripe integration with production keys
5. **Test Emails**: Verify Brevo sends emails correctly

### 6. Deployment Checklist

- [ ] Run test data cleanup script
- [ ] Update environment variables to production values
- [ ] Test core functionality (enrollment, payment, emails)
- [ ] Verify user authentication works
- [ ] Check that only real schools/classes appear
- [ ] Test staff invitation system
- [ ] Verify email delivery works

### 7. Post-Deployment Monitoring

Monitor these after going live:
- User registrations and enrollments
- Payment processing success rate
- Email delivery status
- Error logs for any issues
- Database performance

### 8. Rollback Plan

If issues occur:
- Revert to previous deployment
- Restore data from backups in `data/backups/`
- Switch back to test environment variables
- Contact support if needed

## File Structure After Cleanup

```
data/
├── backups/           # Contains backups of original data
├── users.json         # Only production users
├── children.json      # Only real children
├── classes.json       # Only legitimate classes
├── enrollments.json   # Only real enrollments
├── staff.json         # Only real staff members
└── schools.json       # Only real schools
```

## Support

If you encounter issues during production setup:
1. Check the logs in the application console
2. Verify environment variables are correctly set
3. Ensure all required services (Stripe, Brevo, Auth0) are configured
4. Contact technical support if needed