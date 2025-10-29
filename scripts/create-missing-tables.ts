import postgres from 'postgres';

const sql = postgres({
  host: process.env.PGHOST!,
  port: parseInt(process.env.PGPORT || '5432'),
  database: process.env.PGDATABASE!,
  username: process.env.PGUSER!,
  password: process.env.PGPASSWORD!,
  ssl: 'require'
});

async function createMissingTables() {
  console.log('🔧 Creating missing database tables...\n');
  
  try {
    // 1. Children table
    console.log('Creating children table...');
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS children (
        id SERIAL PRIMARY KEY,
        parent_id INTEGER NOT NULL REFERENCES users(id),
        parent_email TEXT,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        birthdate DATE NOT NULL,
        grade_level TEXT NOT NULL,
        gender TEXT,
        school TEXT,
        school_id INTEGER REFERENCES schools(id),
        location_id INTEGER,
        learning_style TEXT,
        special_needs TEXT,
        interests TEXT[],
        allergies TEXT,
        medical_info TEXT,
        profile_image TEXT,
        emergency_contact TEXT,
        additional_languages TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    console.log('✅ children table created');

    // 2. Emergency contacts table
    console.log('Creating emergency_contacts table...');
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS emergency_contacts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        relationship TEXT NOT NULL,
        phone_number TEXT NOT NULL,
        email TEXT,
        is_authorized_pickup BOOLEAN DEFAULT false NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    console.log('✅ emergency_contacts table created');

    // 3. Locations table
    console.log('Creating locations table...');
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS locations (
        id SERIAL PRIMARY KEY,
        school_id INTEGER NOT NULL REFERENCES schools(id),
        name TEXT NOT NULL,
        code TEXT NOT NULL,
        address TEXT NOT NULL,
        city TEXT NOT NULL,
        state TEXT NOT NULL,
        zip_code TEXT NOT NULL,
        phone_number TEXT,
        email TEXT,
        manager_name TEXT,
        capacity INTEGER,
        is_active BOOLEAN DEFAULT true NOT NULL,
        timezone TEXT DEFAULT 'America/New_York' NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    console.log('✅ locations table created');

    // Now add location_id foreign key to children table
    console.log('Adding location_id foreign key to children...');
    await sql.unsafe(`
      ALTER TABLE children 
      ADD CONSTRAINT children_location_id_fkey 
      FOREIGN KEY (location_id) REFERENCES locations(id)
    `).catch(() => console.log('  (foreign key already exists)'));

    // 4. School students table
    console.log('Creating school_students table...');
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS school_students (
        id SERIAL PRIMARY KEY,
        school_id INTEGER NOT NULL REFERENCES schools(id),
        location_id INTEGER REFERENCES locations(id),
        child_id INTEGER NOT NULL REFERENCES children(id),
        enrollment_date TIMESTAMP DEFAULT NOW() NOT NULL,
        grade TEXT NOT NULL,
        status TEXT DEFAULT 'active' NOT NULL,
        student_id TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    console.log('✅ school_students table created');

    // 5. School staff table
    console.log('Creating school_staff table...');
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS school_staff (
        id SERIAL PRIMARY KEY,
        school_id INTEGER NOT NULL REFERENCES schools(id),
        location_id INTEGER REFERENCES locations(id),
        user_id INTEGER NOT NULL REFERENCES users(id),
        role TEXT NOT NULL,
        position TEXT NOT NULL,
        department TEXT,
        start_date TIMESTAMP DEFAULT NOW() NOT NULL,
        end_date TIMESTAMP,
        is_active BOOLEAN DEFAULT true NOT NULL,
        permissions JSONB DEFAULT '{}' NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    console.log('✅ school_staff table created');

    // 6. School classes table
    console.log('Creating school_classes table...');
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS school_classes (
        id SERIAL PRIMARY KEY,
        school_id INTEGER NOT NULL REFERENCES schools(id),
        location_id INTEGER REFERENCES locations(id),
        title TEXT NOT NULL,
        description TEXT,
        subject TEXT NOT NULL,
        grade_level TEXT NOT NULL,
        teacher_id INTEGER REFERENCES users(id),
        academic_year TEXT NOT NULL,
        semester TEXT,
        schedule JSONB NOT NULL,
        location TEXT,
        max_enrollment INTEGER NOT NULL,
        current_enrollment INTEGER DEFAULT 0 NOT NULL,
        curriculum_id INTEGER REFERENCES curricula(id),
        status TEXT DEFAULT 'draft' NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    console.log('✅ school_classes table created');

    // 7. School class enrollments table
    console.log('Creating school_class_enrollments table...');
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS school_class_enrollments (
        id SERIAL PRIMARY KEY,
        class_id INTEGER NOT NULL REFERENCES school_classes(id),
        student_id INTEGER NOT NULL REFERENCES school_students(id),
        enrollment_date TIMESTAMP DEFAULT NOW() NOT NULL,
        grade TEXT,
        status TEXT DEFAULT 'enrolled' NOT NULL,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    console.log('✅ school_class_enrollments table created');

    // 8. User locations table
    console.log('Creating user_locations table...');
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS user_locations (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        location_id INTEGER NOT NULL REFERENCES locations(id),
        access_level TEXT DEFAULT 'view' NOT NULL,
        can_view_reports BOOLEAN DEFAULT false NOT NULL,
        can_manage_staff BOOLEAN DEFAULT false NOT NULL,
        can_manage_classes BOOLEAN DEFAULT false NOT NULL,
        can_manage_students BOOLEAN DEFAULT false NOT NULL,
        can_send_notifications BOOLEAN DEFAULT false NOT NULL,
        is_active BOOLEAN DEFAULT true NOT NULL,
        assigned_at TIMESTAMP DEFAULT NOW() NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    console.log('✅ user_locations table created');

    // 9. Notifications table
    console.log('Creating notifications table...');
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        sender_id INTEGER NOT NULL REFERENCES users(id),
        type TEXT DEFAULT 'both' NOT NULL,
        priority TEXT DEFAULT 'normal' NOT NULL,
        subject TEXT NOT NULL,
        content TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_data JSONB NOT NULL,
        scheduled_for TIMESTAMP,
        sent_at TIMESTAMP,
        status TEXT DEFAULT 'draft' NOT NULL,
        delivery_stats JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    console.log('✅ notifications table created');

    // 10. Notification recipients table
    console.log('Creating notification_recipients table...');
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS notification_recipients (
        id SERIAL PRIMARY KEY,
        notification_id INTEGER NOT NULL REFERENCES notifications(id),
        recipient_id INTEGER NOT NULL REFERENCES users(id),
        delivery_type TEXT NOT NULL,
        status TEXT DEFAULT 'pending' NOT NULL,
        sent_at TIMESTAMP,
        delivered_at TIMESTAMP,
        read_at TIMESTAMP,
        error_message TEXT,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    console.log('✅ notification_recipients table created');

    // 11. Activities table
    console.log('Creating activities table...');
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS activities (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        type TEXT NOT NULL,
        content JSONB NOT NULL,
        url TEXT NOT NULL,
        pdf_url TEXT,
        age_range TEXT NOT NULL,
        subject TEXT NOT NULL,
        author_id INTEGER NOT NULL REFERENCES users(id),
        difficulty TEXT NOT NULL,
        is_public BOOLEAN DEFAULT false,
        download_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ activities table created');

    // 12. Discounts table
    console.log('Creating discounts table...');
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS discounts (
        id SERIAL PRIMARY KEY,
        school_id INTEGER REFERENCES schools(id) NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        code TEXT UNIQUE,
        type TEXT NOT NULL,
        value INTEGER NOT NULL,
        application_method TEXT DEFAULT 'manual' NOT NULL,
        min_order_amount INTEGER,
        max_discount_amount INTEGER,
        applicable_to_classes INTEGER[],
        applicable_to_categories TEXT[],
        applicable_to_grade_levels TEXT[],
        new_students_only BOOLEAN DEFAULT false,
        sibling_discount BOOLEAN DEFAULT false,
        usage_limit INTEGER,
        usage_limit_per_user INTEGER,
        current_usage_count INTEGER DEFAULT 0,
        valid_from TIMESTAMP,
        valid_until TIMESTAMP,
        is_active BOOLEAN DEFAULT true NOT NULL,
        priority INTEGER DEFAULT 0,
        combinable_with_others BOOLEAN DEFAULT false,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    console.log('✅ discounts table created');

    // 13. Discount applications table
    console.log('Creating discount_applications table...');
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS discount_applications (
        id SERIAL PRIMARY KEY,
        discount_id INTEGER REFERENCES discounts(id) NOT NULL,
        parent_email TEXT NOT NULL,
        child_id INTEGER REFERENCES children(id),
        school_enrollment_id INTEGER REFERENCES school_class_enrollments(id),
        program_enrollment_id INTEGER REFERENCES program_enrollments(id),
        payment_id INTEGER REFERENCES payments(id),
        class_id INTEGER REFERENCES classes(id),
        original_amount INTEGER NOT NULL,
        discount_amount INTEGER NOT NULL,
        final_amount INTEGER NOT NULL,
        application_method TEXT NOT NULL,
        applied_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    console.log('✅ discount_applications table created');

    // 14. Daily flow templates table
    console.log('Creating daily_flow_templates table...');
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS daily_flow_templates (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        school_id INTEGER NOT NULL REFERENCES schools(id),
        grade_level TEXT NOT NULL,
        subject TEXT NOT NULL,
        created_by TEXT NOT NULL,
        is_active BOOLEAN DEFAULT true NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    console.log('✅ daily_flow_templates table created');

    // 15. Daily flow entries table
    console.log('Creating daily_flow_entries table...');
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS daily_flow_entries (
        id SERIAL PRIMARY KEY,
        template_id INTEGER REFERENCES daily_flow_templates(id),
        class_id INTEGER NOT NULL REFERENCES classes(id),
        date DATE NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        subject TEXT NOT NULL,
        lesson_title TEXT NOT NULL,
        lesson_description TEXT,
        lesson_link TEXT,
        materials JSONB DEFAULT '[]',
        objectives JSONB DEFAULT '[]',
        is_completed BOOLEAN DEFAULT false NOT NULL,
        completed_by TEXT,
        completed_at TIMESTAMP,
        notes TEXT,
        created_by TEXT NOT NULL,
        last_modified_by TEXT,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    console.log('✅ daily_flow_entries table created');

    // 16. Daily flow schedules table
    console.log('Creating daily_flow_schedules table...');
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS daily_flow_schedules (
        id SERIAL PRIMARY KEY,
        template_id INTEGER NOT NULL REFERENCES daily_flow_templates(id),
        class_id INTEGER NOT NULL REFERENCES classes(id),
        day_of_week INTEGER NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        subject TEXT NOT NULL,
        lesson_title TEXT NOT NULL,
        lesson_description TEXT,
        lesson_link TEXT,
        is_active BOOLEAN DEFAULT true NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    console.log('✅ daily_flow_schedules table created');

    // 17. Marketing links table
    console.log('Creating marketing_links table...');
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS marketing_links (
        id SERIAL PRIMARY KEY,
        school_id INTEGER NOT NULL REFERENCES schools(id),
        campaign_id TEXT NOT NULL UNIQUE,
        campaign_name TEXT NOT NULL,
        link_url TEXT NOT NULL,
        is_active BOOLEAN DEFAULT true NOT NULL,
        click_count INTEGER DEFAULT 0 NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    console.log('✅ marketing_links table created');

    // 18. Link analytics table
    console.log('Creating link_analytics table...');
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS link_analytics (
        id SERIAL PRIMARY KEY,
        link_id INTEGER NOT NULL REFERENCES marketing_links(id),
        event TEXT NOT NULL,
        timestamp TIMESTAMP DEFAULT NOW() NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        referrer TEXT
      )
    `);
    console.log('✅ link_analytics table created');

    // 19. Programs table (legacy)
    console.log('Creating programs table...');
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS programs (
        id SERIAL PRIMARY KEY,
        school_id INTEGER REFERENCES schools(id),
        title TEXT NOT NULL,
        description TEXT,
        category TEXT NOT NULL,
        price INTEGER NOT NULL,
        capacity INTEGER,
        location TEXT,
        instructor_id INTEGER REFERENCES users(id),
        status TEXT DEFAULT 'active' NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    console.log('✅ programs table created');

    // 20. Stripe subscription schedules table
    console.log('Creating stripe_subscription_schedules table...');
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS stripe_subscription_schedules (
        id SERIAL PRIMARY KEY,
        enrollment_id INTEGER NOT NULL REFERENCES program_enrollments(id),
        stripe_schedule_id TEXT NOT NULL UNIQUE,
        stripe_subscription_id TEXT,
        stripe_customer_id TEXT NOT NULL,
        status TEXT NOT NULL,
        phases JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    console.log('✅ stripe_subscription_schedules table created');

    // 21. Role invitations table
    console.log('Creating role_invitations table...');
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS role_invitations (
        id SERIAL PRIMARY KEY,
        school_id INTEGER NOT NULL REFERENCES schools(id),
        email TEXT NOT NULL,
        role TEXT NOT NULL,
        token TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMP NOT NULL,
        used BOOLEAN DEFAULT false NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    console.log('✅ role_invitations table created');

    // 22. Membership enrollments table
    console.log('Creating membership_enrollments table...');
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS membership_enrollments (
        id SERIAL PRIMARY KEY,
        school_id INTEGER NOT NULL REFERENCES schools(id),
        parent_id INTEGER NOT NULL REFERENCES users(id),
        parent_email TEXT NOT NULL,
        status TEXT DEFAULT 'pending_payment' NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        total_amount INTEGER NOT NULL,
        amount_paid INTEGER DEFAULT 0 NOT NULL,
        balance_due INTEGER NOT NULL,
        stripe_customer_id TEXT,
        stripe_subscription_id TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    console.log('✅ membership_enrollments table created');

    console.log('\n✅ All missing tables created successfully!\n');
    
    await sql.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating tables:', error);
    await sql.end();
    process.exit(1);
  }
}

createMissingTables();
