const SUPABASE_URL = "https://rzqmxvreqkcjislhysyh.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_xx_hXg2qUaLCDeBltojxZQ_rqq2R535";
const EMAIL_FUNCTION_NAME = "notify-delivery";
const ADMIN_PASSWORD = "0519";

const REQUIRED_FIELDS = [
  ["nom", "Nom"],
  ["prenom", "Prénom"],
  ["telephone", "Téléphone"],
  ["adresse", "Adresse complète"],
  ["date", "Date de livraison souhaitée"],
  ["horaire", "Horaire de livraison"],
];

const PROFILES = {
  romain: { key: "romain", label: "Romain", role: "Livreur" },
  admin: { key: "admin", label: "Admin", role: "Admin" },
};

const state = {
  courses: [],
  route: "home",
  selectedId: null,
  formPhotos: [],
  online: false,
  busy: false,
  profile: PROFILES.romain,
  supabase: null,
  channel: null,
};

const app = document.querySelector("#app");
const syncStatus = document.querySelector("#syncStatus");
const toastStack = document.querySelector("#toastStack");
const alertDialog = document.querySelector("#alertDialog");
const confirmDialog = document.querySelector("#confirmDialog");
const profileDialog = document.querySelector("#profileDialog");

document.addEventListener("DOMContentLoaded", init);
document.addEventListener("click", handleDocumentClick);
document.addEventListener("change", handleDocumentChange);
document.addEventListener("submit", handleDocumentSubmit);
window.addEventListener("online", refreshSyncStatus);
window.addEventListener("offline", refreshSyncStatus);

async function init() {
  registerServiceWorker();
  initProfile();
  initSupabase();
  await loadCourses();
  render();
}

function initProfile() {
  state.profile = PROFILES.romain;
  renderProfilePill();
}

function initSupabase() {
  const configured = SUPABASE_URL.includes(".supabase.co") && !SUPABASE_URL.includes("VOTRE-PROJET") && SUPABASE_ANON_KEY.length > 30;

  if (!configured || !window.supabase) {
    state.online = false;
    refreshSyncStatus("Config Supabase à renseigner");
    return;
  }

  state.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  state.online = navigator.onLine;
  refreshSyncStatus();

  state.channel = state.supabase
    .channel("courses-realtime")
    .on("postgres_changes", { event: "*", schema: "public", table: "courses" }, async () => {
      await loadCourses(false);
      render();
      showToast("Synchronisation reçue.");
    })
    .subscribe((status) => {
      state.online = status === "SUBSCRIBED" && navigator.onLine;
      refreshSyncStatus();
    });
}

async function loadCourses(showError = true) {
  if (!state.supabase) {
    state.courses = readLocalCourses();
    return;
  }

  const { data, error } = await state.supabase
    .from("courses")
    .select("*")
    .order("date", { ascending: true })
    .order("horaire", { ascending: true });

  if (error) {
    state.online = false;
    refreshSyncStatus("Erreur Supabase");
    if (showError) showToast("Impossible de charger Supabase.");
    return;
  }

  state.courses = (data || []).map(normalizeCourse);
  state.online = navigator.onLine;
  refreshSyncStatus();
}

function readLocalCourses() {
  try {
    return JSON.parse(localStorage.getItem("winess:courses") || "[]").map(normalizeCourse);
  } catch {
    return [];
  }
}

function writeLocalCourses() {
  if (!state.supabase) {
    localStorage.setItem("winess:courses", JSON.stringify(state.courses));
  }
}

function normalizeCourse(course) {
  return {
    ...course,
    photos: parseArray(course.photos),
    photos_apres_livraison: parseArray(course.photos_apres_livraison),
    historique_actions: parseArray(course.historique_actions),
    preuve_livraison: course.preuve_livraison || "",
    statut: course.statut || "prevue",
  };
}

function parseArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function isAdmin() {
  return state.profile.key === "admin";
}

function renderProfilePill() {
  let pill = document.querySelector("#profilePill");
  if (!pill) {
    pill = document.createElement("button");
    pill.id = "profilePill";
    pill.type = "button";
    pill.className = "profile-pill";
    pill.dataset.action = "switch-profile";
    syncStatus.insertAdjacentElement("beforebegin", pill);
  }

  pill.innerHTML = `<span>${escapeHtml(state.profile.label)}</span><small>${escapeHtml(state.profile.role)}</small>`;
}

