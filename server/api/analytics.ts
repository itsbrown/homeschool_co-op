import { Router } from "express";
import { storage } from "../storage";
import { isAuthenticated, hasRole } from "./auth";
import { supabaseAuth } from "../middleware/supabase-auth";
import { requireSchoolContext } from "../middleware/require-school-context";

const router = Router();

// Get dashboard statistics
router.get("/dashboard", isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.userId;
    const user = req.user;
    
    // Check if user has multiple roles
    const hasMultipleRoles = user?.permissions?.additionalRoles && user.permissions.additionalRoles.length > 0;
    const activeRole = req.session.activeRole;
    
    // If multi-role user and no active role selected, show role selection
    if (hasMultipleRoles && !activeRole) {
      const availableRoles = [user.role, ...(user.permissions.additionalRoles || [])];
      return res.status(200).json({
        showRoleSelection: true,
        availableRoles
      });
    }
    
    // Determine which role to use (activeRole for multi-role, user.role otherwise)
    const currentRole = activeRole || user?.role;
    
    // Return role-specific dashboard data
    switch (currentRole) {
      case 'parent':
        return res.status(200).json({
          dashboardType: 'parent',
          children: [],
          enrollments: []
        });
      
      case 'teacher':
      case 'educator':
        return res.status(200).json({
          dashboardType: 'educator',
          classes: [],
          students: [],
          aiToolsAvailable: true
        });
      
      case 'schoolAdmin':
        // Fetch the school admin's school (schools are linked by adminId, not user.schoolId)
        const allUserSchools = await storage.getAllSchools();
        const school = allUserSchools?.find(s => s.adminId === userId) || null;
        return res.status(200).json({
          dashboardType: 'schoolAdmin',
          school: school || null,
          statistics: {
            totalStudents: 0,
            totalEducators: 0,
            totalEnrollments: 0
          }
        });
      
      case 'superAdmin':
        // Fetch all schools for super admin
        const allSchools = await storage.getAllSchools();
        return res.status(200).json({
          dashboardType: 'superAdmin',
          allSchools: allSchools || [],
          platformMetrics: {
            totalSchools: allSchools?.length || 0,
            totalUsers: 0,
            totalRevenue: 0
          }
        });
      
      default:
        // Generic dashboard
        const statistics = {
          totalStudents: 124,
          activeCourses: 8,
          completionRate: 87,
          marketplaceSales: 2450
        };
        
        return res.status(200).json(statistics);
    }
  } catch (error) {
    console.error("Get dashboard statistics error:", error);
    res.status(500).json({ message: "Error fetching dashboard statistics" });
  }
});

// Get curriculum analytics
router.get("/curriculum/:id", isAuthenticated, async (req, res) => {
  try {
    const curriculumId = parseInt(req.params.id);
    const curriculum = await storage.getCurriculum(curriculumId);
    
    if (!curriculum) {
      return res.status(404).json({ message: "Curriculum not found" });
    }
    
    // Check if user is author
    if (curriculum.authorId !== req.session.userId) {
      return res.status(403).json({ message: "Forbidden" });
    }
    
    // In a real app, we would calculate these metrics from usage data
    // Mocked data for demonstration purposes
    const analytics = {
      views: Math.floor(Math.random() * 100) + 50,
      completions: Math.floor(Math.random() * 30) + 10,
      avgRating: (Math.random() * 2 + 3).toFixed(1),
      engagement: {
        high: Math.floor(Math.random() * 40) + 30,
        medium: Math.floor(Math.random() * 30) + 20,
        low: Math.floor(Math.random() * 20) + 10
      }
    };
    
    res.status(200).json(analytics);
  } catch (error) {
    console.error("Get curriculum analytics error:", error);
    res.status(500).json({ message: "Error fetching curriculum analytics" });
  }
});

