import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/site";

/**
 * The signed-in surfaces are disallowed; the shareable ones are not.
 *
 * This previously allowed everything. Crawling `/messages/<id>` or `/u/<id>`
 * leaks nothing on its own - a crawler has no session, so it sees the auth wall
 * - but it publishes the shape of every private route, fills the index with
 * identical empty pages, and spends crawl budget on them instead of the pages
 * that should rank.
 *
 * `/events/<id>` is deliberately **left crawlable**: it is the page both apps
 * put in a share sheet, so it is the one dynamic route that is meant to be
 * found. Only its `/edit` child is closed off.
 *
 * `/auth/` matters for a different reason: it is a redirect target that carries
 * an OAuth code in the query string, which has no business in an index.
 *
 * This is a crawler convention, not an access control. Everything that actually
 * protects data is enforced by row-level security in Postgres.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/auth/",
        "/create",
        "/dashboard",
        "/events/*/edit",
        "/friends",
        "/messages",
        "/my-events",
        "/profile",
        "/u/",
      ],
    },
    sitemap: `${siteConfig.url}/sitemap.xml`,
  };
}
