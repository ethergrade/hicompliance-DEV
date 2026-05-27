import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/components/auth/AuthProvider";
 import { ClientProvider } from "@/contexts/ClientContext";
 import { ClientSelectionGuard } from "@/components/guards/ClientSelectionGuard";
import { RequireAuth } from "@/components/guards/RequireAuth";
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
import RoleSettings from "./pages/RoleSettings";
import Settings from "./pages/Settings";
import SurfaceScanSettings from "./pages/SurfaceScanSettings";
import ComplianceEvents from "./pages/ComplianceEvents";
  import ClientSelection from "./pages/ClientSelection";
import CyberNews from "./pages/CyberNews";
import AdminReporting from "./pages/AdminReporting";
import Consistenze from "./pages/Consistenze";
import AICiso from "./pages/AICiso";
import NotFound from "./pages/NotFound";
import { moduleVisibility } from "@/config/moduleVisibility";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <ClientProvider>
        <BrowserRouter>
          <ScrollToTop />
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<LoginPage />} />
            <Route element={<RequireAuth />}>
              <Route path="/admin/clients" element={<ClientSelection />} />
              <Route path="/dashboard" element={<ClientSelectionGuard><Dashboard /></ClientSelectionGuard>} />
              <Route
                path="/cyber-news"
                element={moduleVisibility.cyberNews ? <ClientSelectionGuard><CyberNews /></ClientSelectionGuard> : <Navigate to="/dashboard" replace />}
              />
              <Route path="/dashboard/service/:serviceCode" element={<ClientSelectionGuard><ServiceDashboard /></ClientSelectionGuard>} />
              <Route path="/surface-scan" element={<ClientSelectionGuard><SurfaceScan360 /></ClientSelectionGuard>} />
              <Route path="/dark-risk" element={<ClientSelectionGuard><DarkRisk360 /></ClientSelectionGuard>} />
              <Route path="/assessment" element={<ClientSelectionGuard><Assessment /></ClientSelectionGuard>} />
              <Route path="/remediation" element={<ClientSelectionGuard><Remediation /></ClientSelectionGuard>} />
              <Route path="/analytics" element={<ClientSelectionGuard><Analytics /></ClientSelectionGuard>} />
              <Route
                path="/threats"
                element={moduleVisibility.threats ? <ClientSelectionGuard><Threats /></ClientSelectionGuard> : <Navigate to={moduleVisibility.threatManagement ? "/threat-management" : "/dashboard"} replace />}
              />
              <Route path="/reports" element={<Navigate to="/dashboard" replace />} />
              <Route
                path="/documents"
                element={moduleVisibility.documents ? <ClientSelectionGuard><Documents /></ClientSelectionGuard> : <Navigate to="/dashboard" replace />}
              />
              <Route path="/asset-inventory" element={<ClientSelectionGuard><AssetInventory /></ClientSelectionGuard>} />
              <Route path="/incident-response" element={<Navigate to="/dashboard" replace />} />
              <Route path="/compliance-events" element={<Navigate to="/dashboard" replace />} />
              <Route
                path="/threat-management"
                element={moduleVisibility.threatManagement ? <ClientSelectionGuard><ThreatManagement /></ClientSelectionGuard> : <Navigate to="/dashboard" replace />}
              />
              <Route path="/settings/users" element={<ClientSelectionGuard><Users /></ClientSelectionGuard>} />
              <Route
                path="/settings/integrations"
                element={moduleVisibility.integrations ? <ClientSelectionGuard><Integrations /></ClientSelectionGuard> : <Navigate to="/dashboard" replace />}
              />
              <Route
                path="/settings/alerts"
                element={moduleVisibility.darkRiskAlerts ? <ClientSelectionGuard><Settings /></ClientSelectionGuard> : <Navigate to="/dashboard" replace />}
              />
              <Route
                path="/settings/surface-scan-alerts"
                element={moduleVisibility.darkRiskAlerts ? <ClientSelectionGuard><SurfaceScanSettings /></ClientSelectionGuard> : <Navigate to="/dashboard" replace />}
              />
              <Route path="/admin/role-settings" element={<ClientSelectionGuard><RoleSettings /></ClientSelectionGuard>} />
              <Route path="/admin/reporting" element={<Navigate to="/dashboard" replace />} />
              <Route
                path="/consistenze"
                element={moduleVisibility.consistenze ? <ClientSelectionGuard><Consistenze /></ClientSelectionGuard> : <Navigate to="/dashboard" replace />}
              />
              <Route path="/ai-ciso" element={<AICiso />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </BrowserRouter>
        </ClientProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
