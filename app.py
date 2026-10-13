"""
AI Recipe Generator - Flask Backend
====================================
This application takes a list of ingredients that a user has at home,
along with preferences (servings, dietary restrictions, max cooking time),
and requests 3 creative, chef-crafted recipes from the Google Gemini API.
The response is structured as JSON and displayed as interactive recipe cards.
"""

import os
import json
import re
import logging
from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv
from google import genai
from google.genai import types
from google.genai.errors import APIError

# -----------------------------------------------------------------------------
# Configuration & Initialization
# -----------------------------------------------------------------------------

# Load environment variables from .env file
load_dotenv()

# Initialize Flask application
app = Flask(__name__)

# Configure logging for debugging and error tracing
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger(__name__)

# Model cascade: Primary model is gemini-flash-latest, with gemini-3.8-flash as fallback
CANDIDATE_MODELS = [
    "gemini-flash-latest",
    "gemini-3.8-flash"
]


def safe_print(*args, **kwargs):
    """
    Safely prints messages to stdout, preventing UnicodeEncodeError on Windows
    terminals running limited code pages such as cp1252.
    """
    try:
        print(*args, **kwargs)
    except UnicodeEncodeError:
        text = " ".join(str(a) for a in args)
        safe_text = text.encode("ascii", errors="backslashreplace").decode("ascii")
        print(safe_text, **kwargs)



def get_api_key():
    """
    Retrieve the Gemini API key from the environment.
    Returns None if missing or if still set to the default placeholder.
    """
    key = os.getenv("GEMINI_API_KEY", "").strip()
    if not key or key == "PASTE_YOUR_KEY_HERE":
        return None
    return key


def get_gemini_client():
    """
    Initializes and returns the Google GenAI client using the configured key.
    Raises ValueError if the key is not properly set.
    """
    api_key = get_api_key()
    if not api_key:
        raise ValueError(
            "Gemini API key is not configured. Please open the '.env' file in your project directory "
            "and replace 'PASTE_YOUR_KEY_HERE' with your personal Gemini API key from Google AI Studio."
        )
    return genai.Client(api_key=api_key)


def build_recipe_prompt(ingredients, servings, dietary, max_time):
    """
    Constructs a detailed culinary prompt instructing Gemini to return
    exactly 3 structured recipe suggestions matching user constraints.
    """
    dietary_desc = (
        f"Strictly adhere to the '{dietary}' dietary requirement."
        if dietary and dietary.lower() != "none"
        else "No specific dietary restrictions."
    )

    time_desc = (
        f"Maximum preparation and cooking time allowed: {max_time} minutes."
        if max_time and str(max_time).lower() != "any"
        else "Any reasonable cooking time is acceptable."
    )

    ingredients_list_str = ", ".join(f"'{ing}'" for ing in ingredients)

    prompt = f"""You are an enthusiastic, world-renowned professional chef and culinary consultant.
Your mission is to inspire home cooks by generating 3 distinct, practical, and mouth-watering recipe ideas based on what they have in their kitchen.

User Parameters:
- Ingredients available at home: {ingredients_list_str}
- Target Servings: {servings} people
- Dietary Restriction: {dietary_desc}
- Time Constraint: {time_desc}

Core Guidelines:
1. Provide EXACTLY 3 distinct recipe options (e.g., one quick/casual, one comforting classic, one creative twist).
2. The user's available ingredients should form the primary backbone of the recipes.
3. You may supplement with common pantry staples (salt, pepper, water, basic cooking oil) and a few missing ingredients.
4. Accurately calculate and scale all ingredient amounts for exactly {servings} serving(s).
5. Identify any missing ingredients that the user will need to buy or find in their cupboard as a separate 'missing_ingredients' list.
6. Provide clear, numbered, easy-to-follow cooking instructions.
7. Include an expert Chef's Tip for each recipe to elevate the dish.

Output Requirements:
You MUST respond with valid JSON strictly adhering to the following schema:
{{
  "recipes": [
    {{
      "id": "recipe_1",
      "name": "Creative Recipe Name",
      "tagline": "A punchy, delicious one-sentence hook",
      "description": "2-3 sentences explaining the dish, taste profile, and why it works so well.",
      "cooking_time_minutes": 25,
      "cooking_time_formatted": "25 mins",
      "difficulty": "Easy",
      "servings": {servings},
      "dietary": ["{dietary if dietary.lower() != 'none' else 'Omnivore'}"],
      "ingredients": [
        {{
          "item": "Ingredient name",
          "amount": "Quantity (e.g. 200, 1/2, 2)",
          "unit": "Unit (e.g. g, ml, tbsp, cloves, medium)",
          "notes": "optional prep notes like 'finely diced' or ''",
          "is_staple_or_provided": true
        }}
      ],
      "missing_ingredients": [
        {{
          "item": "Missing ingredient name",
          "amount": "Quantity",
          "unit": "Unit",
          "category": "e.g. Produce, Dairy, Spices, Pantry"
        }}
      ],
      "instructions": [
        {{
          "step": 1,
          "title": "Short Step Title",
          "instruction": "Detailed, encouraging step-by-step cooking instruction."
        }}
      ],
      "chef_tip": "A professional culinary tip to take this dish to the next level."
    }}
  ]
}}

Ensure all numbers are realistic and the recipes are delicious, safe, and coherent. Do not include markdown or commentary outside the JSON.
"""
    return prompt


