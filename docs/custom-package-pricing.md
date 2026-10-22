# Custom package and add-on pricing

One table, `EXTRA_PRICING` in `src/lib/plans/config.ts`, drives both the **add-on packs** (Billing page) and the **custom package**
wizard (Super Admin → Onboarding → Modules & credits), so the two always agree. Prices are rupees a month **before GST**.

| Limit | Included (Starter) | One block | Price per block |
| --- | --- | --- | --- |
| Storage | 20 GB | 20 GB | ₹50 |
| Members | 350 | 100 | ₹30 |
| Branches | 3 | 1 | ₹10 |
| Forms | 20 | 10 | ₹20 |
| Chat groups | 3 | 1 | ₹20 |
| Admin logins | 1 | 1 | ₹20 |
| Staff logins | 2 | 1 | ₹5 |
| Instagram accounts | 1 | 1 | ₹50 |
| YouTube channels | 1 | 1 | ₹50 |
| Emails a month | 1,000 | 1,000 | ₹50 |
| SMS a month | 50 | 20 | ₹30 |
| WhatsApp a month | 2,500 | 500 | ₹50 |
| AI replies a month | 100 | 100 | ₹50 |

- A custom package starts at the Starter number for every limit. The wizard moves a limit one block at a time (+ and −);
  the price is worked out from the count and cannot be typed. The server snaps any count to a block and recalculates the
  price (`cleanCredits`, `src/lib/onboarding/config.ts`).
- Mobile app features are the Starter's 15 for everyone and are not sold. K-Connect minutes are priced by hand (no
  block rule). Members, branches, forms and chat groups can still be set to "no limit", priced by hand.
- **Add-on packs** (storage, emails, SMS, WhatsApp, AI): one block at the rate above, or five blocks at the same rate per
  block (for example 20 SMS ₹30 or 100 SMS ₹150). Branches, forms, groups, logins and social accounts are not sold as
  add-ons; they are changed by upgrading the plan or through a custom package.
