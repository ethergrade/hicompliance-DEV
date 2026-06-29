import { useQuery } from "@tanstack/react-query";
import { darkRiskGateway } from "../api/darkRiskGateway";
import { darkRiskQueryKeys } from "../api/queryKeys";

const EXTENDED_UI_V2_ENABLED =
	String(import.meta.env.VITE_DARKRISK_EXTENDED_UI_V2 ?? "true") !== "false";

export const useDarkRiskEntitlements = (companyId: string | null) => {
	const query = useQuery({
		queryKey: darkRiskQueryKeys.entitlements(companyId),
		queryFn: () => darkRiskGateway.getEntitlements(companyId!),
		enabled: Boolean(companyId),
		staleTime: 60_000,
		retry: false,
	});
	return {
		standardEnabled: query.data?.standardEnabled ?? false,
		extendedEnabled:
			EXTENDED_UI_V2_ENABLED && (query.data?.extendedEnabled ?? false),
		isLoading: query.isLoading,
		isError: query.isError,
	};
};
