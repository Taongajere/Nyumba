import { Suspense } from "react";
import { FavouritesProvider } from "@/lib/favourites";
import { MarketHeader } from "@/components/MarketHeader";
import { Spinner } from "@/components/kit";

// Marketplace frame: grey page, one white rounded canvas holding the header and the screen.
// Everything here depends on the signed-in user and the URL, so it streams in behind Suspense.
export default function MarketLayout({ children }: LayoutProps<"/">) {
  return (
    <FavouritesProvider>
      <div className="min-h-dvh sm:p-4 lg:p-5">
        <div className="canvas flex min-h-dvh flex-col sm:min-h-[calc(100dvh-2rem)] lg:min-h-[calc(100dvh-2.5rem)]">
          <Suspense fallback={<div className="h-[73px] border-b border-line" />}>
            <MarketHeader />
          </Suspense>
          <div className="flex flex-1 flex-col">
            <Suspense fallback={<Spinner />}>{children}</Suspense>
          </div>
        </div>
      </div>
    </FavouritesProvider>
  );
}
