import type { Metadata } from "next";
import { ProsePage } from "@/components/layout/prose-page";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Docs",
  description:
    "How Eventerz works: hosting, RSVPs and approval, waitlists, tickets and check-in, and sending SOL.",
  alternates: { canonical: "/docs" },
};

export default function DocsPage() {
  return (
    <ProsePage
      title="Docs"
      intro={
        <>
          How the product actually behaves - including where it stops. If
          something below does not match what you see, the product is right and
          this page is wrong; tell us.
        </>
      }
    >
      <h2>Getting started</h2>
      <ol>
        <li>
          <strong>Sign in</strong> with email or Google. This creates your
          profile.
        </li>
        <li>
          <strong>Link a wallet</strong> from your profile. Your wallet signs a
          one-time challenge to prove you hold the key. Signing is free and is
          not a transaction.
        </li>
      </ol>
      <p>
        You can browse and RSVP without a wallet. A wallet is needed to send or
        receive funds, and for the on-chain records described at the bottom of
        this page.
      </p>

      <h3>Why linking asks for a signature</h3>
      <p>
        Without it, anyone could type in a well-known address and inherit its
        reputation and its history. The signature proves the wallet is yours. If
        the message in your wallet does not name {siteConfig.name} and a
        five-minute challenge, do not sign it.
      </p>

      <h2>Hosting an event</h2>
      <p>
        <strong>Create</strong> takes a title, description, time, capacity and a
        location. Searching for a place attaches coordinates, which is what
        gives guests a map and directions - a typed address without a chosen
        place still displays, but cannot be mapped.
      </p>

      <h3>Approval</h3>
      <p>
        Turn on <strong>requires approval</strong> and RSVPs arrive as requests
        for you to accept or decline. Leave it off and confirmation is
        immediate, up to capacity.
      </p>

      <h3>Editing and cancelling</h3>
      <p>
        Hosts can edit an event after publishing. Changing the time or the place
        notifies everyone holding a live RSVP, because those are the two changes
        that make people turn up to the wrong thing.
      </p>
      <p>
        Cancelling is soft: the page stays up and says the event was called off,
        every live RSVP is closed, and everyone is notified. The record survives
        so ticket holders keep theirs. <strong>Cancelling moves no money</strong>{" "}
        - if you took payment, refund your guests directly.
      </p>
      <p>
        Capacity can be raised freely. It cannot be lowered below the number of
        people already confirmed.
      </p>

      <h2>Attending</h2>
      <table>
        <thead>
          <tr>
            <th>State</th>
            <th>What it means</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Pending</td>
            <td>The host has your request and has not decided</td>
          </tr>
          <tr>
            <td>Confirmed</td>
            <td>You have a place, and a ticket</td>
          </tr>
          <tr>
            <td>Waitlisted</td>
            <td>The event is full; you hold a numbered place in the queue</td>
          </tr>
          <tr>
            <td>Declined</td>
            <td>The host turned the request down</td>
          </tr>
          <tr>
            <td>Cancelled</td>
            <td>You withdrew, or the event was called off</td>
          </tr>
        </tbody>
      </table>
      <p>
        The waitlist shows your actual position. When someone cancels, the person
        at the front is promoted automatically and told.
      </p>

      <h2>Tickets and the door</h2>
      <p>
        A confirmed RSVP produces a ticket with a QR code. Hosts scan it from the
        mobile app to check guests in.
      </p>
      <p>
        <strong>The QR is a credential.</strong> Anyone holding it can be
        admitted in your place, so do not post it publicly. Sharing a ticket from
        the app deliberately shares the event page instead.
      </p>
      <p>
        If a camera is unavailable at the door, the scanner accepts a code typed
        by hand - the same redemption path, so it is equally valid.
      </p>

      <h2>Sending SOL</h2>
      <p>
        Open a conversation and use the send action. The transfer goes from your
        wallet to theirs; we never hold it. Once the network confirms, a receipt
        appears in the thread for both of you.
      </p>
      <p>Three things worth knowing:</p>
      <ul>
        <li>
          <strong>Transfers are irreversible.</strong> Check the recipient before
          approving. There is no chargeback.
        </li>
        <li>
          A receipt shows a <strong>clock</strong> until we have independently
          confirmed the transfer against the network, and a{" "}
          <strong>tick</strong> afterwards. An unverified receipt is not proof of
          payment. The person who benefits from the tick cannot set it.
        </li>
        <li>
          A receipt records that money moved. It is not escrow and not a
          guarantee that anything was delivered in return.
        </li>
      </ul>
      <p>
        The recipient needs a linked wallet. If they have not linked one, there
        is nowhere to send to and the app will say so rather than failing at the
        wallet step.
      </p>

      <h2>Messages</h2>
      <p>
        Anyone can message anyone - including a guest contacting a host about an
        event, which is what <strong>Contact host</strong> does. Messages from
        people you are not friends with are labelled rather than hidden.
      </p>
      <p>
        Messages are <strong>not end-to-end encrypted</strong>. Do not send seed
        phrases or private keys through them, or anywhere else.
      </p>

      <h2>The mobile app</h2>
      <p>
        Android, built for Solana Seeker, using Mobile Wallet Adapter - so
        connecting and signing happen in your own wallet app. It has everything
        the website has, plus the QR scanner. Messages are reached from the home
        header.
      </p>

      <h2>What is on-chain</h2>
      <p>Honestly, and in the present tense:</p>
      <ul>
        <li>
          <strong>Live now:</strong> wallet-to-wallet SOL transfers, and the
          receipts that reference them. Those are real Solana transactions you
          can open in a block explorer.
        </li>
        <li>
          <strong>Not yet live:</strong> event registry, seat claims and
          host-attested check-in. The program is written but not deployed. Until
          it is, RSVPs, tickets and check-ins are database records - fully
          functional, just not independently verifiable.
        </li>
      </ul>
      <p>
        The app does not pretend otherwise. Where an on-chain action is
        unavailable it declines rather than producing a signature for a
        transaction that did nothing.
      </p>

      <h2>Staying safe</h2>
      <ul>
        <li>
          Nobody at {siteConfig.name} will ever ask for your seed phrase or
          private key. Anyone who does is trying to rob you.
        </li>
        <li>
          Read what your wallet shows you before approving. A signature request
          from us names {siteConfig.name} and expires in five minutes.
        </li>
        <li>
          Consider a separate wallet for events, so your event activity is not
          linked to your main holdings.
        </li>
        <li>
          Treat an unverified receipt, and an event from someone you do not know,
          with the same caution you would anywhere else.
        </li>
      </ul>

      <h2>More</h2>
      <p>
        <a href="/privacy">Privacy Policy</a> ·{" "}
        <a href="/terms">Terms of Service</a> ·{" "}
        <a
          href={siteConfig.links.github}
          target="_blank"
          rel="noopener noreferrer"
        >
          Source code
        </a>
      </p>
      <p>
        Questions:{" "}
        <a href="mailto:eventerz.web@gmail.com">eventerz.web@gmail.com</a>
      </p>
    </ProsePage>
  );
}
