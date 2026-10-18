"use client";

import { useState, useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  signInWithPassword,
  signInWithMagicLink,
  type AuthActionState,
} from "@/app/actions/auth";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

type AuthMode = "password" | "magic_link";

const initialState: AuthActionState = undefined;

export function LoginForm() {
  const searchParams = useSearchParams();
  const message = searchParams.get("message");
  const errorParam = searchParams.get("error");
  const redirectTo = searchParams.get("redirectTo") ?? "/dashboard";

  const [mode, setMode] = useState<AuthMode>("password");

  const [passwordState, passwordAction, passwordPending] = useActionState(
    signInWithPassword,
    initialState
  );

  const [magicState, magicAction, magicPending] = useActionState(
    signInWithMagicLink,
    initialState
  );

  const bannerMessage =
    message === "check_email"
      ? "Check your email — we sent a confirmation link."
      : message === "magic_link_sent"
      ? "Magic link sent! Check your email."
      : null;

  const errorMessage =
    errorParam === "auth_callback"
      ? "The sign-in link was invalid or has expired. Please try again."
      : errorParam === "server_config"
      ? "Server configuration error. Please contact support."
      : null;

  return (
    <div className="w-full">
      <div className="mb-6 text-center">
        <h1 className="text-3xl font-bold text-ink">
          Sign in to Trip Planner
        </h1>
        <p className="mt-1.5 text-sm text-zinc-600">Plan your next adventure.</p>
      </div>

      {bannerMessage ? (
        <div className="mb-4 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
          {bannerMessage}
        </div>
      ) : null}

      {errorMessage ? (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
          {errorMessage}
        </div>
      ) : null}

      {/* Mode toggle */}
      <div className="mb-6 flex rounded-full border border-line bg-paper-2 p-1">
        <button
          type="button"
          onClick={() => setMode("password")}
          className={[
            "min-h-10 flex-1 rounded-full text-sm font-medium transition-colors",
            mode === "password"
              ? "bg-surface text-ink shadow-card"
              : "text-zinc-600 hover:text-zinc-900",
          ].join(" ")}
        >
          Password
        </button>
        <button
          type="button"
          onClick={() => setMode("magic_link")}
          className={[
            "min-h-10 flex-1 rounded-full text-sm font-medium transition-colors",
            mode === "magic_link"
              ? "bg-surface text-ink shadow-card"
              : "text-zinc-600 hover:text-zinc-900",
          ].join(" ")}
        >
          Magic link
        </button>
      </div>

      {mode === "password" ? (
        <form action={passwordAction} className="flex flex-col gap-4">
          <input type="hidden" name="redirectTo" value={redirectTo} />
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
            autoComplete="current-password"
            required
            placeholder="••••••••"
          />
          {passwordState?.error ? (
            <p className="text-sm text-red-600" role="alert">
              {passwordState.error}
            </p>
          ) : null}
          <Button type="submit" loading={passwordPending} className="w-full mt-1">
            Sign in
          </Button>
        </form>
      ) : (
        <form action={magicAction} className="flex flex-col gap-4">
          <Input
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@example.com"
            hint="We will send a one-click sign-in link."
          />
          {magicState?.error ? (
            <p className="text-sm text-red-600" role="alert">
              {magicState.error}
            </p>
          ) : null}
          <Button type="submit" loading={magicPending} className="w-full mt-1">
            Send magic link
          </Button>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-zinc-600">
        Don&apos;t have an account?{" "}
        <Link
          href="/signup"
          className="font-semibold text-brand-700 hover:text-brand-900"
        >
          Sign up
        </Link>
      </p>
    </div>
  );
}
