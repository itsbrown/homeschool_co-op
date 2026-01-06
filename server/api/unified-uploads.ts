import { Router, Request, Response } from "express";
import { fileUploadService, uploadCategories, UploadCategory } from "../services/fileUploadService";
import { supabaseAuth } from "../middleware/supabase-auth";

const router = Router();

router.post("/request-url", supabaseAuth, async (req: Request, res: Response) => {
  try {
    const { name, size, contentType, category, schoolId } = req.body;

    if (!name || !size || !contentType || !category) {
      return res.status(400).json({
        error: "Missing required fields: name, size, contentType, category",
      });
    }

    if (!uploadCategories[category as UploadCategory]) {
      return res.status(400).json({
        error: `Invalid category: ${category}. Valid categories: ${Object.keys(uploadCategories).join(", ")}`,
      });
    }

    const result = await fileUploadService.getUploadUrl({
      category: category as UploadCategory,
      filename: name,
      contentType,
      sizeBytes: size,
      userId: req.user?.id,
      schoolId: schoolId ? parseInt(schoolId) : undefined,
    });

    if (!result.validation.valid) {
      return res.status(400).json({ error: result.validation.error });
    }

    res.json({
      uploadURL: result.uploadURL,
      objectPath: result.objectPath,
      metadata: { name, size, contentType, category },
    });
  } catch (error) {
    console.error("Error generating upload URL:", error);
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

router.post("/confirm", supabaseAuth, async (req: Request, res: Response) => {
  try {
    const { objectPath, category, isPublic } = req.body;

    if (!objectPath) {
      return res.status(400).json({ error: "Missing objectPath" });
    }

    const categoryConfig = fileUploadService.getCategoryConfig(category as UploadCategory);
    const visibility = isPublic !== undefined ? isPublic : categoryConfig?.public ?? false;

    await fileUploadService.setObjectAcl(
      objectPath,
      String(req.user?.id || "anonymous"),
      visibility
    );

    res.json({ success: true, objectPath, public: visibility });
  } catch (error) {
    console.error("Error confirming upload:", error);
    res.status(500).json({ error: "Failed to confirm upload" });
  }
});

router.delete("/:objectPath(*)", supabaseAuth, async (req: Request, res: Response) => {
  try {
    const objectPath = `/${req.params.objectPath}`;
    const deleted = await fileUploadService.deleteObject(objectPath);
    
    if (deleted) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: "Object not found or could not be deleted" });
    }
  } catch (error) {
    console.error("Error deleting object:", error);
    res.status(500).json({ error: "Failed to delete object" });
  }
});

router.get("/categories", (req: Request, res: Response) => {
  const categories = fileUploadService.listCategories();
  res.json({ categories });
});

router.get("/category/:category", (req: Request, res: Response) => {
  const { category } = req.params;
  const config = fileUploadService.getCategoryConfig(category as UploadCategory);
  
  if (!config) {
    return res.status(404).json({ error: `Category not found: ${category}` });
  }
  
  res.json({ category, config });
});

export default router;
