const fileInput = document.getElementById('file-input');
const output = document.getElementById('output');

fileInput.addEventListener('change', async (event) => {
  const file = event.target.files[0];
  console.log(file);

  const text = await file.text();
  console.log(text);

  const emailPattern = /\S+@\S+\.\S+/;
  const found = text.match(emailPattern);
  console.log(found);

  const phonePattern = /\d{10}/;
  const foundPhone = text.match(phonePattern);
  console.log(foundPhone);

  const results = "Email: " + found + "\nPhone: " + foundPhone;
  output.textContent = results;
});