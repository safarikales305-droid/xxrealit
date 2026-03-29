import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "XXrealit",
  description: "Real estate social app with video listings",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="cs">
      <body>{children}</body>
    </html>
  );
}
