import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { LoginPage } from "@/components/auth/LoginPage";
import { ScrollToTop } from "@/components/ScrollToTop";
import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import SurfaceScan360 from "./pages/SurfaceScan360";
import DarkRisk360 from "./pages/DarkRisk360";
import Assessment from "./pages/Assessment";
import Remediation from "./pages/Remediation";
import Analytics from "./pages/Analytics";
import Threats from "./pages/Threats";
import Reports from "./pages/Reports";
import IncidentResponse from "./pages/IncidentResponse";
import ThreatManagement from "./pages/ThreatManagement";
import Integrations from "./pages/Integrations";
import Users from "./pages/Users";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <BrowserRouter>
          <ScrollToTop />
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<LoginPage />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/surface-scan" element={<SurfaceScan360 />} />
            <Route path="/dark-risk" element={<DarkRisk360 />} />
            <Route path="/assessment" element={<Assessment />} />
            <Route path="/remediation" element={<Remediation />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/threats" element={<Threats />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/incident-response" element={<IncidentResponse />} />
            <Route path="/threat-management" element={<ThreatManagement />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/settings/users" element={<Users />} />
            <Route path="/settings/integrations" element={<Integrations />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
