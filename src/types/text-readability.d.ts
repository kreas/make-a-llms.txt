declare module 'text-readability' {
  const rs: {
    fleschKincaidGrade(text: string): number;
    fleschReadingEase(text: string): number;
    colemanLiauIndex(text: string): number;
    automatedReadabilityIndex(text: string): number;
    daleChallReadabilityScore(text: string): number;
    difficultWords(text: string): number;
    linsearWriteFormula(text: string): number;
    gunningFog(text: string): number;
    textStandard(text: string, floatOutput?: boolean): string | number;
    syllableCount(text: string, lang?: string): number;
    lexiconCount(text: string, removePunctuaction?: boolean): number;
    sentenceCount(text: string): number;
  };
  export default rs;
}
