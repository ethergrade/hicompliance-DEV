// I servizi HiSolution che leggono i dati da Sophos Central. Tutti usano lo
// stesso tenant Sophos del cliente (collegato in Integrazioni); ognuno ha il
// suo contratto. `live`: la dashboard mostra già dati reali.
export interface SophosService {
  code: "hiendpoint" | "hifirewall" | "hidetect" | "himail" | "himobile";
  name: string;
  description: string;
  live: boolean;
}

export const SOPHOS_SERVICES: SophosService[] = [
  { code: "hiendpoint", name: "HiEndpoint", description: "Protezione degli endpoint", live: true },
  { code: "hifirewall", name: "HiFirewall", description: "Firewall gestiti", live: true },
  { code: "hidetect", name: "HiDetect", description: "Rilevamento e risposta alle minacce", live: false },
  { code: "himail", name: "HiMail", description: "Sicurezza della posta", live: false },
  { code: "himobile", name: "HiMobile", description: "Dispositivi mobili", live: false },
];

export const SOPHOS_SERVICE_CODES: string[] = SOPHOS_SERVICES.map((s) => s.code);
