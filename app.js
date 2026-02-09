// app.js
// Logique d'interaction et de dictée vocale pour PraxySanté

import { DictationApp } from './dictation-app.js';


let dictationApp;
let activeElement = null;
let selectedMicId = "";
let allTexts = {}; 
let isUILoading = false;

// --- Références DOM ---
const loadingOverlay = document.getElementById('loading-overlay');
const loadingText = document.getElementById('loading-text');

const dictationBtn = document.getElementById('dictation-toggle-btn');
const micSelect = document.getElementById('mic-select');
const micSelectTrigger = document.getElementById('mic-select-trigger'); 
const langSelect = document.getElementById('language-select');
const messageArea = document.getElementById('message-area');
const micIconContainer = document.getElementById('mic-icon');
const flagImage = document.getElementById('lang-flag-image');

const titleElement = document.getElementById('app-title');
const patientLabel = document.getElementById('label-patient');
const symptomsLabel = document.getElementById('label-symptoms');
const notesLabel = document.getElementById('label-notes');
const inputPatient = document.getElementById('input-patient');
const inputSymptoms = document.getElementById('input-symptoms');
const textareaNotes = document.getElementById('textarea-notes');
const instructionsContainer = document.getElementById('instructions-container');
const instructionsTitle = document.getElementById('instructions-title');
const instructionsList = document.getElementById('instructions-list');



/**
  Définit l'élément de saisie actif et la position du curseur.
  Reste accessible globalement via window.setActiveElement
  @param {HTMLInputElement|HTMLTextAreaElement} element 
 */
window.setActiveElement = (element) => {
  activeElement = element;
  console.log("Champ actif:", activeElement.id);
};

/**
 * Met à jour l'icône et le style du bouton d'enregistrement.
 * @param {boolean} isRecording
 */
const updateButtonState = (isRecording) => {
  if (isRecording) {
    dictationBtn.classList.remove(
      "bg-blue-600",
      "hover:bg-blue-700",
      "bg-gray-500",
      "opacity-70",
      "cursor-not-allowed"
    );
    dictationBtn.classList.add(
      "bg-red-600",
      "ring-4",
      "ring-red-300/50",
      "animate-pulse"
    );
    // Icône MicOff (ou Stop)
    micIconContainer.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6 text-white"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
  } else {
    dictationBtn.classList.remove(
      "bg-red-600",
      "ring-4",
      "ring-red-300/50",
      "animate-pulse",
      "bg-gray-500",
      "opacity-70",
      "cursor-not-allowed"
    );
    dictationBtn.classList.add("bg-blue-600", "hover:bg-blue-700");
    // Icône Mic
    micIconContainer.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6 text-white"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="22"></line></svg>`;
  }
  dictationBtn.disabled = false;
};

/**
 * Active l'état de chargement sur le bouton de dictée (spinner).
 * @param {boolean} isLoading
 */
const setLoadingState = (isLoading) => {
  if (isLoading) {
    dictationBtn.disabled = true;
    dictationBtn.classList.remove(
      "bg-blue-600",
      "hover:bg-blue-700",
      "bg-red-600",
      "animate-pulse",
      "shadow-red-500/50"
    );
    dictationBtn.classList.add(
      "bg-gray-500",
      "opacity-70",
      "cursor-not-allowed"
    );
    micIconContainer.innerHTML = `<svg class="w-6 h-6 text-white animate-spin" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>`;
  } else {
    dictationBtn.disabled = false;
    dictationBtn.classList.remove(
      "bg-gray-500",
      "opacity-70",
      "cursor-not-allowed"
    );
  }
};

/**
 * Réinitialise le bouton à son état normal (Microphone prêt) après une erreur de démarrage.
 */
const resetButtonState = () => {
  setLoadingState(false);
  updateButtonState(false);
};

/**
  Affiche un message d'erreur ou de statut temporaire.
  @param {string} message 
  @param {boolean} isError 
 */
