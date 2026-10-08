import type { Express } from "express";
import { buildPublicSitemapXml } from "./public-sitemap";
import { ROBOTS_TXT } from "./public-page-meta";

export function registerPublicSeoRoutes(app: Express): void {
  app.get("/robots.txt", (_req, res) => {
    res.type("text/plain").send(ROBOTS_TXT);
  });
  app.get("/sitemap.xml", async (_req, res) => {
    const xml = await buildPublicSitemapXml();
    res.type("application/xml").send(xml);
  });
}
