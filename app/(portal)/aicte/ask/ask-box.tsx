"use client";

import { Send } from "lucide-react";
import { useState } from "react";
import { postJson } from "@/components/action-button";
import { AutoChart } from "@/components/charts-lazy";
import { DataTable } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Answer {
  answered: boolean;
  message?: string;
  suggestions?: string[];
  title?: string;
  summary?: string;
  columns?: { key: string; header: string }[];
  rows?: Record<string, string | number | null>[];
  chart?: { x: string; y: string };
}

export function AskBox({ examples, aiOn }: { examples: string[]; aiOn: boolean }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const ask = async (text: string) => {
    setQuestion(text);
    setBusy(true);
    setError("");
    setAnswer(null);
    try {
      setAnswer(await postJson<Answer>("/api/app/ask", { question: text }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const chips = (list: string[]) => (
    <div className="flex flex-wrap gap-2">
      {list.map((q) => <button key={q} type="button" disabled={busy} onClick={() => ask(q)} className="rounded-full border bg-card px-3 py-1 text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{q}</button>)}
    </div>
  );
  return (
    <div className="space-y-4">
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (question.trim().length >= 3) void ask(question.trim()); }}>
        <Input aria-label="Your question" maxLength={300} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask about admissions, quotas, alerts…" />
        <Button type="submit" disabled={busy}><Send className="h-4 w-4" aria-hidden />{busy ? "Thinking…" : "Ask"}</Button>
      </form>
      <div><p className="mb-2 text-sm font-medium">Example questions</p>{chips(examples)}</div>
      <p className="text-xs text-muted-foreground">{aiOn ? "Claude picks a question from a fixed list of approved queries and sees only totals." : "Running in keyword mode: no AI key is set, so questions are matched to approved queries by their words."} It cannot write its own queries or see student records.</p>
      {error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-900">{error}</p>}
      {answer && !answer.answered && (
        <div className="space-y-2 rounded-md border bg-amber-50 p-3">
          <p className="font-medium">{answer.message}</p>
          <p className="text-sm">Try one of these:</p>
          {chips(answer.suggestions ?? [])}
        </div>
      )}
      {answer?.answered && (
        <div className="space-y-3" aria-live="polite">
          <div>
            <h2 className="font-semibold">{answer.title}</h2>
            <p>{answer.summary}</p>
          </div>
          {answer.chart && (answer.rows?.length ?? 0) > 1 && <AutoChart rows={answer.rows!} x={answer.chart.x} y={answer.chart.y} />}
          <DataTable
            rows={(answer.rows ?? []).map((r, i) => ({ ...r, _key: String(i) }))}
            rowKey={(r) => String(r._key)}
            empty="Nothing matches right now."
            columns={(answer.columns ?? []).map((c) => ({ key: c.key, header: c.header }))}
          />
        </div>
      )}
    </div>
  );
}
