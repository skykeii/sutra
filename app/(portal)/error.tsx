"use client";

import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-lg border bg-card p-6 text-center">
      <h1 className="text-lg font-semibold">This page could not load</h1>
      <p className="mt-2 text-sm text-muted-foreground">Your data is safe. Check your connection and try again.</p>
      <Button className="mt-4" onClick={reset}>Try again</Button>
    </div>
  );
}
