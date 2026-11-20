/**
 * Montserrat (SIL Open Font License, src/assets/fonts/OFL.txt), il font dei
 * token HiSolution. Si scarica solo quando si genera un report: non pesa sul
 * caricamento della Console. Se non arriva, il PDF usa il font standard.
 */
import regularUrl from "@/assets/fonts/Montserrat-Regular.ttf?url";
import semiboldUrl from "@/assets/fonts/Montserrat-SemiBold.ttf?url";
import italicUrl from "@/assets/fonts/Montserrat-Italic.ttf?url";
import type { ReportFonts } from "./writer";

const toBase64 = async (url: string): Promise<string> => {
	const buffer = await (await fetch(url)).arrayBuffer();
	const bytes = new Uint8Array(buffer);
	let binary = "";
	const chunk = 0x8000;
	for (let i = 0; i < bytes.length; i += chunk) {
		binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
	}
	return btoa(binary);
};

let cached: Promise<ReportFonts | null> | null = null;

export const loadReportFonts = (): Promise<ReportFonts | null> => {
	cached ??= Promise.all([toBase64(regularUrl), toBase64(semiboldUrl), toBase64(italicUrl)])
		.then(([regular, semibold, italic]) => ({ regular, semibold, italic }))
		.catch(() => {
			cached = null;
			return null;
		});
	return cached;
};
