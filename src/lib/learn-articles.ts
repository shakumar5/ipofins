import staticArticles from '../data/articles.json';
import generatedArticles from '../data/insights-articles.generated.json';

export type LearnArticle = {
  title: string;
  slug: string;
  excerpt: string;
  category: string;
  readTime: string;
  content?: string;
  date?: string;
  tier?: number;
  month?: string | null;
  socialPost?: string;
  url?: string;
};

function hasContent(article: LearnArticle) {
  return Boolean(article.content && article.content.trim().length > 0);
}

/** Generated insights first (newest data), then static evergreen guides. */
export function getLearnArticles(): LearnArticle[] {
  const generated = (generatedArticles as LearnArticle[]).filter(hasContent);
  const staticWithContent = (staticArticles as LearnArticle[]).filter(hasContent);
  const generatedSlugs = new Set(generated.map((a) => a.slug));
  const staticDeduped = staticWithContent.filter((a) => !generatedSlugs.has(a.slug));
  return [...generated, ...staticDeduped];
}

export function getInsightsArticles(): LearnArticle[] {
  return (generatedArticles as LearnArticle[]).filter(hasContent);
}

export function getStaticLearnArticles(): LearnArticle[] {
  return (staticArticles as LearnArticle[]).filter(hasContent);
}

export function getLearnArticleBySlug(slug: string): LearnArticle | undefined {
  return getLearnArticles().find((a) => a.slug === slug);
}
