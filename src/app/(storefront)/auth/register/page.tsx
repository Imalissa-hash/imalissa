import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth/AuthForm";

export const metadata: Metadata = {
  title: "Create Account",
  description: "Create a free Imalissa account for faster checkout, order tracking and member offers.",
  robots: { index: false },
};

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-md px-4 py-20">
          <div className="skeleton h-96 rounded-3xl" />
        </div>
      }
    >
      <AuthForm mode="register" />
    </Suspense>
  );
}
