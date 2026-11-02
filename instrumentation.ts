export async function register() {
  // Written as a positive check so the import is left out of the edge bundle.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { warmUpModel } = await import("@/lib/ai/provider");
    warmUpModel();
  }
}
