import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Link from "next/link";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Nyumba — Homes in Lusaka",
  description: "Rentals, sales and short stays in Lusaka, Zambia.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body
        suppressHydrationWarning 
        className="min-h-full flex flex-col"
      >
      {/* Top Navigation Bar shown on every page */}
      <header className="border-b border-[#133a2a]/10 bg-white/90 backdrop-blur">
        <div className="mx-auto flex items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4 lg:max-w-7xl">
          <Link
            href="/"
            className="shrink-0 text-xl font-extrabold tracking-tight text-[#133a2a]"
          >
            Nyumba<span className="text-[#d4a843]">.</span>
          </Link>

          <nav className="flex items-center gap-3 text-sm font-semibold sm:gap-5">
             <Link
               href="/properties"
               className="text-[#133a2a] hover:text-[#9a741c]"
             >
               Browse
             </Link>
             <Link
               href="/dashboard"
               className="hidden text-[#133a2a] hover:text-[#9a741c] sm:inline"
             >
               Dashboard
             </Link>
             <Link
               href="/post-property"
               className="whitespace-nowrap rounded-lg bg-[#133a2a] px-3 py-2 text-white hover:bg-[#1a4d38] sm:px-3.5"
             >
               <span className="sm:hidden">+ List</span>
               <span className="hidden sm:inline">+ List Property</span>
             </Link>
             <Link
               href="/login"
               className="text-[#9a741c] hover:underline"
             >
               Log in
             </Link>
           </nav>
        </div>
      </header>

      {/* The active page content renders here */}
      <div className="flex-1">{children}</div>
      
      </body>

    </html>
  );
}

