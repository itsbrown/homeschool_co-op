import express from "express";

const router = express.Router();

const DEPRECATED_MESSAGE =
  "Multipart uploads are deprecated. Use POST /api/unified-uploads/request-url with a category, then confirm and register.";

router.post("/knowledge-base", (_req, res) => {
  res.status(410).json({ success: false, message: DEPRECATED_MESSAGE });
});

router.post("/product-images", (_req, res) => {
  res.status(410).json({ success: false, message: DEPRECATED_MESSAGE });
});

router.get("/product-images/:filename", (_req, res) => {
  res.status(410).json({ message: DEPRECATED_MESSAGE });
});

router.get("/:filename", (_req, res) => {
  res.status(410).json({ message: DEPRECATED_MESSAGE });
});

export default router;
