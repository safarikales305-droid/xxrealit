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
          <div className="min-h-screen w-full max-w-[100vw] overflow-x-hidden overflow-y-auto">
            {children}
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
