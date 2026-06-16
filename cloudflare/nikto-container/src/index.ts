import { Container, ContainerProxy, getContainer } from "@cloudflare/containers";

export { ContainerProxy };

export class NiktoContainer extends Container {
  defaultPort = 8080;
  requiredPorts = [8080];
  sleepAfter = "1m";
  enableInternet = true;
  pingEndpoint = "localhost/health";

  override onStart() {
    console.log("SurfaceScan360 Nikto container started");
  }

  override onStop(params: { exitCode?: number; reason?: string }) {
    console.log("SurfaceScan360 Nikto container stopped", params);
  }

  override onError(error: unknown) {
    console.error("SurfaceScan360 Nikto container error", error);
  }
}

interface Env {
  NIKTO_CONTAINER: DurableObjectNamespace<NiktoContainer>;
  NIKTO_SHARED_SECRET: string;
  NIKTO_CONTAINER_INSTANCE?: string;
  NIKTO_TIMEOUT_SECONDS?: string;
  NIKTO_MAX_TIMEOUT_SECONDS?: string;
  NIKTO_TUNING?: string;
  NIKTO_ALLOWED_HOSTS?: string;
  NIKTO_DENIED_HOSTS?: string;
}

function json(status: number, payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function isAuthorized(request: Request, env: Env): boolean {
  const secret = String(env.NIKTO_SHARED_SECRET || "").trim();
  if (!secret) return false;
  return String(request.headers.get("authorization") || "").trim() === `Bearer ${secret}`;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return json(200, {
        ok: true,
        worker: "surfacescan360-nikto",
        container_instance: env.NIKTO_CONTAINER_INSTANCE || "surfacescan360-nikto-v1-safe-lab",
      });
    }

    if (request.method !== "POST" || url.pathname !== "/nikto/scan") {
      return json(404, { error: "not_found" });
    }

    if (!String(env.NIKTO_SHARED_SECRET || "").trim()) {
      return json(503, { error: "nikto_shared_secret_not_configured" });
    }

    if (!isAuthorized(request, env)) {
      return json(401, { error: "unauthorized" });
    }

    const container = getContainer(env.NIKTO_CONTAINER, env.NIKTO_CONTAINER_INSTANCE || "surfacescan360-nikto-v1-safe-lab");
    await container.startAndWaitForPorts({
      ports: [8080],
      startOptions: {
        enableInternet: true,
        envVars: {
          NIKTO_SHARED_SECRET: env.NIKTO_SHARED_SECRET,
          NIKTO_TIMEOUT_SECONDS: String(env.NIKTO_TIMEOUT_SECONDS || "180"),
          NIKTO_MAX_TIMEOUT_SECONDS: String(env.NIKTO_MAX_TIMEOUT_SECONDS || "240"),
          NIKTO_TUNING: String(env.NIKTO_TUNING || "123be"),
          NIKTO_ALLOWED_HOSTS: String(env.NIKTO_ALLOWED_HOSTS || "*"),
          NIKTO_DENIED_HOSTS: String(env.NIKTO_DENIED_HOSTS || ""),
        },
      },
    });

    return container.fetch(request);
  },
};
