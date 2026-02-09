// dictation-app.js

import { decreaseSampleRate, convertFloat32ToInt16 } from './audioUtils.js';

const OUTPUT_SAMPLE_RATE = 16000;
const REFRESH_RATE_MS = 10;

export class DictationApp {
  constructor(language = "fr") {
    this.isRecording = false;
    this.language = language;

    this.ws = null;
    this.stream = null;
    this.audioContext = null;
    this.workletNode = null;

    this.refreshData = new Int16Array(0);
    this.previousSendTime = 0;
    this.isWorkletLoaded = false;

    // 🔑 Suivi du contexte actif
    this.currentActiveInput = null;
    this.activeInputSnapshot = null; // Snapshot du champ au moment de l'envoi audio

    // 🆕 File de séquences: pour chaque paquet audio envoyé, on stocke le champ cible
    this.audioSequenceQueue = []; // [{inputElement, timestamp, sequenceId}]
    this.sequenceCounter = 0;

    // 🆕 Debounce pour détecter le changement de focus
    this.focusChangeTimeout = null;
    this.pendingContextChange = false;

    // Callbacks
    this.onRecordingStateChange = (isRecording) =>
      console.log("Recording:", isRecording);
    this.onTranscriptUpdate = (text, targetInput) =>
      console.log("Transcript:", text);
    this.onError = (message) => console.error("Error:", message);
  }

  /**
   * 🆕 Capture l'élément actuellement actif s'il est valide
   */
  captureActiveInput() {
    const currentActive = document.activeElement;

    const isValidInput =
      currentActive &&
      (currentActive.tagName === "INPUT" ||
        currentActive.tagName === "TEXTAREA") &&
      document.body.contains(currentActive);

    return isValidInput ? currentActive : null;
  }

  /**
   * 🆕 Détecte si le focus a changé
   */
  detectFocusChange() {
    const currentInput = this.captureActiveInput();

    // Si changement détecté
    if (currentInput !== this.currentActiveInput) {
      const oldInput = this.currentActiveInput;
      this.currentActiveInput = currentInput;

      if (oldInput && currentInput) {
        console.log(
          `[Focus] Changement: ${oldInput.id || oldInput.name || "input"} → ${
            currentInput.id || currentInput.name || "input"
          }`
        );
      } else if (currentInput) {
        console.log(
          `[Focus] Nouveau champ actif: ${
            currentInput.id || currentInput.name || "input"
          }`
        );
      } else {
        console.log("[Focus] Plus de champ actif");
      }

      // Signaler qu'un changement de contexte est en attente
      this.pendingContextChange = true;

      // Invalider les séquences en attente de l'ancien input
      if (oldInput) {
        this.invalidateSequencesForInput(oldInput);
      }

      return true;
    }

    return false;
  }

  /**
   * 🆕 Invalide toutes les séquences liées à un input spécifique
   */
  invalidateSequencesForInput(inputElement) {
    const before = this.audioSequenceQueue.length;
    this.audioSequenceQueue = this.audioSequenceQueue.filter(
      (seq) => seq.inputElement !== inputElement
    );
    const removed = before - this.audioSequenceQueue.length;

    if (removed > 0) {
      console.log(`[Sequence] ${removed} séquence(s) invalidée(s)`);
    }
  }

  /**
   * 🆕 Enregistre qu'un paquet audio a été envoyé pour un input donné
   */
  registerAudioSequence(inputElement) {
    if (!inputElement) return null;

    const sequenceId = ++this.sequenceCounter;
    const sequence = {
      inputElement,
      timestamp: Date.now(),
      sequenceId,
    };

    this.audioSequenceQueue.push(sequence);

    // Nettoyer les vieilles séquences (>5 secondes sans réponse = anormal)
    const cutoffTime = Date.now() - 5000;
    this.audioSequenceQueue = this.audioSequenceQueue.filter(
      (seq) => seq.timestamp > cutoffTime
    );

    console.log(
      `[Sequence] Audio #${sequenceId} envoyé pour input, file: ${this.audioSequenceQueue.length}`
    );

    return sequenceId;
  }