function refreshSyncStatus(message) {
  const configured = Boolean(state.supabase);
  const label = message || (configured && state.online ? "Supabase synchronisé" : configured ? "Hors ligne" : "Mode local");
  syncStatus.classList.toggle("online", configured && state.online);
  syncStatus.classList.toggle("offline", !state.online);
  syncStatus.querySelector("span:last-child").textContent = label;
}

function render() {
  renderProfilePill();
  const selected = state.courses.find((course) => String(course.id) === String(state.selectedId));

  if (state.route === "add") return renderForm();
  if (state.route === "planned") return renderList("planned");
  if (state.route === "done") return renderList("done");
  if (state.route === "detail" && selected) return renderDetail(selected);
  state.route = "home";
  renderHome();
}

function renderHome() {
  const planned = getPlanned();
  const done = getDone();

  app.innerHTML = `
    <section class="hero">
      <p class="eyebrow">Boutique vins & spiritueux</p>
      <h1>Les livraisons Winess, nettes et synchronisées.</h1>
      <p class="hero-copy">Une interface rapide pour préparer, suivre et valider les courses depuis plusieurs téléphones.</p>
      <div class="stats-row compact">
        <div class="stat"><b>${planned.length}</b><small>courses prévues</small></div>
        <div class="stat"><b>${done.length}</b><small>courses faites</small></div>
      </div>
    </section>
    <section class="home-actions" aria-label="Actions principales">
      <button class="big-tile" data-action="planned">
        <span class="tile-icon">→</span>
        <strong>Courses prévues</strong>
        <span>${planned.length} livraison${planned.length > 1 ? "s" : ""} à suivre</span>
      </button>
      <button class="big-tile" data-action="done">
        <span class="tile-icon">✓</span>
        <strong>Courses faites</strong>
        <span>Historique, preuves et prix</span>
      </button>
      <button class="big-tile add-tile" data-action="add">
        <span class="tile-icon">+</span>
        <strong>Ajouter une course</strong>
        <span>Créer une fiche de livraison</span>
      </button>
    </section>
  `;
}

function renderList(type) {
  const isDone = type === "done";
  const courses = isDone ? getDone() : getPlanned();
  const title = isDone ? "Courses faites" : "Courses prévues";
  const copy = isDone ? "Historique des livraisons terminées." : "Toutes les livraisons non terminées.";

  app.innerHTML = `
    <section class="panel">
      <div class="view-head">
        <div>
          <h2>${title}</h2>
          <p>${copy}</p>
        </div>
        <button class="btn btn-gold" data-action="add">Ajouter</button>
      </div>
      <div class="cards">
        ${courses.length ? courses.map((course) => isDone ? doneCard(course) : plannedCard(course)).join("") : emptyState(isDone ? "Aucune course faite pour le moment." : "Aucune course prévue.")}
      </div>
    </section>
  `;
}

function plannedCard(course) {
  return `
    <article class="course-card">
      <div class="course-main">
        <div>
          <h3>${escapeHtml(course.nom)} ${escapeHtml(course.prenom)}</h3>
          <div class="meta">
            <span class="chip">${formatDate(course.date)}</span>
            <span class="chip">${escapeHtml(course.horaire || "-")}</span>
            <span class="chip">${escapeHtml(course.colis || "0")} colis</span>
            <span class="chip">${shortAddress(course.adresse)}</span>
            ${course.statut === "annulee" ? `<span class="chip status-cancelled">Annulée</span>` : ""}
          </div>
        </div>
        <div class="price">${formatPrice(course.prix)}</div>
      </div>
      <div class="card-actions ${isAdmin() ? "" : "two"}">
        <button class="btn btn-primary" data-action="detail" data-id="${course.id}">👁️ Voir le détail</button>
        <a class="btn btn-gold" href="${wazeUrl(course.adresse)}" target="_blank" rel="noopener">🚙 Waze</a>
        ${isAdmin() ? `<button class="btn btn-danger" data-action="delete" data-id="${course.id}">🗑️ Supprimer</button>` : ""}
      </div>
    </article>
  `;
}

