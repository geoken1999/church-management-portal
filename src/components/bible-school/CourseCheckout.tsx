"use client";

import { useEffect, useRef, useState } from "react";
import { openRazorpayCheckout } from "@/lib/razorpay/browser";
import type { RazorpayCheckout } from "@/lib/razorpay/checkout";
import { Button } from "@/components/ui/button";

// Shows what is being paid for and opens Razorpay's payment window straight away; the button is there in
// case the automatic step is blocked.
export function CourseCheckout({
  title,
  organizationName,
  amount,
  checkout,
}: {
  title: string;
  organizationName: string;
  amount: number;
  checkout: RazorpayCheckout;
}) {
  const started = useRef(false);
  const [problem, setProblem] = useState(false);
  const open = () => {
    setProblem(false);
    openRazorpayCheckout(checkout).catch(() => setProblem(true));
  };
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const timer = setTimeout(open, 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="w-full max-w-sm space-y-4 rounded-xl border border-border bg-card p-6 text-center shadow-sm">
      <p className="text-sm text-muted-foreground">{organizationName}</p>
      <h1 className="font-heading text-xl font-bold">{title}</h1>
      <p className="text-3xl font-bold">₹{amount.toFixed(2)}</p>
      <p className="text-sm text-muted-foreground">
        {problem
          ? "Couldn't open the payment window. Check your connection and try again."
          : "Opening the secure payment window..."}
      </p>
      <Button type="button" className="w-full" onClick={open}>
        Pay now
      </Button>
    </div>
  );
}
