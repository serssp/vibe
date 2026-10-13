import generation from '../../prompts/text-generation.md?raw';
import word from '../../prompts/word-translation.md?raw';
import grammar from '../../prompts/grammar-explanation.md?raw';

function entry(instructions: string) {
  const version = /^Version: (\S+)$/m.exec(instructions)?.[1];
  if (!version) throw new Error('Missing prompt version');
  return { version, instructions };
}

export const prompts = {
  generation: entry(generation),
  word: entry(word),
  grammar: entry(grammar),
};
