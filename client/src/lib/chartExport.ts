import html2canvas from "html2canvas";

export type ChartExportPreset = "social_square" | "social_landscape";

const PRESETS: Record<ChartExportPreset, { width: number; height: number }> = {
  social_square: { width: 1080, height: 1080 },
  social_landscape: { width: 1200, height: 630 },
};

export async function captureChartElement(
  element: HTMLElement,
  preset: ChartExportPreset = "social_square",
): Promise<Blob> {
  const { width, height } = PRESETS[preset];
  const canvas = await html2canvas(element, {
    backgroundColor: "#ffffff",
    scale: 2,
    width,
    height,
    useCORS: true,
    logging: false,
  });

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Failed to export chart"))),
      "image/png",
      0.92,
    );
  });
}

export function downloadChartBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
