/** Saves text generated in the browser as a file (nothing is sent to a server). */
export function downloadTextFile(
  fileName: string,
  content: string,
  mimeType = "text/csv;charset=utf-8",
): void {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();

  // Revoked on the next tick so the download has started.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
