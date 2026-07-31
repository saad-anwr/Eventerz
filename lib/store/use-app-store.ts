"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { uid } from "@/lib/format";
import type {
  AuthMethod,
  EventItem,
  FriendRequest,
  Message,
  User,
} from "./types";
import {
  buildSeedEvents,
  buildSeedFriendships,
  buildSeedMessages,
  seedUsers,
} from "./seed";

export interface CreateEventInput {
  title: string;
  description: string;
  category: EventItem["category"];
  startsAt: string;
  endsAt?: string;
  location: string;
  isOnline: boolean;
  capacity: number;
  price: string;
  visibility: "public" | "private";
  requiresApproval: boolean;
  tokenGated: boolean;
  tags: string[];
  coverGradient: string;
}

interface AppState {
  hasHydrated: boolean;
  users: Record<string, User>;
  events: Record<string, EventItem>;
  friendRequests: FriendRequest[];
  messages: Message[];
  currentUserId: string | null;

  // lifecycle
  setHasHydrated: (v: boolean) => void;
  seedIfEmpty: () => void;

  // auth / identity
  signInLocal: (
    method: Exclude<AuthMethod, "wallet">,
    data: { name: string; email: string }
  ) => User;
  /**
   * Adopt a user authenticated by the real backend as the current session.
   * Lets every existing screen keep reading `useSession()` unchanged while the
   * identity behind it is a genuine Supabase account.
   */
  syncRemoteUser: (user: User) => void;
  ensureWalletUser: (address: string) => User;
  linkWallet: (address: string) => void;
  signOut: () => void;
  updateProfile: (patch: Partial<User>) => void;

  // events
  createEvent: (input: CreateEventInput) => EventItem;
  toggleRsvp: (eventId: string, userId: string) => void;

  // friends
  sendFriendRequest: (from: string, to: string) => void;
  respondFriendRequest: (id: string, accept: boolean) => void;

  // chat
  sendMessage: (
    scope: Message["scope"],
    channelId: string,
    senderId: string,
    text: string
  ) => void;
}

function makeHandle(name: string) {
  const base = name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12) || "user";
  return `${base}${Math.floor(Math.random() * 90 + 10)}`;
}

