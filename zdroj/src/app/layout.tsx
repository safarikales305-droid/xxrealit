import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { AuthProvider } from "@/context/AuthContext";
import { PortalWorkerGuard } from "@/components/portal-worker/portal-worker-guard";
import { PropertySeekerGuard } from "@/components/property-seeker/property-seeker-guard";
import { FacebookOAuthReturnRedirect } from "@/components/auth/FacebookOAuthReturnRedirect";
import { FirstContentGuard } from "@/components/registration/FirstContentGuard";
import { RegistrationRequirementsGuard } from "@/components/registration/RegistrationRequirementsGuard";
import { TermsReacceptGuard } from "@/components/registration/TermsReacceptGuard";
import { GuestRegistrationGateHost } from "@/components/registration/GuestRegistrationGateHost";
import { PwaInstallPrompt } from "@/components/pwa/PwaInstallPrompt";
import { ProfileOnboardingPopupHost } from "@/components/onboarding/ProfileOnboardingPopupHost";
import { PwaPushOnboarding } from "@/components/pwa/PwaPushOnboarding";
import { AppBadgeSync } from "@/components/pwa/AppBadgeSync";
import { PwaServiceWorkerRegister } from "@/components/pwa/PwaServiceWorkerRegister";
import { SupportContactProvider } from "@/components/support/SupportContactProvider";
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
          <SupportContactProvider>
          <Suspense fallback={null}>
            <FacebookOAuthReturnRedirect />
          </Suspense>
          <Suspense fallback={null}>
            <PortalWorkerGuard />
          </Suspense>
          <Suspense fallback={null}>
            <PropertySeekerGuard />
          </Suspense>
          <FirstContentGuard>
            <RegistrationRequirementsGuard>
              <TermsReacceptGuard>
                <div className="w-full min-h-screen">{children}</div>
              </TermsReacceptGuard>
            </RegistrationRequirementsGuard>
          </FirstContentGuard>
          <PwaInstallPrompt />
          <Suspense fallback={null}>
            <ProfileOnboardingPopupHost />
          </Suspense>
          <PwaPushOnboarding />
          <PwaServiceWorkerRegister />
          <Suspense fallback={null}>
            <AppBadgeSync />
          </Suspense>
          <Suspense fallback={null}>
            <GuestRegistrationGateHost />
          </Suspense>
          </SupportContactProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
