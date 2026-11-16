import { Suspense } from "react";
import { PropertySearch } from "@/components/listings/PropertySearch";

export default function ExplorePage() {
  return (
    <Suspense>
      <PropertySearch layout="map" />
    </Suspense>
  );
}