/** Seed a couple of incoming friend requests so new users can try "Accept". */
function welcomeRequests(
  users: Record<string, User>,
  toId: string
): FriendRequest[] {
  return ["u_maya", "u_priya"]
    .filter((fid) => users[fid])
    .map((fid) => ({
      id: uid("f"),
      from: fid,
      to: toId,
      status: "pending" as const,
      createdAt: Date.now(),
    }));
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      hasHydrated: false,
      users: {},
      events: {},
      friendRequests: [],
      messages: [],
      currentUserId: null,

      setHasHydrated: (v) => set({ hasHydrated: v }),

      seedIfEmpty: () => {
        if (Object.keys(get().users).length > 0) return;
        const users: Record<string, User> = {};
        seedUsers.forEach((u) => (users[u.id] = u));
        const events: Record<string, EventItem> = {};
        buildSeedEvents().forEach((e) => (events[e.id] = e));
        set({
          users,
          events,
          messages: buildSeedMessages(),
          friendRequests: buildSeedFriendships(),
        });
      },

      signInLocal: (method, data) => {
        const existing = Object.values(get().users).find(
          (u) => u.email && u.email.toLowerCase() === data.email.toLowerCase()
        );
        if (existing) {
          set({ currentUserId: existing.id });
          return existing;
        }
        const id = uid("u");
        const user: User = {
          id,
          name: data.name || data.email.split("@")[0],
          handle: makeHandle(data.name || data.email),
          email: data.email,
          authMethod: method,
          reputation: 120,
          interests: [],
          createdAt: Date.now(),
        };
        set((s) => ({
          users: { ...s.users, [id]: user },
          currentUserId: id,
          friendRequests: [...s.friendRequests, ...welcomeRequests(get().users, id)],
        }));
        return user;
      },

      syncRemoteUser: (user) => {
        set((s) => ({
          users: {
            ...s.users,
            // Keep any locally-known extras (interests picked in the demo)
            // but let the server's copy win on every field it owns.
            [user.id]: { ...s.users[user.id], ...user },
          },
          currentUserId: user.id,
        }));
      },

      ensureWalletUser: (address) => {
        const existing = Object.values(get().users).find(
          (u) => u.walletAddress === address
        );
        if (existing) {
          if (!get().currentUserId) set({ currentUserId: existing.id });
          return existing;
        }
        const id = uid("u");
        const user: User = {
          id,
          name: `${address.slice(0, 4)}...${address.slice(-4)}`,
          handle: `sol${address.slice(0, 6).toLowerCase()}`,
          walletAddress: address,
          authMethod: "wallet",
          reputation: 100,
          interests: [],
          createdAt: Date.now(),
        };
        set((s) => ({
          users: { ...s.users, [id]: user },
          currentUserId: s.currentUserId ?? id,
          friendRequests: [...s.friendRequests, ...welcomeRequests(get().users, id)],
        }));
        return user;
      },

      linkWallet: (address) => {
        const { currentUserId, users } = get();
        if (!currentUserId) return;
        const me = users[currentUserId];
        if (!me || me.walletAddress) return;
        set({
          users: {
            ...users,
            [currentUserId]: { ...me, walletAddress: address },
          },
        });
      },

      signOut: () => set({ currentUserId: null }),

      updateProfile: (patch) => {
        const { currentUserId, users } = get();
        if (!currentUserId) return;
        const me = users[currentUserId];
        if (!me) return;
        set({ users: { ...users, [currentUserId]: { ...me, ...patch } } });
      },

      createEvent: (input) => {
        const hostId = get().currentUserId;
        if (!hostId) throw new Error("Must be signed in to create an event");
        const id = uid("e");
        const event: EventItem = {
          id,
          ...input,
          hostId,
          attendeeIds: [hostId],
          createdAt: Date.now(),
        };
        set((s) => ({ events: { ...s.events, [id]: event } }));
        return event;
      },

      toggleRsvp: (eventId, userId) => {
        const event = get().events[eventId];
        if (!event) return;
        const going = event.attendeeIds.includes(userId);
        const attendeeIds = going
          ? event.attendeeIds.filter((x) => x !== userId)
          : [...event.attendeeIds, userId];
        set((s) => ({
          events: { ...s.events, [eventId]: { ...event, attendeeIds } },
        }));
      },

      sendFriendRequest: (from, to) => {
        if (from === to) return;
        const exists = get().friendRequests.find(
          (r) =>
            (r.from === from && r.to === to) ||
            (r.from === to && r.to === from)
        );
        if (exists) return;
        const req: FriendRequest = {
          id: uid("f"),
          from,
          to,
          status: "pending",
          createdAt: Date.now(),
        };
        set((s) => ({ friendRequests: [...s.friendRequests, req] }));

        // Demo: seeded users "accept" shortly after, so DM chat becomes usable.
        if (get().users[to]?.seeded) {
          setTimeout(() => {
            set((s) => ({
              friendRequests: s.friendRequests.map((r) =>
                r.id === req.id && r.status === "pending"
                  ? { ...r, status: "accepted" }
                  : r
              ),
            }));
          }, 1300);
        }
      },

      respondFriendRequest: (id, accept) => {
        set((s) => ({
          friendRequests: s.friendRequests.map((r) =>
            r.id === id
              ? { ...r, status: accept ? "accepted" : "declined" }
              : r
          ),
        }));
      },

      sendMessage: (scope, channelId, senderId, text) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        const msg: Message = {
          id: uid("m"),
          scope,
          channelId,
          senderId,
          text: trimmed,
          createdAt: Date.now(),
        };
        set((s) => ({ messages: [...s.messages, msg] }));
      },
    }),
    {
      name: "eventerz-store",
      version: 1,
      partialize: (s) => ({
        users: s.users,
        events: s.events,
        friendRequests: s.friendRequests,
        messages: s.messages,
        currentUserId: s.currentUserId,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);

/* --------------------------------------------------------------------- */
/*  Derived selectors (pure - call inside useAppStore(s => ...))          */
/* --------------------------------------------------------------------- */

export const dmChannelId = (a: string, b: string) =>
  `dm:${[a, b].sort().join("__")}`;

export function friendIdsOf(
  requests: FriendRequest[],
  userId: string
): string[] {
  return requests
    .filter(
      (r) =>
        r.status === "accepted" && (r.from === userId || r.to === userId)
    )
    .map((r) => (r.from === userId ? r.to : r.from));
}

export type FriendRelation =
  | "self"
  | "none"
  | "friends"
  | "outgoing"
  | "incoming";

export function relationBetween(
  s: AppState,
  me: string,
  other: string
): FriendRelation {
  if (me === other) return "self";
  const req = s.friendRequests.find(
    (r) =>
      (r.from === me && r.to === other) || (r.from === other && r.to === me)
  );
  if (!req) return "none";
  if (req.status === "accepted") return "friends";
  if (req.status === "declined") return "none";
  return req.from === me ? "outgoing" : "incoming";
}

export function incomingRequests(
  requests: FriendRequest[],
  userId: string
): FriendRequest[] {
  return requests.filter((r) => r.to === userId && r.status === "pending");
}
