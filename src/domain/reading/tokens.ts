export interface WordToken {
  content: string;
  start: number;
  end: number;
  word: boolean;
}

export function tokenize(sentence: string): WordToken[] {
  const tokens: WordToken[] = [];
  let position = 0;
  for (const match of sentence.matchAll(/[\p{L}\p{M}]+(?:[-'’][\p{L}\p{M}]+)*|\d+(?:[,.]\d+)*/gu)) {
    if (match.index > position)
      tokens.push({
        content: sentence.slice(position, match.index),
        start: position,
        end: match.index,
        word: false,
      });
    tokens.push({
      content: match[0],
      start: match.index,
      end: match.index + match[0].length,
      word: true,
    });
    position = match.index + match[0].length;
  }
  if (position < sentence.length)
    tokens.push({
      content: sentence.slice(position),
      start: position,
      end: sentence.length,
      word: false,
    });
  return tokens;
}
