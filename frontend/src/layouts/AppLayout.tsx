import { Outlet, ScrollRestoration } from 'react-router-dom';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { VerificationReminderModal } from '@/components/VerificationReminderModal';

export function AppLayout() {
  return (
    <div className="min-h-screen flex flex-col overflow-x-clip w-full">
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
      <VerificationReminderModal />
      <ScrollRestoration />
    </div>
  );
}
