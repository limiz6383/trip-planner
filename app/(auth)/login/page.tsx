import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-zinc-50 px-4">
      <Suspense
        fallback={
          <div className="w-full max-w-sm animate-pulse">
            <div className="mb-8 text-center">
              <div className="mx-auto h-8 w-48 rounded-lg bg-zinc-200" />
            </div>
            <div className="h-10 rounded-lg bg-zinc-200" />
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </main>
  );
}
