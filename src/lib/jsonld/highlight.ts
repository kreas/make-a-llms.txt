export function highlightJson(json: string): string {
  const escaped = json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return escaped.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let cls = 'text-ink';
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = 'text-primary-base font-semibold';
        } else {
          cls = 'text-semantic-success';
        }
      } else if (/true|false/.test(match)) {
        cls = 'text-timeline-thinking font-medium';
      } else if (/null/.test(match)) {
        cls = 'text-muted-soft';
      } else {
        cls = 'text-timeline-grep';
      }
      return `<span class="${cls}">${match}</span>`;
    }
  );
}
