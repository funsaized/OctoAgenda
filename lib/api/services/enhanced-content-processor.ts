/**
 * Enhanced Content Processor Service
 * Modern, robust HTML parsing and content extraction optimized for event information
 * Uses semantic analysis, intelligent chunking, and token optimization
 */
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';

/**
 * Enhanced processed content with semantic analysis
 */
export interface EnhancedProcessedContent {
  /** Clean markdown content optimized for LLM processing */
  optimizedContent: string;

  /** High-priority content chunks with semantic scoring */
  prioritizedChunks: SemanticChunk[];

  /** Extracted structured events from HTML */
  structuredEvents: StructuredEvent[];

  /** Content quality metrics */
  qualityMetrics: ContentQualityMetrics;

  /** Processing metadata */
  metadata: EnhancedContentMetadata;
}

/**
 * Semantic content chunk with quality scoring
 */
export interface SemanticChunk {
  /** Chunk content in clean markdown */
  content: string;

  /** Estimated token count */
  tokenCount: number;

  /** Semantic relevance score (0-1) */
  relevanceScore: number;

  /** Event likelihood score (0-1) */
  eventScore: number;

  /** Content type classification */
  contentType: 'event' | 'article' | 'navigation' | 'metadata' | 'temporal' | 'location';

  /** Detected entities and patterns */
  entities: {
    dates: string[];
    locations: string[];
    organizations: string[];
    keywords: string[];
  };

  /** Source context */
  sourceContext: {
    htmlTag: string;
    cssClasses: string[];
    isMainContent: boolean;
    semanticRole: string;
  };
}

/**
 * Enhanced structured event data
 */
export interface StructuredEvent {
  title?: string;
  startDate?: string;
  endDate?: string;
  location?: string;
  description?: string;
  organizer?: string;
  url?: string;
  category?: string;
  source: 'json-ld' | 'microdata' | 'rdfa' | 'semantic-analysis';
  confidence: number;
  raw?: any;
}

/**
 * Content quality assessment metrics
 */
export interface ContentQualityMetrics {
  /** Overall content quality score (0-1) */
  overallQuality: number;

  /** Information density (0-1) */
  informationDensity: number;

  /** Event content ratio (0-1) */
  eventContentRatio: number;

  /** Temporal information richness (0-1) */
  temporalRichness: number;

  /** Location information richness (0-1) */
  locationRichness: number;

  /** Content structure score (0-1) */
  structureScore: number;

  /** Boilerplate content ratio (0-1) */
  boilerplateRatio: number;
}

/**
 * Enhanced metadata with semantic analysis
 */
export interface EnhancedContentMetadata {
  /** Original content length */
  originalLength: number;

  /** Processed content length */
  processedLength: number;

  /** Token reduction ratio */
  tokenReduction: number;

  /** Number of semantic chunks */
  chunkCount: number;

  /** Detected language */
  language: string;

  /** Page title and description */
  title?: string;
  description?: string;

  /** Detected content areas */
  contentAreas: {
    main: boolean;
    article: boolean;
    navigation: boolean;
    sidebar: boolean;
    footer: boolean;
  };

  /** Processing statistics */
  processingStats: {
    htmlAnalysisTime: number;
    contentExtractionTime: number;
    chunkingTime: number;
    qualityAssessmentTime: number;
  };
}

/**
 * Event-related patterns for semantic analysis
 */
const EVENT_SEMANTIC_PATTERNS = {
  // Temporal patterns with improved regex
  temporal: [
    // ISO 8601 formats
    /\b\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})?)?/gi,

    // Natural date formats
    /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}/gi,
    /\b\d{1,2}\/\d{1,2}\/\d{2,4}/gi,
    /\b\d{1,2}-\d{1,2}-\d{2,4}/gi,

    // Day + date combinations
    /\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}/gi,

    // Time patterns
    /\b\d{1,2}:\d{2}\s*(?:am|pm|AM|PM)?/gi,
    /\b(?:from|at|starts?\s+at)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm|AM|PM)?/gi,

    // Relative temporal expressions
    /\b(?:today|tomorrow|tonight|this\s+week|next\s+week|this\s+month|next\s+month|upcoming|soon)/gi,
  ],

  // Location patterns
  location: [
    // Addresses
    /\b\d+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Plaza|Place|Pl|Way|Circle|Cir)\b/gi,

    // Venues and buildings
    /\b(?:Room|Rm|Building|Bldg|Hall|Auditorium|Theater|Theatre|Center|Centre|Library|Museum|Hotel|Conference\s+Room)\s+[A-Z0-9][A-Za-z0-9\-\s]*\b/gi,

    // Virtual locations
    /\b(?:Online|Virtual|Zoom|Teams|Meet|Webinar|Livestream|Remote|Webcast)/gi,

    // City, State, Country
    /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*[A-Z]{2}(?:\s+\d{5})?/gi,
    /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*(?:USA|Canada|UK|Australia)/gi,

    // Campus and institutional locations
    /\b(?:Campus|University|College|School)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/gi,
  ],

  // Event keywords with context
  eventKeywords: [
    // Event types
    /\b(?:event|conference|workshop|seminar|webinar|meeting|session|presentation|talk|lecture|class|course|training)/gi,
    /\b(?:celebration|party|reception|gathering|festival|show|performance|concert|exhibition|expo|fair)/gi,
    /\b(?:symposium|summit|forum|panel|discussion|debate|roundtable|networking)/gi,

    // Action words
    /\b(?:register|registration|rsvp|sign\s+up|signup|ticket|attend|join|participate|reserve)/gi,
    /\b(?:hosted\s+by|organized\s+by|presented\s+by|sponsored\s+by)/gi,

    // Time indicators
    /\b(?:start|begin|end|from|to|until|during|at|on|when|schedule)/gi,
  ],

  // Organizational patterns
  organizations: [
    /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:University|College|Institute|Foundation|Corporation|Company|Organization|Association|Society|Group|Club)/gi,
    /\b(?:Department\s+of|School\s+of|Faculty\s+of|Center\s+for|Institute\s+for)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/gi,
  ],
};