def clean_and_parse_json(raw_text):
    """
    Strips markdown code blocks and whitespace, then parses the JSON content.
    Returns the decoded Python dictionary.
    """
    if not raw_text:
        raise ValueError("Gemini returned an empty response.")

    text = raw_text.strip()

    # Strip markdown backticks if present (```json ... ``` or ``` ...)
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text)
        text = text.strip()

    # Find first '{' and last '}' in case of surrounding text
    start_idx = text.find("{")
    end_idx = text.rfind("}")
    if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
        text = text[start_idx:end_idx + 1]

    parsed_data = json.loads(text)

    # Validate that we have a 'recipes' list
    if not isinstance(parsed_data, dict) or "recipes" not in parsed_data:
        raise ValueError("JSON response is missing the required 'recipes' key.")

    if not isinstance(parsed_data["recipes"], list) or len(parsed_data["recipes"]) == 0:
        raise ValueError("The 'recipes' array is empty.")

    return parsed_data


# -----------------------------------------------------------------------------
# Web Routes
# -----------------------------------------------------------------------------

@app.route("/")
def index():
    """
    Renders the main single-page recipe generator interface.
    """
    return render_template("index.html")


@app.route("/api/status", methods=["GET"])
def check_status():
    """
    Health check endpoint returning whether the API key is configured.
    Useful for warning the user on page load if the .env file still has
    the default placeholder key.
    """
    api_key_configured = get_api_key() is not None
    return jsonify({
        "status": "ready" if api_key_configured else "needs_configuration",
        "api_key_configured": api_key_configured
    })


