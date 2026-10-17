import pdfParse from 'pdf-parse';

export interface ParsedPdfResult {
  text: string;
  numPages: number;
  info?: any;
}

/**
 * Extracts raw textual content from a PDF binary Buffer.
 * 
 * Non-obvious / Interview Talking Point:
 * Resume Text Sanitization:
 * - PDF documents frequently contain weird glyph encodings, null bytes (\u0000),
 *   multiple consecutive line breaks, and page header/footer noise.
 * - Null bytes in PostgreSQL strings crash text insertions (Postgres treats \u0000
 *   as an unexpected C-string terminator).
 * - We strip null bytes and normalize multi-whitespace tokens to preserve clean embeddings.
 */
export async function parsePdfBuffer(buffer: Buffer): Promise<ParsedPdfResult> {
  if (!buffer || buffer.length === 0) {
    throw new Error('PDF buffer is empty or invalid');
  }

  const data = await pdfParse(buffer);

  // Clean and sanitize parsed text
  let cleanedText = data.text
    .replace(/\u0000/g, '') // Strip PostgreSQL-breaking null bytes
    .replace(/\r\n/g, '\n') // Normalize Windows newlines
    .replace(/\n{3,}/g, '\n\n') // Collapse excessive linebreaks
    .replace(/[ \t]{2,}/g, ' ') // Collapse multiple spaces
    .trim();

  if (!cleanedText || cleanedText.length < 20) {
    throw new Error('PDF parsing yielded insufficient textual content (possible scanned/image-only PDF)');
  }

  return {
    text: cleanedText,
    numPages: data.numpages,
    info: data.info,
  };
}
