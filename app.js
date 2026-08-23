const STORAGE_KEY = "manga-tracker.records.v1";
const SETTINGS_KEY = "manga-tracker.settings.v1";
const PENDING_READ_KEY = "manga-tracker.pending-read.v1";
const PENDING_READ_TTL = 24 * 60 * 60 * 1000;
const BACKUP_VERSION = 1;

const state = {
  records: loadRecords(),
  pendingDeleteId: null,
  toastTimer: null,
};

const elements = {
  totalCount: document.querySelector("#totalCount"),
  recentSummary: document.querySelector("#recentSummary"),
  searchInput: document.querySelector("#searchInput"),
  tagFilter: document.querySelector("#tagFilter"),
  sortSelect: document.querySelector("#sortSelect"),
  mangaList: document.querySelector("#mangaList"),
  emptyState: document.querySelector("#emptyState"),
  emptyTitle: document.querySelector("#emptyTitle"),
  emptyDescription: document.querySelector("#emptyDescription"),
  mangaDialog: document.querySelector("#mangaDialog"),
  mangaForm: document.querySelector("#mangaForm"),
  mangaId: document.querySelector("#mangaId"),
  formEyebrow: document.querySelector("#formEyebrow"),
  formTitle: document.querySelector("#formTitle"),
  titleInput: document.querySelector("#titleInput"),
  urlInput: document.querySelector("#urlInput"),
  progressInput: document.querySelector("#progressInput"),
  tagsInput: document.querySelector("#tagsInput"),
  notesInput: document.querySelector("#notesInput"),
  formError: document.querySelector("#formError"),
  progressDialog: document.querySelector("#progressDialog"),
  progressForm: document.querySelector("#progressForm"),
  progressMangaId: document.querySelector("#progressMangaId"),
  progressMangaTitle: document.querySelector("#progressMangaTitle"),
  quickProgressInput: document.querySelector("#quickProgressInput"),
  linkUpdateDialog: document.querySelector("#linkUpdateDialog"),
  linkUpdateForm: document.querySelector("#linkUpdateForm"),
  linkUpdateMangaId: document.querySelector("#linkUpdateMangaId"),
  linkUpdateMangaTitle: document.querySelector("#linkUpdateMangaTitle"),
  linkUpdateInput: document.querySelector("#linkUpdateInput"),
  linkUpdateError: document.querySelector("#linkUpdateError"),
  pasteLinkButton: document.querySelector("#pasteLinkButton"),
  settingsDialog: document.querySelector("#settingsDialog"),
  confirmDialog: document.querySelector("#confirmDialog"),
  confirmTitle: document.querySelector("#confirmTitle"),
  installDialog: document.querySelector("#installDialog"),
  importInput: document.querySelector("#importInput"),
  toast: document.querySelector("#toast"),
  mangaCardTemplate: document.querySelector("#mangaCardTemplate"),
};

init();

function init() {
  bindEvents();
  restoreSettings();
  render();
  registerServiceWorker();
  setTimeout(maybeOpenLinkUpdateDialog, 120);
}

function bindEvents() {
  document.querySelector("#openAddButton").addEventListener("click", openAddDialog);
  document.querySelector("#emptyAddButton").addEventListener("click", openAddDialog);
  document.querySelector("#floatingAddButton").addEventListener("click", openAddDialog);
  document.querySelector("#openSettingsButton").addEventListener("click", () => elements.settingsDialog.showModal());
  document.querySelector("#exportButton").addEventListener("click", exportBackup);
  document.querySelector("#importButton").addEventListener("click", () => elements.importInput.click());
  document.querySelector("#installHelpButton").addEventListener("click", () => {
    elements.settingsDialog.close();
    elements.installDialog.showModal();
  });
  document.querySelector("#cancelDeleteButton").addEventListener("click", closeDeleteDialog);
  document.querySelector("#confirmDeleteButton").addEventListener("click", confirmDelete);

  elements.searchInput.addEventListener("input", render);
  elements.tagFilter.addEventListener("change", render);
  elements.sortSelect.addEventListener("change", () => {
    saveSettings();
    render();
  });
  elements.mangaForm.addEventListener("submit", saveMangaFromForm);
  elements.progressForm.addEventListener("submit", saveQuickProgress);
  elements.linkUpdateForm.addEventListener("submit", saveLinkUpdate);
  elements.pasteLinkButton.addEventListener("click", pasteLinkFromClipboard);
  elements.linkUpdateInput.addEventListener("input", () => {
    elements.linkUpdateError.hidden = true;
  });
  elements.linkUpdateDialog.addEventListener("close", clearPendingRead);
  elements.importInput.addEventListener("change", importBackup);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") setTimeout(maybeOpenLinkUpdateDialog, 120);
  });
  window.addEventListener("pageshow", () => setTimeout(maybeOpenLinkUpdateDialog, 120));
  window.addEventListener("focus", () => setTimeout(maybeOpenLinkUpdateDialog, 120));

  document.querySelectorAll("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelector(`#${button.dataset.closeDialog}`).close();
    });
  });

  document.querySelectorAll("dialog").forEach((dialog) => {
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
  });
}

