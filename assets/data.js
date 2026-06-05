/* ==========================================================================
   Catálogo de iFlows — SAP Cloud Integration (CPI) · Proyecto Comfama
   Omnicanalidad C4C ↔ Salesforce ↔ Genesys
   ========================================================================== */

const PROJECT_META = {
  name: "Comfama · Integración Omnicanal",
  partner: "Keyrus",
  platform: "SAP Integration Suite — Cloud Integration (CPI)",
  primaryTarget: "Salesforce Sandbox (qacomfama · efficiency-enterprise-8418)",
  apiVersion: "v59.0",
  flowsCount: 8,
  scenario: "Orquestación omnicanal entre canales de atención (Genesys, formularios, sistemas internos) y Salesforce CRM como fuente única de Accounts, Contacts y Cases.",
};

const METRICS = [
  { label: "iFlows desplegados",         value: 8 },
  { label: "Scripts Groovy",             value: 47 },
  { label: "Message Mappings",           value: 8 },
  { label: "XSDs",                       value: 17 },
  { label: "Endpoints HTTPS expuestos",  value: 6 },
  { label: "Llamadas a Salesforce",      value: 23 },
  { label: "Receivers / sub-procesos",   value: 64 },
];

/* ==========================================================================
   FLOWS
   ========================================================================== */
