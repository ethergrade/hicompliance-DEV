import { Container, ContainerProxy, getContainer } from "@cloudflare/containers";

export { ContainerProxy };

export class NmapContainer extends Container {
  defaultPort = 8080;
  requiredPorts = [8080];
  sleepAfter = "1m";
  enableInternet = true;
  pingEndpoint = "localhost/health";

  override onStart() {
    console.log("SurfaceScan360 Nmap container started");
  }

  override onStop(params: { exitCode?: number; reason?: string }) {
    console.log("SurfaceScan360 Nmap container stopped", params);
  }

  override onError(error: unknown) {
    console.error("SurfaceScan360 Nmap container error", error);
  }
}

interface Env {
  NMAP_CONTAINER: DurableObjectNamespace<NmapContainer>;
  NMAP_SHARED_SECRET: string;
  NMAP_CONTAINER_INSTANCE?: string;
  NMAP_TIMEOUT_SECONDS?: string;
  NMAP_MAX_TIMEOUT_SECONDS?: string;
  NMAP_MAX_CIDR_PREFIX_V4?: string;
  NMAP_DEFAULT_PROFILE?: string;
  NMAP_ALLOWED_HOSTS?: string;
  NMAP_DENIED_HOSTS?: string;
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
  const secret = String(env.NMAP_SHARED_SECRET || "").trim();
  if (!secret) return false;
  return String(request.headers.get("authorization") || "").trim() === `Bearer ${secret}`;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return json(200, {
        ok: true,
        worker: "surfacescan360-nmap",
        container_instance: env.NMAP_CONTAINER_INSTANCE || "surfacescan360-nmap-v6-httpx-tech-dedupe",
      });
    }

    if (request.method !== "POST" || url.pathname !== "/nmap/scan") {
      return json(404, { error: "not_found" });
    }

    if (!String(env.NMAP_SHARED_SECRET || "").trim()) {
      return json(503, { error: "nmap_shared_secret_not_configured" });
    }

    if (!isAuthorized(request, env)) {
      return json(401, { error: "unauthorized" });
    }

    const container = getContainer(env.NMAP_CONTAINER, env.NMAP_CONTAINER_INSTANCE || "surfacescan360-nmap-v6-httpx-tech-dedupe");
    await container.startAndWaitForPorts({
      ports: [8080],
      startOptions: {
        enableInternet: true,
        envVars: {
          NMAP_SHARED_SECRET: env.NMAP_SHARED_SECRET,
          NMAP_TIMEOUT_SECONDS: String(env.NMAP_TIMEOUT_SECONDS || "60"),
          NMAP_MAX_TIMEOUT_SECONDS: String(env.NMAP_MAX_TIMEOUT_SECONDS || "180"),
          NMAP_MAX_CIDR_PREFIX_V4: String(env.NMAP_MAX_CIDR_PREFIX_V4 || "28"),
          NMAP_DEFAULT_PROFILE: String(env.NMAP_DEFAULT_PROFILE || "web_top"),
          NMAP_ALLOWED_HOSTS: String(env.NMAP_ALLOWED_HOSTS || "*"),
          NMAP_DENIED_HOSTS: String(env.NMAP_DENIED_HOSTS || ""),
        },
      },
    });

    return container.fetch(request);
  },
};
