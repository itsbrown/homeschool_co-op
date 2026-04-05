---
name: asa-file-storage
description: Unified file upload system, Replit App Storage (object storage), presigned URL workflow, category-based validation, public vs private paths, download/share patterns, and legacy upload handling for the ASA Learning Platform. Use when working with file uploads, downloads, object storage, presigned URLs, or document management.
---

# ASA File Uploads & Object Storage

## Core Rules

- **Replit App Storage** (Google Cloud Storage via sidecar) — all file storage uses this, no local filesystem persistence
- **Category-based validation** — every upload must specify a category that determines size limits, allowed types, and storage path
- **Presigned URLs** — uploads and downloads use time-limited signed URLs (15-minute TTL for uploads)
- **Public vs private paths** — public files served directly, private files require presigned download URLs
- **Never store files on local filesystem** — Replit's ephemeral filesystem loses data on restart

## Object Storage Architecture

### Sidecar Integration
```
Client → Backend API → Replit Sidecar (127.0.0.1:1106) → Google Cloud Storage
```
- `ObjectStorageService` in `server/replit_integrations/object_storage/objectStorage.ts` wraps GCS client
- Sidecar handles authentication tokens automatically
- Environment variables:
  - `PUBLIC_OBJECT_SEARCH_PATHS` — comma-separated paths for public asset lookup
  - `PRIVATE_OBJECT_DIR` — base directory for private objects
  - `DEFAULT_OBJECT_STORAGE_BUCKET_ID` — bucket identifier

### Directory Structure
```
bucket/
├── public/                    ← PUBLIC_OBJECT_SEARCH_PATHS
│   ├── logos/                 ← School logos (publicly accessible)
│   ├── fundraiser-products/   ← Product images (publicly accessible)
│   └── ...
└── .private/                  ← PRIVATE_OBJECT_DIR
    ├── documents/             ← School documents, waivers
    ├── signatures/            ← Waiver signatures
    ├── knowledge-base/        ← KB content files
    ├── assessments/           ← Student assessment files
    ├── profile-photos/        ← User profile photos
    └── ...
```

## Upload Categories

Each category defines validation rules and storage path:

| Category | Max Size | Allowed Types | Public | Folder |
|----------|----------|---------------|--------|--------|
| `signatures` | 2 MB | PNG, JPEG, SVG | No | `signatures/` |
| `logos` | 5 MB | PNG, JPEG, SVG, WebP | Yes | `logos/` |
| `documents` | 25 MB | PDF, DOC, DOCX, PNG, JPEG, GIF | No | `documents/` |
| `knowledgeBase` | 50 MB | PDF, DOC, DOCX, TXT, PNG, JPEG | No | `knowledge-base/` |
| `fundraiserProducts` | 5 MB | PNG, JPEG, WebP | Yes | `fundraiser-products/` |
| `assessments` | 10 MB | PDF, PNG, JPEG | No | `assessments/` |
| `profilePhotos` | 5 MB | PNG, JPEG, WebP | No | `profile-photos/` |

## Upload Flow (Presigned URL Pattern)

### Step 1: Request Upload URL
```
POST /api/unified-uploads/presigned-url
Body: { category, filename, contentType, sizeBytes }
Response: { uploadURL, objectPath, validation }
```
- Server validates category, size, and content type
- Generates UUID-based storage path to prevent collisions
- Returns a time-limited presigned PUT URL (15 min TTL)

### Step 2: Client Uploads Directly to Storage
```
PUT <uploadURL>
Headers: Content-Type: <mimetype>
Body: <file binary>
```
- Client uploads directly to GCS via presigned URL — no backend proxy needed
- Reduces server load and avoids request body size limits

### Step 3: Confirm Upload (Save Reference)
```
POST /api/unified-uploads/confirm
Body: { objectPath, category, metadata }
```
- Backend records the file reference in the database
- Sets ACL policy (public or private) based on category

## Download & Access

### Public Files
- Served directly via public object search paths
- URL pattern: `/objects/public/<folder>/<file>`
- No authentication required

### Private Files
- Require presigned download URL
- Backend generates time-limited GET URL
- `getDownloadUrl(objectPath)` → returns signed URL with short TTL

### Legacy Upload Paths
Two path patterns exist in the codebase:
- **New uploads**: `/objects/.private/documents/...` (standard private path)
- **Legacy uploads**: Various older patterns from before the unified upload system
- When reading file paths, handle both patterns gracefully

