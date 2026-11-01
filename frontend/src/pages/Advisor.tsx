import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, Bot, ChevronDown, Keyboard, Languages, Loader2, Mic, RotateCcw, Square, Volume2, VolumeX, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { toast } from "sonner";
import { StatusBadge } from "../components/FarmWidgets";
import IndicKeyboard, { hasKeyboard } from "../components/IndicKeyboard";
import { Button, Card, CropGlyph, EmptyState, IconButton, Skeleton, spring } from "../components/ui";
import { api } from "../lib/api";
import { cx, fmtDate } from "../lib/format";
import { cropMeta, LANGUAGES } from "../lib/meta";
import { canRecord, useListener, useSpeaker } from "../lib/speech";
import { useStore } from "../lib/store";

interface Msg {
  id: string;
  role: "user" | "assistant";
  text: string;
  language: string;
  at: number;
  viaVoice?: boolean;
  template?: boolean;
  error?: boolean;
}
interface Thread {
  sessionId: string | null;
  messages: Msg[];
}

// Quick questions in every reply language (keys match LANGUAGES in lib/meta.ts).
const SUGGESTIONS: { icon: string; text: Record<string, string> }[] = [
  {
    icon: "🌾",
    text: {
      en: "When should I harvest?", hi: "कटाई कब करूँ?", mr: "कापणी कधी करू?", bn: "কবে ফসল কাটব?",
      te: "పంట ఎప్పుడు కోయాలి?", ta: "எப்போது அறுவடை செய்யலாம்?", gu: "કાપણી ક્યારે કરું?",
      kn: "ಕೊಯ್ಲು ಯಾವಾಗ ಮಾಡಬೇಕು?", ml: "എപ്പോൾ വിളവെടുക്കണം?", pa: "ਵਾਢੀ ਕਦੋਂ ਕਰਾਂ?", or: "କେବେ ଫସଲ କାଟିବି?",
    },
  },
  {
    icon: "🌧️",
    text: {
      en: "Will it rain this week?", hi: "इस हफ्ते बारिश होगी?", mr: "या आठवड्यात पाऊस पडेल का?",
      bn: "এই সপ্তাহে বৃষ্টি হবে?", te: "ఈ వారం వర్షం పడుతుందా?", ta: "இந்த வாரம் மழை பெய்யுமா?",
      gu: "આ અઠવાડિયે વરસાદ પડશે?", kn: "ಈ ವಾರ ಮಳೆ ಬರುತ್ತದೆಯೇ?", ml: "ഈ ആഴ്ച മഴ പെയ്യുമോ?",
      pa: "ਕੀ ਇਸ ਹਫ਼ਤੇ ਮੀਂਹ ਪਵੇਗਾ?", or: "ଏହି ସପ୍ତାହରେ ବର୍ଷା ହେବ କି?",
    },
  },
  {
    icon: "💰",
    text: {
      en: "What is the mandi price today?", hi: "आज मंडी भाव क्या है?", mr: "आज बाजारभाव काय आहे?",
      bn: "আজ মান্ডির দর কত?", te: "ఈరోజు మండీ ధర ఎంత?", ta: "இன்று மண்டி விலை என்ன?", gu: "આજે મંડીનો ભાવ શું છે?",
      kn: "ಇಂದು ಮಂಡಿ ಬೆಲೆ ಎಷ್ಟು?", ml: "ഇന്ന് മണ്ടി വില എത്ര?", pa: "ਅੱਜ ਮੰਡੀ ਦਾ ਭਾਅ ਕੀ ਹੈ?", or: "ଆଜି ମଣ୍ଡି ଦର କେତେ?",
    },
  },
  {
    icon: "🩺",
    text: {
      en: "How healthy is my crop?", hi: "मेरी फसल कैसी है?", mr: "माझे पीक कसे आहे?", bn: "আমার ফসল কেমন আছে?",
      te: "నా పంట ఎలా ఉంది?", ta: "என் பயிர் எப்படி இருக்கிறது?", gu: "મારો પાક કેવો છે?", kn: "ನನ್ನ ಬೆಳೆ ಹೇಗಿದೆ?",
      ml: "എന്റെ വിള എങ്ങനെയുണ്ട്?", pa: "ਮੇਰੀ ਫ਼ਸਲ ਕਿਵੇਂ ਹੈ?", or: "ମୋ ଫସଲ କେମିତି ଅଛି?",
    },
  },
  {
    icon: "🗓️",
    text: {
      en: "When is the next sowing window?", hi: "अगली बुवाई कब करूँ?", mr: "पुढची पेरणी कधी करू?",
      bn: "পরের বীজ বোনা কবে?", te: "తదుపరి విత్తనాలు ఎప్పుడు వేయాలి?", ta: "அடுத்த விதைப்பு எப்போது?",
      gu: "આગલી વાવણી ક્યારે કરું?", kn: "ಮುಂದಿನ ಬಿತ್ತನೆ ಯಾವಾಗ?", ml: "അടുത്ത വിതയ്ക്കൽ എപ്പോൾ?",
      pa: "ਅਗਲੀ ਬਿਜਾਈ ਕਦੋਂ ਕਰਾਂ?", or: "ପରବର୍ତ୍ତୀ ବୁଣିବା କେବେ?",
    },
  },
];