const FLOWS = [
  {
    id: "omnicanalidad-root",
    name: "Omnicanalidad_Root",
    role: "orchestrator",
    type: "Orquestador",
    description: "Único punto de entrada HTTPS para el ecosistema. Recibe un payload combinado con Account, Contact y Case, lo valida, y dispara secuencialmente los 3 sub-flows usando ProcessDirect.",
    endpoint: { method: "POST", path: "/Account_Cases_Root", protocol: "HTTPS" },
    lines: 1691,
    participants: 8,
    scripts: 3,
    receivers: [
      { name: "Accounts (ProcessDirect)",  to: "/CreateAccounts → Comfama_Customers" },
      { name: "Contacts (ProcessDirect)",  to: "/CreateContact → Comfama_Contact_C" },
      { name: "Cases (ProcessDirect)",     to: "/CreateCases → Comfama_Cases" },
    ],
    logic: [
      "Valida campos obligatorios del payload (Account.Tipo_de_Identificacion__c, Account.Numero_de_Identificacion__c, Case.Subject, Case.Type, Case.Case_Origin…).",
      "Si Account.Empresa = true, exige el bloque Contact.",
      "Llama Accounts; captura AccountID y lo propaga.",
      "Si hay Contact, llama Contacts inyectando AccountID; captura ContactID.",
      "Llama Cases inyectando AccountID y opcionalmente ContactID.",
      "Devuelve la respuesta consolidada al sender.",
    ],
    techniques: ["JsonToXmlConverter", "Enricher (×11)", "ExternalCall (×3)", "Script (×3)", "ProcessCallElement (×3)"],
    highlight: true,
  },

  {
    id: "comfama-customers",
    name: "Comfama_Customers",
    role: "worker",
    type: "Worker · Accounts",
    description: "Servicio de creación y actualización de Accounts en Salesforce. Decide entre crear empresa, crear cliente persona, o actualizar uno existente según el flag Account.Empresa y la búsqueda previa por NIT.",
    endpoint: { method: "POST", path: "/CreateAccounts (ProcessDirect) · /Create_Account (HTTPS)", protocol: "HTTPS + ProcessDirect" },
    lines: 4685,
    participants: 16,
    scripts: 10,
    subprocesses: ["Cliente nuevo", "Empresa nuevo", "Actualiza Cliente", "Actualiza Empresa", "GetToken", "General"],
    mappings: ["Cliente Map", "Actualiza Cliente Map", "Actualiza Empresa Map", "Message Mapping 3"],
    receivers: [
      { name: "Salesforce OAuth Token", method: "POST", auth: "Basic ({{Token_credentials}})" },
      { name: "Salesforce Query (SOQL)", method: "GET" },
      { name: "Salesforce Account Create", method: "POST" },
      { name: "Salesforce Account Update", method: "PATCH" },
    ],
    logic: [
      "Obtiene token OAuth2 contra /services/oauth2/token con Basic Auth (credencial SF_User_Keyrus).",
      "Consulta por Tipo + Número de Identificación si el cliente ya existe.",
      "Bifurca: crear (POST sobjects/Account) o actualizar (PATCH sobjects/Account/{Id}).",
      "Soporta 4 caminos: Cliente nuevo / Empresa nueva / Actualiza Cliente / Actualiza Empresa con su propio mapping cada uno.",
      "Captura el body del Receiver para parsear errores Salesforce (errorCode, fields, message) cuando hay falla.",
    ],
    techniques: ["Mapping (×4)", "ExternalCall (×6)", "ErrorEventSubProcess (×5)", "JsonToXmlConverter (×5)", "Enricher (×22)"],
    highlight: true,
  },

  {
    id: "comfama-contact",
    name: "Comfama_Contact_C",
    role: "worker",
    type: "Worker · Contacts",
    description: "Servicio de creación y actualización de Contacts asociados a Accounts ya existentes. Distingue 'Create Contact' vs 'Actualiza Contact' por la presencia del Id del contacto.",
    endpoint: { method: "POST", path: "/CreateContact (ProcessDirect) · /Create_Contact (HTTPS)", protocol: "HTTPS + ProcessDirect" },
    lines: 2995,
    participants: 12,
    scripts: 5,
    subprocesses: ["Create Contact", "Actualiza Contact", "GetToken", "General"],
    mappings: ["ClienteNueve.mmap", "ActualizaCliente.mmap", "EmpresaNuevo.mmap", "UpdateContact.mmap"],
    receivers: [
      { name: "Salesforce OAuth Token", method: "POST", auth: "Basic ({{Token_credentials}})" },
      { name: "Salesforce Contact Create", method: "POST" },
      { name: "Salesforce Contact Update", method: "PATCH" },
      { name: "Salesforce Query", method: "GET" },
    ],
    logic: [
      "Recibe el payload validado del orquestador con el AccountId ya resuelto.",
      "Decide crear vs actualizar según el Id que llegue en el bloque Contact.",
      "3 sub-procesos de manejo de excepciones (ErrorEventSubProcessTemplate) que capturan errores del POST/PATCH y devuelven respuesta estructurada.",
    ],
    techniques: ["Mapping (×1)", "ExternalCall (×4)", "Enricher (×13)", "ErrorEventSubProcess (×3)", "XmlToJsonConverter (×2)"],
  },

  {
    id: "comfama-cases",
    name: "Comfama_Cases",
    role: "worker",
    type: "Worker · Cases",
    description: "Núcleo del proceso de Cases. Crea o actualiza el caso, devuelve el CaseNumber a Salesforce y deja los anexos pendientes en un Data Store que será procesado asíncronamente por el Worker de Anexos.",
    endpoint: { method: "POST", path: "/CreateCases (ProcessDirect + HTTPS)", protocol: "HTTPS + ProcessDirect" },
    lines: 3210,
    participants: 13,
    scripts: 7,
    subprocesses: ["Create case", "Obtener_CaseNumber", "Procesar_Anexos", "GetToken"],
    mappings: ["Createcases.mmap (XSD CaseSource_Names → CaseTarget_QualifiedApiName)"],
    receivers: [
      { name: "Salesforce OAuth Token", method: "POST", auth: "Basic ({{SF_User_Keyrus}})" },
      { name: "Salesforce Case Create", method: "POST" },
      { name: "Salesforce Case Update", method: "PATCH" },
      { name: "Salesforce Query Case", method: "GET" },
      { name: "DataStore Anexos_Pendientes", method: "Write" },
    ],
    logic: [
      "Valida campos obligatorios (accountId, asunto, descripcion, tipoCaso, origenCaso) — y la sub-validación de Genesys (tema, servicio, categoria, detalle).",
      "Bifurca crear vs modificar: si trae CaseNumber → SOQL para obtener Id y PATCH; si no → POST.",
      "Después de crear el Case con éxito, consulta el CaseNumber generado y lo devuelve en la respuesta.",
      "Splitter sobre el array de anexos: cada anexo se guarda como entry en Data Store para que el Worker_Anexos los suba después.",
    ],
    techniques: ["Splitter", "ExternalCall (×5)", "JsonToXmlConverter (×4)", "DBstorage", "Mapping", "Script (×7)"],
    highlight: true,
  },

  {
    id: "comfama-cases-anexos",
    name: "Comfama_Cases_Anexos_Worker",
    role: "scheduled",
    type: "Worker programado · Anexos",
    description: "Worker iniciado por timer (Cron) que toma anexos pendientes del Data Store y los carga a Salesforce como ContentVersion + ContentDocumentLink. Maneja reintentos hasta Max_Retries y mueve fallidos a un Data Store separado.",
    endpoint: { method: "Cron Timer", path: "0 * * * * ? (cada minuto)", protocol: "Scheduled" },
    lines: 594,
    participants: 2,
    scripts: 7,
    subprocesses: ["—"],
    receivers: [
      { name: "Salesforce ContentVersion", method: "POST", auth: "OAuth2 Client Credentials ({{OauthCredentials}})" },
    ],
    logic: [
      "Cron dispara cada minuto, lee hasta Polled_Messages=5 entradas de DS 'Anexos_Pendientes'.",
      "Para cada anexo: valida extensión (pdf, jpg, png, docx, zip, xlsx, …), arma ContentVersion y POST a Salesforce.",
      "POST devuelve ContentVersionId → consulta SOQL para obtener ContentDocumentId.",
      "Crea ContentDocumentLink (LinkedEntityId = CaseId, ShareType=V, Visibility=AllUsers).",
      "Si falla y supera Max_Retries (3), mueve la entry al DS 'Anexos_Fallidos'.",
    ],
    techniques: ["StartTimerEvent (Cron)", "DBstorage (×2)", "Splitter", "Enricher", "ExternalCall"],
    parameters: ["Timer_Cron=0 * * * * ?", "Polled_Messages=5", "Max_Retries=3", "version=v59.0"],
    highlight: true,
  },

  {
    id: "comfama-interacciones",
    name: "Comfama_Interacciones",
    role: "ingestion",
    type: "Servicio · Interacciones (Genesys)",
    description: "Recibe interacciones de Genesys en batch, las valida, las convierte a CSV y las inserta como carga masiva en Salesforce vía Bulk API. Limita a 5 registros por request (configurable).",
    endpoint: { method: "POST", path: "/v2/genesys/interacciones", protocol: "HTTPS" },
    lines: 1838,
    participants: 5,
    scripts: 3,
    receivers: [
      { name: "Salesforce Bulk API (Job Create)", method: "Salesforce Adapter" },
      { name: "Salesforce Bulk API (Upload CSV)", method: "Salesforce Adapter" },
      { name: "Salesforce Bulk API (Close Job)",  method: "Salesforce Adapter" },
    ],
    logic: [
      "Normaliza claves del JSON entrante a minúscula y valida lista blanca de tipos de documento (NIT, CC, PASAPORTE, CE, TI, RC, PPT, PEP).",
      "Filtra registros con campos obligatorios y descarta los que no cumplen (cuenta descartados).",
      "Limita a 5 registros por request — los excedidos van a un contador separado.",
      "Genera CSV con headers Conversational_ID__c, Tipo_Documento__c, Fecha_de_Interaccion__c, Tipo_de_Canal__c, Canal__c…",
      "Crea Job Bulk en Salesforce, sube el CSV, cierra el Job, y devuelve un código de seguimiento con resumen (enviados, descartados, excedidos).",
    ],
    techniques: ["Salesforce Adapter (×3)", "ExternalCall (×3)", "Script (×3)", "Enricher"],
  },

  {
    id: "consulta-clientes",
    name: "Consulta_de_Clientes",
    role: "query",
    type: "Servicio · Consulta",
    description: "API de búsqueda de Accounts en Salesforce. Acepta criterios opcionales (tipoDocumento, numeroDocumento, razonSocial, nombre, apellido, correo) y arma dinámicamente un SOQL.",
    endpoint: { method: "POST", path: "/v1/clientes/consulta", protocol: "HTTPS" },
    lines: 1299,
    participants: 5,
    scripts: 3,
    mappings: ["mapeo_clientes.mmap (XSD ClienteSource_SF → ClienteTarget_Response)"],
    receivers: [
      { name: "Salesforce OAuth Token", method: "POST", auth: "Basic (SF_User_Keyrus)" },
      { name: "Salesforce Query (SOQL)", method: "GET" },
    ],
    logic: [
      "Valida que al menos un parámetro de búsqueda venga lleno; si no, falla con BAD_REQUEST.",
      "Construye SELECT con los campos: Id, Name, FirstName/LastName, Tipo_de_Identificacion__c, Numero_de_Identificacion__c, Razon_Social__c, Correo_Electronico__c, PersonEmail, Phone, PersonMobilePhone, Direccion__c, BillingCity, PersonDepartment.",
      "URL-encoda el query y llama /services/data/v59.0/query.",
      "Mapea la respuesta al formato Comfama (Target Fields) y la devuelve.",
      "Sub-proceso de error 'Clean_Bad_Request' devuelve mensajes legibles.",
    ],
    techniques: ["Mapping", "ExternalCall (×2)", "Script (×3)", "ErrorEventSubProcess", "JsonToXmlConverter"],
  },

  {
    id: "consulta-casos",
    name: "Consulta_de_casos",
    role: "query",
    type: "Servicio · Consulta",
    description: "API de consulta de Cases en Salesforce con datos enriquecidos: el caso, sus comentarios (CaseComment) y sus adjuntos (ContentDocumentLink + ContentVersion).",
    endpoint: { method: "POST", path: "/v2/casos/consulta", protocol: "HTTPS" },
    lines: 2485,
    participants: 9,
    scripts: 9,
    subprocesses: ["Consulta Adjuntos", "Consulta Comentarios", "Get Token"],
    mappings: ["Mapeo.mmap"],
    receivers: [
      { name: "Salesforce OAuth Token", method: "POST", auth: "Basic (SF_User_Keyrus)" },
      { name: "Salesforce Case Query", method: "GET" },
      { name: "Salesforce CaseComment Query", method: "GET" },
      { name: "Salesforce ContentDocumentLink Query", method: "GET" },
    ],
    logic: [
      "Recibe filtros (CaseNumber, AccountId, etc.) y construye 3 SOQL distintos.",
      "Query 1: trae los Cases. Extrae IDs.",
      "Query 2 (paralela): trae los CaseComment de esos IDs.",
      "Query 3 (paralela): trae los ContentDocumentLink + ContentVersion.",
      "Script merge_attachments fusiona los 3 resultsets por caseId para devolver una respuesta jerárquica.",
    ],
    techniques: ["ExternalCall (×4)", "Script (×8)", "ProcessCallElement (×3)", "Mapping"],
    highlight: true,
  },
];

