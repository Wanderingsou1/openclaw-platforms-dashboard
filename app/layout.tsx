import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "openclaw",
  description: "Personal AI communication assistant",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-zinc-950 text-white">
        {children}
      </body>
    </html>
  );
}
