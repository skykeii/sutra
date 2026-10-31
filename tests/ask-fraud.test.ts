import { describe, expect, it } from "vitest";
import { CATALOG } from "@/lib/ask/catalog";
import { keywordMatch, parseSelection, selectionPrompt, templateSummary } from "@/lib/ask/match";
import { detectClusters, templateExplanation, type FraudInput } from "@/lib/fraud";

describe("Ask the Data catalog", () => {
  it("has about 15 approved queries with unique ids", () => {
    expect(CATALOG.length).toBeGreaterThanOrEqual(15);
    expect(new Set(CATALOG.map((c) => c.id)).size).toBe(CATALOG.length);
  });

  it.each(CATALOG.map((c) => [c.id, c.example]))("keyword mode routes the example for %s to it", (id, example) => {
    expect(keywordMatch(example!)?.queryId).toBe(id);
  });

  it("picks up state and level parameters", () => {
    expect(keywordMatch("Which UG programs are over intake in Tamil Nadu?")).toEqual({ queryId: "over_intake", params: { state: "Tamil Nadu", level: "UG" } });
  });

  it("does not answer what it does not know", () => {
    expect(keywordMatch("What is the weather in Delhi?")).toBeNull();
  });

  it("rejects model output that is outside the catalog", () => {
    expect(parseSelection('{"queryId":"DROP TABLE students","params":{}}')).toBeNull();
    expect(parseSelection('{"queryId":"over_intake","params":{"sql":"select * from students"}}')).toBeNull();
    expect(parseSelection("not json")).toBeNull();
  });

  it("drops parameters the chosen query does not allow, and unknown states", () => {
    expect(parseSelection('{"queryId":"marks_mismatches","params":{"state":"Kerala"}}')).toEqual({ queryId: "marks_mismatches", params: {} });
    expect(parseSelection('{"queryId":"over_intake","params":{"state":"Atlantis"}}')).toEqual({ queryId: "over_intake", params: {} });
  });

  it("accepts an explicit no-match", () => {
    expect(parseSelection('{"queryId":"none","params":{}}')).toBe("none");
  });

  it("the routing prompt holds no table names or SQL", () => {
    const prompt = selectionPrompt();
    expect(prompt).not.toMatch(/mock_apaar_registry|select \*|apaar_hash|mobile_enc/i);
  });

  it("writes a summary with no key, from the table only", () => {
    const summary = templateSummary("Fill rate by state", {}, { columns: [{ key: "state", header: "State" }, { key: "fill_pct", header: "Filled %" }], rows: [{ state: "Kerala", fill_pct: 90 }, { state: "Delhi", fill_pct: 80 }] });
    expect(summary).toContain("led by Kerala");
  });
});

const base: FraudInput = { students: [], enrolments: [], programs: [], crossMatches: [] };
const student = (id: string, mobile: string | null = null) => ({ id, mobile_hash: mobile, email_hash: null, address_hash: null });
const enrol = (id: string, program = "p1", quota = "CONVENOR", date = "2026-08-01") => ({ student_id: id, institution_id: "i1", program_id: program, quota_type: quota, admission_date: date });

describe("fraud detection", () => {
  it("flags five students sharing a mobile hash, but not four", () => {
    const ids = ["a", "b", "c", "d", "e"];
    const five = detectClusters({ ...base, students: ids.map((i) => student(i, "m1")), enrolments: ids.map((i) => enrol(i)) });
    expect(five.filter((c) => c.cluster_type === "SHARED_MOBILE")).toHaveLength(1);
    expect(five[0]!.member_count).toBe(5);
    const four = detectClusters({ ...base, students: ids.slice(0, 4).map((i) => student(i, "m1")), enrolments: ids.slice(0, 4).map((i) => enrol(i)) });
    expect(four.filter((c) => c.cluster_type === "SHARED_MOBILE")).toHaveLength(0);
  });

  it("detects an admission surge above 60% of intake", () => {
    const list = Array.from({ length: 7 }, (_, i) => enrol(`s${i}`, "p1", "CONVENOR", "2026-08-20"));
    const out = detectClusters({ ...base, enrolments: list, programs: [{ id: "p1", name: "X", approved_intake: 10, state: "Kerala", institution_id: "i1" }] });
    expect(out.map((c) => c.cluster_type)).toContain("ADMISSION_SURGE");
  });

  it("detects a category spike against peers", () => {
    const programs = ["p1", "p2", "p3", "p4"].map((id) => ({ id, name: "X", approved_intake: 100, state: "Kerala", institution_id: id }));
    const enrolments = [
      ...Array.from({ length: 10 }, (_, i) => enrol(`a${i}`, "p1", i < 8 ? "NRI" : "CONVENOR", `2026-0${1 + (i % 9)}-01`)),
      ...["p2", "p3", "p4"].flatMap((p) => Array.from({ length: 10 }, (_, i) => enrol(`${p}${i}`, p, i < 1 ? "NRI" : "CONVENOR", `2026-0${1 + (i % 9)}-01`))),
    ];
    const spikes = detectClusters({ ...base, enrolments, programs }).filter((c) => c.cluster_type === "CATEGORY_SPIKE");
    expect(spikes).toHaveLength(1);
    expect(spikes[0]!.institution_id).toBe("p1");
  });

  it("explanations use counts only", () => {
    const [c] = detectClusters({ ...base, students: ["a", "b", "c", "d", "e"].map((i) => student(i, "secrethash")), enrolments: ["a", "b", "c", "d", "e"].map((i) => enrol(i)) });
    const text = templateExplanation(c!);
    expect(text).toContain("5 students");
    expect(text).not.toContain("secrethash");
    expect(JSON.stringify(c!.facts)).not.toContain("secrethash");
  });
});
