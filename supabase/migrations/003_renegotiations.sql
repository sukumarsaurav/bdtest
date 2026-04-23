-- Renegotiation tracking: pipeline from proposed → effective
-- Run this in Supabase SQL editor before using the renegotiation UI.

create table if not exists renegotiations (
  id              bigserial    primary key,
  line_id         text         not null,
  line_name       text,
  partner         text,
  region          text         check (region in ('N','S','W')),
  current_min_g   numeric      not null,
  target_min_g    numeric      not null,
  status          text         not null default 'proposed'
                  check (status in ('proposed','in_discussion','agreed','effective','rejected')),
  priority_score  numeric      default 0,
  monthly_savings numeric      default 0,
  owner           text,
  notes           text,
  created_at      timestamptz  default now(),
  updated_at      timestamptz  default now(),
  effective_at    timestamptz
);

create index if not exists idx_renegotiations_status on renegotiations (status);
create index if not exists idx_renegotiations_line on renegotiations (line_id);
create index if not exists idx_renegotiations_partner on renegotiations (partner);
