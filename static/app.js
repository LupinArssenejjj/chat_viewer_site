const state = {
  page: 1,
  pageSize: 80,
  totalPages: 1,
  selectedAuthor: "",
  textQuery: "",
  contextSortIndex: null,
  resultsPage: 1,
  resultsPageSize: 50,
  resultsTotalPages: 1,
  activeResultSortIndex: null,
};

const elements = {
  chatTitle: document.getElementById("chat-title"),
  chatSubtitle: document.getElementById("chat-subtitle"),
  summaryTotal: document.getElementById("summary-total"),
  summaryAuthors: document.getElementById("summary-authors"),
  summaryRange: document.getElementById("summary-range"),
  activeFilters: document.getElementById("active-filters"),
  messages: document.getElementById("messages"),
  pagination: document.getElementById("pagination"),
  pageStatus: document.getElementById("page-status"),
  prevPage: document.getElementById("prev-page"),
  nextPage: document.getElementById("next-page"),
  openFilters: document.getElementById("open-filters"),
  closeFilters: document.getElementById("close-filters"),
  filtersPanel: document.getElementById("filters-panel"),
  authorInput: document.getElementById("author-input"),
  selectedAuthor: document.getElementById("selected-author"),
  authorSuggestions: document.getElementById("author-suggestions"),
  textInput: document.getElementById("text-input"),
  applyFilters: document.getElementById("apply-filters"),
  clearFilters: document.getElementById("clear-filters"),
  contextBanner: document.getElementById("context-banner"),
  contextText: document.getElementById("context-text"),
  backToList: document.getElementById("back-to-list"),
  resultsPanel: document.getElementById("results-panel"),
  resultsList: document.getElementById("results-list"),
  resultsSubtitle: document.getElementById("results-subtitle"),
  resultsPagination: document.getElementById("results-pagination"),
  resultsPrev: document.getElementById("results-prev"),
  resultsNext: document.getElementById("results-next"),
  resultsPageStatus: document.getElementById("results-page-status"),
  closeResults: document.getElementById("close-results"),
  layout: document.querySelector(".layout"),
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

function truncate(value, length = 160) {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  if (!clean) return "[sem conteúdo]";
  return clean.length > length ? `${clean.slice(0, length - 1)}…` : clean;
}

function extractUrls(text) {
  return String(text || "").match(/https?:\/\/[^\s<>"')]+/g) || [];
}

function isImageUrl(url) {
  return /ams3-cdn\.kyodo\.app/i.test(url) && /\.(jpeg|jpg|png|gif|webp)(\?.*)?$/i.test(url);
}

function isVideoUrl(url) {
  return /ams3-cdn\.kyodo\.app/i.test(url) && /\.(mp4|webm|mov)(\?.*)?$/i.test(url);
}

function renderContentText(text) {
  const urls = extractUrls(text);
  let html = escapeHtml(text || "[sem conteúdo]");

  for (const url of urls) {
    const safeUrl = escapeHtml(url);
    html = html.replaceAll(
      safeUrl,
      `<a class="media-link" href="${safeUrl}" target="_blank" rel="noreferrer">${safeUrl}</a>`
    );
  }

  return html;
}

function renderMediaEmbeds(text) {
  const urls = extractUrls(text);
  const media = [];

  for (const url of urls) {
    const safeUrl = escapeHtml(url);

    if (isImageUrl(url)) {
      media.push(`
        <a class="media-card" href="${safeUrl}" target="_blank" rel="noreferrer">
          <img src="${safeUrl}" alt="imagem enviada no chat" loading="lazy" />
        </a>
      `);
      continue;
    }

    if (isVideoUrl(url)) {
      media.push(`
        <div class="media-card">
          <video controls preload="metadata">
            <source src="${safeUrl}" />
          </video>
        </div>
      `);
    }
  }

  return media.length ? `<div class="message-media">${media.join("")}</div>` : "";
}

function renderActiveFilters() {
  const chips = [];

  if (state.selectedAuthor) {
    chips.push(`<span class="filter-chip">usuário: ${escapeHtml(state.selectedAuthor)}</span>`);
  }

  if (state.textQuery) {
    chips.push(`<span class="filter-chip">mensagem: ${escapeHtml(state.textQuery)}</span>`);
  }

  elements.activeFilters.innerHTML = chips.join("");
}

function renderMessages(items, focusSortIndex = null) {
  if (!items.length) {
    elements.messages.innerHTML = `<div class="empty-state">nenhuma mensagem encontrada.</div>`;
    return;
  }

  elements.messages.innerHTML = items
    .map((item) => {
      const replyBlock = hasVisibleReply(item)
        ? `
          <div class="reply-preview">
            <span class="reply-label">Respondendo à:</span>
            <span class="reply-author">${escapeHtml(item.reply_to_name)}</span>
            <span class="reply-text">${escapeHtml(item.reply_to_text)}</span>
          </div>
        `
        : "";

      const mediaBlock = renderMediaEmbeds(item.content);
      const targetClass = focusSortIndex === item.sort_index ? "is-target" : "";

      return `
        <article class="message-row ${targetClass}" id="msg-${item.sort_index}" data-sort-index="${item.sort_index}">
          <div class="avatar">${escapeHtml(firstLetter(item.author_name))}</div>
          <div class="message-main">
            <div class="message-head">
              <span class="author-name">${escapeHtml(item.author_name)}</span>
              <span class="timestamp">${escapeHtml(item.timestamp_display)}</span>
            </div>
            ${replyBlock}
            <div class="message-content">${renderContentText(item.content)}</div>
            ${mediaBlock}
          </div>
        </article>
      `;
    })
    .join("");

  if (focusSortIndex) {
    const target = document.getElementById(`msg-${focusSortIndex}`);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }
}

function renderSearchResults(items) {
  if (!items.length) {
    elements.resultsList.innerHTML = `<div class="empty-state">nenhuma mensagem encontrada.</div>`;
    return;
  }

  elements.resultsList.innerHTML = items
    .map((item) => {
      const activeClass = state.activeResultSortIndex === item.sort_index ? "active" : "";
      const reply = hasVisibleReply(item)
        ? `<span class="result-reply">Respondendo à ${escapeHtml(item.reply_to_name)}</span>`
        : "";

      return `
        <button type="button" class="result-item ${activeClass}" data-result-sort-index="${item.sort_index}">
          <div class="result-meta">
            <span class="result-author">${escapeHtml(item.author_name)}</span>
            <span class="result-time">${escapeHtml(item.timestamp_display)}</span>
          </div>
          <div class="result-snippet">${escapeHtml(truncate(item.content))}</div>
          ${reply}
        </button>
      `;
    })
    .join("");

  for (const button of elements.resultsList.querySelectorAll("[data-result-sort-index]")) {
    button.addEventListener("click", async () => {
      const sortIndex = Number(button.getAttribute("data-result-sort-index"));
      if (!Number.isInteger(sortIndex) || sortIndex <= 0) return;
      state.activeResultSortIndex = sortIndex;
      await loadContext(sortIndex);
      highlightActiveResult();
    });
  }
}

function highlightActiveResult() {
  for (const item of elements.resultsList.querySelectorAll(".result-item")) {
    const sortIndex = Number(item.getAttribute("data-result-sort-index"));
    item.classList.toggle("active", sortIndex === state.activeResultSortIndex);
  }
}

function updatePagination(page, totalPages) {
  state.page = page;
  state.totalPages = totalPages;
  elements.pageStatus.textContent = `página ${page} de ${totalPages}`;
  elements.prevPage.disabled = page <= 1;
  elements.nextPage.disabled = page >= totalPages;
}

function updateResultsPagination(page, totalPages) {
  state.resultsPage = page;
  state.resultsTotalPages = totalPages;
  elements.resultsPageStatus.textContent = `página ${page} de ${totalPages}`;
  elements.resultsPrev.disabled = page <= 1;
  elements.resultsNext.disabled = page >= totalPages;
  elements.resultsPagination.classList.toggle("hidden", totalPages <= 1);
}

function showResultsPanel() {
  elements.resultsPanel.classList.remove("hidden");
  elements.layout.classList.add("has-results");
}

function hideResultsPanel() {
  elements.resultsPanel.classList.add("hidden");
  elements.layout.classList.remove("has-results");
}

function showListMode() {
  state.contextSortIndex = null;
  elements.contextBanner.classList.add("hidden");
  elements.pagination.classList.remove("hidden");
}

function showContextMode(sortIndex) {
  state.contextSortIndex = sortIndex;
  elements.contextBanner.classList.remove("hidden");
  elements.pagination.classList.add("hidden");
  elements.contextText.textContent = `mostrando a região da mensagem #${sortIndex}`;
}

function openFilters() {
  elements.filtersPanel.classList.remove("hidden");
  elements.filtersPanel.setAttribute("aria-hidden", "false");
  loadAuthorSuggestions(elements.authorInput.value.trim());
}

function closeFilters() {
  elements.filtersPanel.classList.add("hidden");
  elements.filtersPanel.setAttribute("aria-hidden", "true");
}

async function loadMeta() {
  const response = await fetch("/api/meta");
  const data = await response.json();

  elements.chatTitle.textContent = data.chat_name || "chat";
  elements.chatSubtitle.textContent = data.circle_name
    ? `${data.circle_name} • exportado em ${data.exported_at || "-"}`
    : `exportado em ${data.exported_at || "-"}`;

  elements.summaryTotal.textContent = `${Number(data.total_messages || 0).toLocaleString("pt-BR")} mensagens`;
  elements.summaryAuthors.textContent = `${Number(data.total_authors || 0).toLocaleString("pt-BR")} usuários`;
  elements.summaryRange.textContent = formatPeriod(data.first_message_at, data.last_message_at);
}

async function loadMessages() {
  showListMode();

  const params = new URLSearchParams({
    page: String(state.page),
    page_size: String(state.pageSize),
  });

  const response = await fetch(`/api/messages?${params.toString()}`);
  const data = await response.json();

  renderMessages(data.items || []);
  updatePagination(data.page, data.total_pages);
}

async function loadContext(sortIndex) {
  const params = new URLSearchParams({
    sort_index: String(sortIndex),
    window: "20",
  });

  const response = await fetch(`/api/context?${params.toString()}`);
  const data = await response.json();

  showContextMode(data.target_sort_index);
  renderMessages(data.items || [], data.target_sort_index);
}

async function loadSearchResults() {
  const hasFilters = Boolean(state.selectedAuthor || state.textQuery);

  renderActiveFilters();

  if (!hasFilters) {
    hideResultsPanel();
    state.activeResultSortIndex = null;
    return;
  }

  const params = new URLSearchParams({
    page: String(state.resultsPage),
    page_size: String(state.resultsPageSize),
  });

  if (state.selectedAuthor) {
    params.set("author", state.selectedAuthor);
  }

  if (state.textQuery) {
    params.set("text", state.textQuery);
  }

  const response = await fetch(`/api/search?${params.toString()}`);
  const data = await response.json();

  showResultsPanel();
  elements.resultsSubtitle.textContent = `${Number(data.total || 0).toLocaleString("pt-BR")} mensagens`;
  renderSearchResults(data.items || []);
  updateResultsPagination(data.page, data.total_pages);
}

async function loadAuthorSuggestions(query = "") {
  const params = new URLSearchParams({ query, limit: "80" });
  const response = await fetch(`/api/authors?${params.toString()}`);
  const data = await response.json();
  const items = data.items || [];

  if (!items.length) {
    elements.authorSuggestions.innerHTML = `<div class="empty-state">nenhum usuário encontrado.</div>`;
    return;
  }

  elements.authorSuggestions.innerHTML = items
    .map(
      (item) => `
        <button
          type="button"
          class="suggestion-item ${item.name === state.selectedAuthor ? "active" : ""}"
          data-author="${escapeHtml(item.name)}"
        >
          ${escapeHtml(item.name)}
          <span class="suggestion-meta">${Number(item.message_count).toLocaleString("pt-BR")} mensagens</span>
        </button>
      `
    )
    .join("");

  for (const button of elements.authorSuggestions.querySelectorAll(".suggestion-item")) {
    button.addEventListener("click", () => {
      const author = button.getAttribute("data-author") || "";
      elements.authorInput.value = author;
      elements.selectedAuthor.value = author;
      state.selectedAuthor = author;
      loadAuthorSuggestions(author);
    });
  }
}

function bindEvents() {
  elements.openFilters.addEventListener("click", openFilters);
  elements.closeFilters.addEventListener("click", closeFilters);

  elements.authorInput.addEventListener("focus", () => {
    loadAuthorSuggestions(elements.authorInput.value.trim());
  });

  elements.authorInput.addEventListener("input", (event) => {
    const value = event.target.value.trim();
    elements.selectedAuthor.value = "";
    state.selectedAuthor = "";
    loadAuthorSuggestions(value);
  });

  elements.applyFilters.addEventListener("click", async () => {
    state.selectedAuthor = elements.selectedAuthor.value || elements.authorInput.value.trim();
    state.textQuery = elements.textInput.value.trim();
    state.resultsPage = 1;
    closeFilters();
    await loadSearchResults();
  });

  elements.clearFilters.addEventListener("click", async () => {
    state.selectedAuthor = "";
    state.textQuery = "";
    state.resultsPage = 1;
    state.activeResultSortIndex = null;
    elements.authorInput.value = "";
    elements.selectedAuthor.value = "";
    elements.textInput.value = "";
    await loadAuthorSuggestions("");
    await loadSearchResults();
  });

  elements.prevPage.addEventListener("click", async () => {
    if (state.page <= 1) return;
    state.page -= 1;
    await loadMessages();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  elements.nextPage.addEventListener("click", async () => {
    if (state.page >= state.totalPages) return;
    state.page += 1;
    await loadMessages();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  elements.resultsPrev.addEventListener("click", async () => {
    if (state.resultsPage <= 1) return;
    state.resultsPage -= 1;
    await loadSearchResults();
  });

  elements.resultsNext.addEventListener("click", async () => {
    if (state.resultsPage >= state.resultsTotalPages) return;
    state.resultsPage += 1;
    await loadSearchResults();
  });

  elements.backToList.addEventListener("click", async () => {
    state.activeResultSortIndex = null;
    await loadMessages();
    highlightActiveResult();
  });

  elements.closeResults.addEventListener("click", () => {
    state.selectedAuthor = "";
    state.textQuery = "";
    state.resultsPage = 1;
    state.activeResultSortIndex = null;
    elements.authorInput.value = "";
    elements.selectedAuthor.value = "";
    elements.textInput.value = "";
    renderActiveFilters();
    hideResultsPanel();
    highlightActiveResult();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeFilters();
    }
  });
}

async function bootstrap() {
  bindEvents();
  await loadMeta();
  await loadMessages();
  await loadSearchResults();
}

bootstrap().catch((error) => {
  console.error(error);
  elements.messages.innerHTML = `<div class="empty-state">erro ao carregar a interface.</div>`;
});
