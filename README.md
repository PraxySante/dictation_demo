# PraxySanté - Cursor Dictation

This project enables voice dictation in input fields (`input` or `textarea`) by inserting text exactly at the cursor position.

####  Try the live demo here: https://praxy.app/dictation_demo
---

## Table of Contents

- [Installation & Configuration](#installation--configuration)
- [Dictation functions](#dictation-functions)
- [Usage](#usage)
- [Technologies](#technologies)

---

## Installation & Configuration

Follow these steps to set up the project on your local machine.

### 1. Clone the Project

```bash
git clone https://github.com/PraxySante/dictation_demo.git
cd dictation_demo
```

### 2. Configure Environment Variables

The backend requires credentials to communicate with PraxySanté services.

1. Navigate to the backend folder:
```bash
cd backend
```

2. Create a file named `.env`

3. Open the file and fill it with the following variables:

```env
# PraxySanté Transcription Service URL
# Choose between DEV or PROD environment:
# - DEV: https://ts.backend.praxysante.fr/dev-partenaires (Updated frequently)
# - PROD: https://ts.backend.praxysante.fr/prod-partenaires (Stable version)

TRANSCRIBE_URL=https://ts.backend.praxysante.fr/dev-partenaires

# Partner Credentials (provided by PraxySanté)

PARTNER_USERNAME=your-username-here
PARTNER_PASSWORD=your-password-here
```

**Important:** The `PARTNER_USERNAME` and `PARTNER_PASSWORD` are provided by PraxySanté. Contact the PraxySanté team to obtain your credentials.

### 3. Launching the Project

#### Method 1: Using Docker (Recommended)

1. Ensure Docker and Docker-compose are installed

2. From the project root, run:
```bash
docker-compose up -d --build
```

3. Access the App: Open your browser and go to:
```
http://localhost:8088
```
*Note: The backend runs internally on port 3000*

#### Method 2: Normal Method (Manual)

If you do not want to use Docker, you must launch the Frontend and Backend separately.

##### Backend

1. Navigate to the backend folder:
```bash
cd backend
```

2. Install dependencies:
```bash
npm install
```

3. Start the server:
```bash
node server.js
```

The backend will be listening on `http://localhost:3000`

##### Frontend

 From the project root, serve the frontend using a local server (required):
 
```bash
# Using Python
python -m http.server 8088

# Or using Node.js live-server
npx live-server --port=8088

# Or using VS Code Live Server extension
```

*Note: Opening `index.html` directly in the browser will not work. You must use a local server.*

---

## Dictation functions

### 1. Active Field Detection

When the user clicks on a field, the active element is detected and saved for dictation.

**File: `app.js`**

#### Function: `window.setActiveElement`

```javascript
window.setActiveElement = (element) => {
    activeElement = element;

    if (dictationApp) {
        dictationApp.activeInput = element;
        dictationApp.cursorPos = element.selectionStart || element.value.length || 0;
    }
};
```

**Role:**
- Saves the field on which the user is focused
- Stores the current cursor position so that dictated text is inserted at the right location

To know which field to write to, we use the `onfocus` event on HTML elements.

**HTML Side:**
```html
<input onfocus="setActiveElement(this)" />
<textarea onfocus="setActiveElement(this)"></textarea>
```

### 2. Dynamic Text Insertion

Once the transcription is received via WebSocket, the `insertAtCursor` method is used to inject text dynamically without overwriting existing content.

**File: `dictation-app.js`**

#### Function: `insertAtCursor`

```javascript
insertAtCursor(text) {
    const input = this.activeInput;
    if (!input) {
        this.onError("Error: No input field is selected.");
        return;
    }

    // 1. Get the current cursor position
    const pos = input.selectionStart;

    // 2. Create the new value (Beginning + New Text + End)
    const newValue = input.value.slice(0, pos) + text + input.value.slice(pos);
    input.value = newValue;

    // 3. Reposition the cursor right after the inserted text
    const newPos = pos + text.length;
    input.setSelectionRange(newPos, newPos);
    
    // Update internal state
    this.cursorPos = newPos;

    // Notify the UI of the update
    this.onTranscriptUpdate(newValue);
}
```

**Role:**
- Inserts dictated text exactly at the cursor position
- Updates the cursor for subsequent dictations

### 3. WebSocket Integration

The complete process is driven by message reception. Each time a text fragment is received from the WebSocket, it is immediately sent to the insertion function.

```javascript
// In WebSocket message handling (dictation-app.js)
this.ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    
    if (data.type === "transcript" && data.message.transcript) {
        const newText = data.message.transcript;
        
        // Automatic call to cursor insertion
        this.insertAtCursor(newText);
    }
};
```

### Flow Summary

| Step | Action | Source File |
|------|--------|-------------|
| **Focus** | Detects which field is clicked via the `onfocus` attribute | `index.html` |
| **Capture** | Saves the target element | `app.js` |
| **Reception** | Receives text fragments in real-time and inserts at cursor position | `dictation-app.js` |
| **Insertion** | Splits and recomposes the string with `slice()` | `dictation-app.js` |
| **Cursor** | Repositions the visual cursor with `setSelectionRange()` | `dictation-app.js` |

---

## Usage

1. Launch the application (via Docker or manually)
2. Open your browser at `http://localhost:8088`
3. Click on an input field (input or textarea)
4. Activate voice dictation
5. Speak: text is automatically inserted at the cursor position

---

## Technologies

- **Frontend**: HTML, JavaScript (Vanilla)
- **Backend**: Node.js, Express
- **Communication**: WebSocket
- **Containerization**: Docker, Docker Compose

---

## License

This project is developed by PraxySanté.

