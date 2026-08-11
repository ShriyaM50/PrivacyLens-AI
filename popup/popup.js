const fileInput = document.getElementById('file-input');
const output = document.getElementById('output');

fileInput.addEventListener('change', async (event) => {
  const file = event.target.files[0];
  console.log(file);

  const text = await file.text();
  console.log(text);

  const emailPattern = /\S+@\S+\.\S+/g;
  const found = text.match(emailPattern);
  console.log(found);

  const phonePattern = /\d{10}/g;
  const foundPhone = text.match(phonePattern);
  console.log(foundPhone);

  let emailText;
  if (found) {
    emailText = found.join('\n');
  } else {
    emailText = "No email found";
  }

  let phoneText;
  if (foundPhone) {
    phoneText = foundPhone.join('\n');
  } else {
    phoneText = "No phone number found";
  }

  const results = "Email:\n" + emailText + "\n\nPhone:\n" + phoneText;
  output.textContent = results;
});