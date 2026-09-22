import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PlatformCronJob {
	jobname: string;
	schedule: string;
	active: boolean;
}

export interface PlatformRuntimeSettings {
	stage_mode: boolean;
	paused_jobs: string[];
	updated_at: string | null;
}

// Etichette leggibili per i job pianificati.
export const CRON_JOB_LABELS: Record<string, string> = {
	"cve-enrichment-drain-30s": "Arricchimento vulnerabilità (continuo)",
	"cve-drain-5min": "Arricchimento vulnerabilità (batch)",
	"nuclei-scan360-process-ready-every-minute": "Coda scansioni approfondite",
	"connectsecure-result-poller": "Raccolta risultati scansioni esterne",
	"surfacescan-subdomain-queue-dispatch": "Coda sottodomini SurfaceScan",
	"surface-scan-weekly-monday": "Scansione settimanale SurfaceScan",
	"darkrisk360-manual-trigger-poll": "DarkRisk: richieste manuali",
	"darkrisk-esteso-admin-weekly-cron": "DarkRisk: ciclo settimanale",
	"darkrisk-scan-lock-cleanup": "DarkRisk: pulizia blocchi",
	"cisa-kev-sync-daily": "Sincronizzazione catalogo vulnerabilità note",
	"pentest-tools-poll": "Raccolta risultati verifiche attive",
};

export const cronScheduleLabel = (schedule: string): string => {
	switch (schedule) {
		case "* * * * *":
			return "Ogni minuto";
		case "*/2 * * * *":
			return "Ogni 2 minuti";
		case "*/5 * * * *":
			return "Ogni 5 minuti";
		case "*/10 * * * *":
			return "Ogni 10 minuti";
		case "0 0 * * 1":
			return "Ogni lunedì, 00:00";
		case "0 2 * * 1":
			return "Ogni lunedì, 02:00";
		case "0 3 * * *":
			return "Ogni giorno, 03:00";
		default:
			return schedule;
	}
};

const client = supabase as unknown as {
	from: (t: string) => any;
	rpc: (fn: string, args?: Record<string, unknown>) => Promise<any>;
};

export function usePlatformRuntimeSettings(enabled = true) {
	const queryClient = useQueryClient();

	const settings = useQuery({
		queryKey: ["platform-runtime-settings"],
		enabled,
		queryFn: async (): Promise<PlatformRuntimeSettings> => {
			const { data, error } = await client
				.from("platform_runtime_settings")
				.select("stage_mode, paused_jobs, updated_at")
				.maybeSingle();
			if (error) throw error;
			return {
				stage_mode: data?.stage_mode === true,
				paused_jobs: Array.isArray(data?.paused_jobs) ? data.paused_jobs : [],
				updated_at: data?.updated_at ?? null,
			};
		},
	});

	const jobs = useQuery({
		queryKey: ["platform-cron-jobs"],
		enabled,
		queryFn: async (): Promise<PlatformCronJob[]> => {
			const { data, error } = await client.rpc("list_platform_cron_jobs");
			if (error) throw error;
			return (data ?? []) as PlatformCronJob[];
		},
	});

	const invalidate = () => {
		queryClient.invalidateQueries({ queryKey: ["platform-runtime-settings"] });
		queryClient.invalidateQueries({ queryKey: ["platform-cron-jobs"] });
	};

	const setStageMode = useMutation({
		mutationFn: async (enabledFlag: boolean) => {
			const { data, error } = await client.rpc("set_platform_stage_mode", {
				_enabled: enabledFlag,
			});
			if (error) throw error;
			return data;
		},
		onSuccess: invalidate,
	});

	const setJobActive = useMutation({
		mutationFn: async (args: { jobname: string; active: boolean }) => {
			const { data, error } = await client.rpc("set_cron_job_active", {
				_jobname: args.jobname,
				_active: args.active,
			});
			if (error) throw error;
			return data;
		},
		onSuccess: invalidate,
	});

	return { settings, jobs, setStageMode, setJobActive };
}

/** Lettura leggera del solo flag, per banner e guardie UI. */
export function useStageMode() {
	return useQuery({
		queryKey: ["platform-stage-mode"],
		staleTime: 60_000,
		queryFn: async (): Promise<boolean> => {
			const { data, error } = await client
				.from("platform_runtime_settings")
				.select("stage_mode")
				.maybeSingle();
			if (error) return false;
			return data?.stage_mode === true;
		},
	});
}
