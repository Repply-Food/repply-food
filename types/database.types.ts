
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "acessos": {
                  Row: {
                    "criado_em": string,"restaurante_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "criado_em"?: string,"restaurante_id": string,"user_id": string
                  }
                  Update: {
                    "criado_em"?: string,"restaurante_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "acessos_restaurante_id_fkey"
      columns: ["restaurante_id"]
isOneToOne: false
      referencedRelation: "restaurantes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "acessos_restaurante_id_fkey"
      columns: ["restaurante_id"]
isOneToOne: false
      referencedRelation: "restaurantes_no_admin"
      referencedColumns: ["id"]
    }
                  ]
                },"admins_repply": {
                  Row: {
                    "criado_em": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "criado_em"?: string,"user_id": string
                  }
                  Update: {
                    "criado_em"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"entradas": {
                  Row: {
                    "aberta_em": string,"atualizada_em": string,"cod_cartao_mesa": number | null,"cod_cliente": number | null,"cod_entrada": number,"cod_garcom": number | null,"cod_operador_abertura": number | null,"cod_operador_fechamento": number | null,"complemento": number,"dia_operacao": string,"extras": NonNullable<Json>,"fechada_em": string | null,"hash_origem": string,"numero_ocupantes": number | null,"pago": boolean,"recebida_em": string,"removida_em": string | null,"restaurante_id": string,"taxa_servico": number,"tipo_cartao": string | null,"tipo_ocupacao": string | null,"valor_acrescimos": number,"valor_consumido": number,"valor_descontos": number,"valor_itens": number
                  }
                  ComputedFields: never
                  Insert: {
                    "aberta_em": string,"atualizada_em"?: string,"cod_cartao_mesa"?: number | null,"cod_cliente"?: number | null,"cod_entrada": number,"cod_garcom"?: number | null,"cod_operador_abertura"?: number | null,"cod_operador_fechamento"?: number | null,"complemento"?: number,"dia_operacao": string,"extras"?: NonNullable<Json>,"fechada_em"?: string | null,"hash_origem": string,"numero_ocupantes"?: number | null,"pago": boolean,"recebida_em"?: string,"removida_em"?: string | null,"restaurante_id": string,"taxa_servico"?: number,"tipo_cartao"?: string | null,"tipo_ocupacao"?: string | null,"valor_acrescimos"?: number,"valor_consumido": number,"valor_descontos"?: number,"valor_itens"?: number
                  }
                  Update: {
                    "aberta_em"?: string,"atualizada_em"?: string,"cod_cartao_mesa"?: number | null,"cod_cliente"?: number | null,"cod_entrada"?: number,"cod_garcom"?: number | null,"cod_operador_abertura"?: number | null,"cod_operador_fechamento"?: number | null,"complemento"?: number,"dia_operacao"?: string,"extras"?: NonNullable<Json>,"fechada_em"?: string | null,"hash_origem"?: string,"numero_ocupantes"?: number | null,"pago"?: boolean,"recebida_em"?: string,"removida_em"?: string | null,"restaurante_id"?: string,"taxa_servico"?: number,"tipo_cartao"?: string | null,"tipo_ocupacao"?: string | null,"valor_acrescimos"?: number,"valor_consumido"?: number,"valor_descontos"?: number,"valor_itens"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "entradas_restaurante_id_fkey"
      columns: ["restaurante_id"]
isOneToOne: false
      referencedRelation: "restaurantes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "entradas_restaurante_id_fkey"
      columns: ["restaurante_id"]
isOneToOne: false
      referencedRelation: "restaurantes_no_admin"
      referencedColumns: ["id"]
    }
                  ]
                },"envios": {
                  Row: {
                    "campos_desconhecidos": (string)[],"duracao_ms": number | null,"erro": string | null,"gravadas": number | null,"http_status": number,"id": number,"inalteradas": number | null,"janela_ate": string | null,"janela_desde": string | null,"modo": string | null,"payload": Json | null,"recebidas": number | null,"recebido_em": string,"removidas": number | null,"restaurante_id": string,"versao_formato": number | null,"versao_scc": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "campos_desconhecidos"?: (string)[],"duracao_ms"?: number | null,"erro"?: string | null,"gravadas"?: number | null,"http_status": number,"id"?: never,"inalteradas"?: number | null,"janela_ate"?: string | null,"janela_desde"?: string | null,"modo"?: string | null,"payload"?: Json | null,"recebidas"?: number | null,"recebido_em"?: string,"removidas"?: number | null,"restaurante_id": string,"versao_formato"?: number | null,"versao_scc"?: string | null
                  }
                  Update: {
                    "campos_desconhecidos"?: (string)[],"duracao_ms"?: number | null,"erro"?: string | null,"gravadas"?: number | null,"http_status"?: number,"id"?: never,"inalteradas"?: number | null,"janela_ate"?: string | null,"janela_desde"?: string | null,"modo"?: string | null,"payload"?: Json | null,"recebidas"?: number | null,"recebido_em"?: string,"removidas"?: number | null,"restaurante_id"?: string,"versao_formato"?: number | null,"versao_scc"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "envios_restaurante_id_fkey"
      columns: ["restaurante_id"]
isOneToOne: false
      referencedRelation: "restaurantes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "envios_restaurante_id_fkey"
      columns: ["restaurante_id"]
isOneToOne: false
      referencedRelation: "restaurantes_no_admin"
      referencedColumns: ["id"]
    }
                  ]
                },"metas": {
                  Row: {
                    "atualizado_em": string,"mes": string,"restaurante_id": string,"valor": number
                  }
                  ComputedFields: never
                  Insert: {
                    "atualizado_em"?: string,"mes": string,"restaurante_id": string,"valor": number
                  }
                  Update: {
                    "atualizado_em"?: string,"mes"?: string,"restaurante_id"?: string,"valor"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "metas_restaurante_id_fkey"
      columns: ["restaurante_id"]
isOneToOne: false
      referencedRelation: "restaurantes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "metas_restaurante_id_fkey"
      columns: ["restaurante_id"]
isOneToOne: false
      referencedRelation: "restaurantes_no_admin"
      referencedColumns: ["id"]
    }
                  ]
                },"registro_admin": {
                  Row: {
                    "acao": string,"autor": string | null,"criado_em": string,"detalhe": string | null,"id": number,"restaurante_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "acao": string,"autor"?: string | null,"criado_em"?: string,"detalhe"?: string | null,"id"?: never,"restaurante_id": string
                  }
                  Update: {
                    "acao"?: string,"autor"?: string | null,"criado_em"?: string,"detalhe"?: string | null,"id"?: never,"restaurante_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "registro_admin_restaurante_id_fkey"
      columns: ["restaurante_id"]
isOneToOne: false
      referencedRelation: "restaurantes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "registro_admin_restaurante_id_fkey"
      columns: ["restaurante_id"]
isOneToOne: false
      referencedRelation: "restaurantes_no_admin"
      referencedColumns: ["id"]
    }
                  ]
                },"restaurantes": {
                  Row: {
                    "atualizado_em": string,"cnpj": string | null,"criado_em": string,"fuso": string,"hora_virada": string,"horario_funcionamento": NonNullable<Json>,"id": string,"intervalo_envio_segundos": number,"limite_conta_esquecida": string,"nome": string,"pedido_reenvio_desde": string | null,"situacao": string,"slug": string,"turnos": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "atualizado_em"?: string,"cnpj"?: string | null,"criado_em"?: string,"fuso"?: string,"hora_virada"?: string,"horario_funcionamento"?: NonNullable<Json>,"id"?: string,"intervalo_envio_segundos"?: number,"limite_conta_esquecida"?: string,"nome": string,"pedido_reenvio_desde"?: string | null,"situacao"?: string,"slug": string,"turnos"?: NonNullable<Json>
                  }
                  Update: {
                    "atualizado_em"?: string,"cnpj"?: string | null,"criado_em"?: string,"fuso"?: string,"hora_virada"?: string,"horario_funcionamento"?: NonNullable<Json>,"id"?: string,"intervalo_envio_segundos"?: number,"limite_conta_esquecida"?: string,"nome"?: string,"pedido_reenvio_desde"?: string | null,"situacao"?: string,"slug"?: string,"turnos"?: NonNullable<Json>
                  }
                  Relationships: [
                    
                  ]
                },"sinal_de_vida": {
                  Row: {
                    "alarme_enviado_em": string | null,"estado": string,"estado_desde": string,"primeiro_envio_em": string | null,"restaurante_id": string,"ultimo_envio_em": string | null,"ultimo_envio_ok_em": string | null,"ultimo_erro_em": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "alarme_enviado_em"?: string | null,"estado"?: string,"estado_desde"?: string,"primeiro_envio_em"?: string | null,"restaurante_id": string,"ultimo_envio_em"?: string | null,"ultimo_envio_ok_em"?: string | null,"ultimo_erro_em"?: string | null
                  }
                  Update: {
                    "alarme_enviado_em"?: string | null,"estado"?: string,"estado_desde"?: string,"primeiro_envio_em"?: string | null,"restaurante_id"?: string,"ultimo_envio_em"?: string | null,"ultimo_envio_ok_em"?: string | null,"ultimo_erro_em"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "sinal_de_vida_restaurante_id_fkey"
      columns: ["restaurante_id"]
isOneToOne: true
      referencedRelation: "restaurantes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sinal_de_vida_restaurante_id_fkey"
      columns: ["restaurante_id"]
isOneToOne: true
      referencedRelation: "restaurantes_no_admin"
      referencedColumns: ["id"]
    }
                  ]
                },"tokens_envio": {
                  Row: {
                    "criado_em": string,"criado_por": string | null,"expira_em": string | null,"hash": string,"id": string,"prefixo": string,"restaurante_id": string,"revogado_em": string | null,"ultimo_uso_em": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "criado_em"?: string,"criado_por"?: string | null,"expira_em"?: string | null,"hash": string,"id"?: string,"prefixo": string,"restaurante_id": string,"revogado_em"?: string | null,"ultimo_uso_em"?: string | null
                  }
                  Update: {
                    "criado_em"?: string,"criado_por"?: string | null,"expira_em"?: string | null,"hash"?: string,"id"?: string,"prefixo"?: string,"restaurante_id"?: string,"revogado_em"?: string | null,"ultimo_uso_em"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "tokens_envio_restaurante_id_fkey"
      columns: ["restaurante_id"]
isOneToOne: false
      referencedRelation: "restaurantes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tokens_envio_restaurante_id_fkey"
      columns: ["restaurante_id"]
isOneToOne: false
      referencedRelation: "restaurantes_no_admin"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "restaurantes_no_admin": {
                  Row: {
                    "estado": string | null,"fuso": string | null,"id": string | null,"nome": string | null,"situacao": string | null,"slug": string | null,"ultimo_envio_ok_em": string | null,"versao_scc": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                }
          }
          Functions: {
            "aberto_desde":
{ Args: { "p_agora"?: string,"p_fuso": string,"p_horario": Json }; Returns: string
                           },
"abertura_do_intervalo":
{ Args: { "p_fuso": string,"p_horario": Json,"p_momento": string }; Returns: string
                           },
"atualizar_estados":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"atualizar_turnos":
{ Args: { "p_restaurante_id": string,"p_turnos": Json }; Returns: undefined
                           },
"btrim_null":
{ Args: { "p_texto": string }; Returns: string
                           },
"cnpj_valido":
{ Args: { "p_cnpj": string }; Returns: boolean
                           },
"dia_operacao_de":
{ Args: { "p_fuso": string,"p_momento": string,"p_virada": string }; Returns: string
                           },
"eh_admin_repply":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"encerrar_sessoes_do_login":
{ Args: { "p_user_id": string }; Returns: number
                           },
"horario_funcionamento_valido":
{ Args: { "p_horario": Json }; Returns: boolean
                           },
"id_do_login_por_email":
{ Args: { "p_email": string }; Returns: string
                           },
"normaliza_numeric":
{ Args: { "p_valor": string }; Returns: number
                           },
"processar_envio":
{ Args: { "p_campos_desconhecidos"?: (string)[],"p_envelope": Json,"p_restaurante_id": string }; Returns: Json
                           },
"recalcular_dia_operacao":
{ Args: { "p_restaurante_id": string }; Returns: undefined
                           },
"revogar_tokens_envio":
{ Args: { "p_restaurante": string }; Returns: number
                           },
"so_valor_simples":
{ Args: { "p_valor": Json }; Returns: Json
                           },
"tem_acesso":
{ Args: { "p_restaurante_id": string }; Returns: boolean
                           },
"trocar_token_envio":
{ Args: { "p_antigo": string,"p_hash": string,"p_prefixo": string,"p_restaurante": string }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
