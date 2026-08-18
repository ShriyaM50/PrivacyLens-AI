const fileInput = document.getElementById('file-input');
const output = document.getElementById('output');

pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdf.worker.min.js');

// Verhoeff checksum tables — fixed, never change
const d = [
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

const p = [
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
    checksum = d[checksum][p[i % 8][digits[i]]];
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

function runDetectors(text) {
  const emailPattern = /\S+@\S+\.\S+/g;
  const found = text.match(emailPattern);
  let emailText = found ? found.join('\n') : "No email found";

  const aadhaarCandidates = text.match(/\d{12}/g) || [];
  const validAadhaars = aadhaarCandidates.filter(isValidAadhaar);
  let aadhaarText = validAadhaars.length > 0 ? validAadhaars.join('\n') : "No Aadhaar number found";

  const panCandidates = text.match(/\b[A-Z]{5}[0-9]{4}[A-Z]\b/g) || [];
  const validPANs = panCandidates.filter(isValidPAN);
  let panText = validPANs.length > 0 ? validPANs.join('\n') : "No PAN number found";

  const cardCandidates = text.match(/\d{16}/g) || [];
  const validCards = cardCandidates.filter(isValidCard);
  let cardText = validCards.length > 0 ? validCards.join('\n') : "No card number found";

  const awsCandidates = text.match(/AKIA[A-Z0-9]{16}/g) || [];
  let awsText = awsCandidates.length > 0 ? awsCandidates.join('\n') : "No AWS key found";

  const phoneCandidates = text.match(/\d{10}/g) || [];
  const realPhones = phoneCandidates.filter((phone) => {
    const isPartOfAadhaar = validAadhaars.some((aadhaar) => aadhaar.includes(phone));
    const isPartOfCard = validCards.some((card) => card.includes(phone));
    return !isPartOfAadhaar && !isPartOfCard;
  });
  let phoneText = realPhones.length > 0 ? realPhones.join('\n') : "No phone number found";

  return {
    emailCount: found ? found.length : 0,
    phoneCount: realPhones.length,
    aadhaarCount: validAadhaars.length,
    panCount: validPANs.length,
    cardCount: validCards.length,
    awsCount: awsCandidates.length,
    emailText,
    phoneText,
    aadhaarText,
    panText,
    cardText,
    awsText
  };
}

function computeRiskScore(counts) {
  let score = 0;
  score += counts.aadhaarCount * 25;
  score += counts.cardCount * 25;
  score += counts.panCount * 20;
  score += counts.phoneCount * 10;
  score += counts.emailCount * 10;
  score += counts.awsCount * 25;

  if (score > 100) score = 100;

  let label;
  if (score === 0) {
    label = "No Risk";
  } else if (score <= 30) {
    label = "Low Risk";
  } else if (score <= 60) {
    label = "Medium Risk";
  } else {
    label = "High Risk";
  }

  return { score, label };
}

function buildReport(text) {
  const results = runDetectors(text);
  const risk = computeRiskScore(results);

  return (
    "Risk Score: " + risk.score + "/100 (" + risk.label + ")" +
    "\n\nEmail:\n" + results.emailText +
    "\n\nPhone:\n" + results.phoneText +
    "\n\nAadhaar:\n" + results.aadhaarText +
    "\n\nPAN:\n" + results.panText +
    "\n\nCard:\n" + results.cardText +
    "\n\nAWS Key:\n" + results.awsText
  );
}

fileInput.addEventListener('change', async (event) => {
  const file = event.target.files[0];
  console.log(file);

  if (file.type === 'text/plain') {
    const text = await file.text();
    console.log(text);
    output.textContent = buildReport(text);

  } else if (file.type === 'application/pdf') {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    console.log(pdf);

    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map(item => item.str).join(' ');
      fullText += pageText + '\n';
    }
    console.log(fullText);
    output.textContent = buildReport(fullText);

  } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
    const text = result.value;
    console.log(text);
    output.textContent = buildReport(text);

  } else if (file.type.startsWith('image/')) {
    output.textContent = "Reading image, please wait...";

    const worker = await getOcrWorker();
    const result = await worker.recognize(file);
    const text = result.data.text;
    console.log(text);

    await worker.terminate();
    output.textContent = buildReport(text);

  } else {
    output.textContent = "This file type isn't supported yet.";
  }
});