import Script from 'next/script';

export type PublicSeoSettings = {
  googleAnalyticsId?: string | null;
  googleTagManagerId?: string | null;
  metaPixelId?: string | null;
  tiktokPixelId?: string | null;
  linkedInInsightId?: string | null;
  googleSearchConsoleVerification?: string | null;
  seznamWebmasterVerification?: string | null;
  bingWebmasterVerification?: string | null;
  yandexVerification?: string | null;
  pinterestVerification?: string | null;
};

export function SeoTrackingScripts({ settings }: { settings: PublicSeoSettings | null }) {
  if (!settings) return null;
  const gtm = settings.googleTagManagerId?.trim();
  const ga = settings.googleAnalyticsId?.trim();
  const meta = settings.metaPixelId?.trim();

  return (
    <>
      {gtm ? (
        <Script id="gtm" strategy="afterInteractive">{`
          (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});
          var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';
          j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
          })(window,document,'script','dataLayer','${gtm}');
        `}</Script>
      ) : null}
      {!gtm && ga ? (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${ga}`} strategy="afterInteractive" />
          <Script id="ga4" strategy="afterInteractive">{`
            window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
            gtag('js',new Date());gtag('config','${ga}');
          `}</Script>
        </>
      ) : null}
      {meta ? (
        <Script id="meta-pixel" strategy="afterInteractive">{`
          !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
          n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script',
          'https://connect.facebook.net/en_US/fbevents.js');fbq('init','${meta}');fbq('track','PageView');
        `}</Script>
      ) : null}
    </>
  );
}
