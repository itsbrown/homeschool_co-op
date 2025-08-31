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
router.get("/", isParent, (req: Request, res: Response) => {
  // Mock data for testing since we don't have a database connection yet
  const children = [
    {
      id: 1,
      name: "John Smith",
      age: 8,
      gender: "Male",
      gradeLevel: "3rd Grade",
      parentId: req.session.userId,
      enrollments: []
    },
    {
      id: 2,
      name: "Emily Smith",
      age: 10, 
      gender: "Female",
      gradeLevel: "5th Grade",
      parentId: req.session.userId,
      enrollments: []
    }
  ];
  
  res.json(children);
});

// Get a specific child by ID
router.get("/:id", isParent, (req: Request, res: Response) => {
  const childId = parseInt(req.params.id);
  
  // Mock data for testing
  const children = [
    {
      id: 1,
      name: "John Smith",
      age: 8,
      gender: "Male",
      gradeLevel: "3rd Grade",
      parentId: req.session.userId,
      enrollments: []
    },
    {
      id: 2,
      name: "Emily Smith",
      age: 10, 
      gender: "Female",
      gradeLevel: "5th Grade",
      parentId: req.session.userId,
      enrollments: []
    }
  ];
  
  const child = children.find(c => c.id === childId);
  
  if (!child) {
    return res.status(404).json({ message: "Child not found" });
  }
  
  res.json(child);
});

// Register a new child
router.post("/", isParent, (req: Request, res: Response) => {
  try {
    const { firstName, lastName, birthdate, gradeLevel, gender, interests, learningStyle, specialNeeds, allergies, notes } = req.body;
    
    // Validate required fields
    if (!firstName || !lastName || !birthdate || !gradeLevel) {
      return res.status(400).json({ message: "Missing required fields" });
    }
    
    // For simplicity in this test implementation, we'll just generate a random ID
    // In a real application, this would be handled by the database
    const newChildId = Math.floor(Math.random() * 10000) + 100;
    
    // Calculate age from birthdate
    const birthDate = new Date(birthdate);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    
    // Create the new child object
    const newChild = {
      id: newChildId,
      name: `${firstName} ${lastName}`,
      age,
      gender: gender || "Not specified",
      gradeLevel,
      parentId: req.session.userId,
      interests: interests || [],
      learningStyle: learningStyle || "Not specified",
      specialNeeds: specialNeeds || null,
      allergies: allergies || null,
      notes: notes || null,
      enrollments: []
    };
    
    // In a real application, we would save this to the database
    
    // Return success response
    return res.status(200).json({
      message: "Child registered successfully",
      id: newChildId,
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
    
    console.log(`📝 Updating child ${childId} with data:`, updateData);
    
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

export default router;