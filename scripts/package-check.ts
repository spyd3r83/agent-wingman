import { access, readFile } from "node:fs/promises"

const required = ["dist/src/index.js", "dist/src/index.d.ts", "dist/bin/replay.js", "LICENSE", "README.md"]
for (const file of required) await access(file)

const manifest = JSON.parse(await readFile("package.json", "utf8")) as Record<string, unknown>
if (manifest.private === true) throw new Error("package.json is still private")
if (manifest.name !== "opencode-agent-wingman") throw new Error("unexpected package name")
for (const field of ["dependencies", "peerDependencies", "optionalDependencies"]) {
  const dependencies = manifest[field]
  if (typeof dependencies !== "object" || dependencies === null) continue
  for (const name of Object.keys(dependencies)) {
    if (name === "opencode-ai" || name.startsWith("@opencode-ai/")) {
      throw new Error(`${field} must not install or pin an OpenCode release`)
    }
  }
}

for (const declaration of ["dist/src/index.d.ts", "dist/src/opencode.d.ts"]) {
  const contents = await readFile(declaration, "utf8")
  if (contents.includes("@opencode-ai/") || contents.includes("opencode-ai")) {
    throw new Error(`${declaration} leaks a versioned OpenCode type dependency`)
  }
}

const pack = Bun.spawn(["bun", "pm", "pack", "--dry-run"], { stdout: "pipe", stderr: "pipe" })
const [exitCode, stdout, stderr] = await Promise.all([
  pack.exited,
  new Response(pack.stdout).text(),
  new Response(pack.stderr).text(),
])
if (exitCode !== 0) throw new Error(`package dry-run failed: ${stderr}`)
const output = `${stdout}\n${stderr}`
for (const forbidden of [".env", "fixtures/traces", "tests/", "node_modules/"]) {
  if (output.includes(forbidden)) throw new Error(`package unexpectedly includes ${forbidden}`)
}
console.log(JSON.stringify({ status: "ok", requiredFiles: required.length }))
