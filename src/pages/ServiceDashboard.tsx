import React from "react";
import { useParams, Link, Navigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { HiPatchDashboard } from "@/components/service-dashboards/HiPatchDashboard";
import { HiFirewallDashboard } from "@/components/service-dashboards/HiFirewallDashboard";
import { HiEndpointDashboard } from "@/components/service-dashboards/HiEndpointDashboard";
import { HiMailDashboard } from "@/components/service-dashboards/HiMailDashboard";
import { HiLogDashboard } from "@/components/service-dashboards/HiLogDashboard";
import { HiDetectDashboard } from "@/components/service-dashboards/HiDetectDashboard";
import { HiMobileDashboard } from "@/components/service-dashboards/HiMobileDashboard";
import { HiTrackDashboard } from "@/components/service-dashboards/HiTrackDashboard";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

const serviceNameMap: Record<string, string> = {
	hipatch: "HiPatch",
	hi_patch: "HiPatch",
	hifirewall: "HiFirewall",
	hiendpoint: "HiEndpoint",
	himail: "HiMail",
	hilog: "HiLog",
	surfacescan: "SurfaceScan360",
	hitrack: "HiTrack",
	hi_track: "HiTrack",
	"hi-track": "HiTrack",
	hidetect: "HiDetect",
	himobile: "HiMobile",
};

const ServiceDashboard: React.FC = () => {
	const { serviceCode } = useParams<{ serviceCode: string }>();
	const serviceName = serviceNameMap[serviceCode || ""] || serviceCode;

	const renderServiceContent = () => {
		switch (serviceCode) {
			case "hipatch":
			case "hi_patch":
				return <HiPatchDashboard />;
			case "hifirewall":
				return <HiFirewallDashboard />;
			case "hiendpoint":
				return <HiEndpointDashboard />;
			case "himail":
				return <HiMailDashboard />;
			case "hilog":
				return <HiLogDashboard />;
			case "surfacescan":
				return <Navigate to="/surface-scan" replace />;
			case "hitrack":
			case "hi_track":
			case "hi-track":
				return <HiTrackDashboard />;
			case "hidetect":
				return <HiDetectDashboard />;
			case "himobile":
				return <HiMobileDashboard />;
			default:
				return <Navigate to="/assessment" replace />;
		}
	};

	return (
		<DashboardLayout>
			<div className="space-y-6">
				{/* Breadcrumb */}
				<Breadcrumb>
					<BreadcrumbList>
						<BreadcrumbItem>
							<BreadcrumbLink asChild>
								<Link to="/">Home</Link>
							</BreadcrumbLink>
						</BreadcrumbItem>
						<BreadcrumbSeparator />
						<BreadcrumbItem>
							<BreadcrumbLink asChild>
								<Link to="/dashboard">Dashboard</Link>
							</BreadcrumbLink>
						</BreadcrumbItem>
						<BreadcrumbSeparator />
						<BreadcrumbItem>
							<BreadcrumbPage>{serviceName}</BreadcrumbPage>
						</BreadcrumbItem>
					</BreadcrumbList>
				</Breadcrumb>

				{renderServiceContent()}
			</div>
		</DashboardLayout>
	);
};

export default ServiceDashboard;
