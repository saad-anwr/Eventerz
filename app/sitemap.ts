import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/site";

/**
 * Only real, publicly useful pages.
 *
 * This used to list `#features`, `#how-it-works`, `#demo`, `#roadmap` and
 * `#faq`. A URL fragment is not a page: crawlers strip everything from the `#`
 * onwards, so those five entries all resolved to the home page and the sitemap
 * claimed six URLs where one exists. Duplicate entries do not help ranking -
 * they are noise at best, and a quality signal against the file at worst.
 *
 * The signed-in surfaces (`/dashboard`, `/messages`, `/profile`, ...) are
 * deliberately absent, and `robots.ts` disallows them. They render an auth wall
 * to a crawler, which is a thin page pointing at nothing indexable.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const pages: {
    path: string;
    priority: number;
    changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  }[] = [
    { path: "", priority: 1, changeFrequency: "weekly" },
    { path: "/docs", priority: 0.8, changeFrequency: "monthly" },
    { path: "/privacy", priority: 0.3, changeFrequency: "yearly" },
    { path: "/terms", priority: 0.3, changeFrequency: "yearly" },
  ];

  // Build time, not a literal. A hard-coded date silently ages into a claim
  // that the site has not changed since whenever someone last edited it.
  const lastModified = new Date();

  return pages.map(({ path, priority, changeFrequency }) => ({
    url: `${siteConfig.url}${path}`,
    lastModified,
    changeFrequency,
    priority,
  }));
}
