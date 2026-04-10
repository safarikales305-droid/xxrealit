import type { Metadata } from "next";
import { AuthProvider } from "@/context/AuthContext";
import { ToastProvider } from "@/context/ToastContext";
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
          <ToastProvider>
            <div className="w-full min-h-screen">{children}</div>
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
