type LogoProps = {
  className?: string;
};

export default function Logo({ className }: LogoProps) {
  return (
    <img
      src="/logo.png"
      alt="xxrealit.cz"
      className={className ?? 'h-6 w-auto md:h-8'}
    />
  );
}
