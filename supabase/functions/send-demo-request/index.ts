import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.3";
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface DemoRequestData {
  nome: string;
  cognome: string;
  azienda: string;
  partita_iva: string;
  email: string;
  telefono: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const demoData: DemoRequestData = await req.json();
    console.log("Received demo request:", demoData);

    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Save to database
    const { error: dbError } = await supabaseClient
      .from("lead_generation_index")
      .insert([{
        nome: demoData.nome,
        cognome: demoData.cognome,
        azienda: demoData.azienda,
        partita_iva: demoData.partita_iva,
        email: demoData.email,
        telefono: demoData.telefono
      }]);

    if (dbError) {
      console.error("Database error:", dbError);
      throw new Error(`Database error: ${dbError.message}`);
    }

    console.log("Demo request saved to database");

    // Send email to marketing
    const emailResponse = await resend.emails.send({
      from: "HiCompliance <noreply@resend.dev>",
      to: ["marketing@hisolution.it"],
      subject: `Nuova Richiesta Demo - ${demoData.azienda}`,
      html: `
        <h2>Nuova Richiesta Demo HiCompliance</h2>
        
        <h3>Dettagli Cliente:</h3>
        <ul>
          <li><strong>Nome:</strong> ${demoData.nome} ${demoData.cognome}</li>
          <li><strong>Azienda:</strong> ${demoData.azienda}</li>
          <li><strong>Partita IVA:</strong> ${demoData.partita_iva}</li>
          <li><strong>Email:</strong> ${demoData.email}</li>
          <li><strong>Telefono:</strong> ${demoData.telefono}</li>
        </ul>
        
        <p><strong>Data Richiesta:</strong> ${new Date().toLocaleString('it-IT')}</p>
        
        <hr>
        <p><small>Questa richiesta è stata generata automaticamente dalla piattaforma HiCompliance.</small></p>
      `,
    });

    console.log("Email sent successfully:", emailResponse);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Richiesta demo inviata con successo",
        emailId: emailResponse.data?.id 
      }), 
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      }
    );

  } catch (error: any) {
    console.error("Error in send-demo-request function:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || "Errore interno del server" 
      }),
      {
        status: 500,
        headers: { 
          "Content-Type": "application/json", 
          ...corsHeaders 
        },
      }
    );
  }
};

serve(handler);