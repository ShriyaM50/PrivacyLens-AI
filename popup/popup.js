const fileInput = document.getElementById('file-input');
const riskBadge = document.getElementById('risk-badge');
const findingsList = document.getElementById('findings-list');
const downloadBtn = document.getElementById('download-btn');
const downloadImgBtn = document.getElementById('download-img-btn');

pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdf.worker.min.js');

const dTable = [
  [0,1,2,3,4,5,6,7,8,9],
  [1,2,3,4,0,6,7,8,9,5],
  [2,3,4,0,1,7,8,9,5,6],
  [3,4,0,1,2,8,9,5,6,7],
  [4,0,1,2,3,9,5,6,7,8],
  [5,9,8,7,6,0,4,3,2,1],
  [6,5,9,8,7,1,0,4,3,2],
  [7,6,5,9,8,2,1,0,4,3],
  [8,7,6,5,9,3,2,1,0,4],
  [9,8,7,6,5,4,3,2,1,0]
];

const pTable = [
  [0,1,2,3,4,5,6,7,8,9],
  [1,5,7,6,2,8,3,0,9,4],
  [5,8,0,3,7,9,6,1,4,2],
  [8,9,1,6,0,4,3,5,2,7],
  [9,4,5,3,1,2,6,8,7,0],
  [4,2,8,6,5,7,3,9,0,1],
  [2,7,9,3,8,0,6,4,1,5],
  [7,0,4,6,9,1,3,2,5,8]
];

function isValidAadhaar(numStr) {
  let checksum = 0;
  const digits = numStr.split('').reverse().map(Number);
  for (let i = 0; i < digits.length; i++) {
    checksum = dTable[checksum][pTable[i % 8][digits[i]]];
  }
  return checksum === 0;
}

const PAN_FOURTH_CHAR = new Set(['P','C','H','A','B','G','J','L','F','T']);

function isValidPAN(pan) {
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) return false;
  return PAN_FOURTH_CHAR.has(pan[3]);
}