const displayMessage = (message, isError = true) => {
  messageArea.textContent = message;
  messageArea.className = isError
    ? "fixed bottom-4 right-4 max-w-sm p-4 rounded-lg shadow-xl bg-red-100 text-red-700 border border-red-300 z-50"
    : "fixed bottom-4 right-4 max-w-sm p-4 rounded-lg shadow-xl bg-green-100 text-green-700 border border-green-300 z-50";
  messageArea.classList.remove("hidden");
  setTimeout(() => {
    messageArea.classList.add("hidden");
  }, 5000);
};

/**
 * Gère l'état de chargement du sélecteur de micro.
 * @param {boolean} isLoading
 */
const setMicLoadingState = (isLoading) => {
  if (isLoading) {
    micSelect.disabled = true;
    micSelect.classList.add("bg-gray-100", "animate-pulse");
    micSelect.innerHTML = `<option value="">Chargement des micros...</option>`;
  } else {
    micSelect.disabled = false;
    micSelect.classList.remove("bg-gray-100", "animate-pulse");
  }
};

/**
 * Affiche une modal avec des instructions pour activer les permissions du microphone
 */
const showPermissionsModal = () => {
  const texts = allTexts[langSelect.value] || allTexts["fr"];

  const screenshotSrc = "./resources/permissions-guide.png";

  const instructions = `
        <div class="space-y-4">
            <ol class="list-decimal list-inside space-y-3  text-lg">
            <li>${texts.perm_step_1}</li>
            <li>${texts.perm_step_2}</li>
            <li>${texts.perm_step_3}</li>
            </ol>
        </div>
    `;

  const modal = document.createElement("div");
  modal.id = "permissions-modal";
  modal.className =
    "fixed inset-0 bg-black/50 backdrop-blur-sm z-[10000] flex items-center justify-center p-4";
  modal.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div class="p-6 border-b border-gray-200 bg-red-50">
                <div class="flex items-start justify-between">
                    <div class="flex items-center space-x-3">
                        <svg class="w-10 h-10 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                        </svg>
                        <h2 class="text-2xl font-bold text-gray-900">${
                          texts.permissions_modal_title ||
                          "Accès au microphone requis"
                        }</h2>
                    </div>
                    <button id="close-permissions-modal" class="text-gray-400 hover:text-gray-600 transition-colors">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                    </button>
                </div>
            </div>
            <div class="p-8">
                <p class="text-gray-700 mb-6 text-lg font-medium">${
                  texts.permissions_modal_description ||
                  "Pour utiliser la dictée vocale, autorisez l'accès au microphone:"
                }</p>
                ${instructions}
                
                <div class="mt-8 rounded-lg overflow-hidden border-2 border-gray-300 shadow-lg">
                    <img src="${screenshotSrc}" 
                         alt="Instructions pour autoriser le microphone" 
                         class="w-full h-auto"
                         onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
                    <div class="hidden p-8 bg-gray-100 text-center text-gray-500">
                        <svg class="w-16 h-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                        </svg>
                    </div>
                </div>
            </div>
            <div class="p-6 bg-gray-50 border-t border-gray-200 flex justify-end space-x-3">
            
                <button id="reload-page-btn" class="px-8 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-all shadow-lg hover:shadow-xl transform hover:scale-105">
                    ${texts.reload_page || "Recharger la page"}
                </button>
            </div>
        </div>
    `;

  document.body.appendChild(modal);

  const closeModal = () => modal.remove();
  document
    .getElementById("close-permissions-modal")
    .addEventListener("click", closeModal);
 
  document
    .getElementById("reload-page-btn")
    .addEventListener("click", () => location.reload());

  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });
};

/**
 * Charge le fichier lang.json et met à jour tous les textes dans l'UI.
 * @param {string} langCode
 */
async function loadLanguageData(langCode) {
  isUILoading = true;
  if (loadingText) {
    loadingText.textContent = allTexts[langCode]?.loading || "Loading...";
  }
  loadingOverlay.classList.remove("hidden");

  try {
    if (Object.keys(allTexts).length === 0) {
      const response = await fetch("./lang.json");
      allTexts = await response.json();
    }
  } catch (e) {
    console.error("Échec du chargement de lang.json:", e);
    loadingOverlay.classList.add("hidden");
    isUILoading = false;
    return;
  }

  const texts = allTexts[langCode] || allTexts["fr"];
  const isRTL = langCode === "ar";

  flagImage.src = `./resources/${langCode}.png`;
  flagImage.alt = `${langCode.toUpperCase()} Flag`;

  document.body.dir = isRTL ? "rtl" : "ltr";
  instructionsContainer.dir = isRTL ? "rtl" : "ltr";
  titleElement.textContent = texts.title;

  patientLabel.textContent = texts.patient_name;
  symptomsLabel.textContent = texts.symptoms;
  notesLabel.textContent = texts.clinical_notes;

  inputPatient.placeholder = texts.patient_name;
  inputSymptoms.placeholder = texts.symptoms;
  textareaNotes.placeholder = texts.clinical_notes;

  const inputFields = [inputPatient, inputSymptoms, textareaNotes];
  inputFields.forEach((input) => {
    input.dir = isRTL ? "rtl" : "ltr";
    input.classList.toggle("text-right", isRTL);
    input.classList.toggle("text-left", !isRTL);
  });

  instructionsTitle.textContent = texts.instructions_title;
  instructionsList.innerHTML = "";
  texts.instructions.forEach((line) => {
    const li = document.createElement("li");
    li.textContent = line;
    instructionsList.appendChild(li);
  });

  if (dictationApp) {
    dictationApp.language = langCode;
  }
  localStorage.setItem("lastLanguage", langCode);
  setTimeout(() => {
    loadingOverlay.classList.add("hidden");
    isUILoading = false;
  }, 300);
}

// --- Fonctions de Périphériques ---

/**
 * Récupère la liste des microphones disponibles
 */
async function getDevices() {
  setMicLoadingState(true);

  micSelect.innerHTML = "";
  const texts = allTexts[langSelect.value] || allTexts["fr"];

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });
    stream.getTracks().forEach((track) => track.stop());

    const devices = await navigator.mediaDevices.enumerateDevices();
    const mics = devices.filter((d) => d.kind === "audioinput");

    setMicLoadingState(false);

    if (mics.length > 0) {
      mics.forEach((m) => {
        const option = document.createElement("option");
        option.value = m.deviceId;
        option.textContent =
          m.label || texts.default_mic_name || "Microphone par défaut";
        micSelect.appendChild(option);
      });
      micSelect.value = selectedMicId || mics[0].deviceId;
      selectedMicId = micSelect.value;
      displayMessage(
        texts.mic_selected_success || "Microphones détectés.",
        false
      );
    } else {
      const option = document.createElement("option");
      option.textContent = texts.no_mic_found || "Aucun microphone détecté";
      micSelect.appendChild(option);
      selectedMicId = "";
      displayMessage(
        texts.no_mic_found || "Attention: Aucun microphone détecté.",
        true
      );
    }
  } catch (e) {
    console.error("Erreur microphone:", e);
    setMicLoadingState(false);

    micSelect.innerHTML = "";
    const option = document.createElement("option");
    option.textContent = texts.no_mic_found || "Aucun microphone détecté";
    micSelect.appendChild(option);
    selectedMicId = "";

    // Si l'erreur est liée aux permissions, afficher la modal d'instructions
    if (e.name === "NotAllowedError" || e.name === "PermissionDeniedError") {
      displayMessage(
        texts.error_micro_permission ||
          "Erreur: Accès au microphone refusé. Veuillez l'autoriser.",
        true
      );
      showPermissionsModal();
    } else {
      displayMessage(
        texts.error_micro_permission ||
          "Erreur: Accès au microphone refusé. Veuillez l'autoriser.",
        true
      );
    }
  }
}

// --- Initialisation et Événements ---

document.addEventListener("DOMContentLoaded", async () => {
  const savedLang = localStorage.getItem("lastLanguage");
  const initialLang = savedLang || langSelect.value;
  langSelect.value = initialLang;

  await loadLanguageData(langSelect.value);

  dictationApp = new DictationApp(langSelect.value);
  dictationApp.onRecordingStateChange = updateButtonState;
  dictationApp.onError = displayMessage;

  getDevices();

  if (micSelectTrigger && micSelect) {
    micSelectTrigger.addEventListener("click", (e) => {
      e.stopPropagation();
      micSelect.classList.remove("hidden");
      micSelect.focus();
    });

    micSelect.addEventListener("blur", () => {
      micSelect.classList.add("hidden");
    });
  }
});

// Gestionnaire de bascule (Bouton Dictée)
dictationBtn.addEventListener("click", async () => {
  if (isUILoading) return;

  const texts = allTexts[langSelect.value] || allTexts["fr"];

  if (dictationApp.isRecording) {
    dictationApp.stopDictation();
    displayMessage(texts.stop_dictation || "Arrêt de la dictée.", false);
  } else {
    if (!selectedMicId) {
      showPermissionsModal();
      return;
    }
    setLoadingState(true);

    try {
      await dictationApp.startDictation(selectedMicId);
      setLoadingState(false);
      displayMessage(texts.dictate_button || "Dictée en cours...", false);
    } catch (error) {
      resetButtonState();
      console.error("Échec du démarrage de la dictée", error);

      // Afficher la modal si c'est une erreur de permissions
      if (
        error.message &&
        (error.message.includes("Permission") ||
          error.message.includes("NotAllowed"))
      ) {
        showPermissionsModal();
      }

      displayMessage(
        texts.error_general_start || "Erreur de démarrage de la dictée.",
        true
      );
    }
  }
});

// Changement de langue
langSelect.addEventListener("change", (e) => {
  loadLanguageData(e.target.value);
});

// Changement de micro
micSelect.addEventListener("change", (e) => {
  selectedMicId = e.target.value;
  console.log("Microphone sélectionné:", selectedMicId);
});

// Gestion des raccourcis clavier
document.addEventListener("keydown", async (e) => {
  // Ctrl+Espace : Toggle (démarrer/arrêter) la dictée
  if (e.ctrlKey && e.code === "Space") {
    e.preventDefault();
    if (isUILoading) return;

    const texts = allTexts[langSelect.value] || allTexts["fr"];

    if (dictationApp && dictationApp.isRecording) {
      dictationApp.stopDictation();
      displayMessage(texts.stop_dictation || "Arrêt de la dictée.", false);
    } else {
      if (!selectedMicId) {
        showPermissionsModal();
        return;
      }

      setLoadingState(true);
      try {
        await dictationApp.startDictation(selectedMicId);
        setLoadingState(false);
        displayMessage(texts.dictate_button || "Dictée en cours...", false);
      } catch (error) {
        resetButtonState();
        console.error("Échec du démarrage de la dictée", error);

        if (
          error.message &&
          (error.message.includes("Permission") ||
            error.message.includes("NotAllowed"))
        ) {
          showPermissionsModal();
        }

        displayMessage(
          texts.error_general_start || "Erreur de démarrage de la dictée.",
          true
        );
      }
    }
  }

  // Echap : Arrêter la dictée uniquement
  if (e.key === "Escape" && dictationApp && dictationApp.isRecording) {
    dictationApp.stopDictation();
    const texts = allTexts[langSelect.value] || allTexts["fr"];
    displayMessage(
      texts.stop_dictation || "Arrêt de la dictée par ESC.",
      false
    );
  }
});