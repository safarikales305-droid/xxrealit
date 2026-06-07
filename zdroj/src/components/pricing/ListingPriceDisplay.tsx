import { formatListingPriceCzk } from '@/types/property';

export function shouldBlurListingPrice(
  isAuthenticated: boolean,
  price: number | null | undefined,
): boolean {
  return !isAuthenticated && price != null && price > 0;
}

type ListingPriceDisplayProps = {
  price: number | null | undefined;
  isAuthenticated: boolean;
  className?: string;
  labelClassName?: string;
  valueClassName?: string;
  blurredClassName?: string;
  as?: 'span' | 'p' | 'div';
};

export function ListingPriceDisplay({
  price,
  isAuthenticated,
  className = '',
  labelClassName = 'price-label',
  valueClassName = '',
  blurredClassName = 'blurred-price select-none blur-[10px] opacity-70',
  as: Tag = 'span',
}: ListingPriceDisplayProps) {
  const formatted = formatListingPriceCzk(price);
  const blur = shouldBlurListingPrice(isAuthenticated, price);

  return (
    <Tag className={className}>
      <span className={labelClassName}>Cena:</span>{' '}
      <span
        className={blur ? blurredClassName : valueClassName}
        aria-hidden={blur ? true : undefined}
      >
        {formatted}
      </span>
    </Tag>
  );
}
