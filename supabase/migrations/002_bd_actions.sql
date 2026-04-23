-- BD optimisation action tracking
-- Tracks status of renegotiation opportunities surfaced in BD Optimisation tab
create table if not exists bd_actions (
  id             bigserial primary key,
  line_id        text         not null,
  line_name      text,
  partner        text,
  region         text         check (region in ('N','S','W')),
  status         text         not null default 'open'
                 check (status in ('open','in_progress','closed','won','lost')),
  priority_score numeric      default 0,
  monthly_savings numeric     default 0,
  owner          text,
  notes          text,
  opened_at      timestamptz  default now(),
  updated_at     timestamptz  default now(),
  closed_at      timestamptz,
  unique (line_id)
);

create index if not exists idx_bd_actions_status on bd_actions (status);
create index if not exists idx_bd_actions_partner on bd_actions (partner);
