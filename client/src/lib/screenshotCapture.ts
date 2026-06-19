import html2canvas from 'html2canvas';

/** Capture the visible page (excluding fixed help widgets) as a PNG blob. */
export async function capturePageScreenshot(): Promise<Blob> {
  const hideSelectors = [
    '[data-testid="help-button"]',
    '[data-testid="payment-help-button"]',
    '[data-testid="payment-help-panel"]',
  ];

  const hidden: { el: HTMLElement; prev: string }[] = [];
  for (const selector of hideSelectors) {
    document.querySelectorAll<HTMLElement>(selector).forEach((el) => {
      hidden.push({ el, prev: el.style.visibility });
      el.style.visibility = 'hidden';
    });
  }

  try {
    const canvas = await html2canvas(document.body, {
      useCORS: true,
      allowTaint: true,
      logging: false,
      scale: Math.min(window.devicePixelRatio || 1, 2),
      windowWidth: document.documentElement.scrollWidth,
      windowHeight: document.documentElement.scrollHeight,
    });

    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Failed to capture screenshot'))),
        'image/png',
        0.92,
      );
    });
  } finally {
    for (const { el, prev } of hidden) {
      el.style.visibility = prev;
    }
  }
}

export function blobToPreviewUrl(blob: Blob): string {
  return URL.createObjectURL(blob);
}
