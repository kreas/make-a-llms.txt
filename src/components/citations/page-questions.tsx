'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HelpCircle, RefreshCw, AlertCircle, ChevronDown, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface PageQuestionsProps {
  siteId: string;
  pageUrl: string;
}

const MODELS = [
  { id: 'openai', name: 'GPT-5.5', modelId: 'openai/gpt-5.5' },
  { id: 'google', name: 'Gemini 3.5', modelId: 'google/gemini-3.5-flash' },
  { id: 'anthropic', name: 'Claude 4.6', modelId: 'anthropic/claude-sonnet-4.6' },
  { id: 'perplexity', name: 'Perplexity', modelId: 'perplexity/sonar' },
  { id: 'deepseek', name: 'DeepSeek v4', modelId: 'deepseek/deepseek-v4-flash' },
];

interface Block {
  type: 'paragraph' | 'heading1' | 'heading2' | 'heading3' | 'heading4' | 'blockquote' | 'bullet-list' | 'numbered-list';
  lines: string[];
}

function parseTextToBlocks(text: string): Block[] {
  const lines = text.split('\n');
  const blocks: Block[] = [];
  let currentBlock: Block | null = null;

  for (let line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') {
      if (currentBlock) {
        blocks.push(currentBlock);
        currentBlock = null;
      }
      continue;
    }

    if (trimmed.startsWith('# ')) {
      if (currentBlock) blocks.push(currentBlock);
      blocks.push({ type: 'heading1', lines: [trimmed.slice(2).trim()] });
      currentBlock = null;
    } else if (trimmed.startsWith('## ')) {
      if (currentBlock) blocks.push(currentBlock);
      blocks.push({ type: 'heading2', lines: [trimmed.slice(3).trim()] });
      currentBlock = null;
    } else if (trimmed.startsWith('### ')) {
      if (currentBlock) blocks.push(currentBlock);
      blocks.push({ type: 'heading3', lines: [trimmed.slice(4).trim()] });
      currentBlock = null;
    } else if (trimmed.startsWith('#### ')) {
      if (currentBlock) blocks.push(currentBlock);
      blocks.push({ type: 'heading4', lines: [trimmed.slice(5).trim()] });
      currentBlock = null;
    } else if (trimmed.startsWith('> ')) {
      const content = trimmed.slice(2).trim();
      if (currentBlock && currentBlock.type === 'blockquote') {
        currentBlock.lines.push(content);
      } else {
        if (currentBlock) blocks.push(currentBlock);
        currentBlock = { type: 'blockquote', lines: [content] };
      }
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const content = trimmed.slice(2).trim();
      if (currentBlock && currentBlock.type === 'bullet-list') {
        currentBlock.lines.push(content);
      } else {
        if (currentBlock) blocks.push(currentBlock);
        currentBlock = { type: 'bullet-list', lines: [content] };
      }
    } else if (/^\d+\.\s/.test(trimmed)) {
      const match = trimmed.match(/^(\d+)\.\s(.*)/);
      const content = match ? match[2].trim() : trimmed;
      if (currentBlock && currentBlock.type === 'numbered-list') {
        currentBlock.lines.push(content);
      } else {
        if (currentBlock) blocks.push(currentBlock);
        currentBlock = { type: 'numbered-list', lines: [content] };
      }
    } else {
      if (currentBlock && currentBlock.type === 'paragraph') {
        currentBlock.lines.push(line);
      } else {
        if (currentBlock) blocks.push(currentBlock);
        currentBlock = { type: 'paragraph', lines: [line] };
      }
    }
  }

  if (currentBlock) {
    blocks.push(currentBlock);
  }

  return blocks;
}

function getHostname(urlStr: string): string {
  try {
    return new URL(urlStr).hostname.replace('www.', '');
  } catch (e) {
    return 'source';
  }
}

