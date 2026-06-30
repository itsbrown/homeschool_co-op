import path from 'path';
import fs from 'fs';
import type { UploadedFile } from 'express-fileupload';

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;

export function saveStoreImageFile(
  imageFile: UploadedFile,
  subdir: 'store-products' | 'store-programs',
  prefix: string,
): { imageUrl: string; filename: string } {
  if (!ALLOWED_MIME.includes(imageFile.mimetype)) {
    throw new Error('Only image files are allowed (JPEG, PNG, GIF, WebP)');
  }
  if (imageFile.size > MAX_BYTES) {
    throw new Error('File too large. Maximum size is 5MB.');
  }

  const uploadDir = path.join(process.cwd(), 'uploads', subdir);
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  const ext = path.extname(imageFile.name).toLowerCase();
  const filename = `${prefix}-${timestamp}-${randomSuffix}${ext}`;
  const filepath = path.join(uploadDir, filename);

  return {
    imageUrl: `/uploads/${subdir}/${filename}`,
    filename,
  };
}

export async function persistStoreImageFile(
  imageFile: UploadedFile,
  subdir: 'store-products' | 'store-programs',
  prefix: string,
): Promise<{ imageUrl: string; filename: string; size: number; mimetype: string }> {
  const { imageUrl, filename } = saveStoreImageFile(imageFile, subdir, prefix);
  const filepath = path.join(process.cwd(), 'uploads', subdir, filename);
  await imageFile.mv(filepath);
  return { imageUrl, filename, size: imageFile.size, mimetype: imageFile.mimetype };
}
