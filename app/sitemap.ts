import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["", "#features", "#how-it-works", "#demo", "#roadmap", "#faq"];
  return routes.map((route) => ({
    url: `${siteConfig.url}/${route}`,
    lastModified: new Date("2026-07-24"),
    changeFrequency: "monthly",
    priority: route === "" ? 1 : 0.7,
  }));
}
