import { Router, Request, Response, NextFunction } from "express";

const router = Router();

// Middleware to check if user is authenticated as a parent
const isParent = (req: Request, res: Response, next: NextFunction) => {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  
  if (req.session.userRole !== 'parent') {
    return res.status(403).json({ message: "Only parents can access this resource" });
  }
  
  next();
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

export default router;