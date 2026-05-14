import { ContentAssessor, Paper, SeoAssessor } from "yoastseo";
import EnglishResearcher from "yoastseo/build/languageProcessing/languages/en/Researcher";

type YoastInput = {
  contentHtml: string;
  primaryKeyword: string;
  metaDescription: string;
  metaTitle: string;
  slug: string;
  title: string;
};

export type YoastIssueRating = "good" | "ok" | "bad";

export type YoastIssue = {
  id: string;
  rating: YoastIssueRating;
  score: number;
  text: string;
};

export type YoastReport = {
  seoScore: number;
  readabilityScore: number;
  seoIssues: YoastIssue[];
  readabilityIssues: YoastIssue[];
};

function stripHtml(value: string) {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, "\"")
    .replace(/\s+/g, " ")
    .trim();
}

function ratingForScore(score: number): YoastIssueRating {
  if (score >= 7) return "good";
  if (score >= 4) return "ok";
  return "bad";
}

function formatIssue(result: {
  getIdentifier(): string;
  getScore(): number;
  getText(): string;
}): YoastIssue {
  const score = result.getScore();

  return {
    id: result.getIdentifier(),
    rating: ratingForScore(score),
    score,
    text: stripHtml(result.getText()),
  };
}

export function analyzeYoastSeo(input: YoastInput): YoastReport {
  const paper = new Paper(input.contentHtml, {
    keyword: input.primaryKeyword,
    description: input.metaDescription,
    title: input.metaTitle || input.title,
    textTitle: input.title,
    slug: input.slug,
    locale: "en_US",
  });
  const researcher = new EnglishResearcher(paper);
  const seoAssessor = new SeoAssessor(researcher);
  const readabilityAssessor = new ContentAssessor(researcher);

  seoAssessor.assess(paper);
  readabilityAssessor.assess(paper);

  return {
    seoScore: seoAssessor.calculateOverallScore(),
    readabilityScore: readabilityAssessor.calculateOverallScore(),
    seoIssues: seoAssessor.getValidResults().map(formatIssue),
    readabilityIssues: readabilityAssessor.getValidResults().map(formatIssue),
  };
}
