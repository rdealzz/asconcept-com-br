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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_notifications: {
        Row: {
          color_label: string | null
          created_at: string
          id: string
          kind: string
          message: string
          order_number: string | null
          payload: Json
          previous_qty: number | null
          product_id: string | null
          product_name: string
          read_at: string | null
          requested_qty: number | null
          size: string | null
          sku: string | null
        }
        Insert: {
          color_label?: string | null
          created_at?: string
          id?: string
          kind: string
          message: string
          order_number?: string | null
          payload?: Json
          previous_qty?: number | null
          product_id?: string | null
          product_name?: string
          read_at?: string | null
          requested_qty?: number | null
          size?: string | null
          sku?: string | null
        }
        Update: {
          color_label?: string | null
          created_at?: string
          id?: string
          kind?: string
          message?: string
          order_number?: string | null
          payload?: Json
          previous_qty?: number | null
          product_id?: string | null
          product_name?: string
          read_at?: string | null
          requested_qty?: number | null
          size?: string | null
          sku?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_notifications_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_uses: {
        Row: {
          code: string
          id: string
          order_id: string | null
          used_at: string
          user_id: string
        }
        Insert: {
          code: string
          id?: string
          order_id?: string | null
          used_at?: string
          user_id: string
        }
        Update: {
          code?: string
          id?: string
          order_id?: string | null
          used_at?: string
          user_id?: string
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      manual_customers: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string | null
          phone: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          name?: string | null
          phone?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string | null
          phone?: string | null
        }
        Relationships: []
      }
      newsletter_subscribers: {
        Row: {
          created_at: string
          email: string
          id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          address: Json
          coupon_code: string | null
          created_at: string
          customer_email: string
          customer_name: string | null
          customer_phone: string | null
          delivered_mail_sent: boolean
          discount: number
          id: string
          installments: number | null
          items: Json
          mail_sent: boolean
          mp_payment_id: string | null
          mp_status: string | null
          order_number: string
          payment_method: string
          preparation_mail_sent: boolean
          shipped_mail_sent: boolean
          shipping_cost: number
          status: string
          stock_decremented: boolean
          stripe_session_id: string | null
          subtotal: number
          total: number
          tracking_code: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address?: Json
          coupon_code?: string | null
          created_at?: string
          customer_email: string
          customer_name?: string | null
          customer_phone?: string | null
          delivered_mail_sent?: boolean
          discount?: number
          id?: string
          installments?: number | null
          items?: Json
          mail_sent?: boolean
          mp_payment_id?: string | null
          mp_status?: string | null
          order_number: string
          payment_method: string
          preparation_mail_sent?: boolean
          shipped_mail_sent?: boolean
          shipping_cost?: number
          status?: string
          stock_decremented?: boolean
          stripe_session_id?: string | null
          subtotal?: number
          total?: number
          tracking_code?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address?: Json
          coupon_code?: string | null
          created_at?: string
          customer_email?: string
          customer_name?: string | null
          customer_phone?: string | null
          delivered_mail_sent?: boolean
          discount?: number
          id?: string
          installments?: number | null
          items?: Json
          mail_sent?: boolean
          mp_payment_id?: string | null
          mp_status?: string | null
          order_number?: string
          payment_method?: string
          preparation_mail_sent?: boolean
          shipped_mail_sent?: boolean
          shipping_cost?: number
          status?: string
          stock_decremented?: boolean
          stripe_session_id?: string | null
          subtotal?: number
          total?: number
          tracking_code?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      products: {
        Row: {
          category: string
          created_at: string
          description: string | null
          force_last_item: boolean
          force_new: boolean
          gallery: Json
          id: string
          image: string | null
          is_featured: boolean
          long_description: string | null
          name: string
          price: number
          sizes: Json
          sort_order: number
          updated_at: string
          variant: Json | null
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          force_last_item?: boolean
          force_new?: boolean
          gallery?: Json
          id?: string
          image?: string | null
          is_featured?: boolean
          long_description?: string | null
          name: string
          price?: number
          sizes?: Json
          sort_order?: number
          updated_at?: string
          variant?: Json | null
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          force_last_item?: boolean
          force_new?: boolean
          gallery?: Json
          id?: string
          image?: string | null
          is_featured?: boolean
          long_description?: string | null
          name?: string
          price?: number
          sizes?: Json
          sort_order?: number
          updated_at?: string
          variant?: Json | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          address: Json | null
          created_at: string
          email: string
          id: string
          name: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: Json | null
          created_at?: string
          email: string
          id: string
          name?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: Json | null
          created_at?: string
          email?: string
          id?: string
          name?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      stock_ledger: {
        Row: {
          created_at: string
          id: string
          order_number: string | null
          product_id: string | null
          product_name: string | null
          qty_after: number | null
          qty_before: number | null
          qty_requested: number
          reason: string
          size: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          order_number?: string | null
          product_id?: string | null
          product_name?: string | null
          qty_after?: number | null
          qty_before?: number | null
          qty_requested?: number
          reason: string
          size?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          order_number?: string | null
          product_id?: string | null
          product_name?: string | null
          qty_after?: number | null
          qty_before?: number | null
          qty_requested?: number
          reason?: string
          size?: string | null
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      testimonials: {
        Row: {
          content: string
          created_at: string
          customer_name: string
          id: string
          rating: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          customer_name: string
          id?: string
          rating?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          customer_name?: string
          id?: string
          rating?: number
          sort_order?: number
          updated_at?: string
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
      consume_order_stock: {
        Args: { _order_number: string }
        Returns: undefined
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      reconcile_order_stock: { Args: never; Returns: number }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
