/**
 * La pagina HiTrack con la scheda di un device già aperta: la tabella dei
 * device legge `?device=` e apre quella scheda. Usato da Asset Management.
 */
export const DEVICE_PARAM = "device";

export const hitrackDeviceHref = (deviceId: string) =>
	`/dashboard/service/hitrack?${DEVICE_PARAM}=${encodeURIComponent(deviceId)}`;
