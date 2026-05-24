# FILE: static/app.js
/* static/app.js */
const state = {
  chatPage: 1,
  chatPageSize: 80,
  chatTotalPages: 1,

  resultsPage: 1,
  resultsPageSize: 25,
  resultsTotalPages: 1,

  selectedAuthor: "",
  textQuery: "",
  startDate: "",
  endDate: "",
  mode: "list",

  meta: {
    totalText: "0 mensagens",
    authorsText: "0 usuários",
    rangeText: "-",
    minDate: "",
    maxDate: "",
  },
};

const elements = {
  chatTitle: document.getElementById("chat-title"),
  chatSubtitle: document.getElementById("chat-subtitle"),
  summaryTotal: document.getElementById("summary-total"),
  summaryAuthors: document.getElementById("summary-authors"),
  summaryRange: document.getElementById("summary-range"),

  openFilters: document.getElementById("open-filters"),
  closeFilters: document.getElementById("close-filters"),
  filtersPanel: document.getElementById("filters-panel"),

  authorInput: document.getElementById("author-input"),
  selectedAuthor: document.getElementById("selected-author"),
  authorSuggestions: document.getElementById("author-suggestions"),
  textInput: document.getElementById("text-input"),
  startDateInput: document.getElementById("start-date-input"),
  endDateInput: document.getElementById("end-date-input"),

  applyFilters: document.getElementById("apply-filters"),
  clearFilters: document.getElementById("clear-filters"),

  activeFilters: document.getElementById("active-filters"),

  messages: document.getElementById("messages"),
  pageStatus: document.getElementById("page-status"),
  prevPage: document.getElementById("prev-page"),
  nextPage: document.getElementById("next-page"),
  pagination: document.getElementById("pagination"),

  contextBanner: document.getElementById("context-banner"),
  contextText: document.getElementById("context-text"),
  backToList: document.getElementById("back-to-list"),

  resultsPanel: document.getElementById("results-panel"),
  resultsCount: document.getElementById("results-count"),
  resultsList: document.getElementById("results-list"),
  resultsPrev: document.getElementById("results-prev"),
  resultsNext: document.getElementById("results-next"),
  resultsPageStatus: document.getElementById("results-page-status"),
  closeResults: document.getElementById("close-results"),
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function firstLetter(name) {
  return (String(name || "?").trim()[0] || "?").toUpperCase();
}

function formatPeriod(start, end) {
  if (!start || !end) return "-";
  const startText = new Date(start).toLocaleString("pt-BR");
  const endText = new Date(end).toLocaleString("pt-BR");
  return `${startText} até ${endText}`;
}

function formatDateOnly(dateValue) {
  if (!dateValue) return "";
  const [year, month, day] = String(dateValue).split("-");
  if (!year || !month || !day) return dateValue;
  return `${day}/${month}/${year}`;
}

function normalizeReplyValue(value) {
  return String(value || "").trim().toLowerCase();
}

function hasVisibleReply(item) {
  const replyName = normalizeReplyValue(item.reply_to_name);
  const replyText = normalizeReplyValue(item.reply_to_text);

  const invalidNames = new Set(["", "unknown"]);
  const invalidTexts = new Set(["", "sem trecho de resposta", "[sem trecho]"]);

  return !invalidNames.has(replyName) && !invalidTexts.has(replyText);
}

function hasActiveFilters() {
  return Boolean(state.selectedAuthor || state.textQuery || state.startDate || state.endDate);
}

function truncate(value, maxLength = 120) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}...`;
}

function buildQuery(params) {
  const search = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  });

  return search.toString();
}

async function fetchJson(url) {
  const response = await fetch(url);

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`HTTP ${response.status} - ${body}`);
  }

  return response.json();
}

function scrollPageTop() {
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function scrollResultsTop() {
  if (elements.resultsList) {
    elements.resultsList.scrollTo({ top: 0, behavior: "smooth" });
  }
  scrollPageTop();
}

function restoreMetaSummary() {
  if (elements.summaryTotal) {
    elements.summaryTotal.textContent = state.meta.totalText;
  }

  if (elements.summaryAuthors) {
    elements.summaryAuthors.textContent = state.meta.authorsText;
  }

  if (elements.summaryRange) {
    elements.summaryRange.textContent = state.meta.rangeText;
  }
}

function resetAuthorPicker() {
  if (elements.authorInput) elements.authorInput.value = "";
  if (elements.selectedAuthor) elements.selectedAuthor.value = "";
  if (elements.authorSuggestions) elements.authorSuggestions.innerHTML = "";
}

function resetDateInputs() {
  if (elements.startDateInput) elements.startDateInput.value = "";
  if (elements.endDateInput) elements.endDateInput.value = "";
}

function syncDateInputLimits() {
  if (elements.startDateInput) {
    elements.startDateInput.min = state.meta.minDate || "";
    elements.startDateInput.max = state.meta.maxDate || "";
  }

  if (elements.endDateInput) {
    elements.endDateInput.min = state.meta.minDate || "";
    elements.endDateInput.max = state.meta.maxDate || "";
  }
}

function openFilters() {
  if (!elements.filtersPanel) return;

  resetAuthorPicker();
  resetDateInputs();

  if (elements.textInput) {
    elements.textInput.value = "";
  }

  syncDateInputLimits();

  elements.filtersPanel.classList.remove("hidden");
  elements.filtersPanel.setAttribute("aria-hidden", "false");
  loadAuthorSuggestions("");
}

function closeFiltersUi() {
  if (!elements.filtersPanel) return;
  elements.filtersPanel.classList.add("hidden");
  elements.filtersPanel.setAttribute("aria-hidden", "true");
}

function openResults() {
  if (!elements.resultsPanel) return;
  elements.resultsPanel.classList.remove("hidden");
}

function closeResultsPanelUi() {
  if (!elements.resultsPanel) return;
  elements.resultsPanel.classList.add("hidden");
}

function renderActiveFilters() {
  if (!elements.activeFilters) return;

  const chips = [];

  if (state.selectedAuthor) {
    chips.push(`<span class="filter-chip">usuário: ${escapeHtml(state.selectedAuthor)}</span>`);
  }

  if (state.textQuery) {
    chips.push(`<span class="filter-chip">mensagem: ${escapeHtml(state.textQuery)}</span>`);
  }

  if (state.startDate || state.endDate) {
    const startLabel = state.startDate ? formatDateOnly(state.startDate) : state.meta.minDate ? formatDateOnly(state.meta.minDate) : "-";
    const endLabel = state.endDate ? formatDateOnly(state.endDate) : state.meta.maxDate ? formatDateOnly(state.meta.maxDate) : "-";
    chips.push(`<span class="filter-chip">data: ${escapeHtml(startLabel)} até ${escapeHtml(endLabel)}</span>`);
  }

  elements.activeFilters.innerHTML = chips.join("");
}

function extractMediaUrls(content) {
  const urls = String(content || "").match(/https?:\/\/[^\s]+/g) || [];

  return urls.filter((url) => {
    const lower = url.toLowerCase();
    if (!lower.includes("ams3-cdn.kyodo.app/chat/icon/")) return false;

    return (
      lower.includes(".jpeg") ||
      lower.includes(".jpg") ||
      lower.includes(".png") ||
      lower.includes(".webp") ||
      lower.includes(".gif") ||
      lower.includes(".mp4") ||
      lower.includes(".webm")
    );
  });
}

function renderMediaPreview(content) {
  const mediaUrls = extractMediaUrls(content);

  if (!mediaUrls.length) return "";

  return mediaUrls
    .map((url) => {
      const safeUrl = escapeHtml(url);
      const lower = url.toLowerCase();

      if (lower.includes(".mp4") || lower.includes(".webm")) {
        return `
          <div class="media-preview">
            <video controls preload="metadata" style="max-width: 100%; border-radius: 10px; margin-top: 8px;">
              <source src="${safeUrl}" />
            </video>
          </div>
        `;
      }

      return `
        <div class="media-preview">
          <img
            src="${safeUrl}"
            alt="mídia da mensagem"
            loading="lazy"
            style="max-width: 100%; border-radius: 10px; margin-top: 8px; display: block;"
          />
        </div>
      `;
    })
    .join("");
}

function renderMessages(items, focusSortIndex = null) {
  if (!elements.messages) return;

  if (!items.length) {
    elements.messages.innerHTML = `<div class="empty-state">nenhuma mensagem encontrada.</div>`;
    return;
  }

  elements.messages.innerHTML = items
    .map((item) => {
      const showReply = hasVisibleReply(item);
      const canJump = showReply && Number.isInteger(item.reply_to_sort_index);
      const mediaPreview = renderMediaPreview(item.content || "");

      const replyBlock = showReply
        ? `
          <button
            type="button"
            class="reply-preview"
            ${canJump ? `data-jump="${item.reply_to_sort_index}"` : "disabled"}
            title="${canJump ? "ir para a mensagem original" : "mensagem original não encontrada"}"
          >
            <span class="reply-label">Respondendo à:</span>
            <span class="reply-author">${escapeHtml(item.reply_to_name)}</span>
            <span class="reply-text">${escapeHtml(item.reply_to_text)}</span>
          </button>
        `
        : "";

      const targetClass = focusSortIndex === item.sort_index ? "is-target" : "";

      return `
        <article class="message-row ${targetClass}" id="msg-${item.sort_index}" data-sort-index="${item.sort_index}">
          <div class="avatar">${escapeHtml(firstLetter(item.author_name))}</div>
          <div class="message-main">
            <div class="message-head">
              <button type="button" class="author-name-button" data-author-filter="${escapeHtml(item.author_name)}">
                ${escapeHtml(item.author_name)}
              </button>
              <span class="timestamp">${escapeHtml(item.timestamp_display)}</span>
            </div>
            ${replyBlock}
            <div class="message-content">${escapeHtml(item.content || "[sem conteúdo]")}</div>
            ${mediaPreview}
          </div>
        </article>
      `;
    })
    .join("");

  bindMessageActions();

  if (focusSortIndex) {
    const target = document.getElementById(`msg-${focusSortIndex}`);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }
}

function renderResults(items, total, page, totalPages) {
  if (
    !elements.resultsList ||
    !elements.resultsCount ||
    !elements.resultsPageStatus ||
    !elements.resultsPrev ||
    !elements.resultsNext
  ) {
    return;
  }

  if (!hasActiveFilters()) {
    elements.resultsCount.textContent = "0 mensagens";
    elements.resultsPageStatus.textContent = "página 1 de 1";
    elements.resultsPrev.disabled = true;
    elements.resultsNext.disabled = true;
    elements.resultsList.innerHTML = `
      <div class="empty-state">
        escolha um usuário, texto ou intervalo de data para ver os resultados aqui.
      </div>
    `;
    closeResultsPanelUi();
    return;
  }

  elements.resultsCount.textContent = `${Number(total || 0).toLocaleString("pt-BR")} mensagens`;
  elements.resultsPageStatus.textContent = `página ${page} de ${totalPages}`;
  elements.resultsPrev.disabled = page <= 1;
  elements.resultsNext.disabled = page >= totalPages;

  if (!items.length) {
    elements.resultsList.innerHTML = `
      <div class="empty-state">
        nenhuma mensagem encontrada.
      </div>
    `;
    openResults();
    return;
  }

  elements.resultsList.innerHTML = items
    .map(
      (item) => `
        <button type="button" class="result-item" data-result-jump="${item.sort_index}">
          <div class="result-item-head">
            <span class="result-item-author">${escapeHtml(item.author_name)}</span>
            <span class="result-item-time">${escapeHtml(item.timestamp_display)}</span>
          </div>
          <div class="result-item-text">${escapeHtml(truncate(item.content || "[sem conteúdo]"))}</div>
        </button>
      `
    )
    .join("");

  for (const button of elements.resultsList.querySelectorAll("[data-result-jump]")) {
    button.addEventListener("click", async () => {
      const sortIndex = Number(button.getAttribute("data-result-jump"));
      if (!Number.isInteger(sortIndex) || sortIndex <= 0) return;
      await loadContext(sortIndex);
    });
  }

  openResults();
}

function bindMessageActions() {
  for (const button of document.querySelectorAll("[data-jump]")) {
    button.addEventListener("click", async () => {
      const sortIndex = Number(button.getAttribute("data-jump"));
      if (!Number.isInteger(sortIndex) || sortIndex <= 0) return;
      await loadContext(sortIndex);
    });
  }

  for (const button of document.querySelectorAll("[data-author-filter]")) {
    button.addEventListener("click", async () => {
      const author = button.getAttribute("data-author-filter") || "";
      state.selectedAuthor = author;
      state.resultsPage = 1;
      state.textQuery = "";
      state.startDate = "";
      state.endDate = "";
      renderActiveFilters();
      await loadResults();
      scrollResultsTop();
    });
  }
}

function updateChatPagination(page, totalPages) {
  state.chatPage = page;
  state.chatTotalPages = totalPages;

  if (elements.pageStatus) {
    elements.pageStatus.textContent = `página ${page} de ${totalPages}`;
  }

  if (elements.prevPage) {
    elements.prevPage.disabled = page <= 1;
  }

  if (elements.nextPage) {
    elements.nextPage.disabled = page >= totalPages;
  }
}

function setListMode() {
  state.mode = "list";
  if (elements.contextBanner) elements.contextBanner.classList.add("hidden");
  if (elements.pagination) elements.pagination.classList.remove("hidden");
}

function setContextMode(targetSortIndex) {
  state.mode = "context";
  if (elements.contextBanner) elements.contextBanner.classList.remove("hidden");
  if (elements.pagination) elements.pagination.classList.add("hidden");
  if (elements.contextText) {
    elements.contextText.textContent = `mostrando o contexto da mensagem #${targetSortIndex}`;
  }
}

