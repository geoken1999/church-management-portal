-- GST invoicing: churches give their billing details when they pay, every payment gets a
-- numbered tax invoice, and the invoice is emailed to the buyer. Prices are shown without
-- GST; 18% GST is added at payment. Only the server writes these tables.

-- The billing details a church invoices under (saved so they are filled in next time).
create table if not exists public.organization_billing_details (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  legal_name text not null,
  gstin text,
  address_line1 text not null,
  address_line2 text,
  city text not null,
  state text not null,
  pincode text not null,
  email text not null,
  phone text,
  updated_at timestamptz not null default now()
);
alter table public.organization_billing_details enable row level security;

drop policy if exists "Admins can view their billing details" on public.organization_billing_details;
create policy "Admins can view their billing details"
  on public.organization_billing_details for select to authenticated
  using (public.is_org_admin(organization_id));

-- Invoice numbers run in order within each financial year (April to March): KF/26-27/000001.
create table if not exists public.invoice_sequences (
  fy text primary key,
  last_number integer not null default 0
);
alter table public.invoice_sequences enable row level security;

create or replace function public.next_invoice_number(p_fy text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  insert into public.invoice_sequences (fy, last_number) values (p_fy, 1)
  on conflict (fy) do update set last_number = public.invoice_sequences.last_number + 1
  returning last_number into n;
  return n;
end;
$$;
revoke all on function public.next_invoice_number(text) from public, anon, authenticated;

-- Every invoice KingdomFlow issues to a church (separate from the invoices a church makes for its own
-- accounting), with the seller, buyer and layout as they were when it was issued.
create table if not exists public.platform_invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  invoice_number text not null unique,
  kind text not null check (kind in ('subscription', 'addon')),
  -- The payment it is for (the payment gateway's transaction id): one invoice per payment.
  reference text not null,
  issued_at timestamptz not null default now(),
  buyer jsonb not null,
  seller jsonb not null,
  template jsonb not null,
  line_items jsonb not null,
  subtotal numeric(12, 2) not null,
  cgst numeric(12, 2) not null default 0,
  sgst numeric(12, 2) not null default 0,
  igst numeric(12, 2) not null default 0,
  total numeric(12, 2) not null,
  gst_rate numeric(5, 4) not null default 0.18,
  place_of_supply text,
  email_sent_at timestamptz,
  email_error text,
  unique (kind, reference)
);
create index if not exists platform_invoices_org_idx on public.platform_invoices (organization_id, issued_at desc);
alter table public.platform_invoices enable row level security;

drop policy if exists "Admins can view their KingdomFlow invoices" on public.platform_invoices;
create policy "Admins can view their KingdomFlow invoices"
  on public.platform_invoices for select to authenticated
  using (public.is_org_admin(organization_id));

-- What was charged: amount stays the price before GST; these add the GST and the total paid.
alter table public.organization_addon_orders
  add column if not exists gst_amount numeric(12, 2) not null default 0,
  add column if not exists total_amount numeric(12, 2),
  add column if not exists invoice_id uuid references public.platform_invoices (id) on delete set null;

alter table public.subscription_charges
  add column if not exists gst_amount numeric(12, 2) not null default 0,
  add column if not exists invoice_id uuid references public.platform_invoices (id) on delete set null;

-- A public bucket for the logo shown on invoices.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('invoice-assets', 'invoice-assets', true, 1048576, array['image/jpeg', 'image/png'])
on conflict (id) do nothing;

-- Reversal (run manually if needed):
--   drop table if exists public.platform_invoices, public.invoice_sequences, public.organization_billing_details;
--   drop function if exists public.next_invoice_number(text);
--   alter table public.organization_addon_orders drop column if exists gst_amount, drop column if exists total_amount, drop column if exists invoice_id;
--   alter table public.subscription_charges drop column if exists gst_amount, drop column if exists invoice_id;
