import { describe, expect, it } from "vitest";
import { buildMailSecurityRows } from "./mailSecurity";

const row = (value: Record<string, unknown>) =>
	buildMailSecurityRows([{ module: "mail_security", value: { domain: "cliente.it", ...value } }], [])[0];

describe("stati della sicurezza email", () => {
	it("usa gli stati del backend quando ci sono", () => {
		const r = row({ spf_status: "ok", dmarc_status: "no_enforcement", dmarc_reporting: true, dkim_status: "not_verified" });
		expect([r.spfStatus, r.dmarcStatus, r.dkimStatus]).toEqual(["ok", "no_enforcement", "not_verified"]);
		expect(r.spoofingRisk).toBe("medio");
	});

	it("DKIM non osservato è «non verificato», non un'anomalia", () => {
		const r = row({ spf_records: ["v=spf1 -all"], dmarc_records: ["v=DMARC1; p=reject"], dkim_selectors_found: [] });
		expect(r.dkimStatus).toBe("not_verified");
		expect(r.dmarcStatus).toBe("enforced");
		expect(r.spoofingRisk).toBe("basso");
	});

	it("p=none ricavato dal record nelle osservazioni precedenti, con il reporting", () => {
		const r = row({ spf_records: ["v=spf1 -all"], dmarc_records: ["v=DMARC1; p=none; rua=mailto:x@cliente.it"] });
		expect(r.dmarcStatus).toBe("no_enforcement");
		expect(r.dmarcReporting).toBe(true);
	});

	it("un controllo incompleto non dichiara il rischio basso", () => {
		const r = row({ spf_status: "incomplete", dmarc_status: "incomplete", dkim_status: "incomplete" });
		expect(r.spoofingRisk).toBe("non_determinato");
	});

	it("SPF e DMARC assenti: rischio alto", () => {
		const r = row({ spf_status: "missing", dmarc_status: "missing", dkim_status: "not_verified" });
		expect(r.spoofingRisk).toBe("alto");
	});
});
