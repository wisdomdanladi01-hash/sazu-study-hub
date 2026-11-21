import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { AuthProvider } from '@/auth/AuthContext';
import { PublicLayout } from '@/layouts/PublicLayout';
import { AppLayout } from '@/layouts/AppLayout';
import { AdminLayout } from '@/layouts/AdminLayout';
import { HomePage } from '@/pages/HomePage';
import { MaterialsPage } from '@/pages/MaterialsPage';
import { CourseCataloguePage } from '@/pages/CourseCataloguePage';
import { ResourceDetailPage } from '@/pages/ResourceDetailPage';
import { ResourceViewerPage } from '@/pages/ResourceViewerPage';
import { OfflineLibraryPage } from '@/pages/OfflineLibraryPage';
import { PracticePage } from '@/pages/PracticePage';
import { TestRunnerPage } from '@/pages/TestRunnerPage';
import { HowItWorksPage } from '@/pages/HowItWorksPage';
import { PricingPage } from '@/pages/PricingPage';
import { LoginPage } from '@/pages/LoginPage';
import { RegisterPage } from '@/pages/RegisterPage';
import { OnboardingPage } from '@/pages/OnboardingPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { PaymentResultPage } from '@/pages/PaymentResultPage';
import { PaymentsPage } from '@/pages/PaymentsPage';
import { ProfilePage } from '@/pages/ProfilePage';
import { AboutPage, HelpPage, PrivacyPage, TermsPage } from '@/pages/StaticPages';
import { NotFoundPage } from '@/pages/NotFoundPage';

// Admin pages
import { AdminOverviewPage } from '@/pages/admin/AdminOverviewPage';
import { AdminAcademicPage } from '@/pages/admin/AdminAcademicPage';
import { AdminCourseOfferingsPage } from '@/pages/admin/AdminCourseOfferingsPage';
import { AdminCsvImportPage } from '@/pages/admin/AdminCsvImportPage';
import { AdminResourcesPage } from '@/pages/admin/AdminResourcesPage';
import { AdminVerificationsPage } from '@/pages/admin/AdminVerificationsPage';
import { AdminPackagesPage } from '@/pages/admin/AdminPackagesPage';
import { AdminAssessmentsPage } from '@/pages/admin/AdminAssessmentsPage';

const router = createBrowserRouter([
  {
    element: <PublicLayout />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/materials', element: <MaterialsPage /> },
      { path: '/materials/:id', element: <ResourceDetailPage /> },
      { path: '/materials/:id/read', element: <ResourceViewerPage /> },
      { path: '/offline', element: <OfflineLibraryPage /> },
      { path: '/courses', element: <CourseCataloguePage /> },
      { path: '/practice', element: <PracticePage /> },
      { path: '/practice/:id', element: <TestRunnerPage /> },
      { path: '/how-it-works', element: <HowItWorksPage /> },
      { path: '/pricing', element: <PricingPage /> },
      { path: '/about', element: <AboutPage /> },
      { path: '/help', element: <HelpPage /> },
      { path: '/privacy', element: <PrivacyPage /> },
      { path: '/terms', element: <TermsPage /> },
    ],
  },
  {
    element: <AppLayout />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
      { path: '/onboarding', element: <OnboardingPage /> },
      { path: '/dashboard', element: <DashboardPage /> },
      { path: '/payments', element: <PaymentsPage /> },
      { path: '/payment/return', element: <PaymentResultPage /> },
      { path: '/payments/result', element: <PaymentResultPage /> },
      { path: '/profile', element: <ProfilePage /> },
    ],
  },
  {
    path: '/admin',
    element: <AdminLayout />,
    children: [
      { index: true, element: <AdminOverviewPage /> },
      { path: 'academic', element: <AdminAcademicPage /> },
      { path: 'courses', element: <AdminCourseOfferingsPage /> },
      { path: 'import', element: <AdminCsvImportPage /> },
      { path: 'resources', element: <AdminResourcesPage /> },
      { path: 'verification', element: <AdminVerificationsPage /> },
      { path: 'packages', element: <AdminPackagesPage /> },
      { path: 'assessments', element: <AdminAssessmentsPage /> },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);

export default function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}
