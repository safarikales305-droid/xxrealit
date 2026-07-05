import { PortalAnalyticsTracker } from "@/components/analytics/PortalAnalyticsTracker";
import { SiteOriginDebug } from "@/components/debug/SiteOriginDebug";
import { JsonLd } from "@/components/seo/JsonLd";
import { SeoTrackingScripts } from "@/components/seo/SeoTrackingScripts";
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
import { RegistrationGamificationHost } from "@/components/registration-gamification/RegistrationGamificationHost";
import { PwaInstallPrompt } from "@/components/pwa/PwaInstallPrompt";
import { ProfileOnboardingPopupHost } from "@/components/onboarding/ProfileOnboardingPopupHost";
import { PwaPushOnboarding } from "@/components/pwa/PwaPushOnboarding";
import { AppBadgeSync } from "@/components/pwa/AppBadgeSync";
import { PwaServiceWorkerRegister } from "@/components/pwa/PwaServiceWorkerRegister";
import { SupportContactProvider } from "@/components/support/SupportContactProvider";
import { getSiteMetadataBase } from "@/lib/app-url";
import { getOptionalInternalApiBaseUrl } from "@/lib/server-api";
import { DEFAULT_DESCRIPTION, DEFAULT_TITLE, SITE_NAME } from "@/lib/seo/metadata";
import { organizationJsonLd, webSiteJsonLd } from "@/lib/seo/schema";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: getSiteMetadataBase(),
  title: {
    default: DEFAULT_TITLE,
    template: `%s | ${SITE_NAME}`,
  },
  description: DEFAULT_DESCRIPTION,
  manifest: "/manifest.json",
  robots: { index: true, follow: true },
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "cs_CZ",
    siteName: SITE_NAME,
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    images: [{ url: "/icons/icon-192.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    images: ["/icons/icon-192.png"],
  },
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

async function loadSeoSettings() {
  const api = getOptionalInternalApiBaseUrl();
  if (!api) return null;
  try {
    const res = await fetch(`${api}/seo/settings`, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, string | null>;
  } catch {
    return null;
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const seoSettings = await loadSeoSettings();

  return (
    <html lang="cs">
      <head>
        {seoSettings?.googleSearchConsoleVerification ? (
          <meta name="google-site-verification" content={seoSettings.googleSearchConsoleVerification} />
        ) : null}
        {seoSettings?.seznamWebmasterVerification ? (
          <meta name="seznam-webmaster-verification" content={seoSettings.seznamWebmasterVerification} />
        ) : null}
        {seoSettings?.bingWebmasterVerification ? (
          <meta name="msvalidate.01" content={seoSettings.bingWebmasterVerification} />
        ) : null}
      </head>
      <body>
        <SiteOriginDebug />
        <JsonLd data={[organizationJsonLd(), webSiteJsonLd()]} />
        <SeoTrackingScripts settings={seoSettings} />
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
          <Suspense fallback={null}>
            <RegistrationGamificationHost />
          </Suspense>
          <Suspense fallback={null}>
            <PortalAnalyticsTracker />
          </Suspense>
          </SupportContactProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
