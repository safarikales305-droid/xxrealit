'use client';

import { AppMobileBottomSheet } from '@/components/ui/AppMobileBottomSheet';
import { SidebarFilters } from '@/components/home/sidebar-filters';

type Props = {
  open: boolean;
  onClose: () => void;
};

export function MobileFiltersSheet({ open, onClose }: Props) {
  return (
    <AppMobileBottomSheet
      open={open}
      title="Filtry"
      subtitle="Lokalita, cena a typ nemovitosti"
      onClose={onClose}
      ariaLabel="Filtry inzerátů"
    >
      <SidebarFilters variant="dark" embedded onFiltersApplied={onClose} />
    </AppMobileBottomSheet>
  );
}
