// dictation-app.js

import { decreaseSampleRate, convertFloat32ToInt16 } from './audioUtils.js';

const OUTPUT_SAMPLE_RATE = 16000;
const REFRESH_RATE_MS = 20;

export class DictationApp {
  constructor(language = 'fr') {
    this.isRecording = false;
    this.language = language;

    this.ws = null;
    this.stream = null;
    this.audioContext = null;
    this.workletNode = null;
    this.activeInput = null;
    this.cursorPos = 0;

    this.refreshData = new Int16Array(0); 
    this.previousSendTime = 0;
    this.isWorkletLoaded = false;

    // Références DOM pour les événements 
    this.onRecordingStateChange = (isRecording) => console.log('Recording:', isRecording);
    this.onTranscriptUpdate = (text) => console.log('Transcript:', text);
    this.onError = (message) => console.error('Error:', message);
  }

  // --- Utility Methods ---

  /**
   * Insère le texte à la position du curseur dans l'élément actif.
   * (Équivalent de la fonction insertAtCursor)
   * @param {string} text Le texte à insérer.
   */
  insertAtCursor(text) {
    const input = this.activeInput;
    if (!input) {
      this.onError("ERREUR D'INSERTION: Champ de saisie actif non défini.");
      return;
    }

    const pos = input.selectionStart;
    let textToInsert = text;

    // Gérer l'espacement: ajoute un espace si le caractère précédent n'était pas un espace
    // ET si le texte à insérer ne commence pas déjà par un espace.
    if (pos > 0 && input.value[pos - 1] !== " " && text[0] !== " ") {
      textToInsert = " " + text;
    }

    // Mise à jour de la valeur de l'élément DOM
    const newValue =
      input.value.slice(0, pos) + textToInsert + input.value.slice(pos);
    input.value = newValue;

    // Mise à jour de la position du curseur
    const newPos = pos + textToInsert.length;
    input.setSelectionRange(newPos, newPos);
    this.cursorPos = newPos;

    // Déclencher un événement 'input' pour les frameworks (comme React) qui pourraient écouter
    input.dispatchEvent(new Event("input", { bubbles: true }));

    console.log(`Texte inséré. Nouveau curseur à: ${newPos}`);
    this.onTranscriptUpdate(newValue); // Mettre à jour le DOM ou l'état de l'application externe
  }

