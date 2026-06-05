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
    worker: "b-worker",
    query: "b-query",
    scheduled: "b-scheduled",
    ingestion: "b-ingestion",
  }[role] || "");

  /* ----- HERO meta */
  function renderMeta() {
    const m = D.meta;
    const dl = $("#meta-grid");
    [
      ["Proyecto", m.name],
      ["Partner", m.partner],
      ["Plataforma", "SAP Cloud Integration"],
      ["Destino", "Salesforce Sandbox"],
      ["Tenant", "qacomfama"],
      ["API Salesforce", m.apiVersion],
      ["iFlows", m.flowsCount],
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

  /* ----- FLOWS */
  function renderFlows() {
    const grid = $("#flows-grid");

    // filters
    const filtersEl = $("#flow-filters");
    const roles = ["all", ...Array.from(new Set(D.flows.map(f => f.role)))];
    const roleLabels = { all: "Todos", orchestrator: "Orquestador", worker: "Worker", query: "Consulta", scheduled: "Programado", ingestion: "Ingesta" };
    roles.forEach((r, i) => {
      const b = el("button", {
        class: "filter" + (i === 0 ? " is-active" : ""),
        type: "button",
      }, roleLabels[r] || r);
      b.addEventListener("click", () => {
        $$(".filter", filtersEl).forEach(x => x.classList.remove("is-active"));
        b.classList.add("is-active");
        $$(".js-flow-card", grid).forEach(card => {
          card.style.display = (r === "all" || card.dataset.role === r) ? "" : "none";
        });
      });
      filtersEl.appendChild(b);
    });

    D.flows.forEach(f => {
      const card = el("div", {
        class: "card js-flow-card" + (f.highlight ? " is-highlight" : ""),
        "data-role": f.role,
      });

      card.appendChild(el("div", { class: "badges" },
        el("span", { class: `badge ${roleBadge(f.role)}` }, f.type),
        el("span", { class: "badge" }, `${f.lines} líneas`),
      ));
      card.appendChild(el("h3", {}, f.name));
      card.appendChild(el("div", { class: "sub" }, `${f.participants} participantes · ${f.scripts} scripts`));

      card.appendChild(el("div", { class: "endpoint" },
        el("span", { class: "m" }, f.endpoint.method),
        f.endpoint.path,
      ));

      card.appendChild(el("p", { class: "desc" }, f.description));

      // stat row
      const statRow = el("div", { class: "stat-row" });
      if (f.subprocesses) statRow.appendChild(el("div", {}, el("b", {}, String(f.subprocesses.length)), " sub-procesos"));
      if (f.mappings)     statRow.appendChild(el("div", {}, el("b", {}, String(f.mappings.length)),     " mappings"));
      if (f.receivers)    statRow.appendChild(el("div", {}, el("b", {}, String(f.receivers.length)),    " receivers"));
      if (statRow.children.length) card.appendChild(statRow);

      // details
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

  /* ----- SCRIPTS by flow */
  function renderScripts() {
    const wrap = $("#scripts-wrap");
    Object.entries(D.scripts).forEach(([flow, scripts]) => {
      const block = el("div", { class: "scripts-block" });
      block.appendChild(el("h3", {}, flow));
      block.appendChild(el("p", { style: "color:var(--silver); font-size:13px; margin-bottom:14px;" },
        `${scripts.length} script${scripts.length>1 ? "s" : ""} Groovy`));
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

  /* ----- ENDPOINTS table */
  function renderEndpoints() {
    const tbody = $("#endpoints-body");
    D.endpoints.forEach(e => {
      tbody.appendChild(el("tr", {},
        el("td", { class: "method" }, e.method),
        el("td", { class: "k" }, e.path),
        el("td", { class: "v" }, e.flow),
        el("td", { class: "v" }, e.purpose),
      ));
    });
  }

  /* ----- EXTERNAL systems */
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

  /* ----- XSDs and mappings tables */
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

  /* ----- PARAMETERS */
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

  /* ----- Scrollspy + reveal */
  function setupScrollspy() {
    const links = $$(".nav a[href^='#']");
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
  function setupReveal() {
    const els = $$(".reveal");
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      });
    }, { rootMargin: "0px 0px -10% 0px" });
    els.forEach(s => io.observe(s));
  }

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
  });
})();