  /**
   * 🆕 Récupère le prochain input de destination attendu
   * Retourne null si la file est vide ou si l'input n'est plus valide
   */
  getNextExpectedInput() {
    // Nettoyer les inputs qui ne sont plus dans le DOM
    this.audioSequenceQueue = this.audioSequenceQueue.filter((seq) =>
      document.body.contains(seq.inputElement)
    );

    if (this.audioSequenceQueue.length === 0) {
      return null;
    }

    // Retourner le plus ancien (FIFO)
    const sequence = this.audioSequenceQueue[0];
    return sequence.inputElement;
  }

  /**
   * 🆕 Consomme la prochaine séquence de la file
   */
  consumeNextSequence() {
    if (this.audioSequenceQueue.length === 0) {
      return null;
    }

    const sequence = this.audioSequenceQueue.shift();
    console.log(
      `[Sequence] Consommation #${sequence.sequenceId}, reste: ${this.audioSequenceQueue.length}`
    );

    return sequence;
  }

  /**
   * 🆕 Insère le texte dans le bon input selon la file de séquences
   */
  insertTranscription(text) {
    // Récupérer la séquence attendue
    const sequence = this.consumeNextSequence();

    if (!sequence) {
      console.warn(
        "[Insert] ⚠️ Aucune séquence en attente - transcription ignorée"
      );
      return false;
    }

    const targetInput = sequence.inputElement;

    // Vérifier que l'input est toujours valide
    if (!document.body.contains(targetInput)) {
      console.warn("[Insert] ⚠️ Input cible plus dans le DOM");
      return false;
    }

    if (targetInput.tagName !== "INPUT" && targetInput.tagName !== "TEXTAREA") {
      console.warn("[Insert] ⚠️ Élément cible invalide");
      return false;
    }

    // ✅ INSERTION
    const pos = targetInput.selectionStart ?? targetInput.value.length;
    const end = targetInput.selectionEnd ?? pos;

    targetInput.value =
      targetInput.value.slice(0, pos) + text + targetInput.value.slice(end);

    const newPos = pos + text.length;
    targetInput.setSelectionRange(newPos, newPos);

    // Déclencher l'événement input pour les frameworks
    targetInput.dispatchEvent(new Event("input", { bubbles: true }));

    const inputName = targetInput.id || targetInput.name || "input";
    console.log(`[Insert] ✓ Texte inséré dans "${inputName}": "${text}"`);

    // Notifier via callback
    this.onTranscriptUpdate(text, targetInput);

    return true;
  }

  /**
   * Envoie le tampon audio au WebSocket
   */
  sendData(audioBuffer) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      // 🔑 CAPTURER le champ actif au moment de l'envoi
      const targetInput = this.captureActiveInput();

      if (!targetInput) {
        console.warn("[Send] Pas de champ actif - audio non envoyé");
        return;
      }

      // Enregistrer la séquence: cet audio correspond à ce champ
      this.registerAudioSequence(targetInput);

      // Réinitialiser le flag de changement de contexte
      this.pendingContextChange = false;

