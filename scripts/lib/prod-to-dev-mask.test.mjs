import assert from "node:assert/strict";
import test from "node:test";
import {
  COPY_TABLES,
  DROPPED_COLUMNS,
  MASKED_PASSWORD,
  SOURCE_STARTUP_OPTIONS,
  ageBandFromBirthdate,
  anchorBirthdate,
  assertConnectedEndpoints,
  assertSafeMaskTarget,
  assertSourceReadOnlySetting,
  assertSqlIsSelect,
  planCopy,
  selectAllSql,
  truncateSql,
  MaskRefused,
} from "./prod-to-dev-mask.mjs";

const SOURCE = "postgresql://reader:secret@prod-db.internal:5432/asa";
const TARGET = "postgresql://dev:secret@127.0.0.1:5432/asa_dev";
const NOW = new Date("2026-10-09T15:00:00Z");

function refused(fn) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof MaskRefused);
    return true;
  });
}

test("startup option forces the source session read-only", () => {
  assert.match(SOURCE_STARTUP_OPTIONS, /default_transaction_read_only=on/);
});

test("refuses when the target URL equals the source", () => {
  refused(() => assertSafeMaskTarget({ sourceUrl: SOURCE, targetUrl: SOURCE, nodeEnv: "development" }));
});

test("refuses when only the password differs", () => {
  const sameDb = "postgresql://reader:other-secret@prod-db.internal:5432/asa";
  refused(() => assertSafeMaskTarget({ sourceUrl: SOURCE, targetUrl: sameDb, nodeEnv: "development" }));
});

test("refuses a target whose database or host looks like production", () => {
  refused(() =>
    assertSafeMaskTarget({
      sourceUrl: SOURCE,
      targetUrl: "postgresql://dev:secret@127.0.0.1:5432/asa_production",
      nodeEnv: "development",
    }),
  );
  refused(() =>
    assertSafeMaskTarget({
      sourceUrl: SOURCE,
      targetUrl: "postgresql://dev:secret@db-prod.example:5432/asa_dev",
      nodeEnv: "development",
    }),
  );
});

test("refuses the same host unless the target database name is explicitly dev", () => {
  refused(() =>
    assertSafeMaskTarget({
      sourceUrl: SOURCE,
      targetUrl: "postgresql://reader:secret@prod-db.internal:5432/postgres",
      nodeEnv: "development",
    }),
  );
  refused(() =>
    assertSafeMaskTarget({
      sourceUrl: SOURCE,
      targetUrl: "postgresql://reader:secret@prod-db.internal:5432/asa_mask",
      nodeEnv: "development",
    }),
  );
  const verdict = assertSafeMaskTarget({
    sourceUrl: "postgresql://reader:secret@db.internal:5432/asa",
    targetUrl: "postgresql://reader:secret@db.internal:5432/asa_mask",
    nodeEnv: "development",
  });
  assert.equal(verdict.target.database, "asa_mask");
});

test("refuses NODE_ENV=production even for a local target", () => {
  refused(() => assertSafeMaskTarget({ sourceUrl: SOURCE, targetUrl: TARGET, nodeEnv: "production" }));
});

test("accepts a local dev target that is not the source", () => {
  const verdict = assertSafeMaskTarget({ sourceUrl: SOURCE, targetUrl: TARGET, nodeEnv: "development" });
  assert.equal(verdict.source.database, "asa");
  assert.equal(verdict.target.host, "127.0.0.1");
});

test("connected database names must match the checked URLs", () => {
  const verdict = assertSafeMaskTarget({ sourceUrl: SOURCE, targetUrl: TARGET, nodeEnv: "development" });
  assertConnectedEndpoints({ sourceDatabase: "asa", targetDatabase: "asa_dev", verdict });
  refused(() =>
    assertConnectedEndpoints({ sourceDatabase: "asa", targetDatabase: "asa", verdict }),
  );
});

test("source helper only builds SELECT statements", () => {
  assert.equal(selectAllSql("children"), "select * from children");
  refused(() => assertSqlIsSelect("insert into children values (1)"));
  refused(() => assertSqlIsSelect("select 1; delete from users"));
  assert.throws(() => selectAllSql("users; drop table users"), MaskRefused);
});

test("read-only setting must be on", () => {
  assertSourceReadOnlySetting("on");
  refused(() => assertSourceReadOnlySetting("off"));
});

test("truncate statement is limited to the copy allowlist", () => {
  const sql = truncateSql();
  assert.match(sql, /^truncate table /);
  assert.match(sql, /restart identity cascade/);
  for (const table of COPY_TABLES) assert.match(sql, new RegExp(`\\b${table}\\b`));
  refused(() => truncateSql(["users", "payments"]));
});

test("masks parent contact data and drops auth and stripe columns", () => {
  const plan = planCopy(
    {
      users: [
        {
          id: 7,
          email: "real.parent@example.com",
          username: "realparent",
          password: "hashed-secret",
          name: "Real Parent",
          first_name: "Real",
          last_name: "Parent",
          phone: "585-555-1212",
          role: "parent",
          school_id: 2,
          auth0_id: "auth0|abc",
          supabase_id: "uuid-real",
          stripe_customer_id: "cus_live",
          stripe_default_payment_method_id: "pm_live",
          calendar_feed_token: "feed-secret",
          active_role_id: 3,
          auto_pay_enabled: true,
        },
      ],
    },
    NOW,
  );
  const user = plan.tables.find((entry) => entry.table === "users").rows[0];
  assert.equal(user.password, MASKED_PASSWORD);
  assert.equal(user.email, "user-7@masked.invalid");
  assert.notEqual(user.first_name, "Real");
  assert.equal(user.phone.startsWith("555-010-"), true);
  assert.equal(user.auto_pay_enabled, false);
  assert.equal(user.active_role_id, null);
  assert.equal(user.school_id, 2);
  for (const column of DROPPED_COLUMNS.users) {
    assert.equal(Object.hasOwn(user, column), false);
  }
  assert.deepEqual(plan.activeRoleUpdates, [{ id: 7, active_role_id: 3 }]);
  const blob = JSON.stringify(user);
  assert.equal(blob.includes("real.parent@example.com"), false);
  assert.equal(blob.includes("cus_live"), false);
  assert.equal(blob.includes("auth0|abc"), false);
});

