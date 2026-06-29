import { PortalLogoImage } from '@/components/PortalLogoImage';

type LogoProps = {
  className?: string;
};

export default function Logo({ className }: LogoProps) {
  return (
    <PortalLogoImage
      alt="xxrealit.cz"
      className={className ?? 'h-6 w-auto md:h-8'}
    />
  );
}
