// Truckers Authority Forms Tool — shared filler engine
// Requires pdf-lib loaded as PDFLib on the page before this script.

const WORKER = 'https://zoho-proxy.oscarmh00.workers.dev';

class AuthRequiredError extends Error {
  constructor() { super('Sign-in required'); this.name = 'AuthRequiredError'; }
}

async function callWorker(url) {
  let res;
  try {
    res = await fetch(url, { credentials: 'include' });
  } catch (e) {
    throw new AuthRequiredError();
  }
  if (res.status === 401 || res.status === 403 || res.redirected) throw new AuthRequiredError();
  if (!res.ok) throw new Error(`Worker returned ${res.status}`);
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('json')) throw new AuthRequiredError();
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

async function searchDeals(q) {
  const data = await callWorker(`${WORKER}?action=search&word=${encodeURIComponent(q)}`);
  return Array.isArray(data) ? data : [];
}

async function fetchDeal(id) {
  return callWorker(`${WORKER}?action=deal&id=${encodeURIComponent(id)}`);
}

// Download a filled PDF
function downloadPDF(bytes, prefix, dealName) {
  const name = (dealName || 'client').replace(/[^a-zA-Z0-9]/g, '_');
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `${prefix}_${name}.pdf`;
  a.click();
}

// Load and fill a PDF from a local URL
// fieldValues: { fieldName: value }
//   - string value → setText
//   - true → check()  (for checkboxes)
//   - string starting with '/' → radio group select (e.g. '/Yes')
async function fillPDF(pdfUrl, fieldValues) {
  const resp = await fetch(pdfUrl, { cache: 'reload' });
  if (!resp.ok) throw new Error(`Could not load form PDF (${resp.status}). Ensure the PDF is in the GitHub repo.`);
  const bytes  = await resp.arrayBuffer();
  const pdfDoc = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });
  const form   = pdfDoc.getForm();
  const helv   = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);

  for (const field of form.getFields()) {
    const name = field.getName();
    const val  = fieldValues[name];
    if (val == null || val === '') continue;
    try {
      if (field instanceof PDFLib.PDFTextField) {
        field.setText(String(val));
      } else if (field instanceof PDFLib.PDFCheckBox) {
        if (val === true || val === 'true' || val === '/Yes') field.check();
      } else if (field instanceof PDFLib.PDFRadioGroup) {
        try { field.select(String(val)); } catch {}
      } else if (field instanceof PDFLib.PDFDropdown) {
        try { field.select(String(val)); } catch {}
      }
    } catch {}
  }
  form.getFields().forEach(f => { try { f.updateAppearances(helv); } catch {} });
  return pdfDoc.save();
}

// Helpers
function today() {
  const d = new Date();
  return String(d.getMonth()+1).padStart(2,'0') + '/' + String(d.getDate()).padStart(2,'0') + '/' + d.getFullYear();
}

function ownerName(deal) {
  return deal.Owner_1_Full_Name || (deal.Contact_Name && deal.Contact_Name.name) || '';
}

// Shared UI helpers (expects a global `app` element)
function renderSignIn(retryFn) {
  app.innerHTML = `
    <div class="card">
      <div class="card-title">Sign-in required</div>
      <p style="font-size:14px;color:#475569;margin-bottom:16px">
        Sign in with your <b>@truckersauthority.com</b> account to use this tool.
      </p>
      <button class="btn btn-primary" id="signin">Sign in via Cloudflare</button>
      <p class="hint" style="margin-top:14px">After signing in the tab will close and you'll return here automatically.</p>
    </div>`;
  document.getElementById('signin').onclick = () => {
    const w = window.open(WORKER, 'tasignin', 'width=520,height=640');
    const t = setInterval(() => {
      if (!w || w.closed) { clearInterval(t); if (retryFn) retryFn(); else location.reload(); }
    }, 500);
  };
}

function renderLoading(msg) {
  app.innerHTML = `<div class="card loading-box"><div class="spinner"></div>${msg}</div>`;
}

function renderSearch(err, searchFn) {
  app.innerHTML = `
    <div class="card">
      <div class="card-title">Search closed deal</div>
      <div class="search-row">
        <input type="text" id="si" placeholder="Company name, DOT #, owner name…" autofocus>
        <button class="btn btn-primary" id="sb">Search →</button>
      </div>
      ${err ? `<div class="error-box">${err}</div>` : ''}
      <p class="hint" style="margin-top:10px">Search any Deal from Zoho CRM by company name or DOT number.</p>
    </div>`;
  const go = async () => {
    const q = document.getElementById('si').value.trim();
    if (!q) return;
    renderLoading(`Searching for "${q}"…`);
    try {
      const results = await searchDeals(q);
      if (!results.length) renderSearch(`No deals found for "${q}".`, searchFn);
      else renderPick(results, searchFn);
    } catch(e) {
      if (e instanceof AuthRequiredError) renderSignIn(go);
      else renderSearch('Error: ' + e.message, searchFn);
    }
  };
  document.getElementById('sb').onclick = go;
  document.getElementById('si').addEventListener('keydown', e => { if (e.key==='Enter') go(); });
}

function renderPick(results, searchFn) {
  app.innerHTML = `
    <div class="card">
      <div class="back-row">
        <div class="card-title" style="margin-bottom:0">Select a deal</div>
        <button class="btn btn-ghost" id="bb">← Back</button>
      </div>
      ${results.map(r => `<div class="result-item" data-id="${r.id}">
        <div>
          <div class="result-name">${r.Deal_Name||r.id}</div>
          <div class="result-meta">${[r.Stage,r.USDOT?'DOT# '+r.USDOT:null,r.Owner_1_Full_Name,[r.Physical_City,r.Physical_State].filter(Boolean).join(', ')].filter(Boolean).join('  ·  ')}</div>
        </div>
        <span style="color:#94a3b8;font-size:20px">›</span>
      </div>`).join('')}
    </div>`;
  document.getElementById('bb').onclick = () => renderSearch(null, searchFn);
  document.querySelectorAll('.result-item').forEach(el => {
    el.onclick = async () => {
      renderLoading('Loading ' + el.querySelector('.result-name').textContent + '…');
      try { searchFn(await fetchDeal(el.dataset.id)); }
      catch(e) { renderSearch('Error: ' + e.message, searchFn); }
    };
  });
}

function fRow(label, value) {
  return !value ? '' : `<div class="field-row"><span class="field-label">${label}</span><span class="field-value">${value}</span></div>`;
}

// Boot: handle ?id= param for Zoho button deep-link
async function bootWithIdParam(previewFn, searchFn) {
  const id = new URLSearchParams(window.location.search).get('id');
  if (id) {
    renderLoading('Loading deal from Zoho CRM…');
    try { previewFn(await fetchDeal(id)); }
    catch(e) {
      if (e instanceof AuthRequiredError) {
        renderSignIn(async () => {
          renderLoading('Loading deal from Zoho CRM…');
          try { previewFn(await fetchDeal(id)); }
          catch(err) { renderSearch('Could not load deal: ' + err.message, searchFn); }
        });
      } else {
        renderSearch('Could not load deal: ' + e.message, searchFn);
      }
    }
  } else {
    renderSearch(null, searchFn);
  }
}
