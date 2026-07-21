/** Avatar/video generation via HeyGen. Submits a job; poll status for the URL. */
export async function createAvatarVideo(script: string, opts: { avatarId?: string; voiceId?: string } = {}): Promise<{ videoId: string }> {
  if (!process.env.HEYGEN_API_KEY) throw new Error("HEYGEN_API_KEY required for video generation");
  const res = await fetch("https://api.heygen.com/v2/video/generate", {
    method: "POST", headers: { "X-Api-Key": process.env.HEYGEN_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ video_inputs: [{ character: { type: "avatar", avatar_id: opts.avatarId || process.env.HEYGEN_AVATAR_ID }, voice: { type: "text", input_text: script, voice_id: opts.voiceId || process.env.HEYGEN_VOICE_ID } }], dimension: { width: 1280, height: 720 } }),
  });
  if (!res.ok) throw new Error(`HeyGen ${res.status}: ${await res.text()}`);
  const j: any = await res.json();
  return { videoId: j.data?.video_id ?? j.video_id };
}

export async function getVideoStatus(videoId: string): Promise<{ status: string; url?: string }> {
  const res = await fetch(`https://api.heygen.com/v1/video_status.get?video_id=${videoId}`, { headers: { "X-Api-Key": process.env.HEYGEN_API_KEY! } });
  const j: any = await res.json();
  return { status: j.data?.status, url: j.data?.video_url };
}
