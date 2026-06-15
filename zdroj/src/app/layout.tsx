import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { AuthProvider } from "@/context/AuthContext";
import { FacebookOAuthReturnRedirect } from "@/components/auth/FacebookOAuthReturnRedirect";
import { FirstContentGuard } from "@/components/registration/FirstContentGuard";
import { RegistrationRequirementsGuard } from "@/components/registration/RegistrationRequirementsGuard";
import { GuestRegistrationGateHost } from "@/components/registration/GuestRegistrationGateHost";
import { PwaInstallPrompt } from "@/components/pwa/PwaInstallPrompt";
import { getSiteMetadataBase } from "@/lib/app-url";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: getSiteMetadataBase(),
  title: "XXrealit",
  description: "Real estate social app with video listings",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.svg", type: "image/svg+xml", sizes: "512x512" },
      { url: "/icons/icon-32.png", type: "image/png", sizes: "32x32" },
    ],
    apple: [{ url: "/icons/icon-192.png", sizes: "192x192" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#ff6a00",
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
          <Suspense fallback={null}>
            <FacebookOAuthReturnRedirect />
          </Suspense>
          <FirstContentGuard>
            <RegistrationRequirementsGuard>
              <div className="w-full min-h-screen">{children}</div>
            </RegistrationRequirementsGuard>
          </FirstContentGuard>
          <PwaInstallPrompt />
          <Suspense fallback={null}>
            <GuestRegistrationGateHost />
          </Suspense>
        </AuthProvider>
      </body>
    </html>
  );
}
