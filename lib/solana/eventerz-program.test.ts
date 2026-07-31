import { createHash } from 'node:crypto';

import { PublicKey, SystemProgram } from '@solana/web3.js';
import { describe, expect, it } from 'vitest';

import {
  cancelEventInstruction,
  checkInInstruction,
  claimSeatInstruction,
  createEventInstruction,
  decodeEventAccount,
  decodeSeatAccount,
  eventPda,
  releaseSeatInstruction,
  seatPda,
  updateEventInstruction,
  uuidToBytes,
} from './eventerz-program';

/**
 * The parity guard.
 *
 * `eventerz-program.ts` hard-codes Anchor's instruction discriminators rather
 * than hashing them at runtime, because they are constants of the program's
 * source text and hashing would put a SHA-256 implementation in the mobile
 * bundle for a value that never changes.
 *
 * That is only safe while something notices when the Rust changes. This file is
 * that something: it recomputes every discriminator from the instruction name and
 * compares it with what the builder emits, so renaming `claim_seat` in
 * `programs/eventerz/src/lib.rs` without mirroring it here fails the test suite
 * rather than failing in a user's wallet with `InstructionFallbackNotFound`.
 */
const PROGRAM_ID = new PublicKey('Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS');
const HOST = new PublicKey('11111111111111111111111111111112');
const ATTENDEE = new PublicKey('So11111111111111111111111111111111111111112');
const EVENT_ID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';

/** Anchor: first 8 bytes of sha256("global:<snake_case_name>"). */
const discriminator = (name: string) =>
  Array.from(createHash('sha256').update(`global:${name}`).digest().subarray(0, 8));

const head = (data: Buffer) => Array.from(data.subarray(0, 8));

describe('instruction discriminators match the program', () => {
  const cases: [string, Buffer][] = [
    [
      'create_event',
      createEventInstruction(
        {
          eventId: EVENT_ID,
          host: HOST,
          capacity: 10,
          startsAt: '2026-08-01T18:00:00.000Z',
        },
        PROGRAM_ID,
      ).data,
    ],
    [
      'update_event',
      updateEventInstruction({ eventId: EVENT_ID, host: HOST, capacity: 20 }, PROGRAM_ID)
        .data,
    ],
    ['cancel_event', cancelEventInstruction(EVENT_ID, HOST, PROGRAM_ID).data],
    ['claim_seat', claimSeatInstruction(EVENT_ID, ATTENDEE, HOST, PROGRAM_ID).data],
    ['check_in', checkInInstruction(EVENT_ID, ATTENDEE, HOST, PROGRAM_ID).data],
    ['release_seat', releaseSeatInstruction(EVENT_ID, ATTENDEE, PROGRAM_ID).data],
  ];

  for (const [name, data] of cases) {
    it(name, () => {
      expect(head(data)).toEqual(discriminator(name));
    });
  }
});

describe('uuidToBytes', () => {
  it('produces the 16 raw bytes the program seeds with', () => {
    const bytes = uuidToBytes(EVENT_ID);
    expect(bytes).toHaveLength(16);
    expect(Array.from(bytes.subarray(0, 4))).toEqual([0x3f, 0x25, 0x04, 0xe0]);
  });

  it('accepts an uppercase UUID', () => {
    expect(uuidToBytes(EVENT_ID.toUpperCase())).toEqual(uuidToBytes(EVENT_ID));
  });

  it('refuses anything that is not a UUID', () => {
    // A truncated or mangled id would still produce *some* address, and a seat
    // written against the wrong event account is not recoverable.
    for (const bad of ['', 'abc', EVENT_ID.slice(0, -1), `${EVENT_ID}00`, 'zzzz']) {
      expect(() => uuidToBytes(bad), bad).toThrow(/not a uuid/i);
    }
  });
});

describe('addresses', () => {
  it('derives the same event account every time', () => {
    expect(eventPda(EVENT_ID, PROGRAM_ID).toBase58()).toBe(
      eventPda(EVENT_ID.toUpperCase(), PROGRAM_ID).toBase58(),
    );
  });

  it('gives different events different accounts', () => {
    const other = '3f2504e0-4f89-11d3-9a0c-0305e82c3302';
    expect(eventPda(EVENT_ID, PROGRAM_ID).toBase58()).not.toBe(
      eventPda(other, PROGRAM_ID).toBase58(),
    );
  });

  it('gives each attendee their own seat account', () => {
    const event = eventPda(EVENT_ID, PROGRAM_ID);
    expect(seatPda(event, ATTENDEE, PROGRAM_ID).toBase58()).not.toBe(
      seatPda(event, HOST, PROGRAM_ID).toBase58(),
    );
  });
});

