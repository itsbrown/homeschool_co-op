import { Request, Response } from 'express';
import { storage } from '../storage.ts';
import { schoolStorage } from '../school-storage.ts';

export const getSuperAdminSchools = async (req: Request, res: Response) => {
  try {
    
    // Get all schools from school storage
    const schools = schoolStorage.getAllSchools();
    
    // Get additional statistics for each school
    const schoolsWithStats = await Promise.all(
      schools.map(async (school: any) => {
        try {
          // Get student count for this school
          const children = await storage.getAllChildren();
          const studentCount = children.filter((child: any) => child.school === school.id).length;
          
          // Get class count for this school
          const classes = await storage.getClasses({ page: 1, limit: 1000 });
          const classCount = classes.filter((cls: any) => cls.schoolId === school.id).length;
          
          // Get staff count for this school (placeholder for now)
          const staffCount = 0; // TODO: Implement staff counting when staff storage is available
          
          return {
            ...school,
            studentCount,
            classCount,
            staffCount,
            isActive: school.isActive !== false // Default to active if not specified
          };
        } catch (error) {
          console.error(`Error getting stats for school ${school.id}:`, error);
          return {
            ...school,
            studentCount: 0,
            classCount: 0,
            staffCount: 0,
            isActive: school.isActive !== false
          };
        }
      })
    );
    
    console.log(`📊 SuperAdmin: Retrieved ${schoolsWithStats.length} schools with statistics`);
    res.json(schoolsWithStats);
  } catch (error) {
    console.error('❌ Error fetching schools for superadmin:', error);
    res.status(500).json({ 
      error: 'Failed to fetch schools',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const getSuperAdminSchoolDetails = async (req: Request, res: Response) => {
  try {
    const { schoolId } = req.params;
    
    // Get school details
    const school = schoolStorage.getSchoolById(parseInt(schoolId));
    
    if (!school) {
      return res.status(404).json({ error: 'School not found' });
    }
    
    // Get detailed statistics
    const children = await storage.getAllChildren();
    const classes = await storage.getClasses({ page: 1, limit: 1000 });
    const enrollments = await storage.getAllEnrollments();
    
    const schoolStudents = children.filter((child: any) => child.school === school.id);
    const schoolClasses = classes.filter((cls: any) => cls.schoolId === school.id);
    const schoolEnrollments = enrollments.filter((enrollment: any) => 
      schoolClasses.some((cls: any) => cls.id === enrollment.classId)
    );
    
    const detailedStats = {
      ...school,
      students: schoolStudents,
      classes: schoolClasses,
      enrollments: schoolEnrollments,
      totalRevenue: schoolEnrollments.reduce((sum: number, enrollment: any) => sum + (enrollment.totalCost || 0), 0),
      activeEnrollments: schoolEnrollments.filter((e: any) => e.status === 'active').length,
      pendingEnrollments: schoolEnrollments.filter((e: any) => e.status === 'pending_payment').length
    };
    
    console.log(`🏫 SuperAdmin: Retrieved detailed info for school ${schoolId}`);
    res.json(detailedStats);
  } catch (error) {
    console.error('❌ Error fetching school details for superadmin:', error);
    res.status(500).json({ 
      error: 'Failed to fetch school details',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const updateSuperAdminSchool = async (req: Request, res: Response) => {
  try {
    const { schoolId } = req.params;
    const updateData = req.body;
    
    console.log(`🔄 SuperAdmin: Updating school ${schoolId} with data:`, updateData);
    
    // Update school using school storage
    const updatedSchool = schoolStorage.updateSchool(parseInt(schoolId), updateData);
    
    if (!updatedSchool) {
      return res.status(404).json({ error: 'School not found' });
    }
    
    console.log(`✅ SuperAdmin: Updated school ${schoolId} successfully`);
    res.json(updatedSchool);
  } catch (error) {
    console.error('❌ Error updating school for superadmin:', error);
    res.status(500).json({ 
      error: 'Failed to update school',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};