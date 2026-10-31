import { Spline } from "lucide-react";
import { cn } from "@/lib/utils";

export function Logo({ className, inverted }: { className?: string; inverted?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-saffron text-saffron-foreground">
        <Spline className="h-5 w-5" aria-hidden />
      </span>
      <span className={cn("text-xl", inverted ? "text-white" : "text-primary")}>Sutra</span>
    </span>
  );
}
