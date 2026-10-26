import { describe, expect, it, vi } from "vitest";
import { DEFAULT_PAYMENT_LOADING_MESSAGE, getPaymentLoadingState, hidePaymentLoading, showPaymentLoading, subscribePaymentLoading } from "./loading";

describe("payment loading cover", () => {
  it("opens with a message, changes it, and closes", () => {
    hidePaymentLoading();
    expect(getPaymentLoadingState().open).toBe(false);
    showPaymentLoading();
    expect(getPaymentLoadingState()).toEqual({ open: true, message: DEFAULT_PAYMENT_LOADING_MESSAGE });
    showPaymentLoading("Confirming your payment…");
    expect(getPaymentLoadingState().message).toBe("Confirming your payment…");
    hidePaymentLoading();
    expect(getPaymentLoadingState().open).toBe(false);
  });
  it("tells listeners only when something changed", () => {
    hidePaymentLoading();
    const listener = vi.fn();
    const stop = subscribePaymentLoading(listener);
    hidePaymentLoading();
    expect(listener).not.toHaveBeenCalled();
    showPaymentLoading();
    hidePaymentLoading();
    expect(listener).toHaveBeenCalledTimes(2);
    stop();
    showPaymentLoading();
    expect(listener).toHaveBeenCalledTimes(2);
    hidePaymentLoading();
  });
});