test("children keep a fake first name and an age band, not the real birthday", () => {
  const plan = planCopy(
    {
      users: [{ id: 7, role: "parent", email: "real.parent@example.com" }],
      children: [
        {
          id: 11,
          parent_id: 7,
          first_name: "Sam",
          last_name: "Parent",
          birthdate: "2014-06-02",
          grade_level: "6th Grade",
          allergies: "peanuts",
          medical_info: "inhaler",
          special_needs: "quiet room",
          gender: "female",
          current_lexile_range: "600-700",
          school_id: 2,
          location_id: 4,
        },
      ],
      school_students: [{ id: 5, school_id: 2, child_id: 11, grade: "6th Grade", student_id: "ASA-11" }],
    },
    NOW,
  );
  const child = plan.tables.find((entry) => entry.table === "children").rows[0];
  assert.equal(child.parent_id, 7);
  assert.equal(child.school_id, 2);
  assert.equal(child.location_id, 4);
  assert.notEqual(child.first_name, "Sam");
  assert.equal(child.last_name, "Student");
  assert.equal(child.grade_level, "grades_4_8");
  assert.equal(child.birthdate, anchorBirthdate("grades_4_8", NOW));
  assert.equal(ageBandFromBirthdate(child.birthdate, NOW), "grades_4_8");
  assert.equal(child.allergies, null);
  assert.equal(child.medical_info, null);
  assert.equal(child.gender, null);
  assert.equal(child.current_lexile_range, null);
  assert.equal(child.parent_email, "user-7@masked.invalid");
  const student = plan.tables.find((entry) => entry.table === "school_students").rows[0];
  assert.equal(student.grade, "grades_4_8");
  assert.equal(student.student_id, null);
  const blob = JSON.stringify(plan);
  assert.equal(blob.includes("Sam"), false);
  assert.equal(blob.includes("2014-06-02"), false);
  assert.equal(blob.includes("peanuts"), false);
});

test("rosters, schedules, and events stay structurally intact", () => {
  const schedule = { variants: [{ name: "Morning", startTime: "09:00", endTime: "12:00", days: ["Monday"] }] };
  const plan = planCopy(
    {
      users: [{ id: 7, role: "parent" }, { id: 9, role: "educator" }],
      children: [{ id: 11, parent_id: 7, first_name: "Sam", last_name: "Parent", birthdate: "2014-06-02" }],
      classes: [
        {
          id: 3,
          title: "Woodshop",
          description: "Hand tools",
          category: "trades",
          schedule,
          price: 12000,
          instructor_id: 9,
          instructor_name: "Real Mentor",
          location_address: "12 Home Street",
          meeting_url: "https://zoom.example/secret",
          start_time: "09:00",
          end_time: "12:00",
        },
      ],
      program_enrollments: [
        {
          id: 40,
          school_id: 2,
          child_id: 11,
          parent_id: 7,
          class_name: "Woodshop",
          marketplace_class_id: 3,
          status: "enrolled",
          child_name: "Sam Parent",
          parent_email: "real.parent@example.com",
          stripe_customer_id: "cus_live",
          effective_balance: 500,
          total_cost: 12000,
          total_paid: 0,
          remaining_balance: 12000,
        },
      ],
      events: [
        {
          id: 8,
          title: "Fall picnic",
          start_date: "2026-10-12T15:00:00.000Z",
          end_date: "2026-10-12T18:00:00.000Z",
          location: "North Campus",
          organizer_id: 9,
          event_type: "special",
          school_id: 2,
        },
      ],
      store_products: [
        {
          id: 1,
          school_id: 2,
          name: "Fall picnic",
          price_cents: 0,
          product_kind: "event",
          rsvp: { startsOn: "2026-10-12", location: "North Campus" },
        },
      ],
    },
    NOW,
  );
  const klass = plan.tables.find((entry) => entry.table === "classes").rows[0];
  assert.deepEqual(klass.schedule, schedule);
  assert.equal(klass.title, "Woodshop");
  assert.equal(klass.start_time, "09:00");
  assert.equal(klass.instructor_id, 9);
  assert.equal(klass.instructor_name, "Mentor 9");
  assert.equal(klass.location_address, null);
  assert.equal(klass.meeting_url, null);
  const enrollment = plan.tables.find((entry) => entry.table === "program_enrollments").rows[0];
  assert.equal(enrollment.child_id, 11);
  assert.equal(enrollment.marketplace_class_id, 3);
  assert.equal(enrollment.status, "enrolled");
  assert.equal(enrollment.class_name, "Woodshop");
  assert.match(enrollment.child_name, / Student$/);
  assert.equal(enrollment.parent_email, "user-7@masked.invalid");
  assert.equal(Object.hasOwn(enrollment, "stripe_customer_id"), false);
  assert.equal(Object.hasOwn(enrollment, "effective_balance"), false);
  const event = plan.tables.find((entry) => entry.table === "events").rows[0];
  assert.equal(event.title, "Fall picnic");
  assert.equal(event.location, "North Campus");
  assert.equal(event.start_date, "2026-10-12T15:00:00.000Z");
  const product = plan.tables.find((entry) => entry.table === "store_products").rows[0];
  assert.equal(product.rsvp.location, "North Campus");
});
