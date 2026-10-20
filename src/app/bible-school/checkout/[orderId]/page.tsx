import type { Metadata } from "next";
import { getCheckoutData } from "@/lib/lms/payments";
import { CourseCheckout } from "@/components/bible-school/CourseCheckout";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Pay for your course | KingdomFlow",
  robots: { index: false },
};

// Opened from the application form, the web portal or the app: opens the Razorpay payment window to pay the
// course fee. The order id in the address is the only thing identifying the payment, so the page shows
// nothing but the course, the church and the amount.
export default async function CourseCheckoutPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const valid = /^[0-9a-f-]{36}$/i.test(orderId);
  const data = valid ? await getCheckoutData(orderId) : null;
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      {data ? (
        <CourseCheckout
          title={data.title}
          organizationName={data.organizationName}
          amount={data.amount}
          checkout={data.checkout}
        />
      ) : (
        <p className="max-w-sm text-center text-sm text-muted-foreground">
          This payment link isn&apos;t valid any more. If you already paid, your
          course is ready. Otherwise go back and start again.
        </p>
      )}
    </div>
  );
}
