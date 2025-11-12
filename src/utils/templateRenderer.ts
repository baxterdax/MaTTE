import Handlebars from 'handlebars';
import { logger } from './logger';

// Use CommonJS requires with loose typing for compatibility in Node/Jest
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mjml2html = require('mjml') as (input: string, options?: any) => { html: string; errors?: any[] };
// eslint-disable-next-line @typescript-eslint/no-var-requires
const DOMPurify = require('dompurify') as { sanitize: (dirty: string) => string };
// eslint-disable-next-line @typescript-eslint/no-var-requires
const htmlToTextLib = require('html-to-text') as any;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const juice = require('juice') as (html: string, options?: any) => string;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const NodeCache = require('node-cache') as any;

const htmlToText = (html: string, options?: any): string => {
  try {
    if (typeof htmlToTextLib === 'function') {
      // html-to-text v8 style: module is a function
      return htmlToTextLib(html, options);
    }
    if (htmlToTextLib && typeof htmlToTextLib.htmlToText === 'function') {
      // html-to-text v9 style: named export htmlToText
      return htmlToTextLib.htmlToText(html, options);
    }
  } catch (error) {
    logger.error('html-to-text invocation failed:', error);
  }
  return '';
};

const cache = new NodeCache({
  stdTTL: 3600, // 1 hour cache
  checkperiod: 120 // Check for expired keys every 2 minutes
});

export interface TemplateData {
  [key: string]: any;
}

export interface RenderResult {
  html: string;
  text: string;
  subject: string;
}

export interface TemplateRecord {
  id: string;
  tenant_id: string;
  name: string;
  slug: string;
  engine: 'handlebars' | 'mjml';
  content: string;
  subject_template: string;
  plaintext_template?: string;
  version: number;
  is_active: boolean;
}

export class TemplateRenderer {
  private static getCacheKey(templateId: string, version: number, dataHash: string): string {
    return `template_${templateId}_v${version}_${dataHash}`;
  }

  private static generateDataHash(data: TemplateData): string {
    const dataStr = JSON.stringify(data);
    let hash = 0;
    for (let i = 0; i < dataStr.length; i++) {
      const char = dataStr.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  private static sanitizeHtml(html: string): string {
    try {
      if (DOMPurify && typeof DOMPurify.sanitize === 'function') {
        return DOMPurify.sanitize(html);
      }
      return html;
    } catch (error) {
      logger.error('HTML sanitization failed:', error);
      return html;
    }
  }

  private static generatePlainText(html: string, plaintextTemplate?: string, data?: TemplateData): string {
    if (plaintextTemplate && data) {
      try {
        const compiledTemplate = Handlebars.compile(plaintextTemplate);
        return compiledTemplate(data);
      } catch (error) {
        logger.warn('Custom plaintext template rendering failed, falling back to auto-generated:', error);
      }
    }

    try {
      return htmlToText(html, {
        wordwrap: 130,
        selectors: [
          { selector: 'a', options: { ignoreHref: true } },
          { selector: 'img', format: 'skip' }
        ]
      });
    } catch (error) {
      logger.error('Auto text generation failed:', error);
      return '';
    }
  }

  private static compileTemplate(template: string, data: TemplateData): string {
    try {
      const compiled = Handlebars.compile(template, { noEscape: false });
      return compiled(data);
    } catch (error) {
      logger.error('Template compilation failed:', error);
      throw new Error(`Template compilation failed: ${error}`);
    }
  }

  private static processMjml(mjmlContent: string): string {
    try {
      const result = mjml2html(mjmlContent, {
        minify: true,
        keepComments: false
      });

      if (result.errors && result.errors.length > 0) {
        logger.warn('MJML compilation warnings:', result.errors);
      }

      return result.html;
    } catch (error) {
      logger.error('MJML processing failed:', error);
      throw new Error(`MJML processing failed: ${error}`);
    }
  }

  private static inlineCss(html: string): string {
    try {
      return juice(html, {
        preserveMediaQueries: true,
        removeStyleTags: false
      });
    } catch (error) {
      logger.warn('CSS inlining failed, using original HTML:', error);
      return html;
    }
  }

  public static async renderTemplate(
    templateRecord: TemplateRecord,
    data: TemplateData,
    version?: number
  ): Promise<RenderResult> {
    try {
      const templateVersion = version || templateRecord.version;
      const dataHash = this.generateDataHash(data);
      const cacheKey = this.getCacheKey(templateRecord.id, templateVersion, dataHash);

      const cached = cache.get(cacheKey) as RenderResult | undefined;
      if (cached) {
        logger.debug(`Template render cache hit for ${templateRecord.slug}`);
        return cached;
      }

      logger.debug(`Rendering template ${templateRecord.slug} (v${templateVersion})`);

      const renderedSubject = this.compileTemplate(templateRecord.subject_template, data);

      let renderedContent = this.compileTemplate(templateRecord.content, data);

      if (templateRecord.engine === 'mjml') {
        renderedContent = this.processMjml(renderedContent);
      }

      renderedContent = this.inlineCss(renderedContent);
      renderedContent = this.sanitizeHtml(renderedContent);

      const renderedText = this.generatePlainText(
        renderedContent,
        templateRecord.plaintext_template,
        data
      );

      const result: RenderResult = {
        html: renderedContent,
        text: renderedText,
        subject: renderedSubject
      };

      cache.set(cacheKey, result);

      return result;
    } catch (error) {
      logger.error(`Template rendering failed for ${templateRecord.slug}:`, error);
      throw new Error(`Template rendering failed: ${error}`);
    }
  }

  public static invalidateTemplateCache(templateId: string): void {
    const keys: string[] = cache.keys();
    const templateKeys = keys.filter((key: string) =>
      key.startsWith(`template_${templateId}_`)
    );

    if (templateKeys.length > 0) {
      cache.del(templateKeys);
      logger.debug(`Invalidated ${templateKeys.length} cache entries for template ${templateId}`);
    }
  }

  public static getCacheStats(): Record<string, unknown> {
    return {
      keys: cache.keys().length
    };
  }

  public static clearCache(): void {
    cache.flushAll();
    logger.info('Template cache cleared');
  }
}

// Backward compatibility - keep the old simple template rendering function
export function renderTemplate(input: string, vars?: Record<string, any>): string {
  if (!input) return '';
  if (!vars) return input;
  return input.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m: string, key: string) => {
    const val = vars[key];
    return val === undefined || val === null ? '' : String(val);
  });
}
