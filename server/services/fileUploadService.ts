import { ObjectStorageService, objectStorageClient } from "../replit_integrations/object_storage";
import { setObjectAclPolicy } from "../replit_integrations/object_storage/objectAcl";
import { randomUUID } from "crypto";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

export interface UploadCategoryConfig {
  maxSizeBytes: number;
  allowedTypes: string[];
  folder: string;
  public: boolean;
  description?: string;
}

export const uploadCategories: Record<string, UploadCategoryConfig> = {
  signatures: {
    maxSizeBytes: 2 * 1024 * 1024,
    allowedTypes: ["image/png", "image/jpeg", "image/svg+xml"],
    folder: "signatures",
    public: false,
    description: "Waiver and document signatures",
  },
  logos: {
    maxSizeBytes: 5 * 1024 * 1024,
    allowedTypes: ["image/png", "image/jpeg", "image/svg+xml", "image/webp"],
    folder: "logos",
    public: true,
    description: "School and organization logos",
  },
  documents: {
    maxSizeBytes: 10 * 1024 * 1024,
    allowedTypes: ["application/pdf", "image/png", "image/jpeg"],
    folder: "documents",
    public: false,
    description: "School documents, waivers, policies",
  },
  knowledgeBase: {
    maxSizeBytes: 50 * 1024 * 1024,
    allowedTypes: [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
      "image/png",
      "image/jpeg",
    ],
    folder: "knowledge-base",
    public: false,
    description: "Knowledge base content files",
  },
  fundraiserProducts: {
    maxSizeBytes: 5 * 1024 * 1024,
    allowedTypes: ["image/png", "image/jpeg", "image/webp"],
    folder: "fundraiser-products",
    public: true,
    description: "Fundraiser product images",
  },
  assessments: {
    maxSizeBytes: 10 * 1024 * 1024,
    allowedTypes: ["application/pdf", "image/png", "image/jpeg"],
    folder: "assessments",
    public: false,
    description: "Student assessment files",
  },
  profilePhotos: {
    maxSizeBytes: 5 * 1024 * 1024,
    allowedTypes: ["image/png", "image/jpeg", "image/webp"],
    folder: "profile-photos",
    public: false,
    description: "User profile photos",
  },
};

export type UploadCategory = keyof typeof uploadCategories;

export interface UploadResult {
  url: string;
  objectPath: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: Date;
  category: string;
  filename: string;
}

export interface UploadOptions {
  category: UploadCategory;
  filename: string;
  contentType: string;
  sizeBytes: number;
  userId?: number;
  schoolId?: number;
  metadata?: Record<string, string>;
}

class FileUploadService {
  private objectStorageService: ObjectStorageService;

  constructor() {
    this.objectStorageService = new ObjectStorageService();
  }

  validateUpload(options: UploadOptions): { valid: boolean; error?: string } {
    const categoryConfig = uploadCategories[options.category];
    if (!categoryConfig) {
      return { valid: false, error: `Unknown upload category: ${options.category}` };
    }

    if (options.sizeBytes > categoryConfig.maxSizeBytes) {
      const maxMB = Math.round(categoryConfig.maxSizeBytes / (1024 * 1024));
      return { valid: false, error: `File size exceeds maximum of ${maxMB}MB for ${options.category}` };
    }

    const isTypeAllowed = categoryConfig.allowedTypes.some((allowed) => {
      if (allowed.endsWith("/*")) {
        const baseType = allowed.replace("/*", "");
        return options.contentType.startsWith(baseType);
      }
      return options.contentType === allowed;
    });

    if (!isTypeAllowed) {
      return {
        valid: false,
        error: `File type ${options.contentType} not allowed for ${options.category}. Allowed: ${categoryConfig.allowedTypes.join(", ")}`,
      };
    }

    return { valid: true };
  }