function doneCard(course) {
  return `
    <article class="course-card">
      <div class="course-main">
        <div>
          <h3>${escapeHtml(course.nom)} ${escapeHtml(course.prenom)}</h3>
          <div class="meta">
            <span class="chip">${shortAddress(course.adresse)}</span>
            <span class="chip"><a href="tel:${cleanPhone(course.telephone)}">${escapeHtml(course.telephone || "")}</a></span>
            <span class="chip">${course.done_at ? formatDateTime(course.done_at) : "Livrée"}</span>
          </div>
        </div>
        <div class="price">${formatPrice(course.prix)}</div>
      </div>
      ${course.preuve_livraison ? `<div class="photo-item"><img src="${course.preuve_livraison}" alt="Preuve de livraison"></div>` : ""}
      ${historyPreview(course)}
      <div class="card-actions ${isAdmin() ? "" : "two"}">
        <button class="btn btn-primary" data-action="detail" data-id="${course.id}">👁️ Voir le détail</button>
        <a class="btn btn-gold" href="${wazeUrl(course.adresse)}" target="_blank" rel="noopener">🚙 Waze</a>
        ${isAdmin() ? `<button class="btn btn-danger" data-action="delete" data-id="${course.id}">🗑️ Supprimer</button>` : ""}
      </div>
    </article>
  `;
}

function renderForm() {
  state.formPhotos = [];
  app.innerHTML = `
    <section class="panel">
      <div class="view-head">
        <div>
          <h2>Ajouter une course</h2>
          <p>Création d'une fiche livraison Winess.</p>
        </div>
        <button class="icon-btn" data-action="home" aria-label="Fermer">×</button>
      </div>
      <form id="courseForm" novalidate>
        <div class="form-grid">
          ${inputField("nom", "Nom", "text", true)}
          ${inputField("prenom", "Prénom", "text", true)}
          ${inputField("telephone", "Téléphone", "tel", true)}
          ${inputField("date", "Date de livraison souhaitée", "date", true)}
          ${inputField("horaire", "Horaire de livraison", "time", true)}
          ${inputField("colis", "Nombre de colis", "number")}
          ${inputField("prix", "Prix de la course", "number", false, "0.01")}
          ${inputField("donneur", "Donneur d'ordre chez Winess", "text")}
          <div class="field full">
            <label for="adresse">Adresse complète *</label>
            <textarea id="adresse" name="adresse" required autocomplete="street-address"></textarea>
          </div>
          <div class="field full">
            <label for="code">Code d'entrée / digicode</label>
            <input id="code" name="code" type="text" autocomplete="off">
          </div>
          <div class="field full">
            <label for="instructions">Instructions de livraison</label>
            <textarea id="instructions" name="instructions"></textarea>
          </div>
          <div class="field full">
            <label for="photos">Photos</label>
            <input id="photos" name="photos" type="file" accept="image/*" multiple>
            <div class="photo-preview" id="photoPreview"></div>
          </div>
        </div>
        <div class="form-actions">
          <button class="btn btn-ghost" type="button" data-action="home">Annuler</button>
          <button class="btn btn-primary" type="submit">Créer la fiche</button>
        </div>
      </form>
    </section>
  `;
}

function inputField(name, label, type, required = false, step = "") {
  return `
    <div class="field">
      <label for="${name}">${label}${required ? " *" : ""}</label>
      <input id="${name}" name="${name}" type="${type}" ${required ? "required" : ""} ${step ? `step="${step}"` : ""}>
    </div>
  `;
}

function renderDetail(course) {
  const isDone = course.statut === "faite";
  const isCancelled = course.statut === "annulee";
  app.innerHTML = `
    <section class="panel">
      <div class="view-head">
        <div>
          <h2>${escapeHtml(course.nom)} ${escapeHtml(course.prenom)}</h2>
          <p>${isDone ? "Livraison terminée" : isCancelled ? "Livraison annulée" : "Fiche complète de livraison"}</p>
        </div>
        <button class="icon-btn" data-action="${isDone ? "done" : "planned"}" aria-label="Retour">←</button>
      </div>
      <div class="detail-grid">
        <div class="detail-row"><small>Téléphone</small><a href="tel:${cleanPhone(course.telephone)}">${escapeHtml(course.telephone || "-")}</a></div>
        <div class="detail-row"><small>Adresse complète</small>${escapeHtml(course.adresse || "-")}</div>
        <a class="btn btn-gold" href="${wazeUrl(course.adresse)}" target="_blank" rel="noopener">🚙 Ouvrir dans Waze</a>
        <div class="detail-row"><small>Date et horaire</small>${formatDate(course.date)} à ${escapeHtml(course.horaire || "-")}</div>
        <div class="detail-row"><small>Code / digicode</small>${escapeHtml(course.code || "-")}</div>
        <div class="detail-row"><small>Instructions</small>${escapeHtml(course.instructions || "-")}</div>
        <div class="detail-row"><small>Nombre de colis</small>${escapeHtml(course.colis || "0")}</div>
        <div class="detail-row"><small>Prix</small>${formatPrice(course.prix)}</div>
        <div class="detail-row"><small>Donneur d'ordre</small>${escapeHtml(course.donneur || "-")}</div>
        ${isAdmin() && !isDone ? adminEditBox(course) : ""}
        <div class="detail-row">
          <small>Photos</small>
          ${course.photos.length ? `<div class="detail-photos">${course.photos.map((photo, index) => photoMarkup(photo, course.id, index, "photos")).join("")}</div>` : "Aucune photo."}
        </div>
        <div class="detail-row">
          <small>Preuve de livraison</small>
          ${course.preuve_livraison ? `<div class="photo-item"><img src="${course.preuve_livraison}" alt="Preuve de livraison"></div>` : "Aucune preuve enregistrée."}
        </div>
        ${isDone ? doneActions(course) : isCancelled ? "" : pendingActions(course)}
        <div class="detail-row">
          <small>Historique des actions</small>
          ${historyList(course)}
        </div>
        ${isAdmin() ? `<button class="btn btn-danger" data-action="delete" data-id="${course.id}">🗑️ Supprimer la course</button>` : ""}
      </div>
    </section>
  `;
}

