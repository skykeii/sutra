import { ChevronRight } from "lucide-react";
import { Fragment } from "react";

const STEPS = [
  "Institution",
  "Student Data Upload",
  "APAAR Validation",
  "Data Verification",
  "AICTE Central Repository",
  "Analytics & Monitoring",
  "Authorized Verification",
];

export function Pipeline() {
  return (
    <ol className="flex flex-wrap items-center gap-2" aria-label="Sutra data pipeline">
      {STEPS.map((step, i) => (
        <Fragment key={step}>
          <li className="rounded-md border bg-card px-3 py-2 text-sm font-medium">
            <span className="mr-2 text-saffron">{i + 1}</span>
            {step}
          </li>
          {i < STEPS.length - 1 && <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />}
        </Fragment>
      ))}
    </ol>
  );
}
