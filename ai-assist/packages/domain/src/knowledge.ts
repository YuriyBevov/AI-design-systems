import { createHash } from "node:crypto";

export type KnowledgeChunkCandidate = {
  chunkId: string;
  documentId: string;
  documentVersionId: string;
  title: string;
  canonicalUrl: string | null;
  tags: string[];
  text: string;
};

export type RankedKnowledgeChunk = KnowledgeChunkCandidate & { score: number };

export type KnowledgeChunkFingerprintInput = {
  chunkId: string;
  contentChecksum: string;
};

const stopWords = new Set([
  "без",
  "будет",
  "быть",
  "вам",
  "вас",
  "для",
  "его",
  "есть",
  "или",
  "как",
  "какая",
  "какой",
  "какие",
  "мне",
  "можно",
  "надо",
  "она",
  "они",
  "при",
  "про",
  "это",
]);

export const normalizeKnowledgeText = (value: string): string =>
  value
    .normalize("NFKC")
    .replace(/\r\n?/gu, "\n")
    .replace(/[\t ]+/gu, " ")
    .replace(/ *\n */gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();

export const checksumKnowledgeContent = (value: string): string =>
  createHash("sha256").update(normalizeKnowledgeText(value), "utf8").digest("hex");

export const fingerprintKnowledgeChunks = (chunks: KnowledgeChunkFingerprintInput[]): string => {
  const digest = createHash("sha256");
  for (const chunk of [...chunks].sort((left, right) =>
    left.chunkId.localeCompare(right.chunkId),
  )) {
    digest.update(chunk.chunkId, "utf8");
    digest.update("\0", "utf8");
    digest.update(chunk.contentChecksum, "utf8");
    digest.update("\n", "utf8");
  }
  return digest.digest("hex");
};

const splitOversizedText = (value: string, maxCharacters: number): string[] => {
  const sentences = value.split(/(?<=[.!?])\s+/u);
  const pieces: string[] = [];
  let current = "";

  const pushCurrent = () => {
    if (current) pieces.push(current);
    current = "";
  };

  for (const sentence of sentences) {
    if (sentence.length > maxCharacters) {
      pushCurrent();
      const words = sentence.split(/\s+/u);
      let wordGroup = "";
      for (const word of words) {
        if (word.length > maxCharacters) {
          pushCurrent();
          if (wordGroup) pieces.push(wordGroup);
          wordGroup = "";
          for (let offset = 0; offset < word.length; offset += maxCharacters) {
            pieces.push(word.slice(offset, offset + maxCharacters));
          }
          continue;
        }
        if (!wordGroup || `${wordGroup} ${word}`.length <= maxCharacters) {
          wordGroup = wordGroup ? `${wordGroup} ${word}` : word;
        } else {
          pieces.push(wordGroup);
          wordGroup = word;
        }
      }
      if (wordGroup) pieces.push(wordGroup);
      continue;
    }

    if (!current || `${current} ${sentence}`.length <= maxCharacters) {
      current = current ? `${current} ${sentence}` : sentence;
    } else {
      pushCurrent();
      current = sentence;
    }
  }
  pushCurrent();
  return pieces;
};

export const chunkKnowledgeText = (value: string, maxCharacters = 1_200): string[] => {
  if (!Number.isInteger(maxCharacters) || maxCharacters < 200 || maxCharacters > 4_000) {
    throw new Error("Knowledge chunk size is outside the allowed range");
  }
  const normalized = normalizeKnowledgeText(value);
  if (!normalized) return [];

  const units = normalized
    .split(/\n{2,}/u)
    .flatMap((part) =>
      part.length <= maxCharacters ? [part] : splitOversizedText(part, maxCharacters),
    );
  const chunks: string[] = [];
  let current = "";
  for (const unit of units) {
    if (!current || `${current}\n\n${unit}`.length <= maxCharacters) {
      current = current ? `${current}\n\n${unit}` : unit;
    } else {
      chunks.push(current);
      current = unit;
    }
  }
  if (current) chunks.push(current);
  return chunks;
};

export const estimateKnowledgeTokenCount = (value: string): number =>
  Math.max(1, Math.ceil(normalizeKnowledgeText(value).length / 4));

const tokenize = (value: string): string[] => {
  const tokens =
    normalizeKnowledgeText(value)
      .toLocaleLowerCase("ru-RU")
      .match(/[\p{L}\p{N}]+/gu) ?? [];
  const meaningful = tokens.filter((token) => token.length >= 2 && !stopWords.has(token));
  return [...new Set(meaningful.length ? meaningful : tokens.filter((token) => token.length >= 2))];
};

export const rankKnowledgeChunks = (
  query: string,
  candidates: KnowledgeChunkCandidate[],
  limit = 5,
): RankedKnowledgeChunk[] => {
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
    throw new Error("Knowledge retrieval limit is outside the allowed range");
  }
  const queryTokens = tokenize(query);
  if (!queryTokens.length) return [];
  const normalizedQuery = normalizeKnowledgeText(query).toLocaleLowerCase("ru-RU");

  return candidates
    .map((candidate) => {
      const titleTokens = new Set(tokenize(candidate.title));
      const tagTokens = new Set(tokenize(candidate.tags.join(" ")));
      const textTokens = new Set(tokenize(candidate.text));
      let matched = 0;
      for (const token of queryTokens) {
        if (textTokens.has(token)) matched += 1;
        if (tagTokens.has(token)) matched += 0.5;
        if (titleTokens.has(token)) matched += 1;
      }
      const phraseBoost = candidate.text.toLocaleLowerCase("ru-RU").includes(normalizedQuery)
        ? 0.5
        : 0;
      const score = Math.min(1, (matched / queryTokens.length + phraseBoost) / 2);
      return { ...candidate, score: Number(score.toFixed(4)) };
    })
    .filter((candidate) => candidate.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.title.localeCompare(right.title, "ru-RU") ||
        left.chunkId.localeCompare(right.chunkId),
    )
    .slice(0, limit);
};

