export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15";
  };
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      ai_conversations: {
        Row: {
          created_at: string;
          id: string;
          matter_ref: string | null;
          tenant_id: string | null;
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          matter_ref?: string | null;
          tenant_id?: string | null;
          title?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          matter_ref?: string | null;
          tenant_id?: string | null;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_conversations_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_documents: {
        Row: {
          created_at: string;
          doc_kind: string | null;
          id: string;
          key_dates: Json;
          matter_ref: string | null;
          name: string;
          parties: Json;
          raw_text: string;
          risk_notes: string | null;
          status: string;
          summary: string | null;
          tags: Json;
          tenant_id: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          doc_kind?: string | null;
          id?: string;
          key_dates?: Json;
          matter_ref?: string | null;
          name: string;
          parties?: Json;
          raw_text: string;
          risk_notes?: string | null;
          status?: string;
          summary?: string | null;
          tags?: Json;
          tenant_id?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          doc_kind?: string | null;
          id?: string;
          key_dates?: Json;
          matter_ref?: string | null;
          name?: string;
          parties?: Json;
          raw_text?: string;
          risk_notes?: string | null;
          status?: string;
          summary?: string | null;
          tags?: Json;
          tenant_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_documents_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_drafts: {
        Row: {
          content: string;
          created_at: string;
          doc_type: string;
          id: string;
          instructions: string;
          matter_ref: string | null;
          status: string;
          tenant_id: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          content: string;
          created_at?: string;
          doc_type: string;
          id?: string;
          instructions: string;
          matter_ref?: string | null;
          status?: string;
          tenant_id?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          doc_type?: string;
          id?: string;
          instructions?: string;
          matter_ref?: string | null;
          status?: string;
          tenant_id?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_drafts_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_messages: {
        Row: {
          content: string;
          conversation_id: string;
          created_at: string;
          id: string;
          role: string;
          tenant_id: string | null;
          user_id: string;
        };
        Insert: {
          content: string;
          conversation_id: string;
          created_at?: string;
          id?: string;
          role: string;
          tenant_id?: string | null;
          user_id: string;
        };
        Update: {
          content?: string;
          conversation_id?: string;
          created_at?: string;
          id?: string;
          role?: string;
          tenant_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "ai_conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_messages_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_usage_daily: {
        Row: {
          call_count: number;
          usage_date: string;
          user_id: string;
        };
        Insert: {
          call_count?: number;
          usage_date?: string;
          user_id: string;
        };
        Update: {
          call_count?: number;
          usage_date?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      audit_log: {
        Row: {
          action: string;
          actor_email: string | null;
          actor_user_id: string | null;
          created_at: string;
          id: string;
          ip_address: string | null;
          metadata: Json;
          resource_id: string | null;
          resource_type: string;
          result: string;
          tenant_id: string | null;
          user_agent: string | null;
        };
        Insert: {
          action: string;
          actor_email?: string | null;
          actor_user_id?: string | null;
          created_at?: string;
          id?: string;
          ip_address?: string | null;
          metadata?: Json;
          resource_id?: string | null;
          resource_type: string;
          result?: string;
          tenant_id?: string | null;
          user_agent?: string | null;
        };
        Update: {
          action?: string;
          actor_email?: string | null;
          actor_user_id?: string | null;
          created_at?: string;
          id?: string;
          ip_address?: string | null;
          metadata?: Json;
          resource_id?: string | null;
          resource_type?: string;
          result?: string;
          tenant_id?: string | null;
          user_agent?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "audit_log_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      clients: {
        Row: {
          created_at: string;
          created_by: string;
          email: string | null;
          id: string;
          name: string;
          notes: string | null;
          phone: string | null;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          email?: string | null;
          id?: string;
          name: string;
          notes?: string | null;
          phone?: string | null;
          tenant_id?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          email?: string | null;
          id?: string;
          name?: string;
          notes?: string | null;
          phone?: string | null;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "clients_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      consents: {
        Row: {
          granted_at: string;
          id: string;
          notice_version: string;
          purpose: string;
          tenant_id: string | null;
          user_id: string;
          withdrawn_at: string | null;
        };
        Insert: {
          granted_at?: string;
          id?: string;
          notice_version: string;
          purpose: string;
          tenant_id?: string | null;
          user_id: string;
          withdrawn_at?: string | null;
        };
        Update: {
          granted_at?: string;
          id?: string;
          notice_version?: string;
          purpose?: string;
          tenant_id?: string | null;
          user_id?: string;
          withdrawn_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "consents_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      hearings: {
        Row: {
          court: string | null;
          created_at: string;
          created_by: string;
          hearing_date: string;
          hearing_time: string | null;
          id: string;
          matter_id: string | null;
          matter_title: string;
          purpose: string | null;
          status: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          court?: string | null;
          created_at?: string;
          created_by: string;
          hearing_date: string;
          hearing_time?: string | null;
          id?: string;
          matter_id?: string | null;
          matter_title: string;
          purpose?: string | null;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Update: {
          court?: string | null;
          created_at?: string;
          created_by?: string;
          hearing_date?: string;
          hearing_time?: string | null;
          id?: string;
          matter_id?: string | null;
          matter_title?: string;
          purpose?: string | null;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "hearings_matter_id_fkey";
            columns: ["matter_id"];
            isOneToOne: false;
            referencedRelation: "matters";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "hearings_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      invoices: {
        Row: {
          amount: number;
          client_id: string | null;
          client_name: string;
          created_at: string;
          created_by: string;
          due_date: string | null;
          gst_amount: number;
          id: string;
          invoice_number: string;
          matter_id: string | null;
          matter_title: string | null;
          status: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          amount: number;
          client_id?: string | null;
          client_name: string;
          created_at?: string;
          created_by: string;
          due_date?: string | null;
          gst_amount?: number;
          id?: string;
          invoice_number: string;
          matter_id?: string | null;
          matter_title?: string | null;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Update: {
          amount?: number;
          client_id?: string | null;
          client_name?: string;
          created_at?: string;
          created_by?: string;
          due_date?: string | null;
          gst_amount?: number;
          id?: string;
          invoice_number?: string;
          matter_id?: string | null;
          matter_title?: string | null;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invoices_matter_id_fkey";
            columns: ["matter_id"];
            isOneToOne: false;
            referencedRelation: "matters";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invoices_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      licenses: {
        Row: {
          created_at: string;
          current_period_end: string | null;
          id: string;
          integrations: Json;
          plan: string;
          seats: number;
          status: string;
          tenant_id: string;
          trial_ends_at: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          current_period_end?: string | null;
          id?: string;
          integrations?: Json;
          plan?: string;
          seats?: number;
          status?: string;
          tenant_id: string;
          trial_ends_at?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          current_period_end?: string | null;
          id?: string;
          integrations?: Json;
          plan?: string;
          seats?: number;
          status?: string;
          tenant_id?: string;
          trial_ends_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "licenses_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: true;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      matters: {
        Row: {
          case_number: string | null;
          client_name: string | null;
          court: string | null;
          created_at: string;
          created_by: string;
          filed_date: string | null;
          id: string;
          notes: string | null;
          opposing_party: string | null;
          status: string;
          tenant_id: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          case_number?: string | null;
          client_name?: string | null;
          court?: string | null;
          created_at?: string;
          created_by: string;
          filed_date?: string | null;
          id?: string;
          notes?: string | null;
          opposing_party?: string | null;
          status?: string;
          tenant_id?: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          case_number?: string | null;
          client_name?: string | null;
          court?: string | null;
          created_at?: string;
          created_by?: string;
          filed_date?: string | null;
          id?: string;
          notes?: string | null;
          opposing_party?: string | null;
          status?: string;
          tenant_id?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "matters_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      platform_admins: {
        Row: {
          created_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          enrolment_no: string | null;
          firm_name: string | null;
          full_name: string | null;
          id: string;
          tenant_id: string | null;
          tenant_role: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          enrolment_no?: string | null;
          firm_name?: string | null;
          full_name?: string | null;
          id: string;
          tenant_id?: string | null;
          tenant_role?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          enrolment_no?: string | null;
          firm_name?: string | null;
          full_name?: string | null;
          id?: string;
          tenant_id?: string | null;
          tenant_role?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tenant_invites: {
        Row: {
          accepted_at: string | null;
          created_at: string;
          email: string;
          expires_at: string;
          id: string;
          invited_by: string;
          role: string;
          status: string;
          tenant_id: string;
          token: string;
        };
        Insert: {
          accepted_at?: string | null;
          created_at?: string;
          email: string;
          expires_at?: string;
          id?: string;
          invited_by: string;
          role?: string;
          status?: string;
          tenant_id?: string;
          token?: string;
        };
        Update: {
          accepted_at?: string | null;
          created_at?: string;
          email?: string;
          expires_at?: string;
          id?: string;
          invited_by?: string;
          role?: string;
          status?: string;
          tenant_id?: string;
          token?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_invites_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tenants: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          slug: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          slug: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          slug?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      time_entries: {
        Row: {
          billed: boolean;
          created_at: string;
          created_by: string;
          entry_date: string;
          hours: number;
          id: string;
          matter_id: string | null;
          matter_title: string;
          rate: number;
          task: string;
          tenant_id: string;
        };
        Insert: {
          billed?: boolean;
          created_at?: string;
          created_by: string;
          entry_date?: string;
          hours: number;
          id?: string;
          matter_id?: string | null;
          matter_title: string;
          rate?: number;
          task: string;
          tenant_id?: string;
        };
        Update: {
          billed?: boolean;
          created_at?: string;
          created_by?: string;
          entry_date?: string;
          hours?: number;
          id?: string;
          matter_id?: string | null;
          matter_title?: string;
          rate?: number;
          task?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "time_entries_matter_id_fkey";
            columns: ["matter_id"];
            isOneToOne: false;
            referencedRelation: "matters";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "time_entries_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      assert_feature: { Args: { p_feature: string }; Returns: undefined };
      current_notice_version: { Args: never; Returns: string };
      current_tenant_id: { Args: never; Returns: string };
      delete_my_account: { Args: never; Returns: Json };
      export_chamber_data: { Args: never; Returns: Json };
      export_my_personal_data: { Args: never; Returns: Json };
      get_invite_info: {
        Args: { p_token: string };
        Returns: {
          email: string;
          role: string;
          tenant_name: string;
          valid: boolean;
        }[];
      };
      grant_consent: { Args: { p_purpose: string }; Returns: undefined };
      increment_ai_usage: { Args: never; Returns: number };
      is_platform_admin: { Args: { uid: string }; Returns: boolean };
      is_tenant_admin: { Args: { target_tenant: string }; Returns: boolean };
      log_auth_event: {
        Args: {
          p_action: string;
          p_actor_user_id: string;
          p_email: string;
          p_ip: string;
          p_result: string;
          p_user_agent: string;
        };
        Returns: undefined;
      };
      my_entitlements: {
        Args: never;
        Returns: {
          base_price_inr: number;
          clients_limit: number;
          extra_seat_price_inr: number;
          extra_seats: number;
          matters_limit: number;
          monthly_total_inr: number;
          ocr_enabled: boolean;
          plan: string;
          seats: number;
          seats_included: number;
          seats_used: number;
          status: string;
          storage_limit_mb: number;
          team_enabled: boolean;
          trial_days_left: number;
          trial_ends_at: string;
          trial_expired: boolean;
          trial_period_days: number;
          whatsapp_enabled: boolean;
        }[];
      };
      my_usage_summary: {
        Args: never;
        Returns: {
          plan: string;
          seats_limit: number;
          seats_used: number;
          storage_limit_mb: number;
          used_storage_mb: number;
        }[];
      };
      plan_feature: {
        Args: { p_feature: string; p_plan: string };
        Returns: boolean;
      };
      plan_limit: {
        Args: { p_plan: string; p_resource: string };
        Returns: number;
      };
      plan_price_inr: {
        Args: { p_component?: string; p_plan: string };
        Returns: number;
      };
      purge_expired_chambers: { Args: { p_dry_run?: boolean }; Returns: Json };
      remove_member: { Args: { p_user_id: string }; Returns: undefined };
      set_member_role: {
        Args: { p_role: string; p_user_id: string };
        Returns: undefined;
      };
      set_seat_count: { Args: { p_seats: number }; Returns: undefined };
      tenant_storage_estimate_mb: {
        Args: { p_tenant_id: string };
        Returns: number;
      };
      trial_expired: { Args: { p_tenant_id: string }; Returns: boolean };
      trial_period_days: { Args: never; Returns: number };
      withdraw_consent: { Args: { p_purpose: string }; Returns: undefined };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
