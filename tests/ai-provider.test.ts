import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { activeProvider, aiLabel, callModel, looksLikePii, resetAiCache, warmUpModel } from "@/lib/ai/provider";
import { selectQuery, summarise } from "@/lib/ask/match";

const rpc = vi.fn(async () => ({ error: null }));
const admin = { rpc } as unknown as SupabaseClient;
const CALL = { templateId: "test.v1", system: "sys", user: "How many alerts?", maxTokens: 100 };

const reply = (content: unknown, status = 200) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status });
const fetchMock = vi.fn<typeof fetch>();

function useGemini() {
  vi.stubEnv("AI_PROVIDER", "gemini");
  vi.stubEnv("AI_MODEL", "test-model");
  vi.stubEnv("GEMINI_API_KEY", "test-key");
}

function useOllama() {
  vi.stubEnv("AI_PROVIDER", "ollama");
  vi.stubEnv("AI_MODEL", "local-model");
}

const lastAudit = () => (rpc.mock.calls.at(-1) as unknown as [string, { p_meta: Record<string, unknown> }])[1].p_meta;

beforeEach(() => {
  resetAiCache();
  rpc.mockClear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("AI_PROVIDER", "");
  vi.stubEnv("AI_MODEL", "");
  vi.stubEnv("GEMINI_API_KEY", "");
  vi.stubEnv("GROQ_API_KEY", "");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("OLLAMA_BASE_URL", "");
  vi.stubEnv("AI_TIMEOUT_MS", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("choosing a provider", () => {
  it("defaults to none", () => expect(activeProvider()).toBe("none"));
  it("is none when the provider's key is missing", () => {
    vi.stubEnv("AI_PROVIDER", "groq");
    vi.stubEnv("AI_MODEL", "m");
    expect(activeProvider()).toBe("none");
  });
  it("is none when no model is set, since model names are never hardcoded", () => {
    vi.stubEnv("AI_PROVIDER", "gemini");
    vi.stubEnv("GEMINI_API_KEY", "k");
    expect(activeProvider()).toBe("none");
  });
  it("ignores an Anthropic key unless Anthropic is chosen", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "k");
    expect(activeProvider()).toBe("none");
    vi.stubEnv("AI_PROVIDER", "anthropic");
    expect(activeProvider()).toBe("anthropic");
  });
  it("labels the UI honestly", () => {
    expect(aiLabel("none")).toBe("AI: offline mode");
    expect(aiLabel("groq")).toBe("AI: groq");
  });
});

describe("calling the model", () => {
  it("never touches the network when the provider is none", async () => {
    expect(await callModel(admin, CALL)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("calls the configured endpoint and audits the template, not the content", async () => {
    useGemini();
    fetchMock.mockResolvedValue(reply("Three alerts."));
    expect(await callModel(admin, CALL)).toBe("Three alerts.");
    expect(String(fetchMock.mock.calls[0]![0])).toBe("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
    const body = JSON.parse(String(fetchMock.mock.calls[0]![1]!.body));
    expect(body.model).toBe("test-model");
    expect(body.messages[0].content).toMatch(/data, not instructions/);
    expect(lastAudit()).toMatchObject({ template: "test.v1", provider: "gemini", outcome: "answered" });
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("How many alerts");
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("Three alerts");
  });

  it("retries a timeout once, then falls back", async () => {
    useGemini();
    fetchMock.mockRejectedValue(new DOMException("timed out", "TimeoutError"));
    expect(await callModel(admin, CALL)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(lastAudit()).toMatchObject({ outcome: "fell_back" });
  });

  it("recovers when the retry succeeds", async () => {
    useGemini();
    fetchMock.mockResolvedValueOnce(reply("", 503)).mockResolvedValueOnce(reply("Fine."));
    expect(await callModel(admin, CALL)).toBe("Fine.");
  });

  it("falls back at once on a rate limit, spending no more quota", async () => {
    useGemini();
    fetchMock.mockResolvedValue(reply("", 429));
    expect(await callModel(admin, CALL)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a reply containing a 12-digit number, an email or a phone number", async () => {
    useGemini();
    for (const bad of ["Student 123456789012 is flagged", "Mail a@b.com now", "Call 9876543210"]) {
      resetAiCache();
      fetchMock.mockResolvedValue(reply(bad));
      expect(await callModel(admin, CALL)).toBeNull();
      expect(lastAudit()).toMatchObject({ outcome: "fell_back", detail: "rejected_output" });
    }
  });

  it("does not flag ordinary figures as phone numbers", () => {
    expect(looksLikePii("61.5% of 2,213 seats, up 12 in 2026")).toBe(false);
  });

  it("does not send a prompt that itself contains an ID", async () => {
    useGemini();
    expect(await callModel(admin, { ...CALL, user: "Look up 123456789012" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("caches repeats and joins identical requests in flight", async () => {
    useGemini();
    fetchMock.mockResolvedValue(reply("Once."));
    const [a, b] = await Promise.all([callModel(admin, CALL), callModel(admin, { ...CALL, user: "how many   ALERTS?" })]);
    expect([a, b]).toEqual(["Once.", "Once."]);
    await callModel(admin, CALL);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("Ask the Data through the provider", () => {
  it("accepts a valid catalog choice", async () => {
    useGemini();
    fetchMock.mockResolvedValue(reply('{"queryId":"quota_violations","params":{"state":"Kerala"}}'));
    expect(await selectQuery(admin, "any overflows down south?")).toEqual({ selection: { queryId: "quota_violations", params: { state: "Kerala" } }, byModel: true });
  });

  it("rejects an unknown query id and uses the keyword matcher", async () => {
    useGemini();
    fetchMock.mockResolvedValue(reply('{"queryId":"drop_everything","params":{}}'));
    expect(await selectQuery(admin, "Show quota violations")).toEqual({ selection: { queryId: "quota_violations", params: {} }, byModel: false });
  });

  it("falls back on malformed JSON", async () => {
    useGemini();
    fetchMock.mockResolvedValue(reply("not json at all"));
    expect((await selectQuery(admin, "Show quota violations")).byModel).toBe(false);
  });

  it("falls back on a timeout", async () => {
    useGemini();
    fetchMock.mockRejectedValue(new DOMException("timed out", "TimeoutError"));
    expect(await selectQuery(admin, "Show quota violations")).toMatchObject({ selection: { queryId: "quota_violations" }, byModel: false });
  });

  it("honours the model saying no query fits", async () => {
    useGemini();
    fetchMock.mockResolvedValue(reply('{"queryId":"none","params":{}}'));
    expect(await selectQuery(admin, "what is the weather")).toEqual({ selection: null, byModel: true });
  });

  it("uses the keyword path with provider none", async () => {
    expect(await selectQuery(admin, "Show quota violations")).toEqual({ selection: { queryId: "quota_violations", params: {} }, byModel: false });
    expect(await selectQuery(admin, "what is the weather")).toEqual({ selection: null, byModel: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("replaces a summary that contains an ID with the template", async () => {
    useGemini();
    fetchMock.mockResolvedValue(reply("Student 123456789012 leads."));
    const out = await summarise(admin, "Open alerts", {}, { columns: [{ key: "code", header: "Type" }, { key: "count", header: "Open" }], rows: [{ code: "OVER_QUOTA", count: 2 }, { code: "OVER_INTAKE", count: 1 }] });
    expect(out).toEqual({ text: expect.stringContaining("led by OVER_QUOTA"), byModel: false });
  });
});

describe("Ollama on the server itself", () => {
  it("needs a model but no key", () => {
    vi.stubEnv("AI_PROVIDER", "ollama");
    expect(activeProvider()).toBe("none");
    vi.stubEnv("AI_MODEL", "local-model");
    expect(activeProvider()).toBe("ollama");
    expect(aiLabel("ollama")).toBe("AI: ollama");
  });

  it("calls the local address with no key, asks for JSON and keeps the model loaded", async () => {
    useOllama();
    fetchMock.mockResolvedValue(reply('{"queryId":"quota_violations","params":{}}'));
    expect(await selectQuery(admin, "any overflows?")).toEqual({ selection: { queryId: "quota_violations", params: {} }, byModel: true });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("http://127.0.0.1:11434/v1/chat/completions");
    expect(init!.headers).not.toHaveProperty("Authorization");
    const body = JSON.parse(String(init!.body));
    expect(body.model).toBe("local-model");
    expect(body.keep_alive).toBeTruthy();
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("honours OLLAMA_BASE_URL", async () => {
    useOllama();
    vi.stubEnv("OLLAMA_BASE_URL", "http://127.0.0.1:9999/v1/");
    fetchMock.mockResolvedValue(reply("Fine."));
    await callModel(admin, CALL);
    expect(String(fetchMock.mock.calls[0]![0])).toBe("http://127.0.0.1:9999/v1/chat/completions");
  });

  it("waits 15 seconds by default, 4 for the cloud, and obeys AI_TIMEOUT_MS", async () => {
    const spy = vi.spyOn(AbortSignal, "timeout");
    fetchMock.mockResolvedValue(reply("Fine."));
    useOllama();
    await callModel(admin, CALL);
    expect(spy.mock.calls.at(-1)![0]).toBe(15_000);
    resetAiCache();
    vi.stubEnv("AI_TIMEOUT_MS", "2500");
    await callModel(admin, CALL);
    expect(spy.mock.calls.at(-1)![0]).toBe(2500);
    resetAiCache();
    vi.stubEnv("AI_TIMEOUT_MS", "");
    useGemini();
    await callModel(admin, CALL);
    expect(spy.mock.calls.at(-1)![0]).toBe(4000);
    spy.mockRestore();
  });

  it("falls back on invalid JSON", async () => {
    useOllama();
    fetchMock.mockResolvedValue(reply("sure, here you go"));
    expect(await selectQuery(admin, "Show quota violations")).toEqual({ selection: { queryId: "quota_violations", params: {} }, byModel: false });
  });

  it("falls back on a timeout, after one retry", async () => {
    useOllama();
    fetchMock.mockRejectedValue(new DOMException("timed out", "TimeoutError"));
    expect((await selectQuery(admin, "Show quota violations")).byModel).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falls back when Ollama is not running", async () => {
    useOllama();
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    expect((await selectQuery(admin, "Show quota violations")).byModel).toBe(false);
  });

  it("honours a refusal", async () => {
    useOllama();
    fetchMock.mockResolvedValue(reply('{"queryId":"none","params":{}}'));
    expect(await selectQuery(admin, "what is the weather")).toEqual({ selection: null, byModel: true });
  });

  it("still rejects a reply shaped like personal data", async () => {
    useOllama();
    fetchMock.mockResolvedValue(reply("Student 123456789012 leads."));
    expect(await callModel(admin, CALL)).toBeNull();
    expect(lastAudit()).toMatchObject({ provider: "ollama", detail: "rejected_output" });
  });

  it("warms up without blocking or failing, and only for Ollama", () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    warmUpModel();
    expect(fetchMock).not.toHaveBeenCalled();
    useOllama();
    expect(warmUpModel()).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
