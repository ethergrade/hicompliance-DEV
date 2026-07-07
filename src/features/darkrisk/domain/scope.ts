import {
	DARKRISK_SCOPE_LIMIT,
	type DarkRiskScopeTarget,
	type DarkRiskScopeType,
} from "./contracts";

const DOMAIN_PATTERN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

const isPublicIpv4 = (value: string): boolean => {
	const parts = value.split(".").map(Number);
	if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
	const [a, b] = parts;
	if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
	if (a === 169 && b === 254) return false;
	if (a === 172 && b >= 16 && b <= 31) return false;
	if (a === 192 && b === 168) return false;
	if (a === 192 && b === 0 && parts[2] === 2) return false;
	if (a === 100 && b >= 64 && b <= 127) return false;
	if (a === 198 && (b === 18 || b === 19)) return false;
	if (a === 198 && b === 51 && parts[2] === 100) return false;
	if (a === 203 && b === 0 && parts[2] === 113) return false;
	return true;
};

export const normalizeScopeValue = (
	rawValue: string,
): { type: DarkRiskScopeType; value: string } => {
	const value = rawValue.trim().toLowerCase().replace(/\.$/, "");
	if (!value) throw new Error("Inserisci un dominio o un IP pubblico");
	if (value.includes("@")) throw new Error("Inserisci il dominio senza @ e non un indirizzo email");
	if (/^[a-z][a-z\d+.-]*:\/\//i.test(value) || value.includes("/") || value.includes(":")) {
		throw new Error("URL, CIDR, range e IPv6 non sono ammessi nello scope DarkRisk360");
	}
	if (isPublicIpv4(value)) return { type: "ip", value };
	if (/^\d+(?:\.\d+){3}$/.test(value)) throw new Error("L’IP deve essere un IPv4 pubblico valido");
	if (!DOMAIN_PATTERN.test(value)) throw new Error("Dominio non valido: usa il formato esempio.it senza @");
	return { type: "domain", value };
};

export const normalizeScopeTargets = (
	values: string[],
	limit: number = DARKRISK_SCOPE_LIMIT,
): DarkRiskScopeTarget[] => {
	const unique = new Map<string, DarkRiskScopeTarget>();
	for (const rawValue of values) {
		const normalized = normalizeScopeValue(rawValue);
		unique.set(`${normalized.type}:${normalized.value}`, {
			id: `${normalized.type}:${normalized.value}`,
			...normalized,
			enabled: true,
		});
	}
	if (unique.size > limit) {
		throw new Error(`Lo scope può contenere al massimo ${limit} target complessivi`);
	}
	return [...unique.values()];
};
