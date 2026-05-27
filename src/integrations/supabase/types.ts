export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      ai_ciso_conversations: {
        Row: {
          created_at: string
          id: string
          messages: Json
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          messages?: Json
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          messages?: Json
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      assessment_categories: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          name: string
          order_index: number
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          order_index: number
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          order_index?: number
        }
        Relationships: []
      }
      assessment_questions: {
        Row: {
          category_id: string | null
          created_at: string
          description: string | null
          id: string
          order_index: number
          question_text: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          order_index: number
          question_text: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          order_index?: number
          question_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_questions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "assessment_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_responses: {
        Row: {
          created_at: string
          id: string
          last_updated_by: string | null
          notes: string | null
          organization_id: string | null
          question_id: string | null
          status: Database["public"]["Enums"]["assessment_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_updated_by?: string | null
          notes?: string | null
          organization_id?: string | null
          question_id?: string | null
          status?: Database["public"]["Enums"]["assessment_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_updated_by?: string | null
          notes?: string | null
          organization_id?: string | null
          question_id?: string | null
          status?: Database["public"]["Enums"]["assessment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_responses_last_updated_by_fkey"
            columns: ["last_updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_responses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_responses_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "assessment_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_snapshots: {
        Row: {
          category_scores: Json
          created_at: string
          created_by: string | null
          id: string
          organization_id: string
          overall_score: number
          snapshot_year: number
          total_answered: number
          total_questions: number
          updated_at: string
        }
        Insert: {
          category_scores?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id: string
          overall_score?: number
          snapshot_year: number
          total_answered?: number
          total_questions?: number
          updated_at?: string
        }
        Update: {
          category_scores?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id?: string
          overall_score?: number
          snapshot_year?: number
          total_answered?: number
          total_questions?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_snapshots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_inventory: {
        Row: {
          access_points_count: number | null
          access_switches_count: number | null
          core_switches_count: number | null
          created_at: string
          endpoints_count: number | null
          firewalls_count: number | null
          hilog_apache_count: number | null
          hilog_custom_path_count: number | null
          hilog_dlp_linux_count: number | null
          hilog_dlp_windows_count: number | null
          hilog_endpoint_count: number | null
          hilog_entra_id_enabled: boolean | null
          hilog_iis_count: number | null
          hilog_server_count: number | null
          hilog_sharepoint_dlp_count: number | null
          hilog_sharepoint_dlp_enabled: boolean | null
          hilog_sql_count: number | null
          hilog_syslog_count: number | null
          hypervisors_count: number | null
          id: string
          locations_count: number | null
          miscellaneous_network_devices_count: number | null
          notes: string | null
          organization_id: string | null
          servers_count: number | null
          total_network_devices_count: number | null
          updated_at: string
          users_count: number | null
          va_ip_punctual_count: number | null
          va_subnet_21_count: number | null
          va_subnet_22_count: number | null
          va_subnet_23_count: number | null
          va_subnet_24_count: number | null
          va_subnet_25_count: number | null
          va_total_ips_count: number | null
          virtual_machines_count: number | null
        }
        Insert: {
          access_points_count?: number | null
          access_switches_count?: number | null
          core_switches_count?: number | null
          created_at?: string
          endpoints_count?: number | null
          firewalls_count?: number | null
          hilog_apache_count?: number | null
          hilog_custom_path_count?: number | null
          hilog_dlp_linux_count?: number | null
          hilog_dlp_windows_count?: number | null
          hilog_endpoint_count?: number | null
          hilog_entra_id_enabled?: boolean | null
          hilog_iis_count?: number | null
          hilog_server_count?: number | null
          hilog_sharepoint_dlp_count?: number | null
          hilog_sharepoint_dlp_enabled?: boolean | null
          hilog_sql_count?: number | null
          hilog_syslog_count?: number | null
          hypervisors_count?: number | null
          id?: string
          locations_count?: number | null
          miscellaneous_network_devices_count?: number | null
          notes?: string | null
          organization_id?: string | null
          servers_count?: number | null
          total_network_devices_count?: number | null
          updated_at?: string
          users_count?: number | null
          va_ip_punctual_count?: number | null
          va_subnet_21_count?: number | null
          va_subnet_22_count?: number | null
          va_subnet_23_count?: number | null
          va_subnet_24_count?: number | null
          va_subnet_25_count?: number | null
          va_total_ips_count?: number | null
          virtual_machines_count?: number | null
        }
        Update: {
          access_points_count?: number | null
          access_switches_count?: number | null
          core_switches_count?: number | null
          created_at?: string
          endpoints_count?: number | null
          firewalls_count?: number | null
          hilog_apache_count?: number | null
          hilog_custom_path_count?: number | null
          hilog_dlp_linux_count?: number | null
          hilog_dlp_windows_count?: number | null
          hilog_endpoint_count?: number | null
          hilog_entra_id_enabled?: boolean | null
          hilog_iis_count?: number | null
          hilog_server_count?: number | null
          hilog_sharepoint_dlp_count?: number | null
          hilog_sharepoint_dlp_enabled?: boolean | null
          hilog_sql_count?: number | null
          hilog_syslog_count?: number | null
          hypervisors_count?: number | null
          id?: string
          locations_count?: number | null
          miscellaneous_network_devices_count?: number | null
          notes?: string | null
          organization_id?: string | null
          servers_count?: number | null
          total_network_devices_count?: number | null
          updated_at?: string
          users_count?: number | null
          va_ip_punctual_count?: number | null
          va_subnet_21_count?: number | null
          va_subnet_22_count?: number | null
          va_subnet_23_count?: number | null
          va_subnet_24_count?: number | null
          va_subnet_25_count?: number | null
          va_total_ips_count?: number | null
          virtual_machines_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "asset_inventory_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_irp: {
        Row: {
          area: string
          categoria: string
          consistenza_item_id: string | null
          created_at: string
          criticita_score: number
          esposizione_score: number
          fornitore: string
          id: string
          last_sync_from_consistenze: string | null
          organization_id: string
          quantita: number
          rischio_intrinseco: number
          rischio_residuo: number
          superficie_score: number
          tecnologia: string
          updated_at: string
        }
        Insert: {
          area: string
          categoria?: string
          consistenza_item_id?: string | null
          created_at?: string
          criticita_score?: number
          esposizione_score?: number
          fornitore?: string
          id?: string
          last_sync_from_consistenze?: string | null
          organization_id: string
          quantita?: number
          rischio_intrinseco?: number
          rischio_residuo?: number
          superficie_score?: number
          tecnologia?: string
          updated_at?: string
        }
        Update: {
          area?: string
          categoria?: string
          consistenza_item_id?: string | null
          created_at?: string
          criticita_score?: number
          esposizione_score?: number
          fornitore?: string
          id?: string
          last_sync_from_consistenze?: string | null
          organization_id?: string
          quantita?: number
          rischio_intrinseco?: number
          rischio_residuo?: number
          superficie_score?: number
          tecnologia?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_irp_consistenza_item_id_fkey"
            columns: ["consistenza_item_id"]
            isOneToOne: false
            referencedRelation: "consistenze_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_irp_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cisa_kev_catalog: {
        Row: {
          cve_id: string
          cwes: string[] | null
          date_added: string | null
          due_date: string | null
          known_ransomware_use: string | null
          notes: string | null
          product: string | null
          required_action: string | null
          short_description: string | null
          synced_at: string
          vendor_project: string | null
          vulnerability_name: string | null
        }
        Insert: {
          cve_id: string
          cwes?: string[] | null
          date_added?: string | null
          due_date?: string | null
          known_ransomware_use?: string | null
          notes?: string | null
          product?: string | null
          required_action?: string | null
          short_description?: string | null
          synced_at?: string
          vendor_project?: string | null
          vulnerability_name?: string | null
        }
        Update: {
          cve_id?: string
          cwes?: string[] | null
          date_added?: string | null
          due_date?: string | null
          known_ransomware_use?: string | null
          notes?: string | null
          product?: string | null
          required_action?: string | null
          short_description?: string | null
          synced_at?: string
          vendor_project?: string | null
          vulnerability_name?: string | null
        }
        Relationships: []
      }
      consistenze_clienti: {
        Row: {
          created_at: string
          created_by: string | null
          descrizione_telefoni: string | null
          id: string
          note_generali: string | null
          nr_canali_fonia: number
          nr_interni_telefonici: number
          nr_sedi: number
          organization_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          descrizione_telefoni?: string | null
          id?: string
          note_generali?: string | null
          nr_canali_fonia?: number
          nr_interni_telefonici?: number
          nr_sedi?: number
          organization_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          descrizione_telefoni?: string | null
          id?: string
          note_generali?: string | null
          nr_canali_fonia?: number
          nr_interni_telefonici?: number
          nr_sedi?: number
          organization_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consistenze_clienti_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      consistenze_items: {
        Row: {
          area: string
          categoria: string
          created_at: string
          created_by: string | null
          fornitore: string
          id: string
          metriche_json: Json
          organization_id: string
          quantita: number
          scadenza: string | null
          tecnologia: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          area: string
          categoria?: string
          created_at?: string
          created_by?: string | null
          fornitore?: string
          id?: string
          metriche_json?: Json
          organization_id: string
          quantita?: number
          scadenza?: string | null
          tecnologia?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          area?: string
          categoria?: string
          created_at?: string
          created_by?: string | null
          fornitore?: string
          id?: string
          metriche_json?: Json
          organization_id?: string
          quantita?: number
          scadenza?: string | null
          tecnologia?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consistenze_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_directory: {
        Row: {
          account_disabled: boolean
          auth_user_id: string | null
          created_at: string | null
          email: string | null
          first_name: string
          id: string
          is_platform_user: boolean
          job_title: string | null
          last_name: string
          module_permissions: Json
          notes: string | null
          organization_id: string | null
          phone: string | null
          updated_at: string | null
        }
        Insert: {
          account_disabled?: boolean
          auth_user_id?: string | null
          created_at?: string | null
          email?: string | null
          first_name: string
          id?: string
          is_platform_user?: boolean
          job_title?: string | null
          last_name: string
          module_permissions?: Json
          notes?: string | null
          organization_id?: string | null
          phone?: string | null
          updated_at?: string | null
        }
        Update: {
          account_disabled?: boolean
          auth_user_id?: string | null
          created_at?: string | null
          email?: string | null
          first_name?: string
          id?: string
          is_platform_user?: boolean
          job_title?: string | null
          last_name?: string
          module_permissions?: Json
          notes?: string | null
          organization_id?: string | null
          phone?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_directory_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      critical_infrastructure: {
        Row: {
          asset_id: string
          backup_frequency: string | null
          component_name: string
          created_at: string | null
          created_by: string | null
          criticality: string | null
          dependencies: string | null
          has_backup: string | null
          id: string
          ir_notes: string | null
          last_test_date: string | null
          location: string | null
          main_controls: string | null
          management_type: string | null
          organization_id: string | null
          owner_team: string | null
          rpo_hours: number | null
          rto_hours: number | null
          runbook_link: string | null
          sensitive_data: string | null
          updated_at: string | null
        }
        Insert: {
          asset_id: string
          backup_frequency?: string | null
          component_name?: string
          created_at?: string | null
          created_by?: string | null
          criticality?: string | null
          dependencies?: string | null
          has_backup?: string | null
          id?: string
          ir_notes?: string | null
          last_test_date?: string | null
          location?: string | null
          main_controls?: string | null
          management_type?: string | null
          organization_id?: string | null
          owner_team?: string | null
          rpo_hours?: number | null
          rto_hours?: number | null
          runbook_link?: string | null
          sensitive_data?: string | null
          updated_at?: string | null
        }
        Update: {
          asset_id?: string
          backup_frequency?: string | null
          component_name?: string
          created_at?: string | null
          created_by?: string | null
          criticality?: string | null
          dependencies?: string | null
          has_backup?: string | null
          id?: string
          ir_notes?: string | null
          last_test_date?: string | null
          location?: string | null
          main_controls?: string | null
          management_type?: string | null
          organization_id?: string | null
          owner_team?: string | null
          rpo_hours?: number | null
          rto_hours?: number | null
          runbook_link?: string | null
          sensitive_data?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "critical_infrastructure_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cve_enrichment_queue: {
        Row: {
          attempts: number
          cve_id: string
          id: string
          last_error: string | null
          organization_id: string | null
          processed_at: string | null
          queued_at: string
          source: string | null
          status: string
        }
        Insert: {
          attempts?: number
          cve_id: string
          id?: string
          last_error?: string | null
          organization_id?: string | null
          processed_at?: string | null
          queued_at?: string
          source?: string | null
          status?: string
        }
        Update: {
          attempts?: number
          cve_id?: string
          id?: string
          last_error?: string | null
          organization_id?: string | null
          processed_at?: string | null
          queued_at?: string
          source?: string | null
          status?: string
        }
        Relationships: []
      }
      cve_intel_cache: {
        Row: {
          cisa_kev: boolean | null
          cpe_json: Json | null
          created_at: string
          cve_id: string
          cvss_v2_score: number | null
          cvss_v2_vector: string | null
          cvss_v3_score: number | null
          cvss_v3_severity: string | null
          cvss_v3_vector: string | null
          cwe_ids: string[] | null
          description: string | null
          epss_percentile: number | null
          epss_score: number | null
          exploit_links: Json | null
          fetch_error: string | null
          fetch_status: string | null
          kev_date_added: string | null
          kev_due_date: string | null
          kev_required_action: string | null
          last_modified_at: string | null
          nvd_status: string | null
          published_at: string | null
          references_json: Json | null
          refreshed_at: string
        }
        Insert: {
          cisa_kev?: boolean | null
          cpe_json?: Json | null
          created_at?: string
          cve_id: string
          cvss_v2_score?: number | null
          cvss_v2_vector?: string | null
          cvss_v3_score?: number | null
          cvss_v3_severity?: string | null
          cvss_v3_vector?: string | null
          cwe_ids?: string[] | null
          description?: string | null
          epss_percentile?: number | null
          epss_score?: number | null
          exploit_links?: Json | null
          fetch_error?: string | null
          fetch_status?: string | null
          kev_date_added?: string | null
          kev_due_date?: string | null
          kev_required_action?: string | null
          last_modified_at?: string | null
          nvd_status?: string | null
          published_at?: string | null
          references_json?: Json | null
          refreshed_at?: string
        }
        Update: {
          cisa_kev?: boolean | null
          cpe_json?: Json | null
          created_at?: string
          cve_id?: string
          cvss_v2_score?: number | null
          cvss_v2_vector?: string | null
          cvss_v3_score?: number | null
          cvss_v3_severity?: string | null
          cvss_v3_vector?: string | null
          cwe_ids?: string[] | null
          description?: string | null
          epss_percentile?: number | null
          epss_score?: number | null
          exploit_links?: Json | null
          fetch_error?: string | null
          fetch_status?: string | null
          kev_date_added?: string | null
          kev_due_date?: string | null
          kev_required_action?: string | null
          last_modified_at?: string | null
          nvd_status?: string | null
          published_at?: string | null
          references_json?: Json | null
          refreshed_at?: string
        }
        Relationships: []
      }
      dark_risk_alerts: {
        Row: {
          alert_email: string
          alert_types: Json
          created_at: string
          id: string
          is_active: boolean
          organization_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          alert_email: string
          alert_types?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          organization_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          alert_email?: string
          alert_types?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          organization_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dark_risk_alerts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      emergency_contacts: {
        Row: {
          category: string
          created_at: string
          directory_contact_id: string | null
          email: string
          id: string
          irp_role: string | null
          job_title: string | null
          name: string
          organization_id: string | null
          phone: string
          responsibilities: string | null
          role: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          directory_contact_id?: string | null
          email: string
          id?: string
          irp_role?: string | null
          job_title?: string | null
          name: string
          organization_id?: string | null
          phone: string
          responsibilities?: string | null
          role: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          directory_contact_id?: string | null
          email?: string
          id?: string
          irp_role?: string | null
          job_title?: string | null
          name?: string
          organization_id?: string | null
          phone?: string
          responsibilities?: string | null
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "emergency_contacts_directory_contact_id_fkey"
            columns: ["directory_contact_id"]
            isOneToOne: false
            referencedRelation: "contact_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emergency_contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      external_cve_findings: {
        Row: {
          affected_url: string | null
          attribution_confidence: string
          confidence: string
          created_at: string
          cve: string[]
          cvss: number | null
          cvssv3: number | null
          cwe: string | null
          epss_percentile: number | null
          epss_score: number | null
          evidence: Json | null
          external_finding_id: number | null
          id: string
          in_cisa_catalog: boolean
          ip: unknown
          name: string
          organization_id: string
          port: number | null
          protocol: string | null
          provider: string
          raw_finding: Json | null
          recommendation: string | null
          risk_level: number
          scan_job_id: string
          service: string | null
          severity: string
          status: string
          target: string
          task_id: string | null
          updated_at: string
        }
        Insert: {
          affected_url?: string | null
          attribution_confidence?: string
          confidence?: string
          created_at?: string
          cve?: string[]
          cvss?: number | null
          cvssv3?: number | null
          cwe?: string | null
          epss_percentile?: number | null
          epss_score?: number | null
          evidence?: Json | null
          external_finding_id?: number | null
          id?: string
          in_cisa_catalog?: boolean
          ip?: unknown
          name: string
          organization_id: string
          port?: number | null
          protocol?: string | null
          provider?: string
          raw_finding?: Json | null
          recommendation?: string | null
          risk_level?: number
          scan_job_id: string
          service?: string | null
          severity?: string
          status?: string
          target: string
          task_id?: string | null
          updated_at?: string
        }
        Update: {
          affected_url?: string | null
          attribution_confidence?: string
          confidence?: string
          created_at?: string
          cve?: string[]
          cvss?: number | null
          cvssv3?: number | null
          cwe?: string | null
          epss_percentile?: number | null
          epss_score?: number | null
          evidence?: Json | null
          external_finding_id?: number | null
          id?: string
          in_cisa_catalog?: boolean
          ip?: unknown
          name?: string
          organization_id?: string
          port?: number | null
          protocol?: string | null
          provider?: string
          raw_finding?: Json | null
          recommendation?: string | null
          risk_level?: number
          scan_job_id?: string
          service?: string | null
          severity?: string
          status?: string
          target?: string
          task_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_cve_findings_scan_job_id_fkey"
            columns: ["scan_job_id"]
            isOneToOne: false
            referencedRelation: "external_scan_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_cve_findings_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "external_scan_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      external_scan_audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          created_at: string
          details: Json | null
          id: string
          organization_id: string | null
          scan_job_id: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          organization_id?: string | null
          scan_job_id?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          organization_id?: string | null
          scan_job_id?: string | null
        }
        Relationships: []
      }
      external_scan_jobs: {
        Row: {
          authorization_proof: string | null
          completed_at: string | null
          created_at: string
          error_message: string | null
          hosting_context: string
          id: string
          organization_id: string
          provider: string
          requested_by: string | null
          resolved_ips: string[]
          scan_profile: string
          shodan_status: string
          started_at: string | null
          status: string
          target: string
          target_type: string
          triggered_by: string
        }
        Insert: {
          authorization_proof?: string | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          hosting_context?: string
          id?: string
          organization_id: string
          provider?: string
          requested_by?: string | null
          resolved_ips?: string[]
          scan_profile: string
          shodan_status?: string
          started_at?: string | null
          status?: string
          target: string
          target_type: string
          triggered_by?: string
        }
        Update: {
          authorization_proof?: string | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          hosting_context?: string
          id?: string
          organization_id?: string
          provider?: string
          requested_by?: string | null
          resolved_ips?: string[]
          scan_profile?: string
          shodan_status?: string
          started_at?: string | null
          status?: string
          target?: string
          target_type?: string
          triggered_by?: string
        }
        Relationships: []
      }
      external_scan_reports: {
        Row: {
          created_at: string
          created_by: string | null
          download_url: string | null
          external_report_id: number | null
          format: string
          group_by: string
          id: string
          organization_id: string
          scan_job_id: string
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          download_url?: string | null
          external_report_id?: number | null
          format?: string
          group_by?: string
          id?: string
          organization_id: string
          scan_job_id: string
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          download_url?: string | null
          external_report_id?: number | null
          format?: string
          group_by?: string
          id?: string
          organization_id?: string
          scan_job_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_scan_reports_scan_job_id_fkey"
            columns: ["scan_job_id"]
            isOneToOne: false
            referencedRelation: "external_scan_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      external_scan_tasks: {
        Row: {
          completed_at: string | null
          created_at: string
          error_message: string | null
          external_scan_id: number | null
          external_task_id: number | null
          id: string
          organization_id: string
          progress: number | null
          provider: string
          raw_status: Json | null
          scan_job_id: string
          started_at: string | null
          status: string
          target: string
          tool_id: number
          tool_name: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          external_scan_id?: number | null
          external_task_id?: number | null
          id?: string
          organization_id: string
          progress?: number | null
          provider?: string
          raw_status?: Json | null
          scan_job_id: string
          started_at?: string | null
          status?: string
          target: string
          tool_id: number
          tool_name: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          external_scan_id?: number | null
          external_task_id?: number | null
          id?: string
          organization_id?: string
          progress?: number | null
          provider?: string
          raw_status?: Json | null
          scan_job_id?: string
          started_at?: string | null
          status?: string
          target?: string
          tool_id?: number
          tool_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_scan_tasks_scan_job_id_fkey"
            columns: ["scan_job_id"]
            isOneToOne: false
            referencedRelation: "external_scan_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      hilog_correlation_reports: {
        Row: {
          created_at: string
          description: string | null
          events_count: number
          filter_config: Json
          format: string
          id: string
          organization_id: string | null
          report_data: Json
          report_type: string
          status: string
          time_range_days: number
          time_range_label: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          events_count?: number
          filter_config?: Json
          format?: string
          id?: string
          organization_id?: string | null
          report_data?: Json
          report_type?: string
          status?: string
          time_range_days: number
          time_range_label: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          events_count?: number
          filter_config?: Json
          format?: string
          id?: string
          organization_id?: string | null
          report_data?: Json
          report_type?: string
          status?: string
          time_range_days?: number
          time_range_label?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hilog_correlation_reports_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      hisolution_services: {
        Row: {
          code: string
          created_at: string
          description: string | null
          icon: string | null
          id: string
          name: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          name: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      incident_documents: {
        Row: {
          approved_by: string[] | null
          category: Database["public"]["Enums"]["document_category"]
          confidentiality: string
          description: string | null
          document_code: string | null
          drafted_by: string[] | null
          file_path: string
          file_size: number
          file_type: string
          id: string
          name: string
          organization_id: string | null
          prepared_by: string[] | null
          reviewed_by: string[] | null
          revision: number
          revision_date: string | null
          status: string
          tags: string[] | null
          updated_at: string
          uploaded_at: string
          uploaded_by: string
        }
        Insert: {
          approved_by?: string[] | null
          category?: Database["public"]["Enums"]["document_category"]
          confidentiality?: string
          description?: string | null
          document_code?: string | null
          drafted_by?: string[] | null
          file_path: string
          file_size: number
          file_type: string
          id?: string
          name: string
          organization_id?: string | null
          prepared_by?: string[] | null
          reviewed_by?: string[] | null
          revision?: number
          revision_date?: string | null
          status?: string
          tags?: string[] | null
          updated_at?: string
          uploaded_at?: string
          uploaded_by: string
        }
        Update: {
          approved_by?: string[] | null
          category?: Database["public"]["Enums"]["document_category"]
          confidentiality?: string
          description?: string | null
          document_code?: string | null
          drafted_by?: string[] | null
          file_path?: string
          file_size?: number
          file_type?: string
          id?: string
          name?: string
          organization_id?: string | null
          prepared_by?: string[] | null
          reviewed_by?: string[] | null
          revision?: number
          revision_date?: string | null
          status?: string
          tags?: string[] | null
          updated_at?: string
          uploaded_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "incident_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_audit_logs: {
        Row: {
          action: string
          changed_by: string | null
          changed_by_email: string | null
          created_at: string
          id: string
          integration_id: string | null
          new_values: Json | null
          old_values: Json | null
          organization_id: string | null
          service_name: string
        }
        Insert: {
          action: string
          changed_by?: string | null
          changed_by_email?: string | null
          created_at?: string
          id?: string
          integration_id?: string | null
          new_values?: Json | null
          old_values?: Json | null
          organization_id?: string | null
          service_name: string
        }
        Update: {
          action?: string
          changed_by?: string | null
          changed_by_email?: string | null
          created_at?: string
          id?: string
          integration_id?: string | null
          new_values?: Json | null
          old_values?: Json | null
          organization_id?: string | null
          service_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      irp_documents: {
        Row: {
          created_at: string
          document_data: Json
          id: string
          is_published: boolean
          organization_id: string | null
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          created_at?: string
          document_data?: Json
          id?: string
          is_published?: boolean
          organization_id?: string | null
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          created_at?: string
          document_data?: Json
          id?: string
          is_published?: boolean
          organization_id?: string | null
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "irp_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      irp_history: {
        Row: {
          area_scores_json: Json
          id: string
          irp_score: number
          organization_id: string
          snapshot_date: string
        }
        Insert: {
          area_scores_json?: Json
          id?: string
          irp_score?: number
          organization_id: string
          snapshot_date?: string
        }
        Update: {
          area_scores_json?: Json
          id?: string
          irp_score?: number
          organization_id?: string
          snapshot_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "irp_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_generation_index: {
        Row: {
          azienda: string
          cognome: string
          created_at: string
          email: string
          id: string
          nome: string
          partita_iva: string
          telefono: string
          updated_at: string
        }
        Insert: {
          azienda: string
          cognome: string
          created_at?: string
          email: string
          id?: string
          nome: string
          partita_iva: string
          telefono: string
          updated_at?: string
        }
        Update: {
          azienda?: string
          cognome?: string
          created_at?: string
          email?: string
          id?: string
          nome?: string
          partita_iva?: string
          telefono?: string
          updated_at?: string
        }
        Relationships: []
      }
      organization_integrations: {
        Row: {
          api_key: string
          api_methods: Json | null
          api_url: string
          created_at: string
          id: string
          is_active: boolean | null
          organization_id: string | null
          service_id: string | null
          updated_at: string
        }
        Insert: {
          api_key: string
          api_methods?: Json | null
          api_url: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          organization_id?: string | null
          service_id?: string | null
          updated_at?: string
        }
        Update: {
          api_key?: string
          api_methods?: Json | null
          api_url?: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          organization_id?: string | null
          service_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_integrations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_integrations_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "hisolution_services"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_locations: {
        Row: {
          address: string
          city: string
          country: string
          created_at: string
          email: string | null
          id: string
          is_main_location: boolean | null
          name: string
          notes: string | null
          organization_id: string
          phone: string | null
          postal_code: string | null
          tags: string[] | null
          updated_at: string
        }
        Insert: {
          address: string
          city: string
          country?: string
          created_at?: string
          email?: string | null
          id?: string
          is_main_location?: boolean | null
          name: string
          notes?: string | null
          organization_id: string
          phone?: string | null
          postal_code?: string | null
          tags?: string[] | null
          updated_at?: string
        }
        Update: {
          address?: string
          city?: string
          country?: string
          created_at?: string
          email?: string | null
          id?: string
          is_main_location?: boolean | null
          name?: string
          notes?: string | null
          organization_id?: string
          phone?: string | null
          postal_code?: string | null
          tags?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_locations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_profiles: {
        Row: {
          business_sector: string | null
          ciso_substitute: string | null
          created_at: string
          email: string | null
          fiscal_code: string | null
          id: string
          legal_address: string | null
          legal_name: string | null
          nis2_classification:
            | Database["public"]["Enums"]["nis2_classification"]
            | null
          operational_address: string | null
          organization_id: string
          pec: string | null
          phone: string | null
          updated_at: string
          vat_number: string | null
        }
        Insert: {
          business_sector?: string | null
          ciso_substitute?: string | null
          created_at?: string
          email?: string | null
          fiscal_code?: string | null
          id?: string
          legal_address?: string | null
          legal_name?: string | null
          nis2_classification?:
            | Database["public"]["Enums"]["nis2_classification"]
            | null
          operational_address?: string | null
          organization_id: string
          pec?: string | null
          phone?: string | null
          updated_at?: string
          vat_number?: string | null
        }
        Update: {
          business_sector?: string | null
          ciso_substitute?: string | null
          created_at?: string
          email?: string | null
          fiscal_code?: string | null
          id?: string
          legal_address?: string | null
          legal_name?: string | null
          nis2_classification?:
            | Database["public"]["Enums"]["nis2_classification"]
            | null
          operational_address?: string | null
          organization_id?: string
          pec?: string | null
          phone?: string | null
          updated_at?: string
          vat_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_services: {
        Row: {
          created_at: string
          health_score: number | null
          id: string
          last_updated: string
          organization_id: string | null
          service_id: string | null
          status: Database["public"]["Enums"]["service_status"]
        }
        Insert: {
          created_at?: string
          health_score?: number | null
          id?: string
          last_updated?: string
          organization_id?: string | null
          service_id?: string | null
          status?: Database["public"]["Enums"]["service_status"]
        }
        Update: {
          created_at?: string
          health_score?: number | null
          id?: string
          last_updated?: string
          organization_id?: string | null
          service_id?: string | null
          status?: Database["public"]["Enums"]["service_status"]
        }
        Relationships: [
          {
            foreignKeyName: "organization_services_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          code: string
          created_at: string
          dark_risk360_enabled: boolean
          hicompliance_enabled: boolean
          id: string
          irp_extended: boolean
          name: string
          pentest_tools_auto_validation: boolean
          subdomain_dump_depth: number
          subdomain_dump_enabled: boolean
          surface_scan_extended: boolean
          surface_scan360_enabled: boolean
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          dark_risk360_enabled?: boolean
          hicompliance_enabled?: boolean
          id?: string
          irp_extended?: boolean
          name: string
          pentest_tools_auto_validation?: boolean
          subdomain_dump_depth?: number
          subdomain_dump_enabled?: boolean
          surface_scan_extended?: boolean
          surface_scan360_enabled?: boolean
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          dark_risk360_enabled?: boolean
          hicompliance_enabled?: boolean
          id?: string
          irp_extended?: boolean
          name?: string
          pentest_tools_auto_validation?: boolean
          subdomain_dump_depth?: number
          subdomain_dump_enabled?: boolean
          surface_scan_extended?: boolean
          surface_scan360_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      playbook_completions: {
        Row: {
          completed_at: string | null
          created_at: string
          data: Json
          id: string
          organization_id: string | null
          playbook_category: string
          playbook_id: string
          playbook_severity: string
          playbook_title: string
          progress_percentage: number
          started_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          data?: Json
          id?: string
          organization_id?: string | null
          playbook_category: string
          playbook_id: string
          playbook_severity: string
          playbook_title: string
          progress_percentage?: number
          started_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          data?: Json
          id?: string
          organization_id?: string | null
          playbook_category?: string
          playbook_id?: string
          playbook_severity?: string
          playbook_title?: string
          progress_percentage?: number
          started_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "playbook_completions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      remediation_tasks: {
        Row: {
          assignee: string | null
          budget: number | null
          category: string
          color: string
          created_at: string
          dependencies: string[] | null
          display_order: number | null
          end_date: string
          id: string
          is_deleted: boolean | null
          is_hidden: boolean | null
          organization_id: string | null
          priority: string
          progress: number
          source: string | null
          source_ref: string | null
          start_date: string
          task: string
          updated_at: string
        }
        Insert: {
          assignee?: string | null
          budget?: number | null
          category: string
          color?: string
          created_at?: string
          dependencies?: string[] | null
          display_order?: number | null
          end_date: string
          id?: string
          is_deleted?: boolean | null
          is_hidden?: boolean | null
          organization_id?: string | null
          priority?: string
          progress?: number
          source?: string | null
          source_ref?: string | null
          start_date: string
          task: string
          updated_at?: string
        }
        Update: {
          assignee?: string | null
          budget?: number | null
          category?: string
          color?: string
          created_at?: string
          dependencies?: string[] | null
          display_order?: number | null
          end_date?: string
          id?: string
          is_deleted?: boolean | null
          is_hidden?: boolean | null
          organization_id?: string | null
          priority?: string
          progress?: number
          source?: string | null
          source_ref?: string | null
          start_date?: string
          task?: string
          updated_at?: string
        }
        Relationships: []
      }
      remediation_templates: {
        Row: {
          category: string
          complexity: string
          created_at: string
          dependencies: string[] | null
          description: string | null
          estimated_days: number
          id: string
          priority: string
          task_name: string
          updated_at: string
        }
        Insert: {
          category: string
          complexity?: string
          created_at?: string
          dependencies?: string[] | null
          description?: string | null
          estimated_days?: number
          id?: string
          priority?: string
          task_name: string
          updated_at?: string
        }
        Update: {
          category?: string
          complexity?: string
          created_at?: string
          dependencies?: string[] | null
          description?: string | null
          estimated_days?: number
          id?: string
          priority?: string
          task_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      risk_analysis: {
        Row: {
          asset_name: string
          control_scores: Json
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          organization_id: string | null
          risk_score: number | null
          threat_source: string
          updated_at: string
        }
        Insert: {
          asset_name: string
          control_scores?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          organization_id?: string | null
          risk_score?: number | null
          threat_source: string
          updated_at?: string
        }
        Update: {
          asset_name?: string
          control_scores?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          organization_id?: string | null
          risk_score?: number | null
          threat_source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "risk_analysis_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      role_module_permissions: {
        Row: {
          created_at: string
          id: string
          is_enabled: boolean
          module_name: string
          module_path: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          module_name: string
          module_path: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          module_name?: string
          module_path?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: []
      }
      services: {
        Row: {
          code: string
          created_at: string
          description: string | null
          icon: string | null
          id: string
          name: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          name: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      shodan_enrichments: {
        Row: {
          confidence: string
          cpes: string[] | null
          created_at: string
          found: boolean
          hostnames: string[] | null
          id: string
          ip: unknown
          organization_id: string
          ports: number[] | null
          raw_response: Json | null
          scan_job_id: string
          source: string
          target: string
          vulns: Json | null
        }
        Insert: {
          confidence?: string
          cpes?: string[] | null
          created_at?: string
          found?: boolean
          hostnames?: string[] | null
          id?: string
          ip?: unknown
          organization_id: string
          ports?: number[] | null
          raw_response?: Json | null
          scan_job_id: string
          source?: string
          target: string
          vulns?: Json | null
        }
        Update: {
          confidence?: string
          cpes?: string[] | null
          created_at?: string
          found?: boolean
          hostnames?: string[] | null
          id?: string
          ip?: unknown
          organization_id?: string
          ports?: number[] | null
          raw_response?: Json | null
          scan_job_id?: string
          source?: string
          target?: string
          vulns?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "shodan_enrichments_scan_job_id_fkey"
            columns: ["scan_job_id"]
            isOneToOne: false
            referencedRelation: "external_scan_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      subdomain_dumps: {
        Row: {
          created_at: string
          created_by: string | null
          depth_limit: number
          id: string
          organization_id: string
          results: Json
          root_domain: string
          sources: Json
          total_discovered: number
          total_returned: number
          triggered_by: string
          truncated: boolean
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          depth_limit?: number
          id?: string
          organization_id: string
          results?: Json
          root_domain: string
          sources?: Json
          total_discovered?: number
          total_returned?: number
          triggered_by?: string
          truncated?: boolean
        }
        Update: {
          created_at?: string
          created_by?: string | null
          depth_limit?: number
          id?: string
          organization_id?: string
          results?: Json
          root_domain?: string
          sources?: Json
          total_discovered?: number
          total_returned?: number
          triggered_by?: string
          truncated?: boolean
        }
        Relationships: []
      }
      supplier_directory: {
        Row: {
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          linked_asset_id: string | null
          notes: string | null
          organization_id: string
          phone: string | null
          service_type: string | null
          supplier_name: string
          updated_at: string
        }
        Insert: {
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          linked_asset_id?: string | null
          notes?: string | null
          organization_id: string
          phone?: string | null
          service_type?: string | null
          supplier_name: string
          updated_at?: string
        }
        Update: {
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          linked_asset_id?: string | null
          notes?: string | null
          organization_id?: string
          phone?: string | null
          service_type?: string | null
          supplier_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_directory_linked_asset_id_fkey"
            columns: ["linked_asset_id"]
            isOneToOne: false
            referencedRelation: "critical_infrastructure"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_directory_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      surface_assets: {
        Row: {
          asset_type: string
          asset_value: string
          confidence: string
          first_seen: string
          hostname: string | null
          id: string
          ip: unknown
          last_seen: string
          organization_id: string
          raw: Json | null
          root_domain: string | null
          scan_job_id: string
          source: string
        }
        Insert: {
          asset_type: string
          asset_value: string
          confidence?: string
          first_seen?: string
          hostname?: string | null
          id?: string
          ip?: unknown
          last_seen?: string
          organization_id: string
          raw?: Json | null
          root_domain?: string | null
          scan_job_id: string
          source: string
        }
        Update: {
          asset_type?: string
          asset_value?: string
          confidence?: string
          first_seen?: string
          hostname?: string | null
          id?: string
          ip?: unknown
          last_seen?: string
          organization_id?: string
          raw?: Json | null
          root_domain?: string | null
          scan_job_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "surface_assets_scan_job_id_fkey"
            columns: ["scan_job_id"]
            isOneToOne: false
            referencedRelation: "surface_scan_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      surface_external_intel: {
        Row: {
          confidence: string
          created_at: string
          found: boolean
          id: string
          organization_id: string
          provider: string
          raw_response: Json | null
          scan_job_id: string
          summary: Json | null
          target: string
        }
        Insert: {
          confidence?: string
          created_at?: string
          found?: boolean
          id?: string
          organization_id: string
          provider: string
          raw_response?: Json | null
          scan_job_id: string
          summary?: Json | null
          target: string
        }
        Update: {
          confidence?: string
          created_at?: string
          found?: boolean
          id?: string
          organization_id?: string
          provider?: string
          raw_response?: Json | null
          scan_job_id?: string
          summary?: Json | null
          target?: string
        }
        Relationships: [
          {
            foreignKeyName: "surface_external_intel_scan_job_id_fkey"
            columns: ["scan_job_id"]
            isOneToOne: false
            referencedRelation: "surface_scan_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      surface_findings: {
        Row: {
          affected_asset: string | null
          affected_url: string | null
          attribution_confidence: string
          cisa_kev: boolean
          created_at: string
          cve: string[]
          cvss: number | null
          cwe: string[]
          description: string | null
          epss: number | null
          evidence: Json | null
          finding_type: string
          id: string
          ip: unknown
          module: string | null
          organization_id: string
          port: number | null
          protocol: string | null
          provider: string | null
          remediation: string | null
          scan_job_id: string
          severity: string
          status: string
          title: string
        }
        Insert: {
          affected_asset?: string | null
          affected_url?: string | null
          attribution_confidence?: string
          cisa_kev?: boolean
          created_at?: string
          cve?: string[]
          cvss?: number | null
          cwe?: string[]
          description?: string | null
          epss?: number | null
          evidence?: Json | null
          finding_type: string
          id?: string
          ip?: unknown
          module?: string | null
          organization_id: string
          port?: number | null
          protocol?: string | null
          provider?: string | null
          remediation?: string | null
          scan_job_id: string
          severity?: string
          status?: string
          title: string
        }
        Update: {
          affected_asset?: string | null
          affected_url?: string | null
          attribution_confidence?: string
          cisa_kev?: boolean
          created_at?: string
          cve?: string[]
          cvss?: number | null
          cwe?: string[]
          description?: string | null
          epss?: number | null
          evidence?: Json | null
          finding_type?: string
          id?: string
          ip?: unknown
          module?: string | null
          organization_id?: string
          port?: number | null
          protocol?: string | null
          provider?: string | null
          remediation?: string | null
          scan_job_id?: string
          severity?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "surface_findings_scan_job_id_fkey"
            columns: ["scan_job_id"]
            isOneToOne: false
            referencedRelation: "surface_scan_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      surface_observations: {
        Row: {
          asset_id: string | null
          confidence: string
          created_at: string
          id: string
          module: string
          observation_type: string
          organization_id: string
          scan_job_id: string
          severity: string
          title: string | null
          value: Json
        }
        Insert: {
          asset_id?: string | null
          confidence?: string
          created_at?: string
          id?: string
          module: string
          observation_type: string
          organization_id: string
          scan_job_id: string
          severity?: string
          title?: string | null
          value: Json
        }
        Update: {
          asset_id?: string | null
          confidence?: string
          created_at?: string
          id?: string
          module?: string
          observation_type?: string
          organization_id?: string
          scan_job_id?: string
          severity?: string
          title?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "surface_observations_scan_job_id_fkey"
            columns: ["scan_job_id"]
            isOneToOne: false
            referencedRelation: "surface_scan_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      surface_scan_ai_reports: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          organization_id: string
          payload: Json
          scan_job_id: string | null
          title: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id: string
          payload: Json
          scan_job_id?: string | null
          title?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id?: string
          payload?: Json
          scan_job_id?: string | null
          title?: string | null
        }
        Relationships: []
      }
      surface_scan_alerts: {
        Row: {
          alert_email: string
          alert_types: Json
          created_at: string
          id: string
          is_active: boolean
          organization_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          alert_email: string
          alert_types?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          organization_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          alert_email?: string
          alert_types?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          organization_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "surface_scan_alerts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      surface_scan_audit_log: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          organization_id: string | null
          scan_job_id: string | null
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          organization_id?: string | null
          scan_job_id?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          organization_id?: string | null
          scan_job_id?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      surface_scan_history: {
        Row: {
          assets_snapshot: Json
          avg_score: number
          created_at: string
          critical_count: number
          high_cves: number
          id: string
          low_cves: number
          medium_cves: number
          organization_id: string
          safe_count: number
          scanned_at: string
          total_assets: number
          triggered_by: string
          truncated_rules: Json
          warning_count: number
        }
        Insert: {
          assets_snapshot?: Json
          avg_score?: number
          created_at?: string
          critical_count?: number
          high_cves?: number
          id?: string
          low_cves?: number
          medium_cves?: number
          organization_id: string
          safe_count?: number
          scanned_at?: string
          total_assets?: number
          triggered_by?: string
          truncated_rules?: Json
          warning_count?: number
        }
        Update: {
          assets_snapshot?: Json
          avg_score?: number
          created_at?: string
          critical_count?: number
          high_cves?: number
          id?: string
          low_cves?: number
          medium_cves?: number
          organization_id?: string
          safe_count?: number
          scanned_at?: string
          total_assets?: number
          triggered_by?: string
          truncated_rules?: Json
          warning_count?: number
        }
        Relationships: []
      }
      surface_scan_jobs: {
        Row: {
          authorization_confirmed: boolean
          completed_at: string | null
          created_at: string
          error_message: string | null
          hosting_context: string
          hostname: string | null
          id: string
          normalized_target: string
          organization_id: string
          port: number | null
          protocol: string | null
          raw_target: string
          requested_by: string | null
          resolved_ips: string[]
          root_domain: string | null
          scan_profile: string
          shodan_status: string
          started_at: string | null
          status: string
          target_type: string
        }
        Insert: {
          authorization_confirmed?: boolean
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          hosting_context?: string
          hostname?: string | null
          id?: string
          normalized_target: string
          organization_id: string
          port?: number | null
          protocol?: string | null
          raw_target: string
          requested_by?: string | null
          resolved_ips?: string[]
          root_domain?: string | null
          scan_profile?: string
          shodan_status?: string
          started_at?: string | null
          status?: string
          target_type: string
        }
        Update: {
          authorization_confirmed?: boolean
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          hosting_context?: string
          hostname?: string | null
          id?: string
          normalized_target?: string
          organization_id?: string
          port?: number | null
          protocol?: string | null
          raw_target?: string
          requested_by?: string | null
          resolved_ips?: string[]
          root_domain?: string | null
          scan_profile?: string
          shodan_status?: string
          started_at?: string | null
          status?: string
          target_type?: string
        }
        Relationships: []
      }
      surface_scan_monitored_ips: {
        Row: {
          created_at: string
          created_by: string | null
          discovered_from: string | null
          discovered_via: string
          entry_type: string
          id: string
          input_value: string
          ip_end: string
          ip_start: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          discovered_from?: string | null
          discovered_via?: string
          entry_type: string
          id?: string
          input_value: string
          ip_end?: string
          ip_start?: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          discovered_from?: string | null
          discovered_via?: string
          entry_type?: string
          id?: string
          input_value?: string
          ip_end?: string
          ip_start?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          created_at: string
          id: string
          organization_id: string | null
          preference_key: string
          preference_value: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id?: string | null
          preference_key: string
          preference_value?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string | null
          preference_key?: string
          preference_value?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_preferences_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          auth_user_id: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          organization_id: string | null
          updated_at: string
          user_type: Database["public"]["Enums"]["user_type"]
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string
          email: string
          full_name: string
          id?: string
          organization_id?: string | null
          updated_at?: string
          user_type?: Database["public"]["Enums"]["user_type"]
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          organization_id?: string | null
          updated_at?: string
          user_type?: Database["public"]["Enums"]["user_type"]
        }
        Relationships: [
          {
            foreignKeyName: "users_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calc_risk_intrinseco: {
        Args: { criticita: number; esposizione: number; superficie: number }
        Returns: number
      }
      can_manage_all_organizations: {
        Args: { _user_id: string }
        Returns: boolean
      }
      enqueue_cve_enrichment: {
        Args: { _cves: string[]; _org_id: string; _source: string }
        Returns: undefined
      }
      get_current_user_type: { Args: never; Returns: string }
      get_my_module_permissions: { Args: never; Returns: Json }
      get_user_roles: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"][]
      }
      has_module_permission: {
        Args: {
          _action: string
          _module: string
          _subsection: string
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "super_admin" | "sales" | "client"
      assessment_status:
        | "not_applicable"
        | "planned_in_progress"
        | "completed"
        | "not_started"
      document_category:
        | "Piano Generale"
        | "Checklist / OPL / SOP"
        | "Template"
        | "Processo"
        | "Legal"
        | "Audit"
        | "Tecnico"
        | "Varie"
        | "NIS2"
        | "ISO & Audit"
      nis2_classification: "essential" | "important" | "none"
      service_status: "active" | "inactive" | "maintenance" | "alert"
      user_type: "admin" | "client"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["super_admin", "sales", "client"],
      assessment_status: [
        "not_applicable",
        "planned_in_progress",
        "completed",
        "not_started",
      ],
      document_category: [
        "Piano Generale",
        "Checklist / OPL / SOP",
        "Template",
        "Processo",
        "Legal",
        "Audit",
        "Tecnico",
        "Varie",
        "NIS2",
        "ISO & Audit",
      ],
      nis2_classification: ["essential", "important", "none"],
      service_status: ["active", "inactive", "maintenance", "alert"],
      user_type: ["admin", "client"],
    },
  },
} as const
