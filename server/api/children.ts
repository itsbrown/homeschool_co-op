import { Router, Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { jwtCheck } from "../middleware/auth0-auth";

const router = Router();

// Middleware to check if user is authenticated as a parent using JWT
const isParent = async (req: any, res: Response, next: NextFunction) => {
  try {
    // Ensure JWT authentication has been verified first
    if (!req.user || !req.user.email) {
      return res.status(401).json({ message: "Authentication required" });
    }
    
    // Get user role from storage using email
    const userEmail = req.user.email;
    console.log(`🔍 Checking parent access for: ${userEmail}`);
    
    // Use the same role checking logic as the working endpoints  
    const user = await storage.getUserByEmail(userEmail);
    const userRole = user?.role;
    
    if (userRole !== 'parent') {
      console.log(`❌ Access denied - user role: ${userRole}, required: parent`);
      return res.status(403).json({ message: "Only parents can access this resource" });
    }
    
    console.log(`✅ Parent access granted for: ${userEmail}`);
    next();
  } catch (error) {
    console.error("Error in parent middleware:", error);
    return res.status(500).json({ message: "Authentication error" });
  }
};

// Get all children for the parent user
router.get("/", jwtCheck, isParent, async (req: any, res: Response) => {
  try {
    const userEmail = req.user.email;
    console.log(`📚 Fetching children for parent: ${userEmail}`);
    
    const allChildren = await storage.getAllChildren();
    const requestUserId = Number(req.user.id);
    const children = allChildren.filter((c: any) =>
      c.parentEmail === userEmail || Number(c.parentId) === requestUserId
    );
    
    console.log(`✅ Found ${children.length} children for ${userEmail}`);
    res.json({ children });
  } catch (error) {
    console.error("Error fetching children:", error);
    res.status(500).json({ message: "Error fetching children" });
  }
});

// Get a specific child by ID
router.get("/:id", jwtCheck, isParent, async (req: any, res: Response) => {
  try {
    const childId = parseInt(req.params.id);
    const userEmail = req.user.email;
    
    console.log(`🔍 Fetching child ${childId} for parent: ${userEmail}`);
    
    // Get the child from database
    const child = await storage.getChildById(childId);
    
    if (!child) {
      console.log(`❌ Child ${childId} not found`);
      return res.status(404).json({ message: "Child not found" });
    }
    
    // Verify the child belongs to this parent
    const parent = await storage.getUserByEmail(userEmail);
    if (child.parentEmail !== userEmail && child.parentId !== parent?.id) {
      console.log(`❌ Child ${childId} does not belong to parent ${userEmail}`);
      return res.status(403).json({ message: "Access denied" });
    }
    
    console.log(`✅ Found child: ${child.firstName} ${child.lastName}`);
    res.json({ child });
  } catch (error) {
    console.error("Error fetching child:", error);
    res.status(500).json({ message: "Error fetching child" });
  }
});

// Register a new child
router.post("/", jwtCheck, isParent, async (req: any, res: Response) => {
  try {
    const { firstName, lastName, birthdate, gradeLevel, gender, interests, learningStyle, specialNeeds, allergies, notes, school, schoolId } = req.body;
    const userEmail = req.user.email;
    
    // Validate required fields
    if (!firstName || !lastName || !birthdate || !gradeLevel) {
      return res.status(400).json({ message: "Missing required fields" });
    }
    
    console.log(`👶 Registering new child for parent: ${userEmail}`);
    
    // Get parent user to get their ID
    const parent = await storage.getUserByEmail(userEmail);
    if (!parent) {
      return res.status(404).json({ message: "Parent user not found" });
    }
    
    // Create the new child in the database
    const newChild = await storage.createChild({
      parentId: parent.id,
      parentEmail: userEmail,
      firstName,
      lastName,
      birthdate,
      gradeLevel,
      gender: gender || null,
      school: school || null,
      schoolId: schoolId || null,
      learningStyle: learningStyle || null,
      specialNeeds: specialNeeds || null,
      interests: interests || [],
      allergies: allergies || null,
      medicalInfo: null,
      profileImage: null,
      emergencyContact: null,
      additionalLanguages: null,
      notes: notes || null,
      locationId: null
    });
    
    console.log(`✅ Child registered successfully: ${newChild.firstName} ${newChild.lastName} (ID: ${newChild.id})`);
    
    // Create school_student record if child has a schoolId
    if (newChild && schoolId) {
      try {
        console.log(`📚 Creating school_student record for child: ${newChild.id} at school: ${schoolId}`);
        const schoolStudent = await storage.createSchoolStudent({
          schoolId: schoolId,
          childId: newChild.id,
          grade: gradeLevel,
          status: 'active',
          locationId: null,
          studentId: null,
          notes: null
        });
        console.log(`✅ School student record created:`, schoolStudent);
      } catch (schoolStudentError) {
        console.error('⚠️ Failed to create school_student record:', schoolStudentError);
        // Don't fail the entire registration if this fails - child is already created
      }
    }
    
    // Return success response
    return res.status(200).json({
      message: "Child registered successfully",
      id: newChild.id,
      child: newChild
    });
  } catch (error) {
    console.error("Error registering child:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// Update a child's information
router.patch("/:id", jwtCheck, isParent, async (req: Request, res: Response) => {
  try {
    const childId = parseInt(req.params.id);
    const updateData = req.body;
    const userEmail = (req as any).user.email;
    
    console.log(`📝 Updating child ${childId} with data:`, updateData);
    
    const existingChild = await storage.getChildById(childId);
    if (!existingChild) {
      return res.status(404).json({ message: "Child not found" });
    }
    const parent = await storage.getUserByEmail(userEmail);
    if (existingChild.parentEmail !== userEmail && existingChild.parentId !== parent?.id) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Update the child using the storage system
    const updatedChild = await storage.updateChild(childId, updateData);
    
    if (!updatedChild) {
      return res.status(404).json({ message: "Child not found" });
    }
    
    console.log(`✅ Child ${childId} updated successfully:`, updatedChild);
    
    return res.status(200).json({
      message: "Child updated successfully",
      id: childId,
      child: updatedChild
    });
  } catch (error) {
    console.error("Error updating child:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.delete("/:id", jwtCheck, isParent, async (req: any, res: Response) => {
  try {
    const childId = parseInt(req.params.id);
    const userEmail = req.user.email;
    const child = await storage.getChildById(childId);
    if (!child) return res.status(404).json({ message: "Child not found" });
    const parent = await storage.getUserByEmail(userEmail);
    if (child.parentEmail !== userEmail && child.parentId !== parent?.id) {
      return res.status(403).json({ message: "Access denied" });
    }

    const enrollments = (await storage.getAllEnrollments()).filter((e: any) => e.childId === childId);
    if (enrollments.some((e: any) => e.status === "active" || e.status === "enrolled")) {
      return res.status(400).json({ error: "Cannot delete child with active enrollments" });
    }

    await storage.deleteChild(childId);
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error deleting child:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/:id/emergency-contacts", jwtCheck, isParent, async (req: any, res: Response) => {
  try {
    const childId = parseInt(req.params.id);
    const { firstName, lastName, relationship, phoneNumber, email, canPickup } = req.body || {};
    if (!phoneNumber || !/^[0-9\-+()\s]{7,20}$/.test(String(phoneNumber))) {
      return res.status(400).json({ error: "Invalid phone number format" });
    }
    const child = await storage.getChildById(childId);
    if (!child) return res.status(404).json({ message: "Child not found" });
    const contact = await storage.createEmergencyContact({
      userId: req.session.userId,
      name: [firstName, lastName].filter(Boolean).join(" ").trim() || firstName || "Contact",
      relationship: relationship || null,
      phone: phoneNumber,
      email: email || null,
      isEmergencyContact: true,
      canPickup: !!canPickup,
      notes: null,
    } as any);
    return res.status(200).json({
      contact: {
        id: contact.id,
        firstName: firstName || "",
        lastName: lastName || "",
        relationship: relationship || "",
        phoneNumber,
        email: email || null,
        canPickup: !!canPickup,
      },
    });
  } catch (error) {
    console.error("Error creating emergency contact:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/:id/emergency-contacts", jwtCheck, isParent, async (req: any, res: Response) => {
  try {
    const contacts = await storage.getEmergencyContactsByUserId(req.session.userId);
    const limitedContacts = contacts.slice(-2);
    return res.status(200).json({
      contacts: limitedContacts.map((c: any) => ({
        id: c.id,
        firstName: c.name?.split(" ")[0] || "",
        lastName: c.name?.split(" ").slice(1).join(" ") || "",
        relationship: c.relationship,
        phoneNumber: c.phone,
        email: c.email,
        canPickup: !!c.canPickup,
      })),
    });
  } catch (error) {
    console.error("Error fetching emergency contacts:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/:id/enrollments", jwtCheck, isParent, async (req: any, res: Response) => {
  try {
    const childId = parseInt(req.params.id);
    const enrollments = (await storage.getAllEnrollments()).filter((e: any) => e.childId === childId);
    return res.status(200).json({ enrollments });
  } catch (error) {
    console.error("Error fetching child enrollments:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

export default router;