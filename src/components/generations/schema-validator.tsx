'use client';

import { useMemo } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react';

export interface ValidationError {
  type: 'error' | 'warning' | 'info';
  field: string;
  message: string;
  recommendation: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  detectedTypes: string[];
}

interface SchemaValidatorProps {
  jsonLdString: string;
}

export function SchemaValidator({ jsonLdString }: SchemaValidatorProps) {
  const validation = useMemo((): {
    parsed: any;
    result: ValidationResult;
    parseError: string | null;
  } => {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      detectedTypes: [],
    };

    let parsed: any = null;
    try {
      parsed = JSON.parse(jsonLdString);
    } catch (e: any) {
      result.isValid = false;
      result.errors.push({
        type: 'error',
        field: 'JSON syntax',
        message: 'Invalid JSON syntax. Unable to parse the schema.',
        recommendation: 'Check for missing commas, unclosed quotes, or brackets in your frontmatter formatting.',
      });
      return { parsed: null, result, parseError: e.message };
    }

    // Begin validation checks on parsed object
    const errors: ValidationError[] = [];

    // Helper to register an error
    const addIssue = (type: 'error' | 'warning' | 'info', field: string, message: string, recommendation: string) => {
      errors.push({ type, field, message, recommendation });
    };

    // 1. Check @context
    const context = parsed['@context'];
    if (!context) {
      addIssue('error', '@context', 'Missing @context property.', 'Add "@context": "https://schema.org" to the schema root.');
    } else if (context !== 'https://schema.org' && context !== 'http://schema.org') {
      addIssue('warning', '@context', `Unexpected @context value "${context}".`, 'Set @context to "https://schema.org" as recommended by Schema.org.');
    }

    // 2. Check @type
    const type = parsed['@type'];
    if (!type) {
      addIssue('error', '@type', 'Missing @type property.', 'Define a schema type (e.g. Article, BlogPosting, Product, etc.) in the page frontmatter.');
    } else {
      const types = Array.isArray(type) ? type.map(String) : [String(type)];
      result.detectedTypes = types;

      // Validate standard properties based on type
      types.forEach((t) => {
        // Warning for generic WebPage
        if (t === 'WebPage') {
          addIssue(
            'info',
            '@type',
            'Using generic WebPage schema.',
            'Consider specifying a more specific schema @type like Article, BlogPosting, Product, or Service to get better search engine treatment.'
          );
        }

        // Helper to check standard fields
        const checkField = (field: string, required: boolean, customRec?: string) => {
          const val = parsed[field];
          const path = field;
          if (val === undefined || val === null || val === '') {
            const level = required ? 'error' : 'warning';
            addIssue(
              level,
              path,
              `${required ? 'Required' : 'Recommended'} property "${field}" is missing or empty.`,
              customRec || `Add a value for "${field}" in the page frontmatter.`
            );
          } else {
            // Check placeholders
            if (typeof val === 'string' && (val.includes('(none)') || val.trim().toLowerCase() === 'site owner' || val.trim().toLowerCase() === 'untitled page')) {
              addIssue(
                'warning',
                path,
                `Property "${field}" contains a default or placeholder value "${val}".`,
                `Replace the placeholder with real metadata in your markdown frontmatter.`
              );
            }
            // Check URLs
            if (field === 'url' || field === 'image' || field === 'canonical') {
              if (typeof val === 'string' && val.trim() !== '' && !val.startsWith('http://') && !val.startsWith('https://') && !val.startsWith('/')) {
                addIssue(
                  'warning',
                  path,
                  `Property "${field}" has an invalid URL format: "${val}".`,
                  `Ensure the URL is a fully qualified web address (starts with http:// or https://) or valid path.`
                );
              }
            }
            // Check Dates
            if (field === 'datePublished' || field === 'dateModified' || field === 'dateCreated') {
              if (typeof val === 'string' && val.trim() !== '') {
                const isValidDate = !isNaN(Date.parse(val)) && /^\d{4}-\d{2}-\d{2}/.test(val);
                if (!isValidDate) {
                  addIssue(
                    'warning',
                    path,
                    `Property "${field}" has an invalid date format: "${val}".`,
                    `Provide a date in standard YYYY-MM-DD format.`
                  );
                }
              }
            }
          }
        };

        // Schema-specific rules
        if (t === 'BlogPosting' || t === 'Article' || t === 'NewsArticle') {
          checkField('headline', true, 'Add a "title" field in your markdown frontmatter to populate the schema headline.');
          checkField('description', false, 'Add a "description" field in the page frontmatter.');
          checkField('url', false, 'Ensure the page has a valid canonical URL or page path.');
          checkField('image', false, 'Add an "image" cover image URL to frontmatter. Large images (1200px+) are recommended for search previews.');
          checkField('datePublished', false, 'Add a publication date to the frontmatter (e.g., date: 2026-05-28).');
          checkField('dateModified', false, 'Add a dateModified field or update the page date.');

          // Author validation
          const author = parsed['author'];
          if (!author) {
            addIssue('error', 'author', 'Required property "author" is missing.', 'Specify the author in the page frontmatter or site configuration.');
          } else if (typeof author === 'object' && author !== null) {
            const authorType = author['@type'];
            const authorName = author['name'];
            if (!authorType) {
              addIssue('warning', 'author.@type', 'Author object is missing @type (Person or Organization).', 'Add "@type": "Person" or "@type": "Organization" to the author object.');
            }
            if (!authorName || authorName.trim() === '') {
              addIssue('error', 'author.name', 'Author name is required.', 'Add an author name in the page frontmatter.');
            } else if (authorName.toLowerCase().includes('site owner') || authorName.toLowerCase().includes('fresh, handmade burgers')) {
              // Warn about default author
              addIssue(
                'info',
                'author.name',
                `Author name falls back to brand default: "${authorName}".`,
                'If this page has a specific writer, add an "author" field in the page frontmatter to override the default.'
              );
            }
          }

          // Publisher validation
          const publisher = parsed['publisher'];
          if (!publisher) {
            addIssue('error', 'publisher', 'Required property "publisher" is missing.', 'Ensure publisher info is configured.');
          } else if (typeof publisher === 'object' && publisher !== null) {
            const pubType = publisher['@type'];
            const pubName = publisher['name'];
            const pubLogo = publisher['logo'];

            if (!pubType) {
              addIssue('warning', 'publisher.@type', 'Publisher object is missing @type.', 'Set "@type": "Organization" for the publisher.');
            }
            if (!pubName || pubName.trim() === '') {
              addIssue('error', 'publisher.name', 'Publisher name is missing.', 'Set the site/publisher name.');
            }
            if (pubLogo && typeof pubLogo === 'object') {
              const logoUrl = pubLogo['url'];
              if (!logoUrl || logoUrl.trim() === '') {
                addIssue('warning', 'publisher.logo.url', 'Publisher logo URL is empty.', 'Provide a valid image URL for the publisher logo.');
              } else if (logoUrl.includes('favicon.ico')) {
                addIssue(
                  'warning',
                  'publisher.logo.url',
                  'Publisher logo is falling back to a favicon.ico.',
                  'Google recommends a high-resolution rectangular brand logo (minimum 60px height) rather than a small square favicon.'
                );
              }
            } else {
              addIssue('warning', 'publisher.logo', 'Publisher logo is missing.', 'Provide a logo object with a high-resolution logo URL.');
            }
          }
        } else if (t === 'Product') {
          checkField('name', true, 'Add a "title" field in your markdown frontmatter to populate the product name.');
          checkField('description', false, 'Add a product description in the page frontmatter.');
          checkField('image', false, 'Add an "image" field with product image URL in the frontmatter.');
          checkField('url', false, 'Ensure the page has a valid canonical URL.');

          // Brand validation
          const brand = parsed['brand'];
          if (!brand) {
            addIssue('warning', 'brand', 'Recommended property "brand" is missing.', 'Add a brand name or object to specify the product brand.');
          } else if (typeof brand === 'object' && brand !== null) {
            const brandName = brand['name'];
            if (!brandName || brandName.trim() === '') {
              addIssue('warning', 'brand.name', 'Brand name is missing.', 'Add a brand name.');
            }
          }
        } else if (t === 'JobPosting') {
          checkField('title', true, 'Add a "title" field in your markdown frontmatter for the job title.');
          checkField('description', true, 'Job description is required.');
          checkField('url', false, 'Ensure the job page has a canonical URL.');

          const org = parsed['hiringOrganization'];
          if (!org) {
            addIssue('error', 'hiringOrganization', 'Required property "hiringOrganization" is missing.', 'Add a hiring organization name or object.');
          } else if (typeof org === 'object' && org !== null) {
            const orgName = org['name'];
            if (!orgName || orgName.trim() === '') {
              addIssue('error', 'hiringOrganization.name', 'Hiring organization name is missing.', 'Add organization name.');
            }
          }
        } else if (t === 'Place') {
          checkField('name', true, 'Add a "title" field in your markdown frontmatter for the place name.');
          checkField('description', false, 'Add a place description in the page frontmatter.');
          checkField('image', false, 'Add an "image" field with place photo URL in the frontmatter.');
          checkField('url', false, 'Ensure the place page has a canonical URL.');
        } else {
          // WebPage / Default
          checkField('name', true, 'Add a "title" field in your markdown frontmatter.');
          checkField('description', false, 'Add a description in the page frontmatter to improve SEO.');
          checkField('url', false, 'Ensure the page has a valid canonical URL.');
        }
      });
    }

    result.errors = errors;
    result.isValid = errors.filter((e) => e.type === 'error').length === 0;

    return { parsed, result, parseError: null };
  }, [jsonLdString]);

  const { result, parseError } = validation;

  const errorCount = result.errors.filter((e) => e.type === 'error').length;
  const warningCount = result.errors.filter((e) => e.type === 'warning').length;

  return (
    <div className="bg-canvas-soft border border-hairline rounded-lg overflow-hidden flex flex-col animate-fade-in-up">
      {/* Header */}
      <div className="flex justify-between items-center px-4 py-2.5 border-b border-hairline bg-surface-card/40 gap-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-muted-strong font-medium">Local Schema Validator</span>
          {result.detectedTypes.map((t) => (
            <span
              key={t}
              className="px-1.5 py-0.5 text-[10px] font-semibold tracking-wide rounded bg-surface-strong/50 border border-hairline-strong text-ink font-mono"
            >
              {t}
            </span>
          ))}
        </div>
      </div>

      <div className="p-4 flex flex-col gap-4 overflow-y-auto max-h-[400px]">
        {/* Validation Banner */}
        {parseError ? (
          <div className="flex items-start gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-700 dark:text-red-400">
            <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-sm">JSON Parsing Error</h4>
              <p className="text-xs mt-1 leading-relaxed">{parseError}</p>
            </div>
          </div>
        ) : errorCount > 0 ? (
          <div className="flex items-start gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-700 dark:text-red-400">
            <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-sm">{errorCount} Error{errorCount > 1 ? 's' : ''} and {warningCount} Warning{warningCount > 1 ? 's' : ''} found</h4>
              <p className="text-xs mt-1 leading-relaxed">This schema has critical errors that will prevent search engines from parsing it correctly.</p>
            </div>
          </div>
        ) : warningCount > 0 ? (
          <div className="flex items-start gap-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-sm">{warningCount} Warning{warningCount > 1 ? 's' : ''} found</h4>
              <p className="text-xs mt-1 leading-relaxed">The schema syntax is valid, but missing recommended fields or using fallback placeholders.</p>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-5 w-5 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-sm">Validation Passed</h4>
              <p className="text-xs mt-1 leading-relaxed">Your JSON-LD schema is valid and conforms fully to Schema.org and search guidelines!</p>
            </div>
          </div>
        )}

        {/* Detailed Issues List */}
        {result.errors.length > 0 ? (
          <div className="flex flex-col gap-2">
            <h4 className="text-xs font-semibold text-muted-strong uppercase tracking-wider select-none">Issues & Recommendations</h4>
            <div className="flex flex-col gap-2">
              {result.errors.map((err, idx) => (
                <div
                  key={idx}
                  className={`flex flex-col gap-1.5 p-3 rounded-lg border ${
                    err.type === 'error'
                      ? 'bg-red-500/5 border-red-500/10'
                      : err.type === 'warning'
                      ? 'bg-amber-500/5 border-amber-500/10'
                      : 'bg-blue-500/5 border-blue-500/10'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wide border ${
                          err.type === 'error'
                            ? 'bg-red-500/10 text-red-700 border-red-500/20 dark:text-red-400'
                            : err.type === 'warning'
                            ? 'bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-400'
                            : 'bg-blue-500/10 text-blue-700 border-blue-500/20 dark:text-blue-400'
                        }`}
                      >
                        {err.type.toUpperCase()}
                      </span>
                      <code className="font-mono text-xs font-bold text-ink bg-surface-strong/30 px-1 py-0.5 rounded">
                        {err.field}
                      </code>
                    </div>
                  </div>
                  <p className="text-xs text-body font-medium">{err.message}</p>
                  <div className="flex items-start gap-1.5 text-xs text-muted-strong bg-surface-card/40 p-1.5 rounded border border-hairline mt-1">
                    <span className="font-bold text-primary-base">Fix:</span>
                    <span>{err.recommendation}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-xs text-muted-strong text-center py-2">
            No warnings or recommendations for this schema.
          </div>
        )}
      </div>
    </div>
  );
}
