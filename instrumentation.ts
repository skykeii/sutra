export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { warmUpModel } = await import("@/lib/ai/provider");
  warmUpModel();
}