/**
 * Content area patterns for semantic HTML analysis
 */
const CONTENT_AREA_SELECTORS = {
  main: ['main', 'article', '[role="main"]', '.main', '#main', '.content', '#content'],
  navigation: ['nav', '[role="navigation"]', '.nav', '.navigation', '.menu', '.navbar'],
  sidebar: ['aside', '[role="complementary"]', '.sidebar', '.aside'],
  footer: ['footer', '[role="contentinfo"]', '.footer'],
  header: ['header', '[role="banner"]', '.header'],
  boilerplate: ['.advertisement', '.ads', '.promo', '.social-share', '.breadcrumb', '.pagination'],
};

/**
 * Enhanced HTML Content Processor
 */
export class EnhancedContentProcessor {
  private turndownService: TurndownService;

  constructor() {
    this.turndownService = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      emDelimiter: '*',
      bulletListMarker: '-',
    });

    // Configure turndown to preserve important attributes
    this.turndownService.addRule('preserveEventAttributes', {
      filter: 'time',
      replacement: (content: string, node: any) => {
        const datetime = node.getAttribute('datetime');
        return datetime ? `${content} (${datetime})` : content;
      },
    });
  }

  /**
   * Main processing function - enhanced version of preprocessHTML
   */
  async processHTML(html: string): Promise<EnhancedProcessedContent> {
    const startTime = Date.now();

    console.log('\n🔄 ENHANCED CONTENT PROCESSOR - Starting');
    console.log(`📏 Input HTML length: ${html.length.toLocaleString()} characters`);

    const $ = cheerio.load(html);
    console.log(`📋 Cheerio loaded - found ${$('*').length} HTML elements`);

    // Phase 1: HTML Structure Analysis
    console.log('\n📊 PHASE 1: HTML Structure Analysis');
    const htmlAnalysisStart = Date.now();
    const contentAreas = this.analyzeHTMLStructure($);
    const htmlAnalysisTime = Date.now() - htmlAnalysisStart;

    console.log(`   ✅ Structure analysis complete (${htmlAnalysisTime}ms)`);
    console.log(
      `   🏗️  Content areas found:`,
      Object.entries(contentAreas)
        .filter(([_, found]) => found)
        .map(([area, _]) => area)
        .join(', ') || 'none'
    );

    // Phase 2: Content Extraction and Cleaning
    console.log('\n🧹 PHASE 2: Content Extraction and Cleaning');
    const extractionStart = Date.now();
    const { cleanedHtml, metadata } = this.extractMainContent($, contentAreas);
    const structuredEvents = this.extractStructuredData($);
    const contentExtractionTime = Date.now() - extractionStart;

    console.log(`   ✅ Content extraction complete (${contentExtractionTime}ms)`);
    console.log(`   📏 Original length: ${metadata.originalLength?.toLocaleString()} chars`);
    console.log(`   📏 Processed length: ${metadata.processedLength?.toLocaleString()} chars`);
    console.log(`   🗂️  Title: "${metadata.title || 'none'}"`);
    console.log(`   🌐 Language: ${metadata.language}`);
    console.log(`   📋 Structured events found: ${structuredEvents.length}`);

    if (structuredEvents.length > 0) {
      structuredEvents.slice(0, 3).forEach((event, idx) => {
        console.log(
          `      ${idx + 1}. "${event.title}" (${event.source}, confidence: ${event.confidence.toFixed(2)})`
        );
      });
    }

    // Phase 3: Smart Chunking
    console.log('\n✂️ PHASE 3: Smart Chunking');
    const chunkingStart = Date.now();
    const semanticChunks = await this.createSemanticChunks(cleanedHtml, $);
    const chunkingTime = Date.now() - chunkingStart;

    console.log(`   ✅ Chunking complete (${chunkingTime}ms)`);
    console.log(`   📦 Total chunks created: ${semanticChunks.length}`);

    if (semanticChunks.length > 0) {
      const avgRelevance =
        semanticChunks.reduce((sum, c) => sum + c.relevanceScore, 0) / semanticChunks.length;
      const avgEventScore =
        semanticChunks.reduce((sum, c) => sum + c.eventScore, 0) / semanticChunks.length;
      const highQualityChunks = semanticChunks.filter((c) => c.relevanceScore > 0.3).length;

      console.log(`   📊 Average relevance score: ${(avgRelevance * 100).toFixed(1)}%`);
      console.log(`   🎯 Average event score: ${(avgEventScore * 100).toFixed(1)}%`);
      console.log(`   ⭐ High-quality chunks (>30%): ${highQualityChunks}`);

      // Show top 3 chunks
      console.log(`   🔝 Top chunks by relevance:`);
      semanticChunks
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
        .slice(0, 3)
        .forEach((chunk, idx) => {
          const preview = chunk.content.substring(0, 100).replace(/\n/g, ' ');
          console.log(
            `      ${idx + 1}. ${(chunk.relevanceScore * 100).toFixed(1)}% relevance, ${(chunk.eventScore * 100).toFixed(1)}% event - "${preview}..."`
          );
        });
    } else {
      console.log(`   ⚠️  No semantic chunks created - investigating...`);
    }

    // Phase 4: Quality Assessment and Prioritization
    console.log('\n🎯 PHASE 4: Quality Assessment and Prioritization');
    const qualityStart = Date.now();
    const prioritizedChunks = this.prioritizeChunks(semanticChunks);
    const qualityMetrics = this.assessContentQuality(prioritizedChunks, structuredEvents);
    const qualityAssessmentTime = Date.now() - qualityStart;

    console.log(`   ✅ Quality assessment complete (${qualityAssessmentTime}ms)`);
    console.log(`   📊 Overall quality: ${(qualityMetrics.overallQuality * 100).toFixed(1)}%`);
    console.log(
      `   📈 Information density: ${(qualityMetrics.informationDensity * 100).toFixed(1)}%`
    );
    console.log(
      `   🎪 Event content ratio: ${(qualityMetrics.eventContentRatio * 100).toFixed(1)}%`
    );
    console.log(`   ⌚ Temporal richness: ${(qualityMetrics.temporalRichness * 100).toFixed(1)}%`);
    console.log(`   📍 Location richness: ${(qualityMetrics.locationRichness * 100).toFixed(1)}%`);
    console.log(`   🏗️  Structure score: ${(qualityMetrics.structureScore * 100).toFixed(1)}%`);
    console.log(`   🗑️  Boilerplate ratio: ${(qualityMetrics.boilerplateRatio * 100).toFixed(1)}%`);
    console.log(`   🔢 Prioritized chunks: ${prioritizedChunks.length}`);

    // Phase 5: Token Optimization
    console.log('\n⚡ PHASE 5: Token Optimization');
    const optimizedContent = this.optimizeForTokens(prioritizedChunks);
    const totalProcessingTime = Date.now() - startTime;

    console.log(`   ✅ Token optimization complete`);
    console.log(
      `   📏 Optimized content length: ${optimizedContent.length.toLocaleString()} chars`
    );
    const tokenReduction = this.calculateTokenReduction(html, optimizedContent);
    console.log(`   💰 Token reduction: ${(tokenReduction * 100).toFixed(1)}%`);

    console.log(`\n🏁 ENHANCED PROCESSING COMPLETE (${totalProcessingTime}ms total)`);
    console.log(`   📊 Final metrics:`);
    console.log(`      - Prioritized chunks: ${prioritizedChunks.length}`);
    console.log(`      - Structured events: ${structuredEvents.length}`);
    console.log(`      - Quality score: ${(qualityMetrics.overallQuality * 100).toFixed(1)}%`);
    console.log(`      - Token reduction: ${(tokenReduction * 100).toFixed(1)}%`);

    return {
      optimizedContent,
      prioritizedChunks,
      structuredEvents,
      qualityMetrics,
      metadata: {
        originalLength: metadata.originalLength || html.length,
        processedLength: metadata.processedLength || optimizedContent.length,
        language: metadata.language || 'en',
        title: metadata.title,
        description: metadata.description,
        contentAreas: metadata.contentAreas || {
          main: false,
          article: false,
          navigation: false,
          sidebar: false,
          footer: false,
        },
        chunkCount: prioritizedChunks.length,
        tokenReduction: this.calculateTokenReduction(html, optimizedContent),
        processingStats: {
          htmlAnalysisTime,
          contentExtractionTime,
          chunkingTime,
          qualityAssessmentTime,
        },
      },
    };
  }

  /**
   * Analyze HTML structure to identify content areas
   */
  private analyzeHTMLStructure($: cheerio.CheerioAPI): any {
    const areas = {
      main: false,
      article: false,
      navigation: false,
      sidebar: false,
      footer: false,
    };

    // Check for semantic HTML5 elements
    Object.keys(CONTENT_AREA_SELECTORS).forEach((area) => {
      if (area !== 'boilerplate') {
        const selectors = CONTENT_AREA_SELECTORS[area as keyof typeof CONTENT_AREA_SELECTORS];
        areas[area as keyof typeof areas] = selectors.some((selector) => $(selector).length > 0);
      }
    });

    return areas;
  }

  /**
   * Extract and clean main content areas
   */
  private extractMainContent(
    $: cheerio.CheerioAPI,
    contentAreas: any
  ): {
    cleanedHtml: cheerio.CheerioAPI;
    metadata: Partial<EnhancedContentMetadata>;
  } {
    console.log(`   🧹 Starting content extraction and cleaning...`);

    const originalTextLength = $.text().length;
    console.log(
      `      📏 Original content length: ${originalTextLength.toLocaleString()} characters`
    );

    // Remove unwanted elements
    const unwantedSelectors = [
      'script',
      'style',
      'noscript',
      'iframe',
      'svg',
      '.advertisement',
      '.ads',
      '.promo',
    ];
    let removedCount = 0;

    unwantedSelectors.forEach((selector) => {
      const elements = $(selector);
      if (elements.length > 0) {
        console.log(`      🗑️  Removing ${elements.length} ${selector} elements`);
        removedCount += elements.length;
        elements.remove();
      }
    });

    // Remove comments
    const comments = $('*')
      .contents()
      .filter(function () {
        return this.type === 'comment';
      });
    if (comments.length > 0) {
      console.log(`      🗑️  Removing ${comments.length} comment nodes`);
      comments.remove();
    }

    console.log(`      📊 Total unwanted elements removed: ${removedCount}`);

    const afterCleaningLength = $.text().length;
    console.log(
      `      📏 After cleaning length: ${afterCleaningLength.toLocaleString()} characters`
    );

    // Focus on main content areas
    let mainContent = $;
    let usedMainContent = false;

    if (contentAreas.main || contentAreas.article) {
      console.log(`      🎯 Attempting to focus on main content areas...`);
      const mainSelectors = CONTENT_AREA_SELECTORS.main;

      for (const selector of mainSelectors) {
        const element = $(selector);
        if (element.length > 0) {
          const elementText = element.text().trim();
          console.log(
            `         🔍 Checking ${selector}: ${element.length} elements, ${elementText.length} chars`
          );

          if (elementText.length > 100) {
            console.log(
              `         ✅ Using ${selector} as main content (${elementText.length} chars)`
            );
            mainContent = cheerio.load(element.html() || '');
            usedMainContent = true;
            break;
          }
        }
      }

      if (!usedMainContent) {
        console.log(`         ⚠️  No suitable main content area found, using full cleaned content`);
      }
    } else {
      console.log(`      ℹ️  No main content areas detected, using full cleaned content`);
    }

    const finalTextLength = mainContent.text().length;
    console.log(`      📏 Final processed length: ${finalTextLength.toLocaleString()} characters`);

    // Extract metadata
    const title = $('title').text() || $('meta[property="og:title"]').attr('content') || '';
    const description =
      $('meta[name="description"]').attr('content') ||
      $('meta[property="og:description"]').attr('content') ||
      '';
    const language = $('html').attr('lang') || 'en';

    console.log(`      📋 Extracted metadata:`);
    console.log(`         - Title: "${title}"`);
    console.log(`         - Description: "${description.substring(0, 100)}..."`);
    console.log(`         - Language: ${language}`);
    console.log(`         - Used main content selector: ${usedMainContent ? 'yes' : 'no'}`);

    const metadata: Partial<EnhancedContentMetadata> = {
      originalLength: originalTextLength,
      processedLength: finalTextLength,
      language,
      title,
      description,
      contentAreas,
    };

    return { cleanedHtml: mainContent, metadata };
  }

  /**
   * Create semantic chunks with overlap and scoring
   */
  private async createSemanticChunks(
    cleanedHtml: cheerio.CheerioAPI,
    originalHtml: cheerio.CheerioAPI
  ): Promise<SemanticChunk[]> {
    const chunks: SemanticChunk[] = [];
    const maxTokensPerChunk = 800; // Optimized for most LLMs
    const overlapTokens = 100;

    // Extract text blocks with semantic context
    const textBlocks = this.extractTextBlocks(cleanedHtml);

    for (const block of textBlocks) {
      // Convert to markdown for better token efficiency
      const markdown = this.turndownService.turndown(block.html);
      const words = markdown.split(/\s+/);
      const tokenCount = Math.ceil(words.length * 0.75); // Rough token estimation

      if (tokenCount <= maxTokensPerChunk) {
        // Single chunk
        const chunk = await this.createSemanticChunk(markdown, block, tokenCount);

        // More lenient filtering for debugging - accept any chunk with some relevance
        const minRelevanceThreshold = 0.1;

        if (chunk.relevanceScore >= minRelevanceThreshold) {
          chunks.push(chunk);
        } else {
          console.log(
            `         🚫 Chunk filtered out: relevance=${(chunk.relevanceScore * 100).toFixed(1)}% (below ${(minRelevanceThreshold * 100).toFixed(1)}%)`
          );
          const preview = chunk.content.substring(0, 60).replace(/\n/g, ' ');
          console.log(`            content preview: "${preview}..."`);
        }
      } else {
        // Split into overlapping chunks
        const chunkSize = Math.floor(maxTokensPerChunk / 0.75); // Convert tokens to words
        const overlapSize = Math.floor(overlapTokens / 0.75);

        for (let i = 0; i < words.length; i += chunkSize - overlapSize) {
          const chunkWords = words.slice(i, i + chunkSize);
          const chunkText = chunkWords.join(' ');
          const chunkTokens = Math.ceil(chunkWords.length * 0.75);

          const chunk = await this.createSemanticChunk(chunkText, block, chunkTokens);

          const minRelevanceThreshold = 0.1;

          if (chunk.relevanceScore >= minRelevanceThreshold) {
            chunks.push(chunk);
          } else {
            console.log(
              `         🚫 Multi-chunk filtered out: relevance=${(chunk.relevanceScore * 100).toFixed(1)}% (below ${(minRelevanceThreshold * 100).toFixed(1)}%)`
            );
          }
        }
      }
    }

    return chunks;
  }

  /**
   * Extract text blocks with semantic context
   */
  private extractTextBlocks(cleanedHtml: cheerio.CheerioAPI): Array<{
    html: string;
    text: string;
    tag: string;
    classes: string[];
    isMainContent: boolean;
    semanticRole: string;
  }> {
    console.log('\n      🔍 Starting text block extraction...');
    const blocks: Array<any> = [];

    // Count all elements for statistics
    const totalElements = cleanedHtml('*').length;
    console.log(`      📋 Processing ${totalElements} HTML elements`);

    let processedCount = 0;
    let filteredByLength = 0;
    let filteredByChildren = 0;

    cleanedHtml('*').each((_, element) => {
      processedCount++;
      const $el = cleanedHtml(element);
      const text = $el.text().trim();

      // Filter by content length and quality
      if (text.length < 20 || text.length > 3000) {
        filteredByLength++;
        return;
      }

      // Skip if it's mostly contained in a child element (avoid duplicates)
      const childrenText = $el.children().text().trim();
      if (childrenText.length > text.length * 0.8) {
        filteredByChildren++;
        return;
      }

      const tag = (element as any).name || 'div';
      const classes = ($el.attr('class') || '').split(' ').filter((c) => c);
      const isMainContent = this.isMainContent($el);
      const semanticRole = this.determineSemanticRole($el, text);
      const textRelevance = this.calculateTextRelevance(text);

      blocks.push({
        html: $el.html() || '',
        text,
        tag,
        classes,
        isMainContent,
        semanticRole,
        _relevance: textRelevance, // For debugging
      });
    });

    console.log(`      📊 Block extraction statistics:`);
    console.log(`         - Total elements processed: ${processedCount}`);
    console.log(`         - Filtered by length (too short/long): ${filteredByLength}`);
    console.log(`         - Filtered by children (duplicates): ${filteredByChildren}`);
    console.log(`         - Raw blocks extracted: ${blocks.length}`);

    // Remove exact duplicates
    const uniqueBlocks = blocks.filter(
      (block, index, arr) => arr.findIndex((b) => b.text === block.text) === index
    );

    console.log(`         - After deduplication: ${uniqueBlocks.length}`);

    // Sort by relevance and semantic importance
    const sortedBlocks = uniqueBlocks.sort((a, b) => {
      const aScore = (a.isMainContent ? 2 : 0) + a._relevance;
      const bScore = (b.isMainContent ? 2 : 0) + b._relevance;
      return bScore - aScore;
    });

    // Limit to top blocks
    const finalBlocks = sortedBlocks.slice(0, 50);

    console.log(`         - After sorting & limiting: ${finalBlocks.length}`);

    if (finalBlocks.length > 0) {
      console.log(`      🔝 Top 3 text blocks by relevance:`);
      finalBlocks.slice(0, 3).forEach((block, idx) => {
        const preview = block.text.substring(0, 80).replace(/\n/g, ' ');
        const score = (block.isMainContent ? 2 : 0) + block._relevance;
        console.log(
          `         ${idx + 1}. [${score.toFixed(2)}] ${block.tag}.${block.classes.join('.')} "${preview}..."`
        );
      });
    } else {
      console.log(`      ⚠️  No text blocks extracted - content may be too sparse or filtered out`);
    }

    // Clean up temporary fields
    return finalBlocks.map((block) => {
      const { _relevance, ...cleanBlock } = block;
      return cleanBlock;
    });
  }

  /**
   * Create a semantic chunk with scoring
   */
  private async createSemanticChunk(
    content: string,
    block: any,
    tokenCount: number
  ): Promise<SemanticChunk> {
    const entities = this.extractEntities(content);
    const relevanceScore = this.calculateSemanticRelevance(content, entities);
    const eventScore = this.calculateEventScore(content, entities);
    const contentType = this.classifyContentType(content, entities, block);

    // Log chunk creation details for debugging
    if (relevanceScore > 0.1 || eventScore > 0.2) {
      const preview = content.substring(0, 60).replace(/\n/g, ' ');
      console.log(
        `         📝 Chunk created: relevance=${(relevanceScore * 100).toFixed(1)}%, event=${(eventScore * 100).toFixed(1)}%, type=${contentType}`
      );
      console.log(
        `            entities: dates=${entities.dates.length}, locations=${entities.locations.length}, keywords=${entities.keywords.length}`
      );
      console.log(`            preview: "${preview}..."`);
    }

    return {
      content,
      tokenCount,
      relevanceScore,
      eventScore,
      contentType,
      entities,
      sourceContext: {
        htmlTag: block.tag,
        cssClasses: block.classes,
        isMainContent: block.isMainContent,
        semanticRole: block.semanticRole,
      },
    };
  }

  /**
   * Extract entities from content using pattern matching
   */
  private extractEntities(content: string): SemanticChunk['entities'] {
    const entities: SemanticChunk['entities'] = {
      dates: [],
      locations: [],
      organizations: [],
      keywords: [],
    };

    // Extract dates
    EVENT_SEMANTIC_PATTERNS.temporal.forEach((pattern) => {
      const matches = content.match(pattern);
      if (matches) entities.dates.push(...matches);
    });

    // Extract locations
    EVENT_SEMANTIC_PATTERNS.location.forEach((pattern) => {
      const matches = content.match(pattern);
      if (matches) entities.locations.push(...matches);
    });

    // Extract organizations
    EVENT_SEMANTIC_PATTERNS.organizations.forEach((pattern) => {
      const matches = content.match(pattern);
      if (matches) entities.organizations.push(...matches);
    });

    // Extract event keywords
    EVENT_SEMANTIC_PATTERNS.eventKeywords.forEach((pattern) => {
      const matches = content.match(pattern);
      if (matches) entities.keywords.push(...matches);
    });

    // Deduplicate and clean
    entities.dates = [...new Set(entities.dates)].slice(0, 10);
    entities.locations = [...new Set(entities.locations)].slice(0, 10);
    entities.organizations = [...new Set(entities.organizations)].slice(0, 10);
    entities.keywords = [...new Set(entities.keywords)].slice(0, 10);

    return entities;
  }

  /**
   * Calculate semantic relevance score
   */
  private calculateSemanticRelevance(content: string, entities: SemanticChunk['entities']): number {
    let score = 0;

    // Base score from content length (sweet spot around 100-500 words)
    const wordCount = content.split(/\s+/).length;
    if (wordCount >= 20 && wordCount <= 1000) {
      score += Math.min(0.3, wordCount / 1000);
    }

    // Boost for temporal information
    score += Math.min(0.3, entities.dates.length * 0.1);

    // Boost for location information
    score += Math.min(0.2, entities.locations.length * 0.1);

    // Boost for event keywords
    score += Math.min(0.3, entities.keywords.length * 0.05);

    // Boost for organization mentions
    score += Math.min(0.2, entities.organizations.length * 0.1);

    return Math.min(1, score);
  }

  /**
   * Calculate event likelihood score
   */
  private calculateEventScore(content: string, entities: SemanticChunk['entities']): number {
    let score = 0;

    // Strong indicators of event content
    if (entities.dates.length > 0 && entities.locations.length > 0) {
      score += 0.4;
    }

    if (entities.dates.length > 0 && entities.keywords.length > 0) {
      score += 0.3;
    }

    // Event-specific patterns
    const eventPatterns = [
      /\b(register|registration|rsvp|sign\s+up|ticket|attend|join)\b/gi,
      /\b(starts?\s+at|from\s+\d|at\s+\d|\d+:\d+)/gi,
      /\b(event|conference|workshop|seminar|meeting|session)\b/gi,
    ];

    eventPatterns.forEach((pattern) => {
      if (pattern.test(content)) score += 0.1;
    });

    return Math.min(1, score);
  }

  /**
   * Classify content type
   */
  private classifyContentType(
    content: string,
    entities: SemanticChunk['entities'],
    block: any
  ): SemanticChunk['contentType'] {
    // Event content
    if (
      entities.dates.length > 0 &&
      (entities.keywords.length > 0 || entities.locations.length > 0)
    ) {
      return 'event';
    }

    // Temporal content
    if (entities.dates.length > 0) {
      return 'temporal';
    }

    // Location content
    if (entities.locations.length > 0) {
      return 'location';
    }

    // Navigation content
    if (block.semanticRole === 'navigation') {
      return 'navigation';
    }

    // Article content
    if (block.isMainContent) {
      return 'article';
    }

    return 'metadata';
  }

  /**
   * Prioritize chunks based on relevance and event scores
   */
  private prioritizeChunks(chunks: SemanticChunk[]): SemanticChunk[] {
    console.log(`      🎯 Prioritizing ${chunks.length} chunks...`);

    // Calculate combined scores
    const scoredChunks = chunks.map((chunk) => ({
      ...chunk,
      _combinedScore: chunk.eventScore * 0.6 + chunk.relevanceScore * 0.4,
    }));

    // Sort by combined score
    const sorted = scoredChunks.sort((a, b) => b._combinedScore - a._combinedScore);

    // Apply quality threshold filter
    const qualityThreshold = 0.3;
    const highQualityChunks = sorted.filter((chunk) => chunk._combinedScore >= qualityThreshold);
    const lowQualityChunks = sorted.filter((chunk) => chunk._combinedScore < qualityThreshold);

    console.log(
      `         - High quality chunks (≥${qualityThreshold}): ${highQualityChunks.length}`
    );
    console.log(`         - Low quality chunks (<${qualityThreshold}): ${lowQualityChunks.length}`);

    if (highQualityChunks.length === 0 && lowQualityChunks.length > 0) {
      console.log(
        `         ⚠️  No high-quality chunks found, lowering threshold to include some content`
      );
      // If no high-quality chunks, take the best low-quality ones
      const finalChunks = sorted.slice(0, Math.min(10, sorted.length));
      console.log(`         📦 Selected ${finalChunks.length} chunks with lowered threshold`);
      return finalChunks.map((chunk) => {
        const { _combinedScore, ...cleanChunk } = chunk;
        return cleanChunk;
      });
    }

    // Limit to top chunks
    const maxChunks = 20;
    const finalChunks = highQualityChunks.slice(0, maxChunks);

    console.log(
      `         📦 Selected ${finalChunks.length} high-quality chunks (max: ${maxChunks})`
    );

    if (finalChunks.length > 0) {
      console.log(`         🏆 Top 3 prioritized chunks:`);
      finalChunks.slice(0, 3).forEach((chunk, idx) => {
        const preview = chunk.content.substring(0, 60).replace(/\n/g, ' ');
        console.log(
          `            ${idx + 1}. [${(chunk._combinedScore * 100).toFixed(1)}%] ${chunk.contentType} - "${preview}..."`
        );
      });
    }

    // Clean up temporary scores
    return finalChunks.map((chunk) => {
      const { _combinedScore, ...cleanChunk } = chunk;
      return cleanChunk;
    });
  }

  /**
   * Assess overall content quality
   */
  private assessContentQuality(
    chunks: SemanticChunk[],
    structuredEvents: StructuredEvent[]
  ): ContentQualityMetrics {
    const totalChunks = chunks.length;
    if (totalChunks === 0) {
      return {
        overallQuality: 0,
        informationDensity: 0,
        eventContentRatio: 0,
        temporalRichness: 0,
        locationRichness: 0,
        structureScore: 0,
        boilerplateRatio: 1,
      };
    }

    const eventChunks = chunks.filter((c) => c.contentType === 'event').length;
    const temporalChunks = chunks.filter((c) => c.entities.dates.length > 0).length;
    const locationChunks = chunks.filter((c) => c.entities.locations.length > 0).length;
    const avgRelevance = chunks.reduce((sum, c) => sum + c.relevanceScore, 0) / totalChunks;
    const avgEventScore = chunks.reduce((sum, c) => sum + c.eventScore, 0) / totalChunks;

    return {
      overallQuality: (avgRelevance + avgEventScore) / 2,
      informationDensity: avgRelevance,
      eventContentRatio: eventChunks / totalChunks,
      temporalRichness: temporalChunks / totalChunks,
      locationRichness: locationChunks / totalChunks,
      structureScore: structuredEvents.length > 0 ? 0.8 : 0.4,
      boilerplateRatio: Math.max(0, 1 - avgRelevance),
    };
  }

  /**
   * Optimize content for token efficiency
   */
  private optimizeForTokens(chunks: SemanticChunk[]): string {
    console.log(`      ⚡ Optimizing ${chunks.length} chunks for token efficiency...`);

    // Filter for high-priority chunks
    const highPriorityChunks = chunks.filter((c) => c.eventScore > 0.3 || c.relevanceScore > 0.5);

    console.log(`         - High-priority chunks after filtering: ${highPriorityChunks.length}`);

    if (highPriorityChunks.length === 0) {
      console.log(`         ⚠️  No high-priority chunks found, using all available chunks`);
      // Fallback to all chunks if none meet criteria
      const finalChunks = chunks.slice(0, 15);
      console.log(`         📦 Using ${finalChunks.length} chunks as fallback`);

      return finalChunks
        .map((chunk, idx) => {
          const preview = chunk.content.substring(0, 50).replace(/\n/g, ' ');
          console.log(`            ${idx + 1}. [${chunk.contentType}] "${preview}..."`);
          return chunk.content;
        })
        .join('\n\n---\n\n');
    }

    // Limit to top chunks
    const finalChunks = highPriorityChunks.slice(0, 15);
    console.log(`         📦 Final optimization: ${finalChunks.length} chunks selected (max: 15)`);

    if (finalChunks.length > 0) {
      console.log(`         📋 Optimized chunk breakdown:`);
      finalChunks.forEach((chunk, idx) => {
        const preview = chunk.content.substring(0, 50).replace(/\n/g, ' ');
        console.log(
          `            ${idx + 1}. [${chunk.contentType}] relevance=${(chunk.relevanceScore * 100).toFixed(1)}%, event=${(chunk.eventScore * 100).toFixed(1)}%`
        );
        console.log(`               "${preview}..."`);
      });
    }

    return finalChunks.map((chunk) => chunk.content).join('\n\n---\n\n');
  }

  /**
   * Extract structured data (enhanced version)
   */
  private extractStructuredData($: cheerio.CheerioAPI): StructuredEvent[] {
    const events: StructuredEvent[] = [];

    // JSON-LD
    $('script[type="application/ld+json"]').each((_, element) => {
      try {
        const json = JSON.parse($(element).html() || '{}');
        const extracted = this.parseJsonLD(json);
        events.push(...extracted);
      } catch (e) {
        // Skip invalid JSON
      }
    });

    // Microdata
    $('[itemtype*="Event"], [itemtype*="event"]').each((_, element) => {
      const event = this.parseMicrodata($(element));
      if (event) events.push(event);
    });

    // RDFa
    $('[typeof*="Event"], [typeof*="event"]').each((_, element) => {
      const event = this.parseRDFa($(element));
      if (event) events.push(event);
    });

    return events.filter((e) => e.title || e.startDate || e.location);
  }

  /**
   * Helper methods for structured data parsing
   */
  private parseJsonLD(json: any): StructuredEvent[] {
    const events: StructuredEvent[] = [];

    const processItem = (item: any) => {
      if (item['@type'] === 'Event' || item.type === 'Event') {
        events.push({
          title: item.name,
          startDate: item.startDate,
          endDate: item.endDate,
          location:
            typeof item.location === 'object'
              ? item.location.name || item.location.address
              : item.location,
          description: item.description,
          organizer: typeof item.organizer === 'object' ? item.organizer.name : item.organizer,
          url: item.url,
          source: 'json-ld',
          confidence: 0.9,
          raw: item,
        });
      }
    };

    if (Array.isArray(json)) {
      json.forEach(processItem);
    } else {
      processItem(json);
    }

    return events;
  }

  private parseMicrodata($el: cheerio.Cheerio<any>): StructuredEvent | null {
    const title = $el.find('[itemprop="name"]').text().trim();
    const startDate =
      $el.find('[itemprop="startDate"]').attr('content') ||
      $el.find('[itemprop="startDate"]').text().trim();
    const location = $el.find('[itemprop="location"]').text().trim();

    if (!title && !startDate && !location) return null;

    return {
      title,
      startDate,
      endDate:
        $el.find('[itemprop="endDate"]').attr('content') ||
        $el.find('[itemprop="endDate"]').text().trim(),
      location,
      description: $el.find('[itemprop="description"]').text().trim(),
      source: 'microdata',
      confidence: 0.8,
    };
  }

  private parseRDFa($el: cheerio.Cheerio<any>): StructuredEvent | null {
    const title = $el.find('[property="name"]').text().trim();
    const startDate =
      $el.find('[property="startDate"]').attr('content') ||
      $el.find('[property="startDate"]').text().trim();
    const location = $el.find('[property="location"]').text().trim();

    if (!title && !startDate && !location) return null;

    return {
      title,
      startDate,
      endDate:
        $el.find('[property="endDate"]').attr('content') ||
        $el.find('[property="endDate"]').text().trim(),
      location,
      description: $el.find('[property="description"]').text().trim(),
      source: 'rdfa',
      confidence: 0.8,
    };
  }

  /**
   * Helper utility methods
   */
  private isMainContent($el: cheerio.Cheerio<any>): boolean {
    const tag = $el.prop('tagName')?.toLowerCase();
    const classes = $el.attr('class') || '';
    const id = $el.attr('id') || '';

    // Check semantic HTML5 elements
    if (['main', 'article', 'section'].includes(tag || '')) return true;

    // Check common main content patterns
    const mainPatterns = [/main/, /content/, /article/, /post/, /entry/];
    return mainPatterns.some((pattern) => pattern.test(classes) || pattern.test(id));
  }

  private determineSemanticRole($el: cheerio.Cheerio<any>, text: string): string {
    const tag = $el.prop('tagName')?.toLowerCase();
    const classes = $el.attr('class') || '';
    const role = $el.attr('role') || '';

    if (role) return role;
    if (tag === 'nav' || classes.includes('nav')) return 'navigation';
    if (tag === 'header' || classes.includes('header')) return 'banner';
    if (tag === 'footer' || classes.includes('footer')) return 'contentinfo';
    if (tag === 'aside' || classes.includes('sidebar')) return 'complementary';
    if (tag === 'main' || tag === 'article') return 'main';

    return 'content';
  }

  private calculateTextRelevance(text: string): number {
    let score = 0;

    // Check for event-related content
    EVENT_SEMANTIC_PATTERNS.eventKeywords.forEach((pattern) => {
      const matches = text.match(pattern);
      if (matches) score += matches.length * 0.1;
    });

    // Check for temporal content
    EVENT_SEMANTIC_PATTERNS.temporal.forEach((pattern) => {
      if (pattern.test(text)) score += 0.2;
    });

    // Check for location content
    EVENT_SEMANTIC_PATTERNS.location.forEach((pattern) => {
      if (pattern.test(text)) score += 0.15;
    });

    return Math.min(1, score);
  }

  private calculateTokenReduction(originalHtml: string, optimizedContent: string): number {
    const originalTokens = Math.ceil(originalHtml.length / 4);
    const optimizedTokens = Math.ceil(optimizedContent.length / 4);
    return Math.max(0, (originalTokens - optimizedTokens) / originalTokens);
  }
}

