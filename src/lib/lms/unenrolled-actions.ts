"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth";
import { retryEnrolment } from "@/lib/lms/unenrolled";
import { logPlatformEvent } from "@/lib/platform-events/log";

export interface RetryState {
  error?: string;
  success?: boolean;
}

export async function retryEnrolmentAction(orderId: string): Promise<RetryState> {
  const admin = await requirePlatformAdmin();
  const result = await retryEnrolment(orderId);
  await logPlatformEvent({
    level: result.ok ? "info" : "warning",
    source: "platform_admin",
    message: `Platform admin (${admin.email ?? "unknown"}) retried the enrolment of a paid Bible School order: ${result.ok ? "enrolled" : result.error}`,
    metadata: { orderId },
  });
  revalidatePath("/platform-admin/unenrolled-payments");
  return result.ok ? { success: true } : { error: result.error };
}
