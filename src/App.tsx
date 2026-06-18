import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/components/auth/AuthProvider";
 import { ClientProvider } from "@/contexts/ClientContext";
 import { ClientSelectionGuard } from "@/components/guards/ClientSelectionGuard";
import { LoginPage } from "@/components/auth/LoginPage";
import { ScrollToTop } from "@/components/ScrollToTop";
import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import ServiceDashboard from "./pages/ServiceDashboard";
import SurfaceScan360 from "./pages/SurfaceScan360";
import DarkRisk360 from "./pages/DarkRisk360";
import Assessment from "./pages/Assessment";
import Remediation from "./pages/Remediation";
import Analytics from "./pages/Analytics";
import Threats from "./pages/Threats";
import Reports from "./pages/Reports";
import Documents from "./pages/Documents";
import AssetInventory from "./pages/AssetInventory";
import IncidentResponse from "./pages/IncidentResponse";
import ThreatManagement from "./pages/ThreatManagement";
import Integrations from "./pages/Integrations";
import Users from "./pages/Users";
import AdminElevatedUsers from "./pages/AdminElevatedUsers";
import RoleSettings from "./pages/RoleSettings";
import Settings from "./pages/Settings";
// HIDDEN: supabase-only (PRODOTTO SurfaceScan alerts), no backend API
// import SurfaceScanSettings from "./pages/SurfaceScanSettings";
import ComplianceEvents from "./pages/ComplianceEvents";
  import ClientSelection from "./pages/ClientSelection";
import CyberNews from "./pages/CyberNews";
// HIDDEN: supabase-only, no backend API
// import AdminReporting from "./pages/AdminReporting";
import Consistenze from "./pages/Consistenze";
import AdminCompanies from "./pages/AdminCompanies";
import AssessmentGanttTest from "./pages/AssessmentGanttTest";
// HIDDEN: supabase-only (ai_ciso_conversations), no backend model
// import AICiso from "./pages/AICiso";
import HiConsoleLanding from "./pages/HiConsoleLanding";
import MfaSetup from "./pages/MfaSetup";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <ScrollToTop />
        <AuthProvider>
          <ClientProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/hiconsole" element={<HiConsoleLanding />} />
            <Route path="/auth" element={<LoginPage />} />
            <Route path="/auth/mfa-setup" element={<MfaSetup />} />
            <Route path="/auth/forgot-password" element={<ForgotPassword />} />
            <Route path="/auth/reset-password" element={<ResetPassword />} />
            <Route path="/admin/clients" element={<ClientSelection />} />
            <Route path="/dashboard" element={<ClientSelectionGuard><Dashboard /></ClientSelectionGuard>} />
            <Route path="/cyber-news" element={<ClientSelectionGuard><CyberNews /></ClientSelectionGuard>} />
            <Route path="/dashboard/service/:serviceCode" element={<ClientSelectionGuard><ServiceDashboard /></ClientSelectionGuard>} />
            <Route path="/surface-scan" element={<ClientSelectionGuard><SurfaceScan360 /></ClientSelectionGuard>} />
            <Route path="/surface-scan/exposure" element={<Navigate to="/surface-scan" replace />} />
            <Route path="/dark-risk" element={<ClientSelectionGuard><DarkRisk360 /></ClientSelectionGuard>} />
            <Route path="/assessment" element={<ClientSelectionGuard><Assessment /></ClientSelectionGuard>} />
            <Route path="/remediation" element={<ClientSelectionGuard><Remediation /></ClientSelectionGuard>} />
            <Route path="/analytics" element={<ClientSelectionGuard><Analytics /></ClientSelectionGuard>} />
            <Route path="/threats" element={<ClientSelectionGuard><Threats /></ClientSelectionGuard>} />
            <Route path="/reports" element={<ClientSelectionGuard><Reports /></ClientSelectionGuard>} />
            <Route path="/documents" element={<ClientSelectionGuard><Documents /></ClientSelectionGuard>} />
            <Route path="/asset-inventory" element={<ClientSelectionGuard><AssetInventory /></ClientSelectionGuard>} />
            <Route path="/incident-response" element={<ClientSelectionGuard><IncidentResponse /></ClientSelectionGuard>} />
            <Route path="/compliance-events" element={<ClientSelectionGuard><ComplianceEvents /></ClientSelectionGuard>} />
            <Route path="/threat-management" element={<ClientSelectionGuard><ThreatManagement /></ClientSelectionGuard>} />
            <Route path="/settings/users" element={<ClientSelectionGuard><Users /></ClientSelectionGuard>} />
            <Route path="/settings/integrations" element={<ClientSelectionGuard><Integrations /></ClientSelectionGuard>} />
            <Route path="/settings/alerts" element={<ClientSelectionGuard><Settings /></ClientSelectionGuard>} />
            {/* HIDDEN: supabase-only SurfaceScan alerts */}
            {/* <Route path="/settings/surface-scan-alerts" element={<ClientSelectionGuard><SurfaceScanSettings /></ClientSelectionGuard>} /> */}
            <Route path="/admin/role-settings" element={<ClientSelectionGuard><RoleSettings /></ClientSelectionGuard>} />
            <Route path="/admin/companies" element={<AdminCompanies />} />
            <Route path="/admin/elevated-users" element={<AdminElevatedUsers />} />
            <Route path="/test/assessment-gantt" element={<ClientSelectionGuard><AssessmentGanttTest /></ClientSelectionGuard>} />
            {/* HIDDEN: supabase-only */}
            {/* <Route path="/admin/reporting" element={<AdminReporting />} /> */}
            <Route path="/consistenze" element={<ClientSelectionGuard><Consistenze /></ClientSelectionGuard>} />
            {/* HIDDEN: supabase-only (ai_ciso_conversations) */}
            {/* <Route path="/ai-ciso" element={<AICiso />} /> */}
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </ClientProvider>
      </AuthProvider>
        </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
