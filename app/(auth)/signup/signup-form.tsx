"use client";

import Link from "next/link";
import { useState } from "react";
import { postJson } from "@/components/action-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SignupForm() {
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (done) return <p className="text-sm">Thanks. AICTE will review your organisation. <Link className="text-primary underline" href="/login">Go to sign in</Link></p>;
  return (
    <form className="space-y-3" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true);
      setError("");
      const f = new FormData(e.currentTarget);
      try {
        await postJson("/api/app/verifier/signup", Object.fromEntries(f.entries()));
        setDone(true);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setBusy(false);
      }
    }}>
      <div className="space-y-1"><Label htmlFor="orgName">Organisation name</Label><Input id="orgName" name="orgName" required minLength={3} /></div>
      <div className="space-y-1"><Label htmlFor="type">Type</Label>
        <select id="type" name="type" className="h-10 w-full rounded-md border border-input bg-card px-2 text-sm"><option>Employer</option><option>Regulator</option></select>
      </div>
      <div className="space-y-1"><Label htmlFor="fullName">Your name</Label><Input id="fullName" name="fullName" required minLength={2} /></div>
      <div className="space-y-1"><Label htmlFor="email">Work email</Label><Input id="email" name="email" type="email" required /></div>
      <div className="space-y-1"><Label htmlFor="password">Password (at least 10 characters)</Label><Input id="password" name="password" type="password" required minLength={10} autoComplete="new-password" /></div>
      {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
      <Button type="submit" className="w-full" disabled={busy}>{busy ? "Sending…" : "Send for approval"}</Button>
    </form>
  );
}
