# Stripe Account Lookup Testing Guide

## Overview
This guide provides step-by-step instructions for manually testing the Stripe account lookup feature that runs during payment intent creation.

## What Gets Tested
The Stripe account lookup feature automatically:
1. 🔍 Searches for existing Stripe customers by email during checkout
2. ✅ Detects active Stripe subscriptions
3. 💾 Updates the database with Stripe customer IDs
4. 🎓 Creates/updates membership enrollments from subscriptions

## Test Endpoint
We've created a dedicated test endpoint for debugging the lookup logic:

**Endpoint**: `POST /api/stripe/test-account-lookup`
**Auth**: Requires Supabase authentication
**Request Body**:
```json
{
  "email": "user@example.com"
}
```

**Response**:
```json
{
  "success": true,
  "result": {
    "email": "user@example.com",
    "timestamp": "2025-11-24T...",
    "stripeCustomer": {
      "id": "cus_xxx",
      "email": "user@example.com",
      "created": 1700000000,
      "metadata": {}
    },
    "activeSubscriptions": [
      {
        "id": "sub_xxx",
        "status": "active",
        "current_period_start": 1700000000,
        "current_period_end": 1700000000,
        "items": [...],
        "metadata": {}
      }
    ],
    "databaseUser": {
      "id": 123,
      "email": "user@example.com",
      "schoolId": 1,
      "stripeCustomerId": "cus_xxx",
      "role": "parent"
    },
    "membershipEnrollments": [
      {
        "id": 1,
        "membershipYear": 2025,
        "status": "enrolled",
        "amount": 17500,
        "stripeSubscriptionId": "sub_xxx"
      }
    ],
    "summary": {
      "hasStripeCustomer": true,
      "hasActiveSubscription": true,
      "hasDatabaseRecord": true,
      "hasActiveMembership": true
    },
    "recommendation": "Everything is in sync! ✅"
  }
}
```

## Manual Testing Procedure

### Test 1: New User (No Stripe Account)

**Purpose**: Verify behavior when user has no Stripe account

1. **Create a test user**:
   - Register as a parent: `test.parent.new@example.com`
   - Complete registration flow

2. **Test the lookup endpoint**:
   ```bash
   curl -X POST http://localhost:5000/api/stripe/test-account-lookup \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
     -d '{"email": "test.parent.new@example.com"}'
   ```

3. **Expected Results**:
   - ✅ `summary.hasDatabaseRecord`: `true`
   - ❌ `summary.hasStripeCustomer`: `false`
   - ❌ `summary.hasActiveSubscription`: `false`
   - 📝 `recommendation`: "No issues detected or user has no Stripe account"

4. **Verify in logs**:
   - Check backend logs for: `ℹ️ No Stripe customer found with email`

### Test 2: Payment Flow (Account Lookup Triggered)

**Purpose**: Verify account lookup runs during checkout

1. **Login as test parent**

2. **Add a class to cart**:
   - Navigate to `/classes`
   - Click "Enroll" or "Add to Cart" on any class
   - Go to cart page

3. **Proceed to checkout**:
   - Click "Checkout" button
   - Navigate to `/checkout`

4. **Monitor backend logs** for:
   ```
   🔍 Checking for existing Stripe subscription for: test.parent.new@example.com
   ℹ️ No Stripe customer found with email: test.parent.new@example.com
   💳 Creating payment intent
   ```

5. **Complete test payment**:
   - Use Stripe test card: `4242 4242 4242 4242`
   - Expiry: `12/34`
   - CVC: `123`
   - ZIP: `12345`

6. **Verify payment completes successfully**

### Test 3: Existing Stripe Customer

**Purpose**: Verify sync when Stripe customer exists

1. **Prerequisites**:
   - User must have completed at least one Stripe payment
   - Stripe customer record exists in test mode

2. **Test the lookup endpoint again**:
   ```bash
   curl -X POST http://localhost:5000/api/stripe/test-account-lookup \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
     -d '{"email": "test.parent.new@example.com"}'
   ```

3. **Expected Results**:
   - ✅ `summary.hasStripeCustomer`: `true`
   - ✅ `stripeCustomer.id` is present
   - ✅ `databaseUser.stripeCustomerId` matches Stripe customer ID
   - 📝 If subscription exists: `summary.hasActiveSubscription`: `true`

4. **Verify database update**:
   ```sql
   SELECT id, email, stripe_customer_id 
   FROM users 
   WHERE email = 'test.parent.new@example.com';
   ```
   - ✅ `stripe_customer_id` should be populated

### Test 4: Active Subscription Sync