// Get marketplace analytics
router.get("/marketplace", isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.userId;
    
    // Get the user's marketplace items
    const items = await storage.getMarketplaceItemsBySeller(userId);
    
    // Calculate analytics
    const totalSales = items.reduce((sum, item) => sum + item.sales, 0);
    const totalRevenue = items.reduce((sum, item) => sum + item.revenue, 0);
    
    // Sort by revenue for top items
    const sortedItems = [...items].sort((a, b) => b.revenue - a.revenue);
    
    // Get top items (up to 3)
    const topSellingItems = sortedItems.slice(0, 3).map(item => {
      const percentage = totalRevenue > 0 
        ? Math.round((item.revenue / totalRevenue) * 100) 
        : 0;
      
      return {
        id: item.id,
        title: item.title,
        revenue: item.revenue,
        sales: item.sales,
        percentage
      };
    });
    
    const analytics = {
      totalItems: items.length,
      totalSales,
      totalRevenue,
      topSellingItems,
      revenueByMonth: [
        { month: "Jan", revenue: Math.floor(Math.random() * 500) },
        { month: "Feb", revenue: Math.floor(Math.random() * 500) },
        { month: "Mar", revenue: Math.floor(Math.random() * 500) },
        { month: "Apr", revenue: Math.floor(Math.random() * 800) },
        { month: "May", revenue: Math.floor(Math.random() * 1000) },
        { month: "Jun", revenue: Math.floor(Math.random() * 1200) }
      ]
    };
    
    res.status(200).json(analytics);
  } catch (error) {
    console.error("Get marketplace analytics error:", error);
    res.status(500).json({ message: "Error fetching marketplace analytics" });
  }
});

