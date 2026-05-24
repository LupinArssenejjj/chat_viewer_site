function resetAuthorPicker() {
  if (elements.authorInput) elements.authorInput.value = "";
  if (elements.selectedAuthor) elements.selectedAuthor.value = "";
  if (elements.authorSuggestions) elements.authorSuggestions.innerHTML = "";
}

function openFilters() {
  if (!elements.filtersPanel) return;

  resetAuthorPicker();

  if (elements.textInput) {
    elements.textInput.value = state.textQuery || "";
  }

  elements.filtersPanel.classList.remove("hidden");
  elements.filtersPanel.setAttribute("aria-hidden", "false");
  loadAuthorSuggestions("");
}

function closeFilters() {
  if (!elements.filtersPanel) return;
  elements.filtersPanel.classList.add("hidden");
  elements.filtersPanel.setAttribute("aria-hidden", "true");
}

async function loadAuthorSuggestions(query = "") {
  if (!elements.authorSuggestions) return;

  const params = buildQuery({ query, limit: 80 });
  const data = await fetchJson(`/api/authors?${params}`);
  const items = data.items || [];
  const pendingSelectedAuthor = elements.selectedAuthor?.value || "";

  if (!items.length) {
    elements.authorSuggestions.innerHTML = `<div class="empty-state">nenhum usuário encontrado.</div>`;
    return;
  }

  elements.authorSuggestions.innerHTML = items
    .map(
      (item) => `
        <button
          type="button"
          class="suggestion-item ${item.name === pendingSelectedAuthor ? "active" : ""}"
          data-author="${escapeHtml(item.name)}"
        >
          ${escapeHtml(item.name)}
          <span class="suggestion-meta">${Number(item.message_count).toLocaleString("pt-BR")} mensagens</span>
        </button>
      `
    )
    .join("");

  for (const button of elements.authorSuggestions.querySelectorAll(".suggestion-item")) {
    button.addEventListener("click", async () => {
      const author = button.getAttribute("data-author") || "";

      if (elements.authorInput) elements.authorInput.value = author;
      if (elements.selectedAuthor) elements.selectedAuthor.value = author;

      await loadAuthorSuggestions(author);
    });
  }
}

function bindEvents() {
  if (elements.openFilters) {
    elements.openFilters.addEventListener("click", async () => {
      openFilters();
    });
  }

  if (elements.closeFilters) {
    elements.closeFilters.addEventListener("click", closeFilters);
  }

  if (elements.authorInput) {
    elements.authorInput.addEventListener("focus", async () => {
      await loadAuthorSuggestions(elements.authorInput.value.trim());
    });

    elements.authorInput.addEventListener("input", async (event) => {
      const value = event.target.value.trim();

      if (elements.selectedAuthor) {
        elements.selectedAuthor.value = "";
      }

      await loadAuthorSuggestions(value);
    });
  }

  if (elements.textInput) {
    elements.textInput.addEventListener("keydown", async (event) => {
      if (event.key !== "Enter") return;

      state.selectedAuthor = elements.selectedAuthor?.value || elements.authorInput?.value.trim() || "";
      state.textQuery = elements.textInput.value.trim();
      state.resultsPage = 1;

      renderActiveFilters();
      await loadResults();

      resetAuthorPicker();
      closeFilters();
    });
  }

  if (elements.applyFilters) {
    elements.applyFilters.addEventListener("click", async () => {
      state.selectedAuthor = elements.selectedAuthor?.value || elements.authorInput?.value.trim() || "";
      state.textQuery = elements.textInput?.value.trim() || "";
      state.resultsPage = 1;

      renderActiveFilters();
      await loadResults();

      resetAuthorPicker();
      closeFilters();
    });
  }

  if (elements.clearFilters) {
    elements.clearFilters.addEventListener("click", async () => {
      clearFiltersState();
      renderActiveFilters();
      renderResults([], 0, 1, 1);
      await loadAuthorSuggestions("");
      closeResultsPanel();
    });
  }

  if (elements.prevPage) {
    elements.prevPage.addEventListener("click", async () => {
      if (state.chatPage <= 1) return;
      state.chatPage -= 1;
      await loadChat();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  if (elements.nextPage) {
    elements.nextPage.addEventListener("click", async () => {
      if (state.chatPage >= state.chatTotalPages) return;
      state.chatPage += 1;
      await loadChat();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  if (elements.resultsPrev) {
    elements.resultsPrev.addEventListener("click", async () => {
      if (state.resultsPage <= 1) return;
      state.resultsPage -= 1;
      await loadResults();
    });
  }

  if (elements.resultsNext) {
    elements.resultsNext.addEventListener("click", async () => {
      if (state.resultsPage >= state.resultsTotalPages) return;
      state.resultsPage += 1;
      await loadResults();
    });
  }

  if (elements.backToList) {
    elements.backToList.addEventListener("click", async () => {
      await loadChat();
      if (hasActiveFilters()) {
        await loadResults();
      }
    });
  }

  if (elements.closeResults) {
    elements.closeResults.addEventListener("click", closeResultsPanel);
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeFilters();
    }
  });
}