import type { Express } from "express";
import fs from "fs";
import path from "path";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import {
  e2eObjectLocalPath,
  isE2eObjectStorageStubEnabled,
  readE2eObjectMeta,
} from "../../lib/e2e-public-object-storage";

/**
 * Register object storage routes for file uploads.
 *
 * This provides example routes for the presigned URL upload flow:
 * 1. POST /api/uploads/request-url - Get a presigned URL for uploading
 * 2. The client then uploads directly to the presigned URL
 *
 * IMPORTANT: These are example routes. Customize based on your use case:
 * - Add authentication middleware for protected uploads
 * - Add file metadata storage (save to database after upload)
 * - Add ACL policies for access control
 */
export function registerObjectStorageRoutes(app: Express): void {
  const objectStorageService = new ObjectStorageService();

  /**
   * Request a presigned URL for file upload.
   *
   * Request body (JSON):
   * {
   *   "name": "filename.jpg",
   *   "size": 12345,
   *   "contentType": "image/jpeg"
   * }
   *
   * Response:
   * {
   *   "uploadURL": "https://storage.googleapis.com/...",
   *   "objectPath": "/objects/uploads/uuid"
   * }
   *
   * IMPORTANT: The client should NOT send the file to this endpoint.
   * Send JSON metadata only, then upload the file directly to uploadURL.
   */
  app.post("/api/uploads/request-url", async (req, res) => {
    try {
      const { name, size, contentType } = req.body;

      if (!name) {
        return res.status(400).json({
          error: "Missing required field: name",
        });
      }

      const uploadURL = await objectStorageService.getObjectEntityUploadURL();

      // Extract object path from the presigned URL for later reference
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

      res.json({
        uploadURL,
        objectPath,
        // Echo back the metadata for client convenience
        metadata: { name, size, contentType },
      });
    } catch (error) {
      console.error("Error generating upload URL:", error);
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  });

  /**
   * Serve uploaded objects.
   *
   * GET /objects/:objectPath(*)
   *
   * This serves files from object storage. For public files, no auth needed.
   * For protected files, add authentication middleware and ACL checks.
   */
  app.get("/objects/:objectPath(*)", async (req, res) => {
    try {
      const objectPath = `/objects/${req.params.objectPath}`;

      if (isE2eObjectStorageStubEnabled()) {
        const localPath = e2eObjectLocalPath(objectPath);
        if (localPath && fs.existsSync(localPath)) {
          const meta = readE2eObjectMeta(localPath);
          if (meta.contentType) {
            res.setHeader("Content-Type", meta.contentType);
          }
          return res.sendFile(path.resolve(localPath));
        }
      }

      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      await objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error serving object:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.status(404).json({ error: "Object not found" });
      }
      return res.status(500).json({ error: "Failed to serve object" });
    }
  });

  /**
   * Serve public object storage assets (logos, store images, etc.).
   *
   * GET /public/:objectPath(*)
   *
   * URLs stored in the DB look like `/public/store-programs/school-1/2026-06-01/uuid.jpg`.
   */
  app.get("/public/:objectPath(*)", async (req, res) => {
    try {
      const objectPath = `/public/${req.params.objectPath}`;

      if (isE2eObjectStorageStubEnabled()) {
        const localPath = e2eObjectLocalPath(objectPath);
        if (localPath && fs.existsSync(localPath)) {
          const meta = readE2eObjectMeta(localPath);
          if (meta.contentType) {
            res.setHeader("Content-Type", meta.contentType);
          }
          return res.sendFile(path.resolve(localPath));
        }
      }

      const objectFile = await objectStorageService.searchPublicObject(req.params.objectPath);
      if (!objectFile) {
        return res.status(404).json({ error: "Object not found" });
      }
      await objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error serving public object:", error);
      return res.status(500).json({ error: "Failed to serve object" });
    }
  });
}

