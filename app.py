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
import sqlite3
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

# Model cascade: gemini-3.5-flash-lite first (fastest), then gemini-flash-latest, then gemini-3.8-flash
CANDIDATE_MODELS = [
    "gemini-3.5-flash-lite",
    "gemini-flash-latest",
    "gemini-3.8-flash"
]

# Database configuration (SQLite)
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "recipes.db")


def get_db_connection():
    """
    Returns a connection to the SQLite database with Row factory
    for dict-like column access.
    """
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """
    Initializes the SQLite database schema if it doesn't already exist.
    Stores user's saved favorite recipes with full structured JSON.
    """
    with get_db_connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS favorites (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                recipe_name TEXT NOT NULL,
                tagline TEXT,
                cooking_time TEXT,
                servings INTEGER,
                difficulty TEXT,
                recipe_json TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_favorites_name ON favorites(recipe_name)")
        conn.commit()
    logger.info("Database initialized at %s", DB_PATH)


# Initialize SQLite tables on startup
init_db()


def db_get_all_favorites():
    """
    Retrieves all favorite recipes ordered by newest first.
    """
    with get_db_connection() as conn:
        cursor = conn.execute("SELECT * FROM favorites ORDER BY id DESC")
        rows = cursor.fetchall()
        favorites = []
        for r in rows:
            try:
                recipe_data = json.loads(r["recipe_json"])
            except Exception:
                recipe_data = {}
            favorites.append({
                "id": r["id"],
                "recipe_name": r["recipe_name"],
                "tagline": r["tagline"] or "",
                "cooking_time": r["cooking_time"] or "",
                "servings": r["servings"] or 2,
                "difficulty": r["difficulty"] or "Easy",
                "recipe": recipe_data,
                "created_at": r["created_at"]
            })
        return favorites


def db_find_favorite_by_name(name):
    """
    Checks if a recipe with this name is already saved.
    Returns its id if found, else None.
    """
    if not name:
        return None
    with get_db_connection() as conn:
        cursor = conn.execute(
            "SELECT id FROM favorites WHERE LOWER(TRIM(recipe_name)) = LOWER(TRIM(?)) LIMIT 1",
            (name,)
        )
        row = cursor.fetchone()
        return row["id"] if row else None


def db_add_favorite(recipe_dict):
    """
    Saves a recipe to the favorites database.
    If a recipe with the same name exists, returns the existing record.
    """
    name = recipe_dict.get("name", "").strip() or "Untitled Recipe"
    existing_id = db_find_favorite_by_name(name)
    if existing_id is not None:
        return {"id": existing_id, "already_saved": True}

    tagline = recipe_dict.get("tagline", "")
    cooking_time = recipe_dict.get("cooking_time_formatted") or f"{recipe_dict.get('cooking_time_minutes', '')} mins"
    servings = recipe_dict.get("servings", 2)
    difficulty = recipe_dict.get("difficulty", "Easy")
    recipe_json = json.dumps(recipe_dict)

    with get_db_connection() as conn:
        cursor = conn.execute("""
            INSERT INTO favorites (recipe_name, tagline, cooking_time, servings, difficulty, recipe_json)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (name, tagline, cooking_time, servings, difficulty, recipe_json))
        conn.commit()
        return {"id": cursor.lastrowid, "already_saved": False}


def db_delete_favorite(fav_id):
    """
    Deletes a favorite recipe by its ID.
    Returns True if a row was deleted, False otherwise.
    """
    with get_db_connection() as conn:
        cursor = conn.execute("DELETE FROM favorites WHERE id = ?", (fav_id,))
        conn.commit()
        return cursor.rowcount > 0


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
    Configures a 30-second request timeout and 1 single attempt (no slow internal retry loops)
    via types.HttpOptions and types.HttpRetryOptions, so unresponsive models fail fast
    and fallback models are immediately attempted without blocking Gunicorn workers.
    Raises ValueError if the key is not properly set.
    """
    api_key = get_api_key()
    if not api_key:
        raise ValueError(
            "Gemini API key is not configured. Please open the '.env' file in your project directory "
            "and replace 'PASTE_YOUR_KEY_HERE' with your personal Gemini API key from Google AI Studio."
        )
    return genai.Client(
        api_key=api_key,
        http_options=types.HttpOptions(
            timeout=30000,
            retry_options=types.HttpRetryOptions(attempts=1)
        )
    )


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
6. Provide concise, numbered, easy-to-follow cooking instructions: strictly 3 to 5 clear, brief steps per recipe.
7. Keep descriptions punchy (1-2 sentences) and keep chef tips brief (1 sentence) for fast generation.
8. Estimate approximate nutrition per serving (calories, protein_g, carbs_g, fat_g). These are rough estimates.

Output Requirements:
You MUST respond with valid JSON strictly adhering to the following schema:
{{
  "recipes": [
    {{
      "id": "recipe_1",
      "name": "Creative Recipe Name",
      "tagline": "A punchy, delicious one-sentence hook",
      "description": "1-2 brief sentences explaining the dish and taste profile.",
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
          "instruction": "Brief, clear cooking step instruction."
        }}
      ],
      "chef_tip": "A quick one-sentence culinary tip.",
      "nutrition": {{
        "calories_per_serving": 450,
        "protein_g": 32,
        "carbs_g": 45,
        "fat_g": 14,
        "disclaimer": "Estimates only. Actual values vary by brand and preparation."
      }}
    }}
  ]
}}

