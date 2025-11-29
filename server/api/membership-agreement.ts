import { Router } from 'express';
import { storage } from '../storage';
import { supabaseAuth } from '../middleware/supabase-auth';
import { insertMembershipAgreementSchema } from '../../shared/schema';
import { z } from 'zod';

const router = Router();

// Get membership agreement template for a school (public endpoint for viewing)
router.get('/schools/:schoolId/membership-agreement', async (req, res) => {
  try {
    const schoolId = parseInt(req.params.schoolId);
    
    if (isNaN(schoolId)) {
      return res.status(400).json({ message: 'Invalid school ID' });
    }

    const school = await storage.getSchool(schoolId);
    if (!school) {
      return res.status(404).json({ message: 'School not found' });
    }

    // Return agreement template and version
    return res.json({
      schoolId: school.id,
      schoolName: school.name,
      agreementTemplate: school.membershipAgreementTemplate || getDefaultAgreementTemplate(school.name),
      agreementVersion: school.membershipAgreementVersion || '1.0',
      updatedAt: school.membershipAgreementUpdatedAt
    });
  } catch (error: any) {
    console.error('Error fetching membership agreement template:', error);
    return res.status(500).json({ message: 'Failed to fetch agreement template' });
  }
});

// Sign membership agreement (requires authentication)
router.post('/parent/agreements/sign', supabaseAuth, async (req: any, res) => {
  try {
    const userEmail = req.user?.email;
    
    if (!userEmail) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const user = await storage.getUserByEmail(userEmail);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Validate request body
    const signatureSchema = z.object({
      schoolId: z.number(),
      signatoryName: z.string().min(2, 'Please enter your full legal name'),
      membershipEnrollmentId: z.number().optional(),
      agreedToTerms: z.boolean().refine(val => val === true, {
        message: 'You must agree to the terms'
      })
    });

    const validationResult = signatureSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ 
        message: 'Validation failed',
        errors: validationResult.error.flatten().fieldErrors
      });
    }

    const { schoolId, signatoryName, membershipEnrollmentId } = validationResult.data;

    // Get the school and its current agreement
    const school = await storage.getSchool(schoolId);
    if (!school) {
      return res.status(404).json({ message: 'School not found' });
    }

    const agreementTemplate = school.membershipAgreementTemplate || getDefaultAgreementTemplate(school.name);
    const agreementVersion = school.membershipAgreementVersion || '1.0';

    // Check if user has already signed this version
    const existingAgreement = await storage.getLatestMembershipAgreementByParentAndSchool(user.id, schoolId);
    if (existingAgreement && existingAgreement.agreementVersion === agreementVersion) {
      return res.status(400).json({ 
        message: 'You have already signed the current version of this agreement',
        agreementId: existingAgreement.id
      });
    }

    // Get IP address and user agent for audit trail
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    // Create the signed agreement record
    const agreementData = {
      schoolId,
      parentUserId: user.id,
      membershipEnrollmentId: membershipEnrollmentId || null,
      signatoryName,
      agreementVersion,
      agreementContent: agreementTemplate,
      ipAddress: typeof ipAddress === 'string' ? ipAddress : ipAddress[0],
      userAgent
    };

    const signedAgreement = await storage.createMembershipAgreement(agreementData);

    console.log(`✅ Membership agreement signed by ${userEmail} for school ${schoolId}`);

    return res.status(201).json({
      message: 'Agreement signed successfully',
      agreement: {
        id: signedAgreement.id,
        signatoryName: signedAgreement.signatoryName,
        signedAt: signedAgreement.signedAt,
        agreementVersion: signedAgreement.agreementVersion
      }
    });
  } catch (error: any) {
    console.error('Error signing membership agreement:', error);
    return res.status(500).json({ message: 'Failed to sign agreement' });
  }
});

// Get parent's signed documents
router.get('/parent/documents', supabaseAuth, async (req: any, res) => {
  try {
    const userEmail = req.user?.email;
    
    if (!userEmail) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const user = await storage.getUserByEmail(userEmail);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Get all signed agreements for this parent
    const agreements = await storage.getMembershipAgreementsByParentId(user.id);

    // Enrich with school names
    const documentsWithSchools = await Promise.all(
      agreements.map(async (agreement) => {
        const school = await storage.getSchool(agreement.schoolId);
        return {
          id: agreement.id,
          type: 'membership_agreement',
          title: `Membership Agreement - ${school?.name || 'Unknown School'}`,
          schoolName: school?.name || 'Unknown School',
          signedAt: agreement.signedAt,
          signatoryName: agreement.signatoryName,
          agreementVersion: agreement.agreementVersion,
          membershipEnrollmentId: agreement.membershipEnrollmentId
        };
      })
    );

    return res.json({
      documents: documentsWithSchools,
      total: documentsWithSchools.length
    });
  } catch (error: any) {
    console.error('Error fetching parent documents:', error);
    return res.status(500).json({ message: 'Failed to fetch documents' });
  }
});

