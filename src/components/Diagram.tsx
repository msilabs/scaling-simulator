"use client";

import {
  DB_CAPACITY,
  REPLICA_CAPACITY,
  SERVER_CAPACITY,
  type ServerState,
  type SimResult,
} from "@/lib/model";
import { bn, pct } from "@/lib/format";
import { DbIcon, HEALTH_TEXT, PowerIcon, UsersIcon, UtilBar, tone } from "./ui";

type Props = {
  r: SimResult;
  servers: ServerState[];
  loadBalancer: boolean;
  cache: boolean;
  replicas: number;
  /** দেওয়া থাকলে সার্ভারের কার্ডে চাপ দিয়ে বন্ধ/চালু করা যায় */
  onToggleServer?: (i: number) => void;
  caption?: string;
  /** কার্ডে চাপ দেওয়া না গেলে কেন, সেটা বলার জন্য */
  serverNote?: string;
};

function Flow({ amount, color }: { amount: number; color: string }) {
  const still = amount <= 0;
  const dur = still ? 1 : Math.max(0.25, 1.6 - Math.log10(amount + 1) * 0.45);
  return (
    <div
      className="flow"
      data-still={still}
      style={{ ["--flow-dur" as string]: `${dur}s`, ["--flow-color" as string]: color }}
      aria-hidden
    />
  );
}

export default function Diagram({ r, servers, loadBalancer, cache, replicas, onToggleServer, caption, serverNote }: Props) {
  const statusColor = tone(r.status).color;
  const interactive = !!onToggleServer;
  const cols = servers.length > 8 ? "grid-cols-3 sm:grid-cols-4 xl:grid-cols-6" : "grid-cols-2 sm:grid-cols-4";

  return (
    <div className="blueprint overflow-hidden rounded-2xl border border-line p-3 sm:p-6" data-testid="diagram">
      {caption && <p className="label mb-2 text-center text-muted">{caption}</p>}

      {/* ব্যবহারকারী */}
      <div className="mx-auto flex w-fit items-center gap-3 rounded-full border border-line bg-panel px-4 py-2">
        <UsersIcon />
        <div>
          <p className="label text-muted">ব্যবহারকারী</p>
          <p className="tnum font-bold leading-tight" data-testid="diagram-traffic">
            {bn(Math.round(r.traffic))} <span className="font-mono text-xs font-normal text-muted">req/s</span>
          </p>
        </div>
      </div>
      <Flow amount={r.traffic} color={statusColor} />

      {/* Load Balancer */}
      {loadBalancer ? (
        <div
          className={`mx-auto w-full max-w-sm rounded-lg border-2 ${r.down ? "border-bad bg-bad-soft" : "border-accent bg-accent-soft"} px-4 py-2 text-center`}
          data-testid="lb-node"
        >
          <p className="font-mono text-xs font-semibold text-accent">Load Balancer</p>
          <p className="text-sm">
            {r.activeServers > 0
              ? `${bn(r.activeServers)}টা চালু সার্ভারে সমান ভাগ (প্রতিটায় ${bn(Math.round(r.traffic / r.activeServers))} req/s)`
              : "পাঠানোর মতো কোনো চালু সার্ভার নেই"}
          </p>
        </div>
      ) : (
        <div className="mx-auto w-full max-w-sm rounded-lg border border-dashed border-line bg-panel/70 px-4 py-2 text-center text-sm text-muted">
          Load Balancer নেই: সবাই সরাসরি সার্ভার ১-এ যাচ্ছে
        </div>
      )}
      <Flow amount={r.down ? 0 : r.traffic} color={statusColor} />

      {/* সার্ভার */}
      <div className="rounded-xl border border-line bg-panel/80 p-2.5 sm:p-3">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-2">
          <p className="label text-muted">অ্যাপ সার্ভার</p>
          <p className="text-xs text-muted">
            {interactive ? "কার্ডে চাপ দিলে সার্ভার বন্ধ বা চালু হয়" : serverNote}
          </p>
        </div>
        <ul className={`grid ${cols} gap-2`}>
          {servers.map((s, i) => {
            const sr = r.servers[i];
            const t = tone(sr.health);
            const label = s.crashed
              ? "নষ্ট"
              : sr.unreachable && s.on
                ? "ট্রাফিক পৌঁছায় না"
                : HEALTH_TEXT[sr.health];
            const showUtil = s.on && !s.crashed && !s.booting && !sr.unreachable && !r.down;
            const body = (
              <>
                <span className="flex items-center justify-between gap-1">
                  <span className="font-semibold">সার্ভার {bn(i + 1)}</span>
                  {!s.booting && <PowerIcon on={s.on && !s.crashed} />}
                </span>
                <UtilBar util={s.booting ? 0 : sr.util} health={sr.health} />
                <span className="flex items-baseline justify-between gap-1 text-xs">
                  <span className={`${t.fg} font-semibold`}>{label}</span>
                  {showUtil && <span className="tnum text-muted">{pct(sr.util)}</span>}
                </span>
                {interactive && !s.crashed && (
                  <span className="text-[11px] text-muted underline decoration-dotted underline-offset-2">
                    {s.on ? "বন্ধ করো" : "চালু করো"}
                  </span>
                )}
              </>
            );
            const cls = `flex w-full flex-col gap-1 rounded-lg border-2 ${t.border} ${
              sr.health === "off" ? "bg-paper opacity-70" : t.bg
            } ${s.booting ? "border-dashed" : ""} p-2 text-left`;
            return (
              <li key={i}>
                {interactive ? (
                  <button
                    type="button"
                    id={`server-${i + 1}`}
                    data-testid={`server-${i + 1}`}
                    data-health={sr.health}
                    aria-pressed={s.on && !s.crashed}
                    aria-label={`সার্ভার ${bn(i + 1)}: ${label}। চাপ দিলে ${s.on ? "বন্ধ" : "চালু"} হবে`}
                    disabled={s.crashed}
                    onClick={() => onToggleServer?.(i)}
                    className={`${cls} transition-colors hover:brightness-[0.98] disabled:cursor-not-allowed`}
                  >
                    {body}
                  </button>
                ) : (
                  <div className={cls} data-testid={`server-${i + 1}`} data-health={sr.health}>
                    {body}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-xs text-muted">
          প্রতিটা সার্ভার {bn(SERVER_CAPACITY)} req/s সামলায়। এখন সামলানো হচ্ছে {bn(Math.round(r.appServed))}, ফেরত যাচ্ছে{" "}
          {bn(Math.round(r.appDropped))}।
        </p>
      </div>
      <Flow amount={r.appServed} color={statusColor} />

      {/* Cache */}
      {cache ? (
        <div className="mx-auto w-full max-w-sm rounded-lg border-2 border-accent bg-accent-soft px-4 py-2 text-center" data-testid="cache-node">
          <p className="font-mono text-xs font-semibold text-accent">Cache · read-এর ৮০% হিট</p>
          <p className="tnum text-sm">{bn(Math.round(r.cacheHits))} req/s এখান থেকেই উত্তর পায়</p>
        </div>
      ) : (
        <div className="mx-auto w-full max-w-sm rounded-lg border border-dashed border-line bg-panel/70 px-4 py-2 text-center text-sm text-muted">
          Cache নেই: প্রতিটা রিকোয়েস্ট ডাটাবেসে যায়
        </div>
      )}
      <Flow amount={r.dbLoad + r.replicaLoad * replicas} color={tone(r.dataUtil > 1 ? "bad" : r.dataUtil >= 0.8 ? "warn" : "ok").color} />

      {/* ডাটাবেস স্তর */}
      <div className={`mx-auto grid w-full gap-2 ${replicas > 0 ? "max-w-2xl sm:grid-cols-2" : "max-w-sm"}`}>
        <DbBox
          testId="db-node"
          title="প্রধান ডাটাবেস"
          sub={replicas > 0 ? "শুধু write" : "read + write"}
          load={r.dbLoad}
          util={r.dbUtil}
          health={r.dbHealth}
          capacity={DB_CAPACITY}
        />
        {replicas > 0 && (
          <DbBox
            testId="replica-node"
            title={`Read Replica × ${bn(replicas)}`}
            sub="শুধু read, প্রতিটায়"
            load={r.replicaLoad}
            util={r.replicaUtil}
            health={r.replicaHealth}
            capacity={REPLICA_CAPACITY}
          />
        )}
      </div>
    </div>
  );
}

function DbBox({
  testId,
  title,
  sub,
  load,
  util,
  health,
  capacity,
}: {
  testId: string;
  title: string;
  sub: string;
  load: number;
  util: number;
  health: SimResult["dbHealth"];
  capacity: number;
}) {
  const t = tone(health);
  return (
    <div className={`rounded-lg border-2 ${t.border} ${t.bg} px-4 py-2.5`} data-testid={testId} data-health={health} data-util={util.toFixed(3)}>
      <div className="flex items-center justify-between gap-2">
        <p className="flex min-w-0 items-center gap-2 font-semibold">
          <DbIcon /> {title}
        </p>
        <p className={`tnum text-sm font-semibold ${t.fg}`}>{pct(util)}</p>
      </div>
      <div className="my-1.5">
        <UtilBar util={util} health={health} />
      </div>
      <p className="tnum text-xs text-muted">
        {sub}: {bn(Math.round(load))} / {bn(capacity)} কোয়েরি/সেকেন্ড
      </p>
    </div>
  );
}
