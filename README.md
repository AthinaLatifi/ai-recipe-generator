# 🍳 AI Recipe Generator

A modern, responsive web application built with **Python Flask** and the official **Google GenAI SDK (`google-genai`)** that transforms whatever ingredients you have in your fridge and pantry into three delicious, chef-crafted recipes.

---

## ✨ Features

- **Interactive Ingredient Tags**: Type what you have at home (e.g., chicken, garlic, rice) or click common pantry staples. Easily add and remove tags.
- **Custom Meal Options**:
  - **Servings**: Interactive stepper (1 to 16 people) with instant ingredient scaling.
  - **Dietary Preferences**: None, Vegetarian, Vegan, Gluten-Free.
  - **Max Cooking Time**: 15 min (speedy), 30 min (standard), 45 min, 60 min, or Any time.
- **Powered by Google Gemini**: Generates 3 distinct recipe concepts formatted as clean, structured JSON.
- **Rich Recipe Cards**:
  - Name, tagline, and mouth-watering culinary description.
  - Prep/cook time badge, servings badge, and difficulty rating.
  - Ingredients scaled accurately to chosen servings with pantry badges.
  - Interactive **Shopping List / Missing Ingredients** with checkable checkboxes.
  - Numbered step-by-step cooking instructions.
  - **Chef's Secret Tip** for elevating flavors.
  - One-click **Copy Recipe**, **Copy Shopping List**, and **Print** buttons.
- **Engaging Animated Cooking Loader**: Simmering cooking pot animation with rising steam and rotating status messages while Gemini works.
- **Mobile-First Design**: Polished, warm food aesthetic (terracotta, honey saffron, sage, and cream) that looks great on mobile, tablet, and desktop.
- **Friendly Error Handling**: Actionable hints if your API key is missing or needs updating.

---

## 📁 Project Structure

```text
ai-recipe-generator/
│
├── app.py                 # Flask application, routing, and Gemini GenAI integration
├── .env                   # Environment file containing GEMINI_API_KEY
├── .gitignore             # Ignores .env, venv/, and Python cache
├── requirements.txt       # Dependencies (Flask, python-dotenv, google-genai)
├── README.md              # Documentation and local setup instructions
│
├── templates/
│   └── index.html         # Main web UI template
│
└── static/
    ├── css/
    │   └── style.css      # Warm culinary theme, animations & responsive styles
    └── js/
        └── main.js        # Interactive tags, stepper, async API calls & cards UI
```

---

## 🚀 Getting Started on Windows

### Prerequisites

- **Python 3.10+** installed on Windows. (Check via `python --version`)
- A free **Google Gemini API Key** from [Google AI Studio](https://aistudio.google.com/app/apikey).

---

### Step-by-Step Setup

#### 1. Open Terminal (PowerShell or Command Prompt)
Navigate to the project folder:
```powershell
cd C:\Users\Athina\Documents\ai-recipe-generator
```

#### 2. Create a Virtual Environment (Recommended)
```powershell
python -m venv venv
```

#### 3. Activate the Virtual Environment
- In **PowerShell**:
  ```powershell
  .\venv\Scripts\Activate.ps1
  ```
  *(If PowerShell gives an execution policy error, run `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser` first, or use Command Prompt below).*

- In **Command Prompt (cmd.exe)**:
  ```cmd
  venv\Scripts\activate.bat
  ```

#### 4. Install Dependencies
```powershell
pip install -r requirements.txt
```

#### 5. Add Your Gemini API Key
Open the `.env` file in your favorite text editor (e.g. Notepad, VS Code) and replace `PASTE_YOUR_KEY_HERE` with your actual key from [Google AI Studio](https://aistudio.google.com/app/apikey):

```env
GEMINI_API_KEY=AIzaSyYourActualKeyHere12345
```

> **Note:** Never commit your `.env` file to version control. It is already included in `.gitignore`.

#### 6. Run the Application
```powershell
python app.py
```

#### 7. Open in Your Browser
Open your browser and navigate to:
```text
http://127.0.0.1:5000
```

---

## 🛠️ Technology Stack

- **Backend**: Python 3, [Flask](https://flask.palletsprojects.com/)
- **AI / LLM**: [Google GenAI SDK (`google-genai`)](https://github.com/googleapis/python-genai) with `gemini-3.5-flash-lite`, `gemini-flash-latest`, and `gemini-3.8-flash`
- **Configuration**: [python-dotenv](https://github.com/theskumar/python-dotenv)
- **Frontend**: Vanilla JavaScript (ES6+), Modern HTML5, Custom CSS3 with Flexbox & CSS Grid
- **Fonts**: Fraunces & Plus Jakarta Sans via Google Fonts

---

## 💡 Troubleshooting

- **"API Key Required" banner or error**: Ensure that you have edited `.env` and replaced `PASTE_YOUR_KEY_HERE` with your key, then restart the Flask server.
- **Port 5000 in use**: Set a different port by running `$env:PORT="5001"; python app.py` in PowerShell.
- **Virtual environment activation blocked**: Run `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` in your PowerShell session.
