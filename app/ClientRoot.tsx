'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';

export function ClientRoot({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const userId = localStorage.getItem('cid_user_id');
    // The API key is no longer required to finish setup — you can track jobs
    // manually and add a key later from Profile, so identity alone is what
    // gates onboarding. AI routes enforce the key themselves when it's
    // actually needed.
    const hasIdentity = !!userId;

    // Already set up? Don't show onboarding again — send straight to the app.
    if (pathname === '/welcome' || pathname === '/setup') {
      if (hasIdentity) router.replace('/');
      return;
    }

    if (!hasIdentity) router.replace('/welcome');
  }, [pathname, router]);

  return <>{children}</>;
}
