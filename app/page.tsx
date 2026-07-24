import { Background } from "@/components/layout/background";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Hero } from "@/components/sections/hero";
import { TrustedBy } from "@/components/sections/trusted-by";
import { Features } from "@/components/sections/features";
import { HowItWorks } from "@/components/sections/how-it-works";
import { Comparison } from "@/components/sections/comparison";
import { InteractiveDemo } from "@/components/sections/interactive-demo";
import { OrganizerDashboard } from "@/components/sections/organizer-dashboard";
import { CommunitySection } from "@/components/sections/community";
import { Roadmap } from "@/components/sections/roadmap";
import { FAQ } from "@/components/sections/faq";
import { CTA } from "@/components/sections/cta";
import { siteConfig } from "@/lib/site";
import { faqs } from "@/lib/data";

/** JSON-LD structured data for richer search results. */
function StructuredData() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: siteConfig.name,
        url: siteConfig.url,
        description: siteConfig.description,
        sameAs: [
          siteConfig.links.twitter,
          siteConfig.links.github,
          siteConfig.links.discord,
        ],
      },
      {
        "@type": "WebSite",
        name: siteConfig.name,
        url: siteConfig.url,
        description: siteConfig.description,
      },
      {
        "@type": "SoftwareApplication",
        name: siteConfig.name,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web, Android, iOS",
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        description: siteConfig.description,
      },
      {
        "@type": "FAQPage",
        mainEntity: faqs.map((faq) => ({
          "@type": "Question",
          name: faq.question,
          acceptedAnswer: { "@type": "Answer", text: faq.answer },
        })),
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

export default function HomePage() {
  return (
    <>
      <StructuredData />
      <Background />
      <Navbar />
      <main className="relative">
        <Hero />
        <TrustedBy />
        <Features />
        <HowItWorks />
        <Comparison />
        <InteractiveDemo />
        <OrganizerDashboard />
        <CommunitySection />
        <Roadmap />
        <FAQ />
        <CTA />
      </main>
      <Footer />
    </>
  );
}
