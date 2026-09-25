-- Invoices for the Accounting module — ad-hoc bills generated on demand
-- (hall rental, vendor billing, anything the church needs to invoice
-- someone for), printable from the dashboard. Unlike expenses/offerings/
-- donations, an invoice doesn't feed the income/expense ledger by itself —
-- it's a billing document, not a recorded transaction; if it gets paid,
-- that payment is still logged separately as an offering/donation/
-- expense, same as any other money movement. Same permission shape as the
-- rest of Finance/Accounting: admin-floor RLS, delegable via tab
-- permissions, gated by the Finance plan feature at the app layer.

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  invoice_number text not null,
  branch_id uuid references public.branches (id) on delete set null,
  bill_to_name text not null check (length(trim(bill_to_name)) >= 2),
  bill_to_email text,
  bill_to_address text,
  issue_date date not null,
  due_date date,
  notes text,
  status text not null default 'unpaid' check (status in ('unpaid', 'paid', 'cancelled')),
  subtotal numeric(12, 2) not null default 0,
  tax_rate numeric(5, 2) not null default 0 check (tax_rate >= 0 and tax_rate <= 100),
  tax_amount numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, invoice_number)
);

create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  description text not null check (length(trim(description)) >= 1),
  quantity numeric(12, 2) not null default 1 check (quantity > 0),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  amount numeric(12, 2) not null check (amount >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists invoices_organization_id_idx on public.invoices (organization_id);
create index if not exists invoices_issue_date_idx on public.invoices (issue_date);
create index if not exists invoice_items_invoice_id_idx on public.invoice_items (invoice_id);
create index if not exists invoice_items_organization_id_idx on public.invoice_items (organization_id);

drop trigger if exists set_invoices_updated_at on public.invoices;
create trigger set_invoices_updated_at
  before update on public.invoices
  for each row execute function public.set_updated_at();

-- Belt-and-braces, same pattern as expenses/accounting_categories
-- (migration 0056): a line item's organization_id must match its parent
-- invoice's.
create or replace function public.check_invoice_item_org()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from public.invoices i where i.id = new.invoice_id and i.organization_id = new.organization_id
  ) then
    raise exception 'organization_id must match the parent invoice''s organization';
  end if;
  return new;
end;
$$;

drop trigger if exists check_invoice_item_org on public.invoice_items;
create trigger check_invoice_item_org
  before insert or update of invoice_id, organization_id on public.invoice_items
  for each row execute function public.check_invoice_item_org();

alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;

-- invoices
drop policy if exists "Members can view invoices" on public.invoices;
create policy "Members can view invoices"
  on public.invoices for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "Admins can create invoices" on public.invoices;
create policy "Admins can create invoices"
  on public.invoices for insert to authenticated
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can update invoices" on public.invoices;
create policy "Admins can update invoices"
  on public.invoices for update to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can delete invoices" on public.invoices;
create policy "Admins can delete invoices"
  on public.invoices for delete to authenticated
  using (public.is_org_admin(organization_id));

-- invoice_items (viewed/managed alongside their parent invoice)
drop policy if exists "Members can view invoice items" on public.invoice_items;
create policy "Members can view invoice items"
  on public.invoice_items for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "Admins can add invoice items" on public.invoice_items;
create policy "Admins can add invoice items"
  on public.invoice_items for insert to authenticated
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can update invoice items" on public.invoice_items;
create policy "Admins can update invoice items"
  on public.invoice_items for update to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can delete invoice items" on public.invoice_items;
create policy "Admins can delete invoice items"
  on public.invoice_items for delete to authenticated
  using (public.is_org_admin(organization_id));
