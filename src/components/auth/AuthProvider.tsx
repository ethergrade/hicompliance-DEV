import React, {
	createContext,
	useContext,
	useEffect,
	useState,
	useCallback,
} from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { buildLoginUser } from "@/lib/supabase-session";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import type { LoginUser } from "@/types/api";

// Prototipo: l'accesso usa il database Supabase (non più il server Laravel).

export type MfaState =
	| { step: "none" }
	| { step: "verify"; challengeToken: string }
	| { step: "setup" };

interface AuthContextType {
	user: LoginUser | null;
	capabilities: Record<string, boolean> | undefined;
	loading: boolean;
	mfaState: MfaState;
	signIn: (login: string, password: string) => Promise<{ error: unknown }>;
	completeMfaVerify: (challengeToken: string, code: string) => Promise<{ error: unknown }>;
	signOut: () => Promise<void>;
	refreshCapabilities: (groupId: string) => Promise<void>;
	refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
	user: null,
	capabilities: undefined,
	loading: true,
	mfaState: { step: "none" },
	signIn: async () => ({ error: null }),
	completeMfaVerify: async () => ({ error: null }),
	signOut: async () => {},
	refreshCapabilities: async () => {},
	refreshUser: async () => {},
});

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);

const isPublicPath = (pathname: string) =>
	pathname === "/" ||
	pathname.startsWith("/auth") ||
	pathname.startsWith("/supplier-portal") ||
	pathname.startsWith("/hiconsole") ||
	pathname.startsWith("/reset-password") ||
	pathname === "/saml-callback" ||
	pathname === "/login" ||
	pathname === "/entra";

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
	const navigate = useNavigate();
	const location = useLocation();
	const queryClient = useQueryClient();
	const { toast } = useToast();
	const [user, setUser] = useState<LoginUser | null>(null);
	const [loading, setLoading] = useState(true);

	const loadUser = useCallback(async (id: string, email: string) => {
		try {
			setUser(await buildLoginUser(id, email));
		} catch (e) {
			console.error("Errore caricamento profilo:", e);
			setUser(null);
		}
	}, []);

	useEffect(() => {
		const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
			if (!session?.user) {
				setUser(null);
				return;
			}
			if (event === "SIGNED_IN" || event === "USER_UPDATED") {
				// evita chiamate al database dentro il callback
				setTimeout(() => loadUser(session.user.id, session.user.email ?? ""), 0);
			}
		});
		supabase.auth.getSession().then(async ({ data: { session } }) => {
			if (session?.user) await loadUser(session.user.id, session.user.email ?? "");
			setLoading(false);
		});
		return () => subscription.unsubscribe();
	}, [loadUser]);

	const signIn = useCallback(
		async (login: string, password: string) => {
			const { error } = await supabase.auth.signInWithPassword({ email: login.trim(), password });
			if (error) {
				toast({
					title: "Errore di accesso",
					description: error.message === "Invalid login credentials" ? "Credenziali non valide" : error.message,
					variant: "destructive",
				});
				return { error };
			}
			toast({ title: "Accesso effettuato", description: "Benvenuto in HiConsole" });
			return { error: null };
		},
		[toast],
	);

	const refreshUser = useCallback(async () => {
		const { data } = await supabase.auth.getUser();
		if (data.user) await loadUser(data.user.id, data.user.email ?? "");
	}, [loadUser]);

	const signOut = useCallback(async () => {
		await supabase.auth.signOut();
		setUser(null);
		queryClient.clear();
		toast({ title: "Disconnesso", description: "Sei stato disconnesso con successo" });
	}, [toast, queryClient]);

	const value: AuthContextType = {
		user,
		capabilities: undefined,
		loading,
		mfaState: { step: "none" },
		signIn,
		completeMfaVerify: async () => ({ error: null }),
		signOut,
		refreshCapabilities: async () => {},
		refreshUser,
	};

	useEffect(() => {
		if (loading || user) return;
		if (!isPublicPath(location.pathname)) navigate("/auth", { replace: true });
	}, [loading, user, location.pathname, navigate]);

	if (!loading && !user && !isPublicPath(location.pathname)) {
		return <AuthContext.Provider value={value} />;
	}
	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