function pendingActions(course) {
  return `
    <div class="proof-box">
      <label class="field" for="proofInput">
        <span>Photo de preuve obligatoire</span>
        <input id="proofInput" type="file" accept="image/*" capture="environment">
      </label>
      <button class="btn btn-primary" data-action="mark-done" data-id="${course.id}">✅ Marquer livré + photo</button>
    </div>
  `;
}

function doneActions(course) {
  return `
    <div class="detail-row">
      <small>Photos après livraison</small>
      ${course.photos_apres_livraison.length ? `<div class="detail-photos">${course.photos_apres_livraison.map((photo, index) => photoMarkup(photo, course.id, index, "photos_apres_livraison")).join("")}</div>` : "Aucune photo après livraison."}
    </div>
    <div class="proof-box">
      <label class="field" for="afterPhotoInput">
        <span>Ajouter une photo après livraison</span>
        <input id="afterPhotoInput" type="file" accept="image/*" capture="environment">
      </label>
      <button class="btn btn-primary" data-action="add-after-photo" data-id="${course.id}">Ajouter la photo</button>
    </div>
    <form class="inline-form" data-action="update-price" data-id="${course.id}">
      <label class="field" for="priceDoneInput">
        <span>Modifier le prix de la course</span>
        <input id="priceDoneInput" name="prix" type="number" step="0.01" value="${escapeHtml(course.prix || 0)}">
      </label>
      <button class="btn btn-gold" type="submit">Enregistrer le prix</button>
    </form>
  `;
}

function adminEditBox(course) {
  return `
    <form class="admin-edit" data-action="admin-update-course" data-id="${course.id}">
      <div class="field">
        <label for="editNom">Nom</label>
        <input id="editNom" name="nom" type="text" value="${escapeHtml(course.nom || "")}">
      </div>
      <div class="field">
        <label for="editPrenom">Prénom</label>
        <input id="editPrenom" name="prenom" type="text" value="${escapeHtml(course.prenom || "")}">
      </div>
      <div class="field">
        <label for="editTelephone">Téléphone</label>
        <input id="editTelephone" name="telephone" type="tel" value="${escapeHtml(course.telephone || "")}">
      </div>
      <div class="field">
        <label for="editDate">Modifier la date</label>
        <input id="editDate" name="date" type="date" value="${escapeHtml(course.date || "")}">
      </div>
      <div class="field">
        <label for="editHoraire">Modifier l'horaire</label>
        <input id="editHoraire" name="horaire" type="time" value="${escapeHtml(course.horaire || "")}">
      </div>
      <div class="field">
        <label for="editColis">Nombre de colis</label>
        <input id="editColis" name="colis" type="number" value="${escapeHtml(course.colis || 0)}">
      </div>
      <div class="field">
        <label for="editPrix">Prix</label>
        <input id="editPrix" name="prix" type="number" step="0.01" value="${escapeHtml(course.prix || 0)}">
      </div>
      <div class="field">
        <label for="editDonneur">Donneur d'ordre</label>
        <input id="editDonneur" name="donneur" type="text" value="${escapeHtml(course.donneur || "")}">
      </div>
      <div class="field full">
        <label for="editAdresse">Adresse complète</label>
        <textarea id="editAdresse" name="adresse">${escapeHtml(course.adresse || "")}</textarea>
      </div>
      <div class="field full">
        <label for="editCode">Code / digicode</label>
        <input id="editCode" name="code" type="text" value="${escapeHtml(course.code || "")}">
      </div>
      <div class="field full">
        <label for="editInstructions">Modifier les instructions</label>
        <textarea id="editInstructions" name="instructions">${escapeHtml(course.instructions || "")}</textarea>
      </div>
      <div class="form-actions">
        <button class="btn btn-ghost" type="button" data-action="cancel-course" data-id="${course.id}">Annuler la livraison</button>
        <button class="btn btn-primary" type="submit">Enregistrer les modifications</button>
      </div>
    </form>
  `;
}