/* ==========================================================================
   GROOVY SCRIPTS — agrupados por flujo
   ========================================================================== */
const SCRIPTS_BY_FLOW = {
  "Omnicanalidad_Root": [
    { name: "script1.groovy", purpose: "Validación de payload + mapeo dinámico (52 líneas). Verifica obligatorios y la regla 'si Empresa=true, Contact es obligatorio'." },
    { name: "script2.groovy", purpose: "Inyecta AccountId + ContactId resueltos en el payload del Case (18 líneas)." },
    { name: "script3.groovy", purpose: "Inyecta sólo AccountId en el payload del Contact (12 líneas)." },
  ],
  "Comfama_Cases": [
    { name: "script1.groovy", purpose: "Validación inicial de payload: campos obligatorios + sub-validación Genesys (categorías tema/servicio/categoría/detalle)." },
    { name: "script2.groovy", purpose: "Extrae access_token del XML de respuesta OAuth y arma headers Bearer." },
    { name: "script3.groovy", purpose: "Limpia el body: quita el wrapper 'root' y elimina campos vacíos/nulos." },
    { name: "script4.groovy", purpose: "Extrae campos especiales (anexos, categorías) y los separa del payload del Case." },
    { name: "script5.groovy", purpose: "Procesa respuesta del POST Case: si success, captura caseId y arma respuesta OK." },
    { name: "script6.groovy", purpose: "Prepara body para el Splitter de anexos: envuelve el array en un objeto raíz." },
    { name: "script7.groovy", purpose: "Procesa un Anexo individual: valida extensión, codifica base64 y arma ContentVersion para Salesforce." },
    { name: "script8.groovy", purpose: "Después de crear ContentVersion: captura ContentVersionId, arma GET para obtener ContentDocumentId." },
    { name: "script9.groovy", purpose: "Construye ContentDocumentLink (ContentDocumentId + LinkedEntityId=CaseId)." },
    { name: "script10.groovy", purpose: "Modo PATCH: busca el Case por CaseNumber y arma el body de actualización." },
    { name: "script11.groovy", purpose: "Setea response final desde la property prop_response_final." },
    { name: "script12.groovy", purpose: "Solo en la última iteración del Splitter de anexos, asigna la respuesta final." },
    { name: "script13.groovy", purpose: "Captura el CaseNumber generado por Salesforce y lo añade a la respuesta." },
    { name: "script14.groovy", purpose: "Construye el entry del Data Store de Anexos_Pendientes (incluye caseId, base64, retryCount)." },
  ],
  "Comfama_Customers": [
    { name: "script1.groovy", purpose: "Manejo de error: lee el attachment HTTP_Receiver_Adapter_Response_Body de Salesforce y extrae errorCode, errorMessage, fields. Usado por las 5 ErrorEventSubProcess." },
  ],
  "Comfama_Contact_C": [
    { name: "script1.groovy", purpose: "Manejo de error idéntico al de Customers (lee attachment de Salesforce y propaga error estructurado)." },
    { name: "script2.groovy", purpose: "Extrae y valida payload de Contact." },
    { name: "script3.groovy", purpose: "Procesa respuesta del PATCH/POST de Contact." },
    { name: "script4.groovy", purpose: "Formatea la respuesta final del flujo de Contacts." },
  ],
  "Comfama_Cases_Anexos_Worker": [
    { name: "Parse_DataStore_Entry.groovy", purpose: "Parsea una entry del Data Store: extrae caseId, nombre, base64, retryCount." },
    { name: "Check_Has_Entries.groovy",     purpose: "Cuenta cuántas entries devolvió el Select del Data Store y setea flag prop_hasEntries para el gateway de enrutado." },
    { name: "Procesar_Token.groovy",        purpose: "Procesa la respuesta del OAuth token y setea headers." },
    { name: "Armar_ContentVersion.groovy",  purpose: "Convierte XML → JSON ContentVersion (Title, PathOnClient, VersionData base64) y propaga a Salesforce. 44 líneas." },
    { name: "Extraer_ContentVersionId.groovy", purpose: "Captura el ID de la ContentVersion creada para la consulta posterior del ContentDocumentId." },
    { name: "Armar_ContentDocumentLink.groovy", purpose: "Construye el ContentDocumentLink que une el archivo al Case." },
    { name: "Handle_Error.groovy",          purpose: "Si supera Max_Retries, mueve la entry a Anexos_Fallidos para análisis manual." },
  ],
  "Comfama_Interacciones": [
    { name: "validador.groovy",       purpose: "Normaliza claves a minúscula, valida tipos de documento (NIT, CC, CE, TI, RC, PPT, PEP, Pasaporte), limita a 5 registros y genera CSV con headers Salesforce. 68 líneas." },
    { name: "captura_id.groovy",      purpose: "Captura el Job ID que devuelve el Salesforce Bulk API tras crear el Job." },
    { name: "formato_payload.groovy", purpose: "Compone respuesta final con codigo_seguimiento, enviados_exitosamente, descartados_por_error_formato, conteo_excedidos y mensaje de capacidad." },
  ],
  "Consulta_de_Clientes": [
    { name: "filtros.groovy",           purpose: "Construye SOQL dinámico según filtros recibidos. Exige al menos un parámetro válido. 75 líneas." },
    { name: "Clean_Bad_Request.groovy", purpose: "Sub-proceso de error: devuelve mensaje legible cuando faltan parámetros o el SOQL falla." },
  ],
  "Consulta_de_casos": [
    { name: "filtros.groovy",                purpose: "Arma SOQL principal para los Cases con filtros recibidos." },
    { name: "build_cdl_query.groovy",        purpose: "Construye SOQL de ContentDocumentLink filtrado por los caseIds extraídos." },
    { name: "build_comments_query.groovy",   purpose: "Construye SOQL de CaseComment filtrado por los caseIds extraídos." },
    { name: "build_cv_query.groovy",         purpose: "Construye SOQL de ContentVersion para traer base64 de los adjuntos." },
    { name: "merge_attachments.groovy",      purpose: "Fusiona los 3 resultsets (Cases + Comments + Attachments) en una estructura jerárquica por caso." },
    { name: "format_comments.groovy",        purpose: "Da formato a los CaseComment dentro de la respuesta final." },
    { name: "extract_case_ids (script1)",    purpose: "Extrae los IDs de los casos de la primera consulta para alimentar las queries paralelas." },
    { name: "Conslta Adjuntos (script2)",    purpose: "Orquesta la consulta de adjuntos vía ContentDocumentLink." },
    { name: "Clean_Bad_Request.groovy",      purpose: "Sub-proceso de error." },
  ],
};

