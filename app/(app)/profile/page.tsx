"use client";

import * as React from "react";
import Link from "next/link";
import {
  Award,
  BadgeCheck,
  Check,
  Globe2,
  ImagePlus,
  Loader2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Twitter,
  Wallet,
  X,
} from "lucide-react";
import {
  useEventsAttending,
  useEventsByHost,
  useUpdateProfile,
} from "@/lib/hooks/use-eventerz-data";
import {
  fetchMyPhone,
  hasXIdentity,
  saveMyPhone,
  startXLink,
  syncXIdentity,
  uploadAvatar,
} from "@/lib/supabase/data";
import { profileToUser } from "@/lib/supabase/map-profile";
import { useAppStore } from "@/lib/store/use-app-store";
import { eventRowToItem } from "@/lib/supabase/map-event";
import { useSession } from "@/components/auth/use-session";
import { useConnectModal } from "@/components/wallet/connect-modal-context";
import { Avatar } from "@/components/app/avatar";
import { inputCls } from "@/components/app/form-controls";
import {
  DetailRow,
  DetailsCard,
  ProfileAbout,
  ProfileHosting,
  ProfileInterests,
} from "@/components/app/profile-sections";
import { Button } from "@/components/ui/button";
import { shortenAddress } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Whatever someone pasted into the X field, reduced to a bare handle.
 *
 * The field shows an `x.com/` prefix, which makes a full URL the *more* natural
 * thing to paste, not less - people copy the address bar. Stripping only a
 * leading `@` (the old behaviour) would have stored
 * `https://x.com/saadanwar` as the username and rendered it as
 * `x.com/https://x.com/saadanwar`.
 *
 * Also drops anything after the handle: `?s=21` tracking params come along with
 * every share link from the app.
 */