/**
 * Enhanced preprocessing function - drop-in replacement for the existing one
 */
export async function enhancedPreprocessHTML(html: string): Promise<EnhancedProcessedContent> {
  const processor = new EnhancedContentProcessor();
  return await processor.processHTML(html);
}

/**
 * Backward compatibility function
 */
export function preprocessHTML(html: string) {
  // Return a promise that resolves to the old format for backward compatibility
  return enhancedPreprocessHTML(html).then((result) => ({
    cleanedText: result.optimizedContent,
    eventContainers: result.prioritizedChunks.map((chunk) => ({
      type: chunk.sourceContext.htmlTag,
      classes: chunk.sourceContext.cssClasses,
      text: chunk.content,
      dateHints: chunk.entities.dates,
      locationHints: chunk.entities.locations,
      confidence: chunk.eventScore,
    })),
    structuredData: result.structuredEvents,
    chunks: result.prioritizedChunks.map((chunk) => ({
      content: chunk.content,
      tokenCount: chunk.tokenCount,
      context: chunk.contentType,
      priority: chunk.eventScore * 10,
    })),
    metadata: {
      totalLength: result.metadata.processedLength || 0,
      potentialEvents: result.structuredEvents.length,
      language: result.metadata.language || 'en',
      title: result.metadata.title,
      description: result.metadata.description,
    },
  }));
}
