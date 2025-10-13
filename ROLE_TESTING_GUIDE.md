# ASA Platform - Role Testing Guide

## Overview
This document provides comprehensive testing instructions for each user role, with special focus on financial displays and notification system functionality.

---

## 🔐 Test Accounts & Credentials

### 1. PARENT ROLE
- **Email:** kpdinvestors@gmail.com
- **Password:** [User's current password]
- **Features to Test:**
  - Children management
  - Enrollments viewing
  - Payment processing
  - Notifications (in-app, email)

### 2. EDUCATOR ROLE  
- **Email:** jocimarie@gmail.com
- **Password:** Test123!
- **Assigned Classes:** 4 classes (Macaroni, Tycoons, Pioneers, Patriots)
- **Features to Test:**
  - View assigned classes
  - Student rosters
  - Notifications

### 3. SCHOOL ADMIN ROLE
- **Email:** coreycreates@gmail.com
- **Auth:** Supabase authentication
- **Features to Test:**
  - Class management
  - Staff management  
  - Payment tracking
  - Notification system (all types)

### 4. SUPER ADMIN ROLE
- **Email:** corey@americanseekersacademy.com
- **Auth:** Supabase authentication
- **Features to Test:**
  - All schools management
  - System-wide features
  - All financial operations

---

## 💰 Currency Display Checklist

### Critical: All Prices Must Be Consistent
**Rule:** All prices stored in cents (integer) must be displayed as dollars with .toFixed(2)

### Files to Verify:
1. **Cart & Checkout**
   - `CartContext.tsx` - Cart total calculations
   - `CartDrawer.tsx` - Item prices in cart
   - `CartCheckout.tsx` - Final checkout amount
   
2. **Payment Pages**
   - `ManualPaymentEntryPage.tsx` - Manual payment amounts
   - `PaymentHistoryPage.tsx` - Historical payment displays
   - `PaymentsPage.tsx` - Payment summaries
   - `BillingPage.tsx` - Billing amounts
   
3. **Class/Program Pages**
   - `ProgramsParentPage.tsx` - Program prices
   - `ClassesPage.tsx` - Class prices
   - `SchoolClassDetailsPage.tsx` - Detailed pricing
   
4. **Admin Pages**
   - `ClassCreationForm.tsx` - Price input/display
   - `ClassVariants.tsx` - Variant pricing
   - `DiscountsPage.tsx` - Discount amounts

### Verification Steps:
```
✅ Check that all prices show as: $XX.XX (two decimal places)
✅ Verify no prices show as: $XXXX (raw cents)
✅ Confirm calculations are accurate (subtotal, tax, total)
✅ Test payment plan breakdowns show correct amounts
```

---

## 📬 Notification System Testing

### Notification Delivery Methods
- **In-App:** Always available for all roles
- **Email:** Via Brevo (configured)
- **SMS:** Via Twilio (setup complete, needs configuration)

### Test Matrix by Role

#### PARENT NOTIFICATIONS
**Test Scenarios:**
1. Receive class enrollment confirmation
2. Receive payment reminder
3. Receive announcement from school admin
4. Check notification preferences

**Expected Behavior:**
- In-app notifications appear in bell icon
- Email notifications sent to parent email
- SMS (if phone number provided and enabled)

#### EDUCATOR NOTIFICATIONS  
**Test Scenarios:**
1. Send notification to parents of assigned classes
2. Receive system announcements
3. View notification history

**Expected Behavior:**
- Can send to all parents or specific classes
- Cannot send SMS (educator limitation)
- Receives school-wide notifications

#### SCHOOL ADMIN NOTIFICATIONS
**Test Scenarios:**
1. Send individual notifications
2. Send role-based notifications (all parents, all educators)
3. Send location-based notifications
4. Send broadcast (all users)
5. View delivery statistics

**Expected Behavior:**
- Full notification system access
- All delivery methods available
- Can track delivery stats
- SMS option (if Twilio configured)

#### SUPER ADMIN NOTIFICATIONS
**Test Scenarios:**
1. All school admin scenarios
2. System-wide broadcasts
3. Cross-school notifications

**Expected Behavior:**
- Highest level access
- All notification capabilities
- Access to all delivery stats

### Notification Preferences (Per User)
**Location:** Settings > Notifications

**Options:**
- ✅ Email notifications
- ✅ In-app notifications  
- ✅ SMS notifications (if phone provided)
- ✅ Notification frequency settings

---

## 🧪 Test Procedures by Role

### PARENT ROLE TEST
```
1. LOGIN
   ✓ Log in with parent credentials
   ✓ Verify dashboard loads correctly

2. CHILDREN TAB
   ✓ View children list
   ✓ Verify enrollments show for each child
   ✓ Check enrollment status badges
   ✓ Click "View Profile" - verify navigation

3. ENROLLMENTS TAB
   ✓ View all enrollments
   ✓ Verify class names display correctly
   ✓ Check enrollment dates format properly
   ✓ Verify status badges (enrolled, pending, etc.)

4. FINANCIAL CHECKS
   ✓ View cart - verify prices show as $XX.XX
   ✓ Check payment history - all amounts $XX.XX format
   ✓ View billing - pending amounts correct
   ✓ Test payment plan - breakdown shows correctly

5. NOTIFICATIONS
   ✓ Click bell icon - view notifications
   ✓ Check notification count badge
   ✓ Mark as read functionality
   ✓ Verify email notifications received
```

### EDUCATOR ROLE TEST
```
1. LOGIN
   ✓ Log in with educator credentials
   ✓ Verify educator dashboard loads

2. MY CLASSES
   ✓ View 4 assigned classes
   ✓ Verify class details (schedule, location, etc.)
   ✓ Check enrollment counts
   ✓ Click "View" on each class

3. CLASS DETAILS
   ✓ View student roster for each class
   ✓ Verify student information displays
   ✓ Check parent contact info shows
   ✓ Enrollment dates properly formatted

4. STUDENTS TAB
   ✓ View all students across classes
   ✓ Verify student details
   ✓ Check class associations

5. NOTIFICATIONS
   ✓ Access educator notifications page
   ✓ Send test notification to parents
   ✓ View notification history
   ✓ Verify delivery confirmation
```

### SCHOOL ADMIN ROLE TEST
```
1. LOGIN
   ✓ Log in with school admin credentials
   ✓ Verify school admin dashboard

2. CLASS MANAGEMENT
   ✓ View all classes
   ✓ Create new class - verify price entry
   ✓ Edit existing class - check price display
   ✓ Manage class variants

3. STAFF MANAGEMENT
   ✓ View staff list
   ✓ Assign classes to educators
   ✓ Send staff invitations
   ✓ Edit staff information

4. STUDENT MANAGEMENT
   ✓ View all students
   ✓ Check enrollment statuses
   ✓ View student profiles
   ✓ Verify parent information

5. PAYMENT MANAGEMENT
   ✓ Manual payment entry - test amount formatting
   ✓ View payment history - all amounts $XX.XX
   ✓ Check payment plans
   ✓ Verify refund amounts display correctly

6. NOTIFICATIONS (CRITICAL)
   ✓ Send individual notification
   ✓ Send to all parents (role-based)
   ✓ Send to all educators
   ✓ Send location-based notification
   ✓ Broadcast to all users
   ✓ View delivery statistics
   ✓ Check SMS option (if Twilio configured)

7. FINANCIAL REPORTS
   ✓ View revenue summaries
   ✓ Check all currency displays
   ✓ Verify calculation accuracy
```

### SUPER ADMIN ROLE TEST
```
1. LOGIN
   ✓ Log in with super admin credentials
   ✓ Verify super admin dashboard

2. ALL SCHOOLS
   ✓ View all schools
   ✓ Access individual school data
   ✓ System-wide statistics

3. APPLICATIONS
   ✓ View school applications
   ✓ Approve/reject applications
   ✓ Manage application workflow

4. SYSTEM-WIDE FEATURES
   ✓ All school admin capabilities
   ✓ Cross-school notifications
   ✓ Platform-wide settings
   ✓ Global financial reports

5. NOTIFICATIONS
   ✓ System-wide broadcasts
   ✓ Multi-school notifications
   ✓ All delivery methods
   ✓ Comprehensive delivery stats
```

---

## 🐛 Known Issues & Fixes Applied

### ✅ FIXED: Currency Display
- Manual payment entry now correctly formats cents to dollars
- All payment displays use consistent .toFixed(2) formatting
- Cart calculations properly convert cents to dollars

### ✅ FIXED: Parent Dashboard
- Children tab now shows enrollments for each child
- Enrollment badges display with correct status colors
- Navigation to child profiles working correctly

### ✅ FIXED: Educator Dashboard
- Type errors resolved
- Class assignment system working
- Student roster access functioning

### ✅ FIXED: View Profile Navigation
- All "View Profile" buttons now properly navigate
- Profile pages load with correct student data

---

## 🔧 SMS Notification Setup (Twilio)

### Current Status
- ✅ Twilio connection established
- ✅ SMS service module created
- ⏳ Awaiting phone number configuration

### To Enable SMS:
1. Configure Twilio phone number in Replit connection settings
2. Add phone numbers to user profiles (parents, staff)
3. Update notification preferences to include SMS option
4. Test SMS delivery with test notification

### SMS Testing Checklist:
```
1. Verify Twilio connection configured
2. Add test phone number to parent account
3. Send test notification with SMS enabled
4. Confirm SMS delivery
5. Check delivery stats in notification system
```

---

## 📊 Success Criteria

### Currency Display ✅
- [ ] All prices show in $XX.XX format
- [ ] No raw cent values displayed
- [ ] Calculations are accurate
- [ ] Payment plans show correct breakdowns

### Notifications ✅
- [ ] In-app notifications work for all roles
- [ ] Email delivery functioning
- [ ] SMS ready (pending configuration)
- [ ] Delivery stats tracking correctly
- [ ] Role-based permissions enforced

### Navigation ✅
- [ ] All links navigate correctly
- [ ] Profile pages load properly
- [ ] Dashboards show role-appropriate content
- [ ] Back buttons work consistently

### Data Integrity ✅
- [ ] Student enrollments display correctly
- [ ] Payment history accurate
- [ ] Class rosters show current data
- [ ] User information up to date

---

## 🚨 Critical Test Points

### Before User Testing:
1. **Currency Audit:** Verify all 35+ files display prices correctly
2. **Notification Test:** Send test notification as each role
3. **Navigation Check:** Click through all major workflows
4. **Data Validation:** Confirm all displays match database values

### During User Testing:
1. Monitor application logs for errors
2. Track notification delivery rates
3. Verify payment processing accuracy
4. Collect user feedback on UX

### Post-Testing:
1. Review delivery statistics
2. Analyze any failed notifications
3. Check for currency display issues
4. Document any new bugs found

---

## 📝 Testing Notes

- Use Chrome DevTools to monitor console errors
- Check Network tab for failed API requests
- Verify localStorage for cart persistence
- Monitor notification badge counts
- Test on different screen sizes (mobile, tablet, desktop)

---

## 🆘 Support & Troubleshooting

### Common Issues:
1. **Notifications not appearing:** Check bell icon, refresh page
2. **Price shows as cents:** Report file location for fix
3. **SMS not working:** Verify Twilio configuration
4. **Navigation broken:** Clear cache and retry

### Debug Commands:
```javascript
// Check cart state
console.log(localStorage.getItem('cart'))

// Check notifications
console.log(localStorage.getItem('notifications'))

// Check user session
console.log(localStorage.getItem('supabase_token'))
```

---

**Last Updated:** October 12, 2025
**Version:** 1.0
**Testing Team:** ASA Platform QA
