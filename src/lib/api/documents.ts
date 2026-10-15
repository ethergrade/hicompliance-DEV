// @ts-nocheck -- incident_documents columns added after types generation
import { supabase } from "@/integrations/supabase/client";
import { jsPDF } from "jspdf";
import type { DocumentResource, StoreDocumentRequest, UpdateDocumentRequest } from "@/types/api";

/**
 * Archivio documentale ISO su Supabase (tabella incident_documents, bucket incident-documents).
 * File in `org/{organization_id}/...`; report SurfaceScan/DarkRisk/conformità entrano via trigger DB.
 */
export type DocumentSource = "manual" | "irp" | "surfacescan" | "darkrisk" | "darkrisk_extended" | "compliance";

export const SOURCE_LABELS: Record<string, string> = {
  manual: "Caricato manualmente",
  irp: "IRP",
  surfacescan: "SurfaceScan360",
  darkrisk: "DarkRisk360",
  darkrisk_extended: "DarkRisk360 Esteso",
  compliance: "Conformità NIS2",
};

const BUCKET = "incident-documents";
const PREFIX: Record<string, string> = {
  "Piano Generale": "PG", "Checklist / OPL / SOP": "SOP", Template: "TPL", Processo: "PRC", Legal: "LEG",
  Audit: "AUD", "ISO & Audit": "ISO", NIS2: "NIS", Tecnico: "TEC", Varie: "VAR",
};

const toResource = (r: any): DocumentResource & Record<string, any> => ({
  ...r,
  tenant_id: r.organization_id,
  group_id: r.organization_id,
  created_at: r.uploaded_at,
  file_size: r.file_size ?? null,
  source_type: r.source_type || "manual",
});

async function currentUserRowId(): Promise<string | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data } = await supabase.from("users").select("id").eq("auth_user_id", auth.user.id).maybeSingle();
  return data?.id ?? null;
}

async function nextCode(orgId: string, category: string): Promise<string> {
  const { count } = await supabase.from("incident_documents").select("id", { count: "exact", head: true })
    .eq("organization_id", orgId).eq("category", category);
  return `${PREFIX[category] || "VAR"}-${String((count || 0) + 1).padStart(3, "0")}`;
}

function buildGeneratedPdf(doc: any): Blob {
  const pdf = new jsPDF();
  const c = doc.content_json || {};
  let y = 20;
  const line = (t: string, size = 10, bold = false) => {
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    pdf.setFontSize(size);
    for (const l of pdf.splitTextToSize(t, 180)) {
      if (y > 280) { pdf.addPage(); y = 20; }
      pdf.text(l, 15, y); y += size * 0.5 + 2;
    }
  };
  line(doc.name, 15, true); y += 2;
  line(`Codice: ${doc.document_code}_Rev${String(doc.revision).padStart(2, "0")}   Stato: ${doc.status}   Classificazione: ${doc.confidentiality}`);
  line(`Origine: ${SOURCE_LABELS[doc.source_type] || doc.source_type}   Data: ${new Date(doc.revision_date || doc.uploaded_at).toLocaleString("it-IT")}`);
  y += 4;
  if (doc.source_type === "compliance") {
    const score = Number(c.overall_score ?? 0);
    line("Sintesi di conformità e aderenza NIS2", 13, true);
    line(`Data snapshot: ${c.snapshot_date ? new Date(c.snapshot_date).toLocaleDateString("it-IT") : "-"}   Etichetta: ${c.label || c.year || "-"}`);
    line(`Classificazione NIS2 del soggetto: ${c.nis2_classification === "essential" ? "Essenziale" : c.nis2_classification === "important" ? "Importante" : "Non classificato"}`);
    line(`Punteggio complessivo di conformità: ${score}/100   Livello di aderenza: ${score >= 70 ? "Buono" : score >= 40 ? "Parziale" : "Insufficiente"}`);
    line(`Domande risposte: ${c.total_answered ?? 0} su ${c.total_questions ?? 0}`);
    y += 3; line("Punteggio per area", 12, true);
    const cats = c.category_scores || {};
    const entries = Array.isArray(cats) ? cats.map((x: any) => [x.name || x.category, x.score ?? x.value]) : Object.entries(cats);
    for (const [k, v] of entries) line(`- ${k}: ${typeof v === "object" ? (v as any)?.score ?? JSON.stringify(v) : v}`);
  } else {
    line("Sintesi del report", 13, true);
    const body = c.report ?? c;
    const walk = (o: any, depth = 0) => {
      if (depth > 2 || o == null) return;
      for (const [k, v] of Object.entries(o).slice(0, 40)) {
        if (v == null || k.endsWith("_path")) continue;
        if (typeof v === "object") { line(`${"  ".repeat(depth)}${k}:`, 10, true); if (!Array.isArray(v)) walk(v, depth + 1); else line(`${"  ".repeat(depth + 1)}${v.length} elementi`); }
        else line(`${"  ".repeat(depth)}${k}: ${String(v).slice(0, 400)}`);
      }
    };
    walk(body);
  }
  return pdf.output("blob");
}

