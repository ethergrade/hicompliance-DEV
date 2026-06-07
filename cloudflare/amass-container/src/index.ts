import { Container, ContainerProxy, getContainer } from "@cloudflare/containers";

export { ContainerProxy };

type EgressParams = {
  service?: string;
  allowedHosts?: string;
  deniedHosts?: string;
  userAgentSuffix?: string;
};

const PRIVATE_HOST_REGEXES = [
  /^localhost$/i,
  /\.localhost$/i,
  /^0\./,
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^192\.168\./,
];

function csv(value: unknown): string[] {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function wildcardMatch(pattern: string, hostname: string): boolean {
  if (!pattern || pattern === "*") return true;
  if (pattern.startsWith("*.")) {
    const suffix = pattern.slice(1);
    return hostname.endsWith(suffix) || hostname === suffix.slice(1);
  }
  if (!pattern.includes("*")) return hostname === pattern;
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`, "i").test(hostname);
}

function isPrivateOrLocalHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized === "::1") return true;
  return PRIVATE_HOST_REGEXES.some((regex) => regex.test(normalized));
}

function enrichUserAgent(current: string | null, service: string, suffix?: string): string {
  const base = current && current.trim() ? current.trim() : "SurfaceScan360";
  const marker = `HiCompliance-SurfaceScan360/${service}-cloudflare-egress`;
  return suffix ? `${base} ${marker} ${suffix}` : `${base} ${marker}`;
}

async function controlledEgress(
  request: Request,
  env: Env,
  ctx: { containerId: string; className: string; params?: EgressParams },
): Promise<Response> {
  const started = Date.now();
  const url = new URL(request.url);
  const hostname = url.hostname.toLowerCase();
  const params = ctx.params || {};
  const service = params.service || "amass";
  const deniedHosts = [...csv(env.AMASS_EGRESS_DENIED_HOSTS), ...csv(params.deniedHosts)];
  const allowedHosts = [...csv(env.AMASS_EGRESS_ALLOWED_HOSTS || "*"), ...csv(params.allowedHosts)];

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return json(403, { error: "egress_protocol_blocked", protocol: url.protocol });
  }
  if (isPrivateOrLocalHost(hostname) || deniedHosts.some((pattern) => wildcardMatch(pattern, hostname))) {
    console.warn("amass-egress-blocked", JSON.stringify({ hostname, reason: "denied_or_private", containerId: ctx.containerId }));
    return json(403, { error: "egress_host_blocked", hostname });
  }
  if (allowedHosts.length > 0 && !allowedHosts.some((pattern) => wildcardMatch(pattern, hostname))) {
    console.warn("amass-egress-blocked", JSON.stringify({ hostname, reason: "not_allowed", containerId: ctx.containerId }));
    return json(403, { error: "egress_host_not_allowed", hostname });
  }

  const headers = new Headers(request.headers);
  headers.set("User-Agent", enrichUserAgent(headers.get("User-Agent"), service, env.AMASS_EGRESS_USER_AGENT_SUFFIX));
  headers.set("X-SurfaceScan360-Egress", "cloudflare-container-outbound");
  headers.set("X-SurfaceScan360-Egress-Service", service);

  const response = await fetch(new Request(request, { headers }));
  console.log("amass-egress", JSON.stringify({
    host: hostname,
    method: request.method,
    status: response.status,
    duration_ms: Date.now() - started,
    containerId: ctx.containerId,
  }));
  return response;
}

export class AmassContainer extends Container {
  defaultPort = 8080;
  requiredPorts = [8080];
  sleepAfter = "1m";
  enableInternet = true;
  interceptHttps = true;
  pingEndpoint = "localhost/health";

  override onStart() {
    console.log("SurfaceScan360 Amass container started");
  }

  override onStop(params: { exitCode?: number; reason?: string }) {
    console.log("SurfaceScan360 Amass container stopped", params);
  }

  override onError(error: unknown) {
    console.error("SurfaceScan360 Amass container error", error);
  }
}

AmassContainer.outboundHandlers = {
  controlledEgress,
};

AmassContainer.outbound = controlledEgress;

interface Env {
  AMASS_CONTAINER: DurableObjectNamespace<AmassContainer>;
  AMASS_SHARED_SECRET: string;
  AMASS_CONTAINER_INSTANCE?: string;
  AMASS_TIMEOUT_SECONDS?: string;
  AMASS_MAX_TIMEOUT_SECONDS?: string;
  AMASS_MAX_NAMES?: string;
  AMASS_EGRESS_ALLOWED_HOSTS?: string;
  AMASS_EGRESS_DENIED_HOSTS?: string;
  AMASS_EGRESS_USER_AGENT_SUFFIX?: string;
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
  const secret = String(env.AMASS_SHARED_SECRET || "").trim();
  if (!secret) return false;
  return String(request.headers.get("authorization") || "").trim() === `Bearer ${secret}`;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return json(200, { ok: true, worker: "surfacescan360-amass" });
    }

    if (request.method !== "POST" || url.pathname !== "/amass/enum") {
      return json(404, { error: "not_found" });
    }

    if (!String(env.AMASS_SHARED_SECRET || "").trim()) {
      return json(503, { error: "amass_shared_secret_not_configured" });
    }

    if (!isAuthorized(request, env)) {
      return json(401, { error: "unauthorized" });
    }

    const container = getContainer(env.AMASS_CONTAINER, env.AMASS_CONTAINER_INSTANCE || "surfacescan360-amass-v2");
    await container.setOutboundHandler("controlledEgress", {
      service: "amass",
      allowedHosts: env.AMASS_EGRESS_ALLOWED_HOSTS || "*",
      deniedHosts: env.AMASS_EGRESS_DENIED_HOSTS || "",
      userAgentSuffix: env.AMASS_EGRESS_USER_AGENT_SUFFIX || "",
    });
    await container.startAndWaitForPorts({
      ports: [8080],
      startOptions: {
        enableInternet: true,
        envVars: {
          AMASS_SHARED_SECRET: env.AMASS_SHARED_SECRET,
          AMASS_TIMEOUT_SECONDS: String(env.AMASS_TIMEOUT_SECONDS || "45"),
          AMASS_MAX_TIMEOUT_SECONDS: String(env.AMASS_MAX_TIMEOUT_SECONDS || "120"),
          AMASS_MAX_NAMES: String(env.AMASS_MAX_NAMES || "250"),
          SURFACESCAN_EGRESS_PROXY_MODE: "cloudflare_container_outbound",
        },
      },
    });

    return container.fetch(request);
  },
};
