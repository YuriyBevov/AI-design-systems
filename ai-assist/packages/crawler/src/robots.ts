export type RobotsPolicy = {
  sitemapUrls: string[];
  crawlDelayMs: number;
  allows: (url: URL) => boolean;
};

type Rule = { allow: boolean; pattern: string };

const matchesRule = (path: string, pattern: string): boolean => {
  if (!pattern) return false;
  const anchored = pattern.endsWith("$");
  const source = pattern
    .replace(/[$]/g, "")
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${source}${anchored ? "$" : ""}`).test(path);
};

export const parseRobots = (text: string, userAgentToken = "ai-assist-crawler"): RobotsPolicy => {
  const groups: Array<{ agents: string[]; rules: Rule[]; crawlDelayMs: number }> = [];
  const sitemapUrls: string[] = [];
  let current: { agents: string[]; rules: Rule[]; crawlDelayMs: number } | null = null;
  let hasRules = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (field === "sitemap" && value) {
      sitemapUrls.push(value);
      continue;
    }
    if (field === "user-agent") {
      if (!current || hasRules) {
        current = { agents: [], rules: [], crawlDelayMs: 0 };
        groups.push(current);
        hasRules = false;
      }
      current.agents.push(value.toLowerCase());
      continue;
    }
    if ((field === "allow" || field === "disallow") && current) {
      current.rules.push({ allow: field === "allow", pattern: value });
      hasRules = true;
      continue;
    }
    if (field === "crawl-delay" && current) {
      const seconds = Number.parseFloat(value);
      if (Number.isFinite(seconds) && seconds >= 0) {
        current.crawlDelayMs = Math.min(60_000, Math.ceil(seconds * 1_000));
      }
      hasRules = true;
    }
  }

  const token = userAgentToken.toLowerCase();
  const exact = groups.filter((group) =>
    group.agents.some((agent) => token === agent || token.startsWith(agent)),
  );
  const selected = exact.length
    ? exact
    : groups.filter((group) => group.agents.some((agent) => agent === "*"));
  const rules = selected.flatMap((group) => group.rules);

  return {
    sitemapUrls: [...new Set(sitemapUrls)],
    crawlDelayMs: Math.max(0, ...selected.map((group) => group.crawlDelayMs)),
    allows: (url) => {
      const path = `${url.pathname}${url.search}`;
      const matches = rules.filter((rule) => matchesRule(path, rule.pattern));
      if (!matches.length) return true;
      matches.sort((left, right) => right.pattern.length - left.pattern.length);
      const longestLength = matches[0]?.pattern.length ?? 0;
      return matches
        .filter((rule) => rule.pattern.length === longestLength)
        .some((rule) => rule.allow);
    },
  };
};
