type Props = {
  html: string;
  className?: string;
};

export function PortalTermsHtml({ html, className = '', onDark = false }: Props & { onDark?: boolean }) {
  return (
    <div
      className={`portal-terms-html space-y-4 text-[15px] leading-relaxed ${
        onDark ? 'portal-terms-html--on-dark' : 'text-zinc-700'
      } ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