      // Envoyer l'audio
      this.ws.send(audioBuffer);
    }
  }

  /**
   * Traite l'audio du worklet
   */
  processAudio(sampleData) {
    if (!this.audioContext || this.audioContext.state === "closed") return;

    // 🆕 Vérifier si le focus a changé
    this.detectFocusChange();

    const decreaseResultBuffer = decreaseSampleRate(
      sampleData,
      this.audioContext.sampleRate,
      OUTPUT_SAMPLE_RATE
    );
    if (!decreaseResultBuffer) return;

    const audioDataInt16 = convertFloat32ToInt16(decreaseResultBuffer);

    const currentData = this.refreshData;
    const newLength = currentData.length + audioDataInt16.length;
    const newBuffer = new Int16Array(newLength);
    newBuffer.set(currentData, 0);
    newBuffer.set(audioDataInt16, currentData.length);
    this.refreshData = newBuffer;

    const currentTime = Date.now();
    if (currentTime - this.previousSendTime > REFRESH_RATE_MS) {
      if (this.refreshData.length > 0) {
        this.sendData(this.refreshData.buffer);
      }
      this.refreshData = new Int16Array(0);
      this.previousSendTime = currentTime;
    }
  }

  /**
   * Charge le Worklet
   */
  async setupRecordingWorkletNode(context) {
    if (!context.audioWorklet) {
      throw new Error("AudioWorklet non supporté");
    }

    if (!this.isWorkletLoaded) {
      await context.audioWorklet.addModule("./audio-processor.js");
      this.isWorkletLoaded = true;
    }
    return new AudioWorkletNode(context, "audio-processor");
  }

  /**
   * Démarre l'enregistrement
   */
  async startDictation(selectedMicId) {
    if (this.isRecording) {
      console.warn("[Dictation] Déjà en cours d'enregistrement");
      return;
    }
    if (!selectedMicId) {
      throw new Error("Microphone non sélectionné");
    }

    // 🔑 Capturer le champ actif initial
    this.currentActiveInput = this.captureActiveInput();

    if (this.currentActiveInput) {
      const inputName =
        this.currentActiveInput.id || this.currentActiveInput.name || "input";
      console.log(`[Dictation] Démarrage avec champ actif: "${inputName}"`);
    } else {
      console.log("[Dictation] Démarrage sans champ actif");
    }

    // Réinitialiser les états
    this.refreshData = new Int16Array(0);
    this.previousSendTime = Date.now();
    this.audioSequenceQueue = [];
    this.sequenceCounter = 0;
    this.pendingContextChange = false;

    // Initialiser AudioContext
    this.audioContext = new (window.AudioContext ||
      window.webkitAudioContext)();

    // Obtenir le token
    let tokenRes, access_token, transcription_uuid;
    try {
      tokenRes = await fetch("http://localhost:3000/transcribe");
      if (!tokenRes.ok) {
        throw new Error(`HTTP ${tokenRes.status}`);
      }
      const data = await tokenRes.json();
      access_token = data.access_token;
      transcription_uuid = data.transcription_uuid;
      console.log("[API] Token obtenu");
    } catch (error) {
      console.error("[API] Erreur token:", error);
      this.cleanup();
      this.onError(`Impossible d'obtenir le token: ${error.message}`);
      throw error;
    }

    // WebSocket
    const wsUrl = `wss://ts.backend.praxysante.fr/dev-partenaires/ws/transcribe/${transcription_uuid}?token=${access_token}&user_uuid=USERDEMO&language=${this.language}&dictation_mode=true&full_text=true`;
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = async () => {
      console.log("[WebSocket] Connexion établie");

      if (!this.audioContext || this.audioContext.state === "closed") {
        this.onError("Erreur: AudioContext invalide");
        this.stopDictation();
        return;
      }

      try {
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: selectedMicId } },
        });
        const input = this.audioContext.createMediaStreamSource(this.stream);
        const recordingNode = await this.setupRecordingWorkletNode(
          this.audioContext
        );
        this.workletNode = recordingNode;

        recordingNode.port.onmessage = (event) => {
          this.processAudio(event.data);
        };

        input.connect(recordingNode);

        this.isRecording = true;
        this.onRecordingStateChange(true);
        console.log("[Dictation] ✓ Enregistrement démarré");
      } catch (error) {
        this.isRecording = false;
        this.onRecordingStateChange(false);
        this.cleanup();
        throw error;
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (
          data.type === "transcript" &&
          data.message &&
          data.message.transcript
        ) {
          const newText = data.message.transcript;

          // 🎯 INSERTION selon la file de séquences
          this.insertTranscription(newText);
        } else if (data.type) {
          console.log(`[WebSocket] Message - type: ${data.type}`);
        }
      } catch (e) {
        console.warn("[WebSocket] Message non JSON:", e);
      }
    };

    this.ws.onerror = (err) => {
      console.error("[WebSocket] Erreur:", err);
      this.stopDictation();
    };

    this.ws.onclose = () => {
      console.log("[WebSocket] Connexion fermée");
      if (this.isRecording) {
        this.stopDictation();
      }
    };
  }

  /**
   * Nettoie les ressources
   */
  cleanup() {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }

    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }

    if (this.audioContext && this.audioContext.state !== "closed") {
      this.audioContext.close().catch(console.error);
    }
    this.audioContext = null;

    this.refreshData = new Int16Array(0);
    this.audioSequenceQueue = [];
  }

  /**
   * Arrête l'enregistrement
   */
  stopDictation() {
    this.isRecording = false;
    this.onRecordingStateChange(false);

    this.cleanup();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.isWorkletLoaded = false;
    this.currentActiveInput = null;
    this.pendingContextChange = false;
  }
}