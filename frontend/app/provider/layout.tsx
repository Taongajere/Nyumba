import { Suspense } from "react";
import { FavouritesProvider } from "@/lib/favourites";
import { Spinner } from "@/components/kit";
import { ProviderFrame } from "./ProviderFrame";

export const metadata = { title: { default: "Provider tools", template: "%s · Provider · Nyumba" } };
// Provider screens render after the session check, so there is no static shell to validate.
export const instant = false;

export default function ProviderLayout({ children }: LayoutProps<"/provider">) {
  return (
    <FavouritesProvider>
      <Suspense fallback={<Spinner />}>
        <ProviderFrame>{children}</ProviderFrame>
      </Suspense>
    </FavouritesProvider>
  );
}
