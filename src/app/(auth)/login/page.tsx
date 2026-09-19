import { Suspense } from "react";
import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { LoginForm } from "@/components/auth/LoginForm";
import { AuthBrandHeader } from "@/components/auth/AuthBrandHeader";

export const metadata: Metadata = {
  title: "Sign in | KingdomFlow",
};

export default function LoginPage() {
  return (
    <Card size="lg">
      <CardHeader>
        <AuthBrandHeader />
        <CardTitle className="text-xl">Welcome back</CardTitle>
        <CardDescription>Sign in to your KingdomFlow account.</CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </CardContent>
    </Card>
  );
}