Ensure all numbers are realistic and the recipes are delicious, safe, and coherent. Do not include markdown or commentary outside the JSON.
"""
    return prompt


def get_model_config(model_name: str):
    """
    Returns GenerateContentConfig tailored for the model.
    Disables/minimizes thinking (thinking_budget=0) on models that support it
    to ensure fast generation times.
    """
    # gemini-3.5-flash-lite does not support thinking_config
    thinking_cfg = None
    if "lite" not in model_name.lower():
        thinking_cfg = types.ThinkingConfig(thinking_budget=0)

    return types.GenerateContentConfig(
        response_mime_type="application/json",
        temperature=0.7,
        thinking_config=thinking_cfg,
        system_instruction=(
            "You are an expert chef assistant. Always respond strictly in valid JSON "
            "matching the requested recipe schema. Keep instructions concise and practical."
        )
    )


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


def build_meal_plan_prompt(ingredients, servings, dietary, max_time):
    """
    Constructs an optimized prompt instructing Gemini to craft a cohesive,
    waste-minimizing 7-day dinner meal plan (Monday to Sunday) along with
    a consolidated shared shopping list of all missing ingredients for the whole week.
    """
    dietary_desc = (
        f"Strictly adhere to the '{dietary}' dietary requirement."
        if dietary and dietary.lower() != "none"
        else "No specific dietary restrictions."
    )

    time_desc = (
        f"Maximum preparation and cooking time per meal: {max_time} minutes."
        if max_time and str(max_time).lower() != "any"
        else "Any reasonable cooking time is acceptable."
    )

    ingredients_list_str = ", ".join(f"'{ing}'" for ing in ingredients)

    prompt = f"""You are a master chef and weekly meal planning expert.
Create a practical, healthy, and delicious 7-day dinner meal plan (Monday through Sunday) designed to make the most of what the user has at home while minimizing food waste.

User Kitchen Parameters:
- Ingredients available at home: {ingredients_list_str}
- Servings per meal: {servings} people
- Dietary Restriction: {dietary_desc}
- Time Constraint: {time_desc}

Core Guidelines:
1. Provide 7 distinct dinner meals, one for each day from Monday to Sunday.
2. Maximize overlapping use of ingredients and pantry staples across the week to minimize grocery waste.
3. Keep instructions concise: strictly 3 to 4 clear, brief cooking steps per day.
4. Scale all ingredient amounts accurately for exactly {servings} people.
5. Provide a consolidated, combined 'shared_shopping_list' of all missing ingredients needed for the ENTIRE week across all 7 meals. Group by category (e.g. Produce, Dairy, Protein, Bakery, Pantry & Spices).
6. Include a 1-sentence Chef's Tip for each day to elevate the dish.
7. Provide approximate nutrition per serving for each day's meal.

