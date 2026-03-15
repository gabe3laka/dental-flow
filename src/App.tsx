import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import ImpersonationBanner from "@/components/ImpersonationBanner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import DoctorLayout from "@/layouts/DoctorLayout";
import AdminLayout from "@/layouts/AdminLayout";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import Landing from "@/pages/Landing";
import PatientHome from "@/pages/patient/Home";
import Onboarding from "@/pages/patient/Onboarding";
import ScanHistory from "@/pages/patient/ScanHistory";
import ScanSubmission from "@/pages/patient/ScanSubmission";
import Progress from "@/pages/patient/Progress";
import PatientChat from "@/pages/patient/Chat";
import PatientProfile from "@/pages/patient/Profile";
import DoctorProfile from "@/pages/patient/DoctorProfile";
import VideoResponse from "@/pages/patient/VideoResponse";
import DoctorOverview from "@/pages/doctor/Overview";
import ScanReview from "@/pages/doctor/ScanReview";
import ScanCompare from "@/pages/doctor/ScanCompare";
import Analytics from "@/pages/doctor/Analytics";
import DoctorSettings from "@/pages/doctor/Settings";
import PatientDetail from "@/pages/doctor/PatientDetail";
import PracticeSetup from "@/pages/doctor/PracticeSetup";
import RecordResponse from "@/pages/doctor/RecordResponse";
import Consults from "@/pages/doctor/Consults";
import Automations from "@/pages/doctor/Automations";
import AdminOverview from "@/pages/admin/Overview";
import AdminPractices from "@/pages/admin/Practices";
import AdminPracticeDetail from "@/pages/admin/PracticeDetail";
import AdminPatients from "@/pages/admin/Patients";
import AdminBilling from "@/pages/admin/Billing";
import AdminSupport from "@/pages/admin/Support";
import AdminSystem from "@/pages/admin/System";
import AdminSettings from "@/pages/admin/Settings";
import PublicConsult from "@/pages/public/Consult";
import Privacy from "@/pages/public/Privacy";
import Terms from "@/pages/public/Terms";
import Security from "@/pages/public/Security";
import Hipaa from "@/pages/public/Hipaa";
import Blog from "@/pages/public/Blog";
import Careers from "@/pages/public/Careers";
import Contact from "@/pages/public/Contact";
import Integrations from "@/pages/public/Integrations";
import Features from "@/pages/public/Features";
import SharedProgress from "@/pages/public/SharedProgress";
import ResetPassword from "@/pages/ResetPassword";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <ImpersonationBanner />
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/consult/:doctorSlug" element={<PublicConsult />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/security" element={<Security />} />
          <Route path="/hipaa" element={<Hipaa />} />
          <Route path="/blog" element={<Blog />} />
          <Route path="/careers" element={<Careers />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/integrations" element={<Integrations />} />
          <Route path="/features" element={<Features />} />
          <Route path="/shared/progress/:token" element={<SharedProgress />} />

          {/* Protected patient routes */}
          <Route element={<ProtectedRoute />}>
            <Route path="/patient" element={<PatientHome />} />
            <Route path="/patient/onboarding" element={<Onboarding />} />
            <Route path="/patient/scans" element={<ScanHistory />} />
            <Route path="/patient/scan" element={<ScanSubmission />} />
            <Route path="/patient/progress" element={<Progress />} />
            <Route path="/patient/chat" element={<PatientChat />} />
            <Route path="/patient/profile" element={<PatientProfile />} />
            <Route path="/patient/doctor" element={<DoctorProfile />} />
            <Route path="/patient/response/:id" element={<VideoResponse />} />
          </Route>

          {/* Protected doctor routes — main pages with sidebar */}
          <Route element={<ProtectedRoute />}>
            <Route element={<DoctorLayout />}>
              <Route path="/doctor" element={<DoctorOverview />} />
              <Route path="/doctor/analytics" element={<Analytics />} />
              <Route path="/doctor/consults" element={<Consults />} />
              <Route path="/doctor/automations" element={<Automations />} />
              <Route path="/doctor/settings" element={<DoctorSettings />} />
            </Route>
          </Route>

          {/* Protected doctor detail routes — full-screen with own back buttons */}
          <Route element={<ProtectedRoute />}>
            <Route path="/doctor/setup" element={<PracticeSetup />} />
            <Route path="/doctor/scans/:scanId" element={<ScanReview />} />
            <Route path="/doctor/scans/compare" element={<ScanCompare />} />
            <Route path="/doctor/record/:scanId" element={<RecordResponse />} />
            <Route path="/doctor/patients/:patientId" element={<PatientDetail />} />
          </Route>

          {/* Protected admin routes */}
          <Route element={<ProtectedRoute />}>
            <Route element={<AdminLayout />}>
              <Route path="/admin" element={<AdminOverview />} />
              <Route path="/admin/practices" element={<AdminPractices />} />
              <Route path="/admin/practices/:practiceId" element={<AdminPracticeDetail />} />
              <Route path="/admin/patients" element={<AdminPatients />} />
              <Route path="/admin/billing" element={<AdminBilling />} />
              <Route path="/admin/support" element={<AdminSupport />} />
              <Route path="/admin/system" element={<AdminSystem />} />
              <Route path="/admin/settings" element={<AdminSettings />} />
            </Route>
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