function isValidCard(numStr) {
  let sum = 0;
  let shouldDouble = false;
  for (let i = numStr.length - 1; i >= 0; i--) {
    let digit = parseInt(numStr[i], 10);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

async function getOcrWorker() {
  const worker = await Tesseract.createWorker('eng', 1, {
    workerPath: chrome.runtime.getURL('lib/worker.min.js'),
    corePath: chrome.runtime.getURL('lib/tesseract-core-simd.wasm.js'),
    langPath: chrome.runtime.getURL('tessdata/'),
    gzip: true,
    workerBlobURL: false
  });
  return worker;
}

async function getImageMetadata(file) {
  try {
    const tags = await exifr.parse(file, { gps: true });
    return tags;
  } catch (e) {
    return null;
  }
}

function runDetectors(text) {
  const emailPattern = /\S+@\S+\.\S+/g;
  const found = text.match(emailPattern);

  const aadhaarCandidates = text.match(/\d{12}/g) || [];
  const validAadhaars = aadhaarCandidates.filter(isValidAadhaar);

  const panCandidates = text.match(/\b[A-Z]{5}[0-9]{4}[A-Z]\b/g) || [];
  const validPANs = panCandidates.filter(isValidPAN);

  const cardCandidates = text.match(/\d{16}/g) || [];
  const validCards = cardCandidates.filter(isValidCard);

  const awsCandidates = text.match(/AKIA[A-Z0-9]{16}/g) || [];

  const phoneCandidates = text.match(/\d{10}/g) || [];
  const realPhones = phoneCandidates.filter((phone) => {
    const isPartOfAadhaar = validAadhaars.some((aadhaar) => aadhaar.includes(phone));
    const isPartOfCard = validCards.some((card) => card.includes(phone));
    return !isPartOfAadhaar && !isPartOfCard;
  });

  return {
    emailCount: found ? found.length : 0,
    phoneCount: realPhones.length,
    aadhaarCount: validAadhaars.length,
    panCount: validPANs.length,
    cardCount: validCards.length,
    awsCount: awsCandidates.length,
    emailMatches: found || [],
    aadhaarMatches: validAadhaars,
    panMatches: validPANs,
    cardMatches: validCards,
    awsMatches: awsCandidates,
    phoneMatches: realPhones
  };
}

function summarizeMetadata(tags) {
  if (!tags) {
    return { hasGPS: false, lines: [] };
  }

  const lines = [];
  let hasGPS = false;

  if (tags.latitude != null && tags.longitude != null) {
    hasGPS = true;
    lines.push("GPS Location: " + tags.latitude.toFixed(5) + ", " + tags.longitude.toFixed(5));
  }
  if (tags.Make || tags.Model) {
    lines.push("Device: " + [tags.Make, tags.Model].filter(Boolean).join(' '));
  }
  if (tags.DateTimeOriginal) {
    lines.push("Taken: " + tags.DateTimeOriginal);
  }

  return { hasGPS, lines };
}

function computeRiskScore(counts) {
  let score = 0;
  score += counts.aadhaarCount * 25;
  score += counts.cardCount * 25;
  score += counts.panCount * 20;
  score += counts.phoneCount * 10;
  score += counts.emailCount * 10;
  score += counts.awsCount * 25;
  if (counts.hasGPS) score += 25;

  if (score > 100) score = 100;

  let label, cssClass;
  if (score === 0) {
    label = "No Risk"; cssClass = "no-risk";
  } else if (score <= 30) {
    label = "Low Risk"; cssClass = "low-risk";
  } else if (score <= 60) {
    label = "Medium Risk"; cssClass = "medium-risk";
  } else {
    label = "High Risk"; cssClass = "high-risk";
  }

  return { score, label, cssClass };
}

function renderReport(results, metadataInfo) {
  const combinedCounts = Object.assign({}, results, { hasGPS: metadataInfo ? metadataInfo.hasGPS : false });
  const risk = computeRiskScore(combinedCounts);

  riskBadge.textContent = "Risk Score: " + risk.score + "/100 (" + risk.label + ")";
  riskBadge.className = risk.cssClass;

  findingsList.innerHTML = '';

  const sections = [
    { label: 'Email', values: results.emailMatches },
    { label: 'Phone', values: results.phoneMatches },
    { label: 'Aadhaar', values: results.aadhaarMatches },
    { label: 'PAN', values: results.panMatches },
    { label: 'Card', values: results.cardMatches },
    { label: 'AWS Key', values: results.awsMatches }
  ];

  if (metadataInfo && metadataInfo.lines.length > 0) {
    sections.push({ label: 'Metadata', values: metadataInfo.lines });
  }

  const nonEmptySections = sections.filter(s => s.values.length > 0);

  if (nonEmptySections.length === 0) {
    findingsList.innerHTML = '<div class="finding-card">Nothing sensitive found in this file.</div>';
    return;
  }

  for (const section of nonEmptySections) {
    const card = document.createElement('div');
    card.className = 'finding-card';
    card.innerHTML =
      '<div class="finding-label">' + section.label + '</div>' +
      '<div class="finding-value">' + section.values.join('\n') + '</div>';
    findingsList.appendChild(card);
  }
}

function redactText(text, results) {
  let redacted = text;

  const allMatches = [
    ...results.emailMatches.map(v => ({ value: v, label: 'EMAIL' })),
    ...results.aadhaarMatches.map(v => ({ value: v, label: 'AADHAAR' })),
    ...results.panMatches.map(v => ({ value: v, label: 'PAN' })),
    ...results.cardMatches.map(v => ({ value: v, label: 'CARD' })),
    ...results.awsMatches.map(v => ({ value: v, label: 'API_KEY' })),
    ...results.phoneMatches.map(v => ({ value: v, label: 'PHONE' }))
  ];

  for (const match of allMatches) {
    redacted = redacted.split(match.value).join('[REDACTED-' + match.label + ']');
  }

  return redacted;
}

// Draws the original image onto a canvas, then blacks out any word whose text
// is part of a detected sensitive value, using OCR's per-word bounding boxes.
async function redactImage(file, words, results) {
  const sensitiveValues = [
    ...results.emailMatches,
    ...results.aadhaarMatches,
    ...results.panMatches,
    ...results.cardMatches,
    ...results.awsMatches,
    ...results.phoneMatches
  ];

  const imageUrl = URL.createObjectURL(file);
  const img = new Image();
  await new Promise((resolve) => {
    img.onload = resolve;
    img.src = imageUrl;
  });

  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  ctx.fillStyle = 'black';
  for (const word of words) {
    const isSensitive = sensitiveValues.some((value) => value.includes(word.text));
    if (isSensitive) {
      const { x0, y0, x1, y1 } = word.bbox;
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
  }

  URL.revokeObjectURL(imageUrl);
  return canvas;
}

let lastRedactedText = null;
let lastRedactedCanvas = null;

fileInput.addEventListener('change', async (event) => {
  const file = event.target.files[0];
  console.log(file);
  downloadBtn.style.display = 'none';
  downloadImgBtn.style.display = 'none';
  lastRedactedText = null;
  lastRedactedCanvas = null;
  riskBadge.textContent = '';
  riskBadge.className = '';
  findingsList.innerHTML = '';

  if (file.type === 'text/plain') {
    const text = await file.text();
    const results = runDetectors(text);
    renderReport(results);

    lastRedactedText = redactText(text, results);
    downloadBtn.style.display = 'inline-block';

  } else if (file.type === 'application/pdf') {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map(item => item.str).join(' ');
      fullText += pageText + '\n';
    }
    const results = runDetectors(fullText);
    renderReport(results);

    lastRedactedText = redactText(fullText, results);
    downloadBtn.style.display = 'inline-block';

  } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
    const text = result.value;
    const results = runDetectors(text);
    renderReport(results);

    lastRedactedText = redactText(text, results);
    downloadBtn.style.display = 'inline-block';

  } else if (file.type.startsWith('image/')) {
    riskBadge.textContent = "Reading image, please wait...";

    const metadata = await getImageMetadata(file);
    const metadataInfo = summarizeMetadata(metadata);

    const worker = await getOcrWorker();
    const result = await worker.recognize(file);
    const words = result.data.words;
    const text = result.data.text;
    await worker.terminate();

    const results = runDetectors(text);
    renderReport(results, metadataInfo);

    // Only offer an image download if we actually found something to black out.
    const hasTextFindings =
      results.emailMatches.length + results.aadhaarMatches.length +
      results.panMatches.length + results.cardMatches.length +
      results.awsMatches.length + results.phoneMatches.length > 0;

    if (hasTextFindings) {
      lastRedactedCanvas = await redactImage(file, words, results);
      downloadImgBtn.style.display = 'inline-block';
    }

  } else {
    riskBadge.textContent = "This file type isn't supported yet.";
    riskBadge.className = '';
  }
});

downloadBtn.addEventListener('click', () => {
  if (!lastRedactedText) return;

  const blob = new Blob([lastRedactedText], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = 'redacted-file.txt';
  a.click();

  URL.revokeObjectURL(url);
});

downloadImgBtn.addEventListener('click', () => {
  if (!lastRedactedCanvas) return;

  lastRedactedCanvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'redacted-image.png';
    a.click();
    URL.revokeObjectURL(url);
  });
});