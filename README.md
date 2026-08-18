# PrivacyLens AI 🔍

A browser extension that scans files for hidden personal information before you share them — entirely on your device, with nothing uploaded anywhere.

## The problem

Every day, people share resumes, screenshots, PDFs, and documents without realizing they may contain hidden sensitive data — Aadhaar numbers, PAN numbers, phone numbers, email addresses, API keys, credit card numbers. Existing privacy-scanning tools are largely built for enterprises and aren't accessible to individual users.

## What it does

PrivacyLens AI scans a file you pick (text, PDF, or image) and detects:

- 📧 Email addresses
- 📱 Phone numbers
- 🆔 Aadhaar numbers — validated using the **Verhoeff checksum algorithm**, so random 12-digit numbers aren't falsely flagged
- 🪪 PAN numbers — validated against the real structural format (5 letters, 4 digits, 1 letter, with a valid holder-type code)
- 💳 Credit/debit card numbers — validated using the **Luhn algorithm**
- 🔑 AWS API keys

It then generates a **weighted risk score (0–100)** and a risk label (No/Low/Medium/High Risk), based on how sensitive each type of finding is.

## Why everything runs on-device

A privacy tool that uploads your Aadhaar number or API keys to a server to "check" them would defeat its own purpose. Every library used here — `pdf.js` for PDF parsing and `tesseract.js` for OCR — is bundled directly into the extension and runs fully offline, in the browser's own JavaScript engine. No file content ever leaves your machine.

## Supported file types

| Type | How it's read |
|---|---|
| `.txt` | Native `File.text()` |
| `.pdf` | `pdf.js` — real text extraction from the PDF's structure |
| `.png` / `.jpg` / images | `tesseract.js` — on-device OCR |

## Tech stack

- Vanilla JavaScript (no frameworks) — Manifest V3 Chrome extension
- [`pdf.js`](https://mozilla.github.io/pdf.js/) for PDF text extraction
- [`tesseract.js`](https://tesseract.projectnaptha.com/) for on-device OCR
- Regex + checksum validation (Verhoeff, Luhn) for detection

## Install (developer mode)

1. Clone this repo
2. Go to `chrome://extensions`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** and select the project folder
5. Click the extension icon and choose a file to scan

## Project structure
PrivacyLens-AI/
├── manifest.json
├── popup/
│ ├── popup.html
│ ├── popup.css
│ └── popup.js
├── lib/ — bundled pdf.js and tesseract.js library files
├── tessdata/ — OCR language data (English)
└── icons/
## Roadmap

- [ ] More detectors (generic secrets/tokens, IFSC codes)
- [ ] Redact/mask sensitive values and export a cleaned copy
- [ ] Styled risk-score UI (currently plain text output)
- [ ] Free-form PII detection (names, addresses) via a lightweight NER model
- [ ] Auto-scan on upload for common sites (Gmail, Drive) via a content script

## Author

Built by [Shriya Mittal](https://github.com/ShriyaM50) as a learning project — every line of detection logic was written and understood from scratch, including the Verhoeff and Luhn checksum algorithms.
