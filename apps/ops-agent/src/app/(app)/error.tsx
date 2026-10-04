"use client";

import { AlertTriangle } from "lucide-react";
import { Button, Card, EmptyState } from "@/components/ui/primitives";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Card>
      <EmptyState
        icon={<AlertTriangle className="h-5 w-5 text-red-500" />}
        title="Something went wrong"
        description={`We couldn't load this page. ${error.digest ? `Reference: ${error.digest}` : "Please try again."}`}
        action={<Button onClick={reset}>Try again</Button>}
      />
    </Card>
  );
}