/* ==========================================================================
   ENDPOINTS PÚBLICOS expuestos
   ========================================================================== */
const ENDPOINTS = [
  { method: "POST", path: "/Account_Cases_Root",       flow: "Omnicanalidad_Root",       purpose: "Entrada única omnicanal — crea/actualiza Account + Contact + Case en cascada" },
  { method: "POST", path: "/Create_Account",           flow: "Comfama_Customers",        purpose: "Acceso directo solo a Accounts (uso interno o desde otros flows)" },
  { method: "POST", path: "/Create_Contact",           flow: "Comfama_Contact_C",        purpose: "Acceso directo solo a Contacts" },
  { method: "POST", path: "/CreateCases",              flow: "Comfama_Cases",            purpose: "Acceso directo a creación/actualización de Cases" },
  { method: "POST", path: "/v2/genesys/interacciones", flow: "Comfama_Interacciones",    purpose: "Ingesta de interacciones de Genesys vía Bulk API" },
  { method: "POST", path: "/v1/clientes/consulta",     flow: "Consulta_de_Clientes",     purpose: "Búsqueda de clientes en Salesforce por múltiples criterios" },
  { method: "POST", path: "/v2/casos/consulta",        flow: "Consulta_de_casos",        purpose: "Consulta de casos con sus comentarios y adjuntos" },
  { method: "Cron", path: "0 * * * * ?",               flow: "Comfama_Cases_Anexos_Worker", purpose: "Worker programado (cada minuto) que sube anexos pendientes a Salesforce" },
];

