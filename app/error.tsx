"use client";

import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">This page could not load</h1>
      <p className="text-sm text-muted-foreground">Your data is safe. Check your connection and try again.</p>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
