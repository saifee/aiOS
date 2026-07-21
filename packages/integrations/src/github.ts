/** Commit a changeset to a new branch and open a PR. Needs GITHUB_TOKEN (repo scope). */
const GH = "https://api.github.com";
function gh(path: string, init: RequestInit = {}) {
  return fetch(`${GH}${path}`, { ...init, headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "Content-Type": "application/json", ...init.headers } });
}

export async function openPullRequest(repo: string, branch: string, title: string, body: string, files: { path: string; content: string }[]) {
  const [owner, name] = repo.split("/");
  const base = "main";
  // 1) base sha
  const refRes = await gh(`/repos/${owner}/${name}/git/ref/heads/${base}`);
  if (!refRes.ok) throw new Error(`GitHub base ref: ${refRes.status}`);
  const baseSha = (await refRes.json() as any).object.sha;
  // 2) new branch
  await gh(`/repos/${owner}/${name}/git/refs`, { method: "POST", body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseSha }) });
  // 3) commit each file via contents API
  for (const f of files) {
    const existing = await gh(`/repos/${owner}/${name}/contents/${encodeURIComponent(f.path)}?ref=${branch}`);
    const sha = existing.ok ? (await existing.json() as any).sha : undefined;
    await gh(`/repos/${owner}/${name}/contents/${encodeURIComponent(f.path)}`, {
      method: "PUT",
      body: JSON.stringify({ message: `swarm: update ${f.path}`, content: Buffer.from(f.content).toString("base64"), branch, ...(sha && { sha }) }),
    });
  }
  // 4) open PR
  const prRes = await gh(`/repos/${owner}/${name}/pulls`, { method: "POST", body: JSON.stringify({ title, head: branch, base, body }) });
  if (!prRes.ok) throw new Error(`GitHub PR: ${prRes.status} ${await prRes.text()}`);
  return (await prRes.json() as any).html_url as string;
}