/* ==========================================================================
   INTEGRACIONES EXTERNAS
   ========================================================================== */
const EXTERNAL_SYSTEMS = [
  {
    name: "Salesforce CRM",
    role: "Sistema destino principal",
    tenant: "efficiency-enterprise-8418--qacomfama.sandbox.my.salesforce.com",
    apiVersion: "v59.0",
    auth: "OAuth 2.0 (Basic + Client Credentials) — credenciales SF_User_Keyrus / SF_OAUTH_CRED / SF_OAUTH2_CRED",
    objects: "Account · Contact · Case · CaseComment · ContentVersion · ContentDocumentLink",
    apis: "REST (sobjects, query, composite) · Bulk API · Salesforce Adapter (CPI nativo)",
  },
  {
    name: "Genesys",
    role: "Canal de atención — fuente de interacciones",
    tenant: "—",
    auth: "Pre-validado (las interacciones llegan vía HTTPS POST con identificación de canal)",
    objects: "Interacciones (id conversacional, canal, teléfono, correo, nota, tipo de documento, número de documento)",
    apis: "Consumido por CPI vía /v2/genesys/interacciones",
  },
  {
    name: "Sistemas Comfama (consumidores)",
    role: "Sistemas internos que invocan los endpoints",
    auth: "HTTPS",
    objects: "Crean/actualizan/consultan via los endpoints expuestos",
    apis: "Cualquier sistema que pueda hacer HTTPS POST con JSON",
  },
];

