/** Image generation via OpenAI Images API (gpt-image-1). Returns a data URL. */
export async function generateImage(prompt: string, size: "1024x1024" | "1536x1024" | "1024x1536" = "1024x1024"): Promise<{ b64: string }> {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY required for image generation");
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-image-1", prompt, size, n: 1 }),
  });
  if (!res.ok) throw new Error(`Image gen ${res.status}: ${await res.text()}`);
  const j: any = await res.json();
  return { b64: j.data[0].b64_json };
}
