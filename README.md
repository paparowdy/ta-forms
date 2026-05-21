# Truckers Authority — FMCSA Forms Auto-Fill Tool

Internal tool for prefilling government carrier forms from Zoho CRM Deal data.

## Live Site
https://paparowdy.github.io/ta-forms/

## Forms Included
| Form | File | Use Case |
|------|------|----------|
| MCS-150 | mcs150.html | New USDOT registration / biennial update |
| MCSA-5889 | mcsa5889.html | Carrier record changes (address, name, reinstatement) |
| CA MCP MC 706 M | mc706m.html | California Motor Carrier Permit |
| OCE-46 | oce46.html | FMCSA Request for Operating Authority (notarized) |

## Architecture

```
ta-forms/
├── index.html          Form launcher (pick a form → search a deal)
├── mcs150.html         MCS-150 (289 fields)
├── mcsa5889.html       MCSA-5889 (78 fields)
├── mc706m.html         CA MCP MC 706 M (208 fields)
├── oce46.html          OCE-46 (31 fields)
├── *.pdf               Form PDFs (hosted here to avoid FMCSA/state server CORS blocks)
├── shared/
│   ├── styles.css      Shared CSS (header, cards, buttons, grid)
│   ├── filler.js       Shared engine: Worker calls, PDF fill, UI helpers
│   └── mc706m-field-map.json  CA MCP generic → semantic field name mapping
└── README.md
```

## Data Flow
1. Staff opens a Deal in Zoho CRM
2. Clicks "Generate [Form]" button (or visits the site and searches manually)
3. Confirms prefilled data on preview screen
4. Clicks Generate → prefilled PDF downloads
5. Staff reviews, fills any remaining fields, prints/e-files

## Zoho Proxy (Cloudflare Worker)
URL: `https://zoho-proxy.oscarmh00.workers.dev`  
Endpoints:
- `?action=search&word=QUERY` — search Deals
- `?action=deal&id=DEAL_ID` — fetch full Deal record

Auth: Cloudflare Access (Google Workspace SSO @truckersauthority.com)

## Adding a New Form
1. Upload the PDF to this repo
2. Inspect field names: `python3 -c "import pypdf; r=pypdf.PdfReader('Form.pdf'); [print(f.name, f.field_type) for f in r.get_fields().values() or []]"`
3. Copy `oce46.html` as a template — replace `PDF_URL`, `mapToFORM()`, and preview section
4. Add a tile to `index.html`
5. Add a Zoho Deal button: Setup → Modules → Deals → Links and Buttons
   - URL: `https://paparowdy.github.io/ta-forms/FORM.html?id=${Deals.id}`

## Zoho CRM Buttons
All 4 buttons are on the Deal detail page:
- Generate MCS-150 → all Deals
- Generate MCSA-5889 → all Deals  
- Generate CA MCP → Deals where Physical_State = "CA"
- Generate OCE-46 → all Deals

## Field Mapping Source of Truth
Zoho field names confirmed via MCP connector (Deals module):
`Deal_Name, DBA, Physical_Street, Physical_City, Physical_State, Physical_Zip,
Mailing_Street, Mailing_City, Mailing_State, Mailing_Zip_Code,
Business_Phone_Number, Email, USDOT, MC_Number, EIN_Number_or_S_S,
Owner_1_Full_Name, Owner_2_Full_Name, Applicant_Title1,
Business_Structure, Type_of_Authority_You_are_Applying_for,
Interstate, Intrastate, Straight_Trucks_Owned, Truck_Tractors_Owned,
Number_of_Interstate_Haulers, Number_of_Intrastate_Drivers,
Contact_Name (lookup .name), Stage, Package_Requested`
