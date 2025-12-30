# PraxySanté - Dictée au curseur

Ce projet permet d’utiliser la dictée vocale dans des champs de saisie (`input` ou `textarea`) en insérant le texte exactement à la position du curseur.

---

## Flux détaillé lorsqu’un utilisateur clique sur un champ

### 1. Le champ actif

Quand l’utilisateur clique sur un champ, l’élément actif est détecté et sauvegardé pour la dictée.

**Fichier : `app.js`**  

#### Fonction : `window.setActiveElement`

```javascript
window.setActiveElement = (element) => {
    activeElement = element;

    if (dictationApp) {
        dictationApp.activeInput = element;
        dictationApp.cursorPos = element.selectionStart || element.value.length || 0;
    }
};
```
### Rôle :

* Sauvegarde le champ sur lequel l’utilisateur est focalisé.

* Stocke la position actuelle du curseur pour que le texte dicté s’insère au bon endroit

Pour qu'on sache dans quel champ écrire, nous utilisons l'événement `onfocus` sur les éléments HTML. Cela permet de mettre à jour dynamiquement la cible de la dictée.

**Côté HTML :**
```html
<input ...  onfocus="setActiveElement(this)" />
<textarea ... onfocus="setActiveElement(this)"></textarea>
```




### 2. Insertion dynamique du texte

Une fois la transcription reçue via WebSocket, la méthode `insertAtCursor` est utilisée pour injecter le texte dynamiquement, sans écraser le contenu déjà existant.

**Fichier : `dictation-app.js`**  

#### Fonction : `insertAtCursor`


```javascript
insertAtCursor(text) {
    const input = this.activeInput;
    if (!input) {
        this.onError("Erreur : Aucun champ de saisie n'est sélectionné.");
        return;
    }

    // 1. la position actuelle du curseur
    const pos = input.selectionStart;

    // 2. Créer la nouvelle valeur (Début + Nouveau Texte + Fin)
    const newValue = input.value.slice(0, pos) + text + input.value.slice(pos);
    input.value = newValue;

    // 3. Repositionner le curseur juste après le texte inséré
    const newPos = pos + text.length;
    input.setSelectionRange(newPos, newPos);
    
    // Mise à jour de l'état interne
    this.cursorPos = newPos;

    // Notifier l'UI de la mise à jour
    this.onTranscriptUpdate(newValue);
}
```

### Rôle :

* Insère le texte dicté exactement à la position du curseur.

* Met à jour le curseur pour les prochaines dictées.

### 3. Intégration avec le WebSocket


Le traitement complet est piloté par la réception des messages. À chaque fois qu'un fragment de texte est reçu du WebSocket, il est immédiatement envoyé à la fonction d'insertion.

```javascript
// Dans la gestion du message WebSocket (dictation-app.js)
this.ws.onmessage = (event) => {
    const data = JSON.parse(event.data);

    ....
    
    if (data.type === "transcript" && data.message.transcript) {
        const newText = data.message.transcript;
        
        // Appel automatique de l'insertion au curseur
        this.insertAtCursor(newText);
    }
};
```
### Résumé




| Étape | Action | Fichier Source |
| :--- | :--- | :--- |
| **Focus** | Détecte quel champ est cliqué via l'attribut `onfocus` | `index.html` |
| **Capture** | Sauvegarde l'élément cible | `app.js` |
| **Réception** | Reçoit les fragments de texte en temps réel et insertion à la position du curseur | `dictation-app.js` |
| **Insertion** | Découpe et recompose la chaîne de caractères avec `slice()` | `dictation-app.js` |
| **Curseur** | Repositionne le curseur visuel avec `setSelectionRange()` | `dictation-app.js` |