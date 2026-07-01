import express from 'express';
import { z } from 'zod';
import { storage } from '../../storage';
import { supabaseAuth } from '../../middleware/supabase-auth';

const router = express.Router();

const registerLogoSchema = z.object({
  schoolId: z.coerce.number().int().positive(),
  logoUrl: z.string().min(1),
});

/** Register a school logo after client presigned upload (category `logos`). */
router.post('/', supabaseAuth, async (req, res) => {
  try {
    const parsed = registerLogoSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: parsed.error.errors[0]?.message || 'Invalid request',
      });
    }

    const { schoolId, logoUrl } = parsed.data;

    if (!logoUrl.startsWith('/public/logos/')) {
      return res.status(400).json({
        success: false,
        message: 'logoUrl must be a public object storage path (/public/logos/...)',
      });
    }

    const existingSchool = await storage.getSchool(schoolId);
    if (!existingSchool) {
      return res.status(404).json({
        success: false,
        message: `School not found with ID: ${schoolId}`,
      });
    }

    const updatedSchool = await storage.updateSchool(schoolId, { logo: logoUrl });
    if (!updatedSchool) {
      return res.status(500).json({
        success: false,
        message: 'Failed to update school logo',
      });
    }

    return res.json({
      success: true,
      message: 'Logo updated successfully',
      logoUrl,
      school: updatedSchool,
    });
  } catch (error) {
    console.error('Logo register error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update school logo',
    });
  }
});

export default router;
