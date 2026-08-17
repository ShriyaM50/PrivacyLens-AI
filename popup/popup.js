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

// PAN validation — structural, not checksum-based
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

// Runs all five detectors on any text string and returns a formatted results string.
// Pulled out into its own function so both the .txt path and the PDF path can reuse it.
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

  // Phone check comes AFTER Aadhaar and Card, since it needs to exclude
  // any 10-digit chunk that's actually just part of one of those.
  const phoneCandidates = text.match(/\d{10}/g) || [];
  const realPhones = phoneCandidates.filter((phone) => {
    const isPartOfAadhaar = validAadhaars.some((aadhaar) => aadhaar.includes(phone));
    const isPartOfCard = validCards.some((card) => card.includes(phone));
    return !isPartOfAadhaar && !isPartOfCard;
  });
  let phoneText = realPhones.length > 0 ? realPhones.join('\n') : "No phone number found";

  return (
    "Email:\n" + emailText +
    "\n\nPhone:\n" + phoneText +
    "\n\nAadhaar:\n" + aadhaarText +
    "\n\nPAN:\n" + panText +
    "\n\nCard:\n" + cardText
  );
}

fileInput.addEventListener('change', async (event) => {
  const file = event.target.files[0];
  console.log(file);

  if (file.type === 'text/plain') {
    const text = await file.text();
    console.log(text);
    output.textContent = runDetectors(text);

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
    output.textContent = runDetectors(fullText);

  } else if (file.type.startsWith('image/')) {
    output.textContent = "Image support coming soon!";

  } else {
    output.textContent = "This file type isn't supported yet.";
  }
});