Output strictly in valid JSON adhering to this schema:
{{
  "plan_title": "7-Day Waste-Free Kitchen Plan",
  "overview": "Short 1-2 sentence overview of the week's culinary style and variety.",
  "servings": {servings},
  "dietary": "{dietary if dietary.lower() != 'none' else 'Omnivore'}",
  "days": [
    {{
      "day": "Monday",
      "name": "Recipe Name",
      "tagline": "Short punchy description",
      "description": "1 brief sentence explaining the dish.",
      "cooking_time_formatted": "25 mins",
      "difficulty": "Easy",
      "servings": {servings},
      "ingredients": [
        {{
          "item": "Ingredient name",
          "amount": "Quantity",
          "unit": "Unit",
          "is_staple_or_provided": true
        }}
      ],
      "instructions": [
        {{
          "step": 1,
          "title": "Short Step Title",
          "instruction": "Brief, clear cooking step instruction."
        }}
      ],
      "chef_tip": "A quick 1-sentence tip.",
      "nutrition": {{
        "calories_per_serving": 480,
        "protein_g": 35,
        "carbs_g": 50,
        "fat_g": 16,
        "disclaimer": "Estimates only. Actual values vary by brand and preparation."
      }}
    }}
  ],
  "shared_shopping_list": [
    {{
      "category": "Produce",
      "item": "Spinach",
      "amount": "200",
      "unit": "g"
    }}
  ]
}}
Do not include any commentary or markdown outside the JSON.
"""
    return prompt


def clean_and_parse_meal_plan_json(raw_text):
    """
    Strips markdown code fences and whitespace, then parses the meal plan JSON content.
    Returns the decoded Python dictionary containing 'days' and 'shared_shopping_list'.
    """
    if not raw_text:
        raise ValueError("Gemini returned an empty meal plan response.")

    text = raw_text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text)
        text = text.strip()

    start_idx = text.find("{")
    end_idx = text.rfind("}")
    if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
        text = text[start_idx:end_idx + 1]

    parsed = json.loads(text)
    if not isinstance(parsed, dict) or "days" not in parsed:
        raise ValueError("Meal plan response is missing the required 'days' list.")

    if not isinstance(parsed["days"], list) or len(parsed["days"]) == 0:
        raise ValueError("The 'days' list in meal plan is empty.")

    if "shared_shopping_list" not in parsed or not isinstance(parsed["shared_shopping_list"], list):
        parsed["shared_shopping_list"] = []

    return parsed


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


@app.route("/api/favorites", methods=["GET"])
def get_favorites():
    """
    Retrieves all saved favorite recipes from the SQLite database.
    """
    try:
        favorites = db_get_all_favorites()
        return jsonify({
            "success": True,
            "count": len(favorites),
            "favorites": favorites
        })
    except Exception as e:
        logger.error("Error fetching favorites: %s", str(e))
        return jsonify({
            "error": "Database Error",
            "message": "Could not retrieve favorite recipes.",
            "detail": str(e)
        }), 500


@app.route("/api/favorites", methods=["POST"])
def add_favorite():
    """
    Saves a recipe to favorites in the SQLite database.
    Payload: { "recipe": { ...recipe object... } }
    """
    data = request.get_json(silent=True) or {}
    recipe = data.get("recipe")
    if not recipe or not isinstance(recipe, dict):
        return jsonify({
            "error": "Invalid Data",
            "message": "Recipe data object is required."
        }), 400

    name = recipe.get("name", "").strip()
    if not name:
        return jsonify({
            "error": "Invalid Data",
            "message": "Recipe name is required."
        }), 400

    try:
        result = db_add_favorite(recipe)
        return jsonify({
            "success": True,
            "id": result["id"],
            "already_saved": result["already_saved"],
            "message": "Recipe is already in your favorites." if result["already_saved"] else "Recipe saved to your favorites!"
        })
    except Exception as e:
        logger.error("Error saving favorite: %s", str(e))
        return jsonify({
            "error": "Database Error",
            "message": "Could not save recipe to favorites.",
            "detail": str(e)
        }), 500


@app.route("/api/favorites/<int:fav_id>", methods=["DELETE"])
def delete_favorite(fav_id):
    """
    Removes a recipe from favorites by its database ID.
    """
    try:
        deleted = db_delete_favorite(fav_id)
        if deleted:
            return jsonify({
                "success": True,
                "id": fav_id,
                "message": "Recipe removed from favorites."
            })
        else:
            return jsonify({
                "error": "Not Found",
                "message": "Favorite recipe not found."
            }), 404
    except Exception as e:
        logger.error("Error deleting favorite: %s", str(e))
        return jsonify({
            "error": "Database Error",
            "message": "Could not remove recipe from favorites.",
            "detail": str(e)
        }), 500


def get_clean_image_mime(file):
    """
    Validates and normalizes image mime types supported by Gemini Vision.
    """
    content_type = (file.content_type or "").lower().strip()
    if content_type in ["image/jpeg", "image/jpg", "image/pjpeg"]:
        return "image/jpeg"
    if content_type in ["image/png", "image/x-png"]:
        return "image/png"
    if content_type in ["image/webp"]:
        return "image/webp"
    if content_type in ["image/gif"]:
        return "image/gif"
    if content_type in ["image/heic", "image/heif"]:
        return "image/heic"

    filename = (file.filename or "").lower()
    if filename.endswith((".jpg", ".jpeg")):
        return "image/jpeg"
    if filename.endswith(".png"):
        return "image/png"
    if filename.endswith(".webp"):
        return "image/webp"
    if filename.endswith(".gif"):
        return "image/gif"
    if filename.endswith((".heic", ".heif")):
        return "image/heic"

    return None


def parse_recognized_ingredients(raw_text):
    """
    Parses the JSON returned by Gemini vision into a clean list of ingredient strings.
    Handles JSON arrays, dictionaries with 'ingredients' key, and markdown fences.
    """
    if not raw_text:
        return []

    text = raw_text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text)
        text = text.strip()

    start_bracket = text.find("[")
    start_brace = text.find("{")

    if start_bracket != -1 and (start_brace == -1 or start_bracket < start_brace):
        end_bracket = text.rfind("]")
        if end_bracket > start_bracket:
            text = text[start_bracket:end_bracket + 1]
    elif start_brace != -1:
        end_brace = text.rfind("}")
        if end_brace > start_brace:
            text = text[start_brace:end_brace + 1]

    try:
        data = json.loads(text)
    except Exception:
        items = re.findall(r'"([^"\\]+)"', text)
        return [i.strip().capitalize() for i in items if i.strip() and i.lower() != "ingredients"]

    if isinstance(data, list):
        raw_list = data
    elif isinstance(data, dict):
        raw_list = data.get("ingredients") or data.get("items") or []
    else:
        raw_list = []

    clean_items = []
    seen = set()
    for item in raw_list:
        if isinstance(item, str):
            clean_str = item.strip().capitalize()
            if clean_str and clean_str.lower() not in seen:
                seen.add(clean_str.lower())
                clean_items.append(clean_str)
        elif isinstance(item, dict) and "name" in item:
            clean_str = str(item["name"]).strip().capitalize()
            if clean_str and clean_str.lower() not in seen:
                seen.add(clean_str.lower())
                clean_items.append(clean_str)

    return clean_items


@app.route("/api/recognize-ingredients", methods=["POST"])
def recognize_ingredients():
    """
    Receives an uploaded photo of a fridge or pantry.
    Sends the photo to Gemini Vision to automatically detect ingredients.
    Returns: JSON { success: True, ingredients: [...], count: ... }
    """
    try:
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

    if "photo" not in request.files:
        return jsonify({
            "error": "Missing Photo",
            "message": "Please upload a photo of your fridge or ingredients."
        }), 400

    photo_file = request.files["photo"]
    if not photo_file or not photo_file.filename:
        return jsonify({
            "error": "Missing Photo",
            "message": "No file was selected for upload."
        }), 400

    mime_type = get_clean_image_mime(photo_file)
    if not mime_type:
        return jsonify({
            "error": "Unsupported Image Format",
            "message": "Please upload a valid image file (JPEG, PNG, WebP, GIF, or HEIC)."
        }), 400

    image_bytes = photo_file.read()
    if len(image_bytes) == 0:
        return jsonify({
            "error": "Empty File",
            "message": "The uploaded photo is empty."
        }), 400

    if len(image_bytes) > 12 * 1024 * 1024:
        return jsonify({
            "error": "File Too Large",
            "message": "Image size exceeds 12MB. Please upload a smaller photo."
        }), 400

    vision_prompt = """You are an expert chef and computer vision specialist.