/* ==========================================================================
   ARTEFACTOS TÉCNICOS
   ========================================================================== */
const XSDS = [
  { flow: "Comfama_Cases",     name: "CaseSource_Names.xsd",          purpose: "Esquema fuente para el mapping de Case (campos de Comfama)." },
  { flow: "Comfama_Cases",     name: "CaseTarget_QualifiedApiName.xsd", purpose: "Esquema destino: nombres API de Salesforce." },
  { flow: "Comfama_Contact_C", name: "CreateContact.xsd",             purpose: "Esquema de creación de Contact." },
  { flow: "Comfama_Contact_C", name: "Create.xsd",                    purpose: "Esquema legacy de creación." },
  { flow: "Comfama_Contact_C", name: "Createv2.xsd",                  purpose: "Esquema actual v2." },
  { flow: "Comfama_Customers", name: "Create.xsd",                    purpose: "Esquema fuente del cliente." },
  { flow: "Comfama_Customers", name: "Createv2.xsd",                  purpose: "Esquema fuente actualizado." },
  { flow: "Consulta_de_Clientes", name: "ClienteSource_SF_1.xsd",     purpose: "Esquema de Salesforce (origen)." },
  { flow: "Consulta_de_Clientes", name: "ClienteTarget_Response_1.xsd", purpose: "Esquema de la respuesta hacia Comfama." },
  { flow: "Consulta_de_Clientes", name: "Comfama_fields.xsd",         purpose: "Campos Comfama del request." },
  { flow: "Consulta_de_Clientes", name: "SalesForce_Fields.xsd",      purpose: "Campos Salesforce extendidos." },
  { flow: "Consulta_de_Clientes", name: "SalesForce_Case_Fields.xsd", purpose: "Campos de Case en Salesforce." },
  { flow: "Consulta_de_Clientes", name: "Comfama_Target_Fields.xsd",  purpose: "Campos destino del mapping de respuesta." },
];

