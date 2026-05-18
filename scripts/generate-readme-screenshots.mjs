import sharp from "sharp";

const W = 1440;
const H = 1000;

function esc(value) {
  return String(value).replace(/[&<>]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[char]);
}

function base(title, subtitle, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#08111f"/>
      <stop offset="1" stop-color="#111827"/>
    </linearGradient>
    <filter id="shadow"><feDropShadow dx="0" dy="16" stdDeviation="18" flood-color="#000" flood-opacity=".35"/></filter>
    <style>
      .sans{font-family:Arial,Helvetica,sans-serif}
      .muted{fill:#93a4b8}
      .card{fill:#151b26;stroke:#334155;stroke-width:1.2}
      .label{fill:#a9b7c9;font-size:13px;font-weight:700;letter-spacing:2px}
      .h1{fill:#f8fafc;font-size:42px;font-weight:800}
      .body{fill:#cbd5e1;font-size:20px}
      .small{fill:#cbd5e1;font-size:15px}
    </style>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <g class="sans">
    <text x="48" y="76" class="label">AFTER MAP</text>
    <text x="48" y="128" class="h1">${esc(title)}</text>
    <text x="48" y="164" class="body">${esc(subtitle)}</text>
    ${body}
  </g>
</svg>`;
}

function marker(x, y, color, label) {
  return `<g>
    <circle cx="${x}" cy="${y}" r="17" fill="${color}" stroke="white" stroke-width="4"/>
    <text x="${x + 26}" y="${y + 6}" fill="#f8fafc" font-size="18" font-family="Arial" font-weight="700">${label}</text>
  </g>`;
}

const mapBody = `
  <rect x="32" y="210" width="1376" height="720" rx="18" class="card" filter="url(#shadow)"/>
  <path d="M720 280 C790 285 845 330 865 390 C915 415 940 470 915 525 C950 575 915 635 860 650 C825 715 765 755 700 730 C635 770 555 745 530 675 C460 645 445 575 485 525 C455 455 500 395 565 385 C585 320 650 275 720 280 Z" fill="#1f3a2f" stroke="#5eead4" stroke-width="3" opacity=".95"/>
  <path d="M620 350 L760 392 L820 505 L755 640 L615 675 L530 552 Z" fill="none" stroke="#64748b" stroke-width="2" stroke-dasharray="10 10" opacity=".7"/>
  ${marker(585, 390, "#22c55e", "Kyiv area: Bucha / Irpin")}
  ${marker(840, 455, "#ef4444", "Kharkiv region")}
  ${marker(815, 545, "#22c55e", "Rubizhne")}
  ${marker(710, 665, "#fbbf24", "Review queue")}
  <rect x="78" y="255" width="380" height="190" rx="14" fill="#0f172a" stroke="#334155"/>
  <text x="108" y="304" class="label">DAMAGE MARKER OVERVIEW</text>
  <text x="108" y="348" fill="#f8fafc" font-size="27" font-weight="800">Country-level map context</text>
  <text x="108" y="386" class="small">Markers are grouped by real region instead of</text>
  <text x="108" y="410" class="small">placing unrelated city names on one village.</text>
  <rect x="1005" y="670" width="330" height="190" rx="14" fill="#0f172a" stroke="#334155"/>
  <text x="1035" y="720" class="label">LEGEND</text>
  <circle cx="1052" cy="764" r="9" fill="#22c55e"/><text x="1078" y="770" class="small">Validated damage marker</text>
  <circle cx="1052" cy="807" r="9" fill="#fbbf24"/><text x="1078" y="813" class="small">Needs commander review</text>
  <circle cx="1052" cy="850" r="9" fill="#ef4444"/><text x="1078" y="856" class="small">Active / unresolved</text>
`;

const assessmentBody = `
  <rect x="40" y="215" width="1360" height="715" rx="18" class="card" filter="url(#shadow)"/>
  <rect x="80" y="270" width="595" height="430" rx="14" fill="#0b1220" stroke="#334155"/>
  <rect x="765" y="270" width="595" height="430" rx="14" fill="#0b1220" stroke="#334155"/>
  <text x="105" y="312" class="label">BEFORE IMAGE</text>
  <text x="790" y="312" class="label">AFTER IMAGE</text>
  <g opacity=".9">
    <rect x="105" y="340" width="545" height="330" fill="#233022"/>
    <path d="M120 560 C220 510 330 590 440 520 C520 475 585 510 640 455" stroke="#86efac" stroke-width="20" fill="none" opacity=".35"/>
    <path d="M130 380 L610 640 M190 350 L560 665 M105 455 L650 455" stroke="#94a3b8" stroke-width="8" opacity=".3"/>
    <rect x="345" y="450" width="120" height="82" fill="#64748b" opacity=".75"/>
    <circle cx="405" cy="491" r="55" fill="none" stroke="#ef4444" stroke-width="4"/>
  </g>
  <g opacity=".9">
    <rect x="790" y="340" width="545" height="330" fill="#2b2a22"/>
    <path d="M805 560 C900 510 1030 590 1135 520 C1225 475 1270 510 1325 455" stroke="#84cc16" stroke-width="16" fill="none" opacity=".25"/>
    <path d="M820 380 L1300 640 M880 350 L1250 665 M790 455 L1335 455" stroke="#94a3b8" stroke-width="8" opacity=".25"/>
    <path d="M1040 454 L1122 535 L1018 548 L1095 470 Z" fill="#7f1d1d" opacity=".8"/>
    <circle cx="1088" cy="501" r="55" fill="none" stroke="#ef4444" stroke-width="4"/>
  </g>
  <rect x="80" y="735" width="290" height="110" rx="12" fill="#111827" stroke="#334155"/>
  <text x="108" y="775" class="label">VERDICT</text><text x="108" y="815" fill="#ef4444" font-size="30" font-weight="900">DESTROYED</text>
  <rect x="405" y="735" width="290" height="110" rx="12" fill="#111827" stroke="#334155"/>
  <text x="433" y="775" class="label">CONFIDENCE</text><text x="433" y="815" fill="#22c55e" font-size="30" font-weight="900">90%</text>
  <rect x="730" y="735" width="630" height="110" rx="12" fill="#111827" stroke="#334155"/>
  <text x="758" y="775" class="label">AI SUMMARY</text>
  <text x="758" y="812" class="small">The circled target shows roof collapse and debris after the event.</text>
`;

const reviewRows = [
  ["#ef4444", "Industrial warehouse damage", "AI confidence 90% - target likely destroyed"],
  ["#fbbf24", "Bridge approach review", "Needs human check before publishing"],
  ["#22c55e", "Residential block no-change", "No visible damage inside red target circle"],
]
  .map(
    ([color, title, desc], i) => `
  <rect x="80" y="${310 + i * 185}" width="780" height="145" rx="14" fill="#111827" stroke="#334155"/>
  <circle cx="122" cy="${360 + i * 185}" r="16" fill="${color}"/>
  <text x="155" y="${352 + i * 185}" fill="#f8fafc" font-size="22" font-weight="800">${title}</text>
  <text x="155" y="${386 + i * 185}" class="small">${desc}</text>
  <rect x="650" y="${337 + i * 185}" width="88" height="38" rx="8" fill="#22c55e"/>
  <text x="674" y="${361 + i * 185}" fill="#06110a" font-size="13" font-weight="900">VALID</text>
  <rect x="750" y="${337 + i * 185}" width="82" height="38" rx="8" fill="#ef4444"/>
  <text x="773" y="${361 + i * 185}" fill="#fff" font-size="13" font-weight="900">HOLD</text>`,
  )
  .join("");

const commanderBody = `
  <rect x="40" y="215" width="860" height="715" rx="18" class="card" filter="url(#shadow)"/>
  <rect x="940" y="215" width="420" height="715" rx="18" class="card" filter="url(#shadow)"/>
  <text x="80" y="270" class="label">PENDING AI BRIEFS</text>
  <text x="980" y="270" class="label">COMMANDER FOLDERS</text>
  ${reviewRows}
  <rect x="980" y="310" width="340" height="130" rx="14" fill="#0f172a" stroke="#334155"/>
  <text x="1010" y="355" fill="#22c55e" font-size="28" font-weight="900">18</text><text x="1060" y="355" class="small">validated markers</text>
  <rect x="980" y="470" width="340" height="130" rx="14" fill="#0f172a" stroke="#334155"/>
  <text x="1010" y="515" fill="#fbbf24" font-size="28" font-weight="900">6</text><text x="1060" y="515" class="small">held for review</text>
  <rect x="980" y="630" width="340" height="130" rx="14" fill="#0f172a" stroke="#334155"/>
  <text x="1010" y="675" fill="#ef4444" font-size="28" font-weight="900">2</text><text x="1060" y="675" class="small">rejected / unresolved</text>
`;

await sharp(Buffer.from(base("Operational Damage Map", "Region-aware marker overview for validated AI satellite assessments", mapBody)))
  .png()
  .toFile("docs/screenshots/map.png");

await sharp(Buffer.from(base("AI Assessment Output", "Clear before/after evidence, verdict, confidence, and short explanation", assessmentBody)))
  .png()
  .toFile("docs/screenshots/assessment.png");

await sharp(Buffer.from(base("Commander Review Panel", "Human validation queue for approving, holding, or rejecting AI briefs", commanderBody)))
  .png()
  .toFile("docs/screenshots/commander.png");
