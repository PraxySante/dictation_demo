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
    if (dictationApp) {
      dictationApp.activeInput = element;
      dictationApp.cursorPos = element.selectionStart || element.value.length || 0;
    }
    console.log("Champ actif:", activeElement.id);
};

/**
 * Met à jour l'icône et le style du bouton d'enregistrement.
 * @param {boolean} isRecording 
 */
const updateButtonState = (isRecording) => {
    if (isRecording) {
        dictationBtn.classList.remove('bg-blue-600', 'hover:bg-blue-700', 'bg-gray-500', 'opacity-70', 'cursor-not-allowed');
        dictationBtn.classList.add('bg-red-600', 'ring-4', 'ring-red-300/50', 'animate-pulse');
        // Icône MicOff (ou Stop)
        micIconContainer.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6 text-white"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
    } else {
        dictationBtn.classList.remove('bg-red-600', 'ring-4', 'ring-red-300/50', 'animate-pulse', 'bg-gray-500', 'opacity-70', 'cursor-not-allowed');
        dictationBtn.classList.add('bg-blue-600', 'hover:bg-blue-700');
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
        dictationBtn.classList.remove('bg-blue-600', 'hover:bg-blue-700', 'bg-red-600', 'animate-pulse', 'shadow-red-500/50');
        dictationBtn.classList.add('bg-gray-500', 'opacity-70', 'cursor-not-allowed');
        micIconContainer.innerHTML = `<svg class="w-6 h-6 text-white animate-spin" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>`;
    } else {
        dictationBtn.disabled = false;
        dictationBtn.classList.remove('bg-gray-500', 'opacity-70', 'cursor-not-allowed');
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
        ? 'fixed bottom-4 right-4 max-w-sm p-4 rounded-lg shadow-xl bg-red-100 text-red-700 border border-red-300 z-50' 
        : 'fixed bottom-4 right-4 max-w-sm p-4 rounded-lg shadow-xl bg-green-100 text-green-700 border border-green-300 z-50';
    messageArea.classList.remove('hidden');
    setTimeout(() => {
        messageArea.classList.add('hidden');
    }, 5000);
};

/**
 * Gère l'état de chargement du sélecteur de micro.
 * @param {boolean} isLoading 
 */
const setMicLoadingState = (isLoading) => {
    if (isLoading) {
        micSelect.disabled = true;
        micSelect.classList.add('bg-gray-100', 'animate-pulse');
        micSelect.innerHTML = `<option value="">Chargement des micros...</option>`;
    } else {
        micSelect.disabled = false;
        micSelect.classList.remove('bg-gray-100', 'animate-pulse');
    }
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
    loadingOverlay.classList.remove('hidden');

    try {
        if (Object.keys(allTexts).length === 0) {
            const response = await fetch('./lang.json');
            allTexts = await response.json();
        }
    } catch (e) {
        console.error("Échec du chargement de lang.json:", e);
        loadingOverlay.classList.add('hidden');
        isUILoading = false;
        return;
    }

    const texts = allTexts[langCode] || allTexts['fr'];
    const isRTL = langCode === 'ar';
    
    flagImage.src = `./resources/${langCode}.png`;
    flagImage.alt = `${langCode.toUpperCase()} Flag`;
    
    document.body.dir = isRTL ? 'rtl' : 'ltr';
    instructionsContainer.dir = isRTL ? 'rtl' : 'ltr';
    titleElement.textContent = texts.title;
    
    patientLabel.textContent = texts.patient_name;
    symptomsLabel.textContent = texts.symptoms;
    notesLabel.textContent = texts.clinical_notes;

    inputPatient.placeholder = texts.patient_name;
    inputSymptoms.placeholder = texts.symptoms;
    textareaNotes.placeholder = texts.clinical_notes;
    
    const inputFields = [inputPatient, inputSymptoms, textareaNotes];
    inputFields.forEach(input => {
        input.dir = isRTL ? 'rtl' : 'ltr';
        input.classList.toggle('text-right', isRTL);
        input.classList.toggle('text-left', !isRTL);
    });
    
    instructionsTitle.textContent = texts.instructions_title;
    instructionsList.innerHTML = ''; 
    texts.instructions.forEach((line) => {
        const li = document.createElement('li');
        li.textContent = line;
        instructionsList.appendChild(li);
    });

    if (dictationApp) {
        dictationApp.language = langCode;
    }
    localStorage.setItem('lastLanguage', langCode);
    setTimeout(() => {
        loadingOverlay.classList.add('hidden');
        isUILoading = false;
    }, 300);
}


// --- Fonctions de Périphériques ---

/**
 * Récupère la liste des microphones disponibles
 */
async function getDevices() {
    
    setMicLoadingState(true); 

    micSelect.innerHTML = ''; 
    const texts = allTexts[langSelect.value] || allTexts['fr'];

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        stream.getTracks().forEach(track => track.stop());

        const devices = await navigator.mediaDevices.enumerateDevices();
        const mics = devices.filter((d) => d.kind === "audioinput");
        
        setMicLoadingState(false); 

        if (mics.length > 0) {
            mics.forEach((m) => {
                const option = document.createElement('option');
                option.value = m.deviceId;
                option.textContent = m.label || texts.default_mic_name || "Microphone par défaut";
                micSelect.appendChild(option);
            });
            micSelect.value = selectedMicId || mics[0].deviceId;
            selectedMicId = micSelect.value;
            displayMessage(texts.mic_selected_success || "Microphones détectés.", false);

        } else {
            const option = document.createElement('option');
            option.textContent = texts.no_mic_found || "Aucun microphone détecté";
            micSelect.appendChild(option);
            selectedMicId = "";
            displayMessage(texts.no_mic_found || "Attention: Aucun microphone détecté.", true);
        }
    } catch (e) {
        console.error("Erreur microphone:", e);
        setMicLoadingState(false); 

        micSelect.innerHTML = '';
        const option = document.createElement('option');
        option.textContent = texts.no_mic_found || "Aucun microphone détecté";
        micSelect.appendChild(option);
        selectedMicId = "";
        
        displayMessage(texts.error_micro_permission || "Erreur: Accès au microphone refusé. Veuillez l'autoriser.", true);
    }
}

