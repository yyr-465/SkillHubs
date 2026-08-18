import type { Skill } from "@/store/skillStore";

/**
 * Rule-based, offline categorizer for the Web build. It assigns a best-guess
 * category to Skills that have no `category:` front matter, using simple
 * bilingual keyword matching over the name + description. It never calls an
 * API and never uploads anything (the desktop app's AI categorization is
 * what it approximates, without the key or backend).
 */

interface CategoryRule {
  category: string;
  keywords: string[];
}

const RULES: CategoryRule[] = [
  {
    category: "security",
    keywords: ["security", "安全", "渗透", "漏洞", "vulnerability", "pentest", "exploit", "malware", "incident", "cve", "密码", "password", "auth", "防火墙", "firewall", "加密", "encryption", "审计", "audit"],
  },
  {
    category: "data",
    keywords: ["数据分析", "数据", "data analysis", "sql", "database", "数据库", "etl", "pandas", "spark", "big data", "machine learning", "机器学习", "模型", "model", "清洗", "报表", "report", "可视化", "visualization", "统计", "statistics"],
  },
  {
    category: "design",
    keywords: ["设计", "design", "ui", "ux", "figma", "sketch", "原型", "prototype", "界面", "视觉", "visual", "插画", "illustration", "配色", "字体", "font", "icon"],
  },
  {
    category: "development",
    keywords: ["开发", "development", "代码", "code", "编程", "programming", "git", "javascript", "typescript", "python", "java", "react", "vue", "前端", "frontend", "后端", "backend", "函数", "function", "脚本", "script", "cli", "库", "library", "调试", "debug"],
  },
  {
    category: "testing",
    keywords: ["测试", "testing", "单元测试", "unit test", "自动化测试", "e2e", "回归", "regression", "断言", "assert", "覆盖率", "coverage"],
  },
  {
    category: "api-integration",
    keywords: ["api", "集成", "integration", "接口", "rest", "graphql", "webhook", "sdk", "对接"],
  },
  {
    category: "seo",
    keywords: ["seo", "搜索引擎", "关键词", "keyword", "排名", "ranking", "外链", "backlink", "sem", "收录", "爬虫", "crawler"],
  },
  {
    category: "writing",
    keywords: ["写作", "writing", "文案", "copywriting", "内容", "content", "博客", "blog", "文章", "article", "翻译", "translation", "校对", "proofread"],
  },
  {
    category: "marketing",
    keywords: ["营销", "marketing", "广告", "投放", "社交媒体", "social media", "增长", "growth", "转化", "conversion", "campaign", "品牌", "brand", "运营"],
  },
  {
    category: "devops",
    keywords: ["devops", "运维", "docker", "kubernetes", "k8s", "ci/cd", "部署", "deployment", "基础设施", "infrastructure", "aws", "azure", "云", "cloud", "监控", "monitoring", "服务器", "server", "linux"],
  },
  {
    category: "product-management",
    keywords: ["产品", "product", "需求", "requirement", "prd", "roadmap", "用户故事", "user story", "项目管理", "project management", "敏捷", "agile", "scrum", "排期"],
  },
];

export function suggestCategory(name: string, description: string): string | null {
  const haystack = (name + " " + description).toLowerCase();
  let bestCategory: string | null = null;
  let bestScore = 0;
  for (const rule of RULES) {
    let score = 0;
    for (const keyword of rule.keywords) {
      if (haystack.includes(keyword)) score += 1;
    }
    if (score > bestScore) {
      bestCategory = rule.category;
      bestScore = score;
    }
  }
  return bestCategory;
}

/** Return a copy of the skill with a suggested category when it has none. */
export function withSuggestedCategory(skill: Skill): Skill {
  if (skill.category && skill.category.trim() !== "") return skill;
  const suggested = suggestCategory(skill.name, skill.description);
  return suggested ? { ...skill, category: suggested } : skill;
}
