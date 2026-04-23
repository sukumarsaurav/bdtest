-- BP Cost Snapshot actuals (per partner per week)
-- Source: bookmarklet upload from BP Cost Hub Excel
create table if not exists bp_cost_actuals (
  id              bigserial primary key,
  partner         text         not null,
  bp_code         text,
  region          text         check (region in ('N','S','W')),
  year_week       text         not null,           -- 'YYYY-WW'
  driver_cost     numeric      default 0,
  fuel_cost       numeric      default 0,
  toll_cost       numeric      default 0,
  maint_cost      numeric      default 0,
  insurance_cost  numeric      default 0,
  rto_cost        numeric      default 0,
  emi_cost        numeric      default 0,
  other_cost      numeric      default 0,
  total_cost      numeric generated always as (
    coalesce(driver_cost,0)
    + coalesce(fuel_cost,0)
    + coalesce(toll_cost,0)
    + coalesce(maint_cost,0)
    + coalesce(insurance_cost,0)
    + coalesce(rto_cost,0)
    + coalesce(emi_cost,0)
    + coalesce(other_cost,0)
  ) stored,
  uploaded_at     timestamptz  default now(),
  unique (partner, year_week)
);

create index if not exists idx_bp_cost_actuals_week on bp_cost_actuals (year_week);
create index if not exists idx_bp_cost_actuals_partner on bp_cost_actuals (partner);
