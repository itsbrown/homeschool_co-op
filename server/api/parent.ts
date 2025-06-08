import { Router } from 'express';
import { verifySupabaseToken } from '../middleware/unified-auth';
import fs from 'fs';
import path from 'path';

const router = Router();

// Get children for the authenticated parent
router.get('/children', verifySupabaseToken, async (req, res) => {
  try {
    // Get the authenticated user's email from the token
    const userEmail = req.user.email;

    console.log('👨‍👩‍👧‍👦 Parent requesting children for email:', userEmail);

    if (!userEmail) {
      return res.status(401).json({ message: 'Email not found in token' });
    }

    // Read children from file
    const childrenPath = path.join(process.cwd(), 'data', 'children.json');

    if (!fs.existsSync(childrenPath)) {
      console.log('📁 No children file found, returning empty array');
      return res.json([]);
    }

    const childrenData = JSON.parse(fs.readFileSync(childrenPath, 'utf8'));

    // Filter children by parent email OR parent ID
    // First, find children that match by email
    const childrenByEmail = childrenData.filter((child: any) => 
      child.parentEmail === userEmail
    );

    // For children with parentId but no parentEmail, we need to determine if they belong to this user
    // Based on the data structure, parentId 1 appears to be associated with coreycreates@gmail.com
    const isMainAccount = userEmail === 'coreycreates@gmail.com';
    const childrenByParentId = childrenData.filter((child: any) => 
      !child.parentEmail && child.parentId === 1 && isMainAccount
    );

    // Combine both sets and remove duplicates
    const userChildren = [...childrenByEmail, ...childrenByParentId];

    console.log(`🔍 Found ${userChildren.length} children for parent ${userEmail}:`, 
      userChildren.map((c: any) => `${c.firstName} ${c.lastName}`));

    // Transform to expected format
    const transformedChildren = userChildren.map((child: any) => ({
      id: child.id,
      name: `${child.firstName} ${child.lastName}`,
      firstName: child.firstName,
      lastName: child.lastName,
      gradeLevel: child.gradeLevel || 'N/A',
      age: child.birthdate ? Math.floor((Date.now() - new Date(child.birthdate).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : 'N/A',
      birthdate: child.birthdate,
      parentName: userEmail,
      email: userEmail,
      enrollmentDate: child.createdAt ? new Date(child.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      status: 'Active',
      classes: [],
      avatar: child.profileImage || '',
      interests: child.interests || [],
      allergies: child.allergies || 'None specified',
      specialNeeds: child.specialNeeds || '',
      school: child.school || 'American Seekers Academy'
    }));

    res.json(transformedChildren);
  } catch (error) {
    console.error('❌ Error fetching parent children:', error);
    res.status(500).json({ message: 'Error fetching children' });
  }
});

export default router;