async function loadMeta() {
  const data = await fetchJson("/api/meta");

  if (elements.chatTitle) {
    elements.chatTitle.textContent = data.chat_name || "chat";
  }

  if (elements.chatSubtitle) {
    elements.chatSubtitle.textContent = data.circle_name
      ? `${data.circle_name} • exportado em ${data.exported_at || "-"}`
      : `exportado em ${data.exported_at || "-"}`;
  }

  state.meta.totalText = `${Number(data.total_messages || 0).toLocaleString("pt-BR")} mensagens`;
  state.meta.authorsText = `${Number(data.total_authors || 0).toLocaleString("pt-BR")} usuários`;
  state.meta.rangeText = formatPeriod(data.first_message_at, data.last_message_at);
  state.meta.minDate = String(data.first_message_at || "").slice(0, 10);
  state.meta.maxDate = String(data.last_message_at || "").slice(0, 10);

  syncDateInputLimits();
  restoreMetaSummary();
}

async function loadChat() {
  setListMode();

  const query = buildQuery({
    page: state.chatPage,
    page_size: state.chatPageSize,
  });

  const data = await fetchJson(`/api/messages?${query}`);
  renderMessages(data.items || []);
  updateChatPagination(data.page || 1, data.total_pages || 1);
  restoreMetaSummary();
}

