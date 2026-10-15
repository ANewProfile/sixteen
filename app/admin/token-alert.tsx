'use client';

import { useLayoutEffect } from 'react';
import { SecretAlert } from './secret-alert';

/**
 * Next keeps recently visited pages alive (hidden) after navigating away.
 * Whoever holds a shown token calls this to drop it as soon as its page is hidden.
 */
export function useForgetWhenHidden(forget: () => void) {
  useLayoutEffect(() => forget, [forget]);
}

/** The new token, shown once. Only its hash is stored, so it can't be shown again. */
export function TokenAlert({ token, notice }: { token: string; notice: string }) {
  return (
    <SecretAlert title="Your admin token was regenerated" notice={notice} secret={token}>
      <p>
        If you only add prompts through this website, you can ignore this: the token is only for scripts that add
        prompts automatically.
      </p>
    </SecretAlert>
  );
}
