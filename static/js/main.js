/**
 * AI Recipe Generator - Frontend JavaScript
 * =========================================
 * Manages interactive ingredient tag input, options selection,
 * asynchronous Gemini API requests, dynamic recipe card rendering,
 * and user interactions (clipboard copy, printing, etc.).
 */

document.addEventListener("DOMContentLoaded", () => {
  // -------------------------------------------------------------------------
  // Application State
  // -------------------------------------------------------------------------
  const state = {
    ingredients: [],
    servings: 2,
    dietary: "none",
    maxTime: "30",
    isLoading: false,
    lastGeneratedRecipes: []
  };

  // Fun cycling phrases shown during AI generation
  const LOADING_PHRASES = [
    "Taking stock of your pantry staples...",
    "Consulting the digital master chef...",
    "Brainstorming creative flavor combinations...",
    "Balancing spices, heat, and textures...",
    "Scaling exact portions for your servings...",
    "Crafting clear, step-by-step instructions...",
    "Adding expert chef tips and plating ideas..."
  ];

  let loadingPhraseInterval = null;

  // -------------------------------------------------------------------------
  // DOM Element References
  // -------------------------------------------------------------------------
  const elements = {
    // API Key Banner
    apiKeyBanner: document.getElementById("apiKeyBanner"),
    closeBannerBtn: document.getElementById("closeBannerBtn"),

    // Tag Inputs
    ingredientInput: document.getElementById("ingredientInput"),
    addTagBtn: document.getElementById("addTagBtn"),
    tagsList: document.getElementById("tagsList"),
    tagCounter: document.getElementById("tagCounter"),
    staplePills: document.querySelectorAll(".staple-pill"),
    clearAllTagsBtn: document.getElementById("clearAllTagsBtn"),

    // Servings controls
    servingsInput: document.getElementById("servingsInput"),
    decreaseServings: document.getElementById("decreaseServings"),
    increaseServings: document.getElementById("increaseServings"),
    quickServBtns: document.querySelectorAll(".quick-serv-btn"),

    // Dietary & Time controls
    dietBtns: document.querySelectorAll(".diet-btn"),
    timeBtns: document.querySelectorAll(".time-btn"),

    // Actions & Sections
    generateBtn: document.getElementById("generateBtn"),
    regenerateBtn: document.getElementById("regenerateBtn"),
    editIngredientsBtn: document.getElementById("editIngredientsBtn"),
    errorAlert: document.getElementById("errorAlert"),
    errorTitle: document.getElementById("errorTitle"),
    errorMessage: document.getElementById("errorMessage"),
    retryBtn: document.getElementById("retryBtn"),
    dismissAlertBtn: document.getElementById("dismissAlertBtn"),

    // Loading & Results
    loadingSection: document.getElementById("loadingSection"),
    loadingPhrase: document.getElementById("loadingPhrase"),
    resultsSection: document.getElementById("resultsSection"),
    resultsGrid: document.getElementById("recipesGrid"),
    resultsSummaryText: document.getElementById("resultsSummaryText"),

    // Toast
    toastNotification: document.getElementById("toastNotification"),
    toastMessage: document.getElementById("toastMessage")
  };

  // -------------------------------------------------------------------------
  // Initialization & Status Check
  // -------------------------------------------------------------------------
  function init() {
    checkBackendStatus();
    setupEventListeners();
    updateTagUI();
  }

  /**
   * Check if the backend has a configured GEMINI_API_KEY.
   * If not, display a friendly setup banner to assist the user.
   */
  async function checkBackendStatus() {
    try {
      const response = await fetch("/api/status");
      if (response.ok) {
        const data = await response.json();
        if (!data.api_key_configured && elements.apiKeyBanner) {
          elements.apiKeyBanner.classList.remove("hidden");
        }
      }
    } catch (err) {
      console.warn("Could not check backend status:", err);
    }
  }

  // -------------------------------------------------------------------------
  // Event Listeners Setup
  // -------------------------------------------------------------------------
  function setupEventListeners() {
    // Dismiss API key banner
    if (elements.closeBannerBtn) {
      elements.closeBannerBtn.addEventListener("click", () => {
        elements.apiKeyBanner.classList.add("hidden");
      });
    }

    // Add ingredient on button click
    elements.addTagBtn.addEventListener("click", handleAddTagFromInput);

    // Add ingredient on 'Enter' or ',' keypress
    elements.ingredientInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        handleAddTagFromInput();
      } else if (e.key === "Backspace" && elements.ingredientInput.value === "" && state.ingredients.length > 0) {
        // Remove the last tag if user presses backspace on empty input
        removeIngredient(state.ingredients[state.ingredients.length - 1]);
      }
    });

    // Quick add pantry staples
    elements.staplePills.forEach((pill) => {
      pill.addEventListener("click", () => {
        const itemName = pill.getAttribute("data-name");
        toggleIngredient(itemName);
      });
    });

    // Clear all tags
    elements.clearAllTagsBtn.addEventListener("click", () => {
      state.ingredients = [];
      updateTagUI();
      hideError();
    });

    // Servings stepper
    elements.decreaseServings.addEventListener("click", () => {
      setServings(state.servings - 1);
    });

    elements.increaseServings.addEventListener("click", () => {
      setServings(state.servings + 1);
    });

    elements.quickServBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const count = parseInt(btn.getAttribute("data-serv"), 10);
        setServings(count);
      });
    });

    // Dietary preference buttons
    elements.dietBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        elements.dietBtns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        state.dietary = btn.getAttribute("data-diet");
      });
    });

    // Max cooking time buttons
    elements.timeBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        elements.timeBtns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        state.maxTime = btn.getAttribute("data-time");
      });
    });

    // Generate recipes action
    elements.generateBtn.addEventListener("click", generateRecipes);
    elements.regenerateBtn.addEventListener("click", generateRecipes);
    elements.retryBtn.addEventListener("click", generateRecipes);

    // Edit ingredients button scrolls back to input
    elements.editIngredientsBtn.addEventListener("click", () => {
      elements.ingredientInput.scrollIntoView({ behavior: "smooth", block: "center" });
      elements.ingredientInput.focus();
    });

    // Dismiss error alert
    elements.dismissAlertBtn.addEventListener("click", hideError);
  }

  // -------------------------------------------------------------------------
  // Ingredient Tag Management
  // -------------------------------------------------------------------------
  function handleAddTagFromInput() {
    const rawVal = elements.ingredientInput.value.trim();
    if (!rawVal) return;

    // Support comma-separated batch input (e.g., "eggs, milk, flour")
    const items = rawVal.split(",").map((s) => s.trim()).filter(Boolean);
    items.forEach((item) => addIngredient(item));

    elements.ingredientInput.value = "";
    elements.ingredientInput.focus();
    hideError();
  }

  function addIngredient(name) {
    const cleanName = cleanIngredientName(name);
    if (!cleanName) return;

    const exists = state.ingredients.some(
      (item) => item.toLowerCase() === cleanName.toLowerCase()
    );

    if (!exists) {
      state.ingredients.push(cleanName);
      updateTagUI();
    }
  }

  function removeIngredient(name) {
    state.ingredients = state.ingredients.filter(
      (item) => item.toLowerCase() !== name.toLowerCase()
    );
    updateTagUI();
  }

  function toggleIngredient(name) {
    const exists = state.ingredients.some(
      (item) => item.toLowerCase() === name.toLowerCase()
    );
    if (exists) {
      removeIngredient(name);
    } else {
      addIngredient(name);
    }
    hideError();
  }

  function cleanIngredientName(str) {
    if (!str) return "";
    const trimmed = str.trim();
    // Capitalize first letter of each word nicely
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  }

  /**
   * Refreshes the DOM list of tag chips and counter, and updates staple pills.
   */
  function updateTagUI() {
    elements.tagsList.innerHTML = "";

    state.ingredients.forEach((ing) => {
      const chip = document.createElement("div");
      chip.className = "tag-chip";
      chip.innerHTML = `
        <span>${escapeHtml(ing)}</span>
        <button type="button" class="tag-chip-remove" aria-label="Remove ${escapeHtml(ing)}">&times;</button>
      `;

      chip.querySelector(".tag-chip-remove").addEventListener("click", (e) => {
        e.stopPropagation();
        removeIngredient(ing);
      });

      elements.tagsList.appendChild(chip);
    });

    // Update counter
    const count = state.ingredients.length;
    elements.tagCounter.textContent = `${count} added`;

    // Sync quick-add staple pills active states
    elements.staplePills.forEach((pill) => {
      const pillName = pill.getAttribute("data-name");
      const isIncluded = state.ingredients.some(
        (item) => item.toLowerCase() === pillName.toLowerCase()
      );
      if (isIncluded) {
        pill.classList.add("active");
      } else {
        pill.classList.remove("active");
      }
    });
  }

  // -------------------------------------------------------------------------
  // Servings Stepper Management
  // -------------------------------------------------------------------------
  function setServings(val) {
    const clamped = Math.max(1, Math.min(16, val));
    state.servings = clamped;
    elements.servingsInput.value = clamped;

    // Update quick serv buttons
    elements.quickServBtns.forEach((btn) => {
      const btnVal = parseInt(btn.getAttribute("data-serv"), 10);
      if (btnVal === clamped) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });
  }

  // -------------------------------------------------------------------------
  // AI Recipe Generation Request
  // -------------------------------------------------------------------------
  async function generateRecipes() {
    if (state.isLoading) return;

    // Validation: Require at least one ingredient
    if (state.ingredients.length === 0) {
      showError(
        "No Ingredients Added",
        "Please type or click at least one ingredient you have at home so Gemini can invent recipes for you."
      );
      elements.ingredientInput.focus();
      return;
    }

    hideError();
    startLoading();

    const payload = {
      ingredients: state.ingredients,
      servings: state.servings,
      dietary: state.dietary,
      max_time: state.maxTime
    };

    try {
      const response = await fetch("/api/generate-recipes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || "Failed to generate recipes.");
      }

      if (!data.recipes || data.recipes.length === 0) {
        throw new Error("No recipes were returned by the AI. Please try again with additional ingredients.");
      }

      state.lastGeneratedRecipes = data.recipes;
      renderRecipes(data.recipes);
      showToast("3 delicious recipes ready!");
    } catch (err) {
      console.error("Recipe generation error:", err);
      showError(
        "Chef Hiccup",
        err.message || "Something went wrong while contacting Gemini. Please ensure your API key in .env is valid."
      );
    } finally {
      stopLoading();
    }
  }

  // -------------------------------------------------------------------------
  // Loading State & Animation
  // -------------------------------------------------------------------------
  function startLoading() {
    state.isLoading = true;
    elements.generateBtn.disabled = true;
    elements.generateBtn.innerHTML = `<span>⏳</span> Cooking up recipes...`;
    
    // Hide results while loading new ones
    elements.resultsSection.classList.add("hidden");
    elements.loadingSection.classList.remove("hidden");
    elements.loadingSection.scrollIntoView({ behavior: "smooth", block: "start" });

    // Cycle friendly chef status phrases
    let phraseIdx = 0;
    elements.loadingPhrase.textContent = LOADING_PHRASES[0];
    loadingPhraseInterval = setInterval(() => {
      phraseIdx = (phraseIdx + 1) % LOADING_PHRASES.length;
      elements.loadingPhrase.style.opacity = "0";
      setTimeout(() => {
        elements.loadingPhrase.textContent = LOADING_PHRASES[phraseIdx];
        elements.loadingPhrase.style.opacity = "1";
      }, 200);
    }, 2200);
  }

  function stopLoading() {
    state.isLoading = false;
    elements.generateBtn.disabled = false;
    elements.generateBtn.innerHTML = `<span class="btn-sparkle">✨</span> Generate 3 Chef Recipes`;
    elements.loadingSection.classList.add("hidden");
    if (loadingPhraseInterval) {
      clearInterval(loadingPhraseInterval);
      loadingPhraseInterval = null;
    }
  }

  // -------------------------------------------------------------------------
  // Recipe Cards Rendering
  // -------------------------------------------------------------------------
  function renderRecipes(recipes) {
    elements.resultsGrid.innerHTML = "";

    // Update summary text
    const dietStr = state.dietary !== "none" ? ` &bull; ${capitalize(state.dietary)}` : "";
    const timeStr = state.maxTime !== "any" ? ` &bull; Under ${state.maxTime} mins` : "";
    elements.resultsSummaryText.innerHTML = `Created for <strong>${state.servings} people</strong>${dietStr}${timeStr} using <strong>${state.ingredients.length}</strong> pantry ingredients.`;

    recipes.forEach((recipe, index) => {
      const card = createRecipeCard(recipe, index);
      elements.resultsGrid.appendChild(card);
    });

    elements.resultsSection.classList.remove("hidden");
    elements.resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function createRecipeCard(recipe, index) {
    const card = document.createElement("article");
    card.className = "recipe-card";

    // Format badges
    const cookingTime = recipe.cooking_time_formatted || `${recipe.cooking_time_minutes || 30} mins`;
    const difficulty = recipe.difficulty || "Easy";
    const servings = recipe.servings || state.servings;
    const dietaryBadges = (recipe.dietary || [])
      .map((d) => `<span class="pill pill-sage">${escapeHtml(d)}</span>`)
      .join(" ");

    // Build ingredients list HTML
    const ingredientsHtml = (recipe.ingredients || [])
      .map((ing) => {
        const item = escapeHtml(ing.item || "");
        const amount = escapeHtml(String(ing.amount || ""));
        const unit = escapeHtml(ing.unit || "");
        const notes = ing.notes ? `<small style="color:var(--color-text-muted); display:block; font-size:0.75rem;">${escapeHtml(ing.notes)}</small>` : "";
        const pantryTag = ing.is_staple_or_provided ? `<span class="pantry-badge">In pantry</span>` : "";

        return `
          <li class="ingredient-item">
            <span class="ingredient-name">${item} ${pantryTag} ${notes}</span>
            <span class="ingredient-qty">${amount} ${unit}</span>
          </li>
        `;
      })
      .join("");

    // Build missing ingredients shopping list HTML
    const missingList = recipe.missing_ingredients || [];
    let shoppingListHtml = "";
    if (missingList.length > 0) {
      const itemsHtml = missingList
        .map((m, mIdx) => {
          const itemText = `${m.amount ? m.amount + ' ' : ''}${m.unit ? m.unit + ' ' : ''}${m.item}`;
          const itemId = `shop_${index}_${mIdx}`;
          return `
            <li class="missing-item">
              <input type="checkbox" id="${itemId}" class="missing-checkbox">
              <label for="${itemId}"><span>${escapeHtml(itemText)}</span></label>
            </li>
          `;
        })
        .join("");

      shoppingListHtml = `
        <div class="shopping-list-box">
          <div class="shopping-list-header">
            <span class="shopping-list-title">🛒 Missing Ingredients (${missingList.length})</span>
            <button type="button" class="copy-shopping-btn" data-recipe-index="${index}">Copy list</button>
          </div>
          <ul class="missing-items-list">
            ${itemsHtml}
          </ul>
        </div>
      `;
    }

    // Build step-by-step instructions HTML
    const instructionsHtml = (recipe.instructions || [])
      .map((inst, sIdx) => {
        const stepNum = inst.step || (sIdx + 1);
        const title = inst.title ? `<div class="step-title">${escapeHtml(inst.title)}</div>` : "";
        const desc = escapeHtml(inst.instruction || "");
        return `
          <li class="instruction-step">
            <div class="step-number">${stepNum}</div>
            <div class="step-content">
              ${title}
              <div class="step-text">${desc}</div>
            </div>
          </li>
        `;
      })
      .join("");

    // Build Chef's Tip Box
    const chefTipHtml = recipe.chef_tip ? `
      <div class="chef-tip-box">
        <div class="chef-tip-header">💡 Chef's Secret Tip</div>
        <div class="chef-tip-content">${escapeHtml(recipe.chef_tip)}</div>
      </div>
    ` : "";

    card.innerHTML = `
      <div class="card-top-accent"></div>
      <div class="recipe-card-content">
        <div class="recipe-badges-row">
          <span class="pill pill-amber">⏱️ ${escapeHtml(cookingTime)}</span>
          <span class="pill pill-subtle">👥 ${escapeHtml(String(servings))} servings</span>
          <span class="pill pill-subtle">⚡ ${escapeHtml(difficulty)}</span>
          ${dietaryBadges}
        </div>

        <h3 class="recipe-card-title">${escapeHtml(recipe.name || "Delicious Dish")}</h3>
        ${recipe.tagline ? `<div class="recipe-tagline">${escapeHtml(recipe.tagline)}</div>` : ""}
        <p class="recipe-desc">${escapeHtml(recipe.description || "")}</p>

        <div class="recipe-subheading">
          <span>🥄 Scaled Ingredients</span>
        </div>
        <ul class="ingredients-list">
          ${ingredientsHtml}
        </ul>

        ${shoppingListHtml}

        <div class="recipe-subheading">
          <span>👩‍🍳 Instructions</span>
        </div>
        <ol class="instructions-list">
          ${instructionsHtml}
        </ol>

        ${chefTipHtml}

        <div class="recipe-card-actions">
          <button type="button" class="btn btn-secondary btn-sm copy-recipe-btn" data-recipe-index="${index}">
            📋 Copy Recipe
          </button>
          <button type="button" class="btn btn-secondary btn-sm print-recipe-btn">
            🖨️ Print
          </button>
        </div>
      </div>
    `;

    // Interactive event listeners on the card:
    // Checkbox strikethrough for shopping list items
    card.querySelectorAll(".missing-checkbox").forEach((chk) => {
      chk.addEventListener("change", (e) => {
        const itemLi = e.target.closest(".missing-item");
        if (itemLi) {
          itemLi.classList.toggle("checked", e.target.checked);
        }
      });
    });

    // Copy shopping list button
    const copyShopBtn = card.querySelector(".copy-shopping-btn");
    if (copyShopBtn) {
      copyShopBtn.addEventListener("click", () => {
        const text = missingList
          .map((m) => `• ${m.amount ? m.amount + ' ' : ''}${m.unit ? m.unit + ' ' : ''}${m.item}`)
          .join("\n");
        copyToClipboard(text, "Shopping list copied to clipboard!");
      });
    }

    // Copy full recipe button
    card.querySelector(".copy-recipe-btn").addEventListener("click", () => {
      const formatted = formatRecipeForClipboard(recipe);
      copyToClipboard(formatted, "Full recipe copied to clipboard!");
    });

    // Print recipe button
    card.querySelector(".print-recipe-btn").addEventListener("click", () => {
      window.print();
    });

    return card;
  }

  // -------------------------------------------------------------------------
  // Helper: Format Recipe for Text Sharing
  // -------------------------------------------------------------------------
  function formatRecipeForClipboard(recipe) {
    let out = `🍽️ ${recipe.name.toUpperCase()}\n`;
    if (recipe.tagline) out += `"${recipe.tagline}"\n`;
    out += `\n⏱️ Cooking Time: ${recipe.cooking_time_formatted || recipe.cooking_time_minutes + ' mins'}\n`;
    out += `👥 Servings: ${recipe.servings}\n`;
    if (recipe.description) out += `\n${recipe.description}\n`;

    out += `\n--- INGREDIENTS ---\n`;
    (recipe.ingredients || []).forEach((ing) => {
      out += `• ${ing.amount ? ing.amount + ' ' : ''}${ing.unit ? ing.unit + ' ' : ''}${ing.item}${ing.notes ? ' (' + ing.notes + ')' : ''}\n`;
    });

    if (recipe.missing_ingredients && recipe.missing_ingredients.length > 0) {
      out += `\n--- SHOPPING LIST (MISSING ITEMS) ---\n`;
      recipe.missing_ingredients.forEach((m) => {
        out += `• ${m.amount ? m.amount + ' ' : ''}${m.unit ? m.unit + ' ' : ''}${m.item}\n`;
      });
    }

    out += `\n--- INSTRUCTIONS ---\n`;
    (recipe.instructions || []).forEach((step, idx) => {
      const num = step.step || (idx + 1);
      const title = step.title ? `${step.title}: ` : "";
      out += `${num}. ${title}${step.instruction}\n`;
    });

    if (recipe.chef_tip) {
      out += `\n💡 CHEF'S TIP: ${recipe.chef_tip}\n`;
    }

    out += `\nGenerated by AI Recipe Generator`;
    return out;
  }

  // -------------------------------------------------------------------------
  // Clipboard & Toast Notification
  // -------------------------------------------------------------------------
  async function copyToClipboard(text, successMessage) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for non-https or older browser contexts
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      showToast(successMessage);
    } catch (err) {
      console.warn("Clipboard copy error:", err);
      showToast("Could not copy to clipboard automatically.");
    }
  }

  let toastTimeout = null;
  function showToast(msg) {
    if (!elements.toastNotification) return;
    elements.toastMessage.textContent = msg;
    elements.toastNotification.classList.remove("hidden");

    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      elements.toastNotification.classList.add("hidden");
    }, 3200);
  }

  // -------------------------------------------------------------------------
  // Error Alert Helpers
  // -------------------------------------------------------------------------
  function showError(title, message) {
    elements.errorTitle.textContent = title;
    elements.errorMessage.textContent = message;
    elements.errorAlert.classList.remove("hidden");
    elements.errorAlert.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function hideError() {
    elements.errorAlert.classList.add("hidden");
  }

  // -------------------------------------------------------------------------
  // Utility Functions
  // -------------------------------------------------------------------------
  function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function capitalize(str) {
    if (!str) return "";
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  // Launch app
  init();
});
