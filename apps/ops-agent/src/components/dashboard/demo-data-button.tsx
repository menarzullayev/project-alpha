"use client";

import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Button } from "@/components/ui/primitives";
import { api } from "@/lib/api-client";

export function DemoDataButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <Button
        loading={loading}
        onClick={async () => {
          setLoading(true);
          setError(null);
          try {
            await api("/api/v1/org/demo-data", { method: "POST", body: {} });
            router.refresh();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setLoading(false);
          }
        }}
      >
        <Sparkles className="h-4 w-4" /> Load demo education centre
      </Button>
      {error && <Alert>{error}</Alert>}
    </div>
  );
}
