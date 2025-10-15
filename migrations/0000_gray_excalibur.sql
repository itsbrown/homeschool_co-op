CREATE TABLE "activities" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"type" text NOT NULL,
	"content" jsonb NOT NULL,
	"url" text NOT NULL,
	"pdf_url" text,
	"age_range" text NOT NULL,
	"subject" text NOT NULL,
	"author_id" integer NOT NULL,
	"difficulty" text NOT NULL,
	"is_public" boolean DEFAULT false,
	"download_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "children" (
	"id" serial PRIMARY KEY NOT NULL,
	"parent_id" integer NOT NULL,
	"parent_email" text,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"birthdate" date NOT NULL,
	"grade_level" text NOT NULL,
	"gender" text,
	"school" text,
	"school_id" integer,
	"location_id" integer,
	"learning_style" text,
	"special_needs" text,
	"interests" text[],
	"allergies" text,
	"medical_info" text,
	"profile_image" text,
	"emergency_contact" text,
	"additional_languages" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "classes" (
	"id" serial PRIMARY KEY NOT NULL,
	"school_id" integer,
	"location_id" integer,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"product_id" text,
	"product_type" text,
	"category_name" text,
	"category" text NOT NULL,
	"start_date" date,
	"end_date" date,
	"num_sessions" integer,
	"session_days" text,
	"duration_weeks" integer,
	"sessions_per_week" integer,
	"session_length_minutes" integer,
	"start_time" text,
	"end_time" text,
	"schedule" jsonb,
	"status" text DEFAULT 'upcoming' NOT NULL,
	"grade_levels" text[],
	"capacity" integer,
	"location" text,
	"instructor_name" text,
	"instructor_id" integer,
	"price" integer NOT NULL,
	"suggested_price" integer,
	"total_orders" integer DEFAULT 0,
	"paid_orders" integer DEFAULT 0,
	"total_waitlisted" integer DEFAULT 0,
	"total_order_value" integer DEFAULT 0,
	"total_discounted" integer DEFAULT 0,
	"total_collected" integer DEFAULT 0,
	"is_published" boolean DEFAULT false NOT NULL,
	"is_admin_only" boolean DEFAULT false NOT NULL,
	"enrollment_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "curricula" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"subject" text NOT NULL,
	"grade_level" text NOT NULL,
	"author_id" integer NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"price" integer DEFAULT 0 NOT NULL,
	"learning_styles" text[] NOT NULL,
	"content" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_flow_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"template_id" integer,
	"class_id" integer NOT NULL,
	"date" date NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"subject" text NOT NULL,
	"lesson_title" text NOT NULL,
	"lesson_description" text,
	"lesson_link" text,
	"materials" jsonb DEFAULT '[]'::jsonb,
	"objectives" jsonb DEFAULT '[]'::jsonb,
	"is_completed" boolean DEFAULT false NOT NULL,
	"completed_by" text,
	"completed_at" timestamp,
	"notes" text,
	"created_by" text NOT NULL,
	"last_modified_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_flow_schedules" (
	"id" serial PRIMARY KEY NOT NULL,
	"template_id" integer NOT NULL,
	"class_id" integer NOT NULL,
	"day_of_week" integer NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"subject" text NOT NULL,
	"lesson_title" text NOT NULL,
	"lesson_description" text,
	"lesson_link" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_flow_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"school_id" integer NOT NULL,
	"grade_level" text NOT NULL,
	"subject" text NOT NULL,
	"created_by" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discount_applications" (
	"id" serial PRIMARY KEY NOT NULL,
	"discount_id" integer NOT NULL,
	"parent_email" text NOT NULL,
	"child_id" integer,
	"school_enrollment_id" integer,
	"program_enrollment_id" integer,
	"payment_id" integer,
	"class_id" integer,
	"original_amount" integer NOT NULL,
	"discount_amount" integer NOT NULL,
	"final_amount" integer NOT NULL,
	"application_method" text NOT NULL,
	"applied_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"school_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"code" text,
	"type" text NOT NULL,
	"value" integer NOT NULL,
	"application_method" text DEFAULT 'manual' NOT NULL,
	"min_order_amount" integer,
	"max_discount_amount" integer,
	"applicable_to_classes" integer[],
	"applicable_to_categories" text[],
	"applicable_to_grade_levels" text[],
	"new_students_only" boolean DEFAULT false,
	"sibling_discount" boolean DEFAULT false,
	"usage_limit" integer,
	"usage_limit_per_user" integer,
	"current_usage_count" integer DEFAULT 0,
	"valid_from" timestamp,
	"valid_until" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 0,
	"combinable_with_others" boolean DEFAULT false,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "discounts_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "emergency_contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"relationship" text NOT NULL,
	"phone_number" text NOT NULL,
	"email" text,
	"is_authorized_pickup" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp NOT NULL,
	"location" text,
	"organizer_id" integer NOT NULL,
	"event_type" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_bases" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"subject" text NOT NULL,
	"difficulty" text NOT NULL,
	"author_id" integer NOT NULL,
	"price" integer DEFAULT 0 NOT NULL,
	"files" jsonb NOT NULL,
	"metadata" jsonb NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"download_count" integer DEFAULT 0 NOT NULL,
	"purchased_by" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ai_processed" boolean DEFAULT false NOT NULL,
	"ai_insights" jsonb,
	"processed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lessons" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"subject" text NOT NULL,
	"grade_level" text NOT NULL,
	"author_id" integer NOT NULL,
	"curriculum_id" integer,
	"is_published" boolean DEFAULT false NOT NULL,
	"duration" integer NOT NULL,
	"content" jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "link_analytics" (
	"id" serial PRIMARY KEY NOT NULL,
	"link_id" integer NOT NULL,
	"event" text NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"referrer" text
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" serial PRIMARY KEY NOT NULL,
	"school_id" integer NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"address" text NOT NULL,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"zip_code" text NOT NULL,
	"phone_number" text,
	"email" text,
	"manager_name" text,
	"capacity" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"timezone" text DEFAULT 'America/New_York' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketing_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"school_id" integer NOT NULL,
	"campaign_id" text NOT NULL,
	"campaign_name" text NOT NULL,
	"link_url" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"click_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "marketing_links_campaign_id_unique" UNIQUE("campaign_id")
);
--> statement-breakpoint
CREATE TABLE "marketplace_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"price" integer NOT NULL,
	"seller_id" integer NOT NULL,
	"item_type" text NOT NULL,
	"content_id" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sales" integer DEFAULT 0 NOT NULL,
	"revenue" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "membership_enrollments" (
	"id" serial PRIMARY KEY NOT NULL,
	"school_id" integer NOT NULL,
	"parent_user_id" integer NOT NULL,
	"membership_year" integer NOT NULL,
	"amount" integer NOT NULL,
	"amount_paid" integer DEFAULT 0 NOT NULL,
	"remaining_balance" integer NOT NULL,
	"status" text DEFAULT 'pending_payment' NOT NULL,
	"due_date" timestamp NOT NULL,
	"expiration_date" timestamp NOT NULL,
	"grace_period_end" timestamp,
	"payment_method" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_recipients" (
	"id" serial PRIMARY KEY NOT NULL,
	"notification_id" integer NOT NULL,
	"recipient_id" integer NOT NULL,
	"delivery_type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"sent_at" timestamp,
	"delivered_at" timestamp,
	"read_at" timestamp,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"sender_id" integer NOT NULL,
	"type" text DEFAULT 'both' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"subject" text NOT NULL,
	"content" text NOT NULL,
	"target_type" text NOT NULL,
	"target_data" jsonb NOT NULL,
	"scheduled_for" timestamp,
	"sent_at" timestamp,
	"status" text DEFAULT 'draft' NOT NULL,
	"delivery_stats" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"stripe_payment_intent_id" text NOT NULL,
	"parent_email" text NOT NULL,
	"child_name" text NOT NULL,
	"class_name" text NOT NULL,
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "program_enrollments" (
	"id" serial PRIMARY KEY NOT NULL,
	"program_id" integer NOT NULL,
	"child_id" integer NOT NULL,
	"enrollment_date" timestamp DEFAULT now() NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payment_status" text DEFAULT 'pending' NOT NULL,
	"payment_method" text,
	"transaction_id" text,
	"discount_code" text,
	"discount_amount" integer,
	"total_paid" integer,
	"total_cost" integer,
	"remaining_balance" integer,
	"stripe_subscription_schedule_id" text,
	"stripe_customer_id" text,
	"migration_date" timestamp,
	"payment_system_version" text DEFAULT 'v1_manual',
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "programs" (
	"id" serial PRIMARY KEY NOT NULL,
	"school_id" integer,
	"location_id" integer,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"category" text NOT NULL,
	"age_range" text NOT NULL,
	"grade_levels" text[] NOT NULL,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp NOT NULL,
	"schedule_type" text NOT NULL,
	"schedule_details" jsonb NOT NULL,
	"location_name" text,
	"location_address" text,
	"is_virtual" boolean DEFAULT false NOT NULL,
	"meeting_url" text,
	"capacity" integer NOT NULL,
	"price" integer NOT NULL,
	"instructor_id" integer NOT NULL,
	"curriculum_id" integer,
	"cover_image" text,
	"materials" jsonb,
	"is_published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_invitations" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"invited_by" integer NOT NULL,
	"school_id" integer,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "role_invitations_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "scheduled_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"parent_email" text NOT NULL,
	"enrollment_ids" integer[] NOT NULL,
	"payment_plan" text NOT NULL,
	"installment_number" integer NOT NULL,
	"total_installments" integer NOT NULL,
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"due_date" timestamp NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"original_payment_id" integer,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "school_class_enrollments" (
	"id" serial PRIMARY KEY NOT NULL,
	"class_id" integer NOT NULL,
	"student_id" integer NOT NULL,
	"enrollment_date" timestamp DEFAULT now() NOT NULL,
	"grade" text,
	"status" text DEFAULT 'enrolled' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "school_classes" (
	"id" serial PRIMARY KEY NOT NULL,
	"school_id" integer NOT NULL,
	"location_id" integer,
	"title" text NOT NULL,
	"description" text,
	"subject" text NOT NULL,
	"grade_level" text NOT NULL,
	"teacher_id" integer,
	"academic_year" text NOT NULL,
	"semester" text,
	"schedule" jsonb NOT NULL,
	"location" text,
	"max_enrollment" integer NOT NULL,
	"current_enrollment" integer DEFAULT 0 NOT NULL,
	"curriculum_id" integer,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "school_staff" (
	"id" serial PRIMARY KEY NOT NULL,
	"school_id" integer NOT NULL,
	"location_id" integer,
	"user_id" integer NOT NULL,
	"role" text NOT NULL,
	"position" text NOT NULL,
	"department" text,
	"start_date" timestamp DEFAULT now() NOT NULL,
	"end_date" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"permissions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "school_students" (
	"id" serial PRIMARY KEY NOT NULL,
	"school_id" integer NOT NULL,
	"location_id" integer,
	"child_id" integer NOT NULL,
	"enrollment_date" timestamp DEFAULT now() NOT NULL,
	"grade" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"student_id" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schools" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"admin_id" integer NOT NULL,
	"address" text,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"zip_code" text NOT NULL,
	"phone_number" text,
	"email" text NOT NULL,
	"website" text,
	"logo" text,
	"description" text,
	"founded_year" integer,
	"accreditation" text,
	"enrollment_size" integer,
	"is_verified" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"registration_code" text,
	"membership_fee_amount" integer DEFAULT 0,
	"membership_renewal_month" integer DEFAULT 9,
	"membership_renewal_day" integer DEFAULT 1,
	"membership_grace_period_days" integer DEFAULT 30,
	"membership_description" text,
	"membership_required" boolean DEFAULT true,
	CONSTRAINT "schools_registration_code_unique" UNIQUE("registration_code")
);
--> statement-breakpoint
CREATE TABLE "stripe_subscription_schedules" (
	"id" serial PRIMARY KEY NOT NULL,
	"stripe_schedule_id" text NOT NULL,
	"parent_email" text NOT NULL,
	"enrollment_ids" jsonb NOT NULL,
	"total_amount" integer NOT NULL,
	"payment_plan" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"current_phase" integer DEFAULT 1 NOT NULL,
	"total_phases" integer NOT NULL,
	"next_payment_date" timestamp,
	"last_payment_date" timestamp,
	"completed_date" timestamp,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "stripe_subscription_schedules_stripe_schedule_id_unique" UNIQUE("stripe_schedule_id")
);
--> statement-breakpoint
CREATE TABLE "user_locations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"location_id" integer NOT NULL,
	"access_level" text DEFAULT 'view' NOT NULL,
	"can_view_reports" boolean DEFAULT false NOT NULL,
	"can_manage_staff" boolean DEFAULT false NOT NULL,
	"can_manage_classes" boolean DEFAULT false NOT NULL,
	"can_manage_students" boolean DEFAULT false NOT NULL,
	"can_send_notifications" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"assigned_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"auth0_id" varchar(255),
	"supabase_id" text,
	"username" text NOT NULL,
	"email" text NOT NULL,
	"password" text NOT NULL,
	"role" "role" DEFAULT 'student' NOT NULL,
	"name" text NOT NULL,
	"avatar" text,
	"subscription" text DEFAULT 'free' NOT NULL,
	"permissions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"school_id" integer,
	"phone" text,
	"emergency_contact_first_name" text,
	"emergency_contact_last_name" text,
	"emergency_contact_phone" text,
	"emergency_contact_relationship" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_auth0_id_unique" UNIQUE("auth0_id"),
	CONSTRAINT "users_supabase_id_unique" UNIQUE("supabase_id"),
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "children" ADD CONSTRAINT "children_parent_id_users_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "children" ADD CONSTRAINT "children_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "children" ADD CONSTRAINT "children_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_instructor_id_users_id_fk" FOREIGN KEY ("instructor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curricula" ADD CONSTRAINT "curricula_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_flow_entries" ADD CONSTRAINT "daily_flow_entries_template_id_daily_flow_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."daily_flow_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_flow_entries" ADD CONSTRAINT "daily_flow_entries_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_flow_schedules" ADD CONSTRAINT "daily_flow_schedules_template_id_daily_flow_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."daily_flow_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_flow_schedules" ADD CONSTRAINT "daily_flow_schedules_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_flow_templates" ADD CONSTRAINT "daily_flow_templates_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_applications" ADD CONSTRAINT "discount_applications_discount_id_discounts_id_fk" FOREIGN KEY ("discount_id") REFERENCES "public"."discounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_applications" ADD CONSTRAINT "discount_applications_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_applications" ADD CONSTRAINT "discount_applications_school_enrollment_id_school_class_enrollments_id_fk" FOREIGN KEY ("school_enrollment_id") REFERENCES "public"."school_class_enrollments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_applications" ADD CONSTRAINT "discount_applications_program_enrollment_id_program_enrollments_id_fk" FOREIGN KEY ("program_enrollment_id") REFERENCES "public"."program_enrollments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_applications" ADD CONSTRAINT "discount_applications_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_applications" ADD CONSTRAINT "discount_applications_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_applications" ADD CONSTRAINT "discount_applications_applied_by_users_id_fk" FOREIGN KEY ("applied_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emergency_contacts" ADD CONSTRAINT "emergency_contacts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_organizer_id_users_id_fk" FOREIGN KEY ("organizer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_bases" ADD CONSTRAINT "knowledge_bases_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_curriculum_id_curricula_id_fk" FOREIGN KEY ("curriculum_id") REFERENCES "public"."curricula"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link_analytics" ADD CONSTRAINT "link_analytics_link_id_marketing_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."marketing_links"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_links" ADD CONSTRAINT "marketing_links_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_items" ADD CONSTRAINT "marketplace_items_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_enrollments" ADD CONSTRAINT "membership_enrollments_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_enrollments" ADD CONSTRAINT "membership_enrollments_parent_user_id_users_id_fk" FOREIGN KEY ("parent_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_recipients" ADD CONSTRAINT "notification_recipients_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_recipients" ADD CONSTRAINT "notification_recipients_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_enrollments" ADD CONSTRAINT "program_enrollments_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_enrollments" ADD CONSTRAINT "program_enrollments_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_instructor_id_users_id_fk" FOREIGN KEY ("instructor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_curriculum_id_curricula_id_fk" FOREIGN KEY ("curriculum_id") REFERENCES "public"."curricula"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_invitations" ADD CONSTRAINT "role_invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_invitations" ADD CONSTRAINT "role_invitations_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_payments" ADD CONSTRAINT "scheduled_payments_original_payment_id_payments_id_fk" FOREIGN KEY ("original_payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_class_enrollments" ADD CONSTRAINT "school_class_enrollments_class_id_school_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."school_classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_class_enrollments" ADD CONSTRAINT "school_class_enrollments_student_id_school_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."school_students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_classes" ADD CONSTRAINT "school_classes_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_classes" ADD CONSTRAINT "school_classes_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_classes" ADD CONSTRAINT "school_classes_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_classes" ADD CONSTRAINT "school_classes_curriculum_id_curricula_id_fk" FOREIGN KEY ("curriculum_id") REFERENCES "public"."curricula"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_staff" ADD CONSTRAINT "school_staff_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_staff" ADD CONSTRAINT "school_staff_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_staff" ADD CONSTRAINT "school_staff_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_students" ADD CONSTRAINT "school_students_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_students" ADD CONSTRAINT "school_students_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_students" ADD CONSTRAINT "school_students_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_locations" ADD CONSTRAINT "user_locations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_locations" ADD CONSTRAINT "user_locations_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;