function loadRecords() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(value)) return [];
    return value.map(normalizeRecord).filter(Boolean);
  } catch (error) {
    console.error("读取本地记录失败", error);
    return [];
  }
}

function normalizeRecord(record) {
  if (!record || typeof record !== "object") return null;
  const title = String(record.title || "").trim();
  const url = normalizeUrl(record.url);
  if (!title || !url) return null;

  return {
    id: String(record.id || createId()),
    title,
    url,
    progress: String(record.progress || "").trim(),
    tags: Array.isArray(record.tags) ? uniqueTags(record.tags) : parseTags(record.tags || ""),
    notes: String(record.notes || "").trim(),
    createdAt: validDate(record.createdAt) || new Date().toISOString(),
    updatedAt: validDate(record.updatedAt) || new Date().toISOString(),
  };
}

function validDate(value) {
  if (!value || Number.isNaN(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

function saveRecords() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.records));
  navigator.storage?.persist?.().catch(() => {});
}

function restoreSettings() {
  try {
    const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    if (["updated-desc", "title-asc", "progress-desc"].includes(settings.sort)) {
      elements.sortSelect.value = settings.sort;
    }
  } catch {
    // 设置损坏时使用默认值。
  }
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ sort: elements.sortSelect.value }));
}

function render() {
  updateOverview();
  updateTagFilter();

  const records = getVisibleRecords();
  elements.mangaList.replaceChildren();

  records.forEach((record) => {
    elements.mangaList.append(createMangaCard(record));
  });

  const hasAny = state.records.length > 0;
  const hasVisible = records.length > 0;
  elements.emptyState.hidden = hasVisible;
  elements.mangaList.hidden = !hasVisible;

  if (!hasVisible) {
    elements.emptyTitle.textContent = hasAny ? "没有符合条件的漫画" : "还没有漫画";
    elements.emptyDescription.textContent = hasAny
      ? "试试清空搜索词或切换标签。"
      : "添加第一部漫画，记录你看到哪一话。";
    document.querySelector("#emptyAddButton").hidden = hasAny;
  }
}

function updateOverview() {
  elements.totalCount.textContent = `${state.records.length} 部漫画`;
  if (!state.records.length) {
    elements.recentSummary.textContent = "从第一部漫画开始吧";
    return;
  }

  const latest = [...state.records].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0];
  const suffix = latest.progress ? ` · 第 ${latest.progress} 话` : "";
  elements.recentSummary.textContent = `最近：${latest.title}${suffix}`;
}

function updateTagFilter() {
  const current = elements.tagFilter.value;
  const tags = [...new Set(state.records.flatMap((record) => record.tags))].sort((a, b) =>
    a.localeCompare(b, "zh-CN"),
  );

  elements.tagFilter.replaceChildren(new Option("全部标签", ""));
  tags.forEach((tag) => elements.tagFilter.add(new Option(tag, tag)));
  elements.tagFilter.value = tags.includes(current) ? current : "";
}

