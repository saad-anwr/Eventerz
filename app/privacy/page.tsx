import type { Metadata } from "next";
import { ProsePage } from "@/components/layout/prose-page";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "What Eventerz collects, why, who it is shared with, and how to get it deleted.",
  alternates: { canonical: "/privacy" },
};

/** Kept next to the page so the date and the text change together. */
const UPDATED = "2026-08-03";

export default function PrivacyPage() {
  return (
    <ProsePage
      title="Privacy Policy"
      updated={UPDATED}
      intro={
        <>
          This describes what {siteConfig.name} actually stores, and what it
          cannot store. Wallet addresses and on-chain activity are public by
          design - that is a property of the blockchain, not a choice we make
          about your data, and it is the part most worth understanding before
          you connect a wallet.
        </>
      }
    >
      <h2>The short version</h2>
      <ul>
        <li>
          We never hold your funds or your private keys. Transfers go from your
          wallet to another wallet, and you approve each one in your own wallet.
        </li>
        <li>
          Your wallet address, and anything you do on-chain with it, is
          <strong> permanently public</strong> and outside our control.
        </li>
        <li>
          Direct messages are <strong>not end-to-end encrypted</strong>. They are
          stored in our database and are readable by us.
        </li>
        <li>We do not sell personal data, and we do not run ad tracking.</li>
      </ul>

      <h2>What we collect</h2>

      <h3>When you create an account</h3>
      <p>
        Authentication runs on Supabase. Depending on how you sign in, that means
        an email address, or the name, email address and profile picture your
        Google account chooses to share. There is no password: you sign in with a
        one-time link, a Google account, or your wallet, so we never hold one.
      </p>
      <p>
        Your email address is held only in the authentication record, where it is
        readable by you and by us. It is deliberately <em>not</em> stored on your
        public profile, because profiles are readable by anyone - so publishing it
        there would have published every address we hold, and the link between
        your email and your wallet with it.
      </p>
      <p>
        Your <strong>public profile</strong> holds your display name, handle,
        avatar, and anything optional you choose to add: bio, location, website,
        and X handle. Treat all of it as public, because it is - anyone can see a
        profile without signing in.
      </p>
      <p>
        A <strong>phone number</strong> is optional. If you add one it is stored
        separately from your profile, in a table only you can read, and it is
        never shown to other users.
      </p>

      <h3>When you link a wallet</h3>
      <p>
        Your public wallet address. To prove the wallet is yours, we issue a
        one-time challenge which your wallet signs; the signature is verified and
        the challenge is then deleted. Signing costs nothing and is not a
        transaction. We never receive your private key or seed phrase, and no
        part of {siteConfig.name} will ever ask for one.
      </p>

      <h3>When you use the product</h3>
      <table>
        <thead>
          <tr>
            <th>Data</th>
            <th>Why it exists</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Events you create - title, description, times, capacity</td>
            <td>To show the event to guests</td>
          </tr>
          <tr>
            <td>Event location - address, and coordinates if you pick a place</td>
            <td>To render a map and directions for guests</td>
          </tr>
          <tr>
            <td>RSVPs, waitlist entries, tickets, check-ins</td>
            <td>To run the guest list and the door</td>
          </tr>
          <tr>
            <td>Messages you send</td>
            <td>To deliver them</td>
          </tr>
          <tr>
            <td>
              Payment receipts - transaction signature, amount, and your optional
              note
            </td>
            <td>
              To show both parties what a transfer was for. The transfer itself
              is on-chain and public regardless
            </td>
          </tr>
          <tr>
            <td>Friendships and follows</td>
            <td>To build your feed and your inbox</td>
          </tr>
        </tbody>
      </table>

      <h3>What we do not collect</h3>
      <p>
        No private keys or seed phrases. No payment card details - we never touch
        them, because there is no card payment path. No advertising identifiers,
        and no third-party ad or behavioural-tracking pixels.
      </p>

      <h2>The mobile app</h2>
      <p>
        The Android app collects the same things as the website, and asks for
        three permissions. It asks for nothing else - no location, no contacts,
        no phone state, no advertising identifier.
      </p>
      <table>
        <thead>
          <tr>
            <th>Permission</th>
            <th>Used for</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Camera</td>
            <td>
              Scanning a ticket QR at the door, and only while that screen is
              open. Frames are decoded on the device and discarded - no image is
              stored, uploaded, or sent anywhere
            </td>
          </tr>
          <tr>
            <td>Photos</td>
            <td>
              Only when you pick a profile picture or an event banner. We receive
              the one image you choose, not access to your library
            </td>
          </tr>
          <tr>
            <td>Vibration</td>
            <td>Haptic feedback on buttons</td>
          </tr>
        </tbody>
      </table>

      <h3>What stays on your device</h3>
      <ul>
        <li>
          Your settings - theme, language, notification preferences - in the
          app&rsquo;s own storage.
        </li>
        <li>
          Your session token, in the Android keystore, so you are not signed out
          every time you close the app.
        </li>
      </ul>
      <p>
        Both are removed when you uninstall the app or sign out. Neither is sent
        to us.
      </p>

      <h3>Your wallet stays in your wallet</h3>
      <p>
        The app connects through Mobile Wallet Adapter, which hands off to a
        separate wallet application you already trust. Connecting and signing
        happen there. We receive a public address and a signature - never a key,
        and never your seed phrase.
      </p>

      <h3>No tracking</h3>
      <p>
        The app contains no analytics SDK, no crash-reporting SDK, no advertising
        identifier and no third-party tracking. If that changes, this page and
        the store listing will change with it, and we will ask first where
        consent is required.
      </p>

      <h2>Who else sees it</h2>
      <p>
        We use a small number of processors to run the service. They see only
        what their function requires:
      </p>
      <table>
        <thead>
          <tr>
            <th>Service</th>
            <th>What it handles</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Supabase</td>
            <td>Database, authentication, file storage for event banners</td>
          </tr>
          <tr>
            <td>Vercel</td>
            <td>Website hosting and delivery</td>
          </tr>
          <tr>
            <td>Solana RPC providers</td>
            <td>
              Reading balances and submitting transactions. They see wallet
              addresses, which are public
            </td>
          </tr>
          <tr>
            <td>Google Maps, or OpenStreetMap</td>
            <td>
              Turning an event address into a map. Only event locations are sent,
              never your identity
            </td>
          </tr>
          <tr>
            <td>Translation provider</td>
            <td>
              Only if you change the language. Interface labels and buttons are
              sent to be translated - never your messages, event text, profile or
              wallet address. See below
            </td>
          </tr>
        </tbody>
      </table>

      <h3>About the language picker</h3>
      <p>
        Changing the language sends the interface text on screen to a translation
        service, by default{" "}
        <a href="https://mymemory.translated.net/" rel="noreferrer noopener">
          MyMemory
        </a>
        . That service is a <strong>public translation memory</strong>: text sent
        to it may be retained and reused. So what is sent matters, and we limit
        it deliberately.
      </p>
      <p>
        Content you or another person wrote is <strong>excluded</strong>:
        messages, event titles and descriptions, names, handles, bios, wallet
        addresses and transaction signatures are all marked so the translator
        never reads them. Only our own interface strings - &ldquo;Create
        event&rdquo;, &ldquo;Going&rdquo;, &ldquo;Save&rdquo; - are sent. Text you
        write stays in its original language when the rest of the interface
        changes, which is deliberate: translating what a host wrote would
        silently rewrite it.
      </p>
      <p>
        If you never change the language, nothing is sent to a translation
        service at all.
      </p>
      <p>
        We do not sell personal data. We disclose it otherwise only where the law
        requires it.
      </p>

      <h2>Who can see what, inside the product</h2>
      <p>
        Access is enforced by database policies, not only by the interface, so a
        modified client cannot read past them:
      </p>
      <ul>
        <li>
          <strong>Hosts</strong> see the full guest list for their own events,
          including pending and declined requests.
        </li>
        <li>
          <strong>Confirmed guests</strong> see other confirmed guests. They
          cannot see who was declined - that is the host&rsquo;s decision to
          keep.
        </li>
        <li>
          <strong>Everyone else</strong> sees attendance counts and a few sample
          faces.
        </li>
        <li>
          <strong>Messages</strong> are visible to the people in the
          conversation, and to us as the database operator.
        </li>
      </ul>

      <h2>The blockchain part, stated plainly</h2>
      <p>
        Anything recorded on Solana - transfers, and event or attendance records
        once the on-chain features are enabled - is public, permanent, and
        outside our control. We cannot edit or delete it. Anyone who learns your
        wallet address can view its full history on a block explorer, including
        activity that has nothing to do with {siteConfig.name}.
      </p>
      <p>
        If you would rather your event activity were not linked to your main
        wallet, use a separate wallet for {siteConfig.name}. You can unlink a
        wallet at any time from your profile, which stops us associating it with
        your account from that point on. It does not, and cannot, remove anything
        already on-chain.
      </p>

      <h2>Keeping and deleting data</h2>
      <p>
        We keep your data while your account is open. You can delete it yourself
        at any time - <strong>Profile → Delete account</strong>. No email, no
        waiting on us. It takes effect immediately and cannot be undone.
      </p>
      <p>What is erased:</p>
      <ul>
        <li>
          Your name, avatar, bio, location, website, X handle and phone number.
        </li>
        <li>Your email address and the ability to sign in.</li>
        <li>
          The link between your account and your wallet. The wallet itself is
          yours and is untouched.
        </li>
        <li>Your notifications, reminders, friend connections and community memberships.</li>
        <li>RSVPs to events that have not happened yet.</li>
      </ul>
      <p>
        What remains, and why. These are records that belong to{" "}
        <em>other people</em>, and deleting them would take something from
        someone who did not ask to lose it:
      </p>
      <ul>
        <li>
          <strong>Events you hosted</strong> stay, so guests keep the tickets they
          already hold. Your name is removed from them.
        </li>
        <li>
          <strong>Payment receipts</strong> stay. A receipt is the other
          person&rsquo;s record of money that actually moved, and the transaction
          exists on the blockchain regardless.
        </li>
        <li>
          <strong>Messages you sent</strong> stay in place with the text replaced
          by &ldquo;[deleted]&rdquo;, so the other person&rsquo;s conversation
          still makes sense rather than appearing to be one they had with
          themselves.
        </li>
        <li>
          <strong>On-chain records</strong> cannot be deleted by us or by anyone
          else. This is a property of the blockchain, not a choice we make.
        </li>
      </ul>
      <p>
        Attendance at events that already happened is kept in anonymised form, so
        a host&rsquo;s record of who came is not rewritten after the fact.
      </p>

      <h2>Your rights</h2>
      <p>
        Depending on where you live, you may have the right to access, correct,
        export, or delete your personal data, and to object to some processing.
        Email us and we will action it. Most of it you can also do yourself:
        profile fields are editable in the app, and wallets can be unlinked
        there.
      </p>

      <h2>Children</h2>
      <p>
        {siteConfig.name} is not intended for anyone under 13, and we do not
        knowingly collect their data. If you believe a child has created an
        account, contact us and we will remove it.
      </p>

      <h2>Changes</h2>
      <p>
        If we change this policy materially we will update the date above and,
        for anything that affects how your data is handled, tell you in the
        product rather than relying on you to re-read this page.
      </p>

      <h2>Contact</h2>
      <p>
        Privacy questions and deletion requests:{" "}
        <a href="mailto:eventerz.web@gmail.com">eventerz.web@gmail.com</a>.
        Security issues:{" "}
        <a href="mailto:support@eventerz.xyz">support@eventerz.xyz</a>.
      </p>
    </ProsePage>
  );
}