// --- Initialisation et Événements ---

document.addEventListener('DOMContentLoaded', async () => {
    const savedLang = localStorage.getItem('lastLanguage');
    const initialLang = savedLang || langSelect.value;
    langSelect.value = initialLang;

    await loadLanguageData(langSelect.value);

    dictationApp = new DictationApp(langSelect.value);
    dictationApp.onRecordingStateChange = updateButtonState;
    dictationApp.onError = displayMessage;

    getDevices(); 
    
if (micSelectTrigger && micSelect) {
    micSelectTrigger.addEventListener('click', (e) => {
        e.stopPropagation();

        micSelect.classList.remove('hidden');
        micSelect.focus();
    });

    micSelect.addEventListener('blur', () => {
         micSelect.classList.add('hidden');
    });

}

});


// Gestionnaire de bascule (Bouton Dictée)
dictationBtn.addEventListener('click', async () => {
    if (isUILoading) return;

    const texts = allTexts[langSelect.value] || allTexts['fr'];

    if (dictationApp.isRecording) {
        dictationApp.stopDictation();
        displayMessage(texts.stop_dictation || "Arrêt de la dictée.", false);
    } else {
        if (!activeElement) {
            displayMessage(texts.error_no_field_selected || "Veuillez cliquer dans un champ de saisie avant de commencer la dictée.", true);
            return;
        }
        if (!selectedMicId) {
             displayMessage(texts.no_mic_found || "Veuillez sélectionner un microphone.", true);
             return;
        }
                setLoadingState(true);

        try {
            await dictationApp.startDictation(selectedMicId, activeElement);
            setLoadingState(false); 
            displayMessage(texts.dictate_button || "Dictée en cours...", false);
        } catch (error) {
            resetButtonState(); 
            
            console.error("Échec du démarrage de la dictée", error);
            displayMessage(texts.error_general_start || "Erreur de démarrage de la dictée.", true); 
        }
    }
});

// Changement de langue
langSelect.addEventListener('change', (e) => {
    loadLanguageData(e.target.value);
});

// Changement de micro
micSelect.addEventListener('change', (e) => {
    selectedMicId = e.target.value;
    console.log("Microphone sélectionné:", selectedMicId);
});

// Arrêt  avec la touche Echap (Esc)
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && dictationApp && dictationApp.isRecording) {
        dictationApp.stopDictation();
        const texts = allTexts[langSelect.value] || allTexts['fr'];
        displayMessage(texts.stop_dictation || "Arrêt de la dictée par ESC.", false);
    }
});