function photoMarkup(photo, id, index, collection) {
  return `
    <div class="photo-item">
      <img src="${photo}" alt="Photo livraison ${index + 1}">
      ${isAdmin() ? `<button type="button" data-action="delete-photo" data-id="${id}" data-index="${index}" data-collection="${collection}" aria-label="Supprimer la photo">×</button>` : ""}
    </div>
  `;
}

function historyPreview(course) {
  const latest = course.historique_actions[course.historique_actions.length - 1];
  if (!latest) return "";
  return `<div class="history-preview">${escapeHtml(latest.message || latest.action || "Action enregistrée")}</div>`;
}

function historyList(course) {
  if (!course.historique_actions.length) return "Aucune action enregistrée.";

  return `
    <ol class="history-list">
      ${course.historique_actions.map((entry) => `
        <li>
          <strong>${escapeHtml(entry.auteur || "-")}</strong>
          <span>${escapeHtml(entry.message || entry.action || "Action")}</span>
          <small>${formatDateTime(entry.at)}</small>
        </li>
      `).join("")}
    </ol>
  `;
}

async function handleDocumentClick(event) {
  const trigger = event.target.closest("[data-action]");
  if (!trigger || trigger.tagName === "FORM") return;

  const { action, id, index, collection } = trigger.dataset;

  if (action === "home") navigate("home");
  if (action === "planned") navigate("planned");
  if (action === "done") navigate("done");
  if (action === "add") navigate("add");
  if (action === "detail") navigate("detail", id);
  if (action === "switch-profile") openProfileDialog();
  if (action === "set-romain") setRomainProfile();
  if (action === "close-profile") profileDialog.close();
  if (action === "delete") await deleteCourse(id);
  if (action === "delete-photo") await deletePhoto(id, Number(index), collection);
  if (action === "mark-done") await markDone(id);
  if (action === "add-after-photo") await addAfterDeliveryPhoto(id);
  if (action === "cancel-course") await cancelCourse(id);
}

async function handleDocumentChange(event) {
  if (event.target.id !== "photos") return;
  const files = Array.from(event.target.files || []);
  state.formPhotos = await Promise.all(files.map(fileToDataUrl));
  renderPhotoPreview();
}

async function handleDocumentSubmit(event) {
  const form = event.target;
  const action = form.dataset.action;

  if (form.id === "courseForm") {
    event.preventDefault();
    await handleFormSubmit(form);
  }

  if (action === "update-price") {
    event.preventDefault();
    await updateDonePrice(form.dataset.id, new FormData(form));
  }

  if (action === "admin-update-course") {
    event.preventDefault();
    await adminUpdateCourse(form.dataset.id, new FormData(form));
  }

  if (form.id === "profileForm") {
    event.preventDefault();
    await activateAdmin(new FormData(form));
  }
}