// Get a specific signed agreement (for viewing/downloading)
router.get('/parent/documents/:id', supabaseAuth, async (req: any, res) => {
  try {
    const userEmail = req.user?.email;
    const agreementId = parseInt(req.params.id);
    
    if (!userEmail) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (isNaN(agreementId)) {
      return res.status(400).json({ message: 'Invalid document ID' });
    }

    const user = await storage.getUserByEmail(userEmail);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const agreement = await storage.getMembershipAgreementById(agreementId);
    if (!agreement) {
      return res.status(404).json({ message: 'Document not found' });
    }

    // Verify ownership
    if (agreement.parentUserId !== user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const school = await storage.getSchool(agreement.schoolId);

    return res.json({
      id: agreement.id,
      type: 'membership_agreement',
      title: `Membership Agreement - ${school?.name || 'Unknown School'}`,
      schoolName: school?.name || 'Unknown School',
      signedAt: agreement.signedAt,
      signatoryName: agreement.signatoryName,
      agreementVersion: agreement.agreementVersion,
      agreementContent: agreement.agreementContent,
      membershipEnrollmentId: agreement.membershipEnrollmentId
    });
  } catch (error: any) {
    console.error('Error fetching document:', error);
    return res.status(500).json({ message: 'Failed to fetch document' });
  }
});

// Check if parent has signed current agreement version
router.get('/parent/agreements/check/:schoolId', supabaseAuth, async (req: any, res) => {
  try {
    const userEmail = req.user?.email;
    const schoolId = parseInt(req.params.schoolId);
    
    if (!userEmail) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (isNaN(schoolId)) {
      return res.status(400).json({ message: 'Invalid school ID' });
    }

    const user = await storage.getUserByEmail(userEmail);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const school = await storage.getSchool(schoolId);
    if (!school) {
      return res.status(404).json({ message: 'School not found' });
    }

    const currentVersion = school.membershipAgreementVersion || '1.0';
    const hasSigned = await storage.hasSignedCurrentAgreement(user.id, schoolId, currentVersion);
    
    let latestAgreement = null;
    if (hasSigned) {
      latestAgreement = await storage.getLatestMembershipAgreementByParentAndSchool(user.id, schoolId);
    }

    return res.json({
      hasSigned,
      currentVersion,
      latestSignedVersion: latestAgreement?.agreementVersion || null,
      signedAt: latestAgreement?.signedAt || null,
      requiresNewSignature: !hasSigned && (school.membershipAgreementTemplate !== null)
    });
  } catch (error: any) {
    console.error('Error checking agreement status:', error);
    return res.status(500).json({ message: 'Failed to check agreement status' });
  }
});

// Helper function to generate a default agreement template
function getDefaultAgreementTemplate(schoolName: string): string {
  return `
# ${schoolName} Membership Agreement

## Terms and Conditions

By signing this membership agreement, I hereby acknowledge and agree to the following terms:

### 1. Membership Period
This membership is valid for one (1) year from the date of payment. Membership automatically expires at the end of the membership period unless renewed.

### 2. Payment Terms
- Membership fees are non-refundable unless otherwise specified by ${schoolName}.
- All payments must be made in full to activate membership benefits.

### 3. Member Responsibilities
As a member, I agree to:
- Follow all school policies and guidelines
- Treat staff, educators, and other members with respect
- Ensure my children follow the school's code of conduct
- Provide accurate and up-to-date contact information

### 4. School's Rights
${schoolName} reserves the right to:
- Modify membership benefits with reasonable notice
- Suspend or terminate membership for policy violations
- Update these terms with advance notification to members

### 5. Liability
${schoolName} is not liable for any injuries or damages occurring during school activities, except where such liability cannot be legally excluded.

### 6. Privacy
Member information will be handled in accordance with our privacy policy. We will not share personal information with third parties without consent, except as required by law.

### 7. Communication
By becoming a member, I consent to receive communications from ${schoolName} regarding school activities, updates, and important announcements via email, phone, or other provided contact methods.

---

By signing below, I confirm that I have read, understood, and agree to be bound by these terms and conditions.
`.trim();
}

export default router;
