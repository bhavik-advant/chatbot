/**
 * Computes the cosine similarity between two numeric vectors of equal length.
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    return 0;
  }
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export interface DocumentChunk {
  text: string;
  page: number;
  embedding: number[];
}

export interface SearchedChunk {
  text: string;
  page: number;
  similarity: number;
}

/**
 * Searches document chunks for the most relevant context matching the question embedding.
 */
export function retrieveContext(
  queryEmbedding: number[],
  chunks: DocumentChunk[],
  topK: number = 5
): SearchedChunk[] {
  const scoredChunks = chunks.map((chunk) => {
    const similarity = cosineSimilarity(queryEmbedding, chunk.embedding);
    return {
      text: chunk.text,
      page: chunk.page,
      similarity,
    };
  });

  // Sort by similarity descending
  scoredChunks.sort((a, b) => b.similarity - a.similarity);

  // Return the top K chunks
  return scoredChunks.slice(0, topK);
}
