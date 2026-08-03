"use client";

/**
 * Settings.
 *
 * # Why this is now a destination
 *
 * It never was one on the web. Language sat in a sidebar column on `/profile`,
 * account deletion sat below it, and linked wallets had nowhere at all - so the
 * three things a person changes rarely and deliberately were mixed into the
 * page that shows them off to other people. The app had the same problem in
 * reverse: a full settings screen reachable only through a gear icon buried in
 * Profile, with no tab.
 *
 * Both now have Settings as the fifth destination, holding the same sections in
 * the same order.
 *
 * Profile keeps what a *visitor* would see - name, bio, events, reputation.
 * Settings holds what only the account holder can change.
 */

import Link from "next/link";
import { ExternalLink, Globe, ShieldCheck, Wallet } from "lucide-react";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { useSession } from "@/components/auth/use-session";
import { PageHeader } from "@/components/app/page-header";
import { LanguagePicker } from "@/components/app/language-picker";
import { DeleteAccountCard } from "@/components/app/delete-account-card";
import { LinkedWallets } from "@/components/app/linked-wallets";
import { siteConfig } from "@/lib/site";

function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-white">
        <Icon className="size-5 text-brand-purple" />
        {title}
      </h2>
      {description && (
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      )}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function SettingsPage() {
  const { user } = useSession();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Account"
        title="Settings"
        description="Wallets, language and privacy."
      />

      <Section
        icon={Wallet}
        title="Linked wallets"
        description="Several wallets can share one account. Your tickets, friends and reputation belong to the account, not to any one wallet."
      >
        {user ? (
          <LinkedWallets connectedAddress={user.walletAddress ?? null} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Sign in to manage the wallets on your account.
          </p>
        )}
      </Section>

      <Section icon={Globe} title="Language">
        <LanguagePicker />
      </Section>

      <Section
        icon={ShieldCheck}
        title="Privacy"
        description="What Eventerz stores, and what leaving takes with it."
      >
        <div className="flex flex-wrap gap-3">
          <Link
            href="/privacy"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 px-4 text-sm text-white transition-colors hover:border-brand-purple/40"
          >
            Privacy policy
            <ExternalLink className="size-3.5" />
          </Link>
          <Link
            href="/terms"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 px-4 text-sm text-white transition-colors hover:border-brand-purple/40"
          >
            Terms
            <ExternalLink className="size-3.5" />
          </Link>
          <Link
            href={siteConfig.links.docs}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 px-4 text-sm text-white transition-colors hover:border-brand-purple/40"
          >
            Docs
          </Link>
        </div>
      </Section>

      {/*
        Deletion last, and in its own box. It is the only irreversible control
        on the page, and putting it beside the language picker is how somebody
        ends up one careless click from erasing their account.
      */}
      {isSupabaseConfigured && <DeleteAccountCard />}
    </div>
  );
}
