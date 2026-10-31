import { Pipeline } from "@/components/layout/pipeline";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function PortalHome({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-muted-foreground">{description}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>How data flows through Sutra</CardTitle>
          <CardDescription>This portal&apos;s screens arrive with the later build phases.</CardDescription>
        </CardHeader>
        <CardContent>
          <Pipeline />
        </CardContent>
      </Card>
    </div>
  );
}
