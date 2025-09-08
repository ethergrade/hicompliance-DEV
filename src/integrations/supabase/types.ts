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
      emergency_contacts: {
        Row: {
          category: string
          created_at: string
          email: string
          id: string
          name: string
          organization_id: string | null
          phone: string
          role: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          email: string
          id?: string
          name: string
          organization_id?: string | null
          phone: string
          role: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          email?: string
          id?: string
          name?: string
          organization_id?: string | null
          phone?: string
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "emergency_contacts_organization_id_fkey"
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
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      remediation_tasks: {
        Row: {
          assignee: string | null
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
          start_date: string
          task: string
          updated_at: string
        }
        Insert: {
          assignee?: string | null
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
          start_date: string
          task: string
          updated_at?: string
        }
        Update: {
          assignee?: string | null
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
      get_current_user_type: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
    }
    Enums: {
      assessment_status: "not_applicable" | "planned_in_progress" | "completed"
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
      assessment_status: ["not_applicable", "planned_in_progress", "completed"],
      service_status: ["active", "inactive", "maintenance", "alert"],
      user_type: ["admin", "client"],
    },
  },
} as const
