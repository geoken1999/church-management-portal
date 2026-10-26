// A full-screen "getting your payment ready" cover, shared by every one-time checkout. A payment takes a few
// seconds to start (an order is created on the server, then the gateway's window loads), and without a cue the
// person taps Pay again. The checkout screens show it when Pay is tapped; openRazorpayCheckout hides it once the
// payment window is open and brings it back, with a different message, while the result is being confirmed.
// Kept as a tiny store so any screen can use it without wrapping the page in a provider.

export interface PaymentLoadingState {
  open: boolean;
  message: string;
}

const CLOSED: PaymentLoadingState = { open: false, message: "" };
let state: PaymentLoadingState = CLOSED;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((listener) => listener());

export const DEFAULT_PAYMENT_LOADING_MESSAGE = "Getting your secure payment ready…";

export function showPaymentLoading(message: string = DEFAULT_PAYMENT_LOADING_MESSAGE): void {
  state = { open: true, message };
  emit();
}

export function hidePaymentLoading(): void {
  if (!state.open) return;
  state = CLOSED;
  emit();
}

export function subscribePaymentLoading(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const getPaymentLoadingState = (): PaymentLoadingState => state;
export const getServerPaymentLoadingState = (): PaymentLoadingState => CLOSED;
