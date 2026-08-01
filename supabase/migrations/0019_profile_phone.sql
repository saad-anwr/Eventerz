-- ---------------------------------------------------------------------------
-- Eventerz - 0019: give the phone field somewhere to go
--
-- Run after 0018. Safe to re-run.
--
-- # What was wrong
--
-- The profile editor has always rendered a Phone input. Nothing ever stored it.
-- There was no `phone` column anywhere in the schema, `ProfileUpdate` had no
-- such key, and `save()` carried a comment saying so:
--
--   // `phone` is not a column on `profiles`; the form keeps it for future use.
--
-- So the field accepted a number, reported no error, and discarded it on every
-- save. A form control that silently does nothing is worse than a missing one:
-- the user believes they have given us a contact number.
--
-- # Why a separate table and not a column on `profiles`
--
-- `profiles` is world-readable by design - that is what makes discovery, guest
-- lists and host names work without an authenticated request. 0015 exists
-- precisely because `email` was sitting in that world-readable row, and it
-- fixed that with a column privilege:
--
--   revoke select (email) on public.profiles from anon, authenticated;
--
-- A phone number is at least as identifying as an email, so the same rule has
-- to apply. But `email` gets away with a bare revoke because nothing ever needs
-- to read it back to its owner - the client shows the address from the *session*
-- instead. A phone number has no session equivalent. Revoking `select (phone)`
-- would hide it from the one person entitled to see it, and the editor would
-- show an empty box over a stored value every time it loaded.
--
-- Postgres has no row-scoped column privilege, so the level the problem lives
-- at is the table. A separate table with RLS keyed on `auth.uid()` says the
-- thing that is actually true: this row belongs to one person, and only that
-- person may read or write it.
--
-- The same table is where any future private field belongs - a postal address,
-- a dietary note, an emergency contact - rather than each one repeating this
-- argument against `profiles`.
-- ---------------------------------------------------------------------------

create table if not exists public.profile_private (
  id uuid primary key references public.profiles (id) on delete cascade,
  /*
   * Free text, not a parsed number. International formats vary more than any
   * regex worth maintaining, and the failure mode of being strict here is
   * rejecting somebody's real number. Length is capped so the column cannot be
   * used as free storage.
   */
  phone text,
  updated_at timestamptz not null default now(),

  constraint profile_private_phone_len check (phone is null or length(phone) <= 32)
);

alter table public.profile_private enable row level security;

-- ---------------------------------------------------------------------------
-- Access: the owner, and nobody else
--
-- Three separate policies rather than `for all`, so the intent is readable and
-- an accidental widening of one does not widen the rest. There is deliberately
-- no DELETE policy: the row goes when the profile does, via the cascade above,
-- and `delete_my_account()` (0015) therefore clears it without needing to know
-- this table exists.
-- ---------------------------------------------------------------------------

drop policy if exists "own private profile is readable" on public.profile_private;
create policy "own private profile is readable" on public.profile_private
  for select using (id = auth.uid());

drop policy if exists "own private profile is insertable" on public.profile_private;
create policy "own private profile is insertable" on public.profile_private
  for insert with check (id = auth.uid());

drop policy if exists "own private profile is updatable" on public.profile_private;
create policy "own private profile is updatable" on public.profile_private
  for update using (id = auth.uid()) with check (id = auth.uid());

/*
 * Column grants, following 0017: RLS says which *rows*, grants say which
 * *columns*. Without this, `ALL` from project setup would let the owner write
 * `updated_at` to anything, which is a clock rather than an input.
 */
revoke insert, update, delete on public.profile_private from anon, authenticated;
grant select on public.profile_private to authenticated;
grant insert (id, phone) on public.profile_private to authenticated;
grant update (phone) on public.profile_private to authenticated;

-- `anon` has no business here at all; the table only ever holds one person's
-- own data and reading it requires being that person.
revoke all on public.profile_private from anon;

-- ---------------------------------------------------------------------------
-- Keep `updated_at` honest
-- ---------------------------------------------------------------------------

create or replace function public.touch_profile_private()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profile_private_touch on public.profile_private;
create trigger profile_private_touch
  before update on public.profile_private
  for each row execute function public.touch_profile_private();