async function loadResults() {
  if (!hasActiveFilters()) {
    renderResults([], 0, 1, 1);
    restoreMetaSummary();
    return;
  }

  const query = buildQuery({
    page: state.resultsPage,
    page_size: state.resultsPageSize,
    author: state.selectedAuthor,
    text: state.textQuery,
    start_date: state.startDate,
    end_date: state.endDate,
  });

  const data = await fetchJson(`/api/messages?${query}`);
  state.resultsTotalPages = data.total_pages || 1;

  renderResults(
    data.items || [],
    data.total || 0,
    data.page || 1,
    data.total_pages || 1
  );
}

async function loadContext(sortIndex) {
  const query = buildQuery({
    sort_index: sortIndex,
    window: 20,
  });

  const data = await fetchJson(`/api/context?${query}`);

  setContextMode(data.target_sort_index);
  renderMessages(data.items || [], data.target_sort_index);

  const target = data.target || {};
  if (elements.summaryTotal && target.author_name) {
    elements.summaryTotal.textContent = `contexto • ${target.author_name}`;
  }
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

function clearFiltersState() {
  state.selectedAuthor = "";
  state.textQuery = "";
  state.startDate = "";
  state.endDate = "";
  state.resultsPage = 1;

  if (elements.authorInput) elements.authorInput.value = "";
  if (elements.selectedAuthor) elements.selectedAuthor.value = "";
  if (elements.textInput) elements.textInput.value = "";
  if (elements.startDateInput) elements.startDateInput.value = "";
  if (elements.endDateInput) elements.endDateInput.value = "";
}

async function clearFilterSession() {
  clearFiltersState();
  renderActiveFilters();
  renderResults([], 0, 1, 1);
  closeResultsPanelUi();
  closeFiltersUi();
  state.chatPage = 1;
  await loadChat();
  scrollPageTop();
}

function normalizePendingDateRange() {
  let startDate = elements.startDateInput?.value || "";
  let endDate = elements.endDateInput?.value || "";

  if (startDate && endDate && startDate > endDate) {
    [startDate, endDate] = [endDate, startDate];
  }

  if (elements.startDateInput) elements.startDateInput.value = startDate;
  if (elements.endDateInput) elements.endDateInput.value = endDate;

  return { startDate, endDate };
}

function bindEvents() {
  if (elements.openFilters) {
    elements.openFilters.addEventListener("click", () => {
      openFilters();
    });
  }

  if (elements.closeFilters) {
    elements.closeFilters.addEventListener("click", async () => {
      await clearFilterSession();
    });
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

      const pendingRange = normalizePendingDateRange();

      state.selectedAuthor = elements.selectedAuthor?.value || elements.authorInput?.value.trim() || "";
      state.textQuery = elements.textInput.value.trim();
      state.startDate = pendingRange.startDate;
      state.endDate = pendingRange.endDate;
      state.resultsPage = 1;

      renderActiveFilters();
      await loadResults();

      resetAuthorPicker();
      resetDateInputs();
      closeFiltersUi();
      scrollResultsTop();
    });
  }

  if (elements.applyFilters) {
    elements.applyFilters.addEventListener("click", async () => {
      const pendingRange = normalizePendingDateRange();

      state.selectedAuthor = elements.selectedAuthor?.value || elements.authorInput?.value.trim() || "";
      state.textQuery = elements.textInput?.value.trim() || "";
      state.startDate = pendingRange.startDate;
      state.endDate = pendingRange.endDate;
      state.resultsPage = 1;

      renderActiveFilters();
      await loadResults();

      resetAuthorPicker();
      resetDateInputs();
      closeFiltersUi();
      scrollResultsTop();
    });
  }

  if (elements.clearFilters) {
    elements.clearFilters.addEventListener("click", async () => {
      await clearFilterSession();
    });
  }

  if (elements.prevPage) {
    elements.prevPage.addEventListener("click", async () => {
      if (state.chatPage <= 1) return;
      state.chatPage -= 1;
      await loadChat();
      scrollPageTop();
    });
  }

  if (elements.nextPage) {
    elements.nextPage.addEventListener("click", async () => {
      if (state.chatPage >= state.chatTotalPages) return;
      state.chatPage += 1;
      await loadChat();
      scrollPageTop();
    });
  }

  if (elements.resultsPrev) {
    elements.resultsPrev.addEventListener("click", async () => {
      if (state.resultsPage <= 1) return;
      state.resultsPage -= 1;
      await loadResults();
      scrollResultsTop();
    });
  }

  if (elements.resultsNext) {
    elements.resultsNext.addEventListener("click", async () => {
      if (state.resultsPage >= state.resultsTotalPages) return;
      state.resultsPage += 1;
      await loadResults();
      scrollResultsTop();
    });
  }

  if (elements.backToList) {
    elements.backToList.addEventListener("click", async () => {
      state.chatPage = 1;
      await loadChat();
      scrollPageTop();
    });
  }

  if (elements.closeResults) {
    elements.closeResults.addEventListener("click", async () => {
      await clearFilterSession();
    });
  }

  document.addEventListener("keydown", async (event) => {
    if (event.key === "Escape" && elements.filtersPanel && !elements.filtersPanel.classList.contains("hidden")) {
      await clearFilterSession();
    }
  });
}

async function bootstrap() {
  bindEvents();
  await loadMeta();
  await loadChat();
  await loadResults();
  renderActiveFilters();
}

bootstrap().catch((error) => {
  console.error(error);

  if (elements.messages) {
    elements.messages.innerHTML = `
      <div class="empty-state">
        erro ao carregar a interface.<br />
        <small>${escapeHtml(error.message || "erro desconhecido")}</small>
      </div>
    `;
  }
});