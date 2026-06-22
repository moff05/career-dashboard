'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';

export function ClientRoot({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const userId = localStorage.getItem('cid_user_id');
    const apiKey = localStorage.getItem('cid_api_key');
    const hasCreds = !!(userId && apiKey);

    // Already set up? Don't show onboarding again — send straight to the app.
    if (pathname === '/welcome' || pathname === '/setup') {
      if (hasCreds) router.replace('/');
      return;
    }

    if (!hasCreds) router.replace('/welcome');
  }, [pathname, router]);

  return <>{children}</>;
}
