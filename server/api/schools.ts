import express from "express";
import { db, getDb } from "../db";
import { schools, children, schoolDocuments } from "@shared/schema";
import { insertSchoolSchema } from "@shared/schema";
import { eq, and, sql, or, inArray } from "drizzle-orm";
import uploadLogoRouter from './schools/upload-logo';
import documentsRouter from './schools/documents';
import { supabaseAuth } from "../middleware/supabase-auth";
import { requireRole } from "../middleware/auth0-auth";
import { storage } from "../storage";
import { insertSchoolCore } from "../lib/school-db";
import {
  ensureSchoolRegistrationCode,
  findSchoolByRegistrationCode,
  generateUniqueRegistrationCode,
  normalizeRegistrationCode,
} from "../lib/school-registration-code";
import { getSchoolCoreByRegistrationCode } from "../lib/school-db";
import { userRoles } from "@shared/schema";

const router = express.Router();

// Create a new school (authenticated admin becomes school owner)
router.post("/", supabaseAuth, async (req: any, res) => {
  try {
    console.log('🏫 Creating school with data:', JSON.stringify(req.body, null, 2));

    const userEmail = req.user?.email;
    if (!userEmail) {
      return res.status(401).json({ message: 'Authentication required to register a school' });
    }

    const adminUser = await storage.getUserByEmail(userEmail);
    if (!adminUser) {
      return res.status(404).json({ message: 'User account not found. Complete sign-up first.' });
    }

    // Validate the request body
    const validatedData = insertSchoolSchema.safeParse(req.body);
    if (!validatedData.success) {
      return res.status(400).json({ 
        message: "Invalid school data", 
        errors: validatedData.error.issues 
      });
    }

    // Generate unique registration code if not provided
    let registrationCode = validatedData.data.registrationCode;
    if (!registrationCode) {
      registrationCode = await generateUniqueRegistrationCode();
      console.log('🔑 Generated registration code:', registrationCode);
    }

    const d = validatedData.data;
    let newSchool;
    try {
      newSchool = await storage.createSchool({
        ...d,
        registrationCode,
        adminId: adminUser.id,
        status: 'active',
      } as Parameters<typeof storage.createSchool>[0]);
    } catch (storageErr) {
      console.warn('storage.createSchool failed, using core insert:', storageErr);
      newSchool = await insertSchoolCore({
        name: d.name,
        type: d.type,
        adminId: adminUser.id,
        address: d.address ?? null,
        city: d.city,
        state: d.state,
        zipCode: d.zipCode,
        phoneNumber: d.phoneNumber ?? null,
        email: d.email,
        website: d.website ?? null,
        description: d.description ?? null,
        foundedYear: d.foundedYear ?? null,
        accreditation: d.accreditation ?? null,
        enrollmentSize: d.enrollmentSize ?? null,
        registrationCode,
        status: 'active',
      });
    }

    const db = await getDb();
    const existingRole = await db
      .select({ id: userRoles.id })
      .from(userRoles)
      .where(
        and(
          eq(userRoles.userId, adminUser.id),
          eq(userRoles.role, 'schoolAdmin'),
          eq(userRoles.schoolId, newSchool.id),
        ),
      )
      .limit(1);

    let activeRoleId = adminUser.activeRoleId ?? null;
    if (existingRole.length === 0) {
      const [roleRow] = await db
        .insert(userRoles)
        .values({
          userId: adminUser.id,
          role: 'schoolAdmin',
          schoolId: newSchool.id,
          isPrimary: true,
        })
        .returning();
      activeRoleId = roleRow.id;
    } else {
      activeRoleId = existingRole[0].id;
    }

    await storage.updateUser(adminUser.id, {
      schoolId: newSchool.id,
      role: 'schoolAdmin',
      activeRole: 'schoolAdmin',
      activeRoleId,
    });

    console.log('✅ School created and linked to admin:', adminUser.email, newSchool.id);
    res.status(201).json(newSchool);
  } catch (error: any) {
    console.error("Error creating school:", error);
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
});

// Get all schools
router.get("/", async (req, res) => {
  try {
    const allSchools = await storage.getAllSchools();
    res.json(allSchools);
  } catch (error: any) {
    console.error("Error fetching schools:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Validate school registration code - must be before /:id route to avoid conflicts
router.get("/validate-code/:code", async (req, res) => {
  try {
    const code = normalizeRegistrationCode(req.params.code);
    console.log('🔍 Validating registration code:', code);
    
    const school = await findSchoolByRegistrationCode(code);
    
    if (!school) {
      console.log('❌ Invalid registration code:', code);
      return res.status(404).json({ 
        message: "Invalid registration code. Please check with your school administrator." 
      });
    }
    
    // Check if school is active
    if (school.status !== 'active') {
      console.log('⚠️ School is not active:', school.name);
      return res.status(403).json({ 
        message: "This school is not currently accepting registrations. Please contact your administrator." 
      });
    }
    
    console.log('✅ Valid registration code for school:', school.name);
    res.json({ 
      id: school.id,
      name: school.name,
      code: school.registrationCode 
    });
  } catch (error: any) {
    console.error("Error validating registration code:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Get knowledge bases - must be before /:id route to avoid conflicts
router.get("/knowledge-bases", async (req, res) => {
  try {
    // Return sample knowledge base data for now
    const sampleKnowledgeBases = [
      {
        id: 1,
        title: "American History Primary Documents",
        description: "A comprehensive collection of primary documents from American history, including the Declaration of Independence, Constitution, and other significant historical texts.",
        subjectArea: "History",
        gradeLevel: ["9-12"],
        status: "Published",
        visibility: "School",
        fileCount: 36,
        size: "128 MB",
        createdAt: "2023-09-15",
        updatedAt: "2023-10-20",
        tags: ["American History", "Primary Sources", "Constitution", "Revolution"],
        creator: "Dr. Sarah Johnson",
        rating: 4.8,
        usageCount: 85,
      },
      {
        id: 2,
        title: "Middle School Mathematics",
        description: "Core mathematics curriculum materials for grades 6-8, covering algebra, geometry, statistics, and more.",
        subjectArea: "Mathematics",
        gradeLevel: ["6-8"],
        status: "Published",
        visibility: "School",
        fileCount: 42,
        size: "95 MB",
        createdAt: "2023-08-05",
        updatedAt: "2023-11-10",
        tags: ["Mathematics", "Algebra", "Geometry", "Middle School"],
        creator: "Prof. Michael Chen",
        rating: 4.6,
        usageCount: 120,
      },
      {
        id: 3,
        title: "Science Laboratory Experiments",
        description: "Hands-on laboratory experiments for high school chemistry and physics classes.",
        subjectArea: "Science",
        gradeLevel: ["9-12"],
        status: "Published",
        visibility: "School",
        fileCount: 28,
        size: "156 MB",
        createdAt: "2023-07-12",
        updatedAt: "2023-10-05",
        tags: ["Science", "Chemistry", "Physics", "Laboratory"],
        creator: "Dr. Emily Rodriguez",
        rating: 4.7,
        usageCount: 93,
      }
    ];

    res.json(sampleKnowledgeBases);
  } catch (error: any) {
    console.error("Error fetching knowledge bases:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Get all published documents visible to a specific parent (admin endpoint)
router.get('/parents/:parentId/documents', supabaseAuth, requireRole(['schoolAdmin', 'admin', 'superAdmin']), async (req: any, res) => {
  try {
    const adminUserId = req.user?.id;
    if (!adminUserId) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    // SECURITY: Use req.auth.schoolId as the authoritative school context (set by supabaseAuth middleware)
    const schoolId = req.auth?.schoolId;
    if (!schoolId) {
      return res.status(400).json({ success: false, message: 'Admin is not associated with a school' });
    }

    const parentId = parseInt(req.params.parentId);
    if (isNaN(parentId)) {
      return res.status(400).json({ success: false, message: 'Invalid parent ID' });
    }

    // Verify the parent belongs to the same school
    const parentUser = await storage.getUser(parentId);
    if (!parentUser || parentUser.schoolId !== schoolId) {
      return res.status(403).json({ success: false, message: 'Parent does not belong to this school' });
    }

    const database = await getDb();

    // Find document IDs targeted to this parent via notification_recipients.
    // sendDocumentNotification stores documentId in targetData for all targeting types.
    // Use raw SQL to extract documentId from the JSONB targetData column — this is the
    // authoritative document-level linkage; no title matching is used.
    const targetedDocRows = await database.execute(sql`
      SELECT DISTINCT CAST(n.target_data->>'documentId' AS INTEGER) AS document_id
      FROM notification_recipients nr
      JOIN notifications n ON n.id = nr.notification_id
      WHERE nr.recipient_id = ${parentId}
        AND n.target_data->>'documentId' IS NOT NULL
        AND CAST(n.target_data->>'documentId' AS INTEGER) > 0
    `);

    const targetedDocumentIds: number[] = (targetedDocRows.rows as any[])
      .map(r => Number(r.document_id))
      .filter(id => !isNaN(id) && id > 0);

    // Safe metadata fields only — never expose filePath or other storage internals
    const safeFields = {
      id: schoolDocuments.id,
      title: schoolDocuments.title,
      category: schoolDocuments.category,
      fileName: schoolDocuments.fileName,
      fileSize: schoolDocuments.fileSize,
      createdAt: schoolDocuments.createdAt,
    };

    // Return published, non-archived docs that are visibleToAll OR targeted to this parent
    let documents;
    if (targetedDocumentIds.length > 0) {
      documents = await database
        .select(safeFields)
        .from(schoolDocuments)
        .where(and(
          eq(schoolDocuments.schoolId, schoolId),
          eq(schoolDocuments.isPublished, true),
          eq(schoolDocuments.isArchived, false),
          or(
            eq(schoolDocuments.visibleToAll, true),
            inArray(schoolDocuments.id, targetedDocumentIds)
          )
        ));
    } else {
      documents = await database
        .select(safeFields)
        .from(schoolDocuments)
        .where(and(
          eq(schoolDocuments.schoolId, schoolId),
          eq(schoolDocuments.isPublished, true),
          eq(schoolDocuments.isArchived, false),
          eq(schoolDocuments.visibleToAll, true)
        ));
    }

    res.json({ success: true, documents });
  } catch (error) {
    console.error('Error fetching parent documents:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch documents' });
  }
});

// Mount the documents route BEFORE catch-all routes like /:id
router.use('/documents', documentsRouter);

// Get school by registration code
router.get("/by-code/:code", async (req, res) => {
  try {
    const code = normalizeRegistrationCode(req.params.code);

    if (!code) {
      return res.status(400).json({ message: "Registration code is required" });
    }

    const core = await getSchoolCoreByRegistrationCode(code);
    if (!core) {
      return res.status(404).json({ message: "School not found with this registration code" });
    }

    let school = core;
    if (!school.registrationCode?.trim()) {
      const generated = await ensureSchoolRegistrationCode(school.id);
      if (generated) {
        school = { ...school, registrationCode: generated };
      }
    }

    if (school.status !== 'active') {
      return res.status(403).json({
        message:
          'This school is not currently accepting registrations. Please contact your administrator.',
      });
    }

    res.json(school);
  } catch (error: any) {
    console.error("Error fetching school by registration code:", error);
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
});

// Get school by ID
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const schoolId = parseInt(id);

    if (isNaN(schoolId)) {
      return res.status(400).json({ message: "Invalid school ID" });
    }

    const db = await getDb();
    const school = await db.query.schools.findFirst({
      where: eq(schools.id, schoolId)
    });

    if (!school) {
      return res.status(404).json({ message: "School not found" });
    }

    const registrationCode = await ensureSchoolRegistrationCode(schoolId);
    if (registrationCode && registrationCode !== school.registrationCode) {
      const [updatedSchool] = await db
        .select()
        .from(schools)
        .where(eq(schools.id, schoolId))
        .limit(1);
      return res.json(updatedSchool ?? { ...school, registrationCode });
    }

    res.json(school);
  } catch (error: any) {
    console.error("Error fetching school:", error);
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
});

// Get staff for a school - placeholder until staff schema is properly defined
router.get("/:id/staff", async (req, res) => {
  try {
    res.json([]);
  } catch (error: any) {
    console.error("Error fetching staff:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Get students for a school
router.get("/:id/students", async (req, res) => {
  try {
    const { id } = req.params;
    const schoolId = parseInt(id);

    if (isNaN(schoolId)) {
      return res.status(400).json({ message: "Invalid school ID" });
    }

    const db = await getDb();
    const students = await db.query.children.findMany({
      where: eq(children.schoolId, schoolId)
    });

    res.json(students);
  } catch (error: any) {
    console.error("Error fetching students:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Mount the logo upload route
router.use('/upload-logo', uploadLogoRouter);

export default router;