Analyze this photo of a refrigerator, pantry, countertop, or collection of food items.
Identify all clear food ingredients, produce, dairy, meats, condiments, and staples visible in the image.

Guidelines:
1. Identify individual usable ingredients (e.g. 'Eggs', 'Milk', 'Cheddar cheese', 'Tomatoes', 'Bell pepper', 'Chicken breast', 'Butter', 'Onions', 'Garlic').
2. Do not list non-food objects like containers, shelves, plastic bags, plates, jars, or bowls.
3. If no recognizable ingredients are visible, return an empty list.
4. Keep names simple, concise, and clean (title-cased).

Return strictly in valid JSON matching this schema:
{
  "ingredients": ["Item 1", "Item 2", "Item 3"]
}
"""

    image_part = types.Part.from_bytes(data=image_bytes, mime_type=mime_type)
    config = types.GenerateContentConfig(
        response_mime_type="application/json",
        temperature=0.2,
        system_instruction="You are an expert culinary vision assistant. Always respond strictly in valid JSON."
    )

    last_error = None
    recognized_ingredients = []

    for model_name in CANDIDATE_MODELS:
        try:
            logger.info("Attempting fridge photo recognition with model '%s'...", model_name)
            response = client.models.generate_content(
                model=model_name,
                contents=[image_part, vision_prompt],
                config=config
            )
            raw_text = getattr(response, "text", "")
            recognized_ingredients = parse_recognized_ingredients(raw_text)
            logger.info("Successfully recognized %d ingredients using model '%s'.", len(recognized_ingredients), model_name)
            break
        except APIError as api_err:
            last_error = api_err
            err_msg = str(api_err)
            safe_print(f"\n[Gemini Vision API Error with model '{model_name}']:", flush=True)
            safe_print(f"{err_msg}\n", flush=True)
            logger.warning("Model '%s' failed in vision with APIError: %s", model_name, err_msg)
            if "API_KEY_INVALID" in err_msg:
                return jsonify({
                    "error": "Invalid API Key",
                    "message": "The Gemini API key in your .env file appears to be invalid.",
                    "detail": err_msg,
                    "type": "auth_error"
                }), 401
            continue
        except Exception as unexpected_err:
            last_error = unexpected_err
            safe_print(f"\n[Gemini Vision Unexpected Error with model '{model_name}']:", flush=True)
            safe_print(f"{unexpected_err}\n", flush=True)
            logger.error("Unexpected vision error with model '%s': %s", model_name, str(unexpected_err))
            continue

    if last_error and not recognized_ingredients and not isinstance(last_error, (json.JSONDecodeError, ValueError)):
        return jsonify({
            "error": "Recognition Failed",
            "message": "Could not analyze the photo at this time. Please check your Gemini API key or try again.",
            "detail": str(last_error),
            "type": "vision_error"
        }), 500

    return jsonify({
        "success": True,
        "ingredients": recognized_ingredients,
        "count": len(recognized_ingredients)
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

    last_error = None
    response_data = None

    # Try models in order (primary: gemini-3.5-flash-lite, fallbacks: gemini-flash-latest, gemini-3.8-flash)
    for model_name in CANDIDATE_MODELS:
        try:
            logger.info("Attempting generation with model '%s'...", model_name)
            config = get_model_config(model_name)
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
            if "API_KEY_INVALID" in err_msg:
                return jsonify({
                    "error": "Invalid API Key",
                    "message": "The Gemini API key in your .env file appears to be invalid. Please verify it on Google AI Studio.",
                    "detail": err_msg,
                    "type": "auth_error"
                }), 401
            # For timeouts, 503 high demand, 429 quota, etc., immediately try the next model!
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


@app.route("/api/generate-meal-plan", methods=["POST"])
def generate_meal_plan():
    """
    Receives ingredients, servings, dietary restriction, and max cooking time.
    Generates a full 7-day meal plan (Monday-Sunday) along with a consolidated
    shared shopping list using the Gemini API.
    """
    try:
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

    data = request.get_json(silent=True) or {}
    ingredients = [
        item.strip()
        for item in data.get("ingredients", [])
        if isinstance(item, str) and item.strip()
    ]

    if not ingredients:
        return jsonify({
            "error": "No Ingredients Provided",
            "message": "Please add at least one ingredient you have at home to generate a meal plan.",
            "type": "validation_error"
        }), 400

    try:
        servings = int(data.get("servings", 2))
        servings = max(1, min(servings, 20))
    except (ValueError, TypeError):
        servings = 2

    dietary = str(data.get("dietary", "none")).strip()
    max_time = str(data.get("max_time", "any")).strip()

    prompt = build_meal_plan_prompt(ingredients, servings, dietary, max_time)
    logger.info("Requesting 7-day meal plan from Gemini for %d ingredients...", len(ingredients))

    last_error = None
    plan_data = None

    for model_name in CANDIDATE_MODELS:
        try:
            logger.info("Attempting meal plan generation with model '%s'...", model_name)
            config = get_model_config(model_name)
            response = client.models.generate_content(
                model=model_name,
                contents=prompt,
                config=config
            )

            raw_text = getattr(response, "text", "")
            plan_data = clean_and_parse_meal_plan_json(raw_text)
            logger.info("Successfully generated 7-day meal plan using model '%s'.", model_name)
            break
        except APIError as api_err:
            last_error = api_err
            err_msg = str(api_err)
            safe_print(f"\n[Gemini Meal Plan API Error with model '{model_name}']:", flush=True)
            safe_print(f"{err_msg}\n", flush=True)
            logger.warning("Model '%s' failed meal plan with APIError: %s", model_name, err_msg)
            if "API_KEY_INVALID" in err_msg:
                return jsonify({
                    "error": "Invalid API Key",
                    "message": "The Gemini API key in your .env file appears to be invalid. Please verify it on Google AI Studio.",
                    "detail": err_msg,
                    "type": "auth_error"
                }), 401
            continue
        except (json.JSONDecodeError, ValueError) as parse_err:
            last_error = parse_err
            safe_print(f"\n[Gemini Meal Plan Response Parsing Error with model '{model_name}']:", flush=True)
            safe_print(f"{parse_err}\n", flush=True)
            logger.warning("JSON meal plan parsing error on model '%s': %s", model_name, str(parse_err))
            continue
        except Exception as unexpected_err:
            last_error = unexpected_err
            safe_print(f"\n[Gemini Meal Plan Unexpected Error with model '{model_name}']:", flush=True)
            safe_print(f"{unexpected_err}\n", flush=True)
            logger.error("Unexpected error in meal plan with model '%s': %s", model_name, str(unexpected_err))
            continue

    if plan_data:
        return jsonify({
            "success": True,
            "plan": plan_data,
            "meta": {
                "servings": servings,
                "dietary": dietary,
                "ingredients_count": len(ingredients)
            }
        })

    safe_print("\n" + "=" * 60, flush=True)
    safe_print("[Gemini Meal Plan Generation Failed - All candidate models failed]", flush=True)
    safe_print(f"Candidate models attempted: {CANDIDATE_MODELS}", flush=True)
    safe_print(f"Final error details: {last_error}", flush=True)
    safe_print("=" * 60 + "\n", flush=True)
    logger.error("All models failed for meal plan. Last error: %s", str(last_error))
    return jsonify({
        "error": "Meal Plan Generation Failed",
        "message": (
            "We could not generate the 7-day meal plan at this time. "
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
