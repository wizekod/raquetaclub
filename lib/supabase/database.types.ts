/**
 * Tipos de la base. Escritos a mano con el MISMO formato que genera
 * `npx supabase gen types typescript --linked > lib/supabase/database.types.ts`;
 * en cuanto el proyecto esté enlazado, se regeneran con ese comando y se
 * conservan los alias del final.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      subscription_plans: {
        Row: {
          id: string
          name: string
          stripe_price_id: string | null
          max_players: number | null
          max_active_tournaments: number | null
          price: number
          features: Json
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          stripe_price_id?: string | null
          max_players?: number | null
          max_active_tournaments?: number | null
          price?: number
          features?: Json
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          stripe_price_id?: string | null
          max_players?: number | null
          max_active_tournaments?: number | null
          price?: number
          features?: Json
          created_at?: string
        }
        Relationships: []
      }
      clubs: {
        Row: {
          id: string
          slug: string
          name: string
          timezone: string
          phone_country_code: string
          logo_path: string | null
          brand_color: string | null
          phone: string | null
          address: string | null
          sports: Database["public"]["Enums"]["sport"][]
          status: Database["public"]["Enums"]["club_status"]
          plan_id: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string | null
          trial_ends_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          slug: string
          name: string
          timezone?: string
          phone_country_code?: string
          logo_path?: string | null
          brand_color?: string | null
          phone?: string | null
          address?: string | null
          sports?: Database["public"]["Enums"]["sport"][]
          status?: Database["public"]["Enums"]["club_status"]
          plan_id?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          trial_ends_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          slug?: string
          name?: string
          timezone?: string
          phone_country_code?: string
          logo_path?: string | null
          brand_color?: string | null
          phone?: string | null
          address?: string | null
          sports?: Database["public"]["Enums"]["sport"][]
          status?: Database["public"]["Enums"]["club_status"]
          plan_id?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          trial_ends_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["user_role"]
          club_id: string | null
          first_name: string | null
          last_name: string | null
          email: string | null
          phone: string | null
          phone_key: string | null
          avatar_path: string | null
          status: Database["public"]["Enums"]["profile_status"]
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          role?: Database["public"]["Enums"]["user_role"]
          club_id?: string | null
          first_name?: string | null
          last_name?: string | null
          email?: string | null
          phone?: string | null
          phone_key?: string | null
          avatar_path?: string | null
          status?: Database["public"]["Enums"]["profile_status"]
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          club_id?: string | null
          first_name?: string | null
          last_name?: string | null
          email?: string | null
          phone?: string | null
          phone_key?: string | null
          avatar_path?: string | null
          status?: Database["public"]["Enums"]["profile_status"]
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      courts: {
        Row: {
          id: string
          club_id: string
          name: string
          sport: Database["public"]["Enums"]["sport"]
          surface: string | null
          active: boolean
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          club_id: string
          name: string
          sport?: Database["public"]["Enums"]["sport"]
          surface?: string | null
          active?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          club_id?: string
          name?: string
          sport?: Database["public"]["Enums"]["sport"]
          surface?: string | null
          active?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      court_hours: {
        Row: {
          id: string
          club_id: string
          court_id: string
          day_of_week: number
          open_time: string
          close_time: string
        }
        Insert: {
          id?: string
          club_id: string
          court_id: string
          day_of_week: number
          open_time: string
          close_time: string
        }
        Update: {
          id?: string
          club_id?: string
          court_id?: string
          day_of_week?: number
          open_time?: string
          close_time?: string
        }
        Relationships: []
      }
      court_blocks: {
        Row: {
          id: string
          club_id: string
          court_id: string | null
          start_at: string
          end_at: string
          reason: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          club_id: string
          court_id?: string | null
          start_at: string
          end_at: string
          reason?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          club_id?: string
          court_id?: string | null
          start_at?: string
          end_at?: string
          reason?: string | null
          created_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      court_bookings: {
        Row: {
          id: string
          club_id: string
          court_id: string
          match_id: string
          start_at: string
          end_at: string
          status: Database["public"]["Enums"]["booking_status"]
          booked_by: string | null
          cancelled_reason: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          club_id: string
          court_id: string
          match_id: string
          start_at: string
          end_at: string
          status?: Database["public"]["Enums"]["booking_status"]
          booked_by?: string | null
          cancelled_reason?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          club_id?: string
          court_id?: string
          match_id?: string
          start_at?: string
          end_at?: string
          status?: Database["public"]["Enums"]["booking_status"]
          booked_by?: string | null
          cancelled_reason?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      tournaments: {
        Row: {
          id: string
          club_id: string
          name: string
          type: Database["public"]["Enums"]["tournament_type"]
          sport: Database["public"]["Enums"]["sport"]
          format: Database["public"]["Enums"]["tournament_format"]
          status: Database["public"]["Enums"]["tournament_status"]
          starts_on: string | null
          ends_on: string | null
          registration_open: boolean
          rules_text: string | null
          rules_pdf_path: string | null
          config: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          club_id: string
          name: string
          type: Database["public"]["Enums"]["tournament_type"]
          sport?: Database["public"]["Enums"]["sport"]
          format?: Database["public"]["Enums"]["tournament_format"]
          status?: Database["public"]["Enums"]["tournament_status"]
          starts_on?: string | null
          ends_on?: string | null
          registration_open?: boolean
          rules_text?: string | null
          rules_pdf_path?: string | null
          config?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          club_id?: string
          name?: string
          type?: Database["public"]["Enums"]["tournament_type"]
          sport?: Database["public"]["Enums"]["sport"]
          format?: Database["public"]["Enums"]["tournament_format"]
          status?: Database["public"]["Enums"]["tournament_status"]
          starts_on?: string | null
          ends_on?: string | null
          registration_open?: boolean
          rules_text?: string | null
          rules_pdf_path?: string | null
          config?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      tournament_entries: {
        Row: {
          id: string
          club_id: string
          tournament_id: string
          player_id: string
          status: Database["public"]["Enums"]["entry_status"]
          seed: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          club_id: string
          tournament_id: string
          player_id: string
          status?: Database["public"]["Enums"]["entry_status"]
          seed?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          club_id?: string
          tournament_id?: string
          player_id?: string
          status?: Database["public"]["Enums"]["entry_status"]
          seed?: number | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      rounds: {
        Row: {
          id: string
          club_id: string
          tournament_id: string
          number: number
          name: string
          starts_on: string
          ends_on: string
          results_deadline: string
          status: Database["public"]["Enums"]["round_status"]
          published_at: string | null
          closed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          club_id: string
          tournament_id: string
          number: number
          name: string
          starts_on: string
          ends_on: string
          results_deadline: string
          status?: Database["public"]["Enums"]["round_status"]
          published_at?: string | null
          closed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          club_id?: string
          tournament_id?: string
          number?: number
          name?: string
          starts_on?: string
          ends_on?: string
          results_deadline?: string
          status?: Database["public"]["Enums"]["round_status"]
          published_at?: string | null
          closed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      groups: {
        Row: {
          id: string
          club_id: string
          round_id: string
          level: number
          name: string
          created_at: string
        }
        Insert: {
          id?: string
          club_id: string
          round_id: string
          level: number
          name: string
          created_at?: string
        }
        Update: {
          id?: string
          club_id?: string
          round_id?: string
          level?: number
          name?: string
          created_at?: string
        }
        Relationships: []
      }
      group_members: {
        Row: {
          club_id: string
          tournament_id: string
          round_id: string
          group_id: string
          entry_id: string
          position: number | null
        }
        Insert: {
          club_id: string
          tournament_id: string
          round_id: string
          group_id: string
          entry_id: string
          position?: number | null
        }
        Update: {
          club_id?: string
          tournament_id?: string
          round_id?: string
          group_id?: string
          entry_id?: string
          position?: number | null
        }
        Relationships: []
      }
      matches: {
        Row: {
          id: string
          club_id: string
          tournament_id: string
          round_id: string
          group_id: string | null
          entry_a: string
          entry_b: string
          status: Database["public"]["Enums"]["match_status"]
          scheduled_at: string | null
          booking_token: string
          winner_entry_id: string | null
          score: Json | null
          result_type: Database["public"]["Enums"]["match_result_type"] | null
          reported_by: string | null
          reported_at: string | null
          confirmed_by: string | null
          confirmed_at: string | null
          dispute_reason: string | null
          admin_override_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          club_id: string
          tournament_id: string
          round_id: string
          group_id?: string | null
          entry_a: string
          entry_b: string
          status?: Database["public"]["Enums"]["match_status"]
          scheduled_at?: string | null
          booking_token?: string
          winner_entry_id?: string | null
          score?: Json | null
          result_type?: Database["public"]["Enums"]["match_result_type"] | null
          reported_by?: string | null
          reported_at?: string | null
          confirmed_by?: string | null
          confirmed_at?: string | null
          dispute_reason?: string | null
          admin_override_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          club_id?: string
          tournament_id?: string
          round_id?: string
          group_id?: string | null
          entry_a?: string
          entry_b?: string
          status?: Database["public"]["Enums"]["match_status"]
          scheduled_at?: string | null
          booking_token?: string
          winner_entry_id?: string | null
          score?: Json | null
          result_type?: Database["public"]["Enums"]["match_result_type"] | null
          reported_by?: string | null
          reported_at?: string | null
          confirmed_by?: string | null
          confirmed_at?: string | null
          dispute_reason?: string | null
          admin_override_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      match_slot_proposals: {
        Row: {
          id: string
          club_id: string
          match_id: string
          proposed_by: string
          court_id: string
          start_at: string
          end_at: string
          status: Database["public"]["Enums"]["proposal_status"]
          responded_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          club_id: string
          match_id: string
          proposed_by: string
          court_id: string
          start_at: string
          end_at: string
          status?: Database["public"]["Enums"]["proposal_status"]
          responded_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          club_id?: string
          match_id?: string
          proposed_by?: string
          court_id?: string
          start_at?: string
          end_at?: string
          status?: Database["public"]["Enums"]["proposal_status"]
          responded_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      standings_snapshots: {
        Row: {
          club_id: string
          round_id: string
          group_id: string
          entry_id: string
          position: number
          played: number
          won: number
          won_default: number
          lost: number
          lost_default: number
          not_played: number
          sets_won: number
          sets_lost: number
          games_won: number
          games_lost: number
          bonus: number
          points: number
          movement: Database["public"]["Enums"]["group_movement"] | null
          created_at: string
        }
        Insert: {
          club_id: string
          round_id: string
          group_id: string
          entry_id: string
          position: number
          played?: number
          won?: number
          won_default?: number
          lost?: number
          lost_default?: number
          not_played?: number
          sets_won?: number
          sets_lost?: number
          games_won?: number
          games_lost?: number
          bonus?: number
          points?: number
          movement?: Database["public"]["Enums"]["group_movement"] | null
          created_at?: string
        }
        Update: {
          club_id?: string
          round_id?: string
          group_id?: string
          entry_id?: string
          position?: number
          played?: number
          won?: number
          won_default?: number
          lost?: number
          lost_default?: number
          not_played?: number
          sets_won?: number
          sets_lost?: number
          games_won?: number
          games_lost?: number
          bonus?: number
          points?: number
          movement?: Database["public"]["Enums"]["group_movement"] | null
          created_at?: string
        }
        Relationships: []
      }
      notifications_log: {
        Row: {
          id: string
          club_id: string | null
          match_id: string | null
          profile_id: string | null
          channel: Database["public"]["Enums"]["notification_channel"]
          type: string
          dedupe_key: string
          status: Database["public"]["Enums"]["notification_status"]
          error: string | null
          sent_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          club_id?: string | null
          match_id?: string | null
          profile_id?: string | null
          channel: Database["public"]["Enums"]["notification_channel"]
          type: string
          dedupe_key: string
          status?: Database["public"]["Enums"]["notification_status"]
          error?: string | null
          sent_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          club_id?: string | null
          match_id?: string | null
          profile_id?: string | null
          channel?: Database["public"]["Enums"]["notification_channel"]
          type?: string
          dedupe_key?: string
          status?: Database["public"]["Enums"]["notification_status"]
          error?: string | null
          sent_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          id: string
          profile_id: string
          endpoint: string
          p256dh: string
          auth: string
          user_agent: string | null
          created_at: string
          last_seen_at: string
        }
        Insert: {
          id?: string
          profile_id: string
          endpoint: string
          p256dh: string
          auth: string
          user_agent?: string | null
          created_at?: string
          last_seen_at?: string
        }
        Update: {
          id?: string
          profile_id?: string
          endpoint?: string
          p256dh?: string
          auth?: string
          user_agent?: string | null
          created_at?: string
          last_seen_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      profile_contacts: {
        Row: {
          id: string | null
          club_id: string | null
          email: string | null
          phone: string | null
          phone_key: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      can_manage_club: {
        Args: { p_club: string }
        Returns: boolean
      }
      can_read_club: {
        Args: { p_club: string }
        Returns: boolean
      }
      current_club_id: {
        Args: never
        Returns: string
      }
      current_entry_ids: {
        Args: never
        Returns: string[]
      }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      is_club_admin: {
        Args: { p_club: string }
        Returns: boolean
      }
      is_server_role: {
        Args: never
        Returns: boolean
      }
      is_superadmin: {
        Args: never
        Returns: boolean
      }
      owns_media_path: {
        Args: { object_name: string }
        Returns: boolean
      }
      phone_key: {
        Args: { raw: string; dial: string }
        Returns: string
      }
      round_is_visible: {
        Args: { p_round: string }
        Returns: boolean
      }
      shares_match_with: {
        Args: { p_profile: string }
        Returns: boolean
      }
    }
    Enums: {
      user_role: "superadmin" | "club_admin" | "player"
      club_status: "active" | "suspended" | "trial"
      profile_status: "active" | "inactive"
      sport: "tennis" | "padel"
      tournament_type: "ladder" | "round_robin"
      tournament_format: "singles"
      tournament_status: "draft" | "registration" | "active" | "finished"
      entry_status: "pending" | "accepted" | "rejected" | "withdrawn" | "expelled"
      round_status: "draft" | "active" | "closed"
      match_status: "pending" | "scheduled" | "reported" | "disputed" | "confirmed" | "not_played" | "cancelled"
      match_result_type: "played" | "default" | "not_played"
      booking_status: "confirmed" | "cancelled"
      proposal_status: "proposed" | "accepted" | "declined" | "expired" | "withdrawn"
      group_movement: "up" | "down" | "stay" | "out"
      notification_channel: "email" | "whatsapp" | "push"
      notification_status: "pending" | "sent" | "failed" | "skipped"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database["public"]

export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"]
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"]
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"]
export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T]

export const Constants = {
  public: {
    Enums: {
      user_role: ["superadmin", "club_admin", "player"],
      club_status: ["active", "suspended", "trial"],
      profile_status: ["active", "inactive"],
      sport: ["tennis", "padel"],
      tournament_type: ["ladder", "round_robin"],
      tournament_format: ["singles"],
      tournament_status: ["draft", "registration", "active", "finished"],
      entry_status: ["pending", "accepted", "rejected", "withdrawn", "expelled"],
      round_status: ["draft", "active", "closed"],
      match_status: ["pending", "scheduled", "reported", "disputed", "confirmed", "not_played", "cancelled"],
      match_result_type: ["played", "default", "not_played"],
      booking_status: ["confirmed", "cancelled"],
      proposal_status: ["proposed", "accepted", "declined", "expired", "withdrawn"],
      group_movement: ["up", "down", "stay", "out"],
      notification_channel: ["email", "whatsapp", "push"],
      notification_status: ["pending", "sent", "failed", "skipped"],
    },
  },
} as const

// ── Alias de la app (conservar al regenerar) ───────────────────────────────
export type UserRole = Enums<"user_role">
export type ProfileRow = Tables<"profiles">
export type ClubRow = Tables<"clubs">
export type CourtRow = Tables<"courts">
export type TournamentRow = Tables<"tournaments">
export type MatchRow = Tables<"matches">