// Advisor screen text in every reply language.
const UI_TEXT: Record<string, { hello: string; intro: string; ask: string }> = {
  en: { hello: "Namaste", intro: "Ask anything about your farm: harvest time, weather, crop health or mandi prices. Type, or tap the mic to speak.", ask: "Ask in English…" },
  hi: { hello: "नमस्ते", intro: "अपने खेत के बारे में कुछ भी पूछें: कटाई का समय, मौसम, फसल की सेहत या मंडी भाव। लिखें, या बोलने के लिए माइक दबाएँ।", ask: "हिन्दी में पूछें…" },
  mr: { hello: "नमस्कार", intro: "तुमच्या शेताबद्दल काहीही विचारा: कापणीची वेळ, हवामान, पिकाचे आरोग्य किंवा बाजारभाव. लिहा, किंवा बोलण्यासाठी माइक दाबा.", ask: "मराठीत विचारा…" },
  bn: { hello: "নমস্কার", intro: "আপনার খেত সম্পর্কে যা খুশি জিজ্ঞাসা করুন: ফসল কাটার সময়, আবহাওয়া, ফসলের স্বাস্থ্য বা মান্ডির দর। লিখুন, অথবা বলতে মাইক চাপুন।", ask: "বাংলায় জিজ্ঞাসা করুন…" },
  te: { hello: "నమస్కారం", intro: "మీ పొలం గురించి ఏదైనా అడగండి: కోత సమయం, వాతావరణం, పంట ఆరోగ్యం లేదా మండీ ధరలు. టైప్ చేయండి, లేదా మాట్లాడటానికి మైక్ నొక్కండి.", ask: "తెలుగులో అడగండి…" },
  ta: { hello: "வணக்கம்", intro: "உங்கள் வயலைப் பற்றி எதையும் கேளுங்கள்: அறுவடை நேரம், வானிலை, பயிர் ஆரோக்கியம் அல்லது மண்டி விலை. தட்டச்சு செய்யுங்கள், அல்லது பேச மைக்கை அழுத்துங்கள்.", ask: "தமிழில் கேளுங்கள்…" },
  gu: { hello: "નમસ્તે", intro: "તમારા ખેતર વિશે કંઈ પણ પૂછો: કાપણીનો સમય, હવામાન, પાકની તંદુરસ્તી અથવા મંડીના ભાવ. લખો, અથવા બોલવા માટે માઇક દબાવો.", ask: "ગુજરાતીમાં પૂછો…" },
  kn: { hello: "ನಮಸ್ಕಾರ", intro: "ನಿಮ್ಮ ಹೊಲದ ಬಗ್ಗೆ ಏನನ್ನಾದರೂ ಕೇಳಿ: ಕೊಯ್ಲಿನ ಸಮಯ, ಹವಾಮಾನ, ಬೆಳೆಯ ಆರೋಗ್ಯ ಅಥವಾ ಮಂಡಿ ಬೆಲೆ. ಟೈಪ್ ಮಾಡಿ, ಅಥವಾ ಮಾತನಾಡಲು ಮೈಕ್ ಒತ್ತಿ.", ask: "ಕನ್ನಡದಲ್ಲಿ ಕೇಳಿ…" },
  ml: { hello: "നമസ്കാരം", intro: "നിങ്ങളുടെ കൃഷിയിടത്തെക്കുറിച്ച് എന്തും ചോദിക്കൂ: വിളവെടുപ്പ് സമയം, കാലാവസ്ഥ, വിളയുടെ ആരോഗ്യം അല്ലെങ്കിൽ മണ്ടി വില. ടൈപ്പ് ചെയ്യൂ, അല്ലെങ്കിൽ സംസാരിക്കാൻ മൈക്ക് അമർത്തൂ.", ask: "മലയാളത്തിൽ ചോദിക്കൂ…" },
  pa: { hello: "ਸਤ ਸ੍ਰੀ ਅਕਾਲ", intro: "ਆਪਣੇ ਖੇਤ ਬਾਰੇ ਕੁਝ ਵੀ ਪੁੱਛੋ: ਵਾਢੀ ਦਾ ਸਮਾਂ, ਮੌਸਮ, ਫ਼ਸਲ ਦੀ ਸਿਹਤ ਜਾਂ ਮੰਡੀ ਦੇ ਭਾਅ। ਲਿਖੋ, ਜਾਂ ਬੋਲਣ ਲਈ ਮਾਈਕ ਦਬਾਓ।", ask: "ਪੰਜਾਬੀ ਵਿੱਚ ਪੁੱਛੋ…" },
  or: { hello: "ନମସ୍କାର", intro: "ଆପଣଙ୍କ ଜମି ବିଷୟରେ କିଛି ବି ପଚାରନ୍ତୁ: ଫସଲ କାଟିବା ସମୟ, ପାଣିପାଗ, ଫସଲର ସ୍ୱାସ୍ଥ୍ୟ କିମ୍ବା ମଣ୍ଡି ଦର। ଲେଖନ୍ତୁ, କିମ୍ବା କହିବାକୁ ମାଇକ୍ ଦବାନ୍ତୁ।", ask: "ଓଡ଼ିଆରେ ପଚାରନ୍ତୁ…" },
};