  /**
   * Envoie le tampon audio au WebSocket.
   * (Équivalent de la fonction sendData)
   * @param {ArrayBuffer} audioBuffer Le tampon audio Int16.buffer à envoyer.
   */
  sendData(audioBuffer) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(audioBuffer);
    }
  }

  /**
   
   * @param {Float32Array} sampleData 
   */
  processAudio(sampleData) {
    if (!this.audioContext || this.audioContext.state === "closed") return;

    // 1. Ré-échantillonnage
    const decreaseResultBuffer = decreaseSampleRate(
      sampleData,
      this.audioContext.sampleRate,
      OUTPUT_SAMPLE_RATE
    );
    if (!decreaseResultBuffer) return;

    // 2. Conversion en Int16
    const audioDataInt16 = convertFloat32ToInt16(decreaseResultBuffer);

    // 3. Accumulation des données
    const currentData = this.refreshData;
    const newLength = currentData.length + audioDataInt16.length;
    const newBuffer = new Int16Array(newLength);
    newBuffer.set(currentData, 0);
    newBuffer.set(audioDataInt16, currentData.length);
    this.refreshData = newBuffer;

    // 4. Vérification et envoi
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
   * Charge le Worklet et crée le nœud.
   * @param {AudioContext} context
   */
  async setupRecordingWorkletNode(context) {
    if (!context.audioWorklet) {
      throw new Error("AudioWorklet non supporté par ce navigateur.");
    }

    if (!this.isWorkletLoaded) {
      console.log("Chargement du module audio-processor.js...");
      try {
        await context.audioWorklet.addModule("./audio-processor.js");
        this.isWorkletLoaded = true;
      } catch (e) {
        console.error("Erreur lors du chargement du module AudioWorklet:", e);
        throw new Error("Échec du chargement du script audio-processor.js.");
      }
    }
    return new AudioWorkletNode(context, "audio-processor");
  }



  /**
   * Démarre l'enregistrement et la dictée.
   * @param {string} selectedMicId L'ID du microphone à utiliser.
   * @param {HTMLElement} targetElement Le champ de saisie (INPUT/TEXTAREA) cible.
   */
  async startDictation(selectedMicId, targetElement) {
    if (this.isRecording) return;
    if (!selectedMicId) throw new Error("Microphone non sélectionné");

    // 1. Validation de l'élément cible
    if (
      !targetElement ||
      !(
        targetElement.tagName === "INPUT" ||
        targetElement.tagName === "TEXTAREA"
      )
    ) {
      this.onError("Veuillez sélectionner un champ de saisie valide.");
      throw new Error("Élément cible non valide ou manquant.");
    }

    // 2. Sauvegarde de l'élément et de la position
    this.activeInput = targetElement;
    this.cursorPos = targetElement.selectionStart || targetElement.value.length || 0;
    targetElement.focus();
    console.log(`Element cible sauvegardé: ${targetElement.tagName}. Démarrage à la position: ${this.cursorPos}`);


    this.refreshData = new Int16Array(0);
    this.previousSendTime = Date.now();
    
    // 3. Obtention du token
    const tokenRes = await fetch("https://praxy.app/getuuid/transcribe");
    const { access_token, transcription_uuid } = await tokenRes.json();
    console.log("Obtention du token d'accès et de l'UUID de transcription.");

    // 4. Configuration du WebSocket
    const wsUrl = `wss://ts.backend.praxysante.fr/dev-partenaires/ws/transcribe/${transcription_uuid}?token=${access_token}&user_uuid=USERDEMO&language=${this.language}&dictation_mode=true&full_text=true`;
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = async () => {
      console.log("WS OPEN - Démarrage de l'enregistrement...");
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

      try {
        // 5. Accès au micro
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: selectedMicId } },
        });

        const input = this.audioContext.createMediaStreamSource(this.stream);
        const recordingNode = await this.setupRecordingWorkletNode(this.audioContext);
        this.workletNode = recordingNode;

        // 6. Connexion de l'AudioWorklet et gestion des messages
        recordingNode.port.onmessage = (event) => {
          this.processAudio(event.data);
        };

        input.connect(recordingNode);
        // Mise à jour de l'état
        this.isRecording = true;
        this.onRecordingStateChange(true);

      } catch (error) {
        console.error("Erreur de démarrage audio/micro :", error);
        if (this.audioContext && this.audioContext.state !== "closed") this.audioContext.close();
        this.isRecording = false;
        this.onRecordingStateChange(false);
        this.onError(`Erreur d'accès au micro: ${error.name || error.message}`);
        throw error;
      }
    };

    // 7. Gestion des messages du WebSocket
    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (
          data.type === "transcript" &&
          data.message &&
          data.message.transcript
        ) {
          const newText = data.message.transcript;
          console.log("Texte reçu du serveur (avant insertion):", newText);
          this.insertAtCursor(newText);
        } else {
          console.log(`Statut WS: ${data.type}`);
        }
      } catch {
        console.warn("Message WS non JSON ou erreur de parsing.");
      }
    };

    this.ws.onerror = (err) => {
      console.error("WS ERROR:", err);
      this.onError("Erreur de connexion au serveur de transcription.");
      this.stopDictation(); // Arrêter la dictée en cas d'erreur WS
    };
    
    this.ws.onclose = () => {
      console.warn("WS CLOSED");
      this.stopDictation(); // Arrêter la dictée en cas de fermeture WS
    };
  }

  /**
   * Arrête l'enregistrement et ferme les connexions.
   */
  stopDictation() {
    this.isRecording = false;
    this.onRecordingStateChange(false);

    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }

    // Fermer l'AudioContext
    if (this.audioContext && this.audioContext.state !== "closed") {
      this.audioContext.close().catch(console.error);
    }
    this.audioContext = null;
    this.workletNode = null;

    // Fermer le WebSocket
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    // Réinitialiser les tampons
    this.refreshData = new Int16Array(0);
    this.isWorkletLoaded = false;
    this.activeInput = null;
  }
}