### Knowledge Base File Storage Formats
Knowledge base files exist in **three different storage formats** depending on when and how they were uploaded:

| Format | Example | How to Read |
|--------|---------|-------------|
| **Base64 data URI** | `data:application/pdf;base64,JVBERi0...` | Decode base64, parse with pdf-parse for PDFs |
| **Local `/uploads/` path** | `/uploads/1771588493427_Macaronis_Class_Description.pdf` | Read from disk at `process.cwd() + path` |
| **Object Storage path** | `/objects/.private/knowledge-base/uuid.pdf` | Requires Object Storage sidecar API, cannot read from disk |

**Important**: You cannot assume a single access method works for all KB files. The `extractContentFromFile()` method in `knowledgeBaseProcessor.ts` handles all three formats.

### PDF Text Extraction
PDF files are binary and cannot be read as UTF-8 text. Use the `pdf-parse` library:
```typescript
// CRITICAL: Never import pdf-parse at the top level — it crashes in ESM/tsx
// Always use dynamic import of the internal module:
const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default;
const data = await pdfParse(buffer); // buffer is a Buffer of the PDF bytes
const text = data.text; // extracted plain text
```

**Why the workaround?** The `pdf-parse` package's `index.js` checks `!module.parent` to detect "debug mode." In ESM/tsx environments, `module.parent` is always null, so it tries to read a test PDF file (`./test/data/05-versions-space.pdf`) at import time and crashes with `ENOENT`. Importing `pdf-parse/lib/pdf-parse.js` directly bypasses this bug.

## ACL (Access Control)

```typescript
await fileUploadService.setObjectAcl(objectPath, ownerId, isPublic);
```
- `objectAcl.ts` manages per-object access policies
- Owner-based access for private files
- Public visibility for logos, product images, etc.

## FileUploadService API

```typescript
import { fileUploadService } from '../services/fileUploadService';

fileUploadService.validateUpload(options)    // Check category, size, type
fileUploadService.getUploadUrl(options)      // Get presigned PUT URL
fileUploadService.setObjectAcl(path, owner, isPublic)  // Set access
fileUploadService.deleteObject(path)         // Delete from storage
fileUploadService.uploadBuffer(buffer, ...)  // Direct server-side upload
```

### Upload via `apiRequest` (Frontend)
```typescript
const formData = new FormData();
formData.append('file', file);
formData.append('category', 'documents');
await apiRequest('POST', '/api/unified-uploads/upload', formData);
```
- `apiRequest` auto-detects `FormData` and omits `Content-Type` header (see `asa-frontend-conventions`)

## School Documents & Parent Targeting

School admins upload documents to `school_documents`. Each document has two visibility paths that control which parents can see it.

### Document Visibility Model

| Field | Meaning |
|-------|---------|
| `isPublished` | Document is visible to anyone with access (must be `true`) |
| `isArchived` | Soft-delete flag — archived docs are excluded from all listings |
| `visibleToAll` | If `true`, visible to every parent in the school without extra targeting |

**Targeted (per-parent) visibility** is resolved through the `notifications` and `notification_recipients` tables:
- When a document is published with specific recipients, `sendDocumentNotification()` in `server/api/schools/documents.ts` creates a `notification` record with `targetData: { documentId: <id>, ... }`
- For each recipient, a `notification_recipients` row is created linking the notification to that parent's `userId`
- The `documentId` key inside `notifications.target_data` (JSONB) is the authoritative link — no title matching is used

### Admin Endpoint: Parent Document List
`GET /api/schools/parents/:parentId/documents` (in `server/api/schools.ts`)

- Auth: `supabaseAuth` + `requireRole(['schoolAdmin', 'admin', 'superAdmin'])`
- School context is derived from `req.auth.schoolId` (set by middleware) — never accepted from the client
- Verifies the parent belongs to the admin's school before querying
- Resolves **two visibility paths** and merges them:
  1. **`visibleToAll`** — direct flag on `school_documents`
  2. **Notification-targeted** — raw SQL on `notification_recipients` / `notifications` extracts `CAST(n.target_data->>'documentId' AS INTEGER)` for the given `parentId`
- Returns only published (`isPublished = true`), non-archived (`isArchived = false`) documents
- Safe metadata fields only — `filePath` and other storage internals are never exposed in the response

### Document Download Flow
`GET /api/schools/documents/:id/download` (router: `server/api/schools/documents.ts`, mounted at `/api/schools/documents` via `server/api/schools.ts`)

