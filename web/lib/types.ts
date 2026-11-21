export interface Member { id: string; user_id: string; display_name: string; role: string }
export interface Report { id: string; member_id: string; collection_date: string | null; lab_name: string | null; status: string; created_at: string; storage_path?: string; extraction_method?: string | null }
export interface Result { id: string; report_id: string; source_page: number; name: string; raw_value: string; unit: string | null; reference_lines: string[]; result_type: 'numeric' | 'qualitative'; date?: string }
export interface Session { access_token: string; refresh_token: string; expires_at?: number; expires_in?: number; user?: { id: string } }
export interface Config { url: string; key: string }
export type View = 'overview' | 'reports' | 'history' | 'report' | 'review' | 'family';
