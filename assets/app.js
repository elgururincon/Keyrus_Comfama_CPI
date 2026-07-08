/* ==========================================================================
   App — CPI catalog renderer
   ========================================================================== */
(function () {
  const D = window.CPI;
  if (!D) return;

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const el = (tag, attrs = {}, ...children) => {
    const n = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === "class") n.className = v;
      else if (k === "html") n.innerHTML = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    });
    children.flat().forEach(c => {
      if (c == null) return;
      n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return n;
  };

  const roleBadge = role => ({
    orchestrator: "b-orchestrator",
    worker:       "b-worker",
    query:        "b-query",
    scheduled:    "b-scheduled",
    ingestion:    "b-ingestion",
  }[role] || "");

  let activeRole = "all";

  /* ── Toast ── */
  let _toastTimer;
  function showToast(msg) {
    const t = $("#toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => t.classList.remove("show"), 2400);
  }

  /* ── Copy to clipboard ── */
  function copyText(text) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => showToast("Copiado ✓"));
    } else {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;opacity:0;top:0;left:0;";
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      try { document.execCommand("copy"); showToast("Copiado ✓"); } catch (_) {}
      document.body.removeChild(ta);
    }
  }

  function makeCopyBtn(text) {
    const btn = el("button", { class: "copy-btn", type: "button" }, "copiar");
    btn.addEventListener("click", e => { e.stopPropagation(); copyText(text); });
    return btn;
  }

  /* ── Animated counter ── */
  function countUp(target, duration) {
    const val = Number(target.dataset.value);
    const start = performance.now();
    const update = now => {
      const p = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      target.textContent = Math.round(ease * val);
      if (p < 1) requestAnimationFrame(update);
    };
    requestAnimationFrame(update);
  }

  function setupCounters() {
    const els = $$(".metric .value");
    els.forEach(e => { e.dataset.value = e.textContent.trim(); e.textContent = "0"; });
    const metrics = $("#metrics");
    if (!metrics) return;
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) {
        els.forEach((e, i) => setTimeout(() => countUp(e, 1000), i * 80));
        io.disconnect();
      }
    }, { rootMargin: "0px 0px -5% 0px" });
    io.observe(metrics);
  }

  /* ── Scroll progress bar ── */
  function setupScrollProgress() {
    const bar = $("#scroll-progress");
    if (!bar) return;
    const update = () => {
      const max = document.body.scrollHeight - window.innerHeight;
      bar.style.width = (max > 0 ? Math.min((window.scrollY / max) * 100, 100) : 0) + "%";
    };
    window.addEventListener("scroll", update, { passive: true });
    update();
  }

  /* ── Back to top ── */
  function setupBackTop() {
    const btn = $("#back-top");
    if (!btn) return;
    window.addEventListener("scroll", () => {
      btn.classList.toggle("visible", window.scrollY > 500);
    }, { passive: true });
    btn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  }

  /* ── Mobile sidebar ── */
  function setupMobile() {
    const hamburger = $("#hamburger");
    const sidebar   = $(".sidebar");
    const overlay   = $("#sidebar-overlay");
    const closeBtn  = $("#sidebar-close");
    if (!hamburger || !sidebar || !overlay) return;

    function open() {
      sidebar.classList.add("open");
      overlay.classList.add("active");
      document.body.style.overflow = "hidden";
      hamburger.textContent = "× Cerrar";
    }
    function close() {
      sidebar.classList.remove("open");
      overlay.classList.remove("active");
      document.body.style.overflow = "";
      hamburger.textContent = "≡ Menú";
    }

    hamburger.addEventListener("click", () => {
      sidebar.classList.contains("open") ? close() : open();
    });
    overlay.addEventListener("click", close);
    if (closeBtn) closeBtn.addEventListener("click", close);
    $$(".nav a").forEach(a => a.addEventListener("click", close));
  }

  /* ── Combined card + script filter ── */
  function applyCardFilters() {
    const q       = ($("#quick-search")?.value || "").toLowerCase().trim();
    const grid    = $("#flows-grid");
    const counter = $("#search-count");
    let visible   = 0;
    const total   = D.flows.length;

    $$(".js-flow-card").forEach(card => {
      const roleMatch = activeRole === "all" || card.dataset.role === activeRole;
      const textMatch = !q || card.textContent.toLowerCase().includes(q);
      const show      = roleMatch && textMatch;
      card.style.display = show ? "" : "none";
      if (show) visible++;
    });

    // no-results message inside grid
    if (grid) {
      let nr = grid.querySelector(".no-results");
      if (visible === 0) {
        if (!nr) { nr = document.createElement("div"); nr.className = "no-results"; grid.appendChild(nr); }
        nr.textContent = q ? "Sin resultados para \"" + q + "\"" : "Sin iFlows en esta categoría";
      } else {
        nr?.remove();
      }
    }

    // counter below search input
    if (counter) {
      if (q) {
        counter.innerHTML = "<b>" + visible + "</b> de " + total + " iFlows";
        counter.classList.add("active");
      } else {
        counter.classList.remove("active");
      }
    }

    // filter scripts section too
    $$(".scripts-block").forEach(block => {
      block.style.display = (!q || block.textContent.toLowerCase().includes(q)) ? "" : "none";
    });
  }

  function setupSearch() {
    const input = $("#quick-search");
    if (!input) return;
    input.addEventListener("input", applyCardFilters);
    // Escape clears the search
    input.addEventListener("keydown", e => {
      if (e.key === "Escape") {
        input.value = "";
        applyCardFilters();
        input.blur();
      }
    });
  }

  /* ── Keyboard shortcuts ── */
  function setupKeyboard() {
    document.addEventListener("keydown", e => {
      const inInput = e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA";
      if (e.metaKey || e.ctrlKey) return;

      if (!inInput && (e.key === "t" || e.key === "T")) {
        $("#theme-toggle")?.click();
      }
      if (!inInput && (e.key === "/" || e.key === "k" || e.key === "K")) {
        e.preventDefault();
        $("#quick-search")?.focus();
      }
    });
  }

  /* ----- HERO meta ── */
  function renderMeta() {
    const m  = D.meta;
    const dl = $("#meta-grid");
    [
      ["Proyecto",       m.name],
      ["Partner",        m.partner],
      ["Plataforma",     "SAP Cloud Integration"],
      ["Destino",        "Salesforce Sandbox"],
      ["Tenant",         "qacomfama"],
      ["API Salesforce", m.apiVersion],
      ["iFlows",         m.flowsCount],
      ["Canales fuente", "Genesys · Comfama"],
    ].forEach(([k, v]) => {
      dl.appendChild(el("div", {},
        el("dt", {}, k),
        el("dd", {}, String(v)),
      ));
    });
  }

  function renderMetrics() {
    const wrap = $("#metrics");
    D.metrics.forEach(m => {
      wrap.appendChild(el("div", { class: "metric" },
        el("div", { class: "value" }, String(m.value)),
        el("div", { class: "label" }, m.label),
      ));
    });
  }

  /* ----- FLOWS ── */
  function renderFlows() {
    const grid      = $("#flows-grid");
    const filtersEl = $("#flow-filters");

    const roles = ["all", ...Array.from(new Set(D.flows.map(f => f.role)))];
    const roleLabels = {
      all: "Todos", orchestrator: "Orquestador", worker: "Worker",
      query: "Consulta", scheduled: "Programado", ingestion: "Ingesta",
    };

    roles.forEach((r, i) => {
      const b = el("button", {
        class: "filter" + (i === 0 ? " is-active" : ""),
        type: "button",
        "data-role": r,
      }, roleLabels[r] || r);
      b.addEventListener("click", () => {
        $$(".filter", filtersEl).forEach(x => x.classList.remove("is-active"));
        b.classList.add("is-active");
        activeRole = r;
        applyCardFilters();
      });
      filtersEl.appendChild(b);
    });

    D.flows.forEach(f => {
      const card = el("div", {
        class: "card js-flow-card" + (f.highlight ? " is-highlight" : ""),
        "data-role": f.role,
      });

      card.appendChild(el("div", { class: "badges" },
        el("span", { class: "badge " + roleBadge(f.role) }, f.type),
        el("span", { class: "badge" }, f.lines + " líneas"),
      ));
      card.appendChild(el("h3", {}, f.name));
      card.appendChild(el("div", { class: "sub" }, f.participants + " participantes · " + f.scripts + " scripts"));

      card.appendChild(el("div", { class: "endpoint" },
        el("span", { class: "m" }, f.endpoint.method),
        el("span", { class: "path-text" }, f.endpoint.path),
        makeCopyBtn(f.endpoint.path),
      ));

      card.appendChild(el("p", { class: "desc" }, f.description));

      const statRow = el("div", { class: "stat-row" });
      if (f.subprocesses) statRow.appendChild(el("div", {}, el("b", {}, String(f.subprocesses.length)), " sub-procesos"));
      if (f.mappings)     statRow.appendChild(el("div", {}, el("b", {}, String(f.mappings.length)),     " mappings"));
      if (f.receivers)    statRow.appendChild(el("div", {}, el("b", {}, String(f.receivers.length)),    " receivers"));
      if (statRow.children.length) card.appendChild(statRow);

      const det = el("details", { class: "details" });
      det.appendChild(el("summary", {}, "Lógica & técnica"));
      const dc = el("div", { class: "det-content" });

      if (f.logic) {
        dc.appendChild(el("h4", {}, "Lógica del flujo"));
        dc.appendChild(el("ul", {}, ...f.logic.map(l => el("li", {}, l))));
      }
      if (f.receivers) {
        dc.appendChild(el("h4", {}, "Receivers / llamadas externas"));
        dc.appendChild(el("ul", {}, ...f.receivers.map(r => {
          const parts = [el("span", { class: "mono" }, r.name)];
          if (r.method) parts.push(" — ", r.method);
          if (r.auth)   parts.push(" · ", r.auth);
          if (r.to)     parts.push(" → ", el("span", { class: "mono" }, r.to));
          return el("li", {}, ...parts);
        })));
      }
      if (f.subprocesses) {
        dc.appendChild(el("h4", {}, "Sub-procesos"));
        dc.appendChild(el("p", {}, f.subprocesses.join(" · ")));
      }
      if (f.mappings) {
        dc.appendChild(el("h4", {}, "Mappings"));
        dc.appendChild(el("ul", {}, ...f.mappings.map(m => el("li", {}, m))));
      }
      if (f.techniques) {
        dc.appendChild(el("h4", {}, "Componentes CPI"));
        dc.appendChild(el("p", {}, f.techniques.join(" · ")));
      }
      if (f.parameters) {
        dc.appendChild(el("h4", {}, "Parámetros configurables"));
        dc.appendChild(el("ul", {}, ...f.parameters.map(p => el("li", {}, el("span", { class: "mono" }, p)))));
      }

      det.appendChild(dc);
      card.appendChild(det);
      grid.appendChild(card);
    });
  }

  /* ----- SCRIPTS ── */
  function renderScripts() {
    const wrap = $("#scripts-wrap");
    Object.entries(D.scripts).forEach(([flow, scripts]) => {
      const block = el("div", { class: "scripts-block" });
      block.appendChild(el("h3", {}, flow));
      block.appendChild(el("p", { style: "color:var(--silver); font-size:13px; margin-bottom:14px;" },
        scripts.length + " script" + (scripts.length > 1 ? "s" : "") + " Groovy"));
      const ul = el("ul", {});
      scripts.forEach(s => {
        ul.appendChild(el("li", {},
          el("span", { class: "nm" }, s.name),
          el("span", { class: "ds" }, s.purpose),
        ));
      });
      block.appendChild(ul);
      wrap.appendChild(block);
    });
  }

  /* ----- ENDPOINTS table ── */
  function renderEndpoints() {
    const tbody = $("#endpoints-body");
    D.endpoints.forEach(e => {
      const pathCell = el("td", { class: "k" });
      pathCell.appendChild(document.createTextNode(e.path));
      if (e.method !== "Cron") pathCell.appendChild(makeCopyBtn(e.path));

      tbody.appendChild(el("tr", {},
        el("td", { class: "method" }, e.method),
        pathCell,
        el("td", { class: "v" }, e.flow),
        el("td", { class: "v" }, e.purpose),
      ));
    });
  }

  /* ----- EXTERNAL systems ── */
  function renderExternals() {
    const grid = $("#externals-grid");
    D.externalSystems.forEach(s => {
      const card = el("div", { class: "card" });
      card.appendChild(el("div", { class: "badges" },
        el("span", { class: "badge b-endpoint" }, "Sistema externo"),
      ));
      card.appendChild(el("h3", {}, s.name));
      card.appendChild(el("div", { class: "sub" }, s.role));
      card.appendChild(el("div", { class: "details", open: "" },
        el("div", { class: "det-content" },
          s.tenant && s.tenant !== "—" ? el("h4", {}, "Tenant / Host") : null,
          s.tenant && s.tenant !== "—" ? el("p", {}, s.tenant) : null,
          el("h4", {}, "Autenticación"),
          el("p", {}, s.auth),
          el("h4", {}, "Objetos / Recursos"),
          el("p", {}, s.objects),
          el("h4", {}, "APIs usadas"),
          el("p", {}, s.apis),
        ),
      ));
      grid.appendChild(card);
    });
  }

  /* ----- XSDs + Mappings ── */
  function renderXSDs() {
    const tbody = $("#xsds-body");
    D.xsds.forEach(x => {
      tbody.appendChild(el("tr", {},
        el("td", { class: "k" }, x.flow),
        el("td", { class: "k" }, x.name),
        el("td", { class: "v" }, x.purpose),
      ));
    });
  }
  function renderMappings() {
    const tbody = $("#mappings-body");
    D.mappings.forEach(m => {
      tbody.appendChild(el("tr", {},
        el("td", { class: "k" }, m.flow),
        el("td", { class: "k" }, m.name),
        el("td", { class: "v" }, m.desc),
      ));
    });
  }

  /* ----- PARAMETERS ── */
  function renderParameters() {
    const wrap = $("#parameters-wrap");
    D.parameters.forEach(group => {
      const block = el("div", { class: "scripts-block" });
      block.appendChild(el("h3", {}, group.flow));
      const ul = el("ul", {});
      group.params.forEach(p => {
        ul.appendChild(el("li", {},
          el("span", { class: "nm" }, p.k),
          el("span", { class: "ds" },
            el("span", { class: "mono", style: "color:var(--paper);" }, p.v || ""),
            " — ", p.desc,
          ),
        ));
      });
      block.appendChild(ul);
      wrap.appendChild(block);
    });
  }

  /* ----- Scrollspy ── */
  function setupScrollspy() {
    const links    = $$(".nav a[href^='#']");
    const sections = links.map(a => document.getElementById(a.getAttribute("href").slice(1))).filter(Boolean);
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          const id = e.target.id;
          links.forEach(l => l.classList.toggle("is-active", l.getAttribute("href") === "#" + id));
        }
      });
    }, { rootMargin: "-30% 0px -60% 0px" });
    sections.forEach(s => io.observe(s));
  }

  /* ----- Reveal on scroll ── */
  function setupReveal() {
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      });
    }, { rootMargin: "0px 0px -10% 0px" });
    $$(".reveal").forEach(s => io.observe(s));
  }

  /* ----- Bootstrap ── */
  document.addEventListener("DOMContentLoaded", () => {
    renderMeta();
    renderMetrics();
    renderFlows();
    renderScripts();
    renderEndpoints();
    renderExternals();
    renderXSDs();
    renderMappings();
    renderParameters();
    setupScrollspy();
    setupReveal();
    setupScrollProgress();
    setupBackTop();
    setupCounters();
    setupMobile();
    setupSearch();
    setupKeyboard();
  });
})();
