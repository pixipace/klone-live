import { spawn } from "child_process";
import { stat } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args);
    let stdout = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.on("close", () => resolve(stdout));
    child.on("error", () => resolve(""));
  });
}

async function diskUsage() {
  const out = await run("df", ["-h", "/"]);
  const lines = out.trim().split("\n");
  if (lines.length < 2) return null;
  const cols = lines[1].split(/\s+/);
  return {
    size: cols[1],
    used: cols[2],
    available: cols[3],
    capacity: cols[4],
  };
}

async function uploadsSize(): Promise<string> {
  try {
    const out = await run("du", [
      "-sh",
      path.join(process.cwd(), ".uploads"),
    ]);
    return out.split(/\s+/)[0] || "—";
  } catch {
    return "—";
  }
}

async function ollamaStatus(): Promise<{ up: boolean; loaded: string[] }> {
  try {
    const res = await fetch("http://127.0.0.1:11434/api/ps", {
      cache: "no-store",
    });
    const data = (await res.json()) as { models?: Array<{ name: string }> };
    return { up: true, loaded: (data.models ?? []).map((m) => m.name) };
  } catch {
    return { up: false, loaded: [] };
  }
}

async function whisperModelStatus() {
  const modelPath = path.join(
    process.env.HOME || "",
    "Models/whisper/ggml-large-v3-turbo.bin"
  );
  try {
    const s = await stat(modelPath);
    return { ok: true, sizeGB: (s.size / 1024 / 1024 / 1024).toFixed(2) };
  } catch {
    return { ok: false, sizeGB: "0" };
  }
}

export default async function AdminSystemPage() {
  const [
    disk,
    uploads,
    ollama,
    whisper,
    runningJobs,
    queuedJobs,
    recentFailures,
  ] = await Promise.all([
    diskUsage(),
    uploadsSize(),
    ollamaStatus(),
    whisperModelStatus(),
    prisma.clipJob.count({ where: { status: "RUNNING" } }),
    prisma.clipJob.count({ where: { status: "QUEUED" } }),
    prisma.clipJob.findMany({
      where: { status: "FAILED" },
      orderBy: { finishedAt: "desc" },
      take: 5,
      select: {
        id: true,
        sourceUrl: true,
        sourceTitle: true,
        error: true,
        finishedAt: true,
      },
    }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">System</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Mac Mini health + clipper queue.
        </p>
      </div>

      <Section title="Disk">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Tile label="Total" value={disk?.size || "—"} />
          <Tile label="Used" value={disk?.used || "—"} />
          <Tile
            label="Free"
            value={disk?.available || "—"}
            warning={
              disk
                ? parseInt(disk.capacity) > 90
                : false
            }
          />
          <Tile label="Capacity" value={disk?.capacity || "—"} />
          <Tile label=".uploads/" value={uploads} />
        </div>
      </Section>

      <Section title="AI services">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Tile
            label="Ollama"
            value={ollama.up ? "running" : "down"}
            warning={!ollama.up}
          />
          <Tile
            label="Models loaded"
            value={String(ollama.loaded.length)}
            sub={ollama.loaded.join(", ") || "none"}
          />
          <Tile
            label="Whisper model"
            value={whisper.ok ? `${whisper.sizeGB} GB` : "missing"}
            warning={!whisper.ok}
          />
        </div>
      </Section>

      <Section title="Clipper queue">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Tile label="Running" value={String(runningJobs)} accent={runningJobs > 0} />
          <Tile label="Queued" value={String(queuedJobs)} />
          <Tile label="Recent failures" value={String(recentFailures.length)} warning={recentFailures.length > 0} />
        </div>
      </Section>

      <Section title="Recent failures">
        {recentFailures.length === 0 ? (
          <p className="text-sm text-muted-foreground">None recently. ✓</p>
        ) : (
          <div className="space-y-2">
            {recentFailures.map((j) => (
              <div
                key={j.id}
                className="px-4 py-3 rounded-lg bg-card border border-error/20 text-sm"
              >
                <p className="font-medium truncate">
                  {j.sourceTitle || j.sourceUrl}
                </p>
                <p className="text-xs text-error mt-1">{j.error}</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {j.finishedAt?.toLocaleString() || ""}
                </p>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
        {title}
      </h2>
      {children}
    </div>
  );
}

function Tile({
  label,
  value,
  sub,
  accent,
  warning,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  warning?: boolean;
}) {
  return (
    <div className="rounded-xl bg-card border border-border/60 p-4">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
        {label}
      </p>
      <p
        className={`text-xl font-light mt-1 ${
          warning ? "text-warning" : accent ? "text-accent" : "text-foreground"
        }`}
      >
        {value}
      </p>
      {sub && (
        <p className="text-[11px] text-muted-foreground mt-1 truncate">{sub}</p>
      )}
    </div>
  );
}