@app.route("/api/generate-recipes", methods=["POST"])
def generate_recipes():
    """
    Receives user ingredients, servings, dietary restriction, and max cooking time.
    Calls Gemini API and returns 3 structured recipe suggestions.
    """
    try:
        # Check API key configuration early
        client = get_gemini_client()
    except ValueError as ve:
        safe_print(f"\n[Configuration Warning]: {ve}\n", flush=True)
        return jsonify({
            "error": "API Key Required",
            "message": str(ve),
            "type": "configuration_error"
        }), 400
    except Exception as ce:
        safe_print(f"\n[Gemini Client Init Error]: {ce}\n", flush=True)
        return jsonify({
            "error": "Gemini Client Error",
            "message": str(ce),
            "type": "client_init_error"
        }), 500

    # Parse and validate incoming JSON request payload
    data = request.get_json(silent=True) or {}
    ingredients = [
        item.strip()
        for item in data.get("ingredients", [])
        if isinstance(item, str) and item.strip()
    ]

    if not ingredients:
        return jsonify({
            "error": "No Ingredients Provided",
            "message": "Please add at least one ingredient you have at home to generate recipes.",
            "type": "validation_error"
        }), 400

    # Sanitize options
    try:
        servings = int(data.get("servings", 2))
        servings = max(1, min(servings, 20))  # Bounds between 1 and 20
    except (ValueError, TypeError):
        servings = 2

    dietary = str(data.get("dietary", "none")).strip()
    max_time = str(data.get("max_time", "any")).strip()

    prompt = build_recipe_prompt(ingredients, servings, dietary, max_time)
    logger.info("Requesting recipes from Gemini for %d ingredients...", len(ingredients))

    # Configure Gemini structured JSON generation
    config = types.GenerateContentConfig(
        response_mime_type="application/json",
        temperature=0.7,  # Good balance of culinary creativity and consistency
        system_instruction=(
            "You are an expert chef assistant. Always respond strictly in valid JSON "
            "matching the requested recipe schema."
        )
    )

    last_error = None
    response_data = None

    # Try models in order (primary: gemini-flash-latest, fallback: gemini-3.8-flash)
    for model_name in CANDIDATE_MODELS:
        try:
            logger.info("Attempting generation with model '%s'...", model_name)
            response = client.models.generate_content(
                model=model_name,
                contents=prompt,
                config=config
            )

            raw_text = getattr(response, "text", "")
            response_data = clean_and_parse_json(raw_text)
            logger.info("Successfully generated recipes using model '%s'.", model_name)
            break
        except APIError as api_err:
            last_error = api_err
            err_msg = str(api_err)
            safe_print(f"\n[Gemini API Error with model '{model_name}']:", flush=True)
            safe_print(f"{err_msg}\n", flush=True)
            logger.warning("Model '%s' failed with APIError: %s", model_name, err_msg)
            # If the error is an invalid API key, no need to retry with other models
            if "API_KEY_INVALID" in err_msg or "INVALID_ARGUMENT" in err_msg:
                return jsonify({
                    "error": "Invalid API Key",
                    "message": "The Gemini API key in your .env file appears to be invalid. Please verify it on Google AI Studio.",
                    "detail": err_msg,
                    "type": "auth_error"
                }), 401
            # If quota exceeded, give clear message
            if "RESOURCE_EXHAUSTED" in err_msg or "429" in err_msg:
                return jsonify({
                    "error": "Rate Limit Reached",
                    "message": "Gemini API quota exceeded or rate limited. Please wait a moment and try again.",
                    "detail": err_msg,
                    "type": "rate_limit_error"
                }), 429
            continue
        except (json.JSONDecodeError, ValueError) as parse_err:
            last_error = parse_err
            safe_print(f"\n[Gemini Response Parsing Error with model '{model_name}']:", flush=True)
            safe_print(f"{parse_err}\n", flush=True)
            logger.warning("JSON parsing error on model '%s': %s", model_name, str(parse_err))
            continue
        except Exception as unexpected_err:
            last_error = unexpected_err
            safe_print(f"\n[Gemini Unexpected Error with model '{model_name}']:", flush=True)
            safe_print(f"{unexpected_err}\n", flush=True)
            logger.error("Unexpected error with model '%s': %s", model_name, str(unexpected_err))
            continue

    if response_data:
        return jsonify({
            "success": True,
            "recipes": response_data.get("recipes", []),
            "meta": {
                "servings": servings,
                "dietary": dietary,
                "ingredients_count": len(ingredients)
            }
        })

    # If all candidate models failed, print full error to terminal and return a friendly helpful error
    safe_print("\n" + "=" * 60, flush=True)
    safe_print("[Gemini Generation Failed - All candidate models failed]", flush=True)
    safe_print(f"Candidate models attempted: {CANDIDATE_MODELS}", flush=True)
    safe_print(f"Final error details: {last_error}", flush=True)
    safe_print("=" * 60 + "\n", flush=True)
    logger.error("All models failed. Last error: %s", str(last_error))
    return jsonify({
        "error": "Recipe Generation Failed",
        "message": (
            "We could not generate recipes at this time. "
            "Please ensure your Gemini API key is valid and has access to Gemini models, then try again."
        ),
        "detail": str(last_error),
        "type": "generation_error"
    }), 500


# -----------------------------------------------------------------------------
# Main Entry Point
# -----------------------------------------------------------------------------

if __name__ == "__main__":
    # Runs local Flask development server
    port = int(os.environ.get("PORT", 5000))
    print("\n" + "=" * 60)
    print("  AI Recipe Generator is starting up!")
    print(f"  Access the app locally at: http://127.0.0.1:{port}")
    if not get_api_key():
        print("  [!] NOTE: GEMINI_API_KEY is not set in .env yet.")
        print("      Add your key to .env before generating recipes.")
    print("=" * 60 + "\n")
    app.run(host="127.0.0.1", port=port, debug=True)
