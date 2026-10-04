"use strict";

(() => {
  const STORAGE_KEY = "brian-shagaya-portfolio-demos-v1";
  const EMAIL = "shagayabrian899@gmail.com";
  const STATUSES = ["New", "In progress", "Resolved"];
  const PRIORITIES = ["Low", "Medium", "High"];
  const CATEGORIES = ["Network", "Software", "Account", "Hardware", "Other"];
  const seedTickets = [
    { id: 1001, title: "Office Wi-Fi connection", category: "Network", priority: "High", status: "In progress", description: "Practice scenario: a workstation is connected to Wi-Fi but cannot reach a website. Investigate the connection before changing settings.", notes: "1. Check whether other websites and devices are affected.\n2. Confirm connection and IP settings.\n3. Record findings and test the connection after each change." },
    { id: 1002, title: "Browser performance", category: "Software", priority: "Medium", status: "New", description: "Practice scenario: a browser feels slow and several tabs are unresponsive. Identify the scope of the issue and document a suitable next step.", notes: "Ask when the slowdown started and which sites are affected. Review open tabs, resource use and recently added extensions." },
    { id: 1003, title: "Account access guidance", category: "Account", priority: "Low", status: "Resolved", description: "Practice scenario: a user needs help finding the approved account recovery process.", notes: "Guided the sample user to the approved recovery process. No passwords collected. Sample resolution recorded for this demo." }
  ];
  const seedTasks = [
    { id: 1, title: "Review project requirements", priority: "Medium", done: true },
    { id: 2, title: "Build responsive layout", priority: "High", done: false },
    { id: 3, title: "Test keyboard navigation", priority: "High", done: false },
    { id: 4, title: "Write project notes", priority: "Low", done: true }
  ];
  const questions = [
    { prompt: "What is printed by this expression?", code: "console.log(2 + 3 * 4);", options: ["20", "14", "24", "9"], correct: 1, explanation: "Multiplication happens first: 3 × 4 is 12, then 2 + 12 is 14." },
    { prompt: "What is the length of this array?", code: "const tasks = ['Set up', 'Test', 'Document'];\nconsole.log(tasks.length);", options: ["2", "3", "4", "undefined"], correct: 1, explanation: "The array contains three elements. The length property returns 3." },
    { prompt: "What does strict equality return here?", code: "console.log('5' === 5);", options: ["true", "false", "5", "An error"], correct: 1, explanation: "Strict equality compares types as well as values. A string and a number are different types, so the result is false." },
    { prompt: "Which value is accessed from this object?", code: "const user = { name: 'Brian' };\nconsole.log(user.name);", options: ["name", "undefined", "Brian", "user"], correct: 2, explanation: "Dot notation reads the name property from the object. Its value is the string Brian." },
    { prompt: "What array does map create?", code: "const numbers = [1, 2, 3];\nconsole.log(numbers.map(n => n * 2));", options: ["[1, 2, 3]", "[2, 4, 6]", "[1, 4, 9]", "[2, 3, 4]"], correct: 1, explanation: "map applies the function to each element and creates a new array. Doubling each value gives [2, 4, 6]." }
  ];
  const copy = value => JSON.parse(JSON.stringify(value));
  const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  let storageAvailable = true;
  const initialState = () => ({ tickets: copy(seedTickets), tasks: copy(seedTasks) });
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return initialState();
      const saved = JSON.parse(raw);
      if (!Array.isArray(saved.tickets) || !Array.isArray(saved.tasks)) return initialState();
      const tickets = saved.tickets.filter(t => t && Number.isSafeInteger(t.id) && t.id > 0 && typeof t.title === "string" && STATUSES.includes(t.status) && PRIORITIES.includes(t.priority) && CATEGORIES.includes(t.category)).slice(0, 100).map(t => ({ id: t.id, title: t.title.slice(0, 120), category: t.category, priority: t.priority, status: t.status, description: String(t.description || "").slice(0, 1200), notes: String(t.notes || "").slice(0, 3000) }));
      const tasks = saved.tasks.filter(t => t && Number.isSafeInteger(t.id) && t.id > 0 && typeof t.title === "string" && PRIORITIES.includes(t.priority)).slice(0, 200).map(t => ({ id: t.id, title: t.title.slice(0, 160), priority: t.priority, done: Boolean(t.done) }));
      return { tickets, tasks };
    } catch { storageAvailable = false; return initialState(); }
  }
  let state = loadState();
  const dialog = document.getElementById("demo-dialog");
  const demoBody = document.getElementById("demo-body");
  const demoTitle = document.getElementById("demo-title");
  const demoDescription = document.getElementById("demo-description");
  const demoStatus = document.getElementById("demo-status");
  const siteStatus = document.getElementById("site-status");
  const storageNote = document.getElementById("storage-note");
  let currentDemo = null;
  let selectedTicket = state.tickets[0]?.id ?? null;
  let supportFilter = "All";
  let supportSearch = "";
  let newTicketMode = false;
  let taskFilter = "All";
  let quizAnswers = {};
  let quizSubmitted = false;
  let messageTimer;

  function updateStorageNote() {
    storageNote.textContent = currentDemo === "quiz" ? "Practice quiz · Answers stay in this page session" : storageAvailable ? "Sample data · Saved only in this browser" : "Sample data · Browser saving unavailable; changes last for this page session";
  }
  function announce(message) {
    clearTimeout(messageTimer);
    if (dialog.open) demoStatus.textContent = message;
    else siteStatus.textContent = message;
    messageTimer = setTimeout(() => { demoStatus.textContent = ""; siteStatus.textContent = ""; }, 4500);
  }
  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); storageAvailable = true; }
    catch { storageAvailable = false; }
    updateStorageNote();
    return storageAvailable;
  }
  const statusClass = status => ({ New: "status-new", "In progress": "status-progress", Resolved: "status-resolved" }[status]);
  const priorityClass = priority => ({ Low: "priority-low", Medium: "priority-medium", High: "priority-high" }[priority]);
  const optionsHtml = (values, selected) => values.map(value => `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>${escapeHtml(value)}</option>`).join("");
  const nextId = records => Math.max(0, ...records.map(record => record.id)) + 1;

  function updateHero() {
    const tickets = state.tickets.slice(0, 3);
    const holder = document.getElementById("hero-tickets");
    if (!tickets.length) { holder.innerHTML = '<p class="demo-help" style="padding:25px 0;color:#b9d0d0">Open the workspace to create a sample ticket.</p>'; return; }
    holder.innerHTML = tickets.map(ticket => `<button class="workspace-ticket" type="button" data-demo="support" data-ticket="${ticket.id}"><span><small>#${ticket.id} · ${escapeHtml(ticket.category.toUpperCase())}</small>${escapeHtml(ticket.title)}</span><span class="status-pill ${statusClass(ticket.status)}">${escapeHtml(ticket.status)}</span></button>`).join("");
  }
  function filteredTickets() {
    const search = supportSearch.trim().toLowerCase();
    return state.tickets.filter(ticket => (supportFilter === "All" || ticket.status === supportFilter) && (!search || `${ticket.id} ${ticket.title} ${ticket.category}`.toLowerCase().includes(search)));
  }
  function ticketListHtml() {
    const tickets = filteredTickets();
    if (!tickets.length) return '<div class="empty-state">No tickets match your search.<br>Try another filter or create a ticket.</div>';
    return tickets.map(ticket => `<button class="ticket-row ${ticket.id === selectedTicket ? "selected" : ""}" type="button" data-action="select-ticket" data-id="${ticket.id}" aria-pressed="${ticket.id === selectedTicket}"><span class="ticket-row-top"><span>#${ticket.id}</span><span>${escapeHtml(ticket.category)}</span></span><span class="ticket-row-title">${escapeHtml(ticket.title)}</span><span class="ticket-row-bottom"><span class="status-pill ${statusClass(ticket.status)}">${escapeHtml(ticket.status)}</span><span>${escapeHtml(ticket.priority)} priority</span></span></button>`).join("");
  }
  function ticketDetailHtml() {
    const ticket = state.tickets.find(item => item.id === selectedTicket);
    if (!ticket) return '<div class="empty-state">Select a ticket to review its details.</div>';
    return `<div class="ticket-id-label">TICKET #${ticket.id}</div><h3>${escapeHtml(ticket.title)}</h3><p class="ticket-description">${escapeHtml(ticket.description)}</p><div class="detail-controls"><label><span class="field-label">Status</span><select id="ticket-status" aria-label="Ticket status">${optionsHtml(STATUSES, ticket.status)}</select></label><div class="detail-meta">${escapeHtml(ticket.category)} · ${escapeHtml(ticket.priority)} priority</div></div><label for="ticket-notes" class="field-label">Troubleshooting notes</label><textarea id="ticket-notes" maxlength="3000" placeholder="Record what you checked and what happened...">${escapeHtml(ticket.notes)}</textarea><div class="detail-actions"><button type="button" class="button demo-secondary demo-small-button" data-action="save-notes">Save notes</button><button type="button" class="button button-primary demo-small-button" data-action="resolve-ticket">${ticket.status === "Resolved" ? "Reopen ticket" : "Mark resolved"}</button></div>`;
  }
  function renderSupport() {
    if (newTicketMode) {
      demoBody.innerHTML = `<form id="new-ticket-form" class="new-ticket-form"><h3>Create a sample ticket</h3><p class="form-intro">Describe an IT issue and choose a category and priority.</p><div class="form-field"><label class="field-label" for="new-ticket-title">Issue title</label><input id="new-ticket-title" name="title" type="text" required minlength="3" maxlength="120" placeholder="For example, printer connection issue"></div><div class="form-grid"><div class="form-field"><label class="field-label" for="new-ticket-category">Category</label><select name="category" id="new-ticket-category">${optionsHtml(CATEGORIES, "Software")}</select></div><div class="form-field"><label class="field-label" for="new-ticket-priority">Priority</label><select name="priority" id="new-ticket-priority">${optionsHtml(PRIORITIES, "Medium")}</select></div></div><div class="form-field"><label class="field-label" for="new-ticket-description">Issue description</label><textarea id="new-ticket-description" name="description" required minlength="5" maxlength="1200" placeholder="What is happening, and what have you already tried?"></textarea></div><div class="detail-actions"><button class="button button-primary" type="submit">Create ticket</button><button class="button demo-secondary" type="button" data-action="cancel-ticket">Cancel</button></div></form>`;
      return;
    }
    demoBody.innerHTML = `<div class="demo-toolbar"><input type="search" id="ticket-search" placeholder="Search tickets..." aria-label="Search tickets" value="${escapeHtml(supportSearch)}"><select id="support-filter" aria-label="Filter tickets by status">${optionsHtml(["All", ...STATUSES], supportFilter)}</select><button class="button button-primary demo-small-button" type="button" data-action="new-ticket">New ticket</button></div><div class="support-layout"><div class="ticket-list" id="ticket-list">${ticketListHtml()}</div><section class="ticket-detail" id="ticket-detail" aria-label="Selected ticket details">${ticketDetailHtml()}</section></div><div class="demo-reset-row"><span class="demo-help">Practice triage, notes and resolution in one place.</span><button type="button" class="reset-link" data-action="reset-support">Reset sample tickets</button></div>`;
  }
  function refreshTicketPanels() {
    const list = document.getElementById("ticket-list");
    const detail = document.getElementById("ticket-detail");
    if (list) list.innerHTML = ticketListHtml();
    if (detail) detail.innerHTML = ticketDetailHtml();
  }
  function taskListHtml() {
    const tasks = state.tasks.filter(task => taskFilter === "All" || (taskFilter === "Active" ? !task.done : task.done));
    if (!tasks.length) return `<li class="empty-state">${state.tasks.length ? "No tasks in this view. Choose another filter." : "No tasks yet. Add your first task above."}</li>`;
    return tasks.map(task => `<li class="task-row ${task.done ? "complete" : ""}"><label><input type="checkbox" data-task-id="${task.id}" ${task.done ? "checked" : ""}><span>${escapeHtml(task.title)}</span></label><span class="task-priority ${priorityClass(task.priority)}">${escapeHtml(task.priority.toUpperCase())}</span><button type="button" class="task-delete" data-action="delete-task" data-id="${task.id}" aria-label="Delete task: ${escapeHtml(task.title)}">×</button></li>`).join("");
  }
  function renderTasks() {
    const completed = state.tasks.filter(task => task.done).length;
    const total = state.tasks.length;
    const progress = total ? Math.round(completed / total * 100) : 0;
    demoBody.innerHTML = `<form class="task-add-form" id="task-add-form"><input type="text" name="title" required maxlength="160" aria-label="New task title" placeholder="What needs to get done?"><select name="priority" aria-label="Task priority">${optionsHtml(PRIORITIES, "Medium")}</select><button class="button button-primary demo-small-button" type="submit">Add task</button></form><div class="task-summary"><span>${completed} of ${total} tasks complete</span><div class="filter-buttons" aria-label="Task filters">${["All", "Active", "Completed"].map(filter => `<button type="button" class="filter-button ${filter === taskFilter ? "active" : ""}" data-action="task-filter" data-filter="${filter}" aria-pressed="${filter === taskFilter}">${filter}</button>`).join("")}</div></div><div class="task-progress" role="progressbar" aria-label="Task completion" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}"><span style="width:${progress}%"></span></div><ul class="task-list">${taskListHtml()}</ul><div class="demo-reset-row"><span class="demo-help">Tasks and progress are saved in this browser.</span><button type="button" class="reset-link" data-action="reset-tasks">Reset sample tasks</button></div>`;
  }
  function quizScore() { return questions.reduce((score, question, index) => score + (quizAnswers[index] === question.correct ? 1 : 0), 0); }
  function renderQuiz() {
    const score = quizScore();
    demoBody.innerHTML = `${quizSubmitted ? `<div class="quiz-score"><div><h3>${score} / ${questions.length}</h3><p>${score === questions.length ? "All answers correct. Nicely done." : "Review the explanations below and try again."}</p></div><button class="button demo-secondary demo-small-button" type="button" data-action="retry-quiz">Try again</button></div>` : '<p class="quiz-intro">Read each JavaScript snippet and choose its output. Submit all five answers to see your score and explanations.</p>'}<form id="quiz-form">${questions.map((question, index) => `<fieldset class="quiz-question"><legend><span class="question-number">0${index + 1}</span>${escapeHtml(question.prompt)}</legend><pre class="question-code"><code>${escapeHtml(question.code)}</code></pre><div class="answer-options">${question.options.map((option, optionIndex) => `<label class="answer-option ${quizSubmitted && optionIndex === question.correct ? "correct" : ""} ${quizSubmitted && optionIndex === quizAnswers[index] && optionIndex !== question.correct ? "incorrect" : ""}"><input type="radio" name="q${index}" value="${optionIndex}" ${quizAnswers[index] === optionIndex ? "checked" : ""} ${quizSubmitted ? "disabled" : "required"}>${escapeHtml(option)}</label>`).join("")}</div>${quizSubmitted ? `<p class="answer-feedback ${quizAnswers[index] === question.correct ? "" : "wrong"}"><strong>${quizAnswers[index] === question.correct ? "Correct." : `Correct answer: ${escapeHtml(question.options[question.correct])}.`}</strong> ${escapeHtml(question.explanation)}</p>` : ""}</fieldset>`).join("")}${quizSubmitted ? "" : '<div class="quiz-actions"><button type="submit" class="button button-primary">Submit answers</button><span class="quiz-error" id="quiz-error" role="alert"></span></div>'}</form>`;
  }
  function openDemo(type, ticketId) {
    if (!["support", "tasks", "quiz"].includes(type)) return;
    currentDemo = type;
    demoStatus.textContent = "";
    if (type === "support") {
      newTicketMode = false;
      if (ticketId && state.tickets.some(ticket => ticket.id === ticketId)) selectedTicket = ticketId;
      demoTitle.textContent = "Support ticket workspace";
      demoDescription.textContent = "Review sample issues, record notes and track their status.";
      renderSupport();
    } else if (type === "tasks") {
      demoTitle.textContent = "Personal task planner";
      demoDescription.textContent = "Create, prioritise and complete tasks in a simple workspace.";
      renderTasks();
    } else {
      demoTitle.textContent = "Programming assessment";
      demoDescription.textContent = "A five-question JavaScript quiz with automatic marking.";
      renderQuiz();
    }
    updateStorageNote();
    dialog.showModal();
    document.body.classList.add("modal-open");
    dialog.scrollTop = 0;
  }
  document.addEventListener("click", event => {
    const button = event.target.closest?.("[data-demo]");
    if (button) openDemo(button.dataset.demo, Number(button.dataset.ticket) || null);
  });
  document.getElementById("close-demo").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => { document.body.classList.remove("modal-open"); currentDemo = null; demoStatus.textContent = ""; });
  dialog.addEventListener("click", event => { if (event.target === dialog) { const box = dialog.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close(); } });

  demoBody.addEventListener("click", event => {
    const button = event.target.closest?.("[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    if (action === "select-ticket") { selectedTicket = Number(button.dataset.id); refreshTicketPanels(); }
    else if (action === "new-ticket") { newTicketMode = true; renderSupport(); document.getElementById("new-ticket-title").focus(); }
    else if (action === "cancel-ticket") { newTicketMode = false; renderSupport(); }
    else if (action === "save-notes") {
      const ticket = state.tickets.find(item => item.id === selectedTicket);
      if (!ticket) return;
      ticket.notes = document.getElementById("ticket-notes").value.slice(0, 3000);
      announce(saveState() ? "Notes saved in this browser." : "Notes updated for this page session.");
    } else if (action === "resolve-ticket") {
      const ticket = state.tickets.find(item => item.id === selectedTicket);
      if (!ticket) return;
      ticket.notes = document.getElementById("ticket-notes").value.slice(0, 3000);
      ticket.status = ticket.status === "Resolved" ? "New" : "Resolved";
      saveState(); refreshTicketPanels(); updateHero(); announce(`Ticket #${ticket.id} ${ticket.status === "Resolved" ? "resolved" : "reopened"}.`);
    } else if (action === "reset-support") {
      state.tickets = copy(seedTickets); selectedTicket = 1001; supportFilter = "All"; supportSearch = "";
      saveState(); renderSupport(); updateHero(); announce("Sample tickets restored.");
    } else if (action === "task-filter") { taskFilter = button.dataset.filter; renderTasks(); demoBody.querySelector(`[data-filter="${taskFilter}"]`).focus(); }
    else if (action === "delete-task") { state.tasks = state.tasks.filter(task => task.id !== Number(button.dataset.id)); saveState(); renderTasks(); announce("Task removed."); }
    else if (action === "reset-tasks") { state.tasks = copy(seedTasks); taskFilter = "All"; saveState(); renderTasks(); announce("Sample tasks restored."); }
    else if (action === "retry-quiz") { quizAnswers = {}; quizSubmitted = false; renderQuiz(); dialog.scrollTop = 0; announce("Quiz ready for another attempt."); }
  });
  demoBody.addEventListener("input", event => {
    if (event.target.id === "ticket-search") {
      supportSearch = event.target.value;
      const list = document.getElementById("ticket-list");
      if (list) list.innerHTML = ticketListHtml();
    }
  });
  demoBody.addEventListener("change", event => {
    const target = event.target;
    if (target.id === "support-filter") { supportFilter = target.value; renderSupport(); document.getElementById("support-filter").focus(); }
    else if (target.id === "ticket-status") {
      const ticket = state.tickets.find(item => item.id === selectedTicket);
      if (!ticket || !STATUSES.includes(target.value)) return;
      ticket.notes = document.getElementById("ticket-notes").value.slice(0, 3000);
      ticket.status = target.value; saveState(); refreshTicketPanels(); updateHero(); document.getElementById("ticket-status").focus(); announce("Ticket status updated.");
    } else if (target.matches("[data-task-id]")) {
      const task = state.tasks.find(item => item.id === Number(target.dataset.taskId));
      if (!task) return;
      task.done = target.checked; saveState(); renderTasks();
      const checkbox = demoBody.querySelector(`[data-task-id="${task.id}"]`);
      if (checkbox) checkbox.focus();
      else demoBody.querySelector(`[data-filter="${taskFilter}"]`).focus();
      announce(task.done ? "Task completed." : "Task marked active.");
    } else if (currentDemo === "quiz" && /^q[0-4]$/.test(target.name)) {
      quizAnswers[Number(target.name.slice(1))] = Number(target.value);
    }
  });
  demoBody.addEventListener("submit", event => {
    event.preventDefault();
    const form = event.target;
    if (!form.checkValidity()) { form.reportValidity(); return; }
    const data = new FormData(form);
    if (form.id === "new-ticket-form") {
      const title = String(data.get("title") || "").trim();
      const description = String(data.get("description") || "").trim();
      if (title.length < 3 || description.length < 5) { announce("Enter a title and a clear issue description."); return; }
      if (state.tickets.length >= 100) { announce("Demo limit reached. Reset the sample tickets to continue."); return; }
      const ticket = { id: Math.max(1000, nextId(state.tickets)), title: title.slice(0, 120), description: description.slice(0, 1200), category: CATEGORIES.includes(data.get("category")) ? data.get("category") : "Other", priority: PRIORITIES.includes(data.get("priority")) ? data.get("priority") : "Medium", status: "New", notes: "" };
      state.tickets.unshift(ticket); selectedTicket = ticket.id; newTicketMode = false; supportFilter = "All"; supportSearch = "";
      saveState(); renderSupport(); updateHero(); announce(`Sample ticket #${ticket.id} created.`);
    } else if (form.id === "task-add-form") {
      const title = String(data.get("title") || "").trim();
      if (!title) { announce("Enter a task title."); return; }
      if (state.tasks.length >= 200) { announce("Demo limit reached. Reset the sample tasks to continue."); return; }
      state.tasks.unshift({ id: nextId(state.tasks), title: title.slice(0, 160), priority: PRIORITIES.includes(data.get("priority")) ? data.get("priority") : "Medium", done: false });
      taskFilter = "All"; saveState(); renderTasks(); demoBody.querySelector('[name="title"]').focus(); announce("Task added.");
    } else if (form.id === "quiz-form") {
      for (let i = 0; i < questions.length; i++) {
        const value = data.get(`q${i}`);
        if (value === null) { document.getElementById("quiz-error").textContent = "Answer all five questions before submitting."; return; }
        quizAnswers[i] = Number(value);
      }
      quizSubmitted = true; renderQuiz(); dialog.scrollTop = 0; announce(`Score: ${quizScore()} out of ${questions.length}.`);
    }
  });
  document.getElementById("copy-email").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(EMAIL); announce("Email address copied."); }
    catch { announce("Copy unavailable. Select the email address to copy it, or use Email Brian."); }
  });
  updateHero();
  updateStorageNote();
})();
