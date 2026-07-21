import { execFile } from "child_process";
import { promisify } from "util";
import { mkdtemp, writeFile, mkdir } from "fs/promises";
import { tmpdir } from "os";
import { join, dirname } from "path";
const exec = promisify(execFile);

export type Changeset = { path: string; content: string }[];

/**
 * Write a changeset to an isolated temp dir and run its test command.
 * SECURITY: this executes model-generated code. In production run it inside a
 * locked-down container/microVM (gVisor, Firecracker) with no secrets and no
 * network. Here it's a temp dir with a hard timeout — safe for trusted use,
 * not for untrusted multi-tenant execution.
 */
export async function runInSandbox(changeset: Changeset, testCmd?: string, timeoutMs = 60_000): Promise<{ passed: boolean; output: string }> {
  const dir = await mkdtemp(join(tmpdir(), "swarm-"));
  try {
    for (const f of changeset) {
      const full = join(dir, f.path);
      await mkdir(dirname(full), { recursive: true });
      await writeFile(full, f.content);
    }
    if (!testCmd) return { passed: true, output: "No test command provided; skipped execution." };
    const [cmd, ...args] = testCmd.split(" ");
    const { stdout, stderr } = await exec(cmd, args, { cwd: dir, timeout: timeoutMs, env: { PATH: process.env.PATH } });
    return { passed: true, output: (stdout + stderr).slice(0, 4000) };
  } catch (e: any) {
    return { passed: false, output: String(e.stdout ?? "" + (e.stderr ?? e.message)).slice(0, 4000) };
  }
}
