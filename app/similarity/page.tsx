import { Suspense } from "react";
import SimilaritySearchClient from "@/components/SimilaritySearchClient";

export default function SimilarityPage() {
  return (
    <main className="min-h-screen bg-bg px-4 py-8 text-text transition-colors">
      <Suspense fallback={<div>Loading similarity search...</div>}>
        <SimilaritySearchClient />
      </Suspense>
    </main>
  );
}