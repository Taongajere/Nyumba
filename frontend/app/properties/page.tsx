import { Suspense } from "react";
import ListingsSearch from "./ListingsSearch";

export default function PropertiesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60dvh] items-center justify-center text-sm text-muted-foreground">
          Loading search…
        </div>
      }
    >
      <ListingsSearch />
    </Suspense>
  );
}
