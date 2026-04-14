module.exports = async function handler(req, res) {
  const GOOGLE_TTS_KEY = process.env.GOOGLE_TTS_KEY;
  if (!GOOGLE_TTS_KEY) {
    return res.status(500).json({ error: "TTS not configured" });
  }

  const text = req.query.text || req.body?.text;
  if (!text || text.length > 5000) {
    return res.status(400).json({ error: "Text required (max 5000 chars)" });
  }

  try {
    const response = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${GOOGLE_TTS_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: { text },
          voice: { languageCode: "en-US", name: "en-US-Neural2-J" },
          audioConfig: { audioEncoding: "MP3", speakingRate: 1.0 },
        }),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      return res.status(502).json({ error: "TTS API error", details: err.slice(0, 200) });
    }

    const data = await response.json();
    const audioBuffer = Buffer.from(data.audioContent, "base64");

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(audioBuffer);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
