/**
 * NexaMOS Research Search Provider Factory
 *
 * Sourced from NexaMOS Blog Research Architecture
 * Memisahkan kopling Research Agent dari vendor mesin pencari spesifik (Tavily, Serper, Mock).
 */

import type { ResearchSearchProvider } from './research-search-provider.ts';
import { MockResearchSearchProvider, SearchProviderDiscoveryAdapter } from './research-search-provider.ts';
import { TavilyResearchSearchProvider } from './tavily-research-search-provider.ts';
import type { ResearchDiscoveryProvider } from './research-discovery-provider.ts';
import { ensureEnvLoaded } from '../../../../infrastructure/ai/ai-provider-config.ts';

export type SupportedSearchProvider = 'tavily' | 'mock';

export class ResearchSearchProviderFactory {
  private static singletonInstance: ResearchSearchProvider | null = null;

  /**
   * Mengembalikan instance ResearchSearchProvider sesuai konfigurasi environment
   */
  static getSearchProvider(overrideProvider?: SupportedSearchProvider): ResearchSearchProvider {
    if (this.singletonInstance && !overrideProvider) {
      return this.singletonInstance;
    }

    ensureEnvLoaded();

    const providerType = (
      overrideProvider ||
      process.env.RESEARCH_SEARCH_PROVIDER ||
      (process.env.TAVILY_API_KEY ? 'tavily' : 'mock')
    ).toLowerCase().trim() as SupportedSearchProvider;

    let provider: ResearchSearchProvider;

    switch (providerType) {
      case 'tavily':
        provider = new TavilyResearchSearchProvider();
        break;
      case 'mock':
      default:
        provider = new MockResearchSearchProvider();
        break;
    }

    if (!overrideProvider) {
      this.singletonInstance = provider;
    }

    return provider;
  }

  /**
   * Helper untuk langsung membuat ResearchDiscoveryProvider (membungkus search provider via adapter)
   */
  static createDiscoveryProvider(overrideProvider?: SupportedSearchProvider): ResearchDiscoveryProvider {
    const searchProvider = this.getSearchProvider(overrideProvider);
    return new SearchProviderDiscoveryAdapter(searchProvider);
  }

  /**
   * Menetapkan custom instance (digunakan untuk isolasi testing)
   */
  static setInstance(instance: ResearchSearchProvider | null): void {
    this.singletonInstance = instance;
  }

  /**
   * Reset singleton factory
   */
  static reset(): void {
    this.singletonInstance = null;
  }
}