function navigate(route, id = null) {
  state.route = route;
  state.selectedId = id;
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openProfileDialog() {
  document.querySelector("#adminPassword").value = "";
  profileDialog.showModal();
}

function setRomainProfile() {
  state.profile = PROFILES.romain;
  profileDialog.close();
  render();
  showToast("Profil Romain activé.");
}

async function activateAdmin(formData) {
  if (String(formData.get("adminPassword") || "") !== ADMIN_PASSWORD) {
    profileDialog.close();
    showAlert("Accès refusé", "Mot de passe Admin incorrect.", "!");
    return;
  }

  state.profile = PROFILES.admin;
  profileDialog.close();
  render();
  showToast("Profil Admin activé.");
}

function renderPhotoPreview() {
  const preview = document.querySelector("#photoPreview");
  if (!preview) return;
  preview.innerHTML = state.formPhotos.map((photo, index) => `
    <div class="photo-item">
      <img src="${photo}" alt="Photo sélectionnée ${index + 1}">
      <button type="button" data-remove-form-photo="${index}" aria-label="Retirer la photo">×</button>
    </div>
  `).join("");

  preview.querySelectorAll("[data-remove-form-photo]").forEach((button) => {
    button.addEventListener("click", () => {
      state.formPhotos.splice(Number(button.dataset.removeFormPhoto), 1);
      renderPhotoPreview();
    });
  });
}

async function handleFormSubmit(form) {
  const formData = new FormData(form);
  const missing = REQUIRED_FIELDS.filter(([name]) => !String(formData.get(name) || "").trim()).map(([, label]) => label);

  if (missing.length) {
    showAlert("Il manque :", `<ul>${missing.map((field) => `<li>${field}</li>`).join("")}</ul>`, "!");
    return;
  }

  const payload = {
    nom: clean(formData.get("nom")),
    prenom: clean(formData.get("prenom")),
    telephone: clean(formData.get("telephone")),
    adresse: clean(formData.get("adresse")),
    code: clean(formData.get("code")),
    instructions: clean(formData.get("instructions")),
    horaire: clean(formData.get("horaire")),
    date: clean(formData.get("date")),
    colis: Number(formData.get("colis") || 0),
    prix: Number(formData.get("prix") || 0),
    donneur: clean(formData.get("donneur")),
    statut: "prevue",
    photos: state.formPhotos,
    preuve_livraison: null,
    photos_apres_livraison: [],
    done_at: null,
    historique_actions: [historyEntry("créé", "Fiche de livraison créée")],
  };

  await saveCourse(payload);
}

async function saveCourse(payload) {
  setBusy(true);
  try {
    if (state.supabase) {
      const { error } = await state.supabase.from("courses").insert(payload);
      if (error) throw error;
      await loadCourses(false);
    } else {
      state.courses.unshift({ ...payload, id: crypto.randomUUID() });
      writeLocalCourses();
    }
    await showAlert("Fiche créée", "✅ Fiche de livraison créée avec succès.", "✓");
    navigate("planned");
  } catch (error) {
    showAlert("Erreur", `Impossible de créer la fiche : ${escapeHtml(error.message || "erreur inconnue")}`, "!");
  } finally {
    setBusy(false);
  }
}

async function markDone(id) {
  const course = findCourse(id);
  const input = document.querySelector("#proofInput");
  const file = input?.files?.[0];

  if (!course) return;
  if (!file) {
    showAlert("Photo obligatoire", "Il manque la photo de preuve de livraison.", "!");
    return;
  }

  setBusy(true);
  try {
    const proof = await fileToDataUrl(file);
    const doneAt = new Date().toISOString();
    const patch = {
      statut: "faite",
      preuve_livraison: proof,
      done_at: doneAt,
      historique_actions: [
        ...course.historique_actions,
        historyEntry("livraison validée", `Romain a validé la livraison le ${formatDateTime(doneAt)} avec photo ajoutée`, "Romain", doneAt),
      ],
    };

    await updateCourse(id, patch);
    await notifyDelivery({ ...course, ...patch });
    await showAlert("Livraison validée", "✅ Livraison validée. La fiche est passée dans Courses faites.", "✓");
    navigate("done");
  } catch (error) {
    showAlert("Erreur", `Impossible de valider la livraison : ${escapeHtml(error.message || "erreur inconnue")}`, "!");
  } finally {
    setBusy(false);
  }
}

async function addAfterDeliveryPhoto(id) {
  const course = findCourse(id);
  const input = document.querySelector("#afterPhotoInput");
  const file = input?.files?.[0];

  if (!course) return;
  if (!file) {
    showAlert("Photo obligatoire", "Sélectionne une photo à ajouter.", "!");
    return;
  }

  setBusy(true);
  try {
    const at = new Date().toISOString();
    const photo = await fileToDataUrl(file);
    const patch = {
      photos_apres_livraison: [...course.photos_apres_livraison, photo],
      historique_actions: [
        ...course.historique_actions,
        historyEntry("photo ajoutée", `${state.profile.label} a ajouté une photo le ${formatDateTime(at)}`, state.profile.label, at),
      ],
    };
    await updateCourse(id, patch);
    showToast("Photo ajoutée avec succès.");
    render();
  } catch (error) {
    showAlert("Erreur", `Impossible d'ajouter la photo : ${escapeHtml(error.message || "erreur inconnue")}`, "!");
  } finally {
    setBusy(false);
  }
}

async function updateDonePrice(id, formData) {
  const course = findCourse(id);
  if (!course) return;

  const oldPrice = Number(course.prix || 0);
  const newPrice = Number(formData.get("prix") || 0);

  if (oldPrice === newPrice) {
    showToast("Prix inchangé.");
    return;
  }

  const at = new Date().toISOString();
  const patch = {
    prix: newPrice,
    historique_actions: [
      ...course.historique_actions,
      historyEntry("prix modifié", `${state.profile.label} a modifié le prix de ${formatPrice(oldPrice)} à ${formatPrice(newPrice)} le ${formatDateTime(at)}`, state.profile.label, at),
    ],
  };

  setBusy(true);
  try {
    await updateCourse(id, patch);
    showToast("Prix modifié avec succès.");
    render();
  } catch (error) {
    showAlert("Erreur", `Impossible de modifier le prix : ${escapeHtml(error.message || "erreur inconnue")}`, "!");
  } finally {
    setBusy(false);
  }
}

async function adminUpdateCourse(id, formData) {
  if (!isAdmin()) return showAlert("Accès refusé", "Seul Admin peut modifier une livraison.", "!");
  const course = findCourse(id);
  if (!course) return;

  const at = new Date().toISOString();
  const patch = {
    nom: clean(formData.get("nom")),
    prenom: clean(formData.get("prenom")),
    telephone: clean(formData.get("telephone")),
    adresse: clean(formData.get("adresse")),
    code: clean(formData.get("code")),
    date: clean(formData.get("date")),
    horaire: clean(formData.get("horaire")),
    colis: Number(formData.get("colis") || 0),
    prix: Number(formData.get("prix") || 0),
    donneur: clean(formData.get("donneur")),
    instructions: clean(formData.get("instructions")),
    historique_actions: [
      ...course.historique_actions,
      historyEntry("modifié", `Admin a modifié la livraison le ${formatDateTime(at)}`, "Admin", at),
    ],
  };

  setBusy(true);
  try {
    await updateCourse(id, patch);
    showToast("Livraison modifiée avec succès.");
    render();
  } catch (error) {
    showAlert("Erreur", `Impossible de modifier la livraison : ${escapeHtml(error.message || "erreur inconnue")}`, "!");
  } finally {
    setBusy(false);
  }
}

async function cancelCourse(id) {
  if (!isAdmin()) return showAlert("Accès refusé", "Seul Admin peut annuler une livraison.", "!");
  const course = findCourse(id);
  if (!course) return;
  const ok = await askConfirm("Annuler la livraison", "Cette fiche restera consultable avec le statut annulé.");
  if (!ok) return;

  const at = new Date().toISOString();
  const patch = {
    statut: "annulee",
    historique_actions: [
      ...course.historique_actions,
      historyEntry("annulé", `Admin a annulé la livraison le ${formatDateTime(at)}`, "Admin", at),
    ],
  };

  setBusy(true);
  try {
    await updateCourse(id, patch);
    showToast("Livraison annulée.");
    navigate("planned");
  } catch (error) {
    showAlert("Erreur", `Impossible d'annuler la livraison : ${escapeHtml(error.message || "erreur inconnue")}`, "!");
  } finally {
    setBusy(false);
  }
}

async function deleteCourse(id) {
  if (!isAdmin()) return showAlert("Accès refusé", "Seul Admin peut supprimer une fiche.", "!");
  const ok = await askConfirm("Supprimer la course", "Cette course sera supprimée définitivement.");
  if (!ok) return;

  setBusy(true);
  try {
    if (state.supabase) {
      await logDeletedCourse(courseDeleteSnapshot(id));
      const { error } = await state.supabase.from("courses").delete().eq("id", id);
      if (error) throw error;
      await loadCourses(false);
    } else {
      state.courses = state.courses.filter((course) => String(course.id) !== String(id));
      writeLocalCourses();
    }
    showToast("🗑️ Course supprimée avec succès.");
    navigate(state.route === "detail" ? "planned" : state.route);
  } catch (error) {
    showAlert("Erreur", `Impossible de supprimer la course : ${escapeHtml(error.message || "erreur inconnue")}`, "!");
  } finally {
    setBusy(false);
  }
}

function courseDeleteSnapshot(id) {
  const course = findCourse(id);
  const at = new Date().toISOString();
  return {
    course_id: id,
    auteur: "Admin",
    action: "supprimé",
    message: `Admin a supprimé la course le ${formatDateTime(at)}`,
    at,
    snapshot: course || null,
  };
}

async function logDeletedCourse(entry) {
  if (!state.supabase) return;
  const { error } = await state.supabase.from("course_history").insert(entry);
  if (error) throw error;
}

async function deletePhoto(id, index, collection) {
  if (!isAdmin()) return showAlert("Accès refusé", "Seul Admin peut supprimer des photos.", "!");
  const ok = await askConfirm("Supprimer la photo", "Cette photo sera supprimée de la fiche.");
  if (!ok) return;

  const course = findCourse(id);
  if (!course || !["photos", "photos_apres_livraison"].includes(collection)) return;

  const at = new Date().toISOString();
  const photos = [...course[collection]];
  photos.splice(index, 1);

  setBusy(true);
  try {
    await updateCourse(id, {
      [collection]: photos,
      historique_actions: [
        ...course.historique_actions,
        historyEntry("photo supprimée", `Admin a supprimé une photo le ${formatDateTime(at)}`, "Admin", at),
      ],
    });
    showToast("Photo supprimée avec succès.");
    render();
  } catch (error) {
    showAlert("Erreur", `Impossible de supprimer la photo : ${escapeHtml(error.message || "erreur inconnue")}`, "!");
  } finally {
    setBusy(false);
  }
}

async function updateCourse(id, patch) {
  if (state.supabase) {
    const { error } = await state.supabase.from("courses").update(patch).eq("id", id);
    if (error) throw error;
    await loadCourses(false);
    return;
  }

  state.courses = state.courses.map((course) => String(course.id) === String(id) ? normalizeCourse({ ...course, ...patch }) : course);
  writeLocalCourses();
}

async function notifyDelivery(course) {
  if (!state.supabase) {
    showToast("Email non envoyé en mode local.");
    return;
  }

  const { error } = await state.supabase.functions.invoke(EMAIL_FUNCTION_NAME, {
    body: {
      to: "steven@sabwine.com",
      subject: "Livraison Winess validée",
      nom: course.nom,
      prenom: course.prenom,
      adresse: course.adresse,
      done_at: course.done_at,
      prix: course.prix,
      colis: course.colis,
      livreur: "Romain",
      preuve_ajoutee: Boolean(course.preuve_livraison),
    },
  });

  if (error) showToast("Livraison validée, email non envoyé.");
}

function historyEntry(action, message, auteur = state.profile.label, at = new Date().toISOString()) {
  return { action, message, auteur, at };
}

function findCourse(id) {
  return state.courses.find((course) => String(course.id) === String(id));
}

function setBusy(isBusy) {
  state.busy = isBusy;
  app.querySelectorAll("button, input, textarea").forEach((element) => {
    if (element.type !== "file") element.disabled = isBusy;
  });
}

function getPlanned() {
  return state.courses.filter((course) => course.statut !== "faite" && (isAdmin() || course.statut !== "annulee"));
}

function getDone() {
  return state.courses.filter((course) => course.statut === "faite").sort((a, b) => new Date(b.done_at || 0) - new Date(a.done_at || 0));
}

function showAlert(title, message, icon = "!") {
  document.querySelector("#alertTitle").textContent = title;
  document.querySelector("#alertMessage").innerHTML = message;
  document.querySelector("#alertIcon").textContent = icon;
  if (alertDialog.showModal) {
    alertDialog.showModal();
    return new Promise((resolve) => {
      alertDialog.addEventListener("close", resolve, { once: true });
    });
  }
  alert(message.replace(/<[^>]+>/g, ""));
  return Promise.resolve();
}

function askConfirm(title, message) {
  document.querySelector("#confirmTitle").textContent = title;
  document.querySelector("#confirmMessage").textContent = message;

  if (!confirmDialog.showModal) {
    return Promise.resolve(confirm(message));
  }

  confirmDialog.showModal();
  return new Promise((resolve) => {
    confirmDialog.addEventListener("close", () => resolve(confirmDialog.returnValue === "confirm"), { once: true });
  });
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  toastStack.appendChild(toast);
  setTimeout(() => toast.remove(), 3200);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function clean(value) {
  return String(value || "").trim();
}

function cleanPhone(value) {
  return clean(value).replace(/[^\d+]/g, "");
}

function shortAddress(value) {
  const address = clean(value);
  if (!address) return "-";
  return escapeHtml(address.split(",")[0].slice(0, 46));
}

function wazeUrl(address) {
  return `https://waze.com/ul?q=${encodeURIComponent(address || "")}&navigate=yes`;
}

function formatPrice(value) {
  const number = Number(value || 0);
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(number);
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T00:00:00`));
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function emptyState(message) {
  return `<div class="empty">${message}</div>`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[character]));
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}
