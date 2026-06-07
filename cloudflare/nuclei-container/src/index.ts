import { Container, getContainer } from "@cloudflare/containers";

export class NucleiContainer extends Container {
  defaultPort = 8080;
  requiredPorts = [8080];
  sleepAfter = "5m";
  enableInternet = true;
  pingEndpoint = "localhost/health";

  override onStart() {
    console.log("SurfaceScan360 Nuclei container started");
  }

  override onStop(params: { exitCode?: number; reason?: string }) {
    console.log("SurfaceScan360 Nuclei container stopped", params);
  }

  override onError(error: unknown) {
    console.error("SurfaceScan360 Nuclei container error", error);
  }
}

interface Env {
  NUCLEI_CONTAINER: DurableObjectNamespace<NucleiContainer>;
  NUCLEI_SHARED_SECRET: string;
  NUCLEI_CONTAINER_INSTANCE?: string;
  NUCLEI_TIMEOUT_SECONDS?: string;
  NUCLEI_MAX_TIMEOUT_SECONDS?: string;
  NUCLEI_RATE_LIMIT?: string;
  NUCLEI_MAX_FINDINGS?: string;
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
  const secret = String(env.NUCLEI_SHARED_SECRET || "").trim();
  if (!secret) return false;
  return String(request.headers.get("authorization") || "").trim() === `Bearer ${secret}`;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return json(200, { ok: true, worker: "surfacescan360-nuclei" });
    }

    if (request.method !== "POST" || url.pathname !== "/nuclei/scan") {
      return json(404, { error: "not_found" });
    }

    if (!String(env.NUCLEI_SHARED_SECRET || "").trim()) {
      return json(503, { error: "nuclei_shared_secret_not_configured" });
    }

    if (!isAuthorized(request, env)) {
      return json(401, { error: "unauthorized" });
    }

    const container = getContainer(env.NUCLEI_CONTAINER, env.NUCLEI_CONTAINER_INSTANCE || "surfacescan360-nuclei-v4");
    await container.startAndWaitForPorts({
      ports: [8080],
      startOptions: {
        enableInternet: true,
        envVars: {
          NUCLEI_SHARED_SECRET: env.NUCLEI_SHARED_SECRET,
          NUCLEI_TIMEOUT_SECONDS: String(env.NUCLEI_TIMEOUT_SECONDS || "45"),
          NUCLEI_MAX_TIMEOUT_SECONDS: String(env.NUCLEI_MAX_TIMEOUT_SECONDS || "120"),
          NUCLEI_RATE_LIMIT: String(env.NUCLEI_RATE_LIMIT || "5"),
          NUCLEI_MAX_FINDINGS: String(env.NUCLEI_MAX_FINDINGS || "100"),
        },
      },
    });

    return container.fetch(request);
  },
};
