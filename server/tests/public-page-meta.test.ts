import { describe, expect, it } from "@jest/globals";
import {
  applyPublicMeta,
  publicPageUrl,
  absolutePublicImage,
  ROBOTS_TXT,
  PUBLIC_SITE_ORIGIN,
} from "../lib/public-page-meta";

const HTML = `<!DOCTYPE html><html><head>
<title>American Seekers Academy - Adaptive Learning Platform</title>
<meta name="description" content="Old" />
<meta property="og:title" content="American Seekers Academy" />
<meta property="og:description" content="Old" />
<meta property="og:url" content="https://americanseekersacademy.com" />
</head><body></body></html>`;

describe("public page meta", () => {
  it("points og:url at the accounts host and adds og:image", () => {
    const html = applyPublicMeta(HTML, {
      title: "Notebook · North Co-op",
      description: "A store item",
      url: publicPageUrl("/store/north/notebook"),
      image: absolutePublicImage("/public/logos/north.png"),
    });
    expect(html).toContain("<title>Notebook · North Co-op</title>");
    expect(html).toContain('property="og:url" content="https://accounts.americanseekersacademy.com/store/north/notebook"');
    expect(html).toContain('property="og:image" content="https://accounts.americanseekersacademy.com/public/logos/north.png"');
    expect(html).not.toContain("https://americanseekersacademy.com\"");
  });

  it("uses the default image when the school has no logo", () => {
    expect(absolutePublicImage(null)).toBe(`${PUBLIC_SITE_ORIGIN}/og-default.png`);
  });

  it("disallows private app routes and publishes the sitemap", () => {
    expect(ROBOTS_TXT).toContain("Disallow: /api/");
    expect(ROBOTS_TXT).toContain("Disallow: /schools/");
    expect(ROBOTS_TXT).toContain("Disallow: /parent");
    expect(ROBOTS_TXT).toContain("Allow: /store/");
    expect(ROBOTS_TXT).toContain("Sitemap: https://accounts.americanseekersacademy.com/sitemap.xml");
  });
});