function getVisibleRecords() {
  const query = elements.searchInput.value.trim().toLocaleLowerCase("zh-CN");
  const tag = elements.tagFilter.value;

  const visible = state.records.filter((record) => {
    const searchable = [record.title, record.notes, record.url, ...record.tags].join(" ").toLocaleLowerCase("zh-CN");
    return (!query || searchable.includes(query)) && (!tag || record.tags.includes(tag));
  });

  return visible.sort((a, b) => {
    switch (elements.sortSelect.value) {
      case "title-asc":
        return a.title.localeCompare(b.title, "zh-CN", { numeric: true });
      case "progress-desc":
        return progressNumber(b.progress) - progressNumber(a.progress) || a.title.localeCompare(b.title, "zh-CN");
      default:
        return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
    }
  });
}

function createMangaCard(record) {
  const card = elements.mangaCardTemplate.content.firstElementChild.cloneNode(true);

  card.dataset.id = record.id;
  card.querySelector(".manga-title").textContent = record.title;
  card.querySelector(".progress-value").textContent = record.progress ? `第 ${record.progress} 话` : "尚未填写";
  card.querySelector(".updated-time").textContent = `更新于 ${formatRelativeTime(record.updatedAt)}`;

  const readButton = card.querySelector(".read-button");
  readButton.href = record.url;
  readButton.addEventListener("click", () => markOpened(record.id));

  card.querySelector(".increment-button").addEventListener("click", () => incrementProgress(record.id));
  card.querySelector(".progress-panel").addEventListener("click", () => openProgressDialog(record.id));
  card.querySelector(".card-menu-button").addEventListener("click", () => openEditDialog(record.id));

  const tagList = card.querySelector(".tag-list");
  record.tags.forEach((tag) => {
    const tagElement = document.createElement("span");
    tagElement.className = "tag";
    tagElement.textContent = tag;
    tagList.append(tagElement);
  });

  const notes = card.querySelector(".notes-preview");
  if (record.notes) {
    notes.textContent = record.notes;
    notes.hidden = false;
  }

  return card;
}

function openAddDialog() {
  elements.mangaForm.reset();
  elements.mangaId.value = "";
  elements.formEyebrow.textContent = "新记录";
  elements.formTitle.textContent = "添加漫画";
  elements.formError.hidden = true;
  const deleteButton = elements.mangaForm.querySelector(".form-delete-button");
  if (deleteButton) deleteButton.hidden = true;
  elements.mangaDialog.showModal();
  setTimeout(() => elements.titleInput.focus(), 60);
}

function openEditDialog(id) {
  const record = findRecord(id);
  if (!record) return;

  elements.mangaId.value = record.id;
  elements.titleInput.value = record.title;
  elements.urlInput.value = record.url;
  elements.progressInput.value = record.progress;
  elements.tagsInput.value = record.tags.join("，");
  elements.notesInput.value = record.notes;
  elements.formEyebrow.textContent = "编辑记录";
  elements.formTitle.textContent = record.title;
  elements.formError.hidden = true;

  let deleteButton = elements.mangaForm.querySelector(".form-delete-button");
  if (!deleteButton) {
    deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "form-delete-button";
    deleteButton.textContent = "删除这部漫画";
    deleteButton.addEventListener("click", () => requestDelete(elements.mangaId.value));
    elements.mangaForm.querySelector(".sheet-actions").before(deleteButton);
  }
  deleteButton.hidden = false;
  elements.mangaDialog.showModal();
}

