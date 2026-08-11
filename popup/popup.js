const fileInput = document.getElementById('file-input');

fileInput.addEventListener('change', async (event) => {
  const file = event.target.files[0];
  console.log(file);

  const text = await file.text();
  console.log(text);
});