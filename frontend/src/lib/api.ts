// Typed client for the FastAPI backend (agri_advisor/api/server.py). Vite proxies /api -> :8000.
const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "/api";

export type HarvestStatus = "growing" | "approaching" | "ready" | "overdue";
export type Severity = "high" | "medium" | "low";

export interface Farm {
  farm_id: string;
  farmer_name: string | null;
  phone: string | null;
  language: string;
  latitude: number;
  longitude: number;
  state: string | null;
  district: string | null;
  crop: string;
  sowing_date: string;
  irrigated: number | boolean;
  area_ha: number | null;
  soil_type: string | null;
  created_at?: string;
}

export interface CurvePoint {
  date: string;
  readiness: number;
  health: number;
  maturity_pct: number;
  weather_basis?: "forecast" | "climate_normal";
}

export interface Alert {
  type: string;
  severity: Severity;
  date: string;
  advice: string;
  [k: string]: unknown;
}

export interface Market {
  available: boolean;
  commodity?: string;
  latest_date?: string;
  avg_modal_price_rs_qtl?: number;
  trend_7d_pct?: number | null;
  n_markets?: number;
  best_markets?: { market: string; modal_price_rs_qtl: number }[];
}

export interface Soil {
  N: number;
  ph: number;
  moisture: number;
  soil_type: string;
}

export interface CropCalendar {
  season: string;
  next_sowing_window?: { start: string; end: string } | null;
  typical_duration_days: number;
  expected_harvest_if_sown_in_window?: { start: string; end: string } | null;
}

export interface Prediction {
  id: number;
  farm_id: string;
  created_at: string;
  as_of_date: string;
  crop: string;
  model_version: string;
  days_to_harvest: number;
  recommended_harvest_date: string;
  window_start: string;
  window_end: string;
  harvest_status: HarvestStatus;
  readiness_now: number;
  health_now: number;
  maturity_pct: number;
  expected_yield_kg_ha: number;
  curve: CurvePoint[];
  alerts: Alert[];
  market: Market;
  farm: Farm & {
    crop_info?: Record<string, unknown>;
    days_since_sowing?: number;
    soil?: Soil;
    crop_calendar?: CropCalendar;
  };
}

export interface Health {
  status: string;
  model_present: boolean;
  mandi_key_set: boolean;
  voice_configured: boolean;
  llm_configured: boolean;
  crops: string[];
}

export interface ChatReply {
  reply: string;
  session_id: string;
  language: string;
  used_llm: boolean;
  prediction_id?: number;
  as_of_date?: string;
  warning?: string | null;
  error?: string | null;
}

export interface VoiceReply extends ChatReply {
  transcript: string;
  audio_base64: string;
  mime_type: string;
}

export interface FarmInput {
  farm_id: string;
  farmer_name?: string;
  phone?: string;
  language: string;
  latitude: number;
  longitude: number;
  state?: string;
  district?: string;
  crop: string;
  sowing_date: string;
  irrigated: boolean;
  area_ha?: number;
  soil_type?: string;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, init);
  } catch {
    throw new ApiError(0, "Can't reach the advisory server. Is `python main.py serve` running?");
  }
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = await res.json();
      msg = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail ?? body);
    } catch {
      /* non-JSON error body */
    }
    if (res.status >= 500 && res.status !== 503) msg = msg || "Server error";
    throw new ApiError(res.status, msg);
  }
  return res.json() as Promise<T>;
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const api = {
  health: () => request<Health>("/health"),
  farms: () => request<Farm[]>("/farms"),
  farm: (id: string) => request<Farm>(`/farms/${encodeURIComponent(id)}`),
  registerFarm: (f: FarmInput) => request<Farm>("/farms", json("POST", f)),
  collect: (id: string) => request<Record<string, unknown>>(`/farms/${encodeURIComponent(id)}/collect`, json("POST")),
  predict: (id: string, collect = true) =>
    request<Prediction>(`/farms/${encodeURIComponent(id)}/predict?collect=${collect}`, json("POST")),
  /** Latest stored prediction, or null if the farm has never been forecast. */
  prediction: async (id: string) => {
    try {
      return await request<Prediction>(`/farms/${encodeURIComponent(id)}/prediction`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }
  },
  harvestOutcome: (id: string, body: { harvest_date: string; yield_kg_ha?: number; notes?: string }) =>
    request<{ saved: boolean }>(`/farms/${encodeURIComponent(id)}/harvest-outcome`, json("POST", body)),
  chat: (body: { farm_id: string; message: string; session_id?: string | null; language?: string | null }) =>
    request<ChatReply>("/chat", json("POST", body)),
  voice: (farmId: string, audio: Blob, sessionId?: string | null, language?: string | null) => {
    const fd = new FormData();
    fd.append("farm_id", farmId);
    const ext = audio.type.includes("mp4") ? "m4a" : audio.type.includes("ogg") ? "ogg" : "webm";
    fd.append("audio", audio, `speech.${ext}`);
    if (sessionId) fd.append("session_id", sessionId);
    if (language) fd.append("language", language);
    return request<VoiceReply>("/voice", { method: "POST", body: fd });
  },
  /** Server text-to-speech (Sarvam AI) in the given language. */
  tts: (text: string, language: string) =>
    request<{ audio_base64: string; mime_type: string }>("/tts", json("POST", { text, language })),
};
