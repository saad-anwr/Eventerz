import type { Metadata } from "next";
import { ProsePage } from "@/components/layout/prose-page";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The rules for using Eventerz: hosting events, attending them, and moving funds wallet-to-wallet.",
  alternates: { canonical: "/terms" },
};

const UPDATED = "2026-07-30";

export default function TermsPage() {
  return (
    <ProsePage
      title="Terms of Service"
      updated={UPDATED}
      intro={
        <>
          By using {siteConfig.name} you agree to these terms. The section on
          funds is the one that matters most: {siteConfig.name} is
          non-custodial, so a transfer you approve cannot be reversed by us or by
          anyone.
        </>
      }
    >
      <h2>1. What Eventerz is</h2>
      <p>
        {siteConfig.name} is event infrastructure built on Solana. You can create
        events, manage a guest list, issue tickets, check guests in, and send SOL
        to other users from your own wallet.
      </p>
      <p>
        We are a <strong>platform</strong>, not an event organiser, ticket agent,
        payment processor, broker, or custodian. Events are run by their hosts.
        We do not vet them.
      </p>

      <h2>2. Your account</h2>
      <p>
        You must be at least 13, and old enough to form a binding contract where
        you live. You are responsible for what happens under your account and for
        the accuracy of what you publish through it.
      </p>
      <p>
        You are responsible for your wallet and its keys. We cannot recover a
        lost seed phrase, reverse a transaction, or restore access to a wallet.
        Nobody at {siteConfig.name} will ever ask for your seed phrase - anyone
        who does is attempting to steal from you.
      </p>

      <h2>3. Funds, and what non-custodial means</h2>
      <p>This is the part to read twice.</p>
      <ul>
        <li>
          We never hold, control, or have access to your funds. Transfers go
          directly from your wallet to another wallet.
        </li>
        <li>
          Every transfer is approved by you, in your own wallet, and is{" "}
          <strong>final and irreversible</strong>. There is no chargeback, no
          dispute process, and no undo. We cannot claw a payment back, even if
          you were deceived.
        </li>
        <li>
          Check the recipient before you approve. A transfer to a wrong address
          is unrecoverable.
        </li>
        <li>
          Network fees are charged by Solana, not by us, and are not refundable.
        </li>
        <li>
          A payment receipt in a conversation is a record of a transfer. It is
          not an escrow, a guarantee, or a promise by us that anything was
          delivered in return.
        </li>
      </ul>
      <p>
        Cryptocurrency values move. You are responsible for any tax arising from
        your activity.
      </p>

      <h2>4. If you host an event</h2>
      <p>You are responsible for the event. That means:</p>
      <ul>
        <li>
          Describing it accurately - time, place, price, and what a ticket
          actually entitles someone to.
        </li>
        <li>
          Holding the permits, licences and insurance the event requires, and
          complying with local law.
        </li>
        <li>
          Honouring what you sold. If you cancel, you are responsible for
          refunding your guests directly; we cannot do it for you, because we
          never held the money.
        </li>
        <li>
          Handling your guests&rsquo; personal information lawfully. The guest
          list is yours to steward.
        </li>
      </ul>
      <p>
        Cancelling an event in the product notifies your guests and closes their
        RSVPs. It does not move any funds.
      </p>

      <h2>5. If you attend an event</h2>
      <p>
        Your agreement is with the host, not with us. Refunds, entry conditions
        and what happens if an event is cancelled or misrepresented are between
        you and the host. Confirm what you are buying before you pay, especially
        where the host is someone you do not know.
      </p>
      <p>
        A ticket QR is a credential. Anyone holding it can be admitted in your
        place, so treat it like a key.
      </p>

      <h2>6. Rules of use</h2>
      <p>Do not use {siteConfig.name} to:</p>
      <ul>
        <li>Break the law, or run a fraudulent, deceptive, or sham event.</li>
        <li>
          Launder money, evade sanctions, or move the proceeds of crime. You
          confirm you are not subject to applicable sanctions.
        </li>
        <li>
          Harass, threaten, impersonate, or send unsolicited bulk messages to
          other users.
        </li>
        <li>
          Post content you have no right to post, or anything unlawful or
          sexually exploitative.
        </li>
        <li>
          Scrape, disrupt, overload, or attempt to bypass the access controls of
          the service - including reading data the permissions do not grant you.
        </li>
        <li>
          Publish an event whose real purpose is to solicit wallet approvals,
          seed phrases, or signatures under false pretences.
        </li>
      </ul>
      <p>
        We may remove content or suspend accounts that breach these rules. Where
        it is reasonable to do so, we will say why.
      </p>

      <h2>7. Your content</h2>
      <p>
        You keep ownership of what you post. You grant us a licence to host,
        store, reproduce and display it for the purpose of operating the service
        - showing your event to guests, delivering your messages, rendering your
        avatar. That licence ends when you delete the content, except where it
        has already been shared with others or recorded on-chain.
      </p>

      <h2>8. Availability</h2>
      <p>
        The service is provided as-is. We do not promise it will be
        uninterrupted, and parts of it depend on things we do not run - the
        Solana network, RPC providers, wallet apps, map providers. We may change
        or discontinue features.
      </p>
      <p>
        On-chain features are enabled progressively. Where a feature is not yet
        live, the product says so rather than pretending otherwise.
      </p>

      <h2>9. Liability</h2>
      <p>
        To the maximum extent the law allows, we are not liable for indirect or
        consequential loss, for lost profits, for loss of cryptocurrency or its
        change in value, for transactions you approved, for the conduct of hosts
        or guests, or for anything that happens at an event.
      </p>
      <p>
        Nothing here excludes liability that cannot lawfully be excluded. Some
        jurisdictions do not allow certain exclusions, in which case the parts
        that are permitted still apply.
      </p>

      <h2>10. The mobile app</h2>
      <p>
        The Android app is licensed to you, not sold - a personal,
        non-transferable licence to use it on devices you control. You may not
        reverse-engineer it, redistribute it, or ship a modified build under our
        name.
      </p>
      <p>
        Connecting a wallet uses Mobile Wallet Adapter, which hands off to a
        separate wallet application governed by its own terms. We do not control
        that app and are not responsible for it.
      </p>
      <p>
        Where you obtained the app from a store, that store&rsquo;s terms also
        apply to the download. We may issue updates, and some features may
        require a current version.
      </p>

      <h2>11. Governing law</h2>
      {/*
        The one clause in this document that cannot be derived from how the
        product behaves. It needs the legal entity's actual jurisdiction naming
        before launch - a forum-selection clause with no named forum is the
        clause most likely to be held unenforceable, which is the opposite of
        what it is for. Flagged in HANDOFF.md.
      */}
      <p>
        These terms, and any dispute arising from them or from your use of{" "}
        {siteConfig.name}, are governed by the laws of the jurisdiction in which{" "}
        {siteConfig.creator} is established, without regard to conflict-of-law
        rules. You and we submit to the exclusive jurisdiction of the courts of
        that place, except that either of us may seek injunctive relief wherever
        it is needed.
      </p>
      <p>
        If you are a consumer, this does not deprive you of the protection of
        mandatory rules in the country where you live.
      </p>

      <h2>12. Ending it</h2>
      <p>
        You may stop using {siteConfig.name} at any time and ask us to delete
        your account - see the{" "}
        <a href="/privacy">Privacy Policy</a>. We may suspend or terminate an
        account that breaches these terms or exposes other users to harm.
      </p>

      <h2>13. Changes</h2>
      <p>
        We may update these terms. Material changes will be announced in the
        product, and the date above will change. Continuing to use the service
        after that means you accept the new version.
      </p>

      <h2>14. Contact</h2>
      <p>
        {siteConfig.creator} -{" "}
        <a href="mailto:eventerz.web@gmail.com">eventerz.web@gmail.com</a>
      </p>
    </ProsePage>
  );
}