// Get school enrollment breakdown analytics
router.get("/school/enrollment-breakdown", supabaseAuth, requireSchoolContext, async (req: any, res) => {
  try {
    const schoolId = req.schoolId;
    
    // Get all enrollments for this school
    const allEnrollments = await storage.getAllEnrollments() as any[];
    
    // Get classes for this school to filter enrollments
    const classes = await storage.getClassesBySchoolId(String(schoolId)) as any[];
    const classIds = new Set(classes.map((c: any) => c.id));
    
    // Filter enrollments to this school's classes
    const schoolEnrollments = allEnrollments.filter((e: any) => e.classId && classIds.has(e.classId));
    
    // Calculate breakdown by status
    const statusBreakdown = schoolEnrollments.reduce((acc: Record<string, number>, enrollment: any) => {
      const status = enrollment.status || 'unknown';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    // Calculate breakdown by payment status (use status-based inference since payment fields may vary)
    const paymentBreakdown = schoolEnrollments.reduce((acc: {paid: number, pending: number}, enrollment: any) => {
      const isPaid = enrollment.status === 'enrolled' || enrollment.status === 'completed';
      const status = isPaid ? 'paid' : 'pending';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, { paid: 0, pending: 0 });
    
    // Calculate monthly enrollment trends (last 6 months)
    const now = new Date();
    const monthlyTrends = [];
    for (let i = 5; i >= 0; i--) {
      const month = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
      const monthName = month.toLocaleString('default', { month: 'short' });
      
      const count = schoolEnrollments.filter((e: any) => {
        const enrollDate = new Date(e.createdAt);
        return enrollDate >= month && enrollDate <= monthEnd;
      }).length;
      
      monthlyTrends.push({ month: monthName, count });
    }
    
    res.status(200).json({
      totalEnrollments: schoolEnrollments.length,
      statusBreakdown,
      paymentBreakdown,
      monthlyTrends
    });
  } catch (error) {
    console.error("Get enrollment breakdown error:", error);
    res.status(500).json({ message: "Error fetching enrollment breakdown" });
  }
});

// Get location-based enrollment stats
router.get("/school/location-stats", supabaseAuth, requireSchoolContext, async (req: any, res) => {
  try {
    const schoolId = req.schoolId;
    
    // Get locations for this school
    const locations = await storage.getLocationsBySchool(schoolId) as any[];
    
    // Get all classes for this school
    const classes = await storage.getClassesBySchoolId(String(schoolId)) as any[];
    
    // Get all enrollments
    const allEnrollments = await storage.getAllEnrollments() as any[];
    const classIds = new Set(classes.map((c: any) => c.id));
    const schoolEnrollments = allEnrollments.filter((e: any) => e.classId && classIds.has(e.classId));
    
    // Group by location
    const locationStats: any[] = locations.map((location: any) => {
      const locationClasses = classes.filter((c: any) => c.locationId === location.id);
      const locationClassIds = new Set(locationClasses.map((c: any) => c.id));
      const locationEnrollments = schoolEnrollments.filter((e: any) => e.classId && locationClassIds.has(e.classId));
      
      return {
        locationId: location.id,
        locationName: location.name,
        address: location.address || '',
        classCount: locationClasses.length,
        enrollmentCount: locationEnrollments.length,
        revenue: 0 // Revenue calculation requires joining with payment data
      };
    });
    
    // Add "No Location" category for classes without a location
    const noLocationClasses = classes.filter((c: any) => !c.locationId);
    const noLocationClassIds = new Set(noLocationClasses.map((c: any) => c.id));
    const noLocationEnrollments = schoolEnrollments.filter((e: any) => e.classId && noLocationClassIds.has(e.classId));
    
    if (noLocationClasses.length > 0) {
      locationStats.push({
        locationId: 0,
        locationName: "No Location Assigned",
        address: '',
        classCount: noLocationClasses.length,
        enrollmentCount: noLocationEnrollments.length,
        revenue: 0
      });
    }
    
    res.status(200).json({ locationStats });
  } catch (error) {
    console.error("Get location stats error:", error);
    res.status(500).json({ message: "Error fetching location statistics" });
  }
});

// Get class variation enrollment counts
router.get("/school/class-enrollments", supabaseAuth, requireSchoolContext, async (req: any, res) => {
  try {
    const schoolId = req.schoolId;
    
    // Get all classes for this school
    const classes = await storage.getClassesBySchoolId(String(schoolId)) as any[];
    
    // Get all enrollments
    const allEnrollments = await storage.getAllEnrollments() as any[];
    const classIds = new Set(classes.map((c: any) => c.id));
    const schoolEnrollments = allEnrollments.filter((e: any) => e.classId && classIds.has(e.classId));
    
    // Build class enrollment data with variant breakdown
    const classEnrollments = classes.map((classItem: any) => {
      const classEnrolls = schoolEnrollments.filter((e: any) => e.classId === classItem.id);
      
      // Group by variant if applicable (use enrollment metadata or default)
      const variantBreakdown = classEnrolls.reduce((acc: Record<string, number>, e: any) => {
        const variant = e.selectedVariant || 'Default';
        acc[variant] = (acc[variant] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      // Use maxEnrollment field (the correct field name in the schema)
      const capacity = classItem.maxEnrollment || classItem.maxStudents || 0;
      
      return {
        classId: classItem.id,
        className: classItem.title,
        category: classItem.category,
        capacity: capacity,
        currentEnrollments: classEnrolls.length,
        availableSpots: capacity - classEnrolls.length,
        fillRate: capacity ? Math.round((classEnrolls.length / capacity) * 100) : 0,
        variantBreakdown,
        totalRevenue: 0 // Revenue calculation requires joining with payment data
      };
    });
    
    // Sort by enrollment count descending
    classEnrollments.sort((a: any, b: any) => b.currentEnrollments - a.currentEnrollments);
    
    res.status(200).json({ classEnrollments });
  } catch (error) {
    console.error("Get class enrollments error:", error);
    res.status(500).json({ message: "Error fetching class enrollments" });
  }
});

// Get user activity analytics
router.get("/user-activity", isAuthenticated, hasRole(["admin", "educator"]), async (req, res) => {
  try {
    // In a real app, we would calculate these metrics from user activity data
    // Mocked data for demonstration purposes
    const analytics = {
      activeUsers: Math.floor(Math.random() * 50) + 70,
      newUsers: Math.floor(Math.random() * 20) + 5,
      averageSessionTime: Math.floor(Math.random() * 15) + 10,
      mostActiveTimeOfDay: ["2pm", "3pm", "4pm"],
      usersByRole: {
        learner: Math.floor(Math.random() * 50) + 50,
        parent: Math.floor(Math.random() * 20) + 10,
        educator: Math.floor(Math.random() * 15) + 5,
        admin: 1
      }
    };
    
    res.status(200).json(analytics);
  } catch (error) {
    console.error("Get user activity analytics error:", error);
    res.status(500).json({ message: "Error fetching user activity analytics" });
  }
});

export default router;
