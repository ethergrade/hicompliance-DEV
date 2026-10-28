import { describe, expect, it } from "vitest";
import { assetOs } from "./assetOs";

describe("sistema operativo dell'asset HiPatch", () => {
	it("prende il campo più completo disponibile", () => {
		expect(assetOs({ "data.os_full_name": "Windows 11 Pro", "data.os_name": "Windows" })).toBe("Windows 11 Pro");
		expect(assetOs({ "data.os_full_name": " ", "data.os_name": "Windows" })).toBe("Windows");
		expect(assetOs({ "data.os_vendor": "Cisco", "data.os_version": "15.2" })).toBe("Cisco 15.2");
		expect(assetOs({ "data.platform": "linux" })).toBe("linux");
	});

	it("null quando la scansione non l'ha identificato", () => {
		expect(assetOs({ "data.name": "MAG40-FRESSX", "data.ip": "10.0.0.5" })).toBeNull();
		expect(assetOs({ "data.os_full_name": "", "data.os_name": "" })).toBeNull();
	});
});
