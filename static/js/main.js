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
    lastGeneratedRecipes: [],
    favorites: [],
    detectedIngredients: [],
    selectedDetected: new Set(),
    lastMealPlan: null
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
    toastMessage: document.getElementById("toastMessage"),

    // Favorites
    openFavoritesBtn: document.getElementById("openFavoritesBtn"),
    favoritesCountBadge: document.getElementById("favoritesCountBadge"),
    favoritesModal: document.getElementById("favoritesModal"),
    closeFavoritesModalBtn: document.getElementById("closeFavoritesModalBtn"),
    favoritesSearchInput: document.getElementById("favoritesSearchInput"),
    favoritesCountLabel: document.getElementById("favoritesCountLabel"),
    favoritesEmptyState: document.getElementById("favoritesEmptyState"),
    favoritesGrid: document.getElementById("favoritesGrid"),

    // Fridge Photo Scanner
    scanFridgeBtn: document.getElementById("scanFridgeBtn"),
    fridgePhotoInput: document.getElementById("fridgePhotoInput"),
    fridgeScanModal: document.getElementById("fridgeScanModal"),
    closeFridgeScanModalBtn: document.getElementById("closeFridgeScanModalBtn"),
    photoPreviewWrap: document.getElementById("photoPreviewWrap"),
    photoPreviewImg: document.getElementById("photoPreviewImg"),
    photoScanLaser: document.getElementById("photoScanLaser"),
    scanStatusBox: document.getElementById("scanStatusBox"),
    scanStatusTitle: document.getElementById("scanStatusTitle"),
    scanStatusDesc: document.getElementById("scanStatusDesc"),
    scanResultsBox: document.getElementById("scanResultsBox"),
    detectedCount: document.getElementById("detectedCount"),
    selectAllDetectedBtn: document.getElementById("selectAllDetectedBtn"),
    detectedChipsList: document.getElementById("detectedChipsList"),
    addDetectedIngredientsBtn: document.getElementById("addDetectedIngredientsBtn"),
    retakePhotoBtn: document.getElementById("retakePhotoBtn"),
    scanErrorBox: document.getElementById("scanErrorBox"),
    scanErrorTitle: document.getElementById("scanErrorTitle"),
    scanErrorMessage: document.getElementById("scanErrorMessage"),
    tryAnotherPhotoBtn: document.getElementById("tryAnotherPhotoBtn"),
    cancelScanBtn: document.getElementById("cancelScanBtn"),
    tagsContainer: document.getElementById("tagsContainer"),

    // Meal Plan Elements
    generateMealPlanBtn: document.getElementById("generateMealPlanBtn"),
    regenerateMealPlanBtn: document.getElementById("regenerateMealPlanBtn"),
    copyFullPlanBtn: document.getElementById("copyFullPlanBtn"),
    printMealPlanBtn: document.getElementById("printMealPlanBtn"),
    mealPlanSection: document.getElementById("mealPlanSection"),
    mealPlanTitle: document.getElementById("mealPlanTitle"),
    mealPlanOverview: document.getElementById("mealPlanOverview"),
    sharedGroceryContent: document.getElementById("sharedGroceryContent"),
    copySharedShoppingBtn: document.getElementById("copySharedShoppingBtn"),
    mealPlanGrid: document.getElementById("mealPlanGrid")
  };

  // -------------------------------------------------------------------------
  // Initialization & Status Check
  // -------------------------------------------------------------------------
  function init() {
    checkBackendStatus();
    setupEventListeners();
    updateTagUI();
    fetchFavorites();
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

    // Generate Weekly Meal Plan action
    if (elements.generateMealPlanBtn) {
      elements.generateMealPlanBtn.addEventListener("click", generateMealPlan);
    }
    if (elements.regenerateMealPlanBtn) {
      elements.regenerateMealPlanBtn.addEventListener("click", generateMealPlan);
    }
    if (elements.copyFullPlanBtn) {
      elements.copyFullPlanBtn.addEventListener("click", () => {
        if (state.lastMealPlan) copyFullMealPlan(state.lastMealPlan);
      });
    }
    if (elements.printMealPlanBtn) {
      elements.printMealPlanBtn.addEventListener("click", () => {
        window.print();
      });
    }
    if (elements.copySharedShoppingBtn) {
      elements.copySharedShoppingBtn.addEventListener("click", () => {
        if (state.lastMealPlan) copyWeeklyShoppingList(state.lastMealPlan.shared_shopping_list || []);
      });
    }

    // Edit ingredients button scrolls back to input
    elements.editIngredientsBtn.addEventListener("click", () => {
      elements.ingredientInput.scrollIntoView({ behavior: "smooth", block: "center" });
      elements.ingredientInput.focus();
    });

    // Dismiss error alert
    elements.dismissAlertBtn.addEventListener("click", hideError);

    // Favorites Modal Event Listeners
    if (elements.openFavoritesBtn) {
      elements.openFavoritesBtn.addEventListener("click", openFavoritesModal);
    }
    if (elements.closeFavoritesModalBtn) {
      elements.closeFavoritesModalBtn.addEventListener("click", closeFavoritesModal);
    }
    if (elements.favoritesModal) {
      elements.favoritesModal.addEventListener("click", (e) => {
        // Close if clicked on the dark backdrop outside the modal card
        if (e.target === elements.favoritesModal) {
          closeFavoritesModal();
        }
      });
    }
    if (elements.favoritesSearchInput) {
      elements.favoritesSearchInput.addEventListener("input", () => {
        renderFavoritesGrid();
      });
    }

    // Close modal on Escape key
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (elements.favoritesModal && !elements.favoritesModal.classList.contains("hidden")) {
          closeFavoritesModal();
        }
        if (elements.fridgeScanModal && !elements.fridgeScanModal.classList.contains("hidden")) {
          closeFridgeScanModal();
        }
      }
    });

    // Fridge Photo Scanner Event Listeners
    if (elements.scanFridgeBtn && elements.fridgePhotoInput) {
      elements.scanFridgeBtn.addEventListener("click", () => {
        elements.fridgePhotoInput.click();
      });
      elements.fridgePhotoInput.addEventListener("change", (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) {
          handleFridgePhotoSelected(file);
          // Reset input value so same photo can be re-selected if needed
          elements.fridgePhotoInput.value = "";
        }
      });
    }

    if (elements.closeFridgeScanModalBtn) {
      elements.closeFridgeScanModalBtn.addEventListener("click", closeFridgeScanModal);
    }
    if (elements.cancelScanBtn) {
      elements.cancelScanBtn.addEventListener("click", closeFridgeScanModal);
    }
    if (elements.retakePhotoBtn && elements.fridgePhotoInput) {
      elements.retakePhotoBtn.addEventListener("click", () => {
        elements.fridgePhotoInput.click();
      });
    }
    if (elements.tryAnotherPhotoBtn && elements.fridgePhotoInput) {
      elements.tryAnotherPhotoBtn.addEventListener("click", () => {
        elements.fridgePhotoInput.click();
      });
    }
    if (elements.fridgeScanModal) {
      elements.fridgeScanModal.addEventListener("click", (e) => {
        if (e.target === elements.fridgeScanModal) {
          closeFridgeScanModal();
        }
      });
    }

    if (elements.selectAllDetectedBtn) {
      elements.selectAllDetectedBtn.addEventListener("click", () => {
        if (state.selectedDetected.size === state.detectedIngredients.length) {
          state.selectedDetected.clear();
          elements.selectAllDetectedBtn.textContent = "Select All";
        } else {
          state.selectedDetected = new Set(state.detectedIngredients);
          elements.selectAllDetectedBtn.textContent = "Deselect All";
        }
        renderDetectedChips();
      });
    }

    if (elements.addDetectedIngredientsBtn) {
      elements.addDetectedIngredientsBtn.addEventListener("click", addSelectedDetectedToKitchen);
    }

    // Drag and drop photo onto ingredients container
    if (elements.tagsContainer) {
      elements.tagsContainer.addEventListener("dragover", (e) => {
        e.preventDefault();
        elements.tagsContainer.classList.add("drag-over");
      });
      elements.tagsContainer.addEventListener("dragleave", () => {
        elements.tagsContainer.classList.remove("drag-over");
      });
      elements.tagsContainer.addEventListener("drop", (e) => {
        e.preventDefault();
        elements.tagsContainer.classList.remove("drag-over");
        const file = e.dataTransfer.files && e.dataTransfer.files[0];
        if (file && file.type.startsWith("image/")) {
          handleFridgePhotoSelected(file);
        }
      });
    }
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
    startLoading(false);

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

      // Safely inspect response content-type to handle non-JSON or HTML gateway errors (e.g. 502/504)
      const contentType = response.headers.get("content-type") || "";
      let data = null;

      if (contentType.includes("application/json")) {
        try {
          data = await response.json();
        } catch (jsonErr) {
          console.warn("Could not parse JSON response:", jsonErr);
        }
      } else {
        const rawText = await response.text();
        console.warn("Server returned non-JSON response:", rawText.slice(0, 300));
      }

      if (!response.ok) {
        if (response.status === 504 || response.status === 502) {
          throw new Error("The recipe service took too long to respond (server timeout). Please try again in a moment.");
        }
        if (data && (data.message || data.error)) {
          throw new Error(data.message || data.error);
        }
        throw new Error(`The server encountered an issue (${response.status}: ${response.statusText || 'Service issue'}). Please try again.`);
      }

      if (!data) {
        throw new Error("Received an unexpected response from the server. Please try again.");
      }

      if (!data.recipes || data.recipes.length === 0) {
        throw new Error("No recipes were returned by the AI. Please try again with additional ingredients.");
      }

      state.lastGeneratedRecipes = data.recipes;
      renderRecipes(data.recipes);
      showToast("3 delicious recipes ready!");
    } catch (err) {
      console.error("Recipe generation error:", err);
      let userMessage = err.message || "Something went wrong while contacting Gemini.";
      // Clean up any remaining technical JSON parse errors into user-friendly text
      if (userMessage.includes("Unexpected token") || userMessage.includes("JSON")) {
        userMessage = "The server returned an unexpected response. Please try again in a moment.";
      }
      showError("Chef Hiccup", userMessage);
    } finally {
      stopLoading();
    }
  }

  // -------------------------------------------------------------------------
  // Loading State & Animation
  // -------------------------------------------------------------------------

  // Extra phrases used when generating the weekly meal plan
  const MEAL_PLAN_PHRASES = [
    "Mapping out 7 delicious dinners...",
    "Balancing variety and pantry use across the week...",
    "Building a waste-minimising ingredient overlap...",
    "Scaling portions for your household...",
    "Compiling the consolidated weekly shopping list...",
    "Adding chef tips for every day...",
    "Finalising your 7-day culinary calendar..."
  ];

  /**
   * Enters the loading state.
   * @param {boolean} isMealPlan - when true, tweaks copy for the meal-plan button.
   */
  function startLoading(isMealPlan = false) {
    state.isLoading = true;

    // Disable both action buttons so the user can't fire two requests at once
    elements.generateBtn.disabled = true;
    if (elements.generateMealPlanBtn) elements.generateMealPlanBtn.disabled = true;

    if (isMealPlan) {
      if (elements.generateMealPlanBtn) {
        elements.generateMealPlanBtn.innerHTML = `<span>⏳</span> Planning your week...`;
      }
      // Hide both result sections while generating
      elements.mealPlanSection.classList.add("hidden");
    } else {
      elements.generateBtn.innerHTML = `<span>⏳</span> Cooking up recipes...`;
      elements.resultsSection.classList.add("hidden");
    }

    elements.loadingSection.classList.remove("hidden");
    elements.loadingSection.scrollIntoView({ behavior: "smooth", block: "start" });

    // Cycle friendly chef status phrases
    const phrases = isMealPlan ? MEAL_PLAN_PHRASES : LOADING_PHRASES;
    let phraseIdx = 0;
    elements.loadingPhrase.textContent = phrases[0];
    loadingPhraseInterval = setInterval(() => {
      phraseIdx = (phraseIdx + 1) % phrases.length;
      elements.loadingPhrase.style.opacity = "0";
      setTimeout(() => {
        elements.loadingPhrase.textContent = phrases[phraseIdx];
        elements.loadingPhrase.style.opacity = "1";
      }, 200);
    }, 2200);
  }

  function stopLoading() {
    state.isLoading = false;
    elements.generateBtn.disabled = false;
    elements.generateBtn.innerHTML = `<span class="btn-sparkle">✨</span> Generate 3 Chef Recipes`;
    if (elements.generateMealPlanBtn) {
      elements.generateMealPlanBtn.disabled = false;
      elements.generateMealPlanBtn.innerHTML = `<span class="btn-icon">📅</span> 7-Day Meal Plan`;
    }
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

    // Build Nutrition Box (Feature 4)
    const nutritionHtml = buildNutritionHtml(recipe.nutrition);

    // Check if already favorited
    const isFav = isRecipeFavorite(recipe.name);

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

        ${nutritionHtml}

        <div class="recipe-card-actions">
          <button type="button" class="btn btn-secondary btn-sm favorite-recipe-btn ${isFav ? 'active' : ''}" data-recipe-name="${escapeHtml(recipe.name || '')}">
            ${isFav ? '❤️ Saved' : '🤍 Save'}
          </button>
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
    // Favorite / Save toggle button
    const favBtn = card.querySelector(".favorite-recipe-btn");
    if (favBtn) {
      favBtn.addEventListener("click", async () => {
        if (isRecipeFavorite(recipe.name)) {
          await removeFavoriteByName(recipe.name);
          favBtn.classList.remove("active");
          favBtn.innerHTML = "🤍 Save";
        } else {
          await saveFavorite(recipe);
          favBtn.classList.add("active");
          favBtn.innerHTML = "❤️ Saved";
        }
      });
    }
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
  // Feature 4: Nutrition Information HTML Builder
  // -------------------------------------------------------------------------

  /**
   * Builds the nutrition strip HTML shown at the bottom of each recipe card.
   * Shows calories, protein, carbs, fat per serving + a brief disclaimer.
   * Returns an empty string when the nutrition object is missing or malformed.
   * @param {object|undefined} nutrition
   * @returns {string} HTML string
   */
  function buildNutritionHtml(nutrition) {
    if (!nutrition || typeof nutrition !== "object") return "";

    const cal  = nutrition.calories_per_serving;
    const prot = nutrition.protein_g;
    const carb = nutrition.carbs_g;
    const fat  = nutrition.fat_g;
    const disc = nutrition.disclaimer || "Estimates only. Actual values vary by brand and preparation.";

    // All four main values must be present and numeric
    if (cal == null || prot == null || carb == null || fat == null) return "";

    return `
      <div class="nutrition-box">
        <div class="nutrition-header">
          <span class="nutrition-title">🔢 Nutrition per serving</span>
          <span class="nutrition-estimate-badge">Estimates</span>
        </div>
        <div class="nutrition-grid">
          <div class="nutrition-stat">
            <span class="nutrition-value">${Math.round(cal)}</span>
            <span class="nutrition-label">kcal</span>
          </div>
          <div class="nutrition-stat">
            <span class="nutrition-value">${Math.round(prot)}g</span>
            <span class="nutrition-label">Protein</span>
          </div>
          <div class="nutrition-stat">
            <span class="nutrition-value">${Math.round(carb)}g</span>
            <span class="nutrition-label">Carbs</span>
          </div>
          <div class="nutrition-stat">
            <span class="nutrition-value">${Math.round(fat)}g</span>
            <span class="nutrition-label">Fat</span>
          </div>
        </div>
        <p class="nutrition-disclaimer">${escapeHtml(disc)}</p>
      </div>
    `;
  }

  // -------------------------------------------------------------------------
  // Feature 3: Weekly Meal Plan – API Request
  // -------------------------------------------------------------------------

  /**
   * Sends current ingredients + options to /api/generate-meal-plan
   * and renders the 7-day plan when successful.
   */
  async function generateMealPlan() {
    if (state.isLoading) return;

    if (state.ingredients.length === 0) {
      showError(
        "No Ingredients Added",
        "Please add at least one ingredient so Gemini can plan a full week of meals for you."
      );
      elements.ingredientInput.focus();
      return;
    }

    hideError();
    startLoading(true);

    const payload = {
      ingredients: state.ingredients,
      servings: state.servings,
      dietary: state.dietary,
      max_time: state.maxTime
    };

    try {
      const response = await fetch("/api/generate-meal-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const contentType = response.headers.get("content-type") || "";
      let data = null;

      if (contentType.includes("application/json")) {
        try {
          data = await response.json();
        } catch (jsonErr) {
          console.warn("Could not parse meal plan JSON:", jsonErr);
        }
      } else {
        const rawText = await response.text();
        console.warn("Server returned non-JSON meal plan response:", rawText.slice(0, 300));
      }

      if (!response.ok) {
        if (response.status === 504 || response.status === 502) {
          throw new Error("The meal plan service took too long to respond. Please try again in a moment.");
        }
        if (data && (data.message || data.error)) {
          throw new Error(data.message || data.error);
        }
        throw new Error(`The server encountered an issue (${response.status}). Please try again.`);
      }

      if (!data || !data.plan) {
        throw new Error("No meal plan was returned. Please try again.");
      }

      state.lastMealPlan = data.plan;
      renderMealPlan(data.plan);
      showToast("📅 Your 7-day meal plan is ready!");
    } catch (err) {
      console.error("Meal plan generation error:", err);
      let userMessage = err.message || "Something went wrong while generating the meal plan.";
      if (userMessage.includes("Unexpected token") || userMessage.includes("JSON")) {
        userMessage = "The server returned an unexpected response. Please try again in a moment.";
      }
      showError("Meal Plan Hiccup", userMessage);
    } finally {
      stopLoading();
    }
  }

  // -------------------------------------------------------------------------
  // Feature 3: Weekly Meal Plan – Rendering
  // -------------------------------------------------------------------------

  /**
   * Renders the full 7-day meal plan section: title, overview, shared shopping
   * list, and one day card per day.
   * @param {object} plan – the parsed plan object from /api/generate-meal-plan
   */
  function renderMealPlan(plan) {
    // Update title and overview
    if (elements.mealPlanTitle) {
      elements.mealPlanTitle.textContent = plan.plan_title || "Your 7-Day Meal Plan";
    }
    if (elements.mealPlanOverview) {
      elements.mealPlanOverview.textContent = plan.overview || "";
    }

    // Render shared grocery list
    renderSharedShoppingList(plan.shared_shopping_list || []);

    // Render day cards
    if (elements.mealPlanGrid) {
      elements.mealPlanGrid.innerHTML = "";
      (plan.days || []).forEach((dayData, idx) => {
        const card = createMealPlanDayCard(dayData, idx);
        elements.mealPlanGrid.appendChild(card);
      });
    }

    // Show the section and scroll to it
    elements.mealPlanSection.classList.remove("hidden");
    // Also hide any currently visible recipe results to avoid confusion
    elements.resultsSection.classList.add("hidden");
    elements.mealPlanSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /**
   * Renders the consolidated weekly shopping list grouped by category.
   * @param {Array} items – array of { category, item, amount, unit }
   */
  function renderSharedShoppingList(items) {
    if (!elements.sharedGroceryContent) return;
    elements.sharedGroceryContent.innerHTML = "";

    if (!items || items.length === 0) {
      elements.sharedGroceryContent.innerHTML =
        `<p style="color:var(--color-text-muted);font-size:0.9rem;">
           🎉 Great news – all ingredients are already in your kitchen!
         </p>`;
      return;
    }

    // Group items by category (case-insensitive)
    const groups = {};
    items.forEach((item) => {
      const cat = (item.category || "Other").trim();
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    });

    // Category icons mapping
    const CAT_ICONS = {
      produce: "🥦", dairy: "🥛", protein: "🥩", meat: "🥩",
      bakery: "🍞", bread: "🍞", pantry: "🫙", spices: "🌶️",
      "pantry & spices": "🫙", frozen: "🧊", beverages: "🥤",
      condiments: "🫙", seafood: "🐟", other: "🛒"
    };

    Object.entries(groups).forEach(([category, catItems]) => {
      const icon = CAT_ICONS[category.toLowerCase()] || "🛒";
      const itemsHtml = catItems.map((it, idx) => {
        const qty = [it.amount, it.unit].filter(Boolean).join(" ");
        const label = qty ? `${qty} ${escapeHtml(it.item)}` : escapeHtml(it.item);
        const checkId = `grocery_${category}_${idx}`;
        return `
          <li class="grocery-item" id="li_${checkId}">
            <input type="checkbox" id="${checkId}" class="grocery-checkbox">
            <label for="${checkId}"><span>${label}</span></label>
          </li>`;
      }).join("");

      const groupEl = document.createElement("div");
      groupEl.className = "grocery-category-group";
      groupEl.innerHTML = `
        <div class="grocery-category-name">${icon} ${escapeHtml(category)}</div>
        <ul class="grocery-items-list">${itemsHtml}</ul>
      `;

      // Wire up checkboxes for strikethrough
      groupEl.querySelectorAll(".grocery-checkbox").forEach((chk) => {
        chk.addEventListener("change", () => {
          chk.closest(".grocery-item").classList.toggle("checked", chk.checked);
        });
      });

      elements.sharedGroceryContent.appendChild(groupEl);
    });
  }

  /**
   * Creates and returns a recipe-style card for a single day of the meal plan.
   * @param {object} dayData – one entry from plan.days
   * @param {number} index   – 0-based index (used for unique IDs)
   * @returns {HTMLElement}
   */
  function createMealPlanDayCard(dayData, index) {
    const card = document.createElement("article");
    card.className = "recipe-card";

    const day = dayData.day || `Day ${index + 1}`;
    const cookingTime = dayData.cooking_time_formatted || `${dayData.cooking_time_minutes || "?"} mins`;
    const difficulty = dayData.difficulty || "Easy";
    const servings = dayData.servings || state.servings;

    // Ingredients list
    const ingredientsHtml = (dayData.ingredients || []).map((ing) => {
      const item = escapeHtml(ing.item || "");
      const amount = escapeHtml(String(ing.amount || ""));
      const unit = escapeHtml(ing.unit || "");
      const pantryTag = ing.is_staple_or_provided
        ? `<span class="pantry-badge">In pantry</span>` : "";
      return `
        <li class="ingredient-item">
          <span class="ingredient-name">${item} ${pantryTag}</span>
          <span class="ingredient-qty">${amount} ${unit}</span>
        </li>`;
    }).join("");

    // Instructions
    const instructionsHtml = (dayData.instructions || []).map((inst, sIdx) => {
      const stepNum = inst.step || (sIdx + 1);
      const title = inst.title ? `<div class="step-title">${escapeHtml(inst.title)}</div>` : "";
      return `
        <li class="instruction-step">
          <div class="step-number">${stepNum}</div>
          <div class="step-content">
            ${title}
            <div class="step-text">${escapeHtml(inst.instruction || "")}</div>
          </div>
        </li>`;
    }).join("");

    // Chef tip
    const chefTipHtml = dayData.chef_tip ? `
      <div class="chef-tip-box">
        <div class="chef-tip-header">💡 Chef's Tip</div>
        <div class="chef-tip-content">${escapeHtml(dayData.chef_tip)}</div>
      </div>` : "";

    // Nutrition (Feature 4 on meal plan cards)
    const nutritionHtml = buildNutritionHtml(dayData.nutrition);

    // Check favourite status (treat day card like a recipe)
    const isFav = isRecipeFavorite(dayData.name);

    card.innerHTML = `
      <div class="card-top-accent"></div>
      <div class="recipe-card-content">
        <div class="recipe-badges-row">
          <span class="day-badge">📅 ${escapeHtml(day)}</span>
          <span class="pill pill-amber">⏱️ ${escapeHtml(cookingTime)}</span>
          <span class="pill pill-subtle">👥 ${escapeHtml(String(servings))} servings</span>
          <span class="pill pill-subtle">⚡ ${escapeHtml(difficulty)}</span>
        </div>

        <h3 class="recipe-card-title">${escapeHtml(dayData.name || "Dinner")}</h3>
        ${dayData.tagline ? `<div class="recipe-tagline">${escapeHtml(dayData.tagline)}</div>` : ""}
        <p class="recipe-desc">${escapeHtml(dayData.description || "")}</p>

        <div class="recipe-subheading"><span>🥄 Ingredients</span></div>
        <ul class="ingredients-list">${ingredientsHtml}</ul>

        <div class="recipe-subheading"><span>👩‍🍳 Instructions</span></div>
        <ol class="instructions-list">${instructionsHtml}</ol>

        ${chefTipHtml}
        ${nutritionHtml}

        <div class="recipe-card-actions">
          <button type="button" class="btn btn-secondary btn-sm favorite-recipe-btn ${isFav ? 'active' : ''}"
            data-recipe-name="${escapeHtml(dayData.name || '')}">
            ${isFav ? "❤️ Saved" : "🤍 Save"}
          </button>
          <button type="button" class="btn btn-secondary btn-sm copy-day-btn">
            📋 Copy Day
          </button>
        </div>
      </div>
    `;

    // Favourite button for the day card
    const favBtn = card.querySelector(".favorite-recipe-btn");
    if (favBtn) {
      favBtn.addEventListener("click", async () => {
        // Build a recipe-compatible object so it can be saved to favorites
        const recipeObj = {
          name: dayData.name,
          tagline: dayData.tagline || "",
          description: dayData.description || "",
          cooking_time_formatted: cookingTime,
          servings: servings,
          difficulty: difficulty,
          dietary: [],
          ingredients: dayData.ingredients || [],
          missing_ingredients: [],
          instructions: dayData.instructions || [],
          chef_tip: dayData.chef_tip || "",
          nutrition: dayData.nutrition || null
        };
        if (isRecipeFavorite(dayData.name)) {
          await removeFavoriteByName(dayData.name);
          favBtn.classList.remove("active");
          favBtn.innerHTML = "🤍 Save";
        } else {
          await saveFavorite(recipeObj);
          favBtn.classList.add("active");
          favBtn.innerHTML = "❤️ Saved";
        }
      });
    }

    // Copy day recipe to clipboard
    const copyDayBtn = card.querySelector(".copy-day-btn");
    if (copyDayBtn) {
      copyDayBtn.addEventListener("click", () => {
        let txt = `📅 ${day.toUpperCase()}: ${dayData.name}\n`;
        if (dayData.tagline) txt += `"${dayData.tagline}"\n`;
        txt += `⏱️ ${cookingTime} | 👥 ${servings} servings\n`;
        if (dayData.description) txt += `\n${dayData.description}\n`;
        txt += `\n--- INGREDIENTS ---\n`;
        (dayData.ingredients || []).forEach((ing) => {
          txt += `• ${ing.amount ? ing.amount + " " : ""}${ing.unit ? ing.unit + " " : ""}${ing.item}\n`;
        });
        txt += `\n--- INSTRUCTIONS ---\n`;
        (dayData.instructions || []).forEach((inst, idx) => {
          const n = inst.step || (idx + 1);
          const t = inst.title ? `${inst.title}: ` : "";
          txt += `${n}. ${t}${inst.instruction}\n`;
        });
        if (dayData.chef_tip) txt += `\n💡 TIP: ${dayData.chef_tip}\n`;
        copyToClipboard(txt, `${day} recipe copied!`);
      });
    }

    return card;
  }

  // -------------------------------------------------------------------------
  // Feature 3: Meal Plan – Copy/Export Helpers
  // -------------------------------------------------------------------------

  /**
   * Copies the full consolidated weekly shopping list to the clipboard.
   * @param {Array} items
   */
  function copyWeeklyShoppingList(items) {
    if (!items || items.length === 0) {
      showToast("Shopping list is empty – nothing to copy!");
      return;
    }

    // Group by category
    const groups = {};
    items.forEach((it) => {
      const cat = (it.category || "Other").trim();
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(it);
    });

    let txt = "🛒 WEEKLY SHOPPING LIST\n" + "=".repeat(28) + "\n\n";
    Object.entries(groups).forEach(([cat, catItems]) => {
      txt += `${cat.toUpperCase()}\n`;
      catItems.forEach((it) => {
        const qty = [it.amount, it.unit].filter(Boolean).join(" ");
        txt += `  • ${qty ? qty + " " : ""}${it.item}\n`;
      });
      txt += "\n";
    });
    txt += "Generated by AI Recipe Generator";
    copyToClipboard(txt, "📋 Weekly shopping list copied!");
  }

  /**
   * Copies the entire meal plan (all 7 days + shopping list) to the clipboard.
   * @param {object} plan
   */
  function copyFullMealPlan(plan) {
    if (!plan) {
      showToast("No meal plan to copy.");
      return;
    }

    let txt = `📅 ${(plan.plan_title || "7-Day Meal Plan").toUpperCase()}\n`;
    txt += "=".repeat(42) + "\n";
    if (plan.overview) txt += `\n${plan.overview}\n`;
    txt += "\n";

    (plan.days || []).forEach((day) => {
      txt += `\n━━ ${day.day?.toUpperCase() || "DAY"}: ${day.name} ━━\n`;
      if (day.tagline) txt += `"${day.tagline}"\n`;
      txt += `⏱️ ${day.cooking_time_formatted || "?"} | 👥 ${day.servings || 2} servings\n`;
      txt += `\nIngredients:\n`;
      (day.ingredients || []).forEach((ing) => {
        txt += `  • ${ing.amount ? ing.amount + " " : ""}${ing.unit ? ing.unit + " " : ""}${ing.item}\n`;
      });
      txt += `\nInstructions:\n`;
      (day.instructions || []).forEach((inst, idx) => {
        const n = inst.step || (idx + 1);
        const t = inst.title ? `${inst.title}: ` : "";
        txt += `  ${n}. ${t}${inst.instruction}\n`;
      });
      if (day.chef_tip) txt += `\n💡 Tip: ${day.chef_tip}\n`;
    });

    // Append shopping list
    const shopping = plan.shared_shopping_list || [];
    if (shopping.length > 0) {
      txt += "\n\n" + "=".repeat(42) + "\n🛒 WEEKLY SHOPPING LIST\n" + "=".repeat(42) + "\n";
      const groups = {};
      shopping.forEach((it) => {
        const cat = (it.category || "Other").trim();
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push(it);
      });
      Object.entries(groups).forEach(([cat, catItems]) => {
        txt += `\n${cat}:\n`;
        catItems.forEach((it) => {
          const qty = [it.amount, it.unit].filter(Boolean).join(" ");
          txt += `  • ${qty ? qty + " " : ""}${it.item}\n`;
        });
      });
    }

    txt += "\nGenerated by AI Recipe Generator";
    copyToClipboard(txt, "📋 Full meal plan copied to clipboard!");
  }
  // -------------------------------------------------------------------------

  async function fetchFavorites() {
    try {
      const response = await fetch("/api/favorites");
      if (response.ok) {
        const data = await response.json();
        state.favorites = data.favorites || [];
        updateFavoritesBadge();
        syncCardFavoriteButtons();
      }
    } catch (err) {
      console.warn("Could not fetch favorites:", err);
    }
  }

  function updateFavoritesBadge() {
    if (!elements.favoritesCountBadge) return;
    const count = state.favorites.length;
    elements.favoritesCountBadge.textContent = count;
    elements.favoritesCountBadge.classList.remove("bump");
    void elements.favoritesCountBadge.offsetWidth;
    elements.favoritesCountBadge.classList.add("bump");
  }

  function isRecipeFavorite(name) {
    if (!name) return false;
    const target = name.toLowerCase().trim();
    return state.favorites.some(
      (f) => (f.recipe_name || f.recipe?.name || "").toLowerCase().trim() === target
    );
  }

  function getFavoriteRecordByName(name) {
    if (!name) return null;
    const target = name.toLowerCase().trim();
    return state.favorites.find(
      (f) => (f.recipe_name || f.recipe?.name || "").toLowerCase().trim() === target
    ) || null;
  }

  async function saveFavorite(recipe) {
    if (!recipe || !recipe.name) return;
    try {
      const response = await fetch("/api/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipe })
      });
      const data = await response.json();
      if (response.ok && data.success) {
        if (!isRecipeFavorite(recipe.name)) {
          state.favorites.unshift({
            id: data.id,
            recipe_name: recipe.name,
            tagline: recipe.tagline || "",
            cooking_time: recipe.cooking_time_formatted || `${recipe.cooking_time_minutes || ''} mins`,
            servings: recipe.servings || 2,
            difficulty: recipe.difficulty || "Easy",
            recipe: recipe,
            created_at: new Date().toISOString()
          });
          updateFavoritesBadge();
        }
        showToast(`❤️ "${recipe.name}" saved to favorites!`);
        syncCardFavoriteButtons();
        if (elements.favoritesModal && !elements.favoritesModal.classList.contains("hidden")) {
          renderFavoritesGrid();
        }
      } else {
        throw new Error(data.message || "Failed to save favorite.");
      }
    } catch (err) {
      console.error("Save favorite error:", err);
      showToast("Could not save to favorites. Please try again.");
    }
  }

  async function removeFavorite(favId, recipeName) {
    if (!favId) return;
    try {
      const response = await fetch(`/api/favorites/${favId}`, {
        method: "DELETE"
      });
      const data = await response.json();
      if (response.ok && data.success) {
        state.favorites = state.favorites.filter((f) => f.id !== favId);
        updateFavoritesBadge();
        showToast(recipeName ? `Removed "${recipeName}" from favorites.` : "Recipe removed from favorites.");
        syncCardFavoriteButtons();
        if (elements.favoritesModal && !elements.favoritesModal.classList.contains("hidden")) {
          renderFavoritesGrid();
        }
      } else {
        throw new Error(data.message || "Failed to delete favorite.");
      }
    } catch (err) {
      console.error("Delete favorite error:", err);
      showToast("Could not remove from favorites.");
    }
  }

  async function removeFavoriteByName(name) {
    const record = getFavoriteRecordByName(name);
    if (record) {
      await removeFavorite(record.id, name);
    }
  }

  function syncCardFavoriteButtons() {
    document.querySelectorAll(".favorite-recipe-btn").forEach((btn) => {
      const recipeName = btn.getAttribute("data-recipe-name");
      if (recipeName && isRecipeFavorite(recipeName)) {
        btn.classList.add("active");
        btn.innerHTML = "❤️ Saved";
      } else if (recipeName) {
        btn.classList.remove("active");
        btn.innerHTML = "🤍 Save";
      }
    });
  }

  function openFavoritesModal() {
    if (!elements.favoritesModal) return;
    elements.favoritesModal.classList.remove("hidden");
    document.body.style.overflow = "hidden";
    if (elements.favoritesSearchInput) {
      elements.favoritesSearchInput.value = "";
    }
    renderFavoritesGrid();
  }

  function closeFavoritesModal() {
    if (!elements.favoritesModal) return;
    elements.favoritesModal.classList.add("hidden");
    document.body.style.overflow = "";
  }

  function renderFavoritesGrid() {
    if (!elements.favoritesGrid || !elements.favoritesEmptyState) return;

    const query = (elements.favoritesSearchInput ? elements.favoritesSearchInput.value : "").toLowerCase().trim();
    const filtered = state.favorites.filter((fav) => {
      if (!query) return true;
      const name = (fav.recipe_name || fav.recipe?.name || "").toLowerCase();
      const tagline = (fav.tagline || fav.recipe?.tagline || "").toLowerCase();
      const desc = (fav.recipe?.description || "").toLowerCase();
      const ingredients = (fav.recipe?.ingredients || []).map((i) => (i.item || "").toLowerCase()).join(" ");
      return name.includes(query) || tagline.includes(query) || desc.includes(query) || ingredients.includes(query);
    });

    if (elements.favoritesCountLabel) {
      if (query) {
        elements.favoritesCountLabel.textContent = `${filtered.length} found (${state.favorites.length} saved)`;
      } else {
        elements.favoritesCountLabel.textContent = `${state.favorites.length} recipe${state.favorites.length === 1 ? '' : 's'} saved`;
      }
    }

    if (filtered.length === 0) {
      elements.favoritesEmptyState.classList.remove("hidden");
      elements.favoritesGrid.classList.add("hidden");
      elements.favoritesGrid.innerHTML = "";
      const emptyTitle = elements.favoritesEmptyState.querySelector(".empty-title");
      const emptyDesc = elements.favoritesEmptyState.querySelector(".empty-desc");
      if (query) {
        if (emptyTitle) emptyTitle.textContent = "No matching recipes";
        if (emptyDesc) emptyDesc.textContent = `No saved recipes match "${escapeHtml(query)}". Try another search term.`;
      } else {
        if (emptyTitle) emptyTitle.textContent = "No favorites saved yet";
        if (emptyDesc) emptyDesc.textContent = "Generate some recipes and click the ❤️ Save button on any recipe card to store your favorite dishes here.";
      }
      return;
    }

    elements.favoritesEmptyState.classList.add("hidden");
    elements.favoritesGrid.classList.remove("hidden");
    elements.favoritesGrid.innerHTML = "";

    filtered.forEach((fav) => {
      const card = createFavoriteCard(fav);
      elements.favoritesGrid.appendChild(card);
    });
  }

  function createFavoriteCard(fav) {
    const recipe = fav.recipe || {};
    const card = document.createElement("article");
    card.className = "recipe-card favorite-card";

    const cookingTime = fav.cooking_time || recipe.cooking_time_formatted || `${recipe.cooking_time_minutes || 30} mins`;
    const servings = fav.servings || recipe.servings || 2;
    const difficulty = fav.difficulty || recipe.difficulty || "Easy";
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
        return `
          <li class="ingredient-item">
            <span class="ingredient-name">${item} ${notes}</span>
            <span class="ingredient-qty">${amount} ${unit}</span>
          </li>
        `;
      })
      .join("");

    // Build missing ingredients if any
    const missingList = recipe.missing_ingredients || [];
    let shoppingListHtml = "";
    if (missingList.length > 0) {
      const itemsHtml = missingList
        .map((m, mIdx) => {
          const itemText = `${m.amount ? m.amount + ' ' : ''}${m.unit ? m.unit + ' ' : ''}${m.item}`;
          const itemId = `fav_shop_${fav.id}_${mIdx}`;
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
            <button type="button" class="copy-shopping-btn" data-fav-id="${fav.id}">Copy list</button>
          </div>
          <ul class="missing-items-list">
            ${itemsHtml}
          </ul>
        </div>
      `;
    }

    // Build instructions HTML
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

    // Nutrition box (Feature 4) – uses saved nutrition data if present
    const nutritionHtml = buildNutritionHtml(recipe.nutrition);

    card.innerHTML = `
      <div class="card-top-accent"></div>
      <div class="recipe-card-content">
        <div class="recipe-badges-row">
          <span class="pill pill-amber">⏱️ ${escapeHtml(cookingTime)}</span>
          <span class="pill pill-subtle">👥 ${escapeHtml(String(servings))} servings</span>
          <span class="pill pill-subtle">⚡ ${escapeHtml(difficulty)}</span>
          ${dietaryBadges}
        </div>

        <h3 class="recipe-card-title">${escapeHtml(fav.recipe_name || recipe.name || "Delicious Dish")}</h3>
        ${(fav.tagline || recipe.tagline) ? `<div class="recipe-tagline">${escapeHtml(fav.tagline || recipe.tagline)}</div>` : ""}
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
        ${nutritionHtml}

        <div class="recipe-card-actions">
          <button type="button" class="btn btn-secondary btn-sm copy-fav-btn">
            📋 Copy
          </button>
          <button type="button" class="btn btn-secondary btn-sm print-fav-btn">
            🖨️ Print
          </button>
          <button type="button" class="btn btn-danger-outline btn-sm delete-fav-btn" title="Remove from favorites">
            🗑️ Remove
          </button>
        </div>
      </div>
    `;

    // Shopping list checkboxes
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
    card.querySelector(".copy-fav-btn").addEventListener("click", () => {
      const formatted = formatRecipeForClipboard(recipe);
      copyToClipboard(formatted, "Full recipe copied to clipboard!");
    });

    // Print recipe button
    card.querySelector(".print-fav-btn").addEventListener("click", () => {
      window.print();
    });

    // Delete favorite button
    card.querySelector(".delete-fav-btn").addEventListener("click", () => {
      removeFavorite(fav.id, fav.recipe_name);
    });

    return card;
  }

  // -------------------------------------------------------------------------
  // Fridge Photo Scanner (Gemini Vision)
  // -------------------------------------------------------------------------

  function openFridgeScanModal() {
    if (!elements.fridgeScanModal) return;
    elements.fridgeScanModal.classList.remove("hidden");
    document.body.style.overflow = "hidden";
  }

  function closeFridgeScanModal() {
    if (!elements.fridgeScanModal) return;
    elements.fridgeScanModal.classList.add("hidden");
    document.body.style.overflow = "";
    if (elements.photoPreviewImg) {
      elements.photoPreviewImg.src = "";
    }
  }

  async function handleFridgePhotoSelected(file) {
    if (!file) return;

    if (!file.type.startsWith("image/") && !file.name.match(/\.(jpg|jpeg|png|webp|gif|heic|heif)$/i)) {
      showError("Invalid File", "Please select a valid image file (JPEG, PNG, WebP, GIF, or HEIC).");
      return;
    }

    if (file.size > 12 * 1024 * 1024) {
      showError("File Too Large", "Photo is larger than 12MB. Please select a smaller photo.");
      return;
    }

    // Open scanner modal
    openFridgeScanModal();

    // Show preview of the selected image
    const reader = new FileReader();
    reader.onload = (e) => {
      if (elements.photoPreviewImg) {
        elements.photoPreviewImg.src = e.target.result;
      }
    };
    reader.readAsDataURL(file);

    // Set UI to scanning state
    if (elements.photoScanLaser) elements.photoScanLaser.classList.remove("hidden");
    if (elements.scanStatusBox) elements.scanStatusBox.classList.remove("hidden");
    if (elements.scanResultsBox) elements.scanResultsBox.classList.add("hidden");
    if (elements.scanErrorBox) elements.scanErrorBox.classList.add("hidden");

    if (elements.scanStatusTitle) elements.scanStatusTitle.textContent = "Analyzing your photo with Gemini...";
    if (elements.scanStatusDesc) elements.scanStatusDesc.textContent = "Inspecting shelves, produce, condiments and pantry items";

    const formData = new FormData();
    formData.append("photo", file);

    try {
      const response = await fetch("/api/recognize-ingredients", {
        method: "POST",
        body: formData
      });

      const contentType = response.headers.get("content-type") || "";
      let data = null;
      if (contentType.includes("application/json")) {
        data = await response.json();
      } else {
        const text = await response.text();
        console.warn("Non-JSON vision response:", text);
      }

      if (elements.photoScanLaser) elements.photoScanLaser.classList.add("hidden");
      if (elements.scanStatusBox) elements.scanStatusBox.classList.add("hidden");

      if (!response.ok || !data || !data.success) {
        throw new Error((data && (data.message || data.error)) || "Failed to analyze photo.");
      }

      const ingredients = data.ingredients || [];
      if (ingredients.length === 0) {
        if (elements.scanErrorBox) elements.scanErrorBox.classList.remove("hidden");
        if (elements.scanErrorTitle) elements.scanErrorTitle.textContent = "No ingredients detected";
        if (elements.scanErrorMessage) elements.scanErrorMessage.textContent = "We couldn't clearly recognize any food ingredients in this photo. Try taking a brighter, closer picture or add them manually.";
        return;
      }

      // Populate detected ingredients
      state.detectedIngredients = ingredients;
      state.selectedDetected = new Set(ingredients);

      if (elements.detectedCount) {
        elements.detectedCount.textContent = ingredients.length;
      }
      if (elements.selectAllDetectedBtn) {
        elements.selectAllDetectedBtn.textContent = "Deselect All";
      }

      renderDetectedChips();
      if (elements.scanResultsBox) elements.scanResultsBox.classList.remove("hidden");
    } catch (err) {
      console.error("Photo recognition error:", err);
      if (elements.photoScanLaser) elements.photoScanLaser.classList.add("hidden");
      if (elements.scanStatusBox) elements.scanStatusBox.classList.add("hidden");
      if (elements.scanErrorBox) elements.scanErrorBox.classList.remove("hidden");
      if (elements.scanErrorTitle) elements.scanErrorTitle.textContent = "Scan Hiccup";
      if (elements.scanErrorMessage) {
        elements.scanErrorMessage.textContent = err.message || "An error occurred while recognizing ingredients. Please try again.";
      }
    }
  }

  function renderDetectedChips() {
    if (!elements.detectedChipsList) return;
    elements.detectedChipsList.innerHTML = "";

    state.detectedIngredients.forEach((item) => {
      const isSelected = state.selectedDetected.has(item);
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = `detected-chip ${isSelected ? "selected" : ""}`;
      chip.innerHTML = `
        <span class="detected-chip-check">${isSelected ? "✓" : "+"}</span>
        <span>${escapeHtml(item)}</span>
      `;

      chip.addEventListener("click", () => {
        if (state.selectedDetected.has(item)) {
          state.selectedDetected.delete(item);
        } else {
          state.selectedDetected.add(item);
        }
        renderDetectedChips();
        updateAddDetectedBtnLabel();
      });

      elements.detectedChipsList.appendChild(chip);
    });

    updateAddDetectedBtnLabel();
  }

  function updateAddDetectedBtnLabel() {
    if (!elements.addDetectedIngredientsBtn) return;
    const count = state.selectedDetected.size;
    elements.addDetectedIngredientsBtn.innerHTML = `<span>➕ Add ${count} Ingredient${count === 1 ? '' : 's'} to Kitchen</span>`;
    elements.addDetectedIngredientsBtn.disabled = count === 0;
  }

  function addSelectedDetectedToKitchen() {
    if (state.selectedDetected.size === 0) return;

    let addedCount = 0;
    state.selectedDetected.forEach((item) => {
      const exists = state.ingredients.some(
        (existing) => existing.toLowerCase() === item.toLowerCase()
      );
      if (!exists) {
        state.ingredients.push(item);
        addedCount++;
      }
    });

    updateTagUI();
    closeFridgeScanModal();

    if (addedCount > 0) {
      showToast(`📸 Added ${addedCount} ingredient${addedCount === 1 ? '' : 's'} from your fridge photo!`);
    } else {
      showToast(`Selected ingredients were already in your kitchen list.`);
    }
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
