'use client';

import { ShortsEmailSignupModal } from '@/components/registration/ShortsEmailSignupModal';
import { useShortsEmailSignup } from '@/hooks/use-shorts-email-signup';

export function ShortsEmailSignupHost() {
  const { open, settings, successMessage, signupSource } = useShortsEmailSignup();
  return (
    <ShortsEmailSignupModal
      open={open}
      settings={settings}
      successMessage={successMessage}
      signupSource={signupSource}
    />
  );
}