export const fuseKnowledgeRankings = (
  lexical: RankedKnowledgeChunk[],
  semantic: RankedKnowledgeChunk[],
  limit = 5,
): RankedKnowledgeChunk[] => {
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
    throw new Error("Knowledge retrieval limit is outside the allowed range");
  }
  const candidates = new Map<
    string,
    { candidate: KnowledgeChunkCandidate; lexicalScore: number; semanticScore: number }
  >();
  for (const item of lexical) {
    candidates.set(item.chunkId, {
      candidate: item,
      lexicalScore: item.score,
      semanticScore: 0,
    });
  }
  for (const item of semantic) {
    const existing = candidates.get(item.chunkId);
    candidates.set(item.chunkId, {
      candidate: existing?.candidate ?? item,
      lexicalScore: existing?.lexicalScore ?? 0,
      semanticScore: item.score,
    });
  }
  return [...candidates.values()]
    .map(({ candidate, lexicalScore, semanticScore }) => ({
      ...candidate,
      score: Number(
        Math.min(
          1,
          lexicalScore * 0.45 +
            semanticScore * 0.55 +
            (lexicalScore > 0 && semanticScore > 0 ? 0.05 : 0),
        ).toFixed(4),
      ),
    }))
    .filter((candidate) => candidate.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.title.localeCompare(right.title, "ru-RU") ||
        left.chunkId.localeCompare(right.chunkId),
    )
    .slice(0, limit);
};

const escapeKnowledgeBoundary = (value: string): string =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

export const formatUntrustedKnowledgeContext = (sources: RankedKnowledgeChunk[]): string =>
  sources
    .map((source, index) =>
      [
        `[Источник ${index + 1}]`,
        `Название: ${escapeKnowledgeBoundary(source.title)}`,
        source.canonicalUrl ? `URL: ${escapeKnowledgeBoundary(source.canonicalUrl)}` : null,
        `<content>${escapeKnowledgeBoundary(source.text)}</content>`,
      ]
        .filter((line): line is string => Boolean(line))
        .join("\n"),
    )
    .join("\n\n");
