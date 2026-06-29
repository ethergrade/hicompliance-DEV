export interface DarkRiskEntitlements {
	standardEnabled: boolean;
	extendedEnabled: boolean;
}

export interface DarkRiskEntitlementHints {
	hicomplianceEnabled: boolean;
	darkRisk360Enabled: boolean;
	darkRiskExtendedEnabled: boolean;
}

const isTrue = (value: unknown): value is true => value === true;

export const resolveDarkRiskEntitlements = (
	api: Partial<DarkRiskEntitlements> | null | undefined,
	hints: DarkRiskEntitlementHints | null | undefined,
): DarkRiskEntitlements => {
	const standardEnabled =
		isTrue(api?.standardEnabled) ||
		isTrue(hints?.hicomplianceEnabled) ||
		isTrue(hints?.darkRisk360Enabled) ||
		isTrue(hints?.darkRiskExtendedEnabled);

	const extendedEnabled =
		isTrue(api?.extendedEnabled) ||
		isTrue(hints?.darkRiskExtendedEnabled);

	return {
		standardEnabled,
		extendedEnabled,
	};
};
