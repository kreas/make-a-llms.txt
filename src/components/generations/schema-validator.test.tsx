import { render, screen } from '@testing-library/react';
import { SchemaValidator } from './schema-validator';
import { describe, it, expect } from 'vitest';

describe('SchemaValidator Component', () => {
  it('renders syntax error banner when JSON is invalid', () => {
    const malformedJson = '{ "@context": "https://schema.org", "headline": "Missing closing bracket"';
    render(<SchemaValidator jsonLdString={malformedJson} />);

    expect(screen.getByText('JSON Parsing Error')).toBeInTheDocument();
    expect(screen.getByText(/Invalid JSON syntax/)).toBeInTheDocument();
  });

  it('renders warning banner when missing recommended or required fields', () => {
    const incompleteSchema = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: 'Test Post',
      // missing author and publisher
    });
    render(<SchemaValidator jsonLdString={incompleteSchema} />);

    expect(screen.getByText(/Error.*found/i)).toBeInTheDocument();
    expect(screen.getByText(/Required property "author" is missing/i)).toBeInTheDocument();
    expect(screen.getByText(/Required property "publisher" is missing/i)).toBeInTheDocument();
  });

  it('renders info banner when generic WebPage type is used', () => {
    const genericWebPage = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: 'Home Page',
      description: 'A simple page description',
      url: 'https://example.com',
    });
    render(<SchemaValidator jsonLdString={genericWebPage} />);

    expect(screen.getByText('Validation Passed')).toBeInTheDocument();
    expect(screen.getByText(/Using generic WebPage schema/i)).toBeInTheDocument();
  });

  it('renders success banner when schema is fully valid', () => {
    const validSchema = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: 'A fully valid article',
      description: 'A great description',
      url: 'https://example.com/blog/article',
      image: 'https://example.com/images/cover.jpg',
      datePublished: '2026-05-28',
      dateModified: '2026-05-28',
      author: {
        '@type': 'Person',
        name: 'Jane Doe',
      },
      publisher: {
        '@type': 'Organization',
        name: 'Awesome Publisher',
        url: 'https://example.com',
        logo: {
          '@type': 'ImageObject',
          url: 'https://example.com/logo.png',
        },
      },
    });
    render(<SchemaValidator jsonLdString={validSchema} />);

    expect(screen.getByText('Validation Passed')).toBeInTheDocument();
    expect(screen.getByText(/Your JSON-LD schema is valid/i)).toBeInTheDocument();
  });

});
