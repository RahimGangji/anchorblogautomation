declare module "yoastseo" {
  export class Paper {
    constructor(text: string, attributes?: Record<string, unknown>);
  }

  export class SeoAssessor {
    constructor(researcher: unknown, options?: Record<string, unknown>);
    assess(paper: Paper): void;
    calculateOverallScore(): number;
    getValidResults(): YoastAssessmentResult[];
  }

  export class ContentAssessor {
    constructor(researcher: unknown, options?: Record<string, unknown>);
    assess(paper: Paper): void;
    calculateOverallScore(): number;
    getValidResults(): YoastAssessmentResult[];
  }

  export type YoastAssessmentResult = {
    getIdentifier(): string;
    getScore(): number;
    getText(): string;
  };
}

declare module "yoastseo/build/languageProcessing/languages/en/Researcher" {
  import { Paper } from "yoastseo";

  export default class EnglishResearcher {
    constructor(paper: Paper);
  }
}