const MAPPINGS = [
  { flow: "Comfama_Cases",        name: "Createcases.mmap",       desc: "Source Names → Target QualifiedApiName (CaseSource → CaseTarget)." },
  { flow: "Comfama_Contact_C",    name: "ClienteNueve.mmap",      desc: "Crear contacto nuevo." },
  { flow: "Comfama_Contact_C",    name: "ActualizaCliente.mmap",  desc: "Actualizar contacto existente." },
  { flow: "Comfama_Contact_C",    name: "EmpresaNuevo.mmap",      desc: "Crear contacto vinculado a una empresa." },
  { flow: "Comfama_Contact_C",    name: "UpdateContact.mmap",     desc: "Update genérico de contacto." },
  { flow: "Comfama_Customers",    name: "ClienteNueve.mmap",      desc: "Crear Account persona natural." },
  { flow: "Comfama_Customers",    name: "ActualizaCliente.mmap",  desc: "Actualizar Account persona natural." },
  { flow: "Comfama_Customers",    name: "EmpresaNuevo.mmap",      desc: "Crear Account de tipo empresa." },
  { flow: "Consulta_de_Clientes", name: "mapeo_clientes.mmap",    desc: "Salesforce response → Comfama Target." },
  { flow: "Consulta_de_casos",    name: "Mapeo.mmap",             desc: "Respuesta jerárquica con casos + comentarios + adjuntos." },
];

/* ==========================================================================
   PARÁMETROS EXTERNALIZADOS (parameters.prop)
   ========================================================================== */
const PARAMETERS = [
  { flow: "Comfama_Cases_Anexos_Worker", params: [
    { k: "Timer_Cron",          v: "0 * * * * ?", desc: "Frecuencia del polling (cada minuto)." },
    { k: "Polled_Messages",     v: "5",           desc: "Máximo de entries por ciclo." },
    { k: "Max_Retries",         v: "3",           desc: "Reintentos antes de mover a DS Fallidos." },
    { k: "DS_Anexos_Pendientes", v: "Anexos_Pendientes", desc: "Nombre del Data Store de pendientes." },
    { k: "DS_Anexos_Fallidos",   v: "Anexos_Fallidos",   desc: "Data Store de irrecuperables." },
    { k: "SF_BaseUrl",          v: "qacomfama.sandbox.my.salesforce.com", desc: "Base del API Salesforce." },
    { k: "SF_TokenUrl / SF_TokenCredential / OauthCredentials", v: "SF_OAUTH_CRED / SF_OAUTH2_CRED", desc: "Credenciales securizadas." },
    { k: "version",             v: "v59.0",       desc: "API Version de Salesforce." },
  ]},
  { flow: "Comfama_Cases / Customers / Contact_C", params: [
    { k: "URLSISTEMA",       v: "qacomfama.sandbox.my.salesforce.com/services/oauth2/token", desc: "Endpoint OAuth2." },
    { k: "URLTenant",        v: "qacomfama.sandbox.my.salesforce.com", desc: "Base del tenant Salesforce." },
    { k: "Token_credentials / SF_User_Keyrus", v: "SF_User_Keyrus", desc: "Alias de credencial securizada." },
    { k: "Version",          v: "v59.0",        desc: "API version." },
  ]},
];

window.CPI = {
  meta: PROJECT_META,
  metrics: METRICS,
  flows: FLOWS,
  scripts: SCRIPTS_BY_FLOW,
  endpoints: ENDPOINTS,
  externalSystems: EXTERNAL_SYSTEMS,
  xsds: XSDS,
  mappings: MAPPINGS,
  parameters: PARAMETERS,
};
