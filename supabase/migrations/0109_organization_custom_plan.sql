-- Lets a platform admin override individual plan "rules" (quotas, caps,
-- feature flags, support SLA) for a specific org — fulfillment for the
-- landing page's "Custom" tier (a completely manual plan with no fixed
-- price, resolved outside this table entirely). Null means "use the
-- plain named plan (Starter/Growth/Pro) unchanged"; when set, it's a
-- complete override object (see resolvePlanLimits in
-- src/lib/plans/config.ts) covering every rule field except id/name/
-- price, which stay driven by organizations.plan — pricing for a Custom
-- deal is still handled manually (comp via the existing "Set plan"
-- mechanism), only the rules vary here.
alter table public.organizations
  add column if not exists custom_plan_limits jsonb null;
