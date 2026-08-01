"use client";

import * as React from "react";
import Link from "next/link";
import {
  Award,
  Check,
  Globe2,
  ImagePlus,
  Loader2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Ticket,
  Twitter,
  Wallet,
  X,
} from "lucide-react";
import {
  useEventsAttending,
  useEventsByHost,
  useUpdateProfile,
} from "@/lib/hooks/use-eventerz-data";
import { uploadAvatar } from "@/lib/supabase/data";
import { eventRowToItem } from "@/lib/supabase/map-event";
import { useSession } from "@/components/auth/use-session";
import { useAuth } from "@/components/auth/auth-provider";
import { useConnectModal } from "@/components/wallet/connect-modal-context";
import { Avatar } from "@/components/app/avatar";
import { DeleteAccountCard } from "@/components/app/delete-account-card";
import { EventCard } from "@/components/app/event-card";
import { Button } from "@/components/ui/button";
import { shortenAddress } from "@/lib/format";
import { cn } from "@/lib/utils";

const inputCls =
  "h-11 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 text-sm text-white placeholder:text-muted-foreground focus:border-brand-purple/40 focus:outline-none";

export default function ProfilePage() {
  const { user, userId } = useSession();
  // Deletion only means anything against a real backend; the demo store has
  // no account to delete.
  const { isLive } = useAuth();
  const updateProfile = useUpdateProfile(userId ?? undefined);
  const { data: hostedRows = [] } = useEventsByHost(userId ?? undefined);
  const { data: attendingRows = [] } = useEventsAttending(userId ?? undefined);
  const { open: openWallet } = useConnectModal();

  const [editing, setEditing] = React.useState(false);
  const [avatarUrl, setAvatarUrl] = React.useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = React.useState(false);
  const [avatarError, setAvatarError] = React.useState("");

  // Seed from the loaded profile, and follow it if it changes underneath.
  React.useEffect(() => {
    if (user?.avatarUrl !== undefined) setAvatarUrl(user.avatarUrl ?? null);
  }, [user?.avatarUrl]);
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

  React.useEffect(() => {
    if (user && editing) {
      setForm({
        name: user.name,
        handle: user.handle,
        bio: user.bio ?? "",
        location: user.location ?? "",
        phone: user.phone ?? "",
        website: user.website ?? "",
        twitter: user.twitter ?? "",
        interests: user.interests.join(", "),
      });
    }
  }, [editing, user]);

  if (!user) return null;

  const hosted = hostedRows.map(eventRowToItem);
  const attending = attendingRows
    .map(eventRowToItem)
    .filter((e) => e.hostId !== user.id);

  const save = () => {
    // `phone` is not a column on `profiles`; the form keeps it for future use.
    updateProfile.mutate({
      name: form.name.trim() || user.name,
      handle:
        form.handle.trim().replace(/[^a-z0-9_]/gi, "").toLowerCase() ||
        user.handle,
      bio: form.bio.trim(),
      location: form.location.trim(),
      website: form.website.trim(),
      twitter: form.twitter.trim().replace(/^@/, ""),
      interests: form.interests
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    });
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
      setAvatarUrl(url);
      // Persist straight away: the picture is already in storage, and leaving
      // the row pointing at the old one would be a picture that exists and is
      // not used.
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
              <input
                className={inputCls}
                value={form.twitter}
                onChange={(e) => set("twitter", e.target.value)}
                placeholder="username"
              />
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
            {user.bio && (
              <section>
                <h2 className="mb-2 font-display text-lg font-semibold text-white">
                  About
                </h2>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {user.bio}
                </p>
              </section>
            )}

            {user.interests.length > 0 && (
              <section>
                <h2 className="mb-2 font-display text-lg font-semibold text-white">
                  Interests
                </h2>
                <div className="flex flex-wrap gap-2">
                  {user.interests.map((t) => (
                    <span
                      key={t}
                      className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-muted-foreground"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </section>
            )}

            <section>
              <div className="mb-3 flex items-center gap-2">
                <Ticket className="size-5 text-brand-purple" />
                <h2 className="font-display text-lg font-semibold text-white">
                  Hosting ({hosted.length})
                </h2>
              </div>
              {hosted.length ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {hosted.slice(0, 4).map((e) => (
                    <EventCard key={e.id} event={e} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No events yet.{" "}
                  <Link href="/create" className="text-brand-cyan">
                    Create one →
                  </Link>
                </p>
              )}
            </section>
          </div>

          {/* Details sidebar */}
          <aside className="space-y-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <h3 className="mb-3 text-sm font-semibold text-white">Details</h3>
              <ul className="space-y-3 text-sm">
                {user.email && (
                  <li className="flex items-center gap-2.5 text-muted-foreground">
                    <Mail className="size-4 shrink-0" />
                    <span className="truncate">{user.email}</span>
                  </li>
                )}
                {user.phone && (
                  <li className="flex items-center gap-2.5 text-muted-foreground">
                    <Phone className="size-4 shrink-0" />
                    {user.phone}
                  </li>
                )}
                {user.location && (
                  <li className="flex items-center gap-2.5 text-muted-foreground">
                    <MapPin className="size-4 shrink-0" />
                    {user.location}
                  </li>
                )}
                {user.website && (
                  <li className="flex items-center gap-2.5 text-muted-foreground">
                    <Globe2 className="size-4 shrink-0" />
                    <span className="truncate">{user.website}</span>
                  </li>
                )}
                {user.twitter && (
                  <li className="flex items-center gap-2.5 text-muted-foreground">
                    <Twitter className="size-4 shrink-0" />@{user.twitter}
                  </li>
                )}
              </ul>

              <div className="mt-4 border-t border-white/10 pt-4">
                {user.walletAddress ? (
                  <div className="flex items-center gap-2 text-sm text-brand-green">
                    <Wallet className="size-4" />
                    {shortenAddress(user.walletAddress)}
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
                )}
              </div>
            </div>

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

            {isLive && <DeleteAccountCard />}
          </aside>
        </div>
      )}
    </div>
  );
}
