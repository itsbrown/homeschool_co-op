import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function ProgressHeadlineCard({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      {description && (
        <CardContent>
          <p className="text-muted-foreground text-sm">{description}</p>
        </CardContent>
      )}
    </Card>
  );
}
