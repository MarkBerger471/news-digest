const fs = require("fs/promises");
const path = require("path");

async function generateScript(articles, category) {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

  const articleList = articles
    .slice(0, 5)
    .map((a, i) => `${i + 1}. ${a.title}\n   ${a.summary}`)
    .join("\n\n");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: `You are writing a script for a 3-4 minute news podcast with two hosts: Alex and Sam. They discuss today's top ${category} stories in a natural, engaging way — like two friends catching each other up on the news.

Rules:
- Alternate between Alex and Sam naturally
- Alex introduces topics, Sam adds context and reactions
- Keep it conversational, not scripted-sounding
- Each line should be 1-3 sentences max
- Cover the top 3-5 stories
- Start with a brief intro, end with a quick sign-off
- Do NOT include stage directions, sound effects, or parentheticals

Return ONLY valid JSON array, no markdown:
[
  {"host": "Alex", "text": "Hey everyone, welcome to..."},
  {"host": "Sam", "text": "..."}
]

Today's stories:
${articleList}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API error: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = data.content[0].text.trim();
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]);
    throw new Error("Failed to parse script");
  }
}

async function textToSpeech(text, voice) {
  const GOOGLE_TTS_KEY = process.env.GOOGLE_TTS_KEY;

  const res = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${GOOGLE_TTS_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: "en-US", name: voice },
        audioConfig: { audioEncoding: "MP3", speakingRate: 1.0 },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`TTS error: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  return Buffer.from(data.audioContent, "base64");
}

module.exports = async function handler(req, res) {
  const GOOGLE_TTS_KEY = process.env.GOOGLE_TTS_KEY;
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

  if (!GOOGLE_TTS_KEY || !ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "API keys not configured" });
  }

  const category = req.query.category || "world-news";

  let articles;
  try {
    const audience = req.query.audience || "teen";
    const latestFile = audience === "teen" ? "latest-teen.json" : "latest.json";
    const dataPath = path.join(process.cwd(), "data", latestFile);
    const digest = JSON.parse(await fs.readFile(dataPath, "utf-8"));
    articles = digest.categories?.[category];
    if (!articles || articles.length === 0) {
      return res.status(404).json({ error: `No articles for ${category}` });
    }
  } catch (err) {
    return res.status(500).json({ error: `Failed to read digest: ${err.message}` });
  }

  try {
    const script = await generateScript(articles, category);

    const voices = {
      Alex: "en-US-Neural2-J",
      Sam: "en-US-Neural2-F",
    };

    const audioBuffers = [];
    for (let i = 0; i < script.length; i += 5) {
      const batch = script.slice(i, i + 5);
      const results = await Promise.all(
        batch.map((line) =>
          textToSpeech(line.text, voices[line.host] || voices.Alex)
        )
      );
      audioBuffers.push(...results);
    }

    const combined = Buffer.concat(audioBuffers);

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(combined);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