  async getUploadUrl(options: UploadOptions): Promise<{
    uploadURL: string;
    objectPath: string;
    validation: { valid: boolean; error?: string };
  }> {
    const validation = this.validateUpload(options);
    if (!validation.valid) {
      return { uploadURL: "", objectPath: "", validation };
    }

    const categoryConfig = uploadCategories[options.category];
    const objectId = randomUUID();
    const ext = this.getExtension(options.filename);
    const storagePath = this.buildStoragePath(options, objectId, ext);

    const privateObjectDir = this.objectStorageService.getPrivateObjectDir();
    const fullPath = categoryConfig.public
      ? `${this.getPublicBasePath()}/${storagePath}`
      : `${privateObjectDir}/${storagePath}`;

    const { bucketName, objectName } = this.parseObjectPath(fullPath);
    
    const uploadURL = await this.signObjectURL({
      bucketName,
      objectName,
      method: "PUT",
      ttlSec: 900,
    });

    const objectPath = categoryConfig.public
      ? `/public/${storagePath}`
      : `/objects/${storagePath}`;

    return { uploadURL, objectPath, validation };
  }

  async setObjectAcl(objectPath: string, ownerId: string, isPublic: boolean): Promise<void> {
    try {
      const objectFile = await this.objectStorageService.getObjectEntityFile(objectPath);
      await setObjectAclPolicy(objectFile, {
        owner: ownerId,
        visibility: isPublic ? "public" : "private",
      });
    } catch (error) {
      console.error("Failed to set object ACL:", error);
    }
  }

  async deleteObject(objectPath: string): Promise<boolean> {
    try {
      const objectFile = await this.objectStorageService.getObjectEntityFile(objectPath);
      await objectFile.delete();
      return true;
    } catch (error) {
      console.error("Failed to delete object:", error);
      return false;
    }
  }

  getPublicUrl(objectPath: string): string {
    if (objectPath.startsWith("/public/")) {
      return objectPath;
    }
    return objectPath;
  }

  getCategoryConfig(category: UploadCategory): UploadCategoryConfig | undefined {
    return uploadCategories[category];
  }

  listCategories(): Array<{ name: string; config: UploadCategoryConfig }> {
    return Object.entries(uploadCategories).map(([name, config]) => ({
      name,
      config,
    }));
  }

  private buildStoragePath(options: UploadOptions, objectId: string, ext: string): string {
    const categoryConfig = uploadCategories[options.category];
    const parts = [categoryConfig.folder];
    
    if (options.schoolId) {
      parts.push(`school-${options.schoolId}`);
    }
    
    const timestamp = new Date().toISOString().split("T")[0];
    parts.push(timestamp);
    parts.push(`${objectId}${ext}`);
    
    return parts.join("/");
  }

  private getExtension(filename: string): string {
    const lastDot = filename.lastIndexOf(".");
    return lastDot > 0 ? filename.slice(lastDot) : "";
  }

  private getPublicBasePath(): string {
    const paths = this.objectStorageService.getPublicObjectSearchPaths();
    return paths[0] || "";
  }

  private parseObjectPath(path: string): { bucketName: string; objectName: string } {
    if (!path.startsWith("/")) {
      path = `/${path}`;
    }
    const pathParts = path.split("/");
    if (pathParts.length < 3) {
      throw new Error("Invalid path: must contain at least a bucket name");
    }
    return {
      bucketName: pathParts[1],
      objectName: pathParts.slice(2).join("/"),
    };
  }

  private async signObjectURL({
    bucketName,
    objectName,
    method,
    ttlSec,
  }: {
    bucketName: string;
    objectName: string;
    method: "GET" | "PUT" | "DELETE" | "HEAD";
    ttlSec: number;
  }): Promise<string> {
    const request = {
      bucket_name: bucketName,
      object_name: objectName,
      method,
      expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
    };
    const response = await fetch(`${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!response.ok) {
      throw new Error(`Failed to sign object URL: ${response.status}`);
    }
    const { signed_url: signedURL } = await response.json();
    return signedURL;
  }
}

export const fileUploadService = new FileUploadService();
