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
            foreignKeyName: "assessment_responses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_sales_remediation_dashboard"
            referencedColumns: ["organization_id"]
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
          {
            foreignKeyName: "assessment_snapshots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_sales_remediation_dashboard"
            referencedColumns: ["organization_id"]
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
          {
            foreignKeyName: "asset_inventory_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_sales_remediation_dashboard"
            referencedColumns: ["organization_id"]
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
          {
            foreignKeyName: "asset_irp_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_sales_remediation_dashboard"
            referencedColumns: ["organization_id"]
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
      connectsecure_config: {
        Row: {
          client_auth_token: string
          company_id: number
          created_at: string
          enabled: boolean
          id: string
          organization_id: string
          pod_host: string
          updated_at: string
        }
        Insert: {
          client_auth_token: string
          company_id: number
          created_at?: string
          enabled?: boolean
          id?: string
          organization_id: string
          pod_host?: string
          updated_at?: string
        }
        Update: {
          client_auth_token?: string
          company_id?: number
          created_at?: string
          enabled?: boolean
          id?: string
          organization_id?: string
          pod_host?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "connectsecure_config_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connectsecure_config_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "v_sales_remediation_dashboard"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      connectsecure_domain_registry: {
        Row: {
          created_at: string
          cs_domain_id: number
          depth: number
          domain: string
          id: string
          last_scanned_at: string | null
          organization_id: string
          parent_domain: string | null
        }
        Insert: {
          created_at?: string
          cs_domain_id: number
          depth?: number
          domain: string
          id?: string
          last_scanned_at?: string | null
          organization_id: string
          parent_domain?: string | null
        }
        Update: {
          created_at?: string
          cs_domain_id?: number
          depth?: number
          domain?: string
          id?: string
          last_scanned_at?: string | null
          organization_id?: string
          parent_domain?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "connectsecure_domain_registry_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connectsecure_domain_registry_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_sales_remediation_dashboard"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      connectsecure_sensitive_data: {
        Row: {
          created_at: string
          creds: Json | null
          creds_count: number
          domain: string
          hashes: Json | null
          hashes_count: number
          id: string
          organization_id: string
          scan_job_id: string | null
        }
        Insert: {
          created_at?: string
          creds?: Json | null
          creds_count?: number
          domain: string
          hashes?: Json | null
          hashes_count?: number
          id?: string
          organization_id: string
          scan_job_id?: string | null
        }
        Update: {
          created_at?: string
          creds?: Json | null
          creds_count?: number
          domain?: string
          hashes?: Json | null
          hashes_count?: number
          id?: string
          organization_id?: string
          scan_job_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "connectsecure_sensitive_data_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connectsecure_sensitive_data_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_sales_remediation_dashboard"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "connectsecure_sensitive_data_scan_job_id_fkey"
            columns: ["scan_job_id"]
            isOneToOne: false
            referencedRelation: "surface_scan_jobs"
            referencedColumns: ["id"]
          },
        ]
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
          {
            foreignKeyName: "consistenze_clienti_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "v_sales_remediation_dashboard"
            referencedColumns: ["organization_id"]
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
          {
            foreignKeyName: "consistenze_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_sales_remediation_dashboard"
            referencedColumns: ["organization_id"]
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
          {
            foreignKeyName: "contact_directory_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_sales_remediation_dashboard"
            referencedColumns: ["organization_id"]
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
          {
            foreignKeyName: "critical_infrastructure_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_sales_remediation_dashboard"
            referencedColumns: ["organization_id"]
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
          {
            foreignKeyName: "dark_risk_alerts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_sales_remediation_dashboard"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      darkrisk_alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          alert_type: string
          created_at: string
          finding_id: string | null
          id: string
          message: string | null
          metadata: Json
          occurred_at: string
          organization_id: string
          severity: Database["public"]["Enums"]["darkrisk_severity"]
          status: string
          tenant_id: string | null
          title: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type: string
          created_at?: string
          finding_id?: string | null
          id?: string
          message?: string | null
          metadata?: Json
          occurred_at?: string
          organization_id: string
          severity: Database["public"]["Enums"]["darkrisk_severity"]
          status?: string
          tenant_id?: string | null
          title: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type?: string
          created_at?: string
          finding_id?: string | null
          id?: string
          message?: string | null
          metadata?: Json
          occurred_at?: string
          organization_id?: string
          severity?: Database["public"]["Enums"]["darkrisk_severity"]
          status?: string
          tenant_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "darkrisk_alerts_finding_id_fkey"
            columns: ["finding_id"]
            isOneToOne: false
            referencedRelation: "darkrisk_findings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "darkrisk_alerts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "darkrisk_alerts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_sales_remediation_dashboard"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      darkrisk_assets: {
        Row: {
          asset_type: Database["public"]["Enums"]["darkrisk_asset_type"]
          created_at: string
          first_seen_at: string
          id: string
          last_seen_at: string | null
          metadata: Json
          normalized_value: string
          organization_id: string
          scope_status: string
          source: Database["public"]["Enums"]["darkrisk_source"]
          tenant_id: string | null
          updated_at: string
          value: string
        }
        Insert: {
          asset_type: Database["public"]["Enums"]["darkrisk_asset_type"]
          created_at?: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string | null
          metadata?: Json
          normalized_value: string
          organization_id: string
          scope_status?: string
          source?: Database["public"]["Enums"]["darkrisk_source"]
          tenant_id?: string | null
          updated_at?: string
          value: string
        }
        Update: {
          asset_type?: Database["public"]["Enums"]["darkrisk_asset_type"]
          created_at?: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string | null
          metadata?: Json
          normalized_value?: string
          organization_id?: string
          scope_status?: string
          source?: Database["public"]["Enums"]["darkrisk_source"]
          tenant_id?: string | null
          updated_at?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "darkrisk_assets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "darkrisk_assets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_sales_remediation_dashboard"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      darkrisk_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: unknown
          metadata: Json
          organization_id: string | null
          reason: string | null
          tenant_id: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: unknown
          metadata?: Json
          organization_id?: string | null
          reason?: string | null
          tenant_id?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: unknown
          metadata?: Json
          organization_id?: string | null
          reason?: string | null
          tenant_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "darkrisk_audit_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "darkrisk_audit_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_sales_remediation_dashboard"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      darkrisk_dti_sensitive_hits: {
        Row: {
          asset_scope: string | null
          clear_value: string | null
          confidence: Database["public"]["Enums"]["darkrisk_confidence"]
          context_excerpt: string | null
          created_at: string
          evidence_id: string | null
          evidence_scope: string | null
          extraction_confidence: string | null
          extraction_source: string | null
          finding_id: string | null
          id: string
          masked_value: string
          match_policy: string | null
          match_type: string | null
          metadata: Json
          organization_id: string
          query_kind: string | null
          query_term: string | null
          scan_run_id: string
          selector_value: string | null
          source: Database["public"]["Enums"]["darkrisk_source"]
          source_label: string | null
          source_record_id: string | null
          source_run_id: string | null
          tag: string
          tenant_id: string | null
        }
        Insert: {
          asset_scope?: string | null
          clear_value?: string | null
          confidence?: Database["public"]["Enums"]["darkrisk_confidence"]
          context_excerpt?: string | null
          created_at?: string
          evidence_id?: string | null
          evidence_scope?: string | null
          extraction_confidence?: string | null
          extraction_source?: string | null
          finding_id?: string | null
          id?: string
          masked_value: string
          match_policy?: string | null
          match_type?: string | null
          metadata?: Json
          organization_id: string
          query_kind?: string | null
          query_term?: string | null
          scan_run_id: string
          selector_value?: string | null
          source: Database["public"]["Enums"]["darkrisk_source"]
          source_label?: string | null
          source_record_id?: string | null
          source_run_id?: string | null
          tag: string
          tenant_id?: string | null
        }
        Update: {
          asset_scope?: string | null
          clear_value?: string | null
          confidence?: Database["public"]["Enums"]["darkrisk_confidence"]
          context_excerpt?: string | null
          created_at?: string
          evidence_id?: string | null
          evidence_scope?: string | null
          extraction_confidence?: string | null
          extraction_source?: string | null
          finding_id?: string | null
          id?: string
          masked_value?: string
          match_policy?: string | null
          match_type?: string | null
          metadata?: Json
          organization_id?: string
          query_kind?: string | null
          query_term?: string | null
          scan_run_id?: string
          selector_value?: string | null
          source?: Database["public"]["Enums"]["darkrisk_source"]
          source_label?: string | null
          source_record_id?: string | null
          source_run_id?: string | null
          tag?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "darkrisk_dti_sensitive_hits_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "darkrisk_evidence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "darkrisk_dti_sensitive_hits_finding_id_fkey"
            columns: ["finding_id"]
            isOneToOne: false
            referencedRelation: "darkrisk_findings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "darkrisk_dti_sensitive_hits_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "darkrisk_dti_sensitive_hits_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_sales_remediation_dashboard"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "darkrisk_dti_sensitive_hits_scan_run_id_fkey"
            columns: ["scan_run_id"]
            isOneToOne: false
            referencedRelation: "darkrisk_scan_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "darkrisk_dti_sensitive_hits_source_record_id_fkey"
            columns: ["source_record_id"]
            isOneToOne: false
            referencedRelation: "darkrisk_source_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "darkrisk_dti_sensitive_hits_source_run_id_fkey"
            columns: ["source_run_id"]
            isOneToOne: false
            referencedRelation: "darkrisk_dti_source_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      darkrisk_dti_source_runs: {
        Row: {
          asset_scope: string | null
          completed_at: string | null
          created_at: string
          duration_ms: number | null
          error_message: string | null
          id: string
          metadata: Json
          organization_id: string
          query_kind: string | null
          query_term: string | null
          result_count: number
          scan_run_id: string
          selector_value: string | null
          source: Database["public"]["Enums"]["darkrisk_source"]
          source_key: string
          source_kind: string
          source_label: string | null
          started_at: string
          status: string
          target_url: string | null
          tenant_id: string | null
          updated_at: string
          warning: string | null
        }
        Insert: {
          asset_scope?: string | null
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          metadata?: Json
          organization_id: string
          query_kind?: string | null
          query_term?: string | null
          result_count?: number
          scan_run_id: string
          selector_value?: string | null
          source: Database["public"]["Enums"]["darkrisk_source"]
          source_key: string
          source_kind?: string
          source_label?: string | null
          started_at?: string
          status?: string
          target_url?: string | null
          tenant_id?: string | null
          updated_at?: string
          warning?: string | null
        }
        Update: {
          asset_scope?: string | null
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          metadata?: Json
          organization_id?: string
          query_kind?: string | null
          query_term?: string | null
          result_count?: number
          scan_run_id?: string
          selector_value?: string | null
          source?: Database["public"]["Enums"]["darkrisk_source"]
          source_key?: string
          source_kind?: string
          source_label?: string | null
          started_at?: string
          status?: string
          target_url?: string | null
          tenant_id?: string | null
          updated_at?: string
          warning?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "darkrisk_dti_source_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "darkrisk_dti_source_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_sales_remediation_dashboard"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "darkrisk_dti_source_runs_scan_run_id_fkey"
            columns: ["scan_run_id"]
            isOneToOne: false
            referencedRelation: "darkrisk_scan_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      darkrisk_entitlements: {
        Row: {
          created_at: string
          enable_ai_recommendations: boolean
          enable_phonebook: boolean
          enable_raw_evidence: boolean
          enabled: boolean
          id: string
          max_intelx_results_per_selector: number
          organization_id: string
          raw_evidence_retention_days: number
          retention_days: number
          scan_frequency: string
          tier: Database["public"]["Enums"]["darkrisk_tier"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          enable_ai_recommendations?: boolean
          enable_phonebook?: boolean
          enable_raw_evidence?: boolean
          enabled?: boolean
          id?: string
          max_intelx_results_per_selector?: number
          organization_id: string
          raw_evidence_retention_days?: number
          retention_days?: number
          scan_frequency?: string
          tier?: Database["public"]["Enums"]["darkrisk_tier"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          enable_ai_recommendations?: boolean
          enable_phonebook?: boolean
          enable_raw_evidence?: boolean
          enabled?: boolean
          id?: string
          max_intelx_results_per_selector?: number
          organization_id?: string
          raw_evidence_retention_days?: number
          retention_days?: number
          scan_frequency?: string
          tier?: Database["public"]["Enums"]["darkrisk_tier"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "darkrisk_entitlements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "darkrisk_entitlements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "v_sales_remediation_dashboard"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      darkrisk_esteso_profiles: {
        Row: {
          created_at: string
          created_by: string | null
          cron_enabled: boolean
          enabled: boolean
          identity_model_valid_until: string
          last_cron_run_at: string | null
          manual_only: boolean
          next_cron_run_at: string | null
          notes: string | null
          organization_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          cron_enabled?: boolean
          enabled?: boolean
          identity_model_valid_until?: string
          last_cron_run_at?: string | null
          manual_only?: boolean
          next_cron_run_at?: string | null
          notes?: string | null
          organization_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          cron_enabled?: boolean
          enabled?: boolean
          identity_model_valid_until?: string
          last_cron_run_at?: string | null
          manual_only?: boolean
          next_cron_run_at?: string | null
          notes?: string | null
          organization_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "darkrisk_esteso_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "darkrisk_esteso_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "v_sales_remediation_dashboard"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      darkrisk_evidence: {
        Row: {
          asset_id: string | null
          confidence: Database["public"]["Enums"]["darkrisk_confidence"]
          contains_sensitive_data: boolean
          created_at: string
          evidence_class: string
          first_seen_at: string
          id: string
          last_seen_at: string
          masked_value: string | null
          metadata: Json
          observed_at: string
          organization_id: string
          raw_evidence_ref: string | null
          scan_run_id: string
          selector_id: string | null
          severity_hint: Database["public"]["Enums"]["darkrisk_severity"]
          source: Database["public"]["Enums"]["darkrisk_source"]
          source_record_id: string | null
          summary: string | null
          tenant_id: string | null
          title: string
          visibility: Database["public"]["Enums"]["darkrisk_visibility"]
        }
        Insert: {
          asset_id?: string | null
          confidence?: Database["public"]["Enums"]["darkrisk_confidence"]
          contains_sensitive_data?: boolean
          created_at?: string
          evidence_class: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          masked_value?: string | null
          metadata?: Json
          observed_at?: string
          organization_id: string
          raw_evidence_ref?: string | null
          scan_run_id: string
          selector_id?: string | null
          severity_hint?: Database["public"]["Enums"]["darkrisk_severity"]
          source: Database["public"]["Enums"]["darkrisk_source"]
          source_record_id?: string | null
          summary?: string | null
          tenant_id?: string | null
          title: string
          visibility?: Database["public"]["Enums"]["darkrisk_visibility"]
        }
        Update: {
          asset_id?: string | null
          confidence?: Database["public"]["Enums"]["darkrisk_confidence"]
          contains_sensitive_data?: boolean
          created_at?: string
          evidence_class?: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          masked_value?: string | null
          metadata?: Json
          observed_at?: string
          organization_id?: string
          raw_evidence_ref?: string | null
          scan_run_id?: string
          selector_id?: string | null
          severity_hint?: Database["public"]["Enums"]["darkrisk_severity"]
          source?: Database["public"]["Enums"]["darkrisk_source"]
          source_record_id?: string | null
          summary?: string | null
          tenant_id?: string | null
          title?: string
          visibility?: Database["public"]["Enums"]["darkrisk_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "darkrisk_evidence_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "darkrisk_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "darkrisk_evidence_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "darkrisk_evidence_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_sales_remediation_dashboard"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "darkrisk_evidence_scan_run_id_fkey"
            columns: ["scan_run_id"]
            isOneToOne: false
            referencedRelation: "darkrisk_scan_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "darkrisk_evidence_selector_id_fkey"
            columns: ["selector_id"]
            isOneToOne: false
            referencedRelation: "darkrisk_selectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "darkrisk_evidence_source_record_id_fkey"
            columns: ["source_record_id"]
            isOneToOne: false
            referencedRelation: "darkrisk_source_records"
            referencedColumns: ["id"]
          },
        ]
      }
      darkrisk_findings: {
        Row: {
          affected_asset_id: string | null
          affected_selector_id: string | null
          confidence: Database["public"]["Enums"]["darkrisk_confidence"]
          created_at: string
          description: string | null
          evidence_ids: string[]
          finding_type: string
          first_seen_at: string
          id: string
          last_seen_at: string
          metadata: Json
          organization_id: string
          resolved_at: string | null
          risk_dimensions: Json
          risk_score: number
          scan_run_id: string | null
          severity: Database["public"]["Enums"]["darkrisk_severity"]
          source_record_key: string | null
          status: Database["public"]["Enums"]["darkrisk_finding_status"]
          tenant_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          affected_asset_id?: string | null
          affected_selector_id?: string | null
          confidence?: Database["public"]["Enums"]["darkrisk_confidence"]
          created_at?: string
          description?: string | null
          evidence_ids?: string[]
          finding_type: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          metadata?: Json
          organization_id: string
          resolved_at?: string | null
          risk_dimensions?: Json
          risk_score?: number
          scan_run_id?: string | null
          severity: Database["public"]["Enums"]["darkrisk_severity"]
          source_record_key?: string | null
          status?: Database["public"]["Enums"]["darkrisk_finding_status"]
          tenant_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          affected_asset_id?: string | null
          affected_selector_id?: string | null
          confidence?: Database["public"]["Enums"]["darkrisk_confidence"]
          created_at?: string
          description?: string | null
          evidence_ids?: string[]
          finding_type?: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          metadata?: Json
          organization_id?: string
          resolved_at?: string | null
          risk_dimensions?: Json
          risk_score?: number
          scan_run_id?: string | null
          severity?: Database["public"]["Enums"]["darkrisk_severity"]
          source_record_key?: string | null
          status?: Database["public"]["Enums"]["darkrisk_finding_status"]
          tenant_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "darkrisk_findings_affected_asset_id_fkey"
            columns: ["affected_asset_id"]
            isOneToOne: false
            referencedRelation: "darkrisk_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "darkrisk_findings_affected_selector_id_fkey"
            columns: ["affected_selector_id"]
            isOneToOne: false
            referencedRelation: "darkrisk_selectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "darkrisk_findings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "darkrisk_findings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_sales_remediation_dashboard"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "darkrisk_findings_scan_run_id_fkey"
            columns: ["scan_run_id"]
            isOneToOne: false
            referencedRelation: "darkrisk_scan_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      darkrisk_raw_evidence_refs: {
        Row: {
          created_at: string
          created_by: string | null
          encryption_context: Json
          evidence_id: string
          id: string
          last_reveal_reason: string | null
          last_revealed_at: string | null
          last_revealed_by: string | null
          organization_id: string
          retention_until: string | null
          reveal_count: number
          sha256: string | null
          size_bytes: number | null
          storage_path: string
          storage_provider: string
          tenant_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          encryption_context?: Json
          evidence_id: string
          id?: string
          last_reveal_reason?: string | null
          last_revealed_at?: string | null
          last_revealed_by?: string | null
          organization_id: string
          retention_until?: string | null
          reveal_count?: number
          sha256?: string | null
          size_bytes?: number | null
          storage_path: string
          storage_provider?: string
          tenant_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          encryption_context?: Json
          evidence_id?: string
          id?: string
          last_reveal_reason?: string | null
          last_revealed_at?: string | null
          last_revealed_by?: string | null
          organization_id?: string
          retention_until?: string | null
          reveal_count?: number
          sha256?: string | null
          size_bytes?: number | null
          storage_path?: string
          storage_provider?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "darkrisk_raw_evidence_refs_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: true
            referencedRelation: "darkrisk_evidence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "darkrisk_raw_evidence_refs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "darkrisk_raw_evidence_refs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_sales_remediation_dashboard"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      darkrisk_recommendations: {
        Row: {
          actions: Json
          confidence: Database["public"]["Enums"]["darkrisk_confidence"]
          created_at: string
          expected_outcome: string | null
          finding_id: string | null
          grounded_on_evidence_ids: string[]
          id: string
          metadata: Json
          model: string | null
          organization_id: string
          output_schema_version: string | null
          priority: string
          prompt_version: string | null
          source: Database["public"]["Enums"]["darkrisk_source"]
          tenant_id: string | null
          title: string
          why_it_matters: string | null
        }
        Insert: {
          actions?: Json
          confidence?: Database["public"]["Enums"]["darkrisk_confidence"]
          created_at?: string
          expected_outcome?: string | null
          finding_id?: string | null
          grounded_on_evidence_ids?: string[]
          id?: string
          metadata?: Json
          model?: string | null
          organization_id: string
          output_schema_version?: string | null
          priority: string
          prompt_version?: string | null
          source?: Database["public"]["Enums"]["darkrisk_source"]
          tenant_id?: string | null
          title: string
          why_it_matters?: string | null
        }
        Update: {
          actions?: Json
          confidence?: Database["public"]["Enums"]["darkrisk_confidence"]
          created_at?: string
          expected_outcome?: string | null
          finding_id?: string | null
          grounded_on_evidence_ids?: string[]
          id?: string
          metadata?: Json
          model?: string | null
          organization_id?: string
          output_schema_version?: string | null
          priority?: string
          prompt_version?: string | null
          source?: Database["public"]["Enums"]["darkrisk_source"]
          tenant_id?: string | null
          title?: string
          why_it_matters?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "darkrisk_recommendations_finding_id_fkey"
            columns: ["finding_id"]
            isOneToOne: false
            referencedRelation: "darkrisk_findings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "darkrisk_recommendations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "darkrisk_recommendations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_sales_remediation_dashboard"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      darkrisk_report_snapshots: {
        Row: {
          classification: string
          created_at: string
          generated_at: string
          generated_by: string | null
          html_storage_path: string | null
          id: string
          json_storage_path: string | null
          model_metadata: Json
          organization_id: string
          pdf_storage_path: string | null
          report_json: Json
          scan_run_id: string | null
          status: string
          tenant_id: string | null
          tier: Database["public"]["Enums"]["darkrisk_tier"]
          title: string
        }
        Insert: {
          classification?: string
          created_at?: string
          generated_at?: string
          generated_by?: string | null
          html_storage_path?: string | null
          id?: string
          json_storage_path?: string | null
          model_metadata?: Json
          organization_id: string
          pdf_storage_path?: string | null
          report_json: Json
          scan_run_id?: string | null
          status?: string
          tenant_id?: string | null
          tier?: Database["public"]["Enums"]["darkrisk_tier"]
          title: string
        }
        Update: {
          classification?: string
          created_at?: string
          generated_at?: string
          generated_by?: string | null
          html_storage_path?: string | null
          id?: string
          json_storage_path?: string | null
          model_metadata?: Json
          organization_id?: string
          pdf_storage_path?: string | null
          report_json?: Json
          scan_run_id?: string | null
          status?: string
          tenant_id?: string | null
          tier?: Database["public"]["Enums"]["darkrisk_tier"]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "darkrisk_report_snapshots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "darkrisk_report_snapshots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_sales_remediation_dashboard"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "darkrisk_report_snapshots_scan_run_id_fkey"
            columns: ["scan_run_id"]
            isOneToOne: false
            referencedRelation: "darkrisk_scan_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      darkrisk_scan_locks: {
        Row: {
          locked_at: string
          organization_id: string
        }
        Insert: {
          locked_at?: string
          organization_id: string
        }
        Update: {
          locked_at?: string
          organization_id?: string
        }
        Relationships: []
      }
      darkrisk_scan_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          organization_id: string
          requested_by: string | null
          sources: Json
          started_at: string | null
          stats: Json
          status: Database["public"]["Enums"]["darkrisk_scan_status"]
          surface_scan_job_id: string | null
          tenant_id: string | null
          tier: Database["public"]["Enums"]["darkrisk_tier"]
          trigger_type: string
          updated_at: string
          warnings: Json
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          organization_id: string
          requested_by?: string | null
          sources?: Json
          started_at?: string | null
          stats?: Json
          status?: Database["public"]["Enums"]["darkrisk_scan_status"]
          surface_scan_job_id?: string | null
          tenant_id?: string | null
          tier?: Database["public"]["Enums"]["darkrisk_tier"]
          trigger_type?: string
          updated_at?: string
          warnings?: Json
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          organization_id?: string
          requested_by?: string | null
          sources?: Json
          started_at?: string | null
          stats?: Json
          status?: Database["public"]["Enums"]["darkrisk_scan_status"]
          surface_scan_job_id?: string | null
          tenant_id?: string | null
          tier?: Database["public"]["Enums"]["darkrisk_tier"]
          trigger_type?: string
          updated_at?: string
          warnings?: Json
        }
        Relationships: [
          {
            foreignKeyName: "darkrisk_scan_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "darkrisk_scan_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_sales_remediation_dashboard"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      darkrisk_selectors: {
        Row: {
          asset_id: string | null
          created_at: string
          discovered_from: string | null
          id: string
          metadata: Json
          normalized_value: string
          organization_id: string
          selector_type: Database["public"]["Enums"]["darkrisk_selector_type"]
          sensitivity: string
          source: Database["public"]["Enums"]["darkrisk_source"]
          status: string
          tenant_id: string | null
          updated_at: string
          value: string
        }
        Insert: {
          asset_id?: string | null
          created_at?: string
          discovered_from?: string | null
          id?: string
          metadata?: Json
          normalized_value: string
          organization_id: string
          selector_type: Database["public"]["Enums"]["darkrisk_selector_type"]
          sensitivity?: string
          source?: Database["public"]["Enums"]["darkrisk_source"]
          status?: string
          tenant_id?: string | null
          updated_at?: string
          value: string
        }
        Update: {
          asset_id?: string | null
          created_at?: string
          discovered_from?: string | null
          id?: string
          metadata?: Json
          normalized_value?: string
          organization_id?: string
          selector_type?: Database["public"]["Enums"]["darkrisk_selector_type"]
          sensitivity?: string
          source?: Database["public"]["Enums"]["darkrisk_source"]
          status?: string
          tenant_id?: string | null
          updated_at?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "darkrisk_selectors_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "darkrisk_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "darkrisk_selectors_discovered_from_fkey"
            columns: ["discovered_from"]
            isOneToOne: false
            referencedRelation: "darkrisk_selectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "darkrisk_selectors_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "darkrisk_selectors_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_sales_remediation_dashboard"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      darkrisk_source_config: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          key: string
          requires_extended: boolean
          source: Database["public"]["Enums"]["darkrisk_source"]
          updated_at: string
          value: Json
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          key: string
          requires_extended?: boolean
          source: Database["public"]["Enums"]["darkrisk_source"]
          updated_at?: string
          value: Json
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          key?: string
          requires_extended?: boolean
          source?: Database["public"]["Enums"]["darkrisk_source"]
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      darkrisk_source_records: {
        Row: {
          asset_id: string | null
          asset_scope: string | null
          created_at: string
          description: string | null
          extraction_error: string | null
          extraction_source: string | null
          extraction_status: string
          id: string
          organization_id: string
          preview_hash: string | null
          query_kind: string | null
          query_term: string | null
          raw_metadata: Json
          safe_preview: string | null
          scan_run_id: string
          selector_id: string | null
          source: Database["public"]["Enums"]["darkrisk_source"]
          source_added_at: string | null
          source_bucket: string | null
          source_date: string | null
          source_media: string | null
          source_record_key: string | null
          source_score: number | null
          source_simhash: string | null
          source_storage_id: string | null
          source_system_id: string | null
          source_type: string | null
          source_url: string | null
          tenant_id: string | null
          title: string | null
        }
        Insert: {
          asset_id?: string | null
          asset_scope?: string | null
          created_at?: string
          description?: string | null
          extraction_error?: string | null
          extraction_source?: string | null
          extraction_status?: string
          id?: string
          organization_id: string
          preview_hash?: string | null
          query_kind?: string | null
          query_term?: string | null
          raw_metadata?: Json
          safe_preview?: string | null
          scan_run_id: string
          selector_id?: string | null
          source: Database["public"]["Enums"]["darkrisk_source"]
          source_added_at?: string | null
          source_bucket?: string | null
          source_date?: string | null
          source_media?: string | null
          source_record_key?: string | null
          source_score?: number | null
          source_simhash?: string | null
          source_storage_id?: string | null
          source_system_id?: string | null
          source_type?: string | null
          source_url?: string | null
          tenant_id?: string | null
          title?: string | null
        }
        Update: {
          asset_id?: string | null
          asset_scope?: string | null
          created_at?: string
          description?: string | null
          extraction_error?: string | null
          extraction_source?: string | null
          extraction_status?: string
          id?: string
          organization_id?: string
          preview_hash?: string | null
          query_kind?: string | null
          query_term?: string | null
          raw_metadata?: Json
          safe_preview?: string | null
          scan_run_id?: string
          selector_id?: string | null
          source?: Database["public"]["Enums"]["darkrisk_source"]
          source_added_at?: string | null
          source_bucket?: string | null
          source_date?: string | null
          source_media?: string | null
          source_record_key?: string | null
          source_score?: number | null
          source_simhash?: string | null
          source_storage_id?: string | null
          source_system_id?: string | null
          source_type?: string | null
          source_url?: string | null
          tenant_id?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "darkrisk_source_records_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "darkrisk_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "darkrisk_source_records_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "darkrisk_source_records_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_sales_remediation_dashboard"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "darkrisk_source_records_scan_run_id_fkey"
            columns: ["scan_run_id"]
            isOneToOne: false
            referencedRelation: "darkrisk_scan_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "darkrisk_source_records_selector_id_fkey"
            columns: ["selector_id"]
            isOneToOne: false
            referencedRelation: "darkrisk_selectors"
            referencedColumns: ["id"]
          },
        ]
      }
      darkrisk360_manual_targets: {
        Row: {
          added_by: string | null
          created_at: string
          enabled: boolean
          id: string
          label: string | null
          normalized_value: string
          organization_id: string
          target_type: string
          value: string
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          label?: string | null
          normalized_value: string
          organization_id: string
          target_type: string
          value: string
        }
        Update: {
          added_by?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          label?: string | null
          normalized_value?: string
          organization_id?: string
          target_type?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "darkrisk360_manual_targets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "darkrisk360_manual_targets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_sales_remediation_dashboard"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      darkrisk360_notification_configs: {
        Row: {
          alert_on_new_findings: boolean
          alert_severity_threshold: string
          created_at: string
          created_by: string | null
          id: string
          last_alert_sent_at: string | null
          last_summary_sent_at: string | null
          min_new_findings_to_alert: number
          organization_id: string
          recipient_emails: string[]
          updated_at: string
          updated_by: string | null
          weekly_summary_enabled: boolean
        }
        Insert: {
          alert_on_new_findings?: boolean
          alert_severity_threshold?: string
          created_at?: string
          created_by?: string | null
          id?: string
          last_alert_sent_at?: string | null
          last_summary_sent_at?: string | null
          min_new_findings_to_alert?: number
          organization_id: string
          recipient_emails?: string[]
          updated_at?: string
          updated_by?: string | null
          weekly_summary_enabled?: boolean
        }
        Update: {
          alert_on_new_findings?: boolean
          alert_severity_threshold?: string
          created_at?: string
          created_by?: string | null
          id?: string
          last_alert_sent_at?: string | null
          last_summary_sent_at?: string | null
          min_new_findings_to_alert?: number
          organization_id?: string
          recipient_emails?: string[]
          updated_at?: string
          updated_by?: string | null
          weekly_summary_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "darkrisk360_notification_configs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "darkrisk360_notification_configs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "v_sales_remediation_dashboard"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      darkrisk360_scan_triggers: {
        Row: {
          id: string
          include_surface_sync: boolean
          organization_id: string
          picked_up_at: string | null
          requested_at: string
          scan_run_id: string | null
          status: string
          trigger_type: string
        }
        Insert: {
          id?: string
          include_surface_sync?: boolean
          organization_id: string
          picked_up_at?: string | null
          requested_at?: string
          scan_run_id?: string | null
          status?: string
          trigger_type?: string
        }
        Update: {
          id?: string
          include_surface_sync?: boolean
          organization_id?: string
          picked_up_at?: string | null
          requested_at?: string
          scan_run_id?: string | null
          status?: string
          trigger_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "darkrisk360_scan_triggers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "darkrisk360_scan_triggers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_sales_remediation_dashboard"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      darkrisk360_weekly_snapshots: {
        Row: {
          computed_at: string
          created_at: string
          delta_vs_prev: Json
          id: string
          new_records_this_week: number
          organization_id: string
          results_by_asset: Json
          results_by_day: Json
          results_by_filetype: Json
          results_by_source: Json
          risk_index: number
          scan_run_id: string | null
          severity_distribution: Json
          tier: string
          total_records: number
          week_key: string
          week_start_date: string
        }
        Insert: {
          computed_at?: string
          created_at?: string
          delta_vs_prev?: Json
          id?: string
          new_records_this_week?: number
          organization_id: string
          results_by_asset?: Json
          results_by_day?: Json
          results_by_filetype?: Json
          results_by_source?: Json
          risk_index?: number
          scan_run_id?: string | null
          severity_distribution?: Json
          tier?: string
          total_records?: number
          week_key: string
          week_start_date: string
        }
        Update: {
          computed_at?: string
          created_at?: string
          delta_vs_prev?: Json
          id?: string
          new_records_this_week?: number
          organization_id?: string
          results_by_asset?: Json
          results_by_day?: Json
          results_by_filetype?: Json
          results_by_source?: Json
          risk_index?: number
          scan_run_id?: string | null
          severity_distribution?: Json
          tier?: string
          total_records?: number
          week_key?: string
          week_start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "darkrisk360_weekly_snapshots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "darkrisk360_weekly_snapshots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_sales_remediation_dashboard"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "darkrisk360_weekly_snapshots_scan_run_id_fkey"
            columns: ["scan_run_id"]
            isOneToOne: false
            referencedRelation: "darkrisk_scan_runs"
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
          {
            foreignKeyName: "emergency_contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_sales_remediation_dashboard"
            referencedColumns: ["organization_id"]
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
          {
            foreignKeyName: "hilog_correlation_reports_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_sales_remediation_dashboard"
            referencedColumns: ["organization_id"]
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
            foreignKeyName: "incident_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_sales_remediation_dashboard"
            referencedColumns: ["organization_id"]
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
          {
            foreignKeyName: "integration_audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_sales_remediation_dashboard"
            referencedColumns: ["organization_id"]
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
          {
            foreignKeyName: "irp_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_sales_remediation_dashboard"
            referencedColumns: ["organization_id"]
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
          {
            foreignKeyName: "irp_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_sales_remediation_dashboard"
            referencedColumns: ["organization_id"]
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
      nuclei_scan360_findings: {
        Row: {
          asset_host: string | null
          category: string | null
          created_at: string
          customer_id: string
          extracted_results: Json
          id: string
          job_id: string
          matched_at: string | null
          matcher_name: string | null
          name: string | null
          organization_id: string
          raw_finding: Json
          severity: string | null
          tags: Json
          template_id: string | null
          type: string | null
        }
        Insert: {
          asset_host?: string | null
          category?: string | null
          created_at?: string
          customer_id: string
          extracted_results?: Json
          id?: string
          job_id: string
          matched_at?: string | null
          matcher_name?: string | null
          name?: string | null
          organization_id: string
          raw_finding?: Json
          severity?: string | null
          tags?: Json
          template_id?: string | null
          type?: string | null
        }
        Update: {
          asset_host?: string | null
          category?: string | null
          created_at?: string
          customer_id?: string
          extracted_results?: Json
          id?: string
          job_id?: string
          matched_at?: string | null
          matcher_name?: string | null
          name?: string | null
          organization_id?: string
          raw_finding?: Json
          severity?: string | null
          tags?: Json
          template_id?: string | null
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nuclei_scan360_findings_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nuclei_scan360_findings_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_sales_remediation_dashboard"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "nuclei_scan360_findings_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "nuclei_scan360_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nuclei_scan360_findings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nuclei_scan360_findings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_sales_remediation_dashboard"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      nuclei_scan360_jobs: {
        Row: {
          attempt_count: number
          authorized_scan: boolean
          completed_at: string | null
          created_at: string
          created_by: string | null
          created_by_email: string | null
          customer_id: string
          duration_ms: number | null
          findings_count: number
          id: string
          last_error: string | null
          max_findings: number
          normalized_target_url: string
          nuclei_version: string | null
          organization_id: string
          profile: string
          rate_limit: number
          raw_result: Json
          resolved_target_url: string | null
          source: string
          started_at: string | null
          status: string
          summary: Json
          target_host: string | null
          target_url: string
          templates_executed_count: number | null
          templates_loaded_count: number | null
          timeout_seconds: number
          updated_at: string
          warnings: Json
        }
        Insert: {
          attempt_count?: number
          authorized_scan?: boolean
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          created_by_email?: string | null
          customer_id: string
          duration_ms?: number | null
          findings_count?: number
          id?: string
          last_error?: string | null
          max_findings?: number
          normalized_target_url: string
          nuclei_version?: string | null
          organization_id: string
          profile: string
          rate_limit?: number
          raw_result?: Json
          resolved_target_url?: string | null
          source?: string
          started_at?: string | null
          status?: string
          summary?: Json
          target_host?: string | null
          target_url: string
          templates_executed_count?: number | null
          templates_loaded_count?: number | null
          timeout_seconds?: number
          updated_at?: string
          warnings?: Json
        }
        Update: {
          attempt_count?: number
          authorized_scan?: boolean
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          created_by_email?: string | null
          customer_id?: string
          duration_ms?: number | null
          findings_count?: number
          id?: string
          last_error?: string | null
          max_findings?: number
          normalized_target_url?: string
          nuclei_version?: string | null
          organization_id?: string
          profile?: string
          rate_limit?: number
          raw_result?: Json
          resolved_target_url?: string | null
          source?: string
          started_at?: string | null
          status?: string
          summary?: Json
          target_host?: string | null
          target_url?: string
          templates_executed_count?: number | null
          templates_loaded_count?: number | null
          timeout_seconds?: number
          updated_at?: string
          warnings?: Json
        }
        Relationships: [
          {
            foreignKeyName: "nuclei_scan360_jobs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nuclei_scan360_jobs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_sales_remediation_dashboard"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "nuclei_scan360_jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nuclei_scan360_jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_sales_remediation_dashboard"
            referencedColumns: ["organization_id"]
          },
        ]
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
            foreignKeyName: "organization_integrations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_sales_remediation_dashboard"
            referencedColumns: ["organization_id"]
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
          {
            foreignKeyName: "organization_locations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_sales_remediation_dashboard"
            referencedColumns: ["organization_id"]
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
          {
            foreignKeyName: "organization_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "v_sales_remediation_dashboard"
            referencedColumns: ["organization_id"]
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
            foreignKeyName: "organization_services_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_sales_remediation_dashboard"
            referencedColumns: ["organization_id"]
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
          dark_risk_contract_start: string | null
          dark_risk_contract_years: number | null
          dark_risk360_enabled: boolean
          darkrisk_esteso_enabled: boolean
          hicompliance_contract_start: string | null
          hicompliance_contract_years: number | null
          hicompliance_enabled: boolean
          id: string
          irp_extended: boolean
          name: string
          surface_scan_auto_validation: boolean
          sales_owner_user_id: string | null
          services_pause_reason: string | null
          services_paused: boolean
          services_paused_at: string | null
          subdomain_dump_depth: number
          subdomain_dump_enabled: boolean
          surface_scan_contract_start: string | null
          surface_scan_contract_years: number | null
          surface_scan_extended: boolean
          surface_scan360_enabled: boolean
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          dark_risk_contract_start?: string | null
          dark_risk_contract_years?: number | null
          dark_risk360_enabled?: boolean
          darkrisk_esteso_enabled?: boolean
          hicompliance_contract_start?: string | null
          hicompliance_contract_years?: number | null
          hicompliance_enabled?: boolean
          id?: string
          irp_extended?: boolean
          name: string
          surface_scan_auto_validation?: boolean
          sales_owner_user_id?: string | null
          services_pause_reason?: string | null
          services_paused?: boolean
          services_paused_at?: string | null
          subdomain_dump_depth?: number
          subdomain_dump_enabled?: boolean
          surface_scan_contract_start?: string | null
          surface_scan_contract_years?: number | null
          surface_scan_extended?: boolean
          surface_scan360_enabled?: boolean
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          dark_risk_contract_start?: string | null
          dark_risk_contract_years?: number | null
          dark_risk360_enabled?: boolean
          darkrisk_esteso_enabled?: boolean
          hicompliance_contract_start?: string | null
          hicompliance_contract_years?: number | null
          hicompliance_enabled?: boolean
          id?: string
          irp_extended?: boolean
          name?: string
          surface_scan_auto_validation?: boolean
          sales_owner_user_id?: string | null
          services_pause_reason?: string | null
          services_paused?: boolean
          services_paused_at?: string | null
          subdomain_dump_depth?: number
          subdomain_dump_enabled?: boolean
          surface_scan_contract_start?: string | null
          surface_scan_contract_years?: number | null
          surface_scan_extended?: boolean
          surface_scan360_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      external_exposure_scan_tasks: {
        Row: {
          created_at: string
          customer_id: string
          error_message: string | null
          finished_at: string | null
          id: string
          next_retry_at: string | null
          organization_id: string | null
          phase: string
          progress: number | null
          raw_output: Json | null
          remote_scan_id: number | null
          remote_target_id: number | null
          retry_count: number
          scan_job_id: string
          started_at: string | null
          status: string
          target_id: string | null
          target_name: string
          tenant_id: string | null
          tool_id: number
          tool_name: string
          tool_params: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          next_retry_at?: string | null
          organization_id?: string | null
          phase: string
          progress?: number | null
          raw_output?: Json | null
          remote_scan_id?: number | null
          remote_target_id?: number | null
          retry_count?: number
          scan_job_id: string
          started_at?: string | null
          status?: string
          target_id?: string | null
          target_name: string
          tenant_id?: string | null
          tool_id: number
          tool_name: string
          tool_params?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          next_retry_at?: string | null
          organization_id?: string | null
          phase?: string
          progress?: number | null
          raw_output?: Json | null
          remote_scan_id?: number | null
          remote_target_id?: number | null
          retry_count?: number
          scan_job_id?: string
          started_at?: string | null
          status?: string
          target_id?: string | null
          target_name?: string
          tenant_id?: string | null
          tool_id?: number
          tool_name?: string
          tool_params?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_exposure_scan_tasks_scan_job_id_fkey"
            columns: ["scan_job_id"]
            isOneToOne: false
            referencedRelation: "surface_scan_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_exposure_scan_tasks_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "surface_scan_targets"
            referencedColumns: ["id"]
          },
        ]
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
          {
            foreignKeyName: "playbook_completions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_sales_remediation_dashboard"
            referencedColumns: ["organization_id"]
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
          {
            foreignKeyName: "risk_analysis_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_sales_remediation_dashboard"
            referencedColumns: ["organization_id"]
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
          {
            foreignKeyName: "supplier_directory_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_sales_remediation_dashboard"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      surface_assets: {
        Row: {
          asset_type: string
          asset_value: string
          confidence: string
          customer_id: string | null
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
          tenant_id: string | null
        }
        Insert: {
          asset_type: string
          asset_value: string
          confidence?: string
          customer_id?: string | null
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
          tenant_id?: string | null
        }
        Update: {
          asset_type?: string
          asset_value?: string
          confidence?: string
          customer_id?: string | null
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
          tenant_id?: string | null
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
      surface_dns_lookup_findings: {
        Row: {
          asset_id: string | null
          category: string
          created_at: string
          customer_id: string | null
          description: string
          dns_lookup_result_id: string
          domain: string
          evidence: Json
          finding_key: string
          id: string
          organization_id: string | null
          recommendation: string
          report_summary: string | null
          scan_id: string | null
          severity: string
          status: string
          tenant_id: string
          title: string
        }
        Insert: {
          asset_id?: string | null
          category: string
          created_at?: string
          customer_id?: string | null
          description: string
          dns_lookup_result_id: string
          domain: string
          evidence?: Json
          finding_key: string
          id?: string
          organization_id?: string | null
          recommendation: string
          report_summary?: string | null
          scan_id?: string | null
          severity: string
          status: string
          tenant_id: string
          title: string
        }
        Update: {
          asset_id?: string | null
          category?: string
          created_at?: string
          customer_id?: string | null
          description?: string
          dns_lookup_result_id?: string
          domain?: string
          evidence?: Json
          finding_key?: string
          id?: string
          organization_id?: string | null
          recommendation?: string
          report_summary?: string | null
          scan_id?: string | null
          severity?: string
          status?: string
          tenant_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "surface_dns_lookup_findings_dns_lookup_result_id_fkey"
            columns: ["dns_lookup_result_id"]
            isOneToOne: false
            referencedRelation: "surface_dns_lookup_results"
            referencedColumns: ["id"]
          },
        ]
      }
      surface_dns_lookup_results: {
        Row: {
          additional_records: Json
          asset_id: string | null
          created_at: string
          customer_id: string | null
          domain: string
          duration_ms: number | null
          grade: string
          id: string
          normalized_domain: string
          organization_id: string | null
          raw_result: Json
          records: Json
          resolver: string
          scan_id: string | null
          scanned_at: string
          score: number
          summary: Json
          tenant_id: string
        }
        Insert: {
          additional_records?: Json
          asset_id?: string | null
          created_at?: string
          customer_id?: string | null
          domain: string
          duration_ms?: number | null
          grade: string
          id?: string
          normalized_domain: string
          organization_id?: string | null
          raw_result?: Json
          records?: Json
          resolver: string
          scan_id?: string | null
          scanned_at?: string
          score: number
          summary?: Json
          tenant_id: string
        }
        Update: {
          additional_records?: Json
          asset_id?: string | null
          created_at?: string
          customer_id?: string | null
          domain?: string
          duration_ms?: number | null
          grade?: string
          id?: string
          normalized_domain?: string
          organization_id?: string | null
          raw_result?: Json
          records?: Json
          resolver?: string
          scan_id?: string | null
          scanned_at?: string
          score?: number
          summary?: Json
          tenant_id?: string
        }
        Relationships: []
      }
      surface_exposure_findings: {
        Row: {
          affected_host: string | null
          affected_port: number | null
          affected_url: string | null
          created_at: string
          customer_id: string
          cve_ids: string[] | null
          cvss: number | null
          description: string | null
          evidence: string | null
          finding_type: string
          id: string
          organization_id: string | null
          raw: Json
          recommendation: string | null
          scan_job_id: string
          severity: string
          source: string
          source_scan_id: string | null
          status: string
          target_id: string | null
          tenant_id: string | null
          title: string
        }
        Insert: {
          affected_host?: string | null
          affected_port?: number | null
          affected_url?: string | null
          created_at?: string
          customer_id: string
          cve_ids?: string[] | null
          cvss?: number | null
          description?: string | null
          evidence?: string | null
          finding_type: string
          id?: string
          organization_id?: string | null
          raw?: Json
          recommendation?: string | null
          scan_job_id: string
          severity?: string
          source?: string
          source_scan_id?: string | null
          status?: string
          target_id?: string | null
          tenant_id?: string | null
          title: string
        }
        Update: {
          affected_host?: string | null
          affected_port?: number | null
          affected_url?: string | null
          created_at?: string
          customer_id?: string
          cve_ids?: string[] | null
          cvss?: number | null
          description?: string | null
          evidence?: string | null
          finding_type?: string
          id?: string
          organization_id?: string | null
          raw?: Json
          recommendation?: string | null
          scan_job_id?: string
          severity?: string
          source?: string
          source_scan_id?: string | null
          status?: string
          target_id?: string | null
          tenant_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "surface_exposure_findings_scan_job_id_fkey"
            columns: ["scan_job_id"]
            isOneToOne: false
            referencedRelation: "surface_scan_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "surface_exposure_findings_source_scan_id_fkey"
            columns: ["source_scan_id"]
            isOneToOne: false
            referencedRelation: "external_exposure_scan_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "surface_exposure_findings_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "surface_scan_targets"
            referencedColumns: ["id"]
          },
        ]
      }
      surface_external_intel: {
        Row: {
          confidence: string
          created_at: string
          customer_id: string | null
          found: boolean
          id: string
          organization_id: string
          provider: string
          raw_response: Json | null
          scan_job_id: string
          summary: Json | null
          target: string
          tenant_id: string | null
        }
        Insert: {
          confidence?: string
          created_at?: string
          customer_id?: string | null
          found?: boolean
          id?: string
          organization_id: string
          provider: string
          raw_response?: Json | null
          scan_job_id: string
          summary?: Json | null
          target: string
          tenant_id?: string | null
        }
        Update: {
          confidence?: string
          created_at?: string
          customer_id?: string | null
          found?: boolean
          id?: string
          organization_id?: string
          provider?: string
          raw_response?: Json | null
          scan_job_id?: string
          summary?: Json | null
          target?: string
          tenant_id?: string | null
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
          customer_id: string | null
          cve: string[]
          cvss: number | null
          cwe: string[]
          dedup_fingerprint: string | null
          description: string | null
          epss: number | null
          evidence: Json | null
          finding_type: string
          first_seen_at: string | null
          id: string
          ip: unknown
          last_seen_at: string | null
          module: string | null
          occurrence_count: number
          organization_id: string
          port: number | null
          protocol: string | null
          provider: string | null
          remediation: string | null
          scan_job_id: string
          severity: string
          status: string
          tenant_id: string | null
          title: string
        }
        Insert: {
          affected_asset?: string | null
          affected_url?: string | null
          attribution_confidence?: string
          cisa_kev?: boolean
          created_at?: string
          customer_id?: string | null
          cve?: string[]
          cvss?: number | null
          cwe?: string[]
          dedup_fingerprint?: string | null
          description?: string | null
          epss?: number | null
          evidence?: Json | null
          finding_type: string
          first_seen_at?: string | null
          id?: string
          ip?: unknown
          last_seen_at?: string | null
          module?: string | null
          occurrence_count?: number
          organization_id: string
          port?: number | null
          protocol?: string | null
          provider?: string | null
          remediation?: string | null
          scan_job_id: string
          severity?: string
          status?: string
          tenant_id?: string | null
          title: string
        }
        Update: {
          affected_asset?: string | null
          affected_url?: string | null
          attribution_confidence?: string
          cisa_kev?: boolean
          created_at?: string
          customer_id?: string | null
          cve?: string[]
          cvss?: number | null
          cwe?: string[]
          dedup_fingerprint?: string | null
          description?: string | null
          epss?: number | null
          evidence?: Json | null
          finding_type?: string
          first_seen_at?: string | null
          id?: string
          ip?: unknown
          last_seen_at?: string | null
          module?: string | null
          occurrence_count?: number
          organization_id?: string
          port?: number | null
          protocol?: string | null
          provider?: string | null
          remediation?: string | null
          scan_job_id?: string
          severity?: string
          status?: string
          tenant_id?: string | null
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
      surface_graph_edges: {
        Row: {
          created_at: string
          edge_data: Json
          id: string
          investigation_id: string
          organization_id: string
          source_node_id: string
          target_node_id: string
        }
        Insert: {
          created_at?: string
          edge_data: Json
          id?: string
          investigation_id: string
          organization_id: string
          source_node_id: string
          target_node_id: string
        }
        Update: {
          created_at?: string
          edge_data?: Json
          id?: string
          investigation_id?: string
          organization_id?: string
          source_node_id?: string
          target_node_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "surface_graph_edges_investigation_id_fkey"
            columns: ["investigation_id"]
            isOneToOne: false
            referencedRelation: "surface_graph_investigations"
            referencedColumns: ["id"]
          },
        ]
      }
      surface_graph_enricher_runs: {
        Row: {
          completed_at: string | null
          edges_created: number
          enricher_name: string
          error_message: string | null
          id: string
          input_node_ids: string[]
          investigation_id: string
          nodes_created: number
          organization_id: string
          started_at: string
          status: string
        }
        Insert: {
          completed_at?: string | null
          edges_created?: number
          enricher_name: string
          error_message?: string | null
          id?: string
          input_node_ids?: string[]
          investigation_id: string
          nodes_created?: number
          organization_id: string
          started_at?: string
          status?: string
        }
        Update: {
          completed_at?: string | null
          edges_created?: number
          enricher_name?: string
          error_message?: string | null
          id?: string
          input_node_ids?: string[]
          investigation_id?: string
          nodes_created?: number
          organization_id?: string
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "surface_graph_enricher_runs_investigation_id_fkey"
            columns: ["investigation_id"]
            isOneToOne: false
            referencedRelation: "surface_graph_investigations"
            referencedColumns: ["id"]
          },
        ]
      }
      surface_graph_investigations: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          edge_count: number
          id: string
          name: string
          node_count: number
          organization_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          edge_count?: number
          id?: string
          name: string
          node_count?: number
          organization_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          edge_count?: number
          id?: string
          name?: string
          node_count?: number
          organization_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "surface_graph_investigations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "surface_graph_investigations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_sales_remediation_dashboard"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      surface_graph_nodes: {
        Row: {
          created_at: string
          id: string
          investigation_id: string
          node_data: Json
          organization_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          investigation_id: string
          node_data: Json
          organization_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          investigation_id?: string
          node_data?: Json
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "surface_graph_nodes_investigation_id_fkey"
            columns: ["investigation_id"]
            isOneToOne: false
            referencedRelation: "surface_graph_investigations"
            referencedColumns: ["id"]
          },
        ]
      }
      surface_http_header_findings: {
        Row: {
          actual_value: string | null
          asset_id: string | null
          category: string
          created_at: string
          customer_id: string | null
          description: string
          earned_points: number
          evidence: Json
          header_name: string
          id: string
          note: string
          organization_id: string | null
          project_id: string
          recommendation: string
          result_id: string
          rule_id: string
          scan_id: string
          severity: string
          status: string
          tenant_id: string | null
          weight: number
        }
        Insert: {
          actual_value?: string | null
          asset_id?: string | null
          category: string
          created_at?: string
          customer_id?: string | null
          description: string
          earned_points?: number
          evidence?: Json
          header_name: string
          id?: string
          note: string
          organization_id?: string | null
          project_id: string
          recommendation: string
          result_id: string
          rule_id: string
          scan_id: string
          severity: string
          status: string
          tenant_id?: string | null
          weight?: number
        }
        Update: {
          actual_value?: string | null
          asset_id?: string | null
          category?: string
          created_at?: string
          customer_id?: string | null
          description?: string
          earned_points?: number
          evidence?: Json
          header_name?: string
          id?: string
          note?: string
          organization_id?: string | null
          project_id?: string
          recommendation?: string
          result_id?: string
          rule_id?: string
          scan_id?: string
          severity?: string
          status?: string
          tenant_id?: string | null
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "surface_http_header_findings_result_id_fkey"
            columns: ["result_id"]
            isOneToOne: false
            referencedRelation: "surface_http_header_results"
            referencedColumns: ["id"]
          },
        ]
      }
      surface_http_header_results: {
        Row: {
          asset_id: string | null
          asset_type: string
          created_at: string
          customer_id: string | null
          error_message: string | null
          final_url: string | null
          grade: string
          high_impact_open_count: number
          id: string
          input_url: string
          is_https: boolean
          missing_count: number
          normalized_url: string
          ok_count: number
          organization_id: string | null
          project_id: string
          raw_headers: Json
          response_time_ms: number
          scan_id: string
          scanned_at: string
          score: number
          status_code: number | null
          tenant_id: string | null
          weak_count: number
        }
        Insert: {
          asset_id?: string | null
          asset_type: string
          created_at?: string
          customer_id?: string | null
          error_message?: string | null
          final_url?: string | null
          grade: string
          high_impact_open_count?: number
          id?: string
          input_url: string
          is_https?: boolean
          missing_count?: number
          normalized_url: string
          ok_count?: number
          organization_id?: string | null
          project_id: string
          raw_headers?: Json
          response_time_ms?: number
          scan_id: string
          scanned_at?: string
          score: number
          status_code?: number | null
          tenant_id?: string | null
          weak_count?: number
        }
        Update: {
          asset_id?: string | null
          asset_type?: string
          created_at?: string
          customer_id?: string | null
          error_message?: string | null
          final_url?: string | null
          grade?: string
          high_impact_open_count?: number
          id?: string
          input_url?: string
          is_https?: boolean
          missing_count?: number
          normalized_url?: string
          ok_count?: number
          organization_id?: string | null
          project_id?: string
          raw_headers?: Json
          response_time_ms?: number
          scan_id?: string
          scanned_at?: string
          score?: number
          status_code?: number | null
          tenant_id?: string | null
          weak_count?: number
        }
        Relationships: []
      }
      surface_observations: {
        Row: {
          asset_id: string | null
          confidence: string
          created_at: string
          customer_id: string | null
          id: string
          module: string
          observation_type: string
          organization_id: string
          scan_job_id: string
          severity: string
          tenant_id: string | null
          title: string | null
          value: Json
        }
        Insert: {
          asset_id?: string | null
          confidence?: string
          created_at?: string
          customer_id?: string | null
          id?: string
          module: string
          observation_type: string
          organization_id: string
          scan_job_id: string
          severity?: string
          tenant_id?: string | null
          title?: string | null
          value: Json
        }
        Update: {
          asset_id?: string | null
          confidence?: string
          created_at?: string
          customer_id?: string | null
          id?: string
          module?: string
          observation_type?: string
          organization_id?: string
          scan_job_id?: string
          severity?: string
          tenant_id?: string | null
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
      surface_open_ports: {
        Row: {
          banner: string | null
          business_risk: string | null
          customer_id: string
          exposure_level: string
          first_seen_at: string
          host: string
          id: string
          ip: string | null
          is_tls: boolean
          is_web: boolean
          last_seen_at: string
          organization_id: string | null
          os_guess: string | null
          port: number
          protocol: string
          raw: Json
          remediation_hint: string | null
          scan_job_id: string | null
          service_extra_info: string | null
          service_name: string | null
          service_product: string | null
          service_version: string | null
          source: string
          source_scan_id: string | null
          state: string
          target_id: string | null
          tenant_id: string | null
        }
        Insert: {
          banner?: string | null
          business_risk?: string | null
          customer_id: string
          exposure_level?: string
          first_seen_at?: string
          host: string
          id?: string
          ip?: string | null
          is_tls?: boolean
          is_web?: boolean
          last_seen_at?: string
          organization_id?: string | null
          os_guess?: string | null
          port: number
          protocol?: string
          raw?: Json
          remediation_hint?: string | null
          scan_job_id?: string | null
          service_extra_info?: string | null
          service_name?: string | null
          service_product?: string | null
          service_version?: string | null
          source?: string
          source_scan_id?: string | null
          state: string
          target_id?: string | null
          tenant_id?: string | null
        }
        Update: {
          banner?: string | null
          business_risk?: string | null
          customer_id?: string
          exposure_level?: string
          first_seen_at?: string
          host?: string
          id?: string
          ip?: string | null
          is_tls?: boolean
          is_web?: boolean
          last_seen_at?: string
          organization_id?: string | null
          os_guess?: string | null
          port?: number
          protocol?: string
          raw?: Json
          remediation_hint?: string | null
          scan_job_id?: string | null
          service_extra_info?: string | null
          service_name?: string | null
          service_product?: string | null
          service_version?: string | null
          source?: string
          source_scan_id?: string | null
          state?: string
          target_id?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "surface_open_ports_scan_job_id_fkey"
            columns: ["scan_job_id"]
            isOneToOne: false
            referencedRelation: "surface_scan_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "surface_open_ports_source_scan_id_fkey"
            columns: ["source_scan_id"]
            isOneToOne: false
            referencedRelation: "external_exposure_scan_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "surface_open_ports_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "surface_scan_targets"
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
          {
            foreignKeyName: "surface_scan_alerts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_sales_remediation_dashboard"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      surface_scan_audit_log: {
        Row: {
          action: string
          created_at: string
          customer_id: string | null
          details: Json | null
          id: string
          organization_id: string | null
          scan_job_id: string | null
          tenant_id: string | null
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          customer_id?: string | null
          details?: Json | null
          id?: string
          organization_id?: string | null
          scan_job_id?: string | null
          tenant_id?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          customer_id?: string | null
          details?: Json | null
          id?: string
          organization_id?: string | null
          scan_job_id?: string | null
          tenant_id?: string | null
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
      surface_scan_ioc_fresh_config: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_enabled: boolean
          last_refreshed_at: string | null
          lease_minutes: number
          organization_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_enabled?: boolean
          last_refreshed_at?: string | null
          lease_minutes?: number
          organization_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_enabled?: boolean
          last_refreshed_at?: string | null
          lease_minutes?: number
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "surface_scan_ioc_fresh_config_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "surface_scan_ioc_fresh_config_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "v_sales_remediation_dashboard"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      surface_scan_ioc_fresh_items: {
        Row: {
          confidence: number
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          ioc_type: string
          ioc_value: string
          is_active: boolean
          notes: string | null
          organization_id: string
          severity: string
          source: string
          synced_at: string | null
          updated_at: string
        }
        Insert: {
          confidence?: number
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          ioc_type: string
          ioc_value: string
          is_active?: boolean
          notes?: string | null
          organization_id: string
          severity?: string
          source?: string
          synced_at?: string | null
          updated_at?: string
        }
        Update: {
          confidence?: number
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          ioc_type?: string
          ioc_value?: string
          is_active?: boolean
          notes?: string | null
          organization_id?: string
          severity?: string
          source?: string
          synced_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "surface_scan_ioc_fresh_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "surface_scan_ioc_fresh_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_sales_remediation_dashboard"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      surface_scan_jobs: {
        Row: {
          authorization_confirmed: boolean
          completed_at: string | null
          config: Json
          created_at: string
          customer_id: string | null
          error_message: string | null
          hosting_context: string
          hostname: string | null
          id: string
          normalized_target: string
          organization_id: string
          port: number | null
          protocol: string | null
          raw_target: string
          recovery_attempt_count: number
          requested_by: string | null
          resolved_ips: string[]
          root_domain: string | null
          scan_name: string | null
          scan_profile: string
          scan_type: string
          scope_guard: Json
          shodan_status: string
          started_at: string | null
          status: string
          summary: Json
          target_type: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          authorization_confirmed?: boolean
          completed_at?: string | null
          config?: Json
          created_at?: string
          customer_id?: string | null
          error_message?: string | null
          hosting_context?: string
          hostname?: string | null
          id?: string
          normalized_target: string
          organization_id: string
          port?: number | null
          protocol?: string | null
          raw_target: string
          recovery_attempt_count?: number
          requested_by?: string | null
          resolved_ips?: string[]
          root_domain?: string | null
          scan_name?: string | null
          scan_profile?: string
          scan_type?: string
          scope_guard?: Json
          shodan_status?: string
          started_at?: string | null
          status?: string
          summary?: Json
          target_type: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          authorization_confirmed?: boolean
          completed_at?: string | null
          config?: Json
          created_at?: string
          customer_id?: string | null
          error_message?: string | null
          hosting_context?: string
          hostname?: string | null
          id?: string
          normalized_target?: string
          organization_id?: string
          port?: number | null
          protocol?: string | null
          raw_target?: string
          recovery_attempt_count?: number
          requested_by?: string | null
          resolved_ips?: string[]
          root_domain?: string | null
          scan_name?: string | null
          scan_profile?: string
          scan_type?: string
          scope_guard?: Json
          shodan_status?: string
          started_at?: string | null
          status?: string
          summary?: Json
          target_type?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      surface_scan_module_results: {
        Row: {
          completed_at: string | null
          created_at: string
          customer_id: string | null
          duration_ms: number | null
          error_message: string | null
          id: string
          module_key: string
          module_label: string
          normalized: Json
          organization_id: string | null
          raw: Json
          scan_job_id: string
          score: number | null
          severity: string
          source: string | null
          started_at: string | null
          status: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          customer_id?: string | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          module_key: string
          module_label: string
          normalized?: Json
          organization_id?: string | null
          raw?: Json
          scan_job_id: string
          score?: number | null
          severity?: string
          source?: string | null
          started_at?: string | null
          status: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          customer_id?: string | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          module_key?: string
          module_label?: string
          normalized?: Json
          organization_id?: string | null
          raw?: Json
          scan_job_id?: string
          score?: number | null
          severity?: string
          source?: string | null
          started_at?: string | null
          status?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "surface_scan_module_results_scan_job_id_fkey"
            columns: ["scan_job_id"]
            isOneToOne: false
            referencedRelation: "surface_scan_jobs"
            referencedColumns: ["id"]
          },
        ]
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
      surface_scan_targets: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          is_authorized: boolean
          organization_id: string | null
          resolved_ips: string[] | null
          root_domain: string | null
          scan_job_id: string
          source: string
          target_type: string
          target_value: string
          tenant_id: string | null
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          is_authorized?: boolean
          organization_id?: string | null
          resolved_ips?: string[] | null
          root_domain?: string | null
          scan_job_id: string
          source?: string
          target_type: string
          target_value: string
          tenant_id?: string | null
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          is_authorized?: boolean
          organization_id?: string | null
          resolved_ips?: string[] | null
          root_domain?: string | null
          scan_job_id?: string
          source?: string
          target_type?: string
          target_value?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "surface_scan_targets_scan_job_id_fkey"
            columns: ["scan_job_id"]
            isOneToOne: false
            referencedRelation: "surface_scan_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      surface_ssl_results: {
        Row: {
          certificate_issuer: string | null
          certificate_not_after: string | null
          certificate_not_before: string | null
          certificate_subject: string | null
          created_at: string
          customer_id: string
          grade: string | null
          host: string
          id: string
          organization_id: string | null
          port: number
          raw: Json
          scan_job_id: string | null
          source_scan_id: string | null
          target_id: string | null
          tenant_id: string | null
          url: string
          weak_ciphers: string[] | null
          weak_protocols: string[] | null
        }
        Insert: {
          certificate_issuer?: string | null
          certificate_not_after?: string | null
          certificate_not_before?: string | null
          certificate_subject?: string | null
          created_at?: string
          customer_id: string
          grade?: string | null
          host: string
          id?: string
          organization_id?: string | null
          port: number
          raw?: Json
          scan_job_id?: string | null
          source_scan_id?: string | null
          target_id?: string | null
          tenant_id?: string | null
          url: string
          weak_ciphers?: string[] | null
          weak_protocols?: string[] | null
        }
        Update: {
          certificate_issuer?: string | null
          certificate_not_after?: string | null
          certificate_not_before?: string | null
          certificate_subject?: string | null
          created_at?: string
          customer_id?: string
          grade?: string | null
          host?: string
          id?: string
          organization_id?: string | null
          port?: number
          raw?: Json
          scan_job_id?: string | null
          source_scan_id?: string | null
          target_id?: string | null
          tenant_id?: string | null
          url?: string
          weak_ciphers?: string[] | null
          weak_protocols?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "surface_ssl_results_scan_job_id_fkey"
            columns: ["scan_job_id"]
            isOneToOne: false
            referencedRelation: "surface_scan_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "surface_ssl_results_source_scan_id_fkey"
            columns: ["source_scan_id"]
            isOneToOne: false
            referencedRelation: "external_exposure_scan_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "surface_ssl_results_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "surface_scan_targets"
            referencedColumns: ["id"]
          },
        ]
      }
      surface_web_technologies: {
        Row: {
          category: string | null
          confidence: number | null
          created_at: string
          customer_id: string
          host: string
          id: string
          organization_id: string | null
          port: number | null
          raw: Json
          scan_job_id: string | null
          source: string
          source_provider: string
          source_scan_id: string | null
          target_id: string | null
          technology_name: string
          technology_version: string | null
          tenant_id: string | null
          url: string
        }
        Insert: {
          category?: string | null
          confidence?: number | null
          created_at?: string
          customer_id: string
          host: string
          id?: string
          organization_id?: string | null
          port?: number | null
          raw?: Json
          scan_job_id?: string | null
          source?: string
          source_provider?: string
          source_scan_id?: string | null
          target_id?: string | null
          technology_name: string
          technology_version?: string | null
          tenant_id?: string | null
          url: string
        }
        Update: {
          category?: string | null
          confidence?: number | null
          created_at?: string
          customer_id?: string
          host?: string
          id?: string
          organization_id?: string | null
          port?: number | null
          raw?: Json
          scan_job_id?: string | null
          source?: string
          source_provider?: string
          source_scan_id?: string | null
          target_id?: string | null
          technology_name?: string
          technology_version?: string | null
          tenant_id?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "surface_web_technologies_scan_job_id_fkey"
            columns: ["scan_job_id"]
            isOneToOne: false
            referencedRelation: "surface_scan_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "surface_web_technologies_source_scan_id_fkey"
            columns: ["source_scan_id"]
            isOneToOne: false
            referencedRelation: "external_exposure_scan_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "surface_web_technologies_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "surface_scan_targets"
            referencedColumns: ["id"]
          },
        ]
      }
      surface_scan_monthly_reports: {
        Row: {
          created_at: string
          id: string
          month_key: string
          month_start: string
          organization_id: string
          payload: Json
          pdf_url: string | null
          triggered_by: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          month_key: string
          month_start: string
          organization_id: string
          payload?: Json
          pdf_url?: string | null
          triggered_by?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          month_key?: string
          month_start?: string
          organization_id?: string
          payload?: Json
          pdf_url?: string | null
          triggered_by?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "surface_scan_monthly_reports_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "surface_scan_monthly_reports_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_sales_remediation_dashboard"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      surface_service_fingerprint_queue: {
        Row: {
          attempts: number
          cooldown_until: string | null
          created_at: string
          host: string
          id: string
          ip: string | null
          last_error: string | null
          not_before: string
          open_port_id: string
          organization_id: string
          port: number
          protocol: string
          reason: string
          scan_job_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          cooldown_until?: string | null
          created_at?: string
          host: string
          id?: string
          ip?: string | null
          last_error?: string | null
          not_before?: string
          open_port_id: string
          organization_id: string
          port: number
          protocol?: string
          reason?: string
          scan_job_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          cooldown_until?: string | null
          created_at?: string
          host?: string
          id?: string
          ip?: string | null
          last_error?: string | null
          not_before?: string
          open_port_id?: string
          organization_id?: string
          port?: number
          protocol?: string
          reason?: string
          scan_job_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      surface_service_vulnerability_matches: {
        Row: {
          cisa_kev: boolean
          cpe_name: string | null
          created_at: string
          cve_id: string | null
          cvss_score: number | null
          epss_percentile: number | null
          epss_score: number | null
          evidence: Json
          first_seen_at: string
          host: string
          id: string
          ip: string | null
          last_seen_at: string
          match_basis: string | null
          match_confidence: number | null
          match_key: string
          match_status: string
          open_port_id: string | null
          organization_id: string
          port: number
          protocol: string
          scan_job_id: string | null
          service_name: string | null
          service_product: string | null
          service_version: string | null
          updated_at: string
        }
        Insert: {
          cisa_kev?: boolean
          cpe_name?: string | null
          created_at?: string
          cve_id?: string | null
          cvss_score?: number | null
          epss_percentile?: number | null
          epss_score?: number | null
          evidence?: Json
          first_seen_at?: string
          host: string
          id?: string
          ip?: string | null
          last_seen_at?: string
          match_basis?: string | null
          match_confidence?: number | null
          match_key: string
          match_status: string
          open_port_id?: string | null
          organization_id: string
          port: number
          protocol?: string
          scan_job_id?: string | null
          service_name?: string | null
          service_product?: string | null
          service_version?: string | null
          updated_at?: string
        }
        Update: {
          cisa_kev?: boolean
          cpe_name?: string | null
          created_at?: string
          cve_id?: string | null
          cvss_score?: number | null
          epss_percentile?: number | null
          epss_score?: number | null
          evidence?: Json
          first_seen_at?: string
          host?: string
          id?: string
          ip?: string | null
          last_seen_at?: string
          match_basis?: string | null
          match_confidence?: number | null
          match_key?: string
          match_status?: string
          open_port_id?: string | null
          organization_id?: string
          port?: number
          protocol?: string
          scan_job_id?: string | null
          service_name?: string | null
          service_product?: string | null
          service_version?: string | null
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
          {
            foreignKeyName: "user_preferences_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_sales_remediation_dashboard"
            referencedColumns: ["organization_id"]
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
          {
            foreignKeyName: "users_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_sales_remediation_dashboard"
            referencedColumns: ["organization_id"]
          },
        ]
      }
    }
    Views: {
      surface_dns_lookup_scan_summary: {
        Row: {
          average_score: number | null
          customer_id: string | null
          last_scanned_at: string | null
          scan_id: string | null
          secure_assets: number | null
          total_assets: number | null
          weak_assets: number | null
        }
        Relationships: []
      }
      surface_http_header_scan_summary: {
        Row: {
          average_score: number | null
          customer_id: string | null
          high_impact_open_total: number | null
          last_scanned_at: string | null
          project_id: string | null
          scan_id: string | null
          secure_assets: number | null
          total_assets: number | null
          weak_assets: number | null
        }
        Relationships: []
      }
      surface_open_ports_latest: {
        Row: {
          banner: string | null
          business_risk: string | null
          customer_id: string | null
          exposure_level: string | null
          first_seen_at: string | null
          host: string | null
          id: string | null
          ip: string | null
          is_tls: boolean | null
          is_web: boolean | null
          last_seen_at: string | null
          organization_id: string | null
          os_guess: string | null
          port: number | null
          protocol: string | null
          raw: Json | null
          remediation_hint: string | null
          scan_job_id: string | null
          service_extra_info: string | null
          service_name: string | null
          service_product: string | null
          service_version: string | null
          source_scan_id: string | null
          state: string | null
          target_id: string | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "surface_open_ports_scan_job_id_fkey"
            columns: ["scan_job_id"]
            isOneToOne: false
            referencedRelation: "surface_scan_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "surface_open_ports_source_scan_id_fkey"
            columns: ["source_scan_id"]
            isOneToOne: false
            referencedRelation: "external_exposure_scan_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "surface_open_ports_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "surface_scan_targets"
            referencedColumns: ["id"]
          },
        ]
      }
      v_sales_remediation_dashboard: {
        Row: {
          avg_progress: number | null
          completed_tasks: number | null
          critical_tasks: number | null
          high_tasks: number | null
          low_tasks: number | null
          medium_tasks: number | null
          organization_code: string | null
          organization_id: string | null
          organization_name: string | null
          overdue_tasks: number | null
          sales_owner_email: string | null
          sales_owner_user_id: string | null
          total_tasks: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_delete_organization_robust: {
        Args: { _actor_id?: string; _organization_id: string }
        Returns: Json
      }
      calc_risk_intrinseco: {
        Args: { criticita: number; esposizione: number; superficie: number }
        Returns: number
      }
      can_manage_all_organizations: {
        Args: { _user_id: string }
        Returns: boolean
      }
      darkrisk_apply_retention: { Args: { _org_id?: string }; Returns: Json }
      darkrisk_is_analyst: {
        Args: { _organization_id: string; _user_id: string }
        Returns: boolean
      }
      darkrisk_qa_security_snapshot: {
        Args: { _org_id: string }
        Returns: Json
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
      surface_scan_can_access_customer: {
        Args: { _customer_id: string; _user_id: string }
        Returns: boolean
      }
      surface_scan_is_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "super_admin" | "sales" | "client"
      assessment_status:
        | "not_applicable"
        | "planned_in_progress"
        | "completed"
        | "not_started"
      darkrisk_asset_type:
        | "domain"
        | "subdomain"
        | "url"
        | "ip"
        | "cidr"
        | "email"
        | "mx"
        | "ns"
        | "host"
        | "service"
        | "certificate"
        | "unknown"
      darkrisk_confidence: "low" | "medium" | "high"
      darkrisk_finding_status:
        | "new"
        | "triaged"
        | "validated"
        | "false_positive"
        | "accepted_risk"
        | "remediation_in_progress"
        | "resolved"
        | "suppressed"
      darkrisk_scan_status:
        | "queued"
        | "running"
        | "completed"
        | "completed_with_warnings"
        | "failed"
        | "cancelled"
      darkrisk_selector_type:
        | "email"
        | "domain"
        | "wildcard_domain"
        | "url"
        | "ipv4"
        | "ipv6"
        | "cidrv4"
        | "cidrv6"
        | "phone"
        | "bitcoin"
        | "mac"
        | "ipfs"
        | "uuid"
        | "storageid"
        | "systemid"
        | "simhash"
        | "credit_card"
        | "iban"
      darkrisk_severity: "info" | "low" | "medium" | "high" | "critical"
      darkrisk_source:
        | "surfacescan360"
        | "intelx"
        | "openai"
        | "manual"
        | "firecrawl"
      darkrisk_tier: "standard" | "extended"
      darkrisk_visibility: "customer" | "analyst" | "admin"
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
      darkrisk_asset_type: [
        "domain",
        "subdomain",
        "url",
        "ip",
        "cidr",
        "email",
        "mx",
        "ns",
        "host",
        "service",
        "certificate",
        "unknown",
      ],
      darkrisk_confidence: ["low", "medium", "high"],
      darkrisk_finding_status: [
        "new",
        "triaged",
        "validated",
        "false_positive",
        "accepted_risk",
        "remediation_in_progress",
        "resolved",
        "suppressed",
      ],
      darkrisk_scan_status: [
        "queued",
        "running",
        "completed",
        "completed_with_warnings",
        "failed",
        "cancelled",
      ],
      darkrisk_selector_type: [
        "email",
        "domain",
        "wildcard_domain",
        "url",
        "ipv4",
        "ipv6",
        "cidrv4",
        "cidrv6",
        "phone",
        "bitcoin",
        "mac",
        "ipfs",
        "uuid",
        "storageid",
        "systemid",
        "simhash",
        "credit_card",
        "iban",
      ],
      darkrisk_severity: ["info", "low", "medium", "high", "critical"],
      darkrisk_source: [
        "surfacescan360",
        "intelx",
        "openai",
        "manual",
        "firecrawl",
      ],
      darkrisk_tier: ["standard", "extended"],
      darkrisk_visibility: ["customer", "analyst", "admin"],
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
