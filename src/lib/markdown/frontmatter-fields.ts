export function parseFrontmatterFieldsSafe(markdown: string): { fields: Record<string, string>; body: string } {
  const fields: Record<string, string> = {};
  let body = markdown;
  let head = '';

  const trimmed = markdown.trim();
  if (trimmed.startsWith('---')) {
    let closing = trimmed.indexOf('\n---', 3);
    let delimiterLength = 4;
    if (closing === -1) {
      closing = trimmed.indexOf('\r\n---', 3);
      delimiterLength = 5;
    }
    if (closing !== -1) {
      let headStart = 3;
      if (trimmed[headStart] === '\r') headStart++;
      if (trimmed[headStart] === '\n') headStart++;
      head = trimmed.slice(headStart, closing);

      let bodyStart = closing + delimiterLength;
      if (trimmed[bodyStart] === '\r') bodyStart++;
      if (trimmed[bodyStart] === '\n') bodyStart++;
      body = trimmed.slice(bodyStart);
    }
  } else {
    const sepIndex = trimmed.indexOf('\n\n');
    if (sepIndex !== -1) {
      head = trimmed.slice(0, sepIndex);
      body = trimmed.slice(sepIndex + 2);
    } else {
      const crlfSepIndex = trimmed.indexOf('\r\n\r\n');
      if (crlfSepIndex !== -1) {
        head = trimmed.slice(0, crlfSepIndex);
        body = trimmed.slice(crlfSepIndex + 4);
      }
    }
  }

  if (head) {
    for (const line of head.split(/\r?\n/)) {
      const colon = line.indexOf(':');
      if (colon !== -1) {
        const key = line.slice(0, colon).trim();
        const value = line.slice(colon + 1).trim();
        fields[key] = value;
      }
    }
  }

  return { fields, body };
}