const storeKey = (farmId: string) => `fasal-chat:${farmId}`;
const loadThread = (farmId: string): Thread => {
  try {
    const raw = sessionStorage.getItem(storeKey(farmId));
    if (raw) return JSON.parse(raw);
  } catch {
    /* storage unavailable */
  }
  return { sessionId: null, messages: [] };
};
const saveThread = (farmId: string, t: Thread) => {
  try {
    sessionStorage.setItem(storeKey(farmId), JSON.stringify(t));
  } catch {
    /* storage unavailable */
  }
};
const uid = () => Math.random().toString(36).slice(2, 10);

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-1 py-1.5">
      {[0, 1, 2].map((i) => (
        <motion.span key={i} className="size-2 rounded-full bg-muted" animate={{ y: [0, -5, 0], opacity: [0.5, 1, 0.5] }} transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }} />
      ))}
    </div>
  );
}

function Bubble({ m, speaking, loading, onSpeak }: { m: Msg; speaking: boolean; loading: boolean; onSpeak: () => void }) {
  const mine = m.role === "user";
  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 14, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={spring}
      className={cx("flex gap-3", mine ? "justify-end" : "justify-start")}
    >
      {!mine && (
        <div className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-brand text-brand-ink">
          <Bot className="size-[18px]" />
        </div>
      )}
      <div className={cx("group max-w-[82%] sm:max-w-[70%]", mine && "flex flex-col items-end")}>
        <div
          className={cx(
            "whitespace-pre-wrap rounded-3xl px-4 py-3 text-[15px] leading-relaxed",
            mine ? "rounded-br-lg bg-primary text-on-primary" : "rounded-bl-lg border border-line bg-surface shadow-[var(--shadow-soft)]",
            m.error && "border-danger/40 bg-danger-soft text-danger",
          )}
        >
          {m.text}
        </div>
        <div className={cx("mt-1.5 flex items-center gap-2 px-1 text-[11px] text-muted", mine && "flex-row-reverse")}>
          <span>{new Date(m.at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}</span>
          {m.viaVoice && <span className="flex items-center gap-0.5"><Mic className="size-3" /> voice</span>}
          {m.template && <span title="No LLM is configured on the server, so replies come from a built-in English template.">template reply</span>}
          {!mine && !m.error && (
            <button onClick={onSpeak} className={cx("flex items-center gap-1 rounded-full px-1.5 py-0.5 transition hover:bg-surface-2 hover:text-ink", (speaking || loading) && "text-primary")}>
              {loading ? <Loader2 className="size-3.5 animate-spin" /> : speaking ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
              {loading ? "Loading…" : speaking ? "Stop" : "Listen"}
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function VoiceOverlay({ level, onStop, onCancel, language }: { level: number; onStop: () => void; onCancel: () => void; language: string }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-8 rounded-[inherit] bg-surface/92 p-6 backdrop-blur-md">
      <p className="text-sm font-medium text-muted">Listening in {LANGUAGES[language]?.native ?? language}…</p>
      <div className="relative grid size-40 place-items-center">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="absolute inset-0 rounded-full border-2 border-primary-2"
            animate={{ scale: [0.6, 1.25], opacity: [0.6, 0] }}
            transition={{ duration: 2, repeat: Infinity, delay: i * 0.6, ease: "easeOut" }}
          />
        ))}
        <motion.button
          onClick={onStop}
          aria-label="Stop and send"
          animate={{ scale: 1 + Math.min(level, 1) * 0.18 }}
          transition={{ type: "spring", stiffness: 300, damping: 15 }}
          className="relative grid size-24 place-items-center rounded-full bg-primary text-on-primary shadow-[0_18px_40px_-14px_var(--primary)]"
        >
          <Square className="size-7 fill-current" />
        </motion.button>
      </div>
      <p className="min-h-[3rem] max-w-md text-center font-display text-xl text-muted">Speak your question, then tap to send.</p>
      <div className="flex gap-2">
        <Button variant="ghost" onClick={onCancel} icon={<X className="size-4" />}>
          Cancel
        </Button>
        <Button onClick={onStop}>Send</Button>
      </div>
    </motion.div>
  );
}

export default function Advisor() {
  const { entries, loading } = useStore();
  const [params, setParams] = useSearchParams();
  const farmId = params.get("farm") ?? entries[0]?.farm.farm_id ?? "";
  const e = entries.find((x) => x.farm.farm_id === farmId);
  const [language, setLanguage] = useState<string>("en");
  const [thread, setThread] = useState<Thread>({ sessionId: null, messages: [] });
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [kbOpen, setKbOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const speaker = useSpeaker();

  // Switch thread + default language when the farm changes.
  useEffect(() => {
    if (!farmId) return;
    setThread(loadThread(farmId));
    const f = entries.find((x) => x.farm.farm_id === farmId)?.farm;
    if (f) setLanguage(f.language || "en");
    speaker.stop();
  }, [farmId, entries.length]);

  useEffect(() => {
    if (farmId) saveThread(farmId, thread);
  }, [farmId, thread]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [thread.messages.length, busy]);

  // The on-screen keyboard only exists for Indian scripts.
  useEffect(() => {
    if (!hasKeyboard(language)) setKbOpen(false);
  }, [language]);

  const resizeInput = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 140) + "px";
  };

  /** Insert text from the on-screen keyboard at the caret (replacing any selection). */
  const typeText = (text: string) => {
    const el = inputRef.current;
    const start = el?.selectionStart ?? input.length;
    const end = el?.selectionEnd ?? input.length;
    setInput(input.slice(0, start) + text + input.slice(end));
    requestAnimationFrame(() => {
      el?.setSelectionRange(start + text.length, start + text.length);
      resizeInput();
    });
  };

  const backspace = () => {
    const el = inputRef.current;
    const start = el?.selectionStart ?? input.length;
    const end = el?.selectionEnd ?? input.length;
    const from = start === end ? Math.max(0, start - 1) : start;
    setInput(input.slice(0, from) + input.slice(end));
    requestAnimationFrame(() => {
      el?.setSelectionRange(from, from);
      resizeInput();
    });
  };

  const push = (m: Msg, sessionId?: string | null) =>
    setThread((t) => ({ sessionId: sessionId !== undefined ? sessionId : t.sessionId, messages: [...t.messages, m] }));

  const speak = (id: string, text: string, lang: string) =>
    speaker.speak(id, text, lang).catch((err) => toast.error("Couldn't play the reply", { description: (err as Error).message }));

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || !farmId || busy) return;
    setInput("");
    push({ id: uid(), role: "user", text: message, language, at: Date.now() });
    setBusy(true);
    try {
      const r = await api.chat({ farm_id: farmId, message, session_id: thread.sessionId, language });
      const id = uid();
      push({ id, role: "assistant", text: r.reply, language: r.language, at: Date.now(), template: !r.used_llm }, r.session_id);
      if (r.warning) toast.warning("Using an older forecast", { description: r.warning });
      if (autoSpeak) speak(id, r.reply, r.language);
    } catch (err) {
      push({ id: uid(), role: "assistant", text: (err as Error).message, language, at: Date.now(), error: true });
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  const sendAudio = async (blob: Blob) => {
    if (!farmId) return;
    setBusy(true);
    try {
      const r = await api.voice(farmId, blob, thread.sessionId, language);
      push({ id: uid(), role: "user", text: r.transcript || "(voice message)", language: r.language, at: Date.now(), viaVoice: true });
      const id = uid();
      push({ id, role: "assistant", text: r.reply, language: r.language, at: Date.now(), template: !r.used_llm }, r.session_id);
      speaker.playAudio(id, r.audio_base64, r.mime_type);
    } catch (err) {
      toast.error("Voice message failed", { description: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const listener = useListener(sendAudio);
  const voiceAvailable = canRecord();

  const startVoice = async () => {
    speaker.stop();
    try {
      await listener.start();
    } catch (err) {
      toast.error("Microphone unavailable", { description: (err as Error).message });
    }
  };

  const reset = () => {
    speaker.stop();
    setThread({ sessionId: null, messages: [] });
  };

  const chooseFarm = (id: string) => {
    setPickerOpen(false);
    setParams({ farm: id }, { replace: true });
  };

  const suggestions = useMemo(() => SUGGESTIONS.map((s) => ({ icon: s.icon, en: s.text.en, text: s.text[language] ?? s.text.en })), [language]);

  if (loading && !entries.length) return <Skeleton className="h-[70vh] rounded-3xl" />;
  if (!entries.length)
    return (
      <Card>
        <EmptyState icon={<Bot className="size-6" />} title="Register a farm first" body="The advisor answers questions about a specific farm's forecast." action={<Link to="/farms/new"><Button>Register a farm</Button></Link>} />
      </Card>
    );

  const m = e ? cropMeta(e.farm.crop) : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
      <aside className="hidden lg:block">
        <h1 className="font-display mb-1 text-3xl font-medium">Advisor</h1>
        <p className="mb-4 text-sm text-muted">Ask about a farm in your own language.</p>
        <div className="flex flex-col gap-1.5">
          {entries.map(({ farm, prediction }) => {
            const cm = cropMeta(farm.crop);
            const active = farm.farm_id === farmId;
            return (
              <button key={farm.farm_id} onClick={() => chooseFarm(farm.farm_id)} className={cx("relative flex items-center gap-3 rounded-2xl p-2.5 text-left transition-colors", !active && "hover:bg-surface-2/60")}>
                {active && <motion.div layoutId="adv-farm" transition={spring} className="absolute inset-0 rounded-2xl border border-line bg-surface shadow-[var(--shadow-soft)]" />}
                <CropGlyph emoji={cm.emoji} hue={cm.hue} size={40} className="relative" />
                <div className="relative min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold">{farm.farmer_name || farm.farm_id}</div>
                  <div className="truncate text-xs text-muted">
                    {cm.label} · {LANGUAGES[farm.language]?.native ?? farm.language}
                    {prediction && ` · ${fmtDate(prediction.recommended_harvest_date)}`}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      <Card className="relative flex h-[calc(100dvh-180px)] min-h-[520px] flex-col overflow-hidden lg:h-[calc(100dvh-120px)]">
        <div className="flex items-center gap-3 border-b border-line px-4 py-3 sm:px-5">
          <button onClick={() => setPickerOpen((o) => !o)} className="flex min-w-0 flex-1 items-center gap-3 text-left lg:pointer-events-none">
            {m && <CropGlyph emoji={m.emoji} hue={m.hue} size={40} />}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 truncate text-[15px] font-semibold">
                {e?.farm.farmer_name || farmId}
                <ChevronDown className={cx("size-4 text-muted transition-transform lg:hidden", pickerOpen && "rotate-180")} />
              </div>
              <div className="flex items-center gap-2 text-xs text-muted">
                {m?.label}
                {e?.prediction && <StatusBadge status={e.prediction.harvest_status} />}
              </div>
            </div>
          </button>
          <label className="relative flex items-center gap-1.5 rounded-full border border-line bg-surface-2/60 py-1.5 pl-3 pr-2 text-[13px] font-medium">
            <Languages className="size-4 text-muted" />
            <select aria-label="Reply language" value={language} onChange={(ev) => setLanguage(ev.target.value)} className="appearance-none bg-transparent pr-4 outline-none">
              {Object.entries(LANGUAGES).map(([code, l]) => (
                <option key={code} value={code}>
                  {l.native}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 size-3.5 text-muted" />
          </label>
          <IconButton label={autoSpeak ? "Stop reading replies aloud" : "Read replies aloud"} onClick={() => { setAutoSpeak((a) => !a); speaker.stop(); }} className={cx(autoSpeak && "bg-primary-soft text-primary")}>
            {autoSpeak ? <Volume2 className="size-5" /> : <VolumeX className="size-5" />}
          </IconButton>
          <IconButton label="New conversation" onClick={reset} disabled={!thread.messages.length} className="disabled:opacity-40">
            <RotateCcw className="size-[18px]" />
          </IconButton>
        </div>

        <AnimatePresence>
          {pickerOpen && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-b border-line bg-surface-2/40 lg:hidden">
              <div className="flex gap-2 overflow-x-auto p-3">
                {entries.map(({ farm }) => {
                  const cm = cropMeta(farm.crop);
                  return (
                    <button key={farm.farm_id} onClick={() => chooseFarm(farm.farm_id)} className={cx("flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] font-medium", farm.farm_id === farmId ? "border-primary bg-primary text-on-primary" : "border-line bg-surface")}>
                      {cm.emoji} {farm.farmer_name || farm.farm_id}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
          {thread.messages.length === 0 ? (
            <div className="mx-auto flex h-full max-w-lg flex-col items-center justify-center text-center">
              <motion.div initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 200, damping: 14 }} className="mb-5 grid size-16 place-items-center rounded-3xl bg-brand text-brand-ink shadow-[0_18px_36px_-16px_var(--primary)]">
                <Bot className="size-8" />
              </motion.div>
              <h2 className="font-display text-3xl font-medium">{(UI_TEXT[language] ?? UI_TEXT.en).hello}{e?.farm.farmer_name ? `, ${e.farm.farmer_name.split(" ")[0]}` : ""} 🙏</h2>
              <p className="mt-2 text-[15px] text-muted">
                {(UI_TEXT[language] ?? UI_TEXT.en).intro}
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {suggestions.map((s, i) => (
                  <motion.button
                    key={s.en}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 + i * 0.06 }}
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => send(s.text)}
                    className="rounded-full border border-line bg-surface px-4 py-2 text-[14px] font-medium shadow-[var(--shadow-soft)] transition-colors hover:border-primary-2"
                  >
                    <span className="mr-1.5">{s.icon}</span>
                    {s.text}
                  </motion.button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto flex max-w-3xl flex-col gap-5">
              {thread.messages.map((msg) => (
                <Bubble
                  key={msg.id}
                  m={msg}
                  speaking={speaker.speakingId === msg.id}
                  loading={speaker.loadingId === msg.id}
                  onSpeak={() => (speaker.speakingId === msg.id || speaker.loadingId === msg.id ? speaker.stop() : speak(msg.id, msg.text, msg.language))}
                />
              ))}
              <AnimatePresence>
                {busy && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex gap-3">
                    <div className="grid size-9 place-items-center rounded-full bg-brand text-brand-ink">
                      <Bot className="size-[18px]" />
                    </div>
                    <div className="rounded-3xl rounded-bl-lg border border-line bg-surface px-4 py-2.5">
                      <TypingDots />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>

        <div className="border-t border-line bg-surface/80 p-3 backdrop-blur sm:p-4">
          {thread.messages.length > 0 && (
            <div className="mx-auto mb-2.5 flex max-w-3xl gap-2 overflow-x-auto pb-0.5">
              {suggestions.map((s) => (
                <button key={s.en} disabled={busy} onClick={() => send(s.text)} className="shrink-0 rounded-full border border-line px-3 py-1 text-[12.5px] text-ink-2 transition hover:border-primary-2 hover:text-ink disabled:opacity-50">
                  {s.icon} {s.text}
                </button>
              ))}
            </div>
          )}
          <AnimatePresence>
            {kbOpen && <IndicKeyboard language={language} onKey={typeText} onBackspace={backspace} onHide={() => setKbOpen(false)} />}
          </AnimatePresence>
          <form
            onSubmit={(ev) => {
              ev.preventDefault();
              send(input);
            }}
            className="mx-auto flex max-w-3xl items-end gap-2 rounded-[26px] border border-line bg-bg/60 p-1.5 pl-4 transition focus-within:border-primary-2 focus-within:shadow-[0_0_0_4px_var(--primary-soft)]"
          >
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(ev) => {
                setInput(ev.target.value);
                ev.target.style.height = "auto";
                ev.target.style.height = Math.min(ev.target.scrollHeight, 140) + "px";
              }}
              onKeyDown={(ev) => {
                if (ev.key === "Enter" && !ev.shiftKey) {
                  ev.preventDefault();
                  send(input);
                }
              }}
              placeholder={(UI_TEXT[language] ?? UI_TEXT.en).ask}
              inputMode={kbOpen ? "none" : undefined}
              className="max-h-36 min-h-[40px] flex-1 resize-none bg-transparent py-2.5 text-[15px] outline-none placeholder:text-muted focus-visible:outline-none"
            />
            {hasKeyboard(language) && (
              <motion.button
                type="button"
                whileTap={{ scale: 0.9 }}
                onMouseDown={(ev) => ev.preventDefault()}
                onClick={() => {
                  setKbOpen((o) => !o);
                  inputRef.current?.focus();
                }}
                aria-label={kbOpen ? "Hide keyboard" : `Show ${LANGUAGES[language]?.name} keyboard`}
                title={kbOpen ? "Hide keyboard" : `Show ${LANGUAGES[language]?.name} keyboard`}
                className={cx("grid size-10 shrink-0 place-items-center rounded-full transition hover:bg-surface-2", kbOpen ? "bg-primary-soft text-primary" : "text-ink-2 hover:text-primary")}
              >
                <Keyboard className="size-5" />
              </motion.button>
            )}
            {voiceAvailable && (
              <motion.button type="button" whileTap={{ scale: 0.9 }} onClick={startVoice} disabled={busy} aria-label="Speak your question" title="Speak your question" className="grid size-10 shrink-0 place-items-center rounded-full text-ink-2 transition hover:bg-surface-2 hover:text-primary disabled:opacity-40">
                <Mic className="size-5" />
              </motion.button>
            )}
            <motion.button
              type="submit"
              disabled={!input.trim() || busy}
              whileTap={{ scale: 0.9 }}
              aria-label="Send"
              className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-on-primary transition disabled:bg-surface-3 disabled:text-muted"
            >
              <ArrowUp className="size-5" />
            </motion.button>
          </form>
          <p className="mx-auto mt-2 max-w-3xl text-center text-[11px] text-muted">Advice is based on the latest model forecast for this farm. Always confirm pest or disease issues with your local agriculture officer.</p>
        </div>

        <AnimatePresence>
          {listener.listening && <VoiceOverlay level={listener.level} onStop={listener.stop} onCancel={listener.cancel} language={language} />}
        </AnimatePresence>
      </Card>
    </div>
  );
}
