import { uploadFile } from "@/lib/uploadClient";

export type KnowledgeBaseUploadedFile = {
  url: string;
  type: string;
  name: string;
  size: number;
  uploadedAt: string;
};

function fileExtension(name: string): string {
  const lastDot = name.lastIndexOf(".");
  return lastDot > 0 ? name.slice(lastDot + 1).toLowerCase() : "unknown";
}

export async function uploadKnowledgeBaseFiles(
  files: File[],
  onProgress?: (fileIndex: number, progress: number) => void,
): Promise<KnowledgeBaseUploadedFile[]> {
  const uploaded: KnowledgeBaseUploadedFile[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const result = await uploadFile(file, {
      category: "knowledgeBase",
      onProgress: (p) => onProgress?.(i, p),
    });
    uploaded.push({
      url: result.objectPath,
      type: fileExtension(file.name),
      name: file.name,
      size: file.size,
      uploadedAt: new Date().toISOString(),
    });
  }

  return uploaded;
}
