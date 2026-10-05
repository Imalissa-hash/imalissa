import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth/AuthForm";

export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to your Imalissa account to track orders, save addresses and more.",
  robots: { index: false },
};

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-md px-4 py-20">
          <div className="skeleton h-96 rounded-3xl" />
        </div>
      }
    >
      <AuthForm mode="login" />
    </Suspense>
  );
}
