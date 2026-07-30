export type AuthMethod = "google" | "apple" | "email" | "wallet";

export interface User {
  id: string;
  name: string;
  handle: string; // without @
  email?: string;
  phone?: string;
  bio?: string;
  location?: string;
  website?: string;
  twitter?: string;
  walletAddress?: string;
  authMethod: AuthMethod;
  reputation: number;
  interests: string[];
  createdAt: number;
  /** Seeded demo accounts are discoverable but not "you". */
  seeded?: boolean;
}

export type EventCategory =
  | "Conference"
  | "Meetup"
  | "Hackathon"
  | "Workshop"
  | "Party"
  | "AMA"
  | "Concert"
  | "Other";

export interface EventItem {
  id: string;
  title: string;
  description: string;
  hostId: string;
  coverGradient: string;
  /** Uploaded banner URL. The gradient renders when absent. */
  coverImage?: string;
  category: EventCategory;
  startsAt: string; // ISO
  endsAt?: string;
  location: string;
  isOnline: boolean;
  capacity: number;
  price: string; // "Free" | "0.5 SOL"
  visibility: "public" | "private";
  requiresApproval: boolean;
  tokenGated: boolean;
  attendeeIds: string[];
  tags: string[];
  createdAt: number;
}

export type FriendStatus = "pending" | "accepted" | "declined";

export interface FriendRequest {
  id: string;
  from: string; // userId
  to: string; // userId
  status: FriendStatus;
  createdAt: number;
}

export type MessageScope = "event" | "dm";

export interface Message {
  id: string;
  scope: MessageScope;
  channelId: string; // eventId (event) | "dm:<a>__<b>" (dm)
  senderId: string;
  text: string;
  createdAt: number;
}
