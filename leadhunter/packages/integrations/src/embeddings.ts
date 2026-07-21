/** Embeddings for the Knowledge Brain. OpenAI text-embedding-3-small (1536-dim).
 *  Swappable for Voyage/Gemini by changing this one function. */
export async function embed(text: string): Promise<number[]> {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY required for embeddings");
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "text-embedding-3-small", input: text.slice(0, 8000) }),
  });
  if (!res.ok) throw new Error(`Embeddings ${res.status}: ${await res.text()}`);
  const json: any = await res.json();
  return json.data[0].embedding;
}
