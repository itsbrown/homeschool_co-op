import { Router } from "express";
import { storage } from "../storage";
import { isAuthenticated, hasRole } from "./auth";

const router = Router();

// Get dashboard statistics
router.get("/dashboard", isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.userId;
    
    // In a real app, we would calculate these metrics from the database
    // Mocked data for demonstration purposes
    const statistics = {
      totalStudents: 124,
      activeCourses: 8,
      completionRate: 87,
      marketplaceSales: 2450
    };
    
    // Try to get some real data if possible
    try {
      // Count the user's curricula
      const curricula = await storage.getCurriculaByAuthor(userId);
      if (curricula.length > 0) {
        statistics.activeCourses = curricula.filter(c => c.isPublished).length;
      }
      
      // Get marketplace sales
      const marketplaceItems = await storage.getMarketplaceItemsBySeller(userId);
      if (marketplaceItems.length > 0) {
        const totalRevenue = marketplaceItems.reduce((sum, item) => sum + item.revenue, 0);
        statistics.marketplaceSales = totalRevenue;
      }
    } catch (error) {
      console.error("Error getting real analytics data:", error);
      // Fall back to mocked data
    }
    
    res.status(200).json(statistics);
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
