import { motion } from "motion/react";
import { BrainCircuit, CircleCheck, CircleDashed, Database, Languages, MessageSquareText, Mic, RefreshCw, Server, Sprout } from "lucide-react";
import type { ReactNode } from "react";
import { Badge, Button, Card, CardHeader, CropGlyph, Skeleton, rise, stagger } from "../components/ui";
import { cropMeta, LANGUAGES } from "../lib/meta";
import { canRecord } from "../lib/speech";
import { useStore } from "../lib/store";

function Row({ icon, title, body, ok, okLabel, offLabel }: { icon: ReactNode; title: string; body: string; ok: boolean; okLabel: string; offLabel: string }) {
  return (
    <motion.li variants={rise} className="flex items-start gap-4 py-4">
      <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-ink-2">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-semibold">{title}</div>
        <p className="text-[13px] text-muted">{body}</p>
      </div>
      <Badge tone={ok ? "primary" : "warn"} dot>
        {ok ? okLabel : offLabel}
      </Badge>
    </motion.li>
  );
}

export default function System() {
  const { health, error, loading, reload, entries } = useStore();
  const forecasts = entries.filter((e) => e.prediction);
  const latestModel = forecasts.map((e) => e.prediction!.model_version).sort().pop();

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="flex flex-col gap-6">
      <motion.div variants={rise} className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-medium">System</h1>
          <p className="mt-1 text-[15px] text-muted">What's connected behind the advisor.</p>
        </div>
        <Button variant="secondary" loading={loading} onClick={reload} icon={<RefreshCw className="size-4" />}>
          Recheck
        </Button>
      </motion.div>

      <motion.div variants={rise}>
        <Card>
          <CardHeader icon={<Server className="size-[18px]" />} title="Pipeline status" subtitle={error ? error : health ? "Advisory API is reachable" : "Checking…"} action={<Badge tone={error ? "danger" : health ? "primary" : "neutral"} dot pulse={!!health && !error}>{error ? "Offline" : health ? "Online" : "…"}</Badge>} />
          {!health && loading ? (
            <div className="space-y-3 p-6">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-14" />
              ))}
            </div>
          ) : health ? (
            <motion.ul variants={stagger} className="divide-y divide-line px-5 sm:px-6">
              <Row icon={<Database className="size-5" />} title="Field data sources" body="Open-Meteo weather, SoilGrids soil and data.gov.in mandi prices feeding the model." ok={health.mandi_key_set} okLabel="Live APIs" offLabel="Mandi key missing" />
              <Row icon={<BrainCircuit className="size-5" />} title="Harvest model" body={latestModel ? `Latest forecasts from model ${latestModel}.` : "Gradient-boosted model predicting readiness, health, maturity and yield."} ok={health.model_present} okLabel="Trained" offLabel="Not trained" />
              <Row icon={<MessageSquareText className="size-5" />} title="Language model" body="Turns the forecast fact sheet into plain advice in the farmer's language." ok={health.llm_configured} okLabel="Connected" offLabel="English templates" />
              <Row icon={<Mic className="size-5" />} title="Voice (Sarvam AI)" body={canRecord() ? "Your voice is transcribed and replies are spoken by the server's Sarvam speech APIs, in every supported language." : "This browser can't capture audio; typing and Listen still work."} ok={health.voice_configured} okLabel="Connected" offLabel="Not configured" />
            </motion.ul>
          ) : null}
        </Card>
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-2">
        <motion.div variants={rise}>
          <Card className="h-full">
            <CardHeader icon={<Sprout className="size-[18px]" />} title="Supported crops" subtitle={`${health?.crops.length ?? 0} crops the model is trained on`} />
            <div className="flex flex-wrap gap-2 p-5 pt-4 sm:p-6 sm:pt-4">
              {(health?.crops ?? []).map((c, i) => {
                const m = cropMeta(c);
                return (
                  <motion.span key={c} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.03 }} className="flex items-center gap-2 rounded-full border border-line py-1 pl-1 pr-3 text-[13px] font-medium">
                    <CropGlyph emoji={m.emoji} hue={m.hue} size={26} className="!rounded-full" />
                    {m.label}
                  </motion.span>
                );
              })}
            </div>
          </Card>
        </motion.div>
        <motion.div variants={rise}>
          <Card className="h-full">
            <CardHeader icon={<Languages className="size-[18px]" />} title="Languages" subtitle="Farmers can chat and speak in any of these" />
            <div className="grid grid-cols-2 gap-2 p-5 pt-4 sm:grid-cols-3 sm:p-6 sm:pt-4">
              {Object.entries(LANGUAGES).map(([code, l]) => (
                <div key={code} className="flex items-center justify-between rounded-xl bg-surface-2/60 px-3 py-2">
                  <span className="text-[15px] font-semibold">{l.native}</span>
                  <span className="font-mono text-[11px] uppercase text-muted">{code}</span>
                </div>
              ))}
            </div>
          </Card>
        </motion.div>
      </div>

      <motion.div variants={rise}>
        <Card className="p-5 sm:p-6">
          <div className="flex items-start gap-3 text-sm text-ink-2">
            {health?.llm_configured ? <CircleCheck className="mt-0.5 size-5 shrink-0 text-primary" /> : <CircleDashed className="mt-0.5 size-5 shrink-0 text-muted" />}
            <p>
              Every number shown in Fasal is computed by the ML model and agronomy rules on the server. The language model only explains those numbers, so advice stays grounded in the forecast. Configure live
              data, the LLM and speech providers in the backend's <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[12px]">.env</code>.
            </p>
          </div>
        </Card>
      </motion.div>
    </motion.div>
  );
}
