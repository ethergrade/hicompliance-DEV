import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { ClientProvider } from "@/contexts/ClientContext";
import { ClientSelectionGuard } from "@/components/guards/ClientSelectionGuard";
import { LoginPage } from "@/components/auth/LoginPage";
import { ScrollToTop } from "@/components/ScrollToTop";

import Dashboard from "./pages/Dashboard";
import ServiceDashboard from "./pages/ServiceDashboard";
import SurfaceScan360 from "./pages/SurfaceScan360";
import Assessment from "./pages/Assessment";
import Remediation from "./pages/Remediation";
import ReportPreview from "./pages/ReportPreview";
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
import SurfaceScanImpostazioni from "./pages/SurfaceScanImpostazioni";
import ComplianceEvents from "./pages/ComplianceEvents";
import ClientSelection from "./pages/ClientSelection";
import CyberNews from "./pages/CyberNews";
// import AdminReporting from "./pages/AdminReporting";
import Consistenze from "./pages/Consistenze";
import AdminCompanies from "./pages/AdminCompanies";
import AssessmentGanttTest from "./pages/AssessmentGanttTest";
// import AICiso from "./pages/AICiso";
import HiConsoleLanding from "./pages/HiConsoleLanding";
import MfaSetup from "./pages/MfaSetup";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import NucleiScan360 from "./pages/NucleiScan360";
import SamlCallback from "./pages/SamlCallback";
import EntraRedirect from "./pages/EntraRedirect";
import NotFound from "./pages/NotFound";
import { ErrorBoundary } from "./components/shared/ErrorFallback";

const StandardDarkRiskPage = lazy(
	() => import("./features/darkrisk/standard/StandardDarkRiskPage"),
);
const ExtendedDarkRiskPage = lazy(
	() => import("./features/darkrisk/extended/ExtendedDarkRiskPage"),
);

const darkRiskFallback = (
	<div className="p-8 text-sm text-muted-foreground">
		Caricamento DarkRisk360…
	</div>
);

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
							<Route path="/" element={<HiConsoleLanding />} />
							<Route path="/hiconsole" element={<HiConsoleLanding />} />
							<Route path="/auth" element={<LoginPage />} />
							<Route path="/auth/mfa-setup" element={<MfaSetup />} />
							<Route
								path="/auth/forgot-password"
								element={<ForgotPassword />}
							/>
							<Route path="/auth/reset-password" element={<ResetPassword />} />
							<Route path="/reset-password" element={<ResetPassword />} />
							<Route path="/saml-callback" element={<SamlCallback />} />
							<Route path="/login" element={<SamlCallback />} />
							<Route path="/entra" element={<EntraRedirect />} />
							<Route path="/admin/nuclei-scan360" element={<NucleiScan360 />} />
							<Route path="/admin/clients" element={<ClientSelection />} />
							<Route
								path="/dashboard"
								element={
									<ClientSelectionGuard>
										<Dashboard />
									</ClientSelectionGuard>
								}
							/>
							<Route
								path="/cyber-news"
								element={
									<ClientSelectionGuard>
										<CyberNews />
									</ClientSelectionGuard>
								}
							/>
							<Route
								path="/dashboard/service/:serviceCode"
								element={
									<ClientSelectionGuard>
										<ServiceDashboard />
									</ClientSelectionGuard>
								}
							/>
							<Route
								path="/surface-scan"
								element={
									<ClientSelectionGuard>
										<SurfaceScan360 />
									</ClientSelectionGuard>
								}
							/>
							<Route
								path="/surface-scan/exposure"
								element={<Navigate to="/surface-scan" replace />}
							/>
							<Route
								path="/dark-risk"
								element={
									<ClientSelectionGuard>
										<Suspense fallback={darkRiskFallback}>
											<ErrorBoundary>
												<StandardDarkRiskPage />
											</ErrorBoundary>
										</Suspense>
									</ClientSelectionGuard>
								}
							/>
							<Route
								path="/dark-risk-esteso"
								element={
									<ClientSelectionGuard>
										<Suspense fallback={darkRiskFallback}>
											<ErrorBoundary>
												<ExtendedDarkRiskPage />
											</ErrorBoundary>
										</Suspense>
									</ClientSelectionGuard>
								}
							/>
							<Route
								path="/assessment"
								element={
									<ClientSelectionGuard>
										<Assessment />
									</ClientSelectionGuard>
								}
							/>
							<Route
								path="/remediation"
								element={
									<ClientSelectionGuard>
										<Remediation />
									</ClientSelectionGuard>
								}
							/>
							{/* Route nascosta (non nel menu): anteprima/debug report cliente completo */}
							<Route
								path="/report"
								element={
									<ClientSelectionGuard>
										<ReportPreview />
									</ClientSelectionGuard>
								}
							/>
							<Route
								path="/analytics"
								element={
									<ClientSelectionGuard>
										<Analytics />
									</ClientSelectionGuard>
								}
							/>
							<Route
								path="/threats"
								element={
									<ClientSelectionGuard>
										<Threats />
									</ClientSelectionGuard>
								}
							/>
							<Route
								path="/reports"
								element={
									<ClientSelectionGuard>
										<Reports />
									</ClientSelectionGuard>
								}
							/>
							<Route
								path="/documents"
								element={
									<ClientSelectionGuard>
										<Documents />
									</ClientSelectionGuard>
								}
							/>
							<Route
								path="/asset-inventory"
								element={
									<ClientSelectionGuard>
										<AssetInventory />
									</ClientSelectionGuard>
								}
							/>
							<Route
								path="/incident-response"
								element={
									<ClientSelectionGuard>
										<IncidentResponse />
									</ClientSelectionGuard>
								}
							/>
							<Route
								path="/compliance-events"
								element={
									<ClientSelectionGuard>
										<ComplianceEvents />
									</ClientSelectionGuard>
								}
							/>
							<Route
								path="/threat-management"
								element={
									<ClientSelectionGuard>
										<ThreatManagement />
									</ClientSelectionGuard>
								}
							/>
							<Route
								path="/settings/users"
								element={
									<ClientSelectionGuard>
										<Users />
									</ClientSelectionGuard>
								}
							/>
							<Route
								path="/settings/integrations"
								element={
									<ClientSelectionGuard>
										<Integrations />
									</ClientSelectionGuard>
								}
							/>
							<Route
								path="/settings/alerts"
								element={
									<ClientSelectionGuard>
										<Settings />
									</ClientSelectionGuard>
								}
							/>
							<Route
								path="/impostazioni/surface-scan"
								element={
									<ClientSelectionGuard>
										<SurfaceScanImpostazioni />
									</ClientSelectionGuard>
								}
							/>
							<Route
								path="/admin/role-settings"
								element={
									<ClientSelectionGuard>
										<RoleSettings />
									</ClientSelectionGuard>
								}
							/>
							<Route path="/admin/companies" element={<AdminCompanies />} />
							<Route
								path="/admin/elevated-users"
								element={<AdminElevatedUsers />}
							/>
							<Route
								path="/test/assessment-gantt"
								element={
									<ClientSelectionGuard>
										<AssessmentGanttTest />
									</ClientSelectionGuard>
								}
							/>
							<Route
								path="/consistenze"
								element={
									<ClientSelectionGuard>
										<Consistenze />
									</ClientSelectionGuard>
								}
							/>
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
