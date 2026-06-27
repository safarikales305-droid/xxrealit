type Props = {
  html: string;
  className?: string;
};

export function PortalTermsHtml({ html, className = '' }: Props) {
  return (
    <div
      className={`portal-terms-html space-y-4 text-[15px] leading-relaxed text-zinc-700 ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
