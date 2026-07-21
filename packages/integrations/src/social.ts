/**
 * Social publishing. Each function posts to a network's official API and needs
 * a valid access token for that network (stored per-business as an Integration).
 * Tokens are passed in by the caller (decrypted from the Integration record).
 */
export async function publishLinkedIn(token: string, authorUrn: string, text: string): Promise<string> {
  const res = await fetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Restli-Protocol-Version": "2.0.0" },
    body: JSON.stringify({ author: authorUrn, lifecycleState: "PUBLISHED", specificContent: { "com.linkedin.ugc.ShareContent": { shareCommentary: { text }, shareMediaCategory: "NONE" } }, visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" } }),
  });
  if (!res.ok) throw new Error(`LinkedIn ${res.status}: ${await res.text()}`);
  return res.headers.get("x-restli-id") ?? "posted";
}

export async function publishFacebookPage(pageId: string, token: string, message: string, link?: string): Promise<string> {
  const body = new URLSearchParams({ message, access_token: token, ...(link && { link }) });
  const res = await fetch(`https://graph.facebook.com/v20.0/${pageId}/feed`, { method: "POST", body });
  if (!res.ok) throw new Error(`Facebook ${res.status}: ${await res.text()}`);
  return (await res.json() as any).id;
}

export async function publishInstagram(igUserId: string, token: string, imageUrl: string, caption: string): Promise<string> {
  // 2-step: create media container, then publish
  const create = await fetch(`https://graph.facebook.com/v20.0/${igUserId}/media`, { method: "POST", body: new URLSearchParams({ image_url: imageUrl, caption, access_token: token }) });
  const containerId = (await create.json() as any).id;
  const pub = await fetch(`https://graph.facebook.com/v20.0/${igUserId}/media_publish`, { method: "POST", body: new URLSearchParams({ creation_id: containerId, access_token: token }) });
  if (!pub.ok) throw new Error(`Instagram ${pub.status}: ${await pub.text()}`);
  return (await pub.json() as any).id;
}

export async function publishX(token: string, text: string): Promise<string> {
  const res = await fetch("https://api.twitter.com/2/tweets", {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`X ${res.status}: ${await res.text()}`);
  return (await res.json() as any).data?.id;
}

/** Dispatch to the right network. Returns a provider reference id. */
export async function publishToChannel(channel: string, creds: Record<string, string>, content: string, mediaUrl?: string): Promise<string> {
  switch (channel) {
    case "linkedin": return publishLinkedIn(creds.token, creds.authorUrn, content);
    case "facebook": return publishFacebookPage(creds.pageId, creds.token, content, mediaUrl);
    case "instagram": if (!mediaUrl) throw new Error("Instagram requires an image"); return publishInstagram(creds.igUserId, creds.token, mediaUrl, content);
    case "x": return publishX(creds.token, content);
    default: throw new Error(`Publishing to ${channel} not yet wired (add a client in social.ts)`);
  }
}
