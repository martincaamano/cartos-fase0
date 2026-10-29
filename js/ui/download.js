// Hands a file made on the device to the user: the share sheet where there
// is one for files (iPhone: Guardar en Archivos), a download elsewhere.
// Call it straight from a tap: iOS only opens the share sheet then.

export async function saveFile(name, text, type = 'text/csv') {
  const file = new File([text], name, { type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
    } catch (err) {
      // Closing the share sheet is not an error.
      if (err?.name !== 'AbortError') throw err;
    }
    return;
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
