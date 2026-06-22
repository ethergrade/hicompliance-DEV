import {
	surfaceScan360Api,
	type SurfaceScanJob,
} from "@/lib/api/surface-scan360";

const sortPortRows = (rows: ExposureOpenPortRow[]): ExposureOpenPortRow[] =>
	[...rows].sort((a, b) => {
		const hostDelta = String(a.host || "").localeCompare(String(b.host || ""));
		if (hostDelta !== 0) return hostDelta;
		return Number(a.port || 0) - Number(b.port || 0);
	});

export type ExposureStartRequest = {
	tenant_id: string;
	customer_id: string;
	assessment_id?: string;
	scan_name: string;
	root_domains?: string[];
	subdomains?: string[];
	public_ips?: string[];
	include_subdomain_discovery: boolean;
	include_port_scan: boolean;
	include_web_technology_detection: boolean;
	include_ssl_scan: boolean;
	include_network_vuln_scan: boolean;
	scan_depth: "light" | "deep" | "custom";
	protocol: "tcp" | "udp" | "both";
	custom_ports?: string;
	check_alive: boolean;
	detect_service_version: boolean;
	detect_os: boolean;
	traceroute: boolean;
};

export type ExposureSummary = {
	job_id: string | null;
	job_ids?: string[];
	live_job_ids?: string[];
	target_snapshots?: Array<{
		target_key: string;
		target_value: string;
		target_type: string;
		snapshot_source: "live" | "last_good";
		live: {
			job_id: string | null;
			status: string | null;
			created_at: string | null;
			scan_profile: string | null;
		};
		last_good: {
			job_id: string | null;
			status: string | null;
			created_at: string | null;
			completed_at: string | null;
			scan_profile: string | null;
		};
	}>;
	scope_mode?: "single_job" | "scope_latest_per_target";
	scope_aggregate?: boolean;
	targets_in_scope?: number;
	scope_counters?: {
		in_scope: number;
		excluded_by_scope: number;
		excluded_shared_noise: number;
	};
	status?: string;
	targets_total: number;
	hosts_with_open_ports: number;
	open_ports_total: number;
	critical_exposures: number;
	web_services: number;
	tls_services: number;
	ssl_snapshots?: number;
	top_open_ports: Array<{ port: number; count: number }>;
	technologies: Array<{ name: string; count: number }>;
	findings_by_severity: {
		critical: number;
		high: number;
		medium: number;
		low: number;
		info: number;
	};
	diff: {
		new_open_ports: unknown[];
		closed_ports: unknown[];
		unchanged_ports: unknown[];
		new_technologies: unknown[];
		removed_technologies: unknown[];
	};
};

export type ExposureOpenPortRow = {
	id: string;
	scan_job_id: string;
	target_id?: string | null;
	raw?: Record<string, unknown> | null;
	host: string;
	ip: string | null;
	port: number;
	protocol: string;
	state: string;
	service_name: string | null;
	service_product: string | null;
	service_version: string | null;
	is_web: boolean;
	is_tls: boolean;
	exposure_level: string;
	remediation_hint: string | null;
	first_seen_at: string;
	last_seen_at: string;
};

export type ExposureTechnologyRow = {
	id: string;
	scan_job_id: string;
	url: string;
	host: string;
	port: number | null;
	technology_name: string;
	technology_version: string | null;
	category: string | null;
	confidence: number | null;
	created_at: string;
};

export type ExposureFindingRow = {
	id: string;
	scan_job_id: string;
	finding_type: string;
	title: string;
	severity: string;
	cvss: number | null;
	cve_ids: string[] | null;
	affected_host: string | null;
	affected_port: number | null;
	affected_url: string | null;
	description: string | null;
	evidence: string | null;
	recommendation: string | null;
	source: string;
	status: string;
	created_at: string;
};

export async function startExposureScan(
	input: ExposureStartRequest,
	companyId: string,
	groupId?: string | null,
) {
	if (!companyId) throw new Error("companyId mancante");

	const domainTargets = [
		...(input.root_domains || []),
		...(input.subdomains || []),
	]
		.map((target) => String(target || "").trim())
		.filter(Boolean);
	const ipTargets = (input.public_ips || [])
		.map((target) => String(target || "").trim())
		.filter(Boolean);
	const targets = [
		...domainTargets.map((target) => ({
			target,
			scan_profile: "domain_exposure" as const,
		})),
		...ipTargets.map((target) => ({
			target,
			scan_profile: "ip_exposure" as const,
		})),
	];

	if (targets.length === 0)
		throw new Error("Nessun target disponibile per la scansione");

	const jobs = [];
	for (const target of targets.slice(0, 50)) {
		const job = await surfaceScan360Api.createJob(
			companyId,
			{
				target: target.target,
				scan_profile: target.scan_profile,
				scan_name: input.scan_name,
				authorization_confirmed: true,
				enable_amass: input.include_subdomain_discovery,
			},
			groupId,
		);
		jobs.push(job);
	}

	const firstJob = jobs[0] || null;
	return {
		...(firstJob || {}),
		job_id: firstJob?.id || firstJob?.job_id || null,
		jobs,
		queue: { total: jobs.length },
	};
}

export async function triggerExposurePoll() {
	// TODO: wire to backend API poll endpoint when available
	// Stub: simulate success
	return { success: true };
}

export async function resyncExposureJob(_jobId: string) {
	// TODO: wire to backend API resync endpoint when available
	// Stub: simulate success
	return { success: true };
}

export async function fetchExposureSummary(params: {
	customerId: string;
	jobId?: string;
	scopeMode?: "single_job" | "scope_latest_per_target";
	groupId?: string | null;
}): Promise<ExposureSummary> {
	const scopeMode =
		params.scopeMode ||
		(params.jobId ? "single_job" : "scope_latest_per_target");
	const data = await surfaceScan360Api.getExposureSummary(
		params.customerId,
		{ job_id: params.jobId, scope_mode: scopeMode },
		params.groupId,
	);
	return (data?.data || data) as ExposureSummary;
}

export async function fetchExposureJobs(
	customerId: string,
	_limit = 20,
): Promise<SurfaceScanJob[]> {
	if (!customerId) return [];
	return surfaceScan360Api.listJobs(customerId, { status: "all" });
}

export async function fetchOpenPorts(
	jobId: string,
): Promise<ExposureOpenPortRow[]> {
	return fetchOpenPortsByJobIds([jobId]);
}

export async function fetchOpenPortsByJobIds(
	_jobIds: string[],
): Promise<ExposureOpenPortRow[]> {
	// TODO: migrate to backend API (select surface_open_ports + targets + findings + observations)
	// Stub: return empty list — original body has 200+ lines of supabase calls
	return sortPortRows([]);
}

export async function fetchTechnologies(
	jobId: string,
): Promise<ExposureTechnologyRow[]> {
	return fetchTechnologiesByJobIds([jobId]);
}

export async function fetchTechnologiesByJobIds(
	_jobIds: string[],
): Promise<ExposureTechnologyRow[]> {
	// TODO: migrate to backend API (select surface_web_technologies)
	// Stub: return empty list
	return [];
}

export async function fetchExposureFindings(
	jobId: string,
): Promise<ExposureFindingRow[]> {
	return fetchExposureFindingsByJobIds([jobId]);
}

export async function fetchExposureFindingsByJobIds(
	_jobIds: string[],
): Promise<ExposureFindingRow[]> {
	// TODO: migrate to backend API (select surface_exposure_findings)
	// Stub: return empty list
	return [];
}