1. Authenticates user (`supabaseAuth`) and verifies school membership (or enrollment-based access for multi-school parents)
2. Checks `document.filePath` for `/objects/` prefix to distinguish object storage vs. legacy local paths
3. **Object storage** (new uploads): streams file directly via `ObjectStorageService.downloadObject()` with `Content-Disposition: attachment` — no presigned URL is generated; the backend proxies the byte stream to the client
4. **Legacy** (old uploads): reads from local filesystem at `process.cwd() + filePath`
5. Records a download event via `storage.createDocumentView()` (fire-and-forget, does not block response)

Note: this endpoint streams from object storage rather than returning a presigned URL — the presigned URL pattern is used for uploads (via `fileUploadService.getUploadUrl()`), not for document downloads.

### Key Files
- `server/api/schools.ts` — `GET /api/schools/parents/:parentId/documents` endpoint
- `server/api/schools/documents.ts` — upload, `sendDocumentNotification`, download, published listing
- `client/src/pages/schools/ParentProfilePage.tsx` — admin UI that displays the Documents tab for a parent profile

## Common Pitfalls

- **File too large rejected** → didn't check category's `maxSizeBytes` before upload → validate client-side before requesting presigned URL
- **Wrong content type rejected** → sent file with mismatched MIME type → verify `contentType` matches the actual file
- **Presigned URL expired** → upload took longer than 15 minutes → request a new presigned URL and retry
- **Private file 403** → tried to access private file without presigned download URL → use `getDownloadUrl()` for private files
- **Legacy path not found** → old upload path format doesn't match new pattern → check for both `/objects/.private/` prefix and raw paths without prefix when resolving stored file references
- **File lost after restart** → stored file on local filesystem instead of object storage → always use the presigned URL upload flow
- **pdf-parse crashes server on startup** → imported `pdf-parse` at top level → use dynamic import: `(await import('pdf-parse/lib/pdf-parse.js')).default` (see "PDF Text Extraction" section)
- **PDF read as garbled text** → tried to read PDF with `fs.readFileSync(path, 'utf-8')` → PDFs are binary, must use `pdf-parse` to extract text
- **KB file content empty** → assumed all files are in Object Storage or all are local → KB files exist in 3 formats (data URIs, `/uploads/`, Object Storage) — handle all three
- **CSV mapping shows garbled RTF content** → user uploaded an RTF file (saved from Mac TextEdit) instead of a real CSV → validate file content before parsing: check for `{\rtf1` header (RTF), `PK` header (DOCX/XLSX), or `\xd0\xcf` (DOC) and show a clear error like "This file is in RTF format, not CSV. Please re-export as a .csv file."
- **Parent document list returns too many or too few documents** → check both `visibleToAll` flag and notification-targeted lookup — both paths must be queried and merged; relying on only one path will produce incorrect results

## Best Practices

### Do
- Always validate file content format before parsing — check for non-CSV headers (`{\rtf1`, `PK`, binary signatures) and reject with a user-friendly error
- Always validate uploads against category config before requesting a presigned URL
- Always use the presigned URL pattern — never proxy file uploads through the backend
- Always set ACL policy after upload confirmation (public for logos/products, private for documents)
- Always use `randomUUID()` in storage paths to prevent filename collisions
- Always handle both legacy and new upload path formats when reading stored paths
- Always use `apiRequest` with `FormData` for frontend uploads — it handles auth headers and content type automatically

### Don't
- Don't store files on the local filesystem — they'll be lost on restart
- Don't proxy large file uploads through the Express backend — use presigned URLs for direct-to-storage uploads
- Don't expose private file paths directly — always generate presigned download URLs
- Don't skip category validation — it enforces size limits and allowed types
- Don't hardcode storage paths — use `FileUploadService.buildStoragePath()` for consistent path generation
- Don't forget to delete objects from storage when the associated database record is deleted

## Key Files
- `server/services/fileUploadService.ts` — `FileUploadService` class, category configs, validation, presigned URLs
- `server/replit_integrations/object_storage/objectStorage.ts` — `ObjectStorageService`, GCS client, bucket operations
- `server/replit_integrations/object_storage/objectAcl.ts` — ACL policy management
- `server/replit_integrations/object_storage/routes.ts` — object storage HTTP routes
- `server/api/unified-uploads.ts` — unified upload API endpoints
- `server/api/file-upload.ts` — legacy file upload endpoints
- `server/api/knowledge-base-upload.ts` — knowledge base file upload
- `server/api/schools/documents.ts` — school document management
- `server/api/schools/upload-logo.ts` — school logo upload
