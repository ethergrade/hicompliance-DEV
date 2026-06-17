import { apiClient } from "@/lib/api-client";

export interface DemoRequestFormData {
	nome: string;
	cognome: string;
	azienda: string;
	partita_iva: string;
	email: string;
	telefono: string;
	[key: string]: unknown;
}

export interface DemoRequestResponse {
	success: boolean;
	message?: string;
	[key: string]: unknown;
}

export const demoRequestApi = {
	/**
	 * Invia form richiesta demo al backend.
	 * Backend: POST /demo-request
	 */
	async submit(formData: DemoRequestFormData): Promise<DemoRequestResponse> {
		const res = await apiClient.post<DemoRequestResponse>(
			"/demo-request",
			formData,
		);
		return (res.data ?? {}) as DemoRequestResponse;
	},
};