**Purpose**: Verify membership enrollment creation from Stripe subscription

1. **Prerequisites**:
   - User has an active Stripe subscription
   - User belongs to a school

2. **Create a new checkout** (triggers account lookup):
   - Add any class to cart
   - Proceed to checkout
   - Account lookup runs automatically

3. **Check backend logs** for:
   ```
   ✅ Found Stripe customer: cus_xxx
   ✅ Found active subscription: sub_xxx
   ✅ Updated user.stripeCustomerId to: cus_xxx
   ✅ Created active membership enrollment from Stripe subscription
   ```

4. **Test the lookup endpoint**:
   - Run the test endpoint (same as above)

5. **Expected Results**:
   - ✅ `summary.hasActiveMembership`: `true`
   - ✅ `membershipEnrollments` array contains entry for current year
   - ✅ `membershipEnrollments[0].stripeSubscriptionId` matches subscription ID
   - 📝 `recommendation`: "Everything is in sync! ✅"

6. **Verify in database**:
   ```sql
   SELECT * FROM membership_enrollments 
   WHERE parent_user_id = (
     SELECT id FROM users WHERE email = 'test.parent.new@example.com'
   );
   ```
   - ✅ Membership enrollment record exists
   - ✅ `stripe_subscription_id` is populated
   - ✅ `status` is 'enrolled'

### Test 5: Error Handling

**Purpose**: Verify graceful error handling

1. **Test with invalid email**:
   ```bash
   curl -X POST http://localhost:5000/api/stripe/test-account-lookup \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
     -d '{"email": "nonexistent@example.com"}'
   ```

2. **Expected Results**:
   - ✅ Response still returns success: `true`
   - ❌ `summary.hasDatabaseRecord`: `false`
   - ❌ `summary.hasStripeCustomer`: `false`
   - 📝 Logs show: `ℹ️ No database user found`

3. **Test during checkout with Stripe API error**:
   - Temporarily cause Stripe API issue (network error, invalid credentials)
   - Attempt checkout
   - **Expected**: Checkout should continue despite Stripe lookup failure
   - Check logs for: `⚠️ Error checking Stripe subscription (non-blocking)`

## Debugging Tips

### Check Stripe Dashboard
- Login to [Stripe Dashboard](https://dashboard.stripe.com/)
- Switch to **Test Mode** (toggle in top-left)
- Navigate to **Customers** to verify customer creation
- Navigate to **Subscriptions** to verify subscription status

### Check Backend Logs
Look for these key log messages:
- `🔍 Checking for existing Stripe subscription for: <email>`
- `✅ Found Stripe customer: <customer_id>`
- `✅ Found active subscription: <subscription_id>`
- `✅ Updated user.stripeCustomerId to: <customer_id>`
- `✅ Created active membership enrollment from Stripe subscription`
- `ℹ️ No Stripe customer found with email: <email>`
- `⚠️ Error checking Stripe subscription (non-blocking): <error>`

### Common Issues

**Issue**: Test endpoint returns 401 Unauthorized
- **Solution**: Ensure you're authenticated (logged in) before calling the endpoint
- Get auth token from browser DevTools → Application → Local Storage

**Issue**: `hasStripeCustomer` is always false
- **Solution**: User needs to complete at least one Stripe payment to create customer
- In test mode, use Stripe test card: `4242 4242 4242 4242`

**Issue**: Database updates don't happen
- **Solution**: Check that:
  - User has `schoolId` set in database
  - Stripe customer exists with matching email
  - Account lookup logs show no errors

## Automated E2E Test

To run the automated end-to-end test (requires Stripe test keys setup):

```bash
# Set required environment variable
export VITE_TESTING_STRIPE_PUBLIC_KEY="pk_test_xxx"

# Run the test (to be implemented)
npm run test:e2e -- stripe-account-lookup
```

**Note**: The automated test requires proper Stripe test keys to be configured as environment variables. The manual testing procedure above provides comprehensive coverage without automation.

## Success Criteria

All tests pass if:
- ✅ Test endpoint returns accurate data for all user scenarios
- ✅ Account lookup runs during checkout without blocking payment flow
- ✅ Database updates correctly when Stripe customer is found
- ✅ Membership enrollments are created from active subscriptions
- ✅ Errors are logged but don't break checkout
- ✅ Recommendations provide helpful diagnostics

## Related Files
- `server/api/stripe.ts` - Account lookup implementation (lines 80-150) and test endpoint (lines 698-843)
- `server/config/stripe.ts` - Stripe configuration
- `client/src/config/stripe.ts` - Frontend Stripe configuration
- `server/test-env-loader.ts` - Test key loading logic
