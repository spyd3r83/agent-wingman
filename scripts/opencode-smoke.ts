import { existsSync } from "node:fs"
import { cp, mkdir, mkdtemp, rm } from "node:fs/promises"
import { delimiter, join } from "node:path"
import { tmpdir } from "node:os"

const executable = process.platform === "win32" ? "opencode.exe" : "opencode"
const platform = process.platform === "win32" ? "windows" : process.platform
const packagePrefix = `opencode-${platform}-${process.arch}`
const localCandidates = [
  join(process.cwd(), "node_modules", packagePrefix, "bin", executable),
  join(process.cwd(), "node_modules", `${packagePrefix}-baseline`, "bin", executable),
]
const opencode = [process.env.OPENCODE_BIN, ...localCandidates, Bun.which("opencode")]
  .find((candidate): candidate is string => Boolean(candidate && existsSync(candidate)))
if (!opencode) throw new Error("OpenCode binary not found; set OPENCODE_BIN or install opencode-ai")

const root = await mkdtemp(join(tmpdir(), "agent-wingman-opencode-"))
const project = join(root, "project")
const pluginDirectory = join(project, ".opencode", "plugins")

try {
  await mkdir(pluginDirectory, { recursive: true })
  await cp(join(process.cwd(), "dist", "src", "index.js"), join(pluginDirectory, "agent-wingman.js"))

  const env = {
    ...process.env,
    AGENT_WINGMAN_MODE: "shadow",
    OPENCODE_DISABLE_AUTOUPDATE: "true",
    OPENCODE_DISABLE_DEFAULT_PLUGINS: "true",
    OPENCODE_DISABLE_LSP_DOWNLOAD: "true",
    OPENCODE_DISABLE_MODELS_FETCH: "true",
    XDG_CACHE_HOME: join(root, "cache"),
    XDG_CONFIG_HOME: join(root, "config"),
    XDG_DATA_HOME: join(root, "data"),
    XDG_STATE_HOME: join(root, "state"),
    PATH: `${join(process.cwd(), "node_modules", ".bin")}${delimiter}${process.env.PATH ?? ""}`,
  }
  const processHandle = Bun.spawn([opencode, "debug", "config", "--print-logs", "--log-level", "DEBUG"], {
    cwd: project,
    env,
    stdout: "pipe",
    stderr: "pipe",
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    processHandle.exited,
    new Response(processHandle.stdout).text(),
    new Response(processHandle.stderr).text(),
  ])
  const output = `${stdout}\n${stderr}`
  if (exitCode !== 0) throw new Error(`OpenCode startup failed (${exitCode}): ${output}`)
  if (/failed to load plugin|module not found|cannot find module|plugin[^\n]*error/i.test(output)) {
    throw new Error(`OpenCode reported a plugin load error: ${output}`)
  }
  const initializationReceipts = output.match(/agent-wingman[^\n]*initialized/gi) ?? []
  if (initializationReceipts.length === 0) {
    throw new Error(`OpenCode did not initialize Agent Wingman: ${output}`)
  }
  if (initializationReceipts.length > 1) {
    throw new Error(`OpenCode initialized Agent Wingman more than once: ${output}`)
  }
  console.log(JSON.stringify({
    status: "ok",
    version: process.env.OPENCODE_VERSION ?? "host-installed",
    opencode,
    plugin: "agent-wingman",
    initializationReceipts: initializationReceipts.length,
  }))
} finally {
  await rm(root, { recursive: true, force: true })
}
