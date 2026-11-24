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
    PostgrestVersion: "14.18"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      clubs: {
        Row: {
          address: string | null
          brand_color: string | null
          created_at: string
          id: string
          logo_path: string | null
          name: string
          phone: string | null
          phone_country_code: string
          plan_id: string | null
          slug: string
          sports: Database["public"]["Enums"]["sport"][]
          status: Database["public"]["Enums"]["club_status"]
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string | null
          timezone: string
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          brand_color?: string | null
          created_at?: string
          id?: string
          logo_path?: string | null
          name: string
          phone?: string | null
          phone_country_code?: string
          plan_id?: string | null
          slug: string
          sports?: Database["public"]["Enums"]["sport"][]
          status?: Database["public"]["Enums"]["club_status"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          timezone?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          brand_color?: string | null
          created_at?: string
          id?: string
          logo_path?: string | null
          name?: string
          phone?: string | null
          phone_country_code?: string
          plan_id?: string | null
          slug?: string
          sports?: Database["public"]["Enums"]["sport"][]
          status?: Database["public"]["Enums"]["club_status"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          timezone?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clubs_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      court_blocks: {
        Row: {
          club_id: string
          court_id: string | null
          created_at: string
          created_by: string | null
          end_at: string
          id: string
          reason: string | null
          start_at: string
        }
        Insert: {
          club_id: string
          court_id?: string | null
          created_at?: string
          created_by?: string | null
          end_at: string
          id?: string
          reason?: string | null
          start_at: string
        }
        Update: {
          club_id?: string
          court_id?: string | null
          created_at?: string
          created_by?: string | null
          end_at?: string
          id?: string
          reason?: string | null
          start_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "court_blocks_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "court_blocks_court_id_club_id_fkey"
            columns: ["court_id", "club_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id", "club_id"]
          },
          {
            foreignKeyName: "court_blocks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profile_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "court_blocks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      court_bookings: {
        Row: {
          booked_by: string | null
          cancelled_reason: string | null
          club_id: string
          court_id: string
          created_at: string
          end_at: string
          id: string
          match_id: string
          start_at: string
          status: Database["public"]["Enums"]["booking_status"]
          updated_at: string
        }
        Insert: {
          booked_by?: string | null
          cancelled_reason?: string | null
          club_id: string
          court_id: string
          created_at?: string
          end_at: string
          id?: string
          match_id: string
          start_at: string
          status?: Database["public"]["Enums"]["booking_status"]
          updated_at?: string
        }
        Update: {
          booked_by?: string | null
          cancelled_reason?: string | null
          club_id?: string
          court_id?: string
          created_at?: string
          end_at?: string
          id?: string
          match_id?: string
          start_at?: string
          status?: Database["public"]["Enums"]["booking_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "court_bookings_booked_by_fkey"
            columns: ["booked_by"]
            isOneToOne: false
            referencedRelation: "profile_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "court_bookings_booked_by_fkey"
            columns: ["booked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "court_bookings_court_id_club_id_fkey"
            columns: ["court_id", "club_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id", "club_id"]
          },
          {
            foreignKeyName: "court_bookings_match_id_club_id_fkey"
            columns: ["match_id", "club_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id", "club_id"]
          },
        ]
      }
      court_hours: {
        Row: {
          close_time: string
          club_id: string
          court_id: string
          day_of_week: number
          id: string
          open_time: string
        }
        Insert: {
          close_time: string
          club_id: string
          court_id: string
          day_of_week: number
          id?: string
          open_time: string
        }
        Update: {
          close_time?: string
          club_id?: string
          court_id?: string
          day_of_week?: number
          id?: string
          open_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "court_hours_court_id_club_id_fkey"
            columns: ["court_id", "club_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id", "club_id"]
          },
        ]
      }
      courts: {
        Row: {
          active: boolean
          club_id: string
          created_at: string
          id: string
          name: string
          sort_order: number
          sport: Database["public"]["Enums"]["sport"]
          surface: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          club_id: string
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          sport?: Database["public"]["Enums"]["sport"]
          surface?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          club_id?: string
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          sport?: Database["public"]["Enums"]["sport"]
          surface?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "courts_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      group_members: {
        Row: {
          club_id: string
          entry_id: string
          group_id: string
          position: number | null
          round_id: string
          tournament_id: string
        }
        Insert: {
          club_id: string
          entry_id: string
          group_id: string
          position?: number | null
          round_id: string
          tournament_id: string
        }
        Update: {
          club_id?: string
          entry_id?: string
          group_id?: string
          position?: number | null
          round_id?: string
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_entry_id_tournament_id_fkey"
            columns: ["entry_id", "tournament_id"]
            isOneToOne: false
            referencedRelation: "tournament_entries"
            referencedColumns: ["id", "tournament_id"]
          },
          {
            foreignKeyName: "group_members_group_id_club_id_fkey"
            columns: ["group_id", "club_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id", "club_id"]
          },
          {
            foreignKeyName: "group_members_group_id_round_id_fkey"
            columns: ["group_id", "round_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id", "round_id"]
          },
          {
            foreignKeyName: "group_members_round_id_tournament_id_fkey"
            columns: ["round_id", "tournament_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id", "tournament_id"]
          },
        ]
      }
      groups: {
        Row: {
          club_id: string
          created_at: string
          id: string
          level: number
          name: string
          round_id: string
        }
        Insert: {
          club_id: string
          created_at?: string
          id?: string
          level: number
          name: string
          round_id: string
        }
        Update: {
          club_id?: string
          created_at?: string
          id?: string
          level?: number
          name?: string
          round_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "groups_round_id_club_id_fkey"
            columns: ["round_id", "club_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id", "club_id"]
          },
        ]
      }
      match_slot_proposals: {
        Row: {
          club_id: string
          court_id: string
          created_at: string
          end_at: string
          id: string
          match_id: string
          proposed_by: string
          responded_at: string | null
          start_at: string
          status: Database["public"]["Enums"]["proposal_status"]
        }
        Insert: {
          club_id: string
          court_id: string
          created_at?: string
          end_at: string
          id?: string
          match_id: string
          proposed_by: string
          responded_at?: string | null
          start_at: string
          status?: Database["public"]["Enums"]["proposal_status"]
        }
        Update: {
          club_id?: string
          court_id?: string
          created_at?: string
          end_at?: string
          id?: string
          match_id?: string
          proposed_by?: string
          responded_at?: string | null
          start_at?: string
          status?: Database["public"]["Enums"]["proposal_status"]
        }
        Relationships: [
          {
            foreignKeyName: "match_slot_proposals_court_id_club_id_fkey"
            columns: ["court_id", "club_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id", "club_id"]
          },
          {
            foreignKeyName: "match_slot_proposals_match_id_club_id_fkey"
            columns: ["match_id", "club_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id", "club_id"]
          },
          {
            foreignKeyName: "match_slot_proposals_proposed_by_fkey"
            columns: ["proposed_by"]
            isOneToOne: false
            referencedRelation: "profile_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_slot_proposals_proposed_by_fkey"
            columns: ["proposed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          admin_override_by: string | null
          booking_token: string
          club_id: string
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          dispute_reason: string | null
          entry_a: string
          entry_b: string
          group_id: string | null
          id: string
          reported_at: string | null
          reported_by: string | null
          result_type: Database["public"]["Enums"]["match_result_type"] | null
          round_id: string
          scheduled_at: string | null
          score: Json | null
          status: Database["public"]["Enums"]["match_status"]
          tournament_id: string
          updated_at: string
          winner_entry_id: string | null
        }
        Insert: {
          admin_override_by?: string | null
          booking_token?: string
          club_id: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          dispute_reason?: string | null
          entry_a: string
          entry_b: string
          group_id?: string | null
          id?: string
          reported_at?: string | null
          reported_by?: string | null
          result_type?: Database["public"]["Enums"]["match_result_type"] | null
          round_id: string
          scheduled_at?: string | null
          score?: Json | null
          status?: Database["public"]["Enums"]["match_status"]
          tournament_id: string
          updated_at?: string
          winner_entry_id?: string | null
        }
        Update: {
          admin_override_by?: string | null
          booking_token?: string
          club_id?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          dispute_reason?: string | null
          entry_a?: string
          entry_b?: string
          group_id?: string | null
          id?: string
          reported_at?: string | null
          reported_by?: string | null
          result_type?: Database["public"]["Enums"]["match_result_type"] | null
          round_id?: string
          scheduled_at?: string | null
          score?: Json | null
          status?: Database["public"]["Enums"]["match_status"]
          tournament_id?: string
          updated_at?: string
          winner_entry_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_admin_override_by_fkey"
            columns: ["admin_override_by"]
            isOneToOne: false
            referencedRelation: "profile_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_admin_override_by_fkey"
            columns: ["admin_override_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profile_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_entry_a_tournament_id_fkey"
            columns: ["entry_a", "tournament_id"]
            isOneToOne: false
            referencedRelation: "tournament_entries"
            referencedColumns: ["id", "tournament_id"]
          },
          {
            foreignKeyName: "matches_entry_b_tournament_id_fkey"
            columns: ["entry_b", "tournament_id"]
            isOneToOne: false
            referencedRelation: "tournament_entries"
            referencedColumns: ["id", "tournament_id"]
          },
          {
            foreignKeyName: "matches_group_id_round_id_fkey"
            columns: ["group_id", "round_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id", "round_id"]
          },
          {
            foreignKeyName: "matches_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "profile_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_round_id_club_id_fkey"
            columns: ["round_id", "club_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id", "club_id"]
          },
          {
            foreignKeyName: "matches_round_id_tournament_id_fkey"
            columns: ["round_id", "tournament_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id", "tournament_id"]
          },
        ]
      }
      notifications_log: {
        Row: {
          channel: Database["public"]["Enums"]["notification_channel"]
          club_id: string | null
          created_at: string
          dedupe_key: string
          error: string | null
          id: string
          match_id: string | null
          profile_id: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["notification_status"]
          type: string
        }
        Insert: {
          channel: Database["public"]["Enums"]["notification_channel"]
          club_id?: string | null
          created_at?: string
          dedupe_key: string
          error?: string | null
          id?: string
          match_id?: string | null
          profile_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          type: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["notification_channel"]
          club_id?: string | null
          created_at?: string
          dedupe_key?: string
          error?: string | null
          id?: string
          match_id?: string | null
          profile_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_log_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_log_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_log_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profile_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_log_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_path: string | null
          club_id: string | null
          created_at: string
          email: string | null
          first_name: string | null
          id: string
          last_name: string | null
          phone: string | null
          phone_key: string | null
          role: Database["public"]["Enums"]["user_role"]
          status: Database["public"]["Enums"]["profile_status"]
          updated_at: string
        }
        Insert: {
          avatar_path?: string | null
          club_id?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          id: string
          last_name?: string | null
          phone?: string | null
          phone_key?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["profile_status"]
          updated_at?: string
        }
        Update: {
          avatar_path?: string | null
          club_id?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          phone_key?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["profile_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_seen_at: string
          p256dh: string
          profile_id: string
          user_agent: string | null
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_seen_at?: string
          p256dh: string
          profile_id: string
          user_agent?: string | null
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_seen_at?: string
          p256dh?: string
          profile_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profile_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_subscriptions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rounds: {
        Row: {
          closed_at: string | null
          club_id: string
          created_at: string
          ends_on: string
          id: string
          name: string
          number: number
          published_at: string | null
          results_deadline: string
          starts_on: string
          status: Database["public"]["Enums"]["round_status"]
          tournament_id: string
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          club_id: string
          created_at?: string
          ends_on: string
          id?: string
          name: string
          number: number
          published_at?: string | null
          results_deadline: string
          starts_on: string
          status?: Database["public"]["Enums"]["round_status"]
          tournament_id: string
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          club_id?: string
          created_at?: string
          ends_on?: string
          id?: string
          name?: string
          number?: number
          published_at?: string | null
          results_deadline?: string
          starts_on?: string
          status?: Database["public"]["Enums"]["round_status"]
          tournament_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rounds_tournament_id_club_id_fkey"
            columns: ["tournament_id", "club_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id", "club_id"]
          },
        ]
      }
      standings_snapshots: {
        Row: {
          bonus: number
          club_id: string
          created_at: string
          entry_id: string
          games_lost: number
          games_won: number
          group_id: string
          lost: number
          lost_default: number
          movement: Database["public"]["Enums"]["group_movement"] | null
          not_played: number
          played: number
          points: number
          position: number
          round_id: string
          sets_lost: number
          sets_won: number
          won: number
          won_default: number
        }
        Insert: {
          bonus?: number
          club_id: string
          created_at?: string
          entry_id: string
          games_lost?: number
          games_won?: number
          group_id: string
          lost?: number
          lost_default?: number
          movement?: Database["public"]["Enums"]["group_movement"] | null
          not_played?: number
          played?: number
          points?: number
          position: number
          round_id: string
          sets_lost?: number
          sets_won?: number
          won?: number
          won_default?: number
        }
        Update: {
          bonus?: number
          club_id?: string
          created_at?: string
          entry_id?: string
          games_lost?: number
          games_won?: number
          group_id?: string
          lost?: number
          lost_default?: number
          movement?: Database["public"]["Enums"]["group_movement"] | null
          not_played?: number
          played?: number
          points?: number
          position?: number
          round_id?: string
          sets_lost?: number
          sets_won?: number
          won?: number
          won_default?: number
        }
        Relationships: [
          {
            foreignKeyName: "standings_snapshots_entry_id_club_id_fkey"
            columns: ["entry_id", "club_id"]
            isOneToOne: false
            referencedRelation: "tournament_entries"
            referencedColumns: ["id", "club_id"]
          },
          {
            foreignKeyName: "standings_snapshots_group_id_club_id_fkey"
            columns: ["group_id", "club_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id", "club_id"]
          },
          {
            foreignKeyName: "standings_snapshots_group_id_round_id_fkey"
            columns: ["group_id", "round_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id", "round_id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          created_at: string
          features: Json
          id: string
          max_active_tournaments: number | null
          max_players: number | null
          name: string
          price: number
          stripe_price_id: string | null
        }
        Insert: {
          created_at?: string
          features?: Json
          id?: string
          max_active_tournaments?: number | null
          max_players?: number | null
          name: string
          price?: number
          stripe_price_id?: string | null
        }
        Update: {
          created_at?: string
          features?: Json
          id?: string
          max_active_tournaments?: number | null
          max_players?: number | null
          name?: string
          price?: number
          stripe_price_id?: string | null
        }
        Relationships: []
      }
      tournament_entries: {
        Row: {
          club_id: string
          created_at: string
          id: string
          player_id: string
          seed: number | null
          status: Database["public"]["Enums"]["entry_status"]
          tournament_id: string
          updated_at: string
        }
        Insert: {
          club_id: string
          created_at?: string
          id?: string
          player_id: string
          seed?: number | null
          status?: Database["public"]["Enums"]["entry_status"]
          tournament_id: string
          updated_at?: string
        }
        Update: {
          club_id?: string
          created_at?: string
          id?: string
          player_id?: string
          seed?: number | null
          status?: Database["public"]["Enums"]["entry_status"]
          tournament_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_entries_player_id_club_id_fkey"
            columns: ["player_id", "club_id"]
            isOneToOne: false
            referencedRelation: "profile_contacts"
            referencedColumns: ["id", "club_id"]
          },
          {
            foreignKeyName: "tournament_entries_player_id_club_id_fkey"
            columns: ["player_id", "club_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "club_id"]
          },
          {
            foreignKeyName: "tournament_entries_tournament_id_club_id_fkey"
            columns: ["tournament_id", "club_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id", "club_id"]
          },
        ]
      }
      tournaments: {
        Row: {
          club_id: string
          config: Json
          created_at: string
          ends_on: string | null
          format: Database["public"]["Enums"]["tournament_format"]
          id: string
          name: string
          registration_open: boolean
          rules_pdf_path: string | null
          rules_text: string | null
          sport: Database["public"]["Enums"]["sport"]
          starts_on: string | null
          status: Database["public"]["Enums"]["tournament_status"]
          type: Database["public"]["Enums"]["tournament_type"]
          updated_at: string
        }
        Insert: {
          club_id: string
          config?: Json
          created_at?: string
          ends_on?: string | null
          format?: Database["public"]["Enums"]["tournament_format"]
          id?: string
          name: string
          registration_open?: boolean
          rules_pdf_path?: string | null
          rules_text?: string | null
          sport?: Database["public"]["Enums"]["sport"]
          starts_on?: string | null
          status?: Database["public"]["Enums"]["tournament_status"]
          type: Database["public"]["Enums"]["tournament_type"]
          updated_at?: string
        }
        Update: {
          club_id?: string
          config?: Json
          created_at?: string
          ends_on?: string | null
          format?: Database["public"]["Enums"]["tournament_format"]
          id?: string
          name?: string
          registration_open?: boolean
          rules_pdf_path?: string | null
          rules_text?: string | null
          sport?: Database["public"]["Enums"]["sport"]
          starts_on?: string | null
          status?: Database["public"]["Enums"]["tournament_status"]
          type?: Database["public"]["Enums"]["tournament_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournaments_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      profile_contacts: {
        Row: {
          club_id: string | null
          email: string | null
          id: string | null
          phone: string | null
          phone_key: string | null
        }
        Insert: {
          club_id?: string | null
          email?: never
          id?: string | null
          phone?: string | null
          phone_key?: string | null
        }
        Update: {
          club_id?: string | null
          email?: never
          id?: string | null
          phone?: string | null
          phone_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      assert_slot_valid: {
        Args: {
          p_court: string
          p_end: string
          p_match: Database["public"]["Tables"]["matches"]["Row"]
          p_start: string
        }
        Returns: undefined
      }
      can_manage_club: { Args: { p_club: string }; Returns: boolean }
      can_read_club: { Args: { p_club: string }; Returns: boolean }
      cancel_match_booking: {
        Args: { p_match: string; p_reason: string | null }
        Returns: undefined
      }
      close_round: {
        Args: {
          p_expel: string[]
          p_finish: boolean
          p_next: Json | null
          p_round: string
          p_snapshots: Json
        }
        Returns: string | null
      }
      club_is_open: { Args: { p_club: string }; Returns: boolean }
      confirm_result: { Args: { p_match: string }; Returns: undefined }
      create_court_block: {
        Args: {
          p_cancel?: boolean
          p_club: string
          p_court: string | null
          p_end: string
          p_reason: string | null
          p_start: string
        }
        Returns: Json
      }
      current_club_id: { Args: never; Returns: string }
      current_entry_ids: { Args: never; Returns: string[] }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      dispute_result: {
        Args: { p_match: string; p_reason: string }
        Returns: undefined
      }
      is_club_admin: { Args: { p_club: string }; Returns: boolean }
      is_server_role: { Args: never; Returns: boolean }
      is_superadmin: { Args: never; Returns: boolean }
      lock_open_match: {
        Args: { p_match: string }
        Returns: {
          admin_override_by: string | null
          booking_token: string
          club_id: string
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          dispute_reason: string | null
          entry_a: string
          entry_b: string
          group_id: string | null
          id: string
          reported_at: string | null
          reported_by: string | null
          result_type: Database["public"]["Enums"]["match_result_type"] | null
          round_id: string
          scheduled_at: string | null
          score: Json | null
          status: Database["public"]["Enums"]["match_status"]
          tournament_id: string
          updated_at: string
          winner_entry_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "matches"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      my_entry_in_match: {
        Args: { p_match: Database["public"]["Tables"]["matches"]["Row"] }
        Returns: string
      }
      owns_media_path: { Args: { object_name: string }; Returns: boolean }
      phone_key: { Args: { dial: string; raw: string }; Returns: string }
      propose_slot: {
        Args: { p_court: string; p_match: string; p_start: string }
        Returns: string
      }
      publish_round: { Args: { p_round: string }; Returns: number }
      report_result: {
        Args: { p_match: string; p_result: string; p_score: Json | null }
        Returns: undefined
      }
      respond_slot: {
        Args: { p_accept: boolean; p_proposal: string }
        Returns: string
      }
      revoke_user_sessions: { Args: { p_user_id: string }; Returns: undefined }
      round_is_visible: { Args: { p_round: string }; Returns: boolean }
      save_round_groups: {
        Args: { p_groups: Json; p_round: string }
        Returns: undefined
      }
      score_winner: {
        Args: { p_score: Json; p_tb10: boolean }
        Returns: string
      }
      set_court_hours: {
        Args: { p_court: string; p_hours: Json }
        Returns: undefined
      }
      shares_match_with: { Args: { p_profile: string }; Returns: boolean }
      withdraw_slot: { Args: { p_proposal: string }; Returns: undefined }
    }
    Enums: {
      booking_status: "confirmed" | "cancelled"
      club_status: "active" | "suspended" | "trial"
      entry_status:
        | "pending"
        | "accepted"
        | "rejected"
        | "withdrawn"
        | "expelled"
      group_movement: "up" | "down" | "stay" | "out"
      match_result_type: "played" | "default" | "not_played"
      match_status:
        | "pending"
        | "scheduled"
        | "reported"
        | "disputed"
        | "confirmed"
        | "not_played"
        | "cancelled"
      notification_channel: "email" | "whatsapp" | "push"
      notification_status: "pending" | "sent" | "failed" | "skipped"
      profile_status: "active" | "inactive"
      proposal_status:
        | "proposed"
        | "accepted"
        | "declined"
        | "expired"
        | "withdrawn"
      round_status: "draft" | "active" | "closed"
      sport: "tennis" | "padel"
      tournament_format: "singles"
      tournament_status: "draft" | "registration" | "active" | "finished"
      tournament_type: "ladder" | "round_robin"
      user_role: "superadmin" | "club_admin" | "player"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      booking_status: ["confirmed", "cancelled"],
      club_status: ["active", "suspended", "trial"],
      entry_status: [
        "pending",
        "accepted",
        "rejected",
        "withdrawn",
        "expelled",
      ],
      group_movement: ["up", "down", "stay", "out"],
      match_result_type: ["played", "default", "not_played"],
      match_status: [
        "pending",
        "scheduled",
        "reported",
        "disputed",
        "confirmed",
        "not_played",
        "cancelled",
      ],
      notification_channel: ["email", "whatsapp", "push"],
      notification_status: ["pending", "sent", "failed", "skipped"],
      profile_status: ["active", "inactive"],
      proposal_status: [
        "proposed",
        "accepted",
        "declined",
        "expired",
        "withdrawn",
      ],
      round_status: ["draft", "active", "closed"],
      sport: ["tennis", "padel"],
      tournament_format: ["singles"],
      tournament_status: ["draft", "registration", "active", "finished"],
      tournament_type: ["ladder", "round_robin"],
      user_role: ["superadmin", "club_admin", "player"],
    },
  },
} as const

// ── Alias de la app (conservar al regenerar con `npm run db:types`) ────────
export type UserRole = Enums<"user_role">
export type ProfileRow = Tables<"profiles">
export type ClubRow = Tables<"clubs">
export type CourtRow = Tables<"courts">
export type TournamentRow = Tables<"tournaments">
export type MatchRow = Tables<"matches">
export type RoundRow = Tables<"rounds">
export type EntryStatus = Enums<"entry_status">
export type TournamentStatus = Enums<"tournament_status">
