import { Card, CardContent } from "@/components/ui/card";

export default function ReferencePage() {
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Reference data</h1>
        <p className="text-sm text-muted-foreground">
          ECCC station catalog, published IDF, regional pooling groups, and
          standard temporal patterns.
        </p>
      </div>
      <Card>
        <CardContent className="pt-5 text-sm text-muted-foreground">
          The ECCC station catalog and Engineering Climate Datasets are seeded in
          milestone M1.
        </CardContent>
      </Card>
    </div>
  );
}
