import { Suspense } from "react";
import { PropertySearch } from "@/components/listings/PropertySearch";

export const metadata = { title: "Properties" };

export default function PropertiesPage() {
  return (
    <Suspense>
      <PropertySearch layout="grid" />
    </Suspense>
  );
}