function saveMangaFromForm(event) {
  event.preventDefault();
  const id = elements.mangaId.value;
  const title = elements.titleInput.value.trim();
  const url = normalizeUrl(elements.urlInput.value);

  if (!title) return showFormError("请填写漫画名称。");
  if (!url) return showFormError("请输入有效的 http 或 https 网址。");

  const now = new Date().toISOString();
  const existing = findRecord(id);
  const record = {
    id: existing?.id || createId(),
    title,
    url,
    progress: elements.progressInput.value.trim(),
    tags: parseTags(elements.tagsInput.value),
    notes: elements.notesInput.value.trim(),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  if (existing) {
    state.records = state.records.map((item) => (item.id === existing.id ? record : item));
  } else {
    state.records.push(record);
  }

  saveRecords();
  elements.mangaDialog.close();
  render();
  showToast(existing ? "漫画记录已保存" : "漫画已添加");
}

function showFormError(message) {
  elements.formError.textContent = message;
  elements.formError.hidden = false;
}

function openProgressDialog(id) {
  const record = findRecord(id);
  if (!record) return;
  elements.progressMangaId.value = id;
  elements.progressMangaTitle.textContent = record.title;
  elements.quickProgressInput.value = record.progress;
  elements.progressDialog.showModal();
  setTimeout(() => elements.quickProgressInput.select(), 60);
}

function saveQuickProgress(event) {
  event.preventDefault();
  const record = findRecord(elements.progressMangaId.value);
  if (!record) return;
  record.progress = elements.quickProgressInput.value.trim();
  record.updatedAt = new Date().toISOString();
  saveRecords();
  elements.progressDialog.close();
  render();
  showToast(`已更新到第 ${record.progress} 话`);
}

function incrementProgress(id) {
  const record = findRecord(id);
  if (!record) return;

  if (!record.progress) {
    record.progress = "1";
  } else if (/^\d+(?:\.\d+)?$/.test(record.progress)) {
    record.progress = String(Number(record.progress) + 1);
  } else {
    openProgressDialog(id);
    showToast("特殊章节请直接填写新进度");
    return;
  }

  record.updatedAt = new Date().toISOString();
  saveRecords();
  render();
  showToast(`已更新到第 ${record.progress} 话`);
}

function markOpened(id) {
  const record = findRecord(id);
  if (!record) return;
  localStorage.setItem(PENDING_READ_KEY, JSON.stringify({ id, openedAt: Date.now() }));
  record.updatedAt = new Date().toISOString();
  saveRecords();
  render();
}

function loadPendingRead() {
  try {
    const pending = JSON.parse(localStorage.getItem(PENDING_READ_KEY) || "null");
    if (!pending || typeof pending.id !== "string" || !Number.isFinite(pending.openedAt)) {
      clearPendingRead();
      return null;
    }
    if (Date.now() - pending.openedAt > PENDING_READ_TTL) {
      clearPendingRead();
      return null;
    }
    return pending;
  } catch {
    clearPendingRead();
    return null;
  }
}

function clearPendingRead() {
  localStorage.removeItem(PENDING_READ_KEY);
}

function maybeOpenLinkUpdateDialog() {
  if (document.visibilityState === "hidden" || elements.linkUpdateDialog.open) return;
  const pending = loadPendingRead();
  if (!pending) return;

  const record = findRecord(pending.id);
  if (!record) {
    clearPendingRead();
    return;
  }

  elements.linkUpdateMangaId.value = record.id;
  elements.linkUpdateMangaTitle.textContent = record.title;
  elements.linkUpdateInput.value = "";
  elements.linkUpdateError.hidden = true;
  elements.linkUpdateDialog.showModal();
}

async function pasteLinkFromClipboard() {
  elements.linkUpdateError.hidden = true;
  if (!navigator.clipboard?.readText) {
    showLinkUpdateError("当前浏览器无法自动读取剪贴板，请长按输入框手动粘贴。");
    elements.linkUpdateInput.focus();
    return;
  }

  try {
    const clipboardText = (await navigator.clipboard.readText()).trim();
    if (!/^https?:\/\//i.test(clipboardText)) {
      showLinkUpdateError("剪贴板里没有有效的网址，请重新复制，或长按输入框手动粘贴。");
      elements.linkUpdateInput.focus();
      return;
    }

    const url = normalizeUrl(clipboardText);
    if (!url) {
      showLinkUpdateError("剪贴板里的网址无法识别，请长按输入框手动粘贴。");
      elements.linkUpdateInput.focus();
      return;
    }

    elements.linkUpdateInput.value = url;
    elements.linkUpdateInput.focus();
    elements.linkUpdateInput.setSelectionRange(url.length, url.length);
  } catch (error) {
    console.warn("读取剪贴板失败", error);
    showLinkUpdateError("未能读取剪贴板，请允许粘贴，或长按输入框手动粘贴。");
    elements.linkUpdateInput.focus();
  }
}

function saveLinkUpdate(event) {
  event.preventDefault();
  const record = findRecord(elements.linkUpdateMangaId.value);
  if (!record) {
    showLinkUpdateError("找不到这部漫画，请关闭窗口后重试。");
    return;
  }

  const url = normalizeUrl(elements.linkUpdateInput.value);
  if (!url) {
    showLinkUpdateError("请输入有效的 http 或 https 网址。");
    elements.linkUpdateInput.focus();
    return;
  }

  record.url = url;
  record.updatedAt = new Date().toISOString();
  saveRecords();
  clearPendingRead();
  elements.linkUpdateDialog.close();
  render();
  showToast("继续阅读链接已更新");
}

function showLinkUpdateError(message) {
  elements.linkUpdateError.textContent = message;
  elements.linkUpdateError.hidden = false;
}

function requestDelete(id) {
  const record = findRecord(id);
  if (!record) return;
  state.pendingDeleteId = id;
  elements.confirmTitle.textContent = `删除《${record.title}》？`;
  elements.mangaDialog.close();
  elements.confirmDialog.showModal();
}

function closeDeleteDialog() {
  state.pendingDeleteId = null;
  elements.confirmDialog.close();
}

function confirmDelete() {
  if (!state.pendingDeleteId) return;
  state.records = state.records.filter((record) => record.id !== state.pendingDeleteId);
  saveRecords();
  closeDeleteDialog();
  render();
  showToast("漫画记录已删除");
}

function exportBackup() {
  const backup = {
    app: "漫画记录",
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    records: state.records,
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `漫画记录备份-${date}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast(`已导出 ${state.records.length} 条记录`);
}

async function importBackup(event) {
  const [file] = event.target.files;
  event.target.value = "";
  if (!file) return;

  try {
    const parsed = JSON.parse(await file.text());
    const source = Array.isArray(parsed) ? parsed : parsed.records;
    if (!Array.isArray(source)) throw new Error("备份格式不正确");

    const imported = source.map(normalizeRecord).filter(Boolean);
    if (!imported.length && source.length) throw new Error("备份中没有可用记录");

    const merged = new Map(state.records.map((record) => [record.id, record]));
    imported.forEach((record) => {
      const existing = merged.get(record.id);
      if (!existing || Date.parse(record.updatedAt) >= Date.parse(existing.updatedAt)) {
        merged.set(record.id, record);
      }
    });

    state.records = [...merged.values()];
    saveRecords();
    elements.settingsDialog.close();
    render();
    showToast(`已导入并合并 ${imported.length} 条记录`);
  } catch (error) {
    console.error(error);
    showToast("导入失败：请选择本应用导出的 JSON 文件");
  }
}

function parseTags(value) {
  return uniqueTags(String(value).split(/[,，\n]/));
}

function uniqueTags(tags) {
  const seen = new Set();
  return tags
    .map((tag) => String(tag).trim())
    .filter((tag) => {
      const key = tag.toLocaleLowerCase("zh-CN");
      if (!tag || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function normalizeUrl(value) {
  let candidate = String(value || "").trim();
  if (!candidate) return null;
  if (!/^https?:\/\//i.test(candidate)) candidate = `https://${candidate}`;
  try {
    const parsed = new URL(candidate);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

function progressNumber(value) {
  const match = String(value).match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : -1;
}

function formatRelativeTime(iso) {
  const elapsed = Date.now() - Date.parse(iso);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (elapsed < minute) return "刚刚";
  if (elapsed < hour) return `${Math.floor(elapsed / minute)} 分钟前`;
  if (elapsed < day) return `${Math.floor(elapsed / hour)} 小时前`;
  if (elapsed < 7 * day) return `${Math.floor(elapsed / day)} 天前`;
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "short", day: "numeric" }).format(new Date(iso));
}

function createId() {
  return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function findRecord(id) {
  return state.records.find((record) => record.id === id);
}

function showToast(message) {
  clearTimeout(state.toastTimer);
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  state.toastTimer = setTimeout(() => {
    elements.toast.hidden = true;
  }, 2400);
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.warn("离线缓存启用失败", error);
    });
  });
}
