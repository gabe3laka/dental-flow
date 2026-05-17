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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      admin_notes: {
        Row: {
          admin_id: string
          content: string
          created_at: string
          id: string
          target_id: string
          target_type: string
        }
        Insert: {
          admin_id: string
          content: string
          created_at?: string
          id?: string
          target_id: string
          target_type: string
        }
        Update: {
          admin_id?: string
          content?: string
          created_at?: string
          id?: string
          target_id?: string
          target_type?: string
        }
        Relationships: []
      }
      automations: {
        Row: {
          action_type: string
          created_at: string
          doctor_id: string
          enabled: boolean
          id: string
          message_template: string | null
          name: string
          trigger_days: number
          trigger_type: string
        }
        Insert: {
          action_type?: string
          created_at?: string
          doctor_id: string
          enabled?: boolean
          id?: string
          message_template?: string | null
          name: string
          trigger_days?: number
          trigger_type?: string
        }
        Update: {
          action_type?: string
          created_at?: string
          doctor_id?: string
          enabled?: boolean
          id?: string
          message_template?: string | null
          name?: string
          trigger_days?: number
          trigger_type?: string
        }
        Relationships: []
      }
      consult_requests: {
        Row: {
          concern_text: string | null
          doctor_id: string
          id: string
          patient_email: string
          patient_name: string
          replied_at: string | null
          reply_video_url: string | null
          scan_video_url: string | null
          status: string
          submitted_at: string
        }
        Insert: {
          concern_text?: string | null
          doctor_id: string
          id?: string
          patient_email: string
          patient_name: string
          replied_at?: string | null
          reply_video_url?: string | null
          scan_video_url?: string | null
          status?: string
          submitted_at?: string
        }
        Update: {
          concern_text?: string | null
          doctor_id?: string
          id?: string
          patient_email?: string
          patient_name?: string
          replied_at?: string | null
          reply_video_url?: string | null
          scan_video_url?: string | null
          status?: string
          submitted_at?: string
        }
        Relationships: []
      }
      doctor_availability: {
        Row: {
          created_at: string
          day_of_week: string
          doctor_id: string
          id: string
          is_active: boolean
          start_time: string
        }
        Insert: {
          created_at?: string
          day_of_week: string
          doctor_id: string
          id?: string
          is_active?: boolean
          start_time: string
        }
        Update: {
          created_at?: string
          day_of_week?: string
          doctor_id?: string
          id?: string
          is_active?: boolean
          start_time?: string
        }
        Relationships: []
      }
      feature_flags: {
        Row: {
          created_at: string
          description: string | null
          enabled: boolean
          flag_key: string
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          flag_key: string
          id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          flag_key?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      impersonation_log: {
        Row: {
          admin_id: string
          ended_at: string | null
          id: string
          reason: string | null
          started_at: string
          target_user_id: string
        }
        Insert: {
          admin_id: string
          ended_at?: string | null
          id?: string
          reason?: string | null
          started_at?: string
          target_user_id: string
        }
        Update: {
          admin_id?: string
          ended_at?: string | null
          id?: string
          reason?: string | null
          started_at?: string
          target_user_id?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          attachment_url: string | null
          content: string | null
          created_at: string
          id: string
          message_type: Database["public"]["Enums"]["message_type"] | null
          read_at: string | null
          receiver_id: string
          sender_id: string
        }
        Insert: {
          attachment_url?: string | null
          content?: string | null
          created_at?: string
          id?: string
          message_type?: Database["public"]["Enums"]["message_type"] | null
          read_at?: string | null
          receiver_id: string
          sender_id: string
        }
        Update: {
          attachment_url?: string | null
          content?: string | null
          created_at?: string
          id?: string
          message_type?: Database["public"]["Enums"]["message_type"] | null
          read_at?: string | null
          receiver_id?: string
          sender_id?: string
        }
        Relationships: []
      }
      patients: {
        Row: {
          assigned_doctor_id: string | null
          compliance_streak: number | null
          created_at: string
          current_stage: number | null
          device_linked: boolean | null
          device_paired_at: string | null
          estimated_cost: number | null
          estimated_end_date: string | null
          id: string
          notes: string | null
          pairing_code: string | null
          start_date: string | null
          total_scans: number | null
          total_stages: number | null
          treatment_category: string | null
          treatment_type: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_doctor_id?: string | null
          compliance_streak?: number | null
          created_at?: string
          current_stage?: number | null
          device_linked?: boolean | null
          device_paired_at?: string | null
          estimated_cost?: number | null
          estimated_end_date?: string | null
          id?: string
          notes?: string | null
          pairing_code?: string | null
          start_date?: string | null
          total_scans?: number | null
          total_stages?: number | null
          treatment_category?: string | null
          treatment_type?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_doctor_id?: string | null
          compliance_streak?: number | null
          created_at?: string
          current_stage?: number | null
          device_linked?: boolean | null
          device_paired_at?: string | null
          estimated_cost?: number | null
          estimated_end_date?: string | null
          id?: string
          notes?: string | null
          pairing_code?: string | null
          start_date?: string | null
          total_scans?: number | null
          total_stages?: number | null
          treatment_category?: string | null
          treatment_type?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      platform_announcements: {
        Row: {
          active: boolean
          audience: string
          content: string
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          title: string
        }
        Insert: {
          active?: boolean
          audience?: string
          content: string
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          title: string
        }
        Update: {
          active?: boolean
          audience?: string
          content?: string
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          title?: string
        }
        Relationships: []
      }
      practice_analytics: {
        Row: {
          active_patients: number | null
          created_at: string
          date: string
          doctor_id: string
          id: string
          messages_sent: number | null
          scans_reviewed: number | null
          visits_avoided: number | null
        }
        Insert: {
          active_patients?: number | null
          created_at?: string
          date: string
          doctor_id: string
          id?: string
          messages_sent?: number | null
          scans_reviewed?: number | null
          visits_avoided?: number | null
        }
        Update: {
          active_patients?: number | null
          created_at?: string
          date?: string
          doctor_id?: string
          id?: string
          messages_sent?: number | null
          scans_reviewed?: number | null
          visits_avoided?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          doctor_slug: string | null
          full_name: string | null
          id: string
          onboarding_completed: boolean | null
          practice_name: string | null
          practice_setup_completed: boolean | null
          rating: number | null
          specialty: string | null
          suspended: boolean | null
          suspension_reason: string | null
          total_patients: number | null
          trial_ends_at: string | null
          updated_at: string
          user_id: string
          years_practice: number | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          doctor_slug?: string | null
          full_name?: string | null
          id?: string
          onboarding_completed?: boolean | null
          practice_name?: string | null
          practice_setup_completed?: boolean | null
          rating?: number | null
          specialty?: string | null
          suspended?: boolean | null
          suspension_reason?: string | null
          total_patients?: number | null
          trial_ends_at?: string | null
          updated_at?: string
          user_id: string
          years_practice?: number | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          doctor_slug?: string | null
          full_name?: string | null
          id?: string
          onboarding_completed?: boolean | null
          practice_name?: string | null
          practice_setup_completed?: boolean | null
          rating?: number | null
          specialty?: string | null
          suspended?: boolean | null
          suspension_reason?: string | null
          total_patients?: number | null
          trial_ends_at?: string | null
          updated_at?: string
          user_id?: string
          years_practice?: number | null
        }
        Relationships: []
      }
      progress_shares: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          patient_id: string
          share_token: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          patient_id: string
          share_token?: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          patient_id?: string
          share_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "progress_shares_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      progress_snapshots: {
        Row: {
          computed_at: string
          from_scan_id: string
          id: string
          patient_id: string
          per_tooth: Json
          summary: Json | null
          to_scan_id: string
        }
        Insert: {
          computed_at?: string
          from_scan_id: string
          id?: string
          patient_id: string
          per_tooth?: Json
          summary?: Json | null
          to_scan_id: string
        }
        Update: {
          computed_at?: string
          from_scan_id?: string
          id?: string
          patient_id?: string
          per_tooth?: Json
          summary?: Json | null
          to_scan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "progress_snapshots_from_scan_id_fkey"
            columns: ["from_scan_id"]
            isOneToOne: false
            referencedRelation: "scans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "progress_snapshots_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "progress_snapshots_to_scan_id_fkey"
            columns: ["to_scan_id"]
            isOneToOne: false
            referencedRelation: "scans"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          created_at: string
          from_doctor_id: string
          id: string
          patient_id: string
          reason: string | null
          status: string
          to_doctor_id: string | null
          urgency: string
        }
        Insert: {
          created_at?: string
          from_doctor_id: string
          id?: string
          patient_id: string
          reason?: string | null
          status?: string
          to_doctor_id?: string | null
          urgency?: string
        }
        Update: {
          created_at?: string
          from_doctor_id?: string
          id?: string
          patient_id?: string
          reason?: string | null
          status?: string
          to_doctor_id?: string | null
          urgency?: string
        }
        Relationships: [
          {
            foreignKeyName: "referrals_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      scan_reviews: {
        Row: {
          action_type: Database["public"]["Enums"]["action_type"] | null
          ai_analysis: Json | null
          comments: Json
          created_at: string
          doctor_id: string
          id: string
          response_video_url: string | null
          review_notes: string | null
          reviewed_at: string
          scan_id: string
          video_duration_ms: number | null
        }
        Insert: {
          action_type?: Database["public"]["Enums"]["action_type"] | null
          ai_analysis?: Json | null
          comments?: Json
          created_at?: string
          doctor_id: string
          id?: string
          response_video_url?: string | null
          review_notes?: string | null
          reviewed_at?: string
          scan_id: string
          video_duration_ms?: number | null
        }
        Update: {
          action_type?: Database["public"]["Enums"]["action_type"] | null
          ai_analysis?: Json | null
          comments?: Json
          created_at?: string
          doctor_id?: string
          id?: string
          response_video_url?: string | null
          review_notes?: string | null
          reviewed_at?: string
          scan_id?: string
          video_duration_ms?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "scan_reviews_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "scans"
            referencedColumns: ["id"]
          },
        ]
      }
      scan_shares: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          scan_id: string
          share_token: string
          shared_by: string
          viewed_at: string | null
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          scan_id: string
          share_token?: string
          shared_by: string
          viewed_at?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          scan_id?: string
          share_token?: string
          shared_by?: string
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scan_shares_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "scans"
            referencedColumns: ["id"]
          },
        ]
      }
      scans: {
        Row: {
          ai_analysis: Json | null
          created_at: string
          detection_tags: Json | null
          doctor_review_id: string | null
          generation_engine: string | null
          generation_error: string | null
          generation_job_id: string | null
          generation_started_at: string | null
          generation_status: string | null
          generative_assets: Json | null
          generative_glb_url: string | null
          generative_saved_to_record: boolean | null
          generative_scene_url: string | null
          id: string
          lingbot_metrics: Json | null
          patient_id: string
          patient_note: string | null
          pointcloud_url: string | null
          processing_error: string | null
          processing_status: string | null
          quality_score: number | null
          raw_video_url: string | null
          reconstructed_at: string | null
          reference_board_url: string | null
          runpod_job_id: string | null
          runpod_splat_job_id: string | null
          scan_type: string | null
          sent_to_doctor: boolean | null
          sent_to_doctor_at: string | null
          source: string | null
          splat_metrics: Json | null
          splat_processing_error: string | null
          splat_processing_status: string | null
          splat_reconstructed_at: string | null
          splat_url: string | null
          status: Database["public"]["Enums"]["scan_status"]
          submitted_at: string
          thumbnail_url: string | null
          video_url: string | null
          zones_captured: Json | null
        }
        Insert: {
          ai_analysis?: Json | null
          created_at?: string
          detection_tags?: Json | null
          doctor_review_id?: string | null
          generation_engine?: string | null
          generation_error?: string | null
          generation_job_id?: string | null
          generation_started_at?: string | null
          generation_status?: string | null
          generative_assets?: Json | null
          generative_glb_url?: string | null
          generative_saved_to_record?: boolean | null
          generative_scene_url?: string | null
          id?: string
          lingbot_metrics?: Json | null
          patient_id: string
          patient_note?: string | null
          pointcloud_url?: string | null
          processing_error?: string | null
          processing_status?: string | null
          quality_score?: number | null
          raw_video_url?: string | null
          reconstructed_at?: string | null
          reference_board_url?: string | null
          runpod_job_id?: string | null
          runpod_splat_job_id?: string | null
          scan_type?: string | null
          sent_to_doctor?: boolean | null
          sent_to_doctor_at?: string | null
          source?: string | null
          splat_metrics?: Json | null
          splat_processing_error?: string | null
          splat_processing_status?: string | null
          splat_reconstructed_at?: string | null
          splat_url?: string | null
          status?: Database["public"]["Enums"]["scan_status"]
          submitted_at?: string
          thumbnail_url?: string | null
          video_url?: string | null
          zones_captured?: Json | null
        }
        Update: {
          ai_analysis?: Json | null
          created_at?: string
          detection_tags?: Json | null
          doctor_review_id?: string | null
          generation_engine?: string | null
          generation_error?: string | null
          generation_job_id?: string | null
          generation_started_at?: string | null
          generation_status?: string | null
          generative_assets?: Json | null
          generative_glb_url?: string | null
          generative_saved_to_record?: boolean | null
          generative_scene_url?: string | null
          id?: string
          lingbot_metrics?: Json | null
          patient_id?: string
          patient_note?: string | null
          pointcloud_url?: string | null
          processing_error?: string | null
          processing_status?: string | null
          quality_score?: number | null
          raw_video_url?: string | null
          reconstructed_at?: string | null
          reference_board_url?: string | null
          runpod_job_id?: string | null
          runpod_splat_job_id?: string | null
          scan_type?: string | null
          sent_to_doctor?: boolean | null
          sent_to_doctor_at?: string | null
          source?: string | null
          splat_metrics?: Json | null
          splat_processing_error?: string | null
          splat_processing_status?: string | null
          splat_reconstructed_at?: string | null
          splat_url?: string | null
          status?: Database["public"]["Enums"]["scan_status"]
          submitted_at?: string
          thumbnail_url?: string | null
          video_url?: string | null
          zones_captured?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "scans_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          doctor_id: string
          id: string
          plan_tier: Database["public"]["Enums"]["plan_tier"]
          status: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          doctor_id: string
          id?: string
          plan_tier?: Database["public"]["Enums"]["plan_tier"]
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          doctor_id?: string
          id?: string
          plan_tier?: Database["public"]["Enums"]["plan_tier"]
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      team_invites: {
        Row: {
          accepted_at: string | null
          id: string
          invited_at: string
          invited_email: string
          practice_id: string
          role: string
        }
        Insert: {
          accepted_at?: string | null
          id?: string
          invited_at?: string
          invited_email: string
          practice_id: string
          role?: string
        }
        Update: {
          accepted_at?: string | null
          id?: string
          invited_at?: string
          invited_email?: string
          practice_id?: string
          role?: string
        }
        Relationships: []
      }
      treatment_milestones: {
        Row: {
          completed_at: string | null
          created_at: string
          description: string | null
          id: string
          patient_id: string
          target_date: string | null
          title: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          patient_id: string
          target_date?: string | null
          title: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          patient_id?: string
          target_date?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "treatment_milestones_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      treatment_plans: {
        Row: {
          appliance_type: string | null
          created_at: string
          doctor_id: string
          id: string
          patient_id: string
          plan_data: Json | null
          updated_at: string
        }
        Insert: {
          appliance_type?: string | null
          created_at?: string
          doctor_id: string
          id?: string
          patient_id: string
          plan_data?: Json | null
          updated_at?: string
        }
        Update: {
          appliance_type?: string | null
          created_at?: string
          doctor_id?: string
          id?: string
          patient_id?: string
          plan_data?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "treatment_plans_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          id: string
          pref_key: string
          pref_value: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          id?: string
          pref_key: string
          pref_value?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          id?: string
          pref_key?: string
          pref_value?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_assigned_doctor_for_user: {
        Args: { _patient_user_id: string }
        Returns: string
      }
      get_patient_id_for_user: { Args: { _user_id: string }; Returns: string }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_assigned_doctor: {
        Args: { _doctor_user_id: string; _patient_id: string }
        Returns: boolean
      }
      list_stale_storage_objects: {
        Args: { _bucket_id: string; _limit?: number; _older_than: string }
        Returns: {
          name: string
        }[]
      }
    }
    Enums: {
      action_type:
        | "schedule_visit"
        | "rescan_needed"
        | "compliance_check"
        | "none"
      app_role: "admin" | "doctor" | "patient"
      message_type: "text" | "video" | "scan_attachment"
      plan_tier: "starter" | "growth" | "enterprise"
      scan_status: "pending" | "reviewed" | "flagged" | "action_required"
      subscription_status: "active" | "past_due" | "canceled" | "trialing"
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
      action_type: [
        "schedule_visit",
        "rescan_needed",
        "compliance_check",
        "none",
      ],
      app_role: ["admin", "doctor", "patient"],
      message_type: ["text", "video", "scan_attachment"],
      plan_tier: ["starter", "growth", "enterprise"],
      scan_status: ["pending", "reviewed", "flagged", "action_required"],
      subscription_status: ["active", "past_due", "canceled", "trialing"],
    },
  },
} as const
