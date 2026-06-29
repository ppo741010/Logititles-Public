export const PRIORITY_DOMAIN_RULES = {
  "Warehouse": ["warehouse manager","warehouse supervisor","warehouse coordinator","warehouse assistant","warehouse","storeperson","store person","forklift","picker","packer","pick pack","inventory","stock","distribution centre","distribution center","devanner","labourer","fulfilment","fulfillment","fulfilment manager","fulfillment manager","inbound","outbound","returns","cold storage","receiving","despatch","put away"],
  "Transport": ["transport manager","dispatch coordinator","dispatcher","dispatch","allocator","delivery","driver","courier","linehaul","fleet","route"],
  "Freight Forwarding": ["freight","customs","brokerage","import","export","airfreight","seafreight","forwarding"],
  "Planning": ["supply chain","demand planner","planner","planning","procurement","purchasing","purchaser","buyer","business analyst","scheduler","sourcing","replenishment","forecast"],
  "Finance": ["accounts payable","accounts receivable","accounts payable/receivable","accountant","accounts","payroll","finance","billing","costing","fp&a","financial planning","financial analyst","treasury","budgeting"],
  "IT Support": ["developer","architect","systems","technology","application support","technical support","it support","software support","application specialist","hris specialist","technical consultant"],
  "Operations": ["operations manager","operations supervisor","operations coordinator","logistics manager","logistics coordinator","logistics","operator","controller","process","production","quality","qa","sap","decon","consol","erp","e-commerce","ecommerce","omnichannel"],
  "Business Administration": ["office administrator","admin assistant","executive assistant","personal assistant","receptionist","office support","clerical","office manager","hr business partner","hr advisor","hr coordinator","hr transformation","hr specialist"],
  "Sales": ["customer service","customer support","sales operations","sales coordinator","sales manager","sales","business development","key account","merchandiser","representative","account manager","commercial","commercial manager","commercial development","business to business","b2b","b2c","activation","channel"],
};

export const FUZZY_ROLE_REPAIR = {
  "checkout/retail":"Other/Noise","retail":"Other/Noise","cleaning":"Other/Noise","electrician":"Other/Noise",
  "surveyor":"Other/Noise","agronomist":"Other/Noise","cleaner":"Other/Noise","estimator":"Other/Noise",
  "powerline":"Other/Noise","kiwifruit":"Other/Noise","faller":"Other/Noise","health consultant":"Other/Noise",
  "office administrator":"Business Administration","hr business partner":"Business Administration",
  "admin assistant":"Business Administration","executive assistant":"Business Administration",
  "receptionist":"Business Administration","analytics":"Planning","category manager":"Planning",
  "supply manager":"Planning","materials manager":"Planning","freight":"Freight Forwarding",
  "dispatch coordinator":"Transport","allocator":"Transport","driver":"Transport",
  "warehouse manager":"Warehouse","inventory":"Warehouse","forklift":"Warehouse",
  "accounts payable":"Finance","accountant":"Finance","payroll":"Finance",
  "developer":"IT Support","implementation":"IT Support","solutions consultant":"IT Support",
  "operations manager":"Operations","logistics":"Operations",
  "customer service":"Sales","sales":"Sales","business development":"Sales",
  "head of retail":"Sales","commercial manager":"Sales",
};

export const LEVEL_MAPPING = {
  "ceo":"Executive","gm":"Executive","director":"Executive",
  "head of":"Executive","executive":"Executive",
  "manager":"Manager",
  "consultant":"Manager","analyst":"Manager","strategist":"Manager",
  "specialist":"Senior",
  "senior":"Senior","snr":"Senior","team lead":"Senior",
  "principal":"Senior","advanced":"Senior",
  "coordinator":"Mid Level","supervisor":"Mid Level",
  "officer":"Mid Level","administrator":"Mid Level",
  "representative":"Mid Level","operator":"Mid Level",
  "driver":"Mid Level","planner":"Mid Level",
  "junior":"Entry Level","jr":"Entry Level","jnr":"Entry Level",
  "graduate":"Entry Level","trainee":"Entry Level",
  "entry":"Entry Level","assistant":"Entry Level","picker":"Entry Level",
  "packer":"Entry Level","handler":"Entry Level",
};

export const WORK_NATURE_MAPPING = {
  "Management":["manager","director","head","gm","chief","executive","superintendent","principal"],
  "Specialist / Support":["analyst","planner","consultant","engineer","accountant","specialist","officer","admin","administrator","representative","agent","support","architect","business development","customer service","merchandiser","key account","sales","advisor","accounts","finance","billing","payroll"],
  "Operational":["coordinator","supervisor","operator","driver","picker","storeman","clerk","handler","assistant","staff","loader","sorter","packer","dispatch","storeperson","controller","tally","devanner","mechanic"],
};

