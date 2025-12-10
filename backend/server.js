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
  const res = await fetch(process.env.TRANSCRIBE_START_URL, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) throw new Error(`Erreur /transcribe/start: ${await res.text()}`);

  const uuid = res.data?.uuid ?? (await res.json()).data?.uuid;
  if (!uuid) throw new Error("UUID manquant dans la réponse");

  return uuid;
}

// Route API pour l'authentification et l'obtention de l'UUID
app.get('/api/transcribe', async (_, res) => {
  try {
    const { KEYCLOAK_URL, KEYCLOAK_USERNAME, KEYCLOAK_PASSWORD } = process.env;
    if (!KEYCLOAK_USERNAME || !KEYCLOAK_PASSWORD)
      return res.status(500).json({ error: "Identifiants Keycloak manquants." });

    // Authentification 
    const authRes = await fetch(KEYCLOAK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: KEYCLOAK_USERNAME,
        password: KEYCLOAK_PASSWORD,
      }),
    });

    if (!authRes.ok)
      throw new Error(`Auth Keycloak: ${authRes.status} ${await authRes.text()}`);

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
