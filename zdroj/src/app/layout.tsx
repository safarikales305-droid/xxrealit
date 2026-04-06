import type { Metadata } from "next";
import { AuthProvider } from "@/context/AuthContext";
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
      <body>
        <AuthProvider>
          <div className="min-h-screen overflow-y-auto overflow-x-hidden">{children}</div>
        </AuthProvider>
      </body>
    </html>
  );
}
