-- Bidirectional guardian/child invitations.
-- Invitation secrets are never stored in plaintext.

create table if not exists public.family_invitations (
  id uuid primary key default gen_random_uuid(),
  inviter_user_id uuid not null references auth.users (id) on delete cascade,
  direction text not null,
  channel text not null,
  invitee_email text,
  invitee_phone text,
  child_user_id uuid references auth.users (id) on delete cascade,
  guardian_user_id uuid references auth.users (id) on delete cascade,
  child_name text,
  child_date_of_birth date,
  relationship text not null default 'parent',
  token_hash text not null unique,
  status text not null default 'pending',
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint family_invitations_direction_check
    check (direction in ('child_invites_guardian', 'guardian_invites_child')),
  constraint family_invitations_channel_check
    check (channel in ('email', 'sms')),
  constraint family_invitations_status_check
    check (status in ('pending', 'accepted', 'expired', 'revoked')),
  constraint family_invitations_relationship_check
    check (relationship in ('parent', 'legal_guardian', 'other')),
  constraint family_invitations_contact_check
    check (
      (channel = 'email' and invitee_email is not null and invitee_phone is null)
      or
      (channel = 'sms' and invitee_phone is not null and invitee_email is null)
    ),
  constraint family_invitations_direction_parties_check
    check (
      (direction = 'child_invites_guardian' and child_user_id = inviter_user_id)
      or
      (direction = 'guardian_invites_child' and guardian_user_id = inviter_user_id)
    )
);

create index if not exists family_invitations_pending_inviter_idx
  on public.family_invitations (inviter_user_id, created_at desc)
  where status = 'pending';

create index if not exists family_invitations_pending_expiry_idx
  on public.family_invitations (expires_at)
  where status = 'pending';

alter table public.family_invitations enable row level security;
revoke all on public.family_invitations from anon, authenticated;
grant all on public.family_invitations to service_role;

