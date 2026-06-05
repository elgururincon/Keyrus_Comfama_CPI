# Comfama · CPI — Catálogo de iFlows

Sitio estático interactivo que resume los 8 iFlows del proyecto de integración omnicanal
de Comfama sobre **SAP Cloud Integration** (Salesforce ↔ Genesys ↔ sistemas internos).

## Contenido del repo

```
.
├── index.html          # Página única
├── netlify.toml        # Headers + cache (deploy en Netlify)
├── assets/
│   ├── style.css
│   ├── app.js          # Renderiza todo desde data.js
│   └── data.js         # CATÁLOGO COMPLETO de iFlows (editar aquí)
└── README.md
```

Todo el contenido vive en `assets/data.js`. Para añadir un iFlow nuevo o
editar un script, abres ese archivo y modificas el array correspondiente
(`FLOWS`, `SCRIPTS_BY_FLOW`, `ENDPOINTS`, `EXTERNAL_SYSTEMS`, `XSDS`,
`MAPPINGS`, `PARAMETERS`).

## Cómo trabajar en VS Code

```bash
git clone https://github.com/elgururincon/Keyrus_Comfama_CPI_Resume.git
cd Keyrus_Comfama_CPI_Resume
code .
```

Para previsualizar localmente:

```bash
# Python
python3 -m http.server 8000

# Node
npx serve .
```

Abrir http://localhost:8000

> **Tip:** instala la extensión **Live Server** en VS Code y simplemente
> haz click derecho en `index.html` → *Open with Live Server*. Cada vez
> que guardes un archivo, el navegador se recarga.

## Deploy en Netlify

### Conectar el repo (recomendado — auto-deploy)

1. Netlify → *Add new site* → *Import an existing project*.
2. Selecciona este repo.
3. Build command: *(en blanco)* · Publish directory: `.`
4. Cada push a `main` redespliega automáticamente.

### Drag & drop puntual

1. Descarga el repo como ZIP (botón verde *Code* en GitHub → Download ZIP).
2. **Descomprime y selecciona los archivos del repo** (no la carpeta).
3. Arrastra a https://app.netlify.com/drop

## Estructura del catálogo

8 iFlows clasificados por rol:

| Rol            | iFlow                              | Endpoint                          |
|----------------|------------------------------------|-----------------------------------|
| Orquestador    | Omnicanalidad_Root                 | `/Account_Cases_Root`             |
| Worker         | Comfama_Customers                  | `/Create_Account`                 |
| Worker         | Comfama_Contact_C                  | `/Create_Contact`                 |
| Worker         | Comfama_Cases                      | `/CreateCases`                    |
| Programado     | Comfama_Cases_Anexos_Worker        | Cron `0 * * * * ?`                |
| Ingesta        | Comfama_Interacciones              | `/v2/genesys/interacciones`       |
| Consulta       | Consulta_de_Clientes               | `/v1/clientes/consulta`           |
| Consulta       | Consulta_de_casos                  | `/v2/casos/consulta`              |

## Stack

- HTML + CSS + JS vanilla. Sin build, sin dependencias.
- Tipografías Fraunces / Inter Tight / JetBrains Mono.
- Diagrama de arquitectura inline SVG.
- Filtros, scrollspy y reveal-on-scroll.