export function PageQuestions({ siteId, pageUrl }: PageQuestionsProps) {
  const qc = useQueryClient();
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [activeModelId, setActiveModelId] = useState<string>('openai/gpt-5.5');

  const q = useQuery({
    queryKey: ['page-questions', siteId, pageUrl],
    queryFn: async (): Promise<{ questions: string[] }> => {
      const res = await fetch(
        `/api/sites/${siteId}/questions?pageUrl=${encodeURIComponent(pageUrl)}`,
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error?.message || 'Failed to load questions');
      }
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const regenerate = useMutation({
    mutationFn: async (): Promise<{ questions: string[] }> => {
      const res = await fetch(`/api/sites/${siteId}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageUrl }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error?.message || 'Failed to regenerate questions');
      }
      return res.json();
    },
    onSuccess: () => {
      setExpandedIndex(null);
      qc.invalidateQueries({ queryKey: ['page-questions', siteId, pageUrl] });
    },
  });

  const questions = q.data?.questions || [];
  const expandedQuestionText = expandedIndex !== null ? questions[expandedIndex] : null;

  const answerQuery = useQuery({
    queryKey: ['question-answer', siteId, pageUrl, expandedQuestionText, activeModelId],
    enabled: !!expandedQuestionText && !!activeModelId,
    queryFn: async (): Promise<{
      answer: string;
      citations?: { type: string; sourceType: string; id: string; url: string }[];
    }> => {
      const res = await fetch(
        `/api/sites/${siteId}/questions/answer?pageUrl=${encodeURIComponent(
          pageUrl,
        )}&question=${encodeURIComponent(expandedQuestionText!)}&model=${encodeURIComponent(
          activeModelId,
        )}`,
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error?.message || 'Failed to load answer');
      }
      return res.json();
    },
    staleTime: 10 * 60 * 1000,
  });

  const regenerateAnswer = useMutation({
    mutationFn: async (): Promise<{
      answer: string;
      citations?: { type: string; sourceType: string; id: string; url: string }[];
    }> => {
      const res = await fetch(`/api/sites/${siteId}/questions/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageUrl,
          question: expandedQuestionText,
          model: activeModelId,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error?.message || 'Failed to regenerate answer');
      }
      return res.json();
    },
    onSuccess: (data) => {
      qc.setQueryData(
        ['question-answer', siteId, pageUrl, expandedQuestionText, activeModelId],
        data,
      );
    },
  });

  const isLoading = q.isLoading || regenerate.isPending;
  const isError = q.isError || regenerate.isError;
  const errorMsg =
    (q.error as Error | null)?.message ||
    (regenerate.error as Error | null)?.message ||
    'An error occurred.';

  function renderInline(text: string): React.ReactNode {
    if (!text) return '';

    const codeParts = text.split(/(`[^`]+`)/g);
    
    return codeParts.map((codePart, idx1) => {
      if (codePart.startsWith('`') && codePart.endsWith('`')) {
        return (
          <code key={`code-${idx1}`} className="px-1 py-0.5 bg-canvas-soft border border-hairline rounded font-mono text-xs text-ink mx-0.5">
            {codePart.slice(1, -1)}
          </code>
        );
      }

      const linkParts = codePart.split(/(\[[^\]]+\]\([^)]+\))/g);
      return linkParts.map((linkPart, idx2) => {
        if (linkPart.startsWith('[') && linkPart.includes('](')) {
          const match = linkPart.match(/\[([^\]]+)\]\(([^)]+)\)/);
          if (match) {
            const linkText = match[1];
            const url = match[2];
            return (
              <a
                key={`link-${idx1}-${idx2}`}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-timeline-thinking hover:underline font-medium inline-flex items-center gap-0.5"
              >
                {renderInline(linkText)}
                <ExternalLink className="h-3 w-3 inline" />
              </a>
            );
          }
        }

        const boldParts = linkPart.split(/(\*\*[^*]+\*\*)/g);
        return boldParts.map((boldPart, idx3) => {
          if (boldPart.startsWith('**') && boldPart.endsWith('**')) {
            return (
              <strong key={`bold-${idx1}-${idx2}-${idx3}`} className="font-semibold text-ink">
                {renderInline(boldPart.slice(2, -2))}
              </strong>
            );
          }

          const italicParts = boldPart.split(/(\*[^*]+\*)/g);
          return italicParts.map((italicPart, idx4) => {
            if (italicPart.startsWith('*') && italicPart.endsWith('*')) {
              return (
                <em key={`italic-${idx1}-${idx2}-${idx3}-${idx4}`} className="italic text-ink/90">
                  {italicPart.slice(1, -1)}
                </em>
              );
            }

            return italicPart;
          });
        });
      });
    });
  }

  function renderMarkdown(text: string) {
    if (!text) return null;
    
    const parts = text.split(/(```[\s\S]*?```)/g);
    
    return parts.map((part, i) => {
      if (part.startsWith('```') && part.endsWith('```')) {
        const content = part.slice(3, -3).trim();
        const firstLineEnd = content.indexOf('\n');
        const hasLanguage = firstLineEnd !== -1 && firstLineEnd < 15;
        const displayContent = hasLanguage ? content.slice(firstLineEnd + 1) : content;
        return (
          <pre key={`codeblock-${i}`} className="my-3 p-3 bg-canvas-soft border border-hairline rounded-lg font-mono text-[11px] overflow-x-auto text-ink leading-relaxed">
            <code>{displayContent}</code>
          </pre>
        );
      }

      const blocks = parseTextToBlocks(part);
      
      return blocks.map((block, j) => {
        const key = `block-${i}-${j}`;
        switch (block.type) {
          case 'heading1':
            return <h1 key={key} className="text-lg font-bold text-ink mt-4 mb-2 first:mt-0 font-sans">{renderInline(block.lines.join(' '))}</h1>;
          case 'heading2':
            return <h2 key={key} className="text-base font-semibold text-ink mt-3 mb-2 first:mt-0 font-sans">{renderInline(block.lines.join(' '))}</h2>;
          case 'heading3':
            return <h3 key={key} className="text-sm font-semibold text-ink mt-2.5 mb-1.5 first:mt-0 font-sans">{renderInline(block.lines.join(' '))}</h3>;
          case 'heading4':
            return <h4 key={key} className="text-xs font-semibold text-ink mt-2 mb-1 first:mt-0 font-sans">{renderInline(block.lines.join(' '))}</h4>;
          case 'blockquote':
            return (
              <blockquote key={key} className="border-l-2 border-hairline-strong pl-3 py-1 my-2 text-muted-strong italic font-sans text-[13px] bg-canvas-soft/40 pr-2 rounded-r">
                {renderInline(block.lines.join(' '))}
              </blockquote>
            );
          case 'bullet-list':
            return (
              <ul key={key} className="list-disc pl-5 my-2 text-[13px] text-body leading-relaxed font-sans space-y-1">
                {block.lines.map((line, idx) => (
                  <li key={idx}>{renderInline(line)}</li>
                ))}
              </ul>
            );
          case 'numbered-list':
            return (
              <ol key={key} className="list-decimal pl-5 my-2 text-[13px] text-body leading-relaxed font-sans space-y-1">
                {block.lines.map((line, idx) => (
                  <li key={idx}>{renderInline(line)}</li>
                ))}
              </ol>
            );
          case 'paragraph':
          default:
            return (
              <p key={key} className="mb-2.5 last:mb-0 text-[13px] text-body leading-relaxed font-sans">
                {renderInline(block.lines.join('\n'))}
              </p>
            );
        }
      });
    });
  }

  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="flex items-center justify-between gap-3 border-b border-hairline pb-4">
        <div>
          <h3 className="text-base font-semibold text-ink">Queries</h3>
          <p className="text-xs text-body mt-0.5">
            How would AI answer a question based on the page
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => regenerate.mutate()}
          disabled={isLoading}
          className="h-9 gap-1.5 border-hairline-strong text-ink hover:bg-canvas-soft transition-all duration-200"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', regenerate.isPending && 'animate-spin')} />
          <span>Regenerate</span>
        </Button>
      </div>

      {isLoading ? (
        <div className="rounded-xl bg-canvas-soft py-16 flex flex-col items-center justify-center gap-4 border border-hairline">
          <pre
            aria-hidden
            className="font-mono text-sm leading-tight text-ink animate-pulse"
          >{` /\_/\
( o.o )
 > ^ <`}</pre>
          <p className="text-sm text-body">Generating questions…</p>
        </div>
      ) : isError ? (
        <div className="border border-hairline rounded-xl p-4 bg-destructive/10 text-destructive text-sm flex gap-3 items-start">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Failed to load questions</p>
            <p className="text-xs mt-1 opacity-90">{errorMsg}</p>
          </div>
        </div>
      ) : questions.length === 0 ? (
        <div className="rounded-xl bg-canvas-soft py-16 flex flex-col items-center justify-center gap-2 border border-hairline text-center px-4">
          <HelpCircle className="h-8 w-8 text-muted-soft" />
          <p className="text-sm font-medium text-ink">No questions generated</p>
          <p className="text-xs text-body max-w-xs">
            Try clicking the regenerate button to analyze the page content and generate suggestions.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4 animate-fade-in">
          {questions.map((qText, index) => (
            <div
              key={index}
              className="flex flex-col rounded-xl border border-hairline bg-surface-card hover:border-hairline-strong hover:shadow-[0_4px_20px_rgba(0,0,0,0.02)] transition-all duration-300 group overflow-hidden"
            >
              <button
                type="button"
                onClick={() => {
                  if (expandedIndex === index) {
                    setExpandedIndex(null);
                  } else {
                    setExpandedIndex(index);
                  }
                }}
                className="flex items-start gap-4 p-4 text-left w-full focus:outline-none"
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-timeline-thinking/20 text-timeline-thinking border border-timeline-thinking/30 group-hover:bg-primary/10 group-hover:text-primary group-hover:border-primary/20 transition-colors duration-300">
                  <HelpCircle className="h-4 w-4" />
                </div>
                <p className="text-sm font-medium text-ink leading-relaxed pt-0.5 flex-grow pr-4">
                  {qText}
                </p>
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-transparent text-muted-soft group-hover:text-ink transition-colors">
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 transition-transform duration-300',
                      expandedIndex === index && 'rotate-180',
                    )}
                  />
                </div>
              </button>

              {expandedIndex === index && (
                <div className="border-t border-hairline bg-canvas-soft/30 p-4 animate-fade-in flex flex-col gap-4">
                  <div className="flex items-center justify-between gap-3 border-b border-hairline pb-3">
                    <div className="flex rounded-md bg-canvas-soft p-0.5 border border-hairline">
                      {MODELS.map((model) => (
                        <button
                          key={model.id}
                          type="button"
                          onClick={() => setActiveModelId(model.modelId)}
                          className={cn(
                            'rounded px-2.5 py-1 text-xs font-medium transition-all select-none border border-transparent',
                            activeModelId === model.modelId
                              ? 'bg-surface-card text-ink shadow-xs border-hairline-strong/10'
                              : 'text-muted-strong hover:text-ink',
                          )}
                        >
                          {model.name}
                        </button>
                      ))}
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => regenerateAnswer.mutate()}
                      disabled={answerQuery.isLoading || regenerateAnswer.isPending}
                      title="Regenerate Answer"
                      className="h-8 w-8 rounded-lg border border-hairline-strong/30 hover:bg-canvas-soft text-ink shrink-0"
                    >
                      <RefreshCw
                        className={cn(
                          'h-3.5 w-3.5',
                          (answerQuery.isLoading || regenerateAnswer.isPending) && 'animate-spin',
                        )}
                      />
                    </Button>
                  </div>

                  <div className="min-h-[60px] text-sm text-body">
                    {answerQuery.isError || regenerateAnswer.isError ? (
                      <div className="p-3 bg-destructive/5 text-destructive rounded-lg border border-destructive/10 text-xs flex gap-2 items-start">
                        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-semibold">Failed to load AI answer</p>
                          <p className="opacity-95 mt-0.5">
                            {(answerQuery.error as Error | null)?.message ||
                              (regenerateAnswer.error as Error | null)?.message ||
                              'An error occurred.'}
                          </p>
                        </div>
                      </div>
                    ) : answerQuery.isLoading || regenerateAnswer.isPending ? (
                      <div className="flex flex-col gap-2.5 animate-pulse py-2">
                        <div className="h-4 bg-muted-soft/40 rounded w-11/12" />
                        <div className="h-4 bg-muted-soft/40 rounded w-full" />
                        <div className="h-4 bg-muted-soft/40 rounded w-10/12" />
                      </div>
                    ) : answerQuery.data?.answer ? (
                      <div className="animate-fade-in pr-2 flex flex-col gap-4">
                        <div>
                          {renderMarkdown(answerQuery.data.answer)}
                        </div>
                        {answerQuery.data.citations && answerQuery.data.citations.length > 0 && (
                          <div className="border-t border-hairline pt-3 mt-1 flex flex-col gap-2">
                            <h4 className="text-[10px] font-semibold text-muted-strong uppercase tracking-wider">
                              Sources & Citations
                            </h4>
                            <div className="flex flex-wrap gap-1.5">
                              {answerQuery.data.citations.map((citation, idx) => (
                                <a
                                  key={idx}
                                  href={citation.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-canvas-soft border border-hairline rounded text-[11px] text-muted-strong hover:text-ink hover:bg-canvas-soft/80 transition-colors animate-fade-in"
                                >
                                  <span className="flex h-3.5 w-3.5 items-center justify-center rounded bg-timeline-thinking/10 text-timeline-thinking text-[9px] font-semibold border border-timeline-thinking/20">
                                    {idx + 1}
                                  </span>
                                  <span className="truncate max-w-[180px] font-mono text-[10px]">
                                    {getHostname(citation.url)}
                                  </span>
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-soft italic">No answer available.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
