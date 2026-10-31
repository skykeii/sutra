import Link from "next/link";
import { DataTable, fmtDateTime, Pager, PageHeader, firstParam, StatusBadge } from "@/components/shared";
import { requireRole } from "@/lib/auth/session";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata = { title: "Upload history" };
const SIZE = 25;

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRole(["institution_admin", "institution_staff"]);
  const page = Math.max(1, Number(firstParam((await searchParams).page)) || 1);
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("upload_batches")
    .select("id, file_name, row_count, error_count, warning_count, status, created_at, programs(name)")
    .order("created_at", { ascending: false })
    .range((page - 1) * SIZE, page * SIZE);
  const rows = (data ?? []).map((b) => ({ ...b, program: (b.programs as unknown as { name: string } | null)?.name ?? "" }));
  return (
    <div className="space-y-4">
      <PageHeader title="Upload history" description="Every file and record your institution has submitted." />
      <DataTable
        rows={rows.slice(0, SIZE)}
        rowKey={(r) => r.id}
        empty="No uploads yet. Start from Upload students."
        columns={[
          { key: "file_name", header: "File", render: (r) => <Link className="font-medium text-primary underline" href={`/institution/history/${r.id}`}>{r.file_name}</Link> },
          { key: "program", header: "Program" },
          { key: "created_at", header: "When", render: (r) => fmtDateTime(r.created_at) },
          { key: "row_count", header: "Rows", align: "right" },
          { key: "error_count", header: "Errors", align: "right" },
          { key: "warning_count", header: "Warnings", align: "right" },
          { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
        ]}
      />
      <Pager page={page} hasNext={rows.length > SIZE} path="/institution/history" />
    </div>
  );
}
