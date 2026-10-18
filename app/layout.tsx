import type { Metadata, Viewport } from "next";
import "./globals.css";

// Fonts: system stacks only (see globals.css). No network font fetch, so the
// app — and demo mode in particular — builds and renders fully offline.

export const metadata: Metadata = {
  title: "Trip Planner",
  description: "AI-powered itinerary planning grounded in authentic local knowledge.",
};

export const viewport: Viewport = {
  themeColor: "#faf6ee",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
