import { useTranslation } from 'react-i18next';
import { BadgeCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProviderVerifiedBadgeProps {
  className?: string;
  size?: 'sm' | 'md';
}

const SIZE_MAP = {
  sm: 16,
  md: 20,
} as const;

const VERIFIED_BADGE_BLUE = '#8792E3';

const ProviderVerifiedBadge = ({
  className = '',
  size = 'sm',
}: ProviderVerifiedBadgeProps) => {
  const badgeSize = SIZE_MAP[size];
  const { t } = useTranslation();

  return (
    <span
      role="img"
      aria-label={t('foods.providerVerified', 'Verified food')}
      className={cn(
        'inline-flex shrink-0 items-center justify-center align-middle',
        className
      )}
      data-testid="provider-verified-badge"
      style={{
        width: badgeSize,
        height: badgeSize,
      }}
    >
      <BadgeCheck
        size={badgeSize}
        color={VERIFIED_BADGE_BLUE}
        fill={VERIFIED_BADGE_BLUE}
        stroke="white"
        strokeWidth={2.75}
        aria-hidden="true"
      />
    </span>
  );
};

export default ProviderVerifiedBadge;
