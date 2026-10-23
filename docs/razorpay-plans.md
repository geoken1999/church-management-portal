# Razorpay subscription plans

KingdomFlow sells Starter, Growth and Pro on Razorpay Subscriptions, charged monthly or yearly. Billing runs on
KingdomFlow's own Razorpay account; the church authorises once (UPI Autopay, card or e-mandate) and Razorpay
collects each cycle and tells the app through the webhook.

## How a plan is picked

| Sale | Razorpay plan |
|---|---|
| Starter / Growth / Pro, monthly or yearly | The plan id in `RAZORPAY_PLAN_ID_*` (below), after the checkout checks it charges the right amount and cycle |
| Same, but the variable is empty or the plan doesn't match | A plan created for that checkout (the church pays the right amount; a mismatch is logged and shown on Super Admin → Health) |
| A custom tenant package (onboarding) | Always a plan created for that tenant (the amount differs per tenant), monthly |

## What each plan must be

Amount = listed price + 18% GST, in INR. Billing cycle every 1 month (or 1 year).

| Variable | Plan | Cycle | Amount incl. GST |
|---|---|---|---|
| `RAZORPAY_PLAN_ID_BASIC` | Starter | monthly | ₹1,768.82 (₹1,499 + GST) |
| `RAZORPAY_PLAN_ID_BASIC_ANNUAL` | Starter | yearly | ₹17,698.82 (₹14,999 + GST) |
| `RAZORPAY_PLAN_ID_PREMIUM` | Growth | monthly | ₹3,538.82 (₹2,999 + GST) |
| `RAZORPAY_PLAN_ID_PREMIUM_ANNUAL` | Growth | yearly | ₹35,398.82 (₹29,999 + GST) |
| `RAZORPAY_PLAN_ID_PRO` | Pro | monthly | ₹5,898.82 (₹4,999 + GST) |
| `RAZORPAY_PLAN_ID_PRO_ANNUAL` | Pro | yearly | ₹58,998.82 (₹49,999 + GST) |

Razorpay plans can't be edited or deleted. After a price change create new plans and replace the ids.
`node --env-file=.env.local scripts/create-razorpay-plans.mjs` lists them; add `--create` to create them in
whichever mode the keys are for.

## To go live

1. **Razorpay account:** KYC/activation done, **Subscriptions** enabled (Dashboard → Subscriptions), and UPI
   Autopay / e-mandate turned on for recurring payments.
2. **Live API keys** (Settings → API Keys): `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and
   `NEXT_PUBLIC_RAZORPAY_KEY_ID` (the same Key ID; the checkout runs in the browser). Test keys start `rzp_test_`.
3. **Live plans:** run the script above with the live keys and `--create`; put the six `RAZORPAY_PLAN_ID_*`
   lines in Vercel. Test-mode plan ids don't exist in live mode.
4. **Webhook** (Settings → Webhooks): URL `{site}/api/razorpay/webhook`, a secret of your choice in
   `RAZORPAY_WEBHOOK_SECRET`, events `subscription.*` and `order.paid`.
5. **Vercel environment variables** set for Production, then redeploy.
6. **Business details:** seller name, GSTIN and state for the tax invoices, set where invoices are configured
   (Super Admin → Invoice template).
7. **Check:** Super Admin → Health → Razorpay shows operational with no plan warnings, then make one real
   subscription and cancel it from the Billing page.

## Notes

- Cancelling keeps access until the end of the paid period (a month, or a year for yearly plans) and there is no
  refund for it.
- A church can't switch between monthly and yearly or between plans while subscribed: cancel first, then
  subscribe again after the period ends.
- Yearly subscriptions run for 10 yearly charges; monthly for 120 (both "until cancelled").
