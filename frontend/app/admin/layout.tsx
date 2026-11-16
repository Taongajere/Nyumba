import { Suspense } from "react";
import { FavouritesProvider } from "@/lib/favourites";
import { Spinner } from "@/components/kit";
import { AdminFrame } from "./AdminFrame";

export const metadata = { title: { default: "Admin", template: "%s · Admin · Nyumba" } };
// Staff-only screens render after the session check, so there is no static shell to validate.
export const instant = false;

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <FavouritesProvider>
      <Suspense fallback={<Spinner />}>
        <AdminFrame>{children}</AdminFrame>
      </Suspense>
    </FavouritesProvider>
  );
}
