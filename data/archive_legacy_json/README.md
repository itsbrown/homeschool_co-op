# Legacy Financial Data Archive

## Purpose
This directory contains archived JSON files that were previously used for storing enrollment and payment data. These files have been superseded by the Neon PostgreSQL database migration completed in October 2025.

## Archived Files
- **enrollments.json** - Legacy program enrollment records (replaced by `program_enrollments` table)
- **payment-history.json** - Legacy payment records (replaced by `payments` table)
- **scheduled-payments.json** - Legacy scheduled payment records (replaced by `scheduled_payments` table)
- **enrollments_backup_*.json** - Debug/backup files from development

## Database Migration
As of October 2025, all enrollment and financial tracking moved to the Neon PostgreSQL database:

### New Database Tables
1. **program_enrollments** - Stores all program enrollments with payment tracking
2. **payments** - Records all payment transactions (Stripe and manual)
3. **scheduled_payments** - Tracks payment plans and installments
4. **refunds** - Records refund transactions

### Benefits
- ACID transaction support
- Real-time data consistency
- Proper foreign key relationships
- Production-ready data integrity
- Better performance and scalability

## Important Notes
- **DO NOT USE** these archived JSON files for any production operations
- All financial data going forward is stored in the database
- Dashboard metrics now read exclusively from database tables
- Stripe webhook handlers persist directly to database

## Data Migration Status
Per user request, financial tracking started fresh with the database migration. No data was migrated from these JSON files to the database. Historical data remains in these archive files for reference only.

## Date Archived
October 21, 2025
