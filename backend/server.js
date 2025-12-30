// back-end-api/server.js
const express = require('express');
const fetch = require('node-fetch');
require('dotenv').config();

const app = express();
const port = 3000;

// Middleware CORS
app.use((_, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
});

// Fonction pour obtenir l'UUID de transcription
async function getTranscriptionUUID(token) {
  const res = await fetch(process.env.TRANSCRIBE_URL + "/transcribe/start", {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) throw new Error(`Erreur /transcribe/start: ${await res.text()}`);

  const uuid = res.data?.uuid ?? (await res.json()).data?.uuid;
  if (!uuid) throw new Error("UUID manquant dans la réponse");

  return uuid;
}

// Route API pour l'authentification et l'obtention de l'UUID
app.get("/transcribe", async (_, res) => {
  try {
    const { TRANSCRIBE_URL, PARTNER_USERNAME, PARTNER_PASSWORD } = process.env;
    if (!PARTNER_USERNAME || !PARTNER_PASSWORD)
      return res.status(500).json({ error: "Identifiants  manquants." });

    // Authentification
    const authRes = await fetch(TRANSCRIBE_URL + "/user/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: PARTNER_USERNAME,
        password: PARTNER_PASSWORD,
      }),
    });

    if (!authRes.ok)
      throw new Error(
        `Auth PARTNER: ${authRes.status} ${await authRes.text()}`
      );

    const token = (await authRes.json()).access_token;

    // UUID transcription
    const transcription_uuid = await getTranscriptionUUID(token);

    res.json({ access_token: token, transcription_uuid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start
app.listen(port, () => console.log(`API running on port ${port}`));
