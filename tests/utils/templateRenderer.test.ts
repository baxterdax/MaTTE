import { TemplateRenderer, TemplateRecord, TemplateData } from '../../src/utils/templateRenderer';

describe('TemplateRenderer', () => {
  const mockTemplate: TemplateRecord = {
    id: '1',
    tenant_id: '1',
    name: 'Test Template',
    slug: 'test-template',
    engine: 'handlebars',
    content: '<div>Hello {{name}}!</div>',
    subject_template: 'Hello {{name}}',
    plaintext_template: 'Hello {{name}}!',
    version: 1,
    is_active: true
  };

  const mockMjmlTemplate: TemplateRecord = {
    ...mockTemplate,
    engine: 'mjml',
    content: `
      <mjml>
        <mj-body>
          <mj-section>
            <mj-column>
              <mj-text>Hello {{name}}!</mj-text>
            </mj-column>
          </mj-section>
        </mj-body>
      </mjml>
    `
  };

  const testData: TemplateData = {
    name: 'World'
  };

  beforeEach(() => {
    // Clear cache before each test
    TemplateRenderer.clearCache();
  });

  describe('renderTemplate', () => {
    it('should render Handlebars template correctly', async () => {
      const result = await TemplateRenderer.renderTemplate(mockTemplate, testData);
      
      expect(result.html).toContain('Hello World!');
      expect(result.subject).toBe('Hello World');
      expect(result.text).toContain('Hello World!');
      expect(result.html).toContain('</div>');
    });

    it('should render MJML template correctly', async () => {
      const result = await TemplateRenderer.renderTemplate(mockMjmlTemplate, testData);
      
      // MJML should be compiled to valid HTML containing our content
      expect(result.html.toLowerCase()).toContain('hello world!');
      expect(result.subject).toBe('Hello World');
      expect(result.text).toContain('Hello World!');
    });

    it('should cache rendered templates', async () => {
      // First render
      const result1 = await TemplateRenderer.renderTemplate(mockTemplate, testData);
      
      // Second render should use cache
      const result2 = await TemplateRenderer.renderTemplate(mockTemplate, testData);
      
      expect(result1).toEqual(result2);
      
      const stats = TemplateRenderer.getCacheStats();
      expect(stats.keys).toBeGreaterThan(0);
    });

    it('should handle missing variables gracefully', async () => {
      const result = await TemplateRenderer.renderTemplate(mockTemplate, {});
      
      expect(result.html).toContain('Hello !');
      expect(result.subject).toBe('Hello ');
    });

    it('should fallback to auto-generated text when no plaintext template', async () => {
      const templateWithoutPlainText = {
        ...mockTemplate,
        plaintext_template: undefined
      };
      
      const result = await TemplateRenderer.renderTemplate(templateWithoutPlainText, testData);
      
      expect(result.text).toContain('Hello World!');
      expect(result.text).not.toContain('{{name}}');
    });

    it('should handle invalid template input without crashing', async () => {
      const invalidTemplate = {
        ...mockTemplate,
        content: '{{#each items}' // Intentionally malformed Handlebars
      };
      
      await expect(
        TemplateRenderer.renderTemplate(invalidTemplate, testData)
      ).rejects.toThrow();
    });
  });

  describe('invalidateTemplateCache', () => {
    it('should invalidate cache for specific template', async () => {
      // First render to populate cache
      await TemplateRenderer.renderTemplate(mockTemplate, testData);
      
      const statsBefore = TemplateRenderer.getCacheStats();
      expect(statsBefore.keys).toBeGreaterThan(0);
      
      // Invalidate cache
      TemplateRenderer.invalidateTemplateCache('1');
      
      const statsAfter = TemplateRenderer.getCacheStats();
      expect(statsAfter.keys).toBe(0);
    });
  });

  describe('generateDataHash', () => {
    it('should generate consistent hashes for same data', () => {
      const data1 = { name: 'test', email: 'test@example.com' };
      const data2 = { name: 'test', email: 'test@example.com' };
      
      const hash1 = (TemplateRenderer as any).generateDataHash(data1);
      const hash2 = (TemplateRenderer as any).generateDataHash(data2);
      
      expect(hash1).toBe(hash2);
    });

    it('should generate different hashes for different data', () => {
      const data1 = { name: 'test1' };
      const data2 = { name: 'test2' };
      
      const hash1 = (TemplateRenderer as any).generateDataHash(data1);
      const hash2 = (TemplateRenderer as any).generateDataHash(data2);
      
      expect(hash1).not.toBe(hash2);
    });
  });
});
