const fileInput = document.getElementById('file-input');
const output = document.getElementById('output');

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

fileInput.addEventListener('change', async (event) => {
  const file = event.target.files[0];
  console.log(file);

  if (file.type === 'text/plain') {
    const text = await file.text();
    console.log(text);

    // --- Email detector ---
    const emailPattern = /\S+@\S+\.\S+/g;
    const found = text.match(emailPattern);

    let emailText;
    if (found) {
      emailText = found.join('\n');
    } else {
      emailText = "No email found";
    }

    // --- Aadhaar detector (with checksum validation) ---
    const aadhaarCandidates = text.match(/\d{12}/g) || [];
    const validAadhaars = aadhaarCandidates.filter(isValidAadhaar);

    let aadhaarText;
    if (validAadhaars.length > 0) {
      aadhaarText = validAadhaars.join('\n');
    } else {
      aadhaarText = "No Aadhaar number found";
    }

    // --- Phone detector (skip anything that's part of a valid Aadhaar match) ---
    const phoneCandidates = text.match(/\d{10}/g) || [];
    const realPhones = phoneCandidates.filter((phone) => {
      return !validAadhaars.some((aadhaar) => aadhaar.includes(phone));
    });

    let phoneText;
    if (realPhones.length > 0) {
      phoneText = realPhones.join('\n');
    } else {
      phoneText = "No phone number found";
    }

    // --- PAN detector (structural validation) ---
    const panCandidates = text.match(/\b[A-Z]{5}[0-9]{4}[A-Z]\b/g) || [];
    const validPANs = panCandidates.filter(isValidPAN);

    let panText;
    if (validPANs.length > 0) {
      panText = validPANs.join('\n');
    } else {
      panText = "No PAN number found";
    }

    const results =
      "Email:\n" + emailText +
      "\n\nPhone:\n" + phoneText +
      "\n\nAadhaar:\n" + aadhaarText +
      "\n\nPAN:\n" + panText;
    output.textContent = results;

  } else if (file.type === 'application/pdf') {
    output.textContent = "PDF support coming soon!";

  } else if (file.type.startsWith('image/')) {
    output.textContent = "Image support coming soon!";

  } else {
    output.textContent = "This file type isn't supported yet.";
  }
});