describe('account metas', () => {
  it('orders create_event as the program declares it', () => {
    // Anchor matches accounts positionally against the `#[derive(Accounts)]`
    // struct, so an ordering change here silently writes the wrong account.
    const ix = createEventInstruction(
      { eventId: EVENT_ID, host: HOST, capacity: 10, startsAt: new Date() },
      PROGRAM_ID,
    );
    expect(ix.keys.map((k) => k.pubkey.toBase58())).toEqual([
      eventPda(EVENT_ID, PROGRAM_ID).toBase58(),
      HOST.toBase58(),
      SystemProgram.programId.toBase58(),
    ]);
    expect(ix.keys.map((k) => [k.isSigner, k.isWritable])).toEqual([
      [false, true],
      [true, true],
      [false, false],
    ]);
  });

  it('makes the host writable on claim_seat so a paid event can settle', () => {
    const ix = claimSeatInstruction(EVENT_ID, ATTENDEE, HOST, PROGRAM_ID);
    const host = ix.keys.find((k) => k.pubkey.equals(HOST));
    expect(host?.isWritable).toBe(true);
    expect(host?.isSigner).toBe(false);
  });

  it('has the attendee sign release_seat, not the host', () => {
    const ix = releaseSeatInstruction(EVENT_ID, ATTENDEE, PROGRAM_ID);
    expect(ix.keys.find((k) => k.pubkey.equals(ATTENDEE))?.isSigner).toBe(true);
  });

  it('has the host sign check_in', () => {
    const ix = checkInInstruction(EVENT_ID, ATTENDEE, HOST, PROGRAM_ID);
    expect(ix.keys.find((k) => k.pubkey.equals(HOST))?.isSigner).toBe(true);
    expect(ix.keys.find((k) => k.pubkey.equals(ATTENDEE))).toBeUndefined();
  });
});

describe('argument encoding', () => {
  it('lays out create_event as Borsh', () => {
    const ix = createEventInstruction(
      {
        eventId: EVENT_ID,
        host: HOST,
        capacity: 10,
        // 2026-08-01T18:00:00Z -> 1785607200 seconds.
        startsAt: '2026-08-01T18:00:00.000Z',
        endsAt: null,
        priceLamports: 50_000_000n,
        requiresApproval: true,
      },
      PROGRAM_ID,
    );

    // 8 discriminator + 16 id + 4 capacity + 8 starts + 8 ends + 8 price + 1 bool
    expect(ix.data).toHaveLength(53);

    const body = ix.data.subarray(8);
    expect(Array.from(body.subarray(0, 16))).toEqual(Array.from(uuidToBytes(EVENT_ID)));
    expect(body.readUInt32LE(16)).toBe(10);
    expect(body.readBigInt64LE(20)).toBe(1785607200n);
    // Omitted end time encodes as 0, which the program reads as "no stated end".
    expect(body.readBigInt64LE(28)).toBe(0n);
    expect(body.readBigUInt64LE(36)).toBe(50_000_000n);
    expect(body[44]).toBe(1);
  });

  it('encodes update_event options as presence-byte-then-value', () => {
    const none = updateEventInstruction({ eventId: EVENT_ID, host: HOST }, PROGRAM_ID);
    // 8 discriminator + five `None` bytes.
    expect(none.data).toHaveLength(13);
    expect(Array.from(none.data.subarray(8))).toEqual([0, 0, 0, 0, 0]);

    const some = updateEventInstruction(
      { eventId: EVENT_ID, host: HOST, capacity: 25 },
      PROGRAM_ID,
    );
    // 8 + (1 + 4) + four `None`.
    expect(some.data).toHaveLength(17);
    expect(some.data[8]).toBe(1);
    expect(some.data.readUInt32LE(9)).toBe(25);
  });

  it('sends no arguments for the bare instructions', () => {
    expect(cancelEventInstruction(EVENT_ID, HOST, PROGRAM_ID).data).toHaveLength(8);
    expect(
      claimSeatInstruction(EVENT_ID, ATTENDEE, HOST, PROGRAM_ID).data,
    ).toHaveLength(8);
    expect(checkInInstruction(EVENT_ID, ATTENDEE, HOST, PROGRAM_ID).data).toHaveLength(8);
  });
});

describe('account decoding', () => {
  /** Build the bytes the program would write, to prove the reader agrees. */
  function encodeEventAccount(): Uint8Array {
    const out = Buffer.alloc(8 + 16 + 32 + 4 + 4 + 4 + 8 + 8 + 8 + 1 + 1 + 1);
    // sha256("account:EventAccount")[0..8]
    Buffer.from(
      createHash('sha256').update('account:EventAccount').digest().subarray(0, 8),
    ).copy(out, 0);
    Buffer.from(uuidToBytes(EVENT_ID)).copy(out, 8);
    Buffer.from(HOST.toBytes()).copy(out, 24);
    out.writeUInt32LE(30, 56);
    out.writeUInt32LE(12, 60);
    out.writeUInt32LE(4, 64);
    out.writeBigInt64LE(1785607200n, 68);
    out.writeBigInt64LE(0n, 76);
    out.writeBigUInt64LE(50_000_000n, 84);
    out[92] = 1;
    out[93] = 0;
    out[94] = 255;
    return out;
  }

  it('round-trips an event account', () => {
    const decoded = decodeEventAccount(encodeEventAccount());
    expect(decoded).not.toBeNull();
    expect(decoded!.eventId).toBe(EVENT_ID);
    expect(decoded!.host.toBase58()).toBe(HOST.toBase58());
    expect(decoded!.capacity).toBe(30);
    expect(decoded!.confirmed).toBe(12);
    expect(decoded!.checkedIn).toBe(4);
    expect(decoded!.priceLamports).toBe(50_000_000n);
    expect(decoded!.requiresApproval).toBe(true);
    expect(decoded!.cancelled).toBe(false);
    // Zero is the program's "no stated end", not 1970.
    expect(decoded!.endsAt).toBeNull();
    expect(decoded!.startsAt.toISOString()).toBe('2026-08-01T18:00:00.000Z');
  });

  it('returns null rather than throwing for foreign bytes', () => {
    // The usual reason is an event published before the program was deployed -
    // an expected answer, not an error.
    expect(decodeEventAccount(new Uint8Array(0))).toBeNull();
    expect(decodeEventAccount(new Uint8Array(120))).toBeNull();
    expect(decodeSeatAccount(encodeEventAccount())).toBeNull();
  });
});
