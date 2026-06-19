'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';

export function ClientRoot({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (pathname === '/setup') return;
    const userId = localStorage.getItem('cid_user_id');
    const apiKey = localStorage.getItem('cid_api_key');
    if (!userId || !apiKey) {
      router.replace('/setup');
    }
  }, [pathname, router]);

  return <>{children}</>;
}
