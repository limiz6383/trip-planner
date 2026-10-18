import { Suspense } from "react";
import { LoginForm } from "./LoginForm";
import { AuthShell } from "@/components/AuthShell";

export default function LoginPage() {
  return (
    <AuthShell>
      <Suspense
        fallback={
          <div className="w-full animate-pulse">
            <div className="mb-8 text-center">
              <div className="mx-auto h-8 w-48 rounded-lg bg-zinc-200" />
            </div>
            <div className="h-10 rounded-lg bg-zinc-200" />
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