export const documentsApi = {
  async list(companyId: string, _g?: string | null): Promise<DocumentResource[]> {
    const { data, error } = await supabase.from("incident_documents").select("*")
      .eq("organization_id", companyId).order("uploaded_at", { ascending: false });
    if (error) throw error;
    return (data || []).map(toResource);
  },

  async get(companyId: string, documentId: string): Promise<DocumentResource> {
    const { data, error } = await supabase.from("incident_documents").select("*").eq("id", documentId).eq("organization_id", companyId).single();
    if (error) throw error;
    return toResource(data);
  },

  async create(companyId: string, payload: StoreDocumentRequest & Record<string, any>): Promise<DocumentResource> {
    const category = payload.category || "Varie";
    const { data, error } = await supabase.from("incident_documents").insert({
      ...payload,
      category,
      organization_id: companyId,
      document_code: payload.document_code || (await nextCode(companyId, category)),
      uploaded_by: await currentUserRowId(),
    }).select().single();
    if (error) throw error;
    return toResource(data);
  },

  async createWithFile(companyId: string, file: Blob, fileName: string, metadata: Partial<StoreDocumentRequest> & Record<string, any> = {}): Promise<DocumentResource> {
    const safe = fileName.replace(/[^\w.\-]+/g, "_");
    const path = `org/${companyId}/${Date.now()}_${safe}`;
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: (file as File).type || undefined });
    if (upErr) throw upErr;
    return documentsApi.create(companyId, {
      name: metadata.name || fileName,
      ...metadata,
      file_path: path,
      file_size: file.size,
      file_type: (file as File).type || "application/octet-stream",
    } as any);
  },

  async update(companyId: string, documentId: string, payload: UpdateDocumentRequest & Record<string, any>): Promise<DocumentResource> {
    const { data, error } = await supabase.from("incident_documents")
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq("id", documentId).eq("organization_id", companyId).select().single();
    if (error) throw error;
    return toResource(data);
  },

  async delete(companyId: string, documentId: string): Promise<void> {
    const { data } = await supabase.from("incident_documents").select("file_path").eq("id", documentId).maybeSingle();
    if (data?.file_path) await supabase.storage.from(BUCKET).remove([data.file_path]);
    const { error } = await supabase.from("incident_documents").delete().eq("id", documentId).eq("organization_id", companyId);
    if (error) throw error;
  },

  async download(companyId: string, documentId: string): Promise<Blob> {
    const { data: doc, error } = await supabase.from("incident_documents").select("*").eq("id", documentId).eq("organization_id", companyId).single();
    if (error) throw error;
    if (doc.file_path) {
      const { data, error: e } = await supabase.storage.from(BUCKET).download(doc.file_path);
      if (e) throw e;
      return data;
    }
    const drPdf = doc.content_json?.pdf_storage_path;
    if (drPdf) {
      const { data } = await supabase.storage.from("darkrisk-reports").download(drPdf);
      if (data) return data;
    }
    return buildGeneratedPdf(doc);
  },

  async move(companyId: string, ids: string[], folderId: string | null): Promise<void> {
    if (folderId) {
      const { data: f } = await supabase.from("document_folders").select("id").eq("id", folderId).eq("organization_id", companyId).maybeSingle();
      if (!f) throw new Error("Cartella non trovata per questo cliente");
    }
    const { error } = await supabase.from("incident_documents")
      .update({ folder_id: folderId, updated_at: new Date().toISOString() })
      .in("id", ids).eq("organization_id", companyId);
    if (error) throw error;
  },

  /** Copia: nuovo record con nuovo codice, Rev01, Bozza; il file viene duplicato nello storage. */
  async copy(companyId: string, ids: string[], folderId: string | null): Promise<void> {
    const { data: docs, error } = await supabase.from("incident_documents").select("*")
      .in("id", ids).eq("organization_id", companyId);
    if (error) throw error;
    for (const d of docs || []) {
      let file_path = null;
      if (d.file_path) {
        file_path = `org/${companyId}/${Date.now()}_copia_${d.file_path.split("/").pop()}`;
        // copy() fallisce sui file legacy fuori da org/{id}/: fallback download + upload nel percorso del cliente
        const { error: cErr } = await supabase.storage.from(BUCKET).copy(d.file_path, file_path);
        if (cErr) {
          const { data: blob, error: dErr } = await supabase.storage.from(BUCKET).download(d.file_path);
          if (dErr || !blob) throw new Error(`File di "${d.name}" non accessibile per la copia`);
          const { error: uErr } = await supabase.storage.from(BUCKET).upload(file_path, blob, { contentType: d.file_type || undefined });
          if (uErr) throw uErr;
        }
      }
      const { id, document_code, uploaded_at, updated_at, source_id, ...rest } = d;
      const { error: iErr } = await supabase.from("incident_documents").insert({
        ...rest, file_path, folder_id: folderId, name: `${d.name} (copia)`,
        document_code: await nextCode(companyId, d.category || "Varie"),
        revision: 1, status: "Bozza", source_type: "manual", source_id: null,
        uploaded_by: await currentUserRowId(),
      });
      if (iErr) { if (file_path) await supabase.storage.from(BUCKET).remove([file_path]); throw iErr; }
    }
  },

  async setTags(companyId: string, id: string, tags: string[]): Promise<void> {
    const { error } = await supabase.from("incident_documents").update({ tags }).eq("id", id).eq("organization_id", companyId);
    if (error) throw error;
  },
};

export interface DocumentFolder { id: string; organization_id: string; parent_id: string | null; name: string; }

export const foldersApi = {
  async list(orgId: string): Promise<DocumentFolder[]> {
    const { data, error } = await supabase.from("document_folders").select("*").eq("organization_id", orgId).order("name");
    if (error) throw error;
    return data || [];
  },
  async create(orgId: string, name: string, parentId: string | null) {
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from("document_folders").insert({ organization_id: orgId, name, parent_id: parentId, created_by: auth.user?.id });
    if (error) throw error;
  },
  async rename(id: string, name: string) {
    const { error } = await supabase.from("document_folders").update({ name }).eq("id", id);
    if (error) throw error;
  },
  /** I documenti contenuti tornano nella radice (folder_id = null); le sottocartelle vengono eliminate. */
  async remove(id: string) {
    const { error } = await supabase.from("document_folders").delete().eq("id", id);
    if (error) throw error;
  },
};
