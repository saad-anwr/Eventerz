"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { HelpCircle, MessageCircle } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { faqs } from "@/lib/data";
import { siteConfig } from "@/lib/site";

export function FAQ() {
  return (
    <section id="faq" className="section">
      <div className="container">
        <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
          {/* Left - heading + support */}
          <div className="lg:sticky lg:top-28 lg:self-start">
            <span className="chip">
              <HelpCircle className="size-3.5 text-brand-purple" />
              <span className="text-gradient font-semibold uppercase tracking-[0.18em]">
                FAQ
              </span>
            </span>
            <h2 className="mt-4 font-display text-3xl font-bold tracking-tight text-white text-balance sm:text-4xl md:text-5xl">
              Questions,{" "}
              <span className="text-gradient">answered</span>
            </h2>
            <p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
              Everything you need to know about wallet-native events, NFT
              ticketing and on-chain reputation.
            </p>

            <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl">
              <div className="flex size-11 items-center justify-center rounded-2xl bg-brand-purple/10 text-brand-purple">
                <MessageCircle className="size-5" />
              </div>
              <h3 className="mt-4 font-display text-base font-semibold text-white">
                Still have questions?
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Our team and community are here to help you launch.
              </p>
              <Button asChild variant="secondary" size="sm" className="mt-4">
                <Link href={siteConfig.links.discord}>
                  <MessageCircle className="size-4" />
                  Join our Discord
                </Link>
              </Button>
            </div>
          </div>

          {/* Right - accordion */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.6 }}
          >
            <Accordion
              type="single"
              collapsible
              defaultValue="item-0"
              className="space-y-3"
            >
              {faqs.map((faq, i) => (
                <AccordionItem key={faq.question} value={`item-${i}`}>
                  <AccordionTrigger>{faq.question}</AccordionTrigger>
                  <AccordionContent>{faq.answer}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