function normaliseXHandle(input: string): string {
  return input
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^(www\.)?(x|twitter)\.com\//i, "")
    .replace(/^@/, "")
    .split(/[/?#]/)[0]
    .trim();
}

export default function ProfilePage() {
  const { user, userId } = useSession();
  const updateProfile = useUpdateProfile(userId ?? undefined);
  const { data: hostedRows = [] } = useEventsByHost(userId ?? undefined);
  const { data: attendingRows = [] } = useEventsAttending(userId ?? undefined);
  const { open: openWallet } = useConnectModal();

  const [editing, setEditing] = React.useState(false);
  const [uploadingAvatar, setUploadingAvatar] = React.useState(false);
  const [avatarError, setAvatarError] = React.useState("");

  /*
   * Read straight from the session rather than mirroring it into local state.
   *
   * A local copy is what made this screen lie: it updated the moment the upload
   * finished, so the header showed the new picture while the sidebar - reading
   * the store - still showed the old one. Two views of the same fact,
   * disagreeing. `useUpdateProfile` now writes the saved row back to the store,
   * so there is one value and every part of the page moves together.
   */
  const avatarUrl = user?.avatarUrl ?? null;
  const [form, setForm] = React.useState({
    name: "",
    handle: "",
    bio: "",
    location: "",
    phone: "",
    website: "",
    twitter: "",
    interests: "",
  });

  /*
   * The phone is not on `user`, because it is not on `profiles` - it lives in
   * the owner-only `profile_private` table (0019). Loaded once on sign-in and
   * held here, so the editor can seed the field with what is actually stored
   * rather than an empty box over a saved value.
   */
  const [phone, setPhone] = React.useState<string | null>(null);
  const [phoneError, setPhoneError] = React.useState("");

  const [linkingX, setLinkingX] = React.useState(false);
  const [xError, setXError] = React.useState("");

  /**
   * Send them to X. `linkIdentity` navigates away, so nothing after the call
   * runs - the return trip is handled by the effect below.
   */
  const linkX = React.useCallback(async () => {
    setLinkingX(true);
    setXError("");
    try {
      await startXLink(`${window.location.origin}/profile`);
    } catch (err) {
      setLinkingX(false);
      setXError(
        err instanceof Error ? err.message : "Could not start the X sign-in.",
      );
    }
  }, []);

  /*
   * Adopt the handle after coming back from X.
   *
   * Keyed off "an identity exists but the profile is not marked verified"
   * rather than off a redirect parameter, because that condition is also true
   * if the link succeeded and the follow-up write failed - a refresh then
   * finishes the job instead of stranding someone with a linked account and no
   * tick.
   */
  React.useEffect(() => {
    if (!userId || user?.twitterVerified) return;
    let cancelled = false;

    void (async () => {
      if (!(await hasXIdentity()) || cancelled) return;
      try {
        const row = await syncXIdentity();
        if (!cancelled) useAppStore.getState().syncRemoteUser(profileToUser(row));
      } catch (err) {
        if (!cancelled) {
          setXError(
            err instanceof Error ? err.message : "Could not confirm your X account.",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, user?.twitterVerified]);

  React.useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void fetchMyPhone()
      .then((value) => {
        if (!cancelled) setPhone(value);
      })
      // Not surfaced: an unreadable phone is an empty field, and the save path
      // reports its own failures where the user can act on them.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [userId]);

  React.useEffect(() => {
    if (user && editing) {
      setForm({
        name: user.name,
        handle: user.handle,
        bio: user.bio ?? "",
        location: user.location ?? "",
        phone: phone ?? "",
        website: user.website ?? "",
        twitter: user.twitter ?? "",
        interests: user.interests.join(", "),
      });
    }
  }, [editing, user, phone]);

  if (!user) return null;

  const hosted = hostedRows.map(eventRowToItem);
  const attending = attendingRows
    .map(eventRowToItem)
    .filter((e) => e.hostId !== user.id);

  const save = () => {
    updateProfile.mutate({
      name: form.name.trim() || user.name,
      handle:
        form.handle.trim().replace(/[^a-z0-9_]/gi, "").toLowerCase() ||
        user.handle,
      bio: form.bio.trim(),
      location: form.location.trim(),
      website: form.website.trim(),
      twitter: normaliseXHandle(form.twitter),
      interests: form.interests
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    });

    /*
     * The phone lives in `profile_private` (0019), so it is a second write
     * rather than part of the patch above.
     *
     * Fired alongside rather than awaited: the two are independent, and a phone
     * that fails to save should not roll back a name that saved fine. The error
     * surfaces in its own line under the form instead of pretending the whole
     * save failed.
     */
    if (form.phone !== (phone ?? "")) {
      setPhoneError("");
      void saveMyPhone(userId!, form.phone)
        .then(() => setPhone(form.phone.trim() || null))
        .catch((err: unknown) =>
          setPhoneError(
            err instanceof Error
              ? err.message
              : "Could not save your phone number.",
          ),
        );
    }

    setEditing(false);
  };

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  /**
   * Pick and upload a profile picture.
   *
   * Saved immediately rather than with the rest of the form. The file has to
   * reach storage before `avatar_url` can point at it, and deferring means
   * holding a local blob URL in form state that means nothing to any other
   * client - which would then be written to the row verbatim if the upload
   * later failed.
   */
  const handleAvatarChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    // Reset the input so re-picking the same file still fires a change event.
    e.target.value = "";
    if (!file || !userId) return;

    setUploadingAvatar(true);
    setAvatarError("");
    try {
      const url = await uploadAvatar(file, userId);
      // Persist straight away: the picture is already in storage, and leaving
      // the row pointing at the old one would be a picture that exists and is
      // not used. The store updates from the saved row, so the whole site -
      // sidebar included - follows without a reload.
      updateProfile.mutate({ avatar_url: url });
    } catch (err) {
      setAvatarError(
        err instanceof Error ? err.message : "Could not upload that picture.",
      );
    } finally {
      setUploadingAvatar(false);
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-xl">
        <div className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-brand-purple/20 blur-3xl" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
          {/*
            The picture doubles as the control for changing it. A separate
            "upload" button beside an avatar is a second thing to find; the
            avatar is where everyone looks first and already reads as the
            subject of the action.
          */}
          <div className="relative shrink-0 self-start">
            <Avatar
              name={user.name}
              seed={user.id}
              size="xl"
              ring
              src={avatarUrl}
            />
            <label
              className="absolute -bottom-1 -right-1 flex size-8 cursor-pointer items-center justify-center rounded-full border border-white/15 bg-[#11162b] text-white transition-colors hover:bg-[#1a2140]"
              title="Change profile picture"
            >
              {uploadingAvatar ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ImagePlus className="size-4" />
              )}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                className="sr-only"
                disabled={uploadingAvatar}
                onChange={handleAvatarChange}
              />
              <span className="sr-only">Change profile picture</span>
            </label>
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-2xl font-bold text-white">
              {user.name}
            </h1>
            <p className="text-sm text-muted-foreground">@{user.handle}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-cyan/30 bg-brand-cyan/10 px-2.5 py-1 text-xs font-medium text-brand-cyan">
                <Award className="size-3.5" />
                {user.reputation} rep
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-muted-foreground capitalize">
                via {user.authMethod}
              </span>
            </div>
          </div>
          {!editing && (
            <Button variant="secondary" onClick={() => setEditing(true)}>
              <Pencil className="size-4" />
              Edit profile
            </Button>
          )}
        </div>

        {/* A failed upload has to say so - the avatar simply not changing is
            indistinguishable from having picked the wrong file. */}
        {avatarError && (
          <p className="relative mt-4 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {avatarError}
          </p>
        )}

        {/* The phone saves separately from the rest of the form, so it reports
            separately too - the alternative is a silent failure, which is the
            bug this whole field is being fixed for. */}
        {phoneError && (
          <p className="relative mt-4 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {phoneError}
          </p>
        )}
      </div>

      {editing ? (
        /* Edit form */
        <div className="mt-6 space-y-4 rounded-3xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-xl">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-white">
                Name
              </span>
              <input
                className={inputCls}
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-white">
                Handle
              </span>
              <input
                className={inputCls}
                value={form.handle}
                onChange={(e) => set("handle", e.target.value)}
              />
            </label>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-white">Bio</span>
            <textarea
              rows={3}
              className={cn(inputCls, "h-auto py-3 leading-relaxed")}
              value={form.bio}
              onChange={(e) => set("bio", e.target.value)}
              placeholder="Tell people what you're about..."
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-white">
                Location
              </span>
              <input
                className={inputCls}
                value={form.location}
                onChange={(e) => set("location", e.target.value)}
                placeholder="City, Country"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-white">
                Phone
              </span>
              <input
                className={inputCls}
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="+1 555 000 0000"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-white">
                Website
              </span>
              <input
                className={inputCls}
                value={form.website}
                onChange={(e) => set("website", e.target.value)}
                placeholder="yoursite.xyz"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-white">
                Twitter
              </span>
              {/*
                The `x.com/` prefix is part of the field, not placeholder text.
                A bare "username" box invites a full URL or an @handle, both of
                which then have to be stripped on save; showing the prefix makes
                the expected shape obvious before anything is typed.

                It is decorative - `aria-hidden`, not focusable - so a screen
                reader announces the label rather than reading a fragment of URL
                before the input.
              */}
              <div
                className={cn(
                  inputCls,
                  "flex items-center gap-0 p-0 focus-within:border-brand-purple/40",
                )}
              >
                <span
                  aria-hidden
                  className="shrink-0 select-none border-r border-white/10 py-2.5 pl-3.5 pr-3 text-sm text-muted-foreground"
                >
                  x.com/
                </span>
                <input
                  className="h-full min-w-0 flex-1 bg-transparent px-3 text-sm text-white placeholder:text-muted-foreground focus:outline-none"
                  value={form.twitter}
                  onChange={(e) => set("twitter", e.target.value)}
                  placeholder="username"
                  autoComplete="off"
                  spellCheck={false}
                  aria-label="X username"
                />
              </div>

              {/*
                A typed handle is a claim; a linked account is a fact. Both are
                allowed - not everyone will connect one, and a blank profile is
                worse than an unverified handle - but only one of them gets a
                tick, and editing the box by hand drops it (trigger, 0020).
              */}
              <div className="mt-2 flex items-center gap-3">
                {user.twitterVerified ? (
                  <span className="inline-flex items-center gap-1.5 text-xs text-brand-green">
                    <BadgeCheck className="size-3.5" />
                    Verified with X
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => void linkX()}
                    disabled={linkingX}
                    className="inline-flex items-center gap-1.5 text-xs text-brand-cyan hover:underline disabled:opacity-50"
                  >
                    {linkingX ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <BadgeCheck className="size-3.5" />
                    )}
                    Verify with X
                  </button>
                )}
                {xError && <span className="text-xs text-red-300">{xError}</span>}
              </div>
            </label>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-white">
              Interests
            </span>
            <input
              className={inputCls}
              value={form.interests}
              onChange={(e) => set("interests", e.target.value)}
              placeholder="DeFi, Hackathons, Design"
            />
          </label>
          <div className="flex gap-3">
            <Button onClick={save}>
              <Check className="size-4" />
              Save changes
            </Button>
            <Button variant="ghost" onClick={() => setEditing(false)}>
              <X className="size-4" />
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        /* View */
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <ProfileAbout bio={user.bio} />
            <ProfileInterests interests={user.interests} />
            <ProfileHosting
              events={hosted}
              empty={
                <>
                  No events yet.{" "}
                  <Link href="/create" className="text-brand-cyan">
                    Create one →
                  </Link>
                </>
              }
            />
          </div>

          {/* Details sidebar */}
          <aside className="space-y-3">
            <DetailsCard
              footer={
                user.walletAddress ? (
                  <div className="flex items-center gap-2 text-sm text-brand-green">
                    <Wallet className="size-4" />
                    <span data-no-translate>
                      {shortenAddress(user.walletAddress)}
                    </span>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={openWallet}
                  >
                    <Wallet className="size-4" />
                    Link a wallet
                  </Button>
                )
              }
            >
              {user.email && (
                <DetailRow icon={Mail}>
                  <span className="truncate">{user.email}</span>
                </DetailRow>
              )}
              {/* From `profile_private`, and only ever your own - see 0019. */}
              {phone && <DetailRow icon={Phone}>{phone}</DetailRow>}
              {user.location && (
                <DetailRow icon={MapPin}>{user.location}</DetailRow>
              )}
              {user.website && (
                <DetailRow icon={Globe2}>
                  <span className="truncate">{user.website}</span>
                </DetailRow>
              )}
              {user.twitter && (
                <DetailRow icon={Twitter}>
                  <a
                    href={`https://x.com/${user.twitter}`}
                    target="_blank"
                    rel="noopener noreferrer me"
                    className="truncate hover:text-white hover:underline"
                  >
                    x.com/{user.twitter}
                  </a>
                </DetailRow>
              )}
            </DetailsCard>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-center">
                <div className="font-display text-xl font-bold text-white">
                  {hosted.length}
                </div>
                <div className="text-xs text-muted-foreground">Hosted</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-center">
                <div className="font-display text-xl font-bold text-white">
                  {attending.length}
                </div>
                <div className="text-xs text-muted-foreground">Attending</div>
              </div>
            </div>

            {/*
              Language, account deletion and the wallet list moved to
              `/settings`, which is now a nav destination on both platforms.

              They were here because there was nowhere else to put them, and the
              result was that the page showing you to other people also held the
              irreversible controls. Profile is what a visitor sees; Settings is
              what only you can change.
            */}
          </aside>
        </div>
      )}
    </div>
  );
}
