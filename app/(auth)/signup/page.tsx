"use client";

import { useActionState } from "react";
import Link from "next/link";
import {
  signUpWithPassword,
  type AuthActionState,
} from "@/app/actions/auth";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { AuthShell } from "@/components/AuthShell";

const initialState: AuthActionState = undefined;

export default function SignupPage() {
  const [state, action, pending] = useActionState(
    signUpWithPassword,
    initialState
  );

  return (
    <AuthShell>
      <div className="w-full">
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-bold text-ink">
            Create an account
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            Start planning trips with AI.
          </p>
        </div>

        <form action={action} className="flex flex-col gap-4">
          <Input
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@example.com"
          />
          <Input
            label="Password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            placeholder="••••••••"
            hint="At least 6 characters."
          />
          {state?.error ? (
            <p className="text-sm text-red-600" role="alert">
              {state.error}
            </p>
          ) : null}
          <Button type="submit" loading={pending} className="w-full mt-1">
            Create account
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-600">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-semibold text-brand-700 hover:text-brand-900"
          >
            Sign in
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