export const DOMAIN_SKILL_FIXED = {
  "Business Administration":["Leadership","Stakeholder Management","Strategic Planning","KPI Management"],
  "Operations":["Process Optimization","Operational Excellence","Resource Allocation","SOP Development"],
  "Finance":["Cost Analysis","Accounts Payable/Receivable","ERP Proficiency","Financial Reporting"],
  "Planning":["Demand Forecasting","Inventory Optimization","Supply Chain Planning","S&OP"],
  "Freight Forwarding":["Incoterms","Customs Clearance","Export/Import Documentation","Consolidation"],
  "Warehouse":["Inventory Accuracy","WMS","RF Scanning","Manual Handling","Safety Compliance"],
  "Transport":["TMS","Route Optimization","Fleet Management","Last Mile Delivery","Compliance"],
  "Sales":["CRM","Quotation","Market Analysis","Revenue Growth","Customer Service"],
  "IT Support":["Systems Integration","ERP Maintenance","Data Governance","IT Infrastructure"],
  "Other/Noise":[],
};

export const REMOVE_PHRASES = ["immediate start","apply now","great opportunity","exciting opportunity","career growth","wanted","needed","join our team","above award rate","great money","packag","remuner","salary package","competitive package","competitive salary","bonus"];
// Note: "distrib" intentionally removed — it incorrectly strips "Distribution" from titles like "Distribution Centre Supervisor"
export const REMOVE_SHIFT = ["night shift","day shift","afternoon shift","am shift","pm shift","overnight","morning shift","part time","full time","casual"];
export const REMOVE_CONTRACT = ["ftc","fixed term","fixed-term","contract role","contract position","temp role","temporary role","temp to perm","maternity cover","parental leave cover","secondment","ongoing","permanent role","casual role"];
export const SALARY_PATTERN = /\$[\d,]+[k]?(\s*[-–]\s*\$?[\d,]+[k]?)?\s*(pa\b|p\.a\.|per annum|per year|annually|ph\b|p\.h\.|per hour)?/gi;
export const CONTRACT_DURATION_PATTERN = /\b\d+[-\s]?(month|week|year)[s]?\b(\s*contract)?/gi;
export const TYPO_MAP = {
  "assisstant":"assistant","coodrinator":"coordinator","sepcialist":"specialist",
  "mandarine":"mandarin","operatior":"operator","oprations":"operations",
  "mananger":"manager","manageer":"manager","manger":"manager",
  "logsitics":"logistics","logistic ":"logistics ","logsitic":"logistics",
  "warehuse":"warehouse","warehose":"warehouse","wherehouse":"warehouse",
  "suprevisor":"supervisor","supervisior":"supervisor","supervsior":"supervisor",
  "freigth":"freight","frieght":"freight",
  "tranport":"transport","transprot":"transport",
  "recieving":"receiving","reciving":"receiving",
  "planiner":"planner","plannner":"planner",
  "accouns":"accounts","acocunts":"accounts",
  "purchassing":"purchasing","purchacing":"purchasing",
  "cusotmer":"customer","custumer":"customer",
};
export const HOURS_POSITIONS_PATTERN = /\b(\d+\.?\d*\s*h(rs?|ours?)(\s*p\.?w\.?|\s*per\s*week)?|\d+\s*x\s*\w+|x\s*\d+\s*(position|role|vacancy|vacancies)?s?|\d+\s*(position|role|vacancy|vacancies)s?|multiple\s*(position|role)s?)\b/gi;

export const CROSS_FUNCTIONAL_PAIRS = [
  { a: "warehouse",        b: "dispatch",         flag: "Cross-functional signal: Warehouse + Dispatch — may span multiple domains" },
  { a: "customer service", b: "logistics",        flag: "Cross-functional signal: Customer Service + Logistics — role scope may be broad" },
  { a: "transport",        b: "warehouse",        flag: "Cross-functional signal: Transport + Warehouse — dual-function role detected" },
  { a: "freight",          b: "customer",         flag: "Cross-functional signal: Freight + Customer-facing — may span Freight Forwarding and Sales" },
  { a: "customer service", b: "dispatch",         flag: "Cross-functional signal: Customer Service + Dispatch — may bridge Sales and Transport" },
];

export const EXPORT_FIELDS = ["raw_title","clean_title","domain","work_nature","seniority","confidence","status","out_of_scope","needs_review","skills","flags","salary_note","country","salary_range","salary_min","salary_max","salary_median"];
