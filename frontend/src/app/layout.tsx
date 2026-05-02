import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Substrate · acme-robotics",
  description:
    "Shared context layer for AI agents — live working memory graph.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-slate-950 text-slate-200">
        {children}
      </body>
    </html>
  );
}
