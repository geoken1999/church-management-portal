import { Suspense } from "react";
import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { SignupForm } from "@/components/auth/SignupForm";
import { AuthBrandHeader } from "@/components/auth/AuthBrandHeader";

export const metadata: Metadata = {
  title: "Create your account | KingdomFlow",
};

export default function SignupPage() {
  return (
    <Card size="lg">
      <CardHeader>
        <AuthBrandHeader />
        <CardTitle className="text-xl">Create your account</CardTitle>
        <CardDescription>
          Join KingdomFlow and manage your church from one connected platform.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense fallback={null}>
          <SignupForm />
        </Suspense>
      </CardContent>
    </Card>
  );
}
