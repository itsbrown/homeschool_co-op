import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { storage } from '../storage';

const router = Router();

// Get children for the authenticated parent
router.get('/children', async (req, res) => {
  try {
    console.log('👨‍👩‍👧‍👦 Children API called - Headers:', Object.keys(req.headers));

    // Get the authenticated user's email from the token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('❌ No valid authorization header found');
      return res.status(401).json({ 
        message: 'Authentication required',
        error: 'NO_AUTH_HEADER',
        debug: 'Please log in to access children data'
      });
    }

    const token = authHeader.split(' ')[1];
    console.log('🔑 Token received, length:', token.length);

    // Decode the Supabase JWT to get user email
    let userEmail;
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      userEmail = payload.email;
      console.log('👨‍👩‍👧‍👦 Parent requesting children for email:', userEmail);
    } catch (error) {
      console.error('❌ Error decoding token:', error);
      return res.status(401).json({ 
        message: 'Invalid token',
        error: 'TOKEN_DECODE_ERROR',
        debug: 'Token could not be decoded'
      });
    }

    if (!userEmail) {
      console.log('❌ No email found in token payload');
      return res.status(401).json({ 
        message: 'Email not found in token',
        error: 'NO_EMAIL_IN_TOKEN',
        debug: 'Token does not contain email information'
      });
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

    if (userChildren.length === 0) {
      console.log('ℹ️ No children found for this user.');
      return res.json([]); // Return an empty array if no children are found
    }

    // Transform to expected format and include enrolled classes
    const transformedChildren = await Promise.all(userChildren.map(async (child: any) => {
      const enrollments = await storage.getEnrollmentsByChildId(child.id);
      console.log(`📚 Found ${enrollments.length} enrollments for child ${child.firstName} ${child.lastName}:`, enrollments);

      // Get class details for each enrollment
      const enrolledClasses = await Promise.all(enrollments.map(async (enrollment: any) => {
        const classData = await storage.getClassById(enrollment.classId);
        console.log(`🎓 Class data for enrollment:`, classData?.title || 'Not found');
        return classData ? {
          id: classData.id,
          title: classData.title,
          enrollmentDate: enrollment.enrollmentDate,
          status: enrollment.status || 'enrolled'
        } : null;
      }));

      return {
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
        classes: enrolledClasses.filter(Boolean), // Remove any null entries
        avatar: child.profileImage || '',
        interests: child.interests || [],
        allergies: child.allergies || 'None specified',
        specialNeeds: child.specialNeeds || '',
        school: child.school || 'American Seekers Academy'
      };
    }));

    res.json(transformedChildren);
  } catch (error) {
    console.error('❌ Error fetching parent children:', error);
    res.status(500).json({ message: 'Error fetching children' });
  }
});

export default router;