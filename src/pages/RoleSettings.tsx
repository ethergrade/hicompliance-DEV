import React from "react";
import { useQuery } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { configApi } from "@/lib/api";
import { useUserRoles } from "@/hooks/useUserRoles";

const roleDescriptions: Record<string, string> = {
  "super-admin": "Accesso di piattaforma completo.",
  master: "Ruolo globale di piattaforma restituito dalla configurazione API.",
  admin: "Gestione completa delle risorse del tenant.",
  manager: "Accesso operativo esteso sul tenant.",
  sales: "Gestione commerciale e selezione tenant.",
  customer: "Utente cliente associato al tenant.",
  viewer: "Sola lettura.",
};

const formatRole = (role: string) => {
  const labels: Record<string, string> = {
    "super-admin": "Super Admin",
    master: "Master",
    admin: "Admin",
    manager: "Manager",
    sales: "Sales",
    customer: "Customer",
    viewer: "Viewer",
  };

  return labels[role] ?? role;
};

export default function RoleSettings() {
  const { roles: currentUserRoles } = useUserRoles();
  const {
    data: roles = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["config", "roles"],
    queryFn: configApi.roles,
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Ruoli</h1>
          <p className="mt-2 text-muted-foreground">
            La piattaforma legge i ruoli dall&apos;API. I permessi fini per
            modulo non sono ancora esposti da endpoint dedicati.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Ruoli utente corrente</CardTitle>
            <CardDescription>
              Ruoli ricevuti da `GET /auth/me` o dal login.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {currentUserRoles.length > 0 ? (
                currentUserRoles.map((role) => (
                  <Badge key={role} variant="destructive">
                    {formatRole(role)}
                  </Badge>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">
                  Nessun ruolo disponibile per l&apos;utente corrente.
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ruoli assegnabili</CardTitle>
            <CardDescription>
              Lista restituita da `GET /config/roles`.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Caricamento ruoli...
              </div>
            ) : error ? (
              <div className="text-sm text-destructive">
                Impossibile caricare i ruoli dall&apos;API.
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {roles.map((role) => (
                  <div key={role} className="rounded-lg border p-4">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-primary" />
                      <span className="font-medium">{formatRole(role)}</span>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {roleDescriptions[role] ??
                        "Ruolo disponibile esposto dal backend."}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
