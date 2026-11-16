import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "@/lib/session";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: { default: "Nyumba", template: "%s · Nyumba" },
  description: "Find homes, short stays and student boarding houses in Zambia, and manage the places you rent out.",
};

export const viewport: Viewport = {
  themeColor: "#eef0f3",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-ZM" className={`${jakarta.variable} h-full`}>
      <body suppressHydrationWarning className="min-h-full">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
