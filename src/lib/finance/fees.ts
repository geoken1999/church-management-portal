// Platform fee on 'shared'-service Fund Raiser giving links only — 'own'
// account fundraisers bypass the platform's Razorpay account entirely, so
// nothing here ever applies to them. The donation itself is always
// recorded at the full amount the donor gave (accurate for receipts/
// reporting); the fee only reduces what's actually owed to the church out
// of the shared account.
export const SHARED_SERVICE_FEE_RATE = 0.025;

export function sharedServiceFee(collectedAmount: number): number {
  return collectedAmount * SHARED_SERVICE_FEE_RATE;
}

export function sharedServiceNetAmount(collectedAmount: number): number {
  return collectedAmount - sharedServiceFee(collectedAmount);
}
