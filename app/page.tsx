import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";

/**
 * Root route: redirect to /dashboard if authenticated, otherwise to /login.
 * Guards Supabase env access so build succeeds without real credentials.
 */
export default async function Home() {
  let isAuthenticated = false;
  try {
    const user = await getUser();
    isAuthenticated = user !== null;
  } catch {
    // Supabase not configured — default to login
  }

  if (isAuthenticated) {
    redirect("/dashboard");
  } else {
    redirect("/login");
  }
}
