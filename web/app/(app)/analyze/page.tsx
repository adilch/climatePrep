import { Card, CardContent } from "@/components/ui/card";

export default function AnalyzePage() {
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Standalone analysis</h1>
        <p className="text-sm text-muted-foreground">
          Run any module without a full DSR project (e.g. IDF for a culvert).
          Results can be saved into a project later (spec §2.2, J4).
        </p>
      </div>
      <Card>
        <CardContent className="pt-5 text-sm text-muted-foreground">
          Analysis modules (PFA / IDF, PMP, design storms, wind &amp; wave,
          freeboard, snowmelt) become available from milestone M3.
        </CardContent>
      </Card>
    </div>
  );
}
