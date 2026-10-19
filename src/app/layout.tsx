import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { ServiceWorker } from "@/components/ServiceWorker";
import "./globals.css";

const inter = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GRWM — your wardrobe, remembered",
  description: "Snap your outfit each day. GRWM catalogues every piece so you can plan without opening the wardrobe.",
  appleWebApp: { capable: true, title: "GRWM", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#f6f3fb",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
