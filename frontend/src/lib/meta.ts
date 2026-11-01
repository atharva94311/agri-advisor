import {
  AlertTriangle,
  Bug,
  CloudRain,
  Droplets,
  Flame,
  Snowflake,
  Sprout,
  Sun,
  Tractor,
  Waves,
  type LucideIcon,
} from "lucide-react";
import type { HarvestStatus, Severity } from "./api";

export interface CropMeta {
  label: string;
  emoji: string;
  hue: string; // swatch used for the crop's chip and chart accents
  hindi: string;
}

export const CROP_META: Record<string, CropMeta> = {
  rice: { label: "Rice", emoji: "🌾", hue: "#c9a54a", hindi: "धान" },
  maize: { label: "Maize", emoji: "🌽", hue: "#e0b12f", hindi: "मक्का" },
  wheat: { label: "Wheat", emoji: "🌾", hue: "#d39b3a", hindi: "गेहूँ" },
  cotton: { label: "Cotton", emoji: "☁️", hue: "#9aa6b8", hindi: "कपास" },
  chickpea: { label: "Chickpea", emoji: "🫘", hue: "#c08a4f", hindi: "चना" },
  lentil: { label: "Lentil", emoji: "🫘", hue: "#c76b45", hindi: "मसूर" },
  pigeonpeas: { label: "Pigeon pea", emoji: "🫛", hue: "#b7924a", hindi: "अरहर" },
  mungbean: { label: "Mung bean", emoji: "🫛", hue: "#6fa85a", hindi: "मूंग" },
  blackgram: { label: "Black gram", emoji: "🫘", hue: "#5d5a55", hindi: "उड़द" },
  mothbeans: { label: "Moth bean", emoji: "🫛", hue: "#9a7b4f", hindi: "मोठ" },
  kidneybeans: { label: "Kidney bean", emoji: "🫘", hue: "#a8433a", hindi: "राजमा" },
  jute: { label: "Jute", emoji: "🌿", hue: "#7f9a4a", hindi: "जूट" },
  watermelon: { label: "Watermelon", emoji: "🍉", hue: "#d1564f", hindi: "तरबूज" },
  muskmelon: { label: "Muskmelon", emoji: "🍈", hue: "#d9a94e", hindi: "खरबूजा" },
};

export const cropMeta = (crop: string): CropMeta =>
  CROP_META[crop] ?? { label: crop.charAt(0).toUpperCase() + crop.slice(1), emoji: "🌱", hue: "#6fa85a", hindi: "" };

export const LANGUAGES: Record<string, { name: string; native: string }> = {
  en: { name: "English", native: "English" },
  hi: { name: "Hindi", native: "हिन्दी" },
  mr: { name: "Marathi", native: "मराठी" },
  bn: { name: "Bengali", native: "বাংলা" },
  te: { name: "Telugu", native: "తెలుగు" },
  ta: { name: "Tamil", native: "தமிழ்" },
  gu: { name: "Gujarati", native: "ગુજરાતી" },
  kn: { name: "Kannada", native: "ಕನ್ನಡ" },
  ml: { name: "Malayalam", native: "മലയാളം" },
  pa: { name: "Punjabi", native: "ਪੰਜਾਬੀ" },
  or: { name: "Odia", native: "ଓଡ଼ିଆ" },
};

export const SOIL_TYPES = ["Black", "Clayey", "Loamy", "Red", "Sandy"] as const;

export const STATUS_META: Record<HarvestStatus, { label: string; tone: Tone; blurb: string }> = {
  growing: { label: "Growing", tone: "primary", blurb: "Developing well" },
  approaching: { label: "Approaching", tone: "warn", blurb: "Harvest window coming up" },
  ready: { label: "Ready to harvest", tone: "accent", blurb: "In the best window now" },
  overdue: { label: "Overdue", tone: "danger", blurb: "Past the best window" },
};

export type Tone = "primary" | "accent" | "warn" | "danger" | "sky" | "neutral";

export const SEVERITY_TONE: Record<Severity, Tone> = { high: "danger", medium: "warn", low: "sky" };

export const ALERT_META: Record<string, { label: string; icon: LucideIcon }> = {
  heavy_rain: { label: "Heavy rain", icon: CloudRain },
  heat_stress: { label: "Heat stress", icon: Flame },
  frost: { label: "Frost risk", icon: Snowflake },
  cold_stress: { label: "Cold stress", icon: Snowflake },
  disease_risk: { label: "Disease risk", icon: Bug },
  dry_spell: { label: "Dry spell", icon: Sun },
  waterlogging: { label: "Waterlogging", icon: Waves },
  harvest_now: { label: "Harvest now", icon: Tractor },
  prepare_harvest: { label: "Prepare to harvest", icon: Sprout },
  harvest_overdue: { label: "Harvest overdue", icon: AlertTriangle },
};

export const alertMeta = (type: string) =>
  ALERT_META[type] ?? { label: type.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()), icon